# Price Data & Catalogue Catalogues (Optional)

This directory is where optional pre-compiled product catalogues and price lists reside.

**By default, this repository ships with 0 database.** You can use the BOQ Tool completely standalone by adding custom items directly in the app.

---

## Supplying Your Own Product Database

If you wish to bundle a pre-defined product catalog with finishes and prices:

1. Create a JSON file in this directory named following the pattern:
   `<section>_<version>.json`
   Example: `kitchen_v1.0.0.json`, `wardrobe_v1.0.0.json`, or `items_v1.0.0.json`

2. Follow the structure shown in `catalog_template.json`:
   ```json
   {
     "version": "v1.0.0",
     "type": "kitchen",
     "extractedAt": "2026-10-29",
     "items": {
       "Base Units": [
         {
           "subcat": "Shelf Units",
           "desc": "Base Unit Shelf W:600 H:720 D:560",
           "w": 600,
           "h": 720,
           "d": 560,
           "thickness": "18mm",
           "unit": "set",
           "notes": "Standard base unit with 1 shelf",
           "prices": {
             "Standard White__standard": 150000,
             "Matte Oak__standard": 185000
           }
         }
       ]
     }
   }
   ```

3. Update `index.json`:
   ```json
   {
     "latest": "v1.0.0",
     "versions": [
       "v1.0.0"
     ]
   }
   ```

4. Run the build script:
   ```bash
   python src/build_tool.py
   ```
   The build script will automatically detect and embed the catalog into the single-file `BOQ_Tool.html`.
