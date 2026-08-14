// ============================================================
// SERVER WAKE-UP (auto-retry every 5 seconds)
// ============================================================
let wakeUpPollingInterval = null;

async function pingServer() {
  const overlay = document.getElementById('wakeUpOverlay');
  const statusEl = document.getElementById('wakeUpStatus');
  if (!overlay || !statusEl) return;
  try {
    const res = await fetch('https://acadhub-no6m.onrender.com/api/health', {
      method: 'GET',
      signal: AbortSignal.timeout(6000)
    });
    overlay.style.display = 'none';
    if (wakeUpPollingInterval) {
      clearInterval(wakeUpPollingInterval);
      wakeUpPollingInterval = null;
    }
  } catch (e) {
    statusEl.innerHTML = '<i class="fa-solid fa-hourglass-half mr-1"></i>Not ready yet. Auto-retrying every 5 seconds…';
    if (!wakeUpPollingInterval) {
      wakeUpPollingInterval = setInterval(pingServer, 5000);
    }
  }
}

async function retryWakeUp() {
  if (wakeUpPollingInterval) {
    clearInterval(wakeUpPollingInterval);
    wakeUpPollingInterval = null;
  }
  const statusEl = document.getElementById('wakeUpStatus');
  const btn = document.getElementById('retryWakeBtn');
  btn.disabled = true;
  statusEl.innerHTML = '<i class="fa-solid fa-spinner animate-spin mr-1"></i>Checking server…';
  try {
    const res = await fetch(`${BACKEND_URL}/api/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(6000)
    });
    if (res.ok) {
      document.getElementById('wakeUpOverlay').style.display = 'none';
      return;
    }
  } catch (e) {}
  statusEl.innerHTML = '<i class="fa-solid fa-hourglass-half mr-1"></i>Still waking up… Auto-retrying again.';
  btn.disabled = false;
  if (!wakeUpPollingInterval) {
    wakeUpPollingInterval = setInterval(pingServer, 5000);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  pingServer();
  setTimeout(() => {
    const overlay = document.getElementById('wakeUpOverlay');
    if (overlay && overlay.style.display !== 'none') {
      const statusEl = document.getElementById('wakeUpStatus');
      const btn = document.getElementById('retryWakeBtn');
      if (statusEl) {
        statusEl.innerHTML = '<i class="fa-solid fa-hourglass-half mr-1"></i>Server is still waking up. You can try again or continue anyway.';
        statusEl.style.color = '#fbbf24';
      }
      if (btn) {
        btn.textContent = '⏩ Continue Anyway';
        btn.style.background = '#8b5cf6';
        btn.onclick = function() {
          overlay.style.display = 'none';
          if (wakeUpPollingInterval) {
            clearInterval(wakeUpPollingInterval);
            wakeUpPollingInterval = null;
          }
        };
      }
    }
  }, 30000);
});

// ============================================================
// FIREBASE CONFIG & INIT
// ============================================================
const firebaseConfig = {
  apiKey: "AIzaSyDQA4BN_3jyBWPQGWbYaHhq-aswIP7NvNg",
  authDomain: "acadhub-visitors-69180.firebaseapp.com",
  projectId: "acadhub-visitors-69180",
  storageBucket: "acadhub-visitors-69180.firebasestorage.app",
  messagingSenderId: "292893836149",
  appId: "1:292893836149:web:8345f25b7c68974eaec93c"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();

// ============================================================
// FIRESTORE DATA SYNC HELPERS
// ============================================================
function getUserDocRef(collectionName) {
  const user = auth.currentUser;
  if (!user) return null;
  return db.collection('users').doc(user.uid).collection(collectionName);
}

async function saveToFirestore(collectionName, items, idField = 'id') {
  const user = auth.currentUser;
  if (!user) return false;
  try {
    const colRef = db.collection('users').doc(user.uid).collection(collectionName);
    const batch = db.batch();
    const existingDocs = await colRef.get();
    existingDocs.forEach(doc => batch.delete(doc.ref));
    items.forEach(item => {
      const docId = item[idField] || colRef.doc().id;
      const docRef = colRef.doc(docId);
      batch.set(docRef, item);
    });
    await batch.commit();
    return true;
  } catch (err) {
    console.error(`Error saving to Firestore (${collectionName}):`, err);
    return false;
  }
}

async function loadFromFirestore(collectionName) {
  const user = auth.currentUser;
  if (!user) return [];
  try {
    const colRef = db.collection('users').doc(user.uid).collection(collectionName);
    const snapshot = await colRef.get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (err) {
    console.error(`Error loading from Firestore (${collectionName}):`, err);
    return [];
  }
}

// ============================================================
// GLOBALS
// ============================================================
const BACKEND_URL = "https://acadhub-no6m.onrender.com";
let lastGeneratedData = null;
let isSignUpMode = false;

// Safe localStorage helpers
function safeLocalStorageGet(key, defaultValue) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : defaultValue;
  } catch (e) {
    console.warn(`Error parsing ${key} from localStorage:`, e);
    return defaultValue;
  }
}

function safeLocalStorageSet(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    console.error(`Error saving ${key} to localStorage:`, e);
    return false;
  }
}

let schedItems = safeLocalStorageGet('acadhub_sched', []);
let plannerTasks = safeLocalStorageGet('acadhub_planner', []);
let testDifficulty = 'medium';
let testQuestions = [];
let testCurrentIndex = 0;
let testCorrectCount = 0;
let testTimerInterval = null;
let testTimeLeft = 0;
let draggedSchedId = null;
let draggedPlannerId = null;
let testUserAnswers = [];
let schedulerFilter = 'all';
let calendarMonth = new Date().getMonth();
let calendarYear = new Date().getFullYear();
let selectedDate = null; // string 'YYYY-MM-DD'
let reminderInterval = null;
let notifiedDeadlines = safeLocalStorageGet('acadhub_notified', {});

// ============================================================
// THEME & APPEARANCE
// ============================================================
function applyTheme(theme) {
  const html = document.documentElement;
  const settingsDot = document.getElementById('settingsThemeDot');
  if (theme === 'light') {
    html.classList.remove('dark');
    html.classList.add('light');
    if (settingsDot) settingsDot.style.left = '50%';
  } else {
    html.classList.remove('light');
    html.classList.add('dark');
    if (settingsDot) settingsDot.style.left = '0.5rem';
  }
  const icon = document.getElementById('themeIcon');
  if (icon) {
    if (theme === 'light') {
      icon.classList.remove('fa-sun');
      icon.classList.add('fa-moon');
      icon.style.color = '#6366f1';
    } else {
      icon.classList.remove('fa-moon');
      icon.classList.add('fa-sun');
      icon.style.color = '#facc15';
    }
  }
}

function toggleTheme() {
  const html = document.documentElement;
  const newTheme = html.classList.contains('dark') ? 'light' : 'dark';
  localStorage.setItem('theme', newTheme);
  applyTheme(newTheme);
  saveSettingsToFirestore();
}

function applyAccentColor(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const lighter = `rgb(${Math.min(r + 40, 255)}, ${Math.min(g + 40, 255)}, ${Math.min(b + 40, 255)})`;
  document.documentElement.style.setProperty('--accent', hex);
  document.documentElement.style.setProperty('--accent2', lighter);
  const picker = document.getElementById('accentPicker');
  if (picker && picker.value !== hex) picker.value = hex;
}

async function saveSettingsToFirestore() {
  const user = auth.currentUser;
  if (!user) return;
  const settings = {
    theme: localStorage.getItem('theme') || 'dark',
    accentColor: localStorage.getItem('accentColor') || '#6366f1',
    tabPosition: localStorage.getItem('tabPosition') || 'top',
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  };
  try {
    await db.collection('user_settings').doc(user.uid).set(settings, { merge: true });
  } catch (err) {
    console.error('Error syncing settings:', err);
  }
}

async function loadSettingsFromFirestore(user) {
  try {
    const docRef = db.collection('user_settings').doc(user.uid);
    const doc = await docRef.get();
    if (doc.exists) {
      const data = doc.data();
      if (data.theme) {
        localStorage.setItem('theme', data.theme);
        applyTheme(data.theme);
      }
      if (data.accentColor) {
        localStorage.setItem('accentColor', data.accentColor);
        applyAccentColor(data.accentColor);
      }
      if (data.tabPosition) {
        localStorage.setItem('tabPosition', data.tabPosition);
        changeTabPosition(data.tabPosition);
      }
    }
  } catch (err) {
    console.error('Error loading settings:', err);
  }
}

// Accent color event
(function() {
  const picker = document.getElementById('accentPicker');
  if (!picker) return;
  const saved = localStorage.getItem('accentColor');
  if (saved) applyAccentColor(saved);
  picker.addEventListener('input', function() {
    const color = this.value;
    localStorage.setItem('accentColor', color);
    applyAccentColor(color);
    saveSettingsToFirestore();
  });
})();

// Initial theme from localStorage
(function() {
  const saved = localStorage.getItem('theme') || 'dark';
  applyTheme(saved);
})();

// ============================================================
// SETTINGS MODAL
// ============================================================
function toggleSettingsModal() {
  document.getElementById('settingsModal').classList.toggle('hidden');
}
function closeSettingsModal() {
  document.getElementById('settingsModal').classList.add('hidden');
}

function changeTabPosition(pos) {
  const wrapper = document.getElementById('mainWrapper');
  wrapper.classList.remove('tab-position-top', 'tab-position-bottom', 'tab-position-left');
  wrapper.classList.add('tab-position-' + pos);
  localStorage.setItem('tabPosition', pos);
  const select = document.getElementById('tabPositionSelect');
  if (select && select.value !== pos) select.value = pos;
  saveSettingsToFirestore();
}

(function initTabPosition() {
  const saved = localStorage.getItem('tabPosition') || 'top';
  changeTabPosition(saved);
})();

// ============================================================
// TABS
// ============================================================
function switchTab(tab) {
  // Hide all views
  document.getElementById('viewReviewer').classList.add('hidden');
  document.getElementById('viewLibrary').classList.add('hidden');
  document.getElementById('viewTest').classList.add('hidden');
  document.getElementById('viewPlanner').classList.add('hidden');
  document.getElementById('viewScheduler').classList.add('hidden');
  document.getElementById('viewCalendar').classList.add('hidden'); // <-- new

  // Reset all tab buttons
  ['tabReviewer', 'tabLibrary', 'tabTest', 'tabPlanner', 'tabScheduler', 'tabCalendar'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.classList.remove('tab-active', 'tab-inactive');
      el.classList.add('tab-inactive');
    }
  });

  const map = {
    reviewer: { view: 'viewReviewer', btn: 'tabReviewer' },
    library: { view: 'viewLibrary', btn: 'tabLibrary' },
    test: { view: 'viewTest', btn: 'tabTest' },
    planner: { view: 'viewPlanner', btn: 'tabPlanner' },
    scheduler: { view: 'viewScheduler', btn: 'tabScheduler' },
    calendar: { view: 'viewCalendar', btn: 'tabCalendar' } // <-- new
  };

  const target = map[tab];
  if (!target) return;

  document.getElementById(target.view).classList.remove('hidden');
  const btn = document.getElementById(target.btn);
  if (btn) {
    btn.classList.remove('tab-inactive');
    btn.classList.add('tab-active');
  }

  // Special rendering calls
  if (tab === 'planner') renderPlanner();
  if (tab === 'scheduler') renderScheduler();
  if (tab === 'library') renderSavedList();
  if (tab === 'calendar') renderCalendar(); // <-- new
}

// Event listeners
document.getElementById('tabReviewer').addEventListener('click', () => switchTab('reviewer'));
document.getElementById('tabLibrary').addEventListener('click', () => switchTab('library'));
document.getElementById('tabTest').addEventListener('click', () => switchTab('test'));
document.getElementById('tabPlanner').addEventListener('click', () => switchTab('planner'));
document.getElementById('tabScheduler').addEventListener('click', () => switchTab('scheduler'));
document.getElementById('tabCalendar').addEventListener('click', () => switchTab('calendar')); // <-- new

document.getElementById('tabReviewer').addEventListener('click', () => switchTab('reviewer'));
document.getElementById('tabLibrary').addEventListener('click', () => switchTab('library'));
document.getElementById('tabTest').addEventListener('click', () => switchTab('test'));
document.getElementById('tabPlanner').addEventListener('click', () => switchTab('planner'));
document.getElementById('tabScheduler').addEventListener('click', () => switchTab('scheduler'));
document.getElementById('tabCalendar').addEventListener('click', () => switchTab('calendar'));
// ============================================================
// SCHEDULER (Dev & Thesis)
// ============================================================
function saveSched() {
  safeLocalStorageSet('acadhub_sched', schedItems);
  if (auth.currentUser) {
    saveToFirestore('scheduler', schedItems).catch(err => console.error('Firestore save error:', err));
  }
}

function updateCategoryFromType() {
  const typeSelect = document.getElementById('schedType');
  const categorySelect = document.getElementById('schedCategory');
  if (!typeSelect || !categorySelect) return;
  const type = typeSelect.value;
  let category = 'study';
  if (type.includes('dev')) category = 'development';
  else if (type.includes('thesis')) category = 'thesis';
  else if (type.includes('exam')) category = 'exam';
  categorySelect.value = category;
}

document.addEventListener('DOMContentLoaded', () => {
  const typeSelect = document.getElementById('schedType');
  if (typeSelect) {
    typeSelect.addEventListener('change', updateCategoryFromType);
  }
});

function filterSchedulerTasks(filter) {
  schedulerFilter = filter;
  document.querySelectorAll('.filter-chip').forEach(chip => {
    chip.classList.remove('active');
    if (chip.dataset.filter === filter) {
      chip.classList.add('active');
    }
  });
  renderScheduler();
}

function ensureSchedulerFilterChips() {
  const container = document.querySelector('#viewScheduler .filter-chips');
  if (!container) return;
  if (container.children.length > 0) return;
  const filters = [
    { value: 'all', label: 'All' },
    { value: 'study', label: '📚 Study' },
    { value: 'dev', label: '💻 Dev' },
    { value: 'thesis', label: '🎓 Thesis' },
    { value: 'exam', label: '📝 Exams' }
  ];
  filters.forEach(f => {
    const btn = document.createElement('button');
    btn.className = 'filter-chip' + (f.value === 'all' ? ' active' : '');
    btn.dataset.filter = f.value;
    btn.textContent = f.label;
    btn.onclick = () => filterSchedulerTasks(f.value);
    container.appendChild(btn);
  });
}

function renderScheduler() {
  ensureSchedulerFilterChips();

  const filteredItems = schedItems.filter(item => {
    if (schedulerFilter === 'all') return true;
    const type = item.type || '';
    const category = item.category || '';
    return category === schedulerFilter || type.includes(schedulerFilter);
  });

  ['todo', 'progress', 'done'].forEach(col => {
    const el = document.getElementById('sched-' + col);
    if (!el) return;
    const items = filteredItems.filter(i => i.status === col);
    const header = el.closest('.kanban-column')?.querySelector('.column-header .column-count');
    if (header) header.textContent = items.length;
    if (items.length === 0) {
      el.innerHTML = '<p class="text-xs opacity-30 text-center py-4"><i class="fa-solid fa-inbox text-2xl mb-2"></i><br>Empty</p>';
      return;
    }
    el.innerHTML = items.map(i => {
      const priorityClass = `priority-${i.priority || 'medium'}`;
      const overdue = i.deadline && new Date(i.deadline) < new Date() && i.status !== 'done' ? 'overdue' : '';
      return `
        <div class="bg-white/5 border border-white/10 p-3 rounded-lg cursor-grab ${overdue} transition hover:bg-white/10" draggable="true" ondragstart="dragSchedTask(event, '${i.id}')" ondragend="this.classList.remove('dragging')">
          <div class="flex items-center justify-between">
            <p class="text-sm font-semibold">${i.title}</p>
            <div class="flex items-center gap-1">
              <button onclick="editSchedItem('${i.id}')" data-tooltip="Edit" class="text-xs text-blue-400 hover:text-blue-300 btn-hover"><i class="fa-solid fa-pen"></i></button>
              <button onclick="deleteSchedItem('${i.id}')" data-tooltip="Delete" class="text-xs text-rose-400 hover:text-rose-300 btn-hover"><i class="fa-solid fa-trash"></i></button>
            </div>
          </div>
          ${i.deadline ? `<p class="text-xs opacity-50 mt-1"><i class="fa-regular fa-clock mr-1"></i>${i.deadline}</p>` : ''}
          <div class="flex items-center gap-2 mt-2">
            <span class="text-[10px] px-2 py-0.5 rounded-full bg-white/10">${i.type || 'task'}</span>
            <span class="text-[10px] px-2 py-0.5 rounded-full ${priorityClass}">${i.priority || 'medium'}</span>
            ${i.category ? `<span class="category-tag">${i.category}</span>` : ''}
          </div>
          <div class="progress-bar mt-2"><div class="progress-fill" style="width:${i.progress || 0}%"></div></div>
        </div>`;
    }).join('');
  });

  // Gantt chart (with guards for i.type)
  const gantt = document.getElementById('ganttChart');
  if (gantt) {
    const items = filteredItems.filter(i => i.deadline).sort((a, b) => new Date(a.deadline) - new Date(b.deadline));
    if (items.length === 0) {
      gantt.innerHTML = '<p class="text-xs opacity-50 text-center py-8">Add tasks with deadlines to see your roadmap</p>';
    } else {
      gantt.innerHTML = '<div class="space-y-2">' + items.map(i => {
        let dotColor = i.dotColor;
        if (!dotColor) {
          if (i.type && i.type.includes('defense')) dotColor = '#f87171';
          else if (i.type && i.type.includes('milestone')) dotColor = '#fbbf24';
          else if (i.type && i.type.includes('exam')) dotColor = '#22d3ee';
          else if (i.type && i.type.includes('dev')) dotColor = '#a78bfa';
          else if (i.type && i.type.includes('thesis')) dotColor = '#f472b6';
          else dotColor = '#60a5fa';
        }
        let typeBadgeClass = 'type-task';
        if (i.type && i.type.includes('milestone')) typeBadgeClass = 'type-milestone';
        else if (i.type && i.type.includes('defense')) typeBadgeClass = 'type-defense';
        else if (i.type && i.type.includes('exam')) typeBadgeClass = 'type-exam';
        
        return `
          <div class="flex items-center gap-3 p-2 bg-white/5 rounded-lg">
            <button onclick="editDotColor('${i.id}')" class="w-5 h-5 rounded-full cursor-pointer border-2 border-white/20 hover:scale-110 transition transform" style="background-color:${dotColor};" title="Click to change color"></button>
            <span class="text-sm flex-1 truncate">${i.title}</span>
            <span class="type-badge ${typeBadgeClass}">${i.type || 'task'}</span>
            <span class="text-xs opacity-70">${i.deadline}</span>
          </div>`;
      }).join('') + '</div>';
    }
  }

  // Countdowns
  const countdowns = document.getElementById('countdowns');
  if (countdowns) {
    const defenses = filteredItems.filter(i => i.type === 'defense' && i.deadline);
    if (defenses.length === 0) {
      countdowns.innerHTML = '<p class="text-xs opacity-50 text-center py-4">No defense dates set</p>';
    } else {
      countdowns.innerHTML = defenses.map(d => {
        const diff = new Date(d.deadline) - new Date();
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const overdue = days < 0;
        const percent = overdue ? 100 : Math.min(100, Math.round((days / 365) * 100));
        return `
          <div class="flex items-center justify-between p-2 bg-white/5 rounded-lg mb-2">
            <span class="text-sm">${d.title}</span>
            <div class="flex items-center gap-2">
              <div class="circular-countdown" style="--percent:${percent}">
                <div class="inner">${days}d</div>
              </div>
              <span class="text-sm font-bold ${overdue ? 'text-rose-400' : 'text-emerald-400'}">
                ${overdue ? 'Passed' : `${days}d ${hours}h`}
              </span>
            </div>
          </div>`;
      }).join('');
    }
  }

  // Exam matrix
  const examMatrix = document.getElementById('examMatrix');
  if (examMatrix) {
    const exams = filteredItems.filter(i => i.type === 'exam' && i.deadline);
    if (exams.length === 0) {
      examMatrix.innerHTML = '<p class="text-xs opacity-50 text-center py-4">No exams scheduled</p>';
    } else {
      examMatrix.innerHTML = exams.map(e => {
        const daysLeft = Math.ceil((new Date(e.deadline) - new Date()) / (1000 * 60 * 60 * 24));
        const urgency = daysLeft <= 3 ? 'bg-rose-500/20 text-rose-400' : daysLeft <= 7 ? 'bg-amber-500/20 text-amber-400' : 'bg-emerald-500/20 text-emerald-400';
        return `<div class="flex items-center justify-between p-2 bg-white/5 rounded-lg mb-2">
          <span class="text-sm">${e.title}</span>
          <span class="text-xs px-2 py-0.5 rounded-full ${urgency}">${daysLeft > 0 ? daysLeft + 'd' : 'Today'}</span>
        </div>`;
      }).join('');
    }
  }
}

function addOrUpdateSchedItem() {
  const titleInput = document.getElementById('schedTitle');
  if (!titleInput) {
    alert('Scheduler title input not found.');
    return;
  }
  const title = titleInput.value.trim();
  if (!title) {
    alert('Please enter a title.');
    return;
  }

  const editIdInput = document.getElementById('editSchedId');
  const editId = editIdInput ? editIdInput.value : '';

  const deadlineInput = document.getElementById('schedDeadline');
  const typeInput = document.getElementById('schedType');
  const priorityInput = document.getElementById('schedPriority');
  const categoryInput = document.getElementById('schedCategory');

  let category = 'study';
  if (categoryInput) {
    category = categoryInput.value;
  } else if (typeInput) {
    const type = typeInput.value;
    if (type.includes('dev')) category = 'development';
    else if (type.includes('thesis')) category = 'thesis';
    else if (type.includes('exam')) category = 'exam';
  }

  const newItem = {
    id: editId || Date.now().toString(),
    title,
    deadline: deadlineInput ? deadlineInput.value : '',
    type: typeInput ? typeInput.value : 'task',
    priority: priorityInput ? priorityInput.value : 'medium',
    category: category,
    dotColor: '#6366f1',
    status: 'todo',
    progress: 0
  };

  if (editId) {
    const index = schedItems.findIndex(i => i.id === editId);
    if (index !== -1) {
      newItem.status = schedItems[index].status;
      newItem.progress = schedItems[index].progress;
      schedItems[index] = newItem;
    }
  } else {
    schedItems.push(newItem);
  }

  if (titleInput) titleInput.value = '';
  if (deadlineInput) deadlineInput.value = '';
  if (editIdInput) editIdInput.value = '';
  if (categoryInput) categoryInput.value = 'study';
  const addBtn = document.getElementById('schedAddBtn');
  if (addBtn) addBtn.innerHTML = '<i class="fa-solid fa-plus mr-1"></i> Add';

  saveSched();
  renderScheduler();
}

function editSchedItem(id) {
  const item = schedItems.find(i => i.id === id);
  if (!item) return;
  document.getElementById('schedTitle').value = item.title;
  document.getElementById('schedDeadline').value = item.deadline || '';
  document.getElementById('schedType').value = item.type;
  document.getElementById('schedPriority').value = item.priority || 'medium';
  const categoryInput = document.getElementById('schedCategory');
  if (categoryInput) {
    categoryInput.value = item.category || 'study';
  }
  document.getElementById('editSchedId').value = id;
  document.getElementById('schedAddBtn').innerHTML = '<i class="fa-solid fa-check mr-1"></i> Update';
}

function editDotColor(id) {
  const item = schedItems.find(i => i.id === id);
  if (!item) return;

  const existingPopup = document.querySelector('.dot-color-popup');
  if (existingPopup) existingPopup.remove();

  const popup = document.createElement('div');
  popup.className = 'dot-color-popup fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm';
  popup.innerHTML = `
    <div class="glass-card p-6 text-center">
      <h4 class="text-sm font-semibold mb-3">Change Dot Color</h4>
      <input type="color" id="dotColorPicker" value="${item.dotColor || '#6366f1'}" class="w-20 h-12 mx-auto mb-3 cursor-pointer" />
      <div class="flex justify-center gap-2">
        <button class="btn-primary px-4 py-2 text-sm" onclick="saveDotColor('${id}')">Save</button>
        <button class="px-4 py-2 text-sm bg-white/10 hover:bg-white/20 rounded-lg" onclick="closeDotColorPopup()">Cancel</button>
      </div>
    </div>`;
  document.body.appendChild(popup);
}

function saveDotColor(id) {
  const colorInput = document.getElementById('dotColorPicker');
  if (!colorInput) return;
  const newColor = colorInput.value;
  const item = schedItems.find(i => i.id === id);
  if (item) {
    item.dotColor = newColor;
    saveSched();
    renderScheduler();
  }
  closeDotColorPopup();
}

function closeDotColorPopup() {
  const popup = document.querySelector('.dot-color-popup');
  if (popup) popup.remove();
}

function deleteSchedItem(id) {
  if (confirm('Delete this task?')) {
    schedItems = schedItems.filter(i => i.id !== id);
    saveSched();
    renderScheduler();
  }
}

function dragSchedTask(e, id) {
  draggedSchedId = id;
  e.target.closest('.cursor-grab')?.classList.add('dragging');
}

function dropSchedTask(e, newStatus) {
  e.preventDefault();
  const item = schedItems.find(i => i.id === draggedSchedId);
  if (item) {
    item.status = newStatus;
    if (newStatus === 'done') item.progress = 100;
    saveSched();
    renderScheduler();
  }
  draggedSchedId = null;
  document.querySelectorAll('.kanban-column').forEach(col => col.classList.remove('drag-over'));
  document.querySelectorAll('.dragging').forEach(el => el.classList.remove('dragging'));
}

document.addEventListener('dragover', (e) => {
  const column = e.target.closest('.kanban-column');
  if (column) column.classList.add('drag-over');
});
document.addEventListener('dragleave', (e) => {
  const column = e.target.closest('.kanban-column');
  if (column) column.classList.remove('drag-over');
});

// ============================================================
// PLANNER
// ============================================================
function savePlanner() {
  safeLocalStorageSet('acadhub_planner', plannerTasks);
  if (auth.currentUser) {
    saveToFirestore('planner', plannerTasks).catch(err => console.error('Firestore save error:', err));
  }
}

function renderPlanner() {
  ['todo', 'progress', 'done'].forEach(col => {
    const el = document.getElementById('planner-' + col);
    if (!el) return;
    const items = plannerTasks.filter(i => i.status === col);
    const header = el.closest('.kanban-column')?.querySelector('.column-header .column-count');
    if (header) header.textContent = items.length;
    if (items.length === 0) {
      el.innerHTML = '<p class="text-xs opacity-30 text-center py-4"><i class="fa-solid fa-inbox text-2xl mb-2"></i><br>Empty</p>';
      return;
    }
    el.innerHTML = items.map(i => {
      const priorityClass = `priority-${i.priority || 'medium'}`;
      const overdue = i.deadline && new Date(i.deadline) < new Date() && i.status !== 'done' ? 'overdue' : '';
      return `
        <div class="bg-white/5 border border-white/10 p-3 rounded-lg cursor-grab ${overdue} transition hover:bg-white/10" draggable="true" ondragstart="dragPlannerTask(event, '${i.id}')" ondragend="this.classList.remove('dragging')">
          <div class="flex items-center justify-between">
            <p class="text-sm font-semibold">${i.title}</p>
            <div class="flex items-center gap-1">
              <button onclick="editPlannerTask('${i.id}')" data-tooltip="Edit" class="text-xs text-blue-400 hover:text-blue-300 btn-hover"><i class="fa-solid fa-pen"></i></button>
              <button onclick="deletePlannerTask('${i.id}')" data-tooltip="Delete" class="text-xs text-rose-400 hover:text-rose-300 btn-hover"><i class="fa-solid fa-trash"></i></button>
            </div>
          </div>
          ${i.deadline ? `<p class="text-xs opacity-50 mt-1"><i class="fa-regular fa-clock mr-1"></i>${i.deadline}</p>` : ''}
          <div class="flex items-center gap-2 mt-2">
            <span class="text-[10px] px-2 py-0.5 rounded-full ${priorityClass}">${i.priority || 'medium'}</span>
            ${i.category ? `<span class="category-tag">${i.category}</span>` : ''}
          </div>
        </div>`;
    }).join('');
  });
}

function addOrUpdatePlannerTask() {
  const title = document.getElementById('plannerTitle').value.trim();
  if (!title) { alert('Please enter a title.'); return; }
  const editId = document.getElementById('editPlannerId').value;
  const newItem = {
    id: editId || Date.now().toString(),
    title,
    deadline: document.getElementById('plannerDeadline').value,
    priority: document.getElementById('plannerPriority').value,
    category: document.getElementById('plannerCategory').value,
    status: 'todo'
  };
  if (editId) {
    const index = plannerTasks.findIndex(i => i.id === editId);
    if (index !== -1) {
      newItem.status = plannerTasks[index].status;
      plannerTasks[index] = newItem;
    }
  } else {
    plannerTasks.push(newItem);
  }
  document.getElementById('plannerTitle').value = '';
  document.getElementById('plannerDeadline').value = '';
  document.getElementById('editPlannerId').value = '';
  document.getElementById('plannerAddBtn').innerHTML = '<i class="fa-solid fa-plus mr-1"></i> Add';
  savePlanner();
  renderPlanner();
}

function editPlannerTask(id) {
  const item = plannerTasks.find(i => i.id === id);
  if (!item) return;
  document.getElementById('plannerTitle').value = item.title;
  document.getElementById('plannerDeadline').value = item.deadline || '';
  document.getElementById('plannerPriority').value = item.priority || 'medium';
  document.getElementById('plannerCategory').value = item.category || 'study';
  document.getElementById('editPlannerId').value = id;
  document.getElementById('plannerAddBtn').innerHTML = '<i class="fa-solid fa-check mr-1"></i> Update';
}

function deletePlannerTask(id) {
  if (confirm('Delete this task?')) {
    plannerTasks = plannerTasks.filter(i => i.id !== id);
    savePlanner();
    renderPlanner();
  }
}

function dragPlannerTask(e, id) {
  draggedPlannerId = id;
  e.target.closest('.cursor-grab')?.classList.add('dragging');
}

function dropPlannerTask(e, newStatus) {
  e.preventDefault();
  const item = plannerTasks.find(i => i.id === draggedPlannerId);
  if (item) {
    item.status = newStatus;
    savePlanner();
    renderPlanner();
  }
  draggedPlannerId = null;
  document.querySelectorAll('.kanban-column').forEach(col => col.classList.remove('drag-over'));
  document.querySelectorAll('.dragging').forEach(el => el.classList.remove('dragging'));
}

function allowDrop(e) {
  e.preventDefault();
}

// ============================================================
// TEST MY LIMITS (reconstructed)
// ============================================================
function setDifficulty(difficulty) {
  testDifficulty = difficulty;
  const easy = document.getElementById('diffEasy');
  const medium = document.getElementById('diffMedium');
  const hard = document.getElementById('diffHard');
  [easy, medium, hard].forEach(btn => {
    btn.classList.remove('bg-indigo-600', 'text-white');
    btn.classList.add('bg-white/10');
  });
  const selected = document.getElementById('diff' + difficulty.charAt(0).toUpperCase() + difficulty.slice(1));
  if (selected) {
    selected.classList.remove('bg-white/10');
    selected.classList.add('bg-indigo-600', 'text-white');
  }
}

async function startTest() {
  const notes = document.getElementById('testNotes').value.trim();
  const fileInput = document.getElementById('testFileInput');
  const useInternet = document.getElementById('useTestInternet').checked;
  if (!notes && !fileInput.files[0]) {
    alert('Please provide notes or upload a document.');
    return;
  }

  const btn = document.getElementById('startTestBtn');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner animate-spin mr-2"></i>Generating...';

  const formData = new FormData();
  formData.append('notes', notes);
  formData.append('difficulty', testDifficulty);
  formData.append('use_internet', useInternet);
  if (fileInput.files[0]) formData.append('file', fileInput.files[0]);

  try {
    const res = await fetch(`${BACKEND_URL}/api/generate-test`, {
      method: 'POST',
      body: formData
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Test generation failed');
    testQuestions = data.questions || [];
    testCurrentIndex = 0;
    testCorrectCount = 0;
    testUserAnswers = [];
    if (testQuestions.length === 0) {
      alert('No questions generated. Please try again.');
      return;
    }
    document.getElementById('testQuizContainer').classList.remove('hidden');
    document.getElementById('testResultsContainer').classList.add('hidden');
    document.getElementById('reviewContainer').classList.add('hidden');
    displayTestQuestion();
  } catch (err) {
    alert('Error: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-play mr-2"></i>Start Test';
  }
}

function displayTestQuestion() {
  const q = testQuestions[testCurrentIndex];
  document.getElementById('questionCounter').textContent = `Question ${testCurrentIndex + 1} / ${testQuestions.length}`;
  document.getElementById('testQuestionText').textContent = q.question;
  const optionsContainer = document.getElementById('testOptionsContainer');
  optionsContainer.innerHTML = '';

  // ✅ Reset the Next button to its normal state
  const nextBtn = document.getElementById('nextTestBtn');
  nextBtn.innerHTML = 'Next <i class="fa-solid fa-arrow-right ml-2"></i>';
  nextBtn.classList.add('hidden');

  if (q.options && q.options.length) {
    q.options.forEach((opt, idx) => {
      const btn = document.createElement('button');
      btn.className = 'quiz-option w-full text-left p-3 rounded-lg bg-white/5 text-sm border border-white/10 mt-1 hover:bg-indigo-500/10 transition';
      btn.innerHTML = `<span class="w-6 h-6 rounded-full bg-white/10 inline-flex items-center justify-center text-xs font-bold mr-2">${String.fromCharCode(65 + idx)}</span>${opt}`;
      btn.onclick = () => answerTestQuestion(btn, opt, q.answer);
      optionsContainer.appendChild(btn);
    });
  } else {
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Type your answer...';
    input.className = 'w-full p-3 bg-white/5 border border-white/10 rounded-lg text-sm';
    input.id = 'testTextAnswer';
    optionsContainer.appendChild(input);
    const submitBtn = document.createElement('button');
    submitBtn.className = 'btn-primary mt-2';
    submitBtn.textContent = 'Submit Answer';
    submitBtn.onclick = () => {
      const userAnswer = input.value.trim();
      answerTestQuestion(null, userAnswer, q.answer);
    };
    optionsContainer.appendChild(submitBtn);
  }

  document.getElementById('nextTestBtn').classList.add('hidden');
  document.getElementById('timerDisplay').classList.add('hidden');
  // Timer for medium/hard
  if (testDifficulty !== 'easy') {
    testTimeLeft = testDifficulty === 'medium' ? 20 : 15;
    document.getElementById('timerDisplay').classList.remove('hidden');
    updateTimerDisplay();
    clearInterval(testTimerInterval);
    testTimerInterval = setInterval(() => {
      testTimeLeft--;
      updateTimerDisplay();
      if (testTimeLeft <= 0) {
        clearInterval(testTimerInterval);
        answerTestQuestion(null, '', q.answer);
      }
    }, 1000);
  }
}

function answerTestQuestion(btn, userAnswer, correctAnswer) {
  clearInterval(testTimerInterval);
  const isCorrect = userAnswer.trim().toLowerCase() === String(correctAnswer).trim().toLowerCase();
  if (isCorrect) testCorrectCount++;
  testUserAnswers.push({
    question: testQuestions[testCurrentIndex].question,
    userAnswer,
    correctAnswer,
    isCorrect
  });
  // Highlight if multiple choice
  if (btn) {
    Array.from(btn.parentElement.children).forEach(child => {
      child.disabled = true;
      if (child === btn) {
        child.classList.add(isCorrect ? 'bg-emerald-500/20' : 'bg-rose-500/20');
      }
    });
  }
  document.getElementById('nextTestBtn').classList.remove('hidden');
  if (testCurrentIndex === testQuestions.length - 1) {
    // ✅ Use innerHTML to render the icon properly
    document.getElementById('nextTestBtn').innerHTML = 'Finish <i class="fa-solid fa-flag-checkered ml-2"></i>';
  }
}

function updateTimerDisplay() {
  const timerEl = document.getElementById('timerDisplay');
  if (timerEl) timerEl.textContent = `⏱ ${testTimeLeft}s`;
}

function answerTestQuestion(btn, userAnswer, correctAnswer) {
  clearInterval(testTimerInterval);
  const isCorrect = userAnswer.trim().toLowerCase() === String(correctAnswer).trim().toLowerCase();
  if (isCorrect) testCorrectCount++;
  testUserAnswers.push({
    question: testQuestions[testCurrentIndex].question,
    userAnswer,
    correctAnswer,
    isCorrect
  });
  // Highlight if multiple choice
  if (btn) {
    Array.from(btn.parentElement.children).forEach(child => {
      child.disabled = true;
      if (child === btn) {
        child.classList.add(isCorrect ? 'bg-emerald-500/20' : 'bg-rose-500/20');
      }
    });
  }
  document.getElementById('nextTestBtn').classList.remove('hidden');
  if (testCurrentIndex === testQuestions.length - 1) {
document.getElementById('nextTestBtn').innerHTML = 'Finish <i class="fa-solid fa-flag-checkered ml-2"></i>';  }
}

function nextTestQuestion() {
  testCurrentIndex++;
  if (testCurrentIndex >= testQuestions.length) {
    finishTest();
  } else {
    displayTestQuestion();
  }
}

function finishTest() {
  clearInterval(testTimerInterval);
  document.getElementById('testQuizContainer').classList.add('hidden');
  document.getElementById('testResultsContainer').classList.remove('hidden');
  document.getElementById('testCorrectCount').textContent = testCorrectCount;
  document.getElementById('testTotalCount').textContent = testQuestions.length;
  const percent = Math.round((testCorrectCount / testQuestions.length) * 100);
  document.getElementById('testPercentage').textContent = `${percent}%`;
  document.getElementById('reviewBtn').classList.remove('hidden');
}

function resetTest() {
  testQuestions = [];
  testCurrentIndex = 0;
  testCorrectCount = 0;
  testUserAnswers = [];
  clearInterval(testTimerInterval);
  document.getElementById('testQuizContainer').classList.add('hidden');
  document.getElementById('testResultsContainer').classList.add('hidden');
  document.getElementById('reviewContainer').classList.add('hidden');
  document.getElementById('startTestBtn').disabled = false;
  document.getElementById('startTestBtn').innerHTML = '<i class="fa-solid fa-play mr-2"></i>Start Test';
}

function showReview() {
  const container = document.getElementById('reviewContainer');
  container.classList.remove('hidden');
  container.innerHTML = testUserAnswers.map((ans, idx) => `
    <div class="review-item ${ans.isCorrect ? 'correct' : 'incorrect'}">
      <p class="text-sm font-semibold">${idx + 1}. ${ans.question}</p>
      <p class="text-xs mt-1">Your answer: <span class="font-bold">${ans.userAnswer || '(empty)'}</span></p>
      <p class="text-xs">Correct answer: <span class="font-bold">${ans.correctAnswer}</span></p>
    </div>
  `).join('');
}

// ============================================================
// AI PROVIDER UI
// ============================================================
function updateProviderUI() {
  const provider = document.getElementById('aiProvider').value;
  const box = document.getElementById('apiKeyContainer');
  const input = document.getElementById('apiKey');
  if (provider === 'local') {
    box.style.display = 'none';
    input.required = false;
  } else {
    box.style.display = 'block';
    input.required = true;
  }
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

function toggleAccuracyInfo() {
  document.getElementById('accuracyInfo').classList.toggle('hidden');
}

function updateFileName(input) {
  const nameDisplay = document.getElementById('fileNameDisplay');
  if (input.files && input.files[0]) {
    nameDisplay.innerHTML = `<span class="text-indigo-400 font-semibold">${input.files[0].name}</span> <span class="opacity-50 text-xs">(${(input.files[0].size / 1024).toFixed(1)} KB)</span>`;
    nameDisplay.parentElement.classList.add('border-indigo-500/50', 'bg-indigo-500/5');
  } else {
    nameDisplay.textContent = 'Drop file or click to browse';
    nameDisplay.parentElement.classList.remove('border-indigo-500/50', 'bg-indigo-500/5');
  }
}

function updateTestFileName(input) {
  const nameDisplay = document.getElementById('testFileNameDisplay');
  if (input.files && input.files[0]) {
    nameDisplay.innerHTML = `<span class="text-indigo-400 font-semibold">${input.files[0].name}</span> <span class="opacity-50 text-xs">(${(input.files[0].size / 1024).toFixed(1)} KB)</span>`;
    nameDisplay.parentElement.classList.add('border-indigo-500/50', 'bg-indigo-500/5');
  } else {
    nameDisplay.textContent = 'Drop file or click to browse';
    nameDisplay.parentElement.classList.remove('border-indigo-500/50', 'bg-indigo-500/5');
  }
}
// ============================================================
// CALENDAR & DEADLINE REMINDERS
// ============================================================
function getTasksForDate(dateStr) {
  const tasks = [];
  // Combine plannerTasks and schedItems
  plannerTasks.forEach(t => {
    if (t.deadline === dateStr) {
      tasks.push({ ...t, source: 'planner' });
    }
  });
  schedItems.forEach(t => {
    if (t.deadline === dateStr) {
      tasks.push({ ...t, source: 'scheduler' });
    }
  });
  return tasks;
}

function renderCalendar() {
  const grid = document.getElementById('calendarGrid');
  const label = document.getElementById('calendarMonthLabel');
  if (!grid || !label) return;

  // Month label
  const monthName = new Date(calendarYear, calendarMonth, 1).toLocaleString('default', { month: 'long' });
  label.textContent = `${monthName} ${calendarYear}`;

  // Clear grid
  grid.innerHTML = '';

  // Weekday headers
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  weekdays.forEach(d => {
    const header = document.createElement('div');
    header.className = 'calendar-day-header';
    header.textContent = d;
    grid.appendChild(header);
  });

  // Calculate days
  const firstDay = new Date(calendarYear, calendarMonth, 1).getDay();
  const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();

  // Empty cells before first day
  for (let i = 0; i < firstDay; i++) {
    const empty = document.createElement('div');
    empty.className = 'calendar-day empty';
    grid.appendChild(empty);
  }

  const todayStr = new Date().toISOString().split('T')[0];

  // Day cells
  for (let day = 1; day <= daysInMonth; day++) {
    const dateObj = new Date(calendarYear, calendarMonth, day);
    const dateStr = dateObj.toISOString().split('T')[0]; // beware timezone; better use local date formatting
    // Use local date string to avoid timezone shift:
    const localDateStr = `${calendarYear}-${String(calendarMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    const cell = document.createElement('div');
    cell.className = 'calendar-day';
    cell.dataset.date = localDateStr;
    cell.textContent = day;

    if (localDateStr === todayStr) {
      cell.classList.add('today');
    }
    if (selectedDate === localDateStr) {
      cell.classList.add('selected');
    }

    // Check tasks for this date
    const tasks = getTasksForDate(localDateStr);
    if (tasks.length > 0) {
      const dot = document.createElement('span');
      dot.className = 'task-dot' + (tasks.length > 1 ? ' multiple' : '');
      cell.appendChild(dot);
      if (tasks.length > 1) {
        const count = document.createElement('span');
        count.className = 'task-count';
        count.textContent = tasks.length;
        cell.appendChild(count);
      }
    }

    cell.addEventListener('click', () => selectDate(localDateStr));
    grid.appendChild(cell);
  }
}

function selectDate(dateStr) {
  selectedDate = dateStr;
  renderCalendar();
  showTasksForDate(dateStr);
}

function showTasksForDate(dateStr) {
  const container = document.getElementById('selectedDayTasks');
  if (!container) return;
  const tasks = getTasksForDate(dateStr);
  if (tasks.length === 0) {
    container.innerHTML = `<p class="text-sm opacity-50">No tasks on ${dateStr}.</p>`;
    return;
  }
  container.innerHTML = tasks.map(t => {
    const priorityClass = `priority-${t.priority || 'medium'}`;
    const badge = t.source === 'planner' ? '📚 Study Planner' : '🗓️ Scheduler';
    return `
      <div class="flex items-start justify-between p-2 mb-2 bg-white/5 rounded-lg">
        <div>
          <p class="text-sm font-semibold">${t.title}</p>
          <p class="text-xs opacity-60">${badge} · ${t.deadline}</p>
        </div>
        <span class="text-[10px] px-2 py-0.5 rounded-full ${priorityClass}">${t.priority || 'medium'}</span>
      </div>`;
  }).join('');
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
  selectedDate = null;
  renderCalendar();
  document.getElementById('selectedDayTasks').innerHTML = '<p class="text-sm opacity-50">Select a date to see tasks.</p>';
}

// ============================================================
// DEADLINE REMINDERS
// ============================================================
function toggleReminders() {
  const enabled = document.getElementById('reminderToggle').checked;
  localStorage.setItem('acadhub_reminders', enabled ? 'true' : 'false');
  if (enabled) {
    requestNotificationPermission();
    checkDeadlines(); // run immediately
    startReminderInterval();
  } else {
    stopReminderInterval();
  }
}

function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

function startReminderInterval() {
  stopReminderInterval();
  reminderInterval = setInterval(checkDeadlines, 30 * 60 * 1000); // every 30 minutes
}

function stopReminderInterval() {
  if (reminderInterval) {
    clearInterval(reminderInterval);
    reminderInterval = null;
  }
}

function checkDeadlines() {
  const enabled = localStorage.getItem('acadhub_reminders') === 'true';
  if (!enabled) return;

  const now = new Date();
  const upcomingThresholds = [1, 3, 7]; // days before
  const allTasks = [
    ...plannerTasks.map(t => ({ ...t, source: 'Planner' })),
    ...schedItems.map(t => ({ ...t, source: 'Scheduler' }))
  ];

  allTasks.forEach(task => {
    if (!task.deadline) return;
    const deadline = new Date(task.deadline + 'T00:00:00');
    const diffTime = deadline - now;
    if (diffTime <= 0) return; // past deadline

    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    if (!upcomingThresholds.includes(diffDays)) return;

    // Unique key to avoid duplicate notifications
    const notifKey = `${task.id}-${task.deadline}-${diffDays}`;
    if (notifiedDeadlines[notifKey]) return;

    // Mark as notified
    notifiedDeadlines[notifKey] = true;
    safeLocalStorageSet('acadhub_notified', notifiedDeadlines);

    const message = `📅 ${task.title} (${task.source}) is due in ${diffDays} day${diffDays > 1 ? 's' : ''}.`;
    showNotification(message);
  });
}

function showNotification(message) {
  // Browser notification
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification('AcadHub Reminder', { body: message });
  }
  // In-app toast (optional)
  const toast = document.createElement('div');
  toast.className = 'fixed bottom-4 right-4 bg-indigo-600 text-white px-4 py-3 rounded-xl shadow-lg z-50 fade-in';
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 5000);
}

// Initialise calendar and reminders on page load
document.addEventListener('DOMContentLoaded', () => {
  renderCalendar();
  const remindersEnabled = localStorage.getItem('acadhub_reminders') === 'true';
  if (remindersEnabled) {
    document.getElementById('reminderToggle').checked = true;
    requestNotificationPermission();
    checkDeadlines();
    startReminderInterval();
  }
});
// ============================================================
// GENERATE REVIEWER
// ============================================================
async function handleGenerate() {
  const btn = document.getElementById('submitBtn');
  const btnContent = document.getElementById('btnContent');
  const provider = document.getElementById('aiProvider').value;
  const apiKey = document.getElementById('apiKey').value;
  const notes = document.getElementById('studyNotes').value;
  const fileInput = document.getElementById('fileInput');
  const numFlashcards = document.getElementById('numFlashcards').value || 10;
  const useInternet = document.getElementById('useInternet').checked;
  const quizTypes = {};

  if (document.getElementById('useTrueFalse').checked) quizTypes.truefalse = parseInt(document.getElementById('numTrueFalse').value) || 0;
  if (document.getElementById('useIdentification').checked) quizTypes.identification = parseInt(document.getElementById('numIdentification').value) || 0;
  if (document.getElementById('useEnumeration').checked) quizTypes.enumeration = parseInt(document.getElementById('numEnumeration').value) || 0;
  if (document.getElementById('useMultipleChoice').checked) quizTypes.multiplechoice = parseInt(document.getElementById('numMultipleChoice').value) || 0;
  if (document.getElementById('useWhat').checked) quizTypes.what = parseInt(document.getElementById('numWhat').value) || 0;
  if (document.getElementById('useWho').checked) quizTypes.who = parseInt(document.getElementById('numWho').value) || 0;
  if (document.getElementById('useWhere').checked) quizTypes.where = parseInt(document.getElementById('numWhere').value) || 0;
  if (document.getElementById('useWhen').checked) quizTypes.when = parseInt(document.getElementById('numWhen').value) || 0;

  if (provider !== 'local' && !apiKey.trim()) {
    alert('Please enter your API key');
    return;
  }

  btn.disabled = true;
  btnContent.innerHTML = '<i class="fa-solid fa-spinner animate-spin mr-2"></i>Processing...';
  document.getElementById('progressContainer').classList.remove('hidden');

  const formData = new FormData();
  if (provider !== 'local') formData.append('api_key', apiKey);
  formData.append('provider', provider);
  formData.append('notes', notes);
  formData.append('num_flashcards', numFlashcards);
  formData.append('quiz_types', JSON.stringify(quizTypes));
  formData.append('use_internet', useInternet);
  formData.append('enrich_count', document.getElementById('enrichCount').value || 5);
  if (fileInput.files[0]) formData.append('file', fileInput.files[0]);

  const endpoint = provider === 'local' ? `${BACKEND_URL}/api/generate-reviewer-local` : `${BACKEND_URL}/api/generate-reviewer`;

  try {
    const response = await fetch(endpoint, { method: 'POST', body: formData });
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || 'Generation failed');
    document.getElementById('progressContainer').classList.add('hidden');
    lastGeneratedData = data;
    document.getElementById('saveToLibraryBtn').classList.remove('hidden');
    renderResultsOneByOne(data);
  } catch (err) {
    document.getElementById('progressContainer').classList.add('hidden');
    alert('Error: ' + err.message);
  } finally {
    btn.disabled = false;
    btnContent.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles mr-2"></i>Generate Study Materials';
  }
}

async function renderResultsOneByOne(data) {
  const container = document.getElementById('resultsContainer');
  container.classList.remove('hidden');
  container.scrollIntoView({ behavior: 'smooth' });

  document.getElementById('summaryList').innerHTML = '';
  document.getElementById('flashcardGrid').innerHTML = '';
  document.getElementById('quizContainer').innerHTML = '';

  const summaryItems = (data.summary || []).map(s => `<li class="reveal-item flex items-start gap-2 p-3 rounded-xl bg-white/5"><i class="fa-solid fa-check text-indigo-400 mt-0.5"></i>${s}</li>`);
  document.getElementById('summaryList').innerHTML = summaryItems.join('');

  const flashcardContainer = document.getElementById('flashcardGrid');
  for (let i = 0; i < (data.flashcards || []).length; i++) {
    const card = data.flashcards[i];
    const div = document.createElement('div');
    div.className = 'reveal-item';
    div.innerHTML = `
      <div class="flashcard" onclick="this.classList.toggle('flipped')">
        <div class="flashcard-inner">
          <div class="flashcard-front">
            <p class="text-sm font-bold">${card.term}</p>
          </div>
          <div class="flashcard-back">
            <p class="text-xs opacity-70">${card.definition}</p>
          </div>
        </div>
      </div>`;
    flashcardContainer.appendChild(div);
    await new Promise(resolve => setTimeout(resolve, 150));
  }

  const quizContainer = document.getElementById('quizContainer');
  for (let i = 0; i < (data.quiz || []).length; i++) {
    const q = data.quiz[i];
    const div = document.createElement('div');
    div.className = 'reveal-item bg-white/5 border border-white/10 p-4 rounded-xl';
    let optionsHTML = '';
    if (q.options && q.options.length) {
      optionsHTML = q.options.map((opt, idx) => `
        <button onclick="checkAnswer(this, ${opt === q.answer})" class="quiz-option w-full text-left p-3 rounded-lg bg-white/5 text-sm border border-white/10 mt-1 hover:bg-indigo-500/10 transition">
          <span class="w-6 h-6 rounded-full bg-white/10 inline-flex items-center justify-center text-xs font-bold mr-2">${String.fromCharCode(65 + idx)}</span>${opt}
        </button>`).join('');
    } else {
      optionsHTML = `<p class="text-sm opacity-70">Answer: ${q.answer}</p>`;
    }
    div.innerHTML = `<p class="text-sm font-semibold mb-2">${i + 1}. ${q.question}</p>${optionsHTML}`;
    quizContainer.appendChild(div);
    await new Promise(resolve => setTimeout(resolve, 200));
  }
}

function checkAnswer(btn, isCorrect) {
  const parent = btn.parentElement;
  Array.from(parent.children).forEach(child => {
    child.classList.remove('bg-emerald-500/20', 'border-emerald-500', 'text-emerald-300', 
                          'bg-rose-500/20', 'border-rose-500', 'text-rose-300');
  });
  if (isCorrect === true || isCorrect === 'true') {
    btn.classList.add('bg-emerald-500/20', 'border-emerald-500', 'text-emerald-300');
  } else {
    btn.classList.add('bg-rose-500/20', 'border-rose-500', 'text-rose-300');
  }
}

// ============================================================
// LIBRARY
// ============================================================
document.getElementById('saveToLibraryBtn').addEventListener('click', async () => {
  if (!lastGeneratedData) return;
  const entry = {
    id: Date.now(),
    date: new Date().toLocaleString(),
    notes: document.getElementById('studyNotes').value.slice(0, 100) + '...',
    data: lastGeneratedData
  };
  let saved = safeLocalStorageGet('acadhub_saved', []);
  saved.unshift(entry);
  safeLocalStorageSet('acadhub_saved', saved);
  if (auth.currentUser) {
    await saveToFirestore('library', saved, 'id').catch(err => console.error(err));
  }
  alert('Saved to Library!');
  renderSavedList();
});

function renderSavedList() {
  const list = document.getElementById('savedList');
  const empty = document.getElementById('emptyLibrary');
  let saved = safeLocalStorageGet('acadhub_saved', []);
  if (saved.length === 0) {
    empty.classList.remove('hidden');
    list.innerHTML = '';
    return;
  }
  empty.classList.add('hidden');
  list.innerHTML = saved.map(entry => `
    <div class="saved-card flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/10">
      <div class="flex-1">
        <p class="text-sm font-semibold">${entry.date}</p>
        <p class="text-xs opacity-50 truncate">${entry.notes}</p>
      </div>
      <div class="flex gap-2">
        <button onclick="loadSaved(${entry.id})" class="px-3 py-1 rounded-lg bg-indigo-500/20 text-indigo-400 text-xs hover:bg-indigo-500/30 transition btn-hover"><i class="fa-solid fa-eye mr-1"></i>Load</button>
        <button onclick="deleteSaved(${entry.id})" class="px-3 py-1 rounded-lg bg-rose-500/20 text-rose-400 text-xs hover:bg-rose-500/30 transition btn-hover"><i class="fa-solid fa-trash"></i></button>
      </div>
    </div>`).join('');
}

function loadSaved(id) {
  let saved = safeLocalStorageGet('acadhub_saved', []);
  const entry = saved.find(e => e.id === id);
  if (!entry) return;
  lastGeneratedData = entry.data;
  document.getElementById('saveToLibraryBtn').classList.remove('hidden');
  switchTab('reviewer');
  renderResultsOneByOne(entry.data);
}

function deleteSaved(id) {
  let saved = safeLocalStorageGet('acadhub_saved', []);
  saved = saved.filter(e => e.id !== id);
  safeLocalStorageSet('acadhub_saved', saved);
  if (auth.currentUser) {
    saveToFirestore('library', saved, 'id').catch(err => console.error(err));
  }
  renderSavedList();
}

// ============================================================
// GCASH REVEAL
// ============================================================
function revealGCash() {
  document.getElementById('gcashHidden').classList.add('hidden');
  document.getElementById('gcashFull').classList.remove('hidden');
}

// ============================================================
// PROFILE MODAL
// ============================================================
function closeProfileModal() {
  document.getElementById('profileModal').classList.add('hidden');
}

function showProfileModal() {
  if (auth.currentUser) {
    document.getElementById('authModal').classList.remove('hidden');
    updateAuthUI();
    return;
  }
  if (localStorage.getItem('profile_saved') === 'true') {
    document.getElementById('authModal').classList.remove('hidden');
    updateAuthUI();
    return;
  }
  document.getElementById('profileModal').classList.remove('hidden');
}

(function() {
  const firstName = document.getElementById('visitorFirstName');
  const lastName = document.getElementById('visitorLastName');
  const agree = document.getElementById('agreeTerms');
  const saveBtn = document.getElementById('saveProfileBtn');

  function checkFields() {
    if (firstName.value.trim() && lastName.value.trim() && agree.checked) {
      saveBtn.disabled = false;
    } else {
      saveBtn.disabled = true;
    }
  }

  firstName.addEventListener('input', checkFields);
  lastName.addEventListener('input', checkFields);
  agree.addEventListener('change', checkFields);
})();

async function saveVisitorName() {
  const firstName = document.getElementById('visitorFirstName').value.trim();
  const lastName = document.getElementById('visitorLastName').value.trim();
  if (!firstName || !lastName) { alert('Please enter both names.'); return; }
  const saveBtn = document.getElementById('saveProfileBtn');
  if (!saveBtn) { alert('Error: button not found. Please refresh.'); return; }
  localStorage.setItem('profile_name', firstName + ' ' + lastName);
  localStorage.setItem('profile_saved', 'true');
  saveBtn.disabled = true;
  saveBtn.innerHTML = '<i class="fa-solid fa-spinner animate-spin mr-2"></i>Saving...';
  if (typeof db !== 'undefined' && typeof firebase !== 'undefined') {
    try {
      await Promise.race([
        db.collection('visitors').add({
          firstName,
          lastName,
          timestamp: firebase.firestore.FieldValue.serverTimestamp()
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000))
      ]);
    } catch (err) {
      console.log('Firebase save delayed, using local fallback.');
    }
  }
  closeProfileModal();
  alert('Profile saved! You may now use the app.');
  saveBtn.disabled = false;
  saveBtn.innerHTML = 'Save';
}

// ============================================================
// EVALUATION MODAL
// ============================================================
let selectedRating = 0;

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
    const name = localStorage.getItem('profile_name') || 'Anonymous';
    document.getElementById('evalProfileName').textContent = 'Submitting as: ' + name;
  }
}

async function submitEval() {
  if (selectedRating === 0) { alert('Please select a star rating.'); return; }
  const suggestions = document.getElementById('evalSuggestions').value.trim();
  const profileName = localStorage.getItem('profile_name') || 'Anonymous';
  const evalBtn = document.querySelector('#evalModal .btn-primary');
  const originalHTML = evalBtn.innerHTML;
  evalBtn.disabled = true;
  evalBtn.innerHTML = '<i class="fa-solid fa-spinner animate-spin mr-2"></i>Submitting...';
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
    alert('Error submitting feedback. Please try again.');
  } finally {
    evalBtn.disabled = false;
    evalBtn.innerHTML = originalHTML;
  }
}

// ============================================================
// AUTH
// ============================================================
function closeAuthModal() {
  document.getElementById('authModal').classList.add('hidden');
}

function updateAuthUI() {
  const user = auth.currentUser;
  const emailInput = document.getElementById('authEmail');
  const passInput = document.getElementById('authPassword');
  const nameFields = document.getElementById('authNameFields');
  const toggleWrap = document.getElementById('authToggleText')?.parentElement;
  const btn = document.getElementById('authBtnText');
  const title = document.getElementById('authTitle');
  const subtitle = document.getElementById('authSubtitle');

  if (user) {
    title.textContent = 'Account';
    subtitle.textContent = 'You are logged in as ' + user.email;
    emailInput.classList.add('hidden');
    passInput.classList.add('hidden');
    nameFields.classList.add('hidden');
    if (toggleWrap) toggleWrap.classList.add('hidden');
    btn.textContent = 'Logout';
  } else {
    title.textContent = isSignUpMode ? 'Sign Up' : 'Login';
    subtitle.textContent = 'Login to save your data and access all features.';
    emailInput.classList.remove('hidden');
    passInput.classList.remove('hidden');
    nameFields.classList.toggle('hidden', !isSignUpMode);
    if (toggleWrap) toggleWrap.classList.remove('hidden');
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
  if (!auth) return alert('Auth service unavailable.');
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
      await auth.createUserWithEmailAndPassword(email, password);
      await db.collection('visitors').add({
        firstName,
        lastName,
        email,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
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
// SERVICE WORKER REGISTRATION
// ============================================================
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/AcadHub/sw.js')
      .then((registration) => {
        console.log('Service Worker registered:', registration.scope);
      })
      .catch((err) => {
        console.error('Service Worker registration failed:', err);
      });
  });
}

// ============================================================
// INIT
// ============================================================
function initializeScheduler() {
  schedItems = schedItems.map(item => ({
    ...item,
    type: item.type || 'task',
    priority: item.priority || 'medium',
    category: item.category || 'study',
    status: item.status || 'todo',
    progress: item.progress || 0,
    dotColor: item.dotColor || '#6366f1'
  }));
  saveSched();
  renderScheduler();
}

initializeScheduler();
renderScheduler();
renderPlanner();
renderSavedList();
updateProviderUI();

(function() {
  if (localStorage.getItem('profile_saved') !== 'true') {
    document.getElementById('profileModal').classList.remove('hidden');
  }
})();

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
// FIREBASE AUTH STATE LISTENER & DATA SYNC
// ============================================================
let unsubscribers = [];

function startFirestoreListeners() {
  if (!auth.currentUser) return;
  const user = auth.currentUser;

  const schedRef = db.collection('users').doc(user.uid).collection('scheduler');
  unsubscribers.push(
    schedRef.onSnapshot(snapshot => {
      const items = [];
      snapshot.forEach(doc => items.push({ id: doc.id, ...doc.data() }));
      schedItems = items;
      safeLocalStorageSet('acadhub_sched', items);
      renderScheduler();
    })
  );

  const plannerRef = db.collection('users').doc(user.uid).collection('planner');
  unsubscribers.push(
    plannerRef.onSnapshot(snapshot => {
      const items = [];
      snapshot.forEach(doc => items.push({ id: doc.id, ...doc.data() }));
      plannerTasks = items;
      safeLocalStorageSet('acadhub_planner', items);
      renderPlanner();
    })
  );

  const libraryRef = db.collection('users').doc(user.uid).collection('library');
  unsubscribers.push(
    libraryRef.onSnapshot(snapshot => {
      const items = [];
      snapshot.forEach(doc => items.push({ id: doc.id, ...doc.data() }));
      safeLocalStorageSet('acadhub_saved', items);
      renderSavedList();
    })
  );
}

function stopFirestoreListeners() {
  unsubscribers.forEach(unsub => unsub());
  unsubscribers = [];
}

auth && auth.onAuthStateChanged(async user => {
  if (user) {
    document.getElementById('userIcon').classList.remove('fa-user');
    document.getElementById('userIcon').classList.add('fa-user-check');
    document.getElementById('profileButton').title = 'Logged in as ' + user.email;

    const logoutBtn = document.getElementById('logoutButton');
    if (logoutBtn) logoutBtn.classList.remove('hidden');

    stopFirestoreListeners();

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

    startFirestoreListeners();
    updateAuthUI();
  } else {
    document.getElementById('userIcon').classList.remove('fa-user-check');
    document.getElementById('userIcon').classList.add('fa-user');
    document.getElementById('profileButton').title = 'Login / Sign Up';

    const logoutBtn = document.getElementById('logoutButton');
    if (logoutBtn) logoutBtn.classList.add('hidden');

    stopFirestoreListeners();
    updateAuthUI();
  }
});

console.log('AcadHub Suite loaded successfully with all features intact.');