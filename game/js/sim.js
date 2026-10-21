// 팔팔마을 simulation: clock, routines, chats, relationships/romance, scripted kidnap, random events, save.
const SAVE_KEY = 'palpal-save-v3';

const Sim = {
  minute: START_MINUTE,
  speed: 1,
  agents: [],
  byId: {},
  townLog: [],
  events: [],        // today's random events {uid, kind, title, emoji, start, end, gather}
  activeEvent: null, // current gathering event
  weather: null,     // 'rain' | null
  dayVars: {},
  dates: [],         // pending dates {a, b, at}
  status: {},        // "idA|idB" -> '썸' | '연인'
  kid: null,         // kidnap scenario state
  spotUse: new Map(),
  aiPairT: {},       // last indoor AI conversation per pair
  onToast: null,
  day: 0,
};

const dayOf = (m) => Math.floor(m / 1440) + 1;
const hourOf = (m) => (m % 1440) / 60;
const weekdayOf = (m) => (dayOf(m) - 1) % 7;
const isWeekend = (m) => weekdayOf(m) >= 5;
function clockStr(m) {
  const mm = Math.floor(m % 1440), h = Math.floor(mm / 60), mi = mm % 60;
  return `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`;
}
function dateStr(m) {
  const d = dayOf(m) - 1;
  return `${SEASONS[Math.floor(d / 28) % 4]} ${(d % 28) + 1}일 (${WEEKDAYS[d % 7]})`;
}
function isOpen(id, m = Sim.minute) {
  if (Sim.fires && (Sim.fires[id] || 0) > m) return false;
  const f = OPEN_HOURS[id];
  return f ? f(weekdayOf(m), hourOf(m)) : true;
}
const relKey = (a, b) => [a.id, b.id].sort().join('|');
const adult = (a) => !a.def.minor;

function logTown(text, who = null, big = false) {
  Sim.townLog.unshift({ t: Sim.minute, text, who });
  if (Sim.townLog.length > 150) Sim.townLog.pop();
  if (big && Sim.onToast) Sim.onToast(text);
}

// ---------------------------------------------------------------------------
// Routine blocks
// ---------------------------------------------------------------------------
function dayMatch(d, wd) {
  switch (d) {
    case 'weekday': return wd <= 4;
    case 'weekend': return wd >= 5;
    case 'mon': return wd === 0;
    case 'notMon': return wd !== 0;
    default: return true;
  }
}
const resolveHour = (v) => (typeof v === 'string' ? Sim.dayVars[v] : v);
function currentBlock(def, m = Sim.minute) {
  const wd = weekdayOf(m), h = hourOf(m);
  const plan = Sim.aiPlans && Sim.aiPlans[dayOf(m)] && Sim.aiPlans[dayOf(m)][def.id];
  for (const b of plan || def.routine) {
    if (!dayMatch(b.d, wd)) continue;
    if (b.if && !Sim.dayVars[b.if]) continue;
    if (b.ifNot && Sim.dayVars[b.ifNot]) continue;
    const f = resolveHour(b.f), t = resolveHour(b.t);
    if (h >= f && h < t) return b;
  }
  return null;
}
const blockEnd = (b) => (dayOf(Sim.minute) - 1) * 1440 + resolveHour(b.t) * 60;

// ---------------------------------------------------------------------------
// Agent
// ---------------------------------------------------------------------------
class Agent {
  constructor(def) {
    this.def = def; this.id = def.id;
    this.xp = {};
    for (const k of Object.keys(SKILLS)) this.xp[k] = xpForStartLevel(def.skills[k] || 1);
    this.energy = 80; this.mood = 65;
    this.rel = {}; this.stats = {}; this.diary = [];
    this.home = World.buildings[def.home];
    this.tx = this.home.door.x; this.ty = this.home.door.y;
    this.px = this.tx * TILE + 8; this.py = this.ty * TILE + 8;
    this.path = []; this.dir = 'down'; this.walkPhase = 0;
    this.act = null; this.inside = this.home; this.state = 'idle';
    this.chat = null; this.chatCooldown = 0; this.bubble = null;
    this.spotKey = null; this.dest = null; this.attended = new Set();
    this.mem = []; this.knownPw = new Set([this.home.id]); this.errandDone = null;
  }
  level(k) { return levelFromXp(this.xp[k]).level; }
  totalLevel() { return Object.keys(SKILLS).reduce((s, k) => s + this.level(k), 0); }
  note(text) { this.diary.unshift({ t: Sim.minute, text }); if (this.diary.length > 30) this.diary.pop(); }
  say(text, secs = 2.6) { this.bubble = { text, until: performance.now() + secs * 1000 / Math.max(1, Math.sqrt(Sim.speed)) }; }
  stat(k, n = 1) { this.stats[k] = (this.stats[k] || 0) + n; }
  get scripted() { return !!(this.act && this.act.def.sticky); }
  get busy() { return !!(this.act && (this.act.def.busy || this.act.def.sticky)); }
  awake() { return !!currentBlock(this.def); }

  statusText() {
    if (this.chat) return `💬 ${josa(this.chat.other.def.short, '과/와')} 대화 중`;
    if (!this.act) return '🤔 고민 중';
    const a = this.act.def;
    if (this.state === 'walking' && !['kidnapped', 'arrested', 'run', 'evening_run', 'patrol', 'search', 'rescue', 'escort', 'kidnap_home', 'kidnap_hunt', 'arrest_go', 'community_service', 'defend', 'evacuate', 'firefight'].includes(this.act.key))
      return `🚶 ${a.label} 하러 가는 중`;
    if (this.act.key === 'date' && this.act.partner) return `💕 ${josa(this.act.partner.def.short, '과/와')} 데이트 중`;
    if (this.act.key === 'promise_meet' && this.act.partner) return `🤝 ${josa(this.act.partner.def.short, '과/와')} 약속 지키는 중`;
    return `${a.emoji} ${a.label}`;
  }

  addXp(skill, amount) {
    const before = this.level(skill);
    this.xp[skill] += amount;
    const after = this.level(skill);
    if (after > before) {
      const s = SKILLS[skill];
      logTown(`${this.def.name}의 ${s.emoji}${josa(s.name, '이/가')} ${josa('Lv.' + after, '이/가')} 되었다!`, this.id, after >= 6);
      this.note(`${s.name} Lv.${after} 달성`);
      this.say(`${s.emoji} Lv.${after}!`, 3);
    }
  }

  // ---- activity selection ----
  chooseActivity() {
    const block = currentBlock(this.def);
    if (!block) return this.startActivity('sleep', { until: this.nextWake() });
    if (!this.busyBlock(block)) {
      const ev = Sim.activeEvent;
      if (ev && !this.attended.has(ev.uid) && rand() < 0.75) { this.attended.add(ev.uid); return this.startActivity('event'); }
    }
    if (block.a) {
      // an errand block runs once a day; if it is already done, rest until the next block
      if (ACTIVITIES[block.a].errand && this.errandDone === this.blockKey(block)) return this.startActivity('home_relax', { block, cap: blockEnd(block) });
      return this.startActivity(block.a, { until: blockEnd(block), block });
    }
    if (lawFreeTime(this)) { if (this.act) this.act.block = block; return; }
    const weights = memBoost(this, block.p);
    let key = weightedPick(weights);
    if (key === this.lastAct && Object.keys(weights).length > 1 && rand() < 0.5) key = weightedPick(weights);
    this.startActivity(key, { block, cap: blockEnd(block) });
  }
  busyBlock(block) { return !!(block.a && ACTIVITIES[block.a].busy); }
  blockKey(block) { return `${dayOf(Sim.minute)}:${this.def.routine.indexOf(block)}`; }

  nextWake() {
    for (let m = Sim.minute + 10; m < Sim.minute + 1440; m += 10) if (currentBlock(this.def, m)) return m;
    return Sim.minute + 480;
  }

  startActivity(key, opts = {}) {
    let def = ACTIVITIES[key];
    // closed place -> fallback
    if (def.loc && OPEN_HOURS[def.loc] && !isOpen(def.loc) && !def.sticky) {
      key = def.alt || 'plaza_walk'; def = ACTIVITIES[key];
    }
    // rain: skip outdoor leisure
    if (def.loc === 'river' && Sim.flood > Sim.minute && !def.sticky) { key = 'plaza_walk'; def = ACTIVITIES[key]; }
    if (def.inside && !def.sticky && def.loc === 'home' && burning(this.home.id)) { key = 'plaza_walk'; def = ACTIVITIES[key]; }
    if ((Sim.weather === 'rain' || Sim.weather === 'storm') && !def.busy && !def.inside && key !== 'event') {
      key = pick(['home_relax', 'store_shop', isOpen('cafe') ? 'cafe_visit' : 'home_relax']); def = ACTIVITIES[key];
    }
    this.releaseSpot();
    let remaining = def.dur ? randInt(def.dur[0], def.dur[1]) : Infinity;
    if (opts.until && !def.errand) remaining = Math.max(1, opts.until - Sim.minute);
    if (opts.cap && !def.errand) remaining = Math.min(remaining, Math.max(1, opts.cap - Sim.minute));
    this.act = { key, def, remaining, route: def.route ? def.route.slice() : null, block: opts.block || null, roamT: 0, partner: opts.partner || null, counted: false };
    this.lastAct = key;
    if (opts.noMove) { this.state = 'doing'; return; }
    if (!this.planTarget(opts.target)) {
      this.act = null; this.state = 'idle'; this._fail = (this._fail || 0) + 1;
      if (key !== 'home_relax' && this._fail < 3) this.startActivity('home_relax', { block: opts.block, cap: opts.cap || opts.until });
    }
  }

  planTarget(forced) {
    const a = this.act, def = a.def;
    let locName = def.loc;
    if (a.route) {
      if (!a.route.length) { this.act = null; return true; }
      locName = a.route.shift();
    }
    let target = forced || null, inside = null, face = null;
    if (!target) {
      if (locName === 'home') { inside = this.home; target = this.home.door; }
      else if (locName === 'friend') {
        const friends = Sim.agents.filter((o) => o !== this && o.inside === o.home && o.home.owner && o.act && !o.busy)
          .sort((p, q) => (this.rel[q.id] || 0) - (this.rel[p.id] || 0));
        if (!friends.length) return false;
        a.friend = friends[0]; inside = a.friend.home; target = inside.door;
      } else if (locName === 'event') {
        const ev = Sim.activeEvent; if (!ev) return false;
        const c = World.spots.event_centers[ev.center];
        target = randomNear(c, 4); face = 'center'; a.eventCenter = c;
      } else if (World.buildings[locName]) {
        inside = World.buildings[locName]; target = inside.door;
      } else if (locName) {
        const list = World.spots[locName];
        if (!list || !list.length) return false;
        const free = list.filter((s) => !Sim.spotUse.has(`${s.x},${s.y}`));
        const s = pick(free.length ? free : list);
        target = s; face = s.face || null;
        if (!def.roam && !a.route && ['bench', 'fountain', 'stage', 'stall', 'river', 'school_front'].includes(locName)) {
          this.spotKey = `${s.x},${s.y}`; Sim.spotUse.set(this.spotKey, this.id);
        }
        a.roamArea = def.roam ? locName : null;
      } else return true; // scripted activity without a place
    } else if (forced.inside) { inside = forced.inside; target = forced.inside.door; }
    a.inside = inside; a.face = face;
    this.inside = null;
    return this.walkTo(target.x, target.y);
  }

  walkTo(x, y) {
    if (!World.walkable(x, y)) { const n = randomNear({ x, y }, 2); x = n.x; y = n.y; }
    this.dest = { x, y };
    if (this.inside) this.inside = null;
    if (x === this.tx && y === this.ty) { this.path = []; this.arrive(); return true; }
    const path = gridSearch(MW, MH, this.tx, this.ty, (cx, cy) => World.walkCost(cx, cy),
      (cx, cy) => cx === x && cy === y, (cx, cy) => Math.abs(cx - x) + Math.abs(cy - y));
    if (!path) return false;
    path.shift();
    this.path = path; this.state = 'walking';
    return true;
  }

  releaseSpot() { if (this.spotKey) { Sim.spotUse.delete(this.spotKey); this.spotKey = null; } }

  arrive() {
    const a = this.act;
    this.state = 'doing';
    if (!a) return;
    if (a.inside) { this.inside = a.inside; if (a.friend) this.visitStart(a.friend); if (a.inside === this.home) lawOwnerHome(this); }
    if (a.face === 'center' && a.eventCenter) this.dir = faceToward(this, a.eventCenter.x, a.eventCenter.y);
    else if (a.face) this.dir = a.face;
    if (a.partner && !a.inside) this.dir = faceToward(this, a.partner.tx, a.partner.ty);
    if (!a.counted) {
      a.counted = true;
      if (a.def.stat) this.stat(a.def.stat);
      if (a.key === 'school_class' && hourOf(Sim.minute) > 9 && hourOf(Sim.minute) < 12) {
        this.stat('late');
        logTown(`⏰ ${josa(this.def.name, '이/가')} 또 지각했다! (${clockStr(Sim.minute)} 도착)`, this.id, true);
        this.note('지각…'); this.mood = clamp(this.mood - 8, 0, 100);
      }
      if (a.key === 'beer' && rand() < 0.3) this.say('…크으. 🍺');
      lawOnArrive(this);
      memOnArrive(this);
      if (a.key === 'go_home_shut') {
        this.act = null;
        this.startActivity('shut_in', { until: (dayOf(Sim.minute)) * 1440, noMove: true });
        this.inside = this.home;
        this.note('오늘은 집 밖에 안 나감');
      }
    }
  }

  visitStart(friend) {
    logTown(`${josa(this.def.name, '이/가')} ${friend.def.name}네 집에 놀러 갔다`, this.id);
    this.note(`${friend.def.short}네 집 방문`); friend.note(`${josa(this.def.short, '이/가')} 놀러 옴`);
    changeRel(this, friend, 4 + this.level('social') * 0.6);
  }

  // ---- per-tick update ----
  update(dt) {
    const sleeping = this.act && (this.act.key === 'sleep' || this.act.key === 'oversleep') && this.inside;
    if (!sleeping) this.energy -= 0.06 * dt;
    this.mood += (60 - this.mood) * 0.002 * dt;
    if (this.chatCooldown > 0) this.chatCooldown -= dt;

    if (this.chat) { this.updateChat(dt); return; }
    if (!this.act) { if (this._fail > 5 && rand() < 0.95) return; this.chooseActivity(); return; }
    this._fail = 0;

    // routine block changed -> follow the new block (scripted activities are exempt)
    if (!this.scripted && !this.act.def.errand) {
      const blk = currentBlock(this.def);
      if (this.act.key === 'sleep' ? !!blk : blk !== this.act.block) { this.endAct(); this.chooseActivity(); return; }
    }

    if (this.state === 'walking') { this.move(dt); return; }
    if (this.act.def.follower) return;

    const def = this.act.def;
    const moodMul = 0.6 + this.mood / 100 * 0.8;
    if (def.xp) for (const [k, v] of Object.entries(def.xp)) this.addXp(k, v * dt * moodMul * (this.def.talent[k] || 1));
    if (def.energy) this.energy += def.energy * dt;
    if (def.mood) this.mood += def.mood * dt;
    this.energy = clamp(this.energy, 0, 100); this.mood = clamp(this.mood, 0, 100);

    const k = this.act.key;
    if (k === 'event') {
      if (!Sim.activeEvent) { this.endAct(); return; }
      if (rand() < 0.02 * dt) this.say(pick(Sim.activeEvent.cheers));
    }
    if (k === 'date' && rand() < 0.02 * dt) this.say(pick(['❤️', '💕', 'ㅎㅎ', '😊']), 1.6);
    if (k === 'meetup' && this.state === 'doing' && rand() < 0.04 * dt) this.say(this.act.partner && (this.rel[this.act.partner.id] || 0) >= 40 && this.def.closeLines ? pick(this.def.closeLines) : pick(this.def.lines), 2.2);
    if (k === 'school_scan' && rand() < 0.015 * dt) this.say(pick(['흐음… 👀', '(메모 메모)', '허허, 활기차구먼']), 1.8);
    if (k === 'search' && rand() < 0.02 * dt) this.say(pick(['범인 어딨지?!', '여긴가…?', '아 여기 아닌가 😅']), 1.8);

    if (this.act.roamArea) {
      this.act.roamT -= dt;
      if (this.act.roamT <= 0) { this.act.roamT = randInt(4, 10); const s = pick(World.spots[this.act.roamArea]); this.walkTo(s.x, s.y); }
    }
    if (this.act.route) {
      if (!this.act.route.length) { this.endAct(); return; }
      this.planTarget(); return;
    }
    this.act.remaining -= dt;
    if (this.act.remaining <= 0) this.endAct();
  }

  endAct() {
    if (!this.act) return;
    if (this.act.key === 'meetup') endMeetup(this);
    if (this.act.key === 'commute') this.onReturnFromWork();
    if (this.act.def.errand && this.act.block) this.errandDone = this.blockKey(this.act.block);
    if (this.act.key === 'jailed') { logTown(`🔓 ${josa(this.def.name, '이/가')} 하루 만에 유치장에서 풀려났다`, this.id, true); this.note('유치장에서 풀려남'); }
    this.releaseSpot();
    this.act = null; this.state = 'idle';
  }

  onReturnFromWork() {
    if (Sim.dayVars.seunghwaOvertime) { this.stat('overtime'); logTown(`😩 ${josa(this.def.name, '이/가')} 야근하고 ${clockStr(Sim.minute)}에야 돌아왔다`, this.id); this.mood = clamp(this.mood - 10, 0, 100); }
  }

  move(dt) {
    let steps = WALK_TILES_PER_MIN * dt * TILE;
    while (steps > 0 && this.path.length) {
      const [nx, ny] = this.path[0];
      const gx = nx * TILE + 8, gy = ny * TILE + 8;
      const dx = gx - this.px, dy = gy - this.py, d = Math.abs(dx) + Math.abs(dy);
      if (Math.abs(dx) > Math.abs(dy)) this.dir = dx > 0 ? 'right' : 'left';
      else if (d > 0) this.dir = dy > 0 ? 'down' : 'up';
      if (d <= steps) { this.px = gx; this.py = gy; this.tx = nx; this.ty = ny; this.path.shift(); steps -= d; }
      else {
        const sx = Math.sign(dx) * Math.min(Math.abs(dx), steps); this.px += sx;
        this.py += Math.sign(dy) * Math.min(Math.abs(dy), Math.max(0, steps - Math.abs(sx))); steps = 0;
      }
      this.walkPhase += 0.12;
    }
    if (!this.path.length) this.arrive();
  }

  // scripted control
  script(key, opts = {}) {
    breakChat(this); this.releaseSpot();
    this.act = { key, def: ACTIVITIES[key], remaining: opts.until ? opts.until - Sim.minute : (opts.dur || Infinity), route: null, block: null, roamT: 0, counted: false, partner: opts.partner || null };
    if (opts.inside) { this.inside = opts.inside; this.state = 'doing'; this.path = []; return; }
    if (opts.target) { this.inside = null; this.act.inside = opts.enter || null; this.walkTo(opts.target.x, opts.target.y); return; }
    if (this.act.def.loc) this.planTarget();
    else this.state = 'doing';
  }

  // ---- chat ----
  startChat(other, starter) {
    this.chat = { other, starter, t: 0, idx: 0 };
    this.state = 'chatting';
    this.dir = faceToward(this, other.tx, other.ty);
  }
  updateChat(dt) {
    const c = this.chat;
    c.t += dt;
    if (!c.starter) return;
    if (c.ai === 'pending' && c.idx >= c.script.length) {
      // greetings are done; wait (a little) for Claude to write the rest
      if (performance.now() - c.aiStart > AI_CONFIG.waitMs) { c.script = c.fallback.script; c.after = c.fallback.after; c.ai = 'timeout'; c.t = c.idx * 2.2; }
      else {
        c.t = Math.min(c.t, c.idx * 2.2);
        if (!c.waitBubble) { c.waitBubble = true; c.other.say('…🤔', 4); }
        return;
      }
    }
    while (c.idx < c.script.length && c.t >= c.idx * 2.2) { const [who, line] = c.script[c.idx]; who.say(line); c.idx++; }
    if (c.t >= c.script.length * 2.2 + 1) endChat(this, c.other);
  }
}

function breakChat(a) {
  if (!a.chat) return;
  const o = a.chat.other;
  a.chat = null;
  if (o.chat && o.chat.other === a) {
    o.chat = null; o.chatCooldown = 30; o.state = 'idle';
    if (o.act && o.dest && (o.dest.x !== o.tx || o.dest.y !== o.ty)) o.walkTo(o.dest.x, o.dest.y); else if (o.act) o.state = 'doing';
  }
}

function faceToward(a, x, y) {
  const dx = x - a.tx, dy = y - a.ty;
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'right' : 'left';
  return dy >= 0 ? 'down' : 'up';
}
function randomNear(c, r) {
  for (let i = 0; i < 40; i++) {
    const x = c.x + randInt(-r, r), y = c.y + randInt(-r, r);
    if (World.walkable(x, y) && World.t(x, y) !== T.ASPHALT) return { x, y };
  }
  return { x: c.x, y: c.y };
}
const tileDist = (a, b) => Math.abs(a.tx - b.tx) + Math.abs(a.ty - b.ty);

// ---------------------------------------------------------------------------
// Relationships & romance
// ---------------------------------------------------------------------------
function changeRel(a, b, amt) {
  const before = a.rel[b.id] || 0;
  const v = clamp(before + amt, -100, 100);
  a.rel[b.id] = v; b.rel[a.id] = v;
  const lb = relLabel(before), la = relLabel(v);
  if (lb !== la && v > before) {
    logTown(`🤝 ${josa(a.def.name, '과/와')} ${josa(b.def.name, '이/가')} ${josa(la, '이/가')} 되었다`, a.id, v >= 60);
    a.note(`${josa(b.def.short, '과/와')} ${la}`); b.note(`${josa(a.def.short, '과/와')} ${la}`);
  }
}
const relStatus = (a, b) => Sim.status[relKey(a, b)] || null;
function partnerOf(a) {
  for (const [k, s] of Object.entries(Sim.status)) if (s === '연인' && k.split('|').includes(a.id)) return Sim.byId[k.split('|').find((x) => x !== a.id)];
  return null;
}

function romanceAfterChat(a, b, boost = 1) {
  if (!adult(a) || !adult(b)) return;
  const k = relKey(a, b), v = a.rel[b.id] || 0, st = Sim.status[k];
  if (st === '연인') return;
  const pa = partnerOf(a), pb = partnerOf(b);
  const taken = [a, b].filter((x) => partnerOf(x));
  if (!st && v >= 40 && rand() < 0.3 * boost * (taken.length ? 0.5 : 1)) {
    Sim.status[k] = '썸';
    if (taken.length) {
      const who = taken.map((x) => `${x.def.short}(연인: ${partnerOf(x).def.short})`).join(', ');
      logTown(`😳 ${josa(a.def.name, '과/와')} ${b.def.name} 사이에 묘한 기류가… 그런데 ${who}…?!`, a.id, true);
      for (const x of taken) { x.stat('cheats'); memAdd(x, { kind: 'secret', with: (x === a ? b : a).id, text: `${josa((x === a ? b : a).def.short, '과/와')} 몰래 썸 타는 중 🤫` }); }
    } else logTown(`💓 ${josa(a.def.name, '과/와')} ${b.def.name} 사이에 묘한 기류가 흐른다…`, a.id, true);
  } else if (st === '썸' && v >= 55 && rand() < 0.35 * boost) {
    const [from, to] = rand() < 0.5 ? [a, b] : [b, a];
    from.stat('confess');
    const p = clamp((v - 55) / 40 + from.level('charm') * 0.03, 0.1, 0.9);
    from.say('저… 좋아해요! 💌', 4);
    if (rand() < p) {
      // 마을 절대 규칙: 연인은 한 명만 -> 기존 연인과 먼저 헤어진다
      for (const x of [from, to]) { const old = partnerOf(x); if (old) breakUp(x, old, `${x === from ? to.def.short : from.def.short}에게 환승`); }
      Sim.status[k] = '연인';
      setTimeout(() => to.say('…저도요 ❤️', 4), 900);
      logTown(`💘 ${josa(from.def.name, '이/가')} ${to.def.name}에게 고백했다… 성공! 두 사람은 연인이 되었다!`, from.id, true);
      from.note(`${to.def.short}에게 고백 성공 ❤️`); to.note(`${from.def.short}의 고백을 받아줌 ❤️`);
      for (const [x, y] of [[from, to], [to, from]]) if (x.home.owner === x.id) y.knownPw.add(x.home.id);
      newsAll([from, to], `${josa(from.def.short, '과/와')} ${josa(to.def.short, '이/가')} 사귄대요 💘`, null, false);
      for (const x of [from, to]) memRemoveSecret(x, (x === from ? to : from).id);
    } else {
      delete Sim.status[k];
      changeRel(a, b, -12);
      setTimeout(() => to.say('미안해요… 🙏', 4), 900);
      logTown(`💔 ${josa(from.def.name, '이/가')} ${to.def.name}에게 고백했지만… 거절당했다`, from.id, true);
      from.mood = clamp(from.mood - 25, 0, 100);
      memAdd(from, { kind: 'love', with: to.id, text: `${to.def.short}에게 고백했다가 차임 💔` });
    }
  }
}

function breakUp(x, y, reason) {
  delete Sim.status[relKey(x, y)];
  changeRel(x, y, -25);
  x.stat('breakups'); y.stat('breakups');
  logTown(`💔 ${josa(x.def.name, '과/와')} ${josa(y.def.name, '은/는')} 헤어졌다 (${reason})`, x.id, true);
  newsAll([x, y], `${josa(x.def.short, '과/와')} ${josa(y.def.short, '이/가')} 헤어졌대요 (${reason})`, null, false);
  for (const p of [x, y]) if (p.home.owner === p.id && rand() < 0.7) changePassword(p, '헤어져서');
}

// 바람 발각: a partner may notice a secret 썸
function cheatCheck() {
  for (const [k, st] of Object.entries(Sim.status)) {
    if (st !== '썸') continue;
    const [a, b] = k.split('|').map((id) => Sim.byId[id]);
    for (const x of [a, b]) {
      const p = partnerOf(x);
      if (!p || p === a || p === b || rand() > 0.25) continue;
      const other = x === a ? b : a;
      logTown(`😡 ${josa(p.def.name, '이/가')} ${x.def.name}의 바람(${other.def.short})을 눈치챘다!`, p.id, true);
      changeRel(p, x, -30); changeRel(p, other, -15);
      delete Sim.status[k];
      memAdd(p, { kind: 'love', with: x.id, text: `${josa(x.def.short, '이/가')} ${josa(other.def.short, '과/와')} 바람피운 걸 알게 됨 😡` });
      if (rand() < 0.5) breakUp(p, x, '바람');
      else logTown(`🥲 ${josa(p.def.name, '은/는')} 이번 한 번만 용서해주기로 했다`, p.id);
      break;
    }
  }
}

function dailyRomance() {
  Sim.dates = Sim.dates.filter((d) => d.promise && d.at > Sim.minute);
  cheatCheck();
  // random encounters between adults (any age/gender combination)
  const adults = Sim.agents.filter(adult);
  for (let n = 0; n < 2; n++) {
    if (rand() > 0.65) continue;
    const a = pick(adults), b = pick(adults);
    if (a === b) continue;
    const base = (dayOf(Sim.minute) - 1) * 1440;
    Sim.dates.push({ a, b, at: base + randInt(10, 21) * 60 + randInt(0, 50), meet: true });
  }
  for (const [k, st] of Object.entries(Sim.status)) {
    if (st !== '연인') continue;
    const [a, b] = k.split('|').map((id) => Sim.byId[id]);
    if (rand() < 0.05) {
      changeRel(a, b, -15);
      logTown(`💢 ${josa(a.def.name, '과/와')} ${josa(b.def.name, '이/가')} 사소한 일로 다퉜다`, a.id, true);
      if ((a.rel[b.id] || 0) < 40) breakUp(a, b, '다툼 끝에');
      continue;
    }
    if (rand() < 0.6) {
      const base = (dayOf(Sim.minute) - 1) * 1440;
      const at = base + (isWeekend(Sim.minute) ? randInt(13, 16) : 20) * 60 + randInt(0, 50);
      Sim.dates.push({ a, b, at });
    }
  }
}

function startMeetup(d) {
  const { a, b } = d;
  const blocked = ['commute', 'school_class', 'studycafe', 'sleep', 'oversleep', 'interrogate'];
  for (const x of [a, b]) if (!x.act || x.scripted || !x.awake() || x.chat || blocked.includes(x.act.key) || (x.inside && x.inside.virtual)) {
    if ((d.tries = (d.tries || 0) + 1) <= 4) { d.at = Sim.minute + 40; Sim.dates.push(d); }
    return false;
  }
  const spots = World.spots.fountain;
  const i = randInt(0, spots.length - 2);
  a.script('meetup', { target: spots[i], partner: b, dur: randInt(35, 50) });
  b.script('meetup', { target: spots[i + 1], partner: a, dur: randInt(35, 50) });
  logTown(`✨ ${josa(a.def.name, '과/와')} ${josa(b.def.name, '이/가')} 광장에서 우연히 마주쳤다`, a.id);
  return true;
}
function endMeetup(a) {
  const b = a.act && a.act.partner;
  if (!b || a.id > b.id) return; // handle each pair once
  changeRel(a, b, 7 + a.level('charm') + b.level('charm'));
  romanceAfterChat(a, b, 2.5);
}

function startDate(d) {
  if (d.promise) return startPromise(d);
  if (d.meet) return startMeetup(d);
  const { a, b } = d;
  for (const x of [a, b]) if (x.busy || !x.awake() || x.chat) return false;
  let place = null;
  if (isOpen('restaurant')) place = World.buildings.restaurant;
  else if (isOpen('cafe')) place = World.buildings.cafe;
  if (place && rand() < 0.75) {
    for (const [x, y] of [[a, b], [b, a]]) x.script('date', { target: place.door, enter: place, partner: y, dur: 75 });
    logTown(`💕 ${josa(a.def.name, '과/와')} ${josa(b.def.name, '이/가')} ${place.name}에서 데이트!`, a.id);
  } else {
    const spots = World.spots.fountain;
    const i = randInt(0, spots.length - 2);
    a.script('date', { target: spots[i], partner: b, dur: 70 });
    b.script('date', { target: spots[i + 1], partner: a, dur: 70 });
    logTown(`💕 ${josa(a.def.name, '과/와')} ${josa(b.def.name, '이/가')} 분수대 앞에서 데이트!`, a.id);
  }
  return true;
}

// ---------------------------------------------------------------------------
// Chats
// ---------------------------------------------------------------------------
function canChat(a) {
  if (a.chat || a.inside || !a.act || a.chatCooldown > 0) return false;
  if (a.scripted && a.act.key !== 'event') return false;
  if (['sleep', 'oversleep', 'run', 'evening_run'].includes(a.act.key)) return false;
  return true;
}
function greeting() {
  const h = hourOf(Sim.minute);
  if (h < 10) return pick(GREETINGS_MORNING);
  if (h >= 20 || h < 4) return pick(GREETINGS_NIGHT);
  return pick(GREETINGS_DAY);
}
function lineOf(a, b) {
  const close = a.def.chattyWhenClose && (a.rel[b.id] || 0) >= 40;
  return pick(close ? a.def.closeLines : a.def.lines);
}
function replyOf(a, b) {
  const close = a.def.chattyWhenClose && (a.rel[b.id] || 0) >= 40;
  return pick(close ? a.def.closeReplies : a.def.replies);
}
function extro(a, b) { return a.def.chattyWhenClose && (a.rel[b.id] || 0) >= 40 ? 1.3 : a.def.extro; }

function tryChats() {
  const A = Sim.agents;
  for (let i = 0; i < A.length; i++) for (let j = i + 1; j < A.length; j++) {
    const a = A[i], b = A[j];
    if (!canChat(a) || !canChat(b)) continue;
    if (Math.abs(a.px - b.px) + Math.abs(a.py - b.py) > TILE * 2.5) continue;
    const rel = a.rel[b.id] || 0;
    const chance = 0.18 * (extro(a, b) + extro(b, a)) + rel / 300;
    if (rand() > chance) { a.chatCooldown = b.chatCooldown = 8; continue; }
    let script, after = null;
    const flirter = [a, b].find((x) => adult(x) && (x.def.flirty ? rand() < 0.5 : x.level('charm') >= 3 && rand() < 0.08));
    const target = flirter && (flirter === a ? b : a);
    if (flirter && adult(target) && (!flirter.def.flirty || target.def.gender === 'F')) {
      flirter.stat('flirts');
      const v = target.rel[flirter.id] || 0;
      const resp = v >= 45 ? pick(['😳 에이~', '생각해볼게요 ㅎㅎ', '…귀엽네요 ㅋㅋ']) : pick(['…네? 😅', '근무나 하세요~', '하하… 😅 (뒷걸음)']);
      const lines = flirter.def.flirtLines || ['오늘 좀 멋진데요? 😏', '혹시 시간 있어요?', '같이 밥 먹을래요? ㅎㅎ'];
      script = [[flirter, greeting()], [target, greeting()], [flirter, pick(lines)], [target, resp]];
      const taken = partnerOf(flirter) ? ' (연인 있는데?!)' : '';
      logTown(`😏 ${josa(flirter.def.name, '이/가')} ${target.def.name}에게 플러팅을 시도했다…${taken}`, flirter.id);
      after = () => romanceAfterChat(flirter, target, 1.5);
    } else {
      ({ script, after } = buildChat(a, b));
    }
    a.startChat(b, true); b.startChat(a, false);
    a.chat.script = script; a.chat.after = after;
    if (window.NpcAI && NpcAI.canRequest()) aiChat(a, b, script, after);
    a.path = []; b.path = [];
  }
}

function endChat(a, b) {
  if (a.chat && a.chat.after) a.chat.after();
  if (a.chat && a.chat.isAI && a.chat.script[2] && rand() < 0.6) logTown(`🤖💬 ${a.chat.script[2][0].def.short}: "${a.chat.script[2][1]}"`, a.chat.script[2][0].id);
  let gain = 3 + (a.level('social') + b.level('social')) * 0.35;
  if (a.def.beloved || b.def.beloved) gain += 2;
  changeRel(a, b, gain);
  a.addXp('social', 4 * (a.def.talent.social || 1)); b.addXp('social', 4 * (b.def.talent.social || 1));
  a.mood = clamp(a.mood + 6, 0, 100); b.mood = clamp(b.mood + 6, 0, 100);
  if (rand() < 0.3) logTown(`${josa(a.def.name, '과/와')} ${josa(b.def.name, '이/가')} 수다를 떨었다`, a.id);
  romanceAfterChat(a, b);
  for (const x of [a, b]) {
    x.chat = null; x.chatCooldown = 90; x.state = 'idle';
    if (!x.act) continue;
    if (x.dest && (x.dest.x !== x.tx || x.dest.y !== x.ty)) x.walkTo(x.dest.x, x.dest.y);
    else { x.state = 'doing'; if (x.act.face && x.act.face !== 'center') x.dir = x.act.face; }
  }
}

// Claude writes this conversation (see ai.js); the rule-based script is the fallback
function aiChat(a, b, fallbackScript, fallbackAfter) {
  const c = a.chat;
  c.ai = 'pending'; c.aiStart = performance.now();
  c.fallback = { script: fallbackScript, after: fallbackAfter };
  c.script = fallbackScript.slice(0, 2); c.after = null;
  NpcAI.converse(a, b, placeName(a)).then((r) => {
    if (a.chat !== c || c.ai !== 'pending') return;
    if (r) { c.script = c.script.slice(0, 2).concat(r.lines); c.after = r.after; c.isAI = true; }
    else { c.script = c.fallback.script; c.after = c.fallback.after; }
    c.ai = 'done'; c.t = c.idx * 2.2;
  });
}
function placeName(a) {
  if (a.inside) return a.inside.name;
  const t = World.t(a.tx, a.ty);
  if (t === T.PAVE || t === T.FLOOR) return '중앙광장';
  if (t === T.TRACK || t === T.STEP) return '하천 산책로';
  if (t === T.FIELD) return '팔팔고 운동장';
  if ([T.SIDEWALK, T.CROSSWALK, T.ASPHALT, T.BRIDGE].includes(t)) return '큰길 인도';
  return '동네 골목길';
}

function insideSocial(dt) {
  Sim._insideAcc = (Sim._insideAcc || 0) + dt;
  if (Sim._insideAcc < 30) return;
  Sim._insideAcc = 0;
  const groups = {};
  for (const a of Sim.agents) if (a.inside && !a.inside.virtual && a.act && !['sleep', 'oversleep', 'kidnapped', 'kidnapper_hide', 'interrogate', 'jailed', 'essay'].includes(a.act.key)) (groups[a.inside.id] ||= []).push(a);
  for (const [bid, list] of Object.entries(groups)) {
    if (list.length < 2) continue;
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      changeRel(list[i], list[j], list[i].def.beloved || list[j].def.beloved ? 2 : 1.2);
      romanceAfterChat(list[i], list[j], 0.15);
      // indoor conversations also create memories (promises, recommendations, gossip, passwords)
      const pk = relKey(list[i], list[j]);
      if (window.NpcAI && Sim.minute - (Sim.aiPairT[pk] ?? -1e9) > 240 && NpcAI.canRequest(0.5)) {
        Sim.aiPairT[pk] = Sim.minute; // one AI chat per pair per 4 game hours indoors
        const x = list[i], y = list[j], bname = World.buildings[bid].name;
        NpcAI.converse(x, y, bname).then((r) => {
          if (!r) return;
          r.after();
          const [w, t] = r.lines[Math.min(1, r.lines.length - 1)];
          logTown(`🤖💬 ${bname}에서 ${w.def.short}: "${t}"`, w.id);
        });
      } else if (rand() < 0.3) {
        const t = buildChat(list[i], list[j]);
        if (t.after) {
          t.after();
          if (rand() < 0.5) logTown(`💬 ${World.buildings[bid].name}에서 ${t.script[2][0].def.short}: "${t.script[2][1]}"`, t.script[2][0].id);
        }
      } else if (rand() < 0.12) logTown(`${World.buildings[bid].name}에서 ${josa(list[i].def.short, '과/와')} ${josa(list[j].def.short, '이/가')} 이야기를 나눴다`, list[i].id);
    }
  }
}

// ---------------------------------------------------------------------------
// Kidnap scenario: 조이준 can target anyone (곽현지 most likely). 정의겸 rescues the same day and
// (being soft-hearted) releases him. Trying to kidnap 정의겸 himself = instant arrest + 1 day in jail.
// ---------------------------------------------------------------------------
const KIDNAP_WEIGHT = { gwak_hyunji: 6 };
function kidnapCandidates(I) {
  return Sim.agents.filter((a) => a !== I && a.act && !a.chat && !a.scripted && a.awake() && !(a.inside && a.inside.virtual)
    && !['sleep', 'oversleep', 'commute', 'shut_in'].includes(a.act.key));
}

function tickKidnap() {
  const I = Sim.byId.jo_ijun, U = Sim.byId.jung_uigyeom;
  const h = hourOf(Sim.minute);
  const K = Sim.kid;
  if (!K) {
    if (!Sim.dayVars.kidnap || Sim.dayVars.kidnapDone) return;
    if (h < 16 || h > 16.6) return;
    if (!I.act || I.act.key !== 'school_revisit' || I.state !== 'doing' || I.chat) return;
    const cands = kidnapCandidates(I);
    if (!cands.length) return;
    const V = Sim.byId[weightedPick(Object.fromEntries(cands.map((c) => [c.id, KIDNAP_WEIGHT[c.id] || 1])))];
    Sim.dayVars.kidnapDone = true;
    Sim.kid = { phase: 'hunt', cop: 'idle', t0: Sim.minute, v: V };
    I.script('kidnap_hunt');
    I.walkTo(V.inside ? V.inside.door.x : V.tx, V.inside ? V.inside.door.y : V.ty);
    I.say(V === U ? '허허… 오늘은 큰 물고기다 🤫' : '허허… 계획대로군 🤫', 3);
    return;
  }
  const V = K.v;
  if (h >= 23.8 && K.phase !== 'done') return resolveKidnap(true);

  if (K.phase === 'hunt') {
    const tgt = V.inside ? V.inside.door : { x: V.tx, y: V.ty };
    if (I.state !== 'walking' && Math.abs(I.tx - tgt.x) + Math.abs(I.ty - tgt.y) > 1) I.walkTo(tgt.x, tgt.y);
    if (Math.abs(I.tx - tgt.x) + Math.abs(I.ty - tgt.y) <= 1 && I.state !== 'walking') {
      if (V.inside) { V.inside = null; V.tx = tgt.x; V.ty = tgt.y; V.px = tgt.x * TILE + 8; V.py = tgt.y * TILE + 8; }
      if (V === U) {
        // 제5조: 경찰 납치 미수 -> 즉시 체포, 유치장 1일
        I.say('허허, 경찰 양반 잠깐 같이…', 2.5); U.say('…네? 이거 납치죠? 체포합니다!! 👮', 3);
        I.script('arrested'); I.act.def = { ...ACTIVITIES.arrested, follower: true };
        const police = World.buildings.police;
        U.script('escort', { target: police.door, enter: police });
        I.stat('kidnaps'); U.stat('arrests');
        logTown(`🤦 ${josa(I.def.name, '이/가')} ${josa(U.def.name, '을/를')} 납치하려다 그 자리에서 체포됐다! (팔팔법 제5조)`, I.id, true);
        newsAll([I, U], `${josa(I.def.short, '이/가')} 의겸 경위를 납치하려다 바로 잡혀갔대요`, I.id, true);
        lawRecord('kidnap_cop', I, U, null, '유치장 1일');
        K.phase = 'jail_escort';
        return;
      }
      V.script('kidnapped'); V.act.def = { ...ACTIVITIES.kidnapped, follower: true };
      V.say('어?! 뭐예요?! 😱', 3); I.say('허허, 잠깐 같이 가자~', 3);
      I.script('kidnap_home'); I.act.inside = I.home; I.walkTo(I.home.door.x, I.home.door.y);
      V.stat('kidnapped'); I.stat('kidnaps');
      logTown(`🚨 ${josa(I.def.name, '이/가')} ${josa(V.def.name, '을/를')} 납치했다!`, I.id, true);
      V.note('조이준에게 납치당함 😱'); I.note('계획 실행 🤫');
      K.phase = 'carry';
      const delay = randInt(20, 150);
      K.searchUntil = Math.min(Sim.minute + delay, (dayOf(Sim.minute) - 1) * 1440 + 22.5 * 60);
      U.script('search');
      K.cop = 'search';
      logTown(`📞 신고 접수! ${josa(U.def.name, '이/가')} 출동… 했는데 엉뚱한 곳으로 간다`, U.id);
    } else if (Sim.minute - K.t0 > 120) return resolveKidnap(false, true);
  }
  if (K.phase === 'jail_escort') {
    follow(I, U);
    if (U.inside === World.buildings.police && I.inside === World.buildings.police) {
      I.script('jailed', { inside: U.inside, dur: 1440 });
      I.note('경찰 납치 미수로 유치장 1일 🔒');
      U.act = null; U.state = 'idle';
      Sim.kid = null;
    }
    return;
  }
  if (K.phase === 'carry') {
    follow(V, I);
    if (I.inside === I.home && V.inside === I.home) { K.phase = 'held'; I.script('kidnapper_hide', { inside: I.home }); }
  }
  if (K.cop === 'search') {
    if (U.state !== 'walking') { const s = pick(World.spots.wander); U.walkTo(s.x, s.y); }
    if (Sim.minute >= K.searchUntil) {
      U.script('rescue'); U.walkTo(I.home.door.x, I.home.door.y); K.cop = 'rescue';
      U.say('앗! 범인은 조이준 선생님 댁이다!! 🚨', 3);
    }
  }
  if (K.cop === 'rescue' && K.phase === 'held' && U.state !== 'walking' && U.tx === I.home.door.x && U.ty === I.home.door.y) {
    for (const x of [I, V]) { x.inside = null; x.tx = U.tx; x.ty = U.ty; x.px = U.px; x.py = U.py; }
    sendVictimHome(V);
    I.script('arrested'); I.act.def = { ...ACTIVITIES.arrested, follower: true };
    const police = World.buildings.police;
    U.script('escort', { target: police.door, enter: police });
    U.stat('arrests');
    U.say('정의의 이름으로! 체포합니다! 👮', 3);
    logTown(`👮 ${josa(U.def.name, '이/가')} ${josa(I.def.name, '을/를')} 체포하고 ${josa(V.def.name, '을/를')} 구출했다!`, U.id, true);
    U.note(`납치범 체포! ${V.def.short} 구출`); V.note('정의겸이 구해줌');
    newsAll([I, V, U], `${josa(I.def.short, '이/가')} ${josa(V.def.short, '을/를')} 납치했다가 의겸 경위한테 잡혔대요`, I.id, true);
    lawRecord('kidnap', I, V, null, '체포 → 심문');
    K.phase = 'escort'; K.cop = 'escort';
  }
  if (K.phase === 'escort') {
    follow(I, U);
    if (U.inside === World.buildings.police && I.inside === World.buildings.police) {
      const dur = randInt(40, 80);
      U.script('interrogate', { inside: U.inside, dur }); I.script('interrogate', { inside: I.inside, dur });
      I.act.def = { ...ACTIVITIES.interrogate, label: '심문받는 중', emoji: '😅' };
      K.phase = 'interrogate';
    }
  }
  if (K.phase === 'interrogate' && (!U.act || U.act.key !== 'interrogate' || U.act.remaining <= 2)) resolveKidnap(false);
}

// 현지는 풀려나면 그날은 집 밖에 안 나온다; 다른 사람은 집에서 놀란 마음을 진정
function sendVictimHome(V) {
  if (V.id === 'gwak_hyunji') { V.script('go_home_shut'); V.say('…집에 갈래요. 😤', 3); }
  else { V.script('shaken', { dur: 120 }); V.say('세상에… 집에 갈래요 😵', 3); }
}

function resolveKidnap(forced, aborted = false) {
  const I = Sim.byId.jo_ijun, U = Sim.byId.jung_uigyeom, K = Sim.kid, V = K && K.v;
  if (K && K.phase === 'jail_escort') {
    // finish the arrest even across midnight
    I.inside = World.buildings.police; U.inside = World.buildings.police;
    I.script('jailed', { inside: I.inside, dur: 1440 }); U.act = null;
    Sim.kid = null; return;
  }
  if (!aborted) {
    U.stat('releases');
    logTown(`🙏 ${U.def.name}: "다음부턴 그러시면 안 돼요~" …${josa(I.def.name, '은/는')} 그대로 풀려났다 (마음이 여려서)`, U.id, true);
    U.say('다음부턴 안 돼요~ 😅', 3); I.say('허허, 물론이지! 😇', 3);
    I.note('풀려남 허허');
    if (Law.records[0] && Law.records[0].type === 'kidnap' && Law.records[0].culprit === I.id) Law.records[0].outcome = '심문 후 석방 (마음이 여려서)';
  }
  if (forced && V && V.act && ['kidnapped', 'go_home_shut'].includes(V.act.key)) {
    V.inside = V.home; V.tx = V.home.door.x; V.ty = V.home.door.y; V.px = V.tx * TILE + 8; V.py = V.ty * TILE + 8;
    V.act = null;
    if (V.id === 'gwak_hyunji') V.startActivity('shut_in', { until: dayOf(Sim.minute) * 1440, noMove: true });
  }
  if (aborted && V && V.act && V.act.key === 'kidnapped') V.act = null;
  for (const x of [I, U]) { x.act = null; x.state = 'idle'; }
  Sim.kid = null;
}

function follow(f, leader) {
  if (leader.inside) {
    const d = leader.inside.door;
    if (f.inside === leader.inside) return;
    if (f.tx === d.x && f.ty === d.y && f.state !== 'walking') { f.inside = leader.inside; f.path = []; return; }
    if (!f.dest || f.dest.x !== d.x || f.dest.y !== d.y || f.state !== 'walking') f.walkTo(d.x, d.y);
    return;
  }
  f.inside = null;
  if (tileDist(f, leader) <= 1) { f.path = []; f.state = 'doing'; f.dir = faceToward(f, leader.tx, leader.ty); return; }
  if (!f.dest || Math.abs(f.dest.x - leader.tx) + Math.abs(f.dest.y - leader.ty) > 1 || f.state !== 'walking') f.walkTo(leader.tx, leader.ty);
}
// follower activities: arriving at the leader must not trigger normal arrival logic
const _arrive = Agent.prototype.arrive;
Agent.prototype.arrive = function () {
  if (this.act && this.act.def.follower) { this.state = 'doing'; return; }
  return _arrive.call(this);
};

// ---------------------------------------------------------------------------
// Random town events
// ---------------------------------------------------------------------------
let eventUid = 1;
const EVENT_TYPES = {
  cat:     { title: '중앙광장에 길고양이 출몰!', emoji: '🐈', center: 'fountain', cheers: ['고양이다!! 🐈', '야옹~', '귀여워 😍', '츄르 있는 사람?'] },
  flea:    { title: '중앙광장 플리마켓', emoji: '🛍️', center: 'plaza', cheers: ['이거 얼마예요?', '득템! 🛍️', '구경 중~'] },
  busking: { title: '떠돌이 뮤지션 광장 버스킹', emoji: '🎸', center: 'stage', cheers: ['👏👏', '앵콜!', '노래 좋다~ 🎶'] },
  chicken: { title: '광장 치킨 파티', emoji: '🍗', center: 'plaza', cheers: ['치킨은 사랑 🍗', '맥주도 있어요?', '냠냠'] },
};
function planDay() {
  const base = (dayOf(Sim.minute) - 1) * 1440, wd = weekdayOf(Sim.minute), weekend = wd >= 5;
  const r = () => rand();
  const late = randInt(0, 50) / 60;
  const overtime = !weekend && r() < 0.2;
  const carried = Sim.events.filter((e) => e.carry && e.start > Sim.minute); // e.g. outbreak patients after midnight
  Sim.dayVars = {
    serinLate: !weekend && r() < 0.35,
    seunghwaOvertime: overtime,
    seunghwaReturn: overtime ? 21.5 + randInt(0, 60) / 60 : 18.6 + late * 0.5,
    seunghwaSnack: r() < 0.35,
    kidnap: !weekend && r() < 0.4,
    kidnapDone: false,
  };
  Sim.events = [];
  const add = (kind, startH, durMin) => {
    const t = EVENT_TYPES[kind];
    Sim.events.push({ uid: eventUid++, kind, ...t, start: base + startH * 60, end: base + startH * 60 + durMin, gather: true });
  };
  if (r() < 0.25) add('cat', randInt(10, 17), 60);
  if (weekend && r() < 0.5) add('flea', 13, 150);
  if (r() < 0.25) add('busking', 19, 80);
  if (weekend && r() < 0.25) add('chicken', 18.5, 120);
  if (r() < 0.22) {
    const s = randInt(8, 20);
    Sim.events.push({ uid: eventUid++, kind: 'rain', title: '소나기', emoji: '🌧️', start: base + s * 60, end: base + s * 60 + randInt(60, 180) });
  }
  if (r() < 0.12) Sim.events.push({ uid: eventUid++, kind: 'sick', start: base + randInt(9, 16) * 60 });
  if (r() < 0.06) Sim.events.push({ uid: eventUid++, kind: 'injury', start: base + randInt(8, 15) * 60 });
  const day = dayOf(Sim.minute);
  if (Sim.aiEvents[day]) {
    // the AI director already wrote today's events
    Sim.events = Sim.events.filter((e) => e.kind === 'sick' || e.kind === 'injury').concat(Sim.aiEvents[day].map((e) => ({ ...e, uid: eventUid++ })));
  } else rollRandomCrisis(day);
  syncPlanVars(day);
  Sim.events.push(...carried);
  Sim.events.sort((p, q) => p.start - q.start);
  dailyRomance();
}

function tickEvents() {
  const now = Sim.minute;
  if (Sim.activeEvent && now >= Sim.activeEvent.end) {
    const ev = Sim.activeEvent;
    const att = Sim.agents.filter((a) => a.act && a.act.key === 'event');
    for (let i = 0; i < att.length; i++) for (let j = i + 1; j < att.length; j++) changeRel(att[i], att[j], 2.5);
    for (const a of att) { a.note(`'${ev.title}' 구경`); a.endAct(); }
    logTown(`${ev.emoji} '${ev.title}' 끝! (${att.length}명 참여)`);
    Sim.activeEvent = null;
  }
  if (Sim.weather && now >= Sim.rainEnd) { logTown(Sim.weather === 'storm' ? '🌤️ 태풍이 지나갔다' : '🌤️ 비가 그쳤다'); Sim.weather = null; }
  while (Sim.events.length && now >= Sim.events[0].start) {
    const ev = Sim.events.shift();
    if (ev.kind === 'rain') {
      Sim.weather = 'rain'; Sim.rainEnd = ev.end;
      logTown('🌧️ 갑자기 소나기가 쏟아진다!', null, true);
      for (const a of Sim.agents) if (a.act && !a.busy && !a.inside) a.endAct();
    } else if (ev.kind === 'sick') {
      let cands = Sim.agents.filter((a) => a.awake() && !a.scripted && !(a.inside && a.inside.virtual) && !a.chat);
      if (ev.target) cands = cands.filter((a) => a.id === ev.target);
      if (cands.length) {
        const a = pick(cands);
        a.endAct(); a.script('sick', { dur: randInt(60, 120) });
        logTown(`🤧 ${josa(a.def.name, '이/가')} 몸살 기운에 팔팔팔병원에 갔다`, a.id, true);
        a.note('몸살로 병원행'); a.energy = clamp(a.energy - 20, 0, 100);
      }
    } else if (ev.kind === 'injury') {
      const H = Sim.byId.gwak_hyunji;
      if (H.act && H.act.key === 'gym_train') {
        H.endAct(); H.script('sick', { dur: randInt(60, 90) });
        logTown(`🤕 ${josa(H.def.name, '이/가')} 훈련하다 발목을 삐끗해서 병원에 갔다`, H.id, true);
        H.note('발목 삐끗 → 병원');
      }
    } else if (ev.crisis && !ev.gather) {
      if (now < ev.end) startCrisis(ev);
    } else if (ev.gather && !Sim.activeEvent && now < ev.end) {
      if (ev.crisis) startCrisis(ev);
      Sim.activeEvent = ev;
      logTown(`${ev.emoji} ${ev.title}!`, null, true);
      for (const a of Sim.agents) if (a.act && !a.busy && !a.chat) a.endAct();
    }
  }
  // dates
  for (let i = Sim.dates.length - 1; i >= 0; i--) {
    const d = Sim.dates[i];
    if (now >= d.at) { Sim.dates.splice(i, 1); startDate(d); }
  }
}

// ---------------------------------------------------------------------------
// Main tick / init / save
// ---------------------------------------------------------------------------
function simTick(realDt) {
  let dt = realDt * MINUTES_PER_SEC * Sim.speed;
  while (dt > 0) {
    const step = Math.min(dt, 2);
    dt -= step;
    Sim.minute += step;
    if (dayOf(Sim.minute) !== Sim.day) newDay();
    tickEvents();
    tickKidnap();
    tickLaw();
    tickCrisis(step);
    tickDirector();
    tickTourists(step);
    for (const a of Sim.agents) a.update(step);
    tryChats();
    insideSocial(step);
  }
}

function newDay() {
  const first = Sim.day === 0;
  Sim.day = dayOf(Sim.minute);
  if (Sim.kid) resolveKidnap(true);
  planDay();
  if (!first) logTown(`🌅 ${dateStr(Sim.minute)} 아침이 밝았다${isWeekend(Sim.minute) ? ' (주말!)' : ''}`);
  announcePaper(Sim.day);
  for (const o of [Sim.aiPlans, Sim.aiEvents, Sim.paper]) for (const d of Object.keys(o)) if (+d < Sim.day - 1) delete o[d];
}

function initSim() {
  Sim.agents = CHARACTERS.map((d) => new Agent(d));
  Sim.byId = Object.fromEntries(Sim.agents.map((a) => [a.id, a]));
  const init = Object.fromEntries(Object.entries(INITIAL_RELATIONS).map(([k, v]) => [k.split('|').sort().join('|'), v]));
  for (const a of Sim.agents) for (const b of Sim.agents) if (a !== b) {
    const k = relKey(a, b);
    a.rel[b.id] = init[k] ?? Math.round(4 + hash2(k.length, k.charCodeAt(3) + k.charCodeAt(9)) * 8);
  }
  lawInit();
  directorInit();
  newDay();
  logTown(`🏘️ ${TOWN_NAME}에 오신 걸 환영합니다! 📜 팔팔법을 지켜주세요`);
}

function saveGame() {
  if (Sim.resetting) return;
  const data = {
    v: 3, savedAt: Date.now(), minute: Sim.minute, law: lawSave(), mem: memSave(), director: directorSave(), speed: Sim.speed, townLog: Sim.townLog.slice(0, 80), status: Sim.status, dayVars: Sim.dayVars, eventUid,
    agents: Sim.agents.map((a) => ({ id: a.id, xp: a.xp, energy: a.energy, mood: a.mood, rel: a.rel, stats: a.stats, diary: a.diary.slice(0, 20) })),
  };
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch (e) { /* storage unavailable */ }
}

function loadGame() {
  let data = null;
  try { data = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch (e) { data = null; }
  if (!data || data.v !== 3) return null;
  Sim.minute = data.minute; Sim.speed = data.speed ?? 1; Sim.townLog = data.townLog || []; Sim.status = data.status || {};
  eventUid = data.eventUid || 1;
  for (const s of data.agents) {
    const a = Sim.byId[s.id]; if (!a) continue;
    Object.assign(a, { xp: s.xp, energy: s.energy, mood: s.mood, rel: s.rel, stats: s.stats || {}, diary: s.diary || [] });
  }
  lawLoad(data.law); memLoad(data.mem); directorLoad(data.director);
  Sim.day = 0; newDay(); Sim.dayVars = { ...Sim.dayVars, ...(data.dayVars || {}) };
  Sim.events = Sim.events.filter((e) => e.start > Sim.minute);
  Sim.dates = Sim.dates.filter((d) => d.at > Sim.minute);
  return offlineProgress((Date.now() - data.savedAt) / 1000);
}

// abstract catch-up while the page was closed (50% efficiency, max 2 game days)
function offlineProgress(realSec) {
  const gameMin = Math.min(realSec * MINUTES_PER_SEC * 0.5, 2 * 1440);
  if (gameMin < 30) return null;
  const before = Sim.agents.map((a) => ({ a, lv: a.totalLevel() }));
  const hours = Math.floor(gameMin / 60);
  for (let i = 0; i < hours; i++) {
    for (const a of Sim.agents) {
      const b = currentBlock(a.def);
      if (!b) continue;
      const def = ACTIVITIES[b.a || weightedPick(b.p)];
      if (def.xp) for (const [k, v] of Object.entries(def.xp)) a.xp[k] += v * 60 * (a.def.talent[k] || 1);
    }
    for (let k = 0; k < 2; k++) { const x = pick(Sim.agents), y = pick(Sim.agents); if (x !== y) changeRel(x, y, 2); }
    Sim.minute += 60;
    if (dayOf(Sim.minute) !== Sim.day) { Sim.day = dayOf(Sim.minute); planDay(); }
  }
  Sim.events = Sim.events.filter((e) => e.start > Sim.minute);
  for (const a of Sim.agents) { a.energy = 80; a.act = null; a.inside = a.home; a.tx = a.home.door.x; a.ty = a.home.door.y; a.px = a.tx * TILE + 8; a.py = a.ty * TILE + 8; }
  return { hours, gains: before.map(({ a, lv }) => ({ name: a.def.name, levels: a.totalLevel() - lv })) };
}

function resetGame() {
  Sim.resetting = true; // keep beforeunload from re-saving the old village
  try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
  location.reload();
}
