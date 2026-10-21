// 팔팔역: trains bring outside tourists who wander the village for a few hours (cafe, restaurant,
// plaza, river…), chat with residents, spend money in the shops, then leave by train.
// Also draws the 칠칠마을 invaders during a war (state lives in director.js).

const TRAIN = { pxPerSec: 110, dwell: 8, everyMin: [150, 220], firstHour: 7, lastHour: 21.5, maxTourists: 10 };
const TRAIN_Y = (RAIL_Y + 1) * TILE - 1;   // between the two rail rows
const TRAIN_STOP_X = 35 * TILE;            // train centre at the platform
const Train = { state: 'idle', x: -300, next: START_MINUTE + 90, dwell: 0, canvas: null };
const Tourists = [];
let touristUid = 1;

const ORIGINS = ['서울', '부산', '대구', '광주', '제주', '일본', '미국', '프랑스', '태국'];
const TOUR_STOPS = [
  { b: 'cafe', label: '팔팔카페' }, { b: 'restaurant', label: '팔팔식당' }, { b: 'store', label: '팔팔25' },
  { spot: 'fountain', label: '분수대' }, { spot: 'plaza', label: '중앙광장' }, { spot: 'river', label: '하천 산책로' },
  { spot: 'school_front', label: '팔팔고' }, { spot: 'stage', label: '버스킹 무대' },
];
const TOURIST_LINES = ['우와 팔팔마을이다!', '사진 찍자 📸', '여기 맛집 있어요?', '공기 좋다~', '팔팔식당 돈까스 유명하대', '기념품 사야지', '분수대 예쁘다'];
const RECOMMEND_PLACE = { cafe_visit: 'cafe', restaurant_meal: 'restaurant', store_shop: 'store', river_walk: 'river', plaza_walk: 'plaza', fountain: 'fountain' };

// ---- sprites ----
function trainSprite() {
  if (Train.canvas) return Train.canvas;
  const [c, g] = mkCanvas(156, 26);
  for (let k = 0; k < 3; k++) {
    const x = k * 52;
    R(g, x + 2, 4, 48, 18, '#f2f4f7'); R(g, x + 2, 15, 48, 4, '#2f5fb0'); R(g, x + 2, 19, 48, 2, '#d8342c');
    for (let w = x + 6; w < x + 46; w += 9) R(g, w, 7, 6, 6, '#7fb0d8');
    R(g, x + 8, 22, 8, 4, '#2a2a2e'); R(g, x + 36, 22, 8, 4, '#2a2a2e');
  }
  R(g, 150, 6, 6, 14, '#2f5fb0'); R(g, 151, 9, 4, 4, '#bfe0ff'); R(g, 153, 15, 3, 2, '#fff2b0'); // nose (east end)
  R(g, 0, 6, 4, 14, '#2f5fb0');
  text(g, 'PALPAL', 26, 17, '#ffffff', 6);
  outline(g, 156, 26);
  return (Train.canvas = c);
}
const TOURIST_LOOKS = [['#e05a8a', '#f2c94a'], ['#3fae5a', '#2a2a2e'], ['#3f6fd8', '#e8e4dc'], ['#f08a3a', '#5a3424'], ['#9b7fd1', '#1a1820']];
const touristSprites = [];
function touristSprite(i) {
  if (touristSprites[i]) return touristSprites[i];
  const [shirt, hair] = TOURIST_LOOKS[i % TOURIST_LOOKS.length];
  const [c, g] = mkCanvas(14, 26);
  R(g, 3, 0, 8, 3, i % 2 ? '#f4f4f0' : '#e8c060'); R(g, 2, 2, 10, 2, i % 2 ? '#f4f4f0' : '#e8c060'); // hat
  R(g, 4, 4, 6, 1, hair); R(g, 4, 5, 6, 5, '#f1cba9');
  R(g, 3, 10, 8, 8, shirt); R(g, 1, 11, 2, 6, shirt); R(g, 11, 11, 2, 6, shirt);
  R(g, 5, 12, 4, 3, '#2a2a2e'); R(g, 6, 13, 2, 1, '#8fbcd8'); // camera
  R(g, 10, 10, 3, 6, '#7a4a2a'); // backpack strap
  R(g, 4, 18, 2, 7, '#3a4256'); R(g, 8, 18, 2, 7, '#3a4256');
  outline(g, 14, 26);
  return (touristSprites[i] = c);
}
function soldierSprite(flag) {
  const key = flag ? 'flag' : 'soldier';
  if (touristSprites[key]) return touristSprites[key];
  const w = flag ? 22 : 14;
  const [c, g] = mkCanvas(w, 30);
  const ox = flag ? 8 : 0;
  if (flag) { R(g, 2, 0, 2, 30, '#7a5a3a'); R(g, 4, 1, 12, 8, '#d23b3b'); text(g, '77', 10, 5.5, '#ffffff', 6); }
  R(g, ox + 2, 3, 10, 4, '#4a6a3a'); R(g, ox + 1, 6, 12, 2, '#3a5a2a'); // helmet
  R(g, ox + 4, 8, 6, 5, '#e6b48c');
  R(g, ox + 3, 13, 8, 9, '#8a8058'); R(g, ox + 1, 14, 2, 7, '#8a8058'); R(g, ox + 11, 14, 2, 7, '#8a8058');
  R(g, ox + 3, 15, 8, 2, '#d23b3b'); // 77 armband
  R(g, ox + 4, 22, 2, 7, '#5a5040'); R(g, ox + 8, 22, 2, 7, '#5a5040');
  outline(g, w, 30);
  return (touristSprites[key] = c);
}

// ---- train (real time, like the cars) ----
function trainRuns() { const h = hourOf(Sim.minute); return h >= TRAIN.firstHour && h < TRAIN.lastHour; }
function updateTrain(dt) {
  if (Train.state === 'idle') {
    if (Sim.minute >= Train.next && trainRuns()) { Train.state = 'arrive'; Train.x = -300; }
    else if (Sim.minute >= Train.next) Train.next = Sim.minute + 30; // night: try again later
    return;
  }
  if (Train.state === 'arrive') {
    Train.x += TRAIN.pxPerSec * dt;
    if (Train.x >= TRAIN_STOP_X) { Train.x = TRAIN_STOP_X; Train.state = 'dwell'; Train.dwell = TRAIN.dwell; trainArrive(); }
  } else if (Train.state === 'dwell') {
    Train.dwell -= dt;
    if (Train.dwell <= 0) { Train.state = 'depart'; trainBoard(); }
  } else if (Train.state === 'depart') {
    Train.x -= TRAIN.pxPerSec * dt;
    if (Train.x < -320) { Train.state = 'idle'; Train.next = Sim.minute + randInt(...TRAIN.everyMin); }
  }
}

function trainArrive() {
  const n = Math.min(randInt(2, 4), TRAIN.maxTourists - Tourists.length);
  if (n <= 0) return;
  for (let i = 0; i < n; i++) {
    const s = pick(World.spots.platform);
    const plan = [];
    const pool = TOUR_STOPS.slice();
    for (let k = randInt(2, 3); k > 0 && pool.length; k--) plan.push(pool.splice(randInt(0, pool.length - 1), 1)[0]);
    Tourists.push({
      id: touristUid++, name: `${pick(ORIGINS)} 관광객`, look: randInt(0, 4),
      tx: s.x, ty: s.y, px: s.x * TILE + 8, py: s.y * TILE + 8, path: [], dir: 1,
      plan, state: 'idle', until: 0, leaveAt: Sim.minute + randInt(150, 300), bubble: null, inside: null, chatT: 0,
    });
  }
  logTown(`🚆 팔팔역에 기차 도착! 외부 관광객 ${n}명이 내렸다`, null, n >= 3);
}
function trainBoard() {
  let n = 0;
  for (let i = Tourists.length - 1; i >= 0; i--) if (Tourists[i].state === 'wait') { Tourists.splice(i, 1); n++; }
  if (n) logTown(`🚆 관광객 ${n}명이 기차를 타고 팔팔마을을 떠났다`);
}

// ---- tourists (game time) ----
function tSay(t, text) { t.bubble = { text, until: performance.now() + 2600 / Math.max(1, Math.sqrt(Sim.speed)) }; }
function tWalk(t, x, y) {
  if (!World.walkable(x, y)) ({ x, y } = randomNear({ x, y }, 2));
  const p = gridSearch(MW, MH, t.tx, t.ty, (cx, cy) => World.walkCost(cx, cy), (cx, cy) => cx === x && cy === y, (cx, cy) => Math.abs(cx - x) + Math.abs(cy - y));
  t.path = p ? p.slice(1) : [];
  t.state = 'walk';
}
function tNext(t) {
  if (Sim.minute >= t.leaveAt || !t.plan.length) {
    const s = pick(World.spots.platform);
    t.goal = { leave: true }; tWalk(t, s.x, s.y); return;
  }
  const stop = t.plan.shift();
  t.goal = stop;
  if (stop.b) { const d = World.buildings[stop.b].door; tWalk(t, d.x, d.y); }
  else { const s = pick(World.spots[stop.spot]); tWalk(t, s.x, s.y); }
}
const SHOP_OWNER = { cafe: 'han_gayun', restaurant: 'jo_beomgi', store: 'hong_uijun' };
function tArrive(t) {
  const g = t.goal || {};
  if (g.leave) { t.state = 'wait'; return; }
  if (g.b) {
    if (!isOpen(g.b)) { tSay(t, '앗, 문 닫았네…'); t.state = 'idle'; return; }
    t.inside = g.b; t.state = 'inside'; t.until = Sim.minute + randInt(30, 60);
    const owner = Sim.byId[SHOP_OWNER[g.b]];
    if (owner && owner.inside === World.buildings[g.b]) {
      owner.addXp('work', 3); owner.addXp('social', 2); owner.mood = clamp(owner.mood + 2, 0, 100);
      if (rand() < 0.4) logTown(`🧳 ${t.name}이 ${g.label}에 들렀다. ${owner.def.short}: "${pick(['어서 오세요~', '맛있게 드세요!', '또 오세요 😊'])}"`, owner.id);
    }
    return;
  }
  t.state = 'stay'; t.until = Sim.minute + randInt(20, 40);
  tSay(t, pick(TOURIST_LINES));
}

function tickTourists(dt) {
  for (const t of Tourists) {
    if (t.state === 'idle') tNext(t);
    else if (t.state === 'walk') {
      let steps = WALK_TILES_PER_MIN * dt * TILE;
      while (steps > 0 && t.path.length) {
        const [nx, ny] = t.path[0];
        const gx = nx * TILE + 8, gy = ny * TILE + 8, dx = gx - t.px, dy = gy - t.py, d = Math.abs(dx) + Math.abs(dy);
        if (dx) t.dir = Math.sign(dx);
        if (d <= steps) { t.px = gx; t.py = gy; t.tx = nx; t.ty = ny; t.path.shift(); steps -= d; }
        else { t.px += Math.sign(dx) * Math.min(Math.abs(dx), steps); t.py += Math.sign(dy) * Math.min(Math.abs(dy), Math.max(0, steps - Math.abs(dx))); steps = 0; }
      }
      if (!t.path.length) tArrive(t);
    } else if ((t.state === 'stay' || t.state === 'inside') && Sim.minute >= t.until) {
      if (t.inside) { const d = World.buildings[t.inside].door; t.inside = null; t.tx = d.x; t.ty = d.y; t.px = d.x * TILE + 8; t.py = d.y * TILE + 8; }
      t.state = 'idle';
    }
    if (t.state === 'stay' && rand() < 0.03 * dt) tSay(t, pick(TOURIST_LINES));
    // residents nearby say hello; sometimes they recommend a place (it joins the tourist's plan)
    t.chatT -= dt;
    if (t.inside || t.chatT > 0 || t.state === 'wait') continue;
    const r = Sim.agents.find((a) => !a.inside && !a.chat && !a.scripted && a.act && Math.abs(a.px - t.px) + Math.abs(a.py - t.py) < TILE * 2.5);
    if (!r) continue;
    t.chatT = 45;
    tSay(t, pick(['안녕하세요!', '여기 사세요?', '맛집 추천해 주세요!']));
    r.say(pick(r.def.replies), 2.4);
    r.addXp('social', 3); r.stat('tourists');
    const fav = r.def.fav && RECOMMEND_PLACE[r.def.fav.act];
    if (fav && rand() < 0.35) {
      const stop = TOUR_STOPS.find((s) => s.b === fav || s.spot === fav);
      if (stop) { t.plan.unshift(stop); logTown(`💡 ${josa(r.def.name, '이/가')} ${t.name}에게 ${josa(stop.label, '을/를')} 추천했다`, r.id); }
    }
  }
}

// ---- drawing ----
function worldExtras() {
  const out = [];
  if (Train.state !== 'idle') {
    const c = trainSprite();
    out.push({ canvas: c, x: Train.x - c.width / 2, y: TRAIN_Y - c.height + 6, baseY: TRAIN_Y + 6 });
  }
  for (const t of Tourists) {
    if (t.inside) continue;
    const c = touristSprite(t.look);
    out.push({ canvas: c, x: Math.round(t.px - 7), y: Math.round(t.py - 22), baseY: t.py + 5, flip: t.dir < 0 });
  }
  for (const s of Sim.invaders || []) {
    const c = soldierSprite(s.flag);
    out.push({ canvas: c, x: Math.round(s.px - c.width / 2), y: Math.round(s.py - 26), baseY: s.py + 5, flip: true });
  }
  return out;
}

function bubbleAt(ctx, x, y, text, cx, cy, z) {
  const dpr = Gfx.dpr, sx = (x - cx) * z, sy = (y - cy) * z;
  ctx.font = `${12 * dpr}px ${PIXFONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const tw = ctx.measureText(text).width + 14 * dpr, th = 20 * dpr;
  ctx.fillStyle = '#fffdf6'; ctx.strokeStyle = '#3a2e26'; ctx.lineWidth = 1.5 * dpr;
  roundRect(ctx, sx - tw / 2, sy - th / 2, tw, th, 6 * dpr); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#2a1e14'; ctx.fillText(text, sx, sy + 0.5 * dpr);
}
function extrasOverlays(ctx, cx, cy, z, now) {
  for (const t of Tourists) if (!t.inside && t.bubble && t.bubble.until > now) bubbleAt(ctx, t.px, t.py - 32, t.bubble.text, cx, cy, z);
  for (const s of Sim.invaders || []) if (s.bubble && s.bubble.until > now) bubbleAt(ctx, s.px, s.py - 36, s.bubble.text, cx, cy, z);
}
