import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, qs } from '../api.js';
import { useAuth } from '../auth.jsx';
import {
  Alert, Badge, Card, Check, ConfirmModal, DataTable, Empty, Field, Input, KV, Loading,
  Modal, NumInput, PageHead, Section, Select, StatusBadge, Tabs, Textarea, YesNo, useToast,
} from '../ui/kit.jsx';
import { fmtDate, money, todayStr, qty as fmtQty } from '../format.js';
import { IconPlus, IconArrowLeft, IconArrowRight, IconEdit, IconXCircle } from '../ui/Icons.jsx';

/* ============================================================== list screen */

export function EnquiryList() {
  const { can } = useAuth();
  const nav = useNavigate();
  const [tab, setTab] = useState('open');
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');

  const load = () =>
    api
      .get(`/enquiries${qs({ status: 'all' })}`)
      .then((d) => setRows(d.enquiries))
      .catch((e) => setError(e.message));

  useEffect(() => {
    load();
  }, []);

  const counts = useMemo(() => {
    if (!rows) return {};
    return {
      all: rows.length,
      open: rows.filter((r) => r.status === 'open').length,
      converted: rows.filter((r) => r.status === 'converted').length,
      lost: rows.filter((r) => r.status === 'lost').length,
    };
  }, [rows]);

  const visible = useMemo(() => (rows || []).filter((r) => tab === 'all' || r.status === tab), [rows, tab]);

  if (error) return <div className="content-inner"><Alert tone="bad" title="Could not load enquiries">{error}</Alert></div>;
  if (!rows) return <Loading pad={80} />;

  return (
    <div className="content-inner">
      <PageHead
        title="Enquiries"
        desc="Step 1 of the workflow. Log the customer requirement, then send it to Factory / Costing to open an order."
      >
        {can('enquiry.create') && (
          <Link to="/enquiries/new" className="btn btn-primary">
            <IconPlus size={15} /> New enquiry
          </Link>
        )}
      </PageHead>

      <Card flush>
        <div style={{ padding: '0 var(--s5)' }}>
          <Tabs
            value={tab}
            onChange={setTab}
            items={[
              { value: 'open', label: 'Open', count: counts.open },
              { value: 'converted', label: 'Converted to orders', count: counts.converted },
              { value: 'lost', label: 'Lost', count: counts.lost },
              { value: 'all', label: 'All', count: counts.all },
            ]}
          />
        </div>
        <div style={{ padding: 'var(--s4) var(--s5) var(--s5)' }}>
          <DataTable
            rows={visible}
            exportName={`enquiries-${tab}`}
            searchPlaceholder="Search by number, customer, phone, city…"
            onRowClick={(r) => nav(`/enquiries/${r.id}`)}
            empty={
              <Empty title={tab === 'open' ? 'No open enquiries' : `No ${tab} enquiries`}>
                {tab === 'open'
                  ? 'Every enquiry has been actioned. Create a new one when the next customer calls.'
                  : 'Nothing to show in this list yet.'}
              </Empty>
            }
            columns={[
              { key: 'enquiry_no', label: 'Enquiry no', render: (r) => <span className="mono strong">{r.enquiry_no}</span> },
              { key: 'enquiry_date', label: 'Date', type: 'date' },
              {
                key: 'cust_name',
                label: 'Customer',
                render: (r) => (
                  <div>
                    <div className="strong truncate" style={{ maxWidth: 220 }}>{r.cust_name}</div>
                    {r.cust_company && <div className="tiny dim truncate" style={{ maxWidth: 220 }}>{r.cust_company}</div>}
                  </div>
                ),
              },
              { key: 'cust_city', label: 'City' },
              { key: 'cust_phone', label: 'Phone', render: (r) => <span className="mono small">{r.cust_phone || '—'}</span> },
              { key: 'item_count', label: 'Items', type: 'num' },
              { key: 'expected_budget', label: 'Budget', type: 'money' },
              { key: 'stage_label', label: 'Follow-up', render: (r) => (r.status === 'open' ? <Badge tone="neutral">{r.stage_label}</Badge> : <span className="dim">—</span>) },
              { key: 'status', label: 'Status', type: 'status' },
              {
                key: 'order_no',
                label: 'Order',
                render: (r) =>
                  r.order_no ? (
                    <Link to={`/orders/${r.order_id}`} className="mono small" onClick={(e) => e.stopPropagation()}>
                      {r.order_no}
                    </Link>
                  ) : r.lost_reason ? (
                    <span className="tiny dim truncate" style={{ maxWidth: 130, display: 'inline-block' }}>{r.lost_reason}</span>
                  ) : (
                    <span className="dim">—</span>
                  ),
              },
            ]}
          />
        </div>
      </Card>
    </div>
  );
}

/* ============================================================ detail screen */

export function EnquiryDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const { can, meta } = useAuth();
  const [enq, setEnq] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [lostOpen, setLostOpen] = useState(false);

  const load = () =>
    api
      .get(`/enquiries/${id}`)
      .then((d) => setEnq(d.enquiry))
      .catch((e) => setError(e.message));

  useEffect(() => {
    load();
  }, [id]);

  if (error) return <div className="content-inner"><Alert tone="bad" title="Could not load this enquiry">{error}</Alert></div>;
  if (!enq) return <Loading pad={80} />;

  async function send() {
    setBusy('send');
    try {
      const r = await api.post(`/enquiries/${id}/send`);
      toast.success('Sent to Factory / Costing', `Order ${r.order.order_no} created.`);
      nav(`/orders/${r.order.id}`);
    } catch (e) {
      toast.error('Could not send to the factory', e.message);
      setBusy('');
    }
  }

  async function markLost(reason) {
    setBusy('lost');
    try {
      await api.post(`/enquiries/${id}/lost`, { lost_reason: reason, lost_reason_note: reason === 'Others' ? 'See notes' : '' });
      toast.success('Enquiry closed as lost', 'It stays in the reports for analysis.');
      setLostOpen(false);
      await load();
    } catch (e) {
      toast.error('Could not close the enquiry', e.message);
    } finally {
      setBusy('');
    }
  }

  async function reopen() {
    setBusy('reopen');
    try {
      await api.post(`/enquiries/${id}/reopen`);
      toast.success('Enquiry reopened');
      await load();
    } catch (e) {
      toast.error('Could not reopen', e.message);
    } finally {
      setBusy('');
    }
  }

  const editable = enq.status === 'open' && can('enquiry.edit');

  return (
    <div className="content-inner narrow">
      <PageHead title={enq.enquiry_no} desc={`Enquiry received ${fmtDate(enq.enquiry_date)}${enq.enquiry_time ? ` at ${enq.enquiry_time}` : ''}`}>
        <Link to="/enquiries" className="btn">
          <IconArrowLeft size={14} /> All enquiries
        </Link>
        {editable && (
          <Link to={`/enquiries/${id}/edit`} className="btn">
            <IconEdit size={14} /> Edit
          </Link>
        )}
        {enq.status === 'open' && can('enquiry.lost') && (
          <button type="button" className="btn btn-danger" onClick={() => setLostOpen(true)}>
            <IconXCircle size={14} /> Mark lost
          </button>
        )}
        {enq.status === 'open' && can('enquiry.send') && (
          <button type="button" className="btn btn-primary" onClick={send} disabled={busy === 'send' || !enq.items.length}>
            {busy === 'send' ? <span className="spinner" /> : null}
            Send to Factory / Costing <IconArrowRight size={14} />
          </button>
        )}
        {enq.status === 'lost' && can('enquiry.edit') && (
          <button type="button" className="btn" onClick={reopen} disabled={busy === 'reopen'}>
            Reopen enquiry
          </button>
        )}
      </PageHead>

      <div className="stack">
        {enq.status === 'converted' && enq.order && (
          <Alert tone="ok" title={`Converted to order ${enq.order.order_no}`}>
            This enquiry is now running through the workflow.{' '}
            <Link to={`/orders/${enq.order.id}`}>Open the order pipeline →</Link>
          </Alert>
        )}
        {enq.status === 'lost' && (
          <Alert tone="bad" title={`Closed as lost — ${enq.lost_reason || 'no reason recorded'}`}>
            {enq.lost_reason_note || 'This enquiry is archived and counted in the lost-enquiry report.'}
          </Alert>
        )}
        {enq.status === 'open' && !enq.items.length && (
          <Alert tone="warn" title="No products added">
            Add at least one product line before this enquiry can go to the factory.
          </Alert>
        )}

        <div className="grid grid-2" style={{ alignItems: 'start' }}>
          <Card title="Customer">
            <KV
              items={[
                ['Name', enq.cust_name],
                ['Company', enq.cust_company],
                ['Phone', enq.cust_phone],
                ['Alternate', enq.cust_alt_phone],
                ['Email', enq.cust_email],
                ['GSTIN', enq.cust_gstin],
                ['PAN', enq.cust_pan],
                ['Address', [enq.cust_address, enq.cust_city, enq.cust_state, enq.cust_pincode].filter(Boolean).join(', ')],
              ]}
            />
          </Card>

          <div className="stack">
            <Card title="Enquiry details">
              <KV
                items={[
                  ['Received on', fmtDate(enq.enquiry_date)],
                  ['Taken by', enq.taken_by],
                  ['Source / reference', enq.reference],
                  ['Follow-up stage', enq.status === 'open' ? <Badge tone="neutral">{enq.stage_label}</Badge> : null],
                  ['Expected budget', enq.expected_budget ? money(enq.expected_budget) : null],
                  ['Required by', enq.required_date ? fmtDate(enq.required_date) : null],
                  ['Installation', enq.installation_required],
                  ['Payment terms', enq.payment_terms],
                ]}
              />
            </Card>

            {(enq.site_name || enq.site_address || enq.visit_required === 'Yes') && (
              <Card title="Site">
                <KV
                  items={[
                    ['Site name', enq.site_name],
                    ['Address', [enq.site_address, enq.site_city].filter(Boolean).join(', ')],
                    ['Contact', enq.site_contact],
                    ['Mobile', enq.site_mobile],
                    ['Visit required', enq.visit_required],
                    ['Measurement taken', enq.measurement_taken],
                    ['Measured by', enq.measurement_by],
                    ['Measured on', enq.measurement_date ? fmtDate(enq.measurement_date) : null],
                  ]}
                />
              </Card>
            )}
          </div>
        </div>

        <Card title={`Products required (${enq.items.length})`} flush>
          {enq.items.length ? (
            <div className="table-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th style={{ width: 40 }}>#</th>
                    <th>Product</th>
                    <th>Size</th>
                    <th className="right">Qty</th>
                    <th>Material</th>
                    <th>Laminate / colour</th>
                    <th>Hardware</th>
                    <th>Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  {enq.items.map((it, i) => (
                    <tr key={it.id}>
                      <td className="dim">{i + 1}</td>
                      <td className="strong">{it.product}</td>
                      <td>{it.size || '—'}</td>
                      <td className="num">{fmtQty(it.qty)} {it.unit}</td>
                      <td>{it.material || '—'}</td>
                      <td>{[it.laminate, it.colour].filter(Boolean).join(' · ') || '—'}</td>
                      <td>{it.hardware || '—'}</td>
                      <td className="small muted">{it.remarks || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty title="No products yet">Edit this enquiry to add what the customer needs.</Empty>
          )}
        </Card>

        {enq.notes && (
          <Card title="Notes">
            <p style={{ whiteSpace: 'pre-wrap' }}>{enq.notes}</p>
          </Card>
        )}
      </div>

      <ConfirmModal
        open={lostOpen}
        onClose={() => setLostOpen(false)}
        onConfirm={markLost}
        busy={busy === 'lost'}
        title="Close this enquiry as lost"
        confirmLabel="Close as lost"
        tone="danger"
        requireReason
        reasonLabel="Reason for rejection"
        reasonOptions={meta.lostReasons}
        body={
          <p className="muted">
            The enquiry will be archived and counted in the lost-enquiry report. You can reopen it later if the
            customer comes back.
          </p>
        }
      />
    </div>
  );
}

/* ============================================================= editor screen */

const emptyItem = () => ({
  _k: Math.random().toString(36).slice(2),
  product: '', size: '', qty: 1, unit: 'nos', material: '', laminate: '', colour: '', hardware: '', remarks: '',
});

export function EnquiryEditor({ mode }) {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const { meta } = useAuth();
  const isNew = mode === 'new';

  const [form, setForm] = useState(() => ({
    enquiry_date: todayStr(),
    enquiry_time: new Date().toTimeString().slice(0, 5),
    stage_label: 'New',
    cust_name: '', cust_company: '', cust_phone: '', cust_alt_phone: '', cust_email: '',
    cust_gstin: '', cust_pan: '', cust_address: '', cust_city: '', cust_state: 'Gujarat', cust_pincode: '',
    reference: '', taken_by: '', expected_budget: '',
    site_name: '', site_address: '', site_city: '', site_contact: '', site_mobile: '',
    visit_required: 'No', measurement_taken: 'No', measurement_by: '', measurement_date: '',
    required_date: '', installation_required: 'No', payment_terms: '', notes: '',
    save_customer: true,
  }));
  const [items, setItems] = useState([emptyItem()]);
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(!isNew);
  const [busy, setBusy] = useState('');
  const [errors, setErrors] = useState({});
  const [topError, setTopError] = useState('');

  useEffect(() => {
    api.get('/masters/customers').then((d) => setCustomers(d.customers)).catch(() => {});
    api.get('/masters/products').then((d) => setProducts(d.products)).catch(() => {});
  }, []);

  useEffect(() => {
    if (isNew) return;
    api
      .get(`/enquiries/${id}`)
      .then((d) => {
        const e = d.enquiry;
        setForm((f) => ({
          ...f,
          ...Object.fromEntries(Object.keys(f).map((k) => [k, e[k] ?? f[k]])),
          expected_budget: e.expected_budget || '',
          save_customer: false,
        }));
        setItems(e.items.length ? e.items.map((it) => ({ ...it, _k: String(it.id) })) : [emptyItem()]);
      })
      .catch((e) => setTopError(e.message))
      .finally(() => setLoading(false));
  }, [id, isNew]);

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const setEv = (k) => (e) => set(k)(e.target.value);

  function pickCustomer(cid) {
    const c = customers.find((x) => String(x.id) === String(cid));
    if (!c) return;
    setForm((f) => ({
      ...f,
      customer_id: c.id,
      cust_name: c.name || '',
      cust_company: c.company_name || '',
      cust_phone: c.phone || '',
      cust_alt_phone: c.alt_phone || '',
      cust_email: c.email || '',
      cust_gstin: c.gstin || '',
      cust_pan: c.pan || '',
      cust_address: c.address || '',
      cust_city: c.city || '',
      cust_state: c.state || '',
      cust_pincode: c.pincode || '',
      save_customer: false,
    }));
  }

  const updateItem = (k, patch) => setItems((list) => list.map((it) => (it._k === k ? { ...it, ...patch } : it)));
  const removeItem = (k) => setItems((list) => (list.length === 1 ? [emptyItem()] : list.filter((it) => it._k !== k)));

  const filledItems = items.filter((it) => String(it.product || '').trim());

  function validate(needItems) {
    const e = {};
    if (!form.cust_name.trim()) e.cust_name = 'Customer name is required.';
    if (needItems && !filledItems.length) e.items = 'Add at least one product.';
    for (const it of filledItems) {
      if (!(Number(it.qty) > 0)) e.items = 'Every product needs a quantity greater than zero.';
    }
    setErrors(e);
    if (Object.keys(e).length) setTopError('Please fix the highlighted fields.');
    else setTopError('');
    return !Object.keys(e).length;
  }

  async function save(send) {
    if (!validate(send)) return;
    setBusy(send ? 'send' : 'save');
    const payload = {
      ...form,
      expected_budget: Number(form.expected_budget) || 0,
      items: filledItems.map((it) => ({
        product: it.product, size: it.size, qty: Number(it.qty) || 1, unit: it.unit || 'nos',
        material: it.material, laminate: it.laminate, colour: it.colour, hardware: it.hardware, remarks: it.remarks,
      })),
      send,
    };
    try {
      if (isNew) {
        const r = await api.post('/enquiries', payload);
        if (send && r.order) {
          toast.success('Enquiry sent to Factory / Costing', `Order ${r.order.order_no} created.`);
          nav(`/orders/${r.order.id}`);
        } else {
          toast.success('Enquiry saved', r.enquiry_no);
          nav(`/enquiries/${r.id}`);
        }
      } else {
        const r = await api.patch(`/enquiries/${id}`, payload);
        if (send && r.order) {
          toast.success('Enquiry sent to Factory / Costing', `Order ${r.order.order_no} created.`);
          nav(`/orders/${r.order.id}`);
        } else {
          toast.success('Enquiry updated');
          nav(`/enquiries/${id}`);
        }
      }
    } catch (e) {
      setTopError(e.message);
      toast.error(send ? 'Could not send to the factory' : 'Could not save', e.message);
      setBusy('');
    }
  }

  if (loading) return <Loading pad={80} />;

  return (
    <div className="content-inner narrow">
      <PageHead
        title={isNew ? 'New enquiry' : 'Edit enquiry'}
        desc="Capture what the customer wants. Saving keeps it in your follow-up list; sending it opens an order at Factory / Costing."
      >
        <button type="button" className="btn" onClick={() => nav(isNew ? '/enquiries' : `/enquiries/${id}`)}>
          Cancel
        </button>
        <button type="button" className="btn" onClick={() => save(false)} disabled={!!busy}>
          {busy === 'save' && <span className="spinner" />}
          Save only
        </button>
        <button type="button" className="btn btn-primary" onClick={() => save(true)} disabled={!!busy}>
          {busy === 'send' && <span className="spinner" />}
          Save &amp; send to factory <IconArrowRight size={14} />
        </button>
      </PageHead>

      <div className="stack">
        {topError && <Alert tone="bad">{topError}</Alert>}

        <Card title="Customer">
          <div className="stack">
            {customers.length > 0 && (
              <Field label="Pick an existing customer" hint="Or just type the details below for a new customer.">
                <Select
                  placeholder="— new customer —"
                  value={form.customer_id || ''}
                  onChange={(e) => (e.target.value ? pickCustomer(e.target.value) : set('customer_id')(''))}
                  options={customers.map((c) => ({
                    value: c.id,
                    label: `${c.name}${c.company_name ? ` · ${c.company_name}` : ''}${c.city ? ` · ${c.city}` : ''}`,
                  }))}
                />
              </Field>
            )}

            <div className="grid grid-2">
              <Field label="Customer name" required error={errors.cust_name}>
                <Input value={form.cust_name} onChange={setEv('cust_name')} invalid={!!errors.cust_name} autoFocus />
              </Field>
              <Field label="Company name">
                <Input value={form.cust_company} onChange={setEv('cust_company')} />
              </Field>
              <Field label="Phone">
                <Input value={form.cust_phone} onChange={setEv('cust_phone')} inputMode="tel" />
              </Field>
              <Field label="Alternate phone">
                <Input value={form.cust_alt_phone} onChange={setEv('cust_alt_phone')} inputMode="tel" />
              </Field>
              <Field label="Email">
                <Input type="email" value={form.cust_email} onChange={setEv('cust_email')} />
              </Field>
              <Field label="GSTIN">
                <Input value={form.cust_gstin} onChange={setEv('cust_gstin')} style={{ textTransform: 'uppercase' }} />
              </Field>
              <Field label="PAN">
                <Input value={form.cust_pan} onChange={setEv('cust_pan')} style={{ textTransform: 'uppercase' }} />
              </Field>
              <Field label="City">
                <Input value={form.cust_city} onChange={setEv('cust_city')} />
              </Field>
              <Field label="Address" span={2}>
                <Textarea rows={2} value={form.cust_address} onChange={setEv('cust_address')} />
              </Field>
              <Field label="State">
                <Input value={form.cust_state} onChange={setEv('cust_state')} />
              </Field>
              <Field label="PIN code">
                <Input value={form.cust_pincode} onChange={setEv('cust_pincode')} inputMode="numeric" />
              </Field>
            </div>

            {!form.customer_id && (
              <Check
                label="Also save this customer to the customer master"
                hint="So you can pick them next time without retyping."
                checked={form.save_customer}
                onChange={set('save_customer')}
              />
            )}
          </div>
        </Card>

        <Card title="Enquiry details">
          <div className="grid grid-3">
            <Field label="Enquiry date" required>
              <Input type="date" value={form.enquiry_date} onChange={setEv('enquiry_date')} />
            </Field>
            <Field label="Time">
              <Input type="time" value={form.enquiry_time} onChange={setEv('enquiry_time')} />
            </Field>
            <Field label="Follow-up stage">
              <Select value={form.stage_label} onChange={setEv('stage_label')} options={meta.enquiryStageLabels} />
            </Field>
            <Field label="Taken by" hint="Defaults to you.">
              <Input value={form.taken_by} onChange={setEv('taken_by')} />
            </Field>
            <Field label="Source / reference" hint="Walk-in, website, architect…">
              <Input value={form.reference} onChange={setEv('reference')} />
            </Field>
            <Field label="Expected budget (₹)">
              <NumInput value={form.expected_budget} onChange={setEv('expected_budget')} min="0" />
            </Field>
            <Field label="Required by">
              <Input type="date" value={form.required_date || ''} onChange={setEv('required_date')} />
            </Field>
            <Field label="Installation required">
              <YesNo value={form.installation_required} onChange={set('installation_required')} />
            </Field>
            <Field label="Payment terms discussed">
              <Input value={form.payment_terms} onChange={setEv('payment_terms')} placeholder="e.g. 50% advance" />
            </Field>
          </div>
        </Card>

        <Card title="Site details" sub="Fill this in if a visit or measurement is involved">
          <div className="grid grid-3">
            <Field label="Site name">
              <Input value={form.site_name} onChange={setEv('site_name')} />
            </Field>
            <Field label="Site city">
              <Input value={form.site_city} onChange={setEv('site_city')} />
            </Field>
            <Field label="Site contact person">
              <Input value={form.site_contact} onChange={setEv('site_contact')} />
            </Field>
            <Field label="Site address" span={2}>
              <Textarea rows={2} value={form.site_address} onChange={setEv('site_address')} />
            </Field>
            <Field label="Site mobile">
              <Input value={form.site_mobile} onChange={setEv('site_mobile')} inputMode="tel" />
            </Field>
            <Field label="Visit required">
              <YesNo value={form.visit_required} onChange={set('visit_required')} />
            </Field>
            <Field label="Measurement taken">
              <YesNo value={form.measurement_taken} onChange={set('measurement_taken')} />
            </Field>
            {form.measurement_taken === 'Yes' && (
              <>
                <Field label="Measured by">
                  <Input value={form.measurement_by} onChange={setEv('measurement_by')} />
                </Field>
                <Field label="Measured on">
                  <Input type="date" value={form.measurement_date || ''} onChange={setEv('measurement_date')} />
                </Field>
              </>
            )}
          </div>
        </Card>

        <Card
          title={`Products required (${filledItems.length})`}
          sub="Each product gets its own costing sheet in the factory"
          action={
            <button type="button" className="btn btn-sm btn-dashed" onClick={() => setItems((l) => [...l, emptyItem()])}>
              <IconPlus size={13} /> Add product
            </button>
          }
        >
          <div className="stack">
            {errors.items && <Alert tone="bad">{errors.items}</Alert>}
            {items.map((it, idx) => (
              <div
                key={it._k}
                style={{
                  border: '1px solid var(--line)',
                  borderRadius: 'var(--r)',
                  padding: 'var(--s3) var(--s4) var(--s4)',
                  background: 'var(--surface-2)',
                }}
              >
                <div className="between" style={{ marginBottom: 10 }}>
                  <span className="uplabel">Product {idx + 1}</span>
                  {items.length > 1 && (
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeItem(it._k)}>
                      Remove
                    </button>
                  )}
                </div>
                <div className="grid grid-4">
                  <Field label="Product" required span={2}>
                    <Input
                      value={it.product}
                      onChange={(e) => updateItem(it._k, { product: e.target.value })}
                      list="product-master"
                      placeholder="e.g. Wardrobe 8ft"
                    />
                  </Field>
                  <Field label="Size">
                    <Input value={it.size} onChange={(e) => updateItem(it._k, { size: e.target.value })} placeholder="8x7 ft" />
                  </Field>
                  <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 8 }}>
                    <Field label="Qty" required>
                      <NumInput value={it.qty} min="0" step="any" onChange={(e) => updateItem(it._k, { qty: e.target.value })} />
                    </Field>
                    <Field label="Unit">
                      <Select value={it.unit} onChange={(e) => updateItem(it._k, { unit: e.target.value })} options={meta.units} />
                    </Field>
                  </div>
                  <Field label="Material">
                    <Input value={it.material} onChange={(e) => updateItem(it._k, { material: e.target.value })} placeholder="BWP ply" />
                  </Field>
                  <Field label="Laminate">
                    <Input value={it.laminate} onChange={(e) => updateItem(it._k, { laminate: e.target.value })} />
                  </Field>
                  <Field label="Colour">
                    <Input value={it.colour} onChange={(e) => updateItem(it._k, { colour: e.target.value })} />
                  </Field>
                  <Field label="Hardware">
                    <Input value={it.hardware} onChange={(e) => updateItem(it._k, { hardware: e.target.value })} placeholder="Hettich" />
                  </Field>
                  <Field label="Remarks" span={4}>
                    <Input value={it.remarks} onChange={(e) => updateItem(it._k, { remarks: e.target.value })} />
                  </Field>
                </div>
              </div>
            ))}
            <datalist id="product-master">
              {products.map((p) => (
                <option key={p.id} value={p.name} />
              ))}
            </datalist>
          </div>
        </Card>

        <Card title="Internal notes">
          <Textarea rows={3} value={form.notes} onChange={setEv('notes')} placeholder="Anything the factory or sales team should know…" />
        </Card>

        <div className="row" style={{ justifyContent: 'flex-end', paddingBottom: 8 }}>
          <button type="button" className="btn" onClick={() => save(false)} disabled={!!busy}>
            {busy === 'save' && <span className="spinner" />}
            Save only
          </button>
          <button type="button" className="btn btn-primary" onClick={() => save(true)} disabled={!!busy}>
            {busy === 'send' && <span className="spinner" />}
            Save &amp; send to factory <IconArrowRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
