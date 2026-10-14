// NPC personality AI: an LLM (OpenRouter e.g. DeepSeek V4 Flash, or Anthropic Claude) writes each
// conversation in character and picks what the NPCs remember / do afterwards
// (promise, recommendation, password, gossip, flirting).
// Loaded as an ES module; game globals (Sim, Law, CHARACTERS, ...) come from the classic scripts.
// With no key/proxy configured everything falls back to the rule-based dialogue.

const SDK_URL = 'https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@0.133.0/+esm';
const STORE_KEY = 'palpal-ai-v1';
// optional local-only key file (js/ai-local.js, git-ignored)
const LOCAL = window.AI_LOCAL || {};

const st = {
  settings: loadSettings(),
  Anthropic: null, client: null,
  inflight: 0, recent: [], day: 0, dayCalls: 0,
  calls: 0, inTok: 0, outTok: 0, cost: 0, errors: 0, lastError: '', pausedUntil: 0,
};

function providerOfKey(key) {
  for (const [id, p] of Object.entries(AI_CONFIG.providers)) if (key && key.startsWith(p.keyPrefix)) return id;
  return null;
}
function loadSettings() {
  const provider = LOCAL.provider || providerOfKey(LOCAL.key) || AI_CONFIG.defaultProvider;
  const base = {
    enabled: true, key: '', provider, model: LOCAL.model || AI_CONFIG.providers[provider].defaultModel,
    freq: 'normal', proxy: AI_CONFIG.proxyUrl,
  };
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(STORE_KEY) || '{}'); } catch (e) { saved = {}; }
  const s = { ...base, ...saved };
  if (!AI_CONFIG.providers[s.provider]) s.provider = AI_CONFIG.defaultProvider;
  if (s.key && providerOfKey(s.key)) s.provider = providerOfKey(s.key);
  // no personal key and no custom proxy saved -> use the shared server proxy
  if (!s.proxy && !s.key) s.proxy = AI_CONFIG.proxyUrl;
  // older saves (Claude-only version) may hold a model that belongs to another provider
  if (!AI_CONFIG.providers[s.provider].models.some((m) => m.id === s.model)) s.model = AI_CONFIG.providers[s.provider].defaultModel;
  return s;
}
function persist() { try { localStorage.setItem(STORE_KEY, JSON.stringify(st.settings)); } catch (e) { /* storage blocked */ } }

// the key a request uses: the one saved in this browser, else the local dev file
const activeKey = () => st.settings.key || (LOCAL.key && providerOfKey(LOCAL.key) === st.settings.provider ? LOCAL.key : '');
const configured = () => st.settings.enabled && !!(st.settings.proxy || activeKey());

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------
const SYSTEM_PROMPT = `너는 픽셀 아트 방치형 게임 "팔팔마을"의 대사 작가다. 현대 한국의 작은 동네 팔팔마을에 사는 주민 두 명(A, B)이 마주쳐 나누는 짧은 대화를 쓴다.

## 마을
집 8채, 팔팔25(편의점, 사장 홍의준), 팔팔식당(돈까스·우동·튀김, 요리사 조범기), 팔팔카페(사장 한가윤), 팔팔 스터디카페, 팔팔고등학교, 팔팔파출소(경위 정의겸), 팔팔팔병원, 팔팔체육관, 중앙광장(분수), 하천 산책로.

## 팔팔법과 마을 규칙
- 모든 집과 건물에 비밀번호가 있다. 주인이 없으면 비번을 아는 사람만 들어갈 수 있다. 무단출입·절도는 신고되면 정의겸이 처리한다.
- 조이준은 가끔 주민을 납치하고, 정의겸이 그날 안에 구출한 뒤 마음이 여려서 풀어준다. 이 마을의 블랙코미디 설정이니 가볍고 웃기게 다루고, 폭력 묘사는 하지 않는다.
- 연인은 한 명만. 꼬시기는 자유라 바람이 날 수 있다.
- 하세린과 곽현지는 19살 고등학생이다. 이 둘이 나오는 대화에는 연애, 플러팅, 성적인 내용을 절대 넣지 않고, 성인도 이 둘에게 플러팅하지 않는다.

## 대사 작성 규칙
- 2~4줄. 한 줄은 30자 이내의 짧고 자연스러운 한국어 구어체로, 이모지는 가끔만 쓴다.
- 각 인물의 성격, 말투 예시, 나이, 관계, 지금 하는 일, 기분, 기억에 맞게 쓴다. 과묵한 사람은 짧게, 까칠한 사람은 까칠하게 말한다.
- 기억과 최근 마을 소식을 적극 활용한다. 지난 약속, 추천받은 장소, 들은 소문을 자연스럽게 언급하면 좋다.
- 같은 대화를 반복하지 말고, 게임 밖 이야기나 메타 발언은 하지 않는다.

## 행동 (action)
대화의 결과로 일어날 행동을 최대 하나 고른다. 대화 내용과 맞아야 한다.
- none: 그냥 수다.
- promise: 둘이 나중에 같이 하기로 약속한다(action_place: restaurant_meal, cafe_visit, river_walk, plaza_walk 중 하나). 입력의 can_promise가 true일 때만 고른다.
- recommend: action_by가 상대에게 장소를 추천한다(action_place: restaurant_meal, cafe_visit, river_walk, plaza_walk, store_shop, gym_visit, fountain).
- share_password: action_by가 자기 집 비번을 알려준다. 입력의 can_share_password에 그 사람(A 또는 B)이 있을 때만 고른다. 대사에 숫자 비번은 쓰지 않는다.
- gossip: action_by가 소문을 전한다. 입력의 gossip 목록에서 from이 action_by인 항목의 id를 gossip_id에 넣는다.
- flirt: action_by가 상대에게 플러팅한다. 입력의 adults가 true일 때만 고른다.
쓰지 않는 필드는 action_place "none", gossip_id "" 로 둔다.

## 그 밖의 출력 필드
- relationship_change: 이 대화로 바뀐 호감도. -5~5 사이의 정수.
- memory_a, memory_b: 각자 이 대화에서 기억할 짧은 한 문장(20자 이내, 그 사람 시점).`;

const CHAT_SCHEMA = {
  type: 'object',
  properties: {
    lines: {
      type: 'array',
      items: {
        type: 'object',
        properties: { speaker: { type: 'string', enum: ['A', 'B'] }, text: { type: 'string' } },
        required: ['speaker', 'text'],
        additionalProperties: false,
      },
    },
    action: { type: 'string', enum: ['none', 'promise', 'recommend', 'share_password', 'gossip', 'flirt'] },
    action_by: { type: 'string', enum: ['A', 'B'] },
    action_place: { type: 'string', enum: ['none', 'restaurant_meal', 'cafe_visit', 'river_walk', 'plaza_walk', 'store_shop', 'gym_visit', 'fountain'] },
    gossip_id: { type: 'string' },
    relationship_change: { type: 'integer' },
    memory_a: { type: 'string' },
    memory_b: { type: 'string' },
  },
  required: ['lines', 'action', 'action_by', 'action_place', 'gossip_id', 'relationship_change', 'memory_a', 'memory_b'],
  additionalProperties: false,
};

function profile(a) {
  const d = a.def, p = partnerOf(a);
  return {
    이름: d.name, 나이: d.age, 성별: d.gender === 'F' ? '여' : '남', 직업: d.role, 성격: d.traits,
    말투_예시: [...d.lines, ...(d.closeLines || [])].slice(0, 6),
    지금_하는_일: a.act ? a.act.def.label : '쉬는 중',
    기분: Math.round(a.mood), 에너지: Math.round(a.energy),
    연인: p ? p.def.name : '없음',
  };
}
function memoriesOf(a, other) {
  const about = a.mem.filter((m) => m.with === other.id || m.about === other.id);
  const rest = a.mem.filter((m) => !about.includes(m));
  return [...about.slice(0, 5), ...rest.slice(0, 3)].map((m) => `${dayOf(m.t)}일: ${m.text}`);
}
function gossipCandidates(a, b) {
  const out = [];
  for (const [x, y, tag] of [[a, b, 'A'], [b, a, 'B']]) {
    for (const m of x.mem) {
      if (m.kind !== 'news' || m.about === y.id || m.about === x.id || memHasNews(y, m.nid)) continue;
      if (Sim.minute - m.t > 3 * 1440 || out.length >= 4) continue;
      out.push({ id: `n${m.nid}`, from: tag, text: m.text, _m: m });
    }
  }
  return out;
}

function buildContext(a, b, place) {
  const slot = findFreeSlot(a, b);
  const gossip = gossipCandidates(a, b);
  const pw = [[a, b, 'A'], [b, a, 'B']].filter(([x, y]) => canSharePw(x, y)).map(([, , t]) => t);
  const rel = a.rel[b.id] || 0;
  const input = {
    시간: `${dateStr(Sim.minute)} ${clockStr(Sim.minute)}`, 장소: place, 날씨: Sim.weather === 'rain' ? '소나기' : '맑음',
    A: profile(a), B: profile(b),
    관계: { 호감도: Math.round(rel), 단계: relLabel(rel), 연애상태: relStatus(a, b) || '없음' },
    A의_기억: memoriesOf(a, b), B의_기억: memoriesOf(b, a),
    최근_마을_소식: Sim.townLog.filter((l) => !l.text.includes('Lv.')).slice(0, 6).map((l) => l.text),
    gossip: gossip.map(({ id, from, text }) => ({ id, from, text })),
    can_promise: slot !== null && !hasPromise(a, b),
    can_share_password: pw,
    adults: adult(a) && adult(b),
  };
  return { input, slot, gossip, pw };
}

// ---------------------------------------------------------------------------
// API call
// ---------------------------------------------------------------------------
async function getClient() {
  if (!st.Anthropic) st.Anthropic = (await import(SDK_URL)).default;
  if (!st.client) st.client = new st.Anthropic({ apiKey: activeKey(), dangerouslyAllowBrowser: true, maxRetries: 1 });
  return st.client;
}

// OpenRouter (OpenAI-style chat completions) request body
function buildOpenRouter(userText, maxTokens = 600) {
  return {
    provider: 'openrouter', // read by the server proxy; ignored by OpenRouter
    model: st.settings.model,
    max_tokens: maxTokens,
    temperature: 0.9,
    messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: userText }],
    response_format: { type: 'json_schema', json_schema: { name: 'npc_chat', strict: true, schema: CHAT_SCHEMA } },
    reasoning: { enabled: false },
    usage: { include: true },
  };
}

function buildParams(userText, maxTokens = 2000) {
  if (st.settings.provider === 'openrouter') return buildOpenRouter(userText);
  const model = st.settings.model;
  const params = {
    model,
    max_tokens: maxTokens,
    system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: userText }],
    output_config: { effort: AI_CONFIG.effort, format: { type: 'json_schema', schema: CHAT_SCHEMA } },
  };
  // server-side refusal fallback (Claude API): route declined requests to Anthropic's recommended model
  if (model === 'claude-opus-5-5' || model === 'claude-sonnet-5-5') {
    params.betas = ['server-side-fallback-2026-07-01'];
    params.fallbacks = 'default';
  }
  return params;
}

async function callOpenRouter(params) {
  const { provider, ...body } = params;
  const res = await fetch(AI_CONFIG.providers.openrouter.url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${activeKey()}`, 'Content-Type': 'application/json', 'HTTP-Referer': location.origin, 'X-Title': 'PalPal Village' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    const err = new Error((data.error && data.error.message) || `openrouter ${res.status}`);
    err.status = (data.error && data.error.code) || res.status;
    throw err;
  }
  return data;
}

// normalize both API shapes to { text, refused, usage, cost }
function readResponse(resp) {
  if (resp.choices) {
    const c = resp.choices[0] || {};
    const u = resp.usage || {};
    return { text: (c.message && c.message.content) || '', refused: c.finish_reason === 'content_filter', inTok: u.prompt_tokens || 0, outTok: u.completion_tokens || 0, cost: u.cost };
  }
  const u = resp.usage || {};
  const block = (resp.content || []).find((b) => b.type === 'text');
  return { text: block ? block.text : '', refused: resp.stop_reason === 'refusal', inTok: (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0), outTok: u.output_tokens || 0, usage: u };
}

async function callModel(params) {
  if (st.settings.proxy) {
    const res = await fetch(st.settings.proxy, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(params) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { const err = new Error(body.error || `proxy ${res.status}`); err.status = res.status; throw err; }
    return body;
  }
  if (st.settings.provider === 'openrouter') return callOpenRouter(params);
  const client = await getClient();
  if (params.betas) return client.beta.messages.create(params);
  return client.messages.create(params);
}

function track(r) {
  st.inTok += r.inTok; st.outTok += r.outTok;
  if (typeof r.cost === 'number') { st.cost += r.cost; return; } // OpenRouter reports the exact cost
  const models = AI_CONFIG.providers.anthropic.models;
  const m = models.find((x) => x.id === st.settings.model) || models[0];
  const u = r.usage || {};
  const input = u.input_tokens || 0, cr = u.cache_read_input_tokens || 0, cw = u.cache_creation_input_tokens || 0;
  st.cost += (input * m.in + cr * m.in * 0.1 + cw * m.in * 1.25 + r.outTok * m.out) / 1e6;
}

function handleError(e) {
  st.errors++;
  const A = st.Anthropic;
  const status = e && e.status;
  if ((A && e instanceof A.AuthenticationError) || status === 401) { st.lastError = 'API 키가 올바르지 않아요'; st.pausedUntil = Infinity; }
  else if (status === 402) { st.lastError = '크레딧이 부족해요 (OpenRouter 충전 필요)'; st.pausedUntil = Infinity; }
  else if ((A && e instanceof A.PermissionDeniedError) || status === 403) { st.lastError = '이 키로는 해당 모델을 쓸 수 없어요'; st.pausedUntil = Infinity; }
  else if ((A && e instanceof A.RateLimitError) || status === 429) { st.lastError = '요청이 너무 많아요 (잠시 쉬는 중)'; st.pausedUntil = performance.now() + 30000; }
  else if ((A && e instanceof A.BadRequestError) || status === 400) { st.lastError = `요청 오류: ${e.message}`; st.pausedUntil = performance.now() + 60000; }
  else { st.lastError = `연결 오류: ${(e && e.message) || e}`; st.pausedUntil = performance.now() + 15000; }
  console.warn('[NpcAI]', st.lastError, e);
}

async function request(userText, maxTokens) {
  st.inflight++; st.recent.push(performance.now()); st.dayCalls++; st.calls++;
  try {
    const r = readResponse(await callModel(buildParams(userText, maxTokens)));
    track(r);
    if (r.refused || !r.text) return null;
    st.lastError = '';
    return JSON.parse(r.text.replace(/^```(?:json)?\s*|\s*```$/g, ''));
  } catch (e) {
    handleError(e);
    return null;
  } finally {
    st.inflight--;
  }
}

// ---------------------------------------------------------------------------
// Turning the model's answer into game actions
// ---------------------------------------------------------------------------
function applyResult(a, b, res, ctx) {
  const who = (t) => (t === 'B' ? b : a);
  const lines = (res.lines || []).filter((l) => l && l.text).slice(0, 6).map((l) => [who(l.speaker), String(l.text).slice(0, 60)]);
  if (!lines.length) return null;
  const after = () => {
    changeRel(a, b, clamp(Math.round(res.relationship_change || 0), -5, 5));
    if (res.memory_a) memAdd(a, { kind: 'chat', with: b.id, text: String(res.memory_a).slice(0, 80) });
    if (res.memory_b) memAdd(b, { kind: 'chat', with: a.id, text: String(res.memory_b).slice(0, 80) });
    const x = who(res.action_by), y = x === a ? b : a, tag = x === a ? 'A' : 'B';
    switch (res.action) {
      case 'promise': if (ctx.slot !== null) makePromise(x, y, res.action_place, ctx.slot); break;
      case 'recommend': doRecommend(x, y, res.action_place); break;
      case 'share_password': if (ctx.pw.includes(tag)) doSharePw(x, y); break;
      case 'gossip': {
        const g = ctx.gossip.find((c) => c.id === res.gossip_id && c.from === tag);
        if (g) doGossip(x, y, g._m);
        break;
      }
      case 'flirt':
        if (adult(x) && adult(y)) {
          x.stat('flirts');
          logTown(`😏 ${josa(x.def.name, '이/가')} ${y.def.name}에게 플러팅했다…${partnerOf(x) ? ' (연인 있는데?!)' : ''}`, x.id);
          romanceAfterChat(x, y, 1.5);
        }
        break;
      default: break;
    }
  };
  return { lines, after };
}

// ---------------------------------------------------------------------------
// Public API (used by sim.js / ui.js)
// ---------------------------------------------------------------------------
const NpcAI = {
  configured,
  canRequest(scale = 1) {
    if (!configured()) return false;
    const now = performance.now();
    if (now < st.pausedUntil || st.inflight >= AI_CONFIG.maxConcurrent) return false;
    if (st.day !== dayOf(Sim.minute)) { st.day = dayOf(Sim.minute); st.dayCalls = 0; }
    const f = AI_CONFIG.frequency[st.settings.freq] || AI_CONFIG.frequency.normal;
    if (st.dayCalls >= f.perDay) return false;
    st.recent = st.recent.filter((t) => now - t < 60000);
    if (st.recent.length >= AI_CONFIG.perRealMinute) return false;
    return Math.random() < f.chance * scale;
  },
  // -> Promise<{lines: [[agent, text]], after: fn} | null>
  async converse(a, b, place) {
    const ctx = buildContext(a, b, place);
    const res = await request(JSON.stringify(ctx.input));
    return res ? applyResult(a, b, res, ctx) : null;
  },
  status() {
    const s = st.settings;
    return {
      enabled: s.enabled, configured: configured(), mode: s.proxy ? 'proxy' : s.key ? 'key' : activeKey() ? 'local' : 'none',
      keyHint: s.key ? `${s.key.slice(0, 7)}…${s.key.slice(-4)}` : '', provider: s.provider, model: s.model, freq: s.freq, proxy: s.proxy,
      calls: st.calls, dayCalls: st.dayCalls, inTok: st.inTok, outTok: st.outTok, cost: st.cost, errors: st.errors,
      lastError: st.lastError, paused: performance.now() < st.pausedUntil,
    };
  },
  save(patch) {
    if (patch.key) { patch.key = String(patch.key).trim(); const p = providerOfKey(patch.key); if (p) patch.provider = p; }
    if (patch.provider && patch.provider !== st.settings.provider) {
      const models = AI_CONFIG.providers[patch.provider].models;
      if (!models.some((m) => m.id === (patch.model || st.settings.model))) patch.model = AI_CONFIG.providers[patch.provider].defaultModel;
    }
    Object.assign(st.settings, patch);
    persist();
    st.client = null; st.pausedUntil = 0; st.lastError = '';
  },
  forgetKey() { st.settings.key = ''; persist(); st.client = null; },
  // one tiny request to check the key / model
  async test() {
    const [a, b] = [Sim.byId.han_gayun, Sim.byId.hong_uijun];
    st.pausedUntil = 0;
    const r = await NpcAI.converse(a, b, '팔팔25 (연결 테스트)');
    if (!r) return { ok: false, msg: st.lastError || '응답을 받지 못했어요' };
    return { ok: true, msg: r.lines.map(([x, t]) => `${x.def.short}: ${t}`).join('\n') };
  },
};
window.NpcAI = NpcAI;
