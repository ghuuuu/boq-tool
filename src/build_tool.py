"""
Build StellaMobili_BOM_Tool.html by injecting the versioned price-list data
(price-data/price_lists/) into the app template (src/StellaMobili_BOM_Tool_Ref.html).

The TEMPLATE is the editable source of truth: it holds all the CSS, body markup, and
the full app JavaScript, with a single marker  /*__PRICE_DATA_INJECTION__*/  where the
price data goes. This script's ONLY job is to load every price_lists/*_v*.json, build
the ALL_PRICE_DATA / PRICE_LIST_VERSIONS / PRICE_LIST_LATEST constants, and drop them in.

To change the tool's UI/logic  -> edit src/StellaMobili_BOM_Tool_Ref.html, then rebuild.
To update prices               -> edit/add price-data/price_lists/*_v*.json, then rebuild.

Run: python src/build_tool.py
"""
import json, re, os, glob, base64

ROOT     = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEMPLATE = f"{ROOT}/src/StellaMobili_BOM_Tool_Ref.html"
PL_DIR   = f"{ROOT}/price-data/price_lists"
OUT_HTML = f"{ROOT}/StellaMobili_BOM_Tool.html"
MARKER   = "/*__PRICE_DATA_INJECTION__*/"
KIT_DIR  = f"{ROOT}/src/kit"
BRAND_CFG = f"{ROOT}/src/brand.config.json"

# ── 1. Load ALL versioned price JSONs ─────────────────────────────────────
def load_pl(tp, ver):
    with open(f"{PL_DIR}/{tp}_{ver}.json", encoding="utf-8") as f:
        return json.load(f)["items"]

# Auto-detect every version present in price_lists/ (via kitchen_v*.json)
_kit_files = sorted(glob.glob(f"{PL_DIR}/kitchen_v*.json"))
ALL_VERSIONS = sorted(set(
    m.group(1) for m in (re.search(r'(v\d+\.\d+\.\d+)', f) for f in _kit_files) if m
))
if not ALL_VERSIONS:
    raise FileNotFoundError(f"No kitchen_v*.json found in {PL_DIR}")
LATEST_VERSION = ALL_VERSIONS[-1]
print(f"Price list versions: {', '.join(ALL_VERSIONS)}")
print(f"Latest: {LATEST_VERSION}")

all_price_data = {}
for ver in ALL_VERSIONS:
    all_price_data[ver] = {
        "kitchen":     load_pl("kitchen",     ver),
        "wardrobe":    load_pl("wardrobe",    ver),
        "accessories": load_pl("accessories", ver),
    }
    kb = sum(len(json.dumps(v, ensure_ascii=False)) for v in all_price_data[ver].values()) / 1024
    print(f"  {ver}: {kb:.0f} KB")

all_price_data_json = json.dumps(all_price_data, ensure_ascii=False, separators=(',', ':'))
print(f"ALL_PRICE_DATA total: {len(all_price_data_json)/1024:.0f} KB")

# ── 2. Build the injection block (matches the constants the app JS expects) ─
injection = (
    "const ALL_PRICE_DATA = " + all_price_data_json + ";\n"
    "const PRICE_LIST_VERSIONS = " + json.dumps(ALL_VERSIONS) + ";\n"
    "const PRICE_LIST_LATEST = " + json.dumps(LATEST_VERSION) + ";"
)

# ── 3. Inject into the template and write the output ──────────────────────
with open(TEMPLATE, encoding="utf-8") as f:
    template = f.read()

if template.count(MARKER) != 1:
    raise RuntimeError(
        f"Expected exactly 1 injection marker {MARKER!r} in {TEMPLATE}, "
        f"found {template.count(MARKER)}"
    )

output = template.replace(MARKER, injection)

# ── 3b. Inline ExcelJS so the built tool works fully offline ───────────────
EXCELJS_MARKER = "/*__EXCELJS_INJECTION__*/"
EXCELJS_PATH   = f"{ROOT}/src/vendor/exceljs.min.js"
if output.count(EXCELJS_MARKER) != 1:
    raise RuntimeError(
        f"Expected exactly 1 ExcelJS marker {EXCELJS_MARKER!r} in {TEMPLATE}, "
        f"found {output.count(EXCELJS_MARKER)}"
    )
with open(EXCELJS_PATH, encoding="utf-8") as f:
    exceljs_src = f.read()
output = output.replace(EXCELJS_MARKER, exceljs_src)
print(f"ExcelJS inlined: {len(exceljs_src)/1024:.0f} KB (offline Excel export)")

# ── 3c. Inline pdfmake (+ Roboto fonts) for direct offline PDF download ────
PDFMAKE_MARKER = "/*__PDFMAKE_INJECTION__*/"
if output.count(PDFMAKE_MARKER) != 1:
    raise RuntimeError(
        f"Expected exactly 1 pdfmake marker {PDFMAKE_MARKER!r} in {TEMPLATE}, "
        f"found {output.count(PDFMAKE_MARKER)}"
    )
pdfmake_src = ""
for fn in ("pdfmake.min.js", "vfs_fonts.js"):
    with open(f"{ROOT}/src/vendor/{fn}", encoding="utf-8") as f:
        pdfmake_src += f.read() + "\n"
output = output.replace(PDFMAKE_MARKER, pdfmake_src)
print(f"pdfmake inlined: {len(pdfmake_src)/1024:.0f} KB (offline PDF download)")

# ── 3d. Inline brand assets: logos + BOQ export fonts (offline PDF branding) ─
ASSETS_MARKER = "/*__BRAND_ASSETS_INJECTION__*/"
if output.count(ASSETS_MARKER) != 1:
    raise RuntimeError(
        f"Expected exactly 1 brand-assets marker {ASSETS_MARKER!r} in {TEMPLATE}, "
        f"found {output.count(ASSETS_MARKER)}"
    )
def b64(path):
    with open(path, "rb") as f:
        return base64.b64encode(f.read()).decode("ascii")

logos = {
    "stella": b64(f"{ROOT}/src/assets/stella-mobili-logo.png"),
    "mulya":  b64(f"{ROOT}/src/assets/mulya-logo.png"),
}
def txt(path):
    with open(path, encoding="utf-8") as f:
        return f.read()

# SVG versions (vector, used by the PDF export; PNGs above are for Excel)
logos_svg = {
    "stella": txt(f"{ROOT}/src/assets/stella-mobili-logo.svg"),
    "mulya":  txt(f"{ROOT}/src/assets/mulya-logo.svg"),
}
FONT_FILES = [
    "LibreFranklin-Regular.ttf", "LibreFranklin-SemiBold.ttf",
    "LibreCaslonText-Regular.ttf", "LibreCaslonText-Bold.ttf",
]
fonts_vfs = {fn: b64(f"{ROOT}/src/vendor/fonts/{fn}") for fn in FONT_FILES}
assets_injection = (
    "const BOQ_LOGOS={stella:'data:image/png;base64," + logos["stella"] + "',"
    "mulya:'data:image/png;base64," + logos["mulya"] + "',"
    "stellaSvg:" + json.dumps(logos_svg["stella"]) + ","
    "mulyaSvg:" + json.dumps(logos_svg["mulya"]) + "};\n"
    "if(typeof pdfMake!=='undefined'){Object.assign(pdfMake.vfs,"
    + json.dumps(fonts_vfs) + ");"
    "pdfMake.fonts={Roboto:{normal:'Roboto-Regular.ttf',bold:'Roboto-Medium.ttf',"
    "italics:'Roboto-Italic.ttf',bolditalics:'Roboto-MediumItalic.ttf'},"
    "LibreFranklin:{normal:'LibreFranklin-Regular.ttf',bold:'LibreFranklin-SemiBold.ttf'},"
    "LibreCaslon:{normal:'LibreCaslonText-Regular.ttf',bold:'LibreCaslonText-Bold.ttf'}};}"
)
output = output.replace(ASSETS_MARKER, assets_injection)
print(f"Brand assets inlined: logos {sum(len(v) for v in logos.values())/1024:.0f} KB + fonts {sum(len(v) for v in fonts_vfs.values())/1024:.0f} KB (base64)")

# ── 3e. Inline the shared chrome (boq-kit) + this brand's config ───────────
# src/kit/ is a vendored copy of the boq-kit repo (refresh: python src/sync_kit.py).
# The kit CSS goes in BEFORE the template's own <style> so a brand rule can still
# override a kit rule. See docs/BOQ-SHARED-CHROME.md §4.
KIT_MARKER = "<!--__KIT_INJECTION__-->"
if output.count(KIT_MARKER) != 1:
    raise RuntimeError(
        f"Expected exactly 1 kit marker {KIT_MARKER!r} in {TEMPLATE}, "
        f"found {output.count(KIT_MARKER)}"
    )
if not os.path.isdir(KIT_DIR):
    raise FileNotFoundError(f"No vendored kit at {KIT_DIR} — run: python src/sync_kit.py")

with open(BRAND_CFG, encoding="utf-8") as f:
    brand = json.load(f)
kit_version = txt(f"{KIT_DIR}/KIT_VERSION").strip()

# palette key -> CSS custom property. Extra aliases keep legacy rules working.
_TOKEN_ALIASES = {"brass": ["--brass", "--gold"], "brassBg": ["--brass-bg", "--gold-bg"]}
def _css_vars(pal):
    out = []
    for k, v in pal.items():
        if k in ("scale", "scaleAlias"):
            continue
        names = _TOKEN_ALIASES.get(k, ["--" + re.sub(r'(?<!^)(?=[A-Z])', '-', k).lower()])
        out += [f"{n}:{v}" for n in names]
    scale, alias = pal.get("scale", {}), pal.get("scaleAlias")
    for step, v in scale.items():
        out.append(f"--c-{step}:{v}")
        if alias:
            out.append(f"--{alias}-{step}:{v}")
    return out

brand_css = ":root{" + ";".join(_css_vars(brand["palette"])) + "}"
# Self-hosted UI font — the tool must not depend on the Google Fonts CDN at runtime.
screen_font = (
    "@font-face{font-family:'Hanken Grotesk';font-style:normal;"
    "font-weight:400 800;font-display:swap;"
    "src:url(data:font/woff2;base64," + b64(f"{KIT_DIR}/fonts/HankenGrotesk-Latin.woff2")
    + ") format('woff2');}"
)
kit_injection = (
    "<style>\n" + screen_font + "\n"
    + "/* ===== brand tokens (src/brand.config.json) ===== */\n" + brand_css + "\n"
    + txt(f"{KIT_DIR}/kit.css") + "\n</style>\n"
    + "<script>const KIT_VERSION=" + json.dumps(kit_version) + ";"
    + "const BRAND=" + json.dumps({k: brand[k] for k in
        ("brandKey", "brandName", "toolName", "fileExt", "docPrefix", "autosaveKey",
         "unitNoun")
        if k in brand}) + ";</script>\n"
    + "<script>\n" + txt(f"{KIT_DIR}/kit.js") + "\n</script>\n"
    + "<script>\n" + txt(f"{KIT_DIR}/kit-export.js") + "\n</script>\n"
    + "<script>\n" + txt(f"{KIT_DIR}/bridge.js") + "\n</script>"
)
output = output.replace(KIT_MARKER, kit_injection)
print(f"Kit {kit_version} inlined: {len(kit_injection)/1024:.0f} KB "
      f"({brand['brandKey']} · {brand['brandName']})")

with open(OUT_HTML, "w", encoding="utf-8") as f:
    f.write(output)

print(f"Written: {OUT_HTML}")
print(f"Size: {os.path.getsize(OUT_HTML)/1024:.0f} KB")
