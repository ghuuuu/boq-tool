# BOQ Document Export Specification

## Overview

The BOQ Tool exports client-facing quotation and estimation documents in two formats:
1. **Excel Workbook (`.xlsx`)** via inlined ExcelJS.
2. **PDF Document (`.pdf`)** via inlined pdfmake.

Both formats operate completely offline inside the browser without requiring round-trips to any server or external cloud API.

---

## 1. Design Principles

- **Typography**:
  - Headings and figures: Libre Caslon Text (serif, elegant, high-contrast).
  - Body and table content: Libre Franklin (clean geometric sans-serif).
  - Numbers: Tabular figures with uniform column alignment.
- **Palette**:
  - Ink: Deep rich black `#1F1812`.
  - Muted / Secondary: Warm gray `#7A7166`.
  - Accent / Brand: Warm brass `#8C6830`.
  - Grid / Hairlines: Warm cream `#E6E1D8`.
  - Buffer highlight: Subtle ice blue tint `#E9EFF6`.

---

## 2. Layout Structure

1. **Header**:
   - Brand logo (vector SVG in PDF, crisp high-DPI PNG in Excel).
   - Document title (`BILL OF QUANTITIES`).
2. **Metadata Band**:
   - Six structured fields: Project, Client, PIC, Date, Version, Price List.
3. **Room / Unit Sections**:
   - Clear section title with unit subtotal.
   - Group-first item presentation: items bundled into groups/packages are presented contiguously with their subtotal, followed by ungrouped items.
4. **Totals & Buffer Separation**:
   - Grand Total block with optional buffer item breakdown (`excl. buffer` vs `incl. buffer`).
