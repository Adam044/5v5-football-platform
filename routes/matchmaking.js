const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const pool = require('../database');
const { requireAuth } = require('../middleware/auth');

/**
 * Helper function to calculate players needed for matchmaking.
 */
function getPlayersNeededForMatchmaking(bookingType, currentPlayers) {
    switch (bookingType) {
        case 'team_vs_team':
            return 12 - currentPlayers;
        case 'team_looking_for_players':
            return 6 - currentPlayers;
        case 'players_looking_for_team':
            return 9;
        default:
            return 0;
    }
}

/**
 * API for direct matchmaking (Option 4: Player looking for a team).
 */
router.post('/matchmake', async (req, res) => {
    const { userId, fieldId, slotId, slotDate, requestType } = req.body;

    if (!userId || !fieldId || (!slotId && !slotDate) || !requestType) {
        return res.status(400).json({ error: 'All required fields must be provided.' });
    }

    if (requestType !== 'players_looking_for_team') {
        return res.status(400).json({ error: 'Invalid request type for direct matchmaking.' });
    }

    try {
        let effectiveDate = slotDate;
        if (slotId) {
            const slotSql = `SELECT slot_date FROM availability_slots WHERE id = $1`;
            const { rows: slotRows } = await pool.query(slotSql, [slotId]);
            const slot = slotRows[0];
            if (!slot) return res.status(404).json({ error: 'The selected time slot does not exist.' });
            effectiveDate = slot.slot_date;
        }

        // --- DUPLICATE CHECK ---
        const duplicateCheckSql = `
            SELECT id FROM matchmaking_requests 
            WHERE user_id = $1 AND field_id = $2 AND slot_date = $3 AND status = 'pending'
        `;
        const { rowCount: dupCount } = await pool.query(duplicateCheckSql, [userId, fieldId, effectiveDate]);
        if (dupCount > 0) {
            return res.status(400).json({ error: 'لقد أرسلت طلباً بالفعل لهذا الموعد.' });
        }
        // -----------------------

        const insertSql = `
            INSERT INTO matchmaking_requests (
                user_id, field_id, slot_date, start_time, end_time, request_type, players_needed
            ) VALUES ($1, $2, $3, NULL, NULL, $4, $5)
            RETURNING id
        `;
        const insertResult = await pool.query(insertSql, [userId, fieldId, effectiveDate, requestType, 1]);

        res.status(201).json({
            message: 'Matchmaking request submitted successfully. You will be notified when a match is found.',
            requestId: insertResult.rows[0].id
        });
    } catch (err) {
        console.error('Error inserting matchmaking request:', err);
        return res.status(500).json({ error: 'Failed to submit matchmaking request.' });
    }
});

/**
 * Initiate Team Building Session (Booking Option 1, 2, or 3).
 */
router.post('/team-building/initiate', async (req, res) => {
    const { userId, fieldId, slotDate, startTime, endTime, bookingType } = req.body;

    if (!userId || !fieldId || !slotDate || !bookingType) {
        return res.status(400).json({ error: 'Missing required fields.' });
    }

    const invitationCode = crypto.randomBytes(8).toString('hex');
    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        const userCheckSql = `SELECT id FROM users WHERE id = $1`;
        const { rows: userRows } = await client.query(userCheckSql, [userId]);
        if (userRows.length === 0) {
            await client.query("ROLLBACK");
            return res.status(400).json({ error: 'User not found.' });
        }

        if (startTime) {
            const checkSlotSql = `SELECT id FROM availability_slots WHERE field_id = $1 AND slot_date = $2 AND start_time = $3 AND is_reserved = 1 FOR UPDATE NOWAIT`;
            const resCheck = await client.query(checkSlotSql, [fieldId, slotDate, startTime]);
            if (resCheck.rows.length > 0) {
                await client.query("ROLLBACK");
                return res.status(409).json({ error: 'The selected time slot is already reserved.' });
            }
        }

        // --- DUPLICATE SESSION CHECK ---
        const dupSessionSql = `
            SELECT ts.id 
            FROM team_sessions ts
            JOIN team_members tm ON ts.id = tm.session_id
            WHERE tm.user_id = $1 AND ts.field_id = $2 AND ts.slot_date = $3 AND ts.status = 'active'
        `;
        const { rowCount: sessionCount } = await client.query(dupSessionSql, [userId, fieldId, slotDate]);
        if (sessionCount > 0) {
            await client.query("ROLLBACK");
            return res.status(400).json({ error: 'لديك جلسة نشطة بالفعل لهذا الموعد في هذا الملعب.' });
        }
        // ------------------------------

        const teamDesignation = bookingType === 'two_teams_ready' ? 'A' : 'single';
        const createSessionSql = `
            INSERT INTO team_sessions (invitation_code, creator_id, field_id, slot_date, start_time, end_time, booking_type)
            VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id
        `;
        const createResult = await client.query(createSessionSql, [
            invitationCode, userId, fieldId, slotDate,
            bookingType === 'two_teams_ready' ? startTime : null,
            bookingType === 'two_teams_ready' ? endTime : null,
            bookingType
        ]);
        const sessionId = createResult.rows[0].id;

        const addMemberSql = `INSERT INTO team_members (session_id, user_id, team_designation) VALUES ($1, $2, $3)`;
        await client.query(addMemberSql, [sessionId, userId, teamDesignation]);

        await client.query("COMMIT");
        res.json({ invitationCode, sessionId });
    } catch (err) {
        await client.query("ROLLBACK");
        console.error('Error in team-building/initiate:', err);
        return res.status(500).json({ error: 'Failed to create team session.' });
    } finally {
        client.release();
    }
});

/**
 * Get Team Building Session Details.
 */
router.get('/team-building/:invitationCode', async (req, res) => {
    const { invitationCode } = req.params;
    try {
        const sessionSql = `
            SELECT ts.*, f.name as field_name, f.location as field_address, f.price_per_hour, f.image_url as field_image_url
            FROM team_sessions ts
            JOIN fields f ON ts.field_id = f.id
            WHERE ts.invitation_code = $1 AND ts.status IN ('active', 'completed')
        `;
        const { rows: sessionRows } = await pool.query(sessionSql, [invitationCode]);
        const session = sessionRows[0];
        if (!session) return res.status(404).json({ error: 'Team session not found.' });

        const membersSql = `
            SELECT tm.id, tm.session_id, tm.user_id, u.name as player_name, tm.team_designation
            FROM team_members tm
            JOIN users u ON tm.user_id = u.id
            WHERE tm.session_id = $1 ORDER BY tm.joined_at
        `;
        const { rows: members } = await pool.query(membersSql, [session.id]);
        res.json({ session, members });
    } catch (err) {
        console.error('Error fetching team building session:', err);
        return res.status(500).json({ error: 'Failed to fetch team building session.' });
    }
});

/**
 * Join Team Building Session.
 */
router.post('/team-building/join', async (req, res) => {
    const { invitationCode, userId, teamDesignation } = req.body;
    if (!invitationCode || !userId || !['A', 'B', 'single'].includes(teamDesignation)) {
        return res.status(400).json({ error: 'Missing or invalid fields.' });
    }
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const sessionSql = `SELECT * FROM team_sessions WHERE invitation_code = $1 AND status = 'active' FOR UPDATE`;
        const { rows: sessionRows } = await client.query(sessionSql, [invitationCode]);
        const session = sessionRows[0];
        if (!session) {
            await client.query("ROLLBACK");
            return res.status(404).json({ error: 'Team session not found.' });
        }
        const checkMemberSql = `SELECT id FROM team_members WHERE session_id = $1 AND user_id = $2`;
        if ((await client.query(checkMemberSql, [session.id, userId])).rowCount > 0) {
            await client.query("ROLLBACK");
            return res.status(400).json({ error: 'User already in this session.' });
        }
        if (session.booking_type === 'team_looking_for_players') {
            const countSql = `SELECT COUNT(*) as count FROM team_members WHERE session_id = $1 AND team_designation = 'single'`;
            if (parseInt((await client.query(countSql, [session.id])).rows[0].count) >= 5) {
                await client.query("ROLLBACK");
                return res.status(400).json({ error: 'Team is full.' });
            }
        }
        await client.query(`INSERT INTO team_members (session_id, user_id, team_designation) VALUES ($1, $2, $3)`, [session.id, userId, teamDesignation]);
        await client.query("COMMIT");
        res.json({ message: 'Successfully joined team.' });
    } catch (err) {
        await client.query("ROLLBACK");
        return res.status(500).json({ error: 'Failed to join team.' });
    } finally {
        client.release();
    }
});

/**
 * Remove Player from Team Building Session.
 */
router.post('/team-building/remove-player', async (req, res) => {
    const { invitationCode, userId, targetUserId } = req.body;
    if (!invitationCode || !userId || !targetUserId) return res.status(400).json({ error: 'Missing fields.' });
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const sessionSql = `SELECT * FROM team_sessions WHERE invitation_code = $1 AND creator_id = $2 AND status = 'active' FOR UPDATE`;
        const { rows: sessionRows } = await client.query(sessionSql, [invitationCode, userId]);
        const session = sessionRows[0];
        if (!session) {
            await client.query("ROLLBACK");
            return res.status(403).json({ error: 'Unauthorized.' });
        }
        if (parseInt(targetUserId) === parseInt(userId)) {
            await client.query("ROLLBACK");
            return res.status(400).json({ error: 'Cannot remove creator.' });
        }
        const delRes = await client.query(`DELETE FROM team_members WHERE session_id = $1 AND user_id = $2`, [session.id, targetUserId]);
        if (delRes.rowCount === 0) {
            await client.query("ROLLBACK");
            return res.status(404).json({ error: 'Player not found.' });
        }
        await client.query("COMMIT");
        res.json({ message: 'Player removed.' });
    } catch (err) {
        await client.query("ROLLBACK");
        return res.status(500).json({ error: 'Failed to remove player.' });
    } finally {
        client.release();
    }
});

/**
 * Confirm Booking (Two Teams Ready).
 */
router.post('/team-building/confirm-booking', async (req, res) => {
    const { invitationCode, userId } = req.body;
    if (!invitationCode || !userId) return res.status(400).json({ error: 'Missing fields.' });
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const sessionSql = `SELECT * FROM team_sessions WHERE invitation_code = $1 AND creator_id = $2 AND status = 'active' AND booking_type = 'two_teams_ready' FOR UPDATE`;
        const { rows: sessionRows } = await client.query(sessionSql, [invitationCode, userId]);
        const session = sessionRows[0];
        if (!session) {
            await client.query("ROLLBACK");
            return res.status(403).json({ error: 'Unauthorized.' });
        }
        const countSql = `SELECT team_designation, COUNT(*) as count FROM team_members WHERE session_id = $1 GROUP BY team_designation`;
        const counts = (await client.query(countSql, [session.id])).rows;
        const teamA = counts.find(r => r.team_designation === 'A')?.count || 0;
        const teamB = counts.find(r => r.team_designation === 'B')?.count || 0;
        if (teamA < 6 || teamB < 6) {
            await client.query("ROLLBACK");
            return res.status(400).json({ error: 'Minimum players required (6v6).' });
        }
        const reserveSql = `UPDATE availability_slots SET is_reserved = 1, reservation_type = $1, user_id = $2 WHERE field_id = $3 AND slot_date = $4 AND start_time = $5 AND is_reserved = 0`;
        const resUpnd = await client.query(reserveSql, ['two_teams_ready', userId, session.field_id, session.slot_date, session.start_time]);
        if (resUpnd.rowCount === 0) {
            await client.query("ROLLBACK");
            return res.status(409).json({ error: 'Slot taken.' });
        }
        const insertResSql = `INSERT INTO reservations (user_id, field_id, slot_date, start_time, end_time, booking_type, session_id) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`;
        const insertedRes = await client.query(insertResSql, [userId, session.field_id, session.slot_date, session.start_time, session.end_time, 'two_teams_ready', session.id]);
        await client.query(`UPDATE team_sessions SET status = 'completed' WHERE id = $1`, [session.id]);
        await client.query("COMMIT");
        res.json({ message: 'Confirmed!', reservationId: insertedRes.rows[0].id });
    } catch (err) {
        await client.query("ROLLBACK");
        return res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
});

/**
 * Option 2 & 3: Submit Matchmaking Request.
 */
router.post('/team-building/submit-matchmaking', async (req, res) => {
    const { invitationCode, userId, currentPlayers } = req.body;
    if (!invitationCode || !userId || typeof currentPlayers !== 'number') return res.status(400).json({ error: 'Missing fields.' });
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const sessionSql = `SELECT * FROM team_sessions WHERE invitation_code = $1 AND creator_id = $2 AND status = 'active' AND booking_type IN ('team_vs_team', 'team_looking_for_players') FOR UPDATE`;
        const session = (await client.query(sessionSql, [invitationCode, userId])).rows[0];
        if (!session) {
            await client.query("ROLLBACK");
            return res.status(403).json({ error: 'Unauthorized.' });
        }
        const requiredMin = session.booking_type === 'team_vs_team' ? 6 : 3;
        if (currentPlayers < requiredMin) {
            await client.query("ROLLBACK");
            return res.status(400).json({ error: `At least ${requiredMin} players required.` });
        }
        const poolNeeded = getPlayersNeededForMatchmaking(session.booking_type, currentPlayers);
        await client.query(`INSERT INTO matchmaking_requests (user_id, field_id, slot_date, start_time, end_time, request_type, players_needed) VALUES ($1, $2, $3, NULL, NULL, $4, $5)`, [userId, session.field_id, session.slot_date, session.booking_type, poolNeeded]);
        await client.query(`UPDATE team_sessions SET status = 'completed' WHERE id = $1`, [session.id]);
        await client.query("COMMIT");
        res.json({ message: 'Request submitted!' });
    } catch (err) {
        await client.query("ROLLBACK");
        return res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
});

/**
 * Get active requests and sessions for a user.
 * Used for duplicate prevention on frontend.
 */
router.get('/active-requests/:userId', async (req, res) => {
    const { userId } = req.params;
    try {
        const requestsSql = `
            SELECT field_id, slot_date, start_time, request_type 
            FROM matchmaking_requests 
            WHERE user_id = $1 AND status = 'pending'
        `;
        const { rows: requests } = await pool.query(requestsSql, [userId]);

        const sessionsSql = `
            SELECT ts.field_id, ts.slot_date, ts.start_time, ts.booking_type 
            FROM team_sessions ts
            JOIN team_members tm ON ts.id = tm.session_id
            WHERE tm.user_id = $1 AND ts.status = 'active'
        `;
        const { rows: sessions } = await pool.query(sessionsSql, [userId]);

        res.json({ requests, sessions });
    } catch (err) {
        console.error('Error fetching active requests:', err);
        res.status(500).json({ error: 'Failed to fetch active requests.' });
    }
});

module.exports = router;
