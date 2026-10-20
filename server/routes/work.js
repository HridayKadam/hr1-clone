import { Router } from 'express';
import { all, get, run, insert, update, notify } from '../db.js';
import { upload, filePath } from '../upload.js';
import { h, bad, forbidden, notFound, isHR, canManage, reportIds, today, addDays } from '../util.js';

/** Expenses & reimbursements, plus project timesheets. */
const r = Router();

const scopeWhere = (req, alias = 'x') => {
  const { scope, employee_id } = req.query;
  if (scope === 'all' && isHR(req.user)) return ['1=1', []];
  if (scope === 'team') {
    const ids = reportIds(req.user.id);
    return ids.length ? [`${alias}.employee_id IN (${ids.map(() => '?').join(',')})`, ids] : ['0=1', []];
  }
  const id = Number(employee_id || req.user.id);
  if (id !== req.user.id && !canManage(req.user, id)) throw forbidden();
  return [`${alias}.employee_id = ?`, [id]];
};

// ----- Expenses -----
r.get('/expenses', h((req, res) => {
  const [w, p] = scopeWhere(req);
  const status = req.query.status ? ' AND x.status = ?' : '';
  res.json(all(`SELECT x.*, e.first_name || ' ' || COALESCE(e.last_name,'') AS employee_name FROM expenses x JOIN employees e ON e.id = x.employee_id
    WHERE ${w}${status} ORDER BY x.date DESC, x.id DESC LIMIT 500`, ...p, ...(req.query.status ? [req.query.status] : [])));
}));
r.post('/expenses', upload.single('receipt'), h((req, res) => {
  const amount = Number(req.body.amount);
  if (!req.body.category || !(amount > 0) || !req.body.date) throw bad('Category, amount and date are required');
  if (req.body.date > today()) throw bad('Expense date cannot be in the future');
  const id = insert('expenses', { employee_id: req.user.id, category: req.body.category, amount, date: req.body.date,
    description: req.body.description, receipt: req.file?.filename });
  notify(req.user.manager_id, `${req.user.first_name} submitted a ${req.body.category} claim of ₹${amount}`, '/inbox');
  res.json({ id });
}));
r.get('/expenses/:id/receipt', h((req, res) => {
  const x = get('SELECT * FROM expenses WHERE id = ?', req.params.id);
  if (!x?.receipt) throw notFound('No receipt attached');
  if (x.employee_id !== req.user.id && !canManage(req.user, x.employee_id)) throw forbidden();
  res.sendFile(filePath(x.receipt));
}));
r.delete('/expenses/:id', h((req, res) => {
  const x = get('SELECT * FROM expenses WHERE id = ?', req.params.id);
  if (!x || x.employee_id !== req.user.id) throw forbidden();
  if (x.status !== 'pending') throw bad('Only pending claims can be withdrawn');
  run(`UPDATE expenses SET status = 'cancelled' WHERE id = ?`, x.id);
  res.json({ ok: true });
}));

// ----- Timesheets -----
r.get('/timesheets', h((req, res) => {
  const [w, p] = scopeWhere(req);
  const from = req.query.from || addDays(today(), -30); const to = req.query.to || addDays(today(), 7);
  res.json(all(`SELECT x.*, p.name AS project, e.first_name || ' ' || COALESCE(e.last_name,'') AS employee_name FROM time_entries x
    JOIN employees e ON e.id = x.employee_id LEFT JOIN projects p ON p.id = x.project_id
    WHERE ${w} AND x.date BETWEEN ? AND ? ORDER BY x.date DESC, x.id DESC`, ...p, from, to));
}));
r.post('/timesheets', h((req, res) => {
  const entries = Array.isArray(req.body.entries) ? req.body.entries : [req.body];
  const ids = [];
  for (const e of entries) {
    const hours = Number(e.hours);
    if (!e.date || !(hours > 0) || hours > 24) throw bad('Each entry needs a date and 0–24 hours');
    const day = get(`SELECT COALESCE(SUM(hours),0) n FROM time_entries WHERE employee_id = ? AND date = ? AND status != 'rejected'`, req.user.id, e.date).n;
    if (day + hours > 24) throw bad(`More than 24 hours logged on ${e.date}`);
    ids.push(insert('time_entries', { employee_id: req.user.id, project_id: e.project_id || null, date: e.date, hours, description: e.description }));
  }
  if (ids.length) notify(req.user.manager_id, `${req.user.first_name} submitted ${ids.length} timesheet entr${ids.length > 1 ? 'ies' : 'y'}`, '/inbox');
  res.json({ ids });
}));
r.put('/timesheets/:id', h((req, res) => {
  const x = get('SELECT * FROM time_entries WHERE id = ?', req.params.id);
  if (!x || x.employee_id !== req.user.id) throw forbidden();
  if (x.status === 'approved') throw bad('Approved entries cannot be edited');
  update('time_entries', x.id, { ...req.body, status: 'pending' }, ['project_id', 'date', 'hours', 'description', 'status']);
  res.json({ ok: true });
}));
r.delete('/timesheets/:id', h((req, res) => {
  const x = get('SELECT * FROM time_entries WHERE id = ?', req.params.id);
  if (!x || x.employee_id !== req.user.id) throw forbidden();
  if (x.status === 'approved') throw bad('Approved entries cannot be deleted');
  run('DELETE FROM time_entries WHERE id = ?', x.id);
  res.json({ ok: true });
}));

export default r;
