import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { X, Loader2, Search, Download, ChevronUp, ChevronDown, Inbox, CheckCircle2, AlertCircle, Info } from 'lucide-react';
import { STATUS_STYLES, label, downloadCSV } from '../lib/format.js';
import { api } from '../lib/api.js';

export const cx = (...c) => c.filter(Boolean).join(' ');

export function Badge({ status, children, color, className }) {
  const style = color ? undefined : STATUS_STYLES[status] || 'bg-slate-100 text-slate-700 ring-slate-500/20';
  return (
    <span className={cx('inline-flex items-center whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset', style, className)}
      style={color ? { backgroundColor: `${color}1a`, color, boxShadow: `inset 0 0 0 1px ${color}33` } : undefined}>
      {children ?? label(status)}
    </span>
  );
}

const AVATAR_COLORS = ['bg-indigo-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500', 'bg-sky-500', 'bg-violet-500', 'bg-teal-500', 'bg-fuchsia-500'];
export function Avatar({ name = '', size = 'md', className }) {
  const initials = name.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || '?';
  const color = AVATAR_COLORS[[...name].reduce((s, c) => s + c.charCodeAt(0), 0) % AVATAR_COLORS.length];
  const sz = { xs: 'h-6 w-6 text-[10px]', sm: 'h-8 w-8 text-xs', md: 'h-10 w-10 text-sm', lg: 'h-16 w-16 text-xl', xl: 'h-20 w-20 text-2xl' }[size];
  return <div className={cx('flex shrink-0 items-center justify-center rounded-full font-semibold text-white', color, sz, className)}>{initials}</div>;
}

export function Card({ title, subtitle, action, children, className, bodyClass = 'p-5' }) {
  return (
    <div className={cx('card', className)}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3.5">
          <div className="min-w-0">
            {typeof title === 'string' ? <h3 className="text-sm font-semibold text-slate-900">{title}</h3> : title}
            {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      <div className={bodyClass}>{children}</div>
    </div>
  );
}

export function PageHeader({ title, subtitle, actions, back }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        {back && <Link to={back.to} className="mb-1 inline-block text-xs font-medium text-brand-600 hover:underline">← {back.label}</Link>}
        <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({ label: l, value, icon: Icon, tone = 'brand', hint, to }) {
  const tones = { brand: 'bg-brand-50 text-brand-600', green: 'bg-emerald-50 text-emerald-600', amber: 'bg-amber-50 text-amber-600',
    rose: 'bg-rose-50 text-rose-600', violet: 'bg-violet-50 text-violet-600', sky: 'bg-sky-50 text-sky-600', slate: 'bg-slate-100 text-slate-600' };
  const body = (
    <div className="card flex items-center gap-4 p-4 transition hover:shadow-md">
      {Icon && <div className={cx('rounded-lg p-2.5', tones[tone])}><Icon size={20} /></div>}
      <div className="min-w-0">
        <div className="text-xs font-medium text-slate-500">{l}</div>
        <div className="text-xl font-semibold text-slate-900">{value}</div>
        {hint && <div className="truncate text-xs text-slate-400">{hint}</div>}
      </div>
    </div>
  );
  return to ? <Link to={to}>{body}</Link> : body;
}

export const Spinner = ({ className }) => <Loader2 className={cx('animate-spin text-brand-600', className)} size={20} />;
export const Loading = () => <div className="flex justify-center py-16"><Spinner /></div>;
export function Empty({ title = 'Nothing here yet', hint, icon: Icon = Inbox, action }) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
      <div className="mb-3 rounded-full bg-slate-100 p-3 text-slate-400"><Icon size={22} /></div>
      <p className="text-sm font-medium text-slate-700">{title}</p>
      {hint && <p className="mt-1 max-w-sm text-xs text-slate-500">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
export const ErrorBox = ({ error }) => error ? <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error.message || String(error)}</div> : null;

export function Tabs({ tabs, value, onChange, className }) {
  return (
    <div className={cx('mb-5 flex gap-1 overflow-x-auto border-b border-slate-200', className)}>
      {tabs.map((t) => {
        const key = t.key ?? t; const text = t.label ?? t;
        return (
          <button key={key} onClick={() => onChange(key)}
            className={cx('-mb-px whitespace-nowrap border-b-2 px-3.5 py-2.5 text-sm font-medium transition',
              value === key ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-800')}>
            {text}{t.count != null && <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 text-xs text-slate-600">{t.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function Modal({ open, onClose, title, children, footer, size = 'md' }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  const w = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl' }[size];
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 pt-[6vh] backdrop-blur-[1px]" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={cx('w-full rounded-xl bg-white shadow-xl', w)}>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"><X size={18} /></button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

// ----- Employees & lookup caches -----
const cache = new Map();
export function useCached(path) {
  const [data, setData] = useState(cache.get(path) || null);
  useEffect(() => {
    let alive = true;
    if (!cache.has(path)) api.get(path).then((d) => { cache.set(path, d); if (alive) setData(d); }).catch(() => {});
    else setData(cache.get(path));
    return () => { alive = false; };
  }, [path]);
  return data || [];
}
export const invalidate = (prefix) => { for (const k of [...cache.keys()]) if (k.startsWith(prefix)) cache.delete(k); };
export const useEmployees = () => useCached('/employees');
export const useMaster = (t) => useCached(`/masters/${t}`);

// ----- Forms -----
export function Field({ field, value, onChange, values }) {
  const f = field;
  const common = { id: f.name, name: f.name, required: f.required, placeholder: f.placeholder, disabled: f.disabled, className: 'input' };
  const employees = useEmployees();
  let input;
  switch (f.type) {
    case 'textarea':
      input = <textarea {...common} rows={f.rows || 3} value={value ?? ''} onChange={(e) => onChange(e.target.value)} />; break;
    case 'select': {
      const opts = typeof f.options === 'function' ? f.options(values) : f.options || [];
      input = (
        <select {...common} value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
          {!f.noEmpty && <option value="">{f.placeholder || 'Select…'}</option>}
          {opts.map((o) => { const v = typeof o === 'object' ? o.value : o; const l = typeof o === 'object' ? o.label : o; return <option key={v} value={v}>{l}</option>; })}
        </select>
      ); break;
    }
    case 'employee':
      input = (
        <select {...common} value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
          <option value="">{f.placeholder || 'Select employee…'}</option>
          {employees.filter((e) => !f.exclude || !f.exclude.includes(e.id)).map((e) => <option key={e.id} value={e.id}>{e.first_name} {e.last_name} {e.emp_code ? `(${e.emp_code})` : ''}</option>)}
        </select>
      ); break;
    case 'checkbox':
      return (
        <label className={cx('flex items-center gap-2 text-sm text-slate-700', f.col === 2 && 'sm:col-span-2')}>
          <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500" checked={!!Number(value) || value === true} onChange={(e) => onChange(e.target.checked ? 1 : 0)} />
          {f.label}
        </label>
      );
    case 'file':
      input = <input type="file" name={f.name} accept={f.accept} className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-brand-700 hover:file:bg-brand-100" onChange={(e) => onChange(e.target.files[0])} />; break;
    default:
      input = <input {...common} type={f.type || 'text'} step={f.step} min={f.min} max={f.max} value={value ?? ''} onChange={(e) => onChange(e.target.value)} />;
  }
  return (
    <div className={cx(f.col === 2 && 'sm:col-span-2')}>
      {f.label && <label htmlFor={f.name} className="label">{f.label}{f.required && <span className="text-rose-500"> *</span>}</label>}
      {input}
      {f.hint && <p className="mt-1 text-xs text-slate-400">{typeof f.hint === 'function' ? f.hint(values) : f.hint}</p>}
    </div>
  );
}

/** Schema-driven form. `fields` items: { name, label, type, options, required, col, hint, show(values) } */
export function Form({ fields, values, setValues }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {fields.filter((f) => !f.show || f.show(values)).map((f) => (
        f.section
          ? <h4 key={f.section} className="pt-2 text-xs font-semibold uppercase tracking-wide text-slate-400 sm:col-span-2">{f.section}</h4>
          : <Field key={f.name} field={f} value={values[f.name]} values={values} onChange={(v) => setValues((s) => ({ ...s, [f.name]: v, ...(f.onSet ? f.onSet(v, s) : {}) }))} />
      ))}
    </div>
  );
}

export function FormModal({ open, onClose, title, fields, initial, onSubmit, submitLabel = 'Save', size, children, onChange }) {
  const [values, setValues] = useState(initial || {});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const toast = useToast();
  useEffect(() => { if (open) { setValues(initial || {}); setError(null); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { onChange?.(values); }, [values]); // eslint-disable-line react-hooks/exhaustive-deps
  const submit = async (e) => {
    e?.preventDefault();
    setBusy(true); setError(null);
    try {
      const msg = await onSubmit(values);
      onClose();
      if (msg !== false) toast.success(typeof msg === 'string' ? msg : 'Saved');
    } catch (err) { setError(err); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title={title} size={size}
      footer={<><button className="btn-secondary" onClick={onClose} type="button">Cancel</button><button className="btn-primary" disabled={busy} onClick={submit}>{busy && <Spinner className="!text-white" />}{submitLabel}</button></>}>
      <form onSubmit={submit} className="space-y-4">
        <ErrorBox error={error} />
        <Form fields={fields} values={values} setValues={setValues} />
        {typeof children === 'function' ? children(values) : children}
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}

// ----- Table -----
export function Table({ columns, rows, empty, onRowClick, searchable, searchKeys, exportName, toolbar, pageSize = 50, rowClass, dense }) {
  const [q, setQ] = useState('');
  const [sort, setSort] = useState(null);
  const [page, setPage] = useState(0);
  const list = useMemo(() => {
    let r = rows || [];
    if (q) {
      const s = q.toLowerCase();
      const keys = searchKeys || columns.map((c) => c.key);
      r = r.filter((x) => keys.some((k) => String(typeof k === 'function' ? k(x) : x[k] ?? '').toLowerCase().includes(s)));
    }
    if (sort) {
      const col = columns.find((c) => c.key === sort.key);
      const val = col?.sortValue || ((x) => x[sort.key]);
      r = [...r].sort((a, b) => { const A = val(a); const B = val(b); return (A > B ? 1 : A < B ? -1 : 0) * (sort.dir === 'asc' ? 1 : -1); });
    }
    return r;
  }, [rows, q, sort, columns, searchKeys]);
  useEffect(() => setPage(0), [q, rows]);
  const pages = Math.ceil(list.length / pageSize);
  const shown = list.slice(page * pageSize, (page + 1) * pageSize);
  return (
    <div>
      {(searchable || exportName || toolbar) && (
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3">
          {searchable && (
            <div className="relative w-full max-w-xs">
              <Search size={15} className="absolute left-2.5 top-2.5 text-slate-400" />
              <input className="input pl-8" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
          )}
          <div className="flex flex-1 flex-wrap items-center gap-2">{toolbar}</div>
          {exportName && <button className="btn-secondary btn-sm" onClick={() => downloadCSV(`${exportName}.csv`, list, columns.filter((c) => c.label && c.csv !== false).map((c) => ({ key: c.key, label: c.label, csv: c.csv })))}><Download size={14} />Export</button>}
        </div>
      )}
      {!rows ? <Loading /> : !list.length ? (empty || <Empty />) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100">
            <thead className="bg-slate-50/60">
              <tr>
                {columns.map((c) => (
                  <th key={c.key} className={cx('th', c.className, c.sortable !== false && c.label && 'cursor-pointer select-none hover:text-slate-700')}
                    onClick={() => c.sortable !== false && c.label && setSort((s) => (s?.key === c.key ? { key: c.key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key: c.key, dir: 'asc' }))}>
                    <span className="inline-flex items-center gap-1">{c.label}{sort?.key === c.key && (sort.dir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {shown.map((r, i) => (
                <tr key={r.id ?? i} onClick={onRowClick ? () => onRowClick(r) : undefined} className={cx(onRowClick && 'cursor-pointer hover:bg-slate-50', rowClass?.(r))}>
                  {columns.map((c) => <td key={c.key} className={cx('td', dense && '!py-2', c.className)}>{c.render ? c.render(r) : r[c.key] ?? '—'}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {pages > 1 && (
        <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2.5 text-xs text-slate-500">
          <span>{page * pageSize + 1}–{Math.min(list.length, (page + 1) * pageSize)} of {list.length}</span>
          <div className="flex gap-1">
            <button className="btn-secondary btn-sm" disabled={!page} onClick={() => setPage(page - 1)}>Previous</button>
            <button className="btn-secondary btn-sm" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>Next</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ----- Toasts & confirm -----
const ToastCtx = createContext(null);
export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const [confirmState, setConfirm] = useState(null);
  const id = useRef(0);
  const push = useCallback((type, msg) => {
    const n = ++id.current;
    setItems((s) => [...s, { n, type, msg }]);
    setTimeout(() => setItems((s) => s.filter((x) => x.n !== n)), 4000);
  }, []);
  const value = useMemo(() => ({
    success: (m) => push('success', m), error: (m) => push('error', m?.message || m), info: (m) => push('info', m),
    confirm: (opts) => new Promise((resolve) => setConfirm({ ...(typeof opts === 'string' ? { message: opts } : opts), resolve })),
  }), [push]);
  const close = (v) => { confirmState?.resolve(v); setConfirm(null); };
  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div className="no-print fixed bottom-4 right-4 z-[60] flex w-80 flex-col gap-2">
        {items.map((t) => (
          <div key={t.n} className="flex items-start gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-3 text-sm shadow-lg">
            {t.type === 'success' ? <CheckCircle2 size={18} className="shrink-0 text-emerald-500" /> : t.type === 'error' ? <AlertCircle size={18} className="shrink-0 text-rose-500" /> : <Info size={18} className="shrink-0 text-brand-500" />}
            <span className="text-slate-700">{t.msg}</span>
          </div>
        ))}
      </div>
      <Modal open={!!confirmState} onClose={() => close(false)} title={confirmState?.title || 'Are you sure?'} size="sm"
        footer={<><button className="btn-secondary" onClick={() => close(false)}>Cancel</button><button className={confirmState?.danger === false ? 'btn-primary' : 'btn-danger'} onClick={() => close(true)}>{confirmState?.confirmLabel || 'Confirm'}</button></>}>
        <p className="text-sm text-slate-600">{confirmState?.message}</p>
      </Modal>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

/** Run an async action with toast feedback. */
export function useAction() {
  const toast = useToast();
  return useCallback(async (fn, success) => {
    try { const r = await fn(); if (success) toast.success(success); return r; } catch (e) { toast.error(e); return undefined; }
  }, [toast]);
}

export function ProgressBar({ value, className, tone }) {
  const v = Math.max(0, Math.min(100, Number(value) || 0));
  const color = tone || (v >= 75 ? 'bg-emerald-500' : v >= 40 ? 'bg-brand-500' : 'bg-amber-500');
  return <div className={cx('h-2 w-full overflow-hidden rounded-full bg-slate-100', className)}><div className={cx('h-full rounded-full transition-all', color)} style={{ width: `${v}%` }} /></div>;
}

export function Stars({ value, onChange, size = 18 }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" disabled={!onChange} onClick={() => onChange?.(n)}
          className={cx('leading-none', n <= (value || 0) ? 'text-amber-400' : 'text-slate-300', onChange && 'hover:scale-110')} style={{ fontSize: size }}>★</button>
      ))}
    </div>
  );
}
