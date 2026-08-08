/* =========================================
   FILE: voice.js
   Voice 3D & Text-to-Speech chung
   ========================================= */

// 1. Biến trạng thái VOICE 3D (Nằm riêng biệt trong file này)
let is3DListening = false;
let recognition3D = null;

// 2. Hàm nói (Text-to-Speech) tiếng Việt - Dùng chung
function speak(text, callback) {
    window.speechSynthesis.cancel();
    let u = new SpeechSynthesisUtterance(text);
    u.lang = "vi-VN";
    u.rate = 0.95;
    u.pitch = 1.05;
    u.volume = 1;
    u.onend = () => { if (callback) callback(); };
    window.speechSynthesis.speak(u);
}
window.speak = speak; // Treo lên window để file khác dùng

// 3. Khởi tạo Voice 3D
function initVoice3D() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { alert("❌ Trình duyệt không hỗ trợ nhận diện giọng nói!"); return null; }
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
        if (e.error === 'not-allowed') { alert("❌ Bạn chưa cấp quyền truy cập Micro."); stopVoice3D(); }
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
        if (finalText && typeof processFullVoiceNLP === 'function') {
            processFullVoiceNLP(finalText.trim());
        }
    };
    return r;
}

// 4. Hàm Bật/Tắt Voice 3D (Gắn vào HTML)
function voice() {
    if (is3DListening) {
        stopVoice3D();
        return;
    }
    if (!recognition3D) {
        recognition3D = initVoice3D();
        if (!recognition3D) return;
    }
    // Lời chào tiếng Việt
    speak("Xin chào, tôi có thể giúp gì cho bạn?", () => {
        try { recognition3D.start(); } 
        catch(e) { try { recognition3D.stop(); setTimeout(() => { recognition3D.start(); }, 100); } catch(e2) {} }
    });
}
window.voice = voice; // Gán ra toàn cục cho HTML gọi

function stopVoice3D() {
    is3DListening = false;
    if (recognition3D) { try { recognition3D.stop(); } catch(e) {} }
    document.getElementById('voiceBtn').classList.remove('listening');
    document.getElementById('chatStatus').textContent = '● Sẵn sàng';
    document.getElementById('chatStatus').classList.remove('waiting');
}
