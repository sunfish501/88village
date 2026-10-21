// Traffic: cars obey the traffic lights at the main intersection and queue behind each other.
// Rarely a distracted driver hits a pedestrian: the driver gets out and calls 119/112, an
// ambulance takes the victim to 팔팔팔병원 and a police car (정의겸 when he is free) takes the
// driver to 팔팔파출소. 팔팔소방서's fire truck drives to fires and puts them out.

const CAR_COLORS = ['#e8e8e4', '#2e2e34', '#c9443a', '#3f6fb3', '#9aa0a8', '#f2c94a', '#3f8a5a'];
const Cars = [];

const TRAFFIC = {
  accidentChance: 0.05,     // per pedestrian a car meets in its lane
  accidentCooldown: 2880,   // game minutes between accidents (2 days)
  vehicleTilesPerSec: 7,    // emergency vehicles (x min(speed, 4))
};

// signal cycle in real seconds (scaled like the cars): EW green -> yellow -> all red -> NS green -> ...
const PHASES = [
  { ew: 'G', ns: 'R', dur: 9 }, { ew: 'Y', ns: 'R', dur: 2 }, { ew: 'R', ns: 'R', dur: 1 },
  { ew: 'R', ns: 'G', dur: 9 }, { ew: 'R', ns: 'Y', dur: 2 }, { ew: 'R', ns: 'R', dur: 1 },
];
const SIGNAL = { phase: 0, t: 0 };
const signalFor = (axis) => PHASES[SIGNAL.phase][axis === 'h' ? 'ew' : 'ns'];
// car centre position where it must stop (front just before the crosswalk)
const STOP_AT = { 'h1': 44 * TILE - 2 - 15, 'h-1': 52 * TILE + 2 + 15, 'v1': 28 * TILE - 2 - 15, 'v-1': 36 * TILE + 2 + 15 };
const SIGNAL_POSTS = [
  { x: 45, y: 29, axis: 'h' }, { x: 50, y: 34, axis: 'h' }, { x: 50, y: 29, axis: 'v' }, { x: 45, y: 34, axis: 'v' },
];

const VEHICLE_PLACE = { id: 'vehicle', name: '차 안', virtual: true, door: { x: 0, y: 0 } };
const Traffic = {
  vehicles: [], busy: {}, accident: null, lastAccident: -1e9, sprites: {},
  parked: null,
};

// ---------------------------------------------------------------------------
// Sprites
// ---------------------------------------------------------------------------
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

// emergency vehicles, drawn facing right; the vertical version is rotated (front = down)
function vehicleSpriteH(kind) {
  if (kind === 'fire') {
    const [c, g] = mkCanvas(46, 24);
    R(g, 4, 18, 7, 5, '#1e1e22'); R(g, 18, 18, 7, 5, '#1e1e22'); R(g, 34, 18, 7, 5, '#1e1e22');
    R(g, 1, 7, 44, 13, '#d62f26'); R(g, 34, 3, 11, 10, '#d62f26');
    R(g, 36, 4, 7, 5, '#8fbcd8'); R(g, 1, 14, 44, 2, '#f4f4f0');
    R(g, 2, 3, 30, 2, '#b8b8b8'); for (let x = 3; x < 31; x += 4) R(g, x, 2, 1, 4, '#9a9a9a'); // ladder
    R(g, 43, 9, 2, 3, '#fff2b0');
    outline(g, 46, 24); return c;
  }
  const [c, g] = mkCanvas(34, 22);
  R(g, 4, 16, 7, 5, '#1e1e22'); R(g, 23, 16, 7, 5, '#1e1e22');
  if (kind === 'ambulance') {
    R(g, 1, 4, 32, 13, '#f6f6f2'); R(g, 1, 12, 32, 2, '#d8342c');
    R(g, 25, 5, 6, 5, '#8fbcd8');
    R(g, 10, 5, 2, 6, '#d8342c'); R(g, 8, 7, 6, 2, '#d8342c');
  } else { // police
    R(g, 1, 7, 32, 10, '#f4f4f2'); R(g, 6, 3, 20, 6, '#f4f4f2'); R(g, 1, 12, 32, 5, '#24365e');
    R(g, 8, 4, 7, 4, '#8fbcd8'); R(g, 17, 4, 7, 4, '#8fbcd8');
  }
  R(g, 31, 8, 2, 3, '#fff2b0');
  outline(g, 34, 22); return c;
}
function rotateCanvas(src) {
  const [c, g] = mkCanvas(src.height, src.width);
  g.translate(src.height, 0); g.rotate(Math.PI / 2); g.drawImage(src, 0, 0);
  return c;
}
function vehicleSprites(kind) {
  if (!Traffic.sprites[kind]) { const h = vehicleSpriteH(kind); Traffic.sprites[kind] = { h, v: rotateCanvas(h) }; }
  return Traffic.sprites[kind];
}
function driverSprite() {
  if (Traffic.sprites.driver) return Traffic.sprites.driver;
  const [c, g] = mkCanvas(12, 24);
  R(g, 3, 1, 6, 3, '#2a2420'); R(g, 3, 4, 6, 5, '#f1cba9'); R(g, 2, 9, 8, 8, '#6a7480'); R(g, 0, 10, 2, 6, '#6a7480'); R(g, 10, 10, 2, 6, '#6a7480');
  R(g, 3, 17, 2, 6, '#2e3440'); R(g, 7, 17, 2, 6, '#2e3440');
  outline(g, 12, 24);
  return (Traffic.sprites.driver = c);
}

// ---------------------------------------------------------------------------
// Cars
// ---------------------------------------------------------------------------
function initCars() {
  const lanes = [
    { axis: 'h', dir: -1, fixed: 31 * TILE - 2 }, { axis: 'h', dir: 1, fixed: 33 * TILE - 2 },
    { axis: 'v', dir: 1, fixed: 47 * TILE - 1 }, { axis: 'v', dir: -1, fixed: 49 * TILE - 1 },
  ];
  for (const lane of lanes) for (let i = 0; i < 2; i++) {
    const col = CAR_COLORS[(Cars.length * 3) % CAR_COLORS.length];
    const len = lane.axis === 'h' ? MW * TILE : MH * TILE;
    Cars.push({ ...lane, pos: (i * 0.5 + rand() * 0.3) * len, len, speed: 55 + rand() * 25, canvas: carSprite(col, lane.axis === 'v'), checked: new Set() });
  }
  const hosp = World.buildings.hospital.door, pol = World.buildings.police.door, fire = World.buildings.firestation.door;
  Traffic.parked = {
    ambulance: { x: hosp.x + 3, y: hosp.y },
    police: { x: pol.x + 2, y: pol.y },
    fire: { x: fire.x, y: fire.y },
  };
}

function pedestrianAhead(car) {
  const front = car.pos + car.dir * 20;
  for (const a of Sim.agents) {
    if (a.inside || (a.act && a.act.key === 'knocked')) continue;
    if (World.t(a.tx, a.ty) !== T.CROSSWALK && World.t(a.tx, a.ty) !== T.ASPHALT) continue;
    const along = car.axis === 'h' ? a.px : a.py, across = car.axis === 'h' ? a.py : a.px;
    const d = (along - front) * car.dir;
    if (d > -6 && d < 26 && Math.abs(across - car.fixed) < 34) return a;
  }
  return null;
}

function canCrash(a) {
  return !Traffic.accident && Sim.minute - Traffic.lastAccident > TRAFFIC.accidentCooldown
    && a.act && !a.scripted && !a.chat && !Sim.crisis;
}

function updateCars(realDt) {
  const k = Math.min(Sim.speed, 4), dt = realDt * k;
  SIGNAL.t += dt;
  if (SIGNAL.t >= PHASES[SIGNAL.phase].dur) { SIGNAL.t = 0; SIGNAL.phase = (SIGNAL.phase + 1) % PHASES.length; }

  for (const car of Cars) {
    if (car.crashed) continue;
    if (car.hidden) { // towed away; comes back after a while
      car.hideT -= dt;
      if (car.hideT <= 0) { car.hidden = false; car.pos = car.dir > 0 ? -40 : car.len + 40; }
      continue;
    }
    let step = car.speed * dt;
    const ped = pedestrianAhead(car);
    if (ped) {
      if (!car.checked.has(ped.id)) {
        car.checked.add(ped.id);
        if (canCrash(ped) && rand() < TRAFFIC.accidentChance) car.reckless = ped; // 휴대폰 보다가…
      }
      if (car.reckless !== ped) step = 0;
    } else car.checked.clear();
    // keep distance to the car ahead in the same lane
    for (const o of Cars) {
      if (o === car || o.hidden || o.axis !== car.axis || o.fixed !== car.fixed) continue;
      const gap = (o.pos - car.pos) * car.dir;
      if (gap > 0 && gap < 38) step = 0;
      else if (gap > 0) step = Math.min(step, gap - 38);
    }
    // traffic light
    const sig = signalFor(car.axis), stop = STOP_AT[car.axis + car.dir];
    const before = (stop - car.pos) * car.dir;
    if (sig !== 'G' && before >= 0 && !(sig === 'Y' && before < 10)) step = Math.min(step, before);
    car.pos += car.dir * Math.max(0, step);
    // a distracted driver did not brake
    if (car.reckless) {
      const a = car.reckless;
      const along = car.axis === 'h' ? a.px : a.py, across = car.axis === 'h' ? a.py : a.px;
      const d = (along - (car.pos + car.dir * 15)) * car.dir;
      if (!canCrash(a) || a.inside || Math.abs(across - car.fixed) > 30 || d < -20) car.reckless = null;
      else if (d < 6) crash(car, a);
    }
    if (car.pos < -40) car.pos += car.len + 80;
    if (car.pos > car.len + 40) car.pos -= car.len + 80;
  }
  updateVehicles(dt);
  updateAccident(dt);
}

function carCenter(car) {
  return car.axis === 'h' ? { x: car.pos, y: car.fixed - 2 } : { x: car.fixed, y: car.pos };
}
function carDrawable(car) {
  const cw = car.canvas.width, ch = car.canvas.height;
  let x, y;
  if (car.axis === 'h') { x = car.pos - cw / 2; y = car.fixed - ch / 2 - 2; }
  else { x = car.fixed - cw / 2; y = car.pos - ch / 2; }
  return { canvas: car.canvas, x, y, baseY: y + ch, flip: car.axis === 'h' && car.dir < 0, flipV: car.axis === 'v' && car.dir < 0, car };
}

// ---------------------------------------------------------------------------
// Accident
// ---------------------------------------------------------------------------
const DRIVER_NAMES = ['김모 씨', '이모 씨', '박모 씨', '최모 씨', '윤모 씨'];
const DRIVER_EXCUSES = ['휴대폰을 보다가', '졸음운전으로', '신호를 못 보고', '음악을 고르다가'];

function crash(car, a) {
  car.crashed = true; car.reckless = null;
  Traffic.lastAccident = Sim.minute;
  a.script('knocked');
  a.path = []; a.say('으악…! 💫', 3);
  a.stat('accidents'); a.mood = clamp(a.mood - 30, 0, 100);
  a.note('교통사고를 당해 쓰러짐 💫');
  const c = carCenter(car);
  const name = pick(DRIVER_NAMES), excuse = pick(DRIVER_EXCUSES);
  Traffic.accident = {
    car, victim: a, phase: 'shock', t: 0, name, excuse,
    driver: { px: c.x + (car.axis === 'h' ? 0 : 20), py: c.y + (car.axis === 'h' ? 22 : 0), hidden: false, say: null },
    ambulanceDone: false, policeDone: false,
  };
  logTown(`💥 교통사고! ${excuse} 달리던 차가 길을 건너던 ${josa(a.def.name, '을/를')} 쳤다`, a.id, true);
  newsAll(Sim.agents.filter((x) => x !== a && x.awake()).slice(0, 4), `${josa(a.def.short, '이/가')} 큰길에서 차에 치였대요`, null, false);
}

function driverSay(text) { Traffic.accident.driver.say = { text, until: performance.now() + 2600 / Math.max(1, Math.sqrt(Sim.speed)) }; }

function updateAccident(dt) {
  const A = Traffic.accident;
  if (!A) return;
  A.t += dt;
  if (A.phase === 'shock' && A.t > 1.5) { A.phase = 'check'; driverSay('괜찮으세요?! 😰'); }
  if (A.phase === 'check' && A.t > 4) {
    A.phase = 'wait';
    driverSay('여보세요, 119죠? 사고가 났어요!');
    logTown(`📞 운전자 ${A.name}가 차에서 내려 119·112에 신고했다`, null, true);
    const v = A.victim, U = Sim.byId.jung_uigyeom;
    dispatch('ambulance', { x: v.tx, y: v.ty }, (amb) => {
      v.inside = VEHICLE_PLACE; v.script('transported'); v.inside = VEHICLE_PLACE;
      logTown(`🚑 구급차 도착! ${josa(v.def.name, '을/를')} 싣고 팔팔팔병원으로 간다`, v.id);
      amb.driveTo(World.buildings.hospital.door, () => {
        const d = World.buildings.hospital.door;
        v.inside = null; v.tx = d.x; v.ty = d.y; v.px = d.x * TILE + 8; v.py = d.y * TILE + 8;
        v.script('injured', { dur: randInt(180, 300) });
        logTown(`🏥 ${josa(v.def.name, '은/는')} 팔팔팔병원에서 치료를 받고 있다 (큰 부상은 아님)`, v.id, true);
        A.ambulanceDone = true;
        amb.park();
      });
    });
    // 정의겸 drives the police car when he can
    const cop = U && freeForCrisis(U) && !U.scripted && U.awake() && !Law.active ? U : null;
    if (cop) { cop.script('patrol_car'); cop.inside = VEHICLE_PLACE; cop.stat('dispatches'); }
    const cc = carCenter(A.car);
    dispatch('police', { x: Math.round((cc.x - 8) / TILE), y: Math.round((cc.y - 8) / TILE) }, (pc) => {
      A.driver.hidden = true;
      logTown(`🚓 경찰차 도착! ${cop ? '정의겸이' : '경찰이'} 운전자 ${A.name}를 연행한다`, cop ? cop.id : null, true);
      // the crashed car is towed away
      A.car.crashed = false; A.car.hidden = true; A.car.hideT = 40;
      pc.driveTo(World.buildings.police.door, () => {
        Law.records.unshift({ t: Sim.minute, type: 'traffic', culprit: null, culpritName: `운전자 ${A.name}`, victim: A.victim.id, outcome: `${A.excuse} 사고 → 연행·조사, 면허 정지` });
        if (Law.records.length > 40) Law.records.pop();
        logTown(`⚖️ 운전자 ${A.name}: ${A.excuse} 사고 → 면허 정지 처분`, null);
        if (cop) { cop.inside = World.buildings.police; cop.act = null; cop.state = 'idle'; cop.note('교통사고 운전자 연행'); }
        A.policeDone = true;
        pc.park();
      });
    }, cop);
  }
  if (A.phase === 'wait' && A.ambulanceDone && A.policeDone) Traffic.accident = null;
}

// ---------------------------------------------------------------------------
// Emergency vehicles
// ---------------------------------------------------------------------------
const V_COST = {
  [T.ASPHALT]: 1, [T.CROSSWALK]: 1, [T.BRIDGE]: 1, [T.ALLEY]: 1.4, [T.SIDEWALK]: 2.5, [T.PAVE]: 4,
  [T.FLOOR]: 6, [T.TRACK]: 6, [T.TURF]: 6, [T.FIELD]: 6, [T.GRASS]: 10,
};
function vehiclePath(from, to) {
  if (!World.walkable(to.x, to.y)) to = randomNear(to, 2);
  const p = gridSearch(MW, MH, from.x, from.y, (x, y) => (World.isBlocked(x, y) ? Infinity : V_COST[World.t(x, y)] ?? Infinity),
    (x, y) => x === to.x && y === to.y, (x, y) => Math.abs(x - to.x) + Math.abs(y - to.y));
  return p ? p.slice(1) : [];
}

function dispatch(kind, target, onArrive, crew) {
  const home = Traffic.parked[kind];
  Traffic.busy[kind] = true;
  const v = {
    kind, crew, px: home.x * TILE + 8, py: home.y * TILE + 8, tx: home.x, ty: home.y, axis: 'h', sign: 1,
    path: [], onArrive: null, gone: false, spray: null,
    driveTo(t, cb) { this.path = vehiclePath({ x: this.tx, y: this.ty }, t); this.onArrive = cb; if (!this.path.length) { const f = cb; this.onArrive = null; f(this); } },
    park() { this.spray = null; this.driveTo(home, (me) => { me.gone = true; Traffic.busy[kind] = false; }); },
  };
  Traffic.vehicles.push(v);
  v.driveTo(target, onArrive);
  return v;
}

function updateVehicles(dt) {
  for (const v of Traffic.vehicles) {
    let step = TRAFFIC.vehicleTilesPerSec * TILE * dt;
    while (step > 0 && v.path.length) {
      const [nx, ny] = v.path[0];
      const gx = nx * TILE + 8, gy = ny * TILE + 8, dx = gx - v.px, dy = gy - v.py, d = Math.abs(dx) + Math.abs(dy);
      if (Math.abs(dx) > Math.abs(dy)) { v.axis = 'h'; v.sign = Math.sign(dx); } else if (d > 0) { v.axis = 'v'; v.sign = Math.sign(dy); }
      if (d <= step) { v.px = gx; v.py = gy; v.tx = nx; v.ty = ny; v.path.shift(); step -= d; }
      else { v.px += Math.sign(dx) * Math.min(Math.abs(dx), step); v.py += Math.sign(dy) * Math.min(Math.abs(dy), Math.max(0, step - Math.abs(dx))); step = 0; }
    }
    if (!v.path.length && v.onArrive) { const f = v.onArrive; v.onArrive = null; f(v); }
    // fire truck keeps spraying until the fire is out, then goes home
    if (v.spray && !burning(v.spray)) { logTown('🚒 진화를 마친 소방차가 팔팔소방서로 복귀한다'); v.park(); }
  }
  Traffic.vehicles = Traffic.vehicles.filter((v) => !v.gone);
}

Traffic.dispatchFire = function (b) {
  if (Traffic.busy.fire) return;
  logTown(`🚒 팔팔소방서 출동! 소방차가 ${b.name}로 달려간다`, null, true);
  dispatch('fire', b.door, (truck) => {
    truck.spray = b.id;
    // the fire brigade gets it under control much faster
    Sim.fires[b.id] = Math.min(Sim.fires[b.id], Sim.minute + randInt(15, 30));
    logTown(`🚒 소방차 도착! ${b.name}에 물을 뿌리며 진화 중`, null, true);
  });
};

// ---------------------------------------------------------------------------
// Drawing (called from render.js)
// ---------------------------------------------------------------------------
function signalColor(state) { return state === 'G' ? '#3ee86a' : state === 'Y' ? '#ffd23a' : '#ff3a3a'; }

function trafficDrawables() {
  const out = [];
  for (const car of Cars) if (!car.hidden) out.push(carDrawable(car));
  // emergency vehicles: moving ones + the parked ones
  const drawVehicle = (kind, px, py, axis, sign, active, extra) => {
    const sp = vehicleSprites(kind), c = axis === 'h' ? sp.h : sp.v;
    out.push({
      canvas: c, x: px - c.width / 2, y: py - c.height / 2, baseY: py + c.height / 2,
      flip: axis === 'h' && sign < 0, flipV: axis === 'v' && sign < 0,
      post: active ? (ctx, now) => drawLightbar(ctx, kind, px, py - (axis === 'h' ? c.height / 2 - 2 : 0), now, extra) : null,
    });
  };
  for (const v of Traffic.vehicles) drawVehicle(v.kind, v.px, v.py, v.axis, v.sign, true, v);
  for (const kind of ['ambulance', 'police', 'fire']) {
    if (Traffic.busy[kind] || !Traffic.parked) continue;
    const p = Traffic.parked[kind];
    drawVehicle(kind, p.x * TILE + 8, p.y * TILE + 10, 'h', kind === 'fire' ? 1 : -1, false);
  }
  // traffic light posts
  for (const s of SIGNAL_POSTS) {
    const x = s.x * TILE + 8, y = s.y * TILE + 14, state = signalFor(s.axis);
    out.push({
      baseY: y, draw: (ctx) => {
        ctx.fillStyle = '#4a4e56'; ctx.fillRect(x - 1, y - 30, 2, 30);
        ctx.fillStyle = '#26282e'; ctx.fillRect(x - 4, y - 42, 8, 20);
        ['R', 'Y', 'G'].forEach((st, i) => { ctx.fillStyle = st === state ? signalColor(st) : '#3a3c42'; ctx.fillRect(x - 2, y - 40 + i * 6, 4, 4); });
      },
    });
  }
  // the driver standing next to the crashed car
  const A = Traffic.accident;
  if (A && !A.driver.hidden) {
    const d = A.driver, img = driverSprite();
    out.push({ canvas: img, x: d.px - 6, y: d.py - 22, baseY: d.py + 2 });
  }
  return out;
}

function drawLightbar(ctx, kind, x, y, now, v) {
  const on = Math.floor(now / 250) % 2;
  const [c1, c2] = kind === 'police' ? ['#ff3030', '#3060ff'] : kind === 'ambulance' ? ['#ff3030', '#ffffff'] : ['#ff3030', '#ffb020'];
  ctx.fillStyle = on ? c1 : c2; ctx.fillRect(x - 5, y - 3, 4, 3);
  ctx.fillStyle = on ? c2 : c1; ctx.fillRect(x + 1, y - 3, 4, 3);
  if (v && v.spray) { // water arc from the truck to the burning building
    const sp = World.buildings[v.spray].sprite, tx = sp.x + sp.w / 2, ty = sp.y + sp.h * 0.45;
    for (let i = 0; i < 14; i++) {
      const t = ((now / 600) + i / 14) % 1;
      const px = x + (tx - x) * t, py = y + (ty - y) * t - Math.sin(t * Math.PI) * 30;
      ctx.fillStyle = 'rgba(150,210,255,0.85)'; ctx.fillRect(px - 1.5, py - 1.5, 3, 3);
    }
  }
}

function trafficLights() {
  const out = [];
  for (const car of Cars) {
    if (car.hidden) continue;
    const c = carCenter(car);
    out.push(car.axis === 'h' ? { x: c.x + car.dir * 18, y: c.y, r: 30, c: 'lamp', car: true } : { x: c.x, y: c.y + car.dir * 18, r: 30, c: 'lamp', car: true });
  }
  for (const v of Traffic.vehicles) out.push({ x: v.px, y: v.py, r: 46, c: 'siren', car: true });
  return out;
}

// driver speech bubble (screen space)
function trafficOverlays(ctx, cx, cy, z, now) {
  const A = Traffic.accident;
  if (!A || A.driver.hidden || !A.driver.say || A.driver.say.until < now) return;
  const dpr = Gfx.dpr, sx = (A.driver.px - cx) * z, sy = (A.driver.py - 30 - cy) * z;
  ctx.font = `${12 * dpr}px ${PIXFONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const tw = ctx.measureText(A.driver.say.text).width + 14 * dpr, th = 20 * dpr;
  ctx.fillStyle = '#fffdf6'; ctx.strokeStyle = '#3a2e26'; ctx.lineWidth = 1.5 * dpr;
  roundRect(ctx, sx - tw / 2, sy - th / 2, tw, th, 6 * dpr); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#2a1e14'; ctx.fillText(A.driver.say.text, sx, sy + 0.5 * dpr);
}
