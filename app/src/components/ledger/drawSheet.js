// Akt 4 "Das Register" - der Zeichenkern. Reine Funktionen auf einem 2D-Kontext, kein React.
//
// BATCHING NACH FARBE, NICHT PRO ZELLE: ein Path je Farbe ueber alle 53 Zeilen. Das ergibt
// rund 25 Fills und rund 170 fillText-Aufrufe fuer etwa 3.200 Primitive. Text wird nach Stil
// gruppiert, damit ctx.font pro Frame nur wenige Male gesetzt wird.
//
// VERBOTEN UND HIER NIRGENDS BENUTZT: globalCompositeOperation, shadowBlur, ctx.filter,
// Verlaeufe als Flaechenfuellung, heat()/viridis, Glow, Partikel. Tiefe entsteht ausschliesslich
// aus Luminanz und Textur (Tufte: Data-Ink-Ratio, kein Chartjunk).

import { CAT_BUCKET, PAL } from '../../theme'
import {
  AXIS_Y, BAR_H, BAR_Y, BASE_Y, COLS as COLS_FULL, COMB_CAP_Y, COMB_H, COMB_Y,
  H, HEAD_RULE_Y, HIST_BINS, HIST_H, HIST_W, HIST_Y, MOD_FOCUS, MOD_TAIL_SQUEEZE, MOD_TICKS,
  N_ROWS, ROWS_Y0, ROW_H, W, WORLD_Y, slotX, splitAtBreak,
} from './geometry'

/**
 * Der Spaltensatz der aktuellen Responsive-Stufe. Jede Zeichenfunktion holt ihn sich als
 * lokales `COLS`, damit im Rumpf nichts umgeschrieben werden muss und es unmoeglich ist,
 * versehentlich zwei Spaltensaetze in einem Frame zu mischen (Canvas und Hit-Test lesen
 * beide aus derselben Quelle, sonst laegen Zeichnung und Trefferflaeche auseinander).
 */
const colsOf = (v) => v.cols || COLS_FULL

const MONO = "'IBM Plex Mono', ui-monospace, monospace"
const SANS = "'Hanken Grotesk', system-ui, sans-serif"

/** rgba-Variante eines Hex-Tokens. Keine neuen Farbwerte, nur Luminanz-/Alpha-Stufen. */
export function rgba(token, a) {
  const m = String(token).match(/^#?([0-9a-f]{6})$/i)
  if (m) {
    const num = parseInt(m[1], 16)
    return `rgba(${(num >> 16) & 255},${(num >> 8) & 255},${num & 255},${a})`
  }
  const rgb = String(token).match(/rgba?\(([^)]+)\)/)
  if (rgb) {
    const [r, g, b] = rgb[1].split(',').map((v) => v.trim())
    return `rgba(${r},${g},${b},${a})`
  }
  return token
}

// Luminanz statt Alarmfarbe (Ware: Luminanz-Popout ist auf dunklem Grund preattentiv am staerksten).
const DIM = 0.18 // gefiltert / nicht fokussiert
const DEV_ABOVE = 0.85 // Abweichungsbalken rechts der Weltlinie: volle Luminanz
const DEV_BELOW = 0.38 // links der Weltlinie: 45 % davon
const ZEBRA = 'rgba(236,232,225,0.025)'
const HOVER_BAND = 'rgba(236,232,225,0.055)'
const SEL_BAND = 'rgba(214,64,159,0.10)'
const FOCUS_BAND = 'rgba(214,64,159,0.07)'
const RASTER = 'rgba(236,232,225,0.10)'
const BRUSH_BAND = 'rgba(236,232,225,0.05)'
const BREAK_BAND = 'rgba(236,232,225,0.05)' // die leere Luecke des Achsenbruchs in c4
const BREAK_EDGE = 'rgba(236,232,225,0.16)' // ihre beiden Kanten

// Kopfzone der Graubereich-Achse: Marken 63..67, Achsenlinie 67, Bezifferung Grundlinie 61,
// Stauchungshinweis Grundlinie 77. Alles zwischen HIST-Band (58..68) und WORLD_Y (80).
const MOD_AXIS_Y = 67
const MOD_TICK_H = 4
const MOD_LABEL_BASE = 61
const MOD_HINT_BASE = 77

/**
 * 6x6-Schraffur fuer das Segment "Sonstiges".
 * Unsicherheit gehoert in die Tinte, nicht in die Fussnote (Cairo). In Device-Pixeln gebaut und
 * per Pattern-Transform zurueckskaliert, damit sie auf 1x wie auf 2x 6 CSS-px misst.
 */
export function makeHatch(ctx, dpr) {
  try {
    const size = 6
    const off = document.createElement('canvas')
    off.width = size * dpr
    off.height = size * dpr
    const c = off.getContext('2d')
    if (!c) return null
    c.scale(dpr, dpr)
    c.fillStyle = CAT_BUCKET[0].color
    c.fillRect(0, 0, size, size)
    c.strokeStyle = 'rgba(11,10,12,0.85)'
    c.lineWidth = 1.4
    c.beginPath()
    c.moveTo(-1, 5); c.lineTo(5, -1)
    c.moveTo(2, 8); c.lineTo(8, 2)
    c.stroke()
    const pat = ctx.createPattern(off, 'repeat')
    if (pat && typeof DOMMatrix === 'function' && pat.setTransform) {
      pat.setTransform(new DOMMatrix([1 / dpr, 0, 0, 1 / dpr, 0, 0]))
    }
    return pat
  } catch {
    return null // Fallback: Vollton, der Legendenhinweis bleibt trotzdem im Bild
  }
}

// ---------------------------------------------------------------------------
// Kopfband: der Einheiten-Kamm
// ---------------------------------------------------------------------------

/**
 * 797 Striche in 53 Segmenten in der AKTUELLEN Sortierreihenfolge.
 * Zugleich Lineal, Ehrlichkeits-Objekt und Sortier-Indikator: beim Umsortieren kaemmt sich das
 * Band sichtbar um, Seriation auf einen Blick. Float-Koordinaten sind gewollt, das Antialiasing
 * erzeugt den Kamm-Eindruck.
 */
export function drawComb(ctx, v) {
  const { threads, combX, pitch, hoverCi, selCi } = v
  ctx.fillStyle = rgba(PAL.human, 0.7)
  ctx.beginPath()
  for (let ci = 0; ci < threads.length; ci++) {
    if (ci === hoverCi || ci === selCi) continue
    const x0 = combX[ci]
    for (let j = 0; j < threads[ci]; j++) ctx.rect(x0 + j * pitch, COMB_Y, pitch - 0.55, COMB_H)
  }
  ctx.fill()
  // CONNECT: das Segment des fokussierten Landes leuchtet auf voller Luminanz auf.
  for (const ci of [hoverCi, selCi]) {
    if (ci == null || ci < 0) continue
    ctx.fillStyle = ci === selCi ? PAL.machine : PAL.human
    ctx.beginPath()
    for (let j = 0; j < threads[ci]; j++) ctx.rect(combX[ci] + j * pitch, COMB_Y, pitch - 0.55, COMB_H)
    ctx.fill()
  }
}

// ---------------------------------------------------------------------------
// Spaltenkoepfe: Mikro-Histogramme
// ---------------------------------------------------------------------------

/**
 * 40x10 px, 12 Bins, je Sortierspalte die Verteilung dieses Attributs ueber die 53 Laender.
 * Der Kopf traegt selbst Daten (Munzner: Kopfzeile als Uebersicht, nicht als Etikett).
 * In der Graubereich-Spalte steht an dieser Stelle stattdessen die bezifferte Achse: eine
 * gebrochene Skala MUSS dekodierbar sein, und zwei verschiedene x-Skalen (40-px-Histogramm
 * und Spaltenachse) direkt uebereinander waeren genau die Verwechslung, die sie erzeugt.
 * Die Verteilung selbst steht darunter als 53 Glyphen auf ebendieser Achse.
 */
export function drawHeadHistograms(ctx, v) {
  const { headHists, sortCol, sortDir } = v
  const COLS = colsOf(v)
  const bw = HIST_W / HIST_BINS
  for (const [key, bins] of Object.entries(headHists)) {
    const col = COLS[key]
    if (!col || !bins) continue
    const max = Math.max(1, ...bins)
    ctx.fillStyle = rgba(PAL.ink, key === sortCol ? 0.5 : 0.24)
    ctx.beginPath()
    for (let i = 0; i < bins.length; i++) {
      const h = (bins[i] / max) * HIST_H
      if (h > 0) ctx.rect(col.x0 + i * bw, HIST_Y + HIST_H - h, bw - 0.6, h)
    }
    ctx.fill()
    ctx.fillStyle = rgba(PAL.ink, 0.14)
    ctx.fillRect(col.x0, HIST_Y + HIST_H, HIST_W, 0.8)
  }
  // Aktive Sortierspalte: 2 px Unterstrich in PAL.machine (Selektion, nie Kategorie).
  const active = COLS[sortCol]
  if (active) {
    ctx.fillStyle = PAL.machine
    const width = sortCol === 'c7' ? 60 : Math.min(140, (active.x1 || active.x0 + 60) - active.x0)
    ctx.fillRect(active.x0, HEAD_RULE_Y, width, 2)
    ctx.font = `700 8px ${MONO}`
    ctx.textAlign = 'left'
    ctx.fillText(sortDir === 'desc' ? '▼' : '▲', active.x0 + width + 4, HEAD_RULE_Y + 2)
  }
}

/**
 * DIE ACHSE DER GRAUBEREICH-SPALTE, im Kopf beziffert.
 *
 * Sie ist der Grund, warum die gestauchte Skala kein Lie Factor ist: die Marken 0 1 2 5 10 und
 * 15 20 25 stehen im Bild, zwischen 10 und 15 klafft die leere Luecke, und rechts vom Bruch
 * steht der Stauchungsfaktor im Klartext. Wer 1 % von 4 % unterscheiden will, liest 90 px
 * Abstand; wer wissen will, was rechts des Bruchs passiert, findet die Zahl daneben.
 */
export function drawModAxis(ctx, v) {
  const s = v.scales.mod
  const COLS = colsOf(v)
  const c = COLS.c4
  const x1 = c.x0 + c.w

  // Zwei Pfade, zwei Luminanzstufen - nicht zehn Einzelfills (Batching-Regel dieses Moduls).
  ctx.fillStyle = rgba(PAL.ink, 0.28)
  ctx.beginPath()
  ctx.rect(c.x0, MOD_AXIS_Y, s.breakLo - c.x0, 0.9)
  ctx.rect(s.breakHi, MOD_AXIS_Y, x1 - s.breakHi, 0.9)
  ctx.fill()
  ctx.fillStyle = rgba(PAL.ink, 0.34)
  ctx.beginPath()
  for (const t of MOD_TICKS) ctx.rect(s(t) - 0.5, MOD_AXIS_Y - MOD_TICK_H, 1, MOD_TICK_H)
  ctx.fill()

  ctx.font = `500 7px ${MONO}`
  ctx.fillStyle = PAL.muted
  const last = MOD_TICKS[MOD_TICKS.length - 1]
  for (const t of MOD_TICKS) {
    const x = s(t)
    // Die beiden Marken am Bruch weichen nach innen aus, damit die Luecke auch in der
    // Bezifferung eine Luecke ist und nicht von zwei zentrierten Zahlen zugedeckt wird.
    ctx.textAlign = t === 0 ? 'left' : (t === MOD_FOCUS || t === last) ? 'right' : 'center'
    // Die Einheit steht an der Null, nicht am Ende: am rechten Rand stehen 20 und 25 nur 24 px
    // auseinander, ein angehaengtes "%" wuerde die letzte Marke in die vorletzte schieben.
    ctx.fillText(t === 0 ? '0 %' : String(t), t === MOD_FOCUS ? x - 1 : x, MOD_LABEL_BASE)
  }

  // Der Bruch selbst: zwei Schraegstriche in der Luecke, damit auch ohne die Zahlen sichtbar
  // ist, dass die Achse hier NICHT weiterlaeuft.
  ctx.strokeStyle = rgba(PAL.ink, 0.45)
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(s.breakLo + 1, MOD_AXIS_Y + 3); ctx.lineTo(s.breakLo + 5, MOD_AXIS_Y - 5)
  ctx.moveTo(s.breakLo + 4, MOD_AXIS_Y + 3); ctx.lineTo(s.breakHi, MOD_AXIS_Y - 5)
  ctx.stroke()

  ctx.font = `500 7px ${MONO}`
  ctx.textAlign = 'left'
  ctx.fillStyle = PAL.muted
  ctx.fillText(`${v.fmt(MOD_TAIL_SQUEEZE, 2)}× gestaucht`, s.breakHi + 3, MOD_HINT_BASE)
}

// ---------------------------------------------------------------------------
// Eine Zeile (Welt oder Land) - alle Marks liegen auf denselben x-Konstanten
// ---------------------------------------------------------------------------

function glyphPath(ctx, form, x, cy) {
  if (form === 'triangle') { ctx.moveTo(x, cy - 3.6); ctx.lineTo(x - 3.4, cy + 2.6); ctx.lineTo(x + 3.4, cy + 2.6); ctx.closePath() }
  else if (form === 'square') ctx.rect(x - 2.7, cy - 2.7, 5.4, 5.4)
  else if (form === 'circle') { ctx.moveTo(x + 3, cy); ctx.arc(x, cy, 3, 0, Math.PI * 2) }
  else ctx.rect(x - 3.6, cy - 0.75, 7.2, 1.5)
}

export const GLYPH_FORM = { violence: 'triangle', sexual: 'square', harassment: 'circle' }
export const GLYPH_ORDER = ['triangle', 'square', 'circle', 'dash']
const formOf = (modTop) => GLYPH_FORM[modTop] || 'dash'

const PULSE_STEPS = 8

/**
 * Phase 2 der Sortier-Transition: NUR Luminanz, und nur in der neu sortierten Spalte.
 * Farbe und Position bewegen sich nie gleichzeitig - genau der empirische Befund von
 * Heer & Robertson (InfoVis 2007). Statt 53 Einzelfills genuegen 8 quantisierte Alpha-Stufen;
 * im Ruhezustand bleibt es bei genau einem Path je Farbe.
 */
function pulseBands(list, pulse, active) {
  if (!active || !pulse) return [[list, 1]]
  const bands = Array.from({ length: PULSE_STEPS }, () => [])
  for (const ci of list) bands[Math.round(pulse[ci] * (PULSE_STEPS - 1))].push(ci)
  return bands
    .map((g, i) => [g, 0.55 + 0.45 * (i / (PULSE_STEPS - 1))])
    .filter(([g]) => g.length)
}

/**
 * Zeichnet eine Teilmenge der Zeilen mit EINER gemeinsamen Grundluminanz.
 * Zwei Durchlaeufe (gefiltert / aktiv) statt Alpha pro Zelle: das haelt die Zahl der Fills klein
 * und das Blatt bleibt bei aktivem Filter gleich hoch (kein Scroll-Sprung, Reparatur von S4).
 */
export function drawRows(ctx, v, list, alpha) {
  if (!list.length) return
  const { countries, y, buckets, scales, world, hatch, focusCat, hoverBucket, pulse, pulsing, sortCol, docsByCountry } = v
  const COLS = colsOf(v)
  const bandsFor = (key) => pulseBands(list, pulse, pulsing && sortCol === key)
  ctx.globalAlpha = alpha

  // --- c2 Volumen: Laenge, gemeinsamer Nullpunkt, LINEAR (Cleveland & McGill Rang 2) ---
  for (const [grp, a] of bandsFor('c2')) {
    ctx.globalAlpha = alpha * a
    ctx.fillStyle = rgba(PAL.human, 0.9)
    ctx.beginPath()
    for (const ci of grp) {
      const wpx = scales.vol(countries[ci].n) - COLS.c2.x0
      ctx.rect(COLS.c2.x0, y[ci] + BAR_Y, wpx, BAR_H)
    }
    ctx.fill()
  }
  ctx.globalAlpha = alpha
  ctx.fillStyle = rgba(PAL.ink, 0.3)
  ctx.beginPath()
  for (const ci of list) ctx.rect(COLS.c2.x0, y[ci] + BAR_Y, 1, BAR_H) // Nullmarke in JEDER Zeile
  ctx.fill()

  // --- c3 Wofuer -----------------------------------------------------------
  if (focusCat) {
    // ENCODE (Yi): der 100-%-Stapel wird zu EINEM links ausgerichteten Balken auf gemeinsamer
    // Skala 0..80 %. Genau dann, wenn Praezision gebraucht wird, verschwindet die bekannte
    // Schwaeche des Stapels (kein gemeinsamer Nullpunkt fuer mittlere Segmente).
    // Eine der drei Rest-Kategorien bekommt hier ihre eigene CAT_COLOR zurueck (encode-on-demand)
    // - damit sind alle 9 Kategorien filterbar, nicht nur die 6 mit eigenem Segment.
    ctx.fillStyle = rgba(PAL.ink, 0.16)
    ctx.beginPath()
    for (const ci of list) ctx.rect(COLS.c3.x0, y[ci] + BAR_Y + BAR_H - 1, COLS.c3.w, 1)
    ctx.fill()
    for (const [grp, a] of bandsFor('c3')) {
      ctx.globalAlpha = alpha * a
      ctx.fillStyle = v.focusColor || PAL.human
      ctx.beginPath()
      for (const ci of grp) ctx.rect(COLS.c3.x0, y[ci] + BAR_Y, (v.focusValues[ci] / 80) * COLS.c3.w, BAR_H)
      ctx.fill()
    }
  } else {
    // 100-%-Stapel, 7 Segmente in FIXER Reihenfolge, in jeder Zeile identisch.
    // CONNECT: liegt der Zeiger auf einem Segment, bleibt dieselbe Kategorie in allen 53 Zeilen
    // hell und der Rest faellt auf Alpha 0,18 - der Stapel wird fuer einen Moment vergleichbar.
    for (let b = 0; b < CAT_BUCKET.length; b++) {
      const dimmed = hoverBucket != null && hoverBucket !== b
      for (const [grp, a] of bandsFor('c3')) {
        ctx.globalAlpha = alpha * a * (dimmed ? DIM : 1)
        ctx.fillStyle = b === 0 && hatch ? hatch : CAT_BUCKET[b].color
        ctx.beginPath()
        for (const ci of grp) {
          const seg = buckets[ci]
          let off = 0
          for (let k = 0; k < b; k++) off += seg[k]
          const wpx = (seg[b] / 100) * COLS.c3.w
          if (wpx > 0.02) ctx.rect(COLS.c3.x0 + (off / 100) * COLS.c3.w, y[ci] + BAR_Y, wpx, BAR_H)
        }
        ctx.fill()
      }
    }
  }
  ctx.globalAlpha = alpha

  // --- c4 Graubereich: Abweichungsbalken (Laenge) + Glyphe (Form) ----------
  // Im Fokusbereich 0..10 % ist die Skala linear, der Balken misst dort also echte
  // Prozentpunkte (Lie Factor 1). Ueber den Achsenbruch laeuft er NICHT hinweg: splitAtBreak
  // laesst die Luecke leer, der Balken sagt selbst, dass die Achse dort unterbrochen ist.
  const wx = scales.mod(world.modPct)
  for (const [above, a] of [[true, DEV_ABOVE], [false, DEV_BELOW]]) {
    ctx.fillStyle = rgba(PAL.ink, a)
    ctx.beginPath()
    for (const ci of list) {
      const val = countries[ci].modPct ?? 0
      if ((val >= world.modPct) !== above) continue
      const x = scales.mod(val)
      for (const [sx, ex] of splitAtBreak(x, wx, scales.mod)) ctx.rect(sx, y[ci] + AXIS_Y - 1, ex - sx, 2)
    }
    ctx.fill()
  }
  // modTop ist nominal mit 4 Auspraegungen -> Kanal FORM (Munzner Kap. 5), CVD-sicher und
  // ohne Farbbudget. Ein moralischer Hue waere hier expressiveness-widrig: theta ist gesetzt.
  for (const form of GLYPH_ORDER) {
    for (const [grp, a] of bandsFor('c4')) {
      ctx.beginPath()
      let any = false
      for (const ci of grp) {
        if (formOf(countries[ci].modTop) !== form) continue
        any = true
        glyphPath(ctx, form, scales.mod(countries[ci].modPct ?? 0), y[ci] + AXIS_Y)
      }
      if (any) {
        ctx.globalAlpha = alpha * a
        ctx.fillStyle = rgba(PAL.ink, 0.88)
        ctx.fill()
      }
    }
  }
  ctx.globalAlpha = alpha

  // Die beiden Laender JENSEITS des Bruchs tragen ihre Zahl im Klartext neben der Glyphe.
  // Genau dort ist die Position gestaucht, also steht dort der exakte Wert - das ist der
  // Preis der Stauchung, und er wird im Bild bezahlt, nicht in der Fussnote.
  ctx.font = `500 8px ${MONO}`
  ctx.textAlign = 'right'
  ctx.fillStyle = rgba(PAL.ink, 0.8)
  for (const ci of list) {
    const val = countries[ci].modPct ?? 0
    if (val <= MOD_FOCUS) continue
    ctx.fillText(`${v.fmt(val, 1)} %`, scales.mod(val) - 6, y[ci] + 9)
  }
  ctx.textAlign = 'left'

  // --- c7 Belege: 1 Mark = 1 Dokument, feste Slots, sichtbares Raster -----
  ctx.fillStyle = RASTER
  ctx.beginPath()
  for (const ci of list) {
    const base = y[ci] + BASE_Y
    for (let j = 0; j < COLS.c7.nSample; j++) ctx.rect(slotX('s', j), base, COLS.c7.slotW - 1.2, 1)
    for (let j = 0; j < COLS.c7.nGray; j++) ctx.rect(slotX('g', j), base, COLS.c7.slotW - 1.2, 1)
  }
  ctx.fill()
  for (const kind of ['s', 'g']) {
    ctx.fillStyle = kind === 's' ? rgba(PAL.human, 0.95) : rgba(PAL.human, 0.5)
    ctx.beginPath()
    for (const ci of list) {
      const base = y[ci] + BASE_Y
      for (const doc of docsByCountry[ci]) {
        if (doc.kind !== kind) continue
        const h = scales.docH(doc.len)
        ctx.rect(slotX(kind, doc.i) + 2.85, base - h, 3, h)
      }
    }
    ctx.fill()
  }
  ctx.fillStyle = rgba(PAL.ink, 0.75)
  ctx.beginPath()
  for (const ci of list) {
    const base = y[ci] + BASE_Y
    for (const doc of docsByCountry[ci]) {
      if (doc.kind !== 'g') continue
      const h = scales.docH(doc.len)
      ctx.rect(slotX('g', doc.i) + 2.35, base - h - 2, 4, 2) // Kopf-Tick: Graubereich-Beleg
    }
  }
  ctx.fill()

  // Der im Lesetisch geoeffnete Beleg bleibt hier magenta stehen. Das ersetzt bewusst ein FLIP
  // ueber die Canvas-DOM-Grenze (hoechstes Jank-Risiko, liefert einen Effekt statt eines Kanals):
  // der Ursprung des zweiten Bildes bleibt im ersten sichtbar. Magenta = Selektion, nie Kategorie.
  if (v.selDocId) {
    for (const ci of list) {
      const hit = docsByCountry[ci].find((d) => d.id === v.selDocId)
      if (!hit) continue
      const h = scales.docH(hit.len)
      ctx.fillStyle = PAL.machine
      ctx.fillRect(slotX(hit.kind, hit.i) + 2.35, y[ci] + BASE_Y - h - 3, 4, h + 3)
    }
  }
  ctx.globalAlpha = 1
}

/** Zahlen und Namen. Nach Stil gruppiert, damit ctx.font pro Frame dreimal gesetzt wird. */
export function drawRowText(ctx, v, list, alpha) {
  const { countries, y, rankOf, selCi, fmt } = v
  const COLS = colsOf(v)
  ctx.globalAlpha = alpha
  ctx.textBaseline = 'alphabetic'

  ctx.font = `500 9.5px ${MONO}`
  ctx.textAlign = 'right'
  ctx.fillStyle = PAL.muted
  for (const ci of list) ctx.fillText(String(rankOf[ci] + 1), COLS.c0.x1, y[ci] + 15)
  ctx.fillStyle = rgba(PAL.ink, 0.72)
  for (const ci of list) ctx.fillText(fmt(countries[ci].n), COLS.c2.numX, y[ci] + 15)

  ctx.font = `500 12px ${SANS}`
  ctx.textAlign = 'left'
  ctx.fillStyle = PAL.ink
  for (const ci of list) {
    if (ci === selCi) continue
    ctx.fillText(v.shortOf[ci], COLS.c1.x0, y[ci] + 15)
  }
  if (selCi != null && list.includes(selCi)) {
    ctx.fillStyle = PAL.machine
    ctx.fillText(v.shortOf[selCi], COLS.c1.x0, y[selCi] + 15)
  }
  ctx.globalAlpha = 1
}

// ---------------------------------------------------------------------------
// Referenzzeile WELT
// ---------------------------------------------------------------------------

/**
 * Gleiche x-Konstanten, gleiche Skalen. Jede Laenderabweichung liest sich dadurch als
 * KANTENVERSATZ gegen eine Referenz, nicht als Farbnuance (Ware: Gestalt-Kontinuitaet).
 */
export function drawWorldRow(ctx, v) {
  const { world, scales, hatch, fmt } = v
  const COLS = colsOf(v)
  const top = WORLD_Y
  ctx.fillStyle = rgba(PAL.human, 0.05)
  ctx.fillRect(0, top, W, ROW_H)

  ctx.font = `700 9.5px ${MONO}`
  ctx.textAlign = 'left'
  ctx.fillStyle = PAL.human
  ctx.fillText('WELT', COLS.c1.x0, top + 15)

  // c2: die Summe ist NICHT auf der Laenderskala. Deshalb nur Kontur statt Flaeche - eine
  // gefuellte 100-px-Flaeche neben dem gefuellten 100-px-Balken der USA waere ein Lie Factor.
  ctx.strokeStyle = rgba(PAL.human, 0.8)
  ctx.lineWidth = 1
  ctx.strokeRect(COLS.c2.x0 + 0.5, top + BAR_Y + 0.5, COLS.c2.barW - 1, BAR_H - 1)
  ctx.font = `500 9.5px ${MONO}`
  ctx.textAlign = 'right'
  ctx.fillStyle = rgba(PAL.human, 0.9)
  ctx.fillText(`Σ ${fmt(world.n)}`, COLS.c2.numX, top + 15)

  // c3: der Weltstapel, gegen den jede Zeile gelesen wird
  let off = 0
  for (let b = 0; b < CAT_BUCKET.length; b++) {
    ctx.fillStyle = b === 0 && hatch ? hatch : CAT_BUCKET[b].color
    ctx.fillRect(COLS.c3.x0 + (off / 100) * COLS.c3.w, top + BAR_Y, (world.buckets[b] / 100) * COLS.c3.w, BAR_H)
    off += world.buckets[b]
  }

  // c4: die Referenzmarke, aus der die durchgehende Weltlinie nach unten laeuft
  ctx.fillStyle = PAL.human
  ctx.fillRect(scales.mod(world.modPct) - 0.5, top + BAR_Y, 1, BAR_H)

  // c7 bleibt in der Weltzeile LEER, und das steht auch dort: Belege sind Einzelfaelle, die
  // je Land mitgeliefert wurden. Eine Weltmarke waere hier eine Summe, die nichts messen wuerde.
  ctx.font = `500 8px ${MONO}`
  ctx.textAlign = 'left'
  ctx.fillStyle = PAL.muted
  ctx.fillText('keine Weltmarke: Belege sind Einzelfälle', COLS.c7.x0, top + BASE_Y)
}

// ---------------------------------------------------------------------------
// Gesamtbild
// ---------------------------------------------------------------------------

export function drawSheet(ctx, v) {
  const COLS = colsOf(v)
  ctx.clearRect(0, 0, W, H)
  ctx.textBaseline = 'alphabetic'

  // Zebra alle 5 Zeilen. Keine Zeilentrennlinien (Tufte: Data-Ink-Ratio).
  ctx.fillStyle = ZEBRA
  for (let r = 0; r < N_ROWS; r += 5) ctx.fillRect(0, ROWS_Y0 + r * ROW_H, W, ROW_H)

  // Der gebrushte Bereich liegt UNTER den Marks: er ist Kontext, keine Mark. Er beginnt erst
  // bei der ersten Laenderzeile - gefiltert werden die 53 Laender, nicht die Weltreferenz.
  if (v.brush) {
    const bx0 = v.scales.mod(v.brush.lo)
    const bx1 = v.scales.mod(v.brush.hi)
    ctx.fillStyle = BRUSH_BAND
    ctx.fillRect(bx0, ROWS_Y0, bx1 - bx0, H - ROWS_Y0)
  }

  // Baender fuer Hover und Selektion liegen unter den Marks, damit nichts verdeckt wird.
  if (v.hoverCi != null && v.hoverCi >= 0) {
    ctx.fillStyle = HOVER_BAND
    ctx.fillRect(0, v.y[v.hoverCi], W, ROW_H)
  }
  if (v.selCi != null && v.selCi >= 0) {
    ctx.fillStyle = SEL_BAND
    ctx.fillRect(0, v.y[v.selCi], W, ROW_H)
    ctx.fillStyle = PAL.machine // 3 px Rail bei x 0..3, Selektion ist IMMER Magenta, nie Kategorie
    ctx.fillRect(COLS.rail.x0, v.y[v.selCi], COLS.rail.x1, ROW_H)
  }

  // Der Achsenbruch der Graubereich-Spalte als leere Luecke durch alle Zeilen. Er liegt UNTER
  // den Marks (Kontext, keine Mark) und ist genau so breit wie in der Skala definiert. Die zwei
  // Kanten sind Ink, nicht Teal: die durchgehende Weltlinie ist eine Referenz, das hier eine
  // Unterbrechung - zwei verschiedene Aussagen duerfen nicht gleich aussehen.
  const mb = v.scales.mod
  ctx.fillStyle = BREAK_BAND
  ctx.fillRect(mb.breakLo, WORLD_Y, mb.breakHi - mb.breakLo, H - WORLD_Y)
  ctx.fillStyle = BREAK_EDGE
  ctx.beginPath()
  ctx.rect(mb.breakLo, WORLD_Y, 0.8, H - WORLD_Y)
  ctx.rect(mb.breakHi - 0.8, WORLD_Y, 0.8, H - WORLD_Y)
  ctx.fill()

  drawComb(ctx, v)
  drawCombCaption(ctx, v)
  drawHeadHistograms(ctx, v)
  drawModAxis(ctx, v)
  drawWorldRow(ctx, v)

  // Die ununterbrochene Weltlinie bei 3,8 % laeuft durch ALLE 53 Zeilen und die Weltzeile.
  // Ware: eine durchgehende Vertikale erzeugt Gestalt-Kontinuitaet, die Abweichung wird ohne
  // Rechnen lesbar.
  ctx.fillStyle = rgba(PAL.human, 0.85)
  ctx.fillRect(v.scales.mod(v.world.modPct) - 0.5, WORLD_Y, 1, H - WORLD_Y)

  const dim = []
  const on = []
  for (const ci of v.order) (v.dimmed.has(ci) ? dim : on).push(ci)
  if (dim.length) { drawRows(ctx, v, dim, DIM); drawRowText(ctx, v, dim, DIM) }
  drawRows(ctx, v, on, 1)
  drawRowText(ctx, v, on, 1)

  drawBrush(ctx, v)
  drawFocusRow(ctx, v)
}

/**
 * FOKUS-RAIL: die per Tastatur fokussierte Zeile ist auch IM BILD markiert, nicht nur als
 * Outline eines transparenten Buttons. Ohne das haette die Tastaturbedienung eine andere
 * Rueckmeldung als die Maus - und die Tastaturkette ist in diesem Akt Abnahmebedingung,
 * keine Politur. Magenta ist hier zulaessig und korrekt: Selektion UND Fokus, nie Kategorie.
 * Der Fokus bekommt 2 px Rail und zwei Kantenlinien, die Selektion 3 px Rail und ein Band -
 * beide Zustaende bleiben nebeneinander unterscheidbar.
 */
export function drawFocusRow(ctx, v) {
  const ci = v.focusCi
  if (ci == null || ci < 0) return
  const COLS = colsOf(v)
  const top = v.y[ci]
  if (ci !== v.selCi) {
    ctx.fillStyle = FOCUS_BAND
    ctx.fillRect(0, top, W, ROW_H)
    ctx.fillStyle = PAL.machine
    ctx.fillRect(COLS.rail.x0, top, 2, ROW_H)
  }
  ctx.fillStyle = rgba(PAL.machine, 0.55)
  ctx.fillRect(0, top, W, 1)
  ctx.fillRect(0, top + ROW_H - 1, W, 1)
}

/**
 * FILTER (Yi) als Range-Brush auf c4: die Raender des Bereichs sind 1 px Magenta-Regeln mit
 * ihren Zahlen, die Flaeche selbst bleibt neutral. Magenta darf hier keine Flaeche in einer
 * Mark-Spalte werden - das kollidierte mit CAT[3] #aa3377 im Stapel nebenan.
 */
export function drawBrush(ctx, v) {
  const b = v.brush || v.brushDraft
  if (!b) return
  const x0 = v.scales.mod(b.lo)
  const x1 = v.scales.mod(b.hi)
  ctx.fillStyle = rgba(PAL.machine, v.brush ? 0.9 : 0.5)
  ctx.fillRect(x0 - 0.5, ROWS_Y0, 1, H - ROWS_Y0)
  ctx.fillRect(x1 - 0.5, ROWS_Y0, 1, H - ROWS_Y0)
  // Die beiden Grenzen stehen als Zahl in der Rinne zwischen Weltzeile und erster Zeile -
  // ein Bereichsfilter, dessen Grenzen man nur schaetzen kann, waere kein Werkzeug.
  ctx.font = `500 8.5px ${MONO}`
  ctx.fillStyle = PAL.machine
  ctx.textAlign = 'left'
  ctx.fillText(`${v.fmt(b.lo, 1)} %`, x0 + 2, ROWS_Y0 - 2)
  ctx.textAlign = 'right'
  ctx.fillText(`${v.fmt(b.hi, 1)} %`, x1 - 2, ROWS_Y0 - 2)
}

/** Anspruch bewusst bescheiden: der Kamm ist ein Lineal, keine Aufforderung, 797 Striche zu zaehlen. */
export function drawCombCaption(ctx, v) {
  ctx.font = `500 10px ${MONO}`
  ctx.textAlign = 'left'
  ctx.fillStyle = PAL.muted
  ctx.fillText(v.combCaption, 0, COMB_CAP_Y)
}
