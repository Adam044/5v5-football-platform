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
 */
router.get('/system-status', checkOwner, async (req, res) => {
    try {
        const status = {
            database: 'connected',
            uptime: process.uptime(),
            environment: process.env.NODE_ENV || 'development',
            timestamp: new Date().toISOString()
        };
        res.json({ success: true, status });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch status' });
    }
});

module.exports = router;
