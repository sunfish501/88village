// Rendering: camera, y-sorted world, cars, day/night lighting, overlays.
const Cam = { x: 0, y: 0, zoom: 2, follow: null };
const Gfx = { canvas: null, ctx: null, ground: null, sprites: {}, heads: {}, light: null, lctx: null, dpr: 1, hover: null, selected: null };


// ---- cars ----
const CAR_COLORS = ['#e8e8e4', '#2e2e34', '#c9443a', '#3f6fb3', '#9aa0a8', '#f2c94a', '#3f8a5a'];
const Cars = [];
function carSprite(color, vertical) {
  const w = vertical ? 18 : 30, h = vertical ? 30 : 20;
  const [c, g] = mkCanvas(w, h);
  if (!vertical) {
    R(g, 3, 15, 6, 4, '#1e1e22'); R(g, 21, 15, 6, 4, '#1e1e22');
    R(g, 1, 6, 28, 11, color); R(g, 6, 2, 17, 6, color);
    R(g, 8, 3, 6, 4, '#8fbcd8'); R(g, 15, 3, 6, 4, '#8fbcd8');
    R(g, 1, 13, 28, 1, shadeHex(color.startsWith('#') ? color : '#888888', 0.75));
    R(g, 27, 8, 2, 3, '#fff2b0'); R(g, 1, 8, 2, 3, '#e04040');
  } else {
    R(g, 1, 4, 3, 6, '#1e1e22'); R(g, 14, 4, 3, 6, '#1e1e22'); R(g, 1, 20, 3, 6, '#1e1e22'); R(g, 14, 20, 3, 6, '#1e1e22');
    R(g, 2, 1, 14, 28, color); R(g, 4, 6, 10, 6, '#8fbcd8'); R(g, 4, 19, 10, 4, '#8fbcd8'); R(g, 3, 12, 12, 7, shadeHex(color, 1.1));
  }
  outline(g, w, h);
  return c;
}
function initCars() {
  const lanes = [
    { axis: 'h', dir: -1, fixed: 31 * TILE - 2 }, { axis: 'h', dir: 1, fixed: 33 * TILE - 2 },
    { axis: 'v', dir: 1, fixed: 47 * TILE - 1 }, { axis: 'v', dir: -1, fixed: 49 * TILE - 1 },
  ];
  for (const lane of lanes) for (let i = 0; i < 2; i++) {
    const col = CAR_COLORS[(Cars.length * 3) % CAR_COLORS.length];
    const len = lane.axis === 'h' ? MW * TILE : MH * TILE;
    Cars.push({ ...lane, pos: (i * 0.5 + rand() * 0.3) * len, len, speed: 55 + rand() * 25, canvas: carSprite(col, lane.axis === 'v'), wait: 0 });
  }
}
function updateCars(realDt) {
  const k = Math.min(Sim.speed, 4);
  for (const car of Cars) {
    const front = car.pos + car.dir * 20;
    let blocked = false;
    for (const a of Sim.agents) {
      if (a.inside) continue;
      if (World.t(a.tx, a.ty) !== T.CROSSWALK && World.t(a.tx, a.ty) !== T.ASPHALT) continue;
      const along = car.axis === 'h' ? a.px : a.py, across = car.axis === 'h' ? a.py : a.px;
      const d = (along - front) * car.dir;
      if (d > -6 && d < 26 && Math.abs(across - car.fixed) < 34) { blocked = true; break; }
    }
    if (!blocked) car.pos += car.dir * car.speed * k * realDt;
    if (car.pos < -40) car.pos += car.len + 80;
    if (car.pos > car.len + 40) car.pos -= car.len + 80;
  }
}
function carDrawable(car) {
  const cw = car.canvas.width, ch = car.canvas.height;
  let x, y;
  if (car.axis === 'h') { x = car.pos - cw / 2; y = car.fixed - ch / 2 - 2; }
  else { x = car.fixed - cw / 2; y = car.pos - ch / 2; }
  return { canvas: car.canvas, x, y, baseY: y + ch, flip: car.axis === 'h' && car.dir < 0, flipV: car.axis === 'v' && car.dir < 0, car };
}

// ---- lighting ----
function darkness(h) {
  if (h >= 7 && h < 17.5) return 0;
  if (h >= 17.5 && h < 20) return (h - 17.5) / 2.5 * 0.66;
  if (h >= 5.5 && h < 7) return (7 - h) / 1.5 * 0.66;
  return 0.66;
}
function sunsetTint(h) {
  if (h >= 16.5 && h < 19.5) return Math.sin((h - 16.5) / 3 * Math.PI) * 0.16;
  if (h >= 5.5 && h < 7.5) return Math.sin((h - 5.5) / 2 * Math.PI) * 0.1;
  return 0;
}
function lightOn(l, h) {
  if (l.c === 'lamp' || l.c === 'cross' || l.c === 'hcross' || l.c === 'siren' || l.c === 'shop24') return true;
  const b = World.buildings[l.building];
  if (l.c === 'sign' || l.c === 'shop') return !b || isOpen(b.id);
  if (l.c === 'win') {
    if (!b) return false;
    if (OPEN_HOURS[b.id] && isOpen(b.id) && b.id !== 'store' && b.id !== 'police' && b.id !== 'studycafe') return true;
    return Sim.agents.some((a) => a.inside === b && a.act && a.act.key !== 'sleep');
  }
  return false;
}

// ---- main render ----
function render(now) {
  const { canvas: cv, ctx } = Gfx;
  const dpr = Gfx.dpr, z = Cam.zoom * dpr;
  const vw = cv.width / z, vh = cv.height / z;
  if (Cam.follow) {
    const a = Cam.follow;
    Cam.x += (a.px - vw / 2 - Cam.x) * 0.12; Cam.y += (a.py - vh / 2 - Cam.y) * 0.12;
  }
  clampCam();
  const cx = Math.round(Cam.x * z) / z, cy = Math.round(Cam.y * z) / z;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#2d4a2a'; ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.setTransform(z, 0, 0, z, -cx * z, -cy * z);
  ctx.drawImage(Gfx.ground, 0, 0);

  // water shimmer
  const tq = Math.floor(now / 400);
  ctx.fillStyle = 'rgba(190,230,250,0.75)';
  for (const [x, y] of World.waterTiles) {
    if (x * TILE < cx - 16 || x * TILE > cx + vw || y * TILE < cy - 16 || y * TILE > cy + vh) continue;
    const hsh = hash2(x, y, tq % 7);
    if (hsh > 0.82) ctx.fillRect(x * TILE + ((hsh * 50) | 0) % 11, y * TILE + ((hsh * 90) | 0) % 14, 4, 1);
  }

  // drawables
  const list = [];
  const inView = (x, y, w, h) => x + w > cx && x < cx + vw && y + h > cy && y < cy + vh;
  for (const o of World.objects) if (inView(o.x, o.y, o.canvas.width, o.canvas.height)) list.push(o);
  for (const car of Cars) { const d = carDrawable(car); if (inView(d.x, d.y, 32, 32)) list.push(d); }
  for (const a of Sim.agents) if (!a.inside && inView(a.px - 16, a.py - 28, 32, 34)) list.push({ agent: a, baseY: a.py + 6 });
  const cat = catDrawable(now); if (cat) list.push(cat);
  list.sort((p, q) => p.baseY - q.baseY);

  for (const d of list) {
    if (d.agent) { drawAgent(ctx, d.agent); continue; }
    if (d.flip || d.flipV) {
      ctx.save();
      ctx.translate(d.x + (d.flip ? d.canvas.width : 0), d.y + (d.flipV ? d.canvas.height : 0));
      ctx.scale(d.flip ? -1 : 1, d.flipV ? -1 : 1);
      ctx.drawImage(d.canvas, 0, 0); ctx.restore();
    } else ctx.drawImage(d.canvas, d.x, d.y);
  }

  // power lines
  ctx.strokeStyle = 'rgba(30,30,34,0.75)'; ctx.lineWidth = 0.7;
  const P = World.poleTops;
  for (let i = 0; i + 1 < P.length; i++) for (const off of [-7, 7]) {
    const [x0, y0] = P[i], [x1, y1] = P[i + 1];
    ctx.beginPath(); ctx.moveTo(x0 + off, y0); ctx.quadraticCurveTo((x0 + x1) / 2, y0 + 10, x1 + off, y1); ctx.stroke();
  }

  // lighting overlay
  const h = hourOf(Sim.minute);
  const dark = darkness(h), tint = sunsetTint(h);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (tint > 0) { ctx.fillStyle = `rgba(255,130,60,${tint})`; ctx.fillRect(0, 0, cv.width, cv.height); }
  if (dark > 0.02) {
    const L = Gfx.lctx, lc = Gfx.light;
    if (lc.width !== cv.width || lc.height !== cv.height) { lc.width = cv.width; lc.height = cv.height; }
    L.globalCompositeOperation = 'source-over';
    L.clearRect(0, 0, lc.width, lc.height);
    L.fillStyle = `rgba(14,18,52,${dark})`; L.fillRect(0, 0, lc.width, lc.height);
    L.globalCompositeOperation = 'destination-out';
    const glows = [];
    const lights = World.lights.concat(Cars.map((car) => (car.axis === 'h'
      ? { x: car.pos + car.dir * 18, y: car.fixed - 2, r: 30, c: 'lamp' }
      : { x: car.fixed, y: car.pos + car.dir * 18, r: 30, c: 'lamp' })));
    for (const l of lights) {
      const sx = (l.x - cx) * z, sy = (l.y - cy) * z, r = l.r * z;
      if (sx < -r || sy < -r || sx > cv.width + r || sy > cv.height + r) continue;
      if (!lightOn(l, h)) continue;
      const g = L.createRadialGradient(sx, sy, 0, sx, sy, r);
      g.addColorStop(0, 'rgba(0,0,0,0.85)'); g.addColorStop(0.5, 'rgba(0,0,0,0.45)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      L.fillStyle = g; L.fillRect(sx - r, sy - r, r * 2, r * 2);
      glows.push([sx, sy, r, l]);
    }
    ctx.drawImage(lc, 0, 0);
    ctx.globalCompositeOperation = 'lighter';
    for (const [sx, sy, r, l] of glows) {
      let col = l.col || '#ffcf7a';
      if (l.c === 'cross' || l.c === 'hcross') col = '#ff2a2a';
      if (l.c === 'siren') col = Math.floor(now / 400) % 2 ? '#ff3030' : '#3060ff';
      const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, r * 0.8);
      g.addColorStop(0, hexA(col, 0.2 * dark / 0.66)); g.addColorStop(1, hexA(col, 0));
      ctx.fillStyle = g; ctx.fillRect(sx - r, sy - r, r * 2, r * 2);
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  if (Sim.weather === 'rain') drawRain(ctx, cv, now);
  drawOverlays(ctx, cx, cy, z, now);
}

function drawRain(ctx, cv, now) {
  ctx.fillStyle = 'rgba(40,60,90,0.18)'; ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.strokeStyle = 'rgba(200,225,255,0.55)'; ctx.lineWidth = 1 * Gfx.dpr;
  ctx.beginPath();
  const n = Math.floor(cv.width * cv.height / 9000);
  for (let i = 0; i < n; i++) {
    const x = (hash2(i, 1) * cv.width + now * 0.05) % cv.width;
    const y = (hash2(i, 2) * cv.height + now * 0.9 * (0.7 + hash2(i, 3) * 0.6)) % cv.height;
    ctx.moveTo(x, y); ctx.lineTo(x - 3 * Gfx.dpr, y + 12 * Gfx.dpr);
  }
  ctx.stroke();
}

// small cat that wanders around the fountain during the cat event
const CAT = { canvas: null };
function catSprite() {
  const [c, g] = mkCanvas(16, 12);
  R(g, 3, 4, 10, 5, '#f0a040'); R(g, 10, 1, 5, 5, '#f0a040'); R(g, 10, 0, 1, 2, '#f0a040'); R(g, 14, 0, 1, 2, '#f0a040');
  R(g, 4, 9, 2, 3, '#f0a040'); R(g, 10, 9, 2, 3, '#f0a040'); R(g, 0, 2, 3, 2, '#f0a040'); R(g, 1, 3, 2, 2, '#f0a040');
  R(g, 5, 5, 2, 1, '#d88020'); R(g, 8, 6, 2, 1, '#d88020'); R(g, 11, 3, 1, 1, '#222'); R(g, 13, 3, 1, 1, '#222');
  outline(g, 16, 12);
  return c;
}
function catDrawable(now) {
  const ev = Sim.activeEvent;
  if (!ev || ev.kind !== 'cat') return null;
  CAT.canvas ||= catSprite();
  const c = World.spots.event_centers.fountain;
  const t = now / 2500;
  const x = c.x * TILE + 8 + Math.sin(t) * 40, y = c.y * TILE + 4 + Math.sin(t * 1.7) * 6;
  return { canvas: CAT.canvas, x: x - 8, y: y - 10, baseY: y + 2, flip: Math.cos(t) < 0 };
}

function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

const DIR_ROW = { down: 0, left: 1, right: 2, up: 3 };
function drawAgent(ctx, a) {
  const img = Gfx.sprites[a.id];
  if (Gfx.selected === a) {
    ctx.fillStyle = 'rgba(255,230,90,0.55)';
    ctx.beginPath(); ctx.ellipse(a.px, a.py + 5, 10, 4, 0, 0, 7); ctx.fill();
  }
  if (!img) return;
  const col = a.state === 'walking' ? [0, 1, 2, 1][Math.floor(a.walkPhase) % 4] : 1;
  ctx.drawImage(img, col * 32, DIR_ROW[a.dir] * 32, 32, 32, Math.round(a.px - 16), Math.round(a.py - 26), 32, 32);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

function drawOverlays(ctx, cx, cy, z, now) {
  const dpr = Gfx.dpr;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  // occupants badges on buildings
  const groups = {};
  for (const a of Sim.agents) if (a.inside) (groups[a.inside.id] ||= []).push(a);
  for (const [bid, list] of Object.entries(groups)) {
    const b = World.buildings[bid];
    if (b.virtual) continue;
    const sx = ((b.door.x * TILE + 8) - cx) * z, sy = ((b.y + b.h) * TILE - 6 - cy) * z - 34 * dpr;
    const size = 22 * dpr, gap = 3 * dpr, total = list.length * size + (list.length - 1) * gap;
    ctx.fillStyle = 'rgba(40,30,24,0.78)';
    roundRect(ctx, sx - total / 2 - 4 * dpr, sy - 4 * dpr, total + 8 * dpr, size + 8 * dpr, 6 * dpr); ctx.fill();
    list.forEach((a, i) => {
      const x = sx - total / 2 + i * (size + gap);
      const head = Gfx.heads[a.id];
      if (head) ctx.drawImage(head, x, sy, size, size);
      if (Gfx.selected === a) { ctx.strokeStyle = '#ffe45a'; ctx.lineWidth = 2 * dpr; ctx.strokeRect(x, sy, size, size); }
      const mark = !a.act ? null : (a.act.key === 'sleep' || a.act.key === 'oversleep') ? '💤' : a.act.key === 'kidnapped' ? '😱' : a.act.key === 'date' ? '💕' : null;
      if (mark) {
        ctx.font = `${11 * dpr}px sans-serif`; ctx.fillText(mark, x + size - 2 * dpr, sy + 2 * dpr);
      }
    });
  }

  // names + bubbles
  const showNames = Cam.zoom >= 1.6;
  for (const a of Sim.agents) {
    if (a.inside) continue;
    const sx = (a.px - cx) * z, sy = (a.py - 27 - cy) * z;
    if (sx < -100 || sx > Gfx.canvas.width + 100 || sy < -60 || sy > Gfx.canvas.height + 60) continue;
    const sel = Gfx.selected === a || Gfx.hover === a;
    if (showNames || sel) {
      const label = (a.act && !a.chat ? a.act.def.emoji + ' ' : '') + a.def.short;
      ctx.font = `${(sel ? 12 : 11) * dpr}px ${PIXFONT}`;
      const w = ctx.measureText(label).width + 10 * dpr;
      ctx.fillStyle = sel ? 'rgba(255,228,90,0.95)' : 'rgba(30,24,20,0.6)';
      roundRect(ctx, sx - w / 2, sy - 9 * dpr, w, 16 * dpr, 4 * dpr); ctx.fill();
      ctx.fillStyle = sel ? '#2a1e14' : '#ffffff';
      ctx.fillText(label, sx, sy - 0.5 * dpr);
    }
    if (a.bubble && a.bubble.until > now) {
      ctx.font = `${12 * dpr}px ${PIXFONT}`;
      const tw = ctx.measureText(a.bubble.text).width + 14 * dpr, th = 20 * dpr;
      const by = sy - (showNames || sel ? 32 : 18) * dpr;
      ctx.fillStyle = '#fffdf6'; ctx.strokeStyle = '#3a2e26'; ctx.lineWidth = 1.5 * dpr;
      roundRect(ctx, sx - tw / 2, by - th / 2, tw, th, 6 * dpr); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(sx - 4 * dpr, by + th / 2 - 1); ctx.lineTo(sx, by + th / 2 + 6 * dpr); ctx.lineTo(sx + 4 * dpr, by + th / 2 - 1); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#2a1e14'; ctx.fillText(a.bubble.text, sx, by + 0.5 * dpr);
    }
  }
}

function clampCam() {
  const z = Cam.zoom * Gfx.dpr;
  const vw = Gfx.canvas.width / z, vh = Gfx.canvas.height / z;
  const mw = MW * TILE, mh = MH * TILE;
  Cam.x = vw >= mw ? (mw - vw) / 2 : clamp(Cam.x, 0, mw - vw);
  Cam.y = vh >= mh ? (mh - vh) / 2 : clamp(Cam.y, 0, mh - vh);
}

function screenToWorld(sx, sy) {
  const z = Cam.zoom;
  return { x: Cam.x + sx / z, y: Cam.y + sy / z };
}

function agentAt(wx, wy) {
  let best = null, bd = 1e9;
  for (const a of Sim.agents) {
    if (a.inside) continue;
    if (wx > a.px - 10 && wx < a.px + 10 && wy > a.py - 24 && wy < a.py + 8) {
      const d = Math.abs(wy - a.py);
      if (d < bd) { bd = d; best = a; }
    }
  }
  return best;
}

function badgeAgentAt(sx, sy) {
  // sx, sy in CSS px
  const z = Cam.zoom;
  const groups = {};
  for (const a of Sim.agents) if (a.inside) (groups[a.inside.id] ||= []).push(a);
  for (const [bid, list] of Object.entries(groups)) {
    const b = World.buildings[bid];
    if (b.virtual) continue;
    const bx = ((b.door.x * TILE + 8) - Cam.x) * z, by = ((b.y + b.h) * TILE - 6 - Cam.y) * z - 34;
    const total = list.length * 22 + (list.length - 1) * 3;
    for (let i = 0; i < list.length; i++) {
      const x = bx - total / 2 + i * 25;
      if (sx >= x && sx <= x + 22 && sy >= by && sy <= by + 22) return list[i];
    }
  }
  return null;
}

function buildingAt(wx, wy) {
  for (const b of Object.values(World.buildings)) {
    const s = b.sprite;
    if (!s) continue;
    if (wx >= s.x && wx <= s.x + s.w && wy >= s.y && wy <= s.y + s.h) return b;
  }
  return null;
}
