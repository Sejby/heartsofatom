// User interface (Preact + htm, no build step): top bar, panels, side info, focus tree, events,
// start screen. All UI state lives in HOA.UI; any change calls HOA.uiRefresh(), which re-renders
// the whole tree and lets Preact patch only what changed in the DOM.
window.HOA = window.HOA || {};

const { h: hh, render: preactRender } = preact;
const html = htm.bind(hh);
const IDB = window.idbKeyval;

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
HOA.esc = esc;
const pct = (x) => Math.round(x * 100) + ' %';
const fmtN = (n) => {
  const a = Math.abs(n);
  if (a >= 1e6) return (n / 1e6).toFixed(1).replace('.', ',') + ' mil.';
  if (a >= 1e4) return Math.round(n / 1e3) + ' tis.';
  return Math.round(n).toLocaleString('cs-CZ');
};
const money = (x) => '$' + (x >= 100 ? Math.round(x) : x.toFixed(1).replace('.', ',')) + ' mld';
HOA.fmtN = fmtN;

HOA.UI = {
  panel: null, side: null, countryTag: null, dipQuery: '',
  focusOpen: false, menuOpen: false, modal: null, toasts: [], hasSave: false,
};

// ---------- rendering ----------
let refreshQueued = false;
HOA.uiRefresh = function () {
  if (refreshQueued) return;
  refreshQueued = true;
  queueMicrotask(() => {
    refreshQueued = false;
    preactRender(html`<${App} />`, document.getElementById('ui'));
  });
};
// legacy entry points used by the game modules
HOA.renderTop = HOA.renderTicker = HOA.renderPanel = HOA.renderSide = HOA.renderStart = HOA.uiRefresh;

// click handler for an action; re-renders afterwards
const on = (act, arg) => (e) => { e.stopPropagation(); HOA.act(act, arg, e.currentTarget); HOA.uiRefresh(); };
const Bar = ({ v, cls }) => html`<div class="bar ${cls || ''}"><i style=${{ width: Math.max(0, Math.min(100, v * 100)) + '%' }}></i></div>`;
const Flag = ({ tag, w, h, cls }) => html`<img class="flag ${cls || ''}" src=${HOA.flagURL(tag, w, h)} />`;
const Lines = ({ list }) => list.map((t, i) => html`${i ? html`<br />` : ''}${t}`);

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
HOA.uiInit = async function () {
  HOA.onNews = (text, kind) => {
    HOA.uiRefresh();
    if (kind === 'major' || kind === 'own' || kind === 'war' && /vyhlásil|obklíčena/.test(text)) HOA.toast(text, kind);
  };
  HOA.onMessage = (t) => HOA.toast(t, 'warn');
  HOA.onEvent = (ev) => HOA.showEvent(ev);
  HOA.onPeaceOffer = (tag) => HOA.peaceOfferModal(tag);
  HOA.onCapitulate = (tag, winner) => {
    const S = HOA.S;
    const c = S.countries[tag];
    if (tag === S.player) HOA.modal(html`<h2>Kapitulace</h2><p>${c.name} kapitulovalo. ${c.alive ? 'Vláda přežila na zbytku území.' : 'Stát přestal existovat.'}</p>`, [{ t: c.alive ? 'Pokračovat' : 'Nová hra', act: c.alive ? 'closeModal' : 'newGame' }]);
    else if (winner === S.player) HOA.modal(html`<h2>Vítězství!</h2><p>${c.name} kapitulovalo před vašimi vojsky. Okupovaná území připadla vám.</p>`, [{ t: 'Výborně', act: 'closeModal' }]);
  };
  HOA.queueInvite = (tag, fid) => {
    HOA.modal(html`<h2>Pozvánka do aliance</h2><p>Byli jste pozváni do aliance <b>${HOA.S.factions[fid].name}</b>.</p>`, [{ t: 'Přijmout', act: 'acceptInvite', arg: fid }, { t: 'Odmítnout', act: 'closeModal' }]);
  };
  await HOA.migrateStorage();
  try { HOA.UI.hasSave = (await IDB.get('hoa_save')) != null; } catch (e) { HOA.UI.hasSave = false; }
  HOA.uiRefresh();
};

let toastId = 0;
HOA.toast = function (text, kind) {
  const UI = HOA.UI;
  const t = { id: ++toastId, text, kind: kind || '', out: false };
  UI.toasts = UI.toasts.concat(t).slice(-5);
  setTimeout(() => { t.out = true; HOA.uiRefresh(); }, 4200);
  setTimeout(() => { UI.toasts = UI.toasts.filter((x) => x !== t); HOA.uiRefresh(); }, 4800);
  HOA.uiRefresh();
};

// ---------- app shell ----------
HOA.PANELS = {
  politics: '🏛 Politika', research: '🔬 Výzkum', production: '🏭 Výroba', army: '🎖 Armáda',
  diplomacy: '🤝 Diplomacie', market: '🛒 Trh zbraní', wars: '⚔ Války', news: '📰 Zprávy',
};
const LEFT = [['politics', '🏛', 'Politika', 'Politika a národní cíle'], ['research', '🔬', 'Výzkum', 'Výzkum'], ['production', '🏭', 'Výroba', 'Výroba a stavby'], ['army', '🎖', 'Armáda', 'Armáda'], ['diplomacy', '🤝', 'Diplomacie', 'Diplomacie'], ['market', '🛒', 'Trh', 'Trh zbraní'], ['wars', '⚔', 'Války', 'Války'], ['news', '📰', 'Zprávy', 'Zprávy']];
const MODES = [['political', 'Politická'], ['faction', 'Aliance'], ['ideology', 'Ideologie'], ['relations', 'Vztahy', 'ingame'], ['war', 'Válka', 'ingame']];

function App() {
  const S = HOA.S, UI = HOA.UI;
  return html`
    <${TopBar} />
    <div id="leftbar" class="ingame">
      ${LEFT.map(([k, ic, label, tip]) => html`<button key=${k} class=${UI.panel === k ? 'on' : ''} title=${tip} onClick=${on('panel', k)}>${ic}<span>${label}</span></button>`)}
    </div>
    <${Panel} />
    <${Side} />
    <div id="ticker" class="ingame">${S.news.slice(0, 6).map((n, i) => html`<div key=${i} class="tk ${n.kind}"><span>${HOA.fmtDate(n.t)}</span> ${n.text}</div>`)}</div>
    <div id="mapmodes">
      ${MODES.map(([k, label, cls]) => html`<button key=${k} class=${(HOA.R.mode === k ? 'on ' : '') + (cls || '')} onClick=${on('mode', k)}>${label}</button>`)}
    </div>
    ${UI.focusOpen && S.player ? html`<${FocusTree} />` : null}
    ${UI.modal ? html`<${Modal} m=${UI.modal} />` : null}
    <div id="toasts">${UI.toasts.map((t) => html`<div key=${t.id} class="toast ${t.kind} ${t.out ? 'out' : ''}">${t.text}</div>`)}</div>
    ${S.player ? null : html`<${Start} />`}`;
}

function TopBar() {
  const S = HOA.S, UI = HOA.UI;
  const c = S.countries[S.player];
  const stat = (icon, val, tip, cls) => html`<div class="stat ${cls || ''}" title=${tip}><span class="ic">${icon}</span>${val}</div>`;
  const units = c ? S.units.filter((u) => u.tag === c.tag).length : 0;
  return html`<div id="topbar" class="ingame">
    <div class="tb-country">${c ? html`<${Flag} tag=${c.tag} w=${48} h=${32} /><div><div class="tb-name">${c.name}</div><div class="tb-leader">${c.leader}</div></div>` : null}</div>
    <div class="tb-stats">${c ? [
      stat('⚜', Math.round(c.pp), 'Politická moc – utrácí se za národní cíle, zákony a diplomacii'),
      stat('⚖', pct(c.stab), 'Stabilita'),
      stat('✊', pct(c.ws), 'Válečná podpora'),
      stat('👥', fmtN(c.mp * 1000), 'Dostupné lidské zdroje'),
      stat('$', money(c.money), 'Státní pokladna (rozpočet na obranu)'),
      stat('🏭', `${c.civ}/${c.mil}`, 'Civilní / vojenské továrny'),
      stat('⚔', units + (c.training.length ? `+${c.training.length}` : ''), 'Divize (v poli + ve výcviku)'),
      stat('☢', c.nukes, 'Jaderné hlavice', c.nukes ? '' : 'dim'),
    ] : null}</div>
    <div class="tb-time">
      <div class="tension" title=${`Světové napětí: ${Math.round(S.tension)} %`}><i id="tension" style=${{ width: S.tension + '%' }}></i></div>
      <div class="tb-date">${HOA.fmtDate(S.t, true)}</div>
      <div class="speeds">
        <button id="pauseBtn" class=${S.paused ? 'on' : ''} title="Pauza (mezerník)" onClick=${on('pause')}>${S.paused ? '▶' : '❚❚'}</button>
        ${[1, 2, 3, 4, 5].map((n) => html`<button key=${n} class="spd ${n === S.speed && !S.paused ? 'on' : ''}" onClick=${on('speed', n)}>${n}</button>`)}
      </div>
    </div>
    <button class="menubtn" title="Menu" onClick=${on('menu')}>☰</button>
    <div id="menu" class=${UI.menuOpen ? '' : 'hidden'}>
      <button onClick=${on('save')}>💾 Uložit hru</button>
      <button onClick=${on('load')}>📂 Načíst hru</button>
      <button onClick=${on('help')}>❓ Jak hrát</button>
      <button onClick=${on('newGame')}>↺ Nová hra</button>
    </div>
  </div>`;
}

// ---------- panels ----------
HOA.openPanel = function (key) {
  HOA.UI.panel = HOA.UI.panel === key ? null : key;
  HOA.uiRefresh();
};

function Panel() {
  const S = HOA.S, key = HOA.UI.panel;
  if (!key || !S.player) return html`<div id="panel" class="hidden"></div>`;
  const title = key === 'country' && S.countries[HOA.UI.countryTag] ? '👤 ' + S.countries[HOA.UI.countryTag].name : HOA.PANELS[key];
  const Body = PANEL_BODY[key];
  return html`<div id="panel">
    <div class="phead">${title}<button class="x" onClick=${on('closePanel')}>✕</button></div>
    <div class="pbody" key=${key === 'country' ? 'country:' + HOA.UI.countryTag : key}><${Body} /></div>
  </div>`;
}

function PoliticsPanel() {
  const S = HOA.S, c = S.countries[S.player];
  const tree = HOA.focusTreeFor(c.tag);
  const cur = c.focus.cur && tree.find((f) => f.id === c.focus.cur);
  const tm = (c.tmods || []).filter((t) => t.until > S.t);
  return html`
    <div class="leader"><${Flag} tag=${c.tag} w=${72} h=${48} cls="big" /><div><b>${c.leader}</b><div class="muted">${c.gov}</div><div class="muted">${HOA.IDEOLOGIES[c.ideo].name}${c.faction ? ' • ' + S.factions[c.faction].name : ''}</div></div></div>
    <div class="kv"><span>Stabilita</span><${Bar} v=${c.stab} /><b>${pct(c.stab)}</b></div>
    <div class="kv"><span>Válečná podpora</span><${Bar} v=${c.ws} cls="red" /><b>${pct(c.ws)}</b></div>
    <div class="kv"><span>HDP</span><b>${money(c.gdp)}</b></div>
    <div class="kv"><span>Populace</span><b>${c.pop.toLocaleString('cs-CZ')} mil.</b></div>
    ${c.sanctions.length ? html`<div class="kv warn"><span>Sankce</span><b>${c.sanctions.length} států (−${Math.round(Math.min(0.4, c.sanctions.length * 0.03) * 100)} % HDP)</b></div>` : null}
    ${tm.length ? html`<h3>Dočasné modifikátory</h3>${tm.map((t, i) => html`<div key=${i} class="card"><b>${t.name}</b> <small>do ${HOA.fmtDate(t.until)}</small><div class="muted small">${t.desc || ''}</div><small class="eff">${t.att ? `Útok ${t.att > 0 ? '+' : ''}${Math.round(t.att * 100)} % ` : ''}${t.def ? `Obrana ${t.def > 0 ? '+' : ''}${Math.round(t.def * 100)} %` : ''}</small></div>`)}` : null}
    <h3>Národní cíl</h3>
    ${cur ? html`<div class="card"><b>${cur.name}</b><${Bar} v=${c.focus.prog / cur.days} cls="gold" /><div class="muted">${c.focus.prog} / ${cur.days} dní</div></div>` : html`<div class="card warn">Není vybrán žádný národní cíl!</div>`}
    <button class="btn wide gold" onClick=${on('focusTree')}>Otevřít strom národních cílů</button>
    <h3>Zákony</h3>
    ${Object.keys(HOA.LAWS).map((cat) => {
      const L = HOA.LAWS[cat];
      return html`<div key=${cat}><div class="lawcat">${L.name}</div><div class="laws">${L.opts.map((o) => {
        const isOn = c.laws[cat] === o.id;
        const locked = o.req === 'war' && !c.atWar;
        return html`<button key=${o.id} class="law ${isOn ? 'on' : ''}" disabled=${isOn || locked} title=${o.desc + (locked ? ' (vyžaduje válku)' : '')} onClick=${on('setLaw', cat + ':' + o.id)}>${o.name}<small>${isOn ? 'aktivní' : o.pp + ' PM'}</small></button>`;
      })}</div></div>`;
    })}
    <h3>Aliance</h3>
    ${c.faction ? html`<div class="card">${S.factions[c.faction].name} – ${S.factions[c.faction].members.length} členů<br /><button class="btn" onClick=${on('leaveFaction')}>Opustit alianci</button></div>`
      : html`<button class="btn wide" onClick=${on('createFaction')}>Založit novou alianci (100 PM)</button>`}`;
}

function ResearchPanel() {
  const S = HOA.S, c = S.countries[S.player];
  const slots = c.slots + c.mods.slot;
  const year = new Date(S.t).getUTCFullYear();
  const slotEls = [];
  for (let i = 0; i < slots; i++) {
    const r = c.research[i];
    if (r) {
      const t = HOA.TECH_BY_ID[r.id];
      slotEls.push(html`<div key=${'s' + i} class="slot"><b>${t.name}</b><${Bar} v=${r.prog / (r.cost || t.cost)} cls="blue" /><small>${Math.round(r.prog)} / ${Math.round(r.cost || t.cost)} dní</small><button class="x" title="Zrušit" onClick=${on('cancelResearch', r.id)}>✕</button></div>`);
    } else slotEls.push(html`<div key=${'s' + i} class="slot empty">Volný výzkumný slot</div>`);
  }
  return html`<div class="slots">${slotEls}</div>
    ${Object.keys(HOA.TECH_CATS).map((cat) => html`<div key=${cat}><h3>${HOA.TECH_CATS[cat]}</h3><div class="techs">${HOA.TECHS.filter((x) => x.cat === cat).map((t) => {
      const done = c.techs.includes(t.id);
      const active = c.research.some((r) => r.id === t.id);
      const avail = !done && !active && (!t.req || t.req.every((r) => c.techs.includes(r))) && (cat !== 'nuc' || c.nukes > 0 || t.id === 'nuc4');
      const ahead = Math.max(0, t.year - year);
      const desc = HOA.describeBonus(t.eff);
      return html`<div key=${t.id} class="tech ${done ? 'done' : active ? 'active' : avail ? 'avail' : 'locked'}" onClick=${avail ? on('research', t.id) : null} title=${desc.join('\n')}>
        <b>${t.name}</b><small>${t.year}${ahead ? ` • předstih ${ahead} r.` : ''} • ${t.cost} dní</small><div class="eff"><${Lines} list=${desc} /></div></div>`;
    })}</div></div>`)}`;
}

function ProductionPanel() {
  const S = HOA.S, c = S.countries[S.player];
  const econ = HOA.lawOpt('economy', c.laws.economy);
  const milEff = c.mil * (1 + econ.mil);
  const sp = HOA.R.selProv;
  return html`
    <div class="muted">Vojenské továrny: <b>${c.mil}</b> (efektivně ${milEff.toFixed(1)}) • rozdělte výrobu mezi typy výbavy.</div>
    <div class="prod">${Object.keys(HOA.EQUIP).map((k) => {
      const E = HOA.EQUIP[k];
      const share = c.prod[k] || 0;
      const perDay = (milEff * share * (1 + (c.mods.prod[k] || 0) + (c.mods.prod.all || 0))) / E.cost;
      return html`<div key=${k} class="prow"><span class="pic">${E.icon}</span><div class="pname">${E.name}<small>sklad: <b>${fmtN(c.eq[k])}</b> • +${perDay.toFixed(1).replace('.', ',')}/den</small></div>
        <input type="range" min="0" max="100" value=${Math.round(share * 100)} onInput=${(e) => { HOA.setProd(k, +e.currentTarget.value / 100); HOA.uiRefresh(); }} /><span class="pv">${Math.round(share * 100)} %</span></div>`;
    })}</div>
    <h3>Výstavba</h3><div class="muted">Civilní továrny: <b>${c.civ}</b> – každá stavba využije až 10 továren.</div>
    <div class="row"><button class="btn" onClick=${on('build', 'civ')}>+ Civilní továrna</button><button class="btn" onClick=${on('build', 'mil')}>+ Vojenská továrna</button></div>
    ${sp >= 0 && S.ctrl[sp] === c.tag ? html`<button class="btn wide" onClick=${on('build', 'fort')}>+ Opevnění v provincii ${HOA.provName(sp)} (úroveň ${S.fort[sp]})</button>`
      : html`<div class="muted small">Pro stavbu opevnění vyberte na mapě vlastní provincii.</div>`}
    ${c.build.map((b, i) => {
      const cost = HOA.BUILD[b.type].cost * (b.type === 'fort' ? S.fort[b.p] + 1 : 1);
      return html`<div key=${i} class="card"><b>${HOA.BUILD[b.type].name}${b.type === 'fort' ? ' – ' + HOA.provName(b.p) : ''}</b><${Bar} v=${b.prog / cost} cls="gold" /><button class="x" onClick=${on('cancelBuild', i)}>✕</button></div>`;
    })}
    ${c.deliveries.length ? html`<h3>Očekávané dodávky</h3>${c.deliveries.map((d, i) => html`<div key=${i} class="card">${d.name} – dorazí ${HOA.fmtDate(d.eta)}</div>`)}` : null}`;
}

function ArmyPanel() {
  const S = HOA.S, c = S.countries[S.player];
  const sp = HOA.R.selProv;
  const rally = sp >= 0 && HOA.canEnter(S, c.tag, sp) ? sp : null;
  const mine = S.units.filter((u) => u.tag === c.tag);
  const byType = {};
  mine.forEach((u) => (byType[u.type] = (byType[u.type] || 0) + 1));
  return html`
    <label class="toggle"><input type="checkbox" checked=${!!c.aiArmy} onChange=${on('toggleAI')} /> <span>Automatické velení (AI řídí frontu)</span></label>
    <div class="muted small">Ruční rozkazy: levým kliknutím vyberte jednotky (Shift + tažení = výběr oblastí), pravým kliknutím pošlete na cíl. Ručně ovládané jednotky AI 7 dní nepřebírá.</div>
    <div class="row"><button class="btn" onClick=${on('selectAll')}>Vybrat všechny jednotky</button></div>
    <h3>Odvod nových divizí</h3><div class="muted small">Shromaždiště: ${rally != null ? HOA.provName(rally) : 'hlavní město'} (vyberte provincii na mapě)</div>
    <table class="units"><tbody><tr><th>Typ</th><th>Út.</th><th>Obr.</th><th>Rychl.</th><th>Cena</th><th></th></tr>
    ${Object.keys(HOA.UNITS).map((t) => {
      const T = HOA.UNITS[t];
      const why = HOA.canRecruit(c, t);
      const cost = Object.entries(T.eq).map(([k, v]) => `${v} ${HOA.EQUIP[k].icon}`).join(' ') + ` • ${T.mp}k 👥`;
      return html`<tr key=${t}><td><b>${T.name}</b></td><td>${Math.round(T.att * HOA.unitMod(c, 'att', t))}</td><td>${Math.round(T.def * HOA.unitMod(c, 'def', t))}</td><td>${T.spd}</td><td class="small">${cost}<br />${T.days} dní</td><td><button class="btn sm" disabled=${!!why} title=${why || ''} onClick=${on('recruit', t)}>Odvést</button></td></tr>`;
    })}</tbody></table>
    ${c.training.length ? html`<h3>Ve výcviku (${c.training.length})</h3>${c.training.map((t, i) => html`<div key=${i} class="card">${HOA.UNITS[t.type].name}<${Bar} v=${1 - t.days / t.total} cls="green" /><small>${t.days} dní</small></div>`)}` : null}
    <h3>Armáda (${mine.length} divizí)</h3><div class="chips">${Object.entries(byType).map(([t, n]) => html`<span key=${t} class="chip">${n}× ${HOA.UNITS[t].name}</span>`)}</div>
    <div class="kv"><span>Ztráty</span><b>${fmtN(c.casualties)}</b></div><div class="kv"><span>Způsobené ztráty</span><b>${fmtN(c.kills)}</b></div>`;
}

function DiplomacyPanel() {
  const S = HOA.S, UI = HOA.UI;
  const q = UI.dipQuery.toLowerCase();
  const tags = Object.keys(S.countries).filter((t) => S.countries[t].alive && t !== S.player);
  tags.sort((a, b) => (S.countries[b].detailed - S.countries[a].detailed) || S.countries[b].gdp - S.countries[a].gdp);
  return html`<input id="dipSearch" placeholder="Hledat stát…" autocomplete="off" value=${UI.dipQuery} onInput=${(e) => { UI.dipQuery = e.currentTarget.value; HOA.uiRefresh(); }} />
    <div class="diplist">${tags.filter((t) => S.countries[t].name.toLowerCase().includes(q)).map((t) => {
      const c = S.countries[t];
      const r = HOA.getRel(S, S.player, t);
      return html`<div key=${t} class="dip" onClick=${on('showCountry', t)}><${Flag} tag=${t} w=${30} h=${20} /><span>${c.name}</span>${HOA.atWar(S, S.player, t) ? html`<em class="war">VÁLKA</em>` : null}<b class=${r >= 0 ? 'pos' : 'neg'}>${r > 0 ? '+' : ''}${Math.round(r)}</b></div>`;
    })}</div>`;
}

function MarketPanel() {
  const S = HOA.S, c = S.countries[S.player];
  const sellers = [...new Set(HOA.MARKET.map((m) => m.seller))].filter((s) => S.countries[s]);
  return html`<div class="muted">Pokladna: <b>${money(c.money)}</b>. Prodávající musí mít s vámi dobré vztahy nebo být ve stejné alianci.</div>
    ${sellers.map((s) => {
      const ok = HOA.sellerWilling(S, s, S.player);
      return html`<div key=${s}><h3><${Flag} tag=${s} w=${24} h=${16} /> ${S.countries[s].name} ${ok ? '' : html`<em class="neg">neprodává</em>`}</h3><div class="market">
        ${HOA.MARKET.filter((x) => x.seller === s).map((m) => {
          const can = ok && c.money >= m.price && s !== S.player;
          const eff = Object.entries(m.eq).map(([k, v]) => `+${v} ${HOA.EQUIP[k].short}`).concat(HOA.describeBonus(m.bonus).map((x) => x.replace(/\+(\d+)/, (a, n) => '+' + Math.round(n / 2)))).join(', ');
          return html`<div key=${m.id} class="mitem"><div><b>${m.name}</b><small>${m.desc}</small><small class="eff">${eff} • ${m.days} dní</small></div><button class="btn sm" disabled=${!can} onClick=${on('buy', m.id)}>${money(m.price)}</button></div>`;
        })}</div></div>`;
    })}`;
}

function WarsPanel() {
  const S = HOA.S, W = HOA.W;
  if (!S.wars.length) return html`<div class="muted">Svět je v míru… zatím.</div>`;
  const side = (list) => list.map((t) => html`<span key=${t} class="chip"><${Flag} tag=${t} w=${18} h=${12} /> ${S.countries[t].name}</span>`);
  return S.wars.map((w, i) => html`<div key=${i} class="card war"><b>${w.name}</b> <small class="muted">${Math.round((S.t - w.start) / 86400e3)} dní</small>
    <div class="sides"><div>${side(w.att)}</div><div class="vs">vs.</div><div>${side(w.def)}</div></div>
    <div class="kv"><span>Kapitulace ${S.countries[w.leaderA].name}</span><${Bar} v=${HOA.surrenderProgress(S, W, w.leaderA)} cls="red" /></div>
    <div class="kv"><span>Kapitulace ${S.countries[w.leaderD].name}</span><${Bar} v=${HOA.surrenderProgress(S, W, w.leaderD)} cls="red" /></div></div>`);
}

function NewsPanel() {
  const S = HOA.S;
  if (!S.news.length) return html`<div class="muted">Žádné zprávy.</div>`;
  return S.news.map((n, i) => html`<div key=${i} class="news ${n.kind}"><small>${HOA.fmtDate(n.t)}</small> ${n.text}</div>`);
}

// ---------- country / leader view (right-click on a country) ----------
HOA.openCountryView = function (tag) {
  if (!HOA.S.countries[tag]) return;
  HOA.UI.countryTag = tag;
  HOA.UI.panel = 'country';
  HOA.uiRefresh();
};

HOA._leaderPromise = {};
HOA._leaderData = {};
// Portrait + short bio from Wikipedia (Czech first, English fallback). Cached in memory and IndexedDB.
HOA.leaderInfo = function (name) {
  if (HOA._leaderPromise[name]) return HOA._leaderPromise[name];
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
    let stored = null;
    try { stored = await IDB.get('hoa_leader:' + name); } catch (e) { stored = null; }
    if (stored) return (HOA._leaderData[name] = stored);
    let d = await summary('cs', name);
    if (!d || !d.thumbnail) { const t = await search('cs', name + ' politik'); const d2 = t && (await summary('cs', t)); if (d2 && (d2.thumbnail || !d)) d = d2; }
    if (!d || !d.thumbnail) { const t = await search('en', name); const d2 = t && (await summary('en', t)); if (d2 && (d2.thumbnail || !d)) d = d2; }
    const info = d ? { img: d.thumbnail ? d.thumbnail.source : null, text: d.extract || '', desc: d.description || '', url: d.content_urls && d.content_urls.desktop ? d.content_urls.desktop.page : null } : { img: null, text: '' };
    try { await IDB.set('hoa_leader:' + name, info); } catch (e) { /* storage blocked */ }
    return (HOA._leaderData[name] = info);
  })().catch(() => {
    delete HOA._leaderPromise[name];
    return (HOA._leaderData[name] = { img: null, text: '', offline: true });
  });
  p.then(() => HOA.uiRefresh());
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

function Bio({ inf }) {
  if (inf.offline) return html`<span class="muted">Wikipedie není dostupná (offline).</span>`;
  if (!inf.text) return html`<span class="muted">Informace nenalezeny.</span>`;
  const t = inf.text.length > 650 ? inf.text.slice(0, 650).replace(/\s+\S*$/, '') + '…' : inf.text;
  return html`<p>${t}</p>${inf.url ? html`<a href=${inf.url} target="_blank" rel="noopener">Více na Wikipedii ›</a>` : null}`;
}

function CountryPanel() {
  const S = HOA.S;
  const tag = HOA.UI.countryTag;
  const c = S.countries[tag];
  if (!c) return null;
  const name = c.leader;
  const real = name && name !== '—' && !/předsednictvo/i.test(name);
  const info = real ? HOA._leaderData[name] : null;
  if (real && !info) HOA.leaderInfo(name);
  const sup = HOA.partySupport(c);
  let acc = 0;
  const grad = sup.map(([id, v]) => { const a = acc; acc += v; return `${HOA.IDEOLOGIES[id].color} ${a}% ${acc}%`; }).join(',');
  const fac = c.faction && S.factions[c.faction];
  const spirits = [];
  for (const t of (c.tmods || []).filter((t) => t.until > S.t)) spirits.push([t.att > 0 || t.def > 0 ? '⬆' : '⬇', t.name, (t.desc || '') + ` (do ${HOA.fmtDate(t.until)})`]);
  spirits.push(['🏭', HOA.lawOpt('economy', c.laws.economy).name, HOA.lawOpt('economy', c.laws.economy).desc]);
  spirits.push(['🎖', HOA.lawOpt('conscription', c.laws.conscription).name, HOA.lawOpt('conscription', c.laws.conscription).desc]);
  if (c.sanctions.length) spirits.push(['⛔', 'Mezinárodní sankce', `${c.sanctions.length} států, HDP −${Math.round(Math.min(0.4, c.sanctions.length * 0.03) * 100)} %`]);
  if (c.nukes) spirits.push(['☢', 'Jaderná mocnost', `${c.nukes} hlavic`]);
  if (c.atWar) spirits.push(['⚔', 'Ve válce', HOA.enemiesOf(S, tag).map((t) => S.countries[t].name).join(', ')]);
  if (c.focus.cur) { const f = HOA.focusTreeFor(tag).find((x) => x.id === c.focus.cur); if (f) spirits.push(['★', 'Národní cíl: ' + f.name, f.desc]); }
  const prov = S.owner.reduce((n, o) => n + (o === tag ? 1 : 0), 0);
  return html`<div class="cv-top">
      <div class="portrait"><img src=${info && info.img ? info.img : HOA.SILHOUETTE} alt="" /><div class="pname">${name || '—'}</div></div>
      <div class="cv-info">
        <div class="cv-country"><${Flag} tag=${tag} w=${48} h=${32} /><b>${c.name}</b></div>
        <div class="cv-row"><span>Vláda</span><b>${c.gov}</b></div>
        <div class="cv-row"><span>Ideologie</span><b style=${{ color: HOA.IDEOLOGIES[c.ideo].color }}>${HOA.IDEOLOGIES[c.ideo].name}</b></div>
        <div class="cv-row"><span>Aliance</span><b>${fac ? fac.name : '—'}</b></div>
        <div class="cv-pie"><div class="pie" style=${{ background: `conic-gradient(${grad})` }}></div><div class="legend">${sup.map(([id, v]) => html`<div key=${id}><i style=${{ background: HOA.IDEOLOGIES[id].color }}></i>${HOA.IDEOLOGIES[id].name} <b>${v} %</b></div>`)}</div></div>
      </div></div>
    <h3>Národní duch</h3><div class="spirits">${spirits.map(([i, n, d], k) => html`<div key=${k} class="spirit" title=${d}><span>${i}</span>${n}</div>`)}</div>
    <h3>O vůdci</h3><div class="bio">${real ? (info ? html`<${Bio} inf=${info} />` : html`<span class="muted">Načítám z Wikipedie…</span>`) : html`<span class="muted">Bez podrobností.</span>`}</div>
    <h3>Stát</h3><div class="kv"><span>Provincie</span><b>${prov}</b></div><div class="kv"><span>Ztráty ve válkách</span><b>${fmtN(c.casualties)}</b></div>
    <${CountryInfo} tag=${tag} noHeader=${true} />`;
}

const PANEL_BODY = { politics: PoliticsPanel, research: ResearchPanel, production: ProductionPanel, army: ArmyPanel, diplomacy: DiplomacyPanel, market: MarketPanel, wars: WarsPanel, news: NewsPanel, country: CountryPanel };

HOA.provName = function (p) {
  const pr = HOA.W.provinces[p];
  return pr.name && pr.name !== pr.region ? `${pr.name} (${pr.region})` : pr.region;
};

// ---------- side panel ----------
HOA.showSide = function (side) {
  HOA.UI.side = side;
  HOA.uiRefresh();
};

function Side() {
  const S = HOA.S, sd = HOA.UI.side;
  if (HOA.R.selected.size) {
    const units = S.units.filter((u) => HOA.R.selected.has(u.id));
    if (units.length) return html`<div id="side"><${SideUnits} units=${units} /></div>`;
    HOA.R.selected.clear();
  }
  if (!sd) return html`<div id="side" class="hidden"></div>`;
  return html`<div id="side"><button class="x close" onClick=${on('closeSide')}>✕</button>
    ${sd.p != null && sd.p >= 0 ? html`<${SideProvince} p=${sd.p} />` : null}
    ${sd.tag && S.countries[sd.tag] ? html`<${CountryInfo} tag=${sd.tag} />` : null}</div>`;
}

function SideUnits({ units }) {
  const S = HOA.S;
  return html`<button class="x close" onClick=${on('deselect')}>✕</button><h2>Vybrané jednotky (${units.length})</h2>
    <div class="row"><button class="btn sm" onClick=${on('stopUnits')}>Zastavit</button><button class="btn sm danger" onClick=${on('disband')}>Rozpustit</button></div>
    <div class="ulist">${units.slice(0, 60).map((u) => {
      const st = u.tr ? 'přesun' : u.inBattle ? 'v boji' : u.path.length ? 'na pochodu' : 'v pohotovosti';
      return html`<div key=${u.id} class="unit"><img class="usym" src=${HOA.symURL(u.type, S.countries[u.tag].color)} /><div class="un"><b>${u.name}</b><small>${HOA.provName(u.p)} • ${st}</small>
        <div class="ub"><span>Org</span><${Bar} v=${u.org / HOA.maxOrg(S, u)} cls="green" /></div><div class="ub"><span>Síla</span><${Bar} v=${u.str} cls="gold" /></div></div></div>`;
    })}</div>
    ${units.length > 60 ? html`<div class="muted">… a dalších ${units.length - 60}</div>` : null}
    <div class="muted small">Pravé tlačítko na mapě = přesun / útok.</div>`;
}

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

function SideProvince({ p }) {
  const S = HOA.S, W = HOA.W;
  const pr = W.provinces[p];
  const o = S.owner[p], ct = S.ctrl[p];
  const here = S.units.filter((u) => u.p === p && !u.tr);
  const pl = S.player;
  const row = [];
  if (pl && ct === pl) row.push(html`<button key="fort" class="btn sm" onClick=${on('build', 'fort')}>Opevnit</button>`);
  if (pl && ct && HOA.atWar(S, pl, ct) && S.countries[pl].nukes > 0) {
    const why = HOA.canNuke(S, pl, p);
    row.push(html`<button key="nuke" class="btn sm danger" disabled=${!!why} title=${why || ''} onClick=${on('nuke', p)}>☢ Jaderný úder</button>`);
  }
  return html`<h2>${HOA.provName(p)}</h2><div class="kv"><span>Vlastník</span><b>${o ? S.countries[o].name : '—'}</b></div>
    ${ct !== o ? html`<div class="kv warn"><span>Okupant</span><b>${S.countries[ct].name}</b></div>` : null}
    <div class="kv"><span>Body vítězství</span><b>${pr.vp}</b></div><div class="kv"><span>Opevnění</span><b>${'■'.repeat(S.fort[p])}${'□'.repeat(5 - S.fort[p])}</b></div>
    ${S.rad[p] > 0 ? html`<div class="kv warn"><span>Radiace</span><b>${S.rad[p]} dní</b></div>` : null}
    ${here.length ? html`<div class="muted small">Jednotky: ${[...new Set(here.map((u) => u.tag))].map((t) => `${here.filter((u) => u.tag === t).length}× ${S.countries[t].name}`).join(', ')}</div>` : null}
    ${row.length ? html`<div class="row">${row}</div>` : null}<hr />`;
}

function CountryInfo({ tag, noHeader }) {
  const S = HOA.S, pl = S.player;
  const c = S.countries[tag];
  const P = S.countries[pl];
  const units = S.units.filter((u) => u.tag === tag).length;
  const head = noHeader ? null : html`<div class="leader"><${Flag} tag=${tag} w=${72} h=${48} cls="big" /><div><h2>${c.name}</h2><b>${c.leader}</b><div class="muted">${c.gov}</div><div class="muted">${HOA.IDEOLOGIES[c.ideo].name}${c.faction && S.factions[c.faction] ? ' • ' + S.factions[c.faction].name : ''}</div><button class="linkbtn" onClick=${on('countryView', tag)}>Detail státu a vůdce ›</button></div></div>`;
  const grid = html`<div class="grid2"><div>HDP<b>${money(c.gdp)}</b></div><div>Populace<b>${c.pop} mil.</b></div><div>Divize<b>${units}</b></div><div>Továrny<b>${c.civ}/${c.mil}</b></div><div>Stabilita<b>${pct(c.stab)}</b></div><div>Vál. podpora<b>${pct(c.ws)}</b></div></div>
    ${c.nukes ? html`<div class="kv"><span>Jaderné hlavice</span><b>☢ ${c.nukes}</b></div>` : null}`;
  if (!pl) return html`${head}${grid}${c.alive ? html`<button class="btn gold wide" onClick=${on('choose', tag)}>Hrát za stát ${c.name}</button>` : null}`;
  if (tag === pl) return html`${head}${grid}`;
  const rel = HOA.getRel(S, pl, tag);
  const war = HOA.atWar(S, pl, tag);
  const flags = [];
  if (war) flags.push(html`<em class="war">VE VÁLCE</em>`);
  if (HOA.allies(S, pl, tag) && !war) flags.push(html`<em class="pos">spojenec</em>`);
  if (c.access.includes(pl)) flags.push(html`<em>vojenský přístup</em>`);
  if (P.guarantees.includes(tag)) flags.push(html`<em>garantováno</em>`);
  if (c.sanctions.includes(pl)) flags.push(html`<em class="neg">sankce</em>`);
  if (P.wargoals.includes(tag)) flags.push(html`<em class="neg">válečný cíl</em>`);
  if (P.justifying && P.justifying.target === tag) flags.push(html`<em>ospravedlňování ${P.justifying.days} d</em>`);
  const B = (act, label, cost, dis, cls) => html`<button key=${act} class="btn sm ${cls || ''}" disabled=${!!dis} title=${dis || ''} onClick=${on('dip', act + '|' + tag)}>${label}${cost ? html` <small>${cost}</small>` : null}</button>`;
  const pp = (n) => (P.pp < n ? 'Nedostatek politické moci' : null);
  const btns = [];
  if (!war) {
    btns.push(B('improve', 'Zlepšit vztahy', '25 PM', pp(25) || HOA.cooldown(P, tag, 'improve')));
    btns.push(B('access', 'Požádat o vojenský přístup', '25 PM', pp(25) || (c.access.includes(pl) ? 'Již máte přístup' : null)));
    if (P.faction && c.faction !== P.faction) btns.push(B('invite', 'Pozvat do aliance', '50 PM', pp(50) || (c.atWar && !HOA.allies(S, pl, tag) ? 'Stát je ve válce' : null)));
    if (c.faction && c.faction !== P.faction) btns.push(B('request', `Požádat o vstup do ${S.factions[c.faction].name}`, '50 PM', pp(50)));
    btns.push(B('guarantee', P.guarantees.includes(tag) ? 'Zrušit garanci' : 'Garantovat nezávislost', '25 PM', pp(25)));
    btns.push(B('aidMoney', 'Finanční pomoc', '$1 mld', P.money < 1 ? 'Nedostatek peněz' : null));
    btns.push(B('aidEq', 'Poslat vybavení (10 %)', '', null));
    if (!c.sanctions.includes(pl)) btns.push(B('sanction', 'Uvalit sankce', '10 PM', pp(10)));
    if (c.atWar && HOA.allies(S, pl, tag)) btns.push(B('callwar', 'Vstoupit do jejich války', '', null));
    if (!P.wargoals.includes(tag) && !(P.justifying && P.justifying.target === tag)) btns.push(B('justify', 'Ospravedlnit válečný cíl', '50 PM', pp(50) || (HOA.allies(S, pl, tag) ? 'Nelze proti spojenci' : null)));
    btns.push(B('war', 'Vyhlásit válku', P.wargoals.includes(tag) ? '' : 'bez důvodu!', HOA.allies(S, pl, tag) && c.faction === P.faction ? 'Nejdřív opusťte společnou alianci' : null, 'danger'));
  } else {
    btns.push(B('peaceWhite', 'Navrhnout bílý mír', '', null));
    btns.push(B('peaceFreeze', 'Navrhnout příměří na linii fronty', '', null));
    btns.push(B('peaceCede', 'Požadovat postoupení okupovaných území', '', null));
    btns.push(B('surrender', 'Kapitulovat', '', null, 'danger'));
  }
  return html`${head}${grid}
    <div class="kv"><span>Vztahy s vámi</span><b class=${rel >= 0 ? 'pos' : 'neg'}>${rel > 0 ? '+' : ''}${Math.round(rel)}</b></div>
    ${flags.length ? html`<div class="chips">${flags.map((f, i) => html`${i ? ' ' : ''}${f}`)}</div>` : null}
    ${c.alive ? html`<h3>Diplomacie</h3><div class="dipbtns">${btns}</div>` : null}`;
}
HOA.cooldown = function (P, tag, kind) {
  const left = (P.lastDiplo[tag + ':' + kind] || 0) - HOA.S.day;
  return left > 0 ? `Znovu za ${left} dní` : null;
};

// ---------- actions ----------
HOA.act = function (name, arg, el) {
  const S = HOA.S, W = HOA.W, UI = HOA.UI;
  const P = S.player && S.countries[S.player];
  switch (name) {
    case 'panel': HOA.openPanel(arg); return;
    case 'closePanel': UI.panel = null; return;
    case 'closeSide': UI.side = null; HOA.R.selProv = -1; return;
    case 'deselect': HOA.R.selected.clear(); return;
    case 'speed': S.speed = +arg; S.paused = false; return;
    case 'pause': S.paused = !S.paused; return;
    case 'mode': HOA.R.mode = arg; HOA.markMapDirty(); HOA.R.lastData = 0; return;
    case 'focusTree': UI.focusOpen = true; return;
    case 'closeFocus': UI.focusOpen = false; return;
    case 'pickFocus': {
      const f = HOA.focusTreeFor(P.tag).find((x) => x.id === arg);
      if (!f || !HOA.focusAvailable(S, P, f)) return;
      if (P.focus.cur && P.focus.prog > 0 && !confirm('Změnit národní cíl? Dosavadní postup bude ztracen.')) return;
      P.focus.cur = f.id; P.focus.prog = 0;
      return;
    }
    case 'setLaw': {
      const [cat, id] = arg.split(':');
      const o = HOA.lawOpt(cat, id);
      if (P.pp < o.pp) return HOA.toast('Nedostatek politické moci.', 'warn');
      P.pp -= o.pp; P.laws[cat] = id; HOA.updateManpower(P, false);
      return;
    }
    case 'research':
      if (!HOA.startResearch(P, arg)) HOA.toast('Všechny výzkumné sloty jsou obsazené.', 'warn');
      return;
    case 'cancelResearch': P.research = P.research.filter((r) => r.id !== arg); return;
    case 'build': {
      if (arg === 'fort') {
        const p = HOA.R.selProv;
        if (p < 0 || S.ctrl[p] !== P.tag) return HOA.toast('Vyberte vlastní provincii.', 'warn');
        if (S.fort[p] >= 5) return HOA.toast('Opevnění je na maximu.', 'warn');
        P.build.push({ type: 'fort', p, prog: 0 });
      } else P.build.push({ type: arg, prog: 0 });
      HOA.toast(`Stavba zařazena: ${HOA.BUILD[arg].name}`, 'own');
      return;
    }
    case 'cancelBuild': P.build.splice(+arg, 1); return;
    case 'recruit': {
      const sp = HOA.R.selProv;
      const rally = sp >= 0 && HOA.canEnter(S, P.tag, sp) ? sp : null;
      if (!HOA.recruit(S, P, arg, rally)) HOA.toast(HOA.canRecruit(P, arg) || 'Nelze odvést.', 'warn');
      return;
    }
    case 'toggleAI': P.aiArmy = el.checked; HOA.toast(P.aiArmy ? 'AI převzala velení fronty.' : 'Velení je ve vašich rukou.', 'own'); return;
    case 'selectAll': HOA.R.selected = new Set(S.units.filter((u) => u.tag === P.tag).map((u) => u.id)); return;
    case 'stopUnits': for (const u of S.units) if (HOA.R.selected.has(u.id) && !u.tr) { u.path = []; u.prog = 0; u.manual = S.day + 7; } return;
    case 'disband':
      if (!confirm('Opravdu rozpustit vybrané jednotky?')) return;
      S.units = S.units.filter((u) => !HOA.R.selected.has(u.id));
      HOA.R.selected.clear(); return;
    case 'showCountry': UI.side = { tag: arg, p: -1 }; return;
    case 'dip': { const [k, t] = arg.split('|'); HOA.diplo(k, t || (UI.side && UI.side.tag)); return; }
    case 'countryView': HOA.openCountryView(arg); return;
    case 'buy': { const err = HOA.buyItem(S, P.tag, arg); if (err) HOA.toast(err, 'warn'); return; }
    case 'nuke': {
      const p = +arg;
      if (!confirm(`Opravdu použít jadernou zbraň proti ${HOA.provName(p)}? Svět vám to neodpustí.`)) return;
      HOA.nuke(S, W, P.tag, p); return;
    }
    case 'createFaction': {
      if (P.pp < 100) return HOA.toast('Nedostatek politické moci.', 'warn');
      const nm = prompt('Název nové aliance:', `Aliance ${P.name}`);
      if (!nm) return;
      P.pp -= 100;
      HOA.createFaction(S, P.tag, nm.slice(0, 40));
      return;
    }
    case 'leaveFaction': if (confirm('Opustit alianci?')) HOA.leaveFaction(S, P.tag); return;
    case 'acceptInvite': HOA.joinFaction(S, S.player, arg); HOA.closeModal(); return;
    case 'eventOpt': {
      const [id, i] = arg.split(':');
      const ev = HOA.EVENTS.find((e) => e.id === id) || HOA._dynEvents[id];
      HOA.closeModal();
      if (ev && ev.opts) HOA.resolveEvent(S, W, ev, +i);
      return;
    }
    case 'confirmWar': if (HOA._confirmWar) { HOA._confirmWar(); HOA._confirmWar = null; } HOA.closeModal(); return;
    case 'acceptPeace': HOA.makePeace(S, S.player, arg, 'cede'); HOA.closeModal(); return;
    case 'closeModal': HOA.closeModal(); return;
    case 'save': HOA.saveGame(); return;
    case 'load': HOA.loadGame(); return;
    case 'newGame': location.reload(); return;
    case 'choose': HOA.startAs(arg); return;
    case 'menu': UI.menuOpen = !UI.menuOpen; return;
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
      const fac = T.faction && S.factions[T.faction];
      HOA.modal(html`<h2>Vyhlásit válku státu ${T.name}?</h2>
        ${justified ? null : html`<p class="neg">Nemáte válečný cíl: stabilita −20 %, vztahy se světem −30, světové napětí +20.</p>`}
        ${fac ? html`<p>Na obranu se připojí celá aliance <b>${fac.name}</b> (${fac.members.length} států)!</p>` : null}`, [
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
  HOA.markMapDirty();
};

// ---------- modal & events ----------
HOA._dynEvents = {};
HOA.modal = function (content, buttons) {
  HOA.UI.modal = { content, buttons };
  HOA.S.modalPause = true;
  HOA.uiRefresh();
};
function Modal({ m }) {
  return html`<div id="modal"><div class="mbox">${m.content}<div class="mbtns">${m.buttons.map((b, i) => html`<button key=${i} class="btn ${b.cls || ''}" onClick=${on(b.act, b.arg || '')}>${b.t}</button>`)}</div></div></div>`;
}
HOA.closeModal = function () {
  HOA.UI.modal = null;
  HOA.S.modalPause = false;
  if (HOA._eventQueue && HOA._eventQueue.length) HOA.showEvent(HOA._eventQueue.shift());
  HOA.uiRefresh();
};
HOA.showEvent = function (ev) {
  const S = HOA.S;
  if (HOA.UI.modal) { (HOA._eventQueue = HOA._eventQueue || []).push(ev); return; }
  const decides = ev.tag === S.player && ev.opts && ev.opts.length && S.pendingEvents.includes(ev.id);
  const who = ev.tag && S.countries[ev.tag] ? html`<${Flag} tag=${ev.tag} w=${30} h=${20} /> ${S.countries[ev.tag].name}` : '🌍 Svět';
  const content = html`<div class="event"><div class="evhead"><div class="evimg">${ev.news ? '📰' : '⚑'}</div><div><small>${HOA.fmtDate(S.t)} • ${who}</small><h2>${ev.title}</h2></div></div><p>${ev.desc}</p>
    ${ev.leader ? html`<p class="muted">Nový vůdce: <b>${ev.leader[0]}</b> (${ev.leader[1]})</p>` : null}</div>`;
  const btns = [];
  if (decides) ev.opts.forEach((o, i) => {
    const d = HOA.describeEff(S, o.eff);
    btns.push({ t: o.t + (d.length ? '  —  ' + d.join(', ') : ''), act: 'eventOpt', arg: ev.id + ':' + i });
  });
  else btns.push({ t: 'Rozumím', act: 'closeModal' });
  HOA.modal(content, btns);
};
HOA.peaceOfferModal = function (tag) {
  if (HOA.UI.modal) return;
  HOA.modal(html`<h2>Mírová nabídka</h2><p><b>${HOA.S.countries[tag].name}</b> nabízí mír a postoupení všech území, která okupujete.</p>`, [{ t: 'Přijmout mír', act: 'acceptPeace', arg: tag }, { t: 'Pokračovat ve válce', act: 'closeModal' }]);
};

// ---------- focus tree ----------
HOA.showFocusTree = function () { HOA.UI.focusOpen = true; HOA.uiRefresh(); };

function FocusTree() {
  const S = HOA.S, c = S.countries[S.player];
  const tree = HOA.focusTreeFor(c.tag);
  const NW = 168, NH = 74, GX = 186, GY = 112, PAD = 30;
  const maxX = Math.max(...tree.map((f) => f.x)), maxY = Math.max(...tree.map((f) => f.y));
  const w = (maxX + 1) * GX + PAD * 2, h = (maxY + 1) * GY + PAD * 2;
  const pos = (f) => [PAD + f.x * GX, PAD + f.y * GY];
  const lines = [];
  for (const f of tree) {
    const [x, y] = pos(f);
    for (const r of (f.req || []).concat(f.reqAny || [])) {
      const g = tree.find((z) => z.id === r);
      if (!g) continue;
      const [gx, gy] = pos(g);
      const dashed = (f.reqAny || []).includes(r);
      lines.push(html`<path key=${f.id + '<' + r} d=${`M${gx + NW / 2},${gy + NH} C${gx + NW / 2},${gy + NH + 25} ${x + NW / 2},${y - 25} ${x + NW / 2},${y}`} class=${`${dashed ? 'dash' : ''} ${c.focus.done.includes(r) ? 'lit' : ''}`} />`);
    }
    for (const r of f.excl || []) {
      const g = tree.find((z) => z.id === r);
      if (!g || g.y !== f.y || g.x < f.x) continue;
      const [gx] = pos(g);
      lines.push(html`<line key=${f.id + 'x' + r} x1=${x + NW} y1=${y + NH / 2} x2=${gx} y2=${y + NH / 2} class="excl" /><text key=${f.id + 't' + r} x=${(x + NW + gx) / 2} y=${y + NH / 2 + 5} class="exclx">✕</text>`);
    }
  }
  const cur = c.focus.cur && tree.find((f) => f.id === c.focus.cur);
  return html`<div id="focus">
    <div class="fhead"><${Flag} tag=${c.tag} w=${36} h=${24} /> Národní cíle – ${c.name} ${cur ? html`<span class="muted">• probíhá: ${cur.name}</span>` : null}<button class="x" onClick=${on('closeFocus')}>✕</button></div>
    <div class="fscroll"><div class="fcanvas" style=${{ width: w + 'px', height: h + 'px' }}>
      <svg width=${w} height=${h} class="flines">${lines}</svg>
      ${tree.map((f) => {
        const [x, y] = pos(f);
        const done = c.focus.done.includes(f.id), isCur = c.focus.cur === f.id, av = HOA.focusAvailable(S, c, f);
        const blocked = f.excl && f.excl.some((r) => c.focus.done.includes(r));
        const cls = done ? 'done' : isCur ? 'cur' : av ? 'avail' : blocked ? 'blocked' : 'locked';
        const tip = `${f.name}\n${f.desc}\n\n${HOA.describeEff(S, f.eff).join('\n')}\n\nDoba: ${f.days} dní`;
        return html`<div key=${f.id} class="fnode ${cls}" style=${{ left: x + 'px', top: y + 'px', width: NW + 'px', height: NH + 'px' }} onClick=${av ? on('pickFocus', f.id) : null} title=${tip}>
          <div class="ficon">${done ? '✔' : isCur ? '⏳' : '★'}</div><b>${f.name}</b><small>${f.days} dní</small>${isCur ? html`<${Bar} v=${c.focus.prog / f.days} cls="gold" />` : null}</div>`;
      })}
    </div></div>
    <div class="fhint">Najeďte na cíl pro zobrazení efektů. Kliknutím na dostupný cíl jej zahájíte.</div>
  </div>`;
}

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
function Start() {
  const S = HOA.S;
  return html`<div id="start"><div class="sbox"><div class="logo">HEARTS OF <span>ATOM</span></div><div class="sub">Velká strategie současnosti • Start: 24. února 2022, 04:00</div>
    <div class="choices">${HOA.START_CHOICES.map(([t, d, diff]) => html`<div key=${t} class="choice" onClick=${on('choose', t)}><${Flag} tag=${t} w=${60} h=${40} /><div><b>${S.countries[t].name}</b><small>${S.countries[t].leader}</small><p>${d}</p><em>${diff}</em></div></div>`)}</div>
    <div class="shint">…nebo klikněte na <b>libovolnou zemi na glóbu</b> a zvolte ji v pravém panelu.</div>
    <div class="row center">${HOA.UI.hasSave ? html`<button class="btn gold" onClick=${on('load')}>Načíst uloženou hru</button>` : null}<button class="btn" onClick=${on('help')}>Jak hrát</button></div></div></div>`;
}

HOA.showHelp = function () {
  HOA.modal(html`<h2>Jak hrát</h2><div class="help">
  <p><b>Čas:</b> mezerník = pauza, klávesy 1–5 = rychlost. Hra se pozastaví při událostech.</p>
  <p><b>Mapa:</b> táhnutím otáčíte glóbem, kolečkem přibližujete. Klik na provincii zobrazí stát a diplomacii.</p>
  <p><b>Jednotky:</b> klik na žeton = výběr (Shift přidá), Shift + tažení = výběr oblastí, pravé tlačítko = přesun nebo útok. Zelený pruh = organizace, žlutý = síla. Červená linie je fronta.</p>
  <p><b>Boj:</b> útočte s přesilou alespoň 2:1, obránce má výhodu opevnění a zákopů. Prázdné nepřátelské provincie obsadíte pochodem, města kladou odpor.</p>
  <p><b>Ekonomika:</b> vojenské továrny vyrábějí výbavu, bez výbavy nelze doplňovat ani odvádět divize. Zbraně lze také koupit od spojenců na trhu.</p>
  <p><b>Politika:</b> národní cíle, zákony (válečná ekonomika, mobilizace), aliance. Válka bez válečného cíle stojí stabilitu.</p>
  <p><b>Vítězství:</b> stát kapituluje, když ztratí většinu bodů vítězství (hlavně města).</p>
  <p><b>Automatické velení</b> (panel Armáda) nechá AI řídit vaši frontu.</p></div>`, [{ t: 'Rozumím', act: 'closeModal' }]);
};

// ---------- save / load (IndexedDB) ----------
// Old versions kept saves and leader bios in localStorage (5 MB cap); move them over once.
HOA.migrateStorage = async function () {
  let keys = [];
  try { keys = Object.keys(localStorage).filter((k) => k === 'hoa_save' || k.startsWith('hoa_leader:')); } catch (e) { return; }
  for (const k of keys) {
    try {
      const v = localStorage.getItem(k);
      if ((await IDB.get(k)) === undefined) await IDB.set(k, k === 'hoa_save' ? v : JSON.parse(v));
      localStorage.removeItem(k);
    } catch (e) { /* keep the old copy if anything fails */ }
  }
};
HOA.saveGame = async function () {
  const S = HOA.S;
  HOA.UI.menuOpen = false;
  const data = JSON.stringify(S, (k, v) => (k.startsWith('_') || k === 'modalPause' ? undefined : v));
  try {
    await IDB.set('hoa_save', data);
    HOA.UI.hasSave = true;
    HOA.toast('Hra uložena.', 'own');
  } catch (e) { HOA.toast('Uložení selhalo: ' + e.message, 'warn'); }
};
HOA.loadGame = async function () {
  HOA.UI.menuOpen = false;
  let data;
  try { data = await IDB.get('hoa_save'); } catch (e) { data = null; }
  if (!data) return HOA.toast('Žádná uložená hra.', 'warn');
  const S = JSON.parse(data);
  S.paused = true;
  S.nukeFx = [];
  HOA.S = S;
  HOA.recomputeAll(S);
  S._unitsByTag = {};
  for (const u of S.units) (S._unitsByTag[u.tag] = S._unitsByTag[u.tag] || []).push(u);
  HOA.R.selected.clear();
  HOA.R.colorOf.fill(null);
  HOA.R.occKey = HOA.R.radKey = null;
  HOA.UI.modal = null;
  HOA.startAs(S.player, true);
  HOA.toast('Hra načtena.', 'own');
};
