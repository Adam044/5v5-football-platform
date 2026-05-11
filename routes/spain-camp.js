const express = require('express');
const router = express.Router();
const pool = require('../database');
const { requireAuth } = require('../middleware/auth');
const { uploadFileToStorage } = require('../config/supabase');
const sharp = require('sharp');
const { sendSpainCampConfirmation } = require('../utils/email');

/**
 * Helper to process and upload image or PDF from base64
 */
async function processAndUpload(base64Data, fileName, folder) {
    if (!base64Data) return null;
    try {
        const matches = base64Data.match(/^data:([a-zA-Z0-9.+-]+\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
        if (!matches) return null;
        
        const contentType = matches[1];
        const base64Content = matches[2];
        const buf = Buffer.from(base64Content, 'base64');

        // If it's a PDF, upload directly without processing
        if (contentType === 'application/pdf') {
            const result = await uploadFileToStorage(buf, `${fileName}.pdf`, folder, 'application/pdf');
            if (result.error) throw new Error(result.error);
            return result.url;
        }

        // If it's an image, process with sharp
        if (contentType.startsWith('image/')) {
            const optBuf = await sharp(buf)
                .rotate()
                .resize({ width: 1200, fit: 'inside' })
                .jpeg({ quality: 80 })
                .toBuffer();
                
            const result = await uploadFileToStorage(optBuf, `${fileName}.jpg`, folder, 'image/jpeg');
            if (result.error) throw new Error(result.error);
            return result.url;
        }

        return null;
    } catch (err) {
        console.error(`Error processing ${fileName}:`, err);
        return null;
    }
}

router.get('/my-application', requireAuth, async (req, res) => {
    try {
        const userId = req.user.id;
        const { rows } = await pool.query('SELECT * FROM spain_camp_applications WHERE user_id = $1', [userId]);
        if (rows.length === 0) {
            return res.json({ application: null });
        }
        res.json({ application: rows[0] });
    } catch (err) {
        console.error('Error fetching my spain camp application:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/spain-camp/apply
 * Submit registration for Spain Camp 2026
 */
router.post('/apply', requireAuth, async (req, res) => {
    const userId = req.user.id;
    const data = req.body;

    // Log the received fields for debugging
    console.log(`[Spain Camp] Received application from user ${userId}`);
    const fieldsReceived = Object.keys(data);
    console.log(`[Spain Camp] Fields received: ${fieldsReceived.join(', ')}`);

    try {
        // 0. Validation Checks
        const requiredFields = [
            'player_full_name', 'player_dob', 'player_gender', 'player_email', 'player_phone',
            'player_id_number', 'player_passport_number', 'player_nationality', 'player_address',
            'parent_full_name', 'parent_phone', 'parent_relation', 'parent_passport_number',
            'player_signature', 'parent_signature'
        ];

        for (const field of requiredFields) {
            if (!data[field] || data[field].toString().trim() === '') {
                console.warn(`[Spain Camp] Missing required field: ${field}`);
                return res.status(400).json({ error: `يرجى تعبئة الحقل المطلوب: ${field}` });
            }
        }

        if (!data.player_passport_image || !data.player_personal_image || !data.parent_passport_image) {
            console.warn(`[Spain Camp] Missing one or more images/files`);
            return res.status(400).json({ error: 'يرجى إرفاق كافة الوثائق المطلوبة (صورة الجواز، الصورة الشخصية، وجواز ولي الأمر).' });
        }

        if (!data.parent_consent || !data.media_consent) {
            return res.status(400).json({ error: 'يجب الموافقة على كافة الشروط القانونية للمتابعة.' });
        }

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

        // Check if already applied
        const existingApp = await pool.query('SELECT id FROM spain_camp_applications WHERE user_id = $1', [userId]);
        if (existingApp.rows.length > 0) {
            return res.status(400).json({ error: 'لقد قمت بتقديم طلب مسبقاً لهذا المعسكر.' });
        }

        // 2. Process Image Uploads
        const playerPassportUrl = await processAndUpload(data.player_passport_image, `player_passport_${userId}`, 'spain_camp');
        const playerPersonalUrl = await processAndUpload(data.player_personal_image, `player_personal_${userId}`, 'spain_camp');
        const parentPassportUrl = await processAndUpload(data.parent_passport_image, `parent_passport_${userId}`, 'spain_camp');

        if (!playerPassportUrl || !playerPersonalUrl || !parentPassportUrl) {
            return res.status(400).json({ error: 'فشل في معالجة الصور المرفوعة. يرجى التأكد من أن الصور بصيغة صحيحة (JPG, PNG) ولا تتجاوز الحجم المسموح.' });
        }

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
        
        // 4. Send Confirmation Emails (Async - don't block response)
        // To Player
        sendSpainCampConfirmation(data.player_email, data.player_full_name).catch(err => {
            console.error('[Email] Failed to send player confirmation:', err);
        });

        // To Parent (Optional if they have an email field, or just notify admin if needed)
        // For now, if parent email exists in the data, send it there too. 
        // Based on the data received, we might not have a separate parent_email field yet, 
        // but we can send to the player email and mention it covers both.
        // If you want a separate parent email, we should add it to the form.
        // Assuming we send to the main player email which the parent likely sees too.

        res.status(201).json({ message: 'تم تقديم طلبك بنجاح!', applicationId: rows[0].id });

    } catch (err) {
        console.error('Spain Camp application error:', err);

        // Handle MIME type error from Supabase
        if (err.message && err.message.includes('mime type') && err.message.includes('not supported')) {
            return res.status(400).json({ 
                error: 'خطأ في إعدادات الخادم: نوع الملف PDF غير مدعوم حالياً في المخزن. يرجى تفعيل "application/pdf" في إعدادات Supabase Storage أو التواصل مع المسؤول.' 
            });
        }

        // Provide more detailed error message if database unique constraint fails
        if (err.code === '23505') {
            return res.status(400).json({ error: 'لقد قمت بتقديم طلب مسبقاً لهذا المعسكر.' });
        }
        res.status(500).json({ error: 'حدث خطأ فني أثناء تقديم الطلب. يرجى المحاولة لاحقاً أو التواصل مع الدعم الفني.' });
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
