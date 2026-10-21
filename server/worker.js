// Cloudflare Worker proxy for 팔팔마을 NPC AI.
// Keeps the API key on the server so players need no key:
//   OpenRouter requests  -> secret OPENROUTER_API_KEY
//   Anthropic requests   -> secret ANTHROPIC_API_KEY
// Only the game's own request shape is forwarded; anything else is rejected.
import Anthropic from '@anthropic-ai/sdk';

const ALLOWED_MODELS = ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'];
const FALLBACK_MODELS = ['claude-opus-5-5', 'claude-sonnet-5-5']; // server-side refusal fallback ("default")
const MAX_TOKENS = 2000;
const MAX_BODY = 60000;
// all game prompts (dialogue writer, director, routine planner) start with this
const GAME_PROMPT_PREFIX = '너는 픽셀 아트 방치형 게임 "팔팔마을"의 ';
const PER_IP_PER_MINUTE = 30;
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_MODELS = ['deepseek/deepseek-v4-flash', 'deepseek/deepseek-v4-pro'];

const hits = new Map(); // best-effort per-isolate rate limit

function corsHeaders(origin, env) {
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const ok = allowed.length === 0 || allowed.includes(origin);
  return {
    ok,
    headers: {
      'Access-Control-Allow-Origin': ok ? origin || '*' : 'null',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'content-type',
      Vary: 'Origin',
    },
  };
}
const json = (body, status, headers) => new Response(JSON.stringify(body), { status, headers: { ...headers, 'content-type': 'application/json' } });

function rateLimited(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < 60000);
  list.push(now);
  hits.set(ip, list);
  return list.length > PER_IP_PER_MINUTE;
}

function validate(p) {
  if (!ALLOWED_MODELS.includes(p.model)) return 'model not allowed';
  if (!Array.isArray(p.messages) || p.messages.length !== 1 || p.messages[0].role !== 'user') return 'unexpected messages';
  if (p.tools || p.tool_choice) return 'tools not allowed';
  const sys = Array.isArray(p.system) ? p.system[0] && p.system[0].text : p.system;
  if (typeof sys !== 'string' || !sys.startsWith(GAME_PROMPT_PREFIX)) return 'unexpected system prompt';
  if (!p.output_config || !p.output_config.format || p.output_config.format.type !== 'json_schema') return 'structured output required';
  return null;
}

function validateOpenRouter(p) {
  if (!OPENROUTER_MODELS.includes(p.model)) return 'model not allowed';
  const m = p.messages;
  if (!Array.isArray(m) || m.length !== 2 || m[0].role !== 'system' || m[1].role !== 'user') return 'unexpected messages';
  if (typeof m[0].content !== 'string' || !m[0].content.startsWith(GAME_PROMPT_PREFIX)) return 'unexpected system prompt';
  if (p.tools || !p.response_format || p.response_format.type !== 'json_schema') return 'structured output required';
  return null;
}

async function forwardOpenRouter(p, env, headers) {
  if (!env.OPENROUTER_API_KEY) return json({ error: 'server has no OPENROUTER_API_KEY secret' }, 500, headers);
  const problem = validateOpenRouter(p);
  if (problem) return json({ error: problem }, 400, headers);
  const body = {
    model: p.model,
    max_tokens: Math.min(Number(p.max_tokens) || 1000, MAX_TOKENS),
    temperature: p.temperature,
    messages: p.messages,
    response_format: p.response_format,
    reasoning: p.reasoning,
    usage: { include: true },
  };
  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.OPENROUTER_API_KEY}`, 'Content-Type': 'application/json', 'X-Title': 'PalPal Village' },
    body: JSON.stringify(body),
  });
  return new Response(await res.text(), { status: res.status, headers: { ...headers, 'content-type': 'application/json' } });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const { ok, headers } = corsHeaders(origin, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: ok ? 204 : 403, headers });
    if (request.method !== 'POST') return json({ error: 'POST only' }, 405, headers);
    if (!ok) return json({ error: 'origin not allowed' }, 403, headers);
    if (rateLimited(request.headers.get('CF-Connecting-IP') || 'unknown')) return json({ error: 'too many requests' }, 429, headers);

    const raw = await request.text();
    if (raw.length > MAX_BODY) return json({ error: 'request too large' }, 413, headers);
    let p;
    try { p = JSON.parse(raw); } catch (e) { return json({ error: 'bad json' }, 400, headers); }
    if (p.provider === 'openrouter') return forwardOpenRouter(p, env, headers);
    const problem = validate(p);
    if (problem) return json({ error: problem }, 400, headers);
    if (!env.ANTHROPIC_API_KEY) return json({ error: 'server has no ANTHROPIC_API_KEY secret' }, 500, headers);

    const params = {
      model: p.model,
      max_tokens: Math.min(Number(p.max_tokens) || 1000, MAX_TOKENS),
      system: p.system,
      messages: p.messages,
      output_config: p.output_config,
    };
    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 1 });
    try {
      const resp = FALLBACK_MODELS.includes(p.model)
        ? await client.beta.messages.create({ ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' })
        : await client.messages.create(params);
      return json(resp, 200, headers);
    } catch (e) {
      if (e instanceof Anthropic.APIError) return json({ error: e.message }, e.status || 502, headers);
      return json({ error: 'upstream error' }, 502, headers);
    }
  },
};
