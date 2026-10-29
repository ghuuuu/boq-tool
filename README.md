# BOQ Tool — Open Source & Whitelabel Bill of Quantities Web App

A powerful, standalone, browser-based **Bill of Quantities (BOQ) and Costing Tool** designed for interior designers, architects, furniture makers, and contractors.

It is delivered as a **single, self-contained HTML file** (`BOQ_Tool.html`, ~3.8 MB) that runs completely offline with **zero server, zero install, and zero external dependencies**.

---

## 🌟 Key Highlights

- **0 Database by Default**: Ships completely unencumbered with no proprietary database or client pricing. Works immediately out of the box with custom item entry and direct inline price editing.
- **Whitelabel Ready**: Brand name, file extensions, document prefix, color palette, and logos are centrally configured via a single JSON file (`src/brand.config.json`).
- **100% Offline & Portable**: ExcelJS, pdfmake, vector fonts, and chrome UI are baked directly into the standalone HTML artifact. Open it with a double click in Chrome, Edge, Safari, or Firefox anywhere.
- **Project Save & Load**: Save entire multi-room projects into a single `.boq` file (human-readable JSON) or drag-and-drop to open.
- **Excel & PDF Exports**: Instant generation of formatted `.xlsx` workbooks (one tab per unit + summary) and publication-ready A4 PDFs (portrait or landscape).
- **Revisions & Alternatives**: Built-in tree for versioning (v1, v2...) and side-by-side design alternatives (Alt A, Alt B...) with dirty tracking and autosave recovery.

---

## 🚀 Quick Start

1. Double-click **`BOQ_Tool.html`** in your file manager to open it in any web browser.
2. In the **Overview** tab, enter your Project Name, Client, and PIC.
3. Click **+ Add** in the sidebar to add rooms or units (e.g. *Kitchen*, *Master Bedroom*, *Living Area*).
4. Click **+ Custom** on the Add Bar to enter items with category, description, finish/material, dimensions (WxHxD), quantity, and unit price.
5. Edit unit prices and quantities **directly in the table** anytime.
6. Click **Save .boq** to save your work, or **Export Excel** / **Save PDF** to generate client deliverables.

---

## 🛠️ Project Structure

```text
BOQ_Tool.html               # STANDALONE BUILD OUTPUT — the app you open in the browser (~3.8 MB)
BOQ_Manual_EN.html          # User guide (opened via the in-app Help button)
README.md                   # This file
CLAUDE.md                   # Architecture & developer guide
src/
  BOQ_Tool_Ref.html         # TEMPLATE source of truth (HTML, CSS, core application logic)
  brand.config.json         # Central whitelabel configuration (colors, names, file extension)
  build_tool.py             # Compiler: inlines libraries, kit, fonts, and assets into BOQ_Tool.html
  check_html.py             # Sanity & integrity test script
  assets/
    boq-logo.svg            # Vector logo (used in PDF export and UI)
    boq-logo.png            # Raster logo (used in Excel export)
  kit/                      # Shared UI chrome, save/load engine, and export layout
  vendor/                   # Offline libraries (ExcelJS, pdfmake, Roboto & Libre fonts)
price-data/
  price_lists/              # Optional directory for pre-compiled product catalogues
    index.json              # Catalog version registry
    catalog_template.json   # Template demonstrating catalog schema
```

---

## 🎨 Whitelabeling Guide

You can rebrand this tool to your company's identity in under 2 minutes:

1. Open `src/brand.config.json`.
2. Edit the metadata:
   ```json
   {
     "brandKey": "ACME",
     "brandName": "Acme Interiors",
     "toolName": "Estimator",
     "fileExt": ".acmebq",
     "docPrefix": "EST",
     "unitNoun": "room",
     "autosaveKey": "acme_boq_autosave"
   }
   ```
3. Adjust the `palette` hex values (background, accents, sidebar, ink) to match your corporate branding.
4. Replace `src/assets/boq-logo.svg` and `src/assets/boq-logo.png` with your logos.
5. Rebuild the app:
   ```bash
   python src/build_tool.py
   ```

---

## 📦 Supplying an Optional Product Database

If your organization has standard product lines or catalogs with pre-set pricing:

1. Create a catalogue file in `price-data/price_lists/` following `catalog_template.json` (e.g. `kitchen_v1.0.0.json`).
2. Update `price-data/price_lists/index.json`:
   ```json
   {
     "latest": "v1.0.0",
     "versions": ["v1.0.0"]
   }
   ```
3. Run `python src/build_tool.py`. The build script will automatically detect the catalog files and inject them into `BOQ_Tool.html`.

---

## 🔨 Building & Verification

To compile the single-file HTML artifact after making changes:

```bash
# Compile template + assets into BOQ_Tool.html
python src/build_tool.py

# Verify build integrity (size, markers, structure)
python src/check_html.py
```

---

## 📄 License

Open-source and free to adapt for personal, studio, or enterprise use.
