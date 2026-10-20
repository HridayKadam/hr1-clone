import { useState } from 'react';
import { Plus, Laptop } from 'lucide-react';
import { api, useApi } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { fmtDate, money } from '../lib/format.js';
import { Badge, Card, FormModal, PageHeader, Table, StatCard, Empty, Modal, useToast, useEmployees } from '../components/ui.jsx';

export function Assets() {
  const { data, reload } = useApi('/assets?scope=all');
  const settings = useApi('/masters/settings');
  const [edit, setEdit] = useState(null);
  const [assign, setAssign] = useState(null);
  const [history, setHistory] = useState(null);
  const employees = useEmployees();
  const toast = useToast();
  const cats = (settings.data?.asset_categories || '').split(',').map((s) => s.trim()).filter(Boolean);
  const count = (s) => (data || []).filter((a) => a.status === s).length;
  const openHistory = async (a) => setHistory({ asset: a, rows: await api.get(`/assets/${a.id}/history`) });
  return (
    <div>
      <PageHeader title="Assets" subtitle="Track company equipment and who has it." actions={<button className="btn-primary" onClick={() => setEdit({ status: 'available' })}><Plus size={16} />Add asset</button>} />
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total assets" value={data?.length ?? '…'} icon={Laptop} />
        <StatCard label="Assigned" value={count('assigned')} tone="sky" icon={Laptop} />
        <StatCard label="Available" value={count('available')} tone="green" icon={Laptop} />
        <StatCard label="Total value" value={money((data || []).reduce((s, a) => s + (a.cost || 0), 0))} tone="violet" icon={Laptop} />
      </div>
      <Card bodyClass="p-0">
        <Table rows={data} searchable exportName="assets" searchKeys={['tag', 'name', 'category', 'serial', 'assigned_name']} empty={<Empty icon={Laptop} title="No assets yet" />} columns={[
          { key: 'tag', label: 'Tag', render: (a) => <span className="font-mono text-xs">{a.tag}</span> }, { key: 'name', label: 'Asset', render: (a) => <button className="font-medium hover:text-brand-700" onClick={() => setEdit(a)}>{a.name}</button>, csv: (a) => a.name },
          { key: 'category', label: 'Category' }, { key: 'serial', label: 'Serial' }, { key: 'status', label: 'Status', render: (a) => <Badge status={a.status} /> },
          { key: 'assigned_name', label: 'Assigned to', render: (a) => (a.assigned_to ? <span>{a.assigned_name}<span className="block text-xs text-slate-400">since {fmtDate(a.assigned_at)}</span></span> : '—') },
          { key: 'cost', label: 'Cost', render: (a) => money(a.cost) },
          { key: 'x', label: '', csv: false, render: (a) => <div className="flex justify-end gap-3 text-xs font-medium"><button className="text-brand-600 hover:underline" onClick={() => setAssign({ id: a.id, name: a.name, employee_id: a.assigned_to })}>{a.assigned_to ? 'Reassign' : 'Assign'}</button>{a.assigned_to && <button className="text-slate-500 hover:underline" onClick={async () => { await api.post(`/assets/${a.id}/assign`, {}); toast.success('Asset returned'); reload(); }}>Return</button>}<button className="text-slate-500 hover:underline" onClick={() => openHistory(a)}>History</button></div> },
        ]} />
      </Card>
      <FormModal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Edit asset' : 'Add asset'} initial={edit}
        fields={[{ name: 'name', label: 'Name', required: true, col: 2, placeholder: 'e.g. MacBook Pro 14"' }, { name: 'tag', label: 'Asset tag', placeholder: 'LT-010' }, { name: 'category', label: 'Category', type: 'select', options: cats },
          { name: 'serial', label: 'Serial number' }, { name: 'purchase_date', label: 'Purchase date', type: 'date' }, { name: 'cost', label: 'Cost (₹)', type: 'number' },
          { name: 'status', label: 'Status', type: 'select', noEmpty: true, options: ['available', 'assigned', 'repair', 'retired'] }, { name: 'notes', label: 'Notes', type: 'textarea', col: 2 }]}
        onSubmit={async (v) => { if (v.id) await api.put(`/assets/${v.id}`, v); else await api.post('/assets', v); reload(); return 'Asset saved'; }}>
        {edit?.id && <button type="button" className="text-xs font-medium text-rose-600 hover:underline" onClick={async () => { if (await toast.confirm('Delete this asset?')) { await api.del(`/assets/${edit.id}`); setEdit(null); reload(); } }}>Delete asset</button>}
      </FormModal>
      <FormModal open={!!assign} onClose={() => setAssign(null)} title={assign && `Assign ${assign.name}`} initial={assign} submitLabel="Assign"
        fields={[{ name: 'employee_id', label: 'Employee', type: 'employee', required: true, col: 2 }]}
        onSubmit={async (v) => { await api.post(`/assets/${v.id}/assign`, { employee_id: v.employee_id }); reload(); return `Assigned to ${employees.find((e) => String(e.id) === String(v.employee_id))?.first_name || 'employee'}`; }} />
      <Modal open={!!history} onClose={() => setHistory(null)} title={history && `History · ${history.asset.name}`}>
        {!history?.rows.length ? <p className="text-sm text-slate-400">No history yet</p> : <ul className="space-y-2 text-sm">{history.rows.map((h) => <li key={h.id}><b className="capitalize">{h.action}</b> {h.action === 'assigned' ? 'to' : 'by'} {h.employee_name} · <span className="text-slate-500">{fmtDate(h.at)}</span></li>)}</ul>}
      </Modal>
    </div>
  );
}

export function MyAssets() {
  const { user } = useAuth();
  const { data } = useApi(`/assets?employee_id=${user.id}`);
  return (
    <div>
      <PageHeader title="My assets" subtitle="Company equipment assigned to you. Raise a helpdesk ticket for repairs or returns." />
      <Card bodyClass="p-0">
        <Table rows={data} empty={<Empty icon={Laptop} title="No assets assigned to you" />} columns={[
          { key: 'tag', label: 'Tag', render: (a) => <span className="font-mono text-xs">{a.tag}</span> }, { key: 'name', label: 'Asset', render: (a) => <span className="font-medium">{a.name}</span> },
          { key: 'category', label: 'Category' }, { key: 'serial', label: 'Serial' }, { key: 'assigned_at', label: 'Assigned on', render: (a) => fmtDate(a.assigned_at) },
        ]} />
      </Card>
    </div>
  );
}
