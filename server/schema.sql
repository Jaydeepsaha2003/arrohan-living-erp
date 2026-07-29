-- ============================================================================
--  ARROHAN LIVING ERP — SQLite schema
--  End-to-end workflow: Enquiry -> Costing -> Planning -> Quotation ->
--  Approval -> Sales Order -> Advance -> Store -> Production -> QC ->
--  Packing -> Dispatch -> Invoice -> Final Payment -> Gate Pass
-- ============================================================================

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------- users / auth
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT    NOT NULL UNIQUE,
  full_name     TEXT    NOT NULL,
  password_hash TEXT    NOT NULL,
  role          TEXT    NOT NULL,          -- admin|management|sales|costing|store|production|qc|packaging|dispatch|accounts
  email         TEXT,
  phone         TEXT,
  active        INTEGER NOT NULL DEFAULT 1,
  must_change_pw INTEGER NOT NULL DEFAULT 0,
  last_login_at TEXT,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  created_by    INTEGER REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

CREATE TABLE IF NOT EXISTS sessions (
  token       TEXT PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at  TEXT NOT NULL,
  ip          TEXT,
  user_agent  TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS audit_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  at         TEXT NOT NULL DEFAULT (datetime('now')),
  user_id    INTEGER REFERENCES users(id),
  username   TEXT,
  action     TEXT NOT NULL,
  entity     TEXT,
  entity_id  TEXT,
  detail     TEXT
);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_at ON audit_log(at);

-- ------------------------------------------------------------------- settings
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);

-- Document number counters (per prefix, per financial year)
CREATE TABLE IF NOT EXISTS doc_counters (
  prefix  TEXT NOT NULL,
  fy      TEXT NOT NULL,
  last_no INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (prefix, fy)
);

-- -------------------------------------------------------------------- masters
CREATE TABLE IF NOT EXISTS customers (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  code          TEXT UNIQUE,
  name          TEXT NOT NULL,
  company_name  TEXT,
  phone         TEXT,
  alt_phone     TEXT,
  email         TEXT,
  gstin         TEXT,
  pan           TEXT,
  address       TEXT,
  city          TEXT,
  state         TEXT,
  pincode       TEXT,
  credit_days   INTEGER DEFAULT 0,
  notes         TEXT,
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  created_by    INTEGER REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);

CREATE TABLE IF NOT EXISTS suppliers (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  code         TEXT UNIQUE,
  name         TEXT NOT NULL,
  contact_person TEXT,
  phone        TEXT,
  email        TEXT,
  gstin        TEXT,
  address      TEXT,
  city         TEXT,
  state        TEXT,
  pincode      TEXT,
  payment_terms TEXT,
  active       INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS materials (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  code           TEXT UNIQUE,
  name           TEXT NOT NULL UNIQUE,
  category       TEXT,
  unit           TEXT NOT NULL DEFAULT 'nos',
  qty_in_stock   REAL NOT NULL DEFAULT 0,
  reorder_level  REAL NOT NULL DEFAULT 0,
  standard_rate  REAL NOT NULL DEFAULT 0,
  hsn            TEXT,
  location       TEXT,
  active         INTEGER NOT NULL DEFAULT 1,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_materials_name ON materials(name);

-- Finished-goods / product catalogue (optional master used to speed up enquiry entry)
CREATE TABLE IF NOT EXISTS products (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  code        TEXT UNIQUE,
  name        TEXT NOT NULL,
  category    TEXT,
  default_size TEXT,
  hsn         TEXT,
  notes       TEXT,
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Finished goods inventory (produced, awaiting dispatch / dispatched)
CREATE TABLE IF NOT EXISTS finished_goods (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id    INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  item_id     INTEGER REFERENCES enquiry_items(id),
  product     TEXT NOT NULL,
  qty         REAL NOT NULL DEFAULT 0,
  status      TEXT NOT NULL DEFAULT 'in_stock',   -- in_stock | dispatched
  produced_at TEXT,
  dispatched_at TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_fg_order ON finished_goods(order_id);
CREATE INDEX IF NOT EXISTS idx_fg_status ON finished_goods(status);

-- Every stock movement, in or out, with a reason and a reference
CREATE TABLE IF NOT EXISTS stock_ledger (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  at          TEXT NOT NULL DEFAULT (datetime('now')),
  material_id INTEGER NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  qty         REAL NOT NULL,                  -- +in  /  -out
  unit        TEXT,
  rate        REAL DEFAULT 0,
  balance_after REAL,
  txn_type    TEXT NOT NULL,                  -- purchase|issue|consume|wastage|return|adjust|opening
  ref_table   TEXT,
  ref_id      TEXT,
  order_no    TEXT,
  remarks     TEXT,
  user_id     INTEGER REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_ledger_material ON stock_ledger(material_id);
CREATE INDEX IF NOT EXISTS idx_ledger_at ON stock_ledger(at);
CREATE INDEX IF NOT EXISTS idx_ledger_type ON stock_ledger(txn_type);

-- ------------------------------------------------------------------ enquiries
CREATE TABLE IF NOT EXISTS enquiries (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  enquiry_no        TEXT NOT NULL UNIQUE,
  enquiry_date      TEXT NOT NULL,
  enquiry_time      TEXT,
  status            TEXT NOT NULL DEFAULT 'open',   -- open | converted | lost
  stage_label       TEXT DEFAULT 'New',             -- New|Contacted|Follow-up|Site Visit Scheduled|Quoted|Hot|Cold
  customer_id       INTEGER REFERENCES customers(id),
  cust_name         TEXT NOT NULL,
  cust_company      TEXT,
  cust_phone        TEXT,
  cust_alt_phone    TEXT,
  cust_email        TEXT,
  cust_gstin        TEXT,
  cust_pan          TEXT,
  cust_address      TEXT,
  cust_city         TEXT,
  cust_state        TEXT,
  cust_pincode      TEXT,
  reference         TEXT,
  taken_by          TEXT,
  expected_budget   REAL DEFAULT 0,
  site_name         TEXT,
  site_address      TEXT,
  site_city         TEXT,
  site_contact      TEXT,
  site_mobile       TEXT,
  visit_required    TEXT DEFAULT 'No',
  measurement_taken TEXT DEFAULT 'No',
  measurement_by    TEXT,
  measurement_date  TEXT,
  required_date     TEXT,
  installation_required TEXT DEFAULT 'No',
  payment_terms     TEXT,
  notes             TEXT,
  lost_reason       TEXT,
  lost_reason_note  TEXT,
  closed_at         TEXT,
  order_id          INTEGER,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  created_by        INTEGER REFERENCES users(id),
  updated_at        TEXT
);
CREATE INDEX IF NOT EXISTS idx_enq_status ON enquiries(status);
CREATE INDEX IF NOT EXISTS idx_enq_date ON enquiries(enquiry_date);

CREATE TABLE IF NOT EXISTS enquiry_items (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  enquiry_id  INTEGER NOT NULL REFERENCES enquiries(id) ON DELETE CASCADE,
  seq         INTEGER NOT NULL DEFAULT 1,
  product     TEXT NOT NULL,
  size        TEXT,
  qty         REAL NOT NULL DEFAULT 1,
  unit        TEXT DEFAULT 'nos',
  material    TEXT,
  laminate    TEXT,
  colour      TEXT,
  hardware    TEXT,
  remarks     TEXT
);
CREATE INDEX IF NOT EXISTS idx_enqitems_enq ON enquiry_items(enquiry_id);

-- --------------------------------------------------------------------- orders
CREATE TABLE IF NOT EXISTS orders (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  order_no      TEXT NOT NULL UNIQUE,
  enquiry_id    INTEGER NOT NULL REFERENCES enquiries(id),
  current_stage TEXT NOT NULL DEFAULT 'costing',
  status        TEXT NOT NULL DEFAULT 'active',   -- active | closed | lost
  hold          INTEGER NOT NULL DEFAULT 0,
  hold_reason   TEXT,
  priority      TEXT DEFAULT 'Normal',            -- Low | Normal | High | Urgent
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  created_by    INTEGER REFERENCES users(id),
  closed_at     TEXT
);
CREATE INDEX IF NOT EXISTS idx_orders_stage ON orders(current_stage);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);

-- Immutable trail of every completed stage — who, when, what
CREATE TABLE IF NOT EXISTS stage_history (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id  INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  stage     TEXT NOT NULL,
  action    TEXT NOT NULL,             -- completed | reopened | rejected | hold | resume
  at        TEXT NOT NULL DEFAULT (datetime('now')),
  user_id   INTEGER REFERENCES users(id),
  username  TEXT,
  note      TEXT
);
CREATE INDEX IF NOT EXISTS idx_stagehist_order ON stage_history(order_id);

-- ==================== STAGE 2 · FACTORY COSTING =============================
CREATE TABLE IF NOT EXISTS costings (
  order_id        INTEGER PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,
  production_days INTEGER NOT NULL DEFAULT 10,
  costed_by       TEXT,
  costed_at       TEXT,
  total_cost      REAL NOT NULL DEFAULT 0,
  notes           TEXT,
  completed_at    TEXT,
  completed_by    INTEGER REFERENCES users(id)
);

-- One costing block per finished product ("separate costing table for each finished product")
CREATE TABLE IF NOT EXISTS item_costings (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id        INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  item_id         INTEGER REFERENCES enquiry_items(id),
  product         TEXT NOT NULL,
  qty             REAL NOT NULL DEFAULT 1,
  labour_cost     REAL NOT NULL DEFAULT 0,
  machine_cost    REAL NOT NULL DEFAULT 0,
  transport_cost  REAL NOT NULL DEFAULT 0,
  overheads       REAL NOT NULL DEFAULT 0,
  wastage_percent REAL NOT NULL DEFAULT 5,
  material_cost   REAL NOT NULL DEFAULT 0,
  wastage_cost    REAL NOT NULL DEFAULT 0,
  total_cost      REAL NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_itemcost_order ON item_costings(order_id);

-- Bill of materials rows belonging to an item costing
CREATE TABLE IF NOT EXISTS costing_bom (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  item_costing_id  INTEGER NOT NULL REFERENCES item_costings(id) ON DELETE CASCADE,
  order_id         INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  material_id      INTEGER REFERENCES materials(id),
  material         TEXT NOT NULL,
  qty              REAL NOT NULL DEFAULT 0,
  unit             TEXT NOT NULL DEFAULT 'nos',
  rate             REAL NOT NULL DEFAULT 0,
  amount           REAL NOT NULL DEFAULT 0,
  remarks          TEXT
);
CREATE INDEX IF NOT EXISTS idx_bom_ic ON costing_bom(item_costing_id);
CREATE INDEX IF NOT EXISTS idx_bom_order ON costing_bom(order_id);

-- ==================== STAGE 3 · SALES PLANNING =============================
CREATE TABLE IF NOT EXISTS plannings (
  order_id            INTEGER PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,
  margin_percent      REAL NOT NULL DEFAULT 20,
  discount_percent    REAL NOT NULL DEFAULT 0,
  discount_amount     REAL NOT NULL DEFAULT 0,
  freight_charges     REAL NOT NULL DEFAULT 0,
  installation_charges REAL NOT NULL DEFAULT 0,
  loading_charges     REAL NOT NULL DEFAULT 0,
  payment_terms       TEXT,
  delivery_date       TEXT,
  items_total         REAL NOT NULL DEFAULT 0,
  subtotal            REAL NOT NULL DEFAULT 0,
  decided_by          TEXT,
  planned_at          TEXT,
  notes               TEXT,
  completed_at        TEXT,
  completed_by        INTEGER REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS planning_items (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id      INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  item_id       INTEGER REFERENCES enquiry_items(id),
  product       TEXT NOT NULL,
  size          TEXT,
  qty           REAL NOT NULL DEFAULT 1,
  unit          TEXT DEFAULT 'nos',
  cost_per_unit REAL NOT NULL DEFAULT 0,
  selling_price REAL NOT NULL DEFAULT 0,
  amount        REAL NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_planitems_order ON planning_items(order_id);

-- ==================== STAGE 4 · QUOTATION ==================================
CREATE TABLE IF NOT EXISTS quotations (
  order_id        INTEGER PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,
  quotation_no    TEXT NOT NULL,
  quotation_date  TEXT NOT NULL,
  valid_till      TEXT,
  warranty        TEXT,
  terms           TEXT,
  gst_rate        REAL NOT NULL DEFAULT 18,
  subtotal        REAL NOT NULL DEFAULT 0,
  gst_amount      REAL NOT NULL DEFAULT 0,
  grand_total     REAL NOT NULL DEFAULT 0,
  revision        INTEGER NOT NULL DEFAULT 0,
  sent_at         TEXT,
  completed_at    TEXT,
  completed_by    INTEGER REFERENCES users(id)
);

-- ==================== STAGE 5 · CUSTOMER APPROVAL ==========================
CREATE TABLE IF NOT EXISTS approvals (
  order_id      INTEGER PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,
  status        TEXT NOT NULL,             -- approved | rejected
  decided_at    TEXT NOT NULL,
  decided_by_name TEXT,
  reject_reason TEXT,                      -- Price|Competitor|Budget|Design Change|No Response|Cancelled by Customer|Others
  reject_note   TEXT,
  notes         TEXT,
  completed_at  TEXT,
  completed_by  INTEGER REFERENCES users(id)
);

-- ==================== STAGE 6 · SALES ORDER ================================
CREATE TABLE IF NOT EXISTS sales_orders (
  order_id        INTEGER PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,
  so_no           TEXT NOT NULL,
  so_date         TEXT NOT NULL,
  quotation_no    TEXT,
  locked_total    REAL NOT NULL DEFAULT 0,
  locked_terms    TEXT,
  customer_signed INTEGER NOT NULL DEFAULT 0,
  signed_date     TEXT,
  po_number       TEXT,
  po_date         TEXT,
  notes           TEXT,
  completed_at    TEXT,
  completed_by    INTEGER REFERENCES users(id)
);

-- ==================== STAGE 7 · ADVANCE PAYMENT ============================
CREATE TABLE IF NOT EXISTS payments (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id    INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,               -- advance | final | part
  receipt_no  TEXT NOT NULL,
  amount      REAL NOT NULL DEFAULT 0,
  received_at TEXT NOT NULL,
  mode        TEXT,                        -- Cash|Cheque|Bank transfer|UPI|Card
  reference   TEXT,
  remarks     TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  created_by  INTEGER REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_pay_order ON payments(order_id);
CREATE INDEX IF NOT EXISTS idx_pay_kind ON payments(kind);

CREATE TABLE IF NOT EXISTS advances (
  order_id             INTEGER PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,
  payment_id           INTEGER REFERENCES payments(id),
  amount               REAL NOT NULL DEFAULT 0,
  balance              REAL NOT NULL DEFAULT 0,
  released_to_production INTEGER NOT NULL DEFAULT 1,
  completed_at         TEXT,
  completed_by         INTEGER REFERENCES users(id)
);

-- ==================== STAGE 8 · STORE — MATERIAL ISSUE =====================
CREATE TABLE IF NOT EXISTS store_issues (
  order_id     INTEGER PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,
  issue_no     TEXT NOT NULL,
  issue_date   TEXT NOT NULL,
  issued_by    TEXT,
  received_by  TEXT,
  remarks      TEXT,
  completed_at TEXT,
  completed_by INTEGER REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS store_issue_lines (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id    INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  bom_id      INTEGER REFERENCES costing_bom(id),
  material_id INTEGER REFERENCES materials(id),
  product     TEXT,
  material    TEXT NOT NULL,
  qty_planned REAL NOT NULL DEFAULT 0,
  qty_issued  REAL NOT NULL DEFAULT 0,
  unit        TEXT DEFAULT 'nos',
  rate        REAL DEFAULT 0,
  remarks     TEXT
);
CREATE INDEX IF NOT EXISTS idx_issuelines_order ON store_issue_lines(order_id);

-- ==================== STAGE 9 · PRODUCTION =================================
CREATE TABLE IF NOT EXISTS productions (
  order_id          INTEGER PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,
  start_date        TEXT,
  started_by        TEXT,
  expected_end_date TEXT,
  end_date          TEXT,
  produced_by       TEXT,
  supervisor        TEXT,
  needs_additional  INTEGER NOT NULL DEFAULT 0,
  notes             TEXT,
  started_at        TEXT,
  completed_at      TEXT,
  completed_by      INTEGER REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS production_consumption (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id    INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  material_id INTEGER REFERENCES materials(id),
  product     TEXT,
  material    TEXT NOT NULL,
  qty_issued  REAL NOT NULL DEFAULT 0,
  qty_used    REAL NOT NULL DEFAULT 0,
  unit        TEXT DEFAULT 'nos',
  remarks     TEXT
);
CREATE INDEX IF NOT EXISTS idx_cons_order ON production_consumption(order_id);

CREATE TABLE IF NOT EXISTS production_wastage (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id    INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  material_id INTEGER REFERENCES materials(id),
  material    TEXT NOT NULL,
  qty         REAL NOT NULL DEFAULT 0,
  unit        TEXT DEFAULT 'nos',
  rate        REAL DEFAULT 0,
  value       REAL DEFAULT 0,
  reason      TEXT,
  at          TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_waste_order ON production_wastage(order_id);

CREATE TABLE IF NOT EXISTS additional_materials (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id    INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  material_id INTEGER REFERENCES materials(id),
  material    TEXT NOT NULL,
  qty         REAL NOT NULL DEFAULT 0,
  unit        TEXT DEFAULT 'nos',
  reason      TEXT,
  status      TEXT NOT NULL DEFAULT 'requested',  -- requested | issued
  requested_at TEXT NOT NULL DEFAULT (datetime('now')),
  issued_at   TEXT
);
CREATE INDEX IF NOT EXISTS idx_addmat_order ON additional_materials(order_id);

-- ==================== STAGE 10 · QUALITY CHECK =============================
CREATE TABLE IF NOT EXISTS qc_checks (
  order_id     INTEGER PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,
  qc_no        TEXT,
  qc_date      TEXT NOT NULL,
  qc_by        TEXT,
  result       TEXT NOT NULL DEFAULT 'pass',   -- pass | fail
  rework_note  TEXT,
  notes        TEXT,
  attempt      INTEGER NOT NULL DEFAULT 1,
  completed_at TEXT,
  completed_by INTEGER REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS qc_items (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id   INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  item_id    INTEGER REFERENCES enquiry_items(id),
  product    TEXT NOT NULL,
  qty        REAL NOT NULL DEFAULT 0,
  qty_passed REAL NOT NULL DEFAULT 0,
  qty_failed REAL NOT NULL DEFAULT 0,
  finish_ok      INTEGER NOT NULL DEFAULT 1,
  dimension_ok   INTEGER NOT NULL DEFAULT 1,
  hardware_ok    INTEGER NOT NULL DEFAULT 1,
  remarks    TEXT
);
CREATE INDEX IF NOT EXISTS idx_qcitems_order ON qc_items(order_id);

-- ==================== STAGE 11 · PACKAGING =================================
CREATE TABLE IF NOT EXISTS packings (
  order_id      INTEGER PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,
  packing_no    TEXT,
  packing_date  TEXT NOT NULL,
  packed_by     TEXT,
  total_boxes   INTEGER NOT NULL DEFAULT 0,
  gross_weight  REAL DEFAULT 0,
  packing_material TEXT,
  ready_for_dispatch INTEGER NOT NULL DEFAULT 0,
  notes         TEXT,
  completed_at  TEXT,
  completed_by  INTEGER REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS packing_lines (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id   INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  box_no     TEXT,
  contents   TEXT,
  qty        REAL DEFAULT 0,
  weight     REAL DEFAULT 0,
  dimensions TEXT
);
CREATE INDEX IF NOT EXISTS idx_packlines_order ON packing_lines(order_id);

-- ==================== STAGE 12 · DISPATCH ==================================
CREATE TABLE IF NOT EXISTS dispatches (
  order_id         INTEGER PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,
  challan_no       TEXT NOT NULL,
  dispatch_date    TEXT NOT NULL,
  transporter      TEXT,
  vehicle_no       TEXT,
  driver_name      TEXT,
  driver_phone     TEXT,
  lr_no            TEXT,
  freight_amount   REAL DEFAULT 0,
  delivery_address TEXT,
  eway_bill_no     TEXT,
  boxes            INTEGER DEFAULT 0,
  notes            TEXT,
  completed_at     TEXT,
  completed_by     INTEGER REFERENCES users(id)
);

-- ==================== STAGE 13 · DELIVERY NOTE + INVOICE ===================
CREATE TABLE IF NOT EXISTS invoices (
  order_id       INTEGER PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,
  invoice_no     TEXT NOT NULL,
  invoice_date   TEXT NOT NULL,
  delivery_note_no TEXT,
  taxable_amount REAL NOT NULL DEFAULT 0,
  gst_rate       REAL NOT NULL DEFAULT 18,
  gst_amount     REAL NOT NULL DEFAULT 0,
  grand_total    REAL NOT NULL DEFAULT 0,
  place_of_supply TEXT,
  irn            TEXT,
  notes          TEXT,
  completed_at   TEXT,
  completed_by   INTEGER REFERENCES users(id)
);

-- ==================== STAGE 14 · FINAL PAYMENT =============================
CREATE TABLE IF NOT EXISTS final_payments (
  order_id       INTEGER PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,
  payment_id     INTEGER REFERENCES payments(id),
  balance_amount REAL NOT NULL DEFAULT 0,
  received_at    TEXT,
  delivered_date TEXT,
  outstanding    REAL NOT NULL DEFAULT 0,
  completed_at   TEXT,
  completed_by   INTEGER REFERENCES users(id)
);

-- ==================== STAGE 15 · GATE PASS OUT =============================
CREATE TABLE IF NOT EXISTS gate_passes (
  order_id      INTEGER PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,
  gate_pass_no  TEXT NOT NULL,
  gate_pass_date TEXT NOT NULL,
  gate_pass_time TEXT,
  vehicle_no    TEXT,
  driver_name   TEXT,
  security_by   TEXT,
  boxes         INTEGER DEFAULT 0,
  remarks       TEXT,
  completed_at  TEXT,
  completed_by  INTEGER REFERENCES users(id)
);

-- ------------------------------------------------------------ purchase orders
CREATE TABLE IF NOT EXISTS purchase_orders (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  po_no         TEXT NOT NULL UNIQUE,
  po_date       TEXT NOT NULL,
  supplier_id   INTEGER REFERENCES suppliers(id),
  supplier_name TEXT NOT NULL,
  supplier_phone TEXT,
  order_id      INTEGER REFERENCES orders(id),
  expected_date TEXT,
  status        TEXT NOT NULL DEFAULT 'open',   -- open | received | cancelled
  subtotal      REAL NOT NULL DEFAULT 0,
  gst_rate      REAL NOT NULL DEFAULT 18,
  gst_amount    REAL NOT NULL DEFAULT 0,
  grand_total   REAL NOT NULL DEFAULT 0,
  received_at   TEXT,
  received_by   TEXT,
  grn_no        TEXT,
  notes         TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  created_by    INTEGER REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_po_status ON purchase_orders(status);

CREATE TABLE IF NOT EXISTS purchase_order_items (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  po_id       INTEGER NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  material_id INTEGER REFERENCES materials(id),
  material    TEXT NOT NULL,
  qty         REAL NOT NULL DEFAULT 0,
  qty_received REAL NOT NULL DEFAULT 0,
  unit        TEXT DEFAULT 'nos',
  rate        REAL NOT NULL DEFAULT 0,
  amount      REAL NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_poitems_po ON purchase_order_items(po_id);

-- ------------------------------------------------------------------- comments
CREATE TABLE IF NOT EXISTS order_notes (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id  INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  stage     TEXT,
  body      TEXT NOT NULL,
  at        TEXT NOT NULL DEFAULT (datetime('now')),
  user_id   INTEGER REFERENCES users(id),
  username  TEXT
);
CREATE INDEX IF NOT EXISTS idx_ordernotes_order ON order_notes(order_id);
