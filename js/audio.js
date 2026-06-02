/**
 * audio.js — Web Audio API sound engine
 * Generates all sounds procedurally (no external files needed)
 */
const Audio = (() => {
  let ctx = null;
  let engineNode = null, engineGain = null;
  let masterGain = null;
  let muted = false;
  let sfxEnabled = true;
  let engineEnabled = true;

  function getCtx() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      masterGain = ctx.createGain();
      masterGain.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  /* ── Tiny synthesiser helpers ── */
  function playTone({ freq = 440, type = 'sine', duration = 0.15, gain = 0.3,
                       freqEnd = null, attack = 0.01, decay = 0.05, time = 0 } = {}) {
    if (muted || !sfxEnabled) return;
    const c = getCtx();
    const osc = c.createOscillator();
    const g   = c.createGain();
    osc.connect(g); g.connect(masterGain);
    osc.type = type;
    const t = c.currentTime + time;
    osc.frequency.setValueAtTime(freq, t);
    if (freqEnd) osc.frequency.exponentialRampToValueAtTime(freqEnd, t + duration);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.start(t);
    osc.stop(t + duration + 0.05);
  }

  function playNoise({ duration = 0.2, gain = 0.25, lowpass = 2000 } = {}) {
    if (muted || !sfxEnabled) return;
    const c = getCtx();
    const bufLen = c.sampleRate * duration;
    const buf = c.createBuffer(1, bufLen, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource();
    src.buffer = buf;
    const filt = c.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = lowpass;
    const g = c.createGain();
    g.gain.setValueAtTime(gain, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
    src.connect(filt); filt.connect(g); g.connect(masterGain);
    src.start();
    src.stop(c.currentTime + duration);
  }

  /* ── Engine Loop ── */
  function startEngine() {
    if (!engineEnabled || muted) return;
    const c = getCtx();
    if (engineNode) return;
    engineGain = c.createGain();
    engineGain.gain.value = 0.04;
    engineGain.connect(masterGain);

    engineNode = c.createOscillator();
    engineNode.type = 'sawtooth';
    engineNode.frequency.value = 80;
    engineNode.connect(engineGain);

    // Add slight harmonic
    const osc2 = c.createOscillator();
    osc2.type = 'square';
    osc2.frequency.value = 160;
    const g2 = c.createGain(); g2.gain.value = 0.015;
    osc2.connect(g2); g2.connect(masterGain);

    engineNode.start();
    osc2.start();
    engineNode._osc2 = osc2; engineNode._g2 = g2;
  }

  function stopEngine() {
    if (!engineNode) return;
    try {
      engineNode._osc2.stop(); engineNode.stop();
    } catch(e) {}
    engineNode = null; engineGain = null;
  }

  function setEngineRPM(speed /* 0-1 */) {
    if (!engineNode || !engineGain || muted || !engineEnabled) return;
    const freq = 70 + speed * 200;
    engineNode.frequency.setTargetAtTime(freq, ctx.currentTime, 0.08);
    engineNode._osc2.frequency.setTargetAtTime(freq * 2, ctx.currentTime, 0.08);
    const vol = 0.02 + speed * 0.06;
    engineGain.gain.setTargetAtTime(vol, ctx.currentTime, 0.1);
  }

  /* ── Public SFX ── */
  function sfxClick() {
    playTone({ freq: 880, type: 'square', duration: 0.06, gain: 0.18 });
  }
  function sfxStart() {
    playTone({ freq: 220, type: 'sawtooth', duration: 0.12, gain: 0.3, freqEnd: 440 });
    playTone({ freq: 440, type: 'sawtooth', duration: 0.2, gain: 0.25, freqEnd: 880, time: 0.1 });
  }
  function sfxNearMiss() {
    playTone({ freq: 660, type: 'square', duration: 0.12, gain: 0.22, freqEnd: 1320 });
  }
  function sfxCombo() {
    playTone({ freq: 523, type: 'square', duration: 0.08, gain: 0.2 });
    playTone({ freq: 659, type: 'square', duration: 0.08, gain: 0.2, time: 0.07 });
    playTone({ freq: 784, type: 'square', duration: 0.12, gain: 0.22, time: 0.14 });
  }
  function sfxCrash() {
    playNoise({ duration: 0.5, gain: 0.6, lowpass: 800 });
    playTone({ freq: 150, type: 'sawtooth', duration: 0.4, gain: 0.4, freqEnd: 50 });
  }
  function sfxNitro() {
    playTone({ freq: 200, type: 'sawtooth', duration: 0.3, gain: 0.25, freqEnd: 600 });
    playNoise({ duration: 0.3, gain: 0.15, lowpass: 4000 });
  }
  function sfxGameOver() {
    playTone({ freq: 440, type: 'sawtooth', duration: 0.3, gain: 0.3, freqEnd: 110 });
    playTone({ freq: 330, type: 'sawtooth', duration: 0.4, gain: 0.25, freqEnd: 80, time: 0.25 });
  }
  function sfxNewBest() {
    [0, 0.1, 0.2, 0.3].forEach((t, i) => {
      playTone({ freq: [523, 659, 784, 1046][i], duration: 0.15, gain: 0.2, time: t });
    });
  }

  /* ── Master controls ── */
  function setMuted(val) {
    muted = val;
    if (masterGain) masterGain.gain.value = muted ? 0 : 1;
    if (muted) stopEngine(); else startEngine();
  }
  function setSFX(val)    { sfxEnabled = val; }
  function setEngine(val) {
    engineEnabled = val;
    if (!val) stopEngine(); else startEngine();
  }
  function isMuted() { return muted; }

  return {
    startEngine, stopEngine, setEngineRPM,
    sfxClick, sfxStart, sfxNearMiss, sfxCombo,
    sfxCrash, sfxNitro, sfxGameOver, sfxNewBest,
    setMuted, setSFX, setEngine, isMuted,
  };
})();
