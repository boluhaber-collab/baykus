"""Entry point: python -m app.scripts.import_bizimhesap_stock

Delegates to apps/api/scripts/import_bizimhesap_stock.py
"""

from __future__ import annotations

import runpy
from pathlib import Path


def main() -> None:
    target = Path(__file__).resolve().parents[2] / "scripts" / "import_bizimhesap_stock.py"
    runpy.run_path(str(target), run_name="__main__")


if __name__ == "__main__":
    main()
