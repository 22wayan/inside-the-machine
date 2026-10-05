import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useReducedMotion } from 'motion/react'
import { CAT_BUCKET, CAT_COLOR, PAL, SCENE_BG } from '../theme'
import {
  BUCKET_KEYS, CATS9, buildDocIndex, bucketCats, catPct, fmtDE, lengthQuantiles,
  normCats, orderByKey, shortName, sortKeys, threadCounts, worldMonthShares,
} from '../lib/ledger'
import { Reveal, SourceNote } from './Motion'
import LedgerSheet from './ledger/LedgerSheet'
import EvidencePanel from './ledger/EvidencePanel'
import LedgerDossier from './ledger/LedgerDossier'
import ReadingDesk from './ledger/ReadingDesk'
import CatFlight from './ledger/CatFlight'
import SheetLegend from './ledger/SheetLegend'
import UseOverview from './ledger/UseOverview'
import { MOD_LABEL, chipBtn, toggleBtn } from './ledger/uiKit'
import {
  COLS, HIST_BINS, MARK_COL_KEYS, MOD_FOCUS, MOD_TAIL_SQUEEZE, RESPONSIVE_MIN,
  columnsFor, docHeightScale, inBrush, modScale, volumeScale,
} from './ledger/geometry'

// AKT 4 - "DAS GESPRAECH", zwei Ebenen (ConversationLedger)
//
// EBENE 1 (UseOverview): die Frage des Akts plus EINE direkt beschriftete Grafik der 9
// Nutzungs-Kategorien ueber alle Gespraeche. In Sekunden lesbar, ohne Legende, ohne Vorwissen.
// EBENE 2 (dieses Modul, ab detail === true): das vollstaendige Register.
//
// WARUM GETRENNT (Shneiderman 1996, overview first / details on demand): das Register ist die
// analytisch tragende Grafik des Projekts, aber als Erstkontakt ist es eine Wand. Wer die Frage
// des Akts nicht kennt, liest 53 Zeilen x vier Mark-Spalten als Dekoration. Die Trennung kostet
// nichts an Substanz - es aendert sich Reihenfolge und Sichtbarkeitsebene, kein Inhalt.
//
// GENREWECHSEL ALS SEQUENZSIGNAL (Segel & Heer 2010, Hullman): nach drei Akten Teleskop liegt
// hier ein Dokument auf dem Tisch. Figur-Grund-Umkehr (Ware) - der staerkste preattentive Bruch
// der ganzen Story, ohne einen einzigen neuen Farbwert.
//
// WARUM KEINE KARTE: lat/lon sind bewusst NICHT kodiert. Die Laenderzuordnung stammt aus der
// IP-Adresse, VPN ist nicht korrigierbar, und eine Choroplethe brauchte Flaechen, die hier
// nichts messen (Munzner Kap. 11: MAUP, Flaechenbias). Die Zeilenposition ist eine Rangordnung,
// kein Raum. Flaeche und Winkel tragen in diesem Akt nirgends einen Wert.
//
// WARUM EINE REORDERBARE MATRIX: Bertin, Semiologie graphique - matrice ordonnable. Das
// Umordnen IST die Analyse (Rao & Card, The Table Lens, CHI 1994). Der Primaerkanal ist
// Position bzw. Laenge auf gemeinsamer Skala (Cleveland & McGill 1984, Rang 1 und 2).

const SORT_LABEL = { c1: 'Land', c2: 'Volumen', c3: 'Thema', c4: 'Graubereich' }
// Mark-Spalten = die Spalten, in denen eine MARK gezeichnet wird (Balken, Stapel, Glyphe, Strich).
// Rang (c0) und Land (c1) tragen Text, keine Mark, und zaehlen deshalb nicht mit.
const MARK_COLS = MARK_COL_KEYS // eine Quelle: siehe ledger/geometry.js
const DEFAULT_DIR = { c1: 'asc', c2: 'desc', c3: 'desc', c4: 'desc' }
const FILTER_MIN_N = 5000

export default function ConversationLedger({ data: injected = null, detailOpen = false }) {
  const [fetched, setFetched] = useState(null)
  const data = injected ?? fetched

  // Der Datensatz kommt normalerweise per fetch. Als Prop injizierbar zu sein, kostet nichts und
  // macht die Sektion ohne Browser pruefbar (render.test.jsx haelt die e2e-Invarianten fest:
  // genau ein Canvas, genau eine sr-only-Tabelle, Anker #wildchat).
  useEffect(() => {
    if (injected) return
    const B = import.meta.env.BASE_URL
    fetch(`${B}data/wildchat.json`).then((r) => r.json()).then(setFetched).catch((e) => console.error('wildchat:', e))
  }, [injected])

  // Die Sektion MUSS auch ohne Daten existieren: App.jsx verankert hier den Akt und
  // Motion.jsx misst ihre offsetTop fuer die Fortschrittsleiste. Kein Early-Return davor.
  //
  // detailOpen ist der Startzustand der zweiten Ebene. Er ist Prop und nicht nur State, damit
  // der Struktur-Test das Register ohne Browser und ohne Klick rendern kann - dieselbe
  // Begruendung wie beim injizierten Datensatz.
  return (
    <section id="wildchat" aria-label="Wie die Welt mit KI redet" className="act" style={{ background: SCENE_BG }}>
      {data ? <Ledger data={data} detailOpen={detailOpen} /> : (
        <div className="layout-container">
          <div className="editorial-grid">
            <p className="t-data text-column" style={{ color: PAL.muted }}>Register wird geladen …</p>
          </div>
        </div>
      )}
    </section>
  )
}

/** 12 Bins ueber die 53 Laenderwerte einer Spalte - der Kopf traegt selbst Daten. */
function hist12(values) {
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const bins = new Array(HIST_BINS).fill(0)
  for (const v of values) bins[Math.min(HIST_BINS - 1, Math.floor(((v - min) / span) * HIST_BINS))]++
  return bins
}

function Ledger({ data, detailOpen = false }) {
  const motionReduce = useReducedMotion()
  const [osReduce, setOsReduce] = useState(false)
  // In-Page-Schalter neben prefers-reduced-motion: nicht jeder, der eine Transition abstellen
  // will, hat das im Betriebssystem gesetzt - und im Screenshot-Vergleich ist ein sichtbarer
  // Schalter der einzige Weg, beide Motion-Zweige ohne Systemeinstellung zu pruefen.
  const [uiReduce, setUiReduce] = useState(false)
  const [sortCol, setSortCol] = useState('c2')
  const [sortDir, setSortDir] = useState('desc')
  const [focusCat, setFocusCat] = useState(null)
  const [onlyBig, setOnlyBig] = useState(false)
  const [brush, setBrush] = useState(null)
  const [trendMode, setTrendMode] = useState('share')
  // Responsive-Stufe: >= 1200 px die volle Aufteilung, darunter gibt c3 80 px an c4 ab.
  // Lazy initialisiert und window-frei lauffaehig (der Struktur-Test rendert ohne DOM).
  const [wide, setWide] = useState(() => (typeof window === 'undefined' || typeof window.matchMedia !== 'function'
    ? true
    : window.matchMedia(`(min-width: ${RESPONSIVE_MIN}px)`).matches))
  const [selCi, setSelCi] = useState(null)
  const [hoverCi, setHoverCi] = useState(null)
  const [hoverBucket, setHoverBucket] = useState(null)
  // Algorithm-Ebene des Nested Model: die Zeichenzeit ist gemessen, nicht geschaetzt - und sie
  // bleibt aktuell, weil LedgerSheet den laufenden Median nachliefert statt einmal zu publizieren.
  const [draw, setDraw] = useState(null)
  const [live, setLive] = useState('')
  // Der Lesetisch haelt zwei Dinge auseinander: welcher Beleg gerade OFFEN ist (openDoc) und
  // welcher Strich ihn AUSGELOEST hat (originId). Escape gibt den Fokus an den Ausloeser zurueck,
  // auch wenn man sich vorher durch fuenf Laender geblaettert hat.
  const [openDoc, setOpenDoc] = useState(null)
  // Ebene 2 ist ein einfacher Zustand, absichtlich ohne Persistenz: nach einem Reload beginnt
  // jeder Leser wieder mit der Frage, nicht mitten im Register.
  const [detail, setDetail] = useState(detailOpen)
  const openBtnRef = useRef(null)
  // Der Flug: ein Geist des angeklickten Segments, der beim Sprung ins Register mitreist.
  // {from, to, color, hatch} in VIEWPORT-Koordinaten, null = kein Flug aktiv.
  const [flight, setFlight] = useState(null)
  const registerRef = useRef(null)
  const originIdRef = useRef(null)
  const focusDocRef = useRef(null)
  const dossierRef = useRef(null)
  const reduce = Boolean(motionReduce) || osReduce || uiReduce

  // OS-Umschalter zur Laufzeit: useReducedMotion allein deckt einen Wechsel waehrend der
  // Sitzung nicht zuverlaessig ab. reduce heisst hier reduce, nicht none.
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const sync = () => setOsReduce(mq.matches)
    sync()
    mq.addEventListener?.('change', sync)
    return () => mq.removeEventListener?.('change', sync)
  }, [])

  // Die Responsive-Stufe haengt an einer Medienabfrage, nicht an einem resize-Listener:
  // sie feuert nur beim Ueberschreiten der Grenze, nicht bei jedem Pixel.
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined
    const mq = window.matchMedia(`(min-width: ${RESPONSIVE_MIN}px)`)
    const sync = () => setWide(mq.matches)
    sync()
    mq.addEventListener?.('change', sync)
    return () => mq.removeEventListener?.('change', sync)
  }, [])

  const cols = columnsFor(wide ? RESPONSIVE_MIN : 0)
  const markCols = MARK_COLS.filter((k) => cols[k])

  const countries = data.countries
  const shares = useMemo(() => worldMonthShares(data), [data])
  const buckets = useMemo(() => countries.map((c) => bucketCats(c)), [countries])
  const docIndex = useMemo(() => buildDocIndex(countries), [countries])
  const threads = useMemo(() => threadCounts(countries), [countries])
  const keys = useMemo(() => sortKeys(countries, shares), [countries, shares])
  const lenQ = useMemo(() => lengthQuantiles(docIndex.docs), [docIndex])
  // Absolute Monatssummen der Welt (nicht die Anteile): die Treppe braucht Zaehlwerte, um auf
  // dieselbe Strichzahl wie ein Land normiert werden zu koennen.
  const monthCounts = useMemo(() => data.months.map((m) => m.n || 0), [data])

  const world = useMemo(() => ({
    buckets: bucketCats({ cats: data.globalCats }),
    modPct: data.moderation?.globalPct ?? 0,
    // ABWEICHUNG ZUR SPEC (dort 2,5 = ungewichtetes Mittel der 53 Laenderwerte, real 2,54):
    // hier das VOLUMENGEWICHTETE Mittel (2,33). Nur so ist die Weltzeile in c5 dieselbe Art
    // Aggregat wie globalCats in c3 und moderation.globalPct in c4 - ein Wert je Gespraech,
    // nicht ein Wert je Land. Der Tick wandert dadurch von x 863,85 auf rund x 858,6.
    avgTurns: countries.reduce((s, c) => s + (c.avgTurns ?? 0) * c.n, 0) / countries.reduce((s, c) => s + c.n, 0),
    shares,
    n: data.coveredByCentroid,
    total: data.total,
  }), [countries, data, shares])

  const totalThreads = useMemo(() => Array.from(threads).reduce((s, v) => s + v, 0), [threads])
  const shortOf = useMemo(() => countries.map((c) => shortName(c.country)), [countries])

  // ENCODE (Yi): eine der 9 Kategorien wird zur Einzelspalte. Bucket-Kategorien nutzen den
  // normierten Segmentwert, die drei Rest-Kategorien ihren eigenen normierten Anteil.
  const focusValues = useMemo(() => {
    if (!focusCat) return null
    const bi = BUCKET_KEYS.indexOf(focusCat)
    if (bi >= 0) return countries.map((_, ci) => buckets[ci][bi])
    return countries.map((c) => normCats(c)[focusCat] ?? 0)
  }, [focusCat, buckets, countries])

  const sortValues = useMemo(() => {
    if (sortCol === 'c1') return keys.name
    if (sortCol === 'c3') return focusValues || keys.sonstiges
    if (sortCol === 'c4') return keys.modPct
    return keys.n
  }, [sortCol, keys, focusValues])

  const order = useMemo(() => orderByKey(sortValues, sortDir === 'desc', keys.n), [sortValues, sortDir, keys.n])

  // FILTER: gefilterte Zeilen faden auf Alpha 0,18, das Blatt bleibt gleich hoch.
  // Filter, Sortierung und Graubereich schliessen sich damit NICHT mehr aus - ohne das waere
  // die staerkste Frage des Datensatzes gar nicht stellbar.
  const dimmed = useMemo(() => {
    const s = new Set()
    if (onlyBig) countries.forEach((c, ci) => { if (c.n < FILTER_MIN_N) s.add(ci) })
    // Der Range-Brush auf c4 ist der zweite Filter und wirkt UND-verknuepft mit dem ersten:
    // "kleine Laender ausblenden" und "Graubereich zwischen 5 und 12 Prozent" sind zwei Fragen,
    // die sich erst zusammen beantworten lassen.
    if (brush) countries.forEach((c, ci) => { if (!inBrush(c.modPct ?? 0, brush)) s.add(ci) })
    return s
  }, [onlyBig, countries, brush])

  /** Wie viele Zeilen nach ALLEN aktiven Filtern noch auf voller Luminanz stehen. */
  const keptCount = countries.length - dimmed.size

  // Nur c2 und c3 bekommen ein 40-px-Mikro-Histogramm. In c4 steht an dieser Stelle die
  // bezifferte Achse: zwei verschiedene x-Skalen uebereinander waeren dort die Verwechslung,
  // die eine gebrochene Achse gerade nicht braucht (drawSheet.drawModAxis).
  const headHists = useMemo(() => ({
    c2: hist12(keys.n),
    c3: hist12(focusValues || keys.sonstiges),
  }), [keys, focusValues])

  // Skalen liegen hier, weil sie das Blatt UND das Zeilen-Echo im Dossier speisen muessen:
  // dieselben Skalen, dieselben x-Konstanten, sonst waere das Echo kein Echo.
  // Gemeinsame Skala des Absolutmodus: das groesste Monatsvolumen EINES Landes ueber alle
  // 13 Monate. Die Zahl steht auch in der Ehrlichkeitszeile - sie ist der Grund, warum die
  // Weltreferenz in diesem Modus fehlt.
  const peak = useMemo(() => {
    let best = { n: 0, ci: 0, j: 0 }
    countries.forEach((c, ci) => (c.trend || []).forEach((n, j) => { if (n > best.n) best = { n, ci, j } }))
    return best
  }, [countries])
  const maxMonth = peak.n

  const scales = useMemo(() => ({
    vol: volumeScale(Math.max(...countries.map((c) => c.n))),
    mod: modScale(cols),
    docH: docHeightScale(),
  }), [countries, cols])

  const labelOf = useCallback((ci) => {
    const c = countries[ci]
    const top = CAT_BUCKET.map((b, i) => ({ key: b.key, v: buckets[ci][i] })).sort((a, b) => b.v - a.v)[0]
    return `${shortName(c.country)}, Rang ${c.rank} nach Volumen, ${fmtDE(c.n)} Gespräche, `
      + `Graubereich ${fmtDE(c.modPct ?? 0, 1)} Prozent, dominantes Thema ${top.key} ${fmtDE(top.v, 0)} Prozent, `
      + `${docIndex.byCountry[ci].length} Belege`
  }, [countries, buckets, docIndex])

  // Ein Belegstrich ist genau ein Dokument - das muss auch im Screenreader so klingen.
  // Ein Graubereich-Beleg kuendigt sich mit Score und Dimension an, BEVOR jemand ihn oeffnet.
  const docLabelOf = useCallback((d) => (d.kind === 'g'
    ? `Graubereich-Beleg öffnen: ${d.cat}, ${fmtDE(d.len)} Zeichen, Dimension ${MOD_LABEL[d.dim] || d.dim}, Score ${fmtDE(d.score, 2)} über der gesetzten Schwelle 0,25`
    : `Beleg öffnen: ${d.cat}, ${fmtDE(d.len)} Zeichen`), [])

  // Am Kamm steht nur die Einheit. Die Abdeckungsrechnung (95 %, nicht zugeordnete Gespräche)
  // gehoert zur Methodik und liegt in der eingeklappten Volumen-Notiz.
  const combCaption = `1 Strich = ${fmtDE(1000)} Gespräche · ${fmtDE(totalThreads)} Striche`

  // Beim Schliessen springt der Fokus zurueck auf den Schalter: das gewaehlte Element liegt
  // sonst in einem Teilbaum, den React gerade entfernt, und der Fokus faellt auf <body>.
  const onToggleDetail = useCallback(() => {
    setDetail((open) => {
      if (open) {
        setSelCi(null)
        setOpenDoc(null)
        requestAnimationFrame(() => openBtnRef.current?.focus())
      }
      return !open
    })
  }, [])

  const announce = useCallback((msg) => setLive(msg), [])
  // Vor der ersten Nutzerhandlung steht der Ausgangszustand da, aus den Daten abgeleitet.
  // Weil er schon beim ersten Render im DOM ist, loest er keine Ansage aus - nur Aenderungen tun das.
  const liveText = live || `Sortiert nach ${SORT_LABEL[sortCol]}, ${sortDir === 'desc' ? 'absteigend' : 'aufsteigend'}. ${countries.length} Länder.`

  // RECONFIGURE (Yi): vier Sortierschluessel, zweiter Klick kehrt die Richtung um.
  // Jeder Wechsel wird ueber role="status" angesagt - die Umordnung ist ein Befund, keine Deko.
  const onSort = useCallback((key) => {
    const nextDir = sortCol === key ? (sortDir === 'desc' ? 'asc' : 'desc') : DEFAULT_DIR[key]
    const label = key === 'c3' && focusCat ? focusCat : SORT_LABEL[key]
    setSortCol(key)
    setSortDir(nextDir)
    announce(`Sortiert nach ${label}, ${nextDir === 'desc' ? 'absteigend' : 'aufsteigend'}. ${countries.length} Länder.`)
  }, [sortCol, sortDir, focusCat, announce, countries.length])

  const onChipClick = useCallback((cat) => {
    const next = focusCat === cat ? null : cat
    setFocusCat(next)
    if (next) {
      setSortCol('c3')
      setSortDir('desc')
      announce(`Spalte Wofür zeigt jetzt nur ${next}, sortiert absteigend. ${countries.length} Länder.`)
    } else {
      announce(`Spalte Wofür zeigt wieder den vollständigen Themen-Stapel. ${countries.length} Länder.`)
    }
  }, [focusCat, announce, countries.length])

  /**
   * BAND-SEGMENT ANGEKLICKT: Ebene 1 wird zum Einstieg in die Analyse.
   *
   * Ein Klick macht drei Dinge in einem Zug (Yi: select + reconfigure + explore): das Register
   * oeffnet, die Wofuer-Spalte zeigt nur noch diese Kategorie, und das Blatt sortiert danach
   * absteigend. Genau das, was sonst zwei Klicks in der Bedienleiste kostet.
   *
   * DIE ANIMATION IST NICHT DEKORATION, sondern Object Constancy (Heer und Robertson 2007): ohne
   * sie erscheint das Register als neuer Bildschirm und der Bezug zum angeklickten Segment geht
   * verloren. Ein Geist des Segments reist deshalb sichtbar von seiner Position in den Kopf des
   * Registers, waehrend die Seite dorthin scrollt. Er ist rein visuell (aria-hidden), die Ansage
   * fuer Screenreader macht announce(). Bei Reduced Motion entfaellt der Flug ersatzlos, die
   * Zustandsaenderung bleibt identisch.
   */
  const onPickCat = useCallback((cat, el) => {
    setDetail(true)
    setFocusCat(cat)
    setSortCol('c3')
    setSortDir('desc')
    setSelCi(null)
    setOpenDoc(null)
    announce(`Register geöffnet. Spalte Wofür zeigt nur ${cat}, sortiert absteigend. ${countries.length} Länder.`)

    const target = registerRef.current
    if (!target) return
    if (reduce || !el) {
      requestAnimationFrame(() => target.scrollIntoView({ block: 'start', behavior: 'auto' }))
      return
    }
    const from = el.getBoundingClientRect()
    const color = CAT_BUCKET.find((b) => b.key === cat)?.color || CAT_COLOR[cat] || PAL.human
    // ZIEL IST EINE RICHTUNG, KEIN PUNKT. Erster Versuch war, auf die gemessene Position des
    // Registers zu fliegen - das war falsch: der Geist liegt fixed, also in Viewport-Koordinaten,
    // und die Seite scrollt WAEHREND der Animation um mehrere tausend Pixel. Das gemessene Ziel
    // ist nach 100 ms nicht mehr dort. Der Geist taucht deshalb nach unten aus dem Bild ab, in
    // die Richtung, in die auch die Seite geht, und verjuengt sich dabei auf Spaltenbreite.
    // Die Verbindung zum Register stellt danach dessen eigener Tween her (LedgerSheet, 1.160 ms).
    setFlight({
      cat,
      color,
      hatch: cat === 'Sonstiges',
      from: { x: from.left, y: from.top, w: from.width, h: from.height },
      to: {
        x: from.left + from.width * 0.3,
        y: window.innerHeight + 40,
        w: Math.max(48, from.width * 0.4),
        h: 10,
      },
    })
    requestAnimationFrame(() => target.scrollIntoView({ block: 'start', behavior: 'smooth' }))
  }, [reduce, announce, countries.length])

  // SELECT (Yi): genau EIN nutzerausgeloestes scrollIntoView beim Waehlen einer ZEILE, nie bei
  // Hover (das waere ein Scroll-Bug-Generator). block:'end' haelt das Blatt im Bild.
  // Ein Klick im EvidencePanel waehlt ebenfalls, scrollt aber NICHT: das Panel steht ueber dem
  // Blatt, ein Sprung nach unten waere dort eine Entfuehrung statt einer Antwort.
  const onSelectCountry = useCallback((ci, scroll = true) => {
    setSelCi(ci)
    if (ci == null) return
    announce(`${shortOf[ci]} gewählt. Das Detailband unter dem Blatt zeigt jetzt dieses Land.`)
    if (scroll) dossierRef.current?.scrollIntoView({ block: 'end', behavior: reduce ? 'auto' : 'smooth' })
  }, [countries, announce, reduce])

  const onSelectFromPanel = useCallback((ci) => onSelectCountry(ci, false), [onSelectCountry])

  const onOpenDoc = useCallback((d) => {
    if (!originIdRef.current) originIdRef.current = d.id
    setOpenDoc(d)
    announce(`Gesprächstext geöffnet: ${shortOf[d.ci]}, ${d.cat}, ${fmtDE(d.len)} Zeichen.`)
  }, [announce, countries])

  // Querschnitt-Sprung und Blaettern gehen durch dieselbe Tuer wie der erste Klick, damit
  // Ansage und Magenta-Marke im Blatt immer denselben Beleg meinen.
  const onNavigateDoc = useCallback((d) => {
    setOpenDoc(d)
    announce(`Beleg gewechselt: ${shortOf[d.ci]}, ${d.cat}, ${fmtDE(d.len)} Zeichen.`)
  }, [announce, countries])

  // Escape schliesst und gibt den Fokus an den AUSLOESENDEN Strich zurueck - nicht an den
  // zuletzt gelesenen. Wer sich quer durch fuenf Laender liest, landet wieder dort, wo er anfing.
  const onCloseDesk = useCallback(() => {
    const id = originIdRef.current
    originIdRef.current = null
    setOpenDoc(null)
    if (id) requestAnimationFrame(() => focusDocRef.current?.(id))
  }, [])

  // Aus dem Lesetisch heraus: "N weitere Belege in Rollenspiel/Story" ordnet das Blatt danach.
  // Setzen statt Umschalten - der Knopf verspricht eine Ordnung, kein Toggle.
  const onFilterCat = useCallback((cat) => {
    if (focusCat !== cat) onChipClick(cat)
  }, [focusCat, onChipClick])

  // FILTER (Yi) per Range-Brush: der Zug ueber c4 kommt als Wertebereich zurueck, nicht als
  // Pixelbereich - deshalb ueberlebt er Umsortieren und Skalieren des Blattes unveraendert.
  const onBrush = useCallback((range) => {
    setBrush(range)
    const n = countries.filter((c) => inBrush(c.modPct ?? 0, range)).length
    announce(`Graubereich gefiltert auf ${fmtDE(range.lo, 1)} bis ${fmtDE(range.hi, 1)} Prozent. `
      + `${n} von ${countries.length} Ländern hervorgehoben.`)
  }, [announce, countries])

  const onBrushClear = useCallback(() => {
    setBrush(null)
    announce(`Bereichsfilter aufgehoben. Alle ${countries.length} Länder gleich hell.`)
  }, [announce, countries.length])

  // ENCODE (Yi) am Verlaufs-Diagramm des Dossiers: dieselbe Mark, derselbe Nullpunkt, anderes
  // Attribut. Der Schalter sitzt seit dem Spalten-Umbau dort, wo der Verlauf steht - eine
  // Bedienung fuer eine Grafik, die man gerade nicht sieht, waere keine Bedienung.
  const onTrendMode = useCallback(() => {
    const next = trendMode === 'share' ? 'abs' : 'share'
    setTrendMode(next)
    announce(next === 'abs'
      ? `Verlauf im Detailband zeigt jetzt Gespräche je Monat, gemeinsame Skala 0 bis ${fmtDE(maxMonth)}. Ohne Weltlinie.`
      : 'Verlauf im Detailband zeigt wieder den Anteil am eigenen Jahr, gemeinsame Skala 0 bis 35 Prozent, mit Weltlinie.')
  }, [trendMode, announce, maxMonth])

  const onFilterToggle = useCallback(() => {
    const next = !onlyBig
    const kept = countries.filter((c) => c.n >= FILTER_MIN_N).length
    setOnlyBig(next)
    announce(next
      ? `Filter aktiv: nur Länder ab ${fmtDE(FILTER_MIN_N)} Gesprächen. ${kept} von ${countries.length} Ländern hervorgehoben.`
      : `Filter aus. Alle ${countries.length} Länder gleich hell.`)
  }, [onlyBig, announce, countries])

  const focusColor = focusCat ? (CAT_BUCKET.find((b) => b.key === focusCat)?.color || CAT_COLOR[focusCat] || PAL.human) : null
  const bigCount = countries.filter((c) => c.n >= FILTER_MIN_N).length
  const smallCount = countries.filter((c) => c.n < 3000).length
  const cappedCount = docIndex.docs.filter((d) => d.capped).length
  const maxCountry = countries.reduce((a, b) => (a.n >= b.n ? a : b))
  const minCountry = countries.reduce((a, b) => (a.n <= b.n ? a : b))
  const perPx = maxCountry.n / COLS.c2.barW
  const grayDims = useMemo(() => {
    const cnt = {}
    docIndex.docs.forEach((d) => { if (d.kind === 'g') cnt[d.dim] = (cnt[d.dim] || 0) + 1 })
    return cnt
  }, [docIndex])

  const topCi = order[0]

  return (
    <>
      {/* ---------- EBENE 1: die Frage und ihre Antwort in einem Bild ---------- */}
      <div className="layout-container">
        <div className="editorial-grid">
          <UseOverview
            data={data}
            countries={countries}
            detailOpen={detail}
            onToggleDetail={onToggleDetail}
            onPickCat={onPickCat}
            buttonRef={openBtnRef}
          />

          {/* A11y-Parallelzugang: GENAU EINE sr-only-Tabelle, 53 Zeilen x 8 Spalten.
              Sie liegt bewusst AUSSERHALB der zweiten Ebene und ist damit immer im DOM. Grund:
              sie ist der vollstaendige Datenzugang des Akts. Haengte sie am Schalter, muesste
              ein Screenreader-Nutzer erst ein visuelles Bedienelement finden, um an die Zahlen
              zu kommen - die zwei Ebenen sind eine Entlastung fuers Auge, keine Zugangshuerde. */}
          <SrTable countries={countries} order={order} buckets={buckets} docIndex={docIndex} tvds={keys.tvd} sortCol={sortCol} sortDir={sortDir} />
        </div>
      </div>

      {/* ---------- EBENE 2: das Register. Der Container bleibt, damit aria-controls
           des Schalters in beiden Zustaenden auf ein existierendes Element zeigt. ---------- */}
      {/* Der Flug liegt als position:fixed ausserhalb der Spalten, damit ihn kein
          transformierter Vorfahr aus dem Viewport-Bezug reisst. */}
      {flight && <CatFlight flight={flight} onDone={() => setFlight(null)} />}

      <div className="layout-container" id="wildchat-register" ref={registerRef}>
        {detail && (
        <div className="editorial-grid">
          <div className="text-column" style={{ marginTop: 'var(--s-12)' }}>
            {/* Der Titel des Akts gehoert hierher: er ist eine Schlussfolgerung aus dem Blatt
                und vor dem Blatt nicht pruefbar. */}
            <p className="t-display-s" style={{ margin: 0 }}>
              Zwei von {countries.length} Ländern tragen die <span style={{ color: PAL.machine }}>Korrelation.</span>
            </p>
            {/* EIN Satz, dann die LEGENDE als Bild. Ein Satz kann eine Kodierung nur benennen
                ("Farben = wofuer"); wer die Mark nicht kennt, findet sie im Blatt trotzdem nicht.
                Die Legende darunter zeigt jede Spalte als Miniatur ihrer echten Mark. */}
            <p className="t-body" style={{ color: PAL.muted, marginTop: 'var(--s-4)' }}>
              Jede Zeile unten ist ein Land, vier Spalten je Zeile. Spaltenkopf klicken sortiert,
              Zeile klicken öffnet das Detail.
            </p>
          </div>

          {/* Bedienschicht: ENCODE (9 Kategorien), Ansicht, Bedienhinweise. Drei benannte
              Gruppen statt einer flachen Wand, kein Overlay ueber dem Blatt. */}
          <div className="ledger-controls">
            <span className="t-label" style={{ color: PAL.muted }}>Wofür</span>
            <div className="ledger-controls-set">
              {CATS9.map((cat) => chipBtn({
                active: focusCat === cat,
                pressed: focusCat === cat,
                faded: Boolean(focusCat),
                color: CAT_COLOR[cat] || PAL.human,
                label: cat,
                onClick: () => onChipClick(cat),
              }))}
            </div>

            <span className="t-label" style={{ color: PAL.muted }}>Ansicht</span>
            <div className="ledger-controls-set">
              {toggleBtn({
                pressed: onlyBig,
                title: 'filter-n',
                label: `nur Länder ab ${fmtDE(FILTER_MIN_N)} Gesprächen (${bigCount} von ${countries.length})`,
                onClick: onFilterToggle,
              })}
              {toggleBtn({
                pressed: reduce,
                title: 'motion',
                // Ehrlich beschriftet: steht die Systemvorgabe schon auf "reduce", ist der
                // Schalter Anzeige und nicht Ursache - das darf er nicht verschweigen.
                label: reduce && !uiReduce ? 'Übergänge aus (Systemvorgabe)' : 'Übergänge aus',
                onClick: () => setUiReduce((v) => !v),
              })}
              {/* Der Brush wird gezogen, nicht geklickt - also braucht er einen sichtbaren
                  Zustand und einen Weg zurueck, der nicht "genau richtig zielen" heisst. */}
              {brush && (
                <button type="button" className="mono ledger-reveal" onClick={onBrushClear}>
                  Graubereich {fmtDE(brush.lo, 1)} bis {fmtDE(brush.hi, 1)} % · {keptCount} von {countries.length} Zeilen
                  {' '}hervorgehoben · Bereich aufheben
                </button>
              )}
            </div>

            {/* Sichtbar UND als Live-Region: der Sortier-/Filterwechsel ist eine Aussage ueber
                die Daten, kein stiller Zustand. Sichtbar zu sein macht ihn auch im Screenshot
                pruefbar (Abnahme B9). */}
            <p role="status" aria-live="polite" className="mono ledger-controls-wide"
              style={{ margin: 0, minHeight: '1.1rem', color: PAL.machine, fontSize: '0.66rem' }}>
              {liveText}
            </p>
          </div>

          <SheetLegend
            world={world}
            maxN={maxCountry.n}
            minName={shortName(minCountry.country)}
            minN={minCountry.n}
            docCount={docIndex.docs.length}
            threshold={data.moderation?.threshold ?? 0.25}
          />

          <div style={{ gridColumn: '1 / -1', marginTop: 'var(--s-3)' }}>
            <LedgerSheet
              countries={countries}
              order={order}
              world={world}
              buckets={buckets}
              docsByCountry={docIndex.byCountry}
              threads={threads}
              headHists={headHists}
              focusCat={focusCat}
              focusValues={focusValues}
              focusColor={focusColor}
              dimmed={dimmed}
              combCaption={combCaption}
              shortOf={shortOf}
              labelOf={labelOf}
              docLabelOf={docLabelOf}
              fmt={fmtDE}
              scales={scales}
              sortCol={sortCol}
              sortDir={sortDir}
              hoverCi={hoverCi}
              selCi={selCi}
              hoverBucket={hoverBucket}
              selDocId={openDoc?.id || null}
              focusDocRef={focusDocRef}
              cols={cols}
              brush={brush}
              onHoverCountry={setHoverCi}
              onSelectCountry={onSelectCountry}
              onHoverBucket={setHoverBucket}
              onSort={onSort}
              onOpenDoc={onOpenDoc}
              onBrush={onBrush}
              onDrawTime={setDraw}
              reduce={reduce}
            />
          </div>

          {/* Das Dossier ist IMMER im DOM und IMMER 360 px hoch. Eine Hoehenmutation waehrend
              des Scrollens wuerde die Seitenhoehe und damit alle Ticks der Fortschrittsleiste
              verschieben (Motion.jsx misst offsetTop / max fuer alle fuenf Akte). CLS = 0. */}
          <div style={{ gridColumn: '1 / -1', marginTop: 'var(--s-3)' }}>
            <LedgerDossier
              dossierRef={dossierRef}
              countries={countries}
              selCi={selCi}
              world={world}
              buckets={buckets}
              docsByCountry={docIndex.byCountry}
              lenQ={lenQ}
              threads={threads}
              globalCats={data.globalCats}
              months={data.months}
              monthCounts={monthCounts}
              maxMonth={maxMonth}
              scales={scales}
              selDocId={openDoc?.id || null}
              cols={cols}
              trendMode={trendMode}
              onTrendMode={onTrendMode}
              onOpenDoc={onOpenDoc}
              reduce={reduce}
            />
          </div>

          {/* DIE POINTE, UNTER DEM BLATT: eine Widerlegung ist nur verstaendlich, wenn man die
              These kennt. Links steht deshalb die naheliegende Erklaerung, rechts das Streudiagramm,
              das sie kippt. Ueber dem Blatt war dasselbe Panel eine Behauptung ohne Kontext. */}
          <div className="ledger-pointe">
            <div className="text-column">
              <p className="t-display-s" style={{ margin: 0 }}>
                Die naheliegende Erklärung: <span style={{ color: PAL.muted }}>Rollenspiel treibt den Graubereich.</span>
              </p>
              <p className="t-body" style={{ color: PAL.muted, marginTop: 'var(--s-4)' }}>
                Stimmt nicht. Nimmt man die zwei Länder heraus, die den Hebel der Regression tragen,
                bleibt fast nichts übrig.
              </p>
            </div>
            <div className="ledger-evidence">
              <EvidencePanel
                countries={countries}
                shortOf={shortOf}
                hoverCi={hoverCi}
                selCi={selCi}
                onHoverCountry={setHoverCi}
                onSelectCountry={onSelectFromPanel}
                reduce={reduce}
              />
            </div>
          </div>

          {/* Kopfzahlen NACH dem Blatt: der Kamm und die Belegwand sind Befunde ueber das, was
              man gerade gesehen hat, keine Vorrede davor. */}
          <div className="ledger-tally">
            <div>
              <div className="display" style={{ fontSize: '3.5rem', lineHeight: 0.9, color: PAL.human }}>{fmtDE(totalThreads)}</div>
              <div className="mono" style={{ color: PAL.muted, fontSize: '0.64rem', marginTop: '0.2rem' }}>Striche im Einheiten-Kamm</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="display" style={{ fontSize: '4rem', lineHeight: 0.9, color: PAL.human }}>{fmtDE(docIndex.docs.length)}</div>
              <div className="mono" style={{ color: PAL.muted, fontSize: '0.64rem', marginTop: '0.2rem' }}>einzeln adressierbare Belege</div>
            </div>
          </div>

          {/* EHRLICHKEIT: sechs Saetze an ihren Spalten, in Spaltenkopfgroesse. Sie sind
              EINGEKLAPPT, im selben nativen <details>-Muster wie die Quellen-Notizen der
              anderen Akte (SourceNote). Damit ist die Methodik einen Klick entfernt statt
              dauerhaft im Bild - der ehrliche Preis fuer einen lesbaren Erstkontakt. Ein
              Screenreader liest sie unverkuerzt, die Reihenfolge im DOM bleibt gleich. */}
          <SourceNote
            className=""
            style={{ gridColumn: '1 / -1', maxWidth: 'none' }}
            label="Was diese Spalten genau messen, und was sie nicht zeigen"
          >
          <div className="ledger-notes">
            <Note col="Volumen" start={2} span={2}>
              Wie viele Gespräche das Land beigetragen hat.{' '}
              {fmtDE(maxCountry.n)} = {COLS.c2.barW} px, also {fmtDE(perPx, 1)} Gespräche je Pixel. {shortName(minCountry.country)} mit
              {' '}{fmtDE(minCountry.n)} Gesprächen wird {fmtDE(minCountry.n / perPx, 2)} px breit. <b>Der lange Schwanz ist ein
              Flüstern, und das ist die wahre Form einer Potenzverteilung.</b> Keine Log-Stauchung, kein Mindestbalken.
              {' '}Im Kamm und in den Zeilen stecken {fmtDE(data.coveredByCentroid)} der {fmtDE(data.total)} Gespräche
              ({fmtDE((100 * data.coveredByCentroid) / data.total, 1)} %); {fmtDE(data.total - data.coveredByCentroid)} ohne
              Länderzuordnung sind nicht im Bild.
            </Note>
            <Note col="Wofür" start={4} span={3}>
              Worüber geredet wurde, als Anteil am eigenen Volumen.
              {' '}Themen aus einer Stichwort-Heuristik, extern validiert κ = 0,50, Accuracy 0,555, Macro-F1 0,53.
              {' '}<b>„Sonstiges“ {fmtDE(data.globalCats[0].pct, 1)} % ist das Eingeständnis, keine Kategorie</b> – deshalb
              neutralgrau, schraffiert und in jeder Zeile am gemeinsamen Nullpunkt (real 0 bis {fmtDE(Math.max(...countries.map((c) => catPct(c, 'Sonstiges'))), 0)} %).
              Anteile je Land auf 100 % normiert (Rohsumme 98 bis 102).
            </Note>
            <Note col="Graubereich" start={7} span={4}>
              {/* Rechenweg, Schwelle und Skalenbruch zeigt jetzt die Legende ueber dem Blatt als
                  BILD. Hier steht nur noch, was ein Bild nicht sagen kann: die Vorbehalte. */}
              <b>θ = {fmtDE(data.moderation.threshold, 2)} ist gesetzt, nicht kalibriert</b>, und ein hoher Wert
              ist kein Sperrurteil über einen Text, sondern Ähnlichkeit mit einer der fünf Dimensionen.
              {' '}<b>hate {fmtDE(data.moderation.byDim.hate, 1)} % und self-harm {fmtDE(data.moderation.byDim['self-harm'], 1)} % sind
              die Nachweisgrenze dieses vormoderierten Public Sets, kein Befund.</b>
              {' '}{smallCount} von {countries.length} Ländern haben weniger als {fmtDE(3000)} Gespräche; deren Quote
              schwankt allein aus der Stichprobengröße um rund einen Prozentpunkt.
              {' '}Die gestauchte Achse ab {MOD_FOCUS} % ({fmtDE(MOD_TAIL_SQUEEZE, 2)}×) war nötig, weil ein einzelnes
              Land bei {fmtDE(Math.max(...countries.map((c) => c.modPct ?? 0)), 1)} % sonst die ganze Skala aufspannt und
              1 % von 4 % nur 21 px trennt.
              {' '}Belegte Dimensionen unter den {docIndex.docs.filter((d) => d.kind === 'g').length} Graubereich-Belegen:
              {' '}{Object.entries(grayDims).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(' · ')}.
              {' '}Glyphe am Belegstrich: <b>▲ Gewalt · ■ sexuelle Inhalte · ● Belästigung · ▬ kein Fall</b>.
            </Note>
            <Note col="Belege" start={11} span={2}>
              Einzelne Gespräche, die man wirklich lesen kann.{' '}
              {fmtDE(docIndex.docs.length)} lesbare Belege von {fmtDE(data.total)} Gesprächen. Der Rest ist Zahl.
              {' '}<b>{Math.min(...docIndex.byCountry.map((d) => d.length))} bis {Math.max(...docIndex.byCountry.map((d) => d.length))} je
              Land, vom Datensatz mitgeliefert – nicht proportional zum Volumen und nicht zufällig gezogen.</b> Deshalb ist die
              Belegzahl kein Sortierschlüssel und das Slot-Raster bleibt sichtbar leer. Strichhöhe = Zeichenzahl
              ({fmtDE(lenQ.min)} bis {fmtDE(lenQ.max)}, Median {fmtDE(lenQ.p50, 1)}). {cappedCount} von {fmtDE(docIndex.docs.length)} sind
              bei {fmtDE(2000)} Zeichen gekappt (Pipeline).
              {/* Verschoben aus dem Detailband: dort stand die Begruendung dauerhaft im Bild und
                  kostete drei Zeilen Prosa, obwohl sie nur einmal gelesen werden muss. */}
              {' '}Im Detail sitzt der Text <i>im</i> Block und ist nicht der Block: die Breite trägt den Wert, sonst
              würde die proportionale Schrift mitbestimmen, wie lang ein Text aussieht. Der Text eines
              Graubereich-Belegs steht erst nach dem Aufdecken im DOM, sonst liest ein Screenreader ihn ungefragt vor.
            </Note>
            <Note col="Was nicht mehr im Blatt steht" start={2} span={4}>
              Hier standen bis vor kurzem zwei weitere Spalten, <i>Tiefe</i> (Runden je Gespräch) und <i>Verlauf</i>
              {' '}(13 Monate). Beide sind entfernt, weil sie ihre Aufgabe nicht erfüllt haben:
              {' '}<b>Tiefe spannte real nur {fmtDE(Math.min(...countries.map((c) => c.avgTurns ?? 0)), 1)} bis
              {' '}{fmtDE(Math.max(...countries.map((c) => c.avgTurns ?? 0)), 1)} Runden, die mittlere Hälfte 2,2 bis 2,8
              – auf 80 px Spaltenbreite lagen damit fast alle {countries.length} Punkte übereinander</b>, und die
              13 Verlaufsbalken waren auf 179 × 14 px zu flach, um ein Muster zu zeigen. Ein Kanal, der den Vergleich
              nicht trägt, ist kein Gewinn, sondern Tinte. Beide stehen jetzt im Detail unter dem Blatt (Tiefe auf
              einer 232 px langen Achse, Verlauf als 360 × 150 px großes Diagramm mit Weltlinie, umschaltbar auf
              Gespräche je Monat, gemeinsame Skala 0 bis {fmtDE(maxMonth)}, Maximum {shortName(countries[peak.ci].country)}
              {' '}{data.months[peak.j].month}) und vollständig in der Tabelle unter der Grafik.
              {' '}<b>Delle Jan 2024 = Erhebungslücke ({fmtDE(data.months[9].n)} gegen {fmtDE(data.months[1].n)} im Mai), kein Nachfrageeinbruch.</b>
              {' '}Volumenspanne zum Vergleich: Faktor {fmtDE(maxCountry.n / minCountry.n, 0)}.
            </Note>
            <Note col="Global" start={7} span={6}>
              {/* Aus dem Kopf hierher: beides ist Nachschlagestoff, keine Vorrede. Im Kopf
                  schoben die zwei Bloecke das Blatt um rund 160 px nach unten. */}
              Daten: {countries.length} Länder × 7 Attribute × {data.months.length} Monate
              {' '}+ {fmtDE(docIndex.docs.length)} Belege · Task: Vergleichen · Ordnen · Umordnen (Seriation)
              {' '}· Verbinden · Nachschlagen / Vertiefen.
              {' '}Bedienung: Zeile anklicken zeigt das Land im Detail, der Belegstrich rechts öffnet den
              Gesprächstext, ein Zug über die Graubereich-Spalte filtert.
              {' '}Die senkrechte Linie in der Graubereich-Spalte ist der Weltwert, {fmtDE(world.modPct, 1)} %.
              {' '}Alle {countries.length} Zeilen benutzen dieselben {markCols.length} Skalen: erst dadurch ist jede Zeile mit
              jeder vergleichbar, und erst dadurch ist das Umsortieren eine Analyse (Bertin, matrice ordonnable).
              {' '}Die Zeile ohne Rang ganz oben ist die Welt, mit denselben Skalen, aber Volumen als Kontur statt
              gefüllt, weil eine Summe nicht auf der Länderskala liegt.
              {' '}Quelle: allenai/WildChat-1M (ODC-BY), {fmtDE(data.total)} echte Mensch-KI-Gespräche aus 2023-04 bis 2024-04;
              {' '}Prompts vor der Anzeige auf E-Mail, Telefon und URL-Parameter maskiert.
              {' '}Wie weit die IP-Zuordnung trägt, zeigt Japan: 60 % der Gespräche dort sind englisch, 33 % chinesisch,
              nur 4 % japanisch, also mit hoher Wahrscheinlichkeit VPN- und Proxy-Wege.
              {' '}Länder per IP-Zuordnung, VPN nicht korrigierbar. <b>Keine Karte, weil die Zuordnung keine Geografie hergibt</b>
              {' '}(MAUP, Flächenbias). Die Zeilenposition ist eine Rangordnung, kein Raum.
              {' '}Unter {RESPONSIVE_MIN} px Breite gibt <i>Wofür</i> 80 px an <i>Graubereich</i> ab: das Blatt wird als
              Ganzes herunterskaliert, und die Spalte, die auf einzelnen Prozentpunkten unterscheiden muss, verliert
              dabei zuerst ihre Aufgabe. Es entfällt keine Spalte mehr.
              {draw && (
                <> · Gemessene Zeichenzeit <b>{fmtDE(draw.ms, 2)} ms</b> je Frame (laufender Median über die letzten
                {' '}{draw.frames} Frames bei Gerätepixelverhältnis {fmtDE(draw.dpr, 1)}; die Zahl wandert mit, sobald
                Sortieren oder Filtern teurer wird).</>
              )}
            </Note>
          </div>
          </SourceNote>
        </div>
        )}
      </div>

      <div className="layout-container">
        <div className="editorial-grid">
          <Reveal className="text-column">
            {/* Der Brueckensatz braucht Abstand zum Register, sonst liest er als dessen
                Bildunterschrift statt als Uebergang in den naechsten Akt. */}
            <p className="display t-display-s" style={{ color: PAL.muted, marginTop: 'var(--s-24)' }}>
              Und wenn die Maschine so flüssig antwortet, bleibt eine <span style={{ color: PAL.text }}>Frage.</span>
            </p>
          </Reveal>
        </div>
      </div>

      {/* E3 - der Lesetisch. Er ersetzt das alte Laender-Overlay, das per pool[i % pool.length]
          ein zufaelliges Beispiel zeigte und 589 von 590 samples unerreichbar liess. */}
      {openDoc && (
        <ReadingDesk
          doc={openDoc}
          docIndex={docIndex}
          docsByCountry={docIndex.byCountry}
          countries={countries}
          world={world}
          globalCats={data.globalCats}
          lenQ={lenQ}
          months={data.months}
          onClose={onCloseDesk}
          onNavigate={onNavigateDoc}
          onFilterCat={onFilterCat}
          reduce={reduce}
        />
      )}
    </>
  )
}

/**
 * Ein Ehrlichkeitssatz, ab 1200 px unter SEINER Spalte verankert (12er-Raster ueber dieselben
 * 1320 px wie das Blatt). Darunter fliesst er in einen lesbaren Block um.
 */
function Note({ col, start, span, children }) {
  return (
    <div className="ledger-note" style={{ '--nc-start': start, '--nc-span': span }}>
      <span className="t-label" style={{ color: PAL.machine, display: 'block', marginBottom: '0.3rem' }}>{col}</span>
      <p className="mono" style={{ margin: 0, color: PAL.muted, fontSize: '10.5px', lineHeight: 1.6 }}>{children}</p>
    </div>
  )
}

/**
 * Die einzige Screenreader-Tabelle des Akts (der Altcode hatte sie doppelt im DOM).
 * aria-sort steht hier, wo es semantisch hingehoert: auf dem Spaltenkopf einer echten Tabelle.
 *
 * SIE IST DER VOLLSTAENDIGE ZUGANG, nicht die Kurzfassung des Bildes: Gespraechstiefe und
 * Verlaufsabweichung stehen hier weiter drin, obwohl es die beiden Spalten im Blatt nicht mehr
 * gibt. Aus dem Blatt sind Kanaele verschwunden, keine Werte.
 */
function SrTable({ countries, order, buckets, docIndex, tvds, sortCol, sortDir }) {
  const dir = sortDir === 'desc' ? 'descending' : 'ascending'
  const sortOf = (key) => (sortCol === key ? dir : 'none')
  return (
    <table className="sr-only">
      <caption>
        Register: {countries.length} Länder mit Gesprächsvolumen, Themenmix, Graubereich, Gesprächstiefe,
        Abweichung vom Weltverlauf und Belegzahl. Tiefe und Verlauf stehen nur hier und im Detailband,
        nicht mehr als eigene Spalte in der Grafik.
        Aktuelle Sortierung: {SORT_LABEL[sortCol]}, {sortDir === 'desc' ? 'absteigend' : 'aufsteigend'}.
      </caption>
      <thead>
        <tr>
          <th scope="col">Rang</th>
          <th scope="col" aria-sort={sortOf('c1')}>Land</th>
          <th scope="col" aria-sort={sortOf('c2')}>Gespräche</th>
          <th scope="col" aria-sort={sortOf('c3')}>dominantes Thema</th>
          <th scope="col">Anteil dominantes Thema in Prozent</th>
          <th scope="col" aria-sort={sortOf('c4')}>Graubereich in Prozent</th>
          <th scope="col">Runden je Gespräch</th>
          <th scope="col">Abweichung vom Weltverlauf in Prozent</th>
          <th scope="col">Belege</th>
        </tr>
      </thead>
      <tbody>
        {order.map((ci, r) => {
          const c = countries[ci]
          const top = CAT_BUCKET.map((b, i) => ({ key: b.key, v: buckets[ci][i] })).sort((a, b) => b.v - a.v)[0]
          return (
            <tr key={c.country}>
              <td>{r + 1}</td>
              <th scope="row">{shortName(c.country)}</th>
              <td>{fmtDE(c.n)}</td>
              <td>{top.key}</td>
              <td>{fmtDE(top.v, 1)}</td>
              <td>{fmtDE(c.modPct ?? 0, 1)}</td>
              <td>{fmtDE(c.avgTurns ?? 0, 1)}</td>
              <td>{fmtDE((tvds[ci] ?? 0) * 100, 1)}</td>
              <td>{docIndex.byCountry[ci].length}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
