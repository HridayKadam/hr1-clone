import { useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { ChevronLeft, ChevronRight, Plus, Trash2 } from 'lucide-react';
import { api, useApi, qs } from '../lib/api.js';
import { fmtDate } from '../lib/format.js';
import { Badge, Card, FormModal, PageHeader, Table, useMaster, useAction, cx } from '../components/ui.jsx';

const monday = () => dayjs().startOf('day').subtract((dayjs().day() + 6) % 7, 'day');

export function MyTimesheet() {
  const [week, setWeek] = useState(monday);
  const from = week.format('YYYY-MM-DD'); const to = week.add(6, 'day').format('YYYY-MM-DD');
  const { data, reload } = useApi(`/work/timesheets${qs({ from, to })}`);
  const projects = useMaster('projects');
  const [open, setOpen] = useState(null);
  const act = useAction();
  const days = Array.from({ length: 7 }).map((_, i) => week.add(i, 'day').format('YYYY-MM-DD'));
  const grid = useMemo(() => {
    const m = new Map();
    (data || []).forEach((e) => { const k = e.project || 'General'; if (!m.has(k)) m.set(k, {}); m.get(k)[e.date] = (m.get(k)[e.date] || 0) + e.hours; });
    return [...m.entries()];
  }, [data]);
  const dayTotal = (d) => (data || []).filter((e) => e.date === d).reduce((s, e) => s + e.hours, 0);
  const total = (data || []).reduce((s, e) => s + e.hours, 0);
  return (
    <div className="space-y-6">
      <PageHeader title="Timesheet" subtitle="Log hours against projects. Your manager approves entries from their Inbox."
        actions={<button className="btn-primary" onClick={() => setOpen({ date: dayjs().format('YYYY-MM-DD') })}><Plus size={16} />Log time</button>} />
      <Card title={`Week of ${week.format('D MMM YYYY')}`} subtitle={`${total} hours logged`}
        action={<div className="flex gap-1"><button className="btn-secondary btn-sm" onClick={() => setWeek(week.subtract(7, 'day'))}><ChevronLeft size={14} /></button><button className="btn-secondary btn-sm" onClick={() => setWeek(monday())}>This week</button><button className="btn-secondary btn-sm" onClick={() => setWeek(week.add(7, 'day'))}><ChevronRight size={14} /></button></div>} bodyClass="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead><tr className="text-xs text-slate-500"><th className="py-2 pr-4 text-left font-semibold">Project</th>{days.map((d) => <th key={d} className={cx('w-20 py-2 text-center font-semibold', [0, 6].includes(dayjs(d).day()) && 'text-slate-300')}>{dayjs(d).format('ddd D')}</th>)}<th className="w-16 py-2 text-right font-semibold">Total</th></tr></thead>
          <tbody>
            {!grid.length && <tr><td colSpan={9} className="py-8 text-center text-slate-400">No time logged this week</td></tr>}
            {grid.map(([p, hrs]) => (
              <tr key={p} className="border-t border-slate-100"><td className="py-2 pr-4 font-medium">{p}</td>{days.map((d) => <td key={d} className="text-center">{hrs[d] || <span className="text-slate-200">–</span>}</td>)}<td className="text-right font-semibold">{Object.values(hrs).reduce((a, b) => a + b, 0)}</td></tr>
            ))}
            {grid.length > 0 && <tr className="border-t-2 border-slate-200 font-semibold"><td className="py-2">Total</td>{days.map((d) => <td key={d} className="text-center">{dayTotal(d) || ''}</td>)}<td className="text-right">{total}</td></tr>}
          </tbody>
        </table>
      </Card>
      <Card title="Entries" bodyClass="p-0">
        <Table rows={data} dense columns={[
          { key: 'date', label: 'Date', render: (r) => fmtDate(r.date, 'ddd, D MMM') }, { key: 'project', label: 'Project', render: (r) => r.project || 'General' },
          { key: 'hours', label: 'Hours' }, { key: 'description', label: 'Description' }, { key: 'status', label: 'Status', render: (r) => <Badge status={r.status} /> },
          { key: 'x', label: '', render: (r) => r.status !== 'approved' && <div className="flex gap-2"><button className="text-xs font-medium text-brand-600 hover:underline" onClick={() => setOpen(r)}>Edit</button><button className="text-rose-500" onClick={() => act(() => api.del(`/work/timesheets/${r.id}`).then(reload), 'Entry deleted')}><Trash2 size={14} /></button></div> },
        ]} empty={<p className="py-8 text-center text-sm text-slate-400">No entries this week</p>} />
      </Card>
      <FormModal open={!!open} onClose={() => setOpen(null)} title={open?.id ? 'Edit time entry' : 'Log time'} initial={open}
        fields={[
          { name: 'date', label: 'Date', type: 'date', required: true }, { name: 'hours', label: 'Hours', type: 'number', step: 0.25, min: 0.25, max: 24, required: true },
          { name: 'project_id', label: 'Project', type: 'select', col: 2, options: projects.filter((p) => p.active).map((p) => ({ value: p.id, label: `${p.name}${p.client ? ` · ${p.client}` : ''}` })), placeholder: 'General / no project' },
          { name: 'description', label: 'What did you work on?', type: 'textarea', col: 2 },
        ]}
        onSubmit={async (v) => { if (v.id) await api.put(`/work/timesheets/${v.id}`, v); else await api.post('/work/timesheets', v); reload(); return 'Time logged'; }} />
    </div>
  );
}
