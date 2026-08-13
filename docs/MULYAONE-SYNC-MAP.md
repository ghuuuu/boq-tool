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
> _Last verified: 2026-08-13 — standalone **v1.6.0**, MulyaOne embed **v1.6.0**, both on
> boq-kit **1.7.0**. In sync (§7)._

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
| `/*__BRAND_ASSETS_INJECTION__*/` | `const BOQ_LOGOS={stella,mulya,stellaSvg,mulyaSvg}` (SVG + PNG) | **same** — `BOQ_LOGOS` (SVG + PNG), with a `BRAND_ASSETS` alias kept for compatibility |
| `/*__EXCELJS_INJECTION__*/`      | ExcelJS 4.4.0 (offline xlsx) | **empty** — in-tool Excel disabled |
| `/*__PDFMAKE_INJECTION__*/`      | pdfmake 0.2.10 + Roboto (offline pdf) | **empty** — in-tool PDF disabled |

✅ **Brand-assets mismatch — fixed 2026-08-13.** The embed used to inject a
differently-named/shaped `BRAND_ASSETS`, leaving `BOQ_LOGOS` undefined; harmless only
because pdfmake was empty too. `load_brand_assets_injection()` now emits the real
`BOQ_LOGOS` (PNG + SVG, same shape as the standalone) and keeps `BRAND_ASSETS` as an
alias. The trap is gone.

A **fifth marker**, `<!--__KIT_INJECTION__-->`, carries the shared chrome (boq-kit): the
self-hosted screen font, the brand `:root` from `brand.config.json`, `kit.css`, then
`kit.js` / `kit-export.js` / `bridge.js`. **Both** builds fill it — the embed's copy of the
kit is vendored at `docs/boq-handoff/kit/` next to the template.

---

## 3. Build pipelines side by side

### Standalone (this repo)
```
src/StellaMobili_BOM_Tool_Ref.html  +  src/kit/ (vendored boq-kit) + src/brand.config.json
   └─ python src/sync_kit.py     (refresh src/kit/ from C:/Projects/boq-kit)
   └─ python src/build_tool.py
        · injects price data + ExcelJS + pdfmake + BOQ_LOGOS + the kit
   → StellaMobili_BOM_Tool.html          (~6.4 MB, fully offline, double-click to run)
      python src/check_html.py            (sanity check)
```

### MulyaOne embed (`C:\Projects\MulyaOne`)
```
docs/boq-handoff/StellaMobili_BOM_Tool_Ref.html   ← COPY of this repo's template
docs/boq-handoff/kit/ + brand.config.json         ← COPY of this repo's src/kit/ + config
   └─ python scripts/build-boq-tool.py
        · injects price data (from lib/boq/price-data/*.json)
        · injects BOQ_LOGOS (PNG + SVG, from docs/boq-handoff/brand-assets/)
        · injects the kit: font + brand tokens + kit.css + kit.js/kit-export/bridge
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

## 7. Drift status (in sync as of 2026-08-13)

Standalone and the embed are both **v1.6.0** on **boq-kit 1.7.0**, and the template copies
are byte-identical. The v1.5.2 → v1.6.0 delta is the **shared-chrome migration**: the
topbar, sidebar, buttons, cards, fields, tables, modals, toasts, save status, autosave,
file save/load and the whole Revisions & Alternatives engine now come from
`boq-kit` instead of the template. Also: the Google Fonts CDN link is gone (the UI font is
self-hosted and inlined), the modal traps focus, money is never abbreviated, dates read
`01 Dec 2026`, and export filenames use `YYYYMMDD`.

> **The tripwire had failed.** Between 2026-07-30 and 2026-08-13 the two templates diverged
> substantially while **both still reported `v1.5.2`** — the chip said "in sync" when it
> wasn't. If you change the template and don't deploy in the same session, bump `#toolVer`
> anyway, or the indicator lies.

**Deploying the kit needed a build change, not just a file copy.** `scripts/build-boq-tool.py`
had never seen `<!--__KIT_INJECTION__-->`; copying the template alone would have left the
marker as a literal HTML comment and shipped an unstyled tool with no `KIT` object. The
embed's build now vendors `docs/boq-handoff/kit/` and fills that marker (§3).

**Verified on the rebuilt embed** (`lib/boq/sm-boq-tool.html`, 3.66 MB): marker consumed,
kit 1.7.0 + `BRAND` stamped, chrome styled, `KIT.started === true`, all 13 hooks
registered, no console errors. Every symbol the bridge reaches into resolves —
`getState`, `applyLoadedState`, `saveFile`, `confirmCommit`, `getActiveAlt`, `toast`,
`updateRevPill`, `updateDirtyIndicator`, plus `activeVerNum` / `_commit` / `dirty` /
`fileUnsaved` — even though they now live in `kit.js` rather than the template; they are
still top-level in the same shared global scope. `#projName/#projClient/#projPIC/#projNotes`
all present for the field lock. ExcelJS and pdfmake remain `undefined` (server-side export).
A simulated `boq:load` → `boq:request-state` round-trip returned the units **losslessly**
with `version: 3`.

> **Still to smoke-test in the real iframe** (needs the app running, not a static file):
> Build BOQ → project fields locked and filled → add items → Save Revision → reopen the
> draft → `request-state` round-trip → confirm no "Recover unsaved work?" modal leaks
> across projects (§10.2 — the autosave key is still global, `smboq_autosave`).

## 8. "Deploy to MulyaOne" — the playbook

**Trigger:** when the user says *"deploy to MulyaOne"*, run this end-to-end (nothing is
automatic — the two repos are only linked by this procedure). Target model = §10.

```bash
# 0. Make sure the standalone is on the kit you intend to ship
cd "C:/Projects/sm-boq-tool" && python src/sync_kit.py && python src/build_tool.py

# 1. Copy the updated template into MulyaOne — AND the kit it now depends on
cp "C:/Projects/sm-boq-tool/src/StellaMobili_BOM_Tool_Ref.html" \
   "C:/Projects/MulyaOne/docs/boq-handoff/StellaMobili_BOM_Tool_Ref.html"
cp "C:/Projects/sm-boq-tool/src/brand.config.json" \
   "C:/Projects/MulyaOne/docs/boq-handoff/brand.config.json"
rm -rf "C:/Projects/MulyaOne/docs/boq-handoff/kit"
cp -r "C:/Projects/sm-boq-tool/src/kit" "C:/Projects/MulyaOne/docs/boq-handoff/kit"
rm -f "C:/Projects/MulyaOne/docs/boq-handoff/kit/.kit-source" \
      "C:/Projects/MulyaOne/docs/boq-handoff/kit/.kit-manifest.json"

# 2. If price lists changed, copy those too (MulyaOne keeps its own copy)
cp "C:/Projects/sm-boq-tool/price-data/price_lists/"*.json \
   "C:/Projects/MulyaOne/lib/boq/price-data/"
#    …and reseed SmPriceList if the price-list version changed.

# 3. Rebuild the embed
cd "C:/Projects/MulyaOne" && python scripts/build-boq-tool.py   # → lib/boq/sm-boq-tool.html
```

Then work through this checklist in the MulyaOne repo:

0. **Kit version.** `docs/boq-handoff/kit/KIT_VERSION` must match `src/kit/KIT_VERSION` in
   the SM repo. The embed stamps it as `KIT_VERSION` alongside `#toolVer` — two chips,
   two tripwires.
1. **Bridge symbols (§4).** Did the change rename anything the bridge reaches into
   (`getState`, `applyLoadedState`, `confirmCommit`, `saveFile`, `toast`, the `#proj*` ids,
   `fileUnsaved`/`dirty`/`_commit`/`activeVerNum`)? If so, update the `BRIDGE` constant in
   `scripts/build-boq-tool.py`. Under the §10 model the bridge is thinner, but the
   **messaging** symbols (`getState`/`applyLoadedState`) stay coupled — always re-check.
2. **State shape.** New fields on units/rows/alts? Check `boqUnitSchema` passthrough in
   `lib/boq.ts`, the `snapshot` round-trip, and `ImportSmbqButton.tsx`. New `.smbq` behavior
   → also update [`MULYAONE-BOQ-HANDOFF.md`](MULYAONE-BOQ-HANDOFF.md).
3. **Exports.** If in-tool Excel/PDF changed, mirror it in `lib/pdf/templates/boq.tsx` /
   `boq-excel.ts` (the embed exports server-side, not via the tool).
4. **Version + drift.** Bump the embed's `#toolVer` to match; update the drift line in §7 and
   `EMBEDDED-TOOL-CHANGES.md`.
5. **Smoke-test in the iframe:** open **Build BOQ** (blank, project fields locked & filled) →
   add items → Save Revision → reopen the **draft** (loads saved state) → `request-state`
   round-trip. Confirm no "Recover unsaved work?" modal leaks across projects (§10).

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

## 10. Agreed working model (decided 2026-07-29)

The user develops the tool **standalone in this repo**, then says *"deploy to MulyaOne"* to
port it (§8). Two decisions define how the two versions differ:

### 10.1 The `EMBEDDED` flag lives in the template
Rather than injecting every behavioral difference through the bridge, the **template detects
when it's embedded** (`window.parent !== window`, or a build-set flag) via a single
`EMBEDDED` const, and **self-adjusts natively**. The bridge (`build-boq-tool.py`) shrinks to
just the postMessage messaging (§4). Benefits: no silent break when internal symbols are
renamed, and internal-only features (e.g. per-version delete via `renderRevisionsPanel`)
become reachable. The standalone carries this embed code but it's **inert** when
`EMBEDDED === false`.

Behavior gated by `EMBEDDED` (all no-ops in the standalone):

| Behavior | Standalone (`EMBEDDED=false`) | Embed (`EMBEDDED=true`) |
|---|---|---|
| Project / client / PIC fields | editable manual input | read-only, filled from `boq:load` (MulyaOne project) |
| Project **notes** | editable | editable (stays) |
| Persistence | `.smbq` file save/load + localStorage autosave | DB via host (Save Revision / Send to Sales); file-save UI hidden |
| `beforeunload` "unsaved file" warning | on | off (DB is truth) |
| In-tool Excel/PDF export UI | on (libs embedded) | hidden (server-side export) |
| Autosave scope | single global localStorage key | **per project+set** (§10.2) |

> When adding a **new** difference, prefer an `EMBEDDED` branch in the template over a new
> bridge wrap — keep the bridge to pure messaging.

### 10.2 Autosave is per-project-scoped in the embed
The current global `smboq_autosave` key can offer one project's draft inside another
project's BOQ. Target: in the embed, key the autosave/restore by **project + set** (the host
passes an identifier via `boq:load`), so a restore can only ever surface *this* BOQ's draft;
in the standalone, autosave is unchanged. Alternatively the host can hand the tool the id it
should scope to. Until built, treat the global-key restore as a known embed risk.

### 10.3 What is *not* the tool's job (stays host-side)
"Build BOQ = blank" (`?new`), "open draft = load saved" (`?set=N`), multiple BOQs per project
("sets"), DB revisions, BOQ numbering, quotations, roles, notifications, server exports —
these are **MulyaOne host + model** concerns and need no tool change. The tool just has to
(a) accept a full state via `boq:load` and start blank when sent an empty one, and (b) hand
back its full state via `getState()` on `boq:request-state`. Keep those two contracts stable.

---

*© 2026 PT. Mitra Usaha Lancar Jaya · Internal tooling · Stella Mobili BOQ*
