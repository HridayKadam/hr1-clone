import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { get } from './db.js';
import { requireAuth } from './auth.js';
import { HttpError } from './util.js';
import authRoutes from './routes/auth.js';
import employees from './routes/employees.js';
import masters from './routes/masters.js';
import attendance from './routes/attendance.js';
import leave from './routes/leave.js';
import approvals from './routes/approvals.js';
import payroll from './routes/payroll.js';
import work from './routes/work.js';
import performance from './routes/performance.js';
import recruitment from './routes/recruitment.js';
import lifecycle from './routes/lifecycle.js';
import helpdesk from './routes/helpdesk.js';
import assets from './routes/assets.js';
import engage from './routes/engage.js';
import letters from './routes/letters.js';
import home from './routes/home.js';
import { bootstrap } from './seed.js';

bootstrap();

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'same-origin');
  next();
});

app.get('/api/health', (_req, res) => res.json({ ok: true, employees: get('SELECT COUNT(*) n FROM employees').n }));
app.use('/api/auth', authRoutes);
const api = express.Router();
api.use(requireAuth);
api.use('/employees', employees);
api.use('/masters', masters);
api.use('/attendance', attendance);
api.use('/leave', leave);
api.use('/approvals', approvals);
api.use('/payroll', payroll);
api.use('/work', work);
api.use('/performance', performance);
api.use('/recruitment', recruitment);
api.use('/lifecycle', lifecycle);
api.use('/helpdesk', helpdesk);
api.use('/assets', assets);
api.use('/engage', engage);
api.use('/letters', letters);
api.use('/', home);
app.use('/api', api);
app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Not found')));

// Serve the built SPA in production.
const dist = fileURLToPath(new URL('../client/dist', import.meta.url));
if (fs.existsSync(dist)) {
  app.use(express.static(dist, { index: false, maxAge: '1h' }));
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  const status = err.status || (err.code === 'LIMIT_FILE_SIZE' ? 400 : err.message === 'Unsupported file type' ? 400 : 500);
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'Something went wrong on the server' : err.message });
});

const port = Number(process.env.PORT || 4000);
app.listen(port, () => console.log(`HR server running on http://localhost:${port}`));
