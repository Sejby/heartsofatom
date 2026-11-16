// Builds data/regions.js (TopoJSON of real admin-1 regions) from Natural Earth
// ne_10m_admin_1_states_provinces.geojson.
// Usage: bun tools/build-regions.js <admin1.geojson> <dir with topojson-server.min.js, topojson-simplify.min.js, topojson-client.min.js>
const fs = require('fs');
const path = require('path');
const [, , input, libDir] = process.argv;
const server = require(path.resolve(libDir, 'topojson-server.min.js'));
const simp = require(path.resolve(libDir, 'topojson-simplify.min.js'));
const client = require(path.resolve(__dirname, '../vendor/topojson-client.min.js'));

const fc = JSON.parse(fs.readFileSync(input, 'utf8'));
// Countries with very many small units get dissolved into their statistical regions
// (e.g. France départements -> régions, UK councils -> regions). Real top-level units elsewhere.
const KEEP_FINE = new Set(['RUS', 'TUR', 'USA', 'JPN', 'UKR']);
const count = {};
for (const f of fc.features) count[f.properties.adm0_a3] = (count[f.properties.adm0_a3] || 0) + 1;
let n = 0;
for (const f of fc.features) {
  const p = f.properties;
  const dis = count[p.adm0_a3] > 60 && p.region && !KEEP_FINE.has(p.adm0_a3);
  f.properties = {
    key: dis ? p.adm0_a3 + '|' + p.region : p.adm0_a3 + '|' + n++,
    a3: p.adm0_a3,
    nm: dis ? p.region : p.name || p.name_en || p.admin,
    admin: p.admin,
  };
}

const topo = server.topology({ regions: fc });
const groups = new Map();
for (const g of topo.objects.regions.geometries) {
  const k = g.properties.key;
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k).push(g);
}
const geoms = [];
for (const [k, list] of groups) {
  const polys = list.filter((g) => g.type === 'Polygon' || g.type === 'MultiPolygon');
  if (!polys.length) continue;
  const merged = polys.length === 1 ? polys[0] : client.mergeArcs(topo, polys);
  const pr = list[0].properties;
  geoms.push({ type: merged.type, arcs: merged.arcs, properties: { a3: pr.a3, nm: pr.nm } });
}
topo.objects.regions.geometries = geoms;

const pre = simp.presimplify(topo);
const totalPts = pre.arcs.reduce((s, a) => s + a.length, 0);
const minWeight = simp.quantile(pre, 0.16);
let out = simp.simplify(pre, minWeight);
out = simp.filter(out, simp.filterAttachedWeight(out, 2e-4, simp.planarRingArea));
out = client.quantize(out, 1e5);
const keptPts = out.arcs.reduce((s, a) => s + a.length, 0);

const dst = path.resolve(__dirname, '../data/regions.js');
fs.writeFileSync(dst, '// Generated from Natural Earth admin-1 (public domain) by tools/build-regions.js\nwindow.REGIONS_TOPO=' + JSON.stringify(out) + ';\n');
console.log(`regions ${geoms.length}, points ${totalPts} -> ${keptPts}, size ${(fs.statSync(dst).size / 1e6).toFixed(2)} MB`);
