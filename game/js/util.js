// Shared helpers: seeded RNG, binary heap, A* pathfinding.
const TILE = 16;

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// deterministic per-tile hash in [0,1)
function hash2(x, y, s = 0) {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const rand = Math.random;
const randInt = (a, b) => a + Math.floor(rand() * (b - a + 1));
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function weightedPick(weights) {
  const entries = Object.entries(weights);
  let total = 0;
  for (const [, w] of entries) total += w;
  let r = rand() * total;
  for (const [k, w] of entries) { r -= w; if (r <= 0) return k; }
  return entries[entries.length - 1][0];
}

class MinHeap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  push(node, pri) {
    const a = this.a; a.push([pri, node]);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p][0] <= a[i][0]) break;
      [a[p], a[i]] = [a[i], a[p]]; i = p;
    }
  }
  pop() {
    const a = this.a; const top = a[0]; const last = a.pop();
    if (a.length) {
      a[0] = last; let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1; let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]]; i = m;
      }
    }
    return top[1];
  }
}

const DIR4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// Generic grid search. costFn(x,y) -> step cost or Infinity.
// isGoal(x,y) -> bool. heuristic(x,y) -> estimate.
function gridSearch(W, H, sx, sy, costFn, isGoal, heuristic) {
  const N = W * H;
  const g = new Float32Array(N).fill(Infinity);
  const came = new Int32Array(N).fill(-1);
  const closed = new Uint8Array(N);
  const heap = new MinHeap();
  const s = sy * W + sx;
  g[s] = 0; heap.push(s, heuristic(sx, sy));
  while (heap.size) {
    const cur = heap.pop();
    if (closed[cur]) continue;
    closed[cur] = 1;
    const cx = cur % W, cy = (cur / W) | 0;
    if (cur !== s && isGoal(cx, cy)) {
      const path = [];
      for (let n = cur; n !== -1; n = came[n]) path.push([n % W, (n / W) | 0]);
      return path.reverse();
    }
    for (const [dx, dy] of DIR4) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const ni = ny * W + nx;
      if (closed[ni]) continue;
      const c = costFn(nx, ny);
      if (c === Infinity) continue;
      const ng = g[cur] + c;
      if (ng < g[ni]) { g[ni] = ng; came[ni] = cur; heap.push(ni, ng + heuristic(nx, ny)); }
    }
  }
  return null;
}

// Korean particle helper: josa('한서윤', '이/가') -> '한서윤이'. First form = after a final consonant.
function hasBatchim(word) {
  for (let i = word.length - 1; i >= 0; i--) {
    const ch = word[i], code = ch.charCodeAt(0);
    if (code >= 0xac00 && code <= 0xd7a3) return (code - 0xac00) % 28 !== 0;
    if (/[0-9]/.test(ch)) return '013678'.includes(ch);
    if (/[a-zA-Z]/.test(ch)) return 'lmnr'.includes(ch.toLowerCase());
  }
  return false;
}
function josa(word, pair) {
  const [withB, withoutB] = pair.split('/');
  return word + (hasBatchim(word) ? withB : withoutB);
}
