// Design-System "Inside the Machine" - Richtung "Observatorium" (filmisch-dunkel).
// SINGLE SOURCE OF TRUTH (JS-Seite). Werte muessen mit app/src/index.css :root uebereinstimmen,
// und die in JSON eingebackenen Farben der Python-Build-Skripte muessen hier matchen:
//   - daten/build_map.py        -> CAT_COLORS  == CAT (+ CAT_OTHER)
//   - daten/build_familytree.py -> REL_COLOR   == REL_COLOR (hier); Ausnahme quantized, Begruendung
//     steht dort unten an REL_COLOR (Magenta ist reserviert, das JSON-Farbfeld liest die App nicht)
//
// Theoriegeleitet: EIN Farbton = eine Bedeutung, Farbe TYPISIERT (Ware/Brewer, Session 5):
//   - Magenta = die Maschine (Protagonist/Akzent/Selektion, NICHT als Kategorie)
//   - Teal    = der menschliche Gegenpol
//   - CAT[]   = kategoriale Qualitativ-Palette (Felder/Themen), CVD-sicher
//   - SEQ/heat() = sequenzielle Magnitude-/Alter-Rampe (viridis), perzeptuell geordnet
// Kein Neon-Glow (Tufte/Chartjunk, Session 4); Tiefe kommt aus Korn + Vignette (index.css).

export const PAL = {
  // --- Flaechen ---
  bg: '#0b0a0c', // warmes Fast-Schwarz, FLACH (kein Radial-Glow)
  panel: '#15131a', // solides warmes Panel
  panel2: 'rgba(21,19,26,0.95)', // transluzentes warmes Panel (Tooltips/Karten/Profil) - ERSETZT die kalten rgba(13,13,24,..)
  scrim: 'rgba(7,6,10,0.88)', // Vollbild-Backdrop (Explorer-Overlay)
  // --- Text / Linien ---
  ink: '#ece8e1', // warmes Off-White
  text: '#ece8e1', // Alias von ink
  muted: '#969089', // warmes Grau
  grid: 'rgba(236,232,225,0.07)',
  axis: 'rgba(236,232,225,0.32)',
  hairline: 'rgba(236,232,225,0.12)', // neutrale Raender
  // --- Akzent: Maschine (Magenta) <-> Mensch (Teal), hoher Kontrast, CVD-tauglich ---
  machine: '#d6409f', // Magenta = Maschine (RESERVIERT: Maschine/Fokus, NICHT als Kategorie)
  machineSoft: 'rgba(214,64,159,0.15)',
  machineLine: 'rgba(214,64,159,0.5)', // Panel-Raender in Akzentfarbe
  machineRule: 'rgba(214,64,159,0.26)', // Kicker-Hairline
  onAccent: '#fff0f6', // heller Text auf Magenta-Flaechen
  human: '#45bcc0', // kuehles Teal = Mensch
  // --- Viz-spezifische Toene (zentralisiert; waren inline hartcodiert) ---
  star: '#dfe8ff', // Galaxie-Sonnen (Akt 3)
  merge: '#ffd700', // Supernova-Gold: Merge-Kanten/-Knoten (Akt 3, kosmische Palette)
  ok: '#34d399', // Outcome richtig (Akt 5)
  no: '#fb7185', // Outcome falsch (Akt 5)
  // --- Aliase (Altlast): Komponenten nutzen sie noch; in Phase 2 auf bg/machine umstellen, dann entfernen ---
  void: '#0b0a0c', // == bg
  signal: '#d6409f', // == machine
  signalSoft: 'rgba(214,64,159,0.15)', // == machineSoft
}

// Einzel-Konstanten fuer Komponenten, die bisher Hex hartcodiert haben (Phase-2-Import statt Inline-Hex):
export const STAR = PAL.star // FamilyTree.jsx:18
export const MERGE = PAL.merge // FamilyTree.jsx Merge-Kanten
export const SCRIM = PAL.scrim // FamilyTree.jsx:234 Overlay-BG
export const OUTCOME = { ok: PAL.ok, no: PAL.no } // SpotTheMachine.jsx:10-11

// Kategoriale Qualitativ-Palette: Paul-Tol-"Bright"/Okabe-Ito-orientiert, CVD-sicher, fuer dunklen
// Hintergrund geeignet. OHNE Rot/Orange (Maschine = Magenta reserviert). Die 4 ersten
// (haeufigste Kategorien) maximal trennbar: Blau, Gruen, Gelb, Purpur.
// MUSS mit daten/build_map.py CAT_COLORS matchen.
export const CAT = ['#4477aa', '#228833', '#ccbb44', '#aa3377', '#ee99aa', '#999933', '#66ccee', '#bbbbbb']
export const CAT_OTHER = '#5b5b6e' // "andere"/Sonstiges (neutraler Rest-Bucket)
export const CAT_MIXED = '#9aa6c0' // "gemischt" (WildChat-Karten ohne dominante Kategorie)

// Themen-Farben Akt 4 (WildChat) - zentralisiert (war inline CAT_COLOR-Dict in WildChatMap.jsx).
// Schluessel = Themen-Kategorie, Wert = CAT-Ton. EINE Quelle fuer Karte, Karten, Legende.
export const CAT_COLOR = {
  Programmieren: CAT[0], // #4477aa
  'Schreiben/Text': CAT[1], // #228833
  'Wissen/Erklären': CAT[2], // #ccbb44
  'Rollenspiel/Story': CAT[3], // #aa3377
  Übersetzen: CAT[4], // #ee99aa
  Ratschlag: CAT[5], // #999933
  'Mathe/Logik': CAT[6], // #66ccee
  'Bild-Prompts': CAT[7], // #bbbbbb - neutrales Grau: SD/Midjourney-Tag-Ketten (Heuristik v2)
  Sonstiges: CAT_OTHER, // #5b5b6e
  gemischt: CAT_MIXED, // #9aa6c0
}

// Akt 4 "Das Register", Spalte c3: die 9 Heuristik-Kategorien auf 7 Stapelsegmente gebuendelt.
// 7 < Munzners 8er-Grenze fuer kategoriale Hue-Kodierung (Kap. 5): mehr Hues sind nicht mehr
// zuverlaessig unterscheidbar. Feste Reihenfolge links->rechts nach globalem Rang, in JEDER der
// 53 Zeilen identisch - das ist die Kompensation fuer den fehlenden gemeinsamen Nullpunkt der
// mittleren Segmente. "Sonstiges" steht links am gemeinsamen Nullpunkt und traegt zusaetzlich
// TEXTUR (Schraffur): Unsicherheit gehoert in die Tinte, nicht in die Fussnote (Cairo).
// pct = Referenzwert aus data.globalCats, nur zur Dokumentation der Reihenfolge. Gerendert wird
// IMMER der Laufzeitwert aus bucketCats(); ledger.test.js haelt beide Seiten synchron.
export const CAT_BUCKET = [
  { key: 'Sonstiges', pct: 21.8, color: CAT_OTHER, hatch: true }, // #5b5b6e
  { key: 'Wissen/Erklären', pct: 21.3, color: CAT[2] }, // #ccbb44
  { key: 'Schreiben/Text', pct: 19.7, color: CAT[1] }, // #228833
  { key: 'Rollenspiel/Story', pct: 13.8, color: CAT[3] }, // #aa3377
  { key: 'Programmieren', pct: 11.0, color: CAT[0] }, // #4477aa
  { key: 'Bild-Prompts', pct: 9.9, color: CAT[7] }, // #bbbbbb
  { key: 'Rest', pct: 2.5, color: CAT_MIXED, members: ['Übersetzen', 'Mathe/Logik', 'Ratschlag'] }, // #9aa6c0
]

// Vermehrungsarten Akt 3 (Family). EINZIGE Quelle der Kategoriefarben dieses Akts: Canvas-Sprites,
// HUD und Legende lesen alle hier.
// dominante Klasse (finetune) entsaettigt -> ruhige Masse; seltene Klassen als Akzente.
// Kosmische Palette (Akt 3): die Galaxie besteht primaer aus echten Sternen (finetune = 72% = Weiss),
// mit Neon-Nebeln und Supernova-Gold-Merges.
// ABWEICHUNG ZU daten/build_familytree.py: dort ist quantized noch als #d6409f eingebacken. Dieses
// Feld (familytree.json rels[].color) liest die App NICHT - und Magenta ist oben als Maschine/Fokus
// reserviert, darf also keine Kategorie sein. Gerendert wird deshalb Violett, "eine Bedeutung je
// Farbton" gilt damit im Code und nicht nur auf dem Papier.
export const REL_COLOR = {
  finetune: '#fff5e6', // Sternen-Weiss/Warmgelb (72% der Masse = die "echten" Sterne)
  adapter: '#00e5ff', // Neon-Cyan
  quantized: '#a78bfa', // Nebula-Violett (NICHT Magenta: das gehoert der Maschine/Selektion)
  merge: PAL.merge, // Supernova-Gold (#ffd700)
}

// Sequenzielle Magnitude-/Alter-Rampe = viridis (perzeptuell uniform, CVD-sicher; Smith & van der Walt).
// dunkel-violett -> blau -> teal -> gruen -> gelb; Boden minimal angehoben fuer den dunklen Grund.
export const SEQ = [
  [72, 33, 115],
  [59, 82, 139],
  [44, 114, 142],
  [33, 144, 141],
  [92, 200, 99],
  [170, 220, 50],
  [253, 231, 37],
]
export const HEAT = SEQ // Alias fuer Altcode

export function heat(t) {
  t = Math.max(0, Math.min(1, Number.isFinite(t) ? t : 0))
  const x = t * (SEQ.length - 1)
  const i = Math.floor(x)
  const f = x - i
  const a = SEQ[i]
  const b = SEQ[Math.min(i + 1, SEQ.length - 1)]
  return `rgb(${Math.round(a[0] + (b[0] - a[0]) * f)},${Math.round(a[1] + (b[1] - a[1]) * f)},${Math.round(a[2] + (b[2] - a[2]) * f)})`
}

// Spacing-Skala (4/8) - Spiegel von index.css --s-*, fuer Inline-Styles in Komponenten (Phase 2).
export const SPACE = {
  0: '0',
  1: '0.25rem',
  2: '0.5rem',
  3: '0.75rem',
  4: '1rem',
  5: '1.25rem',
  6: '1.5rem',
  8: '2rem',
  10: '2.5rem',
  12: '3rem',
  16: '4rem',
  18: '4.5rem',
  20: '5rem',
  24: '6rem',
}

// Akte lassen den globalen Backdrop (flach + Korn + Vignette aus index.css) durch.
export const SCENE_BG = 'transparent'
