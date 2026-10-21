// AI director: every game day the AI writes the next day's newspaper, events and each resident's
// routine (see ai.js -> NpcAI.planDay). This file holds everything that runs inside the game:
// validating/applying AI plans, the inputs we send, and the crisis engine
// (storm, blackout, fire, flood, outbreak, UFO, and the rare 팔팔-칠칠 war).
// Without AI, rare crises still happen at random (rollRandomCrisis).

Object.assign(Sim, {
  aiPlans: {},    // day -> { residentId: routine blocks }
  aiEvents: {},   // day -> [event]
  paper: {},      // day -> { headline, summary, notes: {id: text}, quotes: {id: text}, source }
  planAsked: {},  // day -> true once requested
  dramaOk: {},    // day -> whether the director may pick a dramatic event
  lastDrama: -99, // last day with a dramatic event
  crisis: null,   // active war state
  fires: {},      // buildingId -> end minute
  damaged: {},    // buildingId -> minute until smoke clears (cosmetic)
  flood: 0, blackout: 0, ufo: 0, booms: [],
});

const CRISIS = {
  storm: { emoji: '⛈️', title: '태풍 상륙', dur: [180, 360] },
  blackout: { emoji: '🔌', title: '마을 전체 정전', dur: [60, 180] },
  fire: { emoji: '🔥', title: '화재 발생', dur: [60, 120] },
  flood: { emoji: '🌊', title: '하천 범람', dur: [180, 480] },
  outbreak: { emoji: '🤒', title: '독감 유행', dur: [480, 720] },
  ufo: { emoji: '🛸', title: '운동장에 UFO 출몰', dur: [60, 120] },
  war: { emoji: '⚔️', title: '팔팔-칠칠 전쟁 발발', dur: [240, 480] },
};
const DRAMATIC = Object.keys(CRISIS);
const GATHER_KINDS = { cat: 1, flea: 1, busking: 1, chicken: 1 };
const GATHER_CENTERS = ['plaza', 'fountain', 'stage', 'field', 'school_front'];
const EVENT_KINDS = ['gather', 'cat', 'flea', 'busking', 'chicken', 'rain', ...DRAMATIC];
const FIRE_TARGETS = () => BUILDINGS.filter((b) => !b.virtual && b.id !== 'police' && b.id !== 'firestation').map((b) => b.id);

function directorInit() {
  const S = World.spots;
  S.event_centers.field = { x: 80, y: 70 };
  S.event_centers.school_front = { x: 61, y: 75 };
  S.warfront = S.wander.filter((s) => s.x >= 84 && s.y >= 26 && s.y <= 37);
  if (!S.warfront.length) S.warfront = S.plaza;
  World.trackTiles = [];
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) if (World.t(x, y) === T.TRACK || World.t(x, y) === T.STEP) World.trackTiles.push([x, y]);
}

const burning = (id) => (Sim.fires[id] || 0) > Sim.minute;

// ---------------------------------------------------------------------------
// AI plans -> routine blocks
// ---------------------------------------------------------------------------
const BASE_FREE_ACTS = ['home_relax', 'breakfast', 'home_meal', 'store_shop'];
function allowedActs(def) {
  const own = new Set(BASE_FREE_ACTS);
  for (const b of def.routine) for (const k of b.a ? [b.a] : Object.keys(b.p)) own.add(k);
  for (const k of Object.keys(FREE)) own.add(k);
  own.delete('sleep');
  return [...own].filter((k) => ACTIVITIES[k] && !ACTIVITIES[k].sticky);
}

function validatePlan(def, blocks) {
  const allowed = new Set(allowedActs(def));
  let out = (blocks || []).map((b) => ({ f: Number(b.from), t: Number(b.to), a: b.activity, note: String(b.note || '').slice(0, 40) }))
    .filter((b) => Number.isFinite(b.f) && Number.isFinite(b.t) && (allowed.has(b.a) || b.a === 'free_time'))
    .map((b) => ({ ...b, f: clamp(b.f, 0, 24), t: clamp(b.t, 0, 24) }))
    .filter((b) => b.t - b.f >= 0.2)
    .sort((p, q) => p.f - q.f);
  for (let i = 1; i < out.length; i++) out[i].f = Math.max(out[i].f, out[i - 1].t);
  out = out.filter((b) => b.t - b.f >= 0.2);
  const awake = out.reduce((s, b) => s + (b.t - b.f), 0);
  if (out.length < 2 || awake < 6) return null;
  return out.map((b) => (b.a === 'free_time'
    ? { d: 'all', f: b.f, t: b.t, p: FREE, ai: true, note: b.note }
    : { d: 'all', f: b.f, t: b.t, a: b.a, ai: true, note: b.note }));
}

function applyPlan(day, a, res) {
  const blocks = res && validatePlan(a.def, res.blocks);
  if (!blocks) return false;
  (Sim.aiPlans[day] ||= {})[a.id] = blocks;
  const paper = (Sim.paper[day] ||= { headline: '', summary: '', notes: {}, quotes: {}, source: 'ai' });
  if (res.mood_line) paper.quotes[a.id] = String(res.mood_line).slice(0, 50);
  if (res.goal) (paper.goals ||= {})[a.id] = String(res.goal).slice(0, 30);
  if (day === dayOf(Sim.minute)) syncPlanVars(day);
  return true;
}

// keep rule-based day variables consistent with an AI plan (e.g. 승화's overtime log)
function syncPlanVars(day) {
  const p = Sim.aiPlans[day] && Sim.aiPlans[day].han_seunghwa;
  if (!p) return;
  const commute = p.find((b) => b.a === 'commute');
  Sim.dayVars.seunghwaOvertime = !!commute && commute.t >= 20.5;
}

// ---------------------------------------------------------------------------
// AI director -> events + newspaper
// ---------------------------------------------------------------------------
function applyDirector(day, res) {
  if (!res) return false;
  const base = (day - 1) * 1440;
  const events = [];
  let drama = 0;
  for (const e of (res.events || []).slice(0, 4)) {
    if (!EVENT_KINDS.includes(e.kind)) continue;
    const isDrama = DRAMATIC.includes(e.kind);
    if (isDrama && (!Sim.dramaOk[day] || drama++)) continue; // at most one, and only when allowed
    const start = clamp(Number(e.start_hour) || 12, 7, 22);
    let dur = clamp(Number(e.duration_hours) || 1, 0.5, isDrama ? 8 : 4);
    if (e.kind === 'fire') dur = Math.min(dur, 2);
    events.push(makeEvent(e.kind, base + start * 60, dur * 60, {
      title: String(e.title || '').slice(0, 30), desc: String(e.description || '').slice(0, 120),
      center: GATHER_CENTERS.includes(e.center) ? e.center : null,
      building: World.buildings[e.building] && !World.buildings[e.building].virtual ? e.building : null,
      cheers: Array.isArray(e.cheers) ? e.cheers.map((c) => String(c).slice(0, 20)).filter(Boolean).slice(0, 5) : null,
    }));
  }
  Sim.aiEvents[day] = events;
  const paper = (Sim.paper[day] ||= { notes: {}, quotes: {} });
  Object.assign(paper, { headline: String(res.headline || '').slice(0, 60), summary: String(res.summary || '').slice(0, 200), source: 'ai' });
  for (const n of res.resident_notes || []) if (Sim.byId[n.id]) paper.notes[n.id] = String(n.note || '').slice(0, 60);
  if (day === dayOf(Sim.minute)) {
    // arrived during the day: replace the not-yet-started rule-based events
    Sim.events = Sim.events.filter((e) => e.kind === 'sick' || e.kind === 'injury' || e.start <= Sim.minute)
      .concat(events.filter((e) => e.start > Sim.minute)).sort((p, q) => p.start - q.start);
    announcePaper(day);
  }
  return true;
}

function makeEvent(kind, start, durMin, o = {}) {
  const ev = { uid: eventUid++, kind, start, end: start + durMin };
  if (GATHER_KINDS[kind] || kind === 'gather') {
    const t = EVENT_TYPES[kind] || {};
    Object.assign(ev, t, { gather: true, emoji: t.emoji || '🎉', center: o.center || t.center || 'plaza' });
    if (o.title) ev.title = o.title;
    ev.cheers = o.cheers && o.cheers.length ? o.cheers : t.cheers || ['👏👏', '와아~', '오오!'];
  } else if (kind === 'rain') Object.assign(ev, { title: '소나기', emoji: '🌧️' });
  else Object.assign(ev, { title: o.title || CRISIS[kind].title, emoji: CRISIS[kind].emoji, crisis: true, building: o.building });
  if (kind === 'ufo') Object.assign(ev, { gather: true, center: 'field', cheers: ['UFO다!!', '외계인?!', '찍어 찍어 📸', '😱😱'] });
  ev.desc = o.desc || '';
  return ev;
}

// no AI: rare crises still happen (one at most, with a cooldown)
function rollRandomCrisis(day) {
  if (day - Sim.lastDrama < 4) return;
  const roll = rand();
  const table = [['storm', 0.05], ['blackout', 0.04], ['fire', 0.035], ['flood', 0.03], ['outbreak', 0.03], ['ufo', 0.02], ['war', 0.015]];
  let acc = 0;
  for (const [kind, p] of table) {
    acc += p;
    if (roll < acc) {
      const base = (day - 1) * 1440, [lo, hi] = CRISIS[kind].dur;
      const start = base + (kind === 'ufo' || kind === 'blackout' ? randInt(19, 22) : randInt(9, 18)) * 60;
      Sim.events.push(makeEvent(kind, start, randInt(lo, hi)));
      Sim.events.sort((p2, q) => p2.start - q.start);
      return;
    }
  }
}

function announcePaper(day) {
  const p = Sim.paper[day];
  if (!p || !p.headline || p.announced) return;
  p.announced = true;
  logTown(`📰 팔팔일보: ${p.headline}`, null, true);
}

// ---------------------------------------------------------------------------
// Inputs for the AI
// ---------------------------------------------------------------------------
const hhmm = (h) => clockStr(Math.round(h * 60));
function routineText(def, day) {
  const m = (day - 1) * 1440;
  const wd = weekdayOf(m), out = [];
  for (const b of def.routine) {
    if (!dayMatch(b.d, wd) || (b.if && !Sim.dayVars[b.if])) continue;
    const f = resolveHour(b.f), t = resolveHour(b.t);
    if (out.some((o) => o.f === f)) continue;
    out.push({ f, t, label: b.a ? ACTIVITIES[b.a].label : '자유 시간' });
  }
  return out.sort((p, q) => p.f - q.f).map((o) => `${hhmm(o.f)}-${hhmm(Math.min(o.t, 24))} ${o.label}`);
}
function residentSummary(a) {
  const top = Object.entries(a.rel).sort((p, q) => q[1] - p[1]).slice(0, 3).map(([id, v]) => `${Sim.byId[id].def.short}(${Math.round(v)})`);
  const p = partnerOf(a);
  return {
    id: a.id, 이름: a.def.name, 나이: a.def.age, 역할: a.def.role, 성격: a.def.traits,
    기분: Math.round(a.mood), 연인: p ? p.def.name : '없음', 친한_사람: top,
    최근_기억: a.mem.slice(0, 3).map((m) => m.text),
  };
}
function buildDirectorInput(day) {
  const m = (day - 1) * 1440;
  Sim.dramaOk[day] = day - Sim.lastDrama >= 4 && rand() < 0.35;
  const couples = Object.entries(Sim.status).map(([k, st]) => `${k.split('|').map((id) => Sim.byId[id].def.short).join('·')} ${st}`);
  return {
    날짜: dateStr(m), 요일: WEEKDAYS[weekdayOf(m)], 주말: weekdayOf(m) >= 5,
    주민: Sim.agents.map(residentSummary),
    연애: couples,
    최근_마을_소식: Sim.townLog.filter((l) => !l.text.includes('Lv.')).slice(0, 14).map((l) => `${dayOf(l.t)}일 ${l.text}`),
    최근_범죄: Law.records.slice(0, 3).map((r) => `${r.culprit ? Sim.byId[r.culprit].def.short : r.culpritName} ${r.type} → ${r.outcome}`),
    dramatic_allowed: Sim.dramaOk[day],
    마지막_대형사건: Sim.lastDrama > 0 ? `${Sim.lastDrama}일` : '없음',
    건물_목록: BUILDINGS.filter((b) => !b.virtual).map((b) => `${b.id}:${b.name}`),
  };
}
function directorSchema() {
  return {
    type: 'object',
    properties: {
      headline: { type: 'string' },
      summary: { type: 'string' },
      events: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            kind: { type: 'string', enum: EVENT_KINDS },
            title: { type: 'string' },
            description: { type: 'string' },
            start_hour: { type: 'number' },
            duration_hours: { type: 'number' },
            center: { type: 'string', enum: [...GATHER_CENTERS, 'none'] },
            building: { type: 'string', enum: [...FIRE_TARGETS(), 'none'] },
            cheers: { type: 'array', items: { type: 'string' } },
          },
          required: ['kind', 'title', 'description', 'start_hour', 'duration_hours', 'center', 'building', 'cheers'],
          additionalProperties: false,
        },
      },
      resident_notes: {
        type: 'array',
        items: {
          type: 'object',
          properties: { id: { type: 'string', enum: Sim.agents.map((a) => a.id) }, note: { type: 'string' } },
          required: ['id', 'note'],
          additionalProperties: false,
        },
      },
    },
    required: ['headline', 'summary', 'events', 'resident_notes'],
    additionalProperties: false,
  };
}

function buildPlannerInput(a, day) {
  const m = (day - 1) * 1440;
  const acts = allowedActs(a.def).map((k) => `${k}: ${ACTIVITIES[k].label}`).concat(['free_time: 자유 시간(산책·카페·외식·이웃 방문 등 그때그때)']);
  const events = (Sim.aiEvents[day] || Sim.events.filter((e) => dayOf(e.start) === day && e.title))
    .map((e) => `${hhmm(hourOf(e.start))}-${hhmm(hourOf(e.end))} ${e.title}`);
  const promises = Sim.dates.filter((d) => d.promise && dayOf(d.at) === day && (d.a === a || d.b === a))
    .map((d) => `${hhmm(hourOf(d.at))} ${(d.a === a ? d.b : d.a).def.short}와 ${PLACE_LABEL[d.act] || '약속'}`);
  const paper = Sim.paper[day] || {};
  return {
    날짜: dateStr(m), 요일: WEEKDAYS[weekdayOf(m)],
    나: { ...residentSummary(a), 말투: a.def.lines.slice(0, 3) },
    기본_일과: routineText(a.def, day),
    가능한_활동: acts,
    오늘_마을_일정: events,
    오늘_신문: paper.headline || '',
    감독_메모: (paper.notes || {})[a.id] || '',
    약속: promises,
    어제_일기: a.diary.slice(0, 4).map((d) => d.text),
  };
}
function plannerSchema(a) {
  return {
    type: 'object',
    properties: {
      blocks: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            from: { type: 'number' }, to: { type: 'number' },
            activity: { type: 'string', enum: [...allowedActs(a.def), 'free_time'] },
            note: { type: 'string' },
          },
          required: ['from', 'to', 'activity', 'note'],
          additionalProperties: false,
        },
      },
      mood_line: { type: 'string' },
      goal: { type: 'string' },
    },
    required: ['blocks', 'mood_line', 'goal'],
    additionalProperties: false,
  };
}

// ask the AI for tomorrow at 16:00 (and for today right after the game starts)
function tickDirector() {
  if (!window.NpcAI || !NpcAI.directorOn()) return;
  const day = dayOf(Sim.minute), h = hourOf(Sim.minute);
  if (!Sim.planAsked[day] && h < 13) { Sim.planAsked[day] = true; NpcAI.planDay(day); }
  if (!Sim.planAsked[day + 1] && h >= 16) { Sim.planAsked[day + 1] = true; NpcAI.planDay(day + 1); }
}

// ---------------------------------------------------------------------------
// Crisis engine
// ---------------------------------------------------------------------------
const freeForCrisis = (a) => a.act && !a.chat && !(a.inside && a.inside.virtual) && !['kidnapped', 'interrogate', 'jailed', 'arrested'].includes(a.act.key) && !(Sim.kid && [Sim.kid.v, Sim.byId.jo_ijun, Sim.byId.jung_uigyeom].includes(a));

function startCrisis(ev) {
  const day = dayOf(Sim.minute);
  Sim.lastDrama = day;
  const desc = ev.desc ? ` — ${ev.desc}` : '';
  switch (ev.kind) {
    case 'storm':
      Sim.weather = 'storm'; Sim.rainEnd = ev.end;
      logTown(`⛈️ ${ev.title}! 강풍과 폭우가 몰아친다${desc}`, null, true);
      for (const a of Sim.agents) if (a.act && !a.busy && !a.inside) a.endAct();
      break;
    case 'blackout':
      Sim.blackout = ev.end;
      logTown(`🔌 ${ev.title}! 가로등도 간판도 전부 꺼졌다${desc}`, null, true);
      break;
    case 'flood':
      Sim.flood = ev.end;
      logTown(`🌊 ${ev.title}! 하천 산책로가 물에 잠겼다${desc}`, null, true);
      for (const a of Sim.agents) if (a.act && a.act.def.loc === 'river' && !a.busy) a.endAct();
      break;
    case 'fire': {
      const ids = FIRE_TARGETS();
      const b = World.buildings[ev.building && ids.includes(ev.building) ? ev.building : pick(ids)];
      Sim.fires[b.id] = ev.end;
      logTown(`🔥 ${b.name}에 불이 났다!${desc}`, null, true);
      for (const a of Sim.agents) {
        if (a.inside !== b || !freeForCrisis(a)) continue;
        a.inside = null; a.tx = b.door.x; a.ty = b.door.y; a.px = a.tx * TILE + 8; a.py = a.ty * TILE + 8;
        a.script('evacuate', { dur: 60 }); a.say('불이야!! 🔥', 3);
        a.note(`${b.name} 화재로 대피`);
      }
      const U = Sim.byId.jung_uigyeom;
      if (freeForCrisis(U) && !Law.active) { U.script('firefight', { target: b.door, dur: ev.end - Sim.minute }); U.say('제가 막겠습니다!! 🧯', 3); }
      ev.building = b.id;
      if (typeof Traffic !== 'undefined') Traffic.dispatchFire(b); // 팔팔소방서 fire truck
      break;
    }
    case 'outbreak': {
      const cands = Sim.agents.filter((a) => a.awake() && freeForCrisis(a));
      const n = Math.min(cands.length, randInt(2, 4));
      logTown(`🤒 ${ev.title}! 마을에 독감이 돈다${desc}`, null, true);
      for (let i = 0; i < n; i++) {
        const a = cands.splice(randInt(0, cands.length - 1), 1)[0];
        Sim.events.push({ uid: eventUid++, kind: 'sick', target: a.id, carry: true, start: Sim.minute + randInt(10, Math.max(20, ev.end - Sim.minute - 60)) });
      }
      Sim.events.sort((p, q) => p.start - q.start);
      break;
    }
    case 'war':
      startWar(ev);
      break;
    default: break;
  }
  if (ev.kind === 'ufo') { Sim.ufo = ev.end; logTown(`🛸 ${ev.title}!${desc}`, null, true); }
}

// 팔팔-칠칠 전쟁: cartoonish chaos (sirens, explosions, injuries), never deaths
function startWar(ev) {
  if (Sim.kid) resolveKidnap(true);
  const adults = Sim.agents.filter((a) => adult(a) && freeForCrisis(a));
  const U = Sim.byId.jung_uigyeom;
  const defenders = new Set(adults.includes(U) ? [U] : []);
  const others = adults.filter((a) => a !== U);
  while (defenders.size < Math.min(3, adults.length) && others.length) defenders.add(others.splice(randInt(0, others.length - 1), 1)[0]);
  Sim.crisis = { kind: 'war', ev, end: ev.end, defenders: [...defenders].map((a) => a.id), nextBoom: Sim.minute, nextHurt: Sim.minute + 45, hurt: [] };
  logTown(`🚨 칠칠마을이 쳐들어왔다! ${ev.title}!${ev.desc ? ` — ${ev.desc}` : ''}`, null, true);
  for (const a of Sim.agents) {
    if (!freeForCrisis(a)) continue;
    if (a.inside) { const d = a.inside.door; a.inside = null; a.tx = d.x; a.ty = d.y; a.px = d.x * TILE + 8; a.py = d.y * TILE + 8; }
    if (defenders.has(a)) {
      a.script('defend', { until: ev.end }); a.say(a === U ? '팔팔마을은 내가 지킨다!! 👮' : pick(['막아라!!', '가자!!', '여긴 못 지나간다!']), 3);
      a.note('칠칠마을과의 전쟁에서 마을 입구를 지킴');
    } else {
      a.script('shelter', { until: ev.end }); a.say(pick(['대피해요!!', '체육관으로!', '무서워… 😨']), 2.5);
      a.note('전쟁 중 체육관으로 대피');
    }
  }
}

function tickWar() {
  const C = Sim.crisis;
  if (!C) return;
  if (Sim.minute >= C.end) return endWar();
  if (Sim.minute >= C.nextBoom) {
    C.nextBoom = Sim.minute + randInt(6, 18);
    const s = pick(World.spots.warfront);
    Sim.booms.push({ x: (s.x + randInt(-6, 3)) * TILE, y: (s.y + randInt(-8, 8)) * TILE, born: performance.now() });
    const d = Sim.byId[pick(C.defenders)];
    if (d && d.act && d.act.key === 'defend' && rand() < 0.5) d.say(pick(['💥 조심해!!', '물러서지 마!', '으아아!', '칠칠마을 물러가라!']), 2);
  }
  if (Sim.minute >= C.nextHurt) {
    C.nextHurt = Sim.minute + randInt(50, 90);
    const cands = C.defenders.map((id) => Sim.byId[id]).filter((a) => a.act && a.act.key === 'defend');
    if (cands.length > 1 && rand() < 0.45) {
      const a = pick(cands);
      a.script('injured', { dur: randInt(90, 180) });
      C.hurt.push(a.id);
      logTown(`🩹 ${josa(a.def.name, '이/가')} 방어전 중 다쳐서 팔팔팔병원으로 실려 갔다`, a.id, true);
      a.note('전쟁 중 부상 → 병원');
    }
  }
}

function endWar() {
  const C = Sim.crisis;
  Sim.crisis = null;
  const involved = Sim.agents.filter((a) => a.act && ['defend', 'shelter'].includes(a.act.key));
  for (const a of involved) { a.endAct(); a.mood = clamp(a.mood - 10, 0, 100); a.stat('war'); }
  for (let i = 0; i < involved.length; i++) for (let j = i + 1; j < involved.length; j++) changeRel(involved[i], involved[j], 4);
  const ids = FIRE_TARGETS();
  for (let k = 0; k < 2; k++) Sim.damaged[pick(ids)] = dayOf(Sim.minute) * 1440;
  const heroes = C.defenders.map((id) => Sim.byId[id].def.short).join(', ');
  logTown(`🕊️ 칠칠마을과 평화 협정 체결! 전쟁 종료. 마을을 지킨 사람: ${heroes}${C.hurt.length ? ` (부상 ${C.hurt.length}명)` : ''}`, null, true);
  newsAll(Sim.agents, `칠칠마을이 쳐들어왔다가 평화 협정을 맺었대요. ${heroes}이(가) 입구를 지켰어요`, null, false);
}

function tickCrisis() {
  const now = Sim.minute;
  tickWar();
  for (const [id, end] of Object.entries(Sim.fires)) {
    if (now < end) continue;
    delete Sim.fires[id];
    Sim.damaged[id] = now + 360;
    logTown(`🧯 ${World.buildings[id].name} 화재 진압 완료! 다친 사람은 없다`, null, true);
    const U = Sim.byId.jung_uigyeom;
    if (U.act && U.act.key === 'firefight') { U.stat('fires'); U.endAct(); }
  }
  if (Sim.flood && now >= Sim.flood) { Sim.flood = 0; logTown('🌊 하천 물이 빠졌다'); }
  if (Sim.blackout && now >= Sim.blackout) { Sim.blackout = 0; logTown('💡 전기가 다시 들어왔다'); }
  if (Sim.ufo && now >= Sim.ufo) Sim.ufo = 0;
  Sim.booms = Sim.booms.filter((b) => performance.now() - b.born < 2500);
}

// ---------------------------------------------------------------------------
// Save
// ---------------------------------------------------------------------------
function directorSave() {
  const day = dayOf(Sim.minute), keep = (o) => Object.fromEntries(Object.entries(o).filter(([d]) => +d >= day));
  return { aiPlans: keep(Sim.aiPlans), aiEvents: keep(Sim.aiEvents), paper: keep(Sim.paper), dramaOk: keep(Sim.dramaOk), lastDrama: Sim.lastDrama };
}
function directorLoad(d) {
  if (!d) return;
  Object.assign(Sim, { aiPlans: d.aiPlans || {}, aiEvents: d.aiEvents || {}, paper: d.paper || {}, dramaOk: d.dramaOk || {}, lastDrama: d.lastDrama ?? -99 });
  // re-ask for any day whose plan never arrived (e.g. the page was closed mid-request)
  Sim.planAsked = Object.fromEntries(Object.keys(Sim.aiEvents).map((day) => [day, true]));
}
