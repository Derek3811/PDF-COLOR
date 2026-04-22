// Global pdfjsLib from CDN
const pdfjsLib = window['pdfjs-dist/build/pdf'];
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

let files = [];
let jobResults = {};

const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const btnTotalPages = document.getElementById('btnTotalPages');
const btnColorPages = document.getElementById('btnColorPages');
const btnDownloadColor = document.getElementById('btnDownloadColor');
const btnDownloadBW = document.getElementById('btnDownloadBW');
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

function debugCheckElements() {
    const ids = ['dropZone', 'fileInput', 'btnTotalPages', 'btnColorPages', 'btnDownloadColor', 'btnDownloadBW', 'btnClear', 'resultsTable', 'resultsBody', 'resultsFooter', 'summarySection', 'resTotalPages', 'resBillableColor', 'resTotalBW', 'resColorFiles', 'resBWFiles', 'resColorCost', 'resBWCost', 'resGrandTotal', 'resTotalPagesAuto', 'resBillableColorAuto', 'resTotalBWAuto', 'resColorFilesAuto', 'resBWFilesAuto', 'resColorCostAuto', 'resBWCostAuto', 'resGrandTotalAuto', 'footTotalPages', 'footSigColor', 'footAnyColor', 'footBillable', 'colorPrice', 'bwPrice'];
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
        handleFiles(allFiles);
    } else if (e.dataTransfer.files.length) {
        handleFiles(e.dataTransfer.files);
    }
});

async function traverseFileTree(entry, path = "") {
    const files = [];
    async function internalTraverse(item, currentPath) {
        if (item.isFile) {
            if (item.name.toLowerCase().endsWith('.pdf')) {
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

fileInput.addEventListener('change', () => {
    if (fileInput.files.length) handleFiles(fileInput.files);
});

if (colorPriceInput) colorPriceInput.addEventListener('input', () => renderTable());
if (bwPriceInput) bwPriceInput.addEventListener('input', () => renderTable());

if (btnToggleDetails) {
    btnToggleDetails.addEventListener('click', () => {
        const isExpanded = resultsCollapsible.classList.toggle('expanded');
        detailsSection.classList.toggle('expanded-state');
        btnToggleDetails.innerHTML = isExpanded ? 
            '<span class="toggle-icon">▼</span> Hide Itemized List' : 
            '<span class="toggle-icon">▶</span> View File Details';
    });
}

function handleFiles(newFiles) {
    console.log("handleFiles triggered with count:", newFiles.length);
    for (const file of newFiles) {
        if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
            const id = Math.random().toString(36).substring(7);
            const path = file.webkitRelativePath || file.filepath || file.name;
            files.push({ id, file, path });
            jobResults[id] = { 
                name: file.name, 
                path: path,
                status: 'pending', 
                totalPages: null, 
                colorPages: null, 
                anyColorPages: null, 
                note: '' 
            };
        }
    }
    console.log("Files state after upload:", files);
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
    if (btnClear)    btnClear.disabled = !hasFiles || isProcessing;
}

btnClear.addEventListener('click', () => {
    files = [];
    jobResults = {};
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
        
        let notesHtml = '';
        if (job.note) {
            const splitted = job.note.split(', ');
            notesHtml = splitted.map(n => `<span class="note-tag">${n}</span>`).join('');
        }
        if (job.totalPages) totalP += job.totalPages;
        if (job.colorPages) totalSig += job.colorPages;
        if (job.anyColorPages) totalAny += job.anyColorPages;

        const billableCount = (job.colorPages > 0) ? (job.anyColorPages || 0) : 0;
        totalBil += billableCount;

        const colorInputHtml = `<input type="number" class="inline-edit-input" value="${job.colorPages ?? 0}" min="0" max="${job.totalPages || 9999}" data-id="${f.id}">`;

        tr.innerHTML = `
            <td title="${job.path}">${job.path}</td>
            <td><span class="status-badge ${job.status}">${job.status}</span></td>
            <td>${job.totalPages ?? '-'}</td>
            <td>${colorInputHtml}</td>
            <td>${job.anyColorPages ?? '-'}</td>
            <td>${billableCount}</td>
            <td>${(billableCount > 0) ? (notesHtml || '-') : '-'}</td>
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
        
        // Manual logic (based on Billable Color)
        const billableCount = (job.colorPages > 0) ? (job.anyColorPages || 0) : 0;
        if (billableCount > 0) colorFileCount++;
        else bwFileCount++;

        // Auto logic (based on Any Color Pages)
        const anyCount = job.anyColorPages || 0;
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

async function processFiles(mode) {
    console.log("processFiles triggered! Mode:", mode, "Files count:", files.length);
    if (summarySection) summarySection.classList.remove('hidden');
    
    if (btnTotalPages) btnTotalPages.disabled = true;
    if (btnColorPages) btnColorPages.disabled = true;

    // Use a single invisible canvas
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    for (const f of files) {
        console.log("Processing file:", f.file.name);
        const job = jobResults[f.id];
        if (job.status === 'done') continue;
        
        job.status = 'processing';
        renderTable();
        await yieldEventLoop();
        
        try {
            const arrayBuffer = await f.file.arrayBuffer();
            const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
            const numPages = pdf.numPages;
            job.totalPages = numPages;
            
            if (mode === 'TOTAL_PAGES') {
                job.status = 'done';
                renderTable();
                continue;
            }
            
            let colorPages = 0;
            let anyColorPages = 0;
            let hasPhoto = false;
            let hasGraphic = false;
            let hasHighlight = false;
            let hasExhibit = false;
            let hasChart = false;
            
            for (let pageNum = 1; pageNum <= numPages; pageNum++) {
                const page = await pdf.getPage(pageNum);
                
                let pageHasHighlight = false;
                let pageHasExhibit = false;
                
                // 1. Analyze Annotations & Text
                const annotations = await page.getAnnotations();
                const textContent = await page.getTextContent();
                const pageText = textContent.items.map(i => i.str).join(' ').toLowerCase();

                // Note: We deliberately do NOT search pageText for 'exhibit' to avoid falsely flagging pages that just mention it in the footer.
                
                for (const ann of annotations) {
                    if (ann.subtype === 'Highlight') {
                        pageHasHighlight = true;
                        hasHighlight = true;
                    }
                    if (ann.contents && ann.contents.toLowerCase().includes('exhibit')) {
                        pageHasExhibit = true;
                        hasExhibit = true;
                    }
                }
                
                // 2. Analyze Operators
                const opList = await page.getOperatorList();
                let vectorCount = 0;
                let hasText = false;
                let pageHasImageOp = false;
                
                for (let i = 0; i < opList.fnArray.length; i++) {
                    const fn = opList.fnArray[i];
                    if (fn === pdfjsLib.OPS.paintImageXObject || fn === pdfjsLib.OPS.paintJpegXObject) {
                        pageHasImageOp = true;
                    }
                    if (fn === pdfjsLib.OPS.fill || fn === pdfjsLib.OPS.stroke || fn === pdfjsLib.OPS.eofill) {
                        vectorCount++;
                    }
                    if (fn === pdfjsLib.OPS.showText || fn === pdfjsLib.OPS.showSpacedText) {
                        hasText = true;
                    }
                }
                
                if (vectorCount > 50) {
                    if (hasText) hasChart = true;
                    else hasGraphic = true;
                }
                
                // 3. Render and detect color (scale 0.2 represents large pixel groupings making it very fast)
                const viewport = page.getViewport({ scale: 0.2 });
                canvas.width = viewport.width;
                canvas.height = viewport.height;
                
                await page.render({ canvasContext: ctx, viewport: viewport }).promise;
                
                const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
                let isColor = false;
                let isAnyColorPage = false;
                
                let colorfulPixelCount = 0;
                let uniqueColorBuckets = new Set();
                let yellowPixels = 0;
                let exhibitStickerPixels = 0;
                let genericColorPixels = 0;
                
                const w = canvas.width;
                const h = canvas.height;
                const top15 = Math.floor(h * 0.15);
                const right20 = Math.floor(w * 0.80);
                const bottom20 = Math.floor(h * 0.80);
                
                for (let y = 0; y < h; y++) {
                    for (let x = 0; x < w; x++) {
                        const idx = (y * w + x) * 4;
                        if (imgData[idx+3] < 10) continue; // Check alpha
                        
                        const r = imgData[idx];
                        const g = imgData[idx+1];
                        const b = imgData[idx+2];
                        
                        const maxCh = Math.max(r,g,b);
                        const minCh = Math.min(r,g,b);
                        const diff = maxCh - minCh;
                        
                        // Track ANY color (including top area, logos, etc)
                        if (diff > 15) {
                            isAnyColorPage = true;
                        }

                        // 1. Coordinate filtering: Skip top 15% (exclude logos)
                        if (y < top15) continue;
                        
                        // Gather color mass
                        if (diff > 15) {
                            genericColorPixels++;
                        }
                        
                        // Advanced heuristic for photograph detection
                        if (r < 240 || g < 240 || b < 240) { // Ignore white-ish background
                            if (diff > 5) { // Ensure there is some localized color saturation
                                colorfulPixelCount++;
                                const bucket = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
                                uniqueColorBuckets.add(bucket);
                            }
                        }
                        
                        // 2. HSV pale yellow detection (Hue 45-65) even with low saturation
                        if (diff > 5) { // Any measurable color difference
                            let hue = 0;
                            if (maxCh === r) {
                                hue = (g - b) / diff;
                            } else if (maxCh === g) {
                                hue = 2.0 + (b - r) / diff;
                            } else {
                                hue = 4.0 + (r - g) / diff;
                            }
                            hue *= 60;
                            if (hue < 0) hue += 360;
                            
                            if (hue >= 40 && hue <= 70) {
                                yellowPixels++;
                            }
                        }
                        
                        // 4. Secondary deep scan on bottom-right 20% for exhibit stickers
                        if (x >= right20 && y >= bottom20) {
                            if (diff > 25) { // Distinct color marker in exhibit region
                                exhibitStickerPixels++;
                            }
                        }
                    }
                }
                
                // 3. Grouping determination (Threshold) checking for block presence
                // Require significant pixel mass to avoid scan noise (e.g., 250+ pixels = ~1 sq inch area)
                if (yellowPixels > 40) {
                    pageHasHighlight = true;
                    hasHighlight = true;
                }
                
                if (exhibitStickerPixels > 50) {
                    pageHasExhibit = true;
                    hasExhibit = true;
                }
                
                if (pageHasHighlight || pageHasExhibit) {
                    isColor = true;
                }
                
                // Demand sufficient color mass to justify color printing (excludes tiny logos, colored bates stamps)
                // 300 pixels at 0.2 scale (~1.5 sq inches text)
                if (genericColorPixels > 80) {
                    isColor = true;
                }
                
                if (isColor) colorPages++;
                if (isAnyColorPage) anyColorPages++;

                if (yellowPixels > 0 || genericColorPixels > 0) {
                    console.log(`[DEBUG] Page ${pageNum}: YellowPixels=${yellowPixels}, GenericColor=${genericColorPixels}, ExhibitSticker=${exhibitStickerPixels} -> isColor=${isColor}`);
                }
                
                if (pageHasImageOp && !hasPhoto) {
                    // A "real photograph" or phone scan must contain significant noise and grouping.
                    const totalAreaPixels = canvas.width * canvas.height;
                    // Catch color images/photos
                    if (colorfulPixelCount > (totalAreaPixels * 0.02) && uniqueColorBuckets.size > 50) {
                        hasPhoto = true;
                    } 
                    // Catch very noisy or grayscale phone scans (where > 30% of the page is off-white)
                    else if (colorfulPixelCount > (totalAreaPixels * 0.30)) {
                        hasPhoto = true;
                    }
                }
                
                // Yield occasionally to keep UI spiffy
                if (pageNum % 5 === 0) await yieldEventLoop();
            }
            
            job.colorPages = colorPages;
            job.anyColorPages = anyColorPages;
            
            const notesArray = [];
            if (hasPhoto) {
                notesArray.push('scanned with photo');
            } else {
                if (hasGraphic) notesArray.push('contains graphic');
                if (hasChart) notesArray.push('contains chart');
                if (hasHighlight) notesArray.push('contains highlight');
                if (hasExhibit) notesArray.push('exhibit sticker');
            }
            job.note = notesArray.join(', ');
            
            job.status = 'done';
        } catch (err) {
            console.error('Error processing PDF:', err);
            job.status = 'error';
        }
        renderTable();
    }
    
    updateButtons();
}

btnTotalPages.addEventListener('click', () => processFiles('TOTAL_PAGES'));
btnColorPages.addEventListener('click', () => processFiles('COLOR_PAGES'));

async function downloadZip(type) {
    const zip = new JSZip();
    let count = 0;

    for (const f of files) {
        const job = jobResults[f.id];
        const billableCount = (job.colorPages > 0) ? (job.anyColorPages || 0) : 0;
        
        const isColor = billableCount > 0;
        const isBW = billableCount === 0;

        if ((type === 'COLOR' && isColor) || (type === 'BW' && isBW)) {
            // Using arrayBuffer to ensure JSZip gets the raw data reliably
            const data = await f.file.arrayBuffer();
            // Use f.path to recreate the original folder structure
            zip.file(f.path, data);
            count++;
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
