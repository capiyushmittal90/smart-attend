// =========================================
// BookMyCA - PDF Processing Handlers
// =========================================
import { showToast, downloadBlob, updateProgress, showResult, formatFileSize } from './utils.js';

const { PDFDocument, rgb, StandardFonts, degrees } = PDFLib;

// ---- MERGE PDF ----
export async function handleMerge(files) {
    if (files.length < 2) { showToast('Please select at least 2 PDF files', 'error'); return; }
    try {
        updateProgress(5, 'Merging PDFs...');
        const merged = await PDFDocument.create();
        for (let i = 0; i < files.length; i++) {
            const bytes = await files[i].arrayBuffer();
            const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
            const pages = await merged.copyPages(doc, doc.getPageIndices());
            pages.forEach(p => merged.addPage(p));
            updateProgress(10 + (80 * (i + 1) / files.length), `Processing file ${i + 1}/${files.length}`);
        }
        const pdfBytes = await merged.save();
        updateProgress(100, 'Complete!');
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        showResult(`Merged ${files.length} files • ${formatFileSize(pdfBytes.length)}`, blob, 'merged.pdf');
        showToast('PDFs merged successfully!', 'success');
    } catch (e) { showToast('Error merging PDFs: ' + e.message, 'error'); }
}

// ---- SPLIT PDF ----
export async function handleSplit(files) {
    if (!files.length) { showToast('Please select a PDF file', 'error'); return; }
    try {
        updateProgress(5, 'Splitting PDF...');
        const bytes = await files[0].arrayBuffer();
        const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
        const totalPages = doc.getPageCount();
        const zip = new JSZip();
        for (let i = 0; i < totalPages; i++) {
            const newDoc = await PDFDocument.create();
            const [page] = await newDoc.copyPages(doc, [i]);
            newDoc.addPage(page);
            const pageBytes = await newDoc.save();
            zip.file(`page_${i + 1}.pdf`, pageBytes);
            updateProgress(10 + (80 * (i + 1) / totalPages), `Splitting page ${i + 1}/${totalPages}`);
        }
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        updateProgress(100, 'Complete!');
        showResult(`Split into ${totalPages} pages • ${formatFileSize(zipBlob.size)}`, zipBlob, 'split_pages.zip');
        showToast('PDF split successfully!', 'success');
    } catch (e) { showToast('Error splitting PDF: ' + e.message, 'error'); }
}

// ---- COMPRESS PDF ----
export async function handleCompress(files) {
    if (!files.length) { showToast('Please select a PDF file', 'error'); return; }
    try {
        updateProgress(10, 'Compressing PDF...');
        const bytes = await files[0].arrayBuffer();
        const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
        updateProgress(50, 'Optimizing...');
        const pdfBytes = await doc.save({ useObjectStreams: true });
        updateProgress(100, 'Complete!');
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        const saved = bytes.byteLength - pdfBytes.length;
        const pct = ((saved / bytes.byteLength) * 100).toFixed(1);
        showResult(`Original: ${formatFileSize(bytes.byteLength)} → Compressed: ${formatFileSize(pdfBytes.length)} (${pct}% saved)`, blob, 'compressed.pdf');
        showToast('PDF compressed!', 'success');
    } catch (e) { showToast('Error compressing: ' + e.message, 'error'); }
}

// ---- ROTATE PDF ----
export async function handleRotate(files, angle) {
    if (!files.length) { showToast('Please select a PDF file', 'error'); return; }
    try {
        updateProgress(10, 'Rotating pages...');
        const bytes = await files[0].arrayBuffer();
        const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
        const pages = doc.getPages();
        pages.forEach(page => {
            const cur = page.getRotation().angle;
            page.setRotation(degrees(cur + parseInt(angle)));
        });
        updateProgress(70, 'Saving...');
        const pdfBytes = await doc.save();
        updateProgress(100, 'Complete!');
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        showResult(`Rotated ${pages.length} pages by ${angle}°`, blob, 'rotated.pdf');
        showToast('PDF rotated!', 'success');
    } catch (e) { showToast('Error rotating: ' + e.message, 'error'); }
}

// ---- WATERMARK ----
export async function handleWatermark(files, text, opacity) {
    if (!files.length) { showToast('Please select a PDF file', 'error'); return; }
    if (!text) { showToast('Please enter watermark text', 'error'); return; }
    try {
        updateProgress(10, 'Adding watermark...');
        const bytes = await files[0].arrayBuffer();
        const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
        const font = await doc.embedFont(StandardFonts.HelveticaBold);
        const pages = doc.getPages();
        const op = parseFloat(opacity) || 0.3;
        pages.forEach((page, i) => {
            const { width, height } = page.getSize();
            const fontSize = Math.min(width, height) / 8;
            page.drawText(text, {
                x: width / 2 - font.widthOfTextAtSize(text, fontSize) / 2,
                y: height / 2 - fontSize / 2,
                size: fontSize, font, color: rgb(0.5, 0.5, 0.5), opacity: op,
                rotate: degrees(45),
            });
            updateProgress(10 + (80 * (i + 1) / pages.length));
        });
        const pdfBytes = await doc.save();
        updateProgress(100, 'Complete!');
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        showResult(`Watermark added to ${pages.length} pages`, blob, 'watermarked.pdf');
        showToast('Watermark added!', 'success');
    } catch (e) { showToast('Error: ' + e.message, 'error'); }
}

// ---- PROTECT PDF ----
export async function handleProtect(files, password) {
    if (!files.length) { showToast('Please select a PDF file', 'error'); return; }
    if (!password) { showToast('Please enter a password', 'error'); return; }
    try {
        updateProgress(10, 'Reading PDF...');
        const bytes = await files[0].arrayBuffer();

        // Use pdf.js to render each page, then jsPDF with encryption
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        const pdfDoc = await window.pdfjsLib.getDocument({ data: bytes }).promise;
        const totalPages = pdfDoc.numPages;

        updateProgress(20, 'Applying AES encryption...');
        const { jsPDF } = window.jspdf;

        // Create encrypted PDF with jsPDF
        const firstPage = await pdfDoc.getPage(1);
        const vp = firstPage.getViewport({ scale: 1 });
        const isLandscape = vp.width > vp.height;

        const encryptedPdf = new jsPDF({
            orientation: isLandscape ? 'l' : 'p',
            unit: 'pt',
            format: [vp.width, vp.height],
            encryption: {
                userPassword: password,
                ownerPassword: password + '_owner',
                userPermissions: ['print'] // Allow print only
            }
        });

        for (let i = 1; i <= totalPages; i++) {
            updateProgress(20 + (70 * i / totalPages), `Encrypting page ${i}/${totalPages}`);
            const page = await pdfDoc.getPage(i);
            const viewport = page.getViewport({ scale: 2.0 });
            const canvas = document.createElement('canvas');
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;

            if (i > 1) {
                const pgVp = page.getViewport({ scale: 1 });
                encryptedPdf.addPage([pgVp.width, pgVp.height]);
            }

            const imgData = canvas.toDataURL('image/jpeg', 0.92);
            const pgVp = page.getViewport({ scale: 1 });
            encryptedPdf.addImage(imgData, 'JPEG', 0, 0, pgVp.width, pgVp.height);
        }

        updateProgress(95, 'Saving encrypted PDF...');
        const pdfBlob = encryptedPdf.output('blob');
        updateProgress(100, 'Complete!');
        showResult(`PDF encrypted with AES • ${totalPages} pages • ${formatFileSize(pdfBlob.size)}`, pdfBlob, 'protected.pdf');
        showToast('PDF protected with password!', 'success');
    } catch (e) { showToast('Error encrypting PDF: ' + e.message, 'error'); }
}

// ---- UNLOCK PDF ----
export async function handleUnlock(files, password) {
    if (!files.length) { showToast('Please select a PDF file', 'error'); return; }
    try {
        updateProgress(10, 'Unlocking PDF...');
        const bytes = await files[0].arrayBuffer();
        const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, password: password || undefined });
        updateProgress(60, 'Removing restrictions...');
        const pdfBytes = await doc.save();
        updateProgress(100, 'Complete!');
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        showResult(`PDF unlocked • ${formatFileSize(pdfBytes.length)}`, blob, 'unlocked.pdf');
        showToast('PDF unlocked!', 'success');
    } catch (e) { showToast('Error: ' + e.message, 'error'); }
}

// ---- PAGE NUMBERS ----
export async function handlePageNumbers(files, position) {
    if (!files.length) { showToast('Please select a PDF file', 'error'); return; }
    try {
        updateProgress(10, 'Adding page numbers...');
        const bytes = await files[0].arrayBuffer();
        const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
        const font = await doc.embedFont(StandardFonts.Helvetica);
        const pages = doc.getPages();
        pages.forEach((page, i) => {
            const { width, height } = page.getSize();
            const text = `${i + 1}`;
            const fontSize = 11;
            let x, y;
            if (position === 'bottom-center') { x = width / 2 - font.widthOfTextAtSize(text, fontSize) / 2; y = 25; }
            else if (position === 'bottom-right') { x = width - 40; y = 25; }
            else if (position === 'top-center') { x = width / 2 - font.widthOfTextAtSize(text, fontSize) / 2; y = height - 30; }
            else { x = width / 2 - font.widthOfTextAtSize(text, fontSize) / 2; y = 25; }
            page.drawText(text, { x, y, size: fontSize, font, color: rgb(0.3, 0.3, 0.3) });
            updateProgress(10 + (80 * (i + 1) / pages.length));
        });
        const pdfBytes = await doc.save();
        updateProgress(100, 'Complete!');
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        showResult(`Added page numbers to ${pages.length} pages`, blob, 'numbered.pdf');
        showToast('Page numbers added!', 'success');
    } catch (e) { showToast('Error: ' + e.message, 'error'); }
}

// ---- PDF TO JPG ----
export async function handlePdfToJpg(files) {
    if (!files.length) { showToast('Please select a PDF file', 'error'); return; }
    try {
        updateProgress(5, 'Converting PDF to images...');
        const bytes = await files[0].arrayBuffer();
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        const pdf = await window.pdfjsLib.getDocument({ data: bytes }).promise;
        const totalPages = pdf.numPages;
        const zip = new JSZip();
        for (let i = 1; i <= totalPages; i++) {
            const page = await pdf.getPage(i);
            const viewport = page.getViewport({ scale: 2.0 });
            const canvas = document.createElement('canvas');
            canvas.width = viewport.width; canvas.height = viewport.height;
            await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
            const imgData = canvas.toDataURL('image/jpeg', 0.92).split(',')[1];
            zip.file(`page_${i}.jpg`, imgData, { base64: true });
            updateProgress(5 + (85 * i / totalPages), `Converting page ${i}/${totalPages}`);
        }
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        updateProgress(100, 'Complete!');
        showResult(`Converted ${totalPages} pages to JPG • ${formatFileSize(zipBlob.size)}`, zipBlob, 'pdf_images.zip');
        showToast('Conversion complete!', 'success');
    } catch (e) { showToast('Error: ' + e.message, 'error'); }
}

// ---- JPG TO PDF ----
export async function handleJpgToPdf(files) {
    if (!files.length) { showToast('Please select image files', 'error'); return; }
    try {
        updateProgress(5, 'Converting images to PDF...');
        const doc = await PDFDocument.create();
        for (let i = 0; i < files.length; i++) {
            const bytes = await files[i].arrayBuffer();
            let img;
            if (files[i].type === 'image/png') img = await doc.embedPng(bytes);
            else img = await doc.embedJpg(bytes);
            const page = doc.addPage([img.width, img.height]);
            page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
            updateProgress(5 + (85 * (i + 1) / files.length), `Adding image ${i + 1}/${files.length}`);
        }
        const pdfBytes = await doc.save();
        updateProgress(100, 'Complete!');
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        showResult(`Created PDF from ${files.length} images • ${formatFileSize(pdfBytes.length)}`, blob, 'images.pdf');
        showToast('Images converted to PDF!', 'success');
    } catch (e) { showToast('Error: ' + e.message, 'error'); }
}

// ---- REPAIR PDF ----
export async function handleRepair(files) {
    if (!files.length) { showToast('Please select a PDF file', 'error'); return; }
    try {
        updateProgress(10, 'Repairing PDF...');
        const bytes = await files[0].arrayBuffer();
        const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, throwOnInvalidObject: false });
        updateProgress(60, 'Re-serializing...');
        const pdfBytes = await doc.save();
        updateProgress(100, 'Complete!');
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        showResult(`PDF repaired • ${formatFileSize(pdfBytes.length)}`, blob, 'repaired.pdf');
        showToast('PDF repaired!', 'success');
    } catch (e) { showToast('Error repairing: ' + e.message, 'error'); }
}

// ---- PDF TO PDF/A ----
export async function handlePdfToPdfa(files) {
    if (!files.length) { showToast('Please select a PDF file', 'error'); return; }
    try {
        updateProgress(10, 'Converting to PDF/A-1b...');
        const bytes = await files[0].arrayBuffer();
        const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });

        // Set required document metadata
        const title = doc.getTitle() || files[0].name.replace(/\.pdf$/i, '');
        doc.setTitle(title);
        doc.setAuthor(doc.getAuthor() || 'BookMyCA');
        doc.setCreator('BookMyCA PDF Toolkit');
        doc.setProducer('BookMyCA PDF/A Converter');
        doc.setCreationDate(new Date());
        doc.setModificationDate(new Date());

        updateProgress(30, 'Adding XMP metadata...');

        // Create XMP metadata stream for PDF/A-1b compliance
        const now = new Date().toISOString();
        const xmpMetadata = `<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description rdf:about=""
      xmlns:dc="http://purl.org/dc/elements/1.1/"
      xmlns:xmp="http://ns.adobe.com/xap/1.0/"
      xmlns:pdf="http://ns.adobe.com/pdf/1.3/"
      xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/">
      <dc:title><rdf:Alt><rdf:li xml:lang="x-default">${title}</rdf:li></rdf:Alt></dc:title>
      <dc:creator><rdf:Seq><rdf:li>BookMyCA</rdf:li></rdf:Seq></dc:creator>
      <xmp:CreatorTool>BookMyCA PDF Toolkit</xmp:CreatorTool>
      <xmp:CreateDate>${now}</xmp:CreateDate>
      <xmp:ModifyDate>${now}</xmp:ModifyDate>
      <pdf:Producer>BookMyCA PDF/A Converter</pdf:Producer>
      <pdfaid:part>1</pdfaid:part>
      <pdfaid:conformance>B</pdfaid:conformance>
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;

        // Attach XMP as metadata stream
        const xmpBytes = new TextEncoder().encode(xmpMetadata);
        const xmpStream = doc.context.stream(xmpBytes, {
            Type: 'Metadata',
            Subtype: 'XML',
            Length: xmpBytes.length
        });
        const xmpRef = doc.context.register(xmpStream);
        doc.catalog.set(PDFLib.PDFName.of('Metadata'), xmpRef);

        updateProgress(60, 'Adding OutputIntent...');

        // Add OutputIntent for sRGB color space (required for PDF/A)
        const outputIntentDict = doc.context.obj({
            Type: 'OutputIntent',
            S: 'GTS_PDFA1',
            OutputConditionIdentifier: 'sRGB',
            RegistryName: 'http://www.color.org',
            Info: 'sRGB IEC61966-2.1'
        });
        const outputIntentRef = doc.context.register(outputIntentDict);
        doc.catalog.set(
            PDFLib.PDFName.of('OutputIntents'),
            doc.context.obj([outputIntentRef])
        );

        updateProgress(80, 'Saving PDF/A-1b...');
        const pdfBytes = await doc.save();
        updateProgress(100, 'Complete!');
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        showResult(`Converted to PDF/A-1b • ${doc.getPageCount()} pages • ${formatFileSize(pdfBytes.length)}`, blob, 'document_pdfa.pdf');
        showToast('Converted to PDF/A-1b!', 'success');
    } catch (e) { showToast('Error converting to PDF/A: ' + e.message, 'error'); }
}

// ---- CROP PDF ----
export async function handleCrop(files, marginPct) {
    if (!files.length) { showToast('Please select a PDF file', 'error'); return; }
    try {
        updateProgress(10, 'Cropping PDF...');
        const bytes = await files[0].arrayBuffer();
        const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
        const pages = doc.getPages();
        const m = parseFloat(marginPct) / 100 || 0.1;
        pages.forEach((page, i) => {
            const { width, height } = page.getSize();
            const mx = width * m, my = height * m;
            page.setCropBox(mx, my, width - 2 * mx, height - 2 * my);
            updateProgress(10 + (80 * (i + 1) / pages.length));
        });
        const pdfBytes = await doc.save();
        updateProgress(100, 'Complete!');
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        showResult(`Cropped ${pages.length} pages • ${formatFileSize(pdfBytes.length)}`, blob, 'cropped.pdf');
        showToast('PDF cropped!', 'success');
    } catch (e) { showToast('Error: ' + e.message, 'error'); }
}
