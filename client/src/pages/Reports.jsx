import { useState } from 'react';
import dayjs from 'dayjs';
import { Users, TrendingDown, UserPlus, UserMinus } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, LineChart, Line, Legend, PieChart, Pie, Cell } from 'recharts';
import { useApi } from '../lib/api.js';
import { fmtMonth, mins } from '../lib/format.js';
import { Card, Loading, PageHeader, StatCard, Table, Tabs } from '../components/ui.jsx';
import { MonthNav } from './Attendance.jsx';

const COLORS = ['#3366ff', '#10b981', '#f59e0b', '#f43f5e', '#8b5cf6', '#0ea5e9', '#14b8a6', '#d946ef'];

function Donut({ data }) {
  return (
    <div className="flex items-center gap-4">
      <div className="h-40 w-40 shrink-0"><ResponsiveContainer><PieChart><Pie data={data} dataKey="value" nameKey="name" innerRadius={42} outerRadius={70} paddingAngle={2}>{data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer></div>
      <ul className="space-y-1 text-sm">{data.map((d, i) => <li key={d.name} className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />{d.name}<span className="text-slate-400">{d.value}</span></li>)}</ul>
    </div>
  );
}

export function Reports() {
  const [tab, setTab] = useState('workforce');
  const [month, setMonth] = useState(dayjs().format('YYYY-MM'));
  const [year, setYear] = useState(dayjs().year());
  const hc = useApi(tab === 'workforce' ? '/reports/headcount' : null);
  const att = useApi(tab === 'attendance' ? `/reports/attendance?month=${month}` : null);
  const leave = useApi(tab === 'leave' ? `/reports/leave?year=${year}` : null);
  const d = hc.data;
  return (
    <div>
      <PageHeader title="Reports" subtitle="Workforce analytics with CSV export." />
      <Tabs tabs={[{ key: 'workforce', label: 'Workforce' }, { key: 'attendance', label: 'Attendance' }, { key: 'leave', label: 'Leave balances' }]} value={tab} onChange={setTab} />
      {tab === 'workforce' && (!d ? <Loading /> : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label="Active employees" value={d.active} icon={Users} />
            <StatCard label="Joined (12 mo)" value={d.trend.reduce((s, x) => s + x.joins, 0)} icon={UserPlus} tone="green" />
            <StatCard label="Exited (12 mo)" value={d.trend.reduce((s, x) => s + x.exits, 0)} icon={UserMinus} tone="rose" />
            <StatCard label="Attrition (12 mo)" value={`${d.attrition_pct}%`} icon={TrendingDown} tone="amber" />
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <Card title="Headcount trend"><div className="h-64"><ResponsiveContainer><LineChart data={d.trend.map((x) => ({ ...x, m: dayjs(`${x.month}-01`).format('MMM') }))}><CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" /><XAxis dataKey="m" fontSize={12} /><YAxis fontSize={12} allowDecimals={false} /><Tooltip /><Line type="monotone" dataKey="headcount" stroke="#3366ff" strokeWidth={2} /></LineChart></ResponsiveContainer></div></Card>
            <Card title="Joins vs exits"><div className="h-64"><ResponsiveContainer><BarChart data={d.trend.map((x) => ({ ...x, m: dayjs(`${x.month}-01`).format('MMM') }))}><CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" /><XAxis dataKey="m" fontSize={12} /><YAxis fontSize={12} allowDecimals={false} /><Tooltip /><Legend /><Bar dataKey="joins" fill="#10b981" radius={[4, 4, 0, 0]} /><Bar dataKey="exits" fill="#f43f5e" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div></Card>
            <Card title="By department"><Donut data={d.by_department} /></Card>
            <Card title="By location"><Donut data={d.by_location} /></Card>
            <Card title="By employment type"><Donut data={d.by_type} /></Card>
            <Card title="By gender"><Donut data={d.by_gender} /></Card>
          </div>
        </div>
      ))}
      {tab === 'attendance' && (
        <Card bodyClass="p-0">
          <Table rows={att.data} searchable exportName={`attendance-${month}`} toolbar={<MonthNav month={month} setMonth={setMonth} />} searchKeys={['name', 'emp_code', 'department']} columns={[
            { key: 'name', label: 'Employee', render: (r) => <span className="font-medium">{r.name}</span> }, { key: 'emp_code', label: 'Code' }, { key: 'department', label: 'Department' },
            { key: 'present', label: 'Present' }, { key: 'absent', label: 'Absent' }, { key: 'leave', label: 'Leave' }, { key: 'holidays', label: 'Holidays' }, { key: 'late', label: 'Late' },
            { key: 'avg_minutes', label: 'Avg hours', render: (r) => mins(r.avg_minutes), csv: (r) => (r.avg_minutes / 60).toFixed(2) },
          ]} />
          <p className="px-4 py-2 text-xs text-slate-400">{fmtMonth(month)} · Half days count as 0.5</p>
        </Card>
      )}
      {tab === 'leave' && (
        <Card bodyClass="p-0">
          {!leave.data ? <Loading /> : (
            <Table rows={leave.data.rows} searchable exportName={`leave-balances-${year}`} searchKeys={['name', 'emp_code']}
              toolbar={<select className="input w-auto" value={year} onChange={(e) => setYear(Number(e.target.value))}>{[year - 1, year, year + 1].map((y) => <option key={y}>{y}</option>)}</select>}
              columns={[{ key: 'name', label: 'Employee', render: (r) => <span className="font-medium">{r.name}</span> }, { key: 'emp_code', label: 'Code' },
                ...leave.data.types.flatMap((t) => [
                  { key: `u${t.id}`, label: `${t.code} used`, render: (r) => r.balances.find((b) => b.leave_type_id === t.id)?.used ?? 0, csv: (r) => r.balances.find((b) => b.leave_type_id === t.id)?.used ?? 0, sortable: false },
                  { key: `a${t.id}`, label: `${t.code} left`, render: (r) => r.balances.find((b) => b.leave_type_id === t.id)?.available ?? '—', csv: (r) => r.balances.find((b) => b.leave_type_id === t.id)?.available ?? '', sortable: false },
                ])]} />
          )}
        </Card>
      )}
    </div>
  );
}
