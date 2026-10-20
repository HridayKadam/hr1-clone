import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import dayjs from 'dayjs';
import { Plus, Printer, RefreshCw, Lock, Trash2, Download, FileText, ArrowLeft } from 'lucide-react';
import { api, useApi } from '../lib/api.js';
import { money, fmtMonth, fmtDate, downloadCSV } from '../lib/format.js';
import { Badge, Card, FormModal, Loading, PageHeader, Table, Tabs, StatCard, useToast, useAction, Empty, ErrorBox } from '../components/ui.jsx';

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
function words(n) {
  n = Math.round(n);
  if (n === 0) return 'Zero';
  const two = (x) => (x < 20 ? ONES[x] : `${TENS[Math.floor(x / 10)]}${x % 10 ? ` ${ONES[x % 10]}` : ''}`);
  const three = (x) => `${x >= 100 ? `${ONES[Math.floor(x / 100)]} Hundred${x % 100 ? ' ' : ''}` : ''}${x % 100 ? two(x % 100) : ''}`;
  const parts = [];
  const crore = Math.floor(n / 1e7); const lakh = Math.floor((n % 1e7) / 1e5); const th = Math.floor((n % 1e5) / 1000); const rest = n % 1000;
  if (crore) parts.push(`${words(crore)} Crore`);
  if (lakh) parts.push(`${two(lakh)} Lakh`);
  if (th) parts.push(`${two(th)} Thousand`);
  if (rest) parts.push(three(rest));
  return parts.join(' ');
}

function Breakup({ s }) {
  const b = s.breakup;
  const rows = [['Basic', b.basic], ['HRA', b.hra], ['Special allowance', b.special], ['Gross salary', b.gross, true], ['Employer PF', b.employerPF], ['Employer ESI', b.employerESI], ['Cost to company', b.monthly, true]];
  return (
    <table className="w-full text-sm">
      <thead><tr className="text-xs text-slate-500"><th className="py-1.5 text-left font-medium">Component</th><th className="text-right font-medium">Monthly</th><th className="text-right font-medium">Annual</th></tr></thead>
      <tbody>{rows.filter(([, v, bold]) => v || bold).map(([k, v, bold]) => <tr key={k} className={bold ? 'border-t border-slate-200 font-semibold' : ''}><td className="py-1.5">{k}</td><td className="text-right">{money(v)}</td><td className="text-right">{money(v * 12)}</td></tr>)}</tbody>
      {s.tds_enabled ? <tfoot><tr className="text-xs text-slate-500"><td className="pt-3" colSpan={3}>Projected income tax (new regime): {money(s.annual_tax)} / year · {money(s.annual_tax / 12)} / month</td></tr></tfoot> : null}
    </table>
  );
}

export function MySalary() {
  const me = useApi('/auth/me');
  const id = me.data?.user.id;
  const structure = useApi(id ? `/payroll/structures/${id}` : null);
  const slips = useApi('/payroll/my-payslips');
  const loans = useApi('/payroll/loans');
  const [loan, setLoan] = useState(false);
  return (
    <div className="space-y-6">
      <PageHeader title="My salary" subtitle="Payslips, salary structure and advances." actions={<button className="btn-secondary" onClick={() => setLoan(true)}><Plus size={15} />Request advance / loan</button>} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Payslips" bodyClass="p-0">
          <Table rows={slips.data} empty={<Empty icon={FileText} title="No payslips yet" hint="Payslips appear here once HR finalizes a payroll run." />} onRowClick={(r) => window.open(`/payslip/${r.id}`, '_blank')} columns={[
            { key: 'month', label: 'Month', render: (r) => <span className="font-medium">{fmtMonth(r.month)}</span> },
            { key: 'gross', label: 'Gross', render: (r) => money(r.gross) }, { key: 'total_deductions', label: 'Deductions', render: (r) => money(r.total_deductions) },
            { key: 'net', label: 'Net pay', render: (r) => <span className="font-semibold text-emerald-700">{money(r.net)}</span> },
            { key: 'x', label: '', render: () => <span className="text-xs font-medium text-brand-600">View</span> },
          ]} />
        </Card>
        <Card title="Salary structure" subtitle={structure.data ? `Annual CTC ${money(structure.data.ctc_annual)}` : undefined}>
          {structure.loading ? <Loading /> : !structure.data ? <Empty title="No salary structure" hint="HR hasn't set up your salary yet." /> : <Breakup s={structure.data} />}
        </Card>
      </div>
      {loans.data?.length > 0 && (
        <Card title="Advances & loans" bodyClass="p-0">
          <Table rows={loans.data} columns={[
            { key: 'kind', label: 'Type' }, { key: 'amount', label: 'Amount', render: (r) => money(r.amount) }, { key: 'emi', label: 'Monthly EMI', render: (r) => money(r.emi) },
            { key: 'balance', label: 'Outstanding', render: (r) => money(r.balance) }, { key: 'status', label: 'Status', render: (r) => <Badge status={r.status} /> }, { key: 'created_at', label: 'Requested', render: (r) => fmtDate(r.created_at) },
          ]} />
        </Card>
      )}
      <FormModal open={loan} onClose={() => setLoan(false)} title="Request salary advance / loan" submitLabel="Submit"
        fields={[{ name: 'kind', label: 'Type', type: 'select', options: ['Salary Advance', 'Personal Loan'], required: true, col: 2 }, { name: 'amount', label: 'Amount (₹)', type: 'number', required: true },
          { name: 'emi', label: 'Monthly recovery (₹)', type: 'number', required: true }, { name: 'reason', label: 'Reason', type: 'textarea', col: 2 }]}
        initial={{ kind: 'Salary Advance' }} onSubmit={async (v) => { await api.post('/payroll/loans', v); loans.reload(); return 'Request sent to HR'; }} />
    </div>
  );
}

function StructureModal({ row, onClose, onSaved }) {
  const s = useApi(row ? `/payroll/structures/${row.employee_id}` : null);
  if (!row) return null;
  if (s.loading) return null;
  const init = s.data || { pf_enabled: 1, esi_enabled: 1, pt_enabled: 1, tds_enabled: 1 };
  return (
    <FormModal open onClose={onClose} title={`Salary · ${row.first_name} ${row.last_name || ''}`} initial={{ ...init, effective_from: dayjs().format('YYYY-MM-DD') }}
      fields={[
        { name: 'ctc_annual', label: 'Annual CTC (₹)', type: 'number', required: true, col: 2 },
        { name: 'basic_pct', label: 'Basic % of CTC', type: 'number', placeholder: 'Company default', hint: 'Leave blank for company default' },
        { name: 'hra_pct', label: 'HRA % of basic', type: 'number', placeholder: 'Company default' },
        { name: 'effective_from', label: 'Effective from', type: 'date' }, { name: 'note', label: 'Revision note', placeholder: 'e.g. Annual appraisal' },
        { name: 'pf_enabled', label: 'Provident fund', type: 'checkbox' }, { name: 'esi_enabled', label: 'ESI (if eligible)', type: 'checkbox' },
        { name: 'pt_enabled', label: 'Professional tax', type: 'checkbox' }, { name: 'tds_enabled', label: 'Deduct TDS (new regime)', type: 'checkbox' },
      ]}
      onSubmit={async (v) => { await api.put(`/payroll/structures/${row.employee_id}`, v); onSaved(); return 'Salary saved'; }}>
      {s.data?.revisions?.length > 0 && (
        <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
          <div className="mb-1 font-semibold">Revision history</div>
          {s.data.revisions.map((r) => <div key={r.id}>{fmtDate(r.effective_from)}: {money(r.old_ctc)} → {money(r.new_ctc)} {r.note && `· ${r.note}`}</div>)}
        </div>
      )}
    </FormModal>
  );
}

export function PayrollPage() {
  const [tab, setTab] = useState('runs');
  const runs = useApi('/payroll/runs');
  const structures = useApi(tab === 'structures' ? '/payroll/structures' : null);
  const loans = useApi(tab === 'loans' ? '/payroll/loans?scope=all' : null);
  const [create, setCreate] = useState(false);
  const [edit, setEdit] = useState(null);
  const nav = useNavigate();
  const last = runs.data?.[0];
  return (
    <div>
      <PageHeader title="Payroll" subtitle="Monthly payroll with PF, ESI, PT and TDS computed automatically."
        actions={<button className="btn-primary" onClick={() => setCreate(true)}><Plus size={16} />Run payroll</button>} />
      {last && (
        <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label={`Last run · ${fmtMonth(last.month)}`} value={<Badge status={last.status} />} />
          <StatCard label="Employees paid" value={last.employees} tone="sky" />
          <StatCard label="Gross payout" value={money(last.gross)} tone="green" />
          <StatCard label="Net payout" value={money(last.net)} tone="violet" />
        </div>
      )}
      <Tabs tabs={[{ key: 'runs', label: 'Payroll runs' }, { key: 'structures', label: 'Salary structures' }, { key: 'loans', label: 'Loans & advances' }]} value={tab} onChange={setTab} />
      {tab === 'runs' && (
        <Card bodyClass="p-0">
          <Table rows={runs.data} onRowClick={(r) => nav(`/payroll/runs/${r.id}`)} empty={<Empty title="No payroll runs yet" hint="Set salary structures for your employees, then run payroll for a month." />} columns={[
            { key: 'month', label: 'Month', render: (r) => <span className="font-medium">{fmtMonth(r.month)}</span> }, { key: 'status', label: 'Status', render: (r) => <Badge status={r.status} /> },
            { key: 'employees', label: 'Employees' }, { key: 'gross', label: 'Gross', render: (r) => money(r.gross) }, { key: 'deductions', label: 'Deductions', render: (r) => money(r.deductions) },
            { key: 'net', label: 'Net pay', render: (r) => <span className="font-semibold">{money(r.net)}</span> }, { key: 'finalized_at', label: 'Finalized', render: (r) => fmtDate(r.finalized_at) },
          ]} />
        </Card>
      )}
      {tab === 'structures' && (
        <Card bodyClass="p-0">
          <Table rows={structures.data} searchable exportName="salary-structures" searchKeys={['first_name', 'last_name', 'emp_code', 'department']} onRowClick={setEdit} columns={[
            { key: 'first_name', label: 'Employee', render: (r) => <span className="font-medium">{r.first_name} {r.last_name}</span>, csv: (r) => `${r.first_name} ${r.last_name || ''}` },
            { key: 'emp_code', label: 'Code' }, { key: 'department', label: 'Department' },
            { key: 'ctc_annual', label: 'Annual CTC', render: (r) => (r.ctc_annual ? money(r.ctc_annual) : <Badge status="pending">Not set</Badge>) },
            { key: 'monthly', label: 'Monthly', render: (r) => money(r.ctc_annual ? r.ctc_annual / 12 : null), csv: (r) => (r.ctc_annual / 12 || 0).toFixed(0) },
            { key: 'flags', label: 'Statutory', csv: false, render: (r) => <div className="flex gap-1">{r.ctc_annual ? [['PF', r.pf_enabled], ['ESI', r.esi_enabled], ['PT', r.pt_enabled], ['TDS', r.tds_enabled]].filter(([, v]) => v).map(([k]) => <Badge key={k}>{k}</Badge>) : null}</div> },
            { key: 'effective_from', label: 'Effective', render: (r) => fmtDate(r.effective_from) },
          ]} />
        </Card>
      )}
      {tab === 'loans' && (
        <Card bodyClass="p-0">
          <Table rows={loans.data} exportName="loans" columns={[
            { key: 'employee_name', label: 'Employee', render: (r) => <span className="font-medium">{r.employee_name}</span> }, { key: 'kind', label: 'Type' },
            { key: 'amount', label: 'Amount', render: (r) => money(r.amount) }, { key: 'emi', label: 'EMI', render: (r) => money(r.emi) }, { key: 'balance', label: 'Outstanding', render: (r) => money(r.balance) },
            { key: 'status', label: 'Status', render: (r) => <Badge status={r.status} /> }, { key: 'reason', label: 'Reason' },
          ]} empty={<Empty title="No loans or advances" hint="Pending requests appear in your Inbox for approval. Approved EMIs are deducted automatically in payroll." />} />
        </Card>
      )}
      <FormModal open={create} onClose={() => setCreate(false)} title="Run payroll" submitLabel="Create draft" initial={{ month: dayjs().format('YYYY-MM') }}
        fields={[{ name: 'month', label: 'Payroll month', type: 'month', required: true, col: 2, hint: 'Creates a draft with payslips for every employee who has a salary structure. You can review and adjust before finalizing.' }]}
        onSubmit={async (v) => { const r = await api.post('/payroll/runs', v); nav(`/payroll/runs/${r.id}`); return 'Draft payroll created'; }} />
      <StructureModal row={edit} onClose={() => setEdit(null)} onSaved={structures.reload} />
    </div>
  );
}

export function PayrollRun() {
  const { id } = useParams();
  const { data, reload, error } = useApi(`/payroll/runs/${id}`);
  const [adj, setAdj] = useState(null);
  const toast = useToast(); const act = useAction(); const nav = useNavigate();
  if (error) return <ErrorBox error={error} />;
  if (!data) return <Loading />;
  const draft = data.status === 'draft';
  const sum = (k) => data.slips.reduce((s, x) => s + x[k], 0);
  const comp = (slip, list, name) => slip[list].find(([k]) => k === name)?.[1] || 0;
  const finalize = async () => { if (await toast.confirm({ title: 'Finalize payroll?', message: `This locks ${fmtMonth(data.month)} payroll, publishes payslips to employees, marks reimbursements paid and recovers loan EMIs. It cannot be undone.`, confirmLabel: 'Finalize', danger: false })) act(() => api.post(`/payroll/runs/${id}/finalize`).then(reload), 'Payroll finalized and payslips published'); };
  const del = async () => { if (await toast.confirm('Delete this draft payroll run?')) act(() => api.del(`/payroll/runs/${id}`).then(() => nav('/payroll')), 'Draft deleted'); };
  const bankFile = () => downloadCSV(`bank-transfer-${data.month}.csv`, data.slips, [
    { key: 'emp_code', label: 'Employee Code' }, { key: 'name', label: 'Name', csv: (r) => `${r.first_name} ${r.last_name || ''}` },
    { key: 'bank_account', label: 'Account Number' }, { key: 'ifsc', label: 'IFSC' }, { key: 'net', label: 'Amount' }, { key: 'ref', label: 'Narration', csv: () => `Salary ${fmtMonth(data.month)}` }]);
  return (
    <div>
      <PageHeader title={`Payroll · ${fmtMonth(data.month)}`} back={{ to: '/payroll', label: 'Payroll' }}
        subtitle={<span className="flex items-center gap-2"><Badge status={data.status} />{data.slips.length} employees · {data.working_days} calendar days</span>}
        actions={<>
          {draft && <button className="btn-ghost text-rose-600" onClick={del}><Trash2 size={15} />Delete</button>}
          {draft && <button className="btn-secondary" onClick={() => act(() => api.post(`/payroll/runs/${id}/recalculate`).then(reload), 'Recalculated with latest attendance & leave')}><RefreshCw size={15} />Recalculate</button>}
          <button className="btn-secondary" onClick={bankFile}><Download size={15} />Bank file</button>
          {draft && <button className="btn-primary" onClick={finalize}><Lock size={15} />Finalize & publish</button>}
        </>} />
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Gross earnings" value={money(sum('gross'))} tone="green" />
        <StatCard label="Deductions" value={money(sum('total_deductions'))} tone="rose" />
        <StatCard label="Net payout" value={money(sum('net'))} tone="brand" />
        <StatCard label="Employer PF + ESI" value={money(data.slips.reduce((s, x) => s + x.employer.reduce((a, [, v]) => a + v, 0), 0))} tone="slate" />
      </div>
      <Card bodyClass="p-0">
        <Table rows={data.slips} searchable exportName={`payroll-register-${data.month}`} searchKeys={['first_name', 'last_name', 'emp_code', 'department']} dense
          onRowClick={draft ? (r) => setAdj({ employee_id: r.employee_id, name: r.first_name, ...r.adjustments }) : undefined}
          columns={[
            { key: 'first_name', label: 'Employee', className: 'whitespace-nowrap', render: (r) => <div><div className="font-medium">{r.first_name} {r.last_name}</div><div className="text-xs text-slate-400">{r.emp_code} · {r.department}</div></div>, csv: (r) => `${r.first_name} ${r.last_name || ''}` },
            { key: 'paid_days', label: 'Paid days', render: (r) => <span>{r.paid_days}{r.lop_days > 0 && <span className="ml-1 text-xs text-rose-600">({r.lop_days} LOP)</span>}</span> },
            { key: 'basic', label: 'Basic', render: (r) => money(comp(r, 'earnings', 'Basic')), csv: (r) => comp(r, 'earnings', 'Basic') },
            { key: 'gross', label: 'Gross', render: (r) => money(r.gross) },
            { key: 'pf', label: 'PF', render: (r) => money(comp(r, 'deductions', 'Provident Fund')), csv: (r) => comp(r, 'deductions', 'Provident Fund') },
            { key: 'esi', label: 'ESI', render: (r) => money(comp(r, 'deductions', 'ESI')), csv: (r) => comp(r, 'deductions', 'ESI') },
            { key: 'pt', label: 'PT', render: (r) => money(comp(r, 'deductions', 'Professional Tax')), csv: (r) => comp(r, 'deductions', 'Professional Tax') },
            { key: 'tds', label: 'TDS', render: (r) => money(comp(r, 'deductions', 'Income Tax (TDS)')), csv: (r) => comp(r, 'deductions', 'Income Tax (TDS)') },
            { key: 'total_deductions', label: 'Deductions', render: (r) => money(r.total_deductions) },
            { key: 'net', label: 'Net pay', render: (r) => <span className="font-semibold">{money(r.net)}</span> },
            { key: 'x', label: '', csv: false, render: (r) => <Link onClick={(e) => e.stopPropagation()} to={`/payslip/${r.id}`} target="_blank" className="text-xs font-medium text-brand-600 hover:underline">Payslip</Link> },
          ]} />
      </Card>
      {draft && <p className="mt-3 text-xs text-slate-500">Click a row to add a bonus, one-off deduction or override loss-of-pay days.</p>}
      <FormModal open={!!adj} onClose={() => setAdj(null)} title={adj && `Adjust payslip · ${adj.name}`} initial={adj}
        fields={[
          { name: 'bonus', label: 'Additional earning (₹)', type: 'number' }, { name: 'other_earning_label', label: 'Earning label', placeholder: 'Bonus' },
          { name: 'other_deduction', label: 'Additional deduction (₹)', type: 'number' }, { name: 'other_deduction_label', label: 'Deduction label', placeholder: 'Other deduction' },
          { name: 'lop_override', label: 'Loss-of-pay days override', type: 'number', step: 0.5, col: 2, hint: 'Leave blank to compute from unpaid leave (and attendance, if enabled in settings)' },
        ]}
        onSubmit={async (v) => { await api.put(`/payroll/runs/${id}/slips/${v.employee_id}`, v); reload(); return 'Payslip updated'; }} />
    </div>
  );
}

export function Payslip() {
  const { id } = useParams();
  const { data, error } = useApi(`/payroll/payslips/${id}`);
  if (error) return <div className="p-8"><ErrorBox error={error} /></div>;
  if (!data) return <Loading />;
  const rows = Math.max(data.earnings.length, data.deductions.length);
  return (
    <div className="min-h-screen bg-slate-100 py-8 print:bg-white print:py-0">
      <div className="no-print mx-auto mb-4 flex max-w-3xl justify-between px-4">
        <button className="btn-secondary" onClick={() => (window.history.length > 1 ? window.history.back() : window.close())}><ArrowLeft size={15} />Back</button>
        <button className="btn-primary" onClick={() => window.print()}><Printer size={15} />Print / Save PDF</button>
      </div>
      <div className="print-area mx-auto max-w-3xl bg-white p-10 shadow-sm">
        <div className="flex items-start justify-between border-b-2 border-slate-800 pb-4">
          <div><h1 className="text-xl font-bold">{data.company.name}</h1>{data.company.address && <p className="whitespace-pre-line text-xs text-slate-500">{data.company.address}</p>}</div>
          <div className="text-right"><div className="text-sm font-semibold uppercase tracking-wide text-slate-500">Payslip</div><div className="text-lg font-semibold">{fmtMonth(data.month)}</div></div>
        </div>
        <div className="grid grid-cols-2 gap-x-8 gap-y-1.5 py-5 text-sm">
          {[['Employee name', `${data.first_name} ${data.last_name || ''}`], ['Employee code', data.emp_code], ['Designation', data.designation], ['Department', data.department],
            ['Date of joining', fmtDate(data.doj)], ['Location', data.location], ['PAN', data.pan], ['UAN', data.uan], ['Bank', data.bank_name], ['Account no.', data.bank_account ? `XXXX${data.bank_account.slice(-4)}` : null],
            ['Days in month', data.working_days], ['Paid days', data.paid_days], ...(data.lop_days ? [['Loss of pay days', data.lop_days]] : [])].map(([k, v]) => (
            <div key={k} className="flex"><span className="w-36 shrink-0 text-slate-500">{k}</span><span className="font-medium">{v || '—'}</span></div>
          ))}
        </div>
        <table className="w-full border border-slate-300 text-sm">
          <thead className="bg-slate-50"><tr><th className="border-b border-slate-300 px-3 py-2 text-left">Earnings</th><th className="border-b border-r border-slate-300 px-3 py-2 text-right">Amount</th><th className="border-b border-slate-300 px-3 py-2 text-left">Deductions</th><th className="border-b border-slate-300 px-3 py-2 text-right">Amount</th></tr></thead>
          <tbody>
            {Array.from({ length: rows }).map((_, i) => (
              <tr key={i}><td className="px-3 py-1.5">{data.earnings[i]?.[0]}</td><td className="border-r border-slate-300 px-3 py-1.5 text-right">{data.earnings[i] && money(data.earnings[i][1])}</td>
                <td className="px-3 py-1.5">{data.deductions[i]?.[0]}</td><td className="px-3 py-1.5 text-right">{data.deductions[i] && money(data.deductions[i][1])}</td></tr>
            ))}
            <tr className="border-t border-slate-300 bg-slate-50 font-semibold"><td className="px-3 py-2">Gross earnings</td><td className="border-r border-slate-300 px-3 py-2 text-right">{money(data.gross)}</td><td className="px-3 py-2">Total deductions</td><td className="px-3 py-2 text-right">{money(data.total_deductions)}</td></tr>
          </tbody>
        </table>
        <div className="mt-5 flex items-center justify-between rounded-lg bg-slate-800 px-5 py-4 text-white">
          <div><div className="text-xs uppercase tracking-wide text-slate-300">Net pay</div><div className="text-xs text-slate-300">Rupees {words(data.net)} only</div></div>
          <div className="text-2xl font-bold">{money(data.net)}</div>
        </div>
        {data.employer.length > 0 && <p className="mt-4 text-xs text-slate-500">Employer contributions (not part of net pay): {data.employer.map(([k, v]) => `${k} ${money(v)}`).join(' · ')}</p>}
        <p className="mt-8 text-center text-[11px] text-slate-400">This is a system-generated payslip and does not require a signature.</p>
      </div>
    </div>
  );
}
