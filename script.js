const c = document.getElementById("view");
const ctx = c.getContext("2d");

let ORI = "Z";
let isListening = false;
let recognition = null;
let silenceTimer = null;
let partialTranscript = '';
let isSpeaking = false;
let hasAutoTriggeredSave = false;

// ==================== CONFIGURATION ====================
// 👇 QUAN TRỌNG: Điền URL Apps Script mới nhất bạn vừa Deploy vào đây
const GOOGLE_SHEETS_DATA_URL = 'https://script.google.com/macros/s/AKfycbz9EF-jw28rFIkCekd6NWyCldCK9HR-YHO2pVne85D3tIdU6bBc7L-bD5-ZZULIXZbv/exec';

let isSyncing = false;
let library = [];
let deleteTargetIndex = null;

// Khai báo các biến cho Voice Search trong Library
let isLibraryVoiceListening = false;
let libraryVoiceRecognition = null;

// ==================== SYNC FUNCTIONS (JSONP - ĐỌC DỮ LIỆU - CORS OK) ====================
function syncWithGoogleSheets() {
    if (isSyncing) return;
    isSyncing = true;
    updateSyncStatus('syncing', 'Loading data...');
    
    const callbackName = 'jsonpCallback_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    window[callbackName] = function(response) {
        const scriptEl = document.getElementById(callbackName);
        if (scriptEl) document.body.removeChild(scriptEl);
        delete window[callbackName];
        
        if (response && response.success && response.data) {
            library = response.data.map(item => ({
                name: item.Name || item.name || 'Untitled',
                link: item.Link || item.link || '',
                tags: item.Tags ? item.Tags.split(',').map(t => t.trim()).filter(t => t) : []
            }));
            renderLibrary();
            updateSyncStatus('success', `Loaded ${library.length} documents`);
            log(`✅ Loaded ${library.length} documents from Google Sheets`, 'system');
        } else {
            handleLibraryError('Invalid data format from server');
        }
        isSyncing = false;
    };

    const script = document.createElement('script');
    script.id = callbackName;
    script.src = `${GOOGLE_SHEETS_DATA_URL}?action=get&callback=${encodeURIComponent(callbackName)}&t=${Date.now()}`;
    script.onerror = function() {
        handleLibraryError('Network error');
        if (document.getElementById(callbackName)) document.body.removeChild(document.getElementById(callbackName));
        delete window[callbackName];
        isSyncing = false;
    };
    document.body.appendChild(script);
}

function handleLibraryError(errorMsg) {
    console.error('Sync error:', errorMsg);
    log('⚠️ Cannot connect to Google Sheets. Please check your connection.', 'system');
    updateSyncStatus('error', 'Connection error');
    const list = document.getElementById('libraryList');
    if (list) {
        list.innerHTML = `<div style="text-align: center; color: rgba(255,255,255,0.5); padding: 30px 0;">
            ❌ Cannot connect to Google Sheets
            <br><span style="font-size: 12px;">Please check your internet connection</span>
        </div>`;
    }
    library = [];
}

function updateSyncStatus(status, text) {
    const icon = document.getElementById('syncIcon');
    const textEl = document.getElementById('syncText');
    const statusEl = document.getElementById('syncStatus');
    if (!icon || !textEl || !statusEl) return;
    
    switch(status) {
        case 'syncing': icon.textContent = '🔄'; textEl.textContent = text; statusEl.style.borderColor = 'rgba(0,210,255,0.3)'; statusEl.style.background = 'rgba(0,210,255,0.05)'; break;
        case 'success': icon.textContent = '✅'; textEl.textContent = text; statusEl.style.borderColor = 'rgba(0,255,0,0.3)'; statusEl.style.background = 'rgba(0,255,0,0.05)'; break;
        case 'error': icon.textContent = '❌'; textEl.textContent = text; statusEl.style.borderColor = 'rgba(255,0,0,0.3)'; statusEl.style.background = 'rgba(255,0,0,0.05)'; break;
        default: icon.textContent = '✅'; textEl.textContent = text || 'Ready'; statusEl.style.borderColor = 'rgba(0,210,255,0.1)'; statusEl.style.background = 'rgba(0,210,255,0.05)';
    }
}

// ==================== ADD DOCUMENT (URL ENCODED FORM POST - TRÁNH CORS) ====================
async function addDocumentToGoogleSheets(doc) {
    const formData = new URLSearchParams();
    formData.append('action', 'add');
    formData.append('name', doc.name);
    formData.append('link', doc.link);
    formData.append('tags', doc.tags ? doc.tags.join(', ') : '');

    try {
        const response = await fetch(GOOGLE_SHEETS_DATA_URL, {
            method: 'POST',
            mode: 'no-cors', 
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: formData
        });
        return true; 
    } catch (error) {
        console.error('Add document via Form POST error:', error);
        throw error;
    }
}

// ==================== DELETE DOCUMENT (URL ENCODED FORM POST - TRÁNH CORS) ====================
async function deleteDocumentFromGoogleSheets(index, password) {
    const formData = new URLSearchParams();
    formData.append('action', 'delete');
    formData.append('index', index);
    formData.append('password', password);

    try {
        const response = await fetch(GOOGLE_SHEETS_DATA_URL, {
            method: 'POST',
            mode: 'no-cors', 
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: formData
        });
        return true;
    } catch (error) {
        console.error('Delete document via Form POST error:', error);
        throw error;
    }
}

// ==================== ADD DOCUMENT UI ====================
async function addDocument() {
    const nameInput = document.getElementById('newDocName');
    const linkInput = document.getElementById('newDocLink');
    const tagsInput = document.getElementById('newDocTags');
    
    if (!nameInput || !linkInput || !tagsInput) return alert('⚠️ Error: Input fields not found');
    
    const name = nameInput.value.trim();
    const link = linkInput.value.trim();
    const tags = tagsInput.value.trim().split(',').map(t => t.trim()).filter(t => t);
    
    if (!name) return alert('⚠️ Please enter document name');
    if (!link) return alert('⚠️ Please enter Drive link or description');
    
    const exists = library.some(doc => doc.name.toLowerCase() === name.toLowerCase());
    if (exists) return alert(`⚠️ Document "${name}" already exists in library`);
    
    const newDoc = { name, link, tags };
    
    try {
        await addDocumentToGoogleSheets(newDoc);
        
        library.push(newDoc);
        renderLibrary();
        
        nameInput.value = '';
        linkInput.value = '';
        tagsInput.value = '';
        
        log(`📤 Document "${name}" submitted via Form Post`, 'system');
        updateSyncStatus('success', `Sent "${name}". Will auto-refresh.`);
        
        setTimeout(() => {
            syncWithGoogleSheets();
        }, 1500);
        
        nameInput.focus();
    } catch (error) {
        console.error('Add document error:', error);
        alert('❌ Failed to submit document. Check your connection.');
        log('⚠️ Failed to submit document via Form Post', 'system');
    }
}

// ==================== DELETE DOCUMENT UI ====================
function showDeletePassword(index) {
    deleteTargetIndex = index;
    const doc = library[index];
    if (!doc) return alert('⚠️ Document not found');
    
    const passwordModal = document.createElement('div');
    passwordModal.id = 'passwordModal';
    passwordModal.style.cssText = `position: fixed; inset: 0; background: rgba(0,0,0,0.85); backdrop-filter: blur(10px); display: flex; justify-content: center; align-items: center; z-index: 2000; animation: fadeIn 0.3s ease;`;
    passwordModal.innerHTML = `
        <div style="background: rgba(20,27,43,0.98); border-radius: 20px; border: 1px solid rgba(255,255,255,0.08); max-width: 400px; width: 90%; padding: 30px; box-shadow: 0 30px 60px rgba(0,0,0,0.8);">
            <div style="text-align: center; margin-bottom: 20px;">
                <span style="font-size: 40px;">🔒</span>
                <h3 style="color: #fff; margin: 10px 0 5px 0; font-weight: 700;">Confirm Deletion</h3>
                <p style="color: rgba(255,255,255,0.6); font-size: 13px;">You are deleting: <strong style="color: #ff7675;">"${doc.name}"</strong></p>
            </div>
            <input id="deletePasswordInput" type="password" placeholder="Enter password..." 
                   style="width: 100%; height: 44px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; color: #fff; font-size: 15px; padding: 0 14px; outline: none; margin-bottom: 15px;">
            <div style="display: flex; gap: 10px;">
                <button onclick="closePasswordModal()" style="flex: 1; height: 40px; border: none; border-radius: 10px; background: rgba(255,255,255,0.1); color: #fff; font-weight: 600; cursor: pointer;">Cancel</button>
                <button onclick="confirmDeleteWithPassword()" style="flex: 1; height: 40px; border: none; border-radius: 10px; background: linear-gradient(135deg, #d63031, #ff7675); color: #fff; font-weight: 600; cursor: pointer;">Confirm</button>
            </div>
            <div id="passwordError" style="color: #ff7675; font-size: 12px; margin-top: 10px; text-align: center; display: none;">❌ Incorrect password!</div>
        </div>
    `;
    document.body.appendChild(passwordModal);
    setTimeout(() => { const input = document.getElementById('deletePasswordInput'); if (input) input.focus(); }, 200);
}

function closePasswordModal() {
    const modal = document.getElementById('passwordModal');
    if (modal) modal.remove();
    deleteTargetIndex = null;
}

async function confirmDeleteWithPassword() {
    const passwordInput = document.getElementById('deletePasswordInput');
    const password = passwordInput ? passwordInput.value.trim() : '';
    const errorDiv = document.getElementById('passwordError');
    
    if (deleteTargetIndex !== null && deleteTargetIndex < library.length) {
        const doc = library[deleteTargetIndex];
        try {
            await deleteDocumentFromGoogleSheets(deleteTargetIndex, password);
            
            library.splice(deleteTargetIndex, 1);
            renderLibrary();
            log(`🗑️ Deleted: ${doc.name}`, 'system');
            closePasswordModal();
            updateSyncStatus('success', `Deleted: ${doc.name}`);
            
            setTimeout(() => {
                syncWithGoogleSheets();
            }, 1000);
            
        } catch (error) {
            console.error('Delete error:', error);
            alert('❌ Failed to delete document from cloud.');
            closePasswordModal();
        }
    } else {
        alert('⚠️ Error: Document not found');
        closePasswordModal();
    }
}

// ==================== LIBRARY UI FUNCTIONS ====================
function renderLibrary(filteredList = null) {
    const list = document.getElementById('libraryList');
    if (!list) return;
    const docs = filteredList || library;
    if (docs.length === 0) { list.innerHTML = `<div style="text-align: center; color: rgba(255,255,255,0.4); padding: 30px 0;">📭 No documents found</div>`; return; }
    list.innerHTML = docs.map((doc, index) => {
        const originalIndex = library.indexOf(doc);
        const tagsHtml = doc.tags && doc.tags.length > 0 ? `<div style="display: flex; gap: 4px; flex-wrap: wrap; margin-top: 4px;">${doc.tags.map(tag => `<span style="background: rgba(108,92,231,0.2); color: #a29bfe; padding: 2px 8px; border-radius: 4px; font-size: 10px;">#${tag}</span>`).join('')}</div>` : '';
        return `<div class="library-item" style="display: flex; align-items: center; gap: 12px; padding: 10px 14px; background: rgba(255,255,255,0.03); border-radius: 10px; margin-bottom: 8px; border: 1px solid rgba(255,255,255,0.05);">
            <span style="font-size: 20px;">📄</span>
            <div style="flex: 1; min-width: 0;"><div style="font-weight: 600; color: #fff; font-size: 14px;">${doc.name}</div>${tagsHtml}</div>
            <button onclick="openDocument(${originalIndex})" class="btn btn-primary" style="flex: none; padding: 0 16px; height: 32px; font-size: 11px;">📂 Open</button>
            <button onclick="showDeletePassword(${originalIndex})" class="btn btn-reset" style="flex: none; padding: 0 12px; height: 32px; font-size: 11px; background: rgba(255,0,0,0.2);">✕</button>
        </div>`;
    }).join('');
}

function openDocument(index) {
    const doc = library[index];
    if (doc && doc.link) {
        if (doc.link.startsWith('http://') || doc.link.startsWith('https://')) window.open(doc.link, '_blank');
        else log(`📄 Info: ${doc.link}`, 'system');
        log(`📂 Opening: ${doc.name}`, 'system');
    } else alert('⚠️ Document not found or invalid link');
}

function openLibrary() {
    const modal = document.getElementById('libraryModal');
    if (modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
        renderLibrary();
        document.getElementById('searchQuery').value = '';
        document.getElementById('searchResults').style.display = 'none';
        log("📚 Library opened", 'system');
        syncWithGoogleSheets();
    }
}

function closeLibrary() {
    const modal = document.getElementById('libraryModal');
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
        closePasswordModal();
    }
}

// ==================== SEARCH FUNCTIONS ====================
function searchDocuments() {
    const query = document.getElementById('searchQuery').value.trim();
    if (!query) { renderLibrary(); document.getElementById('searchResults').style.display = 'none'; return; }
    const results = performSmartSearch(query);
    const resultsDiv = document.getElementById('searchResults');
    if (results.length === 0) {
        resultsDiv.style.display = 'block';
        resultsDiv.innerHTML = `<div style="text-align: center; color: rgba(255,255,255,0.5); padding: 15px 0;">🔍 No documents found for "${query}"<br><span style="font-size: 12px;">Try different keywords or add new documents</span></div>`;
        renderLibrary();
        return;
    }
    resultsDiv.style.display = 'block';
    resultsDiv.innerHTML = `<div style="color: rgba(255,255,255,0.6); font-size: 12px; margin-bottom: 8px;">✅ Found ${results.length} result(s) for "${query}"</div>`;
    renderLibrary(results);
}

function performSmartSearch(query) {
    const q = query.toLowerCase().trim();
    const words = q.split(/\s+/);
    const scored = library.map(doc => {
        let score = 0;
        const docName = doc.name.toLowerCase();
        const docTags = doc.tags ? doc.tags.map(t => t.toLowerCase()) : [];
        if (docName === q) score += 100;
        if (docName.includes(q)) score += 50;
        for (const word of words) {
            if (docName.includes(word)) score += 20;
            for (const tag of docTags) { if (tag.includes(word) || word.includes(tag)) score += 30; }
        }
        return { doc, score };
    });
    return scored.filter(item => item.score > 0).sort((a, b) => b.score - a.score).map(item => item.doc);
}

// ==================== VOICE NLP PROCESSING ====================
function processFullVoiceNLP(t) {
    if (!t || t.trim().length < 2) return;
    log("👤 " + t, 'user');
    let str = t.toLowerCase().trim();
    let updatedCount = 0;
    const cleanNumberString = (numStr) => {
        if (!numStr) return '0';
        let cleaned = numStr.replace(/[.,](\d{3})/g, '$1');
        cleaned = cleaned.replace(/,/g, '.');
        return cleaned;
    };
    const findVal = (keywords) => {
        for (let kw of keywords) {
            let regex = new RegExp(`\\b${kw}\\b(?:\\s+is|\\s+of|\\s*[:=]|\\s+)?\\s*(-?\\d+(?:[.,]\\d+)?)`, "i");
            let match = str.match(regex);
            if (match) return cleanNumberString(match[1]);
        }
        return null;
    };

    if (str.match(/search\s+(?:for\s+)?(.+)/i)) {
        let searchQuery = str.replace(/search\s+(?:for\s+)?/i, '').trim();
        if (searchQuery && searchQuery.length > 1) {
            document.getElementById('searchQuery').value = searchQuery;
            const results = performSmartSearch(searchQuery);
            if (results.length > 0) { const bestMatch = results[0]; if (bestMatch.link) { if (bestMatch.link.startsWith('http://') || bestMatch.link.startsWith('https://')) window.open(bestMatch.link, '_blank'); } searchDocuments(); } 
            else searchDocuments();
            const modal = document.getElementById('libraryModal');
            if (!modal.classList.contains('active')) openLibrary();
        }
        return;
    }

    if (str.match(/save\s*(?:file|document)?/i) || str.match(/export\s*file/i)) { autoSaveDialog(); return; }

    let len = findVal(["length", "dài"]);
    let wid = findVal(["width", "rộng"]);
    let hei = findVal(["thickness", "height", "dày", "cao"]);
    if (len !== null) { document.getElementById("dx").value = len; updatedCount++; }
    if (wid !== null) { document.getElementById("dy").value = wid; updatedCount++; }
    if (hei !== null) { document.getElementById("dz").value = hei; updatedCount++; }

    let posX = findVal(["position x", "pos x", "x position", "x"]);
    let posY = findVal(["position y", "pos y", "y position", "y"]);
    let posZ = findVal(["position z", "pos z", "z position", "z"]);

    if (posX !== null) { document.getElementById("px").value = posX; updatedCount++; }
    if (posY !== null) { document.getElementById("py").value = posY; updatedCount++; }
    if (posZ !== null) { document.getElementById("pz").value = posZ; updatedCount++; }

    let radAll = findVal(["corner radius", "radius"]);
    if (radAll !== null) { document.getElementById("r1").value = radAll; document.getElementById("r2").value = radAll; document.getElementById("r3").value = radAll; document.getElementById("r4").value = radAll; updatedCount++; }

    if (str.match(/orientation\s*x/i) || str.match(/axis\s*x/i)) { setOri('X'); updatedCount++; }
    else if (str.match(/orientation\s*y/i) || str.match(/axis\s*y/i)) { setOri('Y'); updatedCount++; }
    else if (str.match(/orientation\s*z/i) || str.match(/axis\s*z/i)) { setOri('Z'); updatedCount++; }

    if (updatedCount > 0) { draw(); log("✅ Parameters updated!", 'assistant'); autoSaveDialog(); }
    else { log("⚠️ Could not recognize parameters", 'assistant'); }
}

// ==================== VOICE RECOGNITION (MAIN) ====================
function initVoice() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { log("❌ Browser does not support Voice", 'system'); return null; }
    const r = new SR();
    r.lang = "vi-VN"; // Nhận diện tiếng Việt
    r.continuous = true; r.interimResults = true;
    r.onstart = () => {
        isListening = true;
        document.getElementById('voiceBtn').classList.add('listening');
        document.getElementById('chatStatus').textContent = '● Listening...';
        document.getElementById('chatStatus').classList.add('waiting');
        log("🎤 Đang nghe (Tiếng Việt)...", 'system');
        partialTranscript = ''; hasAutoTriggeredSave = false;
    };
    r.onend = () => {
        if (isListening) { try { r.start(); } catch(e) {} } 
        else { document.getElementById('voiceBtn').classList.remove('listening'); document.getElementById('chatStatus').textContent = '● Ready'; document.getElementById('chatStatus').classList.remove('waiting'); }
    };
    r.onerror = (e) => {
        if (e.error === 'not-allowed') { log("❌ Microphone access denied", 'system'); stopVoice(); } 
        else if (e.error !== 'no-speech') log(`⚠️ Error: ${e.error}`, 'system');
        if (isListening && e.error !== 'not-allowed') { try { setTimeout(() => { r.start(); }, 300); } catch(e) {} }
    };
    r.onresult = (e) => {
        if (silenceTimer) { clearTimeout(silenceTimer); silenceTimer = null; }
        let finalText = '', interimText = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
            const transcript = e.results[i][0].transcript.trim();
            if (e.results[i].isFinal) finalText += transcript + ' ';
            else interimText += transcript + ' ';
        }
        if (finalText) { partialTranscript += finalText; processFullVoiceNLP(partialTranscript.trim()); partialTranscript = ''; }
        else if (interimText) { document.getElementById('chatStatus').textContent = '● Speaking...'; partialTranscript = interimText.trim(); }
        silenceTimer = setTimeout(() => { if (isListening && partialTranscript) { processFullVoiceNLP(partialTranscript.trim()); partialTranscript = ''; } }, 2000);
    };
    return r;
}

function voice() {
    if (isListening) { stopVoice(); return; }
    if (!recognition) { recognition = initVoice(); if (!recognition) return; }
    try { recognition.start(); } catch(e) { try { recognition.stop(); setTimeout(() => { recognition.start(); }, 300); } catch(e2) {} }
}

function stopVoice() {
    isListening = false;
    if (silenceTimer) { clearTimeout(silenceTimer); silenceTimer = null; }
    if (recognition) { try { recognition.stop(); } catch(e) {} }
    document.getElementById('voiceBtn').classList.remove('listening');
    document.getElementById('chatStatus').textContent = '● Ready';
    document.getElementById('chatStatus').classList.remove('waiting');
    partialTranscript = '';
    log("🔇 Stopped listening", 'system');
}

// ==================== 3D & EXPORT FUNCTIONS ====================
function autoSaveDialog() {
    if (hasAutoTriggeredSave) return;
    let L = parseInputValue("dx"); let W = parseInputValue("dy"); let T = parseInputValue("dz");
    if (L > 0 && W > 0 && T > 0) {
        hasAutoTriggeredSave = true;
        const modal = document.getElementById('saveModal');
        if (modal) { modal.classList.add('active'); document.body.style.overflow = 'hidden'; document.getElementById('saveFileName').value = `Opening_${L}x${W}x${T}`; log("📁 Opening save dialog...", 'system'); }
    }
}

function closeSaveDialog() {
    const modal = document.getElementById('saveModal');
    if (modal) { modal.classList.remove('active'); document.body.style.overflow = ''; hasAutoTriggeredSave = false; }
}

function confirmSave() { 
    const fileName = document.getElementById('saveFileName').value.trim() || "Opening"; 
    generateAndDownloadFile(fileName); 
    closeSaveDialog(); 
}

// ==================== EXPORT .MAC FILE ====================
function saveFile() {
    const fileName = document.getElementById('saveFileName').value.trim() || "Opening";
    generateAndDownloadFile(fileName);
}

function generateAndDownloadFile(fileName) {
    let px = parseInputValue("px"); let py = parseInputValue("py"); let pz = parseInputValue("pz");
    let L = parseInputValue("dx"); let W = parseInputValue("dy"); let H = parseInputValue("dz");
    let r1 = parseInputValue("r1"); let r2 = parseInputValue("r2"); let r3 = parseInputValue("r3"); let r4 = parseInputValue("r4");

    let oriStr = "ORI Y is Y and Z is Z";
    if (ORI === "X") { oriStr = "ORI Y is -Z and Z is X"; } 
    else if (ORI === "Y") { oriStr = "ORI Y is -X and Z is Y"; } 
    else if (ORI === "Z") { oriStr = "ORI Y is Y and Z is Z"; }

    let data = `NEW EQUIPMENT
USRCOG ( X ( 0 ) Y ( 0 ) Z ( 0 ) )
USRWCO ( X ( 0 ) Y ( 0 ) Z ( 0 ) )
POS X ${px}mm Y ${py}mm Z ${pz}mm
${oriStr}
BUIL false
DSCO unset
PTSP unset
INSC unset

NEW EXTRUSION
${oriStr}
LEVE 0 2
HEIG ${H}mm

NEW LOOP

NEW VERTEX
FRAD ${r1}mm

END
NEW VERTEX
POS X 0mm Y ${W}mm Z 0mm
FRAD ${r2}mm

END
NEW VERTEX
POS X ${L}mm Y ${W}mm Z 0mm
FRAD ${r3}mm

END
NEW VERTEX
POS X ${L}mm Y 0mm Z 0mm
FRAD ${r4}mm

END
END
END
END`;

    let blob = new Blob([data], { type: "text/plain" });
    let a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `${fileName}.mac`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
    
    log(`💾 Exported ${fileName}.mac successfully!`, 'system');
    speak("File của bạn đã được xuất thành công"); // Đã đổi sang tiếng Việt
}

function setOri(o) { ORI = o; document.querySelectorAll(".ori-buttons button").forEach(b => b.classList.remove("active")); document.getElementById("o" + o.toLowerCase()).classList.add("active"); document.getElementById('oriBadge').textContent = o; draw(); }

function parseInputValue(id) {
    let raw = (document.getElementById(id).value || "").toString().trim();
    if (!raw) return 0;
    if (/^\d+[.,]\d{3}$/.test(raw)) raw = raw.replace(/[.,]/g, '');
    else raw = raw.replace(',', '.');
    return parseFloat(raw) || 0;
}

function draw() {
    c.width = c.offsetWidth; c.height = c.offsetHeight || 320;
    let L = parseInputValue("dx"); let W = parseInputValue("dy"); let T = parseInputValue("dz");
    let posX = parseInputValue("px"); let posY = parseInputValue("py"); let posZ = parseInputValue("pz");
    ctx.clearRect(0, 0, c.width, c.height);
    const grad = ctx.createLinearGradient(0, 0, c.width, c.height);
    grad.addColorStop(0, '#0a0e17'); grad.addColorStop(1, '#141b2b');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, c.width, c.height);
    drawAxis();
    if (L === 0 && W === 0 && T === 0) return;
    let maxDim = Math.max(L, W, T, 100); let scale = 90 / maxDim;
    let l = L * scale; let w = W * scale; let t = T * scale;
    let cx = c.width / 2 - 20 + (posX * scale); let cy = c.height / 2 + 30 - (posZ * scale);
    let vX, vY, vZ;
    if (ORI === "Z") { vX = l; vY = w; vZ = t; } 
    else if (ORI === "X") { vX = t; vY = w; vZ = l; } 
    else if (ORI === "Y") { vX = l; vY = t; vZ = w; }
    drawBox3D(cx, cy, vX, vY, vZ, `L=${L}`, `W=${W}`, `T=${T}`);
}

function drawAxis() {
    ctx.lineWidth = 2.5; ctx.font = "bold 13px Inter, sans-serif";
    let x0 = 50, y0 = 220;
    ctx.strokeStyle = "#ff6b6b"; ctx.fillStyle = "#ff6b6b"; ctx.shadowColor = "rgba(255,107,107,0.3)"; ctx.shadowBlur = 8;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 + 50, y0); ctx.stroke(); ctx.shadowBlur = 0; ctx.fillText("X", x0 + 55, y0 + 4);
    ctx.strokeStyle = "#74b9ff"; ctx.fillStyle = "#74b9ff"; ctx.shadowColor = "rgba(116,185,255,0.3)"; ctx.shadowBlur = 8;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 + 35, y0 - 35); ctx.stroke(); ctx.shadowBlur = 0; ctx.fillText("Y", x0 + 40, y0 - 38);
    ctx.strokeStyle = "#55efc4"; ctx.fillStyle = "#55efc4"; ctx.shadowColor = "rgba(85,239,196,0.3)"; ctx.shadowBlur = 8;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0, y0 - 50); ctx.stroke(); ctx.shadowBlur = 0; ctx.fillText("Z", x0 - 4, y0 - 55);
}

function projectISO(x, y, z, cx, cy) { let kY = 0.55; return { x: cx + x + y * kY, y: cy - z - y * kY }; }

function drawBox3D(cx, cy, d1, d2, d3, lbl1, lbl2, lbl3) {
    ctx.lineWidth = 1.8; let offsetX = cx - d1 / 2; let offsetY = cy + d3 / 2;
    let b0 = projectISO(0, 0, 0, offsetX, offsetY); let b1 = projectISO(d1, 0, 0, offsetX, offsetY); let b2 = projectISO(d1, d2, 0, offsetX, offsetY); let b3 = projectISO(0, d2, 0, offsetX, offsetY);
    let t0 = projectISO(0, 0, d3, offsetX, offsetY); let t1 = projectISO(d1, 0, d3, offsetX, offsetY); let t2 = projectISO(d1, d2, d3, offsetX, offsetY); let t3 = projectISO(0, d2, d3, offsetX, offsetY);
    ctx.shadowColor = "rgba(108,92,231,0.15)"; ctx.shadowBlur = 20;
    const mainColor = '#6c5ce7'; const lightColor = '#a29bfe';
    ctx.strokeStyle = mainColor; ctx.fillStyle = "rgba(108,92,231,0.08)";
    ctx.beginPath(); ctx.moveTo(b0.x, b0.y); ctx.lineTo(b1.x, b1.y); ctx.lineTo(b2.x, b2.y); ctx.lineTo(b3.x, b3.y); ctx.closePath(); ctx.fill(); ctx.stroke();
    let bEdges = [b0, b1, b2, b3]; let tEdges = [t0, t1, t2, t3];
    for (let i = 0; i < 4; i++) { ctx.shadowBlur = 12; ctx.strokeStyle = i === 0 || i === 3 ? mainColor : lightColor; ctx.globalAlpha = i === 0 || i === 3 ? 1 : 0.6; ctx.beginPath(); ctx.moveTo(bEdges[i].x, bEdges[i].y); ctx.lineTo(tEdges[i].x, tEdges[i].y); ctx.stroke(); ctx.globalAlpha = 1; }
    ctx.shadowBlur = 20; ctx.strokeStyle = lightColor; ctx.fillStyle = "rgba(162,155,254,0.06)";
    ctx.beginPath(); ctx.moveTo(t0.x, t0.y); ctx.lineTo(t1.x, t1.y); ctx.lineTo(t2.x, t2.y); ctx.lineTo(t3.x, t3.y); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.shadowBlur = 0; ctx.strokeStyle = "rgba(162,155,254,0.3)"; ctx.lineWidth = 0.5; ctx.beginPath(); ctx.moveTo(t0.x, t0.y); ctx.lineTo(t1.x, t1.y); ctx.stroke();
    ctx.shadowBlur = 0; ctx.fillStyle = "rgba(255,255,255,0.8)"; ctx.font = "bold 13px Inter, sans-serif";
    let c1 = projectISO(d1 / 2, 0, 0, offsetX, offsetY); let c2 = projectISO(d1, d2 / 2, d3, offsetX, offsetY); let c3 = projectISO(0, 0, d3 / 2, offsetX, offsetY);
    const drawLabel = (text, x, y) => {
        const metrics = ctx.measureText(text); const width = metrics.width + 16; const height = 26; const rx = x - width/2; const ry = y - height/2;
        ctx.fillStyle = "rgba(10,14,23,0.8)"; ctx.shadowColor = "rgba(0,0,0,0.5)"; ctx.shadowBlur = 10;
        ctx.beginPath(); const radius = 6; ctx.moveTo(rx + radius, ry); ctx.lineTo(rx + width - radius, ry); ctx.quadraticCurveTo(rx + width, ry, rx + width, ry + radius); ctx.lineTo(rx + width, ry + height - radius); ctx.quadraticCurveTo(rx + width, ry + height, rx + width - radius, ry + height); ctx.lineTo(rx + radius, ry + height); ctx.quadraticCurveTo(rx, ry + height, rx, ry + height - radius); ctx.lineTo(rx, ry + radius); ctx.quadraticCurveTo(rx, ry, rx + radius, ry); ctx.closePath(); ctx.fill();
        ctx.shadowBlur = 0; ctx.fillStyle = "rgba(255,255,255,0.9)"; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, x, y + 1);
    };
    drawLabel(lbl1, c1.x, c1.y + 18); drawLabel(lbl2, c2.x - 15, c2.y - 8); drawLabel(lbl3, c3.x - 55, c3.y + 4);
}

function log(t, type = 'user') {
    const chatBox = document.getElementById("chat"); if (!chatBox) return;
    const className = type === 'user' ? 'user' : type === 'assistant' ? 'assistant' : 'system';
    chatBox.innerHTML += `<div class="${className}">${t}</div>`; chatBox.scrollTop = chatBox.scrollHeight;
}

function speak(t) {
    window.speechSynthesis.cancel(); let u = new SpeechSynthesisUtterance(t);
    u.lang = "vi-VN"; // Đọc bằng tiếng Việt
    u.rate = 0.95; u.pitch = 1.05; u.volume = 1;
    isSpeaking = true; u.onend = () => { isSpeaking = false; }; window.speechSynthesis.speak(u);
}

function reset() {
    document.getElementById("px").value = 0; document.getElementById("py").value = 0; document.getElementById("pz").value = 0;
    document.getElementById("dx").value = 0; document.getElementById("dy").value = 0; document.getElementById("dz").value = 0;
    document.getElementById("r1").value = 150; document.getElementById("r2").value = 150; document.getElementById("r3").value = 150; document.getElementById("r4").value = 150;
    hasAutoTriggeredSave = false; setOri('Z'); log("↺ Reset all parameters", 'system');
}

function help() { const modal = document.getElementById('helpModal'); if (modal) { modal.classList.add('active'); document.body.style.overflow = 'hidden'; log("📖 Help opened", 'system'); } }
function closeHelp() { const modal = document.getElementById('helpModal'); if (modal) { modal.classList.remove('active'); document.body.style.overflow = ''; } }

// ==================== LIBRARY VOICE SEARCH (ĐÃ SỬA SANG TIẾNG VIỆT) ====================
function voiceSearchLibrary() {
    if (isLibraryVoiceListening) {
        stopLibraryVoice();
        return;
    }
    
    if (!libraryVoiceRecognition) {
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SR) {
            log("❌ Browser doesn't support Voice", 'system');
            alert("❌ Browser doesn't support Voice");
            return;
        }
        
        libraryVoiceRecognition = new SR();
        libraryVoiceRecognition.lang = "vi-VN"; // Đã sửa từ "en-US" thành "vi-VN" để nghe tiếng Việt
        libraryVoiceRecognition.continuous = false;
        libraryVoiceRecognition.interimResults = true;
        
        libraryVoiceRecognition.onstart = () => {
            isLibraryVoiceListening = true;
            document.getElementById('voiceSearchBtn').classList.add('listening');
            document.getElementById('voiceSearchBtn').innerHTML = '<span class="btn-icon">⏹</span> Dừng';
            log("🎤 Đang nghe tìm kiếm (Tiếng Việt)...", 'system');
        };
        
        libraryVoiceRecognition.onend = () => {
            stopLibraryVoice();
        };
        
        libraryVoiceRecognition.onerror = (e) => {
            if (e.error !== 'no-speech') {
                log(`⚠️ Error: ${e.error}`, 'system');
            }
            stopLibraryVoice();
        };
        
        libraryVoiceRecognition.onresult = (e) => {
            let transcript = '';
            for (let i = e.resultIndex; i < e.results.length; i++) {
                transcript += e.results[i][0].transcript;
                if (e.results[i].isFinal) {
                    document.getElementById('searchQuery').value = transcript;
                    
                    const results = performSmartSearch(transcript);
                    
                    if (results.length > 0) {
                        const bestMatch = results[0];
                        if (bestMatch.link) {
                            if (bestMatch.link.startsWith('http://') || bestMatch.link.startsWith('https://')) {
                                window.open(bestMatch.link, '_blank');
                            } else {
                                log(`📄 Info: ${bestMatch.link}`, 'system');
                            }
                            log(`🎤 Voice: Opened "${bestMatch.name}"`, 'assistant');
                            speak(`Đang mở ${bestMatch.name}`);
                        }
                        searchDocuments();
                    } else {
                        log(`🔍 Voice: "${transcript}" - Không tìm thấy kết quả nào`, 'user');
                        speak(`Không tìm thấy kết quả nào cho "${transcript}"`);
                        searchDocuments();
                    }
                    
                    stopLibraryVoice();
                }
            }
        };
    }
    
    try {
        libraryVoiceRecognition.start();
    } catch(e) {
        try { libraryVoiceRecognition.stop(); setTimeout(() => { libraryVoiceRecognition.start(); }, 300); } catch(e2) {}
    }
}

function stopLibraryVoice() {
    isLibraryVoiceListening = false;
    if (libraryVoiceRecognition) {
        try { libraryVoiceRecognition.stop(); } catch(e) {}
    }
    const btn = document.getElementById('voiceSearchBtn');
    if (btn) {
        btn.classList.remove('listening');
        btn.innerHTML = '<span class="btn-icon">🎤</span> Voice';
    }
}

function searchAndOpenDocument(name) {
    if (!name || name.trim().length < 2) return false;
    
    const results = performSmartSearch(name);
    
    if (results.length > 0) {
        const bestMatch = results[0];
        if (bestMatch.link) {
            if (bestMatch.link.startsWith('http://') || bestMatch.link.startsWith('https://')) {
                window.open(bestMatch.link, '_blank');
            } else {
                log(`📄 Info: ${bestMatch.link}`, 'system');
            }
            log(`📂 Voice: Opened "${bestMatch.name}"`, 'assistant');
            speak(`Đang mở ${bestMatch.name}`);
            return true;
        }
    }
    
    return false;
}

// ==================== EVENT LISTENERS ====================
document.addEventListener('DOMContentLoaded', function() {
    document.querySelectorAll('.modal-overlay').forEach(modal => {
        modal.addEventListener('click', function(e) { if (e.target === this) { if(this.id === 'helpModal') closeHelp(); if(this.id === 'saveModal') closeSaveDialog(); if(this.id === 'libraryModal') closeLibrary(); } });
    });
    syncWithGoogleSheets();
});

document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') { closeHelp(); closeSaveDialog(); closeLibrary(); closePasswordModal(); }
    if (e.key === 'Enter') {
        const passwordModal = document.getElementById('passwordModal');
        if (passwordModal) { e.preventDefault(); confirmDeleteWithPassword(); }
        
        const libraryModal = document.getElementById('libraryModal');
        if (libraryModal && libraryModal.classList.contains('active')) {
            const searchInput = document.getElementById('searchQuery');
            if (document.activeElement === searchInput) {
                searchDocuments();
            }
        }
    }
});

document.querySelectorAll("input").forEach(i => { i.addEventListener("input", () => { hasAutoTriggeredSave = false; draw(); }); });
window.addEventListener("resize", draw);

// ==================== STARTUP ====================
draw();
log("🚀 3D Opening Tool Pro ready", 'system');
log("💡 Nhấn nút Voice và nói (VD: dài 2000, rộng 1500, dày 300)", 'system');
log("📚 Nhấn Library để quản lý tài liệu Drive", 'system');
log("✅ Apps Script URL: " + GOOGLE_SHEETS_DATA_URL, 'system');
