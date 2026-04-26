// =========================================
// BookMyCA - Tool Definitions
// =========================================

export const TOOLS = [
    { id: 'merge-pdf', name: 'Merge PDF', desc: 'Combine PDFs in the order you want with the easiest PDF merger available.', icon: '📎', color: 'icon-indigo', category: 'organize', accept: '.pdf', multiple: true },
    { id: 'split-pdf', name: 'Split PDF', desc: 'Separate one page or a whole set for easy conversion into independent PDF files.', icon: '✂️', color: 'icon-pink', category: 'organize', accept: '.pdf' },
    { id: 'compress-pdf', name: 'Compress PDF', desc: 'Reduce file size while optimizing for maximal PDF quality.', icon: '📦', color: 'icon-cyan', category: 'optimize', accept: '.pdf' },
    { id: 'pdf-to-word', name: 'PDF to Word', desc: 'Easily convert your PDF files into easy to edit DOC and DOCX documents.', icon: '📝', color: 'icon-indigo', category: 'convert', accept: '.pdf' },
    { id: 'pdf-to-ppt', name: 'PDF to PowerPoint', desc: 'Turn your PDF files into easy to edit PPT and PPTX slideshows.', icon: '📊', color: 'icon-orange', category: 'convert', accept: '.pdf' },
    { id: 'pdf-to-excel', name: 'PDF to Excel', desc: 'Pull data straight from PDFs into Excel spreadsheets in a few short seconds.', icon: '📗', color: 'icon-emerald', category: 'convert', accept: '.pdf' },
    { id: 'word-to-pdf', name: 'Word to PDF', desc: 'Make DOC and DOCX files easy to read by converting them to PDF.', icon: '📄', color: 'icon-indigo', category: 'convert', accept: '.doc,.docx' },
    { id: 'ppt-to-pdf', name: 'PowerPoint to PDF', desc: 'Make PPT and PPTX slideshows easy to view by converting them to PDF.', icon: '🎞️', color: 'icon-orange', category: 'convert', accept: '.ppt,.pptx' },
    { id: 'excel-to-pdf', name: 'Excel to PDF', desc: 'Make EXCEL spreadsheets easy to read by converting them to PDF.', icon: '📊', color: 'icon-emerald', category: 'convert', accept: '.xls,.xlsx,.csv' },
    { id: 'edit-pdf', name: 'Edit PDF', desc: 'Add text, images, shapes or freehand annotations to a PDF document.', icon: '✏️', color: 'icon-violet', category: 'edit', accept: '.pdf', badge: 'New!' },
    { id: 'pdf-to-jpg', name: 'PDF to JPG', desc: 'Convert each PDF page into a JPG or extract all images contained in a PDF.', icon: '🖼️', color: 'icon-amber', category: 'convert', accept: '.pdf' },
    { id: 'jpg-to-pdf', name: 'JPG to PDF', desc: 'Convert JPG images to PDF in seconds. Easily adjust orientation and margins.', icon: '🏞️', color: 'icon-amber', category: 'convert', accept: 'image/*', multiple: true },
    { id: 'sign-pdf', name: 'Sign PDF', desc: 'Sign yourself or request electronic signatures from others.', icon: '🖊️', color: 'icon-violet', category: 'edit', accept: '.pdf' },
    { id: 'watermark', name: 'Watermark', desc: 'Stamp an image or text over your PDF in seconds.', icon: '💧', color: 'icon-cyan', category: 'edit', accept: '.pdf' },
    { id: 'rotate-pdf', name: 'Rotate PDF', desc: 'Rotate your PDFs the way you need them. You can even rotate multiple PDFs at once!', icon: '🔄', color: 'icon-emerald', category: 'organize', accept: '.pdf', multiple: true },
    { id: 'html-to-pdf', name: 'HTML to PDF', desc: 'Convert webpages in HTML to PDF. Paste the URL and convert it with a click.', icon: '🌐', color: 'icon-cyan', category: 'convert', noFile: true },
    { id: 'unlock-pdf', name: 'Unlock PDF', desc: 'Remove PDF password security, giving you the freedom to use your PDFs as you want.', icon: '🔓', color: 'icon-emerald', category: 'security', accept: '.pdf' },
    { id: 'protect-pdf', name: 'Protect PDF', desc: 'Protect PDF files with a password. Encrypt PDF documents to prevent unauthorized access.', icon: '🔒', color: 'icon-red', category: 'security', accept: '.pdf' },
    { id: 'organize-pdf', name: 'Organize PDF', desc: 'Sort, delete or add PDF pages to your document at your convenience.', icon: '📑', color: 'icon-indigo', category: 'organize', accept: '.pdf' },
    { id: 'pdf-to-pdfa', name: 'PDF to PDF/A', desc: 'Transform your PDF to PDF/A, the ISO-standardized version for long-term archiving.', icon: '🏛️', color: 'icon-violet', category: 'convert', accept: '.pdf' },
    { id: 'repair-pdf', name: 'Repair PDF', desc: 'Repair a damaged PDF and recover data from corrupt PDF.', icon: '🔧', color: 'icon-amber', category: 'optimize', accept: '.pdf' },
    { id: 'page-numbers', name: 'Page Numbers', desc: 'Add page numbers into PDFs with ease. Choose positions, dimensions, typography.', icon: '🔢', color: 'icon-indigo', category: 'edit', accept: '.pdf' },
    { id: 'ocr-pdf', name: 'OCR PDF', desc: 'Easily convert scanned PDF into searchable and selectable documents.', icon: '👁️', color: 'icon-cyan', category: 'convert', accept: '.pdf' },
    { id: 'compare-pdf', name: 'Compare PDF', desc: 'Show a side-by-side document comparison and easily spot changes.', icon: '🔍', color: 'icon-violet', category: 'edit', accept: '.pdf', multiple: true, badge: 'New!' },
    { id: 'redact-pdf', name: 'Redact PDF', desc: 'Redact text and graphics to permanently remove sensitive information.', icon: '⬛', color: 'icon-red', category: 'security', accept: '.pdf', badge: 'New!' },
    { id: 'crop-pdf', name: 'Crop PDF', desc: 'Crop margins or select specific areas, then apply to one page or the whole document.', icon: '✂️', color: 'icon-orange', category: 'edit', accept: '.pdf', badge: 'New!' },
];

export function getToolById(id) { return TOOLS.find(t => t.id === id); }
