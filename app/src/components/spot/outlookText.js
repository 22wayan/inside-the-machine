// Der TEXT des Abschlusses, getrennt von seiner Darstellung.
//
// Warum eine eigene Datei: dieser Text traegt FREMDE Zahlen. Sie muessen pruefbar bleiben, ohne
// durch JSX zu lesen. outlook.test.jsx prueft die Saetze hier direkt (keine Gedankenstriche, kein
// Merkmals-Rezept, jede Zahl mit Quellenkuerzel), und OUTLOOK_SOURCES nennt zu jeder Zahl die
// vollstaendige Quelle.
//
// EIGENE ZAHLEN (aus spot.json, selbst gerechnet) stehen NICHT hier, sondern werden in
// VideoOutlook.jsx aus den Daten formatiert. So kann kein Wert im Fliesstext veralten.
//
// DIE THESE WURDE WAEHREND DER RECHERCHE KORRIGIERT. Der erste Entwurf behauptete, Merkmale
// wuerden von Modellgeneration zu Modellgeneration unbrauchbar. Das ist NICHT belegbar: es gibt
// keine Studie, die dieselbe Aufgabe ueber Generatoren hinweg wiederholt, und die verfuegbaren
// Zahlen zeigen sogar in die andere Richtung (48,2 % bei GAN-Portraits gegen 74 bis 76 % bei
// Diffusions-Szenen), nur mit unvergleichbaren Reizen. Der belegbare Befund ist ein anderer und
// staerkerer: eine MERKMALSLISTE HILFT MESSBAR NICHT (der Unterschied zwischen Tipps und keinen
// Tipps ist bei Bray et al. 2023 statistisch nicht signifikant), und was die Trefferquote steuert,
// sind Generator, Motiv und Betrachtungszeit, nicht ein Fortschrittspfeil.
//
// JEDE fremde Zahl in dieser Datei wurde einzeln an der Originalquelle nachgeprueft (11 Quellen,
// je ein eigener Pruefdurchgang). Ergebnis: 10 bestaetigt, 1 korrigiert - bei Sora 2 standen
// "lippensynchron" und "in einem Durchgang" NICHT in der System Card und sind gestrichen.

/**
 * Was Bilder verraten. Zuerst das Eingestaendnis: fuer Bilder hat diese Arbeit keine eigene
 * Kennzahl, die neben der HC3-Laenge stehen koennte. Dann, warum eine Liste nicht die Loesung ist.
 */
export const IMAGE_TELL = {
  detail: 'Forschungslage, nicht eigene Messung',
  paragraphs: [
    'Hier steht keine eigene Zahl. Für Bilder hat diese Arbeit kein Merkmal gemessen, das neben '
    + 'einer Zeichenzahl stehen könnte. Die Forschung hat es versucht, und zwar so:',
  ],
}

/** Bildunterschrift der Trefferquoten-Grafik. Ein Satz Befund, ein Satz Vorbehalt. */
export const DETECTION_CAPTION = 'Sieben kontrollierte Studien auf gemeinsamer Skala. Die Quote '
  + 'folgt keinem Fortschrittspfeil, sondern Generator, Motiv und Betrachtungszeit: Erkennungstipps '
  + 'heben sie nicht signifikant, zwanzig statt einer Sekunde heben sie um zehn Punkte. Die Reize '
  + 'sind nicht untereinander vergleichbar, die Werte stehen deshalb nebeneinander und nicht in '
  + 'einer Reihenfolge.'

/** Der Übergang vom Standbild zum Bewegtbild. Die eigenen Zahlen kommen aus spot.json. */
export const VIDEO_TEXT = [
  'Bei Video gibt es nicht einmal mehr eine Zahl. Keine einzige Studie hat gemessen, wie gut '
  + 'Menschen die heutige Generation erkennen.',
  'Das letzte einfache Merkmal ist weg: Ton, der nicht zum Bild passt. Sora 2 erzeugt beides '
  + 'zusammen, seit dem 30. September 2025.',
  'Verlassen kann man sich also auf nichts, und teuer ist es längst: Arup verlor im Januar 2024 '
  + '25,6 Millionen US-Dollar an eine Videokonferenz mit gefälschten Kollegen.',
]

/**
 * Was statt des Merkmals bleibt, und warum das noch keine Loesung ist. Bewusst mit der
 * Gegenevidenz im selben Absatz: eine Kennzeichnungspflicht, deren Technik gebrochen ist, waere
 * sonst eine Beruhigung, die die Quellen nicht hergeben.
 */
export const PROVENANCE = [
  'Bleibt die Herkunft. Ab dem 2. August 2026 verlangt Artikel 50 der EU-KI-Verordnung eine '
  + 'maschinenlesbare Markierung.',
  'Bisher markieren 19 von 50 Bildgeneratoren, fünf von fünf Wasserzeichen-Verfahren sind '
  + 'gebrochen, ein Referenzbild genügt zum Fälschen. Eine fehlende Markierung beweist nichts.',
]

/** Der letzte Satz der Story. Ohne eigene Monatszahl: die steht im Kennzahlen-Block daneben. */
export const CLOSING = 'Ein Merkmal zu lernen heißt, ein Werkzeug zu lernen. Und die Werkzeuge sind '
  + 'jünger als das Wissen über sie. Die Frage, die bleibt, ist nicht, was man sieht, sondern '
  + 'woher es kommt.'

/** Überleitung zur Alters-Grafik: warum das Alter der Werkzeuge hier überhaupt zählt. */
export const AGE_LEAD = 'Ein Merkmal, das man heute lernt, gilt einem bestimmten Werkzeug. Wie lange '
  + 'hält das? Anteil aller Downloads nach Alter des Modells:'

/**
 * Quellen und Methode, eingeklappt. Regel: jede Zahl im Abschnitt muss hier mit Autor, Jahr und
 * Publikationsorgan auffindbar sein, und jede Einschraenkung, die die Aussage begrenzt, steht dabei.
 */
export const OUTLOOK_SOURCES = 'Eigene Auswertung: librarian-bots/model_cards_with_metadata '
  + '(Hugging Face, keine Lizenzangabe, Datenstand 24. Juni 2026), derselbe Bestand, aus dem Akt 3 '
  + 'gebaut ist. Als Video-Modelle gelten die pipeline_tags text-to-video, image-to-video, '
  + 'video-to-video und image-text-to-video. Gezeigt wird die Download-Masse nach Erscheinungsmonat, '
  + 'nicht die Zahl neuer Modelle je Monat: der Bestand erfasst die Jahre bis 2024 deutlich dünner '
  + 'als 2025 und 2026, eine Kurve daraus wäre Erfassungsdichte statt Wachstum. Downloads sind '
  + 'Lebenszeit-Zähler der vorhandenen Modelle und messen Abrufe, nicht Personen und nicht erzeugte '
  + 'Videos; ältere Modelle können gelöscht worden sein, deshalb ist der Median zusätzlich gegen '
  + 'eine dreifache Hochrechnung der Altjahre geprüft. '
  + 'Menschliche Erkennungsleistung: Bray, Johnson und Kleinberg (2023), Journal of Cybersecurity '
  + '9(1) tyad011, n = 280, vier Bedingungen, Unterschied zwischen ihnen nicht signifikant '
  + '(F(3,276) = 1,95, p > 0,1); Köbis, Doležalová und Soraperra (2021), iScience '
  + '24(11) 103364, n = 210, weder Aufklärungstext noch Prämie verbesserten das Urteil '
  + '(F(2,207) = 0,276, p = 0,759); Kamali, Nakamura, Kumar, Chatzimparmpas, Hullman und Groh '
  + '(2025), ACM CHI 2025, n = 50.444; Diel, Lalgi, Schröter, MacDorman, Teufel und Bäuerle (2024), '
  + 'Computers in Human Behavior Reports 16, 100538, Metaanalyse über 56 Studien und 86.155 '
  + 'Teilnehmende, Video 57,31 % mit 95-%-Intervall 47,80 bis 66,57. '
  + 'Bewusst NICHT behauptet: dass Merkmale von Generation zu Generation unbrauchbar werden. Dafür '
  + 'gibt es keine Studie, die dieselbe Aufgabe über Generatoren hinweg wiederholt; die vorhandenen '
  + 'Werte (48,2 % bei GAN-Porträts, Nightingale und Farid 2022, PNAS 119(8), gegen 74 bis 76 % bei '
  + 'Diffusions-Szenen bei Kamali et al.) beruhen auf unvergleichbaren Reizen. '
  + 'Video: OpenAI, Sora 2 System Card vom 30. September 2025, dort wörtlich „video and audio '
  + 'generation model“ mit „synchronized audio“; die System Card enthält keine Messung der '
  + 'Ton-Bild-Synchronität, die Angabe ist reine Selbstauskunft. Arup-Fall: Summe und Ablauf nach '
  + 'Angaben der Hongkonger Polizei (South China Morning Post, 16. Mai 2024); Arup selbst bestätigte, '
  + 'dass gefälschte Stimmen und Bilder benutzt wurden (Fortune Europe, 17. Mai 2024), nicht aber '
  + 'weitere technische Details. '
  + 'Herkunft und Kennzeichnung: Verordnung (EU) 2024/1689, Artikel 50 Absatz 2 und Artikel 113, '
  + 'Geltung ab 2. August 2026, mit Ausnahmen unter anderem für künstlerische Werke; Rijsbosch, '
  + 'van Dijck und Kollnig (2025), arXiv-Preprint 2503.18156, 19 von 50 Generatoren markieren '
  + 'maschinenlesbar; Lukas, Diaa, Fenaux und Kerschbaum (2024), ICLR 2024, fünf von fünf Verfahren '
  + 'gebrochen; Müller, Lukovnikov, Thietke, Fischer und Quiring (2025), CVPR 2025, Fälschung aus '
  + 'einem Referenzbild.'

/**
 * DIE GEPRUEFTEN TREFFERQUOTEN, als Daten statt als Fliesstext.
 *
 * Jede Zeile ist eine kontrollierte Studie, jede Zahl einzeln an der Originalquelle nachgeprueft
 * (siehe OUTLOOK_SOURCES). Auf EINER Skala nebeneinander zeigen sie, was drei Absaetze Prosa nur
 * behaupten konnten: die Quote streut von unter dem Zufall bis 82 %, und sie folgt keinem
 * Fortschrittspfeil, sondern Generator, Motiv und Betrachtungszeit.
 *
 * `paar` bindet zwei Zeilen zusammen, deren Vergleich das Argument traegt (mit/ohne Tipps,
 * 1 s/20 s). `chance` ist die Referenz: 50 % ist Raten.
 */
export const CHANCE = 50

export const DETECTION_RATES = [
  { label: 'GAN-Porträts', v: 48.2, n: 315, src: 'Nightingale und Farid 2022', modal: 'Bild' },
  { label: 'Video-Deepfakes, 56 Studien', v: 57.3, n: 86155, src: 'Diel et al. 2024', modal: 'Video' },
  { label: 'Deepfake-Videos, mit Aufklärung', v: 57.6, n: 210, src: 'Köbis et al. 2021', modal: 'Video' },
  { label: 'KI-Bilder, ohne Tipps', v: 59.7, n: 280, src: 'Bray et al. 2023', modal: 'Bild', paar: 'tipps' },
  { label: 'KI-Bilder, mit Tipps', v: 64.2, n: 280, src: 'Bray et al. 2023', modal: 'Bild', paar: 'tipps' },
  { label: 'KI-Bilder, 1 Sekunde Zeit', v: 72, n: 50444, src: 'Kamali et al. 2025', modal: 'Bild', paar: 'zeit' },
  { label: 'KI-Bilder, 20 Sekunden Zeit', v: 82, n: 50444, src: 'Kamali et al. 2025', modal: 'Bild', paar: 'zeit' },
]

/** Die zwei Vergleiche, die das Argument tragen. Beide Zahlen kommen aus DETECTION_RATES. */
export const DETECTION_PAIRS = [
  { key: 'tipps', text: 'Tipps heben die Quote um 4,5 Punkte, statistisch nicht signifikant.' },
  { key: 'zeit', text: 'Zeit hebt sie um 10 Punkte. Im Feed hat man die nicht.' },
]
