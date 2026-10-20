import { useEffect, useState } from 'react';
import dayjs from 'dayjs';
import { Plus, RefreshCw } from 'lucide-react';
import { api, useApi, qs } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { fmtDate, todayStr } from '../lib/format.js';
import { Badge, Card, FormModal, Loading, PageHeader, Table, Tabs, useAction, useToast, Avatar, Modal } from '../components/ui.jsx';
import { MonthNav } from './Attendance.jsx';

function ApplyLeave({ open, onClose, balances, onDone, forEmployee }) {
  const [preview, setPreview] = useState(null);
  const [vals, setVals] = useState({});
  useEffect(() => {
    if (!vals.from_date) { setPreview(null); return; }
    api.post('/leave/preview', { from_date: vals.from_date, to_date: vals.half_day ? vals.from_date : vals.to_date || vals.from_date, half_day: vals.half_day }).then((r) => setPreview(r.days)).catch(() => {});
  }, [vals.from_date, vals.to_date, vals.half_day]);
  const type = balances?.find((b) => String(b.leave_type_id) === String(vals.leave_type_id));
  return (
    <FormModal open={open} onClose={onClose} title={forEmployee ? 'Apply leave on behalf' : 'Apply for leave'} submitLabel="Apply" initial={{ from_date: todayStr() }} onChange={setVals}
      fields={[
        ...(forEmployee ? [{ name: 'employee_id', label: 'Employee', type: 'employee', required: true, col: 2 }] : []),
        { name: 'leave_type_id', label: 'Leave type', type: 'select', required: true, col: 2, options: (balances || []).map((b) => ({ value: b.leave_type_id, label: b.paid && b.available != null && !forEmployee ? `${b.name} — ${b.available} available` : b.name })) },
        { name: 'from_date', label: 'From', type: 'date', required: true, onSet: (v, s) => (!s.to_date || s.to_date < v ? { to_date: v } : {}) },
        { name: 'to_date', label: 'To', type: 'date', show: (v) => !Number(v.half_day) },
        { name: 'half_day', label: 'Half day', type: 'checkbox', col: 2, show: () => !type || type.allow_half_day },
        { name: 'reason', label: 'Reason', type: 'textarea', col: 2, placeholder: 'Optional, visible to your manager' },
      ]}
      onSubmit={async (v) => { await api.post('/leave/requests', { ...v, to_date: Number(v.half_day) ? v.from_date : v.to_date }); onDone(); return forEmployee ? 'Leave recorded' : 'Leave request sent for approval'; }}>
      {preview != null && <div className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-800">This will use <b>{preview}</b> working day{preview === 1 ? '' : 's'} (week-offs and holidays excluded).</div>}
    </FormModal>
  );
}

export function WhoIsOut() {
  const [month, setMonth] = useState(dayjs().format('YYYY-MM'));
  const { data } = useApi(`/leave/calendar?month=${month}`);
  const days = dayjs(`${month}-01`).daysInMonth();
  const people = data ? [...new Map(data.map((l) => [l.employee_id, l.employee_name])).entries()] : [];
  return (
    <Card title="Team leave calendar" action={<MonthNav month={month} setMonth={setMonth} />} bodyClass="p-0">
      {!data ? <Loading /> : !people.length ? <p className="py-10 text-center text-sm text-slate-400">No one is on leave this month</p> : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead><tr><th className="sticky left-0 bg-white px-3 py-2 text-left font-semibold text-slate-500">Employee</th>
              {Array.from({ length: days }).map((_, i) => { const d = dayjs(`${month}-01`).add(i, 'day'); return <th key={i} className={`w-7 px-0.5 py-2 text-center font-medium ${[0, 6].includes(d.day()) ? 'text-slate-300' : 'text-slate-500'}`}>{i + 1}</th>; })}</tr></thead>
            <tbody>
              {people.map(([id, name]) => (
                <tr key={id} className="border-t border-slate-100">
                  <td className="sticky left-0 whitespace-nowrap bg-white px-3 py-2 font-medium text-slate-700">{name}</td>
                  {Array.from({ length: days }).map((_, i) => {
                    const d = dayjs(`${month}-01`).add(i, 'day').format('YYYY-MM-DD');
                    const l = data.find((x) => x.employee_id === id && d >= x.from_date && d <= x.to_date);
                    return <td key={i} className="px-0.5 py-1.5 text-center">{l && <div title={`${l.leave_type} (${l.status})`} className="mx-auto h-5 w-5 rounded text-[9px] font-bold leading-5 text-white" style={{ background: l.color, opacity: l.status === 'pending' ? 0.45 : 1 }}>{l.code[0]}</div>}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="px-3 py-2 text-xs text-slate-400">Faded = pending approval</p>
        </div>
      )}
    </Card>
  );
}

const requestCols = (onCancel, showEmp) => [
  ...(showEmp ? [{ key: 'employee_name', label: 'Employee', render: (r) => <div className="flex items-center gap-2"><Avatar name={r.employee_name} size="xs" /><span className="font-medium">{r.employee_name}</span></div> }] : []),
  { key: 'leave_type', label: 'Type', render: (r) => <Badge color={r.color}>{r.leave_type}</Badge> },
  { key: 'from_date', label: 'Dates', render: (r) => <span>{fmtDate(r.from_date)}{r.to_date !== r.from_date && ` → ${fmtDate(r.to_date)}`}{r.half_day ? ' (½)' : ''}</span> },
  { key: 'days', label: 'Days' },
  { key: 'reason', label: 'Reason', render: (r) => <span className="line-clamp-1 max-w-xs">{r.reason || '—'}</span> },
  { key: 'status', label: 'Status', render: (r) => <Badge status={r.status} /> },
  { key: 'approver_name', label: 'By', render: (r) => (r.approver_name?.trim() ? <span title={r.comment || ''}>{r.approver_name}</span> : '—') },
  { key: 'x', label: '', csv: false, render: (r) => onCancel && (r.status === 'pending' || (r.status === 'approved' && (showEmp || r.from_date > todayStr()))) && <button className="text-xs font-medium text-rose-600 hover:underline" onClick={() => onCancel(r)}>Cancel</button> },
];

export function MyLeave() {
  const bal = useApi('/leave/balances');
  const reqs = useApi('/leave/requests');
  const [open, setOpen] = useState(false);
  const toast = useToast();
  const act = useAction();
  const cancel = async (r) => { if (await toast.confirm(`Cancel your ${r.leave_type} from ${fmtDate(r.from_date)}?`)) act(() => api.del(`/leave/requests/${r.id}`).then(() => { reqs.reload(); bal.reload(); }), 'Leave cancelled'); };
  return (
    <div className="space-y-6">
      <PageHeader title="My leave" subtitle={`Leave year ${dayjs().year()}`} actions={<button className="btn-primary" onClick={() => setOpen(true)}><Plus size={16} />Apply leave</button>} />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        {!bal.data ? <Loading /> : bal.data.map((b) => (
          <div key={b.leave_type_id} className="card p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-700"><span className="h-2.5 w-2.5 rounded-full" style={{ background: b.color }} />{b.name}</div>
            {b.paid ? (
              <>
                <div className="mt-2 text-2xl font-semibold">{b.available}<span className="text-sm font-normal text-slate-400"> days left</span></div>
                <div className="mt-2 flex gap-3 text-xs text-slate-500"><span>Quota {b.allocated}</span><span>Used {b.used}</span>{b.pending > 0 && <span className="text-amber-600">Pending {b.pending}</span>}</div>
              </>
            ) : <div className="mt-2 text-2xl font-semibold">{b.used}<span className="text-sm font-normal text-slate-400"> days taken</span></div>}
          </div>
        ))}
      </div>
      <Card title="My requests" bodyClass="p-0"><Table rows={reqs.data} columns={requestCols(cancel)} exportName="my-leave" empty={<p className="py-10 text-center text-sm text-slate-400">You haven't applied for leave yet</p>} /></Card>
      <WhoIsOut />
      <ApplyLeave open={open} onClose={() => setOpen(false)} balances={bal.data} onDone={() => { reqs.reload(); bal.reload(); }} />
    </div>
  );
}

function Allocations() {
  const [year, setYear] = useState(dayjs().year());
  const { data, reload } = useApi(`/leave/allocations?year=${year}`);
  const [edit, setEdit] = useState(null);
  const [roll, setRoll] = useState(false);
  const toast = useToast();
  if (!data) return <Loading />;
  return (
    <Card bodyClass="p-0">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3">
        <select className="input w-auto" value={year} onChange={(e) => setYear(Number(e.target.value))}>{[year - 1, year, year + 1].map((y) => <option key={y}>{y}</option>)}</select>
        <span className="text-xs text-slate-500">Click a cell to change an employee's quota. Defaults come from the leave type (pro-rated for joiners).</span>
        <div className="flex-1" />
        <button className="btn-secondary btn-sm" onClick={() => setRoll(true)}><RefreshCw size={14} />Year-end rollover</button>
      </div>
      <Table rows={data.rows} searchable searchKeys={['first_name', 'last_name', 'emp_code']} dense columns={[
        { key: 'first_name', label: 'Employee', render: (r) => <span className="font-medium">{r.first_name} {r.last_name}</span> },
        ...data.types.filter((t) => t.paid).map((t) => ({ key: `t${t.id}`, label: t.code, sortable: false, render: (r) => { const b = r.balances.find((x) => x.leave_type_id === t.id); return <button className="rounded px-2 py-0.5 hover:bg-brand-50" onClick={() => setEdit({ employee_id: r.id, name: r.first_name, leave_type_id: t.id, type: t.name, days: b.allocated, year })}><b>{b.available}</b><span className="text-slate-400"> / {b.allocated}</span></button>; }, csv: (r) => r.balances.find((x) => x.leave_type_id === t.id)?.available })),
      ]} />
      <FormModal open={!!edit} onClose={() => setEdit(null)} title={edit && `${edit.type} quota for ${edit.name} (${edit.year})`} initial={edit}
        fields={[{ name: 'days', label: 'Allocated days', type: 'number', step: 0.5, required: true, col: 2 }]}
        onSubmit={async (v) => { await api.put('/leave/allocations', v); reload(); return 'Allocation updated'; }} />
      <Modal open={roll} onClose={() => setRoll(false)} title={`Roll over to ${year + 1}`} size="sm"
        footer={<><button className="btn-secondary" onClick={() => setRoll(false)}>Cancel</button><button className="btn-primary" onClick={async () => { try { const r = await api.post('/leave/allocations/rollover', { year: year + 1 }); toast.success(`${r.allocations} allocations created for ${year + 1}`); setRoll(false); setYear(year + 1); } catch (e) { toast.error(e); } }}>Run rollover</button></>}>
        <p className="text-sm text-slate-600">This sets every active employee's {year + 1} quota to the leave type default, plus unused {year} balance for leave types that allow carry-forward (up to their max). Existing {year + 1} allocations are overwritten.</p>
      </Modal>
    </Card>
  );
}

export function AdminLeave() {
  const { user } = useAuth();
  const [tab, setTab] = useState('requests');
  const [status, setStatus] = useState('');
  const reqs = useApi(`/leave/requests${qs({ scope: 'all', status })}`);
  const types = useApi('/masters/leave_types');
  const [open, setOpen] = useState(false);
  const toast = useToast(); const act = useAction();
  const cancel = async (r) => { if (await toast.confirm(`Cancel ${r.employee_name}'s ${r.leave_type} from ${fmtDate(r.from_date)}?`)) act(() => api.del(`/leave/requests/${r.id}`).then(reqs.reload), 'Leave cancelled'); };
  return (
    <div>
      <PageHeader title="Leave management" actions={<button className="btn-primary" onClick={() => setOpen(true)}><Plus size={16} />Record leave</button>} />
      <Tabs tabs={[{ key: 'requests', label: 'All requests' }, { key: 'allocations', label: 'Balances & allocations' }, { key: 'calendar', label: 'Calendar' }]} value={tab} onChange={setTab} />
      {tab === 'requests' && (
        <Card bodyClass="p-0">
          <Table rows={reqs.data} searchable exportName="leave-requests" searchKeys={['employee_name', 'leave_type', 'reason']} columns={requestCols(cancel, true)}
            toolbar={<select className="input w-auto" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All statuses</option>{['pending', 'approved', 'rejected', 'cancelled'].map((s) => <option key={s} value={s}>{s}</option>)}</select>} />
        </Card>
      )}
      {tab === 'allocations' && <Allocations />}
      {tab === 'calendar' && <WhoIsOut />}
      <ApplyLeave open={open} onClose={() => setOpen(false)} forEmployee={user.is_hr} balances={types.data?.filter((t) => t.active).map((t) => ({ leave_type_id: t.id, name: t.name, allow_half_day: t.allow_half_day }))} onDone={reqs.reload} />
    </div>
  );
}
