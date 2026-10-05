import { PAL } from '../../theme'
import { rgba } from './drawSheet'

// Kleine, wiederverwendbare Bausteine des Akts. Uebernommen aus der abgeloesten WildChatMap
// (chipBtn, sectionTitle, bar, deltaRow), damit das Dossier und der Lesetisch dieselben Muster
// benutzen wie die Bedienleiste und nichts doppelt erfunden wird.
// Stand: alle vier sind aktiv - chipBtn und sectionTitle im Blatt, bar und deltaRow im Dossier.

export const MOD_LABEL = {
  violence: 'Gewalt',
  sexual: 'sexuelle Inhalte',
  harassment: 'Belästigung',
  hate: 'Hass',
  'self-harm': 'Selbstverletzung',
}

/** Filter-/Encode-Chip. Ruhig, ohne Glow: der Akzent ist der Rand, nicht ein Leuchten. */
export function chipBtn({ active, color, label, onClick, pressed, faded }) {
  return (
    <button
      key={label}
      type="button"
      onClick={onClick}
      aria-pressed={pressed}
      className="mono"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        font: 'inherit',
        fontSize: '0.66rem',
        color: active ? PAL.text : PAL.muted,
        background: active ? rgba(color, 0.14) : rgba(PAL.hairline, 0.025),
        border: `1px solid ${active ? color : rgba(PAL.hairline, 0.5)}`,
        borderRadius: 999,
        padding: '0.26rem 0.62rem',
        cursor: 'pointer',
        opacity: faded && !active ? 0.55 : 1,
      }}
    >
      <span aria-hidden="true" style={{ width: 9, height: 9, borderRadius: 2, background: color, flex: '0 0 auto' }} />
      {label}
    </button>
  )
}

/**
 * Zustands-Schalter der Bedienleiste (Filter, Encode, Uebergaenge). Ein Muster fuer alle vier,
 * damit gleiche Bedienart auch gleich aussieht - und damit `aria-pressed` nirgends vergessen
 * werden kann. Magenta markiert hier den aktiven Zustand, also wieder Selektion, nie Kategorie.
 */
export function toggleBtn({ pressed, label, onClick, title }) {
  return (
    <button
      key={title || label}
      type="button"
      className="mono"
      aria-pressed={pressed}
      onClick={onClick}
      style={{
        font: 'inherit',
        fontSize: '0.66rem',
        cursor: 'pointer',
        color: pressed ? PAL.machine : PAL.muted,
        background: 'transparent',
        border: `1px solid ${pressed ? PAL.machine : rgba(PAL.hairline, 0.5)}`,
        borderRadius: 999,
        padding: '0.26rem 0.7rem',
      }}
    >
      {pressed ? '✓ ' : ''}{label}
    </button>
  )
}

/** Abschnittsmarke mit Hairline. */
export function sectionTitle(label, detail) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)', marginBottom: 'var(--s-2)' }}>
      <span className="t-label" style={{ color: PAL.muted, whiteSpace: 'nowrap' }}>{label}</span>
      <span style={{ height: 1, flex: 1, minWidth: 0, background: rgba(PAL.machine, 0.22) }} />
      {/* minWidth 0 + ellipsis: sonst schiebt ein zu langes Detail die Zeile aus ihrer Spalte
          heraus in die Nachbarspalte, statt sichtbar zu kuerzen. */}
      {detail && (
        <span
          className="mono"
          title={detail}
          style={{ color: PAL.muted, fontSize: '0.62rem', whiteSpace: 'nowrap', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}
        >
          {detail}
        </span>
      )}
    </div>
  )
}

/**
 * Balkenzeile auf gemeinsamer Skala 0..100 (Sprachen, Modelle).
 *
 * Die Labelspur ist 124 px breit, weil genau dort die laengsten Modellnamen enden
 * ("GPT-3.5 turbo-0613" braucht 121 px). Bei 112 px kuerzte die Ellipse ausgerechnet den
 * Versionssuffix weg - drei verschiedene Modelle lasen sich dann alle als "GPT-3.5 turbo-0…".
 */
export function bar(label, pct, color) {
  return (
    <div key={label} style={{ display: 'grid', gridTemplateColumns: 'minmax(88px, 124px) minmax(74px, 1fr) 34px', alignItems: 'center', gap: '0.55rem', marginBottom: '0.42rem' }}>
      <span className="mono" style={{ fontSize: '0.7rem', color: PAL.text, textAlign: 'right', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
      <div style={{ height: 9, background: rgba(PAL.hairline, 0.085), borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, minWidth: pct > 0 ? 2 : 0, height: '100%', background: color }} />
      </div>
      <span className="mono" style={{ fontSize: '0.7rem', color: PAL.muted, textAlign: 'right' }}>{pct}%</span>
    </div>
  )
}

/**
 * Divergierender Delta-Balken gegen den Weltmix, Nulllinie zentriert.
 *
 * ZWEIZEILIG, nicht dreispaltig. In einer Dossier-Spalte (gemessen 273 px bei 1440 px Fenster)
 * blieben neben Label und Zahl nur 75 px fuer den Balken - bei einer Spanne von rund 13 pp sind
 * das 2,9 px je Prozentpunkt, und damit trug der laengste Kanal (Laenge auf gemeinsamer Skala,
 * Cleveland & McGill Rang 1) am wenigsten. Label und Zahl teilen jetzt die erste Zeile, der
 * Balken bekommt die volle Spaltenbreite darunter: 273 px, also 3,6x mehr Aufloesung. Der Preis
 * sind neun zusaetzliche Textzeilen Hoehe, die das Band ohne inneres Scrollen traegt.
 */
export function deltaRow(label, delta, max, color, fmtSigned) {
  const half = (Math.abs(delta) / max) * 50
  return (
    <div key={label} style={{ marginBottom: '0.42rem' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem', marginBottom: '2px' }}>
        <span className="mono" style={{ color: PAL.text, fontSize: '0.67rem', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
        <span style={{ flex: 1, minWidth: 0 }} />
        <span className="mono" style={{ color: delta >= 0 ? color : PAL.muted, fontSize: '0.65rem', fontWeight: 700, whiteSpace: 'nowrap' }}>{fmtSigned(delta)}</span>
      </div>
      <div style={{ position: 'relative', height: 11, background: rgba(PAL.hairline, 0.055) }}>
        <span style={{ position: 'absolute', zIndex: 2, left: '50%', top: 0, bottom: 0, width: 1, background: rgba(PAL.ink, 0.35) }} />
        <span style={{ position: 'absolute', left: delta >= 0 ? '50%' : `${50 - half}%`, width: `${half}%`, top: 1, bottom: 1, background: color, opacity: delta >= 0 ? 0.95 : 0.55 }} />
      </div>
    </div>
  )
}
