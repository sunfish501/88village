// 이유진 (팔팔팔병원 의사): patients at the clinic heal twice as fast while she works,
// she does house calls on 월·수·금 afternoons, and she runs to anyone hurt or sick she sees.
const DOCTOR_ID = 'lee_yujin';
const SERIOUS_ACTS = new Set(['work_hospital', 'house_call', 'rush_heal']);
const PATIENT_ACTS = new Set(['sick', 'injured', 'knocked']);
const SEE_RANGE = 14; // tiles

const isPatient = (p) => !!(p.act && PATIENT_ACTS.has(p.act.key));

// work or someone hurt in front of her -> 진지모드 lines
function doctorSerious(a, other) {
  if (!a.def.seriousLines) return false;
  return !!(a.act && SERIOUS_ACTS.has(a.act.key)) || !!(other && (isPatient(other) || other.energy < 25));
}

function treat(Y, p, text) {
  Y.stat('treated'); changeRel(Y, p, 8);
  p.energy = clamp(p.energy + 15, 0, 100); p.mood = clamp(p.mood + 10, 0, 100);
  p.note(`유진 선생님한테 치료받음 🩺`); Y.note(`${josa(p.def.short, '을/를')} 치료함`);
  logTown(text, Y.id, true);
}

function tickDoctor(dt) {
  const Y = Sim.byId[DOCTOR_ID];
  if (!Y || !Y.act) return;
  const k = Y.act.key;
  const clinic = World.buildings.hospital;

  // first aid on the street halves the hospital stay that follows
  for (const p of Sim.agents) {
    if (!p.firstAid) continue;
    const key = p.act && p.act.key;
    if (key === 'injured') { p.act.remaining *= 0.5; p.firstAid = false; } else if (key !== 'knocked' && key !== 'transported') p.firstAid = false;
  }

  // at the clinic: every patient gets a checkup once, then heals at double speed
  if (k === 'work_hospital' && Y.inside === clinic) {
    for (const p of Sim.agents) {
      if (p === Y || p.inside !== clinic || !p.act || !['sick', 'injured'].includes(p.act.key)) continue;
      p.act.remaining -= dt;
      if (!p.act.seen) { p.act.seen = true; treat(Y, p, `🩺 이유진 선생님이 ${josa(p.def.name, '을/를')} 진료했다. "금방 나을 거예요." (회복 2배 빠르게)`); }
    }
  }

  if (k === 'rush_heal') return rushUpdate(Y);
  if (Y.scripted || Y.chat || !Y.awake() || (Y.inside && Y.inside.virtual)) return;

  // a traffic victim anywhere, or a sick/injured person she can see from outside
  const victim = Sim.agents.find((p) => p !== Y && !p.inside && isPatient(p) && !p.doctorComing && !p.firstAid
    && (p.act.key === 'knocked' || (!Y.inside && tileDist(Y, p) <= SEE_RANGE)));
  if (victim) return rushTo(Y, victim);

  // house calls: quick checkup for whoever she passes
  if (k === 'house_call' && !Y.inside && rand() < 0.08 * dt) {
    const p = Sim.agents.find((o) => o !== Y && !o.inside && !o.busy && !o.chat && tileDist(Y, o) <= 3 && !(Y.checked || {})[o.id]);
    if (p) {
      (Y.checked ||= {})[p.id] = dayOf(Sim.minute);
      Y.stat('housecalls'); Y.dir = faceToward(Y, p.tx, p.ty);
      Y.say(pick(['잠깐! 혈압 한번 재볼게요.', '요즘 잠은 잘 자요?', '물 많이 마셔요!']), 2.4);
      p.say(pick(['아 네 선생님!', '헉 외진이다', '저 건강해요~']), 2);
      p.energy = clamp(p.energy + 8, 0, 100); changeRel(Y, p, 2);
      logTown(`🏘️ 이유진이 외진 중에 ${josa(p.def.name, '을/를')} 간단히 검진해 줬다`, Y.id);
    }
  }
  if (Y.checked) for (const id of Object.keys(Y.checked)) if (Y.checked[id] !== dayOf(Sim.minute)) delete Y.checked[id];
}

function rushTo(Y, p) {
  p.doctorComing = true;
  Y.inside = null;
  Y.script('rush_heal', { target: { x: p.tx, y: p.ty } });
  Y.act.patient = p;
  Y.say(pick(['비켜요! 의사예요!', '잠깐만요, 제가 볼게요!', '움직이지 마세요!']), 2.4);
  logTown(`🚨 이유진이 ${p.act.key === 'knocked' ? '사고 소식을 듣고' : '아픈 사람을 보고'} ${p.def.name}에게 달려간다!`, Y.id, true);
}

function rushUpdate(Y) {
  const p = Y.act.patient;
  const stillHurt = p && !p.inside && isPatient(p);
  if (!stillHurt) {
    if (p) p.doctorComing = false;
    Y.say('…구급차가 먼저 왔네. 병원에서 볼게요!', 2.4);
    Y.endAct();
    return;
  }
  if (Y.state === 'walking') {
    // the patient may still be walking to the hospital: re-aim when they drift away
    if (Y.dest && Math.abs(Y.dest.x - p.tx) + Math.abs(Y.dest.y - p.ty) > 2) Y.walkTo(p.tx, p.ty);
    return;
  }
  if (tileDist(Y, p) > 2) { Y.walkTo(p.tx, p.ty); return; }
  Y.dir = faceToward(Y, p.tx, p.ty);
  p.doctorComing = false;
  if (p.act.key === 'knocked') {
    p.firstAid = true;
    Y.say('의식 있어요. 출혈 없고… 구급차 오면 바로 옮겨요.', 3);
    treat(Y, p, `🩺 이유진이 쓰러진 ${josa(p.def.name, '을/를')} 응급처치했다 (입원 기간 절반)`);
  } else {
    Y.say(pick(['됐어요. 이제 괜찮을 거예요 😊', '약 먹고 푹 쉬면 돼요!']), 2.6);
    p.say(pick(['선생님 감사합니다…!', '와 진짜 나았어요!']), 2.2);
    treat(Y, p, `🩺 이유진이 달려가 ${josa(p.def.name, '을/를')} 그 자리에서 치료했다! 병원 안 가도 됨`);
    p.endAct();
  }
  Y.endAct();
}
