// Erster Unit-Test des Projekts. Er gehoert zur Abnahme, nicht zur Politur:
// Munzners Nested Model (2009) verlangt Validierung auf Ebene "Abstraction", und die Pointe von
// Akt 4 ist eine Zahl. Alle Sollwerte sind gegen die echte app/public/data/wildchat.json
// gemessen - der Test schlaegt an, sobald ein Refactoring oder ein Datenrebuild sie verschiebt.
//
// Gemessen wird mit dem NODE-EXEMPLAR derselben JSON, die der Browser laedt. Keine Fixtures,
// keine Mocks: eine Zahl, die nur gegen einen Mock stimmt, ist keine Evidenz.

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { CAT_BUCKET } from '../theme'
import {
  BUCKET_KEYS,
  CATS9,
  DOC_CAP,
  SHORT,
  buildDocIndex,
  bucketCats,
  catPct,
  easeCubicInOut,
  fmtDE,
  histLog,
  lengthQuantiles,
  leveragePoints,
  nearestCrossCountry,
  normCats,
  olsFit,
  orderByKey,
  pearson,
  quantile,
  rankAvg,
  shortName,
  sortKeys,
  spearman,
  staircase,
  threadCounts,
  tvd,
  wilson95,
  worldMonthShares,
} from './ledger'

const data = JSON.parse(readFileSync(new URL('../../public/data/wildchat.json', import.meta.url), 'utf8'))
const C = data.countries
const world = worldMonthShares(data)
const index = buildDocIndex(C)
const rp = C.map((c) => catPct(c, 'Rollenspiel/Story'))
const mod = C.map((c) => c.modPct ?? 0)
const keep = C.map((c, i) => i).filter((i) => C[i].country !== 'Israel' && C[i].country !== 'Jamaica')
const pick = (arr) => keep.map((i) => arr[i])

describe('numerische Grundbausteine (Ersatz fuer nicht installierte d3-Module)', () => {
  it('easeCubicInOut ist auf [0,1] geklemmt, monoton und punktsymmetrisch um 0,5', () => {
    expect(easeCubicInOut(0)).toBe(0)
    expect(easeCubicInOut(1)).toBe(1)
    expect(easeCubicInOut(0.5)).toBeCloseTo(0.5, 12)
    expect(easeCubicInOut(-3)).toBe(0)
    expect(easeCubicInOut(9)).toBe(1)
    expect(easeCubicInOut(0.25) + easeCubicInOut(0.75)).toBeCloseTo(1, 12)
    let prev = -1
    for (let t = 0; t <= 1.0001; t += 0.01) {
      const v = easeCubicInOut(t)
      expect(v).toBeGreaterThanOrEqual(prev)
      prev = v
    }
  })

  it('quantile folgt Typ 7 (R-Default, identisch zu numpy linear)', () => {
    const a = [1, 2, 3, 4]
    expect(quantile(a, 0)).toBe(1)
    expect(quantile(a, 1)).toBe(4)
    expect(quantile(a, 0.5)).toBeCloseTo(2.5, 12)
    expect(quantile(a, 0.25)).toBeCloseTo(1.75, 12)
    expect(quantile(a, 0.75)).toBeCloseTo(3.25, 12)
    expect(quantile([7], 0.9)).toBe(7)
    expect(Number.isNaN(quantile([], 0.5))).toBe(true)
  })

  it('rankAvg mittelt Bindungen', () => {
    expect(rankAvg([10, 20, 20, 40])).toEqual([1, 2.5, 2.5, 4])
  })

  it('pearson und olsFit reproduzieren einen exakt linearen Zusammenhang', () => {
    const x = [1, 2, 3, 4, 5]
    const y = x.map((v) => 3 * v - 2)
    expect(pearson(x, y)).toBeCloseTo(1, 12)
    expect(olsFit(x, y).m).toBeCloseTo(3, 12)
    expect(olsFit(x, y).b).toBeCloseTo(-2, 12)
  })

  it('histLog verteilt alle Werte auf genau bins Faecher', () => {
    const h = histLog([25, 100, 400, 2000], 4)
    expect(h).toHaveLength(4)
    expect(h.reduce((s, b) => s + b.n, 0)).toBe(4)
    expect(h[0].x0).toBeCloseTo(25, 9)
    expect(h[3].x1).toBeCloseTo(2000, 9)
  })

  it('fmtDE formatiert deutsch mit fester Nachkommastelle', () => {
    expect(fmtDE(170520)).toBe('170.520')
    expect(fmtDE(24, 1)).toBe('24,0')
  })
})

describe('Grundgesamtheit', () => {
  it('53 Laender, 837.989 Gespraeche, 796.322 zugeordnet (95,0 %)', () => {
    expect(C).toHaveLength(53)
    expect(data.total).toBe(837989)
    expect(data.coveredByCentroid).toBe(796322)
    expect(C.reduce((s, c) => s + c.n, 0)).toBe(796322)
    expect((100 * data.coveredByCentroid) / data.total).toBeCloseTo(95.0, 1)
  })

  it('Volumen-Eckwerte: min 1.513 (Greece), max 170.520 (USA), Median 5.805', () => {
    const ns = C.map((c) => c.n).sort((a, b) => a - b)
    expect(ns[0]).toBe(1513)
    expect(ns[ns.length - 1]).toBe(170520)
    expect(quantile(ns, 0.5)).toBe(5805)
    expect(C.find((c) => c.n === 1513).country).toBe('Greece')
    expect(C.find((c) => c.n === 170520).country).toBe('United States')
  })

  it('Filtergrenzen der Control-Bar: 29 Laender ab 5.000, 14 unter 3.000', () => {
    expect(C.filter((c) => c.n >= 5000)).toHaveLength(29)
    expect(C.filter((c) => c.n < 3000)).toHaveLength(14)
  })

  it('SHORT trifft echte Landesnamen (Altbug: Netherlands statt The Netherlands)', () => {
    const names = new Set(C.map((c) => c.country))
    for (const key of Object.keys(SHORT)) expect(names.has(key)).toBe(true)
    expect(shortName('The Netherlands')).toBe('Niederlande')
    expect(shortName('Israel')).toBe('Israel')
  })

  it('ALLE 53 Laender haben einen deutschen Namen (kein halb englisches Blatt)', () => {
    // Befund der Abnahme: 9 von 53 uebersetzt, im Blatt stand "Germany" neben "Niederlande".
    const missing = C.map((c) => c.country).filter((n) => !(n in SHORT))
    expect(missing).toEqual([])
    expect(Object.keys(SHORT)).toHaveLength(C.length)
    expect(shortName('Germany')).toBe('Deutschland')
    expect(shortName('Greece')).toBe('Griechenland')
    expect(shortName('United Arab Emirates')).toBe('VAE')
  })

  it('kein deutscher Name sprengt die 144 px breite Namensspalte c1', () => {
    // Konservative Obergrenze fuer 12 px Hanken Grotesk: 0,62 em je Zeichen (Grossbuchstaben
    // zaehlen doppelt). Wer darueber liegt, braucht die uebliche Kurzform (VAE statt
    // Vereinigte Arabische Emirate). Ohne DOM messbar, deshalb hier statt im Browser.
    const est = (s) => [...s].reduce((w, ch) => w + (ch === ch.toUpperCase() && ch !== ch.toLowerCase() ? 8.4 : 6.6), 0)
    const tooWide = C.map((c) => shortName(c.country)).filter((n) => est(n) > 144)
    expect(tooWide).toEqual([])
  })
})

describe('Einheiten-Kamm (Kopfband)', () => {
  it('797 Striche, min 2, max 171, kein Land bei 0', () => {
    const tc = threadCounts(C)
    let sum = 0
    let min = Infinity
    let max = -Infinity
    for (const v of tc) {
      sum += v
      if (v < min) min = v
      if (v > max) max = v
    }
    expect(sum).toBe(797)
    expect(min).toBe(2)
    expect(max).toBe(171)
    expect(Array.from(tc).filter((v) => v === 0)).toHaveLength(0)
  })
})

describe('Die Pointe des Akts: zwei von 53 Laendern tragen die Korrelation', () => {
  it('pearson(Rollenspiel, Graubereich) = 0,7096 ueber alle 53', () => {
    expect(pearson(rp, mod)).toBeCloseTo(0.7096, 4)
  })

  it('ohne Israel und Jamaica faellt r auf 0,2367 (n = 51)', () => {
    expect(keep).toHaveLength(51)
    expect(pearson(pick(rp), pick(mod))).toBeCloseTo(0.2367, 4)
  })

  it('Spearman rho = 0,3718 (rangbasiert, ausreisserrobuster)', () => {
    expect(spearman(rp, mod)).toBeCloseTo(0.3718, 4)
  })

  it('r(log10 n, Graubereich) = 0,0176: das Volumen erklaert nichts', () => {
    expect(pearson(C.map((c) => Math.log10(c.n)), mod)).toBeCloseTo(0.0176, 4)
  })

  it('OLS: y = 0,2072x + 0,6498 wird zu y = 0,0670x + 2,2005', () => {
    const all = olsFit(rp, mod)
    expect(all.m).toBeCloseTo(0.2072, 4)
    expect(all.b).toBeCloseTo(0.6498, 4)
    const cut = olsFit(pick(rp), pick(mod))
    expect(cut.m).toBeCloseTo(0.067, 4)
    expect(cut.b).toBeCloseTo(2.2005, 4)
  })

  it('Israel und Jamaica werden AUS DEN DATEN als Hebelpunkte bestimmt, nicht per Namensliste', () => {
    const lev = leveragePoints(rp, 2)
    expect(lev.map((p) => C[p.i].country).sort()).toEqual(['Israel', 'Jamaica'])
    // deutlicher Abstand zum drittgroessten Hebel -> die Auswahl ist selbst ein Befund
    expect(lev[1].h).toBeGreaterThan(leveragePoints(rp, 3)[2].h * 1.5)
    expect(new Set(lev.map((p) => p.i))).toEqual(new Set(C.map((c, i) => i).filter((i) => !keep.includes(i))))
  })

  it('Israel und Jamaica tragen die Steigung', () => {
    const il = C.find((c) => c.country === 'Israel')
    const jm = C.find((c) => c.country === 'Jamaica')
    expect(catPct(il, 'Rollenspiel/Story')).toBe(63)
    expect(il.modPct).toBe(24.0)
    expect(catPct(jm, 'Rollenspiel/Story')).toBe(79)
    expect(jm.modPct).toBe(16.2)
    expect(Math.max(...mod)).toBe(24.0)
    expect(Math.min(...mod)).toBe(0.0)
  })
})

describe('Wilson-95 (nur im Dossier, mit Vorbehalt)', () => {
  it('Israel 24,0 % bei n = 3.804 -> Halbbreite 1,36 pp, Intervall 22,7 bis 25,4', () => {
    const w = wilson95(24.0, 3804)
    expect(w.half).toBeCloseTo(1.36, 2)
    expect(w.lo).toBeCloseTo(22.7, 1)
    expect(w.hi).toBeCloseTo(25.4, 1)
  })

  it('kleinere Stichprobe -> breiteres Intervall (Monotonie)', () => {
    expect(wilson95(24.0, 1513).half).toBeGreaterThan(wilson95(24.0, 3804).half)
    expect(Number.isNaN(wilson95(24.0, 0).half)).toBe(true)
  })
})

describe('Themen-Buckets (Spalte c3)', () => {
  it('CATS9 deckt exakt die 9 Kategorien aus globalCats ab', () => {
    expect(data.globalCats.map((x) => x.cat)).toEqual(CATS9)
  })

  it('normCats fuellt die sparse cats[] auf 9 auf und normiert auf 100', () => {
    const rawSums = C.map((c) => (c.cats || []).reduce((s, x) => s + x.pct, 0))
    expect(Math.min(...rawSums)).toBe(98)
    expect(Math.max(...rawSums)).toBe(102)
    for (const c of C) {
      const n = normCats(c)
      expect(Object.keys(n)).toHaveLength(9)
      expect(CATS9.reduce((s, k) => s + n[k], 0)).toBeCloseTo(100, 8)
    }
  })

  it('bucketCats liefert 7 Segmente, Summe exakt 100, fuer alle 53 Laender', () => {
    for (const c of C) {
      const b = bucketCats(c)
      expect(b).toHaveLength(7)
      expect(b.every((v) => v >= 0)).toBe(true)
      expect(b.reduce((s, v) => s + v, 0)).toBeCloseTo(100, 8)
    }
  })

  it('CAT_BUCKET aus theme.js bleibt mit globalCats synchron (Reihenfolge und Referenz-pct)', () => {
    expect(CAT_BUCKET.map((x) => x.key)).toEqual(BUCKET_KEYS)
    const globalBuckets = bucketCats({ cats: data.globalCats })
    CAT_BUCKET.forEach((b, i) => expect(globalBuckets[i]).toBeCloseTo(b.pct, 1))
    // absteigend nach globalem Rang -> die feste Reihenfolge ist begruendet, nicht willkuerlich
    const pcts = CAT_BUCKET.slice(0, 6).map((x) => x.pct)
    expect([...pcts].sort((a, b) => b - a)).toEqual(pcts)
    expect(CAT_BUCKET[0].hatch).toBe(true)
  })

  it('"Sonstiges" reicht von 0 bis 72 % - das Eingestaendnis der Heuristik', () => {
    const so = C.map((c) => catPct(c, 'Sonstiges'))
    expect(Math.min(...so)).toBe(0)
    expect(Math.max(...so)).toBe(72)
    expect(data.globalCats[0]).toEqual({ cat: 'Sonstiges', pct: 21.8 })
  })
})

describe('Weltprofil und Verlauf (Spalte c6)', () => {
  it('worldMonthShares kommt aus data.months, summiert auf 100', () => {
    expect(world).toHaveLength(13)
    expect(world.reduce((s, v) => s + v, 0)).toBeCloseTo(100, 8)
    expect(world.map((v) => Math.round(v * 10) / 10)).toEqual([6.0, 12.5, 12.1, 9.3, 7.1, 5.8, 7.4, 9.0, 6.9, 3.7, 4.8, 7.8, 7.6])
  })

  it('Erhebungsluecke Jan 2024: 30.766 gegen 104.604 im Mai 2023', () => {
    const m = new Map(data.months.map((x) => [x.month, x.n]))
    expect(m.get('2024-01')).toBe(30766)
    expect(m.get('2023-05')).toBe(104604)
    expect(Math.min(...world)).toBeCloseTo(world[9], 10)
  })

  it('gemeinsame y-Skala 0..35 % deckt das reale Maximum 32,6 % (Nigeria 2023-05)', () => {
    let best = { share: -1 }
    C.forEach((c) => {
      const n = c.trend.reduce((s, v) => s + v, 0)
      c.trend.forEach((v, j) => {
        const share = (v / n) * 100
        if (share > best.share) best = { share, country: c.country, j }
      })
    })
    expect(best.share).toBeCloseTo(32.6, 1)
    expect(best.country).toBe('Nigeria')
    expect(data.months[best.j].month).toBe('2023-05')
    expect(best.share).toBeLessThan(35)
  })

  it('TVD gegen das Weltprofil: Canada 0,0729 (min), Jamaica 0,4201 (max)', () => {
    const byName = Object.fromEntries(C.map((c) => [c.country, tvd(c, world)]))
    expect(byName.Canada).toBeCloseTo(0.0729, 4)
    expect(byName.Jamaica).toBeCloseTo(0.4201, 4)
    expect(byName.Nigeria).toBeCloseTo(0.4031, 4)
    expect(byName.Estonia).toBeCloseTo(0.382, 4)
    const vals = Object.values(byName)
    expect(Math.min(...vals)).toBeCloseTo(0.0729, 4)
    expect(Math.max(...vals)).toBeCloseTo(0.4201, 4)
  })
})

describe('Die Treppe (Dossier, Zeit-Toggle "Tempo")', () => {
  it('Grenzen monoton, in [0,13], Laenge = round(n/1000) fuer alle 53 Laender', () => {
    const tc = threadCounts(C)
    C.forEach((c, i) => {
      const steps = staircase(c.trend, tc[i])
      expect(steps).toHaveLength(tc[i])
      let prev = 0
      for (const s of steps) {
        expect(s.t0).toBeGreaterThanOrEqual(prev - 1e-9)
        expect(s.t1).toBeGreaterThanOrEqual(s.t0 - 1e-9)
        expect(s.t0).toBeGreaterThanOrEqual(0)
        expect(s.t1).toBeLessThanOrEqual(13 + 1e-9)
        prev = s.t1
      }
    })
  })

  it('gleichmaessiger Verlauf ergibt gleich lange Stufen', () => {
    const steps = staircase(new Array(13).fill(1000), 13)
    expect(steps).toHaveLength(13)
    steps.forEach((s, j) => {
      expect(s.t0).toBeCloseTo(j, 9)
      expect(s.t1).toBeCloseTo(j + 1, 9)
    })
  })
})

describe('Beleg-Index (Spalte c7, 1 Strich = 1 Dokument)', () => {
  it('846 Belege = 588 samples + 258 graySamples, IDs eindeutig und stabil', () => {
    expect(index.docs).toHaveLength(846)
    expect(index.docs.filter((d) => d.kind === 's')).toHaveLength(588)
    expect(index.docs.filter((d) => d.kind === 'g')).toHaveLength(258)
    expect(new Set(index.docs.map((d) => d.id)).size).toBe(846)
    expect(index.docs[0].id).toBe('0:s:0')
    expect(index.byCountry).toHaveLength(53)
    expect(index.byCountry.reduce((s, a) => s + a.length, 0)).toBe(846)
  })

  it('5 bis 17 samples und 1 bis 5 graySamples je Land - das Slot-Raster ist 17 + 5', () => {
    const s = C.map((c) => c.samples.length)
    const g = C.map((c) => c.graySamples.length)
    expect(Math.min(...s)).toBe(5)
    expect(Math.max(...s)).toBe(17)
    expect(Math.min(...g)).toBe(1)
    expect(Math.max(...g)).toBe(5)
  })

  it('Laengenquantile ueber alle 846: 25 / 122 / 426,5 / 1519 / 1995,5', () => {
    const q = lengthQuantiles(index.docs)
    expect(q.n).toBe(846)
    expect(q.min).toBe(25)
    expect(q.p25).toBeCloseTo(122, 6)
    expect(q.p50).toBeCloseTo(426.5, 6)
    expect(q.p75).toBeCloseTo(1519, 6)
    // Der Wert wird zur Laufzeit berechnet, im Interface steht nie eine hartcodierte Zahl.
    expect(q.p90).toBeCloseTo(1995.5, 6)
  })

  it('Laengenquantile nur ueber die 588 samples liegen sichtbar niedriger', () => {
    const q = lengthQuantiles(index.docs.filter((d) => d.kind === 's'))
    expect(q.n).toBe(588)
    expect(q.p25).toBeCloseTo(106, 6)
    // Oeffentliche Fassung: zwei Texte entfernt (data/pipelines/redact_public.py), R-7 ueber 588 Werte ergibt 305.
    expect(q.p50).toBeCloseTo(305, 6)
    expect(q.p75).toBeCloseTo(1349, 6)
    expect(q.p90).toBeCloseTo(1993, 6)
    // Die Grundgesamtheit ist also entscheidbar - genau deshalb steht sie im Interface dabei.
    expect(q.p50).toBeLessThan(lengthQuantiles(index.docs).p50)
  })

  it('capped markiert die Pipeline-Kappung bei 2.000 Zeichen', () => {
    const capped = index.docs.filter((d) => d.capped)
    expect(DOC_CAP).toBe(2000)
    // String.length misst UTF-16-Codeeinheiten; gerendert wird der Laufzeitwert.
    expect(capped).toHaveLength(35)
    expect(capped.filter((d) => d.kind === 's')).toHaveLength(15)
    expect(capped.filter((d) => d.kind === 'g')).toHaveLength(20)
    expect(capped.every((d) => d.len >= 2000)).toBe(true)
  })

  it('graySamples tragen Score und Dimension: 0,251 bis 0,580 ueber theta = 0,25', () => {
    const gray = index.docs.filter((d) => d.kind === 'g')
    const scores = gray.map((d) => d.score)
    expect(data.moderation.threshold).toBe(0.25)
    expect(Math.min(...scores)).toBeCloseTo(0.251, 6)
    expect(Math.max(...scores)).toBeCloseTo(0.58, 6)
    expect(scores.every((s) => s > data.moderation.threshold)).toBe(true)
    const byDim = {}
    gray.forEach((d) => { byDim[d.dim] = (byDim[d.dim] || 0) + 1 })
    expect(byDim).toEqual({ violence: 221, sexual: 25, harassment: 11, 'self-harm': 1 })
    // hate ist bei theta = 0,25 exakt leer: Nachweisgrenze des Public Sets, kein Befund.
    expect(byDim.hate).toBeUndefined()
    expect(data.moderation.byDim.hate).toBe(0.0)
    expect(data.moderation.byDim['self-harm']).toBe(0.0)
  })

  it('modTop ist nominal mit 4 Auspraegungen -> Kanal Form, nicht Farbe', () => {
    const cnt = {}
    C.forEach((c) => { const k = c.modTop ?? 'null'; cnt[k] = (cnt[k] || 0) + 1 })
    expect(cnt).toEqual({ violence: 38, sexual: 9, harassment: 5, null: 1 })
    expect(C.find((c) => c.modTop == null).country).toBe('Nigeria')
  })

  it('nearestCrossCountry springt in ein anderes Land derselben Kategorie', () => {
    const doc = index.docs.find((d) => d.cat === 'Rollenspiel/Story')
    const hit = nearestCrossCountry(doc, index)
    expect(hit).not.toBeNull()
    expect(hit.cat).toBe(doc.cat)
    expect(hit.ci).not.toBe(doc.ci)
    const second = nearestCrossCountry(doc, index, [hit.ci])
    expect(second.ci).not.toBe(hit.ci)
    expect(Math.abs(second.len - doc.len)).toBeGreaterThanOrEqual(Math.abs(hit.len - doc.len))
  })
})

describe('Sortierschluessel (Yi: reconfigure)', () => {
  it('sechs Schluessel liegen als parallele Vektoren vor', () => {
    const k = sortKeys(C, world)
    expect(Object.keys(k).sort()).toEqual(['avgTurns', 'modPct', 'n', 'name', 'sonstiges', 'tvd'])
    expect(k.n).toHaveLength(53)
    expect(Math.min(...k.avgTurns)).toBe(1.5)
    expect(Math.max(...k.avgTurns)).toBe(3.8)
  })

  it('orderByKey sortiert stabil und deterministisch, absteigend wie aufsteigend', () => {
    const k = sortKeys(C, world)
    const byN = orderByKey(k.n, true)
    expect(C[byN[0]].country).toBe('United States')
    expect(C[byN[52]].country).toBe('Greece')
    const byMod = orderByKey(k.modPct, true, k.n)
    expect(C[byMod[0]].country).toBe('Israel')
    expect(C[byMod[52]].country).toBe('Nigeria')
    expect(orderByKey(k.n, false)[0]).toBe(byN[52])
    const byName = orderByKey(k.name, false)
    expect(C[byName[0]].country.localeCompare(C[byName[52]].country, 'de')).toBeLessThan(0)
    // zweimal dieselbe Eingabe -> dieselbe Ordnung (Voraussetzung fuer Object Constancy)
    expect(orderByKey(k.modPct, true, k.n)).toEqual(byMod)
  })
})
