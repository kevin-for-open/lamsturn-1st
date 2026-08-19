// Local photo-drop tool. NOT part of the site.
//
//   node scripts/photo-tool.mjs      then open http://localhost:8130
//
// Drop a photo on a slot: it is resized to 1200px, encoded as WebP, written to
// assets/photos/<slot-id>.webp, and the matching <x-import> in index.html gains a src=.
// The result is an ordinary filled slot, identical to the 35 already in the page — no
// sidecar, no runtime dependency, nothing to undo before shipping.
//
// It lives in scripts/ on purpose: the deploy workflow already excludes that directory,
// so none of this can reach production. The + / − controls exist only here.
//
// The encode happens in the BROWSER (canvas -> toBlob('image/webp')). That keeps this file
// dependency-free, which matters because the project has no node_modules and no build step.
// 1200px / q0.85 matches the widest detail photo already in assets/photos.

import { createServer } from 'node:http';
import { readFile, writeFile, unlink, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const INDEX = path.join(ROOT, 'index.html');
const PHOTOS = path.join(ROOT, 'assets', 'photos');
const PORT = 8130;

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4', '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8',
  '.ico': 'image/x-icon'
};

// ── index.html helpers ───────────────────────────────────────────────────────
// Every write goes through here so the file's CRLF endings survive untouched.
async function readIndex() {
  const raw = await readFile(INDEX, 'utf8');
  return { crlf: raw.includes('\r\n'), text: raw.replace(/\r\n/g, '\n') };
}
async function writeIndex(text, crlf) {
  await writeFile(INDEX, crlf ? text.replace(/\n/g, '\r\n') : text, 'utf8');
}

const TAG_RE = /<x-import[^>]*component-from-global-scope="image-slot"[^>]*>/g;
const TAG_ONE = /<x-import[^>]*component-from-global-scope="image-slot"[^>]*>/;

function slotsFrom(text) {
  const lines = text.split('\n');
  const out = [];
  for (const m of text.matchAll(TAG_RE)) {
    const tag = m[0];
    const id = (tag.match(/\bid="([^"]+)"/) || [])[1];
    if (!id) continue;
    // Six slots live inside <sc-for> loops with an interpolated id ({{ reel.id }}, {{ m.c }});
    // their src comes from the catalog JSON, so there is no literal tag to edit. Skip them.
    // Only the id matters here — plenty of editable slots carry a {{ }} in placeholder or alt.
    if (id.includes('{{')) continue;
    const line = lines.find((l) => l.includes('id="' + id + '"') && TAG_ONE.test(l)) || '';
    out.push({
      id,
      src: (tag.match(/\bsrc="([^"]+)"/) || [])[1] || null,
      caption: captionOf(lines, line),
      fit: fitOf(tag),
      pad: padOf(line),
      hasBox: /aspect-ratio:/.test(line),
      fitBox: /data-fitbox/.test(line)
    });
  }
  return out;
}

const fitOf = (tag) => (tag.match(/fit="([^"]+)"/) || [])[1] || '';

function tagFor(text, id) {
  for (const m of text.matchAll(TAG_RE)) if (m[0].includes('id="' + id + '"')) return m[0];
  return null;
}

// j900-q2 -> j900-q3 ; j900-cross -> j900-cross2 ; never collides with an existing id
function nextId(text, id) {
  const taken = new Set(slotsFrom(text).map((s) => s.id));
  const m = id.match(/^(.*?)(\d+)$/);
  const base = m ? m[1] : id;
  let n = m ? Number(m[2]) + 1 : 2;
  let candidate = base + n;
  while (taken.has(candidate)) candidate = base + ++n;
  return candidate;
}

// ── actions ──────────────────────────────────────────────────────────────────
async function savePhoto(id, base64, w, h) {
  const bytes = Buffer.from(base64, 'base64');
  if (!bytes.length) throw new Error('empty image');

  const { text, crlf } = await readIndex();
  const lines = text.split('\n');
  const i = lines.findIndex((l) => l.includes('id="' + id + '"') && TAG_ONE.test(l));
  if (i < 0) throw new Error('no slot with id ' + id);

  const rel = 'assets/photos/' + id + '.webp';
  await writeFile(path.join(PHOTOS, id + '.webp'), bytes);

  const tag = lines[i].match(TAG_ONE)[0];
  // idempotent: replace an existing src, otherwise insert one right after the id
  const newTag = /\bsrc="/.test(tag)
    ? tag.replace(/\bsrc="[^"]*"/, 'src="' + rel + '"')
    : tag.replace('id="' + id + '"', 'id="' + id + '" src="' + rel + '"');
  let line = lines[i].replace(tag, newTag);

  // A contain slot letterboxes: its wrapper is a fixed aspect-ratio box with a white
  // backdrop, so a photo of any other shape shows white bands down the sides or top.
  // Retune the box to the photo instead of cropping the photo to the box — these are
  // dimension drawings and cross-sections, where a crop would cut off the subject.
  // Any white frame already on the slot is preserved: re-dropping a photo should not
  // silently reset it, and the ratio has to account for that padding either way.
  //
  // Contain slots always retune. Cover slots only when they carry data-fitbox — the rest crop
  // to a designed shape on purpose, and reshaping them to each new photo would undo the layout.
  const wantsBox = fitOf(tag) === 'contain' || /data-fitbox/.test(line);
  const ratioed = wantsBox && w && h && /aspect-ratio:/.test(line);
  if (ratioed) line = applyBox(line, w, h, padOf(line));

  lines[i] = line;
  await writeIndex(lines.join('\n'), crlf);
  return { id, src: rel, kb: Math.round(bytes.length / 1024), ratio: ratioed ? w + '/' + h : null };
}

// ── white frame around a contain photo ───────────────────────────────────────
// Some drawings are cropped tight and need air inside the white panel. The frame is a
// PERCENTAGE, not px: the box is fluid (~378px on desktop, ~335px at 375px wide), so a fixed
// px frame would read differently per screen — and CSS resolves vertical padding against the
// WIDTH too, which is exactly what makes 8% give an even frame on all four sides.
//
// Padding eats into the box, so the aspect-ratio has to grow to keep the picture's own
// proportions. With border-box: content = W(1-2p) wide, and to stay undistorted it must be
// W(1-2p)·h/w tall, so the outer box is W[(1-2p)·h/w + 2p] tall. Skip this and `contain`
// quietly letterboxes again, putting back the white bands the ratio fix just removed.
function boxRatio(w, h, pct) {
  const p = (Number(pct) || 0) / 100;
  const outerH = (1 - 2 * p) * (h / w) + 2 * p;
  return '1000/' + Math.round(1000 * outerH);
}

function webpSize(buf) {
  if (buf.slice(0, 4).toString('ascii') !== 'RIFF') return null;
  const f = buf.slice(12, 16).toString('ascii');
  if (f === 'VP8X') return { w: (buf.readUIntLE(24, 3) & 0xffffff) + 1, h: (buf.readUIntLE(27, 3) & 0xffffff) + 1 };
  if (f === 'VP8 ') return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
  if (f === 'VP8L') { const b = buf.readUInt32LE(21); return { w: (b & 0x3fff) + 1, h: ((b >> 14) & 0x3fff) + 1 }; }
  return null;
}

const padOf = (line) => Number((line.match(/padding:\s*([\d.]+)%/) || [])[1] || 0);

// write padding + the matching aspect-ratio onto a contain slot's wrapper
function applyBox(line, w, h, pct) {
  let out = line;
  const ratio = boxRatio(w, h, pct);
  out = /aspect-ratio:/.test(out)
    ? out.replace(/aspect-ratio:\s*[0-9./ ]+/, 'aspect-ratio:' + ratio)
    : out;
  if (pct > 0) {
    out = /padding:\s*[\d.]+%/.test(out)
      ? out.replace(/padding:\s*[\d.]+%/, 'padding:' + pct + '%')
      : out.replace(/(aspect-ratio:[0-9./ ]+)/, '$1;padding:' + pct + '%;box-sizing:border-box');
  } else {
    out = out.replace(/;?padding:\s*[\d.]+%/, '').replace(/;?box-sizing:border-box/, '');
  }
  return out;
}

// "no crop": pin the wrapper's aspect-ratio to the photo's own, so cover has nothing to trim.
// Marked with data-fitbox so a later drop keeps the promise instead of silently cropping again.
//
// Deliberately opt-in per slot rather than automatic for every cover slot: most of them crop on
// purpose — the build photos are a 4/5 column, the wide shot is 21/9 — and reshaping those to
// whatever a photo happens to measure would dismantle the page's composition.
async function setFitBox(id, on) {
  const { text, crlf } = await readIndex();
  const lines = text.split('\n');
  const i = lines.findIndex((l) => l.includes('id="' + id + '"') && TAG_ONE.test(l));
  if (i < 0) throw new Error('no slot with id ' + id);
  if (!/aspect-ratio:/.test(lines[i])) throw new Error('this slot has no fixed box to reshape');

  const tag = lines[i].match(TAG_ONE)[0];
  const src = (tag.match(/\bsrc="([^"]+)"/) || [])[1];
  if (on && !src) throw new Error('drop a photo first — the box is sized from it');

  if (!on) {
    lines[i] = lines[i].replace(/\s*data-fitbox/, '');
  } else {
    const dim = webpSize(await readFile(path.join(ROOT, src)));
    if (!dim) throw new Error('could not read the image size');
    lines[i] = applyBox(lines[i], dim.w, dim.h, padOf(lines[i]));
    if (!/data-fitbox/.test(lines[i]))
      lines[i] = lines[i].replace(/(<div\b)/, '$1 data-fitbox');
  }
  await writeIndex(lines.join('\n'), crlf);
  return { id, fitBox: !!on };
}

async function setPad(id, pct) {
  const { text, crlf } = await readIndex();
  const lines = text.split('\n');
  const i = lines.findIndex((l) => l.includes('id="' + id + '"') && TAG_ONE.test(l));
  if (i < 0) throw new Error('no slot with id ' + id);
  const tag = lines[i].match(TAG_ONE)[0];
  if (fitOf(tag) !== 'contain') throw new Error('a white frame only applies to a contain slot');
  const src = (tag.match(/\bsrc="([^"]+)"/) || [])[1];
  if (!src) throw new Error('drop a photo first — the frame is sized from it');
  const dim = webpSize(await readFile(path.join(ROOT, src)));
  if (!dim) throw new Error('could not read the image size');
  lines[i] = applyBox(lines[i], dim.w, dim.h, Number(pct) || 0);
  await writeIndex(lines.join('\n'), crlf);
  return { id, pad: Number(pct) || 0, ratio: boxRatio(dim.w, dim.h, pct) };
}

// ── captions ─────────────────────────────────────────────────────────────────
// A caption is a translation key, not a literal: T holds every string five times and the
// keys must stay in sync, so a bare English figcaption would show English to every visitor.
// The tool therefore owns a cap* key per slot and seeds the same text into all five
// languages. That leaves the structure correct even if it ships before anyone translates —
// an untranslated string is a copy problem; a missing key is a rendering bug.
const capKey = (id) => 'cap' + id.split(/[-_]/).map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join('');
const LANGS = ['EN', 'ES', 'ZH', 'FR', 'JA'];

// dark page vs the white diagram panels — a caption has to be legible on whichever it sits on
const CAP_DARK = "font:400 10.5px 'IBM Plex Mono',monospace;color:rgba(235,230,221,.55);margin-top:10px;letter-spacing:.06em";
const CAP_LIGHT = "font:400 10.5px 'IBM Plex Mono',monospace;color:rgba(19,17,16,.55);margin-top:10px;letter-spacing:.06em";

function langBlocks(lines) {
  const tStart = lines.findIndex((l) => l.includes('const T = {'));
  const dStart = lines.findIndex((l) => l.includes('const DT = {'));
  const out = {};
  for (let i = tStart; i < dStart; i++) {
    const m = lines[i].trimStart().match(/^"(EN|ES|ZH|FR|JA)": \{/);
    if (m) out[m[1]] = i;
  }
  return out;
}

function setKey(lines, key, value) {
  const at = langBlocks(lines);
  // walk the languages bottom-up so earlier insertions do not shift later indices
  for (const lang of LANGS.slice().sort((a, b) => at[b] - at[a])) {
    const start = at[lang];
    if (start === undefined) throw new Error('language block ' + lang + ' not found');
    let end = start + 1;
    while (end < lines.length && !/^\s*\},?\s*$/.test(lines[end])) end++;
    const existing = lines.findIndex((l, i) => i > start && i < end && l.trimStart().startsWith('"' + key + '":'));
    const esc = String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    if (existing > -1) lines[existing] = lines[existing].replace(/:\s*".*"(,?)\s*$/, ': "' + esc + '"$1');
    else lines.splice(start + 1, 0, '            "' + key + '": "' + esc + '",');
  }
}

function dropKey(lines, key) {
  for (let i = lines.length - 1; i >= 0; i--)
    if (lines[i].trimStart().startsWith('"' + key + '":')) lines.splice(i, 1);
}

function captionOf(lines, line) {
  const m = line.match(/<(figcaption|div)[^>]*data-cap[^>]*>(.*?)<\/\1>/) || line.match(/<figcaption[^>]*>(.*?)<\/figcaption>/);
  const inner = m ? m[m.length - 1] : null;
  if (inner == null) return null;
  const key = (inner.match(/\{\{\s*t\.([A-Za-z0-9_]+)\s*\}\}/) || [])[1];
  if (!key) return inner;
  const en = lines.find((l) => l.trimStart().startsWith('"' + key + '":'));
  return en ? (en.match(/:\s*"(.*)"/) || [])[1] : key;
}

async function setCaption(id, textRaw) {
  const text = String(textRaw || '').trim();
  const { text: src, crlf } = await readIndex();
  const lines = src.split('\n');
  const i = lines.findIndex((l) => l.includes('id="' + id + '"') && TAG_ONE.test(l));
  if (i < 0) throw new Error('no slot with id ' + id);
  const key = capKey(id);
  let line = lines[i];
  const existing = line.match(/<figcaption[^>]*>.*?<\/figcaption>/);

  if (!text) {
    if (existing) line = line.replace(existing[0], '');
    // unwrap a <figure> this tool added purely to hold the caption
    line = line.replace(/<figure style="margin:0" data-toolwrap>(.*)<\/figure>/, '$1');
    lines[i] = line;
    dropKey(lines, key);
    await writeIndex(lines.join('\n'), crlf);
    return { id, caption: null };
  }

  const light = /background:#fff/.test(line);
  const cap = '<figcaption style="' + (light ? CAP_LIGHT : CAP_DARK) + '">{{ t.' + key + ' }}</figcaption>';
  if (existing) {
    // keep whatever styling is already there; only swap in this slot's own key, so editing
    // one caption never rewrites a shared label like lblSizeChart on other slots
    line = line.replace(existing[0], existing[0].replace(/>.*?<\/figcaption>/, '>{{ t.' + key + ' }}</figcaption>'));
  } else if (/<figure/.test(line)) {
    line = line.replace(/<\/figure>/, cap + '</figure>');
  } else {
    line = line.replace(/^(\s*)(.*)$/, '$1<figure style="margin:0" data-toolwrap>$2' + cap + '</figure>');
  }
  lines[i] = line;
  setKey(lines, key, text);
  await writeIndex(lines.join('\n'), crlf);
  return { id, caption: text, key };
}

async function clearPhoto(id) {
  const { text, crlf } = await readIndex();
  const tag = tagFor(text, id);
  if (!tag) throw new Error('no slot with id ' + id);
  if (!/\bsrc="/.test(tag)) return { id, src: null };
  await writeIndex(text.replace(tag, tag.replace(/\s*\bsrc="[^"]*"/, '')), crlf);
  return { id, src: null };
}

async function addSlot(afterId) {
  const { text, crlf } = await readIndex();
  const lines = text.split('\n');
  const i = lines.findIndex((l) => l.includes('id="' + afterId + '"') && TAG_ONE.test(l));
  if (i < 0) throw new Error('no slot with id ' + afterId);

  // Clone the whole LINE, not the bare <x-import>. Each slot sits in a self-contained
  // wrapper — <figure><div><x-import></div><figcaption></figcaption></figure>, or a plain
  // <div>, or a <div> carrying a play-button overlay — and that wrapper is what the grid
  // repeats. Cloning only the tag drops the copy INSIDE the original's box, where it never
  // becomes a new cell: it just stacks invisibly behind the first image. All 67 slot lines
  // are balanced and hold exactly one slot, which is what makes the line a safe unit.
  const id = nextId(text, afterId);
  const line = lines[i];
  const tag = line.match(TAG_ONE)[0];
  const newTag = tag.replace('id="' + afterId + '"', 'id="' + id + '"').replace(/\s*\bsrc="[^"]*"/, '');
  lines.splice(i + 1, 0, line.replace(tag, newTag));

  await writeIndex(lines.join('\n'), crlf);
  return { id, clonedFrom: afterId };
}

async function removeSlot(id, alsoFile) {
  const { text, crlf } = await readIndex();
  const lines = text.split('\n');
  const i = lines.findIndex((l) => l.includes('id="' + id + '"') && TAG_ONE.test(l));
  if (i < 0) throw new Error('no slot with id ' + id);

  // Mirror of addSlot: drop the whole wrapper line. Deleting only the <x-import> would leave
  // an empty <figure><div></div><figcaption>…</figcaption></figure> behind — a caption with no
  // picture, plus an orphaned </x-import> close tag.
  if ((lines[i].match(TAG_RE) || []).length !== 1)
    throw new Error('line ' + (i + 1) + ' holds more than one slot — refusing to guess');
  lines.splice(i, 1);

  await writeIndex(lines.join('\n'), crlf);
  if (alsoFile) { try { await unlink(path.join(PHOTOS, id + '.webp')); } catch { /* already gone */ } }
  return { id, removed: true };
}

// ── editor page ──────────────────────────────────────────────────────────────
function EDITOR() {
  return `<!doctype html><meta charset="utf-8"><title>Lamsturn photo drop</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  :root{color-scheme:dark}
  body{margin:0;background:#131110;color:#ebe6dd;font:400 14px/1.5 system-ui,sans-serif}
  header{position:sticky;top:0;z-index:5;background:#131110;border-bottom:1px solid rgba(235,230,221,.2);padding:16px 24px}
  h1{margin:0;font:600 17px system-ui}
  .sub{margin-top:4px;font-size:12.5px;color:rgba(235,230,221,.55)}
  .warn{margin-top:8px;font-size:12.5px;color:#FE2A59}
  main{padding:24px;display:grid;gap:26px}
  section h2{margin:0 0 12px;font:600 12px ui-monospace,monospace;letter-spacing:.14em;color:#FE2A59}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:14px}
  .slot{border:1px solid rgba(235,230,221,.22);border-radius:10px;overflow:hidden;background:#1c1917}
  .drop{aspect-ratio:4/3;display:flex;align-items:center;justify-content:center;position:relative;cursor:pointer;background:#171513}
  .drop img{width:100%;height:100%;object-fit:cover;display:block}
  .drop.over{outline:2px dashed #FE2A59;outline-offset:-6px}
  .empty{font:400 12px ui-monospace,monospace;color:rgba(235,230,221,.4)}
  .cap{display:block;width:100%;box-sizing:border-box;border:0;border-top:1px solid rgba(235,230,221,.14);background:#131110;color:#ebe6dd;font:400 12px ui-monospace,monospace;padding:7px 10px;outline:none}
  .cap:focus{background:#1c1917;box-shadow:inset 0 0 0 1px #FE2A59}
  .cap::placeholder{color:rgba(235,230,221,.3)}
  .pad{display:block;width:100%;box-sizing:border-box;border:0;border-top:1px solid rgba(235,230,221,.14);background:#131110;color:#ebe6dd;font:400 12px ui-monospace,monospace;padding:6px 10px;outline:none;cursor:pointer}
  .pad:disabled{color:rgba(235,230,221,.3);cursor:default}
  .bar{display:flex;align-items:center;gap:6px;padding:8px 10px;border-top:1px solid rgba(235,230,221,.14)}
  .id{flex:1;min-width:0;font:500 11.5px ui-monospace,monospace;color:rgba(235,230,221,.8);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  button{font:500 12px ui-monospace,monospace;background:transparent;color:#ebe6dd;border:1px solid rgba(235,230,221,.3);border-radius:6px;padding:3px 8px;cursor:pointer}
  button:hover{background:#C0012B;border-color:#C0012B;color:#fff}
  button.on{background:#C0012B;border-color:#C0012B;color:#fff}
  .kb{font:400 11px ui-monospace,monospace;color:rgba(235,230,221,.45)}
  #log{position:fixed;right:16px;bottom:16px;max-width:380px;font:400 12px ui-monospace,monospace}
  #log div{background:#1c1917;border:1px solid rgba(235,230,221,.25);border-left:3px solid #FE2A59;border-radius:6px;padding:8px 10px;margin-top:6px}
</style>
<header>
  <h1>Lamsturn photo drop</h1>
  <div class="sub">Drop an image on a box: resized to 1200px, saved as WebP into assets/photos/, and wired into index.html.</div>
  <div class="warn">Local tool only — scripts/ is excluded from the deploy, so none of this reaches the live site.</div>
</header>
<main id="main"></main>
<div id="log"></div>
<script>
const MAX_DIM = 1200, QUALITY = 0.85;
const say = (m) => { const d = document.createElement('div'); d.textContent = m; log.appendChild(d); setTimeout(() => d.remove(), 5000); };
const api = (p, b) => fetch(p, { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(b) })
  .then(r => r.json()).then(j => { if (j.error) throw new Error(j.error); return j; });

async function encode(file) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, MAX_DIM / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  const blob = await new Promise(r => c.toBlob(r, 'image/webp', QUALITY));
  const buf = await blob.arrayBuffer();
  let s = ''; const u = new Uint8Array(buf);
  for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
  return { b64: btoa(s), w: c.width, h: c.height, kb: Math.round(blob.size / 1024) };
}

async function drop(id, file) {
  if (!/^image\\//.test(file.type)) return say('not an image: ' + file.name);
  const { b64, w, h, kb } = await encode(file);
  const r = await api('/api/save', { id, b64, w, h });
  say(id + '  ' + w + 'x' + h + '  ' + kb + 'KB  saved' + (r.ratio ? '  box -> ' + r.ratio : ''));
  render();
}

function card(s) {
  const el = document.createElement('div'); el.className = 'slot';
  const box = document.createElement('div'); box.className = 'drop';
  if (s.src) { const i = new Image(); i.src = '/' + s.src + '?t=' + Date.now(); box.appendChild(i); }
  else { const e = document.createElement('span'); e.className = 'empty'; e.textContent = 'drop an image'; box.appendChild(e); }
  box.ondragover = (e) => { e.preventDefault(); box.classList.add('over'); };
  box.ondragleave = () => box.classList.remove('over');
  box.ondrop = (e) => { e.preventDefault(); box.classList.remove('over'); if (e.dataTransfer.files[0]) drop(s.id, e.dataTransfer.files[0]); };
  box.onclick = () => { const f = document.createElement('input'); f.type = 'file'; f.accept = 'image/*';
    f.onchange = () => f.files[0] && drop(s.id, f.files[0]); f.click(); };

  const cap = document.createElement('input'); cap.className = 'cap'; cap.placeholder = 'caption (blank = none)';
  cap.value = s.caption || '';
  const commit = () => { const v = cap.value.trim(); if (v === (s.caption || '')) return;
    api('/api/caption', { id: s.id, text: v }).then(r => { say(s.id + (r.caption ? '  caption: ' + r.caption : '  caption removed')); render(); }).catch(e => say(e.message)); };
  cap.onblur = commit;
  cap.onkeydown = (e) => { if (e.key === 'Enter') cap.blur(); };

  let padSel = null;
  if (s.fit === 'contain') {
    padSel = document.createElement('select'); padSel.className = 'pad'; padSel.title = 'white frame around the photo';
    for (const v of [0, 4, 8, 12, 16]) { const o = document.createElement('option'); o.value = v;
      o.textContent = v ? 'frame ' + v + '%' : 'no frame'; if (v === (s.pad || 0)) o.selected = true; padSel.appendChild(o); }
    padSel.disabled = !s.src;
    padSel.onchange = () => api('/api/pad', { id: s.id, pct: padSel.value })
      .then(r => { say(s.id + '  frame ' + r.pad + '%'); render(); }).catch(e => say(e.message));
  }

  const bar = document.createElement('div'); bar.className = 'bar';
  const id = document.createElement('span'); id.className = 'id'; id.textContent = s.id;
  bar.appendChild(id);
  const add = document.createElement('button'); add.textContent = '+'; add.title = 'add a slot after this one';
  add.onclick = () => api('/api/add', { afterId: s.id }).then(r => { say('added ' + r.id); render(); }).catch(e => say(e.message));
  const del = document.createElement('button'); del.textContent = '−'; del.title = 'remove this slot from the page';
  del.onclick = () => { if (confirm('Remove slot ' + s.id + ' from index.html?'))
    api('/api/remove', { id: s.id, alsoFile: false }).then(() => { say('removed ' + s.id); render(); }).catch(e => say(e.message)); };
  bar.appendChild(add); bar.appendChild(del);
  if (s.src) { const c = document.createElement('button'); c.textContent = 'clear'; c.title = 'unset src, keep the slot';
    c.onclick = () => api('/api/clear', { id: s.id }).then(() => { say('cleared ' + s.id); render(); }).catch(e => say(e.message));
    bar.appendChild(c); }

  el.appendChild(box); el.appendChild(cap); if (padSel) el.appendChild(padSel); el.appendChild(bar);
  return el;
}

async function render() {
  const slots = await fetch('/api/slots').then(r => r.json());
  const groups = new Map();
  for (const s of slots) { const g = s.id.split('-')[0] || 'other';
    if (!groups.has(g)) groups.set(g, []); groups.get(g).push(s); }
  main.textContent = '';
  for (const [g, list] of groups) {
    const sec = document.createElement('section');
    const h = document.createElement('h2');
    const filled = list.filter(s => s.src).length;
    h.textContent = g + '  —  ' + filled + ' / ' + list.length + ' filled';
    const grid = document.createElement('div'); grid.className = 'grid';
    for (const s of list) grid.appendChild(card(s));
    sec.appendChild(h); sec.appendChild(grid); main.appendChild(sec);
  }
}
render();
</script>`;
}

// ── server ───────────────────────────────────────────────────────────────────
const body = (req) => new Promise((res, rej) => {
  let d = ''; req.on('data', (c) => (d += c)); req.on('end', () => res(d)); req.on('error', rej);
});
const json = (res, code, obj) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname === '/') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      return res.end(EDITOR());
    }
    if (url.pathname === '/api/slots') {
      const { text } = await readIndex();
      return json(res, 200, slotsFrom(text));
    }
    if (req.method === 'POST') {
      const p = JSON.parse((await body(req)) || '{}');
      if (url.pathname === '/api/save') return json(res, 200, await savePhoto(p.id, p.b64, p.w, p.h));
      if (url.pathname === '/api/clear') return json(res, 200, await clearPhoto(p.id));
      if (url.pathname === '/api/caption') return json(res, 200, await setCaption(p.id, p.text));
      if (url.pathname === '/api/pad') return json(res, 200, await setPad(p.id, p.pct));
      if (url.pathname === '/api/fitbox') return json(res, 200, await setFitBox(p.id, p.on));
      if (url.pathname === '/api/add') return json(res, 200, await addSlot(p.afterId));
      if (url.pathname === '/api/remove') return json(res, 200, await removeSlot(p.id, !!p.alsoFile));
    }
    // everything else: serve the repo, so photo previews resolve
    const file = path.join(ROOT, decodeURIComponent(url.pathname));
    if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end('forbidden'); }
    const s = await stat(file).catch(() => null);
    if (!s || !s.isFile()) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, {
      'content-type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'cache-control': 'no-store'
    });
    res.end(await readFile(file));
  } catch (e) {
    json(res, 500, { error: String((e && e.message) || e) });
  }
}).listen(PORT, () => {
  console.log('photo tool  ->  http://localhost:' + PORT);
  console.log('writes assets/photos/<id>.webp and patches index.html directly');
  console.log('scripts/ is excluded from the deploy, so nothing here ships');
});
