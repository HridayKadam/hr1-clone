import { useState } from 'react';
import dayjs from 'dayjs';
import { ChevronLeft, ChevronRight, Edit3, Plus } from 'lucide-react';
import { api, useApi, qs } from '../lib/api.js';
import { fmtDate, fmtTime, mins, todayStr, label, fmtMonth } from '../lib/format.js';
import { Badge, Card, FormModal, Loading, PageHeader, Table, Tabs, cx, useAction, Avatar } from '../components/ui.jsx';
import ClockWidget from '../components/ClockWidget.jsx';

const DAY_TONE = {
  present: 'bg-emerald-50 border-emerald-200 text-emerald-700', missing_out: 'bg-orange-50 border-orange-200 text-orange-700',
  half_day: 'bg-amber-50 border-amber-200 text-amber-700', short: 'bg-orange-50 border-orange-200 text-orange-700',
  absent: 'bg-rose-50 border-rose-200 text-rose-700', leave: 'bg-indigo-50 border-indigo-200 text-indigo-700', half_leave: 'bg-indigo-50 border-indigo-200 text-indigo-700',
  holiday: 'bg-fuchsia-50 border-fuchsia-200 text-fuchsia-700', weekoff: 'bg-slate-50 border-slate-200 text-slate-400',
  upcoming: 'bg-white border-slate-100 text-slate-300', na: 'bg-white border-slate-100 text-slate-300',
};

export function MonthNav({ month, setMonth }) {
  return (
    <div className="flex items-center gap-1">
      <button className="btn-secondary btn-sm" onClick={() => setMonth(dayjs(`${month}-01`).subtract(1, 'month').format('YYYY-MM'))}><ChevronLeft size={14} /></button>
      <span className="w-32 text-center text-sm font-medium">{fmtMonth(month)}</span>
      <button className="btn-secondary btn-sm" onClick={() => setMonth(dayjs(`${month}-01`).add(1, 'month').format('YYYY-MM'))}><ChevronRight size={14} /></button>
    </div>
  );
}

export function AttendanceCalendar({ days, onDayClick }) {
  const lead = (dayjs(days[0].date).day() + 6) % 7; // Monday-first grid
  const t = todayStr();
  return (
    <div>
      <div className="mb-2 grid grid-cols-7 gap-1.5 text-center text-[11px] font-semibold uppercase text-slate-400">{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <div key={d}>{d}</div>)}</div>
      <div className="grid grid-cols-7 gap-1.5">
        {Array.from({ length: lead }).map((_, i) => <div key={`x${i}`} />)}
        {days.map((d) => (
          <button key={d.date} onClick={() => onDayClick?.(d)} title={label(d.status)}
            className={cx('flex min-h-[64px] flex-col rounded-lg border p-1.5 text-left transition hover:shadow-sm', DAY_TONE[d.status] || 'bg-white border-slate-100', d.date === t && 'ring-2 ring-brand-500')}>
            <span className="text-xs font-semibold">{dayjs(d.date).date()}</span>
            <span className="mt-auto truncate text-[10px] leading-tight">
              {d.check_in ? `${fmtTime(d.check_in).replace(' ', '').toLowerCase()}${d.work_minutes ? ` · ${(d.work_minutes / 60).toFixed(1)}h` : ''}` : d.status === 'holiday' ? d.holiday : d.leave ? d.leave : d.status === 'absent' ? 'Absent' : d.status === 'weekoff' ? 'Off' : ''}
            </span>
            {d.late && <span className="text-[9px] font-semibold uppercase text-amber-600">Late</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

export function MyAttendance() {
  const [month, setMonth] = useState(dayjs().format('YYYY-MM'));
  const [tab, setTab] = useState('calendar');
  const sheet = useApi(`/attendance/month?month=${month}`);
  const regs = useApi('/attendance/regularizations');
  const [reg, setReg] = useState(null);
  const act = useAction();
  const s = sheet.data?.summary;
  return (
    <div>
      <PageHeader title="My attendance" subtitle="Clock in, review your monthly attendance and fix missed punches." actions={<button className="btn-secondary" onClick={() => setReg({ date: todayStr() })}><Edit3 size={15} />Regularize</button>} />
      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <div className="space-y-6">
          <ClockWidget onChange={sheet.reload} />
          {s && (
            <Card title={`Summary · ${fmtMonth(month)}`} bodyClass="grid grid-cols-2 gap-3 p-4 text-sm">
              {[['Present', s.present, 'text-emerald-600'], ['Absent', s.absent, 'text-rose-600'], ['Leave', s.leave, 'text-indigo-600'], ['Late marks', s.late, 'text-amber-600'],
                ['Holidays', s.holidays, 'text-fuchsia-600'], ['Avg. hours', mins(s.avg_minutes), 'text-slate-700']].map(([k, v, c]) => (
                <div key={k} className="rounded-lg bg-slate-50 p-2.5"><div className="text-xs text-slate-500">{k}</div><div className={cx('text-base font-semibold', c)}>{v}</div></div>
              ))}
            </Card>
          )}
        </div>
        <Card className="min-w-0" title={<Tabs className="!mb-0 border-0" tabs={[{ key: 'calendar', label: 'Calendar' }, { key: 'list', label: 'Daily log' }, { key: 'requests', label: 'Regularizations', count: regs.data?.filter((r) => r.status === 'pending').length }]} value={tab} onChange={setTab} />}
          action={tab !== 'requests' && <MonthNav month={month} setMonth={setMonth} />} bodyClass={tab === 'calendar' ? 'p-4' : ''}>
          {!sheet.data ? <Loading /> : tab === 'calendar' ? (
            <>
              <AttendanceCalendar days={sheet.data.days} onDayClick={(d) => ['absent', 'missing_out', 'short', 'half_day', 'present'].includes(d.status) && setReg({ date: d.date, check_in: d.check_in?.slice(0, 5) || sheet.data.shift.start_time, check_out: d.check_out?.slice(0, 5) || sheet.data.shift.end_time })} />
              <p className="mt-3 text-xs text-slate-400">Tip: click a day to request a regularization for missed or incorrect punches.</p>
            </>
          ) : tab === 'list' ? (
            <Table rows={sheet.data.days.filter((d) => !['upcoming', 'na'].includes(d.status)).reverse()} exportName={`attendance-${month}`} dense columns={[
              { key: 'date', label: 'Date', render: (d) => <span className="font-medium">{fmtDate(d.date, 'ddd, D MMM')}</span> },
              { key: 'status', label: 'Status', render: (d) => <div className="flex gap-1"><Badge status={d.status} />{d.late && <Badge status="pending">Late</Badge>}</div> },
              { key: 'check_in', label: 'In', render: (d) => fmtTime(d.check_in) },
              { key: 'check_out', label: 'Out', render: (d) => fmtTime(d.check_out) },
              { key: 'work_minutes', label: 'Hours', render: (d) => mins(d.work_minutes) },
              { key: 'work_from', label: 'Mode', render: (d) => <span className="capitalize">{d.work_from || '—'}</span> },
            ]} />
          ) : (
            <Table rows={regs.data} empty={<p className="py-10 text-center text-sm text-slate-400">No regularization requests</p>} columns={[
              { key: 'date', label: 'Date', render: (r) => fmtDate(r.date) },
              { key: 'check_in', label: 'Requested', render: (r) => `${fmtTime(r.check_in)} – ${fmtTime(r.check_out)}` },
              { key: 'reason', label: 'Reason' },
              { key: 'status', label: 'Status', render: (r) => <Badge status={r.status} /> },
              { key: 'comment', label: 'Comment', render: (r) => r.comment || '—' },
              { key: 'x', label: '', render: (r) => r.status === 'pending' && <button className="text-xs font-medium text-rose-600 hover:underline" onClick={() => act(() => api.del(`/attendance/regularizations/${r.id}`).then(regs.reload), 'Request withdrawn')}>Withdraw</button> },
            ]} />
          )}
        </Card>
      </div>
      <FormModal open={!!reg} onClose={() => setReg(null)} title="Regularize attendance" initial={reg} submitLabel="Submit request"
        fields={[
          { name: 'date', label: 'Date', type: 'date', required: true, max: todayStr(), col: 2 },
          { name: 'check_in', label: 'Clock in', type: 'time', required: true }, { name: 'check_out', label: 'Clock out', type: 'time' },
          { name: 'reason', label: 'Reason', type: 'textarea', required: true, col: 2, placeholder: 'e.g. Forgot to clock in, client visit' },
        ]}
        onSubmit={async (v) => { await api.post('/attendance/regularizations', v); regs.reload(); setTab('requests'); return 'Request sent to your manager'; }} />
    </div>
  );
}

export function DailyMuster({ date, setDate, hr }) {
  const { data, reload } = useApi(`/attendance/daily${qs({ date })}`);
  const [filter, setFilter] = useState('');
  const [manual, setManual] = useState(null);
  const rows = data?.filter((r) => !filter || r.status === filter || (filter === 'late' && r.late));
  const count = (s) => data?.filter((r) => r.status === s).length || 0;
  return (
    <Card bodyClass="p-0">
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-4 py-3">
        <input type="date" className="input w-auto" value={date} onChange={(e) => setDate(e.target.value)} />
        <div className="flex flex-wrap gap-1.5 text-xs">
          {[['', 'All', data?.length], ['present', 'Present', count('present') + count('missing_out')], ['not_in', 'Not in', count('not_in')], ['absent', 'Absent', count('absent')],
            ['leave', 'On leave', count('leave') + count('half_leave')], ['late', 'Late', data?.filter((r) => r.late).length]].map(([k, l, n]) => (
            <button key={k} onClick={() => setFilter(k)} className={cx('rounded-full border px-2.5 py-1 font-medium', filter === k ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50')}>{l} · {n ?? 0}</button>
          ))}
        </div>
        <div className="flex-1" />
        {hr && <button className="btn-secondary btn-sm" onClick={() => setManual({ date })}><Plus size={14} />Manual entry</button>}
      </div>
      <Table rows={rows} searchable exportName={`muster-${date}`} dense searchKeys={['first_name', 'last_name', 'emp_code', 'department']} columns={[
        { key: 'first_name', label: 'Employee', render: (r) => <div className="flex items-center gap-2.5"><Avatar name={`${r.first_name} ${r.last_name || ''}`} size="xs" /><span className="font-medium">{r.first_name} {r.last_name}</span><span className="text-xs text-slate-400">{r.emp_code}</span></div>, csv: (r) => `${r.first_name} ${r.last_name || ''}` },
        { key: 'department', label: 'Department' },
        { key: 'status', label: 'Status', render: (r) => <div className="flex gap-1"><Badge status={r.status}>{r.leave && ['leave', 'half_leave'].includes(r.status) ? `Leave · ${r.leave}` : undefined}</Badge>{r.late && <Badge status="pending">Late</Badge>}</div> },
        { key: 'check_in', label: 'In', render: (r) => fmtTime(r.check_in) },
        { key: 'check_out', label: 'Out', render: (r) => fmtTime(r.check_out) },
        { key: 'work_minutes', label: 'Hours', render: (r) => mins(r.work_minutes) },
        { key: 'work_from', label: 'Mode', render: (r) => <span className="capitalize">{r.work_from || '—'}</span> },
        ...(hr ? [{ key: 'x', label: '', csv: false, render: (r) => <button className="text-xs font-medium text-brand-600 hover:underline" onClick={() => setManual({ employee_id: r.id, date, check_in: r.check_in?.slice(0, 5), check_out: r.check_out?.slice(0, 5) })}>Edit</button> }] : []),
      ]} />
      <FormModal open={!!manual} onClose={() => setManual(null)} title="Manual attendance entry" initial={manual}
        fields={[{ name: 'employee_id', label: 'Employee', type: 'employee', required: true, col: 2 }, { name: 'date', label: 'Date', type: 'date', required: true, col: 2 },
          { name: 'check_in', label: 'Clock in', type: 'time' }, { name: 'check_out', label: 'Clock out', type: 'time' }, { name: 'note', label: 'Note', col: 2 }]}
        onSubmit={async (v) => { await api.post('/attendance/manual', v); reload(); return 'Attendance updated'; }} />
    </Card>
  );
}

export function AdminAttendance() {
  const [tab, setTab] = useState('daily');
  const [date, setDate] = useState(todayStr());
  const [month, setMonth] = useState(dayjs().format('YYYY-MM'));
  const report = useApi(tab === 'monthly' ? `/reports/attendance?month=${month}` : null);
  return (
    <div>
      <PageHeader title="Attendance" subtitle="Daily muster, manual corrections and monthly attendance summary." />
      <Tabs tabs={[{ key: 'daily', label: 'Daily muster' }, { key: 'monthly', label: 'Monthly summary' }]} value={tab} onChange={setTab} />
      {tab === 'daily' ? <DailyMuster date={date} setDate={setDate} hr /> : (
        <Card bodyClass="p-0">
          <Table rows={report.data} searchable exportName={`attendance-summary-${month}`} toolbar={<MonthNav month={month} setMonth={setMonth} />} columns={[
            { key: 'name', label: 'Employee', render: (r) => <span className="font-medium">{r.name}</span> }, { key: 'emp_code', label: 'Code' }, { key: 'department', label: 'Department' },
            { key: 'present', label: 'Present' }, { key: 'absent', label: 'Absent', render: (r) => <span className={r.absent ? 'font-medium text-rose-600' : ''}>{r.absent}</span> },
            { key: 'leave', label: 'Leave' }, { key: 'late', label: 'Late' }, { key: 'missing_out', label: 'No clock-out' }, { key: 'avg_minutes', label: 'Avg hours', render: (r) => mins(r.avg_minutes), csv: (r) => (r.avg_minutes / 60).toFixed(2) },
          ]} />
        </Card>
      )}
    </div>
  );
}
