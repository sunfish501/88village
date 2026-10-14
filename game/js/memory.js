// Conversation memory: residents remember what they heard and act on it later.
// kinds: news (gossip), rec (recommendation), tried (followed a rec), promise / promise_kept / promise_broken,
//        pw (password learned/shared), secret (hidden crime), love
let memUid = 1;

function memAdd(a, m) {
  a.mem.unshift({ id: memUid++, t: Sim.minute, ...m });
  if (a.mem.length > 40) a.mem.pop();
  return a.mem[0];
}
function memRemoveSecret(a, victimId) { a.mem = a.mem.filter((m) => !(m.kind === 'secret' && m.with === victimId)); }
const memHasNews = (a, nid) => a.mem.some((m) => m.kind === 'news' && m.nid === nid);

// a notable event everyone involved remembers (and may gossip about)
function newsAll(people, text, about = null, bad = false) {
  const nid = memUid++;
  for (const p of people) if (p) memAdd(p, { kind: 'news', nid, about, text, bad });
}

const PLACE_LABEL = { restaurant_meal: '팔팔식당 돈까스', cafe_visit: '팔팔카페 커피', river_walk: '하천 산책', plaza_walk: '광장 산책', store_shop: '팔팔25', gym_visit: '체육관 운동', fountain: '분수대 앞' };

// ---- chat topic selection: returns { script, after } ----
function buildChat(a, b) {
  const tryTopic = (x, y) => topicCallback(x, y) || topicGossip(x, y) || topicPassword(x, y) || topicPromise(x, y) || topicRecommend(x, y);
  const t = rand() < 0.5 ? tryTopic(a, b) : tryTopic(b, a);
  if (t) return t;
  return { script: [[a, greeting()], [b, greeting()], [a, lineOf(a, b)], [b, replyOf(b, a)], [b, lineOf(b, a)], [a, replyOf(a, b)]], after: null };
}

function topicCallback(x, y) {
  const m = x.mem.find((k) => k.kind === 'tried' && k.with === y.id && !k.told);
  if (!m) return null;
  return {
    script: [[x, greeting()], [y, greeting()], [x, `${y.def.short}님이 추천한 ${PLACE_LABEL[m.act] || '거'} 가봤어요! 좋던데요?`], [y, pick(['그쵸?! 😆', '역시 내 안목 ㅎㅎ', '…다행이네.', '허허, 그렇지!'])]],
    after: () => { m.told = true; changeRel(x, y, 4); },
  };
}

function topicGossip(x, y) {
  const m = x.mem.find((k) => k.kind === 'news' && k.about !== y.id && k.about !== x.id && !memHasNews(y, k.nid) && Sim.minute - k.t < 3 * 1440);
  if (!m || rand() > 0.6) return null;
  return {
    script: [[x, greeting()], [y, greeting()], [x, `그거 들었어요? ${m.text}`], [y, pick(['헐 진짜요?!', '…대박', '말도 안 돼', '어머어머'])]],
    after: () => doGossip(x, y, m),
  };
}
function doGossip(x, y, m) {
  if (memHasNews(y, m.nid)) return;
  memAdd(y, { kind: 'news', nid: m.nid, about: m.about, text: m.text, bad: m.bad, from: x.id });
  if (m.bad && m.about && Sim.byId[m.about] && m.about !== y.id) changeRel(y, Sim.byId[m.about], -4);
  if (rand() < 0.4) logTown(`🗣️ ${josa(x.def.short, '이/가')} ${y.def.short}에게 소문을 전했다: "${m.text}"`, x.id);
}

function topicPassword(x, y) {
  if (!canSharePw(x, y) || rand() > 0.35) return null; // 세린은 철벽이라 75 이상
  const b = x.home, pw = Law.pw[b.id];
  return {
    script: [[x, greeting()], [y, greeting()], [x, `우리 집 비번 ${pw}예요. 비밀! 🤫`], [y, pick(['오… 외워둘게요!', '헐 저 믿는 거예요? 🥹', '…알겠어.'])]],
    after: () => doSharePw(x, y),
  };
}
// may x tell y their home password? (owner, friendly enough, y doesn't know it yet)
function canSharePw(x, y) {
  const b = x.home;
  if (!b || b.owner !== x.id || y.knownPw.has(b.id)) return false;
  return (x.rel[y.id] || 0) >= (x.id === 'ha_serin' ? 75 : 55);
}
function doSharePw(x, y) {
  const b = x.home;
  if (!b || y.knownPw.has(b.id)) return;
  y.knownPw.add(b.id); x.stat('pwShared');
  memAdd(y, { kind: 'pw', with: x.id, text: `${x.def.short}네 집 비번을 알게 됐다` });
  memAdd(x, { kind: 'pw', with: y.id, text: `${y.def.short}에게 집 비번을 알려줬다` });
  logTown(`🔑 ${josa(x.def.name, '이/가')} ${y.def.name}에게 집 비밀번호를 알려줬다`, x.id);
}

// a time slot is OK for a promise if the routine there is free time or a relaxed (non-busy) activity
const freeBlock = (b) => !!b && (b.p ? Object.keys(b.p).some((k) => !ACTIVITIES[k].busy) : !ACTIVITIES[b.a].busy && !['breakfast', 'home_meal'].includes(b.a));
// next time both of them have free time (within 3 days)
function findFreeSlot(a, b) {
  const start = Sim.minute + 180;
  for (let m = Math.ceil(start / 30) * 30; m < Sim.minute + 3 * 1440; m += 30) {
    const h = hourOf(m);
    if (h < 10 || h > 22) continue;
    const ba = currentBlock(a.def, m), bb = currentBlock(b.def, m);
    if (freeBlock(ba) && freeBlock(bb)) return m;
  }
  return null;
}

function topicPromise(x, y) {
  if ((x.rel[y.id] || 0) < 25 || rand() > 0.3) return null;
  if (hasPromise(x, y)) return null;
  const at = findFreeSlot(x, y);
  if (at === null) return null;
  const act = pick(PROMISE_ACTS);
  const refuse = (y.id === 'ha_serin' && (y.rel[x.id] || 0) < 50 && rand() < 0.6) || (y.rel[x.id] || 0) < 15;
  const when = whenStr(at);
  return {
    script: [[x, greeting()], [y, greeting()], [x, `${when}에 같이 ${PLACE_LABEL[act]} 어때요?`], [y, refuse ? pick(['…싫은데요.', '바빠요.', '음… 다음에요 😅']) : pick(['좋아요! 약속! 🤙', '콜!', '…그래.', '허허, 좋지!'])]],
    after: () => {
      if (refuse) { memAdd(x, { kind: 'news', nid: memUid++, about: y.id, text: `${y.def.short}에게 약속 잡자고 했다가 거절당함` }); return; }
      makePromise(x, y, act, at);
    },
  };
}
const PROMISE_ACTS = ['restaurant_meal', 'cafe_visit', 'river_walk', 'plaza_walk'];
const whenStr = (at) => `${dayOf(at) === dayOf(Sim.minute) ? '오늘' : dayOf(at) === dayOf(Sim.minute) + 1 ? '내일' : '모레'} ${clockStr(at)}`;
function hasPromise(x, y) { return Sim.dates.some((d) => d.promise && [d.a, d.b].includes(x) && [d.a, d.b].includes(y)); }
function makePromise(x, y, act, at) {
  if (at === null || at === undefined || hasPromise(x, y)) return false;
  if (!PROMISE_ACTS.includes(act)) act = pick(PROMISE_ACTS);
  Sim.dates.push({ a: x, b: y, at, promise: true, act });
  const text = `${dateStr(at)} ${clockStr(at)} ${PLACE_LABEL[act]} 약속`;
  memAdd(x, { kind: 'promise', with: y.id, text: `${josa(y.def.short, '과/와')} ${text}`, at });
  memAdd(y, { kind: 'promise', with: x.id, text: `${josa(x.def.short, '과/와')} ${text}`, at });
  logTown(`📅 ${josa(x.def.name, '과/와')} ${josa(y.def.name, '이/가')} ${whenStr(at)}에 ${PLACE_LABEL[act]} 약속을 잡았다`, x.id);
  return true;
}

function topicRecommend(x, y) {
  const fav = x.def.fav;
  if (!fav || rand() > 0.35) return null;
  if (y.mem.some((k) => k.kind === 'rec' && k.with === x.id && !k.done)) return null;
  return {
    script: [[x, greeting()], [y, greeting()], [x, fav.line], [y, pick(y.def.replies)]],
    after: () => doRecommend(x, y, fav.act),
  };
}
const REC_ACTS = ['restaurant_meal', 'cafe_visit', 'river_walk', 'plaza_walk', 'store_shop', 'gym_visit', 'fountain'];
function doRecommend(x, y, act) {
  if (!REC_ACTS.includes(act) || y.mem.some((k) => k.kind === 'rec' && k.with === x.id && !k.done)) return;
  memAdd(y, { kind: 'rec', with: x.id, act, text: `${josa(x.def.short, '이/가')} ${PLACE_LABEL[act]} 추천해줌`, until: Sim.minute + 4 * 1440 });
}

// free-time weights: recommendations heard earlier pull residents to those places
function memBoost(a, weights) {
  const w = { ...weights };
  for (const m of a.mem) if (m.kind === 'rec' && !m.done && Sim.minute < m.until) w[m.act] = (w[m.act] || 0) + 4;
  return w;
}

function memOnArrive(a) {
  if (!a.act) return;
  const m = a.mem.find((k) => k.kind === 'rec' && !k.done && k.act === a.act.key);
  if (!m) return;
  m.done = true;
  const from = Sim.byId[m.with];
  memAdd(a, { kind: 'tried', with: m.with, act: m.act, text: `${from.def.short}의 추천대로 ${PLACE_LABEL[m.act]} 해봄` });
  logTown(`💭 ${josa(a.def.name, '이/가')} ${from.def.short}의 추천을 기억하고 ${PLACE_LABEL[m.act]}에 와봤다`, a.id);
  a.say('여기가 거기구나…! 💡', 2.5);
}

// promise time: both show up (or someone flakes)
function startPromise(d) {
  const { a, b } = d;
  const blocked = (x) => !x.act || x.scripted || x.busy || x.chat || !x.awake() || (x.inside && x.inside.virtual);
  const flake = [a, b].find(blocked);
  if (flake) {
    if ((d.tries = (d.tries || 0) + 1) <= 2) { d.at = Sim.minute + 40; Sim.dates.push(d); return false; }
    const other = flake === a ? b : a;
    flake.stat('promiseBroken'); changeRel(a, b, -6);
    logTown(`😤 ${josa(flake.def.name, '이/가')} ${josa(other.def.name, '과/와')}의 약속을 못 지켰다…`, other.id);
    memAdd(other, { kind: 'promise_broken', with: flake.id, text: `${josa(flake.def.short, '이/가')} 약속 펑크냄 😤` });
    memAdd(flake, { kind: 'promise_broken', with: other.id, text: `${josa(other.def.short, '과/와')}의 약속을 못 지킴` });
    return false;
  }
  let place = null;
  if (d.act === 'restaurant_meal' && isOpen('restaurant')) place = World.buildings.restaurant;
  else if (d.act === 'cafe_visit' && isOpen('cafe')) place = World.buildings.cafe;
  if (place) {
    for (const [x, y] of [[a, b], [b, a]]) x.script('promise_meet', { target: place.door, enter: place, partner: y, dur: 70 });
  } else {
    const spots = d.act === 'river_walk' ? World.spots.river : World.spots.fountain;
    const i = randInt(0, spots.length - 2);
    a.script('promise_meet', { target: spots[i], partner: b, dur: 60 });
    b.script('promise_meet', { target: spots[i + 1], partner: a, dur: 60 });
  }
  changeRel(a, b, 6);
  for (const [x, y] of [[a, b], [b, a]]) memAdd(x, { kind: 'promise_kept', with: y.id, text: `${josa(y.def.short, '과/와')} 약속대로 ${PLACE_LABEL[d.act]} 함께함 🤝` });
  logTown(`🤝 ${josa(a.def.name, '과/와')} ${josa(b.def.name, '이/가')} 지난번 대화에서 한 약속대로 만났다! (${place ? place.name : PLACE_LABEL[d.act]})`, a.id, true);
  return true;
}

function memSave() { return Object.fromEntries(Sim.agents.map((a) => [a.id, a.mem.slice(0, 30)])); }
function memLoad(d) {
  if (!d) return;
  for (const a of Sim.agents) if (d[a.id]) a.mem = d[a.id];
  memUid = Math.max(memUid, ...Sim.agents.flatMap((a) => a.mem.map((m) => (m.nid || m.id || 0) + 1)));
}
