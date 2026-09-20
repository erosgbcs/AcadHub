// ============================================================
// ACADHUB SUITE - COMPLETE JAVASCRIPT
// Backend: https://acadhub-no6m.onrender.com
// Database: Firebase
// ============================================================

// ============================================================
// FIREBASE CONFIGURATION
// ============================================================
const firebaseConfig = {
  apiKey: "AIzaSyDQA4BN_3jyBWPQGWbYaHhq-aswIP7NvNg",
  authDomain: "acadhub-visitors-69180.firebaseapp.com",
  projectId: "acadhub-visitors-69180",
  storageBucket: "acadhub-visitors-69180.firebasestorage.app",
  messagingSenderId: "292893836149",
  appId: "1:292893836149:web:8345f25b7c68974eaec93c",
  measurementId: "G-CY6WD8V98H"
};

// ============================================================
// SAFE FIREBASE INITIALIZATION (works offline)
// ============================================================
let db = null;
let auth = null;
let firebaseAvailable = false;
const SUBJECT_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ec4899', '#06b6d4', '#ef4444', '#8b5cf6', '#64748b'];
let actionSheetIndex = null;
try {
  if (typeof firebase !== 'undefined') {
    firebase.initializeApp(firebaseConfig);
    db = firebase.firestore();
    auth = firebase.auth();
    firebaseAvailable = true;

    // Enable offline persistence
    db.enablePersistence()
      .then(() => console.log('✅ Firebase offline persistence enabled'))
      .catch((err) => {
        if (err.code === 'failed-precondition') {
          console.warn('⚠️ Multiple tabs open - persistence disabled');
        } else if (err.code === 'unimplemented') {
          console.warn('⚠️ Browser does not support offline persistence');
        }
      });
  } else {
    console.warn('⚠️ Firebase SDK not loaded. Running in offline mode.');
  }
} catch (err) {
  console.error('Firebase initialization failed:', err);
  firebaseAvailable = false;
}

// ============================================================
// BACKEND API CONFIGURATION
// ============================================================
const isLocalHost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
const API_BASE_URL = window.ACADHUB_API_URL || (isLocalHost ? 'http://127.0.0.1:8000' : 'https://acadhub-spacy.onrender.com');

const API_ENDPOINTS = {
  health: '/api/health',
  generateLocal: '/api/generate-reviewer-local',
  generateJSON: '/api/reviewer',
  generateAI: '/api/generate-reviewer',
  generateTest: '/api/generate-test',
  summary: '/api/summary',
  flashcards: '/api/flashcards',
  quiz: '/api/quiz',
  enrich: '/api/enrich'
};

// ============================================================
// GLOBAL VARIABLES
// ============================================================
let isSignUpMode = false;
let selectedRating = 0;
let currentTab = 'notes';
// Splash screen timing
const splashStartTime = Date.now();
const SPLASH_MIN_VISIBLE_MS = 3500;
let splashProgressTimer = null;
let splashProgress = 0;

function startSplashProgress() {
  const fill = document.getElementById('splashProgressFill');
  const text = document.getElementById('splashProgressText');
  if (!fill || !text) return;

  splashProgress = 0;
  splashProgressTimer = setInterval(() => {
    const remaining = 90 - splashProgress;
    const step = Math.max(0.3, remaining * 0.08);
    splashProgress = Math.min(90, splashProgress + step);
    fill.style.width = splashProgress + '%';
    text.textContent = Math.round(splashProgress) + '%';
  }, 120);
}

function completeSplashProgress() {
  if (splashProgressTimer) {
    clearInterval(splashProgressTimer);
    splashProgressTimer = null;
  }
  const fill = document.getElementById('splashProgressFill');
  const text = document.getElementById('splashProgressText');
  if (fill) fill.style.width = '100%';
  if (text) text.textContent = '100%';
}







let testQuestions = [];
let currentQuestionIndex = 0;
let testScore = 0;
let testDifficulty = 'easy';
let currentResults = null;
let lastQuickSummary = null;
let offlineQueue = [];
let isOnline = navigator.onLine;
let backendAvailable = false;
let userAnswers = [];
let calendarMonth = new Date().getMonth();
let calendarYear = new Date().getFullYear();
let selectedCalendarDate = null;
// ============================================================
// UTILITY FUNCTIONS
// ============================================================
function safeLocalStorageSet(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (err) {
    console.error(`Error saving to localStorage (${key}):`, err);
    return false;
  }
}
// ---- Compose the share message ----
function buildShareMessage() {
  const authorName = (currentSharedAuthor && currentSharedAuthor.name) ? currentSharedAuthor.name : 'Anonymous';
  const subjectName = (currentSharedSubject && currentSharedSubject.name) ? currentSharedSubject.name : null;

  const lines = [];
  lines.push('Hey! Try to check out this study reviewer 👇');
  lines.push('');
  if (currentSharedTitle) lines.push(`📘 ${currentSharedTitle}`);
  lines.push(`✍️ Made by ${authorName}`);
  if (subjectName) lines.push(`🏷️ Subject: ${subjectName}`);
  lines.push('');
  lines.push(currentSharedLink);
  return lines.join('\n');
}

function safeLocalStorageGet(key, defaultValue = null) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : defaultValue;
  } catch (err) {
    console.error(`Error reading from localStorage (${key}):`, err);
    return defaultValue;
  }
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

function formatDate(dateStr) {
  if (!dateStr) return 'No deadline';
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

function shuffleArray(array) {
  const newArray = [...array];
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray;
}
function hideSplashScreen() {
  const splash = document.getElementById('splashScreen');
  if (!splash) return;

  const elapsed = Date.now() - splashStartTime;
  const waitFor = Math.max(0, SPLASH_MIN_VISIBLE_MS - elapsed);

  setTimeout(() => {
    completeSplashProgress();
    
    // ✅ FIX: Stop the carousel before hiding the splash screen
    stopTipCarousel(); 
    
    setTimeout(() => {
      splash.classList.add('splash-hide');
      setTimeout(() => splash.remove(), 500);
    }, 250);
  }, waitFor);
}
// NOTIFICATION SYSTEM
// ============================================================
function showNotification(message, type = 'success') {
  const existing = document.getElementById('appNotification');
  if (existing) existing.remove();

  const styles = {
    success: { bg: 'rgba(16, 185, 129, 0.15)', border: 'rgba(16, 185, 129, 0.3)', color: '#34d399', icon: 'fa-circle-check' },
    error: { bg: 'rgba(239, 68, 68, 0.15)', border: 'rgba(239, 68, 68, 0.3)', color: '#f87171', icon: 'fa-circle-xmark' },
    warning: { bg: 'rgba(245, 158, 11, 0.15)', border: 'rgba(245, 158, 11, 0.3)', color: '#fbbf24', icon: 'fa-triangle-exclamation' },
    info: { bg: 'rgba(99, 102, 241, 0.15)', border: 'rgba(99, 102, 241, 0.3)', color: '#a5b4fc', icon: 'fa-circle-info' }
  };

  const style = styles[type] || styles.success;
  const notification = document.createElement('div');
  notification.id = 'appNotification';
  notification.style.cssText = `
    position: fixed; top: 1rem; right: 1rem; z-index: 1000;
    padding: 1rem 1.25rem; background: ${style.bg};
    border: 1px solid ${style.border}; border-radius: 0.75rem;
    color: ${style.color}; font-size: 0.9rem; font-weight: 600;
    display: flex; align-items: center; gap: 0.75rem;
    min-width: 280px; max-width: 400px;
    animation: slideInRight 0.3s ease;
    backdrop-filter: blur(12px);
    box-shadow: 0 8px 24px rgba(0,0,0,0.2);
  `;
  notification.innerHTML = `
    <i class="fa-solid ${style.icon} text-lg"></i>
    <span style="flex:1;">${message}</span>
    <button onclick="this.parentElement.remove()"
            style="background:none;border:none;color:${style.color};cursor:pointer;font-size:1.1rem;">
      ×
    </button>
  `;
  document.body.appendChild(notification);

  setTimeout(() => {
    if (notification.parentElement) {
      notification.style.opacity = '0';
      notification.style.transition = 'opacity 0.3s ease';
      setTimeout(() => notification.remove(), 300);
    }
  }, 4000);
}

// ============================================================
// API CALL FUNCTIONS
// ============================================================
async function apiCall(endpoint, options = {}) {
  const url = API_BASE_URL + endpoint;
  
  const config = {
    method: options.method || 'POST',
    headers: {
      ...options.headers
    }
  };

  if (options.formData) {
    config.body = options.formData;
  } else if (options.json) {
    config.headers['Content-Type'] = 'application/json';
    config.body = JSON.stringify(options.json);
  }

  try {
    const response = await fetch(url, config);
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      throw new Error(errorData?.detail || `API error: ${response.status}`);
    }
    
    return await response.json();
  } catch (err) {
    console.error(`API call failed (${endpoint}):`, err);
    throw err;
  }
}

async function checkBackendHealth() {
  const statusEl = document.getElementById('backendStatus');

  const setStatus = (state) => {
    if (!statusEl) return;
    statusEl.className = 'status-dot ' + state;
    statusEl.title =
      state === 'online'  ? 'Backend online' :
      state === 'offline' ? 'Backend offline — using local mode' :
                            'Checking connection…';
  };

  setStatus('checking');

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(API_BASE_URL + API_ENDPOINTS.health, {
      method: 'GET',
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    backendAvailable = response.ok;
    setStatus(backendAvailable ? 'online' : 'offline');
    return backendAvailable;
  } catch (err) {
    backendAvailable = false;
    setStatus('offline');
    return false;
  }
}
// ============================================================
// WAKE-UP OVERLAY - FIXED VERSION
// ============================================================

// NEW: Function to properly hide the overlay
function hideWakeUpOverlay() {
  const overlay = document.getElementById('wakeUpOverlay');
  if (overlay) {
    overlay.style.display = 'none';
    overlay.style.visibility = 'hidden';
    overlay.style.pointerEvents = 'none';
    overlay.setAttribute('aria-hidden', 'true');
  }
}

// NEW: Function to enable tab buttons
function enableTabButtons() {
  const tabButtons = document.querySelectorAll('#tabContainer button');
  tabButtons.forEach(btn => {
    btn.disabled = false;
    btn.style.pointerEvents = 'auto';
    btn.style.cursor = 'pointer';
    btn.style.zIndex = '101';
  });
  console.log('✅ Tab buttons enabled');
}

async function retryWakeUp() {
  const statusEl = document.getElementById('wakeUpStatus');
  const btn = document.getElementById('retryWakeBtn');
  const overlay = document.getElementById('wakeUpOverlay');

  btn.innerHTML = '<span class="loading-spinner"></span>Checking...';
  btn.classList.add('loading');
  btn.disabled = true;

  statusEl.innerHTML = '<span class="loading-spinner"></span>Connecting to services...';
  statusEl.className = 'loading';
  statusEl.style.color = '#94a3b8';

  let secondsLeft = 30;
  const countdownInterval = setInterval(() => {
    secondsLeft--;
    if (secondsLeft > 0) {
      statusEl.innerHTML = `<span class="loading-spinner"></span>Connecting... (${secondsLeft}s timeout)`;
      if (secondsLeft < 10) statusEl.style.color = '#f59e0b';
      if (secondsLeft < 5) statusEl.style.color = '#ef4444';
    }
  }, 1000);

  try {
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('TIMEOUT')), 30000);
    });

    const backendCheck = checkBackendHealth();
    
    await Promise.race([backendCheck, timeoutPromise]);

    clearInterval(countdownInterval);
    
    if (backendAvailable) {
      statusEl.innerHTML = '<i class="fa-solid fa-circle-check mr-2"></i>Backend is ready!';
    } else {
      statusEl.innerHTML = '<i class="fa-solid fa-circle-check mr-2"></i>Services ready! (Using local mode)';
    }
    
    statusEl.className = 'success';
    statusEl.style.color = '#10b981';
    btn.innerHTML = '<i class="fa-solid fa-check mr-2"></i>Connected!';
    btn.classList.remove('loading');

    await new Promise(resolve => setTimeout(resolve, 1000));
    overlay.classList.add('fade-out');
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // FIXED: Use hideWakeUpOverlay instead of just display:none
    hideWakeUpOverlay();
    enableTabButtons();

    console.log('✅ Services ready!');

  } catch (err) {
    clearInterval(countdownInterval);
    console.error('Wake-up error:', err);

    if (err.message.includes('TIMEOUT') || err.name === 'AbortError') {
      statusEl.innerHTML = '<i class="fa-solid fa-clock mr-2"></i>Server took too long. You can continue offline.';
      statusEl.style.color = '#f59e0b';
    } else {
      statusEl.innerHTML = '<i class="fa-solid fa-triangle-exclamation mr-2"></i>Backend offline. You can continue in offline mode.';
      statusEl.style.color = '#ef4444';
    }

    statusEl.className = 'error';
    btn.innerHTML = '<i class="fa-solid fa-arrow-right mr-2"></i>Continue to Dashboard';
    btn.classList.remove('loading');
    btn.disabled = false;
    btn.onclick = skipToDashboard;

    const skipLink = document.createElement('button');
    skipLink.id = 'skipOfflineBtn';
    skipLink.textContent = 'Skip and continue offline';
    skipLink.style.cssText = `
      display: block; margin: 1rem auto 0; padding: 0.5rem 1rem;
      background: transparent; border: 1px solid rgba(255,255,255,0.2);
      color: #94a3b8; border-radius: 0.5rem; font-size: 0.8rem;
      cursor: pointer; transition: all 0.2s;
    `;
    skipLink.onclick = skipToDashboard;

    const oldSkip = document.getElementById('skipOfflineBtn');
    if (oldSkip) oldSkip.remove();
    statusEl.parentElement.appendChild(skipLink);

  } finally {
    btn.disabled = false;
    btn.classList.remove('loading');
  }
}

// FIXED: Updated skipToDashboard
function skipToDashboard() {
  const overlay = document.getElementById('wakeUpOverlay');
  const statusEl = document.getElementById('wakeUpStatus');

  statusEl.innerHTML = '<i class="fa-solid fa-check mr-2"></i>Continuing...';
  statusEl.style.color = '#10b981';
  overlay.classList.add('fade-out');

  setTimeout(() => {
    hideWakeUpOverlay();
    enableTabButtons();
    console.log('📴 Continuing to dashboard');
  }, 500);
}
// ============================================================
// TAB MANAGEMENT - FIXED VERSION
// ============================================================
function switchTab(tab) {
  currentTab = tab;

  // Hide only the direct child view sections, not the parent container
  document.querySelectorAll('#viewsContainer > [id^="view"]').forEach(view => {
    view.classList.add('hidden');
  });

const viewMap = {
  'notes': 'viewNotes',
  'reviewer': 'viewReviewer',
  'library': 'viewLibrary',
  'test': 'viewTest',
  'calendar': 'viewCalendar'
};

   
  const viewId = viewMap[tab];
  if (viewId) {
    const viewElement = document.getElementById(viewId);
    if (viewElement) {
      viewElement.classList.remove('hidden');
    }
  }

  // Update tab button styles
  document.querySelectorAll('#tabContainer button').forEach(btn => {
    btn.classList.remove('tab-active');
    btn.classList.add('tab-inactive');
  });

const tabMap = {
  'notes': 'tabNotes',
  'reviewer': 'tabReviewer',
  'library': 'tabLibrary',
  'test': 'tabTest',
  'calendar': 'tabCalendar'
};

  
  const tabId = tabMap[tab];
  if (tabId) {
    const tabButton = document.getElementById(tabId);
    if (tabButton) {
      tabButton.classList.remove('tab-inactive');
      tabButton.classList.add('tab-active');
    }
  }

  // Refresh data for certain tabs
if (tab === 'library') renderSavedList();
if (tab === 'calendar') renderCalendar();
if (tab === 'notes') { renderNotesList(); renderSubjectFilters(); }
}
// FIXED: Improved initTabListeners with direct onclick
function initTabListeners() {
  const tabMappings = {
    'tabReviewer': 'reviewer',
    'tabLibrary': 'library',
    'tabTest': 'test',
    'tabCalendar': 'calendar'
  };
  
  Object.keys(tabMappings).forEach(tabId => {
    const button = document.getElementById(tabId);
    if (button) {
      // Remove any previous listeners to avoid duplicates
      button.onclick = null;
      
      // Add a single click listener
      button.addEventListener('click', function(event) {
        event.preventDefault();
        event.stopPropagation();
        switchTab(tabMappings[tabId]);
      });
      
      // Ensure the button is clickable
      button.style.pointerEvents = 'auto';
      button.style.cursor = 'pointer';
      button.style.zIndex = '101';
    }
  });
}


// AUTH MODAL (login / signup only)
function openAuthModal() {
  document.getElementById('authModal').classList.remove('hidden');
  updateAuthUI();
}
// SETTINGS MANAGEMENT
function toggleSettingsModal() {
  const modal = document.getElementById('settingsModal');
  modal.classList.toggle('hidden');
  if (!modal.classList.contains('hidden')) {
    updateSettingsUI();
  }
}

function closeSettingsModal() {
  document.getElementById('settingsModal').classList.add('hidden');
}

function toggleTheme() {
  const html = document.documentElement;
  const isDark = html.classList.contains('dark');

  if (isDark) {
    html.classList.remove('dark');
    html.classList.add('light');
  } else {
    html.classList.remove('light');
    html.classList.add('dark');
  }

  const theme = html.classList.contains('dark') ? 'dark' : 'light';
  safeLocalStorageSet('theme', theme);

  if (firebaseAvailable && auth && auth.currentUser) {
    db.collection('users').doc(auth.currentUser.uid).set({
      theme
    }, { merge: true }).catch(err => console.error('Error saving theme:', err));
  }

  updateSettingsUI();
}

function changeTabPosition(position) {
  const mainWrapper = document.getElementById('mainWrapper');
  mainWrapper.classList.remove('tab-position-top', 'tab-position-bottom', 'tab-position-left');
  mainWrapper.classList.add('tab-position-' + position);

  safeLocalStorageSet('tab_position', position);

  if (firebaseAvailable && auth && auth.currentUser) {
    db.collection('users').doc(auth.currentUser.uid).set({
      tabPosition: position
    }, { merge: true }).catch(err => console.error('Error saving tab position:', err));
  }
}

function updateSettingsUI() {
  const html = document.documentElement;
  const isDark = html.classList.contains('dark');
  const dot = document.getElementById('settingsThemeDot');
  if (dot) {
    dot.style.left = isDark ? '0.25rem' : '1.25rem';
  }
}

// AI PROVIDER UI
function updateProviderUI() {
  const provider = document.getElementById('aiProvider').value;
  const apiKeyContainer = document.getElementById('apiKeyContainer');
  const apiKeyLabel = document.getElementById('apiKeyLabel');

  if (provider === 'local') {
    apiKeyContainer.style.display = 'none';
  } else {
    apiKeyContainer.style.display = 'block';
    apiKeyLabel.textContent = provider === 'gemini' ? 'Gemini API Key' : 'DeepSeek API Key';
  }
}

function toggleAccuracyInfo() {
  const info = document.getElementById('accuracyInfo');
  info.classList.toggle('hidden');
}

function toggleApiKeyVisibility() {
  const input = document.getElementById('apiKey');
  const icon = document.getElementById('toggleEyeIcon');

  if (input.type === 'password') {
    input.type = 'text';
    icon.classList.remove('fa-eye');
    icon.classList.add('fa-eye-slash');
  } else {
    input.type = 'password';
    icon.classList.remove('fa-eye-slash');
    icon.classList.add('fa-eye');
  }
}

// ============================================================
// MULTI-FILE HANDLING (shared by Reviewer + Test modes)
// ============================================================
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_FILES = 10;
const ALLOWED_EXTENSIONS = ['.pdf', '.docx', '.txt', '.md', '.rtf', '.html', '.htm'];

const fileStore = {
  reviewer: [],
  test: []
};

function getFileRefs(mode) {
  const isTest = mode === 'test';
  return {
    input:   document.getElementById(isTest ? 'testFileInput'        : 'fileInput'),
    list:    document.getElementById(isTest ? 'testFileListContainer': 'fileListContainer'),
    clear:   document.getElementById(isTest ? 'clearTestFilesBtn'    : 'clearFilesBtn'),
    drop:    document.getElementById(isTest ? 'testFileDropZone'     : 'fileDropZone'),
    display: document.getElementById(isTest ? 'testFileNameDisplay'  : 'fileNameDisplay')
  };
}

function validateFile(file) {
  if (file.size > MAX_FILE_SIZE) {
    return `"${file.name}" is too large (max 10MB)`;
  }
  const ext = '.' + file.name.split('.').pop().toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return `"${file.name}" has an unsupported type`;
  }
  return null;
}

function handleFilesAdded(mode, fileList) {
  if (!fileStore[mode]) fileStore[mode] = [];
  const errors = [];
  const files = Array.from(fileList || []);

  for (const file of files) {
    if (fileStore[mode].length >= MAX_FILES) {
      errors.push(`Maximum ${MAX_FILES} files allowed`);
      break;
    }
    const err = validateFile(file);
    if (err) { errors.push(err); continue; }

    // skip duplicates (same name + size)
    const dup = fileStore[mode].some(f => f.name === file.name && f.size === file.size);
    if (dup) continue;

    fileStore[mode].push(file);
  }

  if (errors.length) showNotification(errors[0], 'error');
  renderFileList(mode);
}

function removeFile(mode, index) {
  if (!fileStore[mode]) return;
  fileStore[mode].splice(index, 1);
  renderFileList(mode);
}

function clearSelectedFiles(mode) {
  if (!fileStore[mode]) return;
  fileStore[mode] = [];
  const { input } = getFileRefs(mode);
  if (input) input.value = '';
  renderFileList(mode);
}

function renderFileList(mode) {
  const { list, clear, display } = getFileRefs(mode);
  if (!list) return;

  list.innerHTML = '';
  const files = fileStore[mode] || [];

  if (files.length === 0) {
    list.classList.add('hidden');
    if (clear) clear.classList.add('hidden');
    if (display) display.textContent = 'Drop files or click to browse';
    return;
  }

  list.classList.remove('hidden');
  if (clear) clear.classList.remove('hidden');
  if (display) {
    display.textContent = `${files.length} file${files.length > 1 ? 's' : ''} selected`;
  }

  files.forEach((file, index) => {
    const item = document.createElement('div');
    item.className = 'flex items-center gap-2 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-xs';
    item.innerHTML = `
      <i class="fa-solid fa-file-lines text-indigo-400 shrink-0"></i>
      <span class="truncate flex-1">${file.name}</span>
      <span class="opacity-50 shrink-0">${(file.size / 1024).toFixed(0)} KB</span>
      <button type="button"
              onclick="removeFile('${mode}', ${index})"
              class="text-rose-400 hover:text-rose-300 shrink-0 btn-hover"
              title="Remove">
        <i class="fa-solid fa-xmark"></i>
      </button>
    `;
    list.appendChild(item);
  });
}

// ---- Drag & drop ----
function handleDragOver(event) {
  event.preventDefault();
  event.stopPropagation();
  event.currentTarget.classList.add('drag-over');
}

function handleDragLeave(event) {
  event.preventDefault();
  event.stopPropagation();
  event.currentTarget.classList.remove('drag-over');
}

function handleDrop(event, mode) {
  event.preventDefault();
  event.stopPropagation();
  event.currentTarget.classList.remove('drag-over');
  const files = event.dataTransfer?.files;
  if (files && files.length) handleFilesAdded(mode, files);
}

// ---- Input change handlers (called from HTML onchange) ----
function updateFileName(input) {
  handleFilesAdded('reviewer', input.files);
  input.value = ''; // reset so the same file can be re-picked after removal
}

function updateTestFileName(input) {
  handleFilesAdded('test', input.files);
  input.value = '';
}

// AI REVIEWER - MAIN GENERATION FUNCTION
async function handleGenerate() {
  const submitBtn = document.getElementById('submitBtn');
  const btnContent = document.getElementById('btnContent');
  const progressContainer = document.getElementById('progressContainer');
  const resultsContainer = document.getElementById('resultsContainer');

const notes = document.getElementById('studyNotes').value.trim();
const selectedFiles = fileStore.reviewer;
const hasFile = selectedFiles.length > 0;

  if (!notes && !hasFile) {
    showNotification('Please paste notes or upload a document.', 'warning');
    return;
  }

  const provider = document.getElementById('aiProvider').value;
  const apiKey = document.getElementById('apiKey').value;

  if ((provider === 'gemini' || provider === 'deepseek') && !apiKey) {
    showNotification(`Please enter your ${provider === 'gemini' ? 'Gemini' : 'DeepSeek'} API key.`, 'error');
    return;
  }

  submitBtn.disabled = true;
  btnContent.innerHTML = '<i class="fa-solid fa-spinner animate-spin mr-2"></i>Generating...';
  progressContainer.classList.remove('hidden');
  resultsContainer.classList.add('hidden');

  try {
    const formData = new FormData();
if (notes) formData.append('notes', notes);
if (hasFile) {
  selectedFiles.forEach(f => formData.append('file', f, f.name));
}

    const quizTypes = {
      truefalse: document.getElementById('useTrueFalse').checked ? parseInt(document.getElementById('numTrueFalse').value) || 0 : 0,
      identification: document.getElementById('useIdentification').checked ? parseInt(document.getElementById('numIdentification').value) || 0 : 0,
      enumeration: document.getElementById('useEnumeration').checked ? parseInt(document.getElementById('numEnumeration').value) || 0 : 0,
      multiplechoice: document.getElementById('useMultipleChoice').checked ? parseInt(document.getElementById('numMultipleChoice').value) || 0 : 0,
      what: document.getElementById('useWhat').checked ? parseInt(document.getElementById('numWhat').value) || 0 : 0,
      who: document.getElementById('useWho').checked ? parseInt(document.getElementById('numWho').value) || 0 : 0,
      where: document.getElementById('useWhere').checked ? parseInt(document.getElementById('numWhere').value) || 0 : 0,
      when: document.getElementById('useWhen').checked ? parseInt(document.getElementById('numWhen').value) || 0 : 0
    };

    formData.append('quiz_types', JSON.stringify(quizTypes));
    formData.append('num_flashcards', document.getElementById('numFlashcards').value || '10');
    formData.append('use_internet', document.getElementById('useInternet').checked);
    formData.append('enrich_count', document.getElementById('enrichCount').value || '5');

    let result;
    
    if (provider === 'local') {
      result = await apiCall(API_ENDPOINTS.generateLocal, { formData });
    } else {
      formData.append('api_key', apiKey);
      formData.append('provider', provider);
      result = await apiCall(API_ENDPOINTS.generateAI, { formData });
    }

    const transformedData = transformBackendResponse(result);

    renderSummary(transformedData.summary);
    renderFlashcards(transformedData.flashcards);
    renderQuiz(transformedData.quiz);
    const qualityEl = document.getElementById('generationQuality');
    if (qualityEl && transformedData.quality) {
      qualityEl.textContent = `Generation quality: ${transformedData.quality.score}% (source and answer consistency)`;
    }

    currentResults = {
      ...transformedData,
      timestamp: new Date().toISOString()
    };

    resultsContainer.classList.remove('hidden');
document.getElementById('saveToLibraryBtn').classList.remove('hidden');
document.getElementById('shareReviewerBtn').classList.remove('hidden');
document.getElementById('saveAsNoteBtn').classList.remove('hidden');    
    // Clear any shared-view state — this is a fresh local reviewer
updateResultsNavCounts();
initResultsNav();
    
    
currentSharedReviewer = null;
const sharedBanner = document.getElementById('sharedBanner');
if (sharedBanner) sharedBanner.classList.add('hidden');
    showNotification('Study materials generated successfully!', 'success');

  } catch (err) {
    console.error('Error generating materials:', err);
    showNotification(err.message || 'Error generating study materials. Please try again.', 'error');
  } finally {
    submitBtn.disabled = false;
    btnContent.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles mr-2"></i>Generate Study Materials';
    progressContainer.classList.add('hidden');
  }
}
// ============================================================
// SHARE FEATURE — Firebase with URL-encoded fallback
// ============================================================
const SHARE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const SHARE_URL_PREFIX = 'u.';
const SHARE_COLLECTION = 'shared_reviewers';

let currentSharedReviewer = null;
let currentSharedLink = '';
let cachedAuthorName = null;
let currentSharedTitle = '';
let currentSharedAuthor = null;
let currentSharedSubject = null;

// ---- Author helper ----
async function getCurrentAuthorInfo() {
  if (!auth || !auth.currentUser) return { name: 'Anonymous', uid: null };
  if (cachedAuthorName) return { name: cachedAuthorName, uid: auth.currentUser.uid };

  const u = auth.currentUser;
  try {
    if (firebaseAvailable && db) {
      const doc = await db.collection('users').doc(u.uid).get();
      if (doc.exists) {
        const d = doc.data();
        const full = [d.firstName, d.lastName].filter(Boolean).join(' ').trim();
        if (full) { cachedAuthorName = full; return { name: full, uid: u.uid }; }
      }
    }
  } catch (e) { /* fall through */ }

  const fallback = u.displayName || (u.email ? u.email.split('@')[0] : 'Anonymous');
  cachedAuthorName = fallback;
  return { name: fallback, uid: u.uid };
}

// ---- URL-safe base64 helpers ----
function bytesToBase64Url(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBytes(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function encodeSharePayload(obj) {
  const json = JSON.stringify(obj);
  const utf8 = new TextEncoder().encode(json);
  const compressed = (typeof pako !== 'undefined') ? pako.deflate(utf8, { level: 9 }) : utf8;
  return SHARE_URL_PREFIX + bytesToBase64Url(compressed);
}

function decodeSharePayload(encoded) {
  const payload = encoded.startsWith(SHARE_URL_PREFIX) ? encoded.slice(SHARE_URL_PREFIX.length) : encoded;
  const bytes = base64UrlToBytes(payload);
  const inflated = (typeof pako !== 'undefined') ? pako.inflate(bytes) : bytes;
  const json = new TextDecoder().decode(inflated);
  return JSON.parse(json);
}

// ---- Build link (meta = { title, author, subject }) ----
async function buildShareableLink(meta, data) {
  const baseUrl = window.location.origin + window.location.pathname;
  const payload = {
    title: meta.title || 'Shared Reviewer',
    author: meta.author || { name: 'Anonymous', uid: null },
    subject: meta.subject || null,
    data,
  };

  if (firebaseAvailable && db) {
    try {
      const docRef = db.collection(SHARE_COLLECTION).doc();
      await docRef.set({
        ...payload,
        createdAtMs: Date.now(),
        expiresAtMs: Date.now() + SHARE_TTL_MS,
      });
      return { url: `${baseUrl}?share=${docRef.id}`, mode: 'firebase' };
    } catch (err) {
      console.warn('Firebase share failed, falling back to URL encoding:', err);
    }
  }

  const encoded = encodeSharePayload(payload);
  const url = `${baseUrl}?share=${encoded}`;
  if (url.length > 7500) {
    throw new Error('Reviewer is too large to share as a link. Try generating fewer items.');
  }
  return { url, mode: 'url' };
}

// ---- Share modal ----
async function openShareModal() {
  if (!currentResults) {
    showNotification('Nothing to share yet.', 'warning');
    return;
  }

  document.getElementById('shareModal').classList.remove('hidden');
  document.getElementById('shareSetup').classList.remove('hidden');
  document.getElementById('shareResult').classList.add('hidden');
  document.getElementById('shareError').classList.add('hidden');
  document.getElementById('shareLoading').classList.add('hidden');
  document.getElementById('shareLinkInput').value = '';
  document.getElementById('shareModeNote').textContent = '';
  document.getElementById('shareNativeBtn').classList.add('hidden');

  const titleInput = document.getElementById('shareTitleInput');
  titleInput.value = currentResults.title || `Reviewer — ${new Date().toLocaleDateString()}`;

  const select = document.getElementById('shareSubjectSelect');
  const subjects = getNoteSubjects();
  select.innerHTML = '<option value="">— No subject —</option>' +
    subjects.map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('');

  if (currentResults.subject && currentResults.subject.id) {
    select.value = currentResults.subject.id;
  }

  const authorEl = document.getElementById('shareAuthorName');
  authorEl.textContent = 'Loading…';
  const author = await getCurrentAuthorInfo();
  authorEl.textContent = author.name;
}

function closeShareModal() {
  document.getElementById('shareModal').classList.add('hidden');
}

function closeShareModalBackdrop(e) {
  if (e.target.id === 'shareModal') closeShareModal();
}

async function createShareLink() {
  document.getElementById('shareSetup').classList.add('hidden');
  document.getElementById('shareLoading').classList.remove('hidden');
  document.getElementById('shareResult').classList.add('hidden');
  document.getElementById('shareError').classList.add('hidden');

  try {
    const title = document.getElementById('shareTitleInput').value.trim() || 'Shared Reviewer';
    const subjectId = document.getElementById('shareSubjectSelect').value;

    let subject = null;
    if (subjectId) {
      const found = getNoteSubject(subjectId);
      if (found) subject = { id: found.id, name: found.name, color: found.color };
    }

    const author = await getCurrentAuthorInfo();
    const { url, mode } = await buildShareableLink({ title, author, subject }, currentResults);
// ---- Compose the share message ----
   currentSharedLink = url;
currentSharedTitle = title;
currentSharedAuthor = author;
currentSharedSubject = subject;
document.getElementById('shareLinkInput').value = url;
    document.getElementById('shareModeNote').textContent = mode === 'firebase'
      ? 'Link expires in 30 days.'
      : 'Link contains the reviewer data — no expiration. Works offline.';

    if (navigator.share) {
      document.getElementById('shareNativeBtn').classList.remove('hidden');
    }
  } catch (err) {
    console.error('Share link creation failed:', err);
    document.getElementById('shareError').textContent = err.message || 'Could not create share link.';
    document.getElementById('shareError').classList.remove('hidden');
    document.getElementById('shareSetup').classList.remove('hidden');
  } finally {
    document.getElementById('shareLoading').classList.add('hidden');
    document.getElementById('shareResult').classList.remove('hidden');
  }
}

async function copyShareLink() {
  const input = document.getElementById('shareLinkInput');
  const url = input.value;
  if (!url) return;

  const text = buildShareMessage();

  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
    } else {
      input.value = text;
      input.select();
      document.execCommand('copy');
      input.value = url;
      input.setSelectionRange(0, 0);
    }
    showNotification('Message copied!', 'success');
  } catch (err) {
    console.error('Copy failed:', err);
    input.select();
    showNotification('Long-press the link field to copy.', 'info');
  }
}


async function shareNative() {
  if (!currentSharedLink) return;

  const shareText = buildShareMessage();

  try {
    await navigator.share({
      title: currentSharedTitle || 'AcadHub Reviewer',
      text: shareText,
      url: currentSharedLink,
    });
  } catch (err) {
    if (err.name !== 'AbortError') {
      console.warn('Native share failed:', err);
    }
  }
}

// ---- Receiving side ----
function getShareParamFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get('share');
}

function removeShareParamFromUrl() {
  const url = new URL(window.location.href);
  url.searchParams.delete('share');
  window.history.replaceState({}, '', url.toString());
}

async function checkForSharedReviewer() {
  const shareParam = getShareParamFromUrl();
  if (!shareParam) return;

  try {
    let payload = null;

    if (shareParam.startsWith(SHARE_URL_PREFIX)) {
      payload = decodeSharePayload(shareParam);
    } else {
      if (!firebaseAvailable || !db) {
        throw new Error('This link requires an internet connection.');
      }
      const snap = await db.collection(SHARE_COLLECTION).doc(shareParam).get();
      if (!snap.exists) throw new Error('This shared reviewer no longer exists.');
      const doc = snap.data();
      if (doc.expiresAtMs && Date.now() > doc.expiresAtMs) {
        throw new Error('This shared reviewer has expired.');
      }
      payload = doc;
    }

    const data = payload.data || payload;
    if (!data || !data.summary) {
      throw new Error('The shared reviewer is empty or invalid.');
    }

    currentSharedReviewer = {
      title: payload.title || 'Shared Reviewer',
      author: payload.author || null,
      subject: payload.subject || null,
      createdAtMs: payload.createdAtMs || null,
      data,
    };

    showSharedReviewer();
  } catch (err) {
    console.error('Shared reviewer load failed:', err);
    showNotification(err.message || 'Could not load shared reviewer.', 'error');
    removeShareParamFromUrl();
  }
}


function showSharedReviewer() {
  if (!currentSharedReviewer) return;
  const { title, author, subject, createdAtMs, data } = currentSharedReviewer;

  switchTab('reviewer');
  const resultsContainer = document.getElementById('resultsContainer');
  resultsContainer.classList.remove('hidden');

  renderSummary(data.summary);
  renderFlashcards(data.flashcards);
  renderQuiz(data.quiz);

  if (data.quality) {
    const qualityEl = document.getElementById('generationQuality');
    if (qualityEl) {
      qualityEl.textContent = `Generation quality: ${data.quality.score}% (source and answer consistency)`;
    }
  }

  currentResults = {
    title,
    author,
    subject,
    summary: data.summary || [],
    flashcards: data.flashcards || [],
    quiz: data.quiz || {},
    quality: data.quality || null,
  };

  const banner = document.getElementById('sharedBanner');
  const titleEl = document.getElementById('sharedBannerTitle');
  const authorEl = document.getElementById('sharedBannerAuthor');
  const subjectEl = document.getElementById('sharedBannerSubject');
  const dateEl = document.getElementById('sharedBannerDate');
  const meta = document.getElementById('sharedBannerMeta');

  if (titleEl) titleEl.textContent = title;

  if (authorEl) {
    const name = (author && author.name) ? author.name : 'Anonymous';
    authorEl.innerHTML = `<i class="fa-solid fa-user"></i><span>By ${escapeHtml(name)}</span>`;
  }

  if (subjectEl) {
    if (subject && subject.name) {
      const color = subject.color || '#94a3b8';
      subjectEl.classList.remove('hidden');
      subjectEl.innerHTML = `<span class="note-subject-dot" style="background:${color};"></span>${escapeHtml(subject.name)}`;
      subjectEl.style.background = color + '22';
      subjectEl.style.color = color;
      subjectEl.style.border = `1px solid ${color}55`;
    } else {
      subjectEl.classList.add('hidden');
    }
  }

  if (dateEl) {
    dateEl.textContent = createdAtMs ? new Date(createdAtMs).toLocaleDateString() : '';
  }

  if (meta) meta.textContent = 'Save it to keep it in your library.';

  if (banner) {
    banner.classList.remove('hidden', 'is-dismissing');
    banner.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  const saveBtn = document.getElementById('saveToLibraryBtn');
  if (saveBtn) saveBtn.classList.add('hidden');
  const noteBtn = document.getElementById('saveAsNoteBtn');
  if (noteBtn) noteBtn.classList.add('hidden');

  showNotification('Shared reviewer loaded!', 'success');
  updateResultsNavCounts();
  initResultsNav();
}

async function saveSharedToLibrary() {
  if (!currentSharedReviewer) return;
  const { title, data, author, subject } = currentSharedReviewer;
  const ok = await persistLibraryItemWithMeta(title, data, { author, subject });
  if (ok) {
    dismissSharedReviewer();
    const shareBtn = document.getElementById('shareReviewerBtn');
    if (shareBtn) shareBtn.classList.remove('hidden');
    const saveBtn = document.getElementById('saveToLibraryBtn');
    if (saveBtn) saveBtn.classList.remove('hidden');
  }
}

function dismissSharedReviewer() {
  const banner = document.getElementById('sharedBanner');
  if (banner) {
    banner.classList.add('is-dismissing');
    setTimeout(() => banner.classList.add('hidden'), 300);
  }

  currentSharedReviewer = null;
  removeShareParamFromUrl();

  const resultsContainer = document.getElementById('resultsContainer');
  if (resultsContainer) resultsContainer.classList.add('hidden');
  currentResults = null;

  const qualityEl = document.getElementById('generationQuality');
  if (qualityEl) qualityEl.textContent = '';
}

// ============================================================
// RESULTS NAV — sticky section navigation
// ============================================================
const RESULTS_SECTION_IDS = ['summary', 'flashcards', 'quiz'];
let activeResultsSection = 'summary';
let resultsObserver = null;
let resultsNavBound = false;

function getResultsSectionEl(id) {
  return document.getElementById('section' + id.charAt(0).toUpperCase() + id.slice(1));
}

function setActiveResultsNav(id) {
  if (activeResultsSection === id) return;
  activeResultsSection = id;
  document.querySelectorAll('.results-nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.section === id);
  });
}

function updateResultsNavCounts() {
  const summaryCount = document.querySelectorAll('#summaryList > li').length;
  const flashcardCount = document.querySelectorAll('#flashcardGrid > .flashcard').length;
  const quizCount = document.querySelectorAll('#quizContainer > div').length;

  const map = { summary: summaryCount, flashcards: flashcardCount, quiz: quizCount };
  document.querySelectorAll('.results-nav-count').forEach(el => {
    const key = el.dataset.count;
    if (key in map) el.textContent = map[key];
  });
}

function initResultsNav() {
  if (!resultsNavBound) {
    document.querySelectorAll('.results-nav-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.section;
        const el = getResultsSectionEl(id);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        setActiveResultsNav(id);
      });
    });
    resultsNavBound = true;
  }

  if (resultsObserver) resultsObserver.disconnect();
  resultsObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const id = entry.target.dataset.sectionId;
        if (id) setActiveResultsNav(id);
      }
    });
  }, {
    root: null,
    rootMargin: '-40% 0px -55% 0px',
    threshold: 0
  });

  RESULTS_SECTION_IDS.forEach(id => {
    const el = getResultsSectionEl(id);
    if (el) resultsObserver.observe(el);
  });
}
// ============================================================
// NOTES FEATURE
// ============================================================
let currentEditingNoteId = null;
let currentEditingNoteIsNew = false;
let currentNoteSubjectId = null;
let currentNoteIsPinned = false;
let noteAutosaveTimer = null;
let noteLastSavedSnapshot = null;
let currentFilterSubjectId = 'all';
let currentNoteSearchQuery = '';
let currentActionNoteId = null;
let editingSubjectId = null;
let editingSubjectColor = SUBJECT_COLORS[0];

function getNotes() { return safeLocalStorageGet('acadhub_notes', []); }
function setNotes(notes) { safeLocalStorageSet('acadhub_notes', notes); }
function getNoteSubjects() { return safeLocalStorageGet('acadhub_note_subjects', []); }
function setNoteSubjects(subs) { safeLocalStorageSet('acadhub_note_subjects', subs); }
function getNoteSubject(id) {
  if (!id) return null;
  return getNoteSubjects().find(s => s.id === id) || null;
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function formatRelativeTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const sec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day === 1) return 'Yesterday';
  if (day < 30) return `${day} days ago`;
  return d.toLocaleDateString();
}

// ---- List ----
function renderNotesList() {
  const container = document.getElementById('notesList');
  const emptyMsg = document.getElementById('emptyNotes');
  const noResults = document.getElementById('noSearchResults');
  if (!container) return;

  const allNotes = getNotes();
  const subjects = getNoteSubjects();

  const sorted = [...allNotes].sort((a, b) => {
    if (!!a.pinned !== !!b.pinned) return (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0);
    return (b.updatedAt || '').localeCompare(a.updatedAt || '');
  });

  let filtered = sorted;
  if (currentFilterSubjectId === 'uncategorized') {
    filtered = filtered.filter(n => !n.subjectId);
  } else if (currentFilterSubjectId !== 'all') {
    filtered = filtered.filter(n => n.subjectId === currentFilterSubjectId);
  }

  if (currentNoteSearchQuery) {
    const q = currentNoteSearchQuery.toLowerCase();
    filtered = filtered.filter(n =>
      (n.title || '').toLowerCase().includes(q) ||
      (n.body || '').toLowerCase().includes(q)
    );
  }

  if (allNotes.length === 0) {
    container.innerHTML = '';
    if (emptyMsg) emptyMsg.classList.remove('hidden');
    if (noResults) noResults.classList.add('hidden');
    return;
  }
  if (emptyMsg) emptyMsg.classList.add('hidden');

  if (filtered.length === 0 && currentNoteSearchQuery) {
    container.innerHTML = '';
    if (noResults) {
      noResults.classList.remove('hidden');
      const t = document.getElementById('searchTermDisplay');
      if (t) t.textContent = `"${currentNoteSearchQuery}"`;
    }
    return;
  }
  if (noResults) noResults.classList.add('hidden');

  if (filtered.length === 0) {
    container.innerHTML = '<p class="text-sm opacity-50 text-center py-6">No notes in this category.</p>';
    return;
  }

  container.innerHTML = filtered.map(note => {
    const subject = note.subjectId ? subjects.find(s => s.id === note.subjectId) : null;
    const subjectPill = subject
      ? `<span class="note-subject-pill" style="background:${subject.color}22; color:${subject.color}; border:1px solid ${subject.color}55;"><span class="note-subject-dot" style="background:${subject.color};"></span>${escapeHtml(subject.name)}</span>`
      : `<span class="note-subject-pill" style="background:rgba(148,163,184,0.15); color:#94a3b8; border:1px solid rgba(148,163,184,0.3);"><span class="note-subject-dot" style="background:#94a3b8;"></span>Uncategorized</span>`;

    const preview = (note.body || '').trim() || 'Empty note';
    const pinIcon = note.pinned ? '<i class="fa-solid fa-thumbtack text-amber-400 text-xs mr-1.5"></i>' : '';

    return `
      <div class="note-card bg-white/5 border border-white/10 rounded-lg p-3" onclick="openNoteEditor('${note.id}')">
        <div class="flex items-start gap-2">
          <div class="min-w-0 flex-1">
            <p class="text-sm font-medium truncate">${pinIcon}${escapeHtml(note.title || 'Untitled note')}</p>
            <div class="flex items-center gap-2 mt-1 flex-wrap">
              ${subjectPill}
              <span class="text-xs opacity-50">${formatRelativeTime(note.updatedAt)}</span>
            </div>
            <p class="text-xs opacity-70 mt-2 line-clamp-2">${escapeHtml(preview)}</p>
          </div>
          <button class="card-menu-btn btn-hover shrink-0" onclick="event.stopPropagation(); openNoteActionSheet('${note.id}')" title="More">
            <i class="fa-solid fa-ellipsis-vertical text-xs"></i>
          </button>
        </div>
      </div>
    `;
  }).join('');
}

function renderSubjectFilters() {
  const container = document.getElementById('noteSubjectFilters');
  if (!container) return;

  const subjects = getNoteSubjects();
  const notes = getNotes();
  const uncategorizedCount = notes.filter(n => !n.subjectId).length;

  const pills = [];
  pills.push(`<button class="subject-filter-pill ${currentFilterSubjectId === 'all' ? 'active' : ''}" onclick="setNoteFilter('all')"><i class="fa-solid fa-layer-group"></i> All <span class="opacity-60">${notes.length}</span></button>`);

  subjects.forEach(s => {
    const count = notes.filter(n => n.subjectId === s.id).length;
    if (count === 0 && currentFilterSubjectId !== s.id) return;
    pills.push(`<button class="subject-filter-pill ${currentFilterSubjectId === s.id ? 'active' : ''}" onclick="setNoteFilter('${s.id}')"><span class="note-subject-dot" style="background:${s.color};"></span>${escapeHtml(s.name)} <span class="opacity-60">${count}</span></button>`);
  });

  if (uncategorizedCount > 0) {
    pills.push(`<button class="subject-filter-pill ${currentFilterSubjectId === 'uncategorized' ? 'active' : ''}" onclick="setNoteFilter('uncategorized')"><span class="note-subject-dot" style="background:#94a3b8;"></span>Uncategorized <span class="opacity-60">${uncategorizedCount}</span></button>`);
  }

  pills.push(`<button class="subject-filter-pill" onclick="openEditSubject(null)" title="Manage subjects"><i class="fa-solid fa-plus"></i></button>`);
  container.innerHTML = pills.join('');
}

function setNoteFilter(id) {
  currentFilterSubjectId = id;
  renderSubjectFilters();
  renderNotesList();
}

function onNoteSearchInput() {
  currentNoteSearchQuery = document.getElementById('noteSearchInput').value.trim();
  renderNotesList();
}

function clearNoteSearch() {
  document.getElementById('noteSearchInput').value = '';
  currentNoteSearchQuery = '';
  renderNotesList();
}

// ---- Editor ----
function openNoteEditor(noteId) {
  const isNew = !noteId;
  const notes = getNotes();
  const note = isNew ? null : notes.find(n => n.id === noteId);
  if (!isNew && !note) return;

  currentEditingNoteId = isNew ? generateId() : noteId;
  currentEditingNoteIsNew = isNew;
  currentNoteSubjectId = note?.subjectId || null;
  currentNoteIsPinned = note?.pinned || false;

  document.getElementById('noteTitleInput').value = note?.title || '';
  document.getElementById('noteBodyInput').value = note?.body || '';

  noteLastSavedSnapshot = JSON.stringify({
    title: note?.title || '', body: note?.body || '',
    subjectId: currentNoteSubjectId, pinned: currentNoteIsPinned
  });

  updateNoteSubjectUI();
  updateNotePinUI();
  updateNoteWordCount();
  setNoteSaveStatus(isNew ? 'New note' : 'Saved');

  document.getElementById('noteEditorSheet').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  if (isNew) setTimeout(() => document.getElementById('noteTitleInput').focus(), 100);
  attachNoteEditorListeners();
}

function attachNoteEditorListeners() {
  const titleEl = document.getElementById('noteTitleInput');
  const bodyEl = document.getElementById('noteBodyInput');
  if (titleEl.dataset.listenersAttached) return;
  titleEl.addEventListener('input', onNoteEditorInput);
  bodyEl.addEventListener('input', onNoteEditorInput);
  titleEl.dataset.listenersAttached = 'true';
}

function onNoteEditorInput() {
  updateNoteWordCount();
  setNoteSaveStatus('Unsaved changes');
  clearTimeout(noteAutosaveTimer);
  noteAutosaveTimer = setTimeout(autosaveNote, 1500);
}

function updateNoteWordCount() {
  const body = document.getElementById('noteBodyInput').value;
  const words = body.trim() ? body.trim().split(/\s+/).length : 0;
  document.getElementById('noteWordCount').textContent = `${words} words · ${body.length} characters`;
}

function setNoteSaveStatus(text) {
  const el = document.getElementById('noteSaveStatus');
  if (el) el.textContent = text;
}

async function autosaveNote() {
  if (!currentEditingNoteId) return;
  const title = document.getElementById('noteTitleInput').value.trim();
  const body = document.getElementById('noteBodyInput').value;
  const snapshot = JSON.stringify({ title, body, subjectId: currentNoteSubjectId, pinned: currentNoteIsPinned });
  if (snapshot === noteLastSavedSnapshot) return;
  await doSaveNote({ title, body, silent: true });
  noteLastSavedSnapshot = snapshot;
}

async function doSaveNote({ title, body, silent }) {
  const notes = getNotes();
  const now = new Date().toISOString();
  let note = notes.find(n => n.id === currentEditingNoteId);
  const isNew = !note;

  if (isNew) {
    note = { id: currentEditingNoteId, subjectId: currentNoteSubjectId, title: title || '', body: body || '', pinned: currentNoteIsPinned, createdAt: now, updatedAt: now };
    notes.unshift(note);
  } else {
    note.title = title || '';
    note.body = body || '';
    note.subjectId = currentNoteSubjectId;
    note.pinned = currentNoteIsPinned;
    note.updatedAt = now;
    const idx = notes.findIndex(n => n.id === currentEditingNoteId);
    if (idx > 0) { const [n] = notes.splice(idx, 1); notes.unshift(n); }
  }
  setNotes(notes);

  if (firebaseAvailable && auth && auth.currentUser) {
    try { await db.collection('users').doc(auth.currentUser.uid).collection('notes').doc(note.id).set(note); }
    catch (err) { console.error('Firestore note save failed:', err); }
  }

  if (!silent) { setNoteSaveStatus('Saved'); showNotification('Note saved.', 'success'); }
  else setNoteSaveStatus('Saved ' + formatRelativeTime(now));

  renderNotesList();
  renderSubjectFilters();
}

async function saveNoteNow() {
  const title = document.getElementById('noteTitleInput').value.trim();
  const body = document.getElementById('noteBodyInput').value;
  if (!title && !body) { closeNoteEditor(); return; }
  clearTimeout(noteAutosaveTimer);
  await doSaveNote({ title, body, silent: false });
  closeNoteEditor();
}

function closeNoteEditor() {
  const title = document.getElementById('noteTitleInput').value.trim();
  const body = document.getElementById('noteBodyInput').value;
  const snapshot = JSON.stringify({ title, body, subjectId: currentNoteSubjectId, pinned: currentNoteIsPinned });
  if (snapshot !== noteLastSavedSnapshot && (title || body)) {
    if (!confirm('You have unsaved changes. Discard them?')) return;
  }
  document.getElementById('noteEditorSheet').classList.add('hidden');
  document.body.style.overflow = '';
  clearTimeout(noteAutosaveTimer);
  currentEditingNoteId = null;
  currentEditingNoteIsNew = false;
}

function closeNoteEditorBackdrop(e) {
  if (e.target.id === 'noteEditorSheet') closeNoteEditor();
}

function updateNoteSubjectUI() {
  const dot = document.getElementById('noteSubjectDot');
  const name = document.getElementById('noteSubjectName');
  if (!dot || !name) return;
  if (currentNoteSubjectId) {
    const subj = getNoteSubject(currentNoteSubjectId);
    if (subj) { dot.style.background = subj.color; name.textContent = subj.name; return; }
  }
  dot.style.background = '#94a3b8';
  name.textContent = 'Uncategorized';
}

function updateNotePinUI() {
  const btn = document.getElementById('notePinBtn');
  if (!btn) return;
  btn.classList.toggle('active', !!currentNoteIsPinned);
}

function toggleNotePin() {
  currentNoteIsPinned = !currentNoteIsPinned;
  updateNotePinUI();
  onNoteEditorInput();
}

// ---- Subject picker ----
function openSubjectPicker() {
  const list = document.getElementById('subjectPickerList');
  const subjects = getNoteSubjects();
  const notes = getNotes();

  const items = [];
  items.push(`
    <button onclick="pickSubject(null)" class="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/10 text-sm text-left">
      <span class="note-subject-dot" style="background:#94a3b8;"></span>
      <span class="flex-1">Uncategorized</span>
      ${currentNoteSubjectId === null ? '<i class="fa-solid fa-check text-emerald-400 text-xs"></i>' : ''}
    </button>
  `);

  subjects.forEach(s => {
    const count = notes.filter(n => n.subjectId === s.id).length;
    items.push(`
      <div class="flex items-center gap-1">
        <button onclick="pickSubject('${s.id}')" class="flex-1 flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/10 text-sm text-left">
          <span class="note-subject-dot" style="background:${s.color};"></span>
          <span class="flex-1">${escapeHtml(s.name)} <span class="opacity-50 text-xs">(${count})</span></span>
          ${currentNoteSubjectId === s.id ? '<i class="fa-solid fa-check text-emerald-400 text-xs"></i>' : ''}
        </button>
        <button onclick="openEditSubject('${s.id}')" class="p-2 text-xs opacity-50 hover:opacity-100" title="Edit"><i class="fa-solid fa-pen"></i></button>
        <button onclick="deleteSubject('${s.id}')" class="p-2 text-xs opacity-50 hover:opacity-100 text-rose-400" title="Delete"><i class="fa-solid fa-trash"></i></button>
      </div>
    `);
  });

  list.innerHTML = items.join('');
  document.getElementById('subjectPickerSheet').classList.remove('hidden');
}

function closeSubjectPicker() {
  document.getElementById('subjectPickerSheet').classList.add('hidden');
}

function closeSubjectPickerBackdrop(e) {
  if (e.target.id === 'subjectPickerSheet') closeSubjectPicker();
}

function pickSubject(id) {
  currentNoteSubjectId = id;
  updateNoteSubjectUI();
  onNoteEditorInput();
  closeSubjectPicker();
}

// ---- Edit subject ----
function openEditSubject(id) {
  editingSubjectId = id;
  const existing = id ? getNoteSubject(id) : null;
  document.getElementById('editSubjectTitle').textContent = existing ? 'Edit Subject' : 'New Subject';
  document.getElementById('editSubjectNameInput').value = existing?.name || '';
  editingSubjectColor = existing?.color || SUBJECT_COLORS[0];
  renderSubjectColorSwatches();
  closeSubjectPicker();
  document.getElementById('editSubjectSheet').classList.remove('hidden');
  setTimeout(() => document.getElementById('editSubjectNameInput').focus(), 100);
}

function renderSubjectColorSwatches() {
  const container = document.getElementById('editSubjectColorSwatches');
  container.innerHTML = '';
  SUBJECT_COLORS.forEach(color => {
    const swatch = document.createElement('button');
    swatch.type = 'button';
    swatch.className = 'w-8 h-8 rounded-full border-2 transition btn-hover';
    swatch.style.background = color;
    swatch.style.borderColor = (color === editingSubjectColor) ? '#fff' : 'transparent';
    swatch.onclick = () => { editingSubjectColor = color; renderSubjectColorSwatches(); };
    container.appendChild(swatch);
  });
}

function closeEditSubject() {
  document.getElementById('editSubjectSheet').classList.add('hidden');
  editingSubjectId = null;
}

function closeEditSubjectBackdrop(e) {
  if (e.target.id === 'editSubjectSheet') closeEditSubject();
}

async function saveSubject() {
  const name = document.getElementById('editSubjectNameInput').value.trim();
  if (!name) { showNotification('Please enter a subject name.', 'warning'); return; }
  const subjects = getNoteSubjects();
  let savedSubj = null;

  if (editingSubjectId) {
    const subj = subjects.find(s => s.id === editingSubjectId);
    if (subj) { subj.name = name; subj.color = editingSubjectColor; savedSubj = subj; }
  } else {
    savedSubj = { id: generateId(), name, color: editingSubjectColor };
    subjects.push(savedSubj);
  }
  setNoteSubjects(subjects);

  if (firebaseAvailable && auth && auth.currentUser && savedSubj) {
    try { await db.collection('users').doc(auth.currentUser.uid).collection('note_subjects').doc(savedSubj.id).set(savedSubj); }
    catch (err) { console.error(err); }
  }

  const wasEditing = !!editingSubjectId;
  closeEditSubject();
  updateNoteSubjectUI();
  renderSubjectFilters();
  renderNotesList();
  showNotification(wasEditing ? 'Subject updated.' : 'Subject created.', 'success');
}

async function deleteSubject(id) {
  if (!confirm('Delete this subject? Notes in it will become Uncategorized.')) return;
  const subjects = getNoteSubjects();
  const idx = subjects.findIndex(s => s.id === id);
  if (idx === -1) return;
  subjects.splice(idx, 1);
  setNoteSubjects(subjects);

  const notes = getNotes();
  notes.forEach(n => { if (n.subjectId === id) n.subjectId = null; });
  setNotes(notes);

  if (firebaseAvailable && auth && auth.currentUser) {
    try {
      const uid = auth.currentUser.uid;
      await db.collection('users').doc(uid).collection('note_subjects').doc(id).delete();
      for (const n of notes) {
        if (n.subjectId === null) await db.collection('users').doc(uid).collection('notes').doc(n.id).set({ subjectId: null }, { merge: true });
      }
    } catch (err) { console.error(err); }
  }

  if (currentNoteSubjectId === id) { currentNoteSubjectId = null; updateNoteSubjectUI(); }
  closeSubjectPicker();
  renderSubjectFilters();
  renderNotesList();
  showNotification('Subject deleted.', 'info');
}

// ---- Note action sheet ----
function openNoteActionSheet(noteId) {
  const note = getNotes().find(n => n.id === noteId);
  if (!note) return;
  currentActionNoteId = noteId;
  document.getElementById('noteActionTitle').textContent = note.title || 'Untitled note';
  document.getElementById('noteActionPinText').textContent = note.pinned ? 'Unpin' : 'Pin to top';
  document.getElementById('noteActionSheet').classList.remove('hidden');
}

function closeNoteActionSheet() {
  document.getElementById('noteActionSheet').classList.add('hidden');
}

function closeNoteActionSheetBackdrop(e) {
  if (e.target.id === 'noteActionSheet') closeNoteActionSheet();
}

function actionEditNote() {
  const id = currentActionNoteId;
  closeNoteActionSheet();
  if (id) openNoteEditor(id);
}

async function actionTogglePin() {
  const id = currentActionNoteId;
  if (!id) return;
  const notes = getNotes();
  const note = notes.find(n => n.id === id);
  if (!note) return;
  note.pinned = !note.pinned;
  note.updatedAt = new Date().toISOString();
  setNotes(notes);

  if (firebaseAvailable && auth && auth.currentUser) {
    try { await db.collection('users').doc(auth.currentUser.uid).collection('notes').doc(id).set({ pinned: note.pinned, updatedAt: note.updatedAt }, { merge: true }); }
    catch (err) { console.error(err); }
  }
  closeNoteActionSheet();
  renderNotesList();
  showNotification(note.pinned ? 'Pinned.' : 'Unpinned.', 'success');
}

function actionChangeSubject() {
  const id = currentActionNoteId;
  if (!id) return;
  closeNoteActionSheet();
  openNoteEditor(id);
  setTimeout(() => openSubjectPicker(), 200);
}

async function actionDuplicateNote() {
  const id = currentActionNoteId;
  if (!id) return;
  const notes = getNotes();
  const note = notes.find(n => n.id === id);
  if (!note) return;
  const copy = { ...note, id: generateId(), title: (note.title || 'Untitled') + ' (copy)', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  notes.unshift(copy);
  setNotes(notes);

  if (firebaseAvailable && auth && auth.currentUser) {
    try { await db.collection('users').doc(auth.currentUser.uid).collection('notes').doc(copy.id).set(copy); }
    catch (err) { console.error(err); }
  }
  closeNoteActionSheet();
  renderNotesList();
  renderSubjectFilters();
  showNotification('Duplicated.', 'success');
}

async function actionShareNote() {
  const id = currentActionNoteId;
  if (!id) return;
  const note = getNotes().find(n => n.id === id);
  if (!note) return;
  const text = `${note.title || 'Note'}\n\n${note.body || ''}`;
  closeNoteActionSheet();

  if (navigator.share) {
    try { await navigator.share({ title: note.title || 'Note', text }); } catch (e) {}
  } else if (navigator.clipboard && window.isSecureContext) {
    try { await navigator.clipboard.writeText(text); showNotification('Copied to clipboard.', 'success'); }
    catch (e) { showNotification('Could not copy.', 'error'); }
  } else showNotification('Sharing not available.', 'info');
}

async function actionDeleteNote() {
  const id = currentActionNoteId;
  if (!id) return;
  if (!confirm('Delete this note?')) return;
  const notes = getNotes();
  const idx = notes.findIndex(n => n.id === id);
  if (idx === -1) return;
  notes.splice(idx, 1);
  setNotes(notes);

  if (firebaseAvailable && auth && auth.currentUser) {
    try { await db.collection('users').doc(auth.currentUser.uid).collection('notes').doc(id).delete(); }
    catch (err) { console.error(err); }
  }
  closeNoteActionSheet();
  renderNotesList();
  renderSubjectFilters();
  showNotification('Note deleted.', 'info');
}

// ---- Save as Note (from reviewer) ----
function openSaveAsNote() {
  if (!currentResults) { showNotification('Nothing to save.', 'warning'); return; }
  const r = currentResults;
  document.getElementById('saveAsNoteTitle').value = 'Reviewer — ' + new Date().toLocaleDateString();

  const select = document.getElementById('saveAsNoteSubject');
  const subjects = getNoteSubjects();
  select.innerHTML = '<option value="">Uncategorized</option>' +
    subjects.map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('');

  const summaryCount = (r.summary || []).length;
  const fCount = (r.flashcards || []).length;
  const q = r.quiz || {};
  const qTotal = (q.trueFalse?.length || 0) + (q.identification?.length || 0) + (q.multipleChoice?.length || 0) + (q.enumeration?.length || 0);

  document.getElementById('saveAsNoteSummaryCount').textContent = summaryCount;
  document.getElementById('saveAsNoteFlashcardsCount').textContent = fCount;
  document.getElementById('saveAsNoteQuizCount').textContent = qTotal;

  document.getElementById('saveAsNoteIncludeSummary').checked = summaryCount > 0;
  document.getElementById('saveAsNoteIncludeFlashcards').checked = fCount > 0;
  document.getElementById('saveAsNoteIncludeQuiz').checked = qTotal > 0;

  document.getElementById('saveAsNoteSheet').classList.remove('hidden');
}

function closeSaveAsNote() {
  document.getElementById('saveAsNoteSheet').classList.add('hidden');
}

function closeSaveAsNoteBackdrop(e) {
  if (e.target.id === 'saveAsNoteSheet') closeSaveAsNote();
}

async function confirmSaveAsNote() {
  if (!currentResults) return;
  const title = document.getElementById('saveAsNoteTitle').value.trim() || 'Reviewer';
  const subjectId = document.getElementById('saveAsNoteSubject').value || null;
  const includeSummary = document.getElementById('saveAsNoteIncludeSummary').checked;
  const includeFlashcards = document.getElementById('saveAsNoteIncludeFlashcards').checked;
  const includeQuiz = document.getElementById('saveAsNoteIncludeQuiz').checked;

  const body = formatReviewerAsNote(currentResults, { includeSummary, includeFlashcards, includeQuiz });
  const now = new Date().toISOString();
  const note = { id: generateId(), subjectId, title, body, pinned: false, createdAt: now, updatedAt: now };
  const notes = getNotes();
  notes.unshift(note);
  setNotes(notes);

  if (firebaseAvailable && auth && auth.currentUser) {
    try { await db.collection('users').doc(auth.currentUser.uid).collection('notes').doc(note.id).set(note); }
    catch (err) { console.error(err); }
  }
  closeSaveAsNote();
  renderNotesList();
  renderSubjectFilters();
  showNotification('Saved as note!', 'success');
}

function formatReviewerAsNote(results, { includeSummary, includeFlashcards, includeQuiz }) {
  const lines = [];
  if (includeSummary && results.summary?.length) {
    lines.push('## Key Concepts');
    results.summary.forEach((s, i) => lines.push(`${i + 1}. ${s}`));
    lines.push('');
  }
  if (includeFlashcards && results.flashcards?.length) {
    lines.push('## Flashcards');
    results.flashcards.forEach(c => lines.push(`- ${c.front} — ${c.back}`));
    lines.push('');
  }
  if (includeQuiz) {
    const q = results.quiz || {};
    const hasAny = (q.trueFalse?.length || 0) + (q.identification?.length || 0) + (q.multipleChoice?.length || 0) + (q.enumeration?.length || 0);
    if (hasAny) {
      lines.push('## Practice Quiz');
      let n = 0;
      (q.trueFalse || []).forEach(x => { n++; lines.push(`${n}. ${x.question}`); lines.push(`   Answer: ${x.answer ? 'True' : 'False'}`); });
      (q.identification || []).forEach(x => { n++; lines.push(`${n}. ${x.question}`); lines.push(`   Answer: ${x.answer}`); });
      (q.multipleChoice || []).forEach(x => {
        n++;
        lines.push(`${n}. ${x.question}`);
        (x.options || []).forEach((o, i) => lines.push(`   ${String.fromCharCode(65 + i)}. ${o}`));
        const correct = x.options && x.correct >= 0 ? x.options[x.correct] : '?';
        lines.push(`   Answer: ${correct}`);
      });
      (q.enumeration || []).forEach(x => { n++; lines.push(`${n}. ${x.question}`); lines.push(`   Answer: ${x.answer}`); });
    }
  }
  return lines.join('\n').trim();
}
// ============================================================
// FLASHCARD STUDY MODE
// ============================================================
let studyQueue = [];
let studyOriginalQueue = [];
let studyIndex = 0;
let studyRevealed = false;
let studyRatings = {};
let studySessionStats = { easy: 0, hard: 0, forgot: 0 };
let studyShuffled = false;
let studyTouchStartX = 0;
let studyTouchStartY = 0;
let studyKbBound = false;

function flashcardKey(card) {
  const term = String(card.front || card.term || '').trim().toLowerCase();
  return term || String(card.back || card.definition || '').trim().toLowerCase();
}

function getFlashcardRatings() {
  return safeLocalStorageGet('acadhub_flashcard_ratings', {});
}
function setFlashcardRatings(map) {
  safeLocalStorageSet('acadhub_flashcard_ratings', map);
}

function openStudyMode() {
  const flashcards = (currentResults && currentResults.flashcards) || [];
  if (!flashcards.length) {
    showNotification('No flashcards to study.', 'warning');
    return;
  }

  studyQueue = flashcards.map((c, i) => ({
    index: i,
    front: c.front,
    back: c.back,
    key: flashcardKey(c)
  }));
  studyOriginalQueue = [...studyQueue];

  const opts = getStudyOptions();
  if (opts.shuffle) studyQueue = shuffleArray(studyQueue);

  studyIndex = 0;
  studyRevealed = false;
  studySessionStats = { easy: 0, hard: 0, forgot: 0 };
  studyShuffled = !!opts.shuffle;

  const shuffleBtn = document.getElementById('studyShuffleBtn');
  if (shuffleBtn) shuffleBtn.classList.toggle('active', studyShuffled);

  syncStudyOptionsUI();

  document.getElementById('studyModeOverlay').classList.remove('hidden');
  document.getElementById('studyCompleteOverlay').classList.add('hidden');
  document.body.style.overflow = 'hidden';

  bindStudyKeyboard();
  bindStudySwipe();
  renderStudyCard();
}

function exitStudyMode() {
  document.getElementById('studyModeOverlay').classList.add('hidden');
  document.getElementById('studyCompleteOverlay').classList.add('hidden');
  document.getElementById('studyOptionsPanel').classList.add('hidden');
  document.body.style.overflow = '';

  const flashcards = (currentResults && currentResults.flashcards) || [];
  if (flashcards.length) renderFlashcards(flashcards);
}

function renderStudyCard() {
  if (!studyQueue.length || studyIndex >= studyQueue.length) {
    showStudyComplete();
    return;
  }

  const card = studyQueue[studyIndex];
  document.getElementById('studyTerm').textContent = card.front;
  document.getElementById('studyDefinition').textContent = card.back;
  document.getElementById('studyCurrent').textContent = studyIndex + 1;
  document.getElementById('studyTotal').textContent = studyQueue.length;

  const divider = document.getElementById('studyDivider');
  const hint = document.getElementById('studyHint');
  const unrevealed = document.getElementById('studyUnrevealedActions');
  const revealed = document.getElementById('studyRevealedActions');

  if (studyRevealed) {
    divider.classList.remove('hidden');
    hint.textContent = 'Rate how you did';
    unrevealed.classList.add('hidden');
    revealed.classList.remove('hidden');
  } else {
    divider.classList.add('hidden');
    hint.textContent = 'Tap to reveal';
    unrevealed.classList.remove('hidden');
    revealed.classList.add('hidden');
  }

  const progressPct = Math.round((studyIndex / studyQueue.length) * 100);
  document.getElementById('studyProgressFill').style.width = progressPct + '%';
}

function flipStudyCard() {
  studyRevealed = !studyRevealed;
  renderStudyCard();
}

function studyNext() {
  if (studyIndex < studyQueue.length - 1) {
    studyIndex++;
    studyRevealed = false;
    renderStudyCard();
  } else {
    showStudyComplete();
  }
}

function studyPrev() {
  if (studyIndex > 0) {
    studyIndex--;
    studyRevealed = false;
    renderStudyCard();
  }
}

function rateStudyCard(rating) {
  const card = studyQueue[studyIndex];
  if (!card) return;

  studyRatings = getFlashcardRatings();
  studyRatings[card.key] = rating;
  setFlashcardRatings(studyRatings);

  studySessionStats[rating]++;

  const cardEl = document.getElementById('studyCard');
  cardEl.classList.add('swipe-left');
  setTimeout(() => {
    cardEl.classList.remove('swipe-left');

    const opts = getStudyOptions();

    studyQueue.splice(studyIndex, 1);

    if (rating === 'forgot' && opts.repeat) {
      const pos = Math.min(studyIndex + 3, studyQueue.length);
      studyQueue.splice(pos, 0, card);
    } else if (rating === 'hard' && opts.repeat) {
      const pos = Math.min(studyIndex + 6, studyQueue.length);
      studyQueue.splice(pos, 0, card);
    }

    if (studyIndex >= studyQueue.length) studyIndex = Math.max(0, studyQueue.length - 1);

    studyRevealed = false;

    if (!studyQueue.length) {
      showStudyComplete();
    } else {
      renderStudyCard();
    }
  }, 220);
}

function skipStudyCard() {
  const card = studyQueue.splice(studyIndex, 1)[0];
  studyQueue.push(card);
  if (studyIndex >= studyQueue.length) studyIndex = 0;
  studyRevealed = false;
  renderStudyCard();
}

function showStudyComplete() {
  const easy = studySessionStats.easy;
  const hard = studySessionStats.hard;
  const forgot = studySessionStats.forgot;

  document.getElementById('studySummaryEasy').textContent = easy;
  document.getElementById('studySummaryHard').textContent = hard;
  document.getElementById('studySummaryForgot').textContent = forgot;
  document.getElementById('studyMissedCount').textContent = hard + forgot;

  const missedBtn = document.getElementById('studyReviewMissedBtn');
  missedBtn.style.display = (hard + forgot > 0) ? 'block' : 'none';

  document.getElementById('studyCompleteOverlay').classList.remove('hidden');
}

function studyReviewMissed() {
  const missedKeys = Object.keys(studyRatings).filter(k =>
    studyRatings[k] === 'forgot' || studyRatings[k] === 'hard'
  );

  const flashcards = (currentResults && currentResults.flashcards) || [];
  studyQueue = flashcards
    .map((c, i) => ({ index: i, front: c.front, back: c.back, key: flashcardKey(c) }))
    .filter(c => missedKeys.includes(c.key));

  if (!studyQueue.length) {
    showNotification('No missed cards to review.', 'info');
    return;
  }

  studyIndex = 0;
  studyRevealed = false;
  studySessionStats = { easy: 0, hard: 0, forgot: 0 };
  document.getElementById('studyCompleteOverlay').classList.add('hidden');
  renderStudyCard();
}

function restartStudySession() {
  const flashcards = (currentResults && currentResults.flashcards) || [];
  studyQueue = flashcards.map((c, i) => ({ index: i, front: c.front, back: c.back, key: flashcardKey(c) }));
  if (studyShuffled) studyQueue = shuffleArray(studyQueue);
  studyIndex = 0;
  studyRevealed = false;
  studySessionStats = { easy: 0, hard: 0, forgot: 0 };
  document.getElementById('studyCompleteOverlay').classList.add('hidden');
  renderStudyCard();
}

function resetStudySession() {
  studyQueue = [...studyOriginalQueue];
  if (studyShuffled) studyQueue = shuffleArray(studyQueue);
  studyIndex = 0;
  studyRevealed = false;
  studySessionStats = { easy: 0, hard: 0, forgot: 0 };
  document.getElementById('studyOptionsPanel').classList.add('hidden');
  document.getElementById('studyCompleteOverlay').classList.add('hidden');
  renderStudyCard();
  showNotification('Session reset.', 'info');
}

function toggleStudyShuffle() {
  studyShuffled = !studyShuffled;
  const btn = document.getElementById('studyShuffleBtn');
  btn.classList.toggle('active', studyShuffled);

  const optShuffle = document.getElementById('optShuffle');
  if (optShuffle) optShuffle.checked = studyShuffled;

  const opts = getStudyOptions();
  opts.shuffle = studyShuffled;
  setStudyOptions(opts);

  if (studyShuffled) {
    studyQueue = shuffleArray(studyQueue);
    studyIndex = 0;
    studyRevealed = false;
    renderStudyCard();
  }
}

function toggleStudyOptions() {
  const panel = document.getElementById('studyOptionsPanel');
  panel.classList.toggle('hidden');
}

function getStudyOptions() {
  return safeLocalStorageGet('acadhub_study_options', {
    shuffle: false,
    repeat: true,
    hideTerm: false,
    kbHints: true
  });
}

function setStudyOptions(opts) {
  safeLocalStorageSet('acadhub_study_options', opts);
}

function syncStudyOptionsUI() {
  const opts = getStudyOptions();
  const s = document.getElementById('optShuffle');
  const r = document.getElementById('optRepeat');
  const h = document.getElementById('optHideTerm');
  const k = document.getElementById('optKbHints');
  if (s) s.checked = !!opts.shuffle;
  if (r) r.checked = opts.repeat !== false;
  if (h) h.checked = !!opts.hideTerm;
  if (k) k.checked = opts.kbHints !== false;
}

function applyStudyOptions() {
  const opts = {
    shuffle: document.getElementById('optShuffle').checked,
    repeat: document.getElementById('optRepeat').checked,
    hideTerm: document.getElementById('optHideTerm').checked,
    kbHints: document.getElementById('optKbHints').checked,
  };
  setStudyOptions(opts);

  if (opts.shuffle !== studyShuffled) {
    studyShuffled = opts.shuffle;
    document.getElementById('studyShuffleBtn').classList.toggle('active', studyShuffled);
    studyQueue = shuffleArray(studyQueue);
    studyIndex = 0;
    renderStudyCard();
  }
}

function bindStudyKeyboard() {
  if (studyKbBound) return;
  studyKbBound = true;
  document.addEventListener('keydown', (e) => {
    const overlay = document.getElementById('studyModeOverlay');
    if (!overlay || overlay.classList.contains('hidden')) return;

    const tag = document.activeElement && document.activeElement.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;

    if (e.key === ' ' || e.key === 'Spacebar') {
      e.preventDefault();
      flipStudyCard();
    } else if (e.key === 'ArrowLeft') {
      studyPrev();
    } else if (e.key === 'ArrowRight') {
      studyNext();
    } else if (e.key === 'Escape') {
      exitStudyMode();
    } else if (studyRevealed && e.key === '1') {
      rateStudyCard('forgot');
    } else if (studyRevealed && e.key === '2') {
      rateStudyCard('hard');
    } else if (studyRevealed && e.key === '3') {
      rateStudyCard('easy');
    }
  });
}

function bindStudySwipe() {
  const area = document.getElementById('studyCardArea');
  if (!area || area.dataset.swipeBound) return;
  area.dataset.swipeBound = 'true';

  area.addEventListener('touchstart', (e) => {
    const t = e.changedTouches[0];
    studyTouchStartX = t.screenX;
    studyTouchStartY = t.screenY;
  }, { passive: true });

  area.addEventListener('touchend', (e) => {
    const t = e.changedTouches[0];
    const dx = t.screenX - studyTouchStartX;
    const dy = t.screenY - studyTouchStartY;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);

    if (absX < 60 || absX < absY) return;

    if (dx > 0) {
      studyPrev();
    } else {
      if (studyRevealed) skipStudyCard();
      else studyNext();
    }
  }, { passive: true });
}
  
// TRANSFORM BACKEND RESPONSE
function transformBackendResponse(backendData) {
  const summary = backendData.summary || [];
  
  const flashcards = (backendData.flashcards || []).map(card => ({
    front: card.term || card.front || 'Term',
    back: card.definition || card.back || 'Definition'
  }));

  const quiz = {
    trueFalse: [],
    identification: [],
    multipleChoice: [],
    fillBlank: [],
    enumeration: []
  };

  (backendData.quiz || []).forEach(question => {
    const questionText = String(question.question || 'Question');
    switch (question.type) {
      case 'truefalse':
        quiz.trueFalse.push({
          question: questionText.replace(/^True or False: ["']?|["']?$/g, ''),
          answer: question.answer === true || String(question.answer).toLowerCase() === 'true'
        });
        break;
      case 'identification':
        quiz.identification.push({
          question: questionText,
          answer: String(question.answer || 'Unknown')
        });
        break;
      case 'multiplechoice':
      case 'what':
      case 'who':
      case 'where':
      case 'when':
        quiz.multipleChoice.push({
          question: questionText,
          options: question.options || [],
          correct: (question.options || []).indexOf(question.answer)
        });
        break;
      case 'enumeration':
        quiz.enumeration.push({
          question: questionText,
          answer: String(question.answer || 'Unknown')
        });
        break;
    }
  });

  return { summary, flashcards, quiz, quality: backendData.quality || null };
}

// RENDER FUNCTIONS
function renderSummary(summary) {
  const list = document.getElementById('summaryList');
  list.innerHTML = '';

  if (!summary || summary.length === 0) {
    list.innerHTML = '<li class="text-sm opacity-50">No summary available.</li>';
    return;
  }

  summary.forEach((point, index) => {
    const li = document.createElement('li');
    li.className = 'bg-white/5 p-3 rounded-lg reveal-item';
    li.style.animationDelay = (index * 0.1) + 's';
    li.innerHTML = `<span class="text-indigo-400 font-semibold mr-2">${index + 1}.</span>${point}`;
    list.appendChild(li);
  });
}

function renderFlashcards(flashcards) {
  const grid = document.getElementById('flashcardGrid');
  grid.innerHTML = '';

  const studyBtn = document.getElementById('studyModeBtn');
  if (studyBtn) {
    studyBtn.classList.toggle('hidden', !flashcards || flashcards.length === 0);
  }

  if (!flashcards || flashcards.length === 0) {
    grid.innerHTML = '<p class="text-sm opacity-50 text-center col-span-full">No flashcards generated.</p>';
    return;
  }

  const ratings = getFlashcardRatings();

  flashcards.forEach((card, index) => {
    const div = document.createElement('div');
    div.className = 'flashcard reveal-item';
    div.style.animationDelay = (index * 0.05) + 's';
    div.onclick = function() { this.classList.toggle('flipped'); };

    div.innerHTML = `
      <div class="flashcard-inner">
        <div class="flashcard-front">
          <p class="text-sm font-semibold text-center">${card.front}</p>
          <p class="text-xs text-center opacity-50 mt-2">Click to flip</p>
        </div>
        <div class="flashcard-back">
          <p class="text-sm text-center">${card.back}</p>
        </div>
      </div>
    `;

    const key = flashcardKey(card);
    const rating = ratings[key];
    if (rating) {
      const badge = document.createElement('span');
      badge.className = 'study-badge ' + rating;
      badge.textContent = rating === 'easy' ? '✓' : rating === 'hard' ? '~' : '!';
      div.appendChild(badge);
    }

    grid.appendChild(div);
  });
}
function renderQuiz(quiz) {
  const container = document.getElementById('quizContainer');
  container.innerHTML = '';

  let questionNumber = 0;

  (quiz.trueFalse || []).forEach((q) => {
    questionNumber++;
    const div = document.createElement('div');
    div.className = 'bg-white/5 p-4 rounded-lg reveal-item';
    div.innerHTML = `
      <p class="text-sm font-semibold mb-2">${questionNumber}. ${q.question}</p>
      <div class="flex gap-2">
        <button class="quiz-option px-4 py-2 bg-white/10 rounded-lg text-sm" onclick="checkAnswer(this, ${q.answer}, true)">True</button>
        <button class="quiz-option px-4 py-2 bg-white/10 rounded-lg text-sm" onclick="checkAnswer(this, ${q.answer}, false)">False</button>
      </div>
    `;
    container.appendChild(div);
  });

  (quiz.identification || []).forEach((q) => {
    questionNumber++;
    const div = document.createElement('div');
    div.className = 'bg-white/5 p-4 rounded-lg reveal-item';
    div.innerHTML = `
      <p class="text-sm font-semibold mb-2">${questionNumber}. ${q.question}</p>
      <button class="quiz-option px-3 py-1 bg-white/10 rounded-lg text-sm mt-2" onclick="revealAnswer(this)">Show Answer</button>
      <p class="text-xs text-emerald-400 mt-2 hidden">Answer: ${q.answer}</p>
    `;
    container.appendChild(div);
  });

  (quiz.multipleChoice || []).forEach((q) => {
    questionNumber++;
    const div = document.createElement('div');
    div.className = 'bg-white/5 p-4 rounded-lg reveal-item';
    let optionsHTML = '';
    (q.options || []).forEach((option, optIndex) => {
      optionsHTML += `
        <button class="quiz-option w-full text-left px-4 py-2 bg-white/10 rounded-lg text-sm mt-1"
                onclick="checkMCQAnswer(this, ${q.correct}, ${optIndex})">
          ${String.fromCharCode(65 + optIndex)}. ${option}
        </button>
      `;
    });

    div.innerHTML = `
      <p class="text-sm font-semibold mb-2">${questionNumber}. ${q.question}</p>
      ${optionsHTML}
    `;
    container.appendChild(div);
  });

  (quiz.enumeration || []).forEach((q) => {
    questionNumber++;
    const div = document.createElement('div');
    div.className = 'bg-white/5 p-4 rounded-lg reveal-item';
    div.innerHTML = `
      <p class="text-sm font-semibold mb-2">${questionNumber}. ${q.question}</p>
      <button class="quiz-option px-3 py-1 bg-white/10 rounded-lg text-sm mt-2" onclick="revealAnswer(this)">Show Answer</button>
      <p class="text-xs text-emerald-400 mt-2 hidden">Answer: ${q.answer}</p>
    `;
    container.appendChild(div);
  });
}

// QUIZ INTERACTION
function checkAnswer(btn, correctAnswer, userAnswer) {
  const parent = btn.parentElement;
  const buttons = parent.querySelectorAll('.quiz-option');

  buttons.forEach(b => {
    b.disabled = true;
    b.classList.remove('bg-white/10');
  });

  if (userAnswer === correctAnswer) {
    btn.classList.add('bg-emerald-500/20', 'text-emerald-400');
  } else {
    btn.classList.add('bg-rose-500/20', 'text-rose-400');
    buttons.forEach(b => {
      const isCorrect = (b.textContent.trim() === 'True' && correctAnswer === true) ||
                       (b.textContent.trim() === 'False' && correctAnswer === false);
      if (isCorrect) {
        b.classList.add('bg-emerald-500/20', 'text-emerald-400');
      }
    });
  }
}

function checkMCQAnswer(btn, correctIndex, userIndex) {
  const parent = btn.parentElement;
  const buttons = parent.querySelectorAll('.quiz-option');

  buttons.forEach((b, index) => {
    b.disabled = true;
    b.classList.remove('bg-white/10');

    if (index === correctIndex) {
      b.classList.add('bg-emerald-500/20', 'text-emerald-400');
    } else if (index === userIndex && userIndex !== correctIndex) {
      b.classList.add('bg-rose-500/20', 'text-rose-400');
    }
  });
}

function revealAnswer(btn) {
  const answerText = btn.nextElementSibling;
  if (answerText) {
    answerText.classList.remove('hidden');
  }
  btn.disabled = true;
  btn.classList.add('opacity-50');
}

// ============================================================
// SAVE TO LIBRARY
// ============================================================
// ============================================================
// SAVE TO LIBRARY (shared helper)
// ============================================================
async function persistLibraryItem(title, data) {
  const saveItem = {
    id: generateId(),
    title,
    date: new Date().toISOString(),
    data
  };

  const saved = safeLocalStorageGet('acadhub_saved', []);
  saved.unshift(saveItem);
  const savedOk = safeLocalStorageSet('acadhub_saved', saved);

  if (!savedOk) {
    showNotification('Could not save — local storage is full. Try deleting old reviewers.', 'error');
    return false;
  }

  if (firebaseAvailable && auth && auth.currentUser) {
    try {
      await db.collection('users').doc(auth.currentUser.uid).collection('library').doc(saveItem.id).set(saveItem);
    } catch (err) {
      console.error('Error saving to Firebase:', err);
      showNotification('Saved locally, but cloud sync failed.', 'warning');
      renderSavedList();
      return true;
    }
  }

  showNotification('Saved to library!', 'success');
  renderSavedList();
  return true;
}


async function persistLibraryItemWithMeta(title, data, meta = {}) {
  const saveItem = {
    id: generateId(),
    title,
    date: new Date().toISOString(),
    author: meta.author || null,
    subject: meta.subject || null,
    data,
  };

  const saved = safeLocalStorageGet('acadhub_saved', []);
  saved.unshift(saveItem);
  const ok = safeLocalStorageSet('acadhub_saved', saved);
  if (!ok) {
    showNotification('Could not save — local storage is full.', 'error');
    return false;
  }

  if (firebaseAvailable && auth && auth.currentUser) {
    try {
      await db.collection('users').doc(auth.currentUser.uid)
        .collection('library').doc(saveItem.id).set(saveItem);
    } catch (err) {
      console.error('Cloud save failed:', err);
      showNotification('Saved locally, but cloud sync failed.', 'warning');
      renderSavedList();
      return true;
    }
  }

  showNotification('Saved to library!', 'success');
  renderSavedList();
  return true;
}
async function saveToLibrary() {
  if (!currentResults) {
    showNotification('No results to save.', 'warning');
    return;
  }

  await persistLibraryItem('Reviewer ' + new Date().toLocaleDateString(), currentResults);
}// TEST MY LIMITS
function setDifficulty(difficulty) {
  testDifficulty = difficulty;

  ['easy', 'medium', 'hard'].forEach(d => {
    const btn = document.getElementById('diff' + d.charAt(0).toUpperCase() + d.slice(1));
    if (btn) {
      btn.classList.remove('bg-indigo-600');
      btn.classList.add('bg-white/10');
    }
  });

  const selectedBtn = document.getElementById('diff' + difficulty.charAt(0).toUpperCase() + difficulty.slice(1));
  if (selectedBtn) {
    selectedBtn.classList.remove('bg-white/10');
    selectedBtn.classList.add('bg-indigo-600');
  }
}

async function startTest() {
  const notes = document.getElementById('testNotes').value.trim();
const selectedFiles = fileStore.test;
const hasFile = selectedFiles.length > 0;

  
  if (!notes && !hasFile) {
    showNotification('Please paste notes or upload a document.', 'warning');
    return;
  }

  const formData = new FormData();
if (notes) formData.append('notes', notes);
if (hasFile) {
  selectedFiles.forEach(f => formData.append('file', f, f.name));
}
  formData.append('difficulty', testDifficulty);
  formData.append('use_internet', document.getElementById('useTestInternet').checked);

  const startBtn = document.getElementById('startTestBtn');
  const originalText = startBtn.innerHTML;
  startBtn.disabled = true;
  startBtn.innerHTML = '<i class="fa-solid fa-spinner animate-spin mr-2"></i>Generating...';

  try {
    const result = await apiCall(API_ENDPOINTS.generateTest, { formData });

    testQuestions = (result.questions || []).map(q => {
      const options = q.options || [];
      let correctIndex = options.indexOf(q.answer);
      
      if (q.type === 'truefalse') {
        return {
          question: q.question.replace(/^True or False: ["']?|["']?$/g, ''),
          options: ['True', 'False'],
          correct: q.answer === 'True' ? 0 : 1,
          userAnswer: null,
          type: q.type,
          explanation: q.explanation || ''
        };
      }
      
      return {
        question: q.question,
        options: options,
        correct: correctIndex,
        userAnswer: null,
        type: q.type,
        explanation: q.explanation || ''
      };
    });

    if (testQuestions.length === 0) {
      throw new Error('Could not generate questions. Please add more notes.');
    }

    currentQuestionIndex = 0;
    testScore = 0;

    document.getElementById('startTestBtn').classList.add('hidden');
    document.getElementById('testQuizContainer').classList.remove('hidden');
    document.getElementById('testResultsContainer').classList.add('hidden');
    document.getElementById('reviewContainer').classList.add('hidden');

    showTestQuestion();

  } catch (err) {
    console.error('Error starting test:', err);
    showNotification(err.message || 'Error generating test questions.', 'error');
  } finally {
    startBtn.disabled = false;
    startBtn.innerHTML = originalText;
  }
}

function showTestQuestion() {
  const question = testQuestions[currentQuestionIndex];
  const questionText = document.getElementById('testQuestionText');
  const optionsContainer = document.getElementById('testOptionsContainer');
  const counter = document.getElementById('questionCounter');

  counter.textContent = 'Question ' + (currentQuestionIndex + 1) + ' / ' + testQuestions.length;
  questionText.textContent = question.question;
  optionsContainer.innerHTML = '';

  if (question.options && question.options.length > 0) {
    question.options.forEach((option, index) => {
      const button = document.createElement('button');
      button.className = 'quiz-option w-full text-left px-4 py-3 bg-white/10 rounded-lg text-sm mt-2';
      button.textContent = String.fromCharCode(65 + index) + '. ' + option;
      button.onclick = () => answerTestQuestion(index);
      optionsContainer.appendChild(button);
    });
  } else {
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Type your answer...';
    input.className = 'w-full px-4 py-3 bg-white/10 border border-white/10 rounded-lg text-sm mt-2';
    input.id = 'testAnswerInput';
    optionsContainer.appendChild(input);
    
    const submitBtn = document.createElement('button');
    submitBtn.className = 'quiz-option w-full text-left px-4 py-3 bg-indigo-600 rounded-lg text-sm mt-2';
    submitBtn.textContent = 'Submit Answer';
    submitBtn.onclick = () => {
      const userAnswer = document.getElementById('testAnswerInput').value;
      answerTestQuestion(userAnswer);
    };
    optionsContainer.appendChild(submitBtn);
  }

  document.getElementById('nextTestBtn').classList.add('hidden');
}

function answerTestQuestion(userAnswer) {
  const question = testQuestions[currentQuestionIndex];
  
  if (question.options && question.options.length > 0) {
    question.userAnswer = userAnswer;
    if (userAnswer === question.correct) {
      testScore++;
    }
    
    const buttons = document.querySelectorAll('#testOptionsContainer .quiz-option');
    buttons.forEach((btn, index) => {
      btn.disabled = true;
      btn.classList.remove('bg-white/10');
      
      if (index === question.correct) {
        btn.classList.add('bg-emerald-500/20', 'text-emerald-400');
      } else if (index === userAnswer && userAnswer !== question.correct) {
        btn.classList.add('bg-rose-500/20', 'text-rose-400');
      }
    });
  } else {
    question.userAnswer = userAnswer;
    if (userAnswer && userAnswer.trim().length > 0) {
      testScore++;
    }
  }

  const nextBtn = document.getElementById('nextTestBtn');
  nextBtn.classList.remove('hidden');
  nextBtn.textContent = (currentQuestionIndex === testQuestions.length - 1) ? 'Finish' : 'Next';
}

function nextTestQuestion() {
  currentQuestionIndex++;

  if (currentQuestionIndex < testQuestions.length) {
    showTestQuestion();
  } else {
    showTestResults();
  }
}

function showTestResults() {
  document.getElementById('testQuizContainer').classList.add('hidden');
  document.getElementById('testResultsContainer').classList.remove('hidden');

  document.getElementById('testCorrectCount').textContent = testScore;
  document.getElementById('testTotalCount').textContent = testQuestions.length;

  const percentage = Math.round((testScore / testQuestions.length) * 100);
  document.getElementById('testPercentage').textContent = percentage + '% ' + getGradeMessage(percentage);

  document.getElementById('reviewBtn').classList.remove('hidden');
}

function getGradeMessage(percentage) {
  if (percentage >= 90) return 'Excellent! 🎉';
  if (percentage >= 80) return 'Great job! 👏';
  if (percentage >= 70) return 'Good work! 💪';
  if (percentage >= 60) return 'Keep practicing! 📚';
  return 'Needs improvement. Don\'t give up! 🌟';
}

function resetTest() {
  document.getElementById('testResultsContainer').classList.add('hidden');
  document.getElementById('reviewContainer').classList.add('hidden');
  document.getElementById('startTestBtn').classList.remove('hidden');
  document.getElementById('testQuizContainer').classList.add('hidden');
  document.getElementById('testNotes').value = '';
document.getElementById('testFileInput').value = '';
clearSelectedFiles('test');

  testScore = 0;
  currentQuestionIndex = 0;
  testQuestions = [];
}

function showReview() {
  const container = document.getElementById('reviewContainer');
  container.classList.remove('hidden');
  container.innerHTML = '';

  testQuestions.forEach((question, index) => {
    const div = document.createElement('div');
    const isCorrect = question.userAnswer === question.correct;
    div.className = 'review-item ' + (isCorrect ? 'correct' : 'incorrect');

    div.innerHTML = `
      <p class="text-sm font-semibold">${index + 1}. ${question.question}</p>
      <p class="text-xs mt-1">
        <span class="text-emerald-400">Correct: ${question.options ? question.options[question.correct] : 'N/A'}</span>
        ${!isCorrect ? `<br><span class="text-rose-400">Your answer: ${question.options ? question.options[question.userAnswer] || 'No answer' : question.userAnswer || 'No answer'}</span>` : ''}
      </p>
    `;

    container.appendChild(div);
  });
}

// ============================================================
// CALENDAR FUNCTIONS
// ============================================================
function renderCalendar() {
  const grid = document.getElementById('calendarGrid');
  const label = document.getElementById('calendarMonthLabel');
  if (!grid || !label) return;

  label.textContent = new Date(calendarYear, calendarMonth).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const firstDay = new Date(calendarYear, calendarMonth, 1).getDay();
  const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();

  let cells = '';
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  dayNames.forEach(d => {
    cells += `<div class="calendar-day-header">${d}</div>`;
  });

  for (let i = 0; i < firstDay; i++) {
    cells += '<div class="calendar-day empty"></div>';
  }

  const today = new Date();
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(calendarYear, calendarMonth, day);
    const dateStr = `${calendarYear}-${String(calendarMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const isToday = date.toDateString() === today.toDateString();
    const isSelected = selectedCalendarDate === dateStr;

    cells += `
      <div class="calendar-day ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''}" onclick="selectCalendarDate('${dateStr}')">
        <span>${day}</span>
      </div>
    `;
  }

  grid.innerHTML = cells;
  const selectedTasks = document.getElementById('selectedDayTasks');
  if (selectedTasks) selectedTasks.innerHTML = '<p class="text-sm opacity-50">Task planning is disabled.</p>';
}

function selectCalendarDate(dateStr) {
  selectedCalendarDate = dateStr;
  renderCalendar();
}

function changeMonth(delta) {
  calendarMonth += delta;
  if (calendarMonth < 0) { calendarMonth = 11; calendarYear--; }
  else if (calendarMonth > 11) { calendarMonth = 0; calendarYear++; }
  renderCalendar();
}

function toggleReminders() {
  const enabled = document.getElementById('reminderToggle').checked;
  if (enabled) showNotification('Reminders enabled!', 'success');
  else showNotification('Reminders disabled.', 'info');
}
// ============================================================
// LIBRARY FUNCTIONS
// ============================================================
function renderSavedList() {
  const container = document.getElementById('savedList');
  const emptyMsg = document.getElementById('emptyLibrary');
  if (!container) return;

  const saved = safeLocalStorageGet('acadhub_saved', []);
  container.innerHTML = '';

  if (saved.length === 0) {
    if (emptyMsg) emptyMsg.style.display = 'block';
    return;
  }
  if (emptyMsg) emptyMsg.style.display = 'none';

  saved.forEach((item, index) => {
    const div = document.createElement('div');
    div.className = 'saved-card bg-white/5 border border-white/10 rounded-lg p-3';

    const subjectPill = item.subject
      ? `<span class="subject-pill" style="background:${item.subject.color}22; color:${item.subject.color}; border:1px solid ${item.subject.color}55;">
           <i class="fa-solid fa-tag" style="font-size:0.6rem;"></i>${item.subject.name}
         </span>`
      : '';

    div.innerHTML = `
      <div class="flex items-center justify-between gap-2">
        <div class="min-w-0 flex-1">
          <p class="text-sm font-medium truncate">${item.title || 'Untitled Reviewer'}</p>
          <p class="text-xs opacity-50">${item.date ? new Date(item.date).toLocaleDateString() : 'No date'}</p>
          ${subjectPill}
        </div>
        <button class="card-menu-btn btn-hover" onclick="openItemActionSheet(${index})" title="More options">
          <i class="fa-solid fa-ellipsis-vertical text-xs"></i>
        </button>
      </div>
    `;

    let pressTimer = null;
    let moved = false;

    div.addEventListener('touchstart', () => {
      moved = false;
      pressTimer = setTimeout(() => {
        if (!moved) {
          if (navigator.vibrate) navigator.vibrate(15);
          openItemActionSheet(index);
        }
      }, 500);
    }, { passive: true });

    div.addEventListener('touchmove', () => {
      moved = true;
      clearTimeout(pressTimer);
    }, { passive: true });

    div.addEventListener('touchend', () => clearTimeout(pressTimer));

    container.appendChild(div);
  });
}
function loadSavedItem(index) {
  const saved = safeLocalStorageGet('acadhub_saved', []);
  const item = saved[index];

  if (!item || !item.data) return;

  switchTab('reviewer');

  document.getElementById('resultsContainer').classList.remove('hidden');
  renderSummary(item.data.summary);
  renderFlashcards(item.data.flashcards);
  renderQuiz(item.data.quiz);

currentResults = {
  ...item.data,
  title: item.title,
  author: item.author || null,
  subject: item.subject || null,
};
  
 document.getElementById('saveToLibraryBtn').classList.add('hidden');
// Allow sharing items loaded from the library too
document.getElementById('shareReviewerBtn').classList.remove('hidden');
document.getElementById('saveAsNoteBtn').classList.remove('hidden');
  
updateResultsNavCounts();
initResultsNav();
  
}

// ============================================================
// QUICK SUMMARIZE (Gemini)
// ============================================================
let previewDebounceTimer = null;

function toggleQuickSummaryKey() {
  const container = document.getElementById('quickSummaryKeyContainer');
  container.classList.toggle('hidden');
  if (!container.classList.contains('hidden')) {
    document.getElementById('quickSummaryApiKey').value = safeLocalStorageGet('quick_summary_gemini_key', '');
  }
}

function getQuickSummaryApiKey() {
  const input = document.getElementById('quickSummaryApiKey');
  const typed = input ? input.value.trim() : '';
  if (typed) {
    safeLocalStorageSet('quick_summary_gemini_key', typed);
    return typed;
  }
  return safeLocalStorageGet('quick_summary_gemini_key', '');
}

async function requestSummaryOnly(apiKey) {
  const notes = document.getElementById('studyNotes').value.trim();
  const fileInput = document.getElementById('fileInput');
  const hasFile = fileInput.files.length > 0;

  if (!notes && !hasFile) return null;

  const formData = new FormData();
  if (notes) formData.append('notes', notes);
  if (hasFile) formData.append('file', fileInput.files[0]);
  formData.append('api_key', apiKey);
  formData.append('provider', 'gemini');

  const result = await apiCall(API_ENDPOINTS.summary, { formData });
  return Array.isArray(result.summary) ? result.summary : [];
}

function renderQuickSummaryList(summary, targetId) {
  const list = document.getElementById(targetId);
  if (!list) return;
  list.innerHTML = '';

  (summary || []).forEach((point, index) => {
    const li = document.createElement('li');
    if (targetId === 'quickSummaryList') {
      li.className = 'bg-white/5 p-3 rounded-lg reveal-item';
      li.innerHTML = `<span class="text-indigo-400 font-semibold mr-2">${index + 1}.</span>${point}`;
    } else {
      li.textContent = `• ${point}`;
    }
    list.appendChild(li);
  });
}

async function quickSummarize() {
  const notes = document.getElementById('studyNotes').value.trim();
  const fileInput = document.getElementById('fileInput');
  const hasFile = fileInput.files.length > 0;

  if (!notes && !hasFile) {
    showNotification('Please paste notes or upload a document first.', 'warning');
    return;
  }

  const apiKey = getQuickSummaryApiKey();
  if (!apiKey) {
    showNotification('Please enter your Gemini API key (tap "Gemini Key").', 'error');
    document.getElementById('quickSummaryKeyContainer').classList.remove('hidden');
    return;
  }

  openQuickSummarySheet();
  document.getElementById('quickSummaryLoading').classList.remove('hidden');
  document.getElementById('quickSummaryList').innerHTML = '';
  document.getElementById('quickSummaryEmpty').classList.add('hidden');

  try {
    const summary = await requestSummaryOnly(apiKey);
    renderQuickSummaryList(summary, 'quickSummaryList');

    const saveBtn = document.getElementById('saveQuickSummaryBtn');

    if (!summary || summary.length === 0) {
      document.getElementById('quickSummaryEmpty').classList.remove('hidden');
      lastQuickSummary = null;
      saveBtn.classList.add('hidden');
    } else {
      renderQuickSummaryList(summary, 'previewSummaryList');
      document.getElementById('previewSummaryBox').classList.remove('hidden');
      lastQuickSummary = summary;
      saveBtn.classList.remove('hidden');
    }
  } catch (err) {
    console.error('Quick summarize error:', err);
    showNotification(err.message || 'Error generating quick summary.', 'error');
    closeQuickSummarySheet();
  } finally {
    document.getElementById('quickSummaryLoading').classList.add('hidden');
  }
}

function openQuickSummarySheet() {
  document.getElementById('quickSummarySheet').classList.remove('hidden');
}

function closeQuickSummarySheet() {
  document.getElementById('quickSummarySheet').classList.add('hidden');
}

function closeQuickSummarySheetBackdrop(e) {
  if (e.target.id === 'quickSummarySheet') closeQuickSummarySheet();
}

// ---- Auto live preview (debounced, no popup) ----
function scheduleLivePreview() {
  clearTimeout(previewDebounceTimer);
  previewDebounceTimer = setTimeout(runLivePreview, 1200);
}

async function runLivePreview() {
  const notes = document.getElementById('studyNotes').value.trim();
  const fileInput = document.getElementById('fileInput');
  const hasFile = fileInput.files.length > 0;

  if (!notes && !hasFile) {
    document.getElementById('previewSummaryBox').classList.add('hidden');
    return;
  }

  const apiKey = getQuickSummaryApiKey();
  if (!apiKey) return;

  try {
    const summary = await requestSummaryOnly(apiKey);
    if (summary && summary.length > 0) {
      renderQuickSummaryList(summary, 'previewSummaryList');
      document.getElementById('previewSummaryBox').classList.remove('hidden');
    }
  } catch (err) {
    console.error('Live preview error:', err);
  }
}

function initQuickSummaryListeners() {
  const notesEl = document.getElementById('studyNotes');
  const fileEl = document.getElementById('fileInput');
  if (notesEl) notesEl.addEventListener('input', scheduleLivePreview);
  if (fileEl) fileEl.addEventListener('change', scheduleLivePreview);
}
// ============================================================
// AUTHENTICATION
// ============================================================
function closeAuthModal() {
  document.getElementById('authModal').classList.add('hidden');
}

function updateAuthUI() {
  const user = (firebaseAvailable && auth) ? auth.currentUser : null;
  const emailInput = document.getElementById('authEmail');
  const passInput = document.getElementById('authPassword');
  const nameFields = document.getElementById('authNameFields');
  const btn = document.getElementById('authBtnText');
  const title = document.getElementById('authTitle');
  const subtitle = document.getElementById('authSubtitle');
  const toggleText = document.getElementById('authToggleText');
  const toggleBtn = document.getElementById('authToggleBtn');

  if (user) {
    title.textContent = 'Account';
    subtitle.textContent = 'You are logged in as ' + user.email;
    emailInput.classList.add('hidden');
    passInput.classList.add('hidden');
    nameFields.classList.add('hidden');
    toggleText.textContent = '';
    toggleBtn.textContent = '';
    btn.textContent = 'Logout';
  } else {
    title.textContent = isSignUpMode ? 'Sign Up' : 'Login';
    subtitle.textContent = isSignUpMode ? 'Create an account to save your data.' : 'Login to save your data and access all features.';
    emailInput.classList.remove('hidden');
    passInput.classList.remove('hidden');
    nameFields.classList.toggle('hidden', !isSignUpMode);
    toggleText.textContent = isSignUpMode ? 'Already have an account?' : 'Don\'t have an account?';
    toggleBtn.textContent = isSignUpMode ? 'Login' : 'Sign Up';
    btn.textContent = isSignUpMode ? 'Sign Up' : 'Login';
  }

  document.getElementById('authError').classList.add('hidden');
}
async function saveQuickSummaryToLibrary() {
  if (!lastQuickSummary || lastQuickSummary.length === 0) {
    showNotification('No summary to save.', 'warning');
    return;
  }

  const data = {
    summary: lastQuickSummary,
    flashcards: [],
    quiz: {},
    quality: null,
    timestamp: new Date().toISOString()
  };

  const ok = await persistLibraryItem('Quick Summary ' + new Date().toLocaleDateString(), data);
  if (ok) closeQuickSummarySheet();
}
function toggleAuthMode() {
  isSignUpMode = !isSignUpMode;
  updateAuthUI();
}

async function handleAuth() {
  if (!firebaseAvailable) {
    showNotification('Firebase authentication is not available offline.', 'warning');
    return;
  }

  if (auth.currentUser) {
    await logout();
    return;
  }

  const email = document.getElementById('authEmail').value.trim();
  const password = document.getElementById('authPassword').value.trim();
  const errorEl = document.getElementById('authError');

  errorEl.classList.add('hidden');

  if (!email || !password) {
    errorEl.textContent = 'Please fill in all fields.';
    errorEl.classList.remove('hidden');
    return;
  }

  try {
    if (isSignUpMode) {
      const firstName = document.getElementById('authFirstName').value.trim();
      const lastName = document.getElementById('authLastName').value.trim();

      if (!firstName || !lastName) {
        errorEl.textContent = 'Please enter your first and last name.';
        errorEl.classList.remove('hidden');
        return;
      }

      const userCredential = await auth.createUserWithEmailAndPassword(email, password);
      await db.collection('users').doc(userCredential.user.uid).set({
        firstName,
        lastName,
        email,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      showNotification('Account created successfully!', 'success');
    } else {
      await auth.signInWithEmailAndPassword(email, password);
      showNotification('Logged in successfully!', 'success');
    }

    closeAuthModal();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.classList.remove('hidden');
  }
}

async function logout() {
  if (firebaseAvailable && auth) {
    try {
      await auth.signOut();
    } catch (err) {
      console.error('Logout error:', err);
    }
  }
  cachedAuthorName = null;
  currentSharedTitle = '';
  currentSharedAuthor = null;
  currentSharedSubject = null;
  closeAuthModal();
  showNotification('Logged out successfully.', 'info');
}
async function migrateFirestoreData(user) {
  if (!firebaseAvailable || !db || !user) return;
  const collections = ['library'];
  for (const col of collections) {
    const snapshot = await db.collection('users').doc(user.uid).collection(col).get();
    const batch = db.batch();
    let needsCommit = false;

    snapshot.forEach(doc => {
      const data = doc.data();
      // If the document has an `id` field that does not match its Firestore doc ID,
      // we need to move the data to a new document whose ID is the old `id`.
      if (data.id && data.id !== doc.id) {
        const newDocRef = db.collection('users').doc(user.uid).collection(col).doc(data.id);
        // Write data to the new document with the correct ID
        batch.set(newDocRef, { ...data, id: data.id });
        // Delete the old document
        batch.delete(doc.ref);
        needsCommit = true;
      }
      // If the document has no `id` field, set it to the Firestore doc ID
      else if (!data.id) {
        batch.set(doc.ref, { ...data, id: doc.id }, { merge: true });
        needsCommit = true;
      }
    });

    if (needsCommit) await batch.commit();
  }
}
// ============================================================
// FIREBASE AUTH STATE LISTENER
// ============================================================
if (firebaseAvailable && auth) {
  auth.onAuthStateChanged(async user => {
    if (user) {
      document.getElementById('userIcon').classList.remove('fa-user');
      document.getElementById('userIcon').classList.add('fa-user-check');
      document.getElementById('profileButton').title = 'Logged in as ' + user.email;
const _logoutBtn = document.getElementById('logoutButton');
if (_logoutBtn) _logoutBtn.classList.remove('hidden');
      try {
  // 🔥 Run migration to fix old Firestore document IDs
  await migrateFirestoreData(user);

// Load collections from Firestore
const firestoreLibrary = await loadFromFirestore('library');

      // ---- Library (just replace with Firestore if available) ----
      if (firestoreLibrary.length > 0) {
        safeLocalStorageSet('acadhub_saved', firestoreLibrary);
      }

      // ---- Notes + note_subjects ----
      const firestoreNotes = await loadFromFirestore('notes');
      const firestoreNoteSubjects = await loadFromFirestore('note_subjects');
      if (firestoreNotes.length > 0) {
        safeLocalStorageSet('acadhub_notes', firestoreNotes);
      }
      if (firestoreNoteSubjects.length > 0) {
        safeLocalStorageSet('acadhub_note_subjects', firestoreNoteSubjects);
      }
      renderNotesList();
      renderSubjectFilters();

        // ---- Load user document (settings & profile) ----
        const userDoc = await db.collection('users').doc(user.uid).get();
        if (userDoc.exists) {
          const userData = userDoc.data();

          if (userData.theme) {
            document.documentElement.classList.remove('dark', 'light');
            document.documentElement.classList.add(userData.theme);
            safeLocalStorageSet('theme', userData.theme);
          }

          if (userData.tabPosition) {
            changeTabPosition(userData.tabPosition);
          }

          if (userData.accentColor) {
            document.documentElement.style.setProperty('--accent', userData.accentColor);
            safeLocalStorageSet('accent_color', userData.accentColor);
            // Optionally update the color input value
            const accentPicker = document.getElementById('accentPicker');
            if (accentPicker) accentPicker.value = userData.accentColor;
          }

        }

        // Re-render UI
        renderSavedList();
        renderCalendar();
        updateSettingsUI();
      } catch (err) {
        console.error('Error loading Firestore data:', err);
        // Fall back to local data on error
        renderSavedList();
      }
    } else {
      document.getElementById('userIcon').classList.remove('fa-user-check');
      document.getElementById('userIcon').classList.add('fa-user');
      document.getElementById('profileButton').title = 'Login / Sign Up';
const _logoutBtn2 = document.getElementById('logoutButton');
if (_logoutBtn2) _logoutBtn2.classList.add('hidden');
    }

    updateAuthUI();
  });
}
async function deleteSavedItem(index) {
  if (!confirm('Delete this saved reviewer?')) return;

  const saved = safeLocalStorageGet('acadhub_saved', []);
  const item = saved[index];
  saved.splice(index, 1);
  safeLocalStorageSet('acadhub_saved', saved);

  if (firebaseAvailable && auth && auth.currentUser && item?.id) {
    try {
      await db.collection('users').doc(auth.currentUser.uid)
        .collection('library').doc(item.id).delete();
    } catch (err) {
      console.error('Error deleting from Firebase:', err);
      showNotification('Deleted locally, but cloud sync failed.', 'warning');
    }
  }

  renderSavedList();
  showNotification('Reviewer deleted.', 'info');
}
async function loadFromFirestore(collectionName) {
  if (!firebaseAvailable || !auth || !auth.currentUser) return [];

  try {
    const snapshot = await db.collection('users').doc(auth.currentUser.uid).collection(collectionName).get();
    const items = [];
    snapshot.forEach(doc => {
      items.push({ id: doc.id, ...doc.data() });
    });
    return items;
  } catch (err) {
    console.error(`Error loading ${collectionName}:`, err);
    return [];
  }
}
function updateAccentColor(color) {
  document.documentElement.style.setProperty('--accent', color);
  safeLocalStorageSet('accent_color', color);
  if (firebaseAvailable && auth && auth.currentUser) {
    db.collection('users').doc(auth.currentUser.uid).set({
      accentColor: color
    }, { merge: true }).catch(err => console.error('Error saving accent color:', err));
  }
}
// ============================================================
// EVALUATION FUNCTIONS
// ============================================================
function toggleEvalModal() {
  const modal = document.getElementById('evalModal');
  modal.classList.toggle('hidden');
}

function submitEval() {
  const suggestions = document.getElementById('evalSuggestions').value;
  const user = (firebaseAvailable && auth) ? auth.currentUser : null;
  const profileName = user ? (user.displayName || user.email || 'Anonymous') : 'Anonymous';

  console.log('Evaluation submitted:', { rating: selectedRating, suggestions, profileName });

  if (user) {
    db.collection('evaluations').add({
      rating: selectedRating,
      suggestions,
      profileName,
      userId: user.uid,
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    }).catch(err => console.error('Error saving evaluation:', err));
  }

  toggleEvalModal();
  showNotification('Thank you for your feedback!', 'success');
}
function revealGCash() {
  document.getElementById('gcashHidden').classList.add('hidden');
  document.getElementById('gcashFull').classList.remove('hidden');
}

// Star rating functionality
document.addEventListener('DOMContentLoaded', function() {
  const stars = document.querySelectorAll('.star');
  stars.forEach(star => {
    star.addEventListener('click', function() {
      selectedRating = parseInt(this.dataset.value);
      stars.forEach(s => {
        if (parseInt(s.dataset.value) <= selectedRating) {
          s.classList.remove('fa-regular');
          s.classList.add('fa-solid', 'text-amber-400');
        } else {
          s.classList.remove('fa-solid', 'text-amber-400');
          s.classList.add('fa-regular');
        }
      });
    });
  });
});

// ============================================================
// INITIALIZATION - FIXED VERSION
// ============================================================
function initializeApp() {
  console.log('🚀 Initializing AcadHub Suite...');
  console.log('📡 Backend URL:', API_BASE_URL);
startSplashProgress();
  startTipCarousel();
  // Check backend health
  checkBackendHealth().then(available => {
    backendAvailable = available;
    console.log(available ? '✅ Backend available' : '⚠️ Backend offline - using local mode');
  });

  // Load saved theme
  const savedTheme = safeLocalStorageGet('theme', 'dark');
  document.documentElement.classList.remove('dark', 'light');
  document.documentElement.classList.add(savedTheme);

  // Load saved accent color
  const savedAccent = safeLocalStorageGet('accent_color', '#6366f1');
  document.documentElement.style.setProperty('--accent', savedAccent);
  const accentPicker = document.getElementById('accentPicker');
  if (accentPicker) accentPicker.value = savedAccent;

  // Load saved data
  offlineQueue = safeLocalStorageGet('offline_queue', []);

  // Render initial views
  renderSavedList();
  renderCalendar();
  renderNotesList();
  renderSubjectFilters();
  updateProviderUI();
  updateSettingsUI();
  initQuickSummaryListeners();

  // Force enable tab buttons
  setTimeout(() => {
    enableTabButtons();
    console.log('✅ Tab buttons force-enabled');
  }, 100);

  window.addEventListener('load', () => {
    enableTabButtons();
  });

  // Check for a shared reviewer in the URL
  checkForSharedReviewer();

  // Fade out the splash screen once everything is ready
  hideSplashScreen();

  console.log('✅ AcadHub Suite initialized successfully');
}

// Call initialization when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp);
} else {
  initializeApp();
}

// ============================================================
// SAVED ITEM ACTION SHEET
// ============================================================
function openItemActionSheet(index) {
  actionSheetIndex = index;
  const saved = safeLocalStorageGet('acadhub_saved', []);
  const item = saved[index];
  if (!item) return;

  document.getElementById('actionSheetTitle').textContent = item.title || 'Untitled Reviewer';
  document.getElementById('itemActionSheet').classList.remove('hidden');
}

function closeActionSheet() {
  document.getElementById('itemActionSheet').classList.add('hidden');
}

function closeActionSheetBackdrop(e) {
  if (e.target.id === 'itemActionSheet') closeActionSheet();
}

function actionViewItem() {
  if (actionSheetIndex === null) return;
  const index = actionSheetIndex;
  closeActionSheet();
  loadSavedItem(index);
}

function actionDeleteItem() {
  if (actionSheetIndex === null) return;
  const index = actionSheetIndex;
  closeActionSheet();
  deleteSavedItem(index);
}

// ---- Edit Name ----
function openEditNameSheet() {
  const saved = safeLocalStorageGet('acadhub_saved', []);
  const item = saved[actionSheetIndex];
  if (!item) return;

  closeActionSheet();
  document.getElementById('editNameInput').value = item.title || '';
  document.getElementById('editNameSheet').classList.remove('hidden');
  setTimeout(() => document.getElementById('editNameInput').focus(), 100);
}

function closeEditNameSheet() {
  document.getElementById('editNameSheet').classList.add('hidden');
}

function closeEditNameSheetBackdrop(e) {
  if (e.target.id === 'editNameSheet') closeEditNameSheet();
}

async function saveEditedName() {
  const newName = document.getElementById('editNameInput').value.trim();
  if (!newName) {
    showNotification('Name cannot be empty.', 'warning');
    return;
  }
  if (actionSheetIndex === null) return;

  const saved = safeLocalStorageGet('acadhub_saved', []);
  const item = saved[actionSheetIndex];
  if (!item) return;

  item.title = newName;
  safeLocalStorageSet('acadhub_saved', saved);

  if (firebaseAvailable && auth && auth.currentUser && item.id) {
    try {
      await db.collection('users').doc(auth.currentUser.uid)
        .collection('library').doc(item.id).set({ title: newName }, { merge: true });
    } catch (err) {
      console.error('Error updating name in Firebase:', err);
      showNotification('Renamed locally, but cloud sync failed.', 'warning');
    }
  }

  closeEditNameSheet();
  renderSavedList();
  showNotification('Name updated.', 'success');
}

// ---- Subject / Category ----
function openSubjectSheet() {
  const saved = safeLocalStorageGet('acadhub_saved', []);
  const item = saved[actionSheetIndex];
  if (!item) return;

  closeActionSheet();
  document.getElementById('subjectNameInput').value = item.subject?.name || '';

  const swatchContainer = document.getElementById('subjectColorSwatches');
  swatchContainer.innerHTML = '';
  let selectedColor = item.subject?.color || SUBJECT_COLORS[0];

  SUBJECT_COLORS.forEach(color => {
    const swatch = document.createElement('button');
    swatch.type = 'button';
    swatch.className = 'w-8 h-8 rounded-full border-2 transition btn-hover';
    swatch.style.background = color;
    swatch.style.borderColor = (color === selectedColor) ? '#fff' : 'transparent';
    swatch.onclick = () => {
      selectedColor = color;
      swatchContainer.querySelectorAll('button').forEach(b => b.style.borderColor = 'transparent');
      swatch.style.borderColor = '#fff';
      swatchContainer.dataset.selected = color;
    };
    swatchContainer.appendChild(swatch);
  });
  swatchContainer.dataset.selected = selectedColor;

  document.getElementById('subjectSheet').classList.remove('hidden');
}

function closeSubjectSheet() {
  document.getElementById('subjectSheet').classList.add('hidden');
}

function closeSubjectSheetBackdrop(e) {
  if (e.target.id === 'subjectSheet') closeSubjectSheet();
}

async function saveSubjectDetails() {
  if (actionSheetIndex === null) return;

  const name = document.getElementById('subjectNameInput').value.trim();
  const color = document.getElementById('subjectColorSwatches').dataset.selected || SUBJECT_COLORS[0];

  const saved = safeLocalStorageGet('acadhub_saved', []);
  const item = saved[actionSheetIndex];
  if (!item) return;

  item.subject = name ? { name, color } : null;
  safeLocalStorageSet('acadhub_saved', saved);

  if (firebaseAvailable && auth && auth.currentUser && item.id) {
    try {
      await db.collection('users').doc(auth.currentUser.uid)
        .collection('library').doc(item.id).set({ subject: item.subject }, { merge: true });
    } catch (err) {
      console.error('Error updating subject in Firebase:', err);
      showNotification('Saved locally, but cloud sync failed.', 'warning');
    }
  }

  closeSubjectSheet();
  renderSavedList();
  showNotification('Subject updated.', 'success');
}

/* ============ SPLASH FOOTER TIP CAROUSEL ============ */
const studyTips = [
  "Loading study tools…",
  "Did you know? Spaced repetition can boost retention by up to 200%.",
  "Tip: Upload PDFs to generate instant AI quizzes.",
  "Did you know? Teaching concepts to others is the best way to learn.",
  "Tip: Use the Pomodoro technique for focused study sessions.",
  "Syncing your flashcards...",
  "Did you know? Sleep is crucial for memory consolidation.",
  "Preparing your workspace..."
];

let tipIndex = 0;
let tipInterval = null;
const footerTextEl = document.getElementById('splashFooterText');

function startTipCarousel() {
  // Wait 1.5 seconds before starting the rotation (lets the splash screen finish its intro animation)
  setTimeout(() => {
    tipInterval = setInterval(() => {
      if (!footerTextEl) return;

      // 1. Fade out current text
      footerTextEl.classList.add('fade-out');
      
      // 2. Wait for fade out to finish (400ms matches CSS), then change text and fade in
      setTimeout(() => {
        tipIndex = (tipIndex + 1) % studyTips.length;
        footerTextEl.textContent = studyTips[tipIndex];
        
        footerTextEl.classList.remove('fade-out');
        footerTextEl.classList.add('fade-in');
        
        // 3. Clean up the fade-in class after transition
        setTimeout(() => {
          footerTextEl.classList.remove('fade-in');
        }, 400);
      }, 400);
      
    }, 4000); // Changes every 4 seconds
  }, 1500);
}

function stopTipCarousel() {
  if (tipInterval) {
    clearInterval(tipInterval);
    tipInterval = null;
  }
}
