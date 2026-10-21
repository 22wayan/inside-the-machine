import { useEffect, useState } from 'react'

// Gemeinsame Responsive-Bausteine. Die Story bleibt Desktop-first: alle Mobil-Zweige haengen an
// diesen zwei Hooks, damit Desktop-Geometrie und Desktop-Verhalten unveraendert bleiben.

// Ab dieser Spaltenbreite (CSS-px) gelten die Mobil-Layouts: Text vor der Grafik statt im
// Sticky-Pin, Erklaerkarten unter statt ueber der Grafik.
export const COMPACT_MAX = 719

/** Medienabfrage als State. Lazy initialisiert und ohne window lauffaehig (Tests rendern ohne DOM). */
export function useMediaQuery(query, fallback = false) {
  const [match, setMatch] = useState(() => (typeof window === 'undefined' || typeof window.matchMedia !== 'function'
    ? fallback
    : window.matchMedia(query).matches))
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined
    const mq = window.matchMedia(query)
    const sync = () => setMatch(mq.matches)
    sync()
    mq.addEventListener?.('change', sync)
    return () => mq.removeEventListener?.('change', sync)
  }, [query])
  return match
}

/** Schmaler Viewport (Telefon hochkant). */
export const useCompact = () => useMediaQuery(`(max-width: ${COMPACT_MAX}px)`)

/** Gemessene Inhaltsbreite eines Elements in CSS-px (0 bis zur ersten Messung). */
export function useElementWidth(ref) {
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return undefined
    const ro = new ResizeObserver(([entry]) => {
      const w = Math.round(entry.contentRect.width)
      setWidth((prev) => (prev === w ? prev : w))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  return width
}
