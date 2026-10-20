import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, X, CheckCheck, Inbox as InboxIcon, Paperclip } from 'lucide-react';
import { api, useApi } from '../lib/api.js';
import { ago } from '../lib/format.js';
import { Avatar, Badge, Card, Empty, Loading, Modal, PageHeader, Tabs, useToast, cx } from '../components/ui.jsx';

const KIND_COLOR = { leave: '#6366f1', regularization: '#f59e0b', expense: '#10b981', timesheet: '#0ea5e9', loan: '#8b5cf6', resignation: '#f43f5e' };

export function InboxPage() {
  const { data, reload } = useApi('/approvals');
  const [kind, setKind] = useState('all');
  const [selected, setSelected] = useState(new Set());
  const [decision, setDecision] = useState(null); // { items, action }
  const [comment, setComment] = useState('');
  const [lwd, setLwd] = useState('');
  const toast = useToast();
  const kinds = useMemo(() => {
    const m = new Map(); (data || []).forEach((x) => m.set(x.kind, { key: x.kind, label: x.kind_label, count: (m.get(x.kind)?.count || 0) + 1 }));
    return [{ key: 'all', label: 'All', count: data?.length || 0 }, ...m.values()];
  }, [data]);
  if (!data) return <Loading />;
  const items = data.filter((x) => kind === 'all' || x.kind === kind);
  const key = (x) => `${x.kind}:${x.id}`;
  const toggle = (x) => setSelected((s) => { const n = new Set(s); n.has(key(x)) ? n.delete(key(x)) : n.add(key(x)); return n; });
  const run = async () => {
    const { items: list, action } = decision;
    try {
      if (list.length === 1) await api.post(`/approvals/${list[0].kind}/${list[0].id}`, { action, comment, last_working_day: lwd || undefined });
      else {
        const r = await api.post('/approvals/bulk', { items: list.map((x) => ({ kind: x.kind, id: x.id })), action, comment });
        const failed = r.results.filter((x) => !x.ok);
        if (failed.length) toast.error(`${failed.length} could not be processed: ${failed[0].error}`);
      }
      toast.success(`${list.length} request${list.length > 1 ? 's' : ''} ${action === 'approve' ? 'approved' : 'rejected'}`);
      setSelected(new Set()); setDecision(null); setComment(''); setLwd(''); reload();
    } catch (e) { toast.error(e); }
  };
  const selectedItems = data.filter((x) => selected.has(key(x)));
  return (
    <div>
      <PageHeader title="Inbox" subtitle="Requests from your team waiting for a decision."
        actions={selectedItems.length > 0 && (
          <>
            <span className="text-sm text-slate-500">{selectedItems.length} selected</span>
            <button className="btn-danger" onClick={() => setDecision({ items: selectedItems, action: 'reject' })}><X size={15} />Reject</button>
            <button className="btn-success" onClick={() => setDecision({ items: selectedItems, action: 'approve' })}><CheckCheck size={15} />Approve all</button>
          </>
        )} />
      <Tabs tabs={kinds} value={kind} onChange={setKind} />
      {!items.length ? <Card><Empty icon={InboxIcon} title="All clear!" hint="There are no pending requests for you right now." /></Card> : (
        <div className="space-y-3">
          <label className="flex items-center gap-2 px-1 text-xs text-slate-500">
            <input type="checkbox" className="h-4 w-4 rounded border-slate-300" checked={items.every((x) => selected.has(key(x)))} onChange={(e) => setSelected(e.target.checked ? new Set(items.map(key)) : new Set())} />Select all
          </label>
          {items.map((x) => (
            <div key={key(x)} className={cx('card flex flex-wrap items-center gap-4 p-4', selected.has(key(x)) && 'ring-2 ring-brand-500/40')}>
              <input type="checkbox" className="h-4 w-4 rounded border-slate-300" checked={selected.has(key(x))} onChange={() => toggle(x)} />
              <Link to={`/people/${x.employee_id}`}><Avatar name={x.employee_name} /></Link>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-slate-900">{x.employee_name}</span>
                  <Badge color={KIND_COLOR[x.kind]}>{x.kind_label}</Badge>
                  <span className="text-xs text-slate-400">{ago(x.created_at)}</span>
                </div>
                <div className="mt-0.5 text-sm font-medium text-slate-700">{x.title}</div>
                <div className="text-sm text-slate-500">{x.detail}</div>
                {x.kind === 'expense' && x.record.receipt && <a href={`/api/work/expenses/${x.id}/receipt`} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline"><Paperclip size={12} />View receipt</a>}
              </div>
              <div className="flex gap-2">
                <button className="btn-secondary btn-sm text-rose-600" onClick={() => setDecision({ items: [x], action: 'reject' })}><X size={14} />Reject</button>
                <button className="btn-success btn-sm" onClick={() => { setLwd(x.record.last_working_day || ''); setDecision({ items: [x], action: 'approve' }); }}><Check size={14} />Approve</button>
              </div>
            </div>
          ))}
        </div>
      )}
      <Modal open={!!decision} onClose={() => setDecision(null)} size="sm" title={decision && `${decision.action === 'approve' ? 'Approve' : 'Reject'} ${decision.items.length > 1 ? `${decision.items.length} requests` : 'request'}`}
        footer={<><button className="btn-secondary" onClick={() => setDecision(null)}>Cancel</button><button className={decision?.action === 'approve' ? 'btn-success' : 'btn-danger'} onClick={run}>{decision?.action === 'approve' ? 'Approve' : 'Reject'}</button></>}>
        <div className="space-y-3">
          {decision?.items.length === 1 && decision.items[0].kind === 'resignation' && decision.action === 'approve' && (
            <div><label className="label">Last working day</label><input type="date" className="input" value={lwd} onChange={(e) => setLwd(e.target.value)} /><p className="mt-1 text-xs text-slate-400">Approving starts the offboarding checklist.</p></div>
          )}
          <div><label className="label">Comment {decision?.action === 'reject' ? '(recommended)' : '(optional)'}</label><textarea className="input" rows={3} value={comment} onChange={(e) => setComment(e.target.value)} /></div>
        </div>
      </Modal>
    </div>
  );
}
