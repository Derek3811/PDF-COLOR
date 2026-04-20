// Global pdfjsLib from CDN
const pdfjsLib = window['pdfjs-dist/build/pdf'];
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

let files = [];
let jobResults = {};

const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const btnTotalPages = document.getElementById('btnTotalPages');
const btnColorPages = document.getElementById('btnColorPages');
const btnClear = document.getElementById('btnClear');
const resultsTable = document.getElementById('resultsTable');
const resultsBody = document.getElementById('resultsBody');
const summarySection = document.getElementById('summarySection');

const sumTotalPagesEl = document.getElementById('sumTotalPages');
const sumColorPagesEl = document.getElementById('sumColorPages');
const sumColorNotesPagesEl = document.getElementById('sumColorNotesPages');

// Event Listeners
dropZone.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('dragover'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
});
fileInput.addEventListener('change', () => {
    if (fileInput.files.length) handleFiles(fileInput.files);
});

function handleFiles(newFiles) {
    for (const file of newFiles) {
        if (file.type === 'application/pdf') {
            const id = Math.random().toString(36).substring(7);
            files.push({ id, file });
            jobResults[id] = { name: file.name, status: 'pending', totalPages: null, colorPages: null, note: '' };
        }
    }
    renderTable();
    updateButtons();
}

function updateButtons() {
    const hasFiles = files.length > 0;
    btnTotalPages.disabled = !hasFiles;
    btnColorPages.disabled = !hasFiles;
    btnClear.disabled = !hasFiles;
}

btnClear.addEventListener('click', () => {
    files = [];
    jobResults = {};
    renderTable();
    updateButtons();
    summarySection.classList.add('hidden');
    resultsTable.classList.add('hidden');
});

function renderTable() {
    resultsBody.innerHTML = '';
    let totalP = 0, totalColor = 0, colorWithNotes = 0;
    
    if (files.length > 0) resultsTable.classList.remove('hidden');
    else resultsTable.classList.add('hidden');
    
    for (const f of files) {
        const job = jobResults[f.id];
        const tr = document.createElement('tr');
        
        let notesHtml = '';
        if (job.note) {
            const splitted = job.note.split(', ');
            notesHtml = splitted.map(n => `<span class="note-tag">${n}</span>`).join('');
            if (job.colorPages > 0) colorWithNotes += job.colorPages;
        }
        
        if (job.totalPages) totalP += job.totalPages;
        if (job.colorPages) totalColor += job.colorPages;

        tr.innerHTML = `
            <td>${job.name}</td>
            <td><span class="status-badge ${job.status}">${job.status}</span></td>
            <td>${job.totalPages ?? '-'}</td>
            <td>${job.colorPages ?? '-'}</td>
            <td>${notesHtml || '-'}</td>
        `;
        resultsBody.appendChild(tr);
    }
    
    sumTotalPagesEl.textContent = totalP;
    sumColorPagesEl.textContent = totalColor;
    sumColorNotesPagesEl.textContent = colorWithNotes;
}

// Ensure UI stays responsive by yielding
const yieldEventLoop = () => new Promise(r => setTimeout(r, 0));

async function processFiles(mode) {
    summarySection.classList.remove('hidden');
    
    btnTotalPages.disabled = true;
    btnColorPages.disabled = true;

    // Use a single invisible canvas
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    for (const f of files) {
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
                
                let colorfulPixelCount = 0;
                let uniqueColorBuckets = new Set();
                let yellowPixels = 0;
                let exhibitStickerPixels = 0;
                
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
                        
                        // 1. Coordinate filtering: Skip top 15% (exclude logos)
                        if (y < top15) continue;
                        
                        // Basic color page check
                        if (diff > 15) {
                            isColor = true;
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
                            
                            if (hue >= 45 && hue <= 65) {
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
                if (yellowPixels > 250) {
                    pageHasHighlight = true;
                    hasHighlight = true;
                }
                
                if (exhibitStickerPixels > 100) {
                    pageHasExhibit = true;
                    hasExhibit = true;
                }
                
                if (pageHasHighlight || pageHasExhibit) {
                    isColor = true;
                }
                
                if (isColor) colorPages++;
                
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
