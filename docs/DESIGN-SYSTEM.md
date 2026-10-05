# Inside the Machine, Design-System-Referenz

Stand: **2026-07-26**, aus dem echten Code extrahiert (nicht aus dem Gedächtnis). Drei Teile:
**1) Token-Inventar (Ist-Zustand + Fundorte)** · **2) Design-Skala (umgesetzt / offen)** · **3) Komponenten-Map.**

> **Quellen der Wahrheit sind zwei, nicht vier:** `app/src/theme.js` (JS-Tokens) und `app/src/index.css` (CSS-Variablen plus Utility-Klassen). Die Werte müssen zueinander passen. Die in `daten/build_map.py` und `daten/build_familytree.py` eingebackenen Farben landen zwar weiter im JSON, werden von der App aber **nicht mehr gelesen**: `MapOfAI.jsx` färbt über `CAT`/`CAT_OTHER` aus `theme.js`, `FamilyTree.jsx` über `REL_COLOR` aus `theme.js`. Eine Farbänderung braucht also nur noch einen JS-Edit, kein `python daten/build_*.py`. Die Python-Konstanten sind Doku und müssen synchron gehalten werden, damit JSON und App nicht auseinanderlaufen.

---

## 1 · TOKEN-INVENTAR (Ist-Zustand)

### 1.1 Farben, Quelle der Wahrheit: `app/src/theme.js` (`PAL`, `CAT`, `SEQ`)
| Token | Hex / Wert | Bedeutung |
|---|---|---|
| `PAL.bg` (Alias `void`) | `#0b0a0c` | Hintergrund (warm fast-schwarz) |
| `PAL.panel` | `#15131a` | solides warmes Panel |
| `PAL.panel2` | `rgba(21,19,26,0.95)` | transluzentes warmes Panel (Tooltips, Karten, Profile) |
| `PAL.scrim` | `rgba(7,6,10,0.88)` | Vollbild-Backdrop (Explorer-Overlay) |
| `PAL.ink` / `PAL.text` | `#ece8e1` | Text (warm off-white) |
| `PAL.muted` | `#969089` | sekundärer Text |
| `PAL.grid` | `rgba(236,232,225,0.07)` | Gitterlinien |
| `PAL.axis` | `rgba(236,232,225,0.32)` | Achsen |
| `PAL.hairline` | `rgba(236,232,225,0.12)` | neutrale Ränder |
| `PAL.machine` (Alias `signal`) | `#d6409f` | **Maschine = Magenta** (reserviert: Akzent/Selektion, nie als Kategorie) |
| `PAL.machineSoft` (Alias `signalSoft`) | `rgba(214,64,159,0.15)` | Magenta-Fläche |
| `PAL.machineLine` | `rgba(214,64,159,0.5)` | Panel-Ränder in Akzentfarbe |
| `PAL.machineRule` | `rgba(214,64,159,0.26)` | Kicker-Hairline |
| `PAL.human` | `#45bcc0` | **Mensch = Teal** |
| `PAL.onAccent` | `#fff0f6` | Text auf Magenta |
| `PAL.star` | `#dfe8ff` | Galaxie-Sonnen (Akt 3) |
| `PAL.merge` | `#ffd700` | Supernova-Gold: Merge-Kanten und -Knoten (Akt 3) |
| `PAL.ok` / `PAL.no` | `#34d399` / `#fb7185` | Outcome richtig/falsch (Akt 5) |
| `CAT[8]` | `#4477aa #228833 #ccbb44 #aa3377 #ee99aa #999933 #66ccee #bbbbbb` | kategorial (Paul-Tol/Okabe-Ito, CVD-sicher) |
| `CAT_OTHER` / `CAT_MIXED` | `#5b5b6e` / `#9aa6c0` | Rest-Bucket bzw. „gemischt" |
| `CAT_COLOR` | 9 Themen + `gemischt`, jeweils auf `CAT`/`CAT_OTHER`/`CAT_MIXED` | Themen-Farben Akt 4 |
| `CAT_BUCKET[7]` | die 9 Themen auf 7 Stapelsegmente gebündelt, `Sonstiges` zusätzlich schraffiert | Spalte „Wofür" im Register |
| `REL_COLOR[4]` | `finetune #fff5e6 · adapter #00e5ff · quantized #d6409f · merge #ffd700` | Vermehrungsarten Akt 3 |
| `SEQ[7]` (viridis) | `rgb(72,33,115) 59,82,139 44,114,142 33,144,141 92,200,99 170,220,50 253,231,37` | sequenziell (Magnitude/Alter), via `heat(t)` |
| `SCENE_BG` | `'transparent'` | Akt-Hintergrund; alle Akte teilen `body` = `--bg` |

**`app/src/index.css` `:root`** spiegelt dieselben Werte als CSS-Variablen, mit kollabierten Aliasen: `--bg --panel --panel-2 --scrim --ink --muted --grid --axis --hairline --machine --machine-soft --machine-line --machine-rule --on-accent --human --star --merge --ok --no`. Zusätzlich in CSS, ohne Token:
- Vignette `rgba(0,0,0,0.32)` (`body::after`) · Korn `opacity:0.06` (`body::before`)
- Fokusring `2px solid var(--machine)`, Offset 3px (`:focus-visible`)

### 1.2 Farben EINGEBACKEN in Python → JSON (nur noch Doku, nicht mehr wirksam)
| Datei | Konstante | Wert | landet in | wird gelesen? |
|---|---|---|---|---|
| `daten/build_map.py:30` | `CAT_COLORS` | dieselben 8 wie `CAT` + `"andere"=#5b5b6e` | `map.json → cats[].color` | **nein**, `MapOfAI.jsx` nutzt `CAT`/`CAT_OTHER` aus `theme.js` |
| `daten/build_familytree.py:31` | `REL_COLOR` | `finetune #fff5e6 · adapter #00e5ff · quantized #d6409f · merge #ffd700` | `familytree.json → rels[].color` | **nein**, `FamilyTree.jsx` nutzt `REL_COLOR` aus `theme.js` |

Beide Skripte tragen den Hinweis im Kopfkommentar. Aus dem JSON kommen weiterhin die **Namen** (`cats[].cat`, `rels[].rel`) und die Anteile, nur nicht mehr die Hex-Werte.

### 1.3 Farben HARTCODIERT inline in Komponenten: **keine mehr**

Der frühere Wildwuchs ist aufgelöst. Eine Suche über `app/src/**` nach den einst inline stehenden Hex-Werten (`#34d399`, `#fb7185`, `#dfe8ff`, `#07060a`, `#d6409f`) findet sie nur noch in `theme.js` und `index.css`, plus eine reine Kommentar-Erwähnung in `FamilyTree.jsx`. Die Komponenten importieren stattdessen:

| Was früher inline stand | Heutiger Bezug |
|---|---|
| Outcome grün/rot in `SpotTheMachine.jsx` | `PAL.ok` / `PAL.no` bzw. `OUTCOME` aus `theme.js` |
| Sonnen-Weiß der Galaxie | `PAL.star` bzw. `STAR` |
| Explorer-Overlay-Hintergrund | `PAL.scrim` bzw. `SCRIM` |
| Merge-Gold der Brücken | `PAL.merge` bzw. `REL_COLOR.merge` |
| Scroll-Fortschrittsbalken in `Motion.jsx` | `PAL.machine` |
| Themen-Farben Akt 4 (früher inline im gelöschten `WildChatMap.jsx`) | `CAT_COLOR` in `theme.js:61`, dazu `CAT_BUCKET` für die sieben Stapelsegmente der Spalte „Wofür" |

**Verbleibende Inkonsistenz-Hotspots:**
- Die kalten Panel-Töne (`rgba(13,13,24,…)`, `rgba(10,10,18,0.94)`) sind ersetzt: `PAL.panel2` und `PAL.scrim` sind warme Tokens und werden benutzt.
- Ohne eigenes Token bleiben die Blatt-Alphas in `components/ledger/drawSheet.js` (`ZEBRA`, `HOVER_BAND`, `SEL_BAND`, `FOCUS_BAND`, `RASTER`, `BRUSH_BAND`). Sie sind alle Ableitungen aus `PAL.ink` bzw. `PAL.machine` mit sehr niedrigem Alpha (0,025 bis 0,10) und stehen bewusst lokal, weil sie nur für dieses eine Blatt gelten.
- `PAL.void`==`PAL.bg`, `PAL.signal`==`PAL.machine` und `PAL.signalSoft`==`PAL.machineSoft` sind weiterhin redundante **Aliase** (Altlast) in `theme.js`. In `index.css` sind sie bereits kollabiert, und eine Suche über `app/src` findet **keinen einzigen Zugriff** mehr auf `PAL.void` oder `PAL.signal`. Sie können ersatzlos entfallen.
- **Der „helle Slab" in Akt 4 ist nicht hell.** `SCENE_BG` ist `'transparent'`, alle fünf Akte stehen auf demselben Grund (`body` = `--bg` `#0b0a0c`). Das Blatt selbst liegt auf `.ledger-sheet { background: var(--panel) }` = `#15131a`, und der Canvas darüber startet mit `clearRect`, füllt also nichts. Nachgerechnet: Slab gegen Seite **1,07 : 1** Kontrast (relative Luminanz 0,0070 gegen 0,0032), Tinte `--ink` auf dem Slab 15,1 : 1, auf der Seite 16,2 : 1. Der Slab ist damit eine kaum wahrnehmbare Anhebung, keine Flächenumkehr, und die Tinte bleibt hell auf dunkel wie in den Akten 1 bis 3. Der Kommentar über `.ledger-sheet` in `index.css` („heller Slab auf fast-schwarzem Grund. Figur-Grund-Umkehr (Ware)") beschreibt eine Absicht, nicht den Wert. **Entweder** den Slab wirklich hell machen (dann brauchen alle Blatt-Alphas in `drawSheet.js` und die Marks invertierte Werte, das ist ein großer Eingriff), **oder** den Anspruch aus Kommentar, `PROJEKT.md` und Short Paper streichen und den Genrewechsel über Raster und Dichte begründen, was er tatsächlich leistet.

### 1.4 Schriften: `app/index.html` (Google Fonts) + `index.css`
| Rolle | Familie | Gewichte (geladen) | Wo |
|---|---|---|---|
| Display | **Bricolage Grotesque** | 600/700/800 (opsz 12..96) | `.t-display-xl/-l/-s`, legacy `.display`, `.kicker` |
| Body | **Hanken Grotesk** | 400/500/700 | `body`, `.t-lead`, `.t-body` |
| Data/Label | **IBM Plex Mono** | 400/500 | `.t-data`, `.t-label`, legacy `.mono` (tabular-nums) |

Achtung: `.t-label` fordert `font-weight: 700`, der Google-Fonts-Link lädt für IBM Plex Mono aber nur 400 und 500. Der Bold wird also vom Browser synthetisiert.

### 1.5 Spacing & Typo (Skala vorhanden und in Benutzung)
**Layout (`index.css`):** `.layout-container` `max-width: var(--container)` = 1320px, `padding-inline: clamp(var(--s-5), 4vw, var(--s-16))` · `.act` `padding-block: clamp(var(--s-10), 5vh, var(--s-16))`, `min-height:100vh` · `.editorial-grid` 12 Spalten, `gap: var(--s-6)` · `.text-column` Spalten 1-7, `max-width: var(--measure)` = 64ch · legacy `.prose` `max-width:56ch`.

**Adoption (gezählt über `app/src`, Stand 2026-07-26):** 180 Verwendungen von `var(--s-…)`, 97 Verwendungen der `.t-*`-Typo-Klassen, 103 Verwendungen der Legacy-Klassen (`.display`, `.mono`, `.kicker`, `.prose`), 4 verbliebene Inline-`clamp()` für Schrift-/Bildgrößen:

| verbliebenes `clamp(...)` | Datei | wofür |
|---|---|---|
| `clamp(16rem, 44vh, 30rem)` | `ActIntro.jsx:34` | riesige Akt-Ziffer der szenischen Herleitung |
| `clamp(2rem, 4vw, 3.4rem)` | `MapOfAI.jsx:336` | Jahreszahl des Scroll-Scrubs |
| `clamp(300px, 38vw, 420px)` | `SpotTheMachine.jsx:16` | Quiz-Bildbreite |
| `clamp(3.5rem, 8vw, 6rem)` | `SpotTheMachine.jsx:234` | Ergebnis-Score |

Diese vier sind Einzelfälle außerhalb der Rollen-Skala (eine Ziffer, eine Bildbreite, zwei Sonderformate) und bewusst nicht als Utility-Klasse angelegt. Restliche Abstände laufen über `var(--s-…)`; wo noch nackte Zahlen stehen, sind es Canvas-Innenmaße (siehe Teil 3), keine Layout-Abstände.

---

## 2 · DESIGN-SKALA (der frühere „Soll"-Vorschlag, jetzt umgesetzt)

Dieser Teil war ein Vorschlag. Er ist inzwischen in `app/src/index.css` gebaut. Was steht, steht als Ist; die drei offenen Punkte stehen am Ende.

### 2.1 Spacing, 4/8-Basis · **umgesetzt**
```
--s-0:0  --s-1:4px  --s-2:8px  --s-3:12px  --s-4:16px  --s-5:20px  --s-6:24px
--s-8:32px  --s-10:40px  --s-12:48px  --s-16:64px  --s-18:72px  --s-20:80px  --s-24:96px
```
Alle 14 Stufen liegen als CSS-Variablen in `:root`. `.act` nutzt `padding-block: clamp(var(--s-10), 5vh, var(--s-16))` (der Vorschlag nannte `--s-18` als Obergrenze; gebaut wurde `--s-16` = 64px, `--s-18` existiert und ist ungenutzt). Das horizontale Padding sitzt jetzt bei `.layout-container`, nicht mehr bei `.act`: `clamp(var(--s-5), 4vw, var(--s-16))`. 180 Verwendungen in `app/src`.

### 2.2 Type-Scale, 7 Rollen, 3 Fonts · **umgesetzt als Utility-Klassen**
| Klasse | Font | size | weight | lh | ls |
|---|---|---|---|---|---|
| `.t-display-xl` (Hero) | Bricolage | `clamp(3rem, 9vw, 8rem)` | 800 | 0.9 | -0.03em |
| `.t-display-l` (Akt-Titel) | Bricolage | `clamp(2.2rem, 6vw, 4.5rem)` | 700 | 0.98 | -0.02em |
| `.t-display-s` (Statement) | Bricolage | `clamp(1.25rem, 2.2vw, 1.75rem)` | 700 | 1.3 | -0.01em |
| `.t-lead` | Hanken | `clamp(1.1rem, 1.6vw, 1.4rem)` | 400 | 1.55 | 0 |
| `.t-body` | Hanken | `clamp(1rem, 1.3vw, 1.2rem)` | 400 | 1.6 | 0 |
| `.t-label` | IBM Plex Mono | `0.74rem` | 700 | 1 | 0.22em · caps |
| `.t-data` | IBM Plex Mono | `0.78rem` | 500 | 1.5 | 0 · tabular-nums |

Statt 18 Inline-`clamp()` sind noch 4 übrig (Tabelle in 1.5). Die Legacy-Klassen `.display`, `.mono`, `.kicker`, `.prose` sind absichtlich stehen geblieben (103 Verwendungen) und werden nicht mehr migriert; `.kicker` trägt zusätzlich die Hairline-Regel.

### 2.3 Grid & Max-Width (Editorial) · **umgesetzt**
- **Content-Container:** `.layout-container` mit `max-width: var(--container)` = **1320px** (= die interne Viz-Breite `W=1320`, deshalb füllt jede Visualisierung die Spalte exakt), zentriert, Seiten-Padding `clamp(var(--s-5), 4vw, var(--s-16))`.
- **Editorial-Grid:** `.editorial-grid` mit 12 Spalten, Gutter `var(--s-6)`. `.text-column` liegt in Spalten **1-7**, Viz und Großbild in `1 / -1`. Unter 720px CSS-Breite klappt `.text-column` auf volle Breite.
- **Textspalte:** `--measure: 64ch` ist gesetzt und wird von `.text-column` genutzt.
- `.act` ist `min-height:100vh` mit `justify-content: flex-start`, der Inhalt sitzt also an der Fluchtlinie und nicht mittig.

### 2.4 Offen geblieben
1. **`.prose` steht weiter auf 56ch**, während `.text-column` schon `--measure` (64ch) nutzt. Zwei Zeilenlängen im selben Layout; die schmalere ist Altlast.
2. **`--s-18` ist definiert, aber ungenutzt.** Entweder `.act` darauf heben oder die Stufe streichen.
3. **`.t-label` verlangt Gewicht 700 in IBM Plex Mono, geladen sind 400 und 500.** Entweder 700 in den Font-Link aufnehmen oder die Klasse auf 500 setzen.

---

## 3 · KOMPONENTEN-MAP (Akt → Datei → Render → Encoding)

| Akt | Komponente | Render | Canvas-/SVG-Maße | Visuelle Encodings (Parameter) |
|---|---|---|---|---|
| **1 Compute** | `ComputeExplosion.jsx` | **SVG** (466 Pkt von 528) | `W1320 H548`, PAD_L70/R44/T110/B54 | x=`scaleLinear`[2010, 2026.5] · y=`scaleLog`[1e15, 1e27] (clamp) · Punkt `r=3.8` `opacity .8` plus weißer Kern `r=1.25` (Luminanz-Popout) · Farbe=`heat(t)`, t normiert über log10(FLOP) von 15 über 12 Dekaden · Frontier `stroke=PAL.machine` `w2.5` mit Glow-Unterstrich `w9 α.16` · 63 Meilenstein-Ringe `r5.5` |
| **2 Map** | `MapOfAI.jsx` | **Canvas 2D** (477.807 Pkt) | `W1320 H700 PAD40` | `fillRect` Größe `1.5` · alpha: Feld `.28`, Brushing hover `.95` / Rest `.04` · Bloom-Layer 3px `α.4` · Farbe = `CAT`/`CAT_OTHER` aus `theme.js`, indiziert über `map.json cats[].cat` (kategorial) **oder** `heat(yr)` (sequenziell, Toggle) · Jahres-Leiste 24px als Scrub-Indikator |
| **3 Galaxie** | `FamilyTree.jsx` | **Canvas 2D** + d3-zoom/quadtree (38.385 Sterne + 160 Hubs) | `W1320 H820 PAD70` | Sonne `hubR = 1.8 · clamp(4.5, 30, 4+√c·0.16)` · Stern `childR = 1.6 · clamp(0.9, 4.2, 0.9+√dl/260)`, jeweils × Zoom · alpha = `bright(age)` (Aktualität) · Hub-Farbe `PAL.star` (Selektion `PAL.machine`) · Kind-Farbe = `REL_COLOR[rel]` aus `theme.js` · Merge-Kante `PAL.merge`, Lineage-Kante ink `α.18` · zoom `scaleExtent[0.6, 48]` |
| **4 Register** | `ConversationLedger.jsx` + `components/ledger/*` | **Canvas 2D** (Blatt) + **SVG** (Zeilen-Echo, Dossier-Verlauf, Lesetisch) | **Ebene 1** direkt beschriftetes Band der 9 Kategorien (DOM). **Ebene 2** Blatt `W1320 H1272` (= `ROWS_Y0 106 + 53 × ROW_H 22`), Mark-Zone 14px je Zeile; Detail-SVGs 1320×58 (Zeilen-Echo), 360×150 (Dossier-Verlauf), 300×64 (Lesetisch-Skalen). Dossier mit **fester Höhe je Breakpoint** (`--dossier-h` 1060 / 1320 / 1860 px bei 4 / 3-2 / 1 Grid-Spalte, gemessener Maximalbedarf über alle 53 Länder → kein inneres Scrollen, CLS 0) | Zwei Ebenen (Shneiderman: overview first, details on demand): erst die Frage plus die Kategorien-Aufteilung, das Register auf Klick. Reorderbare Matrix (Bertin): 53 Länderzeilen plus Referenzzeile WELT (Kontur statt Füllung), x-Positionen in **allen** Zeilen identisch (`ledger/geometry.js` als einzige Quelle für Canvas und DOM). **Vier** Mark-Spalten: Volumen (`scaleLinear`, echter Nullpunkt, kein Log, kein Mindestbalken, Lie Factor 1) · „Wofür" (gestapelte Bündel aus `CAT_BUCKET`, `Sonstiges` schraffiert am Nullpunkt) · Graubereich (**Fokusskala**: 0-10 % maßstabsgetreu mit 30px/pp, danach sichtbare Lücke und 6,25× gestaucht bis 25 %, `modScale()` mit `.invert()`) · Belege (Strichhöhe = `scaleSqrt` 25-2.000 Zeichen auf 2-14px). Tiefe und Verlauf sind aus dem Blatt entfernt (Task auf Spaltenbreite nicht erfüllt) und stehen nur noch im Dossier und in der sr-only-Tabelle. Sortieren über Spaltenköpfe, Range-Brush auf der Graubereich-Spalte (ab 4px Zug), Zeile → Dossier, Beleg → Lesetisch. Unter `RESPONSIVE_MIN` 1200px gibt „Wofür" 80px an „Graubereich" ab; es entfällt keine Spalte. |
| **5 Spot** | `SpotTheMachine.jsx` + `components/spot/*` | **HTML/React** (Quiz) + **SVG** (Abschluss-Grafik `ReleaseMass`) | Bild `clamp(300px, 38vw, 420px)`, `aspect-ratio 1/1`; Abschluss-SVG `viewBox 1320×210`, PAD L60/R14/T40/B52, 40 Monatsslots | Quiz: Bild `object-fit: cover` · Mensch=`PAL.human` / KI=`PAL.machine` · Outcome `PAL.ok`/`PAL.no`, immer mit Glyphe (✓/✗), nie Farbe allein · Karten-Flash + Shake/Puls nur nutzergetriggert. **Abschluss** (`spot/VideoOutlook.jsx`, Text in `spot/outlookText.js`): zwei Spalten Text-Merkmal (eigene HC3-Zahl) gegen Bild-Merkmal (Forschungslage, keine eigene Kennzahl), dann der Video-Befund aus demselben Modellkarten-Zensus wie Akt 3. Grafik = Download-Masse nach Erscheinungsmonat, `scaleLinear` mit echtem Nullpunkt (**kein Log**: die Spitzigkeit ist der Befund), lückenlose Monatsachse, Monate ohne Modell bleiben als `opacity 0` stehen statt zu entfallen; Medianlinie als gestrichelte Referenz in `rgba(236,232,225,0.55)` (**nicht** Magenta: eine Referenz ist keine Entität), drei Spitzen direkt mit Modellnamen beschriftet. Bewusst **keine Zeitreihe „neue Modelle je Monat"**: der Zensus erfasst 8.747 Modelle von vor 2025 gegen 616.890 ab 2025, eine solche Kurve wäre Erfassungsdichte statt Wachstum. |
| Chrome | `App.jsx` (Hero/Footer), `ActIntro.jsx`, `Interlude.jsx`, `HeroField.jsx`, `Motion.jsx` | DOM | Container `.layout-container` 1320px | Scroll-Balken `PAL.machine` auf `PAL.grid`, Reveal/CountUp (motion), `useReducedMotion` überall |

**Daten-Fluss (alle):** statische JSON in `app/public/data/` → `fetch()` in `useEffect` → State → Render. Schwere Aufbereitung offline in `daten/*.py` (DuckDB).

Größen dezimal wie in `daten/QUELLEN.md` (1 MB = 1.000.000 Bytes), Bytes zur Kontrolle daneben.

| Datei | Größe (Stand 2026-07-26) | Inhalt | von der App geladen? |
|---|---|---|---|
| `map.json` | 9,1 MB (9.058.719 B) | 477.807 Punkte, 8+1 Kategorien, Top-Paper je Feld und je Jahr | ja, Akt 2 |
| `familytree.json` | 4,1 MB (4.060.647 B) | 160 Hubs, 38.385 Sterne, 32 Hub-Kanten (davon 3 Merges) | ja, Akt 3 |
| `wildchat.json` | 1,1 MB (1.142.539 B) | 53 Länder, 12 Sprachen, 13 Monate, 848 Belege, `schemaVersion 3` | ja, Akt 4 |
| `world-110m.geo.json` | 839 KB (838.726 B) | Natural-Earth-Länderpolygone | **nein**, nur Eingabe für `daten/build_wildchat.py` (Zentroide) |
| `epoch.json` | 90 KB (89.764 B) | 528 Modelle mit FLOP-Wert, 6 Domänen | ja, Akt 1 |
| `spot.json` | 7,9 KB (7.853 B) | 6 Bilder, 7 Textpaare, Tell-Statistik | ja, Akt 5 |

Dazu 15 Bilddateien unter `app/public/data/spot/` (zusammen 7,8 MB). `spot.json` referenziert davon 6; die übrigen 9 (`ai_0.jpg` bis `ai_5.jpg`, `real_0.jpg`, `real_1.jpg`, `real_3.jpg`, zusammen 1,2 MB) liegen als Beleg der kuratierten Auswahl im Repo und werden nicht ausgeliefert. Sie sind bewusst nicht gelöscht.

**Reste des früheren Scaffolds: entfernt.** `VegaChart.jsx`, die `react-scrollama`/`vega-embed`-Importe, das `.scrolly`-CSS sowie `deck.gl`/`maplibre`/`vega` in `package.json` sind in diesem Projekt nicht vorhanden (verifiziert per Suche über `app/src`, `app/index.html`, `app/package.json`). Die Laufzeit-Abhängigkeiten sind nur noch: `react`, `react-dom`, `motion`, `d3-scale`, `d3-zoom`, `d3-selection`, `d3-quadtree`. Code des abgeschlossenen Vorgängerprojekts ist nicht Bestandteil des Abgabepakets.
