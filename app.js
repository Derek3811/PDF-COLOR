// Global pdfjsLib from CDN
const pdfjsLib = window['pdfjs-dist/build/pdf'];
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

let files = [];
let jobResults = {};

const DB_NAME = 'PDFAnalyzR_DB';
const STORE_NAME = 'files';

function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            }
        };
        request.onsuccess = (e) => resolve(e.target.result);
        request.onerror = (e) => reject(e.target.error);
    });
}

async function saveFileToDB(id, file) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put({ id, file });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

async function getFileFromDB(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const request = tx.objectStore(STORE_NAME).get(id);
        request.onsuccess = () => resolve(request.result?.file);
        request.onerror = () => reject(request.error);
    });
}

async function clearFilesDB() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const btnTotalPages = document.getElementById('btnTotalPages');
const btnColorPages = document.getElementById('btnColorPages');
const btnDownloadColor = document.getElementById('btnDownloadColor');
const btnDownloadBW = document.getElementById('btnDownloadBW');
const btnDownloadCSV = document.getElementById('btnDownloadCSV');
const btnClear = document.getElementById('btnClear');
const resultsTable = document.getElementById('resultsTable');
const resultsBody = document.getElementById('resultsBody');
const summarySection = document.getElementById('summarySection');
const downloadActions = document.getElementById('downloadActions');
const detailsSection = document.getElementById('detailsSection');
const btnToggleDetails = document.getElementById('btnToggleDetails');
const resultsCollapsible = document.getElementById('resultsCollapsible');

const resTotalPagesEl = document.getElementById('resTotalPages');
const resBillableColorEl = document.getElementById('resBillableColor');
const resTotalBWEl = document.getElementById('resTotalBW');
const resColorFilesEl = document.getElementById('resColorFiles');
const resBWFilesEl = document.getElementById('resBWFiles');
const resColorCostEl = document.getElementById('resColorCost');
const resBWCostEl = document.getElementById('resBWCost');
const resGrandTotalEl = document.getElementById('resGrandTotal');

// Auto-Run references
const resTotalPagesAutoEl = document.getElementById('resTotalPagesAuto');
const resBillableColorAutoEl = document.getElementById('resBillableColorAuto');
const resTotalBWAutoEl = document.getElementById('resTotalBWAuto');
const resColorFilesAutoEl = document.getElementById('resColorFilesAuto');
const resBWFilesAutoEl = document.getElementById('resBWFilesAuto');
const resColorCostAutoEl = document.getElementById('resColorCostAuto');
const resBWCostAutoEl = document.getElementById('resBWCostAuto');
const resGrandTotalAutoEl = document.getElementById('resGrandTotalAuto');

const resultsFooter = document.getElementById('resultsFooter');
const footTotalPagesEl = document.getElementById('footTotalPages');
const footSigColorEl = document.getElementById('footSigColor');
const footAnyColorEl = document.getElementById('footAnyColor');
const footBillableEl = document.getElementById('footBillable');

const colorPriceInput = document.getElementById('colorPrice');
const bwPriceInput = document.getElementById('bwPrice');

const checkPhotos = document.getElementById('checkPhotos');
const checkCharts = document.getElementById('checkCharts');
const checkHighlights = document.getElementById('checkHighlights');
const checkStickers = document.getElementById('checkStickers');
const checkText = document.getElementById('checkText');

function debugCheckElements() {
    const ids = ['dropZone', 'fileInput', 'btnTotalPages', 'btnColorPages', 'btnDownloadColor', 'btnDownloadBW', 'btnDownloadCSV', 'btnClear', 'resultsTable', 'resultsBody', 'resultsFooter', 'summarySection', 'resTotalPages', 'resBillableColor', 'resTotalBW', 'resColorFiles', 'resBWFiles', 'resColorCost', 'resBWCost', 'resGrandTotal', 'resTotalPagesAuto', 'resBillableColorAuto', 'resTotalBWAuto', 'resColorFilesAuto', 'resBWFilesAuto', 'resColorCostAuto', 'resBWCostAuto', 'resGrandTotalAuto', 'footTotalPages', 'footSigColor', 'footAnyColor', 'footBillable', 'colorPrice', 'bwPrice', 'checkPhotos', 'checkCharts', 'checkHighlights', 'checkStickers', 'checkText'];
    console.log("--- DOM ELEMENT CHECK ---");
    ids.forEach(id => {
        const el = document.getElementById(id);
        console.log(`ID [${id}]:`, el ? "FOUND" : "MISSING (NULL!)");
    });
    console.log("--------------------------");
}
debugCheckElements();

// Event Listeners
dropZone.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('dragover'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
dropZone.addEventListener('drop', async e => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    
    const items = e.dataTransfer.items;
    if (items) {
        let allFiles = [];
        for (const item of items) {
            const entry = item.webkitGetAsEntry();
            if (entry) {
                const folderFiles = await traverseFileTree(entry);
                allFiles = allFiles.concat(folderFiles);
            }
        }
        await handleFiles(allFiles);
    } else if (e.dataTransfer.files.length) {
        await handleFiles(e.dataTransfer.files);
    }
});

async function traverseFileTree(entry, path = "") {
    const files = [];
    async function internalTraverse(item, currentPath) {
        if (item.isFile) {
            const name = item.name.toLowerCase();
            if (name.endsWith('.pdf') || name.endsWith('.jpg') || name.endsWith('.jpeg') || name.endsWith('.png') || name.endsWith('.tiff') || name.endsWith('.tif')) {
                const file = await new Promise(res => item.file(res));
                // Store relative path for drag and drop
                file.filepath = currentPath + item.name;
                files.push(file);
            }
        } else if (item.isDirectory) {
            const dirReader = item.createReader();
            const getEntries = () => new Promise(res => dirReader.readEntries(res));
            let entries = await getEntries();
            while (entries.length > 0) {
                for (const child of entries) {
                    await internalTraverse(child, currentPath + item.name + "/");
                }
                entries = await getEntries();
            }
        }
    }
    await internalTraverse(entry, path);
    return files;
}

fileInput.addEventListener('change', async () => {
    if (fileInput.files.length) await handleFiles(fileInput.files);
});

if (colorPriceInput) colorPriceInput.addEventListener('input', () => renderTable());
if (bwPriceInput) bwPriceInput.addEventListener('input', () => renderTable());

[checkPhotos, checkCharts, checkHighlights, checkStickers, checkText].forEach(cb => {
    if (cb) cb.addEventListener('change', () => renderTable());
});

if (btnToggleDetails) {
    btnToggleDetails.addEventListener('click', () => {
        const isExpanded = resultsCollapsible.classList.toggle('expanded');
        detailsSection.classList.toggle('expanded-state');
        btnToggleDetails.innerHTML = isExpanded ? 
            '<span class="toggle-icon">▼</span> Hide Itemized List' : 
            '<span class="toggle-icon">▶</span> View File Details';
    });
}

async function handleFiles(newFiles) {
    const validExtensions = ['.pdf', '.jpg', '.jpeg', '.png', '.tiff', '.tif'];
    console.log("handleFiles triggered with count:", newFiles.length);
    for (const file of newFiles) {
        const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
        if (validExtensions.includes(ext) || file.type.startsWith('image/') || file.type === 'application/pdf') {
            const id = Math.random().toString(36).substring(7);
            const path = file.webkitRelativePath || file.filepath || file.name;
            
            // Save to IndexedDB and only keep metadata in memory
            await saveFileToDB(id, file);
            
            files.push({ id, name: file.name, path: path });
            jobResults[id] = { 
                name: file.name, 
                path: path,
                status: 'pending', 
                totalPages: null, 
                colorPages: null, 
                anyColorPages: null, 
                note: '',
                pages: [] // To store { isAny, isPhoto, isChart, isHighlight, isExhibit, isGeneric }
            };
        }
    }
    console.log("Files state after upload (metadata only):", files);
    renderTable();
    updateButtons();
}

function updateButtons() {
    const hasFiles = files.length > 0;
    const isProcessing = files.some(f => jobResults[f.id].status === 'processing');
    const anyDone = files.some(f => jobResults[f.id].status === 'done');
    
    // Enable download if we have files and aren't currently processing, 
    // and at least one file is 'done' (analyzed).
    const canDownload = hasFiles && !isProcessing && anyDone;

    if (btnTotalPages) btnTotalPages.disabled = !hasFiles || isProcessing;
    if (btnColorPages) btnColorPages.disabled = !hasFiles || isProcessing;
    if (btnDownloadColor) btnDownloadColor.disabled = !canDownload;
    if (btnDownloadBW) btnDownloadBW.disabled = !canDownload;
    if (btnDownloadCSV) btnDownloadCSV.disabled = !canDownload;
    if (btnClear)    btnClear.disabled = !hasFiles || isProcessing;
}

btnClear.addEventListener('click', async () => {
    files = [];
    jobResults = {};
    await clearFilesDB();
    if (resultsBody) resultsBody.innerHTML = '';
    renderTable();
    updateButtons();
    if (summarySection) summarySection.classList.add('hidden');
    if (downloadActions) downloadActions.classList.add('hidden');
    if (detailsSection) {
        detailsSection.classList.add('hidden');
        detailsSection.classList.remove('expanded-state');
    }
    if (resultsCollapsible) resultsCollapsible.classList.remove('expanded');
    if (btnToggleDetails) btnToggleDetails.innerHTML = '<span class="toggle-icon">▶</span> View File Details';
    if (resultsFooter) resultsFooter.classList.add('hidden');
});

function getDetectionSummary(job) {
    const showPhotos = checkPhotos.checked;
    const showCharts = checkCharts.checked;
    const showHighlights = checkHighlights.checked;
    const showStickers = checkStickers.checked;
    const showText = checkText.checked;

    let colorPagesCount = 0;
    let anyColorPagesCount = 0;
    let activeNotes = new Set();

    if (!job.pages || job.pages.length === 0) {
        return { colorCount: job.colorPages || 0, anyCount: job.anyColorPages || 0, note: job.note || '' };
    }

    job.pages.forEach(p => {
        let triggers = [];
        if (showPhotos && p.isPhoto) triggers.push('photo');
        if (showCharts && p.isChart) triggers.push('chart/graphic');
        if (showHighlights && p.isHighlight) triggers.push('highlight');
        if (showStickers && p.isExhibit) triggers.push('exhibit sticker');
        if (showText && p.isGeneric) triggers.push('colored text');

        if (triggers.length > 0) {
            colorPagesCount++;
            triggers.forEach(t => activeNotes.add(t));
        }
        if (p.isAny) anyColorPagesCount++;
    });

    return { 
        colorCount: colorPagesCount, 
        anyCount: anyColorPagesCount, 
        note: Array.from(activeNotes).join(', ') 
    };
}

function renderTable() {
    if (resultsBody) resultsBody.innerHTML = '';
    let totalP = 0, totalSig = 0, totalAny = 0, totalBil = 0;
    
    if (files.length > 0) {
        if (summarySection) summarySection.classList.remove('hidden');
        if (downloadActions) downloadActions.classList.remove('hidden');
        if (detailsSection) detailsSection.classList.remove('hidden');
        if (resultsFooter) resultsFooter.classList.remove('hidden');
    } else {
        if (summarySection) summarySection.classList.add('hidden');
        if (downloadActions) downloadActions.classList.add('hidden');
        if (detailsSection) detailsSection.classList.add('hidden');
        if (resultsFooter) resultsFooter.classList.add('hidden');
    }
    
    for (const f of files) {
        const job = jobResults[f.id];
        const tr = document.createElement('tr');
        
        const summary = getDetectionSummary(job);
        
        // If manual override exists and detection is done, we usually respect manual.
        // But for this request, we are primarily driven by checkboxes.
        // To handle manual override correctly: if colorPages is null, use detected.
        const detectedColor = summary.colorCount;
        if (job.colorPages === null && job.status === 'done') {
             job.colorPages = detectedColor;
             job.anyColorPages = summary.anyCount;
             job.note = summary.note;
        }

        const displayColor = (job.colorPages !== null) ? job.colorPages : (job.status === 'done' ? summary.colorCount : 0);
        const displayAny = (job.anyColorPages !== null) ? job.anyColorPages : (job.status === 'done' ? summary.anyCount : 0);
        const displayNote = (job.status === 'done') ? summary.note : '';

        totalP += (job.totalPages || 0);
        totalSig += displayColor;
        totalAny += displayAny;

        const billableCount = (displayColor > 0) ? (displayAny || 0) : 0;
        totalBil += billableCount;

        const colorInputHtml = `<input type="number" class="inline-edit-input" value="${displayColor}" min="0" max="${job.totalPages || 9999}" data-id="${f.id}">`;

        tr.innerHTML = `
            <td title="${job.path}">${job.path}</td>
            <td><span class="status-badge ${job.status}">${job.status}</span></td>
            <td>${job.totalPages ?? '-'}</td>
            <td>${colorInputHtml}</td>
            <td>${displayAny ?? '-'}</td>
            <td>${billableCount}</td>
            <td>${(billableCount > 0) ? (displayNote || '-') : '-'}</td>
        `;
        if (resultsBody) resultsBody.appendChild(tr);
    }
    
    // Footer Totals
    if (footTotalPagesEl) footTotalPagesEl.textContent = totalP;
    if (footSigColorEl) footSigColorEl.textContent = totalSig;
    if (footAnyColorEl) footAnyColorEl.textContent = totalAny;
    if (footBillableEl) footBillableEl.textContent = totalBil;
    
    updateSummary(totalP, totalBil);
    updateButtons();

    // Attach listeners to inline inputs
    document.querySelectorAll('.inline-edit-input').forEach(input => {
        input.addEventListener('change', (e) => {
            handleManualOverride(e.target.dataset.id, parseInt(e.target.value) || 0);
        });
    });
}

function handleManualOverride(id, newValue) {
    const job = jobResults[id];
    if (!job) return;

    // Backup the note if we haven't already
    if (job._fullNote === undefined) {
        job._fullNote = job.note;
    }

    job.colorPages = newValue;

    // Logic: If color count is 0, clear/hide notes. If > 0, restore original note.
    if (newValue === 0) {
        job.note = '';
    } else {
        job.note = job._fullNote || '';
    }

    renderTable();
}

function updateSummary(totalP, totalBillable) {
    const colorPrice = parseFloat(colorPriceInput?.value || 0.59);
    const bwPrice = parseFloat(bwPriceInput?.value || 0.12);
    
    // Manual Model Calculations
    let colorFileCount = 0;
    let bwFileCount = 0;
    
    // Auto Model Calculations
    let totalAnyColorPages = 0;
    let colorFileCountAuto = 0;
    let bwFileCountAuto = 0;

    for (const f of files) {
        const job = jobResults[f.id];
        const summary = getDetectionSummary(job);
        
        const displayColor = (job.colorPages !== null) ? job.colorPages : (job.status === 'done' ? summary.colorCount : 0);
        const displayAny = (job.anyColorPages !== null) ? job.anyColorPages : (job.status === 'done' ? summary.anyCount : 0);

        // Manual logic (based on Billable Color)
        const billableCount = (displayColor > 0) ? (displayAny || 0) : 0;
        if (billableCount > 0) colorFileCount++;
        else bwFileCount++;

        // Auto logic (based on Any Color Pages)
        const anyCount = displayAny || 0;
        totalAnyColorPages += anyCount;
        if (anyCount > 0) colorFileCountAuto++;
        else bwFileCountAuto++;
    }

    // Manual Costs
    const totalBW = Math.max(0, totalP - totalBillable);
    const colorCost = totalBillable * colorPrice;
    const bwCost = totalBW * bwPrice;
    const grandTotal = colorCost + bwCost;

    // Auto Costs
    const totalBWAuto = Math.max(0, totalP - totalAnyColorPages);
    const colorCostAuto = totalAnyColorPages * colorPrice;
    const bwCostAuto = totalBWAuto * bwPrice;
    const grandTotalAuto = colorCostAuto + bwCostAuto;

    // Update Manual UI
    if (resTotalPagesEl) resTotalPagesEl.textContent = totalP;
    if (resBillableColorEl) resBillableColorEl.textContent = totalBillable;
    if (resTotalBWEl) resTotalBWEl.textContent = totalBW;
    if (resColorFilesEl) resColorFilesEl.textContent = colorFileCount;
    if (resBWFilesEl) resBWFilesEl.textContent = bwFileCount;
    if (resColorCostEl) resColorCostEl.textContent = `$${colorCost.toFixed(2)}`;
    if (resBWCostEl) resBWCostEl.textContent = `$${bwCost.toFixed(2)}`;
    if (resGrandTotalEl) resGrandTotalEl.textContent = `$${grandTotal.toFixed(2)}`;

    // Update Auto UI
    if (resTotalPagesAutoEl) resTotalPagesAutoEl.textContent = totalP;
    if (resBillableColorAutoEl) resBillableColorAutoEl.textContent = totalAnyColorPages;
    if (resTotalBWAutoEl) resTotalBWAutoEl.textContent = totalBWAuto;
    if (resColorFilesAutoEl) resColorFilesAutoEl.textContent = colorFileCountAuto;
    if (resBWFilesAutoEl) resBWFilesAutoEl.textContent = bwFileCountAuto;
    if (resColorCostAutoEl) resColorCostAutoEl.textContent = `$${colorCostAuto.toFixed(2)}`;
    if (resBWCostAutoEl) resBWCostAutoEl.textContent = `$${bwCostAuto.toFixed(2)}`;
    if (resGrandTotalAutoEl) resGrandTotalAutoEl.textContent = `$${grandTotalAuto.toFixed(2)}`;
}

// Ensure UI stays responsive by yielding
const yieldEventLoop = () => new Promise(r => setTimeout(r, 0));

function analyzePixels(imgData, w, h) {
    let isAnyColorPage = false;
    let isPhoto = false;
    let isHighlight = false;
    let isExhibit = false;
    let isGeneric = false;
    
    let colorfulPixelCount = 0;
    let uniqueColorBuckets = new Set();
    let yellowPixels = 0;
    let exhibitStickerPixels = 0;
    let genericColorPixels = 0;
    
    const top15 = Math.floor(h * 0.15);
    const right20 = Math.floor(w * 0.80);
    const bottom20 = Math.floor(h * 0.80);
    
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const idx = (y * w + x) * 4;
            if (imgData[idx+3] < 10) continue; 
            
            const r = imgData[idx];
            const g = imgData[idx+1];
            const b = imgData[idx+2];
            
            const maxCh = Math.max(r,g,b);
            const minCh = Math.min(r,g,b);
            const diff = maxCh - minCh;
            
            if (diff > 15) isAnyColorPage = true;
            if (y < top15) continue;
            if (diff > 15) genericColorPixels++;
            
            if (r < 240 || g < 240 || b < 240) {
                if (diff > 5) {
                    colorfulPixelCount++;
                    const bucket = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
                    uniqueColorBuckets.add(bucket);
                }
            }
            
            if (diff > 5) {
                let hue = 0;
                if (maxCh === r) hue = (g - b) / diff;
                else if (maxCh === g) hue = 2.0 + (b - r) / diff;
                else hue = 4.0 + (r - g) / diff;
                hue *= 60;
                if (hue < 0) hue += 360;
                if (hue >= 40 && hue <= 70) yellowPixels++;
            }
            
            if (x >= right20 && y >= bottom20) {
                if (diff > 25) exhibitStickerPixels++;
            }
        }
    }
    
    if (yellowPixels > 40) isHighlight = true;
    if (exhibitStickerPixels > 50) isExhibit = true;
    if (genericColorPixels > 80) isGeneric = true;
    if (colorfulPixelCount > 500 && uniqueColorBuckets.size > 300) isPhoto = true;

    return { isAnyColorPage, isPhoto, isHighlight, isExhibit, isGeneric };
}

async function processFiles(mode) {
    console.log("processFiles triggered! Mode:", mode, "Files count:", files.length);
    if (summarySection) summarySection.classList.remove('hidden');
    
    if (btnTotalPages) btnTotalPages.disabled = true;
    if (btnColorPages) btnColorPages.disabled = true;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    for (const f of files) {
        const job = jobResults[f.id];
        if (job.status === 'done') continue;
        
        job.status = 'processing';
        renderTable();
        await yieldEventLoop();
        
        try {
            const file = await getFileFromDB(f.id);
            if (!file) throw new Error("File not found in storage");

            const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
            
            if (ext === '.pdf') {
                await handlePdfProcessing(file, job, mode, canvas, ctx);
            } else if (['.jpg', '.jpeg', '.png'].includes(ext)) {
                await handleImageProcessing(file, job, mode, canvas, ctx);
            } else if (['.tif', '.tiff'].includes(ext)) {
                await handleTiffProcessing(file, job, mode, canvas, ctx);
            }
            
            job.status = 'done';
        } catch (err) {
            console.error('Error processing file:', err);
            job.status = 'error';
        }
        renderTable();
    }
    
    updateButtons();
}

async function handlePdfProcessing(file, job, mode, canvas, ctx) {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
    job.totalPages = pdf.numPages;
    job.pages = [];
    
    if (mode === 'TOTAL_PAGES') return;
    
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        let pageIsHighlight = false;
        let pageIsExhibit = false;
        let pageIsChart = false;
        let pageIsGraphic = false;

        const annotations = await page.getAnnotations();
        for (const ann of annotations) {
            if (ann.subtype === 'Highlight') pageIsHighlight = true;
            if (ann.contents && ann.contents.toLowerCase().includes('exhibit')) pageIsExhibit = true;
        }
        
        const opList = await page.getOperatorList();
        let vectorCount = 0, hasText = false;
        for (let i = 0; i < opList.fnArray.length; i++) {
            const fn = opList.fnArray[i];
            if (fn === pdfjsLib.OPS.fill || fn === pdfjsLib.OPS.stroke || fn === pdfjsLib.OPS.eofill) vectorCount++;
            if (fn === pdfjsLib.OPS.showText || fn === pdfjsLib.OPS.showSpacedText) hasText = true;
        }
        if (vectorCount > 50) {
            if (hasText) pageIsChart = true;
            else pageIsGraphic = true;
        }
        
        const viewport = page.getViewport({ scale: 0.2 });
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvasContext: ctx, viewport: viewport }).promise;
        
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        const analysis = analyzePixels(imgData, canvas.width, canvas.height);
        
        job.pages.push({
            isAny: analysis.isAnyColorPage,
            isPhoto: analysis.isPhoto,
            isChart: pageIsChart || pageIsGraphic,
            isHighlight: analysis.isHighlight || pageIsHighlight,
            isExhibit: analysis.isExhibit || pageIsExhibit,
            isGeneric: analysis.isGeneric
        });
        
        if (pageNum % 5 === 0) await yieldEventLoop();
    }
}

async function handleImageProcessing(file, job, mode, canvas, ctx) {
    job.totalPages = 1;
    job.pages = [];
    if (mode === 'TOTAL_PAGES') return;

    const img = new Image();
    const url = URL.createObjectURL(file);
    await new Promise((res, rej) => {
        img.onload = res;
        img.onerror = rej;
        img.src = url;
    });
    
    const scale = Math.min(1, 200 / Math.max(img.width, img.height));
    canvas.width = img.width * scale;
    canvas.height = img.height * scale;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(url);
    
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const analysis = analyzePixels(imgData, canvas.width, canvas.height);
    
    job.pages.push({
        isAny: analysis.isAnyColorPage,
        isPhoto: analysis.isPhoto,
        isChart: false,
        isHighlight: analysis.isHighlight,
        isExhibit: analysis.isExhibit,
        isGeneric: analysis.isGeneric
    });
}

async function handleTiffProcessing(file, job, mode, canvas, ctx) {
    const arrayBuffer = await file.arrayBuffer();
    const ifds = UTIF.decode(arrayBuffer);
    job.totalPages = ifds.length;
    job.pages = [];
    
    if (mode === 'TOTAL_PAGES') return;
    
    for (let i = 0; i < ifds.length; i++) {
        const ifd = ifds[i];
        UTIF.decodeImage(arrayBuffer, ifd);
        const rgba = UTIF.toRGBA8(ifd);
        
        const scale = Math.min(1, 200 / Math.max(ifd.width, ifd.height));
        canvas.width = ifd.width * scale;
        canvas.height = ifd.height * scale;
        
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = ifd.width;
        tempCanvas.height = ifd.height;
        const tempCtx = tempCanvas.getContext('2d');
        const imgDataObj = tempCtx.createImageData(ifd.width, ifd.height);
        imgDataObj.data.set(rgba);
        tempCtx.putImageData(imgDataObj, 0, 0);
        
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(tempCanvas, 0, 0, canvas.width, canvas.height);
        
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        const analysis = analyzePixels(imgData, canvas.width, canvas.height);
        
        job.pages.push({
            isAny: analysis.isAnyColorPage,
            isPhoto: analysis.isPhoto,
            isChart: false,
            isHighlight: analysis.isHighlight,
            isExhibit: analysis.isExhibit,
            isGeneric: analysis.isGeneric
        });
        
        if (i % 2 === 0) await yieldEventLoop();
    }
}

btnTotalPages.addEventListener('click', () => processFiles('TOTAL_PAGES'));
btnColorPages.addEventListener('click', () => processFiles('COLOR_PAGES'));

async function downloadZip(type) {
    const zip = new JSZip();
    let count = 0;

    for (const f of files) {
        const job = jobResults[f.id];
        const summary = getDetectionSummary(job);
        
        const displayColor = (job.colorPages !== null) ? job.colorPages : (job.status === 'done' ? summary.colorCount : 0);
        const displayAny = (job.anyColorPages !== null) ? job.anyColorPages : (job.status === 'done' ? summary.anyCount : 0);

        const billableCount = (displayColor > 0) ? (displayAny || 0) : 0;
        
        const isColor = billableCount > 0;
        const isBW = billableCount === 0;

        if ((type === 'COLOR' && isColor) || (type === 'BW' && isBW)) {
            // Retrieve raw file from IndexedDB for zipping
            const file = await getFileFromDB(f.id);
            if (file) {
                const data = await file.arrayBuffer();
                // Use f.path to recreate the original folder structure
                zip.file(f.path, data);
                count++;
            }
        }
    }

    if (count === 0) {
        alert('No files in this category');
        return;
    }

    const content = await zip.generateAsync({ type: 'blob' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(content);
    link.download = `${type}_Files_${new Date().getTime()}.zip`;
    link.click();
}

btnDownloadColor.addEventListener('click', () => downloadZip('COLOR'));
btnDownloadBW.addEventListener('click', () => downloadZip('BW'));

async function downloadCSV() {
    let csv = 'FileName,Total Pages,Color Pages (To Print),Any Color Pages,Billable Color,Notes\n';
    
    for (const f of files) {
        const job = jobResults[f.id];
        const summary = getDetectionSummary(job);
        
        const displayColor = (job.colorPages !== null) ? job.colorPages : (job.status === 'done' ? summary.colorCount : 0);
        const displayAny = (job.anyColorPages !== null) ? job.anyColorPages : (job.status === 'done' ? summary.anyCount : 0);
        
        const billableCount = (displayColor > 0) ? (displayAny || 0) : 0;
        
        // Wrap notes and path in quotes to handle commas
        const note = (job.status === 'done') ? `"${summary.note}"` : '';
        const path = `"${job.path}"`;
        
        csv += `${path},${job.totalPages || 0},${displayColor},${displayAny},${billableCount},${note}\n`;
    }

    const blob = new Blob([csv], { type: 'text/csv' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `PDF_Color_Analysis_Report_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
}

btnDownloadCSV.addEventListener('click', downloadCSV);
