const express = require('express');
const router = express.Router();
const pool = require('../database');
const { requireAuth } = require('../middleware/auth');
const { uploadImageToStorage } = require('../config/supabase');
const sharp = require('sharp');

/**
 * Helper to process and upload image from base64
 */
async function processAndUpload(base64Data, fileName, folder) {
    if (!base64Data) return null;
    try {
        const matches = base64Data.match(/^data:image\/([a-zA-Z0-9.+-]+);base64,(.+)$/);
        if (!matches) return null;
        
        const buf = Buffer.from(matches[2], 'base64');
        const optBuf = await sharp(buf)
            .rotate()
            .resize({ width: 1200, fit: 'inside' })
            .jpeg({ quality: 80 })
            .toBuffer();
            
        return await uploadImageToStorage(optBuf, `${fileName}.jpg`, folder);
    } catch (err) {
        console.error(`Error processing ${fileName}:`, err);
        return null;
    }
}

/**
 * POST /api/spain-camp/apply
 * Submit registration for Spain Camp 2026
 */
router.post('/apply', requireAuth, async (req, res) => {
    const userId = req.user.id;
    const data = req.body;

    try {
        // 0. Check Deadline (15 May 2026)
        const deadline = new Date('2026-05-15T23:59:59');
        if (new Date() > deadline) {
            return res.status(400).json({ 
                error: 'عذراً، انتهى الموعد النهائي للتقديم لمعسكر إسبانيا (15 مايو 2026).' 
            });
        }

        // 1. Verify eligibility (Age < 14)
        const userRes = await pool.query('SELECT birthdate FROM users WHERE id = $1', [userId]);
        const birthdate = userRes.rows[0]?.birthdate;
        
        if (!birthdate) {
            return res.status(400).json({ error: 'يرجى تحديث تاريخ ميلادك في الملف الشخصي أولاً.' });
        }

        const age = Math.floor((new Date() - new Date(birthdate)) / (1000 * 60 * 60 * 24 * 365.25));
        if (age > 14) {
            return res.status(400).json({ 
                error: `عذراً، المعسكر مخصص للأطفال في سن 14 عاماً أو أقل. عمرك المسجل هو ${age} سنة.` 
            });
        }

        // 2. Process Image Uploads
        const playerPassportUrl = await processAndUpload(data.player_passport_image, `player_passport_${userId}`, 'spain_camp');
        const playerPersonalUrl = await processAndUpload(data.player_personal_image, `player_personal_${userId}`, 'spain_camp');
        const parentPassportUrl = await processAndUpload(data.parent_passport_image, `parent_passport_${userId}`, 'spain_camp');

        // 3. Insert into Database
        const sql = `
            INSERT INTO spain_camp_applications (
                user_id, player_full_name, player_dob, player_gender, player_email, player_phone,
                player_id_number, player_passport_number, player_nationality, player_address,
                player_passport_image, player_personal_image,
                parent_full_name, parent_phone, parent_relation, parent_passport_number, parent_passport_image,
                has_chronic_diseases, chronic_diseases_details, takes_regular_medications, regular_medications_details,
                has_allergies, allergies_details, has_health_insurance, health_insurance_details,
                traveled_to_europe, has_schengen_visa, has_valid_passport,
                parent_consent, media_consent, player_signature, parent_signature
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17,
                $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32
            ) RETURNING id
        `;

        const params = [
            userId, data.player_full_name, data.player_dob, data.player_gender, data.player_email, data.player_phone,
            data.player_id_number, data.player_passport_number, data.player_nationality, data.player_address,
            playerPassportUrl, playerPersonalUrl,
            data.parent_full_name, data.parent_phone, data.parent_relation, data.parent_passport_number, parentPassportUrl,
            data.has_chronic_diseases, data.chronic_diseases_details, data.takes_regular_medications, data.regular_medications_details,
            data.has_allergies, data.allergies_details, data.has_health_insurance, data.health_insurance_details,
            data.traveled_to_europe, data.has_schengen_visa, data.has_valid_passport,
            data.parent_consent, data.media_consent, data.player_signature, data.parent_signature
        ];

        const { rows } = await pool.query(sql, params);
        res.status(201).json({ message: 'تم تقديم طلبك بنجاح!', applicationId: rows[0].id });

    } catch (err) {
        console.error('Spain Camp application error:', err);
        res.status(500).json({ error: 'حدث خطأ أثناء تقديم الطلب. يرجى المحاولة لاحقاً.' });
    }
});

/**
 * GET /api/spain-camp/my-application
 * Get current user's application status
 */
router.get('/my-application', requireAuth, async (req, res) => {
    try {
        const { rows } = await pool.query('SELECT * FROM spain_camp_applications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1', [req.user.id]);
        res.json({ application: rows[0] || null });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch application status.' });
    }
});

module.exports = router;
