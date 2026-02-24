const rateLimit = require('express-rate-limit');

/**
 * General API rate limiter.
 */
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
});

/**
 * Limiter for login attempts.
 */
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { error: 'Too many login attempts. Please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
});

/**
 * Limiter for signup attempts.
 */
const signupLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour window
    max: 30, // limit each IP to 30 signups per hour
    message: { error: 'Too many signup attempts. Please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
});

module.exports = {
    apiLimiter,
    loginLimiter,
    signupLimiter
};
