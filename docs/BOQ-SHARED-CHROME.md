# BOQ Tools — Shared Chrome Spec & Kit Plan

> **Purpose.** Mulya runs several standalone BOQ tools, one per brand (Stella Mobili,
> CDN Lighting, Beyond Teak, more to come). They are forks of a common ancestor and have
> drifted. This document defines **what must look and behave identically across all of
> them**, **what stays brand-specific by design**, and **how one copy of the shared code
> physically reaches every repo** (the `boq-kit` vendoring model).
>
> Companion docs: [`MULYAONE-SYNC-MAP.md`](MULYAONE-SYNC-MAP.md) (SM ↔ MulyaOne embed) ·
> [`MULYAONE-BOQ-HANDOFF.md`](MULYAONE-BOQ-HANDOFF.md) (data/format contract) ·
> [`design/boq-format/BOQ-FORMAT-SPEC.md`](design/boq-format/BOQ-FORMAT-SPEC.md) (print design).
>
> _Status: **Phase 0 complete** (2026-08-13). `boq-kit` exists at `C:/Projects/boq-kit`
> (kit 1.2.0) and SM builds from it — shared chrome CSS **and** chrome JS. Phase 1 (ERP
> envelope + `EMBEDDED`) and the CL/BT rollouts are still to do — see §11._

---

## 1. Decisions this document implements

Agreed with the user before drafting:

1. **Canonical chrome = Stella Mobili**, plus **Beyond Teak's motion/a11y tokens** and
   **CDN Lighting's self-hosted screen font**. Each tool's *item-entry core* is untouched.
2. **Sharing mechanism = vendored kit + sync script** (option B): one master `boq-kit`
   repo, a copy vendored into each tool, refreshed by a script, inlined at build.
3. **Revisions & Alternatives + autosave are core BOQ needs** — every brand tool gets them.
4. **Accents derived from each brand's logo** (§7).

---

## 2. The three tools today

All three already share the same skeleton — `.topbar` / `.shell` / `.sidebar` /
`.topbar-actions` and the token names `--accent`, `--ink`, `--panel`, `--line`, `--brass`,
`--gold`, `--good`, `--danger`, `--on-accent`, `--font-num`. **All three also already have
the same build pipeline** (`src/<Brand>_Ref.html` + `build_tool.py` + `check_html.py` +
`src/vendor/`), so the kit has somewhere to be injected in every repo. BT's pipeline is the
most developed of the three (six markers, including `__PROFILE_ART_INJECTION__` for its
DXF-derived SVGs and `__SCREEN_FONT_INJECTION__` for the self-hosted UI font).

| | **SM** Stella Mobili | **CL** CDN Lighting | **BT** Beyond Teak |
|---|---|---|---|
| Repo | `SM-BOQ-Tool` | `CL-BOQ-Tool` | `BT-BOQ-Tool` |
| Tool version | v1.5.2 | v1.0.0 | v1.2.0 |
| Template size | ~200 KB | ~103 KB | ~126 KB |
| Injection markers | 4 | 5 (+`SCREEN_FONT`) | 6 (+`SCREEN_FONT`, `PROFILE_ART`) |
| Domain object | `units` (rooms) | `state.areas` | `state.areas` |
| Save file | `.smbq` **v3** | `.clbq` fmt 1 | `.btbq` fmt 1 |
| Restore fn | `applyLoadedState()` | `applyLoaded()` | `applyLoaded()` |
| `getState()` | ✅ | ❌ | ❌ |
| Revisions & Alternatives | ✅ | ❌ | ❌ |
| Autosave + recover | ✅ | ❌ | ❌ |
| Drag-drop file load | ✅ | ❌ | ❌ |
| Native Save As picker | ✅ | ❌ | ❌ |
| Sidebar drag-resize | ✅ | ❌ | ❌ |
| Item groups / buffer rows | ✅ | ❌ | ❌ |
| Price-list versioning | ✅ | ❌ | ✅ (`PL_VERSION`) |
| Motion tokens (`--dur-*`, `--ease-*`) | ❌ | ❌ | ✅ |
| `:focus-visible`, `aria-modal`, reduced-motion | ❌ | ❌ | ✅ |
| Self-hosted screen font | ❌ (Google CDN) | ✅ | ✅ |
| Excel + PDF export | ✅ | ✅ | ✅ |
| MulyaOne embed | live | — | — |

Two findings worth acting on regardless of the kit:

- **SM still loads fonts from the Google CDN** — its typography is not truly offline,
  unlike CL and BT. The kit fixes this for everyone (`__SCREEN_FONT_INJECTION__`).
- **BT's current accent `#5E8C3C` fails WCAG AA** for white button text (3.97:1). §7 fixes it.

---

## 3. The boundary

### 3.1 Shared — "the chrome" (goes in the kit)

Identical in every tool, brand-varied only through CSS custom properties:

- **Topbar** — brand mark, breadcrumb, save-status chip, tool-version chip, price-list chip,
  icon action row, "Unsaved edits" indicator.
- **Sidebar** — frame, nav list, collapse-to-rail, drag-resize (persisted width), mobile
  slide-in overlay. *(Which entries it lists is per-brand — see §3.2.)*
- **Component CSS** — `.card`, `.btn` family, `.input`/`.select`/`.field`, `.tabs`,
  tables (head/body/foot), `.stat`, `.tag`, `.modal`, `.toast`, `.search-results`,
  empty states, `.sel-bar`.
- **Design tokens** — the full token set incl. **BT's motion tokens** (`--dur-*`, `--ease-*`,
  `--radius-*`) and **BT's a11y pass** (`:focus-visible` rings, `aria-modal` dialogs,
  `prefers-reduced-motion`).
- **Behaviour** — `toast()`, `showModal()`/`closeModal()`, save-status state machine
  (`markDirty` → `updateSaveStatus` → autosave → saved), `beforeunload` guard,
  drag-drop file load, native Save As (`pickSaveHandle`/`writePicked`), autosave +
  recover-unsaved-work modal, keyboard/focus handling.
- **Revisions & Alternatives** — the alts/versions tree, commit rules (draft-in-place vs
  new version vs supersede), per-version dates, the panel UI, `loadVersion`.
- **Save/load envelope** — the outer file shape, version field, backward-compat loader
  contract (§6).
- **Export chrome** — letterhead (brand logo left / MULYA right), meta band, page furniture,
  fonts and print tokens per `BOQ-FORMAT-SPEC.md`, export-set picker, buffer chooser,
  filename convention.
- **ERP bridge** — `getState()` / `applyLoadedState()` / postMessage / `EMBEDDED` (§6).

### 3.2 Per-brand — "the core" (never touched by the kit)

This is the part that differs for a reason. **The kit must not constrain it.**

- The **add bar and item pickers**, category taxonomy, search/filter behaviour.
- **Validation rules** — SM's `validateGola`, BT's profile/finish-side selector and
  per-metre length/capping, CL's spec composer.
- **Price-data shape**, price-list versioning, settings-based price editing.
- **Row fields and totals semantics** (SM's groups/buffer, BT's per-metre maths).
- **Brand-specific data injections** — BT's `__PROFILE_ART_INJECTION__` (DXF-derived SVG).
- **Nav/view structure** — SM has three views (Overview / Totals / per-Unit); CL and BT are
  area-based single-view. The sidebar *frame* is shared; its *contents* are not.
- **Domain vocabulary** — "unit" (SM, a room) vs "area" (CL/BT). Not worth forcing.

### 3.3 Resolved grey zone

Per decision #3, **Revisions & Alternatives and autosave are chrome, not SM features** — CL
and BT get them. Item **groups** and **buffer rows** stay SM-only for now: they change the
row model and the export band structure, so they'd be per-brand opt-ins if wanted later
(the kit's export builder should be written to *allow* bands, not require them).

---

## 4. The kit

### 4.1 Master repo

```
boq-kit/                          ← new private repo, no brand owns it
  KIT_VERSION                     # e.g. 1.0.0 — single line, read by every build
  kit.css                         # tokens + all chrome CSS (brand values come from config)
  kit.js                          # toast, modal, save-status, autosave, sidebar,
                                  #   drag-drop, Save As, revisions panel + commit rules
  kit-export.js                   # letterhead / meta band / page furniture / export picker
  bridge.js                       # getState envelope, applyLoadedState, postMessage, EMBEDDED
  fonts/                          # Hanken Grotesk woff2 (screen) + Libre TTFs (print)
  brand.schema.json               # validates each tool's brand.config.json
  CHANGELOG.md
  README.md                       # what belongs in the kit and what doesn't
```

### 4.2 In each tool repo

```
src/kit/                          ← VENDORED COPY of boq-kit (git-tracked, never hand-edited)
src/brand.config.json             ← this tool's brand values (the only per-brand styling file)
src/sync_kit.py                   ← refreshes src/kit/ from the master repo
src/<Brand>_Tool_Ref.html         ← template; gains /*__KIT_INJECTION__*/
src/build_tool.py                 ← gains: inline kit.css/kit.js/kit-export.js/bridge.js,
                                  #        apply brand.config.json, stamp KIT_VERSION
```

`src/kit/` is committed. That means every tool repo is still **self-contained and
buildable offline**, and `git log` in each repo shows exactly when the chrome changed.

### 4.3 `brand.config.json`

```jsonc
{
  "brandKey": "SM",                          // SM | CL | BT — also the ERP envelope tag
  "brandName": "Stella Mobili",
  "toolName": "BOQ Tool",
  "fileExt": ".smbq",                        // .clbq | .btbq
  "docPrefix": "BOQ-SM",                     // → BOQ-SM-YY-###-v{n}
  "logo": { "svg": "assets/stella-mobili-logo.svg",
            "png": "assets/stella-mobili-logo.png" },
  "palette": {                               // injected as :root custom properties
    "bg": "#F1ECE1", "panel": "#FBF9F4", "panel2": "#FFFFFF",
    "ink": "#26221B", "ink2": "#7A7264", "line": "#E4DCCC", "lineSoft": "#EFE9DC",
    "accent": "#8A5A3B", "accentDeep": "#79492F", "onAccent": "#FFFFFF",
    "brand": "#8A5A3B", "brass": "#A6803E", "sidebar": "#26221B", "sidebarInk": "#B4ADA2",
    "scale": { "50": "…", "100": "…", "…": "…", "900": "…" }
  }
}
```

Everything else — semantic states (`--good`, `--warn`, `--danger`, `--buffer`), shadows,
radii, motion — lives in `kit.css` and is **the same for all brands**. The print tokens in
`BOQ-FORMAT-SPEC.md` (ink `#1F1812`, brass `#8C6830`, hairline `#E6E1D8`) stay
**brand-independent**: exports look like Mulya documents regardless of which tool made them;
only the top-left logo changes.

### 4.4 The marker

One new marker in every template, next to the existing ones:

```html
<script>/*__KIT_INJECTION__*/</script>
```

`build_tool.py` replaces it with `kit.css` (in a `<style>`), the brand `:root` block built
from `brand.config.json`, then `kit.js` + `kit-export.js` + `bridge.js`, and defines
`const KIT_VERSION='x.y.z'` for the topbar chip.

---

## 5. The sync workflow

```bash
# 1. change the shared chrome once
edit boq-kit/kit.css ; bump boq-kit/KIT_VERSION ; commit + push

# 2. in each tool repo (~1 min each)
python src/sync_kit.py          # copies boq-kit → src/kit/, reports the version delta
python src/build_tool.py        # rebuilds the single-file HTML
python src/check_html.py        # sanity check
git commit -am "Kit 1.1.0: <what changed>"
```

`sync_kit.py` reads the master path from `src/kit/.kit-source` (default
`C:/Projects/boq-kit`, overridable by `--from`), refuses to overwrite if `src/kit/` has
local modifications (that would mean someone hand-edited a vendored file), and prints the
`KIT_VERSION` before/after.

**Drift tripwire:** the topbar carries a `KIT_VERSION` chip next to `#toolVer`. If two
tools show different kit versions, one is behind — the same trick that already keeps the
MulyaOne embed honest (`MULYAONE-SYNC-MAP.md` §7).

**Deliberate lag is allowed.** A tool mid-feature can stay on an older kit; the chip makes
it visible instead of silent.

---

## 6. ERP readiness (MulyaOne)

MulyaOne already embeds SM in an iframe and talks to it over `postMessage`. The other
brands must be able to plug into **the same host** without a bespoke integration each time.
The kit's `bridge.js` gives every tool the identical surface:

### 6.1 The envelope

Internals differ (`units` vs `areas`); the wrapper must not. `getState()` returns:

```jsonc
{
  "tool": "CDN Lighting BOQ",
  "brand": "CL",                 // brandKey from brand.config.json
  "envelope": 1,                 // envelope version — the kit owns this
  "format": 2,                   // the brand's own payload format version
  "project": { "name": "…", "client": "…", "pic": "…", "notes": "…" },
  "payload": { /* brand-specific: units|areas, settings, counters … */ },
  "alts": [ /* shared alternatives/versions tree */ ],
  "activeAltKey": "A", "activeVerNum": 2,
  "savedAt": "…ISO…"
}
```

`applyLoadedState(st)` accepts it, is tolerant of older `format` values, and **starts blank
when handed an empty payload**. Brands keep their own file extension (`.smbq` / `.clbq` /
`.btbq`) — the envelope inside is what the ERP reads.

### 6.2 The protocol (unchanged from the SM bridge)

`boq:ready` · `boq:hello` · `boq:load` · `boq:request-state` → `boq:state` · `boq:saved` ·
`boq:save-smbq`. Because the bridge now ships **inside** the template via the kit, the
symbols it depends on are no longer a fragile de-facto API across repos
(`MULYAONE-SYNC-MAP.md` §4) — this closes that risk for every brand at once.

### 6.3 `EMBEDDED`

The kit implements sync-map §10.1 **once, for all tools**: `EMBEDDED` (true when
`window.parent !== window` or set at build) gates read-only project fields, hidden
file-save/export UI, no `beforeunload` warning, and **per-project+set autosave keys**
(§10.2 — currently a known risk in the SM embed). Inert when `EMBEDDED === false`.

### 6.4 Host-side consequences

MulyaOne needs: one parameterized embed build instead of three, `BoqRevision` rows tagged
with `brand`, numbering generalized to `BOQ-{BRAND}-YY-###-v{n}`, and an importer that
switches on `envelope`/`brand`. None of that is the tools' job.

---

## 7. Brand palettes (derived from the logos)

Derived by sampling each brand's logo SVG, then generating a 50–900 ramp and picking the
step that passes **WCAG AA (≥4.5:1) for white text**, so primary buttons are legible.

### Stella Mobili — unchanged

Logo is a cool grey wordmark (`#9D9BB1`) — not usable as a UI accent, and SM's warm palette
is established and mirrored in the Claude Design canvas. **Keep** `--accent #8A5A3B`
(5.82:1 ✓), `--brass #A6803E`, `--sidebar #26221B`.

### Beyond Teak — logo green `#66973F`

Current `--accent #5E8C3C` is **3.97:1 — fails AA**. Proposed:

| Token | Value | Note |
|---|---|---|
| `--brand` | `#66973F` | logo green, brand mark only |
| `--accent` | `#537A33` | **5.00:1 ✓** — buttons, links |
| `--accent-deep` | `#3F5C28` | 7.57:1 — hover/press |
| scale 50→900 | `#F3F6F1` `#E5ECDF` `#D0DEC4` `#B0CC99` `#87B95F` `#66973F` `#537A33` `#3F5C28` … `#1B2216` | |

Visually near-identical to today; it just stops failing contrast.

### CDN Lighting — logo red `#E62129` + orange `#F08519`

Its current accent (`#8C6830` bronze) comes from nowhere in the brand. The catch: **logo red
sits 7° of hue from `--danger #B4483E`** — a red primary button beside a red destructive
button is a real usability problem.

**Recommended (option A):** red carries the *identity*, orange carries the *interaction*.

| Token | Value | Note |
|---|---|---|
| `--brand` | `#E62129` | logo red — brand mark, sidebar accent, rev pills |
| `--accent` | `#A3570B` | deepened logo orange, **5.35:1 ✓** — buttons, links |
| `--accent-deep` | `#7A430B` | 7.97:1 — hover/press |
| `--danger` | `#B4483E` | unchanged, stays unambiguous |
| scale 50→900 | `#F8F4EF` `#F2E6D9` `#EDD1B5` `#EAB37B` `#EC8D2D` `#C96C0D` `#A3570B` `#7A430B` … `#2A1C0F` | |

**Option B (bolder):** `--accent #C1161D` (logo red, 6.18:1 ✓) as the primary, and
destructive actions differentiated by *treatment* — ghost/outline + trash icon + confirm
modal — rather than hue. Stronger brand read, weaker affordance separation.

> Recommendation: **option A**. Both of CDN Lighting's brand colours are present, and red
> keeps meaning "careful" everywhere in the suite.

---

## 8. Migration plan

Ordered so each step ships something working. No item-entry code is touched at any point.

**Phase 0 — extract the kit (SM only).**
Create `boq-kit` from SM's chrome; add BT's motion/a11y tokens and CL's self-hosted font;
add `__KIT_INJECTION__` to SM's template; rebuild SM and verify it is functionally
unchanged (diff the built HTML, run `check_html.py`, browser smoke test). **SM must come
out byte-equivalent in behaviour** — this phase is a refactor, not a feature.

**Phase 1 — SM's ERP bridge into the kit.**
Move `getState`/`applyLoadedState` behind the envelope (§6.1), add `EMBEDDED` and
per-project autosave keys. Then deploy to MulyaOne per sync-map §8 and re-verify the embed.
`.smbq` v3 → v4 envelope, loader stays backward compatible.

**Phase 2 — CL adopts the kit.**
Palette from §7, chrome replaced, item-entry core untouched. Gains revisions/alternatives,
autosave, drag-drop, Save As, sidebar resize. `.clbq` → **format 2** with a loader that
still opens format-1 files (seed one alternative "A", no versions).

**Phase 3 — BT adopts the kit.**
Same, plus keep `__PROFILE_ART_INJECTION__` and BT's per-metre logic intact. `.btbq` →
**format 2**, same backward-compat rule. BT's a11y/motion work returns to it via the kit.

**Phase 4 — ERP onboarding for CL and BT.**
Brand-tagged envelopes, MulyaOne's parameterized embed build, importer switch.

### Compatibility promise

Existing `.clbq` / `.btbq` files staff already have **must keep opening**. Format 2 is
additive (an `alts` tree + envelope wrapper); the loader seeds defaults for anything
missing, exactly as SM's v1/v2 → v3 loader does today.

---

## 9. Risks

| Risk | Mitigation |
|---|---|
| Kit refactor silently changes SM behaviour | Phase 0 is refactor-only; diff built output + smoke test before any feature work |
| A tool hand-edits `src/kit/` and the next sync wipes it | `sync_kit.py` refuses to overwrite modified vendored files |
| Kit versions drift across repos | `KIT_VERSION` chip in the topbar; visible at a glance |
| Old `.clbq`/`.btbq` files break | Format 2 additive + backward-compatible loader (§8) |
| CL red accent collides with danger | Resolved in §7 (option A) |
| Kit grows to swallow brand logic | `boq-kit/README.md` states the §3 boundary; anything touching item entry, pricing or taxonomy is rejected |
| Three rebuilds per chrome change | Accepted cost of option B; ~1 min per tool |

---

## 10. Open questions for the user

1. **CL accent** — option A (orange interaction, red identity) or option B (red primary)?
2. **`boq-kit` repo** — new private GitHub repo, or a folder inside one of the existing
   repos? (Recommendation: its own repo, so no brand owns the shared code.)
3. **Item groups / buffer rows** — SM-only for now, or should CL/BT get them too?
4. **Tool versions** — after adopting the kit, CL and BT gain a lot. Bump them to
   v2.0.0, or continue their own numbering?

---

## 11. Where things stand (2026-08-13)

### Done — kit 1.1.0, SM building from it

- **`C:/Projects/boq-kit`** created (local git repo, not pushed): `KIT_VERSION`, `kit.css`,
  `kit.js` / `kit-export.js` / `bridge.js` (headers only so far), `brand.schema.json`,
  `fonts/HankenGrotesk-Latin.woff2`, README (the §3 boundary) and CHANGELOG.
- **`kit.css`** holds the shared tokens (semantic states, elevation, radii, BT's motion
  scale), the base reset, the `:focus-visible` ring, a `prefers-reduced-motion` block, and
  **the whole chrome**: topbar, shell, sidebar (collapse rail, drag-resize, flyout, tooltip),
  main, buttons, cards, fields + qty stepper, tabs, search dropdown, item table, stat row,
  totals matrix, modal, toast + drop-a-file overlay, empty state, helpers, selection bar,
  row selection/drag-reorder, field validation, export chooser, responsive.
- SM's `--pu-*` scale became the brand-neutral **`--c-*`** inside the kit; the build still
  emits `--pu-*` as SM's legacy alias (`"scaleAlias": "pu"`), which is why nothing broke.
- **SM wired**: `src/brand.config.json`, `src/sync_kit.py`, `src/kit/` (vendored),
  `<!--__KIT_INJECTION__-->` in the template, kit injection in `build_tool.py`.
- **Google Fonts link removed** — Hanken Grotesk is now self-hosted and inlined. `Newsreader`
  and `IBM Plex Mono` were in the `<link>` but used by no rule; dropping them changed nothing.
- SM's template `<style>` is down to **72 brand-specific rules** (add bar, handle buttons,
  columns, buffer/qty-0 markers, finish editor, groups, category pills, price-list chip).

**Verification.** Rule-level diff of the pre-refactor CSS against kit + template:
0 selectors lost, 0 rule bodies changed. Body of the built HTML byte-identical after
Phase 0a. Rendered in Chrome: overview, unit view, search dropdown, add-item flow,
item table, selection bar, autosave chip and the recover-unsaved-work modal all correct;
no console errors.

### Done — kit 1.2.0, chrome JS

`kit.js` now carries the chrome behaviour: helpers (`el`/`fmt`/`fmtNum`/`fmtShort`/
`fmtDate`/`esc`/`escAttr`/`openManual`), `showModal`/`closeModal`, `toast`, the
save-status machine, autosave + recover + `beforeunload`, native Save As, file load +
drag-and-drop, the sidebar (drawer/collapse/resize) and the qty stepper. The kit **owns**
`dirty` and `fileUnsaved`; brand code still assigns them freely.

**The hook interface** is what keeps SM's domain out of the kit:

```js
KIT.register({ getState, applyLoadedState, fileBaseName,
               stateHasContent, stateSummary, onSidebarToggle, manualUrl });
KIT.start();     // last line of INIT — sidebar, drag-drop, autosave loop, recover offer
```

`showModal` gained `role="dialog" aria-modal="true"` and focuses the dialog on open (the
dialog itself, not its first field, so it never steals the caret mid-typing).
`brand.config.json` gained optional `autosaveKey`, set to `smboq_autosave` for SM so an
in-progress recovery survives the migration.

**Verification.** `node --check` over the concatenated kit + app scripts (which is how the
browser sees them — one shared global lexical scope) proves there are no duplicate
`let`/`const` declarations. In Chrome: hooks registered, save-status transitions
Saved → Unsaved edits, modal role/focus/close, toast, sidebar collapse + resize, drop-zone
overlay, and a full autosave round-trip — seed → reload → recover modal with the right
summary → Restore → project name, both units, the item, dirty flags, breadcrumb and
sidebar all correct. No console errors.

SM's template is down from 3,244 to 2,628 lines.

### Done — kit 1.3.0, Revisions & Alternatives

The whole engine now lives in the kit: the alts/versions tree, the commit rules, the
no-buffer gate, `loadVersion`, `selectAlt`, `toggleReady`, `deleteAlt` (with re-lettering
and fallback), `renameAlt`/`editAltName`, `renderRevisionsPanel`, and the per-version
quotation-date editor. The kit owns `alts`, `activeAltKey`, `activeVerNum` and `_commit` —
all still globals, so the MulyaOne bridge keeps finding them by name (§4).

Six more hooks carry the domain across: `snapshot` (what a version captures),
`restoreSnapshot` (put it back + repaint), `stats` (total / counts / price list for the
version cards), `bufferTotal` (`null` = the brand has no buffer concept, gate skipped),
`repaint`, `syncMeta`. `BRAND.unitNoun` (default "unit") lets area-based tools read
naturally, and the panel's "travels inside the .smbq file" line comes from `BRAND.fileExt`.

**Verification** — every commit rule exercised in the live tool, all assertions green:
draft saved → **updates in place** (still one version, note and total replaced) → marked
Ready → next save creates **v2** and marks v1 **Superseded**, `versions[0]` always newest.
Then: `loadVersion` restoring an older snapshot through the hook (qty 7 → 5 → 7) with the
"viewing older version" banner, the no-buffer gate, an unnamed alternative correctly
**blocked**, Alt B created at v1, rename, per-version date, `selectAlt` loading that
alternative's latest, `deleteAlt` re-lettering and refusing to delete the last one, and a
full `getState` → `applyLoadedState` round-trip carrying the tree (`.smbq` still
`version: 3`). No console errors.

SM's template: 3,244 → **2,377 lines**. `kit.js` is now the larger half of the chrome.

### Done — kit 1.4.1, tokenised + Beyond Teak on the kit's CSS

**Tokenising pass.** Every hardcoded colour in the chrome now resolves from a token —
the `#faf8ff` row hover, `#1a1d2e` tooltip, `#F3D9A4` search highlight, `#f0f2f7` gray tag,
`#856404` gold pill, `#b8943e` gold hover, `#f5d2d2`/`#e8a3a3` danger borders, and the
`#B4832E`/`#3E7C5A` save-status duplicates of `--warn`/`--good`. Only `#fff` remains
(white on dark, correct for any brand). The CUSTOM badge became a suite-wide semantic
(`--custom`/`--custom-bg`) alongside `--buffer`, same colours as before. `.btn.save`,
`.tag.alt` and `.pill.gray` were dead in all three tools and are gone; **`.btn.slate` was
not** — it is SM's Export Excel / Save PDF button, written `class="btn btn-sm slate"`, and
now uses `var(--sidebar)`, the same dark neutral as table headers and grand-total bars.

**Beyond Teak** now builds from the kit: `src/kit/`, `src/sync_kit.py`,
`src/brand.config.json`, the `<!--__KIT_INJECTION__-->` marker and the injection step in
its `build_tool.py`. 74 duplicated chrome rules and its `:root` block were removed — BT's
topbar, shell, sidebar, buttons, cards, fields, modal, toast, helpers, motion tokens and
focus rings all come from the kit now, with **its own green palette unchanged** (the user
likes it): accent `#5E8C3C`, the `--g-*` scale kept via `"scaleAlias": "g"`.

Two BT components had to stay as brand overrides, and the reason generalises: **BT's
markup differs from SM's**. Its brand mark is a real logo `<img>`, not SM's glyph in a
brass square, so the kit's fixed 32×32 `.brand-mark` box has to be reset; and its sidebar
`+ Add` is an inline link in the section header, not the kit's full-width dashed button.
Both are now explicit overrides in BT's own style block.

BT's own components — profile side-selector, `.sr-*` picker cards, `.bulkbar`, `.toggle`,
`table.boq`, `table.matrix`, `.side-grid` — are untouched, as is its per-metre logic and
`__PROFILE_ART_INJECTION__`. 162 BT-only rules stayed put.

### Not done yet

**BT Phase B — the JS.** BT still runs its own chrome behaviour; `kit.js`, `kit-export.js`
and `bridge.js` are deliberately *not* injected into it yet. Its functions collide with the
kit's by name, and several differ in **behaviour**, so each needs a decision rather than a
delete:

| BT's version | Kit's version | Decision |
|---|---|---|
| `fmtShort` → "Rp 1,2jt" / "Rp 500rb" | ~~removed~~ | **SETTLED** — no abbreviated money anywhere; `fmt()` in full. Deleted from the kit, SM and BT (CL still has the dead copy) |
| `fmtDate` → "02 Jun 2026" | ~~"02-06-2026"~~ | **SETTLED** — the kit now prints the spelled-out month everywhere, documents included; `fmtDateFile` gives filenames `YYYYMMDD` |
| `esc` also escapes `'`; `escAttr = esc` | separate, `'` unescaped | trivial — take BT's |
| `toast` plain text, slides right | icons, slides up | kit wins (SM canonical) |
| `updateSaveStatus` "Not saved"/"Saved" + `savedName` | Unsaved → Saving… → Autosaved HH:MM | kit wins; BT gains autosave |
| `saveFile`/`loadFile` → `.btbq` **format 1**, plain download | hooks + native Save As | needs the format-2 loader (§8) |
| ids `#modalMount` / `#toastStack` | `#modal-mount` / `#toast-stack` | rename BT's (6 references) |
| no `#dropZone` element | drag-drop overlay | add the element to BT's body |

BT's **focus trap has already been harvested** into the kit (`showModal` now traps Tab,
restores focus on close and wires `aria-labelledby`), so that work is preserved for every
brand before BT's copy is deleted.

**CL** hasn't been started. **Phase 1** (ERP envelope + `EMBEDDED`) is still open, and
`kit-export.js` is still a stub.

### Format decisions (2026-08-13)

Money and dates are now uniform across the suite, decided by the user and implemented in
kit 1.5.0:

- **Money is never abbreviated or rounded for display.** Every figure on screen is the real
  number, formatted in full by `fmt()` — `Rp 12.500.000`. `fmtShort` was briefly unified on
  Indonesian units (`rb`/`jt`/`M`) and then **removed outright** in kit 1.6.0: this is a
  priced document, and `Rp 13jt` hides 500.000. If a card is too narrow for the number,
  widen the card. It was dead code in all three tools, so nothing on screen changed.
- **Dates** print `02 Jun 2026` on screen and on the PDF/Excel letterhead. The month is
  spelled out deliberately: these documents go to clients, and a numeric date is read
  day-first in some markets and month-first in others.
- **Filenames** use `YYYYMMDD` via `fmtDateFile` — `Villa Canggu_20261201_BOQ.pdf`. This is
  a sort key, not a date display: a folder of a project's exports then lines up
  chronologically by name (descending = newest first). A day-first filename would sort by
  day of the month.

Scope note: `fmtShort` was defined in all three tools and **called by none of them**, which
is why removing it changes no screen today. `fmtDate` is the one with real reach: SM's revisions panel and both export
letterheads changed, verified in the generated PDF document definition. `BOQ-FORMAT-SPEC.md`
and the MulyaOne handoff (§6) were updated to match — the handoff previously promised
DD-MM-YYYY to the ERP team.

### Follow-ups noticed while extracting (deliberately not changed)

Phase 0b was kept refactor-only, so these off-palette leftovers moved into the kit as-is
and should be settled before CL/BT adopt it — each is currently a hardcoded literal where a
token belongs:

| Rule | Literal | Note |
|---|---|---|
| `.bom-table tbody tr:hover` | `#faf8ff` | cold lavender in a warm theme — legacy purple leftover |
| `.tag.custom` | `#fdf0ff` / `#7a1c8b` | purple |
| `.tag.alt` | `#e0f2fe` / `#0369a1` | blue (the removed makeAlt feature) |
| `.btn.save` | `#2563eb` | blue |
| `.btn.slate` | `#475569` | slate |
| `.btn.gold:hover` | `#b8943e` | should derive from `--brass` |
| `.sb-tip` | `#1a1d2e` | navy; should be `--sidebar` |
| `.pill.gray` / `.tag.gray` | `#f0f2f7` | cool grey |
| `.search-row mark.s-hl` | `#F3D9A4` | should derive from `--c-200` |
| `.save-status.unsaved/.autosaved` | `#B4832E` / `#3E7C5A` | duplicates `--warn` / `--good` |

`.btn.save` and `.btn.slate` are **dead** — no markup in the SM template uses either class.
Delete them from the kit rather than re-tokenising.

---

*© 2026 PT. Mitra Usaha Lancar Jaya · Internal tooling · BOQ tool suite*
