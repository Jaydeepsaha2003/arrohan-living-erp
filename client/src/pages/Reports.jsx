import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, qs } from '../api.js';
import {
  Alert, BarList, Card, DataTable, Empty, Field, Input, Loading, PageHead,
  SegmentedControl, Select, StatusBadge,
} from '../ui/kit.jsx';
import { money, fmtDate, todayStr, monthStartStr, addDaysStr } from '../format.js';
import { IconChart, IconDownload, IconPrint, IconArrowLeft, IconArrowRight } from '../ui/Icons.jsx';

/* ------------------------------------------------------------ report catalogue */

export function ReportIndex() {
  const nav = useNavigate();
  const [reports, setReports] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/reports').then((d) => setReports(d.reports)).catch((e) => setError(e.message));
  }, []);

  const groups = useMemo(() => {
    if (!reports) return [];
    const by = {};
    for (const r of reports) (by[r.group] = by[r.group] || []).push(r);
    const order = ['Sales', 'Factory', 'Store', 'Logistics', 'Accounts', 'Management'];
    return Object.entries(by).sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]));
  }, [reports]);

  if (error) return <div className="content-inner"><Alert tone="bad" title="Could not load the report list">{error}</Alert></div>;
  if (!reports) return <Loading pad={80} />;

  return (
    <div className="content-inner">
      <PageHead
        title="Reports"
        desc={`${reports.length} reports covering enquiries, the factory floor, stock, logistics and accounts. Every report exports to CSV and prints cleanly.`}
      />
      <div className="stack">
        {groups.map(([group, list]) => (
          <div key={group}>
            <div className="section-title">{group}</div>
            <div className="grid grid-3">
              {list.map((r) => (
                <button key={r.key} type="button" className="stat" onClick={() => nav(`/reports/${r.key}`)} style={{ gap: 6 }}>
                  <span className="row-tight" style={{ gap: 8 }}>
                    <IconChart size={15} style={{ color: 'var(--brand-600)', flex: 'none' }} />
                    <span style={{ fontWeight: 650, fontSize: 'var(--fs-md)' }}>{r.title}</span>
                  </span>
                  <span className="small muted" style={{ lineHeight: 1.45 }}>{r.desc}</span>
                  {r.dated && <span className="tiny dim">Date range applies</span>}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- report view */

const PRESETS = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'Last 7 days' },
  { value: 'month', label: 'This month' },
  { value: 'quarter', label: 'Last 90 days' },
  { value: 'all', label: 'All time' },
];

function rangeFor(preset) {
  const t = todayStr();
  switch (preset) {
    case 'today': return { from: t, to: t };
    case 'week': return { from: addDaysStr(-6), to: t };
    case 'month': return { from: monthStartStr(), to: t };
    case 'quarter': return { from: addDaysStr(-89), to: t };
    default: return { from: '1900-01-01', to: '2999-12-31' };
  }
}

export function ReportView() {
  const { key } = useParams();
  const nav = useNavigate();
  const [preset, setPreset] = useState('month');
  const [custom, setCustom] = useState(null);
  const [extra, setExtra] = useState({});
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const range = custom || rangeFor(preset);

  useEffect(() => {
    setData(null);
    setError('');
    api
      .get(`/reports/${key}${qs({ ...range, ...extra })}`)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [key, range.from, range.to, JSON.stringify(extra)]);

  if (error) return <div className="content-inner"><Alert tone="bad" title="Could not run this report">{error}</Alert></div>;
  if (!data) return <Loading label="Running the report…" pad={80} />;

  const columns = data.columns.map((c) => ({
    ...c,
    render: c.link === 'order'
      ? (r) =>
          r.order_id ? (
            <Link to={`/orders/${r.order_id}`} className="mono small" onClick={(e) => e.stopPropagation()}>
              {r[c.key] || 'Open'}
            </Link>
          ) : (
            <span className="dim">—</span>
          )
      : undefined,
  }));

  return (
    <div className="content-inner wide">
      <PageHead title={data.title} desc={data.desc}>
        <Link to="/reports" className="btn">
          <IconArrowLeft size={14} /> All reports
        </Link>
        <a className="btn" href={`/api/reports/${key}/export.csv${qs({ ...range, ...extra })}`}>
          <IconDownload size={14} /> Export CSV
        </a>
        <button type="button" className="btn" onClick={() => window.print()}>
          <IconPrint size={14} /> Print
        </button>
      </PageHead>

      <div className="stack">
        {data.dated && (
          <Card>
            <div className="between wrap">
              <div className="row-tight wrap">
                <SegmentedControl
                  value={custom ? 'custom' : preset}
                  onChange={(v) => {
                    setCustom(null);
                    setPreset(v);
                  }}
                  options={PRESETS}
                />
                <span className="small dim">or</span>
                <div className="row-tight grow" style={{ maxWidth: 330 }}>
                  <Input
                    type="date"
                    value={range.from === '1900-01-01' ? '' : range.from}
                    onChange={(e) => setCustom({ from: e.target.value || '1900-01-01', to: range.to })}
                    style={{ flex: '1 1 128px', minWidth: 0 }}
                  />
                  <span className="dim">to</span>
                  <Input
                    type="date"
                    value={range.to === '2999-12-31' ? '' : range.to}
                    onChange={(e) => setCustom({ from: range.from, to: e.target.value || '2999-12-31' })}
                    style={{ flex: '1 1 128px', minWidth: 0 }}
                  />
                </div>
              </div>
              <span className="small dim">
                {range.from === '1900-01-01' ? 'All time' : `${fmtDate(range.from)} — ${fmtDate(range.to)}`}
              </span>
            </div>
          </Card>
        )}

        {data.filters?.map((f) => (
          <Card key={f.key}>
            <Field label={f.label}>
              <Select
                value={extra[f.key] ?? f.options[0].value}
                onChange={(e) => setExtra((x) => ({ ...x, [f.key]: e.target.value }))}
                options={f.options}
                style={{ maxWidth: 260 }}
              />
            </Field>
          </Card>
        ))}

        {data.summary.length > 0 && (
          <div className="stat-grid">
            {data.summary.map((s) => (
              <div className="stat" key={s.label}>
                <span className="stat-label">{s.label}</span>
                <span className="stat-value" style={{ fontSize: s.type === 'money' ? 'var(--fs-xl)' : undefined }}>
                  {s.type === 'money' ? money(s.value) : typeof s.value === 'number' ? s.value.toLocaleString('en-IN') : s.value}
                </span>
              </div>
            ))}
          </div>
        )}

        {data.breakdown && data.breakdown.rows.length > 0 && (
          <Card title={data.breakdown.title}>
            <BarList
              rows={data.breakdown.rows}
              labelKey="label"
              valueKey={data.breakdown.rows[0].value !== undefined ? 'value' : 'count'}
              format={data.breakdown.rows[0].value !== undefined ? (v) => money(v) : undefined}
            />
          </Card>
        )}

        <Card flush>
          <div style={{ padding: 'var(--s5)' }}>
            <DataTable
              rows={data.rows}
              totals={data.totals}
              columns={columns}
              exportName={key}
              pageSize={50}
              compact={data.columns.length > 8}
              rowKey={(r, i) => `${r.id ?? r.order_id ?? ''}-${i}`}
              onRowClick={data.rows.some((r) => r.order_id) ? (r) => r.order_id && nav(`/orders/${r.order_id}`) : undefined}
              empty={
                <Empty icon={IconChart} title="No rows for this period">
                  {data.dated ? 'Widen the date range, or check back once more work has been recorded.' : 'Nothing to report yet.'}
                </Empty>
              }
            />
          </div>
        </Card>

        <p className="tiny dim center">
          Generated {fmtDate(data.generatedAt)} · {data.rows.length} row{data.rows.length === 1 ? '' : 's'}
        </p>
      </div>
    </div>
  );
}
