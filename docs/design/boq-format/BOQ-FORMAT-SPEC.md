# MULYA / Stella Mobili — BOQ PDF Format Spec (pdfmake)

Target: match `BOQ Format.dc.html` (option 3a portrait / 3b landscape).
Reference implementation: `pdfmake-skeleton.js` in this folder.
All sizes below are given in CSS px (from the mock, A4 @ 96dpi) and pt (pdfmake, ×0.75).

## Page

- A4. Portrait is the default; landscape variant supported (wider notes, single-line rows).
- Margins: portrait `[33pt, 16pt, 33pt, 16pt]` (44px sides, 21px top/bottom);
  landscape `[33pt, 18pt, 33pt, 18pt]`.
- Paper: white. Ink `#1F1812`. Muted gray `#7A7166`. Brass accent `#8C6830`.
  Hairline `#E6E1D8`. Buffer tint `#E9EFF6`, buffer hairline `#D8E2EE`, buffer label `#3E648C` (border `#9FB4CC`).

## Fonts

- Display (section titles, grand total figure): **Libre Caslon Text** — normal=Regular 400, bold=Bold 700.
- Body (everything else): **Libre Franklin** — normal=Regular 400, bold=SemiBold 600
  (register Medium 500 as a second family if needed for meta values).
- TTFs from Google Fonts (github.com/google/fonts, OFL). Register in pdfmake VFS.
- Numbers: Libre Franklin's default figures are fine (near-tabular); totals right-aligned.

## Header (both orientations)

Left: Stella Mobili logo (`stella-mobili-logo.png`), height 46px / 34.5pt (42px / 31.5pt landscape).
Under it: doc line `BILL OF QUANTITIES — INCL. BUFFER` — 8px/6pt, uppercase, brass, characterSpacing 0.6pt.
Right (right-aligned): MULYA logo (`mulya-logo.png`) at the SAME height as the brand logo,
under it: `PT. MITRA USAHA LANCAR JAYA · JL. TEGALSARI 37` — same style as the left doc line.
Rule below the whole header: 1.5px/1.1pt solid ink, 10px/7.5pt padding above.

Note: the top-left logo is per-brand (7 brands); MULYA always sits top-right.

## Meta row

Portrait: its own band under the header rule, 6 columns
(PROJECT | CLIENT | PIC | DATE | VERSION | PRICE LIST), hairline rule below.
Landscape: same 6 cells sit inline centered inside the header band (between the logos).
- Label: 7.5px/5.6pt, uppercase, brass, semibold, characterSpacing 0.9pt.
- Value: 11px/8.25pt, ink, medium, 2px/1.5pt above-gap.

## Section header (per area, e.g. "Kitchen 1")

Title (Libre Caslon 15px/11.25pt, ink) — hairline filler line — optional note
`(excl. buffer Rp …)` (8.5px/6.4pt gray) — section total (11.5px/8.6pt, semibold, brass).
Margin above: 8px/6pt.

## Item table

Column order: `#, Description (*), Category, Finish, Unit price, Qty, Total, Notes`.
pdfmake widths (pt), portrait: `[15, '*', 60, 54, 64, 18, 66, 44]`, paddingLeft/Right 3.75pt.
pdfmake widths (pt), landscape: `[18, '*', 110, 84, 76, 20, 80, 66]`, padding 4.5pt.

**Price columns never wrap.** Unit price, Qty and Total carry `noWrap:true` and their columns are
sized to hold large values (up to ~9-figure prices) on a single line, so figures are always intact.

**Wrap-priority cascade.** Text columns are sized in reverse of how readily they should wrap, so when
space is tight the wrapping order is Notes → Finish → Category → Description: Description (`*`) is
widest and wraps last; then Category > Finish > Notes (narrowest, wraps first). Fixed widths keep
every per-unit table column-aligned.

**Group-first bands.** Item rows within a unit are grouped by item **group** (a named, unit-scoped
package that may span sections). Each band = a header row (group name, brass; a plain "Other items"
band in gray for ungrouped rows) with the **group subtotal** under the Total column, followed by its
member rows. This **replaces the old per-section (KITCHEN/WARDROBE/ACCESSORIES) sub-headers**; each
row instead carries a small brass section tag in the Category cell (toggle: `showSecTag` const in
`buildPdfDoc` / `exportExcel`). Bands are ordered by `exportBands()`; empty bands are omitted.

Header row: 7.5px/5.6pt uppercase, gray `#7A7166`, bold, characterSpacing 0.8pt;
1px/0.75pt ink rule below (no rule above, no vertical lines anywhere).

Body rows — portrait (two-line description):
- Row #: 9.5px/7.1pt gray. Name: 10.5px/7.9pt semibold ink; dims below 9.5→8.5px/6.4pt gray.
- Category: 10px/7.5pt ink; sub-category below 8.5px/6.4pt gray.
- Finish / unit price / qty: 10px/7.5pt ink (price right, qty center).
- Total: 10px/7.5pt semibold **brass**, right.
- Notes: 9.5px/7.1pt gray, wraps freely (long notes grow the row; fine).
- Row padding 3px/2.25pt vertical; 0.5px/0.4pt hairline below each row.

Body rows — landscape (one-line description):
- Name 10px/7.5pt semibold + dims 8.5px/6.4pt gray on the SAME line (10px gap);
  category + sub-category also share one line. Row padding 3-4px.

Buffer rows (rows whose item is buffer stock):
- fillColor `#E9EFF6`, hairline `#D8E2EE`.
- `BUFFER` tag after the name: 7px/5.25pt bold `#3E648C`, characterSpacing 0.75pt
  (pill border `#9FB4CC` optional — plain colored text is acceptable in pdfmake).

## Grand total block

2px/1.5pt ink rule above. Left: `GRAND TOTAL · ALL UNITS · SHOWROOM PRICE · EXCL. PPN · INCL. BUFFER`
8px/6pt uppercase semibold ink, characterSpacing 1.35pt.
Right: total in Libre Caslon 21px/15.75pt ink; below it 8.5px/6.4pt gray
`excl. buffer Rp … · buffer Rp …`.

## Page footer (every page)

Hairline above. Left: `{project} · {version} · {pricelist}` — right: `{page} / {pages}`.
8px/6pt gray, characterSpacing 0.45pt.

## Behavior

- Long notes wrap in-column and grow the row; content then flows to the next page
  (repeat the table header row via `headerRows: 1`).
- A "no buffer" client variant hides buffer rows and swaps totals to the excl.-buffer figures.
- One brand logo slot top-left; MULYA constant top-right.
