// Core rules: unit templates, equipment, technologies, weapons market, laws.
window.HOA = window.HOA || {};

HOA.EQUIP = {
  inf: { name: 'Pěchotní výzbroj', short: 'Výzbroj', cost: 0.5, icon: '🔫' },
  arm: { name: 'Obrněná technika', short: 'Obrněnci', cost: 6, icon: '🛡' },
  art: { name: 'Dělostřelectvo a munice', short: 'Dělostřelectvo', cost: 3, icon: '💥' },
  aa: { name: 'Protivzdušná obrana', short: 'PVO', cost: 5, icon: '📡' },
  drn: { name: 'Drony', short: 'Drony', cost: 0.4, icon: '🛩' },
  air: { name: 'Letectvo', short: 'Letadla', cost: 30, icon: '✈' },
};

// att = útok, def = obrana, org = organizace, spd = km/h, mp = tis. mužů, eq = požadovaná výbava
HOA.UNITS = {
  INF: { name: 'Pěší divize', sym: 'inf', att: 12, def: 28, org: 50, spd: 4, mp: 10, eq: { inf: 100, art: 6 }, days: 45 },
  MOT: { name: 'Motorizovaná divize', sym: 'mot', att: 15, def: 22, org: 45, spd: 9, mp: 9, eq: { inf: 90, arm: 4 }, days: 50 },
  MECH: { name: 'Mechanizovaná divize', sym: 'mech', att: 24, def: 28, org: 50, spd: 8, mp: 9, eq: { inf: 70, arm: 30 }, days: 60 },
  ARM: { name: 'Tanková divize', sym: 'arm', att: 38, def: 20, org: 40, spd: 8, mp: 7, eq: { inf: 30, arm: 70 }, days: 75 },
  ART: { name: 'Dělostřelecká brigáda', sym: 'art', att: 30, def: 9, org: 30, spd: 4, mp: 5, eq: { inf: 20, art: 45 }, days: 50 },
  AIRB: { name: 'Výsadková divize', sym: 'airb', att: 18, def: 16, org: 60, spd: 6, mp: 7, eq: { inf: 80, air: 1 }, days: 70 },
  AA: { name: 'Brigáda PVO', sym: 'aa', att: 4, def: 14, org: 30, spd: 6, mp: 4, eq: { inf: 10, aa: 30 }, days: 45 },
  DRN: { name: 'Dronový prapor', sym: 'drn', att: 22, def: 8, org: 30, spd: 6, mp: 3, eq: { inf: 10, drn: 250 }, days: 30 },
};

// Technology tree. cat: category; year: historical availability; cost: base research days
// eff keys: att/def/org/spd {unitType|all: pct}, prod {eqType|all: pct}, civ (construction pct), mp (pct), slot, rel, nukeDoc
HOA.TECH_CATS = {
  inf: 'Pěchota', arm: 'Obrněná technika', art: 'Dělostřelectvo', aa: 'Protivzdušná obrana', drn: 'Drony',
  ew: 'Elektronický boj', ind: 'Průmysl', log: 'Logistika', nuc: 'Jaderný program',
};
// prettier-ignore
HOA.TECHS = [
  { id: 'inf1', cat: 'inf', name: 'Moderní útočné pušky', year: 2012, cost: 90, eff: { att: { INF: 0.1, MOT: 0.1, AIRB: 0.1 } } },
  { id: 'inf2', cat: 'inf', name: 'Protitankové střely 3. generace', year: 2016, cost: 110, req: ['inf1'], eff: { def: { INF: 0.15, MOT: 0.1, MECH: 0.05 } } },
  { id: 'inf3', cat: 'inf', name: 'Noční vidění pro všechny', year: 2019, cost: 120, req: ['inf2'], eff: { att: { INF: 0.1, AIRB: 0.1 }, def: { INF: 0.05 } } },
  { id: 'inf4', cat: 'inf', name: 'Digitalizovaný voják', year: 2024, cost: 140, req: ['inf3'], eff: { att: { all: 0.05 }, org: { INF: 0.1 } } },
  { id: 'inf5', cat: 'inf', name: 'Bojové exoskelety', year: 2028, cost: 180, req: ['inf4'], eff: { att: { INF: 0.15 }, spd: { INF: 0.1 } } },
  { id: 'arm1', cat: 'arm', name: 'Modernizace hlavních tanků', year: 2012, cost: 100, eff: { att: { ARM: 0.1, MECH: 0.05 } } },
  { id: 'arm2', cat: 'arm', name: 'Aktivní ochrana (APS)', year: 2017, cost: 120, req: ['arm1'], eff: { def: { ARM: 0.15, MECH: 0.1 } } },
  { id: 'arm3', cat: 'arm', name: 'Nová generace BVP', year: 2020, cost: 130, req: ['arm2'], eff: { att: { MECH: 0.12 }, def: { MECH: 0.1 } } },
  { id: 'arm4', cat: 'arm', name: 'Bezosádkové věže', year: 2025, cost: 160, req: ['arm3'], eff: { att: { ARM: 0.15 }, org: { ARM: 0.1 } } },
  { id: 'arm5', cat: 'arm', name: 'Robotická bojová vozidla', year: 2028, cost: 190, req: ['arm4'], eff: { att: { ARM: 0.1, MECH: 0.1 }, def: { ARM: 0.1 } } },
  { id: 'art1', cat: 'art', name: 'Přesně naváděná munice (GPS)', year: 2012, cost: 90, eff: { att: { ART: 0.15 } } },
  { id: 'art2', cat: 'art', name: 'Raketomety dlouhého dosahu', year: 2017, cost: 120, req: ['art1'], eff: { att: { ART: 0.15 } } },
  { id: 'art3', cat: 'art', name: 'Kontrabaterijní radary', year: 2021, cost: 120, req: ['art2'], eff: { def: { all: 0.05 }, att: { ART: 0.05 } } },
  { id: 'art4', cat: 'art', name: 'Kluzáky a klouzavé pumy', year: 2023, cost: 140, req: ['art3'], eff: { att: { ART: 0.15, all: 0.03 } } },
  { id: 'art5', cat: 'art', name: 'Hypersonické taktické střely', year: 2027, cost: 180, req: ['art4'], eff: { att: { ART: 0.2 } } },
  { id: 'aa1', cat: 'aa', name: 'Vrstvená PVO', year: 2014, cost: 100, eff: { def: { AA: 0.2 }, airDef: 0.1 } },
  { id: 'aa2', cat: 'aa', name: 'Mobilní systémy krátkého dosahu', year: 2019, cost: 110, req: ['aa1'], eff: { airDef: 0.15 } },
  { id: 'aa3', cat: 'aa', name: 'Antidronové rušičky', year: 2023, cost: 120, req: ['aa2'], eff: { airDef: 0.2, droneDef: 0.25 } },
  { id: 'aa4', cat: 'aa', name: 'Laserová PVO', year: 2027, cost: 170, req: ['aa3'], eff: { airDef: 0.2, droneDef: 0.35 } },
  { id: 'drn1', cat: 'drn', name: 'Taktické průzkumné drony', year: 2014, cost: 80, eff: { att: { all: 0.03 } } },
  { id: 'drn2', cat: 'drn', name: 'FPV drony', year: 2022, cost: 90, req: ['drn1'], eff: { att: { DRN: 0.25 }, prod: { drn: 0.2 } } },
  { id: 'drn3', cat: 'drn', name: 'Optické drony na kabelu', year: 2024, cost: 110, req: ['drn2'], eff: { att: { DRN: 0.2 }, ignoreEW: 0.5 } },
  { id: 'drn4', cat: 'drn', name: 'Drony s AI navigací', year: 2025, cost: 140, req: ['drn3'], eff: { att: { DRN: 0.25, all: 0.03 } } },
  { id: 'drn5', cat: 'drn', name: 'Autonomní roje dronů', year: 2028, cost: 190, req: ['drn4'], eff: { att: { DRN: 0.35 } } },
  { id: 'ew1', cat: 'ew', name: 'Rušení GPS', year: 2015, cost: 90, eff: { droneDef: 0.15 } },
  { id: 'ew2', cat: 'ew', name: 'Satelitní komunikace', year: 2021, cost: 110, req: ['ew1'], eff: { org: { all: 0.08 } } },
  { id: 'ew3', cat: 'ew', name: 'AI zaměřování', year: 2025, cost: 150, req: ['ew2'], eff: { att: { all: 0.06 } } },
  { id: 'ind1', cat: 'ind', name: 'Automatizace výroby', year: 2013, cost: 120, eff: { prod: { all: 0.1 } } },
  { id: 'ind2', cat: 'ind', name: 'Rozšířené muniční linky', year: 2022, cost: 120, req: ['ind1'], eff: { prod: { art: 0.25 } } },
  { id: 'ind3', cat: 'ind', name: '3D tisk součástek', year: 2023, cost: 140, req: ['ind1'], eff: { prod: { all: 0.1 }, civ: 0.1 } },
  { id: 'ind4', cat: 'ind', name: 'Průmysl 5.0', year: 2027, cost: 180, req: ['ind3'], eff: { prod: { all: 0.15 }, civ: 0.15 } },
  { id: 'ind5', cat: 'ind', name: 'Výzkumné superpočítače', year: 2020, cost: 160, req: ['ind1'], eff: { slot: 1 } },
  { id: 'log1', cat: 'log', name: 'Rychlá mobilizace', year: 2010, cost: 80, eff: { mp: 0.15 } },
  { id: 'log2', cat: 'log', name: 'Moderní logistika', year: 2016, cost: 110, req: ['log1'], eff: { spd: { all: 0.1 } } },
  { id: 'log3', cat: 'log', name: 'Polní medicína', year: 2019, cost: 110, req: ['log2'], eff: { reinforce: 0.3 } },
  { id: 'log4', cat: 'log', name: 'Autonomní zásobování', year: 2026, cost: 160, req: ['log3'], eff: { spd: { all: 0.1 }, org: { all: 0.05 } } },
  { id: 'nuc1', cat: 'nuc', name: 'Jaderná doktrína', year: 1990, cost: 200, eff: { nukeDoc: 1 } },
  { id: 'nuc2', cat: 'nuc', name: 'Taktické jaderné zbraně', year: 2000, cost: 200, req: ['nuc1'], eff: { nukeYield: 0.3 } },
  { id: 'nuc3', cat: 'nuc', name: 'Hypersonické nosiče', year: 2019, cost: 220, req: ['nuc2'], eff: { nukeYield: 0.3 } },
  { id: 'nuc4', cat: 'nuc', name: 'Protiraketový štít', year: 2025, cost: 240, req: ['aa2'], eff: { nukeShield: 0.35 } },
];

// Weapons market — buy from sellers.  eq: equipment delivered; bonus: permanent att/def pct to unit types
// prettier-ignore
HOA.MARKET = [
  { id: 'himars', name: 'HIMARS', seller: 'USA', price: 2.0, days: 45, eq: { art: 60 }, bonus: { att: { ART: 0.06 } }, desc: 'Raketomety s dosahem 80 km.' },
  { id: 'abrams', name: 'M1 Abrams', seller: 'USA', price: 3.0, days: 90, eq: { arm: 90 }, bonus: { att: { ARM: 0.04 } }, desc: '31 hlavních bojových tanků.' },
  { id: 'bradley', name: 'M2 Bradley', seller: 'USA', price: 1.6, days: 45, eq: { arm: 70 }, bonus: { def: { MECH: 0.05 } }, desc: 'Bojová vozidla pěchoty.' },
  { id: 'patriot', name: 'Patriot', seller: 'USA', price: 4.0, days: 90, eq: { aa: 60 }, bonus: { airDef: 0.1 }, desc: 'Baterie PVO dlouhého dosahu.' },
  { id: 'f16', name: 'F-16 Fighting Falcon', seller: 'USA', price: 6.0, days: 180, eq: { air: 12 }, bonus: { air: 0.1 }, desc: 'Letka stíhaček.' },
  { id: 'javelin', name: 'Javelin', seller: 'USA', price: 0.6, days: 20, eq: { inf: 300 }, bonus: { def: { INF: 0.04 } }, desc: 'Protitankové řízené střely.' },
  { id: 'leopard', name: 'Leopard 2A6', seller: 'DEU', price: 2.5, days: 75, eq: { arm: 80 }, bonus: { att: { ARM: 0.05 } }, desc: 'Moderní hlavní bojový tank.' },
  { id: 'irist', name: 'IRIS-T SLM', seller: 'DEU', price: 2.2, days: 90, eq: { aa: 45 }, bonus: { airDef: 0.08 }, desc: 'PVO středního dosahu.' },
  { id: 'gepard', name: 'Gepard', seller: 'DEU', price: 0.5, days: 30, eq: { aa: 20 }, bonus: { droneDef: 0.05 }, desc: 'Protiletadlové kanóny proti dronům.' },
  { id: 'pzh', name: 'PzH 2000', seller: 'DEU', price: 1.2, days: 60, eq: { art: 40 }, bonus: { att: { ART: 0.04 } }, desc: 'Samohybné houfnice.' },
  { id: 'storm', name: 'Storm Shadow', seller: 'GBR', price: 1.5, days: 30, eq: { art: 30 }, bonus: { att: { all: 0.02 } }, desc: 'Řízené střely s plochou dráhou letu.' },
  { id: 'nlaw', name: 'NLAW', seller: 'GBR', price: 0.4, days: 15, eq: { inf: 250 }, bonus: { def: { INF: 0.03 } }, desc: 'Lehké protitankové zbraně.' },
  { id: 'chally', name: 'Challenger 2', seller: 'GBR', price: 1.2, days: 60, eq: { arm: 40 }, bonus: { def: { ARM: 0.03 } }, desc: 'Těžké tanky.' },
  { id: 'caesar', name: 'CAESAR', seller: 'FRA', price: 1.0, days: 60, eq: { art: 40 }, bonus: { att: { ART: 0.04 } }, desc: 'Kolové samohybné houfnice.' },
  { id: 'mirage', name: 'Mirage 2000', seller: 'FRA', price: 4.0, days: 150, eq: { air: 8 }, bonus: { air: 0.06 }, desc: 'Víceúčelové stíhačky.' },
  { id: 'tb2', name: 'Bayraktar TB2', seller: 'TUR', price: 0.8, days: 30, eq: { drn: 400 }, bonus: { att: { DRN: 0.08 } }, desc: 'Útočné drony středního doletu.' },
  { id: 'krab', name: 'AHS Krab', seller: 'POL', price: 1.0, days: 60, eq: { art: 35 }, bonus: { att: { ART: 0.03 } }, desc: 'Samohybné houfnice.' },
  { id: 'piorun', name: 'Piorun', seller: 'POL', price: 0.3, days: 20, eq: { aa: 15 }, bonus: { droneDef: 0.04 }, desc: 'Přenosné protiletadlové komplety.' },
  { id: 'czammo', name: 'Muniční iniciativa', seller: 'CZE', price: 1.5, days: 30, eq: { art: 90 }, bonus: {}, desc: 'Statisíce granátů ráže 155 mm z celého světa.' },
  { id: 'dana', name: 'DANA M2 + RM-70', seller: 'CZE', price: 0.6, days: 40, eq: { art: 35 }, bonus: { att: { ART: 0.02 } }, desc: 'Kolové houfnice a raketomety.' },
  { id: 't72cz', name: 'Modernizované T-72', seller: 'CZE', price: 0.7, days: 60, eq: { arm: 45 }, bonus: {}, desc: 'Repasované tanky z českých dílen.' },
  { id: 'k2', name: 'K2 Black Panther', seller: 'KOR', price: 2.6, days: 120, eq: { arm: 85 }, bonus: { att: { ARM: 0.04 } }, desc: 'Korejský tank nové generace.' },
  { id: 'k9', name: 'K9 Thunder', seller: 'KOR', price: 1.4, days: 90, eq: { art: 50 }, bonus: { att: { ART: 0.04 } }, desc: 'Samohybné houfnice.' },
  { id: 'cv90', name: 'CV90', seller: 'SWE', price: 1.8, days: 120, eq: { arm: 60 }, bonus: { def: { MECH: 0.05 } }, desc: 'Švédská bojová vozidla pěchoty.' },
  { id: 'gripen', name: 'JAS 39 Gripen', seller: 'SWE', price: 4.5, days: 180, eq: { air: 10 }, bonus: { air: 0.08 }, desc: 'Lehké víceúčelové stíhačky.' },
  { id: 'irondome', name: 'Iron Dome', seller: 'ISR', price: 2.0, days: 120, eq: { aa: 40 }, bonus: { airDef: 0.1 }, desc: 'Obrana proti raketám a dronům.' },
  { id: 'su35', name: 'Su-35', seller: 'RUS', price: 4.0, days: 150, eq: { air: 12 }, bonus: { air: 0.08 }, desc: 'Ruské stíhačky 4++. generace.' },
  { id: 's400', name: 'S-400', seller: 'RUS', price: 3.5, days: 120, eq: { aa: 55 }, bonus: { airDef: 0.1 }, desc: 'PVO dlouhého dosahu.' },
  { id: 't90', name: 'T-90M', seller: 'RUS', price: 2.0, days: 90, eq: { arm: 75 }, bonus: { att: { ARM: 0.03 } }, desc: 'Ruský hlavní bojový tank.' },
  { id: 'shahed', name: 'Šáhed-136', seller: 'IRN', price: 0.5, days: 30, eq: { drn: 500 }, bonus: { att: { DRN: 0.05 } }, desc: 'Sebevražedné drony dlouhého doletu.' },
  { id: 'prkshell', name: 'Dělostřelecká munice', seller: 'PRK', price: 0.7, days: 40, eq: { art: 100 }, bonus: {}, desc: 'Miliony granátů ze skladů KLDR.' },
  { id: 'wingloong', name: 'Wing Loong II', seller: 'CHN', price: 0.9, days: 45, eq: { drn: 300 }, bonus: { att: { DRN: 0.05 } }, desc: 'Čínské bojové drony.' },
  { id: 'chcomp', name: 'Elektronické komponenty', seller: 'CHN', price: 1.0, days: 30, eq: { drn: 600, inf: 100 }, bonus: {}, desc: 'Součástky pro drony a munici.' },
];

HOA.LAWS = {
  economy: {
    name: 'Ekonomika',
    opts: [
      { id: 'civil', name: 'Civilní ekonomika', desc: 'Nízké výdaje na obranu.', mil: -0.15, def: 0.6, stab: 0.05, pp: 50 },
      { id: 'partial', name: 'Částečná mobilizace', desc: 'Vyvážená ekonomika.', mil: 0, def: 1, stab: 0, pp: 50 },
      { id: 'war', name: 'Válečná ekonomika', desc: 'Průmysl slouží frontě.', mil: 0.3, def: 1.8, stab: -0.08, pp: 100, req: 'war' },
      { id: 'total', name: 'Totální válka', desc: 'Všechno pro vítězství.', mil: 0.5, def: 2.5, stab: -0.15, pp: 150, req: 'war' },
    ],
  },
  conscription: {
    name: 'Branná povinnost',
    opts: [
      { id: 'vol', name: 'Profesionální armáda', desc: '1 % populace.', mp: 0.01, stab: 0.03, pp: 50 },
      { id: 'limited', name: 'Omezená branná povinnost', desc: '2,5 % populace.', mp: 0.025, stab: 0, pp: 50 },
      { id: 'mob', name: 'Všeobecná mobilizace', desc: '5 % populace.', mp: 0.05, stab: -0.08, pp: 100, req: 'war' },
      { id: 'total', name: 'Totální mobilizace', desc: '10 % populace.', mp: 0.1, stab: -0.18, pp: 150, req: 'war' },
    ],
  },
};

HOA.BUILD = {
  civ: { name: 'Civilní továrna', cost: 3600 },
  mil: { name: 'Vojenská továrna', cost: 2400 },
  fort: { name: 'Opevnění', cost: 500 },
};
