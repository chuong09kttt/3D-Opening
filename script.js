/* =========================================
   FILE: script.js
   3D, Export, và Logic cốt lõi
   ========================================= */

const c = document.getElementById("view");
const ctx = c.getContext("2d");

let ORI = "Z";

// Các biến này đã được chia sẻ qua window ở voice.js, chỉ cần lấy ra dùng lại
let hasAutoTriggeredSave = window.hasAutoTriggeredSave;

// ==================== CONFIGURATION ====================
const GOOGLE_SHEETS_DATA_URL = 'https://script.google.com/macros/s/AKfycbz9EF-jw28rFIkCekd6NWyCldCK9HR-YHO2pVne85D3tIdU6bBc7L-bD5-ZZULIXZbv/exec';

// ==================== LOG & HELP ====================
function log(t, type = 'user') {
    const chatBox = document.getElementById("chat"); if (!chatBox) return;
    const className = type === 'user' ? 'user' : type === 'assistant' ? 'assistant' : 'system';
    chatBox.innerHTML += `<div class="${className}">${t}</div>`; chatBox.scrollTop = chatBox.scrollHeight;
}
window.log = log; // Để các file khác dùng được

function help() { const modal = document.getElementById('helpModal'); if (modal) { modal.classList.add('active'); document.body.style.overflow = 'hidden'; log("📖 Help opened", 'system'); } }
window.help = help;

function closeHelp() { const modal = document.getElementById('helpModal'); if (modal) { modal.classList.remove('active'); document.body.style.overflow = ''; } }
window.closeHelp = closeHelp;

// ==================== 3D & EXPORT FUNCTIONS ====================
function autoSaveDialog() {
    if (hasAutoTriggeredSave) return;
    let L = parseInputValue("dx"); let W = parseInputValue("dy"); let T = parseInputValue("dz");
    if (L > 0 && W > 0 && T > 0) {
        hasAutoTriggeredSave = true;
        window.hasAutoTriggeredSave = true; // Đồng bộ lại với biến toàn cục
        const modal = document.getElementById('saveModal');
        if (modal) { modal.classList.add('active'); document.body.style.overflow = 'hidden'; document.getElementById('saveFileName').value = `Opening_${L}x${W}x${T}`; log("📁 Opening save dialog...", 'system'); }
    }
}
window.autoSaveDialog = autoSaveDialog; // Để library.js gọi được

function closeSaveDialog() {
    const modal = document.getElementById('saveModal');
    if (modal) { modal.classList.remove('active'); document.body.style.overflow = ''; hasAutoTriggeredSave = false; window.hasAutoTriggeredSave = false; }
}
window.closeSaveDialog = closeSaveDialog;

function confirmSave() { const fileName = document.getElementById('saveFileName').value.trim() || "Opening"; generateAndDownloadFile(fileName); closeSaveDialog(); }
window.confirmSave = confirmSave;

// Hàm xuất file .mac
function generateAndDownloadFile(fileName) {
    let px = parseInputValue("px"); let py = parseInputValue("py"); let pz = parseInputValue("pz");
    let L = parseInputValue("dx"); let W = parseInputValue("dy"); let H = parseInputValue("dz");
    let r1 = parseInputValue("r1"); let r2 = parseInputValue("r2"); let r3 = parseInputValue("r3"); let r4 = parseInputValue("r4");
    let oriStr = "ORI Y is Y and Z is Z";
    if (ORI === "X") oriStr = "ORI Y is -Z and Z is X"; 
    else if (ORI === "Y") oriStr = "ORI Y is -X and Z is Y";

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
    log(`💾 Exported ${fileName}.mac successfully!`, 'system');
    speak("File của bạn đã được xuất thành công");
}
window.generateAndDownloadFile = generateAndDownloadFile;

function setOri(o) { ORI = o; document.querySelectorAll(".ori-buttons button").forEach(b => b.classList.remove("active")); document.getElementById("o" + o.toLowerCase()).classList.add("active"); document.getElementById('oriBadge').textContent = o; draw(); }
window.setOri = setOri;

function parseInputValue(id) {
    let raw = (document.getElementById(id).value || "").toString().trim();
    if (!raw) return 0;
    if (/^\d+[.,]\d{3}$/.test(raw)) raw = raw.replace(/[.,]/g, '');
    else raw = raw.replace(',', '.');
    return parseFloat(raw) || 0;
}

function reset() {
    document.getElementById("px").value = 0; document.getElementById("py").value = 0; document.getElementById("pz").value = 0;
    document.getElementById("dx").value = 0; document.getElementById("dy").value = 0; document.getElementById("dz").value = 0;
    document.getElementById("r1").value = 150; document.getElementById("r2").value = 150; document.getElementById("r3").value = 150; document.getElementById("r4").value = 150;
    hasAutoTriggeredSave = false; window.hasAutoTriggeredSave = false; setOri('Z'); log("↺ Reset all parameters", 'system');
}
window.reset = reset;

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
window.processFullVoiceNLP = processFullVoiceNLP; // Để voice.js gọi

// ==================== EVENT LISTENERS ====================
document.addEventListener('DOMContentLoaded', function() {
    document.querySelectorAll('.modal-overlay').forEach(modal => {
        modal.addEventListener('click', function(e) { if (e.target === this) { if(this.id === 'helpModal') closeHelp(); if(this.id === 'saveModal') closeSaveDialog(); if(this.id === 'libraryModal') closeLibrary(); } });
    });
    
    // Gọi hàm đồng bộ từ library.js
    if (typeof syncWithGoogleSheets === 'function') {
        syncWithGoogleSheets();
    }
});

document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') { closeHelp(); closeSaveDialog(); closeLibrary(); closePasswordModal(); }
    if (e.key === 'Enter') {
        const passwordModal = document.getElementById('passwordModal');
        if (passwordModal) { e.preventDefault(); confirmDeleteWithPassword(); }
        const libraryModal = document.getElementById('libraryModal');
        if (libraryModal && libraryModal.classList.contains('active')) {
            const searchInput = document.getElementById('searchQuery');
            if (document.activeElement === searchInput) searchDocuments();
        }
    }
});

document.querySelectorAll("input").forEach(i => { i.addEventListener("input", () => { hasAutoTriggeredSave = false; window.hasAutoTriggeredSave = false; draw(); }); });
window.addEventListener("resize", draw);

// ==================== STARTUP ====================
draw();
log("🚀 3D Opening Tool Pro ready", 'system');
log("📚 Press Library button to manage Drive documents", 'system');
log("✅ Apps Script URL: " + GOOGLE_SHEETS_DATA_URL, 'system');
