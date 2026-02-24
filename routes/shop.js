const express = require('express');
const router = express.Router();
const pool = require('../database');

/**
 * API endpoint to get all fashion products.
 */
router.get('/products', async (req, res) => {
    const { category, search } = req.query;
    let sql = `SELECT * FROM fashion_products WHERE 1=1`;
    const params = [];

    if (category && category !== 'الكل') {
        params.push(category);
        sql += ` AND category = $${params.length}`;
    }

    if (search) {
        params.push(`%${search}%`);
        sql += ` AND (name ILIKE $${params.length} OR description ILIKE $${params.length})`;
    }

    sql += ` ORDER BY created_at DESC`;

    try {
        const { rows } = await pool.query(sql, params);
        res.json({ products: rows });
    } catch (err) {
        console.error('Error fetching fashion products:', err);
        res.status(500).json({ error: 'Failed to fetch products' });
    }
});

/**
 * API endpoint to get a single fashion product.
 */
router.get('/products/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const { rows } = await pool.query('SELECT * FROM fashion_products WHERE id = $1', [id]);
        if (rows.length === 0) return res.status(404).json({ error: 'Product not found' });
        res.json({ product: rows[0] });
    } catch (err) {
        console.error('Error fetching product details:', err);
        res.status(500).json({ error: 'Failed to fetch product details' });
    }
});

module.exports = router;
