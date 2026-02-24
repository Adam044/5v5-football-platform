const express = require('express');
const router = express.Router();
const pool = require('../database');
const { requireAuth } = require('../middleware/auth');

/**
 * API endpoint to get all fields.
 */
router.get('/', async (req, res) => {
    const sql = `SELECT * FROM fields`;
    try {
        const { rows } = await pool.query(sql);
        const fieldsWithBase64 = rows.map(field => {
            if (field.image_url) {
                field.image = field.image_url;
            } else if (field.image) {
                field.image = Buffer.from(field.image).toString('base64');
            }
            return field;
        });
        res.json({ fields: fieldsWithBase64 });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

/**
 * API endpoint to get a single field's details.
 */
router.get('/:fieldId', async (req, res) => {
    const { fieldId } = req.params;
    const id = parseInt(String(fieldId), 10);
    if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ error: 'Invalid field id.' });
    }
    const sql = `SELECT * FROM fields WHERE id = $1`;
    try {
        const { rows } = await pool.query(sql, [id]);
        const row = rows[0];

        if (!row) {
            return res.status(404).json({ error: 'Field not found' });
        }
        if (row.image_url) {
            row.image = row.image_url;
        } else if (row.image) {
            row.image = Buffer.from(row.image).toString('base64');
        }
        res.json({ field: row });
    } catch (err) {
        console.error('Error fetching field by id:', err);
        return res.status(500).json({ error: 'Failed to fetch field.' });
    }
});


/**
 * API endpoint to get ratings for a specific field.
 */
router.get('/:fieldId/ratings', async (req, res) => {
    const { fieldId } = req.params;
    const id = parseInt(String(fieldId), 10);
    if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ error: 'Invalid field id.' });
    }
    const sql = `
        SELECT 
            fr.id,
            fr.user_id,
            fr.rating,
            fr.comment,
            fr.created_at,
            u.name AS user_name
        FROM field_ratings fr
        JOIN users u ON fr.user_id = u.id
        WHERE fr.field_id = $1
        ORDER BY fr.created_at DESC
    `;
    const aggSql = `
        SELECT 
            COALESCE(AVG(rating), 0)::numeric(3,1) AS average_rating,
            COUNT(*) AS total_ratings
        FROM field_ratings
        WHERE field_id = $1
    `;
    try {
        const [ratingsResult, aggResult] = await Promise.all([
            pool.query(sql, [id]),
            pool.query(aggSql, [id])
        ]);
        res.json({
            ratings: ratingsResult.rows,
            average_rating: parseFloat(aggResult.rows[0].average_rating),
            total_ratings: parseInt(aggResult.rows[0].total_ratings)
        });
    } catch (err) {
        console.error('Error fetching field ratings:', err);
        return res.status(500).json({ error: 'Failed to fetch ratings.' });
    }
});

/**
 * API endpoint to submit a rating for a field.
 */
router.post('/:fieldId/ratings', requireAuth, async (req, res) => {
    const { fieldId } = req.params;
    const id = parseInt(String(fieldId), 10);
    if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ error: 'Invalid field id.' });
    }
    const userId = req.user.id;
    const { rating, comment } = req.body;
    const ratingInt = parseInt(rating, 10);
    if (!ratingInt || ratingInt < 1 || ratingInt > 5) {
        return res.status(400).json({ error: 'Rating must be between 1 and 5.' });
    }
    try {
        const countRes = await pool.query(
            'SELECT COUNT(*) FROM field_ratings WHERE field_id = $1 AND user_id = $2',
            [id, userId]
        );
        if (parseInt(countRes.rows[0].count, 10) >= 3) {
            return res.status(400).json({ error: 'لقد وصلت للحد الأقصى من التقييمات لهذا الملعب (3 تقييمات).' });
        }
        const sql = `
            INSERT INTO field_ratings (field_id, user_id, rating, comment)
            VALUES ($1, $2, $3, $4)
            RETURNING id
        `;
        await pool.query(sql, [id, userId, ratingInt, comment || null]);
        res.json({ success: true, message: 'تم حفظ تقييمك بنجاح.' });
    } catch (err) {
        console.error('Error saving rating:', err);
        return res.status(500).json({ error: 'Failed to save rating.' });
    }
});

/**
 * API endpoint to delete own rating.
 */
router.delete('/:fieldId/ratings/:ratingId', requireAuth, async (req, res) => {
    const { fieldId, ratingId } = req.params;
    const fid = parseInt(String(fieldId), 10);
    const rid = parseInt(String(ratingId), 10);
    if (!Number.isInteger(fid) || fid <= 0 || !Number.isInteger(rid) || rid <= 0) {
        return res.status(400).json({ error: 'Invalid id.' });
    }
    try {
        const result = await pool.query(
            'DELETE FROM field_ratings WHERE id = $1 AND field_id = $2 AND user_id = $3 RETURNING id',
            [rid, fid, req.user.id]
        );
        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Rating not found or not authorized.' });
        }
        res.json({ success: true });
    } catch (err) {
        console.error('Error deleting rating:', err);
        return res.status(500).json({ error: 'Failed to delete rating.' });
    }
});

module.exports = router;
