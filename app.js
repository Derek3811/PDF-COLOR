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
            let hasChart = false;
            
            for (let pageNum = 1; pageNum <= numPages; pageNum++) {
                const page = await pdf.getPage(pageNum);
                
                // 1. Analyze Annotations
                const annotations = await page.getAnnotations();
                for (const ann of annotations) {
                    if (ann.subtype === 'Highlight') hasHighlight = true;
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
                
                // Threshold 15 out of 255
                for (let i = 0; i < imgData.length; i += 4) {
                    if (imgData[i+3] > 10) { // Check alpha
                        const r = imgData[i];
                        const g = imgData[i+1];
                        const b = imgData[i+2];
                        
                        const maxCh = Math.max(r,g,b);
                        const minCh = Math.min(r,g,b);
                        
                        // Basic color page check
                        if (maxCh - minCh > 15) {
                            isColor = true;
                        }
                        
                        // Advanced heuristic for photograph detection
                        if (r < 240 || g < 240 || b < 240) { // Ignore white-ish background
                            if (maxCh - minCh > 5) { // Ensure there is some localized color saturation
                                colorfulPixelCount++;
                                const bucket = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
                                uniqueColorBuckets.add(bucket);
                            }
                        }
                    }
                }
                
                if (isColor) colorPages++;
                
                if (pageHasImageOp && !hasPhoto) {
                    // A "real photograph" must occupy a significant area and contain huge color diversity.
                    // This naturally rejects logos, small graphical image icons, and simple gradients.
                    const totalAreaPixels = canvas.width * canvas.height;
                    if (colorfulPixelCount > (totalAreaPixels * 0.05) && uniqueColorBuckets.size > 200) {
                        hasPhoto = true;
                    }
                }
                
                // Yield occasionally to keep UI spiffy
                if (pageNum % 5 === 0) await yieldEventLoop();
            }
            
            job.colorPages = colorPages;
            
            const notesArray = [];
            if (hasPhoto) notesArray.push('contains photo');
            if (hasGraphic) notesArray.push('contains graphic');
            if (hasChart) notesArray.push('contains chart');
            if (hasHighlight) notesArray.push('contains highlight');
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
