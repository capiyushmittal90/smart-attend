// =========================================
// BookMyCA - Main Application
// =========================================
import { TOOLS, getToolById } from './tools.js';
import { createUploadZone, createProgressBar, createResultSection, setupUploadZone, renderFileList, showToast, initPdfJs } from './utils.js';
import { handleMerge, handleSplit, handleCompress, handleRotate, handleWatermark, handleProtect, handleUnlock, handlePageNumbers, handlePdfToJpg, handleJpgToPdf, handleRepair, handlePdfToPdfa, handleCrop } from './handlers.js';
import { handleOrganize, handleSign, handleEdit, handleRedact, handleCompare, handleHtmlToPdf, handlePdfToWord, handlePdfToExcel, handlePdfToPpt, handleWordToPdf, handlePptToPdf, handleExcelToPdf, handleOcr, setupSignaturePad } from './handlers-advanced.js';

// ---- State ----
let currentFiles = [];
let currentTool = null;
let signPad = null;

// ---- Initialize ----
document.addEventListener('DOMContentLoaded', () => {
    initPdfJs();
    renderToolsGrid();
    setupNavigation();
    setupHeader();
});

// ---- Render Tools Grid ----
function renderToolsGrid(filter = 'all') {
    const grid = document.getElementById('tools-grid');
    const filtered = filter === 'all' ? TOOLS : TOOLS.filter(t => t.category === filter);
    grid.innerHTML = filtered.map(tool => `
        <div class="tool-card" data-tool="${tool.id}" tabindex="0" role="button" aria-label="${tool.name}">
            <div class="tool-card-top">
                <div class="tool-icon-wrap ${tool.color}">${tool.icon}</div>
                ${tool.badge ? `<span class="tool-badge">${tool.badge}</span>` : ''}
            </div>
            <h3>${tool.name}</h3>
            <p>${tool.desc}</p>
            <div class="tool-card-arrow">Open tool →</div>
        </div>
    `).join('');
    grid.querySelectorAll('.tool-card').forEach(card => {
        card.addEventListener('click', () => openTool(card.dataset.tool));
        card.addEventListener('keypress', (e) => { if (e.key === 'Enter') openTool(card.dataset.tool); });
    });
}

// ---- Navigation ----
function setupNavigation() {
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderToolsGrid(btn.dataset.category);
        });
    });
}

function setupHeader() {
    const menuBtn = document.getElementById('mobile-menu-btn');
    const nav = document.getElementById('nav-categories');
    if (menuBtn) menuBtn.addEventListener('click', () => nav.classList.toggle('mobile-open'));
    const logoLink = document.getElementById('logo-link');
    if (logoLink) logoLink.addEventListener('click', (e) => { e.preventDefault(); goHome(); });
    document.getElementById('back-btn').addEventListener('click', goHome);
}

function goHome() {
    document.body.classList.remove('workspace-active');
    document.getElementById('tool-workspace').style.display = 'none';
    document.getElementById('hero-section').style.display = '';
    document.getElementById('main-content').style.display = '';
    currentFiles = [];
    currentTool = null;
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ---- Open Tool ----
function openTool(toolId) {
    currentTool = getToolById(toolId);
    if (!currentTool) return;
    currentFiles = [];
    document.body.classList.add('workspace-active');
    document.getElementById('hero-section').style.display = 'none';
    document.getElementById('main-content').style.display = 'none';
    document.getElementById('tool-workspace').style.display = 'block';
    renderWorkspace(currentTool);
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ---- Render Workspace ----
function renderWorkspace(tool) {
    const content = document.getElementById('workspace-content');
    let html = `<h2 class="workspace-title">${tool.icon} ${tool.name}</h2><p class="workspace-desc">${tool.desc}</p>`;

    // Tool-specific UI
    switch (tool.id) {
        case 'html-to-pdf':
            html += renderHtmlToPdfUI();
            break;
        case 'sign-pdf':
            html += renderSignUI(tool);
            break;
        case 'edit-pdf':
            html += renderEditUI(tool);
            break;
        case 'compare-pdf':
            html += renderCompareUI(tool);
            break;
        case 'watermark':
            html += renderWatermarkUI(tool);
            break;
        case 'protect-pdf':
            html += renderProtectUI(tool);
            break;
        case 'unlock-pdf':
            html += renderUnlockUI(tool);
            break;
        case 'rotate-pdf':
            html += renderRotateUI(tool);
            break;
        case 'page-numbers':
            html += renderPageNumbersUI(tool);
            break;
        case 'crop-pdf':
            html += renderCropUI(tool);
            break;
        case 'redact-pdf':
            html += renderRedactUI(tool);
            break;
        default:
            html += createUploadZone(tool.accept, tool.multiple);
            html += `<div class="action-bar"><button class="btn-primary" id="process-btn" disabled>⚡ ${getActionLabel(tool.id)}</button></div>`;
            html += createProgressBar() + createResultSection();
    }

    content.innerHTML = html;

    // Setup upload zones
    setTimeout(() => {
        setupUploadZone((files) => {
            if (tool.multiple) currentFiles = [...currentFiles, ...files];
            else currentFiles = files;
            renderFileList(currentFiles, (idx) => { currentFiles.splice(idx, 1); renderFileList(currentFiles, arguments.callee); toggleProcessBtn(); });
            toggleProcessBtn();
        });
        if (tool.id === 'sign-pdf') signPad = setupSignaturePad('sign-canvas');
    }, 50);
    setupProcessButton(tool);
}

function toggleProcessBtn() {
    const btn = document.getElementById('process-btn');
    if (btn) btn.disabled = currentFiles.length === 0;
}

function getActionLabel(id) {
    const labels = {
        'merge-pdf': 'Merge PDFs', 'split-pdf': 'Split PDF', 'compress-pdf': 'Compress PDF',
        'rotate-pdf': 'Rotate PDF', 'watermark': 'Add Watermark', 'protect-pdf': 'Protect PDF',
        'unlock-pdf': 'Unlock PDF', 'organize-pdf': 'Organize PDF', 'page-numbers': 'Add Numbers',
        'pdf-to-jpg': 'Convert to JPG', 'jpg-to-pdf': 'Convert to PDF',
        'pdf-to-word': 'Convert to Word',
        'pdf-to-ppt': 'Convert to PPT', 'pdf-to-excel': 'Convert to Excel', 'word-to-pdf': 'Convert to PDF',
        'ppt-to-pdf': 'Convert to PDF', 'excel-to-pdf': 'Convert to PDF', 'repair-pdf': 'Repair PDF',
        'pdf-to-pdfa': 'Convert to PDF/A', 'crop-pdf': 'Crop PDF', 'ocr-pdf': 'Run OCR',
        'sign-pdf': 'Apply Signature', 'edit-pdf': 'Apply Changes', 'redact-pdf': 'Apply Redaction',
        'compare-pdf': 'Compare', 'html-to-pdf': 'Create PDF',
    };
    return labels[id] || 'Process';
}

// ---- Tool-specific UI Renderers ----
function renderHtmlToPdfUI() {
    return `
        ${createUploadZone('.html,.htm', false)}
        <div class="action-bar"><button class="btn-primary" id="process-btn" disabled>🌐 Convert to PDF</button></div>
        ${createProgressBar()}${createResultSection()}
    `;
}

function renderSignUI(tool) {
    return `
        ${createUploadZone(tool.accept)}
        <div class="options-panel" style="margin-top:20px">
            <h4>Draw Your Signature</h4>
            <div class="sign-canvas-wrap"><canvas id="sign-canvas" width="500" height="150" style="background:white;display:block;width:100%;cursor:crosshair"></canvas></div>
            <div class="action-bar" style="margin-top:12px"><button class="btn-secondary" id="clear-sign-btn">🗑️ Clear</button></div>
        </div>
        <div class="options-panel"><h4>Options</h4>
            <div class="option-row"><span class="option-label">Apply to page</span><input type="number" class="option-input" id="sign-page" value="1" min="1"></div>
        </div>
        <div class="action-bar"><button class="btn-primary" id="process-btn" disabled>🖊️ Apply Signature</button></div>
        ${createProgressBar()}${createResultSection()}
    `;
}

function renderEditUI(tool) {
    return `
        ${createUploadZone(tool.accept)}
        <div class="options-panel" style="margin-top:20px"><h4>Add Text Overlay</h4>
            <div class="option-row"><span class="option-label">Text</span><input type="text" class="option-input" id="edit-text" placeholder="Your text here"></div>
            <div class="option-row"><span class="option-label">Page</span><input type="number" class="option-input" id="edit-page" value="1" min="1"></div>
            <div class="option-row"><span class="option-label">X Position</span><input type="number" class="option-input" id="edit-x" value="50"></div>
            <div class="option-row"><span class="option-label">Y Position</span><input type="number" class="option-input" id="edit-y" value="700"></div>
            <div class="option-row"><span class="option-label">Font Size</span><input type="number" class="option-input" id="edit-size" value="14"></div>
        </div>
        <div class="action-bar"><button class="btn-primary" id="process-btn" disabled>✏️ Apply Changes</button></div>
        ${createProgressBar()}${createResultSection()}
    `;
}

function renderCompareUI(tool) {
    return `
        ${createUploadZone(tool.accept, true)}
        <div class="action-bar"><button class="btn-primary" id="process-btn" disabled>🔍 Compare</button></div>
        ${createProgressBar()}${createResultSection()}
    `;
}

function renderWatermarkUI(tool) {
    return `
        ${createUploadZone(tool.accept)}
        <div class="options-panel" style="margin-top:20px"><h4>Watermark Settings</h4>
            <div class="option-row"><span class="option-label">Text</span><input type="text" class="option-input" id="wm-text" placeholder="CONFIDENTIAL"></div>
            <div class="option-row"><span class="option-label">Opacity</span><input type="range" id="wm-opacity" min="0.1" max="0.9" step="0.1" value="0.3"><span id="wm-opacity-val" style="color:var(--text-secondary);font-size:0.85rem;min-width:35px">0.3</span></div>
        </div>
        <div class="action-bar"><button class="btn-primary" id="process-btn" disabled>💧 Add Watermark</button></div>
        ${createProgressBar()}${createResultSection()}
    `;
}

function renderProtectUI(tool) {
    return `
        ${createUploadZone(tool.accept)}
        <div class="options-panel" style="margin-top:20px"><h4>Set Password</h4>
            <div class="option-row"><span class="option-label">Password</span><input type="password" class="option-input" id="protect-password" placeholder="Enter password"></div>
        </div>
        <div class="action-bar"><button class="btn-primary" id="process-btn" disabled>🔒 Protect PDF</button></div>
        ${createProgressBar()}${createResultSection()}
    `;
}

function renderUnlockUI(tool) {
    return `
        ${createUploadZone(tool.accept)}
        <div class="options-panel" style="margin-top:20px"><h4>Password (if required)</h4>
            <div class="option-row"><span class="option-label">Password</span><input type="password" class="option-input" id="unlock-password" placeholder="Enter password"></div>
        </div>
        <div class="action-bar"><button class="btn-primary" id="process-btn" disabled>🔓 Unlock PDF</button></div>
        ${createProgressBar()}${createResultSection()}
    `;
}

function renderRotateUI(tool) {
    return `
        ${createUploadZone(tool.accept, tool.multiple)}
        <div class="options-panel" style="margin-top:20px"><h4>Rotation</h4>
            <div class="option-row"><span class="option-label">Angle</span>
                <select class="option-select" id="rotate-angle"><option value="90">90° Clockwise</option><option value="180">180°</option><option value="270">90° Counter-Clockwise</option></select>
            </div>
        </div>
        <div class="action-bar"><button class="btn-primary" id="process-btn" disabled>🔄 Rotate PDF</button></div>
        ${createProgressBar()}${createResultSection()}
    `;
}

function renderPageNumbersUI(tool) {
    return `
        ${createUploadZone(tool.accept)}
        <div class="options-panel" style="margin-top:20px"><h4>Position</h4>
            <div class="option-row"><span class="option-label">Placement</span>
                <select class="option-select" id="pn-position"><option value="bottom-center">Bottom Center</option><option value="bottom-right">Bottom Right</option><option value="top-center">Top Center</option></select>
            </div>
        </div>
        <div class="action-bar"><button class="btn-primary" id="process-btn" disabled>🔢 Add Numbers</button></div>
        ${createProgressBar()}${createResultSection()}
    `;
}

function renderCropUI(tool) {
    return `
        ${createUploadZone(tool.accept)}
        <div class="options-panel" style="margin-top:20px"><h4>Crop Margins</h4>
            <div class="option-row"><span class="option-label">Margin %</span><input type="range" id="crop-margin" min="1" max="30" value="10"><span id="crop-margin-val" style="color:var(--text-secondary);font-size:0.85rem;min-width:35px">10%</span></div>
        </div>
        <div class="action-bar"><button class="btn-primary" id="process-btn" disabled>✂️ Crop PDF</button></div>
        ${createProgressBar()}${createResultSection()}
    `;
}

function renderRedactUI(tool) {
    return `
        ${createUploadZone(tool.accept)}
        <div class="options-panel" style="margin-top:20px"><h4>Redaction Area (page coordinates)</h4>
            <div class="option-row"><span class="option-label">Page</span><input type="number" class="option-input" id="redact-page" value="1" min="1"></div>
            <div class="option-row"><span class="option-label">X</span><input type="number" class="option-input" id="redact-x" value="50"></div>
            <div class="option-row"><span class="option-label">Y</span><input type="number" class="option-input" id="redact-y" value="700"></div>
            <div class="option-row"><span class="option-label">Width</span><input type="number" class="option-input" id="redact-w" value="200"></div>
            <div class="option-row"><span class="option-label">Height</span><input type="number" class="option-input" id="redact-h" value="30"></div>
        </div>
        <div class="action-bar"><button class="btn-primary" id="process-btn" disabled>⬛ Apply Redaction</button></div>
        ${createProgressBar()}${createResultSection()}
    `;
}

// ---- Process Button Handler ----
function setupProcessButton(tool) {
    setTimeout(() => {
        const btn = document.getElementById('process-btn');
        if (!btn) return;
        // Range slider updates
        const opSlider = document.getElementById('wm-opacity');
        if (opSlider) opSlider.addEventListener('input', () => { document.getElementById('wm-opacity-val').textContent = opSlider.value; });
        const cropSlider = document.getElementById('crop-margin');
        if (cropSlider) cropSlider.addEventListener('input', () => { document.getElementById('crop-margin-val').textContent = cropSlider.value + '%'; });
        // Clear signature
        const clearBtn = document.getElementById('clear-sign-btn');
        if (clearBtn) clearBtn.addEventListener('click', () => { if (signPad) signPad.clear(); });

        btn.addEventListener('click', async () => {
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner"></span> Processing...';
            try {
                switch (tool.id) {
                    case 'merge-pdf': await handleMerge(currentFiles); break;
                    case 'split-pdf': await handleSplit(currentFiles); break;
                    case 'compress-pdf': await handleCompress(currentFiles); break;
                    case 'rotate-pdf': await handleRotate(currentFiles, document.getElementById('rotate-angle').value); break;
                    case 'watermark': await handleWatermark(currentFiles, document.getElementById('wm-text').value, document.getElementById('wm-opacity').value); break;
                    case 'protect-pdf': await handleProtect(currentFiles, document.getElementById('protect-password').value); break;
                    case 'unlock-pdf': await handleUnlock(currentFiles, document.getElementById('unlock-password').value); break;
                    case 'page-numbers': await handlePageNumbers(currentFiles, document.getElementById('pn-position').value); break;
                    case 'pdf-to-jpg': await handlePdfToJpg(currentFiles); break;
                    case 'jpg-to-pdf': await handleJpgToPdf(currentFiles); break;
                    case 'repair-pdf': await handleRepair(currentFiles); break;
                    case 'pdf-to-pdfa': await handlePdfToPdfa(currentFiles); break;
                    case 'crop-pdf': await handleCrop(currentFiles, document.getElementById('crop-margin').value); break;
                    case 'organize-pdf': await handleOrganize(currentFiles); break;
                    case 'pdf-to-word': await handlePdfToWord(currentFiles); break;
                    case 'pdf-to-excel': await handlePdfToExcel(currentFiles); break;
                    case 'pdf-to-ppt': await handlePdfToPpt(currentFiles); break;
                    case 'word-to-pdf': await handleWordToPdf(currentFiles); break;
                    case 'ppt-to-pdf': await handlePptToPdf(currentFiles); break;
                    case 'excel-to-pdf': await handleExcelToPdf(currentFiles); break;
                    case 'ocr-pdf': await handleOcr(currentFiles); break;
                    case 'html-to-pdf': await handleHtmlToPdf(currentFiles); break;
                    case 'sign-pdf': await handleSign(currentFiles, signPad ? signPad.getDataUrl() : null); break;
                    case 'edit-pdf': {
                        const text = document.getElementById('edit-text').value;
                        const x = document.getElementById('edit-x').value;
                        const y = document.getElementById('edit-y').value;
                        const size = document.getElementById('edit-size').value;
                        await handleEdit(currentFiles, text, x, y, size); break;
                    }
                    case 'redact-pdf': {
                        const page = document.getElementById('redact-page').value;
                        const rx = document.getElementById('redact-x').value;
                        const ry = document.getElementById('redact-y').value;
                        const rw = document.getElementById('redact-w').value;
                        const rh = document.getElementById('redact-h').value;
                        await handleRedact(currentFiles, page, rx, ry, rw, rh); break;
                    }
                    case 'compare-pdf': await handleCompare(currentFiles); break;
                    default: showToast('Tool not yet implemented', 'info');
                }
            } catch (e) { showToast('Error: ' + e.message, 'error'); }
            btn.disabled = false;
            btn.innerHTML = `⚡ ${getActionLabel(tool.id)}`;
        });
    }, 100);
}
