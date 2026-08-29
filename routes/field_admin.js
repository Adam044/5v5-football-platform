const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const pool = require('../database');
const { signToken, verifyToken, TOKEN_TTL_SECONDS } = require('../utils/auth');
const { checkFieldAdmin } = require('../middleware/auth');

const COOKIE_NAME = 'field_admin_token';
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60 * 1000;

const signFaToken = (admin) => signToken({
    id: admin.id,
    field_id: admin.field_id,
    role: 'field_admin'
});

const cookieOpts = (secure) => ({
    httpOnly: true,
    secure: secure,
    sameSite: 'strict',
    maxAge: COOKIE_MAX_AGE
});

function sanitizeAdmin(row) {
    if (!row) return null;
    const { password, ...rest } = row;
    return rest;
}

router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: 'اسم المستخدم وكلمة المرور مطلوبين' });
    }

    try {
        const { rows } = await pool.query(
            'SELECT * FROM fa_admins WHERE username = $1 LIMIT 1',
            [username.trim()]
        );
        const admin = rows[0];
        if (!admin) {
            return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
        }
        if (admin.is_active !== 1) {
            return res.status(403).json({ error: 'هذا الحساب موقوف حالياً. يرجى التواصل مع 5v5' });
        }

        const ok = await bcrypt.compare(password, admin.password);
        if (!ok) {
            return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
        }

        await pool.query(
            'UPDATE fa_admins SET last_login_at = CURRENT_TIMESTAMP WHERE id = $1',
            [admin.id]
        );

        const token = signFaToken(admin);
        res.cookie(COOKIE_NAME, token, cookieOpts(process.env.NODE_ENV === 'production'));

        res.json({
            success: true,
            must_change_password: admin.password_changed_at == null,
            admin: sanitizeAdmin(admin)
        });
    } catch (err) {
        console.error('fa_admin login error:', err);
        res.status(500).json({ error: 'خطأ في الخادم أثناء تسجيل الدخول' });
    }
});

router.post('/logout', (req, res) => {
    res.clearCookie(COOKIE_NAME, { httpOnly: true, sameSite: 'strict' });
    res.json({ success: true });
});

router.get('/me', checkFieldAdmin, async (req, res) => {
    try {
        const { rows } = await pool.query(`
            SELECT fa.*, f.name as field_name, f.location as field_location, f.image_url as field_image
            FROM fa_admins fa
            JOIN fields f ON fa.field_id = f.id
            WHERE fa.id = $1 AND fa.is_active = 1 LIMIT 1
        `, [req.fieldAdmin.id]);
        const admin = rows[0];
        if (!admin) {
            return res.status(403).json({ error: 'الحساب غير موجود أو موقوف' });
        }
        res.json({
            admin: sanitizeAdmin(admin),
            must_change_password: admin.password_changed_at == null
        });
    } catch (err) {
        console.error('fa_admin /me error:', err);
        res.status(500).json({ error: 'فشل في جلب بيانات الحساب' });
    }
});

router.put('/settings', checkFieldAdmin, async (req, res) => {
    const allowedKeys = ['full_name', 'phone', 'price_per_hour', 'default_slot_duration', 'operating_start', 'operating_end'];
    const updates = {};
    for (const k of allowedKeys) {
        if (req.body[k] !== undefined) {
            updates[k] = req.body[k];
        }
    }

    if (updates.default_slot_duration !== undefined) {
        const d = Number(updates.default_slot_duration);
        if (![60, 90, 120, 180].includes(d)) {
            return res.status(400).json({ error: 'مدة الحجز الافتراضية غير صالحة' });
        }
        updates.default_slot_duration = d;
    }
    if (updates.price_per_hour !== undefined) {
        const p = Number(updates.price_per_hour);
        if (!(p > 0 && p < 10000)) {
            return res.status(400).json({ error: 'سعر الساعة غير صالح' });
        }
        updates.price_per_hour = p;
    }
    if (updates.operating_start !== undefined && !/^\d{2}:\d{2}$/.test(updates.operating_start)) {
        return res.status(400).json({ error: 'صيغة وقت البداية غير صالحة' });
    }
    if (updates.operating_end !== undefined && !/^\d{2}:\d{2}$/.test(updates.operating_end)) {
        return res.status(400).json({ error: 'صيغة وقت النهاية غير صالحة' });
    }

    if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: 'لا توجد حقول للتحديث' });
    }

    const cols = Object.keys(updates);
    const setSql = cols.map((k, i) => `${k} = $${i + 1}`).join(', ');
    const values = cols.map(k => updates[k]);
    values.push(req.fieldAdmin.id);

    try {
        await pool.query(
            `UPDATE fa_admins SET ${setSql} WHERE id = $${values.length}`,
            values
        );
        res.json({ success: true, message: 'تم حفظ الإعدادات بنجاح' });
    } catch (err) {
        console.error('fa_admin settings update error:', err);
        res.status(500).json({ error: 'فشل حفظ الإعدادات' });
    }
});

router.put('/change-password', checkFieldAdmin, async (req, res) => {
    const { current_password, new_password, temp_password } = req.body;
    if (!new_password || new_password.length < 8) {
        return res.status(400).json({ error: 'كلمة المرور الجديدة يجب أن تكون 8 أحرف على الأقل' });
    }

    try {
        const { rows } = await pool.query('SELECT * FROM fa_admins WHERE id = $1 LIMIT 1', [req.fieldAdmin.id]);
        const admin = rows[0];
        if (!admin) return res.status(404).json({ error: 'الحساب غير موجود' });

        let isFirstLogin = admin.password_changed_at == null;
        let currentValid = false;

        if (isFirstLogin) {
            // Seamless first-time password change: if authenticated via cookie and never changed before,
            // we allow it without current_password/temp_password to make it user-friendly.
            currentValid = true;
        } else if (current_password) {
            currentValid = await bcrypt.compare(current_password, admin.password);
        } else if (temp_password) {
            currentValid = await bcrypt.compare(temp_password, admin.password);
        }

        // DEBUG LOG (Optional, can be removed after verification)
        console.log(`[Auth] FirstLogin: ${isFirstLogin}, Validated: ${currentValid}`);

        if (!currentValid) {
            return res.status(400).json({ error: 'كلمة المرور الحالية غير صحيحة' });
        }

        const newHash = await bcrypt.hash(new_password, 10);
        await pool.query(
            `UPDATE fa_admins SET password = $1, password_changed_at = CURRENT_TIMESTAMP WHERE id = $2`,
            [newHash, admin.id]
        );

        res.json({ success: true, message: 'تم تغيير كلمة المرور بنجاح' });
    } catch (err) {
        console.error('fa_admin change password error:', err);
        res.status(500).json({ error: 'فشل تغيير كلمة المرور' });
    }
});

function timeToMinutes(t) {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
}
function minutesToTime(m) {
    const h = Math.floor(m / 60) % 24;
    const mm = m % 60;
    return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}
function formatDate(d) {
    if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return null;
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

router.get('/slots', checkFieldAdmin, async (req, res) => {
    const fieldId = req.fieldAdmin.field_id;
    const adminId = req.fieldAdmin.id;
    let { date, start_date, end_date } = req.query;

    try {
        const { rows: adminRows } = await pool.query(
            `SELECT fa.default_slot_duration, fa.operating_start, fa.operating_end, fa.price_per_hour, f.name as field_name 
             FROM fa_admins fa
             JOIN fields f ON f.id = fa.field_id
             WHERE fa.id = $1 LIMIT 1`,
            [adminId]
        );
        const cfg = adminRows[0];
        if (!cfg) return res.status(404).json({ error: 'حساب المشرف غير موجود' });

        const duration = Number(cfg.default_slot_duration) || 120;
        const startMin = timeToMinutes(cfg.operating_start);
        let endMin = timeToMinutes(cfg.operating_end);
        if (endMin <= startMin) endMin += 24 * 60;

        const dateList = [];
        if (start_date && end_date) {
            const s = new Date(start_date);
            const e = new Date(end_date);
            for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
                dateList.push(formatDate(d));
            }
        } else {
            dateList.push(date ? formatDate(date) : formatDate(new Date()));
        }

        const allSlots = [];
        for (const dStr of dateList) {
            const daySlots = [];
            for (let t = startMin; t + duration <= endMin; t += duration) {
                const st = minutesToTime(t);
                const et = minutesToTime(t + duration);
                daySlots.push({
                    id: `v-${dStr}-${st}`,
                    slot_date: dStr,
                    start_time: st,
                    end_time: et,
                    duration_minutes: duration,
                    is_booked: 0
                });
            }

            const { rows: bookings } = await pool.query(
                `SELECT * FROM fa_bookings WHERE field_id = $1 AND slot_date = $2 AND status != 'cancelled'`,
                [fieldId, dStr]
            );

            daySlots.forEach(vs => {
                const b = bookings.find(x => x.start_time === vs.start_time);
                if (b) {
                    vs.is_booked = 1;
                    vs.booking_id = b.id;
                    vs.customer_name = b.customer_name;
                    vs.customer_phone = b.customer_phone;
                    vs.amount = b.amount;
                    vs.payment_status = b.payment_status;
                    vs.booking_status = b.status;
                    vs.notes = b.notes;
                }
            });
            allSlots.push(...daySlots);
        }

        res.json({ slots: allSlots, field_name: cfg.field_name, date: dateList[0] });
    } catch (err) {
        console.error('fa_admin get dynamic slots error:', err);
        res.status(500).json({ error: 'فشل جلب المواعيد' });
    }
});

router.post('/slots/generate', checkFieldAdmin, async (req, res) => {
    res.json({ success: true, message: 'المواعيد تعمل الآن بنظام التوليد التلقائي الذكي' });
});

router.post('/bookings', checkFieldAdmin, async (req, res) => {
    const fieldId = req.fieldAdmin.field_id;
    const adminId = req.fieldAdmin.id;
    const {
        slot_date, start_time, customer_name, customer_phone,
        amount, duration_minutes,
        payment_status = 'unpaid', status = 'confirmed', notes
    } = req.body;

    if (!slot_date || !start_time) return res.status(400).json({ error: 'التاريخ والوقت مطلوبان' });
    if (!customer_name || !String(customer_name).trim()) return res.status(400).json({ error: 'اسم العميل مطلوب' });

    try {
        const { rows: adminRows } = await pool.query(
            `SELECT price_per_hour, default_slot_duration, operating_start, operating_end FROM fa_admins WHERE id = $1 LIMIT 1`,
            [adminId]
        );
        const cfg = adminRows[0];
        
        // Validate time is within operating hours
        const t = timeToMinutes(start_time);
        const startMin = timeToMinutes(cfg.operating_start);
        let endMin = timeToMinutes(cfg.operating_end);
        if (endMin <= startMin) endMin += 24 * 60;
        
        const dur = Number(duration_minutes) || Number(cfg?.default_slot_duration) || 120;
        if (Number.isNaN(dur) || dur <= 0) return res.status(400).json({ error: 'مدة الحجز غير صالحة' });
        
        if (t < startMin || t + dur > endMin) {
            return res.status(400).json({ error: 'الموعد خارج أوقات عمل الملعب' });
        }

        const amt = Number(amount) != null && !Number.isNaN(Number(amount)) && Number(amount) >= 0
            ? Number(amount)
            : Math.round((Number(cfg?.price_per_hour) || 100) * (dur / 60));

        // Double-booking check (redundant but good for better error message before DB constraint hits)
        const check = await pool.query(
            `SELECT 1 FROM fa_bookings WHERE field_id = $1 AND slot_date = $2 AND start_time = $3 AND status = 'confirmed' LIMIT 1`,
            [fieldId, slot_date, start_time]
        );
        if (check.rows.length > 0) return res.status(409).json({ error: 'هذا الموعد محجوز بالفعل' });

        const bookingRes = await pool.query(`
            INSERT INTO fa_bookings (field_id, field_admin_id, slot_date, start_time, customer_name, customer_phone,
                                     amount, payment_status, status, duration_minutes, notes)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            RETURNING id
        `, [fieldId, adminId, slot_date, start_time, String(customer_name).trim(), customer_phone || null,
            amt, payment_status, status, dur, notes || null]);

        res.json({ success: true, booking_id: bookingRes.rows[0].id, message: 'تم حفظ الحجز بنجاح' });
    } catch (err) {
        if (err.code === '23505') { // Postgres Unique Violation
            return res.status(409).json({ error: 'هذا الموعد محجوز بالفعل' });
        }
        console.error('fa_admin create dynamic booking error:', err);
        res.status(500).json({ error: 'فشل إنشاء الحجز' });
    }
});

router.put('/bookings/:bookingId', checkFieldAdmin, async (req, res) => {
    const bookingId = Number(req.params.bookingId);
    if (!Number.isInteger(bookingId) || bookingId <= 0) return res.status(400).json({ error: 'معرف الحجز غير صالح' });
    const fieldId = req.fieldAdmin.field_id;

    const allowed = ['customer_name', 'customer_phone', 'amount', 'payment_status', 'status', 'duration_minutes', 'notes'];
    const updates = {};
    for (const k of allowed) {
        if (req.body[k] !== undefined) updates[k] = req.body[k];
    }
    if (updates.amount !== undefined) updates.amount = Number(updates.amount);
    if (updates.duration_minutes !== undefined) updates.duration_minutes = Number(updates.duration_minutes);
    if (updates.payment_status && !['paid', 'unpaid'].includes(updates.payment_status)) {
        return res.status(400).json({ error: 'حالة الدفع غير صالحة' });
    }
    if (updates.status && !['confirmed', 'cancelled', 'no_show'].includes(updates.status)) {
        return res.status(400).json({ error: 'حالة الحجز غير صالحة' });
    }
    if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'لا توجد حقول للتحديث' });

    try {
        updates.updated_at = new Date();
        const cols = Object.keys(updates);
        const vals = Object.values(updates);
        const setSql = cols.map((c, i) => `${c} = $${i + 3}`).join(', ');

        const { rowCount } = await pool.query(
            `UPDATE fa_bookings SET ${setSql} WHERE id = $1 AND field_id = $2`,
            [bookingId, fieldId, ...vals]
        );

        if (rowCount === 0) return res.status(404).json({ error: 'الحجز غير موجود' });
        res.json({ success: true, message: 'تم تحديث الحجز بنجاح' });
    } catch (err) {
        console.error('fa_admin update booking error:', err);
        res.status(500).json({ error: 'فشل تحديث الحجز' });
    }
});

router.delete('/bookings/:bookingId', checkFieldAdmin, async (req, res) => {
    const bookingId = Number(req.params.bookingId);
    if (!Number.isInteger(bookingId) || bookingId <= 0) return res.status(400).json({ error: 'معرف الحجز غير صالح' });
    const fieldId = req.fieldAdmin.field_id;

    try {
        const { rowCount } = await pool.query(
            `DELETE FROM fa_bookings WHERE id = $1 AND field_id = $2`,
            [bookingId, fieldId]
        );
        if (rowCount === 0) return res.status(404).json({ error: 'الحجز غير موجود' });
        res.json({ success: true, message: 'تم حذف الحجز بنجاح' });
    } catch (err) {
        console.error('fa_admin delete booking error:', err);
        res.status(500).json({ error: 'فشل حذف الحجز' });
    }
});

router.get('/bookings', checkFieldAdmin, async (req, res) => {
    const fieldId = req.fieldAdmin.field_id;
    const { from, to, status, payment_status, search, page = 1, per_page = 50 } = req.query;

    const p = Math.max(1, Number(page) || 1);
    const pp = Math.min(200, Math.max(1, Number(per_page) || 50));
    const offset = (p - 1) * pp;

    const where = [`b.field_id = $1`];
    const vals = [fieldId];
    let idx = 2;

    if (from) { const d = formatDate(from); if (d) { where.push(`b.created_at::date >= $${idx}`); vals.push(d); idx++; } }
    if (to) { const d = formatDate(to); if (d) { where.push(`b.created_at::date <= $${idx}`); vals.push(d); idx++; } }
    if (status && ['confirmed', 'cancelled', 'no_show'].includes(status)) {
        where.push(`b.status = $${idx}`); vals.push(status); idx++;
    }
    if (payment_status && ['paid', 'unpaid'].includes(payment_status)) {
        where.push(`b.payment_status = $${idx}`); vals.push(payment_status); idx++;
    }
    if (search) {
        where.push(`(b.customer_name ILIKE $${idx} OR b.customer_phone ILIKE $${idx})`);
        vals.push(`%${search}%`); idx++;
    }

    const whereSql = where.join(' AND ');

    try {
        const countRes = await pool.query(`SELECT COUNT(*)::int as c FROM fa_bookings b WHERE ${whereSql}`, vals);
        const total = countRes.rows[0].c;

        const { rows } = await pool.query(`
            SELECT b.*
            FROM fa_bookings b
            WHERE ${whereSql}
            ORDER BY b.slot_date DESC, b.start_time DESC
            LIMIT ${pp} OFFSET ${offset}
        `, vals);

        res.json({
            bookings: rows,
            pagination: { page: p, per_page: pp, total, total_pages: Math.ceil(total / pp) }
        });
    } catch (err) {
        console.error('fa_admin /bookings list error:', err);
        res.status(500).json({ error: 'فشل جلب قائمة الحجوزات' });
    }
});

router.get('/stats/summary', checkFieldAdmin, async (req, res) => {
    const fieldId = req.fieldAdmin.field_id;
    const adminId = req.fieldAdmin.id;
    const { range = 'today', date } = req.query;

    let dateA, dateB;
    const today = date ? formatDate(date) : formatDate(new Date());
    const d = new Date(today);
    if (range === 'today') {
        dateA = dateB = today;
    } else if (range === 'week') {
        dateA = today;
        d.setDate(d.getDate() + 6);
        dateB = formatDate(d);
    } else if (range === 'month') {
        dateA = today;
        d.setMonth(d.getMonth() + 1);
        d.setDate(d.getDate() - 1);
        dateB = formatDate(d);
    } else {
        dateA = dateB = today;
    }

    try {
        // 1. Get field config to calculate total slots dynamically
        const { rows: adminRows } = await pool.query(
            `SELECT default_slot_duration, operating_start, operating_end FROM fa_admins WHERE id = $1 LIMIT 1`,
            [adminId]
        );
        const cfg = adminRows[0];
        
        const duration = Number(cfg.default_slot_duration) || 120;
        const startMin = timeToMinutes(cfg.operating_start);
        let endMin = timeToMinutes(cfg.operating_end);
        if (endMin <= startMin) endMin += 24 * 60;
        
        let slotsPerDay = 0;
        for (let t = startMin; t + duration <= endMin; t += duration) {
            slotsPerDay++;
        }

        const ms = new Date(dateB) - new Date(dateA);
        const numDays = Math.round(ms / 86400000) + 1;
        const totalSlotsRange = slotsPerDay * numDays;

        // 2. Get real bookings stats
        const bookingsRes = await pool.query(`
            SELECT
                COUNT(*)::int AS total_bookings,
                COUNT(*) FILTER (WHERE payment_status = 'paid')::int AS paid_bookings,
                COUNT(*) FILTER (WHERE payment_status = 'unpaid')::int AS unpaid_bookings,
                COALESCE(SUM(amount), 0)::real AS total_revenue,
                COALESCE(SUM(CASE WHEN payment_status = 'paid' THEN amount ELSE 0 END), 0)::real AS paid_revenue,
                COALESCE(SUM(CASE WHEN payment_status = 'unpaid' THEN amount ELSE 0 END), 0)::real AS unpaid_revenue,
                COALESCE(SUM(duration_minutes), 0)::int AS total_minutes_booked
            FROM fa_bookings
            WHERE field_id = $1 AND status = 'confirmed'
                  AND slot_date BETWEEN $2 AND $3
        `, [fieldId, dateA, dateB]);

        const stats = bookingsRes.rows[0];

        // 3. Per day stats for chart
        const perDayRes = await pool.query(`
            SELECT slot_date,
                   COUNT(*)::int AS booked_slots,
                   COALESCE(SUM(amount), 0)::real AS revenue
            FROM fa_bookings
            WHERE field_id = $1 AND status = 'confirmed' AND slot_date BETWEEN $2 AND $3
            GROUP BY slot_date
            ORDER BY slot_date ASC
        `, [fieldId, dateA, dateB]);

        res.json({
            range,
            date_from: dateA,
            date_to: dateB,
            slots: {
                total_slots: totalSlotsRange,
                booked_slots: stats.total_bookings,
                empty_slots: Math.max(0, totalSlotsRange - stats.total_bookings),
                booked_minutes: stats.total_minutes_booked
            },
            bookings: stats,
            per_day: perDayRes.rows
        });
    } catch (err) {
        console.error('fa_admin stats/summary dynamic error:', err);
        res.status(500).json({ error: 'فشل جلب الملخص الإحصائي' });
    }
});

module.exports = router;
