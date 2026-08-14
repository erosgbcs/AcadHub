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
let calendarMonth = new Date().getMonth();
let calendarYear = new Date().getFullYear();
let unsubscribers = [];

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

// ============================================================
// WAKE-UP OVERLAY
// ============================================================
async function retryWakeUp() {
  const statusEl = document.getElementById('wakeUpStatus');
  const btn = document.getElementById('retryWakeBtn');
  
  statusEl.textContent = 'Checking backend...';
  btn.disabled = true;
  
  try {
    // Check if Firebase is initialized
    if (firebase.apps.length > 0) {
      // Test Firestore connection
      await db.collection('_health_check').doc('test').set({ 
        timestamp: firebase.firestore.FieldValue.serverTimestamp() 
      });
      
      document.getElementById('wakeUpOverlay').style.display = 'none';
      console.log('Backend is ready!');
    }
  } catch (err) {
    statusEl.textContent = 'Still waking up... Please wait and try again.';
    console.error('Wake-up error:', err);
  } finally {
    btn.disabled = false;
  }
}

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
    // User is logged in - show profile info
    document.getElementById('authModal').classList.remove('hidden');
    document.getElementById('authTitle').textContent = 'Account';
    document.getElementById('authSubtitle').textContent = 'You are logged in as ' + user.email;
    document.getElementById('authEmail').classList.add('hidden');
    document.getElementById('authPassword').classList.add('hidden');
    document.getElementById('authNameFields').classList.add('hidden');
    document.getElementById('authBtnText').textContent = 'Logout';
  } else {
    // User is not logged in - show auth modal
    document.getElementById('authModal').classList.remove('hidden');
    updateAuthUI();
  }
}

function closeProfileModal() {
  document.getElementById('profileModal').classList.add('hidden');
}

function saveVisitorName() {
  const firstName = document.getElementById('visitorFirstName').value.trim();
  const lastName = document.getElementById('visitorLastName').value.trim();
  const agreeTerms = document.getElementById('agreeTerms').checked;
  
  if (!firstName || !lastName) {
    alert('Please enter your first and last name.');
    return;
  }
  
  if (!agreeTerms) {
    alert('Please agree to the privacy terms.');
    return;
  }
  
  // Save to localStorage
  const profile = { firstName, lastName };
  safeLocalStorageSet('profile_name', firstName + ' ' + lastName);
  safeLocalStorageSet('profile_saved', 'true');
  
  // Save to Firestore (if available)
  if (db && auth.currentUser) {
    db.collection('users').doc(auth.currentUser.uid).set({
      firstName,
      lastName,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true }).catch(err => {
      console.error('Error saving profile:', err);
    });
  }
  
  closeProfileModal();
  console.log('Profile saved:', profile);
}

// ============================================================
// SETTINGS MANAGEMENT
// ============================================================
function toggleSettingsModal() {
  const modal = document.getElementById('settingsModal');
  modal.classList.toggle('hidden');
  
  if (!modal.classList.contains('hidden')) {
    // Update UI to reflect current settings
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
  
  safeLocalStorageSet('theme', html.classList.contains('dark') ? 'dark' : 'light');
  updateSettingsUI();
}

function changeTabPosition(position) {
  const mainWrapper = document.getElementById('mainWrapper');
  const tabContainer = document.getElementById('tabContainer');
  
  // Remove existing position classes
  mainWrapper.classList.remove('tab-position-top', 'tab-position-bottom', 'tab-position-left');
  
  // Add new position class
  mainWrapper.classList.add('tab-position-' + position);
  
  safeLocalStorageSet('tab_position', position);
}

function updateSettingsUI() {
  const html = document.documentElement;
  const isDark = html.classList.contains('dark');
  
  // Update theme toggle
  const dot = document.getElementById('settingsThemeDot');
  if (dot) {
    dot.style.left = isDark ? '0.5rem' : '1.5rem';
  }
  
  // Update accent color picker
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
    display.textContent = file.name;
    
    // Check file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      alert('File too large. Maximum size is 10MB.');
      input.value = '';
      display.textContent = 'Drop file or click to browse';
      return;
    }
    
    // Check file type
    const allowedTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'];
    if (!allowedTypes.includes(file.type)) {
      alert('Invalid file type. Please upload PDF, DOCX, or TXT files.');
      input.value = '';
      display.textContent = 'Drop file or click to browse';
    }
  } else {
    display.textContent = 'Drop file or click to browse';
  }
}

function updateTestFileName(input) {
  const file = input.files[0];
  const display = document.getElementById('testFileNameDisplay');
  
  if (file) {
    display.textContent = file.name;
    
    // Check file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      alert('File too large. Maximum size is 10MB.');
      input.value = '';
      display.textContent = 'Drop file or click to browse';
      return;
    }
    
    // Check file type
    const allowedTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'];
    if (!allowedTypes.includes(file.type)) {
      alert('Invalid file type. Please upload PDF, DOCX, or TXT files.');
      input.value = '';
      display.textContent = 'Drop file or click to browse';
    }
  } else {
    display.textContent = 'Drop file or click to browse';
  }
}

// ============================================================
// PLANNER FUNCTIONS
// ============================================================
function renderPlanner() {
  const todoCol = document.getElementById('planner-todo');
  const progressCol = document.getElementById('planner-progress');
  const doneCol = document.getElementById('planner-done');
  
  if (!todoCol || !progressCol || !doneCol) return;
  
  // Clear columns
  todoCol.innerHTML = '';
  progressCol.innerHTML = '';
  doneCol.innerHTML = '';
  
  // Sort by priority
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  plannerTasks.sort((a, b) => (priorityOrder[a.priority] || 1) - (priorityOrder[b.priority] || 1));
  
  // Render tasks
  plannerTasks.forEach(task => {
    const taskElement = createPlannerTaskElement(task);
    const column = task.status === 'done' ? doneCol : task.status === 'progress' ? progressCol : todoCol;
    column.appendChild(taskElement);
  });
  
  // Update column counts
  document.querySelectorAll('.kanban-column').forEach(col => {
    const count = col.querySelector('.column-count');
    if (count) {
      count.textContent = col.querySelectorAll('.task-card').length;
    }
  });
}

function createPlannerTaskElement(task) {
  const div = document.createElement('div');
  div.className = 'task-card bg-white/5 border border-white/10 rounded-lg p-3 cursor-grab';
  div.draggable = true;
  div.dataset.id = task.id;
  
  const priorityClass = task.priority === 'high' ? 'priority-high' : task.priority === 'medium' ? 'priority-medium' : 'priority-low';
  
  div.innerHTML = `
    <div class="flex items-start justify-between gap-2">
      <div class="flex-1">
        <p class="text-sm font-medium">${task.title || 'Untitled'}</p>
        <p class="text-xs opacity-50">${task.deadline || 'No deadline'}</p>
      </div>
      <span class="${priorityClass} text-xs px-2 py-0.5 rounded-full">${task.priority}</span>
    </div>
    <div class="flex items-center justify-between mt-2">
      <span class="category-tag">${task.category || 'study'}</span>
      <div class="flex gap-1">
        <button onclick="editPlannerTask('${task.id}')" class="text-xs opacity-50 hover:opacity-100">
          <i class="fa-solid fa-edit"></i>
        </button>
        <button onclick="deletePlannerTask('${task.id}')" class="text-xs opacity-50 hover:opacity-100">
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
    // Update existing task
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
    // Add new task
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
  
  // Save to localStorage
  safeLocalStorageSet('acadhub_planner', plannerTasks);
  
  // Save to Firestore if logged in
  if (auth.currentUser) {
    const plannerRef = db.collection('users').doc(auth.currentUser.uid).collection('planner');
    if (editId) {
      plannerRef.doc(editId).update({ title, deadline, priority, category });
    } else {
      plannerRef.add({ title, deadline, priority, category, status: 'todo' });
    }
  }
  
  // Clear inputs
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

// ============================================================
// SCHEDULER FUNCTIONS
// ============================================================
function renderScheduler() {
  // Render Kanban
  renderSchedulerKanban();
  // Render Gantt chart
  renderGanttChart();
  // Render countdowns
  renderCountdowns();
  // Render exam matrix
  renderExamMatrix();
  // Render filter chips
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
  
  // Update column counts
  document.querySelectorAll('.kanban-column').forEach(col => {
    const count = col.querySelector('.column-count');
    if (count) {
      count.textContent = col.querySelectorAll('.task-card').length;
    }
  });
}

function createSchedItemElement(item) {
  const div = document.createElement('div');
  div.className = 'task-card bg-white/5 border border-white/10 rounded-lg p-3 cursor-grab';
  div.draggable = true;
  div.dataset.id = item.id;
  
  const priorityClass = item.priority === 'high' ? 'priority-high' : item.priority === 'medium' ? 'priority-medium' : 'priority-low';
  const typeClass = item.type === 'milestone' ? 'type-milestone' : item.type === 'defense' ? 'type-defense' : item.type === 'exam' ? 'type-exam' : 'type-task';
  
  div.innerHTML = `
    <div class="flex items-start justify-between gap-2">
      <div class="flex-1">
        <p class="text-sm font-medium">${item.title || 'Untitled'}</p>
        <p class="text-xs opacity-50">${item.deadline || 'No deadline'}</p>
      </div>
      <span class="${priorityClass} text-xs px-2 py-0.5 rounded-full">${item.priority}</span>
    </div>
    <div class="flex items-center justify-between mt-2">
      <span class="${typeClass} type-badge">${item.type || 'task'}</span>
      <div class="flex gap-1">
        <button onclick="editSchedItem('${item.id}')" class="text-xs opacity-50 hover:opacity-100">
          <i class="fa-solid fa-edit"></i>
        </button>
        <button onclick="deleteSchedItem('${item.id}')" class="text-xs opacity-50 hover:opacity-100">
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
  
  // Sort by deadline
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
    deadlineLabel.textContent = item.deadline;
    
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
        <p class="text-xs opacity-50">${defense.deadline}</p>
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
          <p class="text-xs opacity-50">${exam.deadline}</p>
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
    chip.className = 'filter-chip';
    chip.textContent = type.charAt(0).toUpperCase() + type.slice(1);
    chip.onclick = () => filterSchedItems(type);
    container.appendChild(chip);
  });
}

function filterSchedItems(type) {
  // Update active chip
  document.querySelectorAll('.filter-chip').forEach(chip => {
    chip.classList.remove('active');
  });
  event.target.classList.add('active');
  
  // Filter items
  if (type === 'all') {
    renderSchedulerKanban();
  } else {
    const filtered = schedItems.filter(item => item.type === type);
    // Temporarily replace schedItems for rendering
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
    // Update existing item
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
    // Add new item
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
  
  // Save to localStorage
  safeLocalStorageSet('acadhub_sched', schedItems);
  
  // Save to Firestore if logged in
  if (auth.currentUser) {
    const schedRef = db.collection('users').doc(auth.currentUser.uid).collection('scheduler');
    if (editId) {
      schedRef.doc(editId).update({ title, deadline, type, priority, category });
    } else {
      schedRef.add({ title, deadline, type, priority, category, status: 'todo' });
    }
  }
  
  // Clear inputs
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
  
  // Add day headers
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  days.forEach(day => {
    const header = document.createElement('div');
    header.className = 'calendar-day-header';
    header.textContent = day;
    grid.appendChild(header);
  });
  
  // Add empty cells for days before the 1st
  for (let i = 0; i < firstDay; i++) {
    const empty = document.createElement('div');
    empty.className = 'calendar-day empty';
    grid.appendChild(empty);
  }
  
  // Add days
  const today = new Date();
  for (let day = 1; day <= daysInMonth; day++) {
    const dayCell = document.createElement('div');
    dayCell.className = 'calendar-day';
    dayCell.textContent = day;
    
    // Check if today
    if (day === today.getDate() && calendarMonth === today.getMonth() && calendarYear === today.getFullYear()) {
      dayCell.classList.add('today');
    }
    
    // Check for tasks on this day
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
    
    dayCell.onclick = () => selectDate(day);
    grid.appendChild(dayCell);
  }
}

function selectDate(day) {
  // Remove selected class from all days
  document.querySelectorAll('.calendar-day').forEach(cell => {
    cell.classList.remove('selected');
  });
  
  // Add selected class to clicked day
  event.target.classList.add('selected');
  
  // Show tasks for selected day
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
          <p class="text-xs opacity-50">${item.date || 'No date'}</p>
        </div>
        <div class="flex gap-2">
          <button onclick="loadSavedItem('${index}')" class="text-xs text-indigo-400 hover:text-indigo-300">
            <i class="fa-solid fa-eye mr-1"></i> View
          </button>
          <button onclick="deleteSavedItem('${index}')" class="text-xs text-rose-400 hover:text-rose-300">
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
  
  // Switch to reviewer tab
  switchTab('reviewer');
  
  // Populate results
  document.getElementById('resultsContainer').classList.remove('hidden');
  document.getElementById('summaryList').innerHTML = item.summaryHTML || '';
  document.getElementById('flashcardGrid').innerHTML = item.flashcardsHTML || '';
  document.getElementById('quizContainer').innerHTML = item.quizHTML || '';
}

function deleteSavedItem(index) {
  if (!confirm('Delete this saved reviewer?')) return;
  
  const saved = safeLocalStorageGet('acadhub_saved', []);
  saved.splice(index, 1);
  safeLocalStorageSet('acadhub_saved', saved);
  
  if (auth.currentUser) {
    // Also delete from Firestore if logged in
    const libraryRef = db.collection('users').doc(auth.currentUser.uid).collection('library');
    libraryRef.where('date', '==', saved[index]?.date).get().then(snapshot => {
      snapshot.forEach(doc => doc.ref.delete());
    });
  }
  
  renderSavedList();
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
      
      // Load theme
      if (data.theme) {
        const html = document.documentElement;
        html.classList.remove('dark', 'light');
        html.classList.add(data.theme);
      }
      
      // Load tab position
      if (data.tabPosition) {
        changeTabPosition(data.tabPosition);
      }
      
      // Load accent color
      if (data.accentColor) {
        document.documentElement.style.setProperty('--accent', data.accentColor);
        document.documentElement.style.setProperty('--accent2', data.accentColor);
      }
      
      // Load reminders setting
      if (data.remindersEnabled !== undefined) {
        document.getElementById('reminderToggle').checked = data.remindersEnabled;
      }
    }
  } catch (err) {
    console.error('Error loading settings:', err);
  }
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
  document.getElementById('reminderToggle').checked = remindersEnabled;
  
  // Render initial views
  renderScheduler();
  renderPlanner();
  renderSavedList();
  renderCalendar();
  updateProviderUI();
  updateSettingsUI();
  
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
window.submitEval = submitEval;
window.toggleEvalModal = toggleEvalModal;