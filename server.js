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

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Serve the frontend files
app.use(express.static(path.join(__dirname)));

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
    createdAt: { type: Date, default: Date.now }
});
const Staff = mongoose.model('Staff', staffSchema);

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
        const token = req.headers.authorization?.split(' ')[1];
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
        { id: staff._id, code: staff.code, name: staff.name, email: staff.email, dept: staff.dept, shift: staff.shift, type: 'employee' },
        JWT_SECRET, { expiresIn: '12h' }
    );
    res.json({ success: true, token, employee: { id: staff._id, code: staff.code, name: staff.name, email: staff.email, dept: staff.dept, shift: staff.shift } });
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

// ============ START SERVER ============
const PORT = process.env.PORT || 3847;
app.listen(PORT, () => {
    console.log(`\n🚀 BookMyCA Smart Attend Server v4.0 running at http://localhost:${PORT}\n`);
});
