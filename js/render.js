// Map renderer: WebGL globe (MapLibre GL, globe projection) for provinces, borders, front lines,
// occupation hatching and radiation; a thin 2D overlay canvas on top for unit counters, orders,
// battles, labels and effects (screen-space HUD elements that move every frame).
window.HOA = window.HOA || {};

HOA.R = {
  view: { lon: 33, lat: 49, scale: 2400 }, // read-only mirror of the camera; change it with HOA.setView
  mode: 'political',
  mapDirty: true,
  counters: [],
  selected: new Set(),
  hoverProv: -1,
  selProv: -1,
  box: null,
};
HOA.markMapDirty = function () { HOA.R.mapDirty = true; HOA.R.frontStale = true; };
HOA.viewChanged = function () { if (HOA.R.map) HOA.R.map.triggerRepaint(); };

const UNOWNED_ID = 100000; // feature ids for land without provinces (Antarctica)

// ---------- geometry ----------
// Clip polygon rings to an axis-aligned box (Sutherland–Hodgman). Cheap pre-pass so the exact
// polygon intersection below only sees the few hundred vertices near a Voronoi cell.
function clipRing(ring, x0, y0, x1, y1) {
  const edges = [
    (p) => p[0] >= x0, (a, b) => [x0, a[1] + ((b[1] - a[1]) * (x0 - a[0])) / (b[0] - a[0])],
    (p) => p[0] <= x1, (a, b) => [x1, a[1] + ((b[1] - a[1]) * (x1 - a[0])) / (b[0] - a[0])],
    (p) => p[1] >= y0, (a, b) => [a[0] + ((b[0] - a[0]) * (y0 - a[1])) / (b[1] - a[1]), y0],
    (p) => p[1] <= y1, (a, b) => [a[0] + ((b[0] - a[0]) * (y1 - a[1])) / (b[1] - a[1]), y1],
  ];
  let out = ring;
  for (let e = 0; e < 8 && out.length; e += 2) {
    const inside = edges[e], cut = edges[e + 1];
    const src = out;
    out = [];
    for (let i = 0; i < src.length; i++) {
      const a = src[i], b = src[(i + 1) % src.length];
      const ia = inside(a), ib = inside(b);
      if (ia) out.push(a);
      if (ia !== ib) out.push(cut(a, b));
    }
  }
  if (out.length < 3) return null;
  out.push(out[0]);
  return out;
}
function polysOf(g) { return g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []; }
function shiftPolys(polys, fn) { return polys.map((poly) => poly.map((ring) => ring.map(fn))); }

// One GeoJSON feature per province, with its exact shape. Regions split into several provinces
// are cut along their Voronoi cells (the old Canvas renderer did this with clip paths at draw time).
HOA.buildProvinceGeo = function (W) {
  const t0 = performance.now();
  const feats = [];
  const geom = new Array(W.provinces.length).fill(null);
  W.features.forEach((f, fi) => {
    const ids = W.featProv[fi];
    if (!f.geometry || !ids.length) return;
    if (ids.length === 1) { geom[ids[0]] = f.geometry; return; }
    const b = d3.geoBounds(f);
    const wrap = b[0][0] > b[1][0];
    let polys = polysOf(f.geometry);
    if (wrap) polys = shiftPolys(polys, (p) => (p[0] < 0 ? [p[0] + 360, p[1]] : p));
    for (const id of ids) {
      const cell = W.provinces[id].poly;
      if (!cell) continue;
      const ring = cell.coordinates[0];
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const p of ring) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
      // margin: the box pre-clip leaves zero-width slivers along its edges; keep them outside the cell
      x0 -= 0.5; y0 -= 0.5; x1 += 0.5; y1 += 0.5;
      const local = [];
      for (const poly of polys) {
        const outer = clipRing(poly[0].slice(0, -1), x0, y0, x1, y1);
        if (!outer) continue;
        const holes = poly.slice(1).map((h) => clipRing(h.slice(0, -1), x0, y0, x1, y1)).filter(Boolean);
        local.push([outer, ...holes]);
      }
      if (!local.length) continue;
      try {
        let res = polygonClipping.intersection(local, [ring]);
        // regions across the antimeridian were cut in 0..360° space: split the result back into ±180°
        if (wrap) {
          const box = (a, b) => [[[a, -90], [b, -90], [b, 90], [a, 90], [a, -90]]];
          const west = polygonClipping.intersection(res, box(-180, 180));
          const east = polygonClipping.intersection(res, box(180, 540)).map((poly) => poly.map((r) => r.map((p) => [p[0] - 360, p[1]])));
          res = west.concat(east);
        }
        if (res.length) geom[id] = { type: 'MultiPolygon', coordinates: res };
      } catch (e) {
        geom[id] = cell; // degenerate input: fall back to the raw cell
      }
    }
  });
  W.provinces.forEach((p, id) => { if (geom[id]) feats.push({ type: 'Feature', id, properties: {}, geometry: geom[id] }); });
  for (const fi of W.unowned) feats.push({ type: 'Feature', id: UNOWNED_ID + fi, properties: { u: 1 }, geometry: W.features[fi].geometry });
  W.provGeom = geom;
  HOA.R.geoBuildMs = performance.now() - t0;
  return { type: 'FeatureCollection', features: feats };
};

// ---------- init ----------
HOA.initRender = function (container, overlay, stars, W) {
  const R = HOA.R;
  R.W = W;
  R.overlay = overlay;
  R.ctx = overlay.getContext('2d');
  R.starsCanvas = stars;
  const rnd = HOA.rng(7);
  R.stars = [];
  for (let i = 0; i < 260; i++) R.stars.push([rnd(), rnd(), rnd() * 1.2 + 0.2, rnd()]);
  const provFC = HOA.buildProvinceGeo(W);
  const line = (data) => ({ type: 'geojson', data, tolerance: 0.5 });
  const empty = { type: 'FeatureCollection', features: [] };
  const style = {
    version: 8,
    projection: { type: 'globe' },
    sources: {
      prov: { type: 'geojson', data: provFC, tolerance: 0.3, buffer: 32 },
      grat: line(d3.geoGraticule10()),
      inner: line({ type: 'Feature', properties: {}, geometry: W.innerMesh }),
      borders: line({ type: 'Feature', properties: {}, geometry: W.borderMesh }),
      coast: line({ type: 'Feature', properties: {}, geometry: W.coast }),
      occ: { type: 'geojson', data: empty, tolerance: 0.3 },
      rad: { type: 'geojson', data: empty },
      front: { type: 'geojson', data: empty },
      hl: { type: 'geojson', data: empty },
    },
    layers: [
      { id: 'ocean', type: 'background', paint: { 'background-color': '#183847' } },
      { id: 'grat', type: 'line', source: 'grat', paint: { 'line-color': '#ffffff', 'line-opacity': 0.05, 'line-width': 0.6 } },
      // raised-land shadow (2.5D)
      { id: 'shadow', type: 'fill', source: 'prov', paint: { 'fill-color': '#000', 'fill-opacity': 0.55, 'fill-antialias': false, 'fill-translate': ['interpolate', ['linear'], ['zoom'], 2, ['literal', [0.8, 1.3]], 6, ['literal', [2.5, 4]]] } },
      { id: 'prov', type: 'fill', source: 'prov', paint: { 'fill-color': ['case', ['has', 'u'], '#e8eef3', ['to-color', ['coalesce', ['feature-state', 'c'], '#e9eef2']]] } },
      { id: 'occ', type: 'fill', source: 'occ', paint: { 'fill-pattern': ['get', 'pat'] } },
      { id: 'rad', type: 'fill', source: 'rad', paint: { 'fill-color': '#beff3c', 'fill-opacity': ['get', 'a'] } },
      { id: 'provlines', type: 'line', source: 'prov', minzoom: 4, paint: { 'line-color': '#141414', 'line-width': 0.5, 'line-opacity': ['interpolate', ['linear'], ['zoom'], 4, 0.08, 6, 0.22] } },
      { id: 'inner', type: 'line', source: 'inner', minzoom: 3, paint: { 'line-color': '#191919', 'line-width': ['interpolate', ['linear'], ['zoom'], 3, 0.5, 5, 0.8], 'line-opacity': ['interpolate', ['linear'], ['zoom'], 3, 0.12, 5.5, 0.4] } },
      { id: 'borders', type: 'line', source: 'borders', paint: { 'line-color': '#0f1216', 'line-opacity': 0.85, 'line-width': ['interpolate', ['linear'], ['zoom'], 2, 0.8, 4, 1.2, 6, 1.8] } },
      { id: 'coast', type: 'line', source: 'coast', paint: { 'line-color': '#0a1928', 'line-opacity': 0.9, 'line-width': 0.9 } },
      { id: 'front-glow', type: 'line', source: 'front', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#ff3c28', 'line-opacity': 0.35, 'line-width': 5 } },
      { id: 'front', type: 'line', source: 'front', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#ff4a2c', 'line-width': 1.8 } },
      { id: 'hl', type: 'line', source: 'hl', paint: { 'line-color': ['get', 'col'], 'line-width': ['get', 'w'] } },
    ],
  };
  const map = new maplibregl.Map({
    container, style,
    center: [R.view.lon, R.view.lat], zoom: 3,
    minZoom: 1, maxZoom: 8, maxPitch: 0,
    dragRotate: false, pitchWithRotate: false, touchPitch: false, keyboard: false,
    doubleClickZoom: false, boxZoom: false, attributionControl: false,
    fadeDuration: 0, renderWorldCopies: false,
    canvasContextAttributes: { antialias: true },
  });
  map.touchZoomRotate.disableRotation();
  R.map = map;
  R.colorOf = new Array(W.provinces.length).fill(null);
  map.on('render', () => HOA.drawOverlay(HOA.S));
  window.addEventListener('resize', HOA.resize);
  HOA.resize();
  return new Promise((resolve) => map.once('load', () => { HOA.syncView(); resolve(); }));
};

HOA.resize = function () {
  const R = HOA.R;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = window.innerWidth, h = window.innerHeight;
  R.dpr = dpr; R.w = w; R.h = h;
  for (const c of [R.overlay, R.starsCanvas]) {
    c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
    c.style.width = w + 'px'; c.style.height = h + 'px';
  }
  // space background with stars (static, drawn once per resize)
  const bx = R.starsCanvas.getContext('2d');
  bx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const bg = bx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.8);
  bg.addColorStop(0, '#141c26'); bg.addColorStop(1, '#05070b');
  bx.fillStyle = bg; bx.fillRect(0, 0, w, h);
  for (const [x, y, s, a] of R.stars) { bx.fillStyle = `rgba(255,255,255,${0.15 + a * 0.5})`; bx.fillRect(x * w, y * h, s, s); }
  if (R.map) R.map.resize();
};

// ---------- camera ----------
// R.view.scale = screen px per radian at the view centre (the old d3 orthographic scale).
// MapLibre's globe uses a perspective camera, so the visible rim is nearer than 90° and smaller than
// `scale`: it is found by walking along a meridian until the projected distance stops growing.
HOA.syncView = function () {
  const R = HOA.R, m = R.map;
  const c = m.getCenter();
  const a = m.project(c);
  const dir = c.lat >= 0 ? -1 : 1;
  const dist = (deg) => { const b = m.project([c.lng, c.lat + dir * deg]); return Math.hypot(b.x - a.x, b.y - a.y); };
  R.view.lon = c.lng;
  R.view.lat = c.lat;
  R.view.scale = dist(0.5) / ((0.5 * Math.PI) / 180);
  let best = 0, bd = 0;
  for (let d = 3; d <= 90; d += 3) { const v = dist(d); if (v > bd) { bd = v; best = d; } }
  for (let d = best - 2.75; d <= best + 2.75; d += 0.25) { const v = dist(d); if (v > bd) { bd = v; best = d; } }
  R.view.limb = bd; // rim radius in px
  R.view.limbAngle = (best * Math.PI) / 180; // angular radius of the visible cap
  R.view.cx = a.x; R.view.cy = a.y;
};
HOA.setView = function (v) {
  const R = HOA.R, m = R.map;
  const lon = v.lon != null ? v.lon : R.view.lon;
  const lat = v.lat != null ? Math.max(-85, Math.min(85, v.lat)) : R.view.lat;
  m.jumpTo({ center: [((lon + 540) % 360) - 180, lat] });
  if (v.scale) {
    HOA.syncView();
    m.jumpTo({ zoom: m.getZoom() + Math.log2(v.scale / R.view.scale) });
  }
  HOA.syncView();
};
HOA.project = function (ll) {
  const p = HOA.R.map.project(ll);
  return [p.x, p.y];
};
HOA.visible = function (lonlat, margin) {
  const R = HOA.R;
  return d3.geoDistance(lonlat, [R.view.lon, R.view.lat]) < (R.view.limbAngle || Math.PI / 2) - (margin || 0);
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

// occupation hatching: one 8×8 stripe image per owner colour
HOA.hatchImage = function (color) {
  const map = HOA.R.map;
  const name = 'hatch-' + color;
  if (map.hasImage(name)) return name;
  const c = document.createElement('canvas');
  c.width = c.height = 16;
  const x = c.getContext('2d');
  x.scale(2, 2);
  x.strokeStyle = color; x.lineWidth = 2.4; x.globalAlpha = 0.9;
  x.beginPath(); x.moveTo(-2, 10); x.lineTo(10, -2); x.moveTo(-2, 2); x.lineTo(2, -2); x.moveTo(6, 10); x.lineTo(10, 6); x.stroke();
  map.addImage(name, x.getImageData(0, 0, 16, 16), { pixelRatio: 2 });
  return name;
};

// Push game state into the WebGL layers. Colours go through feature-state (no geometry re-upload);
// the small dynamic sources (occupation, radiation, front) are rebuilt only when their content changes.
HOA.updateMapData = function (S) {
  const R = HOA.R, W = R.W, map = R.map;
  const cache = new Map();
  for (let p = 0; p < W.provinces.length; p++) {
    if (!W.provGeom[p]) continue;
    const t = S.ctrl[p];
    let col = cache.get(t);
    if (col === undefined) { col = HOA.provColor(S, p); cache.set(t, col); }
    if (R.colorOf[p] !== col) { R.colorOf[p] = col; map.setFeatureState({ source: 'prov', id: p }, { c: col }); }
  }
  // occupation
  const occ = [];
  let occKey = R.mode === 'political' ? 'p' : 'o';
  for (let p = 0; p < W.provinces.length; p++) {
    const o = S.owner[p];
    if (!o || S.ctrl[p] === o || !W.provGeom[p]) continue;
    occ.push(p);
    occKey += ',' + p + o;
  }
  if (occKey !== R.occKey) {
    R.occKey = occKey;
    map.getSource('occ').setData({
      type: 'FeatureCollection',
      features: occ.map((p) => ({ type: 'Feature', properties: { pat: HOA.hatchImage(R.mode === 'political' ? S.countries[S.owner[p]].color : 'rgba(255,255,255,0.5)') }, geometry: W.provGeom[p] })),
    });
  }
  // radiation
  let radKey = '';
  const rad = [];
  for (let p = 0; p < S.rad.length; p++) if (S.rad[p] > 0 && W.provGeom[p]) { rad.push(p); radKey += p + ':' + Math.round(S.rad[p] / 30) + ','; }
  if (radKey !== R.radKey) {
    R.radKey = radKey;
    map.getSource('rad').setData({ type: 'FeatureCollection', features: rad.map((p) => ({ type: 'Feature', properties: { a: 0.2 + 0.25 * (S.rad[p] / 365) }, geometry: W.provGeom[p] })) });
  }
  // front lines
  if (R.frontStale || !R.front) {
    HOA.computeFront(S);
    map.getSource('front').setData({ type: 'Feature', properties: {}, geometry: { type: 'MultiLineString', coordinates: R.front } });
  }
};

// Border polyline between two provinces; Voronoi edges are trimmed to the region shape once and cached.
HOA._frontCache = new Map();
HOA.frontLines = function (a, b) {
  const W = HOA.R.W;
  const key = a + '|' + b;
  if (HOA._frontCache.has(key)) return HOA._frontCache.get(key);
  const raw = W.pairBorder.get(key);
  let out = raw;
  const A = W.provinces[a], B = W.provinces[b];
  if (raw && A.fi === B.fi) {
    const f = W.features[A.fi];
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
  for (const a of W.provinces) {
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

// ---------- frame ----------
// Called from the game loop each animation frame. Map data is pushed at most ~3× per second;
// the overlay itself is drawn in MapLibre's 'render' event so it never lags behind the globe.
HOA.drawFrame = function (S) {
  const R = HOA.R, W = R.W;
  const now = performance.now();
  if (R.mapDirty && now - (R.lastData || 0) > 350) {
    HOA.updateMapData(S);
    R.mapDirty = false;
    R.lastData = now;
  }
  const hlKey = R.hoverProv + '|' + R.selProv;
  if (hlKey !== R.hlKey) {
    R.hlKey = hlKey;
    const feats = [];
    for (const [p, col, w] of [[R.hoverProv, 'rgba(255,255,255,0.55)', 1.2], [R.selProv, '#ffe066', 2]]) {
      if (p >= 0 && W.provGeom[p]) feats.push({ type: 'Feature', properties: { col, w }, geometry: W.provGeom[p] });
    }
    R.map.getSource('hl').setData({ type: 'FeatureCollection', features: feats });
  }
  // the overlay animates (unit movement, battle pulse, nuclear flashes): keep frames coming while it does
  const animating = (S.player && !S.paused && !S.modalPause) || (S.battles && S.battles.length) || S.nukeFx.length || R.box;
  if (animating) R.map.triggerRepaint();
};

HOA.drawOverlay = function (S) {
  const R = HOA.R;
  if (!S || !R.ctx) return;
  HOA.syncView();
  const ctx = R.ctx;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, R.overlay.width, R.overlay.height);
  ctx.setTransform(R.dpr, 0, 0, R.dpr, 0, 0);
  HOA.drawGlobeShade(ctx);
  HOA.drawLabels(S, ctx);
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

// atmosphere glow and 3D shading of the sphere (two gradients, only while the globe edge is on screen)
HOA.drawGlobeShade = function (ctx) {
  const R = HOA.R;
  const rad = R.view.limb, cx = R.view.cx, cy = R.view.cy;
  if (rad > Math.max(R.w, R.h) * 1.2) return;
  const glow = ctx.createRadialGradient(cx, cy, rad * 0.98, cx, cy, rad * 1.12);
  glow.addColorStop(0, 'rgba(110,170,230,0.45)');
  glow.addColorStop(1, 'rgba(110,170,230,0)');
  ctx.fillStyle = glow;
  ctx.beginPath(); ctx.arc(cx, cy, rad * 1.12, 0, Math.PI * 2); ctx.arc(cx, cy, rad, 0, Math.PI * 2, true); ctx.fill();
  const sh = ctx.createRadialGradient(cx - rad * 0.35, cy - rad * 0.4, rad * 0.05, cx, cy, rad * 1.02);
  sh.addColorStop(0, 'rgba(255,255,255,0.10)');
  sh.addColorStop(0.45, 'rgba(255,255,255,0)');
  sh.addColorStop(0.85, 'rgba(0,0,0,0.12)');
  sh.addColorStop(1, 'rgba(0,0,0,0.45)');
  ctx.fillStyle = sh;
  ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI * 2); ctx.fill();
};

HOA.drawLabels = function (S, ctx) {
  const R = HOA.R, W = R.W;
  const rad = R.view.scale;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const tag in S.countries) {
    const c = S.countries[tag];
    const d = W.defs[tag];
    if (!c.alive || !d || !d.label) continue;
    if (!HOA.visible(d.label, 0.15)) continue;
    const size = Math.sqrt(d.labelArea) * rad * 0.16;
    if (size < 8) continue;
    if (S.owner[c.capital] !== tag && !HOA.ownsAny(S, tag)) continue;
    const fs = Math.min(34, size);
    const pt = HOA.project(d.label);
    ctx.font = `600 ${fs}px "Trebuchet MS", "Segoe UI", sans-serif`;
    ctx.fillStyle = 'rgba(15,15,15,0.55)';
    HOA.spacedText(ctx, c.name.toUpperCase(), pt[0], pt[1], fs * 0.12);
  }
  // cities
  if (rad > 1500) {
    ctx.font = `500 11px "Segoe UI", sans-serif`;
    for (const p of W.provinces) {
      if (!p.city) continue;
      for (const ct of p.city) {
        if (ct.vp < (rad > 3000 ? 3 : 8)) continue;
        if (!HOA.visible([ct.lon, ct.lat], 0.05)) continue;
        const [x, y] = HOA.project([ct.lon, ct.lat]);
        if (x < -50 || y < -50 || x > R.w + 50 || y > R.h + 50) continue;
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

HOA.provXY = function (p) {
  const pr = HOA.R.W.provinces[p];
  return HOA.project([pr.lon, pr.lat]);
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
      xy.push(HOA.project([pr.lon, pr.lat]));
    }
    if (!vis || xy.length < 2) continue;
    const attack = HOA.atWar(S, u.tag, S.ctrl[u.path[0]]);
    ctx.strokeStyle = attack ? 'rgba(230,60,40,0.9)' : sel ? 'rgba(120,230,120,0.95)' : 'rgba(120,230,120,0.45)';
    ctx.lineWidth = sel ? 2.4 : 1.6;
    ctx.beginPath();
    ctx.moveTo(xy[0][0], xy[0][1]);
    for (let i = 1; i < xy.length; i++) ctx.lineTo(xy[i][0], xy[i][1]);
    ctx.stroke();
    HOA.arrowHead(ctx, xy[xy.length - 2], xy[xy.length - 1], sel ? 9 : 7);
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
  const W = HOA.R.W;
  if (!S.battles) return;
  for (const b of S.battles) {
    const pr = W.provinces[b.p];
    if (!HOA.visible([pr.lon, pr.lat], 0.02)) continue;
    const [x, y] = HOA.project([pr.lon, pr.lat]);
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
    if (!groups.has(u.p)) groups.set(u.p, new Map());
    const g = groups.get(u.p);
    if (!g.has(u.tag)) g.set(u.tag, []);
    g.get(u.tag).push(u);
  }
  const small = rad < 800;
  for (const [p, byTag] of groups) {
    const pr = W.provinces[p];
    if (!HOA.visible([pr.lon, pr.lat], 0.02)) continue;
    const [x0, y0] = HOA.project([pr.lon, pr.lat]);
    if (x0 < -60 || y0 < -40 || x0 > R.w + 60 || y0 > R.h + 40) continue;
    const tags = [...byTag.keys()];
    tags.forEach((tag, i) => {
      const list = byTag.get(tag);
      const c = S.countries[tag];
      const involved = tag === S.player || c.atWar || (S.player && HOA.allies(S, S.player, tag));
      if (small || (rad < 2000 && !involved)) {
        if (small && !involved) return;
        ctx.fillStyle = c.color;
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(x0 + i * 5, y0, 2.5 + Math.min(3, list.length * 0.3), 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        return;
      }
      const wBox = 44, hBox = 17;
      const x = x0 - wBox / 2 + (i - (tags.length - 1) / 2) * (wBox + 3);
      const y = y0 - hBox / 2;
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
    const [x, y] = HOA.project(pt);
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
  const W = HOA.R.W;
  const now = Date.now();
  S.nukeFx = S.nukeFx.filter((f) => now - f.t < 4500);
  for (const f of S.nukeFx) {
    const pr = W.provinces[f.p];
    if (!HOA.visible([pr.lon, pr.lat])) continue;
    const [x, y] = HOA.project([pr.lon, pr.lat]);
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
// GPU-side hit test: MapLibre returns the rendered feature under the cursor.
HOA.pickProvince = function (x, y) {
  const R = HOA.R;
  const hits = R.map.queryRenderedFeatures([x, y], { layers: ['prov'] });
  for (const f of hits) if (f.id < UNOWNED_ID) return f.id;
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

// ---------- preload ----------
// Generate everything that is otherwise created lazily mid-game (flag/unit bitmaps, hatch
// patterns, WebGL shader programs) while the loading screen is still up, so nothing hitches later.
HOA.FLAG_SIZES = [[18, 12], [24, 16], [30, 20], [36, 24], [48, 32], [60, 40], [72, 48]];
HOA._preloaded = []; // keeps decoded <img> objects alive so the browser does not evict them
HOA.preloadAssets = async function (S, progress) {
  const R = HOA.R, map = R.map;
  const yieldFrame = () => new Promise((r) => setTimeout(r, 0));
  const decode = (src) => {
    const img = new Image();
    img.src = src;
    HOA._preloaded.push(img);
    return img.decode().catch(() => {});
  };

  // 1) shader warm-up: give the empty dynamic layers one feature each and let MapLibre draw them
  progress('Připravuji grafiku…');
  const tags = Object.keys(S.countries);
  const p0 = firstDrawnProv(R.W);
  if (p0 >= 0) {
    const g = R.W.provGeom[p0];
    const pr = R.W.provinces[p0];
    const pt = [pr.lon, pr.lat], pt2 = [pr.lon + 0.5, pr.lat + 0.5];
    map.getSource('occ').setData({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: { pat: HOA.hatchImage('#ffffff') }, geometry: g }] });
    map.getSource('rad').setData({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: { a: 0.01 }, geometry: g }] });
    map.getSource('front').setData({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [pt, pt2] } });
    map.getSource('hl').setData({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: { col: '#ffffff', w: 1 }, geometry: { type: 'LineString', coordinates: [pt, pt2] } }] });
    // timeout: 'idle' never fires in a background tab
    await new Promise((r) => { map.once('idle', r); setTimeout(r, 2000); map.triggerRepaint(); });
    const empty = { type: 'FeatureCollection', features: [] };
    for (const id of ['occ', 'rad', 'front', 'hl']) map.getSource(id).setData(empty);
    R.occKey = R.radKey = R.front = undefined;
  }

  // 2) occupation hatch patterns for every country colour (+ the neutral one for non-political modes)
  HOA.hatchImage('rgba(255,255,255,0.5)');
  for (const t of tags) HOA.hatchImage(S.countries[t].color);

  // 3) flags in every size the UI uses, then unit symbols for armies that exist at start
  const jobs = [];
  for (const t of tags) for (const [w, h] of HOA.FLAG_SIZES) jobs.push(() => HOA.flagURL(t, w, h));
  const seen = new Set();
  for (const u of S.units) {
    const col = S.countries[u.tag].color, k = u.type + col;
    if (!seen.has(k)) { seen.add(k); jobs.push(() => HOA.symURL(u.type, col)); }
  }
  const decodes = [];
  let t0 = performance.now();
  for (let i = 0; i < jobs.length; i++) {
    decodes.push(decode(jobs[i]()));
    if (performance.now() - t0 > 30) {
      progress(`Připravuji vlajky a symboly… ${Math.round((i / jobs.length) * 100)} %`);
      await yieldFrame();
      t0 = performance.now();
    }
  }
  progress('Dekóduji textury…');
  await Promise.all(decodes);
};
function firstDrawnProv(W) { for (let p = 0; p < W.provinces.length; p++) if (W.provGeom[p]) return p; return -1; }
