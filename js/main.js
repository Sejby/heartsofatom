// Boot, input handling and main loop.
window.HOA = window.HOA || {};

window.addEventListener('error', (e) => { const d = document.getElementById('errlog'); if (d) d.textContent += ' | ' + e.message + ' @' + (e.filename || '').split('/').pop() + ':' + e.lineno; });

(function () {
  const HPS = { 1: 1.5, 2: 5, 3: 14, 4: 36, 5: 96 }; // in-game hours per real second
  let W, dayChanged = false;
  const input = { down: false, x: 0, y: 0, sx: 0, sy: 0, drag: false, shift: false, lastHover: 0 };

  function boot() {
    W = HOA.buildWorld(window.REGIONS_TOPO);
    HOA.W = W;
    HOA.newGame(W);
    HOA.initRender(document.getElementById('map'), W);
    Object.assign(HOA.R.view, { lon: 25, lat: 38, scale: Math.min(window.innerWidth, window.innerHeight) * 0.75 });
    HOA.uiInit();
    HOA.renderStart();
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
      if (hp.get('zoom')) HOA.R.view.scale = +hp.get('zoom');
      if (hp.get('focus')) HOA.showFocusTree();
      if (hp.get('side')) HOA.showSide({ tag: hp.get('side'), p: -1 });
      if (hp.get('run')) HOA.S.paused = false;
      HOA.markMapDirty();
    }
    requestAnimationFrame(loop);
  }

  HOA.startAs = function (tag, loaded) {
    const S = HOA.S;
    S.player = tag;
    const c = S.countries[tag];
    if (!loaded) { c.aiArmy = true; S.paused = true; }
    document.getElementById('start').classList.add('hidden');
    document.body.classList.add('playing');
    const cap = W.provinces[c.capital];
    HOA.R.view.lon = cap.lon;
    HOA.R.view.lat = Math.max(-60, Math.min(70, cap.lat));
    HOA.R.view.scale = tag === 'UKR' || tag === 'RUS' ? 2600 : 1800;
    if (tag === 'RUS') HOA.R.view.lon = 36;
    HOA.UI.side = null;
    HOA.R.selProv = -1;
    HOA.markMapDirty();
    if (!loaded) HOA.checkEvents(S, W);
    HOA.renderTop();
    HOA.renderTicker();
    HOA.renderSide();
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
    } else if (!S.player && !input.down) {
      R.view.lon += dt * 0.0025;
      HOA.viewChanged();
    }
    HOA.drawFrame(S);
    if (S.player && now - (loop.ui || 0) > 450 && (dayChanged || now - (loop.ui || 0) > 1000)) {
      loop.ui = now;
      HOA.renderTop();
      if (dayChanged) {
        dayChanged = false;
        const busy = document.activeElement && (document.activeElement.type === 'range' || document.activeElement.id === 'dipSearch');
        if (HOA.UI.panel && !busy && !input.panelDown && ['politics', 'army', 'research', 'wars', 'production', 'market', 'country'].includes(HOA.UI.panel)) HOA.renderPanel();
        if (!input.sideDown) HOA.renderSide();
        if (!document.getElementById('focus').classList.contains('hidden') && S.day % 3 === 0) HOA.showFocusTree();
      }
    }
    requestAnimationFrame(loop);
  }

  function bindInput() {
    const cv = document.getElementById('map');
    const R = HOA.R;
    const tip = document.getElementById('tooltip');
    window.addEventListener('resize', () => HOA.resize());
    document.getElementById('panel').addEventListener('mousedown', () => (input.panelDown = true));
    document.getElementById('side').addEventListener('mousedown', () => (input.sideDown = true));
    window.addEventListener('mouseup', () => { input.panelDown = false; input.sideDown = false; });

    cv.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      Object.assign(input, { down: true, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, drag: false, shift: e.shiftKey });
      if (e.shiftKey && HOA.S.player) R.box = { x0: e.clientX, y0: e.clientY, x1: e.clientX, y1: e.clientY };
    });
    window.addEventListener('mousemove', (e) => {
      if (input.down) {
        if (R.box) { R.box.x1 = e.clientX; R.box.y1 = e.clientY; return; }
        const dx = e.clientX - input.x, dy = e.clientY - input.y;
        if (!input.drag && Math.hypot(e.clientX - input.sx, e.clientY - input.sy) > 4) input.drag = true;
        if (input.drag) {
          const k = 180 / Math.PI / R.view.scale;
          R.view.lon -= dx * k;
          R.view.lat = Math.max(-85, Math.min(85, R.view.lat + dy * k));
          HOA.viewChanged();
          tip.classList.add('hidden');
        }
        input.x = e.clientX; input.y = e.clientY;
        return;
      }
      if (e.target !== cv) { tip.classList.add('hidden'); return; }
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
        if (Math.abs(x1 - x0) > 4 || Math.abs(y1 - y0) > 4) {
          const [ax, bx, ay, by] = [Math.min(x0, x1), Math.max(x0, x1), Math.min(y0, y1), Math.max(y0, y1)];
          R.selected.clear();
          for (const c of R.counters) {
            if (c.tag !== HOA.S.player) continue;
            if (c.x + c.w > ax && c.x < bx && c.y + c.h > ay && c.y < by) c.units.forEach((u) => R.selected.add(u.id));
          }
          HOA.renderSide();
          return;
        }
      }
      if (input.drag || e.target !== cv) return;
      click(e);
    });
    cv.addEventListener('contextmenu', (e) => {
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
      HOA.renderSide();
    });
    cv.addEventListener('wheel', (e) => {
      e.preventDefault();
      const s0 = R.view.scale;
      const s1 = Math.max(260, Math.min(16000, s0 * Math.exp(-e.deltaY * 0.0015)));
      if (s1 > s0) {
        const ll = R.proj.invert([e.clientX, e.clientY]);
        if (ll && HOA.visible(ll)) {
          const c = d3.geoInterpolate([R.view.lon, R.view.lat], ll)(1 - s0 / s1);
          R.view.lon = c[0]; R.view.lat = c[1];
        }
      }
      R.view.scale = s1;
      HOA.viewChanged();
    }, { passive: false });
    window.addEventListener('keydown', (e) => {
      const S = HOA.S;
      if (!S.player || e.target.tagName === 'INPUT') return;
      if (e.code === 'Space') { e.preventDefault(); if (!S.modalPause) S.paused = !S.paused; HOA.renderTop(); }
      else if (/^Digit[1-5]$/.test(e.code)) { S.speed = +e.code.slice(5); HOA.renderTop(); }
      else if (e.code === 'Escape') {
        if (!document.getElementById('focus').classList.contains('hidden')) document.getElementById('focus').classList.add('hidden');
        else if (R.selected.size) { R.selected.clear(); HOA.renderSide(); }
        else if (HOA.UI.panel) HOA.openPanel(HOA.UI.panel);
        else { HOA.UI.side = null; R.selProv = -1; HOA.renderSide(); }
      } else if (e.code === 'KeyF') HOA.showFocusTree();
    });
  }

  function click(e) {
    const S = HOA.S, R = HOA.R;
    const cnt = HOA.pickCounter(e.clientX, e.clientY);
    if (cnt && S.player && cnt.tag === S.player) {
      if (!e.shiftKey) R.selected.clear();
      const all = cnt.units.every((u) => R.selected.has(u.id));
      cnt.units.forEach((u) => (all && e.shiftKey ? R.selected.delete(u.id) : R.selected.add(u.id)));
      HOA.renderSide();
      return;
    }
    const p = HOA.pickProvince(e.clientX, e.clientY);
    if (!e.shiftKey) R.selected.clear();
    R.selProv = p;
    if (p >= 0) HOA.showSide({ p, tag: S.ctrl[p] && S.owner[p] !== S.ctrl[p] && !S.player ? S.owner[p] : S.owner[p] || S.ctrl[p] });
    else { HOA.UI.side = null; HOA.renderSide(); }
    if (HOA.UI.panel === 'production' || HOA.UI.panel === 'army') HOA.renderPanel();
  }

  function showProvTip(p, e) {
    const S = HOA.S, tip = document.getElementById('tooltip');
    const o = S.owner[p], c = S.ctrl[p];
    let h = `<b>${HOA.provName(p)}</b>`;
    if (o) h += `<br>${S.countries[o].name}`;
    if (c && c !== o) h += ` <span class="neg">(okupuje ${S.countries[c].name})</span>`;
    if (S.fort[p]) h += `<br>Opevnění ${S.fort[p]}`;
    tip.innerHTML = h;
    placeTip(tip, e);
  }
  function showUnitTip(cnt, e) {
    const S = HOA.S, tip = document.getElementById('tooltip');
    const tc = {};
    cnt.units.forEach((u) => (tc[u.type] = (tc[u.type] || 0) + 1));
    let h = `<b>${S.countries[cnt.tag].name}</b> – ${cnt.units.length} divizí<br>` + Object.entries(tc).map(([t, n]) => `${n}× ${HOA.UNITS[t].name}`).join('<br>');
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
