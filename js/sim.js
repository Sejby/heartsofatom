// Simulation: hourly movement & combat, daily economy/research/focus/events.
window.HOA = window.HOA || {};

// ---------- pathfinding ----------
HOA.findPath = function (S, W, tag, from, to, allowSea) {
  if (from === to) return [];
  const P = W.provinces;
  const n = P.length;
  const dist = HOA._dist || (HOA._dist = new Float64Array(n));
  const prev = HOA._prev || (HOA._prev = new Int32Array(n));
  dist.fill(Infinity); prev.fill(-1);
  const heap = [[0, from]];
  dist[from] = 0;
  const push = (it) => { heap.push(it); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0]; const last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  const tgt = [P[to].lon, P[to].lat];
  while (heap.length) {
    const [d, cur] = pop();
    if (cur === to) break;
    if (d > dist[cur] + 1e-9) continue;
    for (const e of P[cur].nb) {
      if (e.sea && !allowSea) continue;
      if (e.p !== to && !HOA.canEnter(S, tag, e.p)) continue;
      if (e.p === to && !HOA.canEnter(S, tag, to)) continue;
      // can't pass THROUGH enemy-held territory with enemies beyond first step? allowed (it's attack), but penalize
      let w = e.d * (e.sea ? 3 : 1);
      if (HOA.atWar(S, tag, S.ctrl[e.p]) && e.p !== to) w *= 2.5;
      const nd = d + w;
      if (nd < dist[e.p]) {
        dist[e.p] = nd; prev[e.p] = cur;
        const h = d3.geoDistance([P[e.p].lon, P[e.p].lat], tgt) * HOA.KM * 0.5;
        push([nd + h * 0, e.p]);
      }
    }
  }
  if (prev[to] === -1) return null;
  const path = [];
  for (let c = to; c !== from; c = prev[c]) path.push(c);
  return path.reverse();
};

HOA.orderMove = function (S, W, u, to, quiet) {
  if (u.tr) return false;
  if (to === u.p) { u.path = []; u.prog = 0; return true; }
  let path = HOA.findPath(S, W, u.tag, u.p, to, true);
  if (path) {
    if (u.path.length && u.path[0] !== path[0]) u.prog = 0;
    u.path = path;
    return true;
  }
  // strategic redeployment by sea/air to own or allied territory
  const c = S.ctrl[to];
  if (c && !HOA.atWar(S, u.tag, c) && HOA.canEnter(S, u.tag, to)) {
    const km = HOA.geoKm([W.provinces[u.p].lon, W.provinces[u.p].lat], [W.provinces[to].lon, W.provinces[to].lat]);
    u.tr = { from: u.p, to, t0: S.t, eta: S.t + (36 + km / 25) * 3600e3 };
    u.path = []; u.prog = 0;
    return true;
  }
  if (!quiet && HOA.onMessage) HOA.onMessage('Cíl je nedosažitelný.');
  return false;
};

// ---------- combat helpers ----------
HOA.unitEff = function (u) {
  const T = HOA.UNITS[u.type];
  return u.str * (0.25 + 0.75 * Math.max(0, u.org) / T.org);
};
HOA.maxOrg = function (S, u) {
  return HOA.UNITS[u.type].org * HOA.unitMod(S.countries[u.tag], 'org', u.type);
};
HOA.airBonus = function (a, e) {
  const air = (x) => Math.log(1 + x.eq.air * (1 + x.mods.air));
  let b = (air(a) - air(e)) * 0.05 - e.mods.airDef * 0.25;
  return Math.max(-0.15, Math.min(0.3, b));
};
HOA.unitAtt = function (S, u, enemyTag) {
  const T = HOA.UNITS[u.type];
  const c = S.countries[u.tag];
  const e = S.countries[enemyTag];
  let a = T.att * HOA.unitMod(c, 'att', u.type) * HOA.unitEff(u) * HOA.tmod(c, 'att');
  if (e) {
    a *= 1 + HOA.airBonus(c, e);
    if (u.type === 'DRN') a *= 1 - Math.min(0.6, e.mods.droneDef * (1 - c.mods.ignoreEW));
  }
  return a;
};
HOA.unitDef = function (S, u) {
  const T = HOA.UNITS[u.type];
  const c = S.countries[u.tag];
  return T.def * HOA.unitMod(c, 'def', u.type) * HOA.unitEff(u) * (1 + u.ent) * HOA.tmod(c, 'def');
};
// temporary national modifiers: c.tmods = [{ name, att, def, until }]
HOA.tmod = function (c, k) {
  if (!c.tmods || !c.tmods.length) return 1;
  let m = 1;
  for (const t of c.tmods) if (t.until > HOA.S.t && t[k]) m += t[k];
  return m;
};

HOA.sumWidth = function (vals) {
  vals.sort((a, b) => b - a);
  let s = 0;
  for (let i = 0; i < vals.length; i++) s += i < 6 ? vals[i] : vals[i] * 0.2;
  return s;
};

// ---------- hourly ----------
HOA.tickHour = function (S, W) {
  S.t += 3600e3;
  S.hour++;
  const P = W.provinces;
  const byProv = new Map();
  for (const u of S.units) {
    if (u.tr) continue;
    let a = byProv.get(u.p);
    if (!a) byProv.set(u.p, (a = []));
    a.push(u);
  }
  S._byProv = byProv;
  // gather battles
  const battles = new Map();
  for (const u of S.units) {
    u.inBattle = false;
    if (u.tr) {
      if (S.t >= u.tr.eta) { u.p = u.tr.to; u.tr = null; u.ent = 0; }
      continue;
    }
    if (!u.path.length) continue;
    const nx = u.path[0];
    if (!HOA.canEnter(S, u.tag, nx) || !P[u.p].nb.some((e) => e.p === nx)) {
      // path broken -> re-path to final target
      const dest = u.path[u.path.length - 1];
      u.path = []; u.prog = 0;
      if (dest !== nx || HOA.canEnter(S, u.tag, dest)) HOA.orderMove(S, W, u, dest, true);
      continue;
    }
    const here = byProv.get(nx);
    let hasDef = false;
    if (here) for (const v of here) if (HOA.atWar(S, u.tag, v.tag)) { hasDef = true; break; }
    if (hasDef) {
      let b = battles.get(nx);
      if (!b) battles.set(nx, (b = { p: nx, att: [], from: new Set() }));
      b.att.push(u);
      b.from.add(u.p);
    }
  }
  S.battles = [];
  for (const [p, b] of battles) HOA.resolveBattle(S, W, b, byProv.get(p) || []);
  // movement
  let mapChanged = false;
  for (const u of S.units) {
    if (u.tr || u.dead) continue;
    const T = HOA.UNITS[u.type];
    const c = S.countries[u.tag];
    const mo = HOA.maxOrg(S, u);
    if (!u.path.length) {
      if (!u.inBattle && !u.defending) u.org = Math.min(mo, u.org + mo * 0.025);
      u.ent = Math.min(0.25, u.ent + 0.0015);
      u.defending = false;
      continue;
    }
    u.defending = false;
    if (u.inBattle) continue;
    const nx = u.path[0];
    const e = P[u.p].nb.find((x) => x.p === nx);
    if (!e) continue;
    const hostile = HOA.atWar(S, u.tag, S.ctrl[nx]);
    if (hostile && u.org < mo * 0.3) continue; // too disorganized to advance
    let spd = T.spd * HOA.unitMod(c, 'spd', u.type) * (e.sea ? 0.5 : 1);
    if (hostile) spd *= HOA.resistance(S, W, nx);
    if (S.rad[nx] > 0) spd *= 0.5;
    u.prog += spd / e.d;
    u.ent = 0;
    if (!hostile) u.org = Math.min(mo, u.org + mo * 0.005);
    if (u.prog >= 1) {
      u.prog = 0;
      u.p = nx;
      u.path.shift();
      if (HOA.atWar(S, u.tag, S.ctrl[nx])) { HOA.capture(S, W, nx, u.tag); mapChanged = true; }
    }
  }
  if (S.units.some((u) => u.dead)) S.units = S.units.filter((u) => !u.dead);
  if (mapChanged && HOA.markMapDirty) HOA.markMapDirty();
  if (S.hour % 24 === 0) HOA.tickDay(S, W);
};

// Speed factor when occupying an undefended hostile province (local resistance, cities, forts)
HOA.resistance = function (S, W, p) {
  const core = S.core[p] === S.ctrl[p];
  return 0.35 / (1 + S.fort[p] * 0.4 + (core ? W.provinces[p].vp / 8 : 0));
};

HOA.resolveBattle = function (S, W, b, here) {
  const att = b.att.filter((u) => !u.dead);
  if (!att.length) return;
  const atTag = att[0].tag;
  const defs = here.filter((v) => !v.dead && HOA.atWar(S, atTag, v.tag));
  if (!defs.length) return;
  const defTag = defs[0].tag;
  const fort = S.fort[b.p] * 0.12 + (S.rad[b.p] > 0 ? -0.2 : 0);
  const A = HOA.sumWidth(att.map((u) => HOA.unitAtt(S, u, defTag)));
  const D = HOA.sumWidth(defs.map((v) => HOA.unitDef(S, v) * (1.5 + fort))) + HOA.sumWidth(defs.map((v) => HOA.unitAtt(S, v, atTag))) * 0.15;
  const r = () => 0.75 + Math.random() * 0.5;
  const dShare = (A * 0.022) / defs.length;
  const aShare = (D * 0.026) / att.length;
  for (const v of defs) {
    v.inBattle = true; v.defending = true;
    const T = HOA.UNITS[v.type];
    v.org -= dShare * r();
    const ls = dShare * 0.0045 * r() / Math.max(0.5, T.mp / 8);
    v.str = Math.max(0.02, v.str - ls);
    const lost = ls * T.mp * 250;
    S.countries[v.tag].casualties += lost;
    S.countries[atTag].kills += lost;
  }
  for (const u of att) {
    u.inBattle = true;
    const T = HOA.UNITS[u.type];
    u.org -= aShare * r();
    const ls = aShare * 0.004 * r() / Math.max(0.5, T.mp / 8);
    u.str = Math.max(0.02, u.str - ls);
    const lost = ls * T.mp * 250;
    S.countries[u.tag].casualties += lost;
    S.countries[defTag].kills += lost;
    if (u.org <= HOA.maxOrg(S, u) * 0.08) { u.org = Math.max(0, u.org); u.path = []; u.prog = 0; }
  }
  S.battles.push({ p: b.p, from: [...b.from], A, D, atTag, defTag });
  // retreats
  for (const v of defs) {
    if (v.org > 0.5) continue;
    v.org = 0;
    const P = W.provinces;
    let best = -1, bs = -1e9;
    for (const e of P[v.p].nb) {
      if (e.sea) continue;
      const c = S.ctrl[e.p];
      if (!(c === v.tag || (HOA.allies(S, v.tag, c) && !HOA.atWar(S, v.tag, c)))) continue;
      if (b.from.has(e.p)) continue;
      const enemies = (S._byProv.get(e.p) || []).filter((x) => HOA.atWar(S, v.tag, x.tag)).length;
      const sc = -enemies * 10 + Math.random();
      if (sc > bs) { bs = sc; best = e.p; }
    }
    if (best >= 0 && bs > -5) {
      v.p = best; v.path = []; v.prog = 0; v.ent = 0;
      v.str = Math.max(0.02, v.str - 0.05);
    } else {
      v.dead = true;
      const c = S.countries[v.tag];
      c.casualties += v.str * HOA.UNITS[v.type].mp * 400;
      if (v.tag === S.player || atTag === S.player) HOA.news(S, `☠ ${c.name}: ${v.name} byla obklíčena a zničena.`, 'war');
    }
  }
};

HOA.capture = function (S, W, p, tag) {
  const owner = S.owner[p];
  const prevCtrl = S.ctrl[p];
  let newCtrl = tag;
  if (owner && owner !== tag && !HOA.atWar(S, tag, owner) && HOA.allies(S, tag, owner)) newCtrl = owner;
  S.ctrl[p] = newCtrl;
  S.fort[p] = Math.max(0, S.fort[p] - 1);
  const prov = W.provinces[p];
  if (prov.vp >= 8 && prov.name) {
    const verb = newCtrl === owner ? 'osvobodilo' : 'dobylo';
    HOA.news(S, `🏴 ${S.countries[tag].name} ${verb} ${prov.name}.`, prevCtrl === S.player || tag === S.player ? 'major' : 'war');
  }
};

// ---------- daily ----------
HOA.tickDay = function (S, W) {
  S.day++;
  const year = new Date(S.t).getUTCFullYear();
  S._unitsByTag = {};
  for (const u of S.units) (S._unitsByTag[u.tag] = S._unitsByTag[u.tag] || []).push(u);
  for (const tag in S.countries) {
    const c = S.countries[tag];
    if (!c.alive) continue;
    HOA.dailyCountry(S, W, c, year);
  }
  for (let p = 0; p < S.rad.length; p++) if (S.rad[p] > 0) S.rad[p]--;
  S.tension = Math.max(0, S.tension - 0.02);
  HOA.checkEvents(S, W);
  HOA.checkCapitulation(S, W);
  if (HOA.aiDaily) HOA.aiDaily(S, W);
  if (HOA.onDay) HOA.onDay();
};

HOA.dailyCountry = function (S, W, c, year) {
  const econ = HOA.lawOpt('economy', c.laws.economy);
  const cons = HOA.lawOpt('conscription', c.laws.conscription);
  // political power, stability, war support
  c.pp = Math.min(1500, c.pp + 1.5 + (c.stab - 0.5) * 2 + (c.detailed ? 0.5 : 0));
  const stabTarget = 0.55 + econ.stab + cons.stab + (c.ideo === 'dem' ? 0 : 0.08) - (c.sanctionHit || 0);
  c.stab += (Math.max(0.05, Math.min(0.95, stabTarget + (c.stabBonus || 0))) - c.stab) * 0.01;
  const wsTarget = (c.atWar ? 0.55 : 0.25) + (c.wsBonus || 0);
  c.ws += (Math.max(0.05, Math.min(0.98, wsTarget)) - c.ws) * 0.005;
  // money ($bn)
  const sanc = Math.min(0.4, c.sanctions.length * 0.03);
  c.gdp = c.baseGdp * (1 - sanc) * (c.gdpMod || 1);
  c.money += (c.gdp / 365) * 0.02 * econ.def;
  // production
  const milEff = c.mil * (1 + econ.mil);
  for (const k in HOA.EQUIP) {
    const share = c.prod[k] || 0;
    if (share <= 0) continue;
    const pts = milEff * share * (1 + (c.mods.prod[k] || 0) + (c.mods.prod.all || 0));
    c.prodProg[k] = (c.prodProg[k] || 0) + pts / HOA.EQUIP[k].cost;
    const whole = Math.floor(c.prodProg[k]);
    c.eq[k] += whole;
    c.prodProg[k] -= whole;
  }
  // manpower
  HOA.updateManpower(c, false);
  let committed = 0;
  for (const t of c.training) committed += HOA.UNITS[t.type].mp;
  c.mpLost = (c.mpLost || 0) * 0.998;
  const units = S._unitsByTag ? S._unitsByTag[c.tag] || [] : S.units.filter((u) => u.tag === c.tag);
  for (const u of units) committed += HOA.UNITS[u.type].mp * u.str;
  c.mp = Math.max(0, c.mpMax + (c.mpExtra || 0) - committed - c.mpLost / 1000);
  c.unitCount = units.length;
  // reinforcement
  const rate = 0.04 * (1 + c.mods.reinforce);
  for (const u of units) {
    if (u.str >= 0.999 || u.tr) continue;
    const T = HOA.UNITS[u.type];
    let d = Math.min(1 - u.str, u.inBattle ? rate * 0.3 : rate);
    for (const k in T.eq) if (T.eq[k] > 0) d = Math.min(d, c.eq[k] / T.eq[k]);
    d = Math.min(d, c.mp / T.mp);
    if (d <= 0) continue;
    for (const k in T.eq) c.eq[k] -= T.eq[k] * d;
    c.mp -= T.mp * d;
    c.mpLost += T.mp * d * 1000 * 0; // replacements come from pool
    u.str += d;
  }
  // training
  for (const t of c.training) t.days--;
  const done = c.training.filter((t) => t.days <= 0);
  if (done.length) {
    c.training = c.training.filter((t) => t.days > 0);
    for (const t of done) {
      const p = HOA.homeProvince(S, W, c);
      if (p < 0) continue;
      const u = HOA.addUnit(S, c.tag, t.type, p);
      c.mpUsed -= HOA.UNITS[t.type].mp;
      u.org = HOA.maxOrg(S, u) * 0.5;
      if (t.rally != null) HOA.orderMove(S, W, u, t.rally, true);
      if (c.tag === S.player) HOA.news(S, `✔ Nová jednotka připravena: ${u.name}.`, 'own');
    }
  }
  // research
  const slots = c.slots + c.mods.slot;
  c.research = c.research.slice(0, slots);
  for (const r of c.research) {
    const t = HOA.TECH_BY_ID[r.id];
    const ahead = Math.max(0, t.year - year);
    const cost = t.cost * (1 + ahead * 0.4);
    r.prog += 1 + (c.resBonus || 0);
    r.cost = cost;
    if (r.prog >= cost) {
      c.techs.push(r.id);
      r.done = true;
      HOA.recomputeMods(c);
      if (c.tag === S.player) HOA.news(S, `🔬 Výzkum dokončen: ${t.name}.`, 'own');
    }
  }
  c.research = c.research.filter((r) => !r.done);
  // focus
  if (c.focus.cur) {
    c.focus.prog++;
    const tree = HOA.focusTreeFor(c.tag);
    const f = tree.find((x) => x.id === c.focus.cur);
    if (f && c.focus.prog >= f.days) {
      c.focus.done.push(f.id);
      c.focus.cur = null; c.focus.prog = 0;
      HOA.applyEffects(S, W, c.tag, f.eff);
      if (c.tag === S.player) HOA.news(S, `★ Národní cíl splněn: ${f.name}.`, 'own');
      else if (c.detailed) HOA.news(S, `${c.name} dokončilo národní cíl „${f.name}“.`, 'info');
    }
  }
  // construction
  if (c.build.length) {
    let civAvail = Math.max(0, c.civ * (c.laws.economy === 'total' ? 0.7 : 0.85));
    const mult = 1 + (c.mods.civ || 0);
    for (const b of c.build) {
      if (civAvail <= 0) break;
      const use = Math.min(civAvail, 10);
      civAvail -= use;
      b.prog += use * 5 * mult;
    }
    for (const b of c.build.filter((x) => x.prog >= HOA.BUILD[x.type].cost * (x.type === 'fort' ? S.fort[x.p] + 1 : 1))) {
      if (b.type === 'civ') c.civ++;
      else if (b.type === 'mil') c.mil++;
      else if (b.type === 'fort') S.fort[b.p] = Math.min(5, S.fort[b.p] + 1);
      b.done = true;
      if (c.tag === S.player) HOA.news(S, `🏗 Stavba dokončena: ${HOA.BUILD[b.type].name}.`, 'own');
    }
    c.build = c.build.filter((x) => !x.done);
  }
  // deliveries
  if (c.deliveries.length) {
    for (const d of c.deliveries) {
      if (S.t < d.eta) continue;
      for (const k in d.eq) c.eq[k] += d.eq[k];
      if (d.bonus) { HOA.mergeBonus(c.fb, d.bonus, 0.5); HOA.recomputeMods(c); }
      d.done = true;
      if (c.tag === S.player) HOA.news(S, `📦 Dodávka dorazila: ${d.name}.`, 'own');
    }
    c.deliveries = c.deliveries.filter((d) => !d.done);
  }
  // war goal justification
  if (c.justifying) {
    c.justifying.days--;
    if (c.justifying.days <= 0) {
      c.wargoals.push(c.justifying.target);
      if (c.tag === S.player) HOA.news(S, `📜 Válečný cíl proti státu ${S.countries[c.justifying.target].name} je připraven.`, 'own');
      c.justifying = null;
    }
  }
};

HOA.homeProvince = function (S, W, c) {
  if (S.ctrl[c.capital] === c.tag) return c.capital;
  let best = -1, bv = -1;
  for (let p = 0; p < S.ctrl.length; p++) if (S.ctrl[p] === c.tag && W.provinces[p].vp > bv) { bv = W.provinces[p].vp; best = p; }
  return best;
};

HOA.mergeBonus = function (fb, b, scale) {
  scale = scale || 1;
  for (const k of ['att', 'def', 'org', 'spd', 'prod']) if (b[k]) for (const u in b[k]) fb[k][u] = (fb[k][u] || 0) + b[k][u] * scale;
  for (const k of ['airDef', 'droneDef', 'air', 'civ', 'mp', 'reinforce']) if (b[k]) fb[k] = (fb[k] || 0) + b[k] * scale;
};

// ---------- recruitment ----------
HOA.canRecruit = function (c, type) {
  const T = HOA.UNITS[type];
  if (c.mp < T.mp) return 'Nedostatek lidských zdrojů';
  for (const k in T.eq) if (c.eq[k] < T.eq[k]) return `Chybí: ${HOA.EQUIP[k].short}`;
  return null;
};
HOA.recruit = function (S, c, type, rally) {
  if (HOA.canRecruit(c, type)) return false;
  const T = HOA.UNITS[type];
  for (const k in T.eq) c.eq[k] -= T.eq[k];
  c.mp -= T.mp;
  c.mpUsed += T.mp;
  c.training.push({ type, days: T.days, total: T.days, rally });
  return true;
};

// ---------- effects ----------
HOA.applyEffects = function (S, W, tag, eff) {
  if (!eff) return;
  const c = S.countries[tag];
  if (!c || !c.alive) return;
  if (eff.pp) c.pp += eff.pp;
  if (eff.stab) c.stabBonus = (c.stabBonus || 0) + eff.stab * 0.5, (c.stab = Math.max(0, Math.min(1, c.stab + eff.stab)));
  if (eff.ws) c.wsBonus = (c.wsBonus || 0) + eff.ws * 0.5, (c.ws = Math.max(0, Math.min(1, c.ws + eff.ws)));
  if (eff.mp) c.mpExtra = (c.mpExtra || 0) + eff.mp, (c.mp += eff.mp);
  if (eff.civ) c.civ = Math.max(1, c.civ + eff.civ);
  if (eff.mil) c.mil = Math.max(0, c.mil + eff.mil);
  if (eff.money) c.money = Math.max(0, c.money + eff.money);
  if (eff.gdp) c.gdpMod = (c.gdpMod || 1) * (1 + eff.gdp);
  if (eff.eq) for (const k in eff.eq) c.eq[k] += eff.eq[k];
  if (eff.slot) c.slots += eff.slot;
  if (eff.nukes) c.nukes += eff.nukes;
  if (eff.bonus) { HOA.mergeBonus(c.fb, eff.bonus); HOA.recomputeMods(c); }
  if (eff.tech && !c.techs.includes(eff.tech)) { c.techs.push(eff.tech); c.research = c.research.filter((r) => r.id !== eff.tech); HOA.recomputeMods(c); }
  if (eff.research) {
    for (const cat in eff.research) {
      const r = c.research.find((x) => HOA.TECH_BY_ID[x.id].cat === cat);
      if (r) r.prog += eff.research[cat];
      else { c.resCredit = c.resCredit || {}; c.resCredit[cat] = (c.resCredit[cat] || 0) + eff.research[cat]; }
    }
  }
  if (eff.law) for (const cat in eff.law) c.laws[cat] = eff.law[cat];
  if (eff.rel) for (const t in eff.rel) HOA.addRel(S, tag, t, eff.rel[t]);
  if (eff.joinFaction && S.factions[eff.joinFaction]) HOA.joinFaction(S, tag, eff.joinFaction);
  if (eff.leaveFaction) HOA.leaveFaction(S, tag);
  if (eff.wargoal && !c.wargoals.includes(eff.wargoal)) c.wargoals.push(eff.wargoal);
  if (eff.access && S.countries[eff.access] && !S.countries[eff.access].access.includes(tag)) S.countries[eff.access].access.push(tag);
  if (eff.sanction) HOA.sanction(S, tag, eff.sanction, true);
  if (eff.giveEq && S.countries[eff.giveEq.to] && S.countries[eff.giveEq.to].alive) {
    const T = S.countries[eff.giveEq.to];
    for (const k in eff.giveEq.eq) T.eq[k] += eff.giveEq.eq[k];
    HOA.news(S, `📦 ${c.name} posílá vojenskou pomoc státu ${T.name}.`, eff.giveEq.to === S.player ? 'own' : 'diplo');
  }
  if (eff.units) {
    for (const g of eff.units) {
      if (g.n > 0) {
        const p = HOA.homeProvince(S, W, c);
        if (p < 0) continue;
        for (let i = 0; i < g.n; i++) { const u = HOA.addUnit(S, tag, g.t, p); c.mpUsed -= HOA.UNITS[g.t].mp; }
      } else {
        const list = S.units.filter((u) => u.tag === tag && u.type === g.t).slice(0, -g.n);
        list.forEach((u) => (u.dead = true));
        S.units = S.units.filter((u) => !u.dead);
      }
    }
  }
  if (eff.deploy && S.countries[eff.deploy.to]) {
    const host = S.countries[eff.deploy.to];
    if (!host.access.includes(tag)) host.access.push(tag);
    const p = HOA.homeProvince(S, W, host);
    if (p >= 0) for (const g of eff.deploy.units) for (let i = 0; i < g.n; i++) { HOA.addUnit(S, tag, g.t, p); c.mpUsed -= HOA.UNITS[g.t].mp; }
  }
  if (eff.fort) HOA.applyFort(S, W, tag, eff.fort);
  if (eff.annexOccupied) {
    let n = 0;
    for (let p = 0; p < S.ctrl.length; p++) if (S.ctrl[p] === tag && S.owner[p] !== tag && S.owner[p]) { S.owner[p] = tag; n++; }
    if (n) HOA.news(S, `${c.name} anektovalo ${n} okupovaných provincií. Mezinárodní společenství anexi neuznává.`, 'war');
    HOA.markMapDirty && HOA.markMapDirty();
  }
  if (eff.inviteFaction && c.faction) {
    for (const t of eff.inviteFaction) {
      const T = S.countries[t];
      if (!T || !T.alive || T.faction === c.faction) continue;
      if (t === S.player) { HOA.queueInvite && HOA.queueInvite(t, c.faction); continue; }
      if (HOA.getRel(S, t, tag) > 30 && !T.atWar) HOA.joinFaction(S, t, c.faction);
    }
  }
  if (eff.joinWar && S.countries[eff.joinWar] && S.countries[eff.joinWar].atWar) HOA.joinWar(S, tag, eff.joinWar);
};

HOA.applyFort = function (S, W, tag, f) {
  const P = W.provinces;
  const list = [];
  if (f.city) {
    const p = P.find((x) => x.name === f.city);
    if (p) {
      list.push(p.id);
      let frontier = [p.id];
      for (let r = 0; r < (f.radius || 0); r++) {
        const nx = [];
        for (const q of frontier) for (const e of P[q].nb) if (!list.includes(e.p) && S.ctrl[e.p] === tag) { list.push(e.p); nx.push(e.p); }
        frontier = nx;
      }
    }
  } else if (f.occupied) {
    for (let p = 0; p < S.ctrl.length; p++) {
      if (S.ctrl[p] !== tag || S.owner[p] === tag) continue;
      if (P[p].nb.some((e) => S.ctrl[e.p] !== tag)) list.push(p);
    }
  } else {
    for (let p = 0; p < S.ctrl.length; p++) {
      if (S.ctrl[p] !== tag) continue;
      if (P[p].nb.some((e) => !e.sea && S.ctrl[e.p] && S.ctrl[e.p] !== tag && (!f.border || f.border.includes(S.ctrl[e.p])))) list.push(p);
    }
  }
  for (const p of list) S.fort[p] = Math.min(5, Math.max(S.fort[p], f.lvl));
};

HOA.sanction = function (S, from, to, silent) {
  const T = S.countries[to];
  if (!T || T.sanctions.includes(from)) return;
  T.sanctions.push(from);
  HOA.addRel(S, from, to, -25);
  if (!silent || from === S.player) HOA.news(S, `${S.countries[from].name} uvalilo sankce na stát ${T.name}.`, 'diplo');
};

// ---------- events ----------
HOA.condOk = function (S, tag, cond) {
  const c = S.countries[tag];
  if (!c || !c.alive) return false;
  if (!cond) return true;
  if (cond.notInFaction && c.faction === cond.notInFaction) return false;
  if (cond.inFaction && c.faction !== cond.inFaction) return false;
  if (cond.war && !c.atWar) return false;
  if (cond.peace && c.atWar) return false;
  if (cond.occupies) {
    let ok = false;
    for (let p = 0; p < S.ctrl.length; p++) if (S.ctrl[p] === tag && S.owner[p] === cond.occupies) { ok = true; break; }
    if (!ok) return false;
  }
  return true;
};

HOA.checkEvents = function (S, W) {
  for (const ev of HOA.EVENTS) {
    if (S.firedEvents[ev.id]) continue;
    const t = Date.parse(ev.date + 'T00:00:00Z');
    if (S.t < t) continue;
    S.firedEvents[ev.id] = true;
    if (ev.tag && !HOA.condOk(S, ev.tag, ev.cond)) continue;
    HOA.fireEvent(S, W, ev);
  }
};

HOA.fireEvent = function (S, W, ev) {
  if (ev.leader && S.countries[ev.tag]) {
    const c = S.countries[ev.tag];
    c.leader = ev.leader[0];
    c.gov = ev.leader[1];
  }
  if (ev.effs) for (const t in ev.effs) HOA.applyEffects(S, W, t, ev.effs[t]);
  const playerDecides = ev.tag && ev.tag === S.player && ev.opts && ev.opts.length;
  const shown = playerDecides || ev.news || (ev.tag && ev.tag === S.player);
  if (playerDecides) {
    S.pendingEvents.push(ev.id);
    HOA.onEvent && HOA.onEvent(ev);
    return;
  }
  if (ev.opts && ev.opts.length && ev.tag) HOA.applyEffects(S, W, ev.tag, ev.opts[0].eff);
  if (shown && HOA.onEvent) HOA.onEvent(ev);
  else HOA.news(S, `📰 ${ev.title}` + (ev.tag && S.countries[ev.tag] ? ` (${S.countries[ev.tag].name})` : ''), 'news');
};

HOA.resolveEvent = function (S, W, ev, optIndex) {
  S.pendingEvents = S.pendingEvents.filter((x) => x !== ev.id);
  const o = ev.opts && ev.opts[optIndex];
  if (o) HOA.applyEffects(S, W, ev.tag, o.eff);
};

// ---------- capitulation ----------
HOA.surrenderProgress = function (S, W, tag) {
  let tot = 0, lost = 0;
  for (let p = 0; p < S.owner.length; p++) {
    if (S.owner[p] !== tag) continue;
    const vp = W.provinces[p].vp;
    tot += vp;
    if (S.ctrl[p] !== tag && HOA.atWar(S, tag, S.ctrl[p])) lost += vp;
  }
  return tot ? lost / tot : 1;
};

HOA.checkCapitulation = function (S, W) {
  for (const tag in S.countries) {
    const c = S.countries[tag];
    if (!c.alive || !c.atWar) continue;
    const sp = HOA.surrenderProgress(S, W, tag);
    c.surrender = sp;
    const capLost = S.ctrl[c.capital] !== tag;
    const threshold = 0.6 + c.stab * 0.2 + c.ws * 0.2 - (capLost ? 0.1 : 0);
    if (sp >= threshold) HOA.capitulate(S, W, tag);
  }
};

HOA.capitulate = function (S, W, tag) {
  const c = S.countries[tag];
  // biggest occupier
  const occ = {};
  for (let p = 0; p < S.owner.length; p++) if (S.owner[p] === tag && S.ctrl[p] !== tag && HOA.atWar(S, tag, S.ctrl[p])) occ[S.ctrl[p]] = (occ[S.ctrl[p]] || 0) + W.provinces[p].vp;
  const winner = Object.keys(occ).sort((a, b) => occ[b] - occ[a])[0] || HOA.enemiesOf(S, tag)[0];
  if (!winner) return;
  HOA.news(S, `🏳 ${c.name} kapitulovalo! Vítězem je ${S.countries[winner].name}.`, 'major');
  HOA.makePeace(S, winner, tag, 'cede');
  // remaining territory
  let left = 0, total = 0;
  for (let p = 0; p < S.owner.length; p++) { if (S.core[p] === tag) total++; if (S.owner[p] === tag) left++; }
  S.units.forEach((u) => { if (u.tag === tag) u.str *= 0.5; });
  if (left <= Math.max(1, total * 0.25)) {
    for (let p = 0; p < S.owner.length; p++) if (S.owner[p] === tag) { S.owner[p] = winner; S.ctrl[p] = winner; }
    S.units = S.units.filter((u) => u.tag !== tag);
    c.alive = false;
    if (c.faction) HOA.leaveFaction(S, tag);
    HOA.news(S, `${c.name} bylo anektováno státem ${S.countries[winner].name}.`, 'major');
  }
  c.capitulated = true;
  if (HOA.onCapitulate) HOA.onCapitulate(tag, winner);
  HOA.markMapDirty && HOA.markMapDirty();
};

// ---------- nukes ----------
HOA.canNuke = function (S, tag, p) {
  const c = S.countries[tag];
  if (!c || c.nukes <= 0) return 'Nemáte jaderné zbraně.';
  if (!c.techs.includes('nuc1')) return 'Chybí jaderná doktrína.';
  const tgt = S.ctrl[p];
  if (!tgt || !HOA.atWar(S, tag, tgt)) return 'Cíl musí být území nepřítele ve válce.';
  if (c.ws < 0.5) return 'Válečná podpora musí být alespoň 50 %.';
  return null;
};
HOA.nuke = function (S, W, tag, p) {
  const c = S.countries[tag];
  const tgtTag = S.ctrl[p];
  const T = S.countries[tgtTag];
  c.nukes--;
  const shield = T.mods.nukeShield + (T.faction && S.factions[T.faction] ? Math.max(...S.factions[T.faction].members.map((m) => S.countries[m].mods.nukeShield || 0)) * 0.5 : 0);
  const P = W.provinces;
  S.nukeFx.push({ p, t: Date.now(), intercepted: Math.random() < shield });
  if (S.nukeFx[S.nukeFx.length - 1].intercepted) {
    HOA.news(S, `🛡 Jaderná hlavice státu ${c.name} byla sestřelena protiraketovou obranou nad ${P[p].name || 'územím ' + T.name}!`, 'major');
  } else {
    const yieldM = 1 + c.mods.nukeYield;
    for (const u of S.units) {
      if (u.tr) continue;
      if (u.p === p) { u.str *= Math.max(0, 0.2 - 0.1 * (yieldM - 1)); u.org = 0; }
      else if (P[p].nb.some((e) => e.p === u.p && !e.sea)) { u.str *= 0.7; u.org *= 0.3; }
      if (u.str < 0.05) u.dead = true;
    }
    S.units = S.units.filter((u) => !u.dead);
    S.rad[p] = 365;
    S.fort[p] = 0;
    T.casualties += Math.round(50000 + P[p].vp * 40000);
    T.ws = Math.min(1, T.ws + 0.2);
    HOA.news(S, `☢ ${c.name} použilo jadernou zbraň proti ${P[p].name || 'území ' + T.name}!`, 'major');
  }
  S.tension = 100;
  c.stab = Math.max(0, c.stab - 0.15);
  for (const t in S.countries) if (t !== tag) HOA.addRel(S, t, tag, -50);
  for (const t in S.countries) if (t !== tag && S.countries[t].alive && !S.countries[t].faction) S.countries[t].sanctions.includes(tag) || HOA.sanction(S, t, tag, true);
  HOA.markMapDirty && HOA.markMapDirty();
  // retaliation planning for AI targets
  const avengers = [tgtTag].concat(T.faction && S.factions[T.faction] ? S.factions[T.faction].members : []);
  for (const a of avengers) {
    const A = S.countries[a];
    if (!A || a === S.player || A.nukes <= 0 || !HOA.atWar(S, a, tag)) continue;
    S.flags.retaliate = S.flags.retaliate || [];
    S.flags.retaliate.push({ by: a, on: tag, day: S.day + 1 + Math.floor(Math.random() * 3) });
    break;
  }
};
