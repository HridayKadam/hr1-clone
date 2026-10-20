import { Router } from 'express';
import { all, get, run, insert, update, tx, notify } from '../db.js';
import { requireHR } from '../auth.js';
import { h, bad, forbidden, notFound, isHR, canManage, reportIds } from '../util.js';

const r = Router();
const GOAL_FIELDS = ['title', 'description', 'kind', 'target', 'weight', 'progress', 'due_date', 'status', 'cycle_id', 'parent_id'];

r.get('/goals', h((req, res) => {
  const { scope, cycle_id } = req.query;
  // Goal titles are visible company-wide so anyone can align their goals to team/company objectives.
  if (scope === 'alignable') {
    return res.json(all(`SELECT g.id, g.title, g.kind, e.first_name || ' ' || COALESCE(e.last_name,'') AS employee_name FROM goals g
      JOIN employees e ON e.id = g.employee_id WHERE g.status != 'completed' ORDER BY g.id`));
  }
  let where = 'g.employee_id = ?'; let p = [Number(req.query.employee_id || req.user.id)];
  if (scope === 'team') { const ids = reportIds(req.user.id); if (!ids.length) return res.json([]); where = `g.employee_id IN (${ids.map(() => '?').join(',')})`; p = ids; }
  else if (scope === 'all' && isHR(req.user)) { where = '1=1'; p = []; }
  else if (p[0] !== req.user.id && !canManage(req.user, p[0])) throw forbidden();
  if (cycle_id) { where += ' AND g.cycle_id = ?'; p.push(cycle_id); }
  res.json(all(`SELECT g.*, c.name AS cycle, e.first_name || ' ' || COALESCE(e.last_name,'') AS employee_name, pg.title AS parent_title
    FROM goals g JOIN employees e ON e.id = g.employee_id LEFT JOIN review_cycles c ON c.id = g.cycle_id LEFT JOIN goals pg ON pg.id = g.parent_id
    WHERE ${where} ORDER BY g.due_date IS NULL, g.due_date, g.id`, ...p));
}));
r.post('/goals', h((req, res) => {
  const employeeId = Number(req.body.employee_id || req.user.id);
  if (employeeId !== req.user.id && !canManage(req.user, employeeId)) throw forbidden();
  if (!req.body.title) throw bad('Goal title is required');
  const id = insert('goals', { ...req.body, employee_id: employeeId }, ['employee_id', ...GOAL_FIELDS]);
  if (employeeId !== req.user.id) notify(employeeId, `A new goal was assigned to you: ${req.body.title}`, '/me/performance');
  res.json({ id });
}));
r.put('/goals/:id', h((req, res) => {
  const g = get('SELECT * FROM goals WHERE id = ?', req.params.id);
  if (!g) throw notFound();
  if (g.employee_id !== req.user.id && !canManage(req.user, g.employee_id)) throw forbidden();
  const body = { ...req.body };
  if (body.progress != null) body.progress = Math.max(0, Math.min(100, Number(body.progress)));
  if (body.progress === 100 && !body.status) body.status = 'completed';
  update('goals', g.id, body, GOAL_FIELDS);
  res.json({ ok: true });
}));
r.delete('/goals/:id', h((req, res) => {
  const g = get('SELECT * FROM goals WHERE id = ?', req.params.id);
  if (!g) throw notFound();
  if (g.employee_id !== req.user.id && !canManage(req.user, g.employee_id)) throw forbidden();
  run('DELETE FROM goals WHERE id = ?', g.id);
  res.json({ ok: true });
}));

// ----- Reviews -----
r.get('/reviews', h((req, res) => {
  const { scope, cycle_id } = req.query;
  let where; let p;
  if (scope === 'all' && isHR(req.user)) { where = '1=1'; p = []; }
  else if (scope === 'team') { where = 'v.reviewer_id = ?'; p = [req.user.id]; }
  else { where = 'v.employee_id = ?'; p = [req.user.id]; }
  if (cycle_id) { where += ' AND v.cycle_id = ?'; p.push(cycle_id); }
  res.json(all(`SELECT v.*, c.name AS cycle, c.status AS cycle_status, e.first_name || ' ' || COALESCE(e.last_name,'') AS employee_name,
    m.first_name || ' ' || COALESCE(m.last_name,'') AS reviewer_name FROM reviews v JOIN review_cycles c ON c.id = v.cycle_id
    JOIN employees e ON e.id = v.employee_id LEFT JOIN employees m ON m.id = v.reviewer_id WHERE ${where} ORDER BY c.id DESC, e.first_name`, ...p));
}));
/** Launch a cycle: create a review for every active employee with their manager as reviewer. */
r.post('/cycles/:id/launch', requireHR, h((req, res) => {
  const c = get('SELECT * FROM review_cycles WHERE id = ?', req.params.id);
  if (!c) throw notFound();
  let n = 0;
  tx(() => {
    for (const e of all(`SELECT id, manager_id FROM employees WHERE status = 'active'`)) {
      const r0 = run('INSERT OR IGNORE INTO reviews (cycle_id, employee_id, reviewer_id) VALUES (?,?,?)', c.id, e.id, e.manager_id);
      if (r0.changes) { n++; notify(e.id, `Performance review "${c.name}" has started. Submit your self review.`, '/me/performance'); }
    }
    run(`UPDATE review_cycles SET status = 'active' WHERE id = ?`, c.id);
  });
  res.json({ ok: true, created: n });
}));
r.put('/reviews/:id', h((req, res) => {
  const v = get('SELECT v.*, c.status AS cycle_status FROM reviews v JOIN review_cycles c ON c.id = v.cycle_id WHERE v.id = ?', req.params.id);
  if (!v) throw notFound();
  if (v.cycle_status === 'closed') throw bad('This review cycle is closed');
  const b = req.body;
  const rating = (x) => { const n = Number(x); if (!(n >= 1 && n <= 5)) throw bad('Rating must be between 1 and 5'); return n; };
  if (b.stage === 'self') {
    if (v.employee_id !== req.user.id) throw forbidden();
    if (v.status !== 'self_pending') throw bad('Self review already submitted');
    run(`UPDATE reviews SET self_rating = ?, self_comment = ?, status = ? WHERE id = ?`, rating(b.self_rating), b.self_comment || '', v.reviewer_id ? 'manager_pending' : 'completed', v.id);
    notify(v.reviewer_id, 'A self review is ready for your assessment', '/team/performance');
  } else if (b.stage === 'manager') {
    if (v.reviewer_id !== req.user.id && !isHR(req.user)) throw forbidden();
    const mr = rating(b.manager_rating);
    run(`UPDATE reviews SET manager_rating = ?, manager_comment = ?, final_rating = ?, status = 'completed' WHERE id = ?`, mr, b.manager_comment || '', b.final_rating ? rating(b.final_rating) : mr, v.id);
    notify(v.employee_id, 'Your performance review has been completed', '/me/performance');
  } else throw bad('Unknown review stage');
  res.json({ ok: true });
}));

export default r;
