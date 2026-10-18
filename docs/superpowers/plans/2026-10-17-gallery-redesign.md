# ORDINAL•RAINBOWS Gallery Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the main page so each piece floats as its own object over the background animation — screensaver welcome, calm serif header that condenses into a sticky bar, frosted rainbow-rim cards, a wallet pill + side panel, and the real background animation on phones.

**Architecture:** Same plain HTML/CSS/JS static site on Vercel. Styles move out of `index.html` into `css/site.css` (built on CSS custom properties). New behaviour lives in three focused browser scripts — `js/gallery.js`, `js/screensaver.js`, `js/wallet-panel.js` — each written as a UMD module so its pure logic is testable with `node:test`. The existing `js/rewards-integration.js` keeps wallet connect, ownership, the 3D card popup and claims, and now announces changes with two window events (`or-wallet-changed`, `or-rewards-changed`) that the new scripts listen to.

**Tech Stack:** HTML, CSS custom properties, vanilla JS (no framework, no bundler), Google Fonts (Playfair Display, Nunito), `node:test`, Python 3 + Pillow (only to generate image copies; outputs are committed).

**Spec:** `docs/superpowers/specs/2026-10-17-gallery-redesign-design.md`

## Global Constraints

- No framework, no bundler, no new npm dependencies. Python + Pillow is used only by `scripts/make-thumbs.py`; its output images are committed.
- Fonts: **Playfair Display** (wordmark, card titles, placard titles, panel heading) and **Nunito** (everything else), from Google Fonts.
- Pastel rainbow stops, exactly: `#f7c6c7, #f9e2b8, #cdeccd, #c3dff2, #d9c8ef`. Smoky glass: `rgba(14, 12, 28, 0.82)`.
- Wordmark text: `ORDINAL•RAINBOWS` with a `VOL. 1` pill.
- Taglines, word for word: `A PROPRIETARY HARVESTING PROCESS YIELDS SOME ASTOUNDING RESULTS!!` and `ADORN YOUR ENVIRONMENT WITH BEAUTIFUL RAINBOW MAGIC`.
- Idle screensaver start: exactly **60,000 ms**.
- Card grid: 4 columns above 1200px, 3 at ≤1200px, 2 at ≤900px, 1 at ≤520px.
- On-chain view link: `https://1sat.market/outpoint/<inscriptionId>_0`.
- Image file names contain `#`; always build image URLs with `encodeURIComponent(nft.id)`.
- Do not change: the 3D card popup's behaviour, `checker.html`, `admin.html`, `OR/`, anything under `api/`, the old wallet scripts (`js/bsv-*.js`, `js/debug-helper.js`, etc.).
- **The agent never commits or pushes.** Each task ends with a checkpoint where the owner reviews and commits.
- All existing tests keep passing (`npm test`, currently 40).

**Local dev setup (used by every manual check):** in one terminal run `vercel dev --listen 3000` (API), in another `node scripts/dev-server.js`, then open **http://localhost:8080**. Port 8080 is required: `vercel dev` alone 404s on image names containing `#`.

## Review Focus

1. **The one piece with no inscription (#19 EclipseBow #3, `inscriptionId: null`)** — its card must show "Not yet inscribed" with no copy/view buttons, no reward badge, no ⭐; the screensaver may still show it. *Pinned by a test in Task 4.*
2. **A connected wallet that holds zero pieces** — the pill reads "⭐ 0", the panel says there are no pieces yet, and "Only mine" shows a clear empty message instead of a blank grid. *Pinned by tests in Tasks 4 and 5.*
3. **Turning "Only mine" on, then disconnecting** — the filter switches off and the full gallery returns. *Pinned by a test in Task 4.*
4. **A missing small image copy** — the card falls back to the full-size image, then to a placeholder, never a broken icon. *Pinned by a test in Task 4 (fallback wiring) and Task 2 (every piece has a copy).*
5. **The screensaver triggered while it is already showing, or while a popup/panel/signing is open** — no duplicate overlays, no interruption. *Pinned by tests in Task 6.*

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `css/site.css` | Create (Task 1) | All main-page styles and design tokens |
| `scripts/make-thumbs.py` | Create (Task 2) | Writes 800px copies to `images/sm/` |
| `images/sm/*.JPG` | Create (Task 2) | Small copies for cards, screensaver, panel, phone background |
| `js/gallery.js` | Create (Task 4) | Card HTML, filter/sort, ⭐ Only mine, reward badges, copy/view ID, sticky bar |
| `js/wallet-panel.js` | Create (Task 5) | Wallet pills, side panel, wallet toast |
| `js/screensaver.js` | Create (Task 6) | Screensaver welcome, ✦ buttons, idle timer |
| `js/bg-anim.js`, `css/bg-anim.css` | Modify (Task 7) | Phone "lite" mode and crossfade fallback |
| `js/rewards-integration.js` | Modify (Task 5, 8) | Emits events instead of driving the old wallet box; inline claim messages |
| `js/wallet.js` | Modify (Task 5) | `ORWallet.busy` counter while the wallet is working |
| `index.html` | Modify (Tasks 1, 3–6) | Structure only |
| `tests/ui/*.test.js` | Create | Tests for the pure logic of each new script |

---

### Task 1: Foundations — move styles out, fonts, design tokens

**Files:**
- Create: `css/site.css`
- Modify: `index.html` (head: lines 7–11 and the `<style>` block ending at line 1387)

**Interfaces:**
- Produces: CSS custom properties used by every later task: `--font-display`, `--font-body`, `--pastel-rainbow`, `--pastel-rainbow-diag`, `--ink-on-pastel`, `--smoky-glass`, `--frost-glass`, `--gold`, `--gold-glow`, `--reward-green`, `--radius-pill`, `--radius-card`, `--radius-image`, `--shadow-soft`, `--shadow-float`, `--shadow-lift`.

- [ ] **Step 1: Move the inline styles into `css/site.css`**

Copy everything between `<style>` (line 11) and `</style>` (line 1387) of `index.html`, unchanged, into a new file `css/site.css`. Then delete the `<style>…</style>` block from `index.html`.

- [ ] **Step 2: Add the design tokens at the very top of `css/site.css`**

```css
/* ===== Design tokens (redesign) ===== */
:root {
    --font-display: 'Playfair Display', Georgia, serif;
    --font-body: 'Nunito', -apple-system, 'Segoe UI', sans-serif;
    --pastel-rainbow: linear-gradient(90deg, #f7c6c7, #f9e2b8, #cdeccd, #c3dff2, #d9c8ef);
    --pastel-rainbow-diag: linear-gradient(135deg, #f7c6c7, #f9e2b8, #cdeccd, #c3dff2, #d9c8ef);
    --ink-on-pastel: #2a2238;
    --smoky-glass: rgba(14, 12, 28, 0.82);
    --frost-glass: rgba(255, 255, 255, 0.12);
    --gold: #ffd75a;
    --gold-glow: rgba(255, 215, 90, 0.6);
    --reward-green: rgba(0, 190, 90, 0.92);
    --radius-pill: 999px;
    --radius-card: 28px;
    --radius-image: 18px;
    --shadow-soft: 0 6px 18px rgba(0, 0, 0, 0.3);
    --shadow-float: 0 18px 40px rgba(0, 0, 0, 0.45), 0 2px 6px rgba(0, 0, 0, 0.25);
    --shadow-lift: 0 28px 56px rgba(0, 0, 0, 0.55), 0 4px 10px rgba(0, 0, 0, 0.3);
}
```

In the existing `body { … }` rule further down, change the `font-family` line to:

```css
    font-family: var(--font-body);
```

- [ ] **Step 3: Replace the head links in `index.html`**

Delete the Bootstrap line (line 7). No markup uses Bootstrap classes; it only overrides base styles such as `.container` widths, which would fight the new grid. Then, directly after the normalize `<link>`, add:

```html
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Nunito:ital,wght@0,400;0,600;0,700;0,800;1,400&family=Playfair+Display:wght@600&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="css/site.css">
```

Keep the existing `css/rewards-dashboard.css` and `css/bg-anim.css` links after it.

- [ ] **Step 4: Verify nothing else moved**

Run: `grep -c "<style" index.html`
Expected: `0`

Run: `npm test`
Expected: all tests pass (40).

Manual: open http://localhost:8080 — the page looks as before apart from the rounded Nunito body font and slightly wider gallery (Bootstrap's container limits are gone). Background animation, splash, cards, 3D card popup and wallet connect all still work.

- [ ] **Step 5: Checkpoint** — owner reviews the diff and commits (`refactor: move main page styles to css/site.css, add design tokens and fonts`).

---

### Task 2: Small image copies for cards, screensaver and phones

**Files:**
- Create: `scripts/make-thumbs.py`
- Create: `images/sm/*.JPG` (generated)
- Test: `tests/ui/thumbs.test.js`

**Interfaces:**
- Produces: for every `images/<name>.JPG` a copy at `images/sm/<name>.JPG`, longest side 800px. Later tasks reference them through `ORGallery.imagePath(nft, 'sm')`.

- [ ] **Step 1: Write the failing test**

`tests/ui/thumbs.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const manifest = require('../../data/collection.json');
const SM = path.join(__dirname, '..', '..', 'images', 'sm');

test('every piece has a small image copy under 300 KB', () => {
  for (const piece of manifest) {
    const file = path.join(SM, `${piece.id}.JPG`);
    assert.ok(fs.existsSync(file), `missing images/sm/${piece.id}.JPG — run python scripts/make-thumbs.py`);
    assert.ok(fs.statSync(file).size < 300 * 1024, `images/sm/${piece.id}.JPG is too large`);
  }
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `node --test tests/ui/thumbs.test.js`
Expected: FAIL with `missing images/sm/AlchemyBow.JPG — run python scripts/make-thumbs.py`

- [ ] **Step 3: Write the generator**

`scripts/make-thumbs.py`:

```python
"""Write an 800px copy of every piece: images/<name>.JPG -> images/sm/<name>.JPG.

Used by the gallery cards, the screensaver, the wallet panel and the phone background.
Run from the repo root after adding or changing a piece:  python scripts/make-thumbs.py
Needs Pillow (pip install Pillow).
"""
from pathlib import Path
import sys

from PIL import Image, ImageOps

SRC = Path(__file__).resolve().parent.parent / "images"
OUT = SRC / "sm"
MAX_SIDE = 800


def main() -> int:
    OUT.mkdir(exist_ok=True)
    made = 0
    for src in sorted(SRC.glob("*.JPG")):
        with Image.open(src) as im:
            im = ImageOps.exif_transpose(im).convert("RGB")
            im.thumbnail((MAX_SIDE, MAX_SIDE), Image.LANCZOS)
            im.save(OUT / src.name, "JPEG", quality=82, optimize=True, progressive=True)
        made += 1
    print(f"wrote {made} images to {OUT}")
    return 0 if made else 1


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 4: Generate and re-run the test**

Run: `python scripts/make-thumbs.py`
Expected: `wrote 64 images to …\images\sm`

Run: `node --test tests/ui/thumbs.test.js`
Expected: PASS

Run: `npm test`
Expected: all pass (41).

- [ ] **Step 5: Checkpoint** — owner reviews and commits (`feat: add 800px image copies for gallery, screensaver and phones`).

---

### Task 3: New header and sticky bar markup + styles

**Files:**
- Modify: `index.html` (the `<header id="main-header">` and `<div class="controls-section">` blocks, lines ~1591–1621 before Task 1's head edit)
- Modify: `css/site.css`

**Interfaces:**
- Produces (used by Tasks 4–6):
  - Filter controls with `data-filter="search" | "sort" | "rarity"` (header row keeps the ids `searchInput`, `sortSelect`, `rarityFilter`, so the current gallery script keeps working until Task 4).
  - Buttons `data-action="only-mine"` (one in the header, one in the sticky bar with `data-compact="1"`), `data-action="screensaver"`, `data-action="wallet"`.
  - `#sticky-bar` (starts with the `inert` attribute; Task 4 makes it appear on scroll).
  - Classes `.bubble`, `.pill-btn`, `.pill-btn.pastel`, `.pill-select`, `.pill-search`.

- [ ] **Step 1: Replace the header and controls markup**

Replace everything from `<header id="main-header">` through the closing `</div>` of `<div class="controls-section">` with:

```html
        <header class="site-header" id="main-header">
            <div class="header-pills">
                <button type="button" class="pill-btn" data-action="screensaver" aria-label="Show screensaver">✦ Screensaver</button>
                <button type="button" class="pill-btn pastel" data-action="wallet">🔗 Connect</button>
            </div>
            <div class="bubble wordmark-bubble">
                <h1 class="wordmark">ORDINAL•RAINBOWS<span class="vol-pill">VOL. 1</span></h1>
            </div>
            <p class="tagline">A PROPRIETARY HARVESTING PROCESS YIELDS SOME ASTOUNDING RESULTS!!</p>
            <p class="tagline">ADORN YOUR ENVIRONMENT WITH BEAUTIFUL RAINBOW MAGIC</p>
            <div class="filter-row" role="search">
                <input type="search" id="searchInput" class="pill-search" data-filter="search" placeholder="Search pieces…" aria-label="Search pieces">
                <select id="sortSelect" class="pill-select" data-filter="sort" aria-label="Sort pieces">
                    <option value="alpha">Sort: A–Z</option>
                    <option value="rarity-high">Sort: Rarity (high → low)</option>
                    <option value="rarity-low">Sort: Rarity (low → high)</option>
                    <option value="rewards">Sort: Rewards waiting</option>
                </select>
                <select id="rarityFilter" class="pill-select" data-filter="rarity" aria-label="Filter by rarity">
                    <option value="all">All rarities</option>
                    <option value="Legendary">Legendary</option>
                    <option value="Exotic">Exotic</option>
                    <option value="Epic">Epic</option>
                    <option value="Rare">Rare</option>
                    <option value="Uncommon">Uncommon</option>
                    <option value="Common">Common</option>
                </select>
                <button type="button" class="pill-btn" data-action="only-mine" aria-pressed="false">⭐ Only mine</button>
            </div>
        </header>

        <div class="sticky-bar bubble" id="sticky-bar" inert>
            <span class="wordmark-small">ORDINAL•RAINBOWS</span>
            <input type="search" class="pill-search" data-filter="search" placeholder="Search…" aria-label="Search pieces">
            <select class="pill-select" data-filter="rarity" aria-label="Filter by rarity">
                <option value="all">All rarities</option>
                <option value="Legendary">Legendary</option>
                <option value="Exotic">Exotic</option>
                <option value="Epic">Epic</option>
                <option value="Rare">Rare</option>
                <option value="Uncommon">Uncommon</option>
                <option value="Common">Common</option>
            </select>
            <button type="button" class="pill-btn" data-action="only-mine" data-compact="1" aria-pressed="false">⭐ Mine</button>
            <button type="button" class="pill-btn" data-action="screensaver" aria-label="Show screensaver">✦</button>
            <button type="button" class="pill-btn pastel" data-action="wallet">🔗 Connect</button>
        </div>
```

- [ ] **Step 2: Delete the old header and control styles from `css/site.css`**

Delete these rule blocks: `.controls-section`, `.controls-grid`, `.search-input, .filter-select`, `.search-input:focus, .filter-select:focus`, `.search-input::placeholder`, `.filter-select option`, `header`, `header.glass-active`, `header::after`, `header > *`, `h1`, `.subtitle`. Inside the `@media (max-width: 768px)` block, delete the `header { … }` rules (there are two), `.controls-grid { … }`, `h1 { … }` and `.subtitle { … }`.

Then run `grep -n "backgroundCycle" css/site.css`. If the only remaining match is the `@keyframes backgroundCycle` block itself, delete that block too.

- [ ] **Step 3: Append the new header styles to `css/site.css`**

```css
/* ===== Header + sticky bar (redesign) ===== */
.bubble {
    background: var(--smoky-glass);
    color: #fff;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: var(--radius-pill);
    box-shadow: var(--shadow-float);
}
.site-header { text-align: center; margin: 4px auto 36px; position: relative; z-index: 3; }
.header-pills { display: flex; justify-content: flex-end; gap: 10px; margin-bottom: 14px; }
.wordmark-bubble { display: inline-block; padding: 18px 40px 16px; }
.wordmark {
    margin: 0;
    font-family: var(--font-display);
    font-weight: 600;
    font-size: clamp(1.7rem, 4.6vw, 3.4rem);
    letter-spacing: 0.03em;
    line-height: 1.1;
    color: #fff;
}
.vol-pill {
    display: inline-block;
    vertical-align: middle;
    margin-left: 12px;
    padding: 3px 12px;
    border-radius: var(--radius-pill);
    font-family: var(--font-body);
    font-size: 0.32em;
    font-weight: 800;
    letter-spacing: 0.06em;
    color: var(--ink-on-pastel);
    background: var(--pastel-rainbow);
}
.tagline {
    margin: 12px auto 0;
    max-width: 46rem;
    font-family: var(--font-body);
    font-weight: 700;
    font-size: clamp(0.78rem, 1.4vw, 0.95rem);
    letter-spacing: 0.04em;
    color: rgba(255, 255, 255, 0.9);
    text-shadow: 0 1px 8px rgba(0, 0, 0, 0.7);
}
.tagline + .tagline { margin-top: 4px; }
.filter-row { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; margin-top: 22px; }
.pill-btn, .pill-select, .pill-search {
    font-family: var(--font-body);
    font-weight: 700;
    font-size: 0.92rem;
    color: #fff;
    background: var(--smoky-glass);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: var(--radius-pill);
    padding: 10px 18px;
    box-shadow: var(--shadow-soft);
    cursor: pointer;
}
.pill-search { min-width: min(320px, 100%); cursor: text; }
.pill-search::placeholder { color: rgba(255, 255, 255, 0.6); }
.pill-select option { background: #1a1630; color: #fff; }
.pill-btn.pastel { color: var(--ink-on-pastel); background: var(--pastel-rainbow); border-color: transparent; }
.pill-btn[aria-pressed="true"] { box-shadow: 0 0 0 2px var(--gold), var(--shadow-soft); }
.pill-btn:disabled { opacity: 0.7; cursor: wait; }
.pill-btn:focus-visible, .pill-select:focus-visible, .pill-search:focus-visible { outline: 2px solid #fff; outline-offset: 3px; }

.sticky-bar {
    position: fixed;
    top: 12px;
    left: 50%;
    z-index: 40;
    width: min(1100px, calc(100% - 24px));
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px 6px 20px;
    transform: translate(-50%, -160%);
    transition: transform 0.35s ease;
}
.sticky-bar.is-visible { transform: translate(-50%, 0); }
.sticky-bar .wordmark-small {
    margin-right: auto;
    font-family: var(--font-display);
    font-weight: 600;
    letter-spacing: 0.03em;
    white-space: nowrap;
}
.sticky-bar .pill-search { min-width: 0; flex: 0 1 220px; }
@media (max-width: 700px) {
    .header-pills { justify-content: center; }
    .sticky-bar .wordmark-small { display: none; }
    .sticky-bar .pill-search { flex: 1 1 auto; }
}
@media (prefers-reduced-motion: reduce) { .sticky-bar { transition: none; } }
```

- [ ] **Step 4: Verify**

Run: `npm test` — Expected: all pass (41).

Manual at http://localhost:8080 (enter the gallery):
- The header is a dark rounded bubble with the white Playfair wordmark and pastel "VOL. 1" pill; both taglines appear word for word in solid white below it; the filter row is a line of dark pills.
- Typing in search, changing sort/rarity still filters the gallery (the old script still drives it).
- The sticky bar is not visible yet; ✦, wallet and ⭐ buttons do nothing yet.

- [ ] **Step 5: Checkpoint** — owner reviews and commits (`feat: redesign header as bubbles with serif wordmark; add sticky bar markup`).

---

### Task 4: Gallery module — new cards, filters, ⭐ Only mine, rewards sort, sticky bar

**Files:**
- Create: `js/gallery.js`
- Test: `tests/ui/gallery.test.js`
- Modify: `index.html` (inline script after the `window.nfts = [ … ];` array; script tags at the end of `<body>`)
- Modify: `css/site.css`

**Interfaces:**
- Consumes: `window.nfts` (array of `{ id, title, subtitle, rarity, inscriptionId|null, printifyUrl|null }`); `window.userOwnedInscriptions` (array of `{ inscriptionId, … }`, set by `rewards-integration.js`); `window.currentWalletAddress` (string|null); `window.openCard3DModal(nftId)`; `window.showWalletConnection()`; the controls from Task 3.
- Produces (as `window.ORGallery` in the browser, `module.exports` in Node):
  - `RARITY_ORDER: { Legendary: 6, Exotic: 5, Epic: 4, Rare: 3, Uncommon: 2, Common: 1 }`
  - `formatBsv(sats: number) → string` (8 decimals)
  - `shortId(id: string|null) → string` (`'abcdef…123456'`, `''` for null)
  - `imagePath(nft, size?: 'sm') → string`
  - `filterAndSort(nfts, filters: { search, sort, rarity, onlyMine }, ctx: { owned: Set<string>, rewards: Record<string, number> }) → nft[]` (new array)
  - `emptyMessage(filters, connected: boolean) → string`
  - `nextFilters(filters, connected: boolean) → filters`
  - `cardHTML(nft, state: { owned: boolean, waitingSats: number }) → string`
  - `onImageError(img: HTMLImageElement)`
  - Browser globals: `window.rewardsByInscription` (`Record<inscriptionId, sats>`), `window.loadRewardBadges()`; dispatches window event `or-rewards-changed`; listens for `or-wallet-changed` and `or-rewards-changed`.

- [ ] **Step 1: Write the failing tests**

`tests/ui/gallery.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const G = require('../../js/gallery.js');

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);
const nfts = [
  { id: 'Beta#1', title: 'Beta #1', subtitle: 'Soft glow', rarity: 'Common', inscriptionId: B, printifyUrl: 'https://ordinalrainbows.printify.me/product/1/beta' },
  { id: 'Alpha', title: 'Alpha', subtitle: 'Golden light', rarity: 'Exotic', inscriptionId: A, printifyUrl: 'https://ordinalrainbows.printify.me/product/2/alpha' },
  { id: 'Gamma', title: 'Gamma', subtitle: 'Dark threshold', rarity: 'Rare', inscriptionId: null, printifyUrl: null },
];
const base = { search: '', sort: 'alpha', rarity: 'all', onlyMine: false };
const ctx = { owned: new Set(), rewards: {} };
const ids = list => list.map(n => n.id);

test('sorts A–Z by default', () => {
  assert.deepStrictEqual(ids(G.filterAndSort(nfts, base, ctx)), ['Alpha', 'Beta#1', 'Gamma']);
});

test('search matches title, subtitle or rarity, ignoring case', () => {
  assert.deepStrictEqual(ids(G.filterAndSort(nfts, { ...base, search: 'GOLDEN' }, ctx)), ['Alpha']);
  assert.deepStrictEqual(ids(G.filterAndSort(nfts, { ...base, search: 'rare' }, ctx)), ['Gamma']);
  assert.deepStrictEqual(ids(G.filterAndSort(nfts, { ...base, search: '  beta ' }, ctx)), ['Beta#1']);
});

test('rarity filter keeps only that rarity', () => {
  assert.deepStrictEqual(ids(G.filterAndSort(nfts, { ...base, rarity: 'Common' }, ctx)), ['Beta#1']);
});

test('rarity sorts high→low and low→high', () => {
  assert.deepStrictEqual(ids(G.filterAndSort(nfts, { ...base, sort: 'rarity-high' }, ctx)), ['Alpha', 'Gamma', 'Beta#1']);
  assert.deepStrictEqual(ids(G.filterAndSort(nfts, { ...base, sort: 'rarity-low' }, ctx)), ['Beta#1', 'Gamma', 'Alpha']);
});

test('rewards-waiting sort puts pieces with the most BSV first, then A–Z', () => {
  const rewards = { [B]: 5000, [A]: 2000 };
  assert.deepStrictEqual(ids(G.filterAndSort(nfts, { ...base, sort: 'rewards' }, { owned: new Set(), rewards })), ['Beta#1', 'Alpha', 'Gamma']);
});

test('only-mine shows only pieces in the connected wallet', () => {
  assert.deepStrictEqual(ids(G.filterAndSort(nfts, { ...base, onlyMine: true }, { owned: new Set([B]), rewards: {} })), ['Beta#1']);
});

test('does not reorder the original array', () => {
  const copy = nfts.map(n => n.id);
  G.filterAndSort(nfts, { ...base, sort: 'rarity-high' }, ctx);
  assert.deepStrictEqual(nfts.map(n => n.id), copy);
});

test('connected wallet with no pieces: only-mine is empty and says why', () => {
  assert.deepStrictEqual(G.filterAndSort(nfts, { ...base, onlyMine: true }, ctx), []);
  assert.match(G.emptyMessage({ ...base, onlyMine: true }, true), /No ORDINAL•RAINBOWS pieces in your wallet yet/);
  assert.match(G.emptyMessage({ ...base, onlyMine: true }, false), /Connect your Yours Wallet/);
  assert.match(G.emptyMessage({ ...base, search: 'zzz' }, true), /No pieces match/);
});

test('disconnecting turns only-mine off; staying connected keeps it', () => {
  assert.strictEqual(G.nextFilters({ ...base, onlyMine: true }, false).onlyMine, false);
  assert.strictEqual(G.nextFilters({ ...base, onlyMine: true }, true).onlyMine, true);
});

test('short ids and BSV amounts', () => {
  assert.strictEqual(G.shortId('abcdef' + '0'.repeat(52) + '123456'), 'abcdef…123456');
  assert.strictEqual(G.shortId(null), '');
  assert.strictEqual(G.formatBsv(3000), '0.00003000');
});

test('card: reward badge and star only when relevant; no PNG size row', () => {
  const plain = G.cardHTML(nfts[0], { owned: false, waitingSats: 0 });
  assert.doesNotMatch(plain, /reward-badge/);
  assert.doesNotMatch(plain, /owned-star/);
  assert.doesNotMatch(plain, /5000px/);
  const rich = G.cardHTML(nfts[0], { owned: true, waitingSats: 3000 });
  assert.match(rich, /⚡ 0\.00003000 BSV to claim/);
  assert.match(rich, /owned-star/);
});

test('card: copy + on-chain view link + Order Prints', () => {
  const html = G.cardHTML(nfts[1], { owned: false, waitingSats: 0 });
  assert.match(html, new RegExp(`data-copy="${A}"`));
  assert.match(html, new RegExp(`href="https://1sat.market/outpoint/${A}_0"`));
  assert.match(html, /aaaaaa…aaaaaa/);
  assert.match(html, /href="https:\/\/ordinalrainbows\.printify\.me\/product\/2\/alpha"[^>]*>Order Prints ↗/);
});

test('card: a piece with no inscription says so and has no copy/view or badge', () => {
  const html = G.cardHTML(nfts[2], { owned: false, waitingSats: 0 });
  assert.match(html, /Not yet inscribed/);
  assert.doesNotMatch(html, /data-copy=/);
  assert.doesNotMatch(html, /1sat\.market/);
  assert.match(html, /Prints coming soon/);
});

test('card image uses the small copy and keeps the full-size image as fallback', () => {
  const html = G.cardHTML(nfts[0], { owned: false, waitingSats: 0 });
  assert.match(html, /src="images\/sm\/Beta%231\.JPG"/);
  assert.match(html, /data-full="images\/Beta%231\.JPG"/);
  assert.match(html, /onerror="ORGallery\.onImageError\(this\)"/);
});
```

- [ ] **Step 2: Run to confirm they fail**

Run: `node --test tests/ui/gallery.test.js`
Expected: FAIL with `Cannot find module '../../js/gallery.js'`

- [ ] **Step 3: Implement `js/gallery.js`**

```js
/*
  ORDINAL•RAINBOWS gallery: cards, search/sort/rarity, ⭐ Only mine, reward badges, sticky bar.
  Pure helpers are exported for Node tests; the browser part runs only when a document exists.
*/
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ORGallery = api;
})(typeof self !== 'undefined' ? self : this, function () {
  const RARITY_ORDER = { Legendary: 6, Exotic: 5, Epic: 4, Rare: 3, Uncommon: 2, Common: 1 };
  const VIEW_BASE = 'https://1sat.market/outpoint/';
  const PLACEHOLDER = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='400'%3E%3Crect fill='%231a1630' width='400' height='400'/%3E%3Ctext fill='%23ffffff' fill-opacity='.6' font-family='sans-serif' font-size='22' x='50%25' y='50%25' text-anchor='middle' dominant-baseline='middle'%3EImage unavailable%3C/text%3E%3C/svg%3E";

  function formatBsv(sats) { return (Number(sats || 0) / 1e8).toFixed(8); }
  function shortId(id) { return id ? `${id.slice(0, 6)}…${id.slice(-6)}` : ''; }
  function imagePath(nft, size) {
    const file = `${encodeURIComponent(nft.id)}.JPG`;
    return size === 'sm' ? `images/sm/${file}` : `images/${file}`;
  }

  function filterAndSort(nfts, filters, ctx) {
    const q = String(filters.search || '').trim().toLowerCase();
    const owned = (ctx && ctx.owned) || new Set();
    const rewards = (ctx && ctx.rewards) || {};
    const list = nfts.filter(n =>
      (!q || n.title.toLowerCase().includes(q) || n.subtitle.toLowerCase().includes(q) || n.rarity.toLowerCase().includes(q)) &&
      (!filters.rarity || filters.rarity === 'all' || n.rarity === filters.rarity) &&
      (!filters.onlyMine || owned.has(n.inscriptionId)));
    const byTitle = (a, b) => a.title.localeCompare(b.title);
    const rank = n => RARITY_ORDER[n.rarity] || 0;
    const waiting = n => Number(rewards[n.inscriptionId]) || 0;
    const sorters = {
      alpha: byTitle,
      'rarity-high': (a, b) => rank(b) - rank(a) || byTitle(a, b),
      'rarity-low': (a, b) => rank(a) - rank(b) || byTitle(a, b),
      rewards: (a, b) => waiting(b) - waiting(a) || byTitle(a, b),
    };
    return list.sort(sorters[filters.sort] || byTitle);
  }

  function emptyMessage(filters, connected) {
    if (filters.onlyMine) {
      return connected
        ? 'No ORDINAL•RAINBOWS pieces in your wallet yet.'
        : 'Connect your Yours Wallet to see your pieces.';
    }
    return 'No pieces match your search.';
  }

  function nextFilters(filters, connected) {
    return connected ? filters : { ...filters, onlyMine: false };
  }

  function cardHTML(nft, state) {
    const owned = Boolean(state && state.owned);
    const waiting = Number(state && state.waitingSats) || 0;
    const id = nft.inscriptionId;
    const idRow = id
      ? `<span class="card-id" title="${id}">${shortId(id)}` +
        `<button type="button" class="icon-btn" data-copy="${id}" aria-label="Copy inscription ID">📋</button>` +
        `<a class="icon-btn" href="${VIEW_BASE}${id}_0" target="_blank" rel="noopener" aria-label="View on-chain">↗</a></span>`
      : '<span class="card-id muted">Not yet inscribed</span>';
    const prints = nft.printifyUrl
      ? `<a class="prints-btn" href="${nft.printifyUrl}" target="_blank" rel="noopener">Order Prints ↗</a>`
      : '<span class="prints-btn unavailable">Prints coming soon</span>';
    return `
      ${waiting > 0 ? `<div class="reward-badge">⚡ ${formatBsv(waiting)} BSV to claim</div>` : ''}
      ${owned ? '<div class="owned-star" aria-label="In your wallet">⭐</div>' : ''}
      <img class="nft-image" src="${imagePath(nft, 'sm')}" data-full="${imagePath(nft)}" alt="${nft.title}"
           loading="lazy" decoding="async" onerror="ORGallery.onImageError(this)">
      <div class="card-text">
        <h3 class="nft-title">${nft.title}</h3>
        <p class="nft-subtitle">${nft.subtitle}</p>
      </div>
      <div class="card-meta"><span class="rarity ${nft.rarity.toLowerCase()}">${nft.rarity}</span>${idRow}</div>
      ${prints}`;
  }

  // Small copy missing → full-size image → placeholder.
  function onImageError(img) {
    if (img.dataset.full && img.src.indexOf('/sm/') !== -1) { img.src = img.dataset.full; return; }
    img.onerror = null;
    img.src = PLACEHOLDER;
  }

  const api = { RARITY_ORDER, formatBsv, shortId, imagePath, filterAndSort, emptyMessage, nextFilters, cardHTML, onImageError };

  function initBrowser() {
    const gallery = document.getElementById('gallery');
    if (!gallery || !window.nfts) return;
    const state = { search: '', sort: 'alpha', rarity: 'all', onlyMine: false };
    const connected = () => Boolean(window.currentWalletAddress);
    const ownedSet = () => new Set((window.userOwnedInscriptions || []).map(i => i.inscriptionId));

    function syncControls() {
      document.querySelectorAll('[data-filter]').forEach(el => {
        const v = state[el.dataset.filter];
        if (el.value !== v) el.value = v;
      });
      document.querySelectorAll('[data-action="only-mine"]').forEach(b => {
        b.setAttribute('aria-pressed', String(state.onlyMine));
        if (b.dataset.compact) b.title = connected() ? 'Only mine' : 'Connect to see yours';
        else b.textContent = connected() ? '⭐ Only mine' : '⭐ Connect to see yours';
      });
    }

    function render() {
      const owned = ownedSet();
      const rewards = window.rewardsByInscription || {};
      const list = filterAndSort(window.nfts, state, { owned, rewards });
      gallery.innerHTML = '';
      if (!list.length) {
        const p = document.createElement('p');
        p.className = 'gallery-empty';
        p.textContent = emptyMessage(state, connected());
        gallery.appendChild(p);
        return;
      }
      const frag = document.createDocumentFragment();
      list.forEach(nft => {
        const isOwned = owned.has(nft.inscriptionId);
        const card = document.createElement('article');
        card.className = 'nft-card' + (isOwned ? ' is-owned' : '');
        card.dataset.id = nft.id;
        card.innerHTML = cardHTML(nft, { owned: isOwned, waitingSats: rewards[nft.inscriptionId] || 0 });
        frag.appendChild(card);
      });
      gallery.appendChild(frag);
    }

    document.addEventListener('input', e => {
      const key = e.target && e.target.dataset && e.target.dataset.filter;
      if (!key) return;
      state[key] = e.target.value;
      syncControls();
      render();
    });

    document.addEventListener('click', e => {
      const mine = e.target.closest('[data-action="only-mine"]');
      if (mine) {
        if (!connected()) { window.showWalletConnection(); return; }
        state.onlyMine = !state.onlyMine;
        syncControls();
        render();
      }
    });

    gallery.addEventListener('click', e => {
      const copy = e.target.closest('[data-copy]');
      if (copy) {
        navigator.clipboard.writeText(copy.dataset.copy).then(() => {
          copy.textContent = '✓';
          copy.setAttribute('aria-label', 'Copied!');
          setTimeout(() => { copy.textContent = '📋'; copy.setAttribute('aria-label', 'Copy inscription ID'); }, 1400);
        });
        return;
      }
      const img = e.target.closest('.nft-image');
      if (img) window.openCard3DModal(img.closest('.nft-card').dataset.id);
    });

    window.addEventListener('or-wallet-changed', () => {
      Object.assign(state, nextFilters(state, connected()));
      syncControls();
      render();
    });
    window.addEventListener('or-rewards-changed', render);

    async function loadRewardBadges() {
      try {
        const j = await (await fetch('/api/rewards')).json();
        window.rewardsByInscription = Object.fromEntries((j.rewards || []).map(a => [a.inscription_id, Number(a.bsv_claimable)]));
        window.dispatchEvent(new Event('or-rewards-changed'));
      } catch (err) {
        console.warn('[gallery] could not load reward badges', err);
      }
    }
    window.loadRewardBadges = loadRewardBadges;

    // Sticky bar: shown once the header has scrolled out of view.
    const header = document.getElementById('main-header');
    const bar = document.getElementById('sticky-bar');
    if (header && bar && 'IntersectionObserver' in window) {
      new IntersectionObserver(([entry]) => {
        const show = !entry.isIntersecting;
        bar.classList.toggle('is-visible', show);
        if (show) bar.removeAttribute('inert'); else bar.setAttribute('inert', '');
      }).observe(header);
    }

    syncControls();
    render();
    loadRewardBadges();
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initBrowser);
    else initBrowser();
  }
  return api;
});
```

- [ ] **Step 4: Run the tests**

Run: `node --test tests/ui/gallery.test.js`
Expected: PASS (14 tests)

- [ ] **Step 5: Remove the old gallery code from `index.html`**

In the inline `<script>` that defines `window.nfts`, delete everything **after** the closing `];` of the array **up to (not including)** the line `// CAROUSEL LOGIC`. That removes: the `gallery`/`individualCardView`/`individualCard`/`backToGallery`/`mainContainer` constants, `rarityOrder`, `isMobile`, `liquidGlassObserver`, `createCardHTML`, `showIndividualCard`, `hideIndividualCard`, `renderGallery`, the initial render, the old `loadRewardBadges`, the header `glass-active` line, the three search/sort/rarity listeners and the `backToGallery` listener.

The carousel code below still uses `isMobile`, `showIndividualCard` and `carouselContent`. Until Task 6 replaces it, add these three lines right after the array's `];`:

```js
        // Temporary until the screensaver replaces the carousel (Task 6)
        const isMobile = window.innerWidth <= 768;
        const showIndividualCard = id => window.openCard3DModal(id);
```

Then, at the end of `<body>`, add the gallery script **after** `js/rewards-integration.js` and before `js/bg-anim.js`:

```html
    <script src="js/gallery.js"></script>
```

- [ ] **Step 6: Replace the old card styles in `css/site.css`**

Delete these rule blocks: `.gallery`, `.nft-card`, `.nft-card.glass-active`, `.nft-card::after`, `.nft-card.glass-active::after`, `.nft-card > *`, `.nft-header`, `.nft-title`, `.nft-subtitle`, `.nft-image`, `.nft-image:hover`, `.nft-info`, `.info-row`, `.info-row:last-child`, `.info-label`, `.info-value`, `.sale-link`, `.sale-link:hover`, `.sale-link.unavailable`, `.nft-card:not(.glass-active)`, `.nft-card:hover`, `.nft-card:hover::after`, and the whole remaining `@media (max-width: 768px) { … }` block that follows `.sale-link.unavailable` (the carousel loses its phone tweaks until Task 6 replaces it). In the existing `.reward-badge` rule change `top: 14px; left: 14px;` to `top: 24px; left: 24px;` and `background: rgba(0, 200, 90, 0.92);` to `background: var(--reward-green);`.

Append:

```css
/* ===== Gallery cards (redesign) ===== */
.gallery { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 34px 28px; padding: 8px 4px 80px; }
@media (max-width: 1200px) { .gallery { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
@media (max-width: 900px) { .gallery { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 24px 18px; } }
@media (max-width: 520px) { .gallery { grid-template-columns: 1fr; } }
.nft-card {
    position: relative;
    display: flex;
    flex-direction: column;
    padding: 14px;
    border-radius: var(--radius-card);
    color: #fff;
    background: var(--frost-glass);
    -webkit-backdrop-filter: blur(18px) saturate(160%);
    backdrop-filter: blur(18px) saturate(160%);
    box-shadow: var(--shadow-float);
    transition: transform 0.25s ease, box-shadow 0.25s ease;
}
.nft-card::before {
    content: '';
    position: absolute;
    inset: 0;
    padding: 2px;
    border-radius: inherit;
    background: var(--pastel-rainbow-diag);
    -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
    -webkit-mask-composite: xor;
    mask-composite: exclude;
    pointer-events: none;
}
.nft-card:hover { transform: translateY(-6px); box-shadow: var(--shadow-lift); }
.nft-card.is-owned { box-shadow: 0 0 0 2px var(--gold), 0 0 30px var(--gold-glow), var(--shadow-float); }
.nft-image {
    display: block;
    width: 100%;
    aspect-ratio: 1;
    object-fit: cover;
    border-radius: var(--radius-image);
    background: rgba(0, 0, 0, 0.25);
    cursor: pointer;
}
.card-text { padding: 12px 4px 0; }
.nft-title { margin: 0; font-family: var(--font-display); font-weight: 600; font-size: 1.2rem; letter-spacing: 0.02em; line-height: 1.25; }
.nft-subtitle { margin: 3px 0 0; font-family: var(--font-body); font-style: italic; font-size: 0.86rem; opacity: 0.85; }
.card-meta { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin: 12px 4px 14px; font-size: 0.8rem; }
.card-id { display: inline-flex; align-items: center; gap: 2px; white-space: nowrap; font-family: ui-monospace, Consolas, monospace; opacity: 0.9; }
.card-id.muted { font-family: var(--font-body); opacity: 0.65; }
.icon-btn { background: none; border: 0; color: inherit; cursor: pointer; padding: 2px 5px; border-radius: 6px; text-decoration: none; font-size: 0.95em; }
.icon-btn:hover, .icon-btn:focus-visible { background: rgba(255, 255, 255, 0.15); outline: none; color: inherit; }
.prints-btn {
    display: block;
    margin-top: auto;
    padding: 11px 16px;
    text-align: center;
    border-radius: var(--radius-pill);
    font-family: var(--font-body);
    font-weight: 800;
    color: var(--ink-on-pastel);
    background: var(--pastel-rainbow);
    text-decoration: none;
    box-shadow: var(--shadow-soft);
}
.prints-btn:hover { filter: brightness(1.06); color: var(--ink-on-pastel); }
.prints-btn.unavailable { opacity: 0.6; cursor: default; }
.owned-star {
    position: absolute;
    top: 22px;
    right: 22px;
    z-index: 2;
    width: 34px;
    height: 34px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    background: var(--gold);
    box-shadow: 0 0 16px var(--gold-glow);
    pointer-events: none;
}
.gallery-empty {
    grid-column: 1 / -1;
    padding: 40px 20px;
    text-align: center;
    font-family: var(--font-body);
    font-size: 1.1rem;
    border-radius: var(--radius-card);
    background: var(--smoky-glass);
}
@media (prefers-reduced-motion: reduce) {
    .nft-card { transition: none; }
    .nft-card:hover { transform: none; }
}
```

- [ ] **Step 7: Verify**

Run: `npm test` — Expected: all pass (55).

Manual at http://localhost:8080 after entering the gallery:
- 4 frosted cards per row with a thin pastel rim and deep shadow; the image is inset with rounded corners; no "PNG 5000px" row.
- AlchemyBow shows the green "⚡ 0.00002000 BSV to claim" badge.
- 📋 copies the full inscription ID (briefly shows ✓); ↗ opens `1sat.market/outpoint/…_0` in a new tab; EclipseBow #3 says "Not yet inscribed".
- Search, sort (including "Rewards waiting" → AlchemyBow first), rarity all work, from the header and from the sticky bar.
- Scrolling down past the header slides the sticky bar in; scrolling back up hides it.
- "⭐ Connect to see yours" opens the Yours connect prompt.
- Clicking a card image opens the 3D card popup.
- Resize the window: 3 columns at ≤1200px, 2 at ≤900px, 1 at ≤520px.

- [ ] **Step 8: Checkpoint** — owner reviews and commits (`feat: gallery module with frosted rainbow-rim cards, Only mine, rewards sort, sticky bar`).

---

### Task 5: Wallet pill + side panel; rewards-integration emits events; inline messages

**Files:**
- Create: `js/wallet-panel.js`
- Test: `tests/ui/wallet-panel.test.js`
- Modify: `js/rewards-integration.js` (`showWalletConnection`, `updateWalletUI`, `claimOrdinalReward`, `toggleWalletBox`, `refreshWalletBoxBalances`)
- Modify: `js/wallet.js` (busy counter)
- Modify: `index.html` (remove the old wallet block; add panel markup; script tag)
- Modify: `css/site.css`

**Interfaces:**
- Consumes: `ORGallery.imagePath` (Task 4); `window.rewardsByInscription`; `window.userOwnedInscriptions`; `window.currentWalletAddress`; `window.ORWallet.available()`; `window.showWalletConnection()`; `window.disconnectWallet()`; `window.openCard3DModal(nftId)`; buttons `data-action="wallet"` (Task 3).
- Produces:
  - `window.ORWalletPanel` / `module.exports`: `pillLabel({ available, connected, ownedCount, waitingSats }) → string`, `waitingTotal(ownedIds: string[], rewards: Record<string, number>) → number`, `shortAddress(addr: string|null) → string`.
  - Window events: `or-wallet-changed` (dispatched by `rewards-integration.js` after connect, ownership load, claim and disconnect), `or-wallet-error` (`detail`: message string).
  - `window.ORWallet.busy` (number of wallet calls in flight; read by Task 6).
  - `body.wallet-panel-open` class while the panel is open (read by Task 6).

- [ ] **Step 1: Write the failing tests**

`tests/ui/wallet-panel.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const W = require('../../js/wallet-panel.js');

test('pill label covers missing wallet, not connected, empty and rich wallets', () => {
  assert.strictEqual(W.pillLabel({ available: false, connected: false, ownedCount: 0, waitingSats: 0 }), 'Get Yours Wallet ↗');
  assert.strictEqual(W.pillLabel({ available: true, connected: false, ownedCount: 0, waitingSats: 0 }), '🔗 Connect');
  assert.strictEqual(W.pillLabel({ available: true, connected: true, ownedCount: 0, waitingSats: 0 }), '⭐ 0');
  assert.strictEqual(W.pillLabel({ available: true, connected: true, ownedCount: 2, waitingSats: 5000 }), '⭐ 2 · ⚡ 0.00005000 BSV');
});

test('waiting total counts only owned pieces and ignores missing entries', () => {
  const rewards = { a: 3000, b: 2000, c: 7000 };
  assert.strictEqual(W.waitingTotal(['a', 'b', 'zzz'], rewards), 5000);
  assert.strictEqual(W.waitingTotal([], rewards), 0);
});

test('short address', () => {
  assert.strictEqual(W.shortAddress('17yfjaGGR5bMMLArHJpiP1swGvE7yTzi2h'), '17yfja…zi2h');
  assert.strictEqual(W.shortAddress(null), '');
});
```

- [ ] **Step 2: Run to confirm they fail**

Run: `node --test tests/ui/wallet-panel.test.js`
Expected: FAIL with `Cannot find module '../../js/wallet-panel.js'`

- [ ] **Step 3: Implement `js/wallet-panel.js`**

```js
/*
  Wallet pill (header + sticky bar) and slide-out side panel.
  Stays out of the way until opened; listens for or-wallet-changed / or-rewards-changed / or-wallet-error.
*/
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ORWalletPanel = api;
})(typeof self !== 'undefined' ? self : this, function () {
  const bsv = sats => (Number(sats || 0) / 1e8).toFixed(8);

  function waitingTotal(ownedIds, rewards) {
    return ownedIds.reduce((total, id) => total + (Number(rewards[id]) || 0), 0);
  }

  function pillLabel({ available, connected, ownedCount, waitingSats }) {
    if (!available) return 'Get Yours Wallet ↗';
    if (!connected) return '🔗 Connect';
    return `⭐ ${ownedCount}` + (waitingSats > 0 ? ` · ⚡ ${bsv(waitingSats)} BSV` : '');
  }

  function shortAddress(addr) { return addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : ''; }

  const api = { pillLabel, waitingTotal, shortAddress };

  function initBrowser() {
    const panel = document.getElementById('wallet-panel');
    const backdrop = document.getElementById('wallet-backdrop');
    const toastEl = document.getElementById('wallet-toast');
    if (!panel || !backdrop) return;
    let lastFocus = null;
    let toastTimer = null;
    const ownedIds = () => (window.userOwnedInscriptions || []).map(i => i.inscriptionId);
    const available = () => Boolean(window.ORWallet && window.ORWallet.available());

    function refresh() {
      const rewards = window.rewardsByInscription || {};
      const ids = ownedIds();
      const connected = Boolean(window.currentWalletAddress);
      const label = pillLabel({ available: available(), connected, ownedCount: ids.length, waitingSats: waitingTotal(ids, rewards) });
      document.querySelectorAll('[data-action="wallet"]').forEach(p => {
        if (!p.disabled) p.textContent = label;
        p.classList.toggle('is-connected', connected);
      });
      if (!connected) { close(); return; }

      panel.querySelector('.wp-address').textContent = shortAddress(window.currentWalletAddress);
      panel.querySelector('[data-copy-address]').dataset.copyAddress = window.currentWalletAddress;
      const list = panel.querySelector('.wp-pieces');
      list.innerHTML = '';
      const pieces = (window.nfts || []).filter(n => n.inscriptionId && ids.includes(n.inscriptionId));
      if (!pieces.length) {
        const li = document.createElement('li');
        li.className = 'wp-empty';
        li.textContent = 'No ORDINAL•RAINBOWS pieces in this wallet yet.';
        list.appendChild(li);
      }
      pieces.forEach(n => {
        const sats = Number(rewards[n.inscriptionId]) || 0;
        const li = document.createElement('li');
        li.innerHTML = `<button type="button" class="wp-piece" data-id="${n.id}">
            <img src="${window.ORGallery.imagePath(n, 'sm')}" alt="" loading="lazy">
            <span>${n.title}</span>${sats > 0 ? `<span class="wp-waiting">⚡ ${bsv(sats)}</span>` : ''}</button>`;
        list.appendChild(li);
      });
      panel.querySelector('.wp-total').textContent = `${bsv(waitingTotal(ids, rewards))} BSV`;
    }

    function open() {
      if (!window.currentWalletAddress) return;
      lastFocus = document.activeElement;
      refresh();
      panel.hidden = false;
      backdrop.hidden = false;
      document.body.classList.add('wallet-panel-open');
      panel.querySelector('.wp-close').focus();
    }

    function close() {
      if (panel.hidden) return;
      panel.hidden = true;
      backdrop.hidden = true;
      document.body.classList.remove('wallet-panel-open');
      if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
    }

    function toast(message) {
      if (!toastEl) return;
      toastEl.textContent = message;
      toastEl.hidden = false;
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => { toastEl.hidden = true; }, 6000);
    }

    document.addEventListener('click', e => {
      const pill = e.target.closest('[data-action="wallet"]');
      if (pill) {
        if (!available()) { window.open('https://yours.org', '_blank', 'noopener'); return; }
        if (window.currentWalletAddress) open(); else window.showWalletConnection();
        return;
      }
      if (e.target === backdrop || e.target.closest('.wp-close')) { close(); return; }
      const piece = e.target.closest('.wp-piece');
      if (piece) { close(); window.openCard3DModal(piece.dataset.id); return; }
      const copy = e.target.closest('[data-copy-address]');
      if (copy && copy.dataset.copyAddress) { navigator.clipboard.writeText(copy.dataset.copyAddress); toast('Address copied'); return; }
      if (e.target.closest('[data-action="disconnect"]')) { close(); window.disconnectWallet(); }
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
    window.addEventListener('or-wallet-changed', refresh);
    window.addEventListener('or-rewards-changed', refresh);
    window.addEventListener('or-wallet-error', e => toast(e.detail));
    refresh();
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initBrowser);
    else initBrowser();
  }
  return api;
});
```

- [ ] **Step 4: Run the tests**

Run: `node --test tests/ui/wallet-panel.test.js`
Expected: PASS (3 tests)

- [ ] **Step 5: Add the busy counter to `js/wallet.js`**

Replace the `window.ORWallet = { … };` block at the end of the IIFE with:

```js
    // Count wallet calls in flight so the screensaver never interrupts a prompt.
    var busy = 0;
    function track(promise) {
        busy++;
        return promise.finally(function () { busy--; });
    }

    window.ORWallet = {
        available: function () { return !!window.CWI; },
        listOrdinals: function () { return track(listOrdinals()); },
        signWith: function (derivation, message) { return track(signWith(derivation, message)); },
        getReceivePubKey: function () { return track(getReceivePubKey()); },
        get busy() { return busy; }
    };
```

- [ ] **Step 6: Make `rewards-integration.js` announce changes instead of driving the old wallet box**

6a. Replace the whole `async function showWalletConnection() { … }` with:

```js
// Connects the current Yours Wallet (window.CWI via js/wallet.js). The payout address is the
// wallet's first deposit address; owned pieces are read from the wallet in fetchUserOrdinals().
async function showWalletConnection() {
    const say = msg => window.dispatchEvent(new CustomEvent('or-wallet-error', { detail: msg }));
    if (!window.ORWallet || !window.ORWallet.available()) {
        say('Yours Wallet not found. Install it from yours.org, unlock it, then reload this page.');
        return;
    }
    const pills = document.querySelectorAll('[data-action="wallet"]');
    pills.forEach(p => { p.disabled = true; p.textContent = '⏳ Approve in Yours…'; });
    try {
        const pubKey = await window.ORWallet.getReceivePubKey();
        const address = window.bsv.PublicKey.fromString(pubKey).toAddress().toString();
        window.dispatchEvent(new CustomEvent('bsv-wallet-authenticated', { detail: { wallet: 'yours', address: address, ordAddress: null } }));
    } catch (error) {
        console.error('[CONNECT] Yours connection failed', error);
        say('Could not connect to Yours: ' + (error.message || error));
    } finally {
        pills.forEach(p => { p.disabled = false; });
        window.dispatchEvent(new Event('or-wallet-changed'));
    }
}
```

6b. Replace the whole `function updateWalletUI(connected, address = null, walletType = null) { … }` with:

```js
// The pill, panel and gallery redraw themselves from or-wallet-changed.
function updateWalletUI() {
    window.dispatchEvent(new Event('or-wallet-changed'));
}
```

6c. Delete `function toggleWalletBox() { … }` and the line `window.toggleWalletBox = toggleWalletBox;`.

6d. Replace the whole `async function refreshWalletBoxBalances() { … }` with:

```js
// Kept under its old name for existing callers; redraws pill, panel and gallery.
function refreshWalletBoxBalances() {
    window.dispatchEvent(new Event('or-wallet-changed'));
}
```

6e. Replace the whole `async function claimOrdinalReward(inscriptionId, nftId) { … }` with (messages appear on the card instead of browser alerts):

```js
// Shows a short message at the bottom of the 3D card's back face.
function showCardMessage(text) {
    const back = document.getElementById('card-3d-back-content');
    if (!back) return;
    const note = document.createElement('div');
    note.className = 'card-3d-note card-3d-error';
    note.textContent = text;
    back.appendChild(note);
}

async function claimOrdinalReward(inscriptionId, nftId) {
    const btn = document.getElementById('card-3d-claim-btn');
    const reset = () => { if (btn) { btn.disabled = false; btn.textContent = '✨ Claim Rewards'; } };
    try {
        if (!inscriptionId) { showCardMessage('This piece cannot be claimed yet.'); return; }
        if (!window.currentWalletAddress) { showCardMessage('Connect your Yours Wallet to claim.'); return; }

        // Client-side ownership check before hitting the API (the server re-checks on-chain)
        const owned = window.userOwnedInscriptions && window.userOwnedInscriptions.find(n => n.inscriptionId === inscriptionId);
        if (!owned) { showCardMessage('This piece isn’t in your connected wallet.'); return; }

        if (btn) { btn.disabled = true; btn.textContent = '⏳ Claiming...'; }

        // Sign with the key that holds this piece; the server checks that key is the current owner.
        const timestamp = Math.floor(Date.now() / 1000);
        const message = `ordinalrainbows-claim:${inscriptionId}:${window.currentWalletAddress}:${timestamp}`;
        let proof;
        try {
            proof = await window.ORWallet.signWith(owned.derivation, message);
        } catch (sigErr) {
            console.error('[CLAIM] signature failed', sigErr);
            showCardMessage('The wallet signature was cancelled or failed. Please try again.');
            reset();
            return;
        }

        const body = { inscriptionId, nftId, bsvAddress: window.currentWalletAddress, epoch: 'default', pubKey: proof.pubKey, sig: proof.sig, timestamp };
        const resp = await fetch('/api/claim', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const j = await resp.json().catch(() => ({}));
        if (!resp.ok || j.success !== true) {
            showCardMessage('Claim not completed: ' + (j.error || j.message || ('HTTP ' + resp.status)));
            reset();
            return;
        }
        // Success: show it on the card and keep the button disabled
        const amountEl = document.getElementById('claimable-bsv');
        if (amountEl) amountEl.textContent = '0.00000000';
        if (btn) { btn.disabled = true; btn.textContent = j.txid ? '✅ Claimed, sent to your wallet' : '✅ Claim registered, payout pending'; }
        if (j.txid && /^[0-9a-f]{64}$/i.test(j.txid)) {
            document.getElementById('card-3d-back-content').insertAdjacentHTML('beforeend',
                `<div class="card-3d-note"><a href="https://whatsonchain.com/tx/${j.txid}" target="_blank" rel="noopener">View the payment ↗</a></div>`);
        }
        if (typeof window.loadRewardBadges === 'function') window.loadRewardBadges();
        refreshWalletBoxBalances();
    } catch (err) {
        console.error('claim error', err);
        showCardMessage('Claim failed: ' + err.message);
        reset();
    }
}
```

- [ ] **Step 7: Replace the old wallet markup in `index.html`**

Delete the whole block from the comment `<!-- Wallet Connection - BSV SDK Integration -->` through the closing `</div>` of `<div class="wallet-section">` (the line right before `<!-- 3D Card Modal -->`). In its place add:

```html
    <!-- Wallet side panel (opened from the wallet pill) -->
    <div id="wallet-backdrop" class="wallet-backdrop" hidden></div>
    <aside id="wallet-panel" class="wallet-panel bubble" hidden aria-label="Your wallet">
        <div class="wp-head">
            <h2 class="wp-heading">Your wallet</h2>
            <button type="button" class="wp-close icon-btn" aria-label="Close wallet">✕</button>
        </div>
        <p class="wp-row">Address <span class="wp-address"></span>
            <button type="button" class="icon-btn" data-copy-address="" aria-label="Copy address">📋</button></p>
        <h3 class="wp-sub">Your pieces</h3>
        <ul class="wp-pieces"></ul>
        <p class="wp-row wp-total-row">Rewards waiting <strong class="wp-total">0.00000000 BSV</strong></p>
        <button type="button" class="pill-btn wp-disconnect" data-action="disconnect">Disconnect</button>
    </aside>
    <p id="wallet-toast" class="wallet-toast bubble" role="status" hidden></p>
```

Add the script tag right after `js/gallery.js`:

```html
    <script src="js/wallet-panel.js"></script>
```

- [ ] **Step 8: Replace the wallet styles in `css/site.css`**

Delete these rule blocks: `.wallet-section`, `.connect-btn, .wallet-status`, `.connect-btn:hover`, `.wallet-status`, `.wallet-address`, `.disconnect-btn`, `.disconnect-btn:hover`, and every rule whose selector starts with `.wallet-box` (from `.wallet-box` through `.wallet-box-disconnect:hover`).

Append:

```css
/* ===== Wallet pill + side panel (redesign) ===== */
.wallet-backdrop { position: fixed; inset: 0; z-index: 60; background: rgba(0, 0, 0, 0.45); }
.wallet-panel {
    position: fixed;
    top: 0;
    right: 0;
    z-index: 61;
    width: min(380px, 100%);
    height: 100%;
    padding: 22px 22px 28px;
    overflow-y: auto;
    border-radius: 28px 0 0 28px;
    font-family: var(--font-body);
    animation: wp-in 0.3s ease-out;
}
.wallet-panel[hidden], .wallet-backdrop[hidden], .wallet-toast[hidden] { display: none; }
@keyframes wp-in { from { transform: translateX(100%); } to { transform: none; } }
@media (max-width: 520px) { .wallet-panel { width: 100%; border-radius: 0; } }
.wp-head { display: flex; justify-content: space-between; align-items: center; }
.wp-heading { margin: 0; font-family: var(--font-display); font-weight: 600; font-size: 1.5rem; }
.wp-sub { margin: 18px 0 8px; font-size: 0.85rem; letter-spacing: 0.08em; text-transform: uppercase; opacity: 0.85; }
.wp-row { display: flex; align-items: center; gap: 8px; margin: 12px 0; }
.wp-address { margin-left: auto; font-family: ui-monospace, Consolas, monospace; }
.wp-total-row strong { margin-left: auto; color: #7dffb0; }
.wp-pieces { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.wp-piece {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 6px;
    border: 0;
    border-radius: 16px;
    color: #fff;
    background: var(--frost-glass);
    font-size: 0.72rem;
    text-align: center;
    cursor: pointer;
}
.wp-piece img { width: 100%; aspect-ratio: 1; object-fit: cover; border-radius: 12px; }
.wp-piece:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
.wp-waiting { color: #7dffb0; font-weight: 800; }
.wp-empty { grid-column: 1 / -1; opacity: 0.8; }
.wp-disconnect { width: 100%; margin-top: 18px; }
.wallet-toast {
    position: fixed;
    top: 74px;
    right: 16px;
    z-index: 70;
    max-width: 320px;
    padding: 12px 16px;
    border-radius: 16px;
    font-family: var(--font-body);
    font-size: 0.9rem;
}
.card-3d-error { color: #ffb4b4; padding: 10px 12px; }
@media (prefers-reduced-motion: reduce) { .wallet-panel { animation: none; } }
```

- [ ] **Step 9: Verify**

Run: `grep -n "wallet-box\|connect-wallet-btn\|toggleWalletBox\|wallet-section" index.html js/rewards-integration.js css/site.css`
Expected: no matches.

Run: `npm test` — Expected: all pass (58).

Manual at http://localhost:8080:
- No floating wallet box anywhere; the header and sticky bar each show a pastel "🔗 Connect" pill.
- Click it → Yours prompt → pill becomes "⭐ 5" (or "⭐ 5 · ⚡ … BSV" if rewards are waiting); your cards get ⭐ and a gold glow; "⭐ Only mine" now shows only your pieces.
- Click the connected pill → panel slides in from the right with short address (📋 copies), your pieces as thumbnails, rewards total and Disconnect. Clicking outside, ✕, or Esc closes it; tapping a thumbnail closes it and opens that piece's 3D card.
- Claim on a piece with rewards → the card shows the result inline (no browser alert); the pill, panel and badges update without a reload.
- Disconnect → ⭐, glows and counts disappear; "Only mine" switches off and the full gallery returns.
- In a browser without Yours, the pill reads "Get Yours Wallet ↗" and opens yours.org.

- [ ] **Step 10: Checkpoint** — owner reviews and commits (`feat: wallet pill and slide-out panel; wallet events replace the floating wallet box`).

---

### Task 6: Screensaver welcome — replaces the token popup, slideshow and single card view

**Files:**
- Create: `js/screensaver.js`
- Test: `tests/ui/screensaver.test.js`
- Modify: `index.html` (token popup, carousel, single card view, preload script, `<body>` class, script tags)
- Modify: `css/site.css`

**Interfaces:**
- Consumes: `window.nfts`; `ORGallery.imagePath(nft, 'sm')`; `window.openCard3DModal(nftId)`; `#card-3d-modal.active`; `body.wallet-panel-open` (Task 5); `window.ORWallet.busy` (Task 5); buttons `data-action="screensaver"` (Task 3).
- Produces (`window.ORScreensaver` / `module.exports`):
  - `IDLE_MS = 60000`, `FORWARD_MS = 6000`
  - `createIdleTimer({ timeoutMs, isSuppressed: () => boolean, onIdle: () => void, timers: { setTimeout, clearTimeout } }) → { poke(), stop() }`
  - `createScreensaverState() → { mode: null|'welcome'|'idle', show(mode) → boolean, hide() → boolean, exitsOnInput() → boolean }`
  - `nextIndex(i: number, n: number) → number`
  - Browser: `ORScreensaver.show(mode)`, `ORScreensaver.hide()`.

Modes: **welcome** (arrival and ✦ button — leaves only via "Enter Gallery", Esc, or clicking the forward card) and **idle** (after 60 s without input — any input leaves and restores the exact scroll position; filters are untouched because the gallery DOM is never re-rendered by the screensaver).

- [ ] **Step 1: Write the failing tests**

`tests/ui/screensaver.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const S = require('../../js/screensaver.js');

function fakeTimers() {
  let now = 0;
  let nextId = 0;
  const queue = new Map();
  return {
    setTimeout(fn, ms) { const id = ++nextId; queue.set(id, { fn, at: now + ms }); return id; },
    clearTimeout(id) { queue.delete(id); },
    advance(ms) {
      const end = now + ms;
      for (;;) {
        const due = [...queue.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        queue.delete(due[0]);
        now = due[1].at;
        due[1].fn();
      }
      now = end;
    },
  };
}

test('idle start is exactly one minute', () => {
  assert.strictEqual(S.IDLE_MS, 60000);
});

test('fires after a minute without activity, not before', () => {
  const timers = fakeTimers();
  let fired = 0;
  S.createIdleTimer({ timeoutMs: S.IDLE_MS, onIdle: () => fired++, timers });
  timers.advance(59999);
  assert.strictEqual(fired, 0);
  timers.advance(1);
  assert.strictEqual(fired, 1);
});

test('activity restarts the countdown', () => {
  const timers = fakeTimers();
  let fired = 0;
  const idle = S.createIdleTimer({ timeoutMs: S.IDLE_MS, onIdle: () => fired++, timers });
  timers.advance(50000);
  idle.poke();
  timers.advance(50000);
  assert.strictEqual(fired, 0);
  timers.advance(10000);
  assert.strictEqual(fired, 1);
});

test('does not start while a popup, the panel or a wallet prompt is open; tries again later', () => {
  const timers = fakeTimers();
  let fired = 0;
  let suppressed = true;
  S.createIdleTimer({ timeoutMs: S.IDLE_MS, isSuppressed: () => suppressed, onIdle: () => fired++, timers });
  timers.advance(60000);
  assert.strictEqual(fired, 0);
  suppressed = false;
  timers.advance(60000);
  assert.strictEqual(fired, 1);
});

test('stop() cancels', () => {
  const timers = fakeTimers();
  let fired = 0;
  const idle = S.createIdleTimer({ timeoutMs: S.IDLE_MS, onIdle: () => fired++, timers });
  idle.stop();
  timers.advance(120000);
  assert.strictEqual(fired, 0);
});

test('showing while already showing is ignored (no duplicate overlay)', () => {
  const s = S.createScreensaverState();
  assert.strictEqual(s.show('welcome'), true);
  assert.strictEqual(s.show('idle'), false);
  assert.strictEqual(s.mode, 'welcome');
  assert.strictEqual(s.hide(), true);
  assert.strictEqual(s.hide(), false);
});

test('only the idle screensaver leaves on any input', () => {
  const s = S.createScreensaverState();
  s.show('welcome');
  assert.strictEqual(s.exitsOnInput(), false);
  s.hide();
  s.show('idle');
  assert.strictEqual(s.exitsOnInput(), true);
});

test('cycles through every piece and wraps around', () => {
  assert.strictEqual(S.nextIndex(0, 64), 1);
  assert.strictEqual(S.nextIndex(63, 64), 0);
});
```

- [ ] **Step 2: Run to confirm they fail**

Run: `node --test tests/ui/screensaver.test.js`
Expected: FAIL with `Cannot find module '../../js/screensaver.js'`

- [ ] **Step 3: Implement `js/screensaver.js`**

```js
/*
  Screensaver welcome: frosted cards drift over the background, one comes forward with a placard.
  welcome mode (arrival, ✦ button) leaves via Enter Gallery / Esc / clicking the card;
  idle mode (60 s without input) leaves on any input and restores the scroll position.
*/
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ORScreensaver = api;
})(typeof self !== 'undefined' ? self : this, function () {
  const IDLE_MS = 60 * 1000;
  const FORWARD_MS = 6000;
  const FLOATERS = 7;

  function createIdleTimer({ timeoutMs = IDLE_MS, isSuppressed = () => false, onIdle, timers = { setTimeout, clearTimeout } }) {
    let handle = null;
    function fire() {
      if (isSuppressed()) { arm(); return; }
      onIdle();
    }
    function arm() {
      timers.clearTimeout(handle);
      handle = timers.setTimeout(fire, timeoutMs);
    }
    arm();
    return { poke: arm, stop() { timers.clearTimeout(handle); } };
  }

  function createScreensaverState() {
    let mode = null;
    return {
      get mode() { return mode; },
      show(m) { if (mode) return false; mode = m; return true; },
      hide() { if (!mode) return false; mode = null; return true; },
      exitsOnInput() { return mode === 'idle'; },
    };
  }

  function nextIndex(i, n) { return (i + 1) % n; }

  const api = { IDLE_MS, FORWARD_MS, createIdleTimer, createScreensaverState, nextIndex };

  function initBrowser() {
    const root = document.getElementById('screensaver');
    if (!root || !window.nfts || !window.nfts.length) return;
    const pieces = window.nfts;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const stage = root.querySelector('.ss-stage');
    const forward = root.querySelector('.ss-forward');
    const forwardImg = forward.querySelector('img');
    const title = root.querySelector('.ss-title');
    const subtitle = root.querySelector('.ss-subtitle');
    const rarity = root.querySelector('.ss-rarity');
    const enter = root.querySelector('.ss-enter');
    const state = createScreensaverState();
    const img = nft => `url('${window.ORGallery.imagePath(nft, 'sm')}')`;
    let index = 0;
    let swaps = 0;
    let cycle = null;
    let savedScroll = 0;

    for (let i = 0; i < FLOATERS; i++) {
      const card = document.createElement('div');
      card.className = 'ss-card';
      card.style.setProperty('--i', String(i));
      card.style.backgroundImage = img(pieces[(i * 9 + 5) % pieces.length]);
      stage.appendChild(card);
    }
    const floaters = [...stage.querySelectorAll('.ss-card')];

    function showForward() {
      const nft = pieces[index];
      forwardImg.src = window.ORGallery.imagePath(nft, 'sm');
      forwardImg.alt = nft.title;
      forward.dataset.id = nft.id;
      title.textContent = nft.title;
      subtitle.textContent = nft.subtitle;
      rarity.textContent = nft.rarity;
      rarity.className = `ss-rarity rarity ${nft.rarity.toLowerCase()}`;
      root.classList.remove('ss-swap');
      void root.offsetWidth; // restart the entrance animation
      root.classList.add('ss-swap');
      floaters[swaps % FLOATERS].style.backgroundImage = img(pieces[(index + 17) % pieces.length]);
      swaps++;
      index = nextIndex(index, pieces.length);
    }

    function show(mode) {
      if (!state.show(mode)) return;
      savedScroll = window.scrollY;
      document.body.classList.add('screensaver-on');
      root.hidden = false;
      showForward();
      cycle = setInterval(showForward, FORWARD_MS);
      enter.focus({ preventScroll: true });
    }

    function hide() {
      if (!state.hide()) return;
      clearInterval(cycle);
      root.hidden = true;
      document.body.classList.remove('screensaver-on');
      window.scrollTo(0, savedScroll);
      idle.poke();
    }

    const isSuppressed = () => Boolean(state.mode) ||
      document.getElementById('card-3d-modal')?.classList.contains('active') ||
      document.body.classList.contains('wallet-panel-open') ||
      Boolean(window.ORWallet && window.ORWallet.busy > 0);
    const idle = createIdleTimer({ isSuppressed, onIdle: () => show('idle') });

    ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'].forEach(type => {
      window.addEventListener(type, () => {
        if (state.exitsOnInput()) hide();
        else if (!state.mode) idle.poke();
      }, { passive: true });
    });

    root.addEventListener('pointermove', e => {
      if (reduced) return;
      root.style.setProperty('--mx', (e.clientX / window.innerWidth - 0.5).toFixed(3));
      root.style.setProperty('--my', (e.clientY / window.innerHeight - 0.5).toFixed(3));
    });
    enter.addEventListener('click', hide);
    forward.addEventListener('click', () => {
      const id = forward.dataset.id;
      hide();
      if (id) window.openCard3DModal(id);
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && state.mode) hide(); });
    document.addEventListener('click', e => {
      if (e.target.closest('[data-action="screensaver"]')) show('welcome');
    });

    api.show = show;
    api.hide = hide;
    show('welcome');
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initBrowser);
    else initBrowser();
  }
  return api;
});
```

- [ ] **Step 4: Run the tests**

Run: `node --test tests/ui/screensaver.test.js`
Expected: PASS (8 tests)

- [ ] **Step 5: Replace the old welcome pieces in `index.html`**

5a. Delete the token sale popup: the `<!-- Token sale announcement … -->` comment, the `<dialog id="token-sale-modal" …>…</dialog>` element and the `<script>` right after it that calls `showModal()`.

5b. Change `<body class="body-splash">` to `<body class="screensaver-on">` (the gallery stays hidden until the screensaver script takes over, so it never flashes).

5c. Replace everything from `<!-- Image Carousel Overlay -->` through the closing `</div>` of `<div id="individualCardView" …>` (the line before `<div class="container" id="mainContainer">`) with:

```html
    <!-- Screensaver welcome (arrival, ✦ button, 1 minute idle) -->
    <div id="screensaver" class="screensaver" role="dialog" aria-modal="true" aria-label="ORDINAL•RAINBOWS screensaver">
        <div class="ss-stage" aria-hidden="true"></div>
        <button type="button" class="ss-forward" aria-label="Open this piece">
            <img src="" alt="" decoding="async">
        </button>
        <div class="ss-placard bubble">
            <p class="ss-title"></p>
            <p class="ss-subtitle"></p>
            <span class="ss-rarity rarity"></span>
            <button type="button" class="ss-enter pill-btn pastel">Enter Gallery</button>
        </div>
    </div>
```

5d. In the inline `<script>`, delete the two temporary lines added in Task 4 (`const isMobile …` and `const showIndividualCard …`) and everything from `// CAROUSEL LOGIC` to the end of that `<script>` (the carousel, `hideCarousel`, `resetCarouselTimer` and the whole IMAGE PRELOADING SYSTEM). The `<script>` should now contain only the `window.nfts = [ … ];` array.

5e. Add the screensaver script after `js/wallet-panel.js`:

```html
    <script src="js/screensaver.js"></script>
```

- [ ] **Step 6: Replace the old welcome styles in `css/site.css`**

Delete these rule blocks: `.carousel-overlay`, `.carousel-overlay.preloading, .carousel-overlay.hidden`, `body.body-splash .cloud-layer`, `#carouselContent`, `#carouselContent.preloading, #carouselContent.hidden`, `.carousel-container`, `.carousel-image`, `.carousel-image:hover`, `.carousel-nav`, `.carousel-nav:hover`, `.carousel-nav.prev`, `.carousel-nav.next`, `.carousel-info`, `.carousel-title`, `.carousel-subtitle`, `.carousel-skip`, `.carousel-skip:hover`, `.individual-card-view`, `.individual-card-view.active`, `.individual-card-view::before`, `.individual-card-container`, `.back-to-gallery`, `.back-to-gallery:hover`, and every rule whose selector starts with `.token-sale`.

Append:

```css
/* ===== Screensaver (redesign) ===== */
body.screensaver-on { overflow: hidden; }
body.screensaver-on #mainContainer,
body.screensaver-on .sticky-bar { visibility: hidden; }
.screensaver { position: fixed; inset: 0; z-index: 50; display: grid; place-items: center; overflow: hidden; perspective: 1200px; }
.screensaver[hidden] { display: none; }
.ss-stage {
    position: absolute;
    inset: 0;
    transform-style: preserve-3d;
    transform: rotateX(calc(var(--my, 0) * -6deg)) rotateY(calc(var(--mx, 0) * 8deg));
    transition: transform 0.6s ease-out;
}
.ss-card {
    position: absolute;
    width: clamp(110px, 14vw, 190px);
    aspect-ratio: 1;
    border-radius: 22px;
    background: var(--frost-glass) center / cover no-repeat;
    box-shadow: var(--shadow-float);
    opacity: 0.55;
    animation: ss-drift 38s ease-in-out infinite;
    animation-delay: calc(var(--i) * -5.4s);
}
.ss-card::before {
    content: '';
    position: absolute;
    inset: 0;
    padding: 2px;
    border-radius: inherit;
    background: var(--pastel-rainbow-diag);
    -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
    -webkit-mask-composite: xor;
    mask-composite: exclude;
}
.ss-card:nth-child(1) { top: 8%; left: 6%; }
.ss-card:nth-child(2) { top: 12%; right: 8%; }
.ss-card:nth-child(3) { bottom: 14%; left: 10%; }
.ss-card:nth-child(4) { bottom: 10%; right: 12%; }
.ss-card:nth-child(5) { top: 40%; left: 2%; }
.ss-card:nth-child(6) { top: 46%; right: 3%; }
.ss-card:nth-child(7) { top: 4%; left: 42%; }
@keyframes ss-drift {
    0%, 100% { transform: translate3d(0, 0, -80px) rotate(-6deg); }
    25% { transform: translate3d(30px, -24px, -40px) rotate(3deg); }
    50% { transform: translate3d(-20px, 30px, -120px) rotate(7deg); }
    75% { transform: translate3d(-36px, -10px, -60px) rotate(-2deg); }
}
.ss-forward {
    position: relative;
    z-index: 2;
    width: min(46vmin, 420px);
    aspect-ratio: 1;
    padding: 14px;
    border: 0;
    border-radius: 30px;
    background: var(--frost-glass);
    -webkit-backdrop-filter: blur(18px) saturate(160%);
    backdrop-filter: blur(18px) saturate(160%);
    box-shadow: var(--shadow-lift);
    transform: translateY(-8vh);
    cursor: pointer;
}
.ss-forward img { display: block; width: 100%; height: 100%; object-fit: cover; border-radius: 20px; }
.ss-forward:focus-visible { outline: 2px solid #fff; outline-offset: 4px; }
.ss-placard {
    position: absolute;
    bottom: 6vh;
    left: 50%;
    z-index: 3;
    min-width: min(440px, 90vw);
    padding: 16px 28px 18px;
    border-radius: 24px;
    text-align: center;
    transform: translateX(-50%);
}
.ss-title { margin: 0; font-family: var(--font-display); font-weight: 600; font-size: 1.5rem; letter-spacing: 0.02em; }
.ss-subtitle { margin: 2px 0 10px; font-family: var(--font-body); font-style: italic; opacity: 0.85; }
.ss-enter { display: block; margin: 14px auto 0; }
.screensaver.ss-swap .ss-forward { animation: ss-come-forward 1.2s ease-out both; }
.screensaver.ss-swap .ss-title,
.screensaver.ss-swap .ss-subtitle,
.screensaver.ss-swap .ss-rarity { animation: ss-fade-in 1s 0.3s ease-out both; }
@keyframes ss-come-forward {
    from { opacity: 0; transform: translateY(-8vh) translateZ(-260px) rotateY(-18deg); }
    to { opacity: 1; transform: translateY(-8vh) translateZ(0) rotateY(0); }
}
@keyframes ss-fade-in { from { opacity: 0; } to { opacity: 1; } }
@media (max-width: 600px) {
    .ss-card:nth-child(n + 5) { display: none; }
    .ss-forward { width: min(70vw, 340px); transform: translateY(-12vh); }
    .ss-placard { bottom: 4vh; }
}
@media (prefers-reduced-motion: reduce) {
    .ss-card { animation: none; }
    .ss-stage { transform: none; transition: none; }
    .screensaver.ss-swap .ss-forward { animation: ss-fade-in 1s ease-out both; }
}
```

- [ ] **Step 7: Verify**

Run: `grep -n "token-sale\|carousel\|individualCard\|body-splash" index.html css/site.css`
Expected: no matches.

Run: `npm test` — Expected: all pass (66).

Manual at http://localhost:8080:
- On arrival: no token popup; frosted rainbow-rim cards drift over the background; a card comes forward every 6 s with a placard (serif title, italic subtitle, rarity); moving the mouse tilts the scene gently. It keeps cycling until "Enter Gallery" (or Esc).
- Clicking the forward card enters the gallery and opens that piece's 3D card.
- In the gallery, ✦ (header or sticky bar) brings the screensaver back; "Enter Gallery" returns.
- Scroll halfway, set a filter, wait 60 s without touching anything → the screensaver starts; move the mouse → it closes and you are at the same scroll position with the same filter.
- With a 3D card open, or the wallet panel open, or while a Yours signing prompt is waiting, waiting 60 s does **not** start it.
- With "reduce motion" turned on in the OS, cards don't drift or tilt and the forward card fades in.

- [ ] **Step 8: Checkpoint** — owner reviews and commits (`feat: screensaver welcome with floating cards and placard; remove token popup, slideshow and single card view`).

---

### Task 7: Background on phones — lite animation with crossfade fallback

**Files:**
- Modify: `js/bg-anim.js` (whole file)
- Modify: `css/bg-anim.css` (the two `@media` blocks at the end)
- Test: `tests/ui/bg-anim.test.js`

**Interfaces:**
- Consumes: `images/sm/*.JPG` (Task 2); the SVG filter elements `#cloud-turb`, `#cloud-turb-b` and their sibling `feDisplacementMap` in `index.html`.
- Produces (Node only): `chooseBgMode({ isPhone: boolean, reducedMotion: boolean }) → 'full'|'lite'|'fade'`, `isStuttering(frameIntervalsMs: number[]) → boolean`. Browser: adds class `bg-fade` to `<html>` in fade mode.

- [ ] **Step 1: Write the failing tests**

`tests/ui/bg-anim.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const B = require('../../js/bg-anim.js');

test('desktop gets the full animation, phones the lite one', () => {
  assert.strictEqual(B.chooseBgMode({ isPhone: false, reducedMotion: false }), 'full');
  assert.strictEqual(B.chooseBgMode({ isPhone: true, reducedMotion: false }), 'lite');
});

test('reduced motion always gets the crossfade', () => {
  assert.strictEqual(B.chooseBgMode({ isPhone: false, reducedMotion: true }), 'fade');
  assert.strictEqual(B.chooseBgMode({ isPhone: true, reducedMotion: true }), 'fade');
});

test('stutter detection needs enough samples and a slow median frame', () => {
  assert.strictEqual(B.isStuttering([50, 50, 50]), false);
  assert.strictEqual(B.isStuttering(Array(30).fill(16.7)), false);
  assert.strictEqual(B.isStuttering(Array(30).fill(50)), true);
  assert.strictEqual(B.isStuttering([...Array(20).fill(16), ...Array(9).fill(200)]), false);
});
```

- [ ] **Step 2: Run to confirm they fail**

Run: `node --test tests/ui/bg-anim.test.js`
Expected: FAIL (`B.chooseBgMode is not a function` — the current file exports nothing)

- [ ] **Step 3: Replace `js/bg-anim.js`**

```js
/*
  Background animation: two cloud layers of the pieces, warped by animated SVG turbulence and
  crossfading between images.
  full (desktop) · lite (phones: gentler warp, ~15 updates/s, 800px images) · fade (crossfade only:
  reduced motion, or the first 3 s measure a median frame slower than 40 ms).
*/
(function () {
    var NAMES = [
        'AlchemyBow.JPG', 'NebulaBow%231.JPG', 'TunnelBow%231.JPG', 'TieDyeBow%231.JPG',
        'HeartBow.JPG', 'GhostyBow%233.JPG', 'MirrorBow%232.JPG', 'FlowBow%233.JPG',
        'CosmicBow%232.JPG', 'HazeBow%233.JPG', 'EclipseBow%231.JPG', 'ZippyBow.JPG',
        'HummingBow%231.JPG'
    ];

    function chooseBgMode(opts) {
        if (opts.reducedMotion) return 'fade';
        return opts.isPhone ? 'lite' : 'full';
    }

    function isStuttering(intervals) {
        if (intervals.length < 20) return false;
        var sorted = intervals.slice().sort(function (a, b) { return a - b; });
        return sorted[Math.floor(sorted.length / 2)] > 40;
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { chooseBgMode: chooseBgMode, isStuttering: isStuttering };
        return;
    }

    var BASE = (typeof window.BG_BASE_PATH !== 'undefined') ? window.BG_BASE_PATH : 'images/';
    var isPhone = window.matchMedia('(max-width: 768px), (pointer: coarse)').matches;
    var mode = chooseBgMode({ isPhone: isPhone, reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches });
    var useSmall = mode === 'lite' || (mode === 'fade' && isPhone);
    var BG_IMAGES = NAMES.map(function (n) { return BASE + (useSmall ? 'sm/' : '') + n; });
    var cloudAnimT = 0;

    function enterFade() {
        mode = 'fade';
        document.documentElement.classList.add('bg-fade');
    }

    // Fewer noise octaves and a smaller warp: the turbulence's next sibling is its feDisplacementMap.
    function tuneForPhones() {
        document.querySelectorAll('#cloud-turb, #cloud-turb-b').forEach(function (el) {
            el.setAttribute('numOctaves', '2');
            if (el.nextElementSibling) el.nextElementSibling.setAttribute('scale', '56');
        });
    }

    /* Animate turbulence baseFrequency; lite mode updates every 4th frame. */
    function startCloudAnim() {
        var turb = document.getElementById('cloud-turb');
        var turb2 = document.getElementById('cloud-turb-b');
        if (!turb || mode === 'fade') return;
        var frame = 0;
        var last = 0;
        var started = 0;
        var checked = false;
        var intervals = [];
        var step = mode === 'lite' ? 0.0026 : 0.00065;
        function tick(ts) {
            if (mode === 'fade') return;
            if (!started) started = ts;
            if (!checked) {
                if (last) intervals.push(ts - last);
                if (ts - started >= 3000) {
                    checked = true;
                    if (isStuttering(intervals)) { enterFade(); return; }
                }
            }
            last = ts;
            frame++;
            if (mode === 'lite' && frame % 4 !== 0) { requestAnimationFrame(tick); return; }
            cloudAnimT += step;
            var fx = 0.009 + Math.sin(cloudAnimT * 1.10) * 0.012 + Math.sin(cloudAnimT * 2.30) * 0.006;
            var fy = 0.011 + Math.cos(cloudAnimT * 0.75) * 0.011 + Math.cos(cloudAnimT * 1.90) * 0.006;
            turb.setAttribute('baseFrequency', fx.toFixed(5) + ' ' + fy.toFixed(5));
            if (turb2) {
                var fx2 = 0.010 + Math.sin(cloudAnimT * 0.85 + 2.10) * 0.012 + Math.sin(cloudAnimT * 1.70) * 0.006;
                var fy2 = 0.009 + Math.cos(cloudAnimT * 0.60 + 1.50) * 0.011 + Math.cos(cloudAnimT * 1.50) * 0.006;
                turb2.setAttribute('baseFrequency', fx2.toFixed(5) + ' ' + fy2.toFixed(5));
            }
            requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
    }

    /* Crossfade images across both cloud layers (runs in every mode). */
    function initBackgroundCycle() {
        var HOLD_MS = 4000;
        var FADE_MS = 9000;
        var N = BG_IMAGES.length;
        var bgBot = document.getElementById('bgLayerA');
        var bgTop = document.getElementById('bgLayerB');
        var c1Bot = document.getElementById('cloud1A');
        var c1Top = document.getElementById('cloud1B');
        var c2Bot = document.getElementById('cloud2A');
        var c2Top = document.getElementById('cloud2B');
        if (!c1Bot || !c1Top) return;

        [bgBot, bgTop].forEach(function (el) {
            if (el) { el.style.transition = 'none'; el.style.opacity = '0'; }
        });
        [c1Bot, c1Top, c2Bot, c2Top].filter(Boolean).forEach(function (el) { el.style.transition = 'none'; });

        var topSrc = BG_IMAGES[1];
        var topIdx = 1;
        var preloaded = {};
        function preload(i) {
            if (preloaded[i]) return;
            preloaded[i] = true;
            var img = new Image();
            img.src = BG_IMAGES[i];
        }
        function setImg(el, src) { if (el) el.style.backgroundImage = "url('" + src + "')"; }
        function setOp(els, v) {
            var s = v.toFixed(4);
            els.forEach(function (el) { if (el) el.style.opacity = s; });
        }
        var botEls = [c1Bot, c2Bot].filter(Boolean);
        var topEls = [c1Top, c2Top].filter(Boolean);
        function applyBot(src) { botEls.forEach(function (el) { setImg(el, src); }); }
        function applyTop(src) { topSrc = src; topEls.forEach(function (el) { setImg(el, src); }); }

        preload(0); preload(1); preload(2);
        applyBot(BG_IMAGES[0]);
        applyTop(BG_IMAGES[1]);
        setOp(botEls, 1.0);
        setOp(topEls, 0.0);

        var phase = 'hold';
        var phaseStart = null;
        function tick(ts) {
            if (!phaseStart) phaseStart = ts;
            if (phase === 'hold') {
                if (ts - phaseStart >= HOLD_MS) { phase = 'crossfade'; phaseStart = ts; }
            } else {
                var f = Math.min((ts - phaseStart) / FADE_MS, 1.0);
                setOp(botEls, Math.cos(f * Math.PI / 2));
                setOp(topEls, Math.sin(f * Math.PI / 2));
                if (f >= 1.0) {
                    topIdx = (topIdx + 1) % N;
                    applyBot(topSrc);
                    applyTop(BG_IMAGES[topIdx]);
                    preload((topIdx + 1) % N);
                    setOp(botEls, 1.0);
                    setOp(topEls, 0.0);
                    phase = 'hold';
                    phaseStart = ts;
                }
            }
            requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
    }

    function init() {
        if (mode === 'fade') document.documentElement.classList.add('bg-fade');
        if (mode === 'lite') tuneForPhones();
        startCloudAnim();
        initBackgroundCycle();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
```

(Images now preload one ahead instead of all 13 at once, so phones don't download every background image up front.)

- [ ] **Step 4: Update the end of `css/bg-anim.css`**

Replace the two final `@media` blocks:

```css
@media (max-width: 768px) {
    .cloud-layer { display: none; }
}

@media (prefers-reduced-motion: reduce) {
    .cloud-layer { animation: none !important; }
}
```

with:

```css
/* Crossfade fallback: reduced motion or a struggling device (set by js/bg-anim.js) */
.bg-fade .cloud-layer {
    filter: none !important;
    animation: none !important;
    transform: scale(1.08);
}
```

- [ ] **Step 5: Run the tests**

Run: `node --test tests/ui/bg-anim.test.js`
Expected: PASS (3 tests)

Run: `npm test` — Expected: all pass (69).

- [ ] **Step 6: Verify on real devices**

- Desktop at http://localhost:8080: the background looks and moves exactly as before.
- Phone: the local dev server only listens on this computer (by design, so `.env.local` can't leak), so test phones on a Vercel **preview** deploy: run `vercel` (not `vercel --prod`) and open the preview URL it prints on the phone. Expected: the swirling clouds of your pieces are visible behind the site and scrolling stays smooth.
- Phone with "Reduce motion" on (iOS: Settings → Accessibility → Motion; Android: Remove animations): pieces slowly crossfade with no swirl.
- Desktop, DevTools → Rendering → "Emulate CSS prefers-reduced-motion: reduce", reload: crossfade only, `<html>` has class `bg-fade`.
- `checker.html` and `/OR/` still show their backgrounds (they also use `js/bg-anim.js`).

- [ ] **Step 7: Checkpoint** — owner reviews and commits (`feat: background animation on phones with crossfade fallback`).

---

### Task 8: 3D card popup fonts and final pass

**Files:**
- Modify: `css/site.css`

**Interfaces:**
- Consumes: everything above. Produces: nothing new.

- [ ] **Step 1: Give the 3D card popup the new fonts**

Append to `css/site.css`:

```css
/* ===== 3D card popup: new fonts only (behaviour unchanged) ===== */
.card-front-title, .card-3d-back-title, .card-3d-front-title { font-family: var(--font-display); font-weight: 600; letter-spacing: 0.02em; }
.card-face, .card-3d-ctrl-btn, .card-3d-claim-btn, .card-3d-note { font-family: var(--font-body); }
```

- [ ] **Step 2: Full test run**

Run: `npm test`
Expected: all pass (69).

- [ ] **Step 3: Manual checklist (desktop and a real phone via a Vercel preview)**

- [ ] Arrival shows the screensaver; "Enter Gallery" enters; clicking the forward card opens its 3D card.
- [ ] ✦ in the header and in the sticky bar both bring the screensaver back.
- [ ] 60 s idle starts it; any input returns to the same scroll position and filters; it never starts over an open 3D card, open wallet panel or pending Yours prompt.
- [ ] Header: serif wordmark, "VOL. 1" pill, both taglines word for word, filter pills; the sticky bar slides in on scroll and works.
- [ ] Cards: frosted, pastel rim, deep shadow, inset rounded image, hover lift; rarity + short ID with 📋/↗; pastel Order Prints opens Printify in a new tab; EclipseBow #3 says "Not yet inscribed".
- [ ] Grid: 4 / 3 / 2 / 1 columns at desktop / ≤1200 / ≤900 / ≤520px.
- [ ] Rewards: green badge on AlchemyBow; "Rewards waiting" sort puts it first.
- [ ] Wallet: Connect pill → ⭐ count; ⭐ + gold glow on owned cards; Only mine; panel opens/closes (outside click, ✕, Esc), thumbnails open their 3D card, copy address, disconnect clears everything.
- [ ] A claim shows its result on the card (no browser alert) and the pill/panel/badges update without reloading.
- [ ] Without Yours installed: pill reads "Get Yours Wallet ↗".
- [ ] Keyboard only (Tab/Shift-Tab/Enter/Esc): every pill, filter, card button, the panel and the screensaver are reachable with a visible focus outline.
- [ ] OS "reduce motion" on: screensaver fades instead of drifting; background crossfades.
- [ ] `checker.html`, `admin.html` and `/OR/` look and work as before.

- [ ] **Step 4: Checkpoint** — owner reviews and commits (`style: new fonts in the 3D card popup`), then pushes to deploy.
