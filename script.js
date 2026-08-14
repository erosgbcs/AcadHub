// ============================================================
// FIREBASE CONFIGURATION
// ============================================================
const firebaseConfig = {
  apiKey: "AIzaSyDQA4BN_3jyBWPQGWbYaHhq-aswIP7NvNg",
  authDomain: "acadhub-visitors-69180.firebaseapp.com",
  databaseURL: "https://acadhub-visitors-69180-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "acadhub-visitors-69180",
  storageBucket: "acadhub-visitors-69180.firebasestorage.app",
  messagingSenderId: "292893836149",
  appId: "1:292893836149:web:8345f25b7c68974eaec93c",
  measurementId: "G-CY6WD8V98H"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();

// Enable offline persistence
db.enablePersistence()
  .then(() => console.log('Offline persistence enabled'))
  .catch((err) => {
    if (err.code === 'failed-precondition') {
      console.warn('Multiple tabs open, persistence can only be enabled in one tab at a time.');
    } else if (err.code === 'unimplemented') {
      console.warn('Browser does not support offline persistence');
    }
  });

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
let testTimer = null;
let timeLeft = 0;
let calendarMonth = new Date().getMonth();
let calendarYear = new Date().getFullYear();
let unsubscribers = [];
let currentResults = null;

// ============================================================
// UTILITY FUNCTIONS
// ============================================================
function safeLocalStorageSet(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.error(`Error saving to localStorage (${key}):`, err);
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
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
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
// WAKE-UP OVERLAY - WITH 30s TIMEOUT + SKIP TO DASHBOARD
// ============================================================
async function retryWakeUp() {
  const statusEl = document.getElementById('wakeUpStatus');
  const btn = document.getElementById('retryWakeBtn');
  const overlay = document.getElementById('wakeUpOverlay');
  
  // Show loading state
  btn.innerHTML = '<span class="loading-spinner"></span>Checking...';
  btn.classList.add('loading');
  btn.disabled = true;
  
  statusEl.innerHTML = '<span class="loading-spinner"></span>Connecting to backend...';
  statusEl.className = 'loading';
  statusEl.style.color = '#94a3b8';
  
  // Countdown display
  let secondsLeft = 30;
  const countdownInterval = setInterval(() => {
    secondsLeft--;
    if (secondsLeft > 0) {
      statusEl.innerHTML = `<span class="loading-spinner"></span>Connecting... (${secondsLeft}s timeout)`;
      
      // Change color when almost timeout
      if (secondsLeft < 10) {
        statusEl.style.color = '#f59e0b';
      }
      if (secondsLeft < 5) {
        statusEl.style.color = '#ef4444';
      }
    }
  }, 1000);
  
  try {
    // 30-second timeout promise
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('TIMEOUT')), 30000);
    });
    
    // Firestore check
    const firestoreCheck = db.collection('_health_check').doc('test').set({ 
      timestamp: firebase.firestore.FieldValue.serverTimestamp() 
    });
    
    // Race: whichever finishes first wins
    await Promise.race([firestoreCheck, timeoutPromise]);
    
    // ✅ SUCCESS - Backend is online
    clearInterval(countdownInterval);
    statusEl.innerHTML = '<i class="fa-solid fa-circle-check mr-2"></i>Backend is ready!';
    statusEl.className = 'success';
    statusEl.style.color = '#10b981';
    btn.innerHTML = '<i class="fa-solid fa-check mr-2"></i>Connected!';
    btn.classList.remove('loading');
    
    // Wait 1 second so user sees success
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Fade out overlay
    overlay.classList.add('fade-out');
    await new Promise(resolve => setTimeout(resolve, 500));
    overlay.style.display = 'none';
    
    console.log('✅ Backend is ready!');
    
  } catch (err) {
    // ❌ TIMEOUT OR ERROR - Show options
    clearInterval(countdownInterval);
    console.error('Wake-up error:', err);
    
    // Update status
    if (err.message.includes('TIMEOUT')) {
      statusEl.innerHTML = '<i class="fa-solid fa-clock mr-2"></i>Server took too long (30s). You can continue offline.';
      statusEl.style.color = '#f59e0b';
    } else {
      statusEl.innerHTML = '<i class="fa-solid fa-triangle-exclamation mr-2"></i>Backend offline. You can continue in offline mode.';
      statusEl.style.color = '#ef4444';
    }
    
    statusEl.className = 'error';
    
    // Change button to "Continue Offline"
    btn.innerHTML = '<i class="fa-solid fa-arrow-right mr-2"></i>Continue to Dashboard';
    btn.classList.remove('loading');
    btn.disabled = false;
    
    // Replace onclick to skip directly
    btn.onclick = skipToDashboard;
    
    // Also add a secondary skip link
    const skipLink = document.createElement('button');
    skipLink.id = 'skipOfflineBtn';
    skipLink.textContent = 'Skip and continue offline';
    skipLink.style.cssText = `
      display: block;
      margin: 1rem auto 0;
      padding: 0.5rem 1rem;
      background: transparent;
      border: 1px solid rgba(255,255,255,0.2);
      color: #94a3b8;
      border-radius: 0.5rem;
      font-size: 0.8rem;
      cursor: pointer;
      transition: all 0.2s;
    `;
    skipLink.onmouseover = () => {
      skipLink.style.background = 'rgba(255,255,255,0.1)';
      skipLink.style.color = '#e2e8f0';
    };
    skipLink.onmouseout = () => {
      skipLink.style.background = 'transparent';
      skipLink.style.color = '#94a3b8';
    };
    skipLink.onclick = skipToDashboard;
    
    // Remove old skip link if exists
    const oldSkip = document.getElementById('skipOfflineBtn');
    if (oldSkip) oldSkip.remove();
    
    // Add skip link after status
    statusEl.parentElement.appendChild(skipLink);
    
  } finally {
    // Ensure button is enabled
    btn.disabled = false;
    btn.classList.remove('loading');
  }
}

// ============================================================
// SKIP TO DASHBOARD (OFFLINE MODE)
// ============================================================
function skipToDashboard() {
  const overlay = document.getElementById('wakeUpOverlay');
  const statusEl = document.getElementById('wakeUpStatus');
  
  // Show quick transition message
  statusEl.innerHTML = '<i class="fa-solid fa-check mr-2"></i>Continuing offline...';
  statusEl.style.color = '#10b981';
  
  // Fade out overlay
  overlay.classList.add('fade-out');
  
  // Hide after fade
  setTimeout(() => {
    overlay.style.display = 'none';
    console.log('📴 Entering offline mode - dashboard accessible');
    
    // Optional: Show notification that app is offline
    showOfflineNotification();
  }, 500);
}

// ============================================================
// OFFLINE NOTIFICATION
// ============================================================
function showOfflineNotification() {
  // Create notification element
  const notification = document.createElement('div');
  notification.id = 'offlineNotification';
  notification.style.cssText = `
    position: fixed;
    top: 1rem;
    right: 1rem;
    z-index: 100;
    padding: 0.75rem 1rem;
    background: rgba(245, 158, 11, 0.15);
    border: 1px solid rgba(245, 158, 11, 0.3);
    border-radius: 0.75rem;
    color: #fbbf24;
    font-size: 0.85rem;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    animation: slideIn 0.3s ease;
    backdrop-filter: blur(12px);
  `;
  notification.innerHTML = `
    <i class="fa-solid fa-wifi-slash"></i>
    <span>Offline Mode - Data saved locally</span>
    <button onclick="this.parentElement.remove()" style="background:none;border:none;color:#fbbf24;cursor:pointer;font-size:1rem;">×</button>
  `;
  
  document.body.appendChild(notification);
  
  // Auto-remove after 5 seconds
  setTimeout(() => {
    if (notification.parentElement) {
      notification.style.opacity = '0';
      notification.style.transition = 'opacity 0.3s';
      setTimeout(() => notification.remove(), 300);
    }
  }, 5000);
}

// Add slide-in animation
const style = document.createElement('style');
style.textContent = `
  @keyframes slideIn {
    from {
      transform: translateX(100%);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }
`;
document.head.appendChild(style);

// Export for global use
window.skipToDashboard = skipToDashboard;


// ============================================================
// TAB MANAGEMENT
// ============================================================
function switchTab(tab) {
  currentTab = tab;
  
  // Hide all views
  document.querySelectorAll('[id^="view"]').forEach(view => {
    view.classList.add('hidden');
  });
  
  // Show selected view
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
    document.getElementById(viewId).classList.remove('hidden');
  }
  
  // Update tab styles
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
    document.getElementById(tabId).classList.remove('tab-inactive');
    document.getElementById(tabId).classList.add('tab-active');
  }
  
  // Render specific views
  if (tab === 'library') renderSavedList();
  if (tab === 'scheduler') renderScheduler();
  if (tab === 'planner') renderPlanner();
  if (tab === 'calendar') renderCalendar();
}

// ============================================================
// PROFILE MANAGEMENT
// ============================================================
function showProfileModal() {
  const user = auth.currentUser;
  
  if (user) {
    document.getElementById('authModal').classList.remove('hidden');
    updateAuthUI();
  } else {
    if (safeLocalStorageGet('profile_saved') !== 'true') {
      document.getElementById('profileModal').classList.remove('hidden');
    } else {
      document.getElementById('authModal').classList.remove('hidden');
      updateAuthUI();
    }
  }
}

function closeProfileModal() {
  document.getElementById('profileModal').classList.add('hidden');
}

// ============================================================
// PROFILE SAVE WITH NOTIFICATION
// ============================================================
function saveVisitorName() {
  const firstName = document.getElementById('visitorFirstName').value.trim();
  const lastName = document.getElementById('visitorLastName').value.trim();
  const agreeTerms = document.getElementById('agreeTerms').checked;
  const saveBtn = document.getElementById('saveProfileBtn');
  
  // Validation
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
  
  // Disable button during save
  saveBtn.disabled = true;
  const originalText = saveBtn.innerHTML;
  saveBtn.innerHTML = '<i class="fa-solid fa-spinner animate-spin mr-2"></i>Saving...';
  
  const fullName = firstName + ' ' + lastName;
  
  // Save to localStorage first
  safeLocalStorageSet('profile_name', fullName);
  safeLocalStorageSet('profile_saved', 'true');
  
  // Try to save to Firestore if logged in
  const savePromise = auth.currentUser 
    ? db.collection('users').doc(auth.currentUser.uid).set({
        firstName,
        lastName,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true })
    : Promise.resolve();
  
  savePromise
    .then(() => {
      console.log('Profile saved:', fullName);
      closeProfileModal();
      
      // ✅ Show success notification
      showNotification(`Welcome, ${firstName}! Your profile has been saved.`, 'success');
    })
    .catch(err => {
      console.error('Error saving to Firestore:', err);
      closeProfileModal();
      
      // ⚠️ Show warning (saved locally but not cloud)
      showNotification('Profile saved locally. Will sync when online.', 'warning');
    })
    .finally(() => {
      // Reset button
      saveBtn.disabled = false;
      saveBtn.innerHTML = originalText;
    });
}

// ============================================================
// NOTIFICATION SYSTEM
// ============================================================
function showNotification(message, type = 'success') {
  // Remove existing notification
  const existing = document.getElementById('appNotification');
  if (existing) existing.remove();
  
  // Create notification element
  const notification = document.createElement('div');
  notification.id = 'appNotification';
  
  // Style based on type
  const styles = {
    success: {
      background: 'rgba(16, 185, 129, 0.15)',
      border: '1px solid rgba(16, 185, 129, 0.3)',
      color: '#34d399',
      icon: 'fa-circle-check'
    },
    error: {
      background: 'rgba(239, 68, 68, 0.15)',
      border: '1px solid rgba(239, 68, 68, 0.3)',
      color: '#f87171',
      icon: 'fa-circle-xmark'
    },
    warning: {
      background: 'rgba(245, 158, 11, 0.15)',
      border: '1px solid rgba(245, 158, 11, 0.3)',
      color: '#fbbf24',
      icon: 'fa-triangle-exclamation'
    },
    info: {
      background: 'rgba(99, 102, 241, 0.15)',
      border: '1px solid rgba(99, 102, 241, 0.3)',
      color: '#a5b4fc',
      icon: 'fa-circle-info'
    }
  };
  
  const style = styles[type] || styles.success;
  
  notification.style.cssText = `
    position: fixed;
    top: 1rem;
    right: 1rem;
    z-index: 1000;
    padding: 1rem 1.25rem;
    background: ${style.background};
    border: ${style.border};
    border-radius: 0.75rem;
    color: ${style.color};
    font-size: 0.9rem;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    min-width: 280px;
    max-width: 400px;
    animation: slideInRight 0.3s ease;
    backdrop-filter: blur(12px);
    box-shadow: 0 8px 24px rgba(0,0,0,0.2);
  `;
  
  notification.innerHTML = `
    <i class="fa-solid ${style.icon} text-lg"></i>
    <span style="flex:1;">${message}</span>
    <button onclick="this.parentElement.remove()" 
            style="background:none;border:none;color:${style.color};cursor:pointer;font-size:1.1rem;opacity:0.7;hover:opacity:1;">
      ×
    </button>
  `;
  
  document.body.appendChild(notification);
  
  // Auto-remove after 4 seconds
  setTimeout(() => {
    if (notification.parentElement) {
      notification.style.opacity = '0';
      notification.style.transition = 'opacity 0.3s ease';
      setTimeout(() => notification.remove(), 300);
    }
  }, 4000);
}

// Add animation
const notificationStyle = document.createElement('style');
notificationStyle.textContent = `
  @keyframes slideInRight {
    from {
      transform: translateX(100%);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }
`;
document.head.appendChild(notificationStyle);

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
  
  if (auth.currentUser) {
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
  
  if (auth.currentUser) {
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
  
  const accentPicker = document.getElementById('accentPicker');
  if (accentPicker) {
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
    accentPicker.value = accent || '#6366f1';
  }
}

// ============================================================
// PROVIDER UI MANAGEMENT
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
// FILE UPLOAD HANDLING
// ============================================================
function updateFileName(input) {
  const file = input.files[0];
  const display = document.getElementById('fileNameDisplay');
  
  if (file) {
    if (file.size > 10 * 1024 * 1024) {
      alert('File too large. Maximum size is 10MB.');
      input.value = '';
      display.textContent = 'Drop file or click to browse';
      return;
    }
    
    const allowedTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'];
    if (!allowedTypes.includes(file.type)) {
      alert('Invalid file type. Please upload PDF, DOCX, or TXT files.');
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
      alert('File too large. Maximum size is 10MB.');
      input.value = '';
      display.textContent = 'Drop file or click to browse';
      return;
    }
    
    const allowedTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'];
    if (!allowedTypes.includes(file.type)) {
      alert('Invalid file type. Please upload PDF, DOCX, or TXT files.');
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
// AI REVIEWER - GENERATE STUDY MATERIALS
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
    alert('Please paste notes or upload a document.');
    return;
  }
  
  submitBtn.disabled = true;
  btnContent.innerHTML = '<i class="fa-solid fa-spinner animate-spin mr-2"></i>Generating...';
  progressContainer.classList.remove('hidden');
  resultsContainer.classList.add('hidden');
  
  try {
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const summary = generateSummary(notes);
    renderSummary(summary);
    
    const numFlashcards = parseInt(document.getElementById('numFlashcards').value) || 10;
    const flashcards = generateFlashcards(notes, numFlashcards);
    renderFlashcards(flashcards);
    
    const quiz = generateQuiz(notes);
    renderQuiz(quiz);
    
    currentResults = {
      summary,
      flashcards,
      quiz,
      timestamp: new Date().toISOString()
    };
    
    resultsContainer.classList.remove('hidden');
    document.getElementById('saveToLibraryBtn').classList.remove('hidden');
    
  } catch (err) {
    console.error('Error generating materials:', err);
    alert('Error generating study materials. Please try again.');
  } finally {
    submitBtn.disabled = false;
    btnContent.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles mr-2"></i>Generate Study Materials';
    progressContainer.classList.add('hidden');
  }
}

function generateSummary(text) {
  if (!text.trim()) return ['No content provided for summary.'];
  
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 10);
  const summary = sentences.slice(0, 5).map(s => s.trim());
  
  return summary.length > 0 ? summary : ['No key concepts found.'];
}

function generateFlashcards(text, count) {
  const flashcards = [];
  
  if (!text.trim()) {
    flashcards.push({ front: 'Sample Question', back: 'Sample Answer' });
    return flashcards;
  }
  
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 15);
  
  for (let i = 0; i < Math.min(count, sentences.length); i++) {
    const sentence = sentences[i].trim();
    const words = sentence.split(' ');
    
    if (words.length > 5) {
      const midPoint = Math.floor(words.length / 2);
      flashcards.push({
        front: words.slice(0, midPoint).join(' ') + '...',
        back: words.slice(midPoint).join(' ')
      });
    }
  }
  
  while (flashcards.length < Math.min(count, 3)) {
    flashcards.push({ 
      front: 'Concept ' + (flashcards.length + 1), 
      back: 'Explanation for concept ' + (flashcards.length + 1) 
    });
  }
  
  return flashcards;
}

function generateQuiz(text) {
  const quiz = {
    trueFalse: [],
    identification: [],
    multipleChoice: []
  };
  
  if (!text.trim()) {
    quiz.trueFalse.push({ question: 'Sample true/false question?', answer: true });
    quiz.identification.push({ question: 'What is this sample?', answer: 'Sample answer' });
    quiz.multipleChoice.push({ 
      question: 'Sample multiple choice?', 
      options: ['A', 'B', 'C', 'D'], 
      correct: 0 
    });
    return quiz;
  }
  
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 20);
  
  sentences.slice(0, 3).forEach(sentence => {
    const words = sentence.trim().split(' ');
    if (words.length > 6) {
      quiz.trueFalse.push({
        question: sentence.trim(),
        answer: Math.random() > 0.5
      });
      
      const topic = words.slice(0, 4).join(' ');
      quiz.identification.push({
        question: 'What is being described: ' + topic + '...?',
        answer: words.slice(4).join(' ')
      });
      
      const correctAnswer = words[Math.floor(words.length / 2)];
      quiz.multipleChoice.push({
        question: 'Which term fits: ' + sentence.trim().replace(correctAnswer, '_____') + '?',
        options: [correctAnswer, 'Option A', 'Option B', 'Option C'],
        correct: 0
      });
    }
  });
  
  return quiz;
}

function renderSummary(summary) {
  const list = document.getElementById('summaryList');
  list.innerHTML = '';
  
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
  
  quiz.trueFalse.forEach((q, index) => {
    const div = document.createElement('div');
    div.className = 'bg-white/5 p-4 rounded-lg reveal-item';
    div.innerHTML = `
      <p class="text-sm font-semibold mb-2">${index + 1}. ${q.question}</p>
      <div class="flex gap-2">
        <button class="quiz-option px-4 py-2 bg-white/10 rounded-lg text-sm" onclick="checkAnswer(this, ${q.answer}, true)">True</button>
        <button class="quiz-option px-4 py-2 bg-white/10 rounded-lg text-sm" onclick="checkAnswer(this, ${q.answer}, false)">False</button>
      </div>
    `;
    container.appendChild(div);
  });
  
  quiz.identification.forEach((q, index) => {
    const div = document.createElement('div');
    div.className = 'bg-white/5 p-4 rounded-lg reveal-item';
    div.innerHTML = `
      <p class="text-sm font-semibold mb-2">${quiz.trueFalse.length + index + 1}. ${q.question}</p>
      <button class="quiz-option px-3 py-1 bg-white/10 rounded-lg text-sm mt-2" onclick="revealAnswer(this)">Show Answer</button>
      <p class="text-xs text-emerald-400 mt-2 hidden">Answer: ${q.answer}</p>
    `;
    container.appendChild(div);
  });
  
  quiz.multipleChoice.forEach((q, index) => {
    const div = document.createElement('div');
    div.className = 'bg-white/5 p-4 rounded-lg reveal-item';
    let optionsHTML = '';
    q.options.forEach((option, optIndex) => {
      optionsHTML += `
        <button class="quiz-option w-full text-left px-4 py-2 bg-white/10 rounded-lg text-sm mt-1" 
                onclick="checkMCQAnswer(this, ${q.correct}, ${optIndex})">
          ${String.fromCharCode(65 + optIndex)}. ${option}
        </button>
      `;
    });
    
    div.innerHTML = `
      <p class="text-sm font-semibold mb-2">${quiz.trueFalse.length + quiz.identification.length + index + 1}. ${q.question}</p>
      ${optionsHTML}
    `;
    container.appendChild(div);
  });
}

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
  answerText.classList.remove('hidden');
  btn.disabled = true;
  btn.classList.add('opacity-50');
}

async function saveToLibrary() {
  if (!currentResults) {
    alert('No results to save.');
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
  saved.push(saveItem);
  safeLocalStorageSet('acadhub_saved', saved);
  
  if (auth.currentUser) {
    try {
      await db.collection('users').doc(auth.currentUser.uid).collection('library').add(saveItem);
    } catch (err) {
      console.error('Error saving to Firestore:', err);
    }
  }
  
  alert('Saved to library!');
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

function startTest() {
  const notes = document.getElementById('testNotes').value.trim();
  const fileInput = document.getElementById('testFileInput');
  const hasFile = fileInput.files.length > 0;
  
  if (!notes && !hasFile) {
    alert('Please paste notes or upload a document.');
    return;
  }
  
  testQuestions = [];
  currentQuestionIndex = 0;
  testScore = 0;
  
  const questionCount = testDifficulty === 'easy' ? 8 : testDifficulty === 'medium' ? 15 : 26;
  
  testQuestions = generateTestQuestions(notes, questionCount);
  
  if (testQuestions.length === 0) {
    alert('Could not generate questions. Please add more notes.');
    return;
  }
  
  document.getElementById('startTestBtn').classList.add('hidden');
  document.getElementById('testQuizContainer').classList.remove('hidden');
  document.getElementById('testResultsContainer').classList.add('hidden');
  document.getElementById('reviewContainer').classList.add('hidden');
  
  showTestQuestion();
}

function generateTestQuestions(text, count) {
  const questions = [];
  
  if (!text.trim()) {
    for (let i = 0; i < Math.min(count, 5); i++) {
      questions.push({
        question: 'Sample question ' + (i + 1) + '?',
        options: ['Option A', 'Option B', 'Option C', 'Option D'],
        correct: 0
      });
    }
    return questions;
  }
  
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 15);
  
  sentences.slice(0, count).forEach((sentence) => {
    const words = sentence.trim().split(' ');
    
    if (words.length > 5) {
      const keyWordIndex = Math.floor(words.length / 2);
      const correctAnswer = words[keyWordIndex];
      const question = words.map((w, i) => i === keyWordIndex ? '_____' : w).join(' ');
      
      const options = [correctAnswer];
      const fillerWords = ['concept', 'theory', 'method', 'process', 'element', 'factor', 'principle', 'system'];
      
      while (options.length < 4) {
        const filler = fillerWords[Math.floor(Math.random() * fillerWords.length)];
        if (!options.includes(filler)) {
          options.push(filler);
        }
      }
      
      const shuffledOptions = shuffleArray(options);
      const correctIndex = shuffledOptions.indexOf(correctAnswer);
      
      questions.push({
        question: 'Fill in the blank: ' + question + '?',
        options: shuffledOptions,
        correct: correctIndex
      });
    }
  });
  
  return questions;
}

function showTestQuestion() {
  const question = testQuestions[currentQuestionIndex];
  const questionText = document.getElementById('testQuestionText');
  const optionsContainer = document.getElementById('testOptionsContainer');
  const counter = document.getElementById('questionCounter');
  
  counter.textContent = 'Question ' + (currentQuestionIndex + 1) + ' / ' + testQuestions.length;
  questionText.textContent = question.question;
  optionsContainer.innerHTML = '';
  
  question.options.forEach((option, index) => {
    const button = document.createElement('button');
    button.className = 'quiz-option w-full text-left px-4 py-3 bg-white/10 rounded-lg text-sm mt-2';
    button.textContent = String.fromCharCode(65 + index) + '. ' + option;
    button.onclick = () => answerTestQuestion(index, question.correct);
    optionsContainer.appendChild(button);
  });
  
  document.getElementById('nextTestBtn').classList.add('hidden');
}

function answerTestQuestion(userAnswer, correctAnswer) {
  if (userAnswer === correctAnswer) {
    testScore++;
  }
  
  const buttons = document.querySelectorAll('#testOptionsContainer .quiz-option');
  buttons.forEach((btn, index) => {
    btn.disabled = true;
    btn.classList.remove('bg-white/10');
    
    if (index === correctAnswer) {
      btn.classList.add('bg-emerald-500/20', 'text-emerald-400');
    } else if (index === userAnswer && userAnswer !== correctAnswer) {
      btn.classList.add('bg-rose-500/20', 'text-rose-400');
    }
  });
  
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
    div.className = 'review-item';
    
    div.innerHTML = `
      <p class="text-sm font-semibold">${index + 1}. ${question.question}</p>
      <p class="text-xs mt-1">
        <span class="text-emerald-400">Correct: ${question.options[question.correct]}</span>
      </p>
    `;
    
    container.appendChild(div);
  });
}
// ============================================================
// PROFILE MODAL - SAFE DYNAMIC VALIDATION
// ============================================================
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
  
  // Event listeners
  firstNameInput.addEventListener('input', validateProfileForm);
  lastNameInput.addEventListener('input', validateProfileForm);
  agreeTerms.addEventListener('change', validateProfileForm);
  
  // Initial state
  validateProfileForm();
}

// Enhanced save function with validation
function saveVisitorName() {
  const firstName = document.getElementById('visitorFirstName').value.trim();
  const lastName = document.getElementById('visitorLastName').value.trim();
  const agreeTerms = document.getElementById('agreeTerms').checked;
  const saveBtn = document.getElementById('saveProfileBtn');
  
  // Double validation (safety net)
  if (!firstName || !lastName) {
    alert('Please enter your first and last name.');
    return;
  }
  
  if (firstName.length < 2 || lastName.length < 2) {
    alert('Name must be at least 2 characters long.');
    return;
  }
  
  if (!agreeTerms) {
    alert('Please agree to the privacy terms.');
    return;
  }
  
  // Disable button during save
  saveBtn.disabled = true;
  const originalText = saveBtn.innerHTML;
  saveBtn.innerHTML = '<i class="fa-solid fa-spinner animate-spin mr-2"></i>Saving...';
  
  const fullName = firstName + ' ' + lastName;
  
  // Save to localStorage first (always works)
  safeLocalStorageSet('profile_name', fullName);
  safeLocalStorageSet('profile_saved', 'true');
  
  // Try to save to Firestore if logged in
  const savePromise = auth.currentUser 
    ? db.collection('users').doc(auth.currentUser.uid).set({
        firstName,
        lastName,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true })
    : Promise.resolve();
  
  savePromise
    .then(() => {
      console.log('Profile saved:', fullName);
      closeProfileModal();
    })
    .catch(err => {
      console.error('Error saving to Firestore:', err);
      // Still close since localStorage worked
      closeProfileModal();
    })
    .finally(() => {
      // Reset button
      saveBtn.disabled = false;
      saveBtn.innerHTML = originalText;
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
    alert('Please enter a task title.');
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
      id: Date.now().toString(),
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
  
  if (auth.currentUser) {
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
  
  if (auth.currentUser) {
    db.collection('users').doc(auth.currentUser.uid).collection('planner').doc(id).delete();
  }
  
  renderPlanner();
}

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
    
    if (auth.currentUser) {
      db.collection('users').doc(auth.currentUser.uid).collection('planner').doc(taskId).update({ status });
    }
    
    renderPlanner();
  }
}

// ============================================================
// DRAG AND DROP HANDLERS
// ============================================================
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
function renderScheduler() {
  renderSchedulerKanban();
  renderGanttChart();
  renderCountdowns();
  renderExamMatrix();
  renderFilterChips();
}

function renderSchedulerKanban() {
  const todoCol = document.getElementById('sched-todo');
  const progressCol = document.getElementById('sched-progress');
  const doneCol = document.getElementById('sched-done');
  
  if (!todoCol || !progressCol || !doneCol) return;
  
  todoCol.innerHTML = '';
  progressCol.innerHTML = '';
  doneCol.innerHTML = '';
  
  schedItems.forEach(item => {
    const element = createSchedItemElement(item);
    const column = item.status === 'done' ? doneCol : item.status === 'progress' ? progressCol : todoCol;
    column.appendChild(element);
  });
  
  updateColumnCounts();
}

function createSchedItemElement(item) {
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
      <span class="${typeClass} type-badge">${item.type || 'task'}</span>
      <div class="flex gap-2">
        <button onclick="editSchedItem('${item.id}')" class="text-xs opacity-50 hover:opacity-100 transition">
          <i class="fa-solid fa-edit"></i>
        </button>
        <button onclick="deleteSchedItem('${item.id}')" class="text-xs opacity-50 hover:opacity-100 transition">
          <i class="fa-solid fa-trash"></i>
        </button>
      </div>
    </div>
  `;
  
  div.addEventListener('dragstart', handleDragStart);
  div.addEventListener('dragend', handleDragEnd);
  
  return div;
}

function renderGanttChart() {
  const container = document.getElementById('ganttChart');
  if (!container) return;
  
  if (schedItems.length === 0) {
    container.innerHTML = '<p class="text-xs opacity-50 text-center py-8">Add tasks to see your roadmap timeline</p>';
    return;
  }
  
  const sortedItems = [...schedItems].sort((a, b) => {
    if (!a.deadline) return 1;
    if (!b.deadline) return -1;
    return new Date(a.deadline) - new Date(b.deadline);
  });
  
  const now = new Date();
  const maxDate = new Date(Math.max(...sortedItems.map(item => new Date(item.deadline || now))));
  const minDate = new Date(Math.min(...sortedItems.map(item => new Date(item.deadline || now))));
  const totalDays = Math.max(1, Math.ceil((maxDate - minDate) / (1000 * 60 * 60 * 24)));
  
  container.innerHTML = '';
  
  sortedItems.forEach(item => {
    const deadline = new Date(item.deadline || now);
    const daysFromStart = Math.max(0, Math.ceil((deadline - minDate) / (1000 * 60 * 60 * 24)));
    const width = Math.min(100, Math.max(5, (daysFromStart / totalDays) * 100));
    
    const barContainer = document.createElement('div');
    barContainer.className = 'gantt-bar-container';
    
    const bar = document.createElement('div');
    bar.className = 'gantt-bar';
    bar.style.width = width + '%';
    bar.style.background = item.dotColor || '#6366f1';
    
    const label = document.createElement('span');
    label.className = 'gantt-bar-label';
    label.textContent = item.title;
    
    const deadlineLabel = document.createElement('span');
    deadlineLabel.className = 'gantt-bar-deadline';
    deadlineLabel.textContent = formatDate(item.deadline);
    
    bar.appendChild(label);
    barContainer.appendChild(bar);
    barContainer.appendChild(deadlineLabel);
    container.appendChild(barContainer);
  });
}

function renderCountdowns() {
  const container = document.getElementById('countdowns');
  if (!container) return;
  
  const defenses = schedItems.filter(item => item.type === 'defense' && item.deadline);
  
  if (defenses.length === 0) {
    container.innerHTML = '<p class="text-xs opacity-50 text-center py-4">No defense dates set</p>';
    return;
  }
  
  container.innerHTML = '';
  
  defenses.forEach(defense => {
    const deadline = new Date(defense.deadline);
    const now = new Date();
    const daysLeft = Math.ceil((deadline - now) / (1000 * 60 * 60 * 24));
    
    const div = document.createElement('div');
    div.className = 'flex items-center justify-between p-2 border-b border-white/5';
    
    div.innerHTML = `
      <div>
        <p class="text-sm font-medium">${defense.title}</p>
        <p class="text-xs opacity-50">${formatDate(defense.deadline)}</p>
      </div>
      <div class="text-right">
        <p class="text-lg font-bold ${daysLeft < 7 ? 'text-rose-400' : daysLeft < 30 ? 'text-amber-400' : 'text-emerald-400'}">${daysLeft} days</p>
        <p class="text-xs opacity-50">remaining</p>
      </div>
    `;
    
    container.appendChild(div);
  });
}

function renderExamMatrix() {
  const container = document.getElementById('examMatrix');
  if (!container) return;
  
  const exams = schedItems.filter(item => item.type === 'exam' && item.deadline);
  
  if (exams.length === 0) {
    container.innerHTML = '<p class="text-xs opacity-50 text-center py-4">No exams scheduled</p>';
    return;
  }
  
  container.innerHTML = '';
  
  exams.forEach(exam => {
    const deadline = new Date(exam.deadline);
    const now = new Date();
    const daysLeft = Math.ceil((deadline - now) / (1000 * 60 * 60 * 24));
    
    const div = document.createElement('div');
    div.className = 'flex items-center justify-between p-3 border-b border-white/5';
    
    div.innerHTML = `
      <div class="flex items-center gap-2">
        <i class="fa-solid fa-file-pen text-amber-400"></i>
        <div>
          <p class="text-sm font-medium">${exam.title}</p>
          <p class="text-xs opacity-50">${formatDate(exam.deadline)}</p>
        </div>
      </div>
      <span class="text-xs ${daysLeft < 3 ? 'text-rose-400' : daysLeft < 7 ? 'text-amber-400' : 'text-emerald-400'}">
        ${daysLeft} days left
      </span>
    `;
    
    container.appendChild(div);
  });
}

function renderFilterChips() {
  const container = document.querySelector('.filter-chips');
  if (!container) return;
  
  const types = ['all', 'task', 'milestone', 'defense', 'exam'];
  
  container.innerHTML = '';
  
  types.forEach(type => {
    const chip = document.createElement('button');
    chip.className = 'filter-chip' + (type === 'all' ? ' active' : '');
    chip.textContent = type.charAt(0).toUpperCase() + type.slice(1);
    chip.onclick = () => filterSchedItems(type, chip);
    container.appendChild(chip);
  });
}

function filterSchedItems(type, chipElement) {
  document.querySelectorAll('.filter-chip').forEach(chip => {
    chip.classList.remove('active');
  });
  chipElement.classList.add('active');
  
  if (type === 'all') {
    renderSchedulerKanban();
  } else {
    const filtered = schedItems.filter(item => item.type === type);
    const original = schedItems;
    schedItems = filtered;
    renderSchedulerKanban();
    schedItems = original;
  }
}

function addOrUpdateSchedItem() {
  const title = document.getElementById('schedTitle').value.trim();
  const deadline = document.getElementById('schedDeadline').value;
  const type = document.getElementById('schedType').value;
  const priority = document.getElementById('schedPriority').value;
  const category = document.getElementById('schedCategory').value;
  const editId = document.getElementById('editSchedId').value;
  
  if (!title) {
    alert('Please enter a task title.');
    return;
  }
  
  if (editId) {
    const index = schedItems.findIndex(item => item.id === editId);
    if (index !== -1) {
      schedItems[index] = {
        ...schedItems[index],
        title,
        deadline,
        type,
        priority,
        category
      };
    }
    document.getElementById('editSchedId').value = '';
    document.getElementById('schedAddBtn').innerHTML = '<i class="fa-solid fa-plus mr-1"></i> Add';
  } else {
    const newItem = {
      id: Date.now().toString(),
      title,
      deadline,
      type,
      priority,
      category,
      status: 'todo',
      dotColor: getTypeColor(type),
      createdAt: new Date().toISOString()
    };
    schedItems.push(newItem);
  }
  
  safeLocalStorageSet('acadhub_sched', schedItems);
  
  if (auth.currentUser) {
    const schedRef = db.collection('users').doc(auth.currentUser.uid).collection('scheduler');
    if (editId) {
      schedRef.doc(editId).update({ title, deadline, type, priority, category });
    } else {
      schedRef.add({ title, deadline, type, priority, category, status: 'todo' });
    }
  }
  
  document.getElementById('schedTitle').value = '';
  document.getElementById('schedDeadline').value = '';
  
  renderScheduler();
}

function getTypeColor(type) {
  const colors = {
    'task': '#3b82f6',
    'milestone': '#a855f7',
    'defense': '#ef4444',
    'exam': '#f59e0b'
  };
  return colors[type] || '#6366f1';
}

function editSchedItem(id) {
  const item = schedItems.find(s => s.id === id);
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
  
  schedItems = schedItems.filter(s => s.id !== id);
  safeLocalStorageSet('acadhub_sched', schedItems);
  
  if (auth.currentUser) {
    db.collection('users').doc(auth.currentUser.uid).collection('scheduler').doc(id).delete();
  }
  
  renderScheduler();
}

function dropSchedTask(event, status) {
  event.preventDefault();
  const taskId = event.dataTransfer.getData('text/plain');
  
  if (!taskId) return;
  
  const task = schedItems.find(s => s.id === taskId);
  if (task) {
    task.status = status;
    safeLocalStorageSet('acadhub_sched', schedItems);
    
    if (auth.currentUser) {
      db.collection('users').doc(auth.currentUser.uid).collection('scheduler').doc(taskId).update({ status });
    }
    
    renderScheduler();
  }
}

function saveSched() {
  safeLocalStorageSet('acadhub_sched', schedItems);
}

// ============================================================
// CALENDAR FUNCTIONS
// ============================================================
function renderCalendar() {
  const grid = document.getElementById('calendarGrid');
  const label = document.getElementById('calendarMonthLabel');
  
  if (!grid || !label) return;
  
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  label.textContent = monthNames[calendarMonth] + ' ' + calendarYear;
  
  const firstDay = new Date(calendarYear, calendarMonth, 1).getDay();
  const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
  
  grid.innerHTML = '';
  
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  days.forEach(day => {
    const header = document.createElement('div');
    header.className = 'calendar-day-header';
    header.textContent = day;
    grid.appendChild(header);
  });
  
  for (let i = 0; i < firstDay; i++) {
    const empty = document.createElement('div');
    empty.className = 'calendar-day empty';
    grid.appendChild(empty);
  }
  
  const today = new Date();
  for (let day = 1; day <= daysInMonth; day++) {
    const dayCell = document.createElement('div');
    dayCell.className = 'calendar-day';
    dayCell.textContent = day;
    
    if (day === today.getDate() && calendarMonth === today.getMonth() && calendarYear === today.getFullYear()) {
      dayCell.classList.add('today');
    }
    
    const dateStr = `${calendarYear}-${String(calendarMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const tasksOnDay = [...schedItems, ...plannerTasks].filter(task => task.deadline === dateStr);
    
    if (tasksOnDay.length > 0) {
      const dot = document.createElement('span');
      dot.className = 'task-dot' + (tasksOnDay.length > 1 ? ' multiple' : '');
      dayCell.appendChild(dot);
      
      if (tasksOnDay.length > 1) {
        const count = document.createElement('span');
        count.className = 'task-count';
        count.textContent = tasksOnDay.length;
        dayCell.appendChild(count);
      }
    }
    
    dayCell.onclick = () => selectDate(day, dayCell);
    grid.appendChild(dayCell);
  }
}

function selectDate(day, dayCell) {
  document.querySelectorAll('.calendar-day').forEach(cell => {
    cell.classList.remove('selected');
  });
  
  dayCell.classList.add('selected');
  
  const dateStr = `${calendarYear}-${String(calendarMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const tasksOnDay = [...schedItems, ...plannerTasks].filter(task => task.deadline === dateStr);
  
  const container = document.getElementById('selectedDayTasks');
  if (container) {
    if (tasksOnDay.length === 0) {
      container.innerHTML = '<p class="text-sm opacity-50">No tasks on this day.</p>';
    } else {
      container.innerHTML = '';
      tasksOnDay.forEach(task => {
        const div = document.createElement('div');
        div.className = 'flex items-center justify-between p-2 border-b border-white/5';
        div.innerHTML = `
          <div>
            <p class="text-sm font-medium">${task.title}</p>
            <p class="text-xs opacity-50">${task.type || 'task'} · ${task.priority || 'medium'} priority</p>
          </div>
          <span class="text-xs opacity-50">${task.status || 'todo'}</span>
        `;
        container.appendChild(div);
      });
    }
  }
}

function changeMonth(delta) {
  calendarMonth += delta;
  if (calendarMonth < 0) {
    calendarMonth = 11;
    calendarYear--;
  } else if (calendarMonth > 11) {
    calendarMonth = 0;
    calendarYear++;
  }
  renderCalendar();
}

function toggleReminders() {
  const toggle = document.getElementById('reminderToggle');
  safeLocalStorageSet('reminders_enabled', toggle.checked);
  
  if (toggle.checked) {
    alert('Reminders enabled! You will be notified of upcoming deadlines.');
  } else {
    alert('Reminders disabled.');
  }
}

// ============================================================
// DONATION / GCASH FUNCTIONS
// ============================================================
function revealGCash() {
  document.getElementById('gcashHidden').classList.add('hidden');
  document.getElementById('gcashFull').classList.remove('hidden');
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
}

// ============================================================
// EVALUATION MODAL
// ============================================================
document.querySelectorAll('.star').forEach(star => {
  star.addEventListener('click', function() {
    selectedRating = parseInt(this.dataset.value);
    document.querySelectorAll('.star').forEach((s, index) => {
      if (index < selectedRating) {
        s.classList.remove('fa-regular');
        s.classList.add('fa-solid', 'text-amber-400');
      } else {
        s.classList.remove('fa-solid', 'text-amber-400');
        s.classList.add('fa-regular');
      }
    });
  });
});

function toggleEvalModal() {
  const modal = document.getElementById('evalModal');
  modal.classList.toggle('hidden');
  if (!modal.classList.contains('hidden')) {
    const name = safeLocalStorageGet('profile_name', 'Anonymous');
    document.getElementById('evalProfileName').textContent = 'Submitting as: ' + name;
  }
}

async function submitEval() {
  if (selectedRating === 0) { 
    alert('Please select a star rating.'); 
    return; 
  }
  
  const suggestions = document.getElementById('evalSuggestions').value.trim();
  const profileName = safeLocalStorageGet('profile_name', 'Anonymous');
  
  try {
    await db.collection('feedback').add({
      name: profileName,
      rating: selectedRating,
      suggestions: suggestions,
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });
    
    alert('Thank you for your feedback!');
    toggleEvalModal();
    selectedRating = 0;
    document.querySelectorAll('.star').forEach(s => {
      s.classList.remove('fa-solid', 'text-amber-400');
      s.classList.add('fa-regular');
    });
    document.getElementById('evalSuggestions').value = '';
  } catch (err) {
    console.error('Error submitting feedback:', err);
    alert('Error submitting feedback. Please try again.');
  }
}

// ============================================================
// AUTH FUNCTIONS
// ============================================================
function closeAuthModal() {
  document.getElementById('authModal').classList.add('hidden');
}

function updateAuthUI() {
  const user = auth.currentUser;
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
    } else {
      await auth.signInWithEmailAndPassword(email, password);
    }
    
    closeAuthModal();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.classList.remove('hidden');
  }
}

async function logout() {
  try {
    await auth.signOut();
    closeAuthModal();
  } catch (err) {
    console.error('Logout error:', err);
  }
}

// ============================================================
// FIREBASE DATA FUNCTIONS
// ============================================================
async function loadFromFirestore(collectionName) {
  if (!auth.currentUser) return [];
  
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

async function loadSettingsFromFirestore(user) {
  try {
    const doc = await db.collection('users').doc(user.uid).get();
    if (doc.exists) {
      const data = doc.data();
      
      if (data.theme) {
        const html = document.documentElement;
        html.classList.remove('dark', 'light');
        html.classList.add(data.theme);
      }
      
      if (data.tabPosition) {
        changeTabPosition(data.tabPosition);
      }
      
      if (data.accentColor) {
        document.documentElement.style.setProperty('--accent', data.accentColor);
        document.documentElement.style.setProperty('--accent2', data.accentColor);
      }
      
      if (data.remindersEnabled !== undefined) {
        const toggle = document.getElementById('reminderToggle');
        if (toggle) toggle.checked = data.remindersEnabled;
      }
    }
  } catch (err) {
    console.error('Error loading settings:', err);
  }
}

// ============================================================
// FIREBASE AUTH STATE LISTENER
// ============================================================
auth.onAuthStateChanged(async user => {
  if (user) {
    document.getElementById('userIcon').classList.remove('fa-user');
    document.getElementById('userIcon').classList.add('fa-user-check');
    document.getElementById('profileButton').title = 'Logged in as ' + user.email;
    document.getElementById('logoutButton').classList.remove('hidden');
    
    try {
      await loadSettingsFromFirestore(user);
      
      const [sched, planner, library] = await Promise.all([
        loadFromFirestore('scheduler'),
        loadFromFirestore('planner'),
        loadFromFirestore('library')
      ]);
      
      schedItems = sched;
      plannerTasks = planner;
      safeLocalStorageSet('acadhub_sched', sched);
      safeLocalStorageSet('acadhub_planner', planner);
      safeLocalStorageSet('acadhub_saved', library);
      
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

// ============================================================
// MODAL EVENT LISTENERS
// ============================================================
document.getElementById('authModal').addEventListener('click', function(e) {
  if (e.target === this) closeAuthModal();
});

document.getElementById('settingsModal').addEventListener('click', function(e) {
  if (e.target === this) closeSettingsModal();
});

document.getElementById('profileModal').addEventListener('click', function(e) {
  if (e.target === this) closeProfileModal();
});

document.getElementById('evalModal').addEventListener('click', function(e) {
  if (e.target === this) toggleEvalModal();
});

// ============================================================
// SERVICE WORKER REGISTRATION
// ============================================================
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then((registration) => {
        console.log('Service Worker registered:', registration.scope);
      })
      .catch((err) => {
        console.error('Service Worker registration failed:', err);
      });
  });
}

// ============================================================
// INITIALIZATION
// ============================================================
function initializeApp() {
  // Load saved theme
  const savedTheme = safeLocalStorageGet('theme', 'dark');
  document.documentElement.classList.remove('dark', 'light');
  document.documentElement.classList.add(savedTheme);
  
  // Load saved tab position
  const savedTabPosition = safeLocalStorageGet('tab_position', 'top');
  changeTabPosition(savedTabPosition);
  
  // Load saved scheduler items
  schedItems = safeLocalStorageGet('acadhub_sched', []);
  
  // Load saved planner tasks
  plannerTasks = safeLocalStorageGet('acadhub_planner', []);
  
  // Load reminders setting
  const remindersEnabled = safeLocalStorageGet('reminders_enabled', false);
  const reminderToggle = document.getElementById('reminderToggle');
  if (reminderToggle) reminderToggle.checked = remindersEnabled;
  
  // Render initial views
  renderScheduler();
  renderPlanner();
  renderSavedList();
  renderCalendar();
  updateProviderUI();
  updateSettingsUI();
  initProfileModal();
  
  // Show profile modal if not saved
  if (safeLocalStorageGet('profile_saved') !== 'true') {
    document.getElementById('profileModal').classList.remove('hidden');
  }
  
  console.log('AcadHub initialized successfully');
}

// Call initialization
initializeApp();

// Export functions for global use
window.switchTab = switchTab;
window.showProfileModal = showProfileModal;
window.closeProfileModal = closeProfileModal;
window.saveVisitorName = saveVisitorName;
window.toggleSettingsModal = toggleSettingsModal;
window.closeSettingsModal = closeSettingsModal;
window.toggleTheme = toggleTheme;
window.changeTabPosition = changeTabPosition;
window.updateProviderUI = updateProviderUI;
window.toggleAccuracyInfo = toggleAccuracyInfo;
window.toggleApiKeyVisibility = toggleApiKeyVisibility;
window.updateFileName = updateFileName;
window.updateTestFileName = updateTestFileName;
window.handleGenerate = handleGenerate;
window.saveToLibrary = saveToLibrary;
window.setDifficulty = setDifficulty;
window.startTest = startTest;
window.nextTestQuestion = nextTestQuestion;
window.resetTest = resetTest;
window.showReview = showReview;
window.addOrUpdatePlannerTask = addOrUpdatePlannerTask;
window.editPlannerTask = editPlannerTask;
window.deletePlannerTask = deletePlannerTask;
window.allowDrop = allowDrop;
window.dropPlannerTask = dropPlannerTask;
window.addOrUpdateSchedItem = addOrUpdateSchedItem;
window.editSchedItem = editSchedItem;
window.deleteSchedItem = deleteSchedItem;
window.dropSchedTask = dropSchedTask;
window.changeMonth = changeMonth;
window.toggleReminders = toggleReminders;
window.revealGCash = revealGCash;
window.retryWakeUp = retryWakeUp;
window.handleAuth = handleAuth;
window.toggleAuthMode = toggleAuthMode;
window.logout = logout;
window.closeAuthModal = closeAuthModal;
window.submitEval = submitEval;
window.toggleEvalModal = toggleEvalModal;
window.checkAnswer = checkAnswer;
window.checkMCQAnswer = checkMCQAnswer;
window.revealAnswer = revealAnswer;
window.loadSavedItem = loadSavedItem;
window.deleteSavedItem = deleteSavedItem;

console.log('AcadHub Suite loaded successfully with all features intact.');