import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import {
  Alert, Card, DataTable, Empty, Field, Input, KV, Loading, Modal, NumInput,
  PageHead, Select, Tabs, Textarea, useToast,
} from '../ui/kit.jsx';
import { money } from '../format.js';
import { IconPlus, IconUsers } from '../ui/Icons.jsx';

export default function Masters() {
  const [tab, setTab] = useState('customers');
  return (
    <div className="content-inner">
      <PageHead
        title="Masters"
        desc="Reference records used across the workflow. Keeping these tidy makes enquiry entry, costing and purchasing much faster."
      />
      <Card flush>
        <div style={{ padding: '0 var(--s5)' }}>
          <Tabs
            value={tab}
            onChange={setTab}
            items={[
              { value: 'customers', label: 'Customers' },
              { value: 'suppliers', label: 'Suppliers' },
              { value: 'products', label: 'Products' },
            ]}
          />
        </div>
        <div style={{ padding: 'var(--s5)' }}>
          {tab === 'customers' && <Customers />}
          {tab === 'suppliers' && <Suppliers />}
          {tab === 'products' && <Products />}
        </div>
      </Card>
    </div>
  );
}

/* ---------------------------------------------------------------- customers */

function Customers() {
  const { can } = useAuth();
  const nav = useNavigate();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null);
  const [adding, setAdding] = useState(false);

  const load = () => api.get('/masters/customers').then((d) => setRows(d.customers)).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  if (error) return <Alert tone="bad">{error}</Alert>;
  if (!rows) return <Loading pad={40} />;

  return (
    <div className="stack">
      {can('customer.write') && (
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>
            <IconPlus size={13} /> Add customer
          </button>
        </div>
      )}
      <DataTable
        rows={rows}
        exportName="customers"
        searchPlaceholder="Search name, company, phone, city…"
        onRowClick={can('customer.write') ? (r) => setEditing(r) : undefined}
        columns={[
          { key: 'name', label: 'Customer', render: (r) => (
            <div>
              <div className="strong">{r.name}</div>
              {r.company_name && <div className="tiny dim">{r.company_name}</div>}
            </div>
          ) },
          { key: 'phone', label: 'Phone', render: (r) => <span className="mono small">{r.phone || '—'}</span> },
          { key: 'city', label: 'City' },
          { key: 'gstin', label: 'GSTIN', render: (r) => <span className="mono small">{r.gstin || '—'}</span> },
          { key: 'enquiryCount', label: 'Enquiries', type: 'num' },
          { key: 'orderCount', label: 'Orders', type: 'num' },
          { key: 'billed', label: 'Billed', type: 'money' },
          { key: 'paid', label: 'Received', type: 'money' },
          { key: 'outstanding', label: 'Outstanding', type: 'money', render: (r) => (
            <span style={{ color: Number(r.outstanding) > 0.5 ? 'var(--bad-fg)' : undefined, fontWeight: Number(r.outstanding) > 0.5 ? 600 : 400 }}>
              {money(r.outstanding)}
            </span>
          ) },
        ]}
        empty={<Empty icon={IconUsers} title="No customers yet">Customers are added automatically when you save an enquiry, or you can add them here.</Empty>}
      />
      <CustomerModal
        open={adding || !!editing}
        customer={editing}
        onClose={() => { setAdding(false); setEditing(null); }}
        onSaved={() => { setAdding(false); setEditing(null); load(); }}
      />
    </div>
  );
}

function CustomerModal({ open, customer, onClose, onSaved }) {
  const toast = useToast();
  const isEdit = !!customer;
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    setForm(
      customer
        ? { ...customer }
        : { name: '', company_name: '', phone: '', alt_phone: '', email: '', gstin: '', pan: '', address: '', city: '', state: 'Gujarat', pincode: '', credit_days: 0, notes: '' }
    );
  }, [open, customer]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function save() {
    if (!String(form.name || '').trim()) return setError('Customer name is required.');
    setBusy(true);
    try {
      const payload = {
        name: form.name, company_name: form.company_name, phone: form.phone, alt_phone: form.alt_phone,
        email: form.email, gstin: form.gstin, pan: form.pan, address: form.address, city: form.city,
        state: form.state, pincode: form.pincode, credit_days: Number(form.credit_days) || 0, notes: form.notes, code: form.code,
      };
      if (isEdit) await api.patch(`/masters/customers/${customer.id}`, payload);
      else await api.post('/masters/customers', payload);
      toast.success(isEdit ? 'Customer updated' : 'Customer added');
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
      title={isEdit ? `Edit ${customer.name}` : 'Add a customer'}
      size="md"
      foot={
        <>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={save} disabled={busy}>
            {busy && <span className="spinner" />}
            {isEdit ? 'Save changes' : 'Add customer'}
          </button>
        </>
      }
    >
      <div className="stack">
        {error && <Alert tone="bad">{error}</Alert>}
        {isEdit && (
          <KV
            items={[
              ['Enquiries', String(customer.enquiryCount)],
              ['Orders', String(customer.orderCount)],
              ['Billed', money(customer.billed)],
              ['Outstanding', money(customer.outstanding)],
            ]}
          />
        )}
        <div className="grid grid-2">
          <Field label="Customer name" required>
            <Input value={form.name || ''} onChange={set('name')} autoFocus />
          </Field>
          <Field label="Company name">
            <Input value={form.company_name || ''} onChange={set('company_name')} />
          </Field>
          <Field label="Phone">
            <Input value={form.phone || ''} onChange={set('phone')} inputMode="tel" />
          </Field>
          <Field label="Alternate phone">
            <Input value={form.alt_phone || ''} onChange={set('alt_phone')} inputMode="tel" />
          </Field>
          <Field label="Email">
            <Input type="email" value={form.email || ''} onChange={set('email')} />
          </Field>
          <Field label="Customer code">
            <Input value={form.code || ''} onChange={set('code')} />
          </Field>
          <Field label="GSTIN">
            <Input value={form.gstin || ''} onChange={set('gstin')} style={{ textTransform: 'uppercase' }} />
          </Field>
          <Field label="PAN">
            <Input value={form.pan || ''} onChange={set('pan')} style={{ textTransform: 'uppercase' }} />
          </Field>
          <Field label="Address" span={2}>
            <Textarea rows={2} value={form.address || ''} onChange={set('address')} />
          </Field>
          <Field label="City">
            <Input value={form.city || ''} onChange={set('city')} />
          </Field>
          <Field label="State">
            <Input value={form.state || ''} onChange={set('state')} />
          </Field>
          <Field label="PIN code">
            <Input value={form.pincode || ''} onChange={set('pincode')} inputMode="numeric" />
          </Field>
          <Field label="Credit days">
            <NumInput value={form.credit_days ?? 0} min="0" onChange={set('credit_days')} />
          </Field>
          <Field label="Notes" span={2}>
            <Textarea rows={2} value={form.notes || ''} onChange={set('notes')} />
          </Field>
        </div>
      </div>
    </Modal>
  );
}

/* ---------------------------------------------------------------- suppliers */

function Suppliers() {
  const { can } = useAuth();
  const toast = useToast();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null);
  const [adding, setAdding] = useState(false);

  const load = () => api.get('/masters/suppliers').then((d) => setRows(d.suppliers)).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  if (error) return <Alert tone="bad">{error}</Alert>;
  if (!rows) return <Loading pad={40} />;

  return (
    <div className="stack">
      {can('supplier.write') && (
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>
            <IconPlus size={13} /> Add supplier
          </button>
        </div>
      )}
      <DataTable
        rows={rows}
        exportName="suppliers"
        searchPlaceholder="Search supplier, contact, city…"
        onRowClick={can('supplier.write') ? (r) => setEditing(r) : undefined}
        columns={[
          { key: 'name', label: 'Supplier', render: (r) => <span className="strong">{r.name}</span> },
          { key: 'contact_person', label: 'Contact person' },
          { key: 'phone', label: 'Phone', render: (r) => <span className="mono small">{r.phone || '—'}</span> },
          { key: 'city', label: 'City' },
          { key: 'gstin', label: 'GSTIN', render: (r) => <span className="mono small">{r.gstin || '—'}</span> },
          { key: 'payment_terms', label: 'Payment terms' },
        ]}
        empty={<Empty title="No suppliers yet">Add the suppliers you buy raw material from so purchase orders are quick to raise.</Empty>}
      />
      <SupplierModal
        open={adding || !!editing}
        supplier={editing}
        onClose={() => { setAdding(false); setEditing(null); }}
        onSaved={() => { setAdding(false); setEditing(null); load(); }}
      />
    </div>
  );
}

function SupplierModal({ open, supplier, onClose, onSaved }) {
  const toast = useToast();
  const isEdit = !!supplier;
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    setForm(supplier ? { ...supplier } : { name: '', contact_person: '', phone: '', email: '', gstin: '', address: '', city: '', state: 'Gujarat', pincode: '', payment_terms: '' });
  }, [open, supplier]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function save() {
    if (!String(form.name || '').trim()) return setError('Supplier name is required.');
    setBusy(true);
    try {
      if (isEdit) await api.patch(`/masters/suppliers/${supplier.id}`, form);
      else await api.post('/masters/suppliers', form);
      toast.success(isEdit ? 'Supplier updated' : 'Supplier added');
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
      title={isEdit ? `Edit ${supplier.name}` : 'Add a supplier'}
      foot={
        <>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={save} disabled={busy}>
            {busy && <span className="spinner" />}
            {isEdit ? 'Save changes' : 'Add supplier'}
          </button>
        </>
      }
    >
      <div className="stack">
        {error && <Alert tone="bad">{error}</Alert>}
        <div className="grid grid-2">
          <Field label="Supplier name" required span={2}>
            <Input value={form.name || ''} onChange={set('name')} autoFocus />
          </Field>
          <Field label="Contact person">
            <Input value={form.contact_person || ''} onChange={set('contact_person')} />
          </Field>
          <Field label="Phone">
            <Input value={form.phone || ''} onChange={set('phone')} inputMode="tel" />
          </Field>
          <Field label="Email">
            <Input type="email" value={form.email || ''} onChange={set('email')} />
          </Field>
          <Field label="GSTIN">
            <Input value={form.gstin || ''} onChange={set('gstin')} style={{ textTransform: 'uppercase' }} />
          </Field>
          <Field label="Address" span={2}>
            <Textarea rows={2} value={form.address || ''} onChange={set('address')} />
          </Field>
          <Field label="City">
            <Input value={form.city || ''} onChange={set('city')} />
          </Field>
          <Field label="State">
            <Input value={form.state || ''} onChange={set('state')} />
          </Field>
          <Field label="Payment terms" span={2}>
            <Input value={form.payment_terms || ''} onChange={set('payment_terms')} placeholder="e.g. 30 days credit" />
          </Field>
        </div>
      </div>
    </Modal>
  );
}

/* ----------------------------------------------------------------- products */

function Products() {
  const { can } = useAuth();
  const toast = useToast();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: '', code: '', category: '', default_size: '', hsn: '', notes: '' });
  const [busy, setBusy] = useState(false);

  const load = () => api.get('/masters/products').then((d) => setRows(d.products)).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  async function save() {
    if (!form.name.trim()) return;
    setBusy(true);
    try {
      await api.post('/masters/products', form);
      toast.success('Product added');
      setForm({ name: '', code: '', category: '', default_size: '', hsn: '', notes: '' });
      setAdding(false);
      load();
    } catch (e) {
      toast.error('Could not add the product', e.message);
    } finally {
      setBusy(false);
    }
  }

  if (error) return <Alert tone="bad">{error}</Alert>;
  if (!rows) return <Loading pad={40} />;

  return (
    <div className="stack">
      <Alert tone="info">
        The product catalogue is optional — it just speeds up enquiry entry by suggesting product names as you type.
      </Alert>
      {can('product.write') && (
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>
            <IconPlus size={13} /> Add product
          </button>
        </div>
      )}
      <DataTable
        rows={rows}
        exportName="products"
        columns={[
          { key: 'code', label: 'Code', render: (r) => <span className="mono small">{r.code || '—'}</span> },
          { key: 'name', label: 'Product', render: (r) => <span className="strong">{r.name}</span> },
          { key: 'category', label: 'Category' },
          { key: 'default_size', label: 'Typical size' },
          { key: 'hsn', label: 'HSN' },
          { key: 'notes', label: 'Notes' },
        ]}
        empty={<Empty title="No products in the catalogue">Add the items you make most often — wardrobes, TV units, kitchen cabinets and so on.</Empty>}
      />

      <Modal
        open={adding}
        onClose={() => setAdding(false)}
        title="Add a product"
        foot={
          <>
            <button type="button" className="btn" onClick={() => setAdding(false)}>Cancel</button>
            <button type="button" className="btn btn-primary" onClick={save} disabled={busy || !form.name.trim()}>
              {busy && <span className="spinner" />}
              Add product
            </button>
          </>
        }
      >
        <div className="grid grid-2">
          <Field label="Product name" required span={2}>
            <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} autoFocus />
          </Field>
          <Field label="Code">
            <Input value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} />
          </Field>
          <Field label="Category">
            <Input value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} />
          </Field>
          <Field label="Typical size">
            <Input value={form.default_size} onChange={(e) => setForm((f) => ({ ...f, default_size: e.target.value }))} />
          </Field>
          <Field label="HSN code">
            <Input value={form.hsn} onChange={(e) => setForm((f) => ({ ...f, hsn: e.target.value }))} />
          </Field>
          <Field label="Notes" span={2}>
            <Textarea rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
