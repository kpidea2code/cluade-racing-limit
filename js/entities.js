/**
 * entities.js — Game entities: player, traffic, particles, floats
 */
const Entities = (() => {

  /* ══════════════════════════════
     CONSTANTS
  ══════════════════════════════ */
  const VEHICLE_TYPES = [
    { type: 'sedan',  w: 36, h: 64 },
    { type: 'suv',    w: 40, h: 70 },
    { type: 'truck',  w: 44, h: 95 },
    { type: 'sports', w: 34, h: 60 },
    { type: 'van',    w: 42, h: 80 },
  ];

  const TRAFFIC_COLORS = [
    '#2196f3','#4caf50','#9c27b0','#ff9800',
    '#00bcd4','#607d8b','#795548','#ffeb3b',
    '#f44336','#009688',
  ];

  /* ══════════════════════════════
     PLAYER
  ══════════════════════════════ */
  class Player {
    constructor(x, y, color) {
      this.x = x;
      this.y = y;
      this.targetX  = x;
      this.w  = 36;
      this.h  = 72;
      this.color    = color || '#e63946';
      this.speed    = 0;       // internal units/frame
      this.kmh      = 0;       // display km/h
      this.maxSpeed = 14;      // px/frame at top
      this.accel    = 0.12;
      this.brake    = 0.22;
      this.drag     = 0.03;
      this.laneChanging = false;
      this.laneChangeSpeed = 0.14;
      this.nitro    = 100;
      this.nitroOn  = false;
      this.crashed  = false;
      this.wobble   = 0;       // lateral oscillation from near misses
    }

    update(input, dt) {
      if (this.crashed) return;

      // Acceleration
      const nitroBoost = this.nitroOn ? 1.6 : 1;
      const topSpeed   = this.maxSpeed * nitroBoost;

      if (input.accel) {
        this.speed = Math.min(topSpeed, this.speed + this.accel * dt * nitroBoost);
      } else if (input.brake) {
        this.speed = Math.max(0, this.speed - this.brake * dt);
      } else {
        // Natural drag
        if (this.speed < 5) {
          this.speed = Math.min(5, this.speed + this.accel * 0.4 * dt);
        } else if (this.speed > 5) {
          this.speed = Math.max(5, this.speed - this.drag * dt);
        }
      }

      // Nitro management
      if (this.nitroOn && input.nitro) {
        this.nitro = Math.max(0, this.nitro - 0.9 * dt);
        if (this.nitro === 0) this.nitroOn = false;
      } else {
        if (input.nitro && this.nitro > 0) this.nitroOn = true;
        else this.nitroOn = false;
        this.nitro = Math.min(100, this.nitro + 0.18 * dt);
      }

      // Smooth lane change
      const dx = this.targetX - this.x;
      if (Math.abs(dx) > 0.5) {
        this.x += dx * this.laneChangeSpeed * dt * 1.5;
        this.laneChanging = true;
      } else {
        this.x = this.targetX;
        this.laneChanging = false;
      }

      // Wobble decay
      if (this.wobble !== 0) {
        this.wobble *= 0.85;
        this.x += Math.sin(Date.now() * 0.05) * this.wobble * 0.3;
        if (Math.abs(this.wobble) < 0.1) this.wobble = 0;
      }

      // km/h display (scale: maxSpeed px/frame ≈ 300 km/h)
      this.kmh = Math.round((this.speed / this.maxSpeed) * 300);
    }

    setLane(laneX) {
      this.targetX = laneX;
    }

    triggerWobble(strength = 3) {
      this.wobble = strength;
    }
  }

  /* ══════════════════════════════
     TRAFFIC VEHICLE
  ══════════════════════════════ */
  class TrafficVehicle {
    constructor({ x, y, lane, laneX, speed, color, typeIdx, oncoming }) {
      const tpl  = VEHICLE_TYPES[typeIdx % VEHICLE_TYPES.length];
      this.x     = x;
      this.y     = y;
      this.lane  = lane;
      this.laneX = laneX;
      this.targetX = laneX;
      this.w     = tpl.w;
      this.h     = tpl.h;
      this.type  = tpl.type;
      this.color = color;
      this.speed = speed;      // px/frame relative to road
      this.oncoming = oncoming || false;
      this.scored  = false;    // near-miss flag
      this.active  = true;
      this.wobble  = 0;        // lane-locked traffic
      this.wobbleT = 0;
    }

    update(roadSpeed, dt) {
      // Scroll toward player (road moves down = cars move down when slower)
      if (this.oncoming) {
        this.y += (this.speed + roadSpeed) * dt;
      } else {
        this.y += (roadSpeed - this.speed) * dt;
      }

      // Keep traffic centered in its lane
      this.x = this.laneX;
    }

    isOffscreen(H) {
      return this.y > H + this.h + 20 || this.y < -this.h - 20;
    }
  }

  /* ══════════════════════════════
     COLLISION
  ══════════════════════════════ */
  function checkCollision(a, b, margin = 4) {
    return (
      Math.abs(a.x - b.x) < (a.w + b.w) / 2 - margin &&
      Math.abs(a.y - b.y) < (a.h + b.h) / 2 - margin
    );
  }

  function checkNearMiss(player, car) {
    const dx = Math.abs(player.x - car.x);
    const dy = Math.abs(player.y - car.y);
    const within_y = dy < (player.h + car.h) / 2 + 5;
    const near_x   = dx < (player.w + car.w) / 2 + 22;
    const far_x    = dx > (player.w + car.w) / 2 - 2;
    return within_y && near_x && far_x;
  }

  /* ══════════════════════════════
     PARTICLE POOL
  ══════════════════════════════ */
  const particles = [];

  function spawnExplosion(x, y, count = 40) {
    const colors = ['#ff4400','#ff8c00','#ffcc00','#ffffff','#ff2200'];
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 6;
      particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1,
        decay: 0.022 + Math.random() * 0.02,
        size: 2 + Math.random() * 6,
        color: colors[Math.floor(Math.random() * colors.length)],
        isSmoke: false,
      });
    }
  }

  function spawnSparks(x, y, dir = 0, count = 15) {
    for (let i = 0; i < count; i++) {
      particles.push({
        x, y,
        vx: (Math.random()-0.5)*4 + Math.cos(dir)*3,
        vy: (Math.random()-0.5)*4 + Math.sin(dir)*3,
        life: 1,
        decay: 0.05 + Math.random()*0.05,
        size: 1 + Math.random()*3,
        color: Math.random() > 0.5 ? '#ffcc00' : '#ff8c00',
        isSmoke: false,
      });
    }
  }

  function spawnSmoke(x, y, count = 8) {
    for (let i = 0; i < count; i++) {
      particles.push({
        x: x + (Math.random()-0.5)*16,
        y: y + (Math.random()-0.5)*8,
        vx: (Math.random()-0.5)*1.5,
        vy: -(1 + Math.random()*2),
        life: 1,
        decay: 0.03 + Math.random()*0.02,
        size: 8 + Math.random()*12,
        color: '#666666aa',
        isSmoke: true,
      });
    }
  }

  function updateParticles(dt) {
    for (let i = particles.length-1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 0.1 * dt; // gravity
      p.life -= p.decay * dt;
      if (p.life <= 0) particles.splice(i, 1);
    }
  }

  function clearParticles() { particles.length = 0; }

  /* ══════════════════════════════
     FLOAT LABELS
  ══════════════════════════════ */
  const floats = [];

  function addFloat(x, y, text, color = '#ffcc00', size = 16) {
    floats.push({ x, y, text, color, size, life: 1.2, vy: -1.2 });
  }

  function updateFloats(dt) {
    for (let i = floats.length-1; i >= 0; i--) {
      const f = floats[i];
      f.y  -= f.vy * dt;
      f.life -= 0.022 * dt;
      if (f.life <= 0) floats.splice(i, 1);
    }
  }

  function clearFloats() { floats.length = 0; }

  /* ══════════════════════════════
     TRAFFIC COLOR HELPER
  ══════════════════════════════ */
  function randomTrafficColor() {
    return TRAFFIC_COLORS[Math.floor(Math.random() * TRAFFIC_COLORS.length)];
  }

  return {
    Player, TrafficVehicle,
    VEHICLE_TYPES,
    checkCollision, checkNearMiss,
    particles, updateParticles, clearParticles,
    spawnExplosion, spawnSparks, spawnSmoke,
    floats, addFloat, updateFloats, clearFloats,
    randomTrafficColor,
  };
})();
