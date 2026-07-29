/**
 * Printable documents. Each takes the hydrated order and renders A4-ready
 * markup; the print stylesheet in styles.css strips the app chrome away.
 */

import { useAuth } from '../auth.jsx';
import { money, fmtDate, qty as fmtQty, amountInWords } from '../format.js';

/* ------------------------------------------------------------------ chrome */

function Letterhead({ company, title, docNo, docDate, extra }) {
  return (
    <header className="doc-head">
      <div>
        <div className="doc-co-name">{company?.name || 'ARROHAN LIVING PVT LTD'}</div>
        <div className="doc-co-meta">
          {[company?.address, [company?.city, company?.state, company?.pincode].filter(Boolean).join(' ')]
            .filter(Boolean)
            .map((l, i) => (
              <div key={i}>{l}</div>
            ))}
          {company?.mobile && <div>Mobile: {company.mobile}{company?.email ? ` · ${company.email}` : ''}</div>}
          {company?.gstin && <div>GSTIN: {company.gstin}{company?.pan ? ` · PAN: ${company.pan}` : ''}</div>}
        </div>
      </div>
      <div className="doc-title">
        <h2>{title}</h2>
        {docNo && <div className="doc-no">{docNo}</div>}
        {docDate && <div className="doc-date">Date: {fmtDate(docDate)}</div>}
        {extra}
      </div>
    </header>
  );
}

function PartyBlock({ order, label = 'Bill to', addressOverride }) {
  return (
    <div>
      <div className="doc-section-title">{label}</div>
      <div style={{ fontWeight: 700, fontSize: 12 }}>{order.cust_company || order.cust_name}</div>
      {order.cust_company && order.cust_name && <div>{order.cust_name}</div>}
      <div style={{ whiteSpace: 'pre-line' }}>
        {addressOverride || [order.cust_address, [order.cust_city, order.cust_state, order.cust_pincode].filter(Boolean).join(' ')].filter(Boolean).join('\n')}
      </div>
      {order.cust_phone && <div>Phone: {order.cust_phone}</div>}
      {order.cust_gstin && <div>GSTIN: {order.cust_gstin}</div>}
    </div>
  );
}

function OrderRefBlock({ order, rows }) {
  return (
    <div>
      <div className="doc-section-title">Reference</div>
      <div className="doc-kv">
        {rows.filter(Boolean).map(([k, v], i) => (
          <div key={i}>
            <span className="k">{k}</span>
            <span>{v || '—'}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Signatures({ left = 'Customer signature', right, company }) {
  return (
    <div className="doc-sign">
      <div>
        <div style={{ height: 40 }} />
        <div className="line">{left}</div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ height: 40 }} />
        <div className="line">{right || `For ${company?.name || 'Arrohan Living Pvt Ltd'}`}</div>
      </div>
    </div>
  );
}

function Foot({ children }) {
  return <div className="doc-foot">{children || 'This is a computer-generated document.'}</div>;
}

/* -------------------------------------------------------------- QUOTATION */

function Quotation({ order, company }) {
  const q = order.quotation;
  const p = order.planning;
  if (!q || !p) return null;
  return (
    <div className="doc">
      <Letterhead company={company} title="Quotation" docNo={q.quotation_no} docDate={q.quotation_date} />

      <div className="doc-section doc-grid">
        <PartyBlock order={order} label="Quotation for" />
        <OrderRefBlock
          order={order}
          rows={[
            ['Enquiry no', order.enquiry_no],
            ['Quotation no', q.quotation_no],
            ['Valid till', q.valid_till ? fmtDate(q.valid_till) : '—'],
            ['Delivery in', p.delivery_date ? fmtDate(p.delivery_date) : '—'],
            order.site_name && ['Site', order.site_name],
          ]}
        />
      </div>

      <div className="doc-section">
        <table>
          <thead>
            <tr>
              <th style={{ width: 26 }}>#</th>
              <th>Description</th>
              <th style={{ width: 70 }}>Size</th>
              <th className="r" style={{ width: 48 }}>Qty</th>
              <th className="r" style={{ width: 76 }}>Rate</th>
              <th className="r" style={{ width: 86 }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {p.items.map((it, i) => {
              const src = order.items.find((x) => x.id === it.item_id);
              const spec = src ? [src.material, src.laminate, src.colour, src.hardware].filter(Boolean).join(' · ') : '';
              return (
                <tr key={it.id}>
                  <td>{i + 1}</td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{it.product}</div>
                    {spec && <div style={{ fontSize: 9.5, color: '#666' }}>{spec}</div>}
                  </td>
                  <td>{it.size || src?.size || '—'}</td>
                  <td className="r">{fmtQty(it.qty)}</td>
                  <td className="r">{money(it.selling_price, { bare: true })}</td>
                  <td className="r">{money(it.amount, { bare: true })}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={5} className="r">Products total</td>
              <td className="r">{money(p.items_total, { bare: true })}</td>
            </tr>
            {Number(p.discount_amount) > 0 && (
              <tr>
                <td colSpan={5} className="r">
                  Less discount{Number(p.discount_percent) > 0 ? ` (${p.discount_percent}%)` : ''}
                </td>
                <td className="r">- {money(p.discount_amount, { bare: true })}</td>
              </tr>
            )}
            {Number(p.freight_charges) > 0 && (
              <tr>
                <td colSpan={5} className="r">Freight</td>
                <td className="r">{money(p.freight_charges, { bare: true })}</td>
              </tr>
            )}
            {Number(p.installation_charges) > 0 && (
              <tr>
                <td colSpan={5} className="r">Installation</td>
                <td className="r">{money(p.installation_charges, { bare: true })}</td>
              </tr>
            )}
            {Number(p.loading_charges) > 0 && (
              <tr>
                <td colSpan={5} className="r">Loading &amp; unloading</td>
                <td className="r">{money(p.loading_charges, { bare: true })}</td>
              </tr>
            )}
            <tr>
              <td colSpan={5} className="r">Taxable value</td>
              <td className="r">{money(q.subtotal, { bare: true })}</td>
            </tr>
            <tr>
              <td colSpan={5} className="r">GST @ {q.gst_rate}%</td>
              <td className="r">{money(q.gst_amount, { bare: true })}</td>
            </tr>
            <tr className="doc-total-row">
              <td colSpan={5} className="r">Grand total</td>
              <td className="r">{money(q.grand_total)}</td>
            </tr>
          </tfoot>
        </table>
        <div className="doc-note" style={{ marginTop: 6 }}>
          <strong>Amount in words:</strong> {amountInWords(q.grand_total)}
        </div>
      </div>

      <div className="doc-section">
        <div className="doc-section-title">Terms &amp; conditions</div>
        <div className="doc-note">
          <div>1. Payment terms: {p.payment_terms || '—'}</div>
          <div>2. Delivery: on or before {p.delivery_date ? fmtDate(p.delivery_date) : '—'}, from the date of advance receipt.</div>
          {q.warranty && <div>3. Warranty: {q.warranty}</div>}
          <div>{q.warranty ? '4' : '3'}. This quotation is valid till {q.valid_till ? fmtDate(q.valid_till) : '—'}.</div>
          {q.terms && <div style={{ marginTop: 4, whiteSpace: 'pre-line' }}>{q.terms}</div>}
        </div>
      </div>

      <Signatures left="Customer acceptance" company={company} />
      <Foot />
    </div>
  );
}

/* ------------------------------------------------------------ SALES ORDER */

function SalesOrder({ order, company }) {
  const so = order.salesOrder;
  const p = order.planning;
  if (!so) return null;
  return (
    <div className="doc">
      <Letterhead company={company} title="Sales Order" docNo={so.so_no} docDate={so.so_date} />

      <div className="doc-section doc-grid">
        <PartyBlock order={order} label="Customer" />
        <OrderRefBlock
          order={order}
          rows={[
            ['Order no', order.order_no],
            ['Quotation no', so.quotation_no],
            ['Customer PO', so.po_number],
            ['PO date', so.po_date ? fmtDate(so.po_date) : null],
            ['Signed on', so.signed_date ? fmtDate(so.signed_date) : null],
            ['Delivery by', p?.delivery_date ? fmtDate(p.delivery_date) : null],
          ]}
        />
      </div>

      <div className="doc-section">
        <table>
          <thead>
            <tr>
              <th style={{ width: 26 }}>#</th>
              <th>Description</th>
              <th style={{ width: 70 }}>Size</th>
              <th className="r" style={{ width: 48 }}>Qty</th>
              <th className="r" style={{ width: 76 }}>Rate</th>
              <th className="r" style={{ width: 86 }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {(p?.items || []).map((it, i) => (
              <tr key={it.id}>
                <td>{i + 1}</td>
                <td style={{ fontWeight: 600 }}>{it.product}</td>
                <td>{it.size || '—'}</td>
                <td className="r">{fmtQty(it.qty)}</td>
                <td className="r">{money(it.selling_price, { bare: true })}</td>
                <td className="r">{money(it.amount, { bare: true })}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="doc-total-row">
              <td colSpan={5} className="r">Order value (incl. GST)</td>
              <td className="r">{money(so.locked_total)}</td>
            </tr>
          </tfoot>
        </table>
        <div className="doc-note" style={{ marginTop: 6 }}>
          <strong>Amount in words:</strong> {amountInWords(so.locked_total)}
        </div>
      </div>

      <div className="doc-section doc-grid">
        <div>
          <div className="doc-section-title">Payment terms</div>
          <div className="doc-note">{so.locked_terms || '—'}</div>
        </div>
        <div>
          <div className="doc-section-title">Status</div>
          <div className="doc-note">
            <span className="doc-stamp" style={{ borderColor: '#1c6b3f', color: '#1c6b3f' }}>
              {so.customer_signed ? 'Customer approved & signed' : 'Awaiting signature'}
            </span>
          </div>
        </div>
      </div>

      <Signatures left="Customer signature" company={company} />
      <Foot>Production begins only against this confirmed sales order.</Foot>
    </div>
  );
}

/* --------------------------------------------------------------- RECEIPTS */

function Receipt({ order, company, kind }) {
  const payment = order.payments.find((p) => p.kind === kind);
  if (!payment) return null;
  const billed = Number(order.invoice?.grand_total || order.salesOrder?.locked_total || 0);
  const paidTotal = order.payments.reduce((s, p) => s + Number(p.amount), 0);
  const balance = Math.max(0, billed - paidTotal);
  const isFinal = kind === 'final';

  return (
    <div className="doc">
      <Letterhead
        company={company}
        title={isFinal ? 'Final Payment Receipt' : 'Advance Receipt'}
        docNo={payment.receipt_no}
        docDate={payment.received_at}
      />

      <div className="doc-section doc-grid">
        <PartyBlock order={order} label="Received from" />
        <OrderRefBlock
          order={order}
          rows={[
            ['Order no', order.order_no],
            ['Sales order', order.salesOrder?.so_no],
            isFinal && ['Invoice no', order.invoice?.invoice_no],
            ['Mode', payment.mode],
            payment.reference && ['Reference', payment.reference],
          ]}
        />
      </div>

      <div className="doc-section">
        <table>
          <tbody>
            <tr>
              <td style={{ width: '62%' }}>
                {isFinal ? 'Balance payment received against invoice' : 'Advance received against sales order'}{' '}
                {isFinal ? order.invoice?.invoice_no : order.salesOrder?.so_no}
              </td>
              <td className="r" style={{ fontSize: 14, fontWeight: 700 }}>{money(payment.amount)}</td>
            </tr>
          </tbody>
        </table>
        <div className="doc-note" style={{ marginTop: 6 }}>
          <strong>Amount in words:</strong> {amountInWords(payment.amount)}
        </div>
      </div>

      <div className="doc-section">
        <div className="doc-section-title">Account position</div>
        <table>
          <tbody>
            <tr>
              <td>{isFinal ? 'Invoice total' : 'Order value'}</td>
              <td className="r">{money(billed, { bare: true })}</td>
            </tr>
            <tr>
              <td>Total received to date</td>
              <td className="r">{money(paidTotal, { bare: true })}</td>
            </tr>
            <tr className="doc-total-row">
              <td>Balance outstanding</td>
              <td className="r">{money(balance)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {payment.remarks && (
        <div className="doc-section">
          <div className="doc-section-title">Remarks</div>
          <div className="doc-note">{payment.remarks}</div>
        </div>
      )}

      <Signatures left="Customer" right={`For ${company?.name || 'Arrohan Living Pvt Ltd'} — Authorised signatory`} company={company} />
      <Foot>Cheque / transfer receipts are subject to realisation.</Foot>
    </div>
  );
}

/* -------------------------------------------------- CHALLAN / DELIVERY NOTE */

function DeliveryDoc({ order, company, mode }) {
  const d = order.dispatch;
  if (!d) return null;
  const isNote = mode === 'note';
  const boxes = order.packing?.boxes || [];

  return (
    <div className="doc">
      <Letterhead
        company={company}
        title={isNote ? 'Delivery Note' : 'Delivery Challan'}
        docNo={isNote ? order.invoice?.delivery_note_no || d.challan_no : d.challan_no}
        docDate={d.dispatch_date}
        extra={<div className="doc-date">Order: {order.order_no}</div>}
      />

      <div className="doc-section doc-grid">
        <PartyBlock order={order} label="Deliver to" addressOverride={d.delivery_address} />
        <OrderRefBlock
          order={order}
          rows={[
            ['Sales order', order.salesOrder?.so_no],
            isNote && ['Invoice no', order.invoice?.invoice_no],
            ['Transporter', d.transporter],
            ['Vehicle no', d.vehicle_no],
            ['Driver', d.driver_name],
            ['LR no', d.lr_no],
            d.eway_bill_no && ['E-way bill', d.eway_bill_no],
          ]}
        />
      </div>

      <div className="doc-section">
        <table>
          <thead>
            <tr>
              <th style={{ width: 26 }}>#</th>
              <th>Description of goods</th>
              <th style={{ width: 80 }}>Size</th>
              <th className="r" style={{ width: 56 }}>Qty</th>
              <th style={{ width: 46 }}>Unit</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((it, i) => (
              <tr key={it.id}>
                <td>{i + 1}</td>
                <td>
                  <div style={{ fontWeight: 600 }}>{it.product}</div>
                  {[it.material, it.laminate, it.colour].filter(Boolean).length > 0 && (
                    <div style={{ fontSize: 9.5, color: '#666' }}>
                      {[it.material, it.laminate, it.colour].filter(Boolean).join(' · ')}
                    </div>
                  )}
                </td>
                <td>{it.size || '—'}</td>
                <td className="r">{fmtQty(it.qty)}</td>
                <td>{it.unit}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {boxes.length > 0 && (
        <div className="doc-section">
          <div className="doc-section-title">Packing detail — {order.packing.total_boxes} box(es), {fmtQty(order.packing.gross_weight)} kg gross</div>
          <table>
            <thead>
              <tr>
                <th style={{ width: 70 }}>Box</th>
                <th>Contents</th>
                <th style={{ width: 80 }}>Dimensions</th>
                <th className="r" style={{ width: 60 }}>Weight</th>
              </tr>
            </thead>
            <tbody>
              {boxes.map((b) => (
                <tr key={b.id}>
                  <td>{b.box_no}</td>
                  <td>{b.contents}</td>
                  <td>{b.dimensions || '—'}</td>
                  <td className="r">{b.weight ? `${fmtQty(b.weight)} kg` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="doc-note" style={{ marginTop: 12 }}>
        Received the above goods in good condition and correct quantity.
      </div>

      <Signatures left="Receiver's signature with date" company={company} />
      <Foot>{isNote ? 'Delivery note — issued along with the tax invoice.' : 'Delivery challan — not a tax invoice.'}</Foot>
    </div>
  );
}

/* ------------------------------------------------------------- TAX INVOICE */

function TaxInvoice({ order, company }) {
  const inv = order.invoice;
  if (!inv) return null;
  const p = order.planning;
  const halfGst = Number(inv.gst_amount) / 2;
  const sameState = (order.cust_state || '').trim().toLowerCase() === (company?.state || '').trim().toLowerCase();
  const paidTotal = order.payments.reduce((s, x) => s + Number(x.amount), 0);

  return (
    <div className="doc">
      <Letterhead
        company={company}
        title="Tax Invoice"
        docNo={inv.invoice_no}
        docDate={inv.invoice_date}
        extra={<div className="doc-date">Order: {order.order_no}</div>}
      />

      <div className="doc-section doc-grid">
        <PartyBlock order={order} label="Bill to" />
        <OrderRefBlock
          order={order}
          rows={[
            ['Sales order', order.salesOrder?.so_no],
            ['Delivery note', inv.delivery_note_no],
            ['Challan no', order.dispatch?.challan_no],
            ['Place of supply', inv.place_of_supply],
            ['Vehicle no', order.dispatch?.vehicle_no],
            inv.irn && ['IRN', inv.irn],
          ]}
        />
      </div>

      <div className="doc-section">
        <table>
          <thead>
            <tr>
              <th style={{ width: 26 }}>#</th>
              <th>Description</th>
              <th className="r" style={{ width: 48 }}>Qty</th>
              <th className="r" style={{ width: 76 }}>Rate</th>
              <th className="r" style={{ width: 86 }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {(p?.items || []).map((it, i) => (
              <tr key={it.id}>
                <td>{i + 1}</td>
                <td>
                  <div style={{ fontWeight: 600 }}>{it.product}</div>
                  {it.size && <div style={{ fontSize: 9.5, color: '#666' }}>{it.size}</div>}
                </td>
                <td className="r">{fmtQty(it.qty)}</td>
                <td className="r">{money(it.selling_price, { bare: true })}</td>
                <td className="r">{money(it.amount, { bare: true })}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            {Number(p?.discount_amount) > 0 && (
              <tr>
                <td colSpan={4} className="r">Less discount</td>
                <td className="r">- {money(p.discount_amount, { bare: true })}</td>
              </tr>
            )}
            {Number(p?.freight_charges) > 0 && (
              <tr>
                <td colSpan={4} className="r">Freight</td>
                <td className="r">{money(p.freight_charges, { bare: true })}</td>
              </tr>
            )}
            {Number(p?.installation_charges) > 0 && (
              <tr>
                <td colSpan={4} className="r">Installation</td>
                <td className="r">{money(p.installation_charges, { bare: true })}</td>
              </tr>
            )}
            {Number(p?.loading_charges) > 0 && (
              <tr>
                <td colSpan={4} className="r">Loading &amp; unloading</td>
                <td className="r">{money(p.loading_charges, { bare: true })}</td>
              </tr>
            )}
            <tr>
              <td colSpan={4} className="r">Taxable value</td>
              <td className="r">{money(inv.taxable_amount, { bare: true })}</td>
            </tr>
            {sameState ? (
              <>
                <tr>
                  <td colSpan={4} className="r">CGST @ {Number(inv.gst_rate) / 2}%</td>
                  <td className="r">{money(halfGst, { bare: true })}</td>
                </tr>
                <tr>
                  <td colSpan={4} className="r">SGST @ {Number(inv.gst_rate) / 2}%</td>
                  <td className="r">{money(halfGst, { bare: true })}</td>
                </tr>
              </>
            ) : (
              <tr>
                <td colSpan={4} className="r">IGST @ {inv.gst_rate}%</td>
                <td className="r">{money(inv.gst_amount, { bare: true })}</td>
              </tr>
            )}
            <tr className="doc-total-row">
              <td colSpan={4} className="r">Invoice total</td>
              <td className="r">{money(inv.grand_total)}</td>
            </tr>
          </tfoot>
        </table>
        <div className="doc-note" style={{ marginTop: 6 }}>
          <strong>Amount in words:</strong> {amountInWords(inv.grand_total)}
        </div>
      </div>

      <div className="doc-section doc-grid">
        <div>
          {(company?.bankName || company?.bankAccount) && (
            <>
              <div className="doc-section-title">Bank details</div>
              <div className="doc-kv">
                {company.bankName && <div><span className="k">Bank</span><span>{company.bankName}</span></div>}
                {company.bankAccount && <div><span className="k">Account</span><span>{company.bankAccount}</span></div>}
                {company.bankIfsc && <div><span className="k">IFSC</span><span>{company.bankIfsc}</span></div>}
              </div>
            </>
          )}
        </div>
        <div>
          <div className="doc-section-title">Payment position</div>
          <div className="doc-kv">
            <div><span className="k">Received</span><span>{money(paidTotal)}</span></div>
            <div><span className="k">Balance</span><span>{money(Math.max(0, Number(inv.grand_total) - paidTotal))}</span></div>
          </div>
        </div>
      </div>

      <div className="doc-note" style={{ marginTop: 10, fontSize: 8.5 }}>
        Certified that the particulars given above are true and correct. Goods once sold will not be taken back.
        Interest @18% p.a. is chargeable on overdue payments. Subject to Surat jurisdiction.
      </div>

      <Signatures left="Receiver's signature" right={`For ${company?.name || 'Arrohan Living Pvt Ltd'} — Authorised signatory`} company={company} />
      <Foot />
    </div>
  );
}

/* ---------------------------------------------------------------- GATE PASS */

function GatePass({ order, company }) {
  const gp = order.gatepass;
  if (!gp) return null;
  return (
    <div className="doc">
      <Letterhead
        company={company}
        title="Gate Pass — Outward"
        docNo={gp.gate_pass_no}
        docDate={gp.gate_pass_date}
        extra={gp.gate_pass_time ? <div className="doc-date">Time: {gp.gate_pass_time}</div> : null}
      />

      <div className="doc-section doc-grid">
        <PartyBlock order={order} label="Goods dispatched to" addressOverride={order.dispatch?.delivery_address} />
        <OrderRefBlock
          order={order}
          rows={[
            ['Order no', order.order_no],
            ['Invoice no', order.invoice?.invoice_no],
            ['Challan no', order.dispatch?.challan_no],
            ['Vehicle no', gp.vehicle_no],
            ['Driver', gp.driver_name],
            ['Transporter', order.dispatch?.transporter],
            ['No. of boxes', gp.boxes || order.packing?.total_boxes],
          ]}
        />
      </div>

      <div className="doc-section">
        <table>
          <thead>
            <tr>
              <th style={{ width: 26 }}>#</th>
              <th>Description of goods</th>
              <th className="r" style={{ width: 60 }}>Qty</th>
              <th style={{ width: 46 }}>Unit</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((it, i) => (
              <tr key={it.id}>
                <td>{i + 1}</td>
                <td>{it.product}{it.size ? ` — ${it.size}` : ''}</td>
                <td className="r">{fmtQty(it.qty)}</td>
                <td>{it.unit}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="doc-section">
        <div className="doc-section-title">Clearance</div>
        <div className="doc-note">
          <div className="row" style={{ gap: 10, marginBottom: 6 }}>
            <span className="doc-stamp" style={{ borderColor: '#1c6b3f', color: '#1c6b3f' }}>QC Passed</span>
            <span className="doc-stamp" style={{ borderColor: '#1c6b3f', color: '#1c6b3f' }}>Packed</span>
            <span className="doc-stamp" style={{ borderColor: '#1c6b3f', color: '#1c6b3f' }}>Invoiced</span>
            <span className="doc-stamp" style={{ borderColor: '#1c6b3f', color: '#1c6b3f' }}>Payment settled</span>
          </div>
          This gate pass is issued after the full process — QC approval, packing, dispatch, invoicing and payment —
          has been completed for order {order.order_no}. Security may allow the vehicle to leave.
          {gp.remarks && <div style={{ marginTop: 4 }}>Remarks: {gp.remarks}</div>}
        </div>
      </div>

      <div className="doc-sign">
        <div>
          <div style={{ height: 34 }} />
          <div className="line">Driver signature</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ height: 34 }} />
          <div className="line">Security — {gp.security_by || '—'}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ height: 34 }} />
          <div className="line">Authorised signatory</div>
        </div>
      </div>
      <Foot />
    </div>
  );
}

/* ------------------------------------------------------------ COSTING SHEET */

function CostingSheet({ order, company }) {
  const c = order.costing;
  if (!c) return null;
  return (
    <div className="doc">
      <Letterhead
        company={company}
        title="Factory Costing Sheet"
        docNo={order.order_no}
        docDate={c.costed_at}
        extra={<div className="doc-date">Internal document</div>}
      />

      <div className="doc-section doc-grid">
        <PartyBlock order={order} label="Customer" />
        <OrderRefBlock
          order={order}
          rows={[
            ['Enquiry no', order.enquiry_no],
            ['Costed by', c.costed_by],
            ['Production time', `${c.production_days} days`],
            ['Products', String(c.itemCostings.length)],
          ]}
        />
      </div>

      {c.itemCostings.map((ic, idx) => (
        <div className="doc-section" key={ic.id}>
          <div className="doc-section-title">
            Product {idx + 1} — {ic.product} (qty {fmtQty(ic.qty)})
          </div>
          <table>
            <thead>
              <tr>
                <th>Raw material</th>
                <th className="r" style={{ width: 54 }}>Qty</th>
                <th style={{ width: 46 }}>Unit</th>
                <th className="r" style={{ width: 66 }}>Rate</th>
                <th className="r" style={{ width: 80 }}>Amount</th>
                <th style={{ width: 110 }}>Remarks</th>
              </tr>
            </thead>
            <tbody>
              {ic.bom.map((b) => (
                <tr key={b.id}>
                  <td>{b.material}</td>
                  <td className="r">{fmtQty(b.qty)}</td>
                  <td>{b.unit}</td>
                  <td className="r">{money(b.rate, { bare: true })}</td>
                  <td className="r">{money(b.amount, { bare: true })}</td>
                  <td style={{ fontSize: 9.5, color: '#666' }}>{b.remarks || '—'}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4} className="r">Material cost</td>
                <td className="r">{money(ic.material_cost, { bare: true })}</td>
                <td />
              </tr>
              <tr>
                <td colSpan={4} className="r">Wastage @ {ic.wastage_percent}%</td>
                <td className="r">{money(ic.wastage_cost, { bare: true })}</td>
                <td />
              </tr>
              <tr>
                <td colSpan={4} className="r">Labour</td>
                <td className="r">{money(ic.labour_cost, { bare: true })}</td>
                <td />
              </tr>
              <tr>
                <td colSpan={4} className="r">Machine</td>
                <td className="r">{money(ic.machine_cost, { bare: true })}</td>
                <td />
              </tr>
              <tr>
                <td colSpan={4} className="r">Transportation</td>
                <td className="r">{money(ic.transport_cost, { bare: true })}</td>
                <td />
              </tr>
              <tr>
                <td colSpan={4} className="r">Overheads</td>
                <td className="r">{money(ic.overheads, { bare: true })}</td>
                <td />
              </tr>
              <tr className="doc-total-row">
                <td colSpan={4} className="r">Total cost — {ic.product}</td>
                <td className="r">{money(ic.total_cost)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      ))}

      <div className="doc-section">
        <table>
          <tbody>
            <tr className="doc-total-row">
              <td style={{ fontSize: 12 }}>Total factory cost for this order</td>
              <td className="r" style={{ fontSize: 13 }}>{money(c.total_cost)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {c.notes && (
        <div className="doc-section">
          <div className="doc-section-title">Notes</div>
          <div className="doc-note">{c.notes}</div>
        </div>
      )}

      <Signatures left="Costing prepared by" right="Approved by" company={company} />
      <Foot>Internal costing document — not for circulation outside the company.</Foot>
    </div>
  );
}

/* ----------------------------------------------------- MATERIAL ISSUE SLIP */

function MaterialIssue({ order, company }) {
  const s = order.store;
  if (!s) return null;
  return (
    <div className="doc">
      <Letterhead
        company={company}
        title="Material Issue Slip"
        docNo={s.issue_no}
        docDate={s.issue_date}
        extra={<div className="doc-date">Order: {order.order_no}</div>}
      />

      <div className="doc-section doc-grid">
        <OrderRefBlock
          order={order}
          rows={[
            ['Order no', order.order_no],
            ['Customer', order.cust_name],
            ['Sales order', order.salesOrder?.so_no],
          ]}
        />
        <OrderRefBlock
          order={order}
          rows={[
            ['Issued by', s.issued_by],
            ['Received by', s.received_by],
            ['Issue date', fmtDate(s.issue_date)],
          ]}
        />
      </div>

      <div className="doc-section">
        <div className="doc-section-title">Materials issued to production (as per approved costing BOM)</div>
        <table>
          <thead>
            <tr>
              <th style={{ width: 26 }}>#</th>
              <th style={{ width: 110 }}>For product</th>
              <th>Material</th>
              <th className="r" style={{ width: 58 }}>Planned</th>
              <th className="r" style={{ width: 58 }}>Issued</th>
              <th style={{ width: 46 }}>Unit</th>
            </tr>
          </thead>
          <tbody>
            {s.lines.map((l, i) => (
              <tr key={l.id}>
                <td>{i + 1}</td>
                <td style={{ fontSize: 9.5 }}>{l.product}</td>
                <td>{l.material}</td>
                <td className="r">{fmtQty(l.qty_planned)}</td>
                <td className="r" style={{ fontWeight: 700 }}>{fmtQty(l.qty_issued)}</td>
                <td>{l.unit}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {s.remarks && (
        <div className="doc-section">
          <div className="doc-section-title">Remarks</div>
          <div className="doc-note">{s.remarks}</div>
        </div>
      )}

      <div className="doc-sign">
        <div>
          <div style={{ height: 34 }} />
          <div className="line">Store in-charge</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ height: 34 }} />
          <div className="line">Production received by</div>
        </div>
      </div>
      <Foot>Stock has been deducted from inventory against this slip.</Foot>
    </div>
  );
}

/* ---------------------------------------------------------------- QC REPORT */

function QcReport({ order, company }) {
  const q = order.qc;
  if (!q) return null;
  return (
    <div className="doc">
      <Letterhead
        company={company}
        title="Quality Inspection Report"
        docNo={q.qc_no || order.order_no}
        docDate={q.qc_date}
        extra={<div className="doc-date">Order: {order.order_no}</div>}
      />

      <div className="doc-section doc-grid">
        <PartyBlock order={order} label="Customer" />
        <OrderRefBlock
          order={order}
          rows={[
            ['Inspected by', q.qc_by],
            ['Inspection date', fmtDate(q.qc_date)],
            ['Attempt', String(q.attempt)],
            ['Production ended', order.production?.end_date ? fmtDate(order.production.end_date) : null],
          ]}
        />
      </div>

      <div className="doc-section">
        <table>
          <thead>
            <tr>
              <th style={{ width: 26 }}>#</th>
              <th>Product</th>
              <th className="r" style={{ width: 44 }}>Qty</th>
              <th className="r" style={{ width: 50 }}>Passed</th>
              <th className="r" style={{ width: 50 }}>Failed</th>
              <th style={{ width: 44 }}>Finish</th>
              <th style={{ width: 52 }}>Dimension</th>
              <th style={{ width: 56 }}>Hardware</th>
              <th>Remarks</th>
            </tr>
          </thead>
          <tbody>
            {(q.items || []).map((it, i) => (
              <tr key={it.id}>
                <td>{i + 1}</td>
                <td style={{ fontWeight: 600 }}>{it.product}</td>
                <td className="r">{fmtQty(it.qty)}</td>
                <td className="r">{fmtQty(it.qty_passed)}</td>
                <td className="r">{fmtQty(it.qty_failed)}</td>
                <td>{it.finish_ok ? 'OK' : 'Not OK'}</td>
                <td>{it.dimension_ok ? 'OK' : 'Not OK'}</td>
                <td>{it.hardware_ok ? 'OK' : 'Not OK'}</td>
                <td style={{ fontSize: 9.5, color: '#666' }}>{it.remarks || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="doc-section">
        <div className="doc-section-title">Result</div>
        <span
          className="doc-stamp"
          style={q.result === 'pass' ? { borderColor: '#1c6b3f', color: '#1c6b3f' } : { borderColor: '#9b2c22', color: '#9b2c22' }}
        >
          {q.result === 'pass' ? 'Approved — cleared for packing' : 'Rejected — returned for rework'}
        </span>
        {q.rework_note && <div className="doc-note" style={{ marginTop: 6 }}>Rework required: {q.rework_note}</div>}
        {q.notes && <div className="doc-note" style={{ marginTop: 4 }}>{q.notes}</div>}
      </div>

      <Signatures left="Quality inspector" right="Production in-charge" company={company} />
      <Foot />
    </div>
  );
}

/* ------------------------------------------------------------- PACKING LIST */

function PackingList({ order, company }) {
  const p = order.packing;
  if (!p) return null;
  return (
    <div className="doc">
      <Letterhead
        company={company}
        title="Packing List"
        docNo={p.packing_no || order.order_no}
        docDate={p.packing_date}
        extra={<div className="doc-date">Order: {order.order_no}</div>}
      />

      <div className="doc-section doc-grid">
        <PartyBlock order={order} label="For delivery to" />
        <OrderRefBlock
          order={order}
          rows={[
            ['Packed by', p.packed_by],
            ['Total boxes', String(p.total_boxes)],
            ['Gross weight', p.gross_weight ? `${fmtQty(p.gross_weight)} kg` : null],
            ['Packing material', p.packing_material],
          ]}
        />
      </div>

      <div className="doc-section">
        <table>
          <thead>
            <tr>
              <th style={{ width: 80 }}>Box no</th>
              <th>Contents</th>
              <th className="r" style={{ width: 50 }}>Qty</th>
              <th style={{ width: 90 }}>Dimensions</th>
              <th className="r" style={{ width: 64 }}>Weight</th>
            </tr>
          </thead>
          <tbody>
            {(p.boxes || []).map((b) => (
              <tr key={b.id}>
                <td style={{ fontWeight: 700 }}>{b.box_no}</td>
                <td>{b.contents}</td>
                <td className="r">{b.qty ? fmtQty(b.qty) : '—'}</td>
                <td>{b.dimensions || '—'}</td>
                <td className="r">{b.weight ? `${fmtQty(b.weight)} kg` : '—'}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={4} className="r">Total</td>
              <td className="r">{fmtQty(p.gross_weight)} kg</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {p.notes && (
        <div className="doc-section">
          <div className="doc-section-title">Notes</div>
          <div className="doc-note">{p.notes}</div>
        </div>
      )}

      <Signatures left="Packed by" right="Verified by" company={company} />
      <Foot />
    </div>
  );
}

/* ------------------------------------------------------------------ registry */

export const DOCUMENTS = {
  'costing-sheet': { title: 'Costing sheet', render: CostingSheet, available: (o) => !!o.costing },
  quotation: { title: 'Quotation', render: Quotation, available: (o) => !!o.quotation },
  'sales-order': { title: 'Sales order', render: SalesOrder, available: (o) => !!o.salesOrder },
  'advance-receipt': {
    title: 'Advance receipt',
    render: (p) => <Receipt {...p} kind="advance" />,
    available: (o) => o.payments.some((x) => x.kind === 'advance'),
  },
  'material-issue': { title: 'Material issue slip', render: MaterialIssue, available: (o) => !!o.store },
  'qc-report': { title: 'QC report', render: QcReport, available: (o) => !!o.qc },
  'packing-list': { title: 'Packing list', render: PackingList, available: (o) => !!o.packing },
  'delivery-challan': {
    title: 'Delivery challan',
    render: (p) => <DeliveryDoc {...p} mode="challan" />,
    available: (o) => !!o.dispatch,
  },
  'delivery-note': {
    title: 'Delivery note',
    render: (p) => <DeliveryDoc {...p} mode="note" />,
    available: (o) => !!o.invoice,
  },
  'tax-invoice': { title: 'Tax invoice', render: TaxInvoice, available: (o) => !!o.invoice },
  'final-receipt': {
    title: 'Final payment receipt',
    render: (p) => <Receipt {...p} kind="final" />,
    available: (o) => o.payments.some((x) => x.kind === 'final'),
  },
  'gate-pass': { title: 'Gate pass', render: GatePass, available: (o) => !!o.gatepass },
};

export const DOC_ORDER = [
  'costing-sheet', 'quotation', 'sales-order', 'advance-receipt', 'material-issue',
  'qc-report', 'packing-list', 'delivery-challan', 'delivery-note', 'tax-invoice',
  'final-receipt', 'gate-pass',
];

/** Renders one document by key. */
export function DocumentView({ docKey, order }) {
  const { company } = useAuth();
  const def = DOCUMENTS[docKey];
  if (!def) return <p className="muted">Unknown document.</p>;
  if (!def.available(order)) return <p className="muted">This document is not available yet for this order.</p>;
  const Render = def.render;
  return <Render order={order} company={company} />;
}
