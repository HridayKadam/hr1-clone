import { useState } from 'react';
import { Plus, Paperclip, Receipt } from 'lucide-react';
import { api, useApi, qs } from '../lib/api.js';
import { money, fmtDate, todayStr } from '../lib/format.js';
import { Badge, Card, FormModal, PageHeader, Table, StatCard, useAction, Empty, Avatar } from '../components/ui.jsx';

const cols = (opts = {}) => [
  ...(opts.emp ? [{ key: 'employee_name', label: 'Employee', render: (r) => <div className="flex items-center gap-2"><Avatar name={r.employee_name} size="xs" /><span className="font-medium">{r.employee_name}</span></div> }] : []),
  { key: 'date', label: 'Date', render: (r) => fmtDate(r.date) },
  { key: 'category', label: 'Category', render: (r) => <span className="font-medium">{r.category}</span> },
  { key: 'description', label: 'Description', render: (r) => <span className="line-clamp-1 max-w-xs">{r.description || '—'}</span> },
  { key: 'amount', label: 'Amount', render: (r) => <span className="font-semibold">{money(r.amount)}</span> },
  { key: 'receipt', label: 'Receipt', csv: false, render: (r) => (r.receipt ? <a href={`/api/work/expenses/${r.id}/receipt`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline"><Paperclip size={12} />View</a> : '—') },
  { key: 'status', label: 'Status', render: (r) => <Badge status={r.status} /> },
  ...(opts.onWithdraw ? [{ key: 'x', label: '', csv: false, render: (r) => r.status === 'pending' && <button className="text-xs font-medium text-rose-600 hover:underline" onClick={() => opts.onWithdraw(r)}>Withdraw</button> }] : []),
];

export function MyExpenses() {
  const { data, reload } = useApi('/work/expenses');
  const settings = useApi('/masters/settings');
  const [open, setOpen] = useState(false);
  const act = useAction();
  const cats = (settings.data?.expense_categories || '').split(',').map((s) => s.trim()).filter(Boolean);
  const total = (s) => (data || []).filter((x) => s.includes(x.status)).reduce((a, x) => a + x.amount, 0);
  return (
    <div className="space-y-6">
      <PageHeader title="My expenses" subtitle="Submit claims with receipts. Approved claims are reimbursed in the next payroll." actions={<button className="btn-primary" onClick={() => setOpen(true)}><Plus size={16} />New claim</button>} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Pending approval" value={money(total(['pending']))} tone="amber" icon={Receipt} />
        <StatCard label="Approved, to be paid" value={money(total(['approved']))} tone="green" icon={Receipt} />
        <StatCard label="Reimbursed" value={money(total(['paid']))} tone="sky" icon={Receipt} />
      </div>
      <Card bodyClass="p-0">
        <Table rows={data} exportName="my-expenses" columns={cols({ onWithdraw: (r) => act(() => api.del(`/work/expenses/${r.id}`).then(reload), 'Claim withdrawn') })}
          empty={<Empty icon={Receipt} title="No claims yet" hint="Add travel, food, internet or other business expenses here." />} />
      </Card>
      <FormModal open={open} onClose={() => setOpen(false)} title="New expense claim" submitLabel="Submit claim" initial={{ date: todayStr() }}
        fields={[
          { name: 'category', label: 'Category', type: 'select', options: cats, required: true }, { name: 'amount', label: 'Amount (₹)', type: 'number', required: true, min: 1 },
          { name: 'date', label: 'Expense date', type: 'date', required: true, max: todayStr() }, { name: 'receipt', label: 'Receipt', type: 'file', accept: 'image/*,.pdf' },
          { name: 'description', label: 'Description', type: 'textarea', col: 2 },
        ]}
        onSubmit={async (v) => { await api.upload('/work/expenses', v); reload(); return 'Claim submitted for approval'; }} />
    </div>
  );
}

export function AdminExpenses() {
  const [status, setStatus] = useState('');
  const { data } = useApi(`/work/expenses${qs({ scope: 'all', status })}`);
  return (
    <div>
      <PageHeader title="Expenses" subtitle="All employee claims. Approve pending claims from the Inbox; approved claims are paid with payroll." />
      <Card bodyClass="p-0">
        <Table rows={data} searchable exportName="expenses" searchKeys={['employee_name', 'category', 'description']} columns={cols({ emp: true })}
          toolbar={<select className="input w-auto" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All statuses</option>{['pending', 'approved', 'paid', 'rejected', 'cancelled'].map((s) => <option key={s} value={s}>{s}</option>)}</select>} />
      </Card>
    </div>
  );
}

