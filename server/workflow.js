'use strict';

/**
 * The single source of truth for the Arrohan Living workflow.
 *
 * Every order walks this ladder in order. A stage can only be completed when
 * the order is currently sitting on it, which makes skipping impossible — the
 * check lives on the server, so it holds even if someone calls the API directly.
 *
 * Mirrors the 13 numbered steps of the requirement document; steps that the
 * document assigns to different departments (Store, QC, Packaging, Gate Pass)
 * are separate gates here so each department signs off on its own work.
 */

const STAGES = [
  {
    key: 'costing',
    step: 2,
    label: 'Factory Costing',
    short: 'Costing',
    dept: 'Factory / Costing',
    roles: ['costing'],
    table: 'costings',
    desc: 'Prepare item-wise BOM, material cost, labour, wastage and overheads.',
    docs: ['costing-sheet'],
  },
  {
    key: 'planning',
    step: 3,
    label: 'Sales Planning',
    short: 'Planning',
    dept: 'Sales',
    roles: ['sales'],
    table: 'plannings',
    desc: 'Review factory cost, set margin, selling price and discount.',
    docs: [],
  },
  {
    key: 'quotation',
    step: 4,
    label: 'Quotation',
    short: 'Quotation',
    dept: 'Sales',
    roles: ['sales'],
    table: 'quotations',
    desc: 'Generate the quotation and send it to the customer.',
    docs: ['quotation'],
  },
  {
    key: 'approval',
    step: 4,
    label: 'Customer Approval',
    short: 'Approval',
    dept: 'Sales',
    roles: ['sales'],
    table: 'approvals',
    desc: 'Record the customer decision. Rejection closes the enquiry as lost.',
    docs: [],
    canReject: true,
  },
  {
    key: 'salesOrder',
    step: 5,
    label: 'Sales Order',
    short: 'Sales Order',
    dept: 'Sales',
    roles: ['sales'],
    table: 'sales_orders',
    desc: 'Confirm the sales order against the customer signature. Mandatory before production.',
    docs: ['sales-order'],
  },
  {
    key: 'advance',
    step: 5,
    label: 'Advance Payment',
    short: 'Advance',
    dept: 'Accounts',
    roles: ['accounts', 'sales'],
    table: 'advances',
    desc: 'Record the advance received and issue the advance receipt.',
    docs: ['advance-receipt'],
  },
  {
    key: 'store',
    step: 6,
    label: 'Store — Material Issue',
    short: 'Store',
    dept: 'Store',
    roles: ['store'],
    table: 'store_issues',
    desc: 'Issue raw material to production as per the approved costing sheet. Deducts stock.',
    docs: ['material-issue'],
  },
  {
    key: 'production',
    step: 7,
    label: 'Production',
    short: 'Production',
    dept: 'Production',
    roles: ['production'],
    table: 'productions',
    desc: 'Record start/end dates, actual consumption, wastage and extra material needs.',
    docs: [],
  },
  {
    key: 'qc',
    step: 8,
    label: 'Quality Check',
    short: 'QC',
    dept: 'Quality',
    roles: ['qc'],
    table: 'qc_checks',
    desc: 'Inspect finished goods. Only a pass unlocks packaging.',
    docs: ['qc-report'],
    canReject: true,
  },
  {
    key: 'packing',
    step: 9,
    label: 'Packaging',
    short: 'Packing',
    dept: 'Packaging',
    roles: ['packaging'],
    table: 'packings',
    desc: 'Pack the goods and mark them ready for dispatch.',
    docs: ['packing-list'],
  },
  {
    key: 'dispatch',
    step: 10,
    label: 'Dispatch',
    short: 'Dispatch',
    dept: 'Dispatch',
    roles: ['dispatch'],
    table: 'dispatches',
    desc: 'Record transporter, vehicle and LR details against the delivery challan.',
    docs: ['delivery-challan'],
  },
  {
    key: 'invoice',
    step: 11,
    label: 'Delivery Note & Sales Invoice',
    short: 'Invoice',
    dept: 'Sales',
    roles: ['sales', 'accounts'],
    table: 'invoices',
    desc: 'Generate the delivery note and the GST sales invoice.',
    docs: ['delivery-note', 'tax-invoice'],
  },
  {
    key: 'payment',
    step: 12,
    label: 'Final Payment',
    short: 'Payment',
    dept: 'Accounts',
    roles: ['accounts'],
    table: 'final_payments',
    desc: 'Collect the balance and update customer outstanding.',
    docs: ['final-receipt'],
  },
  {
    key: 'gatepass',
    step: 13,
    label: 'Gate Pass Out',
    short: 'Gate Pass',
    dept: 'Security / Store',
    roles: ['store', 'dispatch'],
    table: 'gate_passes',
    desc: 'Issue the outward gate pass — the final step that closes the order.',
    docs: ['gate-pass'],
  },
];

const STAGE_KEYS = STAGES.map((s) => s.key);
const STAGE_BY_KEY = Object.fromEntries(STAGES.map((s) => [s.key, s]));

/** Terminal stage values that are not in STAGE_KEYS. */
const TERMINAL = { CLOSED: 'closed', LOST: 'lost' };

function stageIndex(key) {
  return STAGE_KEYS.indexOf(key);
}

function nextStage(key) {
  const i = stageIndex(key);
  if (i < 0) return null;
  return i === STAGE_KEYS.length - 1 ? TERMINAL.CLOSED : STAGE_KEYS[i + 1];
}

function prevStage(key) {
  const i = stageIndex(key);
  return i > 0 ? STAGE_KEYS[i - 1] : null;
}

function stageLabel(key) {
  if (key === TERMINAL.CLOSED) return 'Completed & closed';
  if (key === TERMINAL.LOST) return 'Closed — lost';
  return STAGE_BY_KEY[key] ? STAGE_BY_KEY[key].label : key;
}

// ---------------------------------------------------------------------- roles

const ROLES = {
  admin: {
    label: 'Administrator',
    desc: 'Full access including user management, masters and stage rollback.',
    all: true,
  },
  management: {
    label: 'Management',
    desc: 'Read-only visibility across every module plus all reports.',
    readOnly: true,
  },
  sales: {
    label: 'Sales',
    desc: 'Enquiry, sales planning, quotation, approval, sales order and invoicing.',
  },
  costing: { label: 'Factory / Costing', desc: 'Prepares the item-wise costing sheet.' },
  store: { label: 'Store', desc: 'Material issue, inventory, purchase orders and gate pass.' },
  production: { label: 'Production', desc: 'Production entry, consumption and wastage.' },
  qc: { label: 'Quality Control', desc: 'Quality inspection sign-off.' },
  packaging: { label: 'Packaging', desc: 'Packing entry and ready-for-dispatch marking.' },
  dispatch: { label: 'Dispatch', desc: 'Dispatch, transporter details and gate pass.' },
  accounts: { label: 'Accounts', desc: 'Advance and final payments, invoicing, outstanding.' },
};

const ROLE_KEYS = Object.keys(ROLES);

/** Extra capabilities beyond stage completion, keyed by capability name. */
const CAPABILITIES = {
  'enquiry.create': ['sales'],
  'enquiry.edit': ['sales'],
  'enquiry.lost': ['sales'],
  'enquiry.send': ['sales'],
  'customer.write': ['sales', 'accounts'],
  'supplier.write': ['store', 'accounts'],
  'material.write': ['store'],
  'product.write': ['sales', 'costing'],
  'purchase.write': ['store', 'accounts'],
  'purchase.receive': ['store'],
  'stock.adjust': ['store'],
  'order.hold': ['sales'],
  'order.rollback': [], // admin only
  'user.manage': [], // admin only
  'settings.write': [], // admin only
  'reports.view': ['sales', 'costing', 'store', 'production', 'qc', 'packaging', 'dispatch', 'accounts'],
  'note.write': ROLE_KEYS.filter((r) => r !== 'management'),
};

function isAdmin(user) {
  return !!user && user.role === 'admin';
}

/** Can this user complete/edit the given workflow stage? */
function canDoStage(user, stageKey) {
  if (!user) return false;
  if (isAdmin(user)) return true;
  const stage = STAGE_BY_KEY[stageKey];
  if (!stage) return false;
  return stage.roles.includes(user.role);
}

/** Can this user perform the named capability? */
function can(user, capability) {
  if (!user) return false;
  if (isAdmin(user)) return true;
  const allowed = CAPABILITIES[capability];
  if (!allowed) return false;
  return allowed.includes(user.role);
}

/** Stage keys this user is responsible for — drives their work queue. */
function stagesForRole(role) {
  if (role === 'admin' || role === 'management') return STAGE_KEYS.slice();
  return STAGES.filter((s) => s.roles.includes(role)).map((s) => s.key);
}

const LOST_REASONS = [
  'Price too high',
  'Competitor won',
  'Budget constraint',
  'Design change',
  'No response',
  'Cancelled by customer',
  'Delivery timeline',
  'Others',
];

const ENQUIRY_STAGE_LABELS = [
  'New',
  'Contacted',
  'Follow-up',
  'Site Visit Scheduled',
  'Quoted',
  'Hot',
  'Cold',
];

const PAYMENT_MODES = ['Cash', 'Cheque', 'Bank transfer', 'UPI', 'Card'];
const UNITS = ['nos', 'kg', 'gm', 'ltr', 'mtr', 'sqft', 'sqmt', 'box', 'set', 'pair', 'roll', 'sheet', 'bundle'];

module.exports = {
  STAGES,
  STAGE_KEYS,
  STAGE_BY_KEY,
  TERMINAL,
  stageIndex,
  nextStage,
  prevStage,
  stageLabel,
  ROLES,
  ROLE_KEYS,
  CAPABILITIES,
  isAdmin,
  canDoStage,
  can,
  stagesForRole,
  LOST_REASONS,
  ENQUIRY_STAGE_LABELS,
  PAYMENT_MODES,
  UNITS,
};
