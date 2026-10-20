import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, DoorOpen } from 'lucide-react';
import { api, useApi } from '../lib/api.js';
import { fmtDate, todayStr } from '../lib/format.js';
import { Avatar, Badge, Card, FormModal, PageHeader, ProgressBar, Table, Tabs, Empty, useAction, useToast } from '../components/ui.jsx';

export function Lifecycle() {
  const [tab, setTab] = useState('onboarding');
  const tasks = useApi(tab !== 'exits' ? `/lifecycle/tasks?scope=all&kind=${tab}` : null);
  const exits = useApi(tab === 'exits' ? '/lifecycle/resignations?scope=all' : null);
  const [add, setAdd] = useState(false);
  const toast = useToast(); const act = useAction();
  return (
    <div>
      <PageHeader title="Onboarding & exit" subtitle="Checklists are created automatically from templates when someone joins or their resignation is approved. Edit templates in Settings."
        actions={<button className="btn-secondary" onClick={() => setAdd(true)}><Plus size={15} />Add task</button>} />
      <Tabs tabs={[{ key: 'onboarding', label: 'Onboarding' }, { key: 'offboarding', label: 'Offboarding' }, { key: 'exits', label: 'Resignations' }]} value={tab} onChange={setTab} />
      {tab !== 'exits' ? (
        <Card bodyClass="p-0">
          <Table rows={tasks.data} empty={<Empty title={`No ${tab} in progress`} />} columns={[
            { key: 'employee_name', label: 'Employee', render: (r) => <Link to={`/people/${r.employee_id}`} className="flex items-center gap-2"><Avatar name={r.employee_name} size="sm" /><span className="font-medium hover:text-brand-700">{r.employee_name}</span></Link> },
            { key: 'doj', label: tab === 'onboarding' ? 'Joining' : 'Last day', render: (r) => fmtDate(tab === 'onboarding' ? r.doj : r.exit_date) },
            { key: 'progress', label: 'Progress', render: (r) => <div className="flex w-48 items-center gap-2"><ProgressBar value={(r.done / r.total) * 100} /><span className="text-xs text-slate-500">{r.done}/{r.total}</span></div> },
            { key: 'next_due', label: 'Next due', render: (r) => (r.next_due ? <span className={r.next_due < todayStr() ? 'font-medium text-rose-600' : ''}>{fmtDate(r.next_due)}</span> : <Badge status="completed">Done</Badge>) },
            { key: 'x', label: '', render: (r) => <Link to={`/people/${r.employee_id}`} className="text-xs font-medium text-brand-600 hover:underline">Open checklist</Link> },
          ]} />
        </Card>
      ) : (
        <Card bodyClass="p-0">
          <Table rows={exits.data} exportName="resignations" empty={<Empty icon={DoorOpen} title="No resignations" />} columns={[
            { key: 'employee_name', label: 'Employee', render: (r) => <Link to={`/people/${r.employee_id}`} className="font-medium hover:text-brand-700">{r.employee_name}</Link> },
            { key: 'resign_date', label: 'Resigned', render: (r) => fmtDate(r.resign_date) }, { key: 'last_working_day', label: 'Last working day', render: (r) => fmtDate(r.last_working_day) },
            { key: 'reason', label: 'Reason', render: (r) => <span className="line-clamp-1 max-w-xs">{r.reason || '—'}</span> }, { key: 'status', label: 'Status', render: (r) => <Badge status={r.status} /> },
            { key: 'x', label: '', csv: false, render: (r) => r.status === 'approved' && r.employee_status === 'active' && (
              <button className="btn-secondary btn-sm" onClick={async () => { if (await toast.confirm({ message: `Complete ${r.employee_name}'s exit? Their login will be disabled.`, confirmLabel: 'Complete exit' })) act(() => api.post(`/lifecycle/exit/${r.employee_id}`, { exit_date: r.last_working_day }).then(exits.reload), 'Exit completed'); }}>Complete exit</button>) },
          ]} />
        </Card>
      )}
      <FormModal open={add} onClose={() => setAdd(false)} title="Add checklist task" initial={{ kind: tab === 'exits' ? 'offboarding' : tab, owner: 'hr' }}
        fields={[{ name: 'employee_id', label: 'Employee', type: 'employee', required: true, col: 2 }, { name: 'title', label: 'Task', required: true, col: 2 },
          { name: 'kind', label: 'Checklist', type: 'select', noEmpty: true, options: ['onboarding', 'offboarding'] }, { name: 'owner', label: 'Owner', type: 'select', noEmpty: true, options: ['hr', 'manager', 'employee', 'it'] },
          { name: 'due_date', label: 'Due date', type: 'date' }]}
        onSubmit={async (v) => { await api.post('/lifecycle/tasks', v); tasks.reload(); return 'Task added'; }} />
    </div>
  );
}

export function MyExit() {
  const { data, reload } = useApi('/lifecycle/resignations');
  const tasks = useApi('/lifecycle/tasks?kind=offboarding');
  const [open, setOpen] = useState(false);
  const toast = useToast(); const act = useAction();
  const active = data?.find((r) => ['pending', 'approved'].includes(r.status));
  return (
    <div className="space-y-6">
      <PageHeader title="Resignation" subtitle="Submit your resignation and track your exit process." actions={!active && data && <button className="btn-secondary text-rose-600" onClick={() => setOpen(true)}><DoorOpen size={15} />Submit resignation</button>} />
      {active && (
        <Card title="Current resignation">
          <div className="flex flex-wrap items-center gap-6 text-sm">
            <div><div className="text-xs text-slate-500">Submitted</div><div className="font-medium">{fmtDate(active.resign_date)}</div></div>
            <div><div className="text-xs text-slate-500">Last working day</div><div className="font-medium">{fmtDate(active.last_working_day)}</div></div>
            <div><div className="text-xs text-slate-500">Status</div><Badge status={active.status} /></div>
            {active.status === 'pending' && <button className="btn-secondary btn-sm ml-auto" onClick={async () => { if (await toast.confirm({ message: 'Withdraw your resignation?', danger: false })) act(() => api.del(`/lifecycle/resignations/${active.id}`).then(reload), 'Resignation withdrawn'); }}>Withdraw</button>}
          </div>
          {active.comment && <p className="mt-3 text-sm text-slate-600">Manager comment: {active.comment}</p>}
        </Card>
      )}
      {tasks.data?.length > 0 && (
        <Card title="Exit checklist" bodyClass="divide-y divide-slate-100">
          {tasks.data.map((t) => <div key={t.id} className="flex items-center gap-3 px-5 py-3 text-sm"><input type="checkbox" readOnly checked={!!t.done} className="h-4 w-4 rounded" /><span className={t.done ? 'text-slate-400 line-through' : ''}>{t.title}</span><span className="ml-auto text-xs text-slate-400">{t.owner} · {fmtDate(t.due_date)}</span></div>)}
        </Card>
      )}
      {data && !data.length && <Card><Empty icon={DoorOpen} title="No resignation on file" hint="If you decide to move on, you can submit your resignation here. Your manager will be notified." /></Card>}
      {data?.filter((r) => r !== active).length > 0 && (
        <Card title="History" bodyClass="p-0"><Table rows={data.filter((r) => r !== active)} columns={[{ key: 'resign_date', label: 'Submitted', render: (r) => fmtDate(r.resign_date) }, { key: 'status', label: 'Status', render: (r) => <Badge status={r.status} /> }, { key: 'reason', label: 'Reason' }]} /></Card>
      )}
      <FormModal open={open} onClose={() => setOpen(false)} title="Submit resignation" submitLabel="Submit" initial={{ notice_days: 30 }}
        fields={[{ name: 'last_working_day', label: 'Proposed last working day', type: 'date', min: todayStr(), hint: 'Leave blank to use a 30-day notice period' }, { name: 'reason', label: 'Reason', type: 'textarea', col: 2 }]}
        onSubmit={async (v) => { await api.post('/lifecycle/resignations', v); reload(); return 'Resignation submitted to your manager'; }} />
    </div>
  );
}
