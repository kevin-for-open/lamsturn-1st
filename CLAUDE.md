# Lamsturn — Marketing Website

Single-page, multi-language marketing site for **Lamsturn**, a premium Korean grill & smoker
brand (asado / robata / smokers), targeting international professional-kitchen inquiries.

This file briefs you (Claude Code) on how the project is built so you can make changes safely.

Last verified against the build: **2026-07-27** (0723 final build + dead-key cleanup,
`index.html` ≈ 329 KB).

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

External CDN dependencies (in `<helmet>`): Google Fonts (Archivo, IBM Plex Mono) and
**Leaflet 1.9.4** for the kitchens map.

### Where things live (line numbers are approximate — search by name)

| What | Where |
|---|---|
| Page routing (home / products / about / contact / compare / product-detail) | `state.page`, the `go(p)` method, and `nav*` vals in `renderVals()` |
| Per-page SEO (title/description/canonical/og) | `seoForPage(p)` + `urlForPage(p)` + `pageFromUrl()`. **Every indexable route needs an entry in all three, and a matching row in `sections`/`products` inside `scripts/build-static-pages.mjs`** — the script emits the static HTML that crawlers actually fetch, the logic class keeps the meta in step during SPA navigation. |
| **All UI copy**, 5 languages, **264 keys each** | the **`T`** object, line ~1256 — keys `EN`, `ES`, `ZH`, `FR`, `JA` |
| **Product-detail body copy** | also in **`T`** — the 69 `dj*` (J900) and `dy*` (LGY) keys |
| Detail-page eyebrows / intros / breadcrumbs / CTAs | the **`DT`** object — **20 keys** per language |
| How the template sees copy | `renderVals()` does `const t = Object.assign({}, T[lang], DT[lang])` — so **both** objects are read as `{{ t.someKey }}`; there is no `dt.` namespace in the template |
| Language switcher | two `<select>`s (desktop nav + mobile menu) → `onLang` |
| Product tables (models, dims, weights) | `lga`, `lgy`, `smokers`, `indoor`, `acc` arrays — **not translated** (model codes/specs stay as-is) |
| Product card order | the order entries are written in the catalog JSON **is** the display order — `prep()` does not sort. To reorder cards, move the lines. |
| Grill piece counts (`g`) | a count is written as a **trailing** ` ×N` (`W378×D495 ×2`). `displayDimensions` converts every number to inches EXCEPT one that is preceded by ` ×` and ends the string, so a count anywhere else — or any letters after a number (`2ea`, `SUS304`) — is rendered as a bogus inch value. The card/compare row is labelled `t.lblMainGrill`; resting-grill sizes live on detail pages only. |
| Depth pairs (LGY_610_D300 / _D400 …) | two separate cards sharing one detail page: the **D300** entry carries the full `detail` payload plus `detail.model` (the family code, so the ProductGroup JSON-LD is not named after one card), the **D400** entry carries `detailOf: {slug, page}` — a link-only reference the generator ignores. The detail page's own CTA still opens a depth chooser, built by grouping catalog codes in `renderVals` (`depthReg`). |
| Kitchens map + restaurant list | Leaflet; venue data in `const D` (line ~1127), mapped to `this._inst` at line ~1210 |
| Kitchens tier/column labels per language | `GRP` (line ~3128) and `COL` (line ~3143) |
| Tweakable props (`lang`, `showMichelin`) | `data-props` on the `<script data-dc-script>` tag |

### Kitchens / Michelin data

`const D` is a compact tuple array — `[name, lat, lng, prods, m, place]`. **79 rows**; the one row
with `m === -1` is a showroom and is filtered out of the kitchen count, so the site shows
**78 kitchens**, 17 of them Michelin-rated (`m > 0`).

`m` (tier) mapping, used for the list badge and map popup around line 1233:

| `m` | Meaning | Rows |
|---|---|---|
| `3` | Two Michelin stars | 7 |
| `2` | One Michelin star | 2 |
| `1` | Michelin Guide | 8 |
| `0` | Listed kitchen, no Michelin badge | 61 |
| `-1` | Showroom — excluded from the kitchen count | 1 |

Tier labels are translated in `GRP`; list column headers in `COL`. Badge icons come from
`assets/michelin-star.webp`, `michelin-star-white.png`, `michelin-guide-white.png`, `michelin-bib.png`.

### Editing copy / translations
Every text string exists once per language inside `T` (and `DT`). To change wording, edit the matching
key in **each** language object. Keys must stay identical across all five languages —
they currently are (273 in `T`, 20 in `DT`, all five languages aligned, no untranslated leftovers).
Every one of the 293 merged keys is referenced by the template or logic; there are no unused keys.

Do **not** translate: model codes (`LGA_900_S`…), dimensions, weights, phone numbers, email.
Some values are legitimately identical to English (`SHOWROOM` in ES; `CONTACT`, `SITE`, `MESSAGE *`,
`DIMENSIONS` in FR) — that is correct, not a missing translation.

### Removed keys — do not re-add

On 2026-08-06, `ms2024` (the 2024 About-timeline milestone, × 5 languages) was removed
together with its template row on the owner's request — do not restore the 2024 row.
(`photoSoon` was added the same day, so `T` stays at 264 keys per language.)

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

Real photos live in **`assets/photos/`** (74 files) and videos in **`assets/video/`**
(`reel-1.mp4` … `reel-7.mp4`).

There are **68 `image-slot` slots**: **36 are filled** (they carry a `src=`) and
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
   existing `<x-import>` tag — that is how all 36 filled slots are done. (Replacing the tag with a
   plain `<img style="width:100%;height:100%;object-fit:cover;display:block">` also works.)
3. To swap an existing photo, replace the file in `assets/photos/` (same name) or edit the `src`.
4. For dimension drawings use `fit="contain"` rather than `cover`.

### Empty slots still needing photos (32)
- **J900 detail** (8): `j900-build1`, `j900-build2`, `j900-q1`, `j900-q2`, `j900-dim-size`,
  `j900-exploded`, `j900-cross`, `j900-video`
- **LGY_610 detail** (16): `lgy-hero`, `lgy-d1`, `lgy-d2`, `lgy-d3`, `lgy610-smoke`, `lgy610-q1`,
  `lgy610-q2`, `lgy610-dim-size`, `lgy610-dim-height`, `lgy610-exploded`, `lgy610-cross`,
  `lgy610-video`, `lgy610-chef`
- **LGY_840 detail** (11): `lgy840-d2`, `lgy840-d3`, `lgy840-smoke`, `lgy840-q1`, `lgy840-q2`,
  `lgy840-dim-size`, `lgy840-dim-height`, `lgy840-exploded`, `lgy840-cross`, `lgy840-video`,
  `lgy840-chef`

`image-slot.js` is only needed while empty placeholders remain. Once every slot has a real image,
it and the `<x-import … image-slot …>` wrappers can be dropped.

Unused asset files (kept intentionally): `assets/photos/LGA_D1500_S.webp` (the owner asked on
2026-08-11 for that card to show the "photography in progress" placeholder instead — re-wire
the `img` field when the final photo is decided), `assets/photos/b-p5.webp` (oven — no oven card),
`assets/lamsturn-ci.svg` (dark-background variant; the site is dark so it uses `-white`),
`assets/michelin-face.png`.

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
`detail` entries) and **5 section routes** (`/products/ /about/ /kitchens/ /compare/
/contact/`, from the `sections` table in the script), swaps title/description/canonical/og
per page, adds Product + BreadcrumbList JSON-LD to product pages, and regenerates
`sitemap.xml` (9 URLs, `lastmod` = build date; override with `--date=YYYY-MM-DD`).
**`sitemap.xml` is generated — do not hand-edit it.** Organization + WebSite JSON-LD is
static in the `index.html` head, so it rides along on every page.

Adding an indexable route means four places: `sections` in the script, plus `urlForPage`,
`pageFromUrl` and `seoForPage` in `index.html`. Miss `pageFromUrl` and the generated page
silently renders Home; miss the script and the URL 404s. `deploy.yml` asserts all eight
generated pages and the sitemap exist, so a regression fails the release.

**Origin:** every canonical / og:url / sitemap entry uses `https://lamsturn.com` and is
marked `SEO_ORIGIN`. The domain is not connected yet (2026-08-06) — when it is confirmed,
swap that origin everywhere (`index.html`, `scripts/build-static-pages.mjs`, `robots.txt`),
then register the site in Google Search Console and submit the sitemap. Until then the site
is deliberately not indexable under the workers.dev URL.

Image `alt`: `<image-slot>` takes an `alt` attribute (added to the component's
`observedAttributes`). Product cards get `Lamsturn <code> — <badge>` from `altFor()` in
`renderVals()`; the six family tiles are intentionally left with empty alt because they sit
inside links that already carry a visible text label.

## Deploy
Static, no build step. `index.html` is the entry point.

**Target: the Cloudflare Worker `fire`** (Workers Static Assets), live at
<https://fire.kimin-271.workers.dev/>. It is a *Worker*, not a Pages project — `wrangler deploy`,
never `wrangler pages deploy`. Config is in `wrangler.toml` (`[assets] directory = "./_site"`).

> **Do not deploy this site to the Pages project `lamsturn-website`.** That project serves the
> separate Korean site at `lamsturn.co.kr`; deploying here would overwrite it.

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
- Inquiry form is front-end only — wire it to a backend (Formspree/email) in `submit()`.
- **Broken link:** the J900 detail page "TECH SHEET (PDF)" button (line ~663) points to
  `uploads/26_LGA_J900_T_technical%20sheet%20share.pdf`, but there is no `uploads/` folder in the
  bundle — it 404s in production. Either add the folder + PDF or remove the button.
- Optional: PDF catalog download, OG meta tags.
- About timeline years (2016/2020/2024) were estimates — confirm with the brand.
- **Three-star venues are not in `const D` yet.** `michelinBlurb` says "Michelin three-star and
  two-star kitchens" while the data tops out at two stars (`m = 3`). This is deliberate — the
  three-star kitchens are to be added to the dataset shortly. **Do not "correct" the copy**; add
  the venues instead, with a new tier above `m = 3` and matching `GRP` labels in all five languages.
