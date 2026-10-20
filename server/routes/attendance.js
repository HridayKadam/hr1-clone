import { Router } from 'express';
import { all, get, run, insert, getSettings, notify } from '../db.js';
import { requireHR, requireManager } from '../auth.js';
import { h, bad, forbidden, today, nowTime, minutesBetween, monthBounds, eachDay, dow, shiftFor, weekOffSet,
  assertSelfOrManager, isHR, reportIds } from '../util.js';

const r = Router();

const haversine = (a, b, c, d) => {
  const R = 6371000; const rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(c - a); const dLng = rad(d - b);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a)) * Math.cos(rad(c)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
};

/** Derive a day's status from raw punches, shift, holidays and approved leave. */
export function dayStatus({ date, rec, shift, offs, holiday, leave, doj, exitDate, todayStr }) {
  const base = { date, check_in: rec?.check_in || null, check_out: rec?.check_out || null, work_minutes: 0, late: false, work_from: rec?.work_from };
  if ((doj && date < doj) || (exitDate && date > exitDate)) return { ...base, status: 'na' };
  if (rec?.check_in) {
    const mins = rec.check_out ? minutesBetween(rec.check_in, rec.check_out) : 0;
    const late = minutesBetween(shift.start_time, rec.check_in) > shift.grace_minutes && rec.check_in > shift.start_time;
    let status = 'present';
    if (rec.check_out && mins < shift.half_day_minutes) status = 'short';
    else if (rec.check_out && mins < shift.full_day_minutes) status = 'half_day';
    if (!rec.check_out && date < todayStr) status = 'missing_out';
    return { ...base, work_minutes: mins, late, status, leave: leave?.code };
  }
  if (leave) return { ...base, status: leave.half_day ? 'half_leave' : 'leave', leave: leave.code, leave_name: leave.name, leave_color: leave.color };
  if (holiday) return { ...base, status: 'holiday', holiday };
  if (offs.has(dow(date))) return { ...base, status: 'weekoff' };
  if (date >= todayStr) return { ...base, status: 'upcoming' };
  return { ...base, status: 'absent' };
}

export function monthSheet(employeeId, month) {
  const [from, to] = monthBounds(month);
  const emp = get('SELECT id, doj, exit_date FROM employees WHERE id = ?', employeeId);
  const shift = shiftFor(employeeId); const offs = weekOffSet(shift);
  const recs = Object.fromEntries(all('SELECT * FROM attendance WHERE employee_id = ? AND date BETWEEN ? AND ?', employeeId, from, to).map((x) => [x.date, x]));
  const hol = Object.fromEntries(all('SELECT date, name FROM holidays WHERE optional = 0 AND date BETWEEN ? AND ?', from, to).map((x) => [x.date, x.name]));
  const leaves = all(`SELECT lr.from_date, lr.to_date, lr.half_day, lt.code, lt.name, lt.color FROM leave_requests lr JOIN leave_types lt ON lt.id = lr.leave_type_id
    WHERE lr.employee_id = ? AND lr.status = 'approved' AND lr.to_date >= ? AND lr.from_date <= ?`, employeeId, from, to);
  const todayStr = today();
  const days = [];
  for (const d of eachDay(from, to)) {
    const leave = leaves.find((l) => d >= l.from_date && d <= l.to_date);
    days.push(dayStatus({ date: d, rec: recs[d], shift, offs, holiday: hol[d], leave, doj: emp?.doj, exitDate: emp?.exit_date, todayStr }));
  }
  const count = (...s) => days.filter((x) => s.includes(x.status)).length;
  const summary = {
    present: count('present', 'missing_out') + count('half_day', 'short') * 0.5,
    absent: count('absent') + count('half_day', 'short') * 0.5,
    leave: count('leave') + count('half_leave') * 0.5,
    holidays: count('holiday'), weekoffs: count('weekoff'), late: days.filter((x) => x.late).length,
    missing_out: count('missing_out'),
    avg_minutes: Math.round(days.filter((x) => x.work_minutes).reduce((s, x) => s + x.work_minutes, 0) / (days.filter((x) => x.work_minutes).length || 1)),
  };
  return { shift, days, summary };
}

r.get('/today', h((req, res) => {
  res.json({ date: today(), now: nowTime(), record: get('SELECT * FROM attendance WHERE employee_id = ? AND date = ?', req.user.id, today()) || null, shift: shiftFor(req.user.id) });
}));

r.post('/clock', h((req, res) => {
  const { action, lat, lng, work_from = 'office', note } = req.body;
  const d = today(); const t = nowTime();
  const s = getSettings();
  if (s.geo_fencing === '1' && work_from === 'office') {
    const loc = get('SELECT l.* FROM locations l JOIN employees e ON e.location_id = l.id WHERE e.id = ?', req.user.id);
    if (loc?.lat != null && loc?.lng != null) {
      if (lat == null || lng == null) throw bad('Location access is required to clock in from office');
      const dist = haversine(Number(lat), Number(lng), loc.lat, loc.lng);
      if (dist > (loc.radius_m || 200)) throw bad(`You are ${Math.round(dist)} m away from ${loc.name}. Select "Remote" or move closer to clock in.`);
    }
  }
  const rec = get('SELECT * FROM attendance WHERE employee_id = ? AND date = ?', req.user.id, d);
  if (action === 'in') {
    if (rec?.check_in) throw bad('You have already clocked in today');
    if (rec) run('UPDATE attendance SET check_in = ?, in_lat = ?, in_lng = ?, work_from = ?, note = ? WHERE id = ?', t, lat ?? null, lng ?? null, work_from, note ?? null, rec.id);
    else insert('attendance', { employee_id: req.user.id, date: d, check_in: t, in_lat: lat, in_lng: lng, work_from, note, source: 'web' });
  } else if (action === 'out') {
    if (!rec?.check_in) throw bad('Clock in first');
    run('UPDATE attendance SET check_out = ?, out_lat = ?, out_lng = ? WHERE id = ?', t, lat ?? null, lng ?? null, rec.id);
  } else throw bad('Unknown action');
  res.json(get('SELECT * FROM attendance WHERE employee_id = ? AND date = ?', req.user.id, d));
}));

r.get('/month', h((req, res) => {
  const employeeId = Number(req.query.employee_id || req.user.id);
  assertSelfOrManager(req.user, employeeId);
  res.json(monthSheet(employeeId, req.query.month || today().slice(0, 7)));
}));

/** Daily muster for a team (managers) or the whole company (HR). */
r.get('/daily', requireManager, h((req, res) => {
  const date = req.query.date || today();
  let emps = all(`SELECT e.id, e.emp_code, e.first_name, e.last_name, e.doj, e.exit_date, d.name AS department FROM employees e
    LEFT JOIN departments d ON d.id = e.department_id WHERE e.status = 'active' ORDER BY e.first_name`);
  if (!isHR(req.user)) { const ids = new Set(reportIds(req.user.id)); emps = emps.filter((e) => ids.has(e.id)); }
  const recs = Object.fromEntries(all('SELECT * FROM attendance WHERE date = ?', date).map((x) => [x.employee_id, x]));
  const holiday = get('SELECT name FROM holidays WHERE optional = 0 AND date = ?', date)?.name;
  const leaves = all(`SELECT lr.employee_id, lr.half_day, lt.code, lt.name, lt.color FROM leave_requests lr JOIN leave_types lt ON lt.id = lr.leave_type_id
    WHERE lr.status = 'approved' AND ? BETWEEN lr.from_date AND lr.to_date`, date);
  const todayStr = today();
  const rows = emps.map((e) => {
    const shift = shiftFor(e.id);
    return { ...e, ...dayStatus({ date, rec: recs[e.id], shift, offs: weekOffSet(shift), holiday, leave: leaves.find((l) => l.employee_id === e.id), doj: e.doj, exitDate: e.exit_date, todayStr: date === todayStr ? todayStr : '9999-12-31' }) };
  });
  // For "today" an employee without a punch is not yet absent.
  if (date === todayStr) rows.forEach((x) => { if (x.status === 'upcoming') x.status = 'not_in'; });
  res.json(rows);
}));

r.post('/manual', requireHR, h((req, res) => {
  const { employee_id, date, check_in, check_out, note } = req.body;
  if (!employee_id || !date) throw bad('Employee and date are required');
  run(`INSERT INTO attendance (employee_id, date, check_in, check_out, source, note) VALUES (?,?,?,?, 'manual', ?)
    ON CONFLICT(employee_id, date) DO UPDATE SET check_in = excluded.check_in, check_out = excluded.check_out, source = 'manual', note = excluded.note`,
  employee_id, date, check_in || null, check_out || null, note || null);
  res.json({ ok: true });
}));

// ----- Regularization requests -----
r.get('/regularizations', h((req, res) => {
  const employeeId = Number(req.query.employee_id || req.user.id);
  assertSelfOrManager(req.user, employeeId);
  res.json(all('SELECT * FROM regularizations WHERE employee_id = ? ORDER BY id DESC LIMIT 100', employeeId));
}));
r.post('/regularizations', h((req, res) => {
  const { date, check_in, check_out, reason } = req.body;
  if (!date || !check_in || !reason) throw bad('Date, check-in time and reason are required');
  if (date > today()) throw bad('You cannot regularize a future date');
  if (get(`SELECT 1 FROM regularizations WHERE employee_id = ? AND date = ? AND status = 'pending'`, req.user.id, date)) throw bad('A request for this date is already pending');
  const id = insert('regularizations', { employee_id: req.user.id, date, check_in, check_out, reason });
  notify(req.user.manager_id, `${req.user.first_name} requested attendance regularization for ${date}`, '/inbox');
  res.json({ id });
}));
r.delete('/regularizations/:id', h((req, res) => {
  const x = get('SELECT * FROM regularizations WHERE id = ?', req.params.id);
  if (!x || x.employee_id !== req.user.id) throw forbidden();
  if (x.status !== 'pending') throw bad('Only pending requests can be withdrawn');
  run(`UPDATE regularizations SET status = 'cancelled' WHERE id = ?`, x.id);
  res.json({ ok: true });
}));

export default r;
