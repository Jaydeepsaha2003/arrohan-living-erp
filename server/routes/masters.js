'use strict';

const express = require('express');
const db = require('../db');
const a = require('../auth');
const { wrap, http, str, num, reqStr, round2, postStock } = require('../lib');

const router = express.Router();
router.use(a.requireAuth);

// =============================================================== customers

router.get(
  '/customers',
  wrap(async (req, res) => {
    const q = str(req.query.q);
    const rows = q
      ? await db.all(
          `SELECT * FROM customers
           WHERE active = 1 AND (name LIKE ? OR company_name LIKE ? OR phone LIKE ? OR city LIKE ?)
           ORDER BY name LIMIT 200`,
          `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`
        )
      : await db.all('SELECT * FROM customers WHERE active = 1 ORDER BY name');

    // Attach a light business summary so the master list is actually useful.
    const stats = await db.all(
      `SELECT e.customer_id AS cid,
              COUNT(DISTINCT e.id) AS enquiries,
              COUNT(DISTINCT o.id) AS orders,
              COALESCE(SUM(inv.grand_total), 0) AS billed,
              COALESCE((SELECT SUM(p.amount) FROM payments p JOIN orders o2 ON o2.id = p.order_id
                        JOIN enquiries e2 ON e2.id = o2.enquiry_id WHERE e2.customer_id = e.customer_id), 0) AS paid
       FROM enquiries e
       LEFT JOIN orders o ON o.enquiry_id = e.id
       LEFT JOIN invoices inv ON inv.order_id = o.id
       WHERE e.customer_id IS NOT NULL
       GROUP BY e.customer_id`
    );
    const byId = Object.fromEntries(stats.map((s) => [s.cid, s]));
    res.json({
      customers: rows.map((c) => {
        const s = byId[c.id] || { enquiries: 0, orders: 0, billed: 0, paid: 0 };
        return {
          ...c,
          active: !!c.active,
          enquiryCount: s.enquiries,
          orderCount: s.orders,
          billed: round2(s.billed),
          paid: round2(s.paid),
          outstanding: round2(num(s.billed) - num(s.paid)),
        };
      }),
    });
  })
);

router.post(
  '/customers',
  a.requireCapability('customer.write'),
  wrap(async (req, res) => {
    const b = req.body;
    const name = reqStr(b.name, 'Customer name');
    const info = await db.run(
      `INSERT INTO customers (code, name, company_name, phone, alt_phone, email, gstin, pan,
                              address, city, state, pincode, credit_days, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      str(b.code), name, str(b.company_name), str(b.phone), str(b.alt_phone), str(b.email),
      str(b.gstin), str(b.pan), str(b.address), str(b.city), str(b.state), str(b.pincode),
      num(b.credit_days), str(b.notes), req.user.id
    );
    await db.audit(req, 'customer.create', 'customer', info.lastInsertRowid, { name });
    res.status(201).json({ customer: await db.get('SELECT * FROM customers WHERE id = ?', info.lastInsertRowid) });
  })
);

router.patch(
  '/customers/:id',
  a.requireCapability('customer.write'),
  wrap(async (req, res) => {
    const id = Number(req.params.id);
    const existing = await db.get('SELECT * FROM customers WHERE id = ?', id);
    if (!existing) throw http(404, 'Customer not found.');
    const fields = [
      'code', 'name', 'company_name', 'phone', 'alt_phone', 'email', 'gstin', 'pan',
      'address', 'city', 'state', 'pincode', 'notes',
    ];
    const sets = [];
    const vals = [];
    for (const f of fields) {
      if (req.body[f] !== undefined) {
        sets.push(`${f} = ?`);
        vals.push(str(req.body[f]));
      }
    }
    if (req.body.credit_days !== undefined) {
      sets.push('credit_days = ?');
      vals.push(num(req.body.credit_days));
    }
    if (req.body.active !== undefined) {
      sets.push('active = ?');
      vals.push(req.body.active ? 1 : 0);
    }
    if (sets.length) {
      await db.run(`UPDATE customers SET ${sets.join(', ')} WHERE id = ?`, ...vals, id);
      await db.audit(req, 'customer.update', 'customer', id, req.body);
    }
    res.json({ customer: await db.get('SELECT * FROM customers WHERE id = ?', id) });
  })
);

// =============================================================== suppliers

router.get(
  '/suppliers',
  wrap(async (req, res) => {
    const rows = await db.all('SELECT * FROM suppliers WHERE active = 1 ORDER BY name');
    res.json({ suppliers: rows.map((s) => ({ ...s, active: !!s.active })) });
  })
);

router.post(
  '/suppliers',
  a.requireCapability('supplier.write'),
  wrap(async (req, res) => {
    const b = req.body;
    const name = reqStr(b.name, 'Supplier name');
    const info = await db.run(
      `INSERT INTO suppliers (code, name, contact_person, phone, email, gstin, address, city, state, pincode, payment_terms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      str(b.code), name, str(b.contact_person), str(b.phone), str(b.email), str(b.gstin),
      str(b.address), str(b.city), str(b.state), str(b.pincode), str(b.payment_terms)
    );
    await db.audit(req, 'supplier.create', 'supplier', info.lastInsertRowid, { name });
    res.status(201).json({ supplier: await db.get('SELECT * FROM suppliers WHERE id = ?', info.lastInsertRowid) });
  })
);

router.patch(
  '/suppliers/:id',
  a.requireCapability('supplier.write'),
  wrap(async (req, res) => {
    const id = Number(req.params.id);
    if (!(await db.get('SELECT id FROM suppliers WHERE id = ?', id))) throw http(404, 'Supplier not found.');
    const fields = ['code', 'name', 'contact_person', 'phone', 'email', 'gstin', 'address', 'city', 'state', 'pincode', 'payment_terms'];
    const sets = [];
    const vals = [];
    for (const f of fields) {
      if (req.body[f] !== undefined) {
        sets.push(`${f} = ?`);
        vals.push(str(req.body[f]));
      }
    }
    if (req.body.active !== undefined) {
      sets.push('active = ?');
      vals.push(req.body.active ? 1 : 0);
    }
    if (sets.length) {
      await db.run(`UPDATE suppliers SET ${sets.join(', ')} WHERE id = ?`, ...vals, id);
      await db.audit(req, 'supplier.update', 'supplier', id, req.body);
    }
    res.json({ supplier: await db.get('SELECT * FROM suppliers WHERE id = ?', id) });
  })
);

// =============================================================== materials

router.get(
  '/materials',
  wrap(async (req, res) => {
    const rows = await db.all(
      `SELECT m.*,
              (SELECT COALESCE(SUM(-l.qty), 0) FROM stock_ledger l
               WHERE l.material_id = m.id AND l.txn_type IN ('consume','issue')) AS consumed,
              (SELECT COALESCE(SUM(-l.qty), 0) FROM stock_ledger l
               WHERE l.material_id = m.id AND l.txn_type = 'wastage') AS wasted,
              (SELECT COALESCE(SUM(l.qty), 0) FROM stock_ledger l
               WHERE l.material_id = m.id AND l.txn_type = 'purchase') AS purchased
       FROM materials m WHERE m.active = 1 ORDER BY m.name`
    );
    res.json({
      materials: rows.map((m) => ({
        ...m,
        active: !!m.active,
        stockValue: round2(num(m.qty_in_stock) * num(m.standard_rate)),
        low: num(m.reorder_level) > 0 && num(m.qty_in_stock) <= num(m.reorder_level),
        negative: num(m.qty_in_stock) < 0,
      })),
    });
  })
);

router.post(
  '/materials',
  a.requireCapability('material.write'),
  wrap(async (req, res) => {
    const b = req.body;
    const name = reqStr(b.name, 'Material name');
    if (await db.get('SELECT id FROM materials WHERE lower(trim(name)) = lower(trim(?))', name)) {
      throw http(409, `Material "${name}" already exists.`);
    }
    const opening = num(b.qty_in_stock);
    const id = await db.tx(async () => {
      const info = await db.run(
        `INSERT INTO materials (code, name, category, unit, qty_in_stock, reorder_level, standard_rate, hsn, location)
         VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?)`,
        str(b.code), name, str(b.category), str(b.unit) || 'nos',
        num(b.reorder_level), num(b.standard_rate), str(b.hsn), str(b.location)
      );
      const newId = info.lastInsertRowid;
      if (opening !== 0) {
        await postStock({
          material_id: newId, qty: opening, unit: str(b.unit) || 'nos', rate: num(b.standard_rate),
          txn_type: 'opening', ref_table: 'materials', ref_id: newId,
          remarks: 'Opening stock', user_id: req.user.id,
        });
      }
      return newId;
    });
    await db.audit(req, 'material.create', 'material', id, { name, opening });
    res.status(201).json({ material: await db.get('SELECT * FROM materials WHERE id = ?', id) });
  })
);

router.patch(
  '/materials/:id',
  a.requireCapability('material.write'),
  wrap(async (req, res) => {
    const id = Number(req.params.id);
    if (!(await db.get('SELECT id FROM materials WHERE id = ?', id))) throw http(404, 'Material not found.');
    const sets = [];
    const vals = [];
    for (const f of ['code', 'name', 'category', 'unit', 'hsn', 'location']) {
      if (req.body[f] !== undefined) {
        sets.push(`${f} = ?`);
        vals.push(str(req.body[f]));
      }
    }
    for (const f of ['reorder_level', 'standard_rate']) {
      if (req.body[f] !== undefined) {
        sets.push(`${f} = ?`);
        vals.push(num(req.body[f]));
      }
    }
    if (req.body.active !== undefined) {
      sets.push('active = ?');
      vals.push(req.body.active ? 1 : 0);
    }
    if (sets.length) {
      await db.run(`UPDATE materials SET ${sets.join(', ')} WHERE id = ?`, ...vals, id);
      await db.audit(req, 'material.update', 'material', id, req.body);
    }
    res.json({ material: await db.get('SELECT * FROM materials WHERE id = ?', id) });
  })
);

/** Manual stock correction — always leaves a ledger trail with a reason. */
router.post(
  '/materials/:id/adjust',
  a.requireCapability('stock.adjust'),
  wrap(async (req, res) => {
    const id = Number(req.params.id);
    const mat = await db.get('SELECT * FROM materials WHERE id = ?', id);
    if (!mat) throw http(404, 'Material not found.');
    const qty = num(req.body.qty);
    if (!qty) throw http(400, 'Enter a non-zero adjustment quantity (use a minus sign to reduce).');
    const reason = reqStr(req.body.reason, 'Reason for the adjustment');
    const balance = await db.tx(() =>
      postStock({
        material_id: id, qty, unit: mat.unit, rate: num(mat.standard_rate),
        txn_type: 'adjust', ref_table: 'materials', ref_id: id,
        remarks: reason, user_id: req.user.id,
      })
    );
    await db.audit(req, 'stock.adjust', 'material', id, { qty, reason });
    res.json({ material: await db.get('SELECT * FROM materials WHERE id = ?', id), balance });
  })
);

router.get(
  '/materials/:id/ledger',
  wrap(async (req, res) => {
    const id = Number(req.params.id);
    res.json({
      material: await db.get('SELECT * FROM materials WHERE id = ?', id),
      entries: await db.all(
        `SELECT l.*, u.full_name AS user_name FROM stock_ledger l
         LEFT JOIN users u ON u.id = l.user_id WHERE l.material_id = ? ORDER BY l.id DESC LIMIT 500`,
        id
      ),
    });
  })
);

// =============================================================== products

router.get(
  '/products',
  wrap(async (req, res) => {
    res.json({ products: await db.all('SELECT * FROM products WHERE active = 1 ORDER BY name') });
  })
);

router.post(
  '/products',
  a.requireCapability('product.write'),
  wrap(async (req, res) => {
    const b = req.body;
    const name = reqStr(b.name, 'Product name');
    const info = await db.run(
      'INSERT INTO products (code, name, category, default_size, hsn, notes) VALUES (?, ?, ?, ?, ?, ?)',
      str(b.code), name, str(b.category), str(b.default_size), str(b.hsn), str(b.notes)
    );
    await db.audit(req, 'product.create', 'product', info.lastInsertRowid, { name });
    res.status(201).json({ product: await db.get('SELECT * FROM products WHERE id = ?', info.lastInsertRowid) });
  })
);

router.patch(
  '/products/:id',
  a.requireCapability('product.write'),
  wrap(async (req, res) => {
    const id = Number(req.params.id);
    if (!(await db.get('SELECT id FROM products WHERE id = ?', id))) throw http(404, 'Product not found.');
    const sets = [];
    const vals = [];
    for (const f of ['code', 'name', 'category', 'default_size', 'hsn', 'notes']) {
      if (req.body[f] !== undefined) {
        sets.push(`${f} = ?`);
        vals.push(str(req.body[f]));
      }
    }
    if (req.body.active !== undefined) {
      sets.push('active = ?');
      vals.push(req.body.active ? 1 : 0);
    }
    if (sets.length) await db.run(`UPDATE products SET ${sets.join(', ')} WHERE id = ?`, ...vals, id);
    res.json({ product: await db.get('SELECT * FROM products WHERE id = ?', id) });
  })
);

module.exports = router;
