const nodemailer = require('nodemailer');
const pool = require('../database');

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

/**
 * Wraps content in a professional 5v5 branded template
 */
function wrapInTemplate(content, title = 'إشعار من 5v5 Palestine') {
    return `
        <div dir="rtl" style="font-family: 'Cairo', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; background-color: #f8fafc; padding: 20px;">
            <div style="background-color: #ffffff; border-radius: 24px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.08); border: 1px solid #e2e8f0;">
                <!-- Header -->
                <div style="background-color: #0f172a; padding: 40px 30px; text-align: center; border-bottom: 4px solid #10b981;">
                    <div style="margin-bottom: 20px;">
                        <img src="https://www.5v5games.com/images/logo.jpg" alt="5v5 Logo" style="width: 80px; height: 80px; border-radius: 16px; object-fit: cover; border: 2px solid #1e293b;">
                    </div>
                    <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 900; letter-spacing: -0.5px;">${title}</h1>
                </div>

                <!-- Main Content -->
                <div style="padding: 40px; color: #1e293b; line-height: 1.8; font-size: 16px; text-align: right;">
                    ${content}
                </div>

                <!-- Footer -->
                <div style="background-color: #f1f5f9; padding: 35px 30px; text-align: center; border-top: 1px solid #e2e8f0;">
                    <div style="margin-bottom: 20px;">
                        <p style="margin: 0; color: #0f172a; font-size: 18px; font-weight: 900;">منصة 5ع5 فلسطين</p>
                        <p style="margin: 5px 0 0; color: #10b981; font-size: 13px; font-weight: 700;">المنصة الرياضية الأفضل لحجز الملاعب والبطولات</p>
                    </div>

                    <!-- Social Links -->
                    <div style="margin-bottom: 25px;">
                        <a href="https://www.5v5games.com" style="display: inline-block; background-color: #0f172a; color: #ffffff; text-decoration: none; padding: 10px 20px; border-radius: 12px; font-size: 14px; font-weight: 700; margin: 5px;">
                            الموقع الإلكتروني
                        </a>
                        <a href="https://instagram.com/5v5.ps" style="display: inline-block; background-color: #10b981; color: #ffffff; text-decoration: none; padding: 10px 20px; border-radius: 12px; font-size: 14px; font-weight: 700; margin: 5px;">
                            إنستغرام
                        </a>
                        <a href="https://wa.me/972584615215" style="display: inline-block; background-color: #25d366; color: #ffffff; text-decoration: none; padding: 10px 20px; border-radius: 12px; font-size: 14px; font-weight: 700; margin: 5px;">
                            واتساب
                        </a>
                    </div>

                    <div style="border-top: 1px solid #cbd5e1; padding-top: 20px;">
                        <p style="margin: 0; font-size: 12px; color: #64748b;">© 2026 جميع الحقوق محفوظة لمنصة 5ع5.</p>
                        <p style="margin: 5px 0 0; font-size: 11px; color: #94a3b8;">تم التطوير بواسطة Adam Hawash</p>
                    </div>
                </div>
            </div>
        </div>
    `;
}

/**
 * Send an email using the configured transporter
 */
async function sendEmail({ to, subject, html, text, title, applicationId = null }) {
    try {
        const finalHtml = title ? wrapInTemplate(html, title) : html;
        const info = await transporter.sendMail({
            from: `"5v5 Palestine" <${process.env.EMAIL_USER}>`,
            to,
            subject,
            text: text || '',
            html: finalHtml
        });
        console.log('[Email] Sent:', info.messageId);

        // Log success to DB
        try {
            await pool.query(
                `INSERT INTO email_logs (recipient_email, subject, content, application_id, status) VALUES ($1, $2, $3, $4, $5)`,
                [to, subject, html, applicationId, 'success']
            );
        } catch (dbErr) {
            console.error('[Email] Failed to log success to DB:', dbErr);
        }

        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error('[Email] Error sending email:', error);

        // Log failure to DB
        try {
            await pool.query(
                `INSERT INTO email_logs (recipient_email, subject, content, application_id, status, error_message) VALUES ($1, $2, $3, $4, $5, $6)`,
                [to, subject, html, applicationId, 'failed', error.message]
            );
        } catch (dbErr) {
            console.error('[Email] Failed to log failure to DB:', dbErr);
        }

        return { success: false, error: error.message };
    }
}

/**
 * Send Spain Camp Confirmation Email
 */
async function sendSpainCampConfirmation(email, playerName) {
    const content = `
        <p style="font-size: 18px; color: #1e293b;">مرحباً <strong>${playerName}</strong>،</p>
        <p>لقد استلمنا طلب التحاقك بـ <strong>معسكر إسبانيا 2026</strong> بنجاح! نحن متحمسون جداً لانضمامك إلينا في هذه الرحلة الكروية المميزة.</p>
        
        <div style="background-color: #f0fdf4; border-right: 4px solid #10b981; padding: 20px; margin: 30px 0; border-radius: 0 12px 12px 0;">
            <p style="margin: 0; color: #166534; font-weight: 800;">ما هي الخطوة القادمة؟</p>
            <ul style="margin: 10px 0 0; padding-right: 20px; color: #166534; font-size: 14px;">
                <li>سيقوم فريقنا بمراجعة كافة الوثائق المرفقة (الجواز والصور).</li>
                <li>سيتم التحقق من البيانات الصحية ومعلومات التواصل.</li>
                <li>ستصلك رسالة بريد إلكتروني أخرى فور تحديث حالة طلبك (قبول/مراجعة).</li>
            </ul>
        </div>
        
        <p>بإمكانك دائماً متابعة حالة طلبك من خلال <a href="#" style="color: #10b981; font-weight: 700; text-decoration: underline;">لوحة التحكم الخاصة بك</a> في موقعنا.</p>
        
        <p style="margin-top: 40px; border-top: 1px dashed #e2e8f0; padding-top: 20px; font-style: italic; color: #64748b;">
            مع تحيات فريق إدارة معسكر إسبانيا 2026
        </p>
    `;

    return sendEmail({
        to: email,
        subject: 'تم استلام طلبك لمعسكر إسبانيا 2026 - Spain Camp 🇪🇸',
        html: content,
        title: 'تأكيد استلام الطلب'
    });
}

module.exports = {
    sendEmail,
    sendSpainCampConfirmation
};
