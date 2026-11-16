// Game state creation and shared helpers (relations, wars, factions, access).
window.HOA = window.HOA || {};

HOA.START_DATE = Date.UTC(2022, 1, 24, 4, 0, 0);

HOA.newGame = function (W) {
  const S = {
    t: HOA.START_DATE, hour: 0, day: 0, speed: 2, paused: true, player: null,
    countries: {}, units: [], nextUnit: 1, wars: [], nextWar: 1, factions: {}, rel: {},
    owner: [], ctrl: [], core: [], fort: [], rad: [],
    firedEvents: {}, news: [], tension: 30, flags: {}, pendingEvents: [], nukeFx: [],
  };
  HOA.S = S;
  for (const tag in W.defs) S.countries[tag] = HOA.newCountry(W.defs[tag]);
  for (const k in HOA.FACTIONS_INIT) {
    const f = HOA.FACTIONS_INIT[k];
    S.factions[k] = { id: k, name: f.name, leader: f.leader, color: f.color, members: [] };
  }
  for (const tag in S.countries) {
    const c = S.countries[tag];
    if (c.faction && S.factions[c.faction]) S.factions[c.faction].members.push(tag);
  }
  for (const p of W.provinces) {
    const t = W.featTag[p.fi];
    S.owner[p.id] = t; S.ctrl[p.id] = t; S.core[p.id] = t; S.fort[p.id] = 0; S.rad[p.id] = 0;
  }
  // Crimea + Sevastopol: Ukrainian de iure, Russian controlled since 2014; parts of Donbas held by Russia/separatists
  for (const p of W.provinces) {
    const reg = W.featName[p.fi];
    if (reg === 'Krym' || reg === 'Sevastopol') S.ctrl[p.id] = 'RUS';
    if (reg === 'Doněcká oblast' && p.lon > 37.6 && p.lat < 48.4) S.ctrl[p.id] = 'RUS';
    if (reg === 'Luhanská oblast' && p.lat < 48.75) S.ctrl[p.id] = 'RUS';
  }
  // base forts: Donbas line
  for (const p of W.provinces) {
    if (S.owner[p.id] === 'UKR' && S.ctrl[p.id] === 'UKR' && p.nb.some((e) => S.ctrl[e.p] === 'RUS' && W.featName[W.provinces[e.p].fi].match(/Doněcká|Luhanská/))) S.fort[p.id] = 2;
  }
  S.fort[W.defs.UKR.capital] = 3;
  HOA.initRelations(S);
  HOA.spawnStartArmies(S, W);
  // access: Russia in Belarus
  S.countries.BLR.access.push('RUS');
  S.countries.RUS.access.push('BLR');
  S.countries.RUS.tmods = [{ name: 'Logistický chaos', desc: 'Kolony bez paliva, špatné mapy a chaos ve velení.', att: -0.2, def: -0.1, until: Date.UTC(2022, 4, 1) }];
  S.countries.UKR.tmods = [{ name: 'Odhodlání obránců', desc: 'Celý národ se postavil na odpor.', def: 0.15, att: 0.05, until: Date.UTC(2022, 6, 1) }];
  HOA.recomputeAll(S);
  HOA.declareWar(S, 'RUS', 'UKR', true);
  HOA.recomputeAll(S);
  return S;
};

HOA.newCountry = function (d) {
  const civ = Math.max(1, Math.round(Math.sqrt(d.gdp) * 0.8));
  const mil = Math.max(1, Math.round(civ * d.milShare * 1.6));
  const c = {
    tag: d.tag, name: d.name, color: d.color, ideo: d.ideo, leader: d.leader, gov: d.gov, faction: d.faction || null,
    pop: d.pop, gdp: d.gdp, baseGdp: d.gdp, detailed: d.detailed, capital: d.capital, tl: d.tl,
    pp: 50, stab: 0.6, ws: 0.3, mp: 0, mpUsed: 0, civ, mil, money: Math.max(0.2, d.gdp * 0.004),
    eq: { inf: 0, arm: 0, art: 0, aa: 0, drn: 0, air: 0 },
    prod: { inf: 0.4, arm: 0.2, art: 0.25, aa: 0.05, drn: 0.1, air: 0 }, prodProg: {},
    techs: [], research: [], slots: 2 + (d.tl >= 3 ? 1 : 0) + (d.gdp > 3000 ? 1 : 0),
    focus: { cur: null, prog: 0, done: [] },
    laws: { economy: 'civil', conscription: 'vol' },
    fb: { att: {}, def: {}, org: {}, spd: {}, prod: {}, airDef: 0, droneDef: 0, air: 0, civ: 0, mp: 0, reinforce: 0 },
    mods: null, nukes: HOA.NUKES_INIT[d.tag] || 0,
    wargoals: [], justifying: null, access: [], guarantees: [], sanctions: [],
    training: [], build: [], deliveries: [], casualties: 0, kills: 0,
    alive: true, aiArmy: true, lastDiplo: {}, capitulated: false,
  };
  if (d.tag === 'RUS') { c.ws = 0.65; c.stab = 0.7; c.laws.economy = 'partial'; c.laws.conscription = 'limited'; }
  if (d.tag === 'UKR') { c.ws = 0.8; c.stab = 0.55; c.laws.conscription = 'limited'; c.laws.economy = 'partial'; }
  if (['USA', 'POL', 'CHN', 'IRN', 'PRK', 'ISR', 'TUR', 'IND', 'PAK', 'KOR', 'BLR'].includes(d.tag)) c.laws.economy = 'partial';
  if (['PRK', 'ISR', 'KOR', 'IRN', 'TUR', 'GRC', 'FIN', 'EST', 'LTU', 'LVA', 'BLR', 'CHN', 'EGY', 'PAK', 'IND'].includes(d.tag)) c.laws.conscription = 'limited';
  if (c.ideo === 'aut' || c.ideo === 'com') { c.stab = 0.65; c.ws = 0.4; }
  // starting techs
  const maxYear = 2011 + d.tl * 3;
  for (const t of HOA.TECHS) {
    if (t.year <= maxYear && (t.cat !== 'nuc' || c.nukes > 0) && (!t.req || t.req.every((r) => c.techs.includes(r)))) c.techs.push(t.id);
  }
  if (d.tag === 'UKR') ['drn1', 'ew1'].forEach((x) => !c.techs.includes(x) && c.techs.push(x));
  if (d.tag === 'TUR' || d.tag === 'IRN' || d.tag === 'ISR') !c.techs.includes('drn1') && c.techs.push('drn1');
  // starting stockpiles
  const scale = Math.sqrt(d.gdp) * (0.4 + d.milShare * 2);
  c.eq.inf = Math.round(scale * 60);
  c.eq.arm = Math.round(scale * 6);
  c.eq.art = Math.round(scale * 6);
  c.eq.aa = Math.round(scale * 2);
  c.eq.drn = Math.round(scale * (c.techs.includes('drn1') ? 20 : 2));
  c.eq.air = Math.round(scale * 0.6);
  if (d.tag === 'RUS') { c.eq.arm += 2500; c.eq.art += 1500; c.eq.air += 300; }
  if (d.tag === 'UKR') { c.eq.inf += 4000; c.eq.art += 300; c.eq.arm += 300; }
  if (d.tag === 'USA') { c.eq.arm += 1500; c.eq.art += 800; c.eq.air += 1200; }
  return c;
};

HOA.recomputeAll = function (S) {
  for (const tag in S.countries) HOA.recomputeMods(S.countries[tag]);
  HOA.refreshWarCache(S);
  for (const tag in S.countries) HOA.updateManpower(S.countries[tag], true);
};

// --- modifiers ---
HOA.recomputeMods = function (c) {
  const m = { att: {}, def: {}, org: {}, spd: {}, prod: {}, airDef: 0, droneDef: 0, air: 0, civ: 0, mp: 0, reinforce: 0, ignoreEW: 0, nukeYield: 0, nukeShield: 0, nukeDoc: 0, slot: 0 };
  const add = (e) => {
    for (const k of ['att', 'def', 'org', 'spd', 'prod']) if (e[k]) for (const u in e[k]) m[k][u] = (m[k][u] || 0) + e[k][u];
    for (const k of ['airDef', 'droneDef', 'air', 'civ', 'mp', 'reinforce', 'ignoreEW', 'nukeYield', 'nukeShield', 'nukeDoc', 'slot']) if (e[k]) m[k] += e[k];
  };
  for (const id of c.techs) { const t = HOA.TECH_BY_ID[id]; if (t) add(t.eff); }
  add(c.fb);
  c.mods = m;
};

HOA.unitMod = function (c, kind, type) {
  const m = c.mods[kind];
  return 1 + (m[type] || 0) + (m.all || 0);
};

HOA.updateManpower = function (c, init) {
  const law = HOA.lawOpt('conscription', c.laws.conscription);
  const pool = c.pop * 1000 * law.mp * (1 + c.mods.mp);
  if (init) c.mp = Math.max(0, pool - c.mpUsed);
  c.mpMax = pool;
};

HOA.lawOpt = (cat, id) => HOA.LAWS[cat].opts.find((o) => o.id === id);

// --- relations ---
HOA.relKey = (a, b) => (a < b ? a + '|' + b : b + '|' + a);
HOA.initRelations = function (S) {
  const set = (a, b, v) => { if (S.countries[a] && S.countries[b]) S.rel[HOA.relKey(a, b)] = v; };
  const nato = S.factions.NATO.members;
  for (const a of nato) {
    set(a, 'RUS', -60); set(a, 'BLR', -50); set(a, 'UKR', 60);
    for (const b of nato) if (a < b) set(a, b, 70);
    set(a, 'FIN', 70); set(a, 'SWE', 70); set(a, 'CHN', -15); set(a, 'IRN', -50); set(a, 'PRK', -70);
  }
  set('HUN', 'RUS', 10); set('HUN', 'UKR', 0); set('TUR', 'RUS', 10); set('SVK', 'RUS', -30);
  set('RUS', 'UKR', -150); set('RUS', 'BLR', 120); set('RUS', 'CHN', 60); set('RUS', 'IRN', 50); set('RUS', 'PRK', 50);
  set('RUS', 'SRB', 50); set('RUS', 'KAZ', 40); set('RUS', 'ARM', 20); set('RUS', 'IND', 40); set('RUS', 'SYR', 80); set('RUS', 'CUB', 50); set('RUS', 'VEN', 50);
  set('RUS', 'FIN', -40); set('RUS', 'SWE', -40); set('RUS', 'GEO', -60); set('RUS', 'MDA', -40); set('RUS', 'JPN', -40); set('RUS', 'AUS', -50);
  set('UKR', 'BLR', -90); set('UKR', 'MDA', 50); set('UKR', 'GEO', 30); set('UKR', 'JPN', 40); set('UKR', 'AUS', 40); set('UKR', 'KOR', 30);
  set('CHN', 'TWN', -150); set('CHN', 'USA', -40); set('CHN', 'PRK', 60); set('CHN', 'IND', -30); set('CHN', 'JPN', -40); set('CHN', 'PAK', 70);
  set('USA', 'TWN', 50); set('USA', 'JPN', 80); set('USA', 'KOR', 80); set('USA', 'ISR', 90); set('USA', 'AUS', 90); set('USA', 'IRN', -120);
  set('KOR', 'PRK', -150); set('IND', 'PAK', -120); set('ISR', 'IRN', -150); set('ARM', 'AZE', -120); set('SAU', 'IRN', -60);
  set('GRC', 'TUR', -20); set('SRB', 'KOS', -120);
};
HOA.baseRel = function (S, a, b) {
  const A = S.countries[a], B = S.countries[b];
  if (!A || !B) return 0;
  let r = A.ideo === B.ideo ? 15 : -5;
  if (A.faction && A.faction === B.faction) r += 50;
  return r;
};
HOA.getRel = function (S, a, b) {
  if (a === b) return 200;
  const v = S.rel[HOA.relKey(a, b)];
  return v === undefined ? HOA.baseRel(S, a, b) : v;
};
HOA.addRel = function (S, a, b, d) {
  if (a === b) return;
  const targets = S.factions[b] ? S.factions[b].members : [b];
  for (const t of targets) {
    if (t === a || !S.countries[t]) continue;
    const k = HOA.relKey(a, t);
    S.rel[k] = Math.max(-200, Math.min(200, HOA.getRel(S, a, t) + d));
  }
};

// --- wars ---
HOA.refreshWarCache = function (S) {
  const set = new Set();
  for (const w of S.wars) for (const a of w.att) for (const d of w.def) { set.add(a + '|' + d); set.add(d + '|' + a); }
  S._war = set;
  for (const tag in S.countries) S.countries[tag].atWar = false;
  for (const w of S.wars) for (const t of w.att.concat(w.def)) if (S.countries[t]) S.countries[t].atWar = true;
};
HOA.atWar = (S, a, b) => S._war.has(a + '|' + b);
HOA.allies = function (S, a, b) {
  if (a === b) return true;
  const A = S.countries[a];
  if (A && A.faction && A.faction === S.countries[b].faction) return true;
  // co-belligerents
  for (const w of S.wars) if ((w.att.includes(a) && w.att.includes(b)) || (w.def.includes(a) && w.def.includes(b))) return true;
  return false;
};
HOA.canEnter = function (S, tag, p) {
  const c = S.ctrl[p];
  if (!c) return false;
  if (c === tag) return true;
  if (HOA.atWar(S, tag, c)) return true;
  if (HOA.allies(S, tag, c)) return true;
  if (S.countries[c] && S.countries[c].access.includes(tag)) return true;
  return false;
};
HOA.enemiesOf = function (S, tag) {
  const out = new Set();
  for (const w of S.wars) {
    if (w.att.includes(tag)) w.def.forEach((d) => out.add(d));
    if (w.def.includes(tag)) w.att.forEach((d) => out.add(d));
  }
  return [...out];
};

HOA.declareWar = function (S, att, def, silent) {
  if (HOA.atWar(S, att, def) || att === def) return null;
  const A = S.countries[att], D = S.countries[def];
  const war = { id: S.nextWar++, name: `${A.name} vs. ${D.name}`, att: [att], def: [def], start: S.t, leaderA: att, leaderD: def };
  S.wars.push(war);
  // defender's defensive allies
  const callDef = new Set();
  if (D.faction && S.factions[D.faction]) S.factions[D.faction].members.forEach((m) => callDef.add(m));
  for (const tag in S.countries) if (S.countries[tag].guarantees.includes(def)) callDef.add(tag);
  callDef.delete(def);
  for (const m of callDef) {
    if (m === att || war.att.includes(m) || war.def.includes(m)) continue;
    const M = S.countries[m];
    if (!M || !M.alive) continue;
    if (A.faction && A.faction === M.faction) continue;
    const fac = D.faction && S.factions[D.faction];
    const willing = m === S.player ? true : fac && fac.id === 'CSTO' ? HOA.getRel(S, m, def) > 60 : true;
    if (willing) war.def.push(m);
  }
  HOA.refreshWarCache(S);
  for (const t of war.att) HOA.addRel(S, t, def, -60);
  S.tension = Math.min(100, S.tension + 10);
  // revoke access between enemies
  for (const t of war.att.concat(war.def)) {
    const C = S.countries[t];
    C.access = C.access.filter((x) => !HOA.atWar(S, t, x));
    C.wargoals = C.wargoals.filter((x) => x !== def || t !== att);
  }
  HOA.evictUnits(S);
  if (!silent) HOA.news(S, `⚔ ${A.name} vyhlásilo válku státu ${D.name}!` + (war.def.length > 1 ? ` Na obranu se připojují: ${war.def.slice(1).map((t) => S.countries[t].name).join(', ')}.` : ''), 'war');
  else HOA.news(S, `⚔ Válka: ${A.name} útočí na ${D.name}.`, 'war');
  return war;
};

HOA.joinWar = function (S, tag, ally) {
  for (const w of S.wars) {
    if (w.att.includes(ally) && !w.att.includes(tag) && !w.def.includes(tag)) w.att.push(tag);
    else if (w.def.includes(ally) && !w.def.includes(tag) && !w.att.includes(tag)) w.def.push(tag);
  }
  HOA.refreshWarCache(S);
  HOA.news(S, `${S.countries[tag].name} vstupuje do války po boku státu ${S.countries[ally].name}.`, 'war');
};

HOA.makePeace = function (S, winner, loser, mode) {
  // mode: 'white' -> restore control; 'cede' -> winners keep provinces they occupy from losers
  const winners = new Set(), losers = new Set();
  for (const w of S.wars.slice()) {
    const ws = w.att.includes(winner) ? 'att' : w.def.includes(winner) ? 'def' : null;
    const ls = w.att.includes(loser) ? 'att' : w.def.includes(loser) ? 'def' : null;
    if (!ws || !ls || ws === ls) continue;
    const leaderL = ls === 'att' ? w.leaderA : w.leaderD;
    const leaderW = ws === 'att' ? w.leaderA : w.leaderD;
    if (loser === leaderL || winner === leaderW && w[ls].length === 1) {
      w[ws].forEach((t) => winners.add(t));
      w[ls].forEach((t) => losers.add(t));
      S.wars = S.wars.filter((x) => x !== w);
    } else {
      w[ws].forEach((t) => winners.add(t));
      losers.add(loser);
      w[ls] = w[ls].filter((x) => x !== loser);
      if (!w[ls].length) S.wars = S.wars.filter((x) => x !== w);
    }
  }
  HOA.refreshWarCache(S);
  for (let p = 0; p < S.ctrl.length; p++) {
    const o = S.owner[p], c = S.ctrl[p];
    if (o === c || !o || !c) continue;
    if (HOA.atWar(S, o, c)) continue;
    const involved = (losers.has(o) && winners.has(c)) || (winners.has(o) && losers.has(c));
    if (mode === 'freeze' && involved) continue;
    if (mode === 'cede' && losers.has(o) && winners.has(c)) S.owner[p] = c;
    else S.ctrl[p] = o;
  }
  const a = winner, b = loser;
  // units standing in no-longer-accessible territory get sent home
  HOA.evictUnits(S);
  HOA.news(S, `🕊 Mír mezi státy ${S.countries[a].name} a ${S.countries[b].name}` + ({ cede: ' – okupovaná území byla postoupena.', freeze: ' – příměří na současné linii fronty.', white: ' – status quo ante bellum.' }[mode] || ''), 'peace');
  HOA.markMapDirty && HOA.markMapDirty();
};

HOA.evictUnits = function (S) {
  for (const u of S.units) {
    if (u.tr) continue;
    if (!HOA.canEnter(S, u.tag, u.p)) {
      const cap = S.countries[u.tag].capital;
      const home = S.ctrl[cap] === u.tag ? cap : S.ctrl.findIndex((c) => c === u.tag);
      if (home >= 0) { u.p = home; u.path = []; u.prog = 0; } else u.dead = true;
    } else if (u.path.length && !HOA.canEnter(S, u.tag, u.path[0])) { u.path = []; u.prog = 0; }
  }
  S.units = S.units.filter((u) => !u.dead);
};

// --- factions ---
HOA.joinFaction = function (S, tag, fid) {
  const c = S.countries[tag];
  const f = S.factions[fid];
  if (!f || f.members.includes(tag)) return;
  if (c.faction) HOA.leaveFaction(S, tag);
  f.members.push(tag);
  c.faction = fid;
  // join existing defensive wars of the faction
  for (const m of f.members) HOA.addRel(S, tag, m, 30);
  HOA.news(S, `🤝 ${c.name} se stává členem aliance ${f.name}.`, 'diplo');
};
HOA.leaveFaction = function (S, tag) {
  const c = S.countries[tag];
  const f = S.factions[c.faction];
  if (!f) { c.faction = null; return; }
  f.members = f.members.filter((x) => x !== tag);
  c.faction = null;
  if (f.leader === tag) {
    if (f.members.length) f.leader = f.members[0];
    else delete S.factions[f.id];
  }
  HOA.news(S, `${c.name} opouští alianci ${f.name}.`, 'diplo');
};
HOA.createFaction = function (S, tag, name) {
  const id = 'F' + tag + (S.t % 100000);
  const c = S.countries[tag];
  if (c.faction) HOA.leaveFaction(S, tag);
  S.factions[id] = { id, name, leader: tag, color: c.color, members: [tag] };
  c.faction = id;
  HOA.news(S, `🏳 ${c.name} zakládá novou alianci „${name}“.`, 'diplo');
  return id;
};

HOA.news = function (S, text, kind) {
  S.news.unshift({ t: S.t, text, kind: kind || 'info' });
  if (S.news.length > 200) S.news.length = 200;
  HOA.onNews && HOA.onNews(text, kind);
};

HOA.fmtDate = function (t, withHour) {
  const d = new Date(t);
  const s = `${d.getUTCDate()}. ${d.getUTCMonth() + 1}. ${d.getUTCFullYear()}`;
  return withHour ? s + ` ${String(d.getUTCHours()).padStart(2, '0')}:00` : s;
};

// --- start armies ---
HOA.armySize = function (c) {
  if (HOA.ARMY_SIZE[c.tag] != null) return HOA.ARMY_SIZE[c.tag];
  return Math.max(1, Math.min(14, Math.round(Math.sqrt(c.gdp) / 8 + Math.sqrt(c.pop) / 3)));
};

HOA.pickType = function (mix, r) {
  const keys = Object.keys(mix);
  const tot = keys.reduce((s, k) => s + mix[k], 0);
  let x = r * tot;
  for (const k of keys) { x -= mix[k]; if (x <= 0) return k; }
  return keys[0];
};

HOA.spawnStartArmies = function (S, W) {
  const rnd = HOA.rng(42);
  for (const tag in S.countries) {
    const c = S.countries[tag];
    let n = HOA.armySize(c);
    const dep = HOA.START_DEPLOY[tag] || [];
    for (const [lon, lat, cnt, mixName] of dep) {
      const p = HOA.nearestProv(W, S, lon, lat, (q) => S.ctrl[q] === tag || (S.ctrl[q] && S.countries[S.ctrl[q]] && S.countries[S.ctrl[q]].access.includes(tag)) || (tag === 'RUS' && S.ctrl[q] === 'BLR'));
      for (let i = 0; i < cnt; i++) HOA.addUnit(S, tag, HOA.pickType(HOA.MIXES[mixName], rnd()), p);
      n -= cnt;
    }
    if (n <= 0) continue;
    const own = [];
    for (let i = 0; i < S.ctrl.length; i++) if (S.ctrl[i] === tag && S.owner[i] === tag) own.push(i);
    if (!own.length) continue;
    own.sort((a, b) => W.provinces[b].vp - W.provinces[a].vp);
    const mix = c.tl >= 3 ? HOA.MIXES.modern : c.tl >= 2 ? HOA.MIXES.line : HOA.MIXES.basic;
    for (let i = 0; i < n; i++) {
      const p = own[i % Math.min(own.length, Math.max(3, Math.ceil(n / 2)))];
      HOA.addUnit(S, tag, HOA.pickType(mix, rnd()), p);
    }
  }
};

HOA.addUnit = function (S, tag, type, p) {
  const T = HOA.UNITS[type];
  const c = S.countries[tag];
  const count = S.units.filter((u) => u.tag === tag && u.type === type).length + (c._spawned || 0);
  const u = { id: S.nextUnit++, tag, type, name: `${count + 1}. ${T.name.toLowerCase()}`, p, str: 1, org: T.org, path: [], prog: 0, ent: 0, tr: null };
  c.mpUsed += T.mp;
  S.units.push(u);
  return u;
};

HOA.nearestProv = function (W, S, lon, lat, filter) {
  let best = -1, bd = 1e9;
  for (const p of W.provinces) {
    if (filter && !filter(p.id)) continue;
    const d = d3.geoDistance([lon, lat], [p.lon, p.lat]);
    if (d < bd) { bd = d; best = p.id; }
  }
  return best;
};

HOA.inits = function () {
  HOA.TECH_BY_ID = {};
  for (const t of HOA.TECHS) HOA.TECH_BY_ID[t.id] = t;
};
HOA.inits();
