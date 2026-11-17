"""Turn a deal.json into 16 inscribable Rainbow Legends card HTML files.
Run from the repo root:
  python scripts/gen-cards.py out/deal-c540eadcbe
Reads  <deal dir>/deal.json, data/collection.json, scripts/card-template.html
Writes <deal dir>/cards/card-NN-<tier>.html and cards/manifest.json
"""
import json, os, sys, re

if len(sys.argv) < 2:
    sys.exit("usage: python scripts/gen-cards.py out/deal-XXXXXXXXXX")
deal_dir = sys.argv[1]
here = os.path.dirname(os.path.abspath(__file__))
root = os.path.dirname(here)
deal = json.load(open(os.path.join(deal_dir, "deal.json"), encoding="utf-8"))
coll = {p["piece"]: p for p in json.load(open(os.path.join(root, "data", "collection.json"), encoding="utf-8"))}
tpl = open(os.path.join(here, "card-template.html"), encoding="utf-8").read()
BASE = "https://ordinals.gorillapool.io/content/"
# Same rarity palette as the mint.html grid strip (reuses its --r2/--r4/--r5/--r6/--r7 hex values).
TIER_COLORS = {
    "common": "rgba(255,255,255,0.55)", "uncommon": "#00c853", "rare": "#00cfff",
    "epic": "#7b51ff", "legendary": "#ff8c00", "exotic": "#e040fb",
}
n_cards = len(deal["cards"])
out = os.path.join(deal_dir, "cards")
os.makedirs(out, exist_ok=True)
manifest = []
for c in deal["cards"]:
    assert len(c["pieces"]) == 8 and len(set(c["pieces"])) == 8, f"card {c['card']}: need 8 distinct pieces"
    origins = []
    for pc in c["pieces"]:
        o = coll[pc].get("origin")
        assert o and re.fullmatch(r"[0-9a-f]{64}_\d+", o), f"piece {pc} has no valid origin: {o!r}"
        origins.append(o)
    label = f"{c['card']} OF {n_cards} · {c['tier'].upper()}"
    tier_color = TIER_COLORS.get(c["tier"].lower(), "rgba(255,255,255,0.55)")
    html = tpl.replace("{{LABEL}}", label).replace("{{TIER_COLOR}}", tier_color)
    for i, o in enumerate(origins):
        html = html.replace("{{F%d}}" % i, BASE + o)
    assert "{{" not in html
    name = f"card-{c['card']:02d}-{c['tier']}.html"
    open(os.path.join(out, name), "w", encoding="utf-8", newline="\n").write(html)
    manifest.append({"card": c["card"], "tier": c["tier"], "file": name, "bytes": len(html.encode("utf-8")),
                     "frames": origins, "start_sats": c["start_sats"], "floor_sats": c["floor_sats"]})
json.dump(manifest, open(os.path.join(out, "manifest.json"), "w"), indent=1)
print(f"wrote {len(manifest)} cards to {out}")
for m in manifest:
    print(f"  card {m['card']:>2} {m['tier']:<9} {m['bytes']:>6} bytes  {m['file']}")
