// Akt 4 "Das Register" - Geometrie des Blattes.
//
// EINZIGE QUELLE fuer Canvas UND DOM. Die 53 unsichtbaren Tastatur-Buttons, das Zeilen-Echo im
// Dossier (Stufe C) und der Hit-Test rechnen alle mit denselben Konstanten; nur so liegen
// Zeichnung, Trefferflaeche und Fokusring garantiert uebereinander.
//
// x-Positionen sind in ALLEN 53 Zeilen identisch. Das ist der Kern der Bertin-Matrix
// (matrice ordonnable): gemeinsame Skalen je Spalte machen jede Zeile mit jeder vergleichbar,
// und erst dadurch ist das Umsortieren selbst eine Analyse und keine Dekoration.

import { scaleLinear, scaleSqrt } from 'd3-scale'

// VIER MARK-SPALTEN, NICHT SECHS (Befund über die eigene Gestaltung, Stand dieser Fassung):
// "Tiefe" (avgTurns) spannte real nur 1,5 bis 3,8 Runden, die mittlere Hälfte 2,2 bis 2,8. Auf
// 80 px Spaltenbreite lagen damit alle 53 Punkte praktisch übereinander - der Kanal war da, der
// Task "vergleichen" nicht erfüllbar (Munzner: effectiveness verfehlt). "Verlauf" hatte Varianz
// (Abweichung vom Weltprofil 0,073 bis 0,42), aber 13 Balken auf 179 x 14 px zeigten sie nicht.
// Beide sind deshalb aus dem Blatt entfernt und stehen im Dossier in voller Auflösung sowie
// vollständig in der sr-only-Tabelle. Ihr Platz (283 px) geht an Graubereich und Wofür.

export const W = 1320 // == index.css --container: das Blatt fuellt die Spalte exakt

export const COMB_Y = 2
export const COMB_H = 14 // Einheiten-Kamm y 2..16
export const COMB_CAP_Y = 30 // Baseline der Mono-Zeile unter dem Kamm
export const COMB_GAP = 3 // Luecke zwischen zwei Laendersegmenten
export const HEAD_Y = 40
export const HEAD_H = 36 // Spaltenkoepfe + Mikro-Histogramme y 40..76
export const HEAD_LABEL_H = 16 // HTML-Buttonzone y 40..56
export const HIST_Y = 58
export const HIST_W = 40
export const HIST_H = 10 // Mikro-Histogramm y 58..68
export const HIST_BINS = 12
export const HEAD_RULE_Y = 73 // 2 px Unterstrich der aktiven Sortierspalte
export const WORLD_Y = 80 // Referenzzeile WELT
export const ROWS_Y0 = 106 // erste Laenderzeile
export const ROW_H = 22
export const MARK_H = 14 // Mark-Zone rowTop+4 .. rowTop+18
export const N_ROWS = 53
export const H = ROWS_Y0 + N_ROWS * ROW_H // = 1272

/** Zwei Bezugslinien je Zeile: haengende Marks stehen auf BASE, Achsen-Marks liegen auf AXIS. */
export const MARK_TOP = 4
export const BAR_Y = 6
export const BAR_H = 10
export const AXIS_Y = 11
export const BASE_Y = 18

export const rowTop = (i) => ROWS_Y0 + i * ROW_H

// --- Spalten (x exakt) ------------------------------------------------------
// Die Spalten, die eine Mark tragen. c0 (Rang) und c1 (Land) sind reine Beschriftung,
// zaehlen also nicht mit. Eine Quelle fuer Blatt, Lesehilfe und aria-label, damit die
// genannte Spaltenzahl nicht auseinanderlaeuft.
export const MARK_COL_KEYS = ['c2', 'c3', 'c4', 'c7']

export const COLS = {
  rail: { x0: 0, x1: 3 }, // Selektions-Rail, ausschliesslich PAL.machine
  c0: { x0: 8, x1: 32, key: 'rank', label: 'Rang' },
  c1: { x0: 40, x1: 184, key: 'name', label: 'Land' },
  c2: { x0: 192, x1: 314, barW: 100, numX: 314, key: 'n', label: 'Volumen' },
  c3: { x0: 326, x1: 706, w: 380, key: 'cat', label: 'Wofür' },
  c4: { x0: 718, x1: 1098, w: 380, max: 25, key: 'modPct', label: 'Graubereich' },
  c7: { x0: 1113, slotW: 8.7, nSample: 17, grayX0: 1275, nGray: 5, key: null, label: 'Belege' },
}

/** Reihenfolge der Spalten mit Sortierkopf. c7 ist bewusst KEIN Schluessel (Belegzahl ist kein Mass). */
export const SORTABLE = ['c1', 'c2', 'c3', 'c4']

// --- Responsive-Stufe 980..1199 px -----------------------------------------
//
// Das Blatt bleibt intern immer 1320 px breit; unter 1200 px CSS-Breite wird es also als Ganzes
// herunterskaliert (bei 980 px auf 74 %). Es faellt jetzt keine Spalte mehr weg - es gibt nur
// noch vier, und jede traegt einen Task. Stattdessen wird umverteilt: die Themen-Spalte gibt
// 80 px an die Graubereich-Spalte zurueck. Begruendung ueber die Aufgabe, nicht ueber Optik:
// Graubereich muss Laender auf ein bis zwei Prozentpunkten unterscheiden, verliert bei 74 %
// Skalierung also zuerst seinen Task; der 100-%-Stapel behaelt in jeder Zeile denselben
// Nullpunkt und dieselbe Gesamtlaenge und verliert nur Feinheit an den kleinsten Segmenten.
export const RESPONSIVE_MIN = 1200

/** c4 waechst um genau die 80 px, die c3 abgibt; c7 bleibt, wo es ist. */
export const COLS_COMPACT = {
  ...COLS,
  c3: { ...COLS.c3, x1: 626, w: 300 },
  c4: { ...COLS.c4, x0: 638, w: 460 },
}

/** Spaltensatz zur CSS-Breite des Blattes. Rein arithmetisch, ohne DOM - deshalb testbar. */
export const columnsFor = (cssWidth) => (cssWidth >= RESPONSIVE_MIN ? COLS : COLS_COMPACT)

/** Sortierbare Koepfe des aktuellen Satzes: eine entfallene Spalte hat auch keinen Kopf. */
export const sortableFor = (cols) => SORTABLE.filter((k) => cols[k])

// --- Range-Brush auf c4 (Yi: filter) ---------------------------------------

/** Unter 4 px ist es kein Zug, sondern ein Klick - der waehlt eine Zeile und filtert nicht. */
export const BRUSH_MIN_PX = 4

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v)

/**
 * Zwei Canvas-x-Werte -> Wertebereich auf der Graubereich-Skala.
 * Richtungsunabhaengig (nach links gezogen ist derselbe Bereich), auf die Spaltenskala geklemmt,
 * und `null` bei zu kurzem Zug. Der Filter arbeitet damit auf DATENWERTEN, nicht auf Pixeln:
 * ein Bereich bleibt derselbe, wenn das Blatt skaliert oder umsortiert wird. Die Umkehrung
 * kommt aus der Skala selbst (modScale.invert) und kennt deshalb auch den Achsenbruch - eine
 * eigene Pixelrechnung hier waere nach dem Umbau still falsch geworden.
 */
export function brushRange(xa, xb, cols = COLS) {
  if (!Number.isFinite(xa) || !Number.isFinite(xb)) return null
  if (Math.abs(xb - xa) < BRUSH_MIN_PX) return null
  const s = modScale(cols)
  const lo = s.invert(Math.min(xa, xb))
  const hi = s.invert(Math.max(xa, xb))
  return hi > lo ? { lo, hi } : null
}

/** Liegt ein Wert im gebrushten Bereich? Raender zaehlen dazu (halboffen waere hier willkuerlich). */
export const inBrush = (v, range) => !range || (v >= range.lo && v <= range.hi)

// --- Skalen -----------------------------------------------------------------

/**
 * Volumen LINEAR mit gemeinsamem Nullpunkt, kein Log und kein Mindestbalken.
 * Cleveland & McGill 1984 Rang 2; Lie Factor = 1. Greece (1.513) wird damit 0,89 px breit -
 * der lange Schwanz ist ein Fluestern, und das ist die wahre Form einer Potenzverteilung.
 */
export const volumeScale = (maxN) => scaleLinear().domain([0, maxN]).range([COLS.c2.x0, COLS.c2.x0 + COLS.c2.barW])

// --- Graubereich: Fokusskala mit sichtbarem Bruch ---------------------------
//
// DAS PROBLEM DER ALTEN LINEAREN SKALA 0..25 %: die Werte reichen von 0,0 bis 24,0 %, aber
// 40 der 53 Laender liegen unter 5 % und 51 unter 10 %. Auf 180 px linear (7,2 px/pp) lagen
// 1 % und 4 % 21 px auseinander, die Masse draengte sich im linken Fuenftel, und die Spreizung
// bezahlte ein einziger Ausreisser (Israel 24,0 %).
//
// DIE WAHL: linear im Fokusbereich 0..10 %, danach ein SICHTBARER Bruch von 8 px, dahinter der
// Schwanz 10..25 % um Faktor 6,25 gestaucht. Warum diese und nicht eine Wurzel-/Potenzskala:
// eine Wurzelskala verzerrt JEDEN Abstand, auch die zwischen 1 % und 4 %, und der
// Abweichungsbalken zur Weltlinie (Laenge!) haette dort keine Bedeutung mehr. Hier bleibt der
// Bereich, in dem 51 von 53 Laendern liegen, exakt linear - Lie Factor 1, der Abweichungsbalken
// misst dort echte Prozentpunkte. Verzerrt ist nur, was ausdruecklich als verzerrt markiert ist:
// der Bruch ist eine leere Luecke im Bild, die Achse ist im Kopf beziffert (0 1 2 5 10 | 15 20 25),
// der Balken bricht in der Luecke ab, der Stauchungsfaktor steht daneben, und die beiden Laender
// jenseits des Bruchs tragen ihre Zahl im Klartext neben der Glyphe.
//
// Bei 380 px Spaltenbreite ergibt das exakt 30 px/pp im Fokus: 1 % und 4 % liegen 90 px
// auseinander statt 21. Die Weltlinie bei 3,8 % bleibt als durchgehende Referenz.

/** Linearer Fokusbereich in Prozentpunkten. 51 der 53 Laender liegen darin. */
export const MOD_FOCUS = 10
/** Ende des gestauchten Schwanzes. Bleibt bei 25 %; der Datensatz reicht bis 24,0 %. */
export const MOD_MAX = 25
/** Breite der leeren Luecke. Sie IST der Bruch - kein Symbol, das man uebersehen kann. */
export const MOD_BREAK_W = 8
/** Stauchung des Schwanzes gegen den Fokus. 1 pp jenseits des Bruchs ist 1/6,25 pp davor. */
export const MOD_TAIL_SQUEEZE = 6.25
/** Bezifferte Marken im Spaltenkopf. Ohne sie waere eine gebrochene Achse nicht dekodierbar. */
export const MOD_TICKS = [0, 1, 2, 5, 10, 15, 20, 25]

/**
 * Graubereich: stueckweise linear mit Bruch. Rueckgabe ist eine Funktion Wert -> x, dazu
 * `invert` (fuer den Range-Brush), `breakLo`/`breakHi` (die Luecke) und `focusPx`/`tailPx`
 * (px je Prozentpunkt in beiden Abschnitten). Aus der Spaltenbreite folgt die Aufloesung,
 * nicht umgekehrt: 380 px ergeben 30,0 px/pp im Fokus und 4,8 px/pp im Schwanz.
 */
export function modScale(cols = COLS) {
  const c = cols.c4
  const focusPx = (c.w - MOD_BREAK_W) / (MOD_FOCUS + (MOD_MAX - MOD_FOCUS) / MOD_TAIL_SQUEEZE)
  const tailPx = focusPx / MOD_TAIL_SQUEEZE
  const breakLo = c.x0 + MOD_FOCUS * focusPx
  const breakHi = breakLo + MOD_BREAK_W
  const s = (v) => {
    const val = clamp(v ?? 0, 0, MOD_MAX)
    return val <= MOD_FOCUS ? c.x0 + val * focusPx : breakHi + (val - MOD_FOCUS) * tailPx
  }
  // Innerhalb der Luecke gibt es keinen Wert: ein x dort klemmt auf die Fokusgrenze. Der Brush
  // erfindet also keine Zahl fuer eine Stelle, an der die Achse gar nicht ist.
  s.invert = (x) => (x <= breakHi
    ? clamp((x - c.x0) / focusPx, 0, MOD_FOCUS)
    : clamp(MOD_FOCUS + (x - breakHi) / tailPx, MOD_FOCUS, MOD_MAX))
  s.focusPx = focusPx
  s.tailPx = tailPx
  s.breakLo = breakLo
  s.breakHi = breakHi
  s.x1 = c.x0 + c.w
  return s
}

/**
 * Ein waagerechter Balken von a bis b, am Achsenbruch aufgeteilt: die Luecke bleibt leer.
 * Damit zeigt der Abweichungsbalken selbst, dass die Achse gebrochen ist - er laeuft nicht
 * stillschweigend darueber hinweg. Ein Balken, der den Bruch nicht beruehrt, bleibt ein Stueck.
 */
export function splitAtBreak(a, b, s) {
  const lo = Math.min(a, b)
  const hi = Math.max(a, b)
  if (hi <= s.breakLo || lo >= s.breakHi) return [[lo, hi]]
  const out = []
  if (lo < s.breakLo) out.push([lo, s.breakLo])
  if (hi > s.breakHi) out.push([s.breakHi, hi])
  return out
}

/** Belegstrich: Hoehe = Zeichenzahl, Wurzelskala 25..2.000 -> 2..14 px, geklemmt. */
export const docHeightScale = () => scaleSqrt().domain([25, 2000]).range([2, 14]).clamp(true)

/**
 * Belegblock im Dossier: BREITE = Zeichenzahl, dieselbe Wurzelskala wie die Strichhoehe.
 * Der Text sitzt IM Balken (overflow:hidden), er IST nicht der Balken - sonst wuerde die
 * proportionale Schrift den Wert mitbestimmen (Nische N2 des Design-Systems: Text als Mark ist
 * nur zulaessig, wenn Position oder Laenge den Wert traegt).
 */
export const docBlockScale = () => scaleSqrt().domain([25, 2000]).range([60, 520]).clamp(true)

/**
 * Zeilen-Echo im Dossier: dieselben x-Konstanten und Skalen wie im Blatt, nur ROW_H 26 statt 22.
 * Damit springt der Blick beim Wechsel Blatt -> Detail nicht; der Kontext reist mit, auch wenn
 * die Originalzeile aus dem Bild gescrollt ist.
 */
export const ECHO = { rowH: 26, barY: 8, barH: 10, axisY: 13, baseY: 22, h: 58 }

/** Mittelpunkt eines Belegslots. 17 sample-Slots, 14,1 px Luecke, 5 gray-Slots. */
export function slotX(kind, j) {
  const c = COLS.c7
  return (kind === 'g' ? c.grayX0 : c.x0) + j * c.slotW
}

/** Umkehrung fuer den Hit-Test: welcher Slot liegt unter x? Rein arithmetisch, kein Quadtree. */
export function slotAt(x) {
  const c = COLS.c7
  if (x >= c.grayX0 && x < c.grayX0 + c.nGray * c.slotW) return { kind: 'g', j: Math.floor((x - c.grayX0) / c.slotW) }
  if (x >= c.x0 && x < c.x0 + c.nSample * c.slotW) return { kind: 's', j: Math.floor((x - c.x0) / c.slotW) }
  return null
}

/** Spalte unter x. Sortiertes Schwellenarray statt Kollisionsstruktur. */
export function colAt(x, cols = COLS) {
  const order = ['c0', 'c1', 'c2', 'c3', 'c4', 'c7']
  for (const key of order) {
    const c = cols[key]
    if (!c) continue
    const x1 = key === 'c7' ? W : c.x1
    if (x >= c.x0 - 6 && x <= x1 + 6) return key
  }
  return null
}
