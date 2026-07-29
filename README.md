# Arrohan Living ERP

An end-to-end order management system for **Arrohan Living Pvt Ltd**, Surat.

Every department works in sequence. An order cannot move to the next step until the
current one has been completed and approved by the department that owns it — the rule
is enforced on the server, so it holds even if someone calls the API directly.

- **Multi-user login** with one account per department and role-based access
- **SQLite database** (via [libSQL](https://turso.tech/libsql)) — same engine, same SQL, runs as a
  local file on an office PC or as a hosted database reachable from Vercel
- **15-step workflow** from enquiry to gate pass, exactly as specified
- **Automatic inventory** — stock moves as material is issued, consumed, wasted and purchased
- **21 reports** plus a live dashboard, all exportable to CSV
- **12 printable documents** on your company letterhead

Runs two ways — pick one:

| | Office install | Vercel + Turso |
|---|---|---|
| **Database** | A file on that PC (`data/arrohan.db`) | Hosted SQLite, reachable from anywhere |
| **Cost** | Free | Free tier covers this comfortably |
| **Setup** | `npm run setup && npm start` | See [§8 Deploying to Vercel](#8-deploying-to-vercel-turso) |
| **Best for** | One office, one machine always on | Access from anywhere, no PC to keep running |

---

## 1. Getting started (office install)

You need [Node.js 20 or newer](https://nodejs.org). Check with `node -v`.

Open a terminal in this folder and run:

```bash
npm run setup
```

That installs everything and builds the web interface. Then start it:

```bash
npm start
```

The terminal prints the addresses to open, for example:

```
  ARROHAN LIVING ERP
  ────────────────────────────────────────────────────
  Local        http://localhost:4180
  On your LAN  http://192.168.31.188:4180
  Database     C:\...\Dinesh Client\data\arrohan.db
  Workflow     14 stages, 10 roles
```

Open the **Local** address on the server machine. Everyone else on the office
network opens the **On your LAN** address in their browser — nothing to install
on their computers.

### Logins created on first start

Ten accounts are created, one per department:

| Username | Role | Username | Role |
| -------- | ---- | -------- | ---- |
| `admin` | Administrator | `production` | Production |
| `director` | Management (read-only) | `qc` | Quality Control |
| `sales` | Sales | `packing` | Packaging |
| `costing` | Factory / Costing | `dispatch` | Dispatch |
| `store` | Store | `accounts` | Accounts |

**Each one gets a different randomly generated password.** They are printed in the
terminal the first time you run `npm start`, and saved to
**`data/FIRST-RUN-LOGINS.txt`**:

```
  admin        brisk-lake-4827      System Administrator
  director     maple-onyx-1193      Management
  sales        cedar-vault-6402     Sales Department
  ...
```

Give each department its own line. Everyone is prompted to choose their own password
at first sign-in — after that, delete `FIRST-RUN-LOGINS.txt`. If a password is ever
forgotten, see [Forgotten password](#forgotten-password).

> Add a separate login per person under **Users & access**, rather than sharing a
> department account — that way the activity log shows who actually did what.

### Your company details

Copy the template and fill in your own details before the first start:

```bash
cp config/company.example.json config/company.json
```

Company name, address, GSTIN, PAN and bank details print on every quotation, invoice
and receipt. `config/company.json` is not tracked by git, so your details stay out of
the repository. You can also edit all of it later in the app under **Settings**.

### Try it with sample data first

```bash
npm run demo-data
```

This loads realistic sample records — materials with stock, suppliers, customers, and
five orders spread across the workflow including one completed order, one rejected
quotation, and one that failed QC and was reworked. Useful for training. Clear it
later with `npm run reset-db`.

It reads the passwords from `data/FIRST-RUN-LOGINS.txt`. If you have already changed
them, pass one instead:

```bash
ARROHAN_PW=yourpassword npm run demo-data
```

---

## 2. The workflow

```
                 ┌─ approved ─────────────────────────────────────────────┐
                 │                                                        ▼
1. Enquiry ─► 2. Factory Costing ─► 3. Sales Planning ─► 4. Quotation ─► 5. Sales Order
   (Sales)         (Costing)            (Sales)            (Sales)         (Sales)
                 │
                 └─ rejected ─► Closed / Lost  (reason recorded for reporting)

5. Sales Order ─► 6. Advance ─► 7. Store Issue ─► 8. Production ─► 9. Quality Check
   (Sales)         (Accounts)     (Store)           (Production)     (Quality)
                                                         ▲                │
                                                         └─ failed ───────┘

9. QC ─► 10. Packaging ─► 11. Dispatch ─► 12. Invoice ─► 13. Final Payment ─► 14. Gate Pass ─► Closed
          (Packaging)       (Dispatch)      (Sales)        (Accounts)           (Store)
```

| Step | Stage | Department | What happens |
| ---- | ----- | ---------- | ------------ |
| 1 | Enquiry | Sales | Customer details and product requirements. Sending it to the factory creates the order. |
| 2 | Factory Costing | Costing | A separate costing table per finished product: BOM, material cost, labour, machine, transport, overheads, wastage %. |
| 3 | Sales Planning | Sales | Reviews the factory cost, sets margin, selling price, discount and charges. |
| 4 | Quotation | Sales | Numbered quotation with GST, ready to print or email. |
| 4 | Customer Approval | Sales | Approved → sales order. Rejected → closed as lost **with a mandatory reason**. |
| 5 | Sales Order | Sales | Only against the customer signature. Locks the quoted value. Mandatory before production. |
| 5 | Advance Payment | Accounts | Records the advance, issues a numbered receipt, shows the balance. |
| 6 | Store — Material Issue | Store | Issues raw material per the approved costing BOM. **Deducts stock.** |
| 7 | Production | Production | Start/end dates, actual consumption, wastage, additional material requests. |
| 8 | Quality Check | Quality | Item-wise inspection. A failure returns the order to production for rework. |
| 9 | Packaging | Packaging | Box list, weights, marked ready for dispatch. Locked until QC passes. |
| 10 | Dispatch | Dispatch | Transporter, vehicle, driver, LR and e-way bill. Delivery challan. |
| 11 | Delivery Note & Invoice | Sales / Accounts | Delivery note plus the GST tax invoice. |
| 12 | Final Payment | Accounts | Collects the balance and updates customer outstanding. |
| 13 | Gate Pass Out | Store / Security | Issued after the full process is complete. Closes the order. |

Steps 4 and 5 each cover two gates, which is why the numbering repeats — it matches
the numbering in the requirement document.

### What cannot be done

- **No skipping.** Submitting a stage the order is not currently sitting on is rejected.
- **No cross-department work.** Only the owning department (or an administrator) can
  complete a stage.
- **No sales order without a signature.** No packing before QC passes. No gate pass
  before the final payment step.
- **No silent edits.** An administrator can reopen a stage, but it needs a written
  reason, everything after it is cleared, and any stock movement is reversed with a
  compensating ledger entry. All of it appears in the order history.

---

## 3. Roles

| Role | Can do |
| ---- | ------ |
| **Administrator** | Everything, plus users, settings and reopening a completed stage. |
| **Management** | Read-only across every module and all reports. Cannot change anything. |
| **Sales** | Enquiries, sales planning, quotation, customer approval, sales order, invoice. |
| **Factory / Costing** | The item-wise costing sheet. |
| **Store** | Material issue, inventory, purchase orders, gate pass. |
| **Production** | Production entry, consumption, wastage, extra material. |
| **Quality Control** | Quality inspection sign-off. |
| **Packaging** | Packing entry and ready-for-dispatch. |
| **Dispatch** | Dispatch details and gate pass. |
| **Accounts** | Advance and final payments, invoicing, outstanding. |

See the full grid under **Users & access → Roles & permissions**.

---

## 4. Reports

Everything under **Reports**, each with a date range, CSV export and clean printing.

**Sales** — Daily Enquiries Received · Enquiries Converted to Orders · Quotations
Pending Approval · Customer Order Tracking · Lost Enquiry Analysis

**Factory** — Orders in Production · QC Pending · Material Consumption ·
Wastage · Production Status

**Store** — Raw Material Stock · Low Stock · Finished Goods Inventory ·
Purchase Register · Stock Movement Ledger

**Logistics** — Ready for Dispatch · Daily Deliveries

**Accounts** — Sales Invoice Report · Outstanding Payments (with ageing) · Customer Ledger

**Management** — Department Workload · plus the Overall Business Dashboard on the home page

---

## 5. Documents

Printed on your letterhead, numbered `PREFIX/FY/0001` per financial year:

Costing sheet · Quotation · Sales order · Advance receipt · Material issue slip ·
QC report · Packing list · Delivery challan · Delivery note · Tax invoice ·
Final payment receipt · Gate pass

Open an order and use **Print a document**, or the **Documents** tab. Use your
browser's print dialog and choose *Save as PDF* to email one.

Invoices split GST into CGST + SGST when the customer is in the same state as the
company, and use IGST otherwise — set your state under **Settings**.

---

## 6. Day-to-day running

### Keep it running

`npm start` runs while the terminal window is open. To keep the ERP available after a
reboot, install it as a Windows service:

```bash
npm install --global pm2 pm2-windows-startup
pm2-startup install
pm2 start server/index.js --name arrohan-erp
pm2 save
```

### Let the office reach it

The server listens on port **4180** on every network interface. If Windows Firewall
blocks other computers, allow the port once (run as Administrator):

```bash
netsh advfirewall firewall add rule name="Arrohan ERP" dir=in action=allow protocol=TCP localport=4180
```

Give staff the LAN address printed at startup. Assign the server machine a static IP
so the address does not change.

### Back up

Everything lives in one folder: **`data/`**. Copy it while the server is stopped, or
copy just the database file while it runs:

```bash
node -e "const c=require('@libsql/client').createClient({url:'file:./data/arrohan.db'});c.execute('VACUUM INTO ?', ['./backup-'+new Date().toISOString().slice(0,10)+'.db']).then(()=>console.log('done'))"
```

Copy the backup to a pen drive or cloud folder. Do this **daily** — it is the only
copy of your business records.

(Running on Vercel + Turso instead? See [§8.6](#86-local-development-against-the-same-turso-database) —
use `turso db dump arrohan-erp > backup.sql` instead; Turso also keeps its own
point-in-time backups on the free tier.)

<a id="forgotten-password"></a>
### Forgotten password

Run this on the server machine — it works even when nobody can sign in:

```bash
npm run reset-password
```

That lists the accounts. Then set one:

```bash
npm run reset-password admin NewPassword123
```

---

## 7. Commands

| Command | What it does |
| ------- | ------------ |
| `npm run setup` | Install dependencies and build the interface (run once) |
| `npm start` | Start the ERP |
| `npm run build` | Rebuild the interface after changing client code |
| `npm run dev` | Development mode with live reload |
| `npm run demo-data` | Load realistic sample data |
| `npm run reset-db` | Delete all transactions, keep users and masters |
| `npm run reset-db -- --all` | Delete the database completely and start fresh |
| `npm run reset-password` | Recover a forgotten password |
| `npm run smoke` | Run the automated workflow test (97 checks) |
| `npm run turso:setup` | Check a Turso connection and print setup steps |

---

## 8. Deploying to Vercel + Turso

Vercel runs your code as short-lived functions with **no persistent disk** — a SQLite
file written there is wiped between requests. [Turso](https://turso.tech) solves this by
hosting the same SQLite engine as a small always-on service your Vercel functions talk
to over the network. The database code in this project (`@libsql/client`) already
speaks both: a local file when you run it on your own PC, or a Turso URL when deployed.
Nothing else changes — same SQL, same schema, same workflow rules.

### 8.1 Create the database (about two minutes)

```bash
curl -sSfL https://get.tur.so/install.sh | bash
turso auth login
turso db create arrohan-erp --location bom
turso db show arrohan-erp --url
turso db tokens create arrohan-erp
```

(On Windows, run those inside WSL, or download the CLI release directly from the
[turso-cli releases page](https://github.com/tursodatabase/turso-cli/releases).)

That gives you two values: a `libsql://...` URL and a long auth token. Check they work:

```bash
TURSO_DATABASE_URL=libsql://arrohan-erp-<you>.turso.io TURSO_AUTH_TOKEN=<token> npm run turso:setup
```

### 8.2 Push the code and import to Vercel

```bash
git push
```

Then on [vercel.com](https://vercel.com): **Add New → Project**, import this repository.
Vercel reads `vercel.json`, which is already set up to build the client, run the API as
a serverless function, and serve everything from one domain. You don't need to change
any project settings.

### 8.3 Set the environment variables

In the Vercel project → **Settings → Environment Variables**, add:

| Variable | Value |
| -------- | ----- |
| `TURSO_DATABASE_URL` | the `libsql://...` URL from step 8.1 |
| `TURSO_AUTH_TOKEN` | the token from step 8.1 |

Deploy (or redeploy if it already ran once without these set).

### 8.4 First sign-in

The first request creates every table and one login per department automatically —
there's no server console to read the passwords from, so **check the deployment's
function logs** (Vercel dashboard → your project → the deployment → **Logs**) right
after the first visit. They are printed once, the same way they would be in a terminal,
for example:

```
Created the following logins:
  admin        brisk-lake-4827      System Administrator
  sales        cedar-vault-6402     Sales Department
  ...
This is a hosted database with no writable disk — copy these now, they are not saved anywhere.
```

Copy them immediately — unlike the office install, there is no `data/FIRST-RUN-LOGINS.txt`
to come back to later, since Vercel has no writable disk to save it on. If you miss them,
recover any account with:

```bash
TURSO_DATABASE_URL=... TURSO_AUTH_TOKEN=... npm run reset-password admin NewPassword123
```

### 8.5 Your company details

`config/company.json` is not committed to git (see [§9](#9-how-it-is-built)), so a
Vercel deployment starts with placeholder company details. Either add real values to
`config/company.json` before pushing (fine for a private repo you control), or just set
them once signed in, under **Settings → Company & letterhead** — they save straight to
the database and print correctly from then on.

### 8.6 Local development against the same Turso database

Handy for testing before you push. Easiest way — copy the template and fill in your values:

```bash
cp .env.example .env
```

```
TURSO_DATABASE_URL=libsql://arrohan-erp-<you>.turso.io
TURSO_AUTH_TOKEN=<the token from step 8.1>
```

Then just `npm start` as normal — `.env` is loaded automatically and is git-ignored, so
the token never gets committed. Delete `.env` (or leave both values blank) to go back to
a local file in `data/` — the two never mix by accident.

Prefer not to use a file? Setting the same two variables directly in your shell works
identically and overrides anything in `.env`:

```bash
TURSO_DATABASE_URL=libsql://arrohan-erp-<you>.turso.io TURSO_AUTH_TOKEN=<token> npm start
```

> **Vercel itself never reads `.env`** — it isn't uploaded (it's git-ignored) and Vercel
> doesn't look for one anyway. For the deployed app, the two variables must be set under
> **Settings → Environment Variables** in the Vercel dashboard, as in §8.3. `.env` is only
> for testing on your own machine.

### What doesn't apply on Vercel

`npm run reset-db -- --all` refuses to run against a hosted database (deleting the file
makes no sense for one) — use `turso db destroy arrohan-erp` instead, or open the Turso
dashboard. Backups work differently too: `turso db dump arrohan-erp > backup.sql`
instead of copying the `data/` folder.

---

## 9. How it is built

```
api/
  index.js       Vercel serverless entry — just re-exports server/app.js
vercel.json      Build, routing and function config for a Vercel deployment
server/
  app.js         Builds the Express app (routes, static files, error handling) —
                 shared by the standalone server and the Vercel function
  index.js       Standalone entry point: awaits app.js, then listens on a port
  schema.sql     Full database structure
  db.js          libSQL connection (local file or hosted Turso), transactions,
                 document numbering — every call is async
  workflow.js    The 14 stages, roles and permissions — the single source of truth
  stages.js      One handler per stage: validation, calculations, stock movement
  auth.js        Password hashing, sessions, permission guards
  lib.js         Shared helpers, including every stock movement
  routes/        auth · users · masters · enquiries · orders · purchase · reports · dashboard · settings
  public/        The built interface (created by npm run build)
client/
  src/
    App.jsx      Routing
    Shell.jsx    Sidebar, top bar, password prompt
    auth.jsx     Who is signed in and what they may do
    ui/          Design system: buttons, tables, charts, modals, toasts
    pages/       Dashboard · Enquiries · Orders · Order pipeline · 14 stage forms · Inventory · Purchase · Masters · Reports · Users · Settings
    docs/        The 12 printable documents
config/
  company.example.json   Template — copy to company.json and fill in your own
data/
  arrohan.db     Your database when running locally — back this up
  FIRST-RUN-LOGINS.txt   Generated passwords, local installs only
scripts/
  smoke.js       End-to-end workflow test
  demo-data.js   Sample data loader
  reset-password.js
  turso-setup.js Checks a Turso connection and prints setup steps
```

**Stack:** Node.js · Express · [libSQL](https://turso.tech/libsql) (SQLite, local file
or hosted) · React 18 · Vite. Passwords are hashed with bcrypt; sessions are HTTP-only
cookies. Document numbers are issued by the database with an atomic `UPDATE ...
RETURNING`, so two people saving at the same moment — or two different Vercel function
instances — can never receive the same number.

**Notes on the design.** Money is stored as numbers and rounded to two decimals at
every calculation. Stock is never overwritten — each change is a signed ledger entry
with a reason and a reference, and the material balance is derived from it, so any
figure can be traced back. Re-submitting a stage (after a QC rework, for example)
reverses its earlier stock effect before applying the new numbers, so nothing is ever
double-counted.

---

## 10. Things worth knowing

**Costing BOM quantities cover the whole line, not one unit.** For an order of 8
wardrobes, enter the plywood needed for all 8 — that is what the store will issue.
The form shows a **× 8 for the whole line** button if you entered per-unit figures.

**Negative stock is allowed, deliberately.** If the store must issue material that
the system has no balance for, it can — with a tick-box — and the balance goes
negative and is flagged. That is better than blocking the shop floor. Fix it by
receiving the matching purchase, or with **Adjust** on the material.

**Enquiries are never deleted.** A lost enquiry keeps its reason and stays in the
reports so you can see why business was lost. It can be reopened if the customer
returns.

**A rejected quotation closes the whole order.** Both the order and its enquiry are
archived as lost with the same reason. Only an administrator can reopen it.
