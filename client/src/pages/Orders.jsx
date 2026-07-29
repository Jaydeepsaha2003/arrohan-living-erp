import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, qs } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Alert, Badge, Card, DataTable, Empty, Loading, PageHead, SegmentedControl, Select, StatusBadge } from '../ui/kit.jsx';
import { money, fmtDate, todayStr } from '../format.js';
import { QueueTable } from './Dashboard.jsx';
import { IconLayers, IconCheckCircle } from '../ui/Icons.jsx';

export function OrderList() {
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const { meta } = useAuth();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const status = params.get('status') || 'active';
  const stage = params.get('stage') || 'all';

  useEffect(() => {
    setRows(null);
    api
      .get(`/orders${qs({ status: status === 'all' ? undefined : status, stage: stage === 'all' ? undefined : stage })}`)
      .then((d) => setRows(d.orders))
      .catch((e) => setError(e.message));
  }, [status, stage]);

  function setParam(k, v) {
    const next = new URLSearchParams(params);
    if (!v || v === 'all') next.delete(k);
    else next.set(k, v);
    setParams(next, { replace: true });
  }

  if (error) return <div className="content-inner"><Alert tone="bad" title="Could not load orders">{error}</Alert></div>;

  const stageLabel = stage !== 'all' ? meta.stages.find((s) => s.key === stage)?.label : null;

  return (
    <div className="content-inner">
      <PageHead
        title="Orders"
        desc={
          stageLabel
            ? `Orders currently sitting at “${stageLabel}”.`
            : 'Every order that has been sent to the factory, with the stage it is waiting at.'
        }
      >
        <SegmentedControl
          value={status}
          onChange={(v) => setParam('status', v)}
          options={[
            { value: 'active', label: 'Active' },
            { value: 'closed', label: 'Completed' },
            { value: 'lost', label: 'Lost' },
            { value: 'all', label: 'All' },
          ]}
        />
        <Select
          value={stage}
          onChange={(e) => setParam('stage', e.target.value)}
          style={{ width: 210 }}
          options={[
            { value: 'all', label: 'All stages' },
            ...meta.stages.map((s) => ({ value: s.key, label: `${s.step}. ${s.label}` })),
          ]}
        />
      </PageHead>

      {!rows ? (
        <Loading pad={60} />
      ) : (
        <Card flush>
          <div style={{ padding: 'var(--s5)' }}>
            <DataTable
              rows={rows}
              exportName={`orders-${status}`}
              searchPlaceholder="Search by order number, enquiry, customer, phone…"
              onRowClick={(r) => nav(`/orders/${r.id}`)}
              rowKey={(r) => r.id}
              empty={
                <Empty title={status === 'active' ? 'No active orders' : `No ${status} orders`}>
                  {status === 'active'
                    ? 'Send an enquiry to the factory to open the first order.'
                    : 'Nothing to show in this list.'}
                </Empty>
              }
              columns={[
                { key: 'order_no', label: 'Order no', render: (r) => <span className="mono strong">{r.order_no}</span> },
                { key: 'created_at', label: 'Opened', type: 'date' },
                {
                  key: 'cust_name',
                  label: 'Customer',
                  render: (r) => (
                    <div>
                      <div className="strong truncate" style={{ maxWidth: 200 }}>{r.cust_name}</div>
                      {r.cust_company && <div className="tiny dim truncate" style={{ maxWidth: 200 }}>{r.cust_company}</div>}
                    </div>
                  ),
                },
                { key: 'cust_city', label: 'City' },
                {
                  key: 'stageLabel',
                  label: 'Stage',
                  render: (r) =>
                    r.status === 'active' ? (
                      <span className="row-tight">
                        <Badge tone={r.hold ? 'warn' : 'brand'}>{r.hold ? 'On hold' : r.stageLabel}</Badge>
                      </span>
                    ) : (
                      <StatusBadge value={r.status} />
                    ),
                },
                {
                  key: 'stageIndex',
                  label: 'Progress',
                  type: 'num',
                  render: (r) => {
                    const pct = r.status === 'closed' ? 100 : Math.round((Math.max(0, r.stageIndex) / r.stageTotal) * 100);
                    return (
                      <span className="row-tight" style={{ justifyContent: 'flex-end', gap: 6 }}>
                        <span className="bar-track" style={{ width: 52, height: 5 }}>
                          <span
                            className="bar-fill"
                            style={{ width: `${pct}%`, background: r.status === 'lost' ? 'var(--bad-fg)' : r.status === 'closed' ? 'var(--ok-fg)' : 'var(--brand-500)' }}
                          />
                        </span>
                        <span className="tiny dim" style={{ width: 28 }}>{pct}%</span>
                      </span>
                    );
                  },
                },
                {
                  key: 'delivery_date',
                  label: 'Promised',
                  render: (r) => {
                    const d = r.stage_delivery || null;
                    return d ? fmtDate(d) : <span className="dim">—</span>;
                  },
                  sortable: false,
                },
                { key: 'priority', label: 'Priority', type: 'status' },
                { key: 'value', label: 'Value', type: 'money' },
                { key: 'paid', label: 'Received', type: 'money' },
                { key: 'outstanding', label: 'Outstanding', type: 'money' },
              ]}
            />
          </div>
        </Card>
      )}
    </div>
  );
}

/* --------------------------------------------------------------- work queue */

export function WorkQueue() {
  const nav = useNavigate();
  const { user, meta, readOnly } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/dashboard').then(setData).catch((e) => setError(e.message));
  }, []);

  const myStageLabels = useMemo(
    () => meta.stages.filter((s) => s.mine).map((s) => `${s.step}. ${s.label}`),
    [meta]
  );

  if (error) return <div className="content-inner"><Alert tone="bad" title="Could not load your queue">{error}</Alert></div>;
  if (!data) return <Loading pad={80} />;

  const overdue = data.myQueue.filter((o) => o.overdue).length;
  const stale = data.myQueue.filter((o) => o.waitingDays > 3).length;

  return (
    <div className="content-inner">
      <PageHead
        title="My work queue"
        desc={
          readOnly
            ? 'Management view — every active order and the department it is waiting on.'
            : `Orders where ${user.roleLabel} is the next step: ${myStageLabels.join(' · ') || 'no workflow stages assigned to your role'}.`
        }
      />

      <div className="stack">
        {data.myQueue.length > 0 && (
          <div className="stat-grid">
            <div className="stat">
              <span className="stat-accent" />
              <span className="stat-label">Waiting on you</span>
              <span className="stat-value">{data.myQueue.length}</span>
            </div>
            <div className="stat">
              <span className="stat-label">Waiting more than 3 days</span>
              <span className="stat-value" style={{ color: stale ? 'var(--warn-fg)' : undefined }}>{stale}</span>
            </div>
            <div className="stat">
              <span className="stat-label">Past promised delivery</span>
              <span className="stat-value" style={{ color: overdue ? 'var(--bad-fg)' : undefined }}>{overdue}</span>
            </div>
            <div className="stat">
              <span className="stat-label">Value in your hands</span>
              <span className="stat-value" style={{ fontSize: 'var(--fs-xl)' }}>
                {money(data.myQueue.reduce((s, o) => s + Number(o.value || 0), 0))}
              </span>
            </div>
          </div>
        )}

        <Card flush>
          {data.myQueue.length === 0 ? (
            <div style={{ padding: 'var(--s6)' }}>
              <Empty icon={IconCheckCircle} title="Your queue is clear">
                {readOnly
                  ? 'No active order is waiting at any department right now.'
                  : 'Nothing is waiting on your department. New orders appear here the moment the previous step is approved.'}
              </Empty>
            </div>
          ) : (
            <div style={{ padding: 'var(--s5)' }}>
              <QueueTable rows={data.myQueue} onOpen={(o) => nav(`/orders/${o.order_id}`)} />
            </div>
          )}
        </Card>

        {readOnly && data.pipeline.some((s) => s.count > 0) && (
          <Card title="Department workload" sub="Orders held at each stage">
            <div className="table-wrap">
              <table className="tbl compact">
                <thead>
                  <tr>
                    <th>Stage</th>
                    <th>Department</th>
                    <th className="right">Orders</th>
                    <th className="right">Value held</th>
                  </tr>
                </thead>
                <tbody>
                  {data.pipeline.filter((s) => s.count > 0).map((s) => (
                    <tr key={s.key} className="clickable" onClick={() => nav(`/orders?stage=${s.key}`)}>
                      <td className="strong">{s.step}. {s.label}</td>
                      <td className="small muted">{s.dept}</td>
                      <td className="num">{s.count}</td>
                      <td className="num">{money(s.value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
