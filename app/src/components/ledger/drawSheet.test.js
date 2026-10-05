// Der Zeichenkern gegen einen aufzeichnenden 2D-Kontext.
//
// Zwei Dinge werden hier zu pruefbaren Aussagen statt zu Behauptungen:
//   1. Das Zeichenbudget aus der Spezifikation ("rund 20 Fills, rund 3.200 Primitive, rund 160
//      fillText") war eine Kostenrechnung. Hier steht die reale Zahl.
//   2. Die verbotenen Kanaele des Akts (globalCompositeOperation, shadowBlur, ctx.filter,
//      Verlaeufe als Flaechenfuellung) werden mechanisch ausgeschlossen: der Stub wirft,
//      sobald einer davon angefasst wird.

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { bucketCats, buildDocIndex, threadCounts, worldMonthShares } from '../../lib/ledger'
import { drawSheet } from './drawSheet'
import {
  COLS, COLS_COMPACT, COMB_GAP, MOD_FOCUS, N_ROWS, W,
  docHeightScale, modScale, rowTop, volumeScale,
} from './geometry'

const data = JSON.parse(readFileSync(new URL('../../../public/data/wildchat.json', import.meta.url), 'utf8'))
const C = data.countries

const FORBIDDEN_PROPS = ['globalCompositeOperation', 'shadowBlur', 'shadowColor', 'filter']
const FORBIDDEN_METHODS = ['createLinearGradient', 'createRadialGradient', 'createConicGradient']

function recordingCtx() {
  const calls = {}
  const bump = (k) => { calls[k] = (calls[k] || 0) + 1 }
  const ctx = {
    calls,
    setTransform: () => bump('setTransform'),
    clearRect: () => bump('clearRect'),
    fillRect: () => bump('fillRect'),
    strokeRect: () => bump('strokeRect'),
    beginPath: () => bump('beginPath'),
    rect: () => bump('rect'),
    moveTo: () => bump('moveTo'),
    lineTo: () => bump('lineTo'),
    arc: () => bump('arc'),
    closePath: () => bump('closePath'),
    fill: () => bump('fill'),
    stroke: () => bump('stroke'),
    fillText: () => bump('fillText'),
    measureText: () => ({ width: 0 }),
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    font: '',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    globalAlpha: 1,
  }
  for (const p of FORBIDDEN_PROPS) {
    Object.defineProperty(ctx, p, {
      get: () => { throw new Error(`verbotener Kanal gelesen: ${p}`) },
      set: () => { throw new Error(`verbotener Kanal gesetzt: ${p}`) },
    })
  }
  for (const m of FORBIDDEN_METHODS) {
    ctx[m] = () => { throw new Error(`verbotener Aufruf: ${m}`) }
  }
  return ctx
}

function buildView({
  sortCol = 'c2', focusCat = null, dimmed = new Set(), hatch = null, hoverCi = null, selCi = null,
  hoverBucket = null, cols = COLS, focusCi = null, brush = null,
} = {}) {
  const shares = worldMonthShares(data)
  const buckets = C.map((c) => bucketCats(c))
  const threads = threadCounts(C)
  const docIndex = buildDocIndex(C)
  const order = C.map((_, i) => i).sort((a, b) => C[b].n - C[a].n)
  const y = new Float32Array(N_ROWS)
  const rankOf = new Int16Array(N_ROWS)
  const combX = new Float32Array(N_ROWS)
  const total = Array.from(threads).reduce((s, v) => s + v, 0)
  const pitch = (W - (N_ROWS - 1) * COMB_GAP) / total
  let x = 0
  order.forEach((ci, r) => {
    y[ci] = rowTop(r)
    rankOf[ci] = r
    combX[ci] = x
    x += threads[ci] * pitch + COMB_GAP
  })
  return {
    countries: C,
    order,
    buckets,
    docsByCountry: docIndex.byCountry,
    threads,
    headHists: { c2: new Array(12).fill(4), c3: new Array(12).fill(4) },
    world: {
      buckets: bucketCats({ cats: data.globalCats }),
      modPct: data.moderation.globalPct,
      avgTurns: 2.33,
      shares,
      n: data.coveredByCentroid,
      total: data.total,
    },
    scales: {
      vol: volumeScale(Math.max(...C.map((c) => c.n))),
      mod: modScale(cols),
      docH: docHeightScale(),
    },
    cols,
    focusCi,
    brush,
    y,
    rankOf,
    combX,
    pitch,
    pulse: new Float32Array(N_ROWS).fill(1),
    pulsing: false,
    hatch,
    focusCat,
    focusValues: focusCat ? C.map((_, ci) => buckets[ci][3]) : null,
    focusColor: focusCat ? '#aa3377' : null,
    dimmed,
    hoverCi,
    selCi,
    hoverBucket,
    sortCol,
    sortDir: 'desc',
    combCaption: 'Testzeile',
    shortOf: C.map((c) => c.country),
    fmt: (v) => String(v),
  }
}

describe('drawSheet zeichnet das Blatt', () => {
  it('läuft ohne verbotene Kanäle durch (kein Composite, kein Shadow, kein Filter, kein Verlauf)', () => {
    const ctx = recordingCtx()
    expect(() => drawSheet(ctx, buildView())).not.toThrow()
  })

  it('hält das Zeichenbudget: unter 60 Fills und unter 220 Textaufrufe', () => {
    const ctx = recordingCtx()
    drawSheet(ctx, buildView())
    const fills = (ctx.calls.fill || 0) + (ctx.calls.stroke || 0) + (ctx.calls.fillRect || 0) + (ctx.calls.strokeRect || 0)
    const prims = (ctx.calls.rect || 0) + (ctx.calls.arc || 0) + (ctx.calls.moveTo || 0) + (ctx.calls.lineTo || 0)
    expect(fills).toBeLessThan(60)
    expect(ctx.calls.fillText).toBeLessThan(220)
    // 53 Ränge + 53 Volumenzahlen + 53 Namen + Kammzeile + Weltzeile + Sortier-Caret
    // + 8 Achsenmarken + 1 Stauchungshinweis + 2 Klartextwerte jenseits des Bruchs
    expect(ctx.calls.fillText).toBeGreaterThan(159)
    // 797 Kammstriche + 53 Volumenbalken + rund 370 Stapelsegmente + 848 Belegstriche
    // + 1.166 Slot-Ticks + 53 Glyphen + Abweichungsbalken
    expect(prims).toBeGreaterThan(3000)
    expect(prims).toBeLessThan(6000)
    // Gemessen (Stand dieser Fassung, vier Mark-Spalten): 3.713 Primitive, 52 Fills,
    // 175 fillText. Vorher (sechs Spalten): 5.242 Primitive, 45 Fills, 165 fillText - die
    // 1.529 Primitive weniger sind die 689 Sparkbars, die 689 Polylinien-Punkte der
    // Weltprofile und die 53 Dotplot-Punkte samt Achsenlinien; die 7 Fills mehr sind die
    // zweiteilige Achse, ihre Marken, das Bruchband mit zwei Kanten und der Bruch-Stroke.
    // Weniger Tinte fuer denselben Befund (Tufte: Data-Ink-Ratio).
  })

  it('Phase 2 (Luminanz-Puls) kostet höchstens acht zusätzliche Alpha-Stufen je Spalte', () => {
    const still = recordingCtx()
    drawSheet(still, buildView({ sortCol: 'c4' }))
    const moving = recordingCtx()
    const v = buildView({ sortCol: 'c4' })
    v.pulsing = true
    v.pulse = new Float32Array(N_ROWS).map((_, i) => (i % 8) / 7)
    drawSheet(moving, v)
    expect(moving.calls.fill - still.calls.fill).toBeLessThanOrEqual(8 * 4)
    expect(moving.calls.rect + moving.calls.arc).toBeCloseTo(still.calls.rect + still.calls.arc, -1)
  })

  it('gefilterte Zeilen kosten einen zweiten Durchlauf, aber keine Höhenänderung', () => {
    const plain = recordingCtx()
    drawSheet(plain, buildView())
    const filtered = recordingCtx()
    drawSheet(filtered, buildView({ dimmed: new Set(C.map((c, i) => i).filter((i) => C[i].n < 5000)) }))
    expect(filtered.calls.fill).toBeGreaterThan(plain.calls.fill)
    // dieselben Primitive, nur auf zwei Luminanzgruppen verteilt: keine Zeile verschwindet
    expect(filtered.calls.rect).toBe(plain.calls.rect)
  })

  it('Encode-Modus ersetzt den Stapel durch EINEN Balken je Zeile', () => {
    const stack = recordingCtx()
    drawSheet(stack, buildView())
    const single = recordingCtx()
    drawSheet(single, buildView({ focusCat: 'Rollenspiel/Story' }))
    expect(single.calls.rect).toBeLessThan(stack.calls.rect)
  })

  it('fehlende Schraffur degradiert zu Vollton statt zu einem Absturz', () => {
    const withPattern = recordingCtx()
    expect(() => drawSheet(withPattern, buildView({ hatch: { pattern: true } }))).not.toThrow()
    const withoutPattern = recordingCtx()
    expect(() => drawSheet(withoutPattern, buildView({ hatch: null }))).not.toThrow()
    expect(withPattern.calls.rect).toBe(withoutPattern.calls.rect)
  })

  it('der im Lesetisch geöffnete Beleg bleibt im Blatt markiert - genau eine Mark, kein FLIP', () => {
    const plain = recordingCtx()
    drawSheet(plain, buildView())
    const withDoc = recordingCtx()
    const v = buildView()
    v.selDocId = '0:s:0' // stabile ID aus buildDocIndex: Land 0, sample 0
    drawSheet(withDoc, v)
    expect(withDoc.calls.fillRect - plain.calls.fillRect).toBe(1)
    expect(withDoc.calls.rect).toBe(plain.calls.rect) // keine zusaetzlichen Primitive
  })

  it('Hover und Selektion fügen nur Bänder hinzu, keine neue Kodierung', () => {
    const plain = recordingCtx()
    drawSheet(plain, buildView())
    const active = recordingCtx()
    drawSheet(active, buildView({ hoverCi: 3, selCi: 7, hoverBucket: 2 }))
    expect(active.calls.fillRect - plain.calls.fillRect).toBe(3) // Hover-Band, Sel-Band, Rail
  })
})

// --- Stufe E ---------------------------------------------------------------

describe('Stufe E: Fokus, Brush, Responsive, Encode', () => {
  it('die fokussierte Zeile ist IM BILD markiert, nicht nur als Button-Outline', () => {
    const plain = recordingCtx()
    drawSheet(plain, buildView())
    const focused = recordingCtx()
    drawSheet(focused, buildView({ focusCi: 11 }))
    // Band, Rail und zwei Kantenlinien - vier Rechtecke, keine einzige neue Mark
    expect(focused.calls.fillRect - plain.calls.fillRect).toBe(4)
    expect(focused.calls.rect).toBe(plain.calls.rect)
    // steht der Fokus auf der GEWAEHLTEN Zeile, bleibt es bei den beiden Kanten:
    // die Selektion hat ihre eigene Rail und wird nicht doppelt gezeichnet
    const both = recordingCtx()
    drawSheet(both, buildView({ focusCi: 11, selCi: 11 }))
    const sel = recordingCtx()
    drawSheet(sel, buildView({ selCi: 11 }))
    expect(both.calls.fillRect - sel.calls.fillRect).toBe(2)
  })

  it('der Range-Brush zeichnet Band und zwei Kanten, aber keine Mark', () => {
    const plain = recordingCtx()
    drawSheet(plain, buildView())
    const brushed = recordingCtx()
    drawSheet(brushed, buildView({ brush: { lo: 4, hi: 12 } }))
    expect(brushed.calls.fillRect - plain.calls.fillRect).toBe(3) // Band + zwei Kanten
    expect(brushed.calls.rect).toBe(plain.calls.rect)
    expect(brushed.calls.fillText - plain.calls.fillText).toBe(2) // beide Grenzwerte beziffert
  })

  it('der Entwurf waehrend des Ziehens kostet dasselbe wie der fertige Bereich, ohne Filter', () => {
    const draft = recordingCtx()
    const v = buildView()
    v.brushDraft = { lo: 4, hi: 12 }
    drawSheet(draft, v)
    const plain = recordingCtx()
    drawSheet(plain, buildView())
    expect(draft.calls.fillRect - plain.calls.fillRect).toBe(2) // nur die Kanten, kein Band
  })

  it('Kompaktstufe: dieselben Marks und dieselben Zahlen, nur umverteilte Breiten', () => {
    const full = recordingCtx()
    drawSheet(full, buildView())
    const compact = recordingCtx()
    expect(() => drawSheet(compact, buildView({ cols: COLS_COMPACT }))).not.toThrow()
    // Seit dem Umbau auf vier Spalten entfaellt unter 1200 px KEINE Spalte mehr: es
    // verschieben sich Breiten, kein Kanal und keine Zahl verschwindet.
    expect(compact.calls.rect).toBe(full.calls.rect)
    expect(compact.calls.arc).toBe(full.calls.arc)
    expect(compact.calls.fillRect).toBe(full.calls.fillRect)
    expect(compact.calls.fillText).toBe(full.calls.fillText)
  })

  it('der Achsenbruch ist im Bild: Lücke, bezifferte Achse, aufgeteilter Balken', () => {
    const ctx = recordingCtx()
    const v = buildView()
    drawSheet(ctx, v)
    const s = v.scales.mod
    // acht bezifferte Marken plus der Stauchungshinweis plus die zwei Klartextwerte
    const tail = C.filter((c) => (c.modPct ?? 0) > MOD_FOCUS)
    expect(tail).toHaveLength(2)
    // die Achse selbst ist zweiteilig (zwei fillRect) und die Luecke ein eigenes Band
    expect(s.breakHi - s.breakLo).toBe(8)
    // der Bruch wird gestrichelt markiert: genau ein stroke-Aufruf fuer die zwei Schraegstriche
    expect(ctx.calls.stroke).toBe(1)
    expect(ctx.calls.moveTo).toBeGreaterThanOrEqual(2)
  })

  it('die Klartextwerte jenseits des Bruchs sind der Preis der Stauchung', () => {
    // Ohne die zwei Laender im Schwanz duerfte auch kein Wert gedruckt werden: der Test haelt
    // fest, dass die Zahl an der Stauchung haengt und nicht an einem festen Index.
    const all = recordingCtx()
    drawSheet(all, buildView())
    const onlyFocus = recordingCtx()
    const v = buildView()
    v.countries = C.map((c) => ({ ...c, modPct: Math.min(c.modPct ?? 0, MOD_FOCUS) }))
    drawSheet(onlyFocus, v)
    const tailCount = C.filter((c) => (c.modPct ?? 0) > MOD_FOCUS).length
    expect(all.calls.fillText - onlyFocus.calls.fillText).toBe(tailCount)
  })
})
