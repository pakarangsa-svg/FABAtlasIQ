import assert from 'node:assert/strict';
import {
  convertQty, resolveUnitCost, costRecipe, costBridge, whatIfSwap,
  runMonthlyAlerts, suggestedPrice, prettyPrice, costProject, paretoDrivers, sensitivity, round,
} from './fab-cost-engine.js';

let pass = 0, fail = 0;
const t = (name, fn) => {
  try { fn(); console.log('  ✓', name); pass++; }
  catch (e) { console.log('  ✗', name, '\n    ⓘ', e.message); fail++; }
};

/* ---------------- fixtures ---------------- */
const materials = {
  SHRIMP: {
    id: 'SHRIMP', code: 'RM-001', nameTh: 'กุ้งขาว 40/50', categoryId: 'SEAFOOD',
    stockUom: 'g', dimension: 'MASS', status: 'ACTIVE', defaultWastePct: 25,
    prices: [
      { effectiveDate: '2026-06-01', price: 240, purchaseUom: 'kg', packQty: 1000, supplierId: 'SUP-A' },
      { effectiveDate: '2026-08-01', price: 300, purchaseUom: 'kg', packQty: 1000, supplierId: 'SUP-A' },
    ],
    attachments: [{ id: 'a1', type: 'SPEC', fileName: 'shrimp-spec.pdf', url: '#', expiryDate: '2026-09-01' }],
  },
  SHRIMP_FROZEN: {
    id: 'SHRIMP_FROZEN', code: 'RM-002', nameTh: 'กุ้งแช่แข็ง 40/50', categoryId: 'SEAFOOD',
    stockUom: 'g', dimension: 'MASS', status: 'ACTIVE', defaultWastePct: 10,
    prices: [{ effectiveDate: '2026-01-01', price: 210, purchaseUom: 'kg', packQty: 1000, supplierId: 'SUP-B' }],
  },
  OIL: {
    id: 'OIL', code: 'RM-010', nameTh: 'น้ำมันรำข้าว', categoryId: 'DRY',
    stockUom: 'g', dimension: 'MASS', densityGPerMl: 0.92, status: 'ACTIVE',
    prices: [{ effectiveDate: '2026-01-01', price: 60, purchaseUom: 'L', packQty: 920 }],
  },
  LEMONGRASS: {
    id: 'LEMONGRASS', code: 'RM-020', nameTh: 'ตะไคร้', categoryId: 'VEG',
    stockUom: 'g', dimension: 'MASS', status: 'ACTIVE', defaultWastePct: 30,
    prices: [{ effectiveDate: '2026-05-01', price: 40, purchaseUom: 'kg', packQty: 1000 }],
  },
  BOX: {
    id: 'BOX', code: 'PK-001', nameTh: 'กล่องกระดาษ 750ml', categoryId: 'PACK',
    stockUom: 'pc', dimension: 'EACH', status: 'ACTIVE',
    prices: [{ effectiveDate: '2026-01-01', price: 250, purchaseUom: 'pack', packQty: 100 }],
  },
};

const recipes = {
  STOCK: {
    id: 'STOCK', code: 'SR-001', nameTh: 'น้ำซุปต้มยำ', kind: 'SUB_RECIPE', brandId: 'B1',
    version: 1, status: 'APPROVED', effectiveDate: '2026-01-01',
    batchYieldQty: 5, batchYieldUom: 'L', portionsPerBatch: 20,
    lines: [
      { id: 'l1', refType: 'RM', refId: 'LEMONGRASS', qty: 300, uom: 'g' },
      { id: 'l2', refType: 'RM', refId: 'OIL', qty: 100, uom: 'ml' },
    ],
  },
  TOMYUM: {
    id: 'TOMYUM', code: 'MN-001', nameTh: 'ต้มยำกุ้ง', kind: 'MENU', brandId: 'B1',
    version: 3, status: 'APPROVED', effectiveDate: '2026-01-01',
    batchYieldQty: 10, batchYieldUom: 'L', cookingLossPct: 5, portionsPerBatch: 20,
    targetFoodCostPct: 32, sellingPrice: 189,
    lines: [
      { id: 'm1', refType: 'RM', refId: 'SHRIMP', qty: 1200, uom: 'g' },
      { id: 'm2', refType: 'RECIPE', refId: 'STOCK', qty: 8, uom: 'L' },
      { id: 'm3', refType: 'PACKAGING', refId: 'BOX', qty: 20, uom: 'pc' },
    ],
  },
};

const db = { materials, recipes };

/* ---------------- tests ---------------- */
console.log('\n[1] UOM conversion');
t('kg -> g', () => assert.equal(convertQty(1.5, 'kg', 'g'), 1500));
t('L -> ml', () => assert.equal(convertQty(2, 'L', 'ml'), 2000));
t('tbsp -> ml', () => assert.equal(convertQty(3, 'tbsp', 'ml'), 45));
t('ml -> g ด้วย density', () =>
  assert.equal(round(convertQty(100, 'ml', 'g', { densityGPerMl: 0.92 }), 4), 92));
t('ข้าม dimension โดยไม่มี density ต้อง throw', () =>
  assert.throws(() => convertQty(1, 'L', 'kg')));
t('หน่วยไม่รู้จักต้อง throw', () => assert.throws(() => convertQty(1, 'ถัง', 'g')));

console.log('\n[2] Price resolution');
t('LATEST ใช้ราคาที่ effective แล้วเท่านั้น', () => {
  assert.equal(resolveUnitCost(materials.SHRIMP, '2026-07-15').unitCost, 0.24);
  assert.equal(resolveUnitCost(materials.SHRIMP, '2026-08-20').unitCost, 0.30);
});
t('ราคาก่อนมี price point แรก = NO_PRICE', () => {
  const r = resolveUnitCost(materials.SHRIMP, '2026-01-01');
  assert.equal(r.basis, 'NO_PRICE');
  assert.equal(r.unitCost, 0);
});
t('packQty แปลงหน่วยใหญ่->เล็กถูกต้อง (60฿/920g)', () => {
  assert.equal(round(resolveUnitCost(materials.OIL, '2026-08-20').unitCost, 6), 0.065217);
});
t('staleDays คำนวณถูก', () => {
  const r = resolveUnitCost(materials.LEMONGRASS, '2026-08-20');
  assert.equal(r.staleDays, 111);
});
t('AVG_3M เฉลี่ยเฉพาะจุดในหน้าต่างเท่า', () => {
  const r = resolveUnitCost(materials.SHRIMP, '2026-08-20', { method: 'AVG_3M' });
  assert.equal(round(r.unitCost, 4), 0.27); // (0.24 + 0.30)/2
});

console.log('\n[3] Recipe costing');
const c = costRecipe('TOMYUM', db, { costingDate: '2026-08-20' });
t('กุ้ง: waste 25% -> gross = 1200/0.75 = 1600 g', () => {
  const l = c.lines.find((x) => x.refId === 'SHRIMP');
  assert.equal(round(l.grossQtyBase, 4), 1600);
  assert.equal(round(l.cost, 2), 480); // 1600 * 0.30
});
t('sub-recipe scale ถูก: ต้องการ 8L จาก batch 5L = 1.6 batch', () => {
  const lg = c.lines.find((x) => x.refId === 'LEMONGRASS');
  // 300g / (1-0.30) = 428.571 g ต่อ batch * 1.6 = 685.714 g
  assert.equal(round(lg.grossQtyBase, 3), 685.714);
});
t('packaging 20 กล่อง = 50 บาท', () => {
  const b = c.lines.find((x) => x.refId === 'BOX');
  assert.equal(round(b.cost, 2), 50);
});
t('batchCost = ผลรวมทุกบรรทัด', () => {
  const sum = c.lines.reduce((s, l) => s + l.cost, 0);
  assert.equal(round(sum, 6), round(c.batchCost, 6));
});
t('sharePct รวมได้ 100', () => {
  const s = c.lines.reduce((a, l) => a + l.sharePct, 0);
  assert.equal(round(s, 4), 100);
});
t('costPerPortion = batchCost / 20', () =>
  assert.equal(round(c.costPerPortion, 6), round(c.batchCost / 20, 6)));
t('food cost % คำนวณจากราคาขาย', () =>
  assert.equal(round(c.foodCostPct, 4), round((c.costPerPortion / 189) * 100, 4)));
t('gp% + foodCost% = 100', () => assert.equal(round(c.foodCostPct + c.gpPct, 6), 100));
t('มี warning เอกสาร/ราคา', () => assert.ok(Array.isArray(c.warnings)));

console.log('\n[4] labor & overhead');
const c2 = costRecipe('TOMYUM', db, { costingDate: '2026-08-20', laborPerBatch: 100, overheadPct: 10 });
t('labor+overhead รวมเข้า batchCost', () =>
  assert.equal(round(c2.batchCost, 4), round(c.batchCost * 1.1 + 100, 4)));

console.log('\n[5] Cost bridge (ต้นทุนเพิ่มมาจากอะไร)');
const cPrev = costRecipe('TOMYUM', db, { costingDate: '2026-07-15' });
const bridge = costBridge(cPrev, c);
t('delta ตรงกับส่วนต่างจริง', () =>
  assert.equal(round(bridge.delta, 6), round(c.batchCost - cPrev.batchCost, 6)));
t('กุ้งเป็นตัวขับหลัก และ driver = PRICE', () => {
  assert.equal(bridge.items[0].refId, 'SHRIMP');
  assert.equal(bridge.items[0].driver, 'PRICE');
});
t('price effect ของกุ้ง = 1600 * (0.30-0.24) = 96', () =>
  assert.equal(round(bridge.items[0].priceEffect, 2), 96));
t('ผลรวม effect = delta (ไม่มี yield effect)', () => {
  const sum = bridge.items.reduce((s, i) => s + i.total, 0);
  assert.equal(round(sum, 6), round(bridge.delta, 6));
  assert.equal(round(bridge.yieldEffect, 6), 0);
});
t('summary ภาษาไทยอ่านรู้เรื่อง', () => {
  assert.match(bridge.summaryTh, /ต้นทุนเพิ่มขึ้น/);
  assert.match(bridge.summaryTh, /กุ้ง/);
});

console.log('\n[6] What-if RM swap');
const wi = whatIfSwap('TOMYUM', db, { costingDate: '2026-08-20' }, [
  { label: 'เปลี่ยนเป็นกุ้งแช่แข็ง', substitutions: { SHRIMP: 'SHRIMP_FROZEN' } },
]);
t('สลับกุ้งแล้วถูกลง', () => assert.ok(wi.scenarios[0].deltaPerPortion < 0));
t('waste ของ RM ใหม่ถูกใช้ (10% -> gross 1333.33)', () => {
  const l = wi.scenarios[0].result.lines.find((x) => x.refId === 'SHRIMP_FROZEN');
  assert.equal(round(l.grossQtyBase, 2), 1333.33);
  assert.equal(round(l.cost, 2), 280); // 1333.33 * 0.21
});
t('bridge บ่งได้ว่าเป็น ADDED/REMOVED (เปลี่ยนตัววัตถุดิบ)', () => {
  const drivers = wi.scenarios[0].bridge.items.map((i) => i.driver);
  assert.ok(drivers.includes('ADDED') && drivers.includes('REMOVED'));
});

console.log('\n[7] Alerts');
const alerts = runMonthlyAlerts(db, { prevDate: '2026-07-20', currDate: '2026-08-20' });
t('จับราคากุ้ง +25% ได้', () =>
  assert.ok(alerts.some((a) => a.type === 'RM_SPIKE' && a.subjectId === 'SHRIMP')));
t('จับ COG jump ของต้มยำได้', () =>
  assert.ok(alerts.some((a) => a.type === 'COG_JUMP' && a.subjectId === 'TOMYUM')));
t('จับ spec sheet ใกล้หมดอายุได้', () =>
  assert.ok(alerts.some((a) => a.type === 'SPEC_EXPIRY')));
t('จับราคาค้างนานได้', () =>
  assert.ok(alerts.some((a) => a.type === 'STALE_PRICE' && a.subjectId === 'LEMONGRASS')));
t('เรียง CRITICAL มาก่อน', () => {
  const idx = alerts.findIndex((a) => a.severity !== 'CRITICAL');
  assert.ok(idx === -1 || alerts.slice(idx).every((a) => a.severity !== 'CRITICAL'));
});
t('COG_JUMP มี detail บอกสาเหตุ', () => {
  const a = alerts.find((x) => x.type === 'COG_JUMP');
  assert.match(a.detailTh, /กุ้ง/);
});

console.log('\n[8] Pricing helpers');
t('suggestedPrice ให้ food cost ตามเข้า', () => {
  const p = suggestedPrice(64, 32);
  assert.equal(round(p, 2), 200);
});
t('prettyPrice END_9', () => assert.equal(prettyPrice(183.4), 189));
t('prettyPrice ROUND_10', () => assert.equal(prettyPrice(183.4, 'ROUND_10'), 190));

console.log('\n[9] Pareto & sensitivity');
const pareto = paretoDrivers(c);
t('cumPct สุดท้าย = 100', () => assert.equal(round(pareto.at(-1).cumPct, 4), 100));
t('ตัวแรกอยู่ใน Pareto', () => assert.ok(pareto[0].inPareto));
t('sensitivity: shock 10% ของ RM ที่คิด 70% => COG +7%', () => {
  const s = sensitivity(c, 10)[0];
  assert.equal(round(s.cogImpactPct, 6), round((s.sharePct * 10) / 100, 6));
});

console.log('\n[10] Project BOM');
const project = {
  id: 'P1', code: 'PRJ-2026-01', nameTh: 'Set Menu ฤดูกาล', brandId: 'B1',
  stage: 'DEVELOP', ownerId: 'u1', startDate: '2026-07-01', targetLaunchDate: '2026-10-01',
  targetCogPerSet: 60,
  items: [{ recipeId: 'TOMYUM', recipeVersion: 3, qtyPerSet: 1, role: 'CORE' }],
  milestones: [],
};
const pc = costProject(project, db, { costingDate: '2026-08-20' });
t('cogPerSet คิดเฉพาะ CORE', () =>
  assert.equal(round(pc.cogPerSet, 6), round(c.costPerPortion, 6)));
t('overTarget คำนวณถูก', () =>
  assert.equal(round(pc.overTarget, 6), round(c.costPerPortion - 60, 6)));

console.log('\n[11] Edge cases');
t('circular sub-recipe ไม่ทำให้ค้าง', () => {
  const d2 = {
    materials,
    recipes: {
      A: { id: 'A', nameTh: 'A', kind: 'SUB_RECIPE', lines: [{ id: 'x', refType: 'RECIPE', refId: 'B', qty: 1, uom: 'L' }], batchYieldQty: 1, batchYieldUom: 'L', portionsPerBatch: 1 },
      B: { id: 'B', nameTh: 'B', kind: 'SUB_RECIPE', lines: [{ id: 'y', refType: 'RECIPE', refId: 'A', qty: 1, uom: 'L' }], batchYieldQty: 1, batchYieldUom: 'L', portionsPerBatch: 1 },
    },
  };
  const r = costRecipe('A', d2, { costingDate: '2026-08-20' });
  assert.ok(r.warnings.some((w) => w.includes('circular')));
});
t('RM ไม่มีราคา -> warning + cost 0 ไม่ NaN', () => {
  const d3 = {
    materials: { ...materials, X: { id: 'X', code: 'RM-X', nameTh: 'ของใหม่', stockUom: 'g', dimension: 'MASS', status: 'ACTIVE', prices: [] } },
    recipes: { R: { id: 'R', nameTh: 'R', kind: 'MENU', lines: [{ id: '1', refType: 'RM', refId: 'X', qty: 100, uom: 'g' }], batchYieldQty: 1, batchYieldUom: 'L', portionsPerBatch: 1 } },
  };
  const r = costRecipe('R', d3, { costingDate: '2026-08-20' });
  assert.equal(r.batchCost, 0);
  assert.ok(!Number.isNaN(r.costPerPortion));
  assert.ok(r.warnings.some((w) => w.includes('ยังไม่มีราคา')));
});
t('waste 100% ไม่ทำให้ Infinity', () => {
  const d4 = {
    materials,
    recipes: { R: { id: 'R', nameTh: 'R', kind: 'MENU', lines: [{ id: '1', refType: 'RM', refId: 'SHRIMP', qty: 100, uom: 'g', wastePct: 100 }], batchYieldQty: 1, batchYieldUom: 'L', portionsPerBatch: 1 } },
  };
  const r = costRecipe('R', d4, { costingDate: '2026-08-20' });
  assert.ok(Number.isFinite(r.batchCost));
  assert.ok(r.warnings.some((w) => w.includes('waste%')));
});

console.log(`\n${'='.repeat(46)}\nผ่าน ${pass} / ล้มเหลว ${fail}\n${'='.repeat(46)}`);
process.exit(fail ? 1 : 0);
