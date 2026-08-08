/* =========================================
   FILE: voice.js
   Voice 3D & Text-to-Speech
   ========================================= */

// --- Các biến chung cho Voice 3D ---
let isListening = false;
let recognition = null;
let silenceTimer = null;
let partialTranscript = '';
let isSpeaking = false;
let hasAutoTriggeredSave = false;

// Treo các biến lên window để file script.js và library.js có thể dùng chung
window.isListening = isListening;
window.recognition = recognition;
window.silenceTimer = silenceTimer;
window.partialTranscript = partialTranscript;
window.isSpeaking = isSpeaking;
window.hasAutoTriggeredSave = hasAutoTriggeredSave;

// --- Hàm nói (Text-to-Speech) - Dùng chung ---
function speak(t) {
    window.speechSynthesis.cancel(); 
    let u = new SpeechSynthesisUtterance(t);
    u.lang = "vi-VN"; 
    u.rate = 0.95; 
    u.pitch = 1.05; 
    u.volume = 1;
    isSpeaking = true; 
    u.onend = () => { isSpeaking = false; }; 
    window.speechSynthesis.speak(u);
}
window.speak = speak;

// --- Hàm khởi tạo Voice 3D ---
function initVoice() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { log("❌ Browser does not support Voice", 'system'); return null; }
    const r = new SR();
    r.lang = "vi-VN"; 
    r.continuous = true; 
    r.interimResults = true;
    
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

// --- Hàm Bật/Tắt Voice 3D cho HTML ---
function voice() {
    if (isListening) { stopVoice(); return; }
    if (!recognition) { recognition = initVoice(); if (!recognition) return; }
    try { recognition.start(); } catch(e) { try { recognition.stop(); setTimeout(() => { recognition.start(); }, 300); } catch(e2) {} }
}
window.voice = voice;

// --- Hàm dừng Voice ---
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
window.stopVoice = stopVoice;
