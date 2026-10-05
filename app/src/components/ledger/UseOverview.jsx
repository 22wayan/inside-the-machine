import { useEffect, useMemo, useState } from 'react'
import { CAT_COLOR, PAL } from '../../theme'
import { catPct, fmtDE, shortName } from '../../lib/ledger'

// AKT 4, EBENE 1 - "Wofuer redet die Welt mit der Maschine?"
//
// WARUM ZWEI EBENEN (Shneiderman 1996: overview first, zoom and filter, details on demand):
// Das Register (Ebene 2) ist ein dichtes Vergleichsblatt, 53 Zeilen x vier Mark-Spalten plus
// 848 Belege. Als ERSTKONTAKT beantwortet es die Frage des Akts nicht, es stellt sie nicht
// einmal. Ebene 1 stellt und beantwortet sie in einem Bild, Ebene 2 liefert danach das Material
// zum Nachrechnen. Der Genrewechsel author-driven -> reader-driven passiert damit an einer
// sichtbaren Stelle, dem Schalter (Segel und Heer 2010).
//
// WARUM KEIN KREISDIAGRAMM: Winkel ist der schwaechste Kanal fuer Anteilsvergleiche
// (Cleveland und McGill 1984, Munzner Kap. 5). Ein einzelnes horizontales Band kodiert dieselben
// Anteile als Laenge auf gemeinsamer Skala, Lie Factor 1, ohne 3D und ohne Animation.
//
// WARUM DIREKTE BESCHRIFTUNG UNTER DEM SEGMENT und nicht IM Segment: eine separate Farb-Legende
// kostet je Segment zwei Blickwechsel (Encoding gegen Decoding, Ware). Text IM Segment scheitert
// dagegen am Kontrast: die sechs Segmentfarben reichen von #ccbb44 bis #aa3377, keine einzige
// Textfarbe erreicht auf allen sechs die 4,5:1 fuer Kleintext. Deshalb sitzt jedes Label direkt
// UNTER seinem Segment und ist ueber eine 2 px starke Regel in der Segmentfarbe daran gebunden.
//
// WARUM DIE DREI KLEINSTEN ANDERS BEHANDELT WERDEN: unter der Labelschwelle liegen sie bei
// zusammen rund 2,5 %, ihr Segment ist bei 1440 px 17, 12 und 1 px breit. Ein Label passt dort
// bei keiner Viewport-Breite hinein. Sie werden deshalb als Gruppe am rechten Bandende
// annotiert, mit Farbmarke je Kategorie und in derselben Reihenfolge wie im Band.

/** Ab diesem Anteil traegt ein Segment sein eigenes Label unter dem Band. */
const INNER_LABEL_MIN = 8
/** Unter dieser Viewport-Breite kippt das Band in eine Zeilenliste (Label links, Balken rechts). */
const BAND_MIN_WIDTH = 900
/** Die Kategorie, an der der Aufhaenger die Streuung zwischen den Laendern zeigt. */
const SPREAD_CAT = 'Rollenspiel/Story'
/** Bezugsland des Aufhaengers: der Leser sitzt hier. Faellt auf den Median-Rang zurueck. */
const HOME = 'Deutschland'

export default function UseOverview({ data, countries, detailOpen, onToggleDetail, onPickCat, buttonRef }) {
  // Ein Band ueber die volle Spaltenbreite braucht Platz fuer sechs Labels. Unter
  // BAND_MIN_WIDTH ist das nicht mehr lesbar, dann steht dieselbe Aufteilung als Zeilenliste.
  // Lazy initialisiert und window-frei lauffaehig (der Struktur-Test rendert ohne DOM).
  const [band, setBand] = useState(() => (typeof window === 'undefined' || typeof window.matchMedia !== 'function'
    ? true
    : window.matchMedia(`(min-width: ${BAND_MIN_WIDTH}px)`).matches))

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined
    const mq = window.matchMedia(`(min-width: ${BAND_MIN_WIDTH}px)`)
    const sync = () => setBand(mq.matches)
    sync()
    mq.addEventListener?.('change', sync)
    return () => mq.removeEventListener?.('change', sync)
  }, [])

  // Die 9 Kategorien in globaler Rangfolge, Anteile auf exakt 100 normiert. globalCats summiert
  // im Datensatz auf 100, die Normierung ist die Versicherung dagegen, dass eine spaetere
  // Pipeline-Version mit 99 oder 101 ankommt und das Band dann nicht mehr das Ganze waere.
  const cats = useMemo(() => {
    const sum = data.globalCats.reduce((s, c) => s + (c.pct || 0), 0) || 1
    return data.globalCats.map((c) => ({
      cat: c.cat,
      pct: c.pct || 0,
      share: ((c.pct || 0) / sum) * 100,
      color: CAT_COLOR[c.cat] || PAL.muted,
    }))
  }, [data])

  // globalCats ist absteigend sortiert, also ist alles ab dem ersten kleinen Segment klein:
  // die Rest-Gruppe liegt zusammenhaengend am rechten Bandende.
  const cut = cats.findIndex((c) => c.share < INNER_LABEL_MIN)
  const firstSmall = cut < 0 ? cats.length : cut
  const labelled = cats.slice(0, firstSmall)
  const rest = cats.slice(firstSmall)
  const restShare = rest.reduce((s, c) => s + c.share, 0)
  const maxShare = Math.max(...cats.map((c) => c.share))
  const other = cats[0] // "Sonstiges" steht am gemeinsamen Nullpunkt, siehe Kommentar unten

  // AUFHAENGER: eine Zahl, die den Durchschnitt widerlegt, den das Band gerade gezeigt hat.
  // Alles zur Laufzeit gerechnet, kein getippter Wert.
  const spread = useMemo(() => {
    const vals = countries
      .map((c) => ({ name: shortName(c.country), v: catPct(c, SPREAD_CAT) }))
      .sort((a, b) => b.v - a.v)
    return {
      top: vals[0],
      home: vals.find((x) => x.name === HOME) ?? vals[Math.floor(vals.length / 2)],
      // cats[] im Datensatz ist ganzzahlig gerundet: ein fehlender Eintrag heisst "unter 0,5 %",
      // nicht "exakt null". Der Satz unten sagt genau das und nicht mehr.
      zeros: vals.filter((x) => x.v === 0).length,
      world: cats.find((c) => c.cat === SPREAD_CAT)?.pct ?? 0,
    }
  }, [countries, cats])

  const first = data.months[0]?.month ?? ''
  const last = data.months[data.months.length - 1]?.month ?? ''
  // Die Zahl im Schalter-Hinweis kommt aus den Daten, nicht aus dem Fliesstext.
  const docCount = countries.reduce((s, c) => s + (c.samples?.length || 0) + (c.graySamples?.length || 0), 0)

  return (
    <>
      <div className="useov-head">
        <p className="kicker" style={{ marginBottom: 'var(--s-4)' }}>Akt 4 · Das Gespräch</p>
        {/* Die FRAGE des Akts, nicht seine Schlussfolgerung. Die Schlussfolgerung
            ("Zwei von 53 Ländern tragen die Korrelation") ist erst nach dem Register lesbar
            und steht deshalb dort. */}
        <h2 className="t-display-l" style={{ margin: 0 }}>
          Wofür redet die Welt mit der <span style={{ color: PAL.machine }}>Maschine?</span>
        </h2>
      </div>

      {band ? (
        <div className="useov-bar">
          {/* Das Band: 9 Segmente, Summe 100 %. Reihenfolge = globaler Rang, "Sonstiges" links
              am gemeinsamen Nullpunkt und schraffiert (dieselbe 6-px-Schraffur wie im Register,
              drawSheet.makeHatch): Unsicherheit gehoert in die Tinte, nicht in die Fussnote. */}
          {/* Jedes Segment ist eine SCHALTFLAECHE: ein Klick oeffnet das Register und stellt die
              Wofuer-Spalte auf genau diese Kategorie um (Yi: select + reconfigure in einem Zug).
              Damit ist das Band nicht nur eine Uebersicht, sondern der Einstieg in die Analyse.
              role="group" statt role="img", weil hier jetzt bedienbare Elemente liegen; die
              Gesamtaussage des Bandes traegt das aria-label der Gruppe. */}
          <div className="useov-band" role="group" aria-label={bandLabel(cats)}>
            {cats.map((c) => (
              <button
                key={c.cat}
                type="button"
                className="useov-seg"
                style={{ flexGrow: c.share, background: c.cat === other.cat ? hatch(c.color) : c.color }}
                onClick={(e) => onPickCat?.(c.cat, e.currentTarget)}
                title={`${c.cat}: ${fmtDE(c.pct, 1)} %. Im Register nach dieser Kategorie ordnen.`}
                aria-label={`${c.cat}, ${fmtDE(c.pct, 1)} Prozent. Register öffnen und nach dieser Kategorie ordnen.`}
              />
            ))}
          </div>

          {/* Labelzeile: dieselben Flex-Anteile wie das Band, also sitzt jedes Label exakt unter
              seinem Segment. Die 2-px-Regel in Segmentfarbe ist die Bindung zwischen Mark und
              Label, sie ersetzt die Legende. */}
          <div className="useov-labels" aria-hidden="true">
            {labelled.map((c) => (
              <span key={c.cat} className="useov-label" style={{ flexGrow: c.share, borderTopColor: c.color }}>
                <span className="display useov-label-pct">{fmtDE(c.pct, 1)} %</span>
                <span className="useov-label-cat">{c.cat}</span>
              </span>
            ))}
            <span className="useov-label useov-label--rest" style={{ flexGrow: restShare }} />
          </div>

          {/* Bedienung getrennt vom Befund und direkt an der Marke, die sie meint. */}
          <p className="useov-pickhint">
            <span aria-hidden="true">↳</span> Klick auf ein Segment öffnet das Register, nach dieser Kategorie geordnet.
          </p>

          <div className="useov-tags">
            <p className="useov-tag">{otherSentence(other)}</p>
            <p className="useov-tag useov-tag--end">
              <span className="useov-tag-lead">die letzten {fmtDE(restShare, 1)} %</span>
              {rest.map((c) => (
                <span key={c.cat} className="useov-chip">
                  <span aria-hidden="true" className="useov-swatch" style={{ background: c.color }} />
                  {c.cat} {fmtDE(c.pct, 1)} %
                </span>
              ))}
            </p>
          </div>
        </div>
      ) : (
        <div className="useov-bar">
          {/* Schmaler Viewport: dieselbe Aufteilung als Zeilenliste. Balken auf das groesste
              Segment skaliert, damit die kleinen Kategorien ueberhaupt eine Marke haben; der
              Prozentwert steht in jeder Zeile daneben, die Skala luegt also nicht. */}
          <ul className="useov-rows">
            {cats.map((c) => (
              <li key={c.cat} className="useov-row">
                <button
                  type="button"
                  className="useov-row-btn"
                  onClick={(e) => onPickCat?.(c.cat, e.currentTarget)}
                  aria-label={`${c.cat}, ${fmtDE(c.pct, 1)} Prozent. Register öffnen und nach dieser Kategorie ordnen.`}
                >
                <span className="useov-row-cat">{c.cat}</span>
                <span className="useov-row-track">
                  <span
                    className="useov-row-bar"
                    style={{
                      width: `${(c.share / maxShare) * 100}%`,
                      background: c.cat === other.cat ? hatch(c.color) : c.color,
                    }}
                  />
                </span>
                <span className="useov-row-pct mono">{fmtDE(c.pct, 1)} %</span>
                </button>
              </li>
            ))}
          </ul>
          <p className="useov-tag">{otherSentence(other)}</p>
        </div>
      )}

      <div className="useov-text">
        {/* EIN Satz Datenkontext, in Prosa. Alle Zahlen zur Laufzeit aus wildchat.json. */}
        <p className="t-body" style={{ color: PAL.muted, margin: 0 }}>
          Grundlage ist WildChat-1M: {fmtDE(data.total)} echte Gespräche zwischen Menschen und
          Chat-Systemen aus dem Zeitraum {first} bis {last}, von denen {fmtDE(data.coveredByCentroid)} einem
          von {countries.length} Ländern zugeordnet sind; die Themen stammen aus einer Stichwort-Heuristik,
          nicht aus einer Handkodierung.
        </p>
        {/* AUFHAENGER: der Durchschnitt, den das Band zeigt, gilt fuer kein einzelnes Land.
            Das ist die Bruecke zur zweiten Ebene, und sie ist eine Zahl, keine Ankuendigung. */}
        <p className="t-body" style={{ margin: 0 }}>
          Nur gilt dieser Durchschnitt für kein einzelnes Land. {SPREAD_CAT} steht global
          bei {fmtDE(spread.world, 1)} %, in {spread.top.name} bei {fmtDE(spread.top.v, 0)} %,
          in {spread.home.name} bei {fmtDE(spread.home.v, 0)} % und
          in {spread.zeros} von {countries.length} Ländern unter einem halben Prozent.
        </p>
      </div>

      <div className="useov-switch">
        <button
          type="button"
          ref={buttonRef}
          className={`ledger-open-btn${detailOpen ? ' ledger-open-btn--open' : ''}`}
          aria-expanded={detailOpen}
          aria-controls="wildchat-register"
          onClick={onToggleDetail}
        >
          {detailOpen
            ? `Register schließen`
            : `Alle ${countries.length} Länder im Detail: das Register öffnen`}
        </button>
        <span className="mono useov-switch-hint">
          Dahinter liegt eine Zeile je Land: wie viel dort gesprochen wurde, wofür, wie oft es grenzwertig
          wurde. Nach jeder Spalte sortierbar, und {fmtDE(docCount)} Gespräche kann man einzeln lesen.
        </span>
      </div>
    </>
  )
}

/**
 * CSS-Gegenstueck zur 6-px-Schraffur des Registers (drawSheet.makeHatch, EchoRow echoHatch):
 * harte Farbstopps, also Textur und kein Flaechenverlauf. Der Abstand 4,24 px ist 6 / Wurzel 2,
 * damit die Streifen in beiden Techniken denselben senkrechten Abstand haben.
 */
const hatch = (color) => `repeating-linear-gradient(-45deg, rgba(11,10,12,0.85) 0 1.4px, ${color} 1.4px 4.24px)`

/** Ein Satz zu "Sonstiges": ein Befund ueber die Heuristik, keine Luecke in den Daten. */
const otherSentence = (other) => `Das größte Segment ist ein Eingeständnis: ${fmtDE(other.pct, 1)} % `
  + 'der Gespräche lassen sich von der Heuristik keiner Kategorie eindeutig zuordnen.'

/** Screenreader-Text des Bandes: dieselben Werte, in derselben Reihenfolge, als Satz. */
const bandLabel = (cats) => 'Aufteilung aller Gespräche auf neun Nutzungs-Kategorien: '
  + cats.map((c) => `${c.cat} ${fmtDE(c.pct, 1)} Prozent`).join(', ')
