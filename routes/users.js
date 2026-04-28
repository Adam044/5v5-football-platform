const express = require('express');
const router = express.Router();
const pool = require('../database');
const { requireAuth } = require('../middleware/auth');

/**
 * Get users with birthdays in the upcoming week.
 */
router.get('/upcoming-birthdays', async (req, res) => {
    const today = new Date();
    const dates = [];
    for (let i = 0; i <= 7; i++) {
        const date = new Date();
        date.setDate(today.getDate() + i);
        dates.push(String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0'));
    }
    const sql = `
        SELECT id, name, email, phone_number, birthdate, gender FROM users 
        WHERE TO_CHAR(TO_DATE(birthdate, 'YYYY-MM-DD'), 'MM-DD') = ANY($1::text[])
        AND birthdate IS NOT NULL
    `;
    try {
        const { rows } = await pool.query(sql, [dates]);
        const sortedUsers = rows.sort((a, b) => {
            const aDate = new Date(a.birthdate);
            const bDate = new Date(b.birthdate);
            const aFm = String(aDate.getMonth() + 1).padStart(2, '0') + '-' + String(aDate.getDate()).padStart(2, '0');
            const bFm = String(bDate.getMonth() + 1).padStart(2, '0') + '-' + String(bDate.getDate()).padStart(2, '0');
            return aFm.localeCompare(bFm);
        });
        res.json({ users: sortedUsers });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

/**
 * Get a user's profile information.
 */
router.get('/:userId', requireAuth, async (req, res) => {
    const { userId } = req.params;
    const requesterId = String(req.user?.id || '');
    const isAdmin = !!req.user?.is_admin;
    if (!userId) return res.status(400).json({ error: 'User ID is required.' });
    if (!isAdmin && String(userId) !== requesterId) {
        return res.status(403).json({ error: 'Forbidden.' });
    }
    const sql = `SELECT id, name, email, phone_number, birthdate, gender, is_admin FROM users WHERE id = $1`;
    try {
        const { rows } = await pool.query(sql, [userId]);
        if (!rows[0]) return res.status(404).json({ error: 'User not found.' });

        // Standardize is_admin to boolean
        const user = {
            ...rows[0],
            is_admin: rows[0].is_admin === 1 || rows[0].is_admin === true
        };

        res.json({ user });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

/**
 * Get a user's matchmaking requests.
 */
router.get('/:userId/matchmaking-requests', requireAuth, async (req, res) => {
    const { userId } = req.params;
    const requesterId = String(req.user?.id || '');
    const isAdmin = !!req.user?.is_admin;
    if (!userId) return res.status(400).json({ error: 'User ID is required.' });
    if (!isAdmin && String(userId) !== requesterId) {
        return res.status(403).json({ error: 'Forbidden.' });
    }
    const createdSql = `
        SELECT mr.id, mr.slot_date, mr.start_time, mr.end_time, mr.request_type, mr.status, mr.players_needed, f.name AS field_name
        FROM matchmaking_requests mr JOIN fields f ON mr.field_id = f.id WHERE mr.user_id = $1 ORDER BY mr.created_at DESC
    `;
    const joinedSql = `
        SELECT DISTINCT mr.id, mr.slot_date, mr.start_time, mr.end_time, mr.request_type, mr.status, mr.players_needed, mr.created_at, f.name AS field_name, ts.invitation_code
        FROM matchmaking_requests mr JOIN fields f ON mr.field_id = f.id JOIN team_sessions ts ON ts.field_id = mr.field_id AND ts.slot_date = mr.slot_date AND ts.booking_type = mr.request_type
        JOIN team_members tm ON tm.session_id = ts.id WHERE tm.user_id = $1 ORDER BY mr.created_at DESC
    `;
    try {
        const [created, joined] = await Promise.all([
            pool.query(createdSql, [userId]).then(r => r.rows),
            pool.query(joinedSql, [userId]).then(r => r.rows)
        ]);
        res.json({ created, joined });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

/**
 * Get a user's reservations history.
 */
router.get('/:userId/reservations', requireAuth, async (req, res) => {
    const { userId } = req.params;
    const requesterId = String(req.user?.id || '');
    const isAdmin = !!req.user?.is_admin;

    if (!userId) return res.status(400).json({ error: 'User ID is required.' });
    if (!isAdmin && String(userId) !== requesterId) {
        return res.status(403).json({ error: 'Forbidden. You can only view your own reservations.' });
    }

    const sql = `
        SELECT r.id, r.slot_date, r.start_time, r.end_time, r.booking_type, 'confirmed' as status, f.name AS field_name, f.price_per_hour
        FROM reservations r
        LEFT JOIN fields f ON r.field_id = f.id
        WHERE r.user_id = $1 ORDER BY r.slot_date DESC, r.start_time DESC
    `;
    try {
        const { rows } = await pool.query(sql, [userId]);
        res.json({ reservations: rows });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

/**
 * Get a user's tournament teams.
 */
router.get('/:userId/tournament-teams', requireAuth, async (req, res) => {
    const { userId } = req.params;
    const requesterId = String(req.user?.id || '');
    const isAdmin = !!req.user?.is_admin;

    if (!userId) return res.status(400).json({ error: 'User ID is required.' });
    if (!isAdmin && String(userId) !== requesterId) {
        return res.status(403).json({ error: 'Forbidden.' });
    }

    const sql = `
        SELECT tt.id, tt.team_name, tt.registration_date, tt.status, tt.invitation_code, tt.captain_id,
               t.name AS tournament_name, t.tournament_date, t.prize AS tournament_prize, f.name AS field_name,
               (SELECT COUNT(*) FROM tournament_team_members WHERE team_id = tt.id) AS member_count
        FROM tournament_teams tt
        JOIN tournament_team_members ttm ON tt.id = ttm.team_id
        JOIN tournaments t ON tt.tournament_id = t.id
        JOIN fields f ON t.field_id = f.id
        WHERE ttm.user_id = $1
        ORDER BY t.tournament_date DESC
    `;
    try {
        const { rows } = await pool.query(sql, [userId]);
        const teams = rows.map(row => ({
            id: row.id,
            team_name: row.team_name,
            registration_date: row.registration_date,
            status: row.status,
            invitation_code: row.invitation_code,
            captain_id: row.captain_id,
            member_count: parseInt(row.member_count),
            tournament: {
                name: row.tournament_name,
                tournament_date: row.tournament_date,
                field_name: row.field_name,
                prize: row.tournament_prize
            }
        }));
        res.json({ success: true, teams });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

/**
 * Get a user's training subscription.
 */
router.get('/:userId/training-subscription', requireAuth, async (req, res) => {
    const { userId } = req.params;
    const requesterId = String(req.user?.id || '');
    const isAdmin = !!req.user?.is_admin;

    if (!userId) return res.status(400).json({ error: 'User ID is required.' });
    if (!isAdmin && String(userId) !== requesterId) {
        return res.status(403).json({ error: 'Forbidden.' });
    }

    try {
        const { rows } = await pool.query(`
            SELECT * FROM training_subscriptions 
            WHERE user_id = $1 AND status = 'active'
            ORDER BY created_at DESC 
            LIMIT 1
        `, [userId]);
        
        if (rows.length === 0) {
            return res.json({ subscription: null });
        }
        
        res.json({ subscription: rows[0] });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

/**
 * Get a user's training attendance history.
 */
router.get('/:userId/training-attendance', requireAuth, async (req, res) => {
    const { userId } = req.params;
    const requesterId = String(req.user?.id || '');
    const isAdmin = !!req.user?.is_admin;

    if (!userId) return res.status(400).json({ error: 'User ID is required.' });
    if (!isAdmin && String(userId) !== requesterId) {
        return res.status(403).json({ error: 'Forbidden.' });
    }

    try {
        const { rows } = await pool.query(`
            SELECT ta.attended_at, u.name as coach_name 
            FROM training_attendance ta
            JOIN training_subscriptions ts ON ta.subscription_id = ts.id
            LEFT JOIN users u ON ta.coach_id = u.id
            WHERE ts.user_id = $1
            ORDER BY ta.attended_at DESC
        `, [userId]);
        
        res.json({ attendance: rows });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

module.exports = router;
