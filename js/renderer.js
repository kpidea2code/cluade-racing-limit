/**
 * renderer.js — Canvas 2D rendering engine
 * Draws road, scenery, vehicles, particles, and speed gauge
 */
const Renderer = (() => {
  let canvas, ctx, W, H;
  let gaugeCanvas, gaugeCtx;
  let nightMode = false;
  let roadOffset = 0;
  let bgOffset = 0;

  /* ── Palette ── */
  const PAL = {
    roadDay:  ['#2a2a35', '#252530', '#2a2a35'],
    roadNight:['#141420', '#111118', '#141420'],
    sky:      ['#0a0b14', '#0d1020'],
    skyNight: ['#03040a', '#06080f'],
    curb:     '#cc3300',
    lane:     'rgba(255,255,255,0.25)',
    laneEdge: 'rgba(255,255,255,0.7)',
    pole:     '#223344',
    lamp:     '#ffe0a0',
    building: ['#0d1520','#111822','#0a1018'],
  };

  function init(canvasEl, gaugeEl) {
    canvas = canvasEl;
    ctx = canvas.getContext('2d', { alpha: false });
    gaugeCanvas = gaugeEl;
    gaugeCtx = gaugeCanvas.getContext('2d');
    resize();
  }

  function resize() {
    W = canvas.width  = canvas.offsetWidth  || window.innerWidth;
    H = canvas.height = canvas.offsetHeight || window.innerHeight;
  }

  function setNightMode(val) { nightMode = val; }

  /* ══════════════════════════════
     ROAD LAYOUT — computed each frame
  ══════════════════════════════ */
  function getRoadGeom(laneCount) {
    const totalW = Math.min(W * 0.7, 500);
    const left   = (W - totalW) / 2;
    const right  = left + totalW;
    const laneW  = totalW / laneCount;
    return { left, right, totalW, laneW, laneCount };
  }

  function laneCenter(lane, geom) {
    return geom.left + lane * geom.laneW + geom.laneW / 2;
  }

  /* ══════════════════════════════
     BACKGROUND
  ══════════════════════════════ */
  function drawBackground() {
    const [c1, c2] = nightMode ? PAL.skyNight : PAL.sky;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, c1);
    g.addColorStop(1, c2);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  /* ── Buildings / Scenery ── */
  function drawScenery(geom) {
    const { left, right } = geom;
    const scroll = bgOffset % (H * 1.5);
    for (let side = 0; side < 2; side++) {
      const baseX = side === 0 ? 0 : right;
      const maxW  = side === 0 ? left : W - right;
      if (maxW < 10) continue;

      for (let i = 0; i < 4; i++) {
        const seed = side * 100 + i;
        const bH   = 60 + ((seed * 37) % 120);
        const bW   = 20 + ((seed * 13) % (maxW * 0.6));
        const bX   = side === 0
          ? ((seed * 29) % (maxW - bW))
          : right + ((seed * 29) % (maxW - bW));
        const bY   = ((scroll + seed * 80) % (H + bH)) - bH;
        const col  = PAL.building[i % PAL.building.length];
        ctx.fillStyle = col;
        ctx.fillRect(bX, bY, bW, bH);

        // windows
        ctx.fillStyle = nightMode ? '#ffe08022' : '#ffffff0a';
        for (let wy = bY + 8; wy < bY + bH - 8; wy += 14) {
          for (let wx = bX + 4; wx < bX + bW - 4; wx += 10) {
            if ((seed + wy + wx) % 3 !== 0) {
              ctx.fillRect(wx, wy, 5, 8);
            }
          }
        }
      }
    }
  }

  /* ── Street lamps ── */
  function drawLamps(geom) {
    const { left, right } = geom;
    const spacing = H / 3;
    const offset  = roadOffset % spacing;
    for (let i = -1; i < 5; i++) {
      const y = i * spacing - offset;
      // Left lamp
      drawLamp(left - 14, y);
      // Right lamp
      drawLamp(right + 14, y, true);
    }
  }

  function drawLamp(x, y, flip = false) {
    const armLen = 18;
    ctx.strokeStyle = PAL.pole;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x, y + 50);
    ctx.lineTo(x, y);
    ctx.stroke();
    // arm
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (flip ? -armLen : armLen), y - 10);
    ctx.stroke();
    // light
    const lx = x + (flip ? -armLen : armLen);
    const ly = y - 10;
    ctx.fillStyle = PAL.lamp;
    ctx.shadowColor = PAL.lamp;
    ctx.shadowBlur  = nightMode ? 20 : 8;
    ctx.beginPath();
    ctx.arc(lx, ly, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  /* ── Road surface ── */
  function drawRoad(geom) {
    const { left, right, laneW, laneCount } = geom;
    const cols = nightMode ? PAL.roadNight : PAL.roadDay;
    const g = ctx.createLinearGradient(left, 0, right, 0);
    g.addColorStop(0,   cols[0]);
    g.addColorStop(0.5, cols[1]);
    g.addColorStop(1,   cols[2]);
    ctx.fillStyle = g;
    ctx.fillRect(left, 0, right - left, H);

    // Curb stripes (left & right edge)
    const curbW = 8;
    const stripeH = 24;
    for (let i = -1; i < Math.ceil(H / stripeH) + 1; i++) {
      const y = i * stripeH - (roadOffset % stripeH);
      ctx.fillStyle = i % 2 === 0 ? PAL.curb : '#eee';
      ctx.fillRect(left - curbW, y, curbW, stripeH);
      ctx.fillRect(right, y, curbW, stripeH);
    }

    // White edge lines
    ctx.strokeStyle = PAL.laneEdge;
    ctx.lineWidth = 2;
    ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(left, 0);  ctx.lineTo(left, H);  ctx.stroke();
    ctx.beginPath(); ctx.moveTo(right, 0); ctx.lineTo(right, H); ctx.stroke();

    // Dashed lane dividers
    ctx.strokeStyle = PAL.lane;
    ctx.lineWidth = 2;
    ctx.setLineDash([30, 22]);
    ctx.lineDashOffset = -(roadOffset % 52);
    for (let l = 1; l < laneCount; l++) {
      const lx = left + l * laneW;
      ctx.beginPath(); ctx.moveTo(lx, 0); ctx.lineTo(lx, H); ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  /* ══════════════════════════════
     VEHICLE DRAWING
  ══════════════════════════════ */
  function shadeHex(hex, amt) {
    const n = parseInt(hex.replace('#',''),16);
    const clamp = v => Math.min(255, Math.max(0, v));
    const r = clamp((n>>16) + amt);
    const g = clamp(((n>>8)&0xff) + amt);
    const b = clamp((n&0xff) + amt);
    return `rgb(${r},${g},${b})`;
  }

  function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x+r,y);
    c.lineTo(x+w-r,y); c.quadraticCurveTo(x+w,y,x+w,y+r);
    c.lineTo(x+w,y+h-r); c.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
    c.lineTo(x+r,y+h); c.quadraticCurveTo(x,y+h,x,y+h-r);
    c.lineTo(x,y+r); c.quadraticCurveTo(x,y,x+r,y);
    c.closePath();
  }

  function drawVehicle(v, isPlayer) {
    const { x, y, w, h, color, type, nitroOn } = v;
    ctx.save();
    ctx.translate(x, y);
    if (!isPlayer) ctx.scale(1, -1); // traffic faces away

    const hw = w/2, hh = h/2;

    // Drop shadow
    ctx.fillStyle = '#00000044';
    roundRect(ctx, -hw+3, -hh+6, w, h, 6);
    ctx.fill();

    // Body gradient
    const bodyG = ctx.createLinearGradient(-hw, 0, hw, 0);
    bodyG.addColorStop(0,   shadeHex(color, -35));
    bodyG.addColorStop(0.45, color);
    bodyG.addColorStop(1,   shadeHex(color, -50));
    ctx.fillStyle = bodyG;
    roundRect(ctx, -hw, -hh, w, h, 6);
    ctx.fill();

    if (type === 'truck') {
      // Cargo section
      ctx.fillStyle = shadeHex(color, -60);
      roundRect(ctx, -hw+2, -hh, w-4, h*0.55, 4);
      ctx.fill();
      // Cab
      ctx.fillStyle = shadeHex(color, 10);
      roundRect(ctx, -hw+2, hh-h*0.48, w-4, h*0.46, 4);
      ctx.fill();
    } else if (type === 'suv') {
      ctx.fillStyle = shadeHex(color, 15);
      roundRect(ctx, -hw+3, -hh, w-6, h*0.5, 4);
      ctx.fill();
    }

    // Windshield
    if (type !== 'truck') {
      ctx.fillStyle = isPlayer ? '#aaddff88' : '#88aacc66';
      roundRect(ctx, -hw+5, -hh+6, w-10, h*0.26, 3);
      ctx.fill();
      // Rear window
      ctx.fillStyle = '#88aacc55';
      roundRect(ctx, -hw+6, hh-h*0.24, w-12, h*0.18, 3);
      ctx.fill();
    }

    // Headlights
    if (isPlayer) {
      ctx.fillStyle = '#ffffcc';
      ctx.shadowBlur = 16; ctx.shadowColor = '#ffffaa';
      ctx.fillRect(-hw+3, -hh+2, 8, 4);
      ctx.fillRect(hw-11, -hh+2, 8, 4);
      // Tail lights
      ctx.shadowBlur = 12; ctx.shadowColor = '#ff2200';
      ctx.fillStyle = '#ff3300';
      ctx.fillRect(-hw+3, hh-7, 8, 5);
      ctx.fillRect(hw-11, hh-7, 8, 5);
    } else {
      ctx.fillStyle = '#ffeeaa';
      ctx.shadowBlur = 10; ctx.shadowColor = '#ffeeaa';
      ctx.fillRect(-hw+3, -hh+2, 7, 4);
      ctx.fillRect(hw-10, -hh+2, 7, 4);
    }
    ctx.shadowBlur = 0;

    // Wheels
    ctx.fillStyle = '#111';
    ctx.fillRect(-hw-3, -hh+8,  5, 12);
    ctx.fillRect(hw-2,  -hh+8,  5, 12);
    ctx.fillRect(-hw-3,  hh-22, 5, 12);
    ctx.fillRect(hw-2,   hh-22, 5, 12);

    // Player glow / nitro glow
    if (isPlayer) {
      ctx.strokeStyle = nitroOn ? '#00e5ff' : '#ff4400aa';
      ctx.lineWidth = 2;
      ctx.shadowBlur  = nitroOn ? 24 : 12;
      ctx.shadowColor = nitroOn ? '#00e5ff' : '#ff4400';
      roundRect(ctx, -hw-1, -hh-1, w+2, h+2, 7);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    ctx.restore();
  }

  /* ══════════════════════════════
     PARTICLES
  ══════════════════════════════ */
  function drawParticles(particles) {
    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle   = p.color;
      if (p.isSmoke) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (1 + (1-p.life)), 0, Math.PI*2);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI*2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  /* ── Float score labels ── */
  function drawFloats(floats) {
    ctx.textAlign = 'center';
    for (const f of floats) {
      ctx.globalAlpha = Math.max(0, f.life);
      ctx.font = `900 ${f.size || 16}px 'Orbitron', monospace`;
      ctx.fillStyle   = f.color || '#ffcc00';
      ctx.shadowBlur  = 10;
      ctx.shadowColor = f.color || '#ffcc00';
      ctx.fillText(f.text, f.x, f.y);
      ctx.shadowBlur  = 0;
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
  }

  /* ══════════════════════════════
     SPEED GAUGE
  ══════════════════════════════ */
  function drawSpeedGauge(speedKmh, maxSpeed) {
    const gW = gaugeCanvas.width;
    const gH = gaugeCanvas.height;
    const gc = gaugeCtx;
    gc.clearRect(0, 0, gW, gH);

    const cx = gW / 2, cy = gH - 4;
    const r  = gH - 8;
    const startAngle = Math.PI;
    const endAngle   = 0;
    const fraction   = Math.min(speedKmh / maxSpeed, 1);
    const angle      = startAngle + fraction * Math.PI;

    // Track
    gc.beginPath();
    gc.arc(cx, cy, r, startAngle, endAngle, false);
    gc.strokeStyle = '#ffffff18';
    gc.lineWidth = 6;
    gc.stroke();

    // Fill
    const color = speedKmh > maxSpeed * 0.8 ? '#ff4400'
                : speedKmh > maxSpeed * 0.5 ? '#ff8c00' : '#00e5ff';
    gc.beginPath();
    gc.arc(cx, cy, r, startAngle, angle, false);
    gc.strokeStyle = color;
    gc.lineWidth = 6;
    gc.shadowBlur  = 10;
    gc.shadowColor = color;
    gc.stroke();
    gc.shadowBlur = 0;

    // Needle
    const nx = cx + Math.cos(angle) * (r - 2);
    const ny = cy + Math.sin(angle) * (r - 2);
    gc.beginPath();
    gc.moveTo(cx, cy);
    gc.lineTo(nx, ny);
    gc.strokeStyle = '#fff';
    gc.lineWidth = 2;
    gc.stroke();
  }

  /* ══════════════════════════════
     CRASH FLASH
  ══════════════════════════════ */
  function drawCrashFlash(alpha) {
    ctx.fillStyle = `rgba(255,60,0,${alpha})`;
    ctx.fillRect(0, 0, W, H);
  }

  /* ══════════════════════════════
     MASTER DRAW
  ══════════════════════════════ */
  function draw({ laneCount, twoWay, vehicles, player, particles, floats,
                  roadOff, bgOff, crashFlash, nitroOn }) {
    roadOffset = roadOff || 0;
    bgOffset   = bgOff   || 0;

    const geom = getRoadGeom(laneCount);

    drawBackground();
    drawScenery(geom);
    drawLamps(geom);
    drawRoad(geom);

    // Exhaust / nitro stream behind player
    if (player && !player.crashed) {
      emitExhaust(player, nitroOn);
    }

    // Vehicles (traffic)
    for (const v of vehicles) {
      drawVehicle(v, false);
    }

    // Particles
    drawParticles(particles);

    // Player
    if (player && !player.crashed) {
      player.nitroOn = nitroOn;
      drawVehicle(player, true);
    }

    // Float labels
    drawFloats(floats);

    // Crash flash
    if (crashFlash > 0) drawCrashFlash(crashFlash);
  }

  // Exhaust effect integrated into draw to avoid needing external particle array
  const _exhaust = [];
  function emitExhaust(player, nitro) {
    // push tiny smoke puffs
    for (let i = 0; i < (nitro ? 4 : 1); i++) {
      _exhaust.push({
        x: player.x + (Math.random()-0.5)*8,
        y: player.y + player.h/2 + 4,
        vx: (Math.random()-0.5)*1.5,
        vy: 1.5 + Math.random(),
        life: 1,
        decay: nitro ? 0.08 : 0.06,
        size: nitro ? 6 : 3,
        color: nitro ? '#00e5ff88' : '#aaaaaa44',
        isSmoke: true,
      });
    }
    for (let i = _exhaust.length-1; i >= 0; i--) {
      const p = _exhaust[i];
      p.x += p.vx; p.y += p.vy;
      p.life -= p.decay;
      if (p.life <= 0) { _exhaust.splice(i,1); continue; }
      ctx.globalAlpha = Math.max(0, p.life * 0.7);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size*(2-p.life), 0, Math.PI*2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  return {
    init, resize, setNightMode,
    draw, drawSpeedGauge,
    getRoadGeom, laneCenter,
    W: () => W, H: () => H,
  };
})();
