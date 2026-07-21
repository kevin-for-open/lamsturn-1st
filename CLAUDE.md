# Lamsturn — Marketing Website

Single-page, multi-language marketing site for **Lamsturn**, a premium Korean grill & smoker
brand (asado / robata / smokers), targeting international professional-kitchen inquiries.

This file briefs you (Claude Code) on how the project is built so you can make changes safely.

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
2. **The template** — everything between `<x-dc>` and `</x-dc>`. Plain HTML with **inline styles
   only** (no CSS classes/stylesheets — keep it that way). Dynamic values are `{{ dotted.paths }}`
   filled from the logic class. Control flow uses `<sc-if>` / `<sc-for>`.
3. **The logic class** — inside `<script type="text/x-dc" data-dc-script>`:
   `class Component extends DCLogic { … }`. `renderVals()` returns every value the template reads.
   This is plain JS (no imports/TypeScript). Put any computed value / handler here and expose it by
   name; the template can only do dotted lookups, never expressions like `{{ a + b }}`.

### Where things live (search inside `index.html`)

| What | Where |
|---|---|
| Page routing (home / products / about / contact / product-detail) | `state.page`, the `go(p)` method, and `nav*` vals in `renderVals()` |
| **All UI copy**, 5 languages | the **`T`** object in `renderVals()` — keys `EN`, `ES`, `ZH`, `FR`, `JA` |
| Product-detail copy, 5 languages | the **`DT`** object (same 5 language keys) |
| Language switcher | two `<select>`s near the top (desktop nav + mobile menu) → `onLang` |
| Product tables (models, dims, weights) | `lga`, `lgy`, `smokers`, `indoor`, `ovens`, `acc` arrays — **not translated** (model codes/specs stay as-is) |
| World map + restaurant list | Leaflet (CDN), `installs` array of pins, kitchens section in `renderVals()` |
| Kitchens tier/column labels per language | `GRP` and `COL` objects |
| Tweakable props (`lang`, `showMichelin`) | `data-props` on the `<script>` tag |

### Editing copy / translations
Every text string exists once per language inside `T` (and `DT` for detail pages). To change wording,
edit the matching key in **each** language object. Keys must stay identical across all five languages.
Do **not** translate: model codes (`LGA_900_S`…), dimensions, weights, phone numbers, email.

---

## Photos — IMPORTANT

Real photos live in **`assets/photos/`** and are referenced as normal `<img>` tags. 12 slots are
already filled. The remaining spots are still **drop-zone placeholders** written as
`<x-import component-from-global-scope="image-slot" … id="…"></x-import>` (rendered by
`image-slot.js`). They show a labelled empty box until you wire a real image.

### To add / replace a photo
1. Drop the image file into `assets/photos/` (webp or jpg; keep files small).
2. Find the placeholder by its `id` and replace the whole `<x-import …></x-import>` element with:
   ```html
   <img src="assets/photos/YOUR-FILE.webp" alt="short description"
        style="width:100%;height:100%;object-fit:cover;display:block">
   ```
   (This matches how the 12 filled slots were done — the parent `<div>` controls the size, the
   image just fills it.)
3. To swap an existing photo, just replace the file in `assets/photos/` (same name) or edit the `src`.

### Empty placeholder ids still needing photos
- **Home hero** (2nd/3rd slides): `b-hero-2`, `b-hero-3`
- **Products page family shots**: `b-p3` (smoker), `b-p4` (indoor smoker), `b-p5` (oven), `b-p6` (accessories) — each appears **twice** (products page + home range strip), so replace both
- **J900 detail**: `j900-d3` (in service), `j900-drawing` (dimension drawing, use `object-fit:contain`)
- **LGY_610 detail**: `lgy-hero`, `lgy-d1`, `lgy-d2`, `lgy-d3`
- **LGY_840 detail**: `lgy840-hero`, `lgy840-d1`, `lgy840-d2`, `lgy840-d3`

`image-slot.js` is only needed while empty placeholders remain. Once every slot is a real `<img>`,
you can delete `image-slot.js` and its `<x-import … image-slot …>` references.

---

## Rules
- **Inline styles only.** No CSS files, no class-based styling, no build tooling.
- **Never edit `support.js`.**
- Keep the `T`/`DT` language keys in sync across `EN/ES/ZH/FR/JA`.
- The template can't run JS expressions — compute in `renderVals()` and expose by name.

## Deploy
Static, root = site root, `index.html` is the entry. No build command.
- **GitHub Pages:** Settings → Pages → Deploy from branch → `main` / root.
- **Cloudflare Pages / Netlify / Vercel:** framework preset = None, build command = *(none)*,
  output/publish directory = `/` (repo root).

## Open items (from the design phase)
- Inquiry form is front-end only — wire it to a backend (Formspree/email) in `submit()`.
- Optional: PDF catalog download, favicon/OG meta tags.
- About timeline years (2016/2020/2024) were estimates — confirm with the brand.
