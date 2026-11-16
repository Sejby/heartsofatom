// Globe renderer: 2.5D orthographic globe with provinces, borders, front lines, unit counters.
window.HOA = window.HOA || {};

HOA.R = {
  view: { lon: 33, lat: 49, scale: 2400 },
  mode: 'political',
  baseDirty: true,
  mapDirty: true,
  counters: [],
  selected: new Set(),
  hoverProv: -1,
  selProv: -1,
  box: null,
};
HOA.markMapDirty = function () { HOA.R.mapDirty = true; HOA.R.frontStale = true; };
// call on camera change: redraw base in fast mode until interaction settles
HOA.viewChanged = function () { HOA.R.baseDirty = true; HOA.R.interactUntil = performance.now() + 220; };

HOA.initRender = function (canvas, W) {
  const R = HOA.R;
  R.W = W;
  R.canvas = canvas;
  R.ctx = canvas.getContext('2d');
  R.base = document.createElement('canvas');
  R.fastBase = document.createElement('canvas');
  R.proj = d3.geoOrthographic().clipAngle(90).precision(0.6);
  R.path = d3.geoPath(R.proj);
  R.graticule = d3.geoGraticule10();
  // paper/terrain noise pattern
  const n = document.createElement('canvas');
  n.width = n.height = 160;
  const nctx = n.getContext('2d');
  const img = nctx.createImageData(160, 160);
  const rnd = HOA.rng(7);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 110 + rnd() * 145;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  nctx.putImageData(img, 0, 0);
  R.noise = n;
  // stars
  R.stars = [];
  for (let i = 0; i < 260; i++) R.stars.push([rnd(), rnd(), rnd() * 1.2 + 0.2, rnd()]);
  HOA.resize();
};

HOA.resize = function () {
  const R = HOA.R;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = window.innerWidth, h = window.innerHeight;
  R.dpr = dpr; R.w = w; R.h = h;
  for (const c of [R.canvas, R.base]) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
  R.fastBase.width = w; R.fastBase.height = h;
  R.bgCache = null; R.bgFast = null;
  R.canvas.style.width = w + 'px'; R.canvas.style.height = h + 'px';
  R.baseDirty = true;
};

HOA.applyView = function () {
  const R = HOA.R;
  R.proj.rotate([-R.view.lon, -R.view.lat]).scale(R.view.scale).translate([R.w / 2, R.h / 2 + 10]);
  // drop geometry outside the viewport early (big win when zoomed in)
  R.proj.clipExtent([[-20, -20], [R.w + 20, R.h + 20]]);
};

// angular radius of the globe area currently on screen
HOA.viewRadius = function () {
  const R = HOA.R;
  const k = Math.hypot(R.w, R.h) / 2 / R.view.scale;
  return k >= 1 ? Math.PI / 2 : Math.asin(k) + 0.04;
};
HOA.meshVisible = function (parts, center, vr) {
  const lines = [];
  for (const p of parts) if (d3.geoDistance(p.c, center) < vr + p.r) lines.push(p.coords);
  return { type: 'MultiLineString', coordinates: lines };
};

HOA.visible = function (lonlat, margin) {
  const R = HOA.R;
  return d3.geoDistance(lonlat, [R.view.lon, R.view.lat]) < Math.PI / 2 - (margin || 0);
};

// ---------- colours ----------
HOA.provColor = function (S, p) {
  const R = HOA.R;
  const tag = S.ctrl[p];
  if (!tag) return '#e9eef2';
  const c = S.countries[tag];
  switch (R.mode) {
    case 'faction': {
      const f = c.faction && S.factions[c.faction];
      return f ? f.color : '#8d9196';
    }
    case 'ideology':
      return HOA.IDEOLOGIES[c.ideo].color;
    case 'relations': {
      if (!S.player) return c.color;
      if (tag === S.player) return '#3f7fbf';
      if (HOA.atWar(S, S.player, tag)) return '#7d1e1e';
      const r = HOA.getRel(S, S.player, tag);
      const t = Math.max(-1, Math.min(1, r / 150));
      return t >= 0 ? d3.interpolateRgb('#9a9a8a', '#3f9f4a')(t) : d3.interpolateRgb('#9a9a8a', '#c0503a')(-t);
    }
    case 'war': {
      if (!S.player) return '#8d9196';
      if (tag === S.player) return '#3f7fbf';
      if (HOA.atWar(S, S.player, tag)) return '#b03a2e';
      if (HOA.allies(S, S.player, tag)) return '#6fa8dc';
      return c.atWar ? '#b59a6a' : '#8d9196';
    }
    default:
      return c.color;
  }
};

// ---------- base layer ----------
// Geometry level of detail by zoom; coarser while the user drags/zooms.
HOA.pickLod = function (fast) {
  const R = HOA.R, W = R.W;
  const pxPerDeg = (R.view.scale * Math.PI) / 180;
  const limit = fast ? 3.5 : 1.2;
  for (const g of W.lods) if (g.eps * pxPerDeg <= limit) return g;
  return W.lods[W.lods.length - 1];
};

HOA._hatch = {};
HOA.hatchPattern = function (ctx, color) {
  if (HOA._hatch[color]) return HOA._hatch[color];
  const c = document.createElement('canvas');
  c.width = c.height = 8;
  const x = c.getContext('2d');
  x.strokeStyle = color; x.lineWidth = 2.4; x.globalAlpha = 0.9;
  x.beginPath(); x.moveTo(-2, 10); x.lineTo(10, -2); x.moveTo(-2, 2); x.lineTo(2, -2); x.moveTo(6, 10); x.lineTo(10, 6); x.stroke();
  return (HOA._hatch[color] = ctx.createPattern(c, 'repeat'));
};

HOA.drawBase = function (S, fast) {
  const R = HOA.R, W = R.W;
  const cv = fast ? R.fastBase : R.base;
  const ctx = cv.getContext('2d');
  const dpr = fast ? 1 : R.dpr;
  R.proj.precision(fast ? 2.5 : 0.8);
  const path = d3.geoPath(R.proj, ctx);
  const G = HOA.pickLod(fast);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  // space background (cached)
  if (!R.bgCache || R.bgCache.width !== cv.width) {
    const b = document.createElement('canvas');
    b.width = cv.width; b.height = cv.height;
    const bx = b.getContext('2d');
    bx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const bg = bx.createRadialGradient(R.w / 2, R.h / 2, 0, R.w / 2, R.h / 2, Math.max(R.w, R.h) * 0.8);
    bg.addColorStop(0, '#141c26'); bg.addColorStop(1, '#05070b');
    bx.fillStyle = bg; bx.fillRect(0, 0, R.w, R.h);
    for (const [x, y, s, a] of R.stars) { bx.fillStyle = `rgba(255,255,255,${0.15 + a * 0.5})`; bx.fillRect(x * R.w, y * R.h, s, s); }
    if (!fast) R.bgCache = b; else R.bgFast = b;
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(fast ? R.bgFast || R.bgCache : R.bgCache, 0, 0, cv.width, cv.height);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const [cx, cy] = R.proj.translate();
  const rad = R.proj.scale();
  const globeOnScreen = rad < Math.max(R.w, R.h) * 1.2;
  if (globeOnScreen) {
    const glow = ctx.createRadialGradient(cx, cy, rad * 0.98, cx, cy, rad * 1.12);
    glow.addColorStop(0, 'rgba(110,170,230,0.45)');
    glow.addColorStop(1, 'rgba(110,170,230,0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(cx, cy, rad * 1.12, 0, Math.PI * 2); ctx.fill();
  }
  const oc = ctx.createRadialGradient(cx - rad * 0.3, cy - rad * 0.35, rad * 0.1, cx, cy, rad);
  oc.addColorStop(0, '#2a5a6e'); oc.addColorStop(0.7, '#183847'); oc.addColorStop(1, '#0d2230');
  ctx.fillStyle = oc;
  ctx.beginPath(); path({ type: 'Sphere' }); ctx.fill();
  if (!fast) {
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 0.6;
    ctx.beginPath(); path(R.graticule); ctx.stroke();
  }
  const center = [R.view.lon, R.view.lat];
  const vr = HOA.viewRadius();
  const visFeat = [];
  const land2d = new Path2D();
  const fpath = new Map();
  const colorCache = new Map();
  const colorOf = (p) => {
    const t = S.ctrl[p];
    let c = colorCache.get(t);
    if (c === undefined) { c = HOA.provColor(S, p); colorCache.set(t, c); }
    return c;
  };
  // countries with one colour and no occupation are filled as a single merged shape
  const wholeFill = [];
  for (const t in W.countryInfo) {
    const ci = W.countryInfo[t];
    if (d3.geoDistance(ci.c, center) > vr + ci.r) continue;
    let col = null, simple = true;
    for (const fi of ci.fis) {
      for (const p of W.featProv[fi]) {
        const c = colorOf(p);
        if (col === null) col = c;
        if (c !== col || S.ctrl[p] !== S.owner[p]) { simple = false; break; }
      }
      if (!simple) break;
    }
    // merged shape only when the whole country is roughly on screen; otherwise draw just the visible regions
    if (simple && col !== null && ci.r <= vr * 1.2) {
      const p2 = new Path2D();
      d3.geoPath(R.proj, p2)(G.countries[t]);
      land2d.addPath(p2);
      wholeFill.push([p2, col]);
      continue;
    }
    for (const fi of ci.fis) {
      const info = W.featInfo[fi];
      if (info.r < 0 || d3.geoDistance(info.c, center) > vr + info.r) continue;
      visFeat.push(fi);
      const p2 = new Path2D();
      d3.geoPath(R.proj, p2)(G.features[fi]);
      fpath.set(fi, p2);
      land2d.addPath(p2);
    }
  }
  // unowned land (Antarctica)
  for (const fi of W.unowned) {
    const info = W.featInfo[fi];
    if (info.r < 0 || d3.geoDistance(info.c, center) > vr + info.r) continue;
    visFeat.push(fi);
    const p2 = new Path2D();
    d3.geoPath(R.proj, p2)(G.features[fi]);
    fpath.set(fi, p2);
    land2d.addPath(p2);
  }
  // raised-land shadow (2.5D)
  const off = Math.max(1.5, Math.min(5, rad / 900));
  ctx.save();
  ctx.translate(off * 0.5, off * 0.8);
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fill(land2d);
  ctx.restore();

  for (const [p2, col] of wholeFill) { ctx.fillStyle = col; ctx.fill(p2); }
  const hatch = [];
  for (const fi of visFeat) {
    const f = G.features[fi];
    const provs = W.featProv[fi];
    if (!provs.length) {
      ctx.fillStyle = '#e8eef3';
      ctx.fill(fpath.get(fi));
      continue;
    }
    const col0 = colorOf(provs[0]);
    let uniform = true, occ = false;
    for (const p of provs) {
      if (colorOf(p) !== col0) uniform = false;
      if (S.ctrl[p] !== S.owner[p]) occ = true;
    }
    ctx.fillStyle = col0;
    ctx.fill(fpath.get(fi));
    if (!uniform && provs.length > 1) {
      ctx.save();
      ctx.clip(fpath.get(fi));
      const groups = new Map();
      for (const p of provs) {
        const c = colorOf(p);
        if (c === col0) continue;
        if (!groups.has(c)) groups.set(c, []);
        groups.get(c).push(p);
      }
      for (const [c, list] of groups) {
        ctx.fillStyle = c;
        ctx.beginPath();
        for (const p of list) path(W.provinces[p].poly);
        ctx.fill();
      }
      ctx.restore();
    }
    if (occ) hatch.push(fi);
  }
  // occupation hatching (owner colour stripes via cached pattern)
  for (const fi of hatch) {
    const f = G.features[fi];
    const provs = W.featProv[fi];
    const byOwner = new Map();
    for (const p of provs) {
      if (S.ctrl[p] === S.owner[p] || !S.owner[p]) continue;
      const o = S.owner[p];
      if (!byOwner.has(o)) byOwner.set(o, []);
      byOwner.get(o).push(p);
    }
    for (const [o, list] of byOwner) {
      ctx.fillStyle = HOA.hatchPattern(ctx, R.mode === 'political' ? S.countries[o].color : 'rgba(255,255,255,0.5)');
      if (provs.length === 1) { ctx.fill(fpath.get(fi)); continue; }
      ctx.save();
      ctx.clip(fpath.get(fi));
      ctx.beginPath();
      for (const p of list) path(W.provinces[p].poly);
      ctx.fill();
      ctx.restore();
    }
  }
  // texture, province borders, radiation (clipped to land)
  const zoomBorders = !fast && rad > 1300;
  const anyRad = S.rad.some((x) => x > 0);
  if (!fast || anyRad) {
    ctx.save();
    ctx.clip(land2d);
    if (!fast) {
      ctx.globalAlpha = 0.07;
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = R.noisePat || (R.noisePat = ctx.createPattern(R.noise, 'repeat'));
      ctx.fillRect(0, 0, R.w, R.h);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }
    if (zoomBorders) {
      ctx.strokeStyle = 'rgba(20,20,20,' + Math.min(0.22, (rad - 1300) / 6000 + 0.08) + ')';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      for (const fi of visFeat) {
        const provs = W.featProv[fi];
        if (provs.length < 2) continue;
        for (const p of provs) {
          const pr = W.provinces[p];
          if (d3.geoDistance([pr.lon, pr.lat], center) < vr + 0.08) path(pr.poly);
        }
      }
      ctx.stroke();
    }
    if (anyRad) for (let p = 0; p < S.rad.length; p++) {
      if (S.rad[p] <= 0) continue;
      const pr = W.provinces[p];
      if (!HOA.visible([pr.lon, pr.lat])) continue;
      ctx.fillStyle = `rgba(190,255,60,${0.2 + 0.25 * (S.rad[p] / 365)})`;
      ctx.beginPath(); path(pr.poly || G.features[pr.fi]); ctx.fill();
    }
    ctx.restore();
  }
  // borders
  if (!fast && rad > 700) {
    ctx.strokeStyle = `rgba(25,25,25,${Math.min(0.4, 0.12 + (rad - 700) / 5000)})`;
    ctx.lineWidth = rad > 2000 ? 0.8 : 0.5;
    ctx.beginPath(); path(HOA.meshVisible(G.innerMeshParts, center, vr)); ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(15,18,22,0.85)';
  ctx.lineWidth = Math.max(0.8, Math.min(1.8, rad / 1500));
  ctx.beginPath(); path(HOA.meshVisible(G.borderMeshParts, center, vr)); ctx.stroke();
  ctx.strokeStyle = 'rgba(10,25,40,0.9)';
  ctx.lineWidth = 0.9;
  ctx.beginPath(); path(HOA.meshVisible(G.coastParts, center, vr)); ctx.stroke();
  // front lines (pre-trimmed to land, single path)
  if (R.frontStale || !R.front) HOA.computeFront(S);
  if (R.front.length) {
    const fl = { type: 'MultiLineString', coordinates: R.front };
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); path(fl);
    if (!fast) { ctx.strokeStyle = 'rgba(255,60,40,0.35)'; ctx.lineWidth = 5; ctx.stroke(); }
    ctx.strokeStyle = '#ff4a2c'; ctx.lineWidth = 1.8; ctx.stroke();
  }
  // globe shading (3D)
  const sh = ctx.createRadialGradient(cx - rad * 0.35, cy - rad * 0.4, rad * 0.05, cx, cy, rad * 1.02);
  sh.addColorStop(0, 'rgba(255,255,255,0.10)');
  sh.addColorStop(0.45, 'rgba(255,255,255,0)');
  sh.addColorStop(0.85, 'rgba(0,0,0,0.12)');
  sh.addColorStop(1, 'rgba(0,0,0,0.45)');
  ctx.fillStyle = sh;
  ctx.beginPath(); path({ type: 'Sphere' }); ctx.fill();
  HOA.drawLabels(S, ctx, path, fast);
};

// Border polyline between two provinces; Voronoi edges are trimmed to the country shape once and cached.
HOA._frontCache = new Map();
HOA.frontLines = function (a, b) {
  const W = HOA.R.W;
  const key = a + '|' + b;
  if (HOA._frontCache.has(key)) return HOA._frontCache.get(key);
  const raw = W.pairBorder.get(key);
  let out = raw;
  const A = W.provinces[a], B = W.provinces[b];
  if (raw && A.fi === B.fi) {
    const f = W.lods[1].features[A.fi];
    out = [];
    for (const line of raw) {
      let cur = [];
      for (const p of line) {
        if (d3.geoContains(f, p)) cur.push(p);
        else { if (cur.length > 1) out.push(cur); cur = []; }
      }
      if (cur.length > 1) out.push(cur);
    }
  }
  HOA._frontCache.set(key, out);
  return out;
};

HOA.computeFront = function (S) {
  const R = HOA.R, W = R.W;
  const segs = [];
  const P = W.provinces;
  for (const a of P) {
    const ca = S.ctrl[a.id];
    if (!ca) continue;
    for (const e of a.nb) {
      if (e.p < a.id || e.sea) continue;
      const cb = S.ctrl[e.p];
      if (!cb || ca === cb || !HOA.atWar(S, ca, cb)) continue;
      const lines = HOA.frontLines(a.id, e.p);
      if (lines) for (const l of lines) segs.push(l);
    }
  }
  R.front = segs;
  R.frontStale = false;
};

HOA.drawLabels = function (S, ctx, path, fast) {
  const R = HOA.R, W = R.W;
  const rad = R.proj.scale();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const tag in S.countries) {
    const c = S.countries[tag];
    const d = W.defs[tag];
    if (!c.alive || !d || !d.label) continue;
    if (!HOA.visible(d.label, 0.15)) continue;
    if (S.owner[c.capital] !== tag && !HOA.ownsAny(S, tag)) continue;
    const size = Math.sqrt(d.labelArea) * rad * 0.16;
    if (size < 8) continue;
    const fs = Math.min(34, size);
    const pt = R.proj(d.label);
    ctx.font = `600 ${fs}px "Trebuchet MS", "Segoe UI", sans-serif`;
    ctx.fillStyle = 'rgba(15,15,15,0.55)';
    const txt = c.name.toUpperCase();
    HOA.spacedText(ctx, txt, pt[0], pt[1], fs * 0.12);
  }
  // cities
  if (rad > 1500 && !fast) {
    ctx.font = `500 11px "Segoe UI", sans-serif`;
    for (const p of W.provinces) {
      if (!p.city) continue;
      for (const ct of p.city) {
        if (ct.vp < (rad > 3000 ? 3 : 8)) continue;
        if (!HOA.visible([ct.lon, ct.lat], 0.05)) continue;
        const [x, y] = R.proj([ct.lon, ct.lat]);
        ctx.fillStyle = ct.cap ? '#f5d76e' : '#f2f2f2';
        ctx.strokeStyle = '#111';
        ctx.lineWidth = 1;
        ctx.beginPath();
        if (ct.cap) HOA.star(ctx, x, y, 5, 2.3);
        else ctx.arc(x, y, 2.6, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();
        if (rad > 2200) {
          ctx.fillStyle = 'rgba(255,255,255,0.92)';
          ctx.strokeStyle = 'rgba(0,0,0,0.75)';
          ctx.lineWidth = 2.5;
          ctx.strokeText(ct.name, x, y - 10);
          ctx.fillText(ct.name, x, y - 10);
        }
      }
    }
  }
};
HOA.ownsAny = function (S, tag) {
  for (let i = 0; i < S.owner.length; i++) if (S.owner[i] === tag) return true;
  return false;
};
HOA.spacedText = function (ctx, txt, x, y, sp) {
  if ('letterSpacing' in ctx) {
    ctx.letterSpacing = sp.toFixed(1) + 'px';
    ctx.fillText(txt, x + sp / 2, y);
    ctx.letterSpacing = '0px';
    return;
  }
  const widths = [...txt].map((ch) => ctx.measureText(ch).width + sp);
  const total = widths.reduce((a, b) => a + b, 0) - sp;
  let cx = x - total / 2;
  ctx.textAlign = 'left';
  [...txt].forEach((ch, i) => { ctx.fillText(ch, cx, y); cx += widths[i]; });
  ctx.textAlign = 'center';
};
HOA.star = function (ctx, x, y, r, r2) {
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r2 : r;
    if (i === 0) ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    else ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
};

// ---------- frame ----------
HOA.drawFrame = function (S) {
  const R = HOA.R, W = R.W;
  HOA.applyView();
  const now = performance.now();
  const interacting = now < (R.interactUntil || 0);
  if (R.baseDirty || (R.mapDirty && now - (R.lastBase || 0) > 350) || (!interacting && R.baseFast)) {
    HOA.drawBase(S, interacting);
    R.proj.precision(2);
    R.baseFast = interacting;
    R.baseDirty = false;
    R.mapDirty = false;
    R.lastBase = now;
  }
  const ctx = R.ctx;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(R.baseFast ? R.fastBase : R.base, 0, 0, R.canvas.width, R.canvas.height);
  HOA.applyView();
  ctx.setTransform(R.dpr, 0, 0, R.dpr, 0, 0);
  const path = d3.geoPath(R.proj, ctx);
  // selected / hovered province outline
  for (const [p, col, w] of [[R.hoverProv, 'rgba(255,255,255,0.55)', 1.2], [R.selProv, '#ffe066', 2]]) {
    if (p < 0) continue;
    const pr = W.provinces[p];
    if (!HOA.visible([pr.lon, pr.lat])) continue;
    ctx.save();
    const lf = HOA.pickLod(true).features[pr.fi];
    ctx.beginPath(); path(lf); ctx.clip();
    ctx.strokeStyle = col; ctx.lineWidth = w;
    ctx.beginPath(); path(pr.poly || lf); ctx.stroke();
    ctx.restore();
  }
  HOA.drawOrders(S, ctx);
  HOA.drawBattles(S, ctx);
  HOA.drawUnits(S, ctx);
  HOA.drawFx(S, ctx);
  if (R.box) {
    ctx.strokeStyle = '#ffe066'; ctx.lineWidth = 1; ctx.setLineDash([4, 3]);
    ctx.fillStyle = 'rgba(255,224,102,0.08)';
    const { x0, y0, x1, y1 } = R.box;
    ctx.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
    ctx.strokeRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
    ctx.setLineDash([]);
  }
};

HOA.provXY = function (p) {
  const pr = HOA.R.W.provinces[p];
  return HOA.R.proj([pr.lon, pr.lat]);
};

HOA.drawOrders = function (S, ctx) {
  const R = HOA.R, W = R.W;
  const showAll = R.view.scale > 900;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const u of S.units) {
    if (u.tr || !u.path.length) continue;
    const mine = u.tag === S.player;
    const sel = R.selected.has(u.id);
    if (!sel && !(mine && showAll)) continue;
    const pts = [u.p].concat(u.path);
    const xy = [];
    let vis = true;
    for (const p of pts) {
      const pr = W.provinces[p];
      if (!HOA.visible([pr.lon, pr.lat])) { vis = false; break; }
      xy.push(R.proj([pr.lon, pr.lat]));
    }
    if (!vis || xy.length < 2) continue;
    const attack = HOA.atWar(S, u.tag, S.ctrl[u.path[0]]);
    ctx.strokeStyle = attack ? 'rgba(230,60,40,0.9)' : sel ? 'rgba(120,230,120,0.95)' : 'rgba(120,230,120,0.45)';
    ctx.lineWidth = sel ? 2.4 : 1.6;
    ctx.beginPath();
    ctx.moveTo(xy[0][0], xy[0][1]);
    // progress along first leg
    for (let i = 1; i < xy.length; i++) ctx.lineTo(xy[i][0], xy[i][1]);
    ctx.stroke();
    const a = xy[xy.length - 2], b = xy[xy.length - 1];
    HOA.arrowHead(ctx, a, b, sel ? 9 : 7);
  }
};
HOA.arrowHead = function (ctx, a, b, s) {
  const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
  ctx.fillStyle = ctx.strokeStyle;
  ctx.beginPath();
  ctx.moveTo(b[0], b[1]);
  ctx.lineTo(b[0] - s * Math.cos(ang - 0.45), b[1] - s * Math.sin(ang - 0.45));
  ctx.lineTo(b[0] - s * Math.cos(ang + 0.45), b[1] - s * Math.sin(ang + 0.45));
  ctx.closePath();
  ctx.fill();
};

HOA.drawBattles = function (S, ctx) {
  const R = HOA.R, W = R.W;
  if (!S.battles) return;
  for (const b of S.battles) {
    const pr = W.provinces[b.p];
    if (!HOA.visible([pr.lon, pr.lat], 0.02)) continue;
    const [x, y] = R.proj([pr.lon, pr.lat]);
    const adv = b.A / (b.A + b.D + 0.01);
    const playerAtt = b.atTag === S.player || (S.player && HOA.allies(S, S.player, b.atTag) && !HOA.atWar(S, S.player, b.atTag));
    const good = playerAtt ? adv : 1 - adv;
    const by = y - 26;
    const pulse = 0.6 + 0.4 * Math.sin(performance.now() / 180);
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.beginPath(); ctx.arc(x, by, 10, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = S.player && (b.atTag === S.player || b.defTag === S.player || playerAtt) ? d3.interpolateRdYlGn(good) : '#ddd';
    ctx.lineWidth = 2 + pulse;
    ctx.stroke();
    // crossed swords
    ctx.strokeStyle = '#f3e6c4'; ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(x - 5, by - 5); ctx.lineTo(x + 5, by + 5);
    ctx.moveTo(x + 5, by - 5); ctx.lineTo(x - 5, by + 5);
    ctx.moveTo(x - 6, by + 2); ctx.lineTo(x - 2, by + 6);
    ctx.moveTo(x + 6, by + 2); ctx.lineTo(x + 2, by + 6);
    ctx.stroke();
  }
};

HOA.unitSymbol = function (ctx, type, x, y, w, h) {
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, w, h);
  ctx.beginPath();
  const cx = x + w / 2, cy = y + h / 2;
  switch (type) {
    case 'INF': ctx.moveTo(x, y); ctx.lineTo(x + w, y + h); ctx.moveTo(x + w, y); ctx.lineTo(x, y + h); break;
    case 'MOT': ctx.moveTo(x, y); ctx.lineTo(x + w, y + h); ctx.moveTo(x + w, y); ctx.lineTo(x, y + h); ctx.moveTo(cx, y); ctx.lineTo(cx, y + h); break;
    case 'MECH': ctx.moveTo(x, y); ctx.lineTo(x + w, y + h); ctx.moveTo(x + w, y); ctx.lineTo(x, y + h); ctx.ellipse(cx, cy, w * 0.32, h * 0.28, 0, 0, Math.PI * 2); break;
    case 'ARM': ctx.ellipse(cx, cy, w * 0.34, h * 0.3, 0, 0, Math.PI * 2); break;
    case 'ART': ctx.arc(cx, cy, 2, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill(); break;
    case 'AIRB': ctx.moveTo(x, y); ctx.lineTo(x + w, y + h); ctx.moveTo(x + w, y); ctx.lineTo(x, y + h); ctx.moveTo(cx - 5, cy + 3); ctx.quadraticCurveTo(cx, cy - 5, cx + 5, cy + 3); break;
    case 'AA': ctx.moveTo(x + 2, y + h - 1); ctx.quadraticCurveTo(cx, y - 2, x + w - 2, y + h - 1); break;
    case 'DRN': ctx.moveTo(x + 3, y + 3); ctx.lineTo(cx, y + h - 2); ctx.lineTo(x + w - 3, y + 3); break;
  }
  ctx.stroke();
};

HOA.drawUnits = function (S, ctx) {
  const R = HOA.R, W = R.W;
  R.counters = [];
  const rad = R.view.scale;
  const groups = new Map();
  for (const u of S.units) {
    if (u.tr) continue;
    const key = u.p;
    if (!groups.has(key)) groups.set(key, new Map());
    const g = groups.get(key);
    if (!g.has(u.tag)) g.set(u.tag, []);
    g.get(u.tag).push(u);
  }
  const small = rad < 800;
  for (const [p, byTag] of groups) {
    const pr = W.provinces[p];
    if (!HOA.visible([pr.lon, pr.lat], 0.02)) continue;
    const [x0, y0] = R.proj([pr.lon, pr.lat]);
    const tags = [...byTag.keys()];
    tags.forEach((tag, i) => {
      const list = byTag.get(tag);
      const c = S.countries[tag];
      const involved = tag === S.player || c.atWar || (S.player && HOA.allies(S, S.player, tag));
      if (small || (rad < 2000 && !involved)) {
        if (small && !involved) return;
        ctx.fillStyle = c.color;
        ctx.strokeStyle = '#000';
        ctx.beginPath(); ctx.arc(x0 + i * 5, y0, 2.5 + Math.min(3, list.length * 0.3), 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        return;
      }
      const wBox = 44, hBox = 17;
      const x = x0 - wBox / 2 + (i - (tags.length - 1) / 2) * (wBox + 3);
      const moving = list.some((u) => u.path.length);
      const y = y0 - hBox / 2 - (moving ? 0 : 0);
      const sel = list.some((u) => R.selected.has(u.id));
      // shadow (2.5D)
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(x + 2, y + 3, wBox, hBox + 5);
      // body
      const enemy = S.player && HOA.atWar(S, S.player, tag);
      ctx.fillStyle = tag === S.player ? '#1f2a33' : enemy ? '#3a1414' : '#262626';
      ctx.fillRect(x, y, wBox, hBox);
      ctx.fillStyle = c.color;
      ctx.fillRect(x, y, 19, hBox);
      // dominant type
      const tc = {};
      list.forEach((u) => (tc[u.type] = (tc[u.type] || 0) + 1));
      const dom = Object.keys(tc).sort((a, b) => tc[b] - tc[a])[0];
      HOA.unitSymbol(ctx, dom, x + 3, y + 3.5, 13, 10);
      ctx.fillStyle = '#f2ead2';
      ctx.font = 'bold 11px "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(list.length), x + 31, y + hBox / 2 + 0.5);
      // bars
      let org = 0, orgMax = 0, str = 0;
      for (const u of list) { org += Math.max(0, u.org); orgMax += HOA.maxOrg(S, u); str += u.str; }
      const ob = Math.max(0, Math.min(1, org / orgMax)), sb = str / list.length;
      ctx.fillStyle = '#111';
      ctx.fillRect(x, y + hBox, wBox, 5);
      ctx.fillStyle = '#5fbf3f';
      ctx.fillRect(x, y + hBox, wBox * ob, 2.5);
      ctx.fillStyle = '#d9b43c';
      ctx.fillRect(x, y + hBox + 2.5, wBox * sb, 2.5);
      ctx.strokeStyle = sel ? '#ffe066' : enemy ? '#c0392b' : 'rgba(0,0,0,0.9)';
      ctx.lineWidth = sel ? 2 : 1;
      ctx.strokeRect(x - 0.5, y - 0.5, wBox + 1, hBox + 6);
      if (list.some((u) => u.inBattle)) {
        ctx.fillStyle = '#ff5a3c';
        ctx.beginPath(); ctx.arc(x + wBox - 1, y + 1, 3, 0, Math.PI * 2); ctx.fill();
      }
      R.counters.push({ x, y, w: wBox, h: hBox + 5, units: list, tag, p });
    });
  }
  // strategic transports
  for (const u of S.units) {
    if (!u.tr) continue;
    const a = W.provinces[u.tr.from], b = W.provinces[u.tr.to];
    const k = Math.max(0, Math.min(1, (S.t - u.tr.t0) / (u.tr.eta - u.tr.t0)));
    const pt = d3.geoInterpolate([a.lon, a.lat], [b.lon, b.lat])(k);
    if (!HOA.visible(pt)) continue;
    const [x, y] = R.proj(pt);
    ctx.fillStyle = S.countries[u.tag].color;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x - 7, y); ctx.lineTo(x + 7, y); ctx.lineTo(x + 4, y + 4); ctx.lineTo(x - 4, y + 4); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 7); ctx.lineTo(x + 5, y - 2); ctx.closePath(); ctx.fill();
  }
};

HOA.drawFx = function (S, ctx) {
  const R = HOA.R, W = R.W;
  const now = Date.now();
  S.nukeFx = S.nukeFx.filter((f) => now - f.t < 4500);
  for (const f of S.nukeFx) {
    const pr = W.provinces[f.p];
    if (!HOA.visible([pr.lon, pr.lat])) continue;
    const [x, y] = R.proj([pr.lon, pr.lat]);
    const k = (now - f.t) / 4500;
    if (f.intercepted) {
      ctx.strokeStyle = `rgba(120,200,255,${1 - k})`;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(x, y - 60 * (1 - k), 10 + k * 30, 0, Math.PI * 2); ctx.stroke();
      continue;
    }
    const r = 10 + k * 120;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(255,255,230,${1 - k})`);
    g.addColorStop(0.3, `rgba(255,200,80,${0.9 * (1 - k)})`);
    g.addColorStop(1, 'rgba(255,80,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = `rgba(255,255,255,${0.8 * (1 - k)})`;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, r * 1.3, 0, Math.PI * 2); ctx.stroke();
  }
};

// ---------- picking ----------
HOA.pickProvince = function (x, y) {
  const R = HOA.R, W = R.W;
  const ll = R.proj.invert([x, y]);
  if (!ll || isNaN(ll[0]) || !HOA.visible(ll)) return -1;
  // candidate features from nearest seeds
  const cands = [];
  for (const p of W.provinces) {
    const d = d3.geoDistance(ll, [p.lon, p.lat]);
    if (d < 0.14) cands.push([d, p]);
  }
  cands.sort((a, b) => a[0] - b[0]);
  const feats = [...new Set(cands.slice(0, 12).map((c) => c[1].fi))];
  for (const fi of feats) {
    if (!d3.geoContains(W.features[fi], ll)) continue;
    let best = -1, bd = 1e9;
    for (const id of W.featProv[fi]) {
      const d = d3.geoDistance(ll, [W.provinces[id].lon, W.provinces[id].lat]);
      if (d < bd) { bd = d; best = id; }
    }
    return best;
  }
  return -1;
};
HOA.pickCounter = function (x, y) {
  const cs = HOA.R.counters;
  for (let i = cs.length - 1; i >= 0; i--) {
    const c = cs[i];
    if (x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h) return c;
  }
  return null;
};
