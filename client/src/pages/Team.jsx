import { useState } from 'react';
import { useApi } from '../lib/api.js';
import { fmtDate, todayStr } from '../lib/format.js';
import { Avatar, Badge, Card, PageHeader, Table, Tabs, Empty } from '../components/ui.jsx';
import { DailyMuster } from './Attendance.jsx';
import { WhoIsOut } from './Leave.jsx';
import { TeamPerformance } from './Performance.jsx';
import { useAuth } from '../lib/auth.jsx';

export function Team({ initialTab = 'today' }) {
  const { user } = useAuth();
  const [tab, setTab] = useState(initialTab);
  const [date, setDate] = useState(todayStr());
  const leave = useApi(tab === 'leave' ? '/leave/requests?scope=team' : null);
  const ts = useApi(tab === 'timesheets' ? '/work/timesheets?scope=team' : null);
  const exp = useApi(tab === 'expenses' ? '/work/expenses?scope=team' : null);
  return (
    <div>
      <PageHeader title="My team" subtitle={user.is_hr ? 'Showing your reporting line. Use the Admin section for the whole company.' : 'Everyone who reports to you, directly or indirectly.'} />
      <Tabs tabs={[{ key: 'today', label: 'Attendance' }, { key: 'leave', label: 'Leave' }, { key: 'performance', label: 'Performance' }, { key: 'timesheets', label: 'Timesheets' }, { key: 'expenses', label: 'Expenses' }]} value={tab} onChange={setTab} />
      {tab === 'today' && <DailyMuster date={date} setDate={setDate} hr={user.is_hr} />}
      {tab === 'leave' && (
        <div className="space-y-6">
          <WhoIsOut />
          <Card title="Team leave requests" bodyClass="p-0">
            <Table rows={leave.data} exportName="team-leave" empty={<Empty title="No leave requests from your team" />} columns={[
              { key: 'employee_name', label: 'Employee', render: (r) => <div className="flex items-center gap-2"><Avatar name={r.employee_name} size="xs" /><span className="font-medium">{r.employee_name}</span></div> },
              { key: 'leave_type', label: 'Type', render: (r) => <Badge color={r.color}>{r.leave_type}</Badge> }, { key: 'from_date', label: 'Dates', render: (r) => `${fmtDate(r.from_date)}${r.to_date !== r.from_date ? ` → ${fmtDate(r.to_date)}` : ''}` },
              { key: 'days', label: 'Days' }, { key: 'status', label: 'Status', render: (r) => <Badge status={r.status} /> },
            ]} />
          </Card>
        </div>
      )}
      {tab === 'performance' && <TeamPerformance />}
      {tab === 'timesheets' && (
        <Card bodyClass="p-0">
          <Table rows={ts.data} exportName="team-timesheets" searchable searchKeys={['employee_name', 'project', 'description']} empty={<Empty title="No timesheet entries in the last 30 days" />} columns={[
            { key: 'employee_name', label: 'Employee', render: (r) => <span className="font-medium">{r.employee_name}</span> }, { key: 'date', label: 'Date', render: (r) => fmtDate(r.date) },
            { key: 'project', label: 'Project', render: (r) => r.project || 'General' }, { key: 'hours', label: 'Hours' }, { key: 'description', label: 'Description' }, { key: 'status', label: 'Status', render: (r) => <Badge status={r.status} /> },
          ]} />
        </Card>
      )}
      {tab === 'expenses' && (
        <Card bodyClass="p-0">
          <Table rows={exp.data} exportName="team-expenses" empty={<Empty title="No expense claims from your team" />} columns={[
            { key: 'employee_name', label: 'Employee', render: (r) => <span className="font-medium">{r.employee_name}</span> }, { key: 'date', label: 'Date', render: (r) => fmtDate(r.date) },
            { key: 'category', label: 'Category' }, { key: 'amount', label: 'Amount', render: (r) => `₹${r.amount.toLocaleString('en-IN')}` }, { key: 'status', label: 'Status', render: (r) => <Badge status={r.status} /> },
          ]} />
        </Card>
      )}
    </div>
  );
}
