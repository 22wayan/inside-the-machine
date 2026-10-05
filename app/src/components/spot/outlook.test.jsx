// Test des Abschlusses (Akt 5): der Video-Befund und seine Grafik.
//
// Dieser Abschnitt macht eine ANGREIFBARE Aussage ueber die Zukunft, deshalb pruefen diese Tests
// vor allem Ehrlichkeit, nicht Optik:
//   - jede Zahl in der Bildunterschrift muss aus spot.json stammen, keine im JSX eingebackene;
//   - halfMonth muss der nachgerechnete Download-gewichtete Median sein (sonst luegt die Kernzahl);
//   - die Stabilitaets- und Sensitivitaetsangaben muessen zu den Daten passen, weil der Text sie
//     als Beleg auffuehrt;
//   - der Erfassungsbruch des Zensus muss im Bild stehen, nicht nur im Code-Kommentar;
//   - der Abschluss darf KEINE Merkmals-Checkliste sein. Genau das war die Design-Entscheidung,
//     und ein spaeterer "hilfreicher" Zusatz soll hier auffallen.
//
// Gerendert wird mit renderToStaticMarkup gegen die echte spot.json, ohne Browser.

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import ToolAge from './ToolAge'
import VideoOutlook from './VideoOutlook'
import DetectionRates from './DetectionRates'
import { CHANCE, DETECTION_CAPTION, DETECTION_PAIRS, DETECTION_RATES, IMAGE_TELL, VIDEO_TEXT, PROVENANCE, CLOSING, OUTLOOK_SOURCES } from './outlookText'

const data = JSON.parse(readFileSync(new URL('../../../public/data/spot.json', import.meta.url), 'utf8'))
const v = data.video
const fmtDE = (n, d = 0) => n.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d })

const outlook = renderToStaticMarkup(createElement(VideoOutlook, {
  v, tellHuman: data.tell.human, tellAI: data.tell.ai,
  imageTell: IMAGE_TELL, detectionCaption: DETECTION_CAPTION, videoText: VIDEO_TEXT, provenance: PROVENANCE, closing: CLOSING, sources: OUTLOOK_SOURCES,
}))
const chart = renderToStaticMarkup(createElement(ToolAge, { v }))
const flat = outlook.replace(/\s+/g, ' ')
const count = (s, re) => (s.match(re) || []).length

/** Download-gewichteter Median des Erscheinungsmonats, unabhaengig von der Pipeline nachgerechnet. */
const weightedMedian = (items) => {
  const total = items.reduce((s, x) => s + x.dl, 0)
  let run = 0
  for (const x of [...items].sort((a, b) => (a.m < b.m ? -1 : 1))) {
    run += x.dl
    if (run * 2 >= total) return x.m
  }
  return null
}

describe('spot.json trägt den Video-Befund', () => {
  it('alle Felder vorhanden und plausibel', () => {
    for (const k of ['asOf', 'modelsTotal', 'modelsTagged', 'n', 'dl', 'byTag', 'months', 'top',
      'top4Pct', 'halfMonth', 'halfSensitivity', 'halfStability', 'peakMonths', 'peakPct', 'coverage']) {
      expect(v[k], `video.${k} fehlt`).toBeDefined()
    }
    expect(v.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(v.n).toBeGreaterThan(0)
    expect(v.n).toBeLessThan(v.modelsTagged)
    expect(v.modelsTagged).toBeLessThanOrEqual(v.modelsTotal)
    expect(v.dl).toBe(v.months.reduce((s, m) => s + m.dl, 0))
    expect(v.n).toBe(v.months.reduce((s, m) => s + m.n, 0))
    expect(v.n).toBe(v.byTag.reduce((s, t) => s + t.n, 0))
  })

  it('die Monatsachse ist lückenlos und aufsteigend', () => {
    // Ohne Lueckenlosigkeit staucht die Grafik die stillen Monate weg und behauptet
    // gleichmaessige Abstaende, wo Pausen waren.
    for (let i = 1; i < v.months.length; i++) {
      const [ay, am] = v.months[i - 1].m.split('-').map(Number)
      const [by, bm] = v.months[i].m.split('-').map(Number)
      expect(by * 12 + bm, `Lücke zwischen ${v.months[i - 1].m} und ${v.months[i].m}`).toBe(ay * 12 + am + 1)
    }
    expect(v.months.some((m) => m.n === 0)).toBe(true) // es GIBT stille Monate, sie sind drin
  })

  it('halfMonth ist der nachgerechnete Download-gewichtete Median', () => {
    expect(v.halfMonth).toBe(weightedMedian(v.months))
  })

  it('die Stabilitätsangabe stimmt: der Median hängt nicht an einem einzelnen Modell', () => {
    // Der Text behauptet "bleibt dort, ob man die Top 10 oder alle rechnet". Das muss gelten.
    expect(v.halfStability.length).toBeGreaterThanOrEqual(3)
    for (const s of v.halfStability) {
      expect(s.m, `Top ${s.k} weicht ab`).toBe(v.halfMonth)
      expect(s.pct).toBeGreaterThan(0)
      expect(s.pct).toBeLessThanOrEqual(100)
    }
    // monoton: mehr Modelle = mehr Download-Anteil
    for (let i = 1; i < v.halfStability.length; i++) {
      expect(v.halfStability[i].pct).toBeGreaterThanOrEqual(v.halfStability[i - 1].pct)
    }
  })

  it('der Sensitivitätstest rechnet die alten Modelle wirklich hoch', () => {
    const f1 = v.halfSensitivity.find((s) => s.f === 1)
    expect(f1.m).toBe(v.halfMonth) // Faktor 1 = unveraendert
    // Hochrechnen der Altjahre darf den Median nur nach VORNE (frueher) schieben, nie nach hinten
    for (const s of v.halfSensitivity) {
      expect(s.m <= v.halfMonth, `Faktor ${s.f} schob den Median nach hinten: ${s.m}`).toBe(true)
    }
  })

  it('die Konzentrations-Zahlen sind aus den Daten, nicht gesetzt', () => {
    const byMonth = new Map(v.months.map((m) => [m.m, m.dl]))
    const peakSum = v.peakMonths.reduce((s, m) => s + byMonth.get(m), 0)
    expect(v.peakPct).toBeCloseTo((100 * peakSum) / v.dl, 1)
    // die vier Spitzenmonate sind wirklich die vier groessten
    const top4 = [...v.months].sort((a, b) => b.dl - a.dl).slice(0, 4).map((m) => m.m)
    expect(new Set(v.peakMonths)).toEqual(new Set(top4))
  })
})

describe('ToolAge: wie alt ist das Werkzeug', () => {
  it('drei Klassen, Anteile aus den Daten, Summe rund 100', () => {
    expect(v.ageBuckets).toHaveLength(3)
    const sum = v.ageBuckets.reduce((s, b) => s + b.pct, 0)
    expect(Math.abs(sum - 100)).toBeLessThan(0.5)
    for (const b of v.ageBuckets) {
      expect(chart).toContain(b.label)
      expect(chart).toContain(`${Math.round(b.pct)} %`)
    }
  })

  it('die Klassen sind nach Alter GEORDNET und in Luminanz kodiert, nicht in Farbtoenen', () => {
    // Geordnetes Attribut -> Helligkeit (Ware). Ein kategorialer Farbton waere hier falsch.
    expect(count(chart, /fill="#45bcc0"/g)).toBe(3)
    expect(chart).toMatch(/opacity="0\.95"/)
    expect(chart).toMatch(/opacity="0\.28"/)
  })

  it('die Anteile stimmen mit der Monatsverteilung ueberein', () => {
    // Gegenrechnung aus months: die Pipeline darf die Klassen nicht frei erfinden.
    const [ay, am] = v.asOf.slice(0, 7).split('-').map(Number)
    const age = (m) => { const [y, mo] = m.split('-').map(Number); return (ay - y) * 12 + (am - mo) }
    const tot = v.months.reduce((s, m) => s + m.dl, 0)
    const jung = v.months.filter((m) => age(m.m) <= 6).reduce((s, m) => s + m.dl, 0)
    expect(v.ageBuckets[0].pct).toBeCloseTo((100 * jung) / tot, 1)
  })

  it('das aria-label nennt Datenstand und alle drei Anteile', () => {
    expect(chart).toContain(v.asOf)
    for (const b of v.ageBuckets) expect(chart).toContain(b.label)
  })
})

describe('VideoOutlook: der Abschluss', () => {
  it('vergleicht Text und Bild nebeneinander, mit der HC3-Zahl aus den Daten', () => {
    expect(outlook).toContain('class="spot-tells"')
    expect(flat).toContain('Beim Text')
    expect(flat).toContain('Beim Bild')
    expect(flat).toContain(`>${fmtDE(data.tell.ai)}</span> Zeichen lang`)
    expect(flat).toContain(`+${Math.round((data.tell.ai / data.tell.human - 1) * 100)} %`)
  })

  it('nennt die eigene Messung mit Datenstand', () => {
    expect(flat).toContain(fmtDE(v.n))
    expect(flat).toContain(fmtDE(v.modelsTotal))
    expect(flat).toContain(v.asOf.split('-').reverse().join('.'))
  })

  it('EHRLICHKEIT: der Erfassungsbruch des Zensus steht im Bild, nicht nur im Kommentar', () => {
    // Ohne diesen Satz wäre der Abschluss angreifbar: aus diesem Dump ist "neue Modelle je
    // Monat" keine gültige Kurve, und das muss der Leser erfahren.
    expect(flat).toContain('keine Kurve')
    expect(flat).toContain(fmtDE(v.coverage.before2025))
    expect(flat).toContain(fmtDE(v.coverage.from2025))
    expect(flat).toMatch(/Erfassungsdichte/)
  })

  it('EHRLICHKEIT: kein Merkmals-Rezept, das schon beim Lesen veraltet', () => {
    // Die Design-Entscheidung des Abschlusses war: keine Checkliste. Diese Assertion soll
    // brechen, wenn jemand später "hilfreiche Tipps" einbaut.
    const verbote = [/\bzähl(e|en)?\s+die\b/i, /\bachte\s+auf\b/i, /\bschau\s+auf\s+die\s+(Hände|Finger|Zähne)\b/i,
      /\bso\s+erkennst\s+du\b/i, /\bfünf\s+Merkmale\b/i, /\bCheckliste\b/i]
    for (const re of verbote) expect(flat, `Rezept-Formulierung gefunden: ${re}`).not.toMatch(re)
  })

  it('TYPOGRAFIE: keine Em-/En-Dashes im Abschlusstext', () => {
    // Im ganzen Projekt sind Gedankenstriche als Stilmittel verbannt; sie waren mehrfach Anlass
    // zur Korrektur. Der Test hält das für den neuen Text fest.
    const texte = [...VIDEO_TEXT, ...PROVENANCE, ...IMAGE_TELL.paragraphs, IMAGE_TELL.detail, CLOSING, OUTLOOK_SOURCES,
      DETECTION_CAPTION, ...DETECTION_PAIRS.map((x) => x.text), ...DETECTION_RATES.map((x) => x.label)]
    for (const t of texte) {
      // Als Escape geschrieben, nicht literal: loop/checks/r1_quickwins.mjs scannt den
      // Quelltext nach Gedankenstrichen und wuerde sonst diese Zeile selbst melden.
      expect(t, `Gedankenstrich in: ${t.slice(0, 60)}`).not.toMatch(/[\u2013\u2014]/)
    }
  })

  it('die Quellen-Notiz ist eingeklappt und nennt den Zensus', () => {
    expect(outlook).toContain('<details')
    expect(outlook).not.toContain('<details open')
    expect(flat).toMatch(/librarian-bots|Modellkarten/)
  })

  it('ohne Video-Daten rendert der Abschluss nichts statt zu werfen', () => {
    // Alte spot.json ohne video-Block darf die Seite nicht killen.
    const leer = renderToStaticMarkup(createElement(VideoOutlook, {
      v: null, tellHuman: 770, tellAI: 1036,
      imageTell: IMAGE_TELL, detectionCaption: DETECTION_CAPTION, videoText: VIDEO_TEXT, provenance: PROVENANCE, closing: CLOSING, sources: OUTLOOK_SOURCES,
    }))
    expect(leer).toBe('')
    expect(renderToStaticMarkup(createElement(ToolAge, { v: { ageBuckets: [] } }))).toBe('')
  })
})

// --- Die Trefferquoten-Grafik --------------------------------------------------------------
// Sie ersetzt drei Absaetze Prosa. Diese Tests halten fest, dass dabei keine Zahl verloren geht
// und dass die 50-%-Referenz im Bild steht: ohne sie waere "48,2 %" nur eine Zahl statt
// "schlechter als Raten".
const rates = renderToStaticMarkup(createElement(DetectionRates))

describe('DetectionRates: sieben Studien auf einer Skala', () => {
  it('jede Studie ist genau ein Balken, keine fehlt', () => {
    expect(DETECTION_RATES).toHaveLength(7)
    for (const d of DETECTION_RATES) {
      expect(rates).toContain(d.label)
      expect(rates.replace(/\s+/g, ' ')).toContain(`${d.v.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`)
      expect(rates).toContain(`n = ${d.n.toLocaleString('de-DE')}`)
    }
  })

  it('die Zufallslinie ist die Referenz und steht beschriftet im Bild', () => {
    expect(CHANCE).toBe(50)
    expect(rates).toContain('>Raten<')
    expect(rates).toContain('>50 %<')
  })

  it('EHRLICHKEIT: Werte unter dem Zufall sind als solche erkennbar', () => {
    // 48,2 % ist der Kern des Befundes. Waere der Balken wie alle anderen nach rechts gezeichnet,
    // laese sich "unter dem Zufall" aus dem Bild nicht ablesen.
    const unter = DETECTION_RATES.filter((d) => d.v < CHANCE)
    expect(unter.length).toBeGreaterThan(0)
    expect(rates).toContain('#fb7185') // OUTCOME.no: der Wert links der Linie traegt die Warnfarbe
  })

  it('die zwei Vergleichspaare sind zusammengeklammert, mit ihrer Differenz', () => {
    for (const pair of DETECTION_PAIRS) {
      const rows = DETECTION_RATES.filter((d) => d.paar === pair.key)
      expect(rows, `Paar ${pair.key}`).toHaveLength(2)
      const diff = Math.round((rows[1].v - rows[0].v) * 10) / 10
      expect(rates).toContain(`+${String(diff).replace('.', ',')}`)
    }
  })

  it('das aria-label nennt alle Werte, nicht nur "Diagramm"', () => {
    expect(rates).toContain('50 Prozent ist Raten')
    for (const d of DETECTION_RATES) expect(rates).toContain(`${d.label} `)
  })

  it('die Bildunterschrift sagt, was die Grafik NICHT hergibt', () => {
    // Die Reize der sieben Studien sind nicht untereinander vergleichbar. Ohne diesen Satz
    // laese die Grafik als Rangliste.
    expect(DETECTION_CAPTION).toMatch(/nicht untereinander vergleichbar/)
    expect(DETECTION_CAPTION).toMatch(/keinem Fortschrittspfeil/)
  })
})
