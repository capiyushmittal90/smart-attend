/* =============================================
   BookMyCA Smart Attend — Server v4.0
   MongoDB + JWT Auth + Full REST API
   ============================================= */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const path = require('path');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const multer = require('multer');

// Configure upload directory
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + '-' + file.originalname);
    }
});
const upload = multer({ storage: storage });

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Serve the frontend files
app.use(express.static(path.join(__dirname)));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ============ CONFIG ============
const SMTP_USER = process.env.SMTP_USER || 'capiyushmittal90@gmail.com';
const SMTP_PASS = process.env.SMTP_PASS || 'lgmdsljuffuenvrw';
const SENDER_NAME = process.env.SENDER_NAME || 'BookMyCA Smart Attend';
const JWT_SECRET = process.env.JWT_SECRET || 'smartattend_secret_key_2024';
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/smartattend';

// ============ MONGODB CONNECTION ============
mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ MongoDB connected'))
    .catch(err => console.error('❌ MongoDB connection failed:', err.message));

// ============ MONGOOSE SCHEMAS ============

// --- 16 Official Departments ---
const DEPARTMENTS = [
    'Income Tax & Audit',
    'GST, Return & Audit',
    'Registration Dept Normal',
    'Registration Dept Special',
    'Subsidy Dept',
    'Export Dept',
    'Finance Dept',
    'Company Compliance Dept',
    'Accounting & Collection Dept',
    'Projection, DPR & CMA Dept',
    'Equity Funding & Grant Dept',
    'Legal Dept',
    'Marketing Dept',
    'Management and Research',
    'Notice Dept',
    'Other Working'
];

// --- Admin ---
const adminSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true, lowercase: true },
    password: { type: String, required: true },
    name: { type: String, required: true },
    role: { type: String, enum: ['superadmin', 'admin'], default: 'admin' },
    createdAt: { type: Date, default: Date.now }
});
const Admin = mongoose.model('Admin', adminSchema);

// --- Staff (Employee) ---
const staffSchema = new mongoose.Schema({
    code: { type: String, required: true, unique: true, uppercase: true },
    name: { type: String, required: true },
    dept: { type: String, required: true },
    email: { type: String, required: true, lowercase: true },
    password: { type: String, default: '1234' },
    baseSalary: { type: Number, default: 0 },
    shift: { type: String, default: 'General' },
    active: { type: Boolean, default: true },
    // RBAC fields
    department: { type: [String], default: [] },
    position: { type: String, enum: ['Head', 'Sub Head', 'Co Head', 'Member'], default: 'Member' },
    isTeamAdmin: { type: Boolean, default: false },
    permissions: {
        modules: [{
            name: { type: String },
            read: { type: Boolean, default: false },
            write: { type: Boolean, default: false },
            edit: { type: Boolean, default: false }
        }],
        canAssignTask: { type: Boolean, default: false },
        canUploadOutput: { type: Boolean, default: true }
    },
    createdAt: { type: Date, default: Date.now }
});
const Staff = mongoose.model('Staff', staffSchema);

// --- Department Work List ---
const deptWorkListSchema = new mongoose.Schema({
    department: { type: String, required: true, unique: true },
    workItems: [{ type: String }]
});
const DeptWorkList = mongoose.model('DeptWorkList', deptWorkListSchema);

// --- Password Reset Token ---
const resetTokenSchema = new mongoose.Schema({
    email: { type: String, required: true },
    token: { type: String, required: true },
    type: { type: String, enum: ['admin', 'employee', 'client'], default: 'employee' },
    expiresAt: { type: Date, required: true },
    createdAt: { type: Date, default: Date.now }
});
const PasswordResetToken = mongoose.model('PasswordResetToken', resetTokenSchema);

// --- Attendance Log ---
const logSchema = new mongoose.Schema({
    date: { type: String, required: true },           // DD/MM/YYYY
    time: { type: String, required: true },
    timestamp: { type: Number, required: true },
    type: { type: String, enum: ['IN', 'OUT'], required: true },
    status: { type: String, default: '—' },           // ON TIME, LATE, —
    staffId: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff', required: true },
    code: String,
    name: String,
    department: String,
    location: String,
    coords: { lat: Number, lng: Number },
    ip: String,
    mapUrl: String,
    snapshot: String,                                   // base64 image
    createdAt: { type: Date, default: Date.now }
});
const AttendanceLog = mongoose.model('AttendanceLog', logSchema);

// --- Leave Request ---
const leaveSchema = new mongoose.Schema({
    staffId: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff', required: true },
    staffCode: String,
    staffName: String,
    date: { type: String, required: true },            // DD/MM/YYYY
    leaveType: { type: String, enum: ['full', 'half', 'wfh'], default: 'full' },
    reason: { type: String, default: '' },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    approvedBy: String,
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});
const LeaveRequest = mongoose.model('LeaveRequest', leaveSchema);

// --- Settings ---
const settingsSchema = new mongoose.Schema({
    key: { type: String, default: 'global', unique: true },
    officeStartTime: { type: String, default: '10:00' },
    graceMinutes: { type: Number, default: 15 },
    officeLat: { type: Number, default: 26.892900 },
    officeLng: { type: Number, default: 75.793900 },
    geofenceRadius: { type: Number, default: 500 },
    shifts: [{
        name: { type: String },
        startTime: { type: String },
        endTime: { type: String },
        graceMinutes: { type: Number, default: 15 }
    }],
    holidays: [{
        date: { type: String }, // format YYYY-MM-DD
        name: { type: String }
    }]
});
const Settings = mongoose.model('Settings', settingsSchema);

// --- Template (Checklists, Forms, Agreements) ---
const templateSchema = new mongoose.Schema({
    title: { type: String, required: true },
    type: { type: String, enum: ['checklist', 'form', 'agreement'], default: 'checklist' },
    content: { type: String, default: '' },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});
const Template = mongoose.model('Template', templateSchema);

// --- Employee Todo ---
const todoSchema = new mongoose.Schema({
    title: { type: String, required: true },
    description: { type: String, default: '' },
    dueDate: { type: Date, default: null },
    priority: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
    status: { type: String, enum: ['todo', 'in-progress', 'done'], default: 'todo' },
    isImportant: { type: Boolean, default: false },
    isMyDay: { type: Boolean, default: false },
    list: { type: String, default: 'Work' },
    staffId: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff', required: true },
    staffName: { type: String },
    staffCode: { type: String },
    completedAt: { type: Date, default: null },
    attachments: [{
        _id: { type: mongoose.Schema.Types.ObjectId, default: () => new mongoose.Types.ObjectId() },
        name: { type: String },
        mimeType: { type: String },
        size: { type: Number },
        data: { type: String }, // base64
        uploadedAt: { type: Date, default: Date.now }
    }],
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});
const Todo = mongoose.model('Todo', todoSchema);


// --- File Attachment (Input/Output) ---
const fileSchema = new mongoose.Schema({
    taskId: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', required: true },
    clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true },
    originalName: { type: String, required: true },
    filename: { type: String, required: true },
    path: { type: String, required: true },
    folder: { type: String, enum: ['input', 'output'], required: true }, // 'input' from client, 'output' from staff
    uploadedBy: { type: String }, // 'Client' or specific staff ID
    uploadedByName: { type: String },
    createdAt: { type: Date, default: Date.now }
});
const FileAttachment = mongoose.model('FileAttachment', fileSchema);

// --- Advertisement / Banners ---
const adSchema = new mongoose.Schema({
    imagePath: { type: String, required: true },        // Path to image file
    title: { type: String, default: '' },
    targetClients: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Client' }], // specific clients to target
    createdAt: { type: Date, default: Date.now }
});
const Advertisement = mongoose.model('Advertisement', adSchema);

// --- AI Scraper & Subsidy Engine ---
const subsidySourceSchema = new mongoose.Schema({
    url: { type: String, required: true },
    title: { type: String, default: 'Subsidy Website' },
    lastScraped: { type: Date },
    isActive: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now }
});
const SubsidySource = mongoose.model('SubsidySource', subsidySourceSchema);

const verifiedSubsidySchema = new mongoose.Schema({
    sourceUrl: { type: String },
    subsidyName: { type: String, required: true },
    eligibility: { type: String },
    benefits: { type: String },
    rawScrapedData: { type: String }, // What the scraper found
    verifiedBy: [{ type: String }], // Array of models that verified it (e.g. 'gemini', 'openai', 'claude')
    isPublishedToFB: { type: Boolean, default: false },
    isPublishedToInsta: { type: Boolean, default: false },
    isPublishedToYT: { type: Boolean, default: false },
    isPublishedToWA: { type: Boolean, default: false },
    isPublishedToBlog: { type: Boolean, default: false },
    generatedBrochurePath: { type: String }, // Path to the dynamically built PNG ad
    extractedAt: { type: Date, default: Date.now }
});
const VerifiedSubsidy = mongoose.model('VerifiedSubsidy', verifiedSubsidySchema);


// ============ SEED DEFAULT DATA ============
async function seedDefaults() {
    // Default admin
    const adminCount = await Admin.countDocuments();
    if (adminCount === 0) {
        const hash = await bcrypt.hash('Kittu@123*', 10);
        await Admin.create({
            email: 'capiyushmittal90@gmail.com',
            password: hash,
            name: 'Piyush Mittal',
            role: 'superadmin'
        });
        console.log('🔑 Default superadmin created');
    }
    // Default settings
    const settingsExist = await Settings.findOne({ key: 'global' });
    if (!settingsExist) {
        await Settings.create({
            key: 'global',
            shifts: [
                { name: 'General', startTime: '10:00', endTime: '19:00', graceMinutes: 15 },
                { name: 'Morning', startTime: '07:00', endTime: '15:00', graceMinutes: 10 },
                { name: 'Evening', startTime: '14:00', endTime: '22:00', graceMinutes: 10 }
            ]
        });
        console.log('⚙️ Default settings created');
    }
}
seedDefaults();

// ============ SMTP TRANSPORTER ============
const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
    tls: { rejectUnauthorized: false },
    connectionTimeout: 15000,
    greetingTimeout: 10000,
    socketTimeout: 20000
});

transporter.verify((err) => {
    if (err) {
        console.error('❌ SMTP connection failed:', err.message);
    } else {
        console.log('✅ SMTP connected — ready to send emails via', SMTP_USER);
    }
});

// ============ OTP STORE (in-memory) ============
const otpStore = new Map(); // email -> { otp, expires, staffId }

// ============ JWT MIDDLEWARE ============
function authMiddleware(requiredRole) {
    return (req, res, next) => {
        let token = req.headers.authorization?.split(' ')[1];
        if (!token && req.query.token) token = req.query.token;
        if (!token) return res.status(401).json({ error: 'No token provided' });
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            if (requiredRole && decoded.role !== requiredRole && decoded.role !== 'superadmin') {
                // Allow superadmin for admin routes, and any auth for employee routes
                if (requiredRole === 'admin' && decoded.role !== 'admin') {
                    return res.status(403).json({ error: 'Insufficient permissions' });
                }
            }
            req.user = decoded;
            next();
        } catch (err) {
            return res.status(401).json({ error: 'Invalid token' });
        }
    };
}

const adminAuth = authMiddleware('admin');
const anyAuth = authMiddleware(null);

// ============ AUTH ROUTES ============

// Admin Login
app.post('/api/auth/admin-login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    const admin = await Admin.findOne({ email: email.toLowerCase() });
    if (!admin) return res.status(401).json({ error: 'Invalid credentials' });

    const valid = await bcrypt.compare(password, admin.password);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign(
        { id: admin._id, email: admin.email, name: admin.name, role: admin.role, type: 'admin' },
        JWT_SECRET, { expiresIn: '12h' }
    );
    res.json({ success: true, token, admin: { name: admin.name, email: admin.email, role: admin.role } });
});

// Employee Login — Password based
app.post('/api/auth/employee-login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    const staff = await Staff.findOne({ email: email.toLowerCase(), active: true });
    if (!staff) return res.status(404).json({ error: 'Employee not found. Contact admin.' });

    // Fallback to '1234' if the database document was created before the password field existed
    const validPassword = staff.password || '1234';
    if (password !== validPassword) {
        return res.status(401).json({ error: 'Invalid password' });
    }

    const token = jwt.sign(
        { id: staff._id, code: staff.code, name: staff.name, email: staff.email, dept: staff.dept, departments: staff.department, shift: staff.shift, type: 'employee' },
        JWT_SECRET, { expiresIn: '12h' }
    );
    // Include permissions so front-end can enforce RBAC immediately
    const perms = staff.permissions || { modules: [], canAssignTask: false, canUploadOutput: true };
    res.json({
        success: true,
        token,
        employee: {
            id: staff._id,
            code: staff.code,
            name: staff.name,
            email: staff.email,
            dept: staff.dept,
            departments: staff.department,
            shift: staff.shift,
            isTeamAdmin: staff.isTeamAdmin || false,
            position: staff.position || 'Member',
            permissions: perms
        }
    });
});

// Employee: get own profile + permissions (for re-fetching after login)
app.get('/api/auth/my-permissions', anyAuth, async (req, res) => {
    try {
        if (req.user.type !== 'employee') {
            // Admins/superadmins have full permissions
            return res.json({ success: true, permissions: { modules: [], canAssignTask: true, canUploadOutput: true }, isAdmin: true });
        }
        const staff = await Staff.findById(req.user.id).select('permissions isTeamAdmin position');
        if (!staff) return res.status(404).json({ error: 'Employee not found' });
        res.json({ success: true, permissions: staff.permissions || { modules: [], canAssignTask: false, canUploadOutput: true }, isTeamAdmin: staff.isTeamAdmin, position: staff.position });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Client Login — Password based
app.post('/api/auth/client-login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    const client = await Client.findOne({ $or: [{email: email.toLowerCase()}, {phone: email}], isActive: true });
    if (!client) return res.status(404).json({ error: 'Client not found or inactive.' });

    const validPassword = client.password || '123456';
    if (password !== validPassword) {
        return res.status(401).json({ error: 'Invalid password' });
    }

    const token = jwt.sign(
        { id: client._id, clientCode: client.clientCode, name: client.clientName, email: client.email, phone: client.phone, type: 'client' },
        JWT_SECRET, { expiresIn: '7d' }
    );
    res.json({ success: true, token, client: { id: client._id, name: client.clientName, email: client.email, phone: client.phone } });
});

// Admin Magic Login as Client
app.get('/api/auth/admin-proxy-login/:clientId', adminAuth, async (req, res) => {
    const client = await Client.findById(req.params.clientId);
    if (!client) return res.status(404).json({ error: 'Client not found' });

    // Generate a temporary client token but mark it as proxy so we can log auditing later if needed
    const proxyToken = jwt.sign(
        { id: client._id, clientCode: client.clientCode, name: client.clientName, type: 'client', isProxy: true, adminId: req.user.id },
        JWT_SECRET, { expiresIn: '1h' }
    );
    res.json({ success: true, token: proxyToken });
});

// ============ FORGOT PASSWORD ============

app.post('/api/auth/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ error: 'Email is required' });
        const emailLower = email.toLowerCase();

        // Find the user in any collection
        let userType = '', userName = '';
        const admin = await Admin.findOne({ email: emailLower });
        if (admin) { userType = 'admin'; userName = admin.name; }
        if (!userType) {
            const staff = await Staff.findOne({ email: emailLower, active: true });
            if (staff) { userType = 'employee'; userName = staff.name; }
        }
        if (!userType) {
            const client = await Client.findOne({ $or: [{ email: emailLower }, { phone: email }], isActive: true });
            if (client) { userType = 'client'; userName = client.clientName; }
        }
        if (!userType) return res.status(404).json({ error: 'No account found with this email' });

        // Role Verification (Only for Super Admin)
        if (userType !== 'admin' && userType !== 'superadmin') {
            return res.status(403).json({ 
                error: 'Password reset denied. Please contact the Super Admin to reset your password.' 
            });
        }

        // Generate 6-digit OTP
        const otp = String(Math.floor(100000 + Math.random() * 900000));
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 min

        // Remove any old tokens for this email
        await PasswordResetToken.deleteMany({ email: emailLower });
        await PasswordResetToken.create({ email: emailLower, token: otp, type: userType, expiresAt });

        // Send email
        await transporter.sendMail({
            from: `"${SENDER_NAME}" <${SMTP_USER}>`,
            to: emailLower,
            subject: 'BookMyCA — Password Reset OTP',
            html: `<div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;padding:20px;">
                <h2 style="color:#0F172A;text-align:center;">🔐 Password Reset</h2>
                <p>Hello <strong>${userName}</strong>,</p>
                <p>Your One-Time Password for resetting your BookMyCA account password is:</p>
                <div style="text-align:center;margin:24px 0;">
                    <span style="display:inline-block;background:#0F172A;color:#38BDF8;padding:16px 32px;border-radius:12px;font-size:28px;letter-spacing:8px;font-weight:700;">${otp}</span>
                </div>
                <p style="color:#666;font-size:13px;">This OTP expires in <strong>10 minutes</strong>. If you didn't request this, please ignore this email.</p>
                <hr style="border-color:#E2E8F0;">
                <p style="color:#999;font-size:11px;text-align:center;">BookMyCA Smart Attend Suite</p>
            </div>`
        });

        res.json({ success: true, message: 'OTP sent to your email', userType });
    } catch (err) {
        console.error('Forgot password error:', err);
        res.status(500).json({ error: 'Failed to send OTP: ' + err.message });
    }
});

app.post('/api/auth/reset-password', async (req, res) => {
    try {
        const { email, otp, newPassword } = req.body;
        if (!email || !otp || !newPassword) return res.status(400).json({ error: 'Email, OTP and new password are required' });
        if (newPassword.length < 4) return res.status(400).json({ error: 'Password must be at least 4 characters' });

        const emailLower = email.toLowerCase();
        const tokenDoc = await PasswordResetToken.findOne({ email: emailLower, token: otp });
        if (!tokenDoc) return res.status(400).json({ error: 'Invalid OTP' });
        if (tokenDoc.expiresAt < new Date()) {
            await PasswordResetToken.deleteMany({ email: emailLower });
            return res.status(400).json({ error: 'OTP has expired. Please request again.' });
        }

        // Update password based on user type
        if (tokenDoc.type === 'admin') {
            const hash = await bcrypt.hash(newPassword, 10);
            await Admin.updateOne({ email: emailLower }, { password: hash });
        } else if (tokenDoc.type === 'employee') {
            await Staff.updateOne({ email: emailLower }, { password: newPassword });
        } else if (tokenDoc.type === 'client') {
            await Client.updateOne({ email: emailLower }, { password: newPassword });
        }

        // Cleanup
        await PasswordResetToken.deleteMany({ email: emailLower });
        res.json({ success: true, message: 'Password has been reset successfully!' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to reset password: ' + err.message });
    }
});

// ============ SUPER ADMIN PANEL (superadmin only) ============

function superadminAuth(req, res, next) {
    let token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded.role !== 'superadmin') return res.status(403).json({ error: 'Superadmin access only' });
        req.user = decoded;
        next();
    } catch (e) { return res.status(401).json({ error: 'Invalid token' }); }
}

// Get departments list
app.get('/api/departments', anyAuth, (req, res) => {
    res.json({ success: true, departments: DEPARTMENTS });
});

// Get all employees with RBAC data (superadmin only)
app.get('/api/superadmin/employees', superadminAuth, async (req, res) => {
    try {
        const staff = await Staff.find({ active: true }).sort({ name: 1 });
        res.json({ success: true, employees: staff });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update employee access (department, position, permissions)
app.put('/api/superadmin/employee/:id/access', superadminAuth, async (req, res) => {
    try {
        const { department, position, isTeamAdmin, permissions } = req.body;
        const update = {};
        if (department !== undefined) {
            update.department = Array.isArray(department) ? department : [department].filter(Boolean);
            update.dept = update.department[0] || '';
        }
        if (position !== undefined) update.position = position;
        if (isTeamAdmin !== undefined) update.isTeamAdmin = isTeamAdmin;
        if (permissions !== undefined) update.permissions = permissions;

        const staff = await Staff.findByIdAndUpdate(req.params.id, update, { new: true });
        if (!staff) return res.status(404).json({ error: 'Employee not found' });
        res.json({ success: true, employee: staff });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Bulk update all employees' access
app.put('/api/superadmin/employees/bulk-access', superadminAuth, async (req, res) => {
    try {
        const { updates } = req.body; // Array of { id, department, position, isTeamAdmin, permissions }
        if (!updates || !Array.isArray(updates)) return res.status(400).json({ error: 'Invalid data' });

        let updated = 0;
        for (const u of updates) {
            const upd = {};
            if (u.department !== undefined) {
                upd.department = Array.isArray(u.department) ? u.department : [u.department].filter(Boolean);
                upd.dept = upd.department[0] || '';
            }
            if (u.position !== undefined) upd.position = u.position;
            if (u.isTeamAdmin !== undefined) upd.isTeamAdmin = u.isTeamAdmin;
            if (u.permissions !== undefined) upd.permissions = u.permissions;
            await Staff.findByIdAndUpdate(u.id, upd);
            updated++;
        }
        res.json({ success: true, updated });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get dept work lists
app.get('/api/superadmin/dept-work', superadminAuth, async (req, res) => {
    try {
        const lists = await DeptWorkList.find().sort({ department: 1 });
        res.json({ success: true, lists });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get work items for a specific dept (any auth)
app.get('/api/dept-work/:dept', anyAuth, async (req, res) => {
    try {
        const doc = await DeptWorkList.findOne({ department: req.params.dept });
        res.json({ success: true, workItems: doc ? doc.workItems : [] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update dept work list
app.put('/api/superadmin/dept-work/:dept', superadminAuth, async (req, res) => {
    try {
        const { workItems } = req.body;
        const doc = await DeptWorkList.findOneAndUpdate(
            { department: req.params.dept },
            { department: req.params.dept, workItems: workItems || [] },
            { new: true, upsert: true }
        );
        res.json({ success: true, list: doc });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============ STAFF ROUTES (Admin only) ============

app.get('/api/staff', adminAuth, async (req, res) => {
    const staff = await Staff.find({ active: true }).sort({ createdAt: -1 });
    res.json(staff);
});

app.post('/api/staff', adminAuth, async (req, res) => {
    const { code, name, dept, email, shift, password, baseSalary } = req.body;
    if (!code || !name || !dept || !email) return res.status(400).json({ error: 'All fields required' });
    const exists = await Staff.findOne({ code: code.toUpperCase() });
    if (exists) return res.status(409).json({ error: 'Employee code already exists' });
    const staff = await Staff.create({ 
        code: code.toUpperCase(), 
        name, 
        dept, 
        email: email.toLowerCase(), 
        shift: shift || 'General',
        password: password || '1234',
        baseSalary: Number(baseSalary) || 0
    });
    res.json({ success: true, staff });
});

app.post('/api/staff/bulk', adminAuth, async (req, res) => {
    const { employees } = req.body;
    if (!employees || !Array.isArray(employees)) return res.status(400).json({ error: 'Invalid data' });
    let added = 0, skipped = 0, errors = 0;
    for (const emp of employees) {
        if (!emp.code || !emp.name || !emp.dept || !emp.email) { errors++; continue; }
        const exists = await Staff.findOne({ code: emp.code.toUpperCase() });
        if (exists) { skipped++; continue; }
        await Staff.create({ code: emp.code.toUpperCase(), name: emp.name, dept: emp.dept, email: emp.email.toLowerCase(), shift: emp.shift || 'General' });
        added++;
    }
    res.json({ success: true, added, skipped, errors });
});

app.put('/api/staff/:id', adminAuth, async (req, res) => {
    const { name, dept, email, shift, baseSalary } = req.body;
    const staff = await Staff.findByIdAndUpdate(req.params.id, { 
        name, 
        dept, 
        email: email?.toLowerCase(), 
        shift,
        baseSalary: Number(baseSalary) || 0
    }, { new: true });
    if (!staff) return res.status(404).json({ error: 'Employee not found' });
    res.json({ success: true, staff });
});

app.delete('/api/staff/:id', adminAuth, async (req, res) => {
    await Staff.findByIdAndUpdate(req.params.id, { active: false });
    res.json({ success: true });
});

app.post('/api/staff/bulk/delete', adminAuth, async (req, res) => {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids)) return res.status(400).json({ error: 'IDs required' });
    await Staff.updateMany({ _id: { $in: ids } }, { active: false });
    res.json({ success: true, count: ids.length });
});

// ============ ATTENDANCE ROUTES ============

// Check-In
app.post('/api/attendance/checkin', anyAuth, async (req, res) => {
    const { location, coords, ip, mapUrl, snapshot } = req.body;
    const user = req.user;

    // Get staff info
    const staff = await Staff.findById(user.id);
    if (!staff) return res.status(404).json({ error: 'Employee not found' });

    const now = new Date();
    const IST = { timeZone: 'Asia/Kolkata' };
    const todayStr = now.toLocaleDateString('en-IN', { ...IST, day: '2-digit', month: '2-digit', year: 'numeric' });
    const timeStr = now.toLocaleTimeString('en-IN', { ...IST, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });

    // Check if already checked in today
    const existing = await AttendanceLog.findOne({ staffId: staff._id, date: todayStr, type: 'IN' });
    if (existing) return res.status(409).json({ error: `Already checked in today at ${existing.time}` });

    // Get settings for late detection
    const settings = await Settings.findOne({ key: 'global' });
    let status = 'ON TIME';
    if (settings) {
        // Find shift-specific settings
        const empShift = settings.shifts?.find(s => s.name === staff.shift) || settings.shifts?.[0];
        const startTime = empShift ? empShift.startTime : settings.officeStartTime;
        const grace = empShift ? empShift.graceMinutes : settings.graceMinutes;

        // Get current IST time for late detection
        const [h, m] = startTime.split(':').map(Number);
        // Build cutoff as milliseconds in IST
        const nowIST = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
        const cutoff = new Date(nowIST);
        cutoff.setHours(h, m + grace, 0, 0);
        if (nowIST > cutoff) status = 'LATE';
    }

    const log = await AttendanceLog.create({
        date: todayStr,
        time: timeStr,
        timestamp: now.getTime(),
        type: 'IN',
        status,
        staffId: staff._id,
        code: staff.code,
        name: staff.name,
        department: staff.dept,
        location, coords, ip, mapUrl, snapshot
    });

    // Send late alert to admin if LATE
    if (status === 'LATE') {
        sendLateAlert(staff, timeStr, todayStr, settings);
    }

    res.json({ success: true, log: { ...log.toObject(), snapshot: undefined }, status });
});

// Check-Out
app.post('/api/attendance/checkout', anyAuth, async (req, res) => {
    const { location, coords, ip, mapUrl, snapshot } = req.body;
    const user = req.user;

    const staff = await Staff.findById(user.id);
    if (!staff) return res.status(404).json({ error: 'Employee not found' });

    const now = new Date();
    const IST = { timeZone: 'Asia/Kolkata' };
    const todayStr = now.toLocaleDateString('en-IN', { ...IST, day: '2-digit', month: '2-digit', year: 'numeric' });
    const timeStr = now.toLocaleTimeString('en-IN', { ...IST, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });

    // Check if checked in today
    const checkin = await AttendanceLog.findOne({ staffId: staff._id, date: todayStr, type: 'IN' });
    if (!checkin) return res.status(400).json({ error: 'No check-in found for today. Please check in first.' });

    // Check if already checked out
    const existingOut = await AttendanceLog.findOne({ staffId: staff._id, date: todayStr, type: 'OUT' });
    if (existingOut) return res.status(409).json({ error: `Already checked out today at ${existingOut.time}` });

    // Calculate working hours
    const diff = now.getTime() - checkin.timestamp;
    const hours = Math.floor(diff / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    const workingHours = `${hours}h ${mins}m`;

    const log = await AttendanceLog.create({
        date: todayStr,
        time: timeStr,
        timestamp: now.getTime(),
        type: 'OUT',
        status: workingHours,
        staffId: staff._id,
        code: staff.code,
        name: staff.name,
        department: staff.dept,
        location, coords, ip, mapUrl, snapshot
    });

    res.json({ success: true, log: { ...log.toObject(), snapshot: undefined }, workingHours, checkinTime: checkin.time });
});

// Get Logs (with filters)
app.get('/api/attendance/logs', adminAuth, async (req, res) => {
    const { from, to, employee, dept, status, type, page = 1, limit = 50 } = req.query;
    const filter = {};

    if (from || to) {
        // Convert DD/MM/YYYY strings for date range comparison
        if (from) filter.date = { ...(filter.date || {}), $gte: from };
        if (to) filter.date = { ...(filter.date || {}), $lte: to };
    }
    if (employee) filter.staffId = employee;
    if (dept) filter.department = dept;
    if (status && status !== 'all') filter.status = status;
    if (type && type !== 'all') filter.type = type;

    const total = await AttendanceLog.countDocuments(filter);
    const logs = await AttendanceLog.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(parseInt(limit));

    res.json({ logs, total, page: parseInt(page), pages: Math.ceil(total / limit) });
});

// Get single log with snapshot
app.get('/api/attendance/logs/:id', adminAuth, async (req, res) => {
    const log = await AttendanceLog.findById(req.params.id);
    if (!log) return res.status(404).json({ error: 'Log not found' });
    res.json(log);
});

// Get employee's own logs
app.get('/api/attendance/my-logs', anyAuth, async (req, res) => {
    const logs = await AttendanceLog.find({ staffId: req.user.id })
        .sort({ createdAt: -1 })
        .limit(50);
    res.json(logs);
});

// Dashboard Stats
app.get('/api/attendance/dashboard', adminAuth, async (req, res) => {
    const now = new Date();
    const IST = { timeZone: 'Asia/Kolkata' };
    const todayStr = now.toLocaleDateString('en-IN', { ...IST, day: '2-digit', month: '2-digit', year: 'numeric' });

    const totalStaff = await Staff.countDocuments({ active: true });
    const todayLogs = await AttendanceLog.find({ date: todayStr });
    const todayCheckins = todayLogs.filter(l => l.type === 'IN');
    const todayCheckouts = todayLogs.filter(l => l.type === 'OUT');
    const lateTodayCount = todayCheckins.filter(l => l.status === 'LATE').length;
    const onTimeCount = todayCheckins.filter(l => l.status === 'ON TIME').length;
    const presentToday = todayCheckins.length;
    const absentToday = totalStaff - presentToday;

    // Leaves today
    const leavesToday = await LeaveRequest.countDocuments({ date: todayStr, status: 'approved' });

    // Weekly data (last 7 days)
    const weeklyData = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const IST = { timeZone: 'Asia/Kolkata' };
        const dStr = d.toLocaleDateString('en-IN', { ...IST, day: '2-digit', month: '2-digit', year: 'numeric' });
        const dayLogs = await AttendanceLog.find({ date: dStr, type: 'IN' });
        weeklyData.push({
            date: dStr,
            label: d.toLocaleDateString('en-IN', { ...IST, weekday: 'short', day: '2-digit', month: 'short' }),
            present: dayLogs.length,
            late: dayLogs.filter(l => l.status === 'LATE').length,
            onTime: dayLogs.filter(l => l.status === 'ON TIME').length
        });
    }

    // Department breakdown
    const deptBreakdown = await AttendanceLog.aggregate([
        { $match: { date: todayStr, type: 'IN' } },
        { $group: { _id: '$department', count: { $sum: 1 } } }
    ]);

    // Top 5 late employees this month
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const IST2 = { timeZone: 'Asia/Kolkata' };
    const monthStartStr = monthStart.toLocaleDateString('en-IN', { ...IST2, day: '2-digit', month: '2-digit', year: 'numeric' });
    const topLate = await AttendanceLog.aggregate([
        { $match: { status: 'LATE', type: 'IN' } },
        { $group: { _id: { code: '$code', name: '$name' }, count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 5 }
    ]);

    // Average working hours today
    let avgHours = 0;
    if (todayCheckouts.length > 0) {
        const checkinMap = {};
        todayCheckins.forEach(l => { checkinMap[l.code] = l.timestamp; });
        let totalMs = 0, count = 0;
        todayCheckouts.forEach(l => {
            if (checkinMap[l.code]) {
                totalMs += l.timestamp - checkinMap[l.code];
                count++;
            }
        });
        if (count > 0) avgHours = (totalMs / count / 3600000).toFixed(1);
    }

    // Absent employees list (name + dept)
    const allStaff = await Staff.find({ active: true }).select('code name dept shift email');
    const checkedInCodes = new Set(todayCheckins.map(l => l.code));
    const approvedLeaveIds = await LeaveRequest.find({ date: todayStr, status: 'approved' }).select('staffId');
    const leaveStaffIds = new Set(approvedLeaveIds.map(l => l.staffId.toString()));

    const absentList = allStaff.filter(s => !checkedInCodes.has(s.code)).map(s => ({
        code: s.code,
        name: s.name,
        dept: s.dept,
        shift: s.shift,
        onLeave: leaveStaffIds.has(s._id.toString())
    }));

    res.json({
        totalStaff, presentToday, absentToday: absentToday - leavesToday,
        lateTodayCount, onTimeCount, leavesToday, avgHours,
        weeklyData, deptBreakdown, topLate, absentList,
        totalLogs: await AttendanceLog.countDocuments(),
        pendingLeaves: await LeaveRequest.countDocuments({ status: 'pending' })
    });
});

// ============ LEAVE ROUTES ============

// Employee request leave
app.post('/api/leave/request', anyAuth, async (req, res) => {
    const { date, leaveType, reason } = req.body;
    if (!date) return res.status(400).json({ error: 'Date required' });

    const staff = await Staff.findById(req.user.id);
    if (!staff) return res.status(404).json({ error: 'Employee not found' });

    const existing = await LeaveRequest.findOne({ staffId: staff._id, date });
    if (existing) return res.status(409).json({ error: 'Leave already requested for this date' });

    const leave = await LeaveRequest.create({
        staffId: staff._id,
        staffCode: staff.code,
        staffName: staff.name,
        date,
        leaveType: leaveType || 'full',
        reason: reason || ''
    });
    res.json({ success: true, leave });
});

// Get employee's own leaves
app.get('/api/leave/my-leaves', anyAuth, async (req, res) => {
    const leaves = await LeaveRequest.find({ staffId: req.user.id }).sort({ createdAt: -1 });
    res.json(leaves);
});

// Admin: list all leave requests
app.get('/api/leave/list', adminAuth, async (req, res) => {
    const { status: filterStatus } = req.query;
    const filter = {};
    if (filterStatus && filterStatus !== 'all') filter.status = filterStatus;
    const leaves = await LeaveRequest.find(filter).sort({ createdAt: -1 });
    res.json(leaves);
});

// Admin: approve/reject leave
app.put('/api/leave/:id', adminAuth, async (req, res) => {
    const { status } = req.body; // 'approved' or 'rejected'
    if (!['approved', 'rejected'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
    const leave = await LeaveRequest.findByIdAndUpdate(
        req.params.id,
        { status, approvedBy: req.user.name, updatedAt: Date.now() },
        { new: true }
    );
    if (!leave) return res.status(404).json({ error: 'Leave request not found' });
    res.json({ success: true, leave });
});

// ============ SETTINGS ROUTES ============

app.get('/api/settings', adminAuth, async (req, res) => {
    let settings = await Settings.findOne({ key: 'global' });
    if (!settings) {
        settings = await Settings.create({ key: 'global' });
    }
    res.json(settings);
});

app.put('/api/settings', adminAuth, async (req, res) => {
    const { officeStartTime, graceMinutes, officeLat, officeLng, geofenceRadius, shifts } = req.body;
    const settings = await Settings.findOneAndUpdate(
        { key: 'global' },
        { officeStartTime, graceMinutes, officeLat, officeLng, geofenceRadius, shifts },
        { new: true, upsert: true }
    );
    res.json({ success: true, settings });
});

// ============ ADMIN MANAGEMENT (Superadmin) ============

app.get('/api/admin/list', adminAuth, async (req, res) => {
    if (req.user.role !== 'superadmin') return res.status(403).json({ error: 'Superadmin only' });
    const admins = await Admin.find().select('-password');
    res.json(admins);
});

app.post('/api/admin/add', adminAuth, async (req, res) => {
    if (req.user.role !== 'superadmin') return res.status(403).json({ error: 'Superadmin only' });
    const { email, password, name, role } = req.body;
    if (!email || !password || !name) return res.status(400).json({ error: 'All fields required' });
    const exists = await Admin.findOne({ email: email.toLowerCase() });
    if (exists) return res.status(409).json({ error: 'Admin with this email already exists' });
    const hash = await bcrypt.hash(password, 10);
    const admin = await Admin.create({ email: email.toLowerCase(), password: hash, name, role: role || 'admin' });
    res.json({ success: true, admin: { _id: admin._id, email: admin.email, name: admin.name, role: admin.role } });
});

app.delete('/api/admin/:id', adminAuth, async (req, res) => {
    if (req.user.role !== 'superadmin') return res.status(403).json({ error: 'Superadmin only' });
    const admin = await Admin.findById(req.params.id);
    if (!admin) return res.status(404).json({ error: 'Admin not found' });
    if (admin.role === 'superadmin') return res.status(400).json({ error: 'Cannot delete superadmin' });
    await Admin.findByIdAndDelete(req.params.id);
    res.json({ success: true });
});

// ============ PAYROLL EXPORT ============

app.get('/api/export/payroll', adminAuth, async (req, res) => {
    const { month, year } = req.query; // MM, YYYY
    if (!month || !year) return res.status(400).json({ error: 'Month and year required' });

    const staff = await Staff.find({ active: true });
    const payrollData = [];

    for (const emp of staff) {
        // Get all logs for this month
        const logs = await AttendanceLog.find({
            code: emp.code,
            date: { $regex: `/${String(month).padStart(2, '0')}/${year}$` }
        });

        const checkins = logs.filter(l => l.type === 'IN');
        const checkouts = logs.filter(l => l.type === 'OUT');
        const lateDays = checkins.filter(l => l.status === 'LATE').length;

        // Calculate total working hours
        let totalMs = 0;
        const checkinMap = {};
        checkins.forEach(l => { checkinMap[l.date] = l.timestamp; });
        checkouts.forEach(l => {
            if (checkinMap[l.date]) totalMs += l.timestamp - checkinMap[l.date];
        });
        const totalHours = (totalMs / 3600000).toFixed(1);

        // Leaves
        const leaves = await LeaveRequest.countDocuments({
            staffId: emp._id,
            status: 'approved',
            date: { $regex: `/${String(month).padStart(2, '0')}/${year}$` }
        });

        payrollData.push({
            code: emp.code,
            name: emp.name,
            department: emp.dept,
            shift: emp.shift,
            totalPresent: checkins.length,
            lateDays,
            totalHours,
            leaveDays: leaves
        });
    }

    // Generate CSV
    const headers = 'Employee Code,Name,Department,Shift,Days Present,Late Days,Total Hours,Leave Days\n';
    const rows = payrollData.map(p =>
        `${p.code},${p.name},${p.department},${p.shift},${p.totalPresent},${p.lateDays},${p.totalHours},${p.leaveDays}`
    ).join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=payroll_${month}_${year}.csv`);
    res.send(headers + rows);
});

// ============ LATE ALERT EMAIL ============

async function sendLateAlert(staff, time, date, settings) {
    try {
        const admins = await Admin.find();
        const adminEmails = admins.map(a => a.email).join(',');
        if (!adminEmails) return;

        await transporter.sendMail({
            from: `"${SENDER_NAME}" <${SMTP_USER}>`,
            to: adminEmails,
            subject: `⚠️ Late Arrival — ${staff.name} (${staff.code})`,
            html: `
                <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 480px; margin: 0 auto; border: 1px solid #e0e6ed; border-radius: 12px; overflow: hidden;">
                    <div style="background: linear-gradient(135deg, #e74c3c, #c0392b); padding: 24px; text-align: center;">
                        <h1 style="color: #fff; margin: 0; font-size: 20px;">⚠️ Late Arrival Alert</h1>
                    </div>
                    <div style="padding: 24px; background: #fff;">
                        <p><strong>Employee:</strong> ${staff.name} (${staff.code})</p>
                        <p><strong>Department:</strong> ${staff.dept}</p>
                        <p><strong>Check-In Time:</strong> ${time}</p>
                        <p><strong>Date:</strong> ${date}</p>
                        <p><strong>Shift:</strong> ${staff.shift || 'General'}</p>
                    </div>
                    <div style="background: #f8f9fa; padding: 12px; text-align: center;">
                        <p style="color: #999; font-size: 11px; margin: 0;">BookMyCA Smart Attend — Automated Alert</p>
                    </div>
                </div>`
        });
        console.log(`⚠️ Late alert sent for ${staff.name}`);
    } catch (err) {
        console.error('Late alert email failed:', err.message);
    }
}

// ============ LEGACY OTP ROUTE (backward compat) ============
app.post('/api/send-otp', async (req, res) => {
    const { employeeName, employeeEmail, otp } = req.body;
    if (!employeeName || !employeeEmail || !otp) {
        return res.status(400).json({ success: false, error: 'Missing required fields.' });
    }
    try {
        await transporter.sendMail({
            from: `"${SENDER_NAME}" <${SMTP_USER}>`,
            to: employeeEmail,
            subject: `BookMyCA Smart Attend OTP — ${employeeName}`,
            html: `<div style="font-family: 'Segoe UI', Arial, sans-serif; text-align:center; padding:40px;">
                <h2 style="color:#0B3C5D;">Your OTP: <span style="color:#C8A951; letter-spacing:8px;">${otp}</span></h2>
            </div>`
        });
        res.json({ success: true, message: `OTP sent to ${employeeEmail}` });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Failed to send email.' });
    }
});

// ============ SETTINGS (HOLIDAYS) ============
app.post('/api/settings/holidays', adminAuth, async (req, res) => {
    const { date, name } = req.body;
    if (!date || !name) return res.status(400).json({ error: 'Date and Name required' });
    let settings = await Settings.findOne({ key: 'global' });
    if (!settings) settings = await Settings.create({ key: 'global' });
    
    if (!settings.holidays) settings.holidays = [];
    if (!settings.holidays.find(h => h.date === date)) {
        settings.holidays.push({ date, name });
        await settings.save();
    }
    res.json({ success: true, holidays: settings.holidays });
});

app.delete('/api/settings/holidays/:date', adminAuth, async (req, res) => {
    let settings = await Settings.findOne({ key: 'global' });
    if (settings && settings.holidays) {
        settings.holidays = settings.holidays.filter(h => h.date !== req.params.date);
        await settings.save();
    }
    res.json({ success: true, holidays: settings ? settings.holidays : [] });
});

// ============ PAYROLL CALCULATION ENGINE ============
app.get('/api/payroll/calculate/:month', adminAuth, async (req, res) => {
    try {
        const { month } = req.params; // format: YYYY-MM
        const [year, m] = month.split('-').map(Number);
        if (!year || !m) return res.status(400).json({ error: 'Invalid month (YYYY-MM)' });

        const staffList = await Staff.find({ active: true });
        const totalDays = new Date(year, m, 0).getDate();
        
        // Count Sundays
        let sundays = 0;
        for (let day = 1; day <= totalDays; day++) {
            if (new Date(year, m - 1, day).getDay() === 0) sundays++;
        }

        // Count Holidays (Matching YYYY-MM)
        const settings = await Settings.findOne({ key: 'global' });
        let holidaysCount = 0;
        if (settings && settings.holidays) {
            settings.holidays.forEach(h => {
                if (h.date.startsWith(month)) holidaysCount++;
            });
        }
        
        const allowedLeaves = 1; // Standard config
        const regexDate = new RegExp(`^[0-3][0-9]/${m.toString().padStart(2, '0')}/${year}$`);
        
        const payrollData = [];

        // Parallel log queries using regex for the whole month
        const [logsIn, logsOut, approvedLeaves] = await Promise.all([
            AttendanceLog.find({ type: 'IN', date: regexDate }),
            AttendanceLog.find({ type: 'OUT', date: regexDate }),
            LeaveRequest.find({ status: 'approved', date: regexDate }) // format depends on how user sets leave date... Wait, leave date in DB is string? Yes.
        ]);

        for (const staff of staffList) {
            const baseSalary = staff.baseSalary || 0;
            const staffLogsIn = logsIn.filter(l => l.staffId.toString() === staff._id.toString());
            const staffLogsOut = logsOut.filter(l => l.staffId.toString() === staff._id.toString());
            
            let actualDaysWorked = 0;
            let lateDaysCount = 0;

            staffLogsIn.forEach(inLog => {
                const outLog = staffLogsOut.find(o => o.date === inLog.date);
                if (inLog.status === 'LATE') lateDaysCount++;
                
                if (outLog && outLog.status) {
                    const match = outLog.status.match(/(\d+)h/);
                    if (match) {
                        const h = parseInt(match[1]);
                        if (h >= 8) actualDaysWorked += 1;
                        else if (h >= 4) actualDaysWorked += 0.5;
                        else actualDaysWorked += 0;
                    }
                } else {
                    // Missed checkout default fallback
                    actualDaysWorked += 0.5;
                }
            });

            // Find leaves
            const leavesTaken = approvedLeaves.filter(l => l.staffId.toString() === staff._id.toString()).length;

            // Simple Gross Calculation: (Base / TotalMonthDays) * PaidDays
            let paidDays = actualDaysWorked + sundays + holidaysCount + allowedLeaves;
            if (paidDays > totalDays) paidDays = totalDays; // Cap

            const salaryAmount = Math.round((baseSalary / totalDays) * paidDays);

            payrollData.push({
                staffId: staff._id,
                code: staff.code,
                name: staff.name,
                dept: staff.dept,
                baseSalary,
                totalDays,
                actualDaysWorked,
                lateDaysCount,
                leavesTaken,
                paidDays,
                sundays,
                holidaysCount,
                calculatedSalary: salaryAmount
            });
        }

        res.json({ success: true, month, year, totalDays, sundays, holidaysCount, records: payrollData });
    } catch (err) {
        console.error('Payroll Engine Error:', err);
        res.status(500).json({ error: 'Failed to calculate payroll' });
    }
});

// ============ CLIENT MASTER MODULE ============

// --- Client Schema ---
const clientSchema = new mongoose.Schema({
    clientCode:      { type: String, unique: true },       // AUTO: CLT-0001
    clientName:      { type: String, required: true },      // Legal entity name
    tradeName:       { type: String, default: '' },         // Trade/brand name
    gstin:           { type: String, default: '' },
    pan:             { type: String, default: '' },
    stateCode:       { type: String, default: '08' },       // For GST routing (08=Rajasthan)
    stateName:       { type: String, default: 'Rajasthan' },
    address:         { type: String, default: '' },
    city:            { type: String, default: '' },
    pincode:         { type: String, default: '' },
    contactPerson:   { type: String, default: '' },
    phone:           { type: String, default: '' },
    email:           { type: String, default: '' },
    password:        { type: String, default: '123456' },   // Simple password for client portal
    serviceCategories: [{ type: String }],                  // GST, ITR, Audit etc.
    paymentTerms:    { type: String, default: 'Net 30' },   // Net 15, 30, 45, custom
    notes:           { type: String, default: '' },
    isActive:        { type: Boolean, default: true },
    createdAt:       { type: Date, default: Date.now },
    updatedAt:       { type: Date, default: Date.now }
});
const Client = mongoose.model('Client', clientSchema);

// --- Counter Schema (for auto-generated sequential IDs) ---
const counterSchema = new mongoose.Schema({
    _id:    { type: String, required: true },   // e.g. 'invoiceNo', 'clientCode'
    seq:    { type: Number, default: 0 }
});
const Counter = mongoose.model('Counter', counterSchema);

// Helper: get next sequential number atomically
async function getNextSequence(name) {
    const doc = await Counter.findByIdAndUpdate(
        name,
        { $inc: { seq: 1 } },
        { new: true, upsert: true }
    );
    return doc.seq;
}

// ── CLIENT ROUTES ──────────────────────────────────────────────

// List all clients — superadmin gets full data, others get limited fields
app.get('/api/clients', anyAuth, async (req, res) => {
    try {
        const { search, active } = req.query;
        const filter = {};
        if (active !== 'false') filter.isActive = true;
        if (search) {
            filter.$or = [
                { clientName: { $regex: search, $options: 'i' } },
                { tradeName:  { $regex: search, $options: 'i' } },
                { gstin:      { $regex: search, $options: 'i' } },
                { phone:      { $regex: search, $options: 'i' } },
                { email:      { $regex: search, $options: 'i' } },
                { clientCode: { $regex: search, $options: 'i' } }
            ];
        }

        const isSuperAdmin = req.user.role === 'superadmin';
        
        if (isSuperAdmin) {
            // Full access
            const clients = await Client.find(filter).sort({ clientName: 1 });
            res.json({ success: true, clients, fullAccess: true });
        } else {
            // Limited: only name, trade name, code, _id, serviceCategories
            const clients = await Client.find(filter)
                .select('_id clientCode clientName tradeName gstin serviceCategories isActive')
                .sort({ clientName: 1 });
            res.json({ success: true, clients, fullAccess: false });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Limited client list for task assignment (any auth — name + firm only)
app.get('/api/clients/names', anyAuth, async (req, res) => {
    try {
        const clients = await Client.find({ isActive: true })
            .select('_id clientCode clientName tradeName gstin')
            .sort({ clientName: 1 });
        res.json({ success: true, clients });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get single client with related tasks + invoices
app.get('/api/clients/:id', anyAuth, async (req, res) => {
    try {
        const client = await Client.findById(req.params.id);
        if (!client) return res.status(404).json({ error: 'Client not found' });
        // Also fetch related tasks
        const tasks = await Task.find({ clientId: req.params.id }).sort({ createdAt: -1 });
        res.json({ success: true, client, tasks });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Client Excel Download API (Super Admin Only)
app.get('/api/clients/export', anyAuth, async (req, res) => {
    if (req.user.role !== 'superadmin') {
        return res.status(403).json({ error: 'Access Denied. Only Super Admin can download client data.' });
    }
    
    // Placeholder logic for downloading Excel/CSV
    res.status(200).json({ message: 'Download started...' });
});

// Create client
app.post('/api/clients', anyAuth, async (req, res) => {
    try {
        const { clientName, tradeName, gstin, pan, stateCode, stateName,
                address, city, pincode, contactPerson, phone, email,
                serviceCategories, paymentTerms, notes } = req.body;
        if (!clientName) return res.status(400).json({ error: 'Client name is required' });

        const seq = await getNextSequence('clientCode');
        const clientCode = 'CLT-' + String(seq).padStart(4, '0');

        const client = await Client.create({
            clientCode, clientName, tradeName: tradeName || '',
            gstin: gstin || '', pan: pan || '',
            stateCode: stateCode || '08', stateName: stateName || 'Rajasthan',
            address: address || '', city: city || '', pincode: pincode || '',
            contactPerson: contactPerson || '', phone: phone || '', email: email || '',
            serviceCategories: serviceCategories || [],
            paymentTerms: paymentTerms || 'Net 30',
            notes: notes || ''
        });
        res.json({ success: true, client, message: `Client ${clientCode} created!` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update client
app.put('/api/clients/:id', anyAuth, async (req, res) => {
    try {
        const updates = { ...req.body, updatedAt: Date.now() };
        delete updates._id;
        delete updates.clientCode; // Never overwrite clientCode
        const client = await Client.findByIdAndUpdate(req.params.id, updates, { new: true });
        if (!client) return res.status(404).json({ error: 'Client not found' });
        res.json({ success: true, client, message: 'Client updated!' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Deactivate client (soft delete)
app.delete('/api/clients/:id', adminAuth, async (req, res) => {
    try {
        await Client.findByIdAndUpdate(req.params.id, { isActive: false });
        res.json({ success: true, message: 'Client deactivated' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Indian States list for dropdown
app.get('/api/meta/states', (req, res) => {
    res.json([
        { code:'01', name:'Jammu & Kashmir' }, { code:'02', name:'Himachal Pradesh' },
        { code:'03', name:'Punjab' }, { code:'04', name:'Chandigarh' },
        { code:'05', name:'Uttarakhand' }, { code:'06', name:'Haryana' },
        { code:'07', name:'Delhi' }, { code:'08', name:'Rajasthan' },
        { code:'09', name:'Uttar Pradesh' }, { code:'10', name:'Bihar' },
        { code:'11', name:'Sikkim' }, { code:'12', name:'Arunachal Pradesh' },
        { code:'13', name:'Nagaland' }, { code:'14', name:'Manipur' },
        { code:'15', name:'Mizoram' }, { code:'16', name:'Tripura' },
        { code:'17', name:'Meghalaya' }, { code:'18', name:'Assam' },
        { code:'19', name:'West Bengal' }, { code:'20', name:'Jharkhand' },
        { code:'21', name:'Odisha' }, { code:'22', name:'Chhattisgarh' },
        { code:'23', name:'Madhya Pradesh' }, { code:'24', name:'Gujarat' },
        { code:'25', name:'Daman & Diu' }, { code:'26', name:'Dadra & Nagar Haveli' },
        { code:'27', name:'Maharashtra' }, { code:'28', name:'Andhra Pradesh' },
        { code:'29', name:'Karnataka' }, { code:'30', name:'Goa' },
        { code:'31', name:'Lakshadweep' }, { code:'32', name:'Kerala' },
        { code:'33', name:'Tamil Nadu' }, { code:'34', name:'Puducherry' },
        { code:'35', name:'Andaman & Nicobar' }, { code:'36', name:'Telangana' },
        { code:'37', name:'Andhra Pradesh (New)' }, { code:'38', name:'Ladakh' }
    ]);
});

// ============ TASK MANAGEMENT MODULE ============

// --- Task Schema ---
const taskSchema = new mongoose.Schema({
    taskId:         { type: String, required: true, unique: true },
    staffId:        { type: mongoose.Schema.Types.ObjectId, ref: 'Staff', required: true },
    staffCode:      { type: String, required: true },
    staffName:      { type: String, required: true },
    clientId:       { type: mongoose.Schema.Types.ObjectId, ref: 'Client' },
    clientName:     { type: String, required: true },
    serviceType:    { type: String, default: 'Other Working' },  // Legacy compat — now stores dept name
    department:     { type: String, default: '' },   // Primary: Dept Name from 16-dept list
    workType:       { type: String, default: '' },   // Work type within dept
    subService:     { type: String, default: '' },   // Legacy compat
    workStatus:     { type: String, enum: ['Not Started','In Progress','Completed'], default: 'Not Started' },
    estimatedFees:  { type: Number, default: 0 },
    finalFees:      { type: Number, default: 0 },
    invoiceStatus:  { type: String, enum: ['Not Raised','Raised'], default: 'Not Raised' },
    paymentStatus:  { type: String, enum: ['Pending','Partial','Received'], default: 'Pending' },
    amountReceived: { type: Number, default: 0 },
    estimatedTime:  { type: String, default: '' },
    sendToClient:   { type: Boolean, default: false },
    notes:          { type: String, default: '' },
    createdAt:      { type: Date, default: Date.now },
    updatedAt:      { type: Date, default: Date.now }
});
const Task = mongoose.model('Task', taskSchema);

// --- Daily Routine Tasks ---
const routineTaskSchema = new mongoose.Schema({
    title: { type: String, required: true },
    isActive: { type: Boolean, default: true },
    assignedTo: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Staff' }],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
    createdAt: { type: Date, default: Date.now }
});
const RoutineTask = mongoose.model('RoutineTask', routineTaskSchema);

const dailyRoutineLogSchema = new mongoose.Schema({
    date: { type: String, required: true }, // YYYY-MM-DD
    staffId: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff', required: true },
    routineTaskId: { type: mongoose.Schema.Types.ObjectId, ref: 'RoutineTask', required: true },
    completed: { type: Boolean, default: false },
    comment: { type: String, default: '' },
    timestamp: { type: Date, default: Date.now }
});
const DailyRoutineLog = mongoose.model('DailyRoutineLog', dailyRoutineLogSchema);


// Helper: compute KPIs from a list of task docs
function computeTaskKPIs(tasks) {
    let totalAssigned = tasks.length;
    let completed = 0, revenueBilled = 0, collectionPending = 0;
    tasks.forEach(t => {
        if (t.workStatus === 'Completed') completed++;
        // RULE: Revenue only counted if Payment Status = "Received"
        if (t.paymentStatus === 'Received') revenueBilled += (t.finalFees || 0);
        // RULE: Pending = finalFees - amountReceived
        const pending = (t.finalFees || 0) - (t.amountReceived || 0);
        if (pending > 0) collectionPending += pending;
    });
    return { totalAssigned, completed, revenueBilled, collectionPending };
}

// Generate unique task ID
async function generateTaskId() {
    const count = await Task.countDocuments();
    return 'TSK-' + String(count + 1001).padStart(4, '0');
}

// ── Employee: Get own tasks + KPIs ──────────────────────────────
app.get('/api/tasks/my', anyAuth, async (req, res) => {
    try {
        // Check if user is admin — if so, show all tasks (or tasks assigned to admin's _id)
        let filter = { staffId: req.user.id };
        try {
            const payload = JSON.parse(atob(req.headers.authorization.split('.')[1].split('.')[0]));
            if (payload.type === 'admin' || payload.role === 'superadmin') {
                filter = {}; // Admin sees all tasks from task portal
            }
        } catch(_) {}
        const tasks = await Task.find(filter).sort({ createdAt: -1 });
        const kpis = computeTaskKPIs(tasks);
        res.json({ success: true, tasks, kpis, user: { id: req.user.id, name: req.user.name, code: req.user.code, email: req.user.email } });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch tasks: ' + err.message });
    }
});

// ── Admin: Get ALL tasks across all employees + firm-wide KPIs ───
app.get('/api/tasks/all', adminAuth, async (req, res) => {
    try {
        const { staffId, serviceType, workStatus, paymentStatus } = req.query;
        const filter = {};
        if (staffId)      filter.staffId      = staffId;
        if (serviceType)  filter.serviceType  = serviceType;
        if (workStatus)   filter.workStatus   = workStatus;
        if (paymentStatus) filter.paymentStatus = paymentStatus;

        const tasks = await Task.find(filter).sort({ createdAt: -1 });
        const kpis  = computeTaskKPIs(tasks);

        // Per-employee summary breakdown for admin
        const empMap = {};
        tasks.forEach(t => {
            const key = t.staffCode;
            if (!empMap[key]) empMap[key] = { staffCode: t.staffCode, staffName: t.staffName, staffId: t.staffId, tasks: [] };
            empMap[key].tasks.push(t);
        });
        const employeeSummary = Object.values(empMap).map(e => ({
            staffCode: e.staffCode,
            staffName: e.staffName,
            staffId:   e.staffId,
            kpis: computeTaskKPIs(e.tasks)
        }));

        res.json({ success: true, tasks, kpis, employeeSummary });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch all tasks: ' + err.message });
    }
});

// ── Admin: Get staff list for filter dropdown ────────────────────
app.get('/api/tasks/staff-list', adminAuth, async (req, res) => {
    try {
        const staff = await Staff.find({ active: true }).select('_id code name dept').sort({ name: 1 });
        res.json(staff);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Shared: Get a specific task by ID ────────────────────────────
app.get('/api/tasks/:id', anyAuth, async (req, res) => {
    try {
        const task = await Task.findById(req.params.id);
        if (!task) return res.status(404).json({ error: 'Task not found' });
        
        let hasAccess = false;
        if (req.user.type === 'admin' || req.user.role === 'superadmin') hasAccess = true;
        else if (req.user.type === 'client' && task.clientId && req.user.id === task.clientId.toString()) hasAccess = true;
        else if (task.staffId && req.user.id === task.staffId.toString()) hasAccess = true;

        if (!hasAccess) return res.status(403).json({ error: 'Access denied' });
        res.json({ success: true, task });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch task: ' + err.message });
    }
});

// ── Employee: Create a new task ──────────────────────────────────
app.post('/api/tasks', anyAuth, async (req, res) => {
    try {
        const { clientId, clientName, serviceType, subService, workStatus, estimatedFees, finalFees, invoiceStatus, paymentStatus, amountReceived, estimatedTime, department, sendToClient, notes, staffId: bodyStaffId } = req.body;
        if (!clientName) return res.status(400).json({ error: 'Client name is required' });

        // Try finding staff - for employee it's req.user.id, for admin it could be passed in body
        let staff = await Staff.findById(req.user.id);
        if (!staff && bodyStaffId) {
            staff = await Staff.findById(bodyStaffId);
        }
        // If admin and no staffId specified, allow self-assignment with admin info
        if (!staff) {
            // Check if user is admin
            try {
                const payload = JSON.parse(atob(req.headers.authorization.split('.')[1].split('.')[0]));
                if (payload.type === 'admin' || payload.role === 'superadmin') {
                    const admin = await Admin.findById(req.user.id);
                    if (admin) {
                        staff = { _id: admin._id, code: 'ADMIN', name: admin.name };
                    }
                }
            } catch(_) {}
        }
        if (!staff) return res.status(404).json({ error: 'Employee not found' });

        const taskId = await generateTaskId();
        const deptVal = department || serviceType || 'Other Working';
        const task = await Task.create({
            taskId,
            staffId: staff._id,
            staffCode: staff.code,
            staffName: staff.name,
            clientId: clientId || undefined,
            clientName,
            serviceType: deptVal,
            department: deptVal,
            workType: workType || subService || '',
            subService: subService || workType || '',
            workStatus: workStatus || 'Not Started',
            estimatedFees: Number(estimatedFees) || 0,
            finalFees: Number(finalFees) || 0,
            invoiceStatus: invoiceStatus || 'Not Raised',
            paymentStatus: paymentStatus || 'Pending',
            amountReceived: Number(amountReceived) || 0,
            estimatedTime: estimatedTime || '',
            sendToClient: sendToClient === true || sendToClient === 'true',
            notes: notes || ''
        });
        res.json({ success: true, task, message: 'Task created! ID: ' + taskId });
    } catch (err) {
        res.status(500).json({ error: 'Failed to create task: ' + err.message });
    }
});

// ── Employee: Update own task ────────────────────────────────────
app.put('/api/tasks/:id', anyAuth, async (req, res) => {
    try {
        const filter = { _id: req.params.id };
        // Employees can only edit their own tasks; admins can edit any
        if (req.user.type !== 'admin' && req.user.role !== 'superadmin') {
            filter.staffId = req.user.id;
        }
        const { clientName, serviceType, subService, workType, workStatus, estimatedFees, finalFees, invoiceStatus, paymentStatus, amountReceived, estimatedTime, department, sendToClient, notes } = req.body;
        const deptVal = department || serviceType || '';
        const task = await Task.findOneAndUpdate(filter, {
            clientName, serviceType: deptVal, department: deptVal,
            workType: workType || subService || '', subService: subService || workType || '',
            workStatus,
            estimatedFees: Number(estimatedFees) || 0,
            finalFees: Number(finalFees) || 0,
            invoiceStatus, paymentStatus,
            amountReceived: Number(amountReceived) || 0,
            estimatedTime: estimatedTime || '',
            sendToClient: sendToClient === true || sendToClient === 'true',
            notes: notes || '',
            updatedAt: Date.now()
        }, { new: true });
        if (!task) return res.status(404).json({ error: 'Task not found or access denied' });
        res.json({ success: true, task, message: 'Task updated successfully!' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update task: ' + err.message });
    }
});

// ── Admin: Delete a task ─────────────────────────────────────────
app.delete('/api/tasks/:id', adminAuth, async (req, res) => {
    try {
        await Task.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: 'Task deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Admin: Create task for ANY employee (assigns by staffId) ─────
app.post('/api/tasks/admin-create', adminAuth, async (req, res) => {
    try {
        const { staffId, clientId, clientName, serviceType, subService, department, workType, workStatus, estimatedFees, finalFees,
                invoiceStatus, paymentStatus, amountReceived, notes, staffName, staffCode } = req.body;
        if (!clientName) return res.status(400).json({ error: 'Client name is required' });
        if (!staffId)    return res.status(400).json({ error: 'Employee (staffId) is required' });

        // Fetch staff info from DB for accurate name/code
        const staff = await Staff.findById(staffId);
        if (!staff) return res.status(404).json({ error: 'Employee not found' });

        const taskId = await generateTaskId();
        const deptVal = department || serviceType || 'Other Working';
        const task = await Task.create({
            taskId,
            staffId: staff._id,
            staffCode: staff.code,
            staffName: staff.name,
            clientId,
            clientName,
            serviceType: deptVal,
            department: deptVal,
            workType: workType || subService || '',
            subService: subService || workType || '',
            workStatus: workStatus || 'Not Started',
            estimatedFees: Number(estimatedFees) || 0,
            finalFees: Number(finalFees) || 0,
            invoiceStatus: invoiceStatus || 'Not Raised',
            paymentStatus: paymentStatus || 'Pending',
            amountReceived: Number(amountReceived) || 0,
            notes: notes || ''
        });
        res.json({ success: true, task, message: `Task ${taskId} assigned to ${staff.name}!` });
    } catch (err) {
        res.status(500).json({ error: 'Failed to create task: ' + err.message });
    }
});

// ============ ROUTINE TASKS ROUTES ============

// Superadmin: Get all routines
app.get('/api/routines', adminAuth, async (req, res) => {
    try {
        const routines = await RoutineTask.find({ isActive: true }).populate('assignedTo', 'name code').sort({ createdAt: -1 });
        res.json({ success: true, routines });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Superadmin: Create new routine
app.post('/api/routines', adminAuth, async (req, res) => {
    const { title, assignedTo } = req.body;
    if (!title) return res.status(400).json({ error: 'Title is required' });
    try {
        const routine = await RoutineTask.create({
            title,
            assignedTo: Array.isArray(assignedTo) ? assignedTo : [],
            createdBy: req.user.id
        });
        res.json({ success: true, routine });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Superadmin: Edit routine (assign/reassign)
app.put('/api/routines/:id', adminAuth, async (req, res) => {
    const { title, assignedTo, isActive } = req.body;
    try {
        const update = {};
        if (title !== undefined) update.title = title;
        if (assignedTo !== undefined) update.assignedTo = Array.isArray(assignedTo) ? assignedTo : [];
        if (isActive !== undefined) update.isActive = isActive;
        
        const routine = await RoutineTask.findByIdAndUpdate(req.params.id, update, { new: true });
        res.json({ success: true, routine });
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

// Employee: Get today's routines
app.get('/api/routines/my-today', anyAuth, async (req, res) => {
    try {
        const now = new Date();
        const IST = { timeZone: 'Asia/Kolkata' };
        
        // Date format YYYY-MM-DD
        const year = now.toLocaleString('en-US', { ...IST, year: 'numeric' });
        const month = now.toLocaleString('en-US', { ...IST, month: '2-digit' });
        const day = now.toLocaleString('en-US', { ...IST, day: '2-digit' });
        const todayStr = `${year}-${month}-${day}`;
        
        // Date format DD/MM/YYYY for Leave system
        const localNow = new Date(now.toLocaleString('en-US', IST));
        const leaveDateStr = localNow.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });

        // Skip rule 1: Sunday
        if (localNow.getDay() === 0) {
            return res.json({ success: true, date: todayStr, routines: [], isSunday: true });
        }
        
        // Skip rule 2: Leave
        const leave = await LeaveRequest.findOne({ staffId: req.user.id, date: leaveDateStr, status: 'approved' });
        if (leave && leave.leaveType === 'full') {
            return res.json({ success: true, date: todayStr, routines: [], isLeave: true });
        }

        const routines = await RoutineTask.find({ isActive: true, assignedTo: req.user.id });
        const logs = await DailyRoutineLog.find({ staffId: req.user.id, date: todayStr });
        
        const mapped = routines.map(r => {
            const log = logs.find(l => l.routineTaskId.toString() === r._id.toString());
            return {
                _id: r._id,
                title: r.title,
                completed: log ? log.completed : false,
                comment: log ? log.comment : '',
                logId: log ? log._id : null
            };
        });
        
        res.json({ success: true, date: todayStr, routines: mapped });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Employee: Mark routine as complete
app.post('/api/routines/complete', anyAuth, async (req, res) => {
    const { routineTaskId, comment, date } = req.body;
    if (!comment || comment.trim() === '') {
        return res.status(400).json({ error: 'Comment is mandatory to mark this task complete.' });
    }
    
    try {
        let log = await DailyRoutineLog.findOne({ staffId: req.user.id, routineTaskId, date });
        if (log) {
            log.completed = true;
            log.comment = comment.trim();
            log.timestamp = new Date();
            await log.save();
        } else {
            log = await DailyRoutineLog.create({
                date,
                staffId: req.user.id,
                routineTaskId,
                completed: true,
                comment: comment.trim()
            });
        }
        res.json({ success: true, log });
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

// Superadmin: Get report by date
app.get('/api/routines/report', adminAuth, async (req, res) => {
    const { date } = req.query; // YYYY-MM-DD
    if (!date) return res.status(400).json({ error: 'Date is required' });
    try {
        const logs = await DailyRoutineLog.find({ date })
            .populate('staffId', 'name code dept')
            .populate('routineTaskId', 'title');
            
        const allRoutines = await RoutineTask.find({ isActive: true }).populate('assignedTo', 'name');
        
        res.json({ success: true, logs, activeRoutines: allRoutines });
    } catch(err) {
         res.status(500).json({ error: err.message });
    }
});

// ============ INVOICE ENGINE ============

// --- Invoice Schema ---
const invoiceSchema = new mongoose.Schema({
    invoiceNo:      { type: String, required: true, unique: true },
    taskId:         { type: mongoose.Schema.Types.ObjectId, ref: 'Task' },
    clientId:       { type: mongoose.Schema.Types.ObjectId, ref: 'Client' },
    invoiceType:    { type: String, enum: ['GST','NON_GST'], default: 'GST' },
    gstType:        { type: String, enum: ['CGST_SGST','IGST','NONE'], default: 'CGST_SGST' },
    lineItems: [{
        description:  { type: String, default: '' },
        sacCode:      { type: String, default: '998312' },
        qty:          { type: Number, default: 1 },
        rate:         { type: Number, default: 0 },
        amount:       { type: Number, default: 0 }
    }],
    taxableAmount:   { type: Number, default: 0 },
    cgstRate:        { type: Number, default: 9 },
    cgstAmt:         { type: Number, default: 0 },
    sgstRate:        { type: Number, default: 9 },
    sgstAmt:         { type: Number, default: 0 },
    igstRate:        { type: Number, default: 18 },
    igstAmt:         { type: Number, default: 0 },
    totalAmount:     { type: Number, default: 0 },
    amountInWords:   { type: String, default: '' },
    firmKey:         { type: String, default: 'avpm' },
    firmName:        { type: String, default: 'AVPM & ASSOCIATES' },
    firmGstin:       { type: String, default: '08ABKFA4108L1ZC' },
    firmAddress:     { type: String, default: '11-K-3 SAHKAR MARG, INFRONT OF JAIPUR MAHANAGAR TIMES, NEAR JYOTI NAGAR THANA, LAL KOTHI, JAIPUR, RAJASTHAN 302015' },
    firmState:       { type: String, default: 'Rajasthan, Code: 08' },
    firmEmail:       { type: String, default: 'CAPIYUSHMITTAL80@GMAIL.COM' },
    firmBankName:    { type: String, default: 'State Bank of India' },
    firmAccountNo:   { type: String, default: '39601161082' },
    firmIfsc:        { type: String, default: 'SBIN0015515' },
    firmBranch:      { type: String, default: 'Kailashpuri Tonk Road' },
    clientName:      { type: String, default: '' },
    clientGstin:     { type: String, default: '' },
    clientAddress:   { type: String, default: '' },
    clientState:     { type: String, default: '' },
    clientStateCode: { type: String, default: '' },
    clientEmail:     { type: String, default: '' },
    invoiceDate:     { type: Date, default: Date.now },
    dueDate:         { type: Date },
    paymentTerms:    { type: String, default: 'Net 30' },
    notes:           { type: String, default: '' },
    status:          { type: String, enum: ['Draft','Sent','PartiallyPaid','Paid','Cancelled'], default: 'Draft' },
    emailSentAt:     { type: Date },
    emailSentTo:     { type: String, default: '' },
    createdBy:       { type: mongoose.Schema.Types.ObjectId, ref: 'Staff' },
    createdByName:   { type: String, default: '' },
    createdAt:       { type: Date, default: Date.now },
    updatedAt:       { type: Date, default: Date.now }
});
const Invoice = mongoose.model('Invoice', invoiceSchema);

// Auto invoice number: PREFIX/YY-YY/NNNN
async function generateInvoiceNo(firmKey = 'avpm') {
    const prefixes = { avpm: 'AVPM', bmc: 'BMC', aayu: 'AAYU', huf: 'PMHUF' };
    const prefix = prefixes[firmKey] || 'BMC';
    const now = new Date();
    const month = now.getMonth();
    const fy1 = month >= 3 ? now.getFullYear() : now.getFullYear() - 1;
    const fy2 = fy1 + 1;
    const fySuffix = `${String(fy1).slice(2)}-${String(fy2).slice(2)}`;
    const seq = await getNextSequence(`invoiceNo_${prefix}_${fySuffix}`);
    return `${prefix}/${fySuffix}/${String(seq).padStart(4, '0')}`;
}

// Number to Indian words
function numberToWords(num) {
    if (num === 0) return 'Zero Only';
    const ones = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten',
                  'Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
    const tens = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
    function cg(n) {
        if (n===0) return '';
        if (n<20) return ones[n];
        if (n<100) return tens[Math.floor(n/10)]+(n%10?' '+ones[n%10]:'');
        return ones[Math.floor(n/100)]+' Hundred'+(n%100?' '+cg(n%100):'');
    }
    let r='';
    const cr=Math.floor(num/10000000), lk=Math.floor((num%10000000)/100000), th=Math.floor((num%100000)/1000), rest=num%1000;
    if(cr) r+=cg(cr)+' Crore '; if(lk) r+=cg(lk)+' Lakh ';
    if(th) r+=cg(th)+' Thousand '; if(rest) r+=cg(rest);
    return 'INR '+r.trim()+' Only';
}

// ── Create Invoice ──────────────────────────────────────────────
app.post('/api/invoices', anyAuth, async (req, res) => {
    try {
        const { taskId, clientId, customClientName, invoiceType, lineItems, notes, paymentTerms, invoiceDate, firmKey } = req.body;
        let client = null;
        if (clientId && clientId !== 'CUSTOM') client = await Client.findById(clientId);
        if (!client && taskId) { const task = await Task.findById(taskId); if (task?.clientId) client = await Client.findById(task.clientId); }

        const cName = client ? client.clientName : (customClientName || 'Walk-in Client');
        const cStateCode = client ? (client.stateCode || '08') : '08';
        const cStateName = client ? (client.stateName || '') : 'Rajasthan';
        const cGstin = client ? (client.gstin || '') : '';
        const cAddress = client ? [client.address, client.city, client.pincode].filter(Boolean).join(', ') : '';
        const cEmail = client ? (client.email || '') : '';

        const gstType = invoiceType === 'NON_GST' ? 'NONE' : (cStateCode === '08' ? 'CGST_SGST' : 'IGST');

        let taxableAmount = 0;
        const items = (lineItems || []).map(i => {
            const amt = (Number(i.qty)||1)*(Number(i.rate)||0);
            taxableAmount += amt;
            return { ...i, amount: amt, qty: Number(i.qty)||1, rate: Number(i.rate)||0 };
        });

        let cgstAmt=0, sgstAmt=0, igstAmt=0;
        if (gstType==='CGST_SGST') { cgstAmt=Math.round(taxableAmount*0.09*100)/100; sgstAmt=cgstAmt; }
        else if (gstType==='IGST') { igstAmt=Math.round(taxableAmount*0.18*100)/100; }
        const totalAmount = Math.round((taxableAmount+cgstAmt+sgstAmt+igstAmt)*100)/100;

        const fk = firmKey || 'avpm';
        const invoiceNo = await generateInvoiceNo(fk);
        
        const FIRMS_MAP = {
            avpm: { name: 'AVPM & Associates', gstin: '08ABKFA4108L1ZC', address: '11 K-3, JYOTINAGAR,SAHAKAR MARG,, LALKOTHISCHEME,,NEAR VIDHANSABHA, JAIPUR,RAJASTHAN,INDIA, 302015', email: 'capiyushmittal90@gmail.com' },
            bmc: { name: 'Bookmyca (A Unit of Aayu Consulting Group)', gstin: '08BXTPA0253J1ZE', address: '11 K-3, JYOTINAGAR,SAHAKAR MARG,, LALKOTHISCHEME,,NEAR VIDHANSABHA, JAIPUR,RAJASTHAN,INDIA, 302015', email: 'capiyushmittal90@gmail.com' },
            aayu: { name: 'Aayu Consulting Group Private Limited', gstin: '08ABCCA6884A1ZQ', address: '11-K-3, Second Gate, Near Aadhunik Baal Vidhyalaya, Sahkar Marg, Jyoti Nagar, Near Vidhan Sabha, Jaipur 302015', email: 'capiyushmittal90@gmail.com' },
            huf: { name: 'Piyush Mittal HUF', gstin: '', address: '11 K-3, JYOTINAGAR,SAHAKAR MARG,, LALKOTHISCHEME,,NEAR VIDHANSABHA, JAIPUR,RAJASTHAN,INDIA, 302015', email: '' }
        };
        const f = FIRMS_MAP[fk] || FIRMS_MAP['avpm'];

        let creatorName = 'System';
        try { const s = await Staff.findById(req.user.id); if(s) creatorName=s.name; } catch(_){}

        const dt = invoiceDate ? new Date(invoiceDate) : new Date();
        const termDays = parseInt(paymentTerms?.replace(/\D/g,''))||30;
        const dueDate = new Date(dt.getTime() + termDays*86400000);

        const invoice = await Invoice.create({
            invoiceNo, taskId: taskId||undefined, clientId: client?._id||undefined,
            invoiceType: invoiceType||'GST', gstType,
            lineItems: items, taxableAmount, cgstRate:9, cgstAmt, sgstRate:9, sgstAmt, igstRate:18, igstAmt,
            totalAmount, amountInWords: numberToWords(Math.round(totalAmount)),
            firmKey: fk, firmName: f.name.toUpperCase(), firmGstin: f.gstin, firmAddress: f.address, firmEmail: f.email,
            clientName: cName, clientGstin: cGstin,
            clientAddress: cAddress,
            clientState: cStateName, clientStateCode: cStateCode, clientEmail: cEmail,
            invoiceDate: dt, dueDate, paymentTerms: paymentTerms||'Net 30', notes: notes||'',
            createdBy: req.user.id, createdByName: creatorName
        });
        if (taskId) await Task.findByIdAndUpdate(taskId, { invoiceStatus:'Raised', finalFees:totalAmount, updatedAt:Date.now() });
        res.json({ success:true, invoice, message:`Invoice ${invoiceNo} created!` });
    } catch (err) { res.status(500).json({ error: 'Failed to create invoice: '+err.message }); }
});

// ── List invoices ───────────────────────────────────────────────
app.get('/api/invoices', anyAuth, async (req, res) => {
    try {
        const { status, clientId, staffId } = req.query;
        const filter = {};
        if (status) filter.status = status;
        if (clientId) filter.clientId = clientId;
        const payload = JSON.parse(atob(req.headers.authorization.split('.')[1]));
        if (payload.type!=='admin' && payload.role!=='superadmin') filter.createdBy = req.user.id;
        else if (staffId) filter.createdBy = staffId;
        const invoices = await Invoice.find(filter).sort({ createdAt:-1 });
        let totalBilled=0, totalPaid=0, totalPending=0;
        invoices.forEach(inv => { totalBilled+=inv.totalAmount; if(inv.status==='Paid') totalPaid+=inv.totalAmount; else if(inv.status!=='Cancelled') totalPending+=inv.totalAmount; });
        res.json({ success:true, invoices, kpis:{ total:invoices.length, totalBilled, totalPaid, totalPending } });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Get single invoice ──────────────────────────────────────────
app.get('/api/invoices/:id', anyAuth, async (req, res) => {
    try {
        const invoice = await Invoice.findById(req.params.id);
        if (!invoice) return res.status(404).json({ error:'Invoice not found' });
        res.json({ success:true, invoice });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Update draft invoice ────────────────────────────────────────
app.put('/api/invoices/:id', anyAuth, async (req, res) => {
    try {
        const invoice = await Invoice.findById(req.params.id);
        if (!invoice) return res.status(404).json({ error:'Invoice not found' });
        if (invoice.status!=='Draft') return res.status(400).json({ error:'Only draft invoices can be edited' });
        const updates = { ...req.body, updatedAt: Date.now() };
        delete updates._id; delete updates.invoiceNo;
        if (updates.lineItems) {
            let tax=0; updates.lineItems = updates.lineItems.map(i => { const a=(Number(i.qty)||1)*(Number(i.rate)||0); tax+=a; return {...i,amount:a}; });
            updates.taxableAmount = tax;
            const gt = updates.gstType||invoice.gstType;
            if(gt==='CGST_SGST'){ updates.cgstAmt=Math.round(tax*0.09*100)/100; updates.sgstAmt=updates.cgstAmt; updates.igstAmt=0; }
            else if(gt==='IGST'){ updates.cgstAmt=0; updates.sgstAmt=0; updates.igstAmt=Math.round(tax*0.18*100)/100; }
            else{ updates.cgstAmt=0; updates.sgstAmt=0; updates.igstAmt=0; }
            updates.totalAmount = Math.round((updates.taxableAmount+(updates.cgstAmt||0)+(updates.sgstAmt||0)+(updates.igstAmt||0))*100)/100;
            updates.amountInWords = numberToWords(Math.round(updates.totalAmount));
        }
        const updated = await Invoice.findByIdAndUpdate(req.params.id, updates, { new:true });
        res.json({ success:true, invoice:updated, message:'Invoice updated!' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Cancel invoice (admin) ──────────────────────────────────────
app.post('/api/invoices/:id/cancel', adminAuth, async (req, res) => {
    try {
        const invoice = await Invoice.findByIdAndUpdate(req.params.id, { status:'Cancelled', updatedAt:Date.now() }, { new:true });
        res.json({ success:true, invoice, message:'Invoice cancelled' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Mark invoice as Sent ────────────────────────────────────────
app.post('/api/invoices/:id/send', anyAuth, async (req, res) => {
    try {
        const invoice = await Invoice.findById(req.params.id);
        if (!invoice) return res.status(404).json({ error:'Invoice not found' });
        invoice.status = 'Sent'; invoice.emailSentAt = new Date(); invoice.emailSentTo = invoice.clientEmail;
        await invoice.save();
        res.json({ success:true, invoice, message:`Invoice ${invoice.invoiceNo} marked as sent!` });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============ PAYMENT TRACKING MODULE ============

// --- Payment Schema ---
const paymentSchema = new mongoose.Schema({
    invoiceId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice', required: true },
    taskId:       { type: mongoose.Schema.Types.ObjectId, ref: 'Task' },
    clientId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Client' },
    amount:       { type: Number, required: true },
    paymentDate:  { type: Date, default: Date.now },
    paymentMode:  { type: String, enum: ['UPI','NEFT','RTGS','Cheque','Cash','Bank Transfer','Other'], default: 'UPI' },
    referenceNo:  { type: String, default: '' },  // UTR / Cheque No
    notes:        { type: String, default: '' },
    recordedBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'Staff' },
    recordedByName: { type: String, default: '' },
    createdAt:    { type: Date, default: Date.now }
});
const Payment = mongoose.model('Payment', paymentSchema);

// Helper: recalculate invoice payment status after any payment change
async function recalcInvoicePayment(invoiceId) {
    const payments = await Payment.find({ invoiceId });
    const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
    const invoice = await Invoice.findById(invoiceId);
    if (!invoice) return;

    let newStatus = invoice.status;
    if (totalPaid >= invoice.totalAmount) {
        newStatus = 'Paid';
    } else if (totalPaid > 0) {
        newStatus = 'PartiallyPaid';
    } else if (invoice.status === 'Paid' || invoice.status === 'PartiallyPaid') {
        newStatus = 'Sent'; // revert if all payments deleted
    }
    await Invoice.findByIdAndUpdate(invoiceId, { status: newStatus, updatedAt: Date.now() });

    // Also update linked task
    if (invoice.taskId) {
        let taskPayStatus = 'Pending';
        if (totalPaid >= invoice.totalAmount) taskPayStatus = 'Received';
        else if (totalPaid > 0) taskPayStatus = 'Partial';
        await Task.findByIdAndUpdate(invoice.taskId, {
            paymentStatus: taskPayStatus,
            amountReceived: totalPaid,
            updatedAt: Date.now()
        });
    }
}

// ── Record payment ──────────────────────────────────────────────
app.post('/api/payments', anyAuth, async (req, res) => {
    try {
        const { invoiceId, amount, paymentDate, paymentMode, referenceNo, notes } = req.body;
        if (!invoiceId || !amount) return res.status(400).json({ error: 'Invoice ID and amount are required' });

        const invoice = await Invoice.findById(invoiceId);
        if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

        let recorderName = 'System';
        try { const s = await Staff.findById(req.user.id); if (s) recorderName = s.name; } catch(_) {}

        const payment = await Payment.create({
            invoiceId,
            taskId: invoice.taskId || undefined,
            clientId: invoice.clientId || undefined,
            amount: Number(amount),
            paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
            paymentMode: paymentMode || 'UPI',
            referenceNo: referenceNo || '',
            notes: notes || '',
            recordedBy: req.user.id,
            recordedByName: recorderName
        });

        // Recalculate invoice + task status
        await recalcInvoicePayment(invoiceId);

        res.json({ success: true, payment, message: `Payment of ₹${Number(amount).toLocaleString('en-IN')} recorded!` });
    } catch (err) {
        res.status(500).json({ error: 'Failed to record payment: ' + err.message });
    }
});

// ── Get payments for an invoice ─────────────────────────────────
app.get('/api/payments/invoice/:id', anyAuth, async (req, res) => {
    try {
        const payments = await Payment.find({ invoiceId: req.params.id }).sort({ paymentDate: -1 });
        const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
        const invoice = await Invoice.findById(req.params.id);
        const outstanding = invoice ? invoice.totalAmount - totalPaid : 0;
        res.json({ success: true, payments, totalPaid, outstanding, invoiceTotal: invoice?.totalAmount || 0 });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Get all payments (admin) ────────────────────────────────────
app.get('/api/payments', anyAuth, async (req, res) => {
    try {
        const { clientId, startDate, endDate, mode } = req.query;
        const filter = {};
        if (clientId) filter.clientId = clientId;
        if (mode) filter.paymentMode = mode;
        if (startDate || endDate) {
            filter.paymentDate = {};
            if (startDate) filter.paymentDate.$gte = new Date(startDate);
            if (endDate) filter.paymentDate.$lte = new Date(endDate + 'T23:59:59');
        }

        // Role check
        const payload = JSON.parse(atob(req.headers.authorization.split('.')[1]));
        if (payload.type !== 'admin' && payload.role !== 'superadmin') {
            filter.recordedBy = req.user.id;
        }

        const payments = await Payment.find(filter).sort({ paymentDate: -1 });
        const totalReceived = payments.reduce((sum, p) => sum + p.amount, 0);
        res.json({ success: true, payments, totalReceived, count: payments.length });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Delete payment (admin only) ─────────────────────────────────
app.delete('/api/payments/:id', adminAuth, async (req, res) => {
    try {
        const payment = await Payment.findById(req.params.id);
        if (!payment) return res.status(404).json({ error: 'Payment not found' });
        const invoiceId = payment.invoiceId;
        await Payment.findByIdAndDelete(req.params.id);
        // Recalculate
        await recalcInvoicePayment(invoiceId);
        res.json({ success: true, message: 'Payment deleted and invoice status recalculated' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============ TEMPLATE MASTER (CHECKLISTS/FORMS) ============

// Helper: check if a user (admin or employee) has a specific permission on a module
async function hasModulePermission(user, moduleName, permType) {
    if (!user) return false;
    // Admins and superadmins always have full access
    if (user.role === 'admin' || user.role === 'superadmin' || user.type === 'admin') return true;
    // For employees, check their stored permissions
    if (user.type === 'employee') {
        const staff = await Staff.findById(user.id).select('permissions isTeamAdmin').lean();
        if (!staff) return false;
        if (staff.isTeamAdmin) return true; // Team admins have full access
        const mod = (staff.permissions?.modules || []).find(m => m.name === moduleName);
        if (!mod) return false;
        return mod[permType] === true;
    }
    return false;
}

// Middleware factory for module-level permission check
function moduleAuth(moduleName, permType) {
    return async (req, res, next) => {
        let token = req.headers.authorization?.split(' ')[1];
        if (!token && req.query.token) token = req.query.token;
        if (!token) return res.status(401).json({ error: 'No token provided' });
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            req.user = decoded;
            const allowed = await hasModulePermission(decoded, moduleName, permType);
            if (!allowed) return res.status(403).json({ error: 'You do not have permission to perform this action.' });
            next();
        } catch (err) {
            return res.status(401).json({ error: 'Invalid token' });
        }
    };
}

// ── Get all templates (any authenticated user with read permission) ──
app.get('/api/templates', anyAuth, async (req, res) => {
    try {
        // Check read permission for employees
        if (req.user.type === 'employee') {
            const allowed = await hasModulePermission(req.user, 'template-master', 'read');
            if (!allowed) return res.status(403).json({ error: 'No read permission for Template Master' });
        }
        const templates = await Template.find().sort({ createdAt: -1 });
        res.json({ success: true, templates });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Create new template (admin or employee with write permission) ──
app.post('/api/templates', moduleAuth('template-master', 'write'), async (req, res) => {
    try {
        const { title, type, content } = req.body;
        if (!title) return res.status(400).json({ error: 'Title is required' });
        const template = await Template.create({ title, type: type || 'checklist', content: content || '' });
        res.json({ success: true, template, message: 'Template created successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Update template (admin or employee with edit permission) ──
app.put('/api/templates/:id', moduleAuth('template-master', 'edit'), async (req, res) => {
    try {
        const { title, type, content } = req.body;
        const updateData = { updatedAt: Date.now() };
        if (title) updateData.title = title;
        if (type) updateData.type = type;
        if (content !== undefined) updateData.content = content;

        const template = await Template.findByIdAndUpdate(req.params.id, updateData, { new: true });
        if (!template) return res.status(404).json({ error: 'Template not found' });
        res.json({ success: true, template, message: 'Template updated successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Delete template (admin or employee with edit permission) ──
app.delete('/api/templates/:id', moduleAuth('template-master', 'edit'), async (req, res) => {
    try {
        const template = await Template.findByIdAndDelete(req.params.id);
        if (!template) return res.status(404).json({ error: 'Template not found' });
        res.json({ success: true, message: 'Template deleted successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============ FILE MANAGEMENT ============
app.post('/api/files/upload', anyAuth, upload.single('file'), async (req, res) => {
    try {
        const { taskId, clientId, folder } = req.body;
        if (!req.file || !taskId || !clientId || !folder) return res.status(400).json({ error: 'Missing required parameters' });
        
        let uploaderName = req.user.name || 'System';
        
        const fileRecord = await FileAttachment.create({
            taskId,
            clientId,
            originalName: req.file.originalname,
            filename: req.file.filename,
            path: req.file.path,
            folder: folder, // 'input' or 'output'
            uploadedBy: req.user.id,
            uploadedByName: uploaderName
        });
        res.json({ success: true, file: fileRecord });
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/files/task/:taskId', anyAuth, async (req, res) => {
    try {
        const files = await FileAttachment.find({ taskId: req.params.taskId }).sort({ createdAt: -1 });
        res.json({ success: true, files });
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/files/download/:id', anyAuth, async (req, res) => {
    try {
        const file = await FileAttachment.findById(req.params.id);
        if (!file) return res.status(404).send('File not found');
        if (req.user.type === 'client' && file.clientId.toString() !== req.user.id) {
             return res.status(403).send('Unauthorized');
        }
        res.download(file.path, file.originalName);
    } catch(err) {
        res.status(500).send(err.message);
    }
});

app.delete('/api/files/:id', anyAuth, async (req, res) => {
    try {
        const file = await FileAttachment.findById(req.params.id);
        if(!file) return res.status(404).json({ error: 'Not found' });
        if (req.user.type === 'client' && file.folder !== 'input') {
             return res.status(403).json({ error: 'Clients can only delete their own inputs' });
        }
        
        if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
        await FileAttachment.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch(err) {
         res.status(500).json({ error: err.message });
    }
});

// ============ CLIENT DASHBOARD ============
app.get('/api/client/dashboard', anyAuth, async (req, res) => {
    try {
        if (req.user.type !== 'client') return res.status(403).json({ error: 'Client access only' });
        
        const clientId = req.user.id;
        
        const tasks = await Task.find({ clientId: clientId, sendToClient: true }).sort({ updatedAt: -1 });
        
        const ads = await Advertisement.find({
            $or: [
                { targetClients: { $size: 0 } },
                { targetClients: clientId }
            ]
        }).sort({ createdAt: -1 });
        
        res.json({ success: true, tasks, ads });
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

// ============ ADVERTISEMENTS (Admin Only) ============
app.post('/api/ads', adminAuth, upload.single('image'), async (req, res) => {
    try {
        const { title, targetClients } = req.body;
        if (!req.file) return res.status(400).json({ error: 'Image required' });
        
        let clientsArray = [];
        if (targetClients) {
            try { clientsArray = JSON.parse(targetClients); } catch(e){}
        }
        
        const ad = await Advertisement.create({
            imagePath: '/uploads/' + req.file.filename,
            title: title || '',
            targetClients: clientsArray
        });
        res.json({ success: true, ad });
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/ads', adminAuth, async (req, res) => {
    try {
        const ads = await Advertisement.find().populate('targetClients', 'clientName clientCode');
        res.json({ success: true, ads });
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/ads/:id', adminAuth, async (req, res) => {
    try {
        const ad = await Advertisement.findById(req.params.id);
        if(!ad) return res.status(404).json({ error: 'Not found' });
        
        const fullPath = path.join(__dirname, 'uploads', path.basename(ad.imagePath));
        if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
        
        await Advertisement.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

// ============ AI AUTO-SCRAPER API ============

app.get('/api/ad/sources', adminAuth, async (req, res) => {
    try {
        const sources = await SubsidySource.find().sort({ createdAt: -1 });
        res.json({ success: true, sources });
    } catch(err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/ad/trigger-crawler', adminAuth, async (req, res) => {
    try {
        const aiEngine = require('./ai_marketing');
        await aiEngine.runDailyScrapeAndAuthenticate();
        res.json({ success: true, message: "Manual crawl triggered successfully." });
    } catch(err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/ad/sources', adminAuth, async (req, res) => {
    try {
        const { url, title } = req.body;
        if (!url) return res.status(400).json({ error: 'URL is required' });
        const src = await SubsidySource.create({ url, title });
        res.json({ success: true, source: src });
    } catch(err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/ad/sources/:id', adminAuth, async (req, res) => {
    try {
        await SubsidySource.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch(err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/ad/verified-subsidies', adminAuth, async (req, res) => {
    try {
        const subsidies = await VerifiedSubsidy.find().sort({ extractedAt: -1 }).limit(50);
        res.json({ success: true, subsidies });
    } catch(err) { res.status(500).json({ error: err.message }); }
});

// ============ INITIALIZE AI MARKETING ENGINE ============
try {
    const aiEngine = require('./ai_marketing');
    aiEngine.initCronJobs();
} catch (e) {
    console.warn("⚠️ Could not load ai_marketing engine:", e.message);
}

// ============ TODO ROUTES ============

// Get own todos (employee) — with optional filters
app.get('/api/todos/my', anyAuth, async (req, res) => {
    try {
        const { filter, list, priority } = req.query;
        const staffId = req.user.id;
        let query = { staffId };

        if (filter === 'important') query.isImportant = true;
        if (filter === 'myday') query.isMyDay = true;
        if (filter === 'done') query.status = 'done';
        if (filter === 'todo') query.status = { $in: ['todo', 'in-progress'] };
        if (filter === 'planned') query.dueDate = { $ne: null };
        if (list && list !== 'all') query.list = list;
        if (priority) query.priority = priority;

        const todos = await Todo.find(query).sort({ isImportant: -1, dueDate: 1, createdAt: -1 });
        res.json({ success: true, todos });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Create todo (employee)
app.post('/api/todos', anyAuth, async (req, res) => {
    try {
        const { title, description, dueDate, priority, list, isImportant, isMyDay } = req.body;
        if (!title) return res.status(400).json({ error: 'Title is required' });

        const staff = await Staff.findById(req.user.id).select('name code');
        const todo = await Todo.create({
            title,
            description: description || '',
            dueDate: dueDate ? new Date(dueDate) : null,
            priority: priority || 'medium',
            list: list || 'Work',
            isImportant: isImportant || false,
            isMyDay: isMyDay || false,
            staffId: req.user.id,
            staffName: staff?.name || req.user.name,
            staffCode: staff?.code || req.user.code
        });
        res.json({ success: true, todo });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update todo (employee — own only)
app.put('/api/todos/:id', anyAuth, async (req, res) => {
    try {
        const todo = await Todo.findOne({ _id: req.params.id, staffId: req.user.id });
        if (!todo) return res.status(404).json({ error: 'Todo not found' });

        const { title, description, dueDate, priority, list, isImportant, isMyDay, status } = req.body;
        if (title !== undefined) todo.title = title;
        if (description !== undefined) todo.description = description;
        if (dueDate !== undefined) todo.dueDate = dueDate ? new Date(dueDate) : null;
        if (priority !== undefined) todo.priority = priority;
        if (list !== undefined) todo.list = list;
        if (isImportant !== undefined) todo.isImportant = isImportant;
        if (isMyDay !== undefined) todo.isMyDay = isMyDay;
        if (status !== undefined) {
            todo.status = status;
            todo.completedAt = status === 'done' ? new Date() : null;
        }
        todo.updatedAt = new Date();
        await todo.save();
        res.json({ success: true, todo });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete todo (employee — own only)
app.delete('/api/todos/:id', anyAuth, async (req, res) => {
    try {
        const todo = await Todo.findOneAndDelete({ _id: req.params.id, staffId: req.user.id });
        if (!todo) return res.status(404).json({ error: 'Todo not found' });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Admin: Get ALL todos with filters
app.get('/api/todos/all', adminAuth, async (req, res) => {
    try {
        const { staffId, status, priority, list, from, to } = req.query;
        let query = {};
        if (staffId) query.staffId = staffId;
        if (status) query.status = status;
        if (priority) query.priority = priority;
        if (list) query.list = list;
        if (from || to) {
            query.createdAt = {};
            if (from) query.createdAt.$gte = new Date(from);
            if (to) query.createdAt.$lte = new Date(to);
        }
        const todos = await Todo.find(query).sort({ createdAt: -1 }).limit(500);
        res.json({ success: true, todos });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Admin: Stats
app.get('/api/todos/stats', adminAuth, async (req, res) => {
    try {
        const total = await Todo.countDocuments();
        const done = await Todo.countDocuments({ status: 'done' });
        const pending = await Todo.countDocuments({ status: { $in: ['todo', 'in-progress'] } });
        const overdue = await Todo.countDocuments({
            status: { $in: ['todo', 'in-progress'] },
            dueDate: { $lt: new Date(), $ne: null }
        });
        const highPriority = await Todo.countDocuments({ priority: 'high', status: { $ne: 'done' } });
        // Per-employee stats
        const byEmployee = await Todo.aggregate([
            { $group: { _id: { staffId: '$staffId', staffName: '$staffName', staffCode: '$staffCode' }, total: { $sum: 1 }, done: { $sum: { $cond: [{ $eq: ['$status', 'done'] }, 1, 0] } } } },
            { $sort: { total: -1 } }
        ]);
        res.json({ success: true, total, done, pending, overdue, highPriority, byEmployee });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Upload attachment to todo (max 1MB, base64 in DB) ──
app.post('/api/todos/:id/attachments', anyAuth, async (req, res) => {
    try {
        const todo = await Todo.findOne({ _id: req.params.id, staffId: req.user.id });
        if (!todo) return res.status(404).json({ error: 'Todo not found' });
        const { name, mimeType, size, data } = req.body;
        if (!data) return res.status(400).json({ error: 'File data required' });
        if (size > 1048576) return res.status(400).json({ error: 'File too large. Max 1MB allowed.' });
        todo.attachments.push({ name, mimeType, size, data });
        todo.updatedAt = new Date();
        await todo.save();
        // Return without base64 data for speed
        const saved = todo.attachments[todo.attachments.length - 1];
        res.json({ success: true, attachment: { _id: saved._id, name: saved.name, mimeType: saved.mimeType, size: saved.size, uploadedAt: saved.uploadedAt } });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Get single attachment (for download/preview) ──
app.get('/api/todos/:id/attachments/:attachId', anyAuth, async (req, res) => {
    try {
        const todo = await Todo.findOne({ _id: req.params.id, staffId: req.user.id });
        if (!todo) return res.status(404).json({ error: 'Todo not found' });
        const att = todo.attachments.id(req.params.attachId);
        if (!att) return res.status(404).json({ error: 'Attachment not found' });
        res.json({ success: true, attachment: att });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Delete attachment from todo ──
app.delete('/api/todos/:id/attachments/:attachId', anyAuth, async (req, res) => {
    try {
        const todo = await Todo.findOne({ _id: req.params.id, staffId: req.user.id });
        if (!todo) return res.status(404).json({ error: 'Todo not found' });
        todo.attachments = todo.attachments.filter(a => a._id.toString() !== req.params.attachId);
        todo.updatedAt = new Date();
        await todo.save();
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============ START SERVER ============
const PORT = process.env.PORT || 3847;
app.listen(PORT, () => {
    console.log(`\n🚀 BookMyCA Smart Attend Server v4.0 running at http://localhost:${PORT}\n`);
});

