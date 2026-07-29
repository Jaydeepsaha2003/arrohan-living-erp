'use strict';

/**
 * One handler per workflow stage.
 *
 * Each handler receives ({ order, body, user }) and is called inside a
 * transaction, with the sequence check already done by the router. It writes
 * its own stage tables and returns an optional note for the stage history.
 *
 * A handler may return { redirectStage: 'x' } to send the order somewhere other
 * than the next stage (QC failure sends it back to Production).
 */

const { db, nextDocNo } = require('./db');
const wf = require('./workflow');
const {
  num, str, reqStr, bool, today, dateOnly, round2, http,
  resolveMaterial, postStock, orderItems,
} = require('./lib');

// ============================================================ 2 · COSTING

function costing({ order, body, user }) {
  const items = orderItems(order.id);
  const blocks = Array.isArray(body.itemCostings) ? body.itemCostings : [];
  if (!blocks.length) throw http(400, 'Add a costing block for each finished product.');

  // Every enquiry line must be costed — that is what makes the sheet complete.
  const costedIds = new Set(blocks.map((b) => Number(b.item_id)));
  const missing = items.filter((i) => !costedIds.has(i.id));
  if (missing.length) {
    throw http(400, `Costing is missing for: ${missing.map((m) => m.product).join(', ')}.`);
  }

  clearCosting(order.id);

  let totalCost = 0;
  const insIc = db.prepare(
    `INSERT INTO item_costings (order_id, item_id, product, qty, labour_cost, machine_cost, transport_cost,
                                overheads, wastage_percent, material_cost, wastage_cost, total_cost)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insBom = db.prepare(
    `INSERT INTO costing_bom (item_costing_id, order_id, material_id, material, qty, unit, rate, amount, remarks)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  for (const blk of blocks) {
    const item = items.find((i) => i.id === Number(blk.item_id));
    if (!item) throw http(400, 'A costing block refers to a product that is not on this order.');
    const bom = (Array.isArray(blk.bom) ? blk.bom : []).filter((r) => str(r.material));
    if (!bom.length) throw http(400, `Add at least one raw material to the BOM for "${item.product}".`);

    let materialCost = 0;
    const rows = bom.map((r) => {
      const qty = num(r.qty);
      const rate = num(r.rate);
      if (qty <= 0) throw http(400, `Enter a quantity for "${str(r.material)}" in ${item.product}.`);
      const amount = round2(qty * rate);
      materialCost += amount;
      return { r, qty, rate, amount };
    });
    materialCost = round2(materialCost);

    const wastagePercent = num(blk.wastage_percent, 5);
    const wastageCost = round2((materialCost * wastagePercent) / 100);
    const labour = num(blk.labour_cost);
    const machine = num(blk.machine_cost);
    const transport = num(blk.transport_cost);
    const overheads = num(blk.overheads);
    const itemTotal = round2(materialCost + wastageCost + labour + machine + transport + overheads);
    totalCost += itemTotal;

    const icId = insIc.run(
      order.id, item.id, item.product, num(item.qty, 1),
      labour, machine, transport, overheads, wastagePercent,
      materialCost, wastageCost, itemTotal
    ).lastInsertRowid;

    for (const { r, qty, rate, amount } of rows) {
      // Link to the material master so the store issue and stock ledger line up later.
      const mat = resolveMaterial({ material_id: r.material_id, material: r.material, unit: r.unit, rate });
      insBom.run(icId, order.id, mat ? mat.id : null, str(r.material), qty, str(r.unit) || 'nos', rate, amount, str(r.remarks));
    }
  }

  totalCost = round2(totalCost);
  db.prepare(
    `INSERT INTO costings (order_id, production_days, costed_by, costed_at, total_cost, notes, completed_at, completed_by)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'), ?)
     ON CONFLICT(order_id) DO UPDATE SET
       production_days = excluded.production_days, costed_by = excluded.costed_by,
       costed_at = excluded.costed_at, total_cost = excluded.total_cost,
       notes = excluded.notes, completed_at = excluded.completed_at, completed_by = excluded.completed_by`
  ).run(
    order.id, num(body.production_days, 10) || 10, str(body.costed_by) || user.full_name,
    dateOnly(body.costed_at) || today(), totalCost, str(body.notes), user.id
  );

  return { note: `Total factory cost ₹${totalCost.toLocaleString('en-IN')} across ${blocks.length} product(s)` };
}

function clearCosting(orderId) {
  db.prepare('DELETE FROM costing_bom WHERE order_id = ?').run(orderId);
  db.prepare('DELETE FROM item_costings WHERE order_id = ?').run(orderId);
}

// ============================================================ 3 · PLANNING

function planning({ order, body, user }) {
  const costingRow = db.prepare('SELECT * FROM costings WHERE order_id = ?').get(order.id);
  if (!costingRow) throw http(409, 'Factory costing must be completed before sales planning.');

  const ics = db.prepare('SELECT * FROM item_costings WHERE order_id = ?').all(order.id);
  const lines = Array.isArray(body.items) ? body.items : [];
  if (!lines.length) throw http(400, 'Set a selling price for each product.');

  db.prepare('DELETE FROM planning_items WHERE order_id = ?').run(order.id);
  const ins = db.prepare(
    `INSERT INTO planning_items (order_id, item_id, product, size, qty, unit, cost_per_unit, selling_price, amount)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const items = orderItems(order.id);
  let itemsTotal = 0;
  for (const l of lines) {
    const item = items.find((i) => i.id === Number(l.item_id));
    if (!item) throw http(400, 'A planning line refers to a product that is not on this order.');
    const ic = ics.find((c) => c.item_id === item.id);
    const qty = num(item.qty, 1) || 1;
    const sellingPrice = num(l.selling_price);
    if (sellingPrice <= 0) throw http(400, `Enter a selling price for "${item.product}".`);
    const amount = round2(qty * sellingPrice);
    itemsTotal += amount;
    ins.run(order.id, item.id, item.product, item.size, qty, item.unit,
      ic ? round2(num(ic.total_cost) / qty) : 0, sellingPrice, amount);
  }
  itemsTotal = round2(itemsTotal);

  const discountPercent = num(body.discount_percent);
  const discountAmount = discountPercent > 0
    ? round2((itemsTotal * discountPercent) / 100)
    : round2(num(body.discount_amount));
  if (discountAmount > itemsTotal) throw http(400, 'The discount cannot exceed the product total.');

  const freight = num(body.freight_charges);
  const installation = num(body.installation_charges);
  const loading = num(body.loading_charges);
  const subtotal = round2(itemsTotal - discountAmount + freight + installation + loading);

  const deliveryDate = dateOnly(body.delivery_date)
    || dateOnly(new Date(Date.now() + num(costingRow.production_days, 10) * 864e5).toISOString());

  db.prepare(
    `INSERT INTO plannings (order_id, margin_percent, discount_percent, discount_amount, freight_charges,
       installation_charges, loading_charges, payment_terms, delivery_date, items_total, subtotal,
       decided_by, planned_at, notes, completed_at, completed_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)
     ON CONFLICT(order_id) DO UPDATE SET
       margin_percent = excluded.margin_percent, discount_percent = excluded.discount_percent,
       discount_amount = excluded.discount_amount, freight_charges = excluded.freight_charges,
       installation_charges = excluded.installation_charges, loading_charges = excluded.loading_charges,
       payment_terms = excluded.payment_terms, delivery_date = excluded.delivery_date,
       items_total = excluded.items_total, subtotal = excluded.subtotal, decided_by = excluded.decided_by,
       planned_at = excluded.planned_at, notes = excluded.notes,
       completed_at = excluded.completed_at, completed_by = excluded.completed_by`
  ).run(
    order.id, num(body.margin_percent, 20), discountPercent, discountAmount, freight, installation, loading,
    str(body.payment_terms) || '50% advance, 50% before dispatch', deliveryDate, itemsTotal, subtotal,
    str(body.decided_by) || user.full_name, dateOnly(body.planned_at) || today(), str(body.notes), user.id
  );

  const margin = round2(itemsTotal - num(costingRow.total_cost));
  const marginPct = num(costingRow.total_cost) > 0 ? round2((margin / num(costingRow.total_cost)) * 100) : 0;
  return { note: `Subtotal ₹${subtotal.toLocaleString('en-IN')} · margin ₹${margin.toLocaleString('en-IN')} (${marginPct}%)` };
}

// ============================================================ 4 · QUOTATION

function quotation({ order, body, user }) {
  const plan = db.prepare('SELECT * FROM plannings WHERE order_id = ?').get(order.id);
  if (!plan) throw http(409, 'Sales planning must be completed before the quotation.');

  const existing = db.prepare('SELECT * FROM quotations WHERE order_id = ?').get(order.id);
  const quotationNo = existing ? existing.quotation_no : nextDocNo('QT');
  const gstRate = num(body.gst_rate, 18);
  const subtotal = round2(num(plan.subtotal));
  const gstAmount = round2((subtotal * gstRate) / 100);
  const grandTotal = round2(subtotal + gstAmount);

  db.prepare(
    `INSERT INTO quotations (order_id, quotation_no, quotation_date, valid_till, warranty, terms,
       gst_rate, subtotal, gst_amount, grand_total, revision, completed_at, completed_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)
     ON CONFLICT(order_id) DO UPDATE SET
       quotation_date = excluded.quotation_date, valid_till = excluded.valid_till,
       warranty = excluded.warranty, terms = excluded.terms, gst_rate = excluded.gst_rate,
       subtotal = excluded.subtotal, gst_amount = excluded.gst_amount, grand_total = excluded.grand_total,
       revision = quotations.revision + 1, completed_at = excluded.completed_at, completed_by = excluded.completed_by`
  ).run(
    order.id, quotationNo, dateOnly(body.quotation_date) || today(),
    dateOnly(body.valid_till) || dateOnly(new Date(Date.now() + 15 * 864e5).toISOString()),
    str(body.warranty), str(body.terms), gstRate, subtotal, gstAmount, grandTotal,
    existing ? existing.revision : 0, user.id
  );

  return { note: `${quotationNo} · ₹${grandTotal.toLocaleString('en-IN')} incl. ${gstRate}% GST` };
}

// ============================================================ 5 · APPROVAL

function approval({ order, body, user }) {
  const q = db.prepare('SELECT * FROM quotations WHERE order_id = ?').get(order.id);
  if (!q) throw http(409, 'A quotation must exist before recording the customer decision.');

  const status = str(body.status);
  if (status !== 'approved' && status !== 'rejected') {
    throw http(400, 'Record the decision as either approved or rejected.');
  }

  let rejectReason = null;
  let rejectNote = str(body.reject_note);
  if (status === 'rejected') {
    rejectReason = reqStr(body.reject_reason, 'Reason for rejection');
    if (!wf.LOST_REASONS.includes(rejectReason)) throw http(400, 'Choose one of the listed rejection reasons.');
    if (rejectReason === 'Others' && !rejectNote) throw http(400, 'Describe the reason when choosing "Others".');
  }

  db.prepare(
    `INSERT INTO approvals (order_id, status, decided_at, decided_by_name, reject_reason, reject_note, notes, completed_at, completed_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)
     ON CONFLICT(order_id) DO UPDATE SET
       status = excluded.status, decided_at = excluded.decided_at, decided_by_name = excluded.decided_by_name,
       reject_reason = excluded.reject_reason, reject_note = excluded.reject_note, notes = excluded.notes,
       completed_at = excluded.completed_at, completed_by = excluded.completed_by`
  ).run(
    order.id, status, dateOnly(body.decided_at) || today(), str(body.decided_by_name),
    rejectReason, rejectNote, str(body.notes), user.id
  );

  if (status === 'rejected') {
    // Archive the whole thread for reporting: order lost, enquiry lost with the same reason.
    db.prepare(`UPDATE orders SET current_stage = 'lost', status = 'lost', closed_at = datetime('now') WHERE id = ?`).run(order.id);
    db.prepare(
      `UPDATE enquiries SET status = 'lost', lost_reason = ?, lost_reason_note = ?, closed_at = datetime('now') WHERE id = ?`
    ).run(rejectReason, rejectNote, order.enquiry_id);
    return {
      terminal: 'lost',
      action: 'rejected',
      note: `Quotation rejected — ${rejectReason}${rejectNote ? ': ' + rejectNote : ''}`,
    };
  }

  return { note: 'Customer approved the quotation' };
}

// ============================================================ 6 · SALES ORDER

function salesOrder({ order, body, user }) {
  const q = db.prepare('SELECT * FROM quotations WHERE order_id = ?').get(order.id);
  const plan = db.prepare('SELECT * FROM plannings WHERE order_id = ?').get(order.id);
  const appr = db.prepare('SELECT * FROM approvals WHERE order_id = ?').get(order.id);
  if (!q || !plan) throw http(409, 'The quotation must be complete before the sales order.');
  if (!appr || appr.status !== 'approved') throw http(409, 'The customer must approve the quotation first.');

  // The doc is explicit: the sales order needs the customer's final approval/signature.
  if (!bool(body.customer_signed)) {
    throw http(400, 'Confirm the customer signature — the sales order cannot be raised without it.');
  }

  const existing = db.prepare('SELECT * FROM sales_orders WHERE order_id = ?').get(order.id);
  const soNo = existing ? existing.so_no : nextDocNo('SO');

  db.prepare(
    `INSERT INTO sales_orders (order_id, so_no, so_date, quotation_no, locked_total, locked_terms,
       customer_signed, signed_date, po_number, po_date, notes, completed_at, completed_by)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, datetime('now'), ?)
     ON CONFLICT(order_id) DO UPDATE SET
       so_date = excluded.so_date, locked_total = excluded.locked_total, locked_terms = excluded.locked_terms,
       customer_signed = 1, signed_date = excluded.signed_date, po_number = excluded.po_number,
       po_date = excluded.po_date, notes = excluded.notes,
       completed_at = excluded.completed_at, completed_by = excluded.completed_by`
  ).run(
    order.id, soNo, dateOnly(body.so_date) || today(), q.quotation_no,
    round2(num(q.grand_total)), plan.payment_terms,
    dateOnly(body.signed_date) || today(), str(body.po_number), dateOnly(body.po_date),
    str(body.notes), user.id
  );

  return { note: `${soNo} confirmed · ₹${round2(num(q.grand_total)).toLocaleString('en-IN')}` };
}

// ============================================================ 7 · ADVANCE

function advance({ order, body, user }) {
  const so = db.prepare('SELECT * FROM sales_orders WHERE order_id = ?').get(order.id);
  if (!so) throw http(409, 'A confirmed sales order is required before recording an advance.');

  const amount = num(body.amount);
  const total = round2(num(so.locked_total));
  if (amount < 0) throw http(400, 'The advance cannot be negative.');
  if (amount > total) throw http(400, `The advance cannot exceed the order value of ₹${total.toLocaleString('en-IN')}.`);

  // Replace any earlier advance receipt for this order so the ledger stays clean.
  db.prepare(`DELETE FROM payments WHERE order_id = ? AND kind = 'advance'`).run(order.id);

  let paymentId = null;
  let receiptNo = null;
  if (amount > 0) {
    receiptNo = nextDocNo('RCP');
    paymentId = db
      .prepare(
        `INSERT INTO payments (order_id, kind, receipt_no, amount, received_at, mode, reference, remarks, created_by)
         VALUES (?, 'advance', ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        order.id, receiptNo, round2(amount), dateOnly(body.received_at) || today(),
        str(body.mode) || 'Bank transfer', str(body.reference), str(body.remarks), user.id
      ).lastInsertRowid;
  }

  db.prepare(
    `INSERT INTO advances (order_id, payment_id, amount, balance, released_to_production, completed_at, completed_by)
     VALUES (?, ?, ?, ?, ?, datetime('now'), ?)
     ON CONFLICT(order_id) DO UPDATE SET
       payment_id = excluded.payment_id, amount = excluded.amount, balance = excluded.balance,
       released_to_production = excluded.released_to_production,
       completed_at = excluded.completed_at, completed_by = excluded.completed_by`
  ).run(order.id, paymentId, round2(amount), round2(total - amount), bool(body.released_to_production ?? 1), user.id);

  return {
    note: amount > 0
      ? `Advance ₹${round2(amount).toLocaleString('en-IN')} received (${receiptNo}) · balance ₹${round2(total - amount).toLocaleString('en-IN')}`
      : 'No advance taken — released to production',
  };
}

// ---------------------------------------------------- stock reversal helpers

/**
 * Undo the stock effect of a previous material issue for this order.
 * Called before re-issuing so a repeated submission can never double-deduct.
 */
function reverseStoreIssue(order, user, why) {
  for (const l of db.prepare('SELECT * FROM store_issue_lines WHERE order_id = ?').all(order.id)) {
    if (l.material_id && num(l.qty_issued) > 0) {
      postStock({
        material_id: l.material_id, qty: num(l.qty_issued), unit: l.unit, rate: l.rate,
        txn_type: 'return', ref_table: 'store_issues', ref_id: order.id, order_no: order.order_no,
        remarks: why || 'Reversed — material issue re-recorded', user_id: user.id,
      });
    }
  }
}

/**
 * Undo the stock effect of a previous production entry: the issued-vs-used
 * difference, the wastage, and any extra material. Keeps the rework loop
 * (QC fail -> production again) from deducting the same material twice.
 */
function reverseProductionStock(order, user, why) {
  const reason = why || 'Reversed — production re-recorded';
  for (const c of db.prepare('SELECT * FROM production_consumption WHERE order_id = ?').all(order.id)) {
    const diff = round2(num(c.qty_issued) - num(c.qty_used));
    if (diff !== 0 && c.material_id) {
      postStock({
        material_id: c.material_id, qty: -diff, unit: c.unit, rate: 0,
        txn_type: 'adjust', ref_table: 'productions', ref_id: order.id, order_no: order.order_no,
        remarks: reason, user_id: user.id,
      });
    }
  }
  for (const w of db.prepare('SELECT * FROM production_wastage WHERE order_id = ?').all(order.id)) {
    if (w.material_id && num(w.qty) > 0) {
      postStock({
        material_id: w.material_id, qty: num(w.qty), unit: w.unit, rate: w.rate,
        txn_type: 'adjust', ref_table: 'productions', ref_id: order.id, order_no: order.order_no,
        remarks: `${reason} (wastage)`, user_id: user.id,
      });
    }
  }
  for (const x of db.prepare('SELECT * FROM additional_materials WHERE order_id = ?').all(order.id)) {
    if (x.material_id && num(x.qty) > 0) {
      postStock({
        material_id: x.material_id, qty: num(x.qty), unit: x.unit, rate: 0,
        txn_type: 'adjust', ref_table: 'additional_materials', ref_id: order.id, order_no: order.order_no,
        remarks: `${reason} (extra material)`, user_id: user.id,
      });
    }
  }
}

// ============================================================ 8 · STORE ISSUE

function store({ order, body, user }) {
  const costingRow = db.prepare('SELECT * FROM costings WHERE order_id = ?').get(order.id);
  if (!costingRow) throw http(409, 'The approved costing sheet is required before issuing material.');

  // Re-issuing? Put the previous issue back first so stock cannot drift.
  reverseStoreIssue(order, user);

  const bom = db
    .prepare(
      `SELECT b.*, ic.product FROM costing_bom b
       JOIN item_costings ic ON ic.id = b.item_costing_id
       WHERE b.order_id = ? ORDER BY ic.id, b.id`
    )
    .all(order.id);
  if (!bom.length) throw http(409, 'The costing sheet has no BOM lines to issue.');

  const overrides = {};
  if (Array.isArray(body.lines)) {
    for (const l of body.lines) overrides[Number(l.bom_id)] = l;
  }

  db.prepare('DELETE FROM store_issue_lines WHERE order_id = ?').run(order.id);

  const issueNo = nextDocNo('MI');
  const insLine = db.prepare(
    `INSERT INTO store_issue_lines (order_id, bom_id, material_id, product, material, qty_planned, qty_issued, unit, rate, remarks)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  let issuedCount = 0;
  const shortages = [];
  for (const line of bom) {
    const o = overrides[line.id] || {};
    const qtyIssued = o.qty_issued !== undefined ? num(o.qty_issued) : num(line.qty);
    const mat = resolveMaterial({ material_id: line.material_id, material: line.material, unit: line.unit, rate: line.rate });
    insLine.run(
      order.id, line.id, mat ? mat.id : null, line.product, line.material,
      num(line.qty), qtyIssued, str(line.unit) || 'nos', num(line.rate), str(o.remarks)
    );
    if (qtyIssued > 0 && mat) {
      if (num(mat.qty_in_stock) < qtyIssued) {
        shortages.push(`${mat.name} (have ${round2(mat.qty_in_stock)} ${mat.unit}, need ${qtyIssued})`);
      }
      postStock({
        material_id: mat.id, qty: -qtyIssued, unit: line.unit, rate: line.rate,
        txn_type: 'issue', ref_table: 'store_issues', ref_id: order.id,
        order_no: order.order_no, remarks: `Issued to production · ${issueNo}`, user_id: user.id,
      });
      issuedCount += 1;
    }
  }

  if (shortages.length && !bool(body.allow_negative_stock)) {
    throw http(409, `Not enough stock for: ${shortages.join('; ')}. Raise a purchase order, or tick "issue anyway" to record a negative balance.`);
  }

  db.prepare(
    `INSERT INTO store_issues (order_id, issue_no, issue_date, issued_by, received_by, remarks, completed_at, completed_by)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'), ?)
     ON CONFLICT(order_id) DO UPDATE SET
       issue_date = excluded.issue_date, issued_by = excluded.issued_by, received_by = excluded.received_by,
       remarks = excluded.remarks, completed_at = excluded.completed_at, completed_by = excluded.completed_by`
  ).run(
    order.id, issueNo, dateOnly(body.issue_date) || today(),
    str(body.issued_by) || user.full_name, str(body.received_by), str(body.remarks), user.id
  );

  return {
    note: `${issueNo} · ${issuedCount} material line(s) issued to production${shortages.length ? ' (stock went negative)' : ''}`,
  };
}

// ============================================================ 9 · PRODUCTION

function production({ order, body, user }) {
  const issue = db.prepare('SELECT * FROM store_issues WHERE order_id = ?').get(order.id);
  if (!issue) throw http(409, 'Store must issue the material before production can be recorded.');

  // A QC failure sends the order back here, so this handler can run more than
  // once. Undo the previous run's stock effect before applying the new numbers.
  reverseProductionStock(order, user, 'Reversed — production re-recorded after QC rework');

  const issued = db.prepare('SELECT * FROM store_issue_lines WHERE order_id = ?').all(order.id);

  db.prepare('DELETE FROM production_consumption WHERE order_id = ?').run(order.id);
  const insCons = db.prepare(
    `INSERT INTO production_consumption (order_id, material_id, product, material, qty_issued, qty_used, unit, remarks)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );

  // Actual consumption. Stock already moved out at issue time, so only the
  // difference between issued and used is posted back (returns) or out (extra).
  const consLines = Array.isArray(body.consumption) ? body.consumption : [];
  for (const line of issued) {
    const c = consLines.find((x) => Number(x.line_id) === line.id) || {};
    const qtyUsed = c.qty_used !== undefined ? num(c.qty_used) : num(line.qty_issued);
    if (qtyUsed < 0) throw http(400, `Consumed quantity for "${line.material}" cannot be negative.`);
    insCons.run(order.id, line.material_id, line.product, line.material, num(line.qty_issued), qtyUsed, line.unit, str(c.remarks));

    const diff = round2(num(line.qty_issued) - qtyUsed);
    if (diff !== 0 && line.material_id) {
      postStock({
        material_id: line.material_id,
        qty: diff, // positive = unused material returned to store
        unit: line.unit, rate: line.rate,
        txn_type: diff > 0 ? 'return' : 'consume',
        ref_table: 'productions', ref_id: order.id, order_no: order.order_no,
        remarks: diff > 0 ? 'Unused material returned to store' : 'Extra consumption beyond issue',
        user_id: user.id,
      });
    }
  }

  // Scrap / wastage — a real stock loss, recorded separately for the wastage report.
  db.prepare('DELETE FROM production_wastage WHERE order_id = ?').run(order.id);
  const insWaste = db.prepare(
    `INSERT INTO production_wastage (order_id, material_id, material, qty, unit, rate, value, reason)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const wastage = (Array.isArray(body.wastage) ? body.wastage : []).filter((w) => str(w.material) && num(w.qty) > 0);
  for (const w of wastage) {
    const mat = resolveMaterial({ material_id: w.material_id, material: w.material, unit: w.unit, rate: w.rate });
    const qty = num(w.qty);
    const rate = num(w.rate) || (mat ? num(mat.standard_rate) : 0);
    insWaste.run(order.id, mat ? mat.id : null, str(w.material), qty, str(w.unit) || 'nos', rate, round2(qty * rate), str(w.reason));
    if (mat) {
      postStock({
        material_id: mat.id, qty: -qty, unit: w.unit, rate,
        txn_type: 'wastage', ref_table: 'productions', ref_id: order.id, order_no: order.order_no,
        remarks: `Scrap / wastage${w.reason ? ' · ' + str(w.reason) : ''}`, user_id: user.id,
      });
    }
  }

  // Additional material request — issued straight away and deducted from stock.
  db.prepare('DELETE FROM additional_materials WHERE order_id = ?').run(order.id);
  const needsAdditional = bool(body.needs_additional);
  const extras = needsAdditional
    ? (Array.isArray(body.additional_materials) ? body.additional_materials : []).filter((x) => str(x.material) && num(x.qty) > 0)
    : [];
  const insExtra = db.prepare(
    `INSERT INTO additional_materials (order_id, material_id, material, qty, unit, reason, status, issued_at)
     VALUES (?, ?, ?, ?, ?, ?, 'issued', datetime('now'))`
  );
  for (const x of extras) {
    const mat = resolveMaterial({ material_id: x.material_id, material: x.material, unit: x.unit });
    const qty = num(x.qty);
    insExtra.run(order.id, mat ? mat.id : null, str(x.material), qty, str(x.unit) || 'nos', str(x.reason));
    if (mat) {
      postStock({
        material_id: mat.id, qty: -qty, unit: x.unit, rate: num(mat.standard_rate),
        txn_type: 'consume', ref_table: 'additional_materials', ref_id: order.id, order_no: order.order_no,
        remarks: `Additional material for production${x.reason ? ' · ' + str(x.reason) : ''}`, user_id: user.id,
      });
    }
  }

  const startDate = dateOnly(body.start_date) || today();
  const endDate = dateOnly(body.end_date) || today();
  if (endDate < startDate) throw http(400, 'The completion date cannot be before the start date.');

  db.prepare(
    `INSERT INTO productions (order_id, start_date, started_by, expected_end_date, end_date, produced_by,
       supervisor, needs_additional, notes, started_at, completed_at, completed_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), ?)
     ON CONFLICT(order_id) DO UPDATE SET
       start_date = excluded.start_date, started_by = excluded.started_by,
       expected_end_date = excluded.expected_end_date, end_date = excluded.end_date,
       produced_by = excluded.produced_by, supervisor = excluded.supervisor,
       needs_additional = excluded.needs_additional, notes = excluded.notes,
       completed_at = excluded.completed_at, completed_by = excluded.completed_by`
  ).run(
    order.id, startDate, str(body.started_by) || user.full_name,
    dateOnly(body.expected_end_date), endDate, str(body.produced_by) || user.full_name,
    str(body.supervisor), needsAdditional, str(body.notes), user.id
  );

  // Produced goods enter finished-goods inventory awaiting dispatch.
  db.prepare('DELETE FROM finished_goods WHERE order_id = ?').run(order.id);
  const insFg = db.prepare(
    `INSERT INTO finished_goods (order_id, item_id, product, qty, status, produced_at)
     VALUES (?, ?, ?, ?, 'in_stock', ?)`
  );
  for (const item of orderItems(order.id)) insFg.run(order.id, item.id, item.product, num(item.qty, 1), endDate);

  const parts = [`Produced ${startDate} → ${endDate}`];
  if (wastage.length) parts.push(`${wastage.length} wastage entry(s)`);
  if (extras.length) parts.push(`${extras.length} extra material(s)`);
  return { note: parts.join(' · ') };
}

// ============================================================ 10 · QC

function qc({ order, body, user }) {
  const prod = db.prepare('SELECT * FROM productions WHERE order_id = ?').get(order.id);
  if (!prod) throw http(409, 'Production must be completed before quality inspection.');

  const result = str(body.result) === 'fail' ? 'fail' : 'pass';
  const previous = db.prepare('SELECT * FROM qc_checks WHERE order_id = ?').get(order.id);
  const attempt = previous ? num(previous.attempt) + 1 : 1;
  const qcNo = previous && previous.qc_no ? previous.qc_no : nextDocNo('QC');

  if (result === 'fail' && !str(body.rework_note)) {
    throw http(400, 'Describe what failed so production knows what to rework.');
  }

  db.prepare(
    `INSERT INTO qc_checks (order_id, qc_no, qc_date, qc_by, result, rework_note, notes, attempt, completed_at, completed_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)
     ON CONFLICT(order_id) DO UPDATE SET
       qc_date = excluded.qc_date, qc_by = excluded.qc_by, result = excluded.result,
       rework_note = excluded.rework_note, notes = excluded.notes, attempt = excluded.attempt,
       completed_at = excluded.completed_at, completed_by = excluded.completed_by`
  ).run(
    order.id, qcNo, dateOnly(body.qc_date) || today(), str(body.qc_by) || user.full_name,
    result, str(body.rework_note), str(body.notes), attempt, user.id
  );

  db.prepare('DELETE FROM qc_items WHERE order_id = ?').run(order.id);
  const insItem = db.prepare(
    `INSERT INTO qc_items (order_id, item_id, product, qty, qty_passed, qty_failed, finish_ok, dimension_ok, hardware_ok, remarks)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const items = orderItems(order.id);
  const checks = Array.isArray(body.items) ? body.items : [];
  for (const item of items) {
    const c = checks.find((x) => Number(x.item_id) === item.id) || {};
    const qty = num(item.qty, 1);
    const failed = num(c.qty_failed);
    insItem.run(
      order.id, item.id, item.product, qty,
      c.qty_passed !== undefined ? num(c.qty_passed) : round2(qty - failed), failed,
      c.finish_ok === undefined ? 1 : bool(c.finish_ok),
      c.dimension_ok === undefined ? 1 : bool(c.dimension_ok),
      c.hardware_ok === undefined ? 1 : bool(c.hardware_ok),
      str(c.remarks)
    );
  }

  if (result === 'fail') {
    // Straight back to production for rework; packaging stays locked.
    return {
      redirectStage: 'production',
      action: 'rejected',
      note: `QC attempt ${attempt} FAILED — returned to production: ${str(body.rework_note)}`,
    };
  }
  return { note: `QC passed on attempt ${attempt} by ${str(body.qc_by) || user.full_name}` };
}

// ============================================================ 11 · PACKING

function packing({ order, body, user }) {
  const check = db.prepare('SELECT * FROM qc_checks WHERE order_id = ?').get(order.id);
  if (!check || check.result !== 'pass') throw http(409, 'Packing can only start after QC approval.');

  if (!bool(body.ready_for_dispatch)) {
    throw http(400, 'Confirm the goods are packed and ready for dispatch.');
  }

  const existing = db.prepare('SELECT * FROM packings WHERE order_id = ?').get(order.id);
  const packingNo = existing && existing.packing_no ? existing.packing_no : nextDocNo('PKG');

  const boxes = (Array.isArray(body.boxes) ? body.boxes : []).filter((b) => str(b.contents) || str(b.box_no));
  db.prepare('DELETE FROM packing_lines WHERE order_id = ?').run(order.id);
  const insBox = db.prepare(
    `INSERT INTO packing_lines (order_id, box_no, contents, qty, weight, dimensions) VALUES (?, ?, ?, ?, ?, ?)`
  );
  let grossWeight = 0;
  boxes.forEach((b, i) => {
    grossWeight += num(b.weight);
    insBox.run(order.id, str(b.box_no) || `BOX-${i + 1}`, str(b.contents), num(b.qty), num(b.weight), str(b.dimensions));
  });

  const totalBoxes = boxes.length || num(body.total_boxes);
  db.prepare(
    `INSERT INTO packings (order_id, packing_no, packing_date, packed_by, total_boxes, gross_weight,
       packing_material, ready_for_dispatch, notes, completed_at, completed_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, datetime('now'), ?)
     ON CONFLICT(order_id) DO UPDATE SET
       packing_date = excluded.packing_date, packed_by = excluded.packed_by,
       total_boxes = excluded.total_boxes, gross_weight = excluded.gross_weight,
       packing_material = excluded.packing_material, ready_for_dispatch = 1, notes = excluded.notes,
       completed_at = excluded.completed_at, completed_by = excluded.completed_by`
  ).run(
    order.id, packingNo, dateOnly(body.packing_date) || today(), str(body.packed_by) || user.full_name,
    totalBoxes, round2(grossWeight || num(body.gross_weight)), str(body.packing_material), str(body.notes), user.id
  );

  return { note: `${packingNo} · ${totalBoxes} box(es) packed — ready for dispatch` };
}

// ============================================================ 12 · DISPATCH

function dispatch({ order, body, user }) {
  const pack = db.prepare('SELECT * FROM packings WHERE order_id = ?').get(order.id);
  if (!pack || !pack.ready_for_dispatch) throw http(409, 'The order must be packed and marked ready before dispatch.');

  const existing = db.prepare('SELECT * FROM dispatches WHERE order_id = ?').get(order.id);
  const challanNo = existing ? existing.challan_no : nextDocNo('DC');

  db.prepare(
    `INSERT INTO dispatches (order_id, challan_no, dispatch_date, transporter, vehicle_no, driver_name,
       driver_phone, lr_no, freight_amount, delivery_address, eway_bill_no, boxes, notes, completed_at, completed_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)
     ON CONFLICT(order_id) DO UPDATE SET
       dispatch_date = excluded.dispatch_date, transporter = excluded.transporter,
       vehicle_no = excluded.vehicle_no, driver_name = excluded.driver_name,
       driver_phone = excluded.driver_phone, lr_no = excluded.lr_no,
       freight_amount = excluded.freight_amount, delivery_address = excluded.delivery_address,
       eway_bill_no = excluded.eway_bill_no, boxes = excluded.boxes, notes = excluded.notes,
       completed_at = excluded.completed_at, completed_by = excluded.completed_by`
  ).run(
    order.id, challanNo, dateOnly(body.dispatch_date) || today(), str(body.transporter),
    str(body.vehicle_no), str(body.driver_name), str(body.driver_phone), str(body.lr_no),
    num(body.freight_amount), str(body.delivery_address) || order.cust_address,
    str(body.eway_bill_no), num(body.boxes) || num(pack.total_boxes), str(body.notes), user.id
  );

  // Finished goods leave the factory.
  db.prepare(
    `UPDATE finished_goods SET status = 'dispatched', dispatched_at = ? WHERE order_id = ?`
  ).run(dateOnly(body.dispatch_date) || today(), order.id);

  return { note: `${challanNo} dispatched${str(body.vehicle_no) ? ' · vehicle ' + str(body.vehicle_no) : ''}` };
}

// ============================================================ 13 · INVOICE

function invoice({ order, body, user }) {
  const disp = db.prepare('SELECT * FROM dispatches WHERE order_id = ?').get(order.id);
  if (!disp) throw http(409, 'Dispatch details must be recorded before invoicing.');
  const q = db.prepare('SELECT * FROM quotations WHERE order_id = ?').get(order.id);

  const existing = db.prepare('SELECT * FROM invoices WHERE order_id = ?').get(order.id);
  const invoiceNo = existing ? existing.invoice_no : nextDocNo('INV');
  const dnNo = existing && existing.delivery_note_no ? existing.delivery_note_no : nextDocNo('DN');

  const taxable = body.taxable_amount !== undefined ? num(body.taxable_amount) : round2(num(q ? q.subtotal : 0));
  if (taxable <= 0) throw http(400, 'Enter the taxable invoice amount.');
  const gstRate = body.gst_rate !== undefined ? num(body.gst_rate) : num(q ? q.gst_rate : 18);
  const gstAmount = round2((taxable * gstRate) / 100);
  const grandTotal = round2(taxable + gstAmount);

  db.prepare(
    `INSERT INTO invoices (order_id, invoice_no, invoice_date, delivery_note_no, taxable_amount, gst_rate,
       gst_amount, grand_total, place_of_supply, irn, notes, completed_at, completed_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)
     ON CONFLICT(order_id) DO UPDATE SET
       invoice_date = excluded.invoice_date, taxable_amount = excluded.taxable_amount,
       gst_rate = excluded.gst_rate, gst_amount = excluded.gst_amount, grand_total = excluded.grand_total,
       place_of_supply = excluded.place_of_supply, irn = excluded.irn, notes = excluded.notes,
       completed_at = excluded.completed_at, completed_by = excluded.completed_by`
  ).run(
    order.id, invoiceNo, dateOnly(body.invoice_date) || today(), dnNo, taxable, gstRate,
    gstAmount, grandTotal, str(body.place_of_supply) || order.cust_state, str(body.irn), str(body.notes), user.id
  );

  return { note: `${invoiceNo} raised · ₹${grandTotal.toLocaleString('en-IN')} (DN ${dnNo})` };
}

// ============================================================ 14 · FINAL PAYMENT

function payment({ order, body, user }) {
  const inv = db.prepare('SELECT * FROM invoices WHERE order_id = ?').get(order.id);
  if (!inv) throw http(409, 'The sales invoice must be raised before collecting the balance.');

  const alreadyPaid = round2(
    num(db.prepare(`SELECT COALESCE(SUM(amount),0) s FROM payments WHERE order_id = ? AND kind <> 'final'`).get(order.id).s)
  );
  const billed = round2(num(inv.grand_total));
  const amount = body.balance_amount !== undefined ? num(body.balance_amount) : round2(billed - alreadyPaid);
  if (amount < 0) throw http(400, 'The balance received cannot be negative.');
  if (round2(alreadyPaid + amount) > billed + 0.01) {
    throw http(400, `Total receipts would exceed the invoice of ₹${billed.toLocaleString('en-IN')}.`);
  }

  db.prepare(`DELETE FROM payments WHERE order_id = ? AND kind = 'final'`).run(order.id);
  let paymentId = null;
  let receiptNo = null;
  if (amount > 0) {
    receiptNo = nextDocNo('RCP');
    paymentId = db
      .prepare(
        `INSERT INTO payments (order_id, kind, receipt_no, amount, received_at, mode, reference, remarks, created_by)
         VALUES (?, 'final', ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        order.id, receiptNo, round2(amount), dateOnly(body.received_at) || today(),
        str(body.mode) || 'Bank transfer', str(body.reference), str(body.remarks), user.id
      ).lastInsertRowid;
  }

  const outstanding = round2(billed - alreadyPaid - amount);
  db.prepare(
    `INSERT INTO final_payments (order_id, payment_id, balance_amount, received_at, delivered_date, outstanding, completed_at, completed_by)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'), ?)
     ON CONFLICT(order_id) DO UPDATE SET
       payment_id = excluded.payment_id, balance_amount = excluded.balance_amount,
       received_at = excluded.received_at, delivered_date = excluded.delivered_date,
       outstanding = excluded.outstanding, completed_at = excluded.completed_at, completed_by = excluded.completed_by`
  ).run(
    order.id, paymentId, round2(amount), dateOnly(body.received_at) || today(),
    dateOnly(body.delivered_date) || today(), outstanding, user.id
  );

  return {
    note: outstanding > 0.01
      ? `Balance ₹${round2(amount).toLocaleString('en-IN')} received · ₹${outstanding.toLocaleString('en-IN')} still outstanding`
      : `Balance ₹${round2(amount).toLocaleString('en-IN')} received · fully settled`,
  };
}

// ============================================================ 15 · GATE PASS

function gatepass({ order, body, user }) {
  const fin = db.prepare('SELECT * FROM final_payments WHERE order_id = ?').get(order.id);
  if (!fin) throw http(409, 'The final payment step must be completed before the gate pass.');
  const disp = db.prepare('SELECT * FROM dispatches WHERE order_id = ?').get(order.id);

  const existing = db.prepare('SELECT * FROM gate_passes WHERE order_id = ?').get(order.id);
  const gpNo = existing ? existing.gate_pass_no : nextDocNo('GP');

  db.prepare(
    `INSERT INTO gate_passes (order_id, gate_pass_no, gate_pass_date, gate_pass_time, vehicle_no,
       driver_name, security_by, boxes, remarks, completed_at, completed_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)
     ON CONFLICT(order_id) DO UPDATE SET
       gate_pass_date = excluded.gate_pass_date, gate_pass_time = excluded.gate_pass_time,
       vehicle_no = excluded.vehicle_no, driver_name = excluded.driver_name,
       security_by = excluded.security_by, boxes = excluded.boxes, remarks = excluded.remarks,
       completed_at = excluded.completed_at, completed_by = excluded.completed_by`
  ).run(
    order.id, gpNo, dateOnly(body.gate_pass_date) || today(),
    str(body.gate_pass_time) || new Date().toTimeString().slice(0, 5),
    str(body.vehicle_no) || (disp ? disp.vehicle_no : null),
    str(body.driver_name) || (disp ? disp.driver_name : null),
    str(body.security_by) || user.full_name,
    num(body.boxes) || (disp ? num(disp.boxes) : 0), str(body.remarks), user.id
  );

  return { note: `${gpNo} issued — order complete`, terminal: 'closed' };
}

const HANDLERS = {
  costing, planning, quotation, approval, salesOrder, advance, store,
  production, qc, packing, dispatch, invoice, payment, gatepass,
};

module.exports = { HANDLERS, clearCosting, reverseStoreIssue, reverseProductionStock };
