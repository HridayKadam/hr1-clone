import dayjs from 'dayjs';

export const fmtDate = (d, f = 'D MMM YYYY') => (d ? dayjs(d).format(f) : '—');
export const fmtDateTime = (d) => (d ? dayjs(d.includes('T') || d.endsWith('Z') ? d : `${d.replace(' ', 'T')}Z`).format('D MMM YYYY, h:mm A') : '—');
export const fmtTime = (t) => (t ? dayjs(`2000-01-01T${t.length === 5 ? `${t}:00` : t}`).format('h:mm A') : '—');
export const fmtMonth = (m) => (m ? dayjs(`${m}-01`).format('MMMM YYYY') : '');
export const money = (n, opts = {}) => (n == null || n === '' ? '—' : `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: opts.decimals ?? 0 })}`);
export const mins = (m) => (!m ? '—' : `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`);
export const fullName = (e) => (e ? [e.first_name, e.last_name].filter(Boolean).join(' ') : '');
export const todayStr = () => dayjs().format('YYYY-MM-DD');
export const thisMonth = () => dayjs().format('YYYY-MM');
export const ago = (d) => {
  if (!d) return '';
  const t = dayjs(d.includes('T') || d.endsWith('Z') ? d : `${d.replace(' ', 'T')}Z`);
  const s = dayjs().diff(t, 'second');
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d ago`;
  return t.format('D MMM');
};

export const STATUS_STYLES = {
  pending: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  approved: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  paid: 'bg-sky-50 text-sky-700 ring-sky-600/20',
  rejected: 'bg-rose-50 text-rose-700 ring-rose-600/20',
  cancelled: 'bg-slate-100 text-slate-600 ring-slate-500/20',
  withdrawn: 'bg-slate-100 text-slate-600 ring-slate-500/20',
  closed: 'bg-slate-100 text-slate-600 ring-slate-500/20',
  completed: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  active: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  exited: 'bg-slate-100 text-slate-600 ring-slate-500/20',
  draft: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  finalized: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  open: 'bg-sky-50 text-sky-700 ring-sky-600/20',
  in_progress: 'bg-violet-50 text-violet-700 ring-violet-600/20',
  resolved: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  on_hold: 'bg-slate-100 text-slate-600 ring-slate-500/20',
  on_track: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  at_risk: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  behind: 'bg-rose-50 text-rose-700 ring-rose-600/20',
  self_pending: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  manager_pending: 'bg-violet-50 text-violet-700 ring-violet-600/20',
  available: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  assigned: 'bg-sky-50 text-sky-700 ring-sky-600/20',
  repair: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  retired: 'bg-slate-100 text-slate-600 ring-slate-500/20',
  present: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  absent: 'bg-rose-50 text-rose-700 ring-rose-600/20',
  leave: 'bg-indigo-50 text-indigo-700 ring-indigo-600/20',
  holiday: 'bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-600/20',
  weekoff: 'bg-slate-100 text-slate-500 ring-slate-500/20',
  half_day: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  short: 'bg-orange-50 text-orange-700 ring-orange-600/20',
  missing_out: 'bg-orange-50 text-orange-700 ring-orange-600/20',
  not_in: 'bg-slate-100 text-slate-600 ring-slate-500/20',
  half_leave: 'bg-indigo-50 text-indigo-700 ring-indigo-600/20',
};
export const STATUS_LABEL = {
  self_pending: 'Self review pending', manager_pending: 'Manager review pending', in_progress: 'In progress', on_track: 'On track',
  at_risk: 'At risk', half_day: 'Half day', short: 'Short hours', missing_out: 'No clock-out', not_in: 'Not in yet', weekoff: 'Week off',
  half_leave: 'Half-day leave', on_hold: 'On hold', na: '—', upcoming: '',
};
export const label = (s) => STATUS_LABEL[s] ?? (s ? s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ') : '');

export function downloadCSV(filename, rows, columns) {
  const cols = columns || Object.keys(rows[0] || {}).map((k) => ({ key: k, label: k }));
  const esc = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const csv = [cols.map((c) => esc(c.label)).join(','), ...rows.map((r) => cols.map((c) => esc(typeof c.csv === 'function' ? c.csv(r) : r[c.key])).join(','))].join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

/** Minimal CSV parser handling quotes; returns array of objects keyed by header row. */
export function parseCSV(text) {
  const rows = []; let row = []; let cur = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  const [head, ...body] = rows.filter((r) => r.some((x) => x.trim()));
  if (!head) return [];
  const keys = head.map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'));
  return body.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? '').trim()])));
}
