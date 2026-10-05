import { useRef } from 'react'
import { motion, useScroll, useTransform, useReducedMotion } from 'motion/react'
import { PAL, SCENE_BG } from '../theme'

// Szenische Akt-Herleitung (Interlude-Qualitaet, Hullman: Sequenz + Pausen tragen Bedeutung):
// eine scroll-getriebene Buehne VOR jedem Akt. Riesige, fast schwarze Akt-Ziffer als Hintergrund-
// Identitaet, Kicker mit aufziehender Signatur-Linie, grosser Titel steigt auf, ein Erzaehlsatz
// leitet her.
//
// KEIN Sticky-Pin mehr (Befund Abnahme 2026-07): die frueheren 165vh mit sticky Buehne und
// Ausblenden bei Fortschritt 0,97 erzeugten am Akt-Uebergang bis zu drei komplett leere
// Bildschirme (gemessen 0,4 % Tinte bei 1440x900) - das liest sich beim Vorfuehren als "haengt".
// Jetzt: eine normal fliessende Sektion (~76vh), deren Reveal an das HEREINSCROLLEN gekoppelt ist
// (offset start-end -> center-center). Der Block ist voll aufgebaut, sobald die Sektion mittig
// steht, und bleibt sichtbar bis er oben herausscrollt - der naechste Akt ist da laengst im Bild.
// prefers-reduced-motion -> derselbe statische Block ohne Scroll-Kopplung.

const MIN_VH = 76 // Buehnenhoehe: genug Luft fuer die Szene, aber unter einem vollen Viewport

export default function ActIntro({ num, kicker, title, lead }) {
  const reduce = useReducedMotion()
  const ref = useRef(null)
  // Fortschritt 0 = Sektionsoberkante betritt den Viewport von unten, 1 = Sektion steht mittig.
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'center center'] })

  const numOp = useTransform(scrollYProgress, [0.06, 0.42], [0, 1])
  const kickerOp = useTransform(scrollYProgress, [0.12, 0.34], [0, 1])
  const lineSX = useTransform(scrollYProgress, [0.18, 0.48], [0, 1])
  const titleOp = useTransform(scrollYProgress, [0.24, 0.52], [0, 1])
  const titleY = useTransform(scrollYProgress, [0.24, 0.52], [30, 0])
  const leadOp = useTransform(scrollYProgress, [0.42, 0.72], [0, 1])
  const leadY = useTransform(scrollYProgress, [0.42, 0.72], [20, 0])

  const staticMode = Boolean(reduce)
  // overflow:hidden ist Pflicht: die Akt-Ziffer blutet bewusst um 2vw nach rechts aus dem Raster
  // (frueher fing das der Sticky-Container ab). Ohne diese Klammer erzeugt sie bei 390 px Breite
  // genau 8 px horizontalen Seiten-Overflow.
  return (
    <section
      ref={ref}
      aria-label={kicker}
      className="act"
      style={{ background: SCENE_BG, justifyContent: 'center', minHeight: `${MIN_VH}vh`, overflow: 'hidden' }}
    >
      <div className="layout-container" style={{ position: 'relative', width: '100%' }}>
        {/* riesige Akt-Ziffer als Hintergrund-Identitaet (rein dekorativ) */}
        <motion.div aria-hidden="true" className="display" style={{
          position: 'absolute', right: '-2vw', top: '50%', transform: 'translateY(-56%)',
          fontSize: 'clamp(13rem, 34vh, 24rem)', lineHeight: 1, fontWeight: 800,
          color: 'transparent', WebkitTextStroke: '2px rgba(236,232,225,0.07)',
          pointerEvents: 'none', userSelect: 'none',
          ...(staticMode ? {} : { opacity: numOp }),
        }}>{num}</motion.div>
        <div style={{ position: 'relative', maxWidth: '68ch' }}>
          <motion.p className="kicker" style={{ marginBottom: 'var(--s-4)', ...(staticMode ? {} : { opacity: kickerOp }) }}>{kicker}</motion.p>
          <motion.div aria-hidden="true" style={{ height: 2, width: 130, background: PAL.machine, transformOrigin: '0% 50%', marginBottom: 'var(--s-8)', ...(staticMode ? {} : { scaleX: lineSX }) }} />
          <motion.h2 className="t-display-l" style={{ margin: 0, maxWidth: '16ch', ...(staticMode ? {} : { opacity: titleOp, y: titleY }) }}>{title}</motion.h2>
          <motion.p className="t-lead" style={{ color: PAL.muted, marginTop: 'var(--s-8)', maxWidth: '46ch', ...(staticMode ? {} : { opacity: leadOp, y: leadY }) }}>{lead}</motion.p>
        </div>
      </div>
    </section>
  )
}
