// ============================================================
// ACADHUB TOUCH PARTICLES — DOM-based, CSS-animated, zero loops
// ============================================================
const TouchParticles = (function () {
  let container = null;
  let enabled = true;
  const LS_KEY = 'acadhub_particles_enabled';
  const MAX_LIVE = 120;   // was 60 — doubled for denser bursts

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
  // Dark mode → pastel tones (glow softly on dark bg)
  // Light mode → saturated tones (pop against white bg)
  const PALETTE_DARK = [
    '#a5b4fc', '#67e8f9', '#c4b5fd', '#f0abfc',
    '#fde68a', '#a7f3d0', '#fca5a5', '#fdba74'
  ];
  const PALETTE_LIGHT = [
    '#6366f1', '#06b6d4', '#8b5cf6', '#ec4899',
    '#f59e0b', '#10b981', '#ef4444', '#f97316'
  ];
  function pickColor() {
    const isLight = document.documentElement.classList.contains('light');
    const palette = isLight ? PALETTE_LIGHT : PALETTE_DARK;
    return palette[Math.floor(Math.random() * palette.length)];
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

    // 1. Glow ripple at impact point
    const ripple = document.createElement('div');
    ripple.className = 'tp-ripple';
    ripple.style.left = x + 'px';
    ripple.style.top = y + 'px';
    ripple.style.setProperty('--tp-color', pickColor());
    c.appendChild(ripple);
    ripple.addEventListener('animationend', () => ripple.remove(), { once: true });

    // 1b. Bright secondary ring — a crisp expanding circle outline
    const ring = document.createElement('div');
    ring.className = 'tp-ring';
    ring.style.left = x + 'px';
    ring.style.top = y + 'px';
    ring.style.setProperty('--tp-color', pickColor());
    c.appendChild(ring);
    ring.addEventListener('animationend', () => ring.remove(), { once: true });

    // 2. Sparkle particles radiating outward
    const count = 12 + Math.floor(Math.random() * 5);  // 12-16 (was 6-9)
    for (let i = 0; i < count; i++) {
      const p = document.createElement('div');
      p.className = 'tp-particle';

      // Spread evenly around a circle, plus slight randomness
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.7;
      const distance = 38 + Math.random() * 60;         // was 28-74
      const dx = Math.cos(angle) * distance;
      const dy = Math.sin(angle) * distance;
      const size = 7 + Math.random() * 7;               // was 4-9
      const duration = 0.65 + Math.random() * 0.45;     // was 0.55-0.95
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