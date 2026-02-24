const { verifyToken, getCookie } = require('../utils/auth');

/**
 * Middleware to require user authentication via token.
 */
const requireAuth = (req, res, next) => {
    // Use cookie-parser provided req.cookies
    const token = req.cookies?.auth_token;
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    const payload = verifyToken(token);
    if (!payload) return res.status(401).json({ error: 'Unauthorized' });

    req.user = payload;
    next();
};

/**
 * Middleware to require admin privileges.
 */
const checkAdmin = async (req, res, next) => {
    requireAuth(req, res, () => {
        if (!req.user || !req.user.is_admin) {
            return res.status(403).json({ error: 'Forbidden. Admin access required.' });
        }
        next();
    });
};

/**
 * Middleware to require owner privileges via owner_token.
 */
const checkOwner = (req, res, next) => {
    const token = req.cookies?.owner_token;
    if (!token) {
        return res.status(401).json({ error: 'Unauthorized: Owner access required' });
    }
    const payload = verifyToken(token);
    if (!payload || !payload.isOwner) {
        return res.status(403).json({ error: 'Forbidden: Owner access required' });
    }
    req.owner = payload;
    next();
};

module.exports = {
    requireAuth,
    checkAdmin,
    checkOwner
};
