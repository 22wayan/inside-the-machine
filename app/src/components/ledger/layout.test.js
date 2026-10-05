// Stufe E - die reine Logik des Feinschliffs: Responsive-Spaltenwahl und Range-Brush.
//
// Beides sind Dinge, die man im Browser nur schwer und nie reproduzierbar prueft (Viewport-Grenze,
// Mausgeste). Als arithmetische Funktionen sind sie hier vollstaendig pruefbar - genau das ist
// der Grund, warum Geometrie und Bereichsrechnung in geometry.js liegen und nicht in der
// Komponente: die Ebene "Algorithm" des Nested Model laesst sich nur testen, wenn sie DOM-frei ist.

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { LABEL_MIN_ABSTAND, markerVersatz } from './ReadingDesk'
import {
  BRUSH_MIN_PX, COLS, COLS_COMPACT, MARK_COL_KEYS, MOD_BREAK_W, MOD_FOCUS, MOD_MAX,
  MOD_TAIL_SQUEEZE, MOD_TICKS, RESPONSIVE_MIN, W,
  brushRange, colAt, columnsFor, inBrush, modScale, sortableFor, splitAtBreak,
} from './geometry'

const data = JSON.parse(readFileSync(new URL('../../../public/data/wildchat.json', import.meta.url), 'utf8'))
const MODS = data.countries.map((c) => c.modPct ?? 0)

describe('Vier Mark-Spalten (Volumen, Wofür, Graubereich, Belege)', () => {
  it('genau diese vier tragen eine Mark - Tiefe und Verlauf sind aus dem Blatt entfernt', () => {
    expect(MARK_COL_KEYS).toEqual(['c2', 'c3', 'c4', 'c7'])
    expect(COLS.c5).toBeUndefined()
    expect(COLS.c6).toBeUndefined()
    expect(MARK_COL_KEYS.map((k) => COLS[k].label)).toEqual(['Volumen', 'Wofür', 'Graubereich', 'Belege'])
  })

  it('die 283 freigewordenen Pixel liegen in Graubereich, Wofür und der Rinne davor', () => {
    // Vorher: c3 = 300, c4 = 180 (Summe 480). c5 (80 + 12 Rinne) und c6 (179 + 12 Rinne) sind weg.
    expect(COLS.c4.w - 180).toBe(200) // Hauptgewinner: Graubereich mehr als verdoppelt
    expect(COLS.c3.w - 300).toBe(80)
    // die letzten 3 px verbreitern die Rinne vor der Belegwand von 12 auf 15 px: die
    // Abweichungsspalte endet dort, wo Einzelfaelle anfangen, und das darf man sehen
    expect(COLS.c7.x0 - COLS.c4.x1).toBe(15)
    expect(200 + 80 + 3).toBe(283)
    expect(COLS.c3.x1 - COLS.c3.x0).toBe(COLS.c3.w)
    expect(COLS.c4.x1 - COLS.c4.x0).toBe(COLS.c4.w)
  })

  it('Belege bleiben unangetastet und die Sortierköpfe folgen den Spalten', () => {
    expect(COLS_COMPACT.c7).toEqual(COLS.c7)
    expect(sortableFor(COLS)).toEqual(['c1', 'c2', 'c3', 'c4'])
    expect(sortableFor(COLS_COMPACT)).toEqual(['c1', 'c2', 'c3', 'c4'])
  })

  it('keine Spalte ueberlappt eine andere, und keine laeuft aus dem Blatt', () => {
    for (const cols of [COLS, COLS_COMPACT]) {
      const boxes = ['c0', 'c1', 'c2', 'c3', 'c4'].map((k) => cols[k])
      for (let i = 1; i < boxes.length; i++) expect(boxes[i].x0).toBeGreaterThanOrEqual(boxes[i - 1].x1)
      expect(boxes[boxes.length - 1].x1).toBeLessThanOrEqual(cols.c7.x0)
      expect(cols.c7.grayX0 + cols.c7.nGray * cols.c7.slotW).toBeLessThanOrEqual(W)
    }
  })
})

describe('Responsive-Stufe (Spaltenwahl)', () => {
  it('ab 1200 px die volle Aufteilung, darunter gibt Wofür 80 px an Graubereich ab', () => {
    expect(columnsFor(1440)).toBe(COLS)
    expect(columnsFor(RESPONSIVE_MIN)).toBe(COLS)
    expect(columnsFor(RESPONSIVE_MIN - 1)).toBe(COLS_COMPACT)
    expect(columnsFor(980)).toBe(COLS_COMPACT)
    expect(COLS.c3.w - COLS_COMPACT.c3.w).toBe(80)
    expect(COLS_COMPACT.c4.w - COLS.c4.w).toBe(80)
    // rechter Rand und Domaene bleiben gleich: es verschiebt sich die Rinne, nicht die Skala
    expect(COLS_COMPACT.c4.x1).toBe(COLS.c4.x1)
    expect(COLS_COMPACT.c4.max).toBe(COLS.c4.max)
  })

  it('die Graubereich-Aufloesung waechst auf der schmalen Stufe, statt zu schrumpfen', () => {
    // Das Blatt wird bei 980 px auf 74 % skaliert - die Spalte, die auf einzelnen
    // Prozentpunkten unterscheiden muss, bekommt deshalb mehr Grundbreite.
    expect(modScale(COLS_COMPACT).focusPx).toBeGreaterThan(modScale(COLS).focusPx)
    expect(modScale(COLS_COMPACT).focusPx * 0.742).toBeGreaterThan(25)
  })

  it('der Hit-Test folgt der Umverteilung', () => {
    // x 700 liegt in der Vollstufe in der Rinne vor c4 (Toleranz 6 px greift nicht) und in der
    // Kompaktstufe im gewachsenen c4-Bereich noch nicht - dort endet c3 bei 626.
    expect(colAt(660, COLS)).toBe('c3')
    expect(colAt(660, COLS_COMPACT)).toBe('c4')
    expect(colAt(900, COLS)).toBe('c4')
    expect(colAt(900, COLS_COMPACT)).toBe('c4')
  })
})

describe('Graubereich: Fokusskala mit sichtbarem Bruch', () => {
  const s = modScale(COLS)

  it('loest die Masse unter 5 % auf: 1 % und 4 % liegen 90 px auseinander statt 21', () => {
    expect(s.focusPx).toBeCloseTo(30, 10)
    expect(s(4) - s(1)).toBeCloseTo(90, 10)
    // die alte lineare Skala 0..25 auf 180 px schaffte 7,2 px/pp, also 21,6 px
    expect((180 / 25) * 3).toBeCloseTo(21.6, 10)
  })

  it('ist im Fokusbereich exakt linear - dort misst der Abweichungsbalken echte Prozentpunkte', () => {
    for (const [a, b] of [[0, 1], [1, 2], [4, 5], [9, 10]]) {
      expect(s(b) - s(a)).toBeCloseTo(s.focusPx, 10)
    }
    expect(s(0)).toBe(COLS.c4.x0)
    expect(s(MOD_FOCUS)).toBeCloseTo(s.breakLo, 10)
  })

  it('deckt genau die zwei Ausreisser des Datensatzes in den gestauchten Schwanz', () => {
    const tail = MODS.filter((v) => v > MOD_FOCUS)
    expect(tail).toHaveLength(2)
    expect(MODS.filter((v) => v <= MOD_FOCUS)).toHaveLength(51)
    for (const v of tail) expect(s(v)).toBeGreaterThan(s.breakHi)
    // und keiner der 53 Werte landet IN der Luecke - dort ist die Achse nicht
    for (const v of MODS) expect(s(v) > s.breakLo && s(v) < s.breakHi).toBe(false)
  })

  it('der Bruch ist 8 px leer und der Schwanz exakt 6,25× gestaucht', () => {
    expect(s.breakHi - s.breakLo).toBe(MOD_BREAK_W)
    expect(s.focusPx / s.tailPx).toBeCloseTo(MOD_TAIL_SQUEEZE, 10)
    expect(s(MOD_MAX)).toBeCloseTo(COLS.c4.x0 + COLS.c4.w, 10)
  })

  it('klemmt statt zu extrapolieren, auch bei fehlendem Wert', () => {
    expect(s(-5)).toBe(COLS.c4.x0)
    expect(s(999)).toBeCloseTo(s(MOD_MAX), 10)
    expect(s(null)).toBe(COLS.c4.x0)
  })

  it('jede bezifferte Marke sitzt in ihrem Abschnitt, keine in der Luecke', () => {
    expect(MOD_TICKS[0]).toBe(0)
    expect(MOD_TICKS).toContain(MOD_FOCUS)
    expect(MOD_TICKS[MOD_TICKS.length - 1]).toBe(MOD_MAX)
    for (const t of MOD_TICKS) {
      const x = s(t)
      expect(x >= COLS.c4.x0 && x <= COLS.c4.x0 + COLS.c4.w).toBe(true)
      expect(x > s.breakLo && x < s.breakHi).toBe(false)
    }
  })

  it('splitAtBreak laesst die Luecke leer, statt sie zu ueberlaufen', () => {
    const inFocus = splitAtBreak(s(1), s(4), s)
    expect(inFocus).toHaveLength(1)
    // Weltwert 3,8 % bis Israel 24,0 %: zwei Stuecke, dazwischen der Bruch
    const across = splitAtBreak(s(3.8), s(24), s)
    expect(across).toHaveLength(2)
    expect(across[0][1]).toBe(s.breakLo)
    expect(across[1][0]).toBe(s.breakHi)
    // Richtungsunabhaengig, und ein Stueck ganz im Schwanz bleibt eines
    expect(splitAtBreak(s(24), s(3.8), s)).toEqual(across)
    expect(splitAtBreak(s(16.2), s(24), s)).toHaveLength(1)
  })
})

describe('Range-Brush auf c4', () => {
  const s = modScale(COLS)

  it('rechnet Pixel in Datenwerte um, nicht umgekehrt', () => {
    const r = brushRange(COLS.c4.x0, COLS.c4.x0 + 90, COLS)
    expect(r.lo).toBeCloseTo(0, 10)
    expect(r.hi).toBeCloseTo(3, 10) // 90 px / 30 px je pp
  })

  it('ist richtungsunabhaengig: nach links gezogen ist derselbe Bereich', () => {
    const a = brushRange(s(2), s(7), COLS)
    const b = brushRange(s(7), s(2), COLS)
    expect(a).toEqual(b)
    expect(a.lo).toBeCloseTo(2, 10)
    expect(a.hi).toBeCloseTo(7, 10)
  })

  it('kennt den Achsenbruch: ein Zug ueber die Luecke erfindet keine Zwischenwerte', () => {
    const r = brushRange(s(8), s(20), COLS)
    expect(r.lo).toBeCloseTo(8, 10)
    expect(r.hi).toBeCloseTo(20, 10)
    // ein Zug, der NUR in der Luecke liegt, ist kein Bereich
    expect(brushRange(s.breakLo + 1, s.breakHi - 1, COLS)).toBeNull()
    // und ein x mitten in der Luecke liefert die Fokusgrenze, nicht einen erfundenen Wert
    expect(s.invert(s.breakLo + 4)).toBe(MOD_FOCUS)
  })

  it('klemmt auf die Spaltenskala 0 bis 25 - ein Zug ueber den Rand erfindet keine Werte', () => {
    const r = brushRange(COLS.c4.x0 - 400, COLS.c4.x1 + 400, COLS)
    expect(r.lo).toBe(0)
    expect(r.hi).toBe(COLS.c4.max)
  })

  it('ein Klick ist kein Zug: unter der Mindestbreite gibt es keinen Filter', () => {
    expect(brushRange(800, 800, COLS)).toBeNull()
    expect(brushRange(800, 800 + BRUSH_MIN_PX - 0.1, COLS)).toBeNull()
    expect(brushRange(800, 800 + BRUSH_MIN_PX, COLS)).not.toBeNull()
    expect(brushRange(NaN, 800, COLS)).toBeNull()
  })

  it('rechnet auf der Kompaktstufe mit deren eigener Aufloesung', () => {
    const c = modScale(COLS_COMPACT)
    const r = brushRange(c(0), c(3), COLS_COMPACT)
    expect(r.lo).toBeCloseTo(0, 10)
    expect(r.hi).toBeCloseTo(3, 10)
    // dieselben Pixel liefern auf der anderen Stufe einen ANDEREN Bereich - deshalb reist der
    // Filter als Wertebereich weiter und nicht als Pixelbereich
    expect(brushRange(800, 900, COLS_COMPACT).lo).not.toBeCloseTo(brushRange(800, 900, COLS).lo, 3)
  })

  it('inBrush schliesst die Raender ein und laesst ohne Bereich alles durch', () => {
    const r = { lo: 5, hi: 12 }
    expect(inBrush(5, r)).toBe(true)
    expect(inBrush(12, r)).toBe(true)
    expect(inBrush(4.99, r)).toBe(false)
    expect(inBrush(0, null)).toBe(true)
  })
})

// Die Laengenleiter des Lesetischs: Marker-Zahl und Quantilszahlen beginnen an derselben
// x-Position, kollidieren also, sobald ein Beleg nahe an einem Quantil liegt (gemessen: 442
// Zeichen gegen den Median 430 - 1,5 px auseinander, beide Zahlen unlesbar). Geloest wird das
// durch einen Versatz der Marker-Zahl, nicht durch Weglassen der Quantile: der Massstab bleibt
// vollstaendig, verschoben wird Schrift, nie ein Datum.
describe('Längenleiter: die Marker-Zahl weicht dem Quantil aus', () => {
  const Q = [40, 120, 200, 250] // y-Positionen der vier Quantile in viewBox-Einheiten

  it('lässt in Ruhe, was weit genug entfernt ist', () => {
    expect(markerVersatz(80, Q)).toBe(0)
    expect(markerVersatz(160, Q)).toBe(0)
  })

  it('schiebt nach oben, wenn der Marker über dem nächsten Quantil liegt', () => {
    const v = markerVersatz(115, Q) // 5 über dem Quantil bei 120
    expect(v).toBeLessThan(0)
    expect(Math.abs(115 + v - 120)).toBeGreaterThanOrEqual(LABEL_MIN_ABSTAND)
  })

  it('schiebt nach unten, wenn der Marker unter dem nächsten Quantil liegt', () => {
    const v = markerVersatz(126, Q)
    expect(v).toBeGreaterThan(0)
    expect(Math.abs(126 + v - 120)).toBeGreaterThanOrEqual(LABEL_MIN_ABSTAND)
  })

  it('hält nach dem Versatz zu JEDEM Quantil den Mindestabstand - auch bei zwei nahen', () => {
    const eng = [100, 108] // zwei Quantile dicht beieinander
    for (let m = 90; m <= 120; m += 0.5) {
      const y = m + markerVersatz(m, eng)
      const naeher = Math.min(...eng.map((q) => Math.abs(y - q)))
      expect(naeher).toBeGreaterThan(0) // nie exakt auf einem Quantil
    }
  })

  it('bleibt über den ganzen Verlauf im Bild und frei von jedem Quantil', () => {
    // 2.000 Zeichen liegen über p90 (1.995) und damit an der Oberkante: dort wurde die Zahl
    // abgeschnitten, weil der Versatz vom Quantil weg aus der viewBox hinausführte.
    for (let m = 0; m <= 260; m += 0.5) {
      const y = m + markerVersatz(m, Q, 260)
      expect(y).toBeGreaterThanOrEqual(0)
      expect(y).toBeLessThanOrEqual(260)
      expect(Math.min(...Q.map((q) => Math.abs(y - q)))).toBeGreaterThanOrEqual(LABEL_MIN_ABSTAND)
    }
  })
})
