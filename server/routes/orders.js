'use strict';

const express = require('express');
const db = require('../db');
const a = require('../auth');
const wf = require('../workflow');
const { HANDLERS, reverseStoreIssue, reverseProductionStock } = require('../stages');
const {
  wrap, http, str, num, reqStr, round2, today, dateOnly,
  ORDER_SELECT, getOrder, orderItems, logStage, billingFor,
} = require('../lib');

const router = express.Router();
router.use(a.requireAuth);

// ------------------------------------------------------------------ list view

router.get(
  '/',
  wrap(async (req, res) => {
    const { stage, status, q, mine } = req.query;
    const where = [];
    const args = [];

    if (stage && stage !== 'all') {
      if (stage === 'active') where.push(`o.status = 'active'`);
      else {
        where.push('o.current_stage = ?');
        args.push(str(stage));
      }
    }
    if (status && status !== 'all') {
      where.push('o.status = ?');
      args.push(str(status));
    }
    if (mine === '1') {
      const stages = wf.stagesForRole(req.user.role);
      if (stages.length) {
        where.push(`o.status = 'active' AND o.current_stage IN (${stages.map(() => '?').join(',')})`);
        args.push(...stages);
      }
    }
    if (q) {
      where.push('(o.order_no LIKE ? OR e.enquiry_no LIKE ? OR e.cust_name LIKE ? OR e.cust_company LIKE ? OR e.cust_phone LIKE ?)');
      const like = `%${str(q)}%`;
      args.push(like, like, like, like, like);
    }

    const rows = await db.all(
      `${ORDER_SELECT}
       ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
       ORDER BY o.id DESC LIMIT 500`,
      ...args
    );

    res.json({ orders: rows.map(decorate) });
  })
);

/** Count of orders sitting on each stage — powers the dashboard tiles. */
router.get(
  '/stage-counts',
  wrap(async (req, res) => {
    const counts = Object.fromEntries(wf.STAGE_KEYS.map((k) => [k, 0]));
    const rows = await db.all(
      `SELECT current_stage s, COUNT(*) n FROM orders WHERE status = 'active' GROUP BY current_stage`
    );
    for (const r of rows) counts[r.s] = r.n;
    res.json({ counts });
  })
);

// ------------------------------------------------------------------ full order

router.get(
  '/:id',
  wrap(async (req, res) => {
    const order = await getOrder(Number(req.params.id));
    if (!order) throw http(404, 'Order not found.');
    res.json({ order: await hydrate(order, req.user) });
  })
);

// ------------------------------------------------------- complete / edit stage

/**
 * Complete the stage the order is currently sitting on.
 * The order must actually be on that stage — this is what makes the workflow
 * unskippable, and it is enforced here rather than in the browser.
 */
router.post(
  '/:id/stage/:stage',
  a.requireWrite,
  wrap(async (req, res) => {
    const stageKey = req.params.stage;
    const stage = wf.STAGE_BY_KEY[stageKey];
    if (!stage) throw http(404, `Unknown workflow stage "${stageKey}".`);
    if (!wf.canDoStage(req.user, stageKey)) {
      throw http(403, `Only the ${stage.dept} department can complete "${stage.label}".`);
    }

    const order = await getOrder(Number(req.params.id));
    if (!order) throw http(404, 'Order not found.');
    if (order.status === 'lost') throw http(409, 'This order was closed as lost.');
    if (order.status === 'closed') throw http(409, 'This order is already complete and closed.');
    if (order.hold) throw http(409, `This order is on hold: ${order.hold_reason || 'no reason recorded'}. Resume it first.`);

    if (order.current_stage !== stageKey) {
      const pending = wf.stageLabel(order.current_stage);
      const iCur = wf.stageIndex(order.current_stage);
      const iReq = wf.stageIndex(stageKey);
      throw http(
        409,
        iReq > iCur
          ? `You cannot skip ahead. "${pending}" must be completed first.`
          : `"${stage.label}" is already complete. Ask an administrator to reopen it if it needs changing.`
      );
    }

    const result = await db.tx(async () => {
      const out = (await HANDLERS[stageKey]({ order, body: req.body || {}, user: req.user })) || {};

      let nextStage;
      if (out.terminal === 'lost') {
        nextStage = 'lost';
      } else if (out.terminal === 'closed') {
        nextStage = wf.TERMINAL.CLOSED;
        await db.run(
          `UPDATE orders SET current_stage = 'closed', status = 'closed', closed_at = datetime('now') WHERE id = ?`,
          order.id
        );
      } else if (out.redirectStage) {
        nextStage = out.redirectStage;
        await db.run('UPDATE orders SET current_stage = ? WHERE id = ?', nextStage, order.id);
      } else {
        nextStage = wf.nextStage(stageKey);
        if (nextStage === wf.TERMINAL.CLOSED) {
          await db.run(
            `UPDATE orders SET current_stage = 'closed', status = 'closed', closed_at = datetime('now') WHERE id = ?`,
            order.id
          );
        } else {
          await db.run('UPDATE orders SET current_stage = ? WHERE id = ?', nextStage, order.id);
        }
      }

      await logStage(order.id, stageKey, out.action || 'completed', req.user, out.note);
      return { nextStage, note: out.note };
    });

    await db.audit(req, `stage.${stageKey}`, 'order', order.id, { order_no: order.order_no, next: result.nextStage });
    res.json({
      ok: true,
      order: await hydrate(await getOrder(order.id), req.user),
      nextStage: result.nextStage,
      nextStageLabel: wf.stageLabel(result.nextStage),
      message: result.note,
    });
  })
);

/**
 * Re-save an already-completed stage without moving the order.
 * Only allowed while nothing physical has happened yet (i.e. before Store has
 * issued material), so corrections to costing/pricing/paperwork stay easy but
 * inventory history can never be rewritten behind the shop floor's back.
 */
router.post(
  '/:id/stage/:stage/revise',
  a.requireWrite,
  wrap(async (req, res) => {
    const stageKey = req.params.stage;
    const stage = wf.STAGE_BY_KEY[stageKey];
    if (!stage) throw http(404, `Unknown workflow stage "${stageKey}".`);
    if (!wf.canDoStage(req.user, stageKey)) {
      throw http(403, `Only the ${stage.dept} department can revise "${stage.label}".`);
    }

    const order = await getOrder(Number(req.params.id));
    if (!order) throw http(404, 'Order not found.');
    if (order.status !== 'active') throw http(409, 'This order is closed and cannot be revised.');

    const iReq = wf.stageIndex(stageKey);
    const iCur = wf.stageIndex(order.current_stage);
    if (iReq >= iCur) throw http(409, `"${stage.label}" is not yet complete — use the normal save instead.`);

    const REVISABLE_UNTIL = wf.stageIndex('store');
    if (!wf.isAdmin(req.user) && iCur > REVISABLE_UNTIL) {
      throw http(
        409,
        'Material has already been issued for this order, so earlier stages are locked. An administrator can reopen the stage if a correction is genuinely needed.'
      );
    }

    const result = await db.tx(async () => {
      const out = (await HANDLERS[stageKey]({ order, body: req.body || {}, user: req.user })) || {};
      if (out.terminal || out.redirectStage) {
        throw http(400, 'That decision cannot be changed by a revision. Ask an administrator to reopen the stage.');
      }
      await logStage(order.id, stageKey, 'revised', req.user, out.note);
      return out;
    });

    await db.audit(req, `stage.${stageKey}.revise`, 'order', order.id, { order_no: order.order_no });
    res.json({ ok: true, order: await hydrate(await getOrder(order.id), req.user), message: result.note });
  })
);

/**
 * Administrator rollback: send the order back to an earlier stage, clearing
 * everything after it. Stock movements caused by the cleared stages are
 * reversed with compensating ledger entries rather than deleted, so the
 * material history stays auditable.
 */
router.post(
  '/:id/rollback',
  wrap(async (req, res) => {
    if (!wf.isAdmin(req.user)) throw http(403, 'Only an administrator can reopen a completed stage.');
    const order = await getOrder(Number(req.params.id));
    if (!order) throw http(404, 'Order not found.');

    const targetStage = str(req.body.stage);
    if (!wf.STAGE_BY_KEY[targetStage]) throw http(400, 'Choose a valid stage to reopen.');
    const reason = reqStr(req.body.reason, 'Reason for reopening');

    const iTarget = wf.stageIndex(targetStage);
    const iCur = order.status === 'active' ? wf.stageIndex(order.current_stage) : wf.STAGE_KEYS.length;
    if (order.status === 'active' && iTarget >= iCur) {
      throw http(409, `"${wf.stageLabel(targetStage)}" is not complete yet — there is nothing to reopen.`);
    }

    await db.tx(async () => {
      // Reverse stock in the opposite order to how it was posted.
      const cleared = wf.STAGE_KEYS.slice(iTarget);
      if (cleared.includes('production')) {
        await reverseProductionStock(order, req.user, 'Reversed — production reopened by administrator');
      }
      if (cleared.includes('store')) {
        await reverseStoreIssue(order, req.user, 'Reversed — material issue reopened by administrator');
      }

      for (const key of cleared) {
        const s = wf.STAGE_BY_KEY[key];
        await db.run(`DELETE FROM ${s.table} WHERE order_id = ?`, order.id);
      }
      // Child rows of the cleared stages.
      const childTables = {
        costing: ['costing_bom', 'item_costings'],
        planning: ['planning_items'],
        store: ['store_issue_lines'],
        production: ['production_consumption', 'production_wastage', 'additional_materials', 'finished_goods'],
        qc: ['qc_items'],
        packing: ['packing_lines'],
      };
      for (const key of cleared) {
        for (const t of childTables[key] || []) await db.run(`DELETE FROM ${t} WHERE order_id = ?`, order.id);
      }
      if (cleared.includes('advance')) {
        await db.run(`DELETE FROM payments WHERE order_id = ? AND kind = 'advance'`, order.id);
      }
      if (cleared.includes('payment')) {
        await db.run(`DELETE FROM payments WHERE order_id = ? AND kind = 'final'`, order.id);
      }

      await db.run(
        `UPDATE orders SET current_stage = ?, status = 'active', closed_at = NULL WHERE id = ?`,
        targetStage, order.id
      );

      // If approval had marked the enquiry lost, put it back to converted.
      if (cleared.includes('approval')) {
        await db.run(
          `UPDATE enquiries SET status = 'converted', lost_reason = NULL, lost_reason_note = NULL WHERE id = ?`,
          order.enquiry_id
        );
      }

      await logStage(order.id, targetStage, 'reopened', req.user, `Reopened by admin: ${reason}`);
    });

    await db.audit(req, 'order.rollback', 'order', order.id, { order_no: order.order_no, to: targetStage, reason });
    res.json({ ok: true, order: await hydrate(await getOrder(order.id), req.user) });
  })
);

// ------------------------------------------------------------------ hold / notes

router.post(
  '/:id/hold',
  a.requireWrite,
  wrap(async (req, res) => {
    if (!wf.can(req.user, 'order.hold')) throw http(403, 'Your role cannot put an order on hold.');
    const order = await getOrder(Number(req.params.id));
    if (!order) throw http(404, 'Order not found.');
    if (order.status !== 'active') throw http(409, 'Only an active order can be put on hold.');
    const reason = reqStr(req.body.reason, 'Reason for the hold');
    await db.run('UPDATE orders SET hold = 1, hold_reason = ? WHERE id = ?', reason, order.id);
    await logStage(order.id, order.current_stage, 'hold', req.user, reason);
    await db.audit(req, 'order.hold', 'order', order.id, { reason });
    res.json({ ok: true, order: await hydrate(await getOrder(order.id), req.user) });
  })
);

router.post(
  '/:id/resume',
  a.requireWrite,
  wrap(async (req, res) => {
    if (!wf.can(req.user, 'order.hold')) throw http(403, 'Your role cannot resume an order.');
    const order = await getOrder(Number(req.params.id));
    if (!order) throw http(404, 'Order not found.');
    await db.run('UPDATE orders SET hold = 0, hold_reason = NULL WHERE id = ?', order.id);
    await logStage(order.id, order.current_stage, 'resume', req.user, str(req.body.note));
    await db.audit(req, 'order.resume', 'order', order.id, null);
    res.json({ ok: true, order: await hydrate(await getOrder(order.id), req.user) });
  })
);

router.patch(
  '/:id',
  a.requireWrite,
  wrap(async (req, res) => {
    const order = await getOrder(Number(req.params.id));
    if (!order) throw http(404, 'Order not found.');
    if (req.body.priority !== undefined) {
      const p = str(req.body.priority);
      if (!['Low', 'Normal', 'High', 'Urgent'].includes(p)) throw http(400, 'Unknown priority.');
      await db.run('UPDATE orders SET priority = ? WHERE id = ?', p, order.id);
      await db.audit(req, 'order.priority', 'order', order.id, { priority: p });
    }
    res.json({ ok: true, order: await hydrate(await getOrder(order.id), req.user) });
  })
);

router.post(
  '/:id/notes',
  a.requireWrite,
  wrap(async (req, res) => {
    const order = await getOrder(Number(req.params.id));
    if (!order) throw http(404, 'Order not found.');
    const body = reqStr(req.body.body, 'Note');
    await db.run(
      `INSERT INTO order_notes (order_id, stage, body, user_id, username) VALUES (?, ?, ?, ?, ?)`,
      order.id, str(req.body.stage) || order.current_stage, body, req.user.id, req.user.username
    );
    res.status(201).json({
      notes: await db.all('SELECT * FROM order_notes WHERE order_id = ? ORDER BY id DESC', order.id),
    });
  })
);

/** Extra part-payment against an order, outside the two workflow gates. */
router.post(
  '/:id/payments',
  a.requireRole('accounts', 'sales'),
  wrap(async (req, res) => {
    const order = await getOrder(Number(req.params.id));
    if (!order) throw http(404, 'Order not found.');
    const amount = num(req.body.amount);
    if (amount <= 0) throw http(400, 'Enter the amount received.');
    const { billed, paid } = await billingFor(order.id);
    if (billed > 0 && round2(num(paid) + amount) > round2(num(billed)) + 0.01) {
      throw http(400, `That would take receipts past the billed value of ₹${round2(billed).toLocaleString('en-IN')}.`);
    }
    const receiptNo = await db.tx(async () => {
      const rc = await db.nextDocNo('RCP');
      await db.run(
        `INSERT INTO payments (order_id, kind, receipt_no, amount, received_at, mode, reference, remarks, created_by)
         VALUES (?, 'part', ?, ?, ?, ?, ?, ?, ?)`,
        order.id, rc, round2(amount), dateOnly(req.body.received_at) || today(),
        str(req.body.mode) || 'Bank transfer', str(req.body.reference), str(req.body.remarks), req.user.id
      );
      return rc;
    });
    await db.audit(req, 'payment.part', 'order', order.id, { amount, receiptNo });
    res.status(201).json({ ok: true, receipt_no: receiptNo, order: await hydrate(await getOrder(order.id), req.user) });
  })
);

// ------------------------------------------------------------------- internals

/** Adds computed fields every list view needs. */
function decorate(o) {
  const billed = round2(num(o.invoice_total) || num(o.locked_total) || num(o.quote_total));
  const paid = round2(num(o.paid_total));
  return {
    ...o,
    hold: !!o.hold,
    stageLabel: wf.stageLabel(o.current_stage),
    stageIndex: wf.stageIndex(o.current_stage),
    stageTotal: wf.STAGE_KEYS.length,
    billed,
    paid,
    outstanding: round2(Math.max(0, billed - paid)),
    value: billed || round2(num(o.quote_total)),
  };
}

/** Full order payload: every stage record, items, history and notes. */
async function hydrate(o, user) {
  const order = decorate(o);
  order.items = await orderItems(o.id);

  order.costing = (await db.get('SELECT * FROM costings WHERE order_id = ?', o.id)) || null;
  if (order.costing) {
    const ics = await db.all('SELECT * FROM item_costings WHERE order_id = ? ORDER BY id', o.id);
    order.costing.itemCostings = [];
    for (const ic of ics) {
      order.costing.itemCostings.push({
        ...ic,
        bom: await db.all('SELECT * FROM costing_bom WHERE item_costing_id = ? ORDER BY id', ic.id),
      });
    }
  }

  order.planning = (await db.get('SELECT * FROM plannings WHERE order_id = ?', o.id)) || null;
  if (order.planning) {
    order.planning.items = await db.all('SELECT * FROM planning_items WHERE order_id = ? ORDER BY id', o.id);
  }

  order.quotation = (await db.get('SELECT * FROM quotations WHERE order_id = ?', o.id)) || null;
  order.approval = (await db.get('SELECT * FROM approvals WHERE order_id = ?', o.id)) || null;
  order.salesOrder = (await db.get('SELECT * FROM sales_orders WHERE order_id = ?', o.id)) || null;
  order.advance = (await db.get('SELECT * FROM advances WHERE order_id = ?', o.id)) || null;

  order.store = (await db.get('SELECT * FROM store_issues WHERE order_id = ?', o.id)) || null;
  if (order.store) {
    order.store.lines = await db.all('SELECT * FROM store_issue_lines WHERE order_id = ? ORDER BY id', o.id);
  }

  order.production = (await db.get('SELECT * FROM productions WHERE order_id = ?', o.id)) || null;
  if (order.production) {
    order.production.consumption = await db.all('SELECT * FROM production_consumption WHERE order_id = ? ORDER BY id', o.id);
    order.production.wastage = await db.all('SELECT * FROM production_wastage WHERE order_id = ? ORDER BY id', o.id);
    order.production.additionalMaterials = await db.all('SELECT * FROM additional_materials WHERE order_id = ? ORDER BY id', o.id);
  }

  order.qc = (await db.get('SELECT * FROM qc_checks WHERE order_id = ?', o.id)) || null;
  if (order.qc) order.qc.items = await db.all('SELECT * FROM qc_items WHERE order_id = ? ORDER BY id', o.id);

  order.packing = (await db.get('SELECT * FROM packings WHERE order_id = ?', o.id)) || null;
  if (order.packing) order.packing.boxes = await db.all('SELECT * FROM packing_lines WHERE order_id = ? ORDER BY id', o.id);

  order.dispatch = (await db.get('SELECT * FROM dispatches WHERE order_id = ?', o.id)) || null;
  order.invoice = (await db.get('SELECT * FROM invoices WHERE order_id = ?', o.id)) || null;
  order.payment = (await db.get('SELECT * FROM final_payments WHERE order_id = ?', o.id)) || null;
  order.gatepass = (await db.get('SELECT * FROM gate_passes WHERE order_id = ?', o.id)) || null;

  order.payments = await db.all('SELECT * FROM payments WHERE order_id = ? ORDER BY id', o.id);
  order.history = await db.all(
    `SELECT h.*, u.full_name AS user_name FROM stage_history h
     LEFT JOIN users u ON u.id = h.user_id WHERE h.order_id = ? ORDER BY h.id`,
    o.id
  );
  order.notes = await db.all('SELECT * FROM order_notes WHERE order_id = ? ORDER BY id DESC', o.id);
  order.finishedGoods = await db.all('SELECT * FROM finished_goods WHERE order_id = ? ORDER BY id', o.id);

  // What can this user do right now?
  order.canActOnCurrentStage =
    order.status === 'active' && !order.hold && wf.canDoStage(user, order.current_stage) && user.role !== 'management';
  order.currentStageDept = wf.STAGE_BY_KEY[order.current_stage] ? wf.STAGE_BY_KEY[order.current_stage].dept : null;

  return order;
}

module.exports = { router, hydrate, decorate };
