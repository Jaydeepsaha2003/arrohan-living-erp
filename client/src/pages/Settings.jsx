import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import {
  Alert, Card, DataTable, Empty, Field, Input, Loading, NumInput, PageHead, Tabs, Textarea, useToast,
} from '../ui/kit.jsx';
import { IconSettings } from '../ui/Icons.jsx';

export default function Settings() {
  const [tab, setTab] = useState('company');
  return (
    <div className="content-inner narrow">
      <PageHead
        title="Settings"
        desc="Company details print on every document. Defaults prefill the workflow forms so staff type less."
      />
      <Card flush>
        <div style={{ padding: '0 var(--s5)' }}>
          <Tabs
            value={tab}
            onChange={setTab}
            items={[
              { value: 'company', label: 'Company & letterhead' },
              { value: 'defaults', label: 'Workflow defaults' },
              { value: 'numbering', label: 'Document numbering' },
            ]}
          />
        </div>
        <div style={{ padding: 'var(--s5)' }}>
          {tab === 'company' && <CompanyForm />}
          {tab === 'defaults' && <DefaultsForm />}
          {tab === 'numbering' && <Numbering />}
        </div>
      </Card>
    </div>
  );
}

function CompanyForm() {
  const toast = useToast();
  const { company, setCompany } = useAuth();
  const [form, setForm] = useState(company || {});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (company) setForm(company);
  }, [company]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function save() {
    setBusy(true);
    setError('');
    try {
      const r = await api.put('/settings/company', form);
      setCompany(r.company);
      toast.success('Company details saved', 'They will appear on every document from now on.');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      {error && <Alert tone="bad">{error}</Alert>}
      <div className="grid grid-2">
        <Field label="Company name" required span={2}>
          <Input value={form.name || ''} onChange={set('name')} />
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
          <Input value={form.pincode || ''} onChange={set('pincode')} />
        </Field>
        <Field label="Mobile">
          <Input value={form.mobile || ''} onChange={set('mobile')} />
        </Field>
        <Field label="Email">
          <Input type="email" value={form.email || ''} onChange={set('email')} />
        </Field>
        <Field label="Website">
          <Input value={form.website || ''} onChange={set('website')} />
        </Field>
        <Field label="GSTIN" hint="Used to decide CGST+SGST versus IGST on invoices">
          <Input value={form.gstin || ''} onChange={set('gstin')} style={{ textTransform: 'uppercase' }} />
        </Field>
        <Field label="PAN">
          <Input value={form.pan || ''} onChange={set('pan')} style={{ textTransform: 'uppercase' }} />
        </Field>
      </div>

      <div className="section-title">Bank details printed on invoices</div>
      <div className="grid grid-3">
        <Field label="Bank name">
          <Input value={form.bankName || ''} onChange={set('bankName')} />
        </Field>
        <Field label="Account number">
          <Input value={form.bankAccount || ''} onChange={set('bankAccount')} />
        </Field>
        <Field label="IFSC">
          <Input value={form.bankIfsc || ''} onChange={set('bankIfsc')} style={{ textTransform: 'uppercase' }} />
        </Field>
      </div>

      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-primary" onClick={save} disabled={busy}>
          {busy && <span className="spinner" />}
          Save company details
        </button>
      </div>
    </div>
  );
}

function DefaultsForm() {
  const toast = useToast();
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/settings').then((d) => setForm(d.defaults || {})).catch((e) => setError(e.message));
  }, []);

  if (error) return <Alert tone="bad">{error}</Alert>;
  if (!form) return <Loading pad={40} />;

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function save() {
    setBusy(true);
    setError('');
    try {
      await api.put('/settings/defaults', form);
      toast.success('Defaults saved', 'New orders will use these values.');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      {error && <Alert tone="bad">{error}</Alert>}
      <Alert tone="info">
        These only prefill the forms. Any department can override them on an individual order.
      </Alert>
      <div className="grid grid-3">
        <Field label="GST rate (%)" hint="Quotations and invoices">
          <NumInput value={form.gstRate ?? 18} min="0" max="100" onChange={set('gstRate')} />
        </Field>
        <Field label="Target margin (%)" hint="Sales planning">
          <NumInput value={form.marginPercent ?? 20} min="0" onChange={set('marginPercent')} />
        </Field>
        <Field label="Wastage (%)" hint="Factory costing">
          <NumInput value={form.wastagePercent ?? 5} min="0" max="100" onChange={set('wastagePercent')} />
        </Field>
        <Field label="Production days" hint="Costing — drives the promised delivery date">
          <NumInput value={form.productionDays ?? 10} min="1" onChange={set('productionDays')} />
        </Field>
        <Field label="Quotation validity (days)">
          <NumInput value={form.quotationValidityDays ?? 15} min="1" onChange={set('quotationValidityDays')} />
        </Field>
        <Field label="Advance (%)" hint="Suggested advance amount">
          <NumInput value={form.advancePercent ?? 50} min="0" max="100" onChange={set('advancePercent')} />
        </Field>
        <Field label="Standard payment terms" span={3}>
          <Input value={form.paymentTerms || ''} onChange={set('paymentTerms')} />
        </Field>
        <Field label="Standard warranty" span={3}>
          <Input value={form.warranty || ''} onChange={set('warranty')} />
        </Field>
        <Field label="Quotation terms & conditions" span={3} hint="Printed at the bottom of every quotation">
          <Textarea rows={4} value={form.quotationTerms || ''} onChange={set('quotationTerms')} />
        </Field>
      </div>
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-primary" onClick={save} disabled={busy}>
          {busy && <span className="spinner" />}
          Save defaults
        </button>
      </div>
    </div>
  );
}

const PREFIX_NAMES = {
  ENQ: 'Enquiry', ARL: 'Order', QT: 'Quotation', SO: 'Sales order', RCP: 'Payment receipt',
  MI: 'Material issue slip', QC: 'QC report', PKG: 'Packing list', DC: 'Delivery challan',
  DN: 'Delivery note', INV: 'Tax invoice', GP: 'Gate pass', PO: 'Purchase order', GRN: 'Goods receipt',
};

function Numbering() {
  const [counters, setCounters] = useState(null);

  useEffect(() => {
    api.get('/settings').then((d) => setCounters(d.counters)).catch(() => setCounters([]));
  }, []);

  if (!counters) return <Loading pad={40} />;

  return (
    <div className="stack">
      <Alert tone="info" title="How numbering works">
        Every document is numbered <span className="mono">PREFIX/FY/0001</span> — for example{' '}
        <span className="mono">INV/26-27/0014</span>. The financial year runs 1 April to 31 March and the counter restarts
        each year. Numbers are issued by the database, so two people saving at the same moment can never get the same one.
      </Alert>

      <DataTable
        rows={counters}
        searchable={false}
        pageSize={0}
        rowKey={(r) => `${r.prefix}-${r.fy}`}
        columns={[
          { key: 'prefix', label: 'Prefix', render: (r) => <span className="mono strong">{r.prefix}</span> },
          { key: '_name', label: 'Document', render: (r) => PREFIX_NAMES[r.prefix] || '—' },
          { key: 'fy', label: 'Financial year', render: (r) => <span className="mono">{r.fy}</span> },
          { key: 'last_no', label: 'Last issued', type: 'num' },
          { key: '_next', label: 'Next number', render: (r) => <span className="mono small">{`${r.prefix}/${r.fy}/${String(r.last_no + 1).padStart(4, '0')}`}</span> },
        ]}
        empty={<Empty icon={IconSettings} title="No documents issued yet">Counters appear here as soon as the first enquiry is created.</Empty>}
      />
    </div>
  );
}
