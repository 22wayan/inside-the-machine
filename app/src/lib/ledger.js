// Akt 4 "Das Register" - reines Statistik- und Ableitungsmodul.
//
// WARUM EIN EIGENES MODUL (Munzner, Nested Model 2009, Ebene "Abstraction"):
// Die Pointe des Akts ist eine Zahl (r = 0,71 faellt auf r = 0,24, sobald zwei Laender fehlen).
// Wandert diese Zahl, bricht Rubrik-Kriterium 1. Deshalb liegen alle Kennzahlen in reinen,
// testbaren Funktionen und werden NIE im Render hartcodiert.
//
// KEINE NEUE DEPENDENCY: d3-array ist im Projekt nicht installiert (nur d3-quadtree, d3-scale,
// d3-selection, d3-zoom). quantile (R-7), das Log-Histogramm und easeCubicInOut sind deshalb
// hier von Hand implementiert und in ledger.test.js gegen die echte wildchat.json geprueft.

// ---------------------------------------------------------------------------
// Konstanten
// ---------------------------------------------------------------------------

// Die 9 Heuristik-Kategorien in globaler Rangfolge (= Reihenfolge in data.globalCats).
export const CATS9 = [
  'Sonstiges',
  'Wissen/Erklären',
  'Schreiben/Text',
  'Rollenspiel/Story',
  'Programmieren',
  'Bild-Prompts',
  'Übersetzen',
  'Mathe/Logik',
  'Ratschlag',
]

// 7 Buckets < Munzners 8er-Grenze fuer kategoriale Hue-Kodierung (Kap. 5).
// Die drei kleinsten Kategorien (zusammen 2,5 %) wandern in einen Rest-Bucket; ihre Farbe bekommen
// sie per encode-on-demand zurueck, sobald sie gefiltert werden.
export const BUCKET_KEYS = [
  'Sonstiges',
  'Wissen/Erklären',
  'Schreiben/Text',
  'Rollenspiel/Story',
  'Programmieren',
  'Bild-Prompts',
  'Rest',
]
export const BUCKET_REST_MEMBERS = ['Übersetzen', 'Mathe/Logik', 'Ratschlag']

// Deutsche Namen fuer die 144 px breite Namensspalte c1.
// VOLLSTAENDIG: alle 53 Laender aus wildchat.json countries[].country. Ein halb uebersetztes
// Register ("Germany" neben "Niederlande") ist der auffaelligste Textfehler der zentralen
// Visualisierung - deshalb ist diese Tabelle in ledger.test.js gegen die Daten abgesichert.
// Wo der amtliche deutsche Name die Spalte sprengt, steht die uebliche Kurzform
// (Vereinigte Arabische Emirate -> VAE); alles andere steht ausgeschrieben.
// BUGFIX gegenueber dem Altcode (WildChatMap.jsx:46): dort stand 'Netherlands', die Daten sagen
// 'The Netherlands' - der Eintrag hat nie gegriffen.
export const SHORT = {
  'United States': 'USA',
  Russia: 'Russland',
  China: 'China',
  'Hong Kong': 'Hongkong',
  'United Kingdom': 'UK',
  Germany: 'Deutschland',
  France: 'Frankreich',
  Japan: 'Japan',
  India: 'Indien',
  Canada: 'Kanada',
  Egypt: 'Ägypten',
  Singapore: 'Singapur',
  Taiwan: 'Taiwan',
  Brazil: 'Brasilien',
  'DR Congo': 'DR Kongo',
  Philippines: 'Philippinen',
  Türkiye: 'Türkei',
  Italy: 'Italien',
  'The Netherlands': 'Niederlande',
  Vietnam: 'Vietnam',
  Australia: 'Australien',
  Iran: 'Iran',
  Morocco: 'Marokko',
  Poland: 'Polen',
  Ukraine: 'Ukraine',
  'South Korea': 'Südkorea',
  Spain: 'Spanien',
  Mexico: 'Mexiko',
  Romania: 'Rumänien',
  'Saudi Arabia': 'Saudi-Arabien',
  Belarus: 'Belarus',
  'New Zealand': 'Neuseeland',
  Indonesia: 'Indonesien',
  Algeria: 'Algerien',
  Israel: 'Israel',
  Malaysia: 'Malaysia',
  Peru: 'Peru',
  Pakistan: 'Pakistan',
  Argentina: 'Argentinien',
  Estonia: 'Estland',
  Jamaica: 'Jamaika',
  Venezuela: 'Venezuela',
  Belgium: 'Belgien',
  Nigeria: 'Nigeria',
  Portugal: 'Portugal',
  Colombia: 'Kolumbien',
  Sweden: 'Schweden',
  'United Arab Emirates': 'VAE',
  Finland: 'Finnland',
  Ethiopia: 'Äthiopien',
  Uzbekistan: 'Usbekistan',
  Hungary: 'Ungarn',
  Greece: 'Griechenland',
}

// Ein Kammstrich buendelt 1.000 Gespraeche (Einheiten-Kamm, Kopfband).
export const THREAD_UNIT = 1000

// Pipeline-Kappung: build_wildchat.py schneidet Belege bei 2.000 Zeichen ab.
export const DOC_CAP = 2000

// ---------------------------------------------------------------------------
// Numerische Grundbausteine (Ersatz fuer nicht installierte d3-Module)
// ---------------------------------------------------------------------------

/** Kubische Ease-in-out. Ersatz fuer d3-ease (nicht installiert). */
export const easeCubicInOut = (t) => {
  const u = t < 0 ? 0 : t > 1 ? 1 : t
  return u < 0.5 ? 4 * u * u * u : 1 - ((-2 * u + 2) ** 3) / 2
}

/**
 * Quantil nach Typ 7 (R-Default, identisch zu numpy 'linear' und d3.quantile).
 * Erwartet ein AUFSTEIGEND sortiertes Array.
 */
export function quantile(sorted, p) {
  const n = sorted.length
  if (n === 0) return NaN
  if (n === 1) return sorted[0]
  const q = p < 0 ? 0 : p > 1 ? 1 : p
  const h = (n - 1) * q
  const lo = Math.floor(h)
  const hi = Math.ceil(h)
  if (lo === hi) return sorted[lo]
  return sorted[lo] + (h - lo) * (sorted[hi] - sorted[lo])
}

/** Arithmetisches Mittel; leeres Array -> NaN. */
const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN)

/** Produkt-Moment-Korrelation nach Pearson. */
export function pearson(x, y) {
  const n = Math.min(x.length, y.length)
  if (n < 2) return NaN
  const mx = mean(x)
  const my = mean(y)
  let sxy = 0
  let sxx = 0
  let syy = 0
  for (let i = 0; i < n; i++) {
    const dx = x[i] - mx
    const dy = y[i] - my
    sxy += dx * dy
    sxx += dx * dx
    syy += dy * dy
  }
  const denom = Math.sqrt(sxx * syy)
  return denom === 0 ? NaN : sxy / denom
}

/** Raenge 1..n, Bindungen auf das Mittel der belegten Raenge gesetzt. */
export function rankAvg(values) {
  const idx = values.map((_, i) => i).sort((a, b) => values[a] - values[b])
  const out = new Array(values.length)
  let i = 0
  while (i < idx.length) {
    let j = i
    while (j + 1 < idx.length && values[idx[j + 1]] === values[idx[i]]) j++
    const avg = (i + j) / 2 + 1
    for (let k = i; k <= j; k++) out[idx[k]] = avg
    i = j + 1
  }
  return out
}

/** Rangkorrelation nach Spearman (Bindungen gemittelt). */
export const spearman = (x, y) => pearson(rankAvg(x), rankAvg(y))

/** Kleinste Quadrate, y = m*x + b. */
export function olsFit(x, y) {
  const n = Math.min(x.length, y.length)
  if (n < 2) return { m: NaN, b: NaN }
  const mx = mean(x)
  const my = mean(y)
  let sxy = 0
  let sxx = 0
  for (let i = 0; i < n; i++) {
    sxy += (x[i] - mx) * (y[i] - my)
    sxx += (x[i] - mx) ** 2
  }
  if (sxx === 0) return { m: NaN, b: NaN }
  const m = sxy / sxx
  return { m, b: my - m * mx }
}

/**
 * Hebelpunkte einer einfachen linearen Regression: h_i = 1/n + (x_i - x̄)² / Σ(x_j - x̄)².
 * Bei genau einem Praediktor ist die Rangfolge identisch zu |x_i - x̄|.
 *
 * Damit werden die beiden Ausreisser des Leverage-Toggles AUS DEN DATEN bestimmt und nicht
 * per Namensliste gesetzt. Anscombe 1973 als Bedienelement funktioniert nur, wenn die Auswahl
 * selbst ein Befund ist: Jamaica (79 % Rollenspiel) und Israel (63 %) liegen 64,4 bzw. 48,4
 * Prozentpunkte ueber dem Mittel von 14,6 - der naechste Punkt liegt bei 31,4.
 */
export function leveragePoints(x, k = 2) {
  const n = x.length
  if (!n) return []
  const mx = mean(x)
  const sxx = x.reduce((s, v) => s + (v - mx) ** 2, 0) || 1
  return x
    .map((v, i) => ({ i, h: 1 / n + ((v - mx) ** 2) / sxx }))
    .sort((a, b) => b.h - a.h)
    .slice(0, k)
}

/**
 * Wilson-Score-Intervall (95 %) fuer einen Anteil in PROZENTPUNKTEN.
 * Vorbehalt, der im Interface mitlaufen muss: rechnet auf Gespraechen, nicht auf Personen
 * (rund 4 bis 7 Gespraeche je hashed_ip) - die echten Intervalle sind breiter.
 */
export function wilson95(pct, n) {
  if (!(n > 0)) return { lo: NaN, hi: NaN, half: NaN }
  const z = 1.959963984540054
  const p = pct / 100
  const z2 = z * z
  const denom = 1 + z2 / n
  const center = (p + z2 / (2 * n)) / denom
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom
  return { lo: (center - half) * 100, hi: (center + half) * 100, half: half * 100 }
}

// ---------------------------------------------------------------------------
// Ableitungen aus wildchat.json
// ---------------------------------------------------------------------------

/**
 * Monatsanteile der WELT in Prozent, 13 Werte, Summe 100.
 * Basis ist data.months (alle 837.989 Gespraeche), NICHT die Summe der Laender-trends
 * (796.322). Beide unterscheiden sich um bis zu 0,2 pp; die Weltreferenz soll den kompletten
 * Datensatz beschreiben, sonst waere die Referenzlinie selbst schon gefiltert.
 */
export function worldMonthShares(data) {
  const months = data?.months || []
  const total = months.reduce((s, m) => s + (m.n || 0), 0)
  if (!total) return months.map(() => 0)
  return months.map((m) => ((m.n || 0) / total) * 100)
}

/**
 * Total Variation Distance zwischen dem Monatsprofil eines Landes und dem Weltprofil.
 * 0 = deckungsgleich, 1 = disjunkt. Dient als Sortierschluessel "Verlauf" (Spalte c6).
 */
export function tvd(country, worldShares) {
  const trend = country?.trend || []
  const n = trend.reduce((s, v) => s + v, 0)
  if (!n) return 0
  let sum = 0
  for (let j = 0; j < worldShares.length; j++) {
    sum += Math.abs(((trend[j] || 0) / n) * 100 - worldShares[j])
  }
  return sum / 200
}

/**
 * Kammstriche je Land: round(n / 1000). Summe = 797, min 2, max 171, kein Land bei 0.
 * Das ist das Ehrlichkeits-Objekt des Kopfbands: eine zaehlbare Einheit statt einer Flaeche.
 */
export function threadCounts(countries) {
  const out = new Int16Array(countries.length)
  for (let i = 0; i < countries.length; i++) out[i] = Math.round((countries[i].n || 0) / THREAD_UNIT)
  return out
}

/** Roher, NICHT normierter Anteil einer Kategorie (so wie er im Datensatz steht). */
export function catPct(country, cat) {
  const hit = (country?.cats || []).find((x) => x.cat === cat)
  return hit ? hit.pct || 0 : 0
}

/**
 * cats[] ist sparse (3 bis 9 Eintraege je Land) und summiert roh auf 98 bis 102 %.
 * normCats fuellt auf alle 9 Kategorien auf und normiert auf exakt 100 - sonst haette der
 * 100-%-Stapel in c3 keinen gemeinsamen Nullpunkt und keine gemeinsame Gesamtlaenge.
 */
export function normCats(country) {
  const raw = {}
  let sum = 0
  for (const key of CATS9) {
    const v = catPct(country, key)
    raw[key] = v
    sum += v
  }
  const out = {}
  if (sum <= 0) {
    for (const key of CATS9) out[key] = 0
    return out
  }
  for (const key of CATS9) out[key] = (raw[key] / sum) * 100
  return out
}

/** Die 7 Stapelsegmente von c3 in fixer Reihenfolge, Summe exakt 100. */
export function bucketCats(country) {
  const norm = normCats(country)
  return BUCKET_KEYS.map((key) => (key === 'Rest'
    ? BUCKET_REST_MEMBERS.reduce((s, m) => s + norm[m], 0)
    : norm[key]))
}

/**
 * Baut den flachen Beleg-Index ueber alle 848 lesbaren Gespraeche.
 * Jeder Beleg bekommt eine STABILE ID `${ci}:${'s'|'g'}:${i}` - damit ist ein Strich in c7
 * genau ein Dokument (behebt den Altfehler, dass ein Punkt per pool[i % pool.length] auf ein
 * beliebiges Beispiel zeigte und 589 von 590 samples unerreichbar waren).
 *
 * len = String.length (UTF-16-Codeeinheiten), also genau das Mass, mit dem die Kodierung
 * spaeter rechnet. capped markiert die Pipeline-Kappung bei 2.000 Zeichen.
 */
export function buildDocIndex(countries) {
  const docs = []
  const byCountry = countries.map(() => [])
  const byCat = new Map()
  const push = (ci, kind, i, raw) => {
    const t = raw.t || ''
    const doc = {
      id: `${ci}:${kind}:${i}`,
      ci,
      kind,
      i,
      t,
      country: countries[ci].country,
      cat: raw.cat || 'Sonstiges',
      len: t.length,
      score: raw.score ?? null,
      dim: raw.dim ?? null,
      redacted: Boolean(raw.sourceRedacted),
      capped: t.length >= DOC_CAP,
    }
    docs.push(doc)
    byCountry[ci].push(doc)
    if (!byCat.has(doc.cat)) byCat.set(doc.cat, [])
    byCat.get(doc.cat).push(doc)
  }
  countries.forEach((c, ci) => {
    ;(c.samples || []).forEach((s, i) => push(ci, 's', i, s))
    ;(c.graySamples || []).forEach((s, i) => push(ci, 'g', i, s))
  })
  return { docs, byCountry, byCat }
}

/** Laengenquantile (R-7) ueber eine Beleg-Liste. Speist Lineal, Laengenleiter und Histogramm. */
export function lengthQuantiles(docs) {
  const sorted = docs.map((d) => (typeof d === 'number' ? d : d.len)).sort((a, b) => a - b)
  return {
    n: sorted.length,
    min: sorted.length ? sorted[0] : NaN,
    p25: quantile(sorted, 0.25),
    p50: quantile(sorted, 0.5),
    p75: quantile(sorted, 0.75),
    p90: quantile(sorted, 0.9),
    max: sorted.length ? sorted[sorted.length - 1] : NaN,
  }
}

/**
 * Anteil der Belege, die STRIKT kuerzer sind als len, in Prozent.
 * Speist im Lesetisch den Satz "laenger als 78 % aller lesbaren Belege" - der Leser erfaehrt,
 * wo genau das Dokument vor ihm in der Verteilung steht. Binaere Suche auf sortierten Laengen.
 */
export function pctShorterThan(sortedLens, len) {
  const n = sortedLens.length
  if (!n) return NaN
  let lo = 0
  let hi = n
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (sortedLens[mid] < len) lo = mid + 1
    else hi = mid
  }
  return (lo / n) * 100
}

/**
 * Themenmix eines Landes gegen den Weltmix, in PROZENTPUNKTEN, nach |Delta| absteigend.
 * Beide Seiten laufen durch normCats - sonst verglichen wir eine auf 100 normierte Verteilung
 * mit einer Rohsumme von 98 bis 102 und die Differenz haette einen Sockel aus Rundungsfehlern.
 */
export function catDeltas(country, globalCats) {
  const world = normCats({ cats: globalCats })
  const own = normCats(country)
  return CATS9
    .map((cat) => ({ cat, delta: own[cat] - world[cat], own: own[cat], world: world[cat] }))
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
}

/**
 * Belegte Moderations-Dimensionen unter den graySamples, absteigend.
 * Erst diese Zahlenreihe macht sichtbar, dass hate bei theta = 0,25 exakt leer ist:
 * violence 221 · sexual 25 · harassment 11 · self-harm 1, hate 0.
 */
export function dimCounts(docs) {
  const acc = new Map()
  for (const d of docs) {
    if (d.kind !== 'g' || !d.dim) continue
    acc.set(d.dim, (acc.get(d.dim) || 0) + 1)
  }
  return [...acc.entries()].sort((a, b) => b[1] - a[1])
}

/**
 * Histogramm auf log10-x. Ersatz fuer d3-array bin(). Die Textlaengen spannen ueber knapp zwei
 * Dekaden (25 bis rund 2.000 Zeichen) und sind stark rechtsschief - linear gebinnt waere das
 * erste Bin die ganze Verteilung.
 */
export function histLog(lens, bins = 30) {
  const vals = lens.filter((v) => Number.isFinite(v) && v > 0)
  if (!vals.length || bins < 1) return []
  let min = Infinity
  let max = -Infinity
  for (const v of vals) {
    if (v < min) min = v
    if (v > max) max = v
  }
  const lo = Math.log10(min)
  const span = Math.log10(max) - lo || 1
  const out = []
  for (let i = 0; i < bins; i++) {
    out.push({ x0: 10 ** (lo + (span * i) / bins), x1: 10 ** (lo + (span * (i + 1)) / bins), n: 0 })
  }
  for (const v of vals) {
    const k = Math.min(bins - 1, Math.floor(((Math.log10(v) - lo) / span) * bins))
    out[k].n++
  }
  return out
}

/**
 * Die sechs Sortierschluessel als parallele Wertevektoren (Index = Landindex).
 * Bertin, matrice ordonnable: das Umordnen IST die Analyse, deshalb liegen alle Schluessel
 * gleichzeitig vor und der Wechsel kostet nur einen Vergleich.
 */
export function sortKeys(countries, worldShares) {
  return {
    n: countries.map((c) => c.n || 0),
    modPct: countries.map((c) => c.modPct ?? 0),
    avgTurns: countries.map((c) => c.avgTurns ?? 0),
    tvd: countries.map((c) => tvd(c, worldShares)),
    sonstiges: countries.map((c) => bucketCats(c)[0]),
    // Sortiert wird nach dem ANGEZEIGTEN (deutschen) Namen: das Blatt schreibt "Ägypten", also
    // muss "Land A-Z" auch dort beginnen und nicht bei "Algeria".
    name: countries.map((c) => shortName(c.country || '')),
  }
}

/**
 * Stabile Reihenfolge der Landindizes nach einem Wertevektor.
 * Tiebreak immer ueber das Volumen, damit die Ordnung deterministisch und reproduzierbar ist.
 */
export function orderByKey(values, desc = true, tiebreak = null) {
  const idx = values.map((_, i) => i)
  const cmp = (a, b) => {
    const va = values[a]
    const vb = values[b]
    let d = 0
    if (typeof va === 'string' || typeof vb === 'string') d = String(va).localeCompare(String(vb), 'de')
    else d = va - vb
    if (d !== 0) return desc ? -d : d
    if (tiebreak) return tiebreak[b] - tiebreak[a]
    return a - b
  }
  return idx.sort(cmp)
}

/**
 * Die Treppe: kumulative Inversion von trend[13].
 * Linie j spannt von dem Zeitpunkt, an dem das Land sein j-tes Tausend begonnen hat, bis zu dem,
 * an dem es voll war. Laenge = Zeit fuer 1.000 Gespraeche = Kehrwert der Aktivitaet.
 * Innerhalb eines Monats linear interpoliert (nur Monatssummen liegen vor); Monatsgrenzen exakt.
 */
export function staircase(trend, k) {
  const cum = []
  let acc = 0
  for (const v of trend) {
    acc += v || 0
    cum.push(acc)
  }
  const total = acc
  const months = trend.length
  const at = (target) => {
    if (target <= 0) return 0
    if (target >= total) return months
    let j = 0
    while (j < cum.length && cum[j] < target) j++
    const prev = j > 0 ? cum[j - 1] : 0
    const span = cum[j] - prev
    return j + (span > 0 ? (target - prev) / span : 0)
  }
  const out = []
  for (let i = 0; i < k; i++) out.push({ t0: at(i * THREAD_UNIT), t1: at((i + 1) * THREAD_UNIT) })
  return out
}

/**
 * Querschnitt-Sprung: derselbe Kategorie-Typ im naechstgelegenen ANDEREN Land.
 * Minimale absolute Differenz der Zeichenzahl, bereits besuchte Laender ausgeschlossen.
 */
export function nearestCrossCountry(doc, index, visited = []) {
  if (!doc) return null
  const seen = new Set(visited)
  seen.add(doc.ci)
  let best = null
  let bestD = Infinity
  for (const cand of index.byCat.get(doc.cat) || []) {
    if (seen.has(cand.ci)) continue
    const d = Math.abs(cand.len - doc.len)
    if (d < bestD) {
      bestD = d
      best = cand
    }
  }
  return best
}

// ---------------------------------------------------------------------------
// Formatierung
// ---------------------------------------------------------------------------

/** Deutsche Zahlformatierung mit fester Nachkommastelle (tabular-nums im Interface). */
export const fmtDE = (v, digits = 0) => (Number.isFinite(v)
  ? Number(v).toLocaleString('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits })
  : '–')

/** Vorzeichenbehaftete Prozentpunkt-Differenz, typografisches Minus. */
export const fmtSignedPP = (v) => `${v >= 0 ? '+' : '−'}${fmtDE(Math.abs(v), 1)} pp`

/** Kurzname fuer die 144 px breite Spalte c1. */
export const shortName = (name) => SHORT[name] || name
