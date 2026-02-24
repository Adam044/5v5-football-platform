const express = require('express');
const router = express.Router();
const sharp = require('sharp');
const pool = require('../database');
const { checkAdmin } = require('../middleware/auth');
const { uploadImageToStorage, deleteImageFromStorage } = require('../config/supabase');

// All routes in this file require admin access
router.use(checkAdmin);

// --- Fields Management ---

router.get('/fields', async (req, res) => {
    try {
        const { rows } = await pool.query(`SELECT id, name, description, location, image_url, price_per_hour FROM fields`);
        res.json({ fields: rows });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

router.post('/fields', async (req, res) => {
    const { name, description, location, image, pricePerHour } = req.body;
    if (!name || !location || !pricePerHour) return res.status(400).json({ error: 'Missing required fields.' });
    try {
        let imageUrl = null;
        if (image) {
            const buf = Buffer.from(image.split(',')[1] || image, 'base64');
            const optBuf = await sharp(buf).rotate().resize({ width: 800, fit: 'inside' }).jpeg({ quality: 75 }).toBuffer();
            imageUrl = await uploadImageToStorage(optBuf, `field_${Date.now()}.jpg`, 'fields');
        }
        const { rows } = await pool.query(`INSERT INTO fields (name, description, location, image_url, price_per_hour) VALUES ($1, $2, $3, $4, $5) RETURNING id`, [name, description, location, imageUrl, pricePerHour]);
        res.status(201).json({ message: 'Field added', fieldId: rows[0].id });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

router.put('/fields/:fieldId', async (req, res) => {
    const { fieldId } = req.params;
    const { name, description, location, image, pricePerHour } = req.body;
    try {
        const current = (await pool.query('SELECT image_url FROM fields WHERE id = $1', [fieldId])).rows[0];
        if (!current) return res.status(404).json({ error: 'Not found' });

        let newImageUrl;
        if (image && typeof image === 'string' && image.startsWith('data:image/')) {
            const buf = Buffer.from(image.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, ''), 'base64');
            const optBuf = await sharp(buf).rotate().resize({ width: 800 }).webp({ quality: 80 }).toBuffer();
            newImageUrl = await uploadImageToStorage(optBuf, `field_${Date.now()}.webp`, 'fields');
            if (current.image_url) await deleteImageFromStorage(current.image_url).catch(console.warn);
        }

        const sql = `UPDATE fields SET name=$1, description=$2, location=$3, price_per_hour=$4 ${newImageUrl ? ', image_url=$5' : ''} WHERE id = $${newImageUrl ? 6 : 5}`;
        const params = [name, description, location, pricePerHour];
        if (newImageUrl) params.push(newImageUrl);
        params.push(fieldId);
        await pool.query(sql, params);
        res.json({ message: 'Updated' });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

router.delete('/fields/:fieldId', async (req, res) => {
    const { fieldId } = req.params;
    try {
        const field = (await pool.query('SELECT image_url FROM fields WHERE id = $1', [fieldId])).rows[0];
        if (!field) return res.status(404).json({ error: 'Not found' });
        if (field.image_url) await deleteImageFromStorage(field.image_url).catch(console.warn);
        await pool.query('DELETE FROM fields WHERE id = $1', [fieldId]);
        res.json({ message: 'Deleted' });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// --- Players Management ---

router.get('/players', async (req, res) => {
    try {
        const { rows } = await pool.query(`SELECT id, name, phone_number, birthdate, gender, created_at FROM users ORDER BY created_at DESC`);
        res.json({ players: rows });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// --- Availability Management ---

router.get('/availability', async (req, res) => {
    const { fieldId, date, startDate, endDate } = req.query;
    let sql = `
        SELECT r.*, u.name as user_name, f.name as field_name, f.price_per_hour as field_price 
        FROM availability_slots r 
        LEFT JOIN users u ON r.user_id = u.id 
        LEFT JOIN fields f ON r.field_id = f.id
    `;
    const params = [];

    if (fieldId) {
        params.push(fieldId);
        sql += ` WHERE r.field_id = $${params.length}`;
    }

    if (date) {
        params.push(date);
        sql += (params.length > 1 ? ' AND ' : ' WHERE ') + `r.slot_date = $${params.length}`;
    } else {
        if (startDate) {
            params.push(startDate);
            sql += (params.length > 1 ? ' AND ' : ' WHERE ') + `r.slot_date >= $${params.length}`;
        }
        if (endDate) {
            params.push(endDate);
            sql += (params.length > 1 ? ' AND ' : ' WHERE ') + `r.slot_date <= $${params.length}`;
        }
    }

    // Sort by date (ASC) then time
    sql += ' ORDER BY r.slot_date ASC, r.is_recurring ASC, r.start_time ASC';
    try {
        const { rows } = await pool.query(sql, params);
        res.json({ availability: rows });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

router.post('/availability', async (req, res) => {
    let { fieldId, date, slots, fieldIds, dates, slotGenerator, isRecurring = false } = req.body;

    const targetFields = Array.isArray(fieldIds) ? fieldIds : (fieldId ? [fieldId] : []);
    const targetDates = Array.isArray(dates) ? dates : (date ? [date] : []);

    if (targetFields.length === 0 || targetDates.length === 0) {
        return res.status(400).json({ error: 'يرجى اختيار ملاعب وتواريخ صحيحة.' });
    }

    if (slotGenerator && (!slots || slots.length === 0)) {
        const { startTime, endTime, duration, gap = 0 } = slotGenerator;
        slots = [];
        let [startH, startM] = startTime.split(':').map(Number);
        let [endLimitH, endLimitM] = endTime.split(':').map(Number);
        let currentTotal = startH * 60 + startM;
        const totalLimit = endLimitH * 60 + endLimitM;

        while (currentTotal + Number(duration) <= totalLimit) {
            const slotStartH = Math.floor(currentTotal / 60);
            const slotStartM = currentTotal % 60;
            const slotEndTotal = currentTotal + Number(duration);
            const slotEndH = Math.floor(slotEndTotal / 60);
            const slotEndM = slotEndTotal % 60;

            slots.push({
                start: `${String(slotStartH).padStart(2, '0')}:${String(slotStartM).padStart(2, '0')}`,
                end: `${String(slotEndH).padStart(2, '0')}:${String(slotEndM).padStart(2, '0')}`
            });
            currentTotal = slotEndTotal + Number(gap);
        }
    }

    if (!slots || !Array.isArray(slots) || slots.length === 0) {
        return res.status(400).json({ error: 'لم يتم توفير أو توليد أي مواعيد.' });
    }

    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        for (const fId of targetFields) {
            // Support for master rule creation if it's recurring
            let ruleId = null;
            if (isRecurring) {
                // Group targetDates by day of week to create correct rules
                const datesByDay = {};
                for (const d of targetDates) {
                    const day = new Date(d).getDay();
                    if (!datesByDay[day]) datesByDay[day] = [];
                    datesByDay[day].push(d);
                }

                for (const dayOfWeek of Object.keys(datesByDay)) {
                    const datesForThisDay = datesByDay[dayOfWeek];

                    for (const s of slots) {
                        // Create rule for this specific day and time
                        const ruleRes = await client.query(
                            `INSERT INTO availability_rules (field_id, day_of_week, start_time, end_time) 
                             VALUES ($1, $2, $3, $4) RETURNING id`,
                            [fId, parseInt(dayOfWeek), s.start, s.end]
                        );
                        const ruleId = ruleRes.rows[0].id;

                        for (const d of datesForThisDay) {
                            const checkRes = await client.query(
                                `SELECT id FROM availability_slots WHERE field_id = $1 AND slot_date = $2 AND start_time = $3 AND end_time = $4`,
                                [fId, d, s.start, s.end]
                            );
                            if (checkRes.rowCount === 0) {
                                await client.query(
                                    `INSERT INTO availability_slots (field_id, slot_date, start_time, end_time, is_recurring, rule_id) 
                                     VALUES ($1, $2, $3, $4, $5, $6)`,
                                    [fId, d, s.start, s.end, true, ruleId]
                                );
                            }
                        }
                    }
                }
            } else {
                // Standard one-time insertion
                for (const d of targetDates) {
                    for (const s of slots) {
                        const checkSql = `SELECT id FROM availability_slots WHERE field_id = $1 AND slot_date = $2 AND start_time = $3 AND end_time = $4`;
                        const existing = await client.query(checkSql, [fId, d, s.start, s.end]);
                        if (existing.rowCount === 0) {
                            await client.query(
                                `INSERT INTO availability_slots (field_id, slot_date, start_time, end_time, is_recurring) 
                                 VALUES ($1, $2, $3, $4, $5)`,
                                [fId, d, s.start, s.end, false]
                            );
                        }
                    }
                }
            }
        }
        await client.query("COMMIT");
        res.status(201).json({ message: 'Added' });
    } catch (err) {
        await client.query("ROLLBACK");
        console.error('Batch slot creation error:', err);
        return res.status(500).json({ error: err.message });
    } finally { client.release(); }
});

// --- Availability Rules (Recurring Plans) ---

router.get('/availability/rules', async (req, res) => {
    try {
        const { rows } = await pool.query(`
            SELECT ar.*, f.name as field_name 
            FROM availability_rules ar 
            JOIN fields f ON ar.field_id = f.id 
            ORDER BY ar.day_of_week ASC, ar.start_time ASC
        `);
        res.json({ rules: rows });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

router.delete('/availability/rules/:id', async (req, res) => {
    const { id } = req.params;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Remove rule and any future slots generated by this rule that ARE NOT reserved
        await client.query(`
            DELETE FROM availability_slots 
            WHERE rule_id = $1 AND is_reserved = 0 AND slot_date >= CURRENT_DATE::text
        `, [id]);

        await client.query('DELETE FROM availability_rules WHERE id = $1', [id]);

        await client.query('COMMIT');
        res.json({ message: 'Rule and associated unreserved future slots removed.' });
    } catch (err) {
        await client.query('ROLLBACK');
        return res.status(500).json({ error: err.message });
    } finally { client.release(); }
});

router.delete('/availability/:id', async (req, res) => {
    try {
        const result = await pool.query('DELETE FROM availability_slots WHERE id = $1', [req.params.id]);
        if (result.rowCount === 0) return res.status(404).json({ error: 'Not found' });
        res.json({ message: 'Deleted' });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// --- Reservations Management ---

router.get('/reservations', async (req, res) => {
    const sql = `SELECT r.id, u.name AS user_name, u.phone_number, f.name AS field_name, r.slot_date, r.start_time, r.end_time, r.booking_type, f.price_per_hour FROM reservations r JOIN fields f ON r.field_id = f.id JOIN users u ON r.user_id = u.id ORDER BY r.slot_date DESC, r.start_time DESC`;
    try {
        const { rows } = await pool.query(sql);
        res.json({ reservations: rows });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

router.put('/reservations/:id/cancel', async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const resv = (await client.query('SELECT * FROM reservations WHERE id = $1 FOR UPDATE', [req.params.id])).rows[0];
        if (!resv) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Not found' }); }
        await client.query(`UPDATE availability_slots SET is_reserved = 0, user_id = NULL, reservation_type = NULL WHERE field_id=$1 AND slot_date=$2 AND start_time=$3 AND end_time=$4`, [resv.field_id, resv.slot_date, resv.start_time, resv.end_time]);
        await client.query('DELETE FROM reservations WHERE id = $1', [req.params.id]);
        await client.query('COMMIT');
        res.json({ message: 'Cancelled' });
    } catch (err) { await client.query('ROLLBACK'); return res.status(500).json({ error: err.message }); }
    finally { client.release(); }
});

// --- Matchmaking Management ---

router.get('/matchmaking/categorized', async (req, res) => {
    try {
        const types = ['team_looking_for_players', 'team_vs_team', 'players_looking_for_team'];
        const results = await Promise.all(types.map(t => pool.query(`SELECT mr.*, u.name AS user_name, u.phone_number, f.name AS field_name FROM matchmaking_requests mr JOIN users u ON mr.user_id = u.id JOIN fields f ON mr.field_id = f.id WHERE mr.request_type = $1`, [t]).then(r => r.rows)));
        const suggestions = (await pool.query(`SELECT t.id AS tid, t.user_id AS tuid, tu.name AS tuname, tu.phone_number AS tphone, t.slot_date, f.name AS fname, t.players_needed AS tneed, p.id AS pid, p.user_id AS puid, pu.name AS puname FROM matchmaking_requests p INNER JOIN matchmaking_requests t ON p.slot_date = t.slot_date AND p.field_id = t.field_id INNER JOIN users AS pu ON p.user_id = pu.id INNER JOIN users AS tu ON t.user_id = tu.id INNER JOIN fields AS f ON p.field_id = f.id WHERE p.request_type = 'players_looking_for_team' AND t.request_type = 'team_looking_for_players' AND p.status = 'pending' AND t.status = 'pending' `)).rows;
        res.json({ team_looking_for_players: results[0], team_vs_team: results[1], players_looking_for_team: results[2], potential_matches: suggestions.map(s => ({ teamRequest: { id: s.tid, user_id: s.tuid, user_name: s.tuname, phone_number: s.tphone, slot_date: s.slot_date, field_name: s.fname, players_needed: s.tneed }, playerRequest: { id: s.pid, user_id: s.puid, user_name: s.puname } })) });
    } catch (err) { return res.status(500).json({ error: err.message }); }
});

router.post('/matchmaking-requests/:requestId/approve', async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const request = (await client.query('SELECT * FROM matchmaking_requests WHERE id = $1 FOR UPDATE', [req.params.requestId])).rows[0];
        if (!request) { await client.query("ROLLBACK"); return res.status(404).json({ error: 'Not found' }); }
        const slot = (await client.query(`SELECT id FROM availability_slots WHERE field_id = $1 AND slot_date = $2 AND is_reserved = 0 ORDER BY start_time ASC FOR UPDATE NOWAIT`, [request.field_id, request.slot_date])).rows[0];
        if (!slot) { await client.query("ROLLBACK"); return res.status(400).json({ error: 'No slot' }); }
        await client.query(`UPDATE matchmaking_requests SET status = 'approved' WHERE id = $1`, [req.params.requestId]);
        await client.query(`UPDATE availability_slots SET is_reserved = 1, reservation_type = $1, user_id = $2 WHERE id = $3`, [request.request_type, request.user_id, slot.id]);
        await client.query("COMMIT");
        res.json({ message: 'Approved' });
    } catch (err) { await client.query("ROLLBACK"); return res.status(500).json({ error: err.message }); }
    finally { client.release(); }
});

router.post('/matchmaking-requests/:requestId/reject', async (req, res) => {
    try {
        await pool.query(`UPDATE matchmaking_requests SET status = 'rejected' WHERE id = $1`, [req.params.requestId]);
        res.json({ message: 'Rejected' });
    } catch (err) { return res.status(500).json({ error: err.message }); }
});

router.post('/matchmaking-requests/:requestId/done', async (req, res) => {
    try {
        await pool.query(`UPDATE matchmaking_requests SET status = 'done' WHERE id = $1`, [req.params.requestId]);
        res.json({ message: 'Marked as done' });
    } catch (err) { return res.status(500).json({ error: err.message }); }
});

router.get('/matchmaking-requests/:requestId/details', async (req, res) => {
    const { requestId } = req.params;
    try {
        // 1. Get request info
        const requestSql = `
            SELECT mr.*, u.name as user_name, u.phone_number, f.name as field_name 
            FROM matchmaking_requests mr
            JOIN users u ON mr.user_id = u.id
            JOIN fields f ON mr.field_id = f.id
            WHERE mr.id = $1
        `;
        const { rows: reqRows } = await pool.query(requestSql, [requestId]);
        const request = reqRows[0];
        if (!request) return res.status(404).json({ error: 'Request not found' });

        const leader = {
            user_id: request.user_id,
            name: request.user_name,
            phone_number: request.phone_number
        };

        let members = [];

        // 2. If it's a team request, look for the session members
        if (request.request_type === 'team_looking_for_players' || request.request_type === 'team_vs_team') {
            // Find most recent completed session by this user for this slot
            const sessionSql = `
                SELECT id FROM team_sessions 
                WHERE creator_id = $1 AND field_id = $2 AND slot_date = $3
                ORDER BY created_at DESC LIMIT 1
            `;
            const { rows: sessionRows } = await pool.query(sessionSql, [request.user_id, request.field_id, request.slot_date]);

            if (sessionRows.length > 0) {
                const sessionId = sessionRows[0].id;
                const membersSql = `
                    SELECT u.id as user_id, u.name, u.phone_number
                    FROM team_members tm
                    JOIN users u ON tm.user_id = u.id
                    WHERE tm.session_id = $1
                `;
                const { rows: memberRows } = await pool.query(membersSql, [sessionId]);
                members = memberRows;
            }
        }

        // If no members found or individual request, ensure leader is at least included if members is empty
        if (members.length === 0) {
            members = [leader];
        }

        res.json({ leader, members });
    } catch (err) {
        console.error('Error fetching matchmaking details:', err);
        res.status(500).json({ error: err.message });
    }
});

// --- Tournaments Management ---

router.get('/tournaments', async (req, res) => {
    try {
        const { rows } = await pool.query(`SELECT t.id, t.name, t.tournament_date, t.prize, f.name AS field_name FROM tournaments t LEFT JOIN fields f ON t.field_id = f.id ORDER BY t.tournament_date DESC`);
        res.json({ tournaments: rows });
    } catch (err) { return res.status(500).json({ error: err.message }); }
});

router.post('/tournaments', async (req, res) => {
    const { name, fieldId, date, prize, description } = req.body;
    try {
        const { rows } = await pool.query(`INSERT INTO tournaments (name, field_id, tournament_date, prize, description) VALUES ($1, $2, $3, $4, $5) RETURNING id`, [name, fieldId, date, prize, description]);
        res.status(201).json({ message: 'Added', id: rows[0].id });
    } catch (err) { return res.status(500).json({ error: err.message }); }
});

router.get('/tournaments/:id/teams', async (req, res) => {
    try {
        const tournament = (await pool.query('SELECT name FROM tournaments WHERE id = $1', [req.params.id])).rows[0];
        if (!tournament) return res.status(404).json({ success: false, message: 'Not found' });
        const teams = (await pool.query(`SELECT tt.id, tt.team_name, tt.registration_date, tt.status, tt.invitation_code, u.name AS captain_name, u.email AS captain_email, u.phone_number AS captain_phone FROM tournament_teams tt JOIN users u ON tt.captain_id = u.id WHERE tt.tournament_id = $1`, [req.params.id])).rows;
        for (let t of teams) t.members = (await pool.query(`SELECT ttm.user_id, COALESCE(u.name, ttm.user_name) AS name, u.email, u.phone_number, ttm.is_captain, ttm.joined_at FROM tournament_team_members ttm LEFT JOIN users u ON ttm.user_id = u.id WHERE ttm.team_id = $1`, [t.id])).rows;
        res.json({ success: true, tournament, teams });
    } catch (err) { return res.status(500).json({ error: err.message }); }
});

router.delete('/teams/:teamId', async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        await client.query('DELETE FROM tournament_team_members WHERE team_id = $1', [req.params.teamId]);
        const reslt = await client.query('DELETE FROM tournament_teams WHERE id = $1', [req.params.teamId]);
        if (reslt.rowCount === 0) { await client.query("ROLLBACK"); return res.status(404).json({ message: 'Not found' }); }
        await client.query("COMMIT");
        res.json({ success: true });
    } catch (err) { await client.query("ROLLBACK"); return res.status(500).json({ error: err.message }); }
    finally { client.release(); }
});

// --- Analytics ---

router.get('/analytics', async (req, res) => {
    try {
        const [u, r, e, p, rec] = await Promise.all([
            pool.query("SELECT COUNT(*) FROM users"),
            pool.query("SELECT COUNT(*) FROM reservations"),
            pool.query("SELECT COALESCE(SUM(f.price_per_hour), 0) AS total FROM reservations r JOIN fields f ON r.field_id = f.id"),
            pool.query("SELECT COUNT(*) FROM matchmaking_requests WHERE status = 'pending'"),
            pool.query("SELECT r.id, u.name AS user_name, f.name AS field_name, r.slot_date, r.start_time, f.price_per_hour FROM reservations r JOIN fields f ON r.field_id = f.id JOIN users u ON r.user_id = u.id ORDER BY r.slot_date DESC LIMIT 5")
        ]);
        res.json({ totalUsers: parseInt(u.rows[0].count), totalReservations: parseInt(r.rows[0].count), totalEarnings: parseFloat(e.rows[0].total), pendingRequests: parseInt(p.rows[0].count), recentReservations: rec.rows });
    } catch (err) { return res.status(500).json({ error: err.message }); }
});

// --- Category/Gallery/Sponsors/Giveaways Management ---

router.post('/categories', async (req, res) => {
    const { name, description } = req.body;
    try {
        const { rows } = await pool.query(`INSERT INTO categories (name, description) VALUES ($1, $2) RETURNING *`, [name, description]);
        res.json({ message: 'Created', category: rows[0] });
    } catch (err) { return res.status(500).json({ error: err.message }); }
});

router.post('/gallery', async (req, res) => {
    const { image, title, categoryId } = req.body;
    try {
        const buf = Buffer.from(image.replace(/^data:image\/[a-zA-Z]+;base64,/, ''), 'base64');
        const optBuf = await sharp(buf).rotate().resize({ width: 1200 }).webp({ quality: 80 }).toBuffer();
        const url = await uploadImageToStorage(optBuf, `gallery_${Date.now()}.webp`, 'gallery');
        const { rows } = await pool.query(`INSERT INTO gallery_images (image_url, title, category_id) VALUES ($1, $2, $3) RETURNING id`, [url, title, categoryId]);
        res.json({ message: 'Uploaded', id: rows[0].id, image_url: url });
    } catch (err) { return res.status(500).json({ error: err.message }); }
});

router.post('/sponsors', async (req, res) => {
    const { name, image } = req.body;
    try {
        const buf = Buffer.from(image.replace(/^data:image\/[a-zA-Z]+;base64,/, ''), 'base64');
        const optBuf = await sharp(buf).rotate().resize({ width: 800 }).jpeg({ quality: 75 }).toBuffer();
        const url = await uploadImageToStorage(optBuf, `sponsor_${Date.now()}.jpg`, 'sponsors');
        const { rows } = await pool.query(`INSERT INTO sponsors (name, image_url) VALUES ($1, $2) RETURNING id`, [name, url]);
        res.json({ message: 'Added', id: rows[0].id });
    } catch (err) { return res.status(500).json({ error: err.message }); }
});

router.post('/giveaways', async (req, res) => {
    const { name, description, image, deadline } = req.body;
    try {
        let url = null;
        if (image) {
            const buf = Buffer.from(image.replace(/^data:image\/[a-zA-Z]+;base64,/, ''), 'base64');
            const optBuf = await sharp(buf).rotate().resize({ width: 1200 }).webp({ quality: 80 }).toBuffer();
            url = await uploadImageToStorage(optBuf, `giveaway_${Date.now()}.webp`, 'giveaways');
        }
        const { rows } = await pool.query(`INSERT INTO giveaways (name, description, image_url, deadline) VALUES ($1, $2, $3, $4) RETURNING id`, [name, description, url, deadline || null]);
        res.json({ message: 'Created', id: rows[0].id });
    } catch (err) { return res.status(500).json({ error: err.message }); }
});

// --- Fashion Shop Management ---

router.post('/fashion/products', async (req, res) => {
    const { name, price, category, stock, description, image } = req.body;
    try {
        let url = null;
        if (image) {
            const buf = Buffer.from(image.replace(/^data:image\/[a-zA-Z]+;base64,/, ''), 'base64');
            const optBuf = await sharp(buf).rotate().resize({ width: 800 }).webp({ quality: 80 }).toBuffer();
            url = await uploadImageToStorage(optBuf, `fashion_${Date.now()}.webp`, 'fashion');
        }
        const { rows } = await pool.query(`INSERT INTO fashion_products (name, price, category, stock, description, image_url) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`, [name, price, category, stock || 0, description, url]);
        res.json({ message: 'Added', product: rows[0] });
    } catch (err) { return res.status(500).json({ error: err.message }); }
});

router.delete('/fashion/products/:id', async (req, res) => {
    try {
        const prod = (await pool.query('SELECT image_url FROM fashion_products WHERE id = $1', [req.params.id])).rows[0];
        if (!prod) return res.status(404).json({ error: 'Not found' });
        if (prod.image_url) await deleteImageFromStorage(prod.image_url).catch(console.warn);
        await pool.query('DELETE FROM fashion_products WHERE id = $1', [req.params.id]);
        res.json({ message: 'Deleted' });
    } catch (err) { return res.status(500).json({ error: err.message }); }
});

module.exports = router;
