import { useEffect, useRef, useState } from 'react'
import { motion, useInView, useReducedMotion, animate, useScroll, useSpring } from 'motion/react'
import { PAL } from '../theme'

// Fortschrittsleiste oben mit Akt-Ticks: Scroll-Position + Sequenz-Signal (Segel & Heer: Navigation
// in der Story). Tick-Positionen werden GEMESSEN (Sektionen mounten erst nach Daten-Fetch, feste
// Brueche wuerden driften) und per ResizeObserver nachgefuehrt.
const ACT_IDS = ['compute', 'map', 'family', 'wildchat', 'spot']
export function ScrollProgress() {
  const { scrollYProgress } = useScroll()
  const scaleX = useSpring(scrollYProgress, { stiffness: 120, damping: 30, restDelta: 0.001 })
  const [ticks, setTicks] = useState([])
  useEffect(() => {
    let raf = 0
    const measure = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight
      if (max <= 0) return
      setTicks(ACT_IDS
        .map((id) => { const el = document.getElementById(id); return el ? el.offsetTop / max : null })
        .filter((v) => v != null && v > 0.005 && v < 0.995))
    }
    measure()
    const ro = new ResizeObserver(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(measure) })
    ro.observe(document.body)
    return () => { ro.disconnect(); cancelAnimationFrame(raf) }
  }, [])
  return (
    <div aria-hidden="true" style={{ position: 'fixed', top: 0, left: 0, right: 0, height: 7, zIndex: 50, pointerEvents: 'none' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: PAL.grid }} />
      <motion.div style={{ scaleX, transformOrigin: '0%', position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: PAL.machine }} />
      {ticks.map((f, i) => (
        <div key={i} style={{ position: 'absolute', left: `${f * 100}%`, top: 0, width: 1.5, height: 7, background: 'rgba(236,232,225,0.35)' }} />
      ))}
    </div>
  )
}

// Scroll-Reveal: sanftes Einblenden beim Hereinscrollen. Respektiert prefers-reduced-motion (a11y).
export function Reveal({ children, delay = 0, y = 18, className, style }) {
  const reduce = useReducedMotion()
  if (reduce) return <div className={className} style={style}>{children}</div>
  return (
    <motion.div
      className={className}
      style={style}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.35 }}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  )
}

// Zahl, die beim Sichtbarwerden hochzaehlt. Bei reduced-motion direkt der Endwert.
export function CountUp({ to, suffix = '', decimals = 0, duration = 1.6, className }) {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, amount: 0.6 })
  const reduce = useReducedMotion()
  const [val, setVal] = useState(reduce ? to : 0)
  // Waehrend des Hochzaehlens stumm (aria-live off), erst der Endwert wird angesagt.
  const [live, setLive] = useState('off')
  useEffect(() => {
    if (reduce || !inView) return
    setLive('off')
    const controls = animate(0, to, { duration, ease: 'easeOut', onUpdate: (v) => setVal(v), onComplete: () => setLive('polite') })
    return () => controls.stop()
  }, [inView, to, duration, reduce])
  return (
    <span ref={ref} className={className} aria-live={live} aria-atomic="true">
      {val.toFixed(decimals)}{suffix}
    </span>
  )
}

// Quellen- und Methodennachweis, standardmaessig eingeklappt (natives <details>, also ohne JS
// tastatur- und screenreader-bedienbar). Die Angaben sind Pflicht und muessen auffindbar bleiben,
// sie brauchen aber keinen halben Bildschirm: eingeklappt kostet der Nachweis eine Zeile, der
// Leser oeffnet ihn bei Bedarf. Munzner/Tufte: Details on demand statt Dauerpraesenz.
export function SourceNote({ children, label = 'Quelle und Methode', className = 'text-column', style }) {
  return (
    <details className={`source-note ${className}`} style={style}>
      <summary className="t-data">{label}</summary>
      <div className="t-data source-note-body">{children}</div>
    </details>
  )
}
