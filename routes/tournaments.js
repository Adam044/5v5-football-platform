const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const pool = require('../database');
const { requireAuth } = require('../middleware/auth');

/**
 * Get all tournaments (Public).
 */
router.get('/', async (req, res) => {
    const sql = `
        SELECT t.id, t.name, t.tournament_date, t.prize, t.description, f.name AS field_name, f.image_url as image_url
        FROM tournaments t LEFT JOIN fields f ON t.field_id = f.id ORDER BY t.tournament_date ASC
    `;
    try {
        const { rows } = await pool.query(sql);
        res.json({ tournaments: rows });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

/**
 * Get single tournament details (Public).
 */
router.get('/:tournamentId', async (req, res) => {
    const { tournamentId } = req.params;
    const sql = `
        SELECT t.id, t.name, t.tournament_date, t.prize, t.description, f.name AS field_name, f.image_url as field_image_url, f.id as field_id
        FROM tournaments t JOIN fields f ON t.field_id = f.id WHERE t.id = $1
    `;
    try {
        const { rows } = await pool.query(sql, [tournamentId]);
        if (!rows[0]) return res.status(404).json({ error: 'Tournament not found' });
        res.json({ tournament: rows[0] });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

/**
 * Get tournament teams (Public).
 */
router.get('/:tournamentId/teams', async (req, res) => {
    const { tournamentId } = req.params;
    try {
        const tournament = (await pool.query('SELECT name FROM tournaments WHERE id = $1', [tournamentId])).rows[0];
        if (!tournament) return res.status(404).json({ message: 'Tournament not found' });

        const teamsSql = `
            SELECT tt.team_name, u.name as captain_name, tt.registration_date, tt.status, tt.invitation_code
            FROM tournament_teams tt JOIN users u ON tt.captain_id = u.id WHERE tt.tournament_id = $1 ORDER BY tt.registration_date ASC
        `;
        const { rows: teams } = await pool.query(teamsSql, [tournamentId]);
        res.json({ success: true, tournament, teams });
    } catch (err) {
        return res.status(500).json({ error: 'Failed to load teams' });
    }
});

/**
 * Create new tournament team.
 */
router.post('/signup/create', async (req, res) => {
    const { tournamentId, teamName, creatorId, creatorName } = req.body;
    if (!tournamentId || !teamName || !creatorId || !creatorName) return res.status(400).json({ error: 'Missing fields' });

    const invitationCode = crypto.randomBytes(16).toString('hex');
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const existing = await client.query('SELECT team_name, invitation_code FROM tournament_teams WHERE tournament_id = $1 AND captain_id = $2', [tournamentId, creatorId]);
        if (existing.rows.length > 0) {
            await client.query("ROLLBACK");
            return res.status(400).json({ error: 'Team already exists.', invitationCode: existing.rows[0].invitation_code });
        }

        const teamId = (await client.query(`INSERT INTO tournament_teams (tournament_id, team_name, captain_id, invitation_code, status, registration_date) VALUES ($1, $2, $3, $4, 'forming', NOW()) RETURNING id`, [tournamentId, teamName, creatorId, invitationCode])).rows[0].id;
        await client.query(`INSERT INTO tournament_team_members (team_id, user_id, user_name, is_captain, joined_at) VALUES ($1, $2, $3, 1, NOW())`, [teamId, creatorId, creatorName]);
        await client.query("COMMIT");
        res.status(201).json({ team: { id: teamId, name: teamName, captain_id: creatorId, invitation_code: invitationCode }, invitationCode });
    } catch (err) {
        await client.query("ROLLBACK");
        return res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
});

/**
 * Get team details by invitation code.
 */
router.get('/signup/:invitationCode', async (req, res) => {
    const { invitationCode } = req.params;
    try {
        const teamSql = `
            SELECT tt.*, t.name as tournament_name, t.tournament_date, t.prize, t.description, f.name as field_name, f.location as field_location
            FROM tournament_teams tt JOIN tournaments t ON tt.tournament_id = t.id JOIN fields f ON t.field_id = f.id WHERE tt.invitation_code = $1
        `;
        const team = (await pool.query(teamSql, [invitationCode])).rows[0];
        if (!team) return res.status(404).json({ error: 'Invalid code' });

        const members = (await pool.query('SELECT user_id, user_name, is_captain, joined_at FROM tournament_team_members WHERE team_id = $1 ORDER BY is_captain DESC, joined_at ASC', [team.id])).rows;
        res.json({
            team: { id: team.id, team_name: team.team_name, captain_id: team.captain_id, invitation_code: team.invitation_code, status: team.status, tournament_id: team.tournament_id },
            tournament: { id: team.tournament_id, name: team.tournament_name, tournament_date: team.tournament_date, prize: team.prize, description: team.description, field_name: team.field_name, field_location: team.field_location },
            players: members
        });
    } catch (err) {
        return res.status(500).json({ error: 'Database error' });
    }
});

/**
 * Join tournament team.
 */
router.post('/signup/join', requireAuth, async (req, res) => {
    const { invitationCode } = req.body;
    const { id: userId, name: userName } = req.user;
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const team = (await client.query('SELECT id, status FROM tournament_teams WHERE invitation_code = $1 FOR UPDATE', [invitationCode])).rows[0];
        if (!team || team.status !== 'forming') {
            await client.query("ROLLBACK");
            return res.status(400).json({ error: 'Team not available.' });
        }
        if (parseInt((await client.query('SELECT COUNT(*) FROM tournament_team_members WHERE team_id = $1', [team.id])).rows[0].count) >= 8) {
            await client.query("ROLLBACK");
            return res.status(400).json({ error: 'Team full.' });
        }
        await client.query('INSERT INTO tournament_team_members (team_id, user_id, user_name, is_captain, joined_at) VALUES ($1, $2, $3, 0, NOW())', [team.id, userId, userName]);
        await client.query("COMMIT");
        res.json({ message: 'Joined!' });
    } catch (err) {
        await client.query("ROLLBACK");
        return res.status(500).json({ error: 'Failed to join' });
    } finally {
        client.release();
    }
});

/**
 * Remove player (Captain only).
 */
router.post('/signup/remove-player', async (req, res) => {
    const { invitationCode, userId, targetUserId } = req.body;
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const team = (await client.query('SELECT id, captain_id FROM tournament_teams WHERE invitation_code = $1 FOR UPDATE', [invitationCode])).rows[0];
        if (!team || parseInt(team.captain_id) !== parseInt(userId)) {
            await client.query("ROLLBACK");
            return res.status(403).json({ error: 'Unauthorized.' });
        }
        const delRes = await client.query('DELETE FROM tournament_team_members WHERE team_id = $1 AND user_id = $2 AND is_captain = 0', [team.id, targetUserId]);
        if (delRes.rowCount === 0) {
            await client.query("ROLLBACK");
            return res.status(400).json({ error: 'Cannot remove.' });
        }
        await client.query("COMMIT");
        res.json({ message: 'Removed.' });
    } catch (err) {
        await client.query("ROLLBACK");
        return res.status(500).json({ error: 'Failed' });
    } finally {
        client.release();
    }
});

/**
 * Confirm registration.
 */
router.post('/signup/confirm', async (req, res) => {
    const { invitationCode, tournamentId, captainId } = req.body;
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const team = (await client.query('SELECT id, (SELECT COUNT(*) FROM tournament_team_members WHERE team_id = tournament_teams.id) as count FROM tournament_teams WHERE invitation_code = $1 AND tournament_id = $2 AND captain_id = $3 FOR UPDATE', [invitationCode, tournamentId, captainId])).rows[0];
        if (!team || parseInt(team.count) < 6) {
            await client.query("ROLLBACK");
            return res.status(400).json({ error: 'Not enough members.' });
        }
        await client.query('UPDATE tournament_teams SET status = \'registered\' WHERE id = $1', [team.id]);
        await client.query("COMMIT");
        res.json({ message: 'Confirmed!' });
    } catch (err) {
        await client.query("ROLLBACK");
        return res.status(500).json({ error: 'Failed' });
    } finally {
        client.release();
    }
});

module.exports = router;
