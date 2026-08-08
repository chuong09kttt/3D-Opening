/* =========================================
   FILE: voice.js
   Xử lý riêng biệt Voice cho 3D và Library
   ========================================= */

let recognition3D = null;
let recognitionLibrary = null;

let is3DListening = false;
let isLibraryVoiceListening = false;

// Hàm nói (Text-to-Speech tiếng Việt)
function speak(text, callback) {
    window.speechSynthesis.cancel(); // Dừng mọi giọng nói hiện tại
    let u = new SpeechSynthesisUtterance(text);
    u.lang = "vi-VN";
    u.rate = 0.95;
    u.pitch = 1.05;
    u.volume = 1;
    u.onend = () => { if (callback) callback(); };
    window.speechSynthesis.speak(u);
}

// ===================================================
// 1. VOICE CHO 3D MODEL (Xử lý thông số kỹ thuật)
// ===================================================
function initVoice3D() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
        alert("❌ Trình duyệt không hỗ trợ nhận diện giọng nói!");
        return null;
    }
    const r = new SR();
    r.lang = "vi-VN";
    r.continuous = true;
    r.interimResults = true;

    r.onstart = () => {
        is3DListening = true;
        document.getElementById('voiceBtn').classList.add('listening');
        document.getElementById('chatStatus').textContent = '● Đang nghe...';
        document.getElementById('chatStatus').classList.add('waiting');
    };

    r.onend = () => {
        if (is3DListening) {
            try { r.start(); } catch(e) {}
        } else {
            document.getElementById('voiceBtn').classList.remove('listening');
            document.getElementById('chatStatus').textContent = '● Sẵn sàng';
            document.getElementById('chatStatus').classList.remove('waiting');
        }
    };

    r.onerror = (e) => {
        if (e.error === 'not-allowed') {
            alert("❌ Bạn chưa cấp quyền truy cập Micro.");
            stopVoice3D();
        }
        if (is3DListening && e.error !== 'not-allowed') {
            try { setTimeout(() => { r.start(); }, 300); } catch(e) {}
        }
    };

    r.onresult = (e) => {
        let finalText = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
            if (e.results[i].isFinal) {
                finalText += e.results[i][0].transcript.trim() + ' ';
            }
        }
        if (finalText) {
            // Gọi hàm xử lý thông số kỹ thuật nằm trong script.js
            if (typeof processFullVoiceNLP === 'function') {
                processFullVoiceNLP(finalText.trim());
            }
        }
    };
    return r;
}

function toggleVoice3D() {
    if (is3DListening) {
        stopVoice3D();
        return;
    }
    if (!recognition3D) {
        recognition3D = initVoice3D();
        if (!recognition3D) return;
    }
    // Lời chào tiếng Việt khi bật Voice 3D
    speak("Xin chào, tôi có thể giúp gì cho bạn?", () => {
        try {
            recognition3D.start();
        } catch(e) {
            // Nếu bị lỗi đang chạy, dừng lại rồi chạy lại
            try { recognition3D.stop(); setTimeout(() => { recognition3D.start(); }, 100); } catch(e2) {}
        }
    });
}

function stopVoice3D() {
    is3DListening = false;
    if (recognition3D) {
        try { recognition3D.stop(); } catch(e) {}
    }
    document.getElementById('voiceBtn').classList.remove('listening');
    document.getElementById('chatStatus').textContent = '● Sẵn sàng';
    document.getElementById('chatStatus').classList.remove('waiting');
}


// ===================================================
// 2. VOICE CHO LIBRARY (Tìm kiếm tài liệu)
// ===================================================
function initVoiceLibrary() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
        alert("❌ Trình duyệt không hỗ trợ nhận diện giọng nói!");
        return null;
    }
    const r = new SR();
    r.lang = "vi-VN"; // Nghe tiếng Việt
    r.continuous = false;
    r.interimResults = true;

    r.onstart = () => {
        isLibraryVoiceListening = true;
        document.getElementById('voiceSearchBtn').classList.add('listening');
        document.getElementById('voiceSearchBtn').innerHTML = '<span class="btn-icon">⏹</span> Dừng';
    };

    r.onend = () => {
        stopVoiceLibrary();
    };

    r.onerror = (e) => {
        if (e.error !== 'no-speech') {
            console.log(`⚠️ Lỗi mic Library: ${e.error}`);
        }
        stopVoiceLibrary();
    };

    r.onresult = (e) => {
        let transcript = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
            transcript += e.results[i][0].transcript;
            if (e.results[i].isFinal) {
                document.getElementById('searchQuery').value = transcript;
                // Gọi hàm tìm kiếm nằm trong script.js
                if (typeof searchDocuments === 'function') {
                    searchDocuments();
                }
                stopVoiceLibrary();
            }
        }
    };
    return r;
}

function toggleVoiceLibrary() {
    if (isLibraryVoiceListening) {
        stopVoiceLibrary();
        return;
    }
    if (!recognitionLibrary) {
        recognitionLibrary = initVoiceLibrary();
        if (!recognitionLibrary) return;
    }
    // Lời chào tiếng Việt khi bật Voice Library
    speak("Hãy nói tên tài liệu bạn muốn tìm kiếm nhé", () => {
        try {
            recognitionLibrary.start();
        } catch(e) {
            try { recognitionLibrary.stop(); setTimeout(() => { recognitionLibrary.start(); }, 100); } catch(e2) {}
        }
    });
}

function stopVoiceLibrary() {
    isLibraryVoiceListening = false;
    if (recognitionLibrary) {
        try { recognitionLibrary.stop(); } catch(e) {}
    }
    const btn = document.getElementById('voiceSearchBtn');
    if (btn) {
        btn.classList.remove('listening');
        btn.innerHTML = '<span class="btn-icon">🎤</span> Voice';
    }
}
