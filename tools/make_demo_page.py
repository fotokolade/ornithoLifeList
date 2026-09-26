"""Builds the demo life list from tools/make_demo_export.py's made-up export, for the release and GitHub Pages.

Usage:  python tools/make_demo_page.py [output.html]      (default: lifelist-demo.html)

Nothing in it is a real observation (see make_demo_export.py), so the page may be shared freely.
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, ROOT)
sys.path.insert(0, HERE)

import lifelist  # noqa: E402
import make_demo_export  # noqa: E402


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "lifelist-demo.html")
    data = lifelist.build_page_data(make_demo_export.generate(), "export_demo.json", False)
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    with open(out, "w", encoding="utf-8") as fh:
        fh.write(lifelist.render_html(data))
    print(f"Written: {out}")


if __name__ == "__main__":
    main()
