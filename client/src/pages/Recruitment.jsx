import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Briefcase, MapPin, Users, FileText, Calendar, UserPlus, Trash2 } from 'lucide-react';
import { api, useApi } from '../lib/api.js';
import { fmtDateTime, ago } from '../lib/format.js';
import { Badge, Card, FormModal, Loading, PageHeader, Stars, Empty, Modal, useMaster, useToast, useAction, cx, invalidate } from '../components/ui.jsx';
import { employeeFields, useMasters } from './People.jsx';

const STAGES = [['applied', 'Applied', 'bg-slate-400'], ['screening', 'Screening', 'bg-sky-500'], ['interview', 'Interview', 'bg-violet-500'], ['offer', 'Offer', 'bg-amber-500'], ['hired', 'Hired', 'bg-emerald-500'], ['rejected', 'Rejected', 'bg-rose-500']];

const jobFields = (depts) => [
  { name: 'title', label: 'Job title', required: true, col: 2 }, { name: 'department_id', label: 'Department', type: 'select', options: depts.map((d) => ({ value: d.id, label: d.name })) },
  { name: 'location', label: 'Location' }, { name: 'employment_type', label: 'Type', type: 'select', options: ['Full-time', 'Part-time', 'Contract', 'Intern'] },
  { name: 'openings', label: 'Openings', type: 'number', min: 1 }, { name: 'experience', label: 'Experience', placeholder: 'e.g. 3–5 years' }, { name: 'salary_range', label: 'Salary range', placeholder: 'e.g. ₹12–18 LPA' },
  { name: 'hiring_manager_id', label: 'Hiring manager', type: 'employee' }, { name: 'status', label: 'Status', type: 'select', noEmpty: true, options: ['open', 'on_hold', 'closed'] },
  { name: 'description', label: 'Description', type: 'textarea', rows: 5, col: 2 },
];
const candFields = (jobs) => [
  { name: 'job_id', label: 'Job', type: 'select', required: true, col: 2, options: jobs.map((j) => ({ value: j.id, label: j.title })) },
  { name: 'name', label: 'Full name', required: true }, { name: 'email', label: 'Email', type: 'email' }, { name: 'phone', label: 'Phone' },
  { name: 'source', label: 'Source', type: 'select', options: ['LinkedIn', 'Referral', 'Careers page', 'Naukri', 'Agency', 'Other'] },
  { name: 'current_ctc', label: 'Current CTC' }, { name: 'expected_ctc', label: 'Expected CTC' }, { name: 'notice_period', label: 'Notice period' },
  { name: 'resume', label: 'Resume', type: 'file', accept: '.pdf,.doc,.docx' }, { name: 'notes', label: 'Notes', type: 'textarea', col: 2 },
];

function CandidateModal({ c, jobs, onClose, onChanged }) {
  const [notes, setNotes] = useState(c?.notes || '');
  const [interview, setInterview] = useState(c?.interview_at || '');
  const [hire, setHire] = useState(false);
  const m = useMasters();
  const toast = useToast(); const act = useAction(); const nav = useNavigate();
  if (!c) return null;
  const save = (patch, msg) => act(() => api.put(`/recruitment/candidates/${c.id}`, patch).then(onChanged), msg);
  const job = jobs.find((j) => j.id === c.job_id);
  return (
    <>
      <Modal open onClose={onClose} title={c.name} size="lg"
        footer={<>
          <button className="btn-ghost mr-auto text-rose-600" onClick={async () => { if (await toast.confirm(`Delete ${c.name}?`)) act(() => api.del(`/recruitment/candidates/${c.id}`).then(() => { onChanged(); onClose(); }), 'Candidate deleted'); }}><Trash2 size={15} /></button>
          {c.stage === 'hired' && <button className="btn-success" onClick={() => setHire(true)}><UserPlus size={15} />Create employee</button>}
          <button className="btn-primary" onClick={() => { save({ notes, interview_at: interview }, 'Saved'); onClose(); }}>Save</button>
        </>}>
        <div className="grid gap-5 md:grid-cols-2">
          <div className="space-y-2 text-sm">
            <div className="text-slate-500">Applied for <b className="text-slate-800">{c.job_title}</b> · {ago(c.created_at)}</div>
            {[['Email', c.email], ['Phone', c.phone], ['Source', c.source], ['Current CTC', c.current_ctc], ['Expected CTC', c.expected_ctc], ['Notice period', c.notice_period]].map(([k, v]) => <div key={k} className="flex"><span className="w-28 text-slate-500">{k}</span><span className="font-medium">{v || '—'}</span></div>)}
            {c.resume && <a className="inline-flex items-center gap-1 font-medium text-brand-600 hover:underline" href={`/api/recruitment/candidates/${c.id}/resume`}><FileText size={14} />Download resume</a>}
          </div>
          <div className="space-y-4">
            <div><label className="label">Stage</label>
              <div className="flex flex-wrap gap-1.5">{STAGES.map(([k, l]) => <button key={k} onClick={() => save({ stage: k }, `Moved to ${l}`)} className={cx('rounded-full border px-2.5 py-1 text-xs font-medium', c.stage === k ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-200 text-slate-600 hover:bg-slate-50')}>{l}</button>)}</div></div>
            <div><label className="label">Rating</label><Stars value={c.rating} onChange={(n) => save({ rating: n })} size={22} /></div>
            <div><label className="label">Interview</label><input type="datetime-local" className="input" value={interview || ''} onChange={(e) => setInterview(e.target.value)} /></div>
            <div><label className="label">Notes & feedback</label><textarea className="input" rows={5} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
          </div>
        </div>
      </Modal>
      <FormModal open={hire} onClose={() => setHire(false)} title={`Onboard ${c.name}`} size="lg" fields={employeeFields(m, true)} submitLabel="Create employee"
        initial={{ first_name: c.name.split(' ')[0], last_name: c.name.split(' ').slice(1).join(' '), email: c.email, phone: c.phone, department_id: job?.department_id, role: 'employee', employment_type: job?.employment_type || 'Full-time', shift_id: m.shifts[0]?.id }}
        onSubmit={async (v) => { const r = await api.post('/employees', v); invalidate('/employees'); if (r.temp_password) toast.info(`Temporary password for ${v.email}: ${r.temp_password}`); onClose(); nav(`/people/${r.id}`); return 'Employee created with onboarding checklist'; }} />
    </>
  );
}

export function Recruitment() {
  const jobs = useApi('/recruitment/jobs');
  const [jobId, setJobId] = useState(null);
  const cands = useApi(`/recruitment/candidates${jobId ? `?job_id=${jobId}` : ''}`);
  const depts = useMaster('departments');
  const [editJob, setEditJob] = useState(null);
  const [addCand, setAddCand] = useState(false);
  const [open, setOpen] = useState(null);
  const [drag, setDrag] = useState(null);
  const act = useAction();
  const reload = () => { cands.reload(); jobs.reload(); };
  const move = (id, stage) => act(() => api.put(`/recruitment/candidates/${id}`, { stage }).then(reload));
  const job = jobs.data?.find((j) => j.id === jobId);
  return (
    <div>
      <PageHeader title="Recruitment" subtitle="Job openings and hiring pipeline."
        actions={<><button className="btn-secondary" onClick={() => setEditJob({ status: 'open', openings: 1, employment_type: 'Full-time' })}><Plus size={15} />New job</button><button className="btn-primary" onClick={() => setAddCand(true)} disabled={!jobs.data?.length}><Plus size={16} />Add candidate</button></>} />
      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <div className="space-y-2">
          <button onClick={() => setJobId(null)} className={cx('card w-full p-3 text-left text-sm font-medium', !jobId && 'ring-2 ring-brand-500')}>All jobs</button>
          {!jobs.data ? <Loading /> : !jobs.data.length ? <Card><Empty icon={Briefcase} title="No jobs yet" hint="Create a job opening to start tracking candidates." /></Card> : jobs.data.map((j) => (
            <div key={j.id} onClick={() => setJobId(j.id)} className={cx('card cursor-pointer p-3 transition hover:shadow-md', jobId === j.id && 'ring-2 ring-brand-500')}>
              <div className="flex items-start justify-between gap-2"><span className="text-sm font-semibold">{j.title}</span><Badge status={j.status} /></div>
              <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-slate-500">{j.department && <span>{j.department}</span>}{j.location && <span className="flex items-center gap-0.5"><MapPin size={11} />{j.location}</span>}</div>
              <div className="mt-2 flex items-center gap-3 text-xs text-slate-500"><span className="flex items-center gap-1"><Users size={12} />{j.candidates} candidates</span><span>{j.hired}/{j.openings} hired</span></div>
            </div>
          ))}
        </div>
        <div className="min-w-0">
          {job && (
            <div className="card mb-4 flex flex-wrap items-center gap-3 p-4">
              <div className="flex-1"><div className="font-semibold">{job.title}</div><div className="text-xs text-slate-500">{[job.experience, job.salary_range, job.hiring_manager?.trim() && `Hiring manager: ${job.hiring_manager}`].filter(Boolean).join(' · ')}</div></div>
              <button className="btn-secondary btn-sm" onClick={() => setEditJob(job)}>Edit job</button>
            </div>
          )}
          <div className="flex gap-3 overflow-x-auto pb-4">
            {STAGES.map(([k, l, dot]) => {
              const list = (cands.data || []).filter((c) => c.stage === k);
              return (
                <div key={k} className="flex w-64 shrink-0 flex-col rounded-xl bg-slate-100/70 p-2" onDragOver={(e) => e.preventDefault()} onDrop={() => { if (drag && drag.stage !== k) move(drag.id, k); setDrag(null); }}>
                  <div className="flex items-center gap-2 px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-600"><span className={cx('h-2 w-2 rounded-full', dot)} />{l}<span className="ml-auto text-slate-400">{list.length}</span></div>
                  <div className="min-h-[120px] space-y-2">
                    {list.map((c) => (
                      <div key={c.id} draggable onDragStart={() => setDrag(c)} onClick={() => setOpen(c)} className="cursor-pointer rounded-lg border border-slate-200 bg-white p-3 shadow-sm hover:shadow-md">
                        <div className="text-sm font-medium">{c.name}</div>
                        {!jobId && <div className="text-xs text-slate-500">{c.job_title}</div>}
                        <div className="mt-1.5 flex items-center justify-between">{c.rating ? <Stars value={c.rating} size={12} /> : <span className="text-xs text-slate-400">{c.source || ''}</span>}{c.resume && <FileText size={13} className="text-slate-400" />}</div>
                        {c.interview_at && k === 'interview' && <div className="mt-1.5 flex items-center gap-1 text-[11px] text-violet-600"><Calendar size={11} />{fmtDateTime(c.interview_at)}</div>}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-slate-400">Drag cards between columns to move candidates through the pipeline.</p>
        </div>
      </div>
      <FormModal open={!!editJob} onClose={() => setEditJob(null)} title={editJob?.id ? 'Edit job' : 'New job opening'} size="lg" initial={editJob} fields={jobFields(depts)}
        onSubmit={async (v) => { if (v.id) await api.put(`/recruitment/jobs/${v.id}`, v); else { const r = await api.post('/recruitment/jobs', v); setJobId(r.id); } jobs.reload(); return 'Job saved'; }} />
      <FormModal open={addCand} onClose={() => setAddCand(false)} title="Add candidate" size="lg" initial={{ job_id: jobId || jobs.data?.[0]?.id }} fields={candFields(jobs.data || [])}
        onSubmit={async (v) => { await api.upload('/recruitment/candidates', v); reload(); return 'Candidate added'; }} />
      {open && <CandidateModal key={open.id} c={(cands.data || []).find((x) => x.id === open.id) || open} jobs={jobs.data || []} onClose={() => setOpen(null)} onChanged={reload} />}
    </div>
  );
}
