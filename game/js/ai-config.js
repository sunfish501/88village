// NPC personality AI settings.
//
// Ways to switch it on:
//   1) In the game: 🤖 AI -> paste an API key (OpenRouter `sk-or-...` or Anthropic `sk-ant-...`).
//      It is stored only in that browser.
//   2) Local dev: put a key in js/ai-local.js (git-ignored, never committed; see ai-local.example.js).
//   3) For everyone (players need no key): deploy server/ (Cloudflare Worker holding the key as a
//      secret) and put its URL in proxyUrl below.
const AI_CONFIG = {
  proxyUrl: '', // e.g. 'https://palpal-npc.<your-subdomain>.workers.dev'
  defaultProvider: 'openrouter',
  providers: {
    openrouter: {
      label: 'OpenRouter',
      keyPrefix: 'sk-or-',
      url: 'https://openrouter.ai/api/v1/chat/completions',
      defaultModel: 'deepseek/deepseek-v4-flash',
      models: [
        { id: 'deepseek/deepseek-v4-flash', label: 'DeepSeek V4 Flash (기본 · 빠르고 아주 저렴)' },
        { id: 'deepseek/deepseek-v4-pro', label: 'DeepSeek V4 Pro (더 똑똑함)' },
      ],
    },
    anthropic: {
      label: 'Anthropic (Claude)',
      keyPrefix: 'sk-ant-',
      defaultModel: 'claude-opus-5-5',
      models: [
        // $ per 1M tokens (input / output) - used only for the in-game cost estimate
        { id: 'claude-opus-5-5', label: 'Claude Opus 5.5 (최고 품질)', in: 4, out: 20 },
        { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5 (균형)', in: 2, out: 10 },
        { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5 (저렴)', in: 0.1, out: 0.5 },
      ],
    },
  },
  // how often conversations go to the AI; the rest use the built-in rule-based dialogue
  frequency: {
    low: { label: '적게 (하루 30회)', perDay: 30, chance: 0.35 },
    normal: { label: '보통 (하루 80회)', perDay: 80, chance: 0.7 },
    high: { label: '많이 (하루 200회)', perDay: 200, chance: 1 },
  },
  maxConcurrent: 2,     // parallel requests
  perRealMinute: 20,    // hard cap per real-time minute (fast-forward safety)
  waitMs: 25000,        // how long an outdoor chat waits for the AI before falling back (DeepSeek ~6-10s)
  effort: 'low',        // Claude: short in-character chat lines -> low effort
};
