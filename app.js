/* =============================================
   BookMyCA Smart Attend — App Logic v4.0
   API-Based, Employee Self-Service, Dashboard
   ============================================= */

// --- State ---
let authToken = localStorage.getItem('sa_token') || null;
let currentUser = JSON.parse(localStorage.getItem('sa_user') || 'null');
let cameraStream = null;
let currentLocation = "Fetching…";
let currentCoords = null;
let currentIP = null;
let geoWatchId = null;
let dashboardCharts = {};

const API = '';  // Same-origin

// ============ HELPERS ============
function togglePwd(inputId, btn) {
    const input = document.getElementById(inputId);
    if (!input) return;
    const isHidden = input.type === 'password';
    input.type = isHidden ? 'text' : 'password';
    btn.textContent = isHidden ? '🙈' : '👁️';
    btn.classList.toggle('open', isHidden);
}

function api(method, path, body, raw) {
    const headers = { 'Content-Type': 'application/json' };
    if (authToken) headers['Authorization'] = 'Bearer ' + authToken;
    const opts = { method, headers };
    if (body) opts.body = JSON.stringify(body);
    if (raw) return fetch(API + path, opts);
    return fetch(API + path, opts).then(async r => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || 'Request failed');
        return data;
    });
}

function toast(msg, type = 'info', duration = 3500) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.className = 'toast ' + type;
    requestAnimationFrame(() => el.classList.add('show'));
    clearTimeout(el._timer);
    el._timer = setTimeout(() => el.classList.remove('show'), duration);
}

function getTodayStr() {
    return new Date().toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function logout() {
    authToken = null;
    currentUser = null;
    localStorage.removeItem('sa_token');
    localStorage.removeItem('sa_user');
    showScreen('screen-main');
}

// ============ PUSH NOTIFICATIONS ============
const VAPID_PUBLIC_KEY = 'BPB2UOrCQQ9SfBbmNxTM4Yvcd8GB_nDg8v1LPpBOpRKtreK8JE_keabQSSnVrkW7CA0urYqfiM_h4qERCzGN3gA';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) { outputArray[i] = rawData.charCodeAt(i); }
  return outputArray;
}

async function initPushNotifications() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    try {
        const reg = await navigator.serviceWorker.ready;
        let sub = await reg.pushManager.getSubscription();
        
        if (!sub) {
            const perm = await Notification.requestPermission();
            if (perm === 'granted') {
                sub = await reg.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
                });
            }
        }
        
        if (sub) {
            await api('POST', '/api/notifications/subscribe', sub);
            console.log('[Push] Subscribed successfully');
        }
    } catch (err) {
        console.error('Push Notifications Error:', err);
    }
}

// ============ SCREEN MANAGEMENT ============
function showScreen(id) {
    stopCamera();
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const screen = document.getElementById(id);
    if (screen) screen.classList.add('active');

    if (id === 'screen-admin-portal') initAdminPortal();
    if (id === 'screen-emp-dashboard') initEmpDashboard();
}

// ============ EMPLOYEE AUTH ============
async function empLogin(e) {
    if (e) e.preventDefault();
    const email = document.getElementById('emp-login-email').value.trim();
    const password = document.getElementById('emp-login-password').value.trim();
    
    if (!email || !password) { 
        toast('Please enter both email and password', 'warning'); 
        return; 
    }

    const btn = document.getElementById('btn-emp-login');
    btn.disabled = true; btn.textContent = '⏳ Logging In…';

    try {
        const data = await api('POST', '/api/auth/employee-login', { email, password });
        authToken = data.token;
        // Store full employee object including permissions for RBAC
        currentUser = { ...data.employee, type: 'employee' };
        localStorage.setItem('sa_token', authToken);
        localStorage.setItem('sa_user', JSON.stringify(currentUser));
        
        // Initialize sidebar if employee has module permissions
        if (window.initGlobalSidebar) window.initGlobalSidebar();
        
        toast(`Welcome, ${currentUser.name}! ✓`, 'success');
        showScreen('screen-emp-dashboard');
        initPushNotifications();
    } catch (err) {
        toast('❌ ' + err.message, 'error');
    } finally {
        btn.disabled = false; btn.textContent = '👤 Log In';
    }
}


// ============ EMPLOYEE DASHBOARD ============
function initEmpDashboard() {
    if (!currentUser) { showScreen('screen-main'); return; }
    document.getElementById('emp-welcome-name').textContent = currentUser.name;
    document.getElementById('emp-welcome-code').textContent = currentUser.code;
    document.getElementById('emp-welcome-dept').textContent = currentUser.dept;
    document.getElementById('emp-welcome-shift').textContent = currentUser.shift || 'General';
    loadEmpProfilePhoto(); // Load profile photo (non-blocking)
    loadEmpTodayStatus();
    loadEmpRecentLogs();
    loadEmpLeaves();
}

async function loadEmpTodayStatus() {
    try {
        const logs = await api('GET', '/api/attendance/my-logs');
        const today = getTodayStr();
        const todayIn = logs.find(l => l.date === today && l.type === 'IN');
        const todayOut = logs.find(l => l.date === today && l.type === 'OUT');

        const statusEl = document.getElementById('emp-today-status');
        const btnIn = document.getElementById('btn-emp-checkin');
        const btnOut = document.getElementById('btn-emp-checkout');

        if (todayIn && todayOut) {
            statusEl.innerHTML = `<span class="badge badge-out">Checked Out</span> In: ${todayIn.time} | Out: ${todayOut.time} | ${todayOut.status}`;
            if(btnIn) btnIn.disabled = true;
            if(btnOut) btnOut.disabled = true;
        } else if (todayIn) {
            statusEl.innerHTML = `<span class="badge badge-in">Checked In</span> at ${todayIn.time} — <span class="badge ${todayIn.status === 'LATE' ? 'badge-late' : 'badge-ontime'}">${todayIn.status}</span>`;
            if(btnIn) btnIn.disabled = true;
            if(btnOut) btnOut.disabled = false;
        } else {
            statusEl.innerHTML = `<span class="badge badge-absent">Not Checked In</span>`;
            if(btnIn) btnIn.disabled = false;
            if(btnOut) btnOut.disabled = true;
        }
    } catch (err) {
        console.error(err);
    }
}

async function loadEmpRecentLogs() {
    try {
        const logs = await api('GET', '/api/attendance/my-logs');
        const tbody = document.getElementById('emp-logs-tbody');
        if (logs.length === 0) { tbody.innerHTML = '<tr><td colspan="5" class="empty-msg">No records yet</td></tr>'; return; }
        tbody.innerHTML = logs.slice(0, 20).map(l => {
            const photoCell = l.snapshot ? `<img src="${l.snapshot}" class="thumb" onclick="window.open('${l.snapshot}', '_blank')" style="cursor:pointer;" title="Click to view">` : `<div class="thumb" style="display:flex;align-items:center;justify-content:center;background:#eee;font-size:0.6rem;text-align:center;">No Photo</div>`;
            const locText = l.location || (l.coords ? `${l.coords.lat.toFixed(4)}, ${l.coords.lng.toFixed(4)}` : 'Unknown Location');
            const locCell = l.mapUrl ? `<a href="${l.mapUrl}" target="_blank" class="coords-link">📍 ${locText.substring(0, 30)}…</a>` : (locText.substring(0, 30) + '…');
            return `
            <tr>
                <td>${l.date}</td>
                <td>${l.time}</td>
                <td><span class="badge ${l.type === 'IN' ? 'badge-in' : 'badge-out'}">${l.type}</span></td>
                <td>${l.type === 'IN' ? `<span class="badge ${l.status === 'LATE' ? 'badge-late' : 'badge-ontime'}">${l.status}</span>` : l.status}</td>
                <td>${photoCell}</td>
                <td>${locCell}</td>
            </tr>`;
        }).join('');
    } catch (err) { console.error(err); }
}

async function loadEmpLeaves() {
    try {
        const leaves = await api('GET', '/api/leave/my-leaves');
        const list = document.getElementById('emp-leaves-list');
        if (leaves.length === 0) { list.innerHTML = '<p class="empty-msg">No leave requests</p>'; return; }
        list.innerHTML = leaves.map(l => `
            <div class="leave-card ${l.status}">
                <div class="leave-info">
                    <strong>${l.date}</strong> — ${l.leaveType.toUpperCase()}
                    ${l.reason ? `<br><small>${l.reason}</small>` : ''}
                </div>
                <span class="badge badge-${l.status}">${l.status.toUpperCase()}</span>
            </div>
        `).join('');
    } catch (err) { console.error(err); }
}

// Employee apply leave
async function empApplyLeave() {
    const dateInput = document.getElementById('leave-date').value;
    if (!dateInput) { toast('Select a date', 'warning'); return; }
    const d = new Date(dateInput);
    const date = d.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const leaveType = document.getElementById('leave-type').value;
    const reason = document.getElementById('leave-reason').value.trim();

    try {
        await api('POST', '/api/leave/request', { date, leaveType, reason });
        toast('Leave request submitted ✓', 'success');
        document.getElementById('leave-date').value = '';
        document.getElementById('leave-reason').value = '';
        loadEmpLeaves();
    } catch (err) {
        toast('❌ ' + err.message, 'error');
    }
}

// ============ EMPLOYEE CHECK-IN ============
function startEmpCheckin() {
    showScreen('screen-emp-checkin');
    startCamera('emp-camera-feed');
    fetchLocation('emp-location-badge');
}

function startEmpCheckout() {
    showScreen('screen-emp-checkout');
    startCamera('emp-camera-feed-out');
    fetchLocation('emp-location-badge-out');
}

async function empCaptureAndMark(type) {
    const videoId = type === 'IN' ? 'emp-camera-feed' : 'emp-camera-feed-out';
    const canvasId = type === 'IN' ? 'emp-snapshot-canvas' : 'emp-snapshot-canvas-out';
    const previewId = type === 'IN' ? 'emp-snapshot-preview' : 'emp-snapshot-preview-out';

    const video = document.getElementById(videoId);
    const canvas = document.getElementById(canvasId);
    const preview = document.getElementById(previewId);

    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
    const photoData = canvas.toDataURL('image/jpeg', 0.75);

    preview.src = photoData;
    preview.style.display = 'block';
    video.style.display = 'none';
    stopCamera();

    const endpoint = type === 'IN' ? '/api/attendance/checkin' : '/api/attendance/checkout';
    try {
        const data = await api('POST', endpoint, {
            location: currentLocation,
            coords: currentCoords,
            ip: currentIP,
            mapUrl: currentCoords ? `https://www.google.com/maps?q=${currentCoords.lat},${currentCoords.lng}` : null,
            snapshot: photoData
        });
        if (type === 'IN') {
            const statusMsg = data.status === 'LATE' ? '⚠️ LATE' : '✅ ON TIME';
            toast(`Check-In marked! ${statusMsg}`, data.status === 'LATE' ? 'warning' : 'success');
        } else {
            toast(`Check-Out marked! Working: ${data.workingHours}`, 'success');
        }
        setTimeout(() => { showScreen('screen-emp-dashboard'); initEmpDashboard(); }, 1800);
    } catch (err) {
        toast('❌ ' + err.message, 'error');
    }
}

// ============ CAMERA ============
async function startCamera(videoId) {
    const video = document.getElementById(videoId);
    const previewId = videoId.replace('camera-feed', 'snapshot-preview');
    const preview = document.getElementById(previewId);
    video.style.display = 'block';
    if (preview) preview.style.display = 'none';
    try {
        // Try front camera first
        cameraStream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
            audio: false 
        });
        video.srcObject = cameraStream;
        await video.play();
    } catch (err) {
        console.error('Camera error:', err.name, err.message);
        let msg = '📷 Camera access denied. ';
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
            msg += 'Please allow camera permission in your browser settings. Go to Settings → Site Settings → Camera → Allow for this site.';
        } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
            msg += 'No camera found on your device. Please use Web Check-In button instead.';
        } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
            msg += 'Camera is being used by another app. Please close other camera apps and retry.';
        } else if (err.name === 'OverconstrainedError') {
            // Try again without constraints
            try {
                cameraStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
                video.srcObject = cameraStream;
                await video.play();
                return; // Success on retry
            } catch(_) {
                msg += 'Camera not compatible. Please use Web Check-In button instead.';
            }
        } else if (err.name === 'AbortError') {
            msg += 'Camera was interrupted. Please try again.';
        } else {
            msg += 'Unknown error: ' + err.message + '. Try Web Check-In instead.';
        }
        toast(msg, 'error', 6000);
        
        // Show a helpful overlay on the camera area
        const container = video.parentElement;
        if (container) {
            video.style.display = 'none';
            let helpDiv = container.querySelector('.camera-help-overlay');
            if (!helpDiv) {
                helpDiv = document.createElement('div');
                helpDiv.className = 'camera-help-overlay';
                helpDiv.style.cssText = 'display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px;text-align:center;background:#1E293B;border-radius:12px;min-height:200px;';
                container.appendChild(helpDiv);
            }
            helpDiv.innerHTML = `
                <div style="font-size:3rem;margin-bottom:12px;">📷❌</div>
                <p style="color:#F87171;font-weight:600;margin:0 0 8px 0;">Camera Permission Required</p>
                <p style="color:#94A3B8;font-size:0.8rem;line-height:1.5;margin:0 0 12px 0;">Allow camera access in your phone/browser settings, or use the <strong style="color:#38BDF8;">Web Check-In</strong> button from your dashboard.</p>
                <a href="camera-guide.html" target="_blank" style="color:#38BDF8;font-size:0.8rem;text-decoration:underline;">📖 View Camera Permission Guide</a>
                <button class="btn btn-ghost" onclick="showScreen('screen-emp-dashboard')" style="margin-top:12px;">← Back to Dashboard</button>
            `;
        }
    }
}

function stopCamera() {
    if (cameraStream) { cameraStream.getTracks().forEach(t => t.stop()); cameraStream = null; }
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
    
    // Attempt 1: Browser GPS
    navigator.geolocation.getCurrentPosition(
        async (pos) => {
            const { latitude, longitude } = pos.coords;
            currentCoords = { lat: latitude, lng: longitude };
            
            try {
                // Primary: OpenStreetMap Nominatim for exact street address
                const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&addressdetails=1`);
                const data = await res.json();
                if (data && data.display_name) {
                    // Extract exactly what's needed for a clean short address if available, else use full
                    currentLocation = data.display_name;
                } else {
                    throw new Error("Nominatim failed");
                }
            } catch (err1) { 
                try {
                    // Fallback: BigDataCloud for City/State level
                    const res2 = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`);
                    const data2 = await res2.json();
                    if (data2.locality) {
                        currentLocation = `${data2.locality}, ${data2.principalSubdivision}, ${data2.countryName}`;
                    } else {
                        throw new Error("BigDataCloud failed");
                    }
                } catch (err2) {
                    // Final Fallback: Raw Coordinates
                    currentLocation = `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
                }
            }
            badge.innerHTML = `<span class="pulse-dot"></span> 📍 ${currentLocation.substring(0, 40)}...`;
        },
        () => {
            // Attempt 2: IP-based Location (if GPS is denied)
            fetch('https://ipapi.co/json/').then(r => r.json()).then(d => {
                currentIP = d.ip || null;
                currentLocation = `${d.city || 'Unknown City'}, ${d.region || ''}, ${d.country_name || ''}`;
                if (d.latitude && d.longitude) currentCoords = { lat: d.latitude, lng: d.longitude };
                badge.innerHTML = `<span class="pulse-dot"></span> 🌐 ${currentLocation}`;
            }).catch(() => { badge.innerHTML = '<span class="pulse-dot"></span> Could not determine location'; });
        },
        { enableHighAccuracy: true, timeout: 10000 }
    );
    fetch('https://ipapi.co/json/').then(r => r.json()).then(d => { currentIP = d.ip || null; }).catch(() => {});
}

// ============ WEB CHECK-IN/OUT (No Camera Fallback) ============
async function empWebCheckMark(type) {
    if (!currentUser) { toast('Please log in first', 'warning'); return; }
    
    const confirmMsg = type === 'IN' 
        ? '🌐 Web Check-In: Your attendance will be marked without a photo. Your IP address will be logged for audit. Proceed?'
        : '🌐 Web Check-Out: Your checkout will be marked without a photo. Your IP address will be logged for audit. Proceed?';
    
    if (!confirm(confirmMsg)) return;
    
    // Fetch IP-based location as fallback
    let webLocation = 'Web Check-In (No GPS)';
    let webCoords = null;
    let webIP = null;
    
    try {
        const ipRes = await fetch('https://ipapi.co/json/');
        const ipData = await ipRes.json();
        webIP = ipData.ip || null;
        webLocation = `Web: ${ipData.city || 'Unknown'}, ${ipData.region || ''}, ${ipData.country_name || ''}`;
        if (ipData.latitude && ipData.longitude) {
            webCoords = { lat: ipData.latitude, lng: ipData.longitude };
        }
    } catch(e) { console.warn('IP fetch failed:', e); }
    
    const endpoint = type === 'IN' ? '/api/attendance/checkin' : '/api/attendance/checkout';
    try {
        const data = await api('POST', endpoint, {
            location: webLocation,
            coords: webCoords,
            ip: webIP,
            mapUrl: webCoords ? `https://www.google.com/maps?q=${webCoords.lat},${webCoords.lng}` : null,
            snapshot: null  // No photo for web check-in
        });
        if (type === 'IN') {
            const statusMsg = data.status === 'LATE' ? '⚠️ LATE' : '✅ ON TIME';
            toast(`🌐 Web Check-In successful! ${statusMsg}`, data.status === 'LATE' ? 'warning' : 'success');
        } else {
            toast(`🌐 Web Check-Out successful! Working: ${data.workingHours}`, 'success');
        }
        loadEmpTodayStatus();
        loadEmpRecentLogs();
    } catch (err) {
        toast('❌ ' + err.message, 'error');
    }
}

// ============ ADMIN AUTH ============
async function adminLogin() {
    const email = document.getElementById('admin-email').value.trim();
    const pass = document.getElementById('admin-pass').value;
    if (!email || !pass) { toast('Enter email and password', 'warning'); return; }

    try {
        const data = await api('POST', '/api/auth/admin-login', { email, password: pass });
        authToken = data.token;
        currentUser = { ...data.admin, type: 'admin' };
        localStorage.setItem('sa_token', authToken);
        localStorage.setItem('sa_user', JSON.stringify(currentUser));
        
        if (window.initGlobalSidebar) window.initGlobalSidebar();
        
        toast('Welcome, ' + currentUser.name, 'success');
        document.getElementById('admin-email').value = '';
        document.getElementById('admin-pass').value = '';
        showScreen('screen-admin-portal');
        initPushNotifications();
    } catch (err) {
        toast('❌ ' + err.message, 'error');
    }
}

// ─── Forgot Password Flow ───
function showForgotPassword() {
    const box = document.getElementById('forgotPwdBox');
    if (!box) return;
    // Reset to step 1
    const s1 = document.getElementById('fpStep1');
    const s2 = document.getElementById('fpStep2');
    if (s1) s1.style.display = '';
    if (s2) s2.style.display = 'none';
    const emailEl = document.getElementById('fp-email');
    if (emailEl) emailEl.value = '';
    box.style.display = box.style.display === 'none' ? '' : 'none';
}

async function sendForgotOTP() {
    const emailEl = document.getElementById('fp-email');
    const email = emailEl ? emailEl.value.trim() : '';
    if (!email) { toast('Please enter your email address', 'warning'); return; }

    const btn = document.getElementById('fpSendBtn');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Sending…'; }

    try {
        const data = await api('POST', '/api/auth/forgot-password', { email });
        if (data.success) {
            toast('✅ OTP sent to your email! Check inbox.', 'success');
            // Move to step 2
            const s1 = document.getElementById('fpStep1');
            const s2 = document.getElementById('fpStep2');
            if (s1) s1.style.display = 'none';
            if (s2) s2.style.display = '';
            // Store email for reset step
            window._forgotEmail = email;
        }
    } catch (err) {
        toast('❌ ' + err.message, 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = '📩 Send OTP'; }
    }
}

async function resetPassword() {
    const otp = (document.getElementById('fp-otp')?.value || '').trim();
    const newPass = (document.getElementById('fp-newpass')?.value || '').trim();
    const email = window._forgotEmail || '';

    if (!otp || otp.length < 6) { toast('Enter the 6-digit OTP from email', 'warning'); return; }
    if (!newPass || newPass.length < 4) { toast('New password must be at least 4 characters', 'warning'); return; }
    if (!email) { toast('Session expired. Please start again.', 'error'); return; }

    const btn = document.getElementById('fpResetBtn');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Resetting…'; }

    try {
        const data = await api('POST', '/api/auth/reset-password', { email, otp, newPassword: newPass });
        if (data.success) {
            toast('✅ Password reset successfully! Please log in.', 'success');
            // Hide forgot password box and go back to login
            const box = document.getElementById('forgotPwdBox');
            if (box) box.style.display = 'none';
            window._forgotEmail = null;
            // Clear fields
            const otpEl = document.getElementById('fp-otp');
            const passEl = document.getElementById('fp-newpass');
            if (otpEl) otpEl.value = '';
            if (passEl) passEl.value = '';
            // Show step 1 again for next time
            const s1 = document.getElementById('fpStep1');
            const s2 = document.getElementById('fpStep2');
            if (s1) s1.style.display = '';
            if (s2) s2.style.display = 'none';
        }
    } catch (err) {
        toast('❌ ' + err.message, 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = '🔓 Reset Password'; }
    }
}

// ============ ADMIN PORTAL ============

function initAdminPortal() {
    if (!currentUser || currentUser.type !== 'admin') { showScreen('screen-main'); return; }
    
    const nameEl = document.getElementById('admin-welcome-name');
    if (nameEl) nameEl.textContent = currentUser.name;
    
    const badgeEl = document.getElementById('admin-role-badge');
    if (badgeEl) badgeEl.textContent = currentUser.role;
    
    // Show/hide superadmin-only tabs
    const adminTab = document.getElementById('att-sub-admins') || document.getElementById('tab-btn-admins');
    if (adminTab) adminTab.style.display = currentUser.role === 'superadmin' ? '' : 'none';
    
    // Check URL hash for direct tab navigation
    let startTab = 'dashboard';
    if (window.location.hash) {
        const hash = window.location.hash.substring(1); // remove #
        if (document.getElementById('tab-' + hash) || hash === 'attendance') {
            startTab = hash;
        }
    }
    switchTab(startTab);
}

function switchTab(name) {
    document.querySelectorAll('.tab-panel').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.btn-nav, .att-sub-btn').forEach(b => b.classList.remove('active'));
    
    const panel = document.getElementById('tab-' + name);
    const btn = document.getElementById('tab-btn-' + name) || document.getElementById('att-sub-' + name);
    
    if (panel) panel.classList.add('active');
    if (btn) btn.classList.add('active');

    // For attendance sub-tabs (staff, reports, leaves), highlight Hub sidebar btn
    if (['staff','reports','leaves'].includes(name)) {
        const dashBtn = document.getElementById('tab-btn-dashboard');
        if(dashBtn) dashBtn.classList.add('active');
    }

    if (name === 'dashboard') loadDashboard();
    if (name === 'attendance') loadDashboard();
    if (name === 'staff') loadStaffList();
    if (name === 'reports') loadReports();
    if (name === 'leaves') loadLeaveRequests();
    if (name === 'settings') loadSettingsUI();
    if (name === 'admins') loadAdminList();
}

// Attendance sub-navigation handler
function switchAttSub(sub) {
    // Update active state of sub-nav buttons
    document.querySelectorAll('.att-sub-btn').forEach(b => b.classList.remove('active'));
    const btn = document.getElementById('att-sub-' + sub);
    if(btn) btn.classList.add('active');

    if (sub === 'overview') {
        // Show attendance tab with overview panel
        switchTab('attendance');
    } else if (sub === 'staff') {
        switchTab('staff');
    } else if (sub === 'reports') {
        switchTab('reports');
    } else if (sub === 'leaves') {
        switchTab('leaves');
    }
}

// ============ DASHBOARD ============
async function loadDashboard() {
    try {
        const d = await api('GET', '/api/attendance/dashboard');
        // Populate attendance stat cards (may be in attendance tab)
        const el = id => document.getElementById(id);
        if(el('dash-total-staff')) el('dash-total-staff').textContent = d.totalStaff;
        if(el('dash-present')) el('dash-present').textContent = d.presentToday;
        if(el('dash-absent')) el('dash-absent').textContent = d.absentToday;
        if(el('dash-late')) el('dash-late').textContent = d.lateTodayCount;
        if(el('dash-ontime')) el('dash-ontime').textContent = d.onTimeCount;
        if(el('dash-leaves')) el('dash-leaves').textContent = d.leavesToday;
        if(el('dash-avg-hours')) el('dash-avg-hours').textContent = d.avgHours + 'h';
        if(el('dash-pending-leaves')) el('dash-pending-leaves').textContent = d.pendingLeaves;

        // Populate hub attendance card
        if(el('hub-att-staff')) el('hub-att-staff').textContent = d.totalStaff;
        if(el('hub-att-present')) el('hub-att-present').textContent = d.presentToday;
        if(el('hub-att-absent')) el('hub-att-absent').textContent = d.absentToday;

        // Render charts only when canvas is in DOM and visible
        if(el('weekly-chart')) renderWeeklyChart(d.weeklyData);
        if(el('dept-chart')) renderDeptChart(d.deptBreakdown);
        // Top Late Table
        renderTopLate(d.topLate);
        // Absent List
        renderAbsentList(d.absentList);
    } catch (err) {
        console.error('Dashboard load error:', err);
    }
    // Load module hub stats
    loadModuleHubStats();
}

async function loadModuleHubStats() {
    const INR = n => '₹' + Number(n||0).toLocaleString('en-IN');
    const hdrs = { Authorization: 'Bearer ' + localStorage.getItem('sa_token') };
    // Tasks
    try {
        const r = await fetch('/api/tasks/all', {headers: hdrs});
        const d = await r.json();
        const tasks = d.tasks || [];
        const el1 = document.getElementById('hub-tasks-total');
        const el2 = document.getElementById('hub-tasks-pending');
        if(el1) el1.textContent = tasks.length;
        if(el2) el2.textContent = tasks.filter(t => t.workStatus !== 'Completed').length;
    } catch(_){}
    // Clients
    try {
        const r = await fetch('/api/clients', {headers: hdrs});
        const d = await r.json();
        const clients = d.clients || [];
        const el1 = document.getElementById('hub-clients-total');
        const el2 = document.getElementById('hub-clients-gst');
        if(el1) el1.textContent = clients.length;
        if(el2) el2.textContent = clients.filter(c => c.gstin && c.gstin.length >= 15).length;
    } catch(_){}
    // Invoices
    try {
        const r = await fetch('/api/invoices', {headers: hdrs});
        const d = await r.json();
        const invoices = d.invoices || [];
        const el1 = document.getElementById('hub-inv-total');
        const el2 = document.getElementById('hub-inv-billed');
        if(el1) el1.textContent = invoices.length;
        const total = invoices.reduce((s,i) => s + (i.totalAmount||0), 0);
        if(el2) el2.textContent = INR(total);
        // Revenue stats
        const received = invoices.filter(i => i.status === 'Paid').reduce((s,i) => s + (i.totalAmount||0), 0);
        const outstanding = total - received;
        const el3 = document.getElementById('hub-rev-received');
        const el4 = document.getElementById('hub-rev-outstanding');
        if(el3) el3.textContent = INR(received);
        if(el4) el4.textContent = INR(outstanding);
    } catch(_){}
    // My tasks
    try {
        const r = await fetch('/api/tasks/my', {headers: hdrs});
        const d = await r.json();
        const el = document.getElementById('hub-my-tasks');
        if(el) el.textContent = (d.tasks || []).length;
    } catch(_){}
}

function renderWeeklyChart(data) {
    const ctx = document.getElementById('weekly-chart');
    if (dashboardCharts.weekly) dashboardCharts.weekly.destroy();
    dashboardCharts.weekly = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: data.map(d => d.label),
            datasets: [
                { label: 'On Time', data: data.map(d => d.onTime), backgroundColor: '#27ae60', borderRadius: 4 },
                { label: 'Late', data: data.map(d => d.late), backgroundColor: '#e74c3c', borderRadius: 4 }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { labels: { color: '#ccc' } } },
            scales: {
                x: { stacked: true, ticks: { color: '#aaa' }, grid: { display: false } },
                y: { stacked: true, ticks: { color: '#aaa' }, grid: { color: 'rgba(255,255,255,0.05)' } }
            }
        }
    });
}

function renderDeptChart(data) {
    const ctx = document.getElementById('dept-chart');
    if (dashboardCharts.dept) dashboardCharts.dept.destroy();
    if (!data || data.length === 0) return;
    const colors = ['#C8A951', '#3498db', '#e74c3c', '#2ecc71', '#9b59b6', '#f39c12', '#1abc9c'];
    dashboardCharts.dept = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: data.map(d => d._id || 'Unknown'),
            datasets: [{ data: data.map(d => d.count), backgroundColor: colors.slice(0, data.length), borderWidth: 0 }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom', labels: { color: '#ccc', padding: 15 } } }
        }
    });
}

function renderTopLate(data) {
    const tbody = document.getElementById('top-late-tbody');
    if (!data || data.length === 0) { tbody.innerHTML = '<tr><td colspan="3" class="empty-msg">No late arrivals 🎉</td></tr>'; return; }
    tbody.innerHTML = data.map((d, i) => `
        <tr><td>${i + 1}</td><td>${d._id.name} (${d._id.code})</td><td><span class="badge badge-late">${d.count} days</span></td></tr>
    `).join('');
}

function renderAbsentList(data) {
    const tbody = document.getElementById('absent-tbody');
    if (!tbody) return;
    if (!data || data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="empty-msg">All employees present! 🎉</td></tr>';
        return;
    }
    tbody.innerHTML = data.map(d => `
        <tr>
            <td>${d.code}</td>
            <td><strong>${d.name}</strong></td>
            <td>${d.dept}</td>
            <td>${d.onLeave ? '<span class="badge badge-approved">ON LEAVE</span>' : '<span class="badge badge-absent">ABSENT</span>'}</td>
        </tr>
    `).join('');
}

// ============ STAFF MANAGEMENT ============
async function loadStaffList() {
    try {
        const staff = await api('GET', '/api/staff');
        document.getElementById('staff-count-badge').textContent = staff.length;
        const container = document.getElementById('staff-list');
        const bulkToolbar = document.getElementById('bulk-toolbar');
        bulkToolbar.style.display = staff.length > 0 ? 'flex' : 'none';
        if (staff.length === 0) { container.innerHTML = '<p class="empty-msg">No staff registered yet.</p>'; return; }
        container.innerHTML = staff.map((emp, i) => {
            const initials = emp.name.trim().split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase();
            const avatarHtml = emp.documents?.photo
                ? `<img src="${emp.documents.photo}" alt="${emp.name}" class="staff-avatar-img">`
                : `<div class="staff-avatar-initials">${initials}</div>`;
            return `
            <div class="staff-card" data-id="${emp._id}">
                <div class="card-actions">
                    <button class="btn-card-action edit" onclick="openEditModal('${emp._id}', '${emp.code}', '${emp.name.replace(/'/g, "\\'")}', '${emp.dept.replace(/'/g, "\\'")}', '${emp.email}', '${emp.shift || 'General'}', ${emp.baseSalary || 0})" title="Edit">✏️</button>
                    <button class="btn-card-action docs" onclick="openStaffDocs('${emp._id}', '${emp.name.replace(/'/g, "\\'")}')">📎</button>
                    <button class="btn-card-action delete" onclick="removeStaff('${emp._id}', '${emp.name.replace(/'/g, "\\'")}')" title="Remove">✕</button>
                </div>
                <div class="staff-avatar-wrap">${avatarHtml}</div>
                <div class="emp-code">${emp.code}</div>
                <div class="emp-name">${emp.name}</div>
                <div class="emp-dept">${emp.dept}</div>
                <div class="emp-email">📧 ${emp.email}</div>
                <div class="emp-shift">🕐 ${emp.shift || 'General'}</div>
                <input type="checkbox" class="card-checkbox" data-id="${emp._id}" onchange="onCardCheckChange(this)">
            </div>`;
        }).join('');
    } catch (err) {
        toast('Failed to load staff', 'error');
    }
}

async function addStaff(e) {
    if (e) e.preventDefault();
    const code = document.getElementById('emp-code').value.trim();
    const name = document.getElementById('emp-name').value.trim();
    const dept = document.getElementById('emp-dept').value.trim();
    const email = document.getElementById('emp-email').value.trim();
    const password = document.getElementById('emp-password').value.trim();
    const baseSalary = document.getElementById('emp-salary').value.trim();
    const shift = document.getElementById('emp-shift-select')?.value || 'General';
    
    if (!code || !name || !dept || !email) { toast('All fields required', 'warning'); return false; }

    const btn = document.getElementById('btn-add-staff');
    btn.disabled = true; btn.textContent = '⏳ Adding…';

    try {
        await api('POST', '/api/staff', { code, name, dept, email, password, baseSalary, shift });
        toast(`${name} added ✓`, 'success');
        document.getElementById('staff-form').reset();
        loadStaffList();
    } catch (err) {
        toast('❌ ' + err.message, 'error');
    } finally {
        btn.disabled = false; btn.textContent = '➕ Add to System';
    }
    return false;
}

async function removeStaff(id, name) {
    if (!confirm(`Remove ${name}?`)) return;
    try {
        await api('DELETE', `/api/staff/${id}`);
        toast('Staff removed', 'info');
        loadStaffList();
    } catch (err) { toast('❌ ' + err.message, 'error'); }
}

function openEditModal(id, code, name, dept, email, shift, baseSalary) {
    document.getElementById('edit-id').value = id;
    document.getElementById('edit-code').value = code;
    document.getElementById('edit-name').value = name;
    document.getElementById('edit-dept').value = dept;
    document.getElementById('edit-email').value = email;
    document.getElementById('edit-shift').value = shift || 'General';
    document.getElementById('edit-salary').value = baseSalary || 0;
    document.getElementById('edit-modal').style.display = 'flex';
}
function closeEditModal() { document.getElementById('edit-modal').style.display = 'none'; }

async function saveEdit() {
    const id = document.getElementById('edit-id').value;
    const name = document.getElementById('edit-name').value.trim();
    const dept = document.getElementById('edit-dept').value.trim();
    const email = document.getElementById('edit-email').value.trim();
    const shift = document.getElementById('edit-shift').value;
    const baseSalary = document.getElementById('edit-salary').value;
    if (!name || !dept || !email) { toast('All fields required', 'warning'); return; }

    try {
        await api('PUT', `/api/staff/${id}`, { name, dept, email, shift, baseSalary });
        toast(`${name} updated ✓`, 'success');
        closeEditModal(); loadStaffList();
    } catch (err) { toast('❌ ' + err.message, 'error'); }
}

// Bulk operations
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
}
function updateSelectedCount() {
    const el = document.getElementById('selected-count');
    if (el) el.textContent = document.querySelectorAll('.card-checkbox:checked').length;
}
async function deleteSelected() {
    const checked = document.querySelectorAll('.card-checkbox:checked');
    if (checked.length === 0) { toast('No staff selected', 'warning'); return; }
    if (!confirm(`Delete ${checked.length} employee(s)?`)) return;
    const ids = [...checked].map(cb => cb.dataset.id);
    try {
        await api('POST', '/api/staff/bulk/delete', { ids });
        toast(`${ids.length} deleted`, 'info');
        loadStaffList();
    } catch (err) { toast('❌ ' + err.message, 'error'); }
}

// Excel Import/Export
function downloadSampleExcel() {
    const sampleData = [
        { 'Employee Code': 'EMP-001', 'Full Name': 'Rahul Sharma', 'Department': 'Accounting', 'Email': 'rahul@company.com', 'Shift': 'General' },
        { 'Employee Code': 'EMP-002', 'Full Name': 'Priya Singh', 'Department': 'HR', 'Email': 'priya@company.com', 'Shift': 'Morning' }
    ];
    const ws = XLSX.utils.json_to_sheet(sampleData);
    ws['!cols'] = [{ wch: 16 }, { wch: 22 }, { wch: 18 }, { wch: 28 }, { wch: 12 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Staff');
    XLSX.writeFile(wb, 'BookMyCA_Sample_Staff.xlsx');
    toast('📥 Sample downloaded!', 'success');
}

async function exportStaffExcel() {
    try {
        const staff = await api('GET', '/api/staff');
        if (staff.length === 0) { toast('No staff to export', 'warning'); return; }
        const data = staff.map(emp => ({ 'Employee Code': emp.code, 'Full Name': emp.name, 'Department': emp.dept, 'Email': emp.email, 'Shift': emp.shift }));
        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Staff');
        XLSX.writeFile(wb, 'BookMyCA_Staff_Export.xlsx');
        toast('📤 Exported!', 'success');
    } catch (err) { toast('❌ ' + err.message, 'error'); }
}

function handleExcelFile(event) {
    const file = event.target.files[0];
    if (!file) return;
    processExcelFile(file);
    event.target.value = '';
}

async function processExcelFile(file) {
    const reader = new FileReader();
    reader.onload = async function (e) {
        try {
            const data = new Uint8Array(e.target.result);
            const wb = XLSX.read(data, { type: 'array' });
            const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
            if (rows.length === 0) { toast('File empty', 'warning'); return; }

            const employees = rows.map(row => ({
                code: String(row['Employee Code'] || row['Code'] || '').trim(),
                name: String(row['Full Name'] || row['Name'] || '').trim(),
                dept: String(row['Department'] || row['Dept'] || '').trim(),
                email: String(row['Email'] || '').trim(),
                shift: String(row['Shift'] || 'General').trim()
            }));

            const result = await api('POST', '/api/staff/bulk', { employees });
            toast(`📊 Import: ${result.added} added, ${result.skipped} skipped, ${result.errors} errors`, result.added > 0 ? 'success' : 'warning');
            loadStaffList();
        } catch (err) { toast('❌ Could not parse file', 'error'); }
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
            else toast('Upload Excel/CSV only', 'warning');
        }
    });
}

// ============ REPORTS (with filters) ============
async function loadReports() {
    const from = document.getElementById('filter-from')?.value || '';
    const to = document.getElementById('filter-to')?.value || '';
    const employee = document.getElementById('filter-employee')?.value || '';
    const dept = document.getElementById('filter-dept')?.value || '';
    const status = document.getElementById('filter-status')?.value || 'all';
    const type = document.getElementById('filter-type')?.value || 'all';

    // Convert date inputs (YYYY-MM-DD) to DD/MM/YYYY
    let fromStr = '', toStr = '';
    if (from) { const d = new Date(from); fromStr = d.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }); }
    if (to) { const d = new Date(to); toStr = d.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }); }

    const params = new URLSearchParams();
    if (fromStr) params.set('from', fromStr);
    if (toStr) params.set('to', toStr);
    if (employee) params.set('employee', employee);
    if (dept) params.set('dept', dept);
    if (status !== 'all') params.set('status', status);
    if (type !== 'all') params.set('type', type);

    try {
        const data = await api('GET', `/api/attendance/logs?${params}`);
        document.getElementById('total-logs').textContent = data.total;

        const tbody = document.getElementById('logs-tbody');
        const noMsg = document.getElementById('no-logs');
        if (data.logs.length === 0) { tbody.innerHTML = ''; noMsg.style.display = 'block'; return; }
        noMsg.style.display = 'none';

        tbody.innerHTML = data.logs.map(l => {
            const statusBadge = l.type === 'IN'
                ? `<span class="badge ${l.status === 'LATE' ? 'badge-late' : 'badge-ontime'}">${l.status}</span>` : l.status || '—';
            const typeBadge = `<span class="badge ${l.type === 'IN' ? 'badge-in' : 'badge-out'}">${l.type}</span>`;
            
            const photoCell = l.snapshot ? `<img src="${l.snapshot}" class="thumb" onclick="window.open('${l.snapshot}', '_blank')" style="cursor:pointer;" title="Click to view">` : `<div class="thumb" style="display:flex;align-items:center;justify-content:center;background:#eee;font-size:0.6rem;text-align:center;">No Photo</div>`;
            
            const locText = l.location || (l.coords ? `${l.coords.lat.toFixed(4)}, ${l.coords.lng.toFixed(4)}` : 'Unknown Location');
            const locCell = l.mapUrl ? `<a href="${l.mapUrl}" target="_blank" class="coords-link">📍 ${locText}</a>` : locText;

            return `<tr>
                <td>${l.date}</td><td>${l.time}</td>
                <td>${typeBadge}</td><td>${statusBadge}</td>
                <td>${l.code}</td><td><strong>${l.name}</strong></td>
                <td>${l.department}</td>
                <td>${photoCell}</td>
                <td>${locCell}</td>
            </tr>`;
        }).join('');

        // Populate employee filter dropdown
        populateFilterDropdowns();
    } catch (err) {
        toast('Failed to load reports', 'error');
    }
}

async function populateFilterDropdowns() {
    try {
        const staff = await api('GET', '/api/staff');
        const empSel = document.getElementById('filter-employee');
        if (empSel && empSel.options.length <= 1) {
            staff.forEach(emp => {
                const opt = document.createElement('option');
                opt.value = emp._id;
                opt.textContent = `${emp.name} (${emp.code})`;
                empSel.appendChild(opt);
            });
        }
        // Dept dropdown
        const deptSel = document.getElementById('filter-dept');
        if (deptSel && deptSel.options.length <= 1) {
            const depts = [...new Set(staff.map(s => s.dept))];
            depts.forEach(d => {
                const opt = document.createElement('option');
                opt.value = d;
                opt.textContent = d;
                deptSel.appendChild(opt);
            });
        }
    } catch (err) { /* ignore */ }
}

// PDF Export
async function exportPDF() {
    toast('Generating PDF…', 'info');
    try {
        const data = await api('GET', '/api/attendance/logs?limit=500');
        if (data.logs.length === 0) { toast('No logs to export', 'warning'); return; }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('l', 'mm', 'a4'); // landscape
        const pw = doc.internal.pageSize.getWidth();
        const ph = doc.internal.pageSize.getHeight();

        // Header
        doc.setFillColor(11, 60, 93);
        doc.rect(0, 0, pw, 20, 'F');
        doc.setFillColor(200, 169, 81);
        doc.rect(0, 20, pw, 1.5, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text('BookMyCA Smart Attend — Attendance Report', pw / 2, 13, { align: 'center' });

        doc.setTextColor(100, 100, 100);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.text('Generated: ' + new Date().toLocaleString('en-IN'), 14, 30);

        // Table
        const headers = ['Date', 'Time', 'Type', 'Status', 'Code', 'Name', 'Dept', 'Coordinates'];
        const colWidths = [25, 22, 15, 20, 20, 40, 30, 50];
        let y = 38;

        // Header row
        doc.setFillColor(11, 60, 93);
        doc.rect(14, y - 5, pw - 28, 8, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        let x = 16;
        headers.forEach((h, i) => { doc.text(h, x, y); x += colWidths[i]; });
        y += 8;

        doc.setFont('helvetica', 'normal');
        doc.setTextColor(60, 60, 60);
        data.logs.forEach((l, idx) => {
            if (y > ph - 15) { doc.addPage(); y = 20; }
            if (idx % 2 === 0) { doc.setFillColor(245, 247, 250); doc.rect(14, y - 4, pw - 28, 6, 'F'); }
            x = 16;
            const row = [l.date, l.time, l.type, l.status || '—', l.code, l.name, l.department,
                l.coords ? `${l.coords.lat?.toFixed(4)}, ${l.coords.lng?.toFixed(4)}` : '—'];
            doc.setFontSize(7);
            row.forEach((val, i) => { doc.text(String(val).substring(0, 30), x, y); x += colWidths[i]; });
            y += 6;
        });

        doc.setFontSize(7);
        doc.setTextColor(160, 160, 160);
        doc.text('BookMyCA Smart Attend Suite', pw / 2, ph - 5, { align: 'center' });
        doc.save('BookMyCA_Attendance_Report.pdf');
        toast('PDF downloaded! ✓', 'success');
    } catch (err) { toast('PDF export failed', 'error'); }
}

// Payroll Export
async function exportPayroll() {
    const month = document.getElementById('payroll-month')?.value;
    if (!month) { toast('Select a month', 'warning'); return; }
    const [y, m] = month.split('-');
    try {
        const res = await api('GET', `/api/export/payroll?month=${m}&year=${y}`, null, true);
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `payroll_${m}_${y}.csv`;
        a.click(); URL.revokeObjectURL(url);
        toast('Payroll CSV downloaded! ✓', 'success');
    } catch (err) { toast('Export failed', 'error'); }
}

// ============ LEAVE MANAGEMENT (Admin) ============
async function loadLeaveRequests() {
    const filterStatus = document.getElementById('leave-filter-status')?.value || 'all';
    try {
        const leaves = await api('GET', `/api/leave/list?status=${filterStatus}`);
        const container = document.getElementById('admin-leaves-list');
        if (leaves.length === 0) { container.innerHTML = '<p class="empty-msg">No leave requests</p>'; return; }
        container.innerHTML = leaves.map(l => `
            <div class="leave-card ${l.status}">
                <div class="leave-info">
                    <strong>${l.staffName}</strong> (${l.staffCode}) — ${l.date}
                    <br><small>${l.leaveType.toUpperCase()} ${l.reason ? '| ' + l.reason : ''}</small>
                </div>
                <div class="leave-actions">
                    ${l.status === 'pending' ? `
                        <button class="btn btn-sm btn-success" onclick="handleLeave('${l._id}', 'approved')">✅ Approve</button>
                        <button class="btn btn-sm btn-danger" onclick="handleLeave('${l._id}', 'rejected')">❌ Reject</button>
                    ` : `<span class="badge badge-${l.status}">${l.status.toUpperCase()}</span>${l.approvedBy ? `<small>by ${l.approvedBy}</small>` : ''}`}
                </div>
            </div>
        `).join('');
    } catch (err) { toast('Failed to load leaves', 'error'); }
}

async function handleLeave(id, status) {
    try {
        await api('PUT', `/api/leave/${id}`, { status });
        toast(`Leave ${status} ✓`, 'success');
        loadLeaveRequests();
        loadDashboard();
    } catch (err) { toast('❌ ' + err.message, 'error'); }
}

// ============ SETTINGS ============
async function loadSettingsUI() {
    try {
        const s = await api('GET', '/api/settings');
        document.getElementById('setting-start-time').value = s.officeStartTime;
        document.getElementById('setting-grace').value = s.graceMinutes;
        document.getElementById('setting-office-loc').value = `${s.officeLat}, ${s.officeLng}`;
        document.getElementById('setting-geofence').value = s.geofenceRadius;
        // Shifts
        renderShiftsUI(s.shifts || []);
        // Holidays
        renderHolidaysUI(s.holidays || []);
    } catch (err) { console.error(err); }
}

function renderHolidaysUI(holidays) {
    const list = document.getElementById('holidays-list');
    if (!list) return;
    if (holidays.length === 0) {
        list.innerHTML = '<p class="empty-msg" style="margin:5px 0;">No holidays configured.</p>';
        return;
    }
    // Sort by date ascending
    holidays.sort((a,b) => new Date(a.date) - new Date(b.date));
    list.innerHTML = holidays.map(h => `
        <div style="display:flex; justify-content:space-between; align-items:center; background:#f4f7f9; padding:8px 12px; border-radius:6px; border-left: 3px solid #C8A951;">
            <div>
                <strong>${h.date}</strong> — ${h.name}
            </div>
            <button class="btn btn-danger btn-sm" onclick="removeHoliday('${h.date}', '${h.name}')">✕</button>
        </div>
    `).join('');
}

async function addHoliday() {
    const date = document.getElementById('holiday-date').value;
    const name = document.getElementById('holiday-name').value.trim();
    if (!date || !name) { toast('Enter both holiday Date and Name', 'warning'); return; }
    try {
        const data = await api('POST', '/api/settings/holidays', { date, name });
        toast('Holiday added ✓', 'success');
        document.getElementById('holiday-date').value = '';
        document.getElementById('holiday-name').value = '';
        renderHolidaysUI(data.holidays);
    } catch (err) { toast('❌ ' + err.message, 'error'); }
}

async function removeHoliday(date, name) {
    if (!confirm(`Remove ${name} from holidays?`)) return;
    try {
        const data = await api('DELETE', `/api/settings/holidays/${date}`);
        toast('Holiday removed', 'info');
        renderHolidaysUI(data.holidays);
    } catch (err) { toast('❌ ' + err.message, 'error'); }
}

function renderShiftsUI(shifts) {
    const container = document.getElementById('shifts-list');
    if (!container) return;
    container.innerHTML = shifts.map((s, i) => `
        <div class="shift-card">
            <input type="text" class="form-input shift-name" value="${s.name}" placeholder="Shift Name">
            <input type="time" class="form-input shift-start" value="${s.startTime}">
            <input type="time" class="form-input shift-end" value="${s.endTime}">
            <input type="number" class="form-input shift-grace" value="${s.graceMinutes}" min="0" max="120" style="width:80px">
            <button class="btn btn-danger btn-sm" onclick="this.parentElement.remove()">✕</button>
        </div>
    `).join('');
}

function addShiftRow() {
    const container = document.getElementById('shifts-list');
    const div = document.createElement('div');
    div.className = 'shift-card';
    div.innerHTML = `
        <input type="text" class="form-input shift-name" value="" placeholder="Shift Name">
        <input type="time" class="form-input shift-start" value="09:00">
        <input type="time" class="form-input shift-end" value="18:00">
        <input type="number" class="form-input shift-grace" value="15" min="0" max="120" style="width:80px">
        <button class="btn btn-danger btn-sm" onclick="this.parentElement.remove()">✕</button>
    `;
    container.appendChild(div);
}

async function saveSettings() {
    const officeStartTime = document.getElementById('setting-start-time').value || '10:00';
    const graceMinutes = parseInt(document.getElementById('setting-grace').value) || 15;
    const locParts = (document.getElementById('setting-office-loc').value || '').split(',');
    const officeLat = parseFloat(locParts[0]?.trim()) || 26.892900;
    const officeLng = parseFloat(locParts[1]?.trim()) || 75.793900;
    const geofenceRadius = parseInt(document.getElementById('setting-geofence').value) || 500;

    // Collect shifts
    const shiftCards = document.querySelectorAll('.shift-card');
    const shifts = [...shiftCards].map(card => ({
        name: card.querySelector('.shift-name').value.trim() || 'General',
        startTime: card.querySelector('.shift-start').value || '10:00',
        endTime: card.querySelector('.shift-end').value || '19:00',
        graceMinutes: parseInt(card.querySelector('.shift-grace').value) || 15
    }));

    try {
        await api('PUT', '/api/settings', { officeStartTime, graceMinutes, officeLat, officeLng, geofenceRadius, shifts });
        toast('Settings saved ✓', 'success');
    } catch (err) { toast('❌ ' + err.message, 'error'); }
}

// ============ ADMIN MANAGEMENT ============
async function loadAdminList() {
    try {
        const admins = await api('GET', '/api/admin/list');
        const container = document.getElementById('admin-list');
        container.innerHTML = admins.map(a => `
            <div class="staff-card">
                <div class="emp-name">${a.name}</div>
                <div class="emp-email">📧 ${a.email}</div>
                <div class="emp-dept"><span class="badge badge-${a.role === 'superadmin' ? 'ontime' : 'in'}">${a.role}</span></div>
                ${a.role !== 'superadmin' ? `<button class="btn btn-danger btn-sm" onclick="removeAdmin('${a._id}', '${a.name}')">Remove</button>` : ''}
            </div>
        `).join('');
    } catch (err) { toast('Failed to load admins', 'error'); }
}

async function addAdmin(e) {
    if (e) e.preventDefault();
    const name = document.getElementById('new-admin-name').value.trim();
    const email = document.getElementById('new-admin-email').value.trim();
    const password = document.getElementById('new-admin-pass').value;
    const role = document.getElementById('new-admin-role')?.value || 'admin';
    if (!name || !email || !password) { toast('All fields required', 'warning'); return false; }

    try {
        await api('POST', '/api/admin/add', { name, email, password, role });
        toast(`${name} added as admin ✓`, 'success');
        document.getElementById('admin-form').reset();
        loadAdminList();
    } catch (err) { toast('❌ ' + err.message, 'error'); }
    return false;
}

async function removeAdmin(id, name) {
    if (!confirm(`Remove admin ${name}?`)) return;
    try {
        await api('DELETE', `/api/admin/${id}`);
        toast('Admin removed', 'info');
        loadAdminList();
    } catch (err) { toast('❌ ' + err.message, 'error'); }
}

// ============ GEOFENCE ============
function haversineDistance(lat1, lng1, lat2, lng2) {
    const R = 6371000;
    const rad = Math.PI / 180;
    const dLat = (lat2 - lat1) * rad;
    const dLng = (lng2 - lng1) * rad;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function startGeofenceWatch() {
    if (!navigator.geolocation) return;
    if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
    geoWatchId = navigator.geolocation.watchPosition(
        (pos) => {
            // Use default coords if no settings loaded
            const officeLat = 26.892900, officeLng = 75.793900, radius = 500;
            const dist = haversineDistance(pos.coords.latitude, pos.coords.longitude, officeLat, officeLng);
            if (dist <= radius) {
                const today = getTodayStr();
                const key = 'geofence_notified_' + today;
                if (!localStorage.getItem(key)) {
                    if ('Notification' in window && Notification.permission === 'granted') {
                        new Notification('📍 BookMyCA Smart Attend', { body: 'You are near the office! Mark your attendance now.', icon: 'icon-192.png' });
                    } else { toast('📍 Near office — mark attendance!', 'info', 6000); }
                    localStorage.setItem(key, '1');
                }
            }
        },
        () => {},
        { enableHighAccuracy: true, maximumAge: 60000, timeout: 15000 }
    );
}

// ============ INIT ============
document.addEventListener('DOMContentLoaded', () => {
    // Check if user is already logged in
    if (authToken && currentUser) {
        if (currentUser.type === 'admin') {
            showScreen('screen-admin-portal');
        } else {
            showScreen('screen-emp-dashboard');
        }
        initPushNotifications(); // Prompt for notifications on dashboard load
    } else {
        showScreen('screen-main');
    }
    initDragDrop();
    startGeofenceWatch();

    // Check query params for autologin
    const params = new URLSearchParams(location.search);
    if (params.get('admin') === '1') {
        showScreen('screen-admin-login');
        const token = localStorage.getItem('sa_admin_token');
        if (token) {
            authToken = token;
            currentUser = JSON.parse(localStorage.getItem('sa_user'));
            showScreen('screen-admin-portal');
            initAdminPortal();
        }
    }
});

// ============ PAYROLL GENERATOR ============
function openSalaryModal() {
    document.getElementById('modal-salary').style.display = 'flex';
    document.getElementById('payroll-table').style.display = 'none';
    document.getElementById('payroll-stats').style.display = 'none';
    
    // Set default month to current
    const picker = document.getElementById('payroll-month-picker');
    const now = new Date();
    picker.value = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`;
}

async function generateSalaryReport() {
    const month = document.getElementById('payroll-month-picker').value;
    if (!month) { toast('Please select a month', 'warning'); return; }
    
    const loading = document.getElementById('payroll-loading');
    const table = document.getElementById('payroll-table');
    const tbody = document.getElementById('payroll-tbody');
    const stats = document.getElementById('payroll-stats');
    
    loading.style.display = 'block';
    table.style.display = 'none';
    stats.style.display = 'none';
    tbody.innerHTML = '';
    
    try {
        const data = await api('GET', `/api/payroll/calculate/${month}`);
        
        // Update stats
        document.getElementById('py-total').textContent = data.totalDays;
        document.getElementById('py-sun').textContent = data.sundays;
        document.getElementById('py-hol').textContent = data.holidaysCount;
        stats.style.display = 'flex';
        
        if (data.records.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="empty-msg">No active staff members found.</td></tr>';
        } else {
            tbody.innerHTML = data.records.map(r => `
                <tr>
                    <td><strong>${r.code}</strong></td>
                    <td>${r.name}<br><small style="color:#666">${r.dept}</small></td>
                    <td>₹ ${r.baseSalary.toLocaleString('en-IN')}</td>
                    <td>${r.actualDaysWorked} d</td>
                    <td><span style="color:#dc3545">${r.lateDaysCount} late</span></td>
                    <td>${r.leavesTaken} d</td>
                    <td><strong>${r.paidDays} d</strong></td>
                    <td style="font-size:16px; color:#C8A951; font-weight:800;">₹ ${r.calculatedSalary.toLocaleString('en-IN')}</td>
                </tr>
            `).join('');
        }
        
        table.style.display = 'table';
    } catch (err) {
        toast('❌ ' + err.message, 'error');
    } finally {
        loading.style.display = 'none';
    }
}

// ================================================================
// ============ STAFF DOCUMENTS MODULE ============================
// ================================================================

let currentDocsStaffId = null;

async function openStaffDocs(staffId, staffName) {
    currentDocsStaffId = staffId;
    const modal = document.getElementById('modal-staff-docs');
    if (!modal) return;
    document.getElementById('docs-modal-title').textContent = `📎 Documents — ${staffName}`;
    // Reset all previews
    ['photo','pan','aadhar','agreement'].forEach(t => {
        const el = document.getElementById(`doc-preview-${t}`);
        if (el) el.innerHTML = '<span style="color:#94A3B8;font-size:.85rem;">⏳ Loading…</span>';
        const inp = document.getElementById(`doc-input-${t}`);
        if (inp) inp.value = '';
    });
    modal.style.display = 'flex';
    try {
        const data = await api('GET', `/api/staff/${staffId}/documents`);
        if (data.success) {
            const docs = data.documents || {};
            renderDocPreview('photo',     docs.photo,     'image');
            renderDocPreview('pan',       docs.pan,       'doc');
            renderDocPreview('aadhar',    docs.aadhar,    'doc');
            renderDocPreview('agreement', docs.agreement, 'doc');
        }
    } catch (err) {
        toast('Failed to load documents', 'error');
    }
}

function renderDocPreview(type, url, kind) {
    const el = document.getElementById(`doc-preview-${type}`);
    if (!el) return;
    if (!url) {
        el.innerHTML = '<span style="color:#94A3B8;font-size:.85rem;">❌ Not uploaded yet</span>';
        return;
    }
    if (kind === 'image') {
        el.innerHTML = `
            <img src="${url}" alt="Photo" style="width:72px;height:72px;border-radius:50%;object-fit:cover;border:3px solid #38BDF8;">
            <a href="${url}" target="_blank" class="doc-view-btn">👁️ View Photo</a>`;
    } else {
        const ext = url.split('.').pop().toLowerCase();
        const icon = ext === 'pdf' ? '📄' : '🖼️';
        el.innerHTML = `
            <span style="color:#10B981;font-weight:600;">✅ Uploaded</span>
            <a href="${url}" target="_blank" class="doc-view-btn">${icon} View / Download</a>`;
    }
}

async function uploadStaffDoc(type) {
    const input = document.getElementById(`doc-input-${type}`);
    const file = input ? input.files[0] : null;
    if (!file) { toast('Please select a file first', 'warning'); return; }
    if (!currentDocsStaffId) return;
    // Find the clicked button
    const btn = event.target;
    const origText = btn.textContent;
    btn.disabled = true;
    btn.textContent = '⏳ Uploading…';
    const formData = new FormData();
    formData.append(type, file);
    try {
        const resp = await fetch(`/api/staff/${currentDocsStaffId}/documents`, {
            method: 'POST',
            headers: { Authorization: 'Bearer ' + authToken },
            body: formData
        });
        const data = await resp.json();
        if (data.success) {
            toast(`${type.charAt(0).toUpperCase()+type.slice(1)} uploaded ✓`, 'success');
            const kind = type === 'photo' ? 'image' : 'doc';
            renderDocPreview(type, data.documents[type], kind);
            // Refresh staff list to update avatar on card
            loadStaffList();
        } else {
            toast('Upload failed: ' + (data.error || 'Unknown error'), 'error');
        }
    } catch (err) {
        toast('Network error during upload', 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = origText;
    }
}

function closeStaffDocsModal() {
    const modal = document.getElementById('modal-staff-docs');
    if (modal) modal.style.display = 'none';
    currentDocsStaffId = null;
}

// ─── Employee Profile Photo Loader ───
async function loadEmpProfilePhoto() {
    if (!currentUser || currentUser.type !== 'employee') return;
    const avatar = document.getElementById('emp-profile-avatar');
    if (!avatar) return;
    try {
        const data = await api('GET', `/api/staff/${currentUser._id}/photo`);
        if (data.photo) {
            avatar.innerHTML = `<img src="${data.photo}" alt="Profile" style="width:72px;height:72px;border-radius:50%;object-fit:cover;border:3px solid rgba(56,189,248,0.7);box-shadow:0 0 0 4px rgba(56,189,248,0.15);">`;
        } else {
            const initials = (currentUser.name||'E').trim().split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase();
            avatar.innerHTML = `<div style="width:72px;height:72px;border-radius:50%;background:linear-gradient(135deg,#0EA5E9,#38BDF8);color:#fff;display:flex;align-items:center;justify-content:center;font-size:1.5rem;font-weight:700;border:3px solid rgba(56,189,248,0.5);">${initials}</div>`;
        }
    } catch (e) {
        const initials = (currentUser?.name||'E').trim().split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase();
        if (avatar) avatar.innerHTML = `<div style="width:72px;height:72px;border-radius:50%;background:linear-gradient(135deg,#0EA5E9,#38BDF8);color:#fff;display:flex;align-items:center;justify-content:center;font-size:1.5rem;font-weight:700;">${initials}</div>`;
    }
}
