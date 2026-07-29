'use strict';

const express = require('express');
const db = require('../db');
const a = require('../auth');
const wf = require('../workflow');
const { wrap, num, round2, today } = require('../lib');

const router = express.Router();
router.use(a.requireAuth);

router.get(
  '/',
  wrap(async (req, res) => {
    const t = today();
    const monthStart = t.slice(0, 8) + '01';

    // -------------------------------------------------------------- today
    const todayStats = {
      enquiries: await one(`SELECT COUNT(*) n FROM enquiries WHERE date(enquiry_date) = ?`, t),
      quotations: await one(`SELECT COUNT(*) n FROM quotations WHERE date(quotation_date) = ?`, t),
      salesOrders: await one(`SELECT COUNT(*) n FROM sales_orders WHERE date(so_date) = ?`, t),
      deliveries: await one(`SELECT COUNT(*) n FROM dispatches WHERE date(dispatch_date) = ?`, t),
      lost: await one(`SELECT COUNT(*) n FROM enquiries WHERE status = 'lost' AND date(closed_at) = ?`, t),
      collected: await oneVal(`SELECT COALESCE(SUM(amount),0) v FROM payments WHERE date(received_at) = ?`, t),
      invoiced: await oneVal(`SELECT COALESCE(SUM(grand_total),0) v FROM invoices WHERE date(invoice_date) = ?`, t),
    };

    // ------------------------------------------------------------- month
    const monthStats = {
      enquiries: await one(`SELECT COUNT(*) n FROM enquiries WHERE date(enquiry_date) >= ?`, monthStart),
      converted: await one(`SELECT COUNT(*) n FROM enquiries WHERE status='converted' AND date(enquiry_date) >= ?`, monthStart),
      lost: await one(`SELECT COUNT(*) n FROM enquiries WHERE status='lost' AND date(enquiry_date) >= ?`, monthStart),
      invoiced: await oneVal(`SELECT COALESCE(SUM(grand_total),0) v FROM invoices WHERE date(invoice_date) >= ?`, monthStart),
      collected: await oneVal(`SELECT COALESCE(SUM(amount),0) v FROM payments WHERE date(received_at) >= ?`, monthStart),
      delivered: await one(`SELECT COUNT(*) n FROM dispatches WHERE date(dispatch_date) >= ?`, monthStart),
    };
    monthStats.conversionRate = monthStats.enquiries
      ? round2((monthStats.converted / monthStats.enquiries) * 100)
      : 0;

    // ------------------------------------------------ pipeline by stage
    const counts = Object.fromEntries(wf.STAGE_KEYS.map((k) => [k, { count: 0, value: 0 }]));
    const stageRows = await db.all(
      `SELECT o.current_stage s, COUNT(*) n,
              COALESCE(SUM(COALESCE(inv.grand_total, so.locked_total, q.grand_total, 0)),0) v
       FROM orders o
       LEFT JOIN quotations q ON q.order_id = o.id
       LEFT JOIN sales_orders so ON so.order_id = o.id
       LEFT JOIN invoices inv ON inv.order_id = o.id
       WHERE o.status = 'active' GROUP BY o.current_stage`
    );
    for (const r of stageRows) {
      if (counts[r.s]) counts[r.s] = { count: r.n, value: round2(r.v) };
    }
    const pipeline = wf.STAGES.map((s) => ({
      key: s.key,
      step: s.step,
      label: s.label,
      short: s.short,
      dept: s.dept,
      mine: wf.canDoStage(req.user, s.key),
      count: counts[s.key].count,
      value: counts[s.key].value,
    }));

    // ----------------------------------------------------------- headline
    const openEnquiries = await one(`SELECT COUNT(*) n FROM enquiries WHERE status = 'open'`);
    const activeOrders = await one(`SELECT COUNT(*) n FROM orders WHERE status = 'active'`);
    const onHold = await one(`SELECT COUNT(*) n FROM orders WHERE status = 'active' AND hold = 1`);
    const closedOrders = await one(`SELECT COUNT(*) n FROM orders WHERE status = 'closed'`);
    const lostOrders = await one(`SELECT COUNT(*) n FROM orders WHERE status = 'lost'`);

    const receivables = await db.get(
      `SELECT COALESCE(SUM(billed - paid), 0) v, COUNT(*) n FROM (
         SELECT COALESCE(inv.grand_total, so.locked_total, 0) AS billed,
                (SELECT COALESCE(SUM(amount),0) FROM payments p WHERE p.order_id = o.id) AS paid
         FROM orders o
         LEFT JOIN invoices inv ON inv.order_id = o.id
         LEFT JOIN sales_orders so ON so.order_id = o.id
         WHERE o.status <> 'lost' AND COALESCE(inv.grand_total, so.locked_total, 0) > 0
       ) WHERE billed - paid > 0.01`
    );

    const lowStock = await db.all(
      `SELECT id, name, unit, qty_in_stock, reorder_level FROM materials
       WHERE active = 1 AND ((reorder_level > 0 AND qty_in_stock <= reorder_level) OR qty_in_stock < 0)
       ORDER BY (qty_in_stock - reorder_level) LIMIT 12`
    );

    const stockValue = await oneVal(`SELECT COALESCE(SUM(qty_in_stock * standard_rate),0) v FROM materials WHERE active = 1`);
    const fgUnits = await oneVal(`SELECT COALESCE(SUM(qty),0) v FROM finished_goods WHERE status = 'in_stock'`);

    // --------------------------------------------------- my work queue
    const myStages = wf.stagesForRole(req.user.role);
    const myQueueRows = myStages.length
      ? await db.all(
          `SELECT o.id AS order_id, o.order_no, o.current_stage, o.priority, o.hold, o.hold_reason,
                  e.cust_name, e.cust_city, pl.delivery_date,
                  COALESCE(inv.grand_total, so.locked_total, q.grand_total, 0) AS value,
                  COALESCE((SELECT MAX(h.at) FROM stage_history h WHERE h.order_id = o.id), o.created_at) AS since
           FROM orders o
           JOIN enquiries e ON e.id = o.enquiry_id
           LEFT JOIN plannings pl ON pl.order_id = o.id
           LEFT JOIN quotations q ON q.order_id = o.id
           LEFT JOIN sales_orders so ON so.order_id = o.id
           LEFT JOIN invoices inv ON inv.order_id = o.id
           WHERE o.status = 'active' AND o.current_stage IN (${myStages.map(() => '?').join(',')})
           ORDER BY CASE o.priority WHEN 'Urgent' THEN 0 WHEN 'High' THEN 1 WHEN 'Normal' THEN 2 ELSE 3 END,
                    pl.delivery_date, o.id`,
          ...myStages
        )
      : [];
    const myQueue = myQueueRows.map((r) => ({
      ...r,
      hold: !!r.hold,
      stageLabel: wf.stageLabel(r.current_stage),
      waitingDays: Math.max(0, Math.round((Date.now() - new Date(r.since + 'Z').getTime()) / 864e5)),
      overdue: !!(r.delivery_date && r.delivery_date < t),
    }));

    // -------------------------------------------------- 14-day trend chart
    const trend = await db.all(
      `WITH d(day) AS (
         SELECT date('now', '-13 days')
         UNION ALL SELECT date(day, '+1 day') FROM d WHERE day < date('now')
       )
       SELECT d.day,
         (SELECT COUNT(*) FROM enquiries e WHERE date(e.enquiry_date) = d.day) AS enquiries,
         (SELECT COUNT(*) FROM sales_orders s WHERE date(s.so_date) = d.day) AS orders,
         (SELECT COUNT(*) FROM dispatches x WHERE date(x.dispatch_date) = d.day) AS deliveries,
         (SELECT COALESCE(SUM(i.grand_total),0) FROM invoices i WHERE date(i.invoice_date) = d.day) AS invoiced
       FROM d ORDER BY d.day`
    );

    // ---------------------------------------------------- overdue orders
    const overdueRows = await db.all(
      `SELECT o.id AS order_id, o.order_no, e.cust_name, pl.delivery_date, o.current_stage,
              CAST(julianday('now') - julianday(pl.delivery_date) AS INTEGER) AS days_late
       FROM orders o
       JOIN enquiries e ON e.id = o.enquiry_id
       JOIN plannings pl ON pl.order_id = o.id
       WHERE o.status = 'active' AND date(pl.delivery_date) < date('now')
       ORDER BY pl.delivery_date LIMIT 10`
    );
    const overdue = overdueRows.map((r) => ({ ...r, stageLabel: wf.stageLabel(r.current_stage) }));

    const recentRows = await db.all(
      `SELECT h.*, o.order_no, e.cust_name, u.full_name AS user_name
       FROM stage_history h
       JOIN orders o ON o.id = h.order_id
       JOIN enquiries e ON e.id = o.enquiry_id
       LEFT JOIN users u ON u.id = h.user_id
       ORDER BY h.id DESC LIMIT 15`
    );
    const recentActivity = recentRows.map((r) => ({ ...r, stageLabel: wf.stageLabel(r.stage) }));

    res.json({
      today: todayStats,
      month: monthStats,
      headline: {
        openEnquiries,
        activeOrders,
        onHold,
        closedOrders,
        lostOrders,
        outstanding: round2(receivables.v),
        outstandingCount: receivables.n,
        stockValue: round2(stockValue),
        finishedGoodsUnits: round2(fgUnits),
        lowStockCount: lowStock.length,
      },
      pipeline,
      myQueue,
      myStages,
      lowStock,
      overdue,
      trend,
      recentActivity,
    });
  })
);

async function one(sql, ...args) {
  const row = await db.get(sql, ...args);
  return row.n;
}

async function oneVal(sql, ...args) {
  const row = await db.get(sql, ...args);
  return num(row.v);
}

module.exports = router;
