// ============================================================
// ACADHUB — FIRST-TIME ONBOARDING TOUR
// ============================================================
(function () {
  'use strict';

  const LS_DONE = 'acadhub_tour_done';
  const LS_STEP = 'acadhub_tour_step';

  const STEPS = [
    {
      selector: '#tabContainer',
      title: 'Welcome to AcadHub 👋',
      body: 'This is your navigation bar. Tap any icon to switch between Home, Notes, Reviewer, Test, and Calendar.',
      placement: 'top',
      padding: 8,
    },
    {
      selector: '#tabHome',
      title: 'Home',
      body: 'Your dashboard — daily study plan, streak, XP, and quick stats.',
      placement: 'top',
      padding: 8,
    },
    {
      selector: '#studyPlanCard',
      title: "Today's Study Plan",
      body: 'AcadHub uses spaced repetition to show you exactly what to review today. Tap Start Review Session to begin.',
      placement: 'bottom',
      padding: 8,
      tab: 'home',
    },
    {
      selector: '#tabNotes',
      title: 'Notes',
      body: 'Write and organize notes by subject. They sync to the cloud and are the raw material for your reviewers.',
      placement: 'top',
      padding: 8,
    },
    {
      selector: '#tabReviewer',
      title: 'Reviewer',
      body: 'Paste notes or upload a PDF, and AcadHub generates flashcards, quizzes, and summaries with AI.',
      placement: 'top',
      padding: 8,
    },
    {
      selector: '#flashcardSlider',
      title: 'Configure your reviewer',
      body: 'Choose how many flashcards and which quiz types you want. Then press Generate.',
      placement: 'bottom',
      padding: 8,
      tab: 'reviewer',
    },
    {
      selector: '#studyModeBtn',
      title: 'Study Mode',
      body: 'Once flashcards are generated, tap Study Mode to flip through them and rate each card Easy / Hard / Forgot.',
      placement: 'bottom',
      padding: 8,
      tab: 'reviewer',
      optional: true,
    },
    {
      selector: '#tabTest',
      title: 'Test My Limits',
      body: 'Take a timed quiz on your notes. Difficulty auto-adapts to your recent scores.',
      placement: 'top',
      padding: 8,
    },
    {
      selector: '#tabCalendar',
      title: 'Calendar',
      body: 'Track deadlines for exams, quizzes, and projects. Long-press any day to quick-add.',
      placement: 'top',
      padding: 8,
    },
    {
      selector: '#profileButton',
      title: 'Account',
      body: 'Sign in to sync your notes, reviewers, and progress across devices.',
      placement: 'bottom',
      padding: 8,
    },
    {
      selector: '#tabContainer button[onclick*="toggleSettingsModal"]',
      title: 'Settings',
      body: 'Customize theme, sound effects, and touch particle effects. You can replay this tour anytime from Settings.',
      placement: 'bottom',
      padding: 8,
      fallbackSelector: 'button[onclick*="toggleSettingsModal"]',
    },
  ];

  let currentStep = 0;
  let activeSteps = [];
  let isOpen = false;

  // ---------- DOM ----------
  let overlay, spotlight, tooltip, titleEl, bodyEl, prevBtn, nextBtn, skipBtn, dotsEl;

  function buildDOM() {
    if (document.getElementById('tourRoot')) return;

    const root = document.createElement('div');
    root.id = 'tourRoot';
    root.setAttribute('aria-hidden', 'true');
    root.innerHTML = `
      <div class="tour-overlay" id="tourOverlay"></div>
      <div class="tour-spotlight" id="tourSpotlight"></div>
      <div class="tour-tooltip" id="tourTooltip" role="dialog" aria-modal="true" aria-labelledby="tourTitle">
        <div class="tour-progress" id="tourProgress"></div>
        <h3 class="tour-title" id="tourTitle"></h3>
        <p class="tour-body" id="tourBody"></p>
        <div class="tour-actions">
          <button type="button" class="tour-btn tour-btn-skip" id="tourSkip">Skip tour</button>
          <div class="tour-btn-group">
            <button type="button" class="tour-btn tour-btn-prev" id="tourPrev">Back</button>
            <button type="button" class="tour-btn tour-btn-next" id="tourNext">Next</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(root);

    overlay   = document.getElementById('tourOverlay');
    spotlight = document.getElementById('tourSpotlight');
    tooltip   = document.getElementById('tourTooltip');
    titleEl   = document.getElementById('tourTitle');
    bodyEl    = document.getElementById('tourBody');
    prevBtn   = document.getElementById('tourPrev');
    nextBtn   = document.getElementById('tourNext');
    skipBtn   = document.getElementById('tourSkip');
    dotsEl    = document.getElementById('tourProgress');

    prevBtn.addEventListener('click', prev);
    nextBtn.addEventListener('click', next);
    skipBtn.addEventListener('click', finish);

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) finish();
    });

    document.addEventListener('keydown', onKeydown);
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
  }

  function onKeydown(e) {
    if (!isOpen) return;
    if (e.key === 'Escape') { finish(); return; }
    if (e.key === 'ArrowRight') { next(); return; }
    if (e.key === 'ArrowLeft') { prev(); return; }
  }

  // ---------- Steps ----------
  function resolveTarget(step) {
    let el = document.querySelector(step.selector);
    if (!el && step.fallbackSelector) el = document.querySelector(step.fallbackSelector);
    if (!el) return null;
    // Skip elements inside a hidden parent
    if (el.offsetParent === null && el.getClientRects().length === 0) return null;
    return el;
  }

  function filterAvailableSteps() {
    return STEPS.filter(step => {
      const el = resolveTarget(step);
      if (!el) return step.optional === false ? false : false;
      return true;
    });
  }

  function goToStep(index) {
    if (index < 0) index = 0;
    if (index >= activeSteps.length) { finish(); return; }

    currentStep = index;
    const step = activeSteps[index];

    // Switch tab if required
    if (step.tab && typeof window.switchTab === 'function') {
      try { window.switchTab(step.tab); } catch (e) { /* ignore */ }
    }

    // Wait one frame so tab switch / layout settles
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const el = resolveTarget(step);
        if (!el) { next(); return; }

        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => {
          positionSpotlight(el, step.padding || 8);
          positionTooltip(el, step);
          renderContent(step);
          renderDots();
        }, 260);
      });
    });
  }

  function positionSpotlight(el, pad) {
    const r = el.getBoundingClientRect();
    const x = r.left - pad;
    const y = r.top - pad;
    const w = r.width + pad * 2;
    const h = r.height + pad * 2;

    spotlight.style.top = y + 'px';
    spotlight.style.left = x + 'px';
    spotlight.style.width = w + 'px';
    spotlight.style.height = h + 'px';
    spotlight.style.borderRadius = getComputedStyle(el).borderRadius || '12px';

    // Cut a hole in the overlay using box-shadow trick
    overlay.style.setProperty('--tour-hole-top', y + 'px');
    overlay.style.setProperty('--tour-hole-left', x + 'px');
    overlay.style.setProperty('--tour-hole-w', w + 'px');
    overlay.style.setProperty('--tour-hole-h', h + 'px');
  }

  function positionTooltip(el, step) {
    const r = el.getBoundingClientRect();
    const margin = 14;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Reset
    tooltip.style.top = '0px';
    tooltip.style.left = '0px';
    tooltip.classList.remove('tour-arrow-top', 'tour-arrow-bottom');

    // Measure tooltip
    tooltip.style.visibility = 'hidden';
    tooltip.style.display = 'block';
    const tRect = tooltip.getBoundingClientRect();
    tooltip.style.visibility = '';

    let top, left;
    const placement = step.placement || 'bottom';

    if (placement === 'top') {
      top = r.top - tRect.height - margin;
      if (top < 8) top = r.bottom + margin;
      else tooltip.classList.add('tour-arrow-bottom');
    } else if (placement === 'bottom') {
      top = r.bottom + margin;
      if (top + tRect.height > vh - 8) {
        top = r.top - tRect.height - margin;
        tooltip.classList.add('tour-arrow-bottom');
      } else {
        tooltip.classList.add('tour-arrow-top');
      }
    } else if (placement === 'left') {
      left = r.left - tRect.width - margin;
      top = r.top + (r.height - tRect.height) / 2;
    } else {
      left = r.right + margin;
      top = r.top + (r.height - tRect.height) / 2;
    }

    if (left === undefined) {
      left = r.left + (r.width - tRect.width) / 2;
    }

    // Clamp to viewport
    left = Math.max(8, Math.min(left, vw - tRect.width - 8));
    top  = Math.max(8, Math.min(top,  vh - tRect.height - 8));

    tooltip.style.top = top + 'px';
    tooltip.style.left = left + 'px';

    // Arrow position relative to tooltip
    const arrowX = (r.left + r.width / 2) - left;
    tooltip.style.setProperty('--tour-arrow-x', Math.max(20, Math.min(arrowX, tRect.width - 20)) + 'px');
  }

  function reposition() {
    if (!isOpen) return;
    const step = activeSteps[currentStep];
    if (!step) return;
    const el = resolveTarget(step);
    if (!el) return;
    positionSpotlight(el, step.padding || 8);
    positionTooltip(el, step);
  }

  function renderContent(step) {
    titleEl.textContent = step.title || '';
    bodyEl.textContent  = step.body  || '';
    prevBtn.disabled = currentStep === 0;
    nextBtn.textContent = currentStep === activeSteps.length - 1 ? 'Finish' : 'Next';
  }

  function renderDots() {
    dotsEl.innerHTML = activeSteps.map((_, i) =>
      `<span class="tour-dot ${i === currentStep ? 'active' : ''}"></span>`
    ).join('');
  }

  // ---------- Public API ----------
  function next() { goToStep(currentStep + 1); }
  function prev() { goToStep(currentStep - 1); }

  function finish() {
    isOpen = false;
    localStorage.setItem(LS_DONE, 'true');
    localStorage.removeItem(LS_STEP);
    const root = document.getElementById('tourRoot');
    if (root) root.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('tour-active');
    if (tooltip)  tooltip.style.display  = 'none';
    if (spotlight) spotlight.style.display = 'none';
    if (overlay)  overlay.style.display  = 'none';
    document.removeEventListener('keydown', onKeydown);
    window.removeEventListener('resize', reposition);
    window.removeEventListener('scroll', reposition, true);
  }

  function start(force) {
    const done = localStorage.getItem(LS_DONE) === 'true';
    if (done && !force) return;

    buildDOM();

    activeSteps = filterAvailableSteps();
    if (!activeSteps.length) return;

    currentStep = 0;
    isOpen = true;

    const root = document.getElementById('tourRoot');
    if (root) root.setAttribute('aria-hidden', 'false');
    document.body.classList.add('tour-active');
    overlay.style.display = 'block';
    spotlight.style.display = 'block';
    tooltip.style.display = 'block';

    // Rebind handlers in case finish() removed them
    prevBtn.onclick = prev;
    nextBtn.onclick = next;
    skipBtn.onclick = finish;
    document.addEventListener('keydown', onKeydown);
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);

    goToStep(0);
  }

  function restart() {
    localStorage.removeItem(LS_DONE);
    start(true);
  }

  function isFinished() {
    return localStorage.getItem(LS_DONE) === 'true';
  }

  // ---------- Auto-start ----------
  function autoStart() {
    // Wait for splash + app init to finish
    const tryStart = (attempts = 0) => {
      if (attempts > 40) return; // give up after ~10s
      const splash = document.getElementById('splashScreen');
      const splashGone = !splash || splash.classList.contains('splash-hide');
      if (!splashGone) {
        setTimeout(() => tryStart(attempts + 1), 250);
        return;
      }
      // Small extra delay so tabs are rendered
      setTimeout(() => start(false), 600);
    };
    tryStart();
  }

  window.Tour = { start, restart, finish, isFinished };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoStart);
  } else {
    autoStart();
  }
})();