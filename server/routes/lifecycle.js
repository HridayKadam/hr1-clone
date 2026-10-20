import { Router } from 'express';
import { all, get, run, insert, notify } from '../db.js';
import { requireHR } from '../auth.js';
import { h, bad, forbidden, notFound, isHR, canManage, today, addDays } from '../util.js';

/** Onboarding / offboarding checklists and resignations. */
const r = Router();

r.get('/tasks', h((req, res) => {
  const { employee_id, kind, scope } = req.query;
  if (scope === 'all') {
    if (!isHR(req.user)) throw forbidden();
    return res.json(all(`SELECT e.id AS employee_id, e.first_name || ' ' || COALESCE(e.last_name,'') AS employee_name, e.doj, e.exit_date, t.kind,
      COUNT(*) AS total, SUM(t.done) AS done, MIN(CASE WHEN t.done = 0 THEN t.due_date END) AS next_due
      FROM lifecycle_tasks t JOIN employees e ON e.id = t.employee_id ${kind ? 'WHERE t.kind = ?' : ''}
      GROUP BY e.id, t.kind ORDER BY (SUM(t.done) = COUNT(*)), next_due`, ...(kind ? [kind] : [])));
  }
  const id = Number(employee_id || req.user.id);
  if (id !== req.user.id && !canManage(req.user, id)) throw forbidden();
  res.json(all(`SELECT t.*, d.first_name AS done_by_name FROM lifecycle_tasks t LEFT JOIN employees d ON d.id = t.done_by
    WHERE t.employee_id = ? ${kind ? 'AND t.kind = ?' : ''} ORDER BY t.kind, t.due_date, t.id`, id, ...(kind ? [kind] : [])));
}));
r.post('/tasks', requireHR, h((req, res) => {
  const { employee_id, kind, title, owner, due_date } = req.body;
  if (!employee_id || !title) throw bad('Employee and task are required');
  res.json({ id: insert('lifecycle_tasks', { employee_id, kind: kind || 'onboarding', title, owner: owner || 'hr', due_date }) });
}));
r.put('/tasks/:id', h((req, res) => {
  const t = get('SELECT * FROM lifecycle_tasks WHERE id = ?', req.params.id);
  if (!t) throw notFound();
  const mayEdit = isHR(req.user) || (t.owner === 'employee' && t.employee_id === req.user.id) || (t.owner === 'manager' && canManage(req.user, t.employee_id));
  if (!mayEdit) throw forbidden('This task is owned by someone else');
  const done = req.body.done ? 1 : 0;
  run('UPDATE lifecycle_tasks SET done = ?, done_at = ?, done_by = ? WHERE id = ?', done, done ? new Date().toISOString() : null, done ? req.user.id : null, t.id);
  res.json({ ok: true });
}));
r.delete('/tasks/:id', requireHR, h((req, res) => { run('DELETE FROM lifecycle_tasks WHERE id = ?', req.params.id); res.json({ ok: true }); }));

// ----- Resignations -----
r.get('/resignations', h((req, res) => {
  if (req.query.scope === 'all') {
    if (!isHR(req.user)) throw forbidden();
    return res.json(all(`SELECT r.*, e.first_name || ' ' || COALESCE(e.last_name,'') AS employee_name, e.emp_code, e.status AS employee_status
      FROM resignations r JOIN employees e ON e.id = r.employee_id ORDER BY r.id DESC`));
  }
  res.json(all('SELECT * FROM resignations WHERE employee_id = ? ORDER BY id DESC', req.user.id));
}));
r.post('/resignations', h((req, res) => {
  if (get(`SELECT 1 FROM resignations WHERE employee_id = ? AND status IN ('pending','approved')`, req.user.id)) throw bad('You already have an active resignation');
  const notice = Number(req.body.notice_days || 30);
  const id = insert('resignations', { employee_id: req.user.id, resign_date: today(), last_working_day: req.body.last_working_day || addDays(today(), notice), reason: req.body.reason });
  notify(req.user.manager_id, `${req.user.first_name} has submitted a resignation`, '/inbox');
  res.json({ id });
}));
r.delete('/resignations/:id', h((req, res) => {
  const x = get('SELECT * FROM resignations WHERE id = ?', req.params.id);
  if (!x || (x.employee_id !== req.user.id && !isHR(req.user))) throw forbidden();
  if (x.status !== 'pending' && !isHR(req.user)) throw bad('Contact HR to withdraw an approved resignation');
  run(`UPDATE resignations SET status = 'withdrawn' WHERE id = ?`, x.id);
  if (x.status === 'approved') {
    run('UPDATE employees SET exit_date = NULL WHERE id = ?', x.employee_id);
    run(`DELETE FROM lifecycle_tasks WHERE employee_id = ? AND kind = 'offboarding' AND done = 0`, x.employee_id);
  }
  res.json({ ok: true });
}));
/** Mark the employee as exited (after full & final). Deactivates login. */
r.post('/exit/:employeeId', requireHR, h((req, res) => {
  const id = Number(req.params.employeeId);
  if (id === req.user.id) throw bad('You cannot exit yourself');
  run(`UPDATE employees SET status = 'exited', exit_date = COALESCE(?, exit_date, ?) WHERE id = ?`, req.body.exit_date || null, today(), id);
  run(`UPDATE resignations SET status = 'completed' WHERE employee_id = ? AND status = 'approved'`, id);
  run(`UPDATE employees SET manager_id = (SELECT manager_id FROM employees WHERE id = ?) WHERE manager_id = ?`, id, id);
  res.json({ ok: true });
}));

export default r;
