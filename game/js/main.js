// Boot, main loop, input.
function loadImage(src) {
  return new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = src; });
}

function resize() {
  const cv = Gfx.canvas, r = cv.parentElement.getBoundingClientRect();
  Gfx.dpr = window.devicePixelRatio || 1;
  cv.width = Math.round(r.width * Gfx.dpr); cv.height = Math.round(r.height * Gfx.dpr);
  cv.style.width = r.width + 'px'; cv.style.height = r.height + 'px';
}

function zoomBy(f, sx, sy) {
  const cv = Gfx.canvas;
  if (sx === undefined) { sx = cv.clientWidth / 2; sy = cv.clientHeight / 2; }
  const before = screenToWorld(sx, sy);
  Cam.zoom = clamp(Cam.zoom * f, 1, 5);
  const after = screenToWorld(sx, sy);
  Cam.x += before.x - after.x; Cam.y += before.y - after.y;
}

function initInput() {
  const cv = Gfx.canvas;
  let down = null;
  cv.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, cx: Cam.x, cy: Cam.y, moved: false }; cv.setPointerCapture(e.pointerId); });
  cv.addEventListener('pointermove', (e) => {
    const r = cv.getBoundingClientRect();
    if (down) {
      const dx = e.clientX - down.x, dy = e.clientY - down.y;
      if (Math.abs(dx) + Math.abs(dy) > 5) down.moved = true;
      if (down.moved) { Cam.follow = null; Cam.x = down.cx - dx / Cam.zoom; Cam.y = down.cy - dy / Cam.zoom; cv.style.cursor = 'var(--cur-grabbing)'; }
      return;
    }
    const w = screenToWorld(e.clientX - r.left, e.clientY - r.top);
    Gfx.hover = agentAt(w.x, w.y) || badgeAgentAt(e.clientX - r.left, e.clientY - r.top);
    cv.style.cursor = Gfx.hover ? 'var(--cur-pointer)' : 'var(--cur-grab)';
  });
  cv.addEventListener('pointerup', (e) => {
    const r = cv.getBoundingClientRect();
    if (down && !down.moved) {
      const sx = e.clientX - r.left, sy = e.clientY - r.top, w = screenToWorld(sx, sy);
      const a = badgeAgentAt(sx, sy) || agentAt(w.x, w.y);
      if (a) selectAgent(a, true);
      else {
        const b = buildingAt(w.x, w.y);
        if (b) toast(`${b.name}${Sim.agents.some((x) => x.inside === b) ? ' · 안에 ' + Sim.agents.filter((x) => x.inside === b).map((x) => x.def.short).join(', ') : ''}`);
        Cam.follow = null;
      }
    }
    down = null; cv.style.cursor = 'var(--cur-grab)';
  });
  cv.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = cv.getBoundingClientRect();
    Cam.follow = Cam.follow; // keep following while zooming
    zoomBy(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX - r.left, e.clientY - r.top);
  }, { passive: false });
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    if (e.code === 'Space') { e.preventDefault(); setSpeed(Sim.speed ? 0 : 1); }
    const sp = { Digit1: 1, Digit2: 2, Digit3: 4, Digit4: 8 }[e.code];
    if (sp) setSpeed(sp);
    if (e.code === 'Escape') selectAgent(null, false);
  });
  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', () => { if (document.hidden) saveGame(); });
  window.addEventListener('beforeunload', saveGame);
}

async function boot() {
  try { await Promise.all([document.fonts.load('9px Galmuri9'), document.fonts.load('11px Galmuri11')]); } catch (e) { /* offline font */ }
  Gfx.canvas = document.getElementById('game');
  Gfx.ctx = Gfx.canvas.getContext('2d');
  Gfx.light = document.createElement('canvas'); Gfx.lctx = Gfx.light.getContext('2d');

  buildWorld();
  buildObjects();
  Gfx.ground = drawGround();

  await Promise.all(CHARACTERS.map(async (c) => {
    const im = await loadImage(`../characters/sprites/${c.id}.png`);
    if (!im) return;
    Gfx.sprites[c.id] = im;
    const [hc, hg] = mkCanvas(20, 20);
    R(hg, 0, 0, 20, 20, '#efe3c6');
    hg.drawImage(im, 32 + 6, 0, 20, 20, 0, 1, 20, 20);
    Gfx.heads[c.id] = hc;
  }));

  initSim();
  const offline = loadGame();
  Sim.onToast = toast;
  initCars();
  resize();
  initUI();
  initInput();
  // start camera on the park/intersection
  Cam.zoom = Gfx.canvas.clientWidth < 700 ? 1.5 : 2;
  Cam.x = 58 * TILE - Gfx.canvas.clientWidth / Cam.zoom / 2;
  Cam.y = 34 * TILE - Gfx.canvas.clientHeight / Cam.zoom / 2;
  if (offline) showOffline(offline);
  document.getElementById('loading').remove();

  let last = performance.now(), uiT = 0, saveT = 0;
  const frame = (now) => {
    const dt = Math.min((now - last) / 1000, 0.1); last = now;
    if (Sim.speed > 0) { simTick(dt); updateCars(dt); }
    render(now);
    uiT += dt; saveT += dt;
    if (uiT > 0.3) { uiT = 0; updateUI(); }
    if (saveT > 20) { saveT = 0; saveGame(); }
    requestAnimationFrame(frame);
  };
  updateUI();
  requestAnimationFrame(frame);
}

boot();
