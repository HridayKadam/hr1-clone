import { all, get } from './db.js';

export const TZ = process.env.TZ_NAME || process.env.TZ || 'Asia/Kolkata';

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export const bad = (msg) => new HttpError(400, msg);
export const forbidden = (msg = 'You do not have access to this') => new HttpError(403, msg);
export const notFound = (msg = 'Not found') => new HttpError(404, msg);

/** Wrap a router so thrown errors (sync or async) reach the error handler. */
export const h = (fn) => (req, res, next) => {
  try { const r = fn(req, res, next); if (r && typeof r.catch === 'function') r.catch(next); } catch (e) { next(e); }
};

const parts = (d = new Date()) => Object.fromEntries(
  new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
    .formatToParts(d).map((p) => [p.type, p.value]),
);
export const today = () => { const p = parts(); return `${p.year}-${p.month}-${p.day}`; };
export const nowTime = () => { const p = parts(); return `${p.hour === '24' ? '00' : p.hour}:${p.minute}:${p.second}`; };

// Date-only helpers operate on 'YYYY-MM-DD' strings in UTC to avoid DST/timezone drift.
export const toDate = (s) => new Date(`${s}T00:00:00Z`);
export const fmt = (d) => d.toISOString().slice(0, 10);
export const addDays = (s, n) => { const d = toDate(s); d.setUTCDate(d.getUTCDate() + n); return fmt(d); };
export const dow = (s) => toDate(s).getUTCDay();
export function* eachDay(from, to) { for (let d = from; d <= to; d = addDays(d, 1)) yield d; }
export const daysInMonth = (month) => { const [y, m] = month.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); };
export const monthBounds = (month) => [`${month}-01`, `${month}-${String(daysInMonth(month)).padStart(2, '0')}`];
export const minutesBetween = (a, b) => {
  if (!a || !b) return 0;
  const t = (x) => { const [hh, mm, ss = 0] = x.split(':').map(Number); return hh * 60 + mm + ss / 60; };
  let diff = t(b) - t(a); if (diff < 0) diff += 24 * 60; return Math.round(diff);
};

export const isHR = (u) => u && (u.role === 'admin' || u.role === 'hr');
export const isManager = (u) => u && (isHR(u) || u.role === 'manager');

/** All employee ids reporting (directly or indirectly) to managerId. */
export function reportIds(managerId) {
  return all(`WITH RECURSIVE t(id) AS (SELECT id FROM employees WHERE manager_id = ?
    UNION SELECT e.id FROM employees e JOIN t ON e.manager_id = t.id) SELECT id FROM t`, managerId).map((r) => r.id);
}
/** Can `user` act on records belonging to employeeId (view team data, approve)? */
export function canManage(user, employeeId) {
  if (!user || !employeeId) return false;
  if (isHR(user)) return true;
  return reportIds(user.id).includes(Number(employeeId));
}
export function canApprove(user, employeeId) {
  if (Number(employeeId) === user.id && user.role !== 'admin') return false;
  return canManage(user, employeeId);
}
export function assertSelfOrManager(user, employeeId) {
  if (Number(employeeId) !== user.id && !canManage(user, employeeId)) throw forbidden();
}

export function shiftFor(employeeId) {
  return get('SELECT s.* FROM shifts s JOIN employees e ON e.shift_id = s.id WHERE e.id = ?', employeeId)
    || get('SELECT * FROM shifts ORDER BY id LIMIT 1')
    || { start_time: '09:30', end_time: '18:30', grace_minutes: 15, half_day_minutes: 240, full_day_minutes: 480, week_offs: '0,6' };
}
export const weekOffSet = (shift) => new Set(String(shift.week_offs ?? '0,6').split(',').filter(Boolean).map(Number));
export const holidaySet = (from, to) => new Set(all('SELECT date FROM holidays WHERE optional = 0 AND date BETWEEN ? AND ?', from, to).map((r) => r.date));

/** Working days (excluding week-offs and mandatory holidays) for an employee in a date range. */
export function leaveDays(employeeId, from, to, halfDay) {
  if (halfDay) return 0.5;
  const offs = weekOffSet(shiftFor(employeeId));
  const hol = holidaySet(from, to);
  let n = 0;
  for (const d of eachDay(from, to)) if (!offs.has(dow(d)) && !hol.has(d)) n++;
  return n;
}

export function leaveBalances(employeeId, year = Number(today().slice(0, 4))) {
  const types = all('SELECT * FROM leave_types WHERE active = 1 ORDER BY id');
  const emp = get('SELECT doj FROM employees WHERE id = ?', employeeId);
  return types.map((t) => {
    const alloc = get('SELECT days FROM leave_allocations WHERE employee_id = ? AND leave_type_id = ? AND year = ?', employeeId, t.id, year);
    let allocated = alloc ? alloc.days : t.annual_quota;
    // Pro-rate default quota for employees who joined during the year.
    if (!alloc && emp?.doj && emp.doj.slice(0, 4) === String(year)) {
      const monthsLeft = 12 - Number(emp.doj.slice(5, 7)) + 1;
      allocated = Math.round((t.annual_quota * monthsLeft / 12) * 2) / 2;
    }
    const sum = (status) => get(`SELECT COALESCE(SUM(days),0) n FROM leave_requests WHERE employee_id = ? AND leave_type_id = ?
      AND status = ? AND substr(from_date,1,4) = ?`, employeeId, t.id, status, String(year)).n;
    const used = sum('approved'); const pending = sum('pending');
    return { leave_type_id: t.id, name: t.name, code: t.code, color: t.color, paid: t.paid, allow_half_day: t.allow_half_day,
      allocated, used, pending, available: t.paid ? allocated - used - pending : null };
  });
}

export const empName = (e) => (e ? [e.first_name, e.last_name].filter(Boolean).join(' ') : '');
export const EMP_JOIN = `LEFT JOIN employees emp ON emp.id = x.employee_id`;
export const EMP_COLS = `emp.first_name || ' ' || COALESCE(emp.last_name,'') AS employee_name, emp.emp_code AS emp_code`;
