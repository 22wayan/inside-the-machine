#!/usr/bin/env python3
"""Meistzitierte arXiv-Paper je Forschungsfeld via OpenAlex (offene API, keyless).

Fuer Akt 2 (Map): Klick auf ein Feld zeigt "die einflussreichsten Paper". Zitationszahlen liegen
weder im arXiv-Dump noch in der arXiv-API -> OpenAlex liefert cited_by_count fuer die arXiv-Quelle
(S4306400194, an der Live-API verifiziert; Top-Treffer VGG). Vorgehen:
- je Feld-Konzept die Top-K Werke MIT arXiv-Location nach cited_by_count (seit 2007). WICHTIG:
  locations.source.id statt primary_location, denn bei beruehmten Papern (Attention, ResNet) ist
  die primary_location die Konferenz und arXiv nur Zweit-Location -> sonst fehlen genau die Klassiker,
- arXiv-ID aus den locations-landing_page_urls extrahieren,
- KEINE Feld-Zuordnung hier: build_map.py matcht die IDs gegen den eigenen Korpus (primary
  category) -> die Feld-Gruppierung ist exakt konsistent mit der Karte, nicht mit OpenAlex-Konzepten.

r3b zusaetzlich: Top-Kandidaten PRO JAHR (publication_year-Filter, ein OR-Filter ueber alle
Konzept-IDs, sort=cited_by_count). Ergebnisse landen in daten-raw/openalex_top_by_year.json;
der Fetch ist resumable (fertige Jahre werden uebersprungen, Cache wird nach jedem Jahr
geschrieben) und gedrosselt (optional polite pool via OPENALEX_MAILTO + Sleep).

-> daten-raw/openalex_top.json + daten-raw/openalex_top_by_year.json
   Lauf: inside-ai/.venv/bin/python daten/fetch_top_papers.py
"""
import json
import os
import re
import time
import urllib.parse
import urllib.request

from layout import resolve_layout

MAILTO = os.environ.get("OPENALEX_MAILTO", "").strip()
ARXIV_SRC = "S4306400194"
PER_CONCEPT = 60
# Konzept-Namen werden zur Laufzeit gegen /concepts aufgeloest (robuster als hartcodierte IDs).
CONCEPTS = [
    "Machine learning", "Deep learning", "Computer vision", "Natural language processing",
    "Artificial intelligence", "Robotics", "Information retrieval", "Evolutionary computation",
]
RAW = resolve_layout(__file__).raw
OUT = RAW / "openalex_top.json"
BY_YEAR_OUT = RAW / "openalex_top_by_year.json"
YEARS = list(range(2007, 2027))
PER_YEAR_PAGES = 2  # 2 Seiten a 200 = bis 400 Kandidaten je Jahr; der Korpus-Match filtert weiter
SLEEP_S = 0.8  # Drosselung zwischen Requests (hoeflich, weit unter dem OpenAlex-Limit)
ARX_RE = re.compile(r"arxiv\.org/abs/(?:([a-z-]+(?:\.[A-Z]{2})?/\d{7})|(\d{4}\.\d{4,5}))", re.I)


def get(url: str) -> dict:
    user_agent = "va-abschlussprojekt/1.0"
    if MAILTO:
        user_agent += f" ({MAILTO})"
    req = urllib.request.Request(url, headers={"User-Agent": user_agent})
    return json.loads(urllib.request.urlopen(req, timeout=60).read())


def with_mailto(url: str) -> str:
    """Haengt die optionale Kontaktadresse URL-kodiert an eine OpenAlex-Anfrage."""
    if not MAILTO:
        return url
    return f"{url}{'&' if '?' in url else '?'}{urllib.parse.urlencode({'mailto': MAILTO})}"


def concept_id(name: str) -> str | None:
    q = urllib.parse.quote(name)
    d = get(with_mailto(f"https://api.openalex.org/concepts?search={q}&per_page=1"))
    res = d.get("results") or []
    if not res:
        return None
    cid = res[0]["id"].rsplit("/", 1)[-1]
    print(f"Konzept '{name}' -> {cid} ({res[0]['display_name']})", flush=True)
    return cid


def arxiv_id_of(w: dict) -> str | None:
    for loc in w.get("locations") or []:
        m = ARX_RE.search((loc or {}).get("landing_page_url") or "")
        if m:
            return m.group(1) or m.group(2)
    return None


def cand_of(w: dict, aid: str) -> dict:
    return {
        "arxivId": aid,
        "title": w["title"],
        "year": w.get("publication_year"),
        "citations": w["cited_by_count"],
        # r3a: Abstract-URL direkt aus der arXiv-ID (stabile, kanonische Link-Form).
        "url": f"https://arxiv.org/abs/{aid}",
    }


def fetch_totals(cids: list[tuple[str, str]]) -> None:
    """Top-Kandidaten je Konzept ueber den Gesamtzeitraum -> openalex_top.json."""
    by_id: dict[str, dict] = {}
    for name, cid in cids:
        url = with_mailto(
            "https://api.openalex.org/works?filter="
            f"locations.source.id:{ARXIV_SRC},concepts.id:{cid},from_publication_date:2007-01-01"
            f"&sort=cited_by_count:desc&per_page={PER_CONCEPT}"
            "&select=title,publication_year,cited_by_count,locations"
        )
        try:
            d = get(url)
        except Exception as ex:  # noqa: BLE001
            print(f"ERR {name}: {ex}", flush=True)
            continue
        n = 0
        for w in d.get("results", []):
            aid = arxiv_id_of(w)
            if not aid or not w.get("title"):
                continue
            prev = by_id.get(aid)
            if prev is None or w["cited_by_count"] > prev["citations"]:
                by_id[aid] = cand_of(w, aid)
                n += 1
        print(f"{name}: {n} Kandidaten (gesamt {len(by_id)})", flush=True)
        time.sleep(SLEEP_S)
    OUT.write_text(json.dumps(sorted(by_id.values(), key=lambda x: -x["citations"]), ensure_ascii=False, indent=1))
    print(f"Gesamt-Fetch FERTIG: {len(by_id)} Kandidaten -> {OUT}", flush=True)


def fetch_year(cfilter: str, year: int) -> list[dict]:
    """Meistzitierte arXiv-Kandidaten EINES Jahres (alle Felder in einem OR-Filter)."""
    cands: dict[str, dict] = {}
    for page in range(1, PER_YEAR_PAGES + 1):
        url = with_mailto(
            "https://api.openalex.org/works?filter="
            f"locations.source.id:{ARXIV_SRC},concepts.id:{cfilter},publication_year:{year}"
            f"&sort=cited_by_count:desc&per_page=200&page={page}"
            "&select=title,publication_year,cited_by_count,locations"
        )
        try:
            d = get(url)
        except Exception as ex:  # noqa: BLE001
            print(f"ERR {year} Seite {page}: {ex} -> Retry in 10s", flush=True)
            time.sleep(10.0)
            try:
                d = get(url)
            except Exception as ex2:  # noqa: BLE001
                print(f"ERR {year} Seite {page} (2. Versuch): {ex2} -> Seite uebersprungen", flush=True)
                continue
        for w in d.get("results", []):
            aid = arxiv_id_of(w)
            if not aid or not w.get("title") or aid in cands:
                continue
            cands[aid] = cand_of(w, aid)
        time.sleep(SLEEP_S)
    return sorted(cands.values(), key=lambda x: -x["citations"])


def fetch_by_year(cids: list[tuple[str, str]]) -> None:
    """r3b: je Jahr die Top-Kandidaten -> openalex_top_by_year.json (resumable, abbruchsicher)."""
    cache: dict[str, list] = {}
    if BY_YEAR_OUT.exists():
        cache = json.loads(BY_YEAR_OUT.read_text())
        print(f"Cache: {len(cache)} Jahre vorhanden, fehlende werden nachgeholt", flush=True)
    cfilter = "|".join(cid for _, cid in cids)
    for yr in YEARS:
        if str(yr) in cache:  # resumable: fertige Jahre nie erneut fetchen
            continue
        cache[str(yr)] = fetch_year(cfilter, yr)
        BY_YEAR_OUT.write_text(json.dumps(cache, ensure_ascii=False))  # nach JEDEM Jahr sichern
        print(f"{yr}: {len(cache[str(yr)])} Kandidaten -> Cache", flush=True)
    print(f"Per-Jahr-Fetch FERTIG: {len(cache)} Jahre -> {BY_YEAR_OUT}", flush=True)


def main() -> None:
    RAW.mkdir(parents=True, exist_ok=True)
    cids: list[tuple[str, str]] = []
    for name in CONCEPTS:
        cid = concept_id(name)
        if cid:
            cids.append((name, cid))
        else:
            print(f"WARN: kein Konzept fuer '{name}'", flush=True)
    if OUT.exists():
        print(f"{OUT.name} existiert -> Gesamt-Fetch uebersprungen (Datei loeschen fuer Neu-Fetch)", flush=True)
    else:
        fetch_totals(cids)
    fetch_by_year(cids)


if __name__ == "__main__":
    main()
