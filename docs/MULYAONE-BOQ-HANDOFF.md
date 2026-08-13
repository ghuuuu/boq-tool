# SM BOQ Tool → MulyaOne Integration Handoff

> **Audience:** the Claude Code session working in the MulyaOne repo (Next.js 14 +
> TypeScript + Tailwind + PostgreSQL + Prisma).
> **Source:** the standalone Stella Mobili BOQ tool, repo `SM BOQ Tool`
> (standalone HTML, tool version **v1.5.1**, price list **v26.06.02**, as of 2026-07-15).
> This document is self-contained: everything needed to design the DB schema, API,
> and BOQ module lives here. The standalone tool remains in production during the
> transition — MulyaOne must be able to **import its `.smbq` files** (schema below).

---

## 1. What the tool does (functional scope)

The BOQ (Bill of Quantities) tool is used by the Stella Mobili **PIC** to:

1. Build a room-by-room ("unit-by-unit") BOQ for a client project.
2. Pick cabinet items from a versioned price list, by **category → finish → handle
   variant (Standard/Gola)**; add custom (free-typed) rows; flag rows as **buffer**
   (insurance stock); cluster rows into named **groups** (e.g. "Kitchen Island").
3. Maintain a **Revisions & Alternatives** tree: multiple alternatives (Alt A/B/C…),
   each with immutable numbered versions (v1, v2…) that carry status
   (Draft / Ready for quotation / Superseded) and their own quotation date.
4. Save/load everything as a `.smbq` file (JSON, format version 3).
5. Export to **Excel** (Summary + one sheet per unit) and **PDF** (A4, branded),
   optionally with or without buffer rows, and covering one or many alternatives.

Company context: PT. Mitra Usaha Lancar Jaya, trading as **Mulya**, manages 7 brands;
**Stella Mobili** is one of them. Mulya is always the primary brand on documents.

## 2. Where things map in MulyaOne (agreed plan)

| Standalone tool | MulyaOne |
|---|---|
| `.smbq` JSON state | `boq_revision` table rows (immutable, versioned) |
| `ALL_PRICE_DATA` embedded in HTML | Price data served from PostgreSQL |
| Showroom price shown to PIC | Role-gated pricing: PIC sees Showroom, Sales sees Selling Price |
| pdfmake in-browser PDF | Puppeteer + React templates |
| Price list JSONs maintained by rebuild | Price list management UI in **Stella Mobili PIC Settings** |
| (not in tool) | Pricing formulas (÷0.7, ÷0.55, discount caps) become CRM settings — **never shown in the BOQ input UI** |

### Pricing tiers (CRM settings, for reference)

| Tier | Formula | Who sees it |
|---|---|---|
| Real Cost | — | Director + Operations only |
| Showroom Price | Cost ÷ 0.7 | PIC (the BOQ tool operates in Showroom prices) |
| Selling Price | BOM ÷ 0.55 | Sales team |
| Max Discount | 20% + 5% **tiered** (= 24%, not 25%) | — |
| Floor | 1.974 × cost | — |

Tiered = apply 20% first, then 5% on the discounted value:
Rp 10.000.000 → 8.000.000 → 7.600.000.

**All prices are integer IDR.** Display format `Rp 1.234.567` (id-ID locale).

## 3. Price data model (input side)

Price lists are versioned (e.g. `v26.06.02`). One version = three section files:
`kitchen_<ver>.json`, `wardrobe_<ver>.json`, `accessories_<ver>.json`, plus an
`index.json` registry `{ latest, versions[] }`. Copy these from the SM BOQ repo:
`price-data/price_lists/*.json` — they are the seed data for the DB.

### 3.1 File shape

```jsonc
{
  "version": "v26.06.02",
  "type": "kitchen",              // kitchen | wardrobe | accessories
  "extractedAt": "…ISO date…",
  "items": {
    "<Category>": [ { …item… }, … ]   // ordered arrays — preserve order in DB (sort_order)
  }
}
```

### 3.2 Categories

- **Kitchen:** Base Unit, Wall Unit, Tall Unit, Artdeco Base Unit, Artdeco Wall Unit,
  Artdeco Tall Unit, Glass Doors, Ornament Artdeco
- **Wardrobe:** Wardrobe Swing Door 110, Wardrobe Swing Door 170, Wardrobe Sliding Door,
  Swing Glass Door, Sliding Glass Door, Upper Cabinet, Upper Cabinet Mirror,
  Base Cabinet BLUM, Base Cabinet STD, Aluminium Marble Door Frame, Wardrobe Component
- **Accessories:** Solid Surface, Lighting, Wardrobe Accessories, Kitchen Accessories,
  Mirror, Handles

### 3.3 Item shape (real fields, richer than older docs suggest)

```jsonc
// kitchen item
{
  "subcat": "Base Unit Shelf",       // sub-category grouping within the category
  "desc": "BU Shelf w.300",          // display name (unique within category in practice)
  "w": 300, "h": 740, "d": 620,      // dimensions in mm (kitchen)
  "thickness": "",                    // e.g. "18mm" or "" (unknown → UI shows —)
  "unit": "set",                      // unit of measure: set | pc | lm | m2 | …
  "notes": "Base Unit with 1 Shelf. …",
  "prices": { "<finish>__<variant>": 3515000, … },
  "thicknesses": { "<finish>__<variant>": "18mm", … }   // OPTIONAL per-finish override
}
// accessories item — same idea, flat price:
{ "subcat": "Worktop", "desc": "Kitchen Worktop D.30cm",
  "thickness_mm": 40, "depth_mm": 300, "unit": "lm", "notes": "…",
  "prices": { "(No Finish)__standard": 2512000 } }
```

### 3.4 The price-key contract (critical — this is the SKU axis)

Every price key is `"<finishKey>__<variant>"`. Variant is `standard` or `gola`.

- **Kitchen:** both `__standard` and `__gola` keys exist. **Gola availability is per
  item + finish**: if `"<finish>__gola"` is absent from `item.prices`, Gola is NOT
  available for that item/finish and adding it must be blocked (tool's
  `validateGola`). Do not infer gola support at the finish level.
- **Wardrobe & Accessories:** keys always end `__standard` (the suffix is uniform in
  the data; there is no gola concept outside kitchen). BOQ rows store `variant: ""`
  for these sections.
- **Glass categories** (wardrobe: Swing Glass Door, Sliding Glass Door, Upper Cabinet
  Mirror): the finishKey is composite — `"<glassType> | <subType>"`, e.g.
  `"Frosted Glass | Bronze Frame__standard"`. The UI presents them as two dropdowns.
- **No-finish categories** (wardrobe: Aluminium Marble Door Frame, Wardrobe Component;
  most accessories): the single key is `"(No Finish)__standard"`.
- Thickness: parsed from finish name via `/(\d+)\s*mm/i`, overridden by
  `item.thicknesses[key]` when present; empty means unknown (display `—`).

**Recommended flat DB shape** (matches the plan already written for the future DB):
one row per (section, category, subcat, description, finish, variant) with columns
`price int`, `unit`, `thickness`, `w/h/d mm`, `notes`, `active bool`, plus
`price_list_version`. `active = NO` = discontinued: hide from pickers, keep for
historical BOQ rendering. There is a flattening/audit toolchain on the SM side
already (matrix Excel → flat list), so treat the JSONs above as canonical seed.

## 4. BOQ state model (what a working calculation is)

```ts
type Section = 'kitchen' | 'wardrobe' | 'accessories';

interface Row {
  id: number;            // Date.now()+Math.random() — replace with real IDs in DB
  category: string;      // e.g. "Base Unit", "Swing Door 110°", "Custom"
  desc: string;
  finish: string;        // finish name; for accessories this holds the unit string (e.g. "pc")
  variant: 'standard' | 'gola' | '';   // kitchen only; '' elsewhere
  thickness: string;     // "18mm" | ""
  qty: number;
  price: number;         // unit price, integer IDR (Showroom tier)
  notes: string;
  custom?: boolean;      // free-typed row, not from price list (yellow CUSTOM badge)
  buffer?: boolean;      // insurance stock — see §4.2
  altGroup: null;        // legacy, always null; keep for backward compat on import
  groupId: string|null;  // item-group membership — see §4.1
}

interface Unit {          // a room, not a unit of measure
  id: string;             // "u1", "u2", …
  name: string;           // "Master Bedroom"
  items: Record<Section, Row[]>;
  groups: { id: string; name: string; collapsed: boolean }[];  // ordered
}
```

### 4.1 Item groups
A group clusters rows into a named package (e.g. "Kitchen Island") and **can span
sections** (kitchen rows + accessories rows in one group). Group definitions live on
the unit; rows point at them via `groupId` (`null` = ungrouped). Section arrays are
kept sorted in group order (groups in `unit.groups` order, ungrouped last), so array
order == display order. Exports are **group-first**: bands per group with
cross-section rows and group subtotals, then an "Other items" band for the ungrouped
tail (that band's header is hidden when the unit has no groups).

### 4.2 Buffer rows
`buffer: true` = insurance stock. Counted in **all** BOQ totals but flagged so it can
be **excluded from the Sales Order** downstream. Exports offer two modes: *with
buffer* (quotation) and *without* (SO basis). Subtotals show "incl. buffer Rp X"
notes; Excel gets a Buffer column (YES); PDF shows a BUFFER badge on tinted rows.
Buffer semantics must survive into MulyaOne — it feeds the BOQ→SO handoff.

### 4.3 Revisions & Alternatives (the versioning tree)
On top of the live working calc (`units`) sits:

```ts
interface Alt {
  key: string;            // "A", "B", …
  name: string;           // "Initial scheme"
  versions: Version[];    // versions[0] is ALWAYS the newest
}
interface Version {
  ver: number;                       // 1, 2, …
  status: 'Draft' | 'Ready for quotation' | 'Superseded';
  note: string;
  date: string;                      // per-version quotation date "YYYY-MM-DD", editable
  total: number; unitsCount: number; itemsCount: number;
  priceList: string;                 // price list version used
  snapshot: { units: Unit[]; unitCounter: number; priceListVersion: string };  // deep copy
}
```

**Commit rules** (must be preserved):
- If the alternative's latest version is a **Draft**, committing **updates it in
  place** (no new version).
- Once marked **Ready for quotation**, the next commit creates `ver+1` and marks all
  prior versions **Superseded**.
- Snapshots are immutable deep copies — this is exactly what `boq_revision` rows
  should be in PostgreSQL (store snapshot as JSONB or normalized rows; JSONB is the
  low-risk first step since exports render from the snapshot).
- Two save concepts, do not conflate: **commit a version** (in-memory history, the
  quotable record) vs **save .smbq** (disk persistence of everything). In MulyaOne
  the second disappears — the DB is persistence — but the first is the core domain
  concept.

`revisionNumber` at the top level is **vestigial** (kept for old-file compat, no
longer incremented). Document numbering format for quotations: `BOQ-SM-YY-###-v{n}`.

## 5. `.smbq` file format (import contract)

Plain JSON, `version: 3`. MulyaOne needs an **importer** for these files (the PIC has
live projects in them).

```jsonc
{
  "version": 3,
  "revisionNumber": 1,               // vestigial
  "project": {
    "name": "…", "client": "…", "pic": "…", "notes": "…",
    "priceListVersion": "v26.06.02"  // NB: no project-level date; versions carry their own
  },
  "units": [ /* full Unit[] — the LIVE working calculation */ ],
  "unitCounter": 3,
  "alts": [ /* Alt[] as in §4.3, snapshots included */ ],
  "activeAltKey": "A",
  "activeVerNum": 2,
  "savedAt": "2026-07-09T10:30:00.000Z"
}
```

Backward compat already handled by the tool's loader (mirror it in the importer):
- v1/v2 files: missing `alts` → seed one alternative `A` "Initial scheme" with no versions.
- Missing `groups` on a unit → `[]`; missing `groupId` on rows → `null`; orphaned
  groupIds pruned.
- Old files may carry `project.date` — ignore it.
- `altGroup` on rows: ignore (always null on anything recent).

## 6. Export / document design

The Excel + PDF exports follow a dedicated print spec, **separate from the on-screen
UI palette**. Bring these files across from the SM BOQ repo:

- `docs/design/boq-format/BOQ-FORMAT-SPEC.md` — the full print spec (the Puppeteer/React
  PDF templates should implement this)
- `docs/design/boq-format/pdfmake-skeleton.js` + `reference-mock.dc.html` — reference impl

Print tokens: ink `#1F1812`, muted `#7A7166`, brass `#8C6830`, hairline `#E6E1D8`,
buffer blue `#3E648C` / bg `#E9EFF6`. Fonts: Libre Caslon Text (display) + Libre
Franklin (body). Branding rules (non-negotiable):

- Brand logo (Stella Mobili) top-LEFT with doc line under it; **MULYA logo constant
  top-RIGHT** with the company line. The top-left slot is per-brand (7 brands).
- Company: PT. Mitra Usaha Lancar Jaya · Jl. Tegalsari 37 · "More Value · More Possibilities".
- Logo assets: `src/assets/*.svg` (vector, PDF) + `*.png` (Excel) in the SM BOQ repo.

Export behaviors to reproduce:
- Export **sets**: any combination of {alternative, version-or-working-copy}. A
  multi-set export is ONE document; each set repeats the full letterhead + an
  "Alternative K — name / ALT K vN" title bar, so each alternative reads as a
  standalone BOQ. Excel: `Summary K` + `K · Unit` sheets per set.
- Buffer chooser (with/without) whenever any buffer rows exist.
- Dates print **DD Mon YYYY** (`02 Jun 2026`) — spelled-out month, so a client can't
  read it day-first or month-first by mistake. Export **filenames** use the compact
  `DD-MM-YYYY` form instead. A committed version prints **its own** date, the working
  copy prints today.
- Filename convention: `{ProjectName}_{YYYYMMDD}` + `_Alt_A-B-C` (only when a subset of
  alternatives is exported) + `_BOQ(Buffer)` / `_BOQ`.

## 7. UI notes (what to rebuild vs drop)

The standalone UI (warm brass/cream palette, Hanken Grotesk / IBM Plex Mono /
Newsreader) is a **reference, not a constraint** — MulyaOne has its own design system.
Interaction patterns worth keeping: three views (Overview / Totals matrix / per-Unit
editor with Kitchen–Wardrobe–Accessories tabs), searchable item picker filtered by
category+finish+variant, per-finish handle-button availability (Standard/Gola buttons
hide when unavailable), in-place finish editing on rows, copy-rows-to-other-unit,
always-visible selection bar with Add to Group.

**Do not port:** the DB editor (removed), makeAlt (removed), localStorage autosave +
beforeunload warning (DB persistence replaces it), the `showSaveFilePicker` two-phase
save dance, embedded ExcelJS/pdfmake vendoring. Dark mode was deliberately not built.

There are user manuals (`SM_BOQ_Manual_EN.html` / `_ID.html`) describing every
workflow from the PIC's perspective — useful as functional spec.

## 8. Suggested first milestones

1. **Prisma schema**: `price_list_version`, `price_item` (flat SKU rows per §3.4),
   `boq_project`, `boq_alternative`, `boq_revision` (immutable, JSONB snapshot),
   plus a `working_calc` per project (mutable JSONB) to mirror the live/committed split.
2. **.smbq importer** (server action): validate, seed alternatives/versions per §5,
   map `priceListVersion` to a DB price list version.
3. **BOQ editor module** re-implementing §4 semantics against the DB.
4. **Puppeteer PDF + Excel export** per BOQ-FORMAT-SPEC.
5. Role gating: PIC = Showroom prices only; pricing formulas live in CRM settings.

### Files to copy from the SM BOQ repo alongside this doc

```
price-data/price_lists/*.json            # seed data (canonical)
docs/design/boq-format/BOQ-FORMAT-SPEC.md
docs/design/boq-format/pdfmake-skeleton.js
docs/design/boq-format/reference-mock.dc.html
src/assets/*.svg, *.png                  # brand logos
SM_BOQ_Manual_EN.html                    # functional spec from the user's side
src/StellaMobili_BOM_Tool_Ref.html       # the app template (~200 KB) — REFERENCE
                                         # IMPLEMENTATION of every rule in this doc:
                                         # validateGola, confirmCommit/loadVersion,
                                         # reflowSection/exportBands (groups),
                                         # buffer totals, getState()/loadFile (.smbq).
                                         # Read the JS in its single <script>; ignore
                                         # the /*__..._INJECTION__*/ build markers.
(optionally) a real .smbq sample file for importer tests
```

When the brief and the template disagree, **the template wins** — it is the shipping
code (the built tool is this file + build-time injections, nothing more).
