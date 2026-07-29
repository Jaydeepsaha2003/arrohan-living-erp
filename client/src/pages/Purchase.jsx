import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import {
  Alert, Badge, Card, Combo, ConfirmModal, DataTable, Empty, Field, Input, KV, Loading,
  Modal, NumInput, PageHead, SegmentedControl, Select, StatusBadge, Textarea, useToast,
} from '../ui/kit.jsx';
import { money, qty as fmtQty, fmtDate, todayStr } from '../format.js';
import { IconPlus, IconCart, IconCheckCircle, IconPrint, IconAlert } from '../ui/Icons.jsx';

const rid = () => Math.random().toString(36).slice(2);

export default function Purchase() {
  const { can, meta, readOnly } = useAuth();
  const toast = useToast();
  const [pos, setPos] = useState(null);
  const [materials, setMaterials] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [orders, setOrders] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('open');
  const [formOpen, setFormOpen] = useState(false);
  const [prefill, setPrefill] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [receiving, setReceiving] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = () =>
    Promise.all([
      api.get('/purchase'),
      api.get('/masters/materials'),
      api.get('/masters/suppliers'),
      api.get('/orders?status=active'),
      api.get('/purchase/suggest/reorder'),
    ])
      .then(([p, m, s, o, sg]) => {
        setPos(p.purchaseOrders);
        setMaterials(m.materials);
        setSuppliers(s.suppliers);
        setOrders(o.orders);
        setSuggestions(sg.suggestions);
      })
      .catch((e) => setError(e.message));

  useEffect(() => {
    load();
  }, []);

  const visible = useMemo(() => {
    if (!pos) return [];
    if (filter === 'all') return pos;
    return pos.filter((p) => p.status === filter);
  }, [pos, filter]);

  const counts = useMemo(() => {
    if (!pos) return {};
    return {
      open: pos.filter((p) => p.status === 'open').length,
      received: pos.filter((p) => p.status === 'received').length,
      cancelled: pos.filter((p) => p.status === 'cancelled').length,
    };
  }, [pos]);

  async function doReceive() {
    setBusy(true);
    try {
      const r = await api.post(`/purchase/${receiving.id}/receive`);
      toast.success('Goods received', `Stock updated · GRN ${r.grn_no}`);
      setReceiving(null);
      await load();
    } catch (e) {
      toast.error('Could not receive the goods', e.message);
    } finally {
      setBusy(false);
    }
  }

  if (error) return <div className="content-inner"><Alert tone="bad" title="Could not load purchase orders">{error}</Alert></div>;
  if (!pos) return <Loading pad={80} />;

  return (
    <div className="content-inner">
      <PageHead
        title="Purchase orders"
        desc="Buy raw material from suppliers. Receiving a purchase order adds the quantities straight into stock."
      >
        <SegmentedControl
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'open', label: `Open (${counts.open})` },
            { value: 'received', label: `Received (${counts.received})` },
            { value: 'all', label: 'All' },
          ]}
        />
        {can('purchase.write') && (
          <button type="button" className="btn btn-primary" onClick={() => { setPrefill(null); setFormOpen(true); }}>
            <IconPlus size={15} /> New purchase order
          </button>
        )}
      </PageHead>

      <div className="stack">
        {suggestions.length > 0 && can('purchase.write') && (
          <Card
            title={`${suggestions.length} material(s) need reordering`}
            sub="At or below their reorder level"
            action={
              <button
                type="button"
                className="btn btn-sm btn-primary"
                onClick={() => {
                  setPrefill(suggestions);
                  setFormOpen(true);
                }}
              >
                Draft a purchase order
              </button>
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
                    <th className="right">Suggested qty</th>
                    <th className="right">Rate</th>
                    <th className="right">Estimated cost</th>
                  </tr>
                </thead>
                <tbody>
                  {suggestions.map((s) => (
                    <tr key={s.material_id}>
                      <td className="strong">{s.material}</td>
                      <td className="num" style={{ color: Number(s.qty_in_stock) < 0 ? 'var(--bad-fg)' : 'var(--warn-fg)', fontWeight: 600 }}>
                        {fmtQty(s.qty_in_stock)} {s.unit}
                      </td>
                      <td className="num dim">{fmtQty(s.reorder_level)}</td>
                      <td className="num strong">{fmtQty(s.qty)}</td>
                      <td className="num">{money(s.rate, { bare: true })}</td>
                      <td className="num">{money(Number(s.qty) * Number(s.rate), { bare: true })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        <Card flush>
          <div style={{ padding: 'var(--s5)' }}>
            <DataTable
              rows={visible}
              exportName={`purchase-orders-${filter}`}
              searchPlaceholder="Search PO number, supplier…"
              onRowClick={(p) => setViewing(p)}
              columns={[
                { key: 'po_no', label: 'PO no', render: (p) => <span className="mono strong">{p.po_no}</span> },
                { key: 'po_date', label: 'Date', type: 'date' },
                { key: 'supplier_name', label: 'Supplier', render: (p) => <span className="strong">{p.supplier_name}</span> },
                { key: 'line_count', label: 'Lines', type: 'num' },
                { key: 'subtotal', label: 'Taxable', type: 'money' },
                { key: 'gst_amount', label: 'GST', type: 'money' },
                { key: 'grand_total', label: 'Total', type: 'money' },
                { key: 'expected_date', label: 'Expected', type: 'date' },
                { key: 'status', label: 'Status', type: 'status' },
                { key: 'grn_no', label: 'GRN', render: (p) => <span className="mono small">{p.grn_no || '—'}</span> },
                { key: 'order_no', label: 'For order', render: (p) => <span className="mono small">{p.order_no || '—'}</span> },
                {
                  key: '_act',
                  label: '',
                  sortable: false,
                  render: (p) =>
                    p.status === 'open' && can('purchase.receive') ? (
                      <button
                        type="button"
                        className="btn btn-sm btn-ok"
                        onClick={(e) => {
                          e.stopPropagation();
                          setReceiving(p);
                        }}
                      >
                        Receive
                      </button>
                    ) : null,
                },
              ]}
              empty={
                <Empty icon={IconCart} title={filter === 'open' ? 'No open purchase orders' : 'Nothing here'}>
                  Raise a purchase order when raw material runs low, then receive it to add the stock.
                </Empty>
              }
            />
          </div>
        </Card>
      </div>

      <POForm
        open={formOpen}
        prefill={prefill}
        materials={materials}
        suppliers={suppliers}
        orders={orders}
        meta={meta}
        onClose={() => setFormOpen(false)}
        onSaved={() => {
          setFormOpen(false);
          load();
        }}
      />

      <POView po={viewing} onClose={() => setViewing(null)} onReceive={(p) => { setViewing(null); setReceiving(p); }} canReceive={can('purchase.receive')} />

      <ConfirmModal
        open={!!receiving}
        onClose={() => setReceiving(null)}
        onConfirm={doReceive}
        busy={busy}
        title="Receive these goods into stock"
        confirmLabel="Receive & update stock"
        tone="ok"
        body={
          receiving && (
            <div className="stack">
              <p className="muted">
                Every line on <strong>{receiving.po_no}</strong> from <strong>{receiving.supplier_name}</strong> will be
                added to stock and written to the stock ledger. This cannot be undone from the interface.
              </p>
              <div className="table-wrap">
                <table className="tbl compact">
                  <thead>
                    <tr><th>Material</th><th className="right">Qty</th><th>Unit</th><th className="right">Rate</th></tr>
                  </thead>
                  <tbody>
                    {receiving.items.map((i) => (
                      <tr key={i.id}>
                        <td>{i.material}</td>
                        <td className="num strong">{fmtQty(i.qty)}</td>
                        <td>{i.unit}</td>
                        <td className="num">{money(i.rate, { bare: true })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )
        }
      />
    </div>
  );
}

function POForm({ open, prefill, materials, suppliers, orders, meta, onClose, onSaved }) {
  const toast = useToast();
  const [supplierId, setSupplierId] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [supplierPhone, setSupplierPhone] = useState('');
  const [poDate, setPoDate] = useState(todayStr());
  const [expected, setExpected] = useState('');
  const [orderId, setOrderId] = useState('');
  const [gstRate, setGstRate] = useState(18);
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [newSupplier, setNewSupplier] = useState(false);

  const matNames = useMemo(() => materials.map((m) => m.name), [materials]);
  const matByName = useMemo(() => Object.fromEntries(materials.map((m) => [m.name.trim().toLowerCase(), m])), [materials]);

  useEffect(() => {
    if (!open) return;
    setError('');
    setSupplierId('');
    setSupplierName('');
    setSupplierPhone('');
    setNewSupplier(suppliers.length === 0);
    setPoDate(todayStr());
    setExpected('');
    setOrderId('');
    setGstRate(18);
    setNotes('');
    setLines(
      prefill?.length
        ? prefill.map((s) => ({ _k: rid(), material: s.material, qty: s.qty, unit: s.unit, rate: s.rate }))
        : [{ _k: rid(), material: '', qty: 1, unit: 'nos', rate: 0 }]
    );
  }, [open, prefill, suppliers.length]);

  const setLine = (k, patch) => setLines((l) => l.map((x) => (x._k === k ? { ...x, ...patch } : x)));
  const filled = lines.filter((l) => String(l.material).trim());
  const subtotal = filled.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.rate) || 0), 0);
  const gstAmount = (subtotal * (Number(gstRate) || 0)) / 100;

  async function save() {
    if (!supplierId && !supplierName.trim()) return setError('Choose a supplier or type a name.');
    if (!filled.length) return setError('Add at least one material line.');
    if (filled.some((l) => !(Number(l.qty) > 0))) return setError('Every line needs a quantity above zero.');
    setBusy(true);
    try {
      const r = await api.post('/purchase', {
        supplier_id: supplierId || undefined,
        supplier_name: supplierName,
        supplier_phone: supplierPhone,
        po_date: poDate,
        expected_date: expected || undefined,
        order_id: orderId || undefined,
        gst_rate: Number(gstRate) || 0,
        notes,
        items: filled.map((l) => ({ material: l.material, qty: Number(l.qty), unit: l.unit, rate: Number(l.rate) || 0 })),
      });
      toast.success('Purchase order raised', r.po_no);
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
      title="New purchase order"
      size="lg"
      foot={
        <>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={save} disabled={busy}>
            {busy && <span className="spinner" />}
            Raise purchase order
          </button>
        </>
      }
    >
      <div className="stack">
        {error && <Alert tone="bad">{error}</Alert>}

        <div className="grid grid-3">
          {suppliers.length > 0 && !newSupplier ? (
            <Field label="Supplier" required span={2}>
              <Select
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
                placeholder="Choose a supplier…"
                options={suppliers.map((s) => ({ value: s.id, label: `${s.name}${s.city ? ` · ${s.city}` : ''}` }))}
              />
              <button type="button" className="btn btn-sm btn-ghost" style={{ paddingLeft: 0, marginTop: 4 }} onClick={() => setNewSupplier(true)}>
                Enter a new supplier instead
              </button>
            </Field>
          ) : (
            <>
              <Field label="Supplier name" required>
                <Input value={supplierName} onChange={(e) => setSupplierName(e.target.value)} />
                {suppliers.length > 0 && (
                  <button type="button" className="btn btn-sm btn-ghost" style={{ paddingLeft: 0, marginTop: 4 }} onClick={() => setNewSupplier(false)}>
                    Pick from the supplier master
                  </button>
                )}
              </Field>
              <Field label="Supplier phone">
                <Input value={supplierPhone} onChange={(e) => setSupplierPhone(e.target.value)} />
              </Field>
            </>
          )}
          <Field label="PO date" required>
            <Input type="date" value={poDate} onChange={(e) => setPoDate(e.target.value)} />
          </Field>
          <Field label="Expected delivery">
            <Input type="date" value={expected} onChange={(e) => setExpected(e.target.value)} />
          </Field>
          <Field label="GST rate (%)">
            <Select value={gstRate} onChange={(e) => setGstRate(e.target.value)} options={[0, 5, 12, 18, 28].map((r) => ({ value: r, label: `${r}%` }))} />
          </Field>
          <Field label="Against order" hint="Optional — link the purchase to a specific order">
            <Select
              value={orderId}
              onChange={(e) => setOrderId(e.target.value)}
              placeholder="— general stock —"
              options={orders.map((o) => ({ value: o.id, label: `${o.order_no} · ${o.cust_name}` }))}
            />
          </Field>
        </div>

        <div>
          <div className="section-title between">
            <span>Materials</span>
            <button type="button" className="btn btn-sm btn-dashed" onClick={() => setLines((l) => [...l, { _k: rid(), material: '', qty: 1, unit: 'nos', rate: 0 }])}>
              <IconPlus size={12} /> Add line
            </button>
          </div>
          <div className="line-grid line-head" style={{ gridTemplateColumns: '2.4fr 0.8fr 0.8fr 1fr 1fr 34px' }}>
            <span>Material</span>
            <span className="right">Qty</span>
            <span>Unit</span>
            <span className="right">Rate ₹</span>
            <span className="right">Amount ₹</span>
            <span />
          </div>
          {lines.map((l) => (
            <div className="line-grid" key={l._k} style={{ gridTemplateColumns: '2.4fr 0.8fr 0.8fr 1fr 1fr 34px' }}>
              <Combo
                value={l.material}
                options={matNames}
                placeholder="Material name"
                onChange={(v) => {
                  const m = matByName[String(v).trim().toLowerCase()];
                  setLine(l._k, m ? { material: v, unit: m.unit, rate: Number(m.standard_rate) || 0 } : { material: v });
                }}
              />
              <NumInput value={l.qty} min="0" step="any" onChange={(e) => setLine(l._k, { qty: e.target.value })} />
              <Select value={l.unit} options={meta.units} onChange={(e) => setLine(l._k, { unit: e.target.value })} />
              <NumInput value={l.rate} min="0" step="any" onChange={(e) => setLine(l._k, { rate: e.target.value })} />
              <div className="num small" style={{ alignSelf: 'center', paddingRight: 4 }}>
                {money((Number(l.qty) || 0) * (Number(l.rate) || 0), { bare: true })}
              </div>
              <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => setLines((x) => (x.length > 1 ? x.filter((y) => y._k !== l._k) : x))} disabled={lines.length === 1}>
                ×
              </button>
            </div>
          ))}
        </div>

        <div className="row wrap" style={{ background: 'var(--surface-3)', border: '1px solid var(--line)', borderRadius: 'var(--r)', padding: 'var(--s3) var(--s4)', gap: 'var(--s6)' }}>
          <div>
            <div className="uplabel" style={{ fontSize: 10 }}>Taxable</div>
            <div className="num strong">{money(subtotal)}</div>
          </div>
          <div>
            <div className="uplabel" style={{ fontSize: 10 }}>GST {gstRate}%</div>
            <div className="num strong">{money(gstAmount)}</div>
          </div>
          <div>
            <div className="uplabel" style={{ fontSize: 10 }}>Total</div>
            <div className="num strong" style={{ fontSize: 'var(--fs-lg)', color: 'var(--ok-fg)' }}>{money(subtotal + gstAmount)}</div>
          </div>
        </div>

        <Field label="Notes">
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

function POView({ po, onClose, onReceive, canReceive }) {
  if (!po) return null;
  return (
    <Modal
      open={!!po}
      onClose={onClose}
      title={po.po_no}
      sub={`${po.supplier_name} · ${fmtDate(po.po_date)}`}
      size="md"
      foot={
        <>
          <button type="button" className="btn" onClick={onClose}>Close</button>
          {po.status === 'open' && canReceive && (
            <button type="button" className="btn btn-ok" onClick={() => onReceive(po)}>
              <IconCheckCircle size={14} /> Receive into stock
            </button>
          )}
        </>
      }
    >
      <div className="stack">
        <KV
          items={[
            ['Status', <StatusBadge value={po.status} />],
            ['Supplier', po.supplier_name],
            ['PO date', fmtDate(po.po_date)],
            ['Expected', po.expected_date ? fmtDate(po.expected_date) : null],
            ['Against order', po.order_no],
            ['GRN no', po.grn_no],
            ['Received on', po.received_at ? fmtDate(po.received_at) : null],
            ['Received by', po.received_by],
            ['Notes', po.notes],
          ]}
        />
        <div className="table-wrap">
          <table className="tbl compact">
            <thead>
              <tr>
                <th>Material</th>
                <th className="right">Ordered</th>
                <th className="right">Received</th>
                <th>Unit</th>
                <th className="right">Rate</th>
                <th className="right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {po.items.map((i) => (
                <tr key={i.id}>
                  <td className="strong">{i.material}</td>
                  <td className="num">{fmtQty(i.qty)}</td>
                  <td className="num">{Number(i.qty_received) > 0 ? fmtQty(i.qty_received) : '—'}</td>
                  <td>{i.unit}</td>
                  <td className="num">{money(i.rate, { bare: true })}</td>
                  <td className="num">{money(i.amount, { bare: true })}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr><td colSpan={5}>Taxable</td><td className="num">{money(po.subtotal, { bare: true })}</td></tr>
              <tr><td colSpan={5}>GST @ {po.gst_rate}%</td><td className="num">{money(po.gst_amount, { bare: true })}</td></tr>
              <tr><td colSpan={5}>Total</td><td className="num">{money(po.grand_total, { bare: true })}</td></tr>
            </tfoot>
          </table>
        </div>
      </div>
    </Modal>
  );
}
