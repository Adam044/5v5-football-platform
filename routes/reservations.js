const express = require('express');
const router = express.Router();
const pool = require('../database');
const { requireAuth } = require('../middleware/auth');

/**
 * API for direct reservations (only for 'full_field' bookings).
 */
router.post('/', requireAuth, async (req, res) => {
    const { slotId } = req.body;
    const userId = req.user?.id;
    if (!userId || !slotId) {
        return res.status(400).json({ error: 'All reservation details are required.' });
    }

    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const checkSql = `SELECT is_reserved FROM availability_slots WHERE id = $1 FOR UPDATE`;
        const checkResult = await client.query(checkSql, [slotId]);
        const row = checkResult.rows[0];

        if (!row) {
            await client.query("ROLLBACK");
            return res.status(404).json({ error: 'Selected slot not found.' });
        }
        if (row.is_reserved === 1) {
            await client.query("ROLLBACK");
            return res.status(409).json({ error: 'Failed to reserve the slot. It may already be taken.' });
        }

        const updateSql = `UPDATE availability_slots SET is_reserved = 1, reservation_type = 'full_field', user_id = $1 WHERE id = $2`;
        await client.query(updateSql, [userId, slotId]);

        const slotDetailsSql = `SELECT field_id, slot_date, start_time, end_time FROM availability_slots WHERE id = $1`;
        const { rows: slotDetailsRows } = await client.query(slotDetailsSql, [slotId]);
        const slotDetails = slotDetailsRows[0];

        const insertReservationSql = `
            INSERT INTO reservations (user_id, field_id, slot_date, start_time, end_time, booking_type)
            VALUES ($1, $2, $3, $4, $5, 'full_field')
        `;
        await client.query(insertReservationSql, [userId, slotDetails.field_id, slotDetails.slot_date, slotDetails.start_time, slotDetails.end_time]);

        await client.query("COMMIT");
        res.json({ message: 'Reservation confirmed successfully!' });
    } catch (err) {
        await client.query("ROLLBACK");
        console.error('Transaction error in /api/reserve:', err);
        return res.status(500).json({ error: 'Failed to complete reservation.' });
    } finally {
        client.release();
    }
});
module.exports = router;
