import { useEffect, useState } from 'react'
import { motion } from 'motion/react'

// DER FLUG: der Geist eines angeklickten Band-Segments reist ins Register.
//
// WOZU. Ein Klick auf ein Segment in Ebene 1 oeffnet das Register, stellt die Wofuer-Spalte auf
// diese Kategorie um und sortiert danach. Ohne Uebergang erscheint das Register als NEUER
// Bildschirm: der Leser verliert den Bezug zwischen dem Segment, das er angefasst hat, und der
// Spalte, die sich veraendert hat. Genau dagegen ist Object Constancy gedacht (Heer und Robertson
// 2007) - das Objekt bleibt sichtbar dasselbe, waehrend es seine Position wechselt.
//
// WAS ES NICHT IST. Keine autonome Bewegung: der Flug startet ausschliesslich auf einen Klick und
// endet nach TOTAL Millisekunden von selbst. Er traegt keine Information, die nicht auch ohne ihn
// im Bild stuende, und er ist aria-hidden - die Ansage macht die role="status"-Zeile des Registers.
// Bei Reduced Motion wird diese Komponente gar nicht erst gerendert.
//
// WARUM position: fixed. Der Flug laeuft, WAEHREND die Seite scrollt. In Dokument-Koordinaten
// muesste die Animation den Scroll mitrechnen; in Viewport-Koordinaten ist die Zielposition
// einfach die gemessene Rechteckposition nach dem Oeffnen, und der Scroll darunter stoert nicht.

const LIFT = 260 // ms: das Segment loest sich, hebt leicht an und wird heller
const TRAVEL = 620 // ms: die Reise zum Registerkopf
const TOTAL = LIFT + TRAVEL
const EASE = [0.22, 1, 0.36, 1] // dieselbe Kurve wie die uebrigen Uebergaenge des Akts

/** Dieselbe 6-px-Schraffur wie Band und Blatt: "Sonstiges" fliegt als Textur, nicht als Flaeche. */
const hatchFill = (color) => `repeating-linear-gradient(-45deg, rgba(11,10,12,0.85) 0 1.4px, ${color} 1.4px 4.24px)`

export default function CatFlight({ flight, onDone }) {
  const [phase, setPhase] = useState('lift')

  useEffect(() => {
    if (!flight) return undefined
    setPhase('lift')
    const a = setTimeout(() => setPhase('travel'), LIFT)
    const b = setTimeout(() => onDone?.(), TOTAL)
    return () => { clearTimeout(a); clearTimeout(b) }
  }, [flight, onDone])

  if (!flight) return null
  const { from, to, color, hatch } = flight
  const lifted = phase !== 'lift'

  return (
    <motion.span
      aria-hidden="true"
      initial={{ left: from.x, top: from.y, width: from.w, height: from.h, opacity: 1, borderRadius: 4 }}
      animate={lifted
        // Reise: auf die Zielbreite zusammenlaufen, auf Spaltenhoehe schrumpfen, ausblenden.
        ? { left: to.x, top: to.y, width: to.w, height: to.h, opacity: 0, borderRadius: 3 }
        // Abheben: minimal groesser und heller, damit der Blick das Objekt fasst, bevor es reist.
        : { left: from.x - 3, top: from.y - 5, width: from.w + 6, height: from.h + 8, opacity: 1 }}
      transition={{ duration: (lifted ? TRAVEL : LIFT) / 1000, ease: EASE }}
      style={{
        position: 'fixed',
        zIndex: 60,
        pointerEvents: 'none',
        background: hatch ? hatchFill(color) : color,
        boxShadow: `0 0 0 1px ${color}`,
      }}
    />
  )
}

export { TOTAL as FLIGHT_MS }
