// Synthesised sound, no audio files: footsteps, coin clatter, loot chime,
// alarm swell, EMP zap, caught sting and the getaway motif. WebAudio only,
// created on the first user gesture so browsers allow it.
export function createAudio() {
  let ctx = null;
  let master = null;

  /** Build the AudioContext on first use; false when the browser refuses. */
  function ensure() {
    if (ctx) return true;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      ctx = new AudioCtx();
      master = ctx.createGain();
      master.gain.value = 0.18;
      master.connect(ctx.destination);
      return true;
    } catch {
      return false;
    }
  }

  /** One oscillator note: frequency `freq` sliding to `slideTo`, `dur` long. */
  function tone(freq, dur, type, vol, when = 0, slideTo = 0) {
    if (!ensure()) return;
    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  /** Filtered noise burst, fading out over `dur` (footsteps, EMP, smoke). */
  function noise(dur, vol, when = 0, low = 400) {
    if (!ensure()) return;
    const t0 = ctx.currentTime + when;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = low;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start(t0);
  }

  return {
    unlock() {
      ensure();
      if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
    },
    step() {
      noise(0.05, 0.12, 0, 300);
    },
    coin() {
      tone(1900, 0.09, 'triangle', 0.25, 0, 1200);
      tone(1500, 0.12, 'triangle', 0.2, 0.09, 900);
    },
    loot() {
      tone(880, 0.12, 'sine', 0.3);
      tone(1318, 0.2, 'sine', 0.3, 0.08);
    },
    emp() {
      noise(0.35, 0.3, 0, 4000);
      tone(1200, 0.3, 'sawtooth', 0.12, 0, 120);
    },
    smoke() {
      noise(0.4, 0.2, 0, 900);
    },
    alarm() {
      tone(620, 0.25, 'square', 0.1, 0, 880);
      tone(620, 0.25, 'square', 0.1, 0.3, 880);
    },
    lockdown() {
      tone(440, 0.4, 'sawtooth', 0.2, 0, 880);
      tone(440, 0.4, 'sawtooth', 0.2, 0.4, 880);
      tone(440, 0.6, 'sawtooth', 0.2, 0.8, 880);
    },
    caught() {
      tone(220, 0.5, 'sawtooth', 0.25, 0, 55);
      tone(110, 0.7, 'sawtooth', 0.2, 0.15, 40);
    },
    clear() {
      tone(523, 0.15, 'sine', 0.3);
      tone(659, 0.15, 'sine', 0.3, 0.12);
      tone(784, 0.3, 'sine', 0.3, 0.24);
    },
    win() {
      [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.35, 'sine', 0.3, i * 0.14));
    },
  };
}
