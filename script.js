const c = document.getElementById("view");
const ctx = c.getContext("2d");

let ORI = "Z";
let isListening = false;
let recognition = null;
let silenceTimer = null;
let partialTranscript = '';
let isSpeaking = false;
let hasAutoTriggeredSave = false;

// ==================== GOOGLE FORM CONFIGURATION ====================
// Đã cập nhật với URL Google Apps Script của bạn
const GOOGLE_FORM_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSeSFgm7YG7YBJW59gwL7_UgT7II2fqhiaRF-G0HQ2hwrg-DUw/formResponse';
const GOOGLE_SHEETS_DATA_URL = 'https://script.google.com/macros/s/AKfycbzCgMn2i3GE0lj8lklk3r11PAfKBpG1_kq2LdGavt-ug7Zb8hLK0yBizemJHng4en5y/exec';



let isSyncing = false;
let library = [];
let deleteTargetIndex = null;

// ==================== SYNC FUNCTIONS ====================
async function syncWithGoogleSheets() {
    if (isSyncing) return;
    isSyncing = true;
    updateSyncStatus('syncing', 'Loading data...');
    
    try {
        const url = `${GOOGLE_SHEETS_DATA_URL}?action=get&t=${Date.now()}`;
        
        const response = await fetch(url, {
            method: 'GET',
            mode: 'cors',
            cache: 'no-cache',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        
        if (result.success && result.data) {
            library = result.data.map(item => ({
                name: item.Name || item.name || 'Untitled',
                link: item.Link || item.link || '',
                tags: item.Tags ? item.Tags.split(',').map(t => t.trim()).filter(t => t) : []
            }));
            renderLibrary();
            updateSyncStatus('success', `Loaded ${library.length} documents`);
            log(`✅ Loaded ${library.length} documents from Google Sheets`, 'system');
        } else {
            throw new Error('Invalid data format');
        }
    } catch (error) {
        console.error('Sync error:', error);
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
    } finally {
        isSyncing = false;
    }
}

// ==================== GOOGLE FORM - ADD DOCUMENT ====================
async function addDocumentToGoogleSheets(doc) {
    try {
        const formData = new FormData();
        
        // Entry ID từ form của bạn
        formData.append('entry.602500005', doc.name);     // Document Name
        formData.append('entry.970179045', doc.link);     // Drive Link
        formData.append('entry.2136251389', doc.tags ? doc.tags.join(', ') : ''); // Tags
        
        const response = await fetch(GOOGLE_FORM_URL, {
            method: 'POST',
            mode: 'no-cors',
            cache: 'no-cache',
            body: formData
        });
        
        log(`📤 Document submitted to Google Form: ${doc.name}`, 'system');
        return true;
        
    } catch (error) {
        console.error('Add document via Form error:', error);
        throw error;
    }
}

// ==================== GOOGLE FORM - DELETE DOCUMENT ====================
async function deleteDocumentFromGoogleSheets(index) {
    try {
        const formData = new FormData();
        formData.append('action', 'delete');
        formData.append('index', index);
        
        const response = await fetch(GOOGLE_SHEETS_DATA_URL, {
            method: 'POST',
            mode: 'cors',
            cache: 'no-cache',
            body: formData
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        return result.success;
    } catch (error) {
        console.error('Delete document error:', error);
        throw error;
    }
}

function updateSyncStatus(status, text) {
    const icon = document.getElementById('syncIcon');
    const textEl = document.getElementById('syncText');
    const statusEl = document.getElementById('syncStatus');
    
    if (!icon || !textEl || !statusEl) return;
    
    switch(status) {
        case 'syncing':
            icon.textContent = '🔄';
            textEl.textContent = text;
            statusEl.style.borderColor = 'rgba(0,210,255,0.3)';
            statusEl.style.background = 'rgba(0,210,255,0.05)';
            break;
        case 'success':
            icon.textContent = '✅';
            textEl.textContent = text;
            statusEl.style.borderColor = 'rgba(0,255,0,0.3)';
            statusEl.style.background = 'rgba(0,255,0,0.05)';
            break;
        case 'error':
            icon.textContent = '❌';
            textEl.textContent = text;
            statusEl.style.borderColor = 'rgba(255,0,0,0.3)';
            statusEl.style.background = 'rgba(255,0,0,0.05)';
            break;
        default:
            icon.textContent = '✅';
            textEl.textContent = text || 'Ready';
            statusEl.style.borderColor = 'rgba(0,210,255,0.1)';
            statusEl.style.background = 'rgba(0,210,255,0.05)';
    }
}

// ==================== VOICE RECOGNITION ====================
function initVoice() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
        log("❌ Browser does not support Voice", 'system');
        return null;
    }

    const r = new SR();
    r.lang = "vi-VN";
    r.continuous = true;
    r.interimResults = true;
    r.maxAlternatives = 1;

    r.onstart = () => {
        isListening = true;
        document.getElementById('voiceBtn').classList.add('listening');
        document.getElementById('chatStatus').textContent = '● Listening...';
        document.getElementById('chatStatus').classList.add('waiting');
        log("🎤 Listening...", 'system');
        partialTranscript = '';
        hasAutoTriggeredSave = false;
    };

    r.onend = () => {
        if (isListening) {
            try { r.start(); } catch(e) {}
        } else {
            document.getElementById('voiceBtn').classList.remove('listening');
            document.getElementById('chatStatus').textContent = '● Ready';
            document.getElementById('chatStatus').classList.remove('waiting');
        }
    };

    r.onerror = (e) => {
        if (e.error === 'not-allowed') {
            log("❌ Microphone access denied", 'system');
            stopVoice();
        } else if (e.error !== 'no-speech') {
            log(`⚠️ Error: ${e.error}`, 'system');
        }
        if (isListening && e.error !== 'not-allowed') {
            try { setTimeout(() => { r.start(); }, 300); } catch(e) {}
        }
    };

    r.onresult = (e) => {
        if (silenceTimer) { clearTimeout(silenceTimer); silenceTimer = null; }

        let finalText = '';
        let interimText = '';

        for (let i = e.resultIndex; i < e.results.length; i++) {
            const transcript = e.results[i][0].transcript.trim();
            if (e.results[i].isFinal) {
                finalText += transcript + ' ';
            } else {
                interimText += transcript + ' ';
            }
        }

        if (finalText) {
            partialTranscript += finalText;
            processFullVoiceNLP(partialTranscript.trim());
            partialTranscript = '';
            silenceTimer = setTimeout(() => {
                if (isListening && partialTranscript) {
                    processFullVoiceNLP(partialTranscript.trim());
                    partialTranscript = '';
                }
            }, 2000);
        } else if (interimText) {
            document.getElementById('chatStatus').textContent = '● Speaking...';
            partialTranscript = interimText.trim();
        }

        silenceTimer = setTimeout(() => {
            if (isListening && partialTranscript) {
                processFullVoiceNLP(partialTranscript.trim());
                partialTranscript = '';
            }
        }, 2000);
    };
    return r;
}

function voice() {
    if (isListening) { stopVoice(); return; }
    if (!recognition) { recognition = initVoice(); if (!recognition) return; }
    try {
        recognition.start();
        log("🎤 Voice activated - Speak clearly!", 'system');
    } catch(e) {
        try { recognition.stop(); setTimeout(() => { recognition.start(); }, 300); } catch(e2) { log("⚠️ Error starting voice", 'system'); }
    }
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

function setOri(o) {
    ORI = o;
    document.querySelectorAll(".ori-buttons button").forEach(b => b.classList.remove("active"));
    document.getElementById("o" + o.toLowerCase()).classList.add("active");
    document.getElementById('oriBadge').textContent = o;
    draw(); 
}

function parseInputValue(id) {
    let raw = (document.getElementById(id).value || "").toString().trim();
    if (!raw) return 0;
    if (/^\d+[.,]\d{3}$/.test(raw)) {
        raw = raw.replace(/[.,]/g, '');
    } else {
        raw = raw.replace(',', '.');
    }
    return parseFloat(raw) || 0;
}

// ==================== 3D RENDERING ====================
function draw() {
    c.width = c.offsetWidth;
    c.height = c.offsetHeight || 320;

    let L = parseInputValue("dx");
    let W = parseInputValue("dy");
    let T = parseInputValue("dz"); 

    let posX = parseInputValue("px");
    let posY = parseInputValue("py");
    let posZ = parseInputValue("pz");

    ctx.clearRect(0, 0, c.width, c.height);

    const grad = ctx.createLinearGradient(0, 0, c.width, c.height);
    grad.addColorStop(0, '#0a0e17');
    grad.addColorStop(1, '#141b2b');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, c.width, c.height);

    drawAxis();

    if (L === 0 && W === 0 && T === 0) return;

    let maxDim = Math.max(L, W, T, 100);
    let scale = 90 / maxDim;

    let l = L * scale;
    let w = W * scale;
    let t = T * scale; 

    let cx = c.width / 2 - 20 + (posX * scale);
    let cy = c.height / 2 + 30 - (posZ * scale);

    let vX, vY, vZ;
    if (ORI === "Z") {
        vX = l; vY = w; vZ = t; 
    } else if (ORI === "X") {
        vX = t; vY = w; vZ = l; 
    } else if (ORI === "Y") {
        vX = l; vY = t; vZ = w; 
    }

    drawBox3D(cx, cy, vX, vY, vZ, `L=${L}`, `W=${W}`, `T=${T}`);
}

function drawAxis() {
    ctx.lineWidth = 2.5;
    ctx.font = "bold 13px Inter, sans-serif";

    let x0 = 50, y0 = 220;

    ctx.strokeStyle = "#ff6b6b"; ctx.fillStyle = "#ff6b6b";
    ctx.shadowColor = "rgba(255,107,107,0.3)"; ctx.shadowBlur = 8;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 + 50, y0); ctx.stroke();
    ctx.shadowBlur = 0; ctx.fillText("X", x0 + 55, y0 + 4);

    ctx.strokeStyle = "#74b9ff"; ctx.fillStyle = "#74b9ff";
    ctx.shadowColor = "rgba(116,185,255,0.3)"; ctx.shadowBlur = 8;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 + 35, y0 - 35); ctx.stroke();
    ctx.shadowBlur = 0; ctx.fillText("Y", x0 + 40, y0 - 38);

    ctx.strokeStyle = "#55efc4"; ctx.fillStyle = "#55efc4";
    ctx.shadowColor = "rgba(85,239,196,0.3)"; ctx.shadowBlur = 8;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0, y0 - 50); ctx.stroke();
    ctx.shadowBlur = 0; ctx.fillText("Z", x0 - 4, y0 - 55);
}

function projectISO(x, y, z, cx, cy) {
    let kY = 0.55;
    return { x: cx + x + y * kY, y: cy - z - y * kY };
}

function drawBox3D(cx, cy, d1, d2, d3, lbl1, lbl2, lbl3) {
    ctx.lineWidth = 1.8;
    let offsetX = cx - d1 / 2;
    let offsetY = cy + d3 / 2;

    let b0 = projectISO(0, 0, 0, offsetX, offsetY);
    let b1 = projectISO(d1, 0, 0, offsetX, offsetY);
    let b2 = projectISO(d1, d2, 0, offsetX, offsetY);
    let b3 = projectISO(0, d2, 0, offsetX, offsetY);

    let t0 = projectISO(0, 0, d3, offsetX, offsetY);
    let t1 = projectISO(d1, 0, d3, offsetX, offsetY);
    let t2 = projectISO(d1, d2, d3, offsetX, offsetY);
    let t3 = projectISO(0, d2, d3, offsetX, offsetY);

    ctx.shadowColor = "rgba(108,92,231,0.15)"; ctx.shadowBlur = 20;

    const mainColor = '#6c5ce7'; const lightColor = '#a29bfe';

    ctx.strokeStyle = mainColor; ctx.fillStyle = "rgba(108,92,231,0.08)";
    ctx.beginPath();
    ctx.moveTo(b0.x, b0.y); ctx.lineTo(b1.x, b1.y); ctx.lineTo(b2.x, b2.y); ctx.lineTo(b3.x, b3.y);
    ctx.closePath(); ctx.fill(); ctx.stroke();

    let bEdges = [b0, b1, b2, b3]; let tEdges = [t0, t1, t2, t3];
    for (let i = 0; i < 4; i++) {
        ctx.shadowBlur = 12; ctx.strokeStyle = i === 0 || i === 3 ? mainColor : lightColor;
        ctx.globalAlpha = i === 0 || i === 3 ? 1 : 0.6;
        ctx.beginPath(); ctx.moveTo(bEdges[i].x, bEdges[i].y); ctx.lineTo(tEdges[i].x, tEdges[i].y); ctx.stroke();
        ctx.globalAlpha = 1;
    }

    ctx.shadowBlur = 20; ctx.strokeStyle = lightColor; ctx.fillStyle = "rgba(162,155,254,0.06)";
    ctx.beginPath();
    ctx.moveTo(t0.x, t0.y); ctx.lineTo(t1.x, t1.y); ctx.lineTo(t2.x, t2.y); ctx.lineTo(t3.x, t3.y);
    ctx.closePath(); ctx.fill(); ctx.stroke();

    ctx.shadowBlur = 0; ctx.strokeStyle = "rgba(162,155,254,0.3)"; ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.moveTo(t0.x, t0.y); ctx.lineTo(t1.x, t1.y); ctx.stroke();

    ctx.shadowBlur = 0; ctx.fillStyle = "rgba(255,255,255,0.8)"; ctx.font = "bold 13px Inter, sans-serif";

    let c1 = projectISO(d1 / 2, 0, 0, offsetX, offsetY);
    let c2 = projectISO(d1, d2 / 2, d3, offsetX, offsetY);
    let c3 = projectISO(0, 0, d3 / 2, offsetX, offsetY);

    const drawLabel = (text, x, y, align = 'center') => {
        const metrics = ctx.measureText(text);
        const width = metrics.width + 16; const height = 26;
        const rx = x - width/2; const ry = y - height/2;
        ctx.fillStyle = "rgba(10,14,23,0.8)";
        ctx.shadowColor = "rgba(0,0,0,0.5)"; ctx.shadowBlur = 10;
        ctx.beginPath();
        const radius = 6;
        ctx.moveTo(rx + radius, ry); ctx.lineTo(rx + width - radius, ry);
        ctx.quadraticCurveTo(rx + width, ry, rx + width, ry + radius);
        ctx.lineTo(rx + width, ry + height - radius);
        ctx.quadraticCurveTo(rx + width, ry + height, rx + width - radius, ry + height);
        ctx.lineTo(rx + radius, ry + height);
        ctx.quadraticCurveTo(rx, ry + height, rx, ry + height - radius);
        ctx.lineTo(rx, ry + radius);
        ctx.quadraticCurveTo(rx, ry, rx + radius, ry);
        ctx.closePath(); ctx.fill();
        ctx.shadowBlur = 0; ctx.fillStyle = "rgba(255,255,255,0.9)";
        ctx.textAlign = align; ctx.textBaseline = 'middle';
        ctx.fillText(text, x, y + 1);
    };

    drawLabel(lbl1, c1.x, c1.y + 18);
    drawLabel(lbl2, c2.x - 15, c2.y - 8);
    drawLabel(lbl3, c3.x - 55, c3.y + 4);
}

function log(t, type = 'user') {
    const chatBox = document.getElementById("chat");
    if (!chatBox) return;
    const className = type === 'user' ? 'user' : type === 'assistant' ? 'assistant' : 'system';
    chatBox.innerHTML += `<div class="${className}">${t}</div>`;
    chatBox.scrollTop = chatBox.scrollHeight;
}

function speak(t) {
    window.speechSynthesis.cancel();
    let u = new SpeechSynthesisUtterance(t);
    u.lang = "vi-VN"; u.rate = 0.95; u.pitch = 1.05; u.volume = 1;
    isSpeaking = true;
    u.onend = () => { isSpeaking = false; };
    window.speechSynthesis.speak(u);
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

    // Check for search command
    if (str.match(/search\s+(?:for\s+)?(.+)/i)) {
        let searchQuery = str.replace(/search\s+(?:for\s+)?/i, '').trim();
        if (searchQuery && searchQuery.length > 1) {
            document.getElementById('searchQuery').value = searchQuery;
            const results = performSmartSearch(searchQuery);
            if (results.length > 0) {
                const bestMatch = results[0];
                if (bestMatch.link) {
                    if (bestMatch.link.startsWith('http://') || bestMatch.link.startsWith('https://')) {
                        window.open(bestMatch.link, '_blank');
                    }
                    log(`🎤 Voice: Opened "${bestMatch.name}"`, 'assistant');
                    speak(`Opening ${bestMatch.name}`);
                }
                searchDocuments();
            } else {
                speak(`No results found for "${searchQuery}"`);
                searchDocuments();
            }
            const modal = document.getElementById('libraryModal');
            if (!modal.classList.contains('active')) {
                openLibrary();
            }
            updatedCount++;
        }
        return;
    }

    // Check for open document command
    if (str.match(/open\s+(?:document|file|doc)\s+(.+)/i)) {
        let docName = str.replace(/open\s+(?:document|file|doc)\s+/i, '').trim();
        if (docName && docName.length > 1) {
            if (searchAndOpenDocument(docName)) {
                updatedCount++;
            } else {
                speak(`Document "${docName}" not found in library`);
                log(`❌ Document not found: ${docName}`, 'assistant');
            }
        }
        return;
    }

    if (str.match(/save\s*(?:file|document)?/i) || str.match(/export\s*file/i)) {
        autoSaveDialog();
        log("💾 Opening save dialog", 'assistant');
        speak("Opening save dialog");
        return;
    }

    if (str.match(/find|search|look for/i) && !str.match(/save|open|export/i)) {
        let searchQuery = str.replace(/find|search|look for/gi, '').trim();
        searchQuery = searchQuery.replace(/(for|me|please)/gi, '').trim();
        
        if (searchQuery && searchQuery.length > 1) {
            document.getElementById('searchQuery').value = searchQuery;
            const results = performSmartSearch(searchQuery);
            if (results.length > 0) {
                const bestMatch = results[0];
                if (bestMatch.link) {
                    if (bestMatch.link.startsWith('http://') || bestMatch.link.startsWith('https://')) {
                        window.open(bestMatch.link, '_blank');
                    }
                    log(`🎤 Voice: Opened "${bestMatch.name}"`, 'assistant');
                    speak(`Opened ${bestMatch.name}`);
                }
                searchDocuments();
            } else {
                speak(`No results found for "${searchQuery}"`);
                searchDocuments();
            }
            const modal = document.getElementById('libraryModal');
            if (!modal.classList.contains('active')) {
                openLibrary();
            }
            updatedCount++;
        } else {
            speak("Please say what you want to search");
            log("🗣️ Please say what you want to search", 'assistant');
        }
        return;
    }

    let len = findVal(["length"]);
    let wid = findVal(["width"]);
    let hei = findVal(["thickness", "height"]);

    if (len === null) len = findVal(["dài"]);
    if (wid === null) wid = findVal(["rộng"]);
    if (hei === null) hei = findVal(["dày", "cao"]);

    if (len !== null) { document.getElementById("dx").value = len; updatedCount++; }
    if (wid !== null) { document.getElementById("dy").value = wid; updatedCount++; }
    if (hei !== null) { document.getElementById("dz").value = hei; updatedCount++; }

    let posX = findVal(["position x", "pos x", "x position"]);
    let posY = findVal(["position y", "pos y", "y position"]);
    let posZ = findVal(["position z", "pos z", "z position"]);

    const getCoord = (axis) => {
        let regex = new RegExp(`(?:^|\\s|,)${axis}\\s*(-?\\d+(?:[.,]\\d+)?)`, "i");
        let match = str.match(regex);
        return match ? cleanNumberString(match[1]) : null;
    };
    
    if(posX === null && str.includes('x')) posX = getCoord('x');
    if(posY === null && str.includes('y')) posY = getCoord('y');
    if(posZ === null && str.includes('z')) posZ = getCoord('z');

    if (posX !== null) { document.getElementById("px").value = posX; updatedCount++; }
    if (posY !== null) { document.getElementById("py").value = posY; updatedCount++; }
    if (posZ !== null) { document.getElementById("pz").value = posZ; updatedCount++; }

    let radAll = findVal(["corner radius", "radius"]);
    if (radAll !== null) {
        document.getElementById("r1").value = radAll;
        document.getElementById("r2").value = radAll;
        document.getElementById("r3").value = radAll;
        document.getElementById("r4").value = radAll;
        updatedCount++;
    }

    if (str.match(/orientation\s*x/i) || str.match(/axis\s*x/i)) { setOri('X'); updatedCount++; }
    else if (str.match(/orientation\s*y/i) || str.match(/axis\s*y/i)) { setOri('Y'); updatedCount++; }
    else if (str.match(/orientation\s*z/i) || str.match(/axis\s*z/i)) { setOri('Z'); updatedCount++; }

    if (updatedCount > 0) {
        draw();
        const msg = "✅ Parameters updated successfully!";
        log("🤖 " + msg, 'assistant');
        speak(msg);
        autoSaveDialog();
    } else {
        let rawNums = str.match(/\d+([.,]\d+)?/g);
        if (rawNums && rawNums.length >= 3) {
            document.getElementById("dx").value = cleanNumberString(rawNums[0]);
            document.getElementById("dy").value = cleanNumberString(rawNums[1]);
            document.getElementById("dz").value = cleanNumberString(rawNums[2]);
            updatedCount = 3;
            draw();
            log("🤖 Detected numbers in order (Length, Width, Thickness)", 'assistant');
            autoSaveDialog();
        } else {
            if (str.length > 3) {
                const searchResults = performSmartSearch(str);
                if (searchResults.length > 0) {
                    log(`🔍 Found ${searchResults.length} documents related to "${str}"`, 'system');
                    speak(`Found ${searchResults.length} related documents`);
                    const modal = document.getElementById('libraryModal');
                    if (!modal.classList.contains('active')) {
                        openLibrary();
                    }
                    document.getElementById('searchQuery').value = str;
                    searchDocuments();
                    return;
                }
            }
            const msg = "⚠️ Could not recognize parameters, please speak clearly!";
            log("🤖 " + msg, 'assistant');
            speak(msg);
        }
    }
}

// ==================== AUTO SAVE ====================
function autoSaveDialog() {
    if (hasAutoTriggeredSave) return;

    let L = parseInputValue("dx");
    let W = parseInputValue("dy");
    let T = parseInputValue("dz");

    if (L > 0 && W > 0 && T > 0) {
        hasAutoTriggeredSave = true;
        const modal = document.getElementById('saveModal');
        if (modal) {
            modal.classList.add('active');
            document.body.style.overflow = 'hidden';
            document.getElementById('saveFileName').value = `Opening_${L}x${W}x${T}`;
            log("📁 All dimensions entered, opening save dialog...", 'system');
        }
    }
}

function closeSaveDialog() {
    const modal = document.getElementById('saveModal');
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
        hasAutoTriggeredSave = false;
    }
}

function confirmSave() {
    const fileName = document.getElementById('saveFileName').value.trim() || "Opening";
    generateAndDownloadFile(fileName);
    closeSaveDialog();
}

// ==================== SAVE LOGIC ====================
function saveFile() {
    const fileName = document.getElementById('saveFileName').value.trim() || "Opening";
    generateAndDownloadFile(fileName);
}

function generateAndDownloadFile(fileName) {
    let px = parseInputValue("px");
    let py = parseInputValue("py");
    let pz = parseInputValue("pz");

    let L = parseInputValue("dx");
    let W = parseInputValue("dy");
    let H = parseInputValue("dz");

    let r1 = parseInputValue("r1"); let r2 = parseInputValue("r2");
    let r3 = parseInputValue("r3"); let r4 = parseInputValue("r4");

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
    let a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${fileName}.mac`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
    
    log(`💾 Exported ${fileName}.mac successfully!`, 'system');
    speak("Your file has been exported successfully");
}

function reset() {
    document.getElementById("px").value = 0;
    document.getElementById("py").value = 0;
    document.getElementById("pz").value = 0;
    document.getElementById("dx").value = 0;
    document.getElementById("dy").value = 0;
    document.getElementById("dz").value = 0;
    document.getElementById("r1").value = 150;
    document.getElementById("r2").value = 150;
    document.getElementById("r3").value = 150;
    document.getElementById("r4").value = 150;
    hasAutoTriggeredSave = false;
    setOri('Z');
    log("↺ Reset all parameters", 'system');
    speak("Reset to default");
}

// ==================== HELP ====================
function help() {
    const modal = document.getElementById('helpModal');
    if (modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
        log("📖 Help opened", 'system');
    }
}

function closeHelp() {
    const modal = document.getElementById('helpModal');
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
}

// ==================== LIBRARY FUNCTIONS ====================
let isLibraryVoiceListening = false;
let libraryVoiceRecognition = null;

function renderLibrary(filteredList = null) {
    const list = document.getElementById('libraryList');
    if (!list) return;
    
    const docs = filteredList || library;
    
    if (docs.length === 0) {
        list.innerHTML = `<div style="text-align: center; color: rgba(255,255,255,0.4); padding: 30px 0;">📭 No documents found</div>`;
        return;
    }
    
    list.innerHTML = docs.map((doc, index) => {
        const originalIndex = library.indexOf(doc);
        const tagsHtml = doc.tags && doc.tags.length > 0 
            ? `<div style="display: flex; gap: 4px; flex-wrap: wrap; margin-top: 4px;">
                ${doc.tags.map(tag => `<span style="background: rgba(108,92,231,0.2); color: #a29bfe; padding: 2px 8px; border-radius: 4px; font-size: 10px;">#${tag}</span>`).join('')}
               </div>`
            : '';
        
        return `
        <div class="library-item" style="display: flex; align-items: center; gap: 12px; padding: 10px 14px; background: rgba(255,255,255,0.03); border-radius: 10px; margin-bottom: 8px; border: 1px solid rgba(255,255,255,0.05); transition: all 0.2s;">
            <span style="font-size: 20px;">📄</span>
            <div style="flex: 1; min-width: 0;">
                <div style="font-weight: 600; color: #fff; font-size: 14px;">${doc.name}</div>
                ${tagsHtml}
            </div>
            <button onclick="openDocument(${originalIndex})" class="btn btn-primary" style="flex: none; padding: 0 16px; height: 32px; font-size: 11px;">📂 Open</button>
            <button onclick="showDeletePassword(${originalIndex})" class="btn btn-reset" style="flex: none; padding: 0 12px; height: 32px; font-size: 11px; background: rgba(255,0,0,0.2);">✕</button>
        </div>
    `}).join('');
}

// ==================== ADD DOCUMENT VIA GOOGLE FORM ====================
async function addDocument() {
    const nameInput = document.getElementById('newDocName');
    const linkInput = document.getElementById('newDocLink');
    const tagsInput = document.getElementById('newDocTags');
    
    if (!nameInput || !linkInput || !tagsInput) {
        alert('⚠️ Error: Input fields not found');
        return;
    }
    
    const name = nameInput.value.trim();
    const link = linkInput.value.trim();
    const tags = tagsInput.value.trim().split(',').map(t => t.trim()).filter(t => t);
    
    if (!name) {
        alert('⚠️ Please enter document name');
        nameInput.focus();
        return;
    }
    if (!link) {
        alert('⚠️ Please enter Drive link or description');
        linkInput.focus();
        return;
    }
    
    const exists = library.some(doc => doc.name.toLowerCase() === name.toLowerCase());
    if (exists) {
        alert(`⚠️ Document "${name}" already exists in library`);
        nameInput.focus();
        nameInput.select();
        return;
    }
    
    const newDoc = { name, link, tags };
    
    try {
        // Gửi document qua Google Form
        const success = await addDocumentToGoogleSheets(newDoc);
        
        if (success) {
            // Thêm tạm vào library để hiển thị ngay
            library.push(newDoc);
            renderLibrary();
            
            nameInput.value = '';
            linkInput.value = '';
            tagsInput.value = '';
            
            log(`📤 Document submitted via Google Form: ${name}`, 'system');
            alert(`✅ Document "${name}" has been submitted to Google Form!\n\nPlease check your Google Sheets to confirm the entry.`);
            nameInput.focus();
            
            updateSyncStatus('success', `Submitted: ${name}`);
            setTimeout(() => {
                updateSyncStatus('idle', `Loaded ${library.length} documents`);
            }, 2000);
            
            // Tự động refresh dữ liệu sau 3 giây
            setTimeout(() => {
                syncWithGoogleSheets();
            }, 3000);
        } else {
            throw new Error('Failed to submit document to Google Form');
        }
    } catch (error) {
        console.error('Add document error:', error);
        alert('❌ Failed to submit document. Please check:\n1. Google Form URL is correct\n2. Entry IDs are correct\n3. Internet connection');
        log('⚠️ Failed to submit document via Google Form', 'system');
    }
}

// ==================== DELETE DOCUMENT WITH PASSWORD (SECURE) ====================
const DELETE_PASSWORD = 'admin123';

function showDeletePassword(index) {
    deleteTargetIndex = index;
    const doc = library[index];
    
    if (!doc) {
        alert('⚠️ Document not found');
        return;
    }
    
    const passwordModal = document.createElement('div');
    passwordModal.id = 'passwordModal';
    passwordModal.style.cssText = `
        position: fixed;
        inset: 0;
        background: rgba(0,0,0,0.85);
        backdrop-filter: blur(10px);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 2000;
        animation: fadeIn 0.3s ease;
    `;
    passwordModal.innerHTML = `
        <div style="background: rgba(20,27,43,0.98); border-radius: 20px; border: 1px solid rgba(255,255,255,0.08); max-width: 400px; width: 90%; padding: 30px; box-shadow: 0 30px 60px rgba(0,0,0,0.8);">
            <div style="text-align: center; margin-bottom: 20px;">
                <span style="font-size: 40px;">🔒</span>
                <h3 style="color: #fff; margin: 10px 0 5px 0; font-weight: 700;">Confirm Deletion</h3>
                <p style="color: rgba(255,255,255,0.6); font-size: 13px;">You are deleting: <strong style="color: #ff7675;">"${doc.name}"</strong></p>
                <p style="color: rgba(255,255,255,0.4); font-size: 12px; margin-top: 5px;">Enter password to confirm</p>
            </div>
            <input id="deletePasswordInput" type="password" placeholder="Enter password..." 
                   style="width: 100%; height: 44px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; color: #fff; font-size: 15px; padding: 0 14px; outline: none; font-family: 'Inter', sans-serif; margin-bottom: 15px;">
            <div style="display: flex; gap: 10px;">
                <button onclick="closePasswordModal()" style="flex: 1; height: 40px; border: none; border-radius: 10px; background: rgba(255,255,255,0.1); color: #fff; font-weight: 600; cursor: pointer;">Cancel</button>
                <button onclick="confirmDeleteWithPassword()" style="flex: 1; height: 40px; border: none; border-radius: 10px; background: linear-gradient(135deg, #d63031, #ff7675); color: #fff; font-weight: 600; cursor: pointer;">Confirm Delete</button>
            </div>
            <div id="passwordError" style="color: #ff7675; font-size: 12px; margin-top: 10px; text-align: center; display: none;">❌ Incorrect password!</div>
        </div>
    `;
    document.body.appendChild(passwordModal);
    
    setTimeout(() => {
        const input = document.getElementById('deletePasswordInput');
        if (input) input.focus();
    }, 200);
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
    
    if (password === DELETE_PASSWORD) {
        if (deleteTargetIndex !== null && deleteTargetIndex < library.length) {
            const doc = library[deleteTargetIndex];
            
            try {
                const success = await deleteDocumentFromGoogleSheets(deleteTargetIndex);
                
                if (success) {
                    library.splice(deleteTargetIndex, 1);
                    renderLibrary();
                    log(`🗑️ Deleted: ${doc.name}`, 'system');
                    alert(`✅ Document "${doc.name}" deleted successfully!`);
                    closePasswordModal();
                    
                    updateSyncStatus('success', `Deleted: ${doc.name}`);
                    setTimeout(() => {
                        updateSyncStatus('idle', `Loaded ${library.length} documents`);
                    }, 2000);
                } else {
                    throw new Error('Failed to delete from Google Sheets');
                }
            } catch (error) {
                console.error('Delete error:', error);
                alert('❌ Failed to delete document from cloud. Please check your connection.');
                log('⚠️ Failed to delete document from Google Sheets', 'system');
                closePasswordModal();
            }
        } else {
            alert('⚠️ Error: Document not found');
            closePasswordModal();
        }
    } else {
        if (errorDiv) {
            errorDiv.style.display = 'block';
            errorDiv.textContent = '❌ Incorrect password! Please try again.';
        }
        if (passwordInput) {
            passwordInput.value = '';
            passwordInput.focus();
            passwordInput.style.borderColor = '#ff7675';
            setTimeout(() => {
                if (passwordInput) {
                    passwordInput.style.borderColor = 'rgba(255,255,255,0.1)';
                }
            }, 2000);
        }
        log(`❌ Delete failed: Incorrect password`, 'system');
    }
}

// ==================== OTHER LIBRARY FUNCTIONS ====================
function openDocument(index) {
    const doc = library[index];
    if (doc && doc.link) {
        if (doc.link.startsWith('http://') || doc.link.startsWith('https://')) {
            window.open(doc.link, '_blank');
        } else {
            log(`📄 Info: ${doc.link}`, 'system');
            speak(`Found information about ${doc.name}`);
        }
        log(`📂 Opening: ${doc.name}`, 'system');
    } else {
        alert('⚠️ Document not found or invalid link');
    }
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
        stopLibraryVoice();
        closePasswordModal();
    }
}

// ==================== SMART SEARCH ====================
function searchDocuments() {
    const query = document.getElementById('searchQuery').value.trim();
    if (!query) {
        renderLibrary();
        document.getElementById('searchResults').style.display = 'none';
        return;
    }
    
    const results = performSmartSearch(query);
    const resultsDiv = document.getElementById('searchResults');
    
    if (results.length === 0) {
        resultsDiv.style.display = 'block';
        resultsDiv.innerHTML = `<div style="text-align: center; color: rgba(255,255,255,0.5); padding: 15px 0;">
            🔍 No documents found for "${query}"
            <br><span style="font-size: 12px;">Try different keywords or add new documents</span>
        </div>`;
        renderLibrary();
        return;
    }
    
    resultsDiv.style.display = 'block';
    resultsDiv.innerHTML = `<div style="color: rgba(255,255,255,0.6); font-size: 12px; margin-bottom: 8px;">
        ✅ Found ${results.length} result(s) for "${query}"
    </div>`;
    
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
            for (const tag of docTags) {
                if (tag.includes(word) || word.includes(tag)) score += 30;
            }
            const tagMatch = docTags.some(tag => tag.includes(word) || word.includes(tag));
            if (tagMatch) score += 25;
        }
        
        const matchCount = words.filter(w => docName.includes(w)).length;
        if (matchCount > 1) score += matchCount * 15;
        
        return { doc, score };
    });
    
    const results = scored
        .filter(item => item.score > 0)
        .sort((a, b) => b.score - a.score)
        .map(item => item.doc);
    
    return results;
}

// ==================== LIBRARY VOICE SEARCH ====================
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
        libraryVoiceRecognition.lang = "en-US";
        libraryVoiceRecognition.continuous = false;
        libraryVoiceRecognition.interimResults = true;
        
        libraryVoiceRecognition.onstart = () => {
            isLibraryVoiceListening = true;
            document.getElementById('voiceSearchBtn').classList.add('listening');
            document.getElementById('voiceSearchBtn').innerHTML = '<span class="btn-icon">⏹</span> Stop';
            log("🎤 Listening for search query...", 'system');
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
                            speak(`Opening ${bestMatch.name}`);
                        }
                        searchDocuments();
                    } else {
                        log(`🔍 Voice: "${transcript}" - No results found`, 'user');
                        speak(`No results found for "${transcript}"`);
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
            speak(`Opened ${bestMatch.name}`);
            return true;
        }
    }
    
    return false;
}

// ==================== GOOGLE FORM CONFIGURATION GUIDE ====================
function showGoogleFormGuide() {
    alert(`📋 GOOGLE FORM CONFIGURATION GUIDE

✅ Form của bạn đã được cấu hình với Entry ID:
- Document Name: entry.602500005
- Drive Link: entry.970179045
- Tags: entry.2136251389

✅ Google Apps Script URL:
${GOOGLE_SHEETS_DATA_URL}

📌 Lưu ý:
- Dữ liệu sẽ được gửi qua Google Form
- Dữ liệu được đọc từ Google Sheets qua Apps Script
- Kiểm tra trong Google Sheets để xác nhận
`);
}

// ==================== EVENT LISTENERS ====================
document.addEventListener('DOMContentLoaded', function() {
    document.querySelectorAll('.modal-overlay').forEach(modal => {
        modal.addEventListener('click', function(e) {
            if (e.target === this) {
                if(this.id === 'helpModal') closeHelp();
                if(this.id === 'saveModal') closeSaveDialog();
                if(this.id === 'libraryModal') closeLibrary();
            }
        });
    });
    
    syncWithGoogleSheets();
    
    // Thêm nút hướng dẫn cấu hình Google Form
    const libraryBody = document.querySelector('#libraryModal .modal-body');
    if (libraryBody) {
        const configBtn = document.createElement('button');
        configBtn.className = 'btn btn-help';
        configBtn.style.cssText = 'padding: 4px 12px; height: 28px; font-size: 10px; margin-left: 8px; flex: none;';
        configBtn.innerHTML = '⚙️ Form Config';
        configBtn.onclick = showGoogleFormGuide;
        
        const header = document.querySelector('#libraryModal .modal-title h2');
        if (header) {
            header.parentNode.appendChild(configBtn);
        }
    }
});

document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        closeHelp();
        closeSaveDialog();
        closeLibrary();
        closePasswordModal();
    }
    
    if (e.key === 'Enter') {
        const passwordModal = document.getElementById('passwordModal');
        if (passwordModal) {
            e.preventDefault();
            confirmDeleteWithPassword();
        }
        
        const libraryModal = document.getElementById('libraryModal');
        if (libraryModal && libraryModal.classList.contains('active')) {
            const searchInput = document.getElementById('searchQuery');
            if (document.activeElement === searchInput) {
                searchDocuments();
            }
        }
    }
});

document.querySelectorAll("input").forEach(i => {
    i.addEventListener("input", () => {
        hasAutoTriggeredSave = false; 
        draw();
    });
});

window.addEventListener("resize", draw);

// ==================== STARTUP ====================
draw();
log("🚀 3D Opening Tool Pro ready", 'system');
log("💡 Press Voice button and speak (e.g.: length 2000, width 1500, thickness 300)", 'system');
log("📚 Press Library button to manage Drive documents", 'system');
log("📤 Documents are submitted via Google Form", 'system');
log("✅ Form Entry IDs: Name=602500005, Link=970179045, Tags=2136251389", 'system');
log("✅ Apps Script URL: " + GOOGLE_SHEETS_DATA_URL, 'system');
