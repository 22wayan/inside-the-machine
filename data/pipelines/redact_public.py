"""Remove two WildChat example texts before publishing the repository and live demo.

allenai/WildChat-1M is PII-scrubbed by AI2, and build_wildchat.py already shortens every
link to its domain and removes access data. A manual review on 2026-10-05 of all texts with
long digit runs or links found two that still carry something personal:

- a page title that contains a person's name
- a job application text with a personal booking link

They are dropped here, identified by a short fragment. Aggregates are not touched.

Usage: python3 data/pipelines/redact_public.py app/public/data/wildchat.json
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

DROP_IF_CONTAINS = (
    "A2-T2G08-7893589",
    "https://calendly.com/",
)


def is_dropped(text: str) -> bool:
    return any(fragment in text for fragment in DROP_IF_CONTAINS)


def main(path: Path) -> None:
    data = json.loads(path.read_text(encoding="utf-8"))
    dropped = 0
    for country in data["countries"]:
        for key in ("samples", "graySamples"):
            items = country.get(key, [])
            kept = [s for s in items if not is_dropped(s["t"])]
            dropped += len(items) - len(kept)
            country[key] = kept
    path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    print(f"dropped {dropped} example texts")


if __name__ == "__main__":
    main(Path(sys.argv[1]))
