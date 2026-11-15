#!/usr/bin/env python3
"""
deal-gifs.py -- deal the 16 Rainbow Legends cards from Vol. 1 pieces, score and rank them,
assign tiers + start prices, and render preview GIFs.

Run from the repo root (ORDINALRAINBOWS-Vol.1):
    pip install pillow
    python scripts/deal-gifs.py --seed "anything you like"
    python scripts/deal-gifs.py --seed 000000000000000000abc...   # real run: a block hash

Rules (all deterministic from the seed):
  * 16 cards x 8 frames = 128 slots, drawn from the 63 claimable pieces (#19 has no ordinal).
  * Every piece appears at least once; the other 65 slots are random extras, max 4 appearances per piece.
  * No piece twice on the same card.
  * Card score = sum of tier points. Rank by score; tier by rank: 1 Exotic, 2-3 Legendary, 4-6 Epic,
    7-10 Rare, 11-16 Common. Ties are broken by card number (lower first) -- publish that rule.
  * Start price by tier from the ladder below; floor = start / 10.

The random stream is SHA-256 in counter mode, not Python's `random`, so anyone can reproduce a deal
in any language from the seed string alone.
"""
import argparse, hashlib, json, os, sys
from collections import Counter
from urllib.parse import unquote

# ---- config you may edit ---------------------------------------------------------------------
PTS = {"Common": 1, "Uncommon": 2, "Rare": 3, "Epic": 5, "Legendary": 8, "Exotic": 13}
CARDS, FRAMES, CAP = 16, 8, 4
TIER_BY_RANK = ["Exotic"] + ["Legendary"] * 2 + ["Epic"] * 3 + ["Rare"] * 4 + ["Common"] * 6
BASE_SATS = 6_400_000                                     # 0.064 BSV
MULT = {"Common": 0.5, "Rare": 1, "Epic": 1.5, "Legendary": 2.5, "Exotic": 4}

# Hand-curated mood families (approved from the plates), keyed by piece number.
FAM = {
    "Ember":   [1, 2, 3, 17, 25, 27, 30, 31, 40, 57, 60, 62],
    "Cosmic":  [4, 7, 8, 9, 10, 11, 12, 13, 16, 18, 41, 48, 49, 51, 52, 61],
    "Deep":    [14, 15, 26, 28, 33, 34, 35, 36, 47, 50],
    "Haze":    [21, 22, 32, 37, 38, 39, 56, 64],
    "Charged": [5, 6, 20, 29, 53, 54, 55, 58, 59, 63],
    "Surface": [23, 24, 42, 43, 44, 45, 46],
}
FAM_OF = {p: f for f, ps in FAM.items() for p in ps}
# Combo traits, checked after the deal. Add a trait bonus here if you want them to count in the score.
MONOSCAPE_MIN, SERIES_TRIO_MIN = 5, 3
# -----------------------------------------------------------------------------------------------


class Rng:
    """SHA-256 counter-mode stream. below(n) uses rejection sampling, so it is unbiased."""
    def __init__(self, seed: str):
        self.seed, self.ctr, self.buf = seed.encode("utf-8"), 0, b""

    def _bytes(self, k):
        while len(self.buf) < k:
            self.buf += hashlib.sha256(self.seed + b"|" + str(self.ctr).encode()).digest()
            self.ctr += 1
        out, self.buf = self.buf[:k], self.buf[k:]
        return out

    def below(self, n):
        if n <= 1: return 0
        nbytes = (n.bit_length() + 7) // 8
        limit = (256 ** nbytes // n) * n
        while True:
            v = int.from_bytes(self._bytes(nbytes), "big")
            if v < limit: return v % n

    def shuffle(self, a):
        for i in range(len(a) - 1, 0, -1):
            j = self.below(i + 1)
            a[i], a[j] = a[j], a[i]


def deal(pieces, rng):
    n = len(pieces)
    counts = [1] * n
    extras = 0
    while extras < CARDS * FRAMES - n:
        i = rng.below(n)
        if counts[i] < CAP:
            counts[i] += 1
            extras += 1
    pool = [i for i in range(n) for _ in range(counts[i])]
    rng.shuffle(pool)
    cards = [pool[k * FRAMES:(k + 1) * FRAMES] for k in range(CARDS)]
    for _ in range(100000):                                # repair duplicates by swapping
        bad = next((k for k, c in enumerate(cards) if len(set(c)) < FRAMES), None)
        if bad is None: return cards
        c, seen, di = cards[bad], set(), None
        for j, x in enumerate(c):
            if x in seen: di = j; break
            seen.add(x)
        k2, j2 = rng.below(CARDS), rng.below(FRAMES)
        if k2 != bad:
            c[di], cards[k2][j2] = cards[k2][j2], c[di]
    raise RuntimeError("could not repair duplicates -- try a different seed")


def series(name):
    return name.replace("#", "").rstrip("0123456789")


def find_image(root, rel, name, sm=True):
    base = os.path.basename(unquote(rel))
    cands = []
    for d in (["images/sm"] if sm else []) + ["images"]:
        for b in (base, base.replace("#", ""), name.replace("#", "").replace(" ", "") + ".JPG"):
            cands.append(os.path.join(root, d, b))
    for c in cands:
        if os.path.exists(c): return c
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--seed", required=True)
    ap.add_argument("--root", default=".", help="repo root (has data/collection.json and images/)")
    ap.add_argument("--out", default=None, help="output folder (default out/deal-<seed prefix>)")
    ap.add_argument("--no-gifs", action="store_true", help="skip rendering (JSON + markdown only)")
    ap.add_argument("--order", choices=["dealt", "brightness"], default="dealt",
                    help="frame order within a card; brightness needs Pillow")
    ap.add_argument("--size", type=int, default=320)
    a = ap.parse_args()

    coll = json.load(open(os.path.join(a.root, "data", "collection.json"), encoding="utf-8"))
    pieces = [c for c in coll if c.get("claimable")]
    pieces.sort(key=lambda c: c["piece"])
    missing = [p["piece"] for p in pieces if p["piece"] not in FAM_OF]
    assert not missing, f"no family for pieces {missing}"
    assert len(pieces) * 1 <= CARDS * FRAMES, "more pieces than slots"

    rng = Rng(a.seed)
    cards = deal(pieces, rng)

    res = []
    for k, c in enumerate(cards):
        ps = [pieces[i] for i in c]
        res.append({"card": k + 1, "pieces": ps, "score": sum(PTS[p["rarity"]] for p in ps)})
    order = sorted(res, key=lambda r: (-r["score"], r["card"]))
    for rank, r in enumerate(order, 1):
        r["rank"], r["tier"] = rank, TIER_BY_RANK[rank - 1]
        r["start_sats"] = int(BASE_SATS * MULT[r["tier"]])
        r["floor_sats"] = r["start_sats"] // 10
        fams = Counter(FAM_OF[p["piece"]] for p in r["pieces"])
        ser = Counter(series(p["id"]) for p in r["pieces"])
        r["traits"] = ([f"Monoscape ({f})" for f, n in fams.items() if n >= MONOSCAPE_MIN]
                       + [f"Series Trio ({s})" for s, n in ser.items() if n >= SERIES_TRIO_MIN])

    # ---- invariants: fail loudly rather than publish a bad deal ----
    used = Counter(p["piece"] for r in res for p in r["pieces"])
    assert set(used) == {p["piece"] for p in pieces}, "a piece is missing from the deal"
    assert max(used.values()) <= CAP
    assert all(len({p["piece"] for p in r["pieces"]}) == FRAMES for r in res)
    assert sum(used.values()) == CARDS * FRAMES

    out = a.out or os.path.join("out", "deal-" + hashlib.sha256(a.seed.encode()).hexdigest()[:10])
    os.makedirs(out, exist_ok=True)
    json.dump({"seed": a.seed, "cards": [
        {"card": r["card"], "rank": r["rank"], "tier": r["tier"], "score": r["score"],
         "start_sats": r["start_sats"], "floor_sats": r["floor_sats"], "traits": r["traits"],
         "pieces": [p["piece"] for p in r["pieces"]]} for r in sorted(res, key=lambda r: r["card"])]},
        open(os.path.join(out, "deal.json"), "w"), indent=1)

    md = [f"# Deal for seed `{a.seed}`", "",
          "| Rank | Card | Tier | Score | Start (BSV) | Floor (BSV) | Traits | Pieces |", "|---|---|---|---|---|---|---|---|"]
    for r in order:
        md.append(f"| {r['rank']} | {r['card']} | {r['tier']} | {r['score']} | {r['start_sats']/1e8:.4f} | "
                  f"{r['floor_sats']/1e8:.5f} | {', '.join(r['traits']) or '-'} | "
                  f"{', '.join('#%d' % p['piece'] for p in r['pieces'])} |")
    md += ["", "Appearances per piece: " + ", ".join(f"{n}x: {sum(1 for v in used.values() if v == n)}" for n in sorted(set(used.values())))]
    open(os.path.join(out, "deal.md"), "w", encoding="utf-8").write("\n".join(md))

    print(f"seed={a.seed!r}  ->  {out}")
    for r in order:
        print(f"  rank {r['rank']:>2}  card {r['card']:>2}  {r['tier']:<9} score {r['score']:>2}  "
              f"{r['start_sats']/1e8:.4f} BSV  {', '.join(r['traits'])}")

    if a.no_gifs: return
    try:
        from PIL import Image, ImageDraw
    except ImportError:
        sys.exit("Pillow missing: pip install pillow   (or rerun with --no-gifs)")

    imgs = {}
    for p in pieces:
        path = find_image(a.root, p["image"], p["name"])
        if not path: sys.exit(f"image not found for #{p['piece']} {p['name']} ({p['image']})")
        imgs[p["piece"]] = Image.open(path).convert("RGB").resize((a.size, a.size))

    gdir = os.path.join(out, "gifs"); os.makedirs(gdir, exist_ok=True)
    for r in res:
        frames = [imgs[p["piece"]] for p in r["pieces"]]
        if a.order == "brightness":
            frames.sort(key=lambda im: sum(im.resize((1, 1)).getpixel((0, 0))))
        seq, dur = [], []
        for i, f in enumerate(frames):                     # hold, then 3-step crossfade to the next
            nxt = frames[(i + 1) % len(frames)]
            seq.append(f); dur.append(700)
            for s in (1, 2, 3):
                seq.append(Image.blend(f, nxt, s / 4)); dur.append(70)
        seq[0].save(os.path.join(gdir, f"card-{r['card']:02d}-{r['tier'].lower()}.gif"),
                    save_all=True, append_images=seq[1:], duration=dur, loop=0, optimize=True)

    th, pad, lab = 110, 6, 22                              # overview: one row per card, 8 thumbnails
    W = FRAMES * (th + pad) + pad
    sheet = Image.new("RGB", (W, CARDS * (th + lab + pad) + pad), (16, 16, 18))
    d = ImageDraw.Draw(sheet)
    for row, r in enumerate(order):
        y = pad + row * (th + lab + pad)
        d.text((pad, y), f"rank {r['rank']}  card {r['card']}  {r['tier']}  score {r['score']}  {r['start_sats']/1e8:.3f} BSV  "
                         f"{'  '.join(r['traits'])}", fill=(235, 235, 235))
        for i, p in enumerate(r["pieces"]):
            sheet.paste(imgs[p["piece"]].resize((th, th)), (pad + i * (th + pad), y + lab))
    sheet.save(os.path.join(out, "overview.jpg"), quality=88)
    print(f"wrote {CARDS} GIFs in {gdir} and overview.jpg")


if __name__ == "__main__":
    main()
