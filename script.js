const c = document.getElementById("view");
const ctx = c.getContext("2d");

let ORI = "Z";
let isListening = false;
let recognition = null;
let silenceTimer = null;
let partialTranscript = '';
let isSpeaking = false;
let hasAutoTriggeredSave = false; // Ngăn việc gọi hộp thoại lưu nhiều lần liên tục

// Voice recognition with silence detection
function initVoice() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
        log("❌ Trình duyệt không hỗ trợ Voice", 'system');
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
        log("🎤 Đang lắng nghe...", 'system');
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
            log("❌ Quyền truy cập microphone bị từ chối", 'system');
            stopVoice();
        } else if (e.error !== 'no-speech') {
            log(`⚠️ Lỗi: ${e.error}`, 'system');
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
        try { recognition.stop(); setTimeout(() => { recognition.start(); }, 300); } catch(e2) { log("⚠️ Lỗi khởi động voice", 'system'); }
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
    log("🔇 Đã dừng lắng nghe", 'system');
}

function setOri(o) {
    ORI = o;
    document.querySelectorAll(".ori-buttons button").forEach(b => b.classList.remove("active"));
    document.getElementById("o" + o.toLowerCase()).classList.add("active");
    document.getElementById('oriBadge').textContent = o;
    draw(); // Update 3D immediately
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

function draw() {
    c.width = c.offsetWidth;
    c.height = c.offsetHeight || 320;

    let L = parseInputValue("dx");
    let W = parseInputValue("dy");
    let T = parseInputValue("dz"); // Changed to Thickness

    ctx.clearRect(0, 0, c.width, c.height);

    const grad = ctx.createLinearGradient(0, 0, c.width, c.height);
    grad.addColorStop(0, '#0a0e17');
    grad.addColorStop(1, '#141b2b');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, c.width, c.height);

    drawAxis();

    if (L === 0 && W === 0 && T === 0) return;

    let maxDim = Math.max(L, W, T, 100);
    let scale = 110 / maxDim;

    let l = L * scale;
    let w = W * scale;
    let t = T * scale; // Thickness in 3D space

    let cx = c.width / 2 - 20;
    let cy = c.height / 2 + 30;

    // --- FIX: ORIENTATION REAL-TIME LOGIC ---
    // Logic đảm bảo Thickness (Trục Z của Model) luôn trùng với hướng Orientation được chọn (X, Y, hoặc Z).
    if (ORI === "Z") {
        drawBox3D(cx, cy, l, w, t, `L=${L}`, `W=${W}`, `T=${T}`);
    } else if (ORI === "X") {
        // Xoay sao cho Thickness nằm dọc trục X. Trong phép chiếu 2D, hoán đổi L và T
        drawBox3D(cx, cy, t, w, l, `L=${L}`, `W=${W}`, `T=${T}`); 
        // Ghi chú hướng trực quan
        ctx.fillStyle = 'rgba(255,255,255,0.2)';
        ctx.font = '11px Inter, sans-serif';
        ctx.fillText('← X (Thickness)', 30, 30);
    } else if (ORI === "Y") {
        // Xoay sao cho Thickness nằm dọc trục Y. Trong phép chiếu 2D, hoán đổi chiều sâu hiển thị.
        // Đơn giản hóa bằng cách giữ dạng box nhưng chuyển đổi chiều view.
        drawBox3D(cx, cy, l, t, w, `L=${L}`, `W=${W}`, `T=${T}`);
        ctx.fillStyle = 'rgba(255,255,255,0.2)';
        ctx.font = '11px Inter, sans-serif';
        ctx.fillText('↑ Y (Thickness)', 30, 30);
    }
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

    const mainColor = '#6c5ce7'; const lightColor = '#a29bfe'; const darkColor = '#4a3db8';

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
            // Cập nhật Regex để bắt linh hoạt hơn: dấu =, dấu :, chữ "bằng"
            let regex = new RegExp(`${kw}(?:\\s+là|\\s+bằng|\\s*[:=]|\\s+)?\\s*(-?\\d+(?:[.,]\\d+)?)`, "i");
            let match = str.match(regex);
            if (match) return cleanNumberString(match[1]);
        }
        return null;
    };

    // Position - Lỗi Y, Z trước đây thường do thiếu dấu cách
    let posX = findVal(["vị trí x", "pos x", "tọa độ x", "position x"]);
    let posY = findVal(["vị trí y", "pos y", "tọa độ y", "position y"]);
    let posZ = findVal(["vị trí z", "pos z", "tọa độ z", "position z"]);

    if (posX !== null) { document.getElementById("px").value = posX; updatedCount++; }
    if (posY !== null) { document.getElementById("py").value = posY; updatedCount++; }
    if (posZ !== null) { document.getElementById("pz").value = posZ; updatedCount++; }

    // Dimension - Đã đổi thành Thickness
    let len = findVal(["chiều dài", "độ dài", "dài", "length"]);
    let wid = findVal(["chiều rộng", "độ rộng", "rộng", "width"]);
    let hei = findVal(["chiều dày", "độ dày", "dày", "thickness", "chiều cao", "độ cao", "cao", "height"]); // Hỗ trợ cả từ cũ

    if (len !== null) { document.getElementById("dx").value = len; updatedCount++; }
    if (wid !== null) { document.getElementById("dy").value = wid; updatedCount++; }
    if (hei !== null) { document.getElementById("dz").value = hei; updatedCount++; }

    // Radius
    let rad1 = findVal(["r1", "radius 1", "bo góc 1"]);
    let rad2 = findVal(["r2", "radius 2", "bo góc 2"]);
    let rad3 = findVal(["r3", "radius 3", "bo góc 3"]);
    let rad4 = findVal(["r4", "radius 4", "bo góc 4"]);
    let radAll = findVal(["bo góc", "bán kính", "radius"]);

    if (rad1 !== null) { document.getElementById("r1").value = rad1; updatedCount++; }
    if (rad2 !== null) { document.getElementById("r2").value = rad2; updatedCount++; }
    if (rad3 !== null) { document.getElementById("r3").value = rad3; updatedCount++; }
    if (rad4 !== null) { document.getElementById("r4").value = rad4; updatedCount++; }
    
    if (radAll !== null && rad1 === null && rad2 === null && rad3 === null && rad4 === null) {
        document.getElementById("r1").value = radAll; document.getElementById("r2").value = radAll;
        document.getElementById("r3").value = radAll; document.getElementById("r4").value = radAll;
        updatedCount++;
    }

    // Orientation
    if (str.match(/hướng\s*x/i)) { setOri('X'); updatedCount++; }
    else if (str.match(/hướng\s*y/i)) { setOri('Y'); updatedCount++; }
    else if (str.match(/hướng\s*z/i)) { setOri('Z'); updatedCount++; }

    // Fallback
    if (updatedCount === 0) {
        let rawNums = str.match(/\d+([.,]\d+)?/g);
        if (rawNums && rawNums.length >= 3) {
            document.getElementById("dx").value = cleanNumberString(rawNums[0]);
            document.getElementById("dy").value = cleanNumberString(rawNums[1]);
            document.getElementById("dz").value = cleanNumberString(rawNums[2]);
            updatedCount = 3;
        }
    }

    if (updatedCount > 0) {
        draw();
        const msg = "✅ Đã cập nhật thông số thành công!";
        log("🤖 " + msg, 'assistant');
        speak(msg);

        // **FIX: Tự động hiện hộp thoại lưu sau khi nói xong**
        autoSaveDialog();

    } else {
        const msg = "⚠️ Chưa nhận diện được thông số, vui lòng nói rõ hơn!";
        log("🤖 " + msg, 'assistant');
        speak(msg);
    }
}

// --- NEW LOGIC: AUTO SAVE DIALOG ---
function autoSaveDialog() {
    if (hasAutoTriggeredSave) return; // Chỉ trigger 1 lần

    let L = parseInputValue("dx");
    let W = parseInputValue("dy");
    let T = parseInputValue("dz");

    if (L > 0 && W > 0 && T > 0) {
        hasAutoTriggeredSave = true;
        const modal = document.getElementById('saveModal');
        if (modal) {
            modal.classList.add('active');
            document.body.style.overflow = 'hidden';
            document.getElementById('saveFileName').value = `Opening_${L}x${W}x${T}`; // Tên gợi ý
            log("📁 Hệ thống đã nhận đủ dữ liệu, đang mở hộp thoại lưu file...", 'system');
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

// --- SAVE FILE LOGIC ---
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
    let H = parseInputValue("dz"); // Height = Thickness

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
    document.body.appendChild(a); // Cần append vào DOM để một số trình duyệt hoạt động
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
    
    log(`💾 Đã xuất file ${fileName}.mac thành công!`, 'system');
    speak("File của bạn đã được xuất thành công");
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
    log("↺ Đã reset tất cả thông số", 'system');
    speak("Đã reset về mặc định");
}

// Help Modal Functions
function help() {
    const modal = document.getElementById('helpModal');
    if (modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
        log("📖 Đã mở hướng dẫn sử dụng", 'system');
    }
}

function closeHelp() {
    const modal = document.getElementById('helpModal');
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
}

// Close modals on overlay click
document.addEventListener('DOMContentLoaded', function() {
    document.querySelectorAll('.modal-overlay').forEach(modal => {
        modal.addEventListener('click', function(e) {
            if (e.target === this) {
                if(this.id === 'helpModal') closeHelp();
                if(this.id === 'saveModal') closeSaveDialog();
            }
        });
    });
});

document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        closeHelp();
        closeSaveDialog();
    }
});

// Input listeners
document.querySelectorAll("input").forEach(i => {
    i.addEventListener("input", () => {
        hasAutoTriggeredSave = false; // Reset trigger nếu user chỉnh sửa tay
        draw();
    });
});

window.addEventListener("resize", draw);

// Auto-start draw
draw();
log("🚀 3D Opening Tool Pro ready", 'system');
log("💡 Nhấn nút Voice và nói thông số", 'system');
log("📝 Ví dụ: 'chiều dài 500, chiều rộng 300, chiều dày 200'", 'system');
