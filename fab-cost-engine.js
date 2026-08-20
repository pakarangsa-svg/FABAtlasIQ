// fab-cost-engine.js — FabFood Group cost calculation engine

// ─── UOM tables ───────────────────────────────────────────────────────────────
const MASS_TO_G = { g: 1, kg: 1000, mg: 0.001, lb: 453.592, oz: 28.3495 };
const VOL_TO_ML = { ml: 1, L: 1000, l: 1000, tbsp: 15, tsp: 5, cup: 240, cc: 1 };

// ─── round ────────────────────────────────────────────────────────────────────
export function round(v, d = 2) {
  if (!Number.isFinite(v)) return v;
  const f = 10 ** d;
  return Math.round(v * f) / f;
}

// ─── convertQty ───────────────────────────────────────────────────────────────
export function convertQty(qty, fromUom, toUom, opts = {}) {
  if (fromUom === toUom) return qty;

  const fM = MASS_TO_G[fromUom];
  const tM = MASS_TO_G[toUom];
  const fV = VOL_TO_ML[fromUom];
  const tV = VOL_TO_ML[toUom];

  if (fM === undefined && fV === undefined) throw new Error(`Unknown UOM: ${fromUom}`);
  if (tM === undefined && tV === undefined) throw new Error(`Unknown UOM: ${toUom}`);

  if (fM !== undefined && tM !== undefined) return qty * fM / tM;
  if (fV !== undefined && tV !== undefined) return qty * fV / tV;

  // Cross-dimension requires density
  const { densityGPerMl } = opts;
  if (!densityGPerMl) throw new Error(`Cannot convert ${fromUom} to ${toUom} without density`);

  if (fV !== undefined && tM !== undefined) return (qty * fV * densityGPerMl) / tM;
  if (fM !== undefined && tV !== undefined) return (qty * fM) / (densityGPerMl * tV);

  throw new Error(`Cannot convert ${fromUom} to ${toUom}`);
}

// ─── date helpers ─────────────────────────────────────────────────────────────
function daysBetween(a, b) {
  return Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 86400000);
}

// ─── resolveUnitCost ──────────────────────────────────────────────────────────
export function resolveUnitCost(material, costingDate, opts = {}) {
  const { method = 'LATEST' } = opts;
  const { prices = [] } = material;

  const effective = prices
    .filter(p => p.effectiveDate <= costingDate)
    .sort((a, b) => a.effectiveDate < b.effectiveDate ? -1 : 1);

  if (effective.length === 0) return { unitCost: 0, basis: 'NO_PRICE', staleDays: null };

  const latest = effective[effective.length - 1];
  const staleDays = daysBetween(latest.effectiveDate, costingDate);

  if (method === 'AVG_3M') {
    const cutoff = new Date(costingDate + 'T00:00:00Z');
    cutoff.setUTCDate(cutoff.getUTCDate() - 90);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    const window = effective.filter(p => p.effectiveDate >= cutoffStr);
    const pts = window.length > 0 ? window : [latest];
    const unitCost = pts.reduce((s, p) => s + p.price / p.packQty, 0) / pts.length;
    return { unitCost, basis: 'AVG_3M', staleDays, latestPrice: latest };
  }

  return { unitCost: latest.price / latest.packQty, basis: 'LATEST', staleDays, latestPrice: latest };
}

// ─── costLine (internal, recursive) ──────────────────────────────────────────
function costLine(line, db, costingDate, ancestors) {
  const { refType, refId, qty, uom, wastePct: lineWaste } = line;
  const warnings = [];

  if (refType === 'RM' || refType === 'PACKAGING') {
    const mat = db.materials[refId];
    if (!mat) return { refId, refType, cost: 0, grossQtyBase: 0, unitCost: 0, nameTh: refId, warnings: [`วัตถุดิบ ${refId} ไม่พบ`] };

    const { unitCost, basis } = resolveUnitCost(mat, costingDate);
    if (basis === 'NO_PRICE') warnings.push(`${mat.nameTh} ยังไม่มีราคา`);

    // Spec expiry warnings
    for (const att of (mat.attachments || [])) {
      if (att.type === 'SPEC' && att.expiryDate) {
        const daysLeft = daysBetween(costingDate, att.expiryDate);
        if (daysLeft <= 30) warnings.push(`${mat.nameTh}: spec ครบอายุใน ${daysLeft} วัน`);
      }
    }

    let netQtyBase;
    try {
      netQtyBase = convertQty(qty, uom, mat.stockUom, { densityGPerMl: mat.densityGPerMl });
    } catch (e) {
      netQtyBase = qty;
      warnings.push(`แปลงหน่วย ${uom}->${mat.stockUom} ล้มเหลว`);
    }

    let wasteFraction = (lineWaste !== undefined ? lineWaste : (mat.defaultWastePct || 0)) / 100;
    if (wasteFraction >= 1) {
      warnings.push(`${mat.nameTh}: waste% ≥ 100 ตรวจสอบข้อมูล`);
      return { refId, refType, cost: 0, grossQtyBase: 0, netQtyBase, unitCost, wasteFraction, nameTh: mat.nameTh, warnings };
    }

    const grossQtyBase = netQtyBase / (1 - wasteFraction);
    const cost = grossQtyBase * unitCost;
    return { refId, refType, cost, grossQtyBase, netQtyBase, unitCost, wasteFraction, nameTh: mat.nameTh, warnings };
  }

  if (refType === 'RECIPE') {
    const sub = db.recipes[refId];
    if (!sub) return { refId, refType, cost: 0, subLines: [], warnings: [`recipe ${refId} ไม่พบ`] };
    if (ancestors.has(refId)) return { refId, refType, cost: 0, subLines: [], warnings: [`circular sub-recipe: ${refId}`] };

    let neededInBatchUom;
    try { neededInBatchUom = convertQty(qty, uom, sub.batchYieldUom); }
    catch (_) { neededInBatchUom = qty; }
    const scale = neededInBatchUom / sub.batchYieldQty;

    const newAnc = new Set(ancestors);
    newAnc.add(refId);

    const subLines = [];
    for (const sl of (sub.lines || [])) {
      const result = costLine({ ...sl, qty: sl.qty * scale }, db, costingDate, newAnc);
      warnings.push(...result.warnings);
      subLines.push(result);
    }
    return { refId, refType, cost: subLines.reduce((s, l) => s + l.cost, 0), subLines, warnings };
  }

  return { refId, refType, cost: 0, warnings: [`refType ${refType} ไม่รู้จัก`] };
}

function flattenLines(lr) {
  if (lr.subLines) return lr.subLines.flatMap(flattenLines);
  return [lr];
}

// ─── costRecipe ───────────────────────────────────────────────────────────────
export function costRecipe(recipeId, db, opts = {}) {
  const { costingDate, laborPerBatch = 0, overheadPct = 0 } = opts;
  const recipe = db.recipes[recipeId];
  if (!recipe) throw new Error(`Recipe ${recipeId} not found`);

  const warnings = [];
  const lineResults = [];

  for (const line of (recipe.lines || [])) {
    const r = costLine(line, db, costingDate, new Set([recipeId]));
    lineResults.push(r);
    warnings.push(...r.warnings);
  }

  const flatLines = lineResults.flatMap(r => r.subLines ? r.subLines.flatMap(flattenLines) : [r]);
  const rmCost = flatLines.reduce((s, l) => s + l.cost, 0);
  const batchCost = rmCost * (1 + overheadPct / 100) + laborPerBatch;
  const portionsPerBatch = recipe.portionsPerBatch || 1;
  const costPerPortion = batchCost / portionsPerBatch;
  const sellingPrice = recipe.sellingPrice || 0;
  const foodCostPct = sellingPrice > 0 ? (costPerPortion / sellingPrice) * 100 : 0;
  const gpPct = 100 - foodCostPct;

  const lines = flatLines.map(l => ({ ...l, sharePct: rmCost > 0 ? (l.cost / rmCost) * 100 : 0 }));

  return { recipeId, costingDate, lines, batchCost, rmCost, laborPerBatch, overheadPct, portionsPerBatch, costPerPortion, sellingPrice, foodCostPct, gpPct, targetFoodCostPct: recipe.targetFoodCostPct, warnings };
}

// ─── costBridge ───────────────────────────────────────────────────────────────
export function costBridge(prev, curr) {
  const delta = curr.batchCost - prev.batchCost;
  const prevMap = new Map(prev.lines.map(l => [l.refId, l]));
  const currMap = new Map(curr.lines.map(l => [l.refId, l]));
  const allIds = new Set([...prevMap.keys(), ...currMap.keys()]);

  const items = [];
  for (const refId of allIds) {
    const p = prevMap.get(refId);
    const c = currMap.get(refId);

    if (p && c) {
      const priceEffect = (c.grossQtyBase || 0) * ((c.unitCost || 0) - (p.unitCost || 0));
      const yieldEffect = (p.unitCost || 0) * ((c.grossQtyBase || 0) - (p.grossQtyBase || 0));
      const total = priceEffect + yieldEffect;
      if (Math.abs(total) > 1e-9) {
        const driver = Math.abs(priceEffect) >= Math.abs(yieldEffect) ? 'PRICE' : 'YIELD';
        items.push({ refId, driver, priceEffect, yieldEffect, total, nameTh: c.nameTh || refId });
      }
    } else if (!p && c) {
      items.push({ refId, driver: 'ADDED', priceEffect: c.cost, yieldEffect: 0, total: c.cost, nameTh: c.nameTh || refId });
    } else if (p && !c) {
      items.push({ refId, driver: 'REMOVED', priceEffect: -p.cost, yieldEffect: 0, total: -p.cost, nameTh: p.nameTh || refId });
    }
  }

  items.sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
  const yieldEffect = items.reduce((s, i) => s + i.yieldEffect, 0);
  const dir = delta >= 0 ? 'เพิ่มขึ้น' : 'ลดลง';
  const top = items[0];
  const summaryTh = `ต้นทุน${dir} ${round(Math.abs(delta), 2)} บาท${top ? ` สาเหตุหลักจาก${top.nameTh}` : ''}`;

  return { delta, items, yieldEffect, summaryTh };
}

// ─── whatIfSwap ───────────────────────────────────────────────────────────────
export function whatIfSwap(recipeId, db, opts, scenarioDefs) {
  const base = costRecipe(recipeId, db, opts);

  const scenarios = scenarioDefs.map(def => {
    const modRecipes = {
      ...db.recipes,
      [recipeId]: {
        ...db.recipes[recipeId],
        lines: db.recipes[recipeId].lines.map(l =>
          l.refType === 'RM' && def.substitutions[l.refId]
            ? { ...l, refId: def.substitutions[l.refId] }
            : l
        ),
      },
    };
    const modDb = { ...db, recipes: modRecipes };
    const result = costRecipe(recipeId, modDb, opts);
    const deltaPerPortion = result.costPerPortion - base.costPerPortion;
    const bridge = costBridge(base, result);
    return { label: def.label, result, deltaPerPortion, bridge };
  });

  return { base, scenarios };
}

// ─── runMonthlyAlerts ─────────────────────────────────────────────────────────
export function runMonthlyAlerts(db, opts) {
  const { prevDate, currDate } = opts;
  const alerts = [];

  // RM_SPIKE
  for (const [id, mat] of Object.entries(db.materials)) {
    const prev = resolveUnitCost(mat, prevDate);
    const curr = resolveUnitCost(mat, currDate);
    if (prev.unitCost > 0 && curr.unitCost > 0) {
      const pct = (curr.unitCost - prev.unitCost) / prev.unitCost * 100;
      if (Math.abs(pct) >= 15) {
        alerts.push({
          type: 'RM_SPIKE', subjectId: id,
          severity: Math.abs(pct) >= 20 ? 'CRITICAL' : 'WARN',
          changePct: round(pct, 2),
          detailTh: `${mat.nameTh}: ราคาเปลี่ยน ${round(pct, 1)}%`,
        });
      }
    }
  }

  // COG_JUMP
  for (const [id, recipe] of Object.entries(db.recipes)) {
    if (recipe.kind !== 'MENU') continue;
    try {
      const prevC = costRecipe(id, db, { costingDate: prevDate });
      const currC = costRecipe(id, db, { costingDate: currDate });
      if (prevC.costPerPortion > 0) {
        const pct = (currC.costPerPortion - prevC.costPerPortion) / prevC.costPerPortion * 100;
        if (Math.abs(pct) >= 5) {
          const bridge = costBridge(prevC, currC);
          const topMat = bridge.items[0] ? db.materials[bridge.items[0].refId] : null;
          const cause = topMat ? topMat.nameTh : '';
          alerts.push({
            type: 'COG_JUMP', subjectId: id,
            severity: Math.abs(pct) >= 10 ? 'CRITICAL' : 'WARN',
            changePct: round(pct, 2),
            detailTh: `${recipe.nameTh}: ต้นทุนเปลี่ยน ${round(pct, 1)}%${cause ? ` จาก${cause}` : ''}`,
          });
        }
      }
    } catch (_) {}
  }

  // SPEC_EXPIRY
  for (const [id, mat] of Object.entries(db.materials)) {
    for (const att of (mat.attachments || [])) {
      if (att.type === 'SPEC' && att.expiryDate) {
        const daysLeft = daysBetween(currDate, att.expiryDate);
        if (daysLeft <= 30) {
          alerts.push({
            type: 'SPEC_EXPIRY', subjectId: id, attachmentId: att.id,
            severity: daysLeft <= 14 ? 'CRITICAL' : 'WARN',
            daysLeft,
            detailTh: `${mat.nameTh}: spec ครบอายุใน ${daysLeft} วัน`,
          });
        }
      }
    }
  }

  // STALE_PRICE
  for (const [id, mat] of Object.entries(db.materials)) {
    const { staleDays, basis } = resolveUnitCost(mat, currDate);
    if (basis !== 'NO_PRICE' && staleDays !== null && staleDays > 90) {
      alerts.push({
        type: 'STALE_PRICE', subjectId: id,
        severity: staleDays > 180 ? 'CRITICAL' : 'WARN',
        staleDays,
        detailTh: `${mat.nameTh}: ราคาค้างมา ${staleDays} วัน`,
      });
    }
  }

  alerts.sort((a, b) => {
    if (a.severity === 'CRITICAL' && b.severity !== 'CRITICAL') return -1;
    if (a.severity !== 'CRITICAL' && b.severity === 'CRITICAL') return 1;
    return 0;
  });

  return alerts;
}

// ─── pricing helpers ──────────────────────────────────────────────────────────
export function suggestedPrice(cost, targetPct) {
  return cost / (targetPct / 100);
}

export function prettyPrice(price, strategy = 'END_9') {
  if (strategy === 'END_9') {
    let x = Math.ceil(price);
    while (x % 10 !== 9) x++;
    return x;
  }
  if (strategy === 'ROUND_10') {
    return Math.ceil(price / 10) * 10;
  }
  return price;
}

// ─── paretoDrivers ────────────────────────────────────────────────────────────
export function paretoDrivers(costResult) {
  const total = costResult.lines.reduce((s, l) => s + l.cost, 0);
  const sorted = [...costResult.lines].sort((a, b) => b.cost - a.cost);

  let cumCost = 0;
  let prevCumPct = 0;
  return sorted.map(l => {
    cumCost += l.cost;
    const cumPct = total > 0 ? round((cumCost / total) * 100, 4) : 100;
    const inPareto = prevCumPct < 80;
    prevCumPct = cumPct;
    return { ...l, cumPct, inPareto };
  });
}

// ─── sensitivity ──────────────────────────────────────────────────────────────
export function sensitivity(costResult, shockPct) {
  return [...costResult.lines]
    .filter(l => l.cost > 0)
    .sort((a, b) => b.sharePct - a.sharePct)
    .map(l => ({ ...l, cogImpactPct: round((l.sharePct * shockPct) / 100, 6) }));
}

// ─── costProject ──────────────────────────────────────────────────────────────
export function costProject(project, db, opts) {
  const { targetCogPerSet = 0, items = [] } = project;
  let cogPerSet = 0;
  const itemResults = [];

  for (const item of items.filter(i => i.role === 'CORE')) {
    const result = costRecipe(item.recipeId, db, opts);
    const portionCost = result.costPerPortion * (item.qtyPerSet || 1);
    cogPerSet += portionCost;
    itemResults.push({ ...item, costPerPortion: result.costPerPortion, portionCost, result });
  }

  return { cogPerSet, overTarget: cogPerSet - targetCogPerSet, targetCogPerSet, items: itemResults };
}
