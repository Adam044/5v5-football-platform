const crypto = require('crypto');
const { getCookie } = require('../utils/auth');

/**
 * Issue a CSRF token and set it as a cookie.
 */
function issueCsrfToken(req, res) {
    const token = crypto.randomBytes(16).toString('hex');
    const isProd = process.env.NODE_ENV === 'production';
    res.cookie('csrf_token', token, {
        httpOnly: false,
        secure: isProd,
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 1000 // 1 hour
    });
    return token;
}

/**
 * Middleware to require a valid CSRF token on modifying requests.
 */
function requireCsrf(req, res, next) {
    const method = req.method.toUpperCase();
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return next();
    const headerToken = req.get('X-CSRF-Token') || '';
    const cookieToken = getCookie(req, 'csrf_token') || '';
    if (!headerToken || !cookieToken || headerToken !== cookieToken) {
        return res.status(403).json({ error: 'Invalid CSRF token.' });
    }
    next();
}

module.exports = {
    issueCsrfToken,
    requireCsrf
};
