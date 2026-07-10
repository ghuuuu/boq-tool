# Updating the Price List

Quick reference for refreshing the prices in the SM BOQ tool.

## The pipeline

```
ORI Excel (matrix)  →  Flat Excel (FLAT sheets)  →  price_lists/*.json  →  StellaMobili_BOM_Tool.html
   from Jakarta        via sm-pricelist-flatten      extract_price_data.py    build_tool.py
```

The tool reads the **flat** Excel files — never the ORI (original matrix) files.

## 1. Prepare the flat Excel files

Three files are needed, one per section. Put them in:

```
price-data/Price List Ref/
```

Name them **exactly** like this (the `v` is part of the name):

| Section | Filename |
|---|---|
| Kitchen | `Kitchen PL SM v<VERSION>.xlsx` |
| Wardrobe | `Wardrobe PL SM v<VERSION>.xlsx` |
| Accessories | `Accessories PL SM v<VERSION>.xlsx` |

**Version format:** `vYY.MM.BB` → e.g. `v26.06.02` (year `26`, month `06`, build `02`).

These flat files come from the ORI files via the **`sm-pricelist-flatten`** skill, then checked
with **`sm-pricelist-audit`**. Each file must keep its `... (FLAT)` sheet names and column
headers (`DESCRIPTION`, `CATEGORY`, `FINISH`, `HANDLE`, `PRICE`, `ACTIVE`, `WIDTH`/`HEIGHT`/`DEPTH`,
etc.) — the extractor matches those exactly, so a renamed sheet or column silently drops data.

## 2. Two scenarios

**A) Fixing mistakes in the current version** (same version number)
→ Overwrite the three `v<VERSION>.xlsx` files in place. Keep the same version name.

**B) A brand-new price list** (new version number)
→ Add three new files with the new `v<VERSION>` name. Leave the old ones in place — the tool
keeps every version, and the **newest** version becomes the default.

## 3. Import + rebuild

From the repo root, run:

```bash
python src/extract_price_data.py     # flat Excel → price_lists/*.json (auto-detects newest version)
python src/build_tool.py             # inject JSON → StellaMobili_BOM_Tool.html
python src/check_html.py             # sanity-check the built file
```

- `extract_price_data.py` auto-detects the newest version from the filenames. To force a
  specific one: `python src/extract_price_data.py v26.06.02`.
- Requires Python 3 with `openpyxl` installed.

## 4. Verify

- Open `StellaMobili_BOM_Tool.html`, pick a corrected item in the search/browse dropdown, and
  confirm the price/finish/dimensions look right.
- Watch the extractor's console output — it prints an item count per category. A category that
  suddenly drops to `0` usually means a renamed sheet or column.

## 5. Commit

```bash
git add price-data/price_lists/*.json price-data/"Price List Ref"/*.xlsx StellaMobili_BOM_Tool.html
git commit -m "Update price list <VERSION>"
git push          # optional — uploads to GitHub
```

## Do / Don't

- ✅ Edit only the **flat** `v<VERSION>.xlsx` files.
- ✅ Rebuild after every price change — the tool runs on the built HTML, not the JSON.
- ❌ Don't hand-edit `price_lists/*.json` or the giant data blob in `StellaMobili_BOM_Tool.html`
  — both are generated.
- ❌ Don't rename the `(FLAT)` sheets or columns.
