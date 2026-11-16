// AI: economy, research, focus, diplomacy and front-line military control.
window.HOA = window.HOA || {};

HOA.aiDaily = function (S, W) {
  const tags = Object.keys(S.countries);
  for (const tag of tags) {
    const c = S.countries[tag];
    if (!c.alive) continue;
    const isPlayer = tag === S.player;
    const h = (tag.charCodeAt(0) + tag.charCodeAt(1) * 3 + tag.charCodeAt(2) * 7) % 7;
    if (!isPlayer && (S.day + h) % 7 === 0) HOA.aiEconomy(S, W, c);
    if (!isPlayer && (S.day + h) % 30 === 0) HOA.aiDiplomacy(S, W, c);
    if (c.atWar && (!isPlayer || c.aiArmy)) HOA.aiMilitary(S, W, c);
  }
  // nuclear retaliation
  if (S.flags.retaliate) {
    for (const r of S.flags.retaliate.slice()) {
      if (S.day < r.day) continue;
      S.flags.retaliate = S.flags.retaliate.filter((x) => x !== r);
      const targets = [];
      for (const u of S.units) if (u.tag === r.on && !u.tr) targets.push(u.p);
      const p = targets.length ? targets[Math.floor(Math.random() * targets.length)] : S.countries[r.on].capital;
      if (!HOA.canNuke(S, r.by, p)) HOA.nuke(S, W, r.by, p);
    }
  }
};

// ---------- economy ----------
HOA.aiEconomy = function (S, W, c) {
  // focus
  if (!c.focus.cur) {
    const av = HOA.availableFocuses(S, c).filter((f) => !f.aiAvoid);
    if (av.length) {
      av.sort((a, b) => a.y - b.y || a.x - b.x);
      const pick = av[Math.random() < 0.7 ? 0 : Math.floor(Math.random() * av.length)];
      c.focus.cur = pick.id; c.focus.prog = 0;
    }
  }
  // research
  const slots = c.slots + c.mods.slot;
  while (c.research.length < slots) {
    const av = HOA.availableTechs(c).filter((t) => !c.research.some((r) => r.id === t.id));
    if (!av.length) break;
    av.sort((a, b) => a.year - b.year + (a.cat === 'nuc' ? 5 : 0) - (b.cat === 'nuc' ? 5 : 0));
    HOA.startResearch(c, av[0].id);
  }
  // laws
  if (c.atWar && c.ws > 0.45) {
    for (const [cat, order] of [['economy', ['civil', 'partial', 'war']], ['conscription', ['vol', 'limited', 'mob']]]) {
      const cur = order.indexOf(c.laws[cat]);
      const next = cur >= 0 ? order[cur + 1] : null;
      if (!next) continue;
      const o = HOA.lawOpt(cat, next);
      if (c.pp >= o.pp) { c.pp -= o.pp; c.laws[cat] = next; HOA.updateManpower(c, false); }
    }
  }
  // production split
  const drn = c.techs.includes('drn2') ? 0.15 : 0.05;
  c.prod = c.atWar
    ? { inf: 0.3, arm: 0.2, art: 0.35 - drn, aa: 0.05, drn, air: c.mil > 20 ? 0.05 : 0 }
    : { inf: 0.35, arm: 0.25, art: 0.2, aa: 0.08, drn: 0.07, air: c.mil > 15 ? 0.05 : 0 };
  // recruitment
  const base = HOA.armySize(c);
  const target = c.atWar ? Math.ceil(base * 2 + 4) : base;
  const own = (S._unitsByTag && S._unitsByTag[c.tag] ? S._unitsByTag[c.tag].length : 0) + c.training.length;
  if (own < target) {
    for (let i = 0; i < 4 && own + i < target; i++) {
      let type = 'INF';
      if (c.eq.arm > 400 && c.eq.inf > 300) type = Math.random() < 0.5 ? 'MECH' : 'ARM';
      else if (c.eq.arm > 100 && c.eq.inf > 300) type = 'MECH';
      else if (c.eq.art > 300) type = 'ART';
      else if (c.eq.drn > 600 && c.techs.includes('drn2')) type = 'DRN';
      if (HOA.canRecruit(c, type)) type = 'INF';
      if (!HOA.recruit(S, c, type)) break;
    }
  }
  // construction
  if (c.build.length < 2) c.build.push({ type: c.atWar || Math.random() < 0.35 ? 'mil' : 'civ', prog: 0 });
  // weapons market
  if (c.atWar && c.money > 3) {
    const items = HOA.MARKET.filter((m) => m.seller !== c.tag && HOA.sellerWilling(S, m.seller, c.tag) && m.price * 1.3 < c.money);
    if (items.length) HOA.buyItem(S, c.tag, items[Math.floor(Math.random() * items.length)].id);
  }
};

HOA.availableFocuses = function (S, c) {
  const tree = HOA.focusTreeFor(c.tag);
  return tree.filter((f) => HOA.focusAvailable(S, c, f));
};
HOA.focusAvailable = function (S, c, f) {
  const done = c.focus.done;
  if (done.includes(f.id) || c.focus.cur === f.id) return false;
  if (f.req && !f.req.every((r) => done.includes(r))) return false;
  if (f.reqAny && !f.reqAny.some((r) => done.includes(r))) return false;
  if (f.excl && f.excl.some((r) => done.includes(r) || c.focus.cur === r)) return false;
  if (f.cond && !HOA.condOk(S, c.tag, f.cond)) return false;
  return true;
};
HOA.availableTechs = function (c) {
  return HOA.TECHS.filter((t) => !c.techs.includes(t.id) && (!t.req || t.req.every((r) => c.techs.includes(r))) && (t.cat !== 'nuc' || c.nukes > 0 || t.id === 'nuc4'));
};
HOA.startResearch = function (c, id) {
  if (c.techs.includes(id) || c.research.some((r) => r.id === id)) return false;
  if (c.research.length >= c.slots + c.mods.slot) return false;
  const t = HOA.TECH_BY_ID[id];
  let prog = 0;
  if (c.resCredit && c.resCredit[t.cat]) { prog = c.resCredit[t.cat]; delete c.resCredit[t.cat]; }
  c.research.push({ id, prog, cost: t.cost });
  return true;
};

// ---------- market ----------
HOA.sellerWilling = function (S, seller, buyer) {
  const s = S.countries[seller];
  if (!s || !s.alive || seller === buyer) return false;
  if (HOA.atWar(S, seller, buyer)) return false;
  if (seller === S.player) return false;
  const rel = HOA.getRel(S, seller, buyer);
  if (s.faction && s.faction === S.countries[buyer].faction) return true;
  // never arm those fighting the seller's close friends
  for (const e of HOA.enemiesOf(S, buyer)) if (HOA.getRel(S, seller, e) > 80) return false;
  return rel >= 20;
};
HOA.buyItem = function (S, tag, id) {
  const m = HOA.MARKET.find((x) => x.id === id);
  const c = S.countries[tag];
  if (!m || !c) return 'Neznámá položka.';
  if (!HOA.sellerWilling(S, m.seller, tag)) return `${S.countries[m.seller] ? S.countries[m.seller].name : m.seller} vám odmítá prodávat.`;
  if (c.money < m.price) return 'Nedostatek peněz.';
  c.money -= m.price;
  S.countries[m.seller].money += m.price * 0.8;
  HOA.addRel(S, tag, m.seller, 5);
  c.deliveries.push({ name: m.name, eq: m.eq, bonus: m.bonus, eta: S.t + m.days * 86400e3 });
  if (tag === S.player) HOA.news(S, `🛒 Objednáno: ${m.name} od státu ${S.countries[m.seller].name}. Dodání za ${m.days} dní.`, 'own');
  return null;
};

// ---------- diplomacy ----------
HOA.aiDiplomacy = function (S, W, c) {
  const enemies = HOA.enemiesOf(S, c.tag);
  // support friends at war (aid)
  if (!c.atWar && c.detailed) {
    for (const tag in S.countries) {
      const x = S.countries[tag];
      if (!x.alive || !x.atWar || tag === c.tag) continue;
      const rel = HOA.getRel(S, c.tag, tag);
      if (rel < 50) continue;
      const foes = HOA.enemiesOf(S, tag);
      if (!foes.some((f) => HOA.getRel(S, c.tag, f) < -40)) continue;
      const amt = Math.min(c.money * 0.15, c.gdp * 0.0006);
      if (amt > 0.05) { c.money -= amt; x.money += amt; }
      const share = c.tag === 'USA' ? 0.06 : 0.03;
      for (const k of ['inf', 'art', 'arm', 'aa', 'drn']) {
        const g = Math.floor(c.eq[k] * share);
        if (g > 0) { c.eq[k] -= g; x.eq[k] += g; }
      }
      if (tag === S.player && (amt > 0.3 || c.tag === 'USA')) HOA.news(S, `📦 ${c.name} posílá pomoc: $${amt.toFixed(1)} mld a vybavení.`, 'own');
      HOA.addRel(S, c.tag, tag, 2);
    }
  }
  // sanctions against enemies / aggressors we dislike
  for (const e of enemies) if (!S.countries[e].sanctions.includes(c.tag) && HOA.getRel(S, c.tag, e) < -50) HOA.sanction(S, c.tag, e, true);
  if (!c.atWar && c.detailed) {
    for (const w of S.wars) {
      const agg = w.leaderA;
      if (!S.countries[agg] || S.countries[agg].sanctions.includes(c.tag)) continue;
      if (HOA.getRel(S, c.tag, agg) < -40 && HOA.getRel(S, c.tag, w.leaderD) > 40) HOA.sanction(S, c.tag, agg, true);
    }
  }
  // war goals from focus -> declare war if strong
  for (const t of c.wargoals.slice()) {
    if (!S.countries[t] || !S.countries[t].alive) { c.wargoals = c.wargoals.filter((x) => x !== t); continue; }
    if (HOA.atWar(S, c.tag, t)) continue;
    const my = (S._unitsByTag[c.tag] || []).length, their = (S._unitsByTag[t] || []).length;
    if (my > their * 1.5 && c.ws > 0.4) HOA.declareWar(S, c.tag, t);
  }
  // AI-vs-AI peace logic
  if (c.atWar) {
    for (const w of S.wars.slice()) {
      const side = w.att.includes(c.tag) ? 'att' : w.def.includes(c.tag) ? 'def' : null;
      if (!side) continue;
      const isLeader = (side === 'att' ? w.leaderA : w.leaderD) === c.tag;
      if (!isLeader) continue;
      const foe = side === 'att' ? w.leaderD : w.leaderA;
      if (foe === S.player) continue;
      const mySp = HOA.surrenderProgress(S, W, c.tag), foeSp = HOA.surrenderProgress(S, W, foe);
      const years = (S.t - w.start) / (365 * 86400e3);
      if (mySp > 0.6 && foeSp < 0.1 && years > 0.5) HOA.makePeace(S, foe, c.tag, 'cede');
      else if (mySp > 0.35 && foeSp < 0.05 && years > 1 && Math.random() < 0.3) HOA.makePeace(S, foe, c.tag, 'freeze');
      else if (years > 4 && mySp < 0.2 && foeSp < 0.2 && Math.random() < 0.08) HOA.makePeace(S, foe, c.tag, 'freeze');
    }
  }
  // offer peace to player if losing badly
  if (c.atWar && S.player && HOA.atWar(S, c.tag, S.player) && HOA.onPeaceOffer) {
    const mySp = HOA.surrenderProgress(S, W, c.tag);
    if (mySp > 0.3 && Math.random() < 0.3) HOA.onPeaceOffer(c.tag);
  }
};

// Willingness of AI country `tag` to accept a diplomatic proposal from `from`.
HOA.aiAccept = function (S, W, tag, from, kind, extra) {
  const c = S.countries[tag], F = S.countries[from];
  const rel = HOA.getRel(S, tag, from);
  let score = rel / 2 + (c.ideo === F.ideo ? 15 : -10);
  switch (kind) {
    case 'access':
      score += 10 - (HOA.enemiesOf(S, from).some((e) => HOA.getRel(S, tag, e) > 50) ? 60 : 0);
      break;
    case 'join': { // from invites tag to its faction
      score -= 20;
      if (c.faction) score -= 60;
      if (c.atWar) score -= 20;
      const fac = S.factions[F.faction];
      if (fac) for (const m of fac.members) score += HOA.getRel(S, tag, m) > 50 ? 4 : HOA.getRel(S, tag, m) < -30 ? -8 : 0;
      break;
    }
    case 'request': { // from asks to join tag's faction
      const fac = S.factions[c.faction];
      score -= 15;
      if (F.atWar) score -= 30;
      if (fac) for (const m of fac.members) score += HOA.getRel(S, m, from) > 40 ? 3 : HOA.getRel(S, m, from) < -30 ? -15 : 0;
      break;
    }
    case 'peace': {
      const mySp = HOA.surrenderProgress(S, W, tag), foeSp = HOA.surrenderProgress(S, W, from);
      score = (mySp - foeSp) * 200 + (1 - c.ws) * 40 - 20;
      if (extra === 'cede') score -= 40;
      if (extra === 'white') score += foeSp > mySp ? -30 : 10;
      const w = S.wars.find((x) => (x.att.includes(tag) && x.def.includes(from)) || (x.def.includes(tag) && x.att.includes(from)));
      if (w) score += Math.min(20, ((S.t - w.start) / (365 * 86400e3)) * 6);
      break;
    }
    case 'callwar':
      score -= 30;
      if (c.faction && c.faction === F.faction) score += 30;
      break;
  }
  return { ok: score > 20, score: Math.round(score) };
};

// ---------- military ----------
HOA.aiMilitary = function (S, W, c) {
  const P = W.provinces;
  const tag = c.tag;
  const units = (S._unitsByTag[tag] || []).filter((u) => !u.tr && !(u.manual && u.manual > S.day));
  if (!units.length) return;
  const enemies = new Set(HOA.enemiesOf(S, tag));
  if (!enemies.size) return;
  const isEnemyProv = (p) => enemies.has(S.ctrl[p]);
  const friendly = (p) => S.ctrl[p] === tag || (HOA.allies(S, tag, S.ctrl[p]) && !enemies.has(S.ctrl[p]));
  const byProv = S._byProv || new Map();
  const enemyStr = (p) => { let s = 0; for (const v of byProv.get(p) || []) if (enemies.has(v.tag)) s += HOA.unitDef(S, v); return s; };
  // front provinces
  const front = [];
  const ownFrontBias = (p) => (S.ctrl[p] === tag || S.owner[p] === tag ? 1 : 0.6);
  for (let p = 0; p < P.length; p++) {
    if (!friendly(p)) continue;
    let threat = 0, touches = false;
    for (const e of P[p].nb) {
      if (e.sea) continue;
      if (isEnemyProv(e.p)) { touches = true; threat += 1 + enemyStr(e.p) / 20; }
    }
    if (touches) front.push({ p, w: (threat + P[p].vp * 0.05) * ownFrontBias(p) });
  }
  // garrisons for valuable cities near the war
  for (let p = 0; p < P.length; p++) {
    if (S.ctrl[p] !== tag || P[p].vp < 10 || front.some((f) => f.p === p)) continue;
    let near = false;
    for (const e of P[p].nb) { if (isEnemyProv(e.p)) near = true; for (const e2 of P[e.p].nb) if (isEnemyProv(e2.p)) near = true; }
    if (near) front.push({ p, w: 2 + P[p].vp * 0.08 });
  }
  if (!front.length) return;
  // limit front to the most relevant (closest to own capital) to avoid spreading across the globe
  const cap = P[c.capital];
  front.forEach((f) => (f.dist = d3.geoDistance([cap.lon, cap.lat], [P[f.p].lon, P[f.p].lat])));
  front.sort((a, b) => a.dist - b.dist);
  const fr = front.slice(0, Math.max(6, Math.min(front.length, Math.ceil(units.length * 0.8))));
  const totalW = fr.reduce((s, f) => s + f.w, 0);
  const want = new Map();
  for (const f of fr) want.set(f.p, Math.max(1, Math.round((units.length * f.w) / totalW)));
  // current assignment
  const have = new Map();
  const dest = (u) => (u.path.length ? u.path[u.path.length - 1] : u.p);
  const free = [];
  // strategic reserve: big countries keep part of the army near the capital unless it is threatened
  const capThreat = fr.some((f) => f.p === c.capital) || fr.some((f) => f.dist < 0.06);
  const reserve = new Set();
  if (!capThreat && units.length > 12) {
    const byCap = units.slice().sort((a, b) => d3.geoDistance([P[a.p].lon, P[a.p].lat], [cap.lon, cap.lat]) - d3.geoDistance([P[b.p].lon, P[b.p].lat], [cap.lon, cap.lat]));
    byCap.slice(0, Math.min(10, Math.ceil(units.length * 0.15))).forEach((u) => reserve.add(u));
  }
  for (const u of units) {
    if (reserve.has(u)) continue;
    const d = dest(u);
    if (want.has(d)) {
      const h = have.get(d) || 0;
      if (h < want.get(d) + 1) { have.set(d, h + 1); continue; }
    }
    if (u.path.length && isEnemyProv(u.path[0])) continue; // attacking
    free.push(u);
  }
  // assign free units to deficits (limit pathfinding per day)
  let budget = 40;
  for (const u of free) {
    if (budget <= 0) break;
    let best = -1, bs = -1e9;
    for (const f of fr) {
      const def = want.get(f.p) - (have.get(f.p) || 0);
      if (def <= 0) continue;
      const d = d3.geoDistance([P[u.p].lon, P[u.p].lat], [P[f.p].lon, P[f.p].lat]);
      const s = def * 2 - d * 20;
      if (s > bs) { bs = s; best = f.p; }
    }
    if (best < 0) break;
    budget--;
    if (HOA.orderMove(S, W, u, best, true)) have.set(best, (have.get(best) || 0) + 1);
  }
  // offensives
  let ownPow = 0, foePow = 0;
  for (const u of units) ownPow += HOA.unitEff(u);
  for (const e of enemies) for (const v of S._unitsByTag[e] || []) foePow += HOA.unitEff(v);
  const balance = Math.max(0.8, Math.min(2, foePow / Math.max(1, ownPow)));
  const aggression = ((tag === 'RUS' ? 1.1 : 1.3) - (c.ws - 0.5) * 0.3) * balance;
  const defender = S.wars.some((w) => w.def.includes(tag));
  for (const f of fr) {
    const here = (byProv.get(f.p) || []).filter((u) => u.tag === tag && !u.path.length && !u.tr && u.org > HOA.maxOrg(S, u) * 0.7 && u.str > 0.5 && !(u.manual && u.manual > S.day));
    if (!here.length) continue;
    let best = -1, br = 0;
    for (const e of P[f.p].nb) {
      if (e.sea || !isEnemyProv(e.p)) continue;
      const def = enemyStr(e.p) * (1.5 + S.fort[e.p] * 0.12) + 0.01;
      let att = 0;
      for (const u of here) att += HOA.unitAtt(S, u, S.ctrl[e.p]);
      let ratio = att / def + P[e.p].vp * 0.02 + Math.random() * 0.2;
      if (S.core[e.p] === tag) ratio += 0.3;
      else if (defender) ratio *= 0.75;
      if (ratio > br) { br = ratio; best = e.p; }
    }
    if (best < 0) continue;
    const empty = enemyStr(best) < 0.1;
    if (empty) {
      if (here.length < 2 && f.w > 2) continue;
      here.sort((a, b) => HOA.UNITS[b.type].spd - HOA.UNITS[a.type].spd);
      here[0].path = [best]; here[0].prog = 0;
    } else if (br > aggression) {
      const keep = br > 3 ? 0 : here.length >= 2 ? 1 : 0;
      if (here.length - keep <= 0) continue;
      here.sort((a, b) => HOA.UNITS[b.type].att - HOA.UNITS[a.type].att);
      for (let i = 0; i < here.length - keep; i++) { here[i].path = [best]; here[i].prog = 0; }
    }
  }
};
