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
  $('#reset').addEventListener('click', () => openModal(
    `<h2>🔄 마을 리셋</h2><p>팔팔마을을 처음부터 다시 시작할까요?</p><p><small>주민들의 성장, 관계, 연애, 기억, 비밀번호, 범죄 기록이 모두 초기화돼요.</small></p>`,
    { confirm: '리셋하고 다시 시작', onConfirm: resetGame, cancel: true }));
  $('#law-btn').addEventListener('click', showLaw);
  $('#ai-btn').addEventListener('click', showAiSettings);
  $('#modal-close').addEventListener('click', () => { const f = UI.onConfirm; closeModal(); if (f) f(); });
  $('#modal-cancel').addEventListener('click', closeModal);
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
  if (window.NpcAI) { const st = NpcAI.status(); $('#ai-btn').textContent = st.configured ? (st.paused && st.lastError ? '🤖 AI ⚠️' : '🤖 AI 켜짐') : '🤖 AI'; }
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
  const MEM_ICON = { chat: '💬', news: '🗣️', rec: '💡', tried: '✅', promise: '📅', promise_kept: '🤝', promise_broken: '😤', pw: '🔑', secret: '🤫', love: '💗' };
  const mems = a.mem.slice(0, 8).map((m) => `<li><time>${dayOf(m.t)}일 ${clockStr(m.t)}</time>${MEM_ICON[m.kind] || '•'} ${esc(m.text)}${m.kind === 'rec' ? (m.done ? ' <small>(가봄)</small>' : ' <small>(가볼 예정)</small>') : ''}</li>`).join('') || '<li>아직 기억할 만한 대화가 없어요</li>';
  const pws = [...a.knownPw].map((id) => World.buildings[id]).filter(Boolean).map((b) => `<span class="stat">🔑 ${esc(b.name)} <b>${Law.pw[b.id]}</b></span>`).join('');
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
    <h3>🧠 기억 <small>대화에서 들은 것 → 나중에 행동</small></h3><ul class="diary">${mems}</ul>
    <h3>🔑 아는 비밀번호</h3><div class="stats">${pws}</div>
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

function openModal(html, opts = {}) {
  $('#modal-body').innerHTML = html;
  $('#modal-close').textContent = opts.confirm || '확인';
  $('#modal-cancel').hidden = !opts.cancel;
  UI.onConfirm = opts.onConfirm || null;
  $('#modal').hidden = false;
}
function closeModal() { $('#modal').hidden = true; UI.onConfirm = null; }

const CRIME_LABEL = { theft: '🫳 절도', trespass: '🚪 무단출입', attempt: '🔒 무단출입 미수', kidnap: '🚨 납치', kidnap_cop: '🤦 경찰 납치 미수' };
function showLaw() {
  const laws = PALPAL_LAWS.map((l) => `<li><b>${l.no} ${esc(l.title)}</b><br>${esc(l.text)}</li>`).join('');
  const rules = VILLAGE_RULES.map((r) => `<li>${esc(r)}</li>`).join('');
  const recs = Law.records.slice(0, 12).map((r) => {
    const c = Sim.byId[r.culprit], v = r.victim && Sim.byId[r.victim];
    return `<li><time>${dayOf(r.t)}일 ${clockStr(r.t)}</time> ${CRIME_LABEL[r.type] || r.type} · <b>${c.def.short}</b>${v ? ` → ${v.def.short}` : ''}${r.item ? ` (${esc(r.item)})` : ''}<br><small>⚖️ ${esc(r.outcome)}</small></li>`;
  }).join('') || '<li>아직 범죄 기록이 없어요. 평화로운 팔팔마을 🌷</li>';
  const couples = Object.entries(Sim.status).map(([k, st]) => {
    const [a, b] = k.split('|').map((id) => Sim.byId[id].def.short);
    return `<span class="stat">${st === '연인' ? '❤️' : '💓'} ${a} · ${b} <b>${st}</b></span>`;
  }).join('') || '<small>아직 없음</small>';
  openModal(`<h2>📜 팔팔법</h2><ol class="laws">${laws}</ol>
    <h3>🏘️ 마을 절대 규칙</h3><ul class="laws">${rules}</ul>
    <h3>💞 연애 현황</h3><div class="stats">${couples}</div>
    <h3>🚔 범죄 기록 ${Law.cases.length ? `<small>(처리 대기 ${Law.cases.length}건)</small>` : ''}</h3><ul class="records">${recs}</ul>`, { confirm: '닫기' });
}

function showAiSettings() {
  if (!window.NpcAI) { openModal('<h2>🤖 AI 설정</h2><p>AI 모듈을 불러오지 못했어요. 인터넷 연결을 확인해 주세요.</p>'); return; }
  const s = NpcAI.status();
  const provOpts = Object.entries(AI_CONFIG.providers).map(([id, p]) => `<option value="${id}" ${id === s.provider ? 'selected' : ''}>${esc(p.label)}</option>`).join('');
  const modelOpts = (prov, cur) => AI_CONFIG.providers[prov].models.map((m) => `<option value="${m.id}" ${m.id === cur ? 'selected' : ''}>${esc(m.label)}</option>`).join('');
  const freqs = Object.entries(AI_CONFIG.frequency).map(([k, f]) => `<option value="${k}" ${k === s.freq ? 'selected' : ''}>${esc(f.label)}</option>`).join('');
  const modeLabel = { proxy: '서버 프록시', key: '내 API 키', local: '로컬 키 파일' }[s.mode] || '';
  const state = !s.configured ? '⚪ 꺼짐 (키 없음 · 규칙 기반 대화)' : s.paused && s.lastError ? `🟠 일시중지: ${esc(s.lastError)}` : `🟢 켜짐 (${AI_CONFIG.providers[s.provider].label} · ${modeLabel})`;
  openModal(`<h2>🤖 NPC 인격 AI</h2>
    <p class="ai-state">${state}</p>
    <p><small>AI가 주민들의 대화를 성격·관계·기억에 맞게 직접 쓰고, 대화 결과(약속, 추천, 비번 공유, 소문, 플러팅)를 게임에 반영해요. 키가 없으면 기존 규칙 기반 대화로 돌아가요.</small></p>
    <label class="ai-row">AI 서비스 <select id="ai-provider">${provOpts}</select></label>
    <label class="ai-row">API 키 <small>(sk-or-… 는 OpenRouter, sk-ant-… 는 Claude로 자동 인식)</small>
      <input id="ai-key" type="password" autocomplete="off" placeholder="${s.keyHint ? `저장됨: ${esc(s.keyHint)} (바꾸려면 새로 입력)` : s.mode === 'local' ? '로컬 키 파일 사용 중 (입력하면 이 브라우저 키가 우선)' : 'sk-or-... / sk-ant-...'}"></label>
    <label class="ai-row">모델 <select id="ai-model">${modelOpts(s.provider, s.model)}</select></label>
    <label class="ai-row">AI 대화 빈도 <select id="ai-freq">${freqs}</select></label>
    <label class="ai-row ai-check"><input id="ai-enabled" type="checkbox" ${s.enabled ? 'checked' : ''}> AI 사용</label>
    <details><summary>고급: 서버 프록시 URL</summary>
      <label class="ai-row"><input id="ai-proxy" type="url" placeholder="https://palpal-npc.xxx.workers.dev" value="${esc(s.proxy || '')}"></label>
      <small>server/ 폴더의 Cloudflare Worker를 배포하면, 키를 서버에만 두고 친구들도 키 없이 AI NPC를 볼 수 있어요.</small></details>
    <div class="ai-btns"><button id="ai-save">저장</button><button id="ai-test">저장 + 연결 테스트</button><button id="ai-forget">키 삭제</button></div>
    <pre id="ai-out" class="ai-out" hidden></pre>
    <p class="ai-usage"><small>이번 세션: ${s.calls}회 호출 · 오늘 ${s.dayCalls}회 · 입력 ${s.inTok.toLocaleString()} / 출력 ${s.outTok.toLocaleString()} 토큰 · 예상 비용 약 $${s.cost.toFixed(3)}${s.errors ? ` · 오류 ${s.errors}회` : ''}</small></p>
    <p><small>🔒 키는 이 브라우저(localStorage)에만 저장되고, Anthropic API로만 직접 전송돼요. 깃허브나 게임 파일에는 들어가지 않아요. 공용 PC에서는 사용 후 "키 삭제"를 눌러 주세요.</small></p>`, { confirm: '닫기' });
  $('#ai-provider').addEventListener('change', () => {
    const prov = $('#ai-provider').value;
    $('#ai-model').innerHTML = modelOpts(prov, AI_CONFIG.providers[prov].defaultModel);
  });
  const collect = () => {
    const patch = { provider: $('#ai-provider').value, model: $('#ai-model').value, freq: $('#ai-freq').value, enabled: $('#ai-enabled').checked, proxy: $('#ai-proxy').value.trim() };
    const key = $('#ai-key').value.trim();
    if (key) patch.key = key;
    NpcAI.save(patch);
  };
  const out = (msg) => { const el = $('#ai-out'); el.hidden = false; el.textContent = msg; };
  $('#ai-save').addEventListener('click', () => { collect(); out('저장했어요.'); });
  $('#ai-forget').addEventListener('click', () => { NpcAI.forgetKey(); out('이 브라우저에서 키를 지웠어요.'); });
  $('#ai-test').addEventListener('click', async () => {
    collect();
    if (!NpcAI.configured()) { out('키나 프록시 URL을 먼저 입력해 주세요.'); return; }
    out('AI에게 물어보는 중…');
    const r = await NpcAI.test();
    out(r.ok ? `✅ 연결 성공!\n${r.msg}` : `❌ ${r.msg}`);
  });
}

function showOffline(result) {
  const rows = result.gains.filter((g) => g.levels)
    .map((g) => `<li><b>${g.name}</b> 스킬 +${g.levels}레벨</li>`).join('') || '<li>조용히 지나간 시간이었어요.</li>';
  openModal(`<h2>🌙 자리를 비운 사이…</h2><p>마을에서 <b>${result.hours}시간</b>이 흘렀어요.</p><ul>${rows}</ul>`);
}
