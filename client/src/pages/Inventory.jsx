import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import {
  Alert, Badge, Card, DataTable, Empty, Field, Input, Loading, Modal, NumInput,
  PageHead, SegmentedControl, Select, StatusBadge, Tabs, Textarea, useToast, KV,
} from '../ui/kit.jsx';
import { money, qty as fmtQty, fmtDateTime } from '../format.js';
import { IconPlus, IconWarehouse, IconAlert, IconHistory } from '../ui/Icons.jsx';

export default function Inventory() {
  const { can, meta, readOnly } = useAuth();
  const toast = useToast();
  const [materials, setMaterials] = useState(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [adjusting, setAdjusting] = useState(null);
  const [ledgerFor, setLedgerFor] = useState(null);

  const load = () =>
    api
      .get('/masters/materials')
      .then((d) => setMaterials(d.materials))
      .catch((e) => setError(e.message));

  useEffect(() => {
    load();
  }, []);

  const stats = useMemo(() => {
    if (!materials) return null;
    return {
      count: materials.length,
      value: materials.reduce((s, m) => s + Number(m.stockValue), 0),
      low: materials.filter((m) => m.low).length,
      negative: materials.filter((m) => m.negative).length,
    };
  }, [materials]);

  const visible = useMemo(() => {
    if (!materials) return [];
    if (filter === 'low') return materials.filter((m) => m.low || m.negative);
    if (filter === 'zero') return materials.filter((m) => Number(m.qty_in_stock) <= 0);
    return materials;
  }, [materials, filter]);

  if (error) return <div className="content-inner"><Alert tone="bad" title="Could not load the inventory">{error}</Alert></div>;
  if (!materials) return <Loading pad={80} />;

  return (
    <div className="content-inner">
      <PageHead
        title="Stock & materials"
        desc="Raw material balances update automatically as the store issues material, production consumes it, and purchases are received."
      >
        <SegmentedControl
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: `All (${materials.length})` },
            { value: 'low', label: `Reorder (${stats.low + stats.negative})` },
            { value: 'zero', label: 'Nil / negative' },
          ]}
        />
        {can('material.write') && (
          <button type="button" className="btn btn-primary" onClick={() => setAddOpen(true)}>
            <IconPlus size={15} /> Add material
          </button>
        )}
      </PageHead>

      <div className="stack">
        <div className="stat-grid">
          <div className="stat">
            <span className="stat-accent" />
            <span className="stat-label">Materials tracked</span>
            <span className="stat-value">{stats.count}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Total stock value</span>
            <span className="stat-value" style={{ fontSize: 'var(--fs-xl)' }}>{money(stats.value)}</span>
          </div>
          <div className={`stat ${stats.low ? 'is-alert' : ''}`}>
            <span className="stat-label">At or below reorder level</span>
            <span className="stat-value">{stats.low}</span>
          </div>
          <div className={`stat ${stats.negative ? 'is-alert' : ''}`}>
            <span className="stat-label">Negative balances</span>
            <span className="stat-value">{stats.negative}</span>
            {stats.negative > 0 && <span className="stat-meta">Issued without stock on record</span>}
          </div>
        </div>

        {stats.negative > 0 && (
          <Alert tone="warn" title="Some balances are negative">
            Material was issued that the system had no stock for. Receive the matching purchase, or use “Adjust” to
            correct the opening balance.
          </Alert>
        )}

        <Card flush>
          <div style={{ padding: 'var(--s5)' }}>
            <DataTable
              rows={visible}
              exportName="raw-material-stock"
              searchPlaceholder="Search material, code, category…"
              onRowClick={(m) => setLedgerFor(m)}
              columns={[
                { key: 'code', label: 'Code', render: (m) => <span className="mono small">{m.code || '—'}</span> },
                {
                  key: 'name',
                  label: 'Material',
                  render: (m) => (
                    <div>
                      <div className="strong">{m.name}</div>
                      {m.category && <div className="tiny dim">{m.category}</div>}
                    </div>
                  ),
                },
                { key: 'unit', label: 'Unit' },
                {
                  key: 'qty_in_stock',
                  label: 'In stock',
                  type: 'num',
                  render: (m) => (
                    <span style={{ fontWeight: 600, color: m.negative ? 'var(--bad-fg)' : m.low ? 'var(--warn-fg)' : undefined }}>
                      {fmtQty(m.qty_in_stock)}
                    </span>
                  ),
                },
                { key: 'reorder_level', label: 'Reorder at', type: 'num' },
                { key: 'standard_rate', label: 'Rate', type: 'money' },
                { key: 'stockValue', label: 'Value', type: 'money' },
                { key: 'purchased', label: 'Purchased', type: 'num' },
                { key: 'consumed', label: 'Issued', type: 'num' },
                { key: 'wasted', label: 'Wasted', type: 'num' },
                { key: 'location', label: 'Location' },
                {
                  key: '_status',
                  label: 'Status',
                  sortable: false,
                  render: (m) =>
                    m.negative ? <Badge tone="bad">Negative</Badge> : m.low ? <Badge tone="warn">Reorder</Badge> : <Badge tone="ok">OK</Badge>,
                },
                {
                  key: '_act',
                  label: '',
                  sortable: false,
                  render: (m) =>
                    readOnly ? null : (
                      <div className="row-tight" onClick={(e) => e.stopPropagation()}>
                        {can('material.write') && (
                          <button type="button" className="btn btn-sm btn-ghost" onClick={() => setEditing(m)}>
                            Edit
                          </button>
                        )}
                        {can('stock.adjust') && (
                          <button type="button" className="btn btn-sm btn-ghost" onClick={() => setAdjusting(m)}>
                            Adjust
                          </button>
                        )}
                      </div>
                    ),
                },
              ]}
              empty={
                <Empty icon={IconWarehouse} title={filter === 'all' ? 'No materials yet' : 'Nothing matches this filter'}>
                  {filter === 'all'
                    ? 'Add your raw materials with their opening stock so costing and issue can use them.'
                    : 'Try a different filter.'}
                </Empty>
              }
            />
          </div>
        </Card>
      </div>

      <MaterialModal
        open={addOpen || !!editing}
        material={editing}
        meta={meta}
        onClose={() => {
          setAddOpen(false);
          setEditing(null);
        }}
        onSaved={() => {
          setAddOpen(false);
          setEditing(null);
          load();
        }}
      />

      <AdjustModal material={adjusting} onClose={() => setAdjusting(null)} onSaved={() => { setAdjusting(null); load(); }} />
      <LedgerModal material={ledgerFor} onClose={() => setLedgerFor(null)} />
    </div>
  );
}

function MaterialModal({ open, material, meta, onClose, onSaved }) {
  const toast = useToast();
  const isEdit = !!material;
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    setForm(
      material
        ? {
            name: material.name, code: material.code || '', category: material.category || '', unit: material.unit,
            reorder_level: material.reorder_level, standard_rate: material.standard_rate,
            hsn: material.hsn || '', location: material.location || '',
          }
        : { name: '', code: '', category: 'Raw material', unit: 'nos', qty_in_stock: 0, reorder_level: 0, standard_rate: 0, hsn: '', location: '' }
    );
  }, [open, material]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function save() {
    if (!String(form.name || '').trim()) return setError('Material name is required.');
    setBusy(true);
    try {
      if (isEdit) await api.patch(`/masters/materials/${material.id}`, form);
      else await api.post('/masters/materials', form);
      toast.success(isEdit ? 'Material updated' : 'Material added');
      onSaved();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? `Edit ${material.name}` : 'Add a raw material'}
      sub={isEdit ? 'Stock balance can only be changed through purchases, issues, or an adjustment.' : undefined}
      foot={
        <>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={save} disabled={busy}>
            {busy && <span className="spinner" />}
            {isEdit ? 'Save changes' : 'Add material'}
          </button>
        </>
      }
    >
      <div className="stack">
        {error && <Alert tone="bad">{error}</Alert>}
        <div className="grid grid-2">
          <Field label="Material name" required span={2}>
            <Input value={form.name || ''} onChange={set('name')} autoFocus placeholder="e.g. Plywood 18mm BWP" />
          </Field>
          <Field label="Code">
            <Input value={form.code || ''} onChange={set('code')} />
          </Field>
          <Field label="Category">
            <Input value={form.category || ''} onChange={set('category')} list="mat-cats" />
          </Field>
          <Field label="Unit" required>
            <Select value={form.unit || 'nos'} onChange={set('unit')} options={meta.units} />
          </Field>
          {!isEdit && (
            <Field label="Opening stock" hint="Written to the stock ledger as an opening entry">
              <NumInput value={form.qty_in_stock ?? 0} step="any" onChange={set('qty_in_stock')} />
            </Field>
          )}
          <Field label="Reorder level" hint="Below this, it appears in the low-stock report">
            <NumInput value={form.reorder_level ?? 0} min="0" step="any" onChange={set('reorder_level')} />
          </Field>
          <Field label="Standard rate (₹)" hint="Prefills costing and values the stock">
            <NumInput value={form.standard_rate ?? 0} min="0" step="any" onChange={set('standard_rate')} />
          </Field>
          <Field label="HSN code">
            <Input value={form.hsn || ''} onChange={set('hsn')} />
          </Field>
          <Field label="Storage location">
            <Input value={form.location || ''} onChange={set('location')} placeholder="Rack / godown" />
          </Field>
        </div>
        <datalist id="mat-cats">
          {['Raw material', 'Plywood & boards', 'Laminate & veneer', 'Hardware & fittings', 'Adhesive & chemicals', 'Glass & mirror', 'Packing material', 'Consumables'].map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </div>
    </Modal>
  );
}

function AdjustModal({ material, onClose, onSaved }) {
  const toast = useToast();
  const [qty, setQty] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setQty('');
    setReason('');
    setError('');
  }, [material]);

  async function save() {
    if (!Number(qty)) return setError('Enter a non-zero quantity. Use a minus sign to reduce stock.');
    if (!reason.trim()) return setError('A reason is required — it is recorded in the stock ledger.');
    setBusy(true);
    try {
      await api.post(`/masters/materials/${material.id}/adjust`, { qty: Number(qty), reason });
      toast.success('Stock adjusted', `${material.name} is now ${fmtQty(Number(material.qty_in_stock) + Number(qty))} ${material.unit}.`);
      onSaved();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (!material) return null;
  const next = Number(material.qty_in_stock) + (Number(qty) || 0);

  return (
    <Modal
      open={!!material}
      onClose={onClose}
      title={`Adjust stock — ${material.name}`}
      sub={`Current balance ${fmtQty(material.qty_in_stock)} ${material.unit}`}
      foot={
        <>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={save} disabled={busy}>
            {busy && <span className="spinner" />}
            Post adjustment
          </button>
        </>
      }
    >
      <div className="stack">
        {error && <Alert tone="bad">{error}</Alert>}
        <Field label="Adjustment quantity" required hint="Positive to add stock, negative to reduce it.">
          <NumInput value={qty} step="any" onChange={(e) => setQty(e.target.value)} autoFocus />
        </Field>
        <Field label="Reason" required>
          <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Physical stock count, damage, correction of opening balance…" />
        </Field>
        {Number(qty) !== 0 && (
          <Alert tone={next < 0 ? 'warn' : 'info'}>
            New balance will be <strong>{fmtQty(next)} {material.unit}</strong>
            {next < 0 && ' — this leaves the balance negative.'}
          </Alert>
        )}
      </div>
    </Modal>
  );
}

function LedgerModal({ material, onClose }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    setData(null);
    if (material) api.get(`/masters/materials/${material.id}/ledger`).then(setData).catch(() => setData({ entries: [] }));
  }, [material]);

  if (!material) return null;

  return (
    <Modal
      open={!!material}
      onClose={onClose}
      title={material.name}
      sub={`Stock movements · current balance ${fmtQty(material.qty_in_stock)} ${material.unit}`}
      size="lg"
      foot={<button type="button" className="btn" onClick={onClose}>Close</button>}
    >
      <div className="stack">
        <KV
          items={[
            ['Code', material.code],
            ['Category', material.category],
            ['Reorder level', `${fmtQty(material.reorder_level)} ${material.unit}`],
            ['Standard rate', money(material.standard_rate)],
            ['Stock value', money(material.stockValue)],
            ['Location', material.location],
          ]}
        />
        {!data ? (
          <Loading pad={30} />
        ) : data.entries.length === 0 ? (
          <Empty icon={IconHistory} title="No movements yet">Stock movements appear here as material is purchased, issued and consumed.</Empty>
        ) : (
          <DataTable
            rows={data.entries}
            compact
            pageSize={30}
            searchable={false}
            columns={[
              { key: 'at', label: 'When', type: 'datetime' },
              { key: 'txn_type', label: 'Type', type: 'status' },
              {
                key: 'qty',
                label: 'Qty',
                type: 'num',
                render: (r) => (
                  <span style={{ color: Number(r.qty) > 0 ? 'var(--ok-fg)' : 'var(--bad-fg)', fontWeight: 600 }}>
                    {Number(r.qty) > 0 ? '+' : ''}{fmtQty(r.qty)}
                  </span>
                ),
              },
              { key: 'balance_after', label: 'Balance', type: 'num' },
              { key: 'order_no', label: 'Order', render: (r) => <span className="mono small">{r.order_no || '—'}</span> },
              { key: 'remarks', label: 'Remarks' },
              { key: 'user_name', label: 'By' },
            ]}
          />
        )}
      </div>
    </Modal>
  );
}
