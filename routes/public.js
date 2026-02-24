const express = require('express');
const router = express.Router();
const pool = require('../database');
const { requireAuth } = require('../middleware/auth');
const { issueCsrfToken } = require('../middleware/csrf');

/**
 * CSRF Token endpoint.
 */
router.get('/csrf-token', (req, res) => {
    const token = issueCsrfToken(req, res);
    res.json({ csrfToken: token });
});

/**
 * List categories.
 */
router.get('/categories', async (req, res) => {
    try {
        const sql = `SELECT id, name, description, created_at FROM categories ORDER BY name ASC`;
        const { rows } = await pool.query(sql);
        res.json({ categories: rows });
    } catch (err) {
        return res.status(500).json({ error: 'Failed to fetch categories.' });
    }
});

/**
 * List gallery images.
 */
router.get('/gallery', async (req, res) => {
    const { category, page = 1, limit = 12 } = req.query;
    const offset = (page - 1) * limit;
    try {
        let countSql = `SELECT COUNT(*) FROM gallery_images g`;
        let countParams = [];
        if (category) { countSql += ` WHERE g.category_id = $1`; countParams.push(category); }
        const totalImages = parseInt((await pool.query(countSql, countParams)).rows[0].count);
        const totalPages = Math.ceil(totalImages / limit);

        let sql = `
            SELECT g.id, g.image_url, g.title, g.created_at, c.name as category_name, c.id as category_id
            FROM gallery_images g LEFT JOIN categories c ON g.category_id = c.id
        `;
        let params = [];
        if (category) {
            sql += ` WHERE g.category_id = $1 ORDER BY g.created_at DESC LIMIT $2 OFFSET $3`;
            params.push(category, limit, offset);
        } else {
            sql += ` ORDER BY g.created_at DESC LIMIT $1 OFFSET $2`;
            params.push(limit, offset);
        }
        const { rows } = await pool.query(sql, params);
        res.json({ images: rows.filter(r => r.image_url), pagination: { currentPage: parseInt(page), totalPages, totalImages } });
    } catch (err) {
        return res.status(500).json({ error: 'Failed to fetch gallery.' });
    }
});

/**
 * List sponsors.
 */
router.get('/sponsors', async (req, res) => {
    try {
        const { rows } = await pool.query(`SELECT id, name, image_url, created_at FROM sponsors ORDER BY created_at DESC`);
        res.json({ sponsors: rows.filter(r => r.image_url) });
    } catch (err) {
        return res.status(500).json({ error: 'Failed' });
    }
});

/**
 * List giveaways.
 */
router.get('/giveaways', async (req, res) => {
    try {
        const sql = `
            SELECT g.id, g.name, g.description, g.image_url, g.created_at, g.deadline, COALESCE(p.count, 0) AS participants_count
            FROM giveaways g LEFT JOIN (SELECT giveaway_id, COUNT(*) AS count FROM giveaway_participants GROUP BY giveaway_id) p ON p.giveaway_id = g.id
            ORDER BY g.created_at DESC
        `;
        const { rows } = await pool.query(sql);
        res.json({ giveaways: rows });
    } catch (err) {
        return res.status(500).json({ error: 'Failed' });
    }
});

/**
 * Join a giveaway.
 */
router.post('/giveaways/:id/join', requireAuth, async (req, res) => {
    const { id } = req.params;
    const userId = req.user?.id;
    try {
        const gw = (await pool.query('SELECT deadline FROM giveaways WHERE id = $1', [id])).rows[0];
        if (!gw) return res.status(404).json({ error: 'Not found' });
        if (gw.deadline && Date.now() > new Date(gw.deadline).getTime()) return res.status(400).json({ error: 'Expired' });

        await pool.query('INSERT INTO giveaway_participants (giveaway_id, user_id) VALUES ($1, $2)', [id, userId]);
        res.json({ message: 'Joined!' });
    } catch (err) {
        if (err.code === '23505') return res.status(400).json({ error: 'Already joined' });
        return res.status(500).json({ error: 'Failed' });
    }
});

/**
 * System Status (Public Lock Check).
 * Used by system-guard.js to check for maintenance/locks.
 */
router.get('/public/system-status', async (req, res) => {
    try {
        const { rows } = await pool.query('SELECT key, value FROM system_settings WHERE key IN ($1, $2)', ['global_lock', 'page_locks']);
        const settings = {};
        rows.forEach(r => {
            settings[r.key] = typeof r.value === 'string' ? JSON.parse(r.value) : r.value;
        });
        res.json({
            global_lock: settings.global_lock || { is_locked: false, type: 'none', message: '' },
            page_locks: settings.page_locks || {}
        });
    } catch (err) {
        console.error('Error fetching system status:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * API endpoint to get availability for a specific field on a date.
 */
router.get('/availability/:fieldId', async (req, res) => {
    const { fieldId } = req.params;
    const { date } = req.query;

    if (!date) {
        return res.status(400).json({ error: 'Date parameter is required.' });
    }

    const sql = `SELECT * FROM availability_slots WHERE field_id = $1 AND slot_date = $2 AND is_reserved = 0`;
    try {
        const { rows } = await pool.query(sql, [fieldId, date]);
        res.json({ availability: rows });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

/**
 * API endpoint to get all upcoming available slots.
 */
router.get('/available-slots', async (req, res) => {
    const today = new Date().toISOString().split('T')[0];
    const now = new Date();
    const currentTime = now.toTimeString().slice(0, 5); // HH:MM
    const sql = `
        SELECT 
            s.id,
            s.slot_date,
            s.start_time,
            s.end_time,
            f.id AS field_id,
            f.name AS field_name,
            f.location AS field_location,
            f.image_url AS field_image_url
        FROM availability_slots s
        JOIN fields f ON s.field_id = f.id
        WHERE s.is_reserved = 0
          AND (
            s.slot_date > $1
            OR (s.slot_date = $1 AND s.start_time > $2)
          )
        ORDER BY s.slot_date ASC, s.start_time ASC
        LIMIT 100
    `;
    try {
        const { rows } = await pool.query(sql, [today, currentTime]);
        res.json({ slots: rows });
    } catch (err) {
        console.error('Error fetching available slots:', err);
        return res.status(500).json({ error: err.message });
    }
});

/**
 * Test endpoint.
 */
router.get('/test', (req, res) => {
    console.log('🔍 Test endpoint hit - headers:', JSON.stringify(req.headers, null, 2));
    res.json({ message: 'Server is working', timestamp: new Date().toISOString() });
});

module.exports = router;
