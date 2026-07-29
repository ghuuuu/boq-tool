# SM BOQ Tool ↔ MulyaOne — Sync Map & Difference Guide

> **Purpose.** There are **two live deployments of one codebase**: the standalone
> `.html` tool (this repo) and the copy embedded inside MulyaOne. This doc explains
> how they differ, how they connect, and — most importantly — **when a change to one
> must be ported to the other, and how.** Read it before/after any UI or logic change
> so the two don't silently drift.
>
> Companion docs: [`MULYAONE-BOQ-HANDOFF.md`](MULYAONE-BOQ-HANDOFF.md) (the data/format
> contract) and, in the MulyaOne repo, `docs/boq-handoff/EMBEDDED-TOOL-CHANGES.md`
> (tool-side tweaks made only in the embed) + `docs/design/10-sm-boq.md` (the module design).
>
> _Last verified: 2026-07-29 — standalone **v1.5.2**, MulyaOne embed **v1.5.1** (drifted; see §7)._

---

## 1. TL;DR

- **Same source, two builds.** Both the standalone tool and the MulyaOne embed are built
  from **the same template**, `src/StellaMobili_BOM_Tool_Ref.html`. MulyaOne keeps its own
  **copy** of that template and runs a **different build script** that injects a
  **postMessage bridge** instead of the Excel/PDF libraries.
- **MulyaOne does not re-implement the tool.** (The original handoff plan called for a
  native React port — that is *Phase 2*, not yet built.) Today MulyaOne runs the real tool
  **inside an iframe** and talks to it over `postMessage`.
- **Therefore:** almost any change you make to `_Ref.html` (UI, logic, `.smbq` format,
  add-bar, tables, revisions panel…) needs to be **copied into MulyaOne and rebuilt** to
  keep the embed current. A handful of things are host-only or standalone-only — see §5.
- **The bridge couples to internal tool symbols** (`getState`, `applyLoadedState`,
  `confirmCommit`, `saveFile`, `#projName/#projClient/#projPIC`, `fileUnsaved`, `_commit`,
  `activeVerNum`, …). **Renaming any of these silently breaks the embed** — see §4.

---

## 2. The one source of truth

```
src/StellaMobili_BOM_Tool_Ref.html      ← THE TEMPLATE. Edit only this.
```

Everything else is generated from it. Both deployments consume it via a build step that
replaces the four injection markers it contains:

| Marker in the template | Standalone build fills with | MulyaOne build fills with |
|---|---|---|
| `/*__PRICE_DATA_INJECTION__*/`   | `ALL_PRICE_DATA` + `PRICE_LIST_LATEST/VERSIONS` | same (from its own copy of the JSONs) |
| `/*__BRAND_ASSETS_INJECTION__*/` | `const BOQ_LOGOS={stella,mulya,stellaSvg,mulyaSvg}` (SVG + PNG) | `const BRAND_ASSETS={mulya,stellaMobili}` (PNG only) ⚠️ |
| `/*__EXCELJS_INJECTION__*/`      | ExcelJS 4.4.0 (offline xlsx) | **empty** — in-tool Excel disabled |
| `/*__PDFMAKE_INJECTION__*/`      | pdfmake 0.2.10 + Roboto (offline pdf) | **empty** — in-tool PDF disabled |

⚠️ **Brand-assets contract mismatch (known):** the template's PDF code reads
`BOQ_LOGOS.stella/.mulya/.stellaSvg/.mulyaSvg`, but the MulyaOne build injects a
differently-named/shaped const (`BRAND_ASSETS`). In the embed `BOQ_LOGOS` is therefore
**undefined** — which is harmless *only because* pdfmake is also left empty, so the tool's
own PDF path never runs (MulyaOne exports server-side instead, §6). If you ever wire the
embed to use the tool's own PDF/logos, this must be reconciled first.

---

## 3. Build pipelines side by side

### Standalone (this repo)
```
src/StellaMobili_BOM_Tool_Ref.html
   └─ python src/build_tool.py
        · injects price data + ExcelJS + pdfmake + BOQ_LOGOS
   → StellaMobili_BOM_Tool.html          (~6.4 MB, fully offline, double-click to run)
      python src/check_html.py            (sanity check)
```

### MulyaOne embed (`C:\Projects\MulyaOne`)
```
docs/boq-handoff/StellaMobili_BOM_Tool_Ref.html   ← COPY of this repo's template
   └─ python scripts/build-boq-tool.py
        · injects price data (from lib/boq/price-data/*.json)
        · injects BRAND_ASSETS (PNG only, from docs/boq-handoff/brand-assets/)
        · leaves ExcelJS/pdfmake markers EMPTY
        · appends the postMessage BRIDGE before the final </script>
   → lib/boq/sm-boq-tool.html            (~3.2 MB)
      served by GET /api/boq/sm-tool (auth-gated) → iframed in the BOQ workspace
```

The bridge block is defined inline in `scripts/build-boq-tool.py` (constant `BRIDGE`), **not**
in the template — so the template stays identical between the two repos except for whatever
version drift exists at the time.

---

## 4. How they connect — the postMessage bridge

The embed and the MulyaOne page are **same-origin**; they talk over `window.postMessage`.
Host wrapper: `components/boq/SmBoqWorkspace.tsx`. Bridge (iframe side): injected by
`scripts/build-boq-tool.py`.

### Protocol

| Direction | Message | Meaning |
|---|---|---|
| iframe → parent | `boq:ready` | Tool loaded; parent may send state |
| parent → iframe | `boq:hello` | Re-ping until ready (mount-order race guard) |
| parent → iframe | `boq:load` `{payload}` | Restore a saved revision / pre-fill project (`.smbq` shape) |
| parent → iframe | `boq:request-state` `{requestId}` | Ask the tool for its full state |
| iframe → parent | `boq:state` `{payload,requestId}` | Reply = `getState()` (full `.smbq` v3) |
| parent → iframe | `boq:saved` `{revisionNumber}` | Update the tool's rev pill + clear dirty |
| parent → iframe | `boq:save-smbq` | Trigger the tool's native `saveFile()` (backup) |

### Tool symbols the bridge depends on — **do not rename without updating the bridge**

The bridge reaches into the tool's global scope. These names are a **de-facto API**:

| Symbol | Used by bridge for | Present in template ✓ |
|---|---|---|
| `getState()` | serialize full state on `boq:request-state` | ✓ |
| `applyLoadedState(st)` | apply `boq:load` payload | ✓ |
| `saveFile()` | `boq:save-smbq` backup button | ✓ |
| `confirmCommit()` | wrapped to lock a "Ready" alt (#33) | ✓ |
| `getActiveAlt()`, `activeVerNum`, `_commit` | the #33 guard logic | ✓ |
| `revisionNumber`, `updateRevPill()`, `dirty`, `updateDirtyIndicator()`, `fileUnsaved` | `boq:saved` handling | ✓ |
| `toast(msg,type)` | user feedback | ✓ |
| `#projName`, `#projClient`, `#projPIC`, `#projNotes` (element IDs) | lock CRM-owned fields (#30) | ✓ |

> If a refactor renames one of these (e.g. `getState` → `serializeState`, or the `#projName`
> input id), the standalone still works but **the embed breaks silently** — add the change to
> `scripts/build-boq-tool.py`'s bridge at the same time. `updateSaveStatus` is the current
> name; `updateDirtyIndicator`/`updateRevPill` are kept as **legacy aliases** partly so the
> bridge keeps working — keep them.

---

## 5. What's different — the three buckets

### Bucket A — Shared (the whole template body)
Everything in `_Ref.html`: all views, add bars, tables, item groups, buffer rows, handle
variants, the Revisions & Alternatives panel, `.smbq` save/load, autosave, drag-drop load,
qty handling, toasts, modals, CSS. **This is the bulk of the code and it must stay in sync.**
A change here is a change to *both* products.

### Bucket B — MulyaOne-only (host + bridge) — **never port back to standalone**
Lives in the MulyaOne repo, not in the template:

- **The bridge block** (`scripts/build-boq-tool.py` `BRIDGE`): neutralizes the beforeunload
  warning; locks `#projName/#projClient/#projPIC` (`MutationObserver`, #30); wraps
  `confirmCommit` to block saving a new version over a "Ready" alternative (#33); handles
  `boq:save-smbq` (#34).
- **The React host** `components/boq/SmBoqWorkspace.tsx` — iframe, Save Revision / Send to
  Sales, set switcher, Start-new-BOQ.
- **BOQ sets, DB persistence, quotation flow, server-side PDF/Excel export, access control,
  price-list Settings** — see §6. None of this exists in the standalone tool by design
  ("Do not add server-side features to the standalone HTML tool" — CLAUDE.md).

### Bucket C — Standalone-only / reserved-for-standalone
- **In-tool Excel + PDF export** (ExcelJS + pdfmake embedded). Disabled in the embed; MulyaOne
  exports server-side instead.
- **`.smbq` disk save/load, autosave, drag-drop-to-load, beforeunload warning.** Still present
  in the embed's code but mostly inert / neutralized — the DB is the source of truth there.
  (`.smbq` files still matter as the **import** path: `ImportSmbqButton.tsx`.)
- **Per-version delete (#31/#32).** Deliberately *not* injected into the embed — it needs to
  edit `renderRevisionsPanel`, which the bridge can't intercept. It is **the standalone's job
  to implement natively**; it then round-trips into MulyaOne losslessly via the `.smbq`
  snapshot. (See `EMBEDDED-TOOL-CHANGES.md` §"Still to do".)

---

## 6. How the tool plugs into the wider MulyaOne system

Context you'll want when changing anything that touches state shape or totals. Authoritative
detail: `MulyaOne/docs/design/10-sm-boq.md`.

- **Where it lives.** BOQ hangs off `Project → BrandLane(SM)`. Workspace route:
  `/projects/[id]/lanes/[laneId]/boq` (the iframe). Review: `…/boqs`.
- **Persistence.** Each save = a `BoqRevision` row (immutable). It stores `units` (the
  quotable working calc, showroom prices) **and** `snapshot Json` = the **full `.smbq` v3
  state from `getState()`** (units + `alts`/`activeAltKey`/`activeVerNum` + groups + buffer),
  so the whole alternatives/versions tree round-trips losslessly. The workspace reloads from
  `snapshot` (falls back to units-only for old rows).
- **BOQ "sets".** A lane can hold several independent BOQs; each set = one whole `.smbq`.
  Purely a host/model concept — **no tool change**. `setNumber` + numbering
  `BOQ-SM-YY-###[-{alt}]-v{n}` owned by `lib/boq.ts`, never the tool.
- **alts → rows.** On Send-to-Sales the host decomposes `snapshot.alts` into one COMPLETED
  `BoqRevision` per alternative (`buildBoqDecomposition`).
- **Pricing / roles.** Tool only ever shows **showroom** prices. Selling price, discounts
  (20%+5% tiered), and the floor are computed server-side (`/api/pricing/quotations/from-boq`)
  and never appear in the tool. PIC/Director/Ops can view BOQs; Sales cannot open the tool.
- **Server exports.** MulyaOne renders BOQ **PDF** (`lib/pdf/templates/boq.tsx`) and **Excel**
  (`lib/pdf/templates/boq-excel.ts`) itself, per `BOQ-FORMAT-SPEC.md` — that's why the embed
  doesn't need the tool's own exporters.
- **Price data.** Standalone reads `price-data/price_lists/*.json`. MulyaOne reads
  `lib/boq/price-data/*.json` (baked into the embed at build) **and** seeds a `SmPriceList`
  table (used by Factory Orders). Two copies of the JSONs — keep both current.
- **Importer.** `components/boq/ImportSmbqButton.tsx` accepts a `.smbq` produced by the
  standalone tool and files it as the next set — so the standalone's save format is a live
  contract (see the handoff doc §5).

---

## 7. Current drift (as of 2026-07-29)

Standalone is **v1.5.2**; the embed's template copy is **v1.5.1**. Two standalone changes are
**not yet ported** to MulyaOne:

1. **Qty 0 allowed** (`d226b25`, v1.5.2) — `min="0"`, `normQty()`, `warnZeroQty()`, the
   `row-zero`/`QTY 0` markers, `updateQty`/`addRow`/`confirmCustom` all changed. The embed
   still has the old `min="0.1"` / `Math.max(0.1, …)` logic.
2. **Drag & drop a `.smbq` anywhere to load** (`50717c4`) — the `#dropZone` overlay + CSS +
   handlers. Absent from the embed. (Low value in the embed — DB is the source of truth — but
   it keeps the templates identical.)

Neither breaks the embed; they're just missing features. Resync when convenient (§8).

> **Rule of thumb:** the tool-version chip is the drift tripwire. If `#toolVer` differs
> between `src/StellaMobili_BOM_Tool_Ref.html` and
> `MulyaOne/docs/boq-handoff/StellaMobili_BOM_Tool_Ref.html`, the embed is behind.

---

## 8. Resync procedure (standalone → MulyaOne)

When a template change should reach the embed:

```bash
# 1. Copy the updated template into MulyaOne
cp "C:/Projects/SM BOQ Tool/src/StellaMobili_BOM_Tool_Ref.html" \
   "C:/Projects/MulyaOne/docs/boq-handoff/StellaMobili_BOM_Tool_Ref.html"

# 2. If price lists changed, copy those too (MulyaOne keeps its own copy)
cp "C:/Projects/SM BOQ Tool/price-data/price_lists/"*.json \
   "C:/Projects/MulyaOne/lib/boq/price-data/"
#    …and reseed SmPriceList if the price-list version changed.

# 3. Rebuild the embed
cd "C:/Projects/MulyaOne" && python scripts/build-boq-tool.py   # → lib/boq/sm-boq-tool.html
```

Then, in MulyaOne: **check the bridge still lines up** — did the change rename any symbol in
§4, or alter `getState()`/`applyLoadedState()`/the project-field ids? If so, update the
`BRIDGE` constant in `scripts/build-boq-tool.py` and rebuild. Smoke-test in the iframe
(load → edit → request-state round-trip). Keep `EMBEDDED-TOOL-CHANGES.md` accurate if the
embed-only behavior changes.

---

## 9. Decision guide — "I changed X. Where does it go?"

| What you changed | Standalone | MulyaOne embed | Notes |
|---|---|---|---|
| Add-bar / table / view UI, styling | edit `_Ref.html` + `build_tool.py` | copy template + `build-boq-tool.py` (§8) | Bucket A |
| Item groups / buffer / handle-variant logic | ✅ template | ✅ resync | Bucket A — also check `boqUnitSchema` passthrough in MulyaOne if fields change |
| **`.smbq` format / `getState()` / `applyLoadedState()`** | ✅ template | ✅ resync **+ bridge check** | May also need the MulyaOne importer + `snapshot` handling to change — ping the handoff doc |
| Rename an internal fn/var or a `#proj*` id | ✅ template | ✅ resync **+ update bridge** | §4 — silent-break risk |
| New price list version | drop JSONs + rebuild | copy JSONs + rebuild + reseed `SmPriceList` | two JSON copies |
| In-tool Excel/PDF export tweak | ✅ template | ❌ (embed uses server export) | change `lib/pdf/templates/boq*.ts?x` in MulyaOne instead |
| Per-version delete (#31/#32) | ✅ implement natively | inherited via resync | Bucket C — reserved for standalone |
| Locked project fields / Ready-lock / Send-to-Sales | ❌ | MulyaOne bridge/host only | Bucket B — never add to standalone |
| BOQ sets, DB, quotations, roles, numbering | ❌ | MulyaOne only | Bucket B — server-side by design |

---

*© 2026 PT. Mitra Usaha Lancar Jaya · Internal tooling · Stella Mobili BOQ*
