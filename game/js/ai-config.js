// NPC personality AI settings (Claude API).
//
// Two ways to switch it on:
//   1) In the game: ⚙️ AI 설정 -> paste an Anthropic API key. It is stored only in that browser.
//   2) For everyone (no key needed by players): deploy server/ (Cloudflare Worker that holds the key)
//      and put its URL in proxyUrl below. Players then get AI NPCs automatically.
const AI_CONFIG = {
  proxyUrl: '', // e.g. 'https://palpal-npc.<your-subdomain>.workers.dev'
  defaultModel: 'claude-opus-5-5',
  models: [
    // $ per 1M tokens (input / output) - used only for the in-game cost estimate
    { id: 'claude-opus-5-5', label: 'Claude Opus 5.5 (기본 · 최고 품질)', in: 4, out: 20 },
    { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5 (균형)', in: 2, out: 10 },
    { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5 (가장 저렴)', in: 0.1, out: 0.5 },
  ],
  // how often conversations go to the AI; the rest use the built-in rule-based dialogue
  frequency: {
    low: { label: '적게 (하루 30회)', perDay: 30, chance: 0.35 },
    normal: { label: '보통 (하루 80회)', perDay: 80, chance: 0.7 },
    high: { label: '많이 (하루 200회)', perDay: 200, chance: 1 },
  },
  maxConcurrent: 2,     // parallel requests
  perRealMinute: 20,    // hard cap per real-time minute (fast-forward safety)
  waitMs: 12000,        // how long an outdoor chat waits for the AI before falling back
  effort: 'low',        // short in-character chat lines: low effort keeps them quick and cheap
};
