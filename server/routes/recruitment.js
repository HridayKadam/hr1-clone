import { Router } from 'express';
import fs from 'node:fs';
import { all, get, run, insert, update } from '../db.js';
import { requireManager } from '../auth.js';
import { upload, filePath } from '../upload.js';
import { h, bad, notFound } from '../util.js';

const r = Router();
r.use(requireManager);

export const STAGES = ['applied', 'screening', 'interview', 'offer', 'hired', 'rejected'];
const JOB_FIELDS = ['title', 'department_id', 'location', 'employment_type', 'openings', 'experience', 'salary_range', 'description', 'status', 'hiring_manager_id'];
const CAND_FIELDS = ['job_id', 'name', 'email', 'phone', 'source', 'current_ctc', 'expected_ctc', 'notice_period', 'stage', 'rating', 'notes', 'interview_at'];

r.get('/jobs', h((_req, res) => {
  res.json(all(`SELECT j.*, d.name AS department, m.first_name || ' ' || COALESCE(m.last_name,'') AS hiring_manager,
    (SELECT COUNT(*) FROM candidates c WHERE c.job_id = j.id) AS candidates,
    (SELECT COUNT(*) FROM candidates c WHERE c.job_id = j.id AND c.stage = 'hired') AS hired
    FROM jobs j LEFT JOIN departments d ON d.id = j.department_id LEFT JOIN employees m ON m.id = j.hiring_manager_id ORDER BY j.status = 'open' DESC, j.id DESC`));
}));
r.post('/jobs', h((req, res) => {
  if (!req.body.title) throw bad('Job title is required');
  res.json({ id: insert('jobs', req.body, JOB_FIELDS) });
}));
r.put('/jobs/:id', h((req, res) => { update('jobs', req.params.id, req.body, JOB_FIELDS); res.json({ ok: true }); }));
r.delete('/jobs/:id', h((req, res) => { run('DELETE FROM jobs WHERE id = ?', req.params.id); res.json({ ok: true }); }));

r.get('/candidates', h((req, res) => {
  const p = []; let w = '1=1';
  if (req.query.job_id) { w = 'c.job_id = ?'; p.push(req.query.job_id); }
  res.json(all(`SELECT c.*, j.title AS job_title FROM candidates c LEFT JOIN jobs j ON j.id = c.job_id WHERE ${w} ORDER BY c.id DESC`, ...p));
}));
r.post('/candidates', upload.single('resume'), h((req, res) => {
  if (!req.body.name || !req.body.job_id) throw bad('Candidate name and job are required');
  res.json({ id: insert('candidates', { ...req.body, resume: req.file?.filename }, [...CAND_FIELDS, 'resume']) });
}));
r.put('/candidates/:id', h((req, res) => {
  if (req.body.stage && !STAGES.includes(req.body.stage)) throw bad('Invalid stage');
  update('candidates', req.params.id, req.body, CAND_FIELDS);
  res.json({ ok: true });
}));
r.get('/candidates/:id/resume', h((req, res) => {
  const c = get('SELECT * FROM candidates WHERE id = ?', req.params.id);
  if (!c?.resume) throw notFound('No resume uploaded');
  res.download(filePath(c.resume), `${c.name.replace(/[^\w ]/g, '')} resume${c.resume.slice(c.resume.lastIndexOf('.'))}`);
}));
r.delete('/candidates/:id', h((req, res) => {
  const c = get('SELECT * FROM candidates WHERE id = ?', req.params.id);
  if (c?.resume) fs.rm(filePath(c.resume), { force: true }, () => {});
  run('DELETE FROM candidates WHERE id = ?', req.params.id);
  res.json({ ok: true });
}));

export default r;
