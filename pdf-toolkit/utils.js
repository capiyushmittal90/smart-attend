// =========================================
// BookMyCA - Utility Functions
// =========================================

export function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024, sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const icons = { success: '✅', error: '❌', info: 'ℹ️' };
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<span class="toast-icon">${icons[type]}</span><span class="toast-message">${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => { toast.classList.add('toast-exit'); setTimeout(() => toast.remove(), 300); }, 3500);
}

// FIXED: Robust download that always saves with correct filename to Downloads folder
export function downloadBlob(blob, filename) {
    // Create a proper download link
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = filename; // This forces download with the correct filename
    a.setAttribute('download', filename); // Double-set for compatibility

    // Append to body, click, then clean up after a delay
    document.body.appendChild(a);

    // Use a small timeout to ensure the DOM has updated
    setTimeout(() => {
        a.click();
        // Don't revoke immediately - give browser time to start the download
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 5000); // Wait 5 seconds before cleanup
    }, 100);
}

// Store the blob and filename globally so the download button can use them
let _pendingDownload = null;

export function setPendingDownload(blob, filename) {
    _pendingDownload = { blob, filename };
}

export function triggerPendingDownload() {
    if (_pendingDownload) {
        downloadBlob(_pendingDownload.blob, _pendingDownload.filename);
    }
}

export function createUploadZone(acceptTypes, multiple = false) {
    const id = 'file-input-' + Math.random().toString(36).substr(2, 9);
    return `
        <div class="upload-zone" id="upload-zone">
            <span class="upload-zone-icon">📁</span>
            <div class="upload-zone-text">Drop your files here or click to browse</div>
            <div class="upload-zone-hint">Accepted: ${acceptTypes || 'PDF files'} ${multiple ? '• Multiple files allowed' : ''}</div>
            <input type="file" id="${id}" accept="${acceptTypes || '.pdf'}" ${multiple ? 'multiple' : ''}>
        </div>
        <div class="file-list" id="file-list"></div>
    `;
}

export function createProgressBar() {
    return `
        <div class="progress-container" id="progress-container">
            <div class="progress-label">
                <span id="progress-text">Processing...</span>
                <span id="progress-percent">0%</span>
            </div>
            <div class="progress-bar"><div class="progress-fill" id="progress-fill"></div></div>
        </div>
    `;
}

export function createResultSection() {
    return `
        <div class="result-section" id="result-section">
            <span class="result-icon">🎉</span>
            <div class="result-title">Processing Complete!</div>
            <div class="result-info" id="result-info"></div>
            <button class="btn-download" id="download-btn">⬇️ Download File</button>
        </div>
    `;
}

export function updateProgress(percent, text) {
    const container = document.getElementById('progress-container');
    const fill = document.getElementById('progress-fill');
    const percentEl = document.getElementById('progress-percent');
    const textEl = document.getElementById('progress-text');
    if (container) {
        container.classList.add('active');
        // Only scroll on first show (0-10%) to avoid constant scrolling
        if (percent <= 10) {
            container.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }
    if (fill) fill.style.width = percent + '%';
    if (percentEl) percentEl.textContent = Math.round(percent) + '%';
    if (text && textEl) textEl.textContent = text;
}

export function showResult(info, blob, filename) {
    const section = document.getElementById('result-section');
    const infoEl = document.getElementById('result-info');
    const downloadBtn = document.getElementById('download-btn');

    if (section) {
        section.classList.add('active');
        setTimeout(() => {
            section.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 100);
    }
    if (infoEl) infoEl.textContent = info;

    // If blob and filename provided, set up download button properly
    if (blob && filename) {
        setPendingDownload(blob, filename);

        // Set the filename on the button for visual feedback
        if (downloadBtn) {
            downloadBtn.textContent = `⬇️ Download ${filename}`;
            downloadBtn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                triggerPendingDownload();
            };
        }

        // Auto-download after showing result
        setTimeout(() => {
            downloadBlob(blob, filename);
        }, 800);
    }
}

export function setupUploadZone(onFilesSelected) {
    const zone = document.getElementById('upload-zone');
    const input = zone ? zone.querySelector('input[type="file"]') : null;
    if (!zone || !input) return;

    zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
    zone.addEventListener('drop', (e) => {
        e.preventDefault(); zone.classList.remove('drag-over');
        if (e.dataTransfer.files.length) onFilesSelected(Array.from(e.dataTransfer.files));
    });
    input.addEventListener('change', (e) => {
        if (e.target.files.length) onFilesSelected(Array.from(e.target.files));
    });
}

export function renderFileList(files, onRemove) {
    const list = document.getElementById('file-list');
    if (!list) return;
    list.innerHTML = files.map((f, i) => `
        <div class="file-item">
            <div class="file-item-icon icon-indigo">📄</div>
            <div class="file-item-info">
                <div class="file-item-name">${f.name}</div>
                <div class="file-item-size">${formatFileSize(f.size)}</div>
            </div>
            <button class="file-item-remove" data-index="${i}">✕</button>
        </div>
    `).join('');
    list.querySelectorAll('.file-item-remove').forEach(btn => {
        btn.addEventListener('click', () => onRemove(parseInt(btn.dataset.index)));
    });
}

// Initialize PDF.js worker
export function initPdfJs() {
    if (window.pdfjsLib) {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }
}

export async function renderPdfPageToCanvas(pdfBytes, pageNum, scale = 1.0) {
    initPdfJs();
    const pdf = await window.pdfjsLib.getDocument({ data: pdfBytes }).promise;
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport }).promise;
    return canvas;
}
