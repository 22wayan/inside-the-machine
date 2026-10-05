// Struktur- und Inhaltstest der Detailansicht (Stufe C und D): Dossier, Treppe, Lesetisch.
//
// Beides sind Abnahmebedingungen aus der Spezifikation, keine Politur:
//   - die Zahlen im Lesetisch (Quantils-Ticks, Dimensionszaehlung) muessen aus lengthQuantiles()
//     und aus den echten graySamples kommen, nicht aus dem Fliesstext;
//   - der Text eines graySample darf VOR dem Aufdecken NICHT im DOM stehen (sonst liest ein
//     Screenreader ihn ungefragt vor - genau der stille A11y-Fehler, den die Spec benennt).
//
// Gerendert wird mit renderToStaticMarkup gegen die echte wildchat.json. Effekte laufen dabei
// nicht; geprueft wird also der Zustand VOR jeder Nutzerhandlung - fuer die Guardrail-Frage ist
// das genau der richtige Zeitpunkt.

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import {
  bucketCats, buildDocIndex, catDeltas, dimCounts, fmtDE, lengthQuantiles, normCats,
  pctShorterThan, threadCounts, worldMonthShares,
} from '../../lib/ledger'
import { CAT_BUCKET } from '../../theme'
import { docHeightScale, modScale, volumeScale } from './geometry'
import { tipContent } from './LedgerSheet'
import LedgerDossier from './LedgerDossier'
import ReadingDesk from './ReadingDesk'
import Staircase from './Staircase'

const data = JSON.parse(readFileSync(new URL('../../../public/data/wildchat.json', import.meta.url), 'utf8'))
const C = data.countries
const shares = worldMonthShares(data)
const docIndex = buildDocIndex(C)
const lenQ = lengthQuantiles(docIndex.docs)
const buckets = C.map((c) => bucketCats(c))
const threads = threadCounts(C)
const monthCounts = data.months.map((m) => m.n)
const scales = {
  vol: volumeScale(Math.max(...C.map((c) => c.n))),
  mod: modScale(),
  docH: docHeightScale(),
}
const maxMonth = Math.max(...C.flatMap((c) => c.trend || []))
const world = {
  buckets: bucketCats({ cats: data.globalCats }),
  modPct: data.moderation.globalPct,
  avgTurns: C.reduce((s, c) => s + c.avgTurns * c.n, 0) / C.reduce((s, c) => s + c.n, 0),
  shares,
  n: data.coveredByCentroid,
  total: data.total,
}
const ISRAEL = C.findIndex((c) => c.country === 'Israel')

const dossier = (selCi, trendMode = 'share') => renderToStaticMarkup(createElement(LedgerDossier, {
  countries: C,
  selCi,
  world,
  buckets,
  docsByCountry: docIndex.byCountry,
  lenQ,
  threads,
  globalCats: data.globalCats,
  months: data.months,
  monthCounts,
  maxMonth,
  scales,
  selDocId: null,
  trendMode,
  onTrendMode: () => {},
  onOpenDoc: () => {},
  reduce: true,
}))

const desk = (doc) => renderToStaticMarkup(createElement(ReadingDesk, {
  doc,
  docIndex,
  docsByCountry: docIndex.byCountry,
  countries: C,
  world,
  globalCats: data.globalCats,
  lenQ,
  months: data.months,
  onClose: () => {},
  onNavigate: () => {},
  onFilterCat: () => {},
  reduce: true,
}))

const flat = (s) => s.replace(/\s+/g, ' ')

/** Wie React escaped, damit der Absenz-Test nicht an einem &quot; scheitert und still durchgeht. */
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;')

/**
 * Ein Textstueck aus der MITTE des Belegs. Die ersten 40 Zeichen taugen nicht als Sonde:
 * Prompts beginnen millionenfach mit derselben Floskel ("Write a coherent, elaborate,
 * descriptive ..."), ein Praefix-Treffer beweist also gar nichts.
 */
const probe = (t) => esc(t.length > 200 ? t.slice(60, 180) : t)

describe('neue reine Funktionen (Stufe C und D)', () => {
  it('pctShorterThan ist monoton und trifft die Raender exakt', () => {
    const sorted = docIndex.docs.map((d) => d.len).sort((a, b) => a - b)
    expect(pctShorterThan(sorted, sorted[0])).toBe(0)
    expect(pctShorterThan(sorted, 100000)).toBe(100)
    let prev = -1
    for (const v of [50, 122, 430, 1000, 1520, 1995, 2000]) {
      const p = pctShorterThan(sorted, v)
      expect(p).toBeGreaterThanOrEqual(prev)
      prev = p
    }
    // 34 Belege liegen bei genau 2.000 Zeichen oder darueber -> unter 2.000 liegen 846 minus 34
    const capped = docIndex.docs.filter((d) => d.capped).length
    expect(pctShorterThan(sorted, 2000)).toBeCloseTo(((846 - capped) / 846) * 100, 6)
  })

  it('catDeltas summiert auf 0 und stellt die groesste Abweichung nach vorn', () => {
    const d = catDeltas(C[ISRAEL], data.globalCats)
    expect(d).toHaveLength(9)
    expect(d.reduce((s, x) => s + x.delta, 0)).toBeCloseTo(0, 6)
    expect(d[0].cat).toBe('Rollenspiel/Story')
    expect(d[0].delta).toBeGreaterThan(45) // Israel liegt rund 49 pp ueber dem Weltmix
    for (let i = 1; i < d.length; i++) expect(Math.abs(d[i].delta)).toBeLessThanOrEqual(Math.abs(d[i - 1].delta))
  })

  it('dimCounts: violence 221 · sexual 25 · harassment 11 · self-harm 1, hate exakt leer', () => {
    const dims = dimCounts(docIndex.docs)
    expect(dims).toEqual([['violence', 221], ['sexual', 25], ['harassment', 11], ['self-harm', 1]])
    expect(dims.reduce((s, [, n]) => s + n, 0)).toBe(258)
    expect(dims.some(([k]) => k === 'hate')).toBe(false)
  })
})

describe('LedgerDossier (Stufe C)', () => {
  it('ist ohne Auswahl im DOM und deklariert eine feste Hoehe (CLS = 0, keine Hoehenmutation)', () => {
    const empty = dossier(null)
    // Leer traegt das Band einen Modifier und ist deutlich niedriger; die feste Hoehe schuetzt
    // den WECHSEL zwischen Laendern, nicht den Zustand davor.
    expect(empty).toContain('ledger-dossier ledger-dossier--empty')
    expect(empty).toMatch(/--dossier-h-empty:\d+px/)
    // Die konkreten Hoehen sind gemessene Groessen und duerfen sich aendern; die Invariante ist,
    // dass leer und gefuellt DIESELBE Hoehe deklarieren (CLS = 0).
    expect(empty).toMatch(/--dossier-h:\d+px/)
    expect(empty).not.toContain('<canvas')
    const filled = dossier(ISRAEL)
    const h = (x) => (x.match(/--dossier-h[^"]*/) || [''])[0]
    expect(h(filled)).toBe(h(empty))
    expect(h(filled)).not.toBe('')
    expect(filled).not.toContain('<canvas') // Zeilen-Echo ist SVG: #wildchat canvas bleibt bei 1
  })

  it('Zeilen-Echo wiederholt die gewaehlte Zeile UND die Weltzeile auf denselben Skalen', () => {
    const html = dossier(ISRAEL)
    expect(html).toContain('ISRAEL')
    expect(html).toContain('>WELT<')
    expect(html).toContain('url(#echoHatch)') // "Sonstiges" traegt auch im Echo Textur
    expect(html).toContain('viewBox="0 0 1320 58"')
  })

  it('Wilson-Intervall steht NUR hier und immer mit seinem Vorbehalt', () => {
    const html = flat(dossier(ISRAEL))
    expect(html).toContain('Graubereich 24,0 %')
    expect(html).toContain('(95-%-Intervall 22,7 bis 25,4)')
    expect(html).toMatch(/Rechnet auf Gesprächen, nicht auf Personen/i)
  })

  it('die bisher ungenutzten Dimensionen sind im Bild: Sprachen, Modelle, avgTurns, Verlauf', () => {
    const html = flat(dossier(ISRAEL))
    const c = C[ISRAEL]
    expect(html).toContain(c.langs[0].l)
    expect(html).toContain(c.models[0].m)
    expect(html).toContain('Sprache des Gesprächs, nicht der Person')
    expect(html).toContain('Abweichung vom Weltverlauf')
    expect(html).toContain('Verlauf')
    expect(html).toContain('Tempo')
  })

  // --- Tiefe und Verlauf sind aus dem Blatt hierher gezogen -------------------
  // Der Umbau auf vier Mark-Spalten darf keine Dimension verlieren. Diese zwei Tests halten
  // fest, dass beide hier ANKOMMEN, und zwar als Mark und nicht als Nebensatz.

  it('TIEFE steht als eigene Achse im Dossier, mit Weltmarke und Bezifferung', () => {
    const html = flat(dossier(ISRAEL))
    const c = C[ISRAEL]
    expect(html).toContain(`Tiefe ${fmtDE(c.avgTurns, 1)} Runden je Gespräch`)
    expect(html).toContain(`(Welt ${fmtDE(world.avgTurns, 1)})`)
    // Achse 1,4..4,0 mit sechs bezifferten Marken - im Blatt waren dafuer 80 px, hier 240
    expect(html).toContain('viewBox="0 0 240 22"')
    for (const t of ['1,5', '2,0', '2,5', '3,0', '3,5', '4,0']) expect(html).toContain(`>${t}</text>`)
    expect(html).toContain(`Gesprächstiefe ${fmtDE(c.avgTurns, 1)} Runden`)
  })

  it('VERLAUF ist umschaltbar: Anteil mit Weltlinie, Absolutzahlen ohne sie', () => {
    const share = flat(dossier(ISRAEL, 'share'))
    const abs = flat(dossier(ISRAEL, 'abs'))
    expect(share).toContain('Anteil am eigenen Jahr')
    expect(share).toContain('Linie: Welt')
    expect(share).toContain('gemeinsame Skala 0 bis 35 Prozent')
    // Absolutmodus: gemeinsame Skala ueber alle Laender, und die Weltlinie fehlt begruendet
    expect(abs).toContain(`Skala 0 bis ${fmtDE(maxMonth)} je Monat, für alle Länder gleich`)
    expect(abs).toContain('ohne Weltlinie')
    // Die Begruendung nennt die Weltsumme als Zahl - der Wortlaut darf sich aendern, die Zahl nicht.
    expect(abs).toContain(fmtDE(Math.max(...monthCounts)))
    expect(abs).not.toContain('Linie: Welt')
    // die Umschaltung ist ein echter Toggle und sitzt am Verlauf, nicht in der Bedienleiste
    expect(abs).toMatch(/aria-pressed="true"[^>]*>Absolutzahlen</)
    expect(share).toMatch(/aria-pressed="false"[^>]*>Anteil am eigenen Jahr</)
    // im Tempo-Reiter gibt es sie nicht: nur der Verlauf hat zwei Lesarten
    expect(share).toMatch(/aria-pressed="true"[^>]*>Verlauf</)
  })

  it('Belegstapel: Blockbreite = Zeichenzahl, Quantils-Lineal aus lengthQuantiles()', () => {
    const html = dossier(ISRAEL)
    const blocks = (html.match(/class="ledger-docblock"/g) || []).length
    const gray = docIndex.byCountry[ISRAEL].filter((d) => d.kind === 'g').length
    expect(blocks).toBe(docIndex.byCountry[ISRAEL].length - gray)
    expect(html).toContain('p25 122')
    expect(html).toContain('Median 427')
    expect(html).toContain('p75 1.519')
    expect(html).toContain('p90 1.996')
  })

  it('GUARDRAIL: der Text eines Graubereich-Belegs steht erst nach dem Aufdecken im DOM', () => {
    const html = dossier(ISRAEL)
    const grays = docIndex.byCountry[ISRAEL].filter((d) => d.kind === 'g')
    expect(grays.length).toBeGreaterThan(0)
    for (const g of grays) {
      expect(html).not.toContain(probe(g.t))
      expect(html).toContain(`Score ${fmtDE(g.score, 2)}`)
    }
    expect(html).toContain('zum Lesen aufdecken')
  })
})

describe('Staircase (die Treppe im Zeit-Toggle)', () => {
  it('zeichnet round(n/1000) Linien und annotiert die Interpolation', () => {
    const china = C.find((c) => c.country === 'China')
    const html = renderToStaticMarkup(createElement(Staircase, {
      country: china, months: data.months, worldTrend: monthCounts, reduce: true,
    }))
    const k = Math.round(china.n / 1000)
    expect(k).toBe(101)
    expect(flat(html)).toContain(`${fmtDE(k)} Linien`)
    expect(flat(html)).toContain('Innerhalb eines Monats linear interpoliert')
    expect(flat(html)).toContain('Erhebungslücke')
    expect(flat(html)).toContain('bei dieser Dichte liest das Band als Textur') // k > 60
  })

  it('kleine Laender bekommen keinen Dichtehinweis, aber ihren Restfaden', () => {
    const greece = C.find((c) => c.country === 'Greece')
    const html = flat(renderToStaticMarkup(createElement(Staircase, {
      country: greece, months: data.months, worldTrend: monthCounts, reduce: true,
    })))
    expect(html).not.toContain('liest das Band als Textur')
    expect(html).toContain('Restfaden') // 1.513 Gespraeche, k = 2: die zweite Linie ist Rest
  })
})

describe('ReadingDesk (Stufe D)', () => {
  const sample = docIndex.docs.find((d) => d.kind === 's' && d.len > 600 && !d.capped)
  const gray = docIndex.docs.find((d) => d.kind === 'g')

  it('ist ein echter Dialog mit Signaturzeile und Position in der Grundgesamtheit', () => {
    const html = flat(desk(sample))
    expect(html).toContain('role="dialog"')
    expect(html).toContain('aria-modal="true"')
    expect(html).toContain('aria-labelledby="desk-signature"')
    expect(html).toContain('WILDCHAT-1M / BELEG')
    expect(html).toContain('VON 846 /')
    expect(html).toContain('E-MAIL, TELEFON UND URL-PARAMETER MASKIERT')
  })

  it('zeigt den echten Text in Originalschrift und die vier Quantils-Ticks', () => {
    const html = desk(sample)
    expect(html).toContain('class="ledger-desk-text"')
    expect(html).toContain('p25 122')
    expect(html).toContain('p50 427')
    expect(html).toContain('p75 1.519')
    expect(html).toContain('p90 1.996')
    expect(html).toContain(`${fmtDE(sample.len)} Z.`)
  })

  it('verortet den Beleg in der Verteilung, statt ihn allein stehen zu lassen', () => {
    const sorted = docIndex.docs.map((d) => d.len).sort((a, b) => a - b)
    const html = flat(desk(sample))
    expect(html).toContain(`länger als ${fmtDE(pctShorterThan(sorted, sample.len), 0)} % aller 846 Belege`)
    expect(html).toContain('ähnlichster Beleg in einem anderen Land')
    expect(html).toContain('Schließen (Esc)')
  })

  it('GUARDRAIL: ein graySample zeigt zuerst die Warnkarte, der Text bleibt aus dem DOM', () => {
    const html = desk(gray)
    expect(html).not.toContain(probe(gray.t))
    expect(html).toContain('class="ledger-warncard"')
    expect(html).toContain('Text aufdecken')
    expect(flat(html)).toContain(`Moderations-Score von <b>${fmtDE(gray.score, 3)}</b>`)
    expect(flat(html)).toContain('θ ist gesetzt, nicht kalibriert')
  })

  it('Thermometer und Dimensionsbalken stehen nur beim graySample - mit beschrifteter θ-Marke', () => {
    const html = flat(desk(gray))
    expect(html).toContain('θ = 0,25')
    expect(html).toContain('0,58 Maximum')
    expect(html).toContain('Gewalt 221')
    expect(html).toContain('sexuelle Inhalte 25')
    expect(html).toContain('Belästigung 11')
    expect(html).toContain('Selbstverletzung 1')
    expect(html).toContain('hate steht nicht in dieser Liste')
    expect(flat(desk(sample))).not.toContain('class="ledger-desk-score"')
  })

  it('Ratschlag laeuft nicht leer, sondern sagt die Knappheit explizit an', () => {
    const advice = docIndex.byCat.get('Ratschlag')
    expect(advice).toHaveLength(2)
    const html = flat(desk(advice[0]))
    expect(html).toContain('1 weiterer Beleg in Ratschlag')
    // und der Querschnitt-Sprung findet ihn: er liegt in einem anderen Land
    expect(advice[0].ci).not.toBe(advice[1].ci)
  })

  it('gekappte Belege bekommen eine ausgefranste Kante und den Grund dafuer', () => {
    const capped = docIndex.docs.find((d) => d.kind === 's' && d.capped)
    const html = flat(desk(capped))
    expect(html).toContain('linear-gradient(to bottom, #000 92%, transparent)')
    expect(html).toContain('Bei 2.000 Zeichen gekappt (Pipeline), echte Länge unbekannt')
  })
})

// --- Der Tooltip der Wofuer-Spalte -------------------------------------------------------
// REGRESSION: bei fokussiertem "Mathe/Logik" nannte der Tooltip fuer Finnland "Sonstiges 29,3 %",
// waehrend der Balken die 14,1 % der fokussierten Kategorie zeigte. Der Tooltip las immer die
// GROESSTE Kategorie des Landes statt der, die gerade im Bild ist. Diese Tests halten alle drei
// Lesarten fest, weil die Spalte drei hat.
describe('tipContent: die Wofür-Spalte hat drei Lesarten', () => {
  const world = { total: data.total, n: data.coveredByCentroid, modPct: data.moderation.globalPct, buckets: bucketCats({ cats: data.globalCats }) }
  const fin = C.findIndex((c) => c.country === 'Finland' || c.country === 'Finnland')
  const bk = bucketCats(C[fin])
  // Mathe/Logik ist KEIN eigenes Buendel: es liegt mit Uebersetzen und Ratschlag im Buendel
  // "Rest". Sein Wert kommt deshalb aus normCats, nicht aus dem Buendel-Array - genau die
  // Unterscheidung, an der der Tooltip vorher gescheitert ist.
  const iRest = CAT_BUCKET.findIndex((b) => b.key === 'Rest')
  const iSonst = CAT_BUCKET.findIndex((b) => b.key === 'Sonstiges')
  const mathePct = normCats(C[fin])['Mathe/Logik']
  const f = (n, d = 0) => fmtDE(n, d)

  it('mit Fokus gewinnt die fokussierte Kategorie, nicht die größte', () => {
    const t = tipContent(C[fin], world, 'c3', bk, f, [], 'Mathe/Logik', null)
    expect(t.head).toBe(`Mathe/Logik ${fmtDE(mathePct, 1)} %`)
    // genau der Fehler von vorher: Sonstiges ist bei Finnland die groesste Kategorie und stand
    // im Tooltip, obwohl Mathe/Logik fokussiert war
    expect(bk[iSonst]).toBeGreaterThan(mathePct)
    expect(t.head).not.toContain('Sonstiges')
    // fuer eine Rest-Kategorie fuehrt das Blatt keine Weltmarke, also behauptet der Tooltip auch keine
    expect(t.body).not.toContain('gegenüber Welt')
  })

  it('mit Fokus auf ein echtes Bündel steht der Weltvergleich dabei', () => {
    const t = tipContent(C[fin], world, 'c3', bk, f, [], 'Schreiben/Text', null)
    const i = CAT_BUCKET.findIndex((b) => b.key === 'Schreiben/Text')
    expect(t.head).toBe(`Schreiben/Text ${fmtDE(bk[i], 1)} %`)
    expect(t.body).toContain('gegenüber Welt')
  })

  it('ohne Fokus gewinnt das Segment, über dem der Zeiger steht', () => {
    const t = tipContent(C[fin], world, 'c3', bk, f, [], null, iRest)
    // das Sammelbuendel nennt seine Mitglieder, sonst waere "Rest" eine Blackbox
    expect(t.head).toContain('Rest (Übersetzen, Mathe/Logik, Ratschlag)')
    expect(t.head).toContain(`${fmtDE(bk[iRest], 1)} %`)
  })

  it('ohne Fokus und ohne Segment bleibt die größte Kategorie die Auskunft', () => {
    const t = tipContent(C[fin], world, 'c3', bk, f, [], null, null)
    const top = CAT_BUCKET.map((b, i) => ({ k: b.key, v: bk[i] })).sort((a, b) => b.v - a.v)[0]
    expect(t.head).toBe(`${top.k} ${fmtDE(top.v, 1)} %`)
  })

  it('der Normierungs-Vorbehalt steht in JEDER Lesart', () => {
    for (const args of [['Mathe/Logik', null], [null, iRest], [null, null]]) {
      expect(tipContent(C[fin], world, 'c3', bk, f, [], args[0], args[1]).body)
        .toContain('Anteile auf 100 normiert')
    }
  })
})
