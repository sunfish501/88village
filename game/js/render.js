// Rendering: camera, y-sorted world, cars, day/night lighting, overlays.
const Cam = { x: 0, y: 0, zoom: 2, follow: null };
const Gfx = { canvas: null, ctx: null, ground: null, sprites: {}, heads: {}, light: null, lctx: null, dpr: 1, hover: null, selected: null };


// cars, traffic lights and emergency vehicles live in traffic.js

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
  if (l.c === 'fire') return true;
  if (Sim.blackout > Sim.minute && l.c !== 'siren' && !l.car) return false;
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

  if (Sim.flood > Sim.minute) {
    ctx.fillStyle = 'rgba(74,149,196,0.78)';
    for (const [x, y] of World.trackTiles) if (x * TILE > cx - 16 && x * TILE < cx + vw && y * TILE > cy - 16 && y * TILE < cy + vh) ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
  }

  // drawables
  const list = [];
  const inView = (x, y, w, h) => x + w > cx && x < cx + vw && y + h > cy && y < cy + vh;
  for (const o of World.objects) if (inView(o.x, o.y, o.canvas.width, o.canvas.height)) list.push(o);
  for (const d of trafficDrawables()) if (d.draw || inView(d.x, d.y, d.canvas.width, d.canvas.height)) list.push(d);
  for (const d of worldExtras()) if (inView(d.x, d.y, d.canvas.width, d.canvas.height)) list.push(d);
  for (const a of Sim.agents) if (!a.inside && inView(a.px - 16, a.py - 28, 32, 34)) list.push({ agent: a, baseY: a.py + 6 });
  const cat = catDrawable(now); if (cat) list.push(cat);
  list.sort((p, q) => p.baseY - q.baseY);

  for (const d of list) {
    if (d.agent) { drawAgent(ctx, d.agent); continue; }
    if (d.draw) { d.draw(ctx, now); continue; }
    if (d.flip || d.flipV) {
      ctx.save();
      ctx.translate(d.x + (d.flip ? d.canvas.width : 0), d.y + (d.flipV ? d.canvas.height : 0));
      ctx.scale(d.flip ? -1 : 1, d.flipV ? -1 : 1);
      ctx.drawImage(d.canvas, 0, 0); ctx.restore();
    } else ctx.drawImage(d.canvas, d.x, d.y);
    if (d.post) d.post(ctx, now);
  }

  drawCrisisWorld(ctx, now, cx, cy, vw, vh);

  // power lines
  ctx.strokeStyle = 'rgba(30,30,34,0.75)'; ctx.lineWidth = 0.7;
  const P = World.poleTops;
  for (let i = 0; i + 1 < P.length; i++) for (const off of [-7, 7]) {
    const [x0, y0] = P[i], [x1, y1] = P[i + 1];
    ctx.beginPath(); ctx.moveTo(x0 + off, y0); ctx.quadraticCurveTo((x0 + x1) / 2, y0 + 10, x1 + off, y1); ctx.stroke();
  }

  // lighting overlay
  const h = hourOf(Sim.minute);
  let dark = darkness(h);
  const tint = sunsetTint(h);
  if (Sim.weather === 'storm') dark = Math.max(dark, 0.32);
  if (Sim.blackout > Sim.minute) dark = Math.min(0.8, dark * 1.2);
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
    const lights = World.lights.concat(trafficLights(), crisisLights());
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
      if (l.c === 'fire') col = '#ff7a20';
      if (l.c === 'siren') col = Math.floor(now / (l.car ? 250 : 400)) % 2 ? '#ff3030' : '#3060ff';
      const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, r * 0.8);
      g.addColorStop(0, hexA(col, 0.2 * dark / 0.66)); g.addColorStop(1, hexA(col, 0));
      ctx.fillStyle = g; ctx.fillRect(sx - r, sy - r, r * 2, r * 2);
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  if (Sim.weather === 'rain' || Sim.weather === 'storm') drawRain(ctx, cv, now, Sim.weather === 'storm' ? 2.6 : 1);
  if (Sim.weather === 'storm' && hash2(Math.floor(now / 120), 7) > 0.985) { ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(0, 0, cv.width, cv.height); }
  if (Sim.crisis && Sim.crisis.kind === 'war') { ctx.fillStyle = `rgba(220,20,20,${0.08 + 0.06 * Math.sin(now / 300)})`; ctx.fillRect(0, 0, cv.width, cv.height); }
  drawOverlays(ctx, cx, cy, z, now);
}

function drawRain(ctx, cv, now, k = 1) {
  ctx.fillStyle = `rgba(40,60,90,${0.18 * Math.min(k, 1.8)})`; ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.strokeStyle = 'rgba(200,225,255,0.55)'; ctx.lineWidth = 1 * Gfx.dpr;
  ctx.beginPath();
  const n = Math.floor(cv.width * cv.height / 9000 * k);
  for (let i = 0; i < n; i++) {
    const x = (hash2(i, 1) * cv.width + now * 0.05 * k) % cv.width;
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
  if (a.act && a.act.key === 'abducted' && Sim.abduct && Sim.abduct.a === a) {
    const t = Math.min(1, (performance.now() - Sim.abduct.born) / 3000);
    ctx.save(); ctx.globalAlpha = 1 - t * 0.8;
    ctx.drawImage(img, 32, 0, 32, 32, Math.round(a.px - 16), Math.round(a.py - 26 - t * 90), 32, 32);
    ctx.restore();
    return;
  }
  if (a.act && a.act.key === 'knocked') {
    ctx.save(); ctx.translate(Math.round(a.px), Math.round(a.py)); ctx.rotate(-Math.PI / 2);
    ctx.drawImage(img, 32, 0, 32, 32, -26, -16, 32, 32); ctx.restore();
    return;
  }
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
      const mark = !a.act ? null : (a.act.key === 'sleep' || a.act.key === 'oversleep') ? '💤' : a.act.key === 'kidnapped' ? '😱' : a.act.key === 'date' ? '💕' : a.act.key === 'jailed' ? '🔒' : a.act.key === 'essay' ? '📝' : null;
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
  trafficOverlays(ctx, cx, cy, z, now);
  extrasOverlays(ctx, cx, cy, z, now);
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

// ---- crisis visuals (director.js) ----
function crisisLights() {
  const out = [];
  for (const id of Object.keys(Sim.fires)) {
    const sp = World.buildings[id] && World.buildings[id].sprite;
    if (sp && Sim.fires[id] > Sim.minute) out.push({ x: sp.x + sp.w / 2, y: sp.y + sp.h * 0.4, r: 90, c: 'fire' });
  }
  for (const b of Sim.booms) out.push({ x: b.x, y: b.y, r: 70, c: 'fire' });
  if (Sim.ufo > Sim.minute) out.push({ x: 80 * TILE, y: 66 * TILE, r: 80, c: 'fire', col: '#80ffb0' });
  return out;
}

function smokePuffs(ctx, x, y, w, now, seed, dark) {
  for (let i = 0; i < 6; i++) {
    const ph = ((now / 1600 + hash2(seed, i)) % 1);
    const px = x + hash2(seed, i + 9) * w + Math.sin(now / 500 + i) * 4;
    const py = y - ph * 46;
    ctx.fillStyle = dark ? `rgba(60,60,64,${0.5 * (1 - ph)})` : `rgba(140,140,140,${0.45 * (1 - ph)})`;
    ctx.beginPath(); ctx.arc(px, py, 5 + ph * 9, 0, 7); ctx.fill();
  }
}

function drawCrisisWorld(ctx, now, cx, cy, vw, vh) {
  // burning buildings: flames + smoke
  for (const [id, end] of Object.entries(Sim.fires)) {
    if (end <= Sim.minute) continue;
    const sp = World.buildings[id].sprite;
    if (sp.x > cx + vw || sp.x + sp.w < cx || sp.y > cy + vh || sp.y + sp.h < cy) continue;
    smokePuffs(ctx, sp.x, sp.y + 4, sp.w, now, id.length * 7, true);
    for (let i = 0; i < 14; i++) {
      const fx = sp.x + hash2(i, id.length) * sp.w;
      const fy = sp.y + sp.h * (0.25 + hash2(i, 3) * 0.55);
      const fl = 6 + ((now / 90 + i * 37) % 8);
      ctx.fillStyle = '#ff5a1a'; ctx.fillRect(fx - 3, fy - fl, 6, fl);
      ctx.fillStyle = '#ffc23a'; ctx.fillRect(fx - 1.5, fy - fl * 0.65, 3, fl * 0.65);
    }
  }
  // smoke after fire / war damage
  for (const [id, until] of Object.entries(Sim.damaged)) {
    if (until <= Sim.minute || Sim.fires[id] > Sim.minute) continue;
    const sp = World.buildings[id].sprite;
    smokePuffs(ctx, sp.x + sp.w * 0.3, sp.y + 8, sp.w * 0.4, now, id.length * 13, false);
  }
  // war explosions
  for (const b of Sim.booms) {
    const t = (now - b.born) / 2500;
    const r = 6 + t * 26;
    ctx.fillStyle = `rgba(255,${Math.floor(200 - t * 150)},40,${Math.max(0, 0.9 - t * 1.4)})`;
    ctx.beginPath(); ctx.arc(b.x, b.y, r * 0.6, 0, 7); ctx.fill();
    ctx.fillStyle = `rgba(80,80,80,${Math.max(0, 0.6 - t * 0.6)})`;
    ctx.beginPath(); ctx.arc(b.x + 4, b.y - t * 20, r, 0, 7); ctx.fill();
  }
  // UFO over the school field
  const abd = Sim.abduct && !Sim.abduct.hidden ? Sim.abduct : null;
  if (Sim.ufo > Sim.minute || abd) {
    const x = abd ? abd.x : 80 * TILE, y = (abd ? abd.y - 110 : 58 * TILE) + Math.sin(now / 400) * 6;
    ctx.fillStyle = 'rgba(140,255,180,0.18)';
    ctx.beginPath(); ctx.moveTo(x - 10, y + 6); ctx.lineTo(x + 10, y + 6); ctx.lineTo(x + 40, y + 140); ctx.lineTo(x - 40, y + 140); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#9aa4ae'; ctx.beginPath(); ctx.ellipse(x, y, 30, 8, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#bfe8ff'; ctx.beginPath(); ctx.ellipse(x, y - 6, 12, 8, 0, Math.PI, 0); ctx.fill();
    for (let i = 0; i < 5; i++) { ctx.fillStyle = Math.floor(now / 200 + i) % 2 ? '#ffe45a' : '#ff5a5a'; ctx.fillRect(x - 22 + i * 11, y + 1, 3, 3); }
  }
}
