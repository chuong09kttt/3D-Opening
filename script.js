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
const GOOGLE_SHEETS_DATA_URL = 'https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec';
const TOOL_DOWNLOAD_URL = 'https://drive.google.com/drive/folders/YOUR_FOLDER_ID'; // Thay bằng link Drive của bạn

let isSyncing = false;
let library = [];
let deleteTargetIndex = null;
let currentFilter = 'all';
let currentDeptFilter = null;
let isAddFormVisible = false;

// Khai báo biến cho Library Voice
let libraryVoiceRecognition = null;
let isLibraryVoiceListening = false;

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
        } else {
            handleLibraryError('Invalid data format from server');
        }
        isSyncing = false;
    };

    const script = document.createElement('script');
    script.id = callbackName;
    script.src = GOOGLE_SHEETS_DATA_URL + '?action=get&callback=' + encodeURIComponent(callbackName) + '&t=' + Date.now();
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
    var counts = { all: library.length, standards: 0, procedures: 0, methods: 0, experience: 0 };
    var deptCounts = { hull: 0, piping: 0, electrical: 0, outfitting: 0, others: 0 };
    
    library.forEach(function(doc) {
        var cat = doc.category || 'others';
        if (cat === 'standards' || cat === 'tiêu chuẩn') counts.standards++;
        else if (cat === 'procedures' || cat === 'quy trình') counts.procedures++;
        else if (cat === 'methods' || cat === 'phương pháp') counts.methods++;
        else if (cat === 'experience' || cat === 'kinh nghiệm') counts.experience++;
        
        var dept = doc.department || 'others';
        if (dept === 'hull' || dept === 'vỏ') deptCounts.hull++;
        else if (dept === 'piping' || dept === 'ống') deptCounts.piping++;
        else if (dept === 'electrical' || dept === 'điện') deptCounts.electrical++;
        else if (dept === 'outfitting' || dept === 'kết cấu phụ') deptCounts.outfitting++;
        else deptCounts.others++;
    });
    
    document.getElementById('countAll').textContent = counts.all;
    document.getElementById('countStandards').textContent = counts.standards;
    document.getElementById('countProcedures').textContent = counts.procedures;
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
    var toolEls = document.querySelectorAll('.category-item[data-tool]');
    for (var k = 0; k < toolEls.length; k++) toolEls[k].classList.remove('active');
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
    var toolEls = document.querySelectorAll('.category-item[data-tool]');
    for (var k = 0; k < toolEls.length; k++) toolEls[k].classList.remove('active');
    var el = document.querySelector('.category-item[data-dept="' + department + '"]');
    if (el) el.classList.add('active');
    applyFilters();
}

function applyFilters() {
    var query = document.getElementById('searchQuery').value.trim();
    var filtered = library.slice();
    
    // Category filter
    if (currentFilter !== 'all') {
        var catMap = {
            'standards': ['standards', 'tiêu chuẩn', 'standard'],
            'procedures': ['procedures', 'quy trình', 'procedure'],
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
    
    // Department filter
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
    
    // Search query
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
    var formData = new URLSearchParams();
    formData.append('action', 'add');
    formData.append('name', doc.name);
    formData.append('link', doc.link);
    formData.append('tags', doc.tags ? doc.tags.join(', ') : '');
    formData.append('category', doc.category || 'others');
    formData.append('department', doc.department || 'others');

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
        console.error('Add document via Form POST error:', error);
        throw error;
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
    
    var exists = library.some(function(doc) { return doc.name.toLowerCase() === name.toLowerCase(); });
    if (exists) return alert('⚠️ Document "' + name + '" already exists in library');
    
    var newDoc = { 
        name: name, 
        link: link, 
        tags: tags, 
        category: category, 
        department: department 
    };
    
    // Hiển thị loading
    var addBtn = document.querySelector('#addForm .btn-primary');
    if (addBtn) {
        addBtn.textContent = '⏳';
        addBtn.disabled = true;
    }
    
    addDocumentToGoogleSheets(newDoc).then(function() {
        log('📤 Document "' + name + '" submitted successfully', 'system');
        updateSyncStatus('success', 'Added "' + name + '"');
        
        // Reset form
        nameInput.value = '';
        linkInput.value = '';
        tagsInput.value = '';
        
        // Sync lại để lấy dữ liệu đầy đủ từ cloud
        setTimeout(function() {
            syncWithGoogleSheets();
        }, 500);
        
        nameInput.focus();
    }).catch(function(error) {
        console.error('Add document error:', error);
        alert('❌ Failed to submit document. Check your connection.');
        log('⚠️ Failed to submit document', 'system');
    }).finally(function() {
        if (addBtn) {
            addBtn.textContent = '➕ Add';
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
        // Reset filters
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
    log("👤 " + t, 'user');
    var str = t.toLowerCase().trim();
    var updatedCount = 0;
    
    function cleanNumberString(numStr) {
        if (!numStr) return '0';
        var cleaned = numStr.replace(/[.,](\d{3})/g, '$1');
        cleaned = cleaned.replace(/,/g, '.');
        return cleaned;
    }
    
    function findVal(keywords) {
        for (var i = 0; i < keywords.length; i++) {
            var kw = keywords[i];
            var regex = new RegExp('\\b' + kw + '\\b(?:\\s+is|\\s+of|\\s*[:=]|\\s+)?\\s*(-?\\d+(?:[.,]\\d+)?)', "i");
            var match = str.match(regex);
            if (match) return cleanNumberString(match[1]);
        }
        return null;
    }

    if (str.match(/search\s+(?:for\s+)?(.+)/i)) {
        var searchQuery = str.replace(/search\s+(?:for\s+)?/i, '').trim();
        if (searchQuery && searchQuery.length > 1) {
            document.getElementById('searchQuery').value = searchQuery;
            var results = performSmartSearch(searchQuery);
            if (results.length > 0) { 
                var bestMatch = results[0]; 
                if (bestMatch.link) { 
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

    if (str.match(/save\s*(?:file|document)?/i) || str.match(/export\s*file/i)) { 
        autoSaveDialog(); 
        return; 
    }

    var len = findVal(["length", "dài"]);
    var wid = findVal(["width", "rộng"]);
    var hei = findVal(["thickness", "height", "dày", "cao"]);
    if (len !== null) { document.getElementById("dx").value = len; updatedCount++; }
    if (wid !== null) { document.getElementById("dy").value = wid; updatedCount++; }
    if (hei !== null) { document.getElementById("dz").value = hei; updatedCount++; }

    var posX = findVal(["position x", "pos x", "x position", "x"]);
    var posY = findVal(["position y", "pos y", "y position", "y"]);
    var posZ = findVal(["position z", "pos z", "z position", "z"]);

    if (posX !== null) { document.getElementById("px").value = posX; updatedCount++; }
    if (posY !== null) { document.getElementById("py").value = posY; updatedCount++; }
    if (posZ !== null) { document.getElementById("pz").value = posZ; updatedCount++; }

    var radAll = findVal(["corner radius", "radius"]);
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
        log("✅ Parameters updated!", 'assistant'); 
        autoSaveDialog(); 
    } else { 
        log("⚠️ Could not recognize parameters", 'assistant'); 
    }
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
    r.interimResults = true;
    
    r.onstart = function() {
        isListening = true;
        document.getElementById('voiceBtn').classList.add('listening');
        document.getElementById('chatStatus').textContent = '● Listening...';
        document.getElementById('chatStatus').classList.add('waiting');
        log("🎤 Listening...", 'system');
        var greeting = "Xin chào, bạn hãy đọc các thông số kích thước nhé";
        log("🤖 " + greeting, 'assistant');
        speak(greeting);
        partialTranscript = ''; 
        hasAutoTriggeredSave = false;
    };
    
    r.onend = function() {
        if (isListening) { 
            try { r.start(); } catch(e) {} 
        } else { 
            document.getElementById('voiceBtn').classList.remove('listening'); 
            document.getElementById('chatStatus').textContent = '● Ready'; 
            document.getElementById('chatStatus').classList.remove('waiting'); 
        }
    };
    
    r.onerror = function(e) {
        if (e.error === 'not-allowed') { 
            log("❌ Microphone access denied", 'system'); 
            stopVoice(); 
        } else if (e.error !== 'no-speech') {
            log("⚠️ Error: " + e.error, 'system');
        }
        if (isListening && e.error !== 'not-allowed') { 
            try { 
                setTimeout(function() { r.start(); }, 300); 
            } catch(e) {} 
        }
    };
    
    r.onresult = function(e) {
        if (silenceTimer) { 
            clearTimeout(silenceTimer); 
            silenceTimer = null; 
        }
        var finalText = '', interimText = '';
        for (var i = e.resultIndex; i < e.results.length; i++) {
            var transcript = e.results[i][0].transcript.trim();
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
        } else if (interimText) { 
            document.getElementById('chatStatus').textContent = '● Speaking...'; 
            partialTranscript = interimText.trim(); 
        }
        silenceTimer = setTimeout(function() { 
            if (isListening && partialTranscript) { 
                processFullVoiceNLP(partialTranscript.trim()); 
                partialTranscript = ''; 
            } 
        }, 2000);
    };
    return r;
}

function voice() {
    if (isListening) { 
        stopVoice(); 
        return; 
    }
    if (!recognition) { 
        recognition = initVoice(); 
        if (!recognition) return; 
    }
    try { 
        recognition.start(); 
    } catch(e) { 
        try { 
            recognition.stop(); 
            setTimeout(function() { recognition.start(); }, 300); 
        } catch(e2) {} 
    }
}

function stopVoice() {
    isListening = false;
    if (silenceTimer) { 
        clearTimeout(silenceTimer); 
        silenceTimer = null; 
    }
    if (recognition) { 
        try { recognition.stop(); } catch(e) {} 
    }
    document.getElementById('voiceBtn').classList.remove('listening');
    document.getElementById('chatStatus').textContent = '● Ready';
    document.getElementById('chatStatus').classList.remove('waiting');
    partialTranscript = '';
    log("🔇 Stopped listening", 'system');
}

// ==================== 3D & EXPORT FUNCTIONS ====================
function autoSaveDialog() {
    if (hasAutoTriggeredSave) return;
    var L = parseInputValue("dx"); 
    var W = parseInputValue("dy"); 
    var T = parseInputValue("dz");
    if (L > 0 && W > 0 && T > 0) {
        hasAutoTriggeredSave = true;
        var modal = document.getElementById('saveModal');
        if (modal) { 
            modal.classList.add('active'); 
            document.body.style.overflow = 'hidden'; 
            document.getElementById('saveFileName').value = 'Opening_' + L + 'x' + W + 'x' + T; 
            log("📁 Opening save dialog...", 'system'); 
        }
    }
}

function saveFile() { 
    autoSaveDialog(); 
}

function closeSaveDialog() {
    var modal = document.getElementById('saveModal');
    if (modal) { 
        modal.classList.remove('active'); 
        document.body.style.overflow = ''; 
        hasAutoTriggeredSave = false; 
    }
}

function confirmSave() { 
    var fileName = document.getElementById('saveFileName').value.trim() || "Opening"; 
    generateAndDownloadFile(fileName); 
    closeSaveDialog(); 
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
    var a = document.createElement("a"); 
    a.href = URL.createObjectURL(blob); 
    a.download = fileName + '.mac';
    document.body.appendChild(a); 
    a.click(); 
    document.body.removeChild(a);
    
    var successMsg = "✅ Đã xuất file " + fileName + ".mac thành công!";
    log(successMsg, 'system');
    speak("Đã xuất file thành công");
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
    // Dịch canvas sang phải và xuống dưới để tránh đè lên trục
    var cx = c.width / 2 + 40 + (posX * scale); 
    var cy = c.height / 2 + 20 - (posZ * scale);
    var vX, vY, vZ;
    if (ORI === "Z") { vX = l; vY = w; vZ = t; } 
    else if (ORI === "X") { vX = t; vY = w; vZ = l; } 
    else if (ORI === "Y") { vX = l; vY = t; vZ = w; }
    drawBox3D(cx, cy, vX, vY, vZ, 'L=' + L, 'W=' + W, 'T=' + T);
}

function drawAxis() {
    ctx.lineWidth = 2.5; 
    ctx.font = "bold 13px Inter, sans-serif";
    // Đặt vị trí trục ở góc trái dưới, dịch xuống để không bị khuất
    var x0 = 35, y0 = 195;
    
    // Vẽ trục X (màu đỏ) - kéo dài hơn
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
    
    // Vẽ trục Y (màu xanh dương)
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
    
    // Vẽ trục Z (màu xanh lá) - kéo dài hơn
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
    u.rate = 0.95; 
    u.pitch = 1.05; 
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

// ==================== LIBRARY VOICE SEARCH ====================
function voiceSearchLibrary() {
    if (isLibraryVoiceListening) {
        stopLibraryVoice();
        return;
    }
    
    if (!libraryVoiceRecognition) {
        var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SR) {
            log("❌ Browser doesn't support Voice", 'system');
            alert("❌ Browser doesn't support Voice");
            return;
        }
        
        libraryVoiceRecognition = new SR();
        libraryVoiceRecognition.lang = "vi-VN";
        libraryVoiceRecognition.continuous = false;
        libraryVoiceRecognition.interimResults = true;
        
        libraryVoiceRecognition.onstart = function() {
            isLibraryVoiceListening = true;
            document.getElementById('voiceSearchBtn').classList.add('listening');
            document.getElementById('voiceSearchBtn').innerHTML = '<span class="btn-icon">⏹</span>';
            log("🎤 Listening for search query...", 'system');
            var question = "Bạn muốn tìm kiếm thông tin gì?";
            log("🤖 " + question, 'assistant');
            speak(question);
        };
        
        libraryVoiceRecognition.onend = function() {
            stopLibraryVoice();
        };
        
        libraryVoiceRecognition.onerror = function(e) {
            if (e.error !== 'no-speech') {
                log("⚠️ Error: " + e.error, 'system');
            }
            stopLibraryVoice();
        };
        
        libraryVoiceRecognition.onresult = function(e) {
            var transcript = '';
            var isVietnamese = false;
            for (var i = e.resultIndex; i < e.results.length; i++) {
                var text = e.results[i][0].transcript;
                transcript += text;
                if (/[áàảãạăắằẳẵặâấầẩẫậđéèẻẽẹêếềểễệíìỉĩịóòỏõọôốồổỗộơớờởỡợúùủũụưứừửữựýỳỷỹỵ]/i.test(text)) {
                    isVietnamese = true;
                }
                if (e.results[i].isFinal) {
                    document.getElementById('searchQuery').value = transcript;
                    applyFilters();
                    var lang = isVietnamese ? '🔍 Tìm kiếm: "' : '🔍 Search: "';
                    log(lang + transcript + '"', 'user');
                    stopLibraryVoice();
                }
            }
        };
    }
    
    try {
        libraryVoiceRecognition.start();
    } catch(e) {
        try { 
            libraryVoiceRecognition.stop(); 
            setTimeout(function() { libraryVoiceRecognition.start(); }, 300); 
        } catch(e2) {}
    }
}

function stopLibraryVoice() {
    isLibraryVoiceListening = false;
    if (libraryVoiceRecognition) {
        try { libraryVoiceRecognition.stop(); } catch(e) {}
    }
    var btn = document.getElementById('voiceSearchBtn');
    if (btn) {
        btn.classList.remove('listening');
        btn.innerHTML = '<span class="btn-icon">🎤</span>';
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
        draw(); 
    });
}
window.addEventListener("resize", draw);

// ==================== STARTUP ====================
draw();
log("🚀 3D Opening Tool Pro ready", 'system');
log("📚 Press Library button to manage documents", 'system');
