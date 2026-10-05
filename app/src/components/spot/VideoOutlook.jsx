import { PAL } from '../../theme'
import { SourceNote } from '../Motion'
import DetectionRates from './DetectionRates'
import ToolAge from './ToolAge'

// DER ABSCHLUSS DER STORY. Er folgt auf das Quiz-Ergebnis und beantwortet die Frage, die das
// Quiz offen laesst: taugt ein gelerntes Erkennungsmerkmal ueberhaupt?
//
// DIE ENTSCHEIDUNG: keine Merkmals-Checkliste. Nicht aus Geschmack, sondern weil es dazu eine
// Messung gibt - Erkennungstipps hoben die Trefferquote von 59,7 auf 64,2 % und liessen jedes
// fuenfte Urteil unter dem Zufall (Bray et al. 2023, n = 280). Eine Liste waere also nicht nur
// schnell veraltet, sie hilft von Anfang an kaum.
//
// KORREKTUR AN DER EIGENEN ERSTEN THESE, hier festgehalten, weil sie die Argumentation traegt:
// der erste Entwurf behauptete, Merkmale wuerden von Modellgeneration zu Modellgeneration
// unbrauchbar. Dafuer gibt es keine Studie, die dieselbe Aufgabe ueber Generatoren hinweg
// wiederholt, und die vorhandenen Zahlen zeigen sogar in die andere Richtung. Der Abschluss
// behauptet deshalb NICHT, dass Merkmale verfallen. Er zeigt, dass die Trefferquote an Generator,
// Motiv und Betrachtungszeit haengt, dass beim Video das letzte einfache Merkmal weg ist, und
// dass die Alternative (Herkunft) technisch noch nicht traegt.
//
// Die eigene Zahl, die den Abschluss traegt, ist ein Querschnitt und keine Zeitreihe; die
// Begruendung dafuer steht in ReleaseMass.jsx und in der eingeklappten Quellen-Notiz.

const fmtDE = (n, d = 0) => n.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d })
const MIO = 1e6
const MONTH_DE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember']
const monthName = (m) => `${MONTH_DE[parseInt(m.slice(5), 10) - 1]} ${m.slice(0, 4)}`
/** Monate zwischen zwei YYYY-MM, fuer "am Datenstand hoechstens N Monate alt". */
const monthsBetween = (a, b) => (parseInt(b.slice(0, 4), 10) - parseInt(a.slice(0, 4), 10)) * 12
  + (parseInt(b.slice(5), 10) - parseInt(a.slice(5), 10))

/**
 * Abschnittsmarke im Ton des Registers (Akt 4): Label, Hairline, rechts das Detail.
 *
 * flexWrap ist hier nicht Kosmetik: das Detail ist ein Datenstand und darf nicht gekuerzt werden.
 * Bei 390 px Fensterbreite lief "Zensus vom 24.06.2026" 2 px ueber die Viewportkante (gemessen).
 * Mit Umbruch rutscht es auf eine eigene Zeile, statt abgeschnitten zu werden oder die Seite
 * horizontal scrollen zu lassen.
 */
function head(label, detail) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0 var(--s-3)', marginBottom: 'var(--s-3)' }}>
      <span className="t-label" style={{ color: PAL.muted, whiteSpace: 'nowrap' }}>{label}</span>
      <span style={{ height: 1, flex: 1, minWidth: '2ch', background: 'rgba(214,64,159,0.22)' }} />
      {detail && (
        <span className="mono" style={{ color: PAL.muted, fontSize: '0.62rem', whiteSpace: 'nowrap' }}>{detail}</span>
      )}
    </div>
  )
}

export default function VideoOutlook({ v, tellHuman, tellAI, imageTell, detectionCaption, videoText, ageLead, provenance, closing, sources }) {
  if (!v) return null
  const lastMonth = v.months[v.months.length - 1].m
  const alterMonate = monthsBetween(v.halfMonth, lastMonth)
  const sens3 = (v.halfSensitivity || []).find((s) => s.f === 3)
  const tellPct = Math.round((tellAI / tellHuman - 1) * 100)

  return (
    <div style={{ gridColumn: '1 / -1', marginTop: 'var(--s-10)' }}>
      {/* ZWEI SPALTEN, ein Nullpunkt der Argumentation: was Text verraet, was Bilder verraten.
          Nebeneinander, damit der Vergleich die Arbeit macht und nicht der Fliesstext. */}
      <div className="spot-tells">
        <section>
          {head('Beim Text', 'HC3, alle Antworten')}
          <p className="t-body" style={{ color: PAL.muted, margin: '0 0 var(--s-4)', maxWidth: '46ch' }}>
            Der verlässlichste Hinweis ist die Länge. ChatGPT antwortet im Schnitt
            {' '}<span className="mono" style={{ color: PAL.text }}>{fmtDE(tellAI)}</span> Zeichen lang, der Mensch
            {' '}<span className="mono" style={{ color: PAL.text }}>{fmtDE(tellHuman)}</span>.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-3)' }}>
            <span className="t-data" style={{ width: 70, color: PAL.human, flex: '0 0 auto' }}>Mensch</span>
            <div style={{ height: 18, borderRadius: 3, background: PAL.human, width: `${(tellHuman / tellAI) * 100}%` }} />
            <span className="t-data" style={{ color: PAL.muted }}>{fmtDE(tellHuman)}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-3)', marginTop: 'var(--s-2)' }}>
            <span className="t-data" style={{ width: 70, color: PAL.machine, flex: '0 0 auto' }}>ChatGPT</span>
            <div style={{ height: 18, borderRadius: 3, background: PAL.machine, width: '100%' }} />
            <span className="t-data" style={{ color: PAL.muted }}>{fmtDE(tellAI)}</span>
            <span className="mono" style={{ color: PAL.machine, fontSize: '0.78rem', fontWeight: 600, whiteSpace: 'nowrap' }}>+{tellPct} %</span>
          </div>
        </section>

        <section>
          {head('Beim Bild', imageTell.detail)}
          {imageTell.paragraphs.map((t, k) => (
            <p key={k} className="t-body" style={{ color: PAL.muted, margin: k ? 'var(--s-3) 0 0' : 0, maxWidth: '46ch' }}>{t}</p>
          ))}
        </section>
      </div>

      {/* ERSTE GRAFIK: die Forschungslage als Bild statt als drei Absaetze. Sie steht ueber die
          volle Breite, weil sieben Studien auf gemeinsamer Skala genau davon leben. */}
      <div style={{ marginTop: 'var(--s-6)' }}>
        <DetectionRates />
        <p className="mono" style={{ color: PAL.muted, fontSize: '10px', lineHeight: 1.7, margin: 'var(--s-3) 0 0' }}>
          {detectionCaption}
        </p>
      </div>

      {/* DER ABSCHLUSS: nicht "woran erkennt man es", sondern "wie lange haelt ein Merkmal". */}
      <div style={{ marginTop: 'var(--s-10)' }}>
        {head('Und als nächstes: Video', `Zensus vom ${v.asOf.split('-').reverse().join('.')}`)}
        <div className="spot-outlook">
          <div>
            {videoText.map((t, k) => (
              <p key={k} className="t-body" style={{ color: PAL.muted, margin: k ? 'var(--s-3) 0 0' : 0 }}>{t}</p>
            ))}
          </div>
          {/* Die eigene Messung, in einem Block: Zahl gross, Bedeutung klein darunter. */}
          <aside style={{ borderLeft: `1px solid ${PAL.hairline}`, paddingLeft: 'var(--s-5)' }}>
            <p className="display" style={{ fontSize: 'clamp(2.4rem, 4.4vw, 3.4rem)', lineHeight: 1, color: PAL.text, margin: 0 }}>
              {fmtDE(v.n)}
            </p>
            <p className="t-data" style={{ color: PAL.muted, margin: 'var(--s-2) 0 0' }}>
              der {fmtDE(v.modelsTotal)} Modelle im Zensus erzeugen Video
            </p>
            <p className="t-display-s" style={{ color: PAL.text, margin: 'var(--s-5) 0 0' }}>
              {alterMonate} Monate
            </p>
            <p className="t-data" style={{ color: PAL.muted, margin: 'var(--s-2) 0 0' }}>
              so alt ist das Modell, auf dem die halbe Nutzung liegt
            </p>
          </aside>
        </div>

        <p className="t-body" style={{ color: PAL.text, margin: 'var(--s-6) 0 0', maxWidth: '58ch' }}>{ageLead}</p>

        <ToolAge v={v} />

        <p className="mono" style={{ color: PAL.muted, fontSize: '10px', lineHeight: 1.7, margin: 'var(--s-4) 0 0' }}>
          Gerechnet am Datenstand {v.asOf.split('-').reverse().join('.')}. Downloads sind
          Lebenszeit-Zähler der vorhandenen Modelle, sie messen Abrufe, nicht Personen und nicht
          erzeugte Videos; {fmtDE(v.top4Pct, 1)} % von ihnen liegen auf vier Modellen.
          {' '}Bewusst keine Kurve „neue Modelle je Monat“: der Zensus erfasst
          {' '}{fmtDE(v.coverage.before2025)} Modelle von vor 2025, aber {fmtDE(v.coverage.from2025)} ab 2025,
          eine solche Kurve wäre Erfassungsdichte und kein Wachstum.
          {sens3 && <> Rechnet man die vor {monthName(v.biasCut)} erschienenen Modelle absichtlich dreifach
            hoch, um die dünnere Alt-Erfassung auszugleichen, rutscht die halbe Masse nur von
            {' '}{monthName(v.halfMonth)} auf {monthName(sens3.m)}.</>}
        </p>

        {/* Was statt des Merkmals bleibt - und im selben Block die Gegenevidenz, damit die
            Kennzeichnungspflicht nicht als Loesung liest, die die Quellen nicht hergeben. */}
        <div className="spot-prov">
          {provenance.map((t, k) => (
            <p key={k} className="t-body" style={{ color: k ? PAL.muted : PAL.text, margin: 0 }}>{t}</p>
          ))}
        </div>

        <p className="t-body" style={{ color: PAL.text, margin: 'var(--s-8) 0 0', maxWidth: '52ch' }}>{closing}</p>

        <SourceNote className="prose" label="Quellen und Methode des Abschlusses">
          {sources}
        </SourceNote>
      </div>
    </div>
  )
}
