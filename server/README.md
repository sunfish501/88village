# 팔팔마을 NPC AI 프록시 (선택)

게임 안 **🤖 AI → API 키 입력**만으로도 AI NPC가 동작합니다. 그 키는 입력한 브라우저에만 저장됩니다.

이 폴더는 **친구들도 키 없이** AI NPC를 보게 하고 싶을 때 쓰는 Cloudflare Worker입니다. 키는 서버 비밀값으로만 보관되고, 게임에서 보내는 형태의 요청만 AI API(OpenRouter 또는 Anthropic)로 전달합니다. 허용된 모델·출처만 받고, `max_tokens`는 2000까지, IP당 분당 30회로 제한합니다.

## 배포 (한 번만)

```bash
cd server
npm install
npx wrangler login
npx wrangler secret put OPENROUTER_API_KEY   # OpenRouter(DeepSeek) 키. Claude를 쓰면 ANTHROPIC_API_KEY
npx wrangler deploy
```

- `secret put` 단계에서 API 키를 붙여 넣습니다(OpenRouter `sk-or-…` 또는 Anthropic `sk-ant-…`). 키는 파일에 남지 않습니다.
- 배포가 끝나면 `https://palpal-npc.<내-서브도메인>.workers.dev` 주소가 나옵니다.
- `../game/js/ai-config.js`의 `proxyUrl`에 그 주소를 넣고 커밋·푸시하면 끝입니다.
- 이제 게임을 여는 모든 사람에게 AI NPC가 켜집니다.

## 비용 관리

- 키별 사용 한도를 걸어두세요: OpenRouter는 [Keys 설정](https://openrouter.ai/settings/keys)의 credit limit, Anthropic은 [Console](https://console.anthropic.com)의 spend limit.
- 게임 쪽 빈도 기본값은 하루 80회입니다. `ai-config.js`의 `frequency` 값으로 줄일 수 있습니다.
- 더 강한 남용 방지가 필요하면 Cloudflare 대시보드에서 Rate Limiting 규칙을 추가하세요.
- 다른 도메인에서 게임을 호스팅하면 `wrangler.toml`의 `ALLOWED_ORIGINS`에 추가합니다.
