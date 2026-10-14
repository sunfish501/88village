// Cloudflare Worker proxy for 팔팔마을 NPC AI.
// Keeps the Anthropic API key on the server (secret ANTHROPIC_API_KEY) so players need no key.
// Only the game's own request shape is forwarded; anything else is rejected.
import Anthropic from '@anthropic-ai/sdk';

const ALLOWED_MODELS = ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'];
const FALLBACK_MODELS = ['claude-opus-5-5', 'claude-sonnet-5-5']; // server-side refusal fallback ("default")
const MAX_TOKENS = 2000;
const MAX_BODY = 60000;
const GAME_PROMPT_PREFIX = '너는 픽셀 아트 방치형 게임 "팔팔마을"의 대사 작가다.';
const PER_IP_PER_MINUTE = 30;

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

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const { ok, headers } = corsHeaders(origin, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: ok ? 204 : 403, headers });
    if (request.method !== 'POST') return json({ error: 'POST only' }, 405, headers);
    if (!ok) return json({ error: 'origin not allowed' }, 403, headers);
    if (!env.ANTHROPIC_API_KEY) return json({ error: 'server has no ANTHROPIC_API_KEY secret' }, 500, headers);
    if (rateLimited(request.headers.get('CF-Connecting-IP') || 'unknown')) return json({ error: 'too many requests' }, 429, headers);

    const raw = await request.text();
    if (raw.length > MAX_BODY) return json({ error: 'request too large' }, 413, headers);
    let p;
    try { p = JSON.parse(raw); } catch (e) { return json({ error: 'bad json' }, 400, headers); }
    const problem = validate(p);
    if (problem) return json({ error: problem }, 400, headers);

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
