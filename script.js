const c = document.getElementById("view");
const ctx = c.getContext("2d");

let ORI = "Z";
let isListening = false;
let recognition = null;
let isSpeaking = false;
let hasAutoTriggeredSave = false;

// ==================== VOICE SESSION CONTROL ====================
const VOICE_IDLE_TIMEOUT = 30000; // 30 seconds
let voiceIdleTimer = null;
let voiceSessionStarted = false;
let lastProcessedVoiceText = '';
let lastProcessedVoiceTime = 0;
let autoExportLock = false;
let isProcessingVoice = false;

// ==================== CONFIGURATION ====================
const GOOGLE_SHEETS_DATA_URL = 'https://script.google.com/macros/s/AKfycbxjPFKSL9rAAblIPzTQZzAO5JgIPZR8j93isgvBN1UzVYRvqFWi6ujwxzHESUh5AXPk/exec';
const TOOL_DOWNLOAD_URL = 'https://drive.google.com/file/d/14NNDzXSCG63m1yQZb51tZhrZfd5k8KPf/view';

let isSyncing = false;
let library = [];
let deleteTargetIndex = null;
let currentFilter = 'all';
let currentDeptFilter = null;
let isAddFormVisible = false;
let syncTimeout = null;

// Khai báo biến cho Library Voice
let libraryVoiceRecognition = null;
let isLibraryVoiceListening = false;
let recognitionRestartAttempts = 0;
const MAX_RESTART_ATTEMPTS = 3;

// ==================== AUTO EXPORT (VOICE) ====================

function autoExportMAC() {
    if (autoExportLock) return;

    const L = parseInputValue("dx");
    const W = parseInputValue("dy");
    const T = parseInputValue("dz");

    // Chỉ export khi đủ 3 thông số
    if (!(L > 0 && W > 0 && T > 0)) {
        return;
    }

    // Khóa ngay lập tức để không thể export lần 2
    autoExportLock = true;
    hasAutoTriggeredSave = true;

    // Tên file mặc định cho chế độ Voice
    const fileName = "Import";

    console.log("AUTO EXPORT:", fileName);

    generateAndDownloadFile(fileName);

    log(
        "💾 Auto exported: " + fileName + ".mac",
        'system'
    );
}

// ==================== TOOL DOWNLOAD ====================
function open3DOpeningTool() {
    if (!TOOL_DOWNLOAD_URL || TOOL_DOWNLOAD_URL.indexOf('http') !== 0) {
        alert('⚠️ Download link for 3D Opening Tool is not configured.');
        return;
    }

    log('🧊 Opening 3D Opening Tool download page...', 'system');
    window.open(TOOL_DOWNLOAD_URL, '_blank', 'noopener,noreferrer');
}

// ==================== SYNC FUNCTIONS ====================
function syncWithGoogleSheets(callback) {
    if (isSyncing) {
        if (syncTimeout) clearTimeout(syncTimeout);
        syncTimeout = setTimeout(function() {
            syncWithGoogleSheets(callback);
        }, 500);
        return;
    }
    
    isSyncing = true;
    updateSyncStatus('syncing', 'Loading data...');
    
    var timestamp = Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    const callbackName = 'jsonpCallback_' + timestamp;
    
    window[callbackName] = function(response) {
        const scriptEl = document.getElementById(callbackName);
        if (scriptEl) document.body.removeChild(scriptEl);
        delete window[callbackName];
        
        if (response && response.success && response.data) {
            library = response.data.map(item => ({
                name: item.name || 'Untitled',
                link: item.link || '',
                tags: item.tags ? item.tags.split(',').map(t => t.trim()).filter(t => t) : [],
                category: item.category || 'others',
                department: item.department || 'others'
            }));
            renderLibrary();
            updateCategoryCounts();
            updateSyncStatus('success', 'Loaded ' + library.length + ' documents');
            log('✅ Loaded ' + library.length + ' documents', 'system');
            
            if (typeof callback === 'function') {
                callback(library);
            }
        } else {
            handleLibraryError('Invalid data format from server');
            if (typeof callback === 'function') {
                callback([]);
            }
        }
        isSyncing = false;
        if (syncTimeout) {
            clearTimeout(syncTimeout);
            syncTimeout = null;
        }
    };

    const script = document.createElement('script');
    script.id = callbackName;
    script.src = GOOGLE_SHEETS_DATA_URL + '?action=get&callback=' + encodeURIComponent(callbackName) + '&t=' + timestamp;
    script.onerror = function() {
        handleLibraryError('Network error');
        if (document.getElementById(callbackName)) document.body.removeChild(document.getElementById(callbackName));
        delete window[callbackName];
        isSyncing = false;
        if (syncTimeout) {
            clearTimeout(syncTimeout);
            syncTimeout = null;
        }
        if (typeof callback === 'function') {
            callback([]);
        }
    };
    document.body.appendChild(script);
}

function forceRefreshLibrary() {
    log('🔄 Force refreshing library...', 'system');
    document.getElementById('syncStatus').style.borderColor = 'rgba(0,210,255,0.5)';
    syncWithGoogleSheets(function(updatedLibrary) {
        if (updatedLibrary && updatedLibrary.length > 0) {
            log('✅ Refreshed: ' + updatedLibrary.length + ' documents', 'system');
        }
    });
}

function handleLibraryError(errorMsg) {
    console.error('Sync error:', errorMsg);
    log('⚠️ Cannot connect to Google Sheets. Please check your connection.', 'system');
    updateSyncStatus('error', 'Connection error');
    const list = document.getElementById('libraryList');
    if (list) {
        list.innerHTML = '<div class="connection-error-box">' +
            '<div class="error-icon-big">📡</div>' +
            '<div class="main-msg">Cannot connect to Google Sheets</div>' +
            '<div class="sub-msg">Please check your internet connection</div>' +
        '</div>';
    }
    library = [];
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

function updateCategoryCounts() {
    var counts = { all: library.length, standards: 0, methods: 0, experience: 0 };
    var deptCounts = { hull: 0, piping: 0, electrical: 0, outfitting: 0, others: 0 };
    
    library.forEach(function(doc) {
        var cat = doc.category || 'others';
        if (cat === 'standards' || cat === 'tiêu chuẩn' || cat === 'Rules & Standards') counts.standards++;
        else if (cat === 'methods' || cat === 'phương pháp' || cat === 'Methods') counts.methods++;
        else if (cat === 'experience' || cat === 'kinh nghiệm' || cat === 'Experience') counts.experience++;
        
        var dept = doc.department || 'others';
        if (dept === 'hull' || dept === 'vỏ') deptCounts.hull++;
        else if (dept === 'piping' || dept === 'ống') deptCounts.piping++;
        else if (dept === 'electrical' || dept === 'điện') deptCounts.electrical++;
        else if (dept === 'outfitting' || dept === 'kết cấu phụ') deptCounts.outfitting++;
        else deptCounts.others++;
    });
    
    document.getElementById('countAll').textContent = counts.all;
    document.getElementById('countStandards').textContent = counts.standards;
    document.getElementById('countMethods').textContent = counts.methods;
    document.getElementById('countExperience').textContent = counts.experience;
    document.getElementById('countHull').textContent = deptCounts.hull;
    document.getElementById('countPiping').textContent = deptCounts.piping;
    document.getElementById('countElectrical').textContent = deptCounts.electrical;
    document.getElementById('countOutfitting').textContent = deptCounts.outfitting;
    document.getElementById('countOthers').textContent = deptCounts.others;
}

// ==================== CATEGORY FILTERS ====================
function filterByCategory(category) {
    currentFilter = category;
    currentDeptFilter = null;
    var catEls = document.querySelectorAll('.category-item[data-category]');
    for (var i = 0; i < catEls.length; i++) catEls[i].classList.remove('active');
    var deptEls = document.querySelectorAll('.category-item[data-dept]');
    for (var j = 0; j < deptEls.length; j++) deptEls[j].classList.remove('active');
    var el = document.querySelector('.category-item[data-category="' + category + '"]');
    if (el) el.classList.add('active');
    applyFilters();
}

function filterByDepartment(department) {
    currentDeptFilter = department;
    var deptEls = document.querySelectorAll('.category-item[data-dept]');
    for (var i = 0; i < deptEls.length; i++) deptEls[i].classList.remove('active');
    var catEls = document.querySelectorAll('.category-item[data-category]');
    for (var j = 0; j < catEls.length; j++) catEls[j].classList.remove('active');
    var el = document.querySelector('.category-item[data-dept="' + department + '"]');
    if (el) el.classList.add('active');
    applyFilters();
}

function applyFilters() {
    var query = document.getElementById('searchQuery').value.trim();
    var filtered = library.slice();
    
    if (currentFilter !== 'all') {
        var catMap = {
            'standards': ['standards', 'tiêu chuẩn', 'standard', 'rules'],
            'methods': ['methods', 'phương pháp', 'method'],
            'experience': ['experience', 'kinh nghiệm', 'experience']
        };
        var keywords = catMap[currentFilter] || [];
        filtered = filtered.filter(function(doc) {
            var cat = (doc.category || '').toLowerCase();
            for (var i = 0; i < keywords.length; i++) {
                if (cat.indexOf(keywords[i]) !== -1) return true;
            }
            return false;
        });
    }
    
    if (currentDeptFilter) {
        var deptMap = {
            'hull': ['hull', 'vỏ'],
            'piping': ['piping', 'ống'],
            'electrical': ['electrical', 'điện'],
            'outfitting': ['outfitting', 'kết cấu phụ'],
            'others': ['others', 'khác']
        };
        var deptKeywords = deptMap[currentDeptFilter] || [];
        filtered = filtered.filter(function(doc) {
            var dept = (doc.department || '').toLowerCase();
            for (var i = 0; i < deptKeywords.length; i++) {
                if (dept.indexOf(deptKeywords[i]) !== -1) return true;
            }
            return false;
        });
    }
    
    if (query) {
        var q = query.toLowerCase();
        filtered = filtered.filter(function(doc) {
            var name = (doc.name || '').toLowerCase();
            var tags = (doc.tags || []).map(function(t) { return t.toLowerCase(); });
            if (name.indexOf(q) !== -1) return true;
            for (var i = 0; i < tags.length; i++) {
                if (tags[i].indexOf(q) !== -1) return true;
            }
            return false;
        });
    }
    
    renderLibrary(filtered);
}

// ==================== ADD DOCUMENT ====================
function addDocumentToGoogleSheets(doc) {
    return new Promise(function(resolve, reject) {
        var formData = new URLSearchParams();
        formData.append('action', 'add');
        formData.append('name', doc.name);
        formData.append('link', doc.link);
        formData.append('tags', doc.tags ? doc.tags.join(', ') : '');
        formData.append('category', doc.category || 'others');
        formData.append('department', doc.department || 'others');

        fetch(GOOGLE_SHEETS_DATA_URL, {
            method: 'POST',
            mode: 'no-cors',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: formData.toString()
        }).then(function(response) {
            resolve(true);
        }).catch(function(error) {
            console.error('Add document error:', error);
            reject(error);
        });
    });
}

function addDocument() {
    var nameInput = document.getElementById('newDocName');
    var linkInput = document.getElementById('newDocLink');
    var tagsInput = document.getElementById('newDocTags');
    var categorySelect = document.getElementById('newDocCategory');
    var departmentSelect = document.getElementById('newDocDepartment');
    
    if (!nameInput || !linkInput || !tagsInput || !categorySelect || !departmentSelect) {
        return alert('⚠️ Error: Input fields not found');
    }
    
    var name = nameInput.value.trim();
    var link = linkInput.value.trim();
    var tags = tagsInput.value.trim().split(',').map(function(t) { return t.trim(); }).filter(function(t) { return t; });
    var category = categorySelect.value;
    var department = departmentSelect.value;
    
    if (!name) return alert('⚠️ Please enter document name');
    if (!link) return alert('⚠️ Please enter Drive link or description');
    
    var exists = library.some(function(doc) { 
        return doc.name.toLowerCase() === name.toLowerCase(); 
    });
    if (exists) return alert('⚠️ Document "' + name + '" already exists in library');
    
    var newDoc = { 
        name: name, 
        link: link, 
        tags: tags, 
        category: category, 
        department: department 
    };
    
    var addBtn = document.querySelector('#addForm .btn-primary');
    var originalText = '';
    if (addBtn) {
        originalText = addBtn.textContent;
        addBtn.textContent = '⏳ Adding...';
        addBtn.disabled = true;
    }
    
    log('📤 Adding document: "' + name + '"...', 'system');
    
    addDocumentToGoogleSheets(newDoc).then(function() {
        log('✅ Document "' + name + '" submitted successfully', 'system');
        updateSyncStatus('success', 'Added "' + name + '"');
        
        nameInput.value = '';
        linkInput.value = '';
        tagsInput.value = '';
        
        setTimeout(function() {
            log('🔄 Syncing with cloud...', 'system');
            updateSyncStatus('syncing', 'Refreshing data...');
            
            syncWithGoogleSheets(function(updatedLibrary) {
                if (updatedLibrary && updatedLibrary.length > 0) {
                    log('✅ Loaded ' + updatedLibrary.length + ' documents', 'system');
                    var found = updatedLibrary.some(function(doc) {
                        return doc.name.toLowerCase() === name.toLowerCase();
                    });
                    if (found) {
                        log('✅ Document "' + name + '" is now in the library', 'system');
                    } else {
                        log('⚠️ Document "' + name + '" not found. Try refreshing manually.', 'system');
                    }
                }
                
                if (addBtn) {
                    addBtn.textContent = originalText || '➕ Add';
                    addBtn.disabled = false;
                }
            });
        }, 1500);
        
    }).catch(function(error) {
        console.error('Add document error:', error);
        alert('❌ Failed to submit document. Please check your connection and try again.');
        log('⚠️ Failed to submit document: ' + error.message, 'system');
        
        if (addBtn) {
            addBtn.textContent = originalText || '➕ Add';
            addBtn.disabled = false;
        }
    });
}

function toggleAddForm() {
    isAddFormVisible = !isAddFormVisible;
    var form = document.getElementById('addForm');
    if (form) {
        form.style.display = isAddFormVisible ? 'block' : 'none';
        if (isAddFormVisible) {
            document.getElementById('newDocName').focus();
        }
    }
}

// ==================== DELETE DOCUMENT ====================
function showDeletePassword(index) {
    deleteTargetIndex = index;
    var doc = library[index];
    if (!doc) return alert('⚠️ Document not found');
    
    var passwordModal = document.createElement('div');
    passwordModal.id = 'passwordModal';
    passwordModal.style.cssText = 'position: fixed; inset: 0; background: rgba(0,0,0,0.85); backdrop-filter: blur(10px); display: flex; justify-content: center; align-items: center; z-index: 2000; animation: fadeIn 0.3s ease;';
    passwordModal.innerHTML = 
        '<div style="background: rgba(20,27,43,0.98); border-radius: 20px; border: 1px solid rgba(255,255,255,0.08); max-width: 400px; width: 90%; padding: 30px; box-shadow: 0 30px 60px rgba(0,0,0,0.8);">' +
            '<div style="text-align: center; margin-bottom: 20px;">' +
                '<span style="font-size: 40px;">🔒</span>' +
                '<h3 style="color: #fff; margin: 10px 0 5px 0; font-weight: 700;">Confirm Deletion</h3>' +
                '<p style="color: rgba(255,255,255,0.6); font-size: 13px;">You are deleting: <strong style="color: #ff7675;">"' + doc.name + '"</strong></p>' +
            '</div>' +
            '<input id="deletePasswordInput" type="password" placeholder="Enter password..." ' +
                   'style="width: 100%; height: 44px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; color: #fff; font-size: 15px; padding: 0 14px; outline: none; margin-bottom: 15px;">' +
            '<div style="display: flex; gap: 10px;">' +
                '<button onclick="closePasswordModal()" style="flex: 1; height: 40px; border: none; border-radius: 10px; background: rgba(255,255,255,0.1); color: #fff; font-weight: 600; cursor: pointer;">Cancel</button>' +
                '<button onclick="confirmDeleteWithPassword()" style="flex: 1; height: 40px; border: none; border-radius: 10px; background: linear-gradient(135deg, #d63031, #ff7675); color: #fff; font-weight: 600; cursor: pointer;">Confirm</button>' +
            '</div>' +
            '<div id="passwordError" style="color: #ff7675; font-size: 12px; margin-top: 10px; text-align: center; display: none;">❌ Incorrect password!</div>' +
        '</div>';
    document.body.appendChild(passwordModal);
    setTimeout(function() { 
        var input = document.getElementById('deletePasswordInput'); 
        if (input) input.focus(); 
    }, 200);
}

function closePasswordModal() {
    var modal = document.getElementById('passwordModal');
    if (modal) modal.remove();
    deleteTargetIndex = null;
}

function deleteDocumentFromGoogleSheets(index, password) {
    var formData = new URLSearchParams();
    formData.append('action', 'delete');
    formData.append('index', index);
    formData.append('password', password);

    return fetch(GOOGLE_SHEETS_DATA_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: formData
    }).then(function() {
        return true;
    }).catch(function(error) {
        console.error('Delete document via Form POST error:', error);
        throw error;
    });
}

function confirmDeleteWithPassword() {
    var passwordInput = document.getElementById('deletePasswordInput');
    var password = passwordInput ? passwordInput.value.trim() : '';
    
    if (deleteTargetIndex !== null && deleteTargetIndex < library.length) {
        var doc = library[deleteTargetIndex];
        deleteDocumentFromGoogleSheets(deleteTargetIndex, password).then(function() {
            library.splice(deleteTargetIndex, 1);
            renderLibrary();
            updateCategoryCounts();
            log('🗑️ Deleted: ' + doc.name, 'system');
            closePasswordModal();
            updateSyncStatus('success', 'Deleted: ' + doc.name);
            setTimeout(function() {
                syncWithGoogleSheets();
            }, 1000);
        }).catch(function(error) {
            console.error('Delete error:', error);
            alert('❌ Failed to delete document from cloud.');
            closePasswordModal();
        });
    } else {
        alert('⚠️ Error: Document not found');
        closePasswordModal();
    }
}

// ==================== LIBRARY UI FUNCTIONS ====================
function renderLibrary(filteredList) {
    var list = document.getElementById('libraryList');
    if (!list) return;
    var docs = filteredList || library;
    if (docs.length === 0) { 
        list.innerHTML = '<div style="text-align: center; color: rgba(255,255,255,0.4); padding: 40px 0;">' +
            '<div style="font-size: 40px; margin-bottom: 10px;">📭</div>' +
            '<div>No documents found</div>' +
        '</div>'; 
        return; 
    }
    var html = '';
    for (var i = 0; i < docs.length; i++) {
        var doc = docs[i];
        var originalIndex = library.indexOf(doc);
        var tagsHtml = '';
        if (doc.tags && doc.tags.length > 0) {
            tagsHtml = '<div class="doc-tags">';
            for (var j = 0; j < doc.tags.length; j++) {
                tagsHtml += '<span class="doc-tag">#' + doc.tags[j] + '</span>';
            }
            tagsHtml += '</div>';
        }
        var categoryLabel = doc.category || 'Others';
        var deptLabel = doc.department || 'Others';
        html += '<div class="doc-item">' +
            '<span class="doc-icon">📄</span>' +
            '<div class="doc-info">' +
                '<div class="doc-name">' + doc.name + '</div>' +
                '<div class="doc-meta">' + categoryLabel + ' • ' + deptLabel + '</div>' +
                tagsHtml +
            '</div>' +
            '<div class="doc-actions">' +
                '<button class="btn-open" onclick="openDocument(' + originalIndex + ')">📂 Open</button>' +
                '<button class="btn-delete" onclick="showDeletePassword(' + originalIndex + ')">✕</button>' +
            '</div>' +
        '</div>';
    }
    list.innerHTML = html;
}

function openDocument(index) {
    var doc = library[index];
    if (doc && doc.link) {
        if (doc.link.indexOf('http://') === 0 || doc.link.indexOf('https://') === 0) {
            window.open(doc.link, '_blank');
        } else {
            log('📄 Info: ' + doc.link, 'system');
        }
        log('📂 Opening: ' + doc.name, 'system');
    } else {
        alert('⚠️ Document not found or invalid link');
    }
}

function openLibrary() {
    var modal = document.getElementById('libraryModal');
    if (modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
        currentFilter = 'all';
        currentDeptFilter = null;
        var allEls = document.querySelectorAll('.category-item');
        for (var i = 0; i < allEls.length; i++) allEls[i].classList.remove('active');
        var allCat = document.querySelector('.category-item[data-category="all"]');
        if (allCat) allCat.classList.add('active');
        document.getElementById('searchQuery').value = '';
        document.getElementById('searchResults').style.display = 'none';
        renderLibrary();
        updateCategoryCounts();
        log("📚 Library opened", 'system');
        syncWithGoogleSheets();
    }
}

function closeLibrary() {
    var modal = document.getElementById('libraryModal');
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
        closePasswordModal();
        if (isAddFormVisible) toggleAddForm();
    }
}

// ==================== SEARCH FUNCTIONS ====================
function searchDocuments() {
    applyFilters();
}

function performSmartSearch(query) {
    var q = query.toLowerCase().trim();
    var words = q.split(/\s+/);
    var scored = library.map(function(doc) {
        var score = 0;
        var docName = doc.name.toLowerCase();
        var docTags = doc.tags ? doc.tags.map(function(t) { return t.toLowerCase(); }) : [];
        if (docName === q) score += 100;
        if (docName.indexOf(q) !== -1) score += 50;
        for (var i = 0; i < words.length; i++) {
            if (docName.indexOf(words[i]) !== -1) score += 20;
            for (var j = 0; j < docTags.length; j++) {
                if (docTags[j].indexOf(words[i]) !== -1 || words[i].indexOf(docTags[j]) !== -1) score += 30;
            }
        }
        return { doc: doc, score: score };
    });
    var filtered = scored.filter(function(item) { return item.score > 0; });
    filtered.sort(function(a, b) { return b.score - a.score; });
    return filtered.map(function(item) { return item.doc; });
}

// ==================== VOICE NLP PROCESSING ====================
function processFullVoiceNLP(t) {
    if (!t || t.trim().length < 2) return;
    
    // Chặn xử lý cùng lúc
    if (isProcessingVoice) {
        console.log("Voice processing already in progress, ignoring:", t);
        return;
    }
    
    isProcessingVoice = true;

    try {
        const normalizedText = t
            .toLowerCase()
            .replace(/\s+/g, ' ')
            .trim();

        const now = Date.now();

        // Chặn cùng một câu được SpeechRecognition
        // trả về nhiều lần trong khoảng 3 giây
        if (
            normalizedText === lastProcessedVoiceText &&
            (now - lastProcessedVoiceTime) < 3000
        ) {
            console.log("Duplicate voice command ignored:", normalizedText);
            return;
        }

        lastProcessedVoiceText = normalizedText;
        lastProcessedVoiceTime = now;

        // reset thời gian chờ 30 giây
        resetVoiceIdleTimer();

        log("👤 " + t, 'user');

        var str = normalizedText;
        var updatedCount = 0;
        
        function cleanNumberString(numStr) {
            if (!numStr) return '0';
            var cleaned = numStr.replace(/[.,](\d{3})/g, '$1');
            cleaned = cleaned.replace(/,/g, '.');
            return cleaned;
        }
        
        // Lớp 1: Trích xuất số với từ khóa
        function extractNumber(text, keywords) {
            if (!Array.isArray(keywords)) keywords = [keywords];
            for (var k = 0; k < keywords.length; k++) {
                var kw = keywords[k];
                var patterns = [
                    new RegExp(kw + '\\s*(?:là|:)?\\s*([\\d.,]+)', 'i'),
                    new RegExp(kw + '\\s+([\\d.,]+)', 'i'),
                    new RegExp('([\\d.,]+)\\s*' + kw, 'i'),
                    new RegExp(kw + '\\s*[:=]\\s*([\\d.,]+)', 'i')
                ];
                for (var i = 0; i < patterns.length; i++) {
                    var match = text.match(patterns[i]);
                    if (match) {
                        var num = match[1] || match[2];
                        if (num) return cleanNumberString(num);
                    }
                }
            }
            return null;
        }
        
        // Lớp 2: Chuẩn hóa và phát hiện từ khóa với ngữ cảnh
        function detectDimension(text) {
            var result = { length: null, width: null, height: null };
            
            // Ưu tiên 1: Phát hiện "cao/độ cao/chiều cao" - THAY THẾ CHO "độ dày"
            if (text.includes('chiều cao') || text.includes('độ cao') || text.includes('cao')) {
                var val = extractNumber(text, ['chiều cao', 'độ cao', 'cao', 'height']);
                if (val !== null) {
                    result.height = val;
                    log("🔍 Phát hiện 'cao' → Height = " + val, 'system');
                }
            }
            
            // Ưu tiên 2: Phát hiện "độ dài" - CHỈ KHI KHÔNG CÓ "chiều cao"
            if (!text.includes('chiều cao') && !text.includes('độ cao') && (text.includes('độ dài') || text.includes('độ dài là'))) {
                var val = extractNumber(text, ['độ dài', 'độ dài là']);
                if (val !== null) {
                    result.length = val;
                    log("🔍 Phát hiện 'độ dài' → Length = " + val, 'system');
                }
            }
            
            // Ưu tiên 3: "chiều dài"
            if (result.length === null && (text.includes('chiều dài') || text.includes('chiều dài là'))) {
                var val = extractNumber(text, ['chiều dài', 'chiều dài là']);
                if (val !== null) {
                    result.length = val;
                    log("🔍 Phát hiện 'chiều dài' → Length = " + val, 'system');
                }
            }
            
            // Ưu tiên 4: "chiều rộng"
            if (result.width === null && (text.includes('chiều rộng') || text.includes('chiều rộng là'))) {
                var val = extractNumber(text, ['chiều rộng', 'chiều rộng là']);
                if (val !== null) {
                    result.width = val;
                    log("🔍 Phát hiện 'chiều rộng' → Width = " + val, 'system');
                }
            }
            
            // Ưu tiên 5: Tìm "dài" nếu chưa có
            if (result.length === null) {
                var val = extractNumber(text, ['dài', 'length']);
                if (val !== null) {
                    result.length = val;
                    log("🔍 Phát hiện 'dài' → Length = " + val, 'system');
                }
            }
            
            // Ưu tiên 6: Tìm "rộng" nếu chưa có
            if (result.width === null) {
                var val = extractNumber(text, ['rộng', 'width']);
                if (val !== null) {
                    result.width = val;
                    log("🔍 Phát hiện 'rộng' → Width = " + val, 'system');
                }
            }
            
            return result;
        }
        
        // Lớp 3: Xác định theo ngữ cảnh (Context)
        function applyContext(dim, text) {
            // Nếu có cả 3 thông số, không cần xử lý thêm
            if (dim.length !== null && dim.width !== null && dim.height !== null) {
                return dim;
            }
            
            // Nếu chỉ có 2 thông số, thử suy luận thông số còn lại
            var numbers = text.match(/\b\d+[.,]?\d*\b/g);
            if (numbers && numbers.length > 0) {
                var numValues = numbers.map(function(n) { return parseFloat(n.replace(',', '.')); });
                
                // Nếu thiếu length và có số lớn nhất
                if (dim.length === null && numValues.length > 0) {
                    var maxVal = Math.max.apply(null, numValues);
                    if (dim.width !== maxVal && dim.height !== maxVal) {
                        dim.length = maxVal;
                        log("🔍 Suy luận Length = " + maxVal + " (số lớn nhất)", 'system');
                    }
                }
            }
            
            return dim;
        }
        
        // ===== XỬ LÝ TÌM KIẾM TRONG LIBRARY =====
        if (str.match(/search\s+(?:for\s+)?(.+)/i) || str.match(/tìm\s+(?:kiếm\s+)?(.+)/i)) {
            var searchQuery = str.replace(/search\s+(?:for\s+)?/i, '').replace(/tìm\s+(?:kiếm\s+)?/i, '').trim();
            if (searchQuery && searchQuery.length > 1) {
                document.getElementById('searchQuery').value = searchQuery;
                var results = performSmartSearch(searchQuery);
                if (results.length > 0) { 
                    var bestMatch = results[0]; 
                    if (bestMatch && bestMatch.link) { 
                        if (bestMatch.link.indexOf('http://') === 0 || bestMatch.link.indexOf('https://') === 0) {
                            window.open(bestMatch.link, '_blank'); 
                        }
                    } 
                    searchDocuments(); 
                } else {
                    searchDocuments();
                }
                var modal = document.getElementById('libraryModal');
                if (!modal.classList.contains('active')) openLibrary();
            }
            return;
        }

        // ===== XỬ LÝ LƯU FILE =====
        if (str.match(/save\s*(?:file|document)?/i) || str.match(/export\s*file/i) || str.match(/lưu\s*(?:file|tài liệu)?/i)) { 
            autoExportMAC();
            return; 
        }

        // ===== LỚP 1 + 2 + 3: XỬ LÝ THÔNG SỐ =====
        var dim = detectDimension(str);
        dim = applyContext(dim, str);
        
        var len = dim.length;
        var wid = dim.width;
        var hei = dim.height;
        
        // Cập nhật giá trị
        if (len !== null) { 
            document.getElementById("dx").value = len; 
            updatedCount++; 
            log("📏 Chiều dài: " + len + "mm", 'system');
        }
        if (wid !== null) { 
            document.getElementById("dy").value = wid; 
            updatedCount++; 
            log("📐 Chiều rộng: " + wid + "mm", 'system');
        }
        if (hei !== null) { 
            document.getElementById("dz").value = hei; 
            updatedCount++; 
            log("📏 Chiều cao: " + hei + "mm", 'system');
        }

        // ===== XỬ LÝ POSITION =====
        var posX = null, posY = null, posZ = null;
        
        var posKeywordsX = ['vị trí x', 'position x', 'pos x', 'x =', 'x là', 'x='];
        var valX = extractNumber(str, posKeywordsX);
        if (valX !== null) { posX = valX; }
        
        var posKeywordsY = ['vị trí y', 'position y', 'pos y', 'y =', 'y là', 'y='];
        var valY = extractNumber(str, posKeywordsY);
        if (valY !== null) { posY = valY; }
        
        var posKeywordsZ = ['vị trí z', 'position z', 'pos z', 'z =', 'z là', 'z='];
        var valZ = extractNumber(str, posKeywordsZ);
        if (valZ !== null) { posZ = valZ; }

        if (posX !== null) { 
            document.getElementById("px").value = posX; 
            updatedCount++; 
            log("📍 Vị trí X: " + posX + "mm", 'system');
        }
        if (posY !== null) { 
            document.getElementById("py").value = posY; 
            updatedCount++; 
            log("📍 Vị trí Y: " + posY + "mm", 'system');
        }
        if (posZ !== null) { 
            document.getElementById("pz").value = posZ; 
            updatedCount++; 
            log("📍 Vị trí Z: " + posZ + "mm", 'system');
        }

        // ===== XỬ LÝ CORNER RADIUS (CẬP NHẬT RIÊNG TỪNG GÓC) =====
        // Hàm hỗ trợ cho phép bắt chính xác "R1 100", "R2=200" với R viết hoa hoặc thường
        function extractRadiusValue(text, radiusKey) {
            var patterns = [
                new RegExp(radiusKey + '\\s*(?:là|:|=)\\s*([\\d.,]+)', 'i'),
                new RegExp(radiusKey + '\\s+([\\d.,]+)', 'i'),
                new RegExp(radiusKey.toLowerCase() + '\\s*(?:là|:|=)\\s*([\\d.,]+)', 'i'),
                new RegExp(radiusKey.toLowerCase() + '\\s+([\\d.,]+)', 'i')
            ];
            for (var i = 0; i < patterns.length; i++) {
                var match = text.match(patterns[i]);
                if (match) {
                    return cleanNumberString(match[1]);
                }
            }
            return null;
        }

        // R1
        var r1Val = extractRadiusValue(str, 'R1');
        if (r1Val !== null) { 
            document.getElementById("r1").value = r1Val; 
            updatedCount++; 
            log("⭕ R1: " + r1Val + "mm", 'system');
        }

        // R2
        var r2Val = extractRadiusValue(str, 'R2');
        if (r2Val !== null) { 
            document.getElementById("r2").value = r2Val; 
            updatedCount++; 
            log("⭕ R2: " + r2Val + "mm", 'system');
        }

        // R3
        var r3Val = extractRadiusValue(str, 'R3');
        if (r3Val !== null) { 
            document.getElementById("r3").value = r3Val; 
            updatedCount++; 
            log("⭕ R3: " + r3Val + "mm", 'system');
        }

        // R4
        var r4Val = extractRadiusValue(str, 'R4');
        if (r4Val !== null) { 
            document.getElementById("r4").value = r4Val; 
            updatedCount++; 
            log("⭕ R4: " + r4Val + "mm", 'system');
        }

        // Tương thích ngược: Nếu người dùng nói chung chung "corner radius 200" mà chưa có R nào được set, set đồng loạt
        var radAll = null;
        var radKeywords = ['corner radius', 'radius', 'bán kính', 'bo góc'];
        var valRad = extractNumber(str, radKeywords);
        if (valRad !== null) { 
            radAll = valRad;
        }
        
        // ĐÃ SỬA: Chỉ set đồng loạt nếu CẢ 4 GIÁ TRỊ R1, R2, R3, R4 ĐỀU CHƯA BỊ THAY ĐỔI
        if (radAll !== null && r1Val === null && r2Val === null && r3Val === null && r4Val === null) { 
            document.getElementById("r1").value = radAll; 
            document.getElementById("r2").value = radAll; 
            document.getElementById("r3").value = radAll; 
            document.getElementById("r4").value = radAll; 
            updatedCount++; 
            log("⭕ Corner radius: " + radAll + "mm (đồng loạt)", 'system');
        }

        // ===== XỬ LÝ ORIENTATION =====
        if (str.match(/orientation\s*x/i) || str.match(/axis\s*x/i) || str.match(/trục\s*x/i)) { 
            setOri('X'); 
            updatedCount++; 
            log("🔄 Orientation: X", 'system');
        }
        else if (str.match(/orientation\s*y/i) || str.match(/axis\s*y/i) || str.match(/trục\s*y/i)) { 
            setOri('Y'); 
            updatedCount++; 
            log("🔄 Orientation: Y", 'system');
        }
        else if (str.match(/orientation\s*z/i) || str.match(/axis\s*z/i) || str.match(/trục\s*z/i)) { 
            setOri('Z'); 
            updatedCount++; 
            log("🔄 Orientation: Z", 'system');
        }

        // ===== THÔNG BÁO KẾT QUẢ =====
        if (updatedCount > 0) {
            draw();
            var msg = "✅ Đã cập nhật " + updatedCount + " thông số!";
            log(msg, 'assistant');

            // Tự động xuất MAC nếu đủ L/W/T
            const L = parseInputValue("dx");
            const W = parseInputValue("dy");
            const T = parseInputValue("dz");

            if (L > 0 && W > 0 && T > 0) {
                // Export đúng 1 lần - kiểm tra autoExportLock
                if (!autoExportLock) {
                    autoExportMAC();
                }
            }
        } else {
            var msg = "⚠️ Không nhận diện được thông số. Vui lòng nói rõ:\n" +
                      "- Chiều dài: [số]\n" +
                      "- Chiều rộng: [số]\n" +
                      "- Chiều cao: [số]\n" +
                      "- Vị trí X/Y/Z: [số]\n" +
                      "- R1 / R2 / R3 / R4: [số]";
            log(msg, 'assistant');
        }
    } finally {
        isProcessingVoice = false;
    }
}

// ==================== VOICE IDLE TIMER ====================

function resetVoiceIdleTimer() {
    if (voiceIdleTimer) {
        clearTimeout(voiceIdleTimer);
        voiceIdleTimer = null;
    }

    if (!isListening) return;

    voiceIdleTimer = setTimeout(function () {
        if (!isListening) return;

        console.log("Voice idle timeout - stopping.");

        // Tắt Voice im lặng, không phát âm thanh
        stopVoice(true);
    }, VOICE_IDLE_TIMEOUT);
}

// ==================== VOICE RECOGNITION ====================
function initVoice() {
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { 
        log("❌ Browser does not support Voice", 'system'); 
        return null; 
    }
    
    var r = new SR();
    r.lang = "vi-VN"; 
    r.continuous = true; 
    r.interimResults = false; // CHỈ xử lý final result
    r.maxAlternatives = 5;
    
    r.onstart = function() {
        isListening = true;
        recognitionRestartAttempts = 0;
        document.getElementById('voiceBtn').classList.add('listening');
        document.getElementById('chatStatus').textContent = '● Listening...';
        document.getElementById('chatStatus').classList.add('waiting');
        
        // Chỉ reset autoExportLock khi bắt đầu phiên Voice MỚI
        if (!voiceSessionStarted) {
            autoExportLock = false;
            hasAutoTriggeredSave = false;
        }

        // Chỉ nói lời chào MỘT LẦN cho mỗi phiên Voice
        if (!voiceSessionStarted) {
            voiceSessionStarted = true;
            log("🎤 Voice activated. Speak your command.", 'system');
            const greeting = "Xin chào, bạn hãy đọc các thông số kích thước nhé";
            log("🤖 " + greeting, 'assistant');
            speak(greeting);
        }

        // Bắt đầu bộ đếm 30 giây
        resetVoiceIdleTimer();
    };
    
    r.onend = function() {
        // Nếu không còn lắng nghe thì thoát
        if (!isListening) {
            return;
        }

        // Chỉ restart recognition, KHÔNG reset voiceSessionStarted
        // KHÔNG nói greeting lại
        try {
            setTimeout(function() {
                if (!isListening || !recognition) {
                    return;
                }
                try {
                    recognition.start();
                } catch (e) {
                    console.log("Recognition restart skipped:", e);
                    // Nếu không restart được, tắt Voice
                    stopVoice(true);
                }
            }, 300);
        } catch (e) {
            console.log("Restart error:", e);
            stopVoice(true);
        }
    };
    
    r.onerror = function(e) {
        console.log('Speech recognition error:', e.error);
        
        if (e.error === 'not-allowed') { 
            log("❌ Microphone access denied", 'system'); 
            stopVoice(true); 
        } else if (e.error === 'no-speech') {
            // Không làm gì, tiếp tục chờ
            return;
        } else if (e.error === 'audio-capture') {
            log("⚠️ No microphone found", 'system');
            stopVoice(true);
        } else if (e.error === 'network') {
            log("⚠️ Network error, retrying...", 'system');
            if (isListening) {
                setTimeout(function() {
                    try {
                        if (recognition) recognition.start();
                    } catch(e) {}
                }, 1000);
            }
        } else {
            log("⚠️ Voice error: " + e.error, 'system');
            // Với lỗi khác, thử restart
            if (isListening && recognition) {
                try {
                    recognition.start();
                } catch(e) {
                    console.log("Restart after error failed:", e);
                }
            }
        }
    };
    
    r.onresult = function(e) {
        resetVoiceIdleTimer();

        let finalText = '';

        for (let i = e.resultIndex; i < e.results.length; i++) {
            // Chỉ xử lý final results
            if (!e.results[i].isFinal) continue;
            
            let bestTranscript = '';
            let bestScore = -1;

            for (let j = 0; j < e.results[i].length; j++) {
                const alt = e.results[i][j].transcript.trim();
                const confidence = e.results[i][j].confidence || 0;

                let score = confidence;

                const hasVietnamese = /[áàảãạăắằẳẵâấầẩẫậđéèẻẽẹêếềểễệíìỉĩịóòỏõọôốồổỗộơớờởỡợúùủũụưứừửữựýỳỷỹỵ]/i.test(alt);

                if (hasVietnamese) {
                    score += 0.3;
                }

                if (alt.includes("cao") || alt.includes("chiều cao")) {
                    score += 0.5;
                }

                if (score > bestScore) {
                    bestScore = score;
                    bestTranscript = alt;
                }
            }

            if (bestTranscript) {
                finalText += bestTranscript + " ";
            }
        }

        finalText = finalText.trim();

        if (!finalText) {
            return;
        }

        // Xử lý kết quả final
        processFullVoiceNLP(finalText);

        // Reset thời gian chờ
        resetVoiceIdleTimer();
    };
    
    return r;
}

function voice() {
    if (isListening) {
        stopVoice(false);
        voiceSessionStarted = false;
        return;
    }

    if (!recognition) {
        recognition = initVoice();
        if (!recognition) {
            alert("❌ Your browser does not support voice recognition. Please use Chrome or Edge.");
            return;
        }
    }

    recognitionRestartAttempts = 0;
    isListening = true;

    // Bắt đầu một phiên Voice mới
    voiceSessionStarted = false;

    // reset duplicate protection
    lastProcessedVoiceText = '';
    lastProcessedVoiceTime = 0;

    // reset processing flag
    isProcessingVoice = false;

    resetVoiceIdleTimer();

    try {
        recognition.start();
    } catch (e) {
        console.log("Start error:", e);
        if (e.name === "InvalidStateError") {
            try {
                recognition.stop();
                setTimeout(function() {
                    if (recognition && isListening) {
                        try {
                            recognition.start();
                        } catch (e2) {
                            console.log("Retry start error:", e2);
                            stopVoice(true);
                        }
                    }
                }, 300);
            } catch (e2) {
                stopVoice(true);
            }
        } else {
            stopVoice(true);
        }
    }
}

function stopVoice(silent) {
    isListening = false;
    recognitionRestartAttempts = 0;

    if (voiceIdleTimer) {
        clearTimeout(voiceIdleTimer);
        voiceIdleTimer = null;
    }

    if (recognition) {
        try {
            recognition.stop();
        } catch (e) {
            console.log("Stop error:", e);
        }
    }

    const voiceBtn = document.getElementById('voiceBtn');
    if (voiceBtn) {
        voiceBtn.classList.remove('listening');
    }

    const chatStatus = document.getElementById('chatStatus');
    if (chatStatus) {
        chatStatus.textContent = '● Ready';
        chatStatus.classList.remove('waiting');
    }

    // Chỉ log khi người dùng chủ động Stop
    if (!silent) {
        log("🔇 Stopped listening", 'system');
    }
}

// ==================== LIBRARY VOICE SEARCH ====================
function voiceSearchLibrary() {
    if (isLibraryVoiceListening) {
        stopLibraryVoice();
        return;
    }
    
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
        log("❌ Browser doesn't support Voice", 'system');
        alert("❌ Browser doesn't support Voice");
        return;
    }
    
    if (!libraryVoiceRecognition) {
        libraryVoiceRecognition = new SR();
        libraryVoiceRecognition.lang = "vi-VN";
        libraryVoiceRecognition.continuous = false;
        libraryVoiceRecognition.interimResults = true;
        libraryVoiceRecognition.maxAlternatives = 5;
        
        libraryVoiceRecognition.onstart = function() {
            isLibraryVoiceListening = true;
            document.getElementById('voiceSearchBtn').classList.add('listening');
            document.getElementById('voiceSearchBtn').innerHTML = '<span class="btn-icon">⏹</span>';
            log("🎤 Listening for search query...", 'system');
            
            var greeting = "Bạn muốn tìm kiếm điều gì?";
            log("🤖 " + greeting, 'assistant');
            speak(greeting);
            
            setTimeout(function() {
                if (isLibraryVoiceListening) {
                    var searchQuery = document.getElementById('searchQuery').value.trim();
                    if (!searchQuery) {
                        log("⏰ Hết thời gian chờ, vui lòng thử lại", 'system');
                        stopLibraryVoice();
                    }
                }
            }, 10000);
        };
        
        libraryVoiceRecognition.onend = function() {
            if (isLibraryVoiceListening) {
                var searchQuery = document.getElementById('searchQuery').value.trim();
                if (!searchQuery) {
                    log("⏰ Không nhận được giọng nói, vui lòng thử lại", 'system');
                }
                document.getElementById('voiceSearchBtn').classList.remove('listening');
                document.getElementById('voiceSearchBtn').innerHTML = '<span class="btn-icon">🎤</span>';
                isLibraryVoiceListening = false;
            }
        };
        
        libraryVoiceRecognition.onerror = function(e) {
            console.log('Library voice error:', e.error);
            if (e.error === 'not-allowed') {
                log("❌ Microphone access denied for search", 'system');
            } else if (e.error === 'no-speech') {
                log("⏰ Không nghe thấy giọng nói, vui lòng thử lại", 'system');
            } else {
                log("⚠️ Voice search error: " + e.error, 'system');
            }
            stopLibraryVoice();
        };
        
        libraryVoiceRecognition.onresult = function(e) {
            var transcript = '';
            var isVietnamese = false;
            
            for (var i = e.resultIndex; i < e.results.length; i++) {
                var bestTranscript = '';
                var bestScore = -1;
                
                for (var j = 0; j < e.results[i].length; j++) {
                    var alt = e.results[i][j].transcript.trim();
                    var confidence = e.results[i][j].confidence || 0;
                    var hasVietnamese = /[áàảãạăắằẳẵâấầẩẫậđéèẻẽẹêếềểễệíìỉĩịóòỏõọôốồổỗộơớờởỡợúùủũụưứừửữựýỳỷỹỵ]/i.test(alt);
                    var score = confidence + (hasVietnamese ? 0.3 : 0);
                    
                    if (score > bestScore) {
                        bestScore = score;
                        bestTranscript = alt;
                        if (hasVietnamese) isVietnamese = true;
                    }
                }
                
                transcript += bestTranscript;
                
                if (e.results[i].isFinal) {
                    handleLibraryVoiceResult(transcript, isVietnamese);
                    stopLibraryVoice();
                    var successMsg = isVietnamese ? 
                        '✅ Đã tìm thấy kết quả cho: "' + transcript + '"' : 
                        '✅ Found results for: "' + transcript + '"';
                    log(successMsg, 'assistant');
                    speak(successMsg);
                }
            }
            
            if (transcript) {
                document.getElementById('searchQuery').value = transcript;
            }
        };
    }
    
    isLibraryVoiceListening = true;
    try {
        libraryVoiceRecognition.start();
        log("🎤 Đang lắng nghe... (10 giây)", 'system');
    } catch(e) {
        console.log('Library voice start error:', e);
        if (e.name === 'InvalidStateError') {
            try {
                libraryVoiceRecognition.stop();
                setTimeout(function() {
                    try {
                        if (libraryVoiceRecognition && isLibraryVoiceListening) {
                            libraryVoiceRecognition.start();
                            log("🎤 Đang lắng nghe... (10 giây)", 'system');
                        }
                    } catch(e2) {
                        console.log('Retry library voice error:', e2);
                        isLibraryVoiceListening = false;
                        document.getElementById('voiceSearchBtn').classList.remove('listening');
                        document.getElementById('voiceSearchBtn').innerHTML = '<span class="btn-icon">🎤</span>';
                        log("⚠️ Không thể khởi động voice search", 'system');
                    }
                }, 500);
            } catch(e2) {
                console.log('Stop library voice error:', e2);
                isLibraryVoiceListening = false;
            }
        } else {
            isLibraryVoiceListening = false;
            document.getElementById('voiceSearchBtn').classList.remove('listening');
            document.getElementById('voiceSearchBtn').innerHTML = '<span class="btn-icon">🎤</span>';
            log("⚠️ Không thể khởi động voice search", 'system');
        }
    }
}

function handleLibraryVoiceResult(transcript, isVietnamese) {
    document.getElementById('searchQuery').value = transcript;
    applyFilters();
    
    var lang = isVietnamese ? '🔍 Tìm kiếm: "' : '🔍 Search: "';
    log(lang + transcript + '"', 'user');
    
    var results = performSmartSearch(transcript);
    if (results.length > 0) {
        var bestMatch = results[0];
        if (bestMatch && bestMatch.link) {
            if (bestMatch.link.indexOf('http://') === 0 || bestMatch.link.indexOf('https://') === 0) {
                window.open(bestMatch.link, '_blank');
                log('📂 Opening: ' + bestMatch.name, 'system');
                var successMsg = isVietnamese ? 
                    '✅ Đã mở tài liệu: ' + bestMatch.name : 
                    '✅ Opened document: ' + bestMatch.name;
                log(successMsg, 'assistant');
                speak(successMsg);
            }
        }
    } else {
        var notFound = isVietnamese ? 
            '❌ Không tìm thấy tài liệu nào phù hợp với: "' + transcript + '"' : 
            '❌ No matching documents found for: "' + transcript + '"';
        log(notFound, 'assistant');
        speak(notFound);
    }
}

function stopLibraryVoice() {
    isLibraryVoiceListening = false;
    if (libraryVoiceRecognition) {
        try { 
            libraryVoiceRecognition.stop(); 
        } catch(e) {
            console.log('Stop library voice error:', e);
        }
    }
    var btn = document.getElementById('voiceSearchBtn');
    if (btn) {
        btn.classList.remove('listening');
        btn.innerHTML = '<span class="btn-icon">🎤</span>';
    }
}

// ==================== 3D & EXPORT FUNCTIONS ====================
function saveFile() {
    var L = parseInputValue("dx");
    var W = parseInputValue("dy");
    var T = parseInputValue("dz");

    if (!(L > 0 && W > 0 && T > 0)) {
        alert("Please enter Length, Width and Height first.");
        return;
    }

    // Xuất trực tiếp với tên mặc định Import.mac, không mở dialog nhập tên
    generateAndDownloadFile("Import");
}

function generateAndDownloadFile(fileName) {
    var px = parseInputValue("px"); 
    var py = parseInputValue("py"); 
    var pz = parseInputValue("pz");
    var L = parseInputValue("dx"); 
    var W = parseInputValue("dy"); 
    var H = parseInputValue("dz");
    var r1 = parseInputValue("r1"); 
    var r2 = parseInputValue("r2"); 
    var r3 = parseInputValue("r3"); 
    var r4 = parseInputValue("r4");
    var oriStr = "ORI Y is Y and Z is Z";
    if (ORI === "X") oriStr = "ORI Y is -Z and Z is X"; 
    else if (ORI === "Y") oriStr = "ORI Y is -X and Z is Y";

    var data = 'NEW EQUIPMENT\n' +
        'USRCOG ( X ( 0 ) Y ( 0 ) Z ( 0 ) )\n' +
        'USRWCO ( X ( 0 ) Y ( 0 ) Z ( 0 ) )\n' +
        'POS X ' + px + 'mm Y ' + py + 'mm Z ' + pz + 'mm\n' +
        oriStr + '\n' +
        'BUIL false\n' +
        'DSCO unset\n' +
        'PTSP unset\n' +
        'INSC unset\n' +
        '\n' +
        'NEW EXTRUSION\n' +
        oriStr + '\n' +
        'LEVE 0 2\n' +
        'HEIG ' + H + 'mm\n' +
        '\n' +
        'NEW LOOP\n' +
        '\n' +
        'NEW VERTEX\n' +
        'FRAD ' + r1 + 'mm\n' +
        '\n' +
        'END\n' +
        'NEW VERTEX\n' +
        'POS X 0mm Y ' + W + 'mm Z 0mm\n' +
        'FRAD ' + r2 + 'mm\n' +
        '\n' +
        'END\n' +
        'NEW VERTEX\n' +
        'POS X ' + L + 'mm Y ' + W + 'mm Z 0mm\n' +
        'FRAD ' + r3 + 'mm\n' +
        '\n' +
        'END\n' +
        'NEW VERTEX\n' +
        'POS X ' + L + 'mm Y 0mm Z 0mm\n' +
        'FRAD ' + r4 + 'mm\n' +
        '\n' +
        'END\n' +
        'END\n' +
        'END\n' +
        'END';

    var blob = new Blob([data], { type: "text/plain" });

    // --- PHƯƠNG THỨC TẢI XUỐNG TỐI ƯU (KHÔNG BỊ LỖI VOICE) ---
    try {
        var a = document.createElement("a"); 
        a.href = URL.createObjectURL(blob); 
        a.download = fileName + '.mac';
        document.body.appendChild(a); 
        
        // Nếu người dùng bấm nút Export: Trình duyệt thường mở hộp thoại chọn nơi lưu (tùy cài đặt)
        // Nếu người dùng dùng Voice: Tự động tải về thư mục Downloads mặc định.
        a.click(); 
        document.body.removeChild(a);
        
        // Giải phóng bộ nhớ
        setTimeout(function() {
            URL.revokeObjectURL(a.href);
        }, 100);
        
        var successMsg = "✅ Đã xuất file " + fileName + ".mac thành công!";
        log(successMsg, 'system');
        speak("Đã xuất file thành công");
        
    } catch (e) {
        console.error("Lỗi tải file:", e);
        log("⚠️ Lỗi khi tải xuống: " + e.message, 'system');
    }
}

function setOri(o) { 
    ORI = o; 
    var btns = document.querySelectorAll(".ori-buttons button");
    for (var i = 0; i < btns.length; i++) btns[i].classList.remove("active");
    document.getElementById("o" + o.toLowerCase()).classList.add("active"); 
    document.getElementById('oriBadge').textContent = o; 
    draw(); 
}

function parseInputValue(id) {
    var raw = (document.getElementById(id).value || "").toString().trim();
    if (!raw) return 0;
    if (/^\d+[.,]\d{3}$/.test(raw)) raw = raw.replace(/[.,]/g, '');
    else raw = raw.replace(',', '.');
    return parseFloat(raw) || 0;
}

function draw() {
    c.width = c.offsetWidth; 
    c.height = c.offsetHeight || 320;
    var L = parseInputValue("dx"); 
    var W = parseInputValue("dy"); 
    var T = parseInputValue("dz");
    var posX = parseInputValue("px"); 
    var posY = parseInputValue("py"); 
    var posZ = parseInputValue("pz");
    ctx.clearRect(0, 0, c.width, c.height);
    var grad = ctx.createLinearGradient(0, 0, c.width, c.height);
    grad.addColorStop(0, '#0a0e17'); 
    grad.addColorStop(1, '#141b2b');
    ctx.fillStyle = grad; 
    ctx.fillRect(0, 0, c.width, c.height);
    drawAxis();
    if (L === 0 && W === 0 && T === 0) return;
    var maxDim = Math.max(L, W, T, 100); 
    var scale = 90 / maxDim;
    var l = L * scale; 
    var w = W * scale; 
    var t = T * scale;
    var cx = c.width / 2 + 40 + (posX * scale); 
    var cy = c.height / 2 + 20 - (posZ * scale);
    var vX, vY, vZ;
    if (ORI === "Z") { vX = l; vY = w; vZ = t; } 
    else if (ORI === "X") { vX = t; vY = w; vZ = l; } 
    else if (ORI === "Y") { vX = l; vY = t; vZ = w; }
    drawBox3D(cx, cy, vX, vY, vZ, 'L=' + L, 'W=' + W, 'H=' + T);
}

function drawAxis() {
    ctx.lineWidth = 2.5; 
    ctx.font = "bold 13px Inter, sans-serif";
    var x0 = 35, y0 = 195;
    
    ctx.strokeStyle = "#ff6b6b"; 
    ctx.fillStyle = "#ff6b6b"; 
    ctx.shadowColor = "rgba(255,107,107,0.3)"; 
    ctx.shadowBlur = 8;
    ctx.beginPath(); 
    ctx.moveTo(x0, y0); 
    ctx.lineTo(x0 + 75, y0);
    ctx.stroke(); 
    ctx.shadowBlur = 0; 
    ctx.fillText("X", x0 + 80, y0 + 4);
    
    ctx.strokeStyle = "#74b9ff"; 
    ctx.fillStyle = "#74b9ff"; 
    ctx.shadowColor = "rgba(116,185,255,0.3)"; 
    ctx.shadowBlur = 8;
    ctx.beginPath(); 
    ctx.moveTo(x0, y0); 
    ctx.lineTo(x0 + 45, y0 - 45);
    ctx.stroke(); 
    ctx.shadowBlur = 0; 
    ctx.fillText("Y", x0 + 50, y0 - 48);
    
    ctx.strokeStyle = "#55efc4"; 
    ctx.fillStyle = "#55efc4"; 
    ctx.shadowColor = "rgba(85,239,196,0.3)"; 
    ctx.shadowBlur = 8;
    ctx.beginPath(); 
    ctx.moveTo(x0, y0); 
    ctx.lineTo(x0, y0 - 70);
    ctx.stroke(); 
    ctx.shadowBlur = 0; 
    ctx.fillText("Z", x0 - 20, y0 - 75);
}

function projectISO(x, y, z, cx, cy) { 
    var kY = 0.55; 
    return { x: cx + x + y * kY, y: cy - z - y * kY }; 
}

function drawBox3D(cx, cy, d1, d2, d3, lbl1, lbl2, lbl3) {
    ctx.lineWidth = 1.8; 
    var offsetX = cx - d1 / 2; 
    var offsetY = cy + d3 / 2;
    var b0 = projectISO(0, 0, 0, offsetX, offsetY); 
    var b1 = projectISO(d1, 0, 0, offsetX, offsetY); 
    var b2 = projectISO(d1, d2, 0, offsetX, offsetY); 
    var b3 = projectISO(0, d2, 0, offsetX, offsetY);
    var t0 = projectISO(0, 0, d3, offsetX, offsetY); 
    var t1 = projectISO(d1, 0, d3, offsetX, offsetY); 
    var t2 = projectISO(d1, d2, d3, offsetX, offsetY); 
    var t3 = projectISO(0, d2, d3, offsetX, offsetY);
    ctx.shadowColor = "rgba(108,92,231,0.15)"; 
    ctx.shadowBlur = 20;
    var mainColor = '#6c5ce7'; 
    var lightColor = '#a29bfe';
    ctx.strokeStyle = mainColor; 
    ctx.fillStyle = "rgba(108,92,231,0.08)";
    ctx.beginPath(); 
    ctx.moveTo(b0.x, b0.y); 
    ctx.lineTo(b1.x, b1.y); 
    ctx.lineTo(b2.x, b2.y); 
    ctx.lineTo(b3.x, b3.y); 
    ctx.closePath(); 
    ctx.fill(); 
    ctx.stroke();
    var bEdges = [b0, b1, b2, b3]; 
    var tEdges = [t0, t1, t2, t3];
    for (var i = 0; i < 4; i++) { 
        ctx.shadowBlur = 12; 
        ctx.strokeStyle = i === 0 || i === 3 ? mainColor : lightColor; 
        ctx.globalAlpha = i === 0 || i === 3 ? 1 : 0.6; 
        ctx.beginPath(); 
        ctx.moveTo(bEdges[i].x, bEdges[i].y); 
        ctx.lineTo(tEdges[i].x, tEdges[i].y); 
        ctx.stroke(); 
        ctx.globalAlpha = 1; 
    }
    ctx.shadowBlur = 20; 
    ctx.strokeStyle = lightColor; 
    ctx.fillStyle = "rgba(162,155,254,0.06)";
    ctx.beginPath(); 
    ctx.moveTo(t0.x, t0.y); 
    ctx.lineTo(t1.x, t1.y); 
    ctx.lineTo(t2.x, t2.y); 
    ctx.lineTo(t3.x, t3.y); 
    ctx.closePath(); 
    ctx.fill(); 
    ctx.stroke();
    ctx.shadowBlur = 0; 
    ctx.strokeStyle = "rgba(162,155,254,0.3)"; 
    ctx.lineWidth = 0.5; 
    ctx.beginPath(); 
    ctx.moveTo(t0.x, t0.y); 
    ctx.lineTo(t1.x, t1.y); 
    ctx.stroke();
    ctx.shadowBlur = 0; 
    ctx.fillStyle = "rgba(255,255,255,0.8)"; 
    ctx.font = "bold 13px Inter, sans-serif";
    var c1 = projectISO(d1 / 2, 0, 0, offsetX, offsetY); 
    var c2 = projectISO(d1, d2 / 2, d3, offsetX, offsetY); 
    var c3 = projectISO(0, 0, d3 / 2, offsetX, offsetY);
    
    function drawLabel(text, x, y) {
        var metrics = ctx.measureText(text); 
        var width = metrics.width + 16; 
        var height = 26; 
        var rx = x - width/2; 
        var ry = y - height/2;
        ctx.fillStyle = "rgba(10,14,23,0.8)"; 
        ctx.shadowColor = "rgba(0,0,0,0.5)"; 
        ctx.shadowBlur = 10;
        ctx.beginPath(); 
        var radius = 6; 
        ctx.moveTo(rx + radius, ry); 
        ctx.lineTo(rx + width - radius, ry); 
        ctx.quadraticCurveTo(rx + width, ry, rx + width, ry + radius); 
        ctx.lineTo(rx + width, ry + height - radius); 
        ctx.quadraticCurveTo(rx + width, ry + height, rx + width - radius, ry + height); 
        ctx.lineTo(rx + radius, ry + height); 
        ctx.quadraticCurveTo(rx, ry + height, rx, ry + height - radius); 
        ctx.lineTo(rx, ry + radius); 
        ctx.quadraticCurveTo(rx, ry, rx + radius, ry); 
        ctx.closePath(); 
        ctx.fill();
        ctx.shadowBlur = 0; 
        ctx.fillStyle = "rgba(255,255,255,0.9)"; 
        ctx.textAlign = 'center'; 
        ctx.textBaseline = 'middle'; 
        ctx.fillText(text, x, y + 1);
    }
    drawLabel(lbl1, c1.x, c1.y + 18); 
    drawLabel(lbl2, c2.x - 15, c2.y - 8); 
    drawLabel(lbl3, c3.x - 55, c3.y + 4);
}

function log(t, type) {
    type = type || 'user';
    var chatBox = document.getElementById("chat"); 
    if (!chatBox) return;
    var className = type === 'user' ? 'user' : type === 'assistant' ? 'assistant' : 'system';
    chatBox.innerHTML += '<div class="' + className + '">' + t + '</div>'; 
    chatBox.scrollTop = chatBox.scrollHeight;
}

function speak(t) {
    window.speechSynthesis.cancel(); 
    var u = new SpeechSynthesisUtterance(t);
    u.lang = "vi-VN"; 
    u.rate = 0.9; 
    u.pitch = 1.0; 
    u.volume = 1;
    isSpeaking = true; 
    u.onend = function() { isSpeaking = false; }; 
    window.speechSynthesis.speak(u);
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
    autoExportLock = false;
    setOri('Z'); 
    log("↺ Reset all parameters", 'system');
}

function help() { 
    var modal = document.getElementById('helpModal'); 
    if (modal) { 
        modal.classList.add('active'); 
        document.body.style.overflow = 'hidden'; 
        log("📖 Help opened", 'system'); 
    } 
}

function closeHelp() { 
    var modal = document.getElementById('helpModal'); 
    if (modal) { 
        modal.classList.remove('active'); 
        document.body.style.overflow = ''; 
    } 
}

// ==================== EVENT LISTENERS ====================
document.addEventListener('DOMContentLoaded', function() {
    var modals = document.querySelectorAll('.modal-overlay');
    for (var i = 0; i < modals.length; i++) {
        modals[i].addEventListener('click', function(e) { 
            if (e.target === this) { 
                if(this.id === 'helpModal') closeHelp(); 
                if(this.id === 'saveModal') closeSaveDialog(); 
                if(this.id === 'libraryModal') closeLibrary(); 
            } 
        });
    }
    syncWithGoogleSheets();
});

document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') { 
        closeHelp(); 
        closeSaveDialog(); 
        closeLibrary(); 
        closePasswordModal(); 
    }
    if (e.key === 'Enter') {
        var passwordModal = document.getElementById('passwordModal');
        if (passwordModal) { 
            e.preventDefault(); 
            confirmDeleteWithPassword(); 
        }
        
        var libraryModal = document.getElementById('libraryModal');
        if (libraryModal && libraryModal.classList.contains('active')) {
            var searchInput = document.getElementById('searchQuery');
            if (document.activeElement === searchInput) {
                applyFilters();
            }
        }
    }
});

var inputs = document.querySelectorAll("input");
for (var i = 0; i < inputs.length; i++) {
    inputs[i].addEventListener("input", function() { 
        hasAutoTriggeredSave = false; 
        // Mở khóa export khi người dùng thay đổi thông số
        autoExportLock = false;
        draw(); 
    });
}
window.addEventListener("resize", draw);

// ==================== STARTUP ====================
draw();
log("🚀 3D Opening Tool Pro ready", 'system');
log("📚 Press Library button to manage documents", 'system');
