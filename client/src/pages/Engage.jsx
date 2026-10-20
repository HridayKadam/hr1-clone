import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, Pin, Trash2, Award, Megaphone, BarChart2, Check } from 'lucide-react';
import { api, useApi } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { ago, fmtDate } from '../lib/format.js';
import { Avatar, Badge, Card, FormModal, Loading, PageHeader, Tabs, Empty, useAction, useToast, cx } from '../components/ui.jsx';

const BADGES = ['Thank You', 'Team Player', 'Problem Solver', 'Customer Hero', 'Innovator', 'Above & Beyond', 'Mentor'];

export function Engage() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'announcements';
  const ann = useApi('/engage/announcements');
  const polls = useApi(tab === 'polls' ? '/engage/polls' : null);
  const kudos = useApi(tab === 'kudos' ? '/engage/kudos' : null);
  const [form, setForm] = useState(null);
  const act = useAction(); const toast = useToast();
  return (
    <div>
      <PageHeader title="Engage" subtitle="Company news, pulse polls and peer recognition."
        actions={tab === 'kudos' ? <button className="btn-primary" onClick={() => setForm('kudos')}><Award size={16} />Give kudos</button>
          : user.is_hr && <button className="btn-primary" onClick={() => setForm(tab === 'polls' ? 'poll' : 'announcement')}><Plus size={16} />{tab === 'polls' ? 'New poll' : 'New announcement'}</button>} />
      <Tabs tabs={[{ key: 'announcements', label: 'Announcements' }, { key: 'polls', label: 'Polls' }, { key: 'kudos', label: 'Kudos wall' }]} value={tab} onChange={(t) => setParams({ tab: t })} />
      {tab === 'announcements' && (!ann.data ? <Loading /> : !ann.data.length ? <Card><Empty icon={Megaphone} title="No announcements yet" /></Card> : (
        <div className="space-y-4">
          {ann.data.map((a) => (
            <Card key={a.id} bodyClass="p-5">
              <div className="flex items-start gap-3">
                <Avatar name={a.author || 'HR'} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-slate-900">{a.title}</h3>{a.pinned ? <Badge status="open"><Pin size={10} className="mr-1" />Pinned</Badge> : null}</div>
                  <div className="text-xs text-slate-400">{a.author} · {ago(a.created_at)}</div>
                  {a.body && <p className="mt-3 whitespace-pre-line text-sm text-slate-700">{a.body}</p>}
                </div>
                {user.is_hr && (
                  <div className="flex gap-1">
                    <button title={a.pinned ? 'Unpin' : 'Pin'} className="rounded p-1.5 text-slate-400 hover:bg-slate-100" onClick={() => act(() => api.put(`/engage/announcements/${a.id}`, { pinned: a.pinned ? 0 : 1 }).then(ann.reload))}><Pin size={15} /></button>
                    <button className="rounded p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600" onClick={async () => { if (await toast.confirm('Delete this announcement?')) act(() => api.del(`/engage/announcements/${a.id}`).then(ann.reload), 'Deleted'); }}><Trash2 size={15} /></button>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      ))}
      {tab === 'polls' && (!polls.data ? <Loading /> : !polls.data.length ? <Card><Empty icon={BarChart2} title="No polls yet" /></Card> : (
        <div className="grid gap-4 md:grid-cols-2">
          {polls.data.map((p) => {
            const total = p.counts.reduce((a, b) => a + b, 0);
            const voted = p.my_vote != null;
            return (
              <Card key={p.id} bodyClass="p-5">
                <div className="flex items-start justify-between gap-2"><h3 className="font-semibold">{p.question}</h3>{user.is_hr && <button className="text-slate-400 hover:text-rose-600" onClick={async () => { if (await toast.confirm('Delete this poll?')) act(() => api.del(`/engage/polls/${p.id}`).then(polls.reload)); }}><Trash2 size={14} /></button>}</div>
                <div className="mb-3 text-xs text-slate-400">{total} vote{total === 1 ? '' : 's'}{p.closes_on && ` · ${p.closed ? 'Closed' : 'Closes'} ${fmtDate(p.closes_on)}`}{p.anonymous ? ' · Anonymous' : ''}</div>
                <div className="space-y-2">
                  {p.options.map((o, i) => {
                    const pct = total ? Math.round((p.counts[i] / total) * 100) : 0;
                    return (
                      <button key={i} disabled={p.closed} onClick={() => act(() => api.post(`/engage/polls/${p.id}/vote`, { option_index: i }).then(polls.reload))}
                        className={cx('relative w-full overflow-hidden rounded-lg border px-3 py-2 text-left text-sm transition', p.my_vote === i ? 'border-brand-500' : 'border-slate-200 hover:border-slate-300')}>
                        {(voted || p.closed) && <div className="absolute inset-y-0 left-0 bg-brand-50" style={{ width: `${pct}%` }} />}
                        <span className="relative flex items-center justify-between"><span className="flex items-center gap-1.5">{p.my_vote === i && <Check size={14} className="text-brand-600" />}{o}</span>{(voted || p.closed) && <span className="text-xs font-semibold text-slate-600">{pct}%</span>}</span>
                      </button>
                    );
                  })}
                </div>
              </Card>
            );
          })}
        </div>
      ))}
      {tab === 'kudos' && (!kudos.data ? <Loading /> : !kudos.data.length ? <Card><Empty icon={Award} title="No kudos yet" hint="Recognize a colleague for great work!" /></Card> : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {kudos.data.map((k) => (
            <div key={k.id} className="card relative overflow-hidden p-5">
              <div className="absolute right-0 top-0 h-16 w-16 -translate-y-6 translate-x-6 rounded-full bg-amber-100" />
              <Award className="relative text-amber-500" size={22} />
              <Badge className="relative mt-2" color="#d97706">{k.badge}</Badge>
              <p className="mt-3 text-sm text-slate-700">“{k.message}”</p>
              <div className="mt-4 flex items-center gap-2 text-xs text-slate-500"><Avatar name={k.to_name} size="xs" /><span><b className="text-slate-700">{k.to_name}</b> from {k.from_name} · {ago(k.created_at)}</span></div>
              {(k.from_id === user.id || user.is_hr) && <button className="absolute bottom-3 right-3 text-slate-300 hover:text-rose-500" onClick={() => act(() => api.del(`/engage/kudos/${k.id}`).then(kudos.reload))}><Trash2 size={13} /></button>}
            </div>
          ))}
        </div>
      ))}
      <FormModal open={form === 'announcement'} onClose={() => setForm(null)} title="New announcement" submitLabel="Publish"
        fields={[{ name: 'title', label: 'Title', required: true, col: 2 }, { name: 'body', label: 'Message', type: 'textarea', rows: 6, col: 2 }, { name: 'pinned', label: 'Pin to top', type: 'checkbox', col: 2 }]}
        onSubmit={async (v) => { await api.post('/engage/announcements', v); ann.reload(); return 'Announcement published and everyone notified'; }} />
      <FormModal open={form === 'poll'} onClose={() => setForm(null)} title="New poll" submitLabel="Create poll" initial={{ anonymous: 1 }}
        fields={[{ name: 'question', label: 'Question', required: true, col: 2 }, { name: 'options', label: 'Options (one per line)', type: 'textarea', rows: 5, col: 2, required: true },
          { name: 'closes_on', label: 'Closes on', type: 'date' }, { name: 'anonymous', label: 'Anonymous voting', type: 'checkbox' }]}
        onSubmit={async (v) => { await api.post('/engage/polls', { ...v, anonymous: !!Number(v.anonymous), options: String(v.options || '').split('\n') }); polls.reload(); return 'Poll created'; }} />
      <FormModal open={form === 'kudos'} onClose={() => setForm(null)} title="Give kudos" submitLabel="Send kudos" initial={{ badge: 'Thank You' }}
        fields={[{ name: 'to_id', label: 'Colleague', type: 'employee', required: true, col: 2, exclude: [user.id] }, { name: 'badge', label: 'Badge', type: 'select', noEmpty: true, options: BADGES, col: 2 },
          { name: 'message', label: 'Message', type: 'textarea', required: true, col: 2, placeholder: 'What did they do that made a difference?' }]}
        onSubmit={async (v) => { await api.post('/engage/kudos', v); kudos.reload(); return 'Kudos sent 🎉'; }} />
    </div>
  );
}
