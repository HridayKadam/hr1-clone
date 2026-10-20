import { Router } from 'express';
import { all, get, run, insert, tx, notify, audit } from '../db.js';
import { requireHR } from '../auth.js';
import { h, bad, forbidden, notFound, today, leaveDays, leaveBalances, assertSelfOrManager, isHR, reportIds, monthBounds } from '../util.js';

const r = Router();

r.get('/balances', h((req, res) => {
  const employeeId = Number(req.query.employee_id || req.user.id);
  assertSelfOrManager(req.user, employeeId);
  res.json(leaveBalances(employeeId, Number(req.query.year) || undefined));
}));

r.get('/requests', h((req, res) => {
  const { scope, status, employee_id } = req.query;
  const where = []; const p = [];
  if (scope === 'all' && isHR(req.user)) { /* everything */ } else if (scope === 'team') {
    const ids = reportIds(req.user.id); if (!ids.length) return res.json([]);
    where.push(`lr.employee_id IN (${ids.map(() => '?').join(',')})`); p.push(...ids);
  } else {
    const id = Number(employee_id || req.user.id); assertSelfOrManager(req.user, id);
    where.push('lr.employee_id = ?'); p.push(id);
  }
  if (status) { where.push('lr.status = ?'); p.push(status); }
  res.json(all(`SELECT lr.*, lt.name AS leave_type, lt.code, lt.color, e.first_name || ' ' || COALESCE(e.last_name,'') AS employee_name,
    a.first_name || ' ' || COALESCE(a.last_name,'') AS approver_name
    FROM leave_requests lr JOIN leave_types lt ON lt.id = lr.leave_type_id JOIN employees e ON e.id = lr.employee_id
    LEFT JOIN employees a ON a.id = lr.approver_id ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY lr.from_date DESC LIMIT 500`, ...p));
}));

/** Who is out: approved and pending leave across the company for a month (no reasons exposed). */
r.get('/calendar', h((req, res) => {
  const [from, to] = monthBounds(req.query.month || today().slice(0, 7));
  res.json(all(`SELECT lr.id, lr.employee_id, lr.from_date, lr.to_date, lr.half_day, lr.status, lt.code, lt.color, lt.name AS leave_type,
    e.first_name || ' ' || COALESCE(e.last_name,'') AS employee_name FROM leave_requests lr
    JOIN leave_types lt ON lt.id = lr.leave_type_id JOIN employees e ON e.id = lr.employee_id
    WHERE lr.status IN ('approved','pending') AND lr.to_date >= ? AND lr.from_date <= ? ORDER BY lr.from_date`, from, to));
}));

r.post('/preview', h((req, res) => {
  const { from_date, to_date, half_day } = req.body;
  if (!from_date || !to_date || to_date < from_date) return res.json({ days: 0 });
  res.json({ days: leaveDays(req.user.id, from_date, to_date, half_day && from_date === to_date) });
}));

r.post('/requests', h((req, res) => {
  const { leave_type_id, from_date, reason } = req.body;
  let { to_date, half_day } = req.body;
  const employeeId = isHR(req.user) && req.body.employee_id ? Number(req.body.employee_id) : req.user.id;
  const type = get('SELECT * FROM leave_types WHERE id = ? AND active = 1', leave_type_id);
  if (!type) throw bad('Choose a leave type');
  if (!from_date) throw bad('Choose the leave dates');
  to_date = to_date || from_date;
  if (to_date < from_date) throw bad('End date must be on or after the start date');
  if (from_date.slice(0, 4) !== to_date.slice(0, 4)) throw bad('Split leave that spans two calendar years into two requests');
  half_day = half_day ? 1 : 0;
  if (half_day && from_date !== to_date) throw bad('Half day leave must be a single date');
  if (half_day && !type.allow_half_day) throw bad(`${type.name} cannot be taken as half day`);
  const overlap = get(`SELECT 1 FROM leave_requests WHERE employee_id = ? AND status IN ('pending','approved') AND to_date >= ? AND from_date <= ?`, employeeId, from_date, to_date);
  if (overlap) throw bad('You already have leave applied for some of these dates');
  const days = leaveDays(employeeId, from_date, to_date, half_day);
  if (!days) throw bad('The selected dates are all week-offs or holidays');
  if (type.paid) {
    const bal = leaveBalances(employeeId, Number(from_date.slice(0, 4))).find((b) => b.leave_type_id === type.id);
    if (bal && days > bal.available) throw bad(`Insufficient ${type.name} balance: ${bal.available} day(s) available, ${days} requested`);
  }
  const autoApprove = isHR(req.user) && employeeId !== req.user.id;
  const id = insert('leave_requests', { employee_id: employeeId, leave_type_id: type.id, from_date, to_date, half_day, days, reason,
    status: autoApprove ? 'approved' : 'pending', approver_id: autoApprove ? req.user.id : null, decided_at: autoApprove ? new Date().toISOString() : null });
  if (!autoApprove) {
    const mgr = get('SELECT manager_id, first_name FROM employees WHERE id = ?', employeeId);
    notify(mgr.manager_id, `${mgr.first_name} applied for ${days} day(s) of ${type.name}`, '/inbox');
  }
  res.json({ id, days });
}));

r.delete('/requests/:id', h((req, res) => {
  const x = get('SELECT * FROM leave_requests WHERE id = ?', req.params.id);
  if (!x) throw notFound();
  const own = x.employee_id === req.user.id;
  if (!own && !isHR(req.user)) throw forbidden();
  if (x.status === 'pending' || (x.status === 'approved' && (x.from_date > today() || isHR(req.user)))) {
    run(`UPDATE leave_requests SET status = 'cancelled' WHERE id = ?`, x.id);
    if (!own) notify(x.employee_id, `Your leave from ${x.from_date} was cancelled by HR`, '/me/leave');
    return res.json({ ok: true });
  }
  throw bad('Only pending or upcoming leave can be cancelled');
}));

// ----- Allocations (HR) -----
r.get('/allocations', requireHR, h((req, res) => {
  const year = Number(req.query.year) || Number(today().slice(0, 4));
  const emps = all(`SELECT id, emp_code, first_name, last_name FROM employees WHERE status = 'active' ORDER BY first_name`);
  res.json({ year, types: all('SELECT * FROM leave_types WHERE active = 1 ORDER BY id'), rows: emps.map((e) => ({ ...e, balances: leaveBalances(e.id, year) })) });
}));
r.put('/allocations', requireHR, h((req, res) => {
  const { employee_id, leave_type_id, year, days } = req.body;
  if (!employee_id || !leave_type_id || !year || days == null || days === '') throw bad('Employee, leave type, year and days are required');
  run(`INSERT INTO leave_allocations (employee_id, leave_type_id, year, days) VALUES (?,?,?,?)
    ON CONFLICT(employee_id, leave_type_id, year) DO UPDATE SET days = excluded.days`, employee_id, leave_type_id, year, Number(days));
  audit(req.user.id, 'allocate_leave', 'employee', Number(employee_id), { leave_type_id, year, days });
  res.json({ ok: true });
}));
/** Year-end: allocate quota for a new year, carrying forward unused balance where the leave type allows it. */
r.post('/allocations/rollover', requireHR, h((req, res) => {
  const year = Number(req.body.year);
  if (!year) throw bad('Year is required');
  const types = all('SELECT * FROM leave_types WHERE active = 1');
  let n = 0;
  tx(() => {
    for (const e of all(`SELECT id FROM employees WHERE status = 'active'`)) {
      const prev = leaveBalances(e.id, year - 1);
      for (const t of types) {
        let days = t.annual_quota;
        if (t.carry_forward && t.paid) {
          const p = prev.find((b) => b.leave_type_id === t.id);
          days += Math.min(Math.max(p ? p.allocated - p.used : 0, 0), t.max_carry || Infinity);
        }
        run(`INSERT INTO leave_allocations (employee_id, leave_type_id, year, days) VALUES (?,?,?,?)
          ON CONFLICT(employee_id, leave_type_id, year) DO UPDATE SET days = excluded.days`, e.id, t.id, year, days);
        n++;
      }
    }
  });
  audit(req.user.id, 'leave_rollover', 'leave', null, { year });
  res.json({ ok: true, allocations: n });
}));

export default r;
