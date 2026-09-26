"""Draws the diagram that explains the tour settings, in German and English.

Writes data/tour-settings-de.svg and data/tour-settings-en.svg (lifelist.py puts the one of the page's
language into the tours' settings) and docs/tour-settings.png for the README (needs playwright).
The example values are the defaults for "on foot, easy" (TOUR_MODES in src/tours.js); run this again
after changing them or the names of the settings.

Usage: python tools/make_tour_diagram.py
"""
import math
import os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

W, PH = 1000, 215
H = 70 + 6 * PH + 10
G, O, GR, LG, TX, MU = "#2e7d4f", "#c0772a", "#9aa0a6", "#e8ece9", "#1f2a24", "#5f6b64"

TEXTS = {
    "de": {
        "title": "Touren: was die Einstellungen bedeuten", "example": "Beispielwerte: zu Fuß, gemütlich",
        "choices": "Die vier Auswahlfelder",
        "choicesText": ["Sie füllen alle Zahlen darunter aus.", "Jede Zahl lässt sich danach mit ihrem", "Schieberegler einzeln ändern."],
        "rows": [("Unterwegs", "zu Fuß · Fahrrad", "Grundwerte aller Regler|zu Fuß: 4 km/h · 0,5 km · 15 min · 250 m · 1 km · 60 min"),
                 ("Tempo", "Schnecke · gemütlich · zügig · Jaguar", "Geschwindigkeit × 0,5 · 1 · 1,5 · 2,5"),
                 ("Meldelücken", "bis 30 min · bis 60 min", "Max. Meldelücke 30 · 60 min"),
                 ("Anhalten", "selten · oft", "Geschwindigkeit × 1 · 0,7 (oft anhalten = langsamer)")],
        "gap": "Max. Meldelücke (30 min)",
        "gapText": ["Die längste Zeit ohne Meldung, die noch", "zur selben Tour gehört. Liegt mehr", "dazwischen (Picknick, Autofahrt),", "beginnt eine neue Tour."],
        "gapSame": "25 min ≤ 30: gleiche Tour", "gapNew": "55 min > 30: neue Tour", "tour": "Tour",
        "dist": "Grundabstand (0,5 km) + Geschwindigkeit (4 km/h)",
        "distText": ["Die nächste Meldung muss so nah sein,", "dass du sie in der Zeit dazwischen", "erreichen konntest:", "Grundabstand + Geschwindigkeit × Zeit.",
                     "Der Grundabstand fängt ab, dass Vögel oft", "ein Stück entfernt eingetragen werden."],
        "rec": "Meldung 7:00", "base": "0,5 km", "reach": "0,5 km + 4 km/h × 15 min = 1,5 km",
        "near": "7:15, 1,25 km entfernt:", "nearOk": "gehört dazu", "far": "7:15, 4 km entfernt:", "farNo": "zu weit, neue Tour",
        "win": "Zeitfenster (15 min)",
        "winText": ["Die Koordinaten einer Meldung zeigen oft,", "wo der Vogel war, nicht wo du standst.", "Deshalb werden die Meldungen einer Tour",
                    "in Zeitfenster geteilt; jedes wird zu", "einem Punkt in ihrer Mitte (mit Handy-GPS", "zählt nur dieser)."],
        "way": "dein Weg (unbekannt)", "winKey": "○ Meldung (Vogelposition)   ● Mitte des Zeitfensters",
        "stop": "Pausen-Umkreis (250 m)",
        "stopText": ["Liegen aufeinanderfolgende Zeitfenster", "so nah beieinander, warst du dort länger:", "Sie werden eine Pause. Die Pausen sind",
                     "die Punkte der Tour auf der Karte, ihre", "Zahl steht in der Spalte „Pausen“, die", "Strecke ist die Linie durch sie."],
        "stopMerge": "3 Zeitfenster = 1 Pause", "stopR": "250 m", "stopSum": "4 Pausen → Spalte „Pausen“ · Linie = Strecke",
        "min": "Mindestlänge (1 km) und Mindestdauer (60 min)",
        "minText": ["Kürzere Touren werden nicht gezeigt,", "z. B. ein kurzer Stopp am Feldrand.", "Beide Bedingungen müssen erfüllt sein."],
        "short": "0,6 km · 40 min", "hidden": "wird ausgeblendet", "long": "3,2 km · 2 h 10 min", "shown": "wird gezeigt",
    },
    "en": {
        "title": "Tours: what the settings mean", "example": "Example values: on foot, easy",
        "choices": "The four choices",
        "choicesText": ["They fill in all the numbers below.", "Each number can then be changed", "on its own with its slider."],
        "rows": [("Getting about", "on foot · bicycle", "Starting values of all sliders|on foot: 4 km/h · 0.5 km · 15 min · 250 m · 1 km · 60 min"),
                 ("Pace", "snail · easy · brisk · jaguar", "Speed × 0.5 · 1 · 1.5 · 2.5"),
                 ("Record gaps", "up to 30 min · up to 60 min", "Max. record gap 30 · 60 min"),
                 ("Stopping", "rarely · often", "Speed × 1 · 0.7 (stopping often = slower)")],
        "gap": "Max. record gap (30 min)",
        "gapText": ["The longest time without a record that", "still belongs to the same tour. With more", "in between (a picnic, a drive), a new", "tour begins."],
        "gapSame": "25 min ≤ 30: same tour", "gapNew": "55 min > 30: new tour", "tour": "Tour",
        "dist": "Base distance (0.5 km) + speed (4 km/h)",
        "distText": ["The next record must be close enough", "to reach in the time between them:", "base distance + speed × time.",
                     "The base distance allows for birds", "often being recorded some way off."],
        "rec": "record 7:00", "base": "0.5 km", "reach": "0.5 km + 4 km/h × 15 min = 1.5 km",
        "near": "7:15, 1.25 km away:", "nearOk": "belongs to it", "far": "7:15, 4 km away:", "farNo": "too far, new tour",
        "win": "Time window (15 min)",
        "winText": ["A record's coordinates often show where", "the bird was, not where you stood. So a", "tour's records are cut into time windows;",
                    "each becomes one point in their middle", "(where your phone's GPS is known, only", "that counts)."],
        "way": "your way (unknown)", "winKey": "○ record (bird's position)   ● middle of the time window",
        "stop": "Stop radius (250 m)",
        "stopText": ["Where time windows in a row lie this", "close together, you stayed a while: they", "make one stop. The stops are the tour's",
                     "points on the map, their number is in the", "\"Stops\" column, the length is the line", "through them."],
        "stopMerge": "3 time windows = 1 stop", "stopR": "250 m", "stopSum": "4 stops → \"Stops\" column · line = length",
        "min": "Minimum length (1 km) and minimum duration (60 min)",
        "minText": ["Shorter tours are not shown, e.g. a", "short stop at the edge of a field.", "Both conditions must be met."],
        "short": "0.6 km · 40 min", "hidden": "is hidden", "long": "3.2 km · 2 h 10 min", "shown": "is shown",
    },
}


def esc(s):
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")


def draw(L):
    out = []
    a = out.append

    def text(x, y, s, size=13, color=TX, weight="normal", anchor="start", italic=False):
        it = ' font-style="italic"' if italic else ""
        a(f'<text x="{x:.1f}" y="{y:.1f}" font-size="{size}" fill="{color}" font-weight="{weight}" text-anchor="{anchor}"{it}>{esc(s)}</text>')

    def para(x, y, lines):
        for i, s in enumerate(lines):
            text(x, y + i * 18, s, 13, MU)

    def dot(x, y, r=5, fill=G, stroke="none"):
        a(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r}" fill="{fill}" stroke="{stroke}" stroke-width="1.5"/>')

    def line(x1, y1, x2, y2, color=GR, w=1.5, dash=""):
        da = f' stroke-dasharray="{dash}"' if dash else ""
        a(f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" stroke="{color}" stroke-width="{w}"{da}/>')

    def panel(i, title, lines):
        y = 70 + i * PH
        a(f'<rect x="16" y="{y}" width="{W - 32}" height="{PH - 14}" rx="10" fill="#fff" stroke="#dde3df"/>')
        text(34, y + 30, title, 16, TX, "bold")
        para(34, y + 56, lines)
        return y

    a(f'<rect width="{W}" height="{H}" rx="12" fill="#f4f6f5"/>')
    text(34, 42, L["title"], 22, TX, "bold")
    text(W - 34, 42, L["example"], 13, MU, anchor="end")

    # the four choices and the numbers they set
    y = panel(0, L["choices"], L["choicesText"])
    for k, (name, opts, eff) in enumerate(L["rows"]):
        yy = y + 34 + k * 40
        a(f'<rect x="390" y="{yy}" width="250" height="30" rx="6" fill="{LG}"/>')
        text(400, yy + 14, name, 12, TX, "bold")
        text(400, yy + 26, opts, 11, MU)
        line(642, yy + 15, 668, yy + 15, G, 2)
        a(f'<path d="M668 {yy + 10} L676 {yy + 15} L668 {yy + 20} Z" fill="{G}"/>')
        if "|" in eff:
            e1, e2 = eff.split("|")
            text(684, yy + 13, e1, 12, TX)
            text(684, yy + 27, e2, 11, MU)
        else:
            text(684, yy + 19, eff, 12, TX)

    # max. record gap: a timeline with two tours
    y = panel(1, L["gap"], L["gapText"])
    x0, x1, ty = 430, 960, y + 130
    px = lambda m: x0 + m * (x1 - x0) / 180  # noqa: E731
    line(x0, ty, x1, ty, GR, 2)
    for m, lab in [(0, "7:00"), (60, "8:00"), (120, "9:00"), (180, "10:00")]:
        line(px(m), ty - 5, px(m), ty + 5, GR)
        text(px(m), ty + 22, lab, 11, MU, anchor="middle")
    a(f'<rect x="{px(0) - 10:.1f}" y="{ty - 16}" width="{px(65) - px(0) + 20:.1f}" height="32" rx="16" fill="{G}" opacity=".12"/>')
    a(f'<rect x="{px(120) - 10:.1f}" y="{ty - 16}" width="{px(150) - px(120) + 20:.1f}" height="32" rx="16" fill="{O}" opacity=".14"/>')
    for m in [0, 10, 25, 40, 65]:
        dot(px(m), ty, 6, G)
    for m in [120, 135, 150]:
        dot(px(m), ty, 6, O)

    def brace(m1, m2, label, color, yy):
        line(px(m1), yy, px(m2), yy, color)
        line(px(m1), yy - 4, px(m1), yy + 4, color)
        line(px(m2), yy - 4, px(m2), yy + 4, color)
        text((px(m1) + px(m2)) / 2, yy - 8, label, 12, color, "bold", "middle")
    brace(40, 65, L["gapSame"], G, ty - 36)
    brace(65, 120, L["gapNew"], O, ty - 62)
    text(px(20), ty + 48, L["tour"] + " 1", 12, G, "bold", "middle")
    text(px(135), ty + 48, L["tour"] + " 2", 12, O, "bold", "middle")

    # base distance + speed: how far the next record may be
    y = panel(2, L["dist"], L["distText"])
    cx, cy, km = 640, y + 125, 45
    a(f'<circle cx="{cx}" cy="{cy}" r="{1.5 * km}" fill="{G}" fill-opacity=".08" stroke="{G}" stroke-width="1.5"/>')
    a(f'<circle cx="{cx}" cy="{cy}" r="{0.5 * km}" fill="none" stroke="{GR}" stroke-width="1.5" stroke-dasharray="4 3"/>')
    dot(cx, cy, 6, G)
    text(cx, cy + 44, L["rec"], 11, TX, anchor="middle")
    line(cx, cy, cx - 0.5 * km * 0.71, cy - 0.5 * km * 0.71, GR, 1)
    text(cx - 0.5 * km - 4, cy - 4, L["base"], 11, MU, anchor="end")
    text(cx, cy - 1.5 * km - 8, L["reach"], 12, G, "bold", "middle")
    bx, by = cx + 1.25 * km * math.cos(-0.5), cy + 1.25 * km * math.sin(-0.5)
    dot(bx, by, 6, G)
    text(bx + 16, by - 4, L["near"], 12, G, "bold")
    text(bx + 16, by + 11, L["nearOk"], 12, G)
    cx2 = cx + 4 * km
    dot(cx2, cy + 20, 6, O)
    line(cx + 8, cy + 3, cx2 - 8, cy + 18, O, 1.2, "3 3")
    text(cx2 + 12, cy + 16, L["far"], 12, O, "bold")
    text(cx2 + 12, cy + 31, L["farNo"], 12, O)

    # time windows: the middle of each window's records estimates where you were
    y = panel(3, L["win"], L["winText"])
    py = lambda x: y + 160 - (x - 430) / 530 * 85  # noqa: E731
    a(f'<path d="M430 {py(430):.1f} C 560 {py(430) - 10:.1f}, 700 {py(700) + 25:.1f}, 960 {py(960):.1f}" fill="none" stroke="{GR}" stroke-width="2" stroke-dasharray="6 5"/>')
    text(662, py(662) + 26, L["way"], 11, MU, italic=True)
    wins = [(480, "7:00–7:15", [(-30, -22), (-5, 26), (20, -30), (32, 12)]), (620, "7:15–7:30", [(-25, 24), (6, -28), (28, 20)]),
            (770, "7:30–7:45", [(-28, -20), (-6, 28), (22, -26), (34, 8), (0, -40)]), (910, "7:45–8:00", [(-20, 24), (18, -24)])]
    for k, (wx, lab, pts) in enumerate(wins):
        col = G if k % 2 == 0 else O
        wy = py(wx) + 6
        mx, my = wx + sum(p[0] for p in pts) / len(pts), wy + sum(p[1] for p in pts) / len(pts)
        for dx, dy in pts:
            line(wx + dx, wy + dy, mx, my, col, 0.8, "2 2")
            dot(wx + dx, wy + dy, 3.5, "#fff", col)
        dot(mx, my, 7, col)
        text(wx, y + 196, lab, 11, col, "bold", "middle")
    text(430, y + 44, L["winKey"], 11, MU)

    # stop radius: windows close together become one stop
    y = panel(4, L["stop"], L["stopText"])
    pts = [(470, 138), (492, 124), (512, 138), (640, 108), (770, 94), (792, 86), (920, 70)]
    groups = [[0, 1, 2], [3], [4, 5], [6]]
    stops = [(sum(pts[i][0] for i in g) / len(g), y + sum(pts[i][1] for i in g) / len(g)) for g in groups]
    for (ax, ay), (bx_, by_) in zip(stops, stops[1:]):
        line(ax, ay, bx_, by_, G, 3)
    for gi, g in enumerate(groups):
        gx, gy = stops[gi]
        a(f'<circle cx="{gx:.1f}" cy="{gy:.1f}" r="38" fill="{G}" fill-opacity=".07" stroke="{G}" stroke-dasharray="4 3"/>')
        for i in g:
            dot(pts[i][0], y + pts[i][1], 4, "#fff", GR)
        dot(gx, gy, 8, G)
        text(gx, gy + 5, str(gi + 1), 11, "#fff", "bold", "middle")
    text(stops[0][0], stops[0][1] + 52, L["stopMerge"], 11, MU, anchor="middle")
    text(stops[0][0] + 30, stops[0][1] - 32, L["stopR"], 11, G)
    text(960, y + 190, L["stopSum"], 12, G, "bold", "end")

    # minimum length and duration
    y = panel(5, L["min"], L["minText"])

    def mini(x, yy, pts_, col, label, sub, faded):
        a('<g opacity=".4">' if faded else "<g>")
        for p1, p2 in zip(pts_, pts_[1:]):
            line(x + p1[0], yy + p1[1], x + p2[0], yy + p2[1], col, 3)
        for p in pts_:
            dot(x + p[0], yy + p[1], 6, col)
        a("</g>")
        text(x, yy + 62, label, 12, col, "bold")
        text(x, yy + 78, sub, 12, MU)
    mini(440, y + 70, [(0, 20), (40, 6)], GR, L["short"], L["hidden"], True)
    line(430, y + 60, 500, y + 104, O, 2)
    line(500, y + 60, 430, y + 104, O, 2)
    mini(640, y + 70, [(0, 30), (60, 10), (130, 22), (200, -4), (270, 12)], G, L["long"], L["shown"], False)

    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" role="img" '
            f'aria-label="{esc(L["title"])}" font-family="Segoe UI, Helvetica, Arial, sans-serif">' + "".join(out) + "</svg>")


def main():
    svgs = {}
    for lang, texts in TEXTS.items():
        svgs[lang] = draw(texts)
        path = os.path.join(ROOT, "data", f"tour-settings-{lang}.svg")
        with open(path, "w", encoding="utf-8") as fh:
            fh.write(svgs[lang])
        print("Written:", os.path.relpath(path, ROOT))
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("playwright is not installed: docs/tour-settings.png not updated")
        return
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        page = browser.new_page(viewport={"width": W, "height": H}, device_scale_factor=1.5)
        page.set_content(f"<html><body style='margin:0'>{svgs['de']}</body></html>")
        page.locator("svg").screenshot(path=os.path.join(ROOT, "docs", "tour-settings.png"))
        browser.close()
    print("Written: docs/tour-settings.png")


if __name__ == "__main__":
    main()
