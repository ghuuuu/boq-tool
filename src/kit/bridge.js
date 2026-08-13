/* ============================================================
   boq-kit · bridge.js — ERP envelope + MulyaOne bridge
   ------------------------------------------------------------
   Moving in during Phase 1 (see BOQ-SHARED-CHROME.md §6):
     getState()          → branded envelope {tool,brand,envelope,format,project,payload,alts,…}
     applyLoadedState(st)→ tolerant loader, blank payload = blank tool
     postMessage protocol: boq:ready / hello / load / request-state / state / saved / save-smbq
     EMBEDDED            → read-only project fields, hidden file-save/export UI,
                           no beforeunload, per-project+set autosave keys
   ============================================================ */
