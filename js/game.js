/**
 * game.js — Core game loop, state machine, modes, scoring
 */
const Game = (() => {

  /* ══════════════════════════════
     STATE
  ══════════════════════════════ */
  const MODES = { ONEWAY: 'oneway', TWOWAY: 'twoway', TIMEATTACK: 'timeattack', FREERIDE: 'freeride' };

  let state        = 'menu';   // menu | playing | paused | gameover
  let mode         = MODES.ONEWAY;
  let nightMode    = false;

  // Road
  let roadOffset   = 0;
  let bgOffset     = 0;
  let roadSpeed    = 0;        // px/frame

  // Score
  let score        = 0;
  let distance     = 0;        // metres
  let combo        = 1;
  let comboTimer   = 0;        // frames
  let nearMisses   = 0;
  let maxSpeed     = 0;        // km/h all-time in run
  let timeLeft     = 60;       // for time attack

  // Traffic
  let traffic      = [];
  let spawnTimer   = 60;
  let spawnInterval= 60;       // frames between spawns

  // Difficulty ramp
  let difficulty   = 1;
  let diffTimer    = 0;

  // Crash
  let crashFlash   = 0;
  let crashed      = false;

  // Player
  let player       = null;
  let playerLane   = 1;
  let laneCount    = 3;
  let laneGeom     = null;

  // Settings
  let playerColor  = '#e63946';

  // Input state
  const input = { accel: false, brake: false, left: false, right: false, nitro: false };
  let laneChangeCooldown = 0;

  // Timing
  let lastTime     = 0;
  let rafId        = null;

  // High scores (per mode)
  const STORAGE_KEY = 'rl_hiscores_v2';
  let hiscores = {};

  /* ══════════════════════════════
     STORAGE
  ══════════════════════════════ */
  function loadScores() {
    try {
      hiscores = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
    } catch(e) { hiscores = {}; }
  }

  function saveScore(m, s) {
    if (!hiscores[m] || s > hiscores[m]) {
      hiscores[m] = Math.floor(s);
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(hiscores)); } catch(e) {}
      return true; // new best
    }
    return false;
  }

  function getBest(m) { return hiscores[m] || 0; }
  function clearScores() {
    hiscores = {};
    try { localStorage.removeItem(STORAGE_KEY); } catch(e) {}
  }

  /* ══════════════════════════════
     INIT / RESET
  ══════════════════════════════ */
  function setMode(m)        { mode = m; }
  function setNightMode(val) { nightMode = val; Renderer.setNightMode(val); }
  function setPlayerColor(c) { playerColor = c; }
  function getMode()         { return mode; }
  function getState()        { return state; }

  function init() {
    loadScores();
    Renderer.init(
      document.getElementById('gameCanvas'),
      document.getElementById('speedGauge')
    );
    resize();
    window.addEventListener('resize', resize);
    setupKeyboard();
    setupTouch();
  }

  function resize() {
    Renderer.resize();
    laneGeom = Renderer.getRoadGeom(laneCount);
    if (player) {
      player.y = Renderer.H() - 160;
      // re-snap to lane
      player.x = player.targetX = Renderer.laneCenter(playerLane, laneGeom);
    }
  }

  function startGame() {
    state    = 'playing';
    crashed  = false;

    // Mode-specific lane count
    laneCount = (mode === MODES.TWOWAY) ? 6 : 3;
    laneGeom  = Renderer.getRoadGeom(laneCount);

    playerLane = mode === MODES.TWOWAY ? 4 : 1; // right side for oneway, right half for twoway

    const px = Renderer.laneCenter(playerLane, laneGeom);
    const py = Renderer.H() - 160;
    player   = new Entities.Player(px, py, playerColor);

    // Difficulty
    difficulty    = 1;
    diffTimer     = 0;
    roadSpeed     = 4;
    spawnInterval = 60;
    spawnTimer    = 45;  // Start with quick spawn for immediate follow-up traffic

    // Scoring
    score      = 0;
    distance   = 0;
    combo      = 1;
    comboTimer = 0;
    nearMisses = 0;
    maxSpeed   = 0;
    timeLeft   = 60;

    // Road
    roadOffset = 0;
    bgOffset   = 0;
    crashFlash = 0;

    // Entities
    traffic = [];
    Entities.clearParticles();
    Entities.clearFloats();

    // Seed initial traffic with multiple vehicles spread across the road
    spawnTraffic(true, 12);  // More initial traffic for immediate action

    Audio.startEngine();
    Audio.sfxStart();

    if (!rafId) {
      lastTime = performance.now();
      rafId = requestAnimationFrame(loop);
    }
  }

  function restartGame() { stopLoop(); startGame(); }

  function pauseGame() {
    if (state !== 'playing') return;
    state = 'paused';
    Audio.stopEngine();
    UI.showPause(Math.floor(score), player ? player.kmh : 0, Math.floor(distance));
  }

  function resumeGame() {
    if (state !== 'paused') return;
    state = 'playing';
    Audio.startEngine();
    UI.hidePause();
    lastTime = performance.now();
    rafId = requestAnimationFrame(loop);
  }

  function goMenu() {
    stopLoop();
    state = 'menu';
    Audio.stopEngine();
    UI.showStart();
  }

  function stopLoop() {
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
  }

  /* ══════════════════════════════
     TRAFFIC SPAWNING
  ══════════════════════════════ */
  function findOpenLanes(lanes, y, minGap = 140) {
    // Return all lanes that are open at position y with minimum gap
    const openLanes = [];
    for (const lane of lanes) {
      const occupied = traffic.some(t => t.lane === lane && Math.abs(t.y - y) < minGap);
      if (!occupied) openLanes.push(lane);
    }
    return openLanes;
  }
  
  function findOpenLane(lanes, y, minGap = 140) {
    const openLanes = findOpenLanes(lanes, y, minGap);
    if (openLanes.length === 0) return lanes[Math.floor(Math.random() * lanes.length)];
    return openLanes[Math.floor(Math.random() * openLanes.length)];
  }

  function spawnTraffic(initial = false, count = 1) {
    const oncomingPossible = (mode === MODES.TWOWAY);
    const baseMinGap = initial ? 80 : 90; // Even tighter spacing for maximum traffic
    const half = Math.floor(laneCount / 2);

    for (let i = 0; i < count; i++) {
      let oncoming = false;
      let laneOptions = [];
      
      if (oncomingPossible) {
        // In Two Way mode, split spawns between oncoming and same-direction traffic
        // Ensure at least 40% are oncoming for heavy opposing traffic
        oncoming = Math.random() < 0.5; // 50% chance for each direction
        
        laneOptions = oncoming
          ? Array.from({ length: half }, (_, j) => j)  // Left lanes for oncoming
          : Array.from({ length: half }, (_, j) => j + half);  // Right lanes for same direction
      } else {
        // One Way mode: all lanes available, all same direction
        laneOptions = Array.from({ length: laneCount }, (_, j) => j);
      }

      // Calculate Y position with better distribution
      // For initial traffic: spread across negative Y (above screen)
      // For ongoing spawns: spawn just above screen for same-direction, below for oncoming
      // Add progressive spacing for multiple vehicles in same spawn cycle
      const y = initial
        ? -(i * (baseMinGap + 15) + Math.random() * 30)  // Tighter spread for initial traffic
        : (oncoming 
            ? Renderer.H() + 50 + (i * (baseMinGap + 20)) + Math.random() * 30   // Oncoming: spread below screen with spacing
            : -50 - Math.random() * 60);               // Same direction: spawn above screen

      // Find open lane with adaptive gap based on difficulty
      // Reduce gap for oncoming traffic to allow more vehicles in opposing lanes
      const gapMultiplier = oncoming ? 0.6 : (0.8 + Math.random() * 0.35);
      const dynamicGap = Math.max(45, baseMinGap * gapMultiplier - (difficulty * 6));
      const lane = findOpenLane(laneOptions, y, dynamicGap);
      const lx = Renderer.laneCenter(lane, laneGeom);
      
      // Varied speeds for realistic traffic flow - increased range for more variety
      // Ensure minimum speed so traffic doesn't stall
      // Oncoming traffic gets higher base speed and wider range for faster approach
      const speedBase = mode === MODES.TWOWAY && oncoming ? 4.0 : 1.2;
      const speedRange = mode === MODES.TWOWAY && oncoming ? 3.0 : 2.0 + (difficulty * 0.6);
      const speed = Math.max(0.8, (speedBase + Math.random() * speedRange) * (0.8 + difficulty * 0.3));

      // Create traffic vehicle
      const tv = new Entities.TrafficVehicle({
        x: lx, y,
        lane, laneX: lx,
        speed,
        color: Entities.randomTrafficColor(),
        typeIdx: Math.floor(Math.random() * 5),
        oncoming,
      });
      traffic.push(tv);
    }
  }

  /* ══════════════════════════════
     MAIN LOOP
  ══════════════════════════════ */
  function loop(ts) {
    if (state === 'paused') { rafId = null; return; }
    if (state !== 'playing') { rafId = null; return; }

    const dt = Math.min((ts - lastTime) / 16.667, 4); // cap dt at 4x frame
    lastTime = ts;

    update(dt);
    render();

    rafId = requestAnimationFrame(loop);
  }

  function update(dt) {
    // Lane input
    laneChangeCooldown -= dt;
    if (input.left && laneChangeCooldown <= 0) {
      const newLane = playerLane - 1;
      if (newLane >= 0) {
        playerLane = newLane;
        player.setLane(Renderer.laneCenter(playerLane, laneGeom));
        laneChangeCooldown = 18;
      }
      input.left = false;
    }
    if (input.right && laneChangeCooldown <= 0) {
      const newLane = playerLane + 1;
      if (newLane < laneCount) {
        playerLane = newLane;
        player.setLane(Renderer.laneCenter(playerLane, laneGeom));
        laneChangeCooldown = 18;
      }
      input.right = false;
    }

    // Player update
    player.update(input, dt);

    // Road scrolls at player speed
    const effectiveRoad = roadSpeed * (player.speed / player.maxSpeed);
    const scroll = player.speed * dt;
    roadOffset = (roadOffset + scroll) % (Renderer.H() * 2);
    bgOffset   = (bgOffset   + scroll * 0.4) % (Renderer.H() * 2);

    // Distance
    distance += scroll * 0.15;
    if (player.kmh > maxSpeed) maxSpeed = player.kmh;

    // Score: base + speed bonus + combo
    const speedBonus = Math.max(1, player.kmh / 60);
    score += speedBonus * combo * dt * 0.8;

    // Combo timer
    if (comboTimer > 0) {
      comboTimer -= dt;
      if (comboTimer <= 0) { combo = 1; comboTimer = 0; }
    }

    // Time attack countdown
    if (mode === MODES.TIMEATTACK) {
      timeLeft -= dt / 60;
      if (timeLeft <= 0) {
        timeLeft = 0;
        triggerGameOver('TIME UP!');
        return;
      }
    }

    // Difficulty ramp - more aggressive scaling for harder levels
    diffTimer += dt;
    if (diffTimer > 300) {  // Faster difficulty increase
      diffTimer = 0;
      difficulty = Math.min(difficulty + 0.2, 5);  // Max difficulty 5, faster ramp
      roadSpeed  = Math.min(roadSpeed + 0.4, 14);   // Higher max speed
      spawnInterval = Math.max(15, spawnInterval - 8);  // Much faster spawn rate reduction
    }

    // Spawn traffic - multiple vehicles per spawn for denser traffic
    spawnTimer -= dt;
    if (spawnTimer <= 0) {
      // Spawn more vehicles as difficulty increases - aggressive scaling for both modes
      const spawnCount = 4 + Math.floor(difficulty * 1.8);  // More vehicles: 4-13+ per spawn
      
      // In Two Way mode, ensure balanced oncoming traffic by spawning in batches
      if (mode === MODES.TWOWAY) {
        // Force half to be oncoming by controlling the random seed pattern
        for (let batch = 0; batch < 2; batch++) {
          const batchCount = Math.ceil(spawnCount / 2);
          // Alternate between oncoming and same-direction preference
          for (let i = 0; i < batchCount; i++) {
            // Override random to ensure 50/50 split
            const originalRandom = Math.random;
            let callCount = 0;
            Math.random = function() {
              callCount++;
              if (callCount === 1) return batch === 0 ? 0.3 : 0.7; // Force direction
              return originalRandom();
            };
            spawnTraffic(false, 1);
            Math.random = originalRandom;
          }
        }
      } else {
        spawnTraffic(false, spawnCount);
      }
      
      // Reduce interval variance at higher difficulties for consistent pressure
      const variance = difficulty > 3 ? 6 : 15;
      spawnTimer = Math.max(18, spawnInterval) + Math.random() * variance;  // Faster spawns
    }

    // Traffic update + collision
    for (let i = traffic.length - 1; i >= 0; i--) {
      const t = traffic[i];
      t.update(player.speed, dt);

      // Remove offscreen
      if (t.isOffscreen(Renderer.H())) {
        traffic.splice(i, 1);
        continue;
      }

      // Collision
      if (!crashed && Entities.checkCollision(player, t)) {
        if (mode !== MODES.FREERIDE) {
          triggerCrash(t);
          return;
        } else {
          // Free ride: bounce away
          player.speed *= 0.3;
          player.wobble = 5;
          Entities.spawnSparks(player.x, player.y);
          Audio.sfxCrash();
          crashFlash = 0.5;
        }
      }

      // Near miss
      if (!t.scored && !crashed && Entities.checkNearMiss(player, t)) {
        t.scored = true;
        nearMisses++;
        combo = Math.min(combo + 1, 10);
        comboTimer = 120;
        const pts = 150 * combo;
        score += pts;
        Entities.addFloat(t.x, t.y - 40, `+${pts} NEAR MISS!`, '#ffcc00', 18);
        Entities.spawnSparks(player.x, player.y - 10, -Math.PI/2, 12);
        player.triggerWobble(2);
        Audio.sfxNearMiss();
        if (combo >= 3) Audio.sfxCombo();
        UI.showNearMiss(`${combo > 1 ? '×'+combo+' ' : ''}NEAR MISS!`);
      }
    }

    // Particles & floats
    Entities.updateParticles(dt);
    Entities.updateFloats(dt);

    // Crash flash decay
    if (crashFlash > 0) crashFlash = Math.max(0, crashFlash - 0.04 * dt);

    // Engine audio
    Audio.setEngineRPM(player.speed / player.maxSpeed);

    // HUD update
    UI.updateHUD({
      score: Math.floor(score),
      kmh:   player.kmh,
      dist:  Math.floor(distance),
      combo,
      comboTimer,
      nitro: player.nitro,
      timeLeft: mode === MODES.TIMEATTACK ? Math.ceil(timeLeft) : null,
      best:  getBest(mode),
    });

    Renderer.drawSpeedGauge(player.kmh, 300);
  }

  function render() {
    Renderer.draw({
      laneCount,
      twoWay: mode === MODES.TWOWAY,
      vehicles: traffic,
      player: player ? {
        x: player.x, y: player.y,
        w: player.w, h: player.h,
        color: player.color,
        type: 'sports',
        crashed: player.crashed,
        nitroOn: player.nitroOn,
      } : null,
      particles: Entities.particles,
      floats: Entities.floats,
      roadOff: roadOffset,
      bgOff:   bgOffset,
      crashFlash,
      nitroOn: player && player.nitroOn,
    });
  }

  /* ══════════════════════════════
     CRASH & GAME OVER
  ══════════════════════════════ */
  function triggerCrash(trafficCar) {
    crashed = true;
    player.crashed = true;
    Audio.sfxCrash();
    Entities.spawnExplosion(player.x, player.y, 50);
    if (trafficCar) Entities.spawnExplosion(trafficCar.x, trafficCar.y, 30);
    Entities.spawnSmoke(player.x, player.y, 12);
    crashFlash = 1;

    // Vibrate on mobile
    try {
      const vibOn = document.getElementById('toggleVibration');
      if (vibOn && vibOn.checked && navigator.vibrate) navigator.vibrate([80, 40, 80]);
    } catch(e) {}

    setTimeout(() => triggerGameOver('WRECKED'), 1200);
  }

  function triggerGameOver(verdict) {
    state = 'gameover';
    Audio.stopEngine();
    Audio.sfxGameOver();
    stopLoop();

    const isNew = saveScore(mode, score);
    if (isNew) Audio.sfxNewBest();

    UI.showGameOver({
      score: Math.floor(score),
      best:  getBest(mode),
      dist:  Math.floor(distance),
      maxSpeed,
      nearMisses,
      mode,
      verdict,
      isNewBest: isNew,
    });
  }

  /* ══════════════════════════════
     INPUT
  ══════════════════════════════ */
  function setupKeyboard() {
    document.addEventListener('keydown', e => {
      if (state === 'playing') {
        switch(e.key) {
          case 'ArrowUp':    case 'w': case 'W': input.accel = true;  break;
          case 'ArrowDown':  case 's': case 'S': input.brake = true;  break;
          case 'ArrowLeft':  case 'a': case 'A': input.left  = true;  break;
          case 'ArrowRight': case 'd': case 'D': input.right = true;  break;
          case ' ':                              input.brake = true; e.preventDefault(); break;
          case 'Shift':                          input.nitro = true;  break;
          case 'p': case 'P': pauseGame(); break;
        }
      } else if (state === 'paused') {
        if (e.key === 'p' || e.key === 'P') resumeGame();
      }
    });

    document.addEventListener('keyup', e => {
      switch(e.key) {
        case 'ArrowUp':    case 'w': case 'W': input.accel = false; break;
        case 'ArrowDown':  case 's': case 'S': input.brake = false; break;
        case 'ArrowLeft':  case 'a': case 'A': input.left  = false; break;
        case 'ArrowRight': case 'd': case 'D': input.right = false; break;
        case ' ':                              input.brake = false; break;
        case 'Shift':                          input.nitro = false; break;
      }
    });
  }

  function setupTouch() {
    // Mobile button helpers
    function bindBtn(id, key) {
      const el = document.getElementById(id);
      if (!el) return;
      const down = () => { input[key] = true; el.classList.add('pressed'); };
      const up   = () => { input[key] = false; el.classList.remove('pressed'); };
      el.addEventListener('touchstart', e => { e.preventDefault(); down(); }, { passive: false });
      el.addEventListener('touchend',   e => { e.preventDefault(); up();   }, { passive: false });
      el.addEventListener('mousedown',  down);
      document.addEventListener('mouseup', up);
    }
    bindBtn('mcAccel', 'accel');
    bindBtn('mcBrake', 'brake');
    bindBtn('mcNitro', 'nitro');

    // Left/Right need special handling (single-fire)
    const mcLeft  = document.getElementById('mcLeft');
    const mcRight = document.getElementById('mcRight');
    if (mcLeft) {
      mcLeft.addEventListener('touchstart', e => {
        e.preventDefault();
        input.left = true;
        mcLeft.classList.add('pressed');
        setTimeout(() => { input.left = false; mcLeft.classList.remove('pressed'); }, 50);
      }, { passive: false });
      mcLeft.addEventListener('click', () => { input.left = true; setTimeout(() => input.left = false, 50); });
    }
    if (mcRight) {
      mcRight.addEventListener('touchstart', e => {
        e.preventDefault();
        input.right = true;
        mcRight.classList.add('pressed');
        setTimeout(() => { input.right = false; mcRight.classList.remove('pressed'); }, 50);
      }, { passive: false });
      mcRight.addEventListener('click', () => { input.right = true; setTimeout(() => input.right = false, 50); });
    }

    // Swipe steering
    let swipeStartX = 0, swipeStartY = 0;
    document.getElementById('gameCanvas').addEventListener('touchstart', e => {
      swipeStartX = e.touches[0].clientX;
      swipeStartY = e.touches[0].clientY;
    }, { passive: true });
    document.getElementById('gameCanvas').addEventListener('touchmove', e => {
      if (state !== 'playing') return;
      const dx = e.touches[0].clientX - swipeStartX;
      const dy = e.touches[0].clientY - swipeStartY;
      if (Math.abs(dx) > 30 && Math.abs(dx) > Math.abs(dy)) {
        if (dx > 0) { input.right = true; setTimeout(() => input.right = false, 50); }
        else        { input.left  = true; setTimeout(() => input.left  = false, 50); }
        swipeStartX = e.touches[0].clientX;
      }
    }, { passive: true });
  }

  /* ══════════════════════════════
     PUBLIC API
  ══════════════════════════════ */
  return {
    init, startGame, restartGame, pauseGame, resumeGame, goMenu,
    setMode, setNightMode, setPlayerColor,
    getMode, getState,
    getBest, clearScores, loadScores,
    MODES,
  };
})();
