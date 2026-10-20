import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const DATA_DIR = process.env.DATA_DIR || fileURLToPath(new URL('../data', import.meta.url));
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

export const db = new DatabaseSync(path.join(DATA_DIR, 'hr.db'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');

// node:sqlite returns null-prototype objects; normalise to plain objects for JSON + spreading.
const plain = (r) => (r ? { ...r } : r);
export const all = (sql, ...p) => db.prepare(sql).all(...p).map(plain);
export const get = (sql, ...p) => plain(db.prepare(sql).get(...p));
export const run = (sql, ...p) => db.prepare(sql).run(...p);
export const tx = (fn) => {
  db.exec('BEGIN');
  try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; }
};

/** Insert an object into a table, returns new id. Only keys present in `allowed` are written. */
export function insert(table, obj, allowed) {
  const keys = Object.keys(obj).filter((k) => obj[k] !== undefined && (!allowed || allowed.includes(k)));
  const r = run(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`, ...keys.map((k) => norm(obj[k])));
  return Number(r.lastInsertRowid);
}
export function update(table, id, obj, allowed) {
  const keys = Object.keys(obj).filter((k) => obj[k] !== undefined && (!allowed || allowed.includes(k)));
  if (!keys.length) return;
  run(`UPDATE ${table} SET ${keys.map((k) => `${k} = ?`).join(',')} WHERE id = ?`, ...keys.map((k) => norm(obj[k])), id);
}
const norm = (v) => (v === '' ? null : typeof v === 'boolean' ? Number(v) : v !== null && typeof v === 'object' ? JSON.stringify(v) : v);

db.exec(`
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS departments (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE);
CREATE TABLE IF NOT EXISTS designations (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE);
CREATE TABLE IF NOT EXISTS locations (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, lat REAL, lng REAL, radius_m INTEGER);
CREATE TABLE IF NOT EXISTS shifts (id INTEGER PRIMARY KEY, name TEXT NOT NULL, start_time TEXT NOT NULL, end_time TEXT NOT NULL,
  grace_minutes INTEGER DEFAULT 15, half_day_minutes INTEGER DEFAULT 240, full_day_minutes INTEGER DEFAULT 480, week_offs TEXT DEFAULT '0,6');

CREATE TABLE IF NOT EXISTS employees (
  id INTEGER PRIMARY KEY, emp_code TEXT UNIQUE, first_name TEXT NOT NULL, last_name TEXT, email TEXT NOT NULL UNIQUE,
  password_hash TEXT, role TEXT NOT NULL DEFAULT 'employee', phone TEXT, personal_email TEXT, dob TEXT, gender TEXT,
  marital_status TEXT, blood_group TEXT, address TEXT, emergency_contact TEXT,
  doj TEXT, department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL,
  designation_id INTEGER REFERENCES designations(id) ON DELETE SET NULL,
  location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL,
  manager_id INTEGER REFERENCES employees(id) ON DELETE SET NULL,
  shift_id INTEGER REFERENCES shifts(id) ON DELETE SET NULL,
  employment_type TEXT DEFAULT 'Full-time', probation_end TEXT, status TEXT NOT NULL DEFAULT 'active', exit_date TEXT,
  pan TEXT, aadhaar TEXT, uan TEXT, bank_name TEXT, bank_account TEXT, ifsc TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS documents (id INTEGER PRIMARY KEY, employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE,
  name TEXT NOT NULL, category TEXT, file TEXT NOT NULL, mime TEXT, size INTEGER, uploaded_by INTEGER, created_at TEXT DEFAULT CURRENT_TIMESTAMP);

CREATE TABLE IF NOT EXISTS holidays (id INTEGER PRIMARY KEY, date TEXT NOT NULL, name TEXT NOT NULL, optional INTEGER DEFAULT 0);

CREATE TABLE IF NOT EXISTS attendance (id INTEGER PRIMARY KEY, employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  date TEXT NOT NULL, check_in TEXT, check_out TEXT, in_lat REAL, in_lng REAL, out_lat REAL, out_lng REAL,
  source TEXT DEFAULT 'web', work_from TEXT DEFAULT 'office', note TEXT, UNIQUE(employee_id, date));

CREATE TABLE IF NOT EXISTS regularizations (id INTEGER PRIMARY KEY, employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  date TEXT NOT NULL, check_in TEXT, check_out TEXT, reason TEXT, status TEXT DEFAULT 'pending',
  approver_id INTEGER, decided_at TEXT, comment TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);

CREATE TABLE IF NOT EXISTS leave_types (id INTEGER PRIMARY KEY, name TEXT NOT NULL, code TEXT NOT NULL UNIQUE, annual_quota REAL DEFAULT 0,
  paid INTEGER DEFAULT 1, carry_forward INTEGER DEFAULT 0, max_carry REAL DEFAULT 0, allow_half_day INTEGER DEFAULT 1,
  color TEXT DEFAULT '#6366f1', active INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS leave_allocations (id INTEGER PRIMARY KEY, employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  leave_type_id INTEGER NOT NULL REFERENCES leave_types(id) ON DELETE CASCADE, year INTEGER NOT NULL, days REAL NOT NULL,
  UNIQUE(employee_id, leave_type_id, year));
CREATE TABLE IF NOT EXISTS leave_requests (id INTEGER PRIMARY KEY, employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  leave_type_id INTEGER NOT NULL REFERENCES leave_types(id), from_date TEXT NOT NULL, to_date TEXT NOT NULL, half_day INTEGER DEFAULT 0,
  days REAL NOT NULL, reason TEXT, status TEXT DEFAULT 'pending', approver_id INTEGER, decided_at TEXT, comment TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP);

CREATE TABLE IF NOT EXISTS salary_structures (employee_id INTEGER PRIMARY KEY REFERENCES employees(id) ON DELETE CASCADE,
  ctc_annual REAL NOT NULL DEFAULT 0, basic_pct REAL, hra_pct REAL, pf_enabled INTEGER DEFAULT 1, esi_enabled INTEGER DEFAULT 1,
  pt_enabled INTEGER DEFAULT 1, tds_enabled INTEGER DEFAULT 1, effective_from TEXT, updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS salary_revisions (id INTEGER PRIMARY KEY, employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE,
  old_ctc REAL, new_ctc REAL, effective_from TEXT, note TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS payroll_runs (id INTEGER PRIMARY KEY, month TEXT NOT NULL UNIQUE, status TEXT DEFAULT 'draft',
  working_days INTEGER, created_by INTEGER, finalized_at TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS payslips (id INTEGER PRIMARY KEY, run_id INTEGER NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE, working_days REAL, paid_days REAL, lop_days REAL,
  earnings TEXT, deductions TEXT, employer TEXT, adjustments TEXT, gross REAL, total_deductions REAL, net REAL, UNIQUE(run_id, employee_id));

CREATE TABLE IF NOT EXISTS loans (id INTEGER PRIMARY KEY, employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  kind TEXT DEFAULT 'Salary Advance', amount REAL NOT NULL, emi REAL NOT NULL, balance REAL, reason TEXT, status TEXT DEFAULT 'pending',
  approver_id INTEGER, decided_at TEXT, comment TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);

CREATE TABLE IF NOT EXISTS expenses (id INTEGER PRIMARY KEY, employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  category TEXT NOT NULL, amount REAL NOT NULL, date TEXT NOT NULL, description TEXT, receipt TEXT, status TEXT DEFAULT 'pending',
  approver_id INTEGER, decided_at TEXT, comment TEXT, paid_run_id INTEGER, created_at TEXT DEFAULT CURRENT_TIMESTAMP);

CREATE TABLE IF NOT EXISTS projects (id INTEGER PRIMARY KEY, name TEXT NOT NULL, client TEXT, active INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS time_entries (id INTEGER PRIMARY KEY, employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL, date TEXT NOT NULL, hours REAL NOT NULL, description TEXT,
  status TEXT DEFAULT 'pending', approver_id INTEGER, decided_at TEXT, comment TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);

CREATE TABLE IF NOT EXISTS review_cycles (id INTEGER PRIMARY KEY, name TEXT NOT NULL, start_date TEXT, end_date TEXT, status TEXT DEFAULT 'active');
CREATE TABLE IF NOT EXISTS goals (id INTEGER PRIMARY KEY, employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  cycle_id INTEGER REFERENCES review_cycles(id) ON DELETE SET NULL, parent_id INTEGER REFERENCES goals(id) ON DELETE SET NULL,
  title TEXT NOT NULL, description TEXT, kind TEXT DEFAULT 'KRA', target TEXT, weight REAL DEFAULT 0, progress REAL DEFAULT 0,
  due_date TEXT, status TEXT DEFAULT 'on_track', created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS reviews (id INTEGER PRIMARY KEY, cycle_id INTEGER NOT NULL REFERENCES review_cycles(id) ON DELETE CASCADE,
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE, reviewer_id INTEGER,
  self_rating REAL, self_comment TEXT, manager_rating REAL, manager_comment TEXT, final_rating REAL,
  status TEXT DEFAULT 'self_pending', UNIQUE(cycle_id, employee_id));

CREATE TABLE IF NOT EXISTS jobs (id INTEGER PRIMARY KEY, title TEXT NOT NULL, department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL,
  location TEXT, employment_type TEXT DEFAULT 'Full-time', openings INTEGER DEFAULT 1, experience TEXT, salary_range TEXT,
  description TEXT, status TEXT DEFAULT 'open', hiring_manager_id INTEGER, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS candidates (id INTEGER PRIMARY KEY, job_id INTEGER REFERENCES jobs(id) ON DELETE CASCADE, name TEXT NOT NULL,
  email TEXT, phone TEXT, source TEXT, current_ctc TEXT, expected_ctc TEXT, notice_period TEXT, resume TEXT, stage TEXT DEFAULT 'applied',
  rating INTEGER, notes TEXT, interview_at TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);

CREATE TABLE IF NOT EXISTS task_templates (id INTEGER PRIMARY KEY, kind TEXT NOT NULL, title TEXT NOT NULL, owner TEXT DEFAULT 'hr', due_offset_days INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS lifecycle_tasks (id INTEGER PRIMARY KEY, employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  kind TEXT NOT NULL, title TEXT NOT NULL, owner TEXT, due_date TEXT, done INTEGER DEFAULT 0, done_at TEXT, done_by INTEGER);
CREATE TABLE IF NOT EXISTS resignations (id INTEGER PRIMARY KEY, employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  resign_date TEXT NOT NULL, last_working_day TEXT, reason TEXT, status TEXT DEFAULT 'pending', approver_id INTEGER, decided_at TEXT,
  comment TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);

CREATE TABLE IF NOT EXISTS tickets (id INTEGER PRIMARY KEY, employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  category TEXT, subject TEXT NOT NULL, description TEXT, priority TEXT DEFAULT 'medium', status TEXT DEFAULT 'open',
  assignee_id INTEGER, created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS ticket_comments (id INTEGER PRIMARY KEY, ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  author_id INTEGER, body TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP);

CREATE TABLE IF NOT EXISTS assets (id INTEGER PRIMARY KEY, tag TEXT UNIQUE, name TEXT NOT NULL, category TEXT, serial TEXT,
  purchase_date TEXT, cost REAL, status TEXT DEFAULT 'available', assigned_to INTEGER REFERENCES employees(id) ON DELETE SET NULL,
  assigned_at TEXT, notes TEXT);
CREATE TABLE IF NOT EXISTS asset_history (id INTEGER PRIMARY KEY, asset_id INTEGER REFERENCES assets(id) ON DELETE CASCADE,
  employee_id INTEGER, action TEXT, at TEXT DEFAULT CURRENT_TIMESTAMP, by INTEGER);

CREATE TABLE IF NOT EXISTS announcements (id INTEGER PRIMARY KEY, title TEXT NOT NULL, body TEXT, author_id INTEGER, pinned INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS polls (id INTEGER PRIMARY KEY, question TEXT NOT NULL, options TEXT NOT NULL, author_id INTEGER, closes_on TEXT,
  anonymous INTEGER DEFAULT 1, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS poll_votes (poll_id INTEGER REFERENCES polls(id) ON DELETE CASCADE, employee_id INTEGER, option_index INTEGER,
  PRIMARY KEY(poll_id, employee_id));
CREATE TABLE IF NOT EXISTS kudos (id INTEGER PRIMARY KEY, from_id INTEGER, to_id INTEGER REFERENCES employees(id) ON DELETE CASCADE,
  badge TEXT, message TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);

CREATE TABLE IF NOT EXISTS letter_templates (id INTEGER PRIMARY KEY, name TEXT NOT NULL, body TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS notifications (id INTEGER PRIMARY KEY, employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE,
  title TEXT NOT NULL, link TEXT, read INTEGER DEFAULT 0, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS audit_log (id INTEGER PRIMARY KEY, actor_id INTEGER, action TEXT, entity TEXT, entity_id INTEGER, detail TEXT,
  at TEXT DEFAULT CURRENT_TIMESTAMP);

CREATE INDEX IF NOT EXISTS idx_att_date ON attendance(date);
CREATE INDEX IF NOT EXISTS idx_leave_emp ON leave_requests(employee_id, status);
CREATE INDEX IF NOT EXISTS idx_notif ON notifications(employee_id, read);
`);

const DEFAULT_SETTINGS = {
  company_name: 'Acme Pvt Ltd',
  company_address: '',
  currency: 'INR',
  basic_pct: '50',
  hra_pct: '40',
  pf_wage_cap: '15000',
  esi_gross_limit: '21000',
  pt_amount: '200',
  leave_year_start_month: '1',
  geo_fencing: '0',
  expense_categories: 'Travel,Food,Accommodation,Internet,Fuel,Office Supplies,Other',
  ticket_categories: 'IT,Payroll,HR Policy,Facilities,Leave & Attendance,Other',
  asset_categories: 'Laptop,Monitor,Phone,Accessories,Furniture,Other',
};
for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) run('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)', k, v);

export const getSettings = () => Object.fromEntries(all('SELECT key, value FROM settings').map((r) => [r.key, r.value]));
export const setting = (k) => get('SELECT value FROM settings WHERE key = ?', k)?.value;

export function notify(employeeId, title, link) {
  if (employeeId) run('INSERT INTO notifications (employee_id, title, link) VALUES (?, ?, ?)', employeeId, title, link || null);
}
export function audit(actorId, action, entity, entityId, detail) {
  run('INSERT INTO audit_log (actor_id, action, entity, entity_id, detail) VALUES (?,?,?,?,?)', actorId, action, entity, entityId ?? null, detail ? JSON.stringify(detail) : null);
}
