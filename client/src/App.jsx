import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import Shell from './Shell.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import { EnquiryList, EnquiryDetail, EnquiryEditor } from './pages/Enquiries.jsx';
import { OrderList, WorkQueue } from './pages/Orders.jsx';
import OrderPipeline from './pages/OrderPipeline.jsx';
import Inventory from './pages/Inventory.jsx';
import Purchase from './pages/Purchase.jsx';
import Masters from './pages/Masters.jsx';
import { ReportIndex, ReportView } from './pages/Reports.jsx';
import Users from './pages/Users.jsx';
import SettingsPage from './pages/Settings.jsx';
import { Alert, Empty, Loading } from './ui/kit.jsx';
import { IconAlert, IconLock } from './ui/Icons.jsx';

const TITLES = [
  [/^\/$/, 'Dashboard'],
  [/^\/queue/, 'My work queue'],
  [/^\/enquiries\/new/, 'New enquiry'],
  [/^\/enquiries\/\d+\/edit/, 'Edit enquiry'],
  [/^\/enquiries\/\d+/, 'Enquiry'],
  [/^\/enquiries/, 'Enquiries'],
  [/^\/orders\/\d+/, 'Order pipeline'],
  [/^\/orders/, 'Orders'],
  [/^\/inventory/, 'Stock & materials'],
  [/^\/purchase/, 'Purchase orders'],
  [/^\/masters/, 'Masters'],
  [/^\/reports\/.+/, 'Report'],
  [/^\/reports/, 'Reports'],
  [/^\/users/, 'Users & access'],
  [/^\/settings/, 'Settings'],
];

export default function App() {
  const { status, user } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    return (
      <div className="center-fill">
        <Loading label="Starting Arrohan Living ERP…" />
      </div>
    );
  }

  if (status === 'offline') {
    return (
      <div className="center-fill">
        <div style={{ maxWidth: 460 }}>
          <Alert tone="bad" title="Cannot reach the ERP server">
            The web page loaded but the server is not responding. Make sure it is running (<span className="mono">npm start</span>),
            then reload this page.
          </Alert>
          <div className="row" style={{ justifyContent: 'center', marginTop: 16 }}>
            <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
              Try again
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!user) return <Login />;

  const title = (TITLES.find(([re]) => re.test(location.pathname)) || [null, 'Arrohan Living ERP'])[1];

  return (
    <Shell title={title}>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/queue" element={<WorkQueue />} />

        <Route path="/enquiries" element={<Guard cap="enquiry.create" allowRoles={['admin', 'management']}><EnquiryList /></Guard>} />
        <Route path="/enquiries/new" element={<Guard cap="enquiry.create"><EnquiryEditor mode="new" /></Guard>} />
        <Route path="/enquiries/:id/edit" element={<Guard cap="enquiry.edit"><EnquiryEditor mode="edit" /></Guard>} />
        <Route path="/enquiries/:id" element={<Guard cap="enquiry.create" allowRoles={['admin', 'management']}><EnquiryDetail /></Guard>} />

        <Route path="/orders" element={<OrderList />} />
        <Route path="/orders/:id" element={<OrderPipeline />} />

        <Route path="/inventory" element={<Inventory />} />
        <Route path="/purchase" element={<Purchase />} />
        <Route path="/masters" element={<Masters />} />

        <Route path="/reports" element={<ReportIndex />} />
        <Route path="/reports/:key" element={<ReportView />} />

        <Route path="/users" element={<Guard adminOnly><Users /></Guard>} />
        <Route path="/settings" element={<Guard adminOnly><SettingsPage /></Guard>} />

        <Route path="*" element={<NotFound />} />
      </Routes>
    </Shell>
  );
}

/** Route-level access check. The server enforces the same rules on every call. */
function Guard({ children, cap, adminOnly, allowRoles }) {
  const { can, isAdmin, user } = useAuth();
  const allowed =
    isAdmin ||
    (adminOnly ? false : (allowRoles && allowRoles.includes(user.role)) || (cap ? can(cap) : true));

  if (allowed) return children;

  return (
    <div className="content-inner narrow">
      <Empty icon={IconLock} title="You do not have access to this page">
        Your role is {user.roleLabel}. {adminOnly ? 'Only an administrator can open this page.' : 'Ask an administrator if you need access.'}
      </Empty>
    </div>
  );
}

function NotFound() {
  return (
    <div className="content-inner narrow">
      <Empty icon={IconAlert} title="Page not found" action={<a className="btn btn-primary" href="/">Back to the dashboard</a>}>
        The link you followed does not exist in this application.
      </Empty>
    </div>
  );
}
