// ============================================================
// ACADHUB SOUND ENGINE — synthesized, layered, anti-repetition
// ============================================================
const SoundEngine = (function () {
  let ctx = null;
  let masterGain = null;
  let enabled = true;
  let lastTapAt = 0;
  let hapticsEnabled = true;

  const LS_ENABLED  = 'acadhub_sounds_enabled';
  const LS_VOLUME   = 'acadhub_sounds_volume';
  const LS_HAPTICS  = 'acadhub_haptics_enabled';
  const MASTER_VOLUME_DEFAULT = 1.0;
  const TAP_COOLDOWN_MS = 90;
  const HAPTIC_COOLDOWN_MS = 120;

  let hapticLastAt = 0;

  // ---- Load preferences ----
  try {
    const s = localStorage.getItem(LS_ENABLED);
    if (s !== null) enabled = JSON.parse(s);
  } catch (e) { /* ignore */ }

  let masterVolume = MASTER_VOLUME_DEFAULT;
  try {
    const v = localStorage.getItem(LS_VOLUME);
    if (v !== null) {
      const parsed = parseFloat(v);
      if (!isNaN(parsed)) masterVolume = Math.max(0, Math.min(1, parsed));
    }
  } catch (e) { /* ignore */ }

  try {
    const h = localStorage.getItem(LS_HAPTICS);
    if (h !== null) hapticsEnabled = JSON.parse(h);
  } catch (e) { /* ignore */ }

  // ---- Lazy AudioContext ----
  function ensureCtx() {
    if (ctx) return ctx;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      ctx = new Ctx();
      masterGain = ctx.createGain();
      masterGain.gain.value = masterVolume;
      // Gentle soft-knee compressor to prevent clipping on layered voices
      try {
        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -18;
        comp.knee.value      = 14;
        comp.ratio.value     = 4;
        comp.attack.value    = 0.003;
        comp.release.value   = 0.18;
        masterGain.connect(comp);
        comp.connect(ctx.destination);
      } catch (e) {
        masterGain.connect(ctx.destination);
      }
    } catch (e) {
      console.warn('AudioContext unavailable:', e);
      return null;
    }
    return ctx;
  }

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

  // ---- Core tone generator (with optional FM / detune) ----
  function tone({
    freq = 440,
    duration = 0.08,
    type = 'sine',
    volume = 1,
    delay = 0,
    sweep = 0,
    attack = null,
    detune = 0,
    pan = 0,
    fm = null, // { ratio, depth } for bell-like timbres
  }) {
    const c = ensureCtx();
    if (!c || !enabled) return;

    const start = c.currentTime + delay;
    const osc = c.createOscillator();
    const gain = c.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    osc.detune.setValueAtTime(detune, start);

    if (sweep) {
      osc.frequency.exponentialRampToValueAtTime(
        Math.max(1, freq + sweep),
        start + duration
      );
    }

    // FM modulator for richer timbre (bell / marimba)
    let modGain = null;
    if (fm && fm.ratio && fm.depth) {
      const modOsc = c.createOscillator();
      modGain = c.createGain();
      modOsc.frequency.setValueAtTime(freq * fm.ratio, start);
      modGain.gain.setValueAtTime(0.0001, start);
      modGain.gain.exponentialRampToValueAtTime(
        Math.max(0.0001, fm.depth * volume),
        start + Math.min(0.01, duration * 0.2)
      );
      modGain.gain.exponentialRampToValueAtTime(
        0.0001,
        start + duration
      );
      modOsc.connect(modGain);
      modGain.connect(osc.frequency);
      modOsc.start(start);
      modOsc.stop(start + duration + 0.05);
    }

    // Envelope
    const atk = attack !== null ? attack : Math.min(0.012, duration * 0.25);
    const peak = Math.max(0.0001, 0.9 * volume);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(peak, start + atk);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + Math.max(0.02, duration));

    // Optional stereo pan
    let lastNode = gain;
    if (pan && c.createStereoPanner) {
      const panner = c.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, pan));
      gain.connect(panner);
      lastNode = panner;
    }

    osc.connect(gain);
    lastNode.connect(masterGain);
    osc.start(start);
    osc.stop(start + duration + 0.05);
  }

  function noise({ duration = 0.1, volume = 0.15, delay = 0, pan = 0 }) {
    const c = ensureCtx();
    if (!c || !enabled) return;

    const start = c.currentTime + delay;
    const buffer = c.createBuffer(1, Math.max(1, c.sampleRate * duration), c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    }
    const src = c.createBufferSource();
    src.buffer = buffer;
    const gain = c.createGain();
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

    let lastNode = gain;
    if (pan && c.createStereoPanner) {
      const panner = c.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, pan));
      gain.connect(panner);
      lastNode = panner;
    }

    src.connect(gain);
    lastNode.connect(masterGain);
    src.start(start);
    src.stop(start + duration);
  }

  // ---- Small helpers ----
  function jitter(base, amount) {
    return base + (Math.random() * 2 - 1) * amount;
  }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  // ---- Named sounds ----
  const SOUNDS = {
    // Warm marimba-ish tap with anti-repetition
    tap: () => {
      const f = jitter(820, 25);
      tone({ freq: f, duration: 0.06, type: 'sine', volume: 0.35,
             fm: { ratio: 2.02, depth: 0.35 } });
      tone({ freq: f * 2, duration: 0.05, type: 'sine', volume: 0.10, delay: 0.005 });
    },

    // Soft pluck — most UI buttons
    tapSoft: () => {
      const f = jitter(640, 20);
      tone({ freq: f, duration: 0.07, type: 'triangle', volume: 0.28,
             fm: { ratio: 1.5, depth: 0.22 } });
      tone({ freq: f * 1.5, duration: 0.06, type: 'sine', volume: 0.12, delay: 0.01 });
    },

    toggle: () => {
      const base = pick([500, 520, 540]);
      tone({ freq: base, duration: 0.05, type: 'triangle', volume: 0.42 });
      tone({ freq: base + 260, duration: 0.07, type: 'sine', volume: 0.32,
             delay: 0.045, fm: { ratio: 2, depth: 0.15 } });
    },

    success: () => {
      const root = pick([523.25, 554.37, 587.33]);
      tone({ freq: root,          duration: 0.11, type: 'sine',     volume: 0.55, fm: { ratio: 2, depth: 0.18 } });
      tone({ freq: root * 1.25,   duration: 0.13, type: 'sine',     volume: 0.42, delay: 0.07 });
      tone({ freq: root * 1.5,    duration: 0.18, type: 'triangle', volume: 0.35, delay: 0.14 });
    },

    error: () => {
      tone({ freq: 220, duration: 0.13, type: 'triangle', volume: 0.4,  sweep: -35 });
      tone({ freq: 175, duration: 0.16, type: 'triangle', volume: 0.28, delay: 0.09, sweep: -25 });
      noise({ duration: 0.06, volume: 0.03, delay: 0.02 });
    },

    warning: () => {
      tone({ freq: 460, duration: 0.08, type: 'triangle', volume: 0.38 });
      tone({ freq: 460, duration: 0.08, type: 'triangle', volume: 0.30, delay: 0.14 });
    },

    info: () => {
      tone({ freq: 880, duration: 0.06, type: 'sine', volume: 0.32,
             fm: { ratio: 1.8, depth: 0.12 } });
    },

    flip: () => {
      tone({ freq: 520, duration: 0.10, type: 'sine', volume: 0.35, sweep: 420,
             fm: { ratio: 1.7, depth: 0.18 } });
      noise({ duration: 0.05, volume: 0.03, delay: 0.02 });
    },

    rateEasy: () => {
      tone({ freq: 660,  duration: 0.08, type: 'sine', volume: 0.5, fm: { ratio: 2, depth: 0.15 } });
      tone({ freq: 880,  duration: 0.10, type: 'sine', volume: 0.45, delay: 0.06 });
      tone({ freq: 1320, duration: 0.12, type: 'sine', volume: 0.32, delay: 0.13 });
    },

    rateHard: () => {
      tone({ freq: 520, duration: 0.09, type: 'triangle', volume: 0.45 });
      tone({ freq: 640, duration: 0.09, type: 'triangle', volume: 0.36, delay: 0.07 });
    },

    rateForgot: () => {
      tone({ freq: 440, duration: 0.10, type: 'triangle', volume: 0.45 });
      tone({ freq: 330, duration: 0.12, type: 'triangle', volume: 0.36, delay: 0.08 });
    },

    swipe: () => {
      noise({ duration: 0.07, volume: 0.06 });
    },

    complete: () => {
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((f, i) => {
        tone({ freq: f, duration: 0.18, type: 'sine', volume: 0.5,
               delay: i * 0.09, fm: { ratio: 2, depth: 0.2 } });
      });
      tone({ freq: 1567.98, duration: 0.4, type: 'sine', volume: 0.28, delay: 0.42 });
    },

    open: () => {
      tone({ freq: 520, duration: 0.08, type: 'sine', volume: 0.32, sweep: 240 });
    },

    close: () => {
      tone({ freq: 620, duration: 0.08, type: 'sine', volume: 0.32, sweep: -240 });
    },

    // ---- New named sounds ----
    pop: () => {
      tone({ freq: 900, duration: 0.045, type: 'sine', volume: 0.35, sweep: 200,
             fm: { ratio: 2.4, depth: 0.3 } });
    },

    confirm: () => {
      tone({ freq: 660, duration: 0.07, type: 'sine', volume: 0.42 });
      tone({ freq: 990, duration: 0.10, type: 'sine', volume: 0.35, delay: 0.06 });
    },

    cardDeal: () => {
      noise({ duration: 0.06, volume: 0.05 });
      tone({ freq: 320, duration: 0.05, type: 'sine', volume: 0.18, delay: 0.01, sweep: 60 });
    },

    xpGain: () => {
      tone({ freq: 1046.5, duration: 0.06, type: 'sine', volume: 0.30,
             fm: { ratio: 2, depth: 0.18 } });
      tone({ freq: 1318.5, duration: 0.08, type: 'sine', volume: 0.24, delay: 0.04 });
    },

    levelUp: () => {
      const chord = [523.25, 659.25, 783.99, 1046.5, 1318.5];
      chord.forEach((f, i) => {
        tone({ freq: f, duration: 0.22, type: 'sine', volume: 0.45,
               delay: i * 0.06, fm: { ratio: 2, depth: 0.22 } });
      });
    },

    save: () => {
      tone({ freq: 880, duration: 0.06, type: 'sine', volume: 0.32 });
      tone({ freq: 1174.66, duration: 0.08, type: 'sine', volume: 0.26, delay: 0.05 });
    },

    delete: () => {
      tone({ freq: 440, duration: 0.07, type: 'triangle', volume: 0.35, sweep: -80 });
    },
  };

  // ---- Public API ----
  function play(name) {
    if (!enabled) return;
    const fn = SOUNDS[name];
    if (!fn) return;

    if (name === 'tapSoft' || name === 'tap') {
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

  function haptic(pattern = 8) {
    if (!hapticsEnabled) return;
    if (!('vibrate' in navigator)) return;
    const now = performance.now();
    if (now - hapticLastAt < HAPTIC_COOLDOWN_MS) return;
    hapticLastAt = now;
    try { navigator.vibrate(pattern); } catch (e) { /* ignore */ }
  }

  function setEnabled(val) {
    enabled = !!val;
    try { localStorage.setItem(LS_ENABLED, JSON.stringify(enabled)); } catch (e) {}
    if (enabled) {
      unlock();
      play('toggle');
    }
  }

  function setVolume(val) {
    const v = Math.max(0, Math.min(1, Number(val)));
    masterVolume = v;
    try { localStorage.setItem(LS_VOLUME, String(v)); } catch (e) {}
    if (masterGain && ctx) setMasterLevel(v);
  }

  function getVolume() { return masterVolume; }

  function setHaptics(val) {
    hapticsEnabled = !!val;
    try { localStorage.setItem(LS_HAPTICS, JSON.stringify(hapticsEnabled)); } catch (e) {}
  }

  function isEnabled()  { return enabled; }
  function isHapticsEnabled() { return hapticsEnabled; }

  // ---- Unlock on first real interaction ----
  // Re-attach after ctx is created to survive page transitions
  function attachUnlock() {
    const once = () => {
      unlock();
      document.removeEventListener('pointerdown', once);
    };
    document.addEventListener('pointerdown', once, { once: true, passive: true });
  }
  attachUnlock();

  // ---- Global click delegation for buttons ----
  document.addEventListener('pointerdown', (e) => {
    const target = e.target.closest('button, [role="button"], .btn-hover, .quiz-option, .mcq-study-option');
    if (!target) return;
    if (target.dataset.noSound === 'true') return;
    play('tapSoft');
    haptic(6);
  }, true);

  // Expose API
  return {
    play,
    setEnabled,
    isEnabled,
    unlock,
    haptic,
    setVolume,
    getVolume,
    setHaptics,
    isHapticsEnabled,
    // Named sound shortcuts for programmatic use
    sounds: Object.keys(SOUNDS),
  };
})();