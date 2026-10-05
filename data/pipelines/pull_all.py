#!/usr/bin/env python3
"""Zieht die vollen Parquet-Dateien der 5 Inside-AI-Datensaetze nach daten-raw/hf/<name>/.
Robust gegen HF-429 (huggingface_hub retried mit Backoff). Reproduzierbar/idempotent.
Lauf: inside-ai/.venv/bin/python daten/pull_all.py"""
import time
from huggingface_hub import snapshot_download
from huggingface_hub.utils import HfHubHTTPError

from layout import resolve_layout

OUT = resolve_layout(__file__).raw / "hf"
DATASETS = [
    "gfissore/arxiv-abstracts-2021",          # Map of AI Research (2 Mio Abstracts)
    "librarian-bots/model_cards_with_metadata",  # Family Tree (625k Modellkarten, base_model)
    "allenai/WildChat-1M",                    # Wie die Welt mit KI redet (838k Gespraeche)
    "dragonintelligence/CIFAKE-image-dataset",   # Spot the Machine (120k Bilder)
    "Hello-SimpleAI/HC3",                     # Spot the Machine (48k Mensch-vs-ChatGPT)
]


def pull(ds: str, tries: int = 8) -> bool:
    dest = OUT / ds.replace("/", "__")
    for i in range(tries):
        try:
            snapshot_download(
                repo_id=ds, repo_type="dataset", revision="refs/convert/parquet",
                allow_patterns=["*.parquet"], local_dir=str(dest), max_workers=2,
            )
            print(f"OK   {ds} -> {dest}", flush=True)
            return True
        except HfHubHTTPError as e:
            wait = 15 * (i + 1)
            print(f"WAIT {ds} try {i + 1}/{tries} ({e}); schlafe {wait}s", flush=True)
            time.sleep(wait)
        except Exception as e:  # noqa: BLE001
            print(f"ERR  {ds}: {e!r}", flush=True)
            return False
    print(f"FAIL {ds} nach {tries} Versuchen", flush=True)
    return False


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    ok = sum(pull(d) for d in DATASETS)
    print(f"\nFERTIG: {ok}/{len(DATASETS)} Datensaetze nach {OUT}", flush=True)
