// Town generation + all procedural pixel-art drawing.
const MW = 96, MH = 80;
const T = {
  GRASS: 0, WATER: 1, ALLEY: 2, ASPHALT: 3, SIDEWALK: 4, CROSSWALK: 5, BRIDGE: 6,
  PAVE: 7, TURF: 8, SOIL: 9, SAND: 10, STONE: 11, TRACK: 12, STEP: 13, FLOOR: 14, FIELD: 15,
};
const WALK_COST = {
  [T.GRASS]: 1.6, [T.ALLEY]: 1, [T.ASPHALT]: 5, [T.SIDEWALK]: 1, [T.CROSSWALK]: 1, [T.BRIDGE]: 1,
  [T.PAVE]: 1, [T.TURF]: 1.3, [T.SOIL]: 1.8, [T.SAND]: 1.4, [T.TRACK]: 1, [T.STEP]: 1.5, [T.FLOOR]: 1, [T.FIELD]: 1.2,
  [T.WATER]: Infinity, [T.STONE]: Infinity,
};
const NETWORK = new Set([T.ALLEY, T.SIDEWALK, T.CROSSWALK, T.BRIDGE, T.PAVE, T.TRACK, T.STEP]);

const streamC = (x) => 57 + Math.round(1.2 * Math.sin(x / 9));

// ---------------------------------------------------------------------------
// Buildings & props layout
// ---------------------------------------------------------------------------
const BUILDINGS = [
  // homes (8)
  { id: 'h_gayun', kind: 'house', x: 4, y: 6, w: 7, h: 7, top: 0, name: '가윤네', owner: 'han_gayun', roof: '#c8673a', wall: '#f3ead8' },
  { id: 'h_serin', kind: 'villa', x: 13, y: 5, w: 7, h: 8, top: 0, name: '세린빌라', owner: 'ha_serin', brick: '#c2a27a' },
  { id: 'h_seunghwa', kind: 'villa', x: 22, y: 5, w: 7, h: 8, top: 0, name: '승화빌라', owner: 'han_seunghwa', brick: '#9c5a3c' },
  { id: 'h_beomgi', kind: 'house', x: 31, y: 6, w: 7, h: 7, top: 0, name: '범기네', owner: 'jo_beomgi', roof: '#59606e', wall: '#e9e4da' },
  { id: 'h_ijun', kind: 'hanok', x: 54, y: 6, w: 9, h: 7, top: 6, name: '이준네 한옥', owner: 'jo_ijun' },
  { id: 'h_uijun', kind: 'house', x: 65, y: 6, w: 7, h: 7, top: 0, name: '의준네', owner: 'hong_uijun', roof: '#3f6fa8', wall: '#efe2c8' },
  { id: 'h_hyunji', kind: 'villa', x: 74, y: 5, w: 7, h: 8, top: 0, name: '현지빌라', owner: 'gwak_hyunji', brick: '#b5563b' },
  { id: 'h_uigyeom', kind: 'house', x: 84, y: 6, w: 7, h: 7, top: 0, name: '의겸네(빈집)', owner: 'jung_uigyeom', roof: '#4f8a5b', wall: '#ece6da' },
  // town
  { id: 'cafe', kind: 'cafe', x: 4, y: 21, w: 7, h: 6, top: 0, name: '팔팔카페' },
  { id: 'studycafe', kind: 'studycafe', x: 13, y: 21, w: 7, h: 6, top: 0, name: '팔팔 스터디카페' },
  { id: 'restaurant', kind: 'restaurant', x: 22, y: 21, w: 9, h: 6, top: 4, name: '팔팔식당' },
  { id: 'police', kind: 'police', x: 53, y: 21, w: 7, h: 6, top: 8, name: '팔팔파출소' },
  { id: 'store', kind: 'store', x: 61, y: 21, w: 7, h: 6, top: 0, name: '팔팔25' },
  { id: 'firestation', kind: 'firestation', x: 20, y: 38, w: 8, h: 7, top: 10, name: '팔팔소방서' },
  { id: 'hospital', kind: 'hospital', x: 6, y: 37, w: 11, h: 8, top: 14, name: '팔팔팔병원' },
  { id: 'gym', kind: 'gym', x: 30, y: 64, w: 11, h: 8, top: 4, name: '팔팔체육관' },
  { id: 'school', kind: 'school', x: 54, y: 64, w: 15, h: 9, top: 22, name: '팔팔고등학교' },
];
for (const b of BUILDINGS) b.door = { x: b.x + Math.floor(b.w / 2), y: b.y + b.h };
const OUTSIDE = { id: 'outside', name: '마을 밖', virtual: true, door: { x: 0, y: 28 }, x: 0, y: 28, w: 1, h: 1 };

// props: kind, x, y, w, h (tiles), block (blocks movement), extra draw opts
const PROPS = [
  { kind: 'fountain', x: 65, y: 42, w: 4, h: 4, block: true },
  { kind: 'stall', x: 76, y: 39, w: 3, h: 2, block: true },
  { kind: 'board', x: 54, y: 49, w: 2, h: 1, block: true },
  { kind: 'busstop', x: 36, y: 35, w: 3, h: 1, block: true },
  { kind: 'vending', x: 68, y: 26, w: 1, h: 1, block: true },
  { kind: 'goal', x: 70, y: 69, w: 1, h: 2, block: true },
  { kind: 'goal', x: 91, y: 69, w: 1, h: 2, block: true, flip: true },
  { kind: 'parasol', x: 62, y: 28, w: 1, h: 1, color: '#2f7fd0' },
  { kind: 'parasol', x: 66, y: 28, w: 1, h: 1, color: '#2fae6a' },
  { kind: 'parasol', x: 5, y: 28, w: 1, h: 1 },
  { kind: 'bench', x: 59, y: 46, w: 1, h: 1 },
  { kind: 'bench', x: 62, y: 49, w: 1, h: 1 },
  { kind: 'bench', x: 72, y: 49, w: 1, h: 1 },
  { kind: 'bench', x: 75, y: 45, w: 1, h: 1 },
  { kind: 'bench', x: 24, y: 53, w: 1, h: 1 },
  { kind: 'planter', x: 21, y: 27, w: 1, h: 1, block: true },
  { kind: 'planter', x: 31, y: 27, w: 1, h: 1, block: true },
  { kind: 'flag', x: 53, y: 72, w: 1, h: 1, block: true },
];
const LAMPS = [[6, 36], [20, 36], [34, 36], [56, 36], [70, 36], [86, 36], [53, 38], [80, 38], [53, 51], [80, 51], [60, 43], [40, 53], [24, 52], [66, 52], [86, 53], [43, 14], [52, 14], [43, 50], [52, 64], [52, 75], [43, 76]];
const POLES = [3, 12, 21, 32, 41, 61, 71, 80, 90];
const PARK_TREES = [[53, 44, 'cherry'], [53, 47, 'cherry'], [80, 44, 'cherry'], [57, 51, 'cherry'], [70, 51, 'cherry'], [80, 48, 'oak'], [72, 38, 'oak'], [58, 38, 'oak']];

// ---------------------------------------------------------------------------
// World build
// ---------------------------------------------------------------------------
const World = {
  tiles: new Uint8Array(MW * MH),
  block: new Uint8Array(MW * MH),
  objects: [], lights: [], spots: {}, buildings: {}, poleTops: [], waterTiles: [],
  t(x, y) { return (x < 0 || y < 0 || x >= MW || y >= MH) ? T.WATER : this.tiles[y * MW + x]; },
  set(x, y, v) { if (x >= 0 && y >= 0 && x < MW && y < MH) this.tiles[y * MW + x] = v; },
  isBlocked(x, y) { return x < 0 || y < 0 || x >= MW || y >= MH || this.block[y * MW + x] === 1; },
  walkCost(x, y) {
    if (this.isBlocked(x, y)) return Infinity;
    return WALK_COST[this.t(x, y)];
  },
  walkable(x, y) { return this.walkCost(x, y) !== Infinity; },
};

function rectFill(x0, y0, w, h, v) {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) World.set(x, y, v);
}
function blockRect(x0, y0, w, h) {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++)
    if (x >= 0 && y >= 0 && x < MW && y < MH) World.block[y * MW + x] = 1;
}

function buildWorld() {
  const W = World;
  W.tiles.fill(T.GRASS);
  const streamMask = new Uint8Array(MW * MH);

  // stream
  for (let x = 0; x < MW; x++) {
    const c = streamC(x);
    for (let y = c; y <= c + 3; y++) { W.set(x, y, T.WATER); streamMask[y * MW + x] = 1; }
    W.set(x, c - 1, T.STONE); streamMask[(c - 1) * MW + x] = 1;
    W.set(x, c + 4, T.STONE); streamMask[(c + 4) * MW + x] = 1;
    W.set(x, c - 3, T.TRACK); W.set(x, c - 2, T.TRACK);
  }

  // roads
  for (let x = 0; x < MW; x++) for (const y of [28, 29, 34, 35]) W.set(x, y, T.SIDEWALK);
  for (let y = 0; y < MH; y++) for (const x of [44, 45, 50, 51]) W.set(x, y, T.SIDEWALK);
  for (let x = 0; x < MW; x++) for (let y = 30; y <= 33; y++) W.set(x, y, T.ASPHALT);
  for (let y = 0; y < MH; y++) for (let x = 46; x <= 49; x++) W.set(x, y, T.ASPHALT);
  for (const cx of [44, 50, 30, 64]) rectFill(cx, 30, 2, 4, T.CROSSWALK);
  for (const cy of [28, 34]) rectFill(46, cy, 4, 2, T.CROSSWALK);
  for (let y = 0; y < MH; y++) for (let x = 44; x <= 51; x++)
    if (streamMask[y * MW + x]) W.set(x, y, T.BRIDGE);
  // stepping stones
  for (const sx of [30, 74]) {
    const c = streamC(sx);
    for (let y = c - 1; y <= c + 4; y++) { W.set(sx, y, T.STEP); W.set(sx + 1, y, T.STEP); }
  }

  // areas
  rectFill(53, 37, 28, 15, T.PAVE);       // 중앙광장
  rectFill(56, 38, 5, 2, T.FLOOR);        // busking stage
  rectFill(70, 64, 22, 14, T.FIELD);      // 학교 운동장

  // buildings
  for (const b of BUILDINGS) {
    W.buildings[b.id] = b;
    blockRect(b.x, b.y, b.w, b.h);
  }
  W.buildings.outside = OUTSIDE;
  for (const p of PROPS) if (p.block) blockRect(p.x, p.y, p.w, p.h);

  carveAlleys();

  // spots
  const S = W.spots;
  const tilesOf = (pred) => {
    const out = [];
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) if (pred(x, y) && W.walkable(x, y)) out.push({ x, y });
    return out;
  };
  S.wander = tilesOf((x, y) => [T.ALLEY, T.SIDEWALK, T.PAVE, T.TRACK].includes(W.t(x, y)));
  S.river = tilesOf((x, y) => W.t(x, y) === T.TRACK && W.t(x, y + 1) === T.TRACK).map((s) => ({ ...s, y: s.y + 1, face: 'down' }));
  S.plaza = tilesOf((x, y) => W.t(x, y) === T.PAVE);
  S.field = tilesOf((x, y) => W.t(x, y) === T.FIELD);
  S.bench = PROPS.filter((p) => p.kind === 'bench').map((p) => ({ x: p.x, y: p.y, face: 'down' }));
  S.fountain = [];
  for (let x = 64; x <= 69; x++) for (const y of [41, 46]) S.fountain.push({ x, y, face: y === 41 ? 'down' : 'up' });
  for (let y = 42; y <= 45; y++) { S.fountain.push({ x: 64, y, face: 'right' }); S.fountain.push({ x: 69, y, face: 'left' }); }
  S.stage = [{ x: 58, y: 38, face: 'down' }];
  S.stall = [{ x: 76, y: 41, face: 'up' }, { x: 77, y: 41, face: 'up' }, { x: 78, y: 41, face: 'up' }];
  S.school_front = [];
  for (let x = 58; x <= 64; x++) for (let y = 74; y <= 75; y++) S.school_front.push({ x, y, face: 'up' });
  S.event_centers = { plaza: { x: 66, y: 48 }, fountain: { x: 66, y: 47 }, stage: { x: 58, y: 41 } };

  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) if (W.t(x, y) === T.WATER) W.waterTiles.push([x, y]);
}

function carveAlleys() {
  const W = World;
  const nearBuilding = (x, y) => {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (W.isBlocked(x + dx, y + dy)) return true;
    return false;
  };
  const starts = BUILDINGS.map((b) => b.door);
  starts.push({ x: 69, y: 70 }, { x: 61, y: 75 }, { x: 54, y: 52 }, { x: 24, y: 54 });
  for (const s of starts) {
    if (NETWORK.has(W.t(s.x, s.y))) continue;
    const path = gridSearch(MW, MH, s.x, s.y, (x, y) => {
      if (W.isBlocked(x, y)) return Infinity;
      const t = W.t(x, y);
      if (NETWORK.has(t)) return 0.3;
      if (t === T.FIELD) return 1.5;
      if (t !== T.GRASS) return Infinity;
      return 1 + (nearBuilding(x, y) ? 2 : 0) + hash2(x, y, 7) * 0.4;
    }, (x, y) => NETWORK.has(W.t(x, y)), () => 0);
    if (!path) continue;
    for (let i = 0; i < path.length; i++) {
      const [x, y] = path[i];
      if (W.t(x, y) === T.GRASS) W.set(x, y, T.ALLEY);
      const nxt = path[i + 1] || path[i - 1];
      if (!nxt) continue;
      const vertical = nxt[0] === x;
      const px = vertical ? x + 1 : x, py = vertical ? y : y + 1;
      if (W.t(px, py) === T.GRASS && !W.isBlocked(px, py)) W.set(px, py, T.ALLEY);
    }
  }
}

// ---------------------------------------------------------------------------
// Drawing helpers
// ---------------------------------------------------------------------------
function mkCanvas(w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
  return [c, g];
}
function R(g, x, y, w, h, col) { g.fillStyle = col; g.fillRect(x, y, w, h); }
function shadeHex(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const r = clamp(Math.round(((n >> 16) & 255) * k), 0, 255);
  const gg = clamp(Math.round(((n >> 8) & 255) * k), 0, 255);
  const b = clamp(Math.round((n & 255) * k), 0, 255);
  return `rgb(${r},${gg},${b})`;
}
const PIXFONT = '"Galmuri9", "Galmuri11", "Malgun Gothic", sans-serif';
function text(g, s, x, y, col, size = 9, align = 'center') {
  g.font = `${size}px ${PIXFONT}`; g.textAlign = align; g.textBaseline = 'middle';
  g.fillStyle = col; g.fillText(s, x, y);
}
function windowPane(g, x, y, w, h, opts = {}) {
  R(g, x - 1, y - 1, w + 2, h + 2, opts.frame || '#e8e8e4');
  R(g, x, y, w, h, opts.glass || '#78a9cf');
  R(g, x, y, w, 2, shadeHex(opts.glassHex || '#78a9cf', 1.25));
  R(g, x + 1, y + 3, 2, h - 5, 'rgba(255,255,255,0.45)');
  if (opts.cross !== false) { R(g, x + (w >> 1), y, 1, h, opts.frame || '#e8e8e4'); }
  if (opts.bars) for (let i = x + 2; i < x + w; i += 3) R(g, i, y, 1, h, '#3b3b3b');
  R(g, x - 1, y + h + 1, w + 2, 1, 'rgba(0,0,0,0.25)');
}
function brickWall(g, x, y, w, h, base) {
  R(g, x, y, w, h, base);
  const dark = shadeHex(base, 0.82), light = shadeHex(base, 1.1);
  for (let yy = y; yy < y + h; yy += 4) {
    R(g, x, yy, w, 1, dark);
    const off = ((yy - y) / 4) % 2 ? 4 : 0;
    for (let xx = x + off; xx < x + w; xx += 8) R(g, xx, yy + 1, 1, 3, dark);
    if (hash2(x, yy) > 0.6) R(g, x + ((hash2(yy, x) * w) | 0), yy + 1, 3, 1, light);
  }
}
function acUnit(g, x, y) {
  R(g, x, y, 12, 9, '#dcdcd6'); R(g, x, y + 8, 12, 1, '#9a9a94');
  g.fillStyle = '#8a8a86'; g.beginPath(); g.arc(x + 4, y + 4.5, 3, 0, 7); g.fill();
  R(g, x + 8, y + 2, 3, 1, '#a0a09a'); R(g, x + 8, y + 4, 3, 1, '#a0a09a'); R(g, x + 8, y + 6, 3, 1, '#a0a09a');
}
function gasPipe(g, x, y0, y1) {
  R(g, x, y0, 2, y1 - y0, '#e0b23a'); R(g, x + 1, y0, 1, y1 - y0, '#b88a22');
}
function outline(g, w, h) {
  // dark 1px outline around non-transparent pixels
  const img = g.getImageData(0, 0, w, h), d = img.data;
  for (let i = 3; i < d.length; i += 4) d[i] = d[i] >= 110 ? 255 : 0; // hard pixel edges
  const out = new Uint8ClampedArray(d);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    if (d[i + 3] > 0) continue;
    const n = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
      const nx = x + dx, ny = y + dy;
      return nx >= 0 && ny >= 0 && nx < w && ny < h && d[((ny * w + nx) * 4) + 3] > 200;
    });
    if (n) { out[i] = 40; out[i + 1] = 30; out[i + 2] = 36; out[i + 3] = 255; }
  }
  g.putImageData(new ImageData(out, w, h), 0, 0);
}

// ---------------------------------------------------------------------------
// Ground
// ---------------------------------------------------------------------------
function drawGround() {
  const [c, g] = mkCanvas(MW * TILE, MH * TILE);
  const W = World;
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) drawTile(g, x, y, W.t(x, y));
  // grass shading next to hard surfaces
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    if (W.t(x, y) !== T.GRASS) continue;
    const px = x * TILE, py = y * TILE;
    if (W.t(x, y - 1) !== T.GRASS && W.t(x, y - 1) !== T.STONE) R(g, px, py, 16, 2, 'rgba(40,70,20,0.35)');
  }
  // building drop shadows
  for (const b of BUILDINGS) R(g, b.x * TILE + 4, (b.y + b.h) * TILE, b.w * TILE - 2, 4, 'rgba(0,0,0,0.22)');
  return c;
}

function drawTile(g, x, y, t) {
  const px = x * TILE, py = y * TILE, h = (s) => hash2(x, y, s);
  const W = World;
  switch (t) {
    case T.GRASS: {
      R(g, px, py, 16, 16, h(1) > 0.5 ? '#6db441' : '#69af3e');
      for (let i = 0; i < 5; i++) {
        const gx = (h(10 + i) * 15) | 0, gy = (h(20 + i) * 14) | 0;
        R(g, px + gx, py + gy, 1, 2, i % 2 ? '#4f9530' : '#86c955');
      }
      if (h(3) > 0.94) {
        const col = ['#f7f3ea', '#f6d84a', '#f39bc0', '#e8574b'][(h(4) * 4) | 0];
        const fx = px + 4 + ((h(5) * 8) | 0), fy = py + 4 + ((h(6) * 8) | 0);
        R(g, fx - 1, fy, 3, 1, col); R(g, fx, fy - 1, 1, 3, col); R(g, fx, fy, 1, 1, '#f2c12e');
      }
      break;
    }
    case T.WATER: {
      R(g, px, py, 16, 16, '#4a95c4');
      if (h(1) > 0.4) R(g, px + ((h(2) * 10) | 0), py + ((h(3) * 14) | 0), 5, 1, '#6db2dc');
      if (W.t(x, y - 1) === T.STONE) R(g, px, py, 16, 3, '#3a7aa6');
      if (W.t(x, y + 1) === T.STONE) R(g, px, py + 14, 16, 2, '#7cc0e4');
      break;
    }
    case T.STONE: {
      R(g, px, py, 16, 16, '#8d877c');
      for (let r = 0; r < 4; r++) {
        const off = r % 2 ? 4 : 0;
        for (let k = -1; k < 3; k++) {
          const sx = px + off + k * 8;
          R(g, Math.max(px, sx + 1), py + r * 4 + 1, Math.min(6, px + 16 - Math.max(px, sx + 1)), 3, h(r * 5 + k + 30) > 0.5 ? '#a8a296' : '#9b9589');
        }
      }
      break;
    }
    case T.TRACK: {
      R(g, px, py, 16, 16, '#b86a4e');
      if (h(1) > 0.5) R(g, px + ((h(2) * 14) | 0), py + ((h(3) * 14) | 0), 2, 1, '#a65b41');
      if (W.t(x, y + 1) === T.TRACK && (x % 4 < 2)) R(g, px, py + 15, 16, 1, '#e8d6c0');
      break;
    }
    case T.ALLEY: {
      R(g, px, py, 16, 16, '#c7c1b4');
      if (h(1) > 0.7) R(g, px + ((h(2) * 12) | 0), py + ((h(3) * 12) | 0), 3, 1, '#b2ac9f');
      if (h(4) > 0.92) { R(g, px + 3, py + 8, 5, 1, '#a49e92'); R(g, px + 8, py + 9, 4, 1, '#a49e92'); }
      for (const [dx, dy, ex, ey, ew, eh] of [[0, -1, 0, 0, 16, 1], [0, 1, 0, 15, 16, 1], [-1, 0, 0, 0, 1, 16], [1, 0, 15, 0, 1, 16]])
        if (W.t(x + dx, y + dy) === T.GRASS) R(g, px + ex, py + ey, ew, eh, '#a8a294');
      break;
    }
    case T.SIDEWALK: {
      const a = '#cdb9a8', b = '#bfa898';
      for (let yy = 0; yy < 16; yy += 4) for (let xx = 0; xx < 16; xx += 8) {
        const off = (yy / 4) % 2 ? 4 : 0;
        R(g, px + ((xx + off) % 16), py + yy, 7, 3, ((x + y + xx + yy) % 3) ? a : b);
      }
      R(g, px, py + 3, 16, 1, '#a89484'); R(g, px, py + 7, 16, 1, '#a89484'); R(g, px, py + 11, 16, 1, '#a89484'); R(g, px, py + 15, 16, 1, '#a89484');
      // curb
      if (W.t(x, y + 1) === T.ASPHALT) R(g, px, py + 13, 16, 3, '#dedcd4');
      if (W.t(x, y - 1) === T.ASPHALT) R(g, px, py, 16, 3, '#dedcd4');
      if (W.t(x + 1, y) === T.ASPHALT) R(g, px + 13, py, 3, 16, '#dedcd4');
      if (W.t(x - 1, y) === T.ASPHALT) R(g, px, py, 3, 16, '#dedcd4');
      break;
    }
    case T.ASPHALT: case T.CROSSWALK: {
      R(g, px, py, 16, 16, '#4b4e56');
      for (let i = 0; i < 4; i++) R(g, px + ((h(i) * 15) | 0), py + ((h(i + 9) * 15) | 0), 1, 1, i % 2 ? '#575a63' : '#42454c');
      const mainRoad = y >= 30 && y <= 33, nsRoad = x >= 46 && x <= 49;
      if (t === T.CROSSWALK) {
        if (mainRoad && !nsRoad) { R(g, px, py + 1, 16, 5, '#ecebe6'); R(g, px, py + 9, 16, 5, '#ecebe6'); }
        else { R(g, px + 1, py, 5, 16, '#ecebe6'); R(g, px + 9, py, 5, 16, '#ecebe6'); }
      } else if (mainRoad && nsRoad) {
        // intersection: no markings
      } else if (mainRoad) {
        if (y === 31) { R(g, px, py + 13, 16, 1, '#e8c547'); R(g, px, py + 15, 16, 1, '#e8c547'); }
        if ((y === 30 || y === 32) && x % 3 === 0) R(g, px + 2, py + 15, 10, 1, '#d8d8d2');
      } else if (nsRoad) {
        if (x === 47) { R(g, px + 13, py, 1, 16, '#e8c547'); R(g, px + 15, py, 1, 16, '#e8c547'); }
        if ((x === 46 || x === 48) && y % 3 === 0) R(g, px + 15, py + 2, 1, 10, '#d8d8d2');
        if (y === 27 || y === 36) R(g, px, y === 27 ? py + 14 : py, 16, 2, '#ecebe6'); // stop line
      }
      if (mainRoad && !nsRoad && (x === 43 || x === 52) && t === T.ASPHALT) R(g, x === 43 ? px + 14 : px, py, 2, 16, '#ecebe6');
      break;
    }
    case T.BRIDGE: {
      const road = x >= 46 && x <= 49;
      R(g, px, py, 16, 16, road ? '#555860' : '#b4b2aa');
      if (!road) { R(g, px, py + 7, 16, 1, '#a09e96'); R(g, px, py + 15, 16, 1, '#a09e96'); }
      if (x === 47) { R(g, px + 13, py, 1, 16, '#e8c547'); R(g, px + 15, py, 1, 16, '#e8c547'); }
      if (x === 44) { R(g, px, py, 3, 16, '#e2e2dc'); R(g, px + 1, py, 1, 16, '#8a8a86'); }
      if (x === 51) { R(g, px + 13, py, 3, 16, '#e2e2dc'); R(g, px + 14, py, 1, 16, '#8a8a86'); }
      break;
    }
    case T.STEP: {
      const water = W.t(x, y) === T.STEP && (y >= streamC(x) && y <= streamC(x) + 3);
      R(g, px, py, 16, 16, water ? '#4a95c4' : '#8d877c');
      g.fillStyle = '#c9c4b8'; g.beginPath(); g.ellipse(px + 8, py + 8, 6, 5, 0, 0, 7); g.fill();
      R(g, px + 4, py + 11, 9, 2, '#9c968a'); R(g, px + 5, py + 5, 4, 1, '#e4e0d6');
      break;
    }
    case T.PAVE: {
      R(g, px, py, 16, 16, '#d6c6ae');
      R(g, px, py + 7, 16, 1, '#bfae95'); R(g, px, py + 15, 16, 1, '#bfae95');
      R(g, px + ((y % 2) ? 3 : 11), py, 1, 7, '#bfae95'); R(g, px + ((y % 2) ? 11 : 3), py + 8, 1, 7, '#bfae95');
      if (h(2) > 0.85) R(g, px + 1, py + 1, 6, 6, '#c9a99a');
      break;
    }
    case T.TURF: {
      R(g, px, py, 16, 16, (x % 4 < 2) ? '#48a84e' : '#3f9b46');
      if (h(1) > 0.6) R(g, px + ((h(2) * 14) | 0), py + ((h(3) * 14) | 0), 1, 2, '#5bbd5f');
      const x0 = 55, x1 = 72, y0 = 63, y1 = 70;
      if (y === y0) R(g, px, py, 16, 1, '#f2f2f2');
      if (y === y1) R(g, px, py + 15, 16, 1, '#f2f2f2');
      if (x === x0) R(g, px, py, 1, 16, '#f2f2f2');
      if (x === x1) R(g, px + 15, py, 1, 16, '#f2f2f2');
      if (x === 63) R(g, px + 15, py, 1, 16, '#f2f2f2');
      break;
    }
    case T.FIELD: {
      R(g, px, py, 16, 16, h(1) > 0.5 ? '#d8ad72' : '#d3a76b');
      for (let i = 0; i < 3; i++) R(g, px + ((h(i + 3) * 15) | 0), py + ((h(i + 7) * 15) | 0), 1, 1, '#bf9058');
      const x0 = 71, x1 = 90, y0 = 65, y1 = 76;
      if ((y === y0 || y === y1) && x >= x0 && x <= x1) R(g, px, y === y0 ? py : py + 15, 16, 1, '#f4f0e6');
      if ((x === x0 || x === x1) && y >= y0 && y <= y1) R(g, x === x0 ? px : px + 15, py, 1, 16, '#f4f0e6');
      if (x === 80 && y >= y0 && y <= y1) R(g, px + 15, py, 1, 16, '#f4f0e6');
      break;
    }
    case T.SOIL: {
      R(g, px, py, 16, 16, '#7a5233');
      R(g, px, py + 3, 16, 2, '#6a4429'); R(g, px, py + 11, 16, 2, '#6a4429');
      if (y % 2 === 0) for (let k = 2; k < 16; k += 5) {
        R(g, px + k, py + 6, 3, 3, h(k) > 0.4 ? '#5cae3c' : '#7cc44c');
        R(g, px + k + 1, py + 5, 1, 1, '#8fd45a');
        if (h(k + 50) > 0.8) R(g, px + k + 1, py + 7, 1, 1, '#e8574b');
      }
      break;
    }
    case T.SAND: {
      R(g, px, py, 16, 16, '#e6d39c');
      for (let i = 0; i < 3; i++) R(g, px + ((h(i) * 15) | 0), py + ((h(i + 5) * 15) | 0), 1, 1, '#cdb87e');
      break;
    }
    case T.FLOOR: {
      R(g, px, py, 16, 16, '#b88656');
      R(g, px, py + 3, 16, 1, '#9a6c42'); R(g, px, py + 7, 16, 1, '#9a6c42'); R(g, px, py + 11, 16, 1, '#9a6c42'); R(g, px, py + 15, 16, 1, '#9a6c42');
      R(g, px + (x % 2 ? 5 : 11), py, 1, 3, '#9a6c42');
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// Buildings
// ---------------------------------------------------------------------------
function drawBuilding(b) {
  const Wpx = b.w * TILE, Hpx = b.h * TILE + b.top;
  const [c, g] = mkCanvas(Wpx, Hpx);
  const lights = []; // relative px
  const fn = { villa: drawVilla, house: drawHouse, hanok: drawHanok, oneroom: drawOneroom, church: drawChurch, apartment: drawApartment,
    cafe: drawShop, restaurant: drawShop, studycafe: drawShop, police: drawShop, store: drawShop,
    hospital: drawHospital, gym: drawGym, school: drawSchool, firestation: drawFireStation }[b.kind];
  fn(g, b, Wpx, Hpx, lights);
  outline(g, Wpx, Hpx);
  return { canvas: c, lights };
}

function namePlate(g, s, cx, y, bg = '#f4efe2', fg = '#3a2e26') {
  g.font = `9px ${PIXFONT}`;
  const w = Math.ceil(g.measureText(s).width) + 10;
  R(g, cx - (w >> 1), y, w, 10, bg); R(g, cx - (w >> 1), y + 10, w, 1, 'rgba(0,0,0,0.3)');
  text(g, s, cx, y + 5.5, fg, 9);
}

function drawVilla(g, b, W, H, L) {
  const top = b.top, brick = b.brick;
  // flat roof (seen from above)
  R(g, 0, top, W, 26, '#cfc8bb');
  R(g, 3, top + 3, W - 6, 20, '#5e9f6e');
  R(g, 3, top + 3, W - 6, 2, '#4d8a5c');
  for (let x = 8; x < W - 6; x += 10) R(g, x, top + 7, 6, 1, '#73b282');
  // water tank / satellite
  R(g, W - 26, top + 6, 16, 12, '#e9eef2'); R(g, W - 26, top + 10, 16, 2, '#3f78b8'); R(g, W - 26, top + 17, 16, 1, '#9aa4ad');
  if (!b.rooftop) { R(g, 10, top + 9, 10, 8, '#9a9a94'); R(g, 11, top + 10, 8, 2, '#c7c7c0'); }
  if (b.rooftop) {
    // 옥탑방 shack + laundry
    const sx = 8, sy = 2;
    R(g, sx, sy + 10, 52, 30, '#eeeae0');
    R(g, sx - 3, sy, 58, 12, '#3d6fb3');
    for (let x = sx - 3; x < sx + 55; x += 4) R(g, x, sy, 1, 12, '#2f5a94');
    R(g, sx - 3, sy + 11, 58, 2, '#244a7c');
    R(g, sx + 6, sy + 18, 12, 22, '#6b8fb0'); R(g, sx + 15, sy + 28, 2, 2, '#e0c060');
    windowPane(g, sx + 26, sy + 18, 18, 11, { bars: true });
    L.push({ x: sx + 35, y: sy + 23, r: 22, c: 'win' });
    // plants & laundry
    R(g, sx + 56, sy + 30, 6, 6, '#8a5a3a'); R(g, sx + 55, sy + 26, 8, 5, '#4f9d3c');
    R(g, sx + 62, sy + 14, 1, 24, '#6a6a6a'); R(g, W - 6, sy + 14, 1, 24, '#6a6a6a'); R(g, sx + 62, sy + 15, W - 6 - sx - 62, 1, '#6a6a6a');
    R(g, sx + 66, sy + 16, 7, 9, '#f06a7a'); R(g, sx + 76, sy + 16, 6, 8, '#f4f4f4'); R(g, sx + 85, sy + 16, 7, 10, '#6ab0e8');
  }
  // facade
  const fy = top + 26, fh = H - fy;
  brickWall(g, 0, fy, W, fh, brick);
  R(g, 0, fy, W, 3, shadeHex(brick, 0.7));
  const floors = [fy + 8, fy + 40];
  for (const wy of floors) {
    windowPane(g, 10, wy, 26, 15);
    windowPane(g, W - 36, wy, 26, 15);
    R(g, 8, wy + 17, 30, 2, '#d8d4cc'); R(g, W - 38, wy + 17, 30, 2, '#d8d4cc');
    acUnit(g, 40, wy + 6);
    L.push({ x: 23, y: wy + 7, r: 18, c: 'win' }, { x: W - 23, y: wy + 7, r: 18, c: 'win' });
    R(g, 0, wy + 26, W, 2, shadeHex(brick, 1.15));
  }
  gasPipe(g, W - 6, fy + 4, H - 4);
  R(g, W - 14, fy + 20, 8, 2, '#e0b23a');
  // ground floor entrance
  const gy = fy + 72;
  R(g, 0, gy, W, H - gy, '#bdb6a8');
  R(g, 0, gy, W, 2, '#8f897d');
  const dx = W / 2 - 8;
  R(g, dx - 2, gy + 3, 20, 3, '#6f6f6f');
  R(g, dx, gy + 6, 16, H - gy - 6, '#3e4a55');
  R(g, dx + 1, gy + 7, 6, H - gy - 8, '#6f9cbf'); R(g, dx + 9, gy + 7, 6, H - gy - 8, '#6f9cbf');
  R(g, dx + 7, gy + 14, 2, 4, '#c9c9c9');
  windowPane(g, 8, gy + 8, 22, 12, { bars: true });
  windowPane(g, W - 30, gy + 8, 22, 12, { bars: true });
  namePlate(g, b.name, W / 2, fy + 64, '#2e3a46', '#f4f0e4');
  // mailboxes + plant
  R(g, W - 26, gy + 24, 12, 8, '#c94b3c'); R(g, W - 25, gy + 26, 10, 1, '#7a2a20');
  R(g, 32, gy + 24, 8, 8, '#a2683e'); R(g, 31, gy + 19, 10, 6, '#4f9d3c');
}

function drawHouse(g, b, W, H, L) {
  const roof = b.roof, wall = b.wall;
  // roof
  const rh = 46;
  g.fillStyle = roof;
  g.beginPath(); g.moveTo(10, 4); g.lineTo(W - 10, 4); g.lineTo(W, rh); g.lineTo(0, rh); g.closePath(); g.fill();
  for (let y = 8; y < rh; y += 5) {
    const inset = 10 - (y / rh) * 10;
    R(g, inset, y, W - inset * 2, 1, shadeHex(roof, 0.8));
    for (let x = inset + ((y / 5) % 2 ? 0 : 4); x < W - inset; x += 8) R(g, x, y - 4, 1, 4, shadeHex(roof, 0.88));
  }
  R(g, 10, 2, W - 20, 4, shadeHex(roof, 1.2));
  R(g, 0, rh - 3, W, 3, shadeHex(roof, 0.65));
  // chimney
  R(g, W - 30, 0, 10, 14, '#8c5a44'); R(g, W - 31, 0, 12, 3, '#6e4636');
  // walls
  R(g, 4, rh, W - 8, H - rh, wall);
  R(g, 4, rh, W - 8, 3, shadeHex(wall, 0.8));
  for (let y = rh + 8; y < H - 6; y += 9) R(g, 4, y, W - 8, 1, shadeHex(wall, 0.95));
  // 2nd floor windows + balcony
  windowPane(g, 14, rh + 8, 22, 15);
  windowPane(g, W - 36, rh + 8, 22, 15);
  L.push({ x: 25, y: rh + 15, r: 18, c: 'win' }, { x: W - 25, y: rh + 15, r: 18, c: 'win' });
  R(g, 10, rh + 24, W - 20, 3, '#f4f4f0');
  for (let x = 12; x < W - 10; x += 4) R(g, x, rh + 27, 1, 6, '#5a5a5a');
  R(g, 10, rh + 33, W - 20, 2, '#5a5a5a');
  // ground floor
  const gy = rh + 38;
  const dx = W / 2 - 8;
  R(g, dx, gy, 16, H - gy - 4, '#6a4a34'); R(g, dx + 2, gy + 2, 12, 8, '#7d5a40'); R(g, dx + 2, gy + 12, 12, H - gy - 18, '#7d5a40');
  R(g, dx + 12, gy + 14, 2, 2, '#e7c25a');
  R(g, dx - 3, gy - 4, 22, 4, shadeHex(roof, 0.8));
  windowPane(g, 12, gy + 4, 18, 12);
  windowPane(g, W - 30, gy + 4, 18, 12);
  L.push({ x: 21, y: gy + 10, r: 16, c: 'win' });
  R(g, 4, H - 4, W - 8, 4, '#a8a296');
  R(g, dx - 2, H - 4, 20, 4, '#c8c2b6');
  // plants
  R(g, 8, H - 12, W / 2 - 22, 8, '#4f9d3c'); for (let x = 10; x < W / 2 - 16; x += 5) R(g, x, H - 11, 2, 2, '#f39bc0');
  namePlate(g, b.name, W - 22, gy + 22);
  gasPipe(g, 6, rh + 4, H - 6);
}

function drawHanok(g, b, W, H, L) {
  const top = b.top;
  const rh = 54;
  // roof with upturned eaves
  g.fillStyle = '#4c535e';
  g.beginPath();
  g.moveTo(0, top + 10); g.quadraticCurveTo(14, top + 18, 18, top + 4);
  g.lineTo(W - 18, top + 4); g.quadraticCurveTo(W - 14, top + 18, W, top + 10);
  g.lineTo(W - 6, top + rh); g.lineTo(6, top + rh); g.closePath(); g.fill();
  for (let x = 12; x < W - 10; x += 5) R(g, x, top + 12, 2, rh - 16, '#5d6672');
  R(g, 16, top, W - 32, 7, '#3a4048'); R(g, 16, top, W - 32, 2, '#e8e4dc'); R(g, 16, top + 6, W - 32, 1, '#e8e4dc');
  for (let x = 8; x < W - 8; x += 6) { g.fillStyle = '#6c7480'; g.beginPath(); g.arc(x + 3, top + rh - 2, 2.5, 0, 7); g.fill(); }
  // body
  const by = top + rh;
  R(g, 8, by, W - 16, H - by - 10, '#f1ece0');
  R(g, 8, by, W - 16, 4, '#6e4426');
  for (const x of [8, 40, W / 2 - 3, W - 46, W - 14]) R(g, x, by, 6, H - by - 10, '#7a4b2a');
  // 창호 lattice doors
  const lattice = (x, y, w, h) => {
    R(g, x, y, w, h, '#f6efd9');
    for (let i = x; i <= x + w; i += 4) R(g, i, y, 1, h, '#8a5a34');
    for (let j = y; j <= y + h; j += 4) R(g, x, j, w, 1, '#8a5a34');
  };
  lattice(16, by + 8, 22, 22); lattice(W - 38, by + 8, 22, 22);
  lattice(W / 2 - 12, by + 6, 24, H - by - 18);
  L.push({ x: 27, y: by + 19, r: 18, c: 'win' }, { x: W - 27, y: by + 19, r: 18, c: 'win' });
  // maru + stone base
  R(g, 4, H - 12, W - 8, 4, '#b88656'); R(g, 4, H - 8, W - 8, 8, '#a39d92');
  for (let x = 6; x < W - 6; x += 10) R(g, x, H - 6, 8, 4, '#b8b2a6');
  namePlate(g, b.name, 30, by - 3, '#3a2e26', '#f4efe2');
  // pot (장독)
  g.fillStyle = '#6a3e26'; g.beginPath(); g.ellipse(W - 10, H - 14, 5, 6, 0, 0, 7); g.fill();
  R(g, W - 14, H - 21, 8, 2, '#4a2a18');
}

function drawOneroom(g, b, W, H, L) {
  const top = b.top;
  R(g, 0, top, W, 10, '#c9c6be'); R(g, 2, top + 2, W - 4, 6, '#9fa6a0');
  // name sign on roof
  R(g, 16, top - 14, W - 32, 14, '#f4f4f0'); R(g, 20, 0, 2, top - 14, '#7a7a7a'); R(g, W - 22, 0, 2, top - 14, '#7a7a7a');
  R(g, 20, top - 22, W - 40, 8, '#2f9a6a'); text(g, '원룸 · 투룸', W / 2, top - 18, '#ffffff', 8);
  text(g, b.name, W / 2, top - 7, '#2e3a46', 9);
  const fy = top + 10;
  R(g, 0, fy, W, H - fy, '#ecebe6');
  for (let y = fy; y < H; y += 6) R(g, 0, y, W, 1, '#dcdad4');
  const rows = 3;
  for (let r = 0; r < rows; r++) {
    const wy = fy + 6 + r * 28;
    for (const wx of [8, 42, 76]) {
      windowPane(g, wx, wy, 26, 14, { frame: '#cfcfcf' });
      L.push({ x: wx + 13, y: wy + 7, r: 15, c: 'win' });
    }
    acUnit(g, 30, wy + 16);
    R(g, 0, wy + 24, W, 2, '#8fb3c9');
  }
  const gy = H - 24;
  R(g, W / 2 - 10, gy, 20, 24, '#4a5560'); R(g, W / 2 - 8, gy + 2, 7, 22, '#88b4d0'); R(g, W / 2 + 1, gy + 2, 7, 22, '#88b4d0');
  R(g, W / 2 - 14, gy - 4, 28, 4, '#2f9a6a');
  gasPipe(g, 3, fy + 4, H - 2);
  R(g, W - 22, gy + 10, 14, 10, '#3a7ac8'); R(g, W - 21, gy + 11, 12, 3, '#e9eef2'); // recycle bin
}

function drawShop(g, b, W, H, L) {
  const kind = b.kind, top = b.top;
  const cfg = {
    cafe:   { upper: '#efe2c6', sign: '#3f7a4f', signFg: '#f8f4e8', label: '팔팔카페', awn: ['#3f7a4f', '#f4efe2'], front: '#8a5a3a', glow: '#ffd59a' },
    restaurant: { upper: '#6a4a32', sign: '#f2e6c8', signFg: '#2a2a3a', label: '팔팔식당 돈까스·우동·튀김', awn: null, front: '#5a3a26', glow: '#ffb070' },
    studycafe: { upper: '#4a4f58', sign: '#1e2228', signFg: '#7fe0c0', label: '팔팔스터디카페 24H', awn: null, front: '#3a3f48', glow: '#d8f0ff' },
    police: { upper: '#f2f4f7', sign: '#1f3366', signFg: '#ffffff', label: '팔팔파출소', awn: null, front: '#d8dde6', glow: '#d8ecff' },
    store:  { upper: '#f4f4f2', sign: '#ffffff', signFg: '#1f6fd0', label: '팔팔25', awn: null, front: '#e8e8e6', glow: '#f0fbff' },
  }[kind];
  // roof parapet
  R(g, 0, top, W, 8, '#b5b0a6'); R(g, 2, top + 2, W - 4, 4, '#9a968c');
  if (kind === 'police') { R(g, W / 2 - 7, top - 8, 6, 8, '#e03a3a'); R(g, W / 2 + 1, top - 8, 6, 8, '#2f6ae0'); R(g, W / 2 - 8, top - 1, 16, 2, '#6a6a6a'); L.push({ x: W / 2, y: top - 4, r: 26, c: 'siren' }); }
  // upper floor
  const uy = top + 8;
  R(g, 0, uy, W, 34, cfg.upper);
  if (kind === 'restaurant') for (let x = 0; x < W; x += 6) R(g, x, uy, 1, 34, shadeHex(cfg.upper, 0.8));
  if (kind === 'police') R(g, 0, uy + 26, W, 4, '#2f5ab8');
  for (let x = 10; x + 24 <= W - 6; x += 34) {
    windowPane(g, x, uy + 7, 24, 14, kind === 'restaurant' ? { glass: '#f2e6c8', glassHex: '#f2e6c8' } : {});
    L.push({ x: x + 12, y: uy + 14, r: 15, c: 'win' });
  }
  if (kind === 'restaurant') {
    R(g, -2, uy + 28, W + 4, 6, '#3a3e48'); for (let x = 0; x < W; x += 5) R(g, x, uy + 30, 3, 3, '#4c525e');
  }
  // signboard (간판)
  const sy = uy + 34;
  R(g, 0, sy, W, 14, cfg.sign); R(g, 0, sy + 13, W, 1, 'rgba(0,0,0,0.3)');
  if (kind === 'store') { R(g, 0, sy, W, 3, '#1f6fd0'); R(g, 0, sy + 11, W, 3, '#2fae6a'); }
  let fs = 10;
  g.font = `${fs}px ${PIXFONT}`;
  while (fs > 7 && g.measureText(cfg.label).width > W - (kind === 'studycafe' ? 40 : 30)) { fs--; g.font = `${fs}px ${PIXFONT}`; }
  text(g, cfg.label, W / 2 + (kind === 'studycafe' ? 8 : 0), sy + 7.5, cfg.signFg, fs);
  if (kind === 'bakery') { g.fillStyle = '#d9913a'; g.beginPath(); g.ellipse(14, sy + 7, 6, 4, 0, 0, 7); g.fill(); R(g, 11, sy + 5, 1, 4, '#a8642a'); R(g, 15, sy + 5, 1, 4, '#a8642a'); }
  if (kind === 'cafe') { R(g, 10, sy + 3, 6, 7, '#f8f4e8'); R(g, 16, sy + 5, 2, 3, '#f8f4e8'); }
  if (kind === 'studycafe') { R(g, 6, sy + 4, 8, 6, '#7fe0c0'); R(g, 7, sy + 5, 6, 1, '#1e2228'); }
  if (kind === 'police') { g.fillStyle = '#f1c94a'; g.beginPath(); g.arc(12, sy + 7, 4, 0, 7); g.fill(); }
  L.push({ x: W / 2, y: sy + 7, r: 34, c: 'sign', col: cfg.glow });
  // ground floor storefront
  const gy = sy + 14, gh = H - gy;
  R(g, 0, gy, W, gh, cfg.front);
  if (kind === 'cafe' || kind === 'bakery') for (let x = 0; x < W; x += 6) R(g, x, gy, 1, gh, shadeHex(cfg.front, 0.82));
  if (cfg.awn) {
    for (let x = 0; x < W; x += 8) R(g, x, gy, 8, 7, cfg.awn[(x / 8) % 2]);
    for (let x = 0; x < W; x += 8) R(g, x + 1, gy + 7, 6, 2, cfg.awn[(x / 8) % 2]);
  }
  const wy = gy + (cfg.awn ? 11 : 4), wh = gh - (cfg.awn ? 13 : 6);
  const glass = (x, w) => {
    R(g, x - 1, wy - 1, w + 2, wh + 2, '#3a3a3e');
    R(g, x, wy, w, wh, '#8fbcd8');
    R(g, x + 2, wy + 2, 3, wh - 4, 'rgba(255,255,255,0.4)');
    if (kind === 'store') for (let yy = wy + 4; yy < wy + wh - 2; yy += 6) {
      R(g, x + 2, yy + 4, w - 4, 1, '#b8b8b8');
      for (let xx = x + 3; xx < x + w - 3; xx += 3) R(g, xx, yy + 1, 2, 3, ['#e8574b', '#f6d84a', '#3fb58a', '#4f86e8'][(xx + yy) % 4]);
    }
    if (kind === 'bakery') for (let xx = x + 3; xx < x + w - 4; xx += 6) { g.fillStyle = '#d9913a'; g.beginPath(); g.ellipse(xx + 2, wy + wh - 5, 3, 2, 0, 0, 7); g.fill(); }
    if (kind === 'cafe') { R(g, x + 3, wy + wh - 8, w - 6, 2, '#6a4a34'); R(g, x + 5, wy + wh - 12, 3, 4, '#f4efe2'); R(g, x + w - 9, wy + wh - 12, 3, 4, '#f4efe2'); }
    if (kind === 'studycafe') for (let xx = x + 2; xx < x + w - 6; xx += 8) { R(g, xx, wy + wh - 7, 7, 2, '#c8b89a'); R(g, xx, wy + wh - 12, 7, 5, '#5a6070'); R(g, xx + 5, wy + wh - 11, 1, 3, '#fff2b0'); }
    if (kind === 'restaurant') { R(g, x, wy, w, wh, '#f2e6c8'); for (let xx = x; xx < x + w; xx += 6) R(g, xx, wy, 1, wh, '#8a6a4a'); for (let yy = wy; yy < wy + wh; yy += 6) R(g, x, yy, w, 1, '#8a6a4a'); }
  };
  glass(6, 34); glass(W - 40, 34);
  L.push({ x: 23, y: wy + wh / 2, r: 26, c: kind === 'store' ? 'shop24' : 'shop', col: cfg.glow }, { x: W - 23, y: wy + wh / 2, r: 26, c: kind === 'store' ? 'shop24' : 'shop', col: cfg.glow });
  // door
  const dx = W / 2 - 9;
  R(g, dx - 1, wy - 1, 20, gh - (wy - gy) + 1, '#3a3a3e');
  R(g, dx, wy, 8, gh - (wy - gy), '#a8cce2'); R(g, dx + 10, wy, 8, gh - (wy - gy), '#a8cce2');
  R(g, dx + 7, wy + 10, 1, 5, '#d0d0d0'); R(g, dx + 10, wy + 10, 1, 5, '#d0d0d0');
  if (kind === 'store') { R(g, dx, wy + 2, 18, 3, '#f6d84a'); text(g, 'OPEN 24', W / 2, wy + 3.5, '#333', 6); }
  if (kind === 'police') { text(g, '112', W / 2, wy + 6, '#1f3366', 8); }
  if (kind === 'restaurant') {
    R(g, dx - 4, wy - 1, 26, 12, '#24365e');
    for (let k = 0; k < 3; k++) R(g, dx - 4 + k * 9, wy + 11, 8, 3, '#24365e');
    text(g, '돈까스', W / 2, wy + 5, '#f4f0e4', 7);
    for (const lx of [dx - 14, dx + 28]) {
      R(g, lx + 2, wy - 6, 1, 4, '#3a2a1a');
      g.fillStyle = '#d8342c'; g.beginPath(); g.ellipse(lx + 2.5, wy + 3, 5, 6, 0, 0, 7); g.fill();
      R(g, lx - 1, wy - 3, 7, 1, '#3a2a1a'); R(g, lx - 1, wy + 9, 7, 1, '#3a2a1a');
      L.push({ x: lx + 2, y: wy + 3, r: 18, c: 'shop', col: '#ff8040' });
    }
  }
}

function drawHospital(g, b, W, H, L) {
  const top = b.top, cx = W / 2;
  // rooftop cross sign
  R(g, cx - 34, 0, 68, top + 2, '#f4f4f2'); R(g, cx - 34, 0, 68, 2, '#c8c8c4');
  R(g, cx - 28, 3, 6, 10, '#e03a3a'); R(g, cx - 30, 5, 10, 6, '#e03a3a');
  text(g, b.name, cx + 6, 8.5, '#2a5aa8', 10);
  L.push({ x: cx, y: 8, r: 44, c: 'hcross' });
  R(g, cx - 30, top + 2, 2, 4, '#8a8a86'); R(g, cx + 28, top + 2, 2, 4, '#8a8a86');
  // body
  const fy = top + 6;
  R(g, 0, fy, W, 6, '#c9cdd2');
  R(g, 0, fy + 6, W, H - fy - 6, '#f3f5f7');
  for (const yy of [fy + 36, fy + 70]) R(g, 0, yy, W, 4, '#3f78c8');
  for (let r = 0; r < 2; r++) for (let k = 0; k < 5; k++) {
    const x = 8 + k * 34, y = fy + 14 + r * 34;
    windowPane(g, x, y, 26, 14, { frame: '#d8dce2' });
    L.push({ x: x + 13, y: y + 7, r: 15, c: 'win' });
  }
  // entrance
  const gy = H - 30;
  R(g, cx - 26, gy - 6, 52, 6, '#3f78c8');
  R(g, cx - 22, gy, 44, 30, '#3a3a3e'); R(g, cx - 21, gy + 1, 20, 29, '#a8cce2'); R(g, cx + 1, gy + 1, 20, 29, '#a8cce2');
  L.push({ x: cx, y: gy + 14, r: 30, c: 'shop24', col: '#e8f6ff' });
  R(g, 10, gy + 6, 34, 12, '#e03a3a'); text(g, '응급실', 27, gy + 12.5, '#ffffff', 8);
  windowPane(g, W - 44, gy + 6, 30, 16, { frame: '#d8dce2' });
}

function drawFireStation(g, b, W, H, L) {
  const top = b.top, cx = W / 2;
  // roof siren
  R(g, cx - 6, top - 10, 12, 8, '#e03a3a'); R(g, cx - 7, top - 3, 14, 3, '#5a5a5a');
  L.push({ x: cx, y: top - 6, r: 28, c: 'siren' });
  R(g, 0, top, W, 8, '#b5b0a6'); R(g, 2, top + 2, W - 4, 4, '#9a968c');
  // upper floor brick + windows
  const uy = top + 8;
  brickWall(g, 0, uy, W, 36, '#b8483a');
  for (let x = 8; x + 22 <= W - 4; x += 30) { windowPane(g, x, uy + 8, 22, 14); L.push({ x: x + 11, y: uy + 15, r: 15, c: 'win' }); }
  // sign
  const sy = uy + 36;
  R(g, 0, sy, W, 13, '#f4f4f0'); R(g, 0, sy + 12, W, 1, 'rgba(0,0,0,0.3)');
  text(g, `${b.name} 119`, cx, sy + 7, '#c8302a', 10);
  L.push({ x: cx, y: sy + 6, r: 34, c: 'shop24', col: '#ffd0c8' });
  // two garage bays
  const gy = sy + 13, gh = H - gy;
  R(g, 0, gy, W, gh, '#d9d4cc');
  for (const bx of [6, W / 2 + 4]) {
    const bw = W / 2 - 10;
    R(g, bx - 2, gy + 3, bw + 4, gh - 3, '#7a1f1a');
    R(g, bx, gy + 5, bw, gh - 5, '#e4e0d8');
    for (let y = gy + 7; y < H; y += 4) R(g, bx, y, bw, 1, '#b8b2a8');
    R(g, bx + 4, gy + 8, bw - 8, 6, '#8fbcd8');
  }
}

function drawGym(g, b, W, H, L) {
  const top = b.top;
  // arched metal roof
  const rh = 62;
  g.fillStyle = '#5f7f9f';
  g.beginPath(); g.ellipse(W / 2, top + rh, W / 2, rh, 0, Math.PI, 0); g.fill();
  for (let x = 6; x < W; x += 8) {
    const dx = (x - W / 2) / (W / 2), yy = top + rh - Math.sqrt(Math.max(0, 1 - dx * dx)) * rh;
    R(g, x, yy + 2, 2, top + rh - yy - 2, '#4d6a88');
  }
  R(g, 0, top + rh - 4, W, 4, '#3f5770');
  // facade
  const fy = top + rh;
  brickWall(g, 0, fy, W, H - fy, '#c8b8a0');
  for (let k = 0; k < 5; k++) { windowPane(g, 8 + k * 34, fy + 6, 26, 10); L.push({ x: 21 + k * 34, y: fy + 11, r: 15, c: 'win' }); }
  R(g, W / 2 - 40, fy + 22, 80, 14, '#d23b3b'); text(g, b.name, W / 2, fy + 29.5, '#ffffff', 10);
  L.push({ x: W / 2, y: fy + 29, r: 34, c: 'sign', col: '#ffb0a0' });
  const gy = H - 30;
  R(g, W / 2 - 16, gy, 32, 30, '#3a3a3e'); R(g, W / 2 - 15, gy + 1, 14, 29, '#9a6a3c'); R(g, W / 2 + 1, gy + 1, 14, 29, '#9a6a3c');
  R(g, W / 2 - 3, gy + 14, 2, 4, '#e0c060'); R(g, W / 2 + 1, gy + 14, 2, 4, '#e0c060');
  // dumbbell icon
  R(g, 14, gy + 10, 20, 3, '#4a4a4a'); R(g, 11, gy + 6, 5, 11, '#2a2a2a'); R(g, 32, gy + 6, 5, 11, '#2a2a2a');
  windowPane(g, W - 44, gy + 4, 30, 16);
}

function drawSchool(g, b, W, H, L) {
  const top = b.top, cx = W / 2;
  // clock tower
  R(g, cx - 22, 0, 44, top + 10, '#e6d6b8'); R(g, cx - 24, 0, 48, 4, '#8a5a3a');
  g.fillStyle = '#f8f4ea'; g.beginPath(); g.arc(cx, 14, 9, 0, 7); g.fill();
  g.strokeStyle = '#3a2e26'; g.lineWidth = 1; g.beginPath(); g.arc(cx, 14, 9, 0, 7); g.stroke();
  R(g, cx, 7, 1, 7, '#3a2e26'); R(g, cx, 14, 5, 1, '#3a2e26');
  // roof
  const fy = top + 8;
  R(g, 0, top + 2, W, 8, '#b5ada0'); R(g, 2, top + 4, W - 4, 4, '#7fa08a');
  // facade 3 floors
  R(g, 0, fy, W, H - fy, '#efe4cc');
  R(g, 0, fy, 6, H - fy, '#d9c8a8'); R(g, W - 6, fy, 6, H - fy, '#d9c8a8');
  namePlate(g, b.name, cx, fy + 3, '#2f5a48', '#f4efe2');
  for (let r = 0; r < 3; r++) {
    const y = fy + 18 + r * 32;
    R(g, 0, y + 22, W, 3, '#c9a98a');
    for (let k = 0; k < 7; k++) {
      const x = 10 + k * 32;
      if (r === 2 && Math.abs(x + 12 - cx) < 30) continue;
      windowPane(g, x, y, 24, 15);
      if ((k + r) % 2) L.push({ x: x + 12, y: y + 7, r: 15, c: 'win' });
    }
  }
  // banner
  R(g, W - 26, fy + 18, 14, 60, '#f4f4f0'); R(g, W - 26, fy + 18, 14, 3, '#d23b3b');
  ['수', '능', '대', '박'].forEach((ch, i) => text(g, ch, W - 19, fy + 30 + i * 12, '#d23b3b', 9));
  // entrance
  const gy = H - 30;
  R(g, cx - 28, gy - 6, 56, 6, '#2f5a48');
  R(g, cx - 24, gy, 48, 30, '#3a3a3e');
  for (const dx of [-23, -11, 1, 13]) R(g, cx + dx, gy + 1, 10, 29, '#a8cce2');
}



function drawChurch(g, b, W, H, L) {
  const top = b.top;
  const brick = '#a5503c';
  const cx = W / 2;
  // body roof
  const ry = top + 4;
  g.fillStyle = '#4f5560';
  g.beginPath(); g.moveTo(6, ry + 34); g.lineTo(cx, ry - 4); g.lineTo(W - 6, ry + 34); g.closePath(); g.fill();
  for (let i = 0; i < 6; i++) R(g, 12 + i * 4, ry + 30 - i * 6, W - 24 - i * 8, 1, '#5f6672');
  // body walls
  const wy = ry + 34;
  brickWall(g, 4, wy, W - 8, H - wy, brick);
  // arched stained windows
  const arched = (x, y, w, h) => {
    R(g, x - 1, y + 3, w + 2, h - 2, '#e8e0cc');
    g.fillStyle = '#e8e0cc'; g.beginPath(); g.arc(x + w / 2, y + 4, w / 2 + 1, Math.PI, 0); g.fill();
    const cols = ['#e05a5a', '#f2c94a', '#4f86e8', '#5fbf6a'];
    for (let j = 0; j < h - 4; j += 4) for (let i = 0; i < w; i += 3) R(g, x + i, y + 4 + j, 3, 4, cols[(i / 3 + j / 4) % 4]);
    g.fillStyle = '#4f86e8'; g.beginPath(); g.arc(x + w / 2, y + 4, w / 2, Math.PI, 0); g.fill();
  };
  arched(14, wy + 18, 12, 30); arched(W - 26, wy + 18, 12, 30);
  arched(14, wy + 62, 12, 26); arched(W - 26, wy + 62, 12, 26);
  L.push({ x: 20, y: wy + 34, r: 18, c: 'win', col: '#ffd8a0' }, { x: W - 20, y: wy + 34, r: 18, c: 'win', col: '#ffd8a0' });
  // tower
  const tw = 40, tx = cx - tw / 2, ty = 36;
  brickWall(g, tx, ty, tw, H - ty, shadeHex(brick, 1.05));
  R(g, tx, ty, 2, H - ty, shadeHex(brick, 0.7)); R(g, tx + tw - 2, ty, 2, H - ty, shadeHex(brick, 0.7));
  R(g, tx, ty, tw, 3, '#e8e0cc');
  g.fillStyle = '#3f4550';
  g.beginPath(); g.moveTo(tx - 3, ty + 2); g.lineTo(cx, 12); g.lineTo(tx + tw + 3, ty + 2); g.closePath(); g.fill();
  R(g, cx - 1, 12, 2, 24, '#555c68');
  // neon cross
  R(g, cx - 2, 0, 4, 16, '#ff3b3b'); R(g, cx - 6, 4, 12, 4, '#ff3b3b'); R(g, cx - 1, 1, 2, 14, '#ffb0b0'); R(g, cx - 5, 5, 10, 2, '#ffb0b0');
  L.push({ x: cx, y: 7, r: 40, c: 'cross' });
  // rose window + bell slit
  g.fillStyle = '#e8e0cc'; g.beginPath(); g.arc(cx, ty + 22, 10, 0, 7); g.fill();
  g.fillStyle = '#4f86e8'; g.beginPath(); g.arc(cx, ty + 22, 8, 0, 7); g.fill();
  for (let a = 0; a < 8; a++) R(g, cx + Math.cos(a * 0.785) * 5 - 1, ty + 22 + Math.sin(a * 0.785) * 5 - 1, 3, 3, ['#e05a5a', '#f2c94a'][a % 2]);
  R(g, cx - 4, ty + 40, 8, 14, '#2e2a2a'); g.fillStyle = '#e0b23a'; g.beginPath(); g.arc(cx, ty + 50, 3, 0, 7); g.fill();
  // sign + door
  namePlate(g, b.name, cx, ty + 62, '#f4efe2', '#7a2a20');
  const dy = H - 34;
  R(g, cx - 12, dy, 24, 34, '#e8e0cc');
  g.fillStyle = '#e8e0cc'; g.beginPath(); g.arc(cx, dy, 12, Math.PI, 0); g.fill();
  R(g, cx - 10, dy, 20, 34, '#6a3e26'); g.fillStyle = '#6a3e26'; g.beginPath(); g.arc(cx, dy, 10, Math.PI, 0); g.fill();
  R(g, cx, dy - 9, 1, 43, '#3e2414'); R(g, cx - 4, dy + 16, 2, 2, '#e0b23a'); R(g, cx + 3, dy + 16, 2, 2, '#e0b23a');
  R(g, cx - 16, H - 3, 32, 3, '#c8c2b6');
}

function drawApartment(g, b, W, H, L) {
  const top = b.top;
  R(g, 0, top, W, 12, '#bdb7aa'); R(g, 3, top + 3, W - 6, 6, '#8a9a8e');
  text(g, '101', W - 30, top + 30, '#7a6a5a', 18);
  const fy = top + 12;
  R(g, 0, fy, W, H - fy, '#ece3d2');
  R(g, 0, fy, 6, H - fy, '#d8ccb6'); R(g, W - 6, fy, 6, H - fy, '#d8ccb6');
  text(g, b.name, 60, fy + 12, '#7a6a5a', 10);
  for (let r = 0; r < 7; r++) {
    const y = fy + 24 + r * 24;
    if (y + 20 > H - 20) break;
    for (let k = 0; k < 4; k++) {
      const x = 10 + k * 45;
      R(g, x, y, 38, 16, '#9ec3db'); R(g, x, y, 38, 2, '#c4dceb');
      R(g, x, y + 12, 38, 6, '#f4efe4'); R(g, x, y + 17, 38, 1, '#b8ae9c');
      if (hash2(r, k) > 0.6) R(g, x + 4 + ((hash2(k, r) * 20) | 0), y + 9, 6, 4, ['#f06a7a', '#f6d84a', '#6ab0e8'][k % 3]);
      if (hash2(k + 3, r) > 0.5) L.push({ x: x + 19, y: y + 8, r: 16, c: 'win' });
    }
  }
  R(g, 0, H - 20, W, 20, '#cfc6b4');
  R(g, W / 2 - 14, H - 18, 28, 18, '#4a5560'); R(g, W / 2 - 12, H - 16, 11, 16, '#88b4d0'); R(g, W / 2 + 1, H - 16, 11, 16, '#88b4d0');
  for (let x = 8; x < W - 8; x += 24) { R(g, x, H - 12, 12, 10, '#4f9d3c'); }
}

// ---------------------------------------------------------------------------
// Props & trees
// ---------------------------------------------------------------------------
function drawProp(p) {
  const w = p.w * TILE;
  let c, g, ox = 0, oy = 0, baseY = (p.y + p.h) * TILE;
  const lights = [];
  switch (p.kind) {
    case 'pavilion': {
      const h = 4 * TILE + 18; [c, g] = mkCanvas(w + 8, h); ox = -4; oy = -18;
      baseY = (p.y + 2) * TILE;
      for (const x of [8, w - 4]) R(g, x, 30, 4, 46, '#9a3b2a');
      g.fillStyle = '#4c535e';
      g.beginPath(); g.moveTo(0, 14); g.quadraticCurveTo(10, 20, 14, 6); g.lineTo(w - 6, 6); g.quadraticCurveTo(w - 2, 20, w + 8, 14);
      g.lineTo(w + 2, 36); g.lineTo(6, 36); g.closePath(); g.fill();
      for (let x = 10; x < w; x += 5) R(g, x, 12, 2, 22, '#5d6672');
      R(g, 14, 2, w - 20, 6, '#3a4048'); R(g, 14, 2, w - 20, 1, '#e8e4dc');
      R(g, 6, 34, w - 4, 4, '#2f6a4f'); for (let x = 8; x < w; x += 6) R(g, x, 35, 3, 2, '#e05a5a');
      outline(g, w + 8, h);
      break;
    }
    case 'fountain': {
      [c, g] = mkCanvas(64, 72); oy = -8;
      g.fillStyle = '#a8a296'; g.beginPath(); g.ellipse(32, 46, 31, 22, 0, 0, 7); g.fill();
      g.fillStyle = '#c9c4b8'; g.beginPath(); g.ellipse(32, 44, 30, 20, 0, 0, 7); g.fill();
      g.fillStyle = '#4a95c4'; g.beginPath(); g.ellipse(32, 44, 25, 15, 0, 0, 7); g.fill();
      g.fillStyle = '#6db2dc'; g.beginPath(); g.ellipse(28, 40, 12, 5, 0, 0, 7); g.fill();
      R(g, 28, 18, 8, 26, '#b8b2a6'); R(g, 28, 18, 2, 26, '#d0cbc0');
      g.fillStyle = '#c9c4b8'; g.beginPath(); g.ellipse(32, 20, 12, 5, 0, 0, 7); g.fill();
      g.fillStyle = '#9fd4f0'; for (const [dx, dy] of [[-6, -6], [0, -10], [6, -6], [-10, 0], [10, 0]]) { g.beginPath(); g.arc(32 + dx, 14 + dy, 2.5, 0, 7); g.fill(); }
      R(g, 31, 4, 2, 14, '#bfe6fa');
      outline(g, 64, 72); break;
    }
    case 'flag': [c, g] = mkCanvas(20, 56); oy = -40;
      R(g, 2, 2, 2, 54, '#9a9a96'); R(g, 4, 4, 15, 10, '#f8f8f4');
      g.fillStyle = '#d8342c'; g.beginPath(); g.arc(11.5, 9, 3, Math.PI, 0); g.fill();
      g.fillStyle = '#2a4aa8'; g.beginPath(); g.arc(11.5, 9, 3, 0, Math.PI); g.fill();
      R(g, 5, 5, 2, 1, '#222'); R(g, 16, 5, 2, 1, '#222'); R(g, 5, 12, 2, 1, '#222'); R(g, 16, 12, 2, 1, '#222');
      outline(g, 20, 56); break;
    case 'baduk': [c, g] = mkCanvas(16, 16); R(g, 2, 6, 12, 9, '#d8b46a'); R(g, 2, 13, 12, 2, '#a07a3a');
      for (let i = 4; i < 14; i += 3) { R(g, i, 6, 1, 7, '#6a4a2a'); R(g, 2, 6 + i - 3, 12, 1, '#6a4a2a'); }
      R(g, 5, 8, 2, 2, '#111'); R(g, 9, 10, 2, 2, '#f4f4f4'); R(g, 11, 7, 2, 2, '#111'); break;
    case 'gym1': case 'gym2': case 'gym3': {
      [c, g] = mkCanvas(16, 28); oy = -12; const col = { gym1: '#f2c12e', gym2: '#3fb58a', gym3: '#4f86e8' }[p.kind];
      if (p.kind === 'gym1') { R(g, 2, 4, 2, 24, col); R(g, 12, 4, 2, 24, col); R(g, 2, 4, 12, 2, col); g.fillStyle = '#e8574b'; g.beginPath(); g.ellipse(8, 22, 5, 2, 0, 0, 7); g.fill(); }
      if (p.kind === 'gym2') { R(g, 7, 6, 2, 22, col); R(g, 2, 8, 12, 3, col); R(g, 1, 20, 4, 2, '#555'); R(g, 11, 20, 4, 2, '#555'); }
      if (p.kind === 'gym3') { R(g, 3, 10, 2, 18, col); R(g, 11, 10, 2, 18, col); R(g, 3, 10, 10, 2, col); R(g, 5, 18, 6, 3, '#555'); R(g, 6, 2, 4, 8, col); }
      outline(g, 16, 28); break;
    }
    case 'slide': [c, g] = mkCanvas(32, 40); oy = -8;
      R(g, 2, 8, 3, 30, '#f2c12e'); R(g, 10, 8, 3, 30, '#f2c12e'); for (let y = 12; y < 36; y += 5) R(g, 2, y, 11, 2, '#f2c12e');
      R(g, 0, 6, 16, 4, '#4f86e8'); g.fillStyle = '#e8574b'; g.beginPath(); g.moveTo(14, 8); g.lineTo(20, 8); g.lineTo(32, 36); g.lineTo(24, 38); g.closePath(); g.fill();
      outline(g, 32, 40); break;
    case 'swing': [c, g] = mkCanvas(48, 32); oy = -16;
      R(g, 2, 2, 3, 30, '#4f86e8'); R(g, 43, 2, 3, 30, '#4f86e8'); R(g, 2, 2, 44, 3, '#4f86e8');
      for (const x of [12, 30]) { R(g, x, 5, 1, 16, '#888'); R(g, x + 6, 5, 1, 16, '#888'); R(g, x - 1, 21, 9, 3, '#e8574b'); }
      outline(g, 48, 32); break;
    case 'stall': [c, g] = mkCanvas(48, 44); oy = -12;
      R(g, 2, 8, 44, 34, '#e86a2a'); R(g, 0, 4, 48, 8, '#f08a3a'); for (let x = 0; x < 48; x += 6) R(g, x, 4, 3, 8, '#ff9f4a');
      R(g, 6, 24, 36, 12, '#c9c2b4'); R(g, 6, 22, 36, 3, '#8a8a86');
      for (let x = 9; x < 40; x += 7) { g.fillStyle = '#c8873a'; g.beginPath(); g.ellipse(x + 2, 29, 3, 2, 0, 0, 7); g.fill(); }
      R(g, 8, 13, 32, 8, '#fff6e0'); text(g, '붕어빵', 24, 17, '#c94b3c', 8);
      outline(g, 48, 44); lights.push({ x: p.x * TILE + 24, y: p.y * TILE + 4, r: 30, c: 'shop', col: '#ffb070' }); break;
    case 'board': [c, g] = mkCanvas(32, 30); oy = -14;
      R(g, 4, 14, 3, 16, '#7a4a2a'); R(g, 25, 14, 3, 16, '#7a4a2a'); R(g, 1, 2, 30, 18, '#8a5a34'); R(g, 3, 4, 26, 14, '#d8b884');
      R(g, 5, 5, 8, 6, '#f4f4f0'); R(g, 15, 6, 7, 9, '#f6d84a'); R(g, 23, 5, 5, 5, '#f39bc0'); R(g, 6, 12, 7, 5, '#a8d4f0');
      outline(g, 32, 30); break;
    case 'busstop': [c, g] = mkCanvas(48, 40); oy = -24;
      R(g, 2, 4, 44, 4, '#3a6ab8'); R(g, 4, 8, 2, 32, '#7a7a7a'); R(g, 42, 8, 2, 32, '#7a7a7a');
      R(g, 6, 8, 36, 26, 'rgba(170,210,235,0.55)'); R(g, 8, 28, 24, 4, '#8a6a4a');
      R(g, 34, 12, 6, 14, '#f4f4f0'); R(g, 35, 13, 4, 2, '#2fae6a'); R(g, 35, 16, 4, 1, '#333'); R(g, 35, 18, 4, 1, '#333');
      text(g, '범키키 정류장', 24, 6, '#ffffff', 6);
      outline(g, 48, 40); break;
    case 'vending': [c, g] = mkCanvas(16, 30); oy = -14;
      R(g, 1, 2, 14, 28, '#d8443a'); R(g, 3, 4, 10, 12, '#e8f0f4'); for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) R(g, 4 + j * 5, 5 + i * 4, 3, 3, ['#4f86e8', '#f6d84a', '#3fb58a'][i]);
      R(g, 3, 20, 10, 4, '#2a2a2a'); R(g, 11, 17, 2, 2, '#f6d84a');
      outline(g, 16, 30); lights.push({ x: p.x * TILE + 8, y: p.y * TILE - 4, r: 16, c: 'shop24', col: '#e8f6ff' }); break;
    case 'goal': [c, g] = mkCanvas(16, 40); oy = -8;
      R(g, p.flip ? 2 : 12, 4, 2, 36, '#f4f4f4'); R(g, 2, 4, 12, 2, '#f4f4f4');
      for (let y = 6; y < 40; y += 3) R(g, p.flip ? 4 : 2, y, 10, 1, 'rgba(240,240,240,0.5)');
      for (let x = 2; x < 14; x += 3) R(g, x, 6, 1, 34, 'rgba(240,240,240,0.5)');
      break;
    case 'parasol': { [c, g] = mkCanvas(28, 30); ox = -6; oy = -14; const col = p.color || '#e05a5a';
      R(g, 13, 10, 2, 18, '#7a7a7a'); R(g, 6, 22, 16, 3, '#f4f4f0'); R(g, 7, 25, 2, 5, '#9a9a9a'); R(g, 19, 25, 2, 5, '#9a9a9a');
      g.fillStyle = col; g.beginPath(); g.moveTo(0, 12); g.quadraticCurveTo(14, -4, 28, 12); g.closePath(); g.fill();
      R(g, 0, 11, 28, 2, shadeHex(col.startsWith('#') ? col : '#e05a5a', 0.75));
      outline(g, 28, 30); break; }
    case 'bench': [c, g] = mkCanvas(24, 16); ox = -4; oy = -2;
      R(g, 2, 4, 20, 3, '#9a6a3c'); R(g, 2, 8, 20, 3, '#b07a46'); R(g, 3, 11, 2, 4, '#555'); R(g, 19, 11, 2, 4, '#555');
      outline(g, 24, 16); baseY = p.y * TILE + 8; break;
    case 'planter': [c, g] = mkCanvas(16, 20); oy = -4;
      R(g, 2, 10, 12, 10, '#a2683e'); R(g, 2, 10, 12, 2, '#c4844f'); g.fillStyle = '#4f9d3c'; g.beginPath(); g.arc(8, 8, 7, 0, 7); g.fill();
      R(g, 5, 5, 2, 2, '#f39bc0'); R(g, 10, 7, 2, 2, '#f6d84a'); outline(g, 16, 20); break;
    case 'scarecrow': [c, g] = mkCanvas(16, 32); oy = -16;
      R(g, 7, 8, 2, 24, '#7a4a2a'); R(g, 1, 14, 14, 2, '#7a4a2a'); R(g, 3, 14, 10, 10, '#4f86e8');
      g.fillStyle = '#f2d9a0'; g.beginPath(); g.arc(8, 8, 5, 0, 7); g.fill(); R(g, 2, 2, 12, 3, '#d8a83a'); R(g, 4, 0, 8, 3, '#d8a83a');
      R(g, 6, 8, 1, 1, '#333'); R(g, 9, 8, 1, 1, '#333'); outline(g, 16, 32); break;
    default: return null;
  }
  return { canvas: c, x: p.x * TILE + ox, y: p.y * TILE + oy, baseY, lights };
}

const TREE_CACHE = {};
function treeSprite(kind, v) {
  const key = kind + v;
  if (TREE_CACHE[key]) return TREE_CACHE[key];
  const [c, g] = mkCanvas(44, 56);
  const pal = {
    oak: ['#3f8a35', '#4f9f3f', '#69b84f'], cherry: ['#e48aa8', '#f2a8c0', '#fbd0dc'],
    ginkgo: ['#5f9a2f', '#7ab43c', '#9ccc52'], pine: ['#2f6a3a', '#3b7d44', '#4f9455'],
  }[kind];
  g.fillStyle = 'rgba(0,0,0,0.22)'; g.beginPath(); g.ellipse(22, 52, 13, 4, 0, 0, 7); g.fill();
  R(g, 19, 32, 6, 20, '#7a4e2e'); R(g, 19, 32, 2, 20, '#8f6038');
  const rnd = mulberry32(v * 97 + kind.length);
  if (kind === 'pine') {
    for (let i = 0; i < 4; i++) {
      const y = 4 + i * 9, hw = 6 + i * 4;
      g.fillStyle = pal[0]; g.beginPath(); g.moveTo(22, y - 2); g.lineTo(22 + hw, y + 12); g.lineTo(22 - hw, y + 12); g.closePath(); g.fill();
      g.fillStyle = pal[1]; g.beginPath(); g.moveTo(22, y); g.lineTo(22 + hw - 3, y + 10); g.lineTo(22 - hw + 1, y + 10); g.closePath(); g.fill();
    }
  } else {
    const blobs = kind === 'ginkgo' ? [[22, 14, 10], [22, 26, 12], [16, 22, 8], [28, 22, 8]] : [[22, 22, 15], [12, 26, 10], [32, 26, 10], [18, 13, 10], [28, 14, 10]];
    for (const [x, y, r] of blobs) { g.fillStyle = pal[0]; g.beginPath(); g.arc(x, y + 2, r, 0, 7); g.fill(); }
    for (const [x, y, r] of blobs) { g.fillStyle = pal[1]; g.beginPath(); g.arc(x - 1, y, r - 2, 0, 7); g.fill(); }
    for (let i = 0; i < 14; i++) {
      const [bx, by, br] = blobs[(rnd() * blobs.length) | 0];
      R(g, (bx - br / 2 + rnd() * br) | 0, (by - br / 2 + rnd() * br * 0.6) | 0, 3, 2, pal[2]);
    }
    if (kind === 'cherry') for (let i = 0; i < 6; i++) R(g, (6 + rnd() * 32) | 0, (6 + rnd() * 28) | 0, 2, 2, '#ffffff');
    if (kind === 'oak' && rnd() > 0.5) for (let i = 0; i < 3; i++) R(g, (10 + rnd() * 24) | 0, (12 + rnd() * 16) | 0, 2, 2, '#e8574b');
  }
  outline(g, 44, 56);
  TREE_CACHE[key] = c;
  return c;
}

function placeTrees() {
  const W = World, objs = [];
  const occupied = new Uint8Array(MW * MH);
  const add = (x, y, kind) => {
    W.block[y * MW + x] = 1; occupied[y * MW + x] = 1;
    objs.push({ canvas: treeSprite(kind, (hash2(x, y) * 4) | 0), x: x * TILE + 8 - 22, y: (y + 1) * TILE - 54, baseY: (y + 1) * TILE - 2, kind: 'tree' });
  };
  for (const [x, y, k] of PARK_TREES) add(x, y, k);
  // street ginkgo trees on outer sidewalk edge of the main road
  for (let x = 2; x < MW; x += 7) {
    for (const y of [36]) if (W.t(x, y) === T.GRASS && !W.isBlocked(x, y)) add(x, y, 'ginkgo');
  }
  const clearOf = (x, y) => {
    for (let dy = -2; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const t = W.t(x + dx, y + dy);
      if (t !== T.GRASS || W.isBlocked(x + dx, y + dy)) return false;
    }
    for (const b of BUILDINGS) if (x >= b.x - 2 && x <= b.x + b.w + 1 && y >= b.y - 1 && y <= b.y + b.h + 2) return false;
    return true;
  };
  for (let y = 1; y < MH; y++) for (let x = 0; x < MW; x++) {
    const edge = Math.min(x, MW - 1 - x, y, MH - 1 - y);
    let p = 0.05;
    if (y <= 4) p = 0.6; else if (edge <= 2) p = 0.35; else if (y >= 62) p = 0.12;
    if (hash2(x, y, 99) > p) continue;
    if (!clearOf(x, y)) continue;
    let near = false;
    for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -2; dx <= 2; dx++) if (occupied[(y + dy) * MW + x + dx]) { near = true; break; }
    if (near) continue;
    const r = hash2(x, y, 5);
    add(x, y, y <= 4 ? (r > 0.5 ? 'pine' : 'oak') : r > 0.75 ? 'pine' : r > 0.6 ? 'cherry' : 'oak');
  }
  return objs;
}

function lampSprite() {
  const [c, g] = mkCanvas(12, 48);
  R(g, 5, 8, 2, 40, '#5a5e66'); R(g, 3, 44, 6, 4, '#4a4e56');
  R(g, 1, 4, 10, 5, '#5a5e66'); R(g, 2, 8, 8, 2, '#fff2c0');
  outline(g, 12, 48);
  return c;
}
function poleSprite() {
  const [c, g] = mkCanvas(24, 72);
  R(g, 10, 4, 4, 68, '#8f8a80'); R(g, 11, 4, 1, 68, '#a8a398');
  R(g, 2, 8, 20, 3, '#6a665e'); R(g, 4, 6, 2, 2, '#ddd'); R(g, 18, 6, 2, 2, '#ddd');
  R(g, 14, 18, 7, 10, '#7a7a76'); R(g, 15, 19, 5, 2, '#9a9a96');
  R(g, 9, 40, 6, 8, '#f6d84a'); // poster
  outline(g, 24, 72);
  return c;
}

function buildObjects() {
  const W = World;
  W.objects = []; W.lights = []; W.poleTops = [];
  for (const b of BUILDINGS) {
    const { canvas, lights } = drawBuilding(b);
    const ox = b.x * TILE, oy = b.y * TILE - b.top;
    W.objects.push({ canvas, x: ox, y: oy, baseY: (b.y + b.h) * TILE, building: b });
    b.sprite = { x: ox, y: oy, w: canvas.width, h: canvas.height };
    for (const l of lights) W.lights.push({ ...l, x: ox + l.x, y: oy + l.y, building: b.id });
  }
  for (const p of PROPS) {
    const o = drawProp(p);
    if (!o) continue;
    W.objects.push(o);
    for (const l of o.lights) W.lights.push(l);
  }
  const lamp = lampSprite();
  for (const [x, y] of LAMPS) {
    if (W.isBlocked(x, y)) continue;
    W.objects.push({ canvas: lamp, x: x * TILE + 2, y: (y + 1) * TILE - 48, baseY: (y + 1) * TILE - 1 });
    W.lights.push({ x: x * TILE + 8, y: (y + 1) * TILE - 40, r: 40, c: 'lamp' });
  }
  const pole = poleSprite();
  for (const x of POLES) {
    const y = 27;
    if (W.isBlocked(x, y)) continue;
    W.objects.push({ canvas: pole, x: x * TILE - 4, y: (y + 1) * TILE - 72, baseY: (y + 1) * TILE - 1 });
    W.poleTops.push([x * TILE + 8, (y + 1) * TILE - 63]);
  }
  for (const o of placeTrees()) W.objects.push(o);
}
