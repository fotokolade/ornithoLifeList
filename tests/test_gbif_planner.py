import json
import tempfile
import unittest

from tools import fetch_gbif_planner as g


class FakeApi:
    """Answers like the GBIF API for two regions in Germany, one of them with thin data in January."""

    def __init__(self):
        self.fetched = 0

    def get(self, path, params):
        p = dict(params)
        if path == "occurrence/search" and p.get("facet") == "gadmLevel2Gid":
            # AUT.1.1_1: records of German datasets just across the border
            return {"count": 9, "facets": [{"counts": [{"name": "DEU.2.1_1", "count": 5}, {"name": "DEU.1.1_1", "count": 3},
                                                      {"name": "AUT.1.1_1", "count": 1}]}]}
        if path == "occurrence/search" and p.get("limit") == 1:
            n = "Nord" if p["gadmGid"] == "DEU.1.1_1" else "Süd"
            return {"results": [{"countryCode": "DE", "gadm": {"level1": {"name": n + "land"}, "level2": {"name": "Kreis " + n}}}]}
        if path == "occurrence/search" and p.get("facet") == "speciesKey":
            m = p["month"]
            if p["gadmGid"] == "DEU.1.1_1":
                total = 50 if m == 1 else 1000
                return {"count": total, "facets": [{"counts": [{"name": "1", "count": total // 10}, {"name": "2", "count": 1}]}]}
            return {"count": 2000, "facets": [{"counts": [{"name": "1", "count": 5}, {"name": "3", "count": 40 if m in (5, 6) else 0},
                                                          {"name": "4", "count": 30}]}]}
        if path == "species/match":
            return {"matchType": "EXACT", "rank": "SPECIES", "usageKey": {"Parus major": 1}.get(p["name"], 99)}
        if path.startswith("species/") and path.endswith("vernacularNames"):
            return {"results": [{"vernacularName": "Testvogel", "language": "deu"}]}
        if path.startswith("species/"):
            return {"canonicalName": {"species/1": "Parus major", "species/2": "Rara avis", "species/3": "Upupa epops",
                                     "species/4": "Anser anser x Branta canadensis"}[path]}
        raise AssertionError((path, params))


class GbifPlannerTest(unittest.TestCase):
    def test_levels(self):
        self.assertEqual(g.level_of(0), 0)
        self.assertEqual(g.level_of(0.0002), 1)
        self.assertEqual(g.level_of(0.03), 7)
        self.assertEqual(g.level_of(0.5), 9)

    def test_aggregate_thin_cells_and_rare_species(self):
        months = [
            [(50, {1: 5})] + [(1000, {1: 100, 2: 1})] * 11,
            [(2000, {1: 5, 3: 40})] * 12,
        ]
        totals, steps = g.aggregate(months, min_records=20)
        self.assertEqual(totals[0][:2], [50, 1000])
        self.assertEqual(steps[1][0][0], 0)       # 50 bird records in January: too few to say anything
        self.assertEqual(steps[1][0][1], 9)       # 10 % of all records
        self.assertEqual(steps[1][1][0], 4)       # 0.25 %
        self.assertNotIn(2, steps)                # 11 records in all: below min_records
        self.assertEqual(steps[3][1][0], 7)       # 2 %
        # two stray records in a month with few records: no step, however high their share
        _, steps = g.aggregate([[(120, {4: 2, 5: 3})] * 12], min_records=1)
        self.assertNotIn(4, steps)
        self.assertEqual(steps[5][0][0], 7)       # 2.5 %

    def test_best_regions_and_budget(self):
        cells = {0: [1] * 12, 1: [9] + [0] * 11, 2: [5] * 12, 3: [5] * 11 + [0]}
        self.assertEqual(list(g.best_regions(cells, 2)), [1, 2])
        steps = {k: {r: [3] * 12 for r in range(100)} for k in range(20)}
        info = {k: {"latin": f"Avis {k}", "alias": None, "de": None, "en": None} for k in steps}
        _, full = g.build_output({}, [], [], steps, info)
        out, text = g.build_output({}, [], [], steps, info, budget=len(full.encode()) // 2)
        self.assertLess(out["meta"]["topRegions"], g.TOP_REGION_STEPS[0])
        self.assertTrue(all(len(s["cells"]) == out["meta"]["topRegions"] for s in out["species"]))

    def test_run_writes_the_compact_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            orig = (g.Gbif, g.OUT_DIR, g.REF_PATH)
            ref = f"{tmp}/ref.json"
            with open(ref, "w", encoding="utf-8") as fh:
                json.dump({"lifeListNames": {"Parus major": {"de": "Kohlmeise", "en": "Great Tit"},
                                             "Acanthis flammea / cabaret": {"de": "Birkenzeisig"}}}, fh)
            g.Gbif, g.OUT_DIR, g.REF_PATH = (lambda offline=False: FakeApi()), tmp, ref
            try:
                g.run("de", (2015, 2025))
            finally:
                g.Gbif, g.OUT_DIR, g.REF_PATH = orig
            with open(f"{tmp}/gbif_planner_de.json", encoding="utf-8") as fh:
                data = json.load(fh)
        self.assertEqual([r["id"] for r in data["regions"]], ["DEU.1.1_1", "DEU.2.1_1"])
        self.assertEqual(data["regions"][0], {"id": "DEU.1.1_1", "name": "Kreis Nord", "parent": "Nordland", "country": "DE"})
        self.assertEqual(data["totals"][0][:2], [50, 1000])
        sp = {s["latin"]: s for s in data["species"]}
        self.assertEqual(sorted(sp), ["Parus major", "Upupa epops"])  # Rara avis: 11 records; no hybrid
        self.assertEqual(sp["Parus major"]["de"], "Kohlmeise")
        self.assertEqual(sp["Parus major"]["cells"]["0"], "099999999999")
        self.assertEqual(sp["Upupa epops"]["de"], "Testvogel")
        self.assertEqual(sp["Upupa epops"]["cells"], {"1": "000077000000"})
        self.assertEqual(data["meta"]["scope"], "de")
        self.assertIn("GBIF.org", data["meta"]["citation"])


if __name__ == "__main__":
    unittest.main()
