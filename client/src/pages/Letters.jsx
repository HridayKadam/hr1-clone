import { useState } from 'react';
import { Plus, Printer, FileText, Copy } from 'lucide-react';
import { api, useApi } from '../lib/api.js';
import { Card, FormModal, Loading, Modal, PageHeader, Empty, useEmployees, useToast, cx } from '../components/ui.jsx';

export function Letters() {
  const { data, reload } = useApi('/letters/templates');
  const employees = useEmployees();
  const [sel, setSel] = useState(null);
  const [emp, setEmp] = useState('');
  const [edit, setEdit] = useState(null);
  const [letter, setLetter] = useState(null);
  const toast = useToast();
  if (!data) return <Loading />;
  const tpl = data.templates.find((t) => t.id === sel) || data.templates[0];
  const generate = async () => {
    if (!emp) return toast.error('Choose an employee');
    try { setLetter(await api.post('/letters/render', { template_id: tpl.id, employee_id: emp })); } catch (e) { toast.error(e); }
  };
  const print = () => {
    const w = window.open('', '_blank');
    const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    w.document.write(`<!doctype html><html><head><title>${esc(letter.title)}</title><style>body{font-family:Georgia,serif;max-width:720px;margin:48px auto;padding:0 32px;line-height:1.6;color:#111}header{border-bottom:2px solid #111;padding-bottom:12px;margin-bottom:32px}h1{font-family:Arial,sans-serif;font-size:20px;margin:0}small{color:#555;white-space:pre-line}p{white-space:pre-line}</style></head><body><header><h1>${esc(letter.company)}</h1><small>${esc(letter.company_address || '')}</small></header><p>${esc(letter.body)}</p></body></html>`);
    w.document.close(); w.focus(); w.print();
  };
  return (
    <div>
      <PageHeader title="Letters" subtitle="Generate offer, appointment, experience and other letters from templates." actions={<button className="btn-secondary" onClick={() => setEdit({ name: '', body: '' })}><Plus size={15} />New template</button>} />
      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        <Card title="Templates" bodyClass="p-2">
          {!data.templates.length ? <Empty icon={FileText} title="No templates" /> : data.templates.map((t) => (
            <button key={t.id} onClick={() => { setSel(t.id); setLetter(null); }} className={cx('flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm', tpl?.id === t.id ? 'bg-brand-50 font-medium text-brand-700' : 'hover:bg-slate-50')}><FileText size={15} />{t.name}</button>
          ))}
        </Card>
        {tpl && (
          <Card className="min-w-0" title={tpl.name} action={<button className="btn-ghost btn-sm" onClick={() => setEdit(tpl)}>Edit template</button>}>
            <div className="mb-4 flex flex-wrap gap-2">
              <select className="input max-w-xs" value={emp} onChange={(e) => setEmp(e.target.value)}><option value="">Select employee…</option>{employees.map((e) => <option key={e.id} value={e.id}>{e.first_name} {e.last_name} ({e.emp_code})</option>)}</select>
              <button className="btn-primary" onClick={generate}>Generate letter</button>
            </div>
            <pre className="max-h-[480px] overflow-y-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-4 font-serif text-sm text-slate-700">{tpl.body}</pre>
            <p className="mt-3 text-xs text-slate-500">Placeholders: {data.placeholders.map((p) => <code key={p} className="mr-1 rounded bg-slate-100 px-1">{`{{${p}}}`}</code>)}</p>
          </Card>
        )}
      </div>
      <FormModal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Edit template' : 'New template'} size="lg" initial={edit}
        fields={[{ name: 'name', label: 'Template name', required: true, col: 2 }, { name: 'body', label: 'Content', type: 'textarea', rows: 16, required: true, col: 2, hint: 'Use {{name}}, {{designation}}, {{doj}}, {{ctc}} and other placeholders listed on the page.' }]}
        onSubmit={async (v) => { if (v.id) await api.put(`/letters/templates/${v.id}`, v); else { const r = await api.post('/letters/templates', v); setSel(r.id); } reload(); return 'Template saved'; }}>
        {edit?.id && <button type="button" className="text-xs font-medium text-rose-600 hover:underline" onClick={async () => { if (await toast.confirm('Delete this template?')) { await api.del(`/letters/templates/${edit.id}`); setEdit(null); setSel(null); reload(); } }}>Delete template</button>}
      </FormModal>
      <Modal open={!!letter} onClose={() => setLetter(null)} title={letter?.title} size="lg"
        footer={<><button className="btn-secondary" onClick={() => { navigator.clipboard.writeText(letter.body); toast.success('Copied'); }}><Copy size={15} />Copy</button><button className="btn-primary" onClick={print}><Printer size={15} />Print / PDF</button></>}>
        <div className="font-serif text-sm leading-relaxed text-slate-800"><div className="mb-6 border-b-2 border-slate-800 pb-2 font-sans text-lg font-bold">{letter?.company}</div><p className="whitespace-pre-line">{letter?.body}</p></div>
      </Modal>
    </div>
  );
}
