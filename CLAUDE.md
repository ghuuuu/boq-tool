# CLAUDE.md — Stella Mobili BOQ Tool
## MulyaOne · Internal Tooling

> This file gives you the full context to continue working on the SM BOQ tool.
> Read this before touching any code.

---

## What This Is

A standalone HTML file (~1MB) that serves as the **Bill of Quantities input tool** for Stella Mobili,
one of 7 brands managed by PT. Mitra Usaha Lancar Jaya (trading as **Mulya**).

The PIC (Person In Charge) uses it to:
1. Build a room-by-room BOQ for a client project
2. Select cabinet items by finish and handle style
3. Save progress as a `.smbq` file (versioned JSON)
4. Export to Excel (one sheet per room + summary)
5. Save to PDF (A4, branded)
6. Send the BOQ to Stella Mobili Jakarta for price verification

**Built output:** `StellaMobili_BOM_Tool.html` — a single self-contained HTML file
(~6.4MB, price data + ExcelJS + pdfmake embedded). No server or internet needed at
runtime; opens in any browser by double-click. **It is a BUILD ARTIFACT — do not hand-edit it; edit the template and rebuild.**

---

## File Locations & Build Pipeline

```
StellaMobili_BOM_Tool.html        # BUILD OUTPUT (generated) — never edit directly
src/StellaMobili_BOM_Tool_Ref.html    # TEMPLATE / source of truth — edit THIS (CSS + body + all app JS)
price-data/price_lists/            # Price data, one JSON per section per version:
    kitchen_v26.06.02.json          kitchen_<ver>.json
    wardrobe_v26.06.02.json         wardrobe_<ver>.json
    accessories_v26.06.02.json      accessories_<ver>.json
    index.json                      { latest, versions[] } registry
src/build_tool.py           # Build: inject price_lists + vendored libs + brand assets into the template
src/vendor/exceljs.min.js   # ExcelJS 4.4.0 (inlined into the build; keeps Excel export offline)
src/vendor/pdfmake.min.js + vfs_fonts.js   # pdfmake 0.2.10 + Roboto (offline PDF download)
src/vendor/fonts/*.ttf      # Libre Franklin 400/600 + Libre Caslon Text 400/700 (PDF export fonts, OFL)
src/assets/*.svg + *.png    # Real brand logos (from Gerald's AI files, 2026-07-12): SVG = vector, used in the PDF; PNG (1230–1434px wide, rasterized from the SVGs) = Excel. Both injected as BOQ_LOGOS{stella,mulya,stellaSvg,mulyaSvg}
docs/design/boq-format/     # BOQ-FORMAT-SPEC.md + pdfmake-skeleton.js + reference-mock (export print design)
src/check_html.py           # Sanity-check the built HTML (topbar/shell/sidebar/script present)
src/extract_price_data.py   # (source) Excel -> price_lists JSON extraction
price-data/Price List Ref/*.xlsx   # Source price-list Excels (read-only reference)
```

### How the build works
`build_tool.py` reads the template `src/StellaMobili_BOM_Tool_Ref.html`, auto-detects every
version from `price_lists/kitchen_v*.json`, loads all three sections per version, and
replaces the single marker `/*__PRICE_DATA_INJECTION__*/` (at the top of the app's
`<script>`) with:
```js
const ALL_PRICE_DATA = { "<ver>": { kitchen:{...}, wardrobe:{...}, accessories:{...} }, ... };
const PRICE_LIST_VERSIONS = ["v26.06.02", ...];
const PRICE_LIST_LATEST = "v26.06.02";
```
Then writes `StellaMobili_BOM_Tool.html`, also replacing `/*__EXCELJS_INJECTION__*/`
(ExcelJS), `/*__PDFMAKE_INJECTION__*/` (pdfmake + Roboto vfs), and
`/*__BRAND_ASSETS_INJECTION__*/` (`BOQ_LOGOS` data-URLs + the four Libre TTFs added to
`pdfMake.vfs`/`pdfMake.fonts`). Data, libraries, fonts, and logos are all **embedded at
build time**, so the built file needs no server or internet. (The template alone won't run standalone — the marker is a
placeholder, not real data. Always run the tool from the built output.)

### To make changes
- **UI / logic** → edit `src/StellaMobili_BOM_Tool_Ref.html`, then `python src/build_tool.py`.
- **Prices** → edit/add `price-data/price_lists/*_v*.json` (and `index.json`), then rebuild.
- Adding a new version: drop `kitchen_vX.json` / `wardrobe_vX.json` / `accessories_vX.json`
  into `price_lists/`; the build auto-detects it and the newest becomes `PRICE_LIST_LATEST`.
- After building, run `python src/check_html.py` to sanity-check the output.

> `build_tool.py.bak` is the previous (pre-refactor) build script, which kept the entire
> app JS inline as a Python string. Superseded by the template approach; kept as a backup.

---

## Architecture

The entire app is **one HTML file**. Structure inside the file:

```
<head>
  Google Fonts (Newsreader + Hanken Grotesk + IBM Plex Mono)
  <script> ExcelJS (inlined at build time — offline xlsx export)
  <script> pdfmake + Roboto fonts (inlined at build time — offline direct PDF download)
  <style> — all CSS
</head>
<body>
  Topbar (brand, breadcrumb, save-status chip, tool-version chip, pricelist chip)
  Shell (sidebar + main)
    Sidebar: navigation + unit list
    Main: view-overview / view-totals / view-unit / print-all-units
  Toast stack
  Modal mount
  <script>
    /*__PRICE_DATA_INJECTION__*/   ← build replaces this with ALL_PRICE_DATA + version consts
    // All app JS
  </script>
</body>
```

> In the **template** (`_Ref.html`) the `<script>` opens with the marker
> `/*__PRICE_DATA_INJECTION__*/`; in the **built** file that line is the giant
> `const ALL_PRICE_DATA = {…}` blob. Everything after it is the app JS, identical in both.

**No framework. No bundler. Vanilla JS + CSS custom properties.**

When editing: the CSS variables section at the top of `<style>` controls all colors.
The JS is structured as clearly labelled sections with `// ===` dividers.

---

## Design System

The UI **must match the Spectral BOM tool** (Spectral_BOM.html) — same component
library, same layout patterns. The only difference is the color palette.

### Color Palette — Warm Brass / Cream (synced from Claude Design, 2026-07)

> **Palette change (2026-07):** The on-screen UI was re-skinned from the old purple
> palette to a warm brass/cream palette to match the linked Claude Design project
> (`Stella Mobili BOQ.dc.html`). The `--pu-50…900` variable NAMES are retained but their
> VALUES now map onto the warm palette, so all existing CSS class rules re-skin
> automatically. New semantic tokens (`--accent`, `--brass`, `--panel`, `--sidebar`,
> `--ink2`, etc.) were added alongside them.
> **Note (updated 2026-07-12):** the Excel + PDF exports follow their own dedicated
> print design — `docs/design/boq-format/BOQ-FORMAT-SPEC.md` (ink `#1F1812`, brass
> `#8C6830`, hairline `#E6E1D8`, Libre Caslon + Libre Franklin, real logos). The
> on-screen tokens below apply to the UI only. No legacy purple remains anywhere.

```css
/* Semantic tokens (design language) */
--bg:      #F1ECE1   /* app canvas — warm cream */
--panel:   #FBF9F4   /* subtle raised surface */
--panel2:  #FFFFFF   /* cards, topbar (== --surface) */
--ink:     #26221B   /* text */
--ink2:    #7A7264   /* muted text (== --ink-faint) */
--line:    #E4DCCC   /* borders */
--line-soft/--line2: #EFE9DC
--accent:  #8A5A3B   /* primary interactive — warm brown */
--brass:   #A6803E   /* brand mark, Excel button, rev pills (== --gold) */
--sidebar: #26221B   /* dark table headers, grand-total bars, accent stat cards */

/* Purple scale remapped onto the warm palette (names kept, values changed) */
--pu-50:  #F1E9DB   --pu-100: #E4DCCC   --pu-200: #D8C7A6   --pu-300: #C2A377
--pu-400: #A6803E   --pu-500: #8A5A3B (accent)   --pu-600: #79492F (buttons)
--pu-700: #5E3A24   --pu-800: #3E2718   --pu-900: #26221B
```

The design's **Revisions/Alternatives panel, unsaved-edits (dirty) indicator, topbar
quick-actions, and Standard/Gola handle buttons are now ported** (see the sections below).
The only design element **not** ported is **dark mode** (`--font-display` Space Grotesk,
accent `#E0A64B`) — the user opted out of a theme toggle.

### Typography (synced from Claude Design, 2026-07)
- Body/UI: `Hanken Grotesk` (Google Fonts) — was `Manrope`
- Numbers/code: `IBM Plex Mono` — was `JetBrains Mono`
- Display (available, `--font-display`): `Newsreader` — reserved for headings/hero
- Note: this no longer matches Spectral BOM's typography (that was the old shared system)

### Layout
- Sticky topbar (57px) with brand mark, breadcrumb, icon actions
- Sidebar (default 260px; **drag-resizable 190–460px** via the right-edge handle, width persisted in `localStorage.sbWidth`; collapsible to a 52px icon rail; slide-in overlay on mobile). Width is driven by the `--sidebar-w` CSS var on `.shell`; see `initSidebarResize()`.
- Main content area (scrollable)
- Toast stack (bottom-right, fixed)
- Modals (backdrop blur, centered)

### Key CSS Classes (mirror Spectral)
```
.card / .card-head / .card-body
.btn / .btn.primary / .btn.gold / .btn.ghost / .btn.danger
.btn-sm / .btn-xs
.input / .select / .input.compact / .input.qty.show-spin
.field (label + input wrapper)
.tabs / .tab / .tab.active / .tab-count
.bom-table (thead/tbody/tfoot structure)
.matrix-table (summary/totals tables)
.stat / .stat-row / .stat.accent
.search-results (position:fixed — critical, keeps dropdown above all)
.modal / .modal-backdrop / .modal-head / .modal-body / .modal-foot
.toast / .toast-stack
.tag / .tag.custom / .tag.alt / .tag.gray
```

---

## Data Structure

```js
PRICE_DATA = {
  kitchen: {
    "Base Unit": [
      {
        desc: "BU Shelf w.300",
        prices: {
          "TZ (High Gloss & Satin)__standard": 2721000,
          "TZ (High Gloss & Satin)__gola": 2500000,
          "Classic Doors PVC__standard": 1980000,
          // gola key ABSENT = gola not supported for this item+finish combo
          ...
        }
      },
      ...
    ],
    "Wall Unit": [...],
    "Tall Unit": [...]
  },
  wardrobe: {
    "Swing Door 110°": [
      {
        desc: "Panel 600×2400",
        prices: {
          "TZ (High Gloss & Satin)": 1450000,
          "Classic Doors PVC": 1200000,
          ...
          // No standard/gola split for wardrobe — finish key only
        }
      }
    ],
    "Swing Door 170°": [...],
    "Sliding Panel": [...]
  },
  accessories: {
    "Solid Surface": [{ desc, unit, price }],
    "Lighting":      [{ desc, unit, price }],
    "Kitchen Accessories": [...],
    "Wardrobe Accessories": [...],
    "Handles": [...]
  }
}
```

### Critical: Gola Validation Rule
**Gola availability is at the item+finish level**, not just the finish level.
- If `prices["TZ__gola"]` exists → Gola supported for this item with this finish
- If `prices["TZ__gola"]` is absent → Gola NOT supported → show error, block add
- This is checked in `validateGola(item, finish, variant)` — do not bypass this

### Panel Thickness
Detected via regex from finish name: `/(\d+)\s*mm/i`
If no match → defaults to `''` (empty string) — displayed as `—` placeholder in the add bar and table.
Thickness can also come from `item.thicknesses[finishKey]` in the price data (takes priority over regex).

---

## State Model

```js
units = [
  {
    id: "u1",
    name: "Master Bedroom",
    items: {
      kitchen:     [{ id, category, desc, finish, variant, thickness, qty, price, notes, custom, altGroup }],
      wardrobe:    [...],
      accessories: [...]
    }
  },
  ...
]
```

`units` is the **live working calculation**. On top of it sit the global vars (all in the
main `<script>`):
- `alts` / `activeAltKey` / `activeVerNum` — the Revisions & Alternatives tree (see the
  Save/Load Format section). `alts[]` snapshots are deep copies, independent of `units`.
- `dirty` — true when the working calc has edits not yet committed to a version; drives the
  topbar "Unsaved edits" indicator. Set by `markDirty()` (called from every mutation),
  cleared by `confirmCommit` / `loadVersion` / `loadFile`.
- `revisionNumber` — vestigial (kept for backward compat, no longer incremented).

Row fields:
- `id` — `Date.now() + Math.random()` — unique, used for DOM events
- `category` — e.g. "Base Unit", "Swing Door 110°", "Solid Surface", "Custom"
- `finish` — finish name string (for accessories: the unit string, e.g. "pc")
- `variant` — `"standard"` | `"gola"` (kitchen only; empty string for others)
- `thickness` — e.g. `"18mm"` (kitchen + wardrobe)
- `custom: true` → yellow CUSTOM badge
- `buffer: true` → **buffer/insurance stock**: still counted in all BOQ totals, but flagged so it can be excluded from the Sales Order downstream. Per-row shield toggle (`toggleRowBuffer`); shown with a blue BUFFER tag + tinted shield, an "incl. buffer Rp X" note on section subtotals / unit total / grand total, a "Buffer" column (YES) in Excel, and a BUFFER badge in the PDF. Buffer totals: `secBufferTotal(u,sec)` / `unitBufferTotal(u)`. Color token `--buffer` (#3E648C). Travels in `.smbq` (part of the units array).
- `altGroup` → legacy field; always `null` on new items. The makeAlt UI feature has been removed from the built tool.

---

## Navigation / View Model

Three views rendered into `<main>`:
- `view-overview` — project meta, stat cards, unit summary table
- `view-totals` — matrix table breakdown by unit × section
- `view-unit` — per-unit editing (tabs: Kitchen / Wardrobe / Accessories)

`showView(name, unitId)` switches views and updates sidebar active states.

The unit editing view is rebuilt from scratch on each `renderUnitView(unitId)` call.
Tab content is rebuilt on each `renderTabContent(section)` call.
This is intentional — avoids stale DOM state.

---

## Save / Load Format (.smbq)

`.smbq` files are plain JSON. **Format is now `version: 3`** — it carries the full
Revisions/Alternatives tree. The loader is backward-compatible with older v1/v2 files
(missing `alts` → seeded to a single empty "Initial scheme" alternative).

```json
{
  "version": 3,
  "revisionNumber": 1,
  "project": { "name": "...", "client": "...", "pic": "...", "date": "...", "notes": "...", "priceListVersion": "..." },
  "units": [ ...full units array (the LIVE working calculation)... ],
  "unitCounter": 3,
  "alts": [
    { "key": "A", "name": "Initial scheme",
      "versions": [
        { "ver": 2, "status": "Ready for quotation", "note": "...", "date": "2026-07-09",
          "total": 7242000, "unitsCount": 1, "itemsCount": 2, "priceList": "v26.06.02",
          "snapshot": { "units": [...], "unitCounter": 3, "priceListVersion": "v26.06.02" } },
        { "ver": 1, "status": "Superseded", ... }
      ] }
  ],
  "activeAltKey": "A",
  "activeVerNum": 2,
  "savedAt": "2026-07-09T10:30:00.000Z"
}
```

**Two distinct save concepts** (do not conflate):
- **Save .smbq** (topbar disk icon / Project Info button) → downloads the whole state to a
  file. This is disk persistence.
- **Save as v{n} / Update v{n}** (Revisions & Alternatives panel) → commits the live
  working calc into `alts[].versions[]` as an in-memory snapshot. This is the quotable
  version history. `.smbq` carries all of it.

**Versioning rules** (`confirmCommit`): a version's `versions[0]` is always the newest.
If the latest version is a **Draft**, saving **updates it in place** (no new version).
Once it's marked **Ready for quotation**, saving creates the next `ver` and marks all
prior versions **Superseded**. `revisionNumber` is now vestigial (kept for backward
compat, no longer incremented) — the alt/version label supersedes it in the UI and exports.

---

## Key Functions Reference

| Function | What it does |
|---|---|
| `showView(name, unitId)` | Switch main view, update breadcrumb + sidebar |
| `renderOverview()` | Rebuild overview stat cards + unit table |
| `renderTotals()` | Rebuild totals matrix |
| `renderUnitView(unitId)` | Rebuild entire unit editing view |
| `renderTabContent(sec)` | Rebuild add bar + table for current tab |
| `buildAddBar(sec)` | Returns HTML string for the add-item form |
| `buildTableCard(unit, sec)` | Returns HTML string for the items table |
| `initKitFinishes()` | Populate finish dropdown from PRICE_DATA |
| `initWdFinishes()` | Same for wardrobe |
| `getPool(prefix)` | Returns filtered item array for current selections |
| `showDropdown(p, items)` | Render + position search results dropdown |
| `positionDropdown(p)` | `position:fixed` — recalculates on every open |
| `selectItem(p, idx)` | Confirm selection from dropdown |
| `validateGola(item, f, v)` | Returns `{ok, reason}` — blocks invalid gola |
| `setKitVariant(v)` | Handle toggle: sets the hidden `#kit-variant` value + active button styling (Standard/Gola). All pricing code still reads `#kit-variant.value` |
| `refreshKitHandle()` / `kitGolaAvailable()` | Enable/disable the Gola button per category+finish; reverts to Standard if Gola unavailable. Called from `onKitFinishChange` |
| `markDirty()` / `updateDirtyIndicator()` | Sets the `dirty` flag on any mutation + shows the topbar "Unsaved edits" pulse. Cleared by `confirmCommit` / `loadVersion` / `loadFile` |
| `updateSaveStatus()` | Topbar save-status chip: Unsaved edits → Saving… → Autosaved HH:MM → Saved (updateDirtyIndicator/updateAltVerChip are legacy aliases) |
| `renderRevisionsPanel()` | Returns HTML for the Revisions & Alternatives card (injected into `renderOverview`) |
| `openCommitModal()` / `openNewAltModal()` / `renderCommitModal()` | Build/show the Save-version / Save-as-alternative modal (`_commit` holds transient mode/ready) |
| `confirmCommit()` | Commits the working calc into `alts[]` (draft-in-place vs new version vs new alternative) |
| `loadVersion(altKey, ver)` | Restores a version's `snapshot` into the live state |
| `toggleReady(altKey)` / `selectAlt(key)` / `renameAlt(key,val)` / `deleteAlt(key)` | Alternatives management |
| `addRow(sec)` | Validate + push row to unit.items[sec] |
| `refreshTable(sec)` | Rebuild ONLY the items table (`#tab-table`), leaving the Add Bar intact — used by all row mutations so the PIC's category/finish/handle selections stay put. Full `renderTabContent` is only for tab-switch/unit-view init |
| `toggleRowBuffer(sec,id)` | Flip a row's `buffer` flag (insurance stock — see State Model) |
| `editFinish(cell, sec, id)` | In-place finish editor (replaces cell with <select>) |
| `showCopyToUnit(sec)` | Show unit picker modal for copying selected rows |
| `copyToUnit(sec, targetId)` | Copy selected rows from current unit to target unit |
| `saveFile()` | Save .smbq (named via `fileBaseNameDate()`); clears the localStorage autosave |
| `pickSaveHandle(fname)` / `writePicked(pick,blob)` | Two-phase native Save As (showSaveFilePicker): dialog opens FIRST on the click, file written after generation. Used by saveFile/exportExcel/savePDF. **`file://` pages have no picker API** (Chrome limitation) → silent fallback to instant download; the manuals point users to Chrome's "Ask where to save each file" setting |
| `autosaveNow()` / `applyLoadedState(st)` | Unsaved-work protection: state autosaved to `localStorage.smboq_autosave` every 30s while dirty + on beforeunload (which also warns); on startup a modal offers restore/discard. `applyLoadedState` is shared by loadFile and the restore |
| `fileBaseNameDate()` / `exportFileBase(incBuf,sets)` | Filename builder: `{Name}_{date}` + optional `_Alt_A-B-C` (only when SOME alternatives are exported; omitted when all are) + `_BOQ(Buffer)`/`_BOQ`. The document itself states each alternative's version. Dashes in name collapse to `_` |
| `setUnits(altKey,ver)` / `setLabel(s)` / `defaultSets()` / `setsHaveBuffer(sets)` | Export **sets**: `{altKey, ver}` where ver is a saved version number or `'working'` (live calc, active alt only). setUnits resolves the units array (snapshot vs live) |
| `openExportModal(kind)` / `getExportSets()` / `confirmExport(kind,incBuf)` | Export picker: per-alternative checkbox + version dropdown (default: active alt, working copy when dirty else latest version), Select all, A4 orientation (PDF), buffer chooser. Multi-set export = ONE document: PDF repeats the full letterhead (logos + project meta, with THAT alternative's own version in the Version cell) atop each set — each on a new page — followed by an "Alternative K — name / ALT K vN" title bar + per-set grand totals, so every alternative reads as a standalone BOQ; Excel gets `Summary K` + `K · Unit` sheets per set |
| `loadFile(input)` | Parse .smbq, restore full state |
| `openExportModal(kind)` | Buffer-mode chooser (with buffer=quotation / without=SO); skipped when no buffer items |
| `exportExcel(incBuf)` | ExcelJS (inlined at build) — Summary + per-unit sheets styled to BOQ-FORMAT-SPEC (dual-logo header rows 1–5, ink/brass/hairline); NB `addBrandHeader` adds logos LAST (an ExcelJS image anchor counts as a row and would shift addRow) |
| `savePDF(incBuf)` / `buildPdfDoc(incBuf)` | pdfmake (inlined at build) — direct .pdf download, A4 portrait per `docs/design/boq-format/BOQ-FORMAT-SPEC.md`: dual-logo letterhead, Libre Caslon/Franklin, meta band, per-unit sections, buffer rows tinted; no print dialog |
| `showModal(html)` | Mount modal HTML into #modal-mount |
| `closeModal()` | Clear #modal-mount |
| `toast(msg, type, dur)` | Animated toast notification |
| `fmt(n)` | `"Rp 1.234.567"` — Indonesian locale |
| `fmtShort(n)` | `"Rp 1.2M"` — for stat cards |
| `esc(s)` | HTML-escape for innerHTML |
| `escAttr(s)` | Attribute-safe escape |

---

## Re-extracting Data from Excel

The canonical extractor is `src/extract_price_data.py` — it reads the Excels in
`price-data/Price List Ref/` and writes the per-section JSONs into `price-data/price_lists/`.
After extracting, run `python src/build_tool.py` to rebuild the tool. The reference
logic below documents the Excel layout the extractor relies on:

```python
import pandas as pd, json

def get_kitchen_items(sheet):
    df = pd.read_excel('Kitchen_PL_SM_MAR_2026.xlsx', sheet_name=sheet, header=None)
    col_map = []
    last_group = ''
    for col in range(4, df.shape[1]):
        g = str(df.iloc[5, col]).strip().replace('\n', ' ') if pd.notna(df.iloc[5, col]) else ''
        v = str(df.iloc[6, col]).strip() if pd.notna(df.iloc[6, col]) else ''
        if g and g != 'nan': last_group = g
        variant = v if (v and v != 'nan') else 'standard'
        if last_group:
            col_map.append({'col': col, 'group': last_group, 'variant': variant})
    items = []
    for row in range(9, df.shape[0]):
        desc = df.iloc[row, 1]
        if pd.isna(desc) or not str(desc).strip(): continue
        entry = {'desc': str(desc).strip(), 'prices': {}}
        for f in col_map:
            val = df.iloc[row, f['col']]
            if pd.notna(val) and str(val) not in ('nan', ''):
                try:
                    entry['prices'][f"{f['group']}__{f['variant']}"] = int(float(val))
                except: pass
        if entry['prices']:
            items.append(entry)
    return items

# Row structure: row 5 = finish group name, row 6 = standard/gola, data from row 9
# Kitchen: finish key = "Finish Name__standard" or "Finish Name__gola"
# Wardrobe: finish key = finish name only (no variant)
# Accessories: flat {desc, unit, price}
```

After regenerating the `price_lists/*.json`, rebuild with `python src/build_tool.py`
— it injects the data into the template. Do **not** hand-edit the giant `ALL_PRICE_DATA`
blob in the built HTML; it is generated.

**Important**: The built HTML is ~6.4MB. Edit the **template** (`_Ref.html`, ~140KB) not
the output. Use an editor that handles large files if you must inspect the built file.

---

## Future Flat-List Database Format

When the proper price database is ready, it will be a flat Excel with these columns:

| section | category | description | finish | handle | thickness | price | unit | active | notes |
|---|---|---|---|---|---|---|---|---|---|
| Kitchen | Base Unit | BU Shelf w.300 | TZ (High Gloss & Satin) | standard | 18mm | 2721000 | set | YES | |
| Kitchen | Base Unit | BU Shelf w.300 | TZ (High Gloss & Satin) | gola | 18mm | 2500000 | set | YES | |
| Wardrobe | Swing Door 110° | Panel 600×2400 | TZ (High Gloss & Satin) | | 18mm | 1450000 | set | YES | |
| Accessories | Handles | Bar Handle 128mm | | | | 85000 | pc | YES | |

The import parser should read this flat list and build `PRICE_DATA` from it.
Each row = one SKU. `active = NO` = discontinued, skip from UI but keep in DB.

---

## CRM Integration Plan

This tool is a **standalone preview** of what will become a module inside **MulyaOne**
(Next.js 14 + TypeScript + Tailwind + PostgreSQL + Prisma).

When integrated:
- The `.smbq` JSON state maps to a `boq_revision` table row (immutable, versioned)
- `PRICE_DATA` is served from the DB, not embedded in HTML
- Price visibility is role-gated: PIC sees Showroom Price (this tool), Sales sees Selling Price (CRM-derived)
- PDF generation moves to Puppeteer + React templates
- Price list management lives in the **Stella Mobili PIC Settings** section of MulyaOne
- Pricing formulas (÷0.7, ÷0.55, discount caps) are CRM settings, NOT shown in this tool

**Do not** add server-side features to the standalone HTML tool.
Keep it self-contained. CRM integration happens as a separate build.

---

## Branding Rules (Non-Negotiable)

From MulyaOne design spec:

- **Mulya** is always the primary brand on all documents (letterhead, address)
- **Stella Mobili** is the sub-brand
- Company: PT. Mitra Usaha Lancar Jaya
- Address: Jl. Tegalsari 37
- Tagline: More Value · More Possibilities
- Document header (per BOQ-FORMAT-SPEC): brand logo (Stella Mobili) top-LEFT with the
  doc line under it; MULYA logo constant top-RIGHT with the company line under it.
  The top-left slot is per-brand (7 brands); MULYA always sits top-right.
- Document numbering format: `BOQ-SM-YY-###-v{n}`

**Color rule (updated 2026-07-12)**: The on-screen SM UI uses the **warm brass/cream**
palette (`--accent #8A5A3B`, `--brass #A6803E`) — see the Color Palette section above.
The **Excel/PDF exports** follow the dedicated print spec
`docs/design/boq-format/BOQ-FORMAT-SPEC.md`: ink `#1F1812`, muted gray `#7A7166`, brass
accent `#8C6830`, hairlines `#E6E1D8`, buffer blue `#3E648C`/`#E9EFF6`; fonts Libre
Caslon Text (display) + Libre Franklin (body, PDF only); **both logos** on every
document — brand logo (Stella Mobili) top-LEFT, MULYA constant top-RIGHT. The legacy
purple (`#4c1d95` family) is fully retired. Spectral BOM still uses blue — never mix.

---

## Known Issues / Things To Fix

- [x] ~~The `loadFile` function restores `units` correctly but the project fields
      are only in the DOM when Overview is rendered.~~
      **Fixed:** `projectMeta` is stored in state; `renderOverview()` reads from state, not DOM.

- [x] ~~`renderSidebarUnits()` re-renders the entire sidebar on every qty change.~~
      **Fixed:** `updateQty()` no longer calls `renderSidebarUnits()` (sidebar shows item count, which doesn't change on qty edits).

- [x] ~~The DB editor only shows first 6 price columns per kitchen/wardrobe item.~~
      **Resolved (2026-07-11):** the DB editor/browser was removed entirely — the user
      decided it had no real use. Sidebar "View Database" button, `openDBEditor` /
      `openDBItem` / `filterDBItems`, and the `.db-detail-table` CSS are gone.
      (`.db-item-row` CSS kept — reused by the copy-to-unit modal.)

- [x] ~~`importPriceList()` shows a preview but doesn't actually update `PRICE_DATA`.~~
      **Resolved:** feature dropped, not finished. The function was already absent from
      the template; price updates go through `extract_price_data.py` + rebuild, and
      price-list management moves to the CRM (MulyaOne) anyway.

- [x] ~~Mobile: the search dropdown (`position:fixed`) can be mispositioned on
      iOS Safari when the keyboard is open.~~
      **Won't fix:** the office uses Windows PCs and Android tablets only — no iOS.
      Android Chrome resizes the viewport on keyboard open, so `position:fixed` behaves.

- [x] ~~Alt rows (makeAlt) visual grouping issue.~~
      **Resolved:** makeAlt feature removed from the built tool. `altGroup` field kept in save format as `null` for backward compat.

- [x] ~~Panel thickness detection defaults to "18mm" when no data.~~
      **Fixed:** `detectThickness()` now returns `''`; displayed as `—` placeholder. Thickness also read from `item.thicknesses[finishKey]` when available.

---

## Tool Versioning (the "v1.0.0" topbar chip)

The tool-version chip (`#toolVer` in the topbar, hardcoded in the template) is bumped
**manually, only when the user asks** — usually at the end of a working session. The user
decides together with Claude whether the session's changes warrant bumping the minor
(second number: feature additions the PIC would notice) or the patch (third number: small
fixes/tweaks). Do NOT bump it automatically or wire it to the build. When bumping, update
the chip in `src/StellaMobili_BOM_Tool_Ref.html` and port the same value to the design
canvas so both stay in step.

---

## Claude Design Project Sync

The linked Claude Design project ("SM BOQ Tool", projectId `9874fbe6-f645-4f10-9fdb-981917e3d868`,
claude.ai/design) holds an interactive design mock of this tool:
- `Stella Mobili BOQ.dc.html` — the design canvas (React mock, `sc-if`/`sc-for` templating,
  sample data from `sm-boq-data.js`, runtime `support.js`). Includes a dark-mode variant
  (`data-dir="b"`) that intentionally does NOT exist in the tool.
- `uploads/StellaMobili_BOM_Tool.html` — reference copy of the current built tool.

**How the user works:** the user edits the design ONLY through the Claude Design UI on
claude.ai — never the local files. The vendored copy at `docs/design/canvas/` (same three
files, git-versioned) is a backup snapshot the user never opens; Claude Code maintains it.

Sync workflow (Claude Code does all of this on request — "sync the design project"):
- **After the user edits in Claude Design** → `get_file` the canvas, refresh
  `docs/design/canvas/`, commit. (Keeps a restorable last-known-good in git.)
- **After a UI change to the tool** → port the change into the canvas (edit the vendored
  copy, preview via the `design-canvas` entry in `.claude/launch.json` — it runs
  standalone), then `finalize_plan` + `write_files` to the projectId above, then commit.
- **After a rebuild** → optionally refresh `uploads/StellaMobili_BOM_Tool.html` in the
  design project from the repo root, so the design side has a current reference build.

Last full sync: 2026-07-11 (DB browser removed, tool-version chip added, qty steppers ported).

---

## What Spectral_BOM.html Is

The Spectral BOM tool (`Spectral_BOM.html`) is the **design reference**.
The SM BOQ tool should visually match it — same layout, same components,
same font, same interaction patterns. The Spectral tool uses blue; SM uses purple.

Do not modify Spectral_BOM.html. Use it only as a visual reference.

---

## Quick Reference: Prices (Stella Mobili)

| Tier | Formula | Who sees it |
|---|---|---|
| Real Cost | — | Director + Operations only |
| Showroom Price | Cost ÷ 0.7 | PIC (this tool shows Showroom) |
| Selling Price | BOM ÷ 0.55 | Sales team |
| Max Discount | 20% + 5% (tiered, NOT 25%) | — |
| Floor | 1.974× cost | — |

20% + 5% tiered means: apply 20% first, then 5% on the discounted value.
Example: Rp 10,000,000 → after 20% = Rp 8,000,000 → after 5% = Rp 7,600,000.
