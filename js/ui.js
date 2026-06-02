/**
 * ui.js — Screen management, HUD updates, modal overlays
 */
const UI = (() => {

  /* ── Screen refs ── */
  const screens = {
    start:    document.getElementById('startScreen'),
    howTo:    document.getElementById('howToScreen'),
    settings: document.getElementById('settingsScreen'),
    pause:    document.getElementById('pauseScreen'),
    gameover: document.getElementById('gameOverScreen'),
  };
  const hud = document.getElementById('hud');

  /* ── HUD elements ── */
  const els = {
    score:    document.getElementById('hudScore'),
    best:     document.getElementById('hudBest'),
    speedNum: document.getElementById('hudSpeedNum'),
    dist:     document.getElementById('hudDist'),
    combo:    document.getElementById('hudCombo'),
    mode:     document.getElementById('hudMode'),
    timer:    document.getElementById('hudTimer'),
    comboFill:document.getElementById('comboBarFill'),
    nitroFill:document.getElementById('nitroFill'),
    nearMiss: document.getElementById('nearMissPopup'),
    // pause snapshot
    pauseScore: document.getElementById('pauseScore'),
    pauseSpeed: document.getElementById('pauseSpeed'),
    pauseDist:  document.getElementById('pauseDist'),
    // gameover
    goScore:  document.getElementById('goScore'),
    goBest:   document.getElementById('goBest'),
    goDist:   document.getElementById('goDist'),
    goSpeed:  document.getElementById('goSpeed'),
    goMisses: document.getElementById('goMisses'),
    goMode:   document.getElementById('goMode'),
    goVerdict:document.getElementById('goVerdict'),
    goNewBest:document.getElementById('goNewBest'),
    // start
    startBest:document.getElementById('startBestScore'),
  };

  const MODE_LABELS = {
    oneway: 'ONE WAY', twoway: 'TWO WAY',
    timeattack: 'TIME ATTACK', freeride: 'FREE RIDE',
  };

  /* ══════════════════════════════
     SCREEN HELPERS
  ══════════════════════════════ */
  function showScreen(name) {
    Object.values(screens).forEach(s => s.classList.remove('active'));
    hud.classList.add('hidden');
    if (name && screens[name]) screens[name].classList.add('active');
  }

  function showHUD(modeName) {
    Object.values(screens).forEach(s => s.classList.remove('active'));
    hud.classList.remove('hidden');
    if (els.mode) els.mode.textContent = MODE_LABELS[modeName] || modeName.toUpperCase();
    if (els.timer) {
      if (modeName === 'timeattack') els.timer.classList.remove('hidden');
      else els.timer.classList.add('hidden');
    }
  }

  function showStart() {
    updateStartBest();
    showScreen('start');
  }

  function showPause(score, speed, dist) {
    if (els.pauseScore) els.pauseScore.textContent = score.toLocaleString();
    if (els.pauseSpeed) els.pauseSpeed.textContent = speed + ' km/h';
    if (els.pauseDist)  els.pauseDist.textContent  = dist + 'm';
    screens.pause.classList.add('active');
  }

  function hidePause() {
    screens.pause.classList.remove('active');
  }

  function showGameOver({ score, best, dist, maxSpeed, nearMisses, mode, verdict, isNewBest }) {
    if (els.goScore)  els.goScore.textContent  = score.toLocaleString();
    if (els.goBest)   els.goBest.textContent   = best.toLocaleString();
    if (els.goDist)   els.goDist.textContent   = dist + ' m';
    if (els.goSpeed)  els.goSpeed.textContent  = maxSpeed + ' km/h';
    if (els.goMisses) els.goMisses.textContent = nearMisses;
    if (els.goMode)   els.goMode.textContent   = MODE_LABELS[mode] || mode;
    if (els.goVerdict)els.goVerdict.textContent= verdict || 'WRECKED';
    if (els.goNewBest) {
      if (isNewBest) els.goNewBest.classList.remove('hidden');
      else           els.goNewBest.classList.add('hidden');
    }
    showScreen('gameover');
    // shake the panel
    const panel = screens.gameover.querySelector('.overlay-panel');
    if (panel) { panel.classList.remove('shake'); void panel.offsetWidth; panel.classList.add('shake'); }
  }

  function updateStartBest() {
    // Show best across all modes
    const modes = ['oneway','twoway','timeattack','freeride'];
    const best = Math.max(...modes.map(m => Game.getBest(m)));
    if (els.startBest) els.startBest.textContent = best.toLocaleString();
  }

  /* ══════════════════════════════
     HUD UPDATE (called every frame)
  ══════════════════════════════ */
  let _prevCombo = 1;
  function updateHUD({ score, kmh, dist, combo, comboTimer, nitro, timeLeft, best }) {
    if (els.score)    els.score.textContent = score.toLocaleString();
    if (els.speedNum) els.speedNum.textContent = kmh;
    if (els.dist)     els.dist.textContent  = dist >= 1000
      ? (dist / 1000).toFixed(2) + 'km'
      : dist + 'm';
    if (els.combo) {
      els.combo.textContent = combo;
      if (combo > _prevCombo) {
        els.combo.classList.remove('combo-pop');
        void els.combo.offsetWidth;
        els.combo.classList.add('combo-pop');
      }
    }
    _prevCombo = combo;
    if (els.best) els.best.textContent = best.toLocaleString();

    // Combo bar
    if (els.comboFill) {
      const pct = comboTimer > 0 ? Math.min(100, (comboTimer / 120) * 100) : 0;
      els.comboFill.style.width = pct + '%';
    }

    // Nitro bar
    if (els.nitroFill) els.nitroFill.style.width = nitro + '%';

    // Timer
    if (timeLeft !== null && els.timer) {
      const m = Math.floor(timeLeft / 60);
      const s = timeLeft % 60;
      els.timer.textContent = `${m}:${String(Math.floor(s)).padStart(2,'0')}`;
      els.timer.style.color = timeLeft < 10 ? '#ff4400' : '';
    }
  }

  /* ── Near miss popup ── */
  let nearMissTimeout = null;
  function showNearMiss(text) {
    if (!els.nearMiss) return;
    clearTimeout(nearMissTimeout);
    els.nearMiss.textContent = text;
    els.nearMiss.classList.remove('hidden');
    els.nearMiss.style.animation = 'none';
    void els.nearMiss.offsetWidth;
    els.nearMiss.style.animation = '';
    nearMissTimeout = setTimeout(() => els.nearMiss.classList.add('hidden'), 1000);
  }

  /* ══════════════════════════════
     BG PARTICLES (start screen)
  ══════════════════════════════ */
  function initParticles() {
    const container = document.getElementById('bgParticles');
    if (!container) return;
    for (let i = 0; i < 30; i++) {
      const p = document.createElement('div');
      const size = 1 + Math.random() * 2;
      p.style.cssText = `
        position:absolute;
        width:${size}px; height:${size}px;
        background:#ff440066;
        border-radius:50%;
        left:${Math.random()*100}%;
        top:${Math.random()*100}%;
        animation: floatPart ${4+Math.random()*8}s ${Math.random()*4}s linear infinite;
      `;
      container.appendChild(p);
    }

    // Add keyframes if not present
    if (!document.getElementById('particleKeyframes')) {
      const style = document.createElement('style');
      style.id = 'particleKeyframes';
      style.textContent = `
        @keyframes floatPart {
          0%   { transform: translateY(0) scale(1); opacity:0; }
          10%  { opacity:1; }
          90%  { opacity:1; }
          100% { transform: translateY(-100vh) scale(0); opacity:0; }
        }
        @keyframes combo-pop {
          0%   { transform: scale(1); }
          50%  { transform: scale(1.5); color: #ffcc00; }
          100% { transform: scale(1); }
        }
        .combo-pop { animation: combo-pop 0.3s ease; }
      `;
      document.head.appendChild(style);
    }
  }

  return {
    showScreen, showHUD, showStart, showPause, hidePause,
    showGameOver, showNearMiss, updateHUD,
    updateStartBest, initParticles,
    MODE_LABELS,
  };
})();
