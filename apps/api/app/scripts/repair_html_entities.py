"""Entry point: python -m app.scripts.repair_html_entities

Delegates to apps/api/scripts/repair_html_entities.py
"""
from __future__ import annotations

import runpy
from pathlib import Path


def main() -> None:
    target = Path(__file__).resolve().parents[2] / "scripts" / "repair_html_entities.py"
    runpy.run_path(str(target), run_name="__main__")


if __name__ == "__main__":
    main()
