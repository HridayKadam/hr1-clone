import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import dayjs from 'dayjs';
import { Edit3, KeyRound, LogOut, Trash2, Upload, Download, Mail, Phone, MapPin, Award, FileText, CheckSquare, Square } from 'lucide-react';
import { api, useApi } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { fmtDate, money } from '../lib/format.js';
import { Avatar, Badge, Card, ErrorBox, FormModal, Loading, Modal, Table, Tabs, Empty, useToast, useAction, invalidate } from '../components/ui.jsx';
import { employeeFields, useMasters } from './People.jsx';
import { AttendanceCalendar, MonthNav } from './Attendance.jsx';

const Info = ({ items }) => (
  <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
    {items.filter(Boolean).map(([k, v]) => <div key={k}><dt className="text-xs text-slate-500">{k}</dt><dd className="mt-0.5 text-sm font-medium text-slate-800">{v || '—'}</dd></div>)}
  </dl>
);

export function Documents({ employeeId, canUpload, canDelete }) {
  const { data, reload } = useApi(`/employees/${employeeId}/documents`);
  const [open, setOpen] = useState(false);
  const act = useAction(); const toast = useToast();
  return (
    <Card title="Documents" action={canUpload && <button className="btn-secondary btn-sm" onClick={() => setOpen(true)}><Upload size={14} />Upload</button>} bodyClass="p-0">
      <Table rows={data} empty={<Empty icon={FileText} title="No documents" hint="ID proofs, offer letters, certificates and policies live here." />} columns={[
        { key: 'name', label: 'Document', render: (d) => <span className="font-medium">{d.name}</span> }, { key: 'category', label: 'Category' },
        { key: 'size', label: 'Size', render: (d) => `${Math.max(1, Math.round(d.size / 1024))} KB` }, { key: 'created_at', label: 'Uploaded', render: (d) => fmtDate(d.created_at) },
        { key: 'x', label: '', render: (d) => (
          <div className="flex justify-end gap-3">
            <a className="text-brand-600" href={`/api/employees/${employeeId}/documents/${d.id}/file`}><Download size={15} /></a>
            {canDelete && <button className="text-rose-500" onClick={async () => { if (await toast.confirm(`Delete "${d.name}"?`)) act(() => api.del(`/employees/${employeeId}/documents/${d.id}`).then(reload), 'Document deleted'); }}><Trash2 size={15} /></button>}
          </div>) },
      ]} />
      <FormModal open={open} onClose={() => setOpen(false)} title="Upload document" submitLabel="Upload"
        fields={[{ name: 'file', label: 'File', type: 'file', required: true, col: 2, hint: 'PDF, image, Word or Excel up to 10 MB' }, { name: 'name', label: 'Name', placeholder: 'Defaults to file name' },
          { name: 'category', label: 'Category', type: 'select', options: ['ID Proof', 'Address Proof', 'Education', 'Offer / Appointment', 'Experience', 'Payroll / Tax', 'Policy', 'Other'] }]}
        onSubmit={async (v) => { if (!v.file) throw new Error('Choose a file'); await api.upload(`/employees/${employeeId}/documents`, v); reload(); return 'Uploaded'; }} />
    </Card>
  );
}

export function MyDocuments() {
  const { user } = useAuth();
  return <div><h1 className="mb-6 text-xl font-semibold">My documents</h1><Documents employeeId={user.id} canUpload canDelete={user.is_hr} /></div>;
}

function ProfileAttendance({ id }) {
  const [month, setMonth] = useState(dayjs().format('YYYY-MM'));
  const { data } = useApi(`/attendance/month?employee_id=${id}&month=${month}`);
  return <Card title="Attendance" action={<MonthNav month={month} setMonth={setMonth} />}>{data ? <AttendanceCalendar days={data.days} /> : <Loading />}</Card>;
}

function ProfileLeave({ id }) {
  const bal = useApi(`/leave/balances?employee_id=${id}`);
  const reqs = useApi(`/leave/requests?employee_id=${id}`);
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">{(bal.data || []).map((b) => <div key={b.leave_type_id} className="card p-3"><div className="text-xs text-slate-500">{b.name}</div><div className="text-lg font-semibold">{b.paid ? b.available : b.used}<span className="text-xs font-normal text-slate-400">{b.paid ? ` / ${b.allocated}` : ' taken'}</span></div></div>)}</div>
      <Card title="Leave history" bodyClass="p-0"><Table rows={reqs.data} columns={[
        { key: 'leave_type', label: 'Type', render: (r) => <Badge color={r.color}>{r.leave_type}</Badge> }, { key: 'from_date', label: 'Dates', render: (r) => `${fmtDate(r.from_date)}${r.to_date !== r.from_date ? ` → ${fmtDate(r.to_date)}` : ''}` },
        { key: 'days', label: 'Days' }, { key: 'reason', label: 'Reason' }, { key: 'status', label: 'Status', render: (r) => <Badge status={r.status} /> },
      ]} /></Card>
    </div>
  );
}

function ProfileTasks({ id }) {
  const { data, reload } = useApi(`/lifecycle/tasks?employee_id=${id}`);
  const act = useAction();
  if (!data) return <Loading />;
  if (!data.length) return <Card><Empty title="No onboarding or offboarding tasks" /></Card>;
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {['onboarding', 'offboarding'].filter((k) => data.some((t) => t.kind === k)).map((k) => {
        const list = data.filter((t) => t.kind === k);
        return (
          <Card key={k} title={k === 'onboarding' ? 'Onboarding' : 'Offboarding'} subtitle={`${list.filter((t) => t.done).length} of ${list.length} done`} bodyClass="divide-y divide-slate-100">
            {list.map((t) => (
              <button key={t.id} className="flex w-full items-start gap-3 px-5 py-3 text-left hover:bg-slate-50" onClick={() => act(() => api.put(`/lifecycle/tasks/${t.id}`, { done: !t.done }).then(reload))}>
                {t.done ? <CheckSquare size={18} className="mt-0.5 shrink-0 text-emerald-600" /> : <Square size={18} className="mt-0.5 shrink-0 text-slate-300" />}
                <div className="flex-1"><div className={t.done ? 'text-sm text-slate-400 line-through' : 'text-sm font-medium'}>{t.title}</div><div className="text-xs text-slate-400">Owner: {t.owner} · Due {fmtDate(t.due_date)}{t.done_by_name ? ` · Done by ${t.done_by_name}` : ''}</div></div>
              </button>
            ))}
          </Card>
        );
      })}
    </div>
  );
}

export function EmployeeProfile() {
  const { id } = useParams();
  const { user, refresh } = useAuth();
  const { data: e, reload, error } = useApi(`/employees/${id}`);
  const [tab, setTab] = useState('overview');
  const [edit, setEdit] = useState(false);
  const [pw, setPw] = useState(null);
  const m = useMasters();
  const toast = useToast(); const act = useAction(); const nav = useNavigate();
  const salary = useApi(e?.access.edit && tab === 'salary' ? `/payroll/structures/${id}` : null);
  const assets = useApi(tab === 'assets' && (e?.access.full) ? `/assets?employee_id=${id}` : null);
  const kudos = useApi(tab === 'kudos' ? `/engage/kudos?employee_id=${id}` : null);
  if (error) return <ErrorBox error={error} />;
  if (!e || String(e.id) !== String(id)) return <Loading />;
  const name = `${e.first_name} ${e.last_name || ''}`.trim();
  const a = e.access;
  const tabs = [{ key: 'overview', label: 'Overview' }, a.full && { key: 'documents', label: 'Documents' }, a.team && { key: 'attendance', label: 'Attendance' },
    a.team && { key: 'leave', label: 'Leave' }, a.edit && { key: 'salary', label: 'Salary' }, a.full && { key: 'assets', label: 'Assets' }, a.team && { key: 'tasks', label: 'Onboarding' }, { key: 'kudos', label: 'Kudos' }].filter(Boolean);
  const selfFields = [
    { name: 'phone', label: 'Phone' }, { name: 'personal_email', label: 'Personal email', type: 'email' }, { name: 'dob', label: 'Date of birth', type: 'date' },
    { name: 'gender', label: 'Gender', type: 'select', options: ['Female', 'Male', 'Non-binary', 'Prefer not to say'] }, { name: 'marital_status', label: 'Marital status', type: 'select', options: ['Single', 'Married', 'Other'] },
    { name: 'blood_group', label: 'Blood group', type: 'select', options: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] }, { name: 'address', label: 'Address', type: 'textarea', col: 2 },
    { name: 'emergency_contact', label: 'Emergency contact', col: 2, placeholder: 'Name, relation, phone' },
    { section: 'Statutory & bank' }, { name: 'pan', label: 'PAN' }, { name: 'uan', label: 'UAN (PF)' }, { name: 'bank_name', label: 'Bank name' }, { name: 'bank_account', label: 'Account number' }, { name: 'ifsc', label: 'IFSC' },
  ];
  const hrFields = [...employeeFields(m, false), ...selfFields, ...(a.edit ? [{ name: 'aadhaar', label: 'Aadhaar' }] : [])];
  return (
    <div>
      <div className="card mb-6 overflow-hidden">
        <div className="h-20 bg-gradient-to-r from-brand-600 to-violet-600" />
        <div className="flex flex-wrap items-end gap-4 px-6 pb-5">
          <Avatar name={name} size="xl" className="-mt-10 ring-4 ring-white" />
          <div className="min-w-0 flex-1 pt-3">
            <div className="flex flex-wrap items-center gap-2"><h1 className="text-xl font-semibold text-slate-900">{name}</h1>{e.status !== 'active' && <Badge status={e.status} />}{e.exit_date && e.status === 'active' && <Badge status="pending">Leaving {fmtDate(e.exit_date)}</Badge>}</div>
            <p className="text-sm text-slate-500">{[e.designation, e.department].filter(Boolean).join(' · ') || '—'} {e.emp_code && <span className="text-slate-400">· {e.emp_code}</span>}</p>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
              <a href={`mailto:${e.email}`} className="flex items-center gap-1 hover:text-brand-600"><Mail size={12} />{e.email}</a>
              {e.phone && <span className="flex items-center gap-1"><Phone size={12} />{e.phone}</span>}
              {e.location && <span className="flex items-center gap-1"><MapPin size={12} />{e.location}</span>}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {(a.edit || a.self) && <button className="btn-secondary" onClick={() => setEdit(true)}><Edit3 size={15} />Edit</button>}
            {a.edit && !a.self && <button className="btn-secondary" onClick={async () => { if (await toast.confirm({ message: `Generate a new temporary password for ${e.first_name}?`, danger: false })) act(async () => setPw((await api.post(`/employees/${id}/reset-password`)).temp_password)); }}><KeyRound size={15} />Reset password</button>}
            {a.edit && !a.self && e.status === 'active' && <button className="btn-secondary text-rose-600" onClick={async () => { if (await toast.confirm({ message: `Mark ${e.first_name} as exited? Their login will be disabled and their reports will move to their manager.`, confirmLabel: 'Mark exited' })) act(() => api.post(`/lifecycle/exit/${id}`, {}).then(() => { invalidate('/employees'); reload(); }), 'Employee exited'); }}><LogOut size={15} />Exit</button>}
            {user.role === 'admin' && !a.self && e.status !== 'active' && <button className="btn-ghost text-rose-600" onClick={async () => { if (await toast.confirm(`Permanently delete ${name} and all their records?`)) act(() => api.del(`/employees/${id}`).then(() => { invalidate('/employees'); nav('/people'); }), 'Employee deleted'); }}><Trash2 size={15} /></button>}
          </div>
        </div>
      </div>
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      {tab === 'overview' && (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <Card title="Job"><Info items={[['Employee code', e.emp_code], ['Designation', e.designation], ['Department', e.department], ['Reports to', e.manager_id ? <Link className="text-brand-600 hover:underline" to={`/people/${e.manager_id}`}>{e.manager_name}</Link> : null],
              ['Date of joining', fmtDate(e.doj)], ['Employment type', e.employment_type], ['Location', e.location], ['Shift', e.shift], a.team && ['Probation ends', fmtDate(e.probation_end)], ['App access', <span className="capitalize">{e.role}</span>]]} /></Card>
            {a.team && <Card title="Personal"><Info items={[['Date of birth', fmtDate(e.dob)], ['Gender', e.gender], ['Blood group', e.blood_group], a.full && ['Marital status', e.marital_status], a.full && ['Personal email', e.personal_email], a.full && ['Emergency contact', e.emergency_contact], a.full && ['Address', e.address]]} /></Card>}
            {a.full && <Card title="Statutory & bank"><Info items={[['PAN', e.pan], ['UAN', e.uan], a.edit && ['Aadhaar', e.aadhaar], ['Bank', e.bank_name], ['Account number', e.bank_account], ['IFSC', e.ifsc]]} /></Card>}
          </div>
          <Card title={`Direct reports (${e.reports.length})`} bodyClass="p-4 space-y-3">
            {!e.reports.length ? <p className="text-sm text-slate-400">No direct reports</p> : e.reports.map((r) => (
              <Link key={r.id} to={`/people/${r.id}`} className="flex items-center gap-3"><Avatar name={`${r.first_name} ${r.last_name || ''}`} size="sm" /><span className="text-sm font-medium">{r.first_name} {r.last_name}</span></Link>
            ))}
          </Card>
        </div>
      )}
      {tab === 'documents' && <Documents employeeId={id} canUpload canDelete={a.edit} />}
      {tab === 'attendance' && <ProfileAttendance id={id} />}
      {tab === 'leave' && <ProfileLeave id={id} />}
      {tab === 'salary' && (
        <Card title="Salary" action={<Link to="/payroll" className="text-xs font-medium text-brand-600 hover:underline">Manage in Payroll</Link>}>
          {salary.loading ? <Loading /> : !salary.data ? <Empty title="No salary structure" hint="Set one from Payroll → Salary structures." /> : (
            <Info items={[['Annual CTC', money(salary.data.ctc_annual)], ['Monthly gross', money(salary.data.breakup.gross)], ['Basic', money(salary.data.breakup.basic)], ['HRA', money(salary.data.breakup.hra)],
              ['Effective from', fmtDate(salary.data.effective_from)], ['Revisions', salary.data.revisions.length]]} />
          )}
        </Card>
      )}
      {tab === 'assets' && <Card bodyClass="p-0"><Table rows={assets.data} empty={<Empty title="No assets assigned" />} columns={[{ key: 'tag', label: 'Tag' }, { key: 'name', label: 'Asset', render: (x) => <span className="font-medium">{x.name}</span> }, { key: 'category', label: 'Category' }, { key: 'serial', label: 'Serial' }, { key: 'assigned_at', label: 'Since', render: (x) => fmtDate(x.assigned_at) }]} /></Card>}
      {tab === 'tasks' && <ProfileTasks id={id} />}
      {tab === 'kudos' && (
        <Card bodyClass="divide-y divide-slate-100">
          {!kudos.data?.length ? <Empty icon={Award} title="No kudos yet" /> : kudos.data.map((k) => (
            <div key={k.id} className="flex gap-3 px-5 py-3.5"><Award size={18} className="mt-0.5 text-amber-500" /><div className="text-sm"><Badge color="#d97706">{k.badge}</Badge> <span className="text-slate-500">from</span> <b>{k.from_name}</b><p className="mt-1 text-slate-600">{k.message}</p></div></div>
          ))}
        </Card>
      )}
      <FormModal open={edit} onClose={() => setEdit(false)} title={`Edit ${e.first_name}`} size="lg" initial={e} fields={a.edit ? hrFields : selfFields}
        onSubmit={async (v) => { await api.put(`/employees/${id}`, v); invalidate('/employees'); reload(); if (a.self) refresh(); return 'Profile updated'; }} />
      <Modal open={!!pw} onClose={() => setPw(null)} title="Temporary password" size="sm" footer={<button className="btn-primary" onClick={() => setPw(null)}>Done</button>}>
        <p className="text-sm text-slate-600">Share this securely with {e.first_name}. They should change it after signing in.</p>
        <p className="mt-3 rounded-lg bg-slate-100 p-3 text-center font-mono text-lg font-semibold">{pw}</p>
      </Modal>
    </div>
  );
}
