import { Router } from 'express';
import { all, get, run, insert, update, notify } from '../db.js';
import { h, bad, forbidden, notFound, isHR } from '../util.js';

const r = Router();

const canSee = (user, t) => t.employee_id === user.id || t.assignee_id === user.id || isHR(user);

r.get('/', h((req, res) => {
  const all_ = req.query.scope === 'all' && isHR(req.user);
  const status = req.query.status;
  const w = []; const p = [];
  if (!all_) { w.push('(t.employee_id = ? OR t.assignee_id = ?)'); p.push(req.user.id, req.user.id); }
  if (status) { w.push('t.status = ?'); p.push(status); }
  res.json(all(`SELECT t.*, e.first_name || ' ' || COALESCE(e.last_name,'') AS employee_name, a.first_name || ' ' || COALESCE(a.last_name,'') AS assignee_name,
    (SELECT COUNT(*) FROM ticket_comments c WHERE c.ticket_id = t.id) AS comments
    FROM tickets t JOIN employees e ON e.id = t.employee_id LEFT JOIN employees a ON a.id = t.assignee_id
    ${w.length ? `WHERE ${w.join(' AND ')}` : ''} ORDER BY CASE t.status WHEN 'open' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END, t.id DESC`, ...p));
}));
r.post('/', h((req, res) => {
  if (!req.body.subject) throw bad('Subject is required');
  const id = insert('tickets', { employee_id: req.user.id, category: req.body.category, subject: req.body.subject, description: req.body.description, priority: req.body.priority || 'medium' });
  for (const hr of all(`SELECT id FROM employees WHERE role IN ('hr','admin') AND status = 'active' AND id != ?`, req.user.id)) notify(hr.id, `New helpdesk ticket: ${req.body.subject}`, `/helpdesk/${id}`);
  res.json({ id });
}));
r.get('/:id', h((req, res) => {
  const t = get(`SELECT t.*, e.first_name || ' ' || COALESCE(e.last_name,'') AS employee_name, a.first_name || ' ' || COALESCE(a.last_name,'') AS assignee_name
    FROM tickets t JOIN employees e ON e.id = t.employee_id LEFT JOIN employees a ON a.id = t.assignee_id WHERE t.id = ?`, req.params.id);
  if (!t) throw notFound();
  if (!canSee(req.user, t)) throw forbidden();
  t.thread = all(`SELECT c.*, e.first_name || ' ' || COALESCE(e.last_name,'') AS author FROM ticket_comments c LEFT JOIN employees e ON e.id = c.author_id
    WHERE c.ticket_id = ? ORDER BY c.id`, t.id);
  res.json(t);
}));
r.put('/:id', h((req, res) => {
  const t = get('SELECT * FROM tickets WHERE id = ?', req.params.id);
  if (!t) throw notFound();
  if (!isHR(req.user) && t.assignee_id !== req.user.id) {
    if (t.employee_id === req.user.id && req.body.status === 'closed') { run(`UPDATE tickets SET status = 'closed', updated_at = CURRENT_TIMESTAMP WHERE id = ?`, t.id); return res.json({ ok: true }); }
    throw forbidden();
  }
  update('tickets', t.id, { ...req.body, updated_at: new Date().toISOString() }, ['status', 'priority', 'assignee_id', 'category', 'updated_at']);
  if (req.body.status && req.body.status !== t.status) notify(t.employee_id, `Your ticket "${t.subject}" is now ${req.body.status.replace('_', ' ')}`, `/helpdesk/${t.id}`);
  if (req.body.assignee_id && Number(req.body.assignee_id) !== t.assignee_id) notify(Number(req.body.assignee_id), `Ticket assigned to you: ${t.subject}`, `/helpdesk/${t.id}`);
  res.json({ ok: true });
}));
r.post('/:id/comments', h((req, res) => {
  const t = get('SELECT * FROM tickets WHERE id = ?', req.params.id);
  if (!t) throw notFound();
  if (!canSee(req.user, t)) throw forbidden();
  if (!req.body.body) throw bad('Write a message');
  insert('ticket_comments', { ticket_id: t.id, author_id: req.user.id, body: req.body.body });
  run('UPDATE tickets SET updated_at = CURRENT_TIMESTAMP WHERE id = ?', t.id);
  const target = req.user.id === t.employee_id ? t.assignee_id : t.employee_id;
  notify(target, `New reply on ticket "${t.subject}"`, `/helpdesk/${t.id}`);
  res.json({ ok: true });
}));

export default r;
