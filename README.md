# TeamHR

A self-hosted HR management system for small and mid-size teams, modelled on the module set of commercial Indian HRMS products. One Node.js process, one SQLite file, no external services.

## Features

| Module | What it does |
| --- | --- |
| **Home dashboard** | Clock-in widget, leave balances, announcements, who's out, birthdays & work anniversaries, holidays, kudos, HR headcount stats |
| **Inbox** | One place for managers/HR to approve leave, attendance regularizations, expenses, timesheets, loans and resignations, with bulk approve |
| **People** | Employee directory (grid/list), profiles with job, personal, statutory & bank details, documents, CSV bulk import, org chart |
| **Attendance** | Web clock-in/out (office/remote, optional geo-fencing), monthly calendar, late marks, half days, regularization requests, daily muster, manual corrections, shifts & week-offs |
| **Leave** | Configurable leave types, balances with pro-rating for new joiners, half days, holiday/week-off aware day counts, team leave calendar, allocations, year-end carry-forward rollover |
| **Payroll** | Salary structures (CTC → Basic/HRA/Special), PF, ESI, Professional Tax, TDS (new regime FY25-26 slabs with 87A rebate), loss of pay, reimbursements, loan EMI recovery, draft → finalize runs, payroll register, bank transfer file, printable payslips |
| **Expenses** | Claims with receipt upload, approval, automatic reimbursement in payroll |
| **Timesheets** | Weekly project time logging with manager approval |
| **Performance** | Goals/KRAs/OKRs with alignment to parent goals, progress tracking, review cycles with self + manager ratings |
| **Recruitment** | Job openings, drag-and-drop candidate pipeline, resumes, ratings, interview scheduling, one-click convert hire → employee |
| **Onboarding & exit** | Checklist templates auto-applied on joining and on resignation approval, resignation workflow, exit completion |
| **Helpdesk** | Employee tickets with categories, priorities, assignment and threaded replies |
| **Assets** | Asset register, assignment/return with history |
| **Engage** | Announcements (notify everyone), polls, kudos wall |
| **Letters** | Offer, appointment, experience, relieving, increment and verification letter templates with placeholders; print to PDF |
| **Reports** | Headcount trend, joins vs exits, attrition, department/location/type/gender split, monthly attendance summary, leave balances — all exportable to CSV |
| **Settings** | Company details, payroll & statutory rules, departments, designations, locations, shifts, holidays, leave types, projects, checklist templates, audit log |

**Roles:** `admin` (everything incl. settings), `hr` (all HR operations), `manager` (approves and views their reporting line), `employee` (self-service). Anyone with direct reports gets manager views automatically.

## Quick start

Requires **Node.js 22.13+** (uses the built-in `node:sqlite`; no native build step).

```bash
npm install
npm run build
npm start
```

Open http://localhost:4000. On first run you'll see a setup screen to create your company and admin account. Tick **Load sample data** if you want to explore with a fictional company first.

To wipe the database and load the demo company from the command line:

```bash
npm run seed
```

Demo logins (password `demo1234`): `ananya.rao@example.com` (admin), `rohit.mehta@example.com` (HR), `priya.nair@example.com` (manager), `karan.singh@example.com` (employee).

### Development

```bash
npm run dev
```

Runs the API on :4000 (auto-restarts) and Vite on http://localhost:5173 with hot reload.

### Tests

```bash
npm test
```

Boots the server on a throwaway database and exercises every module as each role.

## Deploying for your team

### Docker

```bash
JWT_SECRET=$(openssl rand -hex 32) docker compose up -d --build
```

Data lives in the `teamhr-data` volume.

### Any Node host (VM, Render, Railway, Fly.io…)

Run `npm ci && npm run build`, then `npm start`. Mount a **persistent disk** at `DATA_DIR` — the SQLite database and uploaded documents live there.

### Configuration

See [`.env.example`](.env.example):

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `4000` | HTTP port |
| `DATA_DIR` | `./data` | Database + uploads location |
| `JWT_SECRET` | auto-generated | Session signing secret |
| `COOKIE_SECURE` | `0` | Set `1` behind HTTPS |
| `TZ_NAME` | `Asia/Kolkata` | Timezone for attendance and "today" |

### Production checklist

- Put it behind HTTPS (Caddy, nginx, or your platform's TLS) and set `COOKIE_SECURE=1`.
- Back up `DATA_DIR` regularly (`hr.db`, `hr.db-wal`, and `uploads/`).
- Review **Settings → Payroll & statutory** and **Holidays** for your state and year. Payroll calculations are a sensible default for Indian salaries, not tax advice — have your accountant verify them before paying salaries.

## Adding your team

1. **Settings** → set up departments, designations, locations, shifts, holidays and leave types.
2. **People → Import CSV** (download the template from the dialog) or **Add employee** one by one. Each new employee gets a temporary password and an onboarding checklist.
3. **Payroll → Salary structures** → set each person's annual CTC.
4. Share the URL. Everyone signs in with their work email and changes their password from the profile menu.

## Tech

Express + `node:sqlite` backend (`server/`), React 18 + Vite + Tailwind CSS frontend (`client/`), cookie-based JWT sessions, bcrypt passwords, role-based access checks on every API route.
