import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion, useScroll, useTransform, useMotionValueEvent, useReducedMotion } from 'motion/react'
import { scaleLinear, scaleLog } from 'd3-scale'
import { PAL, heat, SCENE_BG } from '../theme'
import { Reveal, SourceNote } from './Motion'
import { useCompact, useElementWidth } from './useViewport'

// Akt 1, "Die Explosion der Rechenleistung". Bespoke D3/SVG: x = Jahr, y = Training-Compute (FLOP,
// log), jedes Modell ein Punkt (Farbe = Compute-Magnitude). Eine gluehende Frontier-Linie zeigt den
// jeweils groessten je trainierten Lauf.
// Phase 5 (Scrollytelling): Die Chart wird sticky; beim Scrollen waechst die Frontier von links nach
// rechts. Erreicht sie einen Meilenstein, ploppt dessen Ring auf und ein kurzer Erklaertext erscheint.
// Framer-Motion-Values haengen direkt an SVG-Attributen (kein React-Rerender pro Scroll-Frame).
// prefers-reduced-motion -> statische Vollansicht (kein erzwungenes Scrollen, alles sofort sichtbar).

// Geometrie. Desktop (Spalte >= DESKTOP_MIN) behaelt exakt die frueheren Konstanten 1320 x 548
// mit viewBox-Skalierung. Darunter rechnet die Grafik im Massstab 1:1 zur gemessenen Breite:
// sonst schrumpften Achsen und Story-Boxen mit dem viewBox auf 3 bis 4 px (gemessen bei 390 px).
const DESKTOP_MIN = 1000
const DESKTOP_GEO = { W: 1320, H: 548, PAD_L: 70, PAD_R: 44, PAD_T: 118, PAD_B: 54, compact: false }
const MIN_COMPACT_H = 280
function geometryFor(width, vh, compact, reduce) {
  if (!width || width >= DESKTOP_MIN) return DESKTOP_GEO
  if (!compact) {
    // Tablet: Story-Boxen bleiben im Kopf der Grafik (PAD_T), der Plot bekommt Hoehe.
    return { W: width, H: Math.max(420, Math.round(width * 0.56)), PAD_L: 64, PAD_R: 24, PAD_T: 118, PAD_B: 48, compact: false }
  }
  // Telefon: fast quadratisch, gedeckelt auf gut die halbe Bildschirmhoehe, damit Grafik,
  // Legende und Meilenstein-Karte gemeinsam in die Sticky-Buehne passen.
  const plotH = Math.round(Math.max(MIN_COMPACT_H, Math.min(width, vh * 0.5)))
  // Reduced Motion zeigt alle Meilenstein-Namen statisch in drei Zeilen ueber dem Plot.
  const padT = reduce ? 78 : 26
  return { W: width, H: plotH + padT - 26, PAD_L: 44, PAD_R: 10, PAD_T: padT, PAD_B: 34, compact: true }
}
const TAP_RADIUS_PX = 24 // Fingertoleranz fuer den Tipp auf einen Punkt (CSS-px)
const Y0 = 2010
const Y1 = 2026.5
const F0 = 1e15
const F1 = 1e27

// ---- Visual-Tuning (SVG) ----
const DOT_R = 3.8
const DOT_R_COMPACT = 3
const DOT_OPACITY = 0.8 // Punkt-Deckkraft des gezuendeten/statischen Layers
const DOT_OPACITY_BG = 0.18 // blasser Sternenhimmel im Scrolly-Modus (unter dem Ignite-Layer)
const DOT_CORE_R = 1.25 // weisser Kern (Ware: Luminanz-Popout, Stern-Anmutung)
const DOT_CORE_A = 0.85 // Kern-Opacity-Faktor (mal Punkt-Opacity)
const DOT_HIT_W = 7 // transparente Stroke-Breite als grosszuegige Hover-Trefferzone
// Farbskala-Domaene (viridis heat): log10(FLOP) von HEAT_LOG_MIN bis HEAT_LOG_MIN+HEAT_LOG_SPAN.
// Quelle der Legenden-Endwerte: heat(0) = 10^15 FLOP, heat(1) = 10^27 FLOP (deckt sich mit F0..F1).
const HEAT_LOG_MIN = 15
const HEAT_LOG_SPAN = 12
const FRONTIER_W = 2.5
const FRONTIER_GLOW_W = 9 // breiter Unter-Stroke = Glow der Frontier (kein SVG-Filter)
const FRONTIER_GLOW_A = 0.16
const AREA_TOP_A = 0.13 // oberer Stop der Flaeche unter der Frontier (Figure-Ground, kein Junk)
const GRID_V_A = 0.05 // vertikale Dekaden-Gridlines
const MS_RING_R = 5.5
const MS_RING_W = 2
const GRID_W = 1
// ---- Scrollytelling-Tuning ----
const CONTAINER_VH = 300 // Scroll-Weg (Hoehe des Treibers)
const DRAW_END = 0.86 // Scroll-Fortschritt, bei dem die Frontier fertig gezeichnet ist (synchron zu den Boxen)
const REVEAL_FIRST = 0.06 // Reveal-Schwelle des ersten Meilensteins
const REVEAL_LAST = 0.84 // obere Klemme: letzter Reveal muss vor 1.0 noch komplett aus-/einblenden
const REVEAL_GAP = 0.1 // Mindestabstand der Reveal-Schwellen (Einzelzeile: ~ein Story-Text aktiv)
const STORY_WINDOW = 0.05 // wie lange ein Story-Text voll sichtbar bleibt (Scroll-Fortschritt)
// Story-Box: Breite und Hoehe sind gegen den LAENGSTEN Text bemessen (gemessen im Browser mit den
// echten Schriften: hoechster Bedarf 102 px inkl. Titelzeile und Innenabstand). Vorher 280x100 -
// da lief der AlphaGo-Text mitten im Satz gegen 'overflow: hidden' und brach sichtbar ab.
const BOX_W = 330 // Story-Box Breite (User-Units)
const BOX_H = 112 // Story-Box Hoehe (passt komplett oberhalb des Plots, BOX_Y+BOX_H <= PAD_T)
const BOX_Y = 4 // Story-Boxen sitzen in der Header-Zone ueber dem Plot

// Meilensteine mit KANONISCHEM Debut-Jahr (Durchbruch), damit Jahr-Label + Story + Reveal-Reihenfolge
// stimmen. epoch.json enthaelt teils spaetere, FLOP-staerkere Laeufe gleichen Namens; wir waehlen den
// Treffer am naechsten zum kanonischen Jahr und positionieren den Ring an diesem Jahr.
const MILESTONES = [
  { key: 'alexnet', label: 'AlexNet', year: 2012 },
  { key: 'alphago', label: 'AlphaGo', year: 2016 },
  { key: 'bert', label: 'BERT', year: 2018 },
  { key: 'gpt-3', label: 'GPT-3', year: 2020 },
  { key: 'alphafold', label: 'AlphaFold', year: 2021 },
  { key: 'stable diffusion', label: 'Stable Diff.', year: 2022 },
  { key: 'gpt-4', label: 'GPT-4', year: 2023 },
  { key: 'llama', label: 'Llama', year: 2023.3 },
  { key: 'deepseek', label: 'DeepSeek', year: 2025 },
]

// Story-Snippets (Innovation + Signifikanz, max. 1-2 Saetze). Fix im Code, da epoch.json keine
// qualitativen Texte enthaelt. Formulierungen adversarial faktengeprueft (keine Premiere-/Absolut-
// Ansprueche, die nicht haltbar sind).
const STORY = {
  alexnet: { title: 'AlexNet', text: 'Der Durchbruch tiefer neuronaler Netze: auf zwei GPUs trainiert, gewann es 2012 den ImageNet-Wettbewerb mit großem Abstand und löste die Deep-Learning-Welle aus.' },
  alphago: { title: 'AlphaGo', text: 'Schlug 2016 den Go-Weltklassespieler Lee Sedol. Go hat mehr mögliche Stellungen als das Universum Atome; gelernt wurde aus Profipartien und Selbstspiel.' },
  bert: { title: 'BERT', text: 'Bidirektionales Sprachverständnis durch Masked-Language-Modeling. Machte vortrainierte Transformer zum Standard der Sprachverarbeitung.' },
  'gpt-3': { title: 'GPT-3', text: 'Der Skalierungsbeweis: mit 175 Milliarden Parametern löste es Aufgaben allein aus der Beschreibung, ganz ohne aufgabenspezifisches Training (Few-Shot).' },
  alphafold: { title: 'AlphaFold', text: 'Sagte die 3D-Struktur von Proteinen mit nahezu experimenteller Genauigkeit voraus und löste ein 50 Jahre altes Problem der Biologie.' },
  'stable diffusion': { title: 'Stable Diffusion', text: 'Offene Text-zu-Bild-Generierung für alle. Brachte hochwertige Bildsynthese aus dem Labor auf normale Hardware.' },
  'gpt-4': { title: 'GPT-4', text: 'Multimodal angelegt (Bild und Text) und deutlich verlässlicher im Schließen. Verschob KI von „beeindruckend“ zu im Alltag nutzbar.' },
  llama: { title: 'Llama', text: 'Frei verfügbare Gewichte von Meta. Demokratisierte den Zugang und entfachte das Finetune-Ökosystem, das Akt 3 als Galaxie zeigt.' },
  deepseek: { title: 'DeepSeek', text: 'Reasoning auf Spitzenniveau bei drastisch gesenkten Trainingskosten. Zeigte, dass Effizienz die schiere Größe einholen kann.' },
}

const fmtExp = (e) => `10${String(e).split('').map((c) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[+c] ?? c).join('')}`
// FLOP als Mantisse mal Zehnerpotenz (deutsches Komma), Parameter als Mrd./Mio.; fehlend -> ehrlich k.A.
const fmtFlop = (f) => { const e = Math.floor(Math.log10(f)); return `${(f / 10 ** e).toFixed(1).replace('.', ',')} · ${fmtExp(e)}` }
const fmtParams = (p) => {
  if (!p || p <= 0) return 'k.A.'
  if (p >= 1e9) return `${(p / 1e9).toLocaleString('de-DE', { maximumFractionDigits: 1 })} Mrd.`
  if (p >= 1e6) return `${(p / 1e6).toLocaleString('de-DE', { maximumFractionDigits: 0 })} Mio.`
  return p.toLocaleString('de-DE')
}

// Punkt-Layer, memoisiert: Hover-Rerenders des Parents ueberspringen die 466 gezeichneten Circles
// (props stabil). 466 = die Teilmenge von epoch.json (528 Modelle) mit year >= Y0 und flop > 0.
// Mit onTip: Halo-Circle traegt eine transparente Stroke-Trefferzone + Cursor; weisser Kern = Popout.
const Dots = memo(function Dots({ pts, x, y, op, withCore, onTip, r = DOT_R }) {
  return (
    <g pointerEvents={onTip ? undefined : 'none'}>
      {pts.map((m, i) => {
        const cx = x(Math.min(m.year, Y1))
        const cy = y(m.flop)
        return (
          <g key={i}>
            <circle cx={cx} cy={cy} r={r} fill={heat((Math.log10(m.flop) - HEAT_LOG_MIN) / HEAT_LOG_SPAN)} fillOpacity={op}
              {...(onTip ? {
                stroke: 'transparent', strokeWidth: DOT_HIT_W, style: { cursor: 'pointer' },
                onMouseEnter: (e) => onTip(m, e), onMouseMove: (e) => onTip(m, e), onMouseLeave: () => onTip(null),
              } : {})} />
            {withCore && <circle cx={cx} cy={cy} r={DOT_CORE_R} fill={PAL.ink} fillOpacity={op * DOT_CORE_A} pointerEvents="none" />}
          </g>
        )
      })}
    </g>
  )
})

// Ein Meilenstein im Scrolly-Modus: Ring (Bounce via animiertem r) + gefensterte Story-Box (Einzelzeile
// in der Header-Zone, an ms.px verankert). Eigene Komponente, damit useTransform der Hooks-Regel folgt.
function Milestone({ progress, reveal, ms, geo }) {
  const { W } = geo
  const story = geo.compact ? null : STORY[ms.key]
  const op = useTransform(progress, [reveal, reveal + 0.02], [0, 1])
  const ringR = useTransform(progress, [reveal, reveal + 0.022, reveal + 0.05], [0.1, MS_RING_R * 1.3, MS_RING_R])
  const boxOp = useTransform(progress, [reveal, reveal + 0.02, reveal + 0.02 + STORY_WINDOW, reveal + 0.045 + STORY_WINDOW], [0, 1, 1, 0])
  const bx = Math.max(6, Math.min(ms.px - BOX_W / 2, W - BOX_W - 6))
  const leaderX = Math.max(bx + 14, Math.min(ms.px, bx + BOX_W - 14))
  return (
    <g pointerEvents="none">
      <motion.circle cx={ms.px} cy={ms.py} r={ringR} fill="none" stroke={PAL.machine} strokeWidth={MS_RING_W} style={{ opacity: op }} />
      <motion.circle cx={ms.px} cy={ms.py} r={1.8} fill={PAL.machine} style={{ opacity: op }} />
      {story && (
        <motion.g style={{ opacity: boxOp }}>
          <line x1={leaderX} y1={BOX_Y + BOX_H} x2={ms.px} y2={ms.py - MS_RING_R} stroke={PAL.machine} strokeWidth="1" opacity="0.38" />
          <foreignObject x={bx} y={BOX_Y} width={BOX_W} height={BOX_H}>
            <div style={{ width: '100%', height: '100%', boxSizing: 'border-box', background: 'var(--panel-2)', border: `1px solid ${PAL.machineLine}`, borderRadius: 6, padding: 'var(--s-2) var(--s-3)', backdropFilter: 'blur(6px)', boxShadow: '0 10px 28px rgba(0,0,0,0.5)', overflow: 'hidden' }}>
              <div className="t-label" style={{ color: PAL.machine, marginBottom: 'var(--s-1)' }}>{story.title} · {Math.floor(ms.year)}</div>
              <div className="t-body" style={{ color: PAL.text, fontSize: '0.8rem', lineHeight: 1.38 }}>{story.text}</div>
            </div>
          </foreignObject>
        </motion.g>
      )}
    </g>
  )
}

// Telefon: dieselbe Story-Karte als HTML unter der Grafik, mit derselben Ein-/Ausblend-Kurve.
function MilestoneCard({ progress, reveal, ms }) {
  const story = STORY[ms.key]
  const op = useTransform(progress, [reveal, reveal + 0.02, reveal + 0.02 + STORY_WINDOW, reveal + 0.045 + STORY_WINDOW], [0, 1, 1, 0])
  if (!story) return null
  return (
    <motion.div aria-hidden="true" style={{ opacity: op, pointerEvents: 'none', background: 'var(--panel-2)', border: `1px solid ${PAL.machineLine}`, borderRadius: 6, padding: 'var(--s-3) var(--s-4)' }}>
      <div className="t-label" style={{ color: PAL.machine, marginBottom: 'var(--s-2)' }}>{story.title} · {Math.floor(ms.year)}</div>
      <div className="t-body" style={{ color: PAL.text, fontSize: '0.95rem', lineHeight: 1.45 }}>{story.text}</div>
    </motion.div>
  )
}

export default function ComputeExplosion() {
  const [data, setData] = useState(null)
  const reduce = useReducedMotion()
  const containerRef = useRef(null)
  // useScroll trackt den 300vh-Container. WICHTIG: kein Early-Return vor dem Container-Render, sonst
  // bindet useScroll an window. Im reduce-Branch bleibt scrollYProgress ungenutzt (0).
  const { scrollYProgress } = useScroll({ target: containerRef, offset: ['start start', 'end end'] })
  const compactVp = useCompact()
  const vizRef = useRef(null)
  const vizW = useElementWidth(vizRef)
  // Viewport-Hoehe nur bei Breitenwechsel lesen: das Ein-/Ausfahren der mobilen Adressleiste
  // aendert innerHeight beim Scrollen, die Grafik soll dabei nicht neu umbrechen.
  const vh = useMemo(() => (typeof window === 'undefined' ? 800 : window.innerHeight), [vizW]) // eslint-disable-line react-hooks/exhaustive-deps
  const geo = useMemo(() => geometryFor(vizW, vh, compactVp, Boolean(reduce)), [vizW, vh, compactVp, reduce])
  const { W, H, PAD_L, PAD_R, PAD_T, PAD_B, compact } = geo

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}data/epoch.json`)
      .then((r) => r.json())
      .then(setData)
      .catch((e) => console.error('epoch laden:', e))
  }, [])

  const x = useMemo(() => scaleLinear().domain([Y0, Y1]).range([PAD_L, W - PAD_R]), [PAD_L, W, PAD_R])
  const y = useMemo(() => scaleLog().domain([F0, F1]).range([H - PAD_B, PAD_T]).clamp(true), [H, PAD_B, PAD_T])
  const pts = useMemo(() => (data?.models ?? []).filter((m) => m.year >= Y0 && m.flop > 0), [data])

  // Frontier: groesster Compute je 0,5-Jahres-Fenster (monoton steigend)
  const frontier = useMemo(() => {
    const buckets = new Map()
    for (const m of pts) {
      const b = Math.floor(m.year * 2) / 2
      if (!buckets.has(b) || m.flop > buckets.get(b)) buckets.set(b, m.flop)
    }
    let running = 0
    const line = [...buckets.keys()].sort((a, b) => a - b).map((b) => {
      running = Math.max(running, buckets.get(b))
      return [x(b), y(running)]
    })
    // BIS ZUR JUENGSTEN MESSUNG WEITERZIEHEN. Jeder Bucket sitzt an seinem LINKEN Rand, die Linie
    // endete deshalb am Anfang des letzten Halbjahres und brach 36 px vor den juengsten Punkten ab
    // - sie sah abgeschnitten aus, obwohl keine Daten fehlen. Ein laufendes Maximum gilt bis zur
    // letzten Beobachtung: der flache Auslauf ist die Aussage "seither kein neuer Rekord", nicht
    // ein Datenende. Bewusst nur bis zum juengsten Modell und nicht bis zur Achsenkante Y1: das
    // waere eine Behauptung ueber Zeit, fuer die es keine Messung gibt.
    if (line.length) {
      const newest = x(Math.min(Y1, Math.max(...pts.map((m) => m.year))))
      const [lx, ly] = line[line.length - 1]
      if (newest > lx + 0.5) line.push([newest, ly])
    }
    return line
  }, [pts, x, y])
  const frontierPath = useMemo(() => frontier.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' '), [frontier])
  // Geschlossene Flaeche unter der Frontier (bis zur Baseline): Figure-Ground fuer die Story-Linie.
  const areaPath = useMemo(() => {
    if (frontier.length < 2) return ''
    const first = frontier[0]; const last = frontier[frontier.length - 1]
    return `${frontierPath} L${last[0].toFixed(1)},${H - PAD_B} L${first[0].toFixed(1)},${H - PAD_B} Z`
  }, [frontier, frontierPath, H, PAD_B])
  // x-Position auf der Frontier bei Pfadlaengen-Anteil v: exakt synchron zur pathLength-Animation.
  const xAtFrac = useMemo(() => {
    if (frontier.length < 2) return () => PAD_L
    const seg = []; let total = 0
    for (let i = 1; i < frontier.length; i++) { const l = Math.hypot(frontier[i][0] - frontier[i - 1][0], frontier[i][1] - frontier[i - 1][1]); seg.push(l); total += l }
    return (v) => {
      let target = Math.max(0, Math.min(1, v)) * total
      for (let i = 1; i < frontier.length; i++) {
        if (target <= seg[i - 1] || i === frontier.length - 1) {
          const t = seg[i - 1] > 0 ? Math.min(1, target / seg[i - 1]) : 1
          return frontier[i - 1][0] + (frontier[i][0] - frontier[i - 1][0]) * t
        }
        target -= seg[i - 1]
      }
      return frontier[frontier.length - 1][0]
    }
  }, [frontier, PAD_L])

  // Meilensteine: Treffer am naechsten zum kanonischen Jahr (Debut), Ring an diesem Jahr positioniert.
  const milestones = useMemo(() => {
    const found = []
    for (const ms of MILESTONES) {
      const hits = pts.filter((m) => m.name.toLowerCase().includes(ms.key))
      if (!hits.length) continue
      const best = hits.reduce((a, b) => (Math.abs(b.year - ms.year) < Math.abs(a.year - ms.year) ? b : a))
      found.push({ ...ms, m: best, px: x(Math.min(ms.year, Y1)), py: y(best.flop) })
    }
    found.sort((a, b) => a.year - b.year)
    // Telefon: drei Zeilen mit kuerzerem Mindestabstand, sonst passen neun Namen nicht in 350 px.
    const nRows = compact ? 3 : 2
    const MIN = compact ? 80 : 118
    const lo = PAD_L + (compact ? 22 : 46)
    const hi = W - PAD_R - (compact ? 30 : 46)
    const rows = Array.from({ length: nRows }, () => [])
    found.forEach((d, i) => { d.row = i % nRows; rows[d.row].push(d) })
    for (const row of rows) {
      row.forEach((d, i) => {
        d.lx = Math.max(lo, Math.min(d.px, hi))
        if (i > 0 && d.lx - row[i - 1].lx < MIN) d.lx = row[i - 1].lx + MIN
      })
      const over = row.length ? row[row.length - 1].lx - hi : 0
      if (over > 0) row.forEach((d) => { d.lx -= over })
    }
    return found
  }, [pts, x, y, compact, PAD_L, PAD_R, W])

  // Reveal-Schwellen: an die Linie gekoppelt (geometrischer Laengen-Anteil an ms.px), aber mit
  // Mindestabstand entzerrt und in [REVEAL_FIRST, REVEAL_LAST] normiert, damit nichts ueber 1.0 laeuft.
  const reveals = useMemo(() => {
    const out = {}
    if (frontier.length < 2 || !milestones.length) return out
    const segLen = []
    let total = 0
    for (let i = 1; i < frontier.length; i++) {
      const l = Math.hypot(frontier[i][0] - frontier[i - 1][0], frontier[i][1] - frontier[i - 1][1])
      segLen.push(l); total += l
    }
    const geom = milestones.map((ms) => {
      let acc = 0, frac = 1
      for (let i = 1; i < frontier.length; i++) {
        const x0 = frontier[i - 1][0], x1 = frontier[i][0]
        if (ms.px <= x1) {
          const t = x1 !== x0 ? Math.max(0, Math.min(1, (ms.px - x0) / (x1 - x0))) : 0
          frac = total > 0 ? (acc + segLen[i - 1] * t) / total : 0
          break
        }
        acc += segLen[i - 1]
      }
      return Math.max(0, Math.min(1, frac))
    })
    let prev = -Infinity
    const raw = geom.map((g) => { const r = Math.max(g * DRAW_END, prev + REVEAL_GAP, REVEAL_FIRST); prev = r; return r })
    const first = raw[0]
    const last = raw[raw.length - 1]
    const scale = last > REVEAL_LAST && last > first ? (REVEAL_LAST - first) / (last - first) : 1
    milestones.forEach((ms, i) => { out[ms.key] = first + (raw[i] - first) * scale })
    return out
  }, [frontier, milestones])

  const drawnLength = useTransform(scrollYProgress, [0, DRAW_END], [0, 1])

  // Ignite-Clip: EIN wachsendes Clip-Rect zuendet Flaeche + hellen Dot-Layer hinter der Frontier
  // (Attribut imperativ gesetzt, kein React-Rerender pro Scroll-Frame; null Per-Dot-Kosten).
  // Am Ende (v ~ 1) oeffnet der Clip auf die VOLLE Breite: die Frontier endet am letzten Frontier-
  // Bucket, rechts davon liegen aber noch die neuesten Punkte -> ohne Voll-Oeffnung waeren sie nie
  // gezuendet und nie klickbar (Nutzer-Befund).
  const clipRef = useRef(null)
  const clipW = useCallback((v) => (v >= 0.995 ? W : Math.max(0, xAtFrac(v) - PAD_L)), [xAtFrac, W, PAD_L])
  useMotionValueEvent(drawnLength, 'change', (v) => { clipRef.current?.setAttribute('width', String(clipW(v))) })
  useEffect(() => { clipRef.current?.setAttribute('width', String(clipW(drawnLength.get()))) }, [clipW, drawnLength])

  // Hover-Tooltip (Yi: elaborate): Details zu jedem Modell, Position relativ zum .viz-Container.
  const [tip, setTip] = useState(null)
  const pointerTypeRef = useRef('mouse')
  const onTip = useCallback((m, e) => {
    if (pointerTypeRef.current !== 'mouse') return // Finger: der Tipp-Handler unten entscheidet
    if (!m) { setTip(null); return }
    const rect = vizRef.current?.getBoundingClientRect()
    if (!rect) return
    setTip({ m, px: e.clientX - rect.left, py: e.clientY - rect.top })
  }, [])
  // Tipp-Aequivalent zum Hover: der naechste Punkt im Fingerradius bekommt den Tooltip, ein Tipp
  // daneben schliesst ihn. Die Punkte selbst sind auf dem Telefon nur 6 px gross.
  const onSvgPointerDown = useCallback((e) => { pointerTypeRef.current = e.pointerType || 'mouse' }, [])
  const onSvgClick = useCallback((e) => {
    if (pointerTypeRef.current === 'mouse') return
    const ctm = e.currentTarget.getScreenCTM()
    const rect = vizRef.current?.getBoundingClientRect()
    if (!ctm || !rect) return
    const scale = Math.hypot(ctm.a, ctm.b) || 1
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse())
    let best = null
    let bd = (TAP_RADIUS_PX / scale) ** 2
    for (const m of pts) {
      const dx = x(Math.min(m.year, Y1)) - p.x
      const dy = y(m.flop) - p.y
      const d = dx * dx + dy * dy
      if (d < bd) { bd = d; best = m }
    }
    if (!best) { setTip(null); return }
    const s = new DOMPoint(x(Math.min(best.year, Y1)), y(best.flop)).matrixTransform(ctm)
    setTip({ m: best, px: s.x - rect.left, py: s.y - rect.top })
  }, [pts, x, y])
  // Ein Tipp ausserhalb der Grafik schliesst den Tooltip (Hover hat dafuer mouseleave).
  useEffect(() => {
    if (!tip || pointerTypeRef.current === 'mouse') return undefined
    const close = (e) => { if (!vizRef.current?.contains(e.target)) setTip(null) }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [tip])

  const yTicks = [1e15, 1e18, 1e21, 1e24, 1e27]
  const xTicks = [2012, 2016, 2020, 2024]

  // KEIN Early-Return auf !data: der Scrolly-Container (containerRef) muss ab dem ersten Render im
  // Baum sein, sonst bindet useScroll an window. Leere Daten fangen die useMemos ab.

  const axes = (
    <>
      {yTicks.map((t) => (
        <g key={t} pointerEvents="none">
          <line x1={PAD_L} y1={y(t)} x2={W - PAD_R} y2={y(t)} stroke={PAL.grid} strokeWidth={GRID_W} />
          <text x={PAD_L - (compact ? 6 : 12)} y={y(t) + 4} textAnchor="end" className="t-data" fill={PAL.muted}>{fmtExp(Math.round(Math.log10(t)))}</text>
        </g>
      ))}
      {xTicks.map((t) => (
        <g key={t} pointerEvents="none">
          <line x1={x(t)} y1={PAD_T} x2={x(t)} y2={H - PAD_B} stroke={`rgba(236,232,225,${GRID_V_A})`} strokeWidth={GRID_W} />
          <line x1={x(t)} y1={H - PAD_B} x2={x(t)} y2={H - PAD_B + 5} stroke={PAL.axis} strokeWidth="1" />
          <text x={x(t)} y={H - PAD_B + (compact ? 22 : 26)} textAnchor="middle" className="t-data" fill={PAL.muted}>{t}</text>
        </g>
      ))}
      {compact
        ? <text x={2} y={PAD_T - 12} className="t-data" fill={PAL.muted} pointerEvents="none">FLOP, logarithmisch</text>
        : <text transform={`translate(16, ${(PAD_T + H - PAD_B) / 2}) rotate(-90)`} textAnchor="middle" className="t-data" fill={PAL.muted} pointerEvents="none">Training-Compute (FLOP)</text>}
      <line x1={PAD_L} y1={H - PAD_B} x2={W - PAD_R} y2={H - PAD_B} stroke={PAL.axis} strokeWidth="1" pointerEvents="none" />
    </>
  )
  // Gradient der Frontier-Flaeche (Magenta -> Nichts), von beiden Render-Zweigen genutzt.
  const areaDefs = (
    <linearGradient id="ce-area" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor={PAL.machine} stopOpacity={AREA_TOP_A} />
      <stop offset="100%" stopColor={PAL.machine} stopOpacity="0" />
    </linearGradient>
  )
  // Tooltip in der Spalte halten: am Rand verschoben, am oberen Rand unter den Punkt geklappt.
  const TIP_W = Math.min(300, Math.max(180, vizW - 16))
  const tipLeft = tip ? (vizW ? Math.max(TIP_W / 2 + 4, Math.min(tip.px, vizW - TIP_W / 2 - 4)) : tip.px) : 0
  const tipBelow = tip ? tip.py < 110 : false
  const tipEl = tip && (
    <div style={{ position: 'absolute', left: tipLeft, top: tip.py, transform: tipBelow ? 'translate(-50%, 14px)' : 'translate(-50%, calc(-100% - 12px))', pointerEvents: 'none', zIndex: 30, background: 'var(--panel-2)', border: `1px solid ${PAL.machineLine}`, borderRadius: 8, padding: 'var(--s-2) var(--s-3)', maxWidth: TIP_W, boxShadow: '0 10px 30px rgba(0,0,0,0.55)' }}>
      <div className="t-data" style={{ color: PAL.text, fontWeight: 600, lineHeight: 1.3, overflowWrap: 'anywhere' }}>{tip.m.name}</div>
      <div className="t-data" style={{ color: PAL.muted, marginTop: 2 }}>{tip.m.org}{Number.isFinite(tip.m.year) ? ` · ${Math.floor(tip.m.year)}` : ''}{tip.m.domain ? ` · ${tip.m.domain}` : ''}</div>
      <div className="t-data" style={{ color: PAL.muted, marginTop: 2 }}>
        <span style={{ color: PAL.text }}>{fmtFlop(tip.m.flop)}</span> FLOP · Parameter: <span style={{ color: PAL.text }}>{fmtParams(tip.m.params)}</span>
      </div>
    </div>
  )
  const srTable = (
    <table className="sr-only">
      <caption>Meilenstein-Modelle: Jahr und Training-Compute in FLOP</caption>
      <thead><tr><th scope="col">Modell</th><th scope="col">Jahr</th><th scope="col">FLOP</th></tr></thead>
      <tbody>{milestones.map((ms) => <tr key={ms.key}><td>{ms.label}</td><td>{Math.floor(ms.year)}</td><td>{ms.m.flop.toExponential(1)}</td></tr>)}</tbody>
    </table>
  )
  const heatBar = <div aria-hidden="true" style={{ height: 10, width: compact ? undefined : 220, flex: compact ? '1 1 0' : undefined, minWidth: compact ? 80 : undefined, borderRadius: 5, background: `linear-gradient(90deg, ${heat(0)}, ${heat(0.5)}, ${heat(1)})` }} />
  const heatLegend = compact ? (
    // Telefon: eine Zeile Skala, eine Zeile Bedienung. Die Endwerte stehen an der Skala.
    <div style={{ marginTop: 'var(--s-3)', color: PAL.muted }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)' }}>
        <span className="t-data" style={{ color: PAL.text }}>{fmtExp(HEAT_LOG_MIN)}</span>
        {heatBar}
        <span className="t-data" style={{ color: PAL.text }}>{fmtExp(HEAT_LOG_MIN + HEAT_LOG_SPAN)} FLOP</span>
      </div>
      <p className="t-data" style={{ margin: 'var(--s-2) 0 0', opacity: 0.75, fontSize: '0.78rem' }}>Farbe = Compute. Punkt antippen für Details.</p>
    </div>
  ) : (
    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--s-3)', marginTop: 'var(--s-3)', color: PAL.muted }}>
      <span className="t-data">weniger Compute</span>
      <span className="t-data" style={{ color: PAL.text }}>{fmtExp(HEAT_LOG_MIN)} FLOP</span>
      {heatBar}
      <span className="t-data" style={{ color: PAL.text }}>{fmtExp(HEAT_LOG_MIN + HEAT_LOG_SPAN)} FLOP</span>
      <span className="t-data">mehr Compute</span>
      <span className="t-data" style={{ opacity: 0.75 }}>· Punkt berühren für Details</span>
    </div>
  )
  // Der grosse Titel lebt in der ActIntro-Herleitung (App.jsx); hier bleibt die kompakte
  // Chart-Zeile: Orientierung + Daten/Task (S2) + Dekodier-Hilfe direkt am Diagramm.
  const header = (hint) => (
    <div className="text-column">
      <Reveal>
        <p className="kicker" style={{ marginBottom: 'var(--s-2)' }}>Akt 1 · Der Aufstieg</p>
        <p className="t-data" style={{ color: PAL.muted, margin: '0 0 var(--s-3)' }}>Daten: Tabelle · {pts.length} Modelle, quantitativ (FLOP) über die Zeit · Task: Trend &amp; Ausreißer</p>
        <p className="t-data" style={{ color: PAL.muted, margin: '0 0 var(--s-3)', maxWidth: '70ch' }}><span style={{ color: PAL.text }}>Ein FLOP ist eine winzige Rechnung</span>, etwa „3 × 4“ (technisch: Gleitkomma-Rechnung). 10²⁴ FLOP heißt: eine 1 mit 24 Nullen solcher Rechnungen. Jede Stufe nach oben bedeutet <span style={{ color: PAL.text }}>zehnmal mehr Rechenarbeit</span>; ein Laptop bräuchte für 10²⁴ FLOP rund 30.000 Jahre. Die größten Modelle liegen weit darüber: GPT-4 (2023) brauchte rund <span style={{ color: PAL.text }}>2 · 10²⁵ FLOP</span>, der oberste Punkt im Diagramm (Grok 4, 2025) sogar rund <span style={{ color: PAL.text }}>5 · 10²⁶ FLOP</span>, also etwa fünfhundertmal mehr als das Laptop-Beispiel.</p>
        <p className="t-body" style={{ color: PAL.muted, margin: 0, maxWidth: '62ch' }}>{hint}</p>
      </Reveal>
    </div>
  )
  const afterChart = (
    <div className="layout-container">
      <div className="editorial-grid">
        <SourceNote>
          Epoch AI, „Notable AI Models“ ({data?.models?.length ?? 0} Modelle mit dokumentiertem Training-Compute, davon {pts.length} im dargestellten Zeitraum 2010 bis 2026), CC BY 4.0.
          Y-Achse logarithmisch: jede Stufe ist das Tausendfache, der Anstieg ist real, nicht perspektivisch verzerrt.
        </SourceNote>
        <Reveal className="text-column">
          <p className="t-display-s" style={{ color: PAL.muted, marginTop: 'var(--s-16)', maxWidth: '44ch' }}>
            Doch Rechenleistung ist nur der Motor. Wohin sie läuft, bestimmt die <span style={{ color: PAL.text }}>Forschung</span>, und die ist ebenso rasant gewachsen.
          </p>
        </Reveal>
        {srTable}
      </div>
    </div>
  )

  // ---- Reduced-Motion: statische Vollansicht, kein erzwungenes Scrollen ----
  if (reduce) {
    return (
      <section id="compute" aria-label="Die Explosion der Rechenleistung" className="act" style={{ background: SCENE_BG }}>
        <div className="layout-container">
          <div className="editorial-grid">
            {header(<>Jeder Punkt ist ein KI-Modell, seine Höhe das Rechenbudget seines Trainings, logarithmisch. Die <span style={{ color: PAL.machine }}>Front</span> folgt dem jeweils größten Lauf der Geschichte; die Ringe markieren Meilensteine.</>)}
            <div className="viz" ref={vizRef} style={{ gridColumn: '1 / -1', position: 'relative' }}>
              <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Training-Compute der KI-Modelle in FLOP (logarithmisch) über die Jahre, mit Meilensteinen." onPointerDown={onSvgPointerDown} onClick={onSvgClick}>
                <defs>{areaDefs}</defs>
                {axes}
                <path d={areaPath} fill="url(#ce-area)" pointerEvents="none" />
                <Dots pts={pts} x={x} y={y} op={DOT_OPACITY} withCore onTip={onTip} r={compact ? DOT_R_COMPACT : DOT_R} />
                <path d={frontierPath} fill="none" stroke={PAL.machine} strokeWidth={FRONTIER_GLOW_W} strokeOpacity={FRONTIER_GLOW_A} strokeLinecap="round" strokeLinejoin="round" pointerEvents="none" />
                <path d={frontierPath} fill="none" stroke={PAL.machine} strokeWidth={FRONTIER_W} strokeLinecap="round" strokeLinejoin="round" pointerEvents="none" />
                {milestones.map((ms) => {
                  // Telefon: drei Zeilen nur mit Namen (das Jahr liest man an der x-Achse ab).
                  const rowY = compact ? 14 + ms.row * 18 : (ms.row === 0 ? 38 : 76)
                  return (
                    <g key={ms.key} pointerEvents="none">
                      <line x1={ms.lx} y1={rowY + (compact ? 4 : 8)} x2={ms.px} y2={ms.py - 6} stroke={PAL.machine} strokeWidth="1" opacity="0.4" />
                      <circle cx={ms.px} cy={ms.py} r={MS_RING_R} fill="none" stroke={PAL.machine} strokeWidth={MS_RING_W} />
                      <text x={ms.lx} y={rowY} textAnchor="middle" className="t-data" fill={PAL.text}>{ms.label}</text>
                      {!compact && <text x={ms.lx} y={rowY + 15} textAnchor="middle" className="t-data" fill={PAL.muted}>{Math.floor(ms.year)}</text>}
                    </g>
                  )
                })}
              </svg>
              {tipEl}
              {heatLegend}
            </div>
          </div>
        </div>
        {afterChart}
      </section>
    )
  }

  // ---- Scrollytelling-Modus ----
  const scrollyHint = <>Jeder Punkt ein KI-Modell, seine Höhe das Rechenbudget seines Trainings, logarithmisch.<span style={{ color: PAL.machine }}> Scrolle</span>, und die <span style={{ color: PAL.machine }}>Front</span> folgt dem jeweils größten Lauf der Geschichte, Meilenstein für Meilenstein.</>
  return (
    <section id="compute" aria-label="Die Explosion der Rechenleistung" style={{ background: SCENE_BG }}>
      {/* Telefon: der Erklaertext steht VOR der Buehne. In der 100svh-Buehne war er hoeher als
          der Bildschirm und schob Kicker und Legende aus dem Bild (gemessen bei 375 x 667). */}
      {compact && (
        <div className="layout-container" style={{ paddingTop: 'var(--s-10)' }}>
          <div className="editorial-grid">{header(scrollyHint)}</div>
        </div>
      )}
      <div ref={containerRef} style={{ position: 'relative', height: `${CONTAINER_VH}vh` }}>
        <div className="sticky-stage">
          <div className="layout-container" style={{ width: '100%' }}>
            <div className="editorial-grid">
              {!compact && header(scrollyHint)}
              <div className="viz" ref={vizRef} style={{ gridColumn: '1 / -1', position: 'relative' }}>
                <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Training-Compute der KI-Modelle in FLOP (logarithmisch) über die Jahre. Beim Scrollen waechst die Frontier-Linie und Meilensteine erscheinen." onPointerDown={onSvgPointerDown} onClick={onSvgClick}>
                  <defs>
                    {areaDefs}
                    {/* Ignite-Clip: zuendet Flaeche + hellen Dot-Layer exakt hinter der wachsenden Frontier. */}
                    <clipPath id="ce-ignite"><rect ref={clipRef} x={PAD_L} y={0} width={0} height={H} /></clipPath>
                  </defs>
                  {axes}
                  {/* Auch der ungezuendete Layer ist hoverbar: Tooltip-Zugriff haengt nicht vom Scroll-Stand ab */}
                  <Dots pts={pts} x={x} y={y} op={DOT_OPACITY_BG} onTip={onTip} r={compact ? DOT_R_COMPACT : DOT_R} />
                  <g clipPath="url(#ce-ignite)">
                    <path d={areaPath} fill="url(#ce-area)" pointerEvents="none" />
                    <Dots pts={pts} x={x} y={y} op={DOT_OPACITY} withCore onTip={onTip} r={compact ? DOT_R_COMPACT : DOT_R} />
                  </g>
                  <motion.path d={frontierPath} fill="none" stroke={PAL.machine} strokeWidth={FRONTIER_GLOW_W} strokeOpacity={FRONTIER_GLOW_A} strokeLinecap="round" strokeLinejoin="round" pointerEvents="none" style={{ pathLength: drawnLength }} />
                  <motion.path d={frontierPath} fill="none" stroke={PAL.machine} strokeWidth={FRONTIER_W} strokeLinecap="round" strokeLinejoin="round" pointerEvents="none" style={{ pathLength: drawnLength }} />
                  {milestones.map((ms) => <Milestone key={ms.key} progress={scrollYProgress} reveal={reveals[ms.key] ?? 1} ms={ms} geo={geo} />)}
                </svg>
                {tipEl}
                {heatLegend}
                {compact && (
                  <div className="ce-story-slot">
                    {milestones.map((ms) => <MilestoneCard key={ms.key} progress={scrollYProgress} reveal={reveals[ms.key] ?? 1} ms={ms} />)}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
      {afterChart}
    </section>
  )
}
