import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { get, run, insert, tx, getSettings } from '../db.js';
import { loadDemo } from '../seed.js';
import { issue, clear, requireAuth } from '../auth.js';
import { h, bad, HttpError, isHR, reportIds, today } from '../util.js';

const r = Router();
const attempts = new Map(); // naive in-memory brute-force throttle per email

r.post('/login', h((req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  if (!email || !password) throw bad('Email and password are required');
  const a = attempts.get(email) || { n: 0, until: 0 };
  if (a.until > Date.now()) throw new HttpError(429, 'Too many attempts. Try again in a few minutes.');
  const emp = get('SELECT id, password_hash, status FROM employees WHERE lower(email) = ?', email);
  if (!emp || !emp.password_hash || !bcrypt.compareSync(password, emp.password_hash)) {
    a.n += 1; if (a.n >= 8) { a.until = Date.now() + 5 * 60 * 1000; a.n = 0; }
    attempts.set(email, a);
    throw new HttpError(401, 'Invalid email or password');
  }
  if (emp.status !== 'active') throw new HttpError(401, 'Your account is inactive');
  attempts.delete(email);
  issue(res, emp);
  res.json({ ok: true });
}));

/** First-run setup: only available while the workspace has no employees. */
r.get('/setup', h((_req, res) => res.json({ needs_setup: get('SELECT COUNT(*) n FROM employees').n === 0 })));
r.post('/setup', h((req, res) => {
  if (get('SELECT COUNT(*) n FROM employees').n > 0) throw new HttpError(409, 'This workspace is already set up');
  const { company_name, first_name, last_name, email, password, demo } = req.body;
  if (!company_name || !first_name || !email) throw bad('Company name, your name and email are required');
  if (!password || String(password).length < 8) throw bad('Password must be at least 8 characters');
  const id = tx(() => {
    run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', 'company_name', company_name);
    return insert('employees', { emp_code: 'EMP001', first_name, last_name, email: String(email).trim().toLowerCase(), role: 'admin',
      password_hash: bcrypt.hashSync(String(password), 10), doj: today() });
  });
  if (demo) loadDemo({ password: String(password), admin: { id } });
  issue(res, { id });
  res.json({ ok: true });
}));

r.post('/logout', (_req, res) => { clear(res); res.json({ ok: true }); });

r.get('/me', requireAuth, h((req, res) => {
  const me = get(`SELECT e.id, e.emp_code, e.first_name, e.last_name, e.email, e.role, e.manager_id, e.doj,
    d.name AS department, g.name AS designation FROM employees e
    LEFT JOIN departments d ON d.id = e.department_id LEFT JOIN designations g ON g.id = e.designation_id WHERE e.id = ?`, req.user.id);
  const s = getSettings();
  res.json({
    user: { ...me, is_hr: isHR(req.user), has_reports: reportIds(req.user.id).length > 0 },
    company: { name: s.company_name, currency: s.currency },
  });
}));

r.post('/change-password', requireAuth, h((req, res) => {
  const { current, next } = req.body;
  if (!next || String(next).length < 8) throw bad('New password must be at least 8 characters');
  const emp = get('SELECT password_hash FROM employees WHERE id = ?', req.user.id);
  if (!bcrypt.compareSync(String(current || ''), emp.password_hash || '')) throw bad('Current password is incorrect');
  run('UPDATE employees SET password_hash = ? WHERE id = ?', bcrypt.hashSync(String(next), 10), req.user.id);
  res.json({ ok: true });
}));

export default r;
