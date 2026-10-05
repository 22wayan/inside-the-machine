# Datenquellen, "Inside the Machine"

Vollständige Herkunft aller Daten, die in die App eingehen. Grundlage sind die Docstrings der
Skripte in diesem Ordner, `daten-raw/pull.log` sowie die Dateidaten der Rohdateien.

**Pfade im Abgabepaket:** Dieses Dokument verwendet die Pfade des Arbeits-Repositories.
Im gepackten Ordner entsprechen `daten/*.py` den Dateien unter `data/pipelines/`,
`app/public/data/` entspricht `project/quellcode/public/data/`, `daten/validation/`
entspricht `data/heuristik-validierung/`, und neu geladene Rohdaten landen unter
`data/daten-raw/`. Das Arbeitsprotokoll `projekt/ki-nutzung.md` wird im Paket als
kompakte Abgabefassung unter `supplemental/ki-nutzung.md` geführt. Die anonymisierten
Labels und Aggregate sind enthalten; die lokale Klartextdatei `sample.local.jsonl`
ausdrücklich nicht.

**Lesehilfe zu den Spalten:**
- *Abrufdatum* mit dem Zusatz **(Dateidatum)** ist aus der mtime der Rohdatei in `daten-raw/`
  abgeleitet, nicht aus einem protokollierten Abruf.
- *Lizenz* ist am 2026-07-26 auf der jeweiligen Datensatzseite geprüft. Der Eintrag **keine Lizenz
  auf der Datensatzkarte angegeben** heißt: die Karte führt weder ein `license`-Feld noch einen
  `license:`-Tag; das ist der geprüfte Befund, keine Vermutung. Die Zitationsempfehlungen der
  Anbieter stehen unten in einem eigenen Abschnitt.

## Primärquellen

| Datensatz | Quelle / URL | Lizenz (geprüft 2026-07-26) | Abrufdatum | Wofür im Projekt | Größe roh |
|---|---|---|---|---|---|
| Epoch AI, Data on AI Models (früher "Notable AI Models") | <https://epoch.ai/data/notable_ai_models.csv>, Datensatzseite <https://epoch.ai/data/ai-models> | **CC BY 4.0** ("free to use, distribute, and reproduce provided the source and authors are credited under the Creative Commons Attribution license"); Attribution ist Pflicht | 2026-06-25 (Dateidatum `daten-raw/epoch_notable_models.csv`) | Akt 1, Compute-Explosion (`epoch.json`, 528 Modelle) | 2,1 MB CSV |
| gfissore/arxiv-abstracts-2021 | <https://huggingface.co/datasets/gfissore/arxiv-abstracts-2021> | **CC0 1.0** (`cc0-1.0`, Datensatzkarte: "Creative Commons CC0 1.0 Universal Public Domain Dedication") | 2026-06-25 (`pull.log`, Dateidatum `daten-raw/hf/`) | Akt 2, Korpus 2007-2021 der Forschungslandkarte | 1,4 GB Parquet |
| arXiv OAI-PMH, Sets `cs` und `stat` | <https://oaipmh.arxiv.org/oai> (Harvest 2022-01 bis 2026-07, `fetch_arxiv_oai.py`) | **CC0 1.0 für die deskriptiven Metadaten** laut arXiv API Terms of Use (<https://info.arxiv.org/help/api/tou.html>). Volltexte/PDFs sind ausdrücklich nicht CC0, werden hier aber auch nicht geladen | 2026-07-11 (Dateidatum `daten-raw/arxiv_oai_2022plus.jsonl`) | Akt 2, Vollbestand 2022-2026 (318.907 Records) | 462 MB JSONL |
| arXiv Such-API (Alt-Pfad) | <http://export.arxiv.org/api/query> (`fetch_arxiv_recent.py`) | **CC0 1.0** für Metadaten, gleiche Terms of Use wie oben | 2026-06-25 (Dateidatum `daten-raw/arxiv_recent.json`) | ersetzt durch den OAI-Harvest, nur noch historisch | 10 MB JSON |
| OpenAlex Works | <https://api.openalex.org/works> (polite pool, `fetch_top_papers.py`) | **CC0** ("Our complete dataset is free under the CC0 license"), Doku: <https://developers.openalex.org/> | 2026-07-16 (Dateidaten `openalex_top.json`, `openalex_top_by_year.json`) | Akt 2, meistzitierte Paper je Feld und je Jahr | 74 KB + 1,5 MB JSON |
| librarian-bots/model_cards_with_metadata | <https://huggingface.co/datasets/librarian-bots/model_cards_with_metadata> | **keine Lizenz auf der Datensatzkarte angegeben** (kein `license`-Feld, kein `license:`-Tag, Stand 2026-07-26). Inhalt sind gescrapte Model Cards des Hub, die jeweils eigene Lizenzen tragen | 2026-06-25 (`pull.log`) | Akt 3, Modell-Lineage (528k `base_model`-Kanten) | 955 MB Parquet |
| allenai/WildChat-1M | <https://huggingface.co/datasets/allenai/WildChat-1M> | **ODC-BY** (`odc-by`). Die Karte vermerkt den rückwirkenden Wechsel von der AI2-ImpACT- auf die ODC-BY-Lizenz | 2026-06-25 (`pull.log`) | Akt 4, 837.989 Mensch-KI-Gespräche | 3,1 GB Parquet |
| Hello-SimpleAI/HC3 | <https://huggingface.co/datasets/Hello-SimpleAI/HC3> | **CC BY-SA 4.0** (`cc-by-sa-4.0`). ShareAlike wirkt weiter: die daraus gebaute `spot.json` ist ein abgeleitetes Werk und steht unter derselben Lizenz | 2026-06-25 (`pull.log`) | Akt 5, Mensch- gegen ChatGPT-Antwortpaare | 75 MB Parquet |
| Parveshiiii/AI-vs-Real | <https://huggingface.co/datasets/Parveshiiii/AI-vs-Real> | **MIT** (`mit`, auf der Karte bestätigt). Einschränkung: die Karte nennt keine Herkunft der Bilder, die MIT-Angabe des Uploaders lässt sich also nicht bis zur Bildquelle zurückverfolgen | 2026-06-25 (Commit-Datum der Bilder, kein Abruf protokolliert) | Akt 5, echte Fotos (`spot/real_*.jpg`) | 6 Bilder, 0,45 MB im Repo |
| Natural Earth, Admin 0 Countries 110m | <https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson> (Repo <https://github.com/nvkelso/natural-earth-vector>, Version 5.2.0-pre). Die lokale Datei ist byte-identisch mit dem Original (838.726 Bytes, SHA-256 `6866c877d39cba9c357620878839b336d569f8c662d3cfab4cb1dbe2d39c977f`). Das npm-Paket `world-atlas` scheidet aus: es liefert TopoJSON mit nur `id`/`name`, ohne `ADM0_A3`/`LABEL_X` | **Public Domain** (<https://www.naturalearthdata.com/about/terms-of-use/>: "All versions ... are in the public domain", Attribution nicht erforderlich) | 2026-06-25 (Commit-Datum `world-110m.geo.json`) | Akt 4, Länder-Zentroide für die Gitter-Anordnung | 839 KB GeoJSON, 177 Länder |
| dragonintelligence/CIFAKE-image-dataset | <https://huggingface.co/datasets/dragonintelligence/CIFAKE-image-dataset> | **keine Lizenz auf der Datensatzkarte angegeben** (README ohne Inhalt, kein `license`-Tag, Stand 2026-07-26). Unattribuierter Spiegel des CIFAKE-Datensatzes (Bird & Lotfi, arXiv:2303.14126); die Lizenz der Kaggle-Originalquelle war nicht verifizierbar und wird hier nicht geraten | 2026-06-25 (`pull.log`) | **wird nicht mehr verwendet**: 32x32-Bilder zugunsten von AI-vs-Real verworfen; `pull_all.py` zieht ihn weiterhin | 48 MB Parquet |

## Zitationsempfehlungen der Anbieter

Übernommen von der jeweiligen Datensatz- bzw. Anbieterseite (geprüft 2026-07-26). Diese Angaben
gehören ins Literaturverzeichnis des Short Papers.

| Quelle | Empfohlene Zitation |
|---|---|
| Epoch AI | Epoch AI: *Data on AI Models*. Published online at epoch.ai, <https://epoch.ai/data/ai-models>, abgerufen 2026-07-26. |
| allenai/WildChat-1M | Zhao, W., Ren, X., Hessel, J., Cardie, C., Choi, Y., Deng, Y. (2024): *WildChat: 1M ChatGPT Interaction Logs in the Wild*. ICLR 2024, arXiv:2405.01470. |
| Hello-SimpleAI/HC3 | Guo, B., Zhang, X., Wang, Z., Jiang, M., Nie, J., Ding, Y., Yue, J., Wu, Y. (2023): *How Close is ChatGPT to Human Experts? Comparison Corpus, Evaluation, and Detection*. arXiv:2301.07597. |
| gfissore/arxiv-abstracts-2021 | Clement, C. B., Bierbaum, M., O'Keeffe, K. P., Alemi, A. A. (2019): *On the Use of ArXiv as a Dataset*. arXiv:1905.00075. |
| OpenAlex | Priem, J., Piwowar, H., Orr, R. (2022): *OpenAlex: A fully-open index of scholarly works, authors, venues, institutions, and concepts*. arXiv:2205.01833. |
| Parveshiiii/AI-vs-Real | keine formale Zitation, die Karte bittet um Credit: "Parvesh Rawal, AI-vs-Real Dataset (2025)". |
| librarian-bots/model_cards_with_metadata | keine formale Zitation gefordert, die Karte bittet um einen Link auf die Datensatzseite. |
| Natural Earth | keine Pflichtangabe; optionale Formel: "Made with Natural Earth. Free vector and raster map data @ naturalearthdata.com." Autoren: Tom Patterson, Nathaniel Vaughn Kelso. |
| arXiv-Metadaten | keine Pflichtzitation; die Terms of Use verlangen einen Rückverweis auf arxiv.org. |
| CIFAKE (Originalquelle) | Bird, J. J., Lotfi, A. (2024): *CIFAKE: Image Classification and Explainable Identification of AI-Generated Synthetic Images*. IEEE Access, arXiv:2303.14126. Nur als Herkunftsnachweis, der Datensatz wird nicht mehr verwendet. |

## Synthetische Assets (KI-generiert, keine Datenquelle)

| Datei | Herkunft | Abrufdatum | Wofür |
|---|---|---|---|
| `app/public/data/spot/ai_library_v2.png`, `ai_platform_v2.png`, `ai_cafeteria_v2.png` | mit Codex (GPT-5) und integrierter Bildgenerierung erzeugt, dokumentiert in der Abgabefassung `supplemental/ki-nutzung.md`; genaues Bildmodell nicht dokumentiert | 2026-07-16 (Dateidatum) | Akt 5, die drei synthetischen Quiz-Bilder |
| `app/public/data/spot/ai_0.jpg` bis `ai_5.jpg` | aus Parveshiiii/AI-vs-Real, KI-Klasse | 2026-06-25 | **nicht mehr referenziert** in `spot.json`, liegen aber noch im Repo |

## Gebaute App-Daten

| Datei | Erzeugt von | Größe | Speist |
|---|---|---|---|
| `app/public/data/epoch.json` | `daten/build_epoch.py` | 88 KB | Akt 1 |
| `app/public/data/map.json` | `daten/build_map.py` | 9,1 MB | Akt 2 |
| `app/public/data/familytree.json` | `daten/build_familytree.py` | 4,1 MB | Akt 3 |
| `app/public/data/wildchat.json` | `daten/build_wildchat.py` | 1,1 MB | Akt 4 |
| `app/public/data/spot.json` | `daten/build_spot.py` | 7,9 KB | Akt 5 |
| `app/public/data/world-110m.geo.json` | statisches Asset, kein Skript; unverändert aus `nvkelso/natural-earth-vector` übernommen (Prüfsumme in der Quellen-Tabelle) | 839 KB | Akt 4 (Zentroide) |
| `daten/validation/heuristik-report.json`/`.md`, `sample-meta.json` | `daten/validate_heuristik.py --score` | < 5 KB | Validierung der Nutzungs-Heuristik (Akt 4) |

## Roh-Stichproben nur im Arbeits-Repository

Im Arbeits-Repository liegen kleine Stichproben, damit die Datenlage ohne
6-GB-Pull nachvollziehbar bleibt. Sie werden wegen Klartextinhalten und
Paketgröße **nicht in der Abgabe ausgeliefert**:

| Datei | Größe | Inhalt |
|---|---|---|
| `daten-raw/epoch_notable_models.csv` | 2,1 MB | vollständiger Epoch-AI-Export |
| `daten-raw/WildChat-1M.sample.json` | 995 KB | Stichprobe echter Gespräche (Klartext) |
| `daten-raw/HC3.sample.json` | 261 KB | Stichprobe der Q&A-Paare |
| `daten-raw/model_cards_with_metadata.sample.json` | 318 KB | Stichprobe der Modellkarten |
| `daten-raw/arxiv-abstracts-2021.sample.json` | 99 KB | Stichprobe der Abstracts |

## Software-Umgebung (Reproduzierbarkeit)

Python 3.14.3 in `inside-ai/.venv`: duckdb 1.5.4, numpy 2.5.0, scikit-learn 1.9.0, scipy 1.18.0,
huggingface_hub 1.20.1, pytest 9.1.1, ruff 0.15.21. Node 22 für die App
(`app/package.json` plus `app/package-lock.json`).

## Erledigt (Stand 2026-07-26)

1. **`epoch.json` hat jetzt ein Build-Skript.** `daten/build_epoch.py` erzeugt die Datei aus
   `daten-raw/epoch_notable_models.csv` und reproduziert den committeten Bestand **byte-identisch**
   (528 Modelle, gleiche Feld- und Sortierlogik). Akt 1 ist damit reproduzierbar.
2. **Lizenzen aller Datensätze sind geprüft und eingetragen** (siehe Tabelle oben, Prüfdatum
   2026-07-26), inklusive Zitationsempfehlungen der Anbieter.
3. **Bezugs-URL für `world-110m.geo.json` ist belegt.** Die Datei ist byte-identisch mit
   `ne_110m_admin_0_countries.geojson` aus `nvkelso/natural-earth-vector`; Lizenz Public Domain.

## Offene Punkte

1. **Abrufdaten sind fast durchgängig aus Dateidaten abgeleitet**, nicht protokolliert. Einzige
   echte Protokollspur ist `daten-raw/pull.log` für die fünf HF-Datensätze.
2. **Zwei Datensatzkarten nennen gar keine Lizenz** (`librarian-bots/model_cards_with_metadata`,
   `dragonintelligence/CIFAKE-image-dataset`). Das ist der geprüfte Befund, keine Lücke in dieser
   Dokumentation. Für CIFAKE ließ sich auch die Lizenz der Kaggle-Originalquelle nicht belegen; der
   Datensatz wird in der App nicht mehr verwendet, `pull_all.py` zieht ihn aber weiterhin.
3. **Bildherkunft von `Parveshiiii/AI-vs-Real` ist nicht dokumentiert.** Die Karte setzt MIT, nennt
   aber keine Upstream-Quelle der Fotos. Für Akt 5 als Limitation zu führen.
4. **Die Epoch-Version ist nicht versioniert.** Der Export trägt kein Versions- oder Snapshot-Feld;
   nachvollziehbar ist nur das Dateidatum der lokalen CSV.

## Öffentliche Fassung (2026-10-05)

Für das öffentliche Repository und die Live-Demo sind die drei echten Quiz-Fotos aus
`Parveshiiii/AI-vs-Real` ersetzt, weil ihre Herkunft nicht belegt ist (siehe Punkt 3 oben) und eines
eine erkennbare Person zeigt. Neu, alle **CC0** (Public Domain Dedication), abgerufen 2026-10-05 als
960-px-Vorschau über die Commons-API:

| Datei | Quelle | Urheber |
|---|---|---|
| `app/public/data/spot/real_cafe.jpg` | <https://commons.wikimedia.org/wiki/File:Coffee_in_Montreal_(Unsplash).jpg> | Luke Chesser (via Unsplash) |
| `app/public/data/spot/real_library.jpg` | <https://commons.wikimedia.org/wiki/File:University_Library_TUHH_interior_bookshelf.jpg> | Jonas Muth |
| `app/public/data/spot/real_platform.jpg` | <https://commons.wikimedia.org/wiki/File:Horsham_railway_station_platform_2024-06-04.jpg> | Onthewings |
