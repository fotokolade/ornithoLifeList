"""Takes the README screenshots in docs/screenshots/ from made-up demo data.

Usage:  python tools/make_screenshots.py [--map]

Builds a page from tools/make_demo_export.py's fictional export (no real data involved), opens it
in headless Chromium with the clock set to a fixed spring day, and saves one picture per feature.
--map also takes the map, which needs internet access for the map tiles.
Needs `pip install playwright` and `playwright install chromium`.
"""
import argparse
import os
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, ROOT)
sys.path.insert(0, HERE)
import lifelist  # noqa: E402
import make_demo_export  # noqa: E402
try:
    from playwright.sync_api import sync_playwright
except ImportError:
    sys.exit("Playwright is missing. Install it with:\n  pip install playwright\n  python -m playwright install chromium")

OUT = os.path.join(ROOT, "docs", "screenshots")
TODAY = "2026-05-20T10:00:00"  # two days after the demo data ends: a lively time of year for the wishlist


def section(page, first, last=None, pad=12):
    """Clip from the top of `first` to the bottom of `last` (both selectors), full page width of the content."""
    top = page.locator(first).first.bounding_box()
    bottom = page.locator(last or first).first.bounding_box()
    main = page.locator("main").bounding_box()
    scroll = page.evaluate("window.scrollY")
    return {"x": main["x"] - pad, "y": top["y"] + scroll - pad, "width": main["width"] + 2 * pad,
            "height": bottom["y"] + bottom["height"] - top["y"] + 2 * pad}


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--map", action="store_true", help="also take the map (needs internet for the tiles)")
    opts = parser.parse_args()
    os.makedirs(OUT, exist_ok=True)
    data = lifelist.build_page_data(make_demo_export.generate(), "export_demo.json", False)
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "demo.html")
        with open(path, "w", encoding="utf-8") as fh:
            fh.write(lifelist.render_html(data))
        url = "file:///" + path.replace(os.sep, "/").lstrip("/")
        with sync_playwright() as pw:
            browser = pw.chromium.launch()

            def open_page(width=1200, height=900, theme="light", hash=""):
                ctx = browser.new_context(viewport={"width": width, "height": height}, device_scale_factor=1,
                                          color_scheme=theme)
                page = ctx.new_page()
                # the page's "today" (seasons, "last 30 days") is a fixed spring day; time keeps running so charts animate
                page.clock.install(time=TODAY)
                if not opts.map:
                    page.route("**/*", lambda r: r.abort() if r.request.url.startswith("http") else r.continue_())
                page.goto(url + hash)
                page.wait_for_timeout(600)
                # the fixed footer would sit on top of clipped full-page shots
                # the fixed footer and the sticky header would sit on top of clipped full-page shots
                page.add_style_tag(content="footer.meta-footer{display:none!important} header.top{position:static!important}")
                return page

            def last_full_year(page):
                page.eval_on_selector("#t-range", "e => { e.value = timeYMIndex(MAX_Y - 1, 12); e.dispatchEvent(new Event('input')); }")
                page.wait_for_timeout(500)

            def shot(page, name, clip):
                page.screenshot(path=os.path.join(OUT, name), clip=clip, full_page=True)
                print("Written:", os.path.join("docs", "screenshots", name))

            # Übersicht: key figures and the calendar of the last full year, with its richest day opened
            page = open_page()
            last_full_year(page)
            page.evaluate("""() => {
                const days = [...document.querySelectorAll('#tab-overview button.cal-day')];
                const n = b => parseInt(b.title.split(': ')[1]);
                days.reduce((a, b) => n(b) > n(a) ? b : a).click();
            }""")
            page.wait_for_timeout(200)
            shot(page, "overview.png", section(page, "header.top", "#tab-overview .cal-panel"))

            # Lebensliste: the curve, a search and a species with its detail row
            page = open_page(hash="#list")
            page.fill("#q", "specht")
            page.wait_for_timeout(200)
            page.locator("#list-out tr.row", has_text="Buntspecht").click()
            page.wait_for_timeout(200)
            shot(page, "lifelist.png", section(page, "#list-curve h2", "#list-out tbody tr:last-child"))

            # Ziele: species still missing, grouped by season
            page = open_page(hash="#targets")
            h2 = "#tab-targets h2:last-of-type"
            last_row = page.locator("#wish-out tbody tr").nth(12)
            last_row.scroll_into_view_if_needed()
            shot(page, "targets.png", section(page, h2, f"#wish-out tbody tr >> nth=12"))

            # Tagesaktivität: course of the day and weekdays
            page = open_page(hash="#activity")
            page.wait_for_selector("#weekday-card canvas")
            page.wait_for_timeout(500)
            shot(page, "activity.png", section(page, "#act-out h2", "#act-out .wd-grid"))

            # Regionen: where you are out in which month, with a cell opened
            page = open_page(hash="#regions")
            # the Alps trip: a short panel with species you only see there
            page.locator("table.heat.rm tr", has_text="Berchtesgadener Land").locator("td[data-rm]").first.click()
            page.wait_for_timeout(200)
            shot(page, "regions.png", section(page, "h2:has(#rm-level)", "#rm-cell"))

            # Touren: tours rebuilt from the records, one opened
            page = open_page(hash="#tours")
            page.click("#tour-cfg-sum")  # the settings menu, unfolded
            page.locator("#tab-tours tr.row").nth(2).click()
            page.wait_for_timeout(200)
            shot(page, "tours.png", section(page, "#tab-tours details.tour-settings", "#tab-tours tbody tr:nth-child(6)"))

            # dark theme and phone
            page = open_page(theme="dark", hash="#overview")
            last_full_year(page)
            shot(page, "dark.png", section(page, "#tab-overview .kpis", "#tab-overview .card:has(svg.curve)"))
            page = open_page(width=390, height=844)
            page.screenshot(path=os.path.join(OUT, "phone.png"))
            print("Written:", os.path.join("docs", "screenshots", "phone.png"))

            if opts.map:
                page = open_page(hash="#map")
                page.wait_for_timeout(4000)
                shot(page, "map.png", section(page, "#map"))
                try:  # map tiles make a big PNG; 256 colours look the same at a third of the size
                    from PIL import Image
                    out = os.path.join(OUT, "map.png")
                    Image.open(out).convert("RGB").quantize(colors=256).save(out, optimize=True)
                except ImportError:
                    pass
            browser.close()


if __name__ == "__main__":
    main()
