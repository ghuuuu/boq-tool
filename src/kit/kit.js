/* ============================================================
   boq-kit · kit.js — shared chrome behaviour
   ------------------------------------------------------------
   Injected into every brand tool's <head>, BEFORE the tool's own <script>.
   Both are classic scripts, so they share one global scope: the `let`s below
   are the kit's own state, and the brand code may read/assign them freely
   (e.g. `dirty = false` after a commit).

   The kit knows nothing about what a brand sells. Where it needs the domain —
   to serialise state, to name a file, to describe an autosave — it asks
   through KIT.hooks, which the tool fills in at startup:

     KIT.register({ getState, applyLoadedState, fileBaseName, ... });
     KIT.start();                       // last line of the tool's INIT

   See BOQ-SHARED-CHROME.md §3 for what may and may not live here.
   ============================================================ */

const KIT = {
  hooks: {
    // --- required ---------------------------------------------------------
    getState:         () => ({}),          // → the full save-file object
    applyLoadedState: () => {},            // (state) restore it
    // --- optional ---------------------------------------------------------
    fileBaseName:     () => 'BOQ',         // filename stem, no extension
    stateHasContent:  () => true,          // (state) worth offering to restore?
    stateSummary:     () => '',            // (state) "1 unit, 2 items"
    onSidebarToggle:  null,                // called after collapse/expand
    manualUrl:        null,                // Help button target
    // --- embedded in a host (bridge.js) ------------------------------------
    lockedFields:     [],                  // CSS selectors the host owns, e.g. ['#projName']
    hideWhenEmbedded: null,                // selector for UI the host replaces (exports)
    // --- Revisions & Alternatives ------------------------------------------
    snapshot:         () => ({}),          // → deep-copyable image of the working calc
    restoreSnapshot:  () => {},            // (snap) put it back + repaint the tool
    stats:            () => ({total:0, unitsCount:0, itemsCount:0, priceList:''}),
    bufferTotal:      null,                // → number; null = no buffer concept, skip the gate
    repaint:          () => {},            // repaint the view hosting the revisions panel
    syncMeta:         () => {},            // flush project fields from the DOM into state
    // --- Handling: reorder / duplicate / copy (kit 1.10) --------------------
    rowList:          () => null,          // (sectionKey, containerId?) -> the row array
    containerList:    () => [],            // -> the array of units/areas
    containerRowArrays: () => [],          // (container) -> every row array inside it
    selection:        () => [],            // (sectionKey) -> the rows currently ticked
    scrubCopy:        r => r,              // (row, 'duplicate'|'copy') fix a copy up
    newId:            () => 'i'+Date.now().toString(36)+Math.random().toString(36).slice(2,7),
    afterRows:        () => {},            // (sectionKey) repaint after a row change
    afterContainers:  () => {},            // (focusId) repaint after a container change
    // --- Export guards (kit 1.10) ------------------------------------------
    requiredFields:   [],                  // [{sel,label,value()}] — blocked when empty
    goHome:           null,                // show the view those fields live on
    // --- Price list (kit 1.10) ---------------------------------------------
    priceListVersions: () => [],
    priceListLatest:   () => '',
    priceListCurrent:  () => '',
    repriceAll:        () => ({updated:0, notFound:0}),
    // --- Export picker (kit 1.11) ------------------------------------------
    exportUnits:      () => [],            // (altKey, ver|'working') -> units/areas
    totalOf:          () => 0,             // (units) -> money total
    itemCountOf:      () => 0,             // (units) -> line count
    exportOptions:    () => [],            // (kind) -> [{key,label,choices,default}]
    runExport:        () => {}             // (kind, sets, opts) render + download
  },
  register(h){ Object.assign(KIT.hooks, h); },
  started: false,
};

/* ===== Save-status state (kit-owned; brand code assigns these) ===== */
let dirty = false;
// fileUnsaved = there are changes not yet written to a FILE. Distinct from `dirty`
// (uncommitted working edits, cleared on version-commit) and from autosave
// (localStorage, device-local). Only a real save/load clears it — drives the close warning.
let fileUnsaved = false;
let _autosaveDebounce = null, _lastAutosaveAt = null;
let _autosaveState = null, _autosaveOfferOpen = false;

/* ====================================================================
   HELPERS
   ==================================================================== */
function el(id){return document.getElementById(id)}
function fmt(n){return'Rp '+Math.round(n).toLocaleString('id-ID')}
function fmtNum(n){return Math.round(n).toLocaleString('id-ID')}
// NOTE: there is deliberately no fmtShort/abbreviated-money helper. A BOQ is a priced
// document — every figure on screen is the real number, formatted by fmt() in full
// (Rp 12.500.000). Abbreviating to "Rp 13jt" hides 500.000 and invites a rounded figure
// into a quotation. If a card is too narrow for the number, make the card wider.

// Dates are stored/edited as ISO (YYYY-MM-DD, what <input type=date> needs) and shown as
// "13 Aug 2026" — on screen AND on the printed documents. Spelling the month out is the
// point: a purely numeric date is read day-first by some readers and month-first by
// others, and these documents go to clients.
function fmtDate(iso){
  if(!iso) return '';
  const d=new Date(String(iso)+'T00:00:00');
  return isNaN(d) ? String(iso)
    : d.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'});
}
// Filename date: YYYYMMDD (20261201). Deliberately not a display format — it exists so a
// folder of exports sorts chronologically by name (descending = newest first). Any
// day-first or month-first form would sort by day, which is useless.
function fmtDateFile(iso){ return iso ? String(iso).slice(0,10).replace(/-/g,'') : ''; }
function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}
function escAttr(s){return String(s||'').replace(/"/g,'&quot;').replace(/'/g,'&#39;')}
function openManual(){ const u=KIT.hooks.manualUrl; if(u) window.open(u,'_blank','noopener'); }

/* ====================================================================
   MODAL
   Labelled dialogs that trap Tab, close on Escape, and hand focus back to
   whatever opened them. Callers still pass plain `<div class="modal-head">…`
   markup — the roles and the trap are applied here.
   (Ported from the Beyond Teak a11y pass.)
   ==================================================================== */
let _modalReturnFocus = null;
function modalEl(){ return document.getElementById('modal-mount').querySelector('.modal'); }
function showModal(html, cls){
  const mount=document.getElementById('modal-mount');
  if(!modalEl()) _modalReturnFocus = document.activeElement;
  mount.innerHTML=`<div class="modal-backdrop" onclick="if(event.target===this)closeModal()">`
    +`<div class="modal${cls?' '+cls:''}" role="dialog" aria-modal="true" tabindex="-1">${html}</div></div>`;
  const m=modalEl();
  if(m){
    const head=m.querySelector('.modal-head');
    if(head){ if(!head.id) head.id='modalTitle'+Math.random().toString(36).slice(2,8); m.setAttribute('aria-labelledby',head.id); }
    // Focus the first real control; callers wanting a specific field re-focus it after.
    setTimeout(()=>{ const f=modalFocusables()[0]; (f||m).focus({preventScroll:true}); },0);
  }
  document.addEventListener('keydown', modalKeydown, true);
}
function closeModal(){
  document.removeEventListener('keydown', modalKeydown, true);
  document.getElementById('modal-mount').innerHTML='';
  if(_modalReturnFocus && document.contains(_modalReturnFocus)) _modalReturnFocus.focus();
  _modalReturnFocus=null;
}
function modalFocusables(){
  const m=modalEl(); if(!m) return [];
  return [...m.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')]
    .filter(e=>e.offsetWidth||e.offsetHeight||e.getClientRects().length);
}
function modalKeydown(e){
  if(!modalEl()) return;
  if(e.key==='Escape'){ e.preventDefault(); closeModal(); return; }
  if(e.key!=='Tab') return;
  const f=modalFocusables(); if(!f.length) return;
  const first=f[0], last=f[f.length-1];
  if(e.shiftKey && document.activeElement===first){ e.preventDefault(); last.focus(); }
  else if(!e.shiftKey && document.activeElement===last){ e.preventDefault(); first.focus(); }
}

/* ====================================================================
   TOAST
   ==================================================================== */
function toast(msg,type='success',dur=2500){
  const stack=document.getElementById('toast-stack');
  const t=document.createElement('div'); t.className='toast '+(type||'success');
  const icons={success:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`,warn:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,error:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`};
  t.innerHTML=(icons[type]||icons.success);
  const sp=document.createElement('span'); sp.textContent=msg; t.appendChild(sp);
  stack.appendChild(t); setTimeout(()=>{t.style.opacity='0';t.style.transform='translateY(10px)';t.style.transition='all .3s';setTimeout(()=>t.remove(),300);},dur);
}

/* ====================================================================
   SAVE STATUS + DIRTY TRACKING
   ==================================================================== */
function markDirty(){
  fileUnsaved=true;   // any edit means the file on disk is now stale
  if(!dirty){ dirty=true; _lastAutosaveAt=null; }
  updateSaveStatus();
  clearTimeout(_autosaveDebounce);
  _autosaveDebounce=setTimeout(()=>{ if(dirty) autosaveNow(); }, 2500);   // M365-style: autosave shortly after the edit
}
function updateSaveStatus(state){
  const c=document.getElementById('saveStatus'); if(!c) return;
  let txt, cls='rev-pill save-status', dot=false;
  if(state==='saving'){ txt='Saving…'; cls+=' saving'; }
  else if(!dirty){ txt='Saved'; cls+=' saved'; }
  else if(_lastAutosaveAt){ txt='Autosaved '+_lastAutosaveAt.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}); cls+=' autosaved'; }
  else { txt='Unsaved edits'; cls+=' unsaved'; dot=true; }
  c.className=cls;
  c.innerHTML=(dot?'<span class="dirty-dot"></span>':'')+esc(txt);
}
function updateDirtyIndicator(){ updateSaveStatus(); }   // legacy callers (incl. the MulyaOne bridge)
function updateAltVerChip(){ updateSaveStatus(); }       // legacy callers (chip replaced by save status)

/* ====================================================================
   AUTOSAVE + RECOVERY
   Unsaved-work protection: state is autosaved to localStorage every 30s while
   dirty and on beforeunload (which also warns); on startup a modal offers to
   restore or discard.
   ==================================================================== */
const AUTOSAVE_KEY = (typeof BRAND!=='undefined' && BRAND.autosaveKey)
  ? BRAND.autosaveKey
  : 'boq_autosave_' + ((typeof BRAND!=='undefined' && BRAND.brandKey) || 'XX');

function autosaveNow(){
  try{
    updateSaveStatus('saving');
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(Object.assign(KIT.hooks.getState(),{autosavedAt:new Date().toISOString()})));
    _lastAutosaveAt=new Date();
  }catch(e){}
  setTimeout(()=>updateSaveStatus(), 400);
}
function restoreAutosave(){
  _autosaveOfferOpen=false; closeModal();
  if(_autosaveState){
    KIT.hooks.applyLoadedState(_autosaveState);
    dirty=true; fileUnsaved=true; updateSaveStatus();
    toast('Autosaved work restored'); _autosaveState=null;
  }
}
function discardAutosave(){
  _autosaveOfferOpen=false; closeModal(); _autosaveState=null;
  try{localStorage.removeItem(AUTOSAVE_KEY);}catch(e){}
  toast('Autosave discarded','warn');
}
function offerAutosaveRestore(){
  let st=null;
  try{ st=JSON.parse(localStorage.getItem(AUTOSAVE_KEY)||'null'); }catch(e){}
  if(!st) return;
  if(!KIT.hooks.stateHasContent(st)){ try{localStorage.removeItem(AUTOSAVE_KEY);}catch(e){} return; }
  _autosaveState=st; _autosaveOfferOpen=true;
  const when=st.autosavedAt?new Date(st.autosavedAt).toLocaleString():'earlier';
  const what=KIT.hooks.stateSummary(st);
  showModal(`<div class="modal-head"><h2>Recover unsaved work?</h2></div>
    <div class="modal-body"><p style="font-size:13px;color:var(--ink-soft);margin:0">
      Unsaved work from <strong>${esc(when)}</strong> was auto-saved${what?` (${esc(what)})`:''}.
      Restore it, or discard and start fresh?
    </p></div>
    <div class="modal-foot">
      <button class="btn ghost" onclick="discardAutosave()">Discard</button>
      <button class="btn primary" onclick="restoreAutosave()">Restore</button>
    </div>`);
}

/* ====================================================================
   FILE SAVE / LOAD
   Native "Save As" dialog (showSaveFilePicker, Chrome/Edge). The picker MUST
   open immediately on the user's click (browsers only honour it inside the
   user-activation window), so saving is two-phase:
     pickSaveHandle(filename)  → open the dialog FIRST, returns {mode, handle}
     writePicked(pick, blob)   → later, write the generated file into the handle
   mode: 'picker' (dialog OK), 'cancelled' (user closed it), 'fallback' (no API
   or blocked, e.g. file:// pages — writePicked does a plain download instead).
   ==================================================================== */
async function pickSaveHandle(filename){
  if(!window.showSaveFilePicker) return {mode:'fallback',filename};
  const ext=filename.slice(filename.lastIndexOf('.'));
  const types={
    '.pdf':[{description:'PDF document',accept:{'application/pdf':['.pdf']}}],
    '.xlsx':[{description:'Excel workbook',accept:{'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':['.xlsx']}}],
  };
  types[BRAND.fileExt]=[{description:BRAND.brandName+' BOQ project',accept:{'application/json':[BRAND.fileExt]}}];
  try{
    const handle=await window.showSaveFilePicker({suggestedName:filename,types:types[ext]});
    return {mode:'picker',handle,filename};
  }catch(e){
    if(e&&e.name==='AbortError') return {mode:'cancelled',filename};
    return {mode:'fallback',filename};   // SecurityError etc. → plain download
  }
}
async function writePicked(pick, blob){
  if(pick.mode==='cancelled') return false;
  if(pick.mode==='picker'){
    const w=await pick.handle.createWritable(); await w.write(blob); await w.close();
    return true;
  }
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob); a.download=pick.filename;
  document.body.appendChild(a); a.click();
  setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},1000);
  return true;
}
// Back-compat one-shot helper (dialog + write in one call)
async function saveBlobAs(blob, filename){
  return writePicked(await pickSaveHandle(filename), blob);
}
async function saveFile(){
  const fname=KIT.hooks.fileBaseName()+BRAND.fileExt;   // whole project — no Alt segment
  const pick=await pickSaveHandle(fname);               // dialog first, while the click is fresh
  if(pick.mode==='cancelled'){ toast('Save cancelled','warn'); return; }
  const s=KIT.hooks.getState();
  await writePicked(pick, new Blob([JSON.stringify(s,null,2)],{type:'application/json'}));
  fileUnsaved=false;   // now safely on disk
  toast('Saved '+fname);
  try{localStorage.removeItem(AUTOSAVE_KEY);}catch(e){}
}
// Shared by the Load picker and the drag-and-drop handler below.
function readProjectFile(file){
  const reader=new FileReader();
  reader.onload=e=>{
    try{
      KIT.hooks.applyLoadedState(JSON.parse(e.target.result));
      // Opening a file supersedes a still-open "Recover unsaved work?" offer — otherwise
      // the modal stays up over the loaded project and Restore would clobber it.
      if(_autosaveOfferOpen){ _autosaveOfferOpen=false; _autosaveState=null; closeModal(); }
      toast('Loaded: '+file.name);
    }catch(err){toast('Failed to load: '+err.message,'error',5000);}
  };
  reader.onerror=()=>toast('Could not read '+file.name,'error',5000);
  reader.readAsText(file);
}
function loadFile(input){
  const file=input.files[0];
  if(file) readProjectFile(file);
  input.value='';
}

/* ---- Drag & drop a project file anywhere on the page ----
   Only file drags count: an internal row-reorder drag carries no 'Files' type, so the
   overlay never fires on it. Chrome emits dragenter/dragleave for every child element the
   pointer crosses, so a depth counter (not a boolean) decides when the overlay goes away. */
let _dragDepth=0, _pendingDrop=null;
function dragHasFile(e){
  const t=e.dataTransfer&&e.dataTransfer.types;
  return !!t && Array.prototype.indexOf.call(t,'Files')!==-1;
}
function showDropZone(on){ document.getElementById('dropZone')?.classList.toggle('on',on); }
function initDropLoad(){
  const okName=new RegExp('\\.('+BRAND.fileExt.slice(1)+'|json)$','i');
  window.addEventListener('dragenter', e=>{ if(!dragHasFile(e))return; e.preventDefault(); _dragDepth++; showDropZone(true); });
  window.addEventListener('dragover',  e=>{ if(!dragHasFile(e))return; e.preventDefault(); e.dataTransfer.dropEffect='copy'; });
  window.addEventListener('dragleave', e=>{ if(!dragHasFile(e))return; _dragDepth=Math.max(0,_dragDepth-1); if(!_dragDepth) showDropZone(false); });
  window.addEventListener('drop', e=>{
    if(!dragHasFile(e))return;
    e.preventDefault(); _dragDepth=0; showDropZone(false);
    const files=Array.from(e.dataTransfer.files||[]);
    if(!files.length) return;
    if(files.length>1){ toast(`Drop one ${BRAND.fileExt} file at a time`,'warn',4000); return; }
    const f=files[0];
    if(!okName.test(f.name)){ toast(`"${f.name}" is not a ${BRAND.fileExt} file`,'error',5000); return; }
    // A stray drag shouldn't silently bin unsaved work — confirm first when the file on disk is stale.
    if(fileUnsaved) confirmDropLoad(f); else readProjectFile(f);
  });
}
function confirmDropLoad(f){
  _pendingDrop=f;
  showModal(`<div class="modal-head"><h2>Open dropped file?</h2></div>
    <div class="modal-body"><p style="font-size:13px;color:var(--ink-soft);margin:0">
      Opening <strong>${esc(f.name)}</strong> replaces the project currently open, which has
      changes not yet saved to a <code>${esc(BRAND.fileExt)}</code> file. Save first if you need to keep them.
    </p></div>
    <div class="modal-foot">
      <button class="btn ghost" onclick="cancelDropLoad()">Cancel</button>
      <button class="btn primary" onclick="acceptDropLoad()">Open anyway</button>
    </div>`);
}
function acceptDropLoad(){ const f=_pendingDrop; _pendingDrop=null; closeModal(); if(f) readProjectFile(f); }
function cancelDropLoad(){ _pendingDrop=null; closeModal(); }

/* ====================================================================
   SIDEBAR — mobile drawer, collapse rail, drag-to-resize
   Width persists in localStorage and survives collapse/expand.
   ==================================================================== */
const SB_MIN_W=190, SB_MAX_W=460, SB_DEFAULT_W=260;
function toggleSidebar(){
  const sb=document.getElementById('sidebar');
  const ov=document.getElementById('sb-overlay');
  const open=sb.classList.toggle('open');
  if(ov) ov.style.display=open?'block':'none';
}
function setSidebarWidth(px){
  px=Math.max(SB_MIN_W,Math.min(SB_MAX_W,Math.round(px)));
  document.querySelector('.shell').style.setProperty('--sidebar-w', px+'px');
  return px;
}
function initSidebarResize(){
  const shell=document.querySelector('.shell');
  const resizer=document.getElementById('sb-resizer');
  if(!shell||!resizer) return;
  try{const s=parseInt(localStorage.getItem('sbWidth')); if(s) setSidebarWidth(s);}catch(e){}
  let dragging=false;
  const px=e=>(e.touches&&e.touches[0]?e.touches[0].clientX:e.clientX);
  const onDown=e=>{
    if(window.innerWidth<=900 || shell.classList.contains('sidebar-collapsed')) return;
    dragging=true; resizer.classList.add('dragging'); shell.classList.add('resizing');
    document.body.style.userSelect='none'; document.body.style.cursor='col-resize';
    e.preventDefault();
  };
  const onMove=e=>{
    if(!dragging) return;
    setSidebarWidth(px(e)-shell.getBoundingClientRect().left);
    if(e.cancelable) e.preventDefault();
  };
  const onUp=()=>{
    if(!dragging) return;
    dragging=false; resizer.classList.remove('dragging'); shell.classList.remove('resizing');
    document.body.style.userSelect=''; document.body.style.cursor='';
    const w=parseInt(getComputedStyle(shell).getPropertyValue('--sidebar-w'))||SB_DEFAULT_W;
    try{localStorage.setItem('sbWidth', w);}catch(e){}
  };
  resizer.addEventListener('mousedown', onDown);
  resizer.addEventListener('touchstart', onDown, {passive:false});
  window.addEventListener('mousemove', onMove);
  window.addEventListener('touchmove', onMove, {passive:false});
  window.addEventListener('mouseup', onUp);
  window.addEventListener('touchend', onUp);
  resizer.addEventListener('dblclick', ()=>{ setSidebarWidth(SB_DEFAULT_W); try{localStorage.setItem('sbWidth', SB_DEFAULT_W);}catch(e){} });
}
function toggleSidebarCollapse(){
  if(window.innerWidth<=900){return;}
  const collapsed=document.querySelector('.shell').classList.toggle('sidebar-collapsed');
  try{localStorage.setItem('sbCollapsed',collapsed?'1':'0');}catch(e){}
  KIT.hooks.onSidebarToggle?.(collapsed);
}

/* ====================================================================
   QTY STEPPER — paired up/down buttons injected next to a qty <input>,
   wrapped in .qtybox
   ==================================================================== */
const QSTEPS='<span class="qsteps">'
  +'<button type="button" tabindex="-1" onclick="stepQty(this,1)" aria-label="Increase quantity"><svg viewBox="0 0 12 8" width="11" height="7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 6L6 2L10 6"/></svg></button>'
  +'<button type="button" tabindex="-1" onclick="stepQty(this,-1)" aria-label="Decrease quantity"><svg viewBox="0 0 12 8" width="11" height="7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 2L6 6L10 2"/></svg></button>'
  +'</span>';
function stepQty(btn,d){
  const inp=btn.closest('.qtybox')?.querySelector('input'); if(!inp) return;
  let v=parseFloat(inp.value); if(!isFinite(v)) v=0;
  v=Math.round((v+d)*100)/100;   // step by whole units but preserve 2-decimal fractions (e.g. 1.23 → 2.23)
  const min=parseFloat(inp.min); if(isFinite(min)&&v<min) v=min; else if(v<0) v=0;
  inp.value=v;
  inp.dispatchEvent(new Event('change',{bubbles:true}));
}

/* ====================================================================
   REVISIONS & ALTERNATIVES
   The quotable version history that sits on top of the live working calc.
   Alternatives (Alt A/B/C…) are parallel schemes the client picks between;
   each holds immutable numbered versions with a status and its own date.

   Commit rules (do not change without changing the .smbq contract):
     · latest version is a Draft  → saving UPDATES IT IN PLACE, no new version
     · latest is Ready for quotation → saving creates ver+1 and marks all
       earlier versions Superseded
     · versions[0] is ALWAYS the newest

   The kit owns the tree; the brand owns what a snapshot *is* (KIT.hooks
   snapshot / restoreSnapshot / stats / bufferTotal / repaint).
   ==================================================================== */
let alts = [{key:'A', name:'Initial scheme', versions:[]}];
let activeAltKey = 'A', activeVerNum = null;
let _commit = {mode:'version', ready:false, nameError:false};

const _unitNoun = () => (typeof BRAND!=='undefined' && BRAND.unitNoun) || 'unit';
const _plural = (n,w) => n+' '+w+(n===1?'':'s');
function getActiveAlt(){ return alts.find(a=>a.key===activeAltKey) || alts[0]; }
function nextAltKey(){ return String.fromCharCode(65+alts.length); }

function openCommitModal(){ _commit={mode:'version', ready:false, nameError:false}; bufferGateThenCommit(); }
function openNewAltModal(){ _commit={mode:'alt', ready:false, nameError:false}; bufferGateThenCommit(); }
function commitToggleReady(){ _commit.ready=!_commit.ready; renderCommitModal(true); }
function commitSwitchMode(){ _commit.mode=_commit.mode==='alt'?'version':'alt'; _commit.nameError=false; renderCommitModal(); }

// A BOQ with no buffer items gets a dedicated warning FIRST (Back / Continue anyway),
// then the commit modal. Skipped entirely for brands with no buffer concept.
function bufferGateThenCommit(){
  const bt=KIT.hooks.bufferTotal;
  if(!bt || bt()>0){ renderCommitModal(); return; }
  showModal(`
    <div class="modal-head"><h2>No buffer items</h2>
      <button class="icon-x" onclick="closeModal()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
    </div>
    <div class="modal-body" style="display:flex;flex-direction:column;align-items:center;text-align:center;gap:12px;padding-top:22px;padding-bottom:8px">
      <span style="width:64px;height:64px;border-radius:18px;display:grid;place-items:center;background:color-mix(in srgb,var(--buffer) 14%,transparent);border:1.5px solid color-mix(in srgb,var(--buffer) 40%,transparent);color:var(--buffer)">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="32" height="32"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
      </span>
      <div style="font-size:16px;font-weight:800;color:var(--buffer)">This BOQ has no buffer items</div>
      <div style="font-size:13px;color:var(--ink-soft);line-height:1.6;max-width:380px">Buffer items are insurance stock — counted in the quotation but excluded from the Sales Order. Consider marking spare items with the <strong style="color:var(--buffer)">shield button</strong> on the item rows before saving this version.</div>
    </div>
    <div class="modal-foot">
      <button class="btn ghost" onclick="closeModal()">Back</button>
      <button class="btn" style="background:var(--buffer);border-color:var(--buffer);color:#fff" onclick="renderCommitModal()">Continue anyway</button>
    </div>`);
}

function renderCommitModal(keepInputs){
  KIT.hooks.syncMeta();
  const s=KIT.hooks.stats();
  const isAlt=_commit.mode==='alt';
  const alt=getActiveAlt(), latest=alt.versions[0]||null;
  const viewingOld=!!(latest&&activeVerNum&&activeVerNum<latest.ver);
  const canOverwrite=!!(latest&&latest.status==='Draft'&&!viewingOld);
  const nextKey=nextAltKey(), nextVer=(latest?latest.ver:0)+1, saveVer=canOverwrite?latest.ver:nextVer;
  const prevNote=keepInputs?(document.getElementById('cmt-note')?.value||''):'';
  const prevName=keepInputs?(document.getElementById('cmt-name')?.value||''):'';
  const title=isAlt?'Save as New Alternative':(canOverwrite?'Update Draft Version':'Save New Version');
  const headline=isAlt
    ? ('Saves the working calculation as Alt '+nextKey+' · v1 — a separate option the client picks between. Alt '+alt.key+' keeps its own versions.')
    : (canOverwrite
      ? ('Alt '+alt.key+' · v'+latest.ver+' is still a draft, so saving updates it in place. No new version is created.')
      : ('Saves the working calculation as Alt '+alt.key+' · v'+nextVer+'.'+(latest?(' v'+latest.ver+' stays in the history below it — the newest ready version is the one you quote.'):' This is the first saved version of this alternative.')));
  const switchHint=isAlt?('Just updating Alt '+alt.key+' instead?'):'Offering the client a different scheme instead?';
  const switchLabel=isAlt?((canOverwrite?'Update v':'Save as v')+saveVer+' of Alt '+alt.key):('Save as a new alternative (Alt '+nextKey+')');
  const confirmLabel=isAlt?('Save Alt '+nextKey+' · v1'):((canOverwrite?'Update Alt ':'Save Alt ')+alt.key+' · v'+saveVer);
  const countsLabel=_plural(s.unitsCount,_unitNoun())+' · '+s.itemsCount+' items'+(s.priceList?' · pricelist '+s.priceList:'');
  const nameBorder=_commit.nameError?'var(--danger)':'var(--line)';
  const readyBox=`width:18px;height:18px;border-radius:5px;flex-shrink:0;margin-top:1px;display:flex;align-items:center;justify-content:center;border:1.5px solid ${_commit.ready?'var(--good)':'var(--line)'};background:${_commit.ready?'var(--good)':'var(--surface)'};color:#fff`;
  showModal(`
      <div class="modal-head"><h2>${esc(title)}</h2>
        <button class="icon-x" onclick="closeModal()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14" height="14"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
      </div>
      <div class="modal-body" style="display:flex;flex-direction:column;gap:12px">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 13px;background:var(--panel);border:1px solid var(--line);border-radius:8px">
          <div><div style="font-size:10.5px;color:var(--ink-faint);text-transform:uppercase;letter-spacing:.07em;font-weight:700">Working calculation</div>
            <div style="font-size:11.5px;color:var(--ink-faint);margin-top:2px">${esc(countsLabel)}</div></div>
          <div class="mono" style="font-weight:700;font-size:15px;color:var(--accent)">${fmt(s.total)}</div>
        </div>
        <div style="font-size:12.5px;color:var(--ink-faint);line-height:1.6">${esc(headline)}</div>
        ${isAlt?`<div class="field"><label>Alternative name</label>
          <input class="input compact" id="cmt-name" placeholder="e.g. Dekton benchtop, Budget scheme…" value="${escAttr(prevName)}" style="border-color:${nameBorder}">
          ${_commit.nameError?`<div style="font-size:11.5px;color:var(--danger);font-weight:600;margin-top:4px">Name this alternative before saving — e.g. "Dekton benchtop".</div>`:''}</div>`:''}
        <div class="field"><label>What changed <span style="font-weight:600;text-transform:none;letter-spacing:0">(revision note)</span></label>
          <input class="input compact" id="cmt-note" placeholder="e.g. Client removed island unit, switched finish to Collalto Gold" value="${escAttr(prevNote)}"></div>
        <div onclick="commitToggleReady()" style="display:flex;align-items:flex-start;gap:10px;padding:11px 13px;border:1px solid var(--line);border-radius:8px;cursor:pointer;background:var(--panel)">
          <span style="${readyBox}">${_commit.ready?'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" width="12" height="12"><path d="M20 6 9 17l-5-5"/></svg>':''}</span>
          <div><div style="font-size:13px;font-weight:700">Ready for quotation</div>
            <div style="font-size:11.5px;color:var(--ink-faint);margin-top:2px">Marks this version as final — the one to quote to the client. Untick to keep it as a draft — you can mark it ready later.</div></div>
        </div>
        <div style="font-size:12px;color:var(--ink-faint)">${esc(switchHint)} <span onclick="commitSwitchMode()" style="color:var(--accent);font-weight:700;cursor:pointer;text-decoration:underline">${esc(switchLabel)}</span></div>
      </div>
      <div class="modal-foot">
        <button class="btn" onclick="closeModal()">Cancel</button>
        <button class="btn primary" onclick="confirmCommit()">${esc(confirmLabel)}</button>
      </div>`);
}

function confirmCommit(){
  KIT.hooks.syncMeta();
  const s=KIT.hooks.stats();
  const note=(document.getElementById('cmt-note')?.value||'').trim();
  const name=(document.getElementById('cmt-name')?.value||'').trim();
  const entry={
    date:new Date().toISOString().split('T')[0],
    status:_commit.ready?'Ready for quotation':'Draft',
    note, total:s.total, unitsCount:s.unitsCount, itemsCount:s.itemsCount,
    priceList:s.priceList,
    snapshot:JSON.parse(JSON.stringify(KIT.hooks.snapshot())),
  };
  if(_commit.mode==='alt'){
    if(!name){ _commit.nameError=true; renderCommitModal(true); toast('Give the new alternative a name (e.g. "Dekton benchtop").','warn'); return; }
    const key=nextAltKey();
    alts=[...alts, {key, name, versions:[{...entry, ver:1}]}];
    activeAltKey=key; activeVerNum=1; dirty=false;
    toast('Saved as Alt '+key+' · v1 — '+name);
  } else {
    const alt=getActiveAlt(), latest=alt.versions[0];
    const viewingOld=!!(latest&&activeVerNum&&activeVerNum<latest.ver);
    if(latest && latest.status==='Draft' && !viewingOld){
      alts=alts.map(a=> a.key!==alt.key ? a : {...a, versions:[{...entry, ver:latest.ver, note:note||latest.note}, ...a.versions.slice(1)]});
      activeVerNum=latest.ver; dirty=false;
      toast('Updated Alt '+alt.key+' · v'+latest.ver+' — draft updated in place, no new version');
    } else {
      const ver=(latest?latest.ver:0)+1;
      alts=alts.map(a=> a.key!==alt.key ? a : {...a, versions:[{...entry, ver}, ...a.versions.map(v=>({...v, status:'Superseded'}))]});
      activeVerNum=ver; dirty=false;
      toast('Saved Alt '+alt.key+' · v'+ver+(ver>1?' — v'+(ver-1)+' kept in history':''));
    }
  }
  closeModal(); updateSaveStatus(); KIT.hooks.repaint();
}

function loadVersion(altKey, ver){
  if(dirty && !window.confirm('Discard unsaved edits and load Alt '+altKey+' · v'+ver+'?')) return;
  const alt=alts.find(a=>a.key===altKey); const v=alt&&alt.versions.find(x=>x.ver===ver); if(!v) return;
  activeAltKey=altKey; activeVerNum=ver; dirty=false;
  KIT.hooks.restoreSnapshot(JSON.parse(JSON.stringify(v.snapshot)));
  updateSaveStatus();
  const latest=alt.versions[0];
  toast('Loaded Alt '+altKey+' · v'+ver+(latest&&latest.ver>ver?' (older version)':''));
}

function toggleReady(altKey){
  alts=alts.map(a=>{
    if(a.key!==altKey||!a.versions.length) return a;
    const latest=a.versions[0];
    const status=latest.status==='Ready for quotation'?'Draft':'Ready for quotation';
    return {...a, versions:[{...latest, status}, ...a.versions.slice(1)]};
  });
  const alt=alts.find(a=>a.key===altKey);
  if(alt&&alt.versions.length) toast('Alt '+altKey+' · v'+alt.versions[0].ver+' → '+alt.versions[0].status);
  KIT.hooks.repaint();
}

function deleteAlt(key){
  const alt=alts.find(a=>a.key===key); if(!alt) return;
  if(alts.length<=1){ toast("A BOQ needs at least one alternative — you can't delete the last one",'warn'); return; }
  const label='Alt '+key+(alt.name?' — '+alt.name:'');
  if(!window.confirm('Delete '+label+'? Its saved versions will be removed. This can\'t be undone.')) return;
  const remaining=alts.filter(a=>a.key!==key);
  const relettered=remaining.map((a,i)=>({...a, key:String.fromCharCode(65+i)}));
  const wasActive=activeAltKey===key;
  const newActive=wasActive?relettered[0]:relettered[remaining.findIndex(a=>a.key===activeAltKey)];
  alts=relettered; activeAltKey=(newActive&&newActive.key)||'A';
  if(wasActive){
    const latest=newActive&&newActive.versions[0];
    activeVerNum=latest?latest.ver:null;
    if(latest&&latest.snapshot){ dirty=false; KIT.hooks.restoreSnapshot(JSON.parse(JSON.stringify(latest.snapshot))); }
  }
  updateSaveStatus(); KIT.hooks.repaint(); toast('Deleted '+label);
}

function renameAlt(key,val){ const a=alts.find(a=>a.key===key); if(a){ a.name=val; markDirty(); KIT.hooks.repaint(); } }
// Pencil button on an alternative row: swap the name <span> for an input (the row
// itself stays clickable to switch alternatives).
function editAltName(key){
  const a=alts.find(x=>x.key===key); if(!a) return;
  const span=document.getElementById('altname-'+key); if(!span) return;
  const inp=document.createElement('input');
  inp.type='text'; inp.value=a.name;
  inp.style.cssText='min-width:140px;max-width:260px;background:var(--panel2);border:1px solid color-mix(in srgb,var(--accent) 55%,transparent);border-radius:6px;font-size:13.5px;font-weight:700;color:var(--ink);font-family:inherit;outline:none;padding:2px 8px';
  inp.onclick=e=>e.stopPropagation();
  let done=false;
  const commit=()=>{ if(done) return; done=true; renameAlt(key,(inp.value||'').trim()||a.name); };
  inp.onkeydown=e=>{ e.stopPropagation(); if(e.key==='Enter') commit(); if(e.key==='Escape'){ done=true; KIT.hooks.repaint(); } };
  inp.onblur=commit;
  span.replaceWith(inp); inp.focus(); inp.select();
}

function selectAlt(key){
  if(key===activeAltKey) return;
  const alt=alts.find(a=>a.key===key); if(!alt) return;
  const latest=alt.versions[0];
  if(latest){ loadVersion(key, latest.ver); return; }
  if(dirty && !window.confirm('Switch to Alt '+key+'? Your unsaved edits stay in the editor and can be saved into Alt '+key+' as v1.')) return;
  activeAltKey=key; activeVerNum=null;
  updateSaveStatus(); KIT.hooks.repaint();
  toast('Now editing Alt '+key+' — use "Save as v1" when ready');
}

function renderRevisionsPanel(){
  const stColor=st=> st==='Ready for quotation'?'var(--good)':st==='Draft'?'var(--warn)':'var(--ink-faint)';
  const pill=c=>`display:inline-flex;align-items:center;padding:2px 9px;border-radius:999px;font-size:10.5px;font-weight:700;letter-spacing:.03em;color:${c};background:color-mix(in srgb,${c} 12%,transparent);border:1px solid color-mix(in srgb,${c} 30%,transparent);white-space:nowrap;flex-shrink:0`;
  const alt=getActiveAlt(), activeLatest=alt.versions[0]||null;
  const viewingOld=!!(activeLatest&&activeVerNum&&activeVerNum<activeLatest.ver);
  const canOverwrite=!!(activeLatest&&activeLatest.status==='Draft'&&!viewingOld);
  const nextVer=(activeLatest?activeLatest.ver:0)+1, saveVer=canOverwrite?activeLatest.ver:nextVer;
  const saveBtnLabel=canOverwrite?('Update v'+saveVer):('Save as v'+nextVer);
  const dirtyColor=dirty?'var(--warn)':'var(--ink-faint)';
  const workingLabel='Editing Alt '+alt.key+(activeVerNum?' · v'+activeVerNum:' · no saved version yet')+(dirty?' · unsaved edits':'');
  const workingChip=`display:inline-flex;align-items:center;gap:6px;padding:3px 10px;border-radius:999px;font-size:11px;font-weight:700;font-family:var(--font-num);font-variant-numeric:tabular-nums;white-space:nowrap;color:${dirtyColor};background:color-mix(in srgb,${dirtyColor} 10%,transparent);border:1px solid color-mix(in srgb,${dirtyColor} 30%,transparent)`;
  const altRows=alts.map(a=>{
    const latest=a.versions[0]||null;
    const isActive=a.key===activeAltKey;
    const badgeStyle=`display:inline-flex;align-items:center;padding:3px 9px;border-radius:6px;font-size:10.5px;font-weight:800;letter-spacing:.06em;font-family:var(--font-num);font-variant-numeric:tabular-nums;flex-shrink:0;background:${isActive?'var(--accent)':'color-mix(in srgb,var(--ink-faint) 14%,transparent)'};color:${isActive?'var(--on-accent)':'var(--ink-faint)'}`;
    const rowStyle=`display:flex;flex-direction:column;gap:8px;padding:11px 13px;border-radius:10px;cursor:${isActive?'default':'pointer'};border:1px solid ${isActive?'color-mix(in srgb,var(--accent) 45%,transparent)':'var(--line)'};background:${isActive?'color-mix(in srgb,var(--accent) 6%,transparent)':'transparent'};margin-bottom:8px`;
    const verChips=a.versions.slice().reverse().map(v=>{
      const isLoaded=isActive&&activeVerNum===v.ver, isLatest=latest&&v.ver===latest.ver;
      const chip=`padding:3px 11px;border-radius:999px;font-size:11px;font-weight:700;font-family:var(--font-num);font-variant-numeric:tabular-nums;cursor:pointer;white-space:nowrap;flex-shrink:0;border:1px solid ${isLoaded?'var(--accent)':(isLatest?'color-mix(in srgb,var(--accent) 42%,transparent)':'var(--line)')};background:${isLoaded?'var(--accent)':'transparent'};color:${isLoaded?'var(--on-accent)':(isLatest?'var(--accent)':'var(--ink-faint)')}`;
      const title='Alt '+a.key+' · v'+v.ver+' · '+v.status+' · '+fmtDate(v.date)+' · '+fmt(v.total)+(v.note?' — '+v.note:'');
      const dstyle='font-size:12.5px;color:var(--accent);cursor:pointer;font-family:var(--font-num);font-variant-numeric:tabular-nums;border-bottom:1px dashed var(--accent);padding-bottom:1px;flex-shrink:0';
      return `<span style="display:inline-flex;align-items:center;gap:6px;flex-shrink:0">
        <button style="${chip}" title="${escAttr(title)}" onclick="event.stopPropagation();loadVersion('${a.key}',${v.ver})">v${v.ver}</button>
        <span id="vdate-${a.key}-${v.ver}" style="${dstyle}" title="Click to edit this version's date" onclick="event.stopPropagation();editVersionDate('${a.key}',${v.ver})">${esc(fmtDate(v.date)||'—')}</span>
      </span>`;
    }).join('');
    const metaLine=latest?('latest v'+latest.ver+(latest.note?' — '+esc(latest.note):'')):'no versions yet — use "Save as v1"';
    const readyLabel=latest&&latest.status==='Ready for quotation'?'Back to Draft':'Mark Ready';
    return `<div style="${rowStyle}" ${isActive?'':`onclick="selectAlt('${a.key}')"`} title="${isActive?'':'Click to switch to this alternative'}">
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <span style="${badgeStyle}">ALT ${a.key}</span>
        <span id="altname-${a.key}" style="font-size:13.5px;font-weight:700;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0">${esc(a.name)}</span>
        <button class="sb-del sb-edit" onclick="event.stopPropagation();editAltName('${a.key}')" title="Rename this alternative"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg></button>
        <span style="flex:1"></span>
        <span style="${pill(latest?stColor(latest.status):'var(--ink-faint)')}">${latest?esc(latest.status):'Not saved yet'}</span>
        <span class="mono" style="font-weight:700;font-size:13px;color:var(--accent)">${latest?fmt(latest.total):'—'}</span>
      </div>
      <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
        ${verChips}
        <span style="font-size:11.5px;color:var(--ink-faint)">${metaLine}</span>
        <span style="flex:1"></span>
        ${latest?`<button class="btn btn-xs" onclick="event.stopPropagation();toggleReady('${a.key}')">${readyLabel}</button>`:''}
        ${alts.length<=1?'':`<button class="btn btn-xs danger" onclick="event.stopPropagation();deleteAlt('${a.key}')" title="Delete this alternative"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>`}
      </div>
    </div>`;
  }).join('');
  const oldBanner=viewingOld?`<div style="display:flex;align-items:center;gap:10px;padding:9px 13px;background:var(--warn-bg);border:1px solid color-mix(in srgb,var(--warn) 40%,transparent);border-radius:8px;flex-wrap:wrap;margin-bottom:10px">
    <span style="font-size:12.5px;color:var(--warn);font-weight:600;flex:1;min-width:200px">Viewing older version Alt ${alt.key} · v${activeVerNum}. Saving will add a new version on top of the latest.</span>
    <button class="btn btn-xs" onclick="loadVersion('${alt.key}',${activeLatest.ver})">Load latest</button></div>`:'';
  return `<div class="card" style="margin-bottom:16px">
    <div class="card-head"><div class="row" style="gap:10px;flex-wrap:wrap;align-items:center">
        <div class="card-title">Revisions &amp; Alternatives</div>
        <span style="${workingChip}">${esc(workingLabel)}</span></div>
      <div class="row" style="gap:8px">
        <button class="btn btn-sm primary-outline" onclick="openNewAltModal()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="13" height="13"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>New Alternative</button>
        <button class="btn btn-sm primary" onclick="openCommitModal()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="13" height="13"><path d="M20 6 9 17l-5-5"/></svg>${saveBtnLabel}</button>
      </div>
    </div>
    <div class="card-body">
      <div style="font-size:12px;color:var(--ink-faint);line-height:1.6;margin-bottom:10px"><b style="color:var(--ink)">How it works:</b> build the calculation, then <b style="color:var(--ink)">save it as a version</b> (while a version is still a draft, saving updates it in place; once it's marked Ready, saving creates v2, v3… — the newest is the one you quote). Offering the client a different scheme? Save it as a <b style="color:var(--ink)">new alternative</b> (Alt B) — alternatives sit side by side and the client picks one. Everything travels inside the <b style="color:var(--ink)">${esc(BRAND.fileExt)}</b> file.</div>
      ${oldBanner}
      ${altRows}
    </div>
  </div>`;
}

// Per-version quotation date (shown in exports). Editable inline in the panel.
function editVersionDate(altKey,ver){
  const span=document.getElementById('vdate-'+altKey+'-'+ver); if(!span) return;
  const a=alts.find(x=>x.key===altKey); const v=a&&a.versions.find(x=>x.ver===ver); if(!v) return;
  const inp=document.createElement('input'); inp.type='date'; inp.value=v.date||'';
  inp.style.cssText='font-size:12.5px;font-family:var(--font-num);width:128px;height:24px;box-sizing:border-box;padding:1px 6px;border:1px solid var(--accent);border-radius:5px;background:#fff;color:var(--ink)';
  inp.onclick=e=>e.stopPropagation();
  let done=false;
  const commit=()=>{ if(done) return; done=true; if(inp.value&&inp.value!==v.date) setVersionDate(altKey,ver,inp.value); else KIT.hooks.repaint(); };
  inp.onchange=commit; inp.onblur=commit;
  inp.onkeydown=e=>{ e.stopPropagation(); if(e.key==='Enter') commit(); if(e.key==='Escape'){ done=true; KIT.hooks.repaint(); } };
  span.replaceWith(inp); inp.focus();
}
function setVersionDate(altKey,ver,val){
  if(!val) return;
  const a=alts.find(x=>x.key===altKey); const v=a&&a.versions.find(x=>x.ver===ver); if(!v) return;
  v.date=val; fileUnsaved=true; autosaveNow(); KIT.hooks.repaint();
  toast('Alt '+altKey+' · v'+ver+' dated '+fmtDate(val));
}

/* ====================================================================
   HANDLING — reorder, duplicate, copy between containers
   --------------------------------------------------------------------
   A BOQ is a list of containers (SM: units/rooms, BT & CL: areas), each
   holding lists of rows per section. Every tool needs the same four gestures
   on those lists, so the kit owns them and the brand only says WHICH list:

     KIT.hooks.rowList(key, containerId)  -> the array of rows (containerId
                                             omitted = the container on screen)
     KIT.hooks.containerList()            -> the array of containers
     KIT.hooks.newId(prefix)              -> a fresh row/container id
     KIT.hooks.afterRows(key)             -> repaint after a row change
     KIT.hooks.afterContainers(focusId)   -> repaint after a container change
     KIT.hooks.selection()                -> the rows currently ticked
     KIT.hooks.containerRowArrays(c)      -> every row array inside a container

   A drag starts only from a grip (.col-drag on a row, .drag-handle on a
   container), so dragging a select or an input inside a row still does what
   that control expects.
   ==================================================================== */
let _mousedownEl = null;
document.addEventListener('mousedown', e => { _mousedownEl = e.target; });
let _drag = {kind:null, key:null, id:null};

const KIT_GRIP = '<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" aria-hidden="true"><circle cx="9" cy="5" r="1.6"/><circle cx="15" cy="5" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="19" r="1.6"/><circle cx="15" cy="19" r="1.6"/></svg>';
/** A row's grip cell, and a container's grip handle. Markup, so brands can inline them. */
// Harvested from the Stella Mobili tool: the element is draggable only while the
// grip is held. Without this, a click inside a text input lands the caret inside a
// draggable ancestor and the browser starts a drag instead of an edit.
const _GRIP_DOWN = 'onmousedown="kitGripDown(this)"';
function gripCell(){ return '<td class="col-drag" title="Drag to reorder" '+_GRIP_DOWN+'>'+KIT_GRIP+'</td>'; }
function gripHandle(){ return '<span class="drag-handle" title="Drag to reorder" onclick="event.stopPropagation()" '+_GRIP_DOWN+'>'+KIT_GRIP+'</span>'; }
function kitGripDown(el){
  _mousedownEl = el;                                  // the two guards agree
  const d = el.closest('[data-drag-kind]'); if(d) d.draggable = true;
}
document.addEventListener('mouseup', () => {
  document.querySelectorAll('[data-drag-kind][draggable="true"]').forEach(el=>{ el.draggable=false; });
});

/**
 * Attributes that make an element draggable-in-place. Put them on the <tr>
 * (kind 'row', key = section) or the sidebar item (kind 'container').
 */
function dragAttrs(kind, key, id){
  return 'draggable="false" data-drag-kind="'+escAttr(kind)+'" data-drag-key="'+escAttr(key==null?'':key)
       + '" data-drag-id="'+escAttr(id)+'" ondragstart="kitDragStart(event)" ondragover="kitDragOver(event)"'
       + ' ondrop="kitDrop(event)" ondragend="kitDragEnd()"';
}
function _dragEls(kind){ return document.querySelectorAll('[data-drag-kind="'+kind+'"]'); }
function _dragEl(kind, id){ return document.querySelector('[data-drag-kind="'+kind+'"][data-drag-id="'+id+'"]'); }
function _dragData(e){
  const el = e.currentTarget;
  return {el, kind:el.getAttribute('data-drag-kind'), key:el.getAttribute('data-drag-key'),
          id:el.getAttribute('data-drag-id')};
}
function kitDragStart(e){
  if(!_mousedownEl || !_mousedownEl.closest('.col-drag,.drag-handle')){ e.preventDefault(); return; }
  _mousedownEl = null;
  const d = _dragData(e);
  _drag = {kind:d.kind, key:d.key, id:d.id};
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', d.id);
  setTimeout(()=>{ const el=_dragEl(d.kind, d.id); if(el) el.classList.add('dragging'); }, 0);
}
function kitDragOver(e){
  const d = _dragData(e);
  if(d.kind !== _drag.kind || d.key !== _drag.key) return;   // only within the same list
  e.preventDefault(); e.dataTransfer.dropEffect = 'move';
  _dragEls(d.kind).forEach(el=>el.classList.remove('drop-above','drop-below'));
  if(d.id === _drag.id) return;
  const r = d.el.getBoundingClientRect();
  d.el.classList.add(e.clientY < r.top + r.height/2 ? 'drop-above' : 'drop-below');
}
function kitDrop(e){
  const d = _dragData(e);
  _dragEls(d.kind).forEach(el=>el.classList.remove('drop-above','drop-below'));
  if(d.kind !== _drag.kind || d.key !== _drag.key || d.id === _drag.id) return;
  e.preventDefault();
  const list = d.kind==='container' ? KIT.hooks.containerList() : KIT.hooks.rowList(d.key);
  if(!Array.isArray(list)) return;
  const srcIdx = list.findIndex(x=>String(x.id)===String(_drag.id));
  if(srcIdx < 0) return;
  const rect = d.el.getBoundingClientRect();
  const after = e.clientY > rect.top + rect.height/2;
  const [moved] = list.splice(srcIdx, 1);
  const tgtIdx = list.findIndex(x=>String(x.id)===String(d.id));
  if(tgtIdx < 0){ list.splice(srcIdx, 0, moved); return; }   // target vanished — put it back
  list.splice(after ? tgtIdx+1 : tgtIdx, 0, moved);
  markDirty();
  const kind = d.kind, key = d.key;
  _drag = {kind:null, key:null, id:null};
  if(kind==='container') KIT.hooks.afterContainers(null); else KIT.hooks.afterRows(key);
}
function kitDragEnd(){
  _drag = {kind:null, key:null, id:null};
  document.querySelectorAll('[data-drag-kind]').forEach(el=>
    el.classList.remove('dragging','drop-above','drop-below'));
}

/** A copy of the row, directly below it — the fastest way to quote a near-identical line. */
function duplicateRow(key, id){
  const list = KIT.hooks.rowList(key);
  if(!Array.isArray(list)) return;
  const i = list.findIndex(r=>String(r.id)===String(id));
  if(i < 0) return;
  const copy = KIT.hooks.scrubCopy(JSON.parse(JSON.stringify(list[i])), 'duplicate');
  copy.id = KIT.hooks.newId('row');
  list.splice(i+1, 0, copy);
  markDirty(); KIT.hooks.afterRows(key);
  toast('Line duplicated');
}

/** The whole container again — same rows, new ids, "(copy)" appended. */
function duplicateContainer(id){
  const list = KIT.hooks.containerList();
  const i = list.findIndex(c=>String(c.id)===String(id));
  if(i < 0) return;
  const copy = JSON.parse(JSON.stringify(list[i]));
  copy.id = KIT.hooks.newId('container');
  copy.name = (list[i].name||'') + ' (copy)';
  (KIT.hooks.containerRowArrays(copy)||[]).forEach(rows =>
    rows.forEach(r => { r.id = KIT.hooks.newId('row'); }));
  list.splice(i+1, 0, copy);
  markDirty(); KIT.hooks.afterContainers(copy.id);
  toast('Duplicated: ' + copy.name);
}

/** Copy the ticked rows into another container — they stay here too. */
function openCopyToContainer(key){
  const sel = KIT.hooks.selection(key) || [];
  if(!sel.length) return;
  const noun = (typeof BRAND!=='undefined' && BRAND.unitNoun) || 'container';
  const here = KIT.hooks.rowList(key);
  const others = (KIT.hooks.containerList()||[]).filter(c => (KIT.hooks.containerRowArrays(c)||[]).indexOf(here) < 0);
  if(!others.length){ toast('There is only one ' + noun + ' — add another first','warn'); return; }
  _copyKey = key;
  showModal(
    '<div class="modal-head"><h2>Copy ' + sel.length + ' line' + (sel.length===1?'':'s') + ' to another ' + esc(noun) + '</h2>'
    + '<button class="icon-x" onclick="closeModal()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div>'
    + '<div class="modal-body"><div class="field"><label>Destination ' + esc(noun) + '</label>'
    + '<select class="select" id="copyDest">' + others.map(c=>'<option value="'+escAttr(c.id)+'">'+esc(c.name)+'</option>').join('') + '</select></div>'
    + '<div class="hint" style="margin-top:8px">The lines stay where they are — this copies them.</div></div>'
    + '<div class="modal-foot"><button class="btn" onclick="closeModal()">Cancel</button>'
    + '<button class="btn primary" onclick="confirmCopyToContainer()">Copy</button></div>');
}
let _copyKey = null;
function confirmCopyToContainer(){
  const destId = (document.getElementById('copyDest')||{}).value;
  const dest = (KIT.hooks.containerList()||[]).find(c=>String(c.id)===String(destId));
  const target = KIT.hooks.rowList(_copyKey, destId);
  const sel = KIT.hooks.selection(_copyKey) || [];
  if(!dest || !Array.isArray(target) || !sel.length){ closeModal(); return; }
  sel.forEach(r => {
    const c = KIT.hooks.scrubCopy(JSON.parse(JSON.stringify(r)), 'copy');
    c.id = KIT.hooks.newId('row'); target.push(c);
  });
  closeModal(); markDirty(); KIT.hooks.afterContainers(null); KIT.hooks.afterRows(_copyKey);
  toast('Copied ' + sel.length + ' line' + (sel.length===1?'':'s') + ' to ' + dest.name);
}

/* ====================================================================
   VERSION CHIPS — the topbar's four states, one row, one code path
   --------------------------------------------------------------------
   Every tool carries the same four facts and had been writing them out
   three different ways (SM used .rev-pill and its own #revPill wording,
   BT and CL each defined a local .chip alias and a .pl-chip):

     save status   the kit's autosave state machine  (#saveStatus)
     price list    which list this BOQ is priced from (#plChip)
     tool version  this brand's TOOL_VERSION          (#toolVer)
     kit version   the shared chrome it is built on   (#kitVer)

   Mount it once, in the topbar:  <div class="topbar-actions" id="verChips">
   then  mountVersionChips()  in INIT, before the first render.

     KIT.hooks.toolVersion()      -> 'v1.4.0'
     KIT.hooks.priceListCurrent() -> the version this BOQ uses, or null
     KIT.hooks.priceListLatest()  -> the newest published, or null

   A brand with no price list (CDN Lighting, until its catalogue lands)
   returns null from both and gets the same chip reading "No price list" —
   same markup, same slot, same code, so the row still lines up.
   ==================================================================== */
function mountVersionChips(){
  const m = document.getElementById('verChips'); if(!m) return;
  m.insertAdjacentHTML('afterbegin',
      '<span class="rev-pill save-status" id="saveStatus" title="Autosave status">Not saved</span>'
    + '<span class="rev-pill pl-chip" id="plChip" title="Price list this BOQ is priced from">Price list —</span>'
    + '<span class="rev-pill tool-ver-chip" id="toolVer" title="Tool version">—</span>'
    + '<span class="rev-pill tool-ver-chip" id="kitVer" title="Shared chrome version (boq-kit)">kit —</span>');
  updateVersionChips();
  updateSaveStatus();
}

/** Refresh the price-list and version chips. Safe to call any time. */
function updateVersionChips(){
  const tv = document.getElementById('toolVer');
  if(tv && KIT.hooks.toolVersion) tv.textContent = KIT.hooks.toolVersion();
  const kv = document.getElementById('kitVer');
  if(kv) kv.textContent = 'kit ' + (typeof KIT_VERSION !== 'undefined' ? KIT_VERSION : '—');
  const pl = document.getElementById('plChip');
  if(!pl) return;
  const cur = KIT.hooks.priceListCurrent && KIT.hooks.priceListCurrent();
  const latest = KIT.hooks.priceListLatest && KIT.hooks.priceListLatest();
  if(!cur){
    pl.textContent = 'No price list';
    pl.title = 'This tool has no catalogue yet — every line is typed in.';
    pl.classList.add('tool-ver-chip');
    return;
  }
  pl.classList.remove('tool-ver-chip');
  const old = latest && cur !== latest;
  pl.textContent = 'Price list ' + cur;
  pl.title = old ? 'Priced from ' + cur + ' — ' + latest + ' is available'
                 : 'Price list this BOQ is priced from';
  pl.classList.toggle('pl-old', !!old);
}

/* ====================================================================
   ITEM GROUPS — named clusters of rows inside one container
   --------------------------------------------------------------------
   A group ("Kitchen Island", "Lobby feature wall") gathers rows that
   belong together and MAY SPAN SECTIONS: a group's members can be
   cabinets + accessories + a worktop at once. Group defs live on the
   container (`c.groups = [{id,name,collapsed}]`, ordered); each row
   carries `row.groupId` (null = ungrouped).

   Each section's row array is kept in group order by reflowSection, so
   display order == array order and the existing numbering / drag-reorder
   logic is untouched. The table builder walks groupedBands() and drops a
   band row above each group, plus one "Other items" band for the tail.

   The kit owns groups; the brand says where its rows and money are:

     KIT.hooks.currentContainer()     -> the unit/area on screen
     KIT.hooks.sectionKeys()          -> every row-array key in a container
     KIT.hooks.rowAmount(row)         -> that row's money value
     KIT.hooks.bandColspan(key)       -> the band row's <td colspan>
     KIT.hooks.setSelected(key,id,on) -> tick / untick one row
     KIT.hooks.rowIsBuffer(row)       -> optional; defaults to row.buffer===true

   Backward compatible: a file with no groups loads with `groups: []` and
   every `groupId` null, which is exactly "one Other items band".
   ==================================================================== */
function _secKeys(){ return KIT.hooks.sectionKeys ? (KIT.hooks.sectionKeys()||[]) : []; }
function _rowsIn(c, key){ return (c && c.items && c.items[key]) || []; }
function _amount(r){ return (KIT.hooks.rowAmount ? +KIT.hooks.rowAmount(r) : 0) || 0; }
function _isBuffer(r){ return KIT.hooks.rowIsBuffer ? !!KIT.hooks.rowIsBuffer(r) : r.buffer === true; }
function _curC(){ return KIT.hooks.currentContainer ? KIT.hooks.currentContainer() : null; }

function groupsOf(c){ if(!Array.isArray(c.groups)) c.groups=[]; return c.groups; }
function groupById(c,gid){ return gid ? (groupsOf(c).find(g=>g.id===gid)||null) : null; }
function newGroupId(){ return 'g'+Date.now().toString(36)+Math.floor(Math.random()*46656).toString(36); }

/* Cross-section sums — a band shows the whole group, not just the tab you are on. */
function groupTotal(c,gid){ let s=0; _secKeys().forEach(k=>_rowsIn(c,k).forEach(r=>{ if(r.groupId===gid) s+=_amount(r); })); return s; }
function groupBufferTotal(c,gid){ let s=0; _secKeys().forEach(k=>_rowsIn(c,k).forEach(r=>{ if(r.groupId===gid&&_isBuffer(r)) s+=_amount(r); })); return s; }
function groupCount(c,gid){ let n=0; _secKeys().forEach(k=>_rowsIn(c,k).forEach(r=>{ if(r.groupId===gid) n++; })); return n; }

/* Stable-sort a section's rows into group order (container order; ungrouped/orphaned last). */
function reflowSection(c,key){
  const order=groupsOf(c).map(g=>g.id);
  const rank=r=>{ const i=r.groupId?order.indexOf(r.groupId):-1; return i>=0?i:order.length; };
  c.items[key]=_rowsIn(c,key).map((r,i)=>[r,i]).sort((a,b)=>(rank(a[0])-rank(b[0]))||(a[1]-b[1])).map(p=>p[0]);
}
function reflowContainer(c){ _secKeys().forEach(k=>reflowSection(c,k)); }
/* Drop row groupIds that no longer point at a live group — treated as ungrouped. */
function pruneGroups(c){
  const live=new Set(groupsOf(c).map(g=>g.id));
  _secKeys().forEach(k=>_rowsIn(c,k).forEach(r=>{ if(r.groupId&&!live.has(r.groupId)) r.groupId=null; }));
}

/**
 * The reflowed rows of one section, split into bands ready to render:
 * [{gid, rows}, …, {gid:null, rows}]. Empty groups are dropped; the
 * ungrouped tail comes last.
 */
function groupedBands(c,key){
  const rows=_rowsIn(c,key), bands=[];
  groupsOf(c).forEach(g=>{
    const rs=rows.filter(r=>r.groupId===g.id);
    if(rs.length) bands.push({gid:g.id, rows:rs});
  });
  const loose=rows.filter(r=>!groupById(c,r.groupId));
  if(loose.length) bands.push({gid:null, rows:loose});
  return bands;
}

function createGroupWithSelected(key,name){
  const c=_curC(); if(!c) return;
  const g={id:newGroupId(), name:name||'New group', collapsed:false};
  groupsOf(c).push(g);
  assignSelectedToGroup(key,g.id);
}
function assignSelectedToGroup(key,gid){
  const c=_curC(); if(!c) return;
  const sel=KIT.hooks.selection(key)||[];
  if(!sel.length){ toast('No items selected','warn'); return; }
  sel.forEach(r=>{ r.groupId=gid; });
  reflowSection(c,key); markDirty(); closeModal();
  sel.forEach(r=>KIT.hooks.setSelected && KIT.hooks.setSelected(key, r.id, false));
  KIT.hooks.afterRows(key);
  const g=groupById(c,gid);
  toast(sel.length+' item'+(sel.length===1?'':'s')+(gid?' → "'+(g?g.name:'group')+'"':' ungrouped'));
}
function removeSelectedFromGroup(key){ assignSelectedToGroup(key,null); }
function renameGroup(c,gid,name){ const g=groupById(c,gid); if(g){ g.name=String(name||'').trim()||g.name; markDirty(); } }
function deleteGroup(key,gid){
  const c=_curC(); if(!c) return;
  _secKeys().forEach(k=>_rowsIn(c,k).forEach(r=>{ if(r.groupId===gid) r.groupId=null; }));
  c.groups=groupsOf(c).filter(g=>g.id!==gid);
  reflowContainer(c); markDirty(); KIT.hooks.afterRows(key); toast('Group removed (items kept)');
}
function confirmDeleteGroup(key,gid){
  const c=_curC(), g=groupById(c,gid); if(!g) return;
  if(confirm('Remove group "'+g.name+'"? Items are kept and become ungrouped.')) deleteGroup(key,gid);
}
function toggleGroupCollapse(key,gid){
  const c=_curC(), g=groupById(c,gid);
  if(g){ g.collapsed=!g.collapsed; markDirty(); KIT.hooks.afterRows(key); }
}
function toggleGroupSelect(key,gid,checked){
  const c=_curC(); if(!c) return;
  _rowsIn(c,key).forEach(r=>{ if(r.groupId===gid && KIT.hooks.setSelected) KIT.hooks.setSelected(key, r.id, checked); });
  KIT.hooks.afterRows(key);
}

/* The band header row that sits above a group's rows. */
function groupBandHtml(c,gid,key){
  const g=groupById(c,gid); if(!g) return '';
  const cnt=groupCount(c,gid), tot=groupTotal(c,gid);
  const here=_rowsIn(c,key).filter(r=>r.groupId===gid);
  const selIds=new Set((KIT.hooks.selection(key)||[]).map(r=>String(r.id)));
  const allSel=here.length>0 && here.every(r=>selIds.has(String(r.id)));
  const span=(KIT.hooks.bandColspan && KIT.hooks.bandColspan(key)) || 12;
  const k=escAttr(key), gq=escAttr(gid);
  return '<tr class="group-band" data-gid="'+gq+'"><td colspan="'+span+'"><div class="group-head">'
    + '<input type="checkbox" class="g-check"'+(allSel?' checked':'')+' onchange="toggleGroupSelect(&quot;'+k+'&quot;,&quot;'+gq+'&quot;,this.checked)" title="Select this group’s items in this tab">'
    + '<span class="group-chev'+(g.collapsed?' collapsed':'')+'" onclick="toggleGroupCollapse(&quot;'+k+'&quot;,&quot;'+gq+'&quot;)" title="Collapse / expand"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg></span>'
    + '<span class="group-name" id="gname-'+gq+'" ondblclick="editGroupName(&quot;'+k+'&quot;,&quot;'+gq+'&quot;)" title="Double-click to rename">'+esc(g.name)+'</span>'
    + '<span class="group-meta">'+cnt+' item'+(cnt===1?'':'s')+(cnt>here.length?' · '+here.length+' here':'')+'</span>'
    + '<span class="group-total">'+fmt(tot)+'</span>'
    + '<span class="group-acts">'
    + '<button type="button" onclick="editGroupName(&quot;'+k+'&quot;,&quot;'+gq+'&quot;)" title="Rename group"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>'
    + '<button type="button" onclick="confirmDeleteGroup(&quot;'+k+'&quot;,&quot;'+gq+'&quot;)" title="Remove group (keep items)"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m-9 0v14a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V6"/></svg></button>'
    + '</span></div></td></tr>';
}
function otherBandHtml(key){
  const span=(KIT.hooks.bandColspan && KIT.hooks.bandColspan(key)) || 12;
  return '<tr class="group-band other-band"><td colspan="'+span+'"><div class="group-head"><span class="group-name">Other items</span></div></td></tr>';
}

function editGroupName(key,gid){
  const c=_curC(), g=groupById(c,gid); if(!g) return;
  const span=document.getElementById('gname-'+gid); if(!span) return;
  const inp=document.createElement('input'); inp.type='text'; inp.value=g.name; inp.className='group-name-in';
  let done=false;
  const commit=()=>{ if(done) return; done=true; renameGroup(c,gid,inp.value); KIT.hooks.afterRows(key); };
  inp.onclick=e=>e.stopPropagation();
  inp.onkeydown=e=>{ e.stopPropagation(); if(e.key==='Enter') commit(); if(e.key==='Escape'){ done=true; KIT.hooks.afterRows(key); } };
  inp.onblur=commit;
  span.replaceWith(inp); inp.focus(); inp.select();
}

function showAddToGroup(key){
  const sel=KIT.hooks.selection(key)||[];
  if(!sel.length){ toast('No items selected','warn'); return; }
  const c=_curC(), gs=groupsOf(c), k=escAttr(key);
  const list=gs.map(g=>'<div class="db-item-row" onclick="assignSelectedToGroup(&quot;'+k+'&quot;,&quot;'+escAttr(g.id)+'&quot;)">'+esc(g.name)
    +' <span style="color:var(--ink-faint);font-size:12px">· '+groupCount(c,g.id)+' item'+(groupCount(c,g.id)===1?'':'s')+'</span></div>').join('');
  showModal('<div class="modal-head"><h2>Add '+sel.length+' item'+(sel.length===1?'':'s')+' to group</h2>'
    + '<button class="icon-x" onclick="closeModal()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div>'
    + '<div class="modal-body">'
    + '<div class="field"><label>New group</label><div style="display:flex;gap:8px">'
    + '<input class="input" id="newgroup-name" placeholder="e.g. Kitchen Island" onkeydown="if(event.key===&quot;Enter&quot;){event.preventDefault();createGroupFromModal(&quot;'+k+'&quot;)}">'
    + '<button class="btn primary" style="flex-shrink:0" onclick="createGroupFromModal(&quot;'+k+'&quot;)">Create</button></div></div>'
    + (gs.length?'<div style="margin:12px 0 6px;font-size:11px;color:var(--ink-faint);text-transform:uppercase;letter-spacing:.05em">Add to existing group</div>'+list:'')
    + '</div><div class="modal-foot"><button class="btn ghost" onclick="closeModal()">Cancel</button></div>');
}
function createGroupFromModal(key){
  const name=String((document.getElementById('newgroup-name')||{}).value||'').trim();
  if(!name){ toast('Enter a group name','warn'); return; }
  createGroupWithSelected(key, name);
}

/* ====================================================================
   ROW ACTIONS — the triple button on every item line
   One markup for every brand: buffer (insurance stock) / duplicate /
   delete, flush-joined into one segmented control.

     rowActions('kitchen', row.id, {buffer: row.buffer===true})

   Omit `buffer` entirely and the shield is left out — a brand with no
   insurance-stock concept gets the same control, two buttons wide.
   `compact: true` is the denser size for tight cell-input tables.
   ==================================================================== */
const _RA_SVG = {
  buf:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
  dup:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
  del:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'
};
function rowActions(key,id,o){
  o=o||{};
  const k=escAttr(key), i=escAttr(id);
  let h='<span class="row-actions'+(o.compact?' compact':'')+'">';
  if(o.buffer!==undefined){
    const on=o.buffer===true;
    h+='<button type="button" class="act-buf'+(on?' on':'')+'" onclick="toggleRowBuffer(&quot;'+k+'&quot;,&quot;'+i+'&quot;)" aria-label="Mark as buffer" title="'
      +(on?'Buffer item — counted in totals, excluded from the Sales Order. Click to unmark.'
          :'Mark as buffer (insurance stock: counts in totals, excluded from the Sales Order)')+'">'+_RA_SVG.buf+'</button>';
  }
  h+='<button type="button" class="act-dup" onclick="duplicateRow(&quot;'+k+'&quot;,&quot;'+i+'&quot;)" aria-label="Duplicate line" title="Duplicate item">'+_RA_SVG.dup+'</button>'
   + '<button type="button" class="act-del" onclick="'+(o.onDelete||('deleteRow(&quot;'+k+'&quot;,&quot;'+i+'&quot;)'))+'" aria-label="Remove line" title="Delete item">'+_RA_SVG.del+'</button>'
   + '</span>';
  return h;
}

/* ====================================================================
   EXPORT GUARDS — the two reminders every tool needs
   KIT.hooks.requiredFields -> [{sel, label, value()}]   (host-owned fields)
   KIT.hooks.goHome()       -> show the view those fields live on
   ==================================================================== */
function requireProjectFields(){
  const fields = KIT.hooks.requiredFields || [];
  const missing = fields.filter(f => !String(f.value()||'').trim());
  if(!missing.length) return true;
  toast('Required before export: ' + missing.map(f=>f.label).join(', '), 'warn', 3500);
  if(typeof KIT.hooks.goHome === 'function') KIT.hooks.goHome();
  setTimeout(()=>{
    missing.forEach(f=>{
      const e = document.querySelector(f.sel);
      if(e){ e.classList.add('field-error'); setTimeout(()=>e.classList.remove('field-error'), 3000); }
    });
    const first = document.querySelector(missing[0].sel);
    if(first) first.focus();
  }, 80);
  return false;
}
function warnZeroQty(){
  toast('Qty is 0 — the line stays in the BOQ but adds nothing to the total','warn',5000);
}

/* ====================================================================
   PRICE LIST — versioned, switched deliberately
   The registry, the record on the project and the picker are the same in
   every tool; re-pricing a row is not, so that is the brand's hook.
     KIT.hooks.priceListVersions() -> [version, ...]   (newest last)
     KIT.hooks.priceListLatest()   -> version
     KIT.hooks.priceListCurrent()  -> the version this BOQ is quoted from
     KIT.hooks.repriceAll(version) -> {updated, notFound}  — brand-specific
   ==================================================================== */
function priceListOptions(){
  const cur = KIT.hooks.priceListCurrent();
  return (KIT.hooks.priceListVersions()||[]).map(v =>
    '<option value="'+escAttr(v)+'"'+(v===cur?' selected':'')+'>'+esc(v)+'</option>').join('');
}
function priceListNewerChip(){
  const cur = KIT.hooks.priceListCurrent(), latest = KIT.hooks.priceListLatest();
  return (cur && latest && cur !== latest)
    ? '<span class="chip" style="background:var(--warn-bg);color:var(--warn);font-weight:700">Newer list available: '+esc(latest)+'</span>'
    : '';
}
function switchPriceList(v){
  if(!v || v === KIT.hooks.priceListCurrent()) return;
  if((KIT.hooks.priceListVersions()||[]).indexOf(v) < 0){ toast('Price list version not found','error'); return; }
  const r = KIT.hooks.repriceAll(v) || {};
  markDirty();
  const label = v === KIT.hooks.priceListLatest() ? v : v + ' (not latest)';
  const updated = r.updated||0, notFound = r.notFound||0;
  toast('Switched to ' + label + ': ' + updated + ' line' + (updated===1?'':'s') + ' re-priced'
        + (notFound ? ' · ' + notFound + ' not in this list' : ''), updated ? 'success' : 'warn', 4000);
}

/* ====================================================================
   THE ENVELOPE — the outer shape of a save file / host payload
   --------------------------------------------------------------------
   Every tool writes the same wrapper and each contributes its own payload
   (SM: units, BT & CL: areas). Additive on purpose: a brand keeps whatever
   legacy keys its old files carried, so a `.smbq` / `.btbq` / `.clbq` already
   on disk still opens, and MulyaOne — which reads all three — keeps working.

     getState()        -> buildEnvelope({ ...the brand's payload })
     applyLoaded(d)    -> restoreEnvelope(d) for the alternatives tree
   ==================================================================== */
const ENVELOPE_FORMAT = 3;

function buildEnvelope(payload){
  const brandName = (typeof BRAND!=='undefined' && BRAND.brandName) || '';
  const toolName  = (typeof BRAND!=='undefined' && BRAND.toolName)  || 'BOQ';
  return Object.assign({
    tool:        (brandName ? brandName + ' ' : '') + toolName,
    brand:       (typeof BRAND!=='undefined' && BRAND.brandKey) || '',
    format:      ENVELOPE_FORMAT,
    savedAt:     new Date().toISOString(),
    toolVersion: (typeof TOOL_VERSION!=='undefined' ? TOOL_VERSION : ''),
    kitVersion:  (typeof KIT_VERSION!=='undefined' ? KIT_VERSION : ''),
    // The alternatives tree travels with every save, whatever the brand.
    alts, activeAltKey, activeVerNum,
  }, payload || {});
}

/**
 * Put the alternatives tree back. Tolerates every shape written so far:
 * a file with no tree at all (format 1, or SM before alternatives existed)
 * seeds the single "Initial scheme" Alt A rather than failing.
 */
function restoreEnvelope(d){
  d = d || {};
  alts = (Array.isArray(d.alts) && d.alts.length) ? d.alts
       : [{key:'A', name:'Initial scheme', versions:[]}];
  activeAltKey = d.activeAltKey || alts[0].key;
  activeVerNum = (d.activeVerNum !== undefined) ? d.activeVerNum : null;
}

/* ====================================================================
   EXPORT PICKER — which alternative, which version, which options
   --------------------------------------------------------------------
   An "export set" is one alternative at one version: {altKey, ver} where ver is
   a number or 'working' (the calc on screen). A document covers one or more.

     KIT.hooks.exportUnits(altKey, ver) -> that set's units/areas
     KIT.hooks.totalOf(units)           -> its money total
     KIT.hooks.itemCountOf(units)       -> its line count
     KIT.hooks.exportOptions()          -> [{key,label,choices:[{value,label}],default}]
     KIT.hooks.runExport(kind, sets, opts) -> render + download (brand-owned)
   ==================================================================== */
let _exportKind = 'pdf';

function defaultExportSets(){ return [{altKey: activeAltKey, ver: 'working'}]; }
function setUnits(s){ return KIT.hooks.exportUnits(s.altKey, s.ver) || []; }
function setLabel(s){ return 'Alt ' + s.altKey + (s.ver === 'working' ? ' · current' : ' · v' + s.ver); }
function setsTotal(sets){ return (sets||[]).reduce((t,s)=>t + (KIT.hooks.totalOf(setUnits(s))||0), 0); }
function setsItemCount(sets){ return (sets||[]).reduce((t,s)=>t + (KIT.hooks.itemCountOf(setUnits(s))||0), 0); }

/** The VERSION line a document prints. One set names its alternative; several list them. */
function setsVersionLabel(sets){
  sets = (sets && sets.length) ? sets : defaultExportSets();
  if(sets.length <= 1){
    const one = sets[0], a = alts.find(x=>x.key===one.altKey);
    return setLabel(one) + (one.ver==='working' && dirty ? ' (unsaved edits)' : '')
         + (a && a.name ? ' — ' + a.name : '');
  }
  return sets.map(s => s.altKey + (s.ver==='working' ? '·cur' : '·v'+s.ver)).join(' + ');
}

/** `_Alt_A-B_` when a document covers only some alternatives; nothing when it covers all. */
function exportAltSegment(sets){
  sets = (sets && sets.length) ? sets : defaultExportSets();
  const keys = [...new Set(sets.map(s=>s.altKey))].sort();
  const all  = alts.map(a=>a.key).sort();
  return keys.length && keys.length < all.length ? '_Alt_' + keys.join('-') : '';
}

/* ====================================================================
   EXPORT DELIVERY — one filename, one save path, one set of questions
   --------------------------------------------------------------------
   The three tools render different documents on purpose, but everything
   AROUND the document is the same job and had drifted into three
   answers: Stella Mobili opened a native Save As dialog while Beyond
   Teak and CDN Lighting dropped the file straight into Downloads; each
   built its filename differently; and the same buffer question was
   worded three ways with three sets of values.

     KIT.hooks.fileBaseName()   -> '{Project}_{YYYYMMDD}'  (already used by saveFile)
     KIT.hooks.setDate(set)     -> optional; that version's date for a single-set export
     KIT.hooks.pdfOrientation() -> optional; this brand's default page, 'portrait' by
                                   default, CDN Lighting's quotation is 'landscape'
   ==================================================================== */

/**
 * The suite's export filename, without extension:
 *     {Project}_{YYYYMMDD}[_Alt_A-B]_BOQ[(Buffer)]
 * The Alt segment appears only when the document covers SOME of the
 * alternatives — naming it when it covers all of them says nothing.
 */
/**
 * The suite's file-name stem: a project name safe on every filesystem, then the
 * date as YYYYMMDD so a folder of exports sorts chronologically by name.
 * Used by .bq saves and by both exporters, in all three tools.
 */
function safeFileName(name, dateStr){
  const n = String(name || (typeof BRAND!=='undefined' ? BRAND.brandName : '') || 'BOQ')
    .replace(/\s*[–—-]\s*/g, '_')        // dashes between words become one _
    .replace(/[\/:*?"<>|]+/g, '')                 // characters no filesystem accepts
    .trim().replace(/\s+/g, '_') || 'BOQ';
  return n + '_' + fmtDateFile(dateStr || new Date().toISOString().slice(0,10));
}

/**
 * The suite's file-name stem: a project name safe on every filesystem, then the
 * date as YYYYMMDD so a folder of exports sorts chronologically by name.
 * Used by the .bq save and by both exporters, in all three tools.
 */
function safeFileName(name, dateStr){
  const n = String(name || (typeof BRAND!=='undefined' ? BRAND.brandName : '') || 'BOQ')
    .replace(/\s*[\u2013\u2014-]\s*/g, '_')      // a dash between words becomes one _
    .replace(/[\\/:*?"<>|]+/g, '')               // characters no filesystem accepts
    .trim().replace(/\s+/g, '_') || 'BOQ';
  return n + '_' + fmtDateFile(dateStr || new Date().toISOString().slice(0,10));
}

function exportFileBase(sets, opts){
  sets = (sets && sets.length) ? sets : defaultExportSets();
  opts = opts || {};
  const dateStr = (sets.length === 1 && KIT.hooks.setDate) ? KIT.hooks.setDate(sets[0]) : null;
  const base = (KIT.hooks.fileBaseName ? KIT.hooks.fileBaseName() : 'BOQ');
  const alt = exportAltSegment(sets);                       // '' or '_Alt_A-B'
  const withBuffer = opts.buffer !== 'without' && setsHaveBuffer(sets);
  return base + alt + '_BOQ' + (withBuffer ? '(Buffer)' : '');
}

/** Does any set in this document carry buffer rows? */
function setsHaveBuffer(sets){
  if(!KIT.hooks.bufferTotal) return false;                  // brand has no buffer concept
  const isBuf = r => KIT.hooks.rowIsBuffer ? !!KIT.hooks.rowIsBuffer(r) : r.buffer === true;
  return (sets || []).some(s => (setUnits(s) || []).some(c =>
    Object.keys((c && c.items) || {}).some(k => (c.items[k] || []).some(isBuf))));
}

/**
 * Produce and deliver a document the same way in every tool: the Save As
 * dialog opens FIRST, on the click that is still a user gesture, and the
 * file is written after the (slow) render. `produce` returns a Blob.
 *
 * A file:// page has no showSaveFilePicker (Chrome), so pickSaveHandle
 * silently falls back to a plain download — same code, same toast.
 */
async function deliverExport(kind, filename, produce){
  const pick = await pickSaveHandle(filename);
  if(pick.mode === 'cancelled') return false;
  let blob;
  try { blob = await produce(); }
  catch(e){ console.error(e); toast('Could not build the ' + kind.toUpperCase() + ' — ' + (e && e.message || e), 'error', 6000); return false; }
  await writePicked(pick, blob);
  toast(kind.toUpperCase() + ' exported' + (pick.mode === 'picker' ? '' : ' to your downloads'));
  return true;
}

/**
 * The questions the picker asks, identically everywhere: which page for a
 * PDF, and — only when there is buffer to leave out — which copy this is.
 * A brand adds its own options by concatenating onto this.
 */
function standardExportOptions(kind){
  const out = [];
  if(kind === 'pdf'){
    const def = (KIT.hooks.pdfOrientation && KIT.hooks.pdfOrientation()) || 'portrait';
    out.push({key:'orient', label:'Page', default:def, choices:[
      {value:'portrait',  label:'A4 Portrait'},
      {value:'landscape', label:'A4 Landscape'}]});
  }
  const bt = KIT.hooks.bufferTotal;
  if(bt && bt() > 0){
    out.push({key:'buffer', label:'Buffer items', style:'cards', default:'with', choices:[
      {value:'with',    label:'With buffer — for Quotation',
       hint:'Every line, insurance stock included. Buffer rows are marked and totalled separately.'},
      {value:'without', label:'Without buffer — for Sales Order',
       hint:'Buffer rows are left out of the document and out of its totals.'}]});
  }
  return out;
}

function openExportModal(kind){
  if(!requireProjectFields()) return;
  _exportKind = kind;
  const rows = alts.map(a=>{
    const isActive = a.key === activeAltKey;
    const opts = [];
    if(isActive) opts.push('<option value="working">current' + (dirty ? ' (unsaved edits)' : '') + '</option>');
    a.versions.forEach((v,i)=>opts.push('<option value="'+v.ver+'"'+((!isActive&&i===0)?' selected':'')
      + '>v'+v.ver+(i===0?' (latest)':'')+' · '+esc(v.status==='Ready for quotation'?'Ready':v.status)+'</option>'));
    if(!opts.length) opts.push('<option value="working">nothing saved yet</option>');
    const total = KIT.hooks.totalOf(KIT.hooks.exportUnits(a.key, isActive ? 'working' : (a.versions[0]||{}).ver));
    return '<label style="display:flex;flex-direction:row;align-items:center;gap:10px;padding:9px 11px;'
      + 'border:1px solid var(--line);border-radius:9px;margin-bottom:7px;cursor:pointer">'
      + '<input type="checkbox" class="exp-alt" data-alt="'+escAttr(a.key)+'"'+(isActive?' checked':'')+'/>'
      + '<span style="flex:1;min-width:0"><span style="display:block;font-weight:700;font-size:13px">ALT '+esc(a.key)+'</span>'
      + '<span style="display:block;font-size:12px;color:var(--ink-faint);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(a.name||'')+'</span></span>'
      + '<select class="select compact exp-ver" data-alt="'+escAttr(a.key)+'" style="flex:0 0 195px;max-width:195px"'
      + ' onclick="event.preventDefault();event.stopPropagation()">'+opts.join('')+'</select>'
      + '<span class="mono" style="font-size:12.5px;color:var(--accent);font-weight:700;min-width:96px;text-align:right">'+fmt(total||0)+'</span>'
      + '</label>';
  }).join('');
  // An option is a select by default. `style:'cards'` gives it a stacked choice
  // with room to explain itself — Stella Mobili's buffer question reads
  // "With buffer — for Quotation" / "Without buffer — for Sales Order", and that
  // sentence is the whole point of asking.
  const extras = (KIT.hooks.exportOptions(kind) || []).map(o => {
    if(o.style === 'cards'){
      return '<div class="field" style="margin-top:12px"><label>'+esc(o.label)+'</label>'
        + '<div style="display:flex;flex-direction:column;gap:7px">'
        + o.choices.map(c =>
            '<label style="display:flex;align-items:flex-start;gap:9px;padding:9px 11px;border:1px solid var(--line);border-radius:9px;cursor:pointer">'
            + '<input type="radio" name="expopt-'+escAttr(o.key)+'" class="exp-opt-radio" data-key="'+escAttr(o.key)+'"'
            + ' value="'+escAttr(c.value)+'"'+(c.value===o.default?' checked':'')+' style="margin-top:2px">'
            + '<span><strong style="font-size:13px">'+esc(c.label)+'</strong>'
            + (c.hint ? '<span style="display:block;font-size:11.5px;color:var(--ink-faint);line-height:1.5;margin-top:2px">'+esc(c.hint)+'</span>' : '')
            + '</span></label>').join('')
        + '</div></div>';
    }
    return '<div class="field" style="margin-top:10px;max-width:260px"><label>'+esc(o.label)+'</label>'
      + '<select class="select compact exp-opt" data-key="'+escAttr(o.key)+'">'
      + o.choices.map(c=>'<option value="'+escAttr(c.value)+'"'+(c.value===o.default?' selected':'')+'>'+esc(c.label)+'</option>').join('')
      + '</select></div>';
  }).join('');
  showModal(
    '<div class="modal-head"><h2>Export '+(kind==='pdf'?'PDF':'Excel')+'</h2>'
    + '<button class="icon-x" onclick="closeModal()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div>'
    + '<div class="modal-body"><div class="hint" style="margin-bottom:9px">Which alternative should the client see?'
    + ' Tick more than one to put them side by side in the same document.</div>'
    + rows + extras + '</div>'
    + '<div class="modal-foot"><button class="btn" onclick="closeModal()">Cancel</button>'
    + '<button class="btn primary" onclick="confirmExport()">Export '+(kind==='pdf'?'PDF':'Excel')+'</button></div>');
}

function getExportSets(){
  const boxes = [...document.querySelectorAll('.exp-alt')];
  if(!boxes.length) return defaultExportSets();          // picker not open → what's on screen
  const sets = [];
  boxes.forEach(cb=>{
    if(!cb.checked) return;
    const k = cb.dataset.alt;
    const sel = document.querySelector('.exp-ver[data-alt="'+k+'"]');
    const v = sel ? sel.value : 'working';
    sets.push({altKey:k, ver: v==='working' ? 'working' : parseInt(v,10)});
  });
  return sets.length ? sets : null;
}

function confirmExport(){
  const sets = getExportSets();
  if(!sets){ toast('Tick at least one alternative','warn'); return; }
  if(setsItemCount(sets) === 0){ toast('Those alternatives have no lines to export','warn'); return; }
  const opts = {};
  document.querySelectorAll('.exp-opt').forEach(sel => { opts[sel.dataset.key] = sel.value; });
  document.querySelectorAll('.exp-opt-radio:checked').forEach(r => { opts[r.dataset.key] = r.value; });
  const kind = _exportKind;
  closeModal();
  KIT.hooks.runExport(kind, sets, opts);
}

/* ====================================================================
   START — called as the last line of the tool's INIT, once the brand code
   has registered its hooks and rendered its first view.
   ==================================================================== */
KIT.start = function(){
  if(KIT.started) return; KIT.started=true;
  try{ if(localStorage.getItem('sbCollapsed')==='1' && window.innerWidth>900)
        document.querySelector('.shell').classList.add('sidebar-collapsed'); }catch(e){}
  mountVersionChips();   // save status / price list / tool / kit — one row, every tool
  initSidebarResize();
  initDropLoad();
  setInterval(()=>{ if(dirty) autosaveNow(); }, 30000);
  window.addEventListener('beforeunload', e=>{
    if(dirty) autosaveNow();                                  // keep localStorage recovery current
    if(fileUnsaved){ e.preventDefault(); e.returnValue=''; }  // warn until saved to a file
  });
  updateSaveStatus();
  offerAutosaveRestore();
  // bridge.js sets this when the tool is inside a host; it needs document.body
  // and the hooks registered above, so it cannot run at parse time.
  if (typeof KIT.onStart === 'function') { try { KIT.onStart(); } catch(e){} }
};
