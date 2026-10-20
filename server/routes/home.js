import { Router } from 'express';
import { all, get, run } from '../db.js';
import { requireHR } from '../auth.js';
import { h, bad, today, addDays, isHR, reportIds, monthBounds, leaveBalances } from '../util.js';
import { monthSheet } from './attendance.js';
import { KINDS } from './approvals.js';

const r = Router();
const NAME = `first_name || ' ' || COALESCE(last_name,'')`;

/** Upcoming month-day events (birthdays/anniversaries) within `days`, wrapping the year end. */
function upcoming(col, days) {
  const t = today(); const end = addDays(t, days);
  const md = (d) => d.slice(5);
  const wrap = md(end) < md(t);
  const rows = all(`SELECT id, ${NAME} AS name, ${col} AS date FROM employees WHERE status = 'active' AND ${col} IS NOT NULL`);
  return rows.filter((e) => { const m = md(e.date); return wrap ? m >= md(t) || m <= md(end) : m >= md(t) && m <= md(end); })
    .map((e) => ({ ...e, md: md(e.date), years: col === 'doj' ? Number(t.slice(0, 4)) - Number(e.date.slice(0, 4)) : undefined }))
    .filter((e) => col !== 'doj' || e.years > 0)
    .sort((a, b) => ((a.md < md(t)) - (b.md < md(t))) || a.md.localeCompare(b.md))
    .map(({ md: m, date, ...e }) => ({ ...e, md: m }));
}

r.get('/dashboard', h((req, res) => {
  const t = today();
  const ids = isHR(req.user) ? null : new Set(reportIds(req.user.id));
  let pending = 0;
  for (const [, k] of Object.entries(KINDS)) {
    if (k.hrOnly && !isHR(req.user)) continue;
    for (const x of all(`SELECT x.employee_id FROM ${k.table} x WHERE x.status = 'pending'`)) {
      if (ids ? ids.has(x.employee_id) : (x.employee_id !== req.user.id || req.user.role === 'admin')) pending++;
    }
  }
  const out = {
    pending_approvals: pending,
    announcements: all(`SELECT a.id, a.title, a.body, a.pinned, a.created_at, e.first_name || ' ' || COALESCE(e.last_name,'') AS author
      FROM announcements a LEFT JOIN employees e ON e.id = a.author_id ORDER BY a.pinned DESC, a.id DESC LIMIT 4`),
    holidays: all('SELECT * FROM holidays WHERE date >= ? ORDER BY date LIMIT 5', t),
    birthdays: upcoming('dob', 30).slice(0, 8),
    anniversaries: upcoming('doj', 30).slice(0, 8),
    out_today: all(`SELECT e.id, e.first_name || ' ' || COALESCE(e.last_name,'') AS name, lt.code, lt.color, lr.half_day FROM leave_requests lr
      JOIN employees e ON e.id = lr.employee_id JOIN leave_types lt ON lt.id = lr.leave_type_id WHERE lr.status = 'approved' AND ? BETWEEN lr.from_date AND lr.to_date`, t),
    new_joiners: all(`SELECT id, ${NAME} AS name, doj FROM employees WHERE status = 'active' AND doj BETWEEN ? AND ? ORDER BY doj DESC LIMIT 6`, addDays(t, -30), t),
    kudos: all(`SELECT k.id, k.badge, k.message, k.created_at, f.first_name AS from_name, t.first_name || ' ' || COALESCE(t.last_name,'') AS to_name FROM kudos k
      LEFT JOIN employees f ON f.id = k.from_id JOIN employees t ON t.id = k.to_id ORDER BY k.id DESC LIMIT 5`),
    leave_balances: leaveBalances(req.user.id).filter((b) => b.paid),
    month: monthSheet(req.user.id, t.slice(0, 7)).summary,
    my_open_tickets: get(`SELECT COUNT(*) n FROM tickets WHERE employee_id = ? AND status IN ('open','in_progress')`, req.user.id).n,
  };
  if (isHR(req.user)) {
    out.hr = {
      headcount: get(`SELECT COUNT(*) n FROM employees WHERE status = 'active'`).n,
      present_today: get(`SELECT COUNT(*) n FROM attendance a JOIN employees e ON e.id = a.employee_id WHERE e.status = 'active' AND a.date = ? AND a.check_in IS NOT NULL`, t).n,
      on_leave_today: out.out_today.length,
      open_tickets: get(`SELECT COUNT(*) n FROM tickets WHERE status IN ('open','in_progress')`).n,
      open_jobs: get(`SELECT COUNT(*) n FROM jobs WHERE status = 'open'`).n,
      exits_upcoming: get(`SELECT COUNT(*) n FROM employees WHERE status = 'active' AND exit_date >= ?`, t).n,
      by_department: all(`SELECT COALESCE(d.name,'Unassigned') AS name, COUNT(*) AS value FROM employees e LEFT JOIN departments d ON d.id = e.department_id
        WHERE e.status = 'active' GROUP BY d.name ORDER BY value DESC`),
    };
  }
  res.json(out);
}));

// ----- Notifications -----
r.get('/notifications', h((req, res) => {
  res.json({
    items: all('SELECT * FROM notifications WHERE employee_id = ? ORDER BY id DESC LIMIT 40', req.user.id),
    unread: get('SELECT COUNT(*) n FROM notifications WHERE employee_id = ? AND read = 0', req.user.id).n,
  });
}));
r.post('/notifications/read', h((req, res) => {
  if (req.body.id) run('UPDATE notifications SET read = 1 WHERE id = ? AND employee_id = ?', req.body.id, req.user.id);
  else run('UPDATE notifications SET read = 1 WHERE employee_id = ?', req.user.id);
  res.json({ ok: true });
}));

// ----- Global search -----
r.get('/search', h((req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 2) return res.json([]);
  res.json(all(`SELECT e.id, e.first_name || ' ' || COALESCE(e.last_name,'') AS name, e.emp_code, e.email, g.name AS designation FROM employees e
    LEFT JOIN designations g ON g.id = e.designation_id WHERE e.status = 'active' AND (e.first_name || ' ' || COALESCE(e.last_name,'') LIKE ? OR e.emp_code LIKE ? OR e.email LIKE ?)
    ORDER BY e.first_name LIMIT 8`, `%${q}%`, `%${q}%`, `%${q}%`));
}));

// ----- Reports (HR) -----
r.get('/reports/headcount', requireHR, h((_req, res) => {
  const months = [];
  let m = today().slice(0, 7);
  for (let i = 0; i < 12; i++) { months.unshift(m); const [y, mm] = m.split('-').map(Number); m = mm === 1 ? `${y - 1}-12` : `${y}-${String(mm - 1).padStart(2, '0')}`; }
  const trend = months.map((mon) => {
    const [from, to] = monthBounds(mon);
    const headcount = get(`SELECT COUNT(*) n FROM employees WHERE doj <= ? AND (exit_date IS NULL OR exit_date > ?) `, to, to).n;
    const joins = get('SELECT COUNT(*) n FROM employees WHERE doj BETWEEN ? AND ?', from, to).n;
    const exits = get(`SELECT COUNT(*) n FROM employees WHERE exit_date BETWEEN ? AND ? AND status = 'exited'`, from, to).n;
    return { month: mon, headcount, joins, exits };
  });
  const active = get(`SELECT COUNT(*) n FROM employees WHERE status = 'active'`).n;
  const exits12 = trend.reduce((s, x) => s + x.exits, 0);
  const avg = trend.reduce((s, x) => s + x.headcount, 0) / 12 || 1;
  res.json({
    trend, active, attrition_pct: Math.round((exits12 / avg) * 1000) / 10,
    by_department: all(`SELECT COALESCE(d.name,'Unassigned') AS name, COUNT(*) AS value FROM employees e LEFT JOIN departments d ON d.id = e.department_id WHERE e.status = 'active' GROUP BY d.name ORDER BY value DESC`),
    by_location: all(`SELECT COALESCE(l.name,'Unassigned') AS name, COUNT(*) AS value FROM employees e LEFT JOIN locations l ON l.id = e.location_id WHERE e.status = 'active' GROUP BY l.name ORDER BY value DESC`),
    by_type: all(`SELECT COALESCE(employment_type,'Unknown') AS name, COUNT(*) AS value FROM employees WHERE status = 'active' GROUP BY employment_type`),
    by_gender: all(`SELECT COALESCE(gender,'Not specified') AS name, COUNT(*) AS value FROM employees WHERE status = 'active' GROUP BY gender`),
  });
}));
r.get('/reports/attendance', requireHR, h((req, res) => {
  const month = req.query.month || today().slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(month)) throw bad('Invalid month');
  const emps = all(`SELECT e.id, e.emp_code, e.first_name || ' ' || COALESCE(e.last_name,'') AS name, d.name AS department FROM employees e
    LEFT JOIN departments d ON d.id = e.department_id WHERE e.status = 'active' ORDER BY e.first_name`);
  res.json(emps.map((e) => ({ ...e, ...monthSheet(e.id, month).summary })));
}));
r.get('/reports/leave', requireHR, h((req, res) => {
  const year = Number(req.query.year) || Number(today().slice(0, 4));
  const emps = all(`SELECT e.id, e.emp_code, e.first_name || ' ' || COALESCE(e.last_name,'') AS name FROM employees e WHERE e.status = 'active' ORDER BY e.first_name`);
  res.json({ types: all('SELECT id, code, name FROM leave_types WHERE active = 1 ORDER BY id'), rows: emps.map((e) => ({ ...e, balances: leaveBalances(e.id, year) })) });
}));

export default r;
