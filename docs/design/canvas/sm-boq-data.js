// ============================================================
// Stella Mobili BOQ — sample product/price database
// (Representative subset standing in for the real ~3MB catalogue.
//  Same schema/shape as production data: prices keyed "Finish__variant".)
// ============================================================

function hash(s){ let h=0; for(let i=0;i<s.length;i++){ h=(h*31+s.charCodeAt(i))|0; } return Math.abs(h); }
function round1000(n){ return Math.round(n/1000)*1000; }

// ---- Kitchen finishes (handle-capable categories) ----
const KIT_FINISHES = [
  {name:'TZ High Gloss & Satin', thickness:'18mm', gola:true, base:3500000},
  {name:'Classic Doors PVC', thickness:'18mm', gola:true, base:3000000},
  {name:'Classic Glass Doors PVC', thickness:'18mm', gola:false, base:3950000},
  {name:'Classic Doors Painted', thickness:'20mm', gola:true, base:3550000},
  {name:'Riquadra Panel', thickness:'19mm', gola:true, base:3000000},
  {name:'Riquadra Glass', thickness:'19mm', gola:false, base:3600000},
  {name:'Vanguard P30 (White)', thickness:'18mm', gola:true, base:2700000},
  {name:'Collalto Gold', thickness:'18mm', gola:true, base:2750000},
  {name:'Collalto Silver / Platin', thickness:'18mm', gola:true, base:2780000},
  {name:'Argento', thickness:'18mm', gola:true, base:2850000},
  {name:'Fittipaldi (Sable LR29)', thickness:'16mm', gola:true, base:2750000},
  {name:'Patrese (Sable)', thickness:'16mm', gola:true, base:2900000},
  {name:'Ascari (Sable)', thickness:'16mm', gola:false, base:2600000},
  {name:'Madre Perla (Reflex FA68)', thickness:'18mm', gola:true, base:2850000},
  {name:'Ancona Walnut S.1055', thickness:'18mm', gola:true, base:2650000},
];
const ARTDECO_FINISHES = [
  {name:'Artdeco Noir', thickness:'18mm', base:2450000},
  {name:'Artdeco Ivory', thickness:'18mm', base:2400000},
  {name:'Artdeco Sage', thickness:'18mm', base:2550000},
  {name:'Artdeco Terracotta', thickness:'18mm', base:2600000},
  {name:'Artdeco Graphite', thickness:'18mm', base:2650000},
];
const GLASS_DOOR_FINISHES = [
  {name:'Classic Glass Doors PVC', thickness:'18mm', base:3950000},
  {name:'Riquadra Glass', thickness:'19mm', base:3600000},
  {name:'TZ High Gloss & Satin', thickness:'18mm', base:3500000},
];
const WD_FINISHES = [
  {name:'TZ High Gloss & Satin', thickness:'18mm', base:3300000},
  {name:'Classic Doors PVC', thickness:'18mm', base:2850000},
  {name:'Riquadra Panel', thickness:'19mm', base:2850000},
  {name:'Vanguard P30 (White)', thickness:'18mm', base:2550000},
  {name:'Collalto Gold', thickness:'18mm', base:2600000},
  {name:'Ancona Walnut S.1055', thickness:'18mm', base:2500000},
  {name:'Lapland Elm', thickness:'18mm', base:2500000},
];

function kitPrices(finishList, mult){
  const prices={}, thicknesses={};
  finishList.forEach(f=>{
    const std = round1000(f.base*mult);
    prices[f.name+'__standard']=std;
    thicknesses[f.name+'__standard']=f.thickness;
    if(f.gola!==false){
      prices[f.name+'__gola']=round1000(std*1.019);
      thicknesses[f.name+'__gola']=f.thickness;
    }
  });
  return {prices,thicknesses};
}
function wdPrices(finishList, mult){
  const prices={}, thicknesses={};
  finishList.forEach(f=>{
    const std=round1000(f.base*mult);
    prices[f.name+'__standard']=std;
    thicknesses[f.name+'__standard']=f.thickness;
  });
  return {prices,thicknesses};
}
function kitItem(subcat,desc,w,h,d,mult,finishList,unit){
  const {prices,thicknesses}=kitPrices(finishList,mult);
  return {subcat,desc,w,h,d,unit:unit||'set',notes:'',prices,thicknesses};
}
function wdItem(subcat,desc,w,h,d,mult,finishList,unit){
  const {prices,thicknesses}=wdPrices(finishList,mult);
  return {subcat,desc,w,h,d,unit:unit||'set',notes:'',prices,thicknesses};
}
function glassItem(subcat,desc,w,h,d,mult,glassTypes,type2List){
  const prices={};
  glassTypes.forEach(g=>type2List.forEach(t2=>{
    prices[`${g.name} | ${t2}__standard`]=round1000((g.base||3200000)*mult);
  }));
  return {subcat,desc,w,h,d,unit:'set',notes:'',prices};
}
function nofinItem(subcat,desc,price,unit,extra){
  return Object.assign({subcat,desc,w:null,h:null,d:null,unit:unit||'set',notes:'',prices:{'(No Finish)__standard':price}}, extra||{});
}

function buildKitchen(){
  const k = {};
  k['Base Unit'] = [
    kitItem('Base Unit Shelf','BU Shelf w.300',300,740,560,1.0,KIT_FINISHES),
    kitItem('Base Unit Shelf','BU Shelf w.400',400,740,560,1.08,KIT_FINISHES),
    kitItem('Base Unit Drawer','BU 3-Drawer w.450',450,740,560,1.35,KIT_FINISHES),
    kitItem('Base Unit Corner','BU Corner Unit w.900',900,740,560,1.6,KIT_FINISHES),
    kitItem('Base Unit Sink','BU Sink Unit w.800',800,740,560,1.45,KIT_FINISHES),
  ];
  k['Wall Unit'] = [
    kitItem('Wall Unit','WU Shelf w.300',300,720,320,0.78,KIT_FINISHES),
    kitItem('Wall Unit','WU Shelf w.400',400,720,320,0.85,KIT_FINISHES),
    kitItem('Wall Unit Corner','WU Corner Unit w.600',600,720,320,1.15,KIT_FINISHES),
    kitItem('Wall Unit Lift-Up','WU Lift-Up Door w.900',900,400,320,1.3,KIT_FINISHES),
  ];
  k['Tall Unit'] = [
    kitItem('Tall Unit Larder','TU Larder w.400',400,2100,560,1.9,KIT_FINISHES),
    kitItem('Tall Unit Oven Housing','TU Oven Housing w.600',600,2100,560,2.1,KIT_FINISHES),
    kitItem('Tall Unit Fridge Housing','TU Fridge Housing w.600',600,2100,600,2.3,KIT_FINISHES),
  ];
  k['Artdeco Base Unit'] = [
    kitItem('Base Unit Shelf','Artdeco BU Shelf w.300',300,740,560,0.92,ARTDECO_FINISHES),
    kitItem('Base Unit Drawer','Artdeco BU 3-Drawer w.450',450,740,560,1.22,ARTDECO_FINISHES),
  ];
  k['Artdeco Wall Unit'] = [
    kitItem('Wall Unit','Artdeco WU Shelf w.300',300,720,320,0.7,ARTDECO_FINISHES),
    kitItem('Wall Unit Corner','Artdeco WU Corner w.600',600,720,320,1.02,ARTDECO_FINISHES),
  ];
  k['Artdeco Tall Unit'] = [
    kitItem('Tall Unit Larder','Artdeco TU Larder w.400',400,2100,560,1.7,ARTDECO_FINISHES),
    kitItem('Tall Unit Oven Housing','Artdeco TU Oven Housing w.600',600,2100,560,1.9,ARTDECO_FINISHES),
  ];
  k['Glass Doors'] = [
    kitItem('Glass Door Panel','Glass Door Panel w.300',300,720,20,0.55,GLASS_DOOR_FINISHES),
    kitItem('Glass Door Panel','Glass Door Panel w.400',400,720,20,0.62,GLASS_DOOR_FINISHES),
  ];
  k['Ornament Artdeco'] = [
    kitItem('Cornice','Cornice Trim 2400mm',2400,60,60,0.14,ARTDECO_FINISHES,'pcs'),
    kitItem('Pilaster','Pilaster Column 2100mm',2100,80,80,0.24,ARTDECO_FINISHES,'pcs'),
  ];
  return k;
}

function buildWardrobe(){
  const w = {};
  w['Wardrobe Swing Door 110'] = [
    wdItem('Swing Door 110','Swing Door 110 w.400',400,1100,580,0.92,WD_FINISHES),
    wdItem('Swing Door 110','Swing Door 110 w.500',500,1100,580,1.0,WD_FINISHES),
  ];
  w['Wardrobe Swing Door 170'] = [
    wdItem('Swing Door 170','Swing Door 170 w.400',400,1700,580,1.25,WD_FINISHES),
    wdItem('Swing Door 170','Swing Door 170 w.500',500,1700,580,1.38,WD_FINISHES),
  ];
  w['Wardrobe Sliding Door'] = [
    wdItem('Sliding Door','Sliding Door Unit w.1800',1800,2200,620,2.7,WD_FINISHES),
    wdItem('Sliding Door','Sliding Door Unit w.2400',2400,2200,620,3.3,WD_FINISHES),
  ];
  w['Upper Cabinet'] = [
    wdItem('Upper Cabinet','Upper Cabinet w.400',400,600,580,0.62,WD_FINISHES),
    wdItem('Upper Cabinet','Upper Cabinet w.600',600,600,580,0.78,WD_FINISHES),
  ];
  w['Base Cabinet BLUM'] = [
    wdItem('Base Cabinet','BLUM Base Cabinet w.450',450,700,580,1.15,WD_FINISHES),
    wdItem('Base Cabinet','BLUM Base Cabinet w.600',600,700,580,1.32,WD_FINISHES),
  ];
  w['Base Cabinet STD'] = [
    wdItem('Base Cabinet','STD Base Cabinet w.450',450,700,580,0.88,WD_FINISHES),
    wdItem('Base Cabinet','STD Base Cabinet w.600',600,700,580,1.02,WD_FINISHES),
  ];
  const swingGlass = [{name:'Clear Tempered 5mm',base:3300000},{name:'Frosted Tempered 5mm',base:3450000},{name:'Bronze Tempered 5mm',base:3600000}];
  w['Swing Glass Door'] = [
    glassItem('Swing Glass Door','Swing Glass Door w.400',400,1100,580,0.95,swingGlass,['Concealed Hinge','Piano Hinge']),
    glassItem('Swing Glass Door','Swing Glass Door w.500',500,1100,580,1.05,swingGlass,['Concealed Hinge','Piano Hinge']),
  ];
  const slideGlass = [{name:'Clear Tempered 5mm',base:3700000},{name:'Frosted Tempered 5mm',base:3850000},{name:'Bronze Tempered 5mm',base:4000000}];
  w['Sliding Glass Door'] = [
    glassItem('Sliding Glass Door','Sliding Glass Door w.1800',1800,2200,620,0.95,slideGlass,['Slim Aluminium Frame','Full Aluminium Frame']),
    glassItem('Sliding Glass Door','Sliding Glass Door w.2400',2400,2200,620,1.15,slideGlass,['Slim Aluminium Frame','Full Aluminium Frame']),
  ];
  const mirrorGlass = [{name:'Clear Mirror',base:2600000},{name:'Bronze Mirror',base:2800000},{name:'Grey Mirror',base:2750000}];
  w['Upper Cabinet Mirror'] = [
    glassItem('Upper Cabinet Mirror','Upper Cabinet Mirror w.400',400,600,580,0.7,mirrorGlass,['Concealed Hinge']),
    glassItem('Upper Cabinet Mirror','Upper Cabinet Mirror w.600',600,600,580,0.85,mirrorGlass,['Concealed Hinge']),
  ];
  w['Aluminium Marble Door Frame'] = [
    nofinItem('Frame Profile','Aluminium Frame Profile - Silver',185000,'m'),
    nofinItem('Frame Profile','Aluminium Frame Profile - Black',210000,'m'),
    nofinItem('Frame Insert','Marble Look Frame Insert',340000,'m'),
  ];
  w['Wardrobe Component'] = [
    nofinItem('Drawer Box','Drawer Box Standard w.450',420000,'pcs'),
    nofinItem('Hanging Rod','Hanging Rod Chrome 1200mm',165000,'pcs'),
    nofinItem('Pull-Out','Pull-Out Trouser Rack',780000,'set'),
    nofinItem('Divider','Shelf Divider Set',195000,'set'),
  ];
  return w;
}

function buildAccessories(){
  return {
    'Solid Surface': [
      nofinItem('Countertop','Solid Surface Countertop — White',2350000,'m²'),
      nofinItem('Countertop','Solid Surface Countertop — Grey',2480000,'m²'),
      nofinItem('Backsplash','Solid Surface Backsplash',1980000,'m²'),
    ],
    'Lighting': [
      nofinItem('LED Strip','LED Strip Warm White 5m',420000,'set'),
      nofinItem('LED Strip','LED Strip Cool White 5m',420000,'set'),
      nofinItem('Puck Light','Puck Light Set (3pcs)',650000,'set'),
      nofinItem('Sensor Light','Under-Cabinet Sensor Light',890000,'pcs'),
    ],
    'Wardrobe Accessories': [
      nofinItem('Trouser Rack','Pull-Out Trouser Rack Deluxe',980000,'pcs'),
      nofinItem('Drawer Insert','Jewelry Drawer Insert',650000,'pcs'),
      nofinItem('Rack','Tie & Belt Rack',420000,'pcs'),
      nofinItem('Basket','Laundry Basket Pull-Out',1150000,'pcs'),
    ],
    'Kitchen Accessories': [
      nofinItem('Carousel','Corner Carousel Unit',2150000,'pcs'),
      nofinItem('Waste Bin','Waste Bin Pull-Out 2×12L',1380000,'pcs'),
      nofinItem('Cutlery Tray','Cutlery Tray Insert',480000,'pcs'),
      nofinItem('Plate Rack','Plate Rack Insert',560000,'pcs'),
    ],
    'Mirror': [
      nofinItem('Mirror Panel','Mirror Panel Bevelled',1450000,'m²'),
      nofinItem('Mirror Panel','Mirror Panel Plain',980000,'m²'),
      nofinItem('LED Mirror','LED Backlit Mirror Panel',2650000,'m²'),
    ],
    'Handles': [
      nofinItem('Profile Handle','Handle Profile - Aluminium Silver 3m',285000,'pcs',{code:'HD-101'}),
      nofinItem('Profile Handle','Handle Profile - Matte Black 3m',310000,'pcs',{code:'HD-104'}),
      nofinItem('Gola Channel','Recessed Gola Channel 3m',395000,'pcs',{code:'HD-118'}),
      nofinItem('Knob','Knob Handle - Brass',125000,'pcs',{code:'HD-142'}),
    ],
  };
}

const V26 = { kitchen: buildKitchen(), wardrobe: buildWardrobe(), accessories: buildAccessories() };

// Derive an older price-list version deterministically (for version-switch + diff demo)
function buildV25(){
  const clone = JSON.parse(JSON.stringify(V26));
  ['kitchen','wardrobe','accessories'].forEach(sec=>{
    Object.keys(clone[sec]).forEach(cat=>{
      clone[sec][cat] = clone[sec][cat].map((it,i)=>{
        const h = hash(it.desc+cat);
        if(h%7===0){ return null; } // didn't exist in v25 -> shows as NEW in v26
        const factor = 0.90 + (h%6)*0.012; // ~90%-95.6% of current price
        const prices={};
        Object.entries(it.prices).forEach(([k,p])=>{ prices[k]=round1000(p*factor); });
        return Object.assign({},it,{prices});
      }).filter(Boolean);
    });
  });
  return clone;
}

export const PRICE_LIST_VERSIONS = ['v25.11.01','v26.06.02'];
export const PRICE_LIST_LATEST = 'v26.06.02';
export const ALL_PRICE_DATA = { 'v25.11.01': buildV25(), 'v26.06.02': V26 };

export const KIT_CATS = ['Base Unit','Wall Unit','Tall Unit','Artdeco Base Unit','Artdeco Wall Unit','Artdeco Tall Unit','Glass Doors','Ornament Artdeco'];
export const NO_HANDLE_CATS = ['Glass Doors','Ornament Artdeco','Artdeco Base Unit','Artdeco Wall Unit','Artdeco Tall Unit'];

export const WD_CATS = ['Wardrobe Swing Door 110','Wardrobe Swing Door 170','Wardrobe Sliding Door','Swing Glass Door','Sliding Glass Door','Upper Cabinet','Upper Cabinet Mirror','Base Cabinet BLUM','Base Cabinet STD','Aluminium Marble Door Frame','Wardrobe Component'];
export const WD_GLASS_CATS = ['Swing Glass Door','Sliding Glass Door','Upper Cabinet Mirror'];
export const WD_NOFIN_CATS = ['Aluminium Marble Door Frame','Wardrobe Component'];

export const ACC_CATS = ['Solid Surface','Lighting','Wardrobe Accessories','Kitchen Accessories','Mirror','Handles'];
