import React, { lazy, Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import './index.css';
import { AuthProvider, useAuth } from './lib/auth.jsx';
import { Loading, ToastProvider } from './components/ui.jsx';
import Layout from './components/Layout.jsx';
import { Login, Setup } from './pages/Auth.jsx';

const P = (loader, name) => lazy(() => loader().then((m) => ({ default: m[name] })));
const Dashboard = P(() => import('./pages/Dashboard.jsx'), 'Dashboard');
const InboxPage = P(() => import('./pages/Inbox.jsx'), 'InboxPage');
const MyAttendance = P(() => import('./pages/Attendance.jsx'), 'MyAttendance');
const AdminAttendance = P(() => import('./pages/Attendance.jsx'), 'AdminAttendance');
const MyLeave = P(() => import('./pages/Leave.jsx'), 'MyLeave');
const AdminLeave = P(() => import('./pages/Leave.jsx'), 'AdminLeave');
const MySalary = P(() => import('./pages/Payroll.jsx'), 'MySalary');
const PayrollPage = P(() => import('./pages/Payroll.jsx'), 'PayrollPage');
const PayrollRun = P(() => import('./pages/Payroll.jsx'), 'PayrollRun');
const Payslip = P(() => import('./pages/Payroll.jsx'), 'Payslip');
const MyExpenses = P(() => import('./pages/Expenses.jsx'), 'MyExpenses');
const AdminExpenses = P(() => import('./pages/Expenses.jsx'), 'AdminExpenses');
const MyTimesheet = P(() => import('./pages/Timesheet.jsx'), 'MyTimesheet');
const MyPerformance = P(() => import('./pages/Performance.jsx'), 'MyPerformance');
const AdminPerformance = P(() => import('./pages/Performance.jsx'), 'AdminPerformance');
const People = P(() => import('./pages/People.jsx'), 'People');
const EmployeeProfile = P(() => import('./pages/Profile.jsx'), 'EmployeeProfile');
const MyDocuments = P(() => import('./pages/Profile.jsx'), 'MyDocuments');
const OrgChart = P(() => import('./pages/People.jsx'), 'OrgChart');
const Team = P(() => import('./pages/Team.jsx'), 'Team');
const Recruitment = P(() => import('./pages/Recruitment.jsx'), 'Recruitment');
const Lifecycle = P(() => import('./pages/Lifecycle.jsx'), 'Lifecycle');
const MyExit = P(() => import('./pages/Lifecycle.jsx'), 'MyExit');
const Helpdesk = P(() => import('./pages/Helpdesk.jsx'), 'Helpdesk');
const Ticket = P(() => import('./pages/Helpdesk.jsx'), 'Ticket');
const Assets = P(() => import('./pages/Assets.jsx'), 'Assets');
const MyAssets = P(() => import('./pages/Assets.jsx'), 'MyAssets');
const Engage = P(() => import('./pages/Engage.jsx'), 'Engage');
const Letters = P(() => import('./pages/Letters.jsx'), 'Letters');
const Reports = P(() => import('./pages/Reports.jsx'), 'Reports');
const SettingsPage = P(() => import('./pages/Settings.jsx'), 'SettingsPage');

function HROnly({ children }) {
  const { user } = useAuth();
  return user.is_hr ? children : <Navigate to="/" replace />;
}

function App() {
  const { loading, user, needsSetup } = useAuth();
  if (loading) return <Loading />;
  if (!user) return needsSetup ? <Setup /> : <Login />;
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route path="/payslip/:id" element={<Payslip />} />
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="inbox" element={<InboxPage />} />
          <Route path="me/attendance" element={<MyAttendance />} />
          <Route path="me/leave" element={<MyLeave />} />
          <Route path="me/payslips" element={<MySalary />} />
          <Route path="me/expenses" element={<MyExpenses />} />
          <Route path="me/timesheet" element={<MyTimesheet />} />
          <Route path="me/performance" element={<MyPerformance />} />
          <Route path="me/documents" element={<MyDocuments />} />
          <Route path="me/assets" element={<MyAssets />} />
          <Route path="me/exit" element={<MyExit />} />
          <Route path="helpdesk" element={<Helpdesk />} />
          <Route path="helpdesk/:id" element={<Ticket />} />
          <Route path="engage" element={<Engage />} />
          <Route path="people" element={<People />} />
          <Route path="people/:id" element={<EmployeeProfile />} />
          <Route path="org-chart" element={<OrgChart />} />
          <Route path="team" element={<Team />} />
          <Route path="team/performance" element={<Team initialTab="performance" />} />
          <Route path="recruitment" element={<Recruitment />} />
          <Route path="admin/attendance" element={<HROnly><AdminAttendance /></HROnly>} />
          <Route path="admin/leave" element={<HROnly><AdminLeave /></HROnly>} />
          <Route path="admin/expenses" element={<HROnly><AdminExpenses /></HROnly>} />
          <Route path="admin/performance" element={<HROnly><AdminPerformance /></HROnly>} />
          <Route path="payroll" element={<HROnly><PayrollPage /></HROnly>} />
          <Route path="payroll/runs/:id" element={<HROnly><PayrollRun /></HROnly>} />
          <Route path="lifecycle" element={<HROnly><Lifecycle /></HROnly>} />
          <Route path="assets" element={<HROnly><Assets /></HROnly>} />
          <Route path="letters" element={<HROnly><Letters /></HROnly>} />
          <Route path="reports" element={<HROnly><Reports /></HROnly>} />
          <Route path="settings" element={<HROnly><SettingsPage /></HROnly>} />
          <Route path="*" element={<div className="py-20 text-center text-slate-500">Page not found</div>} />
        </Route>
      </Routes>
    </Suspense>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider><App /></AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
