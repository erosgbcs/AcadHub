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
const API_BASE_URL = 'https://acadhub-no6m.onrender.com';

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
let schedItems = [];
let plannerTasks = [];
let selectedRating = 0;
let currentTab = 'reviewer';
let testQuestions = [];
let currentQuestionIndex = 0;
let testScore = 0;
let testDifficulty = 'easy';
let currentResults = null;
let offlineQueue = [];
let isOnline = navigator.onLine;
let backendAvailable = false;
let userAnswers = [];
let currentSchedFilter = 'all';
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

// ============================================================
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
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    const response = await fetch(API_BASE_URL + API_ENDPOINTS.health, {
      method: 'GET',
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    backendAvailable = response.ok;
    return backendAvailable;
  } catch (err) {
    backendAvailable = false;
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
    'reviewer': 'viewReviewer',
    'library': 'viewLibrary',
    'test': 'viewTest',
    'planner': 'viewPlanner',
    'scheduler': 'viewScheduler',
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
    'reviewer': 'tabReviewer',
    'library': 'tabLibrary',
    'test': 'tabTest',
    'planner': 'tabPlanner',
    'scheduler': 'tabScheduler',
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
  if (tab === 'scheduler') renderScheduler();
  if (tab === 'planner') renderPlanner();
  if (tab === 'calendar') renderCalendar();
}

// FIXED: Improved initTabListeners with direct onclick
function initTabListeners() {
  const tabMappings = {
    'tabReviewer': 'reviewer',
    'tabLibrary': 'library',
    'tabTest': 'test',
    'tabPlanner': 'planner',
    'tabScheduler': 'scheduler',
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

// ============================================================
// PROFILE MANAGEMENT
// ============================================================
function showProfileModal() {
  // If Firebase is available and user is logged in, show auth modal
  if (firebaseAvailable && auth && auth.currentUser) {
    document.getElementById('authModal').classList.remove('hidden');
    updateAuthUI();
    return;
  }

  // Otherwise show the simple profile modal
  if (safeLocalStorageGet('profile_saved') !== 'true') {
    document.getElementById('profileModal').classList.remove('hidden');
  } else {
    // If profile already saved, show auth modal (even without Firebase)
    document.getElementById('authModal').classList.remove('hidden');
  }
}

function closeProfileModal() {
  document.getElementById('profileModal').classList.add('hidden');
}

function initProfileModal() {
  const firstNameInput = document.getElementById('visitorFirstName');
  const lastNameInput = document.getElementById('visitorLastName');
  const agreeTerms = document.getElementById('agreeTerms');
  const saveBtn = document.getElementById('saveProfileBtn');

  if (!firstNameInput || !lastNameInput || !agreeTerms || !saveBtn) return;

  function validateProfileForm() {
    const firstName = firstNameInput.value.trim();
    const lastName = lastNameInput.value.trim();

    if (firstName.length >= 2 && lastName.length >= 2 && agreeTerms.checked) {
      saveBtn.disabled = false;
      saveBtn.classList.remove('opacity-50', 'cursor-not-allowed');
      saveBtn.title = 'Save profile';
    } else {
      saveBtn.disabled = true;
      saveBtn.classList.add('opacity-50', 'cursor-not-allowed');
      if (!firstName || !lastName) {
        saveBtn.title = 'Enter your first and last name';
      } else if (firstName.length < 2 || lastName.length < 2) {
        saveBtn.title = 'Name must be at least 2 characters';
      } else if (!agreeTerms.checked) {
        saveBtn.title = 'Please agree to the privacy terms';
      }
    }
  }

  firstNameInput.addEventListener('input', validateProfileForm);
  lastNameInput.addEventListener('input', validateProfileForm);
  agreeTerms.addEventListener('change', validateProfileForm);
  validateProfileForm();
}

function saveVisitorName() {
  const firstName = document.getElementById('visitorFirstName').value.trim();
  const lastName = document.getElementById('visitorLastName').value.trim();
  const agreeTerms = document.getElementById('agreeTerms').checked;
  const saveBtn = document.getElementById('saveProfileBtn');

  if (!firstName || !lastName) {
    showNotification('Please enter your first and last name.', 'error');
    return;
  }

  if (firstName.length < 2 || lastName.length < 2) {
    showNotification('Name must be at least 2 characters long.', 'error');
    return;
  }

  if (!agreeTerms) {
    showNotification('Please agree to the privacy terms.', 'error');
    return;
  }

  // Save locally
  const fullName = firstName + ' ' + lastName;
  safeLocalStorageSet('profile_name', fullName);
  safeLocalStorageSet('profile_saved', 'true');

  // Save to Firebase only if available and user is logged in
  if (firebaseAvailable && auth && auth.currentUser) {
    try {
      db.collection('users').doc(auth.currentUser.uid).set({
        firstName,
        lastName,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    } catch (err) {
      console.error('Error saving to Firebase:', err);
    }
  }

  closeProfileModal();
  showNotification(`Welcome, ${firstName}! Your profile has been saved.`, 'success');
}

// ============================================================
// SETTINGS MANAGEMENT
// ============================================================
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

// ============================================================
// AI PROVIDER UI
// ============================================================
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
// FILE HANDLING
// ============================================================
function updateFileName(input) {
  const file = input.files[0];
  const display = document.getElementById('fileNameDisplay');

  if (file) {
    if (file.size > 10 * 1024 * 1024) {
      showNotification('File too large. Maximum size is 10MB.', 'error');
      input.value = '';
      display.textContent = 'Drop file or click to browse';
      return;
    }

    const allowedExtensions = ['.pdf', '.docx', '.txt', '.md', '.rtf', '.html', '.htm'];
    const fileExt = '.' + file.name.split('.').pop().toLowerCase();
    
    if (!allowedExtensions.includes(fileExt)) {
      showNotification('Invalid file type. Please upload PDF, DOCX, TXT, MD, RTF, or HTML files.', 'error');
      input.value = '';
      display.textContent = 'Drop file or click to browse';
      return;
    }

    display.textContent = file.name;
  } else {
    display.textContent = 'Drop file or click to browse';
  }
}

function updateTestFileName(input) {
  const file = input.files[0];
  const display = document.getElementById('testFileNameDisplay');

  if (file) {
    if (file.size > 10 * 1024 * 1024) {
      showNotification('File too large. Maximum size is 10MB.', 'error');
      input.value = '';
      display.textContent = 'Drop file or click to browse';
      return;
    }

    const allowedExtensions = ['.pdf', '.docx', '.txt', '.md', '.rtf', '.html', '.htm'];
    const fileExt = '.' + file.name.split('.').pop().toLowerCase();
    
    if (!allowedExtensions.includes(fileExt)) {
      showNotification('Invalid file type. Please upload PDF, DOCX, TXT, MD, RTF, or HTML files.', 'error');
      input.value = '';
      display.textContent = 'Drop file or click to browse';
      return;
    }

    display.textContent = file.name;
  } else {
    display.textContent = 'Drop file or click to browse';
  }
}

// ============================================================
// AI REVIEWER - MAIN GENERATION FUNCTION
// ============================================================
async function handleGenerate() {
  const submitBtn = document.getElementById('submitBtn');
  const btnContent = document.getElementById('btnContent');
  const progressContainer = document.getElementById('progressContainer');
  const resultsContainer = document.getElementById('resultsContainer');

  const notes = document.getElementById('studyNotes').value.trim();
  const fileInput = document.getElementById('fileInput');
  const hasFile = fileInput.files.length > 0;

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
    if (hasFile) formData.append('file', fileInput.files[0]);

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

    currentResults = {
      ...transformedData,
      timestamp: new Date().toISOString()
    };

    resultsContainer.classList.remove('hidden');
    document.getElementById('saveToLibraryBtn').classList.remove('hidden');

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
// TRANSFORM BACKEND RESPONSE
// ============================================================
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
    switch (question.type) {
      case 'truefalse':
        quiz.trueFalse.push({
          question: question.question.replace(/^True or False: ["']?|["']?$/g, ''),
          answer: question.answer === 'True'
        });
        break;
      case 'identification':
        quiz.identification.push({
          question: question.question,
          answer: question.answer
        });
        break;
      case 'multiplechoice':
      case 'what':
      case 'who':
      case 'where':
      case 'when':
        quiz.multipleChoice.push({
          question: question.question,
          options: question.options || [],
          correct: (question.options || []).indexOf(question.answer)
        });
        break;
      case 'enumeration':
        quiz.enumeration.push({
          question: question.question,
          answer: question.answer
        });
        break;
    }
  });

  return { summary, flashcards, quiz };
}

// ============================================================
// RENDER FUNCTIONS
// ============================================================
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

  if (!flashcards || flashcards.length === 0) {
    grid.innerHTML = '<p class="text-sm opacity-50 text-center col-span-full">No flashcards generated.</p>';
    return;
  }

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

// ============================================================
// QUIZ INTERACTION
// ============================================================
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
async function saveToLibrary() {
  if (!currentResults) {
    showNotification('No results to save.', 'warning');
    return;
  }

  const saveItem = {
    id: generateId(),
    title: 'Reviewer ' + new Date().toLocaleDateString(),
    date: new Date().toISOString(),
    summaryHTML: document.getElementById('summaryList').innerHTML,
    flashcardsHTML: document.getElementById('flashcardGrid').innerHTML,
    quizHTML: document.getElementById('quizContainer').innerHTML,
    data: currentResults
  };

  const saved = safeLocalStorageGet('acadhub_saved', []);
  saved.unshift(saveItem);
  safeLocalStorageSet('acadhub_saved', saved);

if (firebaseAvailable && auth && auth.currentUser) {
  try {
    await db.collection('users').doc(auth.currentUser.uid).collection('library').add(saveItem);
  } catch (err) {
    console.error('Error saving to Firebase:', err);
  }
}

  showNotification('Saved to library!', 'success');
  renderSavedList();
}

// ============================================================
// TEST MY LIMITS
// ============================================================
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
  const fileInput = document.getElementById('testFileInput');
  const hasFile = fileInput.files.length > 0;

  if (!notes && !hasFile) {
    showNotification('Please paste notes or upload a document.', 'warning');
    return;
  }

  const formData = new FormData();
  if (notes) formData.append('notes', notes);
  if (hasFile) formData.append('file', fileInput.files[0]);
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
  document.getElementById('testFileNameDisplay').textContent = 'Drop file or click to browse';

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
// STUDY PLANNER
// ============================================================
function renderPlanner() {
  const todoCol = document.getElementById('planner-todo');
  const progressCol = document.getElementById('planner-progress');
  const doneCol = document.getElementById('planner-done');

  if (!todoCol || !progressCol || !doneCol) return;

  todoCol.innerHTML = '';
  progressCol.innerHTML = '';
  doneCol.innerHTML = '';

  const priorityOrder = { high: 0, medium: 1, low: 2 };
  plannerTasks.sort((a, b) => (priorityOrder[a.priority] || 1) - (priorityOrder[b.priority] || 1));

  plannerTasks.forEach(task => {
    const element = createPlannerTaskElement(task);
    const column = task.status === 'done' ? doneCol : task.status === 'progress' ? progressCol : todoCol;
    column.appendChild(element);
  });

  updateColumnCounts();
}

function createPlannerTaskElement(task) {
  const div = document.createElement('div');
  div.className = 'task-card bg-white/5 border border-white/10 rounded-lg p-3 cursor-grab hover:border-indigo-400/50 transition';
  div.draggable = true;
  div.dataset.id = task.id;

  const priorityClass = task.priority === 'high' ? 'priority-high' : task.priority === 'medium' ? 'priority-medium' : 'priority-low';

  div.innerHTML = `
    <div class="flex items-start justify-between gap-2">
      <div class="flex-1">
        <p class="text-sm font-medium">${task.title || 'Untitled'}</p>
        <p class="text-xs opacity-50">${formatDate(task.deadline)}</p>
      </div>
      <span class="${priorityClass} text-xs px-2 py-0.5 rounded-full font-semibold">${task.priority || 'medium'}</span>
    </div>
    <div class="flex items-center justify-between mt-2">
      <span class="category-tag">${task.category || 'study'}</span>
      <div class="flex gap-2">
        <button onclick="editPlannerTask('${task.id}')" class="text-xs opacity-50 hover:opacity-100 transition">
          <i class="fa-solid fa-edit"></i>
        </button>
        <button onclick="deletePlannerTask('${task.id}')" class="text-xs opacity-50 hover:opacity-100 transition">
          <i class="fa-solid fa-trash"></i>
        </button>
      </div>
    </div>
  `;

  div.addEventListener('dragstart', handleDragStart);
  div.addEventListener('dragend', handleDragEnd);

  return div;
}

function addOrUpdatePlannerTask() {
  const title = document.getElementById('plannerTitle').value.trim();
  const deadline = document.getElementById('plannerDeadline').value;
  const priority = document.getElementById('plannerPriority').value;
  const category = document.getElementById('plannerCategory').value;
  const editId = document.getElementById('editPlannerId').value;

  if (!title) {
    showNotification('Please enter a task title.', 'warning');
    return;
  }

  if (editId) {
    const index = plannerTasks.findIndex(t => t.id === editId);
    if (index !== -1) {
      plannerTasks[index] = {
        ...plannerTasks[index],
        title,
        deadline,
        priority,
        category
      };
    }
    document.getElementById('editPlannerId').value = '';
    document.getElementById('plannerAddBtn').innerHTML = '<i class="fa-solid fa-plus mr-1"></i> Add';
  } else {
    const newTask = {
      id: generateId(),
      title,
      deadline,
      priority,
      category,
      status: 'todo',
      createdAt: new Date().toISOString()
    };
    plannerTasks.push(newTask);
  }

  safeLocalStorageSet('acadhub_planner', plannerTasks);

  if (firebaseAvailable && auth && auth.currentUser) {
  const plannerRef = db.collection('users').doc(auth.currentUser.uid).collection('planner');
  if (editId) {
    plannerRef.doc(editId).update({ title, deadline, priority, category });
  } else {
    plannerRef.add({ title, deadline, priority, category, status: 'todo' });
  }
}

  document.getElementById('plannerTitle').value = '';
  document.getElementById('plannerDeadline').value = '';

  renderPlanner();
  showNotification(editId ? 'Task updated!' : 'Task added!', 'success');
}

function editPlannerTask(id) {
  const task = plannerTasks.find(t => t.id === id);
  if (!task) return;

  document.getElementById('plannerTitle').value = task.title || '';
  document.getElementById('plannerDeadline').value = task.deadline || '';
  document.getElementById('plannerPriority').value = task.priority || 'medium';
  document.getElementById('plannerCategory').value = task.category || 'study';
  document.getElementById('editPlannerId').value = id;
  document.getElementById('plannerAddBtn').innerHTML = '<i class="fa-solid fa-check mr-1"></i> Update';
}

function deletePlannerTask(id) {
  if (!confirm('Delete this task?')) return;

  plannerTasks = plannerTasks.filter(t => t.id !== id);
  safeLocalStorageSet('acadhub_planner', plannerTasks);

  if (firebaseAvailable && auth && auth.currentUser) {
  db.collection('users').doc(auth.currentUser.uid).collection('planner').doc(id).delete();
}

  renderPlanner();
  showNotification('Task deleted.', 'info');
}

// ============================================================
// DRAG AND DROP
// ============================================================
function allowDrop(event) {
  event.preventDefault();
}

function dropPlannerTask(event, status) {
  event.preventDefault();
  const taskId = event.dataTransfer.getData('text/plain');

  if (!taskId) return;

  const task = plannerTasks.find(t => t.id === taskId);
  if (task) {
    task.status = status;
    safeLocalStorageSet('acadhub_planner', plannerTasks);

    if (firebaseAvailable && auth && auth.currentUser) {
  db.collection('users').doc(auth.currentUser.uid).collection('planner').doc(taskId).update({ status });
}

    renderPlanner();
  }
}

function handleDragStart(event) {
  event.target.classList.add('dragging');
  event.dataTransfer.setData('text/plain', event.target.dataset.id);
  event.dataTransfer.effectAllowed = 'move';
}

function handleDragEnd(event) {
  event.target.classList.remove('dragging');
}

function updateColumnCounts() {
  document.querySelectorAll('.kanban-column').forEach(col => {
    const count = col.querySelector('.column-count');
    if (count) {
      count.textContent = col.querySelectorAll('.task-card').length;
    }
  });
}

// ============================================================
// SCHEDULER FUNCTIONS
// ============================================================
// ============================================================
// SCHEDULER FUNCTIONS
// ============================================================
function renderScheduler() {
  const todoCol = document.getElementById('sched-todo');
  const progressCol = document.getElementById('sched-progress');
  const doneCol = document.getElementById('sched-done');

  if (todoCol) todoCol.innerHTML = '';
  if (progressCol) progressCol.innerHTML = '';
  if (doneCol) doneCol.innerHTML = '';

  const priorityOrder = { high: 0, medium: 1, low: 2 };
  const filtered = currentSchedFilter === 'all' 
    ? [...schedItems]
    : schedItems.filter(item => (item.type || 'task') === currentSchedFilter);

  filtered.sort((a, b) => (priorityOrder[a.priority] || 1) - (priorityOrder[b.priority] || 1));

  filtered.forEach(item => {
    const el = createSchedTaskElement(item);
    if (item.status === 'done') doneCol?.appendChild(el);
    else if (item.status === 'progress') progressCol?.appendChild(el);
    else todoCol?.appendChild(el);
  });

  updateColumnCounts();

  renderGanttChart(filtered);
  renderCountdowns(schedItems);
  renderExamMatrix(schedItems);
  renderSchedFilterChips();
}

function createSchedTaskElement(item) {
  const div = document.createElement('div');
  div.className = 'task-card bg-white/5 border border-white/10 rounded-lg p-3 cursor-grab hover:border-indigo-400/50 transition';
  div.draggable = true;
  div.dataset.id = item.id;

  const priorityClass = item.priority === 'high' ? 'priority-high' : item.priority === 'medium' ? 'priority-medium' : 'priority-low';
  const typeClass = item.type === 'milestone' ? 'type-milestone' : item.type === 'defense' ? 'type-defense' : item.type === 'exam' ? 'type-exam' : 'type-task';

  div.innerHTML = `
    <div class="flex items-start justify-between gap-2">
      <div class="flex-1">
        <p class="text-sm font-medium">${item.title || 'Untitled'}</p>
        <p class="text-xs opacity-50">${formatDate(item.deadline)}</p>
      </div>
      <span class="${priorityClass} text-xs px-2 py-0.5 rounded-full font-semibold">${item.priority || 'medium'}</span>
    </div>
    <div class="flex items-center justify-between mt-2">
      <span class="type-badge ${typeClass}">${item.type || 'task'}</span>
      <span class="category-tag">${item.category || 'study'}</span>
      <div class="flex gap-2">
        <button onclick="editSchedItem('${item.id}')" class="text-xs opacity-50 hover:opacity-100 transition"><i class="fa-solid fa-edit"></i></button>
        <button onclick="deleteSchedItem('${item.id}')" class="text-xs opacity-50 hover:opacity-100 transition"><i class="fa-solid fa-trash"></i></button>
      </div>
    </div>
  `;

  div.addEventListener('dragstart', handleDragStart);
  div.addEventListener('dragend', handleDragEnd);
  return div;
}

function renderGanttChart(items) {
  const container = document.getElementById('ganttChart');
  if (!container) return;
  container.innerHTML = '';

  if (items.length === 0) {
    container.innerHTML = '<p class="text-xs opacity-50 text-center py-8">No tasks to display</p>';
    return;
  }

  const today = new Date();
  const maxDate = new Date(Math.max(...items.map(i => new Date(i.deadline))));
  const minDate = new Date(Math.min(today, ...items.map(i => new Date(i.deadline))));
  const totalDays = Math.max(1, Math.ceil((maxDate - minDate) / (1000 * 60 * 60 * 24)));

  items.forEach(item => {
    const deadline = new Date(item.deadline);
    const startOffset = Math.max(0, Math.floor((deadline - minDate) / (1000 * 60 * 60 * 24)));
    const duration = 3; // fake duration
    const width = Math.max(2, (duration / totalDays) * 100);
    const left = (startOffset / totalDays) * 100;

    const bar = document.createElement('div');
    bar.className = 'gantt-bar-container';
    bar.innerHTML = `
      <div class="gantt-bar" style="left:${left}%; width:${width}%; background:${item.priority === 'high' ? '#ef4444' : item.priority === 'medium' ? '#f59e0b' : '#10b981'}">
        <span class="gantt-bar-label">${item.title}</span>
        <span class="gantt-bar-deadline">${formatDate(item.deadline)}</span>
      </div>
    `;
    container.appendChild(bar);
  });
}

function renderCountdowns(items) {
  const container = document.getElementById('countdowns');
  if (!container) return;
  const defenses = items.filter(i => i.type === 'defense' && i.deadline);
  if (defenses.length === 0) {
    container.innerHTML = '<p class="text-xs opacity-50 text-center py-4">No defense dates set</p>';
    return;
  }

  container.innerHTML = '';
  defenses.forEach(def => {
    const now = new Date();
    const deadline = new Date(def.deadline);
    const daysLeft = Math.ceil((deadline - now) / (1000 * 60 * 60 * 24));
    const div = document.createElement('div');
    div.className = 'flex items-center justify-between p-2 bg-white/5 rounded-lg mb-2';
    div.innerHTML = `
      <div>
        <p class="text-sm font-medium">${def.title}</p>
        <p class="text-xs opacity-60">${formatDate(def.deadline)}</p>
      </div>
      <span class="text-sm font-bold ${daysLeft < 7 ? 'text-rose-400' : 'text-emerald-400'}">${daysLeft} days</span>
    `;
    container.appendChild(div);
  });
}

function renderExamMatrix(items) {
  const container = document.getElementById('examMatrix');
  if (!container) return;
  const exams = items.filter(i => i.type === 'exam' && i.deadline);
  if (exams.length === 0) {
    container.innerHTML = '<p class="text-xs opacity-50 text-center py-4">No exams scheduled</p>';
    return;
  }
  container.innerHTML = '';
  exams.forEach(ex => {
    const div = document.createElement('div');
    div.className = 'flex items-center justify-between p-2 bg-white/5 rounded-lg mb-2';
    div.innerHTML = `
      <p class="text-sm font-medium">${ex.title}</p>
      <p class="text-xs text-amber-400">${formatDate(ex.deadline)}</p>
    `;
    container.appendChild(div);
  });
}

function renderSchedFilterChips() {
  const container = document.querySelector('#viewScheduler .filter-chips');
  if (!container) return;
  container.innerHTML = '';
  const filters = ['all', 'task', 'milestone', 'defense', 'exam'];
  filters.forEach(f => {
    const chip = document.createElement('button');
    chip.className = 'filter-chip' + (currentSchedFilter === f ? ' active' : '');
    chip.textContent = f.charAt(0).toUpperCase() + f.slice(1);
    chip.onclick = () => { currentSchedFilter = f; renderScheduler(); };
    container.appendChild(chip);
  });
}

function addOrUpdateSchedItem() {
  const title = document.getElementById('schedTitle').value.trim();
  const deadline = document.getElementById('schedDeadline').value;
  const type = document.getElementById('schedType').value;
  const priority = document.getElementById('schedPriority').value;
  const category = document.getElementById('schedCategory').value;
  const editId = document.getElementById('editSchedId').value;

  if (!title) {
    showNotification('Please enter a task title.', 'warning');
    return;
  }

  if (editId) {
    const item = schedItems.find(i => i.id === editId);
    if (item) {
      item.title = title;
      item.deadline = deadline;
      item.type = type;
      item.priority = priority;
      item.category = category;
    }
    document.getElementById('editSchedId').value = '';
    document.getElementById('schedAddBtn').innerHTML = '<i class="fa-solid fa-plus mr-1"></i> Add';
  } else {
    schedItems.push({
      id: generateId(),
      title,
      deadline,
      type,
      priority,
      category,
      status: 'todo',
      createdAt: new Date().toISOString()
    });
  }

  safeLocalStorageSet('acadhub_sched', schedItems);
  if (firebaseAvailable && auth && auth.currentUser) {
    const ref = db.collection('users').doc(auth.currentUser.uid).collection('scheduler');
    if (editId) ref.doc(editId).update({ title, deadline, type, priority, category });
    else ref.add({ title, deadline, type, priority, category, status: 'todo' });
  }

  document.getElementById('schedTitle').value = '';
  document.getElementById('schedDeadline').value = '';
  renderScheduler();
  showNotification(editId ? 'Task updated!' : 'Task added!', 'success');
}

function editSchedItem(id) {
  const item = schedItems.find(i => i.id === id);
  if (!item) return;
  document.getElementById('schedTitle').value = item.title || '';
  document.getElementById('schedDeadline').value = item.deadline || '';
  document.getElementById('schedType').value = item.type || 'task';
  document.getElementById('schedPriority').value = item.priority || 'medium';
  document.getElementById('schedCategory').value = item.category || 'study';
  document.getElementById('editSchedId').value = id;
  document.getElementById('schedAddBtn').innerHTML = '<i class="fa-solid fa-check mr-1"></i> Update';
}

function deleteSchedItem(id) {
  if (!confirm('Delete this item?')) return;
  schedItems = schedItems.filter(i => i.id !== id);
  safeLocalStorageSet('acadhub_sched', schedItems);
  if (firebaseAvailable && auth && auth.currentUser) {
    db.collection('users').doc(auth.currentUser.uid).collection('scheduler').doc(id).delete();
  }
  renderScheduler();
  showNotification('Item deleted.', 'info');
}

function dropSchedTask(event, status) {
  event.preventDefault();
  const taskId = event.dataTransfer.getData('text/plain');
  if (!taskId) return;
  const item = schedItems.find(i => i.id === taskId);
  if (item) {
    item.status = status;
    safeLocalStorageSet('acadhub_sched', schedItems);
    if (firebaseAvailable && auth && auth.currentUser) {
      db.collection('users').doc(auth.currentUser.uid).collection('scheduler').doc(taskId).update({ status });
    }
    renderScheduler();
  }
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
  // Day headers
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  dayNames.forEach(d => {
    cells += `<div class="calendar-day-header">${d}</div>`;
  });

  // Empty cells before first day
  for (let i = 0; i < firstDay; i++) {
    cells += '<div class="calendar-day empty"></div>';
  }

  const today = new Date();
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(calendarYear, calendarMonth, day);
    const dateStr = date.toISOString().split('T')[0];
    const isToday = date.toDateString() === today.toDateString();
    const isSelected = selectedCalendarDate === dateStr;

    // Count tasks/deadlines on this day
    const tasksOnDay = getAllTasksForDate(dateStr);

    cells += `
      <div class="calendar-day ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''}" onclick="selectCalendarDate('${dateStr}')">
        <span>${day}</span>
        ${tasksOnDay.length > 0 ? `<span class="task-dot ${tasksOnDay.length > 1 ? 'multiple' : ''}"></span>` : ''}
      </div>
    `;
  }

  grid.innerHTML = cells;
  if (selectedCalendarDate) showTasksForDate(selectedCalendarDate);
  else document.getElementById('selectedDayTasks').innerHTML = '<p class="text-sm opacity-50">Select a date to see tasks.</p>';
}

function getAllTasksForDate(dateStr) {
  const all = [];
  schedItems.forEach(item => {
    if (item.deadline === dateStr) all.push({ ...item, source: 'scheduler' });
  });
  plannerTasks.forEach(item => {
    if (item.deadline === dateStr) all.push({ ...item, source: 'planner' });
  });
  return all;
}

function selectCalendarDate(dateStr) {
  selectedCalendarDate = dateStr;
  renderCalendar();
  showTasksForDate(dateStr);
}

function showTasksForDate(dateStr) {
  const container = document.getElementById('selectedDayTasks');
  if (!container) return;
  const tasks = getAllTasksForDate(dateStr);
  if (tasks.length === 0) {
    container.innerHTML = '<p class="text-sm opacity-50">No tasks for this day.</p>';
    return;
  }
  container.innerHTML = '';
  tasks.forEach(task => {
    const div = document.createElement('div');
    div.className = 'flex items-center justify-between p-2 bg-white/5 rounded-lg mb-2';
    const sourceIcon = task.source === 'scheduler' ? 'fa-calendar-days' : 'fa-clipboard-list';
    div.innerHTML = `
      <div class="flex items-center gap-2">
        <i class="fa-solid ${sourceIcon} text-indigo-400 text-xs"></i>
        <p class="text-sm font-medium">${task.title || 'Untitled'}</p>
      </div>
      <span class="text-xs opacity-60">${task.priority || 'medium'}</span>
    `;
    container.appendChild(div);
  });
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

    div.innerHTML = `
      <div class="flex items-center justify-between">
        <div>
          <p class="text-sm font-medium">${item.title || 'Untitled Reviewer'}</p>
          <p class="text-xs opacity-50">${item.date ? new Date(item.date).toLocaleDateString() : 'No date'}</p>
        </div>
        <div class="flex gap-2">
          <button onclick="loadSavedItem(${index})" class="text-xs text-indigo-400 hover:text-indigo-300">
            <i class="fa-solid fa-eye mr-1"></i> View
          </button>
          <button onclick="deleteSavedItem(${index})" class="text-xs text-rose-400 hover:text-rose-300">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>
      </div>
    `;

    container.appendChild(div);
  });
}

function loadSavedItem(index) {
  const saved = safeLocalStorageGet('acadhub_saved', []);
  const item = saved[index];

  if (!item) return;

  switchTab('reviewer');

  document.getElementById('resultsContainer').classList.remove('hidden');
  document.getElementById('summaryList').innerHTML = item.summaryHTML || '';
  document.getElementById('flashcardGrid').innerHTML = item.flashcardsHTML || '';
  document.getElementById('quizContainer').innerHTML = item.quizHTML || '';

  document.getElementById('saveToLibraryBtn').classList.add('hidden');
}

function deleteSavedItem(index) {
  if (!confirm('Delete this saved reviewer?')) return;

  const saved = safeLocalStorageGet('acadhub_saved', []);
  saved.splice(index, 1);
  safeLocalStorageSet('acadhub_saved', saved);

  renderSavedList();
  showNotification('Reviewer deleted.', 'info');
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
  closeAuthModal();
  showNotification('Logged out successfully.', 'info');
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
      document.getElementById('logoutButton').classList.remove('hidden');

      try {
        const [sched, planner, library] = await Promise.all([
          loadFromFirestore('scheduler'),
          loadFromFirestore('planner'),
          loadFromFirestore('library')
        ]);

        if (sched.length > 0) {
          schedItems = sched;
          safeLocalStorageSet('acadhub_sched', sched);
        }

        if (planner.length > 0) {
          plannerTasks = planner;
          safeLocalStorageSet('acadhub_planner', planner);
        }

        if (library.length > 0) {
          safeLocalStorageSet('acadhub_saved', library);
        }

        renderScheduler();
        renderPlanner();
        renderSavedList();
      } catch (err) {
        console.error('Error loading Firestore data:', err);
      }
    } else {
      document.getElementById('userIcon').classList.remove('fa-user-check');
      document.getElementById('userIcon').classList.add('fa-user');
      document.getElementById('profileButton').title = 'Login / Sign Up';
      document.getElementById('logoutButton').classList.add('hidden');
    }

    updateAuthUI();
  });
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
  const profileName = safeLocalStorageGet('profile_name', 'Anonymous');
  
  console.log('Evaluation submitted:', { rating: selectedRating, suggestions, profileName });
  
  if (firebaseAvailable && auth && auth.currentUser) {
  db.collection('evaluations').add({
    rating: selectedRating,
    suggestions,
    profileName,
    userId: auth.currentUser.uid,
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

  // Check backend health
  checkBackendHealth().then(available => {
    backendAvailable = available;
    console.log(available ? '✅ Backend available' : '⚠️ Backend offline - using local mode');
  });

  // Load saved theme
  const savedTheme = safeLocalStorageGet('theme', 'dark');
  document.documentElement.classList.remove('dark', 'light');
  document.documentElement.classList.add(savedTheme);

  // Load saved data
  schedItems = safeLocalStorageGet('acadhub_sched', []);
  plannerTasks = safeLocalStorageGet('acadhub_planner', []);
  offlineQueue = safeLocalStorageGet('offline_queue', []);

  // Render initial views
  renderScheduler();
  renderPlanner();
  renderSavedList();
  renderCalendar();
  updateProviderUI();
  updateSettingsUI();
  initProfileModal();

  // FIXED: Force enable tab buttons
  setTimeout(() => {
    enableTabButtons();
    console.log('✅ Tab buttons force-enabled');
  }, 100);
  
  window.addEventListener('load', () => {
    enableTabButtons();
  });

  console.log('✅ AcadHub Suite initialized successfully');
}

// Call initialization when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp);
} else {
  initializeApp();
}

// Export all functions to window
window.switchTab = switchTab;
window.initTabListeners = initTabListeners;
window.showProfileModal = showProfileModal;
window.closeProfileModal = closeProfileModal;
window.saveVisitorName = saveVisitorName;
window.initProfileModal = initProfileModal;
window.toggleSettingsModal = toggleSettingsModal;
window.closeSettingsModal = closeSettingsModal;
window.toggleTheme = toggleTheme;
window.changeTabPosition = changeTabPosition;
window.updateSettingsUI = updateSettingsUI;
window.updateProviderUI = updateProviderUI;
window.toggleAccuracyInfo = toggleAccuracyInfo;
window.toggleApiKeyVisibility = toggleApiKeyVisibility;
window.updateFileName = updateFileName;
window.updateTestFileName = updateTestFileName;
window.handleGenerate = handleGenerate;
window.renderSummary = renderSummary;
window.renderFlashcards = renderFlashcards;
window.renderQuiz = renderQuiz;
window.checkAnswer = checkAnswer;
window.checkMCQAnswer = checkMCQAnswer;
window.revealAnswer = revealAnswer;
window.saveToLibrary = saveToLibrary;
window.setDifficulty = setDifficulty;
window.startTest = startTest;
window.showTestQuestion = showTestQuestion;
window.answerTestQuestion = answerTestQuestion;
window.nextTestQuestion = nextTestQuestion;
window.showTestResults = showTestResults;
window.resetTest = resetTest;
window.showReview = showReview;
window.renderPlanner = renderPlanner;
window.addOrUpdatePlannerTask = addOrUpdatePlannerTask;
window.editPlannerTask = editPlannerTask;
window.deletePlannerTask = deletePlannerTask;
window.allowDrop = allowDrop;
window.dropPlannerTask = dropPlannerTask;
window.renderSavedList = renderSavedList;
window.loadSavedItem = loadSavedItem;
window.deleteSavedItem = deleteSavedItem;
window.retryWakeUp = retryWakeUp;
window.skipToDashboard = skipToDashboard;
window.handleAuth = handleAuth;
window.toggleAuthMode = toggleAuthMode;
window.logout = logout;
window.closeAuthModal = closeAuthModal;
window.showNotification = showNotification;
window.revealGCash = revealGCash;
window.toggleEvalModal = toggleEvalModal;
window.submitEval = submitEval;
window.hideWakeUpOverlay = hideWakeUpOverlay;
window.enableTabButtons = enableTabButtons;

console.log('✅ All functions exported and ready');
console.log('✅ Backend integration complete');