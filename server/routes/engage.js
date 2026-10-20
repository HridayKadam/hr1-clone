import { Router } from 'express';
import { all, get, run, insert, update, notify } from '../db.js';
import { requireHR } from '../auth.js';
import { h, bad, notFound, today, isHR } from '../util.js';

/** Announcements, polls and peer kudos. */
const r = Router();

r.get('/announcements', h((_req, res) => {
  res.json(all(`SELECT a.*, e.first_name || ' ' || COALESCE(e.last_name,'') AS author FROM announcements a LEFT JOIN employees e ON e.id = a.author_id
    ORDER BY a.pinned DESC, a.id DESC LIMIT 50`));
}));
r.post('/announcements', requireHR, h((req, res) => {
  if (!req.body.title) throw bad('Title is required');
  const id = insert('announcements', { title: req.body.title, body: req.body.body, pinned: req.body.pinned ? 1 : 0, author_id: req.user.id });
  for (const e of all(`SELECT id FROM employees WHERE status = 'active' AND id != ?`, req.user.id)) notify(e.id, `📢 ${req.body.title}`, '/engage');
  res.json({ id });
}));
r.put('/announcements/:id', requireHR, h((req, res) => { update('announcements', req.params.id, req.body, ['title', 'body', 'pinned']); res.json({ ok: true }); }));
r.delete('/announcements/:id', requireHR, h((req, res) => { run('DELETE FROM announcements WHERE id = ?', req.params.id); res.json({ ok: true }); }));

r.get('/polls', h((req, res) => {
  const polls = all('SELECT * FROM polls ORDER BY id DESC LIMIT 30');
  res.json(polls.map((p) => {
    const options = JSON.parse(p.options);
    const votes = all('SELECT option_index, COUNT(*) n FROM poll_votes WHERE poll_id = ? GROUP BY option_index', p.id);
    const mine = get('SELECT option_index FROM poll_votes WHERE poll_id = ? AND employee_id = ?', p.id, req.user.id);
    const voters = p.anonymous ? null : all(`SELECT v.option_index, e.first_name || ' ' || COALESCE(e.last_name,'') AS name FROM poll_votes v
      JOIN employees e ON e.id = v.employee_id WHERE v.poll_id = ?`, p.id);
    return { ...p, options, counts: options.map((_, i) => votes.find((v) => v.option_index === i)?.n || 0), my_vote: mine?.option_index ?? null,
      closed: p.closes_on ? p.closes_on < today() : false, voters };
  }));
}));
r.post('/polls', requireHR, h((req, res) => {
  const options = (req.body.options || []).map((o) => String(o).trim()).filter(Boolean);
  if (!req.body.question || options.length < 2) throw bad('A question and at least two options are required');
  res.json({ id: insert('polls', { question: req.body.question, options, closes_on: req.body.closes_on, anonymous: req.body.anonymous === false ? 0 : 1, author_id: req.user.id }) });
}));
r.post('/polls/:id/vote', h((req, res) => {
  const p = get('SELECT * FROM polls WHERE id = ?', req.params.id);
  if (!p) throw notFound();
  if (p.closes_on && p.closes_on < today()) throw bad('This poll is closed');
  const idx = Number(req.body.option_index);
  if (!(idx >= 0 && idx < JSON.parse(p.options).length)) throw bad('Invalid option');
  run('INSERT OR REPLACE INTO poll_votes (poll_id, employee_id, option_index) VALUES (?,?,?)', p.id, req.user.id, idx);
  res.json({ ok: true });
}));
r.delete('/polls/:id', requireHR, h((req, res) => { run('DELETE FROM polls WHERE id = ?', req.params.id); res.json({ ok: true }); }));

r.get('/kudos', h((req, res) => {
  const w = req.query.employee_id ? 'WHERE k.to_id = ?' : '';
  res.json(all(`SELECT k.*, f.first_name || ' ' || COALESCE(f.last_name,'') AS from_name, t.first_name || ' ' || COALESCE(t.last_name,'') AS to_name
    FROM kudos k LEFT JOIN employees f ON f.id = k.from_id JOIN employees t ON t.id = k.to_id ${w} ORDER BY k.id DESC LIMIT 60`, ...(w ? [req.query.employee_id] : [])));
}));
r.post('/kudos', h((req, res) => {
  const to = Number(req.body.to_id);
  if (!to || !req.body.message) throw bad('Choose a colleague and write a message');
  if (to === req.user.id) throw bad('You cannot give kudos to yourself');
  const id = insert('kudos', { from_id: req.user.id, to_id: to, badge: req.body.badge || 'Thank You', message: req.body.message });
  notify(to, `${req.user.first_name} gave you a "${req.body.badge || 'Thank You'}" kudos 🎉`, '/engage');
  res.json({ id });
}));
r.delete('/kudos/:id', h((req, res) => {
  const k = get('SELECT * FROM kudos WHERE id = ?', req.params.id);
  if (k && (k.from_id === req.user.id || isHR(req.user))) run('DELETE FROM kudos WHERE id = ?', k.id);
  res.json({ ok: true });
}));

export default r;
