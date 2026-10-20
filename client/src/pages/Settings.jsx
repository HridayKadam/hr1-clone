import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { api, useApi } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { fmtDate, fmtTime, fmtDateTime } from '../lib/format.js';
import { Badge, Card, Form, FormModal, Loading, PageHeader, Table, Spinner, useToast, useAction, invalidate, cx } from '../components/ui.jsx';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const MASTERS = {
  departments: { title: 'Departments', fields: [{ name: 'name', label: 'Name', required: true, col: 2 }], cols: [{ key: 'name', label: 'Name' }] },
  designations: { title: 'Designations', fields: [{ name: 'name', label: 'Name', required: true, col: 2 }], cols: [{ key: 'name', label: 'Name' }] },
  locations: {
    title: 'Locations', hint: 'Set latitude/longitude and radius to enable geo-fenced office clock-in.',
    fields: [{ name: 'name', label: 'Name', required: true, col: 2 }, { name: 'lat', label: 'Latitude', type: 'number', step: 'any' }, { name: 'lng', label: 'Longitude', type: 'number', step: 'any' }, { name: 'radius_m', label: 'Geo-fence radius (m)', type: 'number' }],
    cols: [{ key: 'name', label: 'Name' }, { key: 'lat', label: 'Coordinates', render: (r) => (r.lat != null ? `${r.lat}, ${r.lng}` : '—') }, { key: 'radius_m', label: 'Radius', render: (r) => (r.radius_m ? `${r.radius_m} m` : '—') }],
  },
  shifts: {
    title: 'Shifts',
    fields: [{ name: 'name', label: 'Name', required: true, col: 2 }, { name: 'start_time', label: 'Start', type: 'time', required: true }, { name: 'end_time', label: 'End', type: 'time', required: true },
      { name: 'grace_minutes', label: 'Late grace (min)', type: 'number' }, { name: 'half_day_minutes', label: 'Min. minutes for half day', type: 'number' }, { name: 'full_day_minutes', label: 'Min. minutes for full day', type: 'number' },
      { name: 'week_offs', label: 'Week-offs', hint: 'Comma-separated day numbers: 0 = Sunday … 6 = Saturday. e.g. "0,6" or "0"' }],
    cols: [{ key: 'name', label: 'Name' }, { key: 'start_time', label: 'Timing', render: (r) => `${fmtTime(r.start_time)} – ${fmtTime(r.end_time)}` }, { key: 'grace_minutes', label: 'Grace', render: (r) => `${r.grace_minutes} min` },
      { key: 'week_offs', label: 'Week-offs', render: (r) => String(r.week_offs || '').split(',').filter(Boolean).map((d) => DAYS[d]).join(', ') }],
  },
  holidays: {
    title: 'Holidays', initial: { optional: 0 },
    fields: [{ name: 'name', label: 'Holiday', required: true, col: 2 }, { name: 'date', label: 'Date', type: 'date', required: true }, { name: 'optional', label: 'Optional / restricted holiday', type: 'checkbox' }],
    cols: [{ key: 'date', label: 'Date', render: (r) => fmtDate(r.date, 'ddd, D MMM YYYY') }, { key: 'name', label: 'Holiday' }, { key: 'optional', label: 'Type', render: (r) => (r.optional ? <Badge>Optional</Badge> : <Badge status="open">Mandatory</Badge>) }],
  },
  leave_types: {
    title: 'Leave types', initial: { paid: 1, active: 1, allow_half_day: 1, color: '#6366f1' },
    fields: [{ name: 'name', label: 'Name', required: true }, { name: 'code', label: 'Code', required: true }, { name: 'annual_quota', label: 'Annual quota (days)', type: 'number', step: 0.5 },
      { name: 'color', label: 'Colour', type: 'color' }, { name: 'max_carry', label: 'Max carry-forward days', type: 'number' }, { name: 'paid', label: 'Paid (unpaid leave = loss of pay)', type: 'checkbox' },
      { name: 'carry_forward', label: 'Carry forward unused balance', type: 'checkbox' }, { name: 'allow_half_day', label: 'Allow half day', type: 'checkbox' }, { name: 'active', label: 'Active', type: 'checkbox' }],
    cols: [{ key: 'name', label: 'Name', render: (r) => <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: r.color }} />{r.name}</span> }, { key: 'code', label: 'Code' },
      { key: 'annual_quota', label: 'Quota' }, { key: 'paid', label: 'Paid', render: (r) => (r.paid ? 'Yes' : 'No (LOP)') }, { key: 'carry_forward', label: 'Carry fwd', render: (r) => (r.carry_forward ? `Up to ${r.max_carry}` : 'No') },
      { key: 'active', label: 'Status', render: (r) => <Badge status={r.active ? 'active' : 'closed'}>{r.active ? 'Active' : 'Inactive'}</Badge> }],
  },
  projects: {
    title: 'Projects', hint: 'Projects employees can log timesheet hours against.', initial: { active: 1 },
    fields: [{ name: 'name', label: 'Project', required: true, col: 2 }, { name: 'client', label: 'Client' }, { name: 'active', label: 'Active', type: 'checkbox' }],
    cols: [{ key: 'name', label: 'Project' }, { key: 'client', label: 'Client' }, { key: 'active', label: 'Status', render: (r) => <Badge status={r.active ? 'active' : 'closed'}>{r.active ? 'Active' : 'Archived'}</Badge> }],
  },
  task_templates: {
    title: 'Checklist templates', hint: 'Copied into a new employee\'s onboarding checklist, or into offboarding when a resignation is approved. Due offset is days from joining / last working day.', initial: { kind: 'onboarding', owner: 'hr', due_offset_days: 0 },
    fields: [{ name: 'title', label: 'Task', required: true, col: 2 }, { name: 'kind', label: 'Checklist', type: 'select', noEmpty: true, options: ['onboarding', 'offboarding'] },
      { name: 'owner', label: 'Owner', type: 'select', noEmpty: true, options: ['hr', 'manager', 'employee', 'it'] }, { name: 'due_offset_days', label: 'Due offset (days)', type: 'number' }],
    cols: [{ key: 'kind', label: 'Checklist', render: (r) => <Badge status={r.kind === 'onboarding' ? 'open' : 'pending'}>{r.kind}</Badge> }, { key: 'title', label: 'Task' }, { key: 'owner', label: 'Owner' }, { key: 'due_offset_days', label: 'Due offset', render: (r) => `${r.due_offset_days > 0 ? '+' : ''}${r.due_offset_days} days` }],
  },
};

function MasterTable({ table }) {
  const c = MASTERS[table];
  const { data, reload } = useApi(`/masters/${table}`);
  const [edit, setEdit] = useState(null);
  const toast = useToast(); const act = useAction();
  const done = () => { invalidate(`/masters/${table}`); reload(); };
  return (
    <Card title={c.title} subtitle={c.hint} action={<button className="btn-primary btn-sm" onClick={() => setEdit(c.initial || {})}><Plus size={14} />Add</button>} bodyClass="p-0">
      <Table rows={data} onRowClick={setEdit} dense columns={[...c.cols, { key: 'x', label: '', render: (r) => (
        <button className="text-slate-400 hover:text-rose-600" onClick={async (e) => { e.stopPropagation(); if (await toast.confirm(`Delete "${r.name || r.title}"?`)) act(() => api.del(`/masters/${table}/${r.id}`).then(done), 'Deleted'); }}><Trash2 size={14} /></button>) }]} />
      <FormModal open={!!edit} onClose={() => setEdit(null)} title={`${edit?.id ? 'Edit' : 'Add'} ${c.title.toLowerCase().replace(/s$/, '')}`} initial={edit} fields={c.fields}
        onSubmit={async (v) => { if (v.id) await api.put(`/masters/${table}/${v.id}`, v); else await api.post(`/masters/${table}`, v); done(); return 'Saved'; }} />
    </Card>
  );
}

const SETTING_GROUPS = {
  company: { title: 'Company', fields: [{ name: 'company_name', label: 'Company name', required: true, col: 2 }, { name: 'company_address', label: 'Registered address', type: 'textarea', col: 2, hint: 'Shown on payslips and letters' }] },
  payroll: {
    title: 'Payroll & statutory', fields: [
      { name: 'basic_pct', label: 'Basic (% of CTC)', type: 'number' }, { name: 'hra_pct', label: 'HRA (% of basic)', type: 'number', hint: '50% for metro cities, 40% otherwise' },
      { name: 'pf_wage_cap', label: 'PF wage ceiling (₹)', type: 'number', hint: 'PF is 12% of basic up to this ceiling' }, { name: 'esi_gross_limit', label: 'ESI gross limit (₹/month)', type: 'number' },
      { name: 'pt_amount', label: 'Professional tax (₹/month)', type: 'number', hint: 'Applied when gross ≥ ₹15,000. ₹200 becomes ₹300 in February.' },
      { name: 'lop_from_attendance', label: 'Treat unmarked working days as loss of pay', type: 'checkbox', col: 2 }] },
  attendance: { title: 'Attendance', fields: [{ name: 'geo_fencing', label: 'Enforce geo-fencing for office clock-ins (configure coordinates in Locations)', type: 'checkbox', col: 2 }] },
  lists: {
    title: 'Categories', fields: [{ name: 'expense_categories', label: 'Expense categories', col: 2, hint: 'Comma-separated' }, { name: 'ticket_categories', label: 'Helpdesk categories', col: 2 }, { name: 'asset_categories', label: 'Asset categories', col: 2 }] },
};

function SettingsForm({ group }) {
  const { user } = useAuth();
  const { data } = useApi('/masters/settings');
  const [v, setV] = useState(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const { refresh } = useAuth();
  useEffect(() => { if (data) setV(data); }, [data]);
  if (!v) return <Loading />;
  const g = SETTING_GROUPS[group];
  const save = async () => {
    setBusy(true);
    try { await api.put('/masters/settings', Object.fromEntries(g.fields.map((f) => [f.name, v[f.name]]))); toast.success('Settings saved'); invalidate('/masters/settings'); refresh(); } catch (e) { toast.error(e); } finally { setBusy(false); }
  };
  return (
    <Card title={g.title} action={user.role === 'admin' ? <button className="btn-primary btn-sm" disabled={busy} onClick={save}>{busy && <Spinner className="!text-white" />}Save</button> : <span className="text-xs text-slate-400">Admins only</span>}>
      <Form fields={g.fields} values={v} setValues={setV} />
    </Card>
  );
}

function AuditLog() {
  const { data } = useApi('/masters/audit-log');
  return (
    <Card title="Audit log" subtitle="Last 300 sensitive actions" bodyClass="p-0">
      <Table rows={data} dense searchable exportName="audit-log" searchKeys={['actor', 'action', 'entity']} columns={[
        { key: 'at', label: 'When', render: (r) => fmtDateTime(r.at) }, { key: 'actor', label: 'By' }, { key: 'action', label: 'Action', render: (r) => <Badge>{r.action}</Badge> },
        { key: 'entity', label: 'Entity', render: (r) => `${r.entity}${r.entity_id ? ` #${r.entity_id}` : ''}` }, { key: 'detail', label: 'Detail', render: (r) => <code className="text-xs text-slate-500">{r.detail}</code> },
      ]} />
    </Card>
  );
}

export function SettingsPage() {
  const { user } = useAuth();
  const [section, setSection] = useState('company');
  const groups = [
    ['General', [['company', 'Company'], ['payroll', 'Payroll & statutory'], ['attendance', 'Attendance'], ['lists', 'Categories']]],
    ['Organisation', [['departments', 'Departments'], ['designations', 'Designations'], ['locations', 'Locations']]],
    ['Time & leave', [['shifts', 'Shifts'], ['holidays', 'Holidays'], ['leave_types', 'Leave types'], ['projects', 'Projects']]],
    ['Workflows', [['task_templates', 'Checklist templates'], ...(user.role === 'admin' ? [['audit', 'Audit log']] : [])]],
  ];
  return (
    <div>
      <PageHeader title="Settings" subtitle="Configure your workspace." />
      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
        <nav className="space-y-4">
          {groups.map(([title, items]) => (
            <div key={title}>
              <div className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{title}</div>
              {items.map(([k, l]) => <button key={k} onClick={() => setSection(k)} className={cx('block w-full rounded-lg px-3 py-1.5 text-left text-sm', section === k ? 'bg-white font-medium text-brand-700 shadow-sm ring-1 ring-slate-200' : 'text-slate-600 hover:bg-white')}>{l}</button>)}
            </div>
          ))}
        </nav>
        <div className="min-w-0">{SETTING_GROUPS[section] ? <SettingsForm key={section} group={section} /> : section === 'audit' ? <AuditLog /> : <MasterTable key={section} table={section} />}</div>
      </div>
    </div>
  );
}
