"""Pfadauflösung für das Arbeits-Repo und den gepackten Abgabeordner."""

from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class DataLayout:
    raw: Path
    app_data: Path
    validation: Path
    display_root: Path


def resolve_layout(script_file: str) -> DataLayout:
    """Liefert dieselben logischen Pfade in beiden unterstützten Layouts.

    Arbeits-Repo:
      inside-ai/daten/*.py
      inside-ai/daten-raw/
      inside-ai/app/public/data/

    Abgabepaket und oeffentliches Repository:
      data/pipelines/*.py
      data/daten-raw/                 (wird bei einem Neuaufbau angelegt)
      project/quellcode/public/data/  (Abgabepaket) oder app/public/data/ (Repository)
      data/heuristik-validierung/
    """

    script_dir = Path(script_file).resolve().parent
    if script_dir.name == "daten":
        project_root = script_dir.parent
        return DataLayout(
            raw=project_root / "daten-raw",
            app_data=project_root / "app/public/data",
            validation=script_dir / "validation",
            display_root=project_root,
        )

    if script_dir.name == "pipelines" and script_dir.parent.name == "data":
        submission_root = script_dir.parents[1]
        repo_app_data = submission_root / "app/public/data"
        return DataLayout(
            raw=submission_root / "data/daten-raw",
            app_data=repo_app_data
            if repo_app_data.is_dir()
            else submission_root / "project/quellcode/public/data",
            validation=submission_root / "data/heuristik-validierung",
            display_root=submission_root,
        )

    raise RuntimeError(f"Unbekanntes Datenpipeline-Layout: {script_dir}")
