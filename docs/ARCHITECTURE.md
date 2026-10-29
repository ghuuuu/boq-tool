# Architecture Documentation

## Single-File Offline Philosophy

BOQ Tool compiles into a standalone, single HTML file (`BOQ_Tool.html`).
It requires:
- No web server (opens directly via `file:///`).
- No internet access (all fonts, libraries, styles, and scripts are embedded).
- No relational or server database (state is persisted via `.boq` JSON files and browser `localStorage`).

---

## Component Separation

1. **Shared Chrome (`src/kit/`)**:
   - `kit.css`: Base design tokens, typography, topbar, sidebar, modal, table styles, and toast notifications.
   - `kit.js`: State management for revisions, autosave, unit grouping, row actions, and file I/O.
   - `kit-export.js`: Export letterhead builders, pagination, and file delivery hooks.

2. **Core Domain (`src/BOQ_Tool_Ref.html`)**:
   - Item add-bars, custom item modal, table rendering, inline cell editing, and document assembly.

3. **Compiler (`src/build_tool.py`)**:
   - Inlines CSS, fonts (base64 WOFF2 & TTF), vendor JS (ExcelJS & pdfmake), brand assets, and optional catalogue data.
