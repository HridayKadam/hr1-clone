import { Router } from 'express';
import { all, get, run, insert, update, tx, notify } from '../db.js';
import { requireHR } from '../auth.js';
import { h, bad, forbidden, notFound, isHR, today } from '../util.js';

const r = Router();
const FIELDS = ['tag', 'name', 'category', 'serial', 'purchase_date', 'cost', 'status', 'notes'];

r.get('/', h((req, res) => {
  const mine = req.query.scope !== 'all' || !isHR(req.user);
  const id = Number(req.query.employee_id || req.user.id);
  if (mine && id !== req.user.id && !isHR(req.user)) throw forbidden();
  res.json(all(`SELECT a.*, e.first_name || ' ' || COALESCE(e.last_name,'') AS assigned_name FROM assets a LEFT JOIN employees e ON e.id = a.assigned_to
    ${mine ? 'WHERE a.assigned_to = ?' : ''} ORDER BY a.tag`, ...(mine ? [id] : [])));
}));
r.post('/', requireHR, h((req, res) => {
  if (!req.body.name) throw bad('Asset name is required');
  try { res.json({ id: insert('assets', req.body, FIELDS) }); } catch (e) { if (/UNIQUE/.test(e.message)) throw bad('Asset tag already exists'); throw e; }
}));
r.put('/:id', requireHR, h((req, res) => { update('assets', req.params.id, req.body, FIELDS); res.json({ ok: true }); }));
r.delete('/:id', requireHR, h((req, res) => { run('DELETE FROM assets WHERE id = ?', req.params.id); res.json({ ok: true }); }));
r.get('/:id/history', requireHR, h((req, res) => {
  res.json(all(`SELECT h.*, e.first_name || ' ' || COALESCE(e.last_name,'') AS employee_name FROM asset_history h LEFT JOIN employees e ON e.id = h.employee_id
    WHERE h.asset_id = ? ORDER BY h.id DESC`, req.params.id));
}));
r.post('/:id/assign', requireHR, h((req, res) => {
  const a = get('SELECT * FROM assets WHERE id = ?', req.params.id);
  if (!a) throw notFound();
  const to = req.body.employee_id ? Number(req.body.employee_id) : null;
  tx(() => {
    if (a.assigned_to) insert('asset_history', { asset_id: a.id, employee_id: a.assigned_to, action: 'returned', by: req.user.id });
    if (to) {
      run(`UPDATE assets SET assigned_to = ?, assigned_at = ?, status = 'assigned' WHERE id = ?`, to, today(), a.id);
      insert('asset_history', { asset_id: a.id, employee_id: to, action: 'assigned', by: req.user.id });
      notify(to, `${a.name} (${a.tag}) has been assigned to you`, '/me/assets');
    } else run(`UPDATE assets SET assigned_to = NULL, assigned_at = NULL, status = 'available' WHERE id = ?`, a.id);
  });
  res.json({ ok: true });
}));

export default r;
