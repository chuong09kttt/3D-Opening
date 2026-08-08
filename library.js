/* =========================================
   FILE: library.js (Module)
   Quản lý Library
   ========================================= */

import { speak } from './voice.js';

// Biến dùng riêng cho Library
let isSyncing = false;
let library = [];
let deleteTargetIndex = null;

let isLibraryVoiceListening = false;
let libraryVoiceRecognition = null;

// Hàm tải dữ liệu (Dùng JSONP)
export function syncWithGoogleSheets() {
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
    updateSyncStatus('error', 'Connection error');
    const list = document.getElementById('libraryList');
    if (list) {
        list.innerHTML = `<div style="text-align: center; color: rgba(255,255,255,0.5); padding: 30px 0;">❌ Cannot connect to Google Sheets</div>`;
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

// --- UI THƯ VIỆN ---
export function renderLibrary(filteredList = null) {
    const list = document.getElementById('libraryList');
    if (!list) return;
    const docs = filteredList || library;
    if (docs.length === 0) { list.innerHTML = `<div style="text-align: center; color: rgba(255,255,255,0.4); padding: 30px 0;">📭 No documents found</div>`; return; }
    list.innerHTML = docs.map((doc, index) => {
        const originalIndex = library.indexOf(doc);
        const tagsHtml = doc.tags && doc.tags.length > 0 ? `<div style="display: flex; gap: 4px; flex-wrap: wrap; margin-top: 4px;">${doc.tags.map(tag => `<span style="background: rgba(108,92,231,0.2); color: #a29bfe; padding: 2px 8px; border-radius: 4px; font-size: 10px;">#${tag}</span>`).join('')}</div>` : '';
        return `<div class="library-item" style="display: flex; align-items: center; gap: 12px; padding: 10px 14px; background: rgba(255,255,255,0.03); border-radius: 10px; margin-bottom: 8px;">
            <span style="font-size: 20px;">📄</span>
            <div style="flex: 1; min-width: 0;"><div style="font-weight: 600; color: #fff; font-size: 14px;">${doc.name}</div>${tagsHtml}</div>
            <button onclick="openDocument(${originalIndex})" class="btn btn-primary" style="flex: none; padding: 0 16px; height: 32px; font-size: 11px;">📂 Open</button>
            <button onclick="showDeletePassword(${originalIndex})" class="btn btn-reset" style="flex: none; padding: 0 12px; height: 32px; font-size: 11px; background: rgba(255,0,0,0.2);">✕</button>
        </div>`;
    }).join('');
}

export function openDocument(index) {
    const doc = library[index];
    if (doc && doc.link) {
        if (doc.link.startsWith('http://') || doc.link.startsWith('https://')) window.open(doc.link, '_blank');
    } else alert('⚠️ Document not found');
}

export function openLibrary() {
    const modal = document.getElementById('libraryModal');
    if (modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
        renderLibrary();
        document.getElementById('searchQuery').value = '';
        document.getElementById('searchResults').style.display = 'none';
        syncWithGoogleSheets();
    }
}

export function closeLibrary() {
    const modal = document.getElementById('libraryModal');
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
        closePasswordModal();
        stopLibraryVoice();
    }
}

// --- TÌM KIẾM ---
export function searchDocuments() {
    const query = document.getElementById('searchQuery').value.trim();
    if (!query) { renderLibrary(); document.getElementById('searchResults').style.display = 'none'; return; }
    const results = performSmartSearch(query);
    const resultsDiv = document.getElementById('searchResults');
    if (results.length === 0) {
        resultsDiv.style.display = 'block';
        resultsDiv.innerHTML = `<div style="text-align: center; color: rgba(255,255,255,0.5); padding: 15px 0;">🔍 No documents found for "${query}"</div>`;
        renderLibrary();
        return;
    }
    resultsDiv.style.display = 'block';
    resultsDiv.innerHTML = `<div style="color: rgba(255,255,255,0.6); font-size: 12px;">✅ Found ${results.length} result(s)</div>`;
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

// --- VOICE LIBRARY ---
function initVoiceLibrary() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return null;
    const r = new SR();
    r.lang = "vi-VN"; r.continuous = false; r.interimResults = true;
    r.onstart = () => {
        isLibraryVoiceListening = true;
        document.getElementById('voiceSearchBtn').classList.add('listening');
        document.getElementById('voiceSearchBtn').innerHTML = '<span class="btn-icon">⏹</span> Dừng';
    };
    r.onend = () => { stopLibraryVoice(); };
    r.onerror = () => { stopLibraryVoice(); };
    r.onresult = (e) => {
        let transcript = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
            transcript += e.results[i][0].transcript;
            if (e.results[i].isFinal) {
                document.getElementById('searchQuery').value = transcript;
                searchDocuments();
                stopLibraryVoice();
            }
        }
    };
    return r;
}

function stopLibraryVoice() {
    isLibraryVoiceListening = false;
    if (libraryVoiceRecognition) { try { libraryVoiceRecognition.stop(); } catch(e) {} }
    const btn = document.getElementById('voiceSearchBtn');
    if (btn) {
        btn.classList.remove('listening');
        btn.innerHTML = '<span class="btn-icon">🎤</span> Voice';
    }
}

export function voiceSearchLibrary() {
    if (isLibraryVoiceListening) { stopLibraryVoice(); return; }
    if (!libraryVoiceRecognition) { libraryVoiceRecognition = initVoiceLibrary(); if (!libraryVoiceRecognition) return; }
    speak("Hãy nói tên tài liệu bạn muốn tìm kiếm nhé", () => {
        try { libraryVoiceRecognition.start(); } 
        catch(e) { try { libraryVoiceRecognition.stop(); setTimeout(() => { libraryVoiceRecognition.start(); }, 100); } catch(e2) {} }
    });
}

// --- ADD/ DELETE ---
export async function addDocument() {
    const nameInput = document.getElementById('newDocName');
    const linkInput = document.getElementById('newDocLink');
    const tagsInput = document.getElementById('newDocTags');
    const name = nameInput.value.trim();
    const link = linkInput.value.trim();
    const tags = tagsInput.value.trim().split(',').map(t => t.trim()).filter(t => t);
    if (!name || !link) return alert('Vui lòng nhập đủ thông tin');
    if (library.some(d => d.name.toLowerCase() === name.toLowerCase())) return alert('Tài liệu đã tồn tại');
    
    try {
        const formData = new URLSearchParams();
        formData.append('action', 'add'); formData.append('name', name); formData.append('link', link); formData.append('tags', tags.join(', '));
        await fetch(GOOGLE_SHEETS_DATA_URL, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: formData });
        library.push({ name, link, tags });
        renderLibrary();
        nameInput.value = ''; linkInput.value = ''; tagsInput.value = '';
        setTimeout(() => { syncWithGoogleSheets(); }, 1500);
    } catch (error) { alert('❌ Lỗi thêm tài liệu'); }
}

export function showDeletePassword(index) {
    deleteTargetIndex = index;
    const doc = library[index];
    if (!doc) return alert('Tài liệu không tồn tại');
    const passwordModal = document.createElement('div');
    passwordModal.id = 'passwordModal';
    passwordModal.style.cssText = `position: fixed; inset: 0; background: rgba(0,0,0,0.85); backdrop-filter: blur(10px); display: flex; justify-content: center; align-items: center; z-index: 2000;`;
    passwordModal.innerHTML = `
        <div style="background: rgba(20,27,43,0.98); border-radius: 20px; padding: 30px; max-width: 400px; width: 90%;">
            <h3 style="color: #fff; text-align: center;">Xác nhận xóa</h3>
            <p style="color: rgba(255,255,255,0.6); text-align: center;">Xóa tài liệu: <strong style="color: #ff7675;">"${doc.name}"</strong></p>
            <input id="deletePasswordInput" type="password" placeholder="Nhập mật khẩu..." style="width: 100%; height: 44px; background: rgba(255,255,255,0.05); border-radius: 8px; color: #fff; padding: 0 14px; margin: 15px 0; border: 1px solid rgba(255,255,255,0.1);">
            <div style="display: flex; gap: 10px;">
                <button onclick="closePasswordModal()" style="flex: 1; height: 40px; background: rgba(255,255,255,0.1); color: #fff; border-radius: 10px; cursor: pointer;">Hủy</button>
                <button onclick="confirmDeleteWithPassword()" style="flex: 1; height: 40px; background: linear-gradient(135deg, #d63031, #ff7675); color: #fff; border-radius: 10px; cursor: pointer;">Xóa</button>
            </div>
            <div id="passwordError" style="color: #ff7675; margin-top: 10px; text-align: center; display: none;">❌ Sai mật khẩu!</div>
        </div>
    `;
    document.body.appendChild(passwordModal);
    setTimeout(() => { document.getElementById('deletePasswordInput').focus(); }, 200);
}

export function closePasswordModal() {
    const modal = document.getElementById('passwordModal');
    if (modal) modal.remove();
    deleteTargetIndex = null;
}

export async function confirmDeleteWithPassword() {
    const password = document.getElementById('deletePasswordInput').value.trim();
    if (deleteTargetIndex !== null && deleteTargetIndex < library.length) {
        try {
            const formData = new URLSearchParams();
            formData.append('action', 'delete'); formData.append('index', deleteTargetIndex); formData.append('password', password);
            await fetch(GOOGLE_SHEETS_DATA_URL, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: formData });
            library.splice(deleteTargetIndex, 1);
            renderLibrary();
            closePasswordModal();
            setTimeout(() => { syncWithGoogleSheets(); }, 1000);
        } catch (error) { alert('❌ Lỗi xóa tài liệu'); closePasswordModal(); }
    }
}
