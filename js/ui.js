// HTML user interface: top bar, panels, side info, focus tree, events, start screen.
window.HOA = window.HOA || {};

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pct = (x) => Math.round(x * 100) + ' %';
const fmtN = (n) => {
  const a = Math.abs(n);
  if (a >= 1e6) return (n / 1e6).toFixed(1).replace('.', ',') + ' mil.';
  if (a >= 1e4) return Math.round(n / 1e3) + ' tis.';
  return Math.round(n).toLocaleString('cs-CZ');
};
const money = (x) => '$' + (x >= 100 ? Math.round(x) : x.toFixed(1).replace('.', ',')) + ' mld';
HOA.fmtN = fmtN;

HOA.UI = { panel: null, side: null, invites: [] };

// ---------- effect descriptions ----------
HOA.unitTypeName = (t) => (t === 'all' ? 'všech jednotek' : HOA.UNITS[t] ? HOA.UNITS[t].name : t);
HOA.describeBonus = function (b) {
  const out = [];
  const names = { att: 'Útok', def: 'Obrana', org: 'Organizace', spd: 'Rychlost' };
  for (const k of ['att', 'def', 'org', 'spd']) if (b[k]) for (const u in b[k]) out.push(`${names[k]} (${HOA.unitTypeName(u)}) +${Math.round(b[k][u] * 100)} %`);
  if (b.prod) for (const u in b.prod) out.push(`Výroba (${u === 'all' ? 'vše' : HOA.EQUIP[u].short}) +${Math.round(b.prod[u] * 100)} %`);
  const simple = { airDef: 'Protivzdušná obrana', droneDef: 'Obrana proti dronům', air: 'Síla letectva', civ: 'Rychlost výstavby', mp: 'Lidské zdroje', reinforce: 'Rychlost doplňování', ignoreEW: 'Odolnost vůči rušení', nukeYield: 'Síla jaderných zbraní', nukeShield: 'Šance sestřelit hlavici' };
  for (const k in simple) if (b[k]) out.push(`${simple[k]} +${Math.round(b[k] * 100)} %`);
  if (b.slot) out.push(`+${b.slot} výzkumný slot`);
  if (b.nukeDoc) out.push('Umožňuje jaderné údery');
  return out;
};
HOA.describeEff = function (S, eff) {
  if (!eff) return [];
  const out = [];
  const cn = (t) => (S.factions[t] ? S.factions[t].name : S.countries[t] ? S.countries[t].name : t);
  if (eff.pp) out.push(`${eff.pp > 0 ? '+' : ''}${eff.pp} politické moci`);
  if (eff.stab) out.push(`Stabilita ${eff.stab > 0 ? '+' : ''}${Math.round(eff.stab * 100)} %`);
  if (eff.ws) out.push(`Válečná podpora ${eff.ws > 0 ? '+' : ''}${Math.round(eff.ws * 100)} %`);
  if (eff.mp) out.push(`+${eff.mp} tis. rekrutů`);
  if (eff.civ) out.push(`${eff.civ > 0 ? '+' : ''}${eff.civ} civilních továren`);
  if (eff.mil) out.push(`${eff.mil > 0 ? '+' : ''}${eff.mil} vojenských továren`);
  if (eff.money) out.push(`${eff.money > 0 ? '+' : ''}${money(eff.money)}`);
  if (eff.gdp) out.push(`HDP ${eff.gdp > 0 ? '+' : ''}${Math.round(eff.gdp * 100)} %`);
  if (eff.eq) out.push('Výbava: ' + Object.entries(eff.eq).map(([k, v]) => `+${v} ${HOA.EQUIP[k].short}`).join(', '));
  if (eff.units) out.push('Jednotky: ' + eff.units.map((g) => `${g.n > 0 ? '+' : ''}${g.n}× ${HOA.UNITS[g.t].name}`).join(', '));
  if (eff.rel) out.push('Vztahy: ' + Object.entries(eff.rel).map(([k, v]) => `${cn(k)} ${v > 0 ? '+' : ''}${v}`).join(', '));
  if (eff.joinFaction) out.push(`Vstup do aliance ${cn(eff.joinFaction)}`);
  if (eff.leaveFaction) out.push('Odchod z aliance');
  if (eff.slot) out.push(`+${eff.slot} výzkumný slot`);
  if (eff.research) out.push('Bonus výzkumu: ' + Object.entries(eff.research).map(([k, v]) => `${HOA.TECH_CATS[k]} (+${v} dní)`).join(', '));
  if (eff.bonus) out.push(...HOA.describeBonus(eff.bonus));
  if (eff.fort) out.push(`Opevnění úrovně ${eff.fort.lvl}` + (eff.fort.city ? ` kolem města ${eff.fort.city}` : eff.fort.occupied ? ' na okupované frontě' : eff.fort.border ? ` na hranici s ${eff.fort.border.map(cn).join(', ')}` : ' na hranicích'));
  if (eff.wargoal) out.push(`Válečný cíl proti státu ${cn(eff.wargoal)}`);
  if (eff.nukes) out.push(`+${eff.nukes} jaderných hlavic`);
  if (eff.giveEq) out.push(`Vojenská pomoc pro ${cn(eff.giveEq.to)}: ` + Object.entries(eff.giveEq.eq).map(([k, v]) => `${v} ${HOA.EQUIP[k].short}`).join(', '));
  if (eff.deploy) out.push(`Rozmístění ${eff.deploy.units.reduce((s, g) => s + g.n, 0)} jednotek v ${cn(eff.deploy.to)}`);
  if (eff.sanction) out.push(`Sankce proti ${cn(eff.sanction)}`);
  if (eff.access) out.push(`Vojenský přístup do ${cn(eff.access)}`);
  if (eff.tech) out.push(`Technologie: ${HOA.TECH_BY_ID[eff.tech].name}`);
  if (eff.law) out.push('Zákon: ' + Object.entries(eff.law).map(([k, v]) => HOA.lawOpt(k, v).name).join(', '));
  if (eff.annexOccupied) out.push('Anexe okupovaných území');
  if (eff.inviteFaction) out.push('Pozvat do aliance: ' + eff.inviteFaction.map(cn).join(', '));
  if (eff.joinWar) out.push(`Vstup do války po boku ${cn(eff.joinWar)}`);
  return out;
};

// ---------- init ----------
HOA.uiInit = function () {
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    e.stopPropagation();
    HOA.act(el.dataset.act, el.dataset.arg, el);
  });
  document.addEventListener('input', (e) => {
    const el = e.target;
    if (el.dataset.prod) HOA.setProd(el.dataset.prod, +el.value / 100);
    if (el.id === 'dipSearch') HOA.filterDip();
  });
  HOA.onNews = (text, kind) => {
    HOA.renderTicker();
    if (kind === 'major' || kind === 'own' || kind === 'war' && /vyhlásil|obklíčena/.test(text)) HOA.toast(text, kind);
  };
  HOA.onMessage = (t) => HOA.toast(t, 'warn');
  HOA.onEvent = (ev) => HOA.showEvent(ev);
  HOA.onPeaceOffer = (tag) => HOA.peaceOfferModal(tag);
  HOA.onCapitulate = (tag, winner) => {
    const S = HOA.S;
    if (tag === S.player) HOA.modal(`<h2>Kapitulace</h2><p>${esc(S.countries[tag].name)} kapitulovalo. ${S.countries[tag].alive ? 'Vláda přežila na zbytku území.' : 'Stát přestal existovat.'}</p>`, [{ t: S.countries[tag].alive ? 'Pokračovat' : 'Nová hra', act: S.countries[tag].alive ? 'closeModal' : 'newGame' }]);
    else if (winner === S.player) HOA.modal(`<h2>Vítězství!</h2><p>${esc(S.countries[tag].name)} kapitulovalo před vašimi vojsky. Okupovaná území připadla vám.</p>`, [{ t: 'Výborně', act: 'closeModal' }]);
  };
  HOA.queueInvite = (tag, fid) => {
    const S = HOA.S;
    HOA.modal(`<h2>Pozvánka do aliance</h2><p>Byli jste pozváni do aliance <b>${esc(S.factions[fid].name)}</b>.</p>`, [{ t: 'Přijmout', act: 'acceptInvite', arg: fid }, { t: 'Odmítnout', act: 'closeModal' }]);
  };
};

HOA.toast = function (text, kind) {
  const box = $('#toasts');
  const d = document.createElement('div');
  d.className = 'toast ' + (kind || '');
  d.textContent = text;
  box.appendChild(d);
  setTimeout(() => d.classList.add('out'), 4200);
  setTimeout(() => d.remove(), 4800);
  while (box.children.length > 5) box.firstChild.remove();
};

// ---------- top bar ----------
HOA.renderTop = function () {
  const S = HOA.S;
  const c = S.countries[S.player];
  if (!c) return;
  const units = S.units.filter((u) => u.tag === c.tag).length;
  const stat = (icon, val, tip, cls) => `<div class="stat ${cls || ''}" title="${esc(tip)}"><span class="ic">${icon}</span>${val}</div>`;
  $('#topbar .tb-country').innerHTML = `<img class="flag" src="${HOA.flagURL(c.tag, 48, 32)}"><div><div class="tb-name">${esc(c.name)}</div><div class="tb-leader">${esc(c.leader)}</div></div>`;
  $('#topbar .tb-stats').innerHTML = [
    stat('⚜', Math.round(c.pp), 'Politická moc – utrácí se za národní cíle, zákony a diplomacii'),
    stat('⚖', pct(c.stab), 'Stabilita'),
    stat('✊', pct(c.ws), 'Válečná podpora'),
    stat('👥', fmtN(c.mp * 1000), 'Dostupné lidské zdroje'),
    stat('$', money(c.money), 'Státní pokladna (rozpočet na obranu)'),
    stat('🏭', `${c.civ}/${c.mil}`, 'Civilní / vojenské továrny'),
    stat('⚔', units + (c.training.length ? `+${c.training.length}` : ''), 'Divize (v poli + ve výcviku)'),
    stat('☢', c.nukes, 'Jaderné hlavice', c.nukes ? '' : 'dim'),
  ].join('');
  $('#topbar .tb-date').textContent = HOA.fmtDate(S.t, true);
  document.querySelectorAll('.spd').forEach((b) => b.classList.toggle('on', +b.dataset.arg === S.speed && !S.paused));
  $('#pauseBtn').classList.toggle('on', S.paused);
  $('#pauseBtn').textContent = S.paused ? '▶' : '❚❚';
  const tens = $('#tension');
  tens.style.width = S.tension + '%';
  tens.parentElement.title = `Světové napětí: ${Math.round(S.tension)} %`;
};

HOA.renderTicker = function () {
  const S = HOA.S;
  const el = $('#ticker');
  if (!el) return;
  el.innerHTML = S.news.slice(0, 6).map((n) => `<div class="tk ${n.kind}"><span>${HOA.fmtDate(n.t)}</span> ${esc(n.text)}</div>`).join('');
};

// ---------- panels ----------
HOA.PANELS = {
  politics: '🏛 Politika', research: '🔬 Výzkum', production: '🏭 Výroba', army: '🎖 Armáda',
  diplomacy: '🤝 Diplomacie', market: '🛒 Trh zbraní', wars: '⚔ Války', news: '📰 Zprávy',
};
HOA.openPanel = function (key) {
  HOA.UI.panel = HOA.UI.panel === key ? null : key;
  document.querySelectorAll('#leftbar button').forEach((b) => b.classList.toggle('on', b.dataset.arg === HOA.UI.panel));
  HOA.renderPanel();
};
HOA.renderPanel = function () {
  const el = $('#panel');
  const key = HOA.UI.panel;
  if (!key) { el.classList.add('hidden'); return; }
  el.classList.remove('hidden');
  const search = $('#dipSearch');
  const keep = search ? { v: search.value, s: search.selectionStart } : null;
  const scroll = el.querySelector('.pbody') ? el.querySelector('.pbody').scrollTop : 0;
  const title = key === 'country' && HOA.S.countries[HOA.UI.countryTag] ? '👤 ' + esc(HOA.S.countries[HOA.UI.countryTag].name) : HOA.PANELS[key];
  el.innerHTML = `<div class="phead">${title}<button class="x" data-act="closePanel">✕</button></div><div class="pbody">${HOA['panel_' + key]()}</div>`;
  el.querySelector('.pbody').scrollTop = scroll;
  const s2 = $('#dipSearch');
  if (keep && s2) { s2.value = keep.v; HOA.filterDip(); }
};

HOA.bar = (v, cls) => `<div class="bar ${cls || ''}"><i style="width:${Math.max(0, Math.min(100, v * 100))}%"></i></div>`;

HOA.panel_politics = function () {
  const S = HOA.S, c = S.countries[S.player];
  const tree = HOA.focusTreeFor(c.tag);
  const cur = c.focus.cur && tree.find((f) => f.id === c.focus.cur);
  let h = `<div class="leader"><img class="flag big" src="${HOA.flagURL(c.tag, 72, 48)}"><div><b>${esc(c.leader)}</b><div class="muted">${esc(c.gov)}</div><div class="muted">${HOA.IDEOLOGIES[c.ideo].name}${c.faction ? ' • ' + esc(S.factions[c.faction].name) : ''}</div></div></div>`;
  h += `<div class="kv"><span>Stabilita</span>${HOA.bar(c.stab)}<b>${pct(c.stab)}</b></div>`;
  h += `<div class="kv"><span>Válečná podpora</span>${HOA.bar(c.ws, 'red')}<b>${pct(c.ws)}</b></div>`;
  h += `<div class="kv"><span>HDP</span><b>${money(c.gdp)}</b></div>`;
  h += `<div class="kv"><span>Populace</span><b>${c.pop.toLocaleString('cs-CZ')} mil.</b></div>`;
  if (c.sanctions.length) h += `<div class="kv warn"><span>Sankce</span><b>${c.sanctions.length} států (−${Math.round(Math.min(0.4, c.sanctions.length * 0.03) * 100)} % HDP)</b></div>`;
  const tm = (c.tmods || []).filter((t) => t.until > S.t);
  if (tm.length) {
    h += `<h3>Dočasné modifikátory</h3>`;
    for (const t of tm) h += `<div class="card"><b>${esc(t.name)}</b> <small>do ${HOA.fmtDate(t.until)}</small><div class="muted small">${esc(t.desc || '')}</div><small class="eff">${t.att ? `Útok ${t.att > 0 ? '+' : ''}${Math.round(t.att * 100)} % ` : ''}${t.def ? `Obrana ${t.def > 0 ? '+' : ''}${Math.round(t.def * 100)} %` : ''}</small></div>`;
  }
  h += `<h3>Národní cíl</h3>`;
  if (cur) h += `<div class="card"><b>${esc(cur.name)}</b>${HOA.bar(c.focus.prog / cur.days, 'gold')}<div class="muted">${c.focus.prog} / ${cur.days} dní</div></div>`;
  else h += `<div class="card warn">Není vybrán žádný národní cíl!</div>`;
  h += `<button class="btn wide gold" data-act="focusTree">Otevřít strom národních cílů</button>`;
  h += `<h3>Zákony</h3>`;
  for (const cat in HOA.LAWS) {
    const L = HOA.LAWS[cat];
    h += `<div class="lawcat">${L.name}</div><div class="laws">`;
    for (const o of L.opts) {
      const on = c.laws[cat] === o.id;
      const locked = o.req === 'war' && !c.atWar;
      h += `<button class="law ${on ? 'on' : ''}" ${on || locked ? 'disabled' : ''} data-act="setLaw" data-arg="${cat}:${o.id}" title="${esc(o.desc)}${locked ? ' (vyžaduje válku)' : ''}">${esc(o.name)}<small>${on ? 'aktivní' : o.pp + ' PM'}</small></button>`;
    }
    h += `</div>`;
  }
  h += `<h3>Aliance</h3>`;
  if (c.faction) h += `<div class="card">${esc(S.factions[c.faction].name)} – ${S.factions[c.faction].members.length} členů<br><button class="btn" data-act="leaveFaction">Opustit alianci</button></div>`;
  else h += `<button class="btn wide" data-act="createFaction">Založit novou alianci (100 PM)</button>`;
  return h;
};

HOA.panel_research = function () {
  const S = HOA.S, c = S.countries[S.player];
  const slots = c.slots + c.mods.slot;
  const year = new Date(S.t).getUTCFullYear();
  let h = `<div class="slots">`;
  for (let i = 0; i < slots; i++) {
    const r = c.research[i];
    if (r) { const t = HOA.TECH_BY_ID[r.id]; h += `<div class="slot"><b>${esc(t.name)}</b>${HOA.bar(r.prog / (r.cost || t.cost), 'blue')}<small>${Math.round(r.prog)} / ${Math.round(r.cost || t.cost)} dní</small><button class="x" data-act="cancelResearch" data-arg="${r.id}" title="Zrušit">✕</button></div>`; }
    else h += `<div class="slot empty">Volný výzkumný slot</div>`;
  }
  h += `</div>`;
  for (const cat in HOA.TECH_CATS) {
    h += `<h3>${HOA.TECH_CATS[cat]}</h3><div class="techs">`;
    for (const t of HOA.TECHS.filter((x) => x.cat === cat)) {
      const done = c.techs.includes(t.id);
      const active = c.research.some((r) => r.id === t.id);
      const avail = !done && !active && (!t.req || t.req.every((r) => c.techs.includes(r))) && (cat !== 'nuc' || c.nukes > 0 || t.id === 'nuc4');
      const ahead = Math.max(0, t.year - year);
      const desc = HOA.describeBonus(t.eff).join('<br>');
      h += `<div class="tech ${done ? 'done' : active ? 'active' : avail ? 'avail' : 'locked'}" ${avail ? `data-act="research" data-arg="${t.id}"` : ''} title="${esc(desc.replace(/<br>/g, '\n'))}">
        <b>${esc(t.name)}</b><small>${t.year}${ahead ? ` • předstih ${ahead} r.` : ''} • ${t.cost} dní</small><div class="eff">${desc}</div></div>`;
    }
    h += `</div>`;
  }
  return h;
};

HOA.panel_production = function () {
  const S = HOA.S, c = S.countries[S.player];
  const econ = HOA.lawOpt('economy', c.laws.economy);
  const milEff = c.mil * (1 + econ.mil);
  let h = `<div class="muted">Vojenské továrny: <b>${c.mil}</b> (efektivně ${milEff.toFixed(1)}) • rozdělte výrobu mezi typy výbavy.</div><div class="prod">`;
  for (const k in HOA.EQUIP) {
    const E = HOA.EQUIP[k];
    const share = c.prod[k] || 0;
    const perDay = (milEff * share * (1 + (c.mods.prod[k] || 0) + (c.mods.prod.all || 0))) / E.cost;
    h += `<div class="prow"><span class="pic">${E.icon}</span><div class="pname">${E.name}<small>sklad: <b>${fmtN(c.eq[k])}</b> • +${perDay.toFixed(1).replace('.', ',')}/den</small></div><input type="range" min="0" max="100" value="${Math.round(share * 100)}" data-prod="${k}"><span class="pv">${Math.round(share * 100)} %</span></div>`;
  }
  h += `</div><h3>Výstavba</h3><div class="muted">Civilní továrny: <b>${c.civ}</b> – každá stavba využije až 10 továren.</div>`;
  h += `<div class="row"><button class="btn" data-act="build" data-arg="civ">+ Civilní továrna</button><button class="btn" data-act="build" data-arg="mil">+ Vojenská továrna</button></div>`;
  const sp = HOA.R.selProv;
  if (sp >= 0 && S.ctrl[sp] === c.tag) h += `<button class="btn wide" data-act="build" data-arg="fort">+ Opevnění v provincii ${esc(HOA.provName(sp))} (úroveň ${S.fort[sp]})</button>`;
  else h += `<div class="muted small">Pro stavbu opevnění vyberte na mapě vlastní provincii.</div>`;
  for (const b of c.build) {
    const cost = HOA.BUILD[b.type].cost * (b.type === 'fort' ? S.fort[b.p] + 1 : 1);
    h += `<div class="card"><b>${HOA.BUILD[b.type].name}${b.type === 'fort' ? ' – ' + esc(HOA.provName(b.p)) : ''}</b>${HOA.bar(b.prog / cost, 'gold')}<button class="x" data-act="cancelBuild" data-arg="${c.build.indexOf(b)}">✕</button></div>`;
  }
  if (c.deliveries.length) {
    h += `<h3>Očekávané dodávky</h3>`;
    for (const d of c.deliveries) h += `<div class="card">${esc(d.name)} – dorazí ${HOA.fmtDate(d.eta)}</div>`;
  }
  return h;
};

HOA.panel_army = function () {
  const S = HOA.S, c = S.countries[S.player];
  const sp = HOA.R.selProv;
  const rally = sp >= 0 && HOA.canEnter(S, c.tag, sp) ? sp : null;
  let h = `<label class="toggle"><input type="checkbox" ${c.aiArmy ? 'checked' : ''} data-act="toggleAI"> <span>Automatické velení (AI řídí frontu)</span></label>`;
  h += `<div class="muted small">Ruční rozkazy: levým kliknutím vyberte jednotky (Shift + tažení = výběr oblastí), pravým kliknutím pošlete na cíl. Ručně ovládané jednotky AI 7 dní nepřebírá.</div>`;
  h += `<div class="row"><button class="btn" data-act="selectAll">Vybrat všechny jednotky</button></div>`;
  h += `<h3>Odvod nových divizí</h3><div class="muted small">Shromaždiště: ${rally != null ? esc(HOA.provName(rally)) : 'hlavní město'} (vyberte provincii na mapě)</div><table class="units"><tr><th>Typ</th><th>Út.</th><th>Obr.</th><th>Rychl.</th><th>Cena</th><th></th></tr>`;
  for (const t in HOA.UNITS) {
    const T = HOA.UNITS[t];
    const why = HOA.canRecruit(c, t);
    const cost = Object.entries(T.eq).map(([k, v]) => `${v} ${HOA.EQUIP[k].icon}`).join(' ') + ` • ${T.mp}k 👥`;
    h += `<tr><td><b>${T.name}</b></td><td>${Math.round(T.att * HOA.unitMod(c, 'att', t))}</td><td>${Math.round(T.def * HOA.unitMod(c, 'def', t))}</td><td>${T.spd}</td><td class="small">${cost}<br>${T.days} dní</td><td><button class="btn sm" ${why ? `disabled title="${esc(why)}"` : ''} data-act="recruit" data-arg="${t}">Odvést</button></td></tr>`;
  }
  h += `</table>`;
  if (c.training.length) {
    h += `<h3>Ve výcviku (${c.training.length})</h3>`;
    for (const t of c.training) h += `<div class="card">${HOA.UNITS[t.type].name}${HOA.bar(1 - t.days / t.total, 'green')}<small>${t.days} dní</small></div>`;
  }
  const mine = S.units.filter((u) => u.tag === c.tag);
  const byType = {};
  mine.forEach((u) => (byType[u.type] = (byType[u.type] || 0) + 1));
  h += `<h3>Armáda (${mine.length} divizí)</h3><div class="chips">${Object.entries(byType).map(([t, n]) => `<span class="chip">${n}× ${HOA.UNITS[t].name}</span>`).join('')}</div>`;
  h += `<div class="kv"><span>Ztráty</span><b>${fmtN(c.casualties)}</b></div><div class="kv"><span>Způsobené ztráty</span><b>${fmtN(c.kills)}</b></div>`;
  return h;
};

HOA.panel_diplomacy = function () {
  const S = HOA.S;
  let h = `<input id="dipSearch" placeholder="Hledat stát…" autocomplete="off"><div class="diplist">`;
  const tags = Object.keys(S.countries).filter((t) => S.countries[t].alive && t !== S.player);
  tags.sort((a, b) => (S.countries[b].detailed - S.countries[a].detailed) || S.countries[b].gdp - S.countries[a].gdp);
  for (const t of tags) {
    const c = S.countries[t];
    const r = HOA.getRel(S, S.player, t);
    const war = HOA.atWar(S, S.player, t);
    h += `<div class="dip" data-act="showCountry" data-arg="${t}" data-name="${esc(c.name.toLowerCase())}"><img class="flag" src="${HOA.flagURL(t, 30, 20)}"><span>${esc(c.name)}</span>${war ? '<em class="war">VÁLKA</em>' : ''}<b class="${r >= 0 ? 'pos' : 'neg'}">${r > 0 ? '+' : ''}${Math.round(r)}</b></div>`;
  }
  return h + '</div>';
};
HOA.filterDip = function () {
  const q = ($('#dipSearch').value || '').toLowerCase();
  document.querySelectorAll('.dip').forEach((d) => (d.style.display = d.dataset.name.includes(q) ? '' : 'none'));
};

HOA.panel_market = function () {
  const S = HOA.S, c = S.countries[S.player];
  let h = `<div class="muted">Pokladna: <b>${money(c.money)}</b>. Prodávající musí mít s vámi dobré vztahy nebo být ve stejné alianci.</div>`;
  const sellers = [...new Set(HOA.MARKET.map((m) => m.seller))];
  for (const s of sellers) {
    const sc = S.countries[s];
    if (!sc) continue;
    const ok = HOA.sellerWilling(S, s, S.player);
    h += `<h3><img class="flag" src="${HOA.flagURL(s, 24, 16)}"> ${esc(sc.name)} ${ok ? '' : '<em class="neg">neprodává</em>'}</h3><div class="market">`;
    for (const m of HOA.MARKET.filter((x) => x.seller === s)) {
      const can = ok && c.money >= m.price && s !== S.player;
      const eff = Object.entries(m.eq).map(([k, v]) => `+${v} ${HOA.EQUIP[k].short}`).concat(HOA.describeBonus(m.bonus).map((x) => x.replace(/\+(\d+)/, (a, n) => '+' + Math.round(n / 2)))).join(', ');
      h += `<div class="mitem"><div><b>${esc(m.name)}</b><small>${esc(m.desc)}</small><small class="eff">${eff} • ${m.days} dní</small></div><button class="btn sm" ${can ? '' : 'disabled'} data-act="buy" data-arg="${m.id}">${money(m.price)}</button></div>`;
    }
    h += `</div>`;
  }
  return h;
};

HOA.panel_wars = function () {
  const S = HOA.S, W = HOA.W;
  if (!S.wars.length) return '<div class="muted">Svět je v míru… zatím.</div>';
  let h = '';
  for (const w of S.wars) {
    const side = (list) => list.map((t) => `<span class="chip"><img class="flag" src="${HOA.flagURL(t, 18, 12)}"> ${esc(S.countries[t].name)}</span>`).join('');
    const days = Math.round((S.t - w.start) / 86400e3);
    h += `<div class="card war"><b>${esc(w.name)}</b> <small class="muted">${days} dní</small>
      <div class="sides"><div>${side(w.att)}</div><div class="vs">vs.</div><div>${side(w.def)}</div></div>
      <div class="kv"><span>Kapitulace ${esc(S.countries[w.leaderA].name)}</span>${HOA.bar(HOA.surrenderProgress(S, W, w.leaderA), 'red')}</div>
      <div class="kv"><span>Kapitulace ${esc(S.countries[w.leaderD].name)}</span>${HOA.bar(HOA.surrenderProgress(S, W, w.leaderD), 'red')}</div></div>`;
  }
  return h;
};

HOA.panel_news = function () {
  const S = HOA.S;
  return S.news.map((n) => `<div class="news ${n.kind}"><small>${HOA.fmtDate(n.t)}</small> ${esc(n.text)}</div>`).join('') || '<div class="muted">Žádné zprávy.</div>';
};

// ---------- country / leader view (right-click on a country) ----------
HOA.openCountryView = function (tag) {
  if (!HOA.S.countries[tag]) return;
  HOA.UI.countryTag = tag;
  HOA.UI.panel = 'country';
  document.querySelectorAll('#leftbar button').forEach((b) => b.classList.remove('on'));
  HOA.renderPanel();
};

HOA._leaderPromise = {};
HOA._leaderData = {};
// Portrait + short bio from Wikipedia (Czech first, English fallback). Cached in memory and localStorage.
HOA.leaderInfo = function (name) {
  if (HOA._leaderPromise[name]) return HOA._leaderPromise[name];
  let stored = null;
  try { stored = JSON.parse(localStorage.getItem('hoa_leader:' + name) || 'null'); } catch (e) { stored = null; }
  if (stored) { HOA._leaderData[name] = stored; return (HOA._leaderPromise[name] = Promise.resolve(stored)); }
  const summary = async (lang, title) => {
    const r = await fetch(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`);
    if (!r.ok) return null;
    const d = await r.json();
    return d.type === 'disambiguation' ? null : d;
  };
  const search = async (lang, q) => {
    const r = await fetch(`https://${lang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&srlimit=1&format=json&origin=*`);
    const d = await r.json();
    return d.query && d.query.search[0] ? d.query.search[0].title : null;
  };
  const p = (async () => {
    let d = await summary('cs', name);
    if (!d || !d.thumbnail) { const t = await search('cs', name + ' politik'); const d2 = t && (await summary('cs', t)); if (d2 && (d2.thumbnail || !d)) d = d2; }
    if (!d || !d.thumbnail) { const t = await search('en', name); const d2 = t && (await summary('en', t)); if (d2 && (d2.thumbnail || !d)) d = d2; }
    const info = d ? { img: d.thumbnail ? d.thumbnail.source : null, text: d.extract || '', desc: d.description || '', url: d.content_urls && d.content_urls.desktop ? d.content_urls.desktop.page : null } : { img: null, text: '' };
    try { localStorage.setItem('hoa_leader:' + name, JSON.stringify(info)); } catch (e) { /* storage full or blocked */ }
    HOA._leaderData[name] = info;
    return info;
  })().catch(() => {
    delete HOA._leaderPromise[name];
    return { img: null, text: '', offline: true };
  });
  return (HOA._leaderPromise[name] = p);
};

HOA.SILHOUETTE = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 156 210"><rect width="156" height="210" fill="#2b3036"/><circle cx="78" cy="78" r="38" fill="#4a525a"/><path d="M14 210c4-56 30-80 64-80s60 24 64 80z" fill="#4a525a"/></svg>');

HOA.partySupport = function (c) {
  // stylised popularity of ideologies (ruling ideology dominates, stability raises its share)
  const ids = Object.keys(HOA.IDEOLOGIES);
  const main = Math.round(45 + c.stab * 40);
  let h = 0;
  for (const ch of c.tag) h = (h * 31 + ch.charCodeAt(0)) % 997;
  const rest = ids.filter((i) => i !== c.ideo);
  const w = rest.map((_, i) => 1 + ((h >> i) % 5));
  const tot = w.reduce((a, b) => a + b, 0);
  const out = [[c.ideo, main]];
  let left = 100 - main;
  rest.forEach((id, i) => { const v = i === rest.length - 1 ? left : Math.round(((100 - main) * w[i]) / tot); out.push([id, v]); left -= v; });
  return out;
};

HOA.panel_country = function () {
  const S = HOA.S, W = HOA.W;
  const tag = HOA.UI.countryTag;
  const c = S.countries[tag];
  if (!c) return '';
  const name = c.leader;
  const real = name && name !== '—' && !/předsednictvo/i.test(name);
  const info = real ? HOA._leaderData[name] : null;
  if (real && !info) HOA.leaderInfo(name).then((inf) => {
    if (HOA.UI.panel !== 'country' || HOA.UI.countryTag !== tag) return;
    const img = document.getElementById('cvImg');
    if (img && inf.img) img.src = inf.img;
    const bio = document.getElementById('cvBio');
    if (bio) bio.innerHTML = HOA.bioHtml(inf);
  });
  const sup = HOA.partySupport(c);
  let acc = 0;
  const grad = sup.map(([id, v]) => { const a = acc; acc += v; return `${HOA.IDEOLOGIES[id].color} ${a}% ${acc}%`; }).join(',');
  const fac = c.faction && S.factions[c.faction];
  let h = `<div class="cv-top">
    <div class="portrait"><img id="cvImg" src="${info && info.img ? esc(info.img) : HOA.SILHOUETTE}" alt=""><div class="pname">${esc(name || '—')}</div></div>
    <div class="cv-info">
      <div class="cv-country"><img class="flag" src="${HOA.flagURL(tag, 48, 32)}"><b>${esc(c.name)}</b></div>
      <div class="cv-row"><span>Vláda</span><b>${esc(c.gov)}</b></div>
      <div class="cv-row"><span>Ideologie</span><b style="color:${HOA.IDEOLOGIES[c.ideo].color}">${HOA.IDEOLOGIES[c.ideo].name}</b></div>
      <div class="cv-row"><span>Aliance</span><b>${fac ? esc(fac.name) : '—'}</b></div>
      <div class="cv-pie"><div class="pie" style="background:conic-gradient(${grad})"></div><div class="legend">${sup.map(([id, v]) => `<div><i style="background:${HOA.IDEOLOGIES[id].color}"></i>${HOA.IDEOLOGIES[id].name} <b>${v} %</b></div>`).join('')}</div></div>
    </div></div>`;
  // national spirits
  const spirits = [];
  for (const t of (c.tmods || []).filter((t) => t.until > S.t)) spirits.push([t.att > 0 || t.def > 0 ? '⬆' : '⬇', t.name, (t.desc || '') + ` (do ${HOA.fmtDate(t.until)})`]);
  spirits.push(['🏭', HOA.lawOpt('economy', c.laws.economy).name, HOA.lawOpt('economy', c.laws.economy).desc]);
  spirits.push(['🎖', HOA.lawOpt('conscription', c.laws.conscription).name, HOA.lawOpt('conscription', c.laws.conscription).desc]);
  if (c.sanctions.length) spirits.push(['⛔', 'Mezinárodní sankce', `${c.sanctions.length} států, HDP −${Math.round(Math.min(0.4, c.sanctions.length * 0.03) * 100)} %`]);
  if (c.nukes) spirits.push(['☢', 'Jaderná mocnost', `${c.nukes} hlavic`]);
  if (c.atWar) spirits.push(['⚔', 'Ve válce', HOA.enemiesOf(S, tag).map((t) => S.countries[t].name).join(', ')]);
  if (c.focus.cur) { const f = HOA.focusTreeFor(tag).find((x) => x.id === c.focus.cur); if (f) spirits.push(['★', 'Národní cíl: ' + f.name, f.desc]); }
  h += `<h3>Národní duch</h3><div class="spirits">${spirits.map(([i, n, d]) => `<div class="spirit" title="${esc(d)}"><span>${i}</span>${esc(n)}</div>`).join('')}</div>`;
  h += `<h3>O vůdci</h3><div id="cvBio" class="bio">${real ? (info ? HOA.bioHtml(info) : '<span class="muted">Načítám z Wikipedie…</span>') : '<span class="muted">Bez podrobností.</span>'}</div>`;
  const prov = S.owner.reduce((n, o) => n + (o === tag ? 1 : 0), 0);
  h += `<h3>Stát</h3><div class="kv"><span>Provincie</span><b>${prov}</b></div><div class="kv"><span>Ztráty ve válkách</span><b>${fmtN(c.casualties)}</b></div>`;
  return h + HOA.side_country(tag, true);
};
HOA.bioHtml = function (inf) {
  if (inf.offline) return '<span class="muted">Wikipedie není dostupná (offline).</span>';
  if (!inf.text) return '<span class="muted">Informace nenalezeny.</span>';
  const t = inf.text.length > 650 ? inf.text.slice(0, 650).replace(/\s+\S*$/, '') + '…' : inf.text;
  return `<p>${esc(t)}</p>${inf.url ? `<a href="${esc(inf.url)}" target="_blank" rel="noopener">Více na Wikipedii ›</a>` : ''}`;
};

HOA.provName = function (p) {
  const pr = HOA.W.provinces[p];
  return pr.name && pr.name !== pr.region ? `${pr.name} (${pr.region})` : pr.region;
};

// ---------- side panel ----------
HOA.showSide = function (side) {
  HOA.UI.side = side;
  HOA.renderSide();
};
HOA.renderSide = function () {
  const el = $('#side');
  const sd = HOA.UI.side;
  const S = HOA.S;
  if (HOA.R.selected.size) {
    el.classList.remove('hidden');
    el.innerHTML = HOA.side_units();
    return;
  }
  if (!sd) { el.classList.add('hidden'); return; }
  el.classList.remove('hidden');
  let h = '';
  if (sd.p != null && sd.p >= 0) h += HOA.side_province(sd.p);
  if (sd.tag && S.countries[sd.tag]) h += HOA.side_country(sd.tag);
  el.innerHTML = `<button class="x close" data-act="closeSide">✕</button>` + h;
};

HOA.side_units = function () {
  const S = HOA.S;
  const units = S.units.filter((u) => HOA.R.selected.has(u.id));
  if (!units.length) { HOA.R.selected.clear(); return ''; }
  let h = `<button class="x close" data-act="deselect">✕</button><h2>Vybrané jednotky (${units.length})</h2>`;
  h += `<div class="row"><button class="btn sm" data-act="stopUnits">Zastavit</button><button class="btn sm danger" data-act="disband">Rozpustit</button></div><div class="ulist">`;
  for (const u of units.slice(0, 60)) {
    const T = HOA.UNITS[u.type];
    const mo = HOA.maxOrg(S, u);
    const st = u.tr ? 'přesun' : u.inBattle ? 'v boji' : u.path.length ? 'na pochodu' : 'v pohotovosti';
    h += `<div class="unit"><img class="usym" src="${HOA.symURL(u.type, S.countries[u.tag].color)}"><div class="un"><b>${esc(u.name)}</b><small>${esc(HOA.provName(u.p))} • ${st}</small>
      <div class="ub"><span>Org</span>${HOA.bar(u.org / mo, 'green')}</div><div class="ub"><span>Síla</span>${HOA.bar(u.str, 'gold')}</div></div></div>`;
  }
  h += '</div>';
  if (units.length > 60) h += `<div class="muted">… a dalších ${units.length - 60}</div>`;
  h += `<div class="muted small">Pravé tlačítko na mapě = přesun / útok.</div>`;
  return h;
};

HOA._symCache = {};
HOA.symURL = function (type, color) {
  const k = type + color;
  if (HOA._symCache[k]) return HOA._symCache[k];
  const c = document.createElement('canvas');
  c.width = 40; c.height = 28;
  const ctx = c.getContext('2d');
  ctx.scale(2, 2);
  ctx.fillStyle = color; ctx.fillRect(0, 0, 20, 14);
  HOA.unitSymbol(ctx, type, 3, 2.5, 14, 9);
  return (HOA._symCache[k] = c.toDataURL());
};

HOA.side_province = function (p) {
  const S = HOA.S, W = HOA.W;
  const pr = W.provinces[p];
  const o = S.owner[p], ct = S.ctrl[p];
  let h = `<h2>${esc(HOA.provName(p))}</h2><div class="kv"><span>Vlastník</span><b>${o ? esc(S.countries[o].name) : '—'}</b></div>`;
  if (ct !== o) h += `<div class="kv warn"><span>Okupant</span><b>${esc(S.countries[ct].name)}</b></div>`;
  h += `<div class="kv"><span>Body vítězství</span><b>${pr.vp}</b></div><div class="kv"><span>Opevnění</span><b>${'■'.repeat(S.fort[p])}${'□'.repeat(5 - S.fort[p])}</b></div>`;
  if (S.rad[p] > 0) h += `<div class="kv warn"><span>Radiace</span><b>${S.rad[p]} dní</b></div>`;
  const here = S.units.filter((u) => u.p === p && !u.tr);
  if (here.length) h += `<div class="muted small">Jednotky: ${[...new Set(here.map((u) => u.tag))].map((t) => `${here.filter((u) => u.tag === t).length}× ${esc(S.countries[t].name)}`).join(', ')}</div>`;
  const pl = S.player;
  if (pl) {
    const row = [];
    if (ct === pl) row.push(`<button class="btn sm" data-act="build" data-arg="fort">Opevnit</button>`);
    if (ct && HOA.atWar(S, pl, ct) && S.countries[pl].nukes > 0) {
      const why = HOA.canNuke(S, pl, p);
      row.push(`<button class="btn sm danger" ${why ? `disabled title="${esc(why)}"` : ''} data-act="nuke" data-arg="${p}">☢ Jaderný úder</button>`);
    }
    if (row.length) h += `<div class="row">${row.join('')}</div>`;
  }
  return h + '<hr>';
};

HOA.side_country = function (tag, noHeader) {
  const S = HOA.S, W = HOA.W, pl = S.player;
  const c = S.countries[tag];
  const P = S.countries[pl];
  const rel = HOA.getRel(S, pl, tag);
  const units = S.units.filter((u) => u.tag === tag).length;
  let h = noHeader ? '' : `<div class="leader"><img class="flag big" src="${HOA.flagURL(tag, 72, 48)}"><div><h2>${esc(c.name)}</h2><b>${esc(c.leader)}</b><div class="muted">${esc(c.gov)}</div><div class="muted">${HOA.IDEOLOGIES[c.ideo].name}${c.faction && S.factions[c.faction] ? ' • ' + esc(S.factions[c.faction].name) : ''}</div><button class="linkbtn" data-act="countryView" data-arg="${tag}">Detail státu a vůdce ›</button></div></div>`;
  h += `<div class="grid2"><div>HDP<b>${money(c.gdp)}</b></div><div>Populace<b>${c.pop} mil.</b></div><div>Divize<b>${units}</b></div><div>Továrny<b>${c.civ}/${c.mil}</b></div><div>Stabilita<b>${pct(c.stab)}</b></div><div>Vál. podpora<b>${pct(c.ws)}</b></div></div>`;
  if (c.nukes) h += `<div class="kv"><span>Jaderné hlavice</span><b>☢ ${c.nukes}</b></div>`;
  if (!pl) return h + (c.alive ? `<button class="btn gold wide" data-act="choose" data-arg="${tag}">Hrát za stát ${esc(c.name)}</button>` : '');
  if (tag === pl) return h;
  const war = HOA.atWar(S, pl, tag);
  h += `<div class="kv"><span>Vztahy s vámi</span><b class="${rel >= 0 ? 'pos' : 'neg'}">${rel > 0 ? '+' : ''}${Math.round(rel)}</b></div>`;
  const flags = [];
  if (war) flags.push('<em class="war">VE VÁLCE</em>');
  if (HOA.allies(S, pl, tag) && !war) flags.push('<em class="pos">spojenec</em>');
  if (c.access.includes(pl)) flags.push('<em>vojenský přístup</em>');
  if (P.guarantees.includes(tag)) flags.push('<em>garantováno</em>');
  if (c.sanctions.includes(pl)) flags.push('<em class="neg">sankce</em>');
  if (P.wargoals.includes(tag)) flags.push('<em class="neg">válečný cíl</em>');
  if (P.justifying && P.justifying.target === tag) flags.push(`<em>ospravedlňování ${P.justifying.days} d</em>`);
  if (flags.length) h += `<div class="chips">${flags.join(' ')}</div>`;
  if (!c.alive) return h;
  const B = (act, label, cost, dis, cls) => `<button class="btn sm ${cls || ''}" data-act="dip" data-arg="${act}|${tag}" ${dis ? `disabled title="${esc(dis)}"` : ''}>${label}${cost ? ` <small>${cost}</small>` : ''}</button>`;
  h += `<h3>Diplomacie</h3><div class="dipbtns">`;
  const pp = (n) => (P.pp < n ? 'Nedostatek politické moci' : null);
  if (!war) {
    h += B('improve', 'Zlepšit vztahy', '25 PM', pp(25) || HOA.cooldown(P, tag, 'improve'));
    h += B('access', 'Požádat o vojenský přístup', '25 PM', pp(25) || (c.access.includes(pl) ? 'Již máte přístup' : null));
    if (P.faction && c.faction !== P.faction) h += B('invite', 'Pozvat do aliance', '50 PM', pp(50) || (c.atWar && !HOA.allies(S, pl, tag) ? 'Stát je ve válce' : null));
    if (c.faction && c.faction !== P.faction) h += B('request', `Požádat o vstup do ${esc(S.factions[c.faction].name)}`, '50 PM', pp(50));
    h += B('guarantee', P.guarantees.includes(tag) ? 'Zrušit garanci' : 'Garantovat nezávislost', '25 PM', pp(25));
    h += B('aidMoney', 'Finanční pomoc', '$1 mld', P.money < 1 ? 'Nedostatek peněz' : null);
    h += B('aidEq', 'Poslat vybavení (10 %)', '', null);
    if (!c.sanctions.includes(pl)) h += B('sanction', 'Uvalit sankce', '10 PM', pp(10));
    if (c.atWar && HOA.allies(S, pl, tag)) h += B('callwar', 'Vstoupit do jejich války', '', null);
    if (!P.wargoals.includes(tag) && !(P.justifying && P.justifying.target === tag)) h += B('justify', 'Ospravedlnit válečný cíl', '50 PM', pp(50) || (HOA.allies(S, pl, tag) ? 'Nelze proti spojenci' : null));
    h += B('war', 'Vyhlásit válku', P.wargoals.includes(tag) ? '' : 'bez důvodu!', HOA.allies(S, pl, tag) && c.faction === P.faction ? 'Nejdřív opusťte společnou alianci' : null, 'danger');
  } else {
    h += B('peaceWhite', 'Navrhnout bílý mír', '', null);
    h += B('peaceFreeze', 'Navrhnout příměří na linii fronty', '', null);
    h += B('peaceCede', 'Požadovat postoupení okupovaných území', '', null);
    h += B('surrender', 'Kapitulovat', '', null, 'danger');
  }
  h += `</div>`;
  return h;
};
HOA.cooldown = function (P, tag, kind) {
  const k = tag + ':' + kind;
  const left = (P.lastDiplo[k] || 0) - HOA.S.day;
  return left > 0 ? `Znovu za ${left} dní` : null;
};

// ---------- actions ----------
HOA.act = function (name, arg, el) {
  const S = HOA.S, W = HOA.W;
  const P = S.player && S.countries[S.player];
  switch (name) {
    case 'panel': HOA.openPanel(arg); return;
    case 'closePanel': HOA.openPanel(HOA.UI.panel); return;
    case 'closeSide': HOA.UI.side = null; HOA.R.selProv = -1; HOA.renderSide(); return;
    case 'deselect': HOA.R.selected.clear(); HOA.renderSide(); return;
    case 'speed': S.speed = +arg; S.paused = false; HOA.renderTop(); return;
    case 'pause': S.paused = !S.paused; HOA.renderTop(); return;
    case 'mode': HOA.R.mode = arg; HOA.markMapDirty(); HOA.R.baseDirty = true; document.querySelectorAll('#mapmodes button').forEach((b) => b.classList.toggle('on', b.dataset.arg === arg)); return;
    case 'focusTree': HOA.showFocusTree(); return;
    case 'closeFocus': $('#focus').classList.add('hidden'); return;
    case 'pickFocus': {
      const f = HOA.focusTreeFor(P.tag).find((x) => x.id === arg);
      if (!f || !HOA.focusAvailable(S, P, f)) return;
      if (P.focus.cur && P.focus.prog > 0 && !confirm('Změnit národní cíl? Dosavadní postup bude ztracen.')) return;
      P.focus.cur = f.id; P.focus.prog = 0;
      HOA.showFocusTree(); HOA.renderPanel();
      return;
    }
    case 'setLaw': {
      const [cat, id] = arg.split(':');
      const o = HOA.lawOpt(cat, id);
      if (P.pp < o.pp) return HOA.toast('Nedostatek politické moci.', 'warn');
      P.pp -= o.pp; P.laws[cat] = id; HOA.updateManpower(P, false);
      HOA.renderPanel(); return;
    }
    case 'research':
      if (!HOA.startResearch(P, arg)) HOA.toast('Všechny výzkumné sloty jsou obsazené.', 'warn');
      HOA.renderPanel(); return;
    case 'cancelResearch': P.research = P.research.filter((r) => r.id !== arg); HOA.renderPanel(); return;
    case 'build': {
      if (arg === 'fort') {
        const p = HOA.R.selProv;
        if (p < 0 || S.ctrl[p] !== P.tag) return HOA.toast('Vyberte vlastní provincii.', 'warn');
        if (S.fort[p] >= 5) return HOA.toast('Opevnění je na maximu.', 'warn');
        P.build.push({ type: 'fort', p, prog: 0 });
      } else P.build.push({ type: arg, prog: 0 });
      HOA.toast(`Stavba zařazena: ${HOA.BUILD[arg].name}`, 'own');
      HOA.renderPanel(); return;
    }
    case 'cancelBuild': P.build.splice(+arg, 1); HOA.renderPanel(); return;
    case 'recruit': {
      const sp = HOA.R.selProv;
      const rally = sp >= 0 && HOA.canEnter(S, P.tag, sp) ? sp : null;
      if (!HOA.recruit(S, P, arg, rally)) HOA.toast(HOA.canRecruit(P, arg) || 'Nelze odvést.', 'warn');
      HOA.renderPanel(); HOA.renderTop(); return;
    }
    case 'toggleAI': P.aiArmy = el.checked; HOA.toast(P.aiArmy ? 'AI převzala velení fronty.' : 'Velení je ve vašich rukou.', 'own'); return;
    case 'selectAll': HOA.R.selected = new Set(S.units.filter((u) => u.tag === P.tag).map((u) => u.id)); HOA.renderSide(); return;
    case 'stopUnits': for (const u of S.units) if (HOA.R.selected.has(u.id) && !u.tr) { u.path = []; u.prog = 0; u.manual = S.day + 7; } HOA.renderSide(); return;
    case 'disband':
      if (!confirm('Opravdu rozpustit vybrané jednotky?')) return;
      S.units = S.units.filter((u) => !HOA.R.selected.has(u.id));
      HOA.R.selected.clear(); HOA.renderSide(); return;
    case 'showCountry': HOA.showSide({ tag: arg, p: -1 }); return;
    case 'dip': { const [k, t] = arg.split('|'); HOA.diplo(k, t || (HOA.UI.side && HOA.UI.side.tag)); return; }
    case 'countryView': HOA.openCountryView(arg); return;
    case 'buy': { const err = HOA.buyItem(S, P.tag, arg); if (err) HOA.toast(err, 'warn'); HOA.renderPanel(); HOA.renderTop(); return; }
    case 'nuke': {
      const p = +arg;
      if (!confirm(`Opravdu použít jadernou zbraň proti ${HOA.provName(p)}? Svět vám to neodpustí.`)) return;
      HOA.nuke(S, W, P.tag, p); HOA.renderSide(); return;
    }
    case 'createFaction': {
      if (P.pp < 100) return HOA.toast('Nedostatek politické moci.', 'warn');
      const nm = prompt('Název nové aliance:', `Aliance ${P.name}`);
      if (!nm) return;
      P.pp -= 100;
      HOA.createFaction(S, P.tag, nm.slice(0, 40));
      HOA.renderPanel(); return;
    }
    case 'leaveFaction': if (confirm('Opustit alianci?')) { HOA.leaveFaction(S, P.tag); HOA.renderPanel(); } return;
    case 'acceptInvite': HOA.joinFaction(S, S.player, arg); HOA.closeModal(); return;
    case 'eventOpt': {
      const [id, i] = arg.split(':');
      const ev = HOA.EVENTS.find((e) => e.id === id) || HOA._dynEvents[id];
      HOA.closeModal();
      if (ev && ev.opts) HOA.resolveEvent(S, W, ev, +i);
      return;
    }
    case 'acceptPeace': HOA.makePeace(S, S.player, arg, 'cede'); HOA.closeModal(); return;
    case 'closeModal': HOA.closeModal(); return;
    case 'save': HOA.saveGame(); return;
    case 'load': HOA.loadGame(); return;
    case 'newGame': location.reload(); return;
    case 'choose': HOA.startAs(arg); return;
    case 'menu': $('#menu').classList.toggle('hidden'); return;
    case 'help': HOA.showHelp(); return;
  }
};

HOA.setProd = function (k, v) {
  const S = HOA.S, c = S.countries[S.player];
  c.prod[k] = v;
  // normalise others to keep total at 100 %
  const others = Object.keys(HOA.EQUIP).filter((x) => x !== k);
  const rest = others.reduce((s, x) => s + (c.prod[x] || 0), 0);
  const left = Math.max(0, 1 - v);
  for (const x of others) c.prod[x] = rest > 0 ? ((c.prod[x] || 0) / rest) * left : left / others.length;
  document.querySelectorAll('[data-prod]').forEach((inp) => {
    if (inp.dataset.prod !== k) inp.value = Math.round(c.prod[inp.dataset.prod] * 100);
    inp.nextElementSibling.textContent = Math.round(c.prod[inp.dataset.prod] * 100) + ' %';
  });
};

HOA.diplo = function (kind, tag) {
  const S = HOA.S, W = HOA.W;
  const pl = S.player, P = S.countries[pl], T = S.countries[tag];
  const spend = (n) => { if (P.pp < n) { HOA.toast('Nedostatek politické moci.', 'warn'); return false; } P.pp -= n; return true; };
  const answer = (ok, yes, no) => HOA.toast(ok ? '✔ ' + yes : '✖ ' + no, ok ? 'own' : 'warn');
  switch (kind) {
    case 'improve':
      if (!spend(25)) return;
      HOA.addRel(S, pl, tag, 15);
      P.lastDiplo[tag + ':improve'] = S.day + 30;
      HOA.toast(`Vztahy se státem ${T.name} se zlepšují.`, 'own');
      break;
    case 'access': {
      if (!spend(25)) return;
      const r = HOA.aiAccept(S, W, tag, pl, 'access');
      if (r.ok) T.access.push(pl);
      answer(r.ok, `${T.name} vám udělilo vojenský přístup.`, `${T.name} odmítlo vojenský přístup.`);
      break;
    }
    case 'invite': {
      if (!spend(50)) return;
      const r = HOA.aiAccept(S, W, tag, pl, 'join');
      if (r.ok) HOA.joinFaction(S, tag, P.faction);
      answer(r.ok, `${T.name} vstupuje do vaší aliance!`, `${T.name} pozvánku odmítlo (skóre ${r.score}).`);
      break;
    }
    case 'request': {
      if (!spend(50)) return;
      const fac = S.factions[T.faction];
      const r = HOA.aiAccept(S, W, fac.leader, pl, 'request');
      if (r.ok) HOA.joinFaction(S, pl, fac.id);
      answer(r.ok, `Byli jste přijati do aliance ${fac.name}!`, `Aliance ${fac.name} vaši žádost zamítla (skóre ${r.score}).`);
      break;
    }
    case 'guarantee':
      if (!spend(25)) return;
      if (P.guarantees.includes(tag)) P.guarantees = P.guarantees.filter((x) => x !== tag);
      else { P.guarantees.push(tag); HOA.addRel(S, tag, pl, 20); HOA.news(S, `${P.name} garantuje nezávislost státu ${T.name}.`, 'diplo'); }
      break;
    case 'aidMoney':
      if (P.money < 1) return;
      P.money -= 1; T.money += 1; HOA.addRel(S, tag, pl, 8);
      HOA.toast(`Odeslána finanční pomoc $1 mld státu ${T.name}.`, 'own');
      break;
    case 'aidEq':
      for (const k of ['inf', 'arm', 'art', 'aa', 'drn']) { const g = Math.floor(P.eq[k] * 0.1); P.eq[k] -= g; T.eq[k] += g; }
      HOA.addRel(S, tag, pl, 10);
      HOA.news(S, `📦 ${P.name} posílá vojenskou pomoc státu ${T.name}.`, 'diplo');
      break;
    case 'sanction':
      if (!spend(10)) return;
      HOA.sanction(S, pl, tag);
      break;
    case 'callwar':
      HOA.joinWar(S, pl, tag);
      HOA.addRel(S, tag, pl, 30);
      break;
    case 'justify': {
      if (!spend(50)) return;
      const days = T.faction ? 60 : 30;
      P.justifying = { target: tag, days };
      S.tension = Math.min(100, S.tension + 4);
      HOA.addRel(S, tag, pl, -20);
      HOA.toast(`Ospravedlňování válečného cíle potrvá ${days} dní.`, 'own');
      break;
    }
    case 'war': {
      const justified = P.wargoals.includes(tag);
      const facs = T.faction && S.factions[T.faction] ? `<p>Na obranu se připojí celá aliance <b>${esc(S.factions[T.faction].name)}</b> (${S.factions[T.faction].members.length} států)!</p>` : '';
      HOA.modal(`<h2>Vyhlásit válku státu ${esc(T.name)}?</h2>${justified ? '' : '<p class="neg">Nemáte válečný cíl: stabilita −20 %, vztahy se světem −30, světové napětí +20.</p>'}${facs}`, [
        { t: 'Vyhlásit válku', act: 'confirmWar', arg: tag, cls: 'danger' }, { t: 'Zpět', act: 'closeModal' }]);
      HOA._confirmWar = () => {
        if (T.faction && T.faction === P.faction) HOA.leaveFaction(S, pl);
        if (!justified) { P.stab = Math.max(0, P.stab - 0.2); for (const t in S.countries) if (t !== tag) HOA.addRel(S, t, pl, -30); S.tension = Math.min(100, S.tension + 20); }
        HOA.declareWar(S, pl, tag);
        HOA.markMapDirty();
      };
      return;
    }
    case 'peaceWhite': case 'peaceFreeze': case 'peaceCede': {
      const mode = { peaceWhite: 'white', peaceFreeze: 'freeze', peaceCede: 'cede' }[kind];
      const war = S.wars.find((w) => (w.att.includes(pl) && w.def.includes(tag)) || (w.def.includes(pl) && w.att.includes(tag)));
      const leader = war ? (war.att.includes(tag) ? war.leaderA : war.leaderD) : tag;
      const r = HOA.aiAccept(S, W, leader, pl, 'peace', mode);
      if (r.ok) HOA.makePeace(S, pl, leader === tag ? tag : leader, mode);
      answer(r.ok, `${S.countries[leader].name} přijalo mírové podmínky.`, `${S.countries[leader].name} mír odmítá (skóre ${r.score}).`);
      break;
    }
    case 'surrender':
      if (!confirm('Opravdu kapitulovat? Nepřítel si ponechá okupovaná území.')) return;
      HOA.makePeace(S, tag, pl, 'cede');
      break;
  }
  HOA.renderSide(); HOA.renderTop();
  if (HOA.UI.panel === 'country') HOA.renderPanel();
  HOA.markMapDirty();
};
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act="confirmWar"]');
  if (el && HOA._confirmWar) { HOA._confirmWar(); HOA._confirmWar = null; HOA.closeModal(); HOA.renderSide(); if (HOA.UI.panel === 'country') HOA.renderPanel(); }
});

// ---------- modal & events ----------
HOA._dynEvents = {};
HOA.modal = function (html, buttons) {
  const m = $('#modal');
  m.innerHTML = `<div class="mbox">${html}<div class="mbtns">${buttons.map((b) => `<button class="btn ${b.cls || ''}" data-act="${b.act}" data-arg="${esc(b.arg || '')}">${esc(b.t)}</button>`).join('')}</div></div>`;
  m.classList.remove('hidden');
  HOA.S.modalPause = true;
};
HOA.closeModal = function () {
  $('#modal').classList.add('hidden');
  HOA.S.modalPause = false;
  if (HOA._eventQueue && HOA._eventQueue.length) HOA.showEvent(HOA._eventQueue.shift());
};
HOA.showEvent = function (ev) {
  const S = HOA.S;
  if (!$('#modal').classList.contains('hidden')) { (HOA._eventQueue = HOA._eventQueue || []).push(ev); return; }
  const decides = ev.tag === S.player && ev.opts && ev.opts.length && S.pendingEvents.includes(ev.id);
  const who = ev.tag && S.countries[ev.tag] ? `<img class="flag" src="${HOA.flagURL(ev.tag, 30, 20)}"> ${esc(S.countries[ev.tag].name)}` : '🌍 Svět';
  let html = `<div class="evhead"><div class="evimg">${ev.news ? '📰' : '⚑'}</div><div><small>${HOA.fmtDate(S.t)} • ${who}</small><h2>${esc(ev.title)}</h2></div></div><p>${esc(ev.desc)}</p>`;
  if (ev.leader) html += `<p class="muted">Nový vůdce: <b>${esc(ev.leader[0])}</b> (${esc(ev.leader[1])})</p>`;
  const btns = [];
  if (decides) ev.opts.forEach((o, i) => {
    const d = HOA.describeEff(S, o.eff);
    btns.push({ t: o.t + (d.length ? '  —  ' + d.join(', ') : ''), act: 'eventOpt', arg: ev.id + ':' + i });
  });
  else btns.push({ t: 'Rozumím', act: 'closeModal' });
  HOA.modal(`<div class="event">${html}</div>`, btns);
};
HOA.peaceOfferModal = function (tag) {
  const S = HOA.S;
  if (!$('#modal').classList.contains('hidden')) return;
  HOA.modal(`<h2>Mírová nabídka</h2><p><b>${esc(S.countries[tag].name)}</b> nabízí mír a postoupení všech území, která okupujete.</p>`, [{ t: 'Přijmout mír', act: 'acceptPeace', arg: tag }, { t: 'Pokračovat ve válce', act: 'closeModal' }]);
};

// ---------- focus tree ----------
HOA.showFocusTree = function () {
  const S = HOA.S, c = S.countries[S.player];
  const tree = HOA.focusTreeFor(c.tag);
  const NW = 168, NH = 74, GX = 186, GY = 112, PAD = 30;
  const maxX = Math.max(...tree.map((f) => f.x)), maxY = Math.max(...tree.map((f) => f.y));
  const w = (maxX + 1) * GX + PAD * 2, h = (maxY + 1) * GY + PAD * 2;
  const pos = (f) => [PAD + f.x * GX, PAD + f.y * GY];
  let svg = `<svg width="${w}" height="${h}" class="flines">`;
  for (const f of tree) {
    const [x, y] = pos(f);
    for (const r of (f.req || []).concat(f.reqAny || [])) {
      const g = tree.find((z) => z.id === r);
      if (!g) continue;
      const [gx, gy] = pos(g);
      const dashed = (f.reqAny || []).includes(r);
      svg += `<path d="M${gx + NW / 2},${gy + NH} C${gx + NW / 2},${gy + NH + 25} ${x + NW / 2},${y - 25} ${x + NW / 2},${y}" class="${dashed ? 'dash' : ''} ${c.focus.done.includes(r) ? 'lit' : ''}"/>`;
    }
    for (const r of f.excl || []) {
      const g = tree.find((z) => z.id === r);
      if (!g || g.y !== f.y || g.x < f.x) continue;
      const [gx] = pos(g);
      svg += `<line x1="${x + NW}" y1="${y + NH / 2}" x2="${gx}" y2="${y + NH / 2}" class="excl"/><text x="${(x + NW + gx) / 2}" y="${y + NH / 2 + 5}" class="exclx">✕</text>`;
    }
  }
  svg += '</svg>';
  let nodes = '';
  for (const f of tree) {
    const [x, y] = pos(f);
    const done = c.focus.done.includes(f.id), cur = c.focus.cur === f.id, av = HOA.focusAvailable(S, c, f);
    const blocked = f.excl && f.excl.some((r) => c.focus.done.includes(r));
    const cls = done ? 'done' : cur ? 'cur' : av ? 'avail' : blocked ? 'blocked' : 'locked';
    const effs = HOA.describeEff(S, f.eff);
    const tip = `${f.name}\n${f.desc}\n\n${effs.join('\n')}\n\nDoba: ${f.days} dní`;
    nodes += `<div class="fnode ${cls}" style="left:${x}px;top:${y}px;width:${NW}px;height:${NH}px" ${av ? `data-act="pickFocus" data-arg="${f.id}"` : ''} title="${esc(tip)}">
      <div class="ficon">${done ? '✔' : cur ? '⏳' : '★'}</div><b>${esc(f.name)}</b><small>${f.days} dní</small>${cur ? HOA.bar(c.focus.prog / f.days, 'gold') : ''}</div>`;
  }
  const cur = c.focus.cur && tree.find((f) => f.id === c.focus.cur);
  const el = $('#focus');
  el.innerHTML = `<div class="fhead"><img class="flag" src="${HOA.flagURL(c.tag, 36, 24)}"> Národní cíle – ${esc(c.name)} ${cur ? `<span class="muted">• probíhá: ${esc(cur.name)}</span>` : ''}<button class="x" data-act="closeFocus">✕</button></div>
    <div class="fscroll"><div class="fcanvas" style="width:${w}px;height:${h}px">${svg}${nodes}</div></div>
    <div class="fhint">Najeďte na cíl pro zobrazení efektů. Kliknutím na dostupný cíl jej zahájíte.</div>`;
  el.classList.remove('hidden');
};

// ---------- start screen ----------
HOA.START_CHOICES = [
  ['UKR', 'Bránit vlast proti přesile. Západní pomoc, drony a odhodlání.', 'Těžká'],
  ['RUS', 'Speciální vojenská operace. Obrovská armáda, sankce a izolace.', 'Střední'],
  ['USA', 'Arzenál demokracie. Vést NATO, nebo se stáhnout?', 'Snadná'],
  ['CZE', 'Muniční iniciativa, zbrojovky a pevné místo v NATO.', 'Střední'],
  ['POL', 'Nejsilnější armáda Evropy na východním křídle.', 'Střední'],
  ['DEU', 'Zeitenwende – probudit evropského obra.', 'Střední'],
  ['BLR', 'Lukašenkův balanc mezi Moskvou a přežitím.', 'Těžká'],
  ['CHN', 'Přátelství bez hranic a otázka Tchaj-wanu.', 'Snadná'],
  ['GBR', 'Globální Británie po brexitu.', 'Snadná'],
  ['FRA', 'Evropská strategická autonomie.', 'Snadná'],
  ['TUR', 'Mezi Západem a Východem – Bayraktary na prodej.', 'Střední'],
  ['FIN', 'Neutralita, nebo NATO? 1 340 km hranice s Ruskem.', 'Střední'],
];
HOA.renderStart = function () {
  const S = HOA.S;
  const has = (() => { try { return !!localStorage.getItem('hoa_save'); } catch (e) { return false; } })();
  let h = `<div class="sbox"><div class="logo">HEARTS OF <span>ATOM</span></div><div class="sub">Velká strategie současnosti • Start: 24. února 2022, 04:00</div>
    <div class="choices">`;
  for (const [t, d, diff] of HOA.START_CHOICES) {
    const c = S.countries[t];
    h += `<div class="choice" data-act="choose" data-arg="${t}"><img class="flag" src="${HOA.flagURL(t, 60, 40)}"><div><b>${esc(c.name)}</b><small>${esc(c.leader)}</small><p>${esc(d)}</p><em>${diff}</em></div></div>`;
  }
  h += `</div><div class="shint">…nebo klikněte na <b>libovolnou zemi na glóbu</b> a zvolte ji v pravém panelu.</div>
    <div class="row center">${has ? '<button class="btn gold" data-act="load">Načíst uloženou hru</button>' : ''}<button class="btn" data-act="help">Jak hrát</button></div></div>`;
  $('#start').innerHTML = h;
};

HOA.showHelp = function () {
  HOA.modal(`<h2>Jak hrát</h2><div class="help">
  <p><b>Čas:</b> mezerník = pauza, klávesy 1–5 = rychlost. Hra se pozastaví při událostech.</p>
  <p><b>Mapa:</b> táhnutím otáčíte glóbem, kolečkem přibližujete. Klik na provincii zobrazí stát a diplomacii.</p>
  <p><b>Jednotky:</b> klik na žeton = výběr (Shift přidá), Shift + tažení = výběr oblastí, pravé tlačítko = přesun nebo útok. Zelený pruh = organizace, žlutý = síla. Červená linie je fronta.</p>
  <p><b>Boj:</b> útočte s přesilou alespoň 2:1, obránce má výhodu opevnění a zákopů. Prázdné nepřátelské provincie obsadíte pochodem, města kladou odpor.</p>
  <p><b>Ekonomika:</b> vojenské továrny vyrábějí výbavu, bez výbavy nelze doplňovat ani odvádět divize. Zbraně lze také koupit od spojenců na trhu.</p>
  <p><b>Politika:</b> národní cíle, zákony (válečná ekonomika, mobilizace), aliance. Válka bez válečného cíle stojí stabilitu.</p>
  <p><b>Vítězství:</b> stát kapituluje, když ztratí většinu bodů vítězství (hlavně města).</p>
  <p><b>Automatické velení</b> (panel Armáda) nechá AI řídit vaši frontu.</p></div>`, [{ t: 'Rozumím', act: 'closeModal' }]);
};

// ---------- save / load ----------
HOA.saveGame = function () {
  const S = HOA.S;
  const data = JSON.stringify(S, (k, v) => (k.startsWith('_') || k === 'modalPause' ? undefined : v));
  try { localStorage.setItem('hoa_save', data); HOA.toast('Hra uložena.', 'own'); } catch (e) { HOA.toast('Uložení selhalo: ' + e.message, 'warn'); }
  $('#menu').classList.add('hidden');
};
HOA.loadGame = function () {
  let data;
  try { data = localStorage.getItem('hoa_save'); } catch (e) { data = null; }
  if (!data) return HOA.toast('Žádná uložená hra.', 'warn');
  const S = JSON.parse(data);
  S.paused = true;
  S.nukeFx = [];
  HOA.S = S;
  HOA.recomputeAll(S);
  S._unitsByTag = {};
  for (const u of S.units) (S._unitsByTag[u.tag] = S._unitsByTag[u.tag] || []).push(u);
  HOA.R.selected.clear();
  HOA.startAs(S.player, true);
  HOA.toast('Hra načtena.', 'own');
  $('#menu').classList.add('hidden');
};
