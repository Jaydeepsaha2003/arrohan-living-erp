'use strict';

/**
 * End-to-end workflow test.
 *
 * Drives one order from enquiry to gate pass using a different department login
 * at every stage, and checks that the sequence and role rules actually hold.
 *
 *   node scripts/smoke.js            (starts its own server on port 4199)
 *   BASE=http://localhost:4180 node scripts/smoke.js   (test a running server)
 */

const path = require('path');
const os = require('os');
const fs = require('fs');

const PORT = Number(process.env.SMOKE_PORT) || 4199;
const BASE = process.env.BASE || `http://localhost:${PORT}`;
const ownServer = !process.env.BASE;

let pass = 0;
let fail = 0;
const failures = [];

function ok(label, condition, detail) {
  if (condition) {
    pass += 1;
    console.log(`  ✓ ${label}`);
  } else {
    fail += 1;
    failures.push(label + (detail ? ` — ${detail}` : ''));
    console.log(`  ✗ ${label}${detail ? ' — ' + detail : ''}`);
  }
}

function section(title) {
  console.log(`\n${title}`);
  console.log('-'.repeat(title.length));
}

/** Minimal cookie-jar client, one instance per logged-in user. */
function client() {
  let cookie = null;
  return async function call(method, url, body) {
    const res = await fetch(BASE + url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const setCookie = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
    for (const c of setCookie) {
      if (c.startsWith('arrohan_sid=')) cookie = c.split(';')[0];
    }
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 200) }; }
    return { status: res.status, body: json };
  };
}

// The test server is seeded with one known password (see the bottom of this file).
const TEST_PW = 'smoke-test-only-pw';

async function login(username, password = TEST_PW) {
  const call = client();
  const r = await call('POST', '/api/auth/login', { username, password });
  if (r.status !== 200) throw new Error(`login failed for ${username}: ${r.status} ${JSON.stringify(r.body)}`);
  return call;
}

async function main() {
  // ---------------------------------------------------------------- sign in
  section('Authentication & roles');
  const admin = await login('admin');
  ok('admin signs in', true);

  const bad = client();
  const badRes = await bad('POST', '/api/auth/login', { username: 'admin', password: 'wrong' });
  ok('wrong password is rejected', badRes.status === 401, `got ${badRes.status}`);

  const anon = client();
  const anonRes = await anon('GET', '/api/orders');
  ok('unauthenticated request is blocked', anonRes.status === 401, `got ${anonRes.status}`);

  const sales = await login('sales');
  const costing = await login('costing');
  const store = await login('store');
  const production = await login('production');
  const qc = await login('qc');
  const packing = await login('packing');
  const dispatch = await login('dispatch');
  const accounts = await login('accounts');
  const director = await login('director');
  ok('every department login works', true);

  const me = await sales('GET', '/api/auth/me');
  ok('bootstrap payload carries workflow metadata', Array.isArray(me.body.meta.stages) && me.body.meta.stages.length === 14,
    `${me.body.meta?.stages?.length} stages`);

  // ------------------------------------------------------------- store setup
  section('Masters & opening stock');
  const matNames = ['Plywood 18mm BWP', 'Laminate Sheet 1mm', 'SS Hinge 4inch', 'Adhesive 5kg'];
  const matIds = {};
  for (const [i, name] of matNames.entries()) {
    const r = await store('POST', '/api/masters/materials', {
      name, unit: i === 3 ? 'ltr' : i === 2 ? 'nos' : 'sheet',
      qty_in_stock: 200, reorder_level: 25, standard_rate: [1850, 620, 45, 900][i],
      category: 'Raw material',
    });
    if (r.status === 201) matIds[name] = r.body.material.id;
  }
  ok('store creates 4 materials with opening stock', Object.keys(matIds).length === 4, JSON.stringify(Object.keys(matIds)));

  const matList = await store('GET', '/api/masters/materials');
  const plywood = matList.body.materials.find((m) => m.name === 'Plywood 18mm BWP');
  ok('opening stock landed on the material', plywood && plywood.qty_in_stock === 200, `qty=${plywood?.qty_in_stock}`);

  const salesCantCreateMaterial = await sales('POST', '/api/masters/materials', { name: 'Sneaky material' });
  ok('sales cannot create a material (RBAC)', salesCantCreateMaterial.status === 403, `got ${salesCantCreateMaterial.status}`);

  // ------------------------------------------------------------ 1 · enquiry
  section('Step 1 · Enquiry');
  const enqRes = await sales('POST', '/api/enquiries', {
    cust_name: 'Rajesh Mehta',
    cust_company: 'Mehta Interiors LLP',
    cust_phone: '9825012345',
    cust_email: 'rajesh@mehtainteriors.in',
    cust_gstin: '24AAECM1234K1Z9',
    cust_address: '204 Silver Plaza, Ring Road',
    cust_city: 'Surat',
    cust_state: 'Gujarat',
    cust_pincode: '395002',
    reference: 'Website enquiry',
    expected_budget: 450000,
    site_name: 'Mehta Residence',
    site_city: 'Surat',
    required_date: new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10),
    payment_terms: '50% advance, 50% before dispatch',
    save_customer: true,
    items: [
      { product: 'Wardrobe 8ft', size: '8x7 ft', qty: 2, unit: 'nos', material: 'BWP Ply', laminate: 'Walnut', hardware: 'Hettich' },
      { product: 'TV Unit', size: '6x2 ft', qty: 1, unit: 'nos', material: 'MDF', laminate: 'Matt White' },
    ],
  });
  ok('sales creates an enquiry', enqRes.status === 201, JSON.stringify(enqRes.body));
  const enquiryId = enqRes.body.id;

  const costingCantCreateEnquiry = await costing('POST', '/api/enquiries', { cust_name: 'X', items: [{ product: 'Y' }] });
  ok('costing cannot create an enquiry (RBAC)', costingCantCreateEnquiry.status === 403, `got ${costingCantCreateEnquiry.status}`);

  const sendRes = await sales('POST', `/api/enquiries/${enquiryId}/send`);
  ok('enquiry auto-assigns to Factory / Costing', sendRes.status === 200 && sendRes.body.order.current_stage === 'costing',
    JSON.stringify(sendRes.body));
  const orderId = sendRes.body.order.id;
  const orderNo = sendRes.body.order.order_no;
  console.log(`      order ${orderNo} (id ${orderId})`);

  // ------------------------------------------------------ sequence guard
  section('Sequence enforcement (cannot skip a stage)');
  const skipToDispatch = await dispatch('POST', `/api/orders/${orderId}/stage/dispatch`, { transporter: 'X' });
  ok('dispatch cannot jump ahead of costing', skipToDispatch.status === 409, `got ${skipToDispatch.status}: ${skipToDispatch.body.error}`);

  const skipToProduction = await production('POST', `/api/orders/${orderId}/stage/production`, {});
  ok('production cannot start before material issue', skipToProduction.status === 409, `got ${skipToProduction.status}`);

  const salesCantCost = await sales('POST', `/api/orders/${orderId}/stage/costing`, { itemCostings: [] });
  ok('sales cannot do the factory costing (RBAC beats sequence)', salesCantCost.status === 403, `got ${salesCantCost.status}`);

  const readOnly = await director('POST', `/api/orders/${orderId}/stage/costing`, { itemCostings: [] });
  ok('management account is read-only', readOnly.status === 403, `got ${readOnly.status}`);

  // ----------------------------------------------------------- 2 · costing
  section('Step 2 · Factory Costing');
  const orderBefore = await costing('GET', `/api/orders/${orderId}`);
  const items = orderBefore.body.order.items;
  ok('order carries both enquiry items', items.length === 2, `${items.length} items`);

  const partialCosting = await costing('POST', `/api/orders/${orderId}/stage/costing`, {
    itemCostings: [{ item_id: items[0].id, bom: [{ material: 'Plywood 18mm BWP', qty: 6, unit: 'sheet', rate: 1850 }] }],
  });
  ok('costing rejects an incomplete sheet', partialCosting.status === 400, `got ${partialCosting.status}: ${partialCosting.body.error}`);

  const costRes = await costing('POST', `/api/orders/${orderId}/stage/costing`, {
    production_days: 12,
    costed_by: 'Factory Costing',
    itemCostings: [
      {
        item_id: items[0].id,
        labour_cost: 12000, machine_cost: 3000, transport_cost: 1500, overheads: 4000, wastage_percent: 5,
        bom: [
          { material: 'Plywood 18mm BWP', qty: 8, unit: 'sheet', rate: 1850 },
          { material: 'Laminate Sheet 1mm', qty: 10, unit: 'sheet', rate: 620 },
          { material: 'SS Hinge 4inch', qty: 24, unit: 'nos', rate: 45 },
          { material: 'Adhesive 5kg', qty: 3, unit: 'ltr', rate: 900 },
        ],
      },
      {
        item_id: items[1].id,
        labour_cost: 5000, machine_cost: 1200, transport_cost: 600, overheads: 1500, wastage_percent: 5,
        bom: [
          { material: 'Plywood 18mm BWP', qty: 3, unit: 'sheet', rate: 1850 },
          { material: 'Laminate Sheet 1mm', qty: 4, unit: 'sheet', rate: 620 },
        ],
      },
    ],
  });
  ok('costing completes and advances to planning', costRes.status === 200 && costRes.body.nextStage === 'planning',
    JSON.stringify(costRes.body.error || costRes.body.nextStage));

  const withCosting = costRes.body.order;
  // Wardrobe: materials 14800+6200+1080+2700 = 24780; wastage 5% = 1239; + 12000+3000+1500+4000 = 46519
  ok('item cost maths is right', Math.abs(withCosting.costing.itemCostings[0].total_cost - 46519) < 0.5,
    `got ${withCosting.costing.itemCostings[0].total_cost}`);
  // TV unit: 5550+2480 = 8030; wastage 401.5; + 5000+1200+600+1500 = 16731.5
  ok('total factory cost aggregates both products', Math.abs(withCosting.costing.total_cost - 63250.5) < 0.5,
    `got ${withCosting.costing.total_cost}`);

  // ---------------------------------------------------------- 3 · planning
  section('Step 3 · Sales Planning');
  const planRes = await sales('POST', `/api/orders/${orderId}/stage/planning`, {
    margin_percent: 30,
    discount_percent: 5,
    freight_charges: 4000,
    installation_charges: 6000,
    loading_charges: 1000,
    payment_terms: '50% advance, 50% before dispatch',
    items: [
      { item_id: items[0].id, selling_price: 30000 },
      { item_id: items[1].id, selling_price: 22000 },
    ],
  });
  ok('planning completes', planRes.status === 200 && planRes.body.nextStage === 'quotation', JSON.stringify(planRes.body.error));
  const plan = planRes.body.order.planning;
  // items 2*30000 + 22000 = 82000; -5% = 77900; + 4000+6000+1000 = 88900
  ok('planning subtotal applies discount and charges', Math.abs(plan.subtotal - 88900) < 0.5, `got ${plan.subtotal}`);

  // --------------------------------------------------------- 4 · quotation
  section('Step 4 · Quotation & customer approval');
  const quoteRes = await sales('POST', `/api/orders/${orderId}/stage/quotation`, { gst_rate: 18, warranty: '12 months' });
  ok('quotation generated', quoteRes.status === 200, JSON.stringify(quoteRes.body.error));
  const quote = quoteRes.body.order.quotation;
  ok('GST is computed on the planning subtotal', Math.abs(quote.grand_total - 104902) < 0.5, `got ${quote.grand_total}`);
  ok('quotation has a real document number', /^QT\/\d\d-\d\d\/\d{4}$/.test(quote.quotation_no), quote.quotation_no);

  const rejectNoReason = await sales('POST', `/api/orders/${orderId}/stage/approval`, { status: 'rejected' });
  ok('rejection demands a reason', rejectNoReason.status === 400, `got ${rejectNoReason.status}`);

  const apprRes = await sales('POST', `/api/orders/${orderId}/stage/approval`, { status: 'approved' });
  ok('approval advances to sales order', apprRes.status === 200 && apprRes.body.nextStage === 'salesOrder',
    JSON.stringify(apprRes.body.error));

  // ------------------------------------------------------- 5 · sales order
  section('Step 5 · Sales Order & advance');
  const noSign = await sales('POST', `/api/orders/${orderId}/stage/salesOrder`, { customer_signed: false });
  ok('sales order refuses without the customer signature', noSign.status === 400, `got ${noSign.status}`);

  const soRes = await sales('POST', `/api/orders/${orderId}/stage/salesOrder`, { customer_signed: true, po_number: 'MI/PO/882' });
  ok('sales order confirmed', soRes.status === 200 && soRes.body.nextStage === 'advance', JSON.stringify(soRes.body.error));
  ok('sales order locks the quoted total', Math.abs(soRes.body.order.salesOrder.locked_total - 104902) < 0.5,
    `got ${soRes.body.order.salesOrder.locked_total}`);

  const tooMuch = await accounts('POST', `/api/orders/${orderId}/stage/advance`, { amount: 500000 });
  ok('advance cannot exceed the order value', tooMuch.status === 400, `got ${tooMuch.status}`);

  const advRes = await accounts('POST', `/api/orders/${orderId}/stage/advance`, { amount: 52451, mode: 'Bank transfer', reference: 'UTR55231' });
  ok('advance recorded and balance computed', advRes.status === 200 && Math.abs(advRes.body.order.advance.balance - 52451) < 0.5,
    `balance ${advRes.body.order.advance.balance}`);

  // ------------------------------------------------------- 6 · store issue
  section('Step 6 · Store material issue (inventory deduction)');
  const stockBefore = (await store('GET', '/api/masters/materials')).body.materials
    .find((m) => m.name === 'Plywood 18mm BWP').qty_in_stock;

  const issueRes = await store('POST', `/api/orders/${orderId}/stage/store`, { received_by: 'Production Supervisor' });
  ok('store issues material per the costing BOM', issueRes.status === 200 && issueRes.body.nextStage === 'production',
    JSON.stringify(issueRes.body.error));

  const stockAfter = (await store('GET', '/api/masters/materials')).body.materials
    .find((m) => m.name === 'Plywood 18mm BWP').qty_in_stock;
  ok('plywood stock dropped by the BOM quantity (8 + 3 = 11)', Math.abs((stockBefore - stockAfter) - 11) < 0.001,
    `${stockBefore} -> ${stockAfter}`);

  const ledger = (await store('GET', `/api/masters/materials/${matIds['Plywood 18mm BWP']}/ledger`)).body.entries;
  ok('stock ledger records the issue against the order', ledger.some((e) => e.txn_type === 'issue' && e.order_no === orderNo),
    JSON.stringify(ledger.map((e) => e.txn_type)));

  // ------------------------------------------------------- 7 · production
  section('Step 7 · Production (consumption, wastage, extra material)');
  const issueLines = (await production('GET', `/api/orders/${orderId}`)).body.order.store.lines;
  ok('production sees the issued lines', issueLines.length === 6, `${issueLines.length} lines`);

  const prodRes = await production('POST', `/api/orders/${orderId}/stage/production`, {
    start_date: new Date(Date.now() - 6 * 864e5).toISOString().slice(0, 10),
    end_date: new Date().toISOString().slice(0, 10),
    produced_by: 'Unit 2',
    supervisor: 'Ashok Patel',
    consumption: issueLines.map((l, i) => ({ line_id: l.id, qty_used: i === 0 ? Number(l.qty_issued) - 1 : l.qty_issued })),
    wastage: [{ material: 'Laminate Sheet 1mm', qty: 1.5, unit: 'sheet', rate: 620, reason: 'Edge chipping while cutting' }],
    needs_additional: true,
    additional_materials: [{ material: 'SS Hinge 4inch', qty: 4, unit: 'nos', reason: 'Two hinges damaged during fitting' }],
  });
  ok('production completes and advances to QC', prodRes.status === 200 && prodRes.body.nextStage === 'qc',
    JSON.stringify(prodRes.body.error));

  const plyAfterProd = (await store('GET', '/api/masters/materials')).body.materials
    .find((m) => m.name === 'Plywood 18mm BWP').qty_in_stock;
  ok('one unused plywood sheet returned to store', Math.abs(plyAfterProd - (stockAfter + 1)) < 0.001,
    `${stockAfter} -> ${plyAfterProd}`);

  const hinge = (await store('GET', '/api/masters/materials')).body.materials.find((m) => m.name === 'SS Hinge 4inch');
  ok('extra material request deducted from stock (200 - 24 - 4 = 172)', Math.abs(hinge.qty_in_stock - 172) < 0.001,
    `qty=${hinge.qty_in_stock}`);

  const lam = (await store('GET', '/api/masters/materials')).body.materials.find((m) => m.name === 'Laminate Sheet 1mm');
  ok('wastage deducted from stock (200 - 14 - 1.5 = 184.5)', Math.abs(lam.qty_in_stock - 184.5) < 0.001, `qty=${lam.qty_in_stock}`);

  const fg = (await production('GET', `/api/orders/${orderId}`)).body.order.finishedGoods;
  ok('finished goods entered inventory', fg.length === 2 && fg.every((f) => f.status === 'in_stock'), JSON.stringify(fg.map((f) => f.status)));

  // -------------------------------------------------------------- 8 · QC
  section('Step 8 · Quality Check (fail then pass)');
  const packTooEarly = await packing('POST', `/api/orders/${orderId}/stage/packing`, { ready_for_dispatch: true });
  ok('packing is locked until QC approval', packTooEarly.status === 409, `got ${packTooEarly.status}`);

  const qcFail = await qc('POST', `/api/orders/${orderId}/stage/qc`, {
    result: 'fail', rework_note: 'Wardrobe shutter alignment off by 4mm', qc_by: 'QC Inspector',
  });
  ok('QC failure sends the order back to production', qcFail.status === 200 && qcFail.body.nextStage === 'production',
    JSON.stringify(qcFail.body.error || qcFail.body.nextStage));

  // Re-submitting production must not double-deduct: the same wastage and the
  // same extra material are sent again, and stock must land on the same numbers.
  const stockBeforeRework = (await store('GET', '/api/masters/materials')).body.materials;
  const snap = (list, name) => list.find((m) => m.name === name).qty_in_stock;

  const reProd = await production('POST', `/api/orders/${orderId}/stage/production`, {
    start_date: new Date(Date.now() - 6 * 864e5).toISOString().slice(0, 10),
    end_date: new Date().toISOString().slice(0, 10),
    produced_by: 'Unit 2',
    notes: 'Shutter realigned after QC rework',
    consumption: issueLines.map((l, i) => ({ line_id: l.id, qty_used: i === 0 ? Number(l.qty_issued) - 1 : l.qty_issued })),
    wastage: [{ material: 'Laminate Sheet 1mm', qty: 1.5, unit: 'sheet', rate: 620, reason: 'Edge chipping while cutting' }],
    needs_additional: true,
    additional_materials: [{ material: 'SS Hinge 4inch', qty: 4, unit: 'nos', reason: 'Two hinges damaged during fitting' }],
  });
  ok('rework re-submits production', reProd.status === 200 && reProd.body.nextStage === 'qc', JSON.stringify(reProd.body.error));

  const stockAfterRework = (await store('GET', '/api/masters/materials')).body.materials;
  for (const name of matNames) {
    ok(`re-submitting production does not double-deduct ${name}`,
      Math.abs(snap(stockBeforeRework, name) - snap(stockAfterRework, name)) < 0.001,
      `${snap(stockBeforeRework, name)} -> ${snap(stockAfterRework, name)}`);
  }
  const reworkWastage = reProd.body.order.production.wastage;
  ok('wastage survives the rework re-submission', reworkWastage.length === 1 && Math.abs(reworkWastage[0].value - 930) < 0.5,
    JSON.stringify(reworkWastage.map((w) => w.value)));

  const qcPass = await qc('POST', `/api/orders/${orderId}/stage/qc`, { result: 'pass', qc_by: 'QC Inspector', notes: 'All items within tolerance' });
  ok('QC pass advances to packaging', qcPass.status === 200 && qcPass.body.nextStage === 'packing', JSON.stringify(qcPass.body.error));
  ok('QC records the attempt count', qcPass.body.order.qc.attempt === 2, `attempt ${qcPass.body.order.qc.attempt}`);

  // --------------------------------------------------------- 9 · packaging
  section('Step 9 · Packaging');
  const notReady = await packing('POST', `/api/orders/${orderId}/stage/packing`, { ready_for_dispatch: false });
  ok('packing needs the ready-for-dispatch confirmation', notReady.status === 400, `got ${notReady.status}`);

  const packRes = await packing('POST', `/api/orders/${orderId}/stage/packing`, {
    ready_for_dispatch: true,
    packed_by: 'Packaging Team',
    packing_material: 'Bubble wrap + corrugated box',
    boxes: [
      { box_no: 'BOX-1', contents: 'Wardrobe 8ft — carcass', qty: 2, weight: 120, dimensions: '8x4x1 ft' },
      { box_no: 'BOX-2', contents: 'Wardrobe shutters + TV unit', qty: 3, weight: 85, dimensions: '7x3x1 ft' },
    ],
  });
  ok('packing completes with a box list', packRes.status === 200 && packRes.body.order.packing.total_boxes === 2,
    JSON.stringify(packRes.body.error));
  ok('gross weight totalled from the boxes', Math.abs(packRes.body.order.packing.gross_weight - 205) < 0.001,
    `${packRes.body.order.packing.gross_weight}`);

  // --------------------------------------------------------- 10 · dispatch
  section('Step 10 · Dispatch');
  const dispRes = await dispatch('POST', `/api/orders/${orderId}/stage/dispatch`, {
    transporter: 'VRL Logistics', vehicle_no: 'GJ05 AB 1234', driver_name: 'Suresh',
    driver_phone: '9898989898', lr_no: 'VRL/2026/8823', freight_amount: 3800, boxes: 2,
  });
  ok('dispatch completes', dispRes.status === 200 && dispRes.body.nextStage === 'invoice', JSON.stringify(dispRes.body.error));
  ok('delivery challan numbered', /^DC\//.test(dispRes.body.order.dispatch.challan_no), dispRes.body.order.dispatch.challan_no);
  ok('finished goods marked dispatched',
    dispRes.body.order.finishedGoods.every((f) => f.status === 'dispatched'),
    JSON.stringify(dispRes.body.order.finishedGoods.map((f) => f.status)));

  // ---------------------------------------------------------- 11 · invoice
  section('Step 11 · Delivery note & sales invoice');
  const invRes = await sales('POST', `/api/orders/${orderId}/stage/invoice`, {});
  ok('invoice generated', invRes.status === 200 && invRes.body.nextStage === 'payment', JSON.stringify(invRes.body.error));
  const inv = invRes.body.order.invoice;
  ok('invoice defaults to the quoted taxable value', Math.abs(inv.taxable_amount - 88900) < 0.5, `${inv.taxable_amount}`);
  ok('invoice total matches quotation', Math.abs(inv.grand_total - 104902) < 0.5, `${inv.grand_total}`);
  ok('delivery note numbered alongside the invoice', /^DN\//.test(inv.delivery_note_no), inv.delivery_note_no);

  // ---------------------------------------------------- 12 · final payment
  section('Step 12 · Final payment');
  const overPay = await accounts('POST', `/api/orders/${orderId}/stage/payment`, { balance_amount: 999999 });
  ok('final receipt cannot exceed the invoice', overPay.status === 400, `got ${overPay.status}`);

  const payRes = await accounts('POST', `/api/orders/${orderId}/stage/payment`, { mode: 'Cheque', reference: 'CHQ 447120' });
  ok('final payment completes', payRes.status === 200 && payRes.body.nextStage === 'gatepass', JSON.stringify(payRes.body.error));
  ok('outstanding is now zero', Math.abs(payRes.body.order.payment.outstanding) < 0.5, `${payRes.body.order.payment.outstanding}`);
  ok('balance auto-filled from invoice minus advance', Math.abs(payRes.body.order.payment.balance_amount - 52451) < 0.5,
    `${payRes.body.order.payment.balance_amount}`);

  // -------------------------------------------------------- 13 · gate pass
  section('Step 13 · Gate pass out');
  const gpRes = await store('POST', `/api/orders/${orderId}/stage/gatepass`, { security_by: 'Gate Security' });
  ok('gate pass issued and order closed', gpRes.status === 200 && gpRes.body.order.status === 'closed',
    JSON.stringify(gpRes.body.error || gpRes.body.order.status));
  ok('gate pass numbered', /^GP\//.test(gpRes.body.order.gatepass.gate_pass_no), gpRes.body.order.gatepass.gate_pass_no);

  const afterClose = await store('POST', `/api/orders/${orderId}/stage/gatepass`, {});
  ok('a closed order rejects further stage posts', afterClose.status === 409, `got ${afterClose.status}`);

  const history = gpRes.body.order.history;
  ok('full audit trail captured', history.length >= 14, `${history.length} history entries`);

  // ------------------------------------------------------- rejection branch
  section('Rejection branch (quotation rejected → lost with reason)');
  const enq2 = await sales('POST', '/api/enquiries', {
    cust_name: 'Priya Shah', cust_phone: '9812345678', cust_city: 'Vadodara', expected_budget: 120000,
    items: [{ product: 'Study Table', qty: 1, unit: 'nos' }], send: true,
  });
  const order2 = enq2.body.order.id;
  const items2 = (await costing('GET', `/api/orders/${order2}`)).body.order.items;
  await costing('POST', `/api/orders/${order2}/stage/costing`, {
    itemCostings: [{ item_id: items2[0].id, labour_cost: 3000, overheads: 800, bom: [{ material: 'Plywood 18mm BWP', qty: 2, unit: 'sheet', rate: 1850 }] }],
  });
  await sales('POST', `/api/orders/${order2}/stage/planning`, { items: [{ item_id: items2[0].id, selling_price: 14000 }] });
  await sales('POST', `/api/orders/${order2}/stage/quotation`, {});
  const rejRes = await sales('POST', `/api/orders/${order2}/stage/approval`, {
    status: 'rejected', reject_reason: 'Price too high', reject_note: 'Customer found a cheaper local vendor',
  });
  ok('rejection closes the order as lost', rejRes.status === 200 && rejRes.body.order.status === 'lost',
    JSON.stringify(rejRes.body.error || rejRes.body.order.status));

  const lostEnq = (await sales('GET', `/api/enquiries/${enq2.body.id}`)).body.enquiry;
  ok('enquiry archived as lost with the reason', lostEnq.status === 'lost' && lostEnq.lost_reason === 'Price too high',
    `${lostEnq.status} / ${lostEnq.lost_reason}`);

  const cantContinue = await sales('POST', `/api/orders/${order2}/stage/salesOrder`, { customer_signed: true });
  ok('a lost order cannot proceed', cantContinue.status === 409, `got ${cantContinue.status}`);

  // ------------------------------------------------------------- purchasing
  section('Purchase order & goods receipt');
  const supRes = await store('POST', '/api/masters/suppliers', { name: 'Gujarat Ply Traders', phone: '9900112233', city: 'Surat' });
  const poRes = await store('POST', '/api/purchase', {
    supplier_id: supRes.body.supplier.id,
    items: [{ material: 'Plywood 18mm BWP', qty: 50, unit: 'sheet', rate: 1875 }],
  });
  ok('purchase order raised', poRes.status === 201, JSON.stringify(poRes.body));
  const plyBeforeGrn = (await store('GET', '/api/masters/materials')).body.materials
    .find((m) => m.name === 'Plywood 18mm BWP').qty_in_stock;
  const grnRes = await store('POST', `/api/purchase/${poRes.body.id}/receive`);
  ok('goods receipt adds stock', grnRes.status === 200, JSON.stringify(grnRes.body));
  const plyAfterGrn = (await store('GET', '/api/masters/materials')).body.materials
    .find((m) => m.name === 'Plywood 18mm BWP').qty_in_stock;
  ok('stock increased by 50 sheets', Math.abs((plyAfterGrn - plyBeforeGrn) - 50) < 0.001, `${plyBeforeGrn} -> ${plyAfterGrn}`);
  const doubleGrn = await store('POST', `/api/purchase/${poRes.body.id}/receive`);
  ok('the same PO cannot be received twice', doubleGrn.status === 409, `got ${doubleGrn.status}`);

  // ---------------------------------------------------------- admin rollback
  section('Administrator rollback with stock reversal');
  const enq3 = await sales('POST', '/api/enquiries', {
    cust_name: 'Kiran Desai', cust_phone: '9700011122',
    items: [{ product: 'Kitchen Cabinet', qty: 1, unit: 'nos' }], send: true,
  });
  const order3 = enq3.body.order.id;
  const items3 = (await costing('GET', `/api/orders/${order3}`)).body.order.items;
  await costing('POST', `/api/orders/${order3}/stage/costing`, {
    itemCostings: [{ item_id: items3[0].id, labour_cost: 4000, bom: [{ material: 'Plywood 18mm BWP', qty: 5, unit: 'sheet', rate: 1850 }] }],
  });
  await sales('POST', `/api/orders/${order3}/stage/planning`, { items: [{ item_id: items3[0].id, selling_price: 25000 }] });
  await sales('POST', `/api/orders/${order3}/stage/quotation`, {});
  await sales('POST', `/api/orders/${order3}/stage/approval`, { status: 'approved' });
  await sales('POST', `/api/orders/${order3}/stage/salesOrder`, { customer_signed: true });
  await accounts('POST', `/api/orders/${order3}/stage/advance`, { amount: 10000 });
  const plyPreIssue = (await store('GET', '/api/masters/materials')).body.materials
    .find((m) => m.name === 'Plywood 18mm BWP').qty_in_stock;
  await store('POST', `/api/orders/${order3}/stage/store`, {});
  const plyPostIssue = (await store('GET', '/api/masters/materials')).body.materials
    .find((m) => m.name === 'Plywood 18mm BWP').qty_in_stock;
  ok('issue deducted 5 sheets', Math.abs((plyPreIssue - plyPostIssue) - 5) < 0.001, `${plyPreIssue} -> ${plyPostIssue}`);

  const nonAdminRollback = await store('POST', `/api/orders/${order3}/rollback`, { stage: 'store', reason: 'oops' });
  ok('a non-admin cannot roll back', nonAdminRollback.status === 403, `got ${nonAdminRollback.status}`);

  const rb = await admin('POST', `/api/orders/${order3}/rollback`, { stage: 'store', reason: 'Wrong BOM issued by store' });
  ok('admin rolls the order back to material issue', rb.status === 200 && rb.body.order.current_stage === 'store',
    JSON.stringify(rb.body.error || rb.body.order.current_stage));
  const plyPostRollback = (await store('GET', '/api/masters/materials')).body.materials
    .find((m) => m.name === 'Plywood 18mm BWP').qty_in_stock;
  ok('rollback returned the 5 sheets to stock', Math.abs(plyPostRollback - plyPreIssue) < 0.001,
    `${plyPostIssue} -> ${plyPostRollback}`);

  // ------------------------------------------------------------- dashboards
  section('Dashboard & reports');
  const dash = await director('GET', '/api/dashboard');
  ok('dashboard loads for management', dash.status === 200, JSON.stringify(dash.body.error));
  ok('dashboard reports 14 pipeline stages', dash.body.pipeline.length === 14, `${dash.body.pipeline?.length}`);
  ok('dashboard counts closed orders', dash.body.headline.closedOrders >= 1, `${dash.body.headline.closedOrders}`);
  ok('dashboard counts lost orders', dash.body.headline.lostOrders >= 1, `${dash.body.headline.lostOrders}`);
  ok('14-day trend series present', Array.isArray(dash.body.trend) && dash.body.trend.length === 14, `${dash.body.trend?.length}`);

  const storeDash = await store('GET', '/api/dashboard');
  ok('store queue only shows store stages',
    storeDash.body.myQueue.every((o) => ['store', 'gatepass'].includes(o.current_stage)),
    JSON.stringify(storeDash.body.myQueue.map((o) => o.current_stage)));

  const list = await director('GET', '/api/reports');
  ok('report catalogue exposed', list.body.reports.length >= 17, `${list.body.reports.length} reports`);

  let reportFails = [];
  for (const r of list.body.reports) {
    const res = await director('GET', `/api/reports/${r.key}?from=1900-01-01&to=2999-12-31`);
    if (res.status !== 200 || !Array.isArray(res.body.rows)) reportFails.push(`${r.key}(${res.status}: ${res.body.error || 'no rows'})`);
  }
  ok('every report runs without error', reportFails.length === 0, reportFails.join(', '));

  const salesReg = await director('GET', '/api/reports/sales-register?from=1900-01-01&to=2999-12-31');
  ok('sales register contains the invoice', salesReg.body.rows.some((r) => r.order_no === orderNo), JSON.stringify(salesReg.body.rows.length));

  const lostRep = await director('GET', '/api/reports/lost-enquiries?from=1900-01-01&to=2999-12-31');
  ok('lost report shows the rejection reason',
    lostRep.body.rows.some((r) => r.lost_reason === 'Price too high'), JSON.stringify(lostRep.body.rows.map((r) => r.lost_reason)));

  const consRep = await director('GET', '/api/reports/material-consumption?from=1900-01-01&to=2999-12-31');
  ok('consumption report has rows', consRep.body.rows.length > 0, `${consRep.body.rows.length}`);

  const wasteRep = await director('GET', '/api/reports/wastage?from=1900-01-01&to=2999-12-31');
  ok('wastage report values the scrap', wasteRep.body.totals.value > 0, JSON.stringify(wasteRep.body.totals));

  const csv = await director('GET', '/api/reports/raw-material-stock/export.csv');
  ok('CSV export works', typeof csv.body.raw === 'string' && csv.body.raw.includes('Material'), String(csv.body.raw).slice(0, 60));

  // ------------------------------------------------------------ user admin
  section('User administration');
  const newUser = await admin('POST', '/api/users', {
    username: 'sales2', full_name: 'Second Sales Executive', role: 'sales', password: 'temp-pw-for-test',
  });
  ok('admin creates a user', newUser.status === 201, JSON.stringify(newUser.body));
  const dupUser = await admin('POST', '/api/users', { username: 'sales2', full_name: 'X', role: 'sales', password: 'temp-pw-for-test' });
  ok('duplicate usernames are rejected', dupUser.status === 409, `got ${dupUser.status}`);
  const salesCantAdmin = await sales('GET', '/api/users');
  ok('non-admin cannot list users', salesCantAdmin.status === 403, `got ${salesCantAdmin.status}`);
  const selfDeactivate = await admin('PATCH', '/api/users/1', { active: false });
  ok('admin cannot deactivate their own account', selfDeactivate.status === 400, `got ${selfDeactivate.status}`);

  // ---------------------------------------------------------------- summary
  console.log('\n' + '='.repeat(60));
  console.log(`  ${pass} passed, ${fail} failed`);
  if (failures.length) {
    console.log('\n  Failures:');
    for (const f of failures) console.log(`   - ${f}`);
  }
  console.log('='.repeat(60) + '\n');
  return fail === 0;
}

(async () => {
  let server = null;
  if (ownServer) {
    // Fresh database so assertions on stock levels are deterministic, seeded
    // with one known password so every department login is predictable.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arrohan-smoke-'));
    process.env.ARROHAN_DATA_DIR = dir;
    process.env.ARROHAN_SEED_PASSWORD = TEST_PW;
    process.env.PORT = String(PORT);
    const origLog = console.log;
    console.log = () => {};
    server = require('../server/index.js');
    console.log = origLog;
    await new Promise((r) => setTimeout(r, 400));
    console.log(`Running against a fresh database in ${dir}`);
  } else {
    console.log(`Running against ${BASE}`);
  }

  let success = false;
  try {
    success = await main();
  } catch (e) {
    console.error('\nSmoke test crashed:', e.message);
    console.error(e.stack);
  }
  process.exit(success ? 0 : 1);
})();
