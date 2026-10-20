import { useState } from 'react';
import { Plus, Target, Rocket, Lock, CornerDownRight } from 'lucide-react';
import { api, useApi, qs } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { fmtDate } from '../lib/format.js';
import { Badge, Card, FormModal, Loading, PageHeader, ProgressBar, Stars, Table, Tabs, Empty, Modal, useMaster, useAction, useToast, Avatar, invalidate } from '../components/ui.jsx';

const goalFields = (cycles, parents, withEmployee) => [
  ...(withEmployee ? [{ name: 'employee_id', label: 'Assign to', type: 'employee', required: true, col: 2 }] : []),
  { name: 'title', label: 'Goal', required: true, col: 2, placeholder: 'e.g. Reduce churn to under 2%' },
  { name: 'kind', label: 'Type', type: 'select', options: ['KRA', 'OKR', 'KPI', 'Development'], noEmpty: true },
  { name: 'cycle_id', label: 'Review cycle', type: 'select', options: cycles.map((c) => ({ value: c.id, label: c.name })) },
  { name: 'target', label: 'Target / key result', placeholder: 'e.g. < 2% monthly churn' }, { name: 'weight', label: 'Weightage %', type: 'number', min: 0, max: 100 },
  { name: 'due_date', label: 'Due date', type: 'date' },
  { name: 'parent_id', label: 'Aligns to', type: 'select', options: parents.map((g) => ({ value: g.id, label: `${g.title} (${g.employee_name})` })), placeholder: 'No parent goal' },
  { name: 'description', label: 'Description', type: 'textarea', col: 2 },
];

export function GoalList({ goals, onEdit, onProgress, showEmployee }) {
  if (!goals) return <Loading />;
  if (!goals.length) return <Empty icon={Target} title="No goals yet" hint="Goals help align individual work with team and company objectives." />;
  return (
    <div className="divide-y divide-slate-100">
      {goals.map((g) => (
        <div key={g.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge>{g.kind}</Badge>
              <button className="text-left font-medium text-slate-900 hover:text-brand-700" onClick={() => onEdit?.(g)}>{g.title}</button>
              <Badge status={g.status} />
            </div>
            <div className="mt-1 flex flex-wrap gap-x-4 text-xs text-slate-500">
              {showEmployee && <span className="font-medium text-slate-700">{g.employee_name}</span>}
              {g.target && <span>Target: {g.target}</span>}
              {g.weight > 0 && <span>Weight {g.weight}%</span>}
              {g.due_date && <span>Due {fmtDate(g.due_date)}</span>}
              {g.cycle && <span>{g.cycle}</span>}
            </div>
            {g.parent_title && <div className="mt-1 flex items-center gap-1 text-xs text-slate-400"><CornerDownRight size={12} />Aligns to {g.parent_title}</div>}
          </div>
          <div className="w-48">
            <div className="mb-1 flex justify-between text-xs"><span className="text-slate-500">Progress</span><span className="font-semibold">{g.progress}%</span></div>
            <ProgressBar value={g.progress} />
          </div>
          {onProgress && <button className="btn-secondary btn-sm" onClick={() => onProgress(g)}>Update</button>}
        </div>
      ))}
    </div>
  );
}

export function ReviewForm({ review, stage, onClose, onDone }) {
  const [v, setV] = useState({});
  const toast = useToast();
  if (!review) return null;
  const self = stage === 'self';
  const submit = async () => {
    try { await api.put(`/performance/reviews/${review.id}`, { stage, ...v }); toast.success('Review submitted'); onDone(); onClose(); } catch (e) { toast.error(e); }
  };
  return (
    <Modal open onClose={onClose} title={self ? `Self review · ${review.cycle}` : `Review ${review.employee_name} · ${review.cycle}`}
      footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={submit}>Submit review</button></>}>
      <div className="space-y-4">
        {!self && review.self_rating && (
          <div className="rounded-lg bg-slate-50 p-3 text-sm">
            <div className="mb-1 flex items-center gap-2 text-xs font-semibold text-slate-500">Self assessment <Stars value={review.self_rating} size={14} /></div>
            <p className="whitespace-pre-line text-slate-700">{review.self_comment}</p>
          </div>
        )}
        <div><label className="label">{self ? 'Rate your performance' : 'Your rating'}</label><Stars value={v[self ? 'self_rating' : 'manager_rating']} onChange={(n) => setV({ ...v, [self ? 'self_rating' : 'manager_rating']: n })} size={26} /></div>
        <div><label className="label">{self ? 'Key achievements, challenges and goals for next cycle' : 'Feedback for the employee'}</label>
          <textarea className="input" rows={6} value={v[self ? 'self_comment' : 'manager_comment'] || ''} onChange={(e) => setV({ ...v, [self ? 'self_comment' : 'manager_comment']: e.target.value })} /></div>
      </div>
    </Modal>
  );
}

export function ProgressModal({ goal, onClose, onDone }) {
  return (
    <FormModal open={!!goal} onClose={onClose} title={goal && `Update · ${goal.title}`} initial={goal && { progress: goal.progress, status: goal.status }}
      fields={[{ name: 'progress', label: 'Progress %', type: 'range', min: 0, max: 100, col: 2, hint: (v) => `${v.progress ?? 0}%` },
        { name: 'status', label: 'Status', type: 'select', noEmpty: true, col: 2, options: [{ value: 'on_track', label: 'On track' }, { value: 'at_risk', label: 'At risk' }, { value: 'behind', label: 'Behind' }, { value: 'completed', label: 'Completed' }] }]}
      onSubmit={async (v) => { await api.put(`/performance/goals/${goal.id}`, { ...v, progress: Number(v.progress) }); onDone(); return 'Goal updated'; }} />
  );
}

export function MyPerformance() {
  const goals = useApi('/performance/goals');
  const reviews = useApi('/performance/reviews');
  const allGoals = useApi('/performance/goals?scope=alignable');
  const cycles = useMaster('review_cycles');
  const [edit, setEdit] = useState(null);
  const [progress, setProgress] = useState(null);
  const [review, setReview] = useState(null);
  const act = useAction();
  const parents = (allGoals.data || goals.data || []).filter((g) => g.id !== edit?.id);
  return (
    <div className="space-y-6">
      <PageHeader title="My performance" subtitle="Your goals, OKRs and review cycles." actions={<button className="btn-primary" onClick={() => setEdit({ kind: 'KRA', cycle_id: cycles.find((c) => c.status === 'active')?.id })}><Plus size={16} />Add goal</button>} />
      {reviews.data?.filter((r) => r.status === 'self_pending' && r.cycle_status !== 'closed').map((r) => (
        <div key={r.id} className="card flex items-center gap-4 border-brand-200 bg-brand-50 p-4">
          <Rocket className="text-brand-600" size={20} />
          <div className="flex-1 text-sm"><b>{r.cycle}</b> is open. Submit your self review so your manager can assess.</div>
          <button className="btn-primary btn-sm" onClick={() => setReview(r)}>Start self review</button>
        </div>
      ))}
      <Card title="My goals" bodyClass="p-0"><GoalList goals={goals.data} onEdit={setEdit} onProgress={setProgress} /></Card>
      <Card title="Reviews" bodyClass="p-0">
        <Table rows={reviews.data} empty={<p className="py-8 text-center text-sm text-slate-400">No review cycles yet</p>} columns={[
          { key: 'cycle', label: 'Cycle', render: (r) => <span className="font-medium">{r.cycle}</span> }, { key: 'reviewer_name', label: 'Reviewer', render: (r) => r.reviewer_name?.trim() || '—' },
          { key: 'self_rating', label: 'Self', render: (r) => (r.self_rating ? <Stars value={r.self_rating} size={14} /> : '—') },
          { key: 'final_rating', label: 'Final rating', render: (r) => (r.final_rating ? <Stars value={r.final_rating} size={14} /> : '—') },
          { key: 'manager_comment', label: 'Manager feedback', render: (r) => <span className="line-clamp-2 max-w-sm text-xs">{r.manager_comment || '—'}</span> },
          { key: 'status', label: 'Status', render: (r) => <Badge status={r.status} /> },
        ]} />
      </Card>
      <FormModal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Edit goal' : 'Add goal'} initial={edit} fields={goalFields(cycles, parents)}
        onSubmit={async (v) => { if (v.id) await api.put(`/performance/goals/${v.id}`, v); else await api.post('/performance/goals', v); goals.reload(); return 'Goal saved'; }}>
        {edit?.id && <button type="button" className="text-xs font-medium text-rose-600 hover:underline" onClick={() => act(() => api.del(`/performance/goals/${edit.id}`).then(() => { setEdit(null); goals.reload(); }), 'Goal deleted')}>Delete this goal</button>}
      </FormModal>
      <ProgressModal goal={progress} onClose={() => setProgress(null)} onDone={goals.reload} />
      <ReviewForm review={review} stage="self" onClose={() => setReview(null)} onDone={reviews.reload} />
    </div>
  );
}

export function TeamPerformance() {
  const goals = useApi('/performance/goals?scope=team');
  const alignable = useApi('/performance/goals?scope=alignable');
  const reviews = useApi('/performance/reviews?scope=team');
  const cycles = useMaster('review_cycles');
  const [edit, setEdit] = useState(null);
  const [review, setReview] = useState(null);
  return (
    <div className="space-y-6">
      <Card title="Reviews to complete" bodyClass="p-0">
        <Table rows={reviews.data} empty={<p className="py-8 text-center text-sm text-slate-400">No reviews assigned to you</p>} columns={[
          { key: 'employee_name', label: 'Employee', render: (r) => <div className="flex items-center gap-2"><Avatar name={r.employee_name} size="xs" /><span className="font-medium">{r.employee_name}</span></div> },
          { key: 'cycle', label: 'Cycle' }, { key: 'self_rating', label: 'Self', render: (r) => (r.self_rating ? <Stars value={r.self_rating} size={14} /> : '—') },
          { key: 'manager_rating', label: 'Your rating', render: (r) => (r.manager_rating ? <Stars value={r.manager_rating} size={14} /> : '—') },
          { key: 'status', label: 'Status', render: (r) => <Badge status={r.status} /> },
          { key: 'x', label: '', render: (r) => r.status !== 'completed' && r.cycle_status !== 'closed' && <button className="btn-primary btn-sm" onClick={() => setReview(r)}>Review</button> },
        ]} />
      </Card>
      <Card title="Team goals" action={<button className="btn-secondary btn-sm" onClick={() => setEdit({ kind: 'KRA', cycle_id: cycles.find((c) => c.status === 'active')?.id })}><Plus size={14} />Assign goal</button>} bodyClass="p-0">
        <GoalList goals={goals.data} showEmployee onEdit={setEdit} />
      </Card>
      <FormModal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Edit goal' : 'Assign goal'} initial={edit} fields={goalFields(cycles, (alignable.data || []).filter((g) => g.id !== edit?.id), !edit?.id)}
        onSubmit={async (v) => { if (v.id) await api.put(`/performance/goals/${v.id}`, v); else await api.post('/performance/goals', v); goals.reload(); return 'Goal saved'; }} />
      <ReviewForm review={review} stage="manager" onClose={() => setReview(null)} onDone={reviews.reload} />
    </div>
  );
}

export function AdminPerformance() {
  const [tab, setTab] = useState('cycles');
  const cycles = useApi('/masters/review_cycles');
  const [cycleId, setCycleId] = useState('');
  const reviews = useApi(tab === 'reviews' ? `/performance/reviews${qs({ scope: 'all', cycle_id: cycleId })}` : null);
  const goals = useApi(tab === 'goals' ? '/performance/goals?scope=all' : null);
  const [edit, setEdit] = useState(null);
  const [review, setReview] = useState(null);
  const toast = useToast(); const act = useAction();
  const { user } = useAuth();
  const reload = () => { cycles.reload(); invalidate('/masters/review_cycles'); };
  return (
    <div>
      <PageHeader title="Performance" subtitle="Run review cycles and track goals across the company." actions={<button className="btn-primary" onClick={() => setEdit({ status: 'draft' })}><Plus size={16} />New cycle</button>} />
      <Tabs tabs={[{ key: 'cycles', label: 'Review cycles' }, { key: 'reviews', label: 'All reviews' }, { key: 'goals', label: 'All goals' }]} value={tab} onChange={setTab} />
      {tab === 'cycles' && (
        <Card bodyClass="p-0">
          <Table rows={cycles.data} empty={<Empty title="No review cycles" hint="Create a cycle (e.g. H1 2026) and launch it to start reviews for everyone." />} columns={[
            { key: 'name', label: 'Cycle', render: (r) => <button className="font-medium hover:text-brand-700" onClick={() => setEdit(r)}>{r.name}</button> },
            { key: 'start_date', label: 'Period', render: (r) => `${fmtDate(r.start_date)} – ${fmtDate(r.end_date)}` }, { key: 'status', label: 'Status', render: (r) => <Badge status={r.status} /> },
            { key: 'x', label: '', render: (r) => (
              <div className="flex justify-end gap-2">
                {r.status !== 'closed' && <button className="btn-secondary btn-sm" onClick={async () => { if (await toast.confirm({ message: `Create reviews for every active employee in "${r.name}" and notify them?`, danger: false, confirmLabel: 'Launch' })) act(async () => { const x = await api.post(`/performance/cycles/${r.id}/launch`); reload(); toast.success(`${x.created} new reviews created`); }); }}><Rocket size={14} />Launch</button>}
                {r.status !== 'closed' && <button className="btn-secondary btn-sm" onClick={() => act(() => api.put(`/masters/review_cycles/${r.id}`, { status: 'closed' }).then(reload), 'Cycle closed')}><Lock size={14} />Close</button>}
              </div>) },
          ]} />
        </Card>
      )}
      {tab === 'reviews' && (
        <Card bodyClass="p-0">
          <Table rows={reviews.data} searchable exportName="reviews" searchKeys={['employee_name', 'reviewer_name']}
            toolbar={<select className="input w-auto" value={cycleId} onChange={(e) => setCycleId(e.target.value)}><option value="">All cycles</option>{(cycles.data || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>}
            columns={[
              { key: 'employee_name', label: 'Employee', render: (r) => <span className="font-medium">{r.employee_name}</span> }, { key: 'cycle', label: 'Cycle' }, { key: 'reviewer_name', label: 'Reviewer', render: (r) => r.reviewer_name?.trim() || '—' },
              { key: 'self_rating', label: 'Self' }, { key: 'manager_rating', label: 'Manager' }, { key: 'final_rating', label: 'Final' }, { key: 'status', label: 'Status', render: (r) => <Badge status={r.status} /> },
              { key: 'x', label: '', csv: false, render: (r) => r.status !== 'completed' && r.employee_id !== user.id && <button className="text-xs font-medium text-brand-600 hover:underline" onClick={() => setReview(r)}>Complete</button> },
            ]} />
        </Card>
      )}
      {tab === 'goals' && <Card bodyClass="p-0"><GoalList goals={goals.data} showEmployee /></Card>}
      <FormModal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Edit cycle' : 'New review cycle'} initial={edit}
        fields={[{ name: 'name', label: 'Name', required: true, col: 2, placeholder: 'e.g. Annual Review 2026' }, { name: 'start_date', label: 'Start', type: 'date' }, { name: 'end_date', label: 'End', type: 'date' },
          { name: 'status', label: 'Status', type: 'select', noEmpty: true, options: ['draft', 'active', 'closed'] }]}
        onSubmit={async (v) => { if (v.id) await api.put(`/masters/review_cycles/${v.id}`, v); else await api.post('/masters/review_cycles', v); reload(); return 'Cycle saved'; }} />
      <ReviewForm review={review} stage="manager" onClose={() => setReview(null)} onDone={reviews.reload} />
    </div>
  );
}
