// National focus trees. Positions in grid units (x, y). days = completion time.
// eff: pp, stab, ws, mp, civ, mil, money, eq{}, units[{t,n}], rel{TAG|FACTION:v}, joinFaction, leaveFaction,
//      slot, research{cat:days}, bonus{att{},def{},org{},airDef,droneDef}, fort{border,lvl}, wargoal, nukes,
//      giveEq{to,eq}, money2{to,amt}, access, tech, law
// cond: { war, peace, atWarWith, inFaction, notInFaction }
window.HOA = window.HOA || {};

HOA.FOCUS = {};

HOA.FOCUS.GENERIC = [
  { id: 'g_ind', x: 1, y: 0, days: 70, name: 'Průmyslová expanze', desc: 'Investice do civilní výroby.', eff: { civ: 2 } },
  { id: 'g_infra', x: 0, y: 1, days: 70, req: ['g_ind'], name: 'Infrastruktura', desc: 'Silnice, železnice a sítě.', eff: { civ: 1, stab: 0.03 } },
  { id: 'g_arms', x: 2, y: 1, days: 70, req: ['g_ind'], name: 'Zbrojní průmysl', desc: 'Nové linky pro armádu.', eff: { mil: 2 } },
  { id: 'g_res', x: 1, y: 2, days: 70, reqAny: ['g_infra', 'g_arms'], name: 'Výzkumné centrum', desc: 'Nový výzkumný slot.', eff: { slot: 1 } },
  { id: 'g_arms2', x: 2, y: 3, days: 70, req: ['g_arms', 'g_res'], name: 'Exportní zbrojovky', desc: 'Velkosériová výroba.', eff: { mil: 2, money: 1 } },

  { id: 'g_army', x: 4, y: 0, days: 70, name: 'Reforma armády', desc: 'Nové divize a výcvik.', eff: { units: [{ t: 'INF', n: 2 }], ws: 0.03 } },
  { id: 'g_prof', x: 4, y: 1, days: 70, req: ['g_army'], name: 'Profesionalizace', desc: 'Vyšší organizace jednotek.', eff: { bonus: { org: { all: 0.1 } } } },
  { id: 'g_mob', x: 5, y: 1, days: 70, req: ['g_army'], name: 'Mobilizační plány', desc: 'Více rezervistů.', eff: { mp: 50, ws: 0.05 } },
  { id: 'g_armor', x: 4, y: 2, days: 70, req: ['g_prof'], name: 'Mechanizace', desc: 'Obrněné jednotky.', eff: { eq: { arm: 80 }, units: [{ t: 'MECH', n: 1 }] } },
  { id: 'g_drones', x: 5, y: 2, days: 70, req: ['g_mob'], name: 'Dronová revoluce', desc: 'Inspirace z Ukrajiny.', eff: { research: { drn: 60 }, eq: { drn: 400 } } },
  { id: 'g_forts', x: 5, y: 3, days: 70, req: ['g_drones'], name: 'Pohraniční opevnění', desc: 'Opevnění hranic.', eff: { fort: { lvl: 2 } } },

  { id: 'g_west', x: 7, y: 0, days: 70, excl: ['g_east', 'g_neutral'], name: 'Západní orientace', desc: 'Blíže k NATO a EU.', eff: { rel: { NATO: 20, RUS: -15 } } },
  { id: 'g_nato', x: 7, y: 1, days: 70, req: ['g_west'], cond: { notInFaction: 'NATO', peace: true }, name: 'Žádost o vstup do NATO', desc: 'Kolektivní obrana podle článku 5.', eff: { joinFaction: 'NATO', stab: 0.03 } },
  { id: 'g_east', x: 8, y: 0, days: 70, excl: ['g_west', 'g_neutral'], name: 'Východní orientace', desc: 'Partnerství s Moskvou a Pekingem.', eff: { rel: { RUS: 25, CHN: 25, NATO: -15 } } },
  { id: 'g_csto', x: 8, y: 1, days: 70, req: ['g_east'], cond: { notInFaction: 'CSTO' }, name: 'Vstup do ODKB', desc: 'Organizace Smlouvy o kolektivní bezpečnosti.', eff: { joinFaction: 'CSTO' } },
  { id: 'g_neutral', x: 9, y: 0, days: 70, excl: ['g_west', 'g_east'], name: 'Neutralita', desc: 'Nevměšovat se do sporů velmocí.', eff: { stab: 0.1, pp: 50 } },
  { id: 'g_trade', x: 9, y: 1, days: 70, req: ['g_neutral'], name: 'Obchod se všemi', desc: 'Peníze nesmrdí.', eff: { money: 3, civ: 1 } },
  { id: 'g_diplo', x: 8, y: 2, days: 70, reqAny: ['g_nato', 'g_csto', 'g_trade'], name: 'Aktivní diplomacie', desc: 'Síť partnerství.', eff: { pp: 100, stab: 0.05 } },
];

HOA.FOCUS.UKR = [
  { id: 'u_stay', x: 1, y: 0, days: 14, name: '„Potřebuji munici, ne odvoz“', desc: 'Prezident zůstává v Kyjevě.', eff: { ws: 0.2, stab: 0.1, rel: { NATO: 15 } } },
  { id: 'u_tdf', x: 0, y: 1, days: 21, req: ['u_stay'], name: 'Územní obrana', desc: 'Dobrovolníci do zbraně.', eff: { units: [{ t: 'INF', n: 6 }], mp: 100 } },
  { id: 'u_kyiv', x: 2, y: 1, days: 21, req: ['u_stay'], name: 'Pevnost Kyjev', desc: 'Opevnění hlavního města.', eff: { fort: { city: 'Kyjev', lvl: 4, radius: 2 } } },
  { id: 'u_aid', x: 1, y: 2, days: 35, reqAny: ['u_tdf', 'u_kyiv'], name: 'Žádost o západní pomoc', desc: 'Ramštejnský formát.', eff: { money: 5, eq: { inf: 1500, art: 80 }, rel: { NATO: 20 } } },
  { id: 'u_lendlease', x: 0, y: 3, days: 50, req: ['u_aid'], name: 'Lend-Lease', desc: 'Americký zákon o půjčce a pronájmu.', eff: { eq: { arm: 150, art: 150, aa: 40 }, money: 5 } },
  { id: 'u_drones', x: 2, y: 3, days: 50, req: ['u_aid'], name: 'Armáda dronů', desc: 'Milion FPV dronů ročně.', eff: { research: { drn: 120 }, eq: { drn: 3000 }, units: [{ t: 'DRN', n: 3 }] } },
  { id: 'u_west_tanks', x: 0, y: 4, days: 50, req: ['u_lendlease'], name: 'Tanková koalice', desc: 'Leopardy, Abramsy a Challengery.', eff: { eq: { arm: 250 }, units: [{ t: 'MECH', n: 2 }, { t: 'ARM', n: 1 }] } },
  { id: 'u_f16', x: 1, y: 4, days: 70, req: ['u_lendlease'], name: 'Stíhačková koalice', desc: 'F-16 pro ukrajinské letectvo.', eff: { eq: { air: 20 }, bonus: { air: 0.1 } } },
  { id: 'u_deep', x: 2, y: 4, days: 50, req: ['u_drones'], name: 'Údery do hloubky', desc: 'Drony na rafinerie a letiště.', eff: { bonus: { att: { all: 0.05 } }, rel: { RUS: -20 } } },
  { id: 'u_counter', x: 1, y: 5, days: 50, reqAny: ['u_west_tanks', 'u_f16'], name: 'Protiofenziva', desc: 'Osvobodit okupovaná území.', eff: { bonus: { att: { all: 0.1 } }, ws: 0.1 } },
  { id: 'u_crimea', x: 1, y: 6, days: 70, req: ['u_counter'], name: 'Krym je Ukrajina', desc: 'Útok na Krymský most a flotilu.', eff: { bonus: { att: { all: 0.05 } }, ws: 0.1 } },

  { id: 'u_eco', x: 5, y: 0, days: 35, name: 'Ekonomika v podmínkách války', desc: 'Udržet stát v chodu.', eff: { stab: 0.05, civ: 1 } },
  { id: 'u_ammo', x: 4, y: 1, days: 50, req: ['u_eco'], name: 'Vlastní výroba munice', desc: 'Podzemní továrny.', eff: { mil: 3 } },
  { id: 'u_bogdana', x: 4, y: 2, days: 50, req: ['u_ammo'], name: 'Bohdana a Neptun', desc: 'Domácí houfnice a střely.', eff: { eq: { art: 120 }, research: { art: 60 } } },
  { id: 'u_energy', x: 6, y: 1, days: 50, req: ['u_eco'], name: 'Energetická odolnost', desc: 'Ochrana elektráren.', eff: { bonus: { airDef: 0.1 }, stab: 0.05 } },
  { id: 'u_eu', x: 5, y: 2, days: 70, reqAny: ['u_ammo', 'u_energy'], name: 'Kandidát na členství v EU', desc: 'Evropská perspektiva.', eff: { stab: 0.1, money: 4, rel: { NATO: 15 } } },
  { id: 'u_brave1', x: 4, y: 3, days: 70, req: ['u_bogdana'], name: 'Brave1 – obranné inovace', desc: 'Tech cluster pro armádu.', eff: { slot: 1 } },
  { id: 'u_nato', x: 6, y: 3, days: 120, req: ['u_eu'], excl: ['u_neutral'], cond: { notInFaction: 'NATO' }, name: 'Cesta do NATO', desc: 'Pozvánka do Aliance.', eff: { joinFaction: 'NATO' } },
  { id: 'u_neutral', x: 7, y: 2, days: 70, req: ['u_eco'], excl: ['u_nato'], name: 'Bezpečnostní záruky', desc: 'Neutralita výměnou za garance.', eff: { stab: 0.15, rel: { RUS: 30, NATO: -10 } } },
];

HOA.FOCUS.RUS = [
  { id: 'r_svo', x: 1, y: 0, days: 14, name: 'Speciální vojenská operace', desc: 'Válka, která se nesmí nazývat válkou.', eff: { ws: 0.1, units: [{ t: 'MECH', n: 2 }] } },
  { id: 'r_mob', x: 0, y: 1, days: 50, req: ['r_svo'], name: 'Částečná mobilizace', desc: '300 000 záložníků.', eff: { mp: 300, units: [{ t: 'INF', n: 8 }], stab: -0.08 } },
  { id: 'r_wagner', x: 2, y: 1, days: 35, req: ['r_svo'], name: 'Skupina Wagner', desc: 'Žoldnéři a vězni na frontu.', eff: { units: [{ t: 'INF', n: 4 }], bonus: { att: { INF: 0.05 } } } },
  { id: 'r_surov', x: 0, y: 2, days: 50, req: ['r_mob'], name: 'Surovikinova linie', desc: 'Hluboká obranná pásma.', eff: { fort: { occupied: true, lvl: 3 } } },
  { id: 'r_glide', x: 1, y: 2, days: 50, reqAny: ['r_mob', 'r_wagner'], name: 'Klouzavé pumy FAB', desc: 'Levná a ničivá palebná síla.', eff: { bonus: { att: { all: 0.06 } }, research: { art: 60 } } },
  { id: 'r_annex', x: 1, y: 3, days: 35, req: ['r_glide'], name: 'Anexe okupovaných oblastí', desc: '„Referenda“ ve čtyřech oblastech.', eff: { annexOccupied: true, rel: { NATO: -20 }, ws: 0.05 } },
  { id: 'r_attrition', x: 0, y: 4, days: 70, req: ['r_annex'], name: 'Opotřebovací válka', desc: 'Masa nakonec vítězí.', eff: { mp: 200, units: [{ t: 'INF', n: 6 }] } },
  { id: 'r_nuke', x: 2, y: 4, days: 50, req: ['r_annex'], name: 'Jaderné vydírání', desc: 'Rozmístění taktických zbraní v Bělorusku.', eff: { ws: 0.1, rel: { NATO: -25, BLR: 10 }, tech: 'nuc2' } },

  { id: 'r_wareco', x: 5, y: 0, days: 35, name: 'Ekonomika ve válečném režimu', desc: 'Zbrojovky jedou na tři směny.', eff: { mil: 6, civ: -2 } },
  { id: 'r_sanct', x: 4, y: 1, days: 50, req: ['r_wareco'], name: 'Obcházení sankcí', desc: 'Stínová flotila a paralelní dovoz.', eff: { money: 15, civ: 2 } },
  { id: 'r_pivot', x: 6, y: 1, days: 50, req: ['r_wareco'], name: 'Obrat na východ', desc: 'Přátelství bez hranic.', eff: { rel: { CHN: 30, IRN: 30, PRK: 30, IND: 15 } } },
  { id: 'r_shahed', x: 5, y: 2, days: 50, req: ['r_pivot'], name: 'Íránské drony', desc: 'Šáhedy a jejich licenční výroba Geran.', eff: { eq: { drn: 3000 }, research: { drn: 60 } } },
  { id: 'r_prk', x: 6, y: 2, days: 50, req: ['r_pivot'], name: 'Spojenectví s KLDR', desc: 'Munice i vojáci z Pchjongjangu.', eff: { eq: { art: 400 }, units: [{ t: 'INF', n: 2 }], rel: { PRK: 40 } } },
  { id: 'r_tanks', x: 4, y: 2, days: 70, req: ['r_sanct'], name: 'Uralvagonzavod', desc: 'Renovace tanků ze skladů.', eff: { eq: { arm: 400 }, mil: 2 } },
  { id: 'r_union', x: 7, y: 2, days: 70, req: ['r_pivot'], name: 'Svazový stát', desc: 'Bělorusko jako vojenský prostor.', eff: { rel: { BLR: 40 }, access: 'BLR' } },
  { id: 'r_eurasia', x: 6, y: 3, days: 120, reqAny: ['r_shahed', 'r_prk', 'r_union'], name: 'Euroasijská aliance', desc: 'Pozvat Írán a KLDR do ODKB.', eff: { inviteFaction: ['IRN', 'PRK'] } },
  { id: 'r_peace', x: 4, y: 3, days: 70, req: ['r_tanks'], name: 'Mírová jednání „na našich podmínkách“', desc: 'Jednat z pozice síly.', eff: { stab: 0.1, pp: 100 } },
];

HOA.FOCUS.USA = [
  { id: 'us_arsenal', x: 1, y: 0, days: 35, name: 'Arzenál demokracie', desc: 'Obnova zbrojní výroby.', eff: { mil: 8 } },
  { id: 'us_lendlease', x: 0, y: 1, days: 50, req: ['us_arsenal'], name: 'Zákon o Lend-Lease pro Ukrajinu', desc: 'Pomoc bez byrokracie.', eff: { giveEq: { to: 'UKR', eq: { art: 250, arm: 150, aa: 30, inf: 2000 } }, rel: { UKR: 30 } } },
  { id: 'us_flank', x: 2, y: 1, days: 50, req: ['us_arsenal'], name: 'Posílení východního křídla', desc: 'Brigády v Polsku a Pobaltí.', eff: { deploy: { to: 'POL', units: [{ t: 'MECH', n: 2 }, { t: 'ARM', n: 1 }] }, rel: { POL: 20, LTU: 15, LVA: 15, EST: 15 } } },
  { id: 'us_sanctions', x: 1, y: 2, days: 35, reqAny: ['us_lendlease', 'us_flank'], name: 'Sankční balíčky', desc: 'Odstřihnout Rusko od financí.', eff: { sanction: 'RUS', rel: { RUS: -30 } } },
  { id: 'us_atacms', x: 0, y: 3, days: 50, req: ['us_sanctions'], name: 'ATACMS a HIMARS', desc: 'Dálkové údery pro Ukrajinu.', eff: { giveEq: { to: 'UKR', eq: { art: 200 } } } },
  { id: 'us_chips', x: 2, y: 3, days: 70, req: ['us_sanctions'], name: 'CHIPS Act', desc: 'Polovodiče doma.', eff: { slot: 1, civ: 4 } },
  { id: 'us_first', x: 4, y: 0, days: 70, excl: ['us_globo'], name: 'America First', desc: 'Ať se Evropa postará sama.', eff: { civ: 6, stab: 0.05, rel: { NATO: -10, RUS: 10 } } },
  { id: 'us_globo', x: 5, y: 0, days: 70, excl: ['us_first'], name: 'Vůdce svobodného světa', desc: 'Pevná transatlantická vazba.', eff: { rel: { NATO: 20 }, pp: 100 } },
  { id: 'us_golden', x: 4, y: 1, days: 120, req: ['us_first'], name: 'Golden Dome', desc: 'Protiraketový štít nad Amerikou.', eff: { tech: 'nuc4', bonus: { airDef: 0.15 } } },
  { id: 'us_pivot', x: 5, y: 1, days: 70, reqAny: ['us_globo', 'us_first'], name: 'Pivot do Asie', desc: 'Partnerství s Japonskem, Koreou, Tchaj-wanem.', eff: { rel: { JPN: 25, KOR: 25, TWN: 25, CHN: -20 } } },
  { id: 'us_aukus', x: 5, y: 2, days: 70, req: ['us_pivot'], name: 'AUKUS a Quad', desc: 'Nové bezpečnostní struktury.', eff: { rel: { AUS: 30, GBR: 15, IND: 15 }, inviteFaction: ['AUS', 'JPN'] } },
  { id: 'us_expand', x: 6, y: 1, days: 70, req: ['us_globo'], name: 'Rozšíření NATO', desc: 'Otevřené dveře pro Finsko a Švédsko.', eff: { inviteFaction: ['FIN', 'SWE'], rel: { RUS: -20 } } },
];

HOA.FOCUS.CZE = [
  { id: 'cz_help', x: 1, y: 0, days: 21, name: 'Pomoc Ukrajině', desc: 'První vlaky s tanky jedou na východ.', eff: { giveEq: { to: 'UKR', eq: { arm: 60, art: 30, inf: 300 } }, rel: { UKR: 30, RUS: -20 } } },
  { id: 'cz_ammo', x: 0, y: 1, days: 50, req: ['cz_help'], name: 'Muniční iniciativa', desc: 'Český nápad, který sehnal přes milion granátů.', eff: { giveEq: { to: 'UKR', eq: { art: 300 } }, rel: { UKR: 30, NATO: 15 }, pp: 75 } },
  { id: 'cz_csg', x: 2, y: 1, days: 50, req: ['cz_help'], name: 'Zbrojní průmysl CSG', desc: 'Expanze zbrojovek a muničních linek.', eff: { mil: 3, money: 1 } },
  { id: 'cz_t72', x: 2, y: 2, days: 50, req: ['cz_csg'], name: 'Opravny tanků v Šternberku', desc: 'Renovace techniky pro spojence.', eff: { eq: { arm: 80 }, mil: 1 } },
  { id: 'cz_cv90', x: 0, y: 2, days: 70, req: ['cz_ammo'], name: 'Modernizace – CV90', desc: 'Nová bojová vozidla pěchoty.', eff: { eq: { arm: 70 }, units: [{ t: 'MECH', n: 1 }], tech: 'arm3' } },
  { id: 'cz_f35', x: 1, y: 3, days: 120, reqAny: ['cz_cv90', 'cz_t72'], name: 'Nákup F-35', desc: '24 stíhaček páté generace.', eff: { eq: { air: 24 }, bonus: { air: 0.1 }, rel: { USA: 15 } } },
  { id: 'cz_leo', x: 0, y: 3, days: 70, req: ['cz_cv90'], name: 'Leopardy 2A8', desc: 'Nové tanky pro 7. mechanizovanou brigádu.', eff: { eq: { arm: 60 }, units: [{ t: 'ARM', n: 1 }] } },
  { id: 'cz_brigade', x: 1, y: 4, days: 70, reqAny: ['cz_f35', 'cz_leo'], name: 'Těžká brigáda', desc: 'Splnění závazku vůči NATO.', eff: { units: [{ t: 'MECH', n: 2 }], ws: 0.05 } },

  { id: 'cz_energy', x: 4, y: 0, days: 50, name: 'Energetická nezávislost', desc: 'Konec ruského plynu.', eff: { civ: 1, stab: 0.05, rel: { RUS: -10 } } },
  { id: 'cz_duko', x: 4, y: 1, days: 120, req: ['cz_energy'], name: 'Nové bloky Dukovan', desc: 'Jaderná energetika pro průmysl.', eff: { civ: 3 } },
  { id: 'cz_v4', x: 5, y: 1, days: 50, req: ['cz_energy'], excl: ['cz_sov'], name: 'Evropská integrace', desc: 'Pevně v EU a NATO.', eff: { rel: { NATO: 15, DEU: 15, POL: 15 }, stab: 0.05 } },
  { id: 'cz_sov', x: 6, y: 1, days: 50, req: ['cz_energy'], excl: ['cz_v4'], name: 'Suverenistická politika', desc: '„Česko na prvním místě.“', eff: { rel: { HUN: 20, SVK: 20, NATO: -10 }, pp: 100 } },
  { id: 'cz_cyber', x: 5, y: 2, days: 70, req: ['cz_v4'], name: 'Kybernetická obrana', desc: 'NÚKIB a odolnost státu.', eff: { slot: 1 } },
  { id: 'cz_semi', x: 4, y: 2, days: 70, req: ['cz_duko'], name: 'Polovodiče a high-tech', desc: 'Investice do čipů.', eff: { civ: 2, research: { ind: 60 } } },
  { id: 'cz_neutral', x: 6, y: 2, days: 70, req: ['cz_sov'], name: 'Obchod na východ', desc: 'Pragmatické vztahy se všemi.', eff: { money: 3, rel: { CHN: 20 } } },
  { id: 'cz_army2035', x: 5, y: 3, days: 120, reqAny: ['cz_cyber', 'cz_semi', 'cz_neutral'], name: 'Armáda 2035', desc: '2 % HDP na obranu a víc.', eff: { mil: 3, mp: 30, units: [{ t: 'INF', n: 2 }] } },
];

HOA.FOCUS.POL = [
  { id: 'pl_army', x: 1, y: 0, days: 35, name: 'Nejsilnější armáda Evropy', desc: 'Zákon o obraně vlasti.', eff: { units: [{ t: 'INF', n: 3 }, { t: 'MECH', n: 1 }], mp: 50 } },
  { id: 'pl_korea', x: 0, y: 1, days: 70, req: ['pl_army'], name: 'Korejský kontrakt', desc: 'K2 a K9 ve velkém.', eff: { eq: { arm: 200, art: 120 }, rel: { KOR: 25 } } },
  { id: 'pl_abrams', x: 2, y: 1, days: 70, req: ['pl_army'], name: 'Abramsy pro Polsko', desc: '366 amerických tanků.', eff: { eq: { arm: 180 }, units: [{ t: 'ARM', n: 1 }], rel: { USA: 20 } } },
  { id: 'pl_shield', x: 1, y: 2, days: 70, reqAny: ['pl_korea', 'pl_abrams'], name: 'Východní štít', desc: 'Opevnění hranice s Běloruskem a Ruskem.', eff: { fort: { border: ['BLR', 'RUS'], lvl: 3 } } },
  { id: 'pl_help', x: 3, y: 0, days: 21, name: 'Brána pro pomoc Ukrajině', desc: 'Řešov jako logistický uzel.', eff: { giveEq: { to: 'UKR', eq: { arm: 150, inf: 500 } }, rel: { UKR: 25 } } },
  { id: 'pl_3seas', x: 3, y: 1, days: 70, req: ['pl_help'], name: 'Iniciativa Trojmoří', desc: 'Regionální vůdcovství.', eff: { rel: { CZE: 15, SVK: 15, LTU: 15, ROU: 15 }, civ: 2 } },
  { id: 'pl_eco', x: 3, y: 2, days: 70, req: ['pl_3seas'], name: 'Zbrojní holding PGZ', desc: 'Domácí výroba.', eff: { mil: 4 } },
  { id: 'pl_tusk', x: 2, y: 3, days: 50, reqAny: ['pl_shield', 'pl_eco'], name: 'Evropské Polsko', desc: 'Silné postavení v EU.', eff: { stab: 0.08, money: 5 } },
];

HOA.FOCUS.DEU = [
  { id: 'de_zeit', x: 1, y: 0, days: 21, name: 'Zeitenwende', desc: 'Zvláštní fond 100 miliard eur.', eff: { money: 100, ws: 0.1 } },
  { id: 'de_energy', x: 0, y: 1, days: 50, req: ['de_zeit'], name: 'Konec ruského plynu', desc: 'LNG terminály za pár měsíců.', eff: { civ: -2, stab: 0.05, rel: { RUS: -20 } } },
  { id: 'de_rhein', x: 2, y: 1, days: 70, req: ['de_zeit'], name: 'Expanze Rheinmetallu', desc: 'Nové muniční továrny.', eff: { mil: 6 } },
  { id: 'de_leo', x: 1, y: 2, days: 50, reqAny: ['de_energy', 'de_rhein'], name: 'Leopardy pro Ukrajinu', desc: 'Konec váhání.', eff: { giveEq: { to: 'UKR', eq: { arm: 120, aa: 40 } }, rel: { UKR: 30 } } },
  { id: 'de_lit', x: 2, y: 3, days: 70, req: ['de_leo'], name: 'Brigáda v Litvě', desc: 'První stálá zahraniční brigáda.', eff: { deploy: { to: 'LTU', units: [{ t: 'MECH', n: 1 }, { t: 'ARM', n: 1 }] }, rel: { LTU: 30 } } },
  { id: 'de_skyshield', x: 0, y: 3, days: 70, req: ['de_leo'], name: 'European Sky Shield', desc: 'Společná evropská PVO.', eff: { bonus: { airDef: 0.15 }, rel: { NATO: 10 } } },
  { id: 'de_merz', x: 1, y: 4, days: 120, reqAny: ['de_lit', 'de_skyshield'], name: 'Dluhová brzda pro obranu', desc: 'Neomezené výdaje na obranu.', eff: { mil: 6, money: 50 } },
];

HOA.FOCUS.BLR = [
  { id: 'by_union', x: 1, y: 0, days: 35, excl: ['by_neutral'], name: 'Svazový stát', desc: 'Pevné spojenectví s Moskvou.', eff: { rel: { RUS: 25 }, units: [{ t: 'INF', n: 2 }] } },
  { id: 'by_nukes', x: 0, y: 1, days: 70, req: ['by_union'], name: 'Ruské jaderné zbraně', desc: 'Taktické hlavice na běloruské půdě.', eff: { nukes: 10, ws: 0.1, rel: { NATO: -20 } } },
  { id: 'by_war', x: 2, y: 1, days: 50, req: ['by_union'], aiAvoid: true, name: 'Vstoupit do války', desc: 'Otevřít severní frontu.', eff: { joinWar: 'RUS' } },
  { id: 'by_neutral', x: 4, y: 0, days: 50, excl: ['by_union'], name: 'Opatrná neutralita', desc: 'Nevstupovat do války.', eff: { stab: 0.1, rel: { NATO: 10, UKR: 10 } } },
  { id: 'by_china', x: 4, y: 1, days: 70, req: ['by_neutral'], name: 'Čínská průmyslová zóna', desc: 'Velký kámen.', eff: { civ: 3, rel: { CHN: 20 } } },
];

HOA.FOCUS.CHN = [
  { id: 'cn_friend', x: 1, y: 0, days: 35, name: 'Přátelství bez hranic', desc: 'Strategické partnerství s Ruskem.', eff: { rel: { RUS: 25 } } },
  { id: 'cn_mediator', x: 0, y: 1, days: 70, req: ['cn_friend'], name: 'Mírový plán', desc: 'Čína jako zprostředkovatel.', eff: { pp: 100, stab: 0.05, rel: { UKR: 10, NATO: 5 } } },
  { id: 'cn_supply', x: 2, y: 1, days: 70, req: ['cn_friend'], name: 'Dvojí užití', desc: 'Komponenty pro ruské zbrojovky.', eff: { giveEq: { to: 'RUS', eq: { drn: 2000, inf: 1000 } }, money: 20, rel: { NATO: -15 } } },
  { id: 'cn_pla', x: 4, y: 0, days: 70, name: 'Modernizace ČLOA', desc: 'Armáda světové třídy do roku 2027.', eff: { mil: 10, slot: 1 } },
  { id: 'cn_navy', x: 4, y: 1, days: 70, req: ['cn_pla'], name: 'Námořnictvo modré vody', desc: 'Největší flotila světa.', eff: { mil: 6, ws: 0.05 } },
  { id: 'cn_taiwan', x: 4, y: 2, days: 120, req: ['cn_navy'], aiAvoid: true, name: 'Znovusjednocení Tchaj-wanu', desc: 'Válečný cíl proti Tchaj-wanu.', eff: { wargoal: 'TWN', ws: 0.1 } },
  { id: 'cn_brics', x: 2, y: 2, days: 70, reqAny: ['cn_mediator', 'cn_supply'], name: 'Rozšíření BRICS', desc: 'Alternativa k západnímu řádu.', eff: { rel: { IND: 15, BRA: 20, ZAF: 20, IRN: 20, SAU: 15 }, money: 30 } },
];

HOA.focusTreeFor = function (tag) {
  return HOA.FOCUS[tag] || HOA.FOCUS.GENERIC;
};
