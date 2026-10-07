# 팔팔마을 캐릭터 (8명: 여 3 / 남 5)

[generative_agents](https://github.com/joonspk-research/generative_agents)의 에셋·페르소나 구조를 참고했습니다.

| ID | 이름 | 성별/나이 | 역할 |
|---|---|---|---|
| han_gayun | 한가윤 | 여 24 | 팔팔카페 사장 |
| ha_serin | 하세린 | 여 19 | 팔팔고 3학년 |
| han_seunghwa | 한승화 | 남 31 | 회사원 |
| jo_beomgi | 조범기 | 남 45 | 팔팔식당 요리사 |
| gwak_hyunji | 곽현지 | 여 19 | 팔팔고 체육 특기생 |
| jo_ijun | 조이준 | 남 67 | 은퇴한 팔팔고 국어 교사 |
| hong_uijun | 홍의준 | 남 51 | 팔팔25 사장 |
| jung_uigyeom | 정의겸 | 남 27 | 팔팔파출소 경위 |

## 파일 구조
- `sprites/<id>.png` — 96×128 스프라이트 시트. 프레임 32×32, 3열(걷기 0/대기 1/걷기 2) × 4행(down, left, right, up)
- `atlas.json` — Phaser 아틀라스 (모든 시트 공용)
- `portraits/<id>.png` — 128×128 초상화
- `personas/<id>/bootstrap_memory/scratch.json` — generative_agents 형식 페르소나
- `characters.json` — 전체 정의
- `preview/all_characters.png` — 미리보기

## 수정 / 재생성
`tools/generate_characters.py`의 `CHARACTERS`를 바꾼 뒤:

```
python tools/generate_characters.py
```

게임 속 일과·대사는 `game/js/data.js`에 있습니다.
