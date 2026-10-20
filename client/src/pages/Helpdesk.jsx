import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Plus, LifeBuoy, Send } from 'lucide-react';
import { api, useApi, qs } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { ago, fmtDateTime } from '../lib/format.js';
import { Avatar, Badge, Card, ErrorBox, FormModal, Loading, PageHeader, Table, Tabs, Empty, useAction, useEmployees } from '../components/ui.jsx';

const PRIORITY = { low: 'bg-slate-100 text-slate-600 ring-slate-500/20', medium: 'bg-sky-50 text-sky-700 ring-sky-600/20', high: 'bg-amber-50 text-amber-700 ring-amber-600/20', urgent: 'bg-rose-50 text-rose-700 ring-rose-600/20' };
const Priority = ({ p }) => <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium capitalize ring-1 ring-inset ${PRIORITY[p] || PRIORITY.medium}`}>{p}</span>;

export function Helpdesk() {
  const { user } = useAuth();
  const [scope, setScope] = useState(user.is_hr ? 'all' : 'mine');
  const [status, setStatus] = useState('');
  const { data, reload } = useApi(`/helpdesk${qs({ scope, status })}`);
  const settings = useApi('/masters/settings');
  const [open, setOpen] = useState(false);
  const nav = useNavigate();
  const cats = (settings.data?.ticket_categories || '').split(',').map((s) => s.trim()).filter(Boolean);
  return (
    <div>
      <PageHeader title="Helpdesk" subtitle="Raise questions for HR, payroll, IT or facilities and track them to resolution."
        actions={<button className="btn-primary" onClick={() => setOpen(true)}><Plus size={16} />New ticket</button>} />
      {user.is_hr && <Tabs tabs={[{ key: 'all', label: 'All tickets' }, { key: 'mine', label: 'Mine & assigned to me' }]} value={scope} onChange={setScope} />}
      <Card bodyClass="p-0">
        <Table rows={data} onRowClick={(t) => nav(`/helpdesk/${t.id}`)} searchable searchKeys={['subject', 'employee_name', 'category']} exportName="tickets"
          toolbar={<select className="input w-auto" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All statuses</option>{['open', 'in_progress', 'resolved', 'closed'].map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}</select>}
          empty={<Empty icon={LifeBuoy} title="No tickets" hint="Need help with something? Create a ticket and the right team will pick it up." />}
          columns={[
            { key: 'id', label: '#', render: (t) => <span className="text-slate-400">#{t.id}</span> },
            { key: 'subject', label: 'Subject', render: (t) => <div><div className="font-medium">{t.subject}</div><div className="text-xs text-slate-400">{t.category} · {t.comments} repl{t.comments === 1 ? 'y' : 'ies'}</div></div> },
            { key: 'employee_name', label: 'Raised by' }, { key: 'priority', label: 'Priority', render: (t) => <Priority p={t.priority} /> },
            { key: 'assignee_name', label: 'Assignee', render: (t) => t.assignee_name?.trim() || <span className="text-slate-400">Unassigned</span> },
            { key: 'status', label: 'Status', render: (t) => <Badge status={t.status} /> }, { key: 'updated_at', label: 'Updated', render: (t) => ago(t.updated_at) },
          ]} />
      </Card>
      <FormModal open={open} onClose={() => setOpen(false)} title="New helpdesk ticket" submitLabel="Create ticket" initial={{ priority: 'medium' }}
        fields={[{ name: 'subject', label: 'Subject', required: true, col: 2 }, { name: 'category', label: 'Category', type: 'select', options: cats },
          { name: 'priority', label: 'Priority', type: 'select', noEmpty: true, options: ['low', 'medium', 'high', 'urgent'] }, { name: 'description', label: 'Describe the issue', type: 'textarea', rows: 5, col: 2 }]}
        onSubmit={async (v) => { const r = await api.post('/helpdesk', v); reload(); nav(`/helpdesk/${r.id}`); return 'Ticket created'; }} />
    </div>
  );
}

export function Ticket() {
  const { id } = useParams();
  const { user } = useAuth();
  const { data: t, reload, error } = useApi(`/helpdesk/${id}`);
  const [msg, setMsg] = useState('');
  const employees = useEmployees();
  const act = useAction();
  if (error) return <ErrorBox error={error} />;
  if (!t) return <Loading />;
  const staff = user.is_hr || t.assignee_id === user.id;
  const update = (patch, m) => act(() => api.put(`/helpdesk/${id}`, patch).then(reload), m);
  const send = async () => { if (!msg.trim()) return; await act(() => api.post(`/helpdesk/${id}/comments`, { body: msg })); setMsg(''); reload(); };
  return (
    <div>
      <PageHeader back={{ to: '/helpdesk', label: 'Helpdesk' }} title={t.subject} subtitle={`#${t.id} · ${t.category || 'General'} · opened ${ago(t.created_at)} by ${t.employee_name}`} />
      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <Card className="min-w-0" bodyClass="p-0">
          <div className="space-y-5 p-5">
            <div className="flex gap-3"><Avatar name={t.employee_name} size="sm" /><div className="flex-1 rounded-lg bg-slate-50 p-3"><div className="text-xs text-slate-500"><b className="text-slate-700">{t.employee_name}</b> · {fmtDateTime(t.created_at)}</div><p className="mt-1 whitespace-pre-line text-sm">{t.description || <i className="text-slate-400">No description</i>}</p></div></div>
            {t.thread.map((c) => (
              <div key={c.id} className="flex gap-3"><Avatar name={c.author || '?'} size="sm" /><div className={`flex-1 rounded-lg p-3 ${c.author_id === t.employee_id ? 'bg-slate-50' : 'bg-brand-50'}`}><div className="text-xs text-slate-500"><b className="text-slate-700">{c.author}</b> · {fmtDateTime(c.created_at)}</div><p className="mt-1 whitespace-pre-line text-sm">{c.body}</p></div></div>
            ))}
          </div>
          {t.status !== 'closed' && (
            <div className="flex gap-2 border-t border-slate-100 p-4">
              <textarea className="input" rows={2} placeholder="Write a reply…" value={msg} onChange={(e) => setMsg(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send(); }} />
              <button className="btn-primary self-end" onClick={send}><Send size={15} /></button>
            </div>
          )}
        </Card>
        <Card title="Details" bodyClass="space-y-4 p-5 text-sm">
          <div><div className="label">Status</div>{staff ? <select className="input" value={t.status} onChange={(e) => update({ status: e.target.value }, 'Status updated')}>{['open', 'in_progress', 'resolved', 'closed'].map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}</select> : <Badge status={t.status} />}</div>
          <div><div className="label">Priority</div>{staff ? <select className="input" value={t.priority} onChange={(e) => update({ priority: e.target.value })}>{['low', 'medium', 'high', 'urgent'].map((s) => <option key={s}>{s}</option>)}</select> : <Priority p={t.priority} />}</div>
          <div><div className="label">Assignee</div>{user.is_hr ? <select className="input" value={t.assignee_id || ''} onChange={(e) => update({ assignee_id: e.target.value || null }, 'Assigned')}><option value="">Unassigned</option>{employees.map((e) => <option key={e.id} value={e.id}>{e.first_name} {e.last_name}</option>)}</select> : <span>{t.assignee_name?.trim() || 'Unassigned'}</span>}</div>
          {!staff && t.employee_id === user.id && t.status !== 'closed' && <button className="btn-secondary w-full" onClick={() => update({ status: 'closed' }, 'Ticket closed')}>Close ticket</button>}
        </Card>
      </div>
    </div>
  );
}
