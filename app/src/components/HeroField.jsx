import { useEffect, useRef } from 'react'
import { useReducedMotion } from 'motion/react'
import { PAL, STAR } from '../theme'

// Hero-Sternenfeld: das Galaxie-Motiv von Akt 3 als visuelle Plattform ab Sekunde 1 (Hullman:
// Konsistenz der visuellen Struktur in der Story). Sehr subtil HINTER der Typo; rAF laeuft nur,
// wenn der Hero sichtbar ist; reduced-motion -> ein statischer Draw (kein Drift, kein Twinkle).

const N_STARS = 170
const R_MIN = 0.5 // px Sternradius
const R_MAX = 1.6
const A_MIN = 0.22 // Basis-Alpha
const A_MAX = 0.65
const MACHINE_SHARE = 0.08 // seltene Magenta-Sterne (gedimmt): die Maschine blinzelt schon im Hero
const DRIFT = 2.5 // max px/s Drift je Achse (majestaetisch langsam)
const TWINKLE_AMP = 0.15
const TWINKLE_SPEED = 0.0004 // rad/ms

// Deterministischer Pseudo-Zufall (mulberry32-Schritt, Muster aus FamilyTree): gleicher Seed ->
// identisches Feld -> reproduzierbare Screenshots.
const seeded = (n) => {
  let t = (n + 0x6d2b79f5) | 0
  t = Math.imul(t ^ (t >>> 15), 1 | t)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

export default function HeroField() {
  const ref = useRef(null)
  const reduce = useReducedMotion()

  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    const ctx = cv.getContext('2d')
    const stars = Array.from({ length: N_STARS }, (_, i) => ({
      x: seeded(i * 5 + 1), y: seeded(i * 5 + 2), // normiert [0..1] -> Resize-stabil
      vx: (seeded(i * 5 + 3) - 0.5) * 2 * DRIFT, vy: (seeded(i * 5 + 4) - 0.5) * 2 * DRIFT,
      r: R_MIN + (R_MAX - R_MIN) * seeded(i * 5 + 5),
      a: A_MIN + (A_MAX - A_MIN) * seeded(i * 7 + 6),
      ph: seeded(i * 7 + 7) * 6.283,
      machine: seeded(i * 7 + 8) < MACHINE_SHARE,
    }))
    const size = { w: 1, h: 1 }
    let raf = 0
    let running = false
    let last = 0

    const draw = (t) => {
      const rect = cv.getBoundingClientRect()
      size.w = Math.max(1, rect.width); size.h = Math.max(1, rect.height)
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      const w = Math.max(1, Math.round(size.w * dpr)); const h = Math.max(1, Math.round(size.h * dpr))
      if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, size.w, size.h)
      for (const s of stars) {
        const tw = reduce ? 1 : 1 - TWINKLE_AMP + TWINKLE_AMP * Math.sin(s.ph + t * TWINKLE_SPEED)
        ctx.globalAlpha = s.a * tw * (s.machine ? 0.7 : 1)
        ctx.fillStyle = s.machine ? PAL.machine : STAR
        ctx.beginPath()
        ctx.arc(s.x * size.w, s.y * size.h, s.r, 0, 6.283)
        ctx.fill()
      }
      ctx.globalAlpha = 1
    }
    const tick = (t) => {
      const dt = Math.min(50, t - (last || t)) // Delta kappen: kein Sprung nach Tab-Pause
      last = t
      for (const s of stars) {
        s.x = (s.x + (s.vx * dt) / 1000 / size.w + 1) % 1
        s.y = (s.y + (s.vy * dt) / 1000 / size.h + 1) % 1
      }
      draw(t)
      raf = requestAnimationFrame(tick)
    }
    const start = () => { if (running || reduce) return; running = true; last = 0; raf = requestAnimationFrame(tick) }
    const stop = () => { running = false; cancelAnimationFrame(raf) }

    draw(0) // statischer Erst-Draw (zugleich der reduced-motion-Endzustand)
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) start(); else stop() }, { threshold: 0 })
    io.observe(cv)
    const ro = new ResizeObserver(() => { if (!running) draw(last || 0) })
    ro.observe(cv)
    return () => { stop(); io.disconnect(); ro.disconnect() }
  }, [reduce])

  return <canvas ref={ref} aria-hidden="true" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} />
}
