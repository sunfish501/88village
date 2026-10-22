"""Palpal village (Beomkiki) character generator.

Sprite format follows joonspk-research/generative_agents:
  - one 32x32 frame per pose
  - sheet 96x128 = 3 walk frames (cols) x 4 directions (rows: down, left, right, up)
  - Phaser atlas.json with "down", "down-walk.000".. keys
  - persona/<name>/bootstrap_memory/scratch.json identity fields

Run:  python tools/generate_characters.py
"""
import json
import os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_SPRITES = os.path.join(ROOT, "characters", "sprites")
OUT_PORTRAITS = os.path.join(ROOT, "characters", "portraits")
OUT_PERSONAS = os.path.join(ROOT, "characters", "personas")
OUT_PREVIEW = os.path.join(ROOT, "characters", "preview")

F = 32  # frame size
DIRS = ["down", "left", "right", "up"]
OUTLINE = (34, 24, 30, 255)


def hexc(h, a=255):
    h = h.lstrip("#")
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), a)


def shade(c, k):
    return tuple(max(0, min(255, int(v * k))) for v in c[:3]) + (255,)


# ---------------------------------------------------------------------------
# Character definitions
# ---------------------------------------------------------------------------
CHARACTERS = [
    {
        "id": "han_gayun", "name": "한가윤", "en": "Han Gayun", "gender": "F", "age": 24,
        "skin": "#f6d3b8", "hair": "#6b3e26", "hair_style": "long", "eye": "#3b2a20",
        "top": "#f4efe6", "sleeve": "#f4efe6", "pants": "#3d4a6b", "shoes": "#5a3b2e",
        "accent": {"type": "apron", "color": "#4f8a5b"},
        "extras": ["blush", "lashes"],
        "role": "팔팔카페 사장",
        "innate": "밝음, 외향형, 다정함",
        "learned": "한가윤은 팔팔마을에서 작은 카페 '팔팔카페'를 운영하는 24살 사장이다. 밝은 성격 덕에 손님들과 금방 친해진다.",
        "currently": "한가윤은 평일마다 아침부터 저녁까지 카페를 운영하고, 주말에는 쉰다.",
        "lifestyle": "한가윤은 평일 오전 7시에 일어나 8시에 카페 문을 열고 저녁 7시에 마감한 뒤 집에 간다. 주말엔 자유롭게 지낸다.",
        "living_area": "팔팔마을:가윤네 집",
        "daily_plan_req": "한가윤은 평일 아침부터 저녁까지 팔팔카페를 운영한다.",
    },
    {
        "id": "ha_serin", "name": "하세린", "en": "Ha Serin", "gender": "F", "age": 19,
        "skin": "#fbe0c8", "hair": "#1a1820", "hair_style": "long", "eye": "#2a2030",
        "top": "#2a3550", "sleeve": "#2a3550", "pants": "#5a5f78", "shoes": "#2a2020",
        "accent": {"type": "uniform", "color": "#c8343c"},
        "extras": ["lashes", "skirt"],
        "role": "팔팔고 3학년",
        "innate": "까칠함, 철벽녀, 외향형",
        "learned": "하세린은 팔팔고등학교 3학년이다. 성격이 까칠하고 철벽을 치지만 친구들과 어울리는 건 좋아한다. 지각을 자주 한다.",
        "currently": "하세린은 수능을 준비하며 방과 후 하루 종일 스터디카페에서 공부한다.",
        "lifestyle": "하세린은 평일 오전 7시에 일어나 9시까지 등교하고, 하교 후 스터디카페에서 공부하다가 팔팔25에서 대충 밥을 먹고 집에 가서 잔다. 주말엔 마음대로 논다.",
        "living_area": "팔팔마을:세린네 집",
        "daily_plan_req": "하세린은 9시까지 등교하고 하교 후 스터디카페에서 공부한다.",
    },
    {
        "id": "han_seunghwa", "name": "한승화", "en": "Han Seunghwa", "gender": "M", "age": 31,
        "skin": "#f1cba9", "hair": "#22201e", "hair_style": "short", "eye": "#24201c",
        "top": "#3a3f4a", "sleeve": "#3a3f4a", "pants": "#33373f", "shoes": "#1a1a1a",
        "accent": {"type": "suit", "color": "#2c4a8a"},
        "extras": ["glasses"],
        "role": "회사원 (마을 밖 회사)",
        "innate": "조용함, 내향형, 친해지면 수다쟁이",
        "learned": "한승화는 마을 밖 회사에 다니는 회사원이다. 처음엔 말이 없지만 친해지면 말이 많아진다. 야식을 좋아한다.",
        "currently": "한승화는 평일엔 출근해서 저녁 6시 반이 넘어서야 마을로 돌아오며, 가끔 야근을 한다.",
        "lifestyle": "한승화는 평일 오전 7시에 일어나 9시까지 출근하고, 6시에 퇴근해 저녁을 먹고 6시 30분 이후 집에 온다.",
        "living_area": "팔팔마을:승화네 집",
        "daily_plan_req": "한승화는 9시까지 마을 밖 회사로 출근한다.",
    },
    {
        "id": "jo_beomgi", "name": "조범기", "en": "Jo Beomgi", "gender": "M", "age": 45,
        "skin": "#eec3a0", "hair": "#2a2420", "hair_style": "short", "eye": "#2a1e16",
        "top": "#2b3a55", "sleeve": "#2b3a55", "pants": "#3a3e48", "shoes": "#3a3030",
        "accent": {"type": "apron", "color": "#ece6d8"},
        "hat": {"type": "headband", "color": "#f4f4f0"},
        "extras": ["mustache", "wide"],
        "role": "팔팔식당 요리사",
        "innate": "과묵함, 내향형, 장인정신",
        "learned": "조범기는 마을 유일의 식당 '팔팔식당'에서 돈까스, 우동, 튀김 요리를 만드는 요리사다. 말수가 거의 없다.",
        "currently": "조범기는 월요일을 제외한 매일 낮부터 밤까지 식당에서 일한다.",
        "lifestyle": "조범기는 퇴근길에 항상 팔팔25에서 맥주 한 캔을 사 마시고 집에 간다.",
        "living_area": "팔팔마을:범기네 집",
        "daily_plan_req": "조범기는 낮부터 밤까지 팔팔식당에서 돈까스를 튀긴다.",
    },
    {
        "id": "gwak_hyunji", "name": "곽현지", "en": "Gwak Hyunji", "gender": "F", "age": 19,
        "skin": "#e9b98f", "hair": "#5a3424", "hair_style": "ponytail", "eye": "#22160f",
        "top": "#d23b3b", "sleeve": "#d23b3b", "pants": "#1f2a44", "shoes": "#f2f2f2",
        "accent": {"type": "stripe", "color": "#ffffff"},
        "extras": ["blush", "lashes"],
        "role": "팔팔고 체육 특기생",
        "innate": "ENTP, 즉흥적, 에너지 넘침",
        "learned": "곽현지는 팔팔고등학교 체육 특기생이다. 생각을 많이 하지 않고 하고 싶은 대로 다닌다.",
        "currently": "곽현지는 매일 러닝과 체육관 훈련을 하고, 팔팔식당 돈까스를 먹는다.",
        "lifestyle": "곽현지는 아침 러닝 후 팔팔25에서 닭가슴살을 사고 체육관에 갔다가 팔팔식당에서 돈까스를 먹고 다시 체육관에 간 뒤 잠든다.",
        "living_area": "팔팔마을:현지네 집",
        "daily_plan_req": "곽현지는 아침 러닝 후 하루 종일 체육관에서 훈련한다.",
    },
    {
        "id": "jo_ijun", "name": "조이준", "en": "Jo Ijun", "gender": "M", "age": 67,
        "skin": "#efc8a6", "hair": "#c9c6c0", "hair_style": "receding", "eye": "#2a2420",
        "top": "#8a6a4a", "sleeve": "#8a6a4a", "pants": "#4a4038", "shoes": "#2e2420",
        "accent": {"type": "collar", "color": "#e8e0cc"},
        "extras": ["glasses", "beard", "wrinkles"],
        "role": "은퇴한 팔팔고 국어 교사",
        "innate": "ESTJ, 겉으론 활발, 속으론 치밀함",
        "learned": "조이준은 팔팔고등학교에서 국어를 가르치다 은퇴했다. 겉으로는 활발하고 생각이 없어 보이지만 모든 행동을 치밀한 계획 안에서 실행한다.",
        "currently": "조이준은 매일 아침 팔팔고를 방문해 무언가를 '스캔'하고 리스트를 작성한다.",
        "lifestyle": "조이준은 아침에 팔팔고를 방문하고, 하교 시간에 재방문한 뒤 귀가한다. 저녁엔 팔팔25에서 컵라면과 술을 먹는다.",
        "living_area": "팔팔마을:이준네 집",
        "daily_plan_req": "조이준은 아침에 팔팔고를 방문해 리스트를 작성한다.",
    },
    {
        "id": "hong_uijun", "name": "홍의준", "en": "Hong Uijun", "gender": "M", "age": 51,
        "skin": "#efc8a6", "hair": "#4a4642", "hair_style": "short", "eye": "#2a2016",
        "top": "#f4f4f2", "sleeve": "#f4f4f2", "pants": "#3e4450", "shoes": "#2a2a2a",
        "accent": {"type": "vest", "color": "#2f8a5a"},
        "extras": ["smile", "wide"],
        "role": "팔팔25 사장",
        "innate": "ISFJ, 온화함, 늘 웃는 얼굴",
        "learned": "홍의준은 편의점 팔팔25의 사장이다. 모든 사람에게 유하고 항상 웃는 얼굴이라 마을 주민 모두가 좋아한다.",
        "currently": "홍의준은 새벽부터 밤까지 편의점에서 점심과 저녁을 먹으며 근무한다.",
        "lifestyle": "홍의준은 새벽에 출근해 밤에 퇴근하고, 저녁 러닝을 한 뒤 귀가해 잠든다.",
        "living_area": "팔팔마을:의준네 집",
        "daily_plan_req": "홍의준은 새벽 5시에 팔팔25로 출근한다.",
    },
    {
        "id": "jung_uigyeom", "name": "정의겸", "en": "Jung Uigyeom", "gender": "M", "age": 27,
        "skin": "#f1cba9", "hair": "#1e1a18", "hair_style": "short", "eye": "#1e1610",
        "top": "#3c5aa6", "sleeve": "#3c5aa6", "pants": "#22305a", "shoes": "#151515",
        "accent": {"type": "badge", "color": "#f1c94a"},
        "hat": {"type": "police", "color": "#22305a"},
        "extras": ["smile"],
        "role": "팔팔파출소 경위",
        "innate": "ENFP, 열정적, 허당, 마음이 여림",
        "learned": "정의겸은 팔팔파출소 경위다. 항상 열심이고 웃고 있지만 굉장히 허당이라 업무를 제대로 못 하고, 마음이 여려 범인을 자주 풀어준다.",
        "currently": "정의겸은 연애를 하고 싶어서 가끔 플러팅을 시도한다.",
        "lifestyle": "정의겸은 파출소에서만 생활한다. 아침은 굶고, 저녁엔 팔팔25에서 컵라면을 사서 파출소로 돌아간다.",
        "living_area": "팔팔마을:팔팔파출소",
        "daily_plan_req": "정의겸은 하교 시간쯤 팔팔고 앞에서 순찰한다.",
    },
    {
        "id": "lee_yujin", "name": "이유진", "en": "Lee Yujin", "gender": "F", "age": 35,
        "skin": "#f4d0b4", "hair": "#3a2a24", "hair_style": "bob", "eye": "#2a1e18",
        "top": "#6fb3c4", "sleeve": "#f6f6f2", "pants": "#4a6a78", "shoes": "#f2f2f2",
        "accent": {"type": "jacket", "color": "#f6f6f2"},
        "extras": ["lashes", "smile"],
        "role": "팔팔팔병원 의사",
        "innate": "밝음, 일할 땐 진지모드, 환자 우선",
        "learned": "이유진은 팔팔팔병원의 35살 의사다. 평소엔 밝고 장난도 잘 치지만, 일하거나 다친 사람을 보면 바로 진지해져 일에 몰두한다.",
        "currently": "이유진은 월·수·금요일마다 마을을 돌며 외진을 나가고, 아픈 사람을 보면 바로 달려가 치료한다.",
        "lifestyle": "이유진은 아침 8시에 병원으로 출근해 저녁 7시에 퇴근한다. 월·수·금 오후엔 마을로 외진을 나간다.",
        "living_area": "팔팔마을:유진네 집",
        "daily_plan_req": "이유진은 낮에 팔팔팔병원에서 진료하고, 월·수·금엔 외진을 돈다.",
    },
]


# ---------------------------------------------------------------------------
# Pixel canvas helpers
# ---------------------------------------------------------------------------
class Canvas:
    def __init__(self):
        self.px = {}

    def set(self, x, y, c):
        if 0 <= x < F and 0 <= y < F:
            self.px[(x, y)] = c

    def rect(self, x0, y0, x1, y1, c):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                self.set(x, y, c)

    def erase(self, x, y):
        self.px.pop((x, y), None)

    def to_image(self):
        img = Image.new("RGBA", (F, F), (0, 0, 0, 0))
        filled = set(self.px)
        # auto outline: transparent pixel touching the silhouette
        for (x, y) in list(filled):
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                n = (x + dx, y + dy)
                if n not in filled and 0 <= n[0] < F and 0 <= n[1] < F:
                    img.putpixel(n, OUTLINE)
        for (x, y), c in self.px.items():
            img.putpixel((x, y), c)
        return img


def rounded_head(cv, x0, y0, x1, y1, c):
    cv.rect(x0, y0, x1, y1, c)
    for x, y in ((x0, y0), (x1, y0), (x0, y1), (x1, y1)):
        cv.erase(x, y)


# ---------------------------------------------------------------------------
# Body parts
# ---------------------------------------------------------------------------
def draw_shadow(img):
    sh = Image.new("RGBA", (F, F), (0, 0, 0, 0))
    d = ImageDraw.Draw(sh)
    d.ellipse((9, 28, 22, 31), fill=(0, 0, 0, 70))
    sh.alpha_composite(img)
    return sh


def draw_body_front(cv, ch, frame, back=False):
    top, sleeve = hexc(ch["top"]), hexc(ch["sleeve"])
    pants, shoes, skin = hexc(ch["pants"]), hexc(ch["shoes"]), hexc(ch["skin"])
    wide = "wide" in ch["extras"]
    bx0, bx1 = (9, 22) if wide else (10, 21)

    # legs (frame 0: left leg lifted, frame 2: right leg lifted)
    ly = {0: (-1, 0), 1: (0, 0), 2: (0, -1)}[frame]
    if "skirt" in ch["extras"]:
        sock = hexc("#22283a")
        cv.rect(12, 25, 13, 27 + ly[0], skin)
        cv.rect(18, 25, 19, 27 + ly[1], skin)
        cv.rect(12, 27 + ly[0], 13, 27 + ly[0], sock)
        cv.rect(18, 27 + ly[1], 19, 27 + ly[1], sock)
        cv.rect(10, 23, 21, 25, pants)
        for x in range(11, 21, 2):
            cv.set(x, 25, shade(pants, 0.78))
    else:
        cv.rect(11, 23, 14, 27 + ly[0], pants)
        cv.rect(17, 23, 20, 27 + ly[1], pants)
        cv.rect(11, 23, 20, 25, pants)
    cv.rect(11, 28 + ly[0], 14, 29 + ly[0], shoes)
    cv.rect(17, 28 + ly[1], 20, 29 + ly[1], shoes)
    cv.rect(11, 29 + ly[0], 14, 29 + ly[0], shade(shoes, 0.7))
    cv.rect(17, 29 + ly[1], 20, 29 + ly[1], shade(shoes, 0.7))

    # torso
    cv.rect(bx0, 16, bx1, 23, top)
    cv.rect(bx0, 23, bx1, 23, shade(top, 0.8))

    # arms swing opposite to legs
    ay = {0: (0, 1), 1: (0, 0), 2: (1, 0)}[frame]
    cv.rect(bx0 - 2, 16, bx0 - 1, 21 + ay[0], sleeve)
    cv.rect(bx1 + 1, 16, bx1 + 2, 21 + ay[1], sleeve)
    cv.rect(bx0 - 2, 22 + ay[0], bx0 - 1, 22 + ay[0], skin)
    cv.rect(bx1 + 1, 22 + ay[1], bx1 + 2, 22 + ay[1], skin)
    cv.rect(bx0 - 1, 16, bx0 - 1, 21 + ay[0], shade(sleeve, 0.82))
    cv.rect(bx1 + 1, 16, bx1 + 1, 21 + ay[1], shade(sleeve, 0.82))

    acc = ch.get("accent")
    if not acc:
        return
    ac = hexc(acc["color"])
    t = acc["type"]
    if back:
        if t == "hood":
            cv.rect(bx0 + 2, 16, bx1 - 2, 19, ac)
        elif t == "jacket":
            cv.rect(bx0, 16, bx1, 23, ac)
            cv.rect(bx0 - 2, 16, bx0 - 1, 21 + ay[0], ac)
            cv.rect(bx1 + 1, 16, bx1 + 2, 21 + ay[1], ac)
        elif t == "apron":
            cv.rect(15, 17, 16, 18, ac)  # apron knot
        elif t == "stripe":
            cv.rect(bx0 - 2, 16, bx0 - 2, 21 + ay[0], ac)
            cv.rect(bx1 + 2, 16, bx1 + 2, 21 + ay[1], ac)
        elif t == "vest":
            cv.rect(bx0, 16, bx1, 23, ac)
        elif t == "uniform":
            cv.rect(13, 16, 18, 16, hexc("#f4f4f2"))
        return
    white = hexc("#f4f4f2")
    if t == "uniform":
        cv.rect(14, 16, 17, 18, white)
        cv.rect(15, 19, 16, 19, white)
        cv.rect(14, 18, 17, 18, ac)
        cv.rect(15, 19, 16, 20, ac)
        cv.set(12, 20, hexc("#d8c060"))  # school badge
    elif t == "suit":
        cv.rect(14, 16, 17, 18, white)
        cv.rect(15, 19, 16, 19, white)
        cv.rect(15, 17, 16, 22, ac)
        cv.set(15, 16, white)
        cv.set(16, 16, white)
    elif t == "vest":
        cv.rect(bx0, 16, 14, 23, ac)
        cv.rect(17, 16, bx1, 23, ac)
        cv.rect(11, 18, 13, 19, white)  # name tag
        cv.set(12, 18, hexc("#3a6ab8"))
    if t == "apron":
        cv.rect(12, 17, 19, 25, ac)
        cv.rect(13, 16, 13, 16, ac)
        cv.rect(18, 16, 18, 16, ac)
        cv.rect(14, 21, 17, 22, shade(ac, 0.8))  # pocket
    elif t == "hood":
        cv.rect(13, 16, 18, 16, ac)
        cv.set(14, 17, hexc("#f0f0f0"))
        cv.set(17, 17, hexc("#f0f0f0"))
        cv.rect(13, 20, 18, 22, shade(hexc(ch["top"]), 0.85))  # front pocket
    elif t == "buttons":
        for y in (17, 19, 21):
            cv.set(14, y, ac)
            cv.set(17, y, ac)
        cv.rect(14, 16, 17, 16, shade(hexc(ch["top"]), 0.88))
    elif t == "stripe":
        cv.rect(15, 16, 16, 23, ac)
        cv.rect(bx0 - 2, 16, bx0 - 2, 21 + ay[0], ac)
        cv.rect(bx1 + 2, 16, bx1 + 2, 21 + ay[1], ac)
    elif t == "collar":
        cv.rect(13, 16, 18, 17, ac)
        cv.rect(15, 17, 16, 23, shade(hexc(ch["top"]), 0.8))
        cv.set(15, 19, hexc("#d8c9a0"))
        cv.set(15, 21, hexc("#d8c9a0"))
    elif t == "jacket":
        cv.rect(bx0, 16, 13, 23, ac)
        cv.rect(18, 16, bx1, 23, ac)
        cv.rect(bx0 - 2, 16, bx0 - 1, 21 + ay[0], ac)
        cv.rect(bx1 + 1, 16, bx1 + 2, 21 + ay[1], ac)
        cv.set(13, 16, shade(ac, 0.75))
        cv.set(18, 16, shade(ac, 0.75))
    elif t == "badge":
        cv.rect(18, 18, 19, 19, ac)
        cv.rect(12, 16, 19, 16, shade(hexc(ch["top"]), 0.8))
        cv.rect(bx0, 22, bx1, 22, hexc("#1a1a1a"))  # belt
        cv.set(15, 22, ac)


def draw_body_side(cv, ch, frame):
    """Left-facing body."""
    top, sleeve = hexc(ch["top"]), hexc(ch["sleeve"])
    pants, shoes, skin = hexc(ch["pants"]), hexc(ch["shoes"]), hexc(ch["skin"])
    wide = "wide" in ch["extras"]
    bx0, bx1 = (11, 20) if wide else (12, 19)
    acc = ch.get("accent") or {}

    # legs
    if "skirt" in ch["extras"]:
        sock = hexc("#22283a")
        lx = {0: (12, 18), 1: (14, 16), 2: (18, 12)}[frame]
        for x in lx:
            cv.rect(x, 25, x + 1, 27, skin)
            cv.rect(x, 27, x + 1, 27, sock)
            cv.rect(x - 1, 28, x + 2, 29, shoes)
            cv.rect(x - 1, 29, x + 2, 29, shade(shoes, 0.7))
        cv.rect(bx0 - 1, 23, bx1 + 1, 25, pants)
        for x in range(bx0, bx1 + 1, 2):
            cv.set(x, 25, shade(pants, 0.78))
    elif frame == 1:
        cv.rect(13, 23, 18, 27, pants)
        cv.rect(12, 28, 18, 29, shoes)
        cv.rect(12, 29, 18, 29, shade(shoes, 0.7))
    else:
        front, back = ((11, 14), (17, 20)) if frame == 0 else ((17, 20), (11, 14))
        cv.rect(back[0], 23, back[1], 27, shade(pants, 0.8))
        cv.rect(back[0] - 1, 27, back[1], 28, shade(shoes, 0.75))
        cv.rect(front[0], 23, front[1], 27, pants)
        cv.rect(front[0] - 1, 28, front[1], 29, shoes)
        cv.rect(front[0] - 1, 29, front[1], 29, shade(shoes, 0.7))
        cv.rect(13, 23, 18, 24, pants)

    # torso
    tc = hexc(acc["color"]) if acc.get("type") == "jacket" else top
    cv.rect(bx0, 16, bx1, 23, tc)
    cv.rect(bx0, 23, bx1, 23, shade(tc, 0.8))
    if acc.get("type") == "apron":
        ac = hexc(acc["color"])
        cv.rect(bx0, 17, bx0 + 2, 25, ac)
        cv.rect(bx1 - 1, 18, bx1, 18, ac)
    elif acc.get("type") == "badge":
        cv.rect(bx0, 22, bx1, 22, hexc("#1a1a1a"))
        cv.rect(bx0 + 1, 18, bx0 + 2, 19, hexc(acc["color"]))
    elif acc.get("type") == "hood":
        cv.rect(bx1 - 3, 16, bx1, 18, hexc(acc["color"]))
    elif acc.get("type") == "collar":
        cv.rect(bx0, 16, bx0 + 3, 17, hexc(acc["color"]))
    elif acc.get("type") == "buttons":
        cv.set(bx0 + 1, 18, hexc(acc["color"]))
        cv.set(bx0 + 1, 20, hexc(acc["color"]))
    elif acc.get("type") in ("uniform", "suit"):
        cv.rect(bx0, 16, bx0 + 2, 18, hexc("#f4f4f2"))
        cv.rect(bx0, 18, bx0 + 1, 21, hexc(acc["color"]))
    elif acc.get("type") == "vest":
        cv.rect(bx0 + 2, 16, bx1, 23, hexc(acc["color"]))

    # arm swing: forward (left) on frame 0, back on frame 2
    sc = hexc(acc["color"]) if acc.get("type") == "jacket" else sleeve
    ax = {0: 12, 1: 14, 2: 17}[frame]
    cv.rect(ax, 16, ax + 2, 21, shade(sc, 0.9))
    cv.rect(ax, 22, ax + 2, 22, skin)
    if acc.get("type") == "stripe":
        cv.rect(ax + 1, 16, ax + 1, 21, hexc(acc["color"]))


# ---------------------------------------------------------------------------
# Head + hair
# ---------------------------------------------------------------------------
def draw_head(cv, ch, d):
    skin = hexc(ch["skin"])
    hair = hexc(ch["hair"])
    hs = ch["hair_style"]
    hd = shade(hair, 0.78)
    eye = hexc(ch["eye"])
    white = hexc("#ffffff")
    ex = ch["extras"]

    if d in ("down", "up"):
        rounded_head(cv, 9, 4, 22, 15, skin)
        cv.rect(10, 15, 21, 15, shade(skin, 0.9))
    else:
        rounded_head(cv, 10, 4, 21, 15, skin)
        cv.set(9, 11, skin)  # nose
        cv.rect(11, 15, 20, 15, shade(skin, 0.9))

    # ---- hair (drawn per direction; "left" coords) ----
    def cap(x0, x1):
        cv.rect(x0 + 2, 2, x1 - 2, 2, hair)
        cv.rect(x0, 3, x1, 7, hair)
        cv.erase(x0, 3)
        cv.erase(x1, 3)

    if d == "down":
        if hs != "receding":
            cap(9, 22)
        if hs == "long":
            cv.rect(9, 8, 22, 8, hair)
            cv.rect(8, 6, 10, 20, hair)
            cv.rect(21, 6, 23, 20, hair)
            cv.rect(8, 20, 10, 20, hd)
            cv.rect(21, 20, 23, 20, hd)
            for x in (13, 18):
                cv.set(x, 8, skin)
        elif hs == "bob":
            cv.rect(9, 8, 22, 8, hair)
            cv.rect(8, 6, 10, 14, hair)
            cv.rect(21, 6, 23, 14, hair)
            cv.rect(8, 14, 10, 14, hd)
            cv.rect(21, 14, 23, 14, hd)
        elif hs == "messy":
            cv.rect(9, 8, 22, 8, hair)
            for x in (11, 14, 17, 20):
                cv.set(x, 9, hair)
            cv.rect(9, 8, 9, 11, hair)
            cv.rect(22, 8, 22, 11, hair)
            cv.set(12, 1, hair)
            cv.set(19, 1, hair)
        elif hs == "short":
            cv.rect(9, 8, 10, 10, hair)
            cv.rect(21, 8, 22, 10, hair)
            cv.rect(11, 8, 20, 8, hd)
        elif hs == "spiky":
            for x in (10, 13, 16, 19, 22):
                cv.set(x, 1, hair)
                cv.set(x - 1, 2, hair)
            cv.rect(9, 8, 22, 8, hair)
            cv.rect(9, 8, 10, 10, hair)
            cv.rect(21, 8, 22, 10, hair)
            cv.set(15, 9, hair)
        elif hs == "swept":
            cv.rect(9, 8, 17, 8, hair)
            cv.rect(9, 9, 13, 9, hair)
            cv.rect(9, 8, 10, 12, hair)
            cv.rect(21, 8, 22, 10, hair)
            cv.rect(14, 3, 20, 3, shade(hair, 1.12))
        elif hs == "receding":
            cv.rect(11, 3, 20, 4, hair)
            cv.rect(9, 5, 10, 11, hair)
            cv.rect(21, 5, 22, 11, hair)
        elif hs == "ponytail":
            cv.rect(9, 8, 22, 8, hair)
            cv.rect(9, 8, 10, 11, hair)
            cv.rect(21, 8, 22, 11, hair)
            cv.set(14, 9, hair)
            cv.rect(23, 7, 24, 13, hair)   # tail peeking out
            cv.rect(23, 6, 24, 6, hexc("#e84a5a"))
        cv.rect(9, 7, 22, 7, hd) if hs not in ("receding", "swept") else None

        # face
        if "smile" in ex:
            for x0 in (11, 18):
                cv.set(x0, 11, eye); cv.set(x0 + 1, 10, eye); cv.set(x0 + 2, 11, eye)
            cv.rect(14, 13, 17, 13, shade(skin, 0.72))
            cv.rect(15, 14, 16, 14, shade(skin, 0.72))
        else:
            cv.rect(12, 10, 13, 11, eye)
            cv.rect(18, 10, 19, 11, eye)
            cv.set(12, 10, white)
            cv.set(18, 10, white)
        cv.rect(15, 13, 16, 13, shade(skin, 0.72))
        if "lashes" in ex:
            cv.set(11, 9, eye)
            cv.set(20, 9, eye)
        if "blush" in ex:
            cv.set(11, 12, hexc("#f2a0a0"))
            cv.set(20, 12, hexc("#f2a0a0"))
        if "glasses" in ex:
            g = hexc("#3a3a44")
            for x0 in (11, 17):
                cv.rect(x0, 9, x0 + 3, 9, g)
                cv.rect(x0, 12, x0 + 3, 12, g)
                cv.set(x0, 10, g); cv.set(x0, 11, g)
                cv.set(x0 + 3, 10, g); cv.set(x0 + 3, 11, g)
            cv.rect(15, 10, 16, 10, g)
            lens = hexc("#cfe3f0")
            for x0 in (12, 18):
                cv.rect(x0, 10, x0 + 1, 11, lens)
            cv.set(13, 11, eye)
            cv.set(18, 11, eye)
        if "mustache" in ex:
            cv.rect(13, 12, 18, 12, hair if hs != "receding" else hexc("#9a958c"))
            cv.rect(15, 13, 16, 13, shade(skin, 0.72))
        if "beard" in ex:
            bc = hexc("#d8d4cc")
            cv.rect(12, 14, 19, 15, bc)
            cv.rect(14, 16, 17, 16, bc)
            cv.rect(15, 13, 16, 13, shade(skin, 0.72))
        if "wrinkles" in ex:
            cv.rect(13, 6, 18, 6, shade(skin, 0.85))
        if "earring" in ex:
            cv.set(8, 12, hexc("#f5d76e"))

    elif d == "up":
        cap(9, 22)
        cv.rect(9, 8, 22, 12, hair)
        if hs == "long":
            cv.rect(8, 6, 23, 20, hair)
            cv.rect(9, 18, 22, 20, hd)
        elif hs == "bob":
            cv.rect(8, 6, 23, 14, hair)
            cv.rect(8, 14, 23, 14, hd)
        elif hs == "receding":
            cv.rect(9, 3, 22, 12, hair)
            cv.rect(13, 3, 18, 5, skin)
        elif hs == "spiky":
            for x in (10, 13, 16, 19, 22):
                cv.set(x, 1, hair)
                cv.set(x - 1, 2, hair)
        elif hs == "messy":
            cv.set(12, 1, hair)
            cv.set(19, 1, hair)
        elif hs == "ponytail":
            cv.rect(14, 6, 17, 7, hexc("#e84a5a"))
            cv.rect(14, 8, 17, 18, hair)
            cv.rect(15, 18, 16, 19, hd)
        cv.rect(10, 13, 21, 13, hd)
        # ears
        cv.set(8, 10, skin); cv.set(23, 10, skin)

    else:  # left (right is mirrored later)
        cap(10, 21)
        cv.rect(15, 8, 21, 12, hair)   # back of head
        cv.rect(10, 8, 15, 8, hair)    # fringe
        cv.rect(14, 10, 15, 11, skin)  # ear
        cv.set(14, 10, shade(skin, 0.85))
        if hs == "long":
            cv.rect(16, 8, 22, 20, hair)
            cv.rect(16, 20, 22, 20, hd)
        elif hs == "bob":
            cv.rect(15, 8, 22, 14, hair)
            cv.rect(15, 14, 22, 14, hd)
            cv.rect(10, 8, 12, 9, hair)
        elif hs == "spiky":
            for x in (11, 14, 17, 20):
                cv.set(x, 1, hair)
                cv.set(x + 1, 2, hair)
            cv.set(22, 4, hair)
        elif hs == "messy":
            cv.set(10, 9, hair)
            cv.set(13, 1, hair)
            cv.set(22, 6, hair)
        elif hs == "swept":
            cv.rect(9, 7, 13, 8, hair)
            cv.set(9, 9, hair)
        elif hs == "ponytail":
            cv.rect(22, 5, 23, 6, hexc("#e84a5a"))
            cv.rect(22, 7, 24, 15, hair)
            cv.rect(23, 15, 24, 16, hd)
        elif hs == "receding":
            cv.rect(10, 3, 15, 8, skin)
            cv.rect(12, 2, 19, 3, hair)
            cv.rect(15, 4, 21, 12, hair)
            cv.rect(14, 10, 15, 11, skin)
        cv.rect(16, 12, 21, 12, hd)

        if "smile" in ex:
            cv.set(10, 11, eye); cv.set(11, 10, eye); cv.set(12, 11, eye)
            cv.rect(10, 13, 11, 13, shade(skin, 0.72))
        else:
            cv.rect(11, 10, 12, 11, eye)
            cv.set(11, 10, white)
            cv.set(11, 13, shade(skin, 0.72))
        if "lashes" in ex:
            cv.set(10, 9, eye)
        if "blush" in ex:
            cv.set(12, 12, hexc("#f2a0a0"))
        if "glasses" in ex:
            g = hexc("#3a3a44")
            cv.rect(10, 9, 13, 9, g)
            cv.rect(10, 12, 13, 12, g)
            cv.set(13, 10, g); cv.set(13, 11, g)
            cv.rect(14, 9, 15, 9, g)
            cv.rect(10, 10, 12, 11, hexc("#cfe3f0"))
            cv.set(11, 11, eye)
        if "mustache" in ex:
            cv.rect(9, 12, 12, 12, hair)
        if "beard" in ex:
            cv.rect(10, 13, 16, 15, hexc("#d8d4cc"))
            cv.set(11, 13, shade(skin, 0.72))
        if "earring" in ex:
            cv.set(14, 12, hexc("#f5d76e"))

    draw_hat(cv, ch, d)


def draw_hat(cv, ch, d):
    hat = ch.get("hat")
    if not hat:
        return
    c = hexc(hat["color"])
    side = d in ("left",)
    x0, x1 = (10, 21) if side else (9, 22)
    t = hat["type"]
    if t == "headband":
        cv.rect(x0, 6, x1, 7, c)
        cv.rect(x0, 7, x1, 7, shade(c, 0.85))
        if d == "down":
            cv.set(15, 6, hexc("#d8343c"))
        elif d == "up":
            cv.rect(15, 8, 16, 11, c)
            cv.set(14, 9, c); cv.set(17, 9, c)
        else:
            cv.rect(x1, 7, x1 + 2, 9, c)
        return
    if t == "chef":
        cv.rect(x0 + 1, 0, x1 - 1, 5, c)
        cv.rect(x0, 1, x1, 4, c)
        cv.rect(x0, 5, x1, 6, shade(c, 0.88))
        for x in range(x0 + 2, x1 - 1, 3):
            cv.set(x, 2, shade(c, 0.9))
    elif t == "police":
        cv.rect(x0, 2, x1, 6, c)
        cv.rect(x0 + 1, 1, x1 - 1, 1, c)
        cv.rect(x0, 6, x1, 6, shade(c, 0.7))
        if d == "down":
            cv.rect(14, 3, 17, 4, hexc("#f1c94a"))
            cv.rect(x0 + 1, 7, x1 - 1, 7, hexc("#111111"))
        elif d == "left":
            cv.rect(x0 - 2, 7, x0 + 4, 7, hexc("#111111"))
            cv.set(x0 + 1, 3, hexc("#f1c94a"))
    elif t == "beret":
        if d == "down":
            cv.rect(11, 1, 23, 3, c)
            cv.rect(10, 4, 22, 4, shade(c, 0.8))
            cv.set(16, 0, c)
        elif d == "up":
            cv.rect(9, 1, 23, 3, c)
            cv.rect(9, 4, 22, 4, shade(c, 0.8))
        else:
            cv.rect(11, 1, 23, 3, c)
            cv.rect(11, 4, 21, 4, shade(c, 0.8))
            cv.set(16, 0, c)


# ---------------------------------------------------------------------------
# Sheet assembly
# ---------------------------------------------------------------------------
def render_frame(ch, d, frame):
    cv = Canvas()
    if d in ("down", "up"):
        draw_body_front(cv, ch, frame, back=(d == "up"))
        draw_head(cv, ch, d)
    else:
        draw_body_side(cv, ch, frame)
        draw_head(cv, ch, "left")
    img = draw_shadow(cv.to_image())
    if d == "right":
        img = img.transpose(Image.FLIP_LEFT_RIGHT)
    return img


def build_sheet(ch):
    sheet = Image.new("RGBA", (F * 3, F * 4), (0, 0, 0, 0))
    for r, d in enumerate(DIRS):
        for c in range(3):
            sheet.alpha_composite(render_frame(ch, d, c), (c * F, r * F))
    return sheet


def build_atlas():
    frames = {}
    for r, d in enumerate(DIRS):
        frames[d] = {"frame": {"x": F, "y": r * F, "w": F, "h": F}}
        for i, c in enumerate([0, 1, 2, 1]):
            frames[f"{d}-walk.{i:03d}"] = {"frame": {"x": c * F, "y": r * F, "w": F, "h": F}}
    out = []
    for name, v in frames.items():
        out.append({"filename": name, "rotated": False, "trimmed": False,
                    "sourceSize": {"w": F, "h": F},
                    "spriteSourceSize": {"x": 0, "y": 0, "w": F, "h": F}, **v})
    return {"frames": out, "meta": {"description": "Beomkiki character atlas (shared by all sheets)",
                                    "size": {"w": F * 3, "h": F * 4}, "scale": "1"}}


def scratch_json(ch):
    first, last = ch["en"].split()[1], ch["en"].split()[0]
    return {
        "vision_r": 8, "att_bandwidth": 8, "retention": 8,
        "curr_time": None, "curr_tile": None,
        "daily_plan_req": ch["daily_plan_req"],
        "name": ch["name"], "name_en": ch["en"],
        "first_name": first, "last_name": last,
        "age": ch["age"], "gender": ch["gender"], "role": ch["role"],
        "innate": ch["innate"], "learned": ch["learned"],
        "currently": ch["currently"], "lifestyle": ch["lifestyle"],
        "living_area": ch["living_area"],
        "concept_forget": 100, "daily_reflection_time": 180, "daily_reflection_size": 5,
        "overlap_reflect_th": 2, "kw_strg_event_reflect_th": 4, "kw_strg_thought_reflect_th": 4,
        "recency_w": 1, "relevance_w": 1, "importance_w": 1, "recency_decay": 0.99,
        "importance_trigger_max": 150, "importance_trigger_curr": 150, "importance_ele_n": 0,
        "thought_count": 5,
        "daily_req": [], "f_daily_schedule": [], "f_daily_schedule_hourly_org": [],
        "act_address": None, "act_start_time": None, "act_duration": None,
        "act_description": None, "act_pronunciatio": None, "act_event": [ch["name"], None, None],
        "act_obj_description": None, "act_obj_pronunciatio": None, "act_obj_event": [None, None, None],
        "chatting_with": None, "chat": None, "chatting_with_buffer": {}, "chatting_end_time": None,
        "act_path_set": False, "planned_path": [],
        "sprite": f"characters/sprites/{ch['id']}.png",
        "portrait": f"characters/portraits/{ch['id']}.png",
    }


def font(size):
    for p in (r"C:\Windows\Fonts\malgunbd.ttf", r"C:\Windows\Fonts\malgun.ttf"):
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


def build_preview(sheets):
    S = 4
    cw, chh = F * 3 * S + 40, F * 4 * S + 110
    cols = 4
    img = Image.new("RGBA", (cw * cols, chh * ((len(sheets) + cols - 1) // cols)), hexc("#2b2f3a"))
    d = ImageDraw.Draw(img)
    f1, f2 = font(22), font(14)
    for i, (ch, sheet) in enumerate(sheets):
        ox, oy = (i % cols) * cw, (i // cols) * chh
        d.rounded_rectangle((ox + 8, oy + 8, ox + cw - 8, oy + chh - 8), 10, fill=hexc("#363b49"))
        big = sheet.resize((sheet.width * S, sheet.height * S), Image.NEAREST)
        img.alpha_composite(big, (ox + 20, oy + 20))
        gender = "♀" if ch["gender"] == "F" else "♂"
        d.text((ox + 20, oy + 20 + big.height + 8), f"{ch['name']} {gender} {ch['age']}세",
               font=f1, fill=hexc("#ffffff"))
        d.text((ox + 20, oy + 20 + big.height + 40), ch["role"], font=f2, fill=hexc("#c9cede"))
        d.text((ox + 20, oy + 20 + big.height + 62), ch["innate"], font=f2, fill=hexc("#9aa3b8"))
    return img


def main():
    for p in (OUT_SPRITES, OUT_PORTRAITS, OUT_PERSONAS, OUT_PREVIEW):
        os.makedirs(p, exist_ok=True)

    sheets = []
    for ch in CHARACTERS:
        sheet = build_sheet(ch)
        sheet.save(os.path.join(OUT_SPRITES, f"{ch['id']}.png"))
        # portrait: idle front frame, head crop, upscaled
        idle = sheet.crop((F, 0, F * 2, F))
        portrait = Image.new("RGBA", (F, F), hexc("#3a4255"))
        portrait.alpha_composite(idle.crop((4, -2, 28, 22)).resize((F, F), Image.NEAREST))
        portrait.resize((128, 128), Image.NEAREST).save(os.path.join(OUT_PORTRAITS, f"{ch['id']}.png"))

        pdir = os.path.join(OUT_PERSONAS, ch["id"], "bootstrap_memory")
        os.makedirs(pdir, exist_ok=True)
        with open(os.path.join(pdir, "scratch.json"), "w", encoding="utf-8") as fp:
            json.dump(scratch_json(ch), fp, ensure_ascii=False, indent=2)
        sheets.append((ch, sheet))

    with open(os.path.join(ROOT, "characters", "atlas.json"), "w", encoding="utf-8") as fp:
        json.dump(build_atlas(), fp, indent=2)
    with open(os.path.join(ROOT, "characters", "characters.json"), "w", encoding="utf-8") as fp:
        json.dump(CHARACTERS, fp, ensure_ascii=False, indent=2)
    build_preview(sheets).save(os.path.join(OUT_PREVIEW, "all_characters.png"))
    print(f"generated {len(CHARACTERS)} characters -> {os.path.join(ROOT, 'characters')}")


if __name__ == "__main__":
    main()
