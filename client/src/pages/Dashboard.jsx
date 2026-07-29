import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import {
  Alert, Badge, Card, Empty, LineChart, Loading, PageHead, Stat, StageFunnel, DataTable,
} from '../ui/kit.jsx';
import { money, moneyShort, fmtDate, relTime, qty } from '../format.js';
import { IconAlert, IconArrowRight, IconCheckCircle, IconClock, IconLayers } from '../ui/Icons.jsx';

export default function Dashboard() {
  const { user, readOnly } = useAuth();
  const nav = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    api
      .get('/dashboard')
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, []);

  if (error) return <div className="content-inner"><Alert tone="bad" title="Could not load the dashboard">{error}</Alert></div>;
  if (!data) return <Loading label="Loading the dashboard…" pad={80} />;

  const { today, month, headline, pipeline, myQueue, lowStock, overdue, trend, recentActivity } = data;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="content-inner">
      <PageHead title={`${greeting}, ${user.fullName.split(' ')[0]}`} desc={`${user.roleLabel}${readOnly ? ' · read-only view' : ''} · ${fmtDate(new Date().toISOString())}`}>
        <Link to="/queue" className="btn btn-primary">
          <IconLayers size={15} /> My work queue {myQueue.length ? `(${myQueue.length})` : ''}
        </Link>
      </PageHead>

      <div className="stack">
        {/* ------------------------------------------------------ my queue */}
        {myQueue.length > 0 ? (
          <Card
            title={`Waiting on you — ${myQueue.length} order${myQueue.length === 1 ? '' : 's'}`}
            sub="Your department is the next step for these orders"
            action={
              myQueue.length > 5 && (
                <Link to="/queue" className="btn btn-sm">
                  See all <IconArrowRight size={13} />
                </Link>
              )
            }
            flush
          >
            <QueueTable rows={myQueue.slice(0, 5)} onOpen={(o) => nav(`/orders/${o.order_id}`)} />
          </Card>
        ) : (
          <Card>
            <div className="row" style={{ gap: 12 }}>
              <IconCheckCircle size={20} style={{ color: 'var(--ok-fg)', flex: 'none' }} />
              <div>
                <div className="strong">Nothing is waiting on {readOnly ? 'the floor' : 'you'}</div>
                <div className="small muted">
                  {readOnly
                    ? 'No active order is sitting idle at a department right now.'
                    : 'Every order at your stage has been actioned. New work will appear here automatically.'}
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* -------------------------------------------------------- today */}
        <div>
          <div className="section-title">Today</div>
          <div className="stat-grid">
            <Stat label="Enquiries received" value={today.enquiries} />
            <Stat label="Quotations made" value={today.quotations} />
            <Stat label="Orders confirmed" value={today.salesOrders} />
            <Stat label="Deliveries dispatched" value={today.deliveries} />
            <Stat label="Invoiced" value={today.invoiced} format="money" meta="today" />
            <Stat label="Collected" value={today.collected} format="money" meta="today" />
            <Stat label="Marked lost" value={today.lost} tone={today.lost > 0 ? 'alert' : undefined} />
          </div>
        </div>

        {/* ------------------------------------------------------ headline */}
        <div>
          <div className="section-title">Business position</div>
          <div className="stat-grid">
            <Stat label="Open enquiries" value={headline.openEnquiries} onClick={() => nav('/enquiries')} accent="var(--info-fg)" />
            <Stat label="Active orders" value={headline.activeOrders} onClick={() => nav('/orders')} accent="var(--brand-500)" />
            <Stat
              label="Outstanding receivable"
              value={headline.outstanding}
              format="money"
              meta={`${headline.outstandingCount} order${headline.outstandingCount === 1 ? '' : 's'}`}
              onClick={() => nav('/reports/outstanding')}
              accent="var(--warn-fg)"
            />
            <Stat label="Raw material stock value" value={headline.stockValue} format="money" onClick={() => nav('/inventory')} />
            <Stat
              label="Finished goods in factory"
              value={qty(headline.finishedGoodsUnits)}
              meta="units awaiting dispatch"
              onClick={() => nav('/reports/finished-goods')}
            />
            <Stat
              label="Materials below reorder"
              value={headline.lowStockCount}
              tone={headline.lowStockCount > 0 ? 'alert' : undefined}
              onClick={() => nav('/reports/low-stock')}
            />
            <Stat label="Orders completed" value={headline.closedOrders} accent="var(--ok-fg)" />
            <Stat label="Orders on hold" value={headline.onHold} tone={headline.onHold > 0 ? 'alert' : undefined} />
          </div>
        </div>

        {/* ------------------------------------------- pipeline + trend */}
        <div className="grid grid-split">
          <Card title="Pipeline by stage" sub="Where every active order is sitting right now">
            {headline.activeOrders ? (
              <StageFunnel stages={pipeline} onPick={(s) => nav(`/orders?stage=${s.key}`)} />
            ) : (
              <Empty title="No active orders">Send an enquiry to the factory to start the workflow.</Empty>
            )}
          </Card>

          <div className="stack">
            <Card title="Last 14 days" sub="Enquiries, confirmed orders and deliveries">
              <LineChart
                data={trend}
                xKey="day"
                height={168}
                valueFormat={money}
                series={[
                  { key: 'enquiries', label: 'Enquiries', color: 'var(--info-fg)' },
                  { key: 'orders', label: 'Orders confirmed', color: 'var(--brand-600)' },
                  { key: 'deliveries', label: 'Deliveries', color: 'var(--ok-fg)' },
                ]}
              />
            </Card>

            <Card title="This month so far">
              <div className="grid grid-3" style={{ gap: 14 }}>
                <MonthFig label="Enquiries" value={month.enquiries} />
                <MonthFig label="Converted" value={month.converted} sub={`${month.conversionRate}% conversion`} />
                <MonthFig label="Lost" value={month.lost} />
                <MonthFig label="Deliveries" value={month.delivered} />
                <MonthFig label="Invoiced" value={moneyShort(month.invoiced)} />
                <MonthFig label="Collected" value={moneyShort(month.collected)} />
              </div>
            </Card>
          </div>
        </div>

        {/* ------------------------------------------------------- alerts */}
        {(overdue.length > 0 || lowStock.length > 0) && (
          <div className="grid grid-2" style={{ alignItems: 'start' }}>
            {overdue.length > 0 && (
              <Card
                title="Past the promised delivery date"
                sub={`${overdue.length} order${overdue.length === 1 ? '' : 's'} running late`}
                flush
              >
                <div className="table-wrap">
                  <table className="tbl compact">
                    <thead>
                      <tr>
                        <th>Order</th>
                        <th>Customer</th>
                        <th>Promised</th>
                        <th>Stage</th>
                        <th className="right">Late by</th>
                      </tr>
                    </thead>
                    <tbody>
                      {overdue.map((o) => (
                        <tr key={o.order_id} className="clickable" onClick={() => nav(`/orders/${o.order_id}`)}>
                          <td className="mono">{o.order_no}</td>
                          <td className="truncate" style={{ maxWidth: 150 }}>{o.cust_name}</td>
                          <td>{fmtDate(o.delivery_date)}</td>
                          <td className="small">{o.stageLabel}</td>
                          <td className="num">
                            <Badge tone={o.days_late > 7 ? 'bad' : 'warn'}>{o.days_late}d</Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}

            {lowStock.length > 0 && (
              <Card
                title="Materials at or below reorder level"
                sub="Raise a purchase order before production stops"
                action={
                  <Link to="/purchase" className="btn btn-sm">
                    Purchase <IconArrowRight size={13} />
                  </Link>
                }
                flush
              >
                <div className="table-wrap">
                  <table className="tbl compact">
                    <thead>
                      <tr>
                        <th>Material</th>
                        <th className="right">In stock</th>
                        <th className="right">Reorder at</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {lowStock.map((m) => (
                        <tr key={m.id}>
                          <td className="truncate" style={{ maxWidth: 210 }}>{m.name}</td>
                          <td className="num">{qty(m.qty_in_stock)} {m.unit}</td>
                          <td className="num dim">{qty(m.reorder_level)}</td>
                          <td className="right">
                            {Number(m.qty_in_stock) < 0 ? <Badge tone="bad">Negative</Badge> : <Badge tone="warn">Low</Badge>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          </div>
        )}

        {/* ----------------------------------------------------- activity */}
        {recentActivity.length > 0 && (
          <Card title="Recent activity" sub="The last steps completed across every department">
            <div className="timeline">
              {recentActivity.map((h) => (
                <div key={h.id} className={`tl-item ${h.action === 'completed' ? 'done' : h.action}`}>
                  <span className="tl-dot" />
                  <div className="between wrap" style={{ gap: 8 }}>
                    <div className="grow" style={{ minWidth: 0 }}>
                      <div className="tl-title">
                        <Link to={`/orders/${h.order_id}`} className="mono">{h.order_no}</Link>
                        {' · '}
                        {h.stageLabel}
                        {h.action === 'rejected' && <Badge tone="bad">Rejected</Badge>}
                        {h.action === 'reopened' && <Badge tone="warn">Reopened</Badge>}
                      </div>
                      <div className="tl-meta truncate">
                        {h.cust_name}
                        {h.note ? ` — ${h.note}` : ''}
                      </div>
                    </div>
                    <div className="tiny dim nowrap">
                      {h.user_name || '—'} · {relTime(h.at)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

function MonthFig({ label, value, sub }) {
  return (
    <div>
      <div className="uplabel" style={{ fontSize: 10 }}>{label}</div>
      <div style={{ fontSize: 'var(--fs-xl)', fontWeight: 600, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>
        {typeof value === 'number' ? value.toLocaleString('en-IN') : value}
      </div>
      {sub && <div className="tiny dim">{sub}</div>}
    </div>
  );
}

export function QueueTable({ rows, onOpen }) {
  return (
    <DataTable
      searchable={false}
      pageSize={0}
      rows={rows}
      rowKey={(r) => r.order_id}
      onRowClick={onOpen}
      columns={[
        { key: 'order_no', label: 'Order', render: (r) => <span className="mono strong">{r.order_no}</span> },
        { key: 'cust_name', label: 'Customer', render: (r) => (
          <div>
            <div className="truncate" style={{ maxWidth: 220 }}>{r.cust_name}</div>
            {r.cust_city && <div className="tiny dim">{r.cust_city}</div>}
          </div>
        ) },
        { key: 'stageLabel', label: 'Your step', render: (r) => <Badge tone="brand">{r.stageLabel}</Badge> },
        { key: 'waitingDays', label: 'Waiting', type: 'num', render: (r) => (
          <span className="row-tight" style={{ justifyContent: 'flex-end' }}>
            <IconClock size={12} style={{ color: r.waitingDays > 3 ? 'var(--warn-fg)' : 'var(--text-3)' }} />
            {r.waitingDays}d
          </span>
        ) },
        { key: 'delivery_date', label: 'Promised', render: (r) =>
          r.delivery_date ? (
            <span className={r.overdue ? '' : 'muted'} style={r.overdue ? { color: 'var(--bad-fg)', fontWeight: 600 } : undefined}>
              {fmtDate(r.delivery_date)}
              {r.overdue && ' ⚠'}
            </span>
          ) : (
            <span className="dim">—</span>
          ) },
        { key: 'priority', label: 'Priority', type: 'status' },
        { key: 'value', label: 'Value', type: 'money' },
        { key: '_go', label: '', sortable: false, render: (r) =>
          r.hold ? <Badge tone="warn">On hold</Badge> : <IconArrowRight size={14} style={{ color: 'var(--text-3)' }} /> },
      ]}
    />
  );
}
