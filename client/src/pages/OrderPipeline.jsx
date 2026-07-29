import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import {
  Alert, Badge, Card, ConfirmModal, Empty, Field, Input, KV, Loading, Modal, NumInput,
  PageHead, Select, StatusBadge, Tabs, Textarea, useToast,
} from '../ui/kit.jsx';
import { money, fmtDate, fmtDateTime, relTime, qty as fmtQty, todayStr } from '../format.js';
import { STAGE_FORMS } from './stages.jsx';
import { DOCUMENTS, DOC_ORDER, DocumentView } from '../docs/Documents.jsx';
import {
  IconArrowLeft, IconPrint, IconHistory, IconLock, IconCheckCircle, IconPause,
  IconPlay, IconRefresh, IconDoc, IconAlert, IconRupee,
} from '../ui/Icons.jsx';

export default function OrderPipeline() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const { meta, isAdmin, readOnly, can } = useAuth();

  const [order, setOrder] = useState(null);
  const [materials, setMaterials] = useState([]);
  const [defaults, setDefaults] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState('current');
  const [printDoc, setPrintDoc] = useState(null);
  const [rollbackOpen, setRollbackOpen] = useState(false);
  const [rollbackStage, setRollbackStage] = useState('');
  const [holdOpen, setHoldOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [noteText, setNoteText] = useState('');

  const load = () =>
    api
      .get(`/orders/${id}`)
      .then((d) => setOrder(d.order))
      .catch((e) => setError(e.message));

  useEffect(() => {
    load();
    api.get('/masters/materials').then((d) => setMaterials(d.materials)).catch(() => {});
    api.get('/settings').then((d) => setDefaults(d.defaults || {})).catch(() => {});
  }, [id]);

  const stages = meta.stages;
  const currentIndex = order ? stages.findIndex((s) => s.key === order.current_stage) : -1;

  const stageState = useMemo(() => {
    if (!order) return {};
    const out = {};
    stages.forEach((s, i) => {
      const record = order[s.key];
      const isCurrent = order.status === 'active' && order.current_stage === s.key;
      const done = order.status === 'closed' ? true : currentIndex === -1 ? !!record : i < currentIndex;
      out[s.key] = {
        done: done && !!record,
        current: isCurrent,
        locked: !done && !isCurrent,
        record,
        failed: s.key === 'qc' && order.qc?.result === 'fail',
        rejected: s.key === 'approval' && order.approval?.status === 'rejected',
      };
    });
    return out;
  }, [order, stages, currentIndex]);

  if (error) return <div className="content-inner"><Alert tone="bad" title="Could not load this order">{error}</Alert></div>;
  if (!order) return <Loading pad={80} />;

  const currentStage = stages.find((s) => s.key === order.current_stage);
  const StageForm = currentStage ? STAGE_FORMS[currentStage.key] : null;
  const canAct = order.canActOnCurrentStage;

  async function submitStage(payload) {
    setBusy(true);
    try {
      const r = await api.post(`/orders/${id}/stage/${order.current_stage}`, payload);
      setOrder(r.order);
      toast.success(
        `${currentStage.label} completed`,
        r.nextStage === 'closed'
          ? 'The order is now complete and closed.'
          : r.nextStage === 'lost'
            ? 'The order has been closed as lost.'
            : `Now with ${stages.find((s) => s.key === r.nextStage)?.dept || r.nextStageLabel} — ${r.nextStageLabel}.`
      );
      setTab('current');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      toast.error(`Could not complete ${currentStage.label}`, e.message);
    } finally {
      setBusy(false);
    }
  }

  async function doRollback(reason) {
    setBusy(true);
    try {
      const r = await api.post(`/orders/${id}/rollback`, { stage: rollbackStage, reason });
      setOrder(r.order);
      toast.warn('Stage reopened', `The order is back at ${stages.find((s) => s.key === rollbackStage)?.label}.`);
      setRollbackOpen(false);
    } catch (e) {
      toast.error('Could not reopen the stage', e.message);
    } finally {
      setBusy(false);
    }
  }

  async function doHold(reason) {
    setBusy(true);
    try {
      const r = await api.post(`/orders/${id}/${order.hold ? 'resume' : 'hold'}`, { reason, note: reason });
      setOrder(r.order);
      toast.success(order.hold ? 'Order resumed' : 'Order put on hold');
      setHoldOpen(false);
    } catch (e) {
      toast.error('Could not update the hold', e.message);
    } finally {
      setBusy(false);
    }
  }

  async function addNote() {
    if (!noteText.trim()) return;
    try {
      const r = await api.post(`/orders/${id}/notes`, { body: noteText.trim() });
      setOrder((o) => ({ ...o, notes: r.notes }));
      setNoteText('');
      toast.success('Note added');
    } catch (e) {
      toast.error('Could not add the note', e.message);
    }
  }

  async function changePriority(p) {
    try {
      const r = await api.patch(`/orders/${id}`, { priority: p });
      setOrder(r.order);
    } catch (e) {
      toast.error('Could not change the priority', e.message);
    }
  }

  const availableDocs = DOC_ORDER.filter((k) => DOCUMENTS[k].available(order));

  return (
    <div className="content-inner wide">
      <PageHead
        title={order.order_no}
        desc={
          <>
            {order.cust_company || order.cust_name}
            {order.cust_company && ` · ${order.cust_name}`}
            {order.cust_city && ` · ${order.cust_city}`} · from enquiry{' '}
            <Link to={`/enquiries/${order.enquiry_id}`}>{order.enquiry_no}</Link>
          </>
        }
      >
        <Link to="/orders" className="btn">
          <IconArrowLeft size={14} /> All orders
        </Link>
        {availableDocs.length > 0 && (
          <Select
            value=""
            onChange={(e) => e.target.value && setPrintDoc(e.target.value)}
            style={{ width: 190 }}
            placeholder="Print a document…"
            options={availableDocs.map((k) => ({ value: k, label: DOCUMENTS[k].title }))}
          />
        )}
        {!readOnly && can('order.hold') && order.status === 'active' && (
          <button type="button" className="btn" onClick={() => (order.hold ? doHold('') : setHoldOpen(true))}>
            {order.hold ? <><IconPlay size={13} /> Resume</> : <><IconPause size={13} /> Hold</>}
          </button>
        )}
        {isAdmin && currentIndex > 0 && (
          <button
            type="button"
            className="btn btn-danger"
            onClick={() => {
              setRollbackStage(stages[Math.max(0, currentIndex - 1)].key);
              setRollbackOpen(true);
            }}
          >
            <IconRefresh size={13} /> Reopen a stage
          </button>
        )}
      </PageHead>

      <div className="stack">
        <StatusStrip order={order} stages={stages} onPriority={changePriority} readOnly={readOnly || order.status !== 'active'} />

        <Stepper
          stages={stages}
          state={stageState}
          onPick={(k) => {
            setTab(k);
            window.scrollTo({ top: 240, behavior: 'smooth' });
          }}
          activeTab={tab}
        />

        <Card flush>
          <div style={{ padding: '0 var(--s5)' }}>
            <Tabs
              value={tab}
              onChange={setTab}
              items={[
                { value: 'current', label: order.status === 'active' ? `Current step · ${currentStage?.short || '—'}` : 'Summary' },
                { value: 'items', label: 'Items', count: order.items.length },
                ...stages.filter((s) => stageState[s.key].done).map((s) => ({ value: s.key, label: s.short })),
                { value: 'documents', label: 'Documents', count: availableDocs.length },
                { value: 'history', label: 'History', count: order.history.length },
                { value: 'notes', label: 'Notes', count: order.notes.length },
              ]}
            />
          </div>

          <div style={{ padding: 'var(--s5)' }}>
            {tab === 'current' && (
              <>
                {order.status === 'lost' && (
                  <Alert tone="bad" title="Closed as lost">
                    {order.approval?.reject_reason
                      ? `${order.approval.reject_reason}${order.approval.reject_note ? ` — ${order.approval.reject_note}` : ''}`
                      : 'This order will not proceed.'}
                    {isAdmin && ' An administrator can reopen an earlier stage if this was a mistake.'}
                  </Alert>
                )}

                {order.status === 'closed' && <ClosedSummary order={order} onPrint={setPrintDoc} />}

                {order.status === 'active' && order.hold && (
                  <Alert tone="warn" title="This order is on hold">
                    {order.hold_reason}. Resume it before the next step can be completed.
                  </Alert>
                )}

                {order.status === 'active' && !order.hold && currentStage && (
                  <div className="stack">
                    <div
                      className="between wrap"
                      style={{
                        padding: 'var(--s4)',
                        borderRadius: 'var(--r)',
                        background: canAct ? 'var(--brand-100)' : 'var(--surface-3)',
                        border: `1px solid ${canAct ? 'var(--brand-200)' : 'var(--line)'}`,
                      }}
                    >
                      <div>
                        <div className="eyebrow">
                          Step {currentStage.step} of 13 · {currentStage.dept}
                        </div>
                        <div style={{ fontSize: 'var(--fs-lg)', fontWeight: 650, marginTop: 2 }}>{currentStage.label}</div>
                        <p className="small muted" style={{ maxWidth: '70ch', marginTop: 2 }}>{currentStage.desc}</p>
                      </div>
                      {!canAct && (
                        <Badge tone="warn">
                          <IconLock size={11} /> {readOnly ? 'Read-only account' : `${currentStage.dept} only`}
                        </Badge>
                      )}
                    </div>

                    {canAct && StageForm ? (
                      <StageForm
                        order={order}
                        meta={meta}
                        defaults={defaults}
                        materials={materials}
                        submit={submitStage}
                        busy={busy}
                      />
                    ) : (
                      <Empty
                        icon={IconLock}
                        title={`Waiting on ${currentStage.dept}`}
                        action={
                          currentIndex > 0 && (
                            <button type="button" className="btn btn-sm" onClick={() => setTab(stages[currentIndex - 1].key)}>
                              See what the previous step recorded
                            </button>
                          )
                        }
                      >
                        {readOnly
                          ? 'Management accounts can view everything but cannot complete workflow steps.'
                          : `Only the ${currentStage.dept} department can complete “${currentStage.label}”. You will see this order in your own queue when it reaches your step.`}
                      </Empty>
                    )}
                  </div>
                )}
              </>
            )}

            {tab === 'items' && <ItemsPanel order={order} />}

            {stages.some((s) => s.key === tab) && <StageSummary order={order} stageKey={tab} onPrint={setPrintDoc} />}

            {tab === 'documents' && (
              <div className="stack">
                {availableDocs.length === 0 ? (
                  <Empty icon={IconDoc} title="No documents yet">
                    Documents are created as the workflow progresses — the costing sheet first, then the quotation, and so on.
                  </Empty>
                ) : (
                  <div className="grid grid-3">
                    {availableDocs.map((k) => (
                      <button
                        key={k}
                        type="button"
                        className="stat"
                        onClick={() => setPrintDoc(k)}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}
                      >
                        <IconDoc size={18} style={{ color: 'var(--brand-600)', flex: 'none' }} />
                        <span>
                          <span style={{ display: 'block', fontWeight: 600 }}>{DOCUMENTS[k].title}</span>
                          <span className="tiny dim">Click to view &amp; print</span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                <PaymentsPanel order={order} onAdd={() => setPayOpen(true)} canAdd={!readOnly && order.status !== 'lost'} />
              </div>
            )}

            {tab === 'history' && <HistoryPanel order={order} />}

            {tab === 'notes' && (
              <div className="stack">
                {!readOnly && (
                  <div className="row" style={{ alignItems: 'flex-end' }}>
                    <Field label="Add a note visible to every department" span={1}>
                      <Textarea rows={2} value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="Anything worth recording against this order…" />
                    </Field>
                    <button type="button" className="btn btn-primary" onClick={addNote} disabled={!noteText.trim()}>
                      Add note
                    </button>
                  </div>
                )}
                {order.notes.length === 0 ? (
                  <Empty title="No notes yet">Notes are a good place for site instructions, customer requests, or anything the next department should know.</Empty>
                ) : (
                  <div className="timeline">
                    {order.notes.map((n) => (
                      <div key={n.id} className="tl-item done">
                        <span className="tl-dot" />
                        <div className="tl-title" style={{ whiteSpace: 'pre-wrap', fontWeight: 400 }}>{n.body}</div>
                        <div className="tl-meta">
                          {n.username} · {n.stage ? `${stages.find((s) => s.key === n.stage)?.short || n.stage} · ` : ''}
                          {fmtDateTime(n.at)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* ------------------------------------------------------------ modals */}

      <Modal
        open={!!printDoc}
        onClose={() => setPrintDoc(null)}
        title={printDoc ? DOCUMENTS[printDoc]?.title : ''}
        sub={`${order.order_no} · ${order.cust_name}`}
        size="lg"
        foot={
          <>
            <button type="button" className="btn" onClick={() => setPrintDoc(null)}>
              Close
            </button>
            <button type="button" className="btn btn-primary" onClick={() => window.print()}>
              <IconPrint size={14} /> Print
            </button>
          </>
        }
      >
        {printDoc && <DocumentView docKey={printDoc} order={order} />}
      </Modal>

      <ConfirmModal
        open={rollbackOpen}
        onClose={() => setRollbackOpen(false)}
        onConfirm={doRollback}
        busy={busy}
        title="Reopen a completed stage"
        confirmLabel="Reopen the stage"
        tone="danger"
        requireReason
        reasonLabel="Why is this being reopened?"
        body={
          <div className="stack">
            <Alert tone="warn" title="Everything after this stage is cleared">
              Records for later stages are deleted and any stock movement they caused is reversed with a compensating
              ledger entry. The reason and your name are recorded in the order history.
            </Alert>
            <Field label="Reopen at" required>
              <Select
                value={rollbackStage}
                onChange={(e) => setRollbackStage(e.target.value)}
                options={stages
                  .filter((s, i) => i < (currentIndex === -1 ? stages.length : currentIndex))
                  .map((s) => ({ value: s.key, label: `${s.step}. ${s.label} — ${s.dept}` }))}
              />
            </Field>
          </div>
        }
      />

      <ConfirmModal
        open={holdOpen}
        onClose={() => setHoldOpen(false)}
        onConfirm={doHold}
        busy={busy}
        title="Put this order on hold"
        confirmLabel="Put on hold"
        tone="danger"
        requireReason
        reasonLabel="Reason for the hold"
        body={<p className="muted">No department can complete a step while the order is on hold.</p>}
      />

      <PartPaymentModal
        open={payOpen}
        onClose={() => setPayOpen(false)}
        order={order}
        meta={meta}
        onSaved={(o) => {
          setOrder(o);
          setPayOpen(false);
        }}
      />
    </div>
  );
}

/* ---------------------------------------------------------------- sub-views */

function StatusStrip({ order, stages, onPriority, readOnly }) {
  const stage = stages.find((s) => s.key === order.current_stage);
  const pct =
    order.status === 'closed' ? 100 : Math.round((Math.max(0, order.stageIndex) / stages.length) * 100);

  return (
    <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 'var(--s3)' }}>
      <div className="stat">
        <span className="stat-accent" style={{ background: order.status === 'lost' ? 'var(--bad-fg)' : order.status === 'closed' ? 'var(--ok-fg)' : 'var(--brand-500)' }} />
        <span className="stat-label">Status</span>
        <span style={{ marginTop: 2 }}>
          {order.status === 'active' ? (
            order.hold ? <Badge tone="warn">On hold</Badge> : <Badge tone="info" dot>In progress</Badge>
          ) : (
            <StatusBadge value={order.status} />
          )}
        </span>
        <span className="stat-meta">
          {order.status === 'active' ? `${stage?.dept} · step ${stage?.step} of 13` : order.closed_at ? fmtDate(order.closed_at) : ''}
        </span>
      </div>

      <div className="stat">
        <span className="stat-label">Progress</span>
        <span className="stat-value" style={{ fontSize: 'var(--fs-xl)' }}>{pct}%</span>
        <span className="bar-track" style={{ marginTop: 4 }}>
          <span className="bar-fill" style={{ width: `${pct}%`, background: order.status === 'lost' ? 'var(--bad-fg)' : order.status === 'closed' ? 'var(--ok-fg)' : 'var(--brand-500)' }} />
        </span>
      </div>

      <div className="stat">
        <span className="stat-label">Order value</span>
        <span className="stat-value" style={{ fontSize: 'var(--fs-xl)' }}>{money(order.value)}</span>
        <span className="stat-meta">{order.quotation ? `Quoted ${fmtDate(order.quotation.quotation_date)}` : 'Not quoted yet'}</span>
      </div>

      <div className="stat">
        <span className="stat-label">Received</span>
        <span className="stat-value" style={{ fontSize: 'var(--fs-xl)' }}>{money(order.paid)}</span>
        <span className="stat-meta">
          {order.outstanding > 0.5 ? (
            <span style={{ color: 'var(--bad-fg)', fontWeight: 600 }}>{money(order.outstanding)} outstanding</span>
          ) : order.billed > 0 ? (
            'Fully settled'
          ) : (
            'Nothing billed yet'
          )}
        </span>
      </div>

      <div className="stat">
        <span className="stat-label">Promised delivery</span>
        <span className="stat-value" style={{ fontSize: 'var(--fs-lg)' }}>
          {order.planning?.delivery_date ? fmtDate(order.planning.delivery_date) : '—'}
        </span>
        <span className="stat-meta">
          {order.planning?.delivery_date && order.status === 'active' && order.planning.delivery_date < todayStr() ? (
            <span style={{ color: 'var(--bad-fg)', fontWeight: 600 }}>Overdue</span>
          ) : (
            order.costing ? `${order.costing.production_days} production days` : ''
          )}
        </span>
      </div>

      <div className="stat">
        <span className="stat-label">Priority</span>
        <span style={{ marginTop: 4 }}>
          {readOnly ? (
            <StatusBadge value={order.priority} />
          ) : (
            <Select
              value={order.priority}
              onChange={(e) => onPriority(e.target.value)}
              options={['Low', 'Normal', 'High', 'Urgent']}
              style={{ height: 28, fontSize: 'var(--fs-sm)' }}
            />
          )}
        </span>
        <span className="stat-meta">Created {fmtDate(order.created_at)}</span>
      </div>
    </div>
  );
}

function Stepper({ stages, state, onPick, activeTab }) {
  return (
    <div className="stepper">
      {stages.map((s) => {
        const st = state[s.key];
        const cls = st.rejected || st.failed ? 'failed' : st.current ? 'current' : st.done ? 'done' : 'locked';
        return (
          <button
            key={s.key}
            type="button"
            className={`step ${cls} ${activeTab === s.key ? 'active' : ''}`}
            onClick={() => onPick(st.done ? s.key : 'current')}
            disabled={!st.done && !st.current}
            title={`${s.step}. ${s.label} — ${s.dept}${st.locked ? ' (not reached yet)' : ''}`}
          >
            <span className="step-bar" />
            <span className="step-num">
              {st.done && !st.failed && !st.rejected ? '✓ ' : ''}
              {s.step}
            </span>
            <span className="step-label">{s.short}</span>
          </button>
        );
      })}
    </div>
  );
}

function ItemsPanel({ order }) {
  return (
    <div className="stack">
      <div className="grid grid-2" style={{ alignItems: 'start' }}>
        <Card title="Customer">
          <KV
            items={[
              ['Name', order.cust_name],
              ['Company', order.cust_company],
              ['Phone', order.cust_phone],
              ['Email', order.cust_email],
              ['GSTIN', order.cust_gstin],
              ['Address', [order.cust_address, order.cust_city, order.cust_state, order.cust_pincode].filter(Boolean).join(', ')],
            ]}
          />
        </Card>
        <Card title="Order & enquiry">
          <KV
            items={[
              ['Order no', <span className="mono">{order.order_no}</span>],
              ['Enquiry no', <Link to={`/enquiries/${order.enquiry_id}`} className="mono">{order.enquiry_no}</Link>],
              ['Enquiry date', fmtDate(order.enquiry_date)],
              ['Taken by', order.taken_by],
              ['Source', order.reference],
              ['Expected budget', order.expected_budget ? money(order.expected_budget) : null],
              ['Required by', order.required_date ? fmtDate(order.required_date) : null],
              ['Site', order.site_name ? `${order.site_name}${order.site_city ? `, ${order.site_city}` : ''}` : null],
              ['Installation', order.installation_required],
            ]}
          />
        </Card>
      </div>

      <Card title={`Products (${order.items.length})`} flush>
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th style={{ width: 36 }}>#</th>
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
              {order.items.map((it, i) => (
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
      </Card>

      {order.finishedGoods.length > 0 && (
        <Card title="Finished goods" flush>
          <div className="table-wrap">
            <table className="tbl compact">
              <thead>
                <tr>
                  <th>Product</th>
                  <th className="right">Qty</th>
                  <th>Produced</th>
                  <th>Status</th>
                  <th>Dispatched</th>
                </tr>
              </thead>
              <tbody>
                {order.finishedGoods.map((f) => (
                  <tr key={f.id}>
                    <td>{f.product}</td>
                    <td className="num">{fmtQty(f.qty)}</td>
                    <td>{fmtDate(f.produced_at)}</td>
                    <td><StatusBadge value={f.status} /></td>
                    <td>{f.dispatched_at ? fmtDate(f.dispatched_at) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

/** Read-only recap of a completed stage. */
function StageSummary({ order, stageKey, onPrint }) {
  const { meta } = useAuth();
  const stage = meta.stages.find((s) => s.key === stageKey);
  const r = order[stageKey];
  if (!r) return <Empty title={`${stage.label} has not been completed`}>Nothing recorded yet.</Empty>;

  const docs = (stage.docs || []).filter((k) => DOCUMENTS[k]?.available(order));

  return (
    <div className="stack">
      <div className="between wrap">
        <div>
          <div className="eyebrow">Step {stage.step} · {stage.dept}</div>
          <h3 style={{ fontSize: 'var(--fs-lg)', fontWeight: 600 }}>{stage.label}</h3>
          <p className="small muted">Completed {fmtDateTime(r.completed_at)}</p>
        </div>
        <div className="row-tight">
          {docs.map((k) => (
            <button key={k} type="button" className="btn btn-sm" onClick={() => onPrint(k)}>
              <IconPrint size={13} /> {DOCUMENTS[k].title}
            </button>
          ))}
        </div>
      </div>

      {stageKey === 'costing' && <CostingSummary order={order} />}
      {stageKey === 'planning' && <PlanningSummary order={order} />}
      {stageKey === 'quotation' && (
        <Card>
          <KV
            items={[
              ['Quotation no', <span className="mono">{r.quotation_no}</span>],
              ['Date', fmtDate(r.quotation_date)],
              ['Valid till', fmtDate(r.valid_till)],
              ['Taxable value', money(r.subtotal)],
              [`GST @ ${r.gst_rate}%`, money(r.gst_amount)],
              ['Grand total', <span className="strong">{money(r.grand_total)}</span>],
              ['Warranty', r.warranty],
              ['Revisions', r.revision > 0 ? `${r.revision} revision(s)` : 'Original'],
            ]}
          />
        </Card>
      )}
      {stageKey === 'approval' && (
        <Card>
          <div className="stack">
            {r.status === 'approved' ? (
              <Alert tone="ok" title="Customer approved the quotation">Decided {fmtDate(r.decided_at)}{r.decided_by_name ? ` by ${r.decided_by_name}` : ''}.</Alert>
            ) : (
              <Alert tone="bad" title={`Rejected — ${r.reject_reason}`}>{r.reject_note || 'No further detail recorded.'}</Alert>
            )}
            {r.notes && <p className="muted">{r.notes}</p>}
          </div>
        </Card>
      )}
      {stageKey === 'salesOrder' && (
        <Card>
          <KV
            items={[
              ['Sales order no', <span className="mono">{r.so_no}</span>],
              ['Date', fmtDate(r.so_date)],
              ['Against quotation', r.quotation_no],
              ['Order value (locked)', <span className="strong">{money(r.locked_total)}</span>],
              ['Payment terms', r.locked_terms],
              ['Customer signed', r.customer_signed ? <Badge tone="ok">Yes — {fmtDate(r.signed_date)}</Badge> : <Badge tone="bad">No</Badge>],
              ['Customer PO', r.po_number],
              ['PO date', r.po_date ? fmtDate(r.po_date) : null],
            ]}
          />
        </Card>
      )}
      {stageKey === 'advance' && (
        <Card>
          <KV
            items={[
              ['Advance received', <span className="strong">{money(r.amount)}</span>],
              ['Balance after advance', money(r.balance)],
              ['Released to store', r.released_to_production ? 'Yes' : 'No'],
              ['Receipt', order.payments.find((p) => p.kind === 'advance')?.receipt_no],
              ['Mode', order.payments.find((p) => p.kind === 'advance')?.mode],
            ]}
          />
        </Card>
      )}
      {stageKey === 'store' && <StoreSummary order={order} />}
      {stageKey === 'production' && <ProductionSummary order={order} />}
      {stageKey === 'qc' && <QcSummary order={order} />}
      {stageKey === 'packing' && <PackingSummary order={order} />}
      {stageKey === 'dispatch' && (
        <Card>
          <KV
            items={[
              ['Challan no', <span className="mono">{r.challan_no}</span>],
              ['Dispatch date', fmtDate(r.dispatch_date)],
              ['Transporter', r.transporter],
              ['Vehicle', r.vehicle_no],
              ['Driver', [r.driver_name, r.driver_phone].filter(Boolean).join(' · ')],
              ['LR no', r.lr_no],
              ['E-way bill', r.eway_bill_no],
              ['Boxes', String(r.boxes)],
              ['Freight paid', r.freight_amount ? money(r.freight_amount) : null],
              ['Delivered to', r.delivery_address],
            ]}
          />
        </Card>
      )}
      {stageKey === 'invoice' && (
        <Card>
          <KV
            items={[
              ['Invoice no', <span className="mono">{r.invoice_no}</span>],
              ['Invoice date', fmtDate(r.invoice_date)],
              ['Delivery note no', <span className="mono">{r.delivery_note_no}</span>],
              ['Taxable amount', money(r.taxable_amount)],
              [`GST @ ${r.gst_rate}%`, money(r.gst_amount)],
              ['Invoice total', <span className="strong">{money(r.grand_total)}</span>],
              ['Place of supply', r.place_of_supply],
              ['IRN', r.irn],
            ]}
          />
        </Card>
      )}
      {stageKey === 'payment' && (
        <Card>
          <KV
            items={[
              ['Balance received', <span className="strong">{money(r.balance_amount)}</span>],
              ['Received on', fmtDate(r.received_at)],
              ['Delivered on', fmtDate(r.delivered_date)],
              ['Still outstanding', r.outstanding > 0.5 ? <span style={{ color: 'var(--bad-fg)', fontWeight: 600 }}>{money(r.outstanding)}</span> : 'Nil — fully settled'],
            ]}
          />
        </Card>
      )}
      {stageKey === 'gatepass' && (
        <Card>
          <KV
            items={[
              ['Gate pass no', <span className="mono">{r.gate_pass_no}</span>],
              ['Date & time', `${fmtDate(r.gate_pass_date)} ${r.gate_pass_time || ''}`],
              ['Vehicle', r.vehicle_no],
              ['Driver', r.driver_name],
              ['Boxes', String(r.boxes)],
              ['Issued by security', r.security_by],
              ['Remarks', r.remarks],
            ]}
          />
        </Card>
      )}
    </div>
  );
}

function CostingSummary({ order }) {
  const c = order.costing;
  return (
    <div className="stack">
      {c.itemCostings.map((ic, i) => (
        <Card key={ic.id} title={`Product ${i + 1} — ${ic.product}`} action={<Badge tone="brand">{money(ic.total_cost)}</Badge>} flush>
          <div className="table-wrap">
            <table className="tbl compact">
              <thead>
                <tr>
                  <th>Raw material</th>
                  <th className="right">Qty</th>
                  <th>Unit</th>
                  <th className="right">Rate</th>
                  <th className="right">Amount</th>
                  <th>Remarks</th>
                </tr>
              </thead>
              <tbody>
                {ic.bom.map((b) => (
                  <tr key={b.id}>
                    <td>{b.material}</td>
                    <td className="num">{fmtQty(b.qty)}</td>
                    <td>{b.unit}</td>
                    <td className="num">{money(b.rate, { bare: true })}</td>
                    <td className="num">{money(b.amount, { bare: true })}</td>
                    <td className="small muted">{b.remarks || '—'}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr><td colSpan={4}>Material cost</td><td className="num">{money(ic.material_cost, { bare: true })}</td><td /></tr>
                <tr><td colSpan={4}>Wastage @ {ic.wastage_percent}%</td><td className="num">{money(ic.wastage_cost, { bare: true })}</td><td /></tr>
                <tr><td colSpan={4}>Labour / machine / transport / overheads</td><td className="num">{money(Number(ic.labour_cost) + Number(ic.machine_cost) + Number(ic.transport_cost) + Number(ic.overheads), { bare: true })}</td><td /></tr>
                <tr><td colSpan={4}>Total</td><td className="num">{money(ic.total_cost, { bare: true })}</td><td /></tr>
              </tfoot>
            </table>
          </div>
        </Card>
      ))}
      <Card>
        <KV
          items={[
            ['Total factory cost', <span className="strong">{money(c.total_cost)}</span>],
            ['Production time', `${c.production_days} days`],
            ['Costed by', c.costed_by],
            ['Costing date', fmtDate(c.costed_at)],
            ['Notes', c.notes],
          ]}
        />
      </Card>
    </div>
  );
}

function PlanningSummary({ order }) {
  const p = order.planning;
  const cost = Number(order.costing?.total_cost) || 0;
  const marginValue = Number(p.items_total) - Number(p.discount_amount) - cost;
  return (
    <div className="stack">
      <Card flush>
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Product</th>
                <th className="right">Qty</th>
                <th className="right">Cost / unit</th>
                <th className="right">Selling / unit</th>
                <th className="right">Margin %</th>
                <th className="right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {p.items.map((it) => {
                const mPct = Number(it.cost_per_unit) > 0 ? ((Number(it.selling_price) - Number(it.cost_per_unit)) / Number(it.cost_per_unit)) * 100 : 0;
                return (
                  <tr key={it.id}>
                    <td className="strong">{it.product}</td>
                    <td className="num">{fmtQty(it.qty)}</td>
                    <td className="num muted">{money(it.cost_per_unit, { bare: true })}</td>
                    <td className="num">{money(it.selling_price, { bare: true })}</td>
                    <td className="num"><Badge tone={mPct < 0 ? 'bad' : mPct < 10 ? 'warn' : 'ok'}>{mPct.toFixed(1)}%</Badge></td>
                    <td className="num strong">{money(it.amount, { bare: true })}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr><td colSpan={5}>Products total</td><td className="num">{money(p.items_total, { bare: true })}</td></tr>
              {Number(p.discount_amount) > 0 && (
                <tr><td colSpan={5}>Less discount ({p.discount_percent}%)</td><td className="num">- {money(p.discount_amount, { bare: true })}</td></tr>
              )}
              <tr><td colSpan={5}>Subtotal before GST</td><td className="num">{money(p.subtotal, { bare: true })}</td></tr>
            </tfoot>
          </table>
        </div>
      </Card>
      <Card>
        <KV
          items={[
            ['Target margin', `${p.margin_percent}%`],
            ['Actual order margin', <span style={{ color: marginValue < 0 ? 'var(--bad-fg)' : 'var(--ok-fg)', fontWeight: 600 }}>{money(marginValue)}{cost > 0 ? ` (${((marginValue / cost) * 100).toFixed(1)}%)` : ''}</span>],
            ['Freight', p.freight_charges ? money(p.freight_charges) : null],
            ['Installation', p.installation_charges ? money(p.installation_charges) : null],
            ['Loading & unloading', p.loading_charges ? money(p.loading_charges) : null],
            ['Payment terms', p.payment_terms],
            ['Promised delivery', fmtDate(p.delivery_date)],
            ['Decided by', p.decided_by],
          ]}
        />
      </Card>
    </div>
  );
}

function StoreSummary({ order }) {
  const s = order.store;
  return (
    <div className="stack">
      <Card flush>
        <div className="table-wrap">
          <table className="tbl compact">
            <thead>
              <tr>
                <th>For product</th>
                <th>Material</th>
                <th className="right">Planned</th>
                <th className="right">Issued</th>
                <th>Unit</th>
                <th>Remarks</th>
              </tr>
            </thead>
            <tbody>
              {s.lines.map((l) => (
                <tr key={l.id}>
                  <td className="small muted">{l.product}</td>
                  <td className="strong">{l.material}</td>
                  <td className="num muted">{fmtQty(l.qty_planned)}</td>
                  <td className="num">{fmtQty(l.qty_issued)}</td>
                  <td>{l.unit}</td>
                  <td className="small muted">{l.remarks || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Card>
        <KV
          items={[
            ['Issue slip no', <span className="mono">{s.issue_no}</span>],
            ['Issue date', fmtDate(s.issue_date)],
            ['Issued by', s.issued_by],
            ['Received by', s.received_by],
            ['Remarks', s.remarks],
          ]}
        />
      </Card>
    </div>
  );
}

function ProductionSummary({ order }) {
  const p = order.production;
  return (
    <div className="stack">
      <Card>
        <KV
          items={[
            ['Started', `${fmtDate(p.start_date)}${p.started_by ? ` by ${p.started_by}` : ''}`],
            ['Expected completion', p.expected_end_date ? fmtDate(p.expected_end_date) : null],
            ['Completed', `${fmtDate(p.end_date)}${p.produced_by ? ` by ${p.produced_by}` : ''}`],
            ['Supervisor', p.supervisor],
            ['Notes', p.notes],
          ]}
        />
      </Card>

      <Card title="Material consumption" flush>
        <div className="table-wrap">
          <table className="tbl compact">
            <thead>
              <tr>
                <th>Product</th>
                <th>Material</th>
                <th className="right">Issued</th>
                <th className="right">Consumed</th>
                <th className="right">Variance</th>
                <th>Remarks</th>
              </tr>
            </thead>
            <tbody>
              {p.consumption.map((c) => {
                const v = Number(c.qty_used) - Number(c.qty_issued);
                return (
                  <tr key={c.id}>
                    <td className="small muted">{c.product}</td>
                    <td>{c.material}</td>
                    <td className="num muted">{fmtQty(c.qty_issued)} {c.unit}</td>
                    <td className="num">{fmtQty(c.qty_used)} {c.unit}</td>
                    <td className="num">
                      {v === 0 ? <span className="dim">—</span> : <Badge tone={v > 0 ? 'warn' : 'info'}>{v > 0 ? `+${fmtQty(v)}` : fmtQty(v)}</Badge>}
                    </td>
                    <td className="small muted">{c.remarks || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {p.wastage.length > 0 && (
        <Card title="Scrap & wastage" action={<Badge tone="bad">{money(p.wastage.reduce((s, w) => s + Number(w.value), 0))} lost</Badge>} flush>
          <div className="table-wrap">
            <table className="tbl compact">
              <thead>
                <tr><th>Material</th><th className="right">Qty</th><th>Unit</th><th className="right">Value</th><th>Reason</th></tr>
              </thead>
              <tbody>
                {p.wastage.map((w) => (
                  <tr key={w.id}>
                    <td>{w.material}</td>
                    <td className="num">{fmtQty(w.qty)}</td>
                    <td>{w.unit}</td>
                    <td className="num">{money(w.value, { bare: true })}</td>
                    <td className="small muted">{w.reason || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {p.additionalMaterials.length > 0 && (
        <Card title="Additional material issued" flush>
          <div className="table-wrap">
            <table className="tbl compact">
              <thead>
                <tr><th>Material</th><th className="right">Qty</th><th>Unit</th><th>Reason</th><th>Status</th></tr>
              </thead>
              <tbody>
                {p.additionalMaterials.map((a) => (
                  <tr key={a.id}>
                    <td>{a.material}</td>
                    <td className="num">{fmtQty(a.qty)}</td>
                    <td>{a.unit}</td>
                    <td className="small muted">{a.reason || '—'}</td>
                    <td><StatusBadge value={a.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function QcSummary({ order }) {
  const q = order.qc;
  return (
    <div className="stack">
      {q.result === 'pass' ? (
        <Alert tone="ok" title={`Passed on attempt ${q.attempt}`}>Inspected by {q.qc_by || '—'} on {fmtDate(q.qc_date)}.</Alert>
      ) : (
        <Alert tone="bad" title={`Failed on attempt ${q.attempt} — returned for rework`}>{q.rework_note}</Alert>
      )}
      <Card flush>
        <div className="table-wrap">
          <table className="tbl compact">
            <thead>
              <tr>
                <th>Product</th>
                <th className="right">Qty</th>
                <th className="right">Passed</th>
                <th className="right">Failed</th>
                <th>Finish</th>
                <th>Dimensions</th>
                <th>Hardware</th>
                <th>Remarks</th>
              </tr>
            </thead>
            <tbody>
              {(q.items || []).map((i) => (
                <tr key={i.id}>
                  <td className="strong">{i.product}</td>
                  <td className="num">{fmtQty(i.qty)}</td>
                  <td className="num">{fmtQty(i.qty_passed)}</td>
                  <td className="num">{Number(i.qty_failed) > 0 ? <Badge tone="bad">{fmtQty(i.qty_failed)}</Badge> : '0'}</td>
                  <td>{i.finish_ok ? <Badge tone="ok">OK</Badge> : <Badge tone="bad">Not OK</Badge>}</td>
                  <td>{i.dimension_ok ? <Badge tone="ok">OK</Badge> : <Badge tone="bad">Not OK</Badge>}</td>
                  <td>{i.hardware_ok ? <Badge tone="ok">OK</Badge> : <Badge tone="bad">Not OK</Badge>}</td>
                  <td className="small muted">{i.remarks || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      {q.notes && <Card title="Inspection notes"><p className="muted">{q.notes}</p></Card>}
    </div>
  );
}

function PackingSummary({ order }) {
  const p = order.packing;
  return (
    <div className="stack">
      <Card>
        <KV
          items={[
            ['Packing no', <span className="mono">{p.packing_no}</span>],
            ['Packing date', fmtDate(p.packing_date)],
            ['Packed by', p.packed_by],
            ['Total boxes', String(p.total_boxes)],
            ['Gross weight', p.gross_weight ? `${fmtQty(p.gross_weight)} kg` : null],
            ['Packing material', p.packing_material],
            ['Ready for dispatch', p.ready_for_dispatch ? <Badge tone="ok">Yes</Badge> : <Badge tone="warn">No</Badge>],
            ['Notes', p.notes],
          ]}
        />
      </Card>
      {p.boxes?.length > 0 && (
        <Card title="Box list" flush>
          <div className="table-wrap">
            <table className="tbl compact">
              <thead>
                <tr><th>Box</th><th>Contents</th><th className="right">Qty</th><th>Dimensions</th><th className="right">Weight</th></tr>
              </thead>
              <tbody>
                {p.boxes.map((b) => (
                  <tr key={b.id}>
                    <td className="strong">{b.box_no}</td>
                    <td>{b.contents}</td>
                    <td className="num">{b.qty ? fmtQty(b.qty) : '—'}</td>
                    <td>{b.dimensions || '—'}</td>
                    <td className="num">{b.weight ? `${fmtQty(b.weight)} kg` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function ClosedSummary({ order, onPrint }) {
  return (
    <div className="stack">
      <Alert tone="ok" title={`Order complete — closed ${fmtDate(order.closed_at)}`}>
        Every step from enquiry to gate pass has been signed off. Gate pass {order.gatepass?.gate_pass_no} was issued on{' '}
        {fmtDate(order.gatepass?.gate_pass_date)}.
      </Alert>
      <div className="grid grid-4">
        <StatMini label="Order value" value={money(order.billed)} />
        <StatMini label="Factory cost" value={money(order.costing?.total_cost)} />
        <StatMini
          label="Gross margin"
          value={money(Number(order.invoice?.taxable_amount || 0) - Number(order.costing?.total_cost || 0))}
        />
        <StatMini label="Received" value={money(order.paid)} sub={order.outstanding > 0.5 ? `${money(order.outstanding)} outstanding` : 'Fully settled'} />
      </div>
      <div className="row-tight wrap">
        {['tax-invoice', 'gate-pass', 'delivery-note', 'final-receipt'].filter((k) => DOCUMENTS[k].available(order)).map((k) => (
          <button key={k} type="button" className="btn btn-sm" onClick={() => onPrint(k)}>
            <IconPrint size={13} /> {DOCUMENTS[k].title}
          </button>
        ))}
      </div>
    </div>
  );
}

function StatMini({ label, value, sub }) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value" style={{ fontSize: 'var(--fs-xl)' }}>{value}</span>
      {sub && <span className="stat-meta">{sub}</span>}
    </div>
  );
}

function HistoryPanel({ order }) {
  const { meta } = useAuth();
  return (
    <div className="timeline">
      {order.history.map((h) => (
        <div key={h.id} className={`tl-item ${h.action === 'completed' ? 'done' : h.action}`}>
          <span className="tl-dot" />
          <div className="between wrap" style={{ gap: 8 }}>
            <div className="grow">
              <div className="tl-title">
                {h.stage === 'enquiry' ? 'Enquiry' : meta.stages.find((s) => s.key === h.stage)?.label || h.stage}
                {h.action === 'rejected' && <Badge tone="bad">Rejected</Badge>}
                {h.action === 'reopened' && <Badge tone="warn">Reopened by admin</Badge>}
                {h.action === 'revised' && <Badge tone="info">Revised</Badge>}
                {h.action === 'hold' && <Badge tone="warn">Put on hold</Badge>}
                {h.action === 'resume' && <Badge tone="ok">Resumed</Badge>}
              </div>
              {h.note && <div className="tl-meta">{h.note}</div>}
            </div>
            <div className="tiny dim nowrap">
              {h.user_name || h.username || '—'} · {fmtDateTime(h.at)}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function PaymentsPanel({ order, onAdd, canAdd }) {
  return (
    <Card
      title="Payments received"
      sub={`${money(order.paid)} of ${money(order.billed)}${order.outstanding > 0.5 ? ` · ${money(order.outstanding)} outstanding` : ''}`}
      action={
        canAdd && order.salesOrder && (
          <button type="button" className="btn btn-sm" onClick={onAdd}>
            <IconRupee size={13} /> Record a part payment
          </button>
        )
      }
      flush
    >
      {order.payments.length === 0 ? (
        <div style={{ padding: 'var(--s5)' }}>
          <p className="small dim">No payments recorded yet.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="tbl compact">
            <thead>
              <tr><th>Receipt no</th><th>Type</th><th>Date</th><th>Mode</th><th>Reference</th><th className="right">Amount</th></tr>
            </thead>
            <tbody>
              {order.payments.map((p) => (
                <tr key={p.id}>
                  <td className="mono small">{p.receipt_no}</td>
                  <td className="small">{p.kind === 'advance' ? 'Advance' : p.kind === 'final' ? 'Final' : 'Part'}</td>
                  <td>{fmtDate(p.received_at)}</td>
                  <td className="small">{p.mode}</td>
                  <td className="small muted">{p.reference || '—'}</td>
                  <td className="num strong">{money(p.amount, { bare: true })}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr><td colSpan={5}>Total received</td><td className="num">{money(order.paid, { bare: true })}</td></tr>
            </tfoot>
          </table>
        </div>
      )}
    </Card>
  );
}

function PartPaymentModal({ open, onClose, order, meta, onSaved }) {
  const toast = useToast();
  const [amount, setAmount] = useState('');
  const [receivedAt, setReceivedAt] = useState(todayStr());
  const [mode, setMode] = useState('Bank transfer');
  const [reference, setReference] = useState('');
  const [remarks, setRemarks] = useState('');
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      const r = await api.post(`/orders/${order.id}/payments`, {
        amount: Number(amount) || 0, received_at: receivedAt, mode, reference, remarks,
      });
      toast.success('Payment recorded', `Receipt ${r.receipt_no}`);
      setAmount('');
      setReference('');
      onSaved(r.order);
    } catch (e) {
      toast.error('Could not record the payment', e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Record a part payment"
      sub={`${order.order_no} · outstanding ${money(order.outstanding)}`}
      foot={
        <>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={save} disabled={busy || !(Number(amount) > 0)}>
            {busy && <span className="spinner" />}
            Record payment
          </button>
        </>
      }
    >
      <div className="grid grid-2">
        <Field label="Amount (₹)" required>
          <NumInput value={amount} min="0" onChange={(e) => setAmount(e.target.value)} autoFocus />
        </Field>
        <Field label="Received on" required>
          <Input type="date" value={receivedAt} onChange={(e) => setReceivedAt(e.target.value)} />
        </Field>
        <Field label="Mode">
          <Select value={mode} onChange={(e) => setMode(e.target.value)} options={meta.paymentModes} />
        </Field>
        <Field label="Reference">
          <Input value={reference} onChange={(e) => setReference(e.target.value)} />
        </Field>
        <Field label="Remarks" span={2}>
          <Input value={remarks} onChange={(e) => setRemarks(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
