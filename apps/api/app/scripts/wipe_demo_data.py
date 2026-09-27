"""Entry point: python -m app.scripts.wipe_demo_data

Delegates to apps/api/scripts/wipe_demo_data.py
"""

from __future__ import annotations

import runpy
from pathlib import Path


def main() -> None:
    target = Path(__file__).resolve().parents[2] / "scripts" / "wipe_demo_data.py"
    runpy.run_path(str(target), run_name="__main__")


if __name__ == "__main__":
    main()
