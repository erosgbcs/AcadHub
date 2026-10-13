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
const API_BASE_URL = window.ACADHUB_API_URL || (isLocalHost ? 'http://127.0.0.1:8000' : 'https://acad-hub-rho.vercel.app');

const API_ENDPOINTS = {
  health: '/api/health',
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
// ============================================================
// THEME SYSTEM
// ============================================================
const THEME_PRESETS = {
  midnight: { label: 'Midnight', accent: '#6366f1', bgBody: '#0a0a12', bgCardSolid: '#1a1a2e', radiusCard: 1.5, radiusBtn: 0.75, blur: 12, density: 1 },
  ocean:    { label: 'Ocean',    accent: '#0ea5e9', bgBody: '#0a1420', bgCardSolid: '#132436', radiusCard: 1.5, radiusBtn: 0.75, blur: 12, density: 1 },
  forest:   { label: 'Forest',   accent: '#10b981', bgBody: '#0a1410', bgCardSolid: '#15261e', radiusCard: 1.5, radiusBtn: 0.75, blur: 12, density: 1 },
  sunset:   { label: 'Sunset',   accent: '#f97316', bgBody: '#150a08', bgCardSolid: '#2a1612', radiusCard: 1.5, radiusBtn: 0.75, blur: 12, density: 1 },
  rose:     { label: 'Rose',     accent: '#ec4899', bgBody: '#130a12', bgCardSolid: '#251323', radiusCard: 1.5, radiusBtn: 0.75, blur: 12, density: 1 },
  mono:     { label: 'Mono',     accent: '#64748b', bgBody: '#0e0e11', bgCardSolid: '#1c1c22', radiusCard: 1.5, radiusBtn: 0.75, blur: 12, density: 1 },
};

let currentTheme = { preset: 'midnight', overrides: {} };

// ---- Color math ----
function lightenHex(hex, amount) {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, Math.round(((n >> 16) & 0xff) + (255 - ((n >> 16) & 0xff)) * amount));
  const g = Math.min(255, Math.round(((n >> 8) & 0xff) + (255 - ((n >> 8) & 0xff)) * amount));
  const b = Math.min(255, Math.round((n & 0xff) + (255 - (n & 0xff)) * amount));
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}
function darkenHex(hex, amount) {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = Math.max(0, Math.round(((n >> 16) & 0xff) * (1 - amount)));
  const g = Math.max(0, Math.round(((n >> 8) & 0xff) * (1 - amount)));
  const b = Math.max(0, Math.round((n & 0xff) * (1 - amount)));
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

// ---- Apply theme ----
function resolveTheme(theme) {
  const base = THEME_PRESETS[theme.preset] || THEME_PRESETS.midnight;
  return { ...base, ...(theme.overrides || {}) };
}

function applyTheme(theme) {
  const t = resolveTheme(theme);
  const root = document.documentElement;
  
  // Accent + derived
  root.style.setProperty('--accent', t.accent);
  root.style.setProperty('--accent2', lightenHex(t.accent, 0.15));
  
  // NEW: RGB components for rgba() consumption
  const rgb = (hex) => {
    const n = parseInt(hex.replace('#', ''), 16);
    return `${(n >> 16) & 0xff}, ${(n >> 8) & 0xff}, ${n & 0xff}`;
  };
  root.style.setProperty('--accent-rgb', rgb(t.accent));
  root.style.setProperty('--accent2-rgb', rgb(lightenHex(t.accent, 0.15)));

// Backgrounds (dark mode only — light mode uses CSS defaults)
if (!root.classList.contains('light')) {
  if (t.bgBody) root.style.setProperty('--bg-body', t.bgBody);
  if (t.bgCardSolid) root.style.setProperty('--bg-card-solid', t.bgCardSolid);
} else {
  root.style.removeProperty('--bg-body');
  root.style.removeProperty('--bg-card-solid');
}

  // Radius
  if (t.radiusCard !== undefined) root.style.setProperty('--radius-card', t.radiusCard + 'rem');
  if (t.radiusBtn !== undefined) {
    root.style.setProperty('--radius-btn', t.radiusBtn + 'rem');
    root.style.setProperty('--radius-input', t.radiusBtn + 'rem');
    root.style.setProperty('--radius-lg', (t.radiusBtn + 0.25) + 'rem');
  }

  // Blur
  if (t.blur !== undefined) root.style.setProperty('--card-blur', t.blur + 'px');

  // Density
  root.classList.remove('density-compact', 'density-comfy', 'density-spacious');
  const densityClass = t.density === 0.85 ? 'density-compact'
                     : t.density === 1.15 ? 'density-spacious'
                     : 'density-comfy';
  root.classList.add(densityClass);

  // Update meta theme-color for Android status bar
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) metaTheme.setAttribute('content', t.accent);
}

// ---- Persist ----
function saveTheme(theme) {
  safeLocalStorageSet('acadhub_theme', theme);
  if (firebaseAvailable && auth && auth.currentUser) {
    db.collection('users').doc(auth.currentUser.uid)
      .set({ theme: theme }, { merge: true })
      .catch(err => console.error('Error saving theme:', err));
  }
}

// ---- User actions ----
function selectThemePreset(presetKey) {
  currentTheme = { preset: presetKey, overrides: {} };
  applyTheme(currentTheme);
  saveTheme(currentTheme);
  renderThemePresets();
}

function updateThemeOverride(key, value) {
  currentTheme.overrides = { ...currentTheme.overrides, [key]: value };
  applyTheme(currentTheme);
  saveTheme(currentTheme);
  renderThemePresets();  // in case it affects active state
}

function resetThemeOverrides() {
  currentTheme.overrides = {};
  applyTheme(currentTheme);
  saveTheme(currentTheme);
  renderThemePresets();
  syncThemeControls();
}

// ---- Init ----
function loadTheme() {
  // Migration: if user had old accent_color only, seed a theme
  const existing = safeLocalStorageGet('acadhub_theme', null);
  if (existing && existing.preset) {
    currentTheme = existing;
  } else {
    const legacyAccent = safeLocalStorageGet('accent_color', null);
    if (legacyAccent) {
      currentTheme = {
        preset: 'midnight',
        overrides: { accent: legacyAccent },
      };
    }
  }
  applyTheme(currentTheme);
}



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
  // Play matching sound
  const soundMap = { success: 'success', error: 'error', warning: 'warning', info: 'info' };
  if (typeof SoundEngine !== 'undefined') SoundEngine.play(soundMap[type] || 'info');

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
  // Fail fast with a friendly message when offline
  if (!navigator.onLine) {
    throw new Error('You are offline. AI features need an internet connection.');
  }

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

if (options.signal) config.signal = options.signal;

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

  // Fast-fail when navigator reports no connection
  if (!navigator.onLine) {
    backendAvailable = false;
    setStatus('offline');
    return false;
  }

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
  // Redirect 'library' → Reviewer tab + Saved pane
  if (tab === 'library') {
    switchTab('reviewer');
    switchReviewerPane('saved');
    return;
  }

  // Play tab switch sound (skip if it's a re-render of the same tab)
  if (currentTab !== tab) SoundEngine.play('swipe');

  // Close any full-screen overlay if user switches tabs mid-study
  ['studyModeOverlay', 'studyCompleteOverlay', 'recallModeOverlay', 'recallCompleteOverlay', 'mcqStudyOverlay', 'mcqCompleteOverlay']
  .forEach(id => document.getElementById(id)?.classList.add('hidden'));
  document.body.style.overflow = '';
  
  currentTab = tab;

  // Hide only the direct child view sections, not the parent container
  document.querySelectorAll('#viewsContainer > [id^="view"]').forEach(view => {
    view.classList.add('hidden');
  });

const viewMap = {
  'home': 'viewHome',
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
  'home': 'tabHome',
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
  // Refresh data for certain tabs
  if (tab === 'home') renderHomeDashboard();
  if (tab === 'calendar') renderCalendar();
  if (tab === 'notes') { renderNotesList(); renderSubjectFilters(); }
  if (tab === 'reviewer') updateSavedCount();
}

// ============================================================
// REVIEWER PANE TOGGLE (Generate | Saved)
// ============================================================
function switchReviewerPane(pane) {
  const genPane = document.getElementById('reviewerGeneratePane');
  const savedPane = document.getElementById('reviewerSavedPane');
  const genBtn = document.getElementById('reviewerPaneGenerate');
  const savedBtn = document.getElementById('reviewerPaneSaved');
  if (!genPane || !savedPane) return;

  const showSaved = pane === 'saved';

  genPane.classList.toggle('hidden', showSaved);
  savedPane.classList.toggle('hidden', !showSaved);

  genBtn.classList.toggle('tab-active', !showSaved);
  genBtn.classList.toggle('tab-inactive', showSaved);
  savedBtn.classList.toggle('tab-active', showSaved);
  savedBtn.classList.toggle('tab-inactive', !showSaved);

  if (showSaved) {
    renderSavedList();
    updateSavedCount();
  }
}

function updateSavedCount() {
  const saved = safeLocalStorageGet('acadhub_saved', []);
  const el = document.getElementById('reviewerSavedCount');
  if (el) el.textContent = saved.length;
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
  SoundEngine.play('open');
  document.getElementById('authModal').classList.remove('hidden');
  updateAuthUI();
}

// ============================================================
// SOUND CONTROLS
// ============================================================
function toggleSounds() {
  const next = !SoundEngine.isEnabled();
  SoundEngine.setEnabled(next);
  updateSoundToggleUI();
  showNotification(next ? 'Sound effects on' : 'Sound effects muted', 'info');
}

function previewSound() {
  if (!SoundEngine.isEnabled()) {
    showNotification('Enable sounds first', 'warning');
    return;
  }
  SoundEngine.play('success');
}

function updateSoundToggleUI() {
  const dot = document.getElementById('settingsSoundDot');
  if (!dot) return;
  const on = SoundEngine.isEnabled();
  dot.style.left = on ? '1.25rem' : '0.25rem';
}

// ============================================================
// PARTICLE CONTROLS
// ============================================================
function toggleParticles() {
  if (typeof TouchParticles === 'undefined') return;
  const next = !TouchParticles.isEnabled();
  TouchParticles.setEnabled(next);
  updateParticlesToggleUI();
  showNotification(next ? 'Touch effects on' : 'Touch effects off', 'info');
  if (next) {
    // Immediate feedback — play a preview burst
    setTimeout(() => TouchParticles.preview(), 120);
  }
}

function previewParticles() {
  if (typeof TouchParticles === 'undefined') return;
  if (!TouchParticles.isEnabled()) {
    showNotification('Enable touch effects first', 'warning');
    return;
  }
  TouchParticles.preview();
}

function updateParticlesToggleUI() {
  const dot = document.getElementById('settingsParticlesDot');
  if (!dot) return;
  const on = (typeof TouchParticles !== 'undefined') && TouchParticles.isEnabled();
  dot.style.left = on ? '1.25rem' : '0.25rem';
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
  
  const mode = html.classList.contains('dark') ? 'dark' : 'light';
  safeLocalStorageSet('theme', mode);
  
  if (firebaseAvailable && auth && auth.currentUser) {
    db.collection('users').doc(auth.currentUser.uid)
      .set({ mode }, { merge: true }) // ← renamed field
      .catch(err => console.error('Error saving theme mode:', err));
  }
  
  applyTheme(currentTheme); // ← add this
  updateSettingsUI();
}



function updateSettingsUI() {
  const html = document.documentElement;
  const isDark = html.classList.contains('dark');
  const dot = document.getElementById('settingsThemeDot');
  if (dot) {
    dot.style.left = isDark ? '0.25rem' : '1.25rem';
  }
}


function toggleAccuracyInfo() {
  const info = document.getElementById('accuracyInfo');
  info.classList.toggle('hidden');
}
// ============================================================
// QUIZ TYPE TILES
// ============================================================
function toggleQuizTile(event) {
  // Ignore clicks on the number input — user is editing count
  const t = event.target;
  if (t.tagName === 'INPUT' && t.type === 'number') return;
  
  const tile = event.currentTarget;
  const cb = tile.querySelector('input[type="checkbox"]');
  if (cb) cb.checked = !cb.checked;
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
// ============================================================
// SKELETON LOADER
// ============================================================
const SKELETON_STAGES = [
  'Reading your notes…',
  'Extracting key concepts…',
  'Generating flashcards…',
  'Drafting quiz questions…',
  'Polishing answers…'
];
const MIN_SKELETON_MS = 600;
let skeletonStageTimer = null;
let skeletonShownAt = 0;
let generationAbortController = null;


function showSkeleton() {
  // Guard against re-entry stacking timers
  if (skeletonStageTimer) {
    clearInterval(skeletonStageTimer);
    skeletonStageTimer = null;
  }
  
  const sk = document.getElementById('skeletonContainer');
  const results = document.getElementById('resultsContainer');
  if (results) results.classList.add('hidden');
  if (!sk) return;
  
  sk.classList.remove('hidden');
  skeletonShownAt = Date.now();
  
  // Reset status text to the first stage
  const txt = document.getElementById('skeletonStatusText');
  if (txt) txt.textContent = SKELETON_STAGES[0];
  
  let i = 0;
  skeletonStageTimer = setInterval(() => {
    i = Math.min(i + 1, SKELETON_STAGES.length - 1);
    const el = document.getElementById('skeletonStatusText');
    if (el) el.textContent = SKELETON_STAGES[i];
  }, 1600);
}

function hideSkeleton() {
  if (skeletonStageTimer) {
    clearInterval(skeletonStageTimer);
    skeletonStageTimer = null;
  }
  const sk = document.getElementById('skeletonContainer');
  if (sk) sk.classList.add('hidden');
}

async function hideSkeletonRespectingMin() {
  const elapsed = Date.now() - skeletonShownAt;
  if (elapsed < MIN_SKELETON_MS) {
    await new Promise(r => setTimeout(r, MIN_SKELETON_MS - elapsed));
  }
  hideSkeleton();
}
// ============================================================
// REVIEWER REDESIGN — Approach A
// ============================================================

function switchInputMethod(method, btn) {
  // Update tab active state
  const tabs = document.querySelectorAll('.input-method-tabs button');
  tabs.forEach(b => b.classList.remove('active'));
  btn.classList.add('active');

  // Show/hide sections
  const textEl = document.getElementById('inputTextMethod');
  const fileEl = document.getElementById('inputFileMethod');
  if (textEl) textEl.classList.toggle('hidden', method !== 'text');
  if (fileEl) fileEl.classList.toggle('hidden', method !== 'file');
}

function updateCounter() {
  const ta = document.getElementById('studyNotes');
  if (!ta) return;
  const v = ta.value;
  const cc = document.getElementById('charCount');
  const wc = document.getElementById('wordCount');
  if (cc) cc.textContent = v.length.toLocaleString() + ' characters';
  if (wc) wc.textContent = '~' + (v.trim() ? v.trim().split(/\s+/).length : 0) + ' words';
}

function updateFlashcardCount(v) {
  const display = document.getElementById('flashcardCountDisplay');
  if (display) display.textContent = v;
  const hidden = document.getElementById('numFlashcards');
  if (hidden) hidden.value = v;
  updateSummaryLine();
}

function toggleQuizPillClass(pill) {
  if (!pill) return;
  const cb = pill.querySelector('input[type="checkbox"]');
  if (cb) pill.classList.toggle('active', cb.checked);
  updateSummaryLine();
}

function updateSummaryLine() {
  // Flashcard count
  const slider = document.getElementById('flashcardSlider');
  const cards = slider ? parseInt(slider.value) || 0 : 0;

  // Quiz item count — sum all checked pill inputs
  let quiz = 0;
  ['useTrueFalse', 'useIdentification', 'useEnumeration', 'useMultipleChoice'].forEach(id => {
    const cb = document.getElementById(id);
    if (cb && cb.checked) {
      const numId = 'num' + id.slice(3); // useTrueFalse → numTrueFalse
      const num = document.getElementById(numId);
      quiz += parseInt(num?.value) || 0;
    }
  });

  const preview = document.getElementById('genPreview');
  if (preview) preview.textContent = `${cards} cards · ${quiz} quiz`;
}

// Initialize listeners once DOM is ready
function initReviewerRedesign() {
  updateCounter();
  updateSummaryLine();
}
window.addEventListener('DOMContentLoaded', initReviewerRedesign);

// AI REVIEWER - MAIN GENERATION FUNCTION
async function handleGenerate() {
  const notes = document.getElementById('studyNotes').value.trim();
  const hasFile = fileStore.reviewer.length > 0;
  
  if (!notes && !hasFile) {
    showNotification('Please paste notes or upload a document.', 'warning');
    return;
  }
  
  // Move on to asking for subject / term / semester
  openGenerateMetaSheet();
}

async function runGenerateWithMeta(meta = {}) {
  const submitBtn = document.getElementById('submitBtn');
  const btnContent = document.getElementById('btnContent');
  const resultsContainer = document.getElementById('resultsContainer');
  
  const notes = document.getElementById('studyNotes').value.trim();
  const selectedFiles = fileStore.reviewer;
  const hasFile = selectedFiles.length > 0;
  
  submitBtn.disabled = true;
  btnContent.innerHTML = '<i class="fa-solid fa-spinner animate-spin mr-2"></i>Generating...';
  const _genPrev = document.getElementById('genPreview');
  if (_genPrev) _genPrev.classList.add('hidden');
  resultsContainer.classList.add('hidden');
  
  const viewReviewer = document.getElementById('viewReviewer');
  if (viewReviewer) viewReviewer.classList.add('saved-view-mode');
  const backBtn = document.getElementById('backToGeneratorBtn');
  if (backBtn) backBtn.classList.remove('hidden');
  
  const controller = new AbortController();
  generationAbortController = controller;
  const signal = controller.signal;
  
  showSkeleton();
  
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
      multiplechoice: document.getElementById('useMultipleChoice').checked ? parseInt(document.getElementById('numMultipleChoice').value) || 0 : 0
    };
    
    formData.append('quiz_types', JSON.stringify(quizTypes));
    formData.append('num_flashcards', document.getElementById('numFlashcards').value || '10');
    formData.append('use_internet', document.getElementById('useInternet').checked);
    formData.append('enrich_count', document.getElementById('enrichCount').value || '5');
    
    const result = await apiCall(API_ENDPOINTS.generateAI, { formData, signal });
    
    const transformedData = transformBackendResponse(result);
    
    renderSummary(transformedData.summary);
    renderFlashcards(transformedData.flashcards);
    renderQuiz(transformedData.quiz);
    
    const qualityEl = document.getElementById('generationQuality');
    if (qualityEl && transformedData.quality) {
      const providerName = transformedData.provider === 'gemini' ? 'Gemini'
                         : transformedData.provider === 'groq'   ? 'Groq'
                         : null;
      const badge = providerName ? ` · Powered by ${providerName}` : '';
      qualityEl.textContent = `Generation quality: ${transformedData.quality.score}% (source and answer consistency)${badge}`;
    }
    
    // ---- Attach the metadata collected from the meta sheet ----
    const subjectObj = meta.subjectId ? getNoteSubject(meta.subjectId) : null;
    
    currentResults = {
      ...transformedData,
      timestamp: new Date().toISOString(),
      subject: subjectObj ?
        { id: subjectObj.id, name: subjectObj.name, color: subjectObj.color } :
        null,
      term: meta.term || null,
      semester: meta.semester || null,
      schoolYear: meta.schoolYear || null,
    };
    
    await hideSkeletonRespectingMin();
    
    resultsContainer.classList.remove('hidden');
    document.getElementById('saveToLibraryBtn').classList.remove('hidden');
    document.getElementById('shareReviewerBtn').classList.remove('hidden');
    document.getElementById('saveAsNoteBtn').classList.remove('hidden');
    
    updateResultsNavCounts();
    initResultsNav();
    
    currentSharedReviewer = null;
    const sharedBanner = document.getElementById('sharedBanner');
    if (sharedBanner) sharedBanner.classList.add('hidden');
    
    showNotification('Study materials generated successfully!', 'success');
    
  } catch (err) {
    if (err.name === 'AbortError') {
      console.log('Generation cancelled by user');
      return;
    }
    
    console.error('Error generating materials:', err);
    showNotification(err.message || 'Error generating study materials. Please try again.', 'error');
    
    if (generationAbortController === controller) {
      const v = document.getElementById('viewReviewer');
      if (v) v.classList.remove('saved-view-mode');
      const b = document.getElementById('backToGeneratorBtn');
      if (b) b.classList.add('hidden');
    }
  } finally {
    if (generationAbortController === controller) {
      generationAbortController = null;
      submitBtn.disabled = false;
      btnContent.innerHTML = 'Generate';
      const _genPrev2 = document.getElementById('genPreview');
      if (_genPrev2) _genPrev2.classList.remove('hidden');
      hideSkeleton();
    }
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
      const providerName = data.provider === 'gemini' ? 'Gemini'
                         : data.provider === 'groq'   ? 'Groq'
                         : null;
      const badge = providerName ? ` · Powered by ${providerName}` : '';
      qualityEl.textContent = `Generation quality: ${data.quality.score}% (source and answer consistency)${badge}`;
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
  // Use data arrays for the full count, not the DOM
  const summaryCount = document.querySelectorAll('#summaryList > li').length;
  const flashcardCount = allFlashcards?.length || 0;
  const quizCount = allQuizItems?.length || 0;

  const map = { summary: summaryCount, flashcards: flashcardCount, quiz: quizCount };
  document.querySelectorAll('.results-nav-count').forEach(el => {
    const key = el.dataset.count;
    if (key in map) el.textContent = map[key];
  });

  // Recall Quiz button visibility + count
  const recallBtn = document.getElementById('recallQuizBtn');
  const recallCount = document.getElementById('recallQuizCount');
  if (recallBtn && recallCount) {
    const idCount = currentResults?.quiz?.identification?.length || 0;
    const enumCount = currentResults?.quiz?.enumeration?.length || 0;
    const total = idCount + enumCount;
    recallCount.textContent = total;
    recallBtn.classList.toggle('hidden', total === 0);
  }

  // MCQ Study button visibility + count
  const mcqBtn = document.getElementById('mcqStudyBtn');
  const mcqCountEl = document.getElementById('mcqStudyCount');
  if (mcqBtn && mcqCountEl) {
    const mcqCount = currentResults?.quiz?.multipleChoice?.length || 0;
    mcqCountEl.textContent = mcqCount;
    mcqBtn.classList.toggle('hidden', mcqCount === 0);
  }
}

function initResultsNav() {
  if (!resultsNavBound) {
    document.querySelectorAll('.results-nav-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.section;

        // Hide all sections
        RESULTS_SECTION_IDS.forEach(secId => {
          const el = getResultsSectionEl(secId);
          if (el) el.classList.add('hidden');
        });

        // Show target section
        const targetEl = getResultsSectionEl(id);
        if (targetEl) targetEl.classList.remove('hidden');

        setActiveResultsNav(id);

        // Scroll to top of results container for clean view
        const nav = document.getElementById('resultsNav');
        if (nav) {
          const top = nav.getBoundingClientRect().top + window.scrollY - 60;
          window.scrollTo({ top, behavior: 'smooth' });
        }
      });
    });
    resultsNavBound = true;
  }

  // Initial setup: show only summary by default
  RESULTS_SECTION_IDS.forEach(secId => {
    const el = getResultsSectionEl(secId);
    if (el) {
      if (secId === 'summary') el.classList.remove('hidden');
      else el.classList.add('hidden');
    }
  });
  setActiveResultsNav('summary');

  // Remove the old IntersectionObserver (no longer needed)
  if (resultsObserver) {
    resultsObserver.disconnect();
    resultsObserver = null;
  }
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

  // Synthetic ids coming from saved library items
  if (typeof id === 'string' && id.startsWith('lib:')) {
    const key = id.slice(4);
    const saved = safeLocalStorageGet('acadhub_saved', []);
    for (const item of saved) {
      const s = item && item.subject;
      if (s && s.name && String(s.name).trim().toLowerCase() === key) {
        return { id, name: s.name, color: s.color || '#94a3b8' };
      }
    }
    return null;
  }

  return getNoteSubjects().find(s => s.id === id) || null;
}

// Returns every subject the user has ever used:
// - ones they created in the Notes tab
// - ones they attached to saved library items
// Deduped by lowercase name. Library-only subjects get a synthetic
// `lib:<lowercasedName>` id so they can still be picked in the meta sheet.
function getAllUserSubjects() {
  const out = [];
  const seen = new Map();

  getNoteSubjects().forEach(s => {
    const key = String(s.name || '').trim().toLowerCase();
    if (!key || seen.has(key)) return;
    seen.set(key, s);
    out.push(s);
  });

  const saved = safeLocalStorageGet('acadhub_saved', []);
  saved.forEach(item => {
    const s = item && item.subject;
    if (!s || !s.name) return;
    const key = String(s.name).trim().toLowerCase();
    if (seen.has(key)) return;
    const synth = { id: 'lib:' + key, name: s.name, color: s.color || '#94a3b8' };
    seen.set(key, synth);
    out.push(synth);
  });

  return out;
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

  // XP: +3 for creating a new note (awarded once per note)
  if (currentEditingNoteIsNew) {
    addXp(XP_REWARDS.newNote);
    currentEditingNoteIsNew = false;
  }
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
    try {
      await db.collection('users').doc(auth.currentUser.uid)
        .collection('note_subjects').doc(savedSubj.id).set(savedSubj);
    } catch (err) { console.error(err); }
  }

  const wasEditing = !!editingSubjectId;
  closeEditSubject();
  updateNoteSubjectUI();
  renderSubjectFilters();
  renderNotesList();

  // If the meta sheet is open, refresh its subject dropdown
  const metaSheet = document.getElementById('generateMetaSheet');
  if (metaSheet && !metaSheet.classList.contains('hidden')) {
    const select = document.getElementById('genMetaSubject');
    if (select) {
      const prevValue = select.value;
      const subjects2 = getAllUserSubjects();
      select.innerHTML = '<option value="">— No subject —</option>' +
        subjects2.map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('');

      if (savedSubj && subjects2.some(s => s.id === savedSubj.id)) {
        select.value = savedSubj.id;
        if (pendingGenerateMeta) pendingGenerateMeta.subjectId = savedSubj.id;
      } else if (prevValue) {
        select.value = prevValue;
      }
    }
  }

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
        if (n.subjectId === null) {
          await db.collection('users').doc(uid).collection('notes').doc(n.id)
            .set({ subjectId: null }, { merge: true });
        }
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
  // New cards (with _answerFirst) → term lives in `back`
  // Legacy cards (no marker) → term lives in `front`
  // Either way we return the term, so ratings stay keyed by the same string.
  const rawTerm = card._answerFirst ?
    (card.back || card.term || '') :
    (card.front || card.term || '');
  return String(rawTerm).trim().toLowerCase();
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
  // NEW: restore previous reviewer state if we were in a Due Queue session
  if (dueReviewMode) {
    dueReviewMode = false;
    dueReviewSubjectMap = {};
    if (__preDueResults !== undefined) {
      currentResults = __preDueResults;
      __preDueResults = undefined;
    } else {
      currentResults = null;
    }
    setTimeout(renderHomeDashboard, 50);
  }
  
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
  SoundEngine.play('flip');
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
  
  // ✅ SRS hook — feeds the Home Dashboard due queue
  if (dueReviewMode && card.key) {
    scheduleNext(card.key, rating, dueReviewSubjectMap[card.key] || null);
  }
  
  studyRatings = getFlashcardRatings();
  studyRatings[card.key] = rating;
  setFlashcardRatings(studyRatings);
  
studySessionStats[rating]++;

// XP: +2 per rated card (silent — session XP fires on completion)
addXp(XP_REWARDS.flashcard, { silent: true });

// Play rating sound
const ratingSound = {
  easy: 'rateEasy',
  hard: 'rateHard',
  forgot: 'rateForgot'
}[rating];
if (ratingSound) SoundEngine.play(ratingSound);


  
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

// XP: +10 session bonus (only if at least one card was rated)
if (easy + hard + forgot > 0) {
  addXp(XP_REWARDS.session);
  SoundEngine.play('complete');
}

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
  front: card.definition || card.back || 'Description',
  back: card.term || card.front || 'Answer',
  _answerFirst: true // marker: this card uses the new order
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

  return {
    summary,
    flashcards,
    quiz,
    quality: backendData.quality || null,
    provider: backendData._provider || null,
  };
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

// ============================================================
// PAGINATED RENDERING (Smooth scrolling for large sets)
// ============================================================
const ITEMS_PER_PAGE = 10;

let allFlashcards = [];
let flashcardOffset = 0;
let allQuizItems = [];
let quizOffset = 0;

// ---- Flashcards ----
function renderFlashcards(flashcards) {
  allFlashcards = flashcards || [];
  flashcardOffset = 0;
  const grid = document.getElementById('flashcardGrid');
  grid.innerHTML = '';

  const studyBtn = document.getElementById('studyModeBtn');
  if (studyBtn) {
    studyBtn.classList.toggle('hidden', !allFlashcards || allFlashcards.length === 0);
  }

  if (!allFlashcards || allFlashcards.length === 0) {
    grid.innerHTML = '<p class="text-sm opacity-50 text-center col-span-full">No flashcards generated.</p>';
    const btn = document.getElementById('loadMoreFlashcardsBtn');
    if (btn) btn.classList.add('hidden');
    return;
  }

  renderFlashcardBatch();
}

function renderFlashcardBatch() {
  const grid = document.getElementById('flashcardGrid');
  const batch = allFlashcards.slice(flashcardOffset, flashcardOffset + ITEMS_PER_PAGE);
  const ratings = getFlashcardRatings();

  batch.forEach((card, index) => {
    const globalIndex = flashcardOffset + index;
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

  flashcardOffset += batch.length;

  const btn = document.getElementById('loadMoreFlashcardsBtn');
  if (btn) {
    if (flashcardOffset >= allFlashcards.length) {
      btn.classList.add('hidden');
    } else {
      btn.classList.remove('hidden');
      btn.innerHTML = `<i class="fa-solid fa-chevron-down mr-1"></i> Show more (${allFlashcards.length - flashcardOffset} remaining)`;
    }
  }
}

function loadMoreFlashcards() {
  renderFlashcardBatch();
}
// ---- Quiz ----
function renderQuiz(quiz) {
  allQuizItems = [];
  let questionNumber = 0;

  // Flatten the quiz object into a single array for pagination
  (quiz.trueFalse || []).forEach(q => allQuizItems.push({ type: 'tf', data: q, num: ++questionNumber }));
  (quiz.identification || []).forEach(q => allQuizItems.push({ type: 'id', data: q, num: ++questionNumber }));
  (quiz.multipleChoice || []).forEach(q => allQuizItems.push({ type: 'mcq', data: q, num: ++questionNumber }));
  (quiz.enumeration || []).forEach(q => allQuizItems.push({ type: 'enum', data: q, num: ++questionNumber }));

  quizOffset = 0;
  const container = document.getElementById('quizContainer');
  container.innerHTML = '';

  if (allQuizItems.length === 0) {
    const btn = document.getElementById('loadMoreQuizBtn');
    if (btn) btn.classList.add('hidden');
    return;
  }

  renderQuizBatch();
}

function renderQuizBatch() {
  const container = document.getElementById('quizContainer');
  const batch = allQuizItems.slice(quizOffset, quizOffset + ITEMS_PER_PAGE);

  batch.forEach(item => {
    const q = item.data;
    const div = document.createElement('div');
    div.className = 'bg-white/5 p-4 rounded-lg reveal-item';

    if (item.type === 'tf') {
      div.innerHTML = `
        <p class="text-sm font-semibold mb-2">${item.num}. ${q.question}</p>
        <div class="flex gap-2">
          <button class="quiz-option px-4 py-2 bg-white/10 rounded-lg text-sm" onclick="checkAnswer(this, ${q.answer}, true)">True</button>
          <button class="quiz-option px-4 py-2 bg-white/10 rounded-lg text-sm" onclick="checkAnswer(this, ${q.answer}, false)">False</button>
        </div>
      `;
    } else if (item.type === 'id' || item.type === 'enum') {
      div.innerHTML = `
        <p class="text-sm font-semibold mb-2">${item.num}. ${q.question}</p>
        <button class="quiz-option px-3 py-1 bg-white/10 rounded-lg text-sm mt-2" onclick="revealAnswer(this)">Show Answer</button>
        <p class="text-xs text-emerald-400 mt-2 hidden">Answer: ${q.answer}</p>
      `;
    } else if (item.type === 'mcq') {
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
        <p class="text-sm font-semibold mb-2">${item.num}. ${q.question}</p>
        ${optionsHTML}
      `;
    }

    container.appendChild(div);
  });

  quizOffset += batch.length;

  const btn = document.getElementById('loadMoreQuizBtn');
  if (btn) {
    if (quizOffset >= allQuizItems.length) {
      btn.classList.add('hidden');
    } else {
      btn.classList.remove('hidden');
      btn.innerHTML = `<i class="fa-solid fa-chevron-down mr-1"></i> Show more (${allQuizItems.length - quizOffset} remaining)`;
    }
  }
}

function loadMoreQuiz() {
  renderQuizBatch();
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

// XP: +5 for saving a reviewer
addXp(XP_REWARDS.saveReviewer);

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

// XP: +5 for saving a reviewer
addXp(XP_REWARDS.saveReviewer);

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
  
  const subject = currentResults.subject || null;
  
  const titleParts = [];
  if (currentResults.term) titleParts.push(currentResults.term);
  if (currentResults.semester) titleParts.push(currentResults.semester);
  if (currentResults.schoolYear) titleParts.push(currentResults.schoolYear);
  
  const autoTitle = titleParts.length ?
    `${subject ? subject.name + ' — ' : ''}${titleParts.join(' · ')}` :
    'Reviewer ' + new Date().toLocaleDateString();
  
  const ok = await persistLibraryItemWithMeta(autoTitle, currentResults, { subject });
  if (ok) renderSavedList();
}


// TEST MY LIMITS
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

// XP: +20 for completing a test
if (testQuestions.length > 0) {
  addXp(XP_REWARDS.test);
}

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
// CALENDAR — TYPES, VIEW MODE, FILTERS
// ============================================================
const DEADLINE_TYPES = {
  exam:       { label: 'Exam',       icon: 'fa-file-pen',        color: '#ef4444' },
  quiz:       { label: 'Quiz',       icon: 'fa-circle-question', color: '#f59e0b' },
  assignment: { label: 'Assignment', icon: 'fa-clipboard-check', color: '#3b82f6' },
  project:    { label: 'Project',    icon: 'fa-diagram-project', color: '#8b5cf6' },
  reading:    { label: 'Reading',    icon: 'fa-book',            color: '#06b6d4' },
  personal:   { label: 'Personal',   icon: 'fa-user',            color: '#64748b' },
};

let currentCalendarView = 'month';   // 'month' | 'agenda'
let currentTypeFilter = 'all';       // 'all' | type key
let calendarPressTimer = null;
let calendarLongPressed = false;

function getDeadlineTypeInfo(typeKey) {
  if (!typeKey) return DEADLINE_TYPES.personal;
  return DEADLINE_TYPES[typeKey] || DEADLINE_TYPES.personal;
}

// Returns items that pass the current type filter
function filterDeadlinesByType(list) {
  if (currentTypeFilter === 'all') return list;
  return list.filter(d => (d.type || 'personal') === currentTypeFilter);
}

// ---- View toggle ----
function setCalendarView(view) {
  currentCalendarView = view;
  const monthBtn = document.getElementById('calendarViewMonth');
  const agendaBtn = document.getElementById('calendarViewAgenda');
  if (monthBtn) monthBtn.classList.toggle('active', view === 'month');
  if (agendaBtn) agendaBtn.classList.toggle('active', view === 'agenda');

  const monthView = document.getElementById('calendarMonthView');
  const agendaView = document.getElementById('calendarAgendaView');
  const selPanel = document.getElementById('selectedDayTasks');
  if (monthView) monthView.classList.toggle('hidden', view !== 'month');
  if (agendaView) agendaView.classList.toggle('hidden', view !== 'agenda');
  if (selPanel) selPanel.classList.toggle('hidden', view !== 'month');

  safeLocalStorageSet('acadhub_calendar_view', view);
  renderCalendar();
}

// ---- Type filter ----
function setTypeFilter(type) {
  currentTypeFilter = type;
  safeLocalStorageSet('acadhub_calendar_type_filter', type);
  renderCalendar();
}

function renderCalendarTypeFilters() {
  const container = document.getElementById('calendarTypeFilters');
  if (!container) return;

  const chips = [];
  chips.push(`
    <button class="calendar-type-filter ${currentTypeFilter === 'all' ? 'active' : ''}"
            style="--type-color: var(--accent);"
            onclick="setTypeFilter('all')">
      <i class="fa-solid fa-layer-group" style="font-size:0.65rem;"></i>All
    </button>
  `);

  Object.entries(DEADLINE_TYPES).forEach(([key, info]) => {
    chips.push(`
      <button class="calendar-type-filter ${currentTypeFilter === key ? 'active' : ''}"
              style="--type-color: ${info.color};"
              onclick="setTypeFilter('${key}')">
        <span class="calendar-type-filter-dot" style="background:${info.color};"></span>${info.label}
      </button>
    `);
  });

  container.innerHTML = chips.join('');
}

// ---- Completion toggle ----
async function toggleDeadlineComplete(id) {
  const all = getDeadlines();
  const d = all.find(x => x.id === id);
  if (!d) return;
  d.completed = !d.completed;
  d.completedAt = d.completed ? new Date().toISOString() : null;
  d.updatedAt = new Date().toISOString();
  setDeadlines(all);

  if (firebaseAvailable && auth && auth.currentUser) {
    try {
      await db.collection('users').doc(auth.currentUser.uid)
        .collection('deadlines').doc(id)
        .set({ completed: d.completed, completedAt: d.completedAt, updatedAt: d.updatedAt }, { merge: true });
    } catch (err) { console.warn('Completion sync failed:', err); }
  }

  if (navigator.vibrate) navigator.vibrate(10);
  renderCalendar();
  renderUpcomingDeadlines();
}

// ---- Quick-add: long press a day cell ----
function calendarPressStart(event, dateStr) {
  calendarLongPressed = false;
  clearTimeout(calendarPressTimer);
  calendarPressTimer = setTimeout(() => {
    calendarLongPressed = true;
    if (navigator.vibrate) navigator.vibrate(18);
    openDeadlineSheet(dateStr);
  }, 500);
}

function calendarPressEnd() {
  clearTimeout(calendarPressTimer);
}

// ---- Deadline type chips (in sheet) ----
function renderDeadlineTypeChips() {
  const container = document.getElementById('deadlineTypeChips');
  if (!container) return;

  const current = editingDeadlineType || 'personal';
  container.innerHTML = Object.entries(DEADLINE_TYPES).map(([key, info]) => `
    <button type="button"
            class="deadline-type-chip ${current === key ? 'active' : ''}"
            style="--type-color: ${info.color};"
            data-type="${key}"
            onclick="pickDeadlineType('${key}')">
      <i class="fa-solid ${info.icon}"></i>${info.label}
    </button>
  `).join('');
}

function pickDeadlineType(key) {
  editingDeadlineType = key;
  // Auto-set the color to the type's default (user can still change it after)
  const info = DEADLINE_TYPES[key];
  if (info) editingDeadlineColor = info.color;
  renderDeadlineTypeChips();
  renderDeadlineColorSwatches();
}

// ============================================================
// CALENDAR FUNCTIONS
// ============================================================
// rAF batch: multiple rapid renderCalendar() calls collapse into one paint
let _calendarRenderHandle = null;
function renderCalendar() {
  if (_calendarRenderHandle) return;
  _calendarRenderHandle = requestAnimationFrame(() => {
    _calendarRenderHandle = null;
    _renderCalendarNow();
  });
}

function _renderCalendarNow() {
  const grid = document.getElementById('calendarGrid');
  const label = document.getElementById('calendarMonthLabel');
  if (!grid || !label) return;

  renderCalendarTypeFilters();

  // Agenda view bypasses month grid
  if (currentCalendarView === 'agenda') {
    renderAgendaView();
    renderCalendarStats();
    renderCalendarUpcoming();
    return;
  }

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
  const todayStrVal = todayStr();
  const allDeadlines = filterDeadlinesByType(getDeadlines());

  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(calendarYear, calendarMonth, day);
    const dateStr = `${calendarYear}-${String(calendarMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const isToday = date.toDateString() === today.toDateString();
    const isSelected = selectedCalendarDate === dateStr;

    const dayDeadlines = allDeadlines.filter(d => d.date === dateStr);
    const incomplete = dayDeadlines.filter(d => !d.completed);
    const isOverdue = dateStr < todayStrVal && incomplete.length > 0;
    const isHeavy = incomplete.length >= 3;

    // Build up to 3 color dots — completed items get muted gray
    let dotsHTML = '';
    if (dayDeadlines.length > 0) {
      const visible = dayDeadlines.slice(0, 3);
      const extra = dayDeadlines.length - visible.length;
      const dots = visible.map(d => {
        if (d.completed) return `<span class="task-dot is-done"></span>`;
        const t = getDeadlineTypeInfo(d.type);
        return `<span class="task-dot" style="background:${t.color};"></span>`;
      }).join('');
      const extraLabel = extra > 0 ? `<span class="task-count">+${extra}</span>` : '';
      dotsHTML = `<div class="task-dots">${dots}${extraLabel}</div>`;
    }

    cells += `
      <div class="calendar-day ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''} ${isOverdue ? 'overdue-day' : ''} ${isHeavy ? 'heavy-load' : ''}"
           data-date="${dateStr}"
           onclick="selectCalendarDate('${dateStr}')"
           onmousedown="calendarPressStart(event, '${dateStr}')"
           onmouseup="calendarPressEnd()"
           onmouseleave="calendarPressEnd()"
           ontouchstart="calendarPressStart(event, '${dateStr}')"
           ontouchend="calendarPressEnd()"
           ontouchmove="calendarPressEnd()">
        <span>${day}</span>
        ${dotsHTML}
      </div>
    `;
  }

  grid.innerHTML = cells;

  renderCalendarStats();
  renderCalendarUpcoming();

  if (selectedCalendarDate) {
    renderSelectedDayDeadlines(selectedCalendarDate);
  } else {
    const selectedTasks = document.getElementById('selectedDayTasks');
    if (selectedTasks) selectedTasks.innerHTML = '<p class="text-sm opacity-50">Select a date to see deadlines.</p>';
  }

  bindCalendarSwipe();
}

// ---- Agenda view: next 21 days grouped by day ----
function renderAgendaView() {
  const container = document.getElementById('calendarAgendaList');
  if (!container) return;

  const now = todayStr();
  const all = filterDeadlinesByType(getDeadlines()).filter(d => d.date);
  const horizonEnd = new Date();
  horizonEnd.setDate(horizonEnd.getDate() + 21);
  const horizonStr = localDateStr(horizonEnd);

  const upcoming = all
    .filter(d => d.date >= now && d.date <= horizonStr)
    .sort((a, b) => a.date.localeCompare(b.date));

  // Group by date
  const groups = {};
  upcoming.forEach(d => {
    if (!groups[d.date]) groups[d.date] = [];
    groups[d.date].push(d);
  });

  const sortedDates = Object.keys(groups).sort();

  if (sortedDates.length === 0) {
    container.innerHTML = `
      <div class="agenda-empty">
        <i class="fa-regular fa-circle-check text-3xl opacity-30"></i>
        <p class="text-sm opacity-60 mt-3">Nothing scheduled for the next 3 weeks</p>
        <p class="text-xs opacity-40 mt-1">Long-press any day in Month view to add a deadline</p>
      </div>
    `;
    return;
  }

  container.innerHTML = sortedDates.map(dateStr => {
    const list = groups[dateStr];
    const dateObj = new Date(dateStr + 'T00:00:00');
    const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'short' });
    const dayNum = dateObj.getDate();
    const monthName = dateObj.toLocaleDateString('en-US', { month: 'short' });
    const diff = daysBetween(now, dateStr);
    const isToday = diff === 0;
    const isTomorrow = diff === 1;
    const incompleteCount = list.filter(d => !d.completed).length;

    const dateLabel = isToday ? 'Today'
                     : isTomorrow ? 'Tomorrow'
                     : `${dayName} · ${monthName} ${dayNum}`;

    return `
      <div class="agenda-day">
        <div class="agenda-day-header">
          <span class="agenda-day-label" ${isToday ? 'style="color:var(--accent);"' : ''}>${escapeHtml(dateLabel)}</span>
          <span class="agenda-day-badge">${incompleteCount} pending</span>
        </div>
        <div class="space-y-2">
          ${list.map(d => {
            const t = getDeadlineTypeInfo(d.type);
            const countdown = formatDeadlineCountdown(d.date);
            const cardCls = d.completed ? 'deadline-card is-done' : 'deadline-card';
            return `
              <div class="${cardCls}" onclick="openDeadlineSheet(null, '${d.id}')">
                <span class="deadline-type-icon" style="background:${t.color};">
                  <i class="fa-solid ${t.icon}"></i>
                </span>
                <div class="min-w-0 flex-1">
                  <p class="text-sm font-medium truncate">${escapeHtml(d.title || 'Deadline')}</p>
                  <div class="flex items-center gap-2 mt-0.5 flex-wrap">
                    <span class="text-[10px] font-semibold" style="color:${t.color};">${t.label}</span>
                    ${d.subject ? `<span class="text-[10px] opacity-50 truncate">· ${escapeHtml(d.subject)}</span>` : ''}
                    <span class="text-[10px] opacity-50">· ${escapeHtml(countdown)}</span>
                  </div>
                </div>
                <button class="deadline-check ${d.completed ? 'is-done' : ''}"
                        onclick="event.stopPropagation(); toggleDeadlineComplete('${d.id}')"
                        title="${d.completed ? 'Mark as not done' : 'Mark as done'}">
                  <i class="fa-solid fa-check"></i>
                </button>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }).join('');
}

function selectCalendarDate(dateStr) {
  // Suppress the click event that follows a long-press
  if (calendarLongPressed) {
    calendarLongPressed = false;
    return;
  }
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

// ---- Jump to today's month ----
function goToToday() {
  const now = new Date();
  calendarYear = now.getFullYear();
  calendarMonth = now.getMonth();
  selectedCalendarDate = todayStr();
  if (currentCalendarView !== 'month') {
    setCalendarView('month');
  } else {
    renderCalendar();
  }
  showNotification('Jumped to today', 'info');
}

// ---- Month stats chips ----
function renderCalendarStats() {
  const container = document.getElementById('calendarStats');
  if (!container) return;

  // Always use the real current month for stats, regardless of what the
  // grid is showing. Prevents confusion when in agenda view.
  const realToday = new Date();
  const monthPrefix = `${realToday.getFullYear()}-${String(realToday.getMonth() + 1).padStart(2, '0')}`;
  const all = filterDeadlinesByType(getDeadlines());
  const thisMonth = all.filter(d => d.date && d.date.startsWith(monthPrefix));
  const now = todayStr();

  let overdue = 0;
  let upcoming = 0;
  let completed = 0;
  thisMonth.forEach(d => {
    if (d.completed) { completed++; return; }
    if (d.date < now) overdue++;
    else if (daysBetween(now, d.date) <= 7) upcoming++;
  });

  const chips = [];
  if (thisMonth.length > 0) {
    chips.push(`<span class="calendar-stat-chip"><i class="fa-solid fa-calendar-check"></i>${thisMonth.length} this month</span>`);
  }
  if (upcoming > 0) {
    chips.push(`<span class="calendar-stat-chip upcoming"><i class="fa-solid fa-clock"></i>${upcoming} in next 7 days</span>`);
  }
  if (overdue > 0) {
    chips.push(`<span class="calendar-stat-chip overdue"><i class="fa-solid fa-triangle-exclamation"></i>${overdue} overdue</span>`);
  }
  if (completed > 0) {
    chips.push(`<span class="calendar-stat-chip done"><i class="fa-solid fa-circle-check"></i>${completed} done</span>`);
  }

  if (chips.length === 0) {
    container.innerHTML = `<span class="calendar-stat-chip muted"><i class="fa-regular fa-circle-check"></i>Nothing scheduled</span>`;
  } else {
    container.innerHTML = chips.join('');
  }
}

// ---- Upcoming strip (next 7 days, incomplete only) ----
function renderCalendarUpcoming() {
  const card = document.getElementById('calendarUpcomingCard');
  const list = document.getElementById('calendarUpcomingList');
  const countEl = document.getElementById('calendarUpcomingCount');
  if (!card || !list) return;

  const now = todayStr();
  const upcoming = filterDeadlinesByType(getDeadlines())
    .filter(d => d.date && !d.completed)
    .filter(d => {
      const diff = daysBetween(now, d.date);
      return diff >= 0 && diff <= 7;
    })
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 5);

  if (upcoming.length === 0) {
    card.classList.add('hidden');
    return;
  }

  card.classList.remove('hidden');
  if (countEl) countEl.textContent = `${upcoming.length} item${upcoming.length === 1 ? '' : 's'}`;

  list.innerHTML = upcoming.map(d => {
    const t = getDeadlineTypeInfo(d.type);
    const countdown = formatDeadlineCountdown(d.date);
    const diff = daysBetween(now, d.date);
    const isToday = diff === 0;

    return `
      <div class="upcoming-item" onclick="openDeadlineSheet(null, '${d.id}')">
        <span class="deadline-type-icon" style="background:${t.color};">
          <i class="fa-solid ${t.icon}"></i>
        </span>
        <div class="min-w-0 flex-1">
          <p class="text-sm font-medium truncate">
            ${escapeHtml(d.title || 'Deadline')}
            ${isToday ? '<span class="upcoming-today-tag">TODAY</span>' : ''}
          </p>
          <p class="text-[11px] opacity-55 truncate">
            ${t.label}${d.subject ? ' · ' + escapeHtml(d.subject) : ''} · ${escapeHtml(countdown)}
          </p>
        </div>
        <i class="fa-solid fa-chevron-right text-xs opacity-40 shrink-0"></i>
      </div>
    `;
  }).join('');
}

// ---- Swipe to change month ----
let calendarSwipeBound = false;
let calendarTouchStartX = 0;
let calendarTouchStartY = 0;

function bindCalendarSwipe() {
  if (calendarSwipeBound) return;
  const grid = document.getElementById('calendarGrid');
  if (!grid) return;
  calendarSwipeBound = true;

  grid.addEventListener('touchstart', (e) => {
    const t = e.changedTouches[0];
    calendarTouchStartX = t.screenX;
    calendarTouchStartY = t.screenY;
  }, { passive: true });

  grid.addEventListener('touchend', (e) => {
    const t = e.changedTouches[0];
    const dx = t.screenX - calendarTouchStartX;
    const dy = t.screenY - calendarTouchStartY;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);

    // Require horizontal swipe > 60px and more horizontal than vertical
    if (absX < 60 || absX < absY) return;

    if (dx > 0) changeMonth(-1);
    else changeMonth(1);
  }, { passive: true });
}
// ============================================================
// LIBRARY FUNCTIONS
// ============================================================
function renderSavedList() {
  const container = document.getElementById('savedList');
  const emptyMsg = document.getElementById('emptyLibrary');
  if (!container) return;

  updateSavedCount();

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

// ============================================================
// OPEN SAVED REVIEWER IN A NEW WINDOW
// ============================================================
function openItemInNewWindow(index) {
  const saved = safeLocalStorageGet('acadhub_saved', []);
  const item = saved[index];
  if (!item || !item.data) {
    showNotification('Item not found.', 'error');
    return;
  }

  const base = window.location.origin + window.location.pathname;
  const url = `${base}?view=${encodeURIComponent(item.id)}`;

  const win = window.open(url, '_blank', 'noopener');
  if (!win) {
    showNotification('Pop-up blocked. Please allow pop-ups for this site.', 'warning');
  }
}



function loadSavedItem(index) {
  const saved = safeLocalStorageGet('acadhub_saved', []);
  const item = saved[index];

  if (!item || !item.data) return;

  switchTab('reviewer');   
  switchReviewerPane('generate');

  // ✅ NEW: enter saved-view mode — hide generator, show back button
  const viewReviewer = document.getElementById('viewReviewer');
  if (viewReviewer) viewReviewer.classList.add('saved-view-mode');
  const backBtn = document.getElementById('backToGeneratorBtn');
  if (backBtn) backBtn.classList.remove('hidden');

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
  document.getElementById('shareReviewerBtn').classList.remove('hidden');
  document.getElementById('saveAsNoteBtn').classList.remove('hidden');

  updateResultsNavCounts();
  initResultsNav();
}
function exitSavedView() {
  if (generationAbortController) {
    generationAbortController.abort();
    generationAbortController = null;
    
    const submitBtn = document.getElementById('submitBtn');
    const btnContent = document.getElementById('btnContent');
    if (submitBtn) submitBtn.disabled = false;
    if (btnContent) btnContent.innerHTML =
      '<i class="fa-solid fa-wand-magic-sparkles mr-2"></i>Generate Study Materials';
  }
  
  const viewReviewer = document.getElementById('viewReviewer');
  if (viewReviewer) viewReviewer.classList.remove('saved-view-mode');
  
  const backBtn = document.getElementById('backToGeneratorBtn');
  if (backBtn) backBtn.classList.add('hidden');
  
  const resultsContainer = document.getElementById('resultsContainer');
  if (resultsContainer) resultsContainer.classList.add('hidden');
  
  hideSkeleton();
  currentResults = null;
  
  const qualityEl = document.getElementById('generationQuality');
  if (qualityEl) qualityEl.textContent = '';
}



// ============================================================
// QUICK SUMMARIZE (Gemini)
// ============================================================
let previewDebounceTimer = null;

async function requestSummaryOnly() {
  const notes = document.getElementById('studyNotes').value.trim();
  const fileInput = document.getElementById('fileInput');
  const hasFile = fileInput.files.length > 0;

  if (!notes && !hasFile) return null;

  const formData = new FormData();
  if (notes) formData.append('notes', notes);
  if (hasFile) formData.append('file', fileInput.files[0]);

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

  openQuickSummarySheet();
  document.getElementById('quickSummaryLoading').classList.remove('hidden');
  document.getElementById('quickSummaryList').innerHTML = '';
  document.getElementById('quickSummaryEmpty').classList.add('hidden');

  try {
    const summary = await requestSummaryOnly();
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

  try {
    const summary = await requestSummaryOnly();
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
  invalidateDeadlinesCache();
  invalidateProgressCache();

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
        migrateSavedFlashcardOrder();

   
   
   // ---- SRS schedule sync ----
   const firestoreSrs = await loadFromFirestore('srs');
   if (firestoreSrs.length > 0) {
     const localSrs = getSrsData();
     const merged = { ...localSrs };
     firestoreSrs.forEach(rec => {
       if (rec.id) merged[rec.id] = { ...(merged[rec.id] || {}), ...rec };
     });
     setSrsData(merged);
   }
   
// ---- Deadlines sync ----
const firestoreDeadlines = await loadFromFirestore('deadlines');
if (firestoreDeadlines.length > 0) {
  safeLocalStorageSet('acadhub_deadlines', firestoreDeadlines);
  invalidateDeadlinesCache();   // ← forces next read to re-hydrate from storage
}

// ---- Progress / Streak / XP sync ----
try {
  const firestoreProgress = await loadFromFirestore('progress');
  const serverStats = firestoreProgress.find(x => x.id === 'stats');
  if (serverStats) {
    const local = safeLocalStorageGet(PROGRESS_LS_KEY, null);
    const serverTotal = serverStats.totalXp || 0;
    const localTotal  = (local && local.totalXp) || 0;
    if (!local || serverTotal > localTotal) {
  // Server has more — use it
  const clean = { ...serverStats };
  delete clean.id;
  safeLocalStorageSet(PROGRESS_LS_KEY, clean);
  invalidateProgressCache();   // ← ADD THIS
} else if (localTotal > serverTotal) {
  // Local has more — push up
  syncProgressToFirestore(local);
}
  }
} catch (err) {
  console.warn('Progress load failed:', err);
}

renderHomeDashboard();

        // ---- Load user document (settings & profile) ----
const userDoc = await db.collection('users').doc(user.uid).get();
if (userDoc.exists) {
  const userData = userDoc.data();
  
  if (userData.mode) {
    document.documentElement.classList.remove('dark', 'light');
    document.documentElement.classList.add(userData.mode);
    safeLocalStorageSet('theme', userData.mode);
  }
  
  if (userData.theme) {
    currentTheme = userData.theme;
    applyTheme(currentTheme);
    safeLocalStorageSet('acadhub_theme', currentTheme);
    syncThemeControls();
    renderThemePresets();
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
function checkForSavedItemView() {
  const params = new URLSearchParams(window.location.search);
  const viewId = params.get('view');
  if (!viewId) return false;

  const saved = safeLocalStorageGet('acadhub_saved', []);
  const item = saved.find(s => s.id === viewId);

  if (!item || !item.data) {
    document.body.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;min-height:100vh;padding:2rem;text-align:center;font-family:'Inter',system-ui,sans-serif;">
        <div>
          <h1 style="font-size:1.5rem;margin-bottom:0.5rem;">Reviewer not found</h1>
          <p style="opacity:0.6;">This saved reviewer could not be loaded. It may have been deleted.</p>
        </div>
      </div>`;
    return true;
  }

  // Viewer mode
  document.body.classList.add('viewer-mode');
  document.title = (item.title || 'Reviewer') + ' — AcadHub';

  switchTab('reviewer');

  // Hide shared banner (that's for shared reviewers, not saved items)
  const banner = document.getElementById('sharedBanner');
  if (banner) banner.classList.add('hidden');

  const resultsContainer = document.getElementById('resultsContainer');
  resultsContainer.classList.remove('hidden');
  renderSummary(item.data.summary);
  renderFlashcards(item.data.flashcards);
  renderQuiz(item.data.quiz);

  if (item.data.quality) {
    const qualityEl = document.getElementById('generationQuality');
    if (qualityEl) {
      const providerName = item.data.provider === 'gemini' ? 'Gemini'
                         : item.data.provider === 'groq'   ? 'Groq'
                         : null;
      const badge = providerName ? ` · Powered by ${providerName}` : '';
      qualityEl.textContent = `Generation quality: ${item.data.quality.score}% (source and answer consistency)${badge}`;
    }
  }

  currentResults = {
    ...item.data,
    title: item.title,
    author: item.author || null,
    subject: item.subject || null,
  };

  document.getElementById('saveToLibraryBtn').classList.add('hidden');
  document.getElementById('saveAsNoteBtn').classList.remove('hidden');
  document.getElementById('shareReviewerBtn').classList.remove('hidden');

  updateResultsNavCounts();
  initResultsNav();

  return true;
}
// ---- Escape key closes any open sheet ----
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;

  // Highest z-index first
  const editSubjectSheet = document.getElementById('editSubjectSheet');
  if (editSubjectSheet && !editSubjectSheet.classList.contains('hidden')) {
    closeEditSubject(); return;
  }

  const metaSheet = document.getElementById('generateMetaSheet');
  if (metaSheet && !metaSheet.classList.contains('hidden')) {
    closeGenerateMetaSheet(); return;
  }

  const deadlineSheet = document.getElementById('deadlineSheet');
  if (deadlineSheet && !deadlineSheet.classList.contains('hidden')) {
    closeDeadlineSheet(); return;
  }

  const subjectPicker = document.getElementById('subjectPickerSheet');
  if (subjectPicker && !subjectPicker.classList.contains('hidden')) {
    closeSubjectPicker(); return;
  }
});

// ============================================================
// MIGRATION: normalize old saved flashcards to new order
// ============================================================
function migrateSavedFlashcardOrder() {
  const saved = safeLocalStorageGet('acadhub_saved', []);
  if (!Array.isArray(saved) || saved.length === 0) return;
  
  let changed = false;
  
  saved.forEach(item => {
    const cards = item?.data?.flashcards;
    if (!Array.isArray(cards)) return;
    
    cards.forEach(card => {
      if (card._answerFirst) return; // already migrated
      
      // Legacy card: front = term, back = description. Swap them.
      const oldFront = card.front;
      card.front = card.back;
      card.back = oldFront;
      card._answerFirst = true;
      changed = true;
    });
  });
  
  if (changed) {
    safeLocalStorageSet('acadhub_saved', saved);
    console.log('✅ Migrated saved flashcards to new order');
    
    // Best-effort: push migrated items back to Firestore
    if (firebaseAvailable && auth && auth.currentUser && db) {
      saved.forEach(item => {
        if (item?.id && item?.data?.flashcards?.some(c => c._answerFirst)) {
          db.collection('users').doc(auth.currentUser.uid)
            .collection('library').doc(item.id)
            .set(item, { merge: true })
            .catch(err => console.warn('Migration sync failed for', item.id, err));
        }
      });
    }
  }
}
// ============================================================
// INITIALIZATION - FIXED VERSION
// ============================================================
function initializeApp() {
  console.log('🚀 Initializing AcadHub Suite...');
  console.log('📡 Backend URL:', API_BASE_URL);

  // Show offline banner if we start offline
  updateOfflineBanner();

  // Move full-screen overlays to <body> so hidden view containers don't hide them
  ensureOverlaysAtBodyLevel();

  // --- Load theme + accent (needed in every mode) ---

  // --- Load theme + accent (needed in every mode) ---
  const savedTheme = safeLocalStorageGet('theme', 'light');
  document.documentElement.classList.remove('dark', 'light');
  document.documentElement.classList.add(savedTheme);

 loadTheme();
syncThemeControls();
renderThemePresets();
  // --- Viewer mode? Skip splash, skip full app init ---
  const params = new URLSearchParams(window.location.search);
  if (params.get('view')) {
    const splash = document.getElementById('splashScreen');
    if (splash) splash.remove();
    checkBackendHealth();
    checkForSavedItemView();
    return;
  }

  // --- Normal app init (unchanged from here down) ---
  startSplashProgress();
  startTipCarousel();

  checkBackendHealth().then(available => {
    backendAvailable = available;
    console.log(available ? '✅ Backend available' : '⚠️ Backend offline - using local mode');
  });

  offlineQueue = safeLocalStorageGet('offline_queue', []);
  migrateSavedFlashcardOrder();

  // Fresh caches on cold start
  invalidateDeadlinesCache();
  invalidateProgressCache();

  // Restore calendar view preferences
  currentCalendarView = safeLocalStorageGet('acadhub_calendar_view', 'month');
  currentTypeFilter = safeLocalStorageGet('acadhub_calendar_type_filter', 'all');
  setTimeout(() => setCalendarView(currentCalendarView), 50);

  renderSavedList();
  renderCalendar();
  renderNotesList();
  renderSubjectFilters();
  renderHomeDashboard();
  updateSettingsUI();
  updateSoundToggleUI();
  updateParticlesToggleUI();
  updateSavedCount();
  initQuickSummaryListeners();
  initAdvancedOptions();

  setTimeout(() => {
    enableTabButtons();
    console.log('✅ Tab buttons force-enabled');
  }, 100);

  window.addEventListener('load', () => {
    enableTabButtons();
  });

  switchTab('home');
checkForSharedReviewer();
hideSplashScreen();

console.log('✅ AcadHub Suite initialized successfully');
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

function actionViewItemNewWindow() {
  if (actionSheetIndex === null) return;
  const index = actionSheetIndex;
  closeActionSheet();
  openItemInNewWindow(index);    
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
// ============================================================
// THEME UI
// ============================================================
function renderThemePresets() {
  const grid = document.getElementById('themePresetGrid');
  if (!grid) return;
  
  grid.innerHTML = Object.entries(THEME_PRESETS).map(([key, preset]) => `
    <button type="button"
            class="theme-preset-card ${currentTheme.preset === key ? 'active' : ''}"
            onclick="selectThemePreset('${key}')">
      <span class="theme-preset-swatch" style="background: linear-gradient(135deg, ${preset.accent}, ${preset.bgBody});"></span>
      <span class="theme-preset-label">${preset.label}</span>
    </button>
  `).join('');
}

function syncThemeControls() {
  const t = resolveTheme(currentTheme);
  
  const accentPicker = document.getElementById('accentPicker');
  if (accentPicker) accentPicker.value = t.accent;
  
  const bgPicker = document.getElementById('bgPicker');
  if (bgPicker) bgPicker.value = t.bgBody || '#0a0a12';
  
  const densitySelect = document.getElementById('densitySelect');
  if (densitySelect) densitySelect.value = String(t.density);
}

function toggleSettingsModal() {
  const modal = document.getElementById('settingsModal');
  modal.classList.toggle('hidden');
  if (!modal.classList.contains('hidden')) {
    updateSettingsUI();
    syncThemeControls();
    renderThemePresets();
  }
}

// ============================================================
// AI keys are now server-side (Vercel env vars) — no client management
// ============================================================

function stopTipCarousel() {
  if (tipInterval) {
    clearInterval(tipInterval);
    tipInterval = null;
  }
}

// ============================================================
// RECALL STUDY MODE (Identification + Enumeration)
// ============================================================
let recallQueue = [];
let recallOriginalQueue = [];
let recallIndex = 0;
let recallRevealed = false;
let recallSessionStats = { easy: 0, hard: 0, forgot: 0 };
let recallKbBound = false;

function recallKey(item) {
  return String(item.question || '').trim().toLowerCase();
}

function buildRecallQueue(mode = 'all') {
  const quiz = (currentResults && currentResults.quiz) || {};
  const pool = [];
  
  if (mode === 'all' || mode === 'identification') {
    (quiz.identification || []).forEach(q => {
      pool.push({
        kind: 'id',
        question: q.question,
        answer: q.answer,
        key: 'id:' + recallKey(q)
      });
    });
  }
  
  if (mode === 'all' || mode === 'enumeration') {
    (quiz.enumeration || []).forEach(q => {
      pool.push({
        kind: 'enum',
        question: q.question,
        answer: q.answer,
        key: 'en:' + recallKey(q)
      });
    });
  }
  
  return pool;
}

function openRecallStudyMode(mode = 'all') {
  const pool = buildRecallQueue(mode);
  if (!pool.length) {
    showNotification('No recall questions available.', 'warning');
    return;
  }
  
  recallQueue = pool;
  recallOriginalQueue = [...pool];
  recallIndex = 0;
  recallRevealed = false;
  recallSessionStats = { easy: 0, hard: 0, forgot: 0 };
  
  document.getElementById('recallModeOverlay').classList.remove('hidden');
  document.getElementById('recallCompleteOverlay').classList.add('hidden');
  document.body.style.overflow = 'hidden';
  
  bindRecallKeyboard();
  renderRecallCard();
}

function exitRecallStudyMode() {
  document.getElementById('recallModeOverlay').classList.add('hidden');
  document.getElementById('recallCompleteOverlay').classList.add('hidden');
  document.body.style.overflow = '';
}

function renderRecallCard() {
  if (!recallQueue.length || recallIndex >= recallQueue.length) {
    showRecallComplete();
    return;
  }
  
  const item = recallQueue[recallIndex];
  
  document.getElementById('recallCurrent').textContent = recallIndex + 1;
  document.getElementById('recallTotal').textContent = recallQueue.length;
  
  const pct = Math.round((recallIndex / recallQueue.length) * 100);
  document.getElementById('recallProgressFill').style.width = pct + '%';
  
  const badge = document.getElementById('recallTypeBadge');
  if (item.kind === 'id') {
    badge.textContent = 'Identification';
    badge.className = 'inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-indigo-500/15 text-indigo-300 border border-indigo-500/30';
  } else {
    badge.textContent = 'Enumeration';
    badge.className = 'inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-500/15 text-amber-300 border border-amber-500/30';
  }
  
  document.getElementById('recallQuestion').textContent = item.question;
  
  const input = document.getElementById('recallInput');
  input.value = '';
  input.disabled = false;
  
  document.getElementById('recallFeedback').classList.add('hidden');
  document.getElementById('recallCheckBtn').classList.remove('hidden');
  
  recallRevealed = false;
  
  if (window.matchMedia('(min-width: 640px)').matches) {
    setTimeout(() => input.focus(), 100);
  }
}

function checkRecallAnswer() {
  if (recallRevealed) return;
  const item = recallQueue[recallIndex];
  if (!item) return;
  
  const input = document.getElementById('recallInput');
  const userAnswer = input.value.trim();
  
  if (!userAnswer) {
    showNotification('Type your answer first.', 'warning');
    return;
  }
  
  recallRevealed = true;
  input.disabled = true;
  
  document.getElementById('recallUserAnswer').textContent = userAnswer || '(blank)';
  document.getElementById('recallCorrectAnswer').textContent = item.answer;
  
  document.getElementById('recallCheckBtn').classList.add('hidden');
  document.getElementById('recallFeedback').classList.remove('hidden');
}

function rateRecallCard(rating) {
  if (!recallRevealed) return;
  const item = recallQueue[recallIndex];
  if (!item) return;
  
  const ratings = safeLocalStorageGet('acadhub_flashcard_ratings', {});
  ratings[item.key] = rating;
  safeLocalStorageSet('acadhub_flashcard_ratings', ratings);
  
  recallSessionStats[rating]++;

// XP: +2 per rated recall item (silent)
addXp(XP_REWARDS.recallItem, { silent: true });

recallIndex++;
  recallRevealed = false;
  
  if (recallIndex >= recallQueue.length) {
    showRecallComplete();
  } else {
    renderRecallCard();
  }
}

function skipRecallCard() {
  recallIndex++;
  recallRevealed = false;
  if (recallIndex >= recallQueue.length) {
    showRecallComplete();
  } else {
    renderRecallCard();
  }
}

function showRecallComplete() {
  document.getElementById('recallSummaryEasy').textContent = recallSessionStats.easy;
  document.getElementById('recallSummaryHard').textContent = recallSessionStats.hard;
  document.getElementById('recallSummaryForgot').textContent = recallSessionStats.forgot;
  document.getElementById('recallMissedCount').textContent = recallSessionStats.hard + recallSessionStats.forgot;
  
  document.getElementById('recallReviewMissedBtn').style.display =
  (recallSessionStats.hard + recallSessionStats.forgot > 0) ? 'block' : 'none';

// XP: +15 recall session bonus
const _recallTotal = recallSessionStats.easy + recallSessionStats.hard + recallSessionStats.forgot;
if (_recallTotal > 0) {
  addXp(XP_REWARDS.recallSession);
}

document.getElementById('recallCompleteOverlay').classList.remove('hidden');
}

function recallReviewMissed() {
  const ratings = safeLocalStorageGet('acadhub_flashcard_ratings', {});
  recallQueue = recallOriginalQueue.filter(item => {
    const r = ratings[item.key];
    return r === 'forgot' || r === 'hard';
  });
  
  if (!recallQueue.length) {
    showNotification('No missed items to review.', 'info');
    return;
  }
  
  recallIndex = 0;
  recallRevealed = false;
  recallSessionStats = { easy: 0, hard: 0, forgot: 0 };
  document.getElementById('recallCompleteOverlay').classList.add('hidden');
  renderRecallCard();
}
// ============================================================
// ADVANCED OPTIONS ACCORDION
// ============================================================
const ADV_OPTIONS_LS_KEY = 'acadhub_advanced_options_open';

function toggleAdvancedOptions() {
  const panel = document.getElementById('advancedOptions');
  const btn = document.getElementById('advancedToggleBtn');
  const chevron = document.getElementById('advancedToggleChevron');
  if (!panel || !btn) return;
  
  const isOpen = !panel.classList.contains('hidden');
  const nextOpen = !isOpen;
  
  panel.classList.toggle('hidden', !nextOpen);
  btn.setAttribute('aria-expanded', String(nextOpen));
  if (chevron) chevron.classList.toggle('rotate-180', nextOpen);
  
  safeLocalStorageSet(ADV_OPTIONS_LS_KEY, nextOpen);
}

function initAdvancedOptions() {
  const panel = document.getElementById('advancedOptions');
  const btn = document.getElementById('advancedToggleBtn');
  const chevron = document.getElementById('advancedToggleChevron');
  if (!panel || !btn) return;
  
  const wasOpen = safeLocalStorageGet(ADV_OPTIONS_LS_KEY, false);
  
  panel.classList.toggle('hidden', !wasOpen);
  btn.setAttribute('aria-expanded', String(wasOpen));
  if (chevron) chevron.classList.toggle('rotate-180', wasOpen);
}
function restartRecallSession() {
  recallQueue = [...recallOriginalQueue];
  recallIndex = 0;
  recallRevealed = false;
  recallSessionStats = { easy: 0, hard: 0, forgot: 0 };
  document.getElementById('recallCompleteOverlay').classList.add('hidden');
  renderRecallCard();
}

function bindRecallKeyboard() {
  if (recallKbBound) return;
  recallKbBound = true;
  
  document.addEventListener('keydown', (e) => {
    const overlay = document.getElementById('recallModeOverlay');
    if (!overlay || overlay.classList.contains('hidden')) return;
    
    const tag = document.activeElement && document.activeElement.tagName;
    const typing = tag === 'INPUT' || tag === 'TEXTAREA';
    
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      if (!recallRevealed) checkRecallAnswer();
      else skipRecallCard();
      return;
    }
    
    if (recallRevealed) {
      if (e.key === '1') { rateRecallCard('forgot'); return; }
      if (e.key === '2') { rateRecallCard('hard'); return; }
      if (e.key === '3') { rateRecallCard('easy'); return; }
    }
    
    if (e.key === 'Escape' && !typing) exitRecallStudyMode();
  });
}

// ============================================================
// MCQ STUDY MODE (Multiple Choice Drill)
// ============================================================
let mcqQueue = [];
let mcqOriginalQueue = [];
let mcqIndex = 0;
let mcqAnswered = false;
let mcqSessionStats = { correct: 0, wrong: 0 };
let mcqKbBound = false;

function buildMcqQueue() {
  const quiz = (currentResults && currentResults.quiz) || {};
  return (quiz.multipleChoice || []).map((q, i) => ({
    index: i,
    question: q.question,
    options: q.options || [],
    correct: q.correct,
    key: 'mcq:' + String(q.question || '').trim().toLowerCase()
  }));
}

function openMcqStudyMode() {
  const pool = buildMcqQueue();
  if (!pool.length) {
    showNotification('No multiple choice questions available.', 'warning');
    return;
  }

  mcqQueue = pool;
  mcqOriginalQueue = [...pool];
  mcqIndex = 0;
  mcqAnswered = false;
  mcqSessionStats = { correct: 0, wrong: 0 };

  document.getElementById('mcqStudyOverlay').classList.remove('hidden');
  document.getElementById('mcqCompleteOverlay').classList.add('hidden');
  document.body.style.overflow = 'hidden';

  bindMcqKeyboard();
  renderMcqCard();
}

function exitMcqStudyMode() {
  document.getElementById('mcqStudyOverlay').classList.add('hidden');
  document.getElementById('mcqCompleteOverlay').classList.add('hidden');
  document.body.style.overflow = '';
}

function renderMcqCard() {
  if (!mcqQueue.length || mcqIndex >= mcqQueue.length) {
    showMcqComplete();
    return;
  }

  const item = mcqQueue[mcqIndex];

  document.getElementById('mcqCurrent').textContent = mcqIndex + 1;
  document.getElementById('mcqTotal').textContent = mcqQueue.length;

  const pct = Math.round((mcqIndex / mcqQueue.length) * 100);
  document.getElementById('mcqProgressFill').style.width = pct + '%';

  document.getElementById('mcqQuestion').textContent = item.question;

  const optionsContainer = document.getElementById('mcqOptions');
  optionsContainer.innerHTML = '';

  (item.options || []).forEach((opt, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'mcq-study-option w-full text-left px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-sm transition';
    btn.dataset.index = i;
    btn.innerHTML = `<span class="font-semibold mr-2 text-indigo-400">${String.fromCharCode(65 + i)}.</span>${opt}`;
    btn.onclick = () => selectMcqOption(i);
    optionsContainer.appendChild(btn);
  });

  document.getElementById('mcqFeedback').classList.add('hidden');
  mcqAnswered = false;
}

function selectMcqOption(index) {
  if (mcqAnswered) return;
  mcqAnswered = true;

  const item = mcqQueue[mcqIndex];
  const buttons = document.querySelectorAll('#mcqOptions .mcq-study-option');

  buttons.forEach((btn, i) => {
    btn.disabled = true;
    btn.style.cursor = 'default';
    if (i === item.correct) {
      btn.classList.add('mcq-correct');
    } else if (i === index && index !== item.correct) {
      btn.classList.add('mcq-wrong');
    } else {
      btn.classList.add('opacity-40');
    }
  });

  const isCorrect = index === item.correct;
  if (isCorrect) mcqSessionStats.correct++;
  else mcqSessionStats.wrong++;

  // Persist rating so browse-mode flashcards show a badge
  const ratings = safeLocalStorageGet('acadhub_flashcard_ratings', {});
  ratings[item.key] = isCorrect ? 'easy' : 'forgot';
  safeLocalStorageSet('acadhub_flashcard_ratings', ratings);

  // XP: +2 per question
  addXp(XP_REWARDS.recallItem, { silent: true });

  // Feedback block
  const feedback = document.getElementById('mcqFeedback');
  const msg = document.getElementById('mcqFeedbackMsg');
  if (isCorrect) {
    msg.className = 'p-3 rounded-xl text-sm bg-emerald-500/10 border border-emerald-500/30 text-emerald-300';
    msg.innerHTML = '<i class="fa-solid fa-circle-check mr-2"></i>Correct!';
  } else {
    msg.className = 'p-3 rounded-xl text-sm bg-rose-500/10 border border-rose-500/30 text-rose-300';
    const correctText = item.options[item.correct] || '';
    msg.innerHTML = `<i class="fa-solid fa-circle-xmark mr-2"></i>Not quite. Correct answer: <strong>${String.fromCharCode(65 + item.correct)}. ${correctText}</strong>`;
  }
  feedback.classList.remove('hidden');

  // Play correct/wrong sound
  SoundEngine.play(isCorrect ? 'success' : 'error');

  const nextBtn = document.getElementById('mcqNextBtn');
  if (nextBtn) {
    nextBtn.innerHTML = (mcqIndex === mcqQueue.length - 1)
      ? '<i class="fa-solid fa-flag-checkered mr-2"></i>Finish'
      : 'Next Question <i class="fa-solid fa-arrow-right ml-2"></i>';
  }
}

function nextMcqCard() {
  if (!mcqAnswered) return;
  mcqIndex++;
  mcqAnswered = false;
  if (mcqIndex >= mcqQueue.length) {
    showMcqComplete();
  } else {
    renderMcqCard();
  }
}

function showMcqComplete() {
  const total = mcqSessionStats.correct + mcqSessionStats.wrong;
  const pct = total ? Math.round((mcqSessionStats.correct / total) * 100) : 0;

  document.getElementById('mcqSummaryCorrect').textContent = mcqSessionStats.correct;
  document.getElementById('mcqSummaryWrong').textContent = mcqSessionStats.wrong;
  document.getElementById('mcqSummaryScore').textContent = pct + '%';
  document.getElementById('mcqMissedCount').textContent = mcqSessionStats.wrong;

  const reviewBtn = document.getElementById('mcqReviewWrongBtn');
  if (reviewBtn) reviewBtn.style.display = mcqSessionStats.wrong > 0 ? 'block' : 'none';

  // Session XP bonus
  if (total > 0) addXp(XP_REWARDS.recallSession);

  document.getElementById('mcqStudyOverlay').classList.add('hidden');
  document.getElementById('mcqCompleteOverlay').classList.remove('hidden');
}

function restartMcqSession() {
  mcqQueue = [...mcqOriginalQueue];
  mcqIndex = 0;
  mcqAnswered = false;
  mcqSessionStats = { correct: 0, wrong: 0 };
  document.getElementById('mcqCompleteOverlay').classList.add('hidden');
  document.getElementById('mcqStudyOverlay').classList.remove('hidden');
  renderMcqCard();
}

function mcqReviewWrong() {
  const ratings = safeLocalStorageGet('acadhub_flashcard_ratings', {});
  mcqQueue = mcqOriginalQueue.filter(item => ratings[item.key] === 'forgot');

  if (!mcqQueue.length) {
    showNotification('No missed questions to review.', 'info');
    return;
  }

  mcqIndex = 0;
  mcqAnswered = false;
  mcqSessionStats = { correct: 0, wrong: 0 };
  document.getElementById('mcqCompleteOverlay').classList.add('hidden');
  document.getElementById('mcqStudyOverlay').classList.remove('hidden');
  renderMcqCard();
}

function bindMcqKeyboard() {
  if (mcqKbBound) return;
  mcqKbBound = true;

  document.addEventListener('keydown', (e) => {
    const overlay = document.getElementById('mcqStudyOverlay');
    if (!overlay || overlay.classList.contains('hidden')) return;

    if (e.key === 'Escape') { exitMcqStudyMode(); return; }

    if (!mcqAnswered) {
      // A/B/C/D to select (only single-character letter keys)
      if (e.key.length === 1 && /[a-z]/i.test(e.key)) {
        const idx = e.key.toUpperCase().charCodeAt(0) - 65;
        const item = mcqQueue[mcqIndex];
        if (item && idx >= 0 && idx < item.options.length) {
          selectMcqOption(idx);
        }
      }
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      nextMcqCard();
    }
  });
}
// ============================================================
// OFFLINE / ONLINE DETECTION
// ============================================================
function updateOfflineBanner() {
  const banner = document.getElementById('offlineBanner');
  if (!banner) return;
  banner.classList.toggle('hidden', navigator.onLine);
}

window.addEventListener('online', () => {
  updateOfflineBanner();
  showNotification('Back online', 'success');
  checkBackendHealth();
});

window.addEventListener('offline', () => {
  updateOfflineBanner();
  showNotification('You are offline — AI features will be unavailable', 'warning');
});

// ============================================================
// BOOTSTRAP
// ============================================================
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp);
} else {
  initializeApp();
}

// ============================================================
// HOME DASHBOARD + SPACED REPETITION QUEUE
// ============================================================

// ---- SRS storage ----
const SRS_LS_KEY = 'acadhub_srs';

let dueReviewMode = false;
let dueReviewSubjectMap = {};
let __preDueResults = undefined;
let homeRecentItems = [];

function getSrsData() {
  return safeLocalStorageGet(SRS_LS_KEY, {});
}

function setSrsData(data) {
  safeLocalStorageSet(SRS_LS_KEY, data);
}

function srsDocId(cardKey) {
  // Firestore doc IDs cannot contain '/'
  return String(cardKey).replace(/[\/]/g, '_').slice(0, 1400);
}

// ---- SM-2 inspired scheduler ----
function scheduleNext(cardKey, rating, subject) {
  if (!cardKey) return;

  const all = getSrsData();
  const existing = all[cardKey] || {
    interval: 0,
    easeFactor: 2.5,
    reviewCount: 0,
    lapses: 0,
    subject: subject || null,
  };

  let interval = existing.interval || 0;
  let easeFactor = existing.easeFactor || 2.5;
  let reviewCount = existing.reviewCount || 0;
  let lapses = existing.lapses || 0;

  if (rating === 'forgot') {
    interval = 1;
    easeFactor = Math.max(1.3, easeFactor - 0.20);
    lapses += 1;
  } else if (rating === 'hard') {
    interval = interval === 0 ? 1 : Math.max(1, Math.round(interval * 1.2));
    easeFactor = Math.max(1.3, easeFactor - 0.15);
  } else if (rating === 'easy') {
    interval = interval === 0 ? 3 : Math.max(2, Math.round(interval * easeFactor));
    easeFactor = Math.min(3.0, easeFactor + 0.15);
  }

  reviewCount += 1;

  const nextReviewAt = new Date(
    Date.now() + interval * 24 * 60 * 60 * 1000
  ).toISOString();

  all[cardKey] = {
    interval,
    easeFactor: Math.round(easeFactor * 100) / 100,
    nextReviewAt,
    lastRating: rating,
    reviewCount,
    lapses,
    subject: subject || existing.subject || null,
    updatedAt: new Date().toISOString(),
  };

  setSrsData(all);

  if (firebaseAvailable && auth && auth.currentUser) {
    db.collection('users').doc(auth.currentUser.uid)
      .collection('srs').doc(srsDocId(cardKey))
      .set(all[cardKey], { merge: true })
      .catch(err => console.warn('SRS sync failed:', err));
  }
}

// ---- Compute the due queue ----
function computeDueQueue() {
  const saved = safeLocalStorageGet('acadhub_saved', []);
  const srs = getSrsData();
  const now = Date.now();
  const due = [];
  const seen = new Set();

  saved.forEach(item => {
    const cards = (item && item.data && item.data.flashcards) || [];
    const subject = item.subject || null;

    cards.forEach(card => {
      const key = flashcardKey(card);
      if (!key || seen.has(key)) return;
      seen.add(key);

      const record = srs[key];

      if (!record) {
        due.push({
          key,
          front: card.front,
          back: card.back,
          subject,
          isNew: true,
          lastRating: null,
          lastReviewedAt: null,
        });
        return;
      }

      const nextAt = record.nextReviewAt
        ? new Date(record.nextReviewAt).getTime()
        : 0;

      if (nextAt <= now) {
        due.push({
          key,
          front: card.front,
          back: card.back,
          subject: record.subject && !subject
            ? { name: record.subject, color: '#94a3b8' }
            : subject,
          isNew: false,
          lastRating: record.lastRating,
          lastReviewedAt: record.updatedAt,
        });
      }
    });
  });

  return due;
}

// ---- Greeting helper ----
function getHomeGreetingName() {
  if (cachedAuthorName) return cachedAuthorName;
  if (firebaseAvailable && auth && auth.currentUser) {
    const u = auth.currentUser;
    if (u.displayName) return u.displayName;
    if (u.email) return u.email.split('@')[0];
  }
  return '';
}

// ---- Render subject breakdown bars ----
function renderDueBySubject(due) {
  const container = document.getElementById('dueBySubject');
  if (!container) return;

  const groups = {};
  due.forEach(card => {
    const name = (card.subject && card.subject.name) || 'Uncategorized';
    const color = (card.subject && card.subject.color) || '#94a3b8';
    if (!groups[name]) groups[name] = { name, color, count: 0 };
    groups[name].count++;
  });

  const sorted = Object.values(groups).sort((a, b) => b.count - a.count);
  const max = Math.max(...sorted.map(g => g.count), 1);

  container.innerHTML = sorted.map(g => `
    <div class="due-subject-row">
      <span class="w-2 h-2 rounded-full shrink-0" style="background:${g.color}"></span>
      <span class="flex-1 truncate opacity-80">${escapeHtml(g.name)}</span>
      <span class="font-mono opacity-60 text-xs">${g.count}</span>
      <div class="bar-track">
        <div class="bar-fill" style="width:${(g.count / max) * 100}%; background:${g.color}"></div>
      </div>
    </div>
  `).join('');
}

// ---- Render recent items ----
function renderRecentItems() {
  const container = document.getElementById('recentItemsList');
  if (!container) return;

  const saved = safeLocalStorageGet('acadhub_saved', []);
  const notes = getNotes();
  const items = [];

  saved.forEach((item, idx) => {
    items.push({
      type: 'reviewer',
      idx,
      title: item.title || 'Untitled Reviewer',
      subtitle: `${(item.data && item.data.flashcards ? item.data.flashcards.length : 0)} flashcards · ${formatRelativeTime(item.date)}`,
      timestamp: item.date,
    });
  });

  notes.forEach(note => {
    items.push({
      type: 'note',
      id: note.id,
      title: note.title || 'Untitled note',
      subtitle: `Edited ${formatRelativeTime(note.updatedAt)}`,
      timestamp: note.updatedAt,
    });
  });

  const recent = items
    .filter(i => i.timestamp)
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, 3);

  homeRecentItems = recent;

  if (recent.length === 0) {
    container.innerHTML = `
      <p class="text-xs opacity-50 text-center py-6 glass-card">
        Nothing here yet. Create a note or generate a reviewer to get started.
      </p>`;
    return;
  }

  container.innerHTML = recent.map((item, i) => `
    <div class="glass-card flex items-center gap-3 py-3 cursor-pointer note-card"
         onclick="openHomeRecent(${i})">
      <div class="w-9 h-9 rounded-lg ${
        item.type === 'reviewer'
          ? 'bg-indigo-500/15 text-indigo-400'
          : 'bg-cyan-500/15 text-cyan-400'
      } flex items-center justify-center shrink-0">
        <i class="fa-solid ${
          item.type === 'reviewer' ? 'fa-clone' : 'fa-file-lines'
        } text-sm"></i>
      </div>
      <div class="min-w-0 flex-1">
        <p class="text-sm font-medium truncate">${escapeHtml(item.title)}</p>
        <p class="text-xs opacity-50 truncate">${escapeHtml(item.subtitle)}</p>
      </div>
      <i class="fa-solid fa-chevron-right text-xs opacity-40"></i>
    </div>
  `).join('');
}

function openHomeRecent(index) {
  const item = homeRecentItems[index];
  if (!item) return;
  if (item.type === 'reviewer') {
    loadSavedItem(item.idx);
  } else if (item.type === 'note') {
    openNoteEditor(item.id);
  }
}

// ============================================================
// PROGRESS TRACKING (Streak + Weekly XP)
// ============================================================
const PROGRESS_LS_KEY = 'acadhub_progress';

const XP_REWARDS = {
  flashcard: 2,       // per rated flashcard
  session: 10,        // completed study session
  recallItem: 2,      // per rated recall item
  recallSession: 15,  // completed recall quiz
  test: 20,           // completed Test My Limits
  saveReviewer: 5,    // saved a reviewer to library
  newNote: 3,         // created a new note
};

function localDateStr(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getMondayOfWeek(d = new Date()) {
  const day = d.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diff);
  return localDateStr(monday);
}

function getProgress() {
  // Fast path: cached copy survives between reads
  if (_progressCache) {
    // Still run the cheap rollover checks — they're microseconds
    const today = localDateStr();
    const thisMonday = getMondayOfWeek();
    let dirty = false;
    if (_progressCache.weekStart !== thisMonday) {
      _progressCache.weeklyXp = 0;
      _progressCache.weekStart = thisMonday;
      dirty = true;
    }
    if (_progressCache.lastStudyDate && _progressCache.streak > 0) {
      const gap = daysBetween(_progressCache.lastStudyDate, today);
      if (gap > 1) { _progressCache.streak = 0; dirty = true; }
    }
    if (dirty) safeLocalStorageSet(PROGRESS_LS_KEY, _progressCache);
    return _progressCache;
  }

  // Slow path: hydrate from storage
  let p = safeLocalStorageGet(PROGRESS_LS_KEY, null);
  const today = localDateStr();
  const thisMonday = getMondayOfWeek();

  if (!p || typeof p !== 'object') {
    p = { streak: 0, lastStudyDate: null, weeklyXp: 0, weekStart: thisMonday, totalXp: 0, dailyXp: {} };
  }

  p.streak = Number(p.streak) || 0;
  p.weeklyXp = Number(p.weeklyXp) || 0;
  p.totalXp = Number(p.totalXp) || 0;
  p.weekStart = p.weekStart || thisMonday;
  p.lastStudyDate = p.lastStudyDate || null;
  p.dailyXp = (p.dailyXp && typeof p.dailyXp === 'object') ? p.dailyXp : {};

  let dirty = false;

  if (p.weekStart !== thisMonday) {
    p.weeklyXp = 0;
    p.weekStart = thisMonday;
    dirty = true;
  }

  if (p.lastStudyDate && p.streak > 0) {
    const gap = daysBetween(p.lastStudyDate, today);
    if (gap > 1) {
      p.streak = 0;
      dirty = true;
    }
  }

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  const cutoffStr = localDateStr(cutoff);
  Object.keys(p.dailyXp).forEach(d => {
    if (d < cutoffStr) { delete p.dailyXp[d]; dirty = true; }
  });

  if (dirty) safeLocalStorageSet(PROGRESS_LS_KEY, p);
  _progressCache = p;
  return p;
}

function syncProgressToFirestore(p) {
  if (!firebaseAvailable || !auth || !auth.currentUser) return;
  db.collection('users').doc(auth.currentUser.uid)
    .collection('progress').doc('stats')
    .set(p, { merge: true })
    .catch(err => console.warn('Progress sync failed:', err));
}

function addXp(amount, opts = {}) {
  const num = Number(amount);
  if (!num || num <= 0) return;
  const silent = !!opts.silent;

  const p = getProgress();
  const today = localDateStr();

  // Update streak on first activity today
  if (p.lastStudyDate !== today) {
    if (p.lastStudyDate && daysBetween(p.lastStudyDate, today) === 1) {
      p.streak = (p.streak || 0) + 1;
    } else {
      p.streak = 1;
    }
    p.lastStudyDate = today;
  }

  p.weeklyXp = (p.weeklyXp || 0) + num;
  p.totalXp = (p.totalXp || 0) + num;

  if (!p.dailyXp) p.dailyXp = {};
  p.dailyXp[today] = (p.dailyXp[today] || 0) + num;

  safeLocalStorageSet(PROGRESS_LS_KEY, p);

  if (!silent) {
    syncProgressToFirestore(p);
    renderHomeProgress();
  }
}

// ---- XP Level system ----
const XP_PER_LEVEL = 100;

const LEVEL_RANKS = [
  { min: 1,  max: 2,  label: 'Novice'   },
  { min: 3,  max: 4,  label: 'Learner'  },
  { min: 5,  max: 6,  label: 'Scholar'  },
  { min: 7,  max: 9,  label: 'Expert'   },
  { min: 10, max: 14, label: 'Master'   },
  { min: 15, max: Infinity, label: 'Legend' },
];

function getLevelInfo(totalXp) {
  const level = Math.floor(totalXp / XP_PER_LEVEL) + 1;
  const xpInLevel = totalXp % XP_PER_LEVEL;
  const xpForNext = XP_PER_LEVEL;
  const rank = LEVEL_RANKS.find(r => level >= r.min && level <= r.max) || LEVEL_RANKS[0];
  return { level, xpInLevel, xpForNext, rank: rank.label };
}

// ---- Cards mastered: SRS interval >= 21 days ----
function countMasteredCards() {
  const srs = getSrsData();
  return Object.values(srs).filter(r => (r.interval || 0) >= 21).length;
}

// ---- Weekly activity: last 7 days ----
function getWeeklyXpData() {
  const p = getProgress();
  const out = [];
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const key = localDateStr(d);
    out.push({
      date: key,
      xp: p.dailyXp[key] || 0,
      dayLabel: d.toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 1),
      isToday: i === 0,
    });
  }
  return out;
}

function renderHomeStats() {
  const p = getProgress();
  const notes = getNotes();
  const saved = safeLocalStorageGet('acadhub_saved', []);

  const notesEl = document.getElementById('statNotes');
  if (notesEl) notesEl.textContent = notes.length;

  const revEl = document.getElementById('statReviewers');
  if (revEl) revEl.textContent = saved.length;

  const mastEl = document.getElementById('statMastered');
  if (mastEl) mastEl.textContent = countMasteredCards();

  const xpEl = document.getElementById('statTotalXp');
  if (xpEl) xpEl.textContent = p.totalXp;
}

function renderWeeklyChart() {
  const container = document.getElementById('weeklyActivityChart');
  const totalEl = document.getElementById('weeklyActivityTotal');
  if (!container) return;

  const data = getWeeklyXpData();
  const max = Math.max(...data.map(d => d.xp), 1);
  const sum = data.reduce((a, d) => a + d.xp, 0);

  if (totalEl) totalEl.textContent = `${sum} XP earned`;

  container.innerHTML = data.map(d => {
    const heightPct = d.xp > 0 ? Math.max(8, (d.xp / max) * 100) : 4;
    return `
      <div class="weekly-bar-wrap" title="${d.date}: ${d.xp} XP">
        <div class="weekly-bar ${d.xp > 0 ? 'has-xp' : 'no-xp'} ${d.isToday ? 'is-today' : ''}" style="height:${heightPct}%"></div>
        <span class="weekly-bar-label ${d.isToday ? 'is-today' : ''}">${d.dayLabel}</span>
      </div>
    `;
  }).join('');
}

function renderHomeProgress() {
  const strip = document.getElementById('homeProgressStrip');
  const streakPill = document.getElementById('streakPill');
  const xpPill = document.getElementById('xpPill');
  const p = getProgress();

  // ---- Level badge ----
  const info = getLevelInfo(p.totalXp);
  const levelNum = document.getElementById('homeLevelNum');
  const levelRank = document.getElementById('homeLevelRank');
  const levelFill = document.getElementById('homeLevelFill');
  const levelProgressLabel = document.getElementById('homeLevelProgressLabel');
  const totalXpLabel = document.getElementById('homeTotalXpLabel');

  if (levelNum) levelNum.textContent = info.level;
  if (levelRank) levelRank.textContent = info.rank;
  if (levelFill) levelFill.style.width = ((info.xpInLevel / info.xpForNext) * 100) + '%';
  if (levelProgressLabel) levelProgressLabel.textContent = `${info.xpInLevel} / ${info.xpForNext} XP to Lv ${info.level + 1}`;
  if (totalXpLabel) totalXpLabel.textContent = `${p.totalXp} XP total`;

  // ---- Pills (existing) ----
  if (strip && streakPill && xpPill) {
    if (p.streak > 0) {
      streakPill.style.display = 'inline-flex';
      const cnt = document.getElementById('streakCount');
      const pl = document.getElementById('streakPlural');
      if (cnt) cnt.textContent = p.streak;
      if (pl) pl.textContent = p.streak === 1 ? '' : 's';
    } else {
      streakPill.style.display = 'none';
    }

    if (p.weeklyXp > 0) {
      xpPill.style.display = 'inline-flex';
      const xp = document.getElementById('weeklyXp');
      if (xp) xp.textContent = p.weeklyXp;
    } else {
      xpPill.style.display = 'none';
    }

    const bothHidden = streakPill.style.display === 'none'
                    && xpPill.style.display === 'none';
    strip.style.display = bothHidden ? 'none' : 'flex';
  }

  // ---- Stats + chart ----
  renderHomeStats();
  renderWeeklyChart();
}


// ---- Main renderer ----
function renderHomeDashboard() {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning'
                 : hour < 18 ? 'Good afternoon'
                 : 'Good evening';
  const name = getHomeGreetingName();

  const greetingEl = document.getElementById('homeGreeting');
  const sublineEl = document.getElementById('homeSubline');
  if (greetingEl) {
    greetingEl.textContent = name ? `${greeting}, ${name} 👋` : `${greeting} 👋`;
  }

  // Hide loading (it's a placeholder for future async)
  const loadingEl = document.getElementById('dueLoading');
  if (loadingEl) loadingEl.classList.add('hidden');

  const due = computeDueQueue();
  const allSaved = safeLocalStorageGet('acadhub_saved', []);
  const hasAnyCards = allSaved.some(item =>
    item && item.data && item.data.flashcards && item.data.flashcards.length > 0
  );

  const emptyEl = document.getElementById('dueEmpty');
  const caughtUpEl = document.getElementById('dueCaughtUp');
  const contentEl = document.getElementById('dueContent');
  const badgeEl = document.getElementById('studyPlanBadge');
  const planSubline = document.getElementById('studyPlanSubline');

  if (!hasAnyCards) {
    if (sublineEl) sublineEl.textContent = "Let's get started.";
    if (planSubline) planSubline.textContent = 'No cards yet — create some to begin.';
    if (badgeEl) badgeEl.classList.add('hidden');
    if (emptyEl) emptyEl.classList.remove('hidden');
    if (caughtUpEl) caughtUpEl.classList.add('hidden');
    if (contentEl) contentEl.classList.add('hidden');
  } else if (due.length === 0) {
    if (sublineEl) sublineEl.textContent = "You're all caught up. 🎉";
    if (planSubline) planSubline.textContent = 'Nothing due right now.';
    if (badgeEl) {
      badgeEl.textContent = '✓ Done';
      badgeEl.className = 'text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30';
      badgeEl.classList.remove('hidden');
    }
    if (emptyEl) emptyEl.classList.add('hidden');
    if (caughtUpEl) caughtUpEl.classList.remove('hidden');
    if (contentEl) contentEl.classList.add('hidden');

    // Next-review hint
    const srs = getSrsData();
    const futureTimes = Object.values(srs)
      .map(r => r.nextReviewAt ? new Date(r.nextReviewAt).getTime() : 0)
      .filter(t => t > Date.now())
      .sort((a, b) => a - b);

    const infoEl = document.getElementById('nextReviewInfo');
    if (infoEl) {
      if (futureTimes.length === 0) {
        infoEl.textContent = 'No cards scheduled yet.';
      } else {
        const next = new Date(futureTimes[0]);
        const diffMs = next.getTime() - Date.now();
        const hours = Math.round(diffMs / (60 * 60 * 1000));
        let label;
        if (hours < 1) label = 'in less than an hour';
        else if (hours < 24) label = `in ${hours} hour${hours === 1 ? '' : 's'}`;
        else if (hours < 48) label = 'tomorrow';
        else {
          const days = Math.round(hours / 24);
          label = `in ${days} days`;
        }
        infoEl.textContent = `Next review ${label}.`;
      }
    }
  } else {
    if (sublineEl) sublineEl.textContent = `${due.length} card${due.length === 1 ? '' : 's'} waiting for you.`;
    if (planSubline) planSubline.textContent = 'Your daily review queue is ready.';
    if (badgeEl) {
      badgeEl.textContent = `${due.length} due`;
      badgeEl.className = 'text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-300 border border-indigo-500/30';
      badgeEl.classList.remove('hidden');
    }
    if (emptyEl) emptyEl.classList.add('hidden');
    if (caughtUpEl) caughtUpEl.classList.add('hidden');
    if (contentEl) contentEl.classList.remove('hidden');

    const countEl = document.getElementById('dueCount');
    if (countEl) countEl.textContent = due.length;

    const pluralEl = document.getElementById('dueCountPlural');
    if (pluralEl) pluralEl.textContent = due.length === 1 ? '' : 's';

    const breakdownEl = document.getElementById('dueBreakdown');
    if (breakdownEl) {
      const newCount = due.filter(c => c.isNew).length;
      const reviewCount = due.length - newCount;
      breakdownEl.textContent = `${newCount} new · ${reviewCount} review`;
    }

    renderDueBySubject(due);
  }

  renderUpcomingDeadlines();
  renderRecentItems();
  renderHomeProgress();
}
// ---- Study ahead (ignore scheduling) ----
// ---- Study ahead (ignore scheduling) ----
function studyAhead() {
  const overlay = document.getElementById('studyModeOverlay');
  if (overlay) overlay.classList.remove('hidden');
  document.body.style.overflow = 'hidden';

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const saved = safeLocalStorageGet('acadhub_saved', []);
      const allCards = [];
      const seen = new Set();

      saved.forEach(item => {
        const cards = (item && item.data && item.data.flashcards) || [];
        const subject = item.subject || null;
        cards.forEach(card => {
          const key = flashcardKey(card);
          if (!key || seen.has(key)) return;
          seen.add(key);
          allCards.push({
            key,
            front: card.front,
            back: card.back,
            subject,
          });
        });
      });

      if (!allCards.length) {
        if (overlay) overlay.classList.add('hidden');
        document.body.style.overflow = '';
        showNotification('No flashcards to study.', 'warning');
        return;
      }

      launchDueSession(allCards);
    });
  });
}// ---- Start the review session ----
function startDueReviewSession() {
  // Paint the overlay shell first so the user sees instant feedback
  const overlay = document.getElementById('studyModeOverlay');
  if (overlay) overlay.classList.remove('hidden');
  document.body.style.overflow = 'hidden';

  // Defer heavy work to the next frame
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const due = computeDueQueue();
      if (!due.length) {
        if (overlay) overlay.classList.add('hidden');
        document.body.style.overflow = '';
        showNotification('No cards due right now.', 'info');
        return;
      }
      launchDueSession(due);  // openStudyMode() re-shows overlay (harmless)
    });
  });
}


function launchDueSession(cards) {
  // Reset any prior session state
  dueReviewSubjectMap = {};
  cards.forEach(c => { dueReviewSubjectMap[c.key] = c.subject || null; });

  __preDueResults = currentResults;
  dueReviewMode = true;

  // Feed Study Mode a synthetic "results" object
  currentResults = {
    flashcards: cards.map(c => ({
      front: c.front,
      back: c.back,
      _answerFirst: true,
    })),
    summary: [],
    quiz: {},
  };

  openStudyMode();
}

// ============================================================
// DEADLINES (Home + Calendar integration)
// ============================================================
const DEADLINES_LS_KEY = 'acadhub_deadlines';

let editingDeadlineId = null;
let editingDeadlineColor = SUBJECT_COLORS[0];
let editingDeadlineType = 'personal';

// ---- In-memory cache (kills repeated JSON.parse in hot paths) ----
let _deadlinesCache = null;
let _progressCache = null;

function getDeadlines() {
  if (_deadlinesCache !== null) return _deadlinesCache;
  _deadlinesCache = safeLocalStorageGet(DEADLINES_LS_KEY, []) || [];
  return _deadlinesCache;
}
function setDeadlines(list) {
  _deadlinesCache = list;
  safeLocalStorageSet(DEADLINES_LS_KEY, list);
}
function invalidateDeadlinesCache() {
  _deadlinesCache = null;
}
function invalidateProgressCache() {
  _progressCache = null;
}

// Date helpers
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function daysBetween(dateStr1, dateStr2) {
  const d1 = new Date(dateStr1 + 'T00:00:00');
  const d2 = new Date(dateStr2 + 'T00:00:00');
  return Math.round((d2 - d1) / (24 * 60 * 60 * 1000));
}

function deadlineUrgencyColor(dateStr, fallback) {
  if (fallback) return fallback;
  const diff = daysBetween(todayStr(), dateStr);
  if (diff < 0) return '#ef4444';      // overdue → red
  if (diff <= 2) return '#ef4444';     // ≤2 days → red
  if (diff <= 7) return '#f59e0b';     // ≤7 days → amber
  return '#10b981';                    // else → green
}

function formatDeadlineCountdown(dateStr) {
  const diff = daysBetween(todayStr(), dateStr);
  if (diff < 0) return `${Math.abs(diff)}d overdue`;
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff < 7) return `in ${diff} days`;
  if (diff < 30) return `in ${Math.round(diff / 7)} wk`;
  return `in ${Math.round(diff / 30)} mo`;
}

// ---- Home render ----
function renderUpcomingDeadlines() {
  const card = document.getElementById('upcomingDeadlinesCard');
  const list = document.getElementById('homeDeadlineList');
  if (!card || !list) return;

  const now = todayStr();
  const upcoming = getDeadlines()
    .filter(d => d.date && !d.completed)
    .sort((a, b) => a.date.localeCompare(b.date))
    .filter(d => {
      const diff = daysBetween(now, d.date);
      return diff >= -7 && diff <= 30;
    })
    .slice(0, 3);

  if (upcoming.length === 0) {
    card.classList.add('hidden');
    return;
  }

  card.classList.remove('hidden');
  list.innerHTML = upcoming.map(d => {
    const t = getDeadlineTypeInfo(d.type);
    const countdown = formatDeadlineCountdown(d.date);
    return `
      <div class="deadline-row flex items-center gap-3 cursor-pointer"
           onclick="openDeadlineFromHome('${d.id}')">
        <span class="deadline-type-icon deadline-type-icon-sm" style="background:${t.color};">
          <i class="fa-solid ${t.icon}"></i>
        </span>
        <div class="min-w-0 flex-1">
          <p class="text-sm font-medium truncate">${escapeHtml(d.title || 'Deadline')}</p>
          <p class="text-xs opacity-50 truncate">
            ${t.label}${d.subject ? ' · ' + escapeHtml(d.subject) : ''}
          </p>
        </div>
        <span class="text-xs font-semibold shrink-0" style="color:${t.color};">
          ${escapeHtml(countdown)}
        </span>
      </div>
    `;
  }).join('');
}

function openDeadlineFromHome(id) {
  const d = getDeadlines().find(x => x.id === id);
  if (!d) return;
  const [y, m] = d.date.split('-').map(Number);
  calendarYear = y;
  calendarMonth = m - 1;
  selectedCalendarDate = d.date;
  switchTab('calendar');
}

// ---- Calendar: render selected day's deadlines ----
function renderSelectedDayDeadlines(dateStr) {
  const container = document.getElementById('selectedDayTasks');
  if (!container) return;

  if (!dateStr) {
    container.innerHTML = '<p class="text-sm opacity-50">Select a date to see deadlines.</p>';
    return;
  }

  const list = getDeadlines().filter(d => d.date === dateStr);
  const dateLabel = new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'short', day: 'numeric'
  });

  const countBadge = list.length > 0
    ? `<span class="deadline-count-badge">${list.length}</span>`
    : '';

  let html = `
    <div class="flex items-center justify-between mb-3 gap-2">
      <div class="flex items-center gap-2 min-w-0">
        <p class="text-sm font-semibold truncate">${escapeHtml(dateLabel)}</p>
        ${countBadge}
      </div>
      <button onclick="openDeadlineSheet('${dateStr}')" class="text-xs text-indigo-400 hover:underline shrink-0">
        <i class="fa-solid fa-plus mr-1"></i>Add
      </button>
    </div>
  `;

  if (list.length === 0) {
    html += `
      <div class="empty-day-state">
        <i class="fa-regular fa-calendar text-2xl opacity-30"></i>
        <p class="text-xs opacity-50 mt-2">No deadlines on this day</p>
        <p class="text-[10px] opacity-40 mt-1">Long-press a day to quick-add</p>
      </div>
    `;
  } else {
    html += '<div class="space-y-2">';
    list.forEach(d => {
      const t = getDeadlineTypeInfo(d.type);
      const countdown = formatDeadlineCountdown(d.date);
      const cardCls = d.completed ? 'deadline-card is-done' : 'deadline-card';
      html += `
        <div class="${cardCls}" onclick="openDeadlineSheet(null, '${d.id}')">
          <span class="deadline-type-icon" style="background:${t.color};">
            <i class="fa-solid ${t.icon}"></i>
          </span>
          <div class="min-w-0 flex-1">
            <p class="text-sm font-medium truncate">${escapeHtml(d.title || 'Deadline')}</p>
            <div class="flex items-center gap-2 mt-0.5 flex-wrap">
              <span class="text-[10px] font-semibold" style="color:${t.color};">${t.label}</span>
              <span class="text-[10px] ${d.date < todayStr() && !d.completed ? 'text-rose-400 font-semibold' : 'opacity-50'}">· ${escapeHtml(countdown)}</span>
              ${d.subject ? `<span class="text-[10px] opacity-50 truncate">· ${escapeHtml(d.subject)}</span>` : ''}
            </div>
            ${d.notes ? `<p class="text-xs opacity-50 truncate mt-1">${escapeHtml(d.notes)}</p>` : ''}
          </div>
          <button class="deadline-check ${d.completed ? 'is-done' : ''}"
                  onclick="event.stopPropagation(); toggleDeadlineComplete('${d.id}')"
                  title="${d.completed ? 'Mark as not done' : 'Mark as done'}">
            <i class="fa-solid fa-check"></i>
          </button>
        </div>
      `;
    });
    html += '</div>';
  }

  container.innerHTML = html;
}

// ---- Sheet: create / edit ----
function openDeadlineSheet(dateStr, id) {
  editingDeadlineId = id || null;
  const sheet = document.getElementById('deadlineSheet');
  const titleEl = document.getElementById('deadlineSheetTitle');
  const titleInput = document.getElementById('deadlineTitleInput');
  const dateInput = document.getElementById('deadlineDateInput');
  const subjectInput = document.getElementById('deadlineSubjectInput');
  const notesInput = document.getElementById('deadlineNotesInput');
  const deleteBtn = document.getElementById('deadlineDeleteBtn');

  if (id) {
    const d = getDeadlines().find(x => x.id === id);
    if (!d) return;
    titleEl.textContent = 'Edit Deadline';
    titleInput.value = d.title || '';
    dateInput.value = d.date || todayStr();
    subjectInput.value = d.subject || '';
    notesInput.value = d.notes || '';
    editingDeadlineColor = d.color || SUBJECT_COLORS[0];
    editingDeadlineType = d.type || 'personal';
    deleteBtn.classList.remove('hidden');
  } else {
    titleEl.textContent = 'New Deadline';
    titleInput.value = '';
    dateInput.value = dateStr || todayStr();
    subjectInput.value = '';
    notesInput.value = '';
    editingDeadlineType = 'personal';
    editingDeadlineColor = DEADLINE_TYPES.personal.color;
    deleteBtn.classList.add('hidden');
  }

  renderDeadlineTypeChips();
  renderDeadlineColorSwatches();
  sheet.classList.remove('hidden');
  setTimeout(() => titleInput.focus(), 100);
}

function closeDeadlineSheet() {
  document.getElementById('deadlineSheet').classList.add('hidden');
  editingDeadlineId = null;
}

function closeDeadlineSheetBackdrop(e) {
  if (e.target.id === 'deadlineSheet') closeDeadlineSheet();
}

function renderDeadlineColorSwatches() {
  const container = document.getElementById('deadlineColorSwatches');
  if (!container) return;
  container.innerHTML = '';
  SUBJECT_COLORS.forEach(color => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'w-8 h-8 rounded-full border-2 transition btn-hover';
    btn.style.background = color;
    btn.style.borderColor = (color === editingDeadlineColor) ? '#fff' : 'transparent';
    btn.onclick = () => { editingDeadlineColor = color; renderDeadlineColorSwatches(); };
    container.appendChild(btn);
  });
}

async function saveDeadline() {
  const title = document.getElementById('deadlineTitleInput').value.trim();
  const date = document.getElementById('deadlineDateInput').value;
  const subject = document.getElementById('deadlineSubjectInput').value.trim();
  const notes = document.getElementById('deadlineNotesInput').value.trim();

  if (!title) { showNotification('Please enter a title.', 'warning'); return; }
  if (!date) { showNotification('Please pick a date.', 'warning'); return; }

  const all = getDeadlines();
  const now = new Date().toISOString();
  let savedItem = null;
  const wasEditing = !!editingDeadlineId;

  if (editingDeadlineId) {
    const d = all.find(x => x.id === editingDeadlineId);
    if (d) {
      d.title = title;
      d.date = date;
      d.subject = subject || '';
      d.notes = notes || '';
      d.color = editingDeadlineColor;
      d.type = editingDeadlineType;
      d.updatedAt = now;
      savedItem = d;
    }
  } else {
    savedItem = {
      id: generateId(),
      title, date,
      subject: subject || '',
      notes: notes || '',
      color: editingDeadlineColor,
      type: editingDeadlineType,
      completed: false,
      completedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    all.push(savedItem);
  }

  setDeadlines(all);

  if (firebaseAvailable && auth && auth.currentUser && savedItem) {
    try {
      await db.collection('users').doc(auth.currentUser.uid)
        .collection('deadlines').doc(savedItem.id).set(savedItem);
    } catch (err) {
      console.error('Deadline cloud sync failed:', err);
      showNotification('Saved locally, cloud sync failed.', 'warning');
    }
  }

  closeDeadlineSheet();
  renderUpcomingDeadlines();
  if (currentTab === 'calendar') renderCalendar();
  showNotification(wasEditing ? 'Deadline updated.' : 'Deadline added.', 'success');
}
  
  async function deleteDeadlineFromSheet() {
    if (!editingDeadlineId) return;
    if (!confirm('Delete this deadline?')) return;
    
    const all = getDeadlines();
  const idx = all.findIndex(x => x.id === editingDeadlineId);
  if (idx === -1) return;
  const removed = all[idx];
  all.splice(idx, 1);
  setDeadlines(all);

  if (firebaseAvailable && auth && auth.currentUser && removed?.id) {
    try {
      await db.collection('users').doc(auth.currentUser.uid)
        .collection('deadlines').doc(removed.id).delete();
    } catch (err) {
      console.error('Deadline delete failed:', err);
    }
  }

  closeDeadlineSheet();
  renderUpcomingDeadlines();
  if (currentTab === 'calendar') renderCalendar();
  showNotification('Deadline deleted.', 'info');
}

// ============================================================
// GENERATE METADATA — ask Subject / Term / Semester before generating
// ============================================================
const GEN_TERMS = ['Prelim', 'Midterm', 'Semi-Final', 'Finals'];
const GEN_SEMESTERS = ['1st Sem', '2nd Sem', 'Summer'];

// Holds the choices while the sheet is open
let pendingGenerateMeta = null;

function openGenerateMetaSheet() {
  const sheet = document.getElementById('generateMetaSheet');
  if (!sheet) return;
  
  // Reset pending state
  pendingGenerateMeta = {
    subjectId: null,
    term: null,
    semester: null,
    schoolYear: '',
  };
  
// Populate subject dropdown from ALL subjects the user has ever used
const select = document.getElementById('genMetaSubject');
const subjects = getAllUserSubjects();
select.innerHTML = '<option value="">— No subject —</option>' +
  subjects.map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('');
  
  // Reset school year
  const syInput = document.getElementById('genMetaSchoolYear');
  if (syInput) syInput.value = '';
  
  renderGenMetaTermTiles();
  renderGenMetaSemTiles();
  
  sheet.classList.remove('hidden');
}

function closeGenerateMetaSheet() {
  const sheet = document.getElementById('generateMetaSheet');
  if (sheet) sheet.classList.add('hidden');
}

function closeGenerateMetaSheetBackdrop(e) {
  if (e.target.id === 'generateMetaSheet') closeGenerateMetaSheet();
}

function renderGenMetaTermTiles() {
  const c = document.getElementById('genMetaTermTiles');
  if (!c) return;
  c.innerHTML = GEN_TERMS.map(t => `
    <button type="button"
            class="gen-meta-tile ${pendingGenerateMeta?.term === t ? 'active' : ''}"
            onclick="pickGenTerm('${t}')">${t}</button>
  `).join('');
}

function renderGenMetaSemTiles() {
  const c = document.getElementById('genMetaSemTiles');
  if (!c) return;
  c.innerHTML = GEN_SEMESTERS.map(s => `
    <button type="button"
            class="gen-meta-tile ${pendingGenerateMeta?.semester === s ? 'active' : ''}"
            onclick="pickGenSem('${s}')">${s}</button>
  `).join('');
}

function pickGenTerm(term) {
  if (!pendingGenerateMeta) pendingGenerateMeta = {};
  pendingGenerateMeta.term = pendingGenerateMeta.term === term ? null : term;
  renderGenMetaTermTiles();
}

function pickGenSem(sem) {
  if (!pendingGenerateMeta) pendingGenerateMeta = {};
  pendingGenerateMeta.semester = pendingGenerateMeta.semester === sem ? null : sem;
  renderGenMetaSemTiles();
}

// Called by the "Generate" button inside the sheet
async function confirmGenerateMeta() {
  if (!pendingGenerateMeta) pendingGenerateMeta = {};
  
  const subjectId = document.getElementById('genMetaSubject').value || null;
  const schoolYear = (document.getElementById('genMetaSchoolYear').value || '').trim();
  
  pendingGenerateMeta.subjectId = subjectId;
  pendingGenerateMeta.schoolYear = schoolYear;
  
  closeGenerateMetaSheet();
  
  // Hand off to the real generation routine
  await runGenerateWithMeta({ ...pendingGenerateMeta });
}

// Returns every subject the user has ever used:
// - ones they created in the Notes tab
// - ones they attached to saved library items
// Deduped by lowercase name. Library-only subjects get a synthetic
// `lib:<lowercasedName>` id so they can still be picked here.
function getAllUserSubjects() {
  const out = [];
  const seen = new Map();
  
  // 1. Note subjects (canonical — have real ids + colors)
  getNoteSubjects().forEach(s => {
    const key = String(s.name || '').trim().toLowerCase();
    if (!key || seen.has(key)) return;
    seen.set(key, s);
    out.push(s);
  });
  
  // 2. Subjects from saved library items (only if not already listed above)
  const saved = safeLocalStorageGet('acadhub_saved', []);
  saved.forEach(item => {
    const s = item && item.subject;
    if (!s || !s.name) return;
    const key = String(s.name).trim().toLowerCase();
    if (seen.has(key)) return;
    const synth = { id: 'lib:' + key, name: s.name, color: s.color || '#94a3b8' };
    seen.set(key, synth);
    out.push(synth);
  });
  
  return out;
}

// Full-screen overlays must be direct children of <body>.
// Otherwise a hidden parent (`#viewReviewer`, `#resultsContainer`)
// makes `display: none` cascade down and the overlay can't render.
function ensureOverlaysAtBodyLevel() {
  ['studyModeOverlay', 'studyCompleteOverlay', 'recallModeOverlay', 'recallCompleteOverlay', 'mcqStudyOverlay', 'mcqCompleteOverlay']
    .forEach(id => {
      const el = document.getElementById(id);
      if (el && el.parentElement !== document.body) {
        document.body.appendChild(el);
      }
    });
}