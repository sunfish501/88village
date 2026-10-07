// DOM side panel, log, toasts, modal.
const UI = { cards: {}, lastDetail: '' };
const $ = (s) => document.querySelector(s);

function bar(v, color) {
  return `<span class="bar"><i style="width:${clamp(v, 0, 100).toFixed(1)}%;background:${color}"></i></span>`;
}
function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

function initUI() {
  const cast = $('#cast');
  for (const a of Sim.agents) {
    const el = document.createElement('button');
    el.className = 'card';
    el.innerHTML = `
      <img class="portrait" src="../characters/portraits/${a.id}.png" alt="">
      <div class="info">
        <div class="row1"><b>${a.def.name}</b><span class="g ${a.def.gender}">${a.def.gender === 'F' ? '♀' : '♂'}${a.def.age}</span><span class="lv"></span></div>
        <div class="status"></div>
        <div class="mini"><span title="에너지">⚡</span><span class="e"></span><span title="기분">😊</span><span class="m"></span></div>
      </div>`;
    el.addEventListener('click', () => selectAgent(a, true));
    cast.appendChild(el);
    UI.cards[a.id] = el;
  }
  document.querySelectorAll('[data-speed]').forEach((b) => b.addEventListener('click', () => setSpeed(+b.dataset.speed)));
  $('#zoom-in').addEventListener('click', () => zoomBy(1.25));
  $('#zoom-out').addEventListener('click', () => zoomBy(1 / 1.25));
  $('#log-toggle').addEventListener('click', () => $('#log').classList.toggle('collapsed'));
  $('#reset').addEventListener('click', () => { if (confirm('마을을 처음부터 다시 시작할까요? 저장된 진행이 사라집니다.')) resetGame(); });
  $('#modal-close').addEventListener('click', () => { $('#modal').hidden = true; });
  setSpeed(Sim.speed);
}

function setSpeed(s) {
  Sim.speed = s;
  document.querySelectorAll('[data-speed]').forEach((b) => b.classList.toggle('on', +b.dataset.speed === s));
}

function selectAgent(a, follow) {
  Gfx.selected = a;
  Cam.follow = follow ? a : null;
  UI.lastDetail = '';
  for (const [id, el] of Object.entries(UI.cards)) el.classList.toggle('sel', a && id === a.id);
  updateDetail(true);
}

function updateUI() {
  const h = hourOf(Sim.minute);
  $('#date').textContent = dateStr(Sim.minute);
  $('#clock').textContent = clockStr(Sim.minute);
  $('#sky').textContent = Sim.weather === 'rain' ? '🌧️' : h >= 6 && h < 18 ? '☀️' : h >= 18 && h < 20 ? '🌇' : '🌙';
  const ev = Sim.activeEvent;
  $('#event-banner').hidden = !ev;
  if (ev) $('#event-banner').textContent = `${ev.emoji} ${ev.title} 진행 중!`;
  const kid = Sim.kid && Sim.kid.phase !== 'hunt';
  $('#alert-banner').hidden = !kid;

  for (const a of Sim.agents) {
    const el = UI.cards[a.id];
    el.querySelector('.status').textContent = a.statusText();
    el.querySelector('.lv').textContent = `Lv.${a.totalLevel()}`;
    el.querySelector('.e').innerHTML = bar(a.energy, '#f2c12e');
    el.querySelector('.m').innerHTML = bar(a.mood, '#3fb58a');
  }
  updateDetail(false);
  updateLog();
}

function todaySchedule(a) {
  const wd = weekdayOf(Sim.minute), out = [];
  for (const b of a.def.routine) {
    if (!dayMatch(b.d, wd)) continue;
    if (b.if && !Sim.dayVars[b.if]) continue;
    if (b.ifNot && Sim.dayVars[b.ifNot]) continue;
    const f = resolveHour(b.f), t = resolveHour(b.t);
    if (out.some((o) => o.f === f)) continue;
    const label = b.a ? `${ACTIVITIES[b.a].emoji} ${ACTIVITIES[b.a].label}` : '🎲 자유 시간';
    out.push({ f, t, label });
  }
  out.sort((p, q) => p.f - q.f);
  const hh = (v) => clockStr(Math.round(v * 60));
  const h = hourOf(Sim.minute);
  return out.map((o) => `<li class="${h >= o.f && h < o.t ? 'now' : ''}"><time>${hh(o.f)}–${hh(Math.min(o.t, 24))}</time>${esc(o.label)}</li>`).join('') || '<li>오늘은 자유!</li>';
}

function updateDetail() {
  const a = Gfx.selected, box = $('#detail');
  if (!a) {
    const html = `<div class="hint">캐릭터를 클릭하면 일과와 성장 기록을 볼 수 있어요.<br><small>드래그: 이동 · 휠: 확대/축소 · Space: 일시정지 · 1~4: 배속</small></div>`;
    if (UI.lastDetail !== html) { box.innerHTML = html; UI.lastDetail = html; }
    return;
  }
  const skills = Object.entries(SKILLS).map(([k, sk]) => {
    const L = levelFromXp(a.xp[k]);
    const pct = L.need ? L.into / L.need * 100 : 100;
    return `<div class="sk"><span>${sk.emoji} ${sk.name}</span><b>Lv.${L.level}</b>${bar(pct, sk.color)}</div>`;
  }).join('');
  const rels = Sim.agents.filter((o) => o !== a).sort((p, q) => (a.rel[q.id] || 0) - (a.rel[p.id] || 0)).map((o) => {
    const v = a.rel[o.id] || 0, st = relStatus(a, o);
    const badge = st ? `<i class="st ${st === '연인' ? 'love' : 'some'}">${st === '연인' ? '❤️ 연인' : '💓 썸'}</i>` : '';
    return `<div class="rel" data-id="${o.id}"><img src="../characters/portraits/${o.id}.png" alt=""><span>${o.def.short}</span><em>${relLabel(v)}${badge}</em>${bar(v, '#f07a9a')}</div>`;
  }).join('');
  const stats = Object.entries(a.stats).filter(([, v]) => v > 0).map(([k, v]) => `<span class="stat">${STAT_LABELS[k] || k} <b>${v}</b></span>`).join('') || '<small>아직 기록 없음</small>';
  const diary = a.diary.slice(0, 8).map((d) => `<li><time>${dayOf(d.t)}일 ${clockStr(d.t)}</time>${esc(d.text)}</li>`).join('') || '<li>아직 기록이 없어요</li>';
  const partner = partnerOf(a);
  const html = `
    <div class="dh">
      <img src="../characters/portraits/${a.id}.png" alt="">
      <div><h2>${a.def.name} <small>${a.def.gender === 'F' ? '♀' : '♂'} ${a.def.age}세</small></h2><div class="role">${esc(a.def.role)}</div>
      <div class="traits">${esc(a.def.traits)}${partner ? ` · ❤️ ${partner.def.short}의 연인` : ''}</div>
      <div class="now">${esc(a.statusText())}</div></div>
      <button id="follow" class="${Cam.follow === a ? 'on' : ''}">${Cam.follow === a ? '📍 따라가는 중' : '📍 따라가기'}</button>
    </div>
    <div class="needs"><span>⚡ 에너지</span>${bar(a.energy, '#f2c12e')}<span>😊 기분</span>${bar(a.mood, '#3fb58a')}</div>
    <h3>오늘의 일과 <small>${WEEKDAYS[weekdayOf(Sim.minute)]}요일</small></h3><ul class="sched">${todaySchedule(a)}</ul>
    <h3>기록</h3><div class="stats">${stats}</div>
    <h3>스킬</h3><div class="skills">${skills}</div>
    <h3>관계</h3><div class="rels">${rels}</div>
    <h3>일기</h3><ul class="diary">${diary}</ul>`;
  if (html === UI.lastDetail) return;
  UI.lastDetail = html;
  const scroll = box.scrollTop;
  box.innerHTML = html;
  box.scrollTop = scroll;
  $('#follow').addEventListener('click', () => { Cam.follow = Cam.follow === a ? null : a; UI.lastDetail = ''; updateDetail(); });
  box.querySelectorAll('.rel').forEach((el) => el.addEventListener('click', () => selectAgent(Sim.byId[el.dataset.id], true)));
}

let lastLogTop = null;
function updateLog() {
  const top = Sim.townLog[0];
  if (top === lastLogTop) return;
  lastLogTop = top;
  $('#log-list').innerHTML = Sim.townLog.slice(0, 40).map((l) => `<li><time>${dayOf(l.t)}일 ${clockStr(l.t)}</time>${esc(l.text)}</li>`).join('');
}

function toast(text) {
  const el = document.createElement('div');
  el.className = 'toast'; el.textContent = text;
  $('#toasts').appendChild(el);
  setTimeout(() => el.classList.add('out'), 3800);
  setTimeout(() => el.remove(), 4400);
  while ($('#toasts').children.length > 4) $('#toasts').firstChild.remove();
}

function showOffline(result) {
  const rows = result.gains.filter((g) => g.levels)
    .map((g) => `<li><b>${g.name}</b> 스킬 +${g.levels}레벨</li>`).join('') || '<li>조용히 지나간 시간이었어요.</li>';
  $('#modal-body').innerHTML = `<h2>🌙 자리를 비운 사이…</h2><p>마을에서 <b>${result.hours}시간</b>이 흘렀어요.</p><ul>${rows}</ul>`;
  $('#modal').hidden = false;
}
