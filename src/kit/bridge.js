/* ============================================================
   boq-kit · bridge.js — running inside a host (MulyaOne)
   ------------------------------------------------------------
   Every brand tool ships this. It is inert standalone: EMBEDDED is false when
   the tool isn't in an iframe, and nothing below runs.

   The host and the tool are same-origin and talk over window.postMessage:

     iframe -> parent  boq:ready                      tool is up, send state
     parent -> iframe  boq:hello                      re-ping until we answer
     parent -> iframe  boq:load {payload}             restore a saved BOQ
     parent -> iframe  boq:request-state {requestId}
     iframe -> parent  boq:state {payload,requestId}  = getState()
     parent -> iframe  boq:saved {revisionNumber}     filed in the DB; clear dirty
     parent -> iframe  boq:save-smbq                  trigger the native file save

   Only two contracts matter, and both are KIT.hooks (see kit.js):
   getState() must return everything, and applyLoadedState() must accept it back
   — including an EMPTY payload, which means "start a blank BOQ".

   What differs per brand — which project fields the host owns, which buttons to
   hide — is declared through hooks, not hardcoded here.
   ============================================================ */

const EMBEDDED = (function(){
  try { return window.parent !== window; } catch(e){ return true; }   // cross-origin parent
})();

(function(){
  if (!EMBEDDED) return;

  var origin = window.location.origin;
  var send = function(msg){ try { window.parent.postMessage(msg, origin); } catch(e){} };

  /* --- The host's database is the source of truth here -------------------
     Not the .smbq/.btbq file. Neutralise the "unsaved file" close warning in
     the capture phase, before the tool's own bubble-phase handler sees it. */
  try {
    window.addEventListener('beforeunload', function(){
      try { fileUnsaved = false; } catch(e){}
    }, true);
  } catch(e){}

  /* --- Protocol ---------------------------------------------------------- */
  window.addEventListener('message', function(ev){
    if (ev.origin !== origin) return;              // ignore anything not from our host
    var msg = ev.data || {};

    // This file is injected in <head>, so it is listening long before the tool
    // has built its first view or registered its hooks. Staying silent until
    // KIT.start() is what makes the host's boq:hello re-ping loop correct: it
    // keeps asking, and we answer once we can actually honour a boq:load.
    if (!KIT.started) return;

    // The parent mounts after this (heavy) iframe parses, so it may miss our
    // first ready; it re-pings with boq:hello until we answer.
    if (msg.type === 'boq:hello') { send({type:'boq:ready'}); return; }

    if (msg.type === 'boq:load') {
      try {
        var payload = msg.payload || {};
        KIT.hooks.applyLoadedState(payload);
        if (KIT.hooks.stateHasContent(payload)) toast('BOQ loaded from project');
      } catch (err) { toast('Failed to load BOQ: ' + err.message, 'error'); }
      return;
    }

    if (msg.type === 'boq:request-state') {
      send({ type:'boq:state', payload: KIT.hooks.getState(), requestId: msg.requestId });
      return;
    }

    if (msg.type === 'boq:saved') {
      try {
        if (typeof revisionNumber !== 'undefined' && msg.revisionNumber) revisionNumber = msg.revisionNumber;
        if (typeof updateRevPill === 'function') updateRevPill();
        dirty = false; fileUnsaved = false;
        updateSaveStatus();
      } catch(e){}
      toast('Saved to project' + (msg.revisionNumber ? ' · rev ' + msg.revisionNumber : ''));
      return;
    }

    // The host's own "Save file" button (Send-to-Sales popup) triggers the
    // tool's native save dialog, so the PIC can keep a local backup.
    if (msg.type === 'boq:save-smbq') { try { saveFile(); } catch(e){} return; }
  });

  /* --- Embedded chrome ---------------------------------------------------
     Project identity belongs to the host's project record, not to the tool, so
     those fields are read-only here. The views re-render constantly, so re-apply
     whenever the DOM changes rather than once at startup. */
  function lockProjectFields(){
    (KIT.hooks.lockedFields || []).forEach(function(id){
      var el = document.getElementById(id);
      if (el && !el.readOnly) {
        el.readOnly = true;
        el.style.opacity = '0.65';
        el.style.cursor = 'not-allowed';
        el.title = 'Set from the project in MulyaOne';
      }
    });
  }
  // The embed ships without pdfMake/ExcelJS (the host exports server-side), so
  // the tool's own export buttons would dead-end on "pdfMake not loaded".
  function hideEmbeddedOnly(){
    var sel = KIT.hooks.hideWhenEmbedded;
    if (!sel) return;
    document.querySelectorAll(sel).forEach(function(b){
      if (b.style.display === 'none') return;
      b.style.display = 'none';
      var prev = b.previousElementSibling;          // the 1px divider before the first one
      var ps = prev && prev.getAttribute && prev.getAttribute('style');
      if (prev && prev.tagName === 'SPAN' && ps && /width:1px/.test(ps)) prev.style.display = 'none';
    });
  }
  function applyEmbedChrome(){ lockProjectFields(); hideEmbeddedOnly(); }

  /* --- A "Ready for quotation" alternative is locked ---------------------
     Saving a NEW version over it is blocked; the user unmarks Ready, or saves
     the working calc as a new alternative. Only applies to tools that have the
     alternatives tree. */
  if (typeof confirmCommit === 'function') {
    var _origConfirmCommit = confirmCommit;
    window.confirmCommit = function(){
      try {
        if (typeof _commit !== 'undefined' && _commit.mode === 'version') {
          var alt = getActiveAlt(), latest = alt && alt.versions && alt.versions[0];
          var viewingOld = !!(latest && activeVerNum && activeVerNum < latest.ver);
          if (latest && latest.status === 'Ready for quotation' && !viewingOld) {
            toast('Alt ' + alt.key + ' is marked Ready — unmark it to save a new version, or save as a new alternative.', 'warn');
            return;
          }
        }
      } catch(e){}
      return _origConfirmCommit.apply(this, arguments);
    };
  }

  // Everything below needs document.body and the tool's registered hooks, so it
  // waits for KIT.start() — the last line of the tool's INIT. kit.js calls this.
  KIT.onStart = function(){
    try {
      new MutationObserver(applyEmbedChrome).observe(document.body, {childList:true, subtree:true});
      applyEmbedChrome();
    } catch(e){}
    send({type:'boq:ready'});      // only now can we honour a boq:load
  };
})();
