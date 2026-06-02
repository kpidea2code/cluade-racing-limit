/**
 * main.js — Bootstrap, button wiring, settings persistence
 */
(function() {
  'use strict';

  /* ══════════════════════════════
     SETTINGS PERSISTENCE
  ══════════════════════════════ */
  const SETTINGS_KEY = 'rl_settings_v2';

  function loadSettings() {
    try { return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}; } catch(e) { return {}; }
  }

  function saveSettings(obj) {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(obj)); } catch(e) {}
  }

  function applySettings(settings) {
    const sfx  = document.getElementById('toggleSFX');
    const eng  = document.getElementById('toggleEngine');
    const vib  = document.getElementById('toggleVibration');
    const night= document.getElementById('toggleNight');

    if (sfx   && settings.sfx    !== undefined) sfx.checked    = settings.sfx;
    if (eng   && settings.engine !== undefined) eng.checked    = settings.engine;
    if (vib   && settings.vib   !== undefined) vib.checked    = settings.vib;
    if (night && settings.night  !== undefined) night.checked  = settings.night;

    Audio.setSFX(settings.sfx    !== false);
    Audio.setEngine(settings.engine !== false);
    if (settings.night) Game.setNightMode(true);
    if (settings.carColor) {
      Game.setPlayerColor(settings.carColor);
      // mark selected dot
      document.querySelectorAll('.color-dot').forEach(d => {
        d.classList.toggle('selected', d.dataset.color === settings.carColor);
      });
    }
  }

  /* ══════════════════════════════
     INIT
  ══════════════════════════════ */
  function boot() {
    Game.init();
    UI.initParticles();

    // Load & apply settings
    const savedSettings = loadSettings();
    applySettings(savedSettings);

    // Load scores
    Game.loadScores();
    UI.updateStartBest();

    // Show start screen
    UI.showStart();

    // Draw idle road on canvas
    requestAnimationFrame(idleLoop);
  }

  /* Idle animation on start screen */
  let idleOffset = 0;
  let idleRaf = null;
  function idleLoop() {
    if (Game.getState() !== 'menu') return;
    idleOffset = (idleOffset + 1.5) % (window.innerHeight * 2);
    Renderer.draw({
      laneCount: 3,
      twoWay: false,
      vehicles: [],
      player: null,
      particles: [],
      floats: [],
      roadOff: idleOffset,
      bgOff: idleOffset * 0.4,
      crashFlash: 0,
      nitroOn: false,
    });
    idleRaf = requestAnimationFrame(idleLoop);
  }

  /* ══════════════════════════════
     BUTTON WIRING
  ══════════════════════════════ */
  function wire(id, fn) {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('click', () => {
        Audio.sfxClick();
        fn();
      });
    }
  }

  /* ── Mode selection ── */
  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active-mode'));
      btn.classList.add('active-mode');
      Game.setMode(btn.dataset.mode);
      Audio.sfxClick();
    });
  });

  /* ── Start ── */
  wire('btnStart', () => {
    if (idleRaf) { cancelAnimationFrame(idleRaf); idleRaf = null; }
    UI.showHUD(Game.getMode());
    Game.startGame();
  });

  /* ── Navigation ── */
  wire('btnHowTo',     () => UI.showScreen('howTo'));
  wire('btnHowToBack', () => UI.showStart());
  wire('btnSettings',  () => UI.showScreen('settings'));

  wire('btnSettingsBack', () => {
    // Collect settings
    const settings = {
      sfx:       document.getElementById('toggleSFX')?.checked    ?? true,
      engine:    document.getElementById('toggleEngine')?.checked  ?? true,
      vib:       document.getElementById('toggleVibration')?.checked ?? true,
      night:     document.getElementById('toggleNight')?.checked   ?? false,
      carColor:  document.querySelector('.color-dot.selected')?.dataset.color || '#e63946',
    };
    saveSettings(settings);
    applySettings(settings);
    UI.showStart();
  });

  /* ── Pause ── */
  wire('btnPause',        () => Game.pauseGame());
  wire('btnResume',       () => Game.resumeGame());
  wire('btnPauseRestart', () => { UI.showHUD(Game.getMode()); Game.restartGame(); });
  wire('btnPauseMenu',    () => { Game.goMenu(); UI.showStart(); });

  /* ── Game Over ── */
  wire('btnGoRestart', () => { UI.showHUD(Game.getMode()); Game.restartGame(); });
  wire('btnGoMenu',    () => { Game.goMenu(); UI.showStart(); });

  /* ── Mute toggle ── */
  wire('btnMute', () => {
    const muted = !Audio.isMuted();
    Audio.setMuted(muted);
    const btn = document.getElementById('btnMute');
    if (btn) btn.textContent = muted ? '🔇' : '🔊';
  });

  /* ── Fullscreen ── */
  wire('btnFullscreen', () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  });

  /* ── Color picker ── */
  document.querySelectorAll('.color-dot').forEach(dot => {
    dot.addEventListener('click', () => {
      document.querySelectorAll('.color-dot').forEach(d => d.classList.remove('selected'));
      dot.classList.add('selected');
      Game.setPlayerColor(dot.dataset.color);
      Audio.sfxClick();
    });
  });

  /* ── Clear scores ── */
  wire('btnClearScores', () => {
    Game.clearScores();
    UI.updateStartBest();
    alert('High scores cleared!');
  });

  /* ── Settings live toggles ── */
  document.getElementById('toggleSFX')?.addEventListener('change', e => {
    Audio.setSFX(e.target.checked);
  });
  document.getElementById('toggleEngine')?.addEventListener('change', e => {
    Audio.setEngine(e.target.checked);
  });
  document.getElementById('toggleNight')?.addEventListener('change', e => {
    Game.setNightMode(e.target.checked);
    Renderer.setNightMode(e.target.checked);
  });

  /* ── Resize handling ── */
  window.addEventListener('resize', () => {
    Renderer.resize();
  });

  /* ── Orientation change ── */
  window.addEventListener('orientationchange', () => {
    setTimeout(() => Renderer.resize(), 300);
  });

  /* ── Prevent default touch behaviors ── */
  document.addEventListener('touchmove', e => {
    if (e.target.closest('#mobileControls')) return;
    e.preventDefault();
  }, { passive: false });

  /* ── Keyboard shortcut for fullscreen ── */
  document.addEventListener('keydown', e => {
    if (e.key === 'F11') { e.preventDefault(); document.documentElement.requestFullscreen?.(); }
  });

  /* ── DOM Ready ── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

})();
