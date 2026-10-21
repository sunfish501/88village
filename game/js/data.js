// 팔팔마을 game data: skills, activities, characters, routines, chat lines.

const MINUTES_PER_SEC = 2;      // 1x speed: 1 real sec = 2 game minutes
const WALK_TILES_PER_MIN = 1.6; // walking speed in tiles per game minute
const START_MINUTE = 6 * 60;    // Day 1 (월), 06:00
const SEASONS = ['봄', '여름', '가을', '겨울'];
const WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일'];
const TOWN_NAME = '팔팔마을';

const SKILLS = {
  body:   { name: '체력', emoji: '💪', color: '#e8664f' },
  mind:   { name: '지능', emoji: '📘', color: '#4f86e8' },
  cook:   { name: '요리', emoji: '🍳', color: '#e8894f' },
  work:   { name: '업무', emoji: '💼', color: '#8a6a4a' },
  social: { name: '사교', emoji: '💬', color: '#3fb58a' },
  charm:  { name: '매력', emoji: '✨', color: '#e0508a' },
};
const MAX_LEVEL = 10;
const xpForLevel = (L) => Math.round(120 * Math.pow(L, 1.6)); // xp needed to go L -> L+1
function levelFromXp(xp) {
  let L = 1;
  while (L < MAX_LEVEL && xp >= xpForLevel(L)) { xp -= xpForLevel(L); L++; }
  return { level: L, into: xp, need: L < MAX_LEVEL ? xpForLevel(L) : 0 };
}
function xpForStartLevel(L) {
  let t = 0;
  for (let i = 1; i < L; i++) t += xpForLevel(i);
  return t;
}

// When each place is open: (weekday 0=월..6=일, hour) -> bool
const OPEN_HOURS = {
  cafe: (wd, h) => wd <= 4 && h >= 7.4 && h < 19,
  restaurant: (wd, h) => wd !== 0 && h >= 11 && h < 22,
  store: () => true,
  studycafe: () => true,
  police: () => true,
  gym: (wd, h) => h >= 6 && h < 22.5,
  hospital: (wd, h) => h >= 9 && h < 19,
  school: (wd, h) => wd <= 4 && h >= 6.5 && h < 17,
};

// loc: building id ('home' = own house) or spot group name.
// inside: agent disappears into the building.  busy: not interruptible by chats/gatherings.
// route: list of spot groups to walk.  xp per minute.  alt: fallback activity when the place is closed.
const ACTIVITIES = {
  sleep:        { label: '잠자는 중', emoji: '💤', loc: 'home', inside: true, energy: 0.22, busy: true },
  oversleep:    { label: '늦잠 자는 중…', emoji: '😴', loc: 'home', inside: true, energy: 0.2, busy: true },
  breakfast:    { label: '아침 식사', emoji: '🍚', loc: 'home', inside: true, energy: 0.1, mood: 0.05 },
  home_meal:    { label: '집밥 먹는 중', emoji: '🍚', loc: 'home', inside: true, energy: 0.1, mood: 0.05 },
  home_relax:   { label: '집에서 휴식', emoji: '🛋️', loc: 'home', inside: true, dur: [60, 120], energy: 0.06, mood: 0.08 },
  home_study:   { label: '집에서 공부', emoji: '📖', loc: 'home', inside: true, xp: { mind: 0.6 } },
  get_ready:    { label: '출근 준비', emoji: '👔', loc: 'home', inside: true, busy: true },
  school_ready: { label: '등교 준비', emoji: '🎒', loc: 'home', inside: true, busy: true },
  skip_meal:    { label: '아침 굶는 중', emoji: '🫠', loc: 'police', inside: true, mood: -0.02, busy: true },

  work_cafe:    { label: '팔팔카페 영업', emoji: '☕', loc: 'cafe', inside: true, busy: true, xp: { cook: 0.6, social: 0.5, work: 0.6 } },
  school_class: { label: '팔팔고 수업', emoji: '📚', loc: 'school', inside: true, busy: true, xp: { mind: 0.9, social: 0.2 } },
  studycafe:    { label: '스카에서 공부', emoji: '✏️', loc: 'studycafe', inside: true, busy: true, xp: { mind: 1.0 }, mood: -0.01 },
  quick_meal:   { label: '팔팔25에서 대충 끼니', emoji: '🍙', loc: 'store', inside: true, busy: true, errand: true, dur: [15, 25], energy: 0.08, stat: 'store' },
  commute:      { label: '회사 (마을 밖)', emoji: '🏢', loc: 'outside', inside: true, busy: true, xp: { work: 0.8 }, energy: -0.02 },
  late_snack:   { label: '야식 타임', emoji: '🍗', loc: 'store', inside: true, errand: true, dur: [20, 30], mood: 0.15, stat: 'snack' },
  work_restaurant: { label: '팔팔식당 주방', emoji: '🍤', loc: 'restaurant', inside: true, busy: true, xp: { cook: 1.0, work: 0.6 } },
  beer:         { label: '팔팔25 맥주 한 캔', emoji: '🍺', loc: 'store', inside: true, errand: true, dur: [15, 20], mood: 0.2, stat: 'beer' },
  run:          { label: '아침 러닝', emoji: '🏃', route: ['river', 'river', 'plaza', 'river'], energy: -0.05, xp: { body: 1.0 }, busy: true },
  chicken:      { label: '닭가슴살 구매', emoji: '🍗', loc: 'store', inside: true, busy: true, errand: true, dur: [8, 12], stat: 'chicken' },
  gym_train:    { label: '체육관 훈련', emoji: '🏋️', loc: 'gym', inside: true, busy: true, energy: -0.04, xp: { body: 1.1 } },
  donkatsu:     { label: '팔팔식당 돈까스', emoji: '🍱', loc: 'restaurant', inside: true, busy: true, errand: true, dur: [35, 50], energy: 0.15, mood: 0.2, stat: 'donkatsu', alt: 'quick_meal' },
  school_scan:  { label: '팔팔고 스캔 중', emoji: '👀', loc: 'school_front', busy: true, xp: { mind: 0.6 } },
  write_list:   { label: '리스트 작성 중', emoji: '📝', loc: 'home', inside: true, busy: true, xp: { mind: 0.8 } },
  school_revisit: { label: '하교 시간 팔팔고 재방문', emoji: '🕵️', loc: 'school_front', busy: true },
  cupramen_soju:{ label: '팔팔25 컵라면 & 소주', emoji: '🍜', loc: 'store', inside: true, errand: true, dur: [40, 70], mood: 0.2, stat: 'cupramen' },
  store_work:   { label: '팔팔25 근무', emoji: '🏪', loc: 'store', inside: true, busy: true, xp: { social: 0.6, work: 0.8 } },
  evening_run:  { label: '저녁 러닝', emoji: '🏃', route: ['river', 'plaza', 'river', 'wander'], energy: -0.05, xp: { body: 0.8 }, busy: true },
  police_work:  { label: '파출소 업무', emoji: '🗂️', loc: 'police', inside: true, busy: true, xp: { work: 0.5 } },
  patrol:       { label: '동네 순찰', emoji: '👮', route: ['plaza', 'wander', 'school_front', 'wander'], busy: true, xp: { body: 0.5 } },
  school_patrol:{ label: '팔팔고 하교 지도', emoji: '🚸', loc: 'school_front', busy: true, xp: { social: 0.3 } },
  cupramen:     { label: '팔팔25 컵라면 사기', emoji: '🍜', loc: 'store', inside: true, errand: true, dur: [8, 12], energy: 0.1, stat: 'cupramen' },

  // free time
  plaza_walk:   { label: '중앙광장 산책', emoji: '🚶', loc: 'plaza', roam: true, dur: [30, 60], mood: 0.06, xp: { body: 0.2 } },
  fountain:     { label: '분수대에서 멍', emoji: '⛲', loc: 'fountain', dur: [20, 40], mood: 0.1 },
  bench_rest:   { label: '벤치에서 휴식', emoji: '🪑', loc: 'bench', dur: [30, 60], mood: 0.08 },
  river_walk:   { label: '하천 산책', emoji: '🌊', loc: 'river', dur: [30, 70], mood: 0.12, xp: { body: 0.2 } },
  cafe_visit:   { label: '팔팔카페 커피', emoji: '☕', loc: 'cafe', inside: true, dur: [30, 50], mood: 0.12, xp: { social: 0.3 }, alt: 'store_shop' },
  restaurant_meal: { label: '팔팔식당 외식', emoji: '🍤', loc: 'restaurant', inside: true, dur: [40, 60], mood: 0.15, energy: 0.1, stat: 'donkatsu', alt: 'store_shop' },
  store_shop:   { label: '팔팔25 쇼핑', emoji: '🛒', loc: 'store', inside: true, dur: [10, 20], mood: 0.05 },
  gym_visit:    { label: '체육관 운동', emoji: '💪', loc: 'gym', inside: true, dur: [50, 90], energy: -0.06, xp: { body: 0.8 }, alt: 'river_walk' },
  visit:        { label: '이웃집 놀러가기', emoji: '🏠', loc: 'friend', inside: true, dur: [50, 90], mood: 0.12, xp: { social: 0.6 } },

  takeout_coffee: { label: '출근길 커피 테이크아웃', emoji: '☕', loc: 'cafe', inside: true, busy: true, errand: true, dur: [6, 10], mood: 0.3, stat: 'coffee', alt: 'store_coffee' },
  store_coffee: { label: '팔팔25 캔커피', emoji: '🥫', loc: 'store', inside: true, busy: true, errand: true, dur: [4, 6], mood: 0.1, stat: 'coffee' },
  drop_by:      { label: '비번 아는 집에 잠깐 들르기', emoji: '🔑', inside: true, dur: [20, 40], mood: 0.05 },
  sneak_in:     { label: '남의 집 앞을 기웃기웃…', emoji: '👀', dur: [3, 6] },
  promise_meet: { label: '약속 지키는 중', emoji: '🤝', dur: [50, 80], mood: 0.2, xp: { social: 0.6 }, busy: true, sticky: true, stat: 'promises' },

  // law & order (sticky)
  arrest_go:    { label: '출동! 범인 잡으러 가는 중', emoji: '🚨', busy: true, sticky: true },
  essay:        { label: '파출소에서 반성문 쓰는 중', emoji: '📝', loc: 'police', inside: true, busy: true, sticky: true, stat: 'essays' },
  community_service: { label: '사회봉사 (광장 청소)', emoji: '🧹', loc: 'plaza', roam: true, busy: true, sticky: true, xp: { body: 0.3 }, stat: 'service' },
  jailed:       { label: '유치장 신세', emoji: '🔒', loc: 'police', inside: true, busy: true, sticky: true, mood: -0.02, stat: 'jailed' },
  shaken:       { label: '놀란 마음 진정시키는 중', emoji: '😵', loc: 'home', inside: true, busy: true, sticky: true, energy: 0.1 },

  // traffic (traffic.js)
  knocked:      { label: '교통사고로 쓰러짐', emoji: '💫', busy: true, sticky: true },
  transported:  { label: '구급차로 이송 중', emoji: '🚑', busy: true, sticky: true },
  patrol_car:   { label: '경찰차 출동', emoji: '🚓', busy: true, sticky: true },

  // crises (director.js)
  shelter:      { label: '체육관으로 대피 중', emoji: '🛡️', loc: 'gym', inside: true, busy: true, sticky: true, mood: -0.02 },
  defend:       { label: '마을 입구 방어전', emoji: '⚔️', loc: 'warfront', roam: true, busy: true, sticky: true, energy: -0.05, xp: { body: 0.6 } },
  injured:      { label: '부상 치료 중', emoji: '🩹', loc: 'hospital', inside: true, busy: true, sticky: true, stat: 'injured' },
  evacuate:     { label: '화재 대피', emoji: '🧯', loc: 'plaza', roam: true, busy: true, sticky: true },
  firefight:    { label: '화재 진압 중', emoji: '🧯', busy: true, sticky: true },

  // scripted (sticky: routine changes don't interrupt)
  kidnap_hunt:  { label: '…수상한 움직임', emoji: '🕵️', busy: true, sticky: true },
  kidnap_home:  { label: '"같이 가자~" 귀가 중', emoji: '😏', busy: true, sticky: true },
  kidnapper_hide: { label: '집에서 무언가 하는 중…', emoji: '🤫', loc: 'home', inside: true, busy: true, sticky: true },
  kidnapped:    { label: '납치당함!', emoji: '😱', busy: true, sticky: true },
  search:       { label: '범인 찾는 중 (엉뚱한 곳)', emoji: '🔍', busy: true, sticky: true },
  rescue:       { label: '출동! 구출하러 가는 중', emoji: '🚨', busy: true, sticky: true },
  escort:       { label: '범인 연행 중', emoji: '🚓', busy: true, sticky: true },
  arrested:     { label: '연행되는 중', emoji: '🚔', busy: true, sticky: true },
  interrogate:  { label: '심문 중', emoji: '🗣️', loc: 'police', inside: true, busy: true, sticky: true },
  go_home_shut: { label: '집으로 직행', emoji: '😤', loc: 'home', inside: true, busy: true, sticky: true },
  shut_in:      { label: '집에 틀어박힘 (오늘은 안 나감)', emoji: '🏠', loc: 'home', inside: true, busy: true, sticky: true },
  sick:         { label: '병원 진료', emoji: '🏥', loc: 'hospital', inside: true, dur: [60, 120], busy: true, sticky: true, stat: 'hospital' },
  event:        { label: '광장 이벤트 구경', emoji: '🎉', loc: 'event', mood: 0.2, xp: { social: 0.4 }, sticky: true },
  meetup:       { label: '우연한 만남', emoji: '✨', loc: 'meet', dur: [35, 50], mood: 0.15, xp: { social: 0.5, charm: 0.3 }, busy: true, sticky: true },
  date:         { label: '데이트 중', emoji: '💕', loc: 'date', dur: [60, 90], mood: 0.25, xp: { charm: 0.6, social: 0.3 }, busy: true, sticky: true, stat: 'dates' },
};

// routine blocks: d = all|weekday|weekend|mon|notMon, f/t = hours (t may be a dayVar key),
// a = activity, p = {activity: weight}, if/ifNot = dayVar flag. First match wins; no match => sleep at home.
const FREE = { plaza_walk: 2, fountain: 1, bench_rest: 1, river_walk: 2, cafe_visit: 2, restaurant_meal: 2, store_shop: 1, gym_visit: 1, visit: 2, home_relax: 2 };

const CHARACTERS = [
  {
    id: 'han_gayun', name: '한가윤', short: '가윤', gender: 'F', age: 24, role: '팔팔카페 사장', traits: '밝음 · 외향형',
    home: 'h_gayun', extro: 1.3,
    morality: 0.95, fav: { act: 'cafe_visit', line: '팔팔카페 신메뉴 꼭 먹어봐요!' }, items: ['원두 한 봉지', '카페 단골 쿠폰북'],
    skills: { cook: 3, social: 3, work: 2, charm: 3, body: 1, mind: 2 }, talent: { cook: 1.2, social: 1.3 },
    routine: [
      { d: 'weekday', f: 7, t: 7.6, a: 'breakfast' },
      { d: 'weekday', f: 7.6, t: 19, a: 'work_cafe' },
      { d: 'weekday', f: 19, t: 23, p: { home_relax: 3, plaza_walk: 2, restaurant_meal: 2, river_walk: 1, store_shop: 1, visit: 1 } },
      { d: 'weekend', f: 9, t: 23.5, p: FREE },
    ],
    lines: ['오늘 원두 진짜 좋아요!', '카페 한번 놀러 와요~', '날씨 좋다 그쵸?!', '신메뉴 개발 중이에요 ☕', '주말엔 푹 쉴 거예요!'],
    replies: ['헐 대박!', '하하 진짜요?', '완전 좋아요!', '오 그렇구나~'],
  },
  {
    id: 'ha_serin', name: '하세린', short: '세린', gender: 'F', age: 19, role: '팔팔고 3학년', traits: '까칠함 · 철벽 · 외향형',
    home: 'h_serin', extro: 1.1, minor: true,
    morality: 0.85, fav: { act: 'store_shop', line: '팔팔25 삼각김밥 신상 맛있어요. 진짜임.' }, items: ['수능 문제집', '최애 포토카드'],
    skills: { mind: 3, social: 2, body: 1, cook: 1, work: 1, charm: 2 }, talent: { mind: 1.3 },
    routine: [
      { d: 'weekday', f: 7, t: 8.3, a: 'oversleep', if: 'serinLate' },
      { d: 'weekday', f: 8.3, t: 16, a: 'school_class', if: 'serinLate' },
      { d: 'weekday', f: 7, t: 7.45, a: 'school_ready' },
      { d: 'weekday', f: 7.45, t: 16, a: 'school_class' },
      { d: 'weekday', f: 16, t: 21.75, a: 'studycafe' },
      { d: 'weekday', f: 21.75, t: 22.25, a: 'quick_meal' },
      { d: 'weekday', f: 22.25, t: 24, a: 'home_study' },
      { d: 'weekend', f: 10.5, t: 24, p: { plaza_walk: 2, cafe_visit: 1, store_shop: 2, river_walk: 1, restaurant_meal: 2, fountain: 1, bench_rest: 1, home_relax: 2 } },
    ],
    lines: ['뭐요.', '바빠요.', '지각 아니거든요? 거의 안 했거든요?', '아 스카 가야 돼요', '…말 걸지 마세요'],
    replies: ['그래서요?', '아 네.', '…흥.', '관심 없어요.'],
  },
  {
    id: 'han_seunghwa', name: '한승화', short: '승화', gender: 'M', age: 31, role: '회사원 (마을 밖 출근)', traits: '조용함 · 내향형 · 친해지면 수다',
    home: 'h_seunghwa', extro: 0.5, chattyWhenClose: true,
    morality: 0.9, fav: { act: 'river_walk', line: '하천 산책로 밤에 걸으면 좋아요…' }, items: ['야식용 냉동 치킨', '회사 기밀(?) 서류'],
    skills: { work: 4, mind: 3, social: 1, body: 1, cook: 1, charm: 2 }, talent: { work: 1.3 },
    routine: [
      { d: 'weekday', f: 7, t: 7.55, a: 'get_ready' },
      { d: 'weekday', f: 7.55, t: 7.6, a: 'takeout_coffee' },
      { d: 'weekday', f: 7.6, t: 'seunghwaReturn', a: 'commute' },
      { d: 'all', f: 22.5, t: 23.2, a: 'late_snack', if: 'seunghwaSnack' },
      { d: 'weekday', f: 'seunghwaReturn', t: 24, p: { home_relax: 6, river_walk: 1, plaza_walk: 1 } },
      { d: 'weekend', f: 10, t: 24.9, p: { home_relax: 4, plaza_walk: 1, restaurant_meal: 2, river_walk: 1, gym_visit: 1, store_shop: 1, visit: 1 } },
    ],
    lines: ['…안녕하세요.', '(꾸벅)', '…네.'],
    closeLines: ['아 근데 오늘 회사에서요, 진짜 웃긴 일이 있었는데요', '야식 뭐 먹을지 고민 중이에요 ㅎㅎ', '주말에 같이 치킨 어때요?', '부장님이 또…'],
    replies: ['…네.', '아 네…', '(끄덕)'],
    closeReplies: ['ㅋㅋㅋ 진짜요?', '오 그거 저도 알아요!', '헐 대박'],
  },
  {
    id: 'jo_beomgi', name: '조범기', short: '범기', gender: 'M', age: 45, role: '팔팔식당 요리사', traits: '과묵함 · 내향형',
    home: 'h_beomgi', extro: 0.4,
    morality: 0.9, fav: { act: 'restaurant_meal', line: '…돈까스. 먹으러 와.' }, items: ['비장의 돈까스 소스', '튀김 젓가락'],
    skills: { cook: 6, work: 3, body: 2, social: 1, mind: 2, charm: 2 }, talent: { cook: 1.3 },
    routine: [
      { d: 'notMon', f: 9, t: 10, a: 'breakfast' },
      { d: 'notMon', f: 10, t: 11, p: { home_relax: 2, river_walk: 1, plaza_walk: 1 } },
      { d: 'notMon', f: 11, t: 22, a: 'work_restaurant' },
      { d: 'notMon', f: 22, t: 22.4, a: 'beer' },
      { d: 'notMon', f: 22.4, t: 23.5, a: 'home_relax' },
      { d: 'mon', f: 10, t: 11, a: 'breakfast' },
      { d: 'mon', f: 11, t: 21.5, p: { home_relax: 3, river_walk: 2, plaza_walk: 1, cafe_visit: 1, bench_rest: 1, visit: 1, gym_visit: 1 } },
      { d: 'mon', f: 21.5, t: 22, a: 'beer' },
      { d: 'mon', f: 22, t: 23.5, a: 'home_relax' },
    ],
    lines: ['…응.', '…돈까스.', '…', '…오늘 우동 국물 좋아.'],
    replies: ['…그래.', '…음.', '…'],
  },
  {
    id: 'gwak_hyunji', name: '곽현지', short: '현지', gender: 'F', age: 19, role: '팔팔고 체육 특기생', traits: 'ENTP · 즉흥적',
    home: 'h_hyunji', extro: 1.4, minor: true,
    morality: 0.6, fav: { act: 'gym_visit', line: '체육관 같이 가요!! 개운함 ㄹㅇ' }, items: ['닭가슴살 한 박스', '줄넘기'],
    skills: { body: 5, social: 2, mind: 1, cook: 1, work: 1, charm: 2 }, talent: { body: 1.4 },
    routine: [
      { d: 'all', f: 6, t: 6.9, a: 'run' },
      { d: 'all', f: 6.9, t: 6.95, a: 'chicken' },
      { d: 'weekday', f: 6.95, t: 12, a: 'school_class' },
      { d: 'all', f: 12, t: 12.05, a: 'donkatsu' },
      { d: 'weekday', f: 12.05, t: 16, a: 'school_class' },
      { d: 'weekday', f: 16, t: 20.5, a: 'gym_train' },
      { d: 'weekend', f: 6.95, t: 12, a: 'gym_train' },
      { d: 'weekend', f: 12.05, t: 20.5, a: 'gym_train' },
      { d: 'all', f: 20.5, t: 21.5, a: 'home_relax' },
    ],
    lines: ['닭가슴살 먹을래요?!', '오늘 5km 뛰었어요 ㅋㅋ', '돈까스 최고!!', '아무 생각 없어요 히히', '수업 끝나면 바로 체육관 ㄱㄱ'],
    replies: ['ㅋㅋㅋㅋ 몰라요!', '오 개좋아!', '그게 뭔데요?ㅋㅋ', '헐 ㅋㅋ'],
  },
  {
    id: 'jo_ijun', name: '조이준', short: '이준', gender: 'M', age: 67, role: '은퇴한 팔팔고 국어 교사', traits: 'ESTJ · 겉은 활발, 속은 치밀',
    home: 'h_ijun', extro: 1.2,
    morality: 0.3, fav: { act: 'fountain', line: '허허, 분수대 앞이 명당이라네' }, items: ['정체불명의 리스트 노트', '오래된 국어 교과서'],
    skills: { mind: 5, social: 3, work: 2, body: 1, cook: 2, charm: 2 }, talent: { mind: 1.2 },
    routine: [
      { d: 'weekday', f: 6, t: 7.4, p: { plaza_walk: 1, river_walk: 1 } },
      { d: 'weekday', f: 7.4, t: 8, a: 'breakfast' },
      { d: 'weekday', f: 8, t: 9.5, a: 'school_scan' },
      { d: 'weekday', f: 9.5, t: 12, a: 'write_list' },
      { d: 'weekday', f: 12, t: 13, a: 'home_meal' },
      { d: 'weekday', f: 13, t: 15.6, p: { plaza_walk: 2, bench_rest: 2, fountain: 1, home_relax: 2, river_walk: 1 } },
      { d: 'weekday', f: 15.6, t: 16.6, a: 'school_revisit' },
      { d: 'all', f: 19.5, t: 21, a: 'cupramen_soju' },
      { d: 'weekday', f: 16.6, t: 19.5, a: 'home_relax' },
      { d: 'all', f: 21, t: 22, a: 'home_relax' },
      { d: 'weekend', f: 6.5, t: 19.5, p: FREE },
    ],
    lines: ['허허! 오늘도 좋은 날이구먼!', '요즘 학생들은 참 활기차~', '내가 계획이 다 있지 허허', '국어는 말이야, 띄어쓰기가 중요해!', '허허허, 별일 없지?'],
    replies: ['허허, 그렇구먼!', '좋지 좋아!', '암, 그렇고말고', '허허허'],
  },
  {
    id: 'hong_uijun', name: '홍의준', short: '의준', gender: 'M', age: 51, role: '팔팔25 사장', traits: 'ISFJ · 늘 웃는 얼굴',
    home: 'h_uijun', extro: 1.0, beloved: true,
    morality: 1.0, fav: { act: 'store_shop', line: '팔팔25 1+1 행사 꼭 챙기세요~ 😊' }, items: ['편의점 1+1 쿠폰 뭉치', '가족 사진 액자'],
    skills: { work: 4, social: 4, body: 2, cook: 2, mind: 2, charm: 3 }, talent: { social: 1.3, work: 1.1 },
    routine: [
      { d: 'all', f: 4.5, t: 5, a: 'get_ready' },
      { d: 'all', f: 5, t: 21, a: 'store_work' },
      { d: 'all', f: 21, t: 21.8, a: 'evening_run' },
      { d: 'all', f: 21.8, t: 22.5, a: 'home_relax' },
    ],
    lines: ['어서 오세요~ 😊', '오늘도 수고 많았어요!', '1+1 행사 중이에요 허허', '밥은 먹고 다녀요?', '항상 고마워요~'],
    replies: ['허허 그렇군요~', '좋네요 좋아요 😊', '고생 많았어요~', '응원할게요!'],
  },
  {
    id: 'jung_uigyeom', name: '정의겸', short: '의겸', gender: 'M', age: 27, role: '팔팔파출소 경위', traits: 'ENFP · 열정 · 허당 · 마음 여림',
    home: 'police', extro: 1.4, flirty: true,
    morality: 1.0, fav: { act: 'plaza_walk', line: '광장 순찰 같이 도실래요?! 😆' }, items: ['예비 경찰 모자', '연애 지침서'],
    skills: { body: 3, work: 1, social: 3, mind: 1, cook: 1, charm: 2 }, talent: { social: 1.2 },
    routine: [
      { d: 'all', f: 7, t: 7.5, a: 'skip_meal' },
      { d: 'all', f: 7.5, t: 15.6, p: { police_work: 3, patrol: 2 } },
      { d: 'all', f: 15.6, t: 16.7, a: 'school_patrol' },
      { d: 'all', f: 16.7, t: 20.5, p: { police_work: 3, patrol: 1 } },
      { d: 'all', f: 20.5, t: 21, a: 'cupramen' },
      { d: 'all', f: 21, t: 23.5, a: 'police_work' },
    ],
    lines: ['치안은 제가 지킨다! 😆', '오늘도 열심히! 근데 뭐 하려고 했더라…', '배고프다… 아 아침 굶었지', '수상한 사람 없죠?! 없죠?!'],
    flirtLines: ['혹시… 남자친구 있어요? 😳', '근무 끝나고 컵라면 같이 먹을래요?', '오늘 진짜 예쁘시네요! (경례)', '제 마음도 체포해 주실래요? 😏'],
    replies: ['우와 진짜요?!', '대박! 😆', '헉 몰랐어요!', '오오오!'],
  },
];

const INITIAL_RELATIONS = {
  'han_gayun|hong_uijun': 35, 'ha_serin|gwak_hyunji': 30, 'jo_beomgi|hong_uijun': 30, 'jo_ijun|hong_uijun': 25,
  'han_gayun|han_seunghwa': 15, 'han_gayun|jung_uigyeom': 20, 'gwak_hyunji|jo_beomgi': 20, 'ha_serin|hong_uijun': 25,
  'gwak_hyunji|hong_uijun': 25, 'han_seunghwa|hong_uijun': 20, 'jung_uigyeom|hong_uijun': 25,
};

const STAT_LABELS = {
  late: '⏰ 지각', kidnapped: '😱 납치당함', kidnaps: '🕵️ 납치', arrests: '🚔 범인 체포', releases: '🙏 범인 석방',
  beer: '🍺 퇴근 맥주', cupramen: '🍜 컵라면', donkatsu: '🍱 돈까스', chicken: '🍗 닭가슴살', overtime: '😩 야근',
  snack: '🍗 야식', flirts: '😏 플러팅', confess: '💌 고백', dates: '💕 데이트', hospital: '🏥 병원', store: '🍙 편의점 끼니',
  coffee: '☕ 출근 커피', promises: '🤝 약속 지킴', promiseBroken: '😤 약속 펑크', crimes: '⚖️ 범죄', thefts: '🫳 절도', trespass: '🚪 무단출입',
  essays: '📝 반성문', accidents: '💥 교통사고', dispatches: '🚓 사고 출동', war: '⚔️ 전쟁 겪음', injured: '🩹 부상', fires: '🧯 화재 진압', service: '🧹 사회봉사', jailed: '🔒 유치장', cheats: '💔 바람', breakups: '💔 이별', pwShared: '🔑 비번 알려줌',
};

const GREETINGS_DAY = ['안녕하세요!', '오, 반가워요!', '어디 가세요?', '날씨 좋네요~'];
const GREETINGS_MORNING = ['좋은 아침이에요!', '일찍 나오셨네요', '아침은 드셨어요?'];
const GREETINGS_NIGHT = ['아직 안 주무세요?', '밤바람 시원하네요', '퇴근하세요?'];

function relLabel(v) {
  if (v >= 85) return '소울메이트';
  if (v >= 60) return '절친';
  if (v >= 35) return '친구';
  if (v >= 15) return '아는 사이';
  return '어색한 사이';
}

// 팔팔법 (shown in the law modal; enforced in law.js / sim.js)
const PALPAL_LAWS = [
  { no: '제1조', title: '비밀번호 출입', text: '모든 집과 건물에는 비밀번호가 있다. 주인이 없을 때 비밀번호를 모르는 사람은 들어갈 수 없다.' },
  { no: '제2조', title: '무단출입 금지', text: '비밀번호 없이 남의 집에 들어가면 무단출입. 파출소에서 반성문 1시간.' },
  { no: '제3조', title: '절도 금지', text: '비밀번호를 알더라도 물건을 훔치면 절도. 신고 시 정의겸 출동, 광장 청소 사회봉사 2시간.' },
  { no: '제4조', title: '납치 금지', text: '납치는 중범죄. 그날 안에 구출·체포 후 심문. (담당 경찰 재량으로 석방될 수 있음)' },
  { no: '제5조', title: '공무원 납치 미수', text: '경찰을 납치하려 하면 그 자리에서 체포, 유치장 1일.' },
];
const VILLAGE_RULES = [
  '연인은 한 명만 가질 수 있다. 새 연인을 사귀려면 기존 연인과 먼저 헤어져야 한다.',
  '꼬시는 건 자유다. 그래서 바람이 날 수도 있고, 들키면 큰 싸움이 난다.',
  '연애는 성인끼리만, 나이·성별은 상관없다.',
  '주민들은 들은 이야기를 기억하고, 약속·추천·소문은 나중에 행동으로 이어진다.',
];
