"""Generates a made-up but realistic-looking ornitho.de export, for screenshots and demos.

Usage:  python tools/make_demo_export.py [output.json]      (default: demo_export.json)

The default name deliberately does not match export_*.json, so a later `python lifelist.py` in the same
folder does not merge the made-up records into a real life list; use --source demo_export.json for it.

Nothing in it is a real observation: a fictional birder from near Dresden visits real birding spots
at home, more often at weekends and in spring, mostly in the morning, and takes a few birding trips
across Germany each year (Wadden Sea, Müritz, Alps, Kaiserstuhl, ...). Over the years they discover
new spots and find scarcer species; each species turns up according to its habitat, season and how
common it is.
The same seed always gives the same file.
"""
import json
import math
import os
import random
import sys
from datetime import date, timedelta

SEED = 7
FIRST, LAST = date(2019, 3, 2), date(2026, 5, 18)

# id, name, municipality (state, county), lat, lon, habitats, weight (how often the birder goes there),
# first year: the birder discovers new spots over the years, so the life list keeps growing
PLACES = [
    ("1", "Garten", "Radebeul (SN, MEI)", 51.108, 13.660, "garden", 9, 2019),
    ("2", "Moritzburger Teiche", "Moritzburg (SN, MEI)", 51.163, 13.679, "water forest", 6, 2019),
    ("3", "Elbwiesen Übigau", "Dresden (SN, DD)", 51.078, 13.705, "water open", 5, 2019),
    ("4", "Großer Garten", "Dresden (SN, DD)", 51.038, 13.763, "garden forest", 4, 2020),
    ("5", "Königsbrücker Heide", "Königsbrück (SN, BZ)", 51.302, 13.930, "open forest", 3, 2021),
    ("6", "Guttauer Teiche", "Malschwitz (SN, BZ)", 51.262, 14.548, "water open", 3, 2021),
    ("7", "Teichgebiet Niederspree", "Hähnichen (SN, GR)", 51.402, 14.803, "water forest", 2, 2022),
    ("8", "Talsperre Quitzdorf", "Quitzdorf am See (SN, GR)", 51.282, 14.772, "water open", 2, 2022),
    ("9", "Bastei", "Lohmen (SN, PIR)", 50.962, 14.073, "forest rock", 2, 2023),
    ("10", "Auwald Leipzig", "Leipzig (SN, L)", 51.340, 12.340, "forest water", 1, 2024),
    ("11", "Fichtelberg", "Oberwiesenthal (SN, ERZ)", 50.429, 12.954, "mountain forest", 1, 2025),
]

# rounds at some home spots: the birder walks a loop (or rides along the Elbe) and reports on the way,
# which the page's Touren tab turns back into tours: ten points some 380 m apart, a little under 4 km
def _loop(pid, name, lat, lon, r_m=600, n=10):
    dlat, dlon = r_m / 111320, r_m / (111320 * math.cos(math.radians(lat)))
    return [(f"{pid}-{i + 1}", f"{name}, Rundweg {i + 1}", round(lat + dlat * math.sin(2 * math.pi * i / n), 5),
             round(lon + dlon * math.cos(2 * math.pi * i / n), 5)) for i in range(n)] + [(f"{pid}-1", f"{name}, Rundweg 1", round(lat, 5), round(lon + dlon, 5))]


WALKS = {
    "2": _loop("2", "Moritzburger Teiche", 51.1640, 13.6780),
    "3": [(f"3-{i + 1}", f"Elbwiesen, Radweg km {i * 0.39:.1f}".replace(".", ","), round(51.0780 - 0.0015 * i, 5), round(13.7050 + 0.0050 * i, 5))
          for i in range(10)],
    "4": _loop("4", "Großer Garten", 51.0355, 13.7640),
}

# birding trips: first day, number of days, places (id, name, municipality, lat, lon, habitats)
TRIPS = [
    ("2019-09-14", 3, [("30", "Hauke-Haien-Koog", "Reußenköge (SH, NF)", 54.605, 8.870, "coast water open")]),
    ("2020-05-21", 3, [("31", "Müritz-Nationalpark, Boeker Mühle", "Rechlin (MV, MÜR)", 53.378, 12.782, "water forest open")]),
    ("2021-10-02", 4, [("32", "Pramort", "Zingst (MV, NVP)", 54.438, 12.790, "coast open"),
                       ("33", "Großer Werder", "Zingst (MV, NVP)", 54.450, 12.703, "coast water")]),
    ("2022-06-18", 4, [("34", "Jenner", "Schönau am Königssee (BY, BGL)", 47.577, 13.022, "alpine mountain rock forest")]),
    ("2022-10-08", 3, [("35", "Helgoland, Oberland", "Helgoland (SH, PI)", 54.183, 7.886, "sea coast")]),
    ("2023-04-29", 3, [("36", "Federsee", "Bad Buchau (BW, BC)", 48.068, 9.617, "water open forest")]),
    ("2023-10-21", 2, [("37", "Unteres Odertal, Criewen", "Schwedt/Oder (BB, UM)", 53.017, 14.233, "water open")]),
    ("2024-05-09", 4, [("38", "Badberg", "Vogtsburg im Kaiserstuhl (BW, FR*)", 48.101, 7.665, "south open forest")]),
    ("2024-09-28", 2, [("39", "Dümmer, Hüde", "Hüde (NI, DH)", 52.490, 8.345, "water open coast")]),
    ("2025-03-15", 2, [("40", "Kühkopf-Knoblochsaue", "Stockstadt am Rhein (HE, GG)", 49.825, 8.415, "water forest")]),
    ("2025-11-08", 3, [("30", "Hauke-Haien-Koog", "Reußenköge (SH, NF)", 54.605, 8.870, "coast water open")]),
    ("2026-04-11", 3, [("41", "Hirschauer Bucht", "Grabenstätt (BY, TS)", 47.842, 12.508, "water open")]),
]

# latin, habitats, season, commonness 1 (everywhere) .. 5 (rare)
# season: r resident, s summer (Apr-Sep), w winter (Oct-Mar), p passage (Mar-May, Aug-Oct)
SPECIES = """
Cygnus olor|water|r|1
Anser anser|water open|r|2
Anser albifrons|water open coast|w|3
Anser fabalis|water open|w|3
Branta leucopsis|coast|w|4
Tadorna tadorna|coast|r|3
Anas platyrhynchos|water garden|r|1
Mareca strepera|water|r|2
Anas crecca|water|w|2
Spatula clypeata|water|p|3
Aythya ferina|water|r|2
Aythya fuligula|water|r|2
Bucephala clangula|water|w|3
Mergus merganser|water|w|3
Phasianus colchicus|open|r|3
Perdix perdix|open|r|5
Tachybaptus ruficollis|water|r|3
Podiceps cristatus|water|r|2
Podiceps grisegena|water|s|4
Phalacrocorax carbo|water coast|r|2
Ardea cinerea|water open|r|1
Ardea alba|water open|r|2
Botaurus stellaris|water|r|5
Ciconia ciconia|open|s|3
Ciconia nigra|forest water|s|4
Pernis apivorus|forest|s|4
Milvus milvus|open|s|2
Milvus migrans|water open|s|3
Haliaeetus albicilla|water coast|r|3
Circus aeruginosus|water open|s|2
Circus cyaneus|open|w|4
Accipiter nisus|garden forest|r|3
Accipiter gentilis|forest|r|4
Buteo buteo|open forest|r|1
Pandion haliaetus|water|p|4
Falco tinnunculus|open|r|2
Falco subbuteo|open water|s|4
Falco peregrinus|rock open|r|4
Rallus aquaticus|water|r|4
Gallinula chloropus|water|r|3
Fulica atra|water|r|1
Grus grus|open water|r|2
Haematopus ostralegus|coast|r|3
Vanellus vanellus|open water|r|2
Pluvialis apricaria|open coast|p|4
Charadrius dubius|water|s|3
Charadrius hiaticula|coast|p|3
Numenius arquata|coast open|p|4
Limosa limosa|coast|p|4
Calidris alpina|coast|p|3
Calidris pugnax|coast water|p|4
Gallinago gallinago|water open|p|4
Tringa ochropus|water|p|3
Tringa glareola|water|p|4
Tringa nebularia|water coast|p|3
Actitis hypoleucos|water|p|3
Chroicocephalus ridibundus|water coast|r|1
Larus canus|water coast|w|2
Larus argentatus|coast|r|2
Larus michahellis|water|r|4
Sterna hirundo|water coast|s|3
Chlidonias niger|water|p|4
Columba oenas|forest|r|3
Columba palumbus|garden forest open|r|1
Streptopelia decaocto|garden|r|2
Cuculus canorus|forest water|s|3
Strix aluco|forest|r|4
Bubo bubo|rock|r|5
Apus apus|garden|s|2
Alcedo atthis|water|r|3
Upupa epops|open|s|5
Jynx torquilla|forest open|s|4
Dryocopus martius|forest|r|3
Dendrocopos major|garden forest|r|1
Dryobates minor|forest|r|4
Dendrocoptes medius|forest|r|4
Picus viridis|garden forest|r|3
Lanius collurio|open|s|3
Lanius excubitor|open|w|4
Oriolus oriolus|forest water|s|3
Garrulus glandarius|forest garden|r|2
Pica pica|garden open|r|1
Nucifraga caryocatactes|mountain forest|r|4
Coloeus monedula|garden open|r|2
Corvus frugilegus|open|w|2
Corvus corone|garden open|r|1
Corvus cornix|open water|r|2
Corvus corax|forest open|r|2
Regulus regulus|forest|r|3
Regulus ignicapilla|forest garden|s|3
Remiz pendulinus|water|s|4
Cyanistes caeruleus|garden forest|r|1
Parus major|garden forest|r|1
Lophophanes cristatus|forest|r|3
Periparus ater|forest mountain|r|2
Poecile palustris|forest garden|r|3
Poecile montanus|forest mountain|r|4
Panurus biarmicus|water|r|4
Lullula arborea|open forest|s|3
Alauda arvensis|open|r|2
Riparia riparia|water|s|3
Hirundo rustica|open garden|s|2
Delichon urbicum|garden|s|2
Phylloscopus sibilatrix|forest|s|3
Phylloscopus trochilus|forest open|s|2
Phylloscopus collybita|garden forest|s|1
Cettia cetti|water|r|5
Aegithalos caudatus|garden forest|r|2
Sylvia atricapilla|garden forest|s|1
Sylvia borin|forest garden|s|3
Sylvia curruca|garden open|s|3
Sylvia communis|open|s|2
Locustella naevia|open water|s|4
Acrocephalus schoenobaenus|water|s|3
Acrocephalus scirpaceus|water|s|2
Acrocephalus arundinaceus|water|s|3
Hippolais icterina|garden forest|s|3
Sitta europaea|garden forest|r|1
Certhia familiaris|forest|r|3
Certhia brachydactyla|garden forest|r|2
Troglodytes troglodytes|garden forest|r|2
Sturnus vulgaris|garden open|r|1
Turdus merula|garden forest|r|1
Turdus pilaris|open garden|w|2
Turdus iliacus|open forest|w|3
Turdus philomelos|garden forest|s|2
Turdus viscivorus|forest mountain|r|3
Muscicapa striata|garden forest|s|3
Erithacus rubecula|garden forest|r|1
Luscinia megarhynchos|water garden|s|3
Luscinia svecica|water|s|4
Ficedula hypoleuca|forest garden|s|3
Ficedula albicollis|forest|s|5
Phoenicurus ochruros|garden rock|s|2
Phoenicurus phoenicurus|garden forest|s|3
Saxicola rubetra|open|p|4
Saxicola rubicola|open|s|3
Oenanthe oenanthe|open coast|p|4
Prunella modularis|garden forest|r|2
Passer domesticus|garden|r|1
Passer montanus|garden open|r|2
Anthus trivialis|forest open|s|3
Anthus pratensis|open coast|p|3
Motacilla flava|open|s|3
Motacilla cinerea|water rock|r|3
Motacilla alba|water open garden|r|2
Fringilla coelebs|garden forest|r|1
Fringilla montifringilla|forest garden|w|3
Coccothraustes coccothraustes|garden forest|r|3
Pyrrhula pyrrhula|forest garden|r|3
Carpodacus erythrinus|water|s|5
Chloris chloris|garden|r|1
Linaria cannabina|open|r|3
Acanthis flammea / cabaret|forest garden|w|4
Loxia curvirostra|forest mountain|r|4
Carduelis carduelis|garden open|r|2
Serinus serinus|garden|s|3
Spinus spinus|forest garden|w|2
Emberiza calandra|open|r|4
Emberiza citrinella|open|r|2
Emberiza hortulana|open|s|5
Emberiza schoeniclus|water open|r|2
Larus argentatus / michahellis|water coast|r|3
Somateria mollissima|coast sea|r|2
Recurvirostra avosetta|coast|s|2
Calidris canutus|coast|p|2
Calidris alba|coast sea|p|2
Limosa lapponica|coast|p|2
Pluvialis squatarola|coast|p|2
Arenaria interpres|coast sea|p|3
Thalasseus sandvicensis|coast|s|3
Branta bernicla|coast|w|2
Morus bassanus|sea|r|1
Uria aalge|sea|r|1
Alca torda|sea|r|2
Rissa tridactyla|sea|r|1
Fulmarus glacialis|sea|r|2
Pyrrhocorax graculus|alpine|r|1
Prunella collaris|alpine|s|2
Tichodroma muraria|alpine|r|3
Aquila chrysaetos|alpine|r|3
Lagopus muta|alpine|r|4
Turdus torquatus|alpine|s|2
Anthus spinoletta|alpine|s|2
Phylloscopus bonelli|alpine|s|3
Merops apiaster|south|s|1
Emberiza cirlus|south|r|2
Otus scops|south|s|4
Crex crex|water open|s|4
Aythya nyroca|water|s|5
"""
ESCAPE = ("Cygnus atratus", "Trauerschwan", "water", "r", 5)  # a captivity escape, hidden by default


def load_names():
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "species_reference.json")
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)["lifeListNames"]


def in_season(season, month):
    return {"r": True, "s": 4 <= month <= 9, "w": month >= 10 or month <= 3,
            "p": month in (3, 4, 5, 8, 9, 10)}[season]


def sighting(sp, day, place, minutes, count, atlas, photo, gps=None, rnd=None):
    """gps: (lat, lon) where the birder stood when reporting from the phone; without it the record is tied to its place."""
    latin, name, order, rarity = sp
    observer = {
        "count": str(count), "estimation_code": "EXACT_VALUE",
        "timing": {"@notime": "0" if minutes >= 0 else "1",
                   "@ISO8601": f"{day}T{max(minutes, 0) // 60:02d}:{max(minutes, 0) % 60:02d}:00+02:00"},
    }
    pid, pname, muni, lat, lon = place[:5]
    if gps:
        # the bird is marked where it was, typically some 80 m from where the birder stood
        bird = (gps[0] + rnd.uniform(-0.0008, 0.0008), gps[1] + rnd.uniform(-0.0012, 0.0012))
        observer.update({"gps_lat": f"{gps[0]:.6f}", "gps_lon": f"{gps[1]:.6f}", "precision": "precise",
                         "coord_lat": f"{bird[0]:.6f}", "coord_lon": f"{bird[1]:.6f}"})
    else:
        observer.update({"precision": "place", "coord_lat": str(lat), "coord_lon": str(lon)})
    if atlas:
        observer["atlas_code"] = {"@id": "1", "#text": atlas}
    if photo:
        observer["medias"] = [{"type": "PHOTO"}]
    return {
        "date": {"@ISO8601": f"{day}T00:00:00+02:00"},
        "species": {"name": name, "latin_name": latin, "sys_order": str(order), "rarity": rarity},
        "place": {"@id": pid, "name": pname, "municipality": muni, "coord_lat": str(lat), "coord_lon": str(lon)},
        "observers": [observer],
    }


def generate():
    rnd = random.Random(SEED)
    names = load_names()
    species = []
    for order, line in enumerate(l for l in SPECIES.strip().splitlines() if l):
        latin, habitats, season, tier = line.split("|")
        de = names.get(latin, {}).get("de") or names.get(" ".join(latin.split()[:2]), {}).get("de")
        if not de:
            raise SystemExit(f"unknown species in species_reference.json: {latin}")
        species.append(((latin, de, 100 + order, "common"),
                        set(habitats.split()), season, int(tier)))
    species.append(((ESCAPE[0], ESCAPE[1], 999, "escaped"), set(ESCAPE[2].split()), ESCAPE[3], ESCAPE[4]))

    trips = [(date.fromisoformat(first), days, places) for first, days, places in TRIPS]
    out = []
    d = FIRST
    while d <= LAST:
        weekend = d.weekday() >= 5
        spring = d.month in (4, 5)
        # the birder goes out more at weekends and in spring, rarely in deep winter
        chance = (0.62 if weekend else 0.12) * (1.4 if spring else 0.6 if d.month in (12, 1) else 1)
        # and gets better at finding the scarcer species over the years
        skill = 0.35 + 0.65 * min(1, (d.year - FIRST.year) / 6)
        known = [p for p in PLACES if p[7] <= d.year]
        visits = []
        trip = next((t for t in trips if t[0] <= d < t[0] + timedelta(days=t[1])), None)
        if trip:
            # trip days: out early at every place of the trip
            visits = [(p, rnd.randint(330, 480) + i * 180) for i, p in enumerate(trip[2])]
        elif rnd.random() < chance:
            n = 2 if weekend and rnd.random() < 0.4 else 1
            picks = rnd.choices(known, weights=[p[6] for p in known], k=n)
            # weekends start early in the morning, weekdays after work
            start = rnd.randint(330, 540) if weekend else rnd.choice([rnd.randint(390, 450), rnd.randint(1000, 1140)])
            visits = [(p, start + i * rnd.randint(120, 200)) for i, p in enumerate(dict.fromkeys(picks))]
        for place, minute in visits:
            habitats = set(place[5].split())
            # every other visit to a spot with a round is a walk past its points instead of a stay
            walk = WALKS.get(place[0]) if rnd.random() < 0.5 else None
            if walk and rnd.random() < 0.5:
                walk = walk[::-1]
            seen = 0
            for sp, sp_hab, season, tier in species:
                if not (sp_hab & habitats) or not in_season(season, d.month):
                    continue
                if rnd.random() > (0.85, 0.35, 0.07 * skill, 0.018 * skill, 0.004 * skill)[tier - 1]:
                    continue
                minute += rnd.randint(0, 9)
                breeding = 4 <= d.month <= 7 and season in "rs" and rnd.random() < 0.25
                atlas = rnd.choice(["A2", "B4", "B7", "C13", "C14"]) if breeding else None
                count = max(1, int(rnd.expovariate(1 / (6 if tier <= 2 and "water" in sp_hab else 2))))
                where, gps = place, None
                if walk:  # move on to the next point every few records, reporting from the phone with its GPS
                    wid, wname, wlat, wlon = walk[min(len(walk) - 1, seen // 2)]
                    where = (wid, wname, place[2], wlat, wlon)
                    gps = (wlat + rnd.uniform(-0.0003, 0.0003), wlon + rnd.uniform(-0.0004, 0.0004))  # some 30 m around
                seen += 1
                out.append(sighting(sp, d.isoformat(), where, min(minute, 1439) if walk or rnd.random() < 0.8 else -1,
                                    count, atlas, rnd.random() < 0.12, gps, rnd))
        d += timedelta(days=1)
    return out


def main():
    dst = sys.argv[1] if len(sys.argv) > 1 else "demo_export.json"
    sightings = generate()
    with open(dst, "w", encoding="utf-8") as fh:
        json.dump({"data": {"sightings": sightings}}, fh, ensure_ascii=False)
    print(f"Written: {dst} ({len(sightings)} sightings)")


if __name__ == "__main__":
    main()
