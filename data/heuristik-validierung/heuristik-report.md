# Heuristik-Validierung (Algorithm-Level, Nested Model)

Stichprobe n=400 (seed=11, stratifiziert je Heuristik-Kategorie, Pool=19921, BLOCK-Ausschluss=157 = 0.79%).

- Accuracy: **0.555**
- Cohen's Kappa: **0.4955**
- Macro-F1: **0.5279**

## Precision / Recall / F1 je Kategorie

| Kategorie | Precision | Recall | F1 | Support (LLM-Annotator) |
| --- | --- | --- | --- | --- |
| Bild-Prompts | 0.9787 | 0.9583 | 0.9684 | 48 |
| Mathe/Logik | 0.234 | 0.5238 | 0.3235 | 21 |
| Programmieren | 0.5625 | 0.5094 | 0.5347 | 53 |
| Ratschlag | 0.2105 | 0.5714 | 0.3077 | 7 |
| Rollenspiel/Story | 0.375 | 0.45 | 0.4091 | 40 |
| Schreiben/Text | 0.7292 | 0.3933 | 0.5109 | 89 |
| Sonstiges | 0.3333 | 0.5333 | 0.4103 | 30 |
| Wissen/Erklären | 0.5833 | 0.4242 | 0.4912 | 66 |
| Übersetzen | 0.7872 | 0.8043 | 0.7957 | 46 |

## Konfusionsmatrix (Zeilen = LLM-Annotator, Spalten = Heuristik)

| true \ pred | Bild-Prompts | Mathe/Logik | Programmieren | Ratschlag | Rollenspiel/Story | Schreiben/Text | Sonstiges | Wissen/Erklären | Übersetzen |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Bild-Prompts | 46 | 1 | 0 | 0 | 0 | 0 | 1 | 0 | 0 |
| Mathe/Logik | 0 | 11 | 0 | 1 | 1 | 0 | 2 | 5 | 1 |
| Programmieren | 1 | 7 | 27 | 2 | 4 | 2 | 5 | 5 | 0 |
| Ratschlag | 0 | 0 | 0 | 4 | 0 | 1 | 0 | 2 | 0 |
| Rollenspiel/Story | 0 | 2 | 3 | 0 | 18 | 6 | 7 | 2 | 2 |
| Schreiben/Text | 0 | 10 | 9 | 7 | 17 | 35 | 6 | 3 | 2 |
| Sonstiges | 0 | 5 | 2 | 2 | 1 | 1 | 16 | 2 | 1 |
| Wissen/Erklären | 0 | 10 | 5 | 3 | 3 | 3 | 10 | 28 | 4 |
| Übersetzen | 0 | 1 | 2 | 0 | 4 | 0 | 1 | 1 | 37 |
