// ============================================================
// ACADHUB TOUCH PARTICLES — DOM-based, CSS-animated, zero loops
// ============================================================
const TouchParticles = (function () {
  let container = null;
  let enabled = true;
  const LS_KEY = 'acadhub_particles_enabled';
  const MAX_LIVE = 60;    // safety cap

  // ---- Load preference ----
  try {
    const stored = localStorage.getItem(LS_KEY);
    if (stored !== null) enabled = JSON.parse(stored);
  } catch (e) { /* ignore */ }

  // ---- Reduced-motion check ----
  function prefersReducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  // ---- Container (created lazily on first tap) ----
  function ensureContainer() {
    if (container) return container;
    container = document.createElement('div');
    container.id = 'touchParticlesLayer';
    container.setAttribute('aria-hidden', 'true');
    document.body.appendChild(container);
    return container;
  }

  // ---- Color palette (matches app accent scheme) ----
  const PALETTE = ['#a5b4fc', '#67e8f9', '#c4b5fd', '#f0abfc', '#fde68a', '#a7f3d0'];
  function pickColor() {
    return PALETTE[Math.floor(Math.random() * PALETTE.length)];
  }

  // ---- Live particle count ----
  function liveCount() {
    if (!container) return 0;
    return container.childElementCount;
  }

  // ---- Burst spawner ----
  function burst(x, y) {
    if (!enabled || prefersReducedMotion()) return;
    if (liveCount() > MAX_LIVE) return;

    const c = ensureContainer();

    // 1. Soft glow ripple at impact point
    const ripple = document.createElement('div');
    ripple.className = 'tp-ripple';
    ripple.style.left = x + 'px';
    ripple.style.top = y + 'px';
    ripple.style.setProperty('--tp-color', pickColor());
    c.appendChild(ripple);
    ripple.addEventListener('animationend', () => ripple.remove(), { once: true });

    // 2. Sparkle particles radiating outward
    const count = 6 + Math.floor(Math.random() * 4);  // 6-9
    for (let i = 0; i < count; i++) {
      const p = document.createElement('div');
      p.className = 'tp-particle';

      // Spread evenly around a circle, plus slight randomness
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.7;
      const distance = 28 + Math.random() * 46;
      const dx = Math.cos(angle) * distance;
      const dy = Math.sin(angle) * distance;
      const size = 4 + Math.random() * 5;
      const duration = 0.55 + Math.random() * 0.4;
      const color = pickColor();

      p.style.left = x + 'px';
      p.style.top = y + 'px';
      p.style.width = size + 'px';
      p.style.height = size + 'px';
      p.style.background = color;
      p.style.setProperty('--tp-dx', dx.toFixed(1) + 'px');
      p.style.setProperty('--tp-dy', dy.toFixed(1) + 'px');
      p.style.setProperty('--tp-duration', duration.toFixed(2) + 's');
      p.style.setProperty('--tp-color', color);

      c.appendChild(p);
      p.addEventListener('animationend', () => p.remove(), { once: true });
    }
  }

  // ---- Global pointer handler ----
  function handlePointer(e) {
    // Left mouse only (skip right/middle click, skip touch during scroll)
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    burst(e.clientX, e.clientY);
  }

  // Attach once — passive listener, won't block scrolling
  document.addEventListener('pointerdown', handlePointer, { passive: true });

  // ---- Public API ----
  function setEnabled(val) {
    enabled = !!val;
    try { localStorage.setItem(LS_KEY, JSON.stringify(enabled)); } catch (e) {}
    if (!enabled && container) {
      // Immediately clear any live particles
      container.innerHTML = '';
    }
  }

  function isEnabled() { return enabled; }

  // ---- Demo burst (for preview button) ----
  function preview() {
    const wasEnabled = enabled;
    enabled = true;
    const x = window.innerWidth / 2;
    const y = window.innerHeight / 2;
    burst(x, y);
    enabled = wasEnabled;
  }

  return { burst, preview, setEnabled, isEnabled };
})();