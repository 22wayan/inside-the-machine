#!/usr/bin/env python3
"""Baut die Daten fuer Akt 1 (Compute-Explosion) aus dem Epoch-AI-Export "Notable AI Models".

-> app/public/data/epoch.json
Lauf: inside-ai/.venv/bin/python daten/build_epoch.py

Quelle: daten-raw/epoch_notable_models.csv (Epoch AI, Notable AI Models, CC BY;
Abrufdatum siehe daten/QUELLEN.md). Der Export ist absteigend nach Publikationsdatum
sortiert und enthaelt 1032 Zeilen; davon haben 528 einen Wert in "Training compute (FLOP)".
Nur diese 528 koennen im Log-Scatter ueberhaupt eine y-Position bekommen, deshalb ist
"FLOP vorhanden" das einzige Filterkriterium (Munzner: Data Abstraction vor Encoding).

Rekonstruktion (2026-07-26): Dieses Skript wurde nachtraeglich geschrieben, das urspruengliche
epoch.json entstand ohne committetes Skript. Die Transformation wurde aus dem Vergleich von CSV
und epoch.json zurueckgewonnen und reproduziert die bestehende Datei byte-identisch. Zwei
Details sind dabei bewusst uebernommen statt "aufgeraeumt", weil die App auf ihnen aufsetzt:

  1) Ein Modellname traegt im CSV einen Zeilenumbruch am Ende ("GPT-3.5 (davinci-002)\\n").
     Der Name wird NICHT getrimmt, sonst weicht die Ausgabe vom Bestand ab.
  2) Die Reihenfolge ist aufsteigend nach Jahr; bei gleichem Datum gilt die UMGEKEHRTE
     CSV-Reihenfolge. Das ergibt sich daraus, dass der Export neueste Zeile zuerst listet und
     vor dem Sortieren einmal umgedreht wurde.

Nicht aus den Daten ableitbar ist allein die REIHENFOLGE des Feldes "domains" (siehe
DOMAIN_LEGENDE unten). Die Menge der sechs Domaenen ist reproduzierbar (die sechs
haeufigsten), ihre Sortierung im Bestand ist eine kuratierte Legenden-Reihenfolge.
"""
import csv
import json
import sys
from collections import Counter
from datetime import date

from layout import resolve_layout

LAYOUT = resolve_layout(__file__)
SRC = LAYOUT.raw / "epoch_notable_models.csv"
OUT = LAYOUT.app_data / "epoch.json"

# Der Export fuehrt volle Abstracts als CSV-Feld; das sprengt das Default-Limit von 128 KB.
csv.field_size_limit(10**7)

DAYS_PER_YEAR = 365  # bewusst fix, nicht 365.25: reproduziert die Jahres-Bruchteile im Bestand
TOP_DOMAINS = 6  # so viele Domaenen listet epoch.json unter "domains"

# Meilenstein-Familien: Story-Anker fuer Akt 1. Der Schluessel wird case-insensitiv als Teilstring
# im Modellnamen gesucht, das Label landet als "milestone" im JSON. Reihenfolge = Prioritaet
# (im aktuellen Export gibt es keinen Namen, der auf zwei Familien passt).
MILESTONE_FAMILIEN = [
    ("alexnet", "AlexNet"),
    ("alphago", "AlphaGo"),
    ("alphafold", "AlphaFold"),
    ("bert", "BERT"),  # trifft absichtlich auch RoBERTa, DeBERTa, ALBERT, HuBERT
    ("gpt-2", "GPT-2"),
    ("gpt-3", "GPT-3"),  # trifft auch GPT-3.5
    ("gpt-4", "GPT-4"),  # trifft auch GPT-4.5
    ("dall-e", "DALL-E"),
    ("palm", "PaLM"),
    ("stable diffusion", "Stable Diffusion"),
    ("llama", "Llama"),
    ("gemini", "Gemini"),
    ("deepseek", "DeepSeek"),
]

# Kuratierte Legenden-Reihenfolge der Domaenen. Die MENGE ergibt sich aus den Daten (die sechs
# haeufigsten Domaenen), die REIHENFOLGE nicht: sie stammt aus dem bestehenden epoch.json und
# gruppiert semantisch (Sprache/Bild/Multimodal vor Spezialdomaenen). Domaenen, die hier nicht
# stehen, aber in die Top-6 rutschen, werden nach Haeufigkeit hinten angehaengt.
DOMAIN_LEGENDE = ["Language", "Vision", "Multimodal", "Games", "Biology", "Image generation"]


def dezimaljahr(datum_iso: str) -> float:
    """Publikationsdatum -> Jahr als Dezimalzahl, z. B. 1950-07-02 -> 1950.499.

    Der Scatter in Akt 1 braucht eine stetige x-Achse (quantitatives Attribut), kein
    Jahres-Bucket, sonst kollabieren Modelle desselben Jahres auf eine Spalte.
    """
    d = date.fromisoformat(datum_iso)
    return round(d.year + (d.timetuple().tm_yday - 1) / DAYS_PER_YEAR, 3)


def leer_zu_none(wert: str) -> str | None:
    """Leere CSV-Zelle -> None (JSON null), damit die App fehlende Werte erkennt."""
    return wert if wert else None


def zahl_oder_none(wert: str) -> float | None:
    wert = wert.strip()
    return float(wert) if wert else None


def milestone(name: str) -> str | None:
    """Ordnet einen Modellnamen einer Meilenstein-Familie zu (oder None)."""
    klein = name.lower()
    for schluessel, label in MILESTONE_FAMILIEN:
        if schluessel in klein:
            return label
    return None


def hauptdomaene(feld: str) -> str | None:
    """Epoch listet Mehrfach-Domaenen komma-separiert ("Multimodal,Vision,Language").

    Fuer die kategoriale Farbkodierung braucht es genau EINEN Wert je Punkt (Munzner:
    ein Punkt, ein Kanal), deshalb die erstgenannte Domaene als Hauptdomaene.
    """
    return leer_zu_none(feld.split(",")[0].strip())


def lade_modelle() -> list[dict]:
    with SRC.open(newline="", encoding="utf-8") as f:
        zeilen = list(csv.DictReader(f))
    # Filter: ohne Trainings-Compute kein Punkt auf der Log-Achse.
    mit_flop = [z for z in zeilen if z["Training compute (FLOP)"].strip()]
    # CSV ist neueste Zeile zuerst -> einmal umdrehen, dann stabil aufsteigend nach Jahr.
    chronologisch = sorted(mit_flop[::-1], key=lambda z: dezimaljahr(z["Publication date"]))
    return [
        {
            # Name absichtlich ungetrimmt, siehe Kopf-Docstring (Punkt 1).
            "name": z["Model"],
            "org": leer_zu_none(z["Organization"]),
            "year": dezimaljahr(z["Publication date"]),
            "flop": float(z["Training compute (FLOP)"]),
            "params": zahl_oder_none(z["Parameters"]),
            "domain": hauptdomaene(z["Domain"]),
            "milestone": milestone(z["Model"]),
        }
        for z in chronologisch
    ]


def domaenen_legende(modelle: list[dict]) -> list[str]:
    haeufig = Counter(m["domain"] for m in modelle if m["domain"])
    top = {name for name, _ in haeufig.most_common(TOP_DOMAINS)}
    geordnet = [d for d in DOMAIN_LEGENDE if d in top]
    rest = [name for name, _ in haeufig.most_common(TOP_DOMAINS) if name not in DOMAIN_LEGENDE]
    return geordnet + rest


def main() -> None:
    if not SRC.exists():
        sys.exit(f"Rohdaten fehlen: {SRC}")

    modelle = lade_modelle()
    jahre = [m["year"] for m in modelle]
    flops = [m["flop"] for m in modelle]
    out = {
        "models": modelle,
        "yearRange": [min(jahre), max(jahre)],
        "flopRange": [min(flops), max(flops)],
        "domains": domaenen_legende(modelle),
    }
    # Kompakte Ein-Zeilen-Ausgabe ohne abschliessenden Zeilenumbruch (wie der Bestand).
    OUT.write_text(json.dumps(out), encoding="utf-8")

    mit_meilenstein = sum(1 for m in modelle if m["milestone"])
    ohne_params = sum(1 for m in modelle if m["params"] is None)
    jahres_spanne = f"{min(jahre):.3f} bis {max(jahre):.3f}"
    print(f"epoch.json: {len(modelle)} Modelle mit Trainings-Compute (von 1032 CSV-Zeilen)")
    print(f"  Jahre {jahres_spanne} | FLOP {min(flops):.3g} bis {max(flops):.3g}")
    print(f"  {mit_meilenstein} Meilenstein-Modelle, {ohne_params} ohne Parameter-Angabe")
    print(f"  Domaenen-Legende: {', '.join(out['domains'])}")
    print(f"  geschrieben: {OUT.relative_to(LAYOUT.display_root)} ({OUT.stat().st_size / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
