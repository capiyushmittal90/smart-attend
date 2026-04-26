// =========================================
// BookMyCA - Advanced PDF Processing Handlers
// =========================================
import { showToast, downloadBlob, updateProgress, showResult, formatFileSize } from './utils.js';

const { PDFDocument, rgb, StandardFonts, degrees } = PDFLib;

// ---- ORGANIZE PDF (Reorder/Delete Pages) ----
export async function handleOrganize(files, selectedPages) {
    if (!files.length) { showToast('Please select a PDF file', 'error'); return; }
    try {
        updateProgress(10, 'Organizing pages...');
        const bytes = await files[0].arrayBuffer();
        const srcDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
        const newDoc = await PDFDocument.create();

        // Parse page selection (e.g. "1,3,5-8")
        const indices = parsePageSelection(selectedPages, srcDoc.getPageCount());
        for (let i = 0; i < indices.length; i++) {
            const [page] = await newDoc.copyPages(srcDoc, [indices[i]]);
            newDoc.addPage(page);
            updateProgress(10 + (80 * (i + 1) / indices.length));
        }
        const pdfBytes = await newDoc.save();
        updateProgress(100, 'Complete!');
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        showResult(`Organized ${indices.length} pages • ${formatFileSize(pdfBytes.length)}`, blob, 'organized.pdf');
        showToast('Pages organized!', 'success');
    } catch (e) { showToast('Error: ' + e.message, 'error'); }
}

function parsePageSelection(sel, maxPages) {
    if (!sel || !sel.trim()) return Array.from({ length: maxPages }, (_, i) => i);
    const indices = [];
    sel.split(',').forEach(part => {
        part = part.trim();
        if (part.includes('-')) {
            const [a, b] = part.split('-').map(Number);
            for (let i = a; i <= b && i <= maxPages; i++) indices.push(i - 1);
        } else {
            const n = parseInt(part);
            if (n >= 1 && n <= maxPages) indices.push(n - 1);
        }
    });
    return indices;
}

// ---- SIGN PDF ----
export async function handleSign(files, signatureDataUrl) {
    if (!files.length) { showToast('Please select a PDF file', 'error'); return; }
    if (!signatureDataUrl) { showToast('Please draw your signature', 'error'); return; }
    try {
        updateProgress(10, 'Adding signature...');
        const pdfBytes = await files[0].arrayBuffer();
        const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });

        // Convert canvas data URL to PNG bytes
        const sigResponse = await fetch(signatureDataUrl);
        const sigBytes = await sigResponse.arrayBuffer();
        const sigImage = await doc.embedPng(new Uint8Array(sigBytes));

        const lastPage = doc.getPages()[doc.getPageCount() - 1];
        const { width, height } = lastPage.getSize();
        const sigW = 180, sigH = 60;
        lastPage.drawImage(sigImage, {
            x: width - sigW - 50, y: 50,
            width: sigW, height: sigH
        });
        updateProgress(80, 'Saving...');
        const savedBytes = await doc.save();
        updateProgress(100, 'Complete!');
        const blob = new Blob([savedBytes], { type: 'application/pdf' });
        showResult(`Signature added • ${formatFileSize(savedBytes.length)}`, blob, 'signed.pdf');
        showToast('Signature added!', 'success');
    } catch (e) { showToast('Error signing PDF: ' + e.message, 'error'); }
}

// ---- EDIT PDF (Add Text) ----
export async function handleEdit(files, textToAdd, x, y, fontSize) {
    if (!files.length) { showToast('Please select a PDF file', 'error'); return; }
    if (!textToAdd) { showToast('Please enter text to add', 'error'); return; }
    try {
        updateProgress(10, 'Editing PDF...');
        const bytes = await files[0].arrayBuffer();
        const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
        const font = await doc.embedFont(StandardFonts.Helvetica);
        const page = doc.getPages()[0];
        const { height } = page.getSize();

        page.drawText(textToAdd, {
            x: parseFloat(x) || 50,
            y: height - (parseFloat(y) || 50),
            size: parseFloat(fontSize) || 14,
            font,
            color: rgb(0, 0, 0)
        });

        updateProgress(80, 'Saving...');
        const pdfBytes = await doc.save();
        updateProgress(100, 'Complete!');
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        showResult(`Text added to PDF • ${formatFileSize(pdfBytes.length)}`, blob, 'edited.pdf');
        showToast('PDF edited!', 'success');
    } catch (e) { showToast('Error: ' + e.message, 'error'); }
}

// ---- REDACT PDF ----
export async function handleRedact(files, pageNum, x, y, w, h) {
    if (!files.length) { showToast('Please select a PDF file', 'error'); return; }
    try {
        updateProgress(10, 'Redacting content...');
        const bytes = await files[0].arrayBuffer();
        const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
        const page = doc.getPages()[(parseInt(pageNum) || 1) - 1];
        const { height } = page.getSize();

        // Draw black rectangle over the area
        page.drawRectangle({
            x: parseFloat(x) || 50,
            y: height - (parseFloat(y) || 50) - (parseFloat(h) || 30),
            width: parseFloat(w) || 200,
            height: parseFloat(h) || 30,
            color: rgb(0, 0, 0),
        });

        updateProgress(80, 'Saving...');
        const pdfBytes = await doc.save();
        updateProgress(100, 'Complete!');
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        showResult(`Content redacted • ${formatFileSize(pdfBytes.length)}`, blob, 'redacted.pdf');
        showToast('Content redacted!', 'success');
    } catch (e) { showToast('Error: ' + e.message, 'error'); }
}

// ---- COMPARE PDF ----
export async function handleCompare(files) {
    if (files.length < 2) { showToast('Please select 2 PDF files to compare', 'error'); return; }
    try {
        updateProgress(10, 'Comparing PDFs...');
        const [bytes1, bytes2] = await Promise.all([files[0].arrayBuffer(), files[1].arrayBuffer()]);
        const doc1 = await PDFDocument.load(bytes1, { ignoreEncryption: true });
        const doc2 = await PDFDocument.load(bytes2, { ignoreEncryption: true });

        const pages1 = doc1.getPageCount();
        const pages2 = doc2.getPageCount();
        const maxPages = Math.max(pages1, pages2);

        // Create side-by-side comparison using PDF rendering
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        const pdf1 = await window.pdfjsLib.getDocument({ data: bytes1 }).promise;
        const pdf2 = await window.pdfjsLib.getDocument({ data: bytes2 }).promise;

        const zip = new JSZip();
        for (let i = 1; i <= maxPages; i++) {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            canvas.width = 1600; canvas.height = 1100;
            ctx.fillStyle = '#f0f0f0';
            ctx.fillRect(0, 0, 1600, 1100);

            // Draw labels
            ctx.fillStyle = '#333';
            ctx.font = 'bold 16px Arial';
            ctx.fillText(`File 1: ${files[0].name} (Page ${i})`, 20, 25);
            ctx.fillText(`File 2: ${files[1].name} (Page ${i})`, 810, 25);

            // Render page from doc 1
            if (i <= pdf1.numPages) {
                const p1 = await pdf1.getPage(i);
                const vp1 = p1.getViewport({ scale: 780 / p1.getViewport({ scale: 1 }).width });
                const c1 = document.createElement('canvas');
                c1.width = vp1.width; c1.height = vp1.height;
                await p1.render({ canvasContext: c1.getContext('2d'), viewport: vp1 }).promise;
                ctx.drawImage(c1, 10, 40, 780, Math.min(vp1.height, 1050));
            }

            // Render page from doc 2
            if (i <= pdf2.numPages) {
                const p2 = await pdf2.getPage(i);
                const vp2 = p2.getViewport({ scale: 780 / p2.getViewport({ scale: 1 }).width });
                const c2 = document.createElement('canvas');
                c2.width = vp2.width; c2.height = vp2.height;
                await p2.render({ canvasContext: c2.getContext('2d'), viewport: vp2 }).promise;
                ctx.drawImage(c2, 810, 40, 780, Math.min(vp2.height, 1050));
            }

            // Divider line
            ctx.strokeStyle = '#ff0000';
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(800, 0); ctx.lineTo(800, 1100); ctx.stroke();

            const imgData = canvas.toDataURL('image/png').split(',')[1];
            zip.file(`comparison_page_${i}.png`, imgData, { base64: true });
            updateProgress(10 + (80 * i / maxPages), `Comparing page ${i}/${maxPages}`);
        }

        const zipBlob = await zip.generateAsync({ type: 'blob' });
        updateProgress(100, 'Complete!');
        showResult(`Compared ${maxPages} pages (${pages1} vs ${pages2} pages)`, zipBlob, 'comparison.zip');
        showToast('Comparison complete!', 'success');
    } catch (e) { showToast('Error comparing: ' + e.message, 'error'); }
}

// ---- HTML TO PDF ----
export async function handleHtmlToPdf(files) {
    if (!files.length) { showToast('Please select an HTML file', 'error'); return; }
    try {
        updateProgress(10, 'Converting HTML to PDF...');
        const text = await files[0].text();

        // Create an iframe to render the HTML
        const iframe = document.createElement('iframe');
        iframe.style.cssText = 'position:fixed;left:-9999px;width:800px;height:1100px;border:none';
        document.body.appendChild(iframe);
        iframe.contentDocument.open();
        iframe.contentDocument.write(text);
        iframe.contentDocument.close();

        await new Promise(r => setTimeout(r, 500));

        updateProgress(40, 'Rendering...');
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF('p', 'mm', 'a4');

        // Use html2canvas if available, otherwise extract text
        if (window.html2canvas) {
            const canvas = await html2canvas(iframe.contentDocument.body, { scale: 2 });
            const imgData = canvas.toDataURL('image/jpeg', 0.95);
            const imgW = 210; // A4 width mm
            const imgH = canvas.height * imgW / canvas.width;
            pdf.addImage(imgData, 'JPEG', 0, 0, imgW, imgH);
        } else {
            const bodyText = iframe.contentDocument.body.innerText || text;
            const lines = pdf.splitTextToSize(bodyText, 180);
            let y = 15;
            for (const line of lines) {
                if (y > 280) { pdf.addPage(); y = 15; }
                pdf.text(line, 15, y);
                y += 6;
            }
        }

        document.body.removeChild(iframe);
        updateProgress(90, 'Saving PDF...');
        const pdfBlob = pdf.output('blob');
        updateProgress(100, 'Complete!');
        const filename = files[0].name.replace(/\.html?$/i, '') + '.pdf';
        showResult(`Converted HTML to PDF • ${formatFileSize(pdfBlob.size)}`, pdfBlob, filename);
        showToast('HTML converted to PDF!', 'success');
    } catch (e) { showToast('Error: ' + e.message, 'error'); }
}

// ---- PDF TO WORD (.docx) ----
export async function handlePdfToWord(files) {
    if (!files.length) { showToast('Please select a PDF file', 'error'); return; }
    try {
        updateProgress(5, 'Extracting text from PDF...');
        const bytes = await files[0].arrayBuffer();
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        const pdf = await window.pdfjsLib.getDocument({ data: bytes }).promise;

        const paragraphs = [];
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();

            // Build lines from text items
            let lastY = null;
            let currentLine = '';
            textContent.items.forEach(item => {
                const y = Math.round(item.transform[5]);
                if (lastY !== null && Math.abs(y - lastY) > 5) {
                    if (currentLine.trim()) paragraphs.push(currentLine.trim());
                    currentLine = '';
                }
                currentLine += item.str + ' ';
                lastY = y;
            });
            if (currentLine.trim()) paragraphs.push(currentLine.trim());

            // Add page break marker
            if (i < pdf.numPages) {
                paragraphs.push('__PAGE_BREAK__');
            }
            updateProgress(5 + (60 * i / pdf.numPages), `Extracting page ${i}/${pdf.numPages}`);
        }

        updateProgress(70, 'Building Word document...');

        // Use docx library if available for proper .docx
        if (window.docx) {
            const doc = new docx.Document({
                sections: buildDocxSections(paragraphs)
            });
            const docxBlob = await docx.Packer.toBlob(doc);
            updateProgress(100, 'Complete!');
            const filename = files[0].name.replace(/\.pdf$/i, '') + '.docx';
            showResult(`Converted to Word • ${formatFileSize(docxBlob.size)} • ${pdf.numPages} pages`, docxBlob, filename);
            showToast('PDF converted to Word!', 'success');
        } else {
            // Fallback: create a rich HTML document that Word can open
            const htmlContent = buildWordHtml(paragraphs, files[0].name);
            const blob = new Blob([htmlContent], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
            updateProgress(100, 'Complete!');
            const filename = files[0].name.replace(/\.pdf$/i, '') + '.doc';
            showResult(`Converted to Word • ${formatFileSize(blob.size)} • ${pdf.numPages} pages`, blob, filename);
            showToast('PDF converted to Word!', 'success');
        }
    } catch (e) { showToast('Error converting to Word: ' + e.message, 'error'); }
}

function buildDocxSections(paragraphs) {
    const sections = [{ children: [] }];
    let currentSection = sections[0];

    for (const text of paragraphs) {
        if (text === '__PAGE_BREAK__') {
            // Start new section with page break
            currentSection = { children: [] };
            sections.push(currentSection);
            continue;
        }

        // Detect headings (all caps short lines, or lines that look like titles)
        const isHeading = text.length < 80 && (text === text.toUpperCase() || /^[A-Z][A-Za-z\s]{3,60}$/.test(text));

        currentSection.children.push(new docx.Paragraph({
            children: [
                new docx.TextRun({
                    text: text,
                    bold: isHeading,
                    size: isHeading ? 28 : 22, // Half-points: 14pt vs 11pt
                    font: 'Calibri'
                })
            ],
            spacing: { after: 120 },
            heading: isHeading ? docx.HeadingLevel.HEADING_2 : undefined
        }));
    }

    return sections;
}

function buildWordHtml(paragraphs, filename) {
    const lines = paragraphs
        .filter(p => p !== '__PAGE_BREAK__')
        .map(p => `<p style="font-family: Calibri, sans-serif; font-size: 11pt; line-height: 1.5; margin: 0 0 6pt 0;">${p}</p>`)
        .join('\n');

    return `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><title>${filename}</title>
<style>body { font-family: Calibri, sans-serif; font-size: 11pt; margin: 1in; }</style>
</head><body>${lines}</body></html>`;
}

// ---- PDF TO EXCEL (.xlsx via CSV) ----
export async function handlePdfToExcel(files) {
    if (!files.length) { showToast('Please select a PDF file', 'error'); return; }
    try {
        updateProgress(5, 'Extracting data from PDF...');
        const bytes = await files[0].arrayBuffer();
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        const pdf = await window.pdfjsLib.getDocument({ data: bytes }).promise;

        const allRows = [];
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();

            // Group text items by Y position to form rows
            const rowMap = new Map();
            textContent.items.forEach(item => {
                const y = Math.round(item.transform[5] / 3) * 3; // Group nearby Y values
                if (!rowMap.has(y)) rowMap.set(y, []);
                rowMap.get(y).push({ x: item.transform[4], text: item.str });
            });

            // Sort rows by Y (descending for top-to-bottom) and columns by X
            const sortedYs = [...rowMap.keys()].sort((a, b) => b - a);
            for (const y of sortedYs) {
                const items = rowMap.get(y).sort((a, b) => a.x - b.x);
                // Detect columns by spacing gaps
                const row = [];
                let lastX = -999;
                let cellText = '';
                for (const item of items) {
                    if (item.x - lastX > 30 && cellText) {
                        row.push(cellText.trim());
                        cellText = '';
                    }
                    cellText += item.text + ' ';
                    lastX = item.x + item.text.length * 5;
                }
                if (cellText.trim()) row.push(cellText.trim());
                if (row.some(c => c.length > 0)) allRows.push(row);
            }

            updateProgress(5 + (70 * i / pdf.numPages), `Processing page ${i}/${pdf.numPages}`);
        }

        updateProgress(80, 'Building Excel file...');

        // Build XLSX using JSZip (minimal Open XML spreadsheet)
        const xlsx = await buildXlsx(allRows);
        updateProgress(100, 'Complete!');
        const filename = files[0].name.replace(/\.pdf$/i, '') + '.xlsx';
        showResult(`Converted to Excel • ${allRows.length} rows • ${formatFileSize(xlsx.size)}`, xlsx, filename);
        showToast('PDF converted to Excel!', 'success');
    } catch (e) { showToast('Error converting to Excel: ' + e.message, 'error'); }
}

// Build a proper .xlsx file using JSZip (Open XML format)
function buildXlsx(rows) {
    const zip = new JSZip();

    // [Content_Types].xml
    zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`);

    // _rels/.rels
    zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`);

    // xl/_rels/workbook.xml.rels
    zip.file('xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`);

    // xl/workbook.xml
    zip.file('xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="PDF Data" sheetId="1" r:id="rId1"/></sheets>
</workbook>`);

    // xl/styles.xml
    zip.file('xl/styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>
</styleSheet>`);

    // xl/worksheets/sheet1.xml - the actual data
    let sheetData = '';
    rows.forEach((row, rowIdx) => {
        sheetData += `<row r="${rowIdx + 1}">`;
        row.forEach((cell, colIdx) => {
            const colLetter = getColLetter(colIdx);
            const cellRef = `${colLetter}${rowIdx + 1}`;
            const escaped = escapeXml(cell);
            // Check if it's a number
            const num = parseFloat(cell.replace(/[,$%]/g, ''));
            if (!isNaN(num) && cell.trim().length > 0 && /^[\d,.$%-]+$/.test(cell.trim())) {
                sheetData += `<c r="${cellRef}"><v>${num}</v></c>`;
            } else {
                sheetData += `<c r="${cellRef}" t="inlineStr"><is><t>${escaped}</t></is></c>`;
            }
        });
        sheetData += '</row>';
    });

    zip.file('xl/worksheets/sheet1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetData>${sheetData}</sheetData>
</worksheet>`);

    return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

function getColLetter(idx) {
    let s = '';
    while (idx >= 0) {
        s = String.fromCharCode(65 + (idx % 26)) + s;
        idx = Math.floor(idx / 26) - 1;
    }
    return s;
}

function escapeXml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ---- PDF TO POWERPOINT (.pptx) ----
export async function handlePdfToPpt(files) {
    if (!files.length) { showToast('Please select a PDF file', 'error'); return; }
    try {
        updateProgress(5, 'Converting PDF to PowerPoint...');
        const bytes = await files[0].arrayBuffer();
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        const pdf = await window.pdfjsLib.getDocument({ data: bytes }).promise;

        // Convert each page to an image and embed in PPTX
        const zip = new JSZip();

        // Content Types
        let contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Default Extension="jpeg" ContentType="image/jpeg"/>
<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>`;

        let presRels = '';
        let slideList = '';

        for (let i = 1; i <= pdf.numPages; i++) {
            updateProgress(5 + (80 * i / pdf.numPages), `Converting page ${i}/${pdf.numPages}`);

            const page = await pdf.getPage(i);
            const viewport = page.getViewport({ scale: 2.0 });
            const canvas = document.createElement('canvas');
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;

            // Save image
            const imgDataUrl = canvas.toDataURL('image/jpeg', 0.90);
            const imgBase64 = imgDataUrl.split(',')[1];
            zip.file(`ppt/media/image${i}.jpeg`, imgBase64, { base64: true });

            // Slide XML
            const slideXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
<p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>
<p:pic><p:nvPicPr><p:cNvPr id="2" name="Image${i}"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr>
<p:blipFill><a:blip r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>
<p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="9144000" cy="6858000"/></a:xfrm>
<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>
</p:spTree></p:cSld></p:sld>`;
            zip.file(`ppt/slides/slide${i}.xml`, slideXml);

            // Slide rels
            zip.file(`ppt/slides/_rels/slide${i}.xml.rels`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image${i}.jpeg"/>
</Relationships>`);

            contentTypes += `\n<Override PartName="/ppt/slides/slide${i}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`;
            presRels += `<Relationship Id="rId${i}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${i}.xml"/>`;
            slideList += `<p:sldId id="${255 + i}" r:id="rId${i}"/>`;
        }

        contentTypes += '</Types>';
        zip.file('[Content_Types].xml', contentTypes);

        // Root rels
        zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
</Relationships>`);

        // Presentation rels
        zip.file('ppt/_rels/presentation.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${presRels}</Relationships>`);

        // Presentation.xml
        zip.file('ppt/presentation.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
<p:sldMasterIdLst/><p:sldIdLst>${slideList}</p:sldIdLst>
<p:sldSz cx="9144000" cy="6858000"/><p:notesSz cx="6858000" cy="9144000"/>
</p:presentation>`);

        const pptxBlob = await zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
        updateProgress(100, 'Complete!');
        const filename = files[0].name.replace(/\.pdf$/i, '') + '.pptx';
        showResult(`Converted to PowerPoint • ${pdf.numPages} slides • ${formatFileSize(pptxBlob.size)}`, pptxBlob, filename);
        showToast('PDF converted to PowerPoint!', 'success');
    } catch (e) { showToast('Error converting to PowerPoint: ' + e.message, 'error'); }
}

// ---- WORD TO PDF ----
export async function handleWordToPdf(files) {
    if (!files.length) { showToast('Please select a Word document', 'error'); return; }
    try {
        updateProgress(5, 'Reading Word document...');
        const file = files[0];
        const arrayBuffer = await file.arrayBuffer();
        const { jsPDF } = window.jspdf;

        // Check if mammoth.js is available for proper DOCX parsing
        if (window.mammoth && /\.docx$/i.test(file.name)) {
            updateProgress(20, 'Parsing DOCX structure...');
            const result = await mammoth.convertToHtml({ arrayBuffer });
            const htmlContent = result.value;

            // Create a hidden container to render the HTML
            const container = document.createElement('div');
            container.style.cssText = `
                position: fixed; left: -9999px; top: 0;
                width: 794px; padding: 60px 50px;
                background: white; color: black;
                font-family: 'Times New Roman', Georgia, serif;
                font-size: 12pt; line-height: 1.6;
            `;
            // Add styling for rendered content
            container.innerHTML = `
                <style>
                    * { box-sizing: border-box; }
                    p { margin: 0 0 8pt 0; }
                    h1 { font-size: 18pt; margin: 16pt 0 8pt; font-weight: bold; }
                    h2 { font-size: 15pt; margin: 14pt 0 6pt; font-weight: bold; }
                    h3 { font-size: 13pt; margin: 12pt 0 4pt; font-weight: bold; }
                    table { border-collapse: collapse; width: 100%; margin: 8pt 0; }
                    td, th { border: 1px solid #333; padding: 4pt 6pt; font-size: 11pt; }
                    th { background: #f0f0f0; font-weight: bold; }
                    ul, ol { margin: 0 0 8pt 20pt; }
                    li { margin: 2pt 0; }
                    img { max-width: 100%; height: auto; }
                    strong, b { font-weight: bold; }
                    em, i { font-style: italic; }
                </style>
                ${htmlContent}
            `;
            document.body.appendChild(container);

            // Wait for images/fonts to load
            await new Promise(r => setTimeout(r, 500));

            updateProgress(50, 'Rendering pages...');

            // Calculate page breaks (A4 = ~1123px at 96dpi for printable area)
            const pageHeight = 1003; // printable area height in pixels
            const totalHeight = container.scrollHeight;
            const totalPages = Math.ceil(totalHeight / pageHeight);
            const pdf = new jsPDF('p', 'mm', 'a4');

            for (let i = 0; i < totalPages; i++) {
                if (i > 0) pdf.addPage();

                // Clone container and clip to page
                container.style.height = pageHeight + 'px';
                container.style.overflow = 'hidden';
                container.scrollTop = 0;
                container.style.marginTop = -(i * pageHeight) + 'px';

                const canvas = await html2canvas(container, {
                    scale: 2,
                    useCORS: true,
                    logging: false,
                    width: 794,
                    height: pageHeight,
                    y: i * pageHeight,
                    scrollY: -(i * pageHeight),
                    windowHeight: pageHeight
                });

                const imgData = canvas.toDataURL('image/jpeg', 0.95);
                pdf.addImage(imgData, 'JPEG', 0, 0, 210, 297);
                updateProgress(50 + (40 * (i + 1) / totalPages), `Rendering page ${i + 1}/${totalPages}`);
            }

            container.style.marginTop = '0';
            document.body.removeChild(container);

            updateProgress(95, 'Saving PDF...');
            const pdfBlob = pdf.output('blob');
            updateProgress(100, 'Complete!');
            const filename = file.name.replace(/\.docx?$/i, '') + '.pdf';
            showResult(`Converted Word to PDF • ${totalPages} pages • ${formatFileSize(pdfBlob.size)}`, pdfBlob, filename);
            showToast('Word converted to PDF!', 'success');

        } else {
            // Fallback for .doc or when mammoth is unavailable: extract text
            updateProgress(20, 'Extracting text...');
            let textContent = '';
            try {
                // Try reading as text (works for .doc with plain text)
                const decoder = new TextDecoder('utf-8', { fatal: false });
                textContent = decoder.decode(new Uint8Array(arrayBuffer));
                // Strip binary garbage - keep only printable text
                textContent = textContent.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, ' ')
                    .replace(/\s{3,}/g, '\n')
                    .trim();
            } catch { textContent = 'Unable to parse this file format.'; }

            if (textContent.length < 10) {
                showToast('Could not extract text. Please use .docx format for best results.', 'error');
                return;
            }

            const pdf = new jsPDF('p', 'mm', 'a4');
            pdf.setFont('helvetica');
            pdf.setFontSize(11);
            const lines = pdf.splitTextToSize(textContent, 180);
            let y = 20;
            for (const line of lines) {
                if (y > 280) { pdf.addPage(); y = 20; }
                pdf.text(line, 15, y);
                y += 6;
            }
            updateProgress(100, 'Complete!');
            const pdfBlob = pdf.output('blob');
            const filename = file.name.replace(/\.docx?$/i, '') + '.pdf';
            showResult(`Converted to PDF • ${formatFileSize(pdfBlob.size)}`, pdfBlob, filename);
            showToast('Word converted to PDF!', 'success');
        }
    } catch (e) { showToast('Error converting Word to PDF: ' + e.message, 'error'); }
}

// ---- PPT TO PDF ----
export async function handlePptToPdf(files) {
    if (!files.length) { showToast('Please select a PowerPoint file', 'error'); return; }
    try {
        updateProgress(5, 'Reading PowerPoint file...');
        const file = files[0];
        const arrayBuffer = await file.arrayBuffer();
        const { jsPDF } = window.jspdf;

        if (/\.pptx$/i.test(file.name)) {
            // Parse PPTX (it's a ZIP file containing slide XML and media)
            updateProgress(15, 'Parsing PPTX structure...');
            const zip = await JSZip.loadAsync(arrayBuffer);

            // Find all slide files
            const slideFiles = Object.keys(zip.files)
                .filter(f => /^ppt\/slides\/slide\d+\.xml$/i.test(f))
                .sort((a, b) => {
                    const na = parseInt(a.match(/slide(\d+)/)[1]);
                    const nb = parseInt(b.match(/slide(\d+)/)[1]);
                    return na - nb;
                });

            if (slideFiles.length === 0) {
                showToast('No slides found in PPTX file', 'error');
                return;
            }

            const pdf = new jsPDF('l', 'mm', [254, 190.5]); // Standard slide size
            let firstSlide = true;

            for (let s = 0; s < slideFiles.length; s++) {
                updateProgress(15 + (75 * s / slideFiles.length), `Processing slide ${s + 1}/${slideFiles.length}`);

                if (!firstSlide) pdf.addPage();
                firstSlide = false;

                // Extract text from slide XML
                const slideXml = await zip.file(slideFiles[s]).async('text');
                const textMatches = slideXml.match(/<a:t>([^<]*)<\/a:t>/g) || [];
                const slideTexts = textMatches.map(m => m.replace(/<\/?a:t>/g, '').trim()).filter(Boolean);

                // Render slide background
                pdf.setFillColor(255, 255, 255);
                pdf.rect(0, 0, 254, 190.5, 'F');

                // Add slide number header
                pdf.setFontSize(8);
                pdf.setTextColor(150, 150, 150);
                pdf.text(`Slide ${s + 1}`, 5, 5);

                // Render text content with basic formatting
                let y = 25;
                pdf.setTextColor(0, 0, 0);
                for (let t = 0; t < slideTexts.length; t++) {
                    const text = slideTexts[t];
                    if (!text.trim()) continue;

                    // First text is usually title - make it bigger
                    if (t === 0) {
                        pdf.setFontSize(24);
                        pdf.setFont('helvetica', 'bold');
                        const titleLines = pdf.splitTextToSize(text, 234);
                        for (const line of titleLines) {
                            if (y > 175) break;
                            pdf.text(line, 10, y);
                            y += 12;
                        }
                        y += 5;
                    } else {
                        pdf.setFontSize(14);
                        pdf.setFont('helvetica', 'normal');
                        const bodyLines = pdf.splitTextToSize(text, 234);
                        for (const line of bodyLines) {
                            if (y > 175) break;
                            pdf.text('• ' + line, 15, y);
                            y += 8;
                        }
                    }
                }

                // Check for images in slide relationships
                const relsPath = slideFiles[s].replace('slides/', 'slides/_rels/') + '.rels';
                if (zip.files[relsPath]) {
                    const relsXml = await zip.file(relsPath).async('text');
                    const imgMatches = relsXml.match(/Target="\.\.\/media\/[^"]+"/g) || [];
                    for (const match of imgMatches) {
                        const imgPath = 'ppt/' + match.match(/Target="\.\.\/(.+?)"/)[1];
                        if (zip.files[imgPath]) {
                            try {
                                const imgData = await zip.file(imgPath).async('base64');
                                const ext = imgPath.split('.').pop().toLowerCase();
                                if (['jpg', 'jpeg', 'png'].includes(ext)) {
                                    const imgFormat = ext === 'png' ? 'PNG' : 'JPEG';
                                    pdf.addImage('data:image/' + ext + ';base64,' + imgData, imgFormat, 50, y, 154, 100);
                                    y += 105;
                                }
                            } catch { /* skip unrenderable images */ }
                        }
                    }
                }
            }

            updateProgress(95, 'Saving PDF...');
            const pdfBlob = pdf.output('blob');
            updateProgress(100, 'Complete!');
            const filename = file.name.replace(/\.pptx?$/i, '') + '.pdf';
            showResult(`Converted ${slideFiles.length} slides to PDF • ${formatFileSize(pdfBlob.size)}`, pdfBlob, filename);
            showToast('PowerPoint converted to PDF!', 'success');

        } else {
            // Fallback for .ppt (old binary format)
            showToast('Please use .pptx format. Legacy .ppt files require desktop conversion.', 'error');
        }
    } catch (e) { showToast('Error converting PowerPoint: ' + e.message, 'error'); }
}

// ---- EXCEL TO PDF ----
export async function handleExcelToPdf(files) {
    if (!files.length) { showToast('Please select an Excel file', 'error'); return; }
    try {
        updateProgress(5, 'Reading Excel file...');
        const file = files[0];
        const arrayBuffer = await file.arrayBuffer();
        const { jsPDF } = window.jspdf;

        // Use SheetJS to parse Excel properly
        if (window.XLSX) {
            updateProgress(20, 'Parsing spreadsheet...');
            const workbook = XLSX.read(arrayBuffer, { type: 'array' });

            const pdf = new jsPDF('l', 'mm', 'a4'); // Landscape for tables
            let firstSheet = true;

            for (let si = 0; si < workbook.SheetNames.length; si++) {
                const sheetName = workbook.SheetNames[si];
                const sheet = workbook.Sheets[sheetName];
                const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

                if (data.length === 0) continue;
                if (!firstSheet) pdf.addPage();
                firstSheet = false;

                updateProgress(20 + (70 * si / workbook.SheetNames.length), `Rendering sheet: ${sheetName}`);

                // Sheet title
                pdf.setFontSize(14);
                pdf.setFont('helvetica', 'bold');
                pdf.setTextColor(50, 50, 50);
                pdf.text(`Sheet: ${sheetName}`, 10, 12);

                // Calculate column widths based on content
                const maxCols = Math.min(data.reduce((max, row) => Math.max(max, row.length), 0), 20);
                const tableWidth = 277; // A4 landscape printable width
                const colWidth = tableWidth / Math.max(maxCols, 1);
                const rowHeight = 7;
                const startX = 10;
                let y = 20;

                // Render table
                for (let r = 0; r < data.length; r++) {
                    const row = data[r];
                    const isHeader = r === 0;

                    // Page break check
                    if (y + rowHeight > 200) {
                        pdf.addPage();
                        y = 15;
                        // Re-render header on new page
                        if (data[0]) {
                            pdf.setFillColor(63, 81, 181);
                            pdf.rect(startX, y, tableWidth, rowHeight, 'F');
                            pdf.setTextColor(255, 255, 255);
                            pdf.setFontSize(8);
                            pdf.setFont('helvetica', 'bold');
                            for (let c = 0; c < Math.min(data[0].length, maxCols); c++) {
                                const cellText = String(data[0][c] || '').substring(0, 25);
                                pdf.text(cellText, startX + c * colWidth + 2, y + 5);
                            }
                            y += rowHeight;
                            pdf.setTextColor(0, 0, 0);
                        }
                    }

                    // Row background
                    if (isHeader) {
                        pdf.setFillColor(63, 81, 181); // Material Blue header
                        pdf.setTextColor(255, 255, 255);
                        pdf.setFont('helvetica', 'bold');
                    } else if (r % 2 === 0) {
                        pdf.setFillColor(245, 245, 250);
                        pdf.setTextColor(0, 0, 0);
                        pdf.setFont('helvetica', 'normal');
                    } else {
                        pdf.setFillColor(255, 255, 255);
                        pdf.setTextColor(0, 0, 0);
                        pdf.setFont('helvetica', 'normal');
                    }
                    pdf.rect(startX, y, tableWidth, rowHeight, 'F');

                    // Cell borders
                    pdf.setDrawColor(200, 200, 200);
                    pdf.setLineWidth(0.2);
                    for (let c = 0; c <= maxCols; c++) {
                        pdf.line(startX + c * colWidth, y, startX + c * colWidth, y + rowHeight);
                    }
                    pdf.line(startX, y, startX + tableWidth, y);
                    pdf.line(startX, y + rowHeight, startX + tableWidth, y + rowHeight);

                    // Cell text
                    pdf.setFontSize(isHeader ? 8 : 7.5);
                    for (let c = 0; c < Math.min(row.length, maxCols); c++) {
                        const cellVal = String(row[c] || '');
                        const cellText = cellVal.substring(0, 25); // Truncate long text
                        pdf.text(cellText, startX + c * colWidth + 2, y + 5);
                    }

                    y += rowHeight;
                    if (isHeader) pdf.setTextColor(0, 0, 0);
                }
            }

            updateProgress(95, 'Saving PDF...');
            const pdfBlob = pdf.output('blob');
            updateProgress(100, 'Complete!');
            const totalRows = workbook.SheetNames.reduce((sum, name) => {
                return sum + XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1 }).length;
            }, 0);
            const filename = file.name.replace(/\.(xlsx?|csv)$/i, '') + '.pdf';
            showResult(`Converted Excel to PDF • ${totalRows} rows • ${workbook.SheetNames.length} sheet(s) • ${formatFileSize(pdfBlob.size)}`, pdfBlob, filename);
            showToast('Excel converted to PDF!', 'success');

        } else {
            // Fallback: treat as CSV text
            updateProgress(20, 'Reading as CSV...');
            const text = new TextDecoder().decode(new Uint8Array(arrayBuffer));
            const pdf = new jsPDF('l', 'mm', 'a4');
            pdf.setFont('courier');
            pdf.setFontSize(9);
            const lines = pdf.splitTextToSize(text, 277);
            let y = 15;
            for (const line of lines) {
                if (y > 200) { pdf.addPage(); y = 15; }
                pdf.text(line, 10, y);
                y += 5;
            }
            updateProgress(100, 'Complete!');
            const pdfBlob = pdf.output('blob');
            const filename = file.name.replace(/\.(xlsx?|csv)$/i, '') + '.pdf';
            showResult(`Converted to PDF • ${formatFileSize(pdfBlob.size)}`, pdfBlob, filename);
            showToast('Excel converted to PDF!', 'success');
        }
    } catch (e) { showToast('Error converting Excel: ' + e.message, 'error'); }
}

// ---- OCR PDF ----
export async function handleOcr(files) {
    if (!files.length) { showToast('Please select a PDF file', 'error'); return; }
    try {
        updateProgress(5, 'Extracting text (OCR)...');
        const bytes = await files[0].arrayBuffer();
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        const pdf = await window.pdfjsLib.getDocument({ data: bytes }).promise;

        let allText = '';
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map(item => item.str).join(' ');
            allText += `=== Page ${i} ===\n${pageText}\n\n`;
            updateProgress(5 + (85 * i / pdf.numPages), `Extracting page ${i}/${pdf.numPages}`);
        }

        updateProgress(95, 'Saving text...');
        const blob = new Blob([allText], { type: 'text/plain;charset=utf-8' });
        updateProgress(100, 'Complete!');
        const filename = files[0].name.replace(/\.pdf$/i, '') + '_ocr.txt';
        showResult(`Extracted text from ${pdf.numPages} pages • ${formatFileSize(blob.size)}`, blob, filename);
        showToast('Text extracted!', 'success');
    } catch (e) { showToast('Error: ' + e.message, 'error'); }
}

// ---- Signature Pad Setup ----
export function setupSignaturePad(canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');
    let drawing = false;

    // Set canvas size
    canvas.width = canvas.offsetWidth;
    canvas.height = 150;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';

    const getPos = (e) => {
        const rect = canvas.getBoundingClientRect();
        const touch = e.touches ? e.touches[0] : e;
        return { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
    };

    canvas.addEventListener('mousedown', (e) => { drawing = true; const p = getPos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); });
    canvas.addEventListener('mousemove', (e) => { if (!drawing) return; const p = getPos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); });
    canvas.addEventListener('mouseup', () => drawing = false);
    canvas.addEventListener('mouseleave', () => drawing = false);

    // Touch support
    canvas.addEventListener('touchstart', (e) => { e.preventDefault(); drawing = true; const p = getPos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); });
    canvas.addEventListener('touchmove', (e) => { e.preventDefault(); if (!drawing) return; const p = getPos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); });
    canvas.addEventListener('touchend', () => drawing = false);

    return {
        clear: () => { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height); },
        getDataUrl: () => canvas.toDataURL('image/png')
    };
}
