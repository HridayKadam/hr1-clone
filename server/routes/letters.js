import { Router } from 'express';
import { all, get, run, insert, update, getSettings, audit } from '../db.js';
import { requireHR } from '../auth.js';
import { h, bad, notFound, today } from '../util.js';

/** HR letter templates with {{placeholders}} rendered against an employee. */
const r = Router();
r.use(requireHR);

const longDate = (d) => (d ? new Date(`${d}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : '');
const money = (n) => (n ? `₹${Number(n).toLocaleString('en-IN')}` : '');

export const PLACEHOLDERS = ['company', 'company_address', 'today', 'name', 'first_name', 'emp_code', 'designation', 'department', 'location',
  'doj', 'manager', 'ctc', 'address', 'last_working_day', 'exit_date', 'email'];

function context(employeeId) {
  const e = get(`SELECT e.*, d.name AS department, g.name AS designation, l.name AS location, s.ctc_annual,
    m.first_name || ' ' || COALESCE(m.last_name,'') AS manager, (SELECT last_working_day FROM resignations WHERE employee_id = e.id ORDER BY id DESC LIMIT 1) AS lwd
    FROM employees e LEFT JOIN departments d ON d.id = e.department_id LEFT JOIN designations g ON g.id = e.designation_id
    LEFT JOIN locations l ON l.id = e.location_id LEFT JOIN employees m ON m.id = e.manager_id LEFT JOIN salary_structures s ON s.employee_id = e.id
    WHERE e.id = ?`, employeeId);
  if (!e) throw notFound('Employee not found');
  const s = getSettings();
  return {
    company: s.company_name, company_address: s.company_address || '', today: longDate(today()),
    name: [e.first_name, e.last_name].filter(Boolean).join(' '), first_name: e.first_name, emp_code: e.emp_code || '', email: e.email,
    designation: e.designation || '', department: e.department || '', location: e.location || '', doj: longDate(e.doj),
    manager: e.manager || '', ctc: money(e.ctc_annual), address: e.address || '', last_working_day: longDate(e.lwd || e.exit_date), exit_date: longDate(e.exit_date),
  };
}

r.get('/templates', h((_req, res) => res.json({ templates: all('SELECT * FROM letter_templates ORDER BY name'), placeholders: PLACEHOLDERS })));
r.post('/templates', h((req, res) => {
  if (!req.body.name || !req.body.body) throw bad('Name and content are required');
  res.json({ id: insert('letter_templates', req.body, ['name', 'body']) });
}));
r.put('/templates/:id', h((req, res) => { update('letter_templates', req.params.id, req.body, ['name', 'body']); res.json({ ok: true }); }));
r.delete('/templates/:id', h((req, res) => { run('DELETE FROM letter_templates WHERE id = ?', req.params.id); res.json({ ok: true }); }));

r.post('/render', h((req, res) => {
  const t = get('SELECT * FROM letter_templates WHERE id = ?', req.body.template_id);
  if (!t) throw notFound('Template not found');
  const ctx = context(req.body.employee_id);
  const body = t.body.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k) => (k in ctx ? ctx[k] : m));
  audit(req.user.id, 'generate_letter', 'employee', Number(req.body.employee_id), { template: t.name });
  res.json({ title: t.name, body, company: ctx.company, company_address: ctx.company_address });
}));

export default r;
