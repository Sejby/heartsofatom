# Hearts of Atom

Velká strategie v reálném čase ve stylu grand strategy her, zasazená do současnosti. Začíná 24. února 2022 ve 4:00, kdy Rusko zahájilo invazi na Ukrajinu.

## Spuštění

Otevřete `index.html` v prohlížeči (Chrome, Edge, Firefox nebo Safari). Hra nepotřebuje server, sestavení ani internet. Všechny knihovny (d3, topojson) i mapová data jsou ve složkách `vendor/` a `data/`.

Přes Bun: `bun run dev` a pak otevřete http://localhost:3000 (jiný port: `PORT=8080 bun run dev`).

Rychlý start pro vývoj: `index.html#play=CZE&days=30` spustí hru za Česko a přeskočí 30 dní.

## Co hra obsahuje

- **3D glóbus**, který jde otáčet a přibližovat. Pevnina vrhá stín, takže působí vystouple (2.5D). Mapa používá skutečné administrativní regiony (Natural Earth admin-1): ukrajinské oblasti, české kraje, německé spolkové země, polská vojvodství, ruské subjekty, státy USA a další. Celkem 3 294 regionů ve 195 státech. Velké regiony (Sibiř, Kanada…) a oblasti ve válečné zóně jsou rozdělené na menší části, takže provincií je celkem ~3 750.
- **Mapové režimy:** politický, aliance, ideologie, vztahy a válka. Okupovaná území jsou šrafovaná barvou vlastníka a fronta je vyznačená červenou linií.
- **Jednotky** se na mapě zobrazují jako žetony s armádními symboly (pěchota, mechanizovaná, tanková, dělostřelecká, výsadková, PVO a drony). Pod žetonem je ukazatel organizace a síly. Vidíte šipky pohybu, ikony bitev, zákopy a opevnění.
- **Boj:** rozhoduje útok proti obraně, organizace, síla, šířka fronty, opevnění, zákopy, letecká převaha a obrana proti dronům. Jednotky ustupují, mohou být obklíčeny a města kladou odpor.
- **Vlády k 24. 2. 2022:** každý stát má vůdce, vládní stranu, ideologii a alianci (NATO, ODKB).
- **Historické události 2022–2025:** SWIFT, Zeitenwende, mobilizace, anexe, Wagnerova vzpoura, vstup Finska a Švédska do NATO, volby a změny vlád (Meloniová, Sunak, Starmer, Tusk, Fico, Trump, Merz, Babiš…). Pokud se událost týká státu, za který hrajete, vybíráte z možností.
- **Stromy národních cílů:** Ukrajina, Rusko, USA, Česko, Polsko, Německo, Bělorusko a Čína mají vlastní strom. Ostatní státy používají obecný strom se západní, východní nebo neutrální orientací.
- **Výzkum** v devíti oborech: pěchota, obrněnci, dělostřelectvo, PVO, drony, elektronický boj, průmysl, logistika a jaderný program.
- **Trh zbraní:** můžete koupit HIMARS, Leopard, Patriot, Bayraktar, munici z české muniční iniciativy, K2, Šáhedy a další. Prodávající musí mít s vámi dobré vztahy.
- **Ekonomika:** civilní a vojenské továrny, rozdělení výroby, výstavba, opevnění, zákony (válečná ekonomika, mobilizace) a lidské zdroje.
- **Diplomacie:** zlepšování vztahů, vojenský přístup, pozvání do aliance, žádost o vstup, založení vlastní aliance, garance, finanční a vojenská pomoc, sankce, válečné cíle, vyhlášení války, mírová jednání (bílý mír, příměří na linii fronty, postoupení území) a kapitulace.
- **Jaderné zbraně:** úder na provincii, protiraketový štít, odveta AI, radiace a dopady na diplomacii.
- **AI** řídí ekonomiku, výzkum, národní cíle, pomoc spojencům, sankce, mír a frontu. Frontu může AI řídit i za vás, přepínač je v panelu Armáda.
- **Ukládání hry** do prohlížeče (localStorage).

## Ovládání

| Akce | Ovládání |
|---|---|
| Otočit glóbus | táhnout levým tlačítkem |
| Přiblížit | kolečko myši |
| Vybrat jednotky | klik na žeton (Shift přidá další), Shift + tažení vybere oblast |
| Přesun nebo útok | pravé tlačítko na cílovou provincii |
| Pauza / rychlost | mezerník / klávesy 1–5 |
| Národní cíle | klávesa F |
| Zavřít okno | Esc |

## Struktura

```
index.html          vstupní stránka
css/style.css       vzhled UI
data/regions.js     skutečné regiony (Natural Earth 1:10m admin-1, zjednodušeno)
tools/              build-regions.js – generátor data/regions.js
server.ts           vývojový server pro Bun (bun run dev)
vendor/             d3 7.9, topojson-client 3.1
js/countries.js     státy, vlády, armády, města
js/rules.js         jednotky, výbava, technologie, trh zbraní, zákony
js/focus.js         stromy národních cílů
js/events.js        historické události
js/world.js         regiony → provincie, sousedství, úrovně detailu hranic
js/state.js         herní stav, vztahy, války, aliance
js/sim.js           simulace: pohyb, boj, ekonomika, výzkum, události, kapitulace, jaderné zbraně
js/ai.js            umělá inteligence
js/render.js        vykreslování glóbu a jednotek (Canvas 2D)
js/flags.js         zjednodušené vlajky
js/ui.js, main.js   rozhraní, ovládání a hlavní smyčka
```

## Poznámky

Hra je fikce a zjednodušení. Velikosti armád, ekonomická čísla i data událostí jsou přibližná. Jedna divize odpovídá zhruba 10 000 vojákům. Krym je v mapových datech zakreslený pod Ruskem. Hra ho vede jako ukrajinské území okupované Ruskem, stejně jako část Donbasu na začátku hry.
