// End-to-end API smoke test: boots the server on a throwaway database loaded with demo data,
// signs in as admin / HR / manager / employee and exercises every module.
// Usage: npm test
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'teamhr-test-'));
const port = 4100 + Math.floor(Math.random() * 800);
const env = { ...process.env, DATA_DIR: dataDir, PORT: String(port) };
const node = ['--disable-warning=ExperimentalWarning'];
execFileSync(process.execPath, [...node, 'server/seed.js', '--reset'], { cwd: root, env, stdio: 'ignore' });
const server = spawn(process.execPath, [...node, 'server/index.js'], { cwd: root, env, stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((resolve) => server.stdout.on('data', (d) => String(d).includes('running') && resolve()));

const B = `http://localhost:${port}/api`;
const jar = {};
async function call(who, method, p, body) {
  const r = await fetch(B + p, { method, headers: { 'content-type': 'application/json', cookie: jar[who] || '' }, body: body ? JSON.stringify(body) : undefined });
  const sc = r.headers.get('set-cookie'); if (sc) jar[who] = sc.split(';')[0];
  return { s: r.status, j: await r.json().catch(() => null) };
}
const fails = [];
async function ok(who, m, p, b, expect = 200) { const r = await call(who, m, p, b); const line = `${who} ${m} ${p} -> ${r.s}`; if (r.s !== expect) { fails.push(`${line} ${JSON.stringify(r.j).slice(0, 200)}`); } return r.j; }
for (const [who, email] of [['admin','ananya.rao'],['hr','rohit.mehta'],['mgr','priya.nair'],['emp','karan.singh']]) await ok(who, 'POST', '/auth/login', { email: `${email}@example.com`, password: 'demo1234' });
for (const who of ['admin','hr','mgr','emp']) {
  for (const p of ['/auth/me','/dashboard','/employees','/employees/org-chart','/attendance/today','/attendance/month','/leave/balances','/leave/requests','/leave/calendar','/approvals','/payroll/my-payslips','/work/expenses','/work/timesheets','/performance/goals','/performance/reviews','/helpdesk','/assets','/engage/announcements','/engage/polls','/engage/kudos','/notifications','/masters/departments','/masters/settings','/lifecycle/tasks','/lifecycle/resignations','/payroll/loans']) await ok(who, 'GET', p);
}
for (const p of ['/payroll/structures','/payroll/runs','/reports/headcount','/reports/attendance','/reports/leave','/leave/allocations','/letters/templates','/attendance/daily','/recruitment/jobs','/recruitment/candidates','/lifecycle/tasks?scope=all','/masters/audit-log']) await ok('admin','GET',p);
await ok('emp','GET','/payroll/structures',null,403);
await ok('emp','GET','/reports/headcount',null,403);
await ok('emp','GET','/recruitment/jobs',null,403);
await ok('mgr','GET','/attendance/daily');
const inbox = await ok('mgr','GET','/approvals'); console.log('mgr inbox', inbox?.length, inbox?.map(x=>x.kind).join(','));
const hrInbox = await ok('hr','GET','/approvals'); console.log('hr inbox', hrInbox?.length);
// employee flows
const me = await ok('emp','GET','/auth/me');
await ok('emp','POST','/attendance/clock',{action:'in'}, undefined);
const lt = await ok('emp','GET','/leave/balances'); console.log('balances', lt.map(b=>`${b.code}:${b.available}`).join(' '));
const lr = await ok('emp','POST','/leave/requests',{leave_type_id: lt[0].leave_type_id, from_date:'2026-11-16', to_date:'2026-11-17', reason:'test'}); console.log('leave', lr);
await ok('mgr','POST',`/approvals/leave/${lr.id}`,{action:'approve'});
await ok('emp','POST','/work/expenses',{category:'Travel',amount:500,date:'2026-10-15'});
const tkt = await ok('emp','POST','/helpdesk',{subject:'Test ticket'});
await ok('hr','POST',`/helpdesk/${tkt.id}/comments`,{body:'On it'});
await ok('emp','POST','/engage/kudos',{to_id: 5, message:'thanks'});
// payroll run
const runs = await ok('hr','POST','/payroll/runs',{month:'2026-10'}); 
const run = await ok('hr','GET',`/payroll/runs/${runs.id}`); console.log('run slips', run.slips.length, 'net total', run.slips.reduce((s,x)=>s+x.net,0));
await ok('hr','POST',`/payroll/runs/${runs.id}/recalculate`);
await ok('hr','POST',`/payroll/runs/${runs.id}/finalize`);
const slips = await ok('emp','GET','/payroll/my-payslips'); console.log('emp payslips', slips.length);
await ok('emp','GET',`/payroll/payslips/${slips[0].id}`);
const tpl = (await ok('hr','GET','/letters/templates')).templates[0];
const letter = await ok('hr','POST','/letters/render',{template_id:tpl.id, employee_id: me.user.id}); console.log('letter rendered:', letter.body.split('\n')[0]);
await ok('hr','POST','/employees',{first_name:'Test',last_name:'User',email:'test.user@example.com', ctc_annual: 600000});
await ok('hr','POST','/performance/cycles/1/launch');
server.kill();
fs.rmSync(dataDir, { recursive: true, force: true });
if (fails.length) { console.error(`\n${fails.length} check(s) failed:`); fails.forEach((f) => console.error(`  ${f}`)); process.exit(1); }
console.log('\nAll API checks passed.');
