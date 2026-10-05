import { Reveal, ScrollProgress, SourceNote } from './components/Motion'
import HeroField from './components/HeroField'
import ActIntro from './components/ActIntro'
import ComputeExplosion from './components/ComputeExplosion'
import MapOfAI from './components/MapOfAI'
import FamilyTree from './components/FamilyTree'
import ConversationLedger from './components/ConversationLedger'
import Interlude from './components/Interlude'
import SpotTheMachine from './components/SpotTheMachine'
import { PAL } from './theme'

// Dramaturgie: jede Visualisierung bekommt eine szenische HERLEITUNG (ActIntro, Interlude-Stil),
// dann folgt der Chart mit Luft. Vor dem Finale uebernimmt das Interlude diese Rolle.
export default function App() {
  return (
    <main className="relative z-[2]">
      <ScrollProgress />
      <Hero />
      <ActIntro num="1" kicker="Akt 1 · Der Aufstieg" title="Die Explosion der Rechenleistung."
        lead="Am Anfang war ein Modell ein Experiment auf einem einzelnen Rechner. Heute verschlingt ein einziger Trainingslauf das Rechenbudget einer Kleinstadt. Wie schnell ist das eskaliert?" />
      <ComputeExplosion />
      <ActIntro num="2" kicker="Akt 2 · Das Wissen" title="Die Landkarte der KI-Forschung."
        lead="Hinter jedem Modell steht Forschung: fast eine halbe Million Paper in zwanzig Jahren. Woran wird eigentlich gearbeitet, und wo explodiert das Wissen gerade?" />
      <MapOfAI />
      <ActIntro num="3" kicker="Akt 3 · Der Stammbaum" title="Modelle, die Modelle gebären."
        lead="Ein veröffentlichtes Modell bleibt selten allein. Es wird kopiert, verfeinert, quantisiert, verschmolzen, und jede Ableitung ist selbst ein Modell. Was dabei entsteht, sieht aus wie ein Sternenhimmel." />
      <FamilyTree />
      <ActIntro num="4" kicker="Akt 4 · Das Gespräch" title="Wie die Welt mit KI redet."
        lead="837.989 echte Gespräche mit der Maschine wurden gespendet, anonym, ungefiltert. Gezählt sind Gespräche, nicht Personen: hinter ihnen stehen deutlich weniger Menschen. Zum ersten Mal lässt sich zusehen, wofür die Welt diese Systeme wirklich benutzt." />
      <ConversationLedger />
      <Interlude />
      <SpotTheMachine />
      <Footer />
    </main>
  )
}

function Hero() {
  return (
    <header className="act" style={{ justifyContent: 'center' }}>
      {/* Sternenfeld hinter der Typo: Galaxie-Motiv von Akt 3 als visuelle Plattform ab Sekunde 1 */}
      <HeroField />
      <div className="layout-container" style={{ position: 'relative', zIndex: 1 }}>
        <div className="editorial-grid">
          <div style={{ gridColumn: '1 / -1' }}>
            <Reveal><p className="kicker" style={{ marginBottom: 'var(--s-6)' }}>Eine Datenstory über künstliche Intelligenz · DAISY, HSD</p></Reveal>
            <Reveal delay={0.1}>
              {/* t-display-xl deckt Schriftfamilie/Groesse/Zeilenhoehe/Letter-Spacing ab */}
              <h1 className="t-display-xl" style={{ margin: 0 }}>
                Inside the<br /><span style={{ color: PAL.machine }}>Machine</span>
              </h1>
            </Reveal>
            <Reveal delay={0.25}>
              {/* Lead-Satz: t-lead deckt Groesse/Zeilenhoehe ab */}
              <p className="t-lead" style={{ color: PAL.muted, marginTop: 'var(--s-8)', maxWidth: '40ch' }}>
                Die künstliche Intelligenz vermisst sich selbst. Wie sie wuchs, was sie weiß, wie ihre Modelle
                sich vererben, wie die Welt mit ihr spricht, und ob du sie noch vom Menschen unterscheidest.
              </p>
            </Reveal>
            <Reveal delay={0.4}>
              <p className="kicker" style={{ marginTop: 'var(--s-16)', opacity: 0.6 }}>↓ Scrollen</p>
            </Reveal>
          </div>
        </div>
      </div>
    </header>
  )
}

function Footer() {
  return (
    <footer style={{ borderTop: `1px solid ${PAL.hairline}`, paddingBlock: 'var(--s-20)' }}>
      <div className="layout-container">
        <div className="editorial-grid">
          {/* Eingeklappt wie jeder andere Nachweis der Story: die Angaben sind Pflicht und muessen
              auffindbar bleiben, brauchen aber keinen Dauerplatz am Seitenende. Gleiches Muster,
              gleiche Bedienung (natives details), damit der Leser es nicht neu lernen muss. */}
          <SourceNote label="Quellen und Methode">
            Daten: Epoch AI (Notable AI Models), Hugging Face (Modellkarten), arXiv, WildChat-1M (Allen AI),
            HC3 und Wikimedia Commons (CC0-Fotos). Abruf 2026-07. Visualisierung: bespoke D3/Canvas + SVG, Scrollytelling React.
            Inside the Machine · HSD Visual Analytics 2026.
          </SourceNote>
        </div>
      </div>
    </footer>
  )
}
