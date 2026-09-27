"""Entry point: python -m app.scripts.scrape_bizimhesap_hesaplarim

Delegates to apps/api/scripts/scrape_bizimhesap_hesaplarim.py
"""

from __future__ import annotations

import runpy
from pathlib import Path


def main() -> None:
    target = Path(__file__).resolve().parents[2] / "scripts" / "scrape_bizimhesap_hesaplarim.py"
    runpy.run_path(str(target), run_name="__main__")


if __name__ == "__main__":
    main()
