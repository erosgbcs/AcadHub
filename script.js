================
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