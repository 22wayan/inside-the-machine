#!/usr/bin/env python3
"""Baut Akt 3 (Lebende Lineage-Karte) aus model_cards (528k base_model-Kanten):
- ~160 Hubs (Basismodelle nach Kinderzahl), per Fruchterman-Reingold verbunden ueber ECHTE
  Hub->Hub-Abstammung + Merge-Kanten (bedeutungsvolle Verbindungen, keine Zufallslinien)
- je Hub ein Schwarm seiner Kinder (Stichprobe), gefaerbt nach Vermehrungsart
- harte Fakten (Konzentration, 4 Vermehrungsarten, Merges) fuer die Caption
-> app/public/data/familytree.json  (Lauf: inside-ai/.venv/bin/python daten/build_familytree.py)"""
import json

import duckdb
import numpy as np

from layout import resolve_layout

LAYOUT = resolve_layout(__file__)
MC = f"read_parquet('{LAYOUT.raw}/hf/librarian-bots__model_cards_with_metadata/**/*.parquet')"
N_HUBS = 160
SWARM_CAP = 240          # max Kinder-Punkte je Hub (Schwarm)
MIN_BRIDGE_SUPPORT = 2   # Merge-Bruecke nur bei >= 2 unabhaengigen Merge-Kindern (filtert Einzel-
                         # Experimente/Fehltags: 23 von 42 Bruecken hingen an EINEM 0-Download-Kind,
                         # z.B. Qwen2.5-Coder x Llama-3.1 belegt nur durch 'Sovereign-Code', dl=0)
MIN_MERGE_DL = 10        # Beleg-Kind zaehlt nur bei nachweisbarer Nutzung (Downloads); 0-Download-
                         # Spam wie 'Nyx-Reasoner-8xFusion' (13 Eltern, 2 Duplikat-Accounts) faellt raus
MAX_MERGE_PARENTS = 4    # echte Merges kombinieren 2-4 Modelle; 8x/13x-'Fusion'-Sammel-Tagger sind
                         # kein Beleg fuer eine Familien-Verbindung (Architektur-Kompatibilitaet!)
REL = ["finetune", "adapter", "quantized", "merge"]
# synchron mit app/src/theme.js REL_COLOR (kosmische Palette): die Galaxie besteht primaer aus echten
# Sternen (finetune 72% = Warmweiss), mit Neon-Cyan/Magenta-Nebeln und Supernova-Gold-Merges.
# Hinweis: die App liest die Farbe ueber den rel-Namen aus theme.js (REL_COLOR), das hier eingebackene
# "color" ist nur noch Doku/Legacy; die Werte werden trotzdem synchron gehalten.
REL_COLOR = {"finetune": "#fff5e6", "adapter": "#00e5ff", "quantized": "#d6409f", "merge": "#ffd700"}
REL_IDX = {r: i for i, r in enumerate(REL)}

con = duckdb.connect()
con.execute(f"""CREATE OR REPLACE VIEW edges AS
  SELECT child, downloads, parent,
    CASE WHEN rel IN ('finetune', '') THEN 'finetune'
         WHEN rel = 'quantization' THEN 'quantized'
         ELSE rel END AS rel
  FROM (
    SELECT modelId AS child, downloads,
           regexp_extract(t, '^base_model:([a-z]+):', 1) AS rel,
           regexp_replace(t, '^base_model:([a-z]+:)?', '') AS parent
    FROM (SELECT modelId, downloads, unnest(tags) AS t FROM {MC})
    WHERE t LIKE 'base_model:%'
  ) WHERE parent <> '' AND parent <> child""")

total_edges = con.execute("SELECT count(*) FROM edges").fetchone()[0]
total_models = con.execute(f"SELECT count(*) FROM {MC}").fetchone()[0]
base_models = con.execute("SELECT count(DISTINCT parent) FROM edges").fetchone()[0]
top100 = con.execute("SELECT sum(c) FROM (SELECT count(*) c FROM edges GROUP BY parent ORDER BY c DESC LIMIT 100)").fetchone()[0]
merges = con.execute("SELECT count(*) FROM edges WHERE rel = 'merge'").fetchone()[0]
max_parents = con.execute("SELECT max(np) FROM (SELECT child, count(DISTINCT parent) np FROM edges GROUP BY child)").fetchone()[0]
multi_gen = con.execute("SELECT count(DISTINCT parent) FROM edges WHERE parent IN (SELECT child FROM edges)").fetchone()[0]
rel_counts = dict(con.execute("SELECT rel, count(*) FROM edges GROUP BY 1").fetchall())

hubs = con.execute("SELECT parent, count(*) c FROM edges GROUP BY 1 ORDER BY c DESC LIMIT ?", [N_HUBS]).fetchall()
hubids = [h[0] for h in hubs]
hubc = {h[0]: h[1] for h in hubs}
hub_index = {h: i for i, h in enumerate(hubids)}
ph = ",".join("?" * len(hubids))

# Hub->Hub-Kanten: ein grosses Modell, das selbst von einem anderen grossen abstammt (echte Linien)
hh = con.execute(f"""SELECT parent, child, any_value(rel) rel FROM edges
  WHERE parent IN ({ph}) AND child IN ({ph}) GROUP BY parent, child""", hubids + hubids).fetchall()
edge_idx = [(hub_index[p], hub_index[c], r) for p, c, r in hh]
# Merge-Bruecken: Merge-Kinder mit mehreren Hub-Eltern verschmelzen diese Familien. Ein BELEG
# zaehlt nur, wenn das Merge-Kind (a) nachweisbar genutzt wird (>= MIN_MERGE_DL Downloads) und
# (b) eine plausible Elternzahl hat (<= MAX_MERGE_PARENTS; Sammel-Tagger mit 8-13 Eltern belegen
# nichts). Support zaehlt eindeutige MODELLNAMEN (dasselbe Modell unter zwei Accounts = 1 Beleg).
# Bruecken unter MIN_BRIDGE_SUPPORT fliegen raus. Nutzer-Befund: Mistral x Llama/Qwen-Bruecken
# waren reine Tag-Spam-Artefakte, architektonisch inkompatible Familien mergen nicht.
con.execute(f"""CREATE OR REPLACE VIEW merge_ok AS
  SELECT child, parent FROM edges WHERE rel = 'merge' AND child IN (
    SELECT child FROM edges WHERE rel = 'merge'
    GROUP BY child HAVING max(downloads) >= {MIN_MERGE_DL} AND count(DISTINCT parent) <= {MAX_MERGE_PARENTS}
  )""")
bridges = con.execute(f"""SELECT a.parent p1, b.parent p2, count(DISTINCT split_part(a.child, '/', 2)) support FROM
    (SELECT child, parent FROM merge_ok WHERE parent IN ({ph})) a
    JOIN (SELECT child, parent FROM merge_ok WHERE parent IN ({ph})) b
    ON a.child = b.child AND a.parent < b.parent
    GROUP BY 1, 2 HAVING count(DISTINCT split_part(a.child, '/', 2)) >= ?""", hubids + hubids + [MIN_BRIDGE_SUPPORT]).fetchall()
edge_idx = [(a, b, r, 1) for a, b, r in edge_idx]  # Lineage-Kanten: Support 1 (direkte Abstammung)
seen_edge = {(a, b) for a, b, _, _ in edge_idx} | {(b, a) for a, b, _, _ in edge_idx}
for p1, p2, support in bridges:
    i, j = hub_index[p1], hub_index[p2]
    if (i, j) not in seen_edge:
        edge_idx.append((i, j, "merge", int(support)))
        seen_edge.add((i, j))
print(f"Hub-Kanten: {len(edge_idx)} (Abstammung {len(hh)} + Merge-Bruecken {len(bridges)}, Support >= {MIN_BRIDGE_SUPPORT})")

# Schwarm: bis SWARM_CAP meistgeladene, nach child DEDUPLIZIERTE Kinder je Hub - mit Identitaet
# + Attributen (createdAt/likes/pipeline_tag aus model_cards) fuer den Zoom-/Drill-down-Explorer.
swarm = con.execute(f"""
  SELECT parent, child, rel, downloads, createdAt, likes, pipeline_tag FROM (
    SELECT *, row_number() OVER (PARTITION BY parent ORDER BY downloads DESC NULLS LAST) rn FROM (
      SELECT e.parent, e.child, any_value(e.rel) rel, max(e.downloads) downloads,
             any_value(m.createdAt) createdAt, any_value(m.likes) likes, any_value(m.pipeline_tag) pipeline_tag
      FROM edges e LEFT JOIN {MC} m ON m.modelId = e.child
      WHERE e.parent IN ({ph}) GROUP BY e.parent, e.child
    )
  ) WHERE rn <= ?""", hubids + [SWARM_CAP]).fetchall()
# Hub-Alter (Stern-Helligkeit; ~121/160 vorhanden, Rest Fallback)
hub_created = dict(con.execute(f"SELECT modelId, createdAt FROM {MC} WHERE modelId IN ({ph})", hubids).fetchall())


def short(name):
    # Phase 7.7: keine Kuerzung mehr. Voller Modellname (ohne org-Prefix); die Org steht separat
    # via org(). Hover-HUD/Labels sollen komplette, ungeschnittene Namen zeigen.
    return name.split("/")[-1]


def org(name):
    return name.split("/")[0] if "/" in name else "—"


# --- Fruchterman-Reingold-Layout der Hubs (numpy, ~160 Knoten) ---
n = len(hubids)
rng = np.random.default_rng(42)
pos = (rng.random((n, 2)) - 0.5) * 0.6  # um das Zentrum starten
E = np.array([(a, b) for a, b, _, _ in edge_idx], dtype=int) if edge_idx else np.zeros((0, 2), int)
k = 0.9 / np.sqrt(n)
temp = 0.10
GRAV = 0.02  # Schwerkraft zum Zentrum statt Wand-Clipping (verhindert Rand-Anhaeufung)
for _ in range(500):
    delta = pos[:, None, :] - pos[None, :, :]
    dist = np.maximum(np.linalg.norm(delta, axis=2), 1e-5)
    np.fill_diagonal(dist, np.inf)
    rep = ((k * k) / dist)[:, :, None] * (delta / dist[:, :, None])
    disp = rep.sum(axis=1)
    for a, b in E:
        d = pos[a] - pos[b]
        dd = np.linalg.norm(d) + 1e-9
        f = (dd * dd / k) * (d / dd)
        disp[a] -= f
        disp[b] += f
    disp -= GRAV * pos  # zieh alles sanft zur Mitte
    dlen = np.linalg.norm(disp, axis=1) + 1e-9
    pos += (disp / dlen[:, None]) * np.minimum(dlen, temp)[:, None]
    temp = max(temp * 0.99, 0.004)
pos = (pos - pos.min(0)) / (np.ptp(pos, axis=0) + 1e-9) * 0.9 + 0.05  # auf [0.05,0.95] normieren

# Insel-Radius je Hub (fuer Kollision + Schwarm-Streuung)
isl = np.array([0.013 + 0.030 * np.sqrt(min(hubc[h], SWARM_CAP) / SWARM_CAP) for h in hubids])
# Kollision: ueberlappende Hub-Inseln auseinanderdruecken (kein zentraler Klumpen)
for _ in range(90):
    delta = pos[:, None, :] - pos[None, :, :]
    dist = np.sqrt((delta ** 2).sum(2))
    np.fill_diagonal(dist, np.inf)
    minsep = isl[:, None] + isl[None, :] + 0.007
    overlap = np.maximum(minsep - dist, 0)
    direction = np.nan_to_num(delta / dist[:, :, None])
    pos += (overlap[:, :, None] * direction * 0.5).sum(1)
pos = np.clip(pos, 0.03, 0.97)

def age_code(ts):
    # createdAt (String oder Datetime) -> Monate seit 2020-01 (kompakt, sortierbar); fehlend -> -1
    if not ts:
        return -1
    s = str(ts)
    try:
        return (int(s[0:4]) - 2020) * 12 + (int(s[5:7]) - 1)
    except (ValueError, IndexError):
        return -1


tasks, task_idx = [], {}


def task_code(t):
    if not t:
        return -1
    if t not in task_idx:
        task_idx[t] = len(tasks)
        tasks.append(t)
    return task_idx[t]


# --- Within-Family-Layout: Kinder je Hub-Insel radial, nach Vermehrungsart GRUPPIERT (Arcs),
#     in der Gruppe nach Downloads. Position zeigt die rel-Komposition; Groesse/Helligkeit kommen
#     im Frontend aus Downloads/Alter. So zeigt "reinzoomen" Struktur statt Zufallsstaub. ---
by_hub = {}
for parent, child, rel, dl, created, likes, ptag in swarm:
    by_hub.setdefault(parent, []).append((child, rel, dl or 0, created, likes or 0, ptag))

fx, fy, fr, fname, ffid, fdl, flk, fage, ftask = [], [], [], [], [], [], [], [], []
for p, kids in by_hub.items():
    i = hub_index[p]
    cx, cy = pos[i]
    rad = isl[i] * 0.95
    kids.sort(key=lambda z: (REL_IDX.get(z[1], 0), -z[2]))  # rel-Gruppen bilden zusammenhaengende Arcs
    m = len(kids)
    for j, (child, rel, dl, created, likes, ptag) in enumerate(kids):
        ang = 2 * np.pi * (j + 0.5) / m
        rr = rad * (0.22 + 0.76 * np.sqrt(rng.random()))
        x = float(np.clip(cx + np.cos(ang) * rr, 0.004, 0.996))
        y = float(np.clip(cy + np.sin(ang) * rr, 0.004, 0.996))
        fx.append(int(x * 1000))
        fy.append(int(y * 1000))
        fr.append(REL_IDX.get(rel, 0))
        fname.append(short(child))
        ffid.append(child)
        fdl.append(int(dl))
        flk.append(int(likes))
        fage.append(age_code(created))
        ftask.append(task_code(ptag))

hub_out = [{
    "id": h, "label": short(h), "org": org(h), "c": hubc[h],
    "x": int(pos[i, 0] * 1000), "y": int(pos[i, 1] * 1000), "age": age_code(hub_created.get(h)),
} for i, h in enumerate(hubids)]

ages_known = [a for a in fage if a >= 0] + [h["age"] for h in hub_out if h["age"] >= 0]
age_range = [min(ages_known), max(ages_known)] if ages_known else [0, 1]

out = {
    "hubs": hub_out,
    "edges": [{"s": a, "t": b, "rel": r, "sup": sup} for a, b, r, sup in edge_idx],
    "field": {"x": fx, "y": fy, "r": fr, "name": fname, "fid": ffid, "dl": fdl, "lk": flk, "age": fage, "task": ftask},
    "tasks": tasks,
    "ageRange": age_range,
    "rels": [{"rel": r, "color": REL_COLOR[r], "pct": round(100 * rel_counts.get(r, 0) / total_edges, 1)} for r in REL],
    "facts": {
        "totalModels": total_models, "totalEdges": total_edges, "baseModels": base_models,
        "top100Pct": round(100 * top100 / total_edges, 1), "merges": merges,
        "maxParents": max_parents, "multiGen": multi_gen,
    },
}
(LAYOUT.app_data / "familytree.json").write_text(json.dumps(out))
print(f"familytree.json: {len(hub_out)} Hubs, {len(edge_idx)} Hub-Kanten, {len(fx)} Schwarm-Punkte")
print("Top-Hubs:", [(short(h), hubc[h]) for h in hubids[:6]])
print("Fakten:", out["facts"])
print("Vermehrungsarten:", [(r["rel"], f"{r['pct']}%") for r in out["rels"]])
