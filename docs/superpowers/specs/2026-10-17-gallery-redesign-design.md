# ORDINAL•RAINBOWS Gallery Redesign — Design

**Date:** 2026-10-17
**Status:** Approved in conversation, awaiting written-spec review
**Scope:** The main page (`index.html`): welcome, header, gallery cards, wallet, background on phones. The 3D card popup, claims, rewards, checker, admin and `/OR` page keep their behaviour.

## Goal

The site serves collectors and new visitors equally. Today the cards and header read as part of the background ("wallpaper"), the title is busy, and the wallet box sits on top of the site. After the redesign:

- Each piece reads as its own object, floating over the background.
- The background animation — a showcase of the art and of the developer craft — is the one moving showpiece, on desktop and phones.
- The wallet stays out of the way until it's needed, and a connected holder can instantly see and filter their own pieces.

## Decisions

| Area | Decision |
|---|---|
| Audience | Collectors and new visitors equally |
| Token sale popup | Removed entirely (token is a later project) |
| Welcome | Kept as a screensaver: cycles until "Enter Gallery" is clicked |
| Screensaver style | Floating frosted glass cards (with depth on mouse move), one comes forward at a time with a museum-style placard (title, subtitle, rarity) |
| Screensaver triggers | Arrival; ✦ button; auto-start after **1 minute** idle; any input returns to the same place |
| Single card view | Removed (only reachable from the old slideshow). Clicking a screensaver card opens the 3D card popup |
| Title | Calm solid wordmark "ORDINAL•RAINBOWS" in **Playfair Display**, "VOL. 1" pastel pill; both original taglines kept **word for word**, calmer styling (smaller, solid, not image-filled) |
| Header | Centered bubble layout; on scroll it shrinks into one slim sticky floating bar |
| Cards | Frosted glass with a thin dusty-pastel rainbow rim, deep soft shadow, image inset with rounded corners |
| Card density | 4 per row desktop, 3 tablet, 2 large phone, 1 small phone |
| Card data | Title, subtitle, rarity, short inscription ID with 📋 copy + ↗ view on-chain. "PNG 5000px × 5000px" removed |
| Order Prints | Static dusty-pastel rainbow gradient button, opens Printify in a new tab |
| Ownership | ⭐ + gold glow on cards in the connected wallet; "⭐ Only mine" filter |
| Extra sort | "Rewards waiting" (pieces with BSV to claim first) |
| Wallet | Header pill → slide-out side panel. Replaces the top-right button and floating wallet box |
| Phones | Real background animation in a lighter form; slow crossfade fallback for reduced-motion or stuttering devices |
| Build approach | Restyle and split into focused files; same plain HTML/JS site, no framework |

## 1. Visual system

- **Type:** Playfair Display (wordmark, card titles, placard titles); Nunito (taglines, labels, buttons, body). Loaded from Google Fonts.
- **Colour roles:**
  - Dusty-pastel rainbow gradient (blush `#f7c6c7` → butter `#f9e2b8` → mint `#cdeccd` → sky `#c3dff2` → lavender `#d9c8ef`): Order Prints, "VOL. 1" pill, card rims, Connect pill.
  - Smoky dark glass (`rgba(14,12,28,0.82)`): header bubbles, sticky bar, wallet panel.
  - Frosted glass (light translucent + backdrop blur): cards, screensaver cards.
  - Gold: ⭐ and "yours" glow. Green: rewards waiting. Rarity pills keep their current colours.
- **Shape:** rounded everywhere — pill controls, generous card radius, soft deep shadow under every floating object.
- **Tokens:** all colours, shadows, radii and spacing defined once as CSS custom properties.

## 2. Files

| File | Responsibility |
|---|---|
| `index.html` | Page structure; keeps `window.nfts` (the piece list) where it is |
| `css/site.css` | All page styles (moved out of `index.html`), built on the tokens |
| `js/gallery.js` | Card rendering, search, sort (A–Z, rarity ↑/↓, rewards waiting), rarity filter, ⭐ Only mine, reward badges, ⭐/glow, copy/view ID |
| `js/screensaver.js` | Floating-card welcome, placard, ✦ button, 1-minute idle start, restore position |
| `js/wallet-panel.js` | Header/sticky wallet pill and slide-out side panel |
| `js/rewards-integration.js` | Existing: wallet connect, ownership list, 3D card popup, claims. Shrinks as replaced UI code (old wallet box, single card view hooks) is removed |
| `js/bg-anim.js` + `css/bg-anim.css` | Background animation; adds the phone variant and the crossfade fallback |
| `js/wallet.js` | Unchanged (Yours / `window.CWI` helpers) |

The old wallet scripts (`bsv-wallet-sdk.js`, `bsv-auth*.js`, etc.) stay on disk untouched; they are already not loaded.

Pure logic in `gallery.js` and `screensaver.js` (filter/sort functions, idle timer) is written so it can be loaded by Node tests as well as the browser.

## 3. Page flow

1. **Arrival → screensaver.** Background animation full-screen; frosted cards drift and tilt slowly with depth following the mouse; one card at a time floats forward with a placard (Playfair title, subtitle, rarity pill). Cycles until "Enter Gallery". Clicking the forward card opens its 3D card in the gallery. Images load progressively so the welcome starts immediately.
2. **Gallery.** Header bubbles (wordmark + "VOL. 1", taglines, filter row; screensaver and wallet pills), then the card grid. On scroll the header shrinks into the sticky bar: small wordmark, search, rarity, ⭐ Only mine, ✦, wallet pill.
3. **Return to screensaver.** ✦ button, or after 1 minute with no input. Any input restores the exact scroll position and filters. Does **not** auto-start while the 3D card popup or wallet panel is open, or while a wallet signing request is pending.

## 4. Cards and controls

**Card (top to bottom):** frosted glass + pastel rim + deep shadow; square inset rounded image (lazy-loaded); Playfair title; italic Nunito subtitle; one line with rarity pill (left) and short inscription ID `xxxxxx…xxxxxx` with 📋 copy (shows "Copied!") and ↗ view on-chain at `https://1sat.market/outpoint/<origin>` (new tab; verified to resolve) (right); Order Prints button (or "Prints coming soon" when a piece has no print link).

**On the image:** green "⚡ 0.0000x BSV to claim" pill top-left when rewards are waiting; ⭐ top-right and a gold glow around the card when the piece is in the connected wallet.

**Interaction:** clicking the image opens the 3D card popup (unchanged). Hover lifts the card slightly and deepens its shadow.

**Controls:** Search (title, subtitle, rarity); Sort (A–Z, rarity high→low, rarity low→high, rewards waiting); Rarity filter; ⭐ Only mine — before connecting it reads "Connect to see yours" and opens the wallet connect.

## 5. Wallet pill and side panel

- **Pill, not connected:** pastel "🔗 Connect" — triggers the existing Yours connect.
- **Pill, connected:** "⭐ N · ⚡ X BSV" (pieces owned · rewards waiting across them); "⭐ N" when nothing is waiting.
- **Yours missing:** the pill says so and links to install Yours. No browser alert popups.
- **Side panel:** slides in from the right over a dimmed backdrop; closes on outside click, ✕ or Esc; full width on phones. Contains: short address with copy; "Your pieces" as rounded thumbnails, each with its ⚡ amount — tapping one closes the panel and opens that piece's 3D card; "Rewards waiting" total; Disconnect.
- **State:** connecting loads the owned pieces once, then ⭐/glow, Only mine and the pill update. After a claim the pill, panel and badges refresh without a reload. Disconnect clears ⭐, glows and counts and turns Only mine off.
- **Removed:** the top-right connect button, the floating wallet box and its MNEE line.

## 6. Background, performance, accessibility, errors

- **Background:** desktop unchanged. Phones: same clouds with a gentler warp updated less often, using smaller derived copies of the images. Fallback to a slow crossfade (no warp) when `prefers-reduced-motion` is set or the first seconds measure stuttering.
- **Performance:** lazy-loaded images; transform/opacity-only animation for the screensaver and sticky header.
- **Accessibility:** all controls and the panel keyboard-operable with visible focus; reduced motion turns screensaver drift/tilt into fades; text always sits on dark or frosted surfaces for contrast.
- **Errors:** failed image → soft placeholder; rewards lookup failure → no badges, nothing else breaks; wallet problems → short message in the pill/panel.

## 7. Testing

- Automated (`node:test`, alongside the existing 40): search/sort/rarity/Only mine (including "rewards waiting" order), idle timer start/suppression/restore, wallet-state updates after connect, claim and disconnect.
- Manual checklist on desktop and a real phone: screensaver (arrival, ✦, idle, restore), sticky bar, wallet pill + panel, a claim, Only mine, ⭐/glow, background on both, reduced-motion mode.

## Out of scope

- Token sale (popup removed; future project).
- Changes to the 3D card popup beyond picking up the new fonts.
- The checker, admin and `/OR` pages.
- Deleting the old wallet scripts.
