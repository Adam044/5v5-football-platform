const express = require('express');
const router = express.Router();
const pool = require('../database');
const { signToken, verifyToken, getCookie, TOKEN_TTL_SECONDS } = require('../utils/auth');
const { checkOwner } = require('../middleware/auth');

/**
 * Owner Login.
 */
router.post('/login', (req, res) => {
    const { username, password } = req.body;
    if (username === process.env.OWNER_USERNAME && password === process.env.OWNER_PASSWORD) {
        const token = signToken({ username, isOwner: true });
        res.cookie('owner_token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 7 * 24 * 60 * 60 * 1000 // 1 week
        });
        return res.json({ success: true, message: 'Owner logged in' });
    }
    return res.status(401).json({ error: 'Invalid owner credentials' });
});

/**
 * System Status (Owner only).
 * Returns the lock states from the database.
 */
router.get('/system-status', checkOwner, async (req, res) => {
    try {
        const { rows } = await pool.query('SELECT key, value FROM system_settings WHERE key IN ($1, $2)', ['global_lock', 'page_locks']);
        const settings = {};
        rows.forEach(r => {
            settings[r.key] = typeof r.value === 'string' ? JSON.parse(r.value) : r.value;
        });

        res.json({
            success: true,
            global_lock: settings.global_lock || { is_locked: false, type: 'none', message: '' },
            page_locks: settings.page_locks || {}
        });
    } catch (err) {
        console.error('Error fetching system status:', err);
        res.status(500).json({ error: 'Failed to fetch status' });
    }
});

/**
 * Update System Lock (Owner only).
 */
router.post('/update-lock', checkOwner, async (req, res) => {
    const { key, value } = req.body;
    if (!['global_lock', 'page_locks'].includes(key)) {
        return res.status(400).json({ error: 'Invalid setting key' });
    }

    try {
        const jsonValue = JSON.stringify(value);
        await pool.query(
            'INSERT INTO system_settings (key, value, updated_at) VALUES ($1, $2, CURRENT_TIMESTAMP) ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = CURRENT_TIMESTAMP',
            [key, jsonValue]
        );
        res.json({ success: true, message: `System setting ${key} updated` });
    } catch (err) {
        console.error('Error updating system setting:', err);
        res.status(500).json({ error: 'Failed to update setting' });
    }
});

module.exports = router;
