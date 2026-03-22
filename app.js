/* =============================================
   BookMyCA Smart Attend — Application Logic v3
   Late Detection, Check-Out, GPS, Geofence, PWA
   ============================================= */

// --- Configuration ---
const ADMIN_EMAIL = "capiyushmittal90@gmail.com";
const ADMIN_PASS = "Kittu@123*";
const ADMIN_NAME = "Piyush Mittal";

// Default settings (overridden by localStorage)
const DEFAULT_SETTINGS = {
    officeStartTime: '10:00',
    graceMinutes: 15,
    officeLat: 26.892900,
    officeLng: 75.793900,
    geofenceRadius: 500    // meters
};

// --- State ---
let staffDB = JSON.parse(localStorage.getItem('smartattend_staff') || '[]');
let attendanceLogs = JSON.parse(localStorage.getItem('smartattend_logs') || '[]');
let settings = Object.assign({}, DEFAULT_SETTINGS, JSON.parse(localStorage.getItem('smartattend_settings') || '{}'));
let currentOTP = null;
let cameraStream = null;
let currentLocation = "Fetching…";
let currentCoords = null;    // { lat, lng }
let currentIP = null;
let isSubmitting = false;
let geoWatchId = null;

// ============ SCREEN MANAGEMENT ============
function showScreen(id) {
    stopCamera();
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const screen = document.getElementById(id);
    if (screen) screen.classList.add('active');

    if (id === 'screen-checkin') initCheckin();
    if (id === 'screen-checkout') initCheckout();
    if (id === 'screen-admin-portal') initAdminPortal();
}

// ============ TOAST ============
function toast(msg, type = 'info', duration = 3500) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.className = 'toast ' + type;
    requestAnimationFrame(() => el.classList.add('show'));
    clearTimeout(el._timer);
    el._timer = setTimeout(() => el.classList.remove('show'), duration);
}

// ============ LOCAL STORAGE ============
function saveStaff() { localStorage.setItem('smartattend_staff', JSON.stringify(staffDB)); }
function saveLogs() { localStorage.setItem('smartattend_logs', JSON.stringify(attendanceLogs)); }
function saveSettings() {
    settings.officeStartTime = document.getElementById('setting-start-time').value || '10:00';
    settings.graceMinutes = parseInt(document.getElementById('setting-grace').value) || 15;
    const locParts = (document.getElementById('setting-office-loc').value || '').split(',');
    if (locParts.length === 2) {
        settings.officeLat = parseFloat(locParts[0].trim()) || 26.892900;
        settings.officeLng = parseFloat(locParts[1].trim()) || 75.793900;
    }
    settings.geofenceRadius = parseInt(document.getElementById('setting-geofence').value) || 500;
    localStorage.setItem('smartattend_settings', JSON.stringify(settings));
    toast('Settings saved ✓', 'success');
}

function loadSettingsUI() {
    const s = settings;
    document.getElementById('setting-start-time').value = s.officeStartTime;
    document.getElementById('setting-grace').value = s.graceMinutes;
    document.getElementById('setting-office-loc').value = `${s.officeLat}, ${s.officeLng}`;
    document.getElementById('setting-geofence').value = s.geofenceRadius;
}

// ============ STAFF CHECK-IN ============
function initCheckin() {
    goCheckinStep(1);
    populateStaffSelect('staff-select');
    currentOTP = null;
}

function populateStaffSelect(selectId) {
    const sel = document.getElementById(selectId);
    sel.innerHTML = '';
    if (staffDB.length === 0) {
        sel.innerHTML = '<option disabled selected>— Add staff in Admin first —</option>';
        return;
    }
    staffDB.forEach((emp, i) => {
        const opt = document.createElement('option');
        opt.value = i;
        opt.textContent = `${emp.name}  (${emp.code})`;
        sel.appendChild(opt);
    });
}

function goCheckinStep(n) {
    document.querySelectorAll('#screen-checkin .checkin-step').forEach(s => s.classList.remove('active'));
    const step = document.getElementById('checkin-step-' + n);
    if (step) step.classList.add('active');
    for (let i = 1; i <= 3; i++) {
        const el = document.getElementById('step-' + i);
        el.classList.remove('active', 'done');
        if (i < n) el.classList.add('done');
        if (i === n) el.classList.add('active');
    }
    if (n === 3) { startCamera('camera-feed'); fetchLocation('location-badge'); }
    else { stopCamera(); }
}

// --- OTP ---
async function sendOTP() {
    if (staffDB.length === 0) { toast('No staff registered. Go to Admin Portal first.', 'warning'); return; }
    const idx = document.getElementById('staff-select').value;
    const emp = staffDB[idx];
    currentOTP = String(Math.floor(1000 + Math.random() * 9000));

    const btn = document.getElementById('btn-send-otp');
    btn.disabled = true;
    btn.textContent = '⏳ Sending OTP…';
    toast(`Sending OTP to ${emp.email}…`, 'info', 5000);

    try {
        const res = await fetch('/api/send-otp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ employeeName: emp.name, employeeEmail: emp.email, otp: currentOTP })
        });
        const data = await res.json();
        if (data.success) {
            toast(`✅ OTP sent successfully to ${emp.email}`, 'success', 5000);
            goCheckinStep(2);
        } else {
            toast(`❌ Failed to send OTP: ${data.error}`, 'error', 5000);
        }
    } catch (err) {
        toast('❌ Server not reachable. Make sure the server is running.', 'error', 6000);
    } finally {
        btn.disabled = false;
        btn.textContent = '📨 Send OTP to Email';
    }
}

function verifyOTP() {
    const entered = document.getElementById('otp-input').value.trim();
    if (!currentOTP) { toast('Please request an OTP first.', 'warning'); return; }
    if (entered !== currentOTP) { toast('Invalid OTP. Please try again.', 'error'); return; }
    toast('OTP Verified ✓', 'success');
    document.getElementById('otp-input').value = '';
    goCheckinStep(3);
}

// ============ STAFF CHECK-OUT ============
function initCheckout() {
    goCheckoutStep(1);
    populateStaffSelect('checkout-select');
    updateCheckinInfo();
}

// Update checkout-select to show check-in info
function updateCheckinInfo() {
    const sel = document.getElementById('checkout-select');
    sel.addEventListener('change', showCheckinInfo);
    showCheckinInfo();
}

function showCheckinInfo() {
    const idx = document.getElementById('checkout-select').value;
    const badge = document.getElementById('checkin-info-badge');
    if (!idx || !staffDB[idx]) { badge.style.display = 'none'; return; }
    const emp = staffDB[idx];
    const today = getTodayStr();
    const checkinLog = attendanceLogs.find(l => l.code === emp.code && l.date === today && l.type === 'IN');
    if (checkinLog) {
        badge.style.display = 'block';
        badge.innerHTML = `✅ Checked in at <strong>${checkinLog.time}</strong> — Status: <strong>${checkinLog.status}</strong>`;
    } else {
        badge.style.display = 'block';
        badge.innerHTML = `⚠️ No check-in found today for ${emp.name}`;
        badge.style.borderLeftColor = '#f39c12';
        badge.style.color = '#e67e22';
        badge.style.background = 'rgba(243,156,18,0.08)';
    }
}

function goCheckoutStep(n) {
    document.querySelectorAll('#screen-checkout .checkin-step').forEach(s => s.classList.remove('active'));
    const step = document.getElementById('checkout-step-' + n);
    if (step) step.classList.add('active');
    for (let i = 1; i <= 2; i++) {
        const el = document.getElementById('out-step-' + i);
        el.classList.remove('active', 'done');
        if (i < n) el.classList.add('done');
        if (i === n) el.classList.add('active');
    }
    if (n === 2) { startCamera('camera-feed-out'); fetchLocation('location-badge-out'); }
    else { stopCamera(); }
}

function proceedCheckout() {
    if (staffDB.length === 0) { toast('No staff registered.', 'warning'); return; }
    const idx = document.getElementById('checkout-select').value;
    const emp = staffDB[idx];
    const today = getTodayStr();

    // Check if already checked out
    const existing = attendanceLogs.find(l => l.code === emp.code && l.date === today && l.type === 'OUT');
    if (existing) {
        toast(`${emp.name} already checked out today at ${existing.time}.`, 'warning');
        return;
    }

    goCheckoutStep(2);
}

// ============ CAMERA ============
async function startCamera(videoId) {
    const video = document.getElementById(videoId);
    const previewId = videoId.replace('camera-feed', 'snapshot-preview');
    const preview = document.getElementById(previewId);
    video.style.display = 'block';
    if (preview) preview.style.display = 'none';
    try {
        cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 640, height: 480 } });
        video.srcObject = cameraStream;
    } catch (err) {
        toast('Camera access denied. Check browser permissions.', 'error');
    }
}

function stopCamera() {
    if (cameraStream) {
        cameraStream.getTracks().forEach(t => t.stop());
        cameraStream = null;
    }
}

// ============ LOCATION ============
function fetchLocation(badgeId) {
    const badge = document.getElementById(badgeId);
    badge.innerHTML = '<span class="pulse-dot"></span> Fetching location…';
    currentLocation = "Location unavailable";
    currentCoords = null;
    currentIP = null;

    if (!navigator.geolocation) {
        badge.innerHTML = '<span class="pulse-dot"></span> Geolocation not supported';
        return;
    }

    navigator.geolocation.getCurrentPosition(
        async (pos) => {
            const { latitude, longitude } = pos.coords;
            currentCoords = { lat: latitude, lng: longitude };
            try {
                const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`, {
                    headers: { 'Accept-Language': 'en' }
                });
                const data = await res.json();
                currentLocation = data.display_name || `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
            } catch {
                currentLocation = `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
            }
            badge.innerHTML = `<span class="pulse-dot"></span> ${currentLocation}`;
        },
        () => {
            fetch('https://ipapi.co/json/')
                .then(r => r.json())
                .then(d => {
                    currentIP = d.ip || null;
                    currentLocation = `${d.city || ''}, ${d.region || ''}, ${d.country_name || ''}`;
                    if (d.latitude && d.longitude) {
                        currentCoords = { lat: d.latitude, lng: d.longitude };
                    }
                    badge.innerHTML = `<span class="pulse-dot"></span> ${currentLocation}`;
                })
                .catch(() => {
                    badge.innerHTML = '<span class="pulse-dot"></span> Could not determine location';
                });
        },
        { enableHighAccuracy: true, timeout: 10000 }
    );

    // Also try to get IP
    fetch('https://ipapi.co/json/')
        .then(r => r.json())
        .then(d => { currentIP = d.ip || null; })
        .catch(() => { });
}

// ============ LATE DETECTION ============
function getAttendanceStatus() {
    const now = new Date();
    const [h, m] = settings.officeStartTime.split(':').map(Number);
    const cutoff = new Date();
    cutoff.setHours(h, m + settings.graceMinutes, 0, 0);
    return now <= cutoff ? 'ON TIME' : 'LATE';
}

// ============ CAPTURE & MARK (IN/OUT) ============
function captureAndMark(type) {
    const isCheckout = type === 'OUT';
    const videoId = isCheckout ? 'camera-feed-out' : 'camera-feed';
    const canvasId = isCheckout ? 'snapshot-canvas-out' : 'snapshot-canvas';
    const previewId = isCheckout ? 'snapshot-preview-out' : 'snapshot-preview';
    const selectId = isCheckout ? 'checkout-select' : 'staff-select';

    const video = document.getElementById(videoId);
    const canvas = document.getElementById(canvasId);
    const preview = document.getElementById(previewId);

    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
    const photoData = canvas.toDataURL('image/jpeg', 0.85);

    preview.src = photoData;
    preview.style.display = 'block';
    video.style.display = 'none';
    stopCamera();

    const idx = document.getElementById(selectId).value;
    const emp = staffDB[idx];

    const now = new Date();
    const status = type === 'IN' ? getAttendanceStatus() : '—';

    const log = {
        date: getTodayStr(),
        time: now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }),
        timestamp: now.getTime(),
        type: type,
        status: status,
        code: emp.code,
        name: emp.name,
        department: emp.dept,
        location: currentLocation,
        coords: currentCoords ? { lat: currentCoords.lat, lng: currentCoords.lng } : null,
        ip: currentIP,
        mapUrl: currentCoords ? `https://www.google.com/maps?q=${currentCoords.lat},${currentCoords.lng}` : null,
        snapshot: photoData
    };

    attendanceLogs.push(log);
    saveLogs();

    const label = type === 'IN' ? 'Check-In' : 'Check-Out';
    const statusMsg = type === 'IN' ? ` (${status})` : '';
    toast(`${label} marked for ${emp.name}${statusMsg}!`, status === 'LATE' ? 'warning' : 'success');
    setTimeout(() => showScreen('screen-main'), 1800);
}

// ============ WORKING HOURS ============
function getWorkingHours(empCode, date) {
    const dayLogs = attendanceLogs.filter(l => l.code === empCode && l.date === date);
    const inLog = dayLogs.find(l => l.type === 'IN');
    const outLog = dayLogs.find(l => l.type === 'OUT');
    if (!inLog || !outLog) return null;
    const diff = outLog.timestamp - inLog.timestamp;
    const hours = Math.floor(diff / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    return `${hours}h ${mins}m`;
}

function getTodayStr() {
    return new Date().toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// ============ ADMIN ============
function adminLogin() {
    const email = document.getElementById('admin-email').value.trim();
    const pass = document.getElementById('admin-pass').value;
    if (email === ADMIN_EMAIL && pass === ADMIN_PASS) {
        toast('Welcome, ' + ADMIN_NAME, 'success');
        document.getElementById('admin-email').value = '';
        document.getElementById('admin-pass').value = '';
        showScreen('screen-admin-portal');
    } else {
        toast('Invalid credentials. Access denied.', 'error');
    }
}

function initAdminPortal() {
    switchTab('staff');
    renderStaffList();
    updateLogStats();
    renderLogsTable();
    loadSettingsUI();
}

function switchTab(name) {
    document.querySelectorAll('.tab-panel').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.btn-nav').forEach(b => b.classList.remove('active'));
    const panel = document.getElementById('tab-' + name);
    const btn = document.getElementById('tab-btn-' + name);
    if (panel) panel.classList.add('active');
    if (btn) btn.classList.add('active');
    if (name === 'reports') { updateLogStats(); renderLogsTable(); }
    if (name === 'settings') { loadSettingsUI(); }
}

// ============ STAFF CRUD ============
function addStaff(e) {
    if (e) e.preventDefault();
    if (isSubmitting) return false;

    const codeEl = document.getElementById('emp-code');
    const nameEl = document.getElementById('emp-name');
    const deptEl = document.getElementById('emp-dept');
    const emailEl = document.getElementById('emp-email');
    const code = codeEl.value.trim();
    const name = nameEl.value.trim();
    const dept = deptEl.value.trim();
    const email = emailEl.value.trim();

    let valid = true;
    [codeEl, nameEl, deptEl, emailEl].forEach(el => {
        el.classList.remove('error');
        if (!el.value.trim()) { el.classList.add('error'); valid = false; }
    });
    if (!valid) { toast('All fields are required.', 'warning'); return false; }
    if (staffDB.some(e => e.code === code)) { codeEl.classList.add('error'); toast('Employee code already exists.', 'error'); return false; }

    isSubmitting = true;
    const btn = document.getElementById('btn-add-staff');
    btn.disabled = true; btn.textContent = '⏳ Adding…';

    staffDB.push({ code, name, dept, email });
    saveStaff();
    document.getElementById('staff-form').reset();
    [codeEl, nameEl, deptEl, emailEl].forEach(el => el.classList.remove('error'));

    const card = document.getElementById('staff-form-card');
    card.classList.remove('success-flash');
    void card.offsetWidth;
    card.classList.add('success-flash');

    toast(`${name} added to the system ✓`, 'success');
    renderStaffList();
    setTimeout(() => { isSubmitting = false; btn.disabled = false; btn.textContent = '➕ Add to System'; }, 400);
    return false;
}

function removeStaff(index) {
    const emp = staffDB[index];
    if (!confirm(`Remove ${emp.name} (${emp.code})?`)) return;
    staffDB.splice(index, 1);
    saveStaff(); renderStaffList();
    toast('Staff removed.', 'info');
}

function openEditModal(index) {
    const emp = staffDB[index];
    document.getElementById('edit-index').value = index;
    document.getElementById('edit-code').value = emp.code;
    document.getElementById('edit-name').value = emp.name;
    document.getElementById('edit-dept').value = emp.dept;
    document.getElementById('edit-email').value = emp.email;
    document.getElementById('edit-modal').style.display = 'flex';
}
function closeEditModal() { document.getElementById('edit-modal').style.display = 'none'; }

function saveEdit() {
    const index = parseInt(document.getElementById('edit-index').value);
    const name = document.getElementById('edit-name').value.trim();
    const dept = document.getElementById('edit-dept').value.trim();
    const email = document.getElementById('edit-email').value.trim();
    if (!name || !dept || !email) { toast('All fields are required.', 'warning'); return; }
    staffDB[index].name = name;
    staffDB[index].dept = dept;
    staffDB[index].email = email;
    saveStaff(); closeEditModal(); renderStaffList();
    toast(`${name} updated successfully ✓`, 'success');
}

// Bulk
function toggleSelectAll(checked) {
    document.querySelectorAll('.card-checkbox').forEach(cb => {
        cb.checked = checked;
        cb.closest('.staff-card')?.classList.toggle('selected', checked);
    });
    updateSelectedCount();
}
function onCardCheckChange(cb) {
    cb.closest('.staff-card')?.classList.toggle('selected', cb.checked);
    updateSelectedCount();
    const allCbs = document.querySelectorAll('.card-checkbox');
    const sa = document.getElementById('select-all-cb');
    if (sa) sa.checked = [...allCbs].every(c => c.checked) && allCbs.length > 0;
}
function updateSelectedCount() {
    const el = document.getElementById('selected-count');
    if (el) el.textContent = document.querySelectorAll('.card-checkbox:checked').length;
}
function deleteSelected() {
    const checked = document.querySelectorAll('.card-checkbox:checked');
    if (checked.length === 0) { toast('No staff selected.', 'warning'); return; }
    if (!confirm(`Delete ${checked.length} employee(s)?`)) return;
    [...checked].map(cb => parseInt(cb.dataset.index)).sort((a, b) => b - a).forEach(i => staffDB.splice(i, 1));
    saveStaff(); document.getElementById('select-all-cb').checked = false;
    renderStaffList(); toast(`${checked.length} employee(s) deleted.`, 'info');
}

function renderStaffList() {
    const container = document.getElementById('staff-list');
    const badge = document.getElementById('staff-count-badge');
    const bulkToolbar = document.getElementById('bulk-toolbar');
    badge.textContent = staffDB.length;
    bulkToolbar.style.display = staffDB.length > 0 ? 'flex' : 'none';
    if (staffDB.length === 0) { container.innerHTML = '<p class="empty-msg">No staff registered yet.</p>'; return; }
    container.innerHTML = staffDB.map((emp, i) => `
        <div class="staff-card" id="card-${i}">
            <div class="card-actions">
                <button class="btn-card-action edit" onclick="openEditModal(${i})" title="Edit">✏️</button>
                <button class="btn-card-action delete" onclick="removeStaff(${i})" title="Remove">✕</button>
            </div>
            <div class="emp-code">${emp.code}</div>
            <div class="emp-name">${emp.name}</div>
            <div class="emp-dept">${emp.dept}</div>
            <div class="emp-email">📧 ${emp.email}</div>
            <input type="checkbox" class="card-checkbox" data-index="${i}" onchange="onCardCheckChange(this)">
        </div>
    `).join('');
}

// ============ EXCEL IMPORT/EXPORT ============
function downloadSampleExcel() {
    const sampleData = [
        { 'Employee Code': 'EMP-001', 'Full Name': 'Rahul Sharma', 'Department': 'Accounting', 'Email': 'rahul@company.com' },
        { 'Employee Code': 'EMP-002', 'Full Name': 'Priya Singh', 'Department': 'HR', 'Email': 'priya@company.com' },
        { 'Employee Code': 'EMP-003', 'Full Name': 'Amit Kumar', 'Department': 'IT', 'Email': 'amit@company.com' }
    ];
    const ws = XLSX.utils.json_to_sheet(sampleData);
    ws['!cols'] = [{ wch: 16 }, { wch: 22 }, { wch: 18 }, { wch: 28 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Staff');
    XLSX.writeFile(wb, 'BookMyCA_Sample_Staff.xlsx');
    toast('📥 Sample Excel downloaded!', 'success');
}

function exportStaffExcel() {
    if (staffDB.length === 0) { toast('No staff data to export.', 'warning'); return; }
    const data = staffDB.map(emp => ({ 'Employee Code': emp.code, 'Full Name': emp.name, 'Department': emp.dept, 'Email': emp.email }));
    const ws = XLSX.utils.json_to_sheet(data);
    ws['!cols'] = [{ wch: 16 }, { wch: 22 }, { wch: 18 }, { wch: 28 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Staff');
    XLSX.writeFile(wb, 'BookMyCA_Staff_Export.xlsx');
    toast('📤 Staff data exported!', 'success');
}

function handleExcelFile(event) {
    const file = event.target.files[0];
    if (!file) return;
    processExcelFile(file);
    event.target.value = '';
}

function processExcelFile(file) {
    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const data = new Uint8Array(e.target.result);
            const wb = XLSX.read(data, { type: 'array' });
            const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
            if (rows.length === 0) { toast('Excel file is empty.', 'warning'); return; }

            let added = 0, skipped = 0, errors = 0;
            rows.forEach((row, idx) => {
                const code = String(row['Employee Code'] || row['Code'] || row['code'] || row['EmpCode'] || '').trim();
                const name = String(row['Full Name'] || row['Name'] || row['name'] || row['Employee Name'] || '').trim();
                const dept = String(row['Department'] || row['Dept'] || row['department'] || '').trim();
                const email = String(row['Email'] || row['email'] || row['Email Address'] || '').trim();
                if (!code || !name || !dept || !email) { errors++; return; }
                if (staffDB.some(e => e.code === code)) { skipped++; return; }
                staffDB.push({ code, name, dept, email }); added++;
            });

            saveStaff(); renderStaffList();
            let msg = `📊 Import: ${added} added`;
            if (skipped) msg += `, ${skipped} duplicates skipped`;
            if (errors) msg += `, ${errors} errors`;
            toast(msg, added > 0 ? 'success' : 'warning', 5000);
        } catch (err) {
            toast('❌ Could not parse file.', 'error');
        }
    };
    reader.readAsArrayBuffer(file);
}

function initDragDrop() {
    const zone = document.getElementById('excel-drop-zone');
    if (!zone) return;
    ['dragenter', 'dragover'].forEach(evt => {
        zone.addEventListener(evt, e => { e.preventDefault(); e.stopPropagation(); zone.classList.add('drag-over'); });
    });
    ['dragleave', 'drop'].forEach(evt => {
        zone.addEventListener(evt, e => { e.preventDefault(); e.stopPropagation(); zone.classList.remove('drag-over'); });
    });
    zone.addEventListener('drop', e => {
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            const ext = files[0].name.split('.').pop().toLowerCase();
            if (['xlsx', 'xls', 'csv'].includes(ext)) processExcelFile(files[0]);
            else toast('Please upload an Excel or CSV file.', 'warning');
        }
    });
}

// ============ LOGS & REPORTS ============
function updateLogStats() {
    document.getElementById('total-logs').textContent = attendanceLogs.length;
    const today = getTodayStr();
    const todayLogs = attendanceLogs.filter(l => l.date === today);
    document.getElementById('today-logs').textContent = todayLogs.length;
    document.getElementById('late-count').textContent = todayLogs.filter(l => l.status === 'LATE').length;
}

function renderLogsTable() {
    const tbody = document.getElementById('logs-tbody');
    const noMsg = document.getElementById('no-logs');
    if (attendanceLogs.length === 0) { tbody.innerHTML = ''; noMsg.style.display = 'block'; return; }
    noMsg.style.display = 'none';
    tbody.innerHTML = attendanceLogs.slice().reverse().map(l => {
        const statusBadge = l.type === 'IN'
            ? `<span class="badge ${l.status === 'LATE' ? 'badge-late' : 'badge-ontime'}">${l.status}</span>`
            : '—';
        const typeBadge = `<span class="badge ${l.type === 'IN' ? 'badge-in' : 'badge-out'}">${l.type}</span>`;
        const coordsCell = l.coords
            ? `<a href="${l.mapUrl}" target="_blank" class="coords-link">${l.coords.lat.toFixed(4)}, ${l.coords.lng.toFixed(4)}</a>`
            : '—';
        const hours = l.type === 'OUT' ? (getWorkingHours(l.code, l.date) || '—') : '—';
        return `<tr>
            <td>${l.date}</td><td>${l.time}</td>
            <td>${typeBadge}</td><td>${statusBadge}</td>
            <td>${l.code}</td><td><strong>${l.name}</strong></td>
            <td>${l.department}</td>
            <td>${coordsCell}</td>
            <td>${hours}</td>
            <td>${l.snapshot ? `<img src="${l.snapshot}" class="thumb" alt="snap">` : '—'}</td>
        </tr>`;
    }).join('');
}

// ============ PDF EXPORT (MATCHING SAMPLE REPORT) ============
function exportPDF() {
    if (attendanceLogs.length === 0) { toast('No logs to export.', 'warning'); return; }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p', 'mm', 'a4');
    const pw = doc.internal.pageSize.getWidth();
    const ph = doc.internal.pageSize.getHeight();

    // Title page header
    doc.setFillColor(11, 60, 93);
    doc.rect(0, 0, pw, 24, 'F');
    doc.setFillColor(200, 169, 81);
    doc.rect(0, 24, pw, 2, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('Smart Attend - Daily Report', pw / 2, 16, { align: 'center' });

    doc.setTextColor(100, 100, 100);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    const nowStr = new Date().toLocaleString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    doc.text('Report Generated: ' + nowStr, 14, 36);

    let y = 46;

    attendanceLogs.forEach((entry, idx) => {
        // Check if we need a new page
        if (y > ph - 80) {
            doc.addPage();
            y = 20;
        }

        // Divider
        doc.setDrawColor(200, 200, 200);
        doc.line(14, y, pw - 14, y);
        y += 8;

        // Name & code
        doc.setTextColor(11, 60, 93);
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text(`Name: ${entry.name} (${entry.code})`, 14, y);

        // Status badge
        y += 6;
        if (entry.type === 'IN') {
            if (entry.status === 'LATE') {
                doc.setTextColor(231, 76, 60);
                doc.text('Status: LATE', 14, y);
            } else {
                doc.setTextColor(39, 174, 96);
                doc.text('Status: ON TIME', 14, y);
            }
        } else {
            doc.setTextColor(200, 169, 81);
            doc.text('Type: CHECK-OUT', 14, y);
        }

        // Dept & Time
        y += 6;
        doc.setTextColor(80, 80, 80);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.text(`Dept: ${entry.department} | Time: ${entry.time}`, 14, y);

        // Working hours (for OUT entries)
        if (entry.type === 'OUT') {
            const hrs = getWorkingHours(entry.code, entry.date);
            if (hrs) {
                y += 5;
                doc.setFont('helvetica', 'bold');
                doc.text(`Working Hours: ${hrs}`, 14, y);
                doc.setFont('helvetica', 'normal');
            }
        }

        // Location Details
        y += 8;
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(11, 60, 93);
        doc.setFontSize(9);
        doc.text('Location Details:', 14, y);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(80, 80, 80);

        y += 5;
        // Area
        const locLines = doc.splitTextToSize('Area: ' + (entry.location || 'N/A'), 110);
        doc.text(locLines, 14, y);
        y += locLines.length * 4;

        // Coords
        if (entry.coords) {
            doc.text(`Coords: ${entry.coords.lat.toFixed(4)}, ${entry.coords.lng.toFixed(4)}`, 14, y);
            y += 4;
        }

        // IP
        if (entry.ip) {
            doc.text(`IP: ${entry.ip}`, 14, y);
            y += 4;
        }

        // Map link
        if (entry.mapUrl) {
            doc.setTextColor(20, 85, 128);
            doc.textWithLink('Map: ' + entry.mapUrl, 14, y, { url: entry.mapUrl });
            doc.setTextColor(80, 80, 80);
            y += 4;
        }

        // Snapshot on right side
        if (entry.snapshot) {
            try {
                const snapY = y - 30;
                doc.addImage(entry.snapshot, 'JPEG', pw - 14 - 40, Math.max(snapY, y - 28), 40, 30);
            } catch (e) { /* skip if image fails */ }
        }

        y += 12;
    });

    // Footer on last page
    doc.setFontSize(7);
    doc.setTextColor(160, 160, 160);
    doc.text('Generated by BookMyCA Smart Attend Suite', pw / 2, ph - 8, { align: 'center' });

    doc.save('BookMyCA_Attendance_Report.pdf');
    toast('PDF Report downloaded!', 'success');
}

// ============ GEOFENCE & PROXIMITY REMINDER ============
function haversineDistance(lat1, lng1, lat2, lng2) {
    const R = 6371000; // meters
    const rad = Math.PI / 180;
    const dLat = (lat2 - lat1) * rad;
    const dLng = (lng2 - lng1) * rad;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * rad) * Math.cos(lat2 * rad) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function startGeofenceWatch() {
    if (!navigator.geolocation) return;

    // Request notification permission
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }

    geoWatchId = navigator.geolocation.watchPosition(
        (pos) => {
            const dist = haversineDistance(
                pos.coords.latitude, pos.coords.longitude,
                settings.officeLat, settings.officeLng
            );

            if (dist <= settings.geofenceRadius) {
                // Check if already notified today
                const today = getTodayStr();
                const notifiedKey = 'geofence_notified_' + today;
                if (!localStorage.getItem(notifiedKey)) {
                    showProximityNotification();
                    localStorage.setItem(notifiedKey, '1');
                }
            }
        },
        () => { /* silence errors */ },
        { enableHighAccuracy: true, maximumAge: 60000, timeout: 15000 }
    );
}

function showProximityNotification() {
    if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('📍 BookMyCA Smart Attend', {
            body: 'You are near the office! Mark your attendance now.',
            icon: 'icon-192.png',
            tag: 'attendance-reminder',
            vibrate: [200, 100, 200]
        });
    } else {
        toast('📍 You are near the office — mark your attendance!', 'info', 6000);
    }
}

// ============ INIT ============
document.addEventListener('DOMContentLoaded', () => {
    showScreen('screen-main');
    initDragDrop();
    startGeofenceWatch();
});
