/* =============================================
   BookMyCA Smart Attend — OTP Email Server
   Express + Nodemailer backend
   ============================================= */

const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// Serve the frontend files
app.use(express.static(path.join(__dirname)));

// --- Gmail SMTP Config (from environment variables) ---
const SMTP_USER = process.env.SMTP_USER || 'capiyushmittal90@gmail.com';
const SMTP_PASS = process.env.SMTP_PASS || 'lgmdsljuffuenvrw';
const SENDER_NAME = process.env.SENDER_NAME || 'BookMyCA Smart Attend';

const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,              // use STARTTLS
    auth: {
        user: SMTP_USER,
        pass: SMTP_PASS
    },
    tls: {
        rejectUnauthorized: false
    },
    connectionTimeout: 15000,   // 15s connect timeout
    greetingTimeout: 10000,
    socketTimeout: 20000
});

// Verify SMTP connection on startup
transporter.verify((err, success) => {
    if (err) {
        console.error('❌ SMTP connection failed:', err.message);
        console.log('   Check your Gmail App Password and internet connection.');
    } else {
        console.log('✅ SMTP connected — ready to send OTP emails via', SMTP_USER);
    }
});

// --- POST /api/send-otp ---
app.post('/api/send-otp', async (req, res) => {
    const { employeeName, employeeEmail, otp } = req.body;

    if (!employeeName || !employeeEmail || !otp) {
        return res.status(400).json({ success: false, error: 'Missing required fields.' });
    }

    const mailOptions = {
        from: `"${SENDER_NAME}" <${SMTP_USER}>`,
        to: employeeEmail,
        subject: `BookMyCA Smart Attend OTP — ${employeeName}`,
        html: `
            <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 480px; margin: 0 auto; border: 1px solid #e0e6ed; border-radius: 12px; overflow: hidden;">
                <div style="background: linear-gradient(135deg, #0B3C5D, #072a42); padding: 28px 24px; text-align: center;">
                    <h1 style="color: #C8A951; margin: 0; font-size: 22px;">📋 BookMyCA Smart Attend</h1>
                    <p style="color: rgba(255,255,255,0.6); margin: 6px 0 0; font-size: 13px;">Employee Verification Code</p>
                </div>
                <div style="padding: 32px 24px; text-align: center; background: #fff;">
                    <p style="color: #333; font-size: 15px; margin: 0 0 8px;">Hello <strong>${employeeName}</strong>,</p>
                    <p style="color: #666; font-size: 14px; margin: 0 0 24px;">Use the code below to verify your attendance check-in:</p>
                    <div style="background: #F4F7F9; border: 2px dashed #C8A951; border-radius: 10px; padding: 20px; display: inline-block;">
                        <span style="font-size: 36px; font-weight: 800; letter-spacing: 12px; color: #0B3C5D;">${otp}</span>
                    </div>
                    <p style="color: #999; font-size: 12px; margin: 24px 0 0;">Your location &amp; snapshot will be recorded upon verification.</p>
                </div>
                <div style="background: #F4F7F9; padding: 14px; text-align: center; border-top: 1px solid #e8ecf1;">
                    <p style="color: #aaa; font-size: 11px; margin: 0;">This is an automated email from BookMyCA Smart Attend Suite.</p>
                </div>
            </div>
        `
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log(`📧 OTP ${otp} sent to ${employeeEmail} (${employeeName}) — Message ID: ${info.messageId}`);
        res.json({ success: true, message: `OTP sent to ${employeeEmail}` });
    } catch (err) {
        console.error('❌ Email send failed:', err.message);
        res.status(500).json({ success: false, error: 'Failed to send email. Check server logs.' });
    }
});

// --- Start ---
const PORT = process.env.PORT || 3847;
app.listen(PORT, () => {
    console.log(`\n🚀 BookMyCA Smart Attend Server running at http://localhost:${PORT}\n`);
});
