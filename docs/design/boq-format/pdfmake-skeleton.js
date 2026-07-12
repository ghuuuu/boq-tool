// MULYA / Stella Mobili — BOQ pdfmake skeleton (matches BOQ-FORMAT-SPEC.md)
// Fonts: register Libre Caslon Text (400/700) and Libre Franklin (400/600) in the VFS first:
//   pdfMake.fonts = {
//     LibreFranklin: { normal: 'LibreFranklin-Regular.ttf', bold: 'LibreFranklin-SemiBold.ttf' },
//     LibreCaslon:   { normal: 'LibreCaslonText-Regular.ttf', bold: 'LibreCaslonText-Bold.ttf' },
//   };
// Images: pass logos as dataURLs in images{} (stella per-brand, mulya constant).

const C = {
  ink: '#1F1812',
  gray: '#7A7166',
  brass: '#8C6830',
  hair: '#E6E1D8',
  bufFill: '#E9EFF6',
  bufHair: '#D8E2EE',
  bufLabel: '#3E648C',
};

// Portrait column widths (pt). Landscape: [18,'*',105,93.75,61.5,18,69,78.75]
const COLS = [15, '*', 52.5, 82.5, 52.5, 16.5, 60, 66];

const metaCell = (label, value) => ({
  stack: [
    { text: label.toUpperCase(), fontSize: 5.6, bold: true, color: C.brass, characterSpacing: 0.9 },
    { text: value, fontSize: 8.25, color: C.ink, margin: [0, 1.5, 0, 0] },
  ],
});

const th = (text, alignment = 'left') => ({
  text: text.toUpperCase(), fontSize: 5.6, bold: true, color: C.gray,
  characterSpacing: 0.8, alignment, margin: [0, 3, 0, 2],
});

// item: { n, name, dims, cat, sub, fin, unit, qty, total, notes, buffer }
const itemRow = (it) => [
  { text: it.n, fontSize: 7.1, color: C.gray },
  {
    stack: [
      {
        text: it.buffer
          ? [{ text: it.name }, { text: '   BUFFER', fontSize: 5.25, bold: true, color: C.bufLabel, characterSpacing: 0.75 }]
          : it.name,
        fontSize: 7.9, bold: true, color: C.ink, lineHeight: 1.15,
      },
      ...(it.dims ? [{ text: it.dims, fontSize: 6.4, color: C.gray, margin: [0, 0.75, 0, 0] }] : []),
    ],
  },
  {
    stack: [
      { text: it.cat, fontSize: 7.5, color: C.ink },
      ...(it.sub ? [{ text: it.sub, fontSize: 6.4, color: C.gray }] : []),
    ],
  },
  { text: it.fin, fontSize: 7.5, color: C.ink },
  { text: it.unit, fontSize: 7.5, color: C.ink, alignment: 'right' },
  { text: it.qty, fontSize: 7.5, color: C.ink, alignment: 'center' },
  { text: it.total, fontSize: 7.5, bold: true, color: C.brass, alignment: 'right' },
  { text: it.notes || '', fontSize: 7.1, color: C.gray, lineHeight: 1.2 },
];

const itemTable = (items) => ({
  margin: [0, 2, 0, 0],
  table: {
    headerRows: 1,
    widths: COLS,
    body: [
      [th('#'), th('Description'), th('Category'), th('Finish'), th('Unit price', 'right'), th('Qty', 'center'), th('Total', 'right'), th('Notes')],
      ...items.map(itemRow),
    ],
  },
  layout: {
    hLineWidth: (i) => (i === 1 ? 0.75 : i === 0 ? 0 : 0.4),
    hLineColor: (i, node) => {
      if (i === 1) return C.ink;
      const row = node.table.body[i - 1]; // row above the line
      return row && row.__buffer ? C.bufHair : C.hair;
    },
    vLineWidth: () => 0,
    fillColor: (i, node) => (i > 0 && node.table.body[i].__buffer ? C.bufFill : null),
    paddingLeft: () => 3.75, paddingRight: () => 3.75,
    paddingTop: () => 2.25, paddingBottom: () => 2.25,
  },
});
// NB: tag each buffer row array with row.__buffer = true after itemRow() so
// fillColor/hLineColor can see it: const r = itemRow(it); r.__buffer = it.buffer; return r;

const sectionHeader = (title, total, note) => ({
  margin: [0, 6, 0, 0],
  columns: [
    { text: title, font: 'LibreCaslon', fontSize: 11.25, color: C.ink, width: 'auto' },
    // hairline filler
    { canvas: [{ type: 'line', x1: 0, y1: 8, x2: 320, y2: 8, lineWidth: 0.4, lineColor: C.hair }], width: '*', margin: [9, 0, 9, 0] },
    ...(note ? [{ text: note, fontSize: 6.4, color: C.gray, width: 'auto', margin: [0, 3, 6, 0] }] : []),
    { text: total, fontSize: 8.6, bold: true, color: C.brass, width: 'auto', margin: [0, 2, 0, 0] },
  ],
});

function buildDocDefinition(doc) {
  // doc: { images: {stella, mulya}, meta: {project, client, pic, date, version, pricelist},
  //        docLine, sections: [{title, total, note, items: [...] }],
  //        grand: {label, total, sub}, footerRef }
  return {
    pageSize: 'A4',
    pageOrientation: 'portrait', // or 'landscape' (see spec: inline meta, one-line desc, landscape COLS)
    pageMargins: [33, 16, 33, 28],
    defaultStyle: { font: 'LibreFranklin', color: C.ink },
    images: doc.images,
    footer: (page, pages) => ({
      margin: [33, 6, 33, 0],
      stack: [
        { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 529, y2: 0, lineWidth: 0.4, lineColor: C.hair }] },
        {
          margin: [0, 5, 0, 0],
          columns: [
            { text: doc.footerRef, fontSize: 6, color: C.gray, characterSpacing: 0.45 },
            { text: page + ' / ' + pages, fontSize: 6, color: C.gray, alignment: 'right' },
          ],
        },
      ],
    }),
    content: [
      // ---- header ----
      {
        columns: [
          {
            width: '*',
            stack: [
              { image: 'stella', height: 34.5, width: 34.5 * (506 / 168) }, // keep aspect
              { text: doc.docLine.toUpperCase(), fontSize: 6, color: C.brass, characterSpacing: 0.6, margin: [0, 6.75, 0, 0] },
            ],
          },
          {
            width: 'auto',
            stack: [
              { image: 'mulya', height: 34.5, width: 34.5 * (140 / 70), alignment: 'right' },
              { text: 'PT. MITRA USAHA LANCAR JAYA · JL. TEGALSARI 37', fontSize: 6, color: C.brass, characterSpacing: 0.6, alignment: 'right', margin: [0, 6.75, 0, 0] },
            ],
          },
        ],
      },
      { canvas: [{ type: 'line', x1: 0, y1: 7.5, x2: 529, y2: 7.5, lineWidth: 1.1, lineColor: C.ink }] },
      // ---- meta ----
      {
        margin: [0, 6.75, 0, 0],
        columns: [
          metaCell('Project', doc.meta.project), metaCell('Client', doc.meta.client),
          metaCell('PIC', doc.meta.pic), metaCell('Date', doc.meta.date),
          metaCell('Version', doc.meta.version), metaCell('Price list', doc.meta.pricelist),
        ],
        columnGap: 10.5,
      },
      { canvas: [{ type: 'line', x1: 0, y1: 6.75, x2: 529, y2: 6.75, lineWidth: 0.4, lineColor: C.hair }] },
      // ---- sections ----
      ...doc.sections.flatMap((s) => [sectionHeader(s.title, s.total, s.note), itemTable(s.items)]),
      // ---- grand total ----
      { canvas: [{ type: 'line', x1: 0, y1: 7.5, x2: 529, y2: 7.5, lineWidth: 1.5, lineColor: C.ink }], margin: [0, 0, 0, 5] },
      {
        columns: [
          { text: doc.grand.label.toUpperCase(), fontSize: 6, bold: true, color: C.ink, characterSpacing: 1.35, margin: [0, 6, 0, 0], width: '*' },
          {
            width: 'auto',
            stack: [
              { text: doc.grand.total, font: 'LibreCaslon', fontSize: 15.75, color: C.ink, alignment: 'right' },
              { text: doc.grand.sub, fontSize: 6.4, color: C.gray, alignment: 'right', margin: [0, 1.5, 0, 0] },
            ],
          },
        ],
      },
    ],
  };
}

module.exports = { buildDocDefinition, C, COLS };
