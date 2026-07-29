/**
 * One form per workflow stage.
 *
 * Every form receives { order, meta, defaults, submit, busy } and calls
 * submit(payload) when the department signs off. The server re-validates
 * everything, so these forms guide the user rather than police them.
 */

import { useMemo, useState } from 'react';
import {
  Alert, Badge, Card, Check, Field, Input, NumInput, Section, Select, Textarea, KV, Combo,
} from '../ui/kit.jsx';
import { money, qty as fmtQty, fmtDate, todayStr, addDaysStr } from '../format.js';
import { IconPlus, IconAlert, IconCheckCircle } from '../ui/Icons.jsx';

const rid = () => Math.random().toString(36).slice(2);

/* ------------------------------------------------------------ shared pieces */

function StageShell({ children, footNote }) {
  return (
    <div className="stack">
      {children}
      {footNote && <p className="small dim">{footNote}</p>}
    </div>
  );
}

function LineHeader({ cols }) {
  return (
    <div className="line-grid line-head" style={{ gridTemplateColumns: cols.template }}>
      {cols.labels.map((l, i) => (
        <span key={i} className={cols.right?.includes(i) ? 'right' : ''}>{l}</span>
      ))}
    </div>
  );
}

function TotalStrip({ items }) {
  return (
    <div
      className="row wrap"
      style={{
        background: 'var(--surface-3)',
        border: '1px solid var(--line)',
        borderRadius: 'var(--r)',
        padding: 'var(--s3) var(--s4)',
        gap: 'var(--s6)',
      }}
    >
      {items.map((it) => (
        <div key={it.label}>
          <div className="uplabel" style={{ fontSize: 10 }}>{it.label}</div>
          <div
            className="num"
            style={{ fontSize: 'var(--fs-lg)', fontWeight: 650, color: it.tone === 'bad' ? 'var(--bad-fg)' : it.tone === 'ok' ? 'var(--ok-fg)' : undefined }}
          >
            {it.value}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ============================================================ 2 · COSTING */

export function CostingForm({ order, meta, defaults, submit, busy, materials }) {
  const [blocks, setBlocks] = useState(() =>
    order.items.map((it) => {
      const prev = order.costing?.itemCostings?.find((c) => c.item_id === it.id);
      return {
        item_id: it.id,
        product: it.product,
        qty: it.qty,
        size: it.size,
        labour_cost: prev?.labour_cost ?? 0,
        machine_cost: prev?.machine_cost ?? 0,
        transport_cost: prev?.transport_cost ?? 0,
        overheads: prev?.overheads ?? 0,
        wastage_percent: prev?.wastage_percent ?? defaults.wastagePercent ?? 5,
        bom: prev?.bom?.length
          ? prev.bom.map((b) => ({ _k: rid(), material: b.material, qty: b.qty, unit: b.unit, rate: b.rate, remarks: b.remarks || '' }))
          : [{ _k: rid(), material: it.material || '', qty: 1, unit: 'nos', rate: 0, remarks: '' }],
      };
    })
  );
  const [productionDays, setProductionDays] = useState(order.costing?.production_days ?? defaults.productionDays ?? 10);
  const [costedBy, setCostedBy] = useState(order.costing?.costed_by ?? '');
  const [costedAt, setCostedAt] = useState(order.costing?.costed_at?.slice(0, 10) ?? todayStr());
  const [notes, setNotes] = useState(order.costing?.notes ?? '');
  const [error, setError] = useState('');

  const matNames = useMemo(() => materials.map((m) => m.name), [materials]);
  const matByName = useMemo(
    () => Object.fromEntries(materials.map((m) => [m.name.trim().toLowerCase(), m])),
    [materials]
  );

  const setBlock = (id, patch) => setBlocks((l) => l.map((b) => (b.item_id === id ? { ...b, ...patch } : b)));
  const setBom = (id, k, patch) =>
    setBlocks((l) =>
      l.map((b) => (b.item_id === id ? { ...b, bom: b.bom.map((r) => (r._k === k ? { ...r, ...patch } : r)) } : b))
    );
  const addBom = (id) =>
    setBlocks((l) =>
      l.map((b) => (b.item_id === id ? { ...b, bom: [...b.bom, { _k: rid(), material: '', qty: 1, unit: 'nos', rate: 0, remarks: '' }] } : b))
    );
  const delBom = (id, k) =>
    setBlocks((l) => l.map((b) => (b.item_id === id ? { ...b, bom: b.bom.length > 1 ? b.bom.filter((r) => r._k !== k) : b.bom } : b)));

  /** When the store master knows this material, prefill unit and rate. */
  function onMaterialPick(id, k, name) {
    const m = matByName[String(name).trim().toLowerCase()];
    setBom(id, k, m ? { material: name, unit: m.unit, rate: Number(m.standard_rate) || 0 } : { material: name });
  }

  const computed = blocks.map((b) => {
    const materialCost = b.bom.reduce((s, r) => s + (Number(r.qty) || 0) * (Number(r.rate) || 0), 0);
    const wastageCost = (materialCost * (Number(b.wastage_percent) || 0)) / 100;
    const total =
      materialCost + wastageCost + (Number(b.labour_cost) || 0) + (Number(b.machine_cost) || 0) +
      (Number(b.transport_cost) || 0) + (Number(b.overheads) || 0);
    return { ...b, materialCost, wastageCost, total, perUnit: total / (Number(b.qty) || 1) };
  });
  const grandTotal = computed.reduce((s, b) => s + b.total, 0);

  function save() {
    for (const b of computed) {
      const rows = b.bom.filter((r) => String(r.material).trim());
      if (!rows.length) return setError(`Add at least one raw material to the BOM for "${b.product}".`);
      if (rows.some((r) => !(Number(r.qty) > 0))) return setError(`Every BOM line for "${b.product}" needs a quantity above zero.`);
    }
    setError('');
    submit({
      production_days: Number(productionDays) || 10,
      costed_by: costedBy,
      costed_at: costedAt,
      notes,
      itemCostings: computed.map((b) => ({
        item_id: b.item_id,
        labour_cost: Number(b.labour_cost) || 0,
        machine_cost: Number(b.machine_cost) || 0,
        transport_cost: Number(b.transport_cost) || 0,
        overheads: Number(b.overheads) || 0,
        wastage_percent: Number(b.wastage_percent) || 0,
        bom: b.bom
          .filter((r) => String(r.material).trim())
          .map((r) => ({ material: r.material, qty: Number(r.qty) || 0, unit: r.unit || 'nos', rate: Number(r.rate) || 0, remarks: r.remarks })),
      })),
    });
  }

  const cols = { template: '2.2fr 0.8fr 0.8fr 1fr 1fr 1.4fr 34px', labels: ['Raw material', 'Qty', 'Unit', 'Rate ₹', 'Amount ₹', 'Remarks', ''], right: [1, 3, 4] };

  return (
    <StageShell footNote="Each finished product gets its own costing table, exactly as the workflow requires. The BOM here becomes the store's issue list.">
      {error && <Alert tone="bad">{error}</Alert>}

      {computed.map((b, idx) => (
        <Card
          key={b.item_id}
          title={`Product ${idx + 1} — ${b.product}`}
          sub={`Quantity ${fmtQty(b.qty)}${b.size ? ` · ${b.size}` : ''}`}
          action={<Badge tone="brand">{money(b.total)}</Badge>}
        >
          <div className="stack">
            <Section
              title="Raw materials (bill of materials)"
              action={
                <div className="row-tight">
                  {Number(b.qty) > 1 && (
                    <button
                      type="button"
                      className="btn btn-sm"
                      title={`Multiply every BOM quantity by ${fmtQty(b.qty)}`}
                      onClick={() =>
                        setBlocks((l) =>
                          l.map((x) =>
                            x.item_id === b.item_id
                              ? { ...x, bom: x.bom.map((r) => ({ ...r, qty: (Number(r.qty) || 0) * (Number(b.qty) || 1) })) }
                              : x
                          )
                        )
                      }
                    >
                      × {fmtQty(b.qty)} for the whole line
                    </button>
                  )}
                  <button type="button" className="btn btn-sm btn-dashed" onClick={() => addBom(b.item_id)}>
                    <IconPlus size={12} /> Add material
                  </button>
                </div>
              }
            >
              {Number(b.qty) > 1 && (
                <p className="small muted" style={{ marginBottom: 8 }}>
                  Enter the material needed for <strong>all {fmtQty(b.qty)} units</strong> — this is what the store will
                  issue. If you have entered per-unit quantities, use the “× {fmtQty(b.qty)}” button above.
                </p>
              )}
              <LineHeader cols={cols} />
              {b.bom.map((r) => (
                <div className="line-grid" key={r._k} style={{ gridTemplateColumns: cols.template }}>
                  <Combo
                    value={r.material}
                    options={matNames}
                    placeholder="Material name"
                    onChange={(v) => onMaterialPick(b.item_id, r._k, v)}
                  />
                  <NumInput value={r.qty} min="0" step="any" onChange={(e) => setBom(b.item_id, r._k, { qty: e.target.value })} />
                  <Select value={r.unit} options={meta.units} onChange={(e) => setBom(b.item_id, r._k, { unit: e.target.value })} />
                  <NumInput value={r.rate} min="0" step="any" onChange={(e) => setBom(b.item_id, r._k, { rate: e.target.value })} />
                  <div className="num small" style={{ alignSelf: 'center', paddingRight: 4 }}>
                    {money((Number(r.qty) || 0) * (Number(r.rate) || 0), { bare: true })}
                  </div>
                  <Input value={r.remarks} onChange={(e) => setBom(b.item_id, r._k, { remarks: e.target.value })} />
                  <button
                    type="button"
                    className="btn btn-ghost btn-icon btn-sm"
                    onClick={() => delBom(b.item_id, r._k)}
                    disabled={b.bom.length === 1}
                    title="Remove line"
                  >
                    ×
                  </button>
                </div>
              ))}
            </Section>

            <Section title="Other costs">
              <div className="grid grid-4">
                <Field label="Labour cost (₹)">
                  <NumInput value={b.labour_cost} min="0" onChange={(e) => setBlock(b.item_id, { labour_cost: e.target.value })} />
                </Field>
                <Field label="Machine cost (₹)">
                  <NumInput value={b.machine_cost} min="0" onChange={(e) => setBlock(b.item_id, { machine_cost: e.target.value })} />
                </Field>
                <Field label="Transportation (₹)">
                  <NumInput value={b.transport_cost} min="0" onChange={(e) => setBlock(b.item_id, { transport_cost: e.target.value })} />
                </Field>
                <Field label="Overheads (₹)">
                  <NumInput value={b.overheads} min="0" onChange={(e) => setBlock(b.item_id, { overheads: e.target.value })} />
                </Field>
                <Field label="Wastage (%)" hint="Applied on material cost">
                  <NumInput value={b.wastage_percent} min="0" max="100" onChange={(e) => setBlock(b.item_id, { wastage_percent: e.target.value })} />
                </Field>
              </div>
            </Section>

            <TotalStrip
              items={[
                { label: 'Material', value: money(b.materialCost) },
                { label: `Wastage ${b.wastage_percent}%`, value: money(b.wastageCost) },
                { label: 'Labour + machine + transport + overheads', value: money(Number(b.labour_cost) + Number(b.machine_cost) + Number(b.transport_cost) + Number(b.overheads)) },
                { label: 'Product total', value: money(b.total), tone: 'ok' },
                { label: 'Cost per unit', value: money(b.perUnit) },
              ]}
            />
          </div>
        </Card>
      ))}

      <Card title="Costing summary">
        <div className="stack">
          <div className="grid grid-3">
            <Field label="Production time (days)" required hint="Drives the promised delivery date">
              <NumInput value={productionDays} min="1" onChange={(e) => setProductionDays(e.target.value)} />
            </Field>
            <Field label="Costed by">
              <Input value={costedBy} onChange={(e) => setCostedBy(e.target.value)} placeholder="Your name" />
            </Field>
            <Field label="Costing date">
              <Input type="date" value={costedAt} onChange={(e) => setCostedAt(e.target.value)} />
            </Field>
            <Field label="Notes for sales" span={3}>
              <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
          </div>
          <TotalStrip
            items={[
              { label: 'Products costed', value: String(computed.length) },
              { label: 'Total factory cost', value: money(grandTotal), tone: 'ok' },
              { label: 'Production time', value: `${productionDays} days` },
            ]}
          />
        </div>
      </Card>

      <SaveBar busy={busy} onSave={save} label="Save costing & send to Sales" />
    </StageShell>
  );
}

/* =========================================================== 3 · PLANNING */

export function PlanningForm({ order, meta, defaults, submit, busy }) {
  const costing = order.costing;
  const [rows, setRows] = useState(() =>
    order.items.map((it) => {
      const ic = costing?.itemCostings?.find((c) => c.item_id === it.id);
      const prev = order.planning?.items?.find((p) => p.item_id === it.id);
      const costPerUnit = ic ? Number(ic.total_cost) / (Number(it.qty) || 1) : 0;
      return { item_id: it.id, product: it.product, size: it.size, qty: Number(it.qty) || 1, costPerUnit, selling_price: prev?.selling_price ?? 0 };
    })
  );
  const [margin, setMargin] = useState(order.planning?.margin_percent ?? defaults.marginPercent ?? 20);
  const [discountPercent, setDiscountPercent] = useState(order.planning?.discount_percent ?? 0);
  const [freight, setFreight] = useState(order.planning?.freight_charges ?? 0);
  const [installation, setInstallation] = useState(order.planning?.installation_charges ?? 0);
  const [loading, setLoading] = useState(order.planning?.loading_charges ?? 0);
  const [terms, setTerms] = useState(order.planning?.payment_terms ?? defaults.paymentTerms ?? '');
  const [deliveryDate, setDeliveryDate] = useState(
    order.planning?.delivery_date ?? addDaysStr(costing?.production_days ?? 10)
  );
  const [decidedBy, setDecidedBy] = useState(order.planning?.decided_by ?? '');
  const [error, setError] = useState('');

  const setRow = (id, patch) => setRows((l) => l.map((r) => (r.item_id === id ? { ...r, ...patch } : r)));

  function applyMargin() {
    const m = Number(margin) || 0;
    setRows((l) => l.map((r) => ({ ...r, selling_price: Math.round(r.costPerUnit * (1 + m / 100)) })));
  }

  const itemsTotal = rows.reduce((s, r) => s + r.qty * (Number(r.selling_price) || 0), 0);
  const discountAmount = (itemsTotal * (Number(discountPercent) || 0)) / 100;
  const subtotal = itemsTotal - discountAmount + Number(freight || 0) + Number(installation || 0) + Number(loading || 0);
  const totalCost = Number(costing?.total_cost) || 0;
  const marginValue = itemsTotal - discountAmount - totalCost;
  const marginPct = totalCost > 0 ? (marginValue / totalCost) * 100 : 0;

  function save() {
    if (rows.some((r) => !(Number(r.selling_price) > 0))) return setError('Set a selling price above zero for every product.');
    if (discountAmount > itemsTotal) return setError('The discount cannot be more than the product total.');
    setError('');
    submit({
      margin_percent: Number(margin) || 0,
      discount_percent: Number(discountPercent) || 0,
      freight_charges: Number(freight) || 0,
      installation_charges: Number(installation) || 0,
      loading_charges: Number(loading) || 0,
      payment_terms: terms,
      delivery_date: deliveryDate,
      decided_by: decidedBy,
      items: rows.map((r) => ({ item_id: r.item_id, selling_price: Number(r.selling_price) || 0 })),
    });
  }

  return (
    <StageShell footNote="The factory cost is fixed — you decide margin, price and discount. The subtotal here becomes the quotation's taxable value.">
      {error && <Alert tone="bad">{error}</Alert>}

      <Card title="Factory costing received" sub={`Prepared by ${costing?.costed_by || '—'} on ${fmtDate(costing?.costed_at)} · ${costing?.production_days} production days`}>
        <div className="table-wrap">
          <table className="tbl compact">
            <thead>
              <tr>
                <th>Product</th>
                <th className="right">Qty</th>
                <th className="right">Material</th>
                <th className="right">Wastage</th>
                <th className="right">Labour</th>
                <th className="right">Machine</th>
                <th className="right">Transport</th>
                <th className="right">Overheads</th>
                <th className="right">Total cost</th>
                <th className="right">Cost / unit</th>
              </tr>
            </thead>
            <tbody>
              {(costing?.itemCostings || []).map((ic) => (
                <tr key={ic.id}>
                  <td className="strong">{ic.product}</td>
                  <td className="num">{fmtQty(ic.qty)}</td>
                  <td className="num">{money(ic.material_cost, { bare: true })}</td>
                  <td className="num">{money(ic.wastage_cost, { bare: true })}</td>
                  <td className="num">{money(ic.labour_cost, { bare: true })}</td>
                  <td className="num">{money(ic.machine_cost, { bare: true })}</td>
                  <td className="num">{money(ic.transport_cost, { bare: true })}</td>
                  <td className="num">{money(ic.overheads, { bare: true })}</td>
                  <td className="num strong">{money(ic.total_cost, { bare: true })}</td>
                  <td className="num">{money(Number(ic.total_cost) / (Number(ic.qty) || 1), { bare: true })}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={8}>Total factory cost</td>
                <td className="num">{money(totalCost, { bare: true })}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>

      <Card
        title="Selling price per product"
        action={
          <div className="row-tight">
            <span className="small muted nowrap">Target margin</span>
            <div style={{ width: 84 }}>
              <NumInput value={margin} min="0" onChange={(e) => setMargin(e.target.value)} />
            </div>
            <button type="button" className="btn btn-sm" onClick={applyMargin}>
              Apply to all
            </button>
          </div>
        }
      >
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Product</th>
                <th className="right">Qty</th>
                <th className="right">Cost / unit</th>
                <th className="right" style={{ width: 130 }}>Selling / unit</th>
                <th className="right">Margin / unit</th>
                <th className="right">Margin %</th>
                <th className="right">Line total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const sell = Number(r.selling_price) || 0;
                const mUnit = sell - r.costPerUnit;
                const mPct = r.costPerUnit > 0 ? (mUnit / r.costPerUnit) * 100 : 0;
                return (
                  <tr key={r.item_id}>
                    <td>
                      <div className="strong">{r.product}</div>
                      {r.size && <div className="tiny dim">{r.size}</div>}
                    </td>
                    <td className="num">{fmtQty(r.qty)}</td>
                    <td className="num muted">{money(r.costPerUnit, { bare: true })}</td>
                    <td>
                      <NumInput value={r.selling_price} min="0" onChange={(e) => setRow(r.item_id, { selling_price: e.target.value })} />
                    </td>
                    <td className="num" style={{ color: mUnit < 0 ? 'var(--bad-fg)' : undefined }}>
                      {money(mUnit, { bare: true })}
                    </td>
                    <td className="num">
                      <Badge tone={mPct < 0 ? 'bad' : mPct < 10 ? 'warn' : 'ok'}>{mPct.toFixed(1)}%</Badge>
                    </td>
                    <td className="num strong">{money(r.qty * sell, { bare: true })}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={6}>Products total</td>
                <td className="num">{money(itemsTotal, { bare: true })}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>

      <Card title="Discount, charges & terms">
        <div className="stack">
          <div className="grid grid-4">
            <Field label="Discount (%)" hint={discountAmount > 0 ? `= ${money(discountAmount)}` : 'Optional'}>
              <NumInput value={discountPercent} min="0" max="100" onChange={(e) => setDiscountPercent(e.target.value)} />
            </Field>
            <Field label="Freight (₹)">
              <NumInput value={freight} min="0" onChange={(e) => setFreight(e.target.value)} />
            </Field>
            <Field label="Installation (₹)">
              <NumInput value={installation} min="0" onChange={(e) => setInstallation(e.target.value)} />
            </Field>
            <Field label="Loading & unloading (₹)">
              <NumInput value={loading} min="0" onChange={(e) => setLoading(e.target.value)} />
            </Field>
            <Field label="Payment terms" required span={2}>
              <Input value={terms} onChange={(e) => setTerms(e.target.value)} />
            </Field>
            <Field label="Promised delivery date" required>
              <Input type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} />
            </Field>
            <Field label="Decided by">
              <Input value={decidedBy} onChange={(e) => setDecidedBy(e.target.value)} placeholder="Your name" />
            </Field>
          </div>

          <TotalStrip
            items={[
              { label: 'Products', value: money(itemsTotal) },
              ...(discountAmount > 0 ? [{ label: 'Less discount', value: `- ${money(discountAmount)}`, tone: 'bad' }] : []),
              { label: 'Charges', value: money(Number(freight || 0) + Number(installation || 0) + Number(loading || 0)) },
              { label: 'Subtotal before GST', value: money(subtotal), tone: 'ok' },
              { label: 'Order margin', value: `${money(marginValue)} (${marginPct.toFixed(1)}%)`, tone: marginValue < 0 ? 'bad' : 'ok' },
            ]}
          />
          {marginValue < 0 && <Alert tone="warn" title="This order is priced below cost">The selling prices do not cover the factory cost. Check with management before quoting.</Alert>}
        </div>
      </Card>

      <SaveBar busy={busy} onSave={save} label="Save planning & prepare quotation" />
    </StageShell>
  );
}

/* ========================================================== 4 · QUOTATION */

export function QuotationForm({ order, defaults, submit, busy }) {
  const p = order.planning;
  const [gstRate, setGstRate] = useState(order.quotation?.gst_rate ?? defaults.gstRate ?? 18);
  const [quotationDate, setQuotationDate] = useState(order.quotation?.quotation_date ?? todayStr());
  const [validTill, setValidTill] = useState(order.quotation?.valid_till ?? addDaysStr(defaults.quotationValidityDays ?? 15));
  const [warranty, setWarranty] = useState(order.quotation?.warranty ?? defaults.warranty ?? '');
  const [terms, setTerms] = useState(order.quotation?.terms ?? defaults.quotationTerms ?? '');

  const subtotal = Number(p?.subtotal) || 0;
  const gstAmount = (subtotal * (Number(gstRate) || 0)) / 100;
  const grandTotal = subtotal + gstAmount;

  return (
    <StageShell footNote="Once saved, print or email the quotation to the customer, then record their decision in the next step.">
      <Card title="Quotation details">
        <div className="grid grid-3">
          <Field label="Quotation date" required>
            <Input type="date" value={quotationDate} onChange={(e) => setQuotationDate(e.target.value)} />
          </Field>
          <Field label="Valid till" required>
            <Input type="date" value={validTill} onChange={(e) => setValidTill(e.target.value)} />
          </Field>
          <Field label="GST rate (%)" required>
            <Select
              value={gstRate}
              onChange={(e) => setGstRate(e.target.value)}
              options={[0, 5, 12, 18, 28].map((r) => ({ value: r, label: `${r}%` }))}
            />
          </Field>
          <Field label="Warranty" span={3}>
            <Input value={warranty} onChange={(e) => setWarranty(e.target.value)} placeholder="e.g. 12 months against manufacturing defects" />
          </Field>
          <Field label="Additional terms printed on the quotation" span={3}>
            <Textarea rows={3} value={terms} onChange={(e) => setTerms(e.target.value)} />
          </Field>
        </div>
      </Card>

      <Card title="Value" sub="Taken from sales planning — edit planning if these need to change">
        <div className="table-wrap">
          <table className="tbl">
            <tbody>
              <tr>
                <td>Products{Number(p?.discount_amount) > 0 ? ' (after discount)' : ''}</td>
                <td className="num">{money(Number(p?.items_total || 0) - Number(p?.discount_amount || 0), { bare: true })}</td>
              </tr>
              {Number(p?.freight_charges) > 0 && (
                <tr><td>Freight</td><td className="num">{money(p.freight_charges, { bare: true })}</td></tr>
              )}
              {Number(p?.installation_charges) > 0 && (
                <tr><td>Installation</td><td className="num">{money(p.installation_charges, { bare: true })}</td></tr>
              )}
              {Number(p?.loading_charges) > 0 && (
                <tr><td>Loading &amp; unloading</td><td className="num">{money(p.loading_charges, { bare: true })}</td></tr>
              )}
              <tr><td className="strong">Taxable value</td><td className="num strong">{money(subtotal, { bare: true })}</td></tr>
              <tr><td>GST @ {gstRate}%</td><td className="num">{money(gstAmount, { bare: true })}</td></tr>
            </tbody>
            <tfoot>
              <tr><td>Grand total</td><td className="num">{money(grandTotal)}</td></tr>
            </tfoot>
          </table>
        </div>
      </Card>

      <SaveBar
        busy={busy}
        onSave={() => submit({ gst_rate: Number(gstRate) || 0, quotation_date: quotationDate, valid_till: validTill, warranty, terms })}
        label="Generate quotation"
      />
    </StageShell>
  );
}

/* =========================================================== 5 · APPROVAL */

export function ApprovalForm({ order, meta, submit, busy }) {
  const [status, setStatus] = useState('approved');
  const [decidedAt, setDecidedAt] = useState(todayStr());
  const [decidedByName, setDecidedByName] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [rejectNote, setRejectNote] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  const q = order.quotation;
  const expired = q?.valid_till && q.valid_till < todayStr();

  function save() {
    if (status === 'rejected') {
      if (!rejectReason) return setError('Choose the reason the customer rejected the quotation.');
      if (rejectReason === 'Others' && !rejectNote.trim()) return setError('Describe the reason when choosing "Others".');
    }
    setError('');
    submit({ status, decided_at: decidedAt, decided_by_name: decidedByName, reject_reason: rejectReason, reject_note: rejectNote, notes });
  }

  return (
    <StageShell>
      {error && <Alert tone="bad">{error}</Alert>}

      <Card title={`Quotation ${q?.quotation_no}`} sub={`Sent ${fmtDate(q?.quotation_date)} · valid till ${fmtDate(q?.valid_till)}`}>
        <div className="stack">
          {expired && <Alert tone="warn" title="Past its validity date">Consider revising the quotation before recording an approval.</Alert>}
          <TotalStrip
            items={[
              { label: 'Taxable value', value: money(q?.subtotal) },
              { label: `GST ${q?.gst_rate}%`, value: money(q?.gst_amount) },
              { label: 'Quoted total', value: money(q?.grand_total), tone: 'ok' },
            ]}
          />
        </div>
      </Card>

      <Card title="Customer decision">
        <div className="stack">
          <div
            className="grid grid-2"
            style={{ gap: 'var(--s3)' }}
          >
            <DecisionTile
              selected={status === 'approved'}
              onClick={() => setStatus('approved')}
              tone="ok"
              icon={IconCheckCircle}
              title="Approved"
              body="Proceed to raise the sales order against the customer's signature."
            />
            <DecisionTile
              selected={status === 'rejected'}
              onClick={() => setStatus('rejected')}
              tone="bad"
              icon={IconAlert}
              title="Rejected"
              body="Closes the enquiry as lost. A reason is required for reporting."
            />
          </div>

          <div className="grid grid-2">
            <Field label="Decision date" required>
              <Input type="date" value={decidedAt} onChange={(e) => setDecidedAt(e.target.value)} />
            </Field>
            <Field label="Confirmed by (customer contact)">
              <Input value={decidedByName} onChange={(e) => setDecidedByName(e.target.value)} />
            </Field>
          </div>

          {status === 'rejected' && (
            <>
              <Field label="Reason for rejection" required>
                <Select
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Choose a reason…"
                  options={meta.lostReasons}
                  invalid={!!error && !rejectReason}
                />
              </Field>
              <Field label="Detail" required={rejectReason === 'Others'}>
                <Textarea rows={2} value={rejectNote} onChange={(e) => setRejectNote(e.target.value)} placeholder="What exactly did the customer say?" />
              </Field>
              <Alert tone="warn" title="This closes the order">
                The order and its enquiry will both be archived as lost. Only an administrator can reopen it.
              </Alert>
            </>
          )}

          {status === 'approved' && (
            <Field label="Notes">
              <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
          )}
        </div>
      </Card>

      <SaveBar
        busy={busy}
        onSave={save}
        label={status === 'approved' ? 'Record approval & continue' : 'Record rejection & close as lost'}
        tone={status === 'approved' ? 'primary' : 'danger'}
      />
    </StageShell>
  );
}

function DecisionTile({ selected, onClick, tone, icon: Ico, title, body }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        textAlign: 'left',
        font: 'inherit',
        cursor: 'pointer',
        padding: 'var(--s4)',
        borderRadius: 'var(--r)',
        border: `1.5px solid ${selected ? `var(--${tone}-fg)` : 'var(--line-2)'}`,
        background: selected ? `var(--${tone}-bg)` : 'var(--surface)',
        color: selected ? `var(--${tone}-fg)` : 'var(--text)',
        display: 'flex',
        gap: 'var(--s3)',
      }}
    >
      <Ico size={18} style={{ flex: 'none', marginTop: 1 }} />
      <span>
        <span style={{ display: 'block', fontWeight: 650 }}>{title}</span>
        <span style={{ display: 'block', fontSize: 'var(--fs-sm)', opacity: 0.85, marginTop: 2 }}>{body}</span>
      </span>
    </button>
  );
}

/* ======================================================== 6 · SALES ORDER */

export function SalesOrderForm({ order, submit, busy }) {
  const [signed, setSigned] = useState(false);
  const [soDate, setSoDate] = useState(todayStr());
  const [signedDate, setSignedDate] = useState(todayStr());
  const [poNumber, setPoNumber] = useState('');
  const [poDate, setPoDate] = useState('');
  const [notes, setNotes] = useState('');

  return (
    <StageShell footNote="The sales order is mandatory before production and locks the quoted value.">
      <Card title="Confirm the order" sub={`Against quotation ${order.quotation?.quotation_no}`}>
        <div className="stack">
          <TotalStrip
            items={[
              { label: 'Order value (incl. GST)', value: money(order.quotation?.grand_total), tone: 'ok' },
              { label: 'Payment terms', value: order.planning?.payment_terms || '—' },
              { label: 'Promised delivery', value: fmtDate(order.planning?.delivery_date) },
            ]}
          />

          <div className="grid grid-2">
            <Field label="Sales order date" required>
              <Input type="date" value={soDate} onChange={(e) => setSoDate(e.target.value)} />
            </Field>
            <Field label="Signature received on" required>
              <Input type="date" value={signedDate} onChange={(e) => setSignedDate(e.target.value)} />
            </Field>
            <Field label="Customer PO number" hint="If the customer issued their own purchase order">
              <Input value={poNumber} onChange={(e) => setPoNumber(e.target.value)} />
            </Field>
            <Field label="Customer PO date">
              <Input type="date" value={poDate} onChange={(e) => setPoDate(e.target.value)} />
            </Field>
            <Field label="Notes" span={2}>
              <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
          </div>

          <div
            style={{
              padding: 'var(--s4)',
              border: `1.5px solid ${signed ? 'var(--ok-br)' : 'var(--warn-br)'}`,
              background: signed ? 'var(--ok-bg)' : 'var(--warn-bg)',
              borderRadius: 'var(--r)',
            }}
          >
            <Check
              label="The customer has approved and signed the quotation / sales order"
              hint="The workflow will not raise a sales order without this confirmation."
              checked={signed}
              onChange={setSigned}
            />
          </div>
        </div>
      </Card>

      <SaveBar
        busy={busy}
        onSave={() => submit({ customer_signed: signed, so_date: soDate, signed_date: signedDate, po_number: poNumber, po_date: poDate, notes })}
        label="Raise sales order"
        disabled={!signed}
        disabledHint={!signed ? 'Confirm the customer signature first' : ''}
      />
    </StageShell>
  );
}

/* ============================================================ 7 · ADVANCE */

export function AdvanceForm({ order, meta, defaults, submit, busy }) {
  const total = Number(order.salesOrder?.locked_total) || 0;
  const suggested = Math.round((total * (defaults.advancePercent ?? 50)) / 100);
  const [amount, setAmount] = useState(suggested);
  const [receivedAt, setReceivedAt] = useState(todayStr());
  const [mode, setMode] = useState('Bank transfer');
  const [reference, setReference] = useState('');
  const [remarks, setRemarks] = useState('');
  const [released, setReleased] = useState(true);

  const balance = total - (Number(amount) || 0);
  const over = (Number(amount) || 0) > total;

  return (
    <StageShell footNote="Recording the advance issues a numbered receipt and releases the order to the store for material issue.">
      <Card title="Advance payment" sub={`Sales order ${order.salesOrder?.so_no} · ${order.salesOrder?.locked_terms || ''}`}>
        <div className="stack">
          <div className="grid grid-3">
            <Field label="Amount received (₹)" required error={over ? 'More than the order value.' : ''} hint={`Suggested ${defaults.advancePercent ?? 50}%: ${money(suggested)}`}>
              <NumInput value={amount} min="0" onChange={(e) => setAmount(e.target.value)} invalid={over} />
            </Field>
            <Field label="Received on" required>
              <Input type="date" value={receivedAt} onChange={(e) => setReceivedAt(e.target.value)} />
            </Field>
            <Field label="Mode" required>
              <Select value={mode} onChange={(e) => setMode(e.target.value)} options={meta.paymentModes} />
            </Field>
            <Field label="Reference" hint="UTR, cheque number, UPI ref…" span={2}>
              <Input value={reference} onChange={(e) => setReference(e.target.value)} />
            </Field>
            <Field label="Remarks">
              <Input value={remarks} onChange={(e) => setRemarks(e.target.value)} />
            </Field>
          </div>

          <TotalStrip
            items={[
              { label: 'Order value', value: money(total) },
              { label: 'Advance received', value: money(amount), tone: 'ok' },
              { label: 'Balance due', value: money(Math.max(0, balance)), tone: balance > 0 ? 'bad' : 'ok' },
            ]}
          />

          <Check
            label="Release the order to the store for material issue"
            hint="Untick only if production must wait for a larger advance."
            checked={released}
            onChange={setReleased}
          />
          {Number(amount) === 0 && (
            <Alert tone="warn" title="No advance recorded">
              The order will move to the store with the full amount outstanding.
            </Alert>
          )}
        </div>
      </Card>

      <SaveBar
        busy={busy}
        onSave={() => submit({ amount: Number(amount) || 0, received_at: receivedAt, mode, reference, remarks, released_to_production: released })}
        label="Record advance & release to store"
        disabled={over}
      />
    </StageShell>
  );
}

/* ======================================================== 8 · STORE ISSUE */

export function StoreForm({ order, submit, busy, materials }) {
  const bomLines = useMemo(() => {
    const out = [];
    for (const ic of order.costing?.itemCostings || []) {
      for (const b of ic.bom) out.push({ bom_id: b.id, product: ic.product, material: b.material, material_id: b.material_id, qty: b.qty, unit: b.unit, rate: b.rate });
    }
    return out;
  }, [order]);

  const stockByName = useMemo(
    () => Object.fromEntries(materials.map((m) => [m.name.trim().toLowerCase(), m])),
    [materials]
  );

  const [lines, setLines] = useState(() => bomLines.map((l) => ({ ...l, qty_issued: l.qty, remarks: '' })));
  const [issueDate, setIssueDate] = useState(todayStr());
  const [issuedBy, setIssuedBy] = useState('');
  const [receivedBy, setReceivedBy] = useState('');
  const [remarks, setRemarks] = useState('');
  const [allowNegative, setAllowNegative] = useState(false);

  const setLine = (id, patch) => setLines((l) => l.map((x) => (x.bom_id === id ? { ...x, ...patch } : x)));

  const shortages = lines
    .map((l) => {
      const m = stockByName[String(l.material).trim().toLowerCase()];
      const have = m ? Number(m.qty_in_stock) : 0;
      return { ...l, have, unit: m?.unit || l.unit, short: Number(l.qty_issued) > have };
    })
    .filter((l) => l.short && Number(l.qty_issued) > 0);

  return (
    <StageShell footNote="Issuing deducts the quantities from raw-material stock and writes a movement to the stock ledger.">
      <Card
        title="Materials to issue"
        sub={`As per the approved costing sheet — ${bomLines.length} line(s) across ${order.costing?.itemCostings?.length || 0} product(s)`}
      >
        <div className="stack">
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>For product</th>
                  <th>Material</th>
                  <th className="right">Planned</th>
                  <th className="right">In stock</th>
                  <th className="right" style={{ width: 120 }}>Issue qty</th>
                  <th>Unit</th>
                  <th>Remarks</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => {
                  const m = stockByName[String(l.material).trim().toLowerCase()];
                  const have = m ? Number(m.qty_in_stock) : 0;
                  const short = Number(l.qty_issued) > have;
                  return (
                    <tr key={l.bom_id}>
                      <td className="small muted">{l.product}</td>
                      <td className="strong">{l.material}</td>
                      <td className="num muted">{fmtQty(l.qty)}</td>
                      <td className="num">
                        <span style={{ color: short ? 'var(--bad-fg)' : have <= 0 ? 'var(--bad-fg)' : undefined, fontWeight: short ? 650 : 400 }}>
                          {fmtQty(have)}
                        </span>
                      </td>
                      <td>
                        <NumInput value={l.qty_issued} min="0" step="any" onChange={(e) => setLine(l.bom_id, { qty_issued: e.target.value })} invalid={short} />
                      </td>
                      <td className="small">{l.unit}</td>
                      <td>
                        <Input value={l.remarks} onChange={(e) => setLine(l.bom_id, { remarks: e.target.value })} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {shortages.length > 0 && (
            <Alert tone="bad" title={`Not enough stock for ${shortages.length} material(s)`}>
              <ul style={{ marginTop: 4 }}>
                {shortages.map((s) => (
                  <li key={s.bom_id}>
                    {s.material} — have {fmtQty(s.have)} {s.unit}, need {fmtQty(s.qty_issued)}
                  </li>
                ))}
              </ul>
              <div style={{ marginTop: 8 }}>
                <Check
                  label="Issue anyway and let the balance go negative"
                  hint="Use this only when the material is physically present but not yet entered in the system."
                  checked={allowNegative}
                  onChange={setAllowNegative}
                />
              </div>
            </Alert>
          )}
        </div>
      </Card>

      <Card title="Issue slip">
        <div className="grid grid-3">
          <Field label="Issue date" required>
            <Input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
          </Field>
          <Field label="Issued by (store)">
            <Input value={issuedBy} onChange={(e) => setIssuedBy(e.target.value)} placeholder="Your name" />
          </Field>
          <Field label="Received by (production)">
            <Input value={receivedBy} onChange={(e) => setReceivedBy(e.target.value)} />
          </Field>
          <Field label="Remarks" span={3}>
            <Textarea rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
          </Field>
        </div>
      </Card>

      <SaveBar
        busy={busy}
        onSave={() =>
          submit({
            issue_date: issueDate,
            issued_by: issuedBy,
            received_by: receivedBy,
            remarks,
            allow_negative_stock: allowNegative,
            lines: lines.map((l) => ({ bom_id: l.bom_id, qty_issued: Number(l.qty_issued) || 0, remarks: l.remarks })),
          })
        }
        label="Issue material to production"
        disabled={shortages.length > 0 && !allowNegative}
        disabledHint={shortages.length > 0 && !allowNegative ? 'Resolve the stock shortage first' : ''}
      />
    </StageShell>
  );
}

/* ========================================================= 9 · PRODUCTION */

export function ProductionForm({ order, meta, submit, busy, materials }) {
  const issued = order.store?.lines || [];
  const isRework = order.qc?.result === 'fail';

  const [cons, setCons] = useState(() =>
    issued.map((l) => {
      const prev = order.production?.consumption?.find((c) => c.material === l.material && c.product === l.product);
      return { line_id: l.id, product: l.product, material: l.material, unit: l.unit, qty_issued: Number(l.qty_issued), qty_used: prev ? Number(prev.qty_used) : Number(l.qty_issued), remarks: prev?.remarks || '' };
    })
  );
  const [startDate, setStartDate] = useState(order.production?.start_date ?? todayStr());
  const [startedBy, setStartedBy] = useState(order.production?.started_by ?? '');
  const [expectedEnd, setExpectedEnd] = useState(
    order.production?.expected_end_date ?? addDaysStr(order.costing?.production_days ?? 10, order.store?.issue_date)
  );
  const [endDate, setEndDate] = useState(order.production?.end_date ?? todayStr());
  const [producedBy, setProducedBy] = useState(order.production?.produced_by ?? '');
  const [supervisor, setSupervisor] = useState(order.production?.supervisor ?? '');
  const [wastage, setWastage] = useState(() =>
    (order.production?.wastage || []).map((w) => ({ _k: rid(), material: w.material, qty: w.qty, unit: w.unit, rate: w.rate, reason: w.reason || '' }))
  );
  const [needsAdditional, setNeedsAdditional] = useState(!!order.production?.needs_additional);
  const [extras, setExtras] = useState(() =>
    (order.production?.additionalMaterials || []).map((a) => ({ _k: rid(), material: a.material, qty: a.qty, unit: a.unit, reason: a.reason || '' }))
  );
  const [notes, setNotes] = useState(isRework ? `Rework after QC: ${order.qc?.rework_note || ''}` : order.production?.notes ?? '');
  const [error, setError] = useState('');

  const matNames = useMemo(() => materials.map((m) => m.name), [materials]);
  const matByName = useMemo(() => Object.fromEntries(materials.map((m) => [m.name.trim().toLowerCase(), m])), [materials]);

  const setCon = (id, patch) => setCons((l) => l.map((c) => (c.line_id === id ? { ...c, ...patch } : c)));

  const returned = cons.reduce((s, c) => s + Math.max(0, c.qty_issued - (Number(c.qty_used) || 0)), 0);
  const extraUsed = cons.reduce((s, c) => s + Math.max(0, (Number(c.qty_used) || 0) - c.qty_issued), 0);
  const wastageValue = wastage.reduce((s, w) => s + (Number(w.qty) || 0) * (Number(w.rate) || 0), 0);

  function save() {
    if (endDate < startDate) return setError('The completion date cannot be before the start date.');
    if (cons.some((c) => Number(c.qty_used) < 0)) return setError('Consumed quantities cannot be negative.');
    setError('');
    submit({
      start_date: startDate,
      started_by: startedBy,
      expected_end_date: expectedEnd,
      end_date: endDate,
      produced_by: producedBy,
      supervisor,
      notes,
      consumption: cons.map((c) => ({ line_id: c.line_id, qty_used: Number(c.qty_used) || 0, remarks: c.remarks })),
      wastage: wastage
        .filter((w) => String(w.material).trim() && Number(w.qty) > 0)
        .map((w) => ({ material: w.material, qty: Number(w.qty), unit: w.unit || 'nos', rate: Number(w.rate) || 0, reason: w.reason })),
      needs_additional: needsAdditional,
      additional_materials: needsAdditional
        ? extras.filter((x) => String(x.material).trim() && Number(x.qty) > 0).map((x) => ({ material: x.material, qty: Number(x.qty), unit: x.unit || 'nos', reason: x.reason }))
        : [],
    });
  }

  return (
    <StageShell footNote="Unused material goes back to store, extra consumption and wastage come out of stock. Everything is written to the stock ledger.">
      {error && <Alert tone="bad">{error}</Alert>}
      {isRework && (
        <Alert tone="warn" title={`Rework — QC attempt ${order.qc.attempt} failed`}>
          {order.qc.rework_note}
        </Alert>
      )}

      <Card title="Production dates">
        <div className="grid grid-3">
          <Field label="Start date" required>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </Field>
          <Field label="Expected completion" hint={`Costing allowed ${order.costing?.production_days} days`}>
            <Input type="date" value={expectedEnd} onChange={(e) => setExpectedEnd(e.target.value)} />
          </Field>
          <Field label="Actual completion" required>
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </Field>
          <Field label="Started by">
            <Input value={startedBy} onChange={(e) => setStartedBy(e.target.value)} />
          </Field>
          <Field label="Produced by / unit">
            <Input value={producedBy} onChange={(e) => setProducedBy(e.target.value)} />
          </Field>
          <Field label="Supervisor">
            <Input value={supervisor} onChange={(e) => setSupervisor(e.target.value)} />
          </Field>
        </div>
      </Card>

      <Card title="Material consumption" sub="How much of the issued material was actually used">
        <div className="stack">
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Material</th>
                  <th className="right">Issued</th>
                  <th className="right" style={{ width: 120 }}>Consumed</th>
                  <th className="right">Difference</th>
                  <th>Remarks</th>
                </tr>
              </thead>
              <tbody>
                {cons.map((c) => {
                  const diff = (Number(c.qty_used) || 0) - c.qty_issued;
                  return (
                    <tr key={c.line_id}>
                      <td className="small muted">{c.product}</td>
                      <td className="strong">{c.material}</td>
                      <td className="num muted">{fmtQty(c.qty_issued)} {c.unit}</td>
                      <td>
                        <NumInput value={c.qty_used} min="0" step="any" onChange={(e) => setCon(c.line_id, { qty_used: e.target.value })} />
                      </td>
                      <td className="num">
                        {diff === 0 ? (
                          <span className="dim">—</span>
                        ) : (
                          <Badge tone={diff > 0 ? 'warn' : 'info'}>
                            {diff > 0 ? `+${fmtQty(diff)} extra` : `${fmtQty(-diff)} returned`}
                          </Badge>
                        )}
                      </td>
                      <td>
                        <Input value={c.remarks} onChange={(e) => setCon(c.line_id, { remarks: e.target.value })} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {(returned > 0 || extraUsed > 0) && (
            <TotalStrip
              items={[
                ...(returned > 0 ? [{ label: 'Returning to store', value: `${fmtQty(returned)} units`, tone: 'ok' }] : []),
                ...(extraUsed > 0 ? [{ label: 'Extra consumed', value: `${fmtQty(extraUsed)} units`, tone: 'bad' }] : []),
              ]}
            />
          )}
        </div>
      </Card>

      <Card
        title="Scrap & wastage"
        sub="Recorded separately for the wastage report and deducted from stock"
        action={
          <button
            type="button"
            className="btn btn-sm btn-dashed"
            onClick={() => setWastage((l) => [...l, { _k: rid(), material: '', qty: '', unit: 'nos', rate: 0, reason: '' }])}
          >
            <IconPlus size={12} /> Add wastage
          </button>
        }
      >
        {wastage.length === 0 ? (
          <p className="small dim">No wastage recorded for this order.</p>
        ) : (
          <div className="stack">
            <LineHeader cols={{ template: '2fr 0.8fr 0.8fr 0.9fr 0.9fr 1.6fr 34px', labels: ['Material', 'Qty', 'Unit', 'Rate ₹', 'Value ₹', 'Reason', ''], right: [1, 3, 4] }} />
            {wastage.map((w) => (
              <div className="line-grid" key={w._k} style={{ gridTemplateColumns: '2fr 0.8fr 0.8fr 0.9fr 0.9fr 1.6fr 34px' }}>
                <Combo
                  value={w.material}
                  options={matNames}
                  placeholder="Material"
                  onChange={(v) => {
                    const m = matByName[String(v).trim().toLowerCase()];
                    setWastage((l) => l.map((x) => (x._k === w._k ? { ...x, material: v, ...(m ? { unit: m.unit, rate: Number(m.standard_rate) || 0 } : {}) } : x)));
                  }}
                />
                <NumInput value={w.qty} min="0" step="any" onChange={(e) => setWastage((l) => l.map((x) => (x._k === w._k ? { ...x, qty: e.target.value } : x)))} />
                <Select value={w.unit} options={meta.units} onChange={(e) => setWastage((l) => l.map((x) => (x._k === w._k ? { ...x, unit: e.target.value } : x)))} />
                <NumInput value={w.rate} min="0" onChange={(e) => setWastage((l) => l.map((x) => (x._k === w._k ? { ...x, rate: e.target.value } : x)))} />
                <div className="num small" style={{ alignSelf: 'center', paddingRight: 4 }}>
                  {money((Number(w.qty) || 0) * (Number(w.rate) || 0), { bare: true })}
                </div>
                <Input value={w.reason} placeholder="Why was it wasted?" onChange={(e) => setWastage((l) => l.map((x) => (x._k === w._k ? { ...x, reason: e.target.value } : x)))} />
                <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => setWastage((l) => l.filter((x) => x._k !== w._k))}>
                  ×
                </button>
              </div>
            ))}
            {wastageValue > 0 && <TotalStrip items={[{ label: 'Total value lost to wastage', value: money(wastageValue), tone: 'bad' }]} />}
          </div>
        )}
      </Card>

      <Card title="Additional material required">
        <div className="stack">
          <Check
            label="Extra material was needed beyond what the store issued"
            hint="These quantities are issued and deducted from stock when you save."
            checked={needsAdditional}
            onChange={(v) => {
              setNeedsAdditional(v);
              if (v && !extras.length) setExtras([{ _k: rid(), material: '', qty: '', unit: 'nos', reason: '' }]);
            }}
          />
          {needsAdditional && (
            <>
              <LineHeader cols={{ template: '2fr 0.8fr 0.8fr 2fr 34px', labels: ['Material', 'Qty', 'Unit', 'Reason', ''], right: [1] }} />
              {extras.map((x) => (
                <div className="line-grid" key={x._k} style={{ gridTemplateColumns: '2fr 0.8fr 0.8fr 2fr 34px' }}>
                  <Combo
                    value={x.material}
                    options={matNames}
                    placeholder="Material"
                    onChange={(v) => {
                      const m = matByName[String(v).trim().toLowerCase()];
                      setExtras((l) => l.map((e2) => (e2._k === x._k ? { ...e2, material: v, ...(m ? { unit: m.unit } : {}) } : e2)));
                    }}
                  />
                  <NumInput value={x.qty} min="0" step="any" onChange={(e) => setExtras((l) => l.map((e2) => (e2._k === x._k ? { ...e2, qty: e.target.value } : e2)))} />
                  <Select value={x.unit} options={meta.units} onChange={(e) => setExtras((l) => l.map((e2) => (e2._k === x._k ? { ...e2, unit: e.target.value } : e2)))} />
                  <Input value={x.reason} placeholder="Why is it needed?" onChange={(e) => setExtras((l) => l.map((e2) => (e2._k === x._k ? { ...e2, reason: e.target.value } : e2)))} />
                  <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => setExtras((l) => l.filter((e2) => e2._k !== x._k))}>
                    ×
                  </button>
                </div>
              ))}
              <button type="button" className="btn btn-sm btn-dashed" onClick={() => setExtras((l) => [...l, { _k: rid(), material: '', qty: '', unit: 'nos', reason: '' }])}>
                <IconPlus size={12} /> Add material request
              </button>
            </>
          )}
        </div>
      </Card>

      <Card title="Production notes">
        <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Card>

      <SaveBar busy={busy} onSave={save} label="Complete production & send to QC" />
    </StageShell>
  );
}

/* ================================================================ 10 · QC */

export function QcForm({ order, submit, busy }) {
  const [result, setResult] = useState('pass');
  const [qcDate, setQcDate] = useState(todayStr());
  const [qcBy, setQcBy] = useState('');
  const [reworkNote, setReworkNote] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState(() =>
    order.items.map((it) => ({ item_id: it.id, product: it.product, qty: Number(it.qty) || 1, qty_failed: 0, finish_ok: true, dimension_ok: true, hardware_ok: true, remarks: '' }))
  );
  const [error, setError] = useState('');

  const setItem = (id, patch) => setItems((l) => l.map((i) => (i.item_id === id ? { ...i, ...patch } : i)));
  const anyFail = items.some((i) => Number(i.qty_failed) > 0 || !i.finish_ok || !i.dimension_ok || !i.hardware_ok);

  function save() {
    if (result === 'fail' && !reworkNote.trim()) return setError('Describe what failed so production knows what to rework.');
    setError('');
    submit({
      result,
      qc_date: qcDate,
      qc_by: qcBy,
      rework_note: reworkNote,
      notes,
      items: items.map((i) => ({
        item_id: i.item_id,
        qty_failed: Number(i.qty_failed) || 0,
        qty_passed: (Number(i.qty) || 0) - (Number(i.qty_failed) || 0),
        finish_ok: i.finish_ok,
        dimension_ok: i.dimension_ok,
        hardware_ok: i.hardware_ok,
        remarks: i.remarks,
      })),
    });
  }

  return (
    <StageShell footNote="Packaging stays locked until QC passes. A failure sends the order straight back to production for rework.">
      {error && <Alert tone="bad">{error}</Alert>}
      {order.qc?.attempt > 0 && (
        <Alert tone="info" title={`This is inspection attempt ${Number(order.qc.attempt) + 1}`}>
          Previous attempt {order.qc.attempt} was {order.qc.result === 'pass' ? 'passed' : 'failed'}
          {order.qc.rework_note ? ` — ${order.qc.rework_note}` : ''}.
        </Alert>
      )}

      <Card title="Item-wise inspection" sub={`Production finished ${fmtDate(order.production?.end_date)} by ${order.production?.produced_by || '—'}`}>
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Product</th>
                <th className="right">Qty</th>
                <th className="right" style={{ width: 100 }}>Failed qty</th>
                <th className="center" style={{ width: 78 }}>Finish</th>
                <th className="center" style={{ width: 92 }}>Dimensions</th>
                <th className="center" style={{ width: 88 }}>Hardware</th>
                <th>Remarks</th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.item_id}>
                  <td className="strong">{i.product}</td>
                  <td className="num">{fmtQty(i.qty)}</td>
                  <td>
                    <NumInput value={i.qty_failed} min="0" max={i.qty} step="any" onChange={(e) => setItem(i.item_id, { qty_failed: e.target.value })} />
                  </td>
                  {['finish_ok', 'dimension_ok', 'hardware_ok'].map((k) => (
                    <td key={k} className="center">
                      <input type="checkbox" checked={i[k]} onChange={(e) => setItem(i.item_id, { [k]: e.target.checked })} style={{ width: 16, height: 16, accentColor: 'var(--brand-600)' }} />
                    </td>
                  ))}
                  <td>
                    <Input value={i.remarks} onChange={(e) => setItem(i.item_id, { remarks: e.target.value })} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {anyFail && result === 'pass' && (
          <div style={{ marginTop: 12 }}>
            <Alert tone="warn" title="Some checks are marked not OK">
              You have flagged failures above but the overall result is still set to pass. Switch to “Rejected” below if
              the goods need rework.
            </Alert>
          </div>
        )}
      </Card>

      <Card title="Inspection result">
        <div className="stack">
          <div className="grid grid-2" style={{ gap: 'var(--s3)' }}>
            <DecisionTile
              selected={result === 'pass'}
              onClick={() => setResult('pass')}
              tone="ok"
              icon={IconCheckCircle}
              title="Passed — clear for packing"
              body="Unlocks the packaging step."
            />
            <DecisionTile
              selected={result === 'fail'}
              onClick={() => setResult('fail')}
              tone="bad"
              icon={IconAlert}
              title="Rejected — send for rework"
              body="Returns the order to production."
            />
          </div>

          <div className="grid grid-2">
            <Field label="Inspection date" required>
              <Input type="date" value={qcDate} onChange={(e) => setQcDate(e.target.value)} />
            </Field>
            <Field label="Inspected by" required>
              <Input value={qcBy} onChange={(e) => setQcBy(e.target.value)} placeholder="Your name" />
            </Field>
          </div>

          {result === 'fail' && (
            <Field label="What needs rework?" required>
              <Textarea rows={3} value={reworkNote} onChange={(e) => setReworkNote(e.target.value)} placeholder="Be specific — production will work from this note." />
            </Field>
          )}
          <Field label="Inspection notes">
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </div>
      </Card>

      <SaveBar
        busy={busy}
        onSave={save}
        label={result === 'pass' ? 'Approve QC & unlock packing' : 'Reject & return to production'}
        tone={result === 'pass' ? 'primary' : 'danger'}
      />
    </StageShell>
  );
}

/* =========================================================== 11 · PACKING */

export function PackingForm({ order, submit, busy }) {
  const [boxes, setBoxes] = useState(() =>
    order.items.map((it) => ({ _k: rid(), box_no: '', contents: it.product, qty: it.qty, weight: '', dimensions: '' }))
  );
  const [packingDate, setPackingDate] = useState(todayStr());
  const [packedBy, setPackedBy] = useState('');
  const [packingMaterial, setPackingMaterial] = useState('');
  const [notes, setNotes] = useState('');
  const [ready, setReady] = useState(false);

  const setBox = (k, patch) => setBoxes((l) => l.map((b) => (b._k === k ? { ...b, ...patch } : b)));
  const filled = boxes.filter((b) => String(b.contents).trim() || String(b.box_no).trim());
  const grossWeight = filled.reduce((s, b) => s + (Number(b.weight) || 0), 0);

  return (
    <StageShell footNote="Packing can only start after QC approval. Marking ready for dispatch moves the order to the dispatch department.">
      <Alert tone="ok" title={`QC passed on ${fmtDate(order.qc?.qc_date)}`}>
        Inspected by {order.qc?.qc_by || '—'}
        {order.qc?.notes ? ` — ${order.qc.notes}` : ''}.
      </Alert>

      <Card
        title="Box list"
        sub="One row per box. Numbers are auto-assigned if you leave them blank."
        action={
          <button type="button" className="btn btn-sm btn-dashed" onClick={() => setBoxes((l) => [...l, { _k: rid(), box_no: '', contents: '', qty: '', weight: '', dimensions: '' }])}>
            <IconPlus size={12} /> Add box
          </button>
        }
      >
        <div className="stack">
          <LineHeader cols={{ template: '0.9fr 2.4fr 0.7fr 0.8fr 1.1fr 34px', labels: ['Box no', 'Contents', 'Qty', 'Weight kg', 'Dimensions', ''], right: [2, 3] }} />
          {boxes.map((b, i) => (
            <div className="line-grid" key={b._k} style={{ gridTemplateColumns: '0.9fr 2.4fr 0.7fr 0.8fr 1.1fr 34px' }}>
              <Input value={b.box_no} placeholder={`BOX-${i + 1}`} onChange={(e) => setBox(b._k, { box_no: e.target.value })} />
              <Input value={b.contents} placeholder="What is inside" onChange={(e) => setBox(b._k, { contents: e.target.value })} />
              <NumInput value={b.qty} min="0" step="any" onChange={(e) => setBox(b._k, { qty: e.target.value })} />
              <NumInput value={b.weight} min="0" step="any" onChange={(e) => setBox(b._k, { weight: e.target.value })} />
              <Input value={b.dimensions} placeholder="8x4x1 ft" onChange={(e) => setBox(b._k, { dimensions: e.target.value })} />
              <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => setBoxes((l) => (l.length > 1 ? l.filter((x) => x._k !== b._k) : l))} disabled={boxes.length === 1}>
                ×
              </button>
            </div>
          ))}
          <TotalStrip
            items={[
              { label: 'Boxes', value: String(filled.length) },
              { label: 'Gross weight', value: grossWeight ? `${fmtQty(grossWeight)} kg` : '—' },
            ]}
          />
        </div>
      </Card>

      <Card title="Packing details">
        <div className="stack">
          <div className="grid grid-3">
            <Field label="Packing date" required>
              <Input type="date" value={packingDate} onChange={(e) => setPackingDate(e.target.value)} />
            </Field>
            <Field label="Packed by" required>
              <Input value={packedBy} onChange={(e) => setPackedBy(e.target.value)} placeholder="Your name" />
            </Field>
            <Field label="Packing material used">
              <Input value={packingMaterial} onChange={(e) => setPackingMaterial(e.target.value)} placeholder="Bubble wrap, corrugated box…" />
            </Field>
            <Field label="Notes" span={3}>
              <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
          </div>

          <div
            style={{
              padding: 'var(--s4)',
              border: `1.5px solid ${ready ? 'var(--ok-br)' : 'var(--warn-br)'}`,
              background: ready ? 'var(--ok-bg)' : 'var(--warn-bg)',
              borderRadius: 'var(--r)',
            }}
          >
            <Check
              label="Goods are packed and ready for dispatch"
              hint="The dispatch department only sees orders that are marked ready."
              checked={ready}
              onChange={setReady}
            />
          </div>
        </div>
      </Card>

      <SaveBar
        busy={busy}
        onSave={() =>
          submit({
            ready_for_dispatch: ready,
            packing_date: packingDate,
            packed_by: packedBy,
            packing_material: packingMaterial,
            notes,
            total_boxes: filled.length,
            gross_weight: grossWeight,
            boxes: filled.map((b, i) => ({ box_no: b.box_no || `BOX-${i + 1}`, contents: b.contents, qty: Number(b.qty) || 0, weight: Number(b.weight) || 0, dimensions: b.dimensions })),
          })
        }
        label="Mark ready for dispatch"
        disabled={!ready}
        disabledHint={!ready ? 'Confirm the goods are packed' : ''}
      />
    </StageShell>
  );
}

/* ========================================================== 12 · DISPATCH */

export function DispatchForm({ order, submit, busy }) {
  const [dispatchDate, setDispatchDate] = useState(todayStr());
  const [transporter, setTransporter] = useState('');
  const [vehicleNo, setVehicleNo] = useState('');
  const [driverName, setDriverName] = useState('');
  const [driverPhone, setDriverPhone] = useState('');
  const [lrNo, setLrNo] = useState('');
  const [freight, setFreight] = useState(order.planning?.freight_charges ?? 0);
  const [ewayBill, setEwayBill] = useState('');
  const [boxes, setBoxes] = useState(order.packing?.total_boxes ?? 0);
  const [address, setAddress] = useState(
    [order.cust_address, order.cust_city, order.cust_state, order.cust_pincode].filter(Boolean).join(', ')
  );
  const [notes, setNotes] = useState('');

  return (
    <StageShell footNote="Saving records the delivery challan and marks the finished goods as dispatched.">
      <Alert tone="ok" title={`Packed on ${fmtDate(order.packing?.packing_date)}`}>
        {order.packing?.total_boxes} box(es), {fmtQty(order.packing?.gross_weight)} kg gross, packed by{' '}
        {order.packing?.packed_by || '—'}.
      </Alert>

      <Card title="Delivery address">
        <Textarea rows={2} value={address} onChange={(e) => setAddress(e.target.value)} />
        {order.site_address && (
          <button type="button" className="btn btn-sm btn-ghost" style={{ marginTop: 8, paddingLeft: 0 }} onClick={() => setAddress([order.site_address, order.site_city].filter(Boolean).join(', '))}>
            Use the site address instead
          </button>
        )}
      </Card>

      <Card title="Transport details">
        <div className="grid grid-3">
          <Field label="Dispatch date" required>
            <Input type="date" value={dispatchDate} onChange={(e) => setDispatchDate(e.target.value)} />
          </Field>
          <Field label="Transporter" required>
            <Input value={transporter} onChange={(e) => setTransporter(e.target.value)} placeholder="e.g. VRL Logistics" />
          </Field>
          <Field label="Vehicle number" required>
            <Input value={vehicleNo} onChange={(e) => setVehicleNo(e.target.value)} placeholder="GJ05 AB 1234" style={{ textTransform: 'uppercase' }} />
          </Field>
          <Field label="Driver name">
            <Input value={driverName} onChange={(e) => setDriverName(e.target.value)} />
          </Field>
          <Field label="Driver phone">
            <Input value={driverPhone} onChange={(e) => setDriverPhone(e.target.value)} inputMode="tel" />
          </Field>
          <Field label="LR / docket number">
            <Input value={lrNo} onChange={(e) => setLrNo(e.target.value)} />
          </Field>
          <Field label="Number of boxes">
            <NumInput value={boxes} min="0" onChange={(e) => setBoxes(e.target.value)} />
          </Field>
          <Field label="Freight paid (₹)">
            <NumInput value={freight} min="0" onChange={(e) => setFreight(e.target.value)} />
          </Field>
          <Field label="E-way bill number" hint="Required above ₹50,000 in most cases">
            <Input value={ewayBill} onChange={(e) => setEwayBill(e.target.value)} />
          </Field>
          <Field label="Notes" span={3}>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </div>
      </Card>

      <SaveBar
        busy={busy}
        onSave={() =>
          submit({
            dispatch_date: dispatchDate, transporter, vehicle_no: vehicleNo, driver_name: driverName,
            driver_phone: driverPhone, lr_no: lrNo, freight_amount: Number(freight) || 0,
            delivery_address: address, eway_bill_no: ewayBill, boxes: Number(boxes) || 0, notes,
          })
        }
        label="Record dispatch & generate challan"
        disabled={!transporter.trim() || !vehicleNo.trim()}
        disabledHint={!transporter.trim() || !vehicleNo.trim() ? 'Transporter and vehicle number are required' : ''}
      />
    </StageShell>
  );
}

/* =========================================================== 13 · INVOICE */

export function InvoiceForm({ order, submit, busy }) {
  const q = order.quotation;
  const [invoiceDate, setInvoiceDate] = useState(todayStr());
  const [taxable, setTaxable] = useState(Number(q?.subtotal) || 0);
  const [gstRate, setGstRate] = useState(Number(q?.gst_rate) || 18);
  const [placeOfSupply, setPlaceOfSupply] = useState(order.cust_state || '');
  const [irn, setIrn] = useState('');
  const [notes, setNotes] = useState('');

  const gstAmount = ((Number(taxable) || 0) * (Number(gstRate) || 0)) / 100;
  const grandTotal = (Number(taxable) || 0) + gstAmount;
  const differs = Math.abs(grandTotal - Number(order.salesOrder?.locked_total || 0)) > 0.5;

  return (
    <StageShell footNote="Saving numbers both the delivery note and the tax invoice, and moves the order to Accounts for the balance.">
      <Card title="Invoice details" sub={`Against sales order ${order.salesOrder?.so_no} · challan ${order.dispatch?.challan_no}`}>
        <div className="stack">
          <div className="grid grid-3">
            <Field label="Invoice date" required>
              <Input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
            </Field>
            <Field label="Taxable amount (₹)" required hint="Defaults to the quoted taxable value">
              <NumInput value={taxable} min="0" onChange={(e) => setTaxable(e.target.value)} />
            </Field>
            <Field label="GST rate (%)" required>
              <Select value={gstRate} onChange={(e) => setGstRate(e.target.value)} options={[0, 5, 12, 18, 28].map((r) => ({ value: r, label: `${r}%` }))} />
            </Field>
            <Field label="Place of supply">
              <Input value={placeOfSupply} onChange={(e) => setPlaceOfSupply(e.target.value)} />
            </Field>
            <Field label="IRN / e-invoice reference" span={2}>
              <Input value={irn} onChange={(e) => setIrn(e.target.value)} />
            </Field>
            <Field label="Notes" span={3}>
              <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
          </div>

          <TotalStrip
            items={[
              { label: 'Taxable', value: money(taxable) },
              { label: `GST ${gstRate}%`, value: money(gstAmount) },
              { label: 'Invoice total', value: money(grandTotal), tone: 'ok' },
              { label: 'Sales order value', value: money(order.salesOrder?.locked_total) },
            ]}
          />
          {differs && (
            <Alert tone="warn" title="Invoice differs from the sales order">
              The invoice total is {money(grandTotal)} against a confirmed order of {money(order.salesOrder?.locked_total)}.
              Make sure this is intended before saving.
            </Alert>
          )}
        </div>
      </Card>

      <SaveBar
        busy={busy}
        onSave={() =>
          submit({ invoice_date: invoiceDate, taxable_amount: Number(taxable) || 0, gst_rate: Number(gstRate) || 0, place_of_supply: placeOfSupply, irn, notes })
        }
        label="Generate delivery note & invoice"
        disabled={!(Number(taxable) > 0)}
      />
    </StageShell>
  );
}

/* ===================================================== 14 · FINAL PAYMENT */

export function PaymentForm({ order, meta, submit, busy }) {
  const billed = Number(order.invoice?.grand_total) || 0;
  const alreadyPaid = order.payments.filter((p) => p.kind !== 'final').reduce((s, p) => s + Number(p.amount), 0);
  const due = Math.max(0, billed - alreadyPaid);

  const [amount, setAmount] = useState(due);
  const [receivedAt, setReceivedAt] = useState(todayStr());
  const [deliveredDate, setDeliveredDate] = useState(order.dispatch?.dispatch_date ?? todayStr());
  const [mode, setMode] = useState('Bank transfer');
  const [reference, setReference] = useState('');
  const [remarks, setRemarks] = useState('');

  const outstanding = billed - alreadyPaid - (Number(amount) || 0);
  const over = outstanding < -0.5;

  return (
    <StageShell footNote="Any shortfall stays in the outstanding payments report against this customer.">
      <Card title="Balance collection" sub={`Invoice ${order.invoice?.invoice_no} dated ${fmtDate(order.invoice?.invoice_date)}`}>
        <div className="stack">
          <div className="table-wrap">
            <table className="tbl compact">
              <thead>
                <tr>
                  <th>Receipt</th>
                  <th>Type</th>
                  <th>Date</th>
                  <th>Mode</th>
                  <th className="right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {order.payments.filter((p) => p.kind !== 'final').map((p) => (
                  <tr key={p.id}>
                    <td className="mono small">{p.receipt_no}</td>
                    <td className="small">{p.kind === 'advance' ? 'Advance' : 'Part payment'}</td>
                    <td>{fmtDate(p.received_at)}</td>
                    <td className="small">{p.mode}</td>
                    <td className="num">{money(p.amount, { bare: true })}</td>
                  </tr>
                ))}
                {!alreadyPaid && (
                  <tr>
                    <td colSpan={5} className="dim center">No payments received yet.</td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4}>Received so far</td>
                  <td className="num">{money(alreadyPaid, { bare: true })}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="grid grid-3">
            <Field label="Balance received now (₹)" required error={over ? 'This exceeds the invoice total.' : ''} hint={`Due: ${money(due)}`}>
              <NumInput value={amount} min="0" onChange={(e) => setAmount(e.target.value)} invalid={over} />
            </Field>
            <Field label="Received on" required>
              <Input type="date" value={receivedAt} onChange={(e) => setReceivedAt(e.target.value)} />
            </Field>
            <Field label="Mode" required>
              <Select value={mode} onChange={(e) => setMode(e.target.value)} options={meta.paymentModes} />
            </Field>
            <Field label="Reference" span={2}>
              <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Cheque / UTR / UPI reference" />
            </Field>
            <Field label="Goods delivered on" hint="Confirmed delivery date at the customer's site">
              <Input type="date" value={deliveredDate} onChange={(e) => setDeliveredDate(e.target.value)} />
            </Field>
            <Field label="Remarks" span={3}>
              <Textarea rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
            </Field>
          </div>

          <TotalStrip
            items={[
              { label: 'Invoice total', value: money(billed) },
              { label: 'Received earlier', value: money(alreadyPaid) },
              { label: 'Receiving now', value: money(amount), tone: 'ok' },
              { label: 'Still outstanding', value: money(Math.max(0, outstanding)), tone: outstanding > 0.5 ? 'bad' : 'ok' },
            ]}
          />
          {outstanding > 0.5 && (
            <Alert tone="warn" title="Partial settlement">
              {money(outstanding)} will remain against this customer in the outstanding payments report.
            </Alert>
          )}
        </div>
      </Card>

      <SaveBar
        busy={busy}
        onSave={() =>
          submit({ balance_amount: Number(amount) || 0, received_at: receivedAt, delivered_date: deliveredDate, mode, reference, remarks })
        }
        label="Record payment & continue to gate pass"
        disabled={over}
      />
    </StageShell>
  );
}

/* ========================================================== 15 · GATE PASS */

export function GatePassForm({ order, submit, busy }) {
  const [gpDate, setGpDate] = useState(todayStr());
  const [gpTime, setGpTime] = useState(new Date().toTimeString().slice(0, 5));
  const [vehicleNo, setVehicleNo] = useState(order.dispatch?.vehicle_no ?? '');
  const [driverName, setDriverName] = useState(order.dispatch?.driver_name ?? '');
  const [securityBy, setSecurityBy] = useState('');
  const [boxes, setBoxes] = useState(order.dispatch?.boxes ?? order.packing?.total_boxes ?? 0);
  const [remarks, setRemarks] = useState('');

  const outstanding = Number(order.payment?.outstanding) || 0;

  return (
    <StageShell footNote="This is the final step. Issuing the gate pass closes the order.">
      <Card title="Process complete" sub="All previous steps are signed off">
        <div className="grid grid-2" style={{ gap: 'var(--s2) var(--s5)' }}>
          {[
            ['QC', `Passed ${fmtDate(order.qc?.qc_date)}`],
            ['Packed', `${order.packing?.total_boxes} box(es) on ${fmtDate(order.packing?.packing_date)}`],
            ['Dispatched', `${order.dispatch?.challan_no} on ${fmtDate(order.dispatch?.dispatch_date)}`],
            ['Invoiced', `${order.invoice?.invoice_no} — ${money(order.invoice?.grand_total)}`],
            ['Payment', outstanding > 0.5 ? `${money(outstanding)} still outstanding` : 'Fully settled'],
          ].map(([k, v]) => (
            <div key={k} className="row-tight">
              <IconCheckCircle size={14} style={{ color: 'var(--ok-fg)', flex: 'none' }} />
              <span className="small">
                <span className="strong">{k}:</span> {v}
              </span>
            </div>
          ))}
        </div>
        {outstanding > 0.5 && (
          <div style={{ marginTop: 12 }}>
            <Alert tone="warn" title="Payment is not fully settled">
              {money(outstanding)} is still outstanding. Issue the gate pass only if management has approved release.
            </Alert>
          </div>
        )}
      </Card>

      <Card title="Gate pass — outward">
        <div className="grid grid-3">
          <Field label="Gate pass date" required>
            <Input type="date" value={gpDate} onChange={(e) => setGpDate(e.target.value)} />
          </Field>
          <Field label="Time out" required>
            <Input type="time" value={gpTime} onChange={(e) => setGpTime(e.target.value)} />
          </Field>
          <Field label="Number of boxes">
            <NumInput value={boxes} min="0" onChange={(e) => setBoxes(e.target.value)} />
          </Field>
          <Field label="Vehicle number" required>
            <Input value={vehicleNo} onChange={(e) => setVehicleNo(e.target.value)} style={{ textTransform: 'uppercase' }} />
          </Field>
          <Field label="Driver name">
            <Input value={driverName} onChange={(e) => setDriverName(e.target.value)} />
          </Field>
          <Field label="Security / issued by" required>
            <Input value={securityBy} onChange={(e) => setSecurityBy(e.target.value)} placeholder="Your name" />
          </Field>
          <Field label="Remarks" span={3}>
            <Textarea rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
          </Field>
        </div>
      </Card>

      <SaveBar
        busy={busy}
        onSave={() =>
          submit({ gate_pass_date: gpDate, gate_pass_time: gpTime, vehicle_no: vehicleNo, driver_name: driverName, security_by: securityBy, boxes: Number(boxes) || 0, remarks })
        }
        label="Issue gate pass & close the order"
        tone="ok"
        disabled={!vehicleNo.trim()}
        disabledHint={!vehicleNo.trim() ? 'Vehicle number is required' : ''}
      />
    </StageShell>
  );
}

/* ================================================================ save bar */

function SaveBar({ onSave, busy, label, tone = 'primary', disabled, disabledHint }) {
  return (
    <div
      className="between wrap"
      style={{
        position: 'sticky',
        bottom: 0,
        background: 'var(--surface)',
        border: '1px solid var(--line)',
        borderRadius: 'var(--r-lg)',
        boxShadow: 'var(--sh-2)',
        padding: 'var(--s3) var(--s4)',
        marginTop: 'var(--s2)',
        zIndex: 4,
      }}
    >
      <span className="small muted">{disabledHint || 'Saving advances the order to the next department.'}</span>
      <button type="button" className={`btn btn-${tone} btn-lg`} onClick={onSave} disabled={busy || disabled}>
        {busy && <span className="spinner" />}
        {label}
      </button>
    </div>
  );
}

export const STAGE_FORMS = {
  costing: CostingForm,
  planning: PlanningForm,
  quotation: QuotationForm,
  approval: ApprovalForm,
  salesOrder: SalesOrderForm,
  advance: AdvanceForm,
  store: StoreForm,
  production: ProductionForm,
  qc: QcForm,
  packing: PackingForm,
  dispatch: DispatchForm,
  invoice: InvoiceForm,
  payment: PaymentForm,
  gatepass: GatePassForm,
};
