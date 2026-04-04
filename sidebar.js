// sidebar.js
// Dynamically creates and injects a left sidebar navigation for all admin modules.

window.initGlobalSidebar = function() {
    if (document.getElementById('global-sidebar')) return; // Already exists

    const path = window.location.pathname;
    if (path.includes('client-portal.html')) return;
    
    // Only render sidebar if logged in user is admin/superadmin
    try {
        const uStr = localStorage.getItem('sa_user');
        if (!uStr) return;
        const u = JSON.parse(uStr);
        if (u.role !== 'admin' && u.role !== 'superadmin' && u.type !== 'admin') return;
    } catch(e) { return; }

    const modules = [
        { name: 'Ad Master', url: 'ad-master.html', icon: 'fa-bullhorn' },
        { name: 'Admin Tasks', url: 'admin-tasks.html', icon: 'fa-clipboard-check' },
        { name: 'Agreement Gen', url: 'agreement-builder.html', icon: 'fa-file-signature' },
        { name: 'Attendance', url: 'index.html#attendance', icon: 'fa-clock' },
        { name: 'Client Master', url: 'client-master.html', icon: 'fa-users' },
        { name: 'Hub (Home)', url: 'index.html', icon: 'fa-house' },
        { name: 'Invoice Builder', url: 'invoice-builder.html', icon: 'fa-file-invoice-dollar' },
        { name: 'Reports', url: 'reports.html', icon: 'fa-chart-pie' },
        { name: 'Task Portal', url: 'task-portal.html', icon: 'fa-network-wired' },
        { name: 'Template Master', url: 'template-master.html', icon: 'fa-cog' }
    ];

    // Add Super Admin Panel link for superadmin only
    try {
        const uData = JSON.parse(localStorage.getItem('sa_user') || '{}');
        if (uData.role === 'superadmin') {
            modules.push({ name: '⭐ Super Admin', url: 'superadmin-panel.html', icon: 'fa-crown', superadmin: true });
        }
    } catch(e) {}

    // CSS for Sidebar
    const style = document.createElement('style');
    style.textContent = `
        :root { --sidebar-width: 250px; }
        body { margin-left: var(--sidebar-width) !important; transition: margin 0.3s; }
        #global-sidebar {
            position: fixed; top: 0; left: 0; width: var(--sidebar-width); height: 100vh;
            background: #0F172A; color: #fff; z-index: 1040;
            box-shadow: 4px 0 10px rgba(0,0,0,0.1); display: flex; flex-direction: column;
            overflow-y: auto;
        }
        .sidebar-brand {
            padding: 20px; font-size: 1.25rem; font-weight: 700; color: #fff;
            background: #1e293b; border-bottom: 1px solid #334155;
            display: flex; align-items: center; gap: 10px;
        }
        .sidebar-brand i { color: #38BDF8; }
        .sidebar-nav { padding: 10px 0; display: flex; flex-direction: column; gap: 5px; flex-grow: 1; }
        .sidebar-link {
            padding: 12px 20px; color: #94a3b8; text-decoration: none; font-weight: 500;
            display: flex; align-items: center; gap: 12px; transition: all 0.2s;
            border-left: 3px solid transparent;
        }
        .sidebar-link:hover { color: #fff; background: rgba(255,255,255,0.05); }
        .sidebar-link.active {
            color: #38BDF8; background: rgba(56,189,248,0.1); border-left-color: #38BDF8;
        }
        .sidebar-link i { font-size: 1.1rem; width: 20px; text-align: center; }
        
        @media (max-width: 768px) {
            body { margin-left: 0 !important; }
            #global-sidebar { transform: translateX(-100%); transition: transform 0.3s; }
            #global-sidebar.show { transform: translateX(0); }
            .mobile-nav-toggle { display: block !important; }
        }
        
        .mobile-nav-toggle {
            display: none; position: fixed; bottom: 20px; right: 20px; z-index: 1041;
            background: #38BDF8; color: #0f172a; width: 50px; height: 50px;
            border-radius: 50%; text-align: center; line-height: 50px; font-size: 1.5rem;
            box-shadow: 0 4px 10px rgba(0,0,0,0.3); cursor: pointer;
        }
    `;
    document.head.appendChild(style);

    // Sidebar DOM
    const sidebar = document.createElement('div');
    sidebar.id = 'global-sidebar';
    
    let navHtml = `
        <div class="sidebar-brand">
            <i class="fa-solid fa-layer-group"></i> BookMyCA
        </div>
        <div class="sidebar-nav">
    `;
    
    modules.forEach(m => {
        const fullUrl = window.location.pathname + window.location.hash;
        const isActive = (m.url.includes('#') ? fullUrl.includes(m.url) : path.includes(m.url) && m.url !== 'index.html') ? 'active' : '';
        navHtml += `
            <a href="${m.url}" class="sidebar-link ${isActive}">
                <i class="fa-solid ${m.icon}"></i> <span>${m.name}</span>
            </a>
        `;
    });
    
    navHtml += `</div>
        <div class="mt-auto p-3 border-top" style="border-color:#334155!important;">
            <a href="#" onclick="localStorage.removeItem('sa_user'); window.location.href='index.html'; return false;" class="sidebar-link" style="color: #ef4444; margin-bottom: 10px;">
                <i class="fa-solid fa-right-from-bracket"></i> <span>Logout</span>
            </a>
            <div class="small text-muted text-center">&copy; 2026 BookMyCA</div>
        </div>
    `;
    
    sidebar.innerHTML = navHtml;
    document.body.appendChild(sidebar);
    
    // Mobile Toggle
    const mobileBtn = document.createElement('div');
    mobileBtn.className = 'mobile-nav-toggle';
    mobileBtn.innerHTML = '<i class="fa-solid fa-bars"></i>';
    mobileBtn.onclick = () => {
        sidebar.classList.toggle('show');
    };
    document.body.appendChild(mobileBtn);
    
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', window.initGlobalSidebar);
} else {
    window.initGlobalSidebar();
}
