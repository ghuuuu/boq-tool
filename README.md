# Stella Mobili BOQ Tool

Internal **Bill of Quantities** input tool for **Stella Mobili** — one of the brands managed by
PT. Mitra Usaha Lancar Jaya (**Mulya**).

It's a single, self-contained HTML file that opens in any browser — no server, no install.
A PIC (Person In Charge) uses it to build a room-by-room BOQ for a client project, then export
it for price verification by Stella Mobili Jakarta.

---

## What it does

- Build a **room-by-room BOQ** for a client project
- Select cabinet items by **category, finish, and handle style** (Kitchen / Wardrobe / Accessories)
- Track **revisions & alternatives** (quotable version history)
- Flag **buffer / insurance stock** (counted in totals, excluded from the Sales Order downstream)
- **Save / load** progress as a versioned `.smbq` file (plain JSON)
- **Export to Excel** (one sheet per room + summary)
- **Save to PDF** (A4, branded letterhead)

Prices shown are **Showroom prices** and are embedded in the tool at build time.

---

## Usage

Open **`StellaMobili_BOM_Tool.html`** in any modern browser (double-click it). That's it.

The file is fully self-contained — the price data is baked in, so it works offline and can be
shared as a single file. Save your work with the disk icon (produces a `.smbq` file you can
reopen later).

> A short user manual is available in `docs/SM_BOQ_Manual_EN.html` (English) and
> `docs/SM_BOQ_Manual_ID.html` (Indonesian).

---

## Project layout

```
StellaMobili_BOM_Tool.html          # BUILD OUTPUT — the tool you actually open (generated, ~3.3 MB)
README.md                           # This file
CLAUDE.md                           # Full developer/architecture guide
src/                                # Source + build scripts
  StellaMobili_BOM_Tool_Ref.html    # TEMPLATE / source of truth — edit THIS (all CSS + HTML + app JS)
  build_tool.py                     # Build: inject price data into the template -> built HTML
  extract_price_data.py             # Extract price lists from the source Excels
  check_html.py                     # Sanity-check the built HTML
price-data/                         # All price data
  Price List Ref/                   # Source price-list Excels (read-only reference)
  price_lists/                      # Extracted price data (one JSON per section per version) + index.json
docs/                               # Human documentation
  SM_BOQ_Manual_EN.html             # User manual (English)
  SM_BOQ_Manual_ID.html             # User manual (Indonesian)
  UPDATING_PRICE_LIST.md            # How to update the price list
  design/boq-system.md              # CRM integration design doc
archive/                            # Old backups & superseded scripts (not used by the build)
```

> **Do not hand-edit `StellaMobili_BOM_Tool.html`** — it is generated. Edit the template
> (`src/StellaMobili_BOM_Tool_Ref.html`) and rebuild.

---

## Building

The build injects the price data into the template and writes the standalone tool.

```bash
# 1. (only if prices changed) re-extract price lists from the source Excels
python src/extract_price_data.py

# 2. build the tool
python src/build_tool.py

# 3. sanity-check the output
python src/check_html.py
```

- **Change UI or logic** → edit `src/StellaMobili_BOM_Tool_Ref.html`, then run step 2.
- **Change prices** → edit `price-data/price_lists/*_v*.json` (and `index.json`), then run step 2.
- **Add a new price-list version** → drop `kitchen_vX.json` / `wardrobe_vX.json` /
  `accessories_vX.json` into `price_lists/`; the build auto-detects it and the newest
  version becomes the default.

Requires Python 3 with `pandas` / `openpyxl` (only for the Excel extraction step).

---

## Save format (`.smbq`)

`.smbq` files are plain JSON (current format `version: 3`) carrying the full project state:
project meta, all units/items, and the revisions & alternatives tree. The loader is
backward-compatible with older files.

---

## Status

This is a **standalone preview** of what will become a module inside **MulyaOne** (the internal
CRM). It is intentionally self-contained — please keep it server-free. CRM integration happens
as a separate build.

See [`CLAUDE.md`](CLAUDE.md) for the full architecture, data model, and contribution notes.
