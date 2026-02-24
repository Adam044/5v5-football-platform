/**
 * Assess password strength based on length, composition, and common patterns.
 */
function assessPasswordStrength(password, { email = '', name = '', phone = '' } = {}) {
    if (typeof password !== 'string') {
        return { ok: false, error: 'كلمة المرور غير صالحة.' };
    }
    const pwd = password.trim();
    const issues = [];

    // Basic composition checks
    if (pwd.length < 8) issues.push('الحد الأدنى للطول هو 8 أحرف.');
    if (!/[A-Z]/.test(pwd)) issues.push('يجب أن تحتوي على حرف كبير واحد على الأقل.');
    if (!/[0-9]/.test(pwd)) issues.push('يجب أن تحتوي على رقم واحد على الأقل.');

    // Common/weak passwords list
    const commonList = ['password', '123456', 'qwerty', '111111', '12345678', 'iloveyou', 'admin', 'letmein', 'football', 'soccer'];
    const lower = pwd.toLowerCase();
    if (commonList.some(c => lower === c || lower.includes(c))) {
        issues.push('كلمة المرور شائعة جداً وغير آمنة.');
    }

    // Personal info checks
    const emailLocal = (email || '').split('@')[0]?.toLowerCase() || '';
    if (emailLocal && lower.includes(emailLocal) && emailLocal.length >= 3) {
        issues.push('يجب ألا تحتوي كلمة المرور على بريدك الإلكتروني.');
    }
    const nameTokens = (name || '').toLowerCase().split(/\s+/).filter(t => t.length >= 3);
    if (nameTokens.some(t => lower.includes(t))) {
        issues.push('يجب ألا تحتوي كلمة المرور على اسمك.');
    }
    const digits = String(phone || '').replace(/\D/g, '');
    if (digits.length >= 6) {
        for (let i = 0; i + 4 <= digits.length; i++) {
            const slice = digits.slice(i, i + 4);
            if (slice && lower.includes(slice)) {
                issues.push('يجب ألا تحتوي كلمة المرور على رقم هاتفك.');
                break;
            }
        }
    }

    if (issues.length > 0) {
        return { ok: false, error: 'كلمة المرور ضعيفة: ' + issues.join(' ') };
    }
    return { ok: true };
}

module.exports = {
    assessPasswordStrength
};
