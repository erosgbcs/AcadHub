// ============================================================
// ACADHUB SOUND ENGINE — synthesized tones, no audio files
// ============================================================
const SoundEngine = (function () {
  let ctx = null;
  let masterGain = null;
  let enabled = true;
  let lastTapAt = 0;

  const LS_KEY = 'acadhub_sounds_enabled';
  const MASTER_VOLUME = 1.5;
  const TAP_COOLDOWN_MS = 90;

  // ---- Load preference ----
  try {
    const stored = localStorage.getItem(LS_KEY);
    if (stored !== null) enabled = JSON.parse(stored);
  } catch (e) { /* ignore */ }

  // ---- Lazy AudioContext (must be created after first user gesture) ----
  function ensureCtx() {
    if (ctx) return ctx;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      ctx = new Ctx();
      masterGain = ctx.createGain();
      masterGain.gain.value = MASTER_VOLUME;
      masterGain.connect(ctx.destination);
    } catch (e) {
      console.warn('AudioContext unavailable:', e);
      return null;
    }
    return ctx;
  }

  // Unlock on first user interaction (mobile browsers require this)
  function unlock() {
    const c = ensureCtx();
    if (c && c.state === 'suspended') {
      c.resume().catch(() => {});
    }
  }

  function setMasterLevel(value, rampTime = 0.04) {
    if (!masterGain || !ctx) return;
    const level = Math.max(0, Math.min(1, value));
    masterGain.gain.cancelScheduledValues(ctx.currentTime);
    masterGain.gain.setTargetAtTime(level, ctx.currentTime, rampTime);
  }

  // ---- Core tone generator ----
  function tone({ freq = 440, duration = 0.08, type = 'sine', volume = 1, delay = 0, sweep = 0 }) {
    const c = ensureCtx();
    if (!c || !enabled) return;

    const start = c.currentTime + delay;
    const osc = c.createOscillator();
    const gain = c.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);

    if (sweep) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, freq + sweep), start + duration);
    }

    // Envelope: quick attack, smooth decay
    const peak = Math.max(0.0001, 0.9 * volume);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(peak, start + Math.min(0.012, duration * 0.25));
    gain.gain.exponentialRampToValueAtTime(0.0001, start + Math.max(0.02, duration));

    osc.connect(gain);
    gain.connect(masterGain);
    osc.start(start);
    osc.stop(start + duration + 0.02);
  }

  // ---- Noise burst (for "swipe" whoosh) ----
  function noise({ duration = 0.1, volume = 0.15, delay = 0 }) {
    const c = ensureCtx();
    if (!c || !enabled) return;

    const start = c.currentTime + delay;
    const buffer = c.createBuffer(1, c.sampleRate * duration, c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    }
    const src = c.createBufferSource();
    src.buffer = buffer;
    const gain = c.createGain();
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    src.connect(gain);
    gain.connect(masterGain);
    src.start(start);
    src.stop(start + duration);
  }

  // ---- Named sounds ----
  const SOUNDS = {
    tap: () => tone({ freq: 880, duration: 0.04, type: 'sine', volume: 0.5 }),

    tapSoft: () => tone({ freq: 660, duration: 0.05, type: 'sine', volume: 0.35 }),

    toggle: () => {
      tone({ freq: 520, duration: 0.05, type: 'triangle', volume: 0.5 });
      tone({ freq: 780, duration: 0.06, type: 'triangle', volume: 0.4, delay: 0.045 });
    },

    success: () => {
      tone({ freq: 523.25, duration: 0.1, type: 'sine', volume: 0.65 });
      tone({ freq: 659.25, duration: 0.12, type: 'sine', volume: 0.5, delay: 0.07 });
      tone({ freq: 783.99, duration: 0.16, type: 'sine', volume: 0.4, delay: 0.14 });
    },

    error: () => {
      tone({ freq: 220, duration: 0.12, type: 'triangle', volume: 0.45, sweep: -35 });
      tone({ freq: 174.61, duration: 0.15, type: 'triangle', volume: 0.32, delay: 0.09, sweep: -25 });
    },

    warning: () => {
      tone({ freq: 440, duration: 0.08, type: 'triangle', volume: 0.42 });
      tone({ freq: 440, duration: 0.08, type: 'triangle', volume: 0.35, delay: 0.14 });
    },

    info: () => tone({ freq: 880, duration: 0.06, type: 'sine', volume: 0.4 }),

    flip: () => {
      tone({ freq: 520, duration: 0.09, type: 'sine', volume: 0.4, sweep: 420 });
      noise({ duration: 0.055, volume: 0.035, delay: 0.015 });
    },

    rateEasy: () => {
      tone({ freq: 660, duration: 0.07, type: 'sine', volume: 0.55 });
      tone({ freq: 880, duration: 0.09, type: 'sine', volume: 0.5, delay: 0.06 });
      tone({ freq: 1320, duration: 0.1, type: 'sine', volume: 0.4, delay: 0.13 });
    },

    rateHard: () => {
      tone({ freq: 520, duration: 0.08, type: 'triangle', volume: 0.5 });
      tone({ freq: 620, duration: 0.08, type: 'triangle', volume: 0.4, delay: 0.07 });
    },

    rateForgot: () => {
      tone({ freq: 440, duration: 0.09, type: 'triangle', volume: 0.5 });
      tone({ freq: 330, duration: 0.11, type: 'triangle', volume: 0.4, delay: 0.08 });
    },

    swipe: () => {
      noise({ duration: 0.07, volume: 0.07 });
    },

    complete: () => {
      const notes = [523.25, 659.25, 783.99, 1046.5]; // C E G C
      notes.forEach((f, i) => {
        tone({ freq: f, duration: 0.16, type: 'sine', volume: 0.55, delay: i * 0.09 });
      });
      tone({ freq: 1567.98, duration: 0.35, type: 'sine', volume: 0.3, delay: 0.4 });
    },

    open: () => tone({ freq: 520, duration: 0.07, type: 'sine', volume: 0.35, sweep: 220 }),

    close: () => tone({ freq: 620, duration: 0.07, type: 'sine', volume: 0.35, sweep: -220 }),
  };

  // ---- Public API ----
  function play(name) {
    if (!enabled) return;
    const fn = SOUNDS[name];
    if (!fn) return;
    if (name === 'tapSoft') {
      const now = performance.now();
      if (now - lastTapAt < TAP_COOLDOWN_MS) return;
      lastTapAt = now;
    }
    const c = ensureCtx();
    if (!c) return;

    const playNow = () => {
      try { fn(); } catch (e) { console.warn('Sound play failed:', name, e); }
    };

    if (c.state === 'suspended') {
      c.resume().then(playNow).catch(() => {});
      return;
    }
    playNow();
  }

  function setEnabled(val) {
    enabled = !!val;
    try { localStorage.setItem(LS_KEY, JSON.stringify(enabled)); } catch (e) {}
    if (enabled) {
      unlock();
      play('toggle');
    }
  }

  function isEnabled() { return enabled; }

  // ---- Global click delegation for buttons ----
  document.addEventListener('pointerdown', unlock, { once: true, passive: true });
  document.addEventListener('click', (e) => {
    const target = e.target.closest('button, [role="button"], .btn-hover');
    if (!target) return;

    // Skip sound for elements that fire their own (ratings, flip, etc.)
    if (target.dataset.noSound === 'true') return;

    play('tapSoft');
  }, true);

  return { play, setEnabled, isEnabled, unlock };
})();