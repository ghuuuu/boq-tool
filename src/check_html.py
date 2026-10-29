"""Sanity-check the built BOQ_Tool.html after a build.

Verifies the build actually injected everything (ExcelJS, pdfmake, fonts, boq-kit) and
that the app shell is intact. Exits non-zero on any failure so it can gate
a release. Run: python src/check_html.py
"""
import os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'BOQ_Tool.html')

failures = []

def check(label, ok, detail=''):
    print(('PASS' if ok else 'FAIL') + f'  {label}' + (f' — {detail}' if detail else ''))
    if not ok:
        failures.append(label)

if not os.path.exists(OUT):
    print(f'FAIL  built file missing: {OUT}')
    sys.exit(1)

size_mb = os.path.getsize(OUT) / 1024 / 1024
with open(OUT, encoding='utf-8') as f:
    c = f.read()

# Build injections happened (markers replaced with real content)
check('size plausible (> 2.5 MB)', size_mb > 2.5, f'{size_mb:.1f} MB')
check('price data structure injected', 'const ALL_PRICE_DATA = {' in c)
check('price-data marker replaced', '/*__PRICE_DATA_INJECTION__*/' not in c)
check('ExcelJS injected', '/*! ExcelJS' in c)
check('ExcelJS marker replaced', '/*__EXCELJS_INJECTION__*/' not in c)
check('pdfmake injected', 'pdfMake' in c)
check('pdfmake marker replaced', '/*__PDFMAKE_INJECTION__*/' not in c)
check('no external scripts (offline-safe)', '<script src=' not in c)
check('version constants present', 'const PRICE_LIST_LATEST' in c and 'const PRICE_LIST_VERSIONS' in c)
check('brand assets injected', 'const BOQ_LOGOS={brand:' in c and 'LibreFranklin-Regular.ttf' in c)
check('brand-assets marker replaced', '/*__BRAND_ASSETS_INJECTION__*/' not in c)
check('kit marker replaced', '<!--__KIT_INJECTION__-->' not in c)

# App shell intact
check('topbar', '<header class="topbar">' in c)
check('shell', '<div class="shell">' in c)
check('sidebar', '<aside class="sidebar"' in c)
check('modal mount', 'id="modal-mount"' in c)
check('toast stack', 'id="toast-stack"' in c)
check('title', '<title>BOQ Tool' in c)

# Structural sanity
check('document tail intact', c.rstrip().endswith('</html>') and '</script>' in c[-500:])
check('single html close', c.count('</html>') == 1)

if failures:
    print(f"\n{len(failures)} checks FAILED.")
    sys.exit(1)

print(f"\nAll checks passed. ({size_mb:.2f} MB)")
