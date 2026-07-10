// Quick functional smoke test for the BOM tool data logic
const fs = require('fs');
const path = require('path');

const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'sm_price_data.json'), 'utf-8'));
const PRICE_DATA = data;

// --- replicate key functions ---
function detectThickness(f) {
  const m = String(f).match(/(\d+)\s*mm/i);
  return m ? m[1]+'mm' : '18mm';
}

function validateGola(item, finish, variant) {
  if(variant !== 'gola') return {ok:true};
  if(item.prices && !(finish+'__gola' in item.prices)) return {ok:false, reason:`"${item.desc}" with "${finish}" does not support Gola.`};
  return {ok:true};
}

const NO_HANDLE_CATS = new Set(['Glass Doors','Ornament Artdeco','Artdeco Base Unit','Artdeco Wall Unit','Artdeco Tall Unit']);

function getFinishes(cat) {
  const items = PRICE_DATA.kitchen[cat] || [];
  const fs = new Set();
  items.forEach(it => Object.keys(it.prices).forEach(k => {
    const finish = k.split('__')[0];
    if(finish && finish !== '(No Finish)') fs.add(finish);
  }));
  return [...fs].sort();
}

function getPool(cat, finish, variant) {
  variant = variant || 'standard';
  return (PRICE_DATA.kitchen[cat]||[]).filter(it => {
    const keys = Object.keys(it.prices);
    if(keys.every(k=>k.startsWith('(No Finish)'))) return true;
    return (finish+'__'+variant) in it.prices || (finish+'__standard') in it.prices;
  });
}

// --- tests ---
let passed = 0, failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log('  ✓ ' + name);
    passed++;
  } catch(e) {
    console.log('  ✗ ' + name + ': ' + e.message);
    failed++;
  }
}

function assert(cond, msg) { if(!cond) throw new Error(msg || 'assertion failed'); }

console.log('\n=== Kitchen Categories ===');
const cats = Object.keys(PRICE_DATA.kitchen);
test('All 8 categories present', () => {
  const expected = ['Base Unit','Wall Unit','Tall Unit','Artdeco Base Unit','Artdeco Wall Unit','Artdeco Tall Unit','Glass Doors','Ornament Artdeco'];
  expected.forEach(c => assert(cats.includes(c), 'Missing: ' + c));
});

console.log('\n=== Base Unit ===');
test('Base Unit has items', () => assert(PRICE_DATA.kitchen['Base Unit'].length > 0));
test('Base Unit first item has desc and prices', () => {
  const it = PRICE_DATA.kitchen['Base Unit'][0];
  assert(it.desc, 'No desc');
  assert(Object.keys(it.prices).length > 0, 'No prices');
});
test('Base Unit first item has TZ__standard price', () => {
  const it = PRICE_DATA.kitchen['Base Unit'][0];
  assert('TZ (High Gloss & Satin)__standard' in it.prices, 'Missing TZ standard');
});
test('Base Unit first item has subcat and dims', () => {
  const it = PRICE_DATA.kitchen['Base Unit'][0];
  assert(it.subcat, 'Missing subcat');
  assert(it.w && it.h && it.d, 'Missing dimensions');
});

console.log('\n=== Finishes ===');
test('Base Unit finishes list is non-empty', () => {
  const fs = getFinishes('Base Unit');
  assert(fs.length > 0, 'No finishes');
  console.log('    Finishes (' + fs.length + '): ' + fs.slice(0,3).join(', ') + '...');
});
test('Artdeco Base Unit finishes exclude gola', () => {
  const items = PRICE_DATA.kitchen['Artdeco Base Unit'];
  const hasGola = items.some(it => Object.keys(it.prices).some(k => k.endsWith('__gola')));
  assert(!hasGola, 'Artdeco should not have gola');
});
test('Glass Doors uses combined finish key', () => {
  const it = PRICE_DATA.kitchen['Glass Doors'][0];
  const keys = Object.keys(it.prices);
  const hasPipe = keys.some(k => k.includes(' | '));
  assert(hasPipe, 'Glass Doors should have pipe-separated keys. Got: ' + keys[0]);
});
test('Ornament Artdeco uses color as key', () => {
  const it = PRICE_DATA.kitchen['Ornament Artdeco'][0];
  const keys = Object.keys(it.prices);
  assert(keys.some(k => k.includes('WHITE') || k.includes('COLOR')), 'Expected COLOR key, got: ' + keys[0]);
});

console.log('\n=== Search Pool ===');
test('Pool for Base Unit + TZ + standard returns items', () => {
  const pool = getPool('Base Unit', 'TZ (High Gloss & Satin)', 'standard');
  assert(pool.length > 0, 'Empty pool');
  console.log('    Base Unit + TZ + standard: ' + pool.length + ' items');
});
test('Pool includes (No Finish) items regardless of finish', () => {
  const pool = getPool('Base Unit', 'TZ (High Gloss & Satin)', 'standard');
  const noFinishItems = PRICE_DATA.kitchen['Base Unit'].filter(it =>
    Object.keys(it.prices).every(k => k.startsWith('(No Finish)'))
  );
  if(noFinishItems.length > 0) {
    assert(pool.some(it => it.desc === noFinishItems[0].desc), 'No-finish item not in pool');
  }
});
test('Pool for Gola returns subset of Standard', () => {
  const std = getPool('Base Unit', 'TZ (High Gloss & Satin)', 'standard');
  const gola = getPool('Base Unit', 'TZ (High Gloss & Satin)', 'gola');
  assert(gola.length > 0, 'No gola items');
  assert(gola.length <= std.length, 'Gola should be subset of standard');
  console.log('    Standard: ' + std.length + ', Gola: ' + gola.length);
});

console.log('\n=== Gola Validation ===');
test('validateGola passes for standard', () => {
  const check = validateGola(PRICE_DATA.kitchen['Base Unit'][0], 'TZ (High Gloss & Satin)', 'standard');
  assert(check.ok, 'Should pass for standard');
});
test('validateGola blocks gola if key absent', () => {
  const tallItem = PRICE_DATA.kitchen['Tall Unit'][0];
  const f = Object.keys(tallItem.prices)[0].split('__')[0];
  const check = validateGola(tallItem, f, 'gola');
  // Tall unit has no gola
  if(!check.ok) { /* correct */ } else {
    // Verify item actually lacks gola key
    assert(!(f+'__gola' in tallItem.prices) === !check.ok, 'Gola validation wrong for tall unit');
  }
});

console.log('\n=== Thickness Detection ===');
test('detectThickness finds mm in finish name', () => {
  assert(detectThickness('Swiss Elm Amber 18mm') === '18mm', 'Should detect 18mm');
  assert(detectThickness('TZ (High Gloss & Satin)') === '18mm', 'No mm → default 18mm');
});

console.log('\n=== Wardrobe / Accessories (placeholders) ===');
test('Wardrobe data is empty object', () => {
  assert(typeof PRICE_DATA.wardrobe === 'object', 'Should be object');
  assert(Object.keys(PRICE_DATA.wardrobe).length === 0, 'Should be empty');
});
test('Accessories data is empty object', () => {
  assert(typeof PRICE_DATA.accessories === 'object', 'Should be object');
  assert(Object.keys(PRICE_DATA.accessories).length === 0, 'Should be empty');
});

console.log('\n' + '='.repeat(40));
console.log('Passed: ' + passed + ' / ' + (passed+failed));
if(failed > 0) { console.log('FAILED: ' + failed); process.exit(1); }
else console.log('All tests passed!');
