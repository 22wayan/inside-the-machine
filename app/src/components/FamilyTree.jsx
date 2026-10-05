import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useReducedMotion } from 'motion/react'
import { zoom, zoomIdentity } from 'd3-zoom'
import { select } from 'd3-selection'
import { quadtree } from 'd3-quadtree'
import { PAL, REL_COLOR, STAR, SCENE_BG } from '../theme'
import { Reveal, SourceNote } from './Motion'

// Fokussierbare Elemente der Fokus-Falle des Explorers (identisch zu ledger/ReadingDesk.jsx).
const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

// Leitet eine Alpha-Variante aus einem Hex-Token ab, statt eine neue Farbe hart zu codieren.
const hexA = (hex, a) => {
  const h = hex.replace('#', '')
  const f = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const r = parseInt(f.slice(0, 2), 16)
  const g = parseInt(f.slice(2, 4), 16)
  const b = parseInt(f.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${a})`
}

// Akt 3, "Galaxie der Modelle". ~160 Basismodelle als Sonnen, jede umgeben von einem Schwarm echter
// Kindmodelle (Farbe = Vermehrungsart, Helligkeit = Alter UND Downloads, Groesse = Downloads).
// Frei zoom-/panbar.
// Phase 7.5 (True Cosmos): kosmische Palette; Swirl (Spiral-Arme statt Raster); Nebula-Glows;
// Smart-Labeling; Solar-System-HUD beim Hover.
// Phase 7.6 (Cinematic Expanse): Dekompression (Systeme auseinanderziehen + optischer Cluster == Familie);
// strikte Familie-Zuordnung (originale Koordinaten + Max-Orbit-Kappung gegen Bleed); Label-Kontrast
// (dunkle Pills / dicker Stroke); sanfte Ambient-Animation (globale Rotation + atmende Nebula).

const W = 1320
const H = 820
const PAD = 70
const CX = W / 2
const CY = H / 2
const HW = (W - 2 * PAD) / 2 // Halbachse X der Layout-Ellipse (Morphing-Stufe, vor dem Spread)
const HH = (H - 2 * PAD) / 2 // Halbachse Y der Layout-Ellipse
const HUB_R_SCALE = 1.8 // Phase 7.13: groessere, maechtige Sonnen (nicht zu gross)
const CHILD_R_SCALE = 1.6 // praegnantere Kindersterne
const REL_LABEL = { finetune: 'Finetune', adapter: 'Adapter', quantized: 'Quantisierung', merge: 'Merge' }
// Kategorie-Farben der Vermehrungsart kommen aus theme.js REL_COLOR (EINE Quelle fuer Canvas-Sprites,
// HUD und Legende). Magenta (PAL.machine) ist dort fuer Maschine/Selektion reserviert, deshalb traegt
// die Quantisierung Violett - die lokale Zweitdefinition, die das frueher hier ueberschrieben hat, ist weg.
const baseX = (v) => PAD + (v / 1000) * (W - 2 * PAD)
const baseY = (v) => PAD + (v / 1000) * (H - 2 * PAD)
const hubR = (c) => HUB_R_SCALE * Math.max(4.5, Math.min(30, 4 + Math.sqrt(c) * 0.16))
const childR = (dl) => CHILD_R_SCALE * Math.max(0.9, Math.min(4.2, 0.9 + Math.sqrt(dl) / 260))
const ageLabel = (a) => (a < 0 ? 'unbekannt' : `${2020 + Math.floor(a / 12)}-${String((a % 12) + 1).padStart(2, '0')}`)
// Swirl: Polar-Transformation der Basis-Koordinaten, Drehung waechst mit dem Radius -> Spiral-Arme.
const swirl = (bx, by, s) => {
  const dx = bx - CX, dy = by - CY, r = Math.hypot(dx, dy), th = Math.atan2(dy, dx) + r * s
  return [CX + r * Math.cos(th), CY + r * Math.sin(th)]
}
// Deterministischer Pseudo-Zufall (mulberry32-Schritt): gleicher Seed -> identisches Layout (reproduzierbar).
const seeded = (n) => {
  let t = (n + 0x6d2b79f5) | 0
  t = Math.imul(t ^ (t >>> 15), 1 | t)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
// (Label-Auswahl rein nach Downloads sortiert -> kein Familien-Diversity-Filter mehr noetig.)

// ---- Canvas-Tuning ----
const BLEND_MODE = 'lighter' // Phase 7.15: additives Blending fuer Stardust -> Licht summiert sich in dichten Wolken
const HUB_ALPHA_FLOOR = 0.45
const LOD_HUBS = [[2, 25], [5, 58], [12, 96], [Infinity, 130]] // Mehr priorisierte Hub-Labels, kollisionsfrei gesetzt.
const EDGE_FADE_START = 1.6 // in Zoom-Verhaeltnis zr (k / Fit-Zoom): ab hier blendet feine Lineage ein
const EDGE_FADE_FULL = 5.0
const EDGE_LINEAGE_ALPHA = 0.18
const EDGE_MERGE_MIN = 0.6 // Verifizierte Merge-Brücken (nur 3) sollen klar auffindbar sein, nicht bloß angedeutet.
const EDGE_MERGE_MAX = 0.82
const HOVER_RADIUS_PX = 14
const HOVER_RADIUS_MIN = 3 // Basis-px Mindesttoleranz beim Hover
const HOVER_RING = PAL.machine
const MERGE_BOW = 0.14 // Bogen der Merge-Kurven (Kontrollpunkt senkrecht zur Sehne)
const SPOTLIGHT_DIM = 0.025 // Deckkraft alles ausserhalb der fokussierten Familie beim Hover
const SWIRL_MAX_ANGLE = 0.8 // Phase 7.12: Swirl auf den Galaxie-Radius normiert (Aussenrand dreht ~46 Grad), groessen-unabhaengig
const MAX_GLOW_PX = 1800 // Deckel der Glow-Fuellgroesse (Perf bei tiefem Zoom)
const GLOW_MIN_C = 1200 // ab dieser Nachkommenzahl bekommt eine Sonne einen weichen Nebula-Glow
const GLOW_SCALE = 0.6 // Glow-Radius = Wolkenradius * GLOW_SCALE (tight am Kern, kein grauer Matsch)
const GLOW_ALPHA = 0.06 // Spitzen-Deckkraft des Glows (gedaempft gegen Ueberlappungs-Matsch)
const GLOW_COLOR = '#fff5e6' // warmweisses Sternen-Glimmen
const GLOW_RGB = '255,245,230' // = GLOW_COLOR als rgb, fuer allokationsarme rgba()-Stops im Frame-Loop
const VIGNETTE = `radial-gradient(ellipse 80% 82% at 50% 46%, transparent 0%, transparent 45%, ${PAL.bg} 100%)`
const EMPTY_SET = new Set()
// ---- Phase 7.10/7.12: Physics & Optics (grosse Systeme im offenen Raum) ----
const CLOUD_MIN = 60 // Mindest-Wolkenradius je Sonne (Koordinaten)
const CLOUD_SCALE = 18 // Wolkenradius waechst mit sqrt(Kinderzahl) -> maechtige Systeme
// ---- Download-Rang-Layout: Position kodiert Magnitude (Munzner, Marks & Channels). Zentrum = Spitzenreiter ----
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5)) // ~2.39996 rad: Phyllotaxis-Winkel (ueberlappungsfreie Sonnenblume)
const RANK_PAD = 260 // Schutzabstand pro System in der Flaechen-Akkumulation (strikt monotoner Rang-Radius, kein Cloud-Overlap)
const ZOOM_FADE_K_REL = 14 // Zoom-Verhaeltnis (k / Fit-Zoom), ab dem der Rand-Fade voll aufgehoben ist (Licht kehrt zurueck)
// ---- Phase 7.11/7.12: Isolation Protocol + Uncaged Universe (kein Re-Fit, riesiger Koordinatenraum) ----
const MAX_CHILD_RADIUS = 350 // harte Obergrenze des Wolkenradius je Sonne (Koordinaten) -> grosse, maechtige Galaxien
const CHILD_FALLOFF = 1.15 // Radius = R * t^FALLOFF (Power-Law): gleichmaessigere Verteilung nach aussen (weniger Kern-Gedraenge -> Punkte einzeln anklickbar)
const CORE_HOLE = 0.24 // Kern-Freiraum je Galaxie: innerste Kinder starten bei CORE_HOLE*Rsys statt auf dem Hub -> der Galaxie-Kern bleibt frei, die Punkte nah am Kern werden anklickbar
const EMPTY_SPACE_PADDING = 360 // Leerraum zwischen Systemen (Koordinaten); etwas reduziert -> benachbarte Arme kuessen sich
const REPULSE_ITERS = 18 // Iterationen der Kollisions-Vermeidung (Hubs werden gnadenlos in den Raum getrieben)
const VIEW_PAD = 30 // Rand der Gesamtuebersicht beim Kamera-Fit (Galaxie fuellt ~95% des Canvas)
const ZOOM_OUT_FACTOR = 0.4 // erlaubtes Rauszoomen unter den Fit-Zoom (Galaxie kleiner im Bild)
const ZOOM_IN_FACTOR = 170 // erlaubtes Reinzoomen ueber den Fit-Zoom (tief in ein System)
const MAX_ORBIT_RADIUS = 110 // Basis-px: weiter weg = Waise (keiner Familie zugeordnet, leuchtet im Spotlight nie mit)
const ROT_SPEED = 0.00005 // rad/ms globale Galaxie-Rotation (~2.9 Grad/s, majestaetisch langsam; pausiert beim Hover)
const PULSE_SPEED = 0.001 // rad/ms fuer das Nebula-"Atmen" (Periode ~6.3s)
const PULSE_AMP = 0.18 // Amplitude des Glow-Atmens (Alpha-Faktor 0.82..1.18)
const PILL_H = 18 // Hoehe der dunklen Label-Pill (Hub-Labels)
const PILL_PADX = 7 // horizontales Padding der Pill
// ---- Radialer Alpha-Falloff am Galaxie-Rand (edgeFade) ----
const FADE_START = 0.52 // ab dieser normierten Distanz beginnt der Alpha-Falloff
const FADE_FLOOR = 0.15 // Rest-Alpha am Rand angehoben -> Randsterne verschwinden nicht ganz (heller)

// ---- Phase 7.15: Hubble Space Telescope Overhaul (gluehende Spiralgalaxien statt Scatterplot) ----
// Sonnen: ausschliesslich weiche Radial-Gradienten (weiss-heisser Kern -> warmweisser Halo -> Nichts), keine harten Kreise.
// Gold ist EXKLUSIV den Merge-Kanten/-Knoten vorbehalten (Legende): die Sonnen-Glows bleiben neutral warmweiss.
const SUN_CORE_SCALE = 2.0 // Sicht-Radius des Sonnen-Glows = hubR * zk * SUN_CORE_SCALE (weicher Kern, verschluckt die Arme nicht)
// Stardust: weiche, additive Glow-Sprites; ueberlappende Dichte erzeugt leuchtende Gaswolken (kein Konfetti).
const STARDUST_DL_NORM = 1400 // Downloads-Normierung der Partikelgroesse
const STARDUST_SPOT = 0.55 // hoehere Deckkraft im Spotlight (fokussierte Galaxie klar lesbar)
// Chaos-Swirl: 2-3 klare Spiralarme je Galaxie (Arm-Quantisierung + Windung mit dem Radius + Winkel-Streuung).
const N_ARMS_BASE = 2 // Grundzahl der Spiralarme (manche Galaxien 3, per Seed)
const ARM_WIND = 4.0 // Windungsstaerke der Arme (Bogenmass ueber den Radius): klar getrennte Arme, kein Brei
const ARM_SCATTER = 0.22 // Winkel-Streuung -> Armdicke (straff: die Spirale bleibt klar lesbar, kein Streu-Wolke)
const THERMO_GAMMA = 0.62 // <1 schiebt mehr Sterne in kuehle Toene -> subtile Warm/Kalt-Tiefe INNERHALB der Sternfarbe (Weiss)
// Sternfarben-LUT (radial): finetune = "die echten Sterne" (Legende: Weiss). Kern warmweiss -> Arme kuehl blau-weiss.
// KEIN Gold mehr in der Masse (Gold ist Merge-reserviert) und kein dunkles Navy -> heller, legenden-treu (Ware/Brewer: Luminanz + Hue).
const THERMO_STOPS = [
  [0.0, [255, 248, 236]], // Kern: warmes Sternweiss
  [0.3, [236, 240, 250]], // neutrales Weiss
  [0.6, [206, 224, 255]], // blaeuliches Weiss
  [1.0, [170, 200, 250]], // Armrand: kuehles Blau-Weiss (weiterhin hell, kein Navy)
]
const THERMO_N = 32
const THERMO_RGB = Array.from({ length: THERMO_N }, (_, i) => {
  const t = i / (THERMO_N - 1)
  let a = THERMO_STOPS[0], b = THERMO_STOPS[THERMO_STOPS.length - 1]
  for (let s = 0; s < THERMO_STOPS.length - 1; s++) { if (t >= THERMO_STOPS[s][0] && t <= THERMO_STOPS[s + 1][0]) { a = THERMO_STOPS[s]; b = THERMO_STOPS[s + 1]; break } }
  const lt = (t - a[0]) / (b[0] - a[0] || 1)
  const r = Math.round(a[1][0] + (b[1][0] - a[1][0]) * lt)
  const g = Math.round(a[1][1] + (b[1][1] - a[1][1]) * lt)
  const bl = Math.round(a[1][2] + (b[1][2] - a[1][2]) * lt)
  return `${r},${g},${bl}`
})
const STARDUST_GLOW_ALPHA = 0.19 // Spitzen-Deckkraft eines Glow-Partikels angehoben -> Sterne insgesamt heller (additiv)
// ---- Lesbarkeit der KATEGORIALEN Farbe (Befund Abnahme 2026-07) ----
// Die Legende verspricht vier Vermehrungsarten, im Bild war praktisch nur Weiss (finetune, 72,4 %)
// zu sehen: Cyan und Violett gingen in der additiven Ueberlagerung der weissen Masse unter. Die
// Farbkodierung war damit deklariert, aber nicht dekodierbar (Ware: ein Kanal, der sich nicht
// trennen laesst, traegt keine Information).
// Gegenmassnahme ohne Eingriff in die Komposition: die drei SELTENEN Klassen bekommen mehr
// Deckkraft und einen etwas groesseren Glow - der Akzent wird sichtbar, die weisse Masse bleibt
// die Masse. Keine neue Farbe, keine Animation; Magenta bleibt Selektion, Gold bleibt Merge.
// Je Klasse dosiert: Violett (#a78bfa) ist der hellste und am wenigsten gesaettigte der drei
// Akzenttoene und geht in der weissen Masse am schnellsten unter, es braucht deshalb am meisten.
const ACCENT_BOOST = {
  adapter: { a: 2.4, s: 1.34 }, // Neon-Cyan
  quantized: { a: 3.2, s: 1.45 }, // Nebula-Violett
  merge: { a: 2.4, s: 1.34 }, // Supernova-Gold
}
// Hex -> "r,g,b" (fuer die getoenten Glow-Sprites der Akzent-Vermehrungsarten).
const rgbOf = (hex) => { const h = hex.replace('#', ''); const f = h.length === 3 ? h.split('').map((c) => c + c).join('') : h; return `${parseInt(f.slice(0, 2), 16)},${parseInt(f.slice(2, 4), 16)},${parseInt(f.slice(4, 6), 16)}` }
// Ein weiches, additives Glow-Sprite (Radial-Gradient -> transparent) pro Farbe; einmal vorgerendert, dann nur drawImage.
const makeGlowSprite = (rgb) => {
  const s = 32
  const c = document.createElement('canvas'); c.width = s; c.height = s
  const g = c.getContext('2d')
  const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2)
  grad.addColorStop(0, `rgba(${rgb},1)`)
  grad.addColorStop(0.35, `rgba(${rgb},0.32)`)
  grad.addColorStop(1, `rgba(${rgb},0)`)
  g.fillStyle = grad; g.fillRect(0, 0, s, s)
  return c
}
const SPRITE_BASE = 3.2 // px Basis-Durchmesser eines Stardust-Glows bei pzk=1
const SPRITE_DL = 4.5 // zusaetzlicher Durchmesser fuer stark geladene Modelle (downloadabhaengig)

// Squircle-/Ellipsen-Mapping (elliptical grid): zwingt die rechteckigen Basis-Koordinaten in eine Ellipse
// (Ecken nach innen), liefert zusaetzlich die normierte Ellipsen-Distanz [0..1] (0 = Kern, 1 = Rand) fuer Jitter + Fade.
function morphAndRadius(x, y) {
  const nx = (x - CX) / HW, ny = (y - CY) / HH
  const u = nx * Math.sqrt(Math.max(0, 1 - (ny * ny) / 2))
  const v = ny * Math.sqrt(Math.max(0, 1 - (nx * nx) / 2))
  return [CX + u * HW, CY + v * HH, Math.min(1, Math.hypot(u, v))]
}
// Radialer Alpha-Falloff: voll bis FADE_START, dann smoothstep hinunter auf FADE_FLOOR am Rand.
function edgeFade(rNorm) {
  const t = Math.max(0, Math.min(1, (rNorm - FADE_START) / (1 - FADE_START)))
  return 1 - t * t * (3 - 2 * t) * (1 - FADE_FLOOR)
}

function derive(name, rel) {
  const n = name.toLowerCase()
  let format = 'Vollmodell'
  let strength = 'volle Genauigkeit (unquantisiert)'
  if (/gguf|ggml/.test(n)) { format = 'GGUF'; strength = 'läuft lokal / auf CPU' }
  else if (/awq|gptq|int4|int8|4bit|8bit|\bbnb/.test(n)) { format = 'Quantisiert'; strength = 'schnelle, günstige Inferenz' }
  else if (/lora|peft|adapter/.test(n)) { format = 'LoRA / Adapter'; strength = 'leichtes Feintuning' }
  else if (/mlx/.test(n)) { format = 'MLX'; strength = 'optimiert für Apple-Silicon' }
  if (rel === 'merge') strength = 'aus mehreren Modellen verschmolzen'
  const size = (name.match(/(\d+(?:\.\d+)?)\s*[bB]\b/) || [])[1]
  return { format, strength, size: size ? `${size}B` : null }
}

export default function FamilyTree() {
  const [data, setData] = useState(null)
  const [hover, setHover] = useState(null)
  const [sel, setSel] = useState(null)
  const [open, setOpen] = useState(false)
  const [onScreen, setOnScreen] = useState(false)
  const reduce = useReducedMotion()
  const sectionRef = useRef(null)
  const canvasRef = useRef(null)
  const tfRef = useRef(zoomIdentity)
  const rafRef = useRef(0)
  const openRef = useRef(false)
  const zoomRef = useRef(null)
  const drawRef = useRef(() => {})
  const cursorOverRef = useRef(false) // Cursor ueber dem Canvas -> Rotation pausieren (kein Twitch beim Lesen)
  const rotPhaseRef = useRef(0) // akkumulierter Rotationswinkel (rad); delta-basiert -> kein Sprung nach Pause
  const pulsePhaseRef = useRef(0) // akkumulierte Atem-Phase (rad)
  const lastTRef = useRef(0)
  const animatingRef = useRef(false)
  const overlayRef = useRef(null) // der Explorer-Dialog: haelt den Startfokus und die Fokus-Falle
  const openBtnRef = useRef(null) // der ausloesende Knopf: bekommt den Fokus beim Schliessen zurueck
  const wasOpenRef = useRef(false)
  useEffect(() => { openRef.current = open }, [open])

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}data/familytree.json`).then((r) => r.json()).then(setData).catch((e) => console.error('familytree:', e))
  }, [])

  const amin = data?.ageRange?.[0] ?? 0
  const amax = data?.ageRange?.[1] ?? 1
  const bright = useCallback((a) => (a < 0 ? 0.2 : 0.32 + 0.68 * Math.max(0, Math.min(1, (a - amin) / (amax - amin || 1)))), [amin, amax])

  // Einmalige Vorberechnung (useMemo, kein Aufwand pro Frame):
  //  - Hub-Layout: Download-Rang-Radial (Frontier-Phyllotaxis) -> Kollisions-Repulsion. Zentrum = hoechste
  //    Download-Summe, nach aussen fallender Rang. Deterministisch (keine RNG), Schwaerme haengen an den Hubs.
  //  - Familie je Kind: naechster Hub auf den ORIGINAL-Grid-Koordinaten (codiert den Eltern-Hub);
  //    weiter als MAX_ORBIT_RADIUS -> Waise (childHub = -1, leuchtet im Spotlight nie mit).
  //  - Kind-Platzierung: die starren JSON-Offsets WEGWERFEN und neu als radiale Polar-Streuung (Vogel-
  //    Sonnenblume + Seed-Jitter) um den Hub setzen -> organische runde Sternenwolken statt schraeger Gitter.
  //  - Cosmic-Fade-Faktor je System (radial), Swirl (Spiral-Arme), Quadtree, Sonnen-Reihenfolge, HUD-Verteilung.
  const geom = useMemo(() => {
    if (!data) return null
    const hubs = data.hubs; const f = data.field; const n = f.x.length; const L = hubs.length
    // Original-Grid-Koordinaten NUR fuer die Familien-Zuordnung der Kinder (semantische Naehe zum Eltern-Hub);
    // die Anzeige-Position der Hubs (px/py) kommt weiter unten aus dem Download-Rang, NICHT aus dem Grid.
    const hox = new Float64Array(L); const hoy = new Float64Array(L)
    const px = new Float64Array(L); const py = new Float64Array(L)
    for (let j = 0; j < L; j++) { hox[j] = baseX(hubs[j].x); hoy[j] = baseY(hubs[j].y) }
    // Familien-Zuordnung (naechster Hub auf ORIGINAL-Grid -> Eltern-Hub) + Zaehlung -> harter Wolkenradius je Sonne.
    const childHub = new Int16Array(n)
    const cnt = new Int32Array(L)
    const hubDownloads = new Float64Array(L)
    const relCnt = Array.from({ length: L }, () => [0, 0, 0, 0])
    const maxOrbSq = MAX_ORBIT_RADIUS * MAX_ORBIT_RADIUS
    for (let i = 0; i < n; i++) {
      const ox = baseX(f.x[i]); const oy = baseY(f.y[i])
      let best = 0; let bd = Infinity
      for (let j = 0; j < L; j++) { const ddx = ox - hox[j]; const ddy = oy - hoy[j]; const d = ddx * ddx + ddy * ddy; if (d < bd) { bd = d; best = j } }
      if (bd > maxOrbSq) { childHub[i] = -1; continue }
      childHub[i] = best; cnt[best]++
      hubDownloads[best] += f.dl[i] || 0
      const ri = f.r[i]; if (ri >= 0 && ri < 4) relCnt[best][ri]++
    }
    const Rsys = new Float64Array(L)
    for (let j = 0; j < L; j++) Rsys[j] = Math.min(CLOUD_MIN + CLOUD_SCALE * Math.sqrt(cnt[j]), MAX_CHILD_RADIUS)
    // DOWNLOAD-RANG-LAYOUT: die Familie mit der hoechsten Download-Summe ihres Schwarms sitzt im Zentrum,
    // der Rang faellt konzentrisch nach aussen. Frontier-Phyllotaxis (Vogel-Sonnenblume): der Platzierungs-
    // radius = Wurzel der bisher akkumulierten System-Flaeche (grosse Wolken schieben den Rand weiter,
    // strikt monoton mit dem Rang), der Winkel = Goldener Winkel (gleichmaessige, ueberlappungsarme Streuung
    // ohne sichtbares Ringe-Gitter). Deterministisch, keine RNG. Die Schwaerme haengen unten an px/py und
    // wandern automatisch mit; Merge-Bruecken zeichnen sich einfach auf die neuen Positionen.
    const rankOrder = [...hubs.keys()].sort((a, b) => hubDownloads[b] - hubDownloads[a])
    let areaSum = 0
    for (let p = 0; p < L; p++) {
      const j = rankOrder[p]
      const r = Math.sqrt(areaSum / Math.PI) // Frontier-Radius der bisher platzierten Systeme (p=0 -> exakt Zentrum)
      const th = p * GOLDEN_ANGLE
      px[j] = CX + r * Math.cos(th); py[j] = CY + r * Math.sin(th)
      const foot = Rsys[j] + RANK_PAD // Systemflaeche inkl. Schutzabstand -> naechster Rang ausreichend weiter draussen
      areaSum += Math.PI * foot * foot
    }
    // ISOLATION: Kollisions-Vermeidung. Zwei Sonnen muessen IMMER weiter als (R_a + R_b + PADDING) auseinander
    // liegen -> jedes System bekommt eine garantierte Schutzzone aus leerem Raum (Abstossung in mehreren Iterationen).
    for (let it = 0; it < REPULSE_ITERS; it++) {
      for (let a = 0; a < L; a++) {
        for (let bb = a + 1; bb < L; bb++) {
          let dx = px[bb] - px[a], dy = py[bb] - py[a]
          let d = Math.hypot(dx, dy)
          const minD = Rsys[a] + Rsys[bb] + EMPTY_SPACE_PADDING
          if (d < minD) {
            if (d < 0.001) { dx = seeded(a * 131 + bb) - 0.5; dy = seeded(a * 131 + bb + 7) - 0.5; d = Math.hypot(dx, dy) || 1 }
            const push = (minD - d) / 2; const ux = dx / d, uy = dy / d
            px[a] -= ux * push; py[a] -= uy * push; px[bb] += ux * push; py[bb] += uy * push
          }
        }
      }
    }
    // KEIN Re-Fit (Phase 7.12): die Koordinaten bleiben riesig. Die Kamera (s.u.) rahmt die Galaxie stattdessen.
    const hbx = px; const hby = py; const glowR = Rsys // finale (riesige) Hub-Positionen + Wolken-/Glow-Radius
    // Galaxie-Radius: fuer den auf die Galaxie normierten Swirl + Cosmic-Fade (groessen-unabhaengig).
    let maxR = 1
    for (let j = 0; j < L; j++) { const r = Math.hypot(hbx[j] - CX, hby[j] - CY) + Rsys[j]; if (r > maxR) maxR = r }
    const swirlS = SWIRL_MAX_ANGLE / maxR
    const hubFade = new Float32Array(L)
    for (let j = 0; j < L; j++) hubFade[j] = edgeFade(Math.min(1, Math.hypot(hbx[j] - CX, hby[j] - CY) / maxR))
    // MICRO-KOMPRESSION: Kinder als radiale Polar-Streuung, stark zum Hub gestaucht (t^FALLOFF -> dichter Kern,
    // sparse Rand), Winkel = Vogel-Sonnenblume + Seed-Jitter, hart auf Rsys gedeckelt. Runde, isolierte Wolke.
    const childFade = new Float32Array(n)
    const childRad = new Float32Array(n) // normierte Distanz Kind->Hub (0 = Kern, 1 = Armrand) fuer die thermodynamische Farbe
    const ndx = new Float64Array(n); const ndy = new Float64Array(n)
    const seen = new Int32Array(L)
    for (let i = 0; i < n; i++) {
      const hb = childHub[i]
      if (hb < 0) { const [mx, my] = morphAndRadius(baseX(f.x[i]), baseY(f.y[i])); ndx[i] = mx; ndy[i] = my; childFade[i] = edgeFade(Math.min(1, Math.hypot(mx - CX, my - CY) / maxR)); childRad[i] = 1; continue }
      childFade[i] = hubFade[hb]
      const li = seen[hb]++; const c = cnt[hb] || 1
      // 2-3 klare Spiralarme: Arm-Quantisierung (li % arms) + Power-Law-Radius (dichter Kern) + Windung, die mit dem Radius dreht.
      const arms = N_ARMS_BASE + (seeded(hb * 7 + 3) > 0.62 ? 1 : 0)
      const rnorm = Math.pow((li + 0.5) / c, CHILD_FALLOFF)
      childRad[i] = rnorm
      const rho = Rsys[hb] * (CORE_HOLE + (1 - CORE_HOLE) * rnorm) * (0.9 + 0.2 * seeded(i * 2 + 51)) // Kern-Freiraum: kein Kind sitzt mehr auf dem Hub-Kern
      const armAngle = ((li % arms) / arms) * 6.283185
      const theta = armAngle + rnorm * ARM_WIND + (seeded(i * 2 + 52) - 0.5) * ARM_SCATTER
      ndx[i] = hbx[hb] + rho * Math.cos(theta); ndy[i] = hby[hb] + rho * Math.sin(theta)
    }
    const hx = new Float32Array(L); const hy = new Float32Array(L)
    for (let j = 0; j < L; j++) { const [a, b] = swirl(hbx[j], hby[j], swirlS); hx[j] = a; hy[j] = b }
    const cx = new Float32Array(n); const cy = new Float32Array(n)
    for (let i = 0; i < n; i++) { const [a, b] = swirl(ndx[i], ndy[i], swirlS); cx[i] = a; cy[i] = b }
    // MAKRO-STRECKUNG auf das Canvas-Seitenverhaeltnis: nur die HUB-Anteile strecken (die Wolken-Offsets bleiben
    // rund), damit die rundliche Galaxie den BREITEN Canvas wirklich fuellt statt seitlich viel Schwarz zu lassen.
    let aMinX = Infinity, aMaxX = -Infinity, aMinY = Infinity, aMaxY = -Infinity
    for (let j = 0; j < L; j++) { if (hx[j] < aMinX) aMinX = hx[j]; if (hx[j] > aMaxX) aMaxX = hx[j]; if (hy[j] < aMinY) aMinY = hy[j]; if (hy[j] > aMaxY) aMaxY = hy[j] }
    const aCX = (aMinX + aMaxX) / 2, aCY = (aMinY + aMaxY) / 2
    const aspG = (aMaxX - aMinX) / ((aMaxY - aMinY) || 1), aspC = W / H
    let stX = 1, stY = 1
    if (aspG < aspC) stX = aspC / aspG; else stY = aspG / aspC
    if (stX !== 1 || stY !== 1) {
      for (let i = 0; i < n; i++) { const hb = childHub[i]; if (hb < 0) { cx[i] = aCX + (cx[i] - aCX) * stX; cy[i] = aCY + (cy[i] - aCY) * stY; continue } const ohx = hx[hb], ohy = hy[hb]; cx[i] += (aCX + (ohx - aCX) * stX) - ohx; cy[i] += (aCY + (ohy - aCY) * stY) - ohy }
      for (let j = 0; j < L; j++) { hx[j] = aCX + (hx[j] - aCX) * stX; hy[j] = aCY + (hy[j] - aCY) * stY }
    }
    // KAMERA-FIT: Bounding-Box der gesamten (riesigen) Galaxie -> ein d3-Transform, der sie in den Viewport rahmt.
    let vMinX = Infinity, vMaxX = -Infinity, vMinY = Infinity, vMaxY = -Infinity
    for (let i = 0; i < n; i++) { const x = cx[i], y = cy[i]; if (x < vMinX) vMinX = x; if (x > vMaxX) vMaxX = x; if (y < vMinY) vMinY = y; if (y > vMaxY) vMaxY = y }
    for (let j = 0; j < L; j++) { const x = hx[j], y = hy[j]; if (x < vMinX) vMinX = x; if (x > vMaxX) vMaxX = x; if (y < vMinY) vMinY = y; if (y > vMaxY) vMaxY = y }
    const viewK = Math.min((W - 2 * VIEW_PAD) / (vMaxX - vMinX || 1), (H - 2 * VIEW_PAD) / (vMaxY - vMinY || 1))
    const bcx = (vMinX + vMaxX) / 2, bcy = (vMinY + vMaxY) / 2
    const view = zoomIdentity.translate(CX - bcx * viewK, CY - bcy * viewK).scale(viewK)
    // Quadtree nur ueber die Kinder; die ~160 Hubs werden in hit() linear UND priorisiert geprueft, damit
    // das Anvisieren einer Sonne zuverlaessig die Sonne (HUD) trifft, nicht ein gestauchtes Kind direkt daneben.
    const nodes = []
    for (let i = 0; i < n; i++) nodes.push({ x: cx[i], y: cy[i], hub: false, i })
    const qt = quadtree().x((d) => d.x).y((d) => d.y).addAll(nodes)
    const hubCountOrder = [...hubs.keys()].sort((a, b) => hubs[b].c - hubs[a].c)
    // Beschriftet werden die einflussreichsten Basismodelle: strikt nach der Download-Summe ihres
    // dargestellten Schwarms sortiert (nicht nach bloßer Ableitungszahl). Ueberlappende Labels
    // duennt der Zeichen-Loop kollisionsfrei aus -> das hoeher gerankte Modell gewinnt.
    const hubOrder = [...hubs.keys()].sort((a, b) => hubDownloads[b] - hubDownloads[a])
    const labelOrder = hubOrder
    const hubRelDist = relCnt.map((counts) => {
      const tot = counts.reduce((s, c) => s + c, 0) || 1
      return counts.map((c, ri) => ({ rel: data.rels[ri]?.rel, pct: Math.round(100 * c / tot) })).filter((x) => x.rel && x.pct > 0).sort((a, b) => b.pct - a.pct)
    })
    // Pro-Stern Helligkeit + Groesse EINMAL ableiten (kein Neuberechnen pro Frame; 38k Sterne).
    // Helligkeit = Alter (heller = neuer), zusaetzlich von Downloads angehoben -> einflussreiche Modelle stechen hervor.
    // Groesse = Downloads (sqrt-komprimiert). Im Frame-Loop fliessen beide nur noch multiplikativ ein.
    const aMin = data.ageRange?.[0] ?? 0, aMax = data.ageRange?.[1] ?? 1
    const ageBr = (a) => (a < 0 ? 0.2 : 0.32 + 0.68 * Math.max(0, Math.min(1, (a - aMin) / (aMax - aMin || 1))))
    const starBright = new Float32Array(n)
    const starSize = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      const inf = Math.min(1, Math.sqrt(f.dl[i] || 0) / STARDUST_DL_NORM)
      starBright[i] = ageBr(f.age[i]) * (0.66 + 1.15 * inf) // staerkere Download-Kopplung -> viel-geladene Modelle stechen deutlich heller hervor
      starSize[i] = SPRITE_BASE + SPRITE_DL * (0.5 * inf + 0.5 * inf * inf) // grosse Downloads zusaetzlich groesser (quadratischer Anteil) -> praegnanter
    }
    return { hx, hy, cx, cy, childHub, childFade, childRad, hubFade, glowR, qt, hubOrder, hubCountOrder, labelOrder, hubRelDist, starBright, starSize, view }
  }, [data])

  const bridgesByHub = useMemo(() => {
    const m = {}
    if (!data) return m
    for (const e of data.edges) {
      ;(m[e.s] || (m[e.s] = new Set())).add(e.t)
      ;(m[e.t] || (m[e.t] = new Set())).add(e.s)
    }
    return m
  }, [data])

  // Nur MERGE-Kanten: fuer die kontextuellen Merge-Labels beim Hover (Gold-Bruecken duerfen nicht ins Namenlose fuehren).
  const mergeByHub = useMemo(() => {
    const m = {}
    if (!data) return m
    for (const e of data.edges) {
      if (e.rel !== 'merge') continue
      ;(m[e.s] || (m[e.s] = new Set())).add(e.t)
      ;(m[e.t] || (m[e.t] = new Set())).add(e.s)
    }
    return m
  }, [data])

  // Glow-Sprites: 32 thermodynamische Toene (Finetune-Masse) + je ein Akzent-Ton (Adapter/Quantisierung/Merge).
  // Einmal vorgerendert; im Frame-Loop nur drawImage -> additive, weiche Stardust-Wolken statt harter Quadrate.
  const sprites = useMemo(() => ({
    thermo: THERMO_RGB.map(makeGlowSprite),
    adapter: makeGlowSprite(rgbOf(REL_COLOR.adapter)),
    quantized: makeGlowSprite(rgbOf(REL_COLOR.quantized)),
    merge: makeGlowSprite(rgbOf(REL_COLOR.merge)),
  }), [])

  const draw = useCallback(() => {
    const cv = canvasRef.current
    if (!cv || !data || !geom) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    if (cv.width !== W * dpr) { cv.width = W * dpr; cv.height = H * dpr }
    const ctx = cv.getContext('2d')
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, W, H)
    const tf = tfRef.current === zoomIdentity ? geom.view : tfRef.current; const k = tf.k // vor Kamera-Init direkt auf den Fit-Transform
    // Ambient: globale Rotation (um CX,CY) + atmende Glows. Werte aus akkumulierten Phasen-Refs.
    const angle = rotPhaseRef.current
    const ca = Math.cos(angle), sa = Math.sin(angle)
    const pulse = Math.sin(pulsePhaseRef.current)
    const breath = 1 + PULSE_AMP * pulse
    const glowRPulse = 1 + 0.05 * pulse
    // Projektion: erst globale Rotation um (CX,CY), dann d3-Zoom-Transform -> Screen.
    const sx = (x, y) => tf.applyX(CX + (x - CX) * ca - (y - CY) * sa)
    const sy = (x, y) => tf.applyY(CY + (x - CX) * sa + (y - CY) * ca)
    const vis = (x, y, r) => x > -r && x < W + r && y > -r && y < H + r
    const f = data.field; const rels = data.rels
    const fitK = geom.view.k; const zr = k / fitK // Zoom-Verhaeltnis: 1 = Gesamtuebersicht (Kamera-Fit), >1 = reingezoomt
    const zk = Math.min(2.6, Math.max(0.7, 0.55 + zr * 0.14)) // Punktgroesse waechst mit dem relativen Zoom
    const pzk = Math.min(3, Math.max(0.85, 0.7 + zr * 0.06)) // Stardust: winzige Partikel, sanftes Wachstum mit dem Zoom
    const fade = Math.max(0, Math.min(1, (zr - EDGE_FADE_START) / (EDGE_FADE_FULL - EDGE_FADE_START || 1)))
    // Dynamic Zoom Fade: bei zr=1 voller Rand-Fade, ab zr>=ZOOM_FADE_K_REL stufenlos auf volle Helligkeit (Licht kehrt zurueck).
    const fadeRelief = Math.max(0, Math.min(1, (zr - 1) / (ZOOM_FADE_K_REL - 1)))
    const { hx, hy, cx, cy, childHub, childFade, childRad, hubFade, glowR, hubOrder, hubCountOrder, labelOrder, starBright, starSize } = geom
    const hn = hover?.node; const spot = !!hn
    // Fokus-Hub: bei Hub-Hover der Hub selbst, bei Kind-Hover dessen Familie; bei Waisen-Hover -2 (matcht nichts).
    const focalHub = spot ? (hn.hub ? hn.i : (childHub[hn.i] >= 0 ? childHub[hn.i] : -2)) : -1
    const bridged = (spot && focalHub >= 0 && bridgesByHub[focalHub]) || EMPTY_SET

    // 1. Kanten: Lineage faint (zoom), Merge als weiche Bezier-Boegen. Spotlight dimmt nicht-fokale Kanten.
    for (const e of data.edges) {
      const merge = e.rel === 'merge'
      const touch = spot && (e.s === focalHub || e.t === focalHub)
      if (spot) { if (!touch && !merge) continue } else if (!merge && fade <= 0.01) continue
      const ax = sx(hx[e.s], hy[e.s]), ay = sy(hx[e.s], hy[e.s]), bx = sx(hx[e.t], hy[e.t]), by = sy(hx[e.t], hy[e.t])
      if (!vis(ax, ay, 0) && !vis(bx, by, 0)) continue
      let alpha
      if (merge) { const base = EDGE_MERGE_MIN + (EDGE_MERGE_MAX - EDGE_MERGE_MIN) * fade; alpha = spot ? (touch ? EDGE_MERGE_MAX : base * 0.18) : base * (0.88 + 0.12 * breath) }
      else { alpha = spot ? (touch ? EDGE_LINEAGE_ALPHA : SPOTLIGHT_DIM) : EDGE_LINEAGE_ALPHA * fade }
      if (merge) {
        // Dunkle Unterlinie trennt jede goldene Brücke vom dichten Sternenfeld.
        ctx.strokeStyle = hexA(PAL.bg, Math.min(0.92, alpha + 0.18)); ctx.lineWidth = 4.2
        ctx.beginPath(); ctx.moveTo(ax, ay)
        const mx = (ax + bx) / 2, my = (ay + by) / 2, dx = bx - ax, dy = by - ay
        ctx.quadraticCurveTo(mx - dy * MERGE_BOW, my + dx * MERGE_BOW, bx, by); ctx.stroke()
      }
      ctx.strokeStyle = merge ? hexA(PAL.merge, alpha) : hexA(PAL.ink, alpha)
      // Merge-Bruecken: Liniendicke = Beleg-Staerke (sup = Zahl unabhaengiger Merge-Kinder, min. 2)
      ctx.lineWidth = merge ? 1.4 + Math.min(1.8, Math.log2(e.sup || 2) * 0.5) : 0.7
      ctx.beginPath(); ctx.moveTo(ax, ay)
      if (merge) { const mx = (ax + bx) / 2, my = (ay + by) / 2, dx = bx - ax, dy = by - ay; ctx.quadraticCurveTo(mx - dy * MERGE_BOW, my + dx * MERGE_BOW, bx, by) }
      else ctx.lineTo(bx, by)
      ctx.stroke()
    }

    // Konstellations-Linien: beim Hover wird nur die eigene Familie lesbar verbunden.
    // Eine kleine, gleichmäßig verteilte Stichprobe statt aller Kinder hält das Bild ruhig.
    if (spot && focalHub >= 0) {
      const hx0 = sx(hx[focalHub], hy[focalHub]), hy0 = sy(hx[focalHub], hy[focalHub])
      const family = []
      for (let i = 0; i < childHub.length; i++) if (childHub[i] === focalHub) family.push(i)
      const step = Math.max(1, Math.ceil(family.length / 26))
      ctx.strokeStyle = hexA(PAL.human, 0.22); ctx.lineWidth = 0.65
      for (let q = 0; q < family.length; q += step) {
        const i = family[q]; const x = sx(cx[i], cy[i]), y = sy(cx[i], cy[i])
        if (!vis(x, y, 0)) continue
        ctx.beginPath(); ctx.moveTo(hx0, hy0); ctx.lineTo(x, y); ctx.stroke()
      }
    }

    // 2. Nebula-Glows: weiche radiale Halos um grosse Sonnen (atmend), additiv.
    ctx.globalCompositeOperation = 'lighter'
    for (let oi = 0; oi < hubCountOrder.length; oi++) {
      const j = hubCountOrder[oi]; const h = data.hubs[j]
      if (h.c < GLOW_MIN_C) break // hubCountOrder ist absteigend nach Nachkommen sortiert
      if (spot && j !== focalHub && !bridged.has(j)) continue
      const x = sx(hx[j], hy[j]), y = sy(hx[j], hy[j]); const gr = Math.min(MAX_GLOW_PX, glowR[j] * k * GLOW_SCALE * glowRPulse)
      if (!gr || !vis(x, y, gr)) continue
      const grad = ctx.createRadialGradient(x, y, 0, x, y, gr)
      const ga = GLOW_ALPHA * breath * (spot && j !== focalHub ? 0.3 : 1) * (spot ? 1 : hubFade[j] + (1 - hubFade[j]) * fadeRelief)
      grad.addColorStop(0, `rgba(${GLOW_RGB},${ga})`); grad.addColorStop(1, `rgba(${GLOW_RGB},0)`)
      ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(x, y, gr, 0, 6.283); ctx.fill()
    }

    // 3. Stardust (additives Blending): weiche Glow-Sprites; Rotation inline (heisser 38k-Loop).
    //    Farbe thermodynamisch (Kern warmweiss, Arme kuehl blau-weiss, KEIN Gold); Adapter/Quantisierung als Neon-Akzente.
    //    Erst die Dichte ueberlappender Glows erzeugt leuchtende Gaswolken statt hartem Konfetti. Spotlight isoliert die Familie.
    ctx.globalCompositeOperation = BLEND_MODE
    const { thermo: spThermo, adapter: spAdapter, quantized: spQuant, merge: spMerge } = sprites
    const dustAmb = STARDUST_GLOW_ALPHA * Math.min(3.2, 1 + zr * 0.12) // bei tiefem Zoom weniger Ueberlappung -> jeder Glow heller
    for (let i = 0; i < f.x.length; i++) {
      const ux = cx[i] - CX, uy = cy[i] - CY
      const x = tf.applyX(CX + ux * ca - uy * sa)
      const y = tf.applyY(CY + ux * sa + uy * ca)
      if (!vis(x, y, 12)) continue
      const fam = childHub[i] === focalHub || (hn && !hn.hub && hn.i === i)
      ctx.globalAlpha = spot
        ? (fam ? STARDUST_SPOT * Math.max(0.5, starBright[i]) : SPOTLIGHT_DIM * STARDUST_GLOW_ALPHA)
        : dustAmb * starBright[i] * (childFade[i] + (1 - childFade[i]) * fadeRelief)
      const rel = rels[f.r[i]].rel
      const boost = ACCENT_BOOST[rel]
      if (boost) ctx.globalAlpha = Math.min(1, ctx.globalAlpha * boost.a)
      const sprite = rel === 'finetune' ? spThermo[Math.min(THERMO_N - 1, (Math.pow(childRad[i], THERMO_GAMMA) * THERMO_N) | 0)]
        : rel === 'adapter' ? spAdapter : rel === 'quantized' ? spQuant : spMerge
      // Downloads-Groesse einmal in geom abgeleitet; hier Zoom-Skalierung + Akzent-Aufschlag
      const sz = starSize[i] * pzk * (boost ? boost.s : 1)
      ctx.drawImage(sprite, x - sz * 0.5, y - sz * 0.5, sz, sz)
    }
    // 4. Sonnen: ausschliesslich weiche Radial-Gradienten (weiss-heisser Kern -> warmweisser Halo -> Nichts), additiv.
    //    Keine harten Kreise (arc+fill als Vollflaeche) mehr -> keine Ping-Pong-Baelle. Aktiv/selektiert -> Magenta-Kern.
    ctx.globalCompositeOperation = 'lighter'
    for (let j = 0; j < data.hubs.length; j++) {
      const h = data.hubs[j]; const x = sx(hx[j], hy[j]), y = sy(hx[j], hy[j])
      const gr = hubR(h.c) * zk * SUN_CORE_SCALE
      if (!vis(x, y, gr)) continue
      let a = Math.max(HUB_ALPHA_FLOOR, bright(h.age))
      if (spot) a = j === focalHub ? Math.max(0.9, a) : (bridged.has(j) ? Math.max(0.4, a * 0.7) : SPOTLIGHT_DIM)
      else a *= hubFade[j] + (1 - hubFade[j]) * fadeRelief // Cosmic Fade am Rand, vom Zoom stufenlos aufgehoben
      ctx.globalAlpha = a
      const grad = ctx.createRadialGradient(x, y, 0, x, y, gr)
      grad.addColorStop(0, 'rgba(255,255,255,1)') // gleissend weiss-heisser Kern
      grad.addColorStop(0.2, 'rgba(255,245,230,0.72)'); grad.addColorStop(1, 'rgba(0,0,0,0)') // immer neutraler warmweisser Halo; die Auswahl markiert NUR ein enger Gold-Ring (kein grosser farbiger Kreis, der Zentrums-Nachbarn ueberlagert)
      ctx.fillStyle = grad
      ctx.beginPath(); ctx.arc(x, y, gr, 0, 6.283); ctx.fill()
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'

    // 5. Smart-Labels: NUR Hub-Sonnen (Diversity-gefiltert), mit dunkler Pill. KEINE statischen Kinder-Labels mehr.
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round'
    const nLab = (LOD_HUBS.find(([lim]) => zr < lim) || [0, 130])[1]
    ctx.font = '600 13px "IBM Plex Mono", monospace'
    const placed = [] // bereits gezeichnete Label-Boxen -> Kollisions-Vermeidung (Decluttering)
    // Spotlight: NUR fokaler Hub + seine MERGE-verbundenen Hubs (Kontext der Gold-Bruecken, egal welcher Rang).
    // Ambient: die Top-N nach Diversity.
    const labelList = spot ? (focalHub >= 0 ? [focalHub, ...(mergeByHub[focalHub] || [])] : []) : labelOrder
    const labelMax = spot ? labelList.length : nLab
    for (let oi = 0; oi < labelMax && oi < labelList.length; oi++) {
      const j = labelList[oi]
      const h = data.hubs[j]; const x = sx(hx[j], hy[j]), y = sy(hx[j], hy[j]); const r = hubR(h.c) * zk
      if (!vis(x, y, 60)) continue
      const ty = y - r - 11
      const tw = ctx.measureText(h.label).width
      const lx0 = x - tw / 2 - PILL_PADX, lx1 = x + tw / 2 + PILL_PADX, ly0 = ty - PILL_H / 2, ly1 = ty + PILL_H / 2
      let clash = false
      for (let p = 0; p < placed.length; p++) { const bx = placed[p]; if (lx0 < bx[2] && lx1 > bx[0] && ly0 < bx[3] && ly1 > bx[1]) { clash = true; break } }
      if (clash) continue // ueberlappendes Label weglassen; das hoeher priorisierte (zuerst gezeichnete) gewinnt
      placed.push([lx0 - 4, ly0 - 4, lx1 + 4, ly1 + 4]) // kleine Marge -> Labels kleben nicht aneinander
      ctx.fillStyle = hexA(PAL.bg, 0.92)
      if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(lx0, ly0, lx1 - lx0, PILL_H, 6); ctx.fill() } else ctx.fillRect(lx0, ly0, lx1 - lx0, PILL_H)
      ctx.fillStyle = PAL.ink; ctx.fillText(h.label, x, ty)
    }
    // Phase 7.7: KEINE statischen Kinder-Labels und KEIN Kind-Canvas-Label beim Hover mehr (kein Deep-Zoom-Matsch).
    // Der vollstaendige Kindname erscheint ausschliesslich im HTML-HUD am Cursor (s. unten), nur beim Hover.
    ctx.textBaseline = 'alphabetic'

    // 6. Highlight-Ringe: Auswahl + Hover als DUENNER, nicht-verdeckender Umriss (nur Stroke, transparenter Kern).
    //    Etwas groesserer Radius (gap) + duenne Linie -> im dichten Zentrum bleiben die darunter/daneben
    //    liegenden Sterne sichtbar, statt von einer gefuellten Scheibe ueberdeckt zu werden. Magenta = Auswahl.
    const ringFor = (nd) => {
      const ox = nd.hub ? hx[nd.i] : cx[nd.i]; const oy = nd.hub ? hy[nd.i] : cy[nd.i]
      return { x: sx(ox, oy), y: sy(ox, oy), r: nd.hub ? hubR(data.hubs[nd.i].c) * zk : childR(f.dl[nd.i]) * zk }
    }
    const ringList = []
    if (sel) ringList.push([sel, '#ffd700', 1.8])
    if (hn && !(sel && hn.hub === sel.hub && hn.i === sel.i)) ringList.push([hn, HOVER_RING, 1]) // kein doppelter Ring, wenn dieselbe Sonne zugleich gehovert + ausgewaehlt ist
    for (const [nd, col, lw] of ringList) {
      const p = ringFor(nd)
      const rr = Math.min(p.r, nd.hub ? 12 : 8) + 3 // enger Marker, entkoppelt von der grossen Glow-/Hub-Groesse -> ueberdeckt die dichten Zentrums-Nachbarn nicht mehr
      if (!vis(p.x, p.y, rr + 4)) continue
      ctx.strokeStyle = col; ctx.lineWidth = lw
      ctx.beginPath(); ctx.arc(p.x, p.y, rr, 0, 6.283); ctx.stroke()
    }
  }, [data, geom, bright, hover, sel, bridgesByHub, mergeByHub, sprites])

  useEffect(() => { drawRef.current = draw }, [draw])
  const requestDraw = useCallback(() => {
    if (animatingRef.current || rafRef.current) return // waehrend der Ambient-Loop laeuft, zeichnet diese; kein Doppel-Draw
    rafRef.current = requestAnimationFrame(() => { rafRef.current = 0; drawRef.current() })
  }, [])
  // Unmount: einen von requestDraw gehaltenen Frame sicher canceln (kein Draw auf totem Component).
  useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); rafRef.current = 0 }, [])

  // Sichtbarkeit: Ambient-Animation nur laufen lassen, wenn der Canvas selbst nennenswert im Bild ist
  // (Canvas, nicht die ganze Sektion -> kein 60fps-Redraw, wenn nur ein Rand-Sliver der Sektion sichtbar ist).
  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    const io = new IntersectionObserver(([entry]) => setOnScreen(entry.isIntersecting), { threshold: 0.12 })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  // Ambient-Loop: kontinuierlicher rAF mit delta-akkumulierten Phasen (kein Sprung nach Pause/Tab-Wechsel).
  // Rotation pausiert beim Hover (fokussiertes System bleibt unter dem Cursor). Aus bei reduced-motion / off-screen.
  const animate = !reduce && (onScreen || open)
  useEffect(() => {
    if (!animate) {
      animatingRef.current = false
      if (reduce) { rotPhaseRef.current = 0; pulsePhaseRef.current = 0 } // reduced-motion: definierter, voellig ruhiger Grundzustand
      drawRef.current()
      return
    }
    animatingRef.current = true
    let raf = 0
    lastTRef.current = 0
    const tick = (t) => {
      const last = lastTRef.current || t
      const dt = Math.min(50, t - last) // Delta kappen, damit es nach Pause nicht springt
      lastTRef.current = t
      if (!cursorOverRef.current) rotPhaseRef.current += dt * ROT_SPEED // Rotation pausiert, solange der Cursor ueber dem Canvas ist
      pulsePhaseRef.current += dt * PULSE_SPEED
      drawRef.current()
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => { cancelAnimationFrame(raf); animatingRef.current = false }
  }, [animate, reduce])

  useEffect(() => { requestDraw() }, [data, hover, sel, open, requestDraw])

  useEffect(() => {
    if (!data || !geom) return
    const cv = canvasRef.current
    if (!cv) return
    const k0 = geom.view.k // Fit-Zoom; Extent relativ -> weit genug raus fuer die Gesamtuebersicht, tief genug rein
    const z = zoom().scaleExtent([k0 * ZOOM_OUT_FACTOR, k0 * ZOOM_IN_FACTOR]).filter((e) => openRef.current && !e.button)
      .on('zoom', (e) => { tfRef.current = e.transform; requestDraw() })
    const s = select(cv)
    s.call(z)
    zoomRef.current = z
    return () => { s.on('.zoom', null) }
  }, [data, geom, requestDraw])

  // Overview + Explorer-Start: Kamera auf den Fit-Transform setzen (rahmt die ganze riesige Galaxie).
  useEffect(() => {
    const cv = canvasRef.current
    if (!cv || !zoomRef.current || !geom || open) return
    tfRef.current = geom.view
    select(cv).call(zoomRef.current.transform, geom.view)
    requestDraw()
  }, [open, geom, requestDraw])

  // A11Y-FOKUSKETTE des Explorers (Vorbild: ledger/ReadingDesk.jsx). Vorher blieb
  // document.activeElement beim Oeffnen auf BODY und nach Escape ebenfalls - der Dialog war mit
  // der Tastatur weder betretbar noch verlassbar.
  const closeExplorer = useCallback(() => { setOpen(false); setSel(null) }, [])

  // Startfokus auf den Dialog selbst (nicht auf den Schliessen-Knopf): der Screenreader liest
  // zuerst das aria-label des Dialogs. Dazu die Fokus-Falle auf Tab und Shift+Tab.
  useEffect(() => {
    if (!open) return undefined
    const box = overlayRef.current
    box?.focus()
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); closeExplorer(); return }
      if (e.key !== 'Tab' || !box) return
      const items = [...box.querySelectorAll(FOCUSABLE)].filter((el) => !el.disabled)
      if (!items.length) { e.preventDefault(); return }
      const first = items[0]
      const last = items[items.length - 1]
      const at = document.activeElement
      // Der Dialogkasten selbst haelt den Startfokus und steht in keiner Richtung in der Liste.
      if (!items.includes(at)) { e.preventDefault(); (e.shiftKey ? last : first).focus(); return }
      if (e.shiftKey && at === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && at === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, closeExplorer])

  // Rueckgabe an den AUSLOESENDEN Knopf, egal ob per Escape oder per Schliessen-Knopf geschlossen
  // wurde. Erst im naechsten Frame, wenn der Knopf wieder im DOM steht.
  useEffect(() => {
    if (wasOpenRef.current && !open) requestAnimationFrame(() => openBtnRef.current?.focus())
    wasOpenRef.current = open
  }, [open])

  const hit = (e) => {
    const cv = canvasRef.current
    if (!cv || !geom || !data) return null
    const rect = cv.getBoundingClientRect()
    const cxp = (e.clientX - rect.left) * (W / rect.width)
    const cyp = (e.clientY - rect.top) * (H / rect.height)
    const [rx, ry] = tfRef.current.invert([cxp, cyp]) // Screen -> rotierte Swirl-Basis
    // globale Rotation invers herausrechnen (um CX,CY mit -angle), damit der Quadtree-Raum stimmt.
    const angle = rotPhaseRef.current
    const ca = Math.cos(-angle), sa = Math.sin(-angle)
    const dx = rx - CX, dy = ry - CY
    const bx = CX + dx * ca - dy * sa
    const by = CY + dx * sa + dy * ca
    const k = tfRef.current.k
    const zk = Math.min(2.4, Math.max(0.75, k * 0.5 + 0.5))
    const rBase = Math.max(HOVER_RADIUS_MIN, HOVER_RADIUS_PX / k)
    // Sonnen priorisiert: innerhalb ihres gerenderten Radius (in Basis-px) gewinnt die Sonne gegen gestauchte Kinder -> HUD trifft.
    const { hx, hy } = geom; const hubs = data.hubs
    let bj = -1; let bd = Infinity
    for (let j = 0; j < hubs.length; j++) {
      const ddx = bx - hx[j], ddy = by - hy[j]; const d = ddx * ddx + ddy * ddy
      const tol = Math.max(rBase, (hubR(hubs[j].c) * zk) / k)
      if (d <= tol * tol && d < bd) { bd = d; bj = j }
    }
    if (bj >= 0) return { hub: true, i: bj, x: hx[bj], y: hy[bj] }
    return geom.qt.find(bx, by, rBase) || null
  }
  const onMove = (e) => {
    const nd = hit(e)
    setHover(nd ? { node: nd, cx: e.clientX, cy: e.clientY } : null)
  }
  const onClick = (e) => {
    const nd = hit(e)
    if (nd) { setSel(nd); if (!open) setOpen(true) }
  }

  const profile = useMemo(() => {
    if (!sel || !data) return null
    if (sel.hub) { const h = data.hubs[sel.i]; return { hub: true, title: h.label, sub: h.org !== String.fromCharCode(8212) ? h.org : null, age: h.age, c: h.c, hfId: h.id } }
    const f = data.field; const i = sel.i; const rel = data.rels[f.r[i]].rel
    return { hub: false, title: f.name[i], age: f.age[i], dl: f.dl[i], lk: f.lk[i], task: f.task[i] >= 0 ? data.tasks[f.task[i]] : null, rel, hfId: f.fid ? f.fid[i] : null, ...derive(f.name[i], rel) }
  }, [sel, data])

  const facts = data?.facts
  const rels = data?.rels || []
  const hubs = data?.hubs || []
  const relColor = Object.fromEntries(rels.map((r) => [r.rel, REL_COLOR[r.rel]]))

  // Canvas + Deep-Space-Vignette als eine relative Zone.
  const canvasZone = (
    <div style={open ? { position: 'relative', flex: 1, minHeight: 0, width: '100%' } : { position: 'absolute', inset: 0 }}>
      <canvas ref={canvasRef}
        onPointerMove={onMove}
        onPointerEnter={() => { cursorOverRef.current = true }}
        onPointerLeave={() => { cursorOverRef.current = false; setHover(null) }}
        onClick={onClick}
        role="img" aria-label="Galaxie der Modellfamilien. Werte in der Tabelle darunter."
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block', cursor: hover?.node ? 'pointer' : (open ? 'grab' : 'default') }} />
      <div aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: VIGNETTE }} />
    </div>
  )

  // Solar-System-HUD beim Hub-Hover: Name, Nachkommen, Methodik-Dominanz.
  const hudRel = hover?.node?.hub && geom ? geom.hubRelDist[hover.node.i] : null

  return (
    <section ref={sectionRef} id="family" aria-label="Die Galaxie der Modelle" className="act" style={{ background: SCENE_BG }}>
      <div className="layout-container">
        <div className="editorial-grid">
          {/* Der grosse Titel lebt in der ActIntro-Herleitung (App.jsx); hier die Dekodier-Hilfe am Chart. */}
          <div className="text-column">
            <Reveal>
              <p className="kicker" style={{ marginBottom: 'var(--s-2)' }}>Akt 3 · Der Stammbaum</p>
              <p className="t-data" style={{ color: PAL.muted, margin: '0 0 var(--s-3)' }}>Daten: Netzwerk · 528.311 Kanten, kategorial (Vermehrungsart) + zeitlich (Alter) · Task: Topologie, Konzentration &amp; Erkundung</p>
            </Reveal>
            {data && (
              <Reveal delay={0.12}>
                <p className="t-body" style={{ color: PAL.muted, margin: '0 0 var(--s-8)' }}>
                  Jede <span style={{ color: PAL.text }}>Sonne</span> ein Basismodell, jede Ableitung ein <span style={{ color: PAL.text }}>Stern</span> in ihrem Umlauf:
                  heller heißt neuer und häufiger geladen, größer heißt mehr Downloads. Familien mit den meisten Downloads liegen im Zentrum, nach außen fallend; beschriftet sind die größten. <span style={{ color: relColor.merge }}>Goldene Brücken</span> verbinden Familien,
                  die zu einem neuen Modell verschmolzen sind.
                </p>
              </Reveal>
            )}
          </div>

          <div className="viz" style={{ gridColumn: '1 / -1' }}>
        <div
          ref={overlayRef}
          {...(open ? { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Galaxie erkunden', tabIndex: -1 } : {})}
          style={open
            ? { position: 'fixed', inset: 0, zIndex: 60, background: PAL.bg, display: 'flex', flexDirection: 'column', outline: 'none' }
            : { position: 'relative', width: '100%', aspectRatio: `${W} / ${H}` }}>
          {open && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--s-4)', padding: 'var(--s-4) var(--s-6)', borderBottom: `1px solid ${PAL.hairline}` }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-1)', minWidth: 0 }}>
                <span className="mono" style={{ color: PAL.muted, fontSize: '0.8rem' }}>Galaxie erkunden · Ziehen und Scrollen zoomt, Klick öffnet ein Profil</span>
                <span className="mono" style={{ color: PAL.muted, fontSize: '0.72rem', display: 'inline-flex', flexWrap: 'wrap', alignItems: 'center', gap: 'var(--s-1) var(--s-4)' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    <span aria-hidden="true" style={{ width: 16, borderTop: `2px solid ${hexA(PAL.human, 0.75)}`, display: 'inline-block' }} />
                    Linien = Abstammung: Basismodell zu seinen Ableitungen
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    <span aria-hidden="true" style={{ width: 16, borderTop: `2px solid ${REL_COLOR.merge}`, display: 'inline-block' }} />
                    goldene Bögen = Merges zweier Familien
                  </span>
                  <span>Auf eine Sonne zeigen hebt ihre Familie hervor</span>
                </span>
              </div>
              <button onClick={closeExplorer} aria-label="Explorer schließen" className="mono"
                style={{ background: 'transparent', border: `1px solid ${PAL.hairline}`, color: PAL.text, borderRadius: 999, padding: 'var(--s-1) var(--s-4)', cursor: 'pointer', fontSize: '0.8rem', flexShrink: 0, whiteSpace: 'nowrap' }}>✕ Schließen</button>
            </div>
          )}
          {canvasZone}
          {!open && (
            <button ref={openBtnRef} onClick={() => setOpen(true)} className="mono"
              style={{ position: 'absolute', right: 'var(--s-4)', bottom: 'var(--s-4)', background: PAL.machine, color: PAL.onAccent, border: 'none', borderRadius: 999, padding: 'var(--s-2) var(--s-5)', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600 }}>
              ⤢ Galaxie erkunden
            </button>
          )}
          {hover?.node && (
            <div style={{ position: 'fixed', left: hover.cx, top: hover.cy, transform: 'translate(-50%, calc(-100% - 14px))', pointerEvents: 'none', zIndex: 80, background: 'var(--panel-2)', border: `1px solid ${PAL.machineLine}`, borderRadius: 8, padding: 'var(--s-3) var(--s-4)', maxWidth: 320, boxShadow: '0 10px 30px rgba(0,0,0,0.55)' }}>
              {/* Phase 7.7: voller, ungeschnittener Name (Hub: org/model via id), Umbruch statt Truncation. */}
              <div className="t-data" style={{ color: PAL.text, fontWeight: 600, lineHeight: 1.25, overflowWrap: 'anywhere' }}>
                {hover.node.hub ? hubs[hover.node.i].id : data.field.name[hover.node.i]}
              </div>
              <div className="t-data" style={{ color: PAL.muted, marginTop: 'var(--s-1)' }}>
                {hover.node.hub
                  ? `${hubs[hover.node.i].c.toLocaleString('de-DE')} Abkömmlinge · ${ageLabel(hubs[hover.node.i].age)}`
                  : `${data.field.dl[hover.node.i].toLocaleString('de-DE')} Downloads · ${ageLabel(data.field.age[hover.node.i])}`}
              </div>
              {hudRel && hudRel.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--s-1) var(--s-3)', marginTop: 'var(--s-2)', paddingTop: 'var(--s-2)', borderTop: `1px solid ${PAL.hairline}` }}>
                  {hudRel.slice(0, 3).map((d) => (
                    <span key={d.rel} className="t-data" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: PAL.muted }}>
                      <span style={{ width: 8, height: 8, borderRadius: 2, background: REL_COLOR[d.rel], display: 'inline-block' }} />
                      <span style={{ color: PAL.text }}>{d.pct}%</span> {REL_LABEL[d.rel]}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
          {open && profile && (
            <div className="mono" style={{ position: 'absolute', right: 'var(--s-5)', bottom: 'var(--s-5)', width: 'min(360px, 90%)', background: 'var(--panel-2)', border: `1px solid ${PAL.machineLine}`, borderRadius: 10, padding: 'var(--s-4) var(--s-5)', zIndex: 70, boxShadow: '0 16px 48px rgba(0,0,0,0.6)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--s-2)' }}>
                <div className="display" style={{ fontSize: '1.15rem', color: PAL.text, lineHeight: 1.15 }}>{profile.title}</div>
                <button onClick={() => setSel(null)} aria-label="Profil schließen" style={{ background: 'transparent', border: 'none', color: PAL.muted, cursor: 'pointer', fontSize: '1rem' }}>✕</button>
              </div>
              <div style={{ color: PAL.muted, fontSize: '0.74rem', marginTop: 'var(--s-2)', lineHeight: 1.7 }}>
                {profile.hub ? (
                  <>{profile.sub ? <>Organisation: <span style={{ color: PAL.text }}>{profile.sub}</span><br /></> : null}
                    Basismodell · <span style={{ color: PAL.text }}>{profile.c.toLocaleString('de-DE')}</span> Abkömmlinge<br />
                    Veröffentlicht: <span style={{ color: PAL.text }}>{ageLabel(profile.age)}</span></>
                ) : (
                  <>Aufgabe: <span style={{ color: PAL.text }}>{profile.task || 'unbekannt'}</span><br />
                    Format: <span style={{ color: PAL.text }}>{profile.format}{profile.size ? ` · ${profile.size}` : ''}</span><br />
                    Vermehrungsart: <span style={{ color: relColor[profile.rel] }}>{REL_LABEL[profile.rel]}</span><br />
                    Adoption: <span style={{ color: PAL.text }}>{profile.dl.toLocaleString('de-DE')}</span> Downloads · {profile.lk.toLocaleString('de-DE')} Likes<br />
                    Veröffentlicht: <span style={{ color: PAL.text }}>{ageLabel(profile.age)}</span><br />
                    <span style={{ color: PAL.human }}>Stärke: {profile.strength}</span></>
                )}
              </div>
              {profile.hfId && (
                <a href={`https://huggingface.co/${profile.hfId}`} target="_blank" rel="noopener noreferrer"
                   style={{ display: 'inline-block', marginTop: 'var(--s-3)', color: PAL.human, fontSize: '0.74rem', textDecoration: 'none', borderBottom: `1px solid ${hexA(PAL.human, 0.4)}` }}>
                  ↗ huggingface.co/{profile.hfId}
                </a>
              )}
            </div>
          )}
        </div>

        {/* Legenden: Alter (Helligkeit), Vermehrungsart (Farbe) */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--s-2) var(--s-6)', marginTop: 'var(--s-4)', alignItems: 'center' }}>
          {/* Helligkeit kodiert ZWEI geordnete Attribute (starBright = Alter x Downloads, s.o.).
              Die Legende muss beide nennen, sonst dekodiert der Leser nur die Haelfte (Ware). */}
          <span className="mono" style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--s-2)', color: PAL.muted, fontSize: '0.78rem' }}>
            Helligkeit: alt &amp; wenig geladen
            <span style={{ width: 90, height: 9, borderRadius: 5, background: `linear-gradient(90deg, ${hexA(STAR, 0.2)}, ${STAR})` }} />
            neu &amp; viel geladen
          </span>
          {rels.map((r) => (
            <span key={r.rel} className="mono" style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--s-2)', color: PAL.muted, fontSize: '0.78rem' }}>
              <span style={{ width: 11, height: 11, borderRadius: 3, background: REL_COLOR[r.rel], display: 'inline-block' }} /> {REL_LABEL[r.rel]} {r.pct}%
            </span>
          ))}
        </div>

          <table className="sr-only">
            <caption>Die einflussreichsten Basismodelle und ihre Zahl direkter Abkömmlinge</caption>
            <thead><tr><th scope="col">Basismodell</th><th scope="col">direkte Abkömmlinge</th></tr></thead>
            <tbody>{hubs.map((h) => <tr key={h.id}><td>{h.label}</td><td>{h.c}</td></tr>)}</tbody>
          </table>
          </div>

          {data && (
            <SourceNote className="" style={{ gridColumn: '1 / -1' }}>
              Hugging Face Modellkarten (base_model-Lineage + createdAt/downloads/pipeline_tag), Stand 2026; die Datensatzkarte nennt keine Lizenz. Sonnengröße = direkte Abkömmlinge (FLUX.1-dev: {hubs[0]?.c.toLocaleString('de-DE')}), Helligkeit = Aktualität und Downloads (neue, viel-geladene Modelle stechen hervor), radiale Position = Downloads (die meistgeladene Familie im Zentrum, nach außen fallend).
              Konzentration: die Top-100 Basismodelle erklären {facts.top100Pct} % aller {facts.totalEdges.toLocaleString('de-DE')} Abstammungen; {facts.merges.toLocaleString('de-DE')} Modelle sind als Merge getaggt.
              Eine goldene Brücke erscheint nur verifiziert: mindestens zwei unabhängige, nachweislich genutzte Merge-Modelle (Mindest-Downloads, plausible Elternzahl) verbinden die Familien; Tag-Spam und Einzel-Experimente zählen nicht. Von tausenden Merge-Tags überstehen diese Prüfung nur drei Brücken, alle innerhalb der Qwen-Familie. Befund: echte Verschmelzungen passieren fast nur innerhalb architektonisch kompatibler Familien.
              Gerendert sind die ~{(data.field.x.length / 1000).toFixed(0)}k meistgeladenen Modelle der 160 größten Familien (repräsentativ, nicht alle {facts.totalModels.toLocaleString('de-DE')}). Methodik-Anteile im HUD beziehen sich auf diesen gerenderten Schwarm. „Stärke“ = aus Format/Aufgabe abgeleitetes Profil, keine Benchmark-Wertung.
            </SourceNote>
          )}
          <Reveal className="text-column">
            <p className="t-display-s" style={{ color: PAL.muted, marginTop: 'var(--s-16)', maxWidth: '30ch' }}>
              Doch entscheidend ist nicht, wie Modelle entstehen, sondern <span style={{ color: PAL.text }}>wie Menschen sie nutzen.</span>
            </p>
          </Reveal>
        </div>
      </div>
    </section>
  )
}
