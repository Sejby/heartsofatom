// Boot, input handling and main loop.
window.HOA = window.HOA || {};

window.addEventListener('error', (e) => { const d = document.getElementById('errlog'); if (d) d.textContent += ' | ' + e.message + ' @' + (e.filename || '').split('/').pop() + ':' + e.lineno; });

(function () {
  const HPS = { 1: 1.5, 2: 5, 3: 14, 4: 36, 5: 96 }; // in-game hours per real second
  let W, dayChanged = false;
  const input = { down: false, sx: 0, sy: 0, drag: false, lastHover: 0 };

  async function boot() {
    W = HOA.buildWorld(window.REGIONS_TOPO);
    HOA.W = W;
    HOA.newGame(W);
    await HOA.initRender(document.getElementById('map'), document.getElementById('overlay'), document.getElementById('stars'), W);
    HOA.setView({ lon: 25, lat: 38, scale: Math.min(window.innerWidth, window.innerHeight) * 0.75 });
    await HOA.uiInit();
    await HOA.preloadAssets(HOA.S, (msg) => (document.getElementById('loading-msg').textContent = msg));
    HOA.onDay = () => (dayChanged = true);
    bindInput();
    document.getElementById('loading').classList.add('hidden');
    // quick-start via URL, e.g. index.html#play=CZE&days=30
    const hp = new URLSearchParams(location.hash.slice(1));
    if (hp.get('play') && HOA.S.countries[hp.get('play')]) {
      HOA.startAs(hp.get('play'));
      HOA.closeModal();
      for (let i = 0; i < (+hp.get('days') || 0) * 24; i++) HOA.tickHour(HOA.S, W);
      if (hp.get('panel')) HOA.openPanel(hp.get('panel'));
      if (hp.get('zoom')) HOA.setView({ scale: +hp.get('zoom') });
      if (hp.get('focus')) HOA.showFocusTree();
      if (hp.get('side')) HOA.showSide({ tag: hp.get('side'), p: -1 });
      if (hp.get('run')) HOA.S.paused = false;
      HOA.markMapDirty();
      HOA.uiRefresh();
    }
    requestAnimationFrame(loop);
  }

  HOA.startAs = function (tag, loaded) {
    const S = HOA.S;
    S.player = tag;
    const c = S.countries[tag];
    if (!loaded) { c.aiArmy = true; S.paused = true; }
    document.body.classList.add('playing');
    const cap = W.provinces[c.capital];
    HOA.setView({
      lon: tag === 'RUS' ? 36 : cap.lon,
      lat: Math.max(-60, Math.min(70, cap.lat)),
      scale: tag === 'UKR' || tag === 'RUS' ? 2600 : 1800,
    });
    HOA.UI.side = null;
    HOA.R.selProv = -1;
    HOA.markMapDirty();
    if (!loaded) HOA.checkEvents(S, W);
    HOA.uiRefresh();
    if (!loaded) HOA.toast(`Hrajete za stát ${c.name}. Hra je pozastavená – stiskněte mezerník. Frontu zatím řídí AI (lze vypnout v panelu Armáda).`, 'own');
  };

  function loop(now) {
    const S = HOA.S, R = HOA.R;
    const dt = Math.min(250, now - (loop.last || now));
    loop.last = now;
    if (S.player && !S.paused && !S.modalPause) {
      loop.acc = (loop.acc || 0) + (dt / 1000) * HPS[S.speed];
      const t0 = performance.now();
      while (loop.acc >= 1 && performance.now() - t0 < 35) { HOA.tickHour(S, W); loop.acc -= 1; }
      if (loop.acc > 4) loop.acc = 4;
    } else if (!S.player && !input.down && !R.map.isMoving()) {
      HOA.setView({ lon: R.view.lon + dt * 0.0025 });
    }
    HOA.drawFrame(S);
    // the top bar refreshes about twice a second; panels follow on each new in-game day
    if (S.player && now - (loop.ui || 0) > 450 && (dayChanged || now - (loop.ui || 0) > 1000)) {
      loop.ui = now;
      dayChanged = false;
      HOA.uiRefresh();
    }
    requestAnimationFrame(loop);
  }

  function bindInput() {
    const R = HOA.R;
    const el = document.getElementById('map');
    const tip = document.getElementById('tooltip');
    const onMap = (e) => el.contains(e.target);
    R.map.on('movestart', () => tip.classList.add('hidden'));

    // capture phase: runs before MapLibre's own handlers, so Shift+drag can switch panning off
    document.addEventListener('mousedown', (e) => {
      if (e.button !== 0 || !onMap(e)) return;
      Object.assign(input, { down: true, sx: e.clientX, sy: e.clientY, drag: false });
      if (e.shiftKey && HOA.S.player) {
        R.map.dragPan.disable();
        R.box = { x0: e.clientX, y0: e.clientY, x1: e.clientX, y1: e.clientY };
      }
    }, true);
    window.addEventListener('mousemove', (e) => {
      if (input.down) {
        if (R.box) { R.box.x1 = e.clientX; R.box.y1 = e.clientY; R.map.triggerRepaint(); return; }
        if (!input.drag && Math.hypot(e.clientX - input.sx, e.clientY - input.sy) > 4) input.drag = true;
        return;
      }
      if (!onMap(e)) { tip.classList.add('hidden'); return; }
      const now = performance.now();
      if (now - input.lastHover < 60) return;
      input.lastHover = now;
      const p = HOA.pickProvince(e.clientX, e.clientY);
      R.hoverProv = p;
      const cnt = HOA.pickCounter(e.clientX, e.clientY);
      if (cnt) showUnitTip(cnt, e);
      else if (p >= 0) showProvTip(p, e);
      else tip.classList.add('hidden');
    });
    window.addEventListener('mouseup', (e) => {
      if (!input.down || e.button !== 0) return;
      input.down = false;
      if (R.box) {
        const { x0, y0, x1, y1 } = R.box;
        R.box = null;
        R.map.dragPan.enable();
        R.map.triggerRepaint();
        if (Math.abs(x1 - x0) > 4 || Math.abs(y1 - y0) > 4) {
          const [ax, bx, ay, by] = [Math.min(x0, x1), Math.max(x0, x1), Math.min(y0, y1), Math.max(y0, y1)];
          R.selected.clear();
          for (const c of R.counters) {
            if (c.tag !== HOA.S.player) continue;
            if (c.x + c.w > ax && c.x < bx && c.y + c.h > ay && c.y < by) c.units.forEach((u) => R.selected.add(u.id));
          }
          HOA.uiRefresh();
          return;
        }
      }
      if (input.drag || !onMap(e)) return;
      click(e);
    });
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const S = HOA.S;
      const p = HOA.pickProvince(e.clientX, e.clientY);
      if (p < 0) return;
      // right-click without selected units opens the country / leader view
      if (!S.player || !R.selected.size) {
        const tag = S.owner[p] || S.ctrl[p];
        if (tag) HOA.openCountryView(tag);
        return;
      }
      let ok = 0, fail = 0;
      for (const u of S.units) {
        if (!R.selected.has(u.id) || u.tag !== S.player) continue;
        if (HOA.orderMove(S, W, u, p, true)) { ok++; u.manual = S.day + 7; } else fail++;
      }
      if (fail && !ok) HOA.toast('Cíl je nedosažitelný (chybí vojenský přístup nebo válka).', 'warn');
      R.orderFlash = { p, t: performance.now() };
      R.map.triggerRepaint();
      HOA.uiRefresh();
    });
    window.addEventListener('keydown', (e) => {
      const S = HOA.S;
      if (!S.player || e.target.tagName === 'INPUT') return;
      if (e.code === 'Space') { e.preventDefault(); if (!S.modalPause) S.paused = !S.paused; }
      else if (/^Digit[1-5]$/.test(e.code)) S.speed = +e.code.slice(5);
      else if (e.code === 'Escape') {
        if (HOA.UI.focusOpen) HOA.UI.focusOpen = false;
        else if (R.selected.size) R.selected.clear();
        else if (HOA.UI.panel) HOA.openPanel(HOA.UI.panel);
        else { HOA.UI.side = null; R.selProv = -1; }
      } else if (e.code === 'KeyF') HOA.UI.focusOpen = true;
      else return;
      R.map.triggerRepaint();
      HOA.uiRefresh();
    });
  }

  function click(e) {
    const S = HOA.S, R = HOA.R;
    const cnt = HOA.pickCounter(e.clientX, e.clientY);
    if (cnt && S.player && cnt.tag === S.player) {
      if (!e.shiftKey) R.selected.clear();
      const all = cnt.units.every((u) => R.selected.has(u.id));
      cnt.units.forEach((u) => (all && e.shiftKey ? R.selected.delete(u.id) : R.selected.add(u.id)));
      R.map.triggerRepaint();
      HOA.uiRefresh();
      return;
    }
    const p = HOA.pickProvince(e.clientX, e.clientY);
    if (!e.shiftKey) R.selected.clear();
    R.selProv = p;
    if (p >= 0) HOA.UI.side = { p, tag: S.ctrl[p] && S.owner[p] !== S.ctrl[p] && !S.player ? S.owner[p] : S.owner[p] || S.ctrl[p] };
    else HOA.UI.side = null;
    R.map.triggerRepaint();
    HOA.uiRefresh();
  }

  function showProvTip(p, e) {
    const S = HOA.S, tip = document.getElementById('tooltip');
    const o = S.owner[p], c = S.ctrl[p];
    const esc = HOA.esc;
    let h = `<b>${esc(HOA.provName(p))}</b>`;
    if (o) h += `<br>${esc(S.countries[o].name)}`;
    if (c && c !== o) h += ` <span class="neg">(okupuje ${esc(S.countries[c].name)})</span>`;
    if (S.fort[p]) h += `<br>Opevnění ${S.fort[p]}`;
    tip.innerHTML = h;
    placeTip(tip, e);
  }
  function showUnitTip(cnt, e) {
    const S = HOA.S, tip = document.getElementById('tooltip');
    const tc = {};
    cnt.units.forEach((u) => (tc[u.type] = (tc[u.type] || 0) + 1));
    let h = `<b>${HOA.esc(S.countries[cnt.tag].name)}</b> – ${cnt.units.length} divizí<br>` + Object.entries(tc).map(([t, n]) => `${n}× ${HOA.UNITS[t].name}`).join('<br>');
    const str = cnt.units.reduce((s, u) => s + u.str, 0) / cnt.units.length;
    h += `<br>Síla ${Math.round(str * 100)} %`;
    tip.innerHTML = h;
    placeTip(tip, e);
  }
  function placeTip(tip, e) {
    tip.classList.remove('hidden');
    tip.style.left = Math.min(window.innerWidth - tip.offsetWidth - 8, e.clientX + 14) + 'px';
    tip.style.top = Math.min(window.innerHeight - tip.offsetHeight - 8, e.clientY + 14) + 'px';
  }

  window.addEventListener('load', () => setTimeout(boot, 30));
})();
