'use strict';

/**
 * Loads a realistic set of sample data so the client can see the ERP working
 * before entering their own records.
 *
 *   node scripts/demo-data.js                 (against http://localhost:4180)
 *   BASE=http://localhost:5180 node scripts/demo-data.js
 *
 * Creates: materials with stock, suppliers, customers, and orders spread across
 * every stage of the workflow — including one completed order, one lost
 * quotation, one order in production, and a purchase order awaiting receipt.
 */

const fs = require('fs');
const path = require('path');

const BASE = process.env.BASE || 'http://localhost:4180';

/**
 * Passwords are generated per account on first run and written to
 * data/FIRST-RUN-LOGINS.txt, so read them from there. Set ARROHAN_PW to use one
 * password for every account instead (or if you have already changed them).
 */
function loadPasswords() {
  if (process.env.ARROHAN_PW) return { _all: process.env.ARROHAN_PW };
  const file = path.join(process.env.ARROHAN_DATA_DIR || path.join(__dirname, '..', 'data'), 'FIRST-RUN-LOGINS.txt');
  if (!fs.existsSync(file)) return {};
  const map = {};
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s{2}(\S+)\s{3,}(\S+)\s{3,}\S/);
    if (m) map[m[1]] = m[2];
  }
  return map;
}

const PASSWORDS = loadPasswords();

function passwordFor(username) {
  const pw = PASSWORDS._all || PASSWORDS[username];
  if (!pw) {
    throw new Error(
      `No password known for "${username}".\n` +
        '  Either keep data/FIRST-RUN-LOGINS.txt from the first server start,\n' +
        '  or run with one shared password:  ARROHAN_PW=yourpassword npm run demo-data'
    );
  }
  return pw;
}

function client() {
  let cookie = null;
  return async function call(method, path, body) {
    const res = await fetch(BASE + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    for (const c of res.headers.getSetCookie ? res.headers.getSetCookie() : []) {
      if (c.startsWith('arrohan_sid=')) cookie = c.split(';')[0];
    }
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 300) }; }
    if (!res.ok) {
      throw new Error(`${method} ${path} → ${res.status}: ${json.error || json.raw || 'failed'}`);
    }
    return json;
  };
}

async function login(username) {
  const call = client();
  await call('POST', '/api/auth/login', { username, password: passwordFor(username) });
  return call;
}

const day = (offset) => new Date(Date.now() + offset * 864e5).toISOString().slice(0, 10);

const MATERIALS = [
  { name: 'Plywood 18mm BWP', category: 'Plywood & boards', unit: 'sheet', qty_in_stock: 240, reorder_level: 40, standard_rate: 1850, code: 'PLY-18' },
  { name: 'Plywood 12mm MR', category: 'Plywood & boards', unit: 'sheet', qty_in_stock: 160, reorder_level: 30, standard_rate: 1220, code: 'PLY-12' },
  { name: 'MDF Board 18mm', category: 'Plywood & boards', unit: 'sheet', qty_in_stock: 95, reorder_level: 25, standard_rate: 1080, code: 'MDF-18' },
  { name: 'Laminate Sheet 1mm — Walnut', category: 'Laminate & veneer', unit: 'sheet', qty_in_stock: 180, reorder_level: 40, standard_rate: 640, code: 'LAM-WAL' },
  { name: 'Laminate Sheet 1mm — Matt White', category: 'Laminate & veneer', unit: 'sheet', qty_in_stock: 22, reorder_level: 40, standard_rate: 585, code: 'LAM-WHT' },
  { name: 'Teak Veneer 4mm', category: 'Laminate & veneer', unit: 'sheet', qty_in_stock: 48, reorder_level: 15, standard_rate: 2150, code: 'VEN-TEAK' },
  { name: 'SS Soft-close Hinge', category: 'Hardware & fittings', unit: 'nos', qty_in_stock: 640, reorder_level: 150, standard_rate: 145, code: 'HW-HNG' },
  { name: 'Telescopic Channel 18in', category: 'Hardware & fittings', unit: 'pair', qty_in_stock: 118, reorder_level: 40, standard_rate: 385, code: 'HW-CHN' },
  { name: 'Handle — Brushed Steel', category: 'Hardware & fittings', unit: 'nos', qty_in_stock: 240, reorder_level: 60, standard_rate: 210, code: 'HW-HDL' },
  { name: 'Edge Band 22mm', category: 'Consumables', unit: 'roll', qty_in_stock: 34, reorder_level: 10, standard_rate: 480, code: 'CN-EDG' },
  { name: 'Adhesive SR998', category: 'Adhesive & chemicals', unit: 'ltr', qty_in_stock: 86, reorder_level: 25, standard_rate: 285, code: 'CH-ADH' },
  { name: 'PU Polish', category: 'Adhesive & chemicals', unit: 'ltr', qty_in_stock: 12, reorder_level: 20, standard_rate: 720, code: 'CH-PU' },
  { name: 'Mirror 5mm', category: 'Glass & mirror', unit: 'sqft', qty_in_stock: 210, reorder_level: 50, standard_rate: 95, code: 'GL-MIR' },
  { name: 'Bubble Wrap Roll', category: 'Packing material', unit: 'roll', qty_in_stock: 18, reorder_level: 6, standard_rate: 640, code: 'PK-BUB' },
  { name: 'Corrugated Box Sheet', category: 'Packing material', unit: 'sheet', qty_in_stock: 320, reorder_level: 80, standard_rate: 48, code: 'PK-BOX' },
];

const SUPPLIERS = [
  { name: 'Gujarat Ply Traders', contact_person: 'Hiren Patel', phone: '9000000001', city: 'Surat', state: 'Gujarat', gstin: '24AABCG1234M1Z8', payment_terms: '30 days credit' },
  { name: 'Sunrise Laminates', contact_person: 'Mehul Shah', phone: '9000000002', city: 'Ahmedabad', state: 'Gujarat', gstin: '24AACCS5566P1ZQ', payment_terms: '15 days credit' },
  { name: 'Hardware House', contact_person: 'Imran Qureshi', phone: '9000000003', city: 'Surat', state: 'Gujarat', payment_terms: 'Advance' },
];

const CUSTOMERS = [
  {
    cust_name: 'Rajesh Mehta', cust_company: 'Mehta Interiors LLP', cust_phone: '9000000004',
    cust_email: 'rajesh@mehtainteriors.in', cust_gstin: '24AAECM1234K1Z9',
    cust_address: '204 Silver Plaza, Ring Road', cust_city: 'Surat', cust_state: 'Gujarat', cust_pincode: '395002',
    reference: 'Architect referral', taken_by: 'Sales Department', expected_budget: 480000,
    site_name: 'Mehta Residence', site_city: 'Surat', site_contact: 'Rajesh Mehta', site_mobile: '9000000004',
    visit_required: 'Yes', measurement_taken: 'Yes', measurement_by: 'Site team', measurement_date: day(-24),
    installation_required: 'Yes', payment_terms: '50% advance, 50% before dispatch',
    items: [
      { product: 'Wardrobe 8ft — 3 door', size: '8x7 ft', qty: 2, unit: 'nos', material: 'BWP Ply', laminate: 'Walnut', hardware: 'Hettich soft-close', remarks: 'Internal mirror on centre shutter' },
      { product: 'Dressing Unit', size: '4x6 ft', qty: 1, unit: 'nos', material: 'MDF', laminate: 'Matt White', hardware: 'Brushed steel' },
    ],
  },
  {
    cust_name: 'Priya Shah', cust_company: 'Shah Builders', cust_phone: '9000000005',
    cust_email: 'priya@shahbuilders.co.in', cust_city: 'Vadodara', cust_state: 'Gujarat', cust_pincode: '390007',
    cust_address: 'B-12 Sunrise Complex, Alkapuri',
    reference: 'Website enquiry', taken_by: 'Sales Department', expected_budget: 950000,
    site_name: 'Sunrise Heights — Flat 703', site_city: 'Vadodara', installation_required: 'Yes',
    payment_terms: '40% advance, balance on delivery',
    items: [
      { product: 'Modular Kitchen — L shape', size: '10x8 ft', qty: 1, unit: 'nos', material: 'BWP Ply', laminate: 'Matt White', hardware: 'Telescopic channels' },
      { product: 'Crockery Unit', size: '5x7 ft', qty: 1, unit: 'nos', material: 'BWP Ply', laminate: 'Walnut' },
      { product: 'Breakfast Counter', size: '6x3 ft', qty: 1, unit: 'nos', material: 'Teak veneer' },
    ],
  },
  {
    cust_name: 'Anil Desai', cust_phone: '9000000006', cust_city: 'Navsari', cust_state: 'Gujarat',
    cust_address: '17 Gandhi Road', reference: 'Walk-in', taken_by: 'Sales Department', expected_budget: 165000,
    installation_required: 'No', payment_terms: '50% advance',
    items: [{ product: 'Study Table with Shelf', size: '5x2.5 ft', qty: 2, unit: 'nos', material: 'MDF', laminate: 'Walnut' }],
  },
  {
    cust_name: 'Kavita Iyer', cust_company: 'Iyer Residency', cust_phone: '9000000007',
    cust_city: 'Surat', cust_state: 'Gujarat', cust_address: 'Flat 1102, Palm Grove, Vesu',
    reference: 'Repeat customer', taken_by: 'Sales Department', expected_budget: 320000,
    installation_required: 'Yes', payment_terms: '50% advance, 50% before dispatch',
    items: [
      { product: 'TV Unit with Panelling', size: '9x7 ft', qty: 1, unit: 'nos', material: 'BWP Ply', laminate: 'Walnut' },
      { product: 'Shoe Cabinet', size: '3x4 ft', qty: 1, unit: 'nos', material: 'MR Ply', laminate: 'Matt White' },
    ],
  },
  {
    cust_name: 'Farhan Sheikh', cust_company: 'Sheikh Hospitality', cust_phone: '9000000008',
    cust_city: 'Bharuch', cust_state: 'Gujarat', cust_address: 'Hotel Grand Plaza, Station Road',
    reference: 'Contractor reference', taken_by: 'Sales Department', expected_budget: 1450000,
    installation_required: 'Yes', payment_terms: '30% advance, 40% on dispatch, 30% after installation',
    items: [
      { product: 'Hotel Room Wardrobe', size: '6x7 ft', qty: 8, unit: 'nos', material: 'BWP Ply', laminate: 'Walnut' },
      { product: 'Luggage Rack', size: '3x1.5 ft', qty: 8, unit: 'nos', material: 'MR Ply' },
    ],
  },
  {
    cust_name: 'Suresh Nair', cust_phone: '9000000009', cust_city: 'Surat', cust_state: 'Gujarat',
    cust_address: '44 Adajan Gam', reference: 'Instagram', taken_by: 'Sales Department', expected_budget: 90000,
    items: [{ product: 'Pooja Unit', size: '3x5 ft', qty: 1, unit: 'nos', material: 'Teak veneer' }],
  },
  {
    cust_name: 'Deepa Trivedi', cust_phone: '9000000010', cust_city: 'Rajkot', cust_state: 'Gujarat',
    cust_address: '9 Kalawad Road', reference: 'Architect referral', taken_by: 'Sales Department', expected_budget: 260000,
    items: [{ product: 'Kids Bunk Bed Unit', size: '7x6 ft', qty: 1, unit: 'nos', material: 'BWP Ply', laminate: 'Matt White' }],
  },
];

/**
 * BOM recipes keyed by a loose match on the product name.
 * Quantities returned are per unit; scaleBom multiplies them for the line.
 */
function bomFor(product) {
  const p = product.toLowerCase();
  if (p.includes('wardrobe')) {
    return {
      labour_cost: 11000, machine_cost: 2800, transport_cost: 1400, overheads: 3600, wastage_percent: 5,
      bom: [
        { material: 'Plywood 18mm BWP', qty: 7, unit: 'sheet', rate: 1850 },
        { material: 'Laminate Sheet 1mm — Walnut', qty: 9, unit: 'sheet', rate: 640 },
        { material: 'SS Soft-close Hinge', qty: 12, unit: 'nos', rate: 145 },
        { material: 'Handle — Brushed Steel', qty: 6, unit: 'nos', rate: 210 },
        { material: 'Edge Band 22mm', qty: 2, unit: 'roll', rate: 480 },
        { material: 'Adhesive SR998', qty: 4, unit: 'ltr', rate: 285 },
      ],
    };
  }
  if (p.includes('kitchen')) {
    return {
      labour_cost: 26000, machine_cost: 6500, transport_cost: 3200, overheads: 8400, wastage_percent: 6,
      bom: [
        { material: 'Plywood 18mm BWP', qty: 14, unit: 'sheet', rate: 1850 },
        { material: 'Laminate Sheet 1mm — Matt White', qty: 16, unit: 'sheet', rate: 585 },
        { material: 'Telescopic Channel 18in', qty: 14, unit: 'pair', rate: 385 },
        { material: 'SS Soft-close Hinge', qty: 24, unit: 'nos', rate: 145 },
        { material: 'Edge Band 22mm', qty: 4, unit: 'roll', rate: 480 },
        { material: 'Adhesive SR998', qty: 8, unit: 'ltr', rate: 285 },
      ],
    };
  }
  if (p.includes('tv unit') || p.includes('crockery') || p.includes('dressing') || p.includes('bunk')) {
    return {
      labour_cost: 7200, machine_cost: 1900, transport_cost: 900, overheads: 2400, wastage_percent: 5,
      bom: [
        { material: 'Plywood 18mm BWP', qty: 4, unit: 'sheet', rate: 1850 },
        { material: 'Laminate Sheet 1mm — Walnut', qty: 5, unit: 'sheet', rate: 640 },
        { material: 'SS Soft-close Hinge', qty: 6, unit: 'nos', rate: 145 },
        { material: 'Edge Band 22mm', qty: 1, unit: 'roll', rate: 480 },
        { material: 'Adhesive SR998', qty: 3, unit: 'ltr', rate: 285 },
      ],
    };
  }
  if (p.includes('pooja') || p.includes('counter')) {
    return {
      labour_cost: 6800, machine_cost: 1600, transport_cost: 700, overheads: 2100, wastage_percent: 7,
      bom: [
        { material: 'Teak Veneer 4mm', qty: 3, unit: 'sheet', rate: 2150 },
        { material: 'Plywood 12mm MR', qty: 3, unit: 'sheet', rate: 1220 },
        { material: 'PU Polish', qty: 4, unit: 'ltr', rate: 720 },
        { material: 'Adhesive SR998', qty: 2, unit: 'ltr', rate: 285 },
      ],
    };
  }
  // Study table, shoe cabinet, luggage rack and anything else small.
  return {
    labour_cost: 3400, machine_cost: 900, transport_cost: 500, overheads: 1100, wastage_percent: 5,
    bom: [
      { material: 'MDF Board 18mm', qty: 2, unit: 'sheet', rate: 1080 },
      { material: 'Laminate Sheet 1mm — Walnut', qty: 3, unit: 'sheet', rate: 640 },
      { material: 'Edge Band 22mm', qty: 1, unit: 'roll', rate: 480 },
      { material: 'Adhesive SR998', qty: 1, unit: 'ltr', rate: 285 },
    ],
  };
}

/**
 * The costing BOM covers the whole line, so per-unit recipe quantities and the
 * one-off costs (labour, machine, transport, overheads) both scale with qty.
 */
function scaleBom(recipe, qty) {
  const n = Math.max(1, Number(qty) || 1);
  return {
    ...recipe,
    labour_cost: recipe.labour_cost * n,
    machine_cost: recipe.machine_cost * n,
    transport_cost: recipe.transport_cost * n,
    overheads: recipe.overheads * n,
    bom: recipe.bom.map((b) => ({ ...b, qty: Math.round(b.qty * n * 100) / 100 })),
  };
}

const PRICE_MULTIPLIER = 1.42;

async function main() {
  console.log(`Loading demo data into ${BASE}\n`);

  const admin = await login('admin');
  const sales = await login('sales');
  const costing = await login('costing');
  const store = await login('store');
  const production = await login('production');
  const qc = await login('qc');
  const packing = await login('packing');
  const dispatch = await login('dispatch');
  const accounts = await login('accounts');
  console.log('  ✓ signed in as every department');

  // ------------------------------------------------------------- masters
  // Re-runnable: create the material, or top its balance back up if it exists.
  const existingMats = (await store('GET', '/api/masters/materials')).materials;
  const byName = Object.fromEntries(existingMats.map((m) => [m.name.trim().toLowerCase(), m]));
  for (const m of MATERIALS) {
    const found = byName[m.name.trim().toLowerCase()];
    if (!found) {
      await store('POST', '/api/masters/materials', m);
      continue;
    }
    const gap = Number(m.qty_in_stock) - Number(found.qty_in_stock);
    if (Math.abs(gap) > 0.001) {
      await store('POST', `/api/masters/materials/${found.id}/adjust`, {
        qty: gap,
        reason: 'Demo data — restoring the sample opening balance',
      });
    }
  }
  console.log(`  ✓ ${MATERIALS.length} raw materials with opening stock`);

  for (const s of SUPPLIERS) {
    try { await store('POST', '/api/masters/suppliers', s); } catch { /* already exists */ }
  }
  console.log(`  ✓ ${SUPPLIERS.length} suppliers`);

  for (const p of ['Wardrobe 8ft — 3 door', 'Modular Kitchen — L shape', 'TV Unit with Panelling', 'Study Table with Shelf', 'Crockery Unit', 'Pooja Unit', 'Shoe Cabinet', 'Dressing Unit']) {
    try { await sales('POST', '/api/masters/products', { name: p, category: 'Modular furniture' }); } catch { /* ignore */ }
  }

  // ------------------------------------------------------------ enquiries
  // Enquiry 6 stays open (no order); the rest are pushed to different depths.
  const created = [];
  for (const [i, c] of CUSTOMERS.entries()) {
    const send = i !== 5 && i !== 6;
    const r = await sales('POST', '/api/enquiries', {
      ...c, enquiry_date: day(-28 + i * 3), enquiry_time: `1${i}:${15 + i}`,
      stage_label: send ? 'Quoted' : i === 5 ? 'Follow-up' : 'Hot',
      required_date: day(14 + i * 4), save_customer: true, send,
    });
    created.push({ ...r, customer: c });
  }
  console.log(`  ✓ ${CUSTOMERS.length} enquiries (2 still open in follow-up)`);

  const orders = created.filter((c) => c.order).map((c) => c.order);

  // ------------------------------------------------------------- helpers
  async function doCosting(orderId, days) {
    const o = (await costing('GET', `/api/orders/${orderId}`)).order;
    await costing('POST', `/api/orders/${orderId}/stage/costing`, {
      production_days: days,
      costed_by: 'Factory Costing',
      costed_at: day(-1),
      itemCostings: o.items.map((it) => ({ item_id: it.id, ...scaleBom(bomFor(it.product), it.qty) })),
    });
    return (await costing('GET', `/api/orders/${orderId}`)).order;
  }

  async function doPlanning(orderId, opts = {}) {
    const o = (await sales('GET', `/api/orders/${orderId}`)).order;
    await sales('POST', `/api/orders/${orderId}/stage/planning`, {
      margin_percent: 42,
      discount_percent: opts.discount ?? 0,
      freight_charges: opts.freight ?? 3500,
      installation_charges: opts.installation ?? 6000,
      loading_charges: 1200,
      payment_terms: o.enquiry_payment_terms || '50% advance, 50% before dispatch',
      decided_by: 'Sales Department',
      items: o.items.map((it) => {
        const ic = o.costing.itemCostings.find((c) => c.item_id === it.id);
        const perUnit = Number(ic.total_cost) / (Number(it.qty) || 1);
        return { item_id: it.id, selling_price: Math.round((perUnit * PRICE_MULTIPLIER) / 50) * 50 };
      }),
    });
  }

  async function doQuotation(orderId) {
    await sales('POST', `/api/orders/${orderId}/stage/quotation`, {
      gst_rate: 18, warranty: '12 months against manufacturing defects',
      terms: 'Prices are ex-works Surat. Delivery timeline starts from the date of advance receipt. Installation at actuals if outside Surat.',
    });
  }

  async function doStore(orderId) {
    await store('POST', `/api/orders/${orderId}/stage/store`, {
      issue_date: day(-8), issued_by: 'Store Department', received_by: 'Production Supervisor',
      allow_negative_stock: true,
    });
  }

  // ---------------------------------------------- order 1 — fully complete
  const o1 = orders[0];
  await doCosting(o1.id, 12);
  await doPlanning(o1.id, { discount: 4 });
  await doQuotation(o1.id);
  await sales('POST', `/api/orders/${o1.id}/stage/approval`, { status: 'approved', decided_at: day(-20), decided_by_name: 'Rajesh Mehta' });
  await sales('POST', `/api/orders/${o1.id}/stage/salesOrder`, { customer_signed: true, so_date: day(-19), signed_date: day(-19), po_number: 'MI/PO/1188' });
  const so1 = (await accounts('GET', `/api/orders/${o1.id}`)).order.salesOrder;
  await accounts('POST', `/api/orders/${o1.id}/stage/advance`, {
    amount: Math.round(Number(so1.locked_total) / 2), received_at: day(-18), mode: 'Bank transfer', reference: 'UTR 552310099',
  });
  await doStore(o1.id);
  const issued1 = (await production('GET', `/api/orders/${o1.id}`)).order.store.lines;
  await production('POST', `/api/orders/${o1.id}/stage/production`, {
    start_date: day(-16), end_date: day(-6), produced_by: 'Unit 2', supervisor: 'Ashok Patel',
    consumption: issued1.map((l, i) => ({ line_id: l.id, qty_used: i % 3 === 0 ? Number(l.qty_issued) - 1 : l.qty_issued })),
    wastage: [{ material: 'Laminate Sheet 1mm — Walnut', qty: 2, unit: 'sheet', rate: 640, reason: 'Edge chipped while cutting' }],
    needs_additional: true,
    additional_materials: [{ material: 'SS Soft-close Hinge', qty: 4, unit: 'nos', reason: 'Two hinges damaged during fitting' }],
    notes: 'Completed ahead of the promised date.',
  });
  await qc('POST', `/api/orders/${o1.id}/stage/qc`, { result: 'pass', qc_date: day(-5), qc_by: 'QC Inspector', notes: 'All units within tolerance. Finish approved.' });
  await packing('POST', `/api/orders/${o1.id}/stage/packing`, {
    ready_for_dispatch: true, packing_date: day(-4), packed_by: 'Packaging Team', packing_material: 'Bubble wrap + corrugated box',
    boxes: [
      { box_no: 'BOX-1', contents: 'Wardrobe carcass ×2', qty: 2, weight: 168, dimensions: '8x4x1 ft' },
      { box_no: 'BOX-2', contents: 'Wardrobe shutters ×6', qty: 6, weight: 96, dimensions: '7x3x0.5 ft' },
      { box_no: 'BOX-3', contents: 'Dressing unit + mirror', qty: 1, weight: 74, dimensions: '6x4x1 ft' },
    ],
  });
  await dispatch('POST', `/api/orders/${o1.id}/stage/dispatch`, {
    dispatch_date: day(-3), transporter: 'VRL Logistics', vehicle_no: 'GJ05 AB 1234', driver_name: 'Suresh Yadav',
    driver_phone: '9000000011', lr_no: 'VRL/2026/88231', freight_amount: 3500, eway_bill_no: '3812 4471 9902',
  });
  await sales('POST', `/api/orders/${o1.id}/stage/invoice`, { invoice_date: day(-3), place_of_supply: 'Gujarat' });
  await accounts('POST', `/api/orders/${o1.id}/stage/payment`, { received_at: day(-1), delivered_date: day(-2), mode: 'Cheque', reference: 'CHQ 447120' });
  await store('POST', `/api/orders/${o1.id}/stage/gatepass`, { gate_pass_date: day(-3), gate_pass_time: '16:40', security_by: 'Gate Security' });
  console.log(`  ✓ ${o1.order_no} — complete, gate pass issued`);

  // ------------------------------------------- order 2 — in production, part paid
  const o2 = orders[1];
  await doCosting(o2.id, 18);
  await doPlanning(o2.id, { freight: 5200, installation: 14000 });
  await doQuotation(o2.id);
  await sales('POST', `/api/orders/${o2.id}/stage/approval`, { status: 'approved', decided_at: day(-14), decided_by_name: 'Priya Shah' });
  await sales('POST', `/api/orders/${o2.id}/stage/salesOrder`, { customer_signed: true, so_date: day(-13), signed_date: day(-13), po_number: 'SB/2026/441' });
  const so2 = (await accounts('GET', `/api/orders/${o2.id}`)).order.salesOrder;
  await accounts('POST', `/api/orders/${o2.id}/stage/advance`, {
    amount: Math.round(Number(so2.locked_total) * 0.4), received_at: day(-12), mode: 'UPI', reference: 'UPI 9928117',
  });
  await doStore(o2.id);
  console.log(`  ✓ ${o2.order_no} — material issued, sitting with Production`);

  // ------------------------------------------------ order 3 — LOST at approval
  const o3 = orders[2];
  await doCosting(o3.id, 8);
  await doPlanning(o3.id, { freight: 1200, installation: 0 });
  await doQuotation(o3.id);
  await sales('POST', `/api/orders/${o3.id}/stage/approval`, {
    status: 'rejected', decided_at: day(-9), reject_reason: 'Price too high',
    reject_note: 'Customer found a local carpenter quoting 30% lower.',
  });
  console.log(`  ✓ ${o3.order_no} — quotation rejected, closed as lost`);

  // -------------------------------------------- order 4 — awaiting QC (reworked)
  const o4 = orders[3];
  await doCosting(o4.id, 10);
  await doPlanning(o4.id, { freight: 2200, installation: 4500 });
  await doQuotation(o4.id);
  await sales('POST', `/api/orders/${o4.id}/stage/approval`, { status: 'approved', decided_at: day(-11), decided_by_name: 'Kavita Iyer' });
  await sales('POST', `/api/orders/${o4.id}/stage/salesOrder`, { customer_signed: true, so_date: day(-10), signed_date: day(-10) });
  const so4 = (await accounts('GET', `/api/orders/${o4.id}`)).order.salesOrder;
  await accounts('POST', `/api/orders/${o4.id}/stage/advance`, { amount: Math.round(Number(so4.locked_total) / 2), received_at: day(-10), mode: 'Bank transfer' });
  await doStore(o4.id);
  const issued4 = (await production('GET', `/api/orders/${o4.id}`)).order.store.lines;
  await production('POST', `/api/orders/${o4.id}/stage/production`, {
    start_date: day(-7), end_date: day(-2), produced_by: 'Unit 1', supervisor: 'Ashok Patel',
    consumption: issued4.map((l) => ({ line_id: l.id, qty_used: l.qty_issued })),
    wastage: [{ material: 'Edge Band 22mm', qty: 0.5, unit: 'roll', rate: 480, reason: 'Band peeled during pressing' }],
  });
  await qc('POST', `/api/orders/${o4.id}/stage/qc`, {
    result: 'fail', qc_date: day(-2), qc_by: 'QC Inspector', rework_note: 'TV unit panelling has a 4mm gap at the right joint. Shoe cabinet shutter alignment off.',
  });
  await production('POST', `/api/orders/${o4.id}/stage/production`, {
    start_date: day(-7), end_date: day(0), produced_by: 'Unit 1', supervisor: 'Ashok Patel',
    consumption: issued4.map((l) => ({ line_id: l.id, qty_used: l.qty_issued })),
    wastage: [{ material: 'Edge Band 22mm', qty: 0.5, unit: 'roll', rate: 480, reason: 'Band peeled during pressing' }],
    notes: 'Joint re-pressed and shutter realigned after QC rework.',
  });
  console.log(`  ✓ ${o4.order_no} — reworked after a QC failure, back with QC`);

  // ------------------------------------- order 5 — awaiting customer approval
  const o5 = orders[4];
  await doCosting(o5.id, 25);
  await doPlanning(o5.id, { freight: 12000, installation: 28000, discount: 6 });
  await doQuotation(o5.id);
  console.log(`  ✓ ${o5.order_no} — quotation sent, awaiting the customer's decision`);

  // ------------------------------------------ purchase orders (one received)
  const sups = (await store('GET', '/api/masters/suppliers')).suppliers;
  const po1 = await store('POST', '/api/purchase', {
    supplier_id: sups[0].id, po_date: day(-6), expected_date: day(-2),
    items: [
      { material: 'Plywood 18mm BWP', qty: 60, unit: 'sheet', rate: 1875 },
      { material: 'Plywood 12mm MR', qty: 40, unit: 'sheet', rate: 1240 },
    ],
    notes: 'Regular monthly replenishment.',
  });
  await store('POST', `/api/purchase/${po1.id}/receive`);

  await store('POST', '/api/purchase', {
    supplier_id: sups[1].id, po_date: day(-1), expected_date: day(5),
    items: [
      { material: 'Laminate Sheet 1mm — Matt White', qty: 80, unit: 'sheet', rate: 590 },
      { material: 'PU Polish', qty: 40, unit: 'ltr', rate: 735 },
    ],
    notes: 'Urgent — matt white laminate is below reorder level.',
  });
  await store('POST', '/api/purchase', {
    supplier_id: sups[2].id, po_date: day(0), expected_date: day(7),
    items: [{ material: 'Telescopic Channel 18in', qty: 60, unit: 'pair', rate: 392 }],
  });
  console.log('  ✓ 3 purchase orders (1 received into stock, 2 open)');

  // --------------------------------------------------- an order put on hold
  await sales('POST', `/api/orders/${o5.id}/hold`, { reason: 'Customer asked to pause until their site is ready in the first week of next month.' });
  console.log(`  ✓ ${o5.order_no} put on hold`);

  // ------------------------------------------------------------------ notes
  await sales('POST', `/api/orders/${o2.id}/notes`, { body: 'Customer wants the kitchen shutters matched to the Sunrise Heights sample panel. Sample is with the factory.' });
  await production('POST', `/api/orders/${o2.id}/notes`, { body: 'Started carcass assembly. Channels are running short — flagged to store.' });

  // ------------------------------------------------------------ extra staff
  const extraPw = 'change-me-on-first-signin';
  for (const u of [
    { username: 'sales2', full_name: 'Nikhil Joshi', role: 'sales', password: extraPw, phone: '9000000012' },
    { username: 'store2', full_name: 'Ramesh Solanki', role: 'store', password: extraPw },
    { username: 'prod2', full_name: 'Ashok Patel', role: 'production', password: extraPw },
  ]) {
    try { await admin('POST', '/api/users', u); } catch { /* already exists */ }
  }
  console.log(`  ✓ 3 extra staff logins (password "${extraPw}")`);

  const dash = await admin('GET', '/api/dashboard');
  console.log('\nDemo data loaded.');
  console.log(`  Active orders     ${dash.headline.activeOrders}`);
  console.log(`  Completed         ${dash.headline.closedOrders}`);
  console.log(`  Lost              ${dash.headline.lostOrders}`);
  console.log(`  Open enquiries    ${dash.headline.openEnquiries}`);
  console.log(`  Outstanding       ₹${Number(dash.headline.outstanding).toLocaleString('en-IN')}`);
  console.log(`  Stock value       ₹${Number(dash.headline.stockValue).toLocaleString('en-IN')}`);
  console.log(`  Low stock items   ${dash.headline.lowStockCount}`);
  console.log(`\nOpen ${BASE} and sign in to explore.\n`);
}

main().catch((e) => {
  console.error('\nDemo data failed:', e.message);
  console.error('\nIs the server running, and is the admin password still the default?');
  console.error('If you changed it, run:  ADMIN_PW=yourpassword node scripts/demo-data.js\n');
  process.exit(1);
});
