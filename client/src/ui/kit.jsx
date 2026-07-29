import { useEffect, useMemo, useRef, useState, createContext, useContext, useCallback } from 'react';
import {
  IconAlert, IconCheckCircle, IconInfo, IconX, IconSearch, IconChevronLeft,
  IconChevronRight, IconInbox, IconDownload, IconSun, IconMoon,
} from './Icons.jsx';
import { money, qty as fmtQty, fmtDate, fmtDateTime, downloadCsv } from '../format.js';

/* ============================================================ layout pieces */

export function Card({ title, sub, action, children, flush, foot, className = '', ...rest }) {
  return (
    <section className={`card ${className}`} {...rest}>
      {(title || action) && (
        <header className="card-head">
          <div className="grow">
            {title && <h3>{title}</h3>}
            {sub && <div className="sub">{sub}</div>}
          </div>
          {action}
        </header>
      )}
      <div className={flush ? 'card-body card-body-flush' : 'card-body'}>{children}</div>
      {foot && <footer className="card-foot">{foot}</footer>}
    </section>
  );
}

export function PageHead({ title, desc, children }) {
  return (
    <div className="page-head between wrap">
      <div className="grow">
        <h2>{title}</h2>
        {desc && <p>{desc}</p>}
      </div>
      {children && <div className="row-tight wrap">{children}</div>}
    </div>
  );
}

export function Section({ title, action, children }) {
  return (
    <div>
      <div className="section-title between">
        <span>{title}</span>
        {action}
      </div>
      {children}
    </div>
  );
}

export function Divider() {
  return <hr className="divider" />;
}

/* =================================================================== fields */

export function Field({ label, required, hint, error, children, span }) {
  return (
    <div className="field" style={span ? { gridColumn: `span ${span}` } : undefined}>
      {label && (
        <label>
          {label}
          {required && <span className="req">*</span>}
        </label>
      )}
      {children}
      {error ? <span className="err">{error}</span> : hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}

export function Input({ invalid, ...rest }) {
  return <input className={`input ${invalid ? 'input-invalid' : ''}`} {...rest} />;
}

export function NumInput({ invalid, value, onChange, ...rest }) {
  return (
    <input
      type="number"
      className={`input num-input ${invalid ? 'input-invalid' : ''}`}
      value={value ?? ''}
      onChange={onChange}
      onWheel={(e) => e.currentTarget.blur()}
      {...rest}
    />
  );
}

export function Textarea({ invalid, ...rest }) {
  return <textarea className={`textarea ${invalid ? 'input-invalid' : ''}`} {...rest} />;
}

export function Select({ options, placeholder, invalid, children, ...rest }) {
  return (
    <select className={`select ${invalid ? 'input-invalid' : ''}`} {...rest}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options
        ? options.map((o) => {
            const value = typeof o === 'string' ? o : o.value;
            const label = typeof o === 'string' ? o : o.label;
            return (
              <option key={value} value={value}>
                {label}
              </option>
            );
          })
        : children}
    </select>
  );
}

export function Check({ label, checked, onChange, disabled, hint }) {
  return (
    <label className="check" style={disabled ? { opacity: 0.55, cursor: 'not-allowed' } : undefined}>
      <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} disabled={disabled} />
      <span>
        {label}
        {hint && <div className="hint" style={{ marginTop: 1 }}>{hint}</div>}
      </span>
    </label>
  );
}

export function YesNo({ value, onChange, disabled }) {
  return (
    <div className="switch-group">
      {['Yes', 'No'].map((v) => (
        <button key={v} type="button" aria-pressed={value === v} onClick={() => onChange(v)} disabled={disabled}>
          {v}
        </button>
      ))}
    </div>
  );
}

export function SegmentedControl({ value, onChange, options }) {
  return (
    <div className="switch-group">
      {options.map((o) => {
        const v = typeof o === 'string' ? o : o.value;
        const l = typeof o === 'string' ? o : o.label;
        return (
          <button key={v} type="button" aria-pressed={value === v} onClick={() => onChange(v)}>
            {l}
          </button>
        );
      })}
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder = 'Search…', style }) {
  return (
    <div style={{ position: 'relative', ...style }}>
      <IconSearch
        size={14}
        style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)', pointerEvents: 'none' }}
      />
      <input
        className="input"
        style={{ paddingLeft: 30, paddingRight: value ? 30 : 12 }}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
      {value && (
        <button
          type="button"
          className="btn btn-ghost btn-icon btn-sm"
          style={{ position: 'absolute', right: 3, top: 3 }}
          onClick={() => onChange('')}
          aria-label="Clear search"
        >
          <IconX size={13} />
        </button>
      )}
    </div>
  );
}

/** Text input backed by a datalist, so users can pick a known value or type a new one. */
export function Combo({ value, onChange, options, listId, placeholder, invalid, ...rest }) {
  const id = useRef(listId || `dl-${Math.random().toString(36).slice(2)}`).current;
  return (
    <>
      <input
        className={`input ${invalid ? 'input-invalid' : ''}`}
        list={id}
        value={value ?? ''}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        {...rest}
      />
      <datalist id={id}>
        {(options || []).map((o) => (
          <option key={typeof o === 'string' ? o : o.value} value={typeof o === 'string' ? o : o.value}>
            {typeof o === 'string' ? undefined : o.label}
          </option>
        ))}
      </datalist>
    </>
  );
}

/* =================================================================== badges */

const STATUS_TONE = {
  open: 'info', converted: 'ok', lost: 'bad', active: 'info', closed: 'ok',
  pass: 'ok', fail: 'bad', approved: 'ok', rejected: 'bad',
  received: 'ok', cancelled: 'bad', requested: 'warn', issued: 'ok',
  in_stock: 'info', dispatched: 'ok',
  purchase: 'ok', opening: 'neutral', issue: 'warn', consume: 'warn',
  wastage: 'bad', return: 'info', adjust: 'neutral',
  Urgent: 'bad', High: 'warn', Normal: 'neutral', Low: 'neutral',
  Expired: 'bad', Valid: 'ok', Pending: 'warn', Passed: 'ok', Failed: 'bad',
  'In factory': 'info', Dispatched: 'ok',
};

const STATUS_TEXT = {
  open: 'Open', converted: 'Converted', lost: 'Lost', active: 'Active', closed: 'Completed',
  pass: 'Passed', fail: 'Failed', approved: 'Approved', rejected: 'Rejected',
  received: 'Received', cancelled: 'Cancelled', requested: 'Requested', issued: 'Issued',
  in_stock: 'In factory', dispatched: 'Dispatched',
  purchase: 'Purchase', opening: 'Opening', issue: 'Issued', consume: 'Consumed',
  wastage: 'Wastage', return: 'Returned', adjust: 'Adjustment',
};

export function Badge({ tone = 'neutral', children, dot }) {
  return (
    <span className={`badge badge-${tone}`}>
      {dot && <span className="badge-dot" />}
      {children}
    </span>
  );
}

export function StatusBadge({ value }) {
  if (value == null || value === '') return <span className="dim">—</span>;
  const key = String(value);
  return <Badge tone={STATUS_TONE[key] || 'neutral'}>{STATUS_TEXT[key] || key}</Badge>;
}

export function Chip({ children }) {
  return <span className="chip">{children}</span>;
}

/* ==================================================================== alert */

const ALERT_ICON = { bad: IconAlert, warn: IconAlert, ok: IconCheckCircle, info: IconInfo };

export function Alert({ tone = 'info', title, children }) {
  const Ico = ALERT_ICON[tone] || IconInfo;
  return (
    <div className={`alert alert-${tone}`}>
      <Ico size={15} />
      <div className="grow">
        {title && <strong>{title}</strong>}
        {title && children ? <div style={{ marginTop: 2 }}>{children}</div> : children}
      </div>
    </div>
  );
}

/* ================================================================ empty/load */

export function Empty({ title, children, icon, action }) {
  const Ico = icon || IconInbox;
  return (
    <div className="empty">
      <div className="empty-icon">
        <Ico size={21} />
      </div>
      {title && <h4>{title}</h4>}
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function Loading({ label = 'Loading…', pad = 48 }) {
  return (
    <div className="row" style={{ justifyContent: 'center', padding: pad, color: 'var(--text-2)' }}>
      <span className="spinner" />
      <span>{label}</span>
    </div>
  );
}

export function SkeletonRows({ rows = 5, height = 34 }) {
  return (
    <div className="col" style={{ gap: 8, padding: 4 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton" style={{ height, opacity: 1 - i * 0.12 }} />
      ))}
    </div>
  );
}

/* ==================================================================== modal */

export function Modal({ open, onClose, title, sub, size = '', children, foot, closeOnScrim = true }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="modal-scrim"
      onMouseDown={(e) => {
        if (closeOnScrim && e.target === e.currentTarget) onClose?.();
      }}
    >
      <div className={`modal ${size}`} role="dialog" aria-modal="true" aria-label={title}>
        {(title || onClose) && (
          <header className="modal-head no-print">
            <div className="grow">
              {title && <h3>{title}</h3>}
              {sub && <p>{sub}</p>}
            </div>
            {onClose && (
              <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={onClose} aria-label="Close">
                <IconX size={15} />
              </button>
            )}
          </header>
        )}
        <div className="modal-body">{children}</div>
        {foot && <footer className="modal-foot no-print">{foot}</footer>}
      </div>
    </div>
  );
}

export function ConfirmModal({ open, onClose, onConfirm, title, body, confirmLabel = 'Confirm', tone = 'primary', busy, requireReason, reasonLabel = 'Reason', reasonOptions }) {
  const [reason, setReason] = useState('');
  useEffect(() => {
    if (open) setReason('');
  }, [open]);

  return (
    <Modal
      open={open}
      onClose={busy ? undefined : onClose}
      title={title}
      foot={
        <>
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className={`btn btn-${tone}`}
            disabled={busy || (requireReason && !reason.trim())}
            onClick={() => onConfirm(reason.trim())}
          >
            {busy && <span className="spinner" />}
            {confirmLabel}
          </button>
        </>
      }
    >
      <div className="stack">
        {body && <div>{body}</div>}
        {requireReason && (
          <Field label={reasonLabel} required>
            {reasonOptions ? (
              <Select options={reasonOptions} placeholder="Choose a reason…" value={reason} onChange={(e) => setReason(e.target.value)} />
            ) : (
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Type the reason…" rows={3} />
            )}
          </Field>
        )}
      </div>
    </Modal>
  );
}

/* =================================================================== toasts */

const ToastCtx = createContext(null);

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id) => setItems((list) => list.filter((t) => t.id !== id)), []);

  const push = useCallback(
    (toast) => {
      const id = ++idRef.current;
      const item = { id, tone: 'ok', ttl: 4200, ...toast };
      setItems((list) => [...list, item]);
      if (item.ttl) setTimeout(() => dismiss(id), item.ttl);
      return id;
    },
    [dismiss]
  );

  const value = useMemo(
    () => ({
      push,
      dismiss,
      success: (title, body) => push({ tone: 'ok', title, body }),
      error: (title, body) => push({ tone: 'bad', title, body, ttl: 7000 }),
      warn: (title, body) => push({ tone: 'warn', title, body, ttl: 6000 }),
      info: (title, body) => push({ tone: '', title, body }),
    }),
    [push, dismiss]
  );

  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div className="toast-host no-print" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast ${t.tone}`}>
            <div className="grow">
              <div className="toast-title">{t.title}</div>
              {t.body && <div className="toast-body">{t.body}</div>}
            </div>
            <button type="button" className="toast-x" onClick={() => dismiss(t.id)} aria-label="Dismiss">
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}

/* ==================================================================== stats */

export function Stat({ label, value, meta, tone, onClick, accent, format }) {
  const display = format === 'money' ? money(value) : typeof value === 'number' ? value.toLocaleString('en-IN') : value;
  const isZero = value === 0 || value === '0';
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      className={`stat ${isZero ? 'is-zero' : ''} ${tone === 'alert' ? 'is-alert' : ''}`}
      onClick={onClick}
      type={onClick ? 'button' : undefined}
    >
      {accent && <span className="stat-accent" style={{ background: accent }} />}
      <span className="stat-label">{label}</span>
      <span className="stat-value">{display}</span>
      {meta && <span className="stat-meta">{meta}</span>}
    </Tag>
  );
}

/* ===================================================================== tabs */

export function Tabs({ value, onChange, items }) {
  return (
    <div className="tabs">
      {items.map((t) => (
        <button
          key={t.value}
          type="button"
          className={`tab ${value === t.value ? 'active' : ''}`}
          onClick={() => onChange(t.value)}
        >
          {t.label}
          {t.count !== undefined && t.count !== null && <span className="tab-count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

/* =================================================================== tables */

/**
 * Data table with client-side search, sort and pagination.
 * Columns: { key, label, type?, width?, render?, className?, sortable? }
 * type: 'money' | 'num' | 'date' | 'datetime' | 'status'
 */
export function DataTable({
  columns,
  rows,
  totals,
  rowKey = (r, i) => r.id ?? i,
  onRowClick,
  empty,
  searchable = true,
  searchPlaceholder = 'Search…',
  pageSize = 25,
  compact,
  initialSort,
  toolbar,
  exportName,
  maxHeight,
}) {
  const [q, setQ] = useState('');
  const [sort, setSort] = useState(initialSort || null);
  const [page, setPage] = useState(0);

  const searchable_ = searchable && rows.length > 6;

  const filtered = useMemo(() => {
    if (!q.trim()) return rows;
    const needle = q.trim().toLowerCase();
    return rows.filter((r) =>
      columns.some((c) => {
        const v = r[c.key];
        return v != null && String(v).toLowerCase().includes(needle);
      })
    );
  }, [rows, q, columns]);

  const sorted = useMemo(() => {
    if (!sort) return filtered;
    const col = columns.find((c) => c.key === sort.key);
    const numeric = col && (col.type === 'money' || col.type === 'num');
    const copy = filtered.slice();
    copy.sort((a, b) => {
      const av = a[sort.key];
      const bv = b[sort.key];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      const cmp = numeric ? Number(av) - Number(bv) : String(av).localeCompare(String(bv), 'en', { numeric: true });
      return sort.dir === 'asc' ? cmp : -cmp;
    });
    return copy;
  }, [filtered, sort, columns]);

  // pageSize 0 (or falsy) means "show every row, no pager".
  const paged = pageSize > 0;
  const pages = paged ? Math.max(1, Math.ceil(sorted.length / pageSize)) : 1;
  const safePage = Math.min(page, pages - 1);
  const visible = paged ? sorted.slice(safePage * pageSize, safePage * pageSize + pageSize) : sorted;

  useEffect(() => {
    setPage(0);
  }, [q, rows]);

  function toggleSort(key) {
    setSort((s) => (s && s.key === key ? (s.dir === 'asc' ? { key, dir: 'desc' } : null) : { key, dir: 'asc' }));
  }

  if (!rows.length) {
    return <>{empty || <Empty title="Nothing here yet">Records will appear here once they are created.</Empty>}</>;
  }

  return (
    <div>
      {(searchable_ || toolbar || exportName) && (
        <div className="between wrap no-print" style={{ padding: '0 0 12px' }}>
          <div className="row-tight wrap grow">
            {searchable_ && <SearchInput value={q} onChange={setQ} placeholder={searchPlaceholder} style={{ width: 260, maxWidth: '100%' }} />}
            {toolbar}
          </div>
          <div className="row-tight">
            <span className="small dim nowrap">
              {sorted.length === rows.length ? `${rows.length} row${rows.length === 1 ? '' : 's'}` : `${sorted.length} of ${rows.length}`}
            </span>
            {exportName && (
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => downloadCsv(`${exportName}.csv`, columns, sorted)}
                title="Download as CSV"
              >
                <IconDownload size={13} /> CSV
              </button>
            )}
          </div>
        </div>
      )}

      <div className="table-wrap" style={maxHeight ? { maxHeight, overflowY: 'auto' } : undefined}>
        <table className={`tbl ${compact ? 'compact' : ''}`}>
          <thead>
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  className={`${c.type === 'money' || c.type === 'num' ? 'right' : ''} ${c.sortable !== false ? 'sortable' : ''}`}
                  style={c.width ? { width: c.width } : undefined}
                  onClick={c.sortable === false ? undefined : () => toggleSort(c.key)}
                >
                  {c.label}
                  {sort && sort.key === c.key && <span className="sort-arrow">{sort.dir === 'asc' ? '↑' : '↓'}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((r, i) => (
              <tr
                key={rowKey(r, i)}
                className={onRowClick ? 'clickable' : ''}
                onClick={onRowClick ? () => onRowClick(r) : undefined}
              >
                {columns.map((c) => (
                  <td key={c.key} className={cellClass(c)}>
                    {renderCell(c, r)}
                  </td>
                ))}
              </tr>
            ))}
            {!visible.length && (
              <tr>
                <td colSpan={columns.length} className="center dim" style={{ padding: 28 }}>
                  No rows match “{q}”.
                </td>
              </tr>
            )}
          </tbody>
          {totals && (
            <tfoot>
              <tr>
                {columns.map((c, i) => (
                  <td key={c.key} className={cellClass(c)}>
                    {i === 0 ? 'Total' : totals[c.key] != null ? formatValue(c, totals[c.key]) : ''}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {paged && pages > 1 && (
        <div className="between no-print" style={{ paddingTop: 12 }}>
          <span className="small dim">
            Page {safePage + 1} of {pages}
          </span>
          <div className="row-tight">
            <button type="button" className="btn btn-sm btn-icon" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>
              <IconChevronLeft size={13} />
            </button>
            <button
              type="button"
              className="btn btn-sm btn-icon"
              disabled={safePage >= pages - 1}
              onClick={() => setPage(safePage + 1)}
            >
              <IconChevronRight size={13} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function cellClass(c) {
  if (c.className) return c.className;
  if (c.type === 'money' || c.type === 'num') return 'num';
  return '';
}

function formatValue(c, v) {
  if (v == null || v === '') return <span className="dim">—</span>;
  switch (c.type) {
    case 'money':
      return money(v);
    case 'num':
      return fmtQty(v);
    case 'date':
      return fmtDate(v);
    case 'datetime':
      return fmtDateTime(v);
    case 'status':
      return <StatusBadge value={v} />;
    default:
      return v;
  }
}

function renderCell(c, r) {
  if (c.render) return c.render(r);
  return formatValue(c, r[c.key]);
}

/* =================================================================== charts */

/** Multi-series line chart, pure SVG, no dependencies. */
export function LineChart({ data, series, xKey, height = 170, valueFormat }) {
  const [hover, setHover] = useState(null);
  const w = 800;
  const padL = 38;
  const padR = 10;
  const padT = 10;
  const padB = 22;

  const max = Math.max(1, ...data.flatMap((d) => series.map((s) => Number(d[s.key]) || 0)));
  const niceMax = niceCeil(max);
  const innerW = w - padL - padR;
  const innerH = height - padT - padB;
  const stepX = data.length > 1 ? innerW / (data.length - 1) : 0;
  const x = (i) => padL + i * stepX;
  const y = (v) => padT + innerH - (Number(v) || 0) / niceMax * innerH;

  const ticks = [0, 0.5, 1].map((f) => Math.round(niceMax * f));

  return (
    <div style={{ position: 'relative' }}>
      <svg className="chart" viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" style={{ height }}>
        {ticks.map((t) => (
          <g key={t}>
            <line className="grid-line" x1={padL} x2={w - padR} y1={y(t)} y2={y(t)} strokeDasharray={t === 0 ? '' : '3 4'} />
            <text className="axis-text" x={padL - 6} y={y(t) + 3} textAnchor="end">
              {shortNum(t)}
            </text>
          </g>
        ))}
        {series.map((s) => (
          <g key={s.key}>
            <path
              d={data.map((d, i) => `${i ? 'L' : 'M'}${x(i)},${y(d[s.key])}`).join(' ')}
              fill="none"
              stroke={s.color}
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {data.map((d, i) => (
              <circle key={i} cx={x(i)} cy={y(d[s.key])} r={hover === i ? 3.5 : 0} fill={s.color} />
            ))}
          </g>
        ))}
        {data.map((d, i) => (
          <rect
            key={i}
            x={x(i) - stepX / 2}
            y={padT}
            width={Math.max(stepX, 6)}
            height={innerH}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          />
        ))}
        {data.map((d, i) =>
          i % Math.ceil(data.length / 7) === 0 ? (
            <text key={i} className="axis-text" x={x(i)} y={height - 6} textAnchor="middle">
              {String(d[xKey]).slice(5)}
            </text>
          ) : null
        )}
        {hover != null && <line className="grid-line" x1={x(hover)} x2={x(hover)} y1={padT} y2={padT + innerH} stroke="var(--line-2)" />}
      </svg>
      {hover != null && (
        <div
          style={{
            position: 'absolute',
            left: `${((x(hover) - padL) / innerW) * 100}%`,
            top: 0,
            transform: 'translateX(-50%)',
            background: 'var(--surface)',
            border: '1px solid var(--line-2)',
            borderRadius: 'var(--r)',
            boxShadow: 'var(--sh-2)',
            padding: '6px 10px',
            fontSize: 'var(--fs-xs)',
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
            zIndex: 2,
          }}
        >
          <div className="strong" style={{ marginBottom: 2 }}>{fmtDate(data[hover][xKey])}</div>
          {series.map((s) => (
            <div key={s.key} className="row-tight" style={{ gap: 5 }}>
              <span style={{ width: 7, height: 7, borderRadius: 2, background: s.color, flex: 'none' }} />
              <span className="dim">{s.label}</span>
              <span className="strong">{valueFormat && s.money ? valueFormat(data[hover][s.key]) : data[hover][s.key]}</span>
            </div>
          ))}
        </div>
      )}
      <div className="row-tight wrap" style={{ justifyContent: 'center', marginTop: 6 }}>
        {series.map((s) => (
          <span key={s.key} className="row-tight tiny dim" style={{ gap: 5 }}>
            <span style={{ width: 8, height: 3, borderRadius: 2, background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Horizontal bars for a labelled breakdown. */
export function BarList({ rows, labelKey = 'label', valueKey = 'count', format, color, max: maxProp }) {
  const max = maxProp || Math.max(1, ...rows.map((r) => Number(r[valueKey]) || 0));
  if (!rows.length) return <p className="small dim">No data for this period.</p>;
  return (
    <div>
      {rows.map((r, i) => (
        <div className="bar-row" key={r[labelKey] ?? i}>
          <div className="between" style={{ gap: 8 }}>
            <span className="small truncate">{r[labelKey] || '—'}</span>
            <span className="small strong num nowrap">{format ? format(r[valueKey]) : fmtQty(r[valueKey])}</span>
          </div>
          <div className="bar-track">
            <div
              className="bar-fill"
              style={{
                width: `${((Number(r[valueKey]) || 0) / max) * 100}%`,
                background: color || `hsl(${18 - i * 2} ${62 - i * 4}% ${46 + i * 3}%)`,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Funnel of stage counts — reads left to right like the workflow itself. */
export function StageFunnel({ stages, onPick }) {
  const max = Math.max(1, ...stages.map((s) => s.count));
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      {stages.map((s) => (
        <button
          key={s.key}
          type="button"
          onClick={onPick ? () => onPick(s) : undefined}
          disabled={!onPick || !s.count}
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 150px) minmax(0, 1fr) 46px',
            alignItems: 'center',
            gap: 10,
            border: 'none',
            background: 'transparent',
            font: 'inherit',
            padding: '2px 0',
            textAlign: 'left',
            cursor: onPick && s.count ? 'pointer' : 'default',
            borderRadius: 'var(--r-sm)',
          }}
        >
          <span className="small truncate" style={{ color: s.count ? 'var(--text)' : 'var(--text-3)', fontWeight: s.mine ? 650 : 400 }}>
            {s.step}. {s.short}
          </span>
          <span className="bar-track" style={{ height: 16, borderRadius: 4 }}>
            <span
              className="bar-fill"
              style={{
                width: s.count ? `${Math.max(4, (s.count / max) * 100)}%` : '0%',
                borderRadius: 4,
                background: s.mine ? 'var(--brand-600)' : 'var(--brand-300)',
                display: 'block',
              }}
            />
          </span>
          <span className="small num strong" style={{ color: s.count ? 'var(--text)' : 'var(--text-3)' }}>
            {s.count}
          </span>
        </button>
      ))}
    </div>
  );
}

/* ================================================================= key-value */

export function KV({ items }) {
  const rows = items.filter((i) => i && i[1] !== undefined);
  return (
    <dl className="kv">
      {rows.map(([k, v], i) => (
        <div key={i} style={{ display: 'contents' }}>
          <dt>{k}</dt>
          <dd>{v === null || v === '' ? <span className="dim">—</span> : v}</dd>
        </div>
      ))}
    </dl>
  );
}

/* ================================================================ theme hook */

export function useTheme() {
  const [theme, setTheme] = useState(() => localStorage.getItem('arrohan-theme') || 'light');
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('arrohan-theme', theme);
  }, [theme]);
  return [theme, () => setTheme((t) => (t === 'light' ? 'dark' : 'light'))];
}

export function ThemeToggle() {
  const [theme, toggle] = useTheme();
  return (
    <button
      type="button"
      className="btn btn-ghost btn-icon"
      onClick={toggle}
      title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
      aria-label="Toggle colour theme"
    >
      {theme === 'light' ? <IconMoon size={15} /> : <IconSun size={15} />}
    </button>
  );
}

/* ==================================================================== utils */

function niceCeil(v) {
  if (v <= 5) return 5;
  const mag = 10 ** Math.floor(Math.log10(v));
  return Math.ceil(v / mag) * mag;
}

function shortNum(v) {
  const n = Number(v) || 0;
  if (n >= 1e7) return `${(n / 1e7).toFixed(1)}Cr`;
  if (n >= 1e5) return `${(n / 1e5).toFixed(1)}L`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}k`;
  return String(n);
}

/** Debounced value, for search boxes that hit the server. */
export function useDebounced(value, delay = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}
