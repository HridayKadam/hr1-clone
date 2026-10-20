import { Router } from 'express';
import { all, get, run, insert, tx, notify, audit, getSettings } from '../db.js';
import { requireHR } from '../auth.js';
import { computePayslip, breakup, annualTaxNewRegime } from '../payroll.js';
import { h, bad, forbidden, notFound, isHR, today, daysInMonth } from '../util.js';

const r = Router();
const parse = (p) => ({ ...p, earnings: JSON.parse(p.earnings || '[]'), deductions: JSON.parse(p.deductions || '[]'),
  employer: JSON.parse(p.employer || '[]'), adjustments: JSON.parse(p.adjustments || '{}') });

// ----- Salary structures -----
r.get('/structures', requireHR, h((_req, res) => {
  res.json(all(`SELECT e.id AS employee_id, e.emp_code, e.first_name, e.last_name, d.name AS department, s.ctc_annual, s.basic_pct, s.hra_pct,
    s.pf_enabled, s.esi_enabled, s.pt_enabled, s.tds_enabled, s.effective_from FROM employees e
    LEFT JOIN salary_structures s ON s.employee_id = e.id LEFT JOIN departments d ON d.id = e.department_id
    WHERE e.status = 'active' ORDER BY e.first_name`));
}));
r.get('/structures/:employeeId', h((req, res) => {
  const id = Number(req.params.employeeId);
  if (id !== req.user.id && !isHR(req.user)) throw forbidden();
  const s = get('SELECT * FROM salary_structures WHERE employee_id = ?', id);
  if (!s) return res.json(null);
  const b = breakup(s);
  const annualTax = s.tds_enabled ? annualTaxNewRegime(Math.max(0, b.gross * 12 - 75000)) : 0;
  res.json({ ...s, breakup: b, annual_tax: annualTax, revisions: all('SELECT * FROM salary_revisions WHERE employee_id = ? ORDER BY id DESC', id) });
}));
r.put('/structures/:employeeId', requireHR, h((req, res) => {
  const id = Number(req.params.employeeId);
  const b = req.body;
  const ctc = Number(b.ctc_annual);
  if (!(ctc >= 0)) throw bad('Enter a valid annual CTC');
  const prev = get('SELECT * FROM salary_structures WHERE employee_id = ?', id);
  const num = (v) => (v === '' || v == null ? null : Number(v));
  run(`INSERT INTO salary_structures (employee_id, ctc_annual, basic_pct, hra_pct, pf_enabled, esi_enabled, pt_enabled, tds_enabled, effective_from, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?, CURRENT_TIMESTAMP) ON CONFLICT(employee_id) DO UPDATE SET ctc_annual = excluded.ctc_annual, basic_pct = excluded.basic_pct,
    hra_pct = excluded.hra_pct, pf_enabled = excluded.pf_enabled, esi_enabled = excluded.esi_enabled, pt_enabled = excluded.pt_enabled,
    tds_enabled = excluded.tds_enabled, effective_from = excluded.effective_from, updated_at = CURRENT_TIMESTAMP`,
  id, ctc, num(b.basic_pct), num(b.hra_pct), b.pf_enabled ? 1 : 0, b.esi_enabled ? 1 : 0, b.pt_enabled ? 1 : 0, b.tds_enabled ? 1 : 0, b.effective_from || today());
  if (!prev || prev.ctc_annual !== ctc) {
    insert('salary_revisions', { employee_id: id, old_ctc: prev?.ctc_annual ?? 0, new_ctc: ctc, effective_from: b.effective_from || today(), note: b.note });
    if (prev) notify(id, 'Your salary structure has been revised', '/me/payslips');
  }
  audit(req.user.id, 'salary_update', 'employee', id, { ctc });
  res.json({ ok: true });
}));

// ----- Payroll runs -----
r.get('/runs', requireHR, h((_req, res) => {
  res.json(all(`SELECT r.*, COUNT(p.id) AS employees, COALESCE(SUM(p.gross),0) AS gross, COALESCE(SUM(p.net),0) AS net,
    COALESCE(SUM(p.total_deductions),0) AS deductions FROM payroll_runs r LEFT JOIN payslips p ON p.run_id = r.id GROUP BY r.id ORDER BY r.month DESC`));
}));

function eligible(month) {
  const from = `${month}-01`; const to = `${month}-${String(daysInMonth(month)).padStart(2, '0')}`;
  return all(`SELECT e.* FROM employees e JOIN salary_structures s ON s.employee_id = e.id WHERE s.ctc_annual > 0
    AND (e.doj IS NULL OR e.doj <= ?) AND (e.exit_date IS NULL OR e.exit_date >= ?) AND (e.status = 'active' OR e.exit_date >= ?)`, to, from, from);
}
function writeSlip(runId, slip) {
  run(`INSERT INTO payslips (run_id, employee_id, working_days, paid_days, lop_days, earnings, deductions, employer, adjustments, gross, total_deductions, net)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(run_id, employee_id) DO UPDATE SET working_days = excluded.working_days, paid_days = excluded.paid_days,
    lop_days = excluded.lop_days, earnings = excluded.earnings, deductions = excluded.deductions, employer = excluded.employer,
    adjustments = excluded.adjustments, gross = excluded.gross, total_deductions = excluded.total_deductions, net = excluded.net`,
  runId, slip.employee_id, slip.working_days, slip.paid_days, slip.lop_days, JSON.stringify(slip.earnings), JSON.stringify(slip.deductions),
  JSON.stringify(slip.employer), JSON.stringify(slip.adjustments || {}), slip.gross, slip.total_deductions, slip.net);
}

r.post('/runs', requireHR, h((req, res) => {
  const month = String(req.body.month || '');
  if (!/^\d{4}-\d{2}$/.test(month)) throw bad('Choose a month');
  if (get('SELECT 1 FROM payroll_runs WHERE month = ?', month)) throw bad('A payroll run for this month already exists');
  const settings = getSettings();
  const id = tx(() => {
    const runId = insert('payroll_runs', { month, working_days: daysInMonth(month), created_by: req.user.id });
    for (const e of eligible(month)) { const slip = computePayslip(e, month, {}, settings); if (slip) writeSlip(runId, slip); }
    return runId;
  });
  audit(req.user.id, 'create', 'payroll_run', id, { month });
  res.json({ id });
}));

r.get('/runs/:id', requireHR, h((req, res) => {
  const runRow = get('SELECT * FROM payroll_runs WHERE id = ?', req.params.id);
  if (!runRow) throw notFound();
  const slips = all(`SELECT p.*, e.emp_code, e.first_name, e.last_name, e.bank_account, e.ifsc, e.pan, e.uan, d.name AS department FROM payslips p
    JOIN employees e ON e.id = p.employee_id LEFT JOIN departments d ON d.id = e.department_id WHERE p.run_id = ? ORDER BY e.first_name`, runRow.id).map(parse);
  res.json({ ...runRow, slips });
}));

/** Recalculate all (or one) payslip in a draft run, e.g. after attendance/leave corrections or adjustments. */
r.post('/runs/:id/recalculate', requireHR, h((req, res) => {
  const runRow = get('SELECT * FROM payroll_runs WHERE id = ?', req.params.id);
  if (!runRow) throw notFound();
  if (runRow.status !== 'draft') throw bad('Finalized payroll cannot be changed');
  const settings = getSettings();
  tx(() => {
    const existing = Object.fromEntries(all('SELECT employee_id, adjustments FROM payslips WHERE run_id = ?', runRow.id).map((p) => [p.employee_id, JSON.parse(p.adjustments || '{}')]));
    const emps = eligible(runRow.month);
    if (emps.length) run(`DELETE FROM payslips WHERE run_id = ? AND employee_id NOT IN (${emps.map(() => '?').join(',')})`, runRow.id, ...emps.map((e) => e.id));
    else run('DELETE FROM payslips WHERE run_id = ?', runRow.id);
    for (const e of emps) { const slip = computePayslip(e, runRow.month, existing[e.id] || {}, settings); if (slip) writeSlip(runRow.id, slip); }
  });
  res.json({ ok: true });
}));

r.put('/runs/:id/slips/:employeeId', requireHR, h((req, res) => {
  const runRow = get('SELECT * FROM payroll_runs WHERE id = ?', req.params.id);
  if (!runRow) throw notFound();
  if (runRow.status !== 'draft') throw bad('Finalized payroll cannot be changed');
  const e = get('SELECT * FROM employees WHERE id = ?', req.params.employeeId);
  const adj = {
    bonus: Number(req.body.bonus || 0), other_earning_label: req.body.other_earning_label || '',
    other_deduction: Number(req.body.other_deduction || 0), other_deduction_label: req.body.other_deduction_label || '',
    lop_override: req.body.lop_override === '' || req.body.lop_override == null ? null : Number(req.body.lop_override),
  };
  const slip = computePayslip(e, runRow.month, adj);
  if (!slip) throw bad('This employee has no salary structure');
  writeSlip(runRow.id, slip);
  res.json({ ok: true });
}));

r.post('/runs/:id/finalize', requireHR, h((req, res) => {
  const runRow = get('SELECT * FROM payroll_runs WHERE id = ?', req.params.id);
  if (!runRow) throw notFound();
  if (runRow.status !== 'draft') throw bad('Already finalized');
  const to = `${runRow.month}-${String(daysInMonth(runRow.month)).padStart(2, '0')}`;
  tx(() => {
    for (const p of all('SELECT * FROM payslips WHERE run_id = ?', runRow.id)) {
      const ded = JSON.parse(p.deductions);
      if (ded.some(([k]) => k === 'Loan / Advance EMI')) {
        for (const l of all(`SELECT * FROM loans WHERE employee_id = ? AND status = 'approved' AND balance > 0`, p.employee_id)) {
          const bal = Math.max(0, l.balance - Math.min(l.emi, l.balance));
          run(`UPDATE loans SET balance = ?, status = CASE WHEN ? = 0 THEN 'closed' ELSE status END WHERE id = ?`, bal, bal, l.id);
        }
      }
      if (JSON.parse(p.earnings).some(([k]) => k === 'Reimbursements')) {
        run(`UPDATE expenses SET status = 'paid', paid_run_id = ? WHERE employee_id = ? AND status = 'approved' AND paid_run_id IS NULL AND date <= ?`, runRow.id, p.employee_id, to);
      }
      notify(p.employee_id, `Your payslip for ${runRow.month} is available`, '/me/payslips');
    }
    run(`UPDATE payroll_runs SET status = 'finalized', finalized_at = ? WHERE id = ?`, new Date().toISOString(), runRow.id);
  });
  audit(req.user.id, 'finalize', 'payroll_run', runRow.id, { month: runRow.month });
  res.json({ ok: true });
}));

r.delete('/runs/:id', requireHR, h((req, res) => {
  const runRow = get('SELECT * FROM payroll_runs WHERE id = ?', req.params.id);
  if (!runRow) throw notFound();
  if (runRow.status !== 'draft') throw bad('Finalized payroll cannot be deleted');
  run('DELETE FROM payroll_runs WHERE id = ?', runRow.id);
  res.json({ ok: true });
}));

// ----- Employee self-service -----
r.get('/my-payslips', h((req, res) => {
  const id = Number(req.query.employee_id || req.user.id);
  if (id !== req.user.id && !isHR(req.user)) throw forbidden();
  res.json(all(`SELECT p.id, p.gross, p.net, p.total_deductions, r.month FROM payslips p JOIN payroll_runs r ON r.id = p.run_id
    WHERE p.employee_id = ? AND r.status = 'finalized' ORDER BY r.month DESC`, id));
}));
r.get('/payslips/:id', h((req, res) => {
  const p = get(`SELECT p.*, r.month, r.status AS run_status, e.emp_code, e.first_name, e.last_name, e.doj, e.pan, e.uan, e.bank_name, e.bank_account,
    d.name AS department, g.name AS designation, l.name AS location FROM payslips p JOIN payroll_runs r ON r.id = p.run_id
    JOIN employees e ON e.id = p.employee_id LEFT JOIN departments d ON d.id = e.department_id LEFT JOIN designations g ON g.id = e.designation_id
    LEFT JOIN locations l ON l.id = e.location_id WHERE p.id = ?`, req.params.id);
  if (!p) throw notFound();
  if (!isHR(req.user) && (p.employee_id !== req.user.id || p.run_status !== 'finalized')) throw forbidden();
  const s = getSettings();
  res.json({ ...parse(p), company: { name: s.company_name, address: s.company_address } });
}));

// ----- Loans & advances -----
r.get('/loans', h((req, res) => {
  if (req.query.scope === 'all' && isHR(req.user)) {
    return res.json(all(`SELECT l.*, e.first_name || ' ' || COALESCE(e.last_name,'') AS employee_name FROM loans l JOIN employees e ON e.id = l.employee_id ORDER BY l.id DESC`));
  }
  res.json(all('SELECT * FROM loans WHERE employee_id = ? ORDER BY id DESC', req.user.id));
}));
r.post('/loans', h((req, res) => {
  const amount = Number(req.body.amount); const emi = Number(req.body.emi);
  if (!(amount > 0) || !(emi > 0)) throw bad('Enter amount and monthly EMI');
  if (emi > amount) throw bad('EMI cannot exceed the amount');
  const id = insert('loans', { employee_id: req.user.id, kind: req.body.kind || 'Salary Advance', amount, emi, balance: 0, reason: req.body.reason });
  res.json({ id });
}));

export default r;
