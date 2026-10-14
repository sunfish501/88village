// 팔팔법: building passwords, entry rules, crimes (trespass/theft) and police case handling.
const Law = {
  pw: {},       // buildingId -> '4821'
  records: [],  // {t, type, culprit, victim, item, outcome}
  pending: [],  // undiscovered crimes {type, culprit, victim, item, t}
  cases: [],    // reported crimes waiting for the police
  active: null, // case currently handled by 정의겸
};

const WORKPLACE_OF = { han_gayun: 'cafe', jo_beomgi: 'restaurant', hong_uijun: 'store', jung_uigyeom: 'police' };
const newPw = () => String(randInt(0, 9999)).padStart(4, '0');

function lawInit() {
  Law.pw = {};
  for (const b of Object.values(World.buildings)) if (!b.virtual) Law.pw[b.id] = newPw();
  Law.records = []; Law.pending = []; Law.cases = []; Law.active = null;
  for (const a of Sim.agents) {
    a.knownPw = new Set([a.home.id]);
    if (WORKPLACE_OF[a.id]) a.knownPw.add(WORKPLACE_OF[a.id]);
  }
}

const isHome = (b) => !!b.owner;
const ownerOf = (b) => (b.owner ? Sim.byId[b.owner] : null);

// 제1조: can this resident legally walk in right now?
function canEnter(a, b) {
  if (!b || b.virtual) return true;
  if (a.knownPw.has(b.id)) return true;
  if (isHome(b)) {
    const o = ownerOf(b);
    return !!o && o.inside === b; // the owner is home and opens the door
  }
  return isOpen(b.id);
}

function lawRecord(type, culprit, victim, item, outcome) {
  Law.records.unshift({ t: Sim.minute, type, culprit: culprit.id, victim: victim ? victim.id : null, item, outcome });
  if (Law.records.length > 40) Law.records.pop();
}

// free-time hook: maybe drop by a house whose password we know, or (low morality) sneak around
function lawFreeTime(a) {
  if (rand() < 0.1) {
    const homes = [...a.knownPw].map((id) => World.buildings[id])
      .filter((b) => b && isHome(b) && b !== a.home && ownerOf(b) && ownerOf(b).inside !== b);
    if (homes.length) { a.startActivity('drop_by', { target: { inside: pick(homes) } }); return true; }
  }
  if (rand() < (1 - a.def.morality) * 0.06) {
    const homes = BUILDINGS.filter((b) => isHome(b) && b !== a.home && !a.knownPw.has(b.id) && ownerOf(b) && ownerOf(b).inside !== b);
    if (homes.length) {
      const b = pick(homes);
      a.startActivity('sneak_in', { target: b.door });
      a.act.house = b;
      return true;
    }
  }
  return false;
}

function lawOnArrive(a) {
  const act = a.act;
  if (!act) return;
  if (act.key === 'drop_by' && a.inside && a.inside !== a.home) {
    const b = a.inside, o = ownerOf(b);
    if (rand() < (1 - a.def.morality) * 0.5) commitTheft(a, b, o);
    else { a.note(`${o.def.short}네 들러서 화분에 물 줌 🪴`); changeRel(a, o, 1); }
  }
  if (act.key === 'sneak_in' && act.house) {
    const b = act.house, o = ownerOf(b);
    if (rand() < 0.2) {
      // guessed the password: trespass (and maybe theft)
      a.inside = b; a.say('…열렸다?! 🤫', 2.5);
      const crime = { type: 'trespass', culprit: a, victim: o, item: null, t: Sim.minute };
      a.stat('trespass'); a.stat('crimes');
      logTown(`🤫 ${josa(a.def.name, '이/가')} ${o.def.name}네 비번을 때려 맞히고 몰래 들어갔다…`, a.id);
      if (rand() < (1 - a.def.morality) * 0.7) commitTheft(a, b, o, true);
      if (!witnessReport(a, crime)) Law.pending.push(crime);
    } else {
      a.say('🔒 비번 틀림…', 2);
      if (rand() < 0.3) witnessReport(a, { type: 'attempt', culprit: a, victim: o, item: null, t: Sim.minute });
      a.endAct();
    }
  }
}

function commitTheft(a, b, o, alreadyCounted) {
  const item = pick(o.def.items);
  if (!alreadyCounted) a.stat('crimes');
  a.stat('thefts');
  logTown(`🫳 ${josa(a.def.name, '이/가')} ${o.def.name}네 집에서 ${josa(`'${item}'`, '을/를')} 슬쩍했다… (아직 아무도 모름)`, a.id, true);
  a.note(`${o.def.short}네서 ${item} 슬쩍 🤫`);
  memAdd(a, { kind: 'secret', with: o.id, text: `${o.def.short}네서 ${item} 훔친 걸 숨기는 중` });
  Law.pending.push({ type: 'theft', culprit: a, victim: o, item, t: Sim.minute });
}

// someone outdoors nearby may see it and report immediately
function witnessReport(a, crime) {
  const w = Sim.agents.find((x) => x !== a && !x.inside && x.act && Math.abs(x.tx - a.tx) + Math.abs(x.ty - a.ty) <= 8);
  if (!w || rand() > 0.6) return false;
  const what = crime.type === 'attempt' ? '남의 집 비번을 누르는' : '남의 집에 몰래 들어가는';
  logTown(`👀 ${josa(w.def.name, '이/가')} ${josa(a.def.name, '이/가')} ${what} 걸 목격하고 신고했다!`, w.id, true);
  memAdd(w, { kind: 'news', about: a.id, text: `${josa(a.def.short, '이/가')} ${crime.victim.def.short}네 집에 몰래 들어가려는 걸 봤다`, bad: true });
  changeRel(w, a, -6);
  if (crime.type !== 'attempt') Law.cases.push(crime);
  else { lawRecord('attempt', a, crime.victim, null, '목격 신고 (미수)'); a.stat('crimes'); }
  return true;
}

// the owner comes home and may notice
function lawOwnerHome(o) {
  for (let i = Law.pending.length - 1; i >= 0; i--) {
    const c = Law.pending[i];
    if (c.victim !== o) continue;
    const chance = c.type === 'theft' ? 0.85 : 0.4;
    if (rand() > chance) continue;
    Law.pending.splice(i, 1);
    const what = c.type === 'theft' ? `${josa(`'${c.item}'`, '이/가')} 사라진 걸` : '누가 다녀간 흔적을';
    logTown(`🚨 ${josa(o.def.name, '이/가')} 집에서 ${what} 발견하고 신고했다!`, o.id, true);
    o.say('뭐야?! 누가 내 집에…?! 😡', 3);
    o.mood = clamp(o.mood - 15, 0, 100);
    Law.cases.push(c);
  }
}

// 주인 없는 집에 비번 모르는 손님이 남아 있으면 나가야 한다 (제1조)
function lawEvict() {
  for (const a of Sim.agents) {
    const b = a.inside;
    if (!b || !isHome(b) || b === a.home || a.scripted) continue;
    if (a.knownPw.has(b.id)) continue;
    const o = ownerOf(b);
    if (o && o.inside === b) continue;
    a.note(`${o.def.short}가 나가서 같이 나옴 (비번 모름)`);
    a.endAct();
  }
}

// ---------------------------------------------------------------------------
// Police: 정의겸 processes reported cases one at a time
// ---------------------------------------------------------------------------
function culpritAvailable(c) {
  const x = c.culprit;
  if (!x.act || x.chat) return false;
  if (x.inside && x.inside.virtual) return false;
  return !['sleep', 'oversleep', 'commute', 'jailed', 'kidnapped', 'interrogate', 'essay', 'community_service', 'arrested'].includes(x.act.key);
}

function tickLaw() {
  const U = Sim.byId.jung_uigyeom;
  if (Math.floor(Sim.minute) % 10 === 0) lawEvict();
  if (Sim.kid) return;
  const A = Law.active;
  if (!A) {
    if (!Law.cases.length || U.scripted || U.chat || !U.awake()) return;
    const c = Law.cases.find(culpritAvailable);
    if (!c) return;
    Law.cases.splice(Law.cases.indexOf(c), 1);
    Law.active = { c, phase: 'go', t0: Sim.minute };
    U.script('arrest_go');
    U.say(pick(['출동입니다!! 🚨', '정의는 살아있다! 👮', '범인 잡으러 갑니다~']), 2.5);
    return;
  }
  const x = A.c.culprit;
  if (A.phase === 'go') {
    const tgt = x.inside ? x.inside.door : { x: x.tx, y: x.ty };
    const d = Math.abs(U.tx - tgt.x) + Math.abs(U.ty - tgt.y);
    if (U.state !== 'walking' && d > 1) U.walkTo(tgt.x, tgt.y);
    if (d <= 1 && U.state !== 'walking') {
      if (x.inside) { x.inside = null; x.tx = tgt.x; x.ty = tgt.y; x.px = tgt.x * TILE + 8; x.py = tgt.y * TILE + 8; }
      x.script('arrested'); x.act.def = { ...ACTIVITIES.arrested, follower: true };
      const police = World.buildings.police;
      U.script('escort', { target: police.door, enter: police });
      const label = A.c.type === 'theft' ? '절도' : '무단출입';
      logTown(`👮 ${josa(U.def.name, '이/가')} ${josa(x.def.name, '을/를')} ${label} 혐의로 연행한다!`, U.id, true);
      x.say('아… 그게… 😰', 2.5);
      A.phase = 'escort';
    } else if (Sim.minute - A.t0 > 180) { Law.cases.push(A.c); Law.active = null; U.act = null; }
    return;
  }
  if (A.phase === 'escort') {
    follow(x, U);
    if (U.inside === World.buildings.police && x.inside === World.buildings.police) judge(A.c);
  }
}

function judge(c) {
  const U = Sim.byId.jung_uigyeom, x = c.culprit;
  U.stat('arrests');
  x.act = null; U.act = null;
  const soft = rand() < 0.35;
  if (c.type === 'theft') { changeRel(c.victim, x, -18); memAdd(c.victim, { kind: 'news', about: x.id, text: `${josa(x.def.short, '이/가')} 우리 집에서 ${josa(c.item, '을/를')} 훔쳤다`, bad: true }); }
  else changeRel(c.victim, x, -8);
  memRemoveSecret(x, c.victim.id);
  if (soft) {
    U.stat('releases');
    lawRecord(c.type, x, c.victim, c.item, '훈방 (정의겸이 마음이 여려서…)');
    logTown(`🙏 ${U.def.name}: "이번만 봐드릴게요~" ${josa(x.def.name, '은/는')} 훈방됐다`, U.id, true);
    U.say('이번만이에요~ 😅', 2.5);
    Law.active = null;
    return;
  }
  if (c.type === 'theft') {
    lawRecord('theft', x, c.victim, c.item, '사회봉사 2시간 + 물건 반환');
    logTown(`⚖️ 팔팔법 제3조! ${josa(x.def.name, '은/는')} 광장 청소 사회봉사 2시간 + '${c.item}' 반환`, U.id, true);
    x.script('community_service', { dur: 120 });
  } else {
    lawRecord('trespass', x, c.victim, null, '반성문 1시간');
    logTown(`⚖️ 팔팔법 제2조! ${josa(x.def.name, '은/는')} 파출소에서 반성문 1시간`, U.id, true);
    x.script('essay', { inside: World.buildings.police, dur: 60 });
  }
  x.note(c.type === 'theft' ? '절도로 사회봉사…' : '무단출입으로 반성문…');
  x.mood = clamp(x.mood - 20, 0, 100);
  Law.active = null;
}

// passwords change after a breakup (the ex knew it)
function changePassword(owner, reason) {
  const b = owner.home;
  if (!b || !isHome(b)) return;
  Law.pw[b.id] = newPw();
  const partner = partnerOf(owner);
  for (const a of Sim.agents) if (a !== owner && a !== partner) a.knownPw.delete(b.id);
  logTown(`🔐 ${josa(owner.def.name, '이/가')} 집 비밀번호를 바꿨다 (${reason})`, owner.id);
}

function lawSave() {
  return { pw: Law.pw, records: Law.records, known: Object.fromEntries(Sim.agents.map((a) => [a.id, [...a.knownPw]])) };
}
function lawLoad(d) {
  if (!d) return;
  Law.pw = d.pw || Law.pw; Law.records = d.records || [];
  for (const a of Sim.agents) if (d.known && d.known[a.id]) a.knownPw = new Set(d.known[a.id]);
}
