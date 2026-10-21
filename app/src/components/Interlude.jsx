import { useEffect, useRef, useState } from 'react'
import { motion, useScroll, useTransform, useReducedMotion } from 'motion/react'
import { PAL, SCENE_BG } from '../theme'

// Interlude vor dem Finale (Prof-Feedback): scroll-getriebener Blackscreen als dramatischer
// Uebergang zur Gamification. Zwei PIXELART-Sprites schauen von den Raendern ins Bild: die
// Maschine (Magenta, rechts) und der Mensch (Teal, links), das Duell des Finales als Vorschau.
// Sprites sind im Code definierte Pixel-Matrizen (SVG-rects, crispEdges), kein fremdes Asset.
// Hook-Text: "Jetzt sieht sie dich an." prefers-reduced-motion -> statische Version ohne Sticky.

const CONTAINER_VH = 230 // Scroll-Weg des Interludes
const PX = 9 // Pixelgroesse der Sprites (SVG-Units, skaliert via width)
const BLINK_MS = 130 // Dauer eines Blinzelns
// Pixel-Matrizen: '.' leer, '1' Koerper, '2' Augenweiss, '3' Pupille, '4' Mund, '5' Antennen-Licht
const MACHINE_SPRITE = [
  '....5.....',
  '....1.....',
  '.11111111.',
  '1111111111',
  '1122112211',
  '1123112311',
  '1111111111',
  '1114444111',
  '.11111111.',
  '..1....1..',
]
const HUMAN_SPRITE = [
  '..111111..',
  '.11111111.',
  '1111111111',
  '1122112211',
  '1123112311',
  '1111111111',
  '1111441111',
  '.11111111.',
  '..111111..',
]

// Ein Pixel-Sprite als SVG. blink=true blendet Augenweiss/Pupille kurz auf Koerperfarbe.
function Sprite({ grid, body, width, blink, flip }) {
  const rows = grid.length
  const cols = grid[0].length
  const colors = {
    1: body,
    2: PAL.ink,
    3: PAL.bg,
    4: PAL.bg,
    5: PAL.ink,
  }
  return (
    <svg viewBox={`0 0 ${cols * PX} ${rows * PX}`} width={width} aria-hidden="true"
      style={{ display: 'block', shapeRendering: 'crispEdges', transform: flip ? 'scaleX(-1)' : undefined }}>
      {grid.map((row, y) => [...row].map((ch, x) => {
        if (ch === '.') return null
        const c = blink && (ch === '2' || ch === '3') ? body : colors[ch] || body
        return <rect key={`${x}-${y}`} x={x * PX} y={y * PX} width={PX} height={PX} fill={c} />
      }))}
    </svg>
  )
}

// Blinzel-Takt: kurzes Schliessen der Augen in unregelmaessigen Abstaenden (deaktiviert bei reduce).
function useBlink(active, baseMs, offsetMs) {
  const [blink, setBlink] = useState(false)
  useEffect(() => {
    if (!active) return
    let closeT = 0
    const openT = setInterval(() => {
      setBlink(true)
      closeT = setTimeout(() => setBlink(false), BLINK_MS)
    }, baseMs + offsetMs)
    return () => { clearInterval(openT); clearTimeout(closeT) }
  }, [active, baseMs, offsetMs])
  return blink
}

export default function Interlude() {
  const reduce = useReducedMotion()
  const containerRef = useRef(null)
  const { scrollYProgress } = useScroll({ target: containerRef, offset: ['start start', 'end end'] })

  // Dramaturgie: Rueckblick-Zeile -> Maschine schaut rein -> Hook -> Mensch schaut rein -> Test-Cue.
  // KEIN Einblenden der Rueckblick-Zeile mehr (Befund Abnahme 2026-07): waehrend die Sektion von
  // unten hereinscrollt, steht scrollYProgress konstant auf 0 - eine Rampe ab 0,04 liess den
  // ganzen Einlauf leer. Die Zeile ist ab dem ersten Pixel da und loest sich erst auf, wenn die
  // Maschine ins Bild kommt.
  const t1Op = useTransform(scrollYProgress, [0.3, 0.42], [1, 0])
  // Die Maschine kommt frueher ins Bild (vorher ab 0,3): sonst steht ueber rund 350 px Scrollweg
  // nur eine einzige Textzeile im Bild und der Uebergang wirkt wie ein Ladebildschirm.
  const machineX = useTransform(scrollYProgress, [0.16, 0.42], ['105%', '18%'])
  const machineRot = useTransform(scrollYProgress, [0.16, 0.42], [14, -6])
  const hookOp = useTransform(scrollYProgress, [0.44, 0.54], [0, 1])
  const hookY = useTransform(scrollYProgress, [0.44, 0.54], [24, 0])
  const humanX = useTransform(scrollYProgress, [0.58, 0.72], ['-105%', '-18%'])
  const humanRot = useTransform(scrollYProgress, [0.58, 0.72], [-14, 6])
  const cueOp = useTransform(scrollYProgress, [0.78, 0.86], [0, 1])
  const machineBlink = useBlink(!reduce, 2600, 0)
  const humanBlink = useBlink(!reduce, 3400, 900)

  const textBlock = (staticMode) => (
    <>
      <motion.p className="t-lead" style={{ color: PAL.muted, maxWidth: '44ch', textAlign: 'center', margin: '0 auto', ...(staticMode ? {} : { opacity: t1Op }) }}>
        Vier Akte lang hast du der Maschine zugesehen: beim Wachsen, Forschen, Vermehren, Sprechen.
      </motion.p>
      <motion.h2 className="t-display-l" style={{ color: PAL.text, textAlign: 'center', margin: 'var(--s-6) 0 0', ...(staticMode ? {} : { opacity: hookOp, y: hookY }) }}>
        Jetzt sieht sie <span style={{ color: PAL.machine }}>dich</span> an.
      </motion.h2>
      <motion.p className="kicker" style={{ textAlign: 'center', justifyContent: 'center', marginTop: 'var(--s-10)', ...(staticMode ? {} : { opacity: cueOp }) }}>
        ↓ Ein letzter Test
      </motion.p>
    </>
  )

  // ---- Reduced-Motion: statische Sektion, beide Sprites sichtbar, kein Sticky-Zwang ----
  if (reduce) {
    return (
      <section id="interlude" aria-label="Uebergang zum Finale" className="act" style={{ background: SCENE_BG, justifyContent: 'center' }}>
        <div className="layout-container" style={{ position: 'relative' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 'var(--s-8)' }} aria-hidden="true">
            <Sprite grid={HUMAN_SPRITE} body={PAL.human} width={96} blink={false} />
            <Sprite grid={MACHINE_SPRITE} body={PAL.machine} width={96} blink={false} flip />
          </div>
          {textBlock(true)}
        </div>
      </section>
    )
  }

  // ---- Scroll-Modus: sticky Blackscreen, Sprites schauen von den Raendern herein ----
  return (
    <section id="interlude" aria-label="Uebergang zum Finale" style={{ background: SCENE_BG }}>
      <div ref={containerRef} style={{ position: 'relative', height: `${CONTAINER_VH}vh` }}>
        <div className="sticky-stage" style={{ justifyContent: 'center' }}>
          <div className="layout-container">{textBlock(false)}</div>
          {/* Maschine lugt von rechts herein (x in % der eigenen Breite; 105% = komplett draussen) */}
          <motion.div aria-hidden="true" style={{ position: 'absolute', right: 0, top: '30%', x: machineX, rotate: machineRot, transformOrigin: '0% 100%' }}>
            <Sprite grid={MACHINE_SPRITE} body={PAL.machine} width={104} blink={machineBlink} flip />
          </motion.div>
          {/* Mensch lugt von links herein */}
          <motion.div aria-hidden="true" style={{ position: 'absolute', left: 0, bottom: '22%', x: humanX, rotate: humanRot, transformOrigin: '100% 100%' }}>
            <Sprite grid={HUMAN_SPRITE} body={PAL.human} width={92} blink={humanBlink} />
          </motion.div>
        </div>
      </div>
    </section>
  )
}
