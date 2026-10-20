import { Router } from 'express';
import { all, get, run, insert, tx, notify, audit } from '../db.js';
import { h, bad, forbidden, notFound, canApprove, isHR, reportIds, addDays, today } from '../util.js';

const r = Router();
const NAME = `e.first_name || ' ' || COALESCE(e.last_name,'') AS employee_name, e.emp_code`;

/** Each approvable request type: table, inbox query, and side effects on decision. */
export const KINDS = {
  leave: {
    table: 'leave_requests', label: 'Leave', link: '/me/leave',
    list: `SELECT x.*, ${NAME}, lt.name AS leave_type, lt.color FROM leave_requests x JOIN employees e ON e.id = x.employee_id
      JOIN leave_types lt ON lt.id = x.leave_type_id WHERE x.status = 'pending'`,
    title: (x) => `${x.leave_type} · ${x.days} day(s)`,
    detail: (x) => `${x.from_date}${x.to_date !== x.from_date ? ` → ${x.to_date}` : ''}${x.half_day ? ' (half day)' : ''}${x.reason ? ` · ${x.reason}` : ''}`,
    msg: (x, s) => `Your leave from ${x.from_date} was ${s}`,
  },
  regularization: {
    table: 'regularizations', label: 'Attendance', link: '/me/attendance',
    list: `SELECT x.*, ${NAME} FROM regularizations x JOIN employees e ON e.id = x.employee_id WHERE x.status = 'pending'`,
    title: (x) => `Regularize ${x.date}`,
    detail: (x) => `${x.check_in || '--'} → ${x.check_out || '--'} · ${x.reason || ''}`,
    msg: (x, s) => `Your attendance regularization for ${x.date} was ${s}`,
    onApprove: (x) => run(`INSERT INTO attendance (employee_id, date, check_in, check_out, source, note) VALUES (?,?,?,?, 'regularized', ?)
      ON CONFLICT(employee_id, date) DO UPDATE SET check_in = excluded.check_in, check_out = COALESCE(excluded.check_out, attendance.check_out), source = 'regularized', note = excluded.note`,
    x.employee_id, x.date, x.check_in, x.check_out, x.reason),
  },
  expense: {
    table: 'expenses', label: 'Expense', link: '/me/expenses',
    list: `SELECT x.*, ${NAME} FROM expenses x JOIN employees e ON e.id = x.employee_id WHERE x.status = 'pending'`,
    title: (x) => `${x.category} · ₹${Number(x.amount).toLocaleString('en-IN')}`,
    detail: (x) => `${x.date}${x.description ? ` · ${x.description}` : ''}`,
    msg: (x, s) => `Your ${x.category} claim of ₹${x.amount} was ${s}`,
  },
  timesheet: {
    table: 'time_entries', label: 'Timesheet', link: '/me/timesheet',
    list: `SELECT x.*, ${NAME}, p.name AS project FROM time_entries x JOIN employees e ON e.id = x.employee_id
      LEFT JOIN projects p ON p.id = x.project_id WHERE x.status = 'pending'`,
    title: (x) => `${x.hours}h on ${x.project || 'General'}`,
    detail: (x) => `${x.date}${x.description ? ` · ${x.description}` : ''}`,
    msg: (x, s) => `Your timesheet entry for ${x.date} was ${s}`,
  },
  loan: {
    table: 'loans', label: 'Loan / Advance', link: '/me/payslips',
    list: `SELECT x.*, ${NAME} FROM loans x JOIN employees e ON e.id = x.employee_id WHERE x.status = 'pending'`,
    title: (x) => `${x.kind} · ₹${Number(x.amount).toLocaleString('en-IN')}`,
    detail: (x) => `EMI ₹${x.emi}/month${x.reason ? ` · ${x.reason}` : ''}`,
    msg: (x, s) => `Your ${x.kind} request was ${s}`,
    onApprove: (x) => run('UPDATE loans SET balance = amount WHERE id = ?', x.id),
    hrOnly: true,
  },
  resignation: {
    table: 'resignations', label: 'Resignation', link: '/me/exit',
    list: `SELECT x.*, ${NAME} FROM resignations x JOIN employees e ON e.id = x.employee_id WHERE x.status = 'pending'`,
    title: () => 'Resignation',
    detail: (x) => `Last working day ${x.last_working_day || 'TBD'}${x.reason ? ` · ${x.reason}` : ''}`,
    msg: (_x, s) => `Your resignation was ${s}`,
    onApprove: (x, body) => {
      const lwd = body.last_working_day || x.last_working_day || addDays(today(), 30);
      run('UPDATE resignations SET last_working_day = ? WHERE id = ?', lwd, x.id);
      run('UPDATE employees SET exit_date = ? WHERE id = ?', lwd, x.employee_id);
      for (const t of all(`SELECT * FROM task_templates WHERE kind = 'offboarding'`)) {
        insert('lifecycle_tasks', { employee_id: x.employee_id, kind: 'offboarding', title: t.title, owner: t.owner, due_date: addDays(lwd, t.due_offset_days) });
      }
    },
  },
};

function approvableIds(user) {
  if (isHR(user)) return null; // null = everyone
  return new Set(reportIds(user.id));
}

r.get('/', h((req, res) => {
  const ids = approvableIds(req.user);
  const items = [];
  for (const [kind, k] of Object.entries(KINDS)) {
    if (k.hrOnly && !isHR(req.user)) continue;
    for (const x of all(`${k.list} ORDER BY x.id`)) {
      if (ids ? !ids.has(x.employee_id) : (x.employee_id === req.user.id && req.user.role !== 'admin')) continue;
      items.push({ kind, kind_label: k.label, id: x.id, employee_id: x.employee_id, employee_name: x.employee_name, emp_code: x.emp_code,
        title: k.title(x), detail: k.detail(x), created_at: x.created_at, record: x });
    }
  }
  items.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  res.json(items);
}));

function decide(user, kind, id, action, body = {}) {
  const k = KINDS[kind];
  if (!k) throw bad('Unknown request type');
  if (!['approve', 'reject'].includes(action)) throw bad('Action must be approve or reject');
  const x = get(`SELECT * FROM ${k.table} WHERE id = ?`, id);
  if (!x) throw notFound('Request not found');
  if (x.status !== 'pending') throw bad('This request has already been processed');
  if (k.hrOnly && !isHR(user)) throw forbidden('Only HR can decide this request');
  if (!canApprove(user, x.employee_id)) throw forbidden('You cannot approve this request');
  const status = action === 'approve' ? 'approved' : 'rejected';
  tx(() => {
    run(`UPDATE ${k.table} SET status = ?, approver_id = ?, decided_at = ?, comment = ? WHERE id = ?`, status, user.id, new Date().toISOString(), body.comment || null, id);
    if (status === 'approved' && k.onApprove) k.onApprove(x, body);
  });
  notify(x.employee_id, `${k.msg(x, status)}${body.comment ? `: "${body.comment}"` : ''}`, k.link);
  audit(user.id, status, kind, Number(id));
}

r.post('/bulk', h((req, res) => {
  const { items = [], action, comment } = req.body;
  const results = items.map(({ kind, id }) => {
    try { decide(req.user, kind, id, action, { comment }); return { kind, id, ok: true }; } catch (e) { return { kind, id, ok: false, error: e.message }; }
  });
  res.json({ results });
}));

r.post('/:kind/:id', h((req, res) => {
  decide(req.user, req.params.kind, Number(req.params.id), req.body.action, req.body);
  res.json({ ok: true });
}));

export default r;
