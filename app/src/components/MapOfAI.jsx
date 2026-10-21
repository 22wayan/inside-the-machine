import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion, useScroll, useTransform, useMotionValueEvent, useReducedMotion } from 'motion/react'
import { PAL, CAT, CAT_OTHER, SCENE_BG } from '../theme'
import { Reveal, SourceNote } from './Motion'
import { useCompact, useMediaQuery } from './useViewport'

// Akt 2, "Map of AI Research". KI-Abstracts (arXiv) auf 2D projiziert (TF-IDF + LSA/SVD), als
// Canvas-Punktwolke gefaerbt nach Forschungsfeld.
// Phase 6 (Scrollytelling): Scroll mappt auf die Jahre 2007-2026; die Nebula waechst. Bruecke
// Framer<->Canvas: useMotionValueEvent -> yearRef -> rAF-Redraw (kein React-Rerender pro Frame).
// Phase 6.5: helleres Blending; Taxonomie-Fix (cs.AI-Label + arXiv-Hinweis); Feld-Labels als HTML-
// Overlays (echte Hover-Zonen) mit Deep-Dive-Info-Karte (Brushing + Feld-Statistik bis zum Scroll-Jahr).

const W = 1320
const H = 700
const PAD = 40
const projX = (v) => PAD + (v / 1000) * (W - 2 * PAD)
const projY = (v) => PAD + (1 - v / 1000) * (H - 2 * PAD)
// Ausgeschriebene Feldnamen. "Symbolische KI & Grundlagen" statt "Kuenstliche Intelligenz": cs.AI ist
// das arXiv-Sammelfeld fuer klassische/grundlegende KI (Planung, Reasoning, Agenten), nicht "KI allgemein".
const LABELS = {
  'cs.LG': 'Maschinelles Lernen',
  'cs.CV': 'Computer Vision',
  'cs.CL': 'Sprachverarbeitung',
  'cs.AI': 'Symbolische KI & Grundlagen',
  'cs.NE': 'Neuro-Evolution',
  'stat.ML': 'Statistisches Lernen',
  'cs.RO': 'Robotik',
  'cs.IR': 'Informationssuche',
}

// Kurzformen fuer das Telefon: acht ausgeschriebene Namen ueberlagern sich auf 350 px Kartenbreite.
// Die Legende darunter nennt weiter die vollen Namen.
const SHORT_LABELS = {
  'cs.LG': 'ML',
  'cs.CV': 'Vision',
  'cs.CL': 'Sprache',
  'cs.AI': 'Symb. KI',
  'cs.NE': 'Neuro-Evo.',
  'stat.ML': 'Statistik',
  'cs.RO': 'Robotik',
  'cs.IR': 'Suche',
}

// Hover nur fuer echte Maeuse. Auf dem Touchscreen feuert ein Tipp zusaetzlich mouseenter und
// focus; der Hover-Zustand blieb dann haengen und hielt die Feldkarte offen, obwohl der zweite
// Tipp den Pin schon geloest hatte.
const isMouse = (e) => !e.pointerType || e.pointerType === 'mouse'
const isKeyboardFocus = (e) => { try { return e.target.matches(':focus-visible') } catch { return true } }

const catColor = (cats, i) => (cats[i] && cats[i].cat === 'andere' ? CAT_OTHER : CAT[i])

// ---- Canvas-Tuning (Nebula) ----
const BLEND_MODE = 'screen' // additives Blending; 'lighter' waere noch heller, wuerde Farben aber schneller auswaschen
const POINT_SIZE = 1.5
const ALPHA_FIELD = 0.28 // Grund-Deckkraft je Punkt: hoeher = praesenter/leuchtender (war 0.1)
const ALPHA_BRUSH_HI = 0.95 // gehovertes Feld (Brushing)
const ALPHA_BRUSH_LO = 0.04 // uebrige Felder beim Brushing stark gedimmt
// Bloom: der Settled-Buffer wird einmal geblurrt unter das scharfe Bild komposit -> Nebel gluehen,
// Kerne bleiben heiss. EIN drawImage mit GPU-Blur pro Frame, keine Per-Punkt-Kosten.
const BLOOM_ON = true
const BLOOM_PX = 3 // Blur-Radius in CSS-px (wird mit dpr multipliziert)
const BLOOM_A = 0.4 // Deckkraft des Bloom-Layers
// ---- Scrollytelling-Tuning ----
const CONTAINER_VH = 280
const FADE_YEARS = 1.0
const MIN_YEAR_TOTAL = 1000 // Mindest-Gesamtpaper je Jahr, damit der Feld-Anteil statistisch belastbar ist (filtert sparse Fruehjahre)
const CANVAS_VH = 68 // Hoehen-Cap des Canvas (war 58vh: Akt 2 wirkte kleiner als die anderen Akte)
const CANVAS_RESERVED = 320 // reservierte Viewport-Hoehe fuer Header + Jahres-Leiste + Legende
const YEARSTRIP_H = 24 // Hoehe der Jahres-Leiste (Scrub-Indikator)

const EPOCHS = [
  { year: 2012, title: 'Der Deep-Learning-Boom', text: 'Computer Vision explodiert: tiefe Netze auf GPUs setzen sich durch, die Bild-Cluster der Karte füllen sich.' },
  { year: 2017, title: 'Attention Is All You Need', text: 'Die Transformer-Architektur erscheint; die Sprachverarbeitung formiert sich neu und wächst rasant.' },
  { year: 2022, title: 'Die generative Ära', text: 'Der ChatGPT-Moment: generative Modelle dominieren, die Karte wächst in allen Feldern explosionsartig.' },
]

function Epoch({ progress, p0, title, text, stacked }) {
  const opacity = useTransform(progress, [p0 - 0.045, p0 + 0.015, p0 + 0.16, p0 + 0.21], [0, 1, 1, 0])
  // Telefon: die Karte steht im Slot unter der Karte (.map-slot), statt die Feld-Labels zu verdecken.
  const place = stacked ? {} : { position: 'absolute', left: 'var(--s-4)', top: 'var(--s-4)', maxWidth: 'min(360px, 64%)', zIndex: 4, boxShadow: '0 14px 36px rgba(0,0,0,0.55)' }
  return (
    <motion.div className="map-epoch" style={{ opacity, pointerEvents: 'none', background: 'var(--panel-2)', border: `1px solid ${PAL.machineLine}`, borderRadius: 8, padding: stacked ? 'var(--s-3) var(--s-4)' : 'var(--s-4) var(--s-5)', ...place }}>
      <div className="t-display-s" style={{ color: PAL.text, marginBottom: 'var(--s-2)' }}>{title}</div>
      <div className="t-body" style={{ color: PAL.muted, lineHeight: 1.45 }}>{text}</div>
    </motion.div>
  )
}

export default function MapOfAI() {
  const [d, setD] = useState(null)
  const reduce = useReducedMotion()
  const compact = useCompact()
  // Unter 1024 px (Telefon und Tablet hochkant) stehen Jahr, Epochen- und Feldkarte neben statt
  // auf der Karte: bei 706 px Kartenbreite deckte die 400 px breite Feldkarte die Labels ab.
  const stacked = useMediaQuery('(max-width: 1023px)')
  const canvasRef = useRef(null)
  const containerRef = useRef(null)
  const { scrollYProgress } = useScroll({ target: containerRef, offset: ['start start', 'end end'] })
  const yearRef = useRef(2007)
  const yearIntRef = useRef(2007)
  const hoverCatRef = useRef(null)
  const pinCatRef = useRef(null) // per Klick fixiertes Feld (Yi: select) -> Brush persistent + Top-Paper-Panel
  const rafRef = useRef(0)
  const settledRef = useRef(null)
  const settledYearRef = useRef(-Infinity)
  const prevRef = useRef(null) // Doppelpuffer: Stand ein Jahr zurueck (ruckfreies 1-Jahr-Rueckscrollen)
  const prevYearRef = useRef(-Infinity)
  const [displayYear, setDisplayYear] = useState(2007)
  const [hoverCat, setHoverCat] = useState(null)
  const [pinCat, setPinCat] = useState(null)
  const [paperView, setPaperView] = useState('year')

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}data/map.json`).then((r) => r.json()).then(setD).catch((e) => console.error('map:', e))
  }, [])

  const Y0 = d?.yearRange?.[0] ?? 2007
  const Y1 = d?.yearRange?.[1] ?? 2026

  const centroids = useMemo(() => {
    if (!d) return []
    const acc = d.cats.map(() => ({ sx: 0, sy: 0, n: 0 }))
    for (let i = 0; i < d.n; i++) { const c = d.c[i]; acc[c].sx += d.x[i]; acc[c].sy += d.y[i]; acc[c].n++ }
    return d.cats.map((cat, i) => ({ ...cat, x: acc[i].n ? acc[i].sx / acc[i].n : 0, y: acc[i].n ? acc[i].sy / acc[i].n : 0, n: acc[i].n }))
      .filter((c) => c.n > 200 && c.cat !== 'andere')
  }, [d])

  // Gruppierung nach (Jahr, Feld) -> Draw zeichnet nur die noetigen Punkte mit Year-Fade.
  const groups = useMemo(() => {
    if (!d) return []
    const byYear = new Map()
    for (let i = 0; i < d.n; i++) {
      const yr = d.yr[i], c = d.c[i]
      let cm = byYear.get(yr); if (!cm) { cm = new Map(); byYear.set(yr, cm) }
      let a = cm.get(c); if (!a) { a = []; cm.set(c, a) }
      a.push(i)
    }
    return [...byYear.entries()].sort((a, b) => a[0] - b[0]).map(([year, cm]) => ({ year, cats: [...cm.entries()] }))
  }, [d])

  // Feld-Statistik fuer die Info-Karte. Staerkste Jahre = hoechster ANTEIL des Felds am Gesamtjahr
  // (eliminiert den Sample-Size-Bias), berechnet NUR ueber den arXiv-Vollbestand bis 2021. Grund:
  // 2022-2026 ist eine gleichmaessige Stichprobe je Feld -> dort waeren die Anteile kuenstlich
  // ausgeglichen, also nicht aussagekraeftig. Absolute Zahlen wuerden dagegen immer die juengsten
  // Vollbestand-Jahre gewinnen lassen (2019-2021).
  const fieldStats = useMemo(() => {
    const out = {}
    const yearTotals = {}
    for (const g of groups) {
      let t = 0
      for (const [ci, idx] of g.cats) {
        if (!out[ci]) out[ci] = { byYear: {}, total: 0 }
        out[ci].byYear[g.year] = (out[ci].byYear[g.year] || 0) + idx.length
        out[ci].total += idx.length
        t += idx.length
      }
      yearTotals[g.year] = t
    }
    for (const ci in out) {
      out[ci].topYears = Object.entries(out[ci].byYear)
        .filter(([y]) => +y <= 2021 && yearTotals[y] >= MIN_YEAR_TOTAL)
        .map(([y, n]) => [+y, n / yearTotals[y]])
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([y]) => y)
        .sort((a, b) => a - b)
    }
    return out
  }, [groups])
  const countUpTo = (ci, year) => { let n = 0; const by = fieldStats[ci]?.byYear || {}; for (const y in by) if (+y <= year) n += by[y]; return n }
  const fmtCount = (n) => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(n))

  // Papers je Jahr fuer die Jahres-Leiste (Scrub-Indikator). LINEAR skaliert: die duennen 2022+-Balken
  // ZEIGEN das API-Stichproben-Artefakt ehrlich, statt es wegzunormieren.
  const yearCounts = useMemo(() => groups.map((g) => ({ year: g.year, n: g.cats.reduce((s, [, idx]) => s + idx.length, 0) })), [groups])
  const maxYearN = useMemo(() => yearCounts.reduce((m, yc) => Math.max(m, yc.n), 1), [yearCounts])

  const draw = useCallback(() => {
    const cv = canvasRef.current
    if (!cv || !d) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    if (cv.width !== W * dpr) { cv.width = W * dpr; cv.height = H * dpr }
    const ctx = cv.getContext('2d')
    const S = POINT_SIZE
    const yf = yearRef.current
    const hc = hoverCatRef.current ?? pinCatRef.current // Hover uebersteuert den Pin temporaer
    const floorY = Math.floor(yf)
    const paint = (c, from, to) => {
      c.globalCompositeOperation = BLEND_MODE
      for (const g of groups) {
        if (g.year < from) continue
        if (g.year > to) break
        for (const [ci, idx] of g.cats) {
          c.globalAlpha = ALPHA_FIELD
          c.fillStyle = catColor(d.cats, ci)
          for (let k = 0; k < idx.length; k++) { const i = idx[k]; c.fillRect(projX(d.x[i]) - S / 2, projY(d.y[i]) - S / 2, S, S) }
        }
      }
    }

    if (hc !== null) {
      // Brushing: voller Redraw (nur bei Hover, nicht pro Scroll-Frame); gehovertes Feld hell, Rest gedimmt.
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H)
      ctx.globalCompositeOperation = BLEND_MODE
      for (const g of groups) {
        if (g.year > yf + FADE_YEARS) break
        const factor = Math.max(0, Math.min(1, (yf - g.year) / FADE_YEARS + 1))
        if (factor <= 0) continue
        for (const [ci, idx] of g.cats) {
          ctx.globalAlpha = factor * (ci === hc ? ALPHA_BRUSH_HI : ALPHA_BRUSH_LO)
          ctx.fillStyle = catColor(d.cats, ci)
          for (let k = 0; k < idx.length; k++) { const i = idx[k]; ctx.fillRect(projX(d.x[i]) - S / 2, projY(d.y[i]) - S / 2, S, S) }
        }
      }
      // Top-Paper des fokussierten Felds markieren (Ringe + Rang): die meistzitierten Paper laut
      // OpenAlex, gematcht gegen den Korpus -> Klick-Panel und Karte zeigen dieselben Werke.
      const tops = (d.top || []).filter((t) => t.c === hc)
      if (tops.length) {
        ctx.globalCompositeOperation = 'source-over'
        ctx.globalAlpha = 1
        ctx.textAlign = 'left'
        ctx.textBaseline = 'middle'
        ctx.font = '700 12px "IBM Plex Mono", monospace'
        tops.forEach((t, ti) => {
          const px = projX(t.x); const py = projY(t.yy)
          // Sichtbarkeit (r3a): Doppelring statt duenner Einzellinie. Dunkler Unterring trennt die
          // Markierung vom hellen Punktfeld (Ware: Wahrnehmung braucht Kontrast zum Umfeld, nicht
          // nur absolute Helligkeit), weicher Aussenring als dezenter Halo; bewusst nur Konturen,
          // keine Flaechenfuellung (Tufte: minimale Nicht-Daten-Tinte, Karte bleibt dominant).
          ctx.beginPath(); ctx.arc(px, py, 8, 0, 6.283)
          ctx.strokeStyle = 'rgba(11,10,12,0.85)'; ctx.lineWidth = 5; ctx.stroke()
          ctx.beginPath(); ctx.arc(px, py, 8, 0, 6.283)
          ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.4; ctx.stroke()
          ctx.beginPath(); ctx.arc(px, py, 12.5, 0, 6.283)
          ctx.strokeStyle = 'rgba(255,255,255,0.38)'; ctx.lineWidth = 1.2; ctx.stroke()
          // Rangnummer mit dunkler Kontur, damit sie auch ueber hellen Punkten lesbar bleibt.
          const label = String(ti + 1)
          ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(11,10,12,0.85)'; ctx.strokeText(label, px + 17, py)
          ctx.fillStyle = '#ffffff'
          ctx.fillText(label, px + 17, py)
        })
      }
      // settled-Cache bleibt intakt (wird beim Hover nicht beschrieben) -> kein Rebuild beim Aus-Hovern
    } else {
      // Cache-Pfad: settled enthaelt alle Jahre <= floorY. Vorwaerts inkrementell; rueckwaerts 1 Jahr -> Swap.
      const ensure = () => { const c = document.createElement('canvas'); c.width = W * dpr; c.height = H * dpr; return c }
      let settled = settledRef.current
      if (!settled || settled.width !== W * dpr) { settled = ensure(); settledRef.current = settled; settledYearRef.current = -Infinity; prevRef.current = null; prevYearRef.current = -Infinity }
      if (floorY < settledYearRef.current) {
        if (prevRef.current && prevYearRef.current === floorY) {
          const tmp = settledRef.current; settledRef.current = prevRef.current; prevRef.current = tmp
          settled = settledRef.current; prevYearRef.current = settledYearRef.current; settledYearRef.current = floorY
        } else {
          const sc = settled.getContext('2d'); sc.setTransform(dpr, 0, 0, dpr, 0, 0); sc.clearRect(0, 0, W, H)
          settledYearRef.current = -Infinity; prevRef.current = null; prevYearRef.current = -Infinity
        }
      }
      if (floorY > settledYearRef.current) {
        if (settledYearRef.current !== -Infinity) {
          let prev = prevRef.current
          if (!prev || prev.width !== W * dpr) { prev = ensure(); prevRef.current = prev }
          const pc = prev.getContext('2d'); pc.setTransform(1, 0, 0, 1, 0, 0); pc.clearRect(0, 0, W * dpr, H * dpr); pc.drawImage(settled, 0, 0)
          prevYearRef.current = settledYearRef.current
        }
        const sc = settled.getContext('2d'); sc.setTransform(dpr, 0, 0, dpr, 0, 0)
        paint(sc, settledYearRef.current === -Infinity ? -Infinity : settledYearRef.current + 1, floorY)
        settledYearRef.current = floorY
      }
      // Main = Bloom (geblurrter Settled-Buffer) + scharfes Bild additiv + einfadendes Jahr.
      // over-auf-cleared == Identitaet, screen ist assoziativ -> Naht exakt.
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'source-over'
      ctx.clearRect(0, 0, W * dpr, H * dpr)
      if (BLOOM_ON && 'filter' in ctx) {
        ctx.filter = `blur(${BLOOM_PX * dpr}px)` // Blur wirkt in Device-Pixeln -> mal dpr
        ctx.globalAlpha = BLOOM_A
        ctx.drawImage(settled, 0, 0)
        ctx.filter = 'none'
      }
      ctx.globalAlpha = 1
      ctx.globalCompositeOperation = 'lighter' // scharfes Bild additiv auf den Bloom -> heisse Kerne
      ctx.drawImage(settled, 0, 0)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const frac = yf - floorY
      if (frac > 0) {
        ctx.globalCompositeOperation = BLEND_MODE
        for (const g of groups) {
          if (g.year !== floorY + 1) continue
          for (const [ci, idx] of g.cats) {
            ctx.globalAlpha = frac * ALPHA_FIELD
            ctx.fillStyle = catColor(d.cats, ci)
            for (let k = 0; k < idx.length; k++) { const i = idx[k]; ctx.fillRect(projX(d.x[i]) - S / 2, projY(d.y[i]) - S / 2, S, S) }
          }
          break
        }
      }
    }
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
    // Feld-Labels werden NICHT mehr auf den Canvas gezeichnet, sondern als HTML-Overlays (Hover-Zonen).
  }, [d, groups])

  const requestDraw = useCallback(() => {
    if (rafRef.current) return
    rafRef.current = requestAnimationFrame(() => { rafRef.current = 0; draw() })
  }, [draw])

  useEffect(() => {
    if (!d) return
    if (reduce) { yearRef.current = Y1; yearIntRef.current = Y1; setDisplayYear(Y1) }
    else { const v = scrollYProgress.get(); const yf = Y0 + v * (Y1 - Y0); yearRef.current = yf; const yi = Math.min(Y1, Math.round(yf)); yearIntRef.current = yi; setDisplayYear(yi) }
    requestDraw()
  }, [d, reduce, Y0, Y1, scrollYProgress, requestDraw])

  useMotionValueEvent(scrollYProgress, 'change', (v) => {
    if (!d || reduce) return
    const yf = Y0 + v * (Y1 - Y0)
    yearRef.current = yf
    requestDraw()
    const yi = Math.min(Y1, Math.max(Y0, Math.round(yf)))
    if (yi !== yearIntRef.current) { yearIntRef.current = yi; setDisplayYear(yi) }
  })

  const setHover = useCallback((ci) => { hoverCatRef.current = ci; setHoverCat(ci); requestDraw() }, [requestDraw])
  const setPin = useCallback((ci) => { pinCatRef.current = ci; setPinCat(ci); requestDraw() }, [requestDraw])
  const togglePin = useCallback((ci) => { setPin(pinCatRef.current === ci ? null : ci) }, [setPin])
  // Escape loest den Pin (a11y)
  useEffect(() => {
    if (pinCat === null) return
    const onKey = (e) => { if (e.key === 'Escape') setPin(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pinCat, setPin])

  let shownCount = 0
  for (const g of groups) { if (g.year > displayYear) break; for (const [, idx] of g.cats) shownCount += idx.length }

  const canvasAria = reduce
    ? 'Punktwolke aller KI-Forschungspapiere 2007 bis 2026, nach Feld gefärbt (Standbild des Endstands).'
    : 'Punktwolke der KI-Forschungspapiere, nach Feld gefärbt; waechst beim Scrollen von 2007 bis 2026.'

  // Feld-Labels als HTML-Overlays an den Cluster-Zentren (Prozent der Canvas-Box) -> echte Hover-Zonen.
  const fieldLabels = centroids.map((c) => {
    const ci = d.cats.findIndex((x) => x.cat === c.cat)
    const left = (projX(c.x) / W) * 100
    const top = (projY(c.y) / H) * 100
    const active = hoverCat ?? pinCat
    const color = active === ci ? PAL.machine : (active !== null ? PAL.muted : undefined)
    return (
      <button key={c.cat} className="map-label" onPointerEnter={(e) => isMouse(e) && setHover(ci)} onPointerLeave={(e) => isMouse(e) && setHover(null)}
        onFocus={(e) => isKeyboardFocus(e) && setHover(ci)} onBlur={() => setHover(null)} onClick={() => togglePin(ci)}
        aria-label={`Feld fixieren und Top-Paper zeigen: ${LABELS[c.cat] || c.cat}`} aria-pressed={pinCat === ci}
        style={{ left: `${left}%`, top: `${top}%`, color }}>
        {compact ? (SHORT_LABELS[c.cat] || LABELS[c.cat] || c.cat) : (LABELS[c.cat] || c.cat)}
        {!compact && <span className="map-chip">{fmtCount(countUpTo(ci, displayYear))}</span>}
      </button>
    )
  })

  // Telefon: das Jahr steht als Zeile UEBER der Karte; als Overlay deckte es dort zwei Feld-Labels ab.
  const yearBadge = (
    <div style={stacked
      ? { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 'var(--s-3)', marginBottom: 'var(--s-2)', pointerEvents: 'none' }
      : { position: 'absolute', right: 'var(--s-4)', top: 'var(--s-4)', textAlign: 'right', pointerEvents: 'none', zIndex: 7 }}>
      <div className="mono" aria-live="polite" style={{ fontSize: stacked ? '2rem' : 'clamp(2rem, 4vw, 3.4rem)', fontWeight: 500, color: PAL.text, lineHeight: 1 }}>{displayYear}</div>
      <div className="t-data" style={{ color: PAL.muted, marginTop: 'var(--s-1)' }}>{shownCount.toLocaleString('de-DE')} Paper</div>
      {/* Ehrlichkeits-Badge: altes JSON (ohne sampleK) = API-Stichprobe ab 2022; neues JSON = ggf. proportionstreue 1:k-Darstellung */}
      {d && d.sampleK === undefined && displayYear > 2021 && <div className="t-data" style={{ color: PAL.muted, opacity: 0.7 }}>ab 2022: Stichprobe</div>}
      {d?.sampleK > 1 && <div className="t-data" style={{ color: PAL.muted, opacity: 0.7 }}>dargestellt: jeder {d.sampleK}. Punkt</div>}
    </div>
  )

  // Deep-Dive-Info-Karte: Hover zeigt Feld-Statistik; KLICK fixiert das Feld (Yi: select) und
  // zeigt die meistzitierten Paper (OpenAlex-Zitationen, gegen den Korpus gematcht) mit
  // nummerierten Ring-Markierungen auf der Karte.
  const focusCat = hoverCat ?? pinCat
  const focusTops = focusCat !== null ? (d.top || []).filter((t) => t.c === focusCat) : []
  // r3b: Top-Paper DES Scroll-Jahres je Feld (topPapersByYear: Feld -> Jahr -> Liste) -> das Panel
  // reagiert live auf den Jahres-Scrub, zusaetzlich zur Gesamt-Liste.
  const yearTops = focusCat !== null && d.cats[focusCat]
    ? (d.topPapersByYear?.[d.cats[focusCat].cat]?.[String(displayYear)] || [])
    : []
  const fmtCit = (n) => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(n))
  const linkStyle = { color: PAL.text, textDecoration: 'underline', textDecorationColor: 'rgba(236,232,225,0.45)', textUnderlineOffset: 3 }
  // Panel auf der GEGENSEITE des fokussierten Feldes: verdeckt nie das eigene Feld samt Ring-
  // Markierungen (Nutzer-Befund: linke Felder wurden vom links fixierten Panel ueberdeckt).
  const focusCentroid = focusCat !== null && d.cats[focusCat] ? centroids.find((c) => c.cat === d.cats[focusCat].cat) : null
  const panelRight = focusCentroid ? projX(focusCentroid.x) / W < 0.45 : false
  const infoPlace = stacked
    ? {}
    : { position: 'absolute', ...(panelRight ? { right: 'var(--s-4)' } : { left: 'var(--s-4)' }), top: 'var(--s-4)', width: 'min(400px, calc(100% - 2 * var(--s-4)))', maxHeight: 'calc(100% - var(--s-8))', overflowY: 'auto', zIndex: 6, boxShadow: '0 14px 36px rgba(0,0,0,0.55)' }
  const infoCard = focusCat !== null && d.cats[focusCat] ? (
    <div className="map-info" style={{ ...infoPlace, pointerEvents: pinCat !== null ? 'auto' : 'none', background: 'var(--panel-2)', border: `1px solid ${PAL.machineLine}`, borderRadius: 8, padding: stacked ? 'var(--s-3) var(--s-4)' : 'var(--s-4) var(--s-5)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--s-2)' }}>
        <div className="t-display-s" style={{ color: catColor(d.cats, focusCat), marginBottom: 'var(--s-2)' }}>{LABELS[d.cats[focusCat].cat] || d.cats[focusCat].cat}</div>
        {pinCat !== null && (
          <button onClick={() => setPin(null)} aria-label="Feld-Fokus schließen" className="mono tap-min"
            style={{ background: 'transparent', border: 'none', color: PAL.muted, cursor: 'pointer', fontSize: '1rem', lineHeight: 1 }}>✕</button>
        )}
      </div>
      <div className="t-body" style={{ color: PAL.muted, lineHeight: 1.5 }}>
        <span className="mono" style={{ color: PAL.text }}>{countUpTo(focusCat, displayYear).toLocaleString('de-DE')}</span> Paper bis {displayYear}.
        {fieldStats[focusCat]?.topYears?.length > 0 && <><br />Höchster Forschungsanteil (bis 2021): <span className="mono" style={{ color: PAL.text }}>{fieldStats[focusCat].topYears.join(', ')}</span>.</>}
      </div>
      {focusTops.length > 0 ? (
        <>
          <div role="tablist" aria-label="Paper-Zeitraum" style={{ display: 'flex', gap: 6, marginTop: 'var(--s-4)' }}>
            {[['year', `Jahr ${displayYear}`], ['all', 'Allzeit']].map(([id, label]) => (
              <button key={id} role="tab" aria-selected={paperView === id} onClick={() => setPaperView(id)} className="mono map-tab"
                style={{ cursor: 'pointer', border: `1px solid ${paperView === id ? PAL.machine : PAL.hairline}`, borderRadius: 999, background: 'transparent', color: paperView === id ? PAL.text : PAL.muted, padding: '3px 9px', fontSize: '0.67rem' }}>{label}</button>
            ))}
          </div>
          <p className="kicker" style={{ margin: 'var(--s-3) 0 var(--s-2)' }}>{paperView === 'year' ? `Meistzitiert aus ${displayYear}` : 'Meistzitierte Paper, Allzeit'}</p>
          {paperView === 'year' && yearTops.length === 0 ? (
            <p className="t-data" style={{ color: PAL.muted, lineHeight: 1.5, margin: 0 }}>Für dieses Feld und Jahr fehlt ein zuverlässig zugeordneter OpenAlex-Treffer.</p>
          ) : (<ol style={{ margin: 0, padding: 0, listStyle: 'none' }}>
            {(paperView === 'year' ? yearTops.slice(0, 3) : focusTops).map((t, ti) => (
              <li key={`${t.id || t.url || t.title || t.t}-${ti}`} className="mono" style={{ fontSize: '0.72rem', lineHeight: 1.45, color: PAL.muted, marginBottom: 'var(--s-2)', display: 'flex', gap: '8px' }}>
                <span style={{ color: PAL.text, flexShrink: 0 }}>{ti + 1}.</span>
                <span>
                  <a href={t.url || `https://arxiv.org/abs/${t.id}`} target="_blank" rel="noopener noreferrer"
                    style={linkStyle}>{t.title || t.t}</a> ({t.year || t.y}) · <span style={{ color: catColor(d.cats, focusCat) }}>{fmtCit(t.citations || t.cit)} Zitationen</span>
                </span>
              </li>
            ))}
          </ol>)}
          <p className="t-data" style={{ color: PAL.muted, opacity: 0.75, marginTop: 'var(--s-2)' }}>
            Zitationen: OpenAlex (Abruf 2026-07); Ringe markieren die Allzeit-Paper. Titel öffnen arXiv.
          </p>
        </>
      ) : (
        pinCat === null && <p className="t-data" style={{ color: PAL.machine, marginTop: 'var(--s-3)' }}><span className="only-hover">Klick</span><span className="only-touch">Tippen</span> fixiert das Feld{(d.top || []).length > 0 ? ' und zeigt die meistzitierten Paper' : ''}.</p>
      )}
    </div>
  ) : null

  const epochList = (
    <div className="text-column" style={{ marginTop: 'var(--s-6)' }}>
      <p className="kicker" style={{ marginBottom: 'var(--s-3)' }}>Epochen</p>
      {EPOCHS.map((e) => (
        <p key={e.year} className="t-body" style={{ color: PAL.muted, marginBottom: 'var(--s-2)' }}>
          <span className="mono" style={{ color: PAL.text }}>{e.year}</span> · {e.title}: {e.text}
        </p>
      ))}
    </div>
  )
  const legendEl = (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--s-2) var(--s-5)', marginTop: 'var(--s-4)' }}>
      {centroids.map((c) => {
        const ci = d.cats.findIndex((x) => x.cat === c.cat)
        const active = hoverCat ?? pinCat
        const dim = active !== null && active !== ci
        return (
          // Echter Button statt span mit onClick: per Tastatur erreichbar und mit Tap-Flaeche.
          <button key={c.cat} type="button" className="t-data map-legend-btn" aria-pressed={pinCat === ci}
            onPointerEnter={(e) => isMouse(e) && setHover(ci)} onPointerLeave={(e) => isMouse(e) && setHover(null)} onClick={() => togglePin(ci)}
            style={{ opacity: dim ? 0.4 : 1, transition: 'opacity 0.15s', color: pinCat === ci ? PAL.text : PAL.muted }}>
            <span style={{ width: 10, height: 10, borderRadius: 999, background: catColor(d.cats, ci), display: 'inline-block' }} /> {LABELS[c.cat] || c.cat}
          </button>
        )
      })}
      <span className="t-data" style={{ color: PAL.muted, opacity: 0.7, alignSelf: 'center' }}>
        <span className="only-hover">· überfahren für Details, Klick für die Top-Paper</span>
        <span className="only-touch">· Feld antippen für Details und Top-Paper</span>
      </span>
    </div>
  )
  const srTable = (
    <table className="sr-only">
      <caption>Forschungsfelder in der Stichprobe und Zahl der Paper</caption>
      <thead><tr><th scope="col">Feld</th><th scope="col">Paper (Stichprobe)</th></tr></thead>
      <tbody>{centroids.map((c) => <tr key={c.cat}><td>{LABELS[c.cat] || c.cat}</td><td>{c.n}</td></tr>)}</tbody>
    </table>
  )
  // Der grosse Titel lebt in der ActIntro-Herleitung (App.jsx); am Chart bleibt die kompakte Zeile.
  const header = (
    <div className="text-column">
      <Reveal>
        <p className="kicker" style={{ marginBottom: 'var(--s-2)' }}>Akt 2 · Das Wissen</p>
        <p className="t-data" style={{ color: PAL.muted, marginTop: 'var(--s-2)' }}>Daten: Text-Korpus, abgeleitet 2D · 8 Felder, zeitlich · Task: Topologie &amp; Trend. Anordnung nach arXiv-Kategorien (cs.AI, cs.LG).</p>
        <p className="t-body" style={{ color: PAL.muted, marginTop: 'var(--s-3)', marginBottom: 'var(--s-3)' }}>
          <span style={{ color: PAL.machine }}>Scrolle</span> durch die Jahre und sieh die Karte von 2007 bis 2026 wachsen; <span className="only-hover">fahr über ein Feld für Details.</span><span className="only-touch">tippe auf ein Feld für Details.</span>
        </p>
      </Reveal>
    </div>
  )
  const headerCompact = (
    <div className="text-column">
      <Reveal>
        <p className="kicker" style={{ marginBottom: 'var(--s-2)' }}>Akt 2 · Das Wissen</p>
        <p className="t-data" style={{ color: PAL.muted, marginTop: 'var(--s-2)' }}>
          Anordnung nach arXiv-Kategorien (cs.AI, cs.LG). <span style={{ color: PAL.machine }}>Scrolle</span> durch die Jahre, <span className="only-hover">fahr über ein Feld für Details, Klick fixiert es.</span><span className="only-touch">tippe auf ein Feld für Details.</span>
        </p>
      </Reveal>
    </div>
  )
  const afterMap = (
    <div className="layout-container">
      <div className="editorial-grid">
        {d && <SourceNote>
          {/* build_map.py schreibt sampleK immer; der frühere Zweig für JSON ohne sampleK (API-Stichprobe ab 2022) ist entfallen. */}
          <>arXiv-Abstracts, Vollbestand 2007 bis 2026 (Snapshot bis 2021 plus offizielles OAI-PMH-Harvesting 2022 bis 2026, Primär-Kategorie und Einreichungsjahr), Metadaten CC0. {d.sampleK > 1 ? `Dargestellt ist jeder ${d.sampleK}. Punkt je Jahr und Feld (${d.n.toLocaleString('de-DE')} von rund ${(d.n * d.sampleK / 1000).toFixed(0)}k Papern; Proportionen exakt erhalten). ` : `Jeder einzelne Punkt ein Paper (${d.n.toLocaleString('de-DE')}). `}Die Top-Paper je Feld (Klick) sind die meistzitierten laut OpenAlex (Abruf 2026-07, CC0), gematcht über die arXiv-ID. </>
          Layout: Felder sind nach arXiv-Kategorie zu Konstellationen gesetzt; Nähe INNERHALB eines Feldes = Vokabular-Verwandtschaft (TF-IDF + Truncated SVD), keine semantische Wahrheit.
        </SourceNote>}
        <Reveal className="text-column">
          <p className="t-display-s" style={{ color: PAL.muted, marginTop: 'var(--s-16)', maxWidth: '28ch' }}>
            Aus diesem Wissen werden Modelle, und Modelle bekommen <span style={{ color: PAL.text }}>Nachkommen.</span>
          </p>
        </Reveal>
        {srTable}
      </div>
    </div>
  )

  // Canvas-Box mit allen Overlays (Labels/Badge/Karte). Wrapper = exakt die Canvas-Flaeche, damit die
  // HTML-Label-Positionen (Prozent) mit den Cluster-Zentren auf dem Canvas uebereinstimmen.
  const stackW = compact ? '100%' : `min(100%, calc(min(${CANVAS_VH}vh, 100vh - ${CANVAS_RESERVED}px) * ${W} / ${H}))`
  const yearStrip = yearCounts.length > 0 && (
    <div aria-hidden="true" style={{ width: stackW, margin: 'var(--s-2) auto 0', pointerEvents: 'none' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: YEARSTRIP_H }}>
        {yearCounts.map(({ year, n }) => (
          <div key={year} style={{ flex: 1, height: Math.max(2, (n / maxYearN) * YEARSTRIP_H), background: year === displayYear ? PAL.machine : year < displayYear ? 'rgba(236,232,225,0.42)' : 'rgba(236,232,225,0.1)', borderRadius: 1 }} />
        ))}
      </div>
      <div className="t-data" style={{ color: PAL.muted, fontSize: '0.64rem', marginTop: 4, display: 'flex', justifyContent: 'space-between', gap: 'var(--s-3)' }}>
        <span>{Y0}</span>
        <span style={{ opacity: 0.8 }}>
          {d.sampleK === undefined
            ? 'Paper je Jahr; ab 2022 gleichmäßige API-Stichprobe je Feld, reale Menge weit höher'
            : d.sampleK > 1
              ? `Paper je Jahr, Vollbestand bis 2026; dargestellt jeder ${d.sampleK}. Punkt, Proportionen exakt`
              : 'Paper je Jahr, Vollbestand 2007 bis 2026'}
        </span>
        <span>{Y1}</span>
      </div>
    </div>
  )
  const vizStack = (epochsNode, { withLegend = true } = {}) => (
    <div className="viz" style={{ gridColumn: '1 / -1' }}>
      {stacked && yearBadge}
      <div style={{ position: 'relative', width: stackW, aspectRatio: `${W} / ${H}`, margin: '0 auto' }}>
        <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} role="img" aria-label={canvasAria} />
        {fieldLabels}
        {/* Jahres-Badge weicht, wenn das Panel rechts andockt (sonst Ueberdeckung oben rechts) */}
        {!stacked && !(focusCat !== null && panelRight) && yearBadge}
        {!stacked && (focusCat !== null ? infoCard : epochsNode)}
      </div>
      {yearStrip}
      {/* Telefon: Epochen- und Feldkarte im Slot unter der Karte statt darueber */}
      {stacked && (focusCat !== null || epochsNode) && <div className="map-slot">{focusCat !== null ? infoCard : epochsNode}</div>}
      {withLegend && legendEl}
    </div>
  )

  // ---- Reduced-Motion: statische Vollkarte, kein erzwungenes Scrollen ----
  if (reduce) {
    return (
      <section id="map" aria-label="Die Landkarte der KI-Forschung" className="act" style={{ background: SCENE_BG }}>
        <div className="layout-container">
          <div className="editorial-grid">
            {header}
            {vizStack(null)}
            {epochList}
          </div>
        </div>
        {afterMap}
      </section>
    )
  }

  // ---- Scrollytelling-Modus ----
  // Telefon: Kopfzeile vor, Legende nach der Buehne. Beides zusammen mit Karte, Jahresleiste und
  // Epochenkarte war hoeher als 100svh, die Legende lag unter der Bildschirmkante.
  return (
    <section id="map" aria-label="Die Landkarte der KI-Forschung" style={{ background: SCENE_BG }}>
      {compact && (
        <div className="layout-container" style={{ paddingTop: 'var(--s-10)' }}>
          <div className="editorial-grid">{headerCompact}</div>
        </div>
      )}
      <div ref={containerRef} style={{ position: 'relative', height: `${CONTAINER_VH}vh` }}>
        <div className="sticky-stage">
          <div className="layout-container" style={{ width: '100%' }}>
            <div className="editorial-grid">
              {!compact && headerCompact}
              {vizStack(d && EPOCHS.map((e) => <Epoch key={e.year} progress={scrollYProgress} p0={(e.year - Y0) / (Y1 - Y0)} title={e.title} text={e.text} stacked={stacked} />), { withLegend: !compact })}
            </div>
          </div>
        </div>
      </div>
      {compact && d && (
        <div className="layout-container">
          <div className="editorial-grid"><div style={{ gridColumn: '1 / -1' }}>{legendEl}</div></div>
        </div>
      )}
      {afterMap}
    </section>
  )
}
