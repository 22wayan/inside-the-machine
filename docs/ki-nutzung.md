# Dokumentation der KI-Nutzung

## Abgrenzung

Die technische Umsetzung von **„Inside the Machine“** erfolgte in weiten Teilen
KI-gestützt. Claude Code und Codex wurden als Coding-, Review- und
Recherchewerkzeuge eingesetzt. Die Leitfrage, der Fünf-Akte-Erzählbogen, die
Auswahl und Gewichtung der Datenquellen, die inhaltliche Kritik an Zwischenständen,
die finalen Designentscheidungen sowie Abnahme und Präsentation verantwortet
Wayan Schmidt.

KI-Unterstützung umfasste insbesondere:

- Entwürfe und Iterationen des React-/Canvas-/SVG-Codes sowie der Python-/DuckDB-Pipelines,
- Vorschläge für Interaktionen, Textkürzungen und visuelle Varianten,
- Unit-, Browser- und Layout-Tests sowie reproduzierbare Build-Skripte,
- Recherchehilfe bei Literatur, Datenlizenzen und Quellenmetadaten,
- sprachliche und strukturelle Überarbeitung des Short Papers.

KI-Ausgaben wurden nicht ungeprüft als Datenbefunde übernommen. Tragende
Kennzahlen wurden aus den gebauten JSON-Dateien neu berechnet, in Tests
festgeschrieben oder gegen die jeweilige Primärquelle geprüft. Die
Klartext-Stichprobe zur WildChat-Heuristik bleibt lokal; die Abgabe enthält nur
anonyme Labels und Aggregate.

## Arbeitsphasen

| Zeitraum | KI-gestützte Arbeit | Entscheidung und Kontrolle durch den Bearbeiter |
|---|---|---|
| 25.06.–02.07.2026 | Datenexploration, erste Pipelines und fünf Visualisierungsakte | Thema, Leitfrage, Datensätze, Story-Reihenfolge und Qualitätskriterien festgelegt |
| 03.07.–16.07.2026 | iterative Implementierung, Interaktionen, Quellen- und Lizenzprüfung | Zwischenstände verworfen oder umgebaut; Kursfeedback in konkrete Änderungen übersetzt |
| 17.07.–26.07.2026 | Neugestaltung von Akt 4 als analytisches Register, Heuristik-Validierung, Tests | Metriken, Schwellenwert, Darstellungslogik und Limitationen geprüft und begründet |
| 27.07.2026 | Kohärenzprüfung, Paper-Überarbeitung, Packaging und Schlussverifikation | finale Auswahl, Freigabe und Abgabevorbereitung |

## Synthetische Assets

Die drei als KI-Bilder verwendeten Quizmotive
`ai_library_v2.png`, `ai_platform_v2.png` und `ai_cafeteria_v2.png`
wurden am 16.07.2026 mit der in Codex integrierten Bildgenerierung erzeugt und
anschließend bewusst ausgewählt. Sie sind in der App als synthetische Klasse
geführt; die übrigen Quizfotos stammen aus der in `data/QUELLEN.md`
dokumentierten Quelle.

## Verifikation

Der finale Quellstand wird mit 160 Unit-/Komponententests, Produktionsbuild,
E2E-Smoke-Test, Interaktionsprüfung und Desktop-/Mobile-Scroll-Sweep geprüft.
Das PDF wird reproduzierbar als A4-Dokument mit 11 pt, doppeltem
Zeilenabstand und 2,5-cm-Rändern erzeugt; der Export bricht bei mehr als fünf
Seiten ab.

Das frühere automatisch erzeugte Video ist nicht Bestandteil dieser Abgabe.
Das finale Screenrecording erstellt der Bearbeiter selbst.

