/* =========================================
   FILE: library.js
   Quản lý Document Library
   ========================================= */

let isSyncing = false;
let library = [];
let deleteTargetIndex = null;

// Voice Library (Dùng tên biến riêng để không trùng với file voice.js)
let isLibraryVoiceListening = false;
let libraryVoiceRecognition = null;

// ==================== SYNC FUNCTIONS (JSONP) ====================
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

// ==================== ADD/DELETE ====================
async function addDocumentToGoogleSheets(doc) {
    const formData = new URLSearchParams();
    formData.append('action', 'add');
    formData.append('name', doc.name);
    formData.append('link', doc.link);
    formData.append('tags', doc.tags ? doc.tags.join(', ') : '');
    try {
        await fetch(GOOGLE_SHEETS_DATA_URL, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: formData
        });
        return true;
    } catch (error) {
        console.error('Add document via Form POST error:', error);
        throw error;
    }
}

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
        nameInput.value = ''; linkInput.value = ''; tagsInput.value = '';
        log(`📤 Document "${name}" submitted via Form Post`, 'system');
        updateSyncStatus('success', `Sent "${name}". Will auto-refresh.`);
        setTimeout(() => { syncWithGoogleSheets(); }, 1500);
        nameInput.focus();
    } catch (error) {
        console.error('Add document error:', error);
        alert('❌ Failed to submit document. Check your connection.');
        log('⚠️ Failed to submit document via Form Post', 'system');
    }
}
window.addDocument = addDocument;

async function deleteDocumentFromGoogleSheets(index, password) {
    const formData = new URLSearchParams();
    formData.append('action', 'delete');
    formData.append('index', index);
    formData.append('password', password);
    try {
        await fetch(GOOGLE_SHEETS_DATA_URL, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: formData
        });
        return true;
    } catch (error) {
        console.error('Delete document via Form POST error:', error);
        throw error;
    }
}

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
window.showDeletePassword = showDeletePassword;

function closePasswordModal() {
    const modal = document.getElementById('passwordModal');
    if (modal) modal.remove();
    deleteTargetIndex = null;
}
window.closePasswordModal = closePasswordModal;

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
            setTimeout(() => { syncWithGoogleSheets(); }, 1000);
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
window.confirmDeleteWithPassword = confirmDeleteWithPassword;

// ==================== UI FUNCTIONS ====================
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
window.openLibrary = openLibrary;

function closeLibrary() {
    const modal = document.getElementById('libraryModal');
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
        closePasswordModal();
        stopLibraryVoice();
    }
}
window.closeLibrary = closeLibrary;

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
window.searchDocuments = searchDocuments;

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

// ==================== LIBRARY VOICE SEARCH ====================
function voiceSearchLibrary() {
    if (isLibraryVoiceListening) { stopLibraryVoice(); return; }
    if (!libraryVoiceRecognition) {
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SR) { log("❌ Browser doesn't support Voice", 'system'); alert("❌ Browser doesn't support Voice"); return; }
        libraryVoiceRecognition = new SR();
        libraryVoiceRecognition.lang = "vi-VN"; // Đã sửa thành tiếng Việt
        libraryVoiceRecognition.continuous = false;
        libraryVoiceRecognition.interimResults = true;
        libraryVoiceRecognition.onstart = () => {
            isLibraryVoiceListening = true;
            document.getElementById('voiceSearchBtn').classList.add('listening');
            document.getElementById('voiceSearchBtn').innerHTML = '<span class="btn-icon">⏹</span> Stop';
            log("🎤 Listening for search query...", 'system');
        };
        libraryVoiceRecognition.onend = () => { stopLibraryVoice(); };
        libraryVoiceRecognition.onerror = (e) => {
            if (e.error !== 'no-speech') { log(`⚠️ Error: ${e.error}`, 'system'); }
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
                            if (bestMatch.link.startsWith('http://') || bestMatch.link.startsWith('https://')) { window.open(bestMatch.link, '_blank'); } else { log(`📄 Info: ${bestMatch.link}`, 'system'); }
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
    try { libraryVoiceRecognition.start(); } catch(e) { try { libraryVoiceRecognition.stop(); setTimeout(() => { libraryVoiceRecognition.start(); }, 300); } catch(e2) {} }
}
window.voiceSearchLibrary = voiceSearchLibrary;

function stopLibraryVoice() {
    isLibraryVoiceListening = false;
    if (libraryVoiceRecognition) { try { libraryVoiceRecognition.stop(); } catch(e) {} }
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
            if (bestMatch.link.startsWith('http://') || bestMatch.link.startsWith('https://')) { window.open(bestMatch.link, '_blank'); } else { log(`📄 Info: ${bestMatch.link}`, 'system'); }
            log(`📂 Voice: Opened "${bestMatch.name}"`, 'assistant');
            speak(`Opened ${bestMatch.name}`);
            return true;
        }
    }
    return false;
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
