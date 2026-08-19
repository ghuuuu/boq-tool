/* ============================================================
   boq-kit · kit-export.js — shared export chrome
   ------------------------------------------------------------
   The parts of a BOQ document that must be identical whichever brand issued
   it: the letterhead (brand logo left, MULYA right), the caption type scale,
   the meta label/value pair, the rules and the page footer — for both
   renderers, pdfmake and ExcelJS.

   The *body* of each document (its columns, bands and totals) stays brand-side:
   Stella Mobili quotes rooms of cabinetry, Beyond Teak metres of profile, CDN
   Lighting fittings on a quotation sheet, and those tables are not the same
   document. What follows is the paper they are printed on.

   Sizes are pdfmake points, from docs/design/boq-format/BOQ-FORMAT-SPEC.md
   (CSS px × 0.75). Stella Mobili's PDF is the reference implementation, so its
   numbers are the defaults here.
   ============================================================ */

/* ===== The company, once =====
   Every brand's document carries the same issuer. It used to be typed into
   three templates; Beyond Teak's said "Jl. Tegalsari no. 39", which is not the
   address MulyaOne prints on its own contracts and invoices. */
const MULYA_LEGAL = 'PT. MITRA USAHA LANCAR JAYA';
const MULYA_ADDR  = 'JL. TEGALSARI 37, SURABAYA';
const MULYA_LINE  = MULYA_LEGAL + ' · ' + MULYA_ADDR;

/* ===== Print tokens =====
   Ink, muted grey and hairline are fixed by the spec; the accent is the
   brand's own (SM brass, BT green, CL bronze) and is passed in. */
function docTokens(over){
  return Object.assign({
    ink:    '#1F1812',
    gray:   '#7A7166',
    hair:   '#E6E1D8',
    accent: '#8C6830',
  }, over || {});
}

/* ====================================================================
   PDF (pdfmake)
   ==================================================================== */

/** The small uppercase line under a logo, and the label of a meta cell. */
function pdfCaption(text, t, align){
  const n = {text: String(text||''), fontSize:6, color:(t||docTokens()).accent,
             characterSpacing:0.6, margin:[0,6.75,0,0]};
  if(align) n.alignment = align;   // left is pdfmake's default; don't write it
  return n;
}

/** A horizontal rule the width of the content column. */
function pdfRule(cw, t, opts){
  const o = opts || {}, tok = t || docTokens();
  const y = o.y == null ? 7.5 : o.y;
  return {canvas:[{type:'line', x1:0, y1:y, x2:cw, y2:y,
                   lineWidth: o.width == null ? 1.1 : o.width,
                   lineColor: o.color || tok.ink}], margin: o.margin};
}

/**
 * Brand logo left with its caption, MULYA right with the company line, and the
 * rule under both. `middle` (optional) is dropped between them — the landscape
 * BOQ puts its meta cells there.
 *
 *   pdfLetterhead({brandLogo:{svg,height,width}, brandLine:'BILL OF QUANTITIES',
 *                  mulyaLogo:{svg,height,width}, cw, tokens})  ->  [columns, rule]
 */
function pdfLetterhead(o){
  const t  = o.tokens || docTokens();
  const left = [o.brandLogo];
  if(o.brandLine) left.push(pdfCaption(o.brandLine, t));
  const mulya = Object.assign({}, o.mulyaLogo); mulya.alignment = 'right';
  const right = [mulya];
  (o.mulyaLines || [MULYA_LINE]).forEach(line => right.push(pdfCaption(line, t, 'right')));

  const cols = [{width: o.middle ? 'auto' : '*', stack: left}];
  if(o.middle) cols.push(o.middle);
  cols.push({width: o.middle ? 'auto' : 'auto', stack: right});

  const head = {columns: cols};
  if(o.margin) head.margin = o.margin;
  return [head, pdfRule(o.cw, t, {y: o.ruleY, width: o.ruleWidth, color: o.ruleColor})];
}

/** One meta pair: tiny uppercase label over its value. */
function pdfMetaCell(label, value, t){
  const tok = t || docTokens();
  return {stack:[
    {text:String(label||'').toUpperCase(), fontSize:5.6, bold:true, color:tok.accent, characterSpacing:0.9},
    {text:String(value == null || value === '' ? '—' : value), fontSize:8.25, color:tok.ink, margin:[0,1.5,0,0]},
  ]};
}

/**
 * The meta band: cells across the content width, hairline under it.
 * `cells` is [[label,value], …] or ready-made cell nodes.
 */
function pdfMetaBand(cells, cw, t, o){
  const tok = t || docTokens(), opts = o || {};
  const nodes = cells.map(c => Array.isArray(c) ? pdfMetaCell(c[0], c[1], tok) : c);
  const widths = opts.widths || nodes.map(()=> 'auto');
  const band = {margin: opts.margin || [0,6.75,0,0], columnGap: opts.columnGap == null ? 10.5 : opts.columnGap,
                columns: nodes.map((n,i)=>Object.assign({width: widths[i] || 'auto'}, n))};
  const out = [band];
  if(opts.rule !== false) out.push(pdfRule(cw, tok, {y:6.75, width:0.4, color:tok.hair}));
  return out;
}

/**
 * The page footer the spec asks for: hairline, the document's own caption on
 * the left, `page / pages` on the right.
 */
function pdfFooter(caption, cw, t, o){
  const tok = t || docTokens(), opts = o || {};
  return function(cur, cnt){
    return {margin: opts.margin || [32,6,32,0], stack:[
      pdfRule(cw, tok, {y:0, width:0.4, color:tok.hair}),
      {margin:[0, opts.gap == null ? 4 : opts.gap, 0, 0], columns:[
        {text: String(caption||''), fontSize:6, color:tok.gray, characterSpacing:0.45},
        {text: cur + ' / ' + cnt, fontSize:6, color:tok.gray, alignment:'right'},
      ]},
    ]};
  };
}

/* ====================================================================
   Excel (ExcelJS)
   The worksheet is written top-down, so each builder takes the current row and
   returns the next one.
   ==================================================================== */

/** ARGB for ExcelJS from a #rrggbb token. */
function argb(hex){ return 'FF' + String(hex||'').replace('#','').toUpperCase(); }

/**
 * Logos, title and subtitle across the sheet.
 *   xlsxLetterhead(ws, wb, {row, lastCol:'K', brandPng, mulyaPng, title, subtitle, tokens})
 */
function xlsxLetterhead(ws, wb, o){
  const t = o.tokens || docTokens();
  let R = o.row || 1;
  try{
    if(o.brandPng){
      const id = wb.addImage({base64:o.brandPng, extension:'png'});
      ws.addImage(id, {tl:{col:0.15, row:(R-1)+0.25}, ext:o.brandExt || {width:145, height:46}});
    }
    if(o.mulyaPng){
      const id = wb.addImage({base64:o.mulyaPng, extension:'png'});
      ws.addImage(id, {tl:{col:(o.mulyaCol==null?8.85:o.mulyaCol), row:(R-1)+0.5}, ext:o.mulyaExt || {width:96, height:39}});
    }
  }catch(e){}
  ws.getRow(R).height = 20; ws.getRow(R+1).height = 16; ws.getRow(R+2).height = 16;
  R += 3;
  const put = (row, val, font) => {
    ws.mergeCells('A'+row+':'+(o.lastCol||'K')+row);
    const c = ws.getRow(row).getCell(1); c.value = val; c.font = font; return c;
  };
  if(o.title){
    put(R, o.title, {name:'Calibri', bold:true, size:16, color:{argb:argb(t.ink)}});
    ws.getRow(R).height = 22; R++;
  }
  if(o.subtitle){
    put(R, o.subtitle, {name:'Calibri', size:10, color:{argb:argb(t.gray)}});
    R++;
  }
  return R + 1;
}

/**
 * The meta block: two label/value pairs per row, as every tool already writes it.
 *   xlsxMetaBlock(ws, {row, rows:[[l,v,l2,v2], …], tokens, lastCol})
 */
function xlsxMetaBlock(ws, o){
  const t = o.tokens || docTokens();
  // Which columns a pair occupies. The default is the BOQ sheet's; CDN Lighting's
  // quotation sheet is narrower on the left, so it passes its own.
  const L = Object.assign({label1:1, value1:2, value1Span:['B','E'],
                           label2:6, value2:7, value2Span:['G', o.lastCol||'K']}, o.layout||{});
  let R = o.row;
  const lab = {name:'Calibri', bold:true, size:9, color:{argb:argb(t.accent)}};
  const val = {name:'Calibri', size:10, color:{argb:argb(t.ink)}};
  const dash = v => (v == null || v === '') ? '—' : v;
  (o.rows||[]).forEach(m => {
    const set = (col, v, f) => { const c = ws.getRow(R).getCell(col); c.value = v; c.font = f; return c; };
    set(L.label1, m[0], lab);
    ws.mergeCells(L.value1Span[0]+R+':'+L.value1Span[1]+R); set(L.value1, dash(m[1]), val);
    if(m.length > 2 && (m[2] !== '' || m[3] !== '')){
      set(L.label2, m[2], lab);
      ws.mergeCells(L.value2Span[0]+R+':'+L.value2Span[1]+R); set(L.value2, dash(m[3]), val);
    }
    R++;
  });
  return R;
}

/** The line every sheet closes with. */
function xlsxFootNote(ws, o){
  const t = o.tokens || docTokens();
  ws.mergeCells('A'+o.row+':'+(o.lastCol||'K')+o.row);
  const c = ws.getRow(o.row).getCell(1);
  c.value = o.text;
  c.font = {name:'Calibri', italic:true, size:8, color:{argb:argb(t.gray)}};
  return o.row + 1;
}
