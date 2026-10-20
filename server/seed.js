import bcrypt from 'bcryptjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { all, get, run, insert, tx, db, DATA_DIR } from './db.js';
import { today, addDays, eachDay, dow, leaveDays } from './util.js';
import { computePayslip } from './payroll.js';

/** Base configuration every new workspace needs. Idempotent. */
export function bootstrap() {
  if (get('SELECT COUNT(*) n FROM shifts').n === 0) {
    insert('shifts', { name: 'General (9:30–18:30)', start_time: '09:30', end_time: '18:30', grace_minutes: 15, half_day_minutes: 240, full_day_minutes: 480, week_offs: '0,6' });
  }
  if (get('SELECT COUNT(*) n FROM leave_types').n === 0) {
    for (const t of [
      { name: 'Casual Leave', code: 'CL', annual_quota: 12, paid: 1, carry_forward: 0, color: '#6366f1' },
      { name: 'Sick Leave', code: 'SL', annual_quota: 8, paid: 1, carry_forward: 0, color: '#f43f5e' },
      { name: 'Earned Leave', code: 'EL', annual_quota: 15, paid: 1, carry_forward: 1, max_carry: 30, allow_half_day: 0, color: '#10b981' },
      { name: 'Leave Without Pay', code: 'LWP', annual_quota: 0, paid: 0, color: '#64748b' },
      // WFH is tracked like leave so managers can plan, but it is paid and does not cut salary.
      { name: 'Work From Home', code: 'WFH', annual_quota: 48, paid: 1, color: '#0ea5e9' },
    ]) insert('leave_types', t);
  }
  if (get('SELECT COUNT(*) n FROM task_templates').n === 0) {
    for (const [kind, title, owner, off] of [
      ['onboarding', 'Send offer letter & collect acceptance', 'hr', -7],
      ['onboarding', 'Collect ID, PAN, address proof & bank details', 'employee', 0],
      ['onboarding', 'Create email & tool accounts', 'it', 0],
      ['onboarding', 'Issue laptop and assets', 'it', 0],
      ['onboarding', 'Assign buddy & 30-60-90 day plan', 'manager', 1],
      ['onboarding', 'Complete policy acknowledgement', 'employee', 3],
      ['onboarding', 'Add to payroll with salary structure', 'hr', 5],
      ['offboarding', 'Knowledge transfer completed', 'manager', -7],
      ['offboarding', 'Return laptop and assets', 'employee', 0],
      ['offboarding', 'Revoke email & tool access', 'it', 0],
      ['offboarding', 'Exit interview', 'hr', -2],
      ['offboarding', 'Full & final settlement', 'hr', 30],
      ['offboarding', 'Issue relieving & experience letter', 'hr', 30],
    ]) insert('task_templates', { kind, title, owner, due_offset_days: off });
  }
  if (get('SELECT COUNT(*) n FROM letter_templates').n === 0) {
    const sign = '\n\nFor {{company}}\n\n\nAuthorised Signatory';
    insert('letter_templates', { name: 'Offer Letter', body: `Date: {{today}}\n\nDear {{name}},\n\nWe are delighted to offer you the position of {{designation}} in the {{department}} team at {{company}}. Your date of joining will be {{doj}} and you will be based at {{location}}.\n\nYour annual cost to company (CTC) will be {{ctc}}. Detailed compensation and benefits are described in the annexure.\n\nYou will report to {{manager}}. This offer is subject to verification of your documents and background.\n\nWe look forward to welcoming you.${sign}` });
    insert('letter_templates', { name: 'Appointment Letter', body: `Date: {{today}}\n\nTo,\n{{name}}\nEmployee Code: {{emp_code}}\n\nSubject: Letter of Appointment\n\nDear {{first_name}},\n\nWith reference to your application and subsequent discussions, we are pleased to appoint you as {{designation}} with effect from {{doj}}, on an annual CTC of {{ctc}}.\n\nYou will be on probation for six months, after which your services may be confirmed in writing. Either party may terminate this employment by giving notice as per company policy.\n\nPlease sign and return a copy of this letter as a token of your acceptance.${sign}` });
    insert('letter_templates', { name: 'Experience Letter', body: `Date: {{today}}\n\nTO WHOMSOEVER IT MAY CONCERN\n\nThis is to certify that {{name}} (Employee Code {{emp_code}}) was employed with {{company}} as {{designation}} in the {{department}} department from {{doj}} to {{last_working_day}}.\n\nDuring this period we found {{first_name}} to be sincere and hardworking. We wish them every success in their future endeavours.${sign}` });
    insert('letter_templates', { name: 'Relieving Letter', body: `Date: {{today}}\n\nDear {{name}},\n\nThis is with reference to your resignation. We wish to inform you that you are relieved from your duties as {{designation}} at {{company}} at the close of business hours on {{last_working_day}}.\n\nYour full and final settlement will be processed as per company policy. We thank you for your contributions and wish you the very best.${sign}` });
    insert('letter_templates', { name: 'Salary Increment Letter', body: `Date: {{today}}\n\nDear {{name}},\n\nIn recognition of your performance and contribution, we are pleased to revise your annual CTC to {{ctc}} with effect from the current payroll cycle.\n\nAll other terms and conditions of your employment remain unchanged. We look forward to your continued success.${sign}` });
    insert('letter_templates', { name: 'Employment Verification Letter', body: `Date: {{today}}\n\nTO WHOMSOEVER IT MAY CONCERN\n\nThis is to confirm that {{name}} is employed with {{company}} as {{designation}} since {{doj}}. Their employee code is {{emp_code}}.\n\nThis letter is issued on the request of the employee.${sign}` });
  }
}

const HOLIDAYS = [
  ['2026-01-26', 'Republic Day'], ['2026-03-04', 'Holi'], ['2026-04-03', 'Good Friday'], ['2026-05-01', 'Labour Day'],
  ['2026-08-15', 'Independence Day'], ['2026-09-14', 'Ganesh Chaturthi'], ['2026-10-02', 'Gandhi Jayanti'], ['2026-10-20', 'Dussehra'],
  ['2026-11-09', 'Diwali'], ['2026-12-25', 'Christmas'], ['2027-01-01', 'New Year', 1], ['2027-01-26', 'Republic Day'],
];

const PEOPLE = [
  // first, last, dept, designation, role, managerIdx, ctc, gender, dob, dojOffsetDays
  ['Ananya', 'Rao', 'Leadership', 'Chief Executive Officer', 'admin', null, 4800000, 'Female', '1984-03-12', -2200],
  ['Rohit', 'Mehta', 'People & HR', 'HR Manager', 'hr', 0, 1500000, 'Male', '1990-07-22', -1500],
  ['Priya', 'Nair', 'Engineering', 'Engineering Manager', 'manager', 0, 3200000, 'Female', '1988-11-05', -1800],
  ['Karan', 'Singh', 'Engineering', 'Senior Software Engineer', 'employee', 2, 2400000, 'Male', '1993-10-28', -1100],
  ['Sneha', 'Iyer', 'Engineering', 'Software Engineer', 'employee', 2, 1400000, 'Female', '1997-02-14', -500],
  ['Arjun', 'Patel', 'Engineering', 'Software Engineer', 'employee', 2, 1200000, 'Male', '1998-10-25', -300],
  ['Meera', 'Joshi', 'Design', 'Product Designer', 'employee', 2, 1600000, 'Female', '1995-06-30', -700],
  ['Vikram', 'Desai', 'Sales', 'Sales Manager', 'manager', 0, 2200000, 'Male', '1987-01-19', -1300],
  ['Neha', 'Kapoor', 'Sales', 'Account Executive', 'employee', 7, 900000, 'Female', '1996-10-31', -400],
  ['Aditya', 'Kulkarni', 'Sales', 'Business Development Rep', 'employee', 7, 480000, 'Male', '2000-12-03', -120],
  ['Pooja', 'Shah', 'Finance', 'Finance Manager', 'manager', 0, 1800000, 'Female', '1989-09-09', -1600],
  ['Rahul', 'Verma', 'Finance', 'Accountant', 'employee', 10, 600000, 'Male', '1994-04-17', -900],
  ['Isha', 'Gupta', 'People & HR', 'HR Executive', 'employee', 1, 540000, 'Female', '1999-08-08', -45],
  ['Siddharth', 'Bose', 'Operations', 'Operations Lead', 'manager', 0, 1400000, 'Male', '1991-05-25', -1000],
  ['Kavya', 'Reddy', 'Operations', 'Operations Associate', 'employee', 13, 360000, 'Female', '2001-11-11', -10],
];

/** Fill an empty workspace with a realistic demo company. `admin` (optional) replaces the first demo person. */
export function loadDemo({ password, admin } = {}) {
  const hash = bcrypt.hashSync(password, 10);
  const t = today();
  tx(() => {
    for (const [d, n, opt] of HOLIDAYS) if (!get('SELECT 1 FROM holidays WHERE date = ?', d)) insert('holidays', { date: d, name: n, optional: opt ? 1 : 0 });
    const loc = (name, lat, lng) => get('SELECT id FROM locations WHERE name = ?', name)?.id || insert('locations', { name, lat, lng, radius_m: 300 });
    const locs = [loc('Mumbai HQ', 19.076, 72.8777), loc('Bengaluru', 12.9716, 77.5946), loc('Remote')];
    const dep = (n) => get('SELECT id FROM departments WHERE name = ?', n)?.id || insert('departments', { name: n });
    const des = (n) => get('SELECT id FROM designations WHERE name = ?', n)?.id || insert('designations', { name: n });
    const shift = get('SELECT id FROM shifts ORDER BY id LIMIT 1').id;

    const ids = [];
    PEOPLE.forEach(([first, last, d, g, role, mgr, ctc, gender, dob, off], i) => {
      const isAdmin = i === 0 && admin;
      const id = isAdmin ? admin.id : insert('employees', {
        emp_code: `EMP${String(i + 1).padStart(3, '0')}`, first_name: first, last_name: last,
        email: `${first.toLowerCase()}.${last.toLowerCase()}@example.com`, password_hash: hash, role,
      });
      run(`UPDATE employees SET department_id = ?, designation_id = ?, manager_id = ?, location_id = ?, shift_id = ?, gender = COALESCE(gender, ?),
        dob = COALESCE(dob, ?), doj = ?, phone = COALESCE(phone, ?), employment_type = ?, blood_group = COALESCE(blood_group, ?),
        bank_name = COALESCE(bank_name, 'HDFC Bank'), bank_account = COALESCE(bank_account, ?), ifsc = COALESCE(ifsc, 'HDFC0000123') WHERE id = ?`,
      dep(d), des(g), mgr == null ? null : ids[mgr], locs[i % 5 === 4 ? 2 : i % 3 === 2 ? 1 : 0], shift, gender, dob, addDays(t, off),
      `+91 98${String(10000000 + i * 7654321).slice(0, 8)}`, i === 14 ? 'Intern' : 'Full-time', ['O+', 'B+', 'A+', 'AB+'][i % 4],
      `50100${String(123456789 + i * 1111).slice(0, 9)}`, id);
      insert('salary_structures', { employee_id: id, ctc_annual: ctc, pf_enabled: 1, esi_enabled: 1, pt_enabled: 1, tds_enabled: 1, effective_from: addDays(t, off) });
      ids.push(id);
    });

    // Attendance for the last ~60 days with realistic noise.
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const hol = new Set(all('SELECT date FROM holidays').map((x) => x.date));
    const pad = (n) => String(n).padStart(2, '0');
    const hhmm = (mins) => `${pad(Math.floor(mins / 60))}:${pad(Math.floor(mins % 60))}:00`;
    for (const d of eachDay(addDays(t, -60), t)) {
      if ([0, 6].includes(dow(d)) || hol.has(d)) continue;
      ids.forEach((id, i) => {
        const doj = addDays(t, PEOPLE[i][9]);
        if (d < doj || rnd() < 0.05) return; // occasional absence
        const inM = 9 * 60 + 10 + Math.floor(rnd() * 40); // 9:10–9:50
        const outM = d === t ? null : inM + 8 * 60 + 30 + Math.floor(rnd() * 60);
        if (d === t && i % 3 === 0) return; // some not yet in today
        insert('attendance', { employee_id: id, date: d, check_in: hhmm(inM), check_out: outM == null ? null : hhmm(outM), source: 'web', work_from: rnd() < 0.15 ? 'remote' : 'office' });
      });
    }

    const lt = Object.fromEntries(all('SELECT id, code FROM leave_types').map((x) => [x.code, x.id]));
    const leave = (i, code, from, to, status, reason) => {
      const days = leaveDays(ids[i], from, to, 0);
      if (!days) return;
      run('DELETE FROM attendance WHERE employee_id = ? AND date BETWEEN ? AND ?', ids[i], from, to);
      insert('leave_requests', { employee_id: ids[i], leave_type_id: lt[code], from_date: from, to_date: to, days, reason, status,
        approver_id: status === 'pending' ? null : ids[PEOPLE[i][5] ?? 0], decided_at: status === 'pending' ? null : new Date().toISOString() });
    };
    leave(3, 'CL', addDays(t, -20), addDays(t, -19), 'approved', 'Family function');
    leave(4, 'SL', addDays(t, -9), addDays(t, -9), 'approved', 'Fever');
    leave(8, 'EL', addDays(t, 6), addDays(t, 10), 'pending', 'Vacation to Goa');
    leave(5, 'CL', addDays(t, 2), addDays(t, 2), 'pending', 'Personal work');
    leave(11, 'WFH', addDays(t, 1), addDays(t, 1), 'pending', 'Internet installation at home');
    leave(6, 'CL', t, t, 'approved', 'Bank work');

    insert('regularizations', { employee_id: ids[5], date: addDays(t, -6), check_in: '09:30', check_out: '18:45', reason: 'Forgot to clock in, was in client meeting' });

    const cats = ['Travel', 'Food', 'Internet', 'Accommodation'];
    [[3, 0, 2450, -12, 'approved'], [8, 0, 5600, -8, 'pending'], [9, 1, 820, -3, 'pending'], [4, 2, 999, -25, 'paid'], [7, 3, 7800, -15, 'approved']]
      .forEach(([i, c, amt, off, status]) => insert('expenses', { employee_id: ids[i], category: cats[c], amount: amt, date: addDays(t, off),
        description: ['Cab to client office', 'Client dinner', 'Monthly broadband', 'Hotel stay – Pune visit'][c], status }));

    insert('loans', { employee_id: ids[11], kind: 'Salary Advance', amount: 30000, emi: 5000, balance: 0, reason: 'Medical emergency', status: 'pending' });

    const projects = ['Website Revamp', 'Mobile App v2', 'Internal Tools', 'Client: Zenith Retail'].map((name, i) => insert('projects', { name, client: i === 3 ? 'Zenith Retail' : 'Internal' }));
    for (const i of [3, 4, 5, 6]) for (let k = 1; k <= 5; k++) {
      const d = addDays(t, -k); if ([0, 6].includes(dow(d)) || hol.has(d)) continue;
      insert('time_entries', { employee_id: ids[i], project_id: projects[(i + k) % 4], date: d, hours: 6 + (k % 3), description: 'Feature work & reviews', status: k > 2 ? 'approved' : 'pending', approver_id: k > 2 ? ids[2] : null });
    }

    const cycle = insert('review_cycles', { name: `H2 ${t.slice(0, 4)} Review`, start_date: `${t.slice(0, 4)}-07-01`, end_date: `${t.slice(0, 4)}-12-31`, status: 'active' });
    const company = insert('goals', { employee_id: ids[0], cycle_id: cycle, kind: 'OKR', title: 'Grow ARR to ₹12 Cr', target: '₹12 Cr ARR', weight: 100, progress: 58, due_date: `${t.slice(0, 4)}-12-31` });
    const eng = insert('goals', { employee_id: ids[2], cycle_id: cycle, parent_id: company, kind: 'OKR', title: 'Ship Mobile App v2', target: 'GA release', weight: 50, progress: 65, due_date: addDays(t, 40) });
    insert('goals', { employee_id: ids[3], cycle_id: cycle, parent_id: eng, title: 'Offline sync for mobile app', target: '100% of core flows', weight: 40, progress: 70, due_date: addDays(t, 25) });
    insert('goals', { employee_id: ids[3], cycle_id: cycle, title: 'Reduce p95 API latency', target: '< 300 ms', weight: 30, progress: 40, due_date: addDays(t, 50), status: 'at_risk' });
    insert('goals', { employee_id: ids[4], cycle_id: cycle, parent_id: eng, title: 'Build new onboarding screens', target: '6 screens', weight: 50, progress: 90, due_date: addDays(t, 10) });
    insert('goals', { employee_id: ids[8], cycle_id: cycle, title: 'Close ₹80L new business', target: '₹80L', weight: 70, progress: 45, due_date: addDays(t, 70) });
    for (const [i, id] of ids.entries()) run('INSERT OR IGNORE INTO reviews (cycle_id, employee_id, reviewer_id, status) VALUES (?,?,?,?)', cycle, id, PEOPLE[i][5] == null ? null : ids[PEOPLE[i][5]], 'self_pending');
    run(`UPDATE reviews SET self_rating = 4, self_comment = 'Delivered offline sync ahead of schedule and mentored two juniors.', status = 'manager_pending' WHERE employee_id = ?`, ids[3]);

    const dEng = get(`SELECT id FROM departments WHERE name = 'Engineering'`).id; const dSales = get(`SELECT id FROM departments WHERE name = 'Sales'`).id;
    const j1 = insert('jobs', { title: 'Senior Backend Engineer', department_id: dEng, location: 'Bengaluru / Remote', openings: 2, experience: '4–7 years', salary_range: '₹25–35 LPA', description: 'Own core APIs and data pipelines. Node.js, SQL, distributed systems.', hiring_manager_id: ids[2] });
    const j2 = insert('jobs', { title: 'Account Executive', department_id: dSales, location: 'Mumbai', openings: 1, experience: '2–4 years', salary_range: '₹8–12 LPA', description: 'Run full-cycle B2B sales for mid-market accounts.', hiring_manager_id: ids[7] });
    [['Nikhil Saxena', j1, 'interview', 4, 'LinkedIn'], ['Divya Menon', j1, 'screening', 3, 'Referral'], ['Farhan Ali', j1, 'applied', null, 'Careers page'],
      ['Ritika Malhotra', j1, 'offer', 5, 'Referral'], ['Sameer Khan', j2, 'interview', 3, 'Naukri'], ['Tanvi Bhatt', j2, 'applied', null, 'LinkedIn'], ['Gaurav Jain', j2, 'rejected', 2, 'Agency']]
      .forEach(([name, job, stage, rating, source]) => insert('candidates', { name, job_id: job, stage, rating, source, email: `${name.split(' ')[0].toLowerCase()}@mail.example`, notice_period: '30 days', expected_ctc: job === j1 ? '30 LPA' : '10 LPA' }));

    insert('tickets', { employee_id: ids[5], category: 'Payroll', subject: 'Form 16 for last financial year', description: 'Please share my Form 16, I need it for a loan application.', priority: 'medium', assignee_id: ids[1] });
    const tk = insert('tickets', { employee_id: ids[9], category: 'IT', subject: 'Laptop running very slow', description: 'Takes 10+ minutes to boot. Can I get a replacement?', priority: 'high', status: 'in_progress', assignee_id: ids[13] });
    insert('ticket_comments', { ticket_id: tk, author_id: ids[13], body: 'We have a spare MacBook Air. Can you come to the IT desk tomorrow at 11?' });

    [['LT-001', 'MacBook Pro 14"', 'Laptop', 3], ['LT-002', 'MacBook Air M3', 'Laptop', 4], ['LT-003', 'Dell Latitude 7440', 'Laptop', 9], ['LT-004', 'MacBook Air M2', 'Laptop', null],
      ['MN-001', 'Dell 27" 4K Monitor', 'Monitor', 3], ['PH-001', 'iPhone 15', 'Phone', 7], ['AC-001', 'Logitech MX Keys', 'Accessories', 6]]
      .forEach(([tag, name, category, i]) => insert('assets', { tag, name, category, serial: `SN${tag.replace('-', '')}X9`, purchase_date: addDays(t, -400), cost: category === 'Laptop' ? 145000 : 25000,
        status: i == null ? 'available' : 'assigned', assigned_to: i == null ? null : ids[i], assigned_at: i == null ? null : addDays(t, -200) }));

    insert('announcements', { title: 'Diwali celebrations on 6th November 🪔', body: 'Join us in the cafeteria at 4 PM on Friday for sweets, rangoli competition and secret santa reveal. Ethnic wear encouraged!', author_id: ids[1], pinned: 1 });
    insert('announcements', { title: 'New WFH policy', body: 'Starting next month, everyone can work from home up to 4 days a month. Apply via Leave → Work From Home so your manager can plan.', author_id: ids[1] });
    insert('polls', { question: 'Where should we go for the annual offsite?', options: ['Goa', 'Udaipur', 'Rishikesh', 'Coorg'], author_id: ids[1], closes_on: addDays(t, 14) });
    insert('kudos', { from_id: ids[2], to_id: ids[3], badge: 'Problem Solver', message: 'Fixed the production outage at 2 AM and wrote a great postmortem. Thank you!' });
    insert('kudos', { from_id: ids[7], to_id: ids[8], badge: 'Team Player', message: 'Stepped in for the Zenith demo at a moment’s notice and nailed it.' });

    // Onboarding checklist for the newest joiner, some items done.
    for (const tpl of all(`SELECT * FROM task_templates WHERE kind = 'onboarding'`)) {
      insert('lifecycle_tasks', { employee_id: ids[14], kind: 'onboarding', title: tpl.title, owner: tpl.owner, due_date: addDays(addDays(t, -10), tpl.due_offset_days), done: tpl.due_offset_days <= 0 ? 1 : 0 });
    }
    insert('resignations', { employee_id: ids[11], resign_date: addDays(t, -2), last_working_day: addDays(t, 28), reason: 'Relocating to Pune for family reasons' });

    // Finalized payroll for last month.
    const [y, m] = t.slice(0, 7).split('-').map(Number);
    const month = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
    const runId = insert('payroll_runs', { month, working_days: new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0)).getUTCDate(), status: 'finalized', finalized_at: new Date().toISOString(), created_by: ids[1] });
    for (const id of ids) {
      const e = get('SELECT * FROM employees WHERE id = ?', id);
      const s = computePayslip(e, month);
      if (!s) continue;
      run(`INSERT INTO payslips (run_id, employee_id, working_days, paid_days, lop_days, earnings, deductions, employer, adjustments, gross, total_deductions, net)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`, runId, id, s.working_days, s.paid_days, s.lop_days, JSON.stringify(s.earnings), JSON.stringify(s.deductions), JSON.stringify(s.employer), '{}', s.gross, s.total_deductions, s.net);
    }
  });
}

// CLI: `npm run seed` wipes the database and loads the demo company with a known admin login.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.argv.includes('--reset')) { console.log('Usage: npm run seed  (wipes data/hr.db and loads demo data)'); process.exit(0); }
  const tables = all(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`).map((x) => x.name);
  db.exec('PRAGMA foreign_keys = OFF');
  for (const tbl of tables) if (tbl !== 'settings') db.exec(`DELETE FROM ${tbl}`);
  db.exec('PRAGMA foreign_keys = ON');
  fs.rmSync(path.join(DATA_DIR, 'uploads'), { recursive: true, force: true });
  fs.mkdirSync(path.join(DATA_DIR, 'uploads'), { recursive: true });
  bootstrap();
  const password = process.env.DEMO_PASSWORD || 'demo1234';
  loadDemo({ password });
  console.log(`Demo data loaded. Sign in as ananya.rao@example.com (admin), rohit.mehta@example.com (HR), priya.nair@example.com (manager) or karan.singh@example.com (employee) — password: ${password}`);
}
