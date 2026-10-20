import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Upload, LayoutGrid, List, Mail, Phone, ChevronDown, ChevronRight } from 'lucide-react';
import { api, useApi, qs } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { fmtDate, parseCSV, downloadCSV } from '../lib/format.js';
import { Avatar, Badge, Card, FormModal, Loading, Modal, PageHeader, Table, useMaster, useToast, cx, invalidate } from '../components/ui.jsx';

export const employeeFields = (m, isNew) => [
  { section: 'Basic details' },
  { name: 'first_name', label: 'First name', required: true }, { name: 'last_name', label: 'Last name' },
  { name: 'email', label: 'Work email', type: 'email', required: true }, { name: 'phone', label: 'Phone' },
  { name: 'emp_code', label: 'Employee code' }, { name: 'gender', label: 'Gender', type: 'select', options: ['Female', 'Male', 'Non-binary', 'Prefer not to say'] },
  { name: 'dob', label: 'Date of birth', type: 'date' }, { name: 'doj', label: 'Date of joining', type: 'date', required: isNew },
  { section: 'Job' },
  { name: 'department_id', label: 'Department', type: 'select', options: m.departments.map((d) => ({ value: d.id, label: d.name })) },
  { name: 'designation_id', label: 'Designation', type: 'select', options: m.designations.map((d) => ({ value: d.id, label: d.name })) },
  { name: 'manager_id', label: 'Reports to', type: 'employee' },
  { name: 'location_id', label: 'Location', type: 'select', options: m.locations.map((d) => ({ value: d.id, label: d.name })) },
  { name: 'shift_id', label: 'Shift', type: 'select', options: m.shifts.map((d) => ({ value: d.id, label: d.name })) },
  { name: 'employment_type', label: 'Employment type', type: 'select', options: ['Full-time', 'Part-time', 'Contract', 'Intern', 'Consultant'] },
  { name: 'probation_end', label: 'Probation ends', type: 'date' },
  { name: 'role', label: 'App access', type: 'select', noEmpty: true, options: [{ value: 'employee', label: 'Employee' }, { value: 'manager', label: 'Manager' }, { value: 'hr', label: 'HR' }, { value: 'admin', label: 'Admin' }] },
  ...(isNew ? [{ section: 'Salary & login' }, { name: 'ctc_annual', label: 'Annual CTC (₹)', type: 'number', hint: 'Optional — can be set later in Payroll' },
    { name: 'password', label: 'Initial password', type: 'text', hint: 'Leave blank to auto-generate one' }] : []),
];

export const useMasters = () => ({ departments: useMaster('departments'), designations: useMaster('designations'), locations: useMaster('locations'), shifts: useMaster('shifts') });

function ImportModal({ open, onClose, onDone }) {
  const [rows, setRows] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const template = () => downloadCSV('employee-import-template.csv', [{ first_name: 'Asha', last_name: 'Kumar', email: 'asha.kumar@company.com', phone: '+91 9800000000', emp_code: 'EMP101', department: 'Engineering', designation: 'Software Engineer', location: 'Mumbai HQ', manager_email: '', doj: '2026-01-15', dob: '1996-04-02', gender: 'Female', employment_type: 'Full-time', role: 'employee', ctc_annual: '1200000' }]);
  const run = async () => {
    setBusy(true);
    try { const r = await api.post('/employees/import', { rows }); setResult(r.results); onDone(); toast.success(`${r.results.filter((x) => x.ok).length} employees imported`); } catch (e) { toast.error(e); } finally { setBusy(false); }
  };
  const close = () => { setRows(null); setResult(null); onClose(); };
  return (
    <Modal open={open} onClose={close} title="Import employees from CSV" size="lg"
      footer={result ? <button className="btn-primary" onClick={close}>Done</button> : <><button className="btn-secondary" onClick={close}>Cancel</button><button className="btn-primary" disabled={!rows?.length || busy} onClick={run}>Import {rows?.length || ''} employees</button></>}>
      {!result ? (
        <div className="space-y-4 text-sm">
          <p className="text-slate-600">Upload a CSV with a header row. Required columns: <code>first_name</code>, <code>email</code>. Departments, designations and locations are created automatically if they don't exist. <button className="font-medium text-brand-600 hover:underline" onClick={template}>Download template</button></p>
          <input type="file" accept=".csv,text/csv" onChange={async (e) => { const f = e.target.files[0]; if (f) setRows(parseCSV(await f.text())); }} />
          {rows && <p className="text-slate-600">{rows.length} rows found. Preview: {rows.slice(0, 3).map((r) => `${r.first_name} <${r.email}>`).join(', ')}{rows.length > 3 ? '…' : ''}</p>}
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-slate-600">Share temporary passwords with each employee securely. They can change it after signing in.</p>
          <Table rows={result} dense columns={[{ key: 'row', label: 'Row' }, { key: 'email', label: 'Email' }, { key: 'ok', label: 'Result', render: (r) => (r.ok ? <Badge status="approved">Imported</Badge> : <span className="text-xs text-rose-600">{r.error}</span>) }, { key: 'temp_password', label: 'Temp password', render: (r) => <code>{r.temp_password || '—'}</code> }]} exportName="import-results" />
        </div>
      )}
    </Modal>
  );
}

export function People() {
  const { user } = useAuth();
  const [view, setView] = useState('grid');
  const [status, setStatus] = useState('active');
  const [dept, setDept] = useState('');
  const [q, setQ] = useState('');
  const { data, reload } = useApi(`/employees${qs({ status, department_id: dept })}`);
  const m = useMasters();
  const [add, setAdd] = useState(false);
  const [imp, setImp] = useState(false);
  const [created, setCreated] = useState(null);
  const nav = useNavigate();
  const rows = useMemo(() => (data || []).filter((e) => !q || `${e.first_name} ${e.last_name} ${e.email} ${e.emp_code} ${e.designation}`.toLowerCase().includes(q.toLowerCase())), [data, q]);
  return (
    <div>
      <PageHeader title="People" subtitle={`${data?.length ?? '…'} ${status === 'active' ? 'active employees' : 'employees'}`}
        actions={user.is_hr && <><button className="btn-secondary" onClick={() => setImp(true)}><Upload size={15} />Import CSV</button><button className="btn-primary" onClick={() => setAdd(true)}><Plus size={16} />Add employee</button></>} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input className="input max-w-xs" placeholder="Search name, email, code…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input w-auto" value={dept} onChange={(e) => setDept(e.target.value)}><option value="">All departments</option>{m.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
        {user.is_hr && <select className="input w-auto" value={status} onChange={(e) => setStatus(e.target.value)}><option value="active">Active</option><option value="exited">Exited</option><option value="all">All</option></select>}
        <div className="flex-1" />
        <div className="flex rounded-lg border border-slate-200 bg-white p-0.5">
          {[['grid', LayoutGrid], ['list', List]].map(([k, I]) => <button key={k} onClick={() => setView(k)} className={cx('rounded-md p-1.5', view === k ? 'bg-slate-100 text-slate-900' : 'text-slate-400')}><I size={16} /></button>)}
        </div>
      </div>
      {!data ? <Loading /> : view === 'grid' ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {rows.map((e) => (
            <Link key={e.id} to={`/people/${e.id}`} className="card flex flex-col items-center p-5 text-center transition hover:shadow-md">
              <Avatar name={`${e.first_name} ${e.last_name || ''}`} size="lg" />
              <div className="mt-3 font-semibold text-slate-900">{e.first_name} {e.last_name}</div>
              <div className="text-sm text-slate-500">{e.designation || '—'}</div>
              <div className="mt-1 text-xs text-slate-400">{[e.department, e.location].filter(Boolean).join(' · ')}</div>
              {e.status !== 'active' && <Badge className="mt-2" status={e.status} />}
              <div className="mt-3 flex w-full flex-col gap-1 border-t border-slate-100 pt-3 text-xs text-slate-500">
                <span className="flex items-center justify-center gap-1.5 truncate"><Mail size={12} />{e.email}</span>
                {e.phone && <span className="flex items-center justify-center gap-1.5"><Phone size={12} />{e.phone}</span>}
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <Card bodyClass="p-0">
          <Table rows={rows} onRowClick={(e) => nav(`/people/${e.id}`)} exportName="employees" columns={[
            { key: 'first_name', label: 'Name', render: (e) => <div className="flex items-center gap-2.5"><Avatar name={`${e.first_name} ${e.last_name || ''}`} size="sm" /><div><div className="font-medium">{e.first_name} {e.last_name}</div><div className="text-xs text-slate-400">{e.email}</div></div></div>, csv: (e) => `${e.first_name} ${e.last_name || ''}` },
            { key: 'email', label: 'Email', className: 'hidden', render: () => null }, { key: 'emp_code', label: 'Code' }, { key: 'designation', label: 'Designation' }, { key: 'department', label: 'Department' },
            { key: 'manager_name', label: 'Manager' }, { key: 'location', label: 'Location' }, { key: 'doj', label: 'Joined', render: (e) => fmtDate(e.doj) },
            { key: 'status', label: 'Status', render: (e) => <Badge status={e.status} /> },
          ]} />
        </Card>
      )}
      <FormModal open={add} onClose={() => setAdd(false)} title="Add employee" size="lg" fields={employeeFields(m, true)} submitLabel="Add employee" initial={{ role: 'employee', employment_type: 'Full-time', shift_id: m.shifts[0]?.id }}
        onSubmit={async (v) => { const r = await api.post('/employees', v); invalidate('/employees'); reload(); setCreated({ ...r, email: v.email, name: v.first_name }); return 'Employee added — onboarding checklist created'; }} />
      <Modal open={!!created} onClose={() => setCreated(null)} title="Employee added" size="sm" footer={<><button className="btn-secondary" onClick={() => setCreated(null)}>Close</button><button className="btn-primary" onClick={() => nav(`/people/${created.id}`)}>Open profile</button></>}>
        <p className="text-sm text-slate-600">{created?.name} can now sign in with <b>{created?.email}</b>.</p>
        {created?.temp_password && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Temporary password: <code className="font-semibold">{created.temp_password}</code><br /><span className="text-xs">Share it securely. It won't be shown again.</span></p>}
      </Modal>
      <ImportModal open={imp} onClose={() => setImp(false)} onDone={() => { invalidate('/employees'); reload(); }} />
    </div>
  );
}

function OrgNode({ node, byManager, depth }) {
  const kids = byManager.get(node.id) || [];
  const [open, setOpen] = useState(depth < 2);
  return (
    <div className="flex flex-col items-center">
      <div className="relative">
        <Link to={`/people/${node.id}`} className="card flex w-52 items-center gap-2.5 p-3 transition hover:shadow-md">
          <Avatar name={`${node.first_name} ${node.last_name || ''}`} size="sm" />
          <div className="min-w-0 text-left"><div className="truncate text-sm font-semibold">{node.first_name} {node.last_name}</div><div className="truncate text-xs text-slate-500">{node.designation || '—'}</div></div>
        </Link>
        {kids.length > 0 && (
          <button onClick={() => setOpen(!open)} className="absolute -bottom-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-0.5 rounded-full border border-slate-200 bg-white px-1.5 text-[10px] font-semibold text-slate-600 shadow-sm">
            {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}{kids.length}
          </button>
        )}
      </div>
      {open && kids.length > 0 && (
        <>
          <div className="h-6 w-px bg-slate-300" />
          <div className="flex">
            {kids.map((k, i) => (
              <div key={k.id} className="relative flex flex-col items-center px-2">
                {/* Each child draws the half of the horizontal connector that reaches its siblings. */}
                {i > 0 && <div className="absolute left-0 right-1/2 top-0 h-px bg-slate-300" />}
                {i < kids.length - 1 && <div className="absolute left-1/2 right-0 top-0 h-px bg-slate-300" />}
                <div className="h-4 w-px bg-slate-300" />
                <OrgNode node={k} byManager={byManager} depth={depth + 1} />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function OrgChart() {
  const { data } = useApi('/employees/org-chart');
  const box = useRef(null);
  // Wide trees overflow; start scrolled so the top of the hierarchy is centred.
  useEffect(() => { const el = box.current; if (el) el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2; }, [data]);
  if (!data) return <Loading />;
  const ids = new Set(data.map((e) => e.id));
  const byManager = new Map();
  data.forEach((e) => { const k = e.manager_id && ids.has(e.manager_id) ? e.manager_id : 'root'; if (!byManager.has(k)) byManager.set(k, []); byManager.get(k).push(e); });
  return (
    <div>
      <PageHeader title="Org chart" subtitle="Reporting structure across the company." />
      <div ref={box} className="card overflow-auto p-8">
        <div className="mx-auto flex w-max gap-8">{(byManager.get('root') || []).map((r) => <OrgNode key={r.id} node={r} byManager={byManager} depth={0} />)}</div>
      </div>
    </div>
  );
}
