import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { all, get, run, insert, update, tx, audit, notify } from '../db.js';
import { requireHR } from '../auth.js';
import { upload, filePath } from '../upload.js';
import { h, bad, notFound, forbidden, isHR, canManage, assertSelfOrManager, today, addDays } from '../util.js';

const r = Router();

const PERSONAL = ['phone', 'personal_email', 'dob', 'gender', 'marital_status', 'blood_group', 'address', 'emergency_contact'];
const JOB = ['emp_code', 'first_name', 'last_name', 'email', 'role', 'doj', 'department_id', 'designation_id', 'location_id', 'manager_id',
  'shift_id', 'employment_type', 'probation_end', 'status', 'exit_date'];
const SENSITIVE = ['pan', 'aadhaar', 'uan', 'bank_name', 'bank_account', 'ifsc'];
const ROLES = ['admin', 'hr', 'manager', 'employee'];

const LIST_SQL = `SELECT e.id, e.emp_code, e.first_name, e.last_name, e.email, e.phone, e.role, e.status, e.doj, e.dob, e.manager_id,
  e.department_id, e.designation_id, e.location_id, e.employment_type, e.exit_date,
  d.name AS department, g.name AS designation, l.name AS location,
  m.first_name || ' ' || COALESCE(m.last_name,'') AS manager_name
  FROM employees e LEFT JOIN departments d ON d.id = e.department_id LEFT JOIN designations g ON g.id = e.designation_id
  LEFT JOIN locations l ON l.id = e.location_id LEFT JOIN employees m ON m.id = e.manager_id`;

r.get('/', h((req, res) => {
  const { q, department_id, status = 'active', location_id } = req.query;
  const where = []; const p = [];
  if (status !== 'all') { where.push('e.status = ?'); p.push(status); }
  if (department_id) { where.push('e.department_id = ?'); p.push(department_id); }
  if (location_id) { where.push('e.location_id = ?'); p.push(location_id); }
  if (q) { where.push(`(e.first_name || ' ' || COALESCE(e.last_name,'') LIKE ? OR e.email LIKE ? OR e.emp_code LIKE ?)`); p.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  const rows = all(`${LIST_SQL} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY e.first_name`, ...p);
  // Directory is visible to everyone; strip non-directory fields for non-HR.
  res.json(isHR(req.user) ? rows : rows.map(({ dob, exit_date, ...x }) => ({ ...x, dob: dob ? dob.slice(5) : null })));
}));

r.get('/org-chart', h((_req, res) => {
  res.json(all(`${LIST_SQL} WHERE e.status = 'active' ORDER BY e.first_name`));
}));

r.get('/next-code', requireHR, h((_req, res) => {
  const last = get(`SELECT emp_code FROM employees WHERE emp_code GLOB '*[0-9]' ORDER BY id DESC LIMIT 1`)?.emp_code || 'EMP000';
  const m = last.match(/^(.*?)(\d+)$/);
  res.json({ code: m ? `${m[1]}${String(Number(m[2]) + 1).padStart(m[2].length, '0')}` : 'EMP001' });
}));

r.get('/:id', h((req, res) => {
  const id = Number(req.params.id);
  const e = get(`SELECT e.*, d.name AS department, g.name AS designation, l.name AS location, s.name AS shift,
    m.first_name || ' ' || COALESCE(m.last_name,'') AS manager_name
    FROM employees e LEFT JOIN departments d ON d.id = e.department_id LEFT JOIN designations g ON g.id = e.designation_id
    LEFT JOIN locations l ON l.id = e.location_id LEFT JOIN shifts s ON s.id = e.shift_id LEFT JOIN employees m ON m.id = e.manager_id
    WHERE e.id = ?`, id);
  if (!e) throw notFound('Employee not found');
  delete e.password_hash;
  const full = id === req.user.id || isHR(req.user);
  const team = full || canManage(req.user, id);
  if (!full) for (const k of [...SENSITIVE, 'aadhaar', 'address', 'emergency_contact', 'personal_email', 'marital_status']) delete e[k];
  if (!team) { delete e.dob; delete e.blood_group; }
  e.reports = all(`SELECT id, first_name, last_name, emp_code FROM employees WHERE manager_id = ? AND status = 'active'`, id);
  e.access = { full, team, edit: isHR(req.user), self: id === req.user.id };
  res.json(e);
}));

function validate(body, isNew) {
  if (isNew && (!body.first_name || !body.email)) throw bad('First name and email are required');
  if (body.email !== undefined) {
    body.email = String(body.email).trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) throw bad('Enter a valid email');
  }
  if (body.role && !ROLES.includes(body.role)) throw bad('Invalid role');
}

function createEmployee(body, actor) {
  validate(body, true);
  if (get('SELECT 1 FROM employees WHERE lower(email) = ?', body.email)) throw bad(`An employee with ${body.email} already exists`);
  if (body.emp_code && get('SELECT 1 FROM employees WHERE emp_code = ?', body.emp_code)) throw bad(`Employee code ${body.emp_code} is taken`);
  if (body.role === 'admin' && actor.role !== 'admin') throw forbidden('Only admins can create admins');
  const password = body.password || crypto.randomBytes(5).toString('hex');
  const id = insert('employees', { ...body, doj: body.doj || today(), password_hash: bcrypt.hashSync(password, 10) }, [...JOB, ...PERSONAL, ...SENSITIVE, 'password_hash']);
  if (body.ctc_annual) insert('salary_structures', { employee_id: id, ctc_annual: Number(body.ctc_annual), effective_from: body.doj || today() });
  // Spawn onboarding checklist from templates.
  for (const t of all(`SELECT * FROM task_templates WHERE kind = 'onboarding'`)) {
    insert('lifecycle_tasks', { employee_id: id, kind: 'onboarding', title: t.title, owner: t.owner, due_date: addDays(body.doj || today(), t.due_offset_days) });
  }
  audit(actor.id, 'create', 'employee', id, { email: body.email });
  return { id, password };
}

r.post('/', requireHR, h((req, res) => {
  const out = tx(() => createEmployee({ ...req.body }, req.user));
  res.json({ id: out.id, temp_password: req.body.password ? undefined : out.password });
}));

r.post('/import', requireHR, h((req, res) => {
  const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
  const results = [];
  const lookup = (table, name) => {
    if (!name) return null;
    const row = get(`SELECT id FROM ${table} WHERE lower(name) = lower(?)`, name);
    return row ? row.id : insert(table, { name });
  };
  for (const [i, raw] of rows.entries()) {
    try {
      const body = { ...raw };
      body.department_id = lookup('departments', raw.department); delete body.department;
      body.designation_id = lookup('designations', raw.designation); delete body.designation;
      body.location_id = lookup('locations', raw.location); delete body.location;
      if (raw.manager_email) body.manager_id = get('SELECT id FROM employees WHERE lower(email) = lower(?)', raw.manager_email)?.id;
      delete body.manager_email;
      body.role = ROLES.includes(raw.role) && raw.role !== 'admin' ? raw.role : 'employee';
      const { id, password } = tx(() => createEmployee(body, req.user));
      results.push({ row: i + 1, ok: true, id, email: body.email, temp_password: raw.password ? undefined : password });
    } catch (e) { results.push({ row: i + 1, ok: false, error: e.message }); }
  }
  res.json({ results });
}));

r.put('/:id', h((req, res) => {
  const id = Number(req.params.id);
  const existing = get('SELECT * FROM employees WHERE id = ?', id);
  if (!existing) throw notFound();
  const body = { ...req.body };
  validate(body, false);
  let allowed;
  if (isHR(req.user)) {
    allowed = [...JOB, ...PERSONAL, ...SENSITIVE];
    if ((body.role === 'admin' || existing.role === 'admin') && req.user.role !== 'admin' && body.role !== existing.role) throw forbidden('Only admins can change admin roles');
    if (body.manager_id && Number(body.manager_id) === id) throw bad('An employee cannot report to themselves');
    if (body.email && get('SELECT 1 FROM employees WHERE lower(email) = ? AND id != ?', body.email, id)) throw bad('Email already in use');
  } else if (id === req.user.id) {
    allowed = [...PERSONAL, 'bank_name', 'bank_account', 'ifsc', 'pan', 'uan'];
  } else throw forbidden();
  update('employees', id, body, allowed);
  audit(req.user.id, 'update', 'employee', id, Object.keys(body).filter((k) => allowed.includes(k)));
  res.json({ ok: true });
}));

r.post('/:id/reset-password', requireHR, h((req, res) => {
  const password = req.body.password || crypto.randomBytes(5).toString('hex');
  run('UPDATE employees SET password_hash = ? WHERE id = ?', bcrypt.hashSync(password, 10), req.params.id);
  audit(req.user.id, 'reset_password', 'employee', Number(req.params.id));
  res.json({ temp_password: password });
}));

r.delete('/:id', requireHR, h((req, res) => {
  const id = Number(req.params.id);
  if (id === req.user.id) throw bad('You cannot delete yourself');
  const e = get('SELECT role FROM employees WHERE id = ?', id);
  if (e?.role === 'admin' && req.user.role !== 'admin') throw forbidden();
  run('DELETE FROM employees WHERE id = ?', id);
  audit(req.user.id, 'delete', 'employee', id);
  res.json({ ok: true });
}));

// ----- Documents -----
r.get('/:id/documents', h((req, res) => {
  assertSelfOrManager(req.user, req.params.id);
  res.json(all('SELECT id, name, category, mime, size, created_at FROM documents WHERE employee_id = ? ORDER BY id DESC', req.params.id));
}));
r.post('/:id/documents', upload.single('file'), h((req, res) => {
  const id = Number(req.params.id);
  if (id !== req.user.id && !isHR(req.user)) throw forbidden();
  if (!req.file) throw bad('Choose a file to upload');
  const docId = insert('documents', { employee_id: id, name: req.body.name || req.file.originalname, category: req.body.category || 'Other',
    file: req.file.filename, mime: req.file.mimetype, size: req.file.size, uploaded_by: req.user.id });
  if (id !== req.user.id) notify(id, `A document "${req.body.name || req.file.originalname}" was added to your profile`, '/me/documents');
  res.json({ id: docId });
}));
r.get('/:id/documents/:docId/file', h((req, res) => {
  assertSelfOrManager(req.user, req.params.id);
  const d = get('SELECT * FROM documents WHERE id = ? AND employee_id = ?', req.params.docId, req.params.id);
  if (!d) throw notFound();
  res.download(filePath(d.file), d.name.includes('.') ? d.name : `${d.name}${d.file.slice(d.file.lastIndexOf('.'))}`);
}));
r.delete('/:id/documents/:docId', requireHR, h((req, res) => {
  const d = get('SELECT * FROM documents WHERE id = ? AND employee_id = ?', req.params.docId, req.params.id);
  if (!d) throw notFound();
  run('DELETE FROM documents WHERE id = ?', d.id);
  fs.rm(filePath(d.file), { force: true }, () => {});
  res.json({ ok: true });
}));

export default r;
