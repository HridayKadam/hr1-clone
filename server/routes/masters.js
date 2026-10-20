import { Router } from 'express';
import { all, get, run, insert, update, getSettings, audit } from '../db.js';
import { requireHR, requireAdmin } from '../auth.js';
import { h, bad, notFound } from '../util.js';

/** Simple lookup tables managed from Settings. Everyone can read; HR can write. */
const MASTERS = {
  departments: { fields: ['name'], order: 'name' },
  designations: { fields: ['name'], order: 'name' },
  locations: { fields: ['name', 'lat', 'lng', 'radius_m'], order: 'name' },
  shifts: { fields: ['name', 'start_time', 'end_time', 'grace_minutes', 'half_day_minutes', 'full_day_minutes', 'week_offs'], order: 'id' },
  holidays: { fields: ['date', 'name', 'optional'], order: 'date' },
  leave_types: { fields: ['name', 'code', 'annual_quota', 'paid', 'carry_forward', 'max_carry', 'allow_half_day', 'color', 'active'], order: 'id' },
  projects: { fields: ['name', 'client', 'active'], order: 'name' },
  task_templates: { fields: ['kind', 'title', 'owner', 'due_offset_days'], order: 'kind, due_offset_days, id' },
  review_cycles: { fields: ['name', 'start_date', 'end_date', 'status'], order: 'id DESC' },
};

const r = Router();

r.get('/settings', h((_req, res) => { const s = getSettings(); delete s.jwt_secret; res.json(s); }));
r.put('/settings', requireAdmin, h((req, res) => {
  for (const [k, v] of Object.entries(req.body || {})) {
    if (k === 'jwt_secret') continue;
    run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', k, v == null ? '' : String(v));
  }
  audit(req.user.id, 'update', 'settings', null, Object.keys(req.body || {}));
  res.json({ ok: true });
}));

r.get('/audit-log', requireAdmin, h((_req, res) => {
  res.json(all(`SELECT a.*, e.first_name || ' ' || COALESCE(e.last_name,'') AS actor FROM audit_log a
    LEFT JOIN employees e ON e.id = a.actor_id ORDER BY a.id DESC LIMIT 300`));
}));

const conf = (req) => { const c = MASTERS[req.params.table]; if (!c) throw notFound('Unknown list'); return c; };

r.get('/:table', h((req, res) => {
  const c = conf(req);
  let sql = `SELECT * FROM ${req.params.table}`;
  const p = [];
  if (req.params.table === 'holidays' && req.query.year) { sql += ` WHERE substr(date,1,4) = ?`; p.push(String(req.query.year)); }
  res.json(all(`${sql} ORDER BY ${c.order}`, ...p));
}));
r.post('/:table', requireHR, h((req, res) => {
  const c = conf(req);
  if (c.fields.includes('name') && !req.body.name && req.params.table !== 'holidays') throw bad('Name is required');
  try {
    const id = insert(req.params.table, req.body, c.fields);
    res.json({ id });
  } catch (e) {
    if (/UNIQUE/.test(e.message)) throw bad('That entry already exists');
    throw e;
  }
}));
r.put('/:table/:id', requireHR, h((req, res) => {
  const c = conf(req);
  if (!get(`SELECT 1 FROM ${req.params.table} WHERE id = ?`, req.params.id)) throw notFound();
  update(req.params.table, req.params.id, req.body, c.fields);
  res.json({ ok: true });
}));
r.delete('/:table/:id', requireHR, h((req, res) => {
  conf(req);
  try { run(`DELETE FROM ${req.params.table} WHERE id = ?`, req.params.id); } catch (e) {
    if (/FOREIGN KEY/.test(e.message)) throw bad('This entry is in use and cannot be deleted. Deactivate it instead.');
    throw e;
  }
  res.json({ ok: true });
}));

export default r;
