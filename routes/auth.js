const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const pool = require('../database');
const { signToken, TOKEN_TTL_SECONDS } = require('../utils/auth');
const { requireAuth } = require('../middleware/auth');
const { requireCsrf } = require('../middleware/csrf');
const { loginLimiter, signupLimiter } = require('../middleware/rateLimit');
const { assessPasswordStrength } = require('../utils/validation');

const saltRounds = 10;

// API endpoint for user sign-up
router.post('/signup', signupLimiter, requireCsrf, async (req, res) => {
    const { name, email, phone, birthdate, gender, city, address, profession, password } = req.body;

    if (!name || !email || !phone || !birthdate || !gender || !city || !address || !profession || !password) {
        return res.status(400).json({ error: 'يرجى توفير جميع الحقول المطلوبة.' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return res.status(400).json({ error: 'البريد الإلكتروني غير صالح.' });
    }

    const phoneRegex = /^\+\d{10,14}$/;
    if (!phoneRegex.test(phone)) {
        return res.status(400).json({ error: 'رقم الهاتف غير صالح.' });
    }

    const strength = assessPasswordStrength(password, { email, name, phone });
    if (!strength.ok) {
        return res.status(400).json({ error: strength.error });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, saltRounds);
        const isAdminValue = 0;

        const sql = `
            INSERT INTO users (name, email, phone_number, birthdate, gender, password, is_admin, city, address, profession) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING id
        `;
        const params = [name, email, phone, birthdate, gender, hashedPassword, isAdminValue, city, address, profession];

        const { rows } = await pool.query(sql, params);
        const userId = rows[0].id;

        res.status(201).json({ message: 'تم إنشاء الحساب بنجاح.', userId });
    } catch (err) {
        console.error('Error inserting user:', err);
        if (err.code === '23505') {
            return res.status(409).json({ error: 'هذا البريد الإلكتروني مسجل بالفعل.' });
        }
        return res.status(500).json({ error: 'تعذر إنشاء الحساب.' });
    }
});

// API endpoint for user login
router.post('/login', loginLimiter, requireCsrf, async (req, res) => {
    const { identifier, password } = req.body; // Changed from email to identifier

    if (!identifier || !password) {
        return res.status(400).json({ error: 'البريد الإلكتروني أو رقم الهاتف وكلمة المرور مطلوبة.' });
    }

    // Support both email and phone number login
    const sql = `
        SELECT id, name, email, phone_number, password, is_admin, role 
        FROM users 
        WHERE email = $1 OR phone_number = $1
    `;
    try {
        const { rows } = await pool.query(sql, [identifier]);
        const user = rows[0];

        if (!user) {
            return res.status(401).json({ error: 'البيانات المدخلة غير صحيحة.' });
        }

        const match = await bcrypt.compare(password, user.password);

        if (match) {
            const token = signToken({
                id: user.id,
                name: user.name,
                email: user.email,
                phone: user.phone_number,
                is_admin: Boolean(user.is_admin),
                role: user.role
            });
            const isProd = process.env.NODE_ENV === 'production';
            res.cookie('auth_token', token, {
                httpOnly: true,
                secure: isProd,
                sameSite: 'lax',
                maxAge: TOKEN_TTL_SECONDS * 1000,
                path: '/'
            });

            res.json({
                message: 'تم تسجيل الدخول بنجاح.',
                userId: user.id,
                userName: user.name,
                email: user.email,
                is_admin: Boolean(user.is_admin),
                role: user.role
            });
        } else {
            return res.status(401).json({ error: 'البيانات المدخلة غير صحيحة.' });
        }
    } catch (err) {
        console.error('Login error:', err);
        return res.status(500).json({ error: 'حدث خطأ أثناء تسجيل الدخول.' });
    }
});

// Auth: get current user from token
router.get('/me', requireAuth, async (req, res) => {
    const user = {
        id: req.user.id,
        name: req.user.name,
        email: req.user.email,
        is_admin: !!req.user.is_admin,
        role: req.user.role
    };
    res.json({ user });
});

// Auth: logout (clear cookie)
router.post('/logout', requireCsrf, (req, res) => {
    const isProd = process.env.NODE_ENV === 'production';
    res.clearCookie('auth_token', { httpOnly: true, sameSite: 'lax', secure: isProd, path: '/' });
    res.json({ success: true, message: 'تم تسجيل الخروج.' });
});

module.exports = router;
