import { useState } from 'react';
import { Clock, CalendarDays, Wallet, Users } from 'lucide-react';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { ErrorBox, Spinner } from '../components/ui.jsx';

function Shell({ children }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-gradient-to-br from-brand-700 via-brand-800 to-slate-900 p-12 text-white lg:flex">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/15 font-bold">HR</div>
          <span className="text-lg font-semibold">TeamHR</span>
        </div>
        <div>
          <h1 className="text-4xl font-semibold leading-tight">Everything your team needs,<br />from hire to retire.</h1>
          <div className="mt-10 grid grid-cols-2 gap-4 text-sm text-brand-100">
            {[[Clock, 'Attendance & shifts'], [CalendarDays, 'Leave & holidays'], [Wallet, 'Payroll & payslips'], [Users, 'People & performance']].map(([I, t]) => (
              <div key={t} className="flex items-center gap-2.5"><div className="rounded-lg bg-white/10 p-2"><I size={16} /></div>{t}</div>
            ))}
          </div>
        </div>
        <p className="text-xs text-brand-200">Self-hosted. Your data stays on your server.</p>
      </div>
      <div className="flex items-center justify-center p-6">{children}</div>
    </div>
  );
}

export function Login() {
  const { refresh } = useAuth();
  const [v, setV] = useState({ email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setError(null);
    try { await api.post('/auth/login', v); await refresh(); } catch (err) { setError(err); } finally { setBusy(false); }
  };
  return (
    <Shell>
      <form onSubmit={submit} className="w-full max-w-sm space-y-5">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">Sign in</h2>
          <p className="mt-1 text-sm text-slate-500">Use the email your HR team registered for you.</p>
        </div>
        <ErrorBox error={error} />
        <div><label className="label" htmlFor="email">Work email</label><input id="email" className="input" type="email" autoComplete="email" required value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} /></div>
        <div><label className="label" htmlFor="password">Password</label><input id="password" className="input" type="password" autoComplete="current-password" required value={v.password} onChange={(e) => setV({ ...v, password: e.target.value })} /></div>
        <button className="btn-primary w-full py-2.5" disabled={busy}>{busy && <Spinner className="!text-white" />}Sign in</button>
        <p className="text-center text-xs text-slate-400">Forgot your password? Ask HR to reset it from your profile.</p>
      </form>
    </Shell>
  );
}

export function Setup() {
  const { refresh } = useAuth();
  const [v, setV] = useState({ company_name: '', first_name: '', last_name: '', email: '', password: '', demo: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const set = (k) => (e) => setV({ ...v, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setError(null);
    try { await api.post('/auth/setup', v); await refresh(); } catch (err) { setError(err); } finally { setBusy(false); }
  };
  return (
    <Shell>
      <form onSubmit={submit} className="w-full max-w-md space-y-4">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">Set up your workspace</h2>
          <p className="mt-1 text-sm text-slate-500">Create the company and the first admin account. You can invite everyone else afterwards.</p>
        </div>
        <ErrorBox error={error} />
        <div><label className="label">Company name</label><input className="input" required value={v.company_name} onChange={set('company_name')} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">First name</label><input className="input" required value={v.first_name} onChange={set('first_name')} /></div>
          <div><label className="label">Last name</label><input className="input" value={v.last_name} onChange={set('last_name')} /></div>
        </div>
        <div><label className="label">Work email</label><input className="input" type="email" required value={v.email} onChange={set('email')} /></div>
        <div><label className="label">Password</label><input className="input" type="password" required minLength={8} value={v.password} onChange={set('password')} /><p className="mt-1 text-xs text-slate-400">At least 8 characters</p></div>
        <label className="flex items-start gap-2.5 rounded-lg border border-slate-200 p-3 text-sm">
          <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600" checked={v.demo} onChange={set('demo')} />
          <span><span className="font-medium text-slate-800">Load sample data</span><br /><span className="text-xs text-slate-500">Adds 14 fictional employees, attendance, leave, payroll and more so you can explore. They share your password. Leave unchecked for a clean start.</span></span>
        </label>
        <button className="btn-primary w-full py-2.5" disabled={busy}>{busy && <Spinner className="!text-white" />}Create workspace</button>
      </form>
    </Shell>
  );
}
