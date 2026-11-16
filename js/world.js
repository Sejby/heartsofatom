// World construction: real admin-1 regions -> provinces (large ones split), countries, adjacency graph.
window.HOA = window.HOA || {};

HOA.rng = function (seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

HOA.hash2 = function (i, j) {
  let h = (i * 374761393 + j * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

HOA.KM = 6371;
HOA.geoKm = (a, b) => d3.geoDistance(a, b) * HOA.KM;

// Province density factor (1 = densest)
HOA.densityK = function (lon, lat) {
  if (lon > 12 && lon < 46 && lat > 43.5 && lat < 60.5) return 1; // Ukraine, CEE, west Russia
  if (lon > -12 && lon < 50 && lat > 34 && lat < 72) return 2; // Europe
  if (lon > 25 && lon < 75 && lat > 12 && lat < 46) return 2; // Middle East, Caucasus
  if (lon > 100 && lon < 146 && lat > 18 && lat < 46) return 2; // East Asia
  return 3;
};

HOA.buildWorld = function (topo) {
  const OBJ = 'regions';
  const geoms = topo.objects[OBJ].geometries;
  geoms.forEach((g, i) => (g._i = i));
  const fc = topojson.feature(topo, topo.objects[OBJ]);
  const features = fc.features;
  const featNb = topojson.neighbors(geoms);

  // --- countries ---
  const defs = {};
  const known = new Set();
  for (const row of HOA.COUNTRY_TABLE) {
    const [tag, , name, pop, gdp, ideo, leader, gov, faction, tl, mil, color] = row;
    known.add(tag);
    defs[tag] = { tag, name, pop, gdp, ideo, leader, gov, faction, tl, milShare: mil, color, detailed: true };
  }
  const featTag = [];
  const featName = [];
  const rand = HOA.rng(1234);
  const areaByA3 = {};
  features.forEach((f) => { const a = f.properties.a3; areaByA3[a] = (areaByA3[a] || 0) + d3.geoArea(f) * HOA.KM * HOA.KM; });
  features.forEach((f, i) => {
    const a3 = f.properties.a3;
    const nm = f.properties.nm;
    featName[i] = HOA.REGION_CZ[a3 + '|' + nm] || nm;
    let tag = a3 in HOA.A3_ALIAS ? HOA.A3_ALIAS[a3] : a3;
    if (a3 === 'RUS' && (nm === 'Crimea' || nm === 'Sevastopol')) tag = 'UKR'; // de iure Ukrainian
    if (!f.geometry || !tag) { featTag[i] = null; return; }
    if (!defs[tag]) {
      const pop = Math.max(0.05, Math.min(60, (areaByA3[a3] || 1e4) / 45000));
      const hue = Math.floor(rand() * 360);
      defs[tag] = {
        tag, name: HOA.CZ_A3[tag] || tag, pop: +pop.toFixed(2), gdp: +(pop * 6).toFixed(1), ideo: rand() < 0.55 ? 'dem' : 'aut',
        leader: '—', gov: 'vláda', faction: null, tl: 0, milShare: 0.08,
        color: d3.hsl(hue, 0.35 + rand() * 0.2, 0.45 + rand() * 0.15).formatHex(), detailed: false,
      };
    }
    featTag[i] = tag;
  });

  // --- provinces: one per real region; very large regions split into Voronoi parts ---
  const cellEdges = new Map();
  const provinces = [];
  const featProv = features.map(() => []);
  const BASE = 1.25;
  const DIRS = ['východ', 'severovýchod', 'sever', 'severozápad', 'západ', 'jihozápad', 'jih', 'jihovýchod'];
  features.forEach((f, fi) => {
    if (featTag[fi] === null) return;
    const b = d3.geoBounds(f);
    let [x0, y0] = b[0];
    let [x1, y1] = b[1];
    const wrap = x0 > x1;
    if (wrap) x1 += 360;
    const areaKm = d3.geoArea(f) * HOA.KM * HOA.KM;
    const lp = HOA.labelPoint(f);
    const k0 = HOA.densityK(lp[0], lp[1]);
    const cellKm = k0 === 1 ? 9000 : 19000 * k0 * k0;
    let seeds = [];
    if (areaKm > cellKm * 2.2) {
      const j0 = Math.floor((y0 + 90) / BASE), j1 = Math.ceil((y1 + 90) / BASE);
      for (let j = j0; j <= j1; j++) {
        const lat = -90 + (j + 0.5) * BASE;
        const stepLon = BASE / Math.max(Math.cos((lat * Math.PI) / 180), 0.25);
        const i0 = Math.floor((x0 + 180) / stepLon), i1 = Math.ceil((x1 + 180) / stepLon);
        for (let i = i0; i <= i1; i++) {
          const lonRaw = -180 + (i + 0.5) * stepLon;
          const lon = lonRaw > 180 ? lonRaw - 360 : lonRaw;
          const k = k0 === 1 ? 1 : Math.max(2, HOA.densityK(lon, lat));
          if (j % k !== 0 || i % k !== 0) continue;
          const p = [lon + (HOA.hash2(i, j) - 0.5) * 0.5 * stepLon * k, Math.max(-89, Math.min(89, lat + (HOA.hash2(j, i + 7) - 0.5) * 0.5 * BASE * k))];
          if (d3.geoContains(f, p)) seeds.push(p);
          else if (d3.geoContains(f, [lon, lat])) seeds.push([lon, lat]);
        }
      }
    }
    if (seeds.length < 2) seeds = [lp];
    const base = featName[fi];
    const spread = seeds.reduce((m, s) => Math.max(m, d3.geoDistance(s, lp)), 0);
    seeds.forEach((s, si) => {
      const p = { id: provinces.length, fi, lon: s[0], lat: s[1], nb: [], vp: 1, name: null, region: base, poly: null, fort: 0, rad: 0 };
      p.k = HOA.densityK(s[0], s[1]);
      if (seeds.length > 1) {
        const ang = Math.atan2(s[1] - lp[1], (s[0] - lp[0]) * Math.cos((lp[1] * Math.PI) / 180));
        const near = d3.geoDistance(s, lp) < 0.3 * spread;
        p.region = near ? `${base} – střed` : `${base} – ${DIRS[((Math.round(ang / (Math.PI / 4)) % 8) + 8) % 8]}`;
      }
      provinces.push(p);
      featProv[fi].push(p.id);
    });
    // make duplicate part names unique
    const seen = {};
    for (const id of featProv[fi]) { const n = provinces[id].region; seen[n] = (seen[n] || 0) + 1; if (seen[n] > 1) provinces[id].region = `${n} ${seen[n]}`; }
    const ids = featProv[fi];
    if (ids.length < 2) return;
    const midLat = (y0 + y1) / 2;
    const cs = Math.max(Math.cos((midLat * Math.PI) / 180), 0.3);
    const pts = ids.map((id) => { let lon = provinces[id].lon; if (wrap && lon < 0) lon += 360; return [lon * cs, provinces[id].lat]; });
    const del = d3.Delaunay.from(pts);
    const vor = del.voronoi([(x0 - 4) * cs, Math.max(-89.5, y0 - 4), (x1 + 4) * cs, Math.min(89.5, y1 + 4)]);
    const cells = ids.map((id, k) => vor.cellPolygon(k));
    ids.forEach((id, k) => {
      const cell = cells[k];
      if (!cell) return;
      const ring = [];
      for (let q = 0; q < cell.length - 1; q++) {
        const a = cell[q], c = cell[q + 1];
        const n = Math.max(1, Math.ceil(Math.max(Math.abs(c[0] - a[0]) / cs, Math.abs(c[1] - a[1])) / 1.5));
        for (let t = 0; t < n; t++) ring.push([(a[0] + ((c[0] - a[0]) * t) / n) / cs, a[1] + ((c[1] - a[1]) * t) / n]);
      }
      ring.push(ring[0].slice());
      let poly = { type: 'Polygon', coordinates: [ring] };
      if (d3.geoArea(poly) > 2 * Math.PI) poly = { type: 'Polygon', coordinates: [ring.slice().reverse()] };
      provinces[id].poly = poly;
    });
    for (let k = 0; k < ids.length; k++) {
      for (const m of del.neighbors(k)) {
        if (m <= k) continue;
        const A = cells[k], B = cells[m];
        if (!A || !B) continue;
        const common = [];
        for (let q = 0; q < A.length - 1; q++) {
          const a = A[q];
          if (B.some((bb) => Math.abs(bb[0] - a[0]) < 1e-6 && Math.abs(bb[1] - a[1]) < 1e-6)) common.push(a);
        }
        if (common.length < 2) continue;
        const [a, c] = common;
        // only a real neighbour if the shared edge midpoint lies inside the region
        const mid = [((a[0] + c[0]) / 2) / cs, (a[1] + c[1]) / 2];
        const n = Math.max(1, Math.ceil(Math.max(Math.abs(c[0] - a[0]) / cs, Math.abs(c[1] - a[1]))));
        const line = [];
        for (let t = 0; t <= n; t++) line.push([(a[0] + ((c[0] - a[0]) * t) / n) / cs, a[1] + ((c[1] - a[1]) * t) / n]);
        if (!line.some((pt) => d3.geoContains(f, pt)) && !d3.geoContains(f, mid)) continue;
        HOA.link2(provinces, ids[k], ids[m], false);
        const i1 = ids[k], i2 = ids[m];
        cellEdges.set(i1 < i2 ? i1 + '|' + i2 : i2 + '|' + i1, [line]);
      }
    }
  });

  // --- exact shared borders between regions (from topology arcs) ---
  const pairBorder = new Map(cellEdges);
  const arcs = HOA.decodeArcs(topo);
  const arcOwners = arcs.map(() => []);
  const walk = (a, gi) => { if (Array.isArray(a)) a.forEach((x) => walk(x, gi)); else arcOwners[a < 0 ? ~a : a].push(gi); };
  geoms.forEach((g, gi) => g.arcs && walk(g.arcs, gi));
  const nearestIn = (ids, v) => {
    if (ids.length === 1) return ids[0];
    const cl = Math.cos((v[1] * Math.PI) / 180);
    let best = ids[0], bd = Infinity;
    for (const id of ids) {
      const p = provinces[id];
      let dx = p.lon - v[0];
      if (dx > 180) dx -= 360; else if (dx < -180) dx += 360;
      dx *= cl;
      const dy = p.lat - v[1];
      const d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = id; }
    }
    return best;
  };
  const push = (key, line) => { if (!pairBorder.has(key)) pairBorder.set(key, []); pairBorder.get(key).push(line); };
  arcOwners.forEach((own, ai) => {
    const [fi, fj] = own;
    if (own.length < 2 || fi === fj || !featProv[fi].length || !featProv[fj].length) return;
    let cur = null, key = null;
    for (const v of arcs[ai]) {
      const a = nearestIn(featProv[fi], v), b = nearestIn(featProv[fj], v);
      const k = a < b ? a + '|' + b : b + '|' + a;
      if (k !== key) {
        if (cur && cur.length > 1) push(key, cur);
        cur = cur ? [cur[cur.length - 1], v] : [v];
        key = k;
      } else cur.push(v);
    }
    if (cur && cur.length > 1) push(key, cur);
  });
  // land adjacency = shared border
  for (const key of pairBorder.keys()) {
    const [a, b] = key.split('|').map(Number);
    HOA.link2(provinces, a, b, false);
  }
  // sea links between nearby coasts / islands
  const all = d3.Delaunay.from(provinces.map((p) => [p.lon, p.lat]));
  for (let i = 0; i < provinces.length; i++) {
    for (const j of all.neighbors(i)) {
      if (j <= i || provinces[i].nb.some((e) => e.p === j)) continue;
      const d = d3.geoDistance([provinces[i].lon, provinces[i].lat], [provinces[j].lon, provinces[j].lat]);
      if (d < 0.055) HOA.link2(provinces, i, j, true);
    }
  }
  for (const p of provinces) {
    if (p.nb.length) continue;
    let best = -1, bd = 1e9;
    for (const q of provinces) {
      if (q === p) continue;
      const d = d3.geoDistance([p.lon, p.lat], [q.lon, q.lat]);
      if (d < bd) { bd = d; best = q.id; }
    }
    if (best >= 0 && bd < 0.3) HOA.link2(provinces, p.id, best, true);
  }

  // --- country registry: label at merged country shape ---
  const tagFeatures = {};
  features.forEach((f, i) => { const t = featTag[i]; if (t) (tagFeatures[t] = tagFeatures[t] || []).push(i); });
  for (const t in tagFeatures) {
    const merged = { type: 'Feature', geometry: topojson.merge(topo, tagFeatures[t].map((i) => geoms[i])) };
    const fis = tagFeatures[t].slice().sort((a, b) => d3.geoArea(features[b]) - d3.geoArea(features[a]));
    defs[t].mainFeature = fis[0];
    defs[t].label = HOA.labelPoint(merged);
    let la = 0;
    for (const poly of merged.geometry.coordinates) { const a = d3.geoArea({ type: 'Polygon', coordinates: poly }); if (a < 2 * Math.PI && a > la) la = a; }
    defs[t].labelArea = la;
  }
  for (const t in defs) if (!tagFeatures[t]) delete defs[t];

  // --- cities & victory points (city goes to the region that contains it) ---
  for (const c of HOA.CITIES) {
    const [name, lon, lat, vp, tag, cap] = c;
    const pt = [lon, lat];
    const cand = [];
    for (const p of provinces) if (featTag[p.fi] === tag) cand.push([d3.geoDistance(pt, [p.lon, p.lat]), p]);
    if (!cand.length) continue;
    cand.sort((a, b) => a[0] - b[0]);
    let best = null;
    for (const [, p] of cand.slice(0, 12)) {
      if (!d3.geoContains(features[p.fi], pt)) continue;
      best = W_nearest(featProv[p.fi], pt, provinces);
      break;
    }
    if (!best && cand[0][0] < 0.12) best = cand[0][1];
    if (!best) continue;
    best.vp += vp;
    if (!best.name || cap) best.name = name;
    best.city = best.city || [];
    best.city.push({ name, lon, lat, vp, cap: !!cap });
    if (cap && defs[tag]) defs[tag].capital = best.id;
  }
  for (const t in defs) {
    if (defs[t].capital != null) continue;
    const ps = featProv[defs[t].mainFeature];
    defs[t].capital = W_nearest(ps, defs[t].label, provinces).id;
    provinces[defs[t].capital].vp += 5;
  }

  const borderMesh = topojson.mesh(topo, topo.objects[OBJ], (a, b) => a !== b && featTag[a._i] !== featTag[b._i]);
  const innerMesh = topojson.mesh(topo, topo.objects[OBJ], (a, b) => a !== b && featTag[a._i] === featTag[b._i]);
  const coast = topojson.mesh(topo, topo.objects[OBJ], (a, b) => a === b);
  const land = topojson.merge(topo, geoms);

  return { unowned: features.map((f, i) => i).filter((i) => featTag[i] === null && features[i].geometry), features, featTag, featName, featProv, provinces, defs, borderMesh, innerMesh, coast, land, pairBorder };
};

function W_nearest(ids, pt, provinces) {
  let best = provinces[ids[0]], bd = Infinity;
  for (const id of ids) {
    const d = d3.geoDistance(pt, [provinces[id].lon, provinces[id].lat]);
    if (d < bd) { bd = d; best = provinces[id]; }
  }
  return best;
}

HOA.link2 = function (provinces, i, j, sea) {
  const a = provinces[i], b = provinces[j];
  const ex = a.nb.find((e) => e.p === j);
  if (ex) { if (!sea && ex.sea) { ex.sea = false; b.nb.find((e) => e.p === i).sea = false; } return; }
  const km = Math.max(30, d3.geoDistance([a.lon, a.lat], [b.lon, b.lat]) * HOA.KM);
  a.nb.push({ p: j, d: km, sea });
  b.nb.push({ p: i, d: km, sea });
};

HOA.decodeArcs = function (topo) {
  const tf = topo.transform;
  return topo.arcs.map((arc) => {
    if (!tf) return arc;
    let x = 0, y = 0;
    return arc.map((p) => { x += p[0]; y += p[1]; return [x * tf.scale[0] + tf.translate[0], y * tf.scale[1] + tf.translate[1]]; });
  });
};

HOA.link = function (provinces, i, j, sea, maxDeg) {
  const a = provinces[i], b = provinces[j];
  const dRad = d3.geoDistance([a.lon, a.lat], [b.lon, b.lat]);
  const deg = (dRad * 180) / Math.PI;
  const lim = sea ? maxDeg : maxDeg * Math.max(a.k, b.k) * 0.6;
  if (deg > lim) return false;
  if (a.nb.some((e) => e.p === j)) return true;
  const km = Math.max(30, dRad * HOA.KM);
  a.nb.push({ p: j, d: km, sea });
  b.nb.push({ p: i, d: km, sea });
  return true;
};

HOA.labelPoint = function (f) {
  const g = f.geometry;
  let best = null, ba = -1;
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  for (const c of polys) {
    const poly = { type: 'Polygon', coordinates: c };
    const a = d3.geoArea(poly);
    if (a > ba && a < 2 * Math.PI) { ba = a; best = poly; }
  }
  if (!best) return d3.geoCentroid(f);
  const c = d3.geoCentroid(best);
  if (d3.geoContains(best, c)) return c;
  // fallback: search a grid inside bounds for an interior point closest to centroid
  const b = d3.geoBounds(best);
  let bp = best.coordinates[0][0], bd = 1e9;
  for (let t = 0; t <= 12; t++) for (let u = 0; u <= 12; u++) {
    const p = [b[0][0] + ((b[1][0] - b[0][0]) * t) / 12, b[0][1] + ((b[1][1] - b[0][1]) * u) / 12];
    if (!d3.geoContains(best, p)) continue;
    const d = d3.geoDistance(p, c);
    if (d < bd) { bd = d; bp = p; }
  }
  return bp;
};

