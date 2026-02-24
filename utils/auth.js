const crypto = require('crypto');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

/**
 * Encode an object or string to base64url format.
 */
function base64urlEncode(obj) {
    const json = typeof obj === 'string' ? obj : JSON.stringify(obj);
    return Buffer.from(json)
        .toString('base64')
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');
}

/**
 * Decode a base64url string.
 */
function base64urlDecode(str) {
    const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
    return Buffer.from(b64, 'base64').toString();
}

/**
 * Sign a token with a payload.
 */
function signToken(payload, ttlSec = TOKEN_TTL_SECONDS) {
    const header = { alg: 'HS256', typ: 'JWT' };
    const exp = Math.floor(Date.now() / 1000) + ttlSec;
    const fullPayload = { ...payload, exp };
    const data = `${base64urlEncode(header)}.${base64urlEncode(fullPayload)}`;
    const signature = crypto
        .createHmac('sha256', JWT_SECRET)
        .update(data)
        .digest('base64')
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');
    return `${data}.${signature}`;
}

/**
 * Verify a token and return the payload if valid.
 */
function verifyToken(token) {
    try {
        const [h, p, s] = token.split('.');
        if (!h || !p || !s) return null;
        const data = `${h}.${p}`;
        const expected = crypto
            .createHmac('sha256', JWT_SECRET)
            .update(data)
            .digest('base64')
            .replace(/=/g, '')
            .replace(/\+/g, '-')
            .replace(/\//g, '_');
        if (s !== expected) return null;
        const payloadStr = base64urlDecode(p);
        const payload = JSON.parse(payloadStr);
        if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
        return payload;
    } catch (e) {
        return null;
    }
}

/**
 * Helper to get a cookie value by name.
 */
function getCookie(req, name) {
    const cookieHeader = req.headers.cookie || '';
    const cookies = cookieHeader.split(';').map(c => c.trim());
    for (const c of cookies) {
        const idx = c.indexOf('=');
        if (idx === -1) continue;
        const key = c.substring(0, idx);
        const val = c.substring(idx + 1);
        if (key === name) return val;
    }
    return null;
}

module.exports = {
    base64urlEncode,
    base64urlDecode,
    signToken,
    verifyToken,
    getCookie,
    JWT_SECRET,
    TOKEN_TTL_SECONDS
};
