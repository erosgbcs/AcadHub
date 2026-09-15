// animations.js

/**
 * Open a modal/sheet with an iOS-style entry animation.
 * @param {HTMLElement} el        - The overlay element (has .hidden, contains a .glass-card)
 * @param {string}      animation - Tailwind animation class for the inner card
 */
function iosOpen(el, animation = 'animate-ios-pop-in') {
  if (!el) return;

  // Clear any leftover exit-animation classes
  el.classList.remove(
    'hidden', 'is-closing',
    'animate-ios-fade-out', 'animate-ios-pop-out', 'animate-ios-sheet-down'
  );

  const card = el.querySelector('.glass-card');
  el.classList.add('animate-ios-fade-in');
  if (card) {
    // Reset any prior entry animation so it can re-trigger
    card.classList.remove(
      'animate-ios-pop-in', 'animate-ios-pop-out',
      'animate-ios-sheet-up', 'animate-ios-sheet-down'
    );
    void card.offsetWidth; // force reflow
    card.classList.add(animation);
  }

  el.setAttribute('aria-hidden', 'false');
}

/**
 * Close a modal/sheet with an iOS-style exit animation.
 * @param {HTMLElement} el        - The overlay element
 * @param {string}      animation - Tailwind animation class for the inner card
 * @param {number}      duration  - Must match your Tailwind animation duration
 */
function iosClose(el, animation = 'animate-ios-pop-out', duration = 250) {
  if (!el || el.classList.contains('hidden')) return;

  const card = el.querySelector('.glass-card');
  el.classList.add('is-closing', 'animate-ios-fade-out');
  if (card) {
    card.classList.remove(
      'animate-ios-pop-in', 'animate-ios-sheet-up'
    );
    card.classList.add(animation);
  }

  setTimeout(() => {
    el.classList.add('hidden');
    el.classList.remove('is-closing', 'animate-ios-fade-in', 'animate-ios-fade-out');
    if (card) {
      card.classList.remove(
        'animate-ios-pop-in', 'animate-ios-pop-out',
        'animate-ios-sheet-up', 'animate-ios-sheet-down'
      );
    }
    el.setAttribute('aria-hidden', 'true');
  }, duration);
}