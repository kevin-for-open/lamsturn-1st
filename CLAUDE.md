# Lamsturn — Marketing Website

Single-page, multi-language marketing site for **Lamsturn**, a premium Korean grill & smoker
brand (asado / robata / smokers), targeting international professional-kitchen inquiries.

This file briefs you (Claude Code) on how the project is built so you can make changes safely.

Last verified against the build: **2026-08-18** (tag v1.14, commit `4be4ab5`,
`index.html` 385,971 bytes).

---

## How to run it

There is **no build step**. It is static files, but you must serve them over HTTP (not `file://`,
which blocks the module/asset fetches and the map):

```bash
npx serve .            # then open the printed http://localhost:… URL
# or
python3 -m http.server 8000   # open http://localhost:8000/
```

`index.html` is the whole site.

---

## Architecture — this is a "Design Component" (DC)

`index.html` is one self-contained component with three parts:

1. **`support.js`** — the runtime that renders the component. **Do not edit.** It parses the
   `<x-dc>` template, resolves `{{ }}` holes, and mounts the logic class.
2. **The template** — everything between `<x-dc>` and `</x-dc>` (roughly lines 20–1100). Plain HTML
   with **inline styles only** (no CSS classes/stylesheets — keep it that way). Dynamic values are
   `{{ dotted.paths }}` filled from the logic class. Control flow uses `<sc-if>` / `<sc-for>`.
3. **The logic class** — inside `<script type="text/x-dc" data-dc-script>`:
   `class Component extends DCLogic { … }`. `renderVals()` returns every value the template reads.
   This is plain JS (no imports/TypeScript). Put any computed value / handler here and expose it by
   name; the template can only do dotted lookups, never expressions like `{{ a + b }}`.

External CDN dependencies: Google Fonts (Archivo, IBM Plex Mono) in `<helmet>`, and
**Leaflet 1.9.4** plus **Leaflet.markercluster 1.5.3** for the kitchens map — those two sit in the
real `<head>`, deliberately.

> **Never move a JS library into `<helmet>`.** The DC runtime re-runs helmet scripts, so a second
> copy of the library loads and replaces the global. Nothing errors, and most code survives it, but
> every `instanceof` across the two copies silently returns false. That is what disabled cluster
> clicks: markercluster promotes a click to `clusterclick` only when the layer passes
> `instanceof MarkerCluster`, so clusters drew fine, took the click, and did nothing — while plain
> markers, which need no such check, kept working and hid the problem. Stylesheets in `<helmet>`
> are fine; only scripts that define classes are at risk.

### Where things live (line numbers are approximate — search by name)

| What | Where |
|---|---|
| Page routing (home / products / about / contact / compare / product-detail) | `state.page`, the `go(p)` method, and `nav*` vals in `renderVals()` |
| Per-page SEO (title/description/canonical/og) | `seoForPage(p)` + `urlForPage(p)` + `pageFromUrl()`. **Every indexable route needs an entry in all three, and a matching row in `sections`/`products` inside `scripts/build-static-pages.mjs`** — the script emits the static HTML that crawlers actually fetch, the logic class keeps the meta in step during SPA navigation. |
| **All UI copy**, 5 languages, **274 keys each** | the **`T`** object, line ~1854 — keys `EN`, `ES`, `ZH`, `FR`, `JA` |
| **Product-detail body copy** | also in **`T`** — the 69 `dj*` (J900) and `dy*` (LGY) keys |
| Detail-page eyebrows / intros / breadcrumbs / CTAs | the **`DT`** object — **20 keys** per language |
| How the template sees copy | `renderVals()` does `const t = Object.assign({}, T[lang], DT[lang])` — so **both** objects are read as `{{ t.someKey }}`; there is no `dt.` namespace in the template |
| Language switcher | two `<select>`s (desktop nav + mobile menu) → `onLang` |
| Product tables (models, dims, weights) | `lga`, `lgy`, `smokers`, `indoor`, `acc` arrays — **not translated** (model codes/specs stay as-is) |
| Product card order | the order entries are written in the catalog JSON **is** the display order — `prep()` does not sort. To reorder cards, move the lines. |
| Grill piece counts (`g`) | a count is written ` ×N` — whitespace, `×`, digits with **no gap** (`W378×D495 ×2`), and may appear anywhere in the value, so a model with two grills reads `W258×D270 ×3 · W565×D270 ×2`. Dimensions must keep their own shape — `A×B` (no space before `×`) or `A × B` (space after it) — because `displayDimensions` tells the two apart by exactly that. Never put letters after a number (`2ea`, `SUS304`): they are converted as inches. One grill carries no marker. The card/compare row is labelled `t.lblMainGrill`; resting-grill sizes live on detail pages only. |
| Depth pairs (LGY_610_D300 / _D400 …) | two separate cards sharing one detail page: the **D300** entry carries the full `detail` payload plus `detail.model` (the family code, so the ProductGroup JSON-LD is not named after one card), the **D400** entry carries `detailOf: {slug, page}` — a link-only reference the generator ignores. The detail page's own CTA still opens a depth chooser, built by grouping catalog codes in `renderVals` (`depthReg`). |
| Kitchens map + restaurant list | Leaflet; venue data in `const D` (line ~1490), mapped to `this._inst` by `installs()` at line ~1487 |
| Kitchens tier/column labels per language | `GRP` (line ~3558) and `COL` (line ~3573) |
| Tweakable props (`lang`, `showMichelin`) | `data-props` on the `<script data-dc-script>` tag |

### Kitchens / Michelin data

**The Restaurants page: label, route and internal id do not all use the same word — on purpose.**
Renamed 2026-08-18 on the owner's request. What says *restaurant*: nav, mobile menu, footer link,
page title + description, the stat tile, the Michelin slogan, the map caption, the footnote and
the untiered `GRP` heading, in all five languages — plus the **URL, now `/restaurants/`**, its
static page, canonical/og:url and the sitemap row.

What still says *kitchens*, deliberately: `state.page === 'kitchens'` and every identifier built
on it (`isKitchens`, `cKitchens`, `goKitchens`, `kitchenFilterPass`), and every translation key
NAME (`kitchens`, `fKitchens`, `kLblKitchens`, `kIntro`, `kSloganTpl`, `mapCaption`, `kNote`) —
only their VALUES moved. These are internal, they agree with each other, and renaming ~15
identifiers changes nothing a visitor can see. **Do not "tidy" this.**

Two things make the old URL safe: `_redirects` at the repo root 301s `/kitchens/` →
`/restaurants/` at the edge (Workers Static Assets reads it from the asset directory, and the
deploy rsync does not exclude it), and `pageFromUrl` keeps a legacy `'/kitchens'` row so a stale
link that dodges the redirect still renders this page rather than silently falling back to Home.
Keep both.

**The home page uses "kitchen" in two senses. Only one of them was swept.** Venue sense — the
businesses cooking on Lamsturn — moved to *restaurant* on 2026-08-18: `reelsTitle`,
`lblProKitchens`, `michelinBlurb` (first occurrence only) and `btoFootPre`. Room sense — the
physical space a grill is sized to fit — is correct as "kitchen" and must stay: `btoBody`,
`bto1d`, `sec1Title`, `djKitEye`, `contactIntro`.

**Two counts on the home page, and only one of them was stale.** `const D` holds 78 kitchens:
17 Michelin-listed, 61 not.

- The hero stat strip is a **total**. It was hardcoded `60+`, understating by 18 and disagreeing
  with the Restaurants page. It now renders `{{ kCount }}` — derived from `const D`, so adding a
  venue updates the home page too. Do not put a literal back.
- `michelinBlurb`'s "60+ professional kitchens" is a **different quantity**. The sentence is
  additive — starred rooms *and* 60+ others — and there are exactly 61 others, so **60+ is
  correct**. Writing 78 there would claim 78 *on top of* the starred ones, i.e. 95 total.
  **Do not "sync" this number to the hero.** (Its three-star claim is separately deliberate;
  see Open items.)

`plan` reads "Plan your grill with us." rather than "your kitchen": its own block promises
"custom sizes, accessories and layout — planned together with our engineers", so the grill is
what is actually planned together, and it echoes `btoTitle` "Your size. Your accessories. Your
grill." Spanish takes `grill` there, not `parrilla` — this site uses `parrilla` for the grate
(`cmpSub`, `precisionBody`) and `grill` for the appliance (`btoTitle`).

`const D` is a compact tuple array — `[name, lat, lng, prods, m, place]`. **79 rows**; the one row
with `m === -1` is a showroom and is filtered out of the kitchen count, so the site shows
**78 kitchens**, 17 of them Michelin-rated (`m > 0`).

`m` (tier) mapping, used for the list badge and map popup around line 1233:

| `m` | Meaning | Rows |
|---|---|---|
| `4` | Three Michelin stars | 0 — fully wired, waiting on data |
| `3` | Two Michelin stars | 7 |
| `2` | One Michelin star | 2 |
| `1` | Michelin Guide | 8 |
| `0` | Listed kitchen, no Michelin badge | 61 |
| `-1` | Showroom — excluded from the kitchen count | 1 |

**Adding a three-star venue takes one row and nothing else.** Write `4` in the `m` slot of a
`const D` row and the pin (three stars, wider disc), popup badge, list group, per-row stars, the
slogan's star count and the `3 STARS` filter chip all appear. That chip is hidden while no row
carries `m = 4`, so the tier stays invisible until it is real.

Tier labels are translated in `GRP`; list column headers in `COL`. Badge icons come from
`assets/michelin-star.webp`, `michelin-star-white.png`, `michelin-guide-white.png`, `michelin-bib.png`.

**Tier descriptors sit one rung below Michelin's own mapping, deliberately.** `GRPD` (next to
`GRP`) gives each group heading a line under its name — Michelin's wording for each distinction.
Our tiers do not line up with Michelin's: there is no Bib Gourmand in `const D`, and `m = 1`
means "listed in the Guide". So the owner chose (2026-08-19) to shift the scale down a rung —
the Bib line "Good quality, good value cooking" lands on **MICHELIN GUIDE**, and the Selected
Restaurants line "Good cooking" lands on **ALL RESTAURANTS**, which is not a Michelin tier at
all. It reads as one descending scale, which is the intent. **Do not "correct" these back to
Michelin's own tier mapping.**

The ALL RESTAURANTS heading renders without a badge row at all — `gHasBadge` (`ti !== 4`) drops
it, so the heading starts at its name rather than leaving an empty icon line.

**Map markers** are built by `pinIcon(tier)` — a white body (disc + tail) with a red disc inset,
following the Michelin Guide map. The disc takes the brand red `#C0012B` (see **Accent colour**
below). Glyphs keep one size across tiers, so more stars means a wider disc (1 star 36px,
2 stars 48px, 3 stars 64px); the fork & knife is an inline path, not the stroke icon used elsewhere.
Markers are grouped by `markerGroup()`, rebuilt from scratch on every `refreshMarkers` — reusing one
cluster group across filter changes made markercluster throw mid-loop and silently drop most pins.
For the same reason `removeOutsideVisibleBounds` is **off**: 78 markers never needed culling, and the
culling path computes bounds that are not ready during a re-render. Do not re-enable it.

`zoomToBoundsOnClick` is off so the `clusterclick` handler can spiderfy when every kitchen in a
cluster shares one coordinate — zooming can never separate those. Every other cluster is handed
straight back to markercluster's own `zoomToBounds`. Do not replace that with a hand-rolled
`setView`: a cluster here can span Europe to Australia, and the centre of such bounds is open sea,
so the click appears to jump somewhere random. `zoomToBounds` centres on the cluster instead and
steps the zoom only as far as it takes to break it apart. There is deliberately **no
`disableClusteringAtZoom`**: it used to stop at 12, exactly the zoom where Seoul's kitchens pile onto
each other. The trade is that a list click zooms to ~17 to isolate its pin from the cluster.

### Accent colour — two reds, on purpose

The accent is Michelin red. It is written as **two** values and they are not interchangeable:

| | Where | Contrast on `#131110` |
|---|---|---|
| `#C0012B` | Filled areas that carry white on top: solid buttons, `::selection`, map pin discs | — |
| `#FE2A59` | Everything read *against* the dark page: text, borders, small graphics, focus ring | 5.10:1 |

Same hue (347°); `#FE2A59` is only lighter. `#C0012B` is a light-background colour — on white it is
6.4:1, but on this page it drops to **2.94:1**, under the 4.5:1 floor, and most accent text here is
10–11px mono. So never paint text `#C0012B`, and never put dark text on a `#C0012B` fill: those
fills all carry `color:#ffffff` (6.4:1). Translucent accents use `rgba(254,42,89,α)`.

### Editing copy / translations
Every text string exists once per language inside `T` (and `DT`). To change wording, edit the matching
key in **each** language object. Keys must stay identical across all five languages —
they currently are (274 in `T`, 20 in `DT`, all five languages aligned, no untranslated leftovers).
Every one of the 294 merged keys is referenced by the template or logic; there are no unused keys.

Do **not** translate: model codes (`LGA_900_S`…), dimensions, weights, phone numbers, email.
Some values are legitimately identical to English (`SHOWROOM` in ES; `CONTACT`, `SITE`, `MESSAGE *`,
`DIMENSIONS` in FR) — that is correct, not a missing translation.

### Removed keys — do not re-add

On 2026-08-06, `ms2024` (the 2024 About-timeline milestone, × 5 languages) was removed
together with its template row on the owner's request — do not restore the 2024 row.
(`photoSoon` was added the same day, so `T` held at 264 keys then; later work has taken it to 274.)

On 2026-07-27, **52 unused keys (× 5 languages = 260 lines)** were deleted after verifying that
nothing in the template or logic referenced them:

- **`T`** (5): `famAsado`, `famOvens`, `pIntro`, `lgaIntro`, `ovenIntro`
- **`DT`** (47): all `jc*`, `jSec*`, `jCta*` and the `y6*` / `y8*` **body-copy** keys, plus
  `dSeeOnMap`, `dWellDraw` — superseded by the `dj*` / `dy*` keys in `T`.
  `DT` kept its 20 live keys (`dCrumb*`, `dTechSheet`, `dMadeToOrder`, `dLetsDraw`, `dViewY8`,
  `dCompactSee`, `dAllKitchensMap`, `jEyebrow/jSub/jIntro`, `y6Eyebrow/y6Sub/y6Intro/y6Cta*`,
  `y8Eyebrow/y8Intro/y8Cta*`).

Note `y6*` / `y8*` were **partially** removed — the eyebrow/sub/intro/CTA keys are live. Never
delete by prefix; check the actual reference first.

**Ovens are not a product family on this site.** There is no oven card; ovens are folded into the
`fSmokers` label ("SMOKERS & OVENS"). `famOvens` / `ovenIntro` are leftovers — do not restore an
oven family card, and note `assets/photos/b-p5.webp` (the oven shot) is intentionally unused.

The product-family strip has **6 cards**: robata `b-p2`, gear `b-p1g`, chain `b-p1`,
indoor `b-p4`, smokers `b-p3`, accessories `b-p6` — each appearing **twice** (products page +
home range strip), so edits must be made in both places.

---

## Photos — IMPORTANT

Real photos live in **`assets/photos/`** (121 files) and videos in **`assets/video/`**
(`reel-1.mp4` … `reel-11.mp4`).

There are **67 `image-slot` slots**: **35 are filled** (they carry a `src=`) and
**32 are still empty drop-zone placeholders** rendered by `image-slot.js` as labelled grey boxes.
Every empty slot is on a product-detail page — the home, products, about and contact pages are
fully illustrated.

A filled slot looks like this:

```html
<x-import component-from-global-scope="image-slot" from="./image-slot.js" id="b-hero"
          src="assets/photos/b-hero.webp" shape="rect" fit="cover" hint-size="100%,100%"></x-import>
```

### To add / replace a photo
1. Drop the image file into `assets/photos/` (webp or jpg; keep files small).
2. Find the slot by its `id` and **add a `src="assets/photos/YOUR-FILE.webp"` attribute** to the
   existing `<x-import>` tag — that is how all 35 filled slots are done. (Replacing the tag with a
   plain `<img style="width:100%;height:100%;object-fit:cover;display:block">` also works.)
3. To swap an existing photo, replace the file in `assets/photos/` (same name) or edit the `src`.
4. For dimension drawings use `fit="contain"` rather than `cover`.

### Empty slots still needing photos (32)
- **J900 detail** (8): `j900-build1`, `j900-build2`, `j900-q1`, `j900-q2`, `j900-dim-size`,
  `j900-exploded`, `j900-cross`, `j900-video`
- **LGY_610 detail** (13): `lgy-hero`, `lgy-d1`, `lgy-d2`, `lgy-d3`, `lgy610-smoke`, `lgy610-q1`,
  `lgy610-q2`, `lgy610-dim-size`, `lgy610-dim-height`, `lgy610-exploded`, `lgy610-cross`,
  `lgy610-video`, `lgy610-chef`
- **LGY_840 detail** (11): `lgy840-d2`, `lgy840-d3`, `lgy840-smoke`, `lgy840-q1`, `lgy840-q2`,
  `lgy840-dim-size`, `lgy840-dim-height`, `lgy840-exploded`, `lgy840-cross`, `lgy840-video`,
  `lgy840-chef`

`image-slot.js` is only needed while empty placeholders remain. Once every slot has a real image,
it and the `<x-import … image-slot …>` wrappers can be dropped.

Unused asset files (kept intentionally): `assets/photos/b-p5.webp` (oven — no oven card) and
`assets/michelin-face.png`.

`assets/lamsturn-ci.svg` is **no longer unused** — the dark-on-light CI variant rides the white
showroom pin (`pinIcon`, the `tier === -1` branch, index.html ~1672). Everywhere else on the dark
page still uses `-white`.

---

## Rules
- **Inline styles only.** No CSS files, no class-based styling, no build tooling.
- **Never edit `support.js`.**
- Keep the `T`/`DT` language keys in sync across `EN/ES/ZH/FR/JA` — add a key to all five or none.
- The template can't run JS expressions — compute in `renderVals()` and expose by name.
- Mobile is tested down to **390px**; check that width after any layout change.
- Family-strip and product-card edits appear twice (products page + home range strip).

## SEO

`index.html` is a single-page app, so crawlers only ever see whatever static HTML sits at a
URL. `scripts/build-static-pages.mjs` produces that HTML at release time: it copies the
staged `index.html` to **3 product routes** (`/products/<slug>/`, from the catalog's
`detail` entries) and **5 section routes** (`/products/ /about/ /restaurants/ /compare/
/contact/`, from the `sections` table in the script), swaps title/description/canonical/og
per page, adds Product + BreadcrumbList JSON-LD to product pages, and regenerates
`sitemap.xml` (9 URLs, `lastmod` = build date; override with `--date=YYYY-MM-DD`).
**`sitemap.xml` is generated — do not hand-edit it.** Organization + WebSite JSON-LD is
static in the `index.html` head, so it rides along on every page.

Adding an indexable route means four places: `sections` in the script, plus `urlForPage`,
`pageFromUrl` and `seoForPage` in `index.html`. Miss `pageFromUrl` and the generated page
silently renders Home; miss the script and the URL 404s. `deploy.yml` asserts all eight
generated pages and the sitemap exist, so a regression fails the release.

**Origin — read this before touching anything SEO.** Every canonical / og:url / sitemap entry
uses `https://lamsturn.com` and is marked `SEO_ORIGIN`. That origin is **no longer an empty
placeholder**: as of 2026-08-18 `lamsturn.com` is live and 301s to `www.lamsturn.com`, which
serves the brand's **Korean Imweb shop** — a different site carrying the same product line-up.
And `lamsturn.co.kr`, the address the Deploy section below still names for the Korean site,
**no longer resolves at all** (NXDOMAIN); the Korean site moved onto `lamsturn.com`.

So this site currently declares someone else's page as its canonical, while `robots.txt` says
`Allow: /` and every page carries `index,follow` — the workers.dev URL **is** crawlable. The
older claim that it was "deliberately not indexable under the workers.dev URL" was never true;
do not repeat it.

**Owner decision, 2026-08-18: workers.dev stays the canonical origin for now.** Swapping
`SEO_ORIGIN` to `https://fire.kimin-271.workers.dev` across `index.html`,
`scripts/build-static-pages.mjs` and `robots.txt` is agreed but **not done yet** — it is in
Open items. Google Search Console registration waits for whichever origin turns out final.

Image `alt`: `<image-slot>` takes an `alt` attribute (added to the component's
`observedAttributes`). Product cards get `Lamsturn <code> — <badge>` from `altFor()` in
`renderVals()`; the six family tiles are intentionally left with empty alt because they sit
inside links that already carry a visible text label.

## Deploy
Static, no build step. `index.html` is the entry point.

**Target: the Cloudflare Worker `fire`** (Workers Static Assets), live at
<https://fire.kimin-271.workers.dev/>. It is a *Worker*, not a Pages project — `wrangler deploy`,
never `wrangler pages deploy`. Config is in `wrangler.toml` (`[assets] directory = "./_site"`).

> **Do not deploy this site to the Pages project `lamsturn-website`.** It belongs to the Korean
> site, not to this one, and deploying here would overwrite it. (Its old address
> `lamsturn.co.kr` stopped resolving by 2026-08-18 and the Korean site now runs on Imweb at
> `lamsturn.com` — but the Pages project is still not ours to overwrite.)

Releases are deliberate — `.github/workflows/deploy.yml` runs **only** on manual dispatch from the
Actions tab or on a `v*` tag push, so ordinary commits to `main` never reach production:

```bash
git tag v1.0 && git push origin v1.0     # or click "Run workflow" on the Actions tab
```

The workflow stages the site into `_site/` (excluding `.git`, `.github`, `wrangler.toml`,
`CLAUDE.md`, `README.md` and the dotfiles), then refuses to upload if `index.html` or `support.js`
is missing, if a file exceeds 25 MiB, or if any asset referenced by `index.html` is absent —
including a case-only mismatch, which passes on Windows/macOS but 404s on Cloudflare.

Requires repository secrets `CLOUDFLARE_API_TOKEN` (permission `Workers Scripts:Edit`, single
account, **expires 2027-08-01**) and `CLOUDFLARE_ACCOUNT_ID`.

## Open items
- **32 empty photo slots on the three detail pages** (list above) — the biggest remaining gap.
- **Inquiry form is already wired — do not "add a backend".** `submit()` POSTs to
  `https://lamsturn-inquiry-collector.kimin-271.workers.dev/inquiries` behind Cloudflare
  Turnstile (sitekey `0x4AAAAAAEAkTMbGgp3JtTQi`), and sends the multi-model inquiry list the
  product cards accumulate in `localStorage` under `lamsturn-inq`. Reachability verified
  2026-08-18 (CORS preflight → 204). What remains open is **email delivery** of what the
  collector stores.
- **Broken link:** the J900 detail page "TECH SHEET (PDF)" button (line ~744) points to
  `uploads/26_LGA_J900_T_technical%20sheet%20share.pdf`, but there is no `uploads/` folder in the
  bundle. Re-confirmed 404 in production on 2026-08-18. Either add the folder + PDF or remove
  the button.
- **`SEO_ORIGIN` swap to the workers.dev origin** — agreed 2026-08-18, not started. Three files:
  `index.html`, `scripts/build-static-pages.mjs`, `robots.txt` (see the Origin note in SEO).
- **Four product cards have no hover (second) photo**: `LGA_W1600_T`, `LOW_800_S`,
  `LOW_1100_S`, `LSO_1400_PA` — each has `<code>.webp` but no `<code>_2.webp`.
- **`style-hover` does nothing — 63 dead attributes.** No code reads it: `support.js` does not
  contain the string "hover" at all, and no rule in the `<style>` block matches the attribute.
  The only real hover rules are `a:hover{color:#FE2A59}` and two map-pin scales, and any element
  carrying an inline `color` (most of them) outranks that `a:hover` anyway. So the site has
  almost no hover feedback, and 15 of those dead attributes still hold the pre-2026-08-14 orange
  `#f06a2c`. Deferred by the owner on 2026-08-19 for a separate pass. Two things follow: do not
  add more `style-hover` attributes expecting them to work, and reviving them means real CSS in
  the `<style>` block with `!important`, as the filter chips now do via `[data-kchip]`.
- Optional: PDF catalog download.
- About timeline years were estimates — confirm with the brand. The timeline now reads
  2012 / 2016 / 2020 / 2026; the 2024 row was removed on 2026-08-06 (see Removed keys).
- **Three-star venues are not in `const D` yet.** `michelinBlurb` says "Michelin three-star and
  two-star kitchens" while the data tops out at two stars (`m = 3`). This is deliberate — the
  three-star kitchens are to be added to the dataset shortly. **Do not "correct" the copy**; add
  the venues instead, as `m = 4` rows. The whole `m = 4` tier is already built (see the tier table
  above), so no code change is needed.
