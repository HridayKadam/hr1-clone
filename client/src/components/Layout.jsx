import { useEffect, useRef, useState } from 'react';
import { NavLink, Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Inbox, Clock, CalendarDays, Wallet, Receipt, Timer, Target, LifeBuoy, Megaphone, Users, Network, UsersRound,
  Banknote, Briefcase, ClipboardCheck, Laptop, FileText, BarChart3, Settings, Bell, Search, LogOut, KeyRound, Menu, X, ChevronDown, FolderOpen, DoorOpen, CalendarCheck,
} from 'lucide-react';
import { useAuth } from '../lib/auth.jsx';
import { api, useApi } from '../lib/api.js';
import { ago } from '../lib/format.js';
import { Avatar, cx, FormModal, useToast } from './ui.jsx';

function nav(user) {
  const hr = user.is_hr; const mgr = hr || user.role === 'manager' || user.has_reports;
  return [
    { items: [
      { to: '/', label: 'Home', icon: LayoutDashboard, end: true },
      { to: '/inbox', label: 'Inbox', icon: Inbox, badge: 'inbox', show: mgr },
    ] },
    { title: 'Me', items: [
      { to: '/me/attendance', label: 'Attendance', icon: Clock },
      { to: '/me/leave', label: 'Leave', icon: CalendarDays },
      { to: '/me/payslips', label: 'Salary', icon: Wallet },
      { to: '/me/expenses', label: 'Expenses', icon: Receipt },
      { to: '/me/timesheet', label: 'Timesheet', icon: Timer },
      { to: '/me/performance', label: 'Performance', icon: Target },
      { to: '/me/documents', label: 'Documents', icon: FolderOpen },
      { to: '/helpdesk', label: 'Helpdesk', icon: LifeBuoy },
    ] },
    { title: 'Company', items: [
      { to: '/engage', label: 'Engage', icon: Megaphone },
      { to: '/people', label: 'People', icon: Users },
      { to: '/org-chart', label: 'Org chart', icon: Network },
      { to: '/team', label: 'My team', icon: UsersRound, show: mgr },
      { to: '/recruitment', label: 'Recruitment', icon: Briefcase, show: mgr },
    ] },
    { title: 'Admin', show: hr, items: [
      { to: '/admin/attendance', label: 'Attendance', icon: CalendarCheck },
      { to: '/admin/leave', label: 'Leave', icon: CalendarDays },
      { to: '/payroll', label: 'Payroll', icon: Banknote },
      { to: '/admin/expenses', label: 'Expenses', icon: Receipt },
      { to: '/admin/performance', label: 'Performance', icon: Target },
      { to: '/lifecycle', label: 'Onboarding & exit', icon: ClipboardCheck },
      { to: '/assets', label: 'Assets', icon: Laptop },
      { to: '/letters', label: 'Letters', icon: FileText },
      { to: '/reports', label: 'Reports', icon: BarChart3 },
      { to: '/settings', label: 'Settings', icon: Settings },
    ] },
  ];
}

function Sidebar({ onNavigate, inboxCount }) {
  const { user, company } = useAuth();
  return (
    <aside className="flex h-full w-64 flex-col bg-slate-900 text-slate-300">
      <Link to="/" onClick={onNavigate} className="flex items-center gap-2.5 px-5 py-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500 text-sm font-bold text-white">{company?.name?.[0] || 'H'}</div>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-white">{company?.name}</div>
          <div className="text-[11px] text-slate-400">TeamHR</div>
        </div>
      </Link>
      <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-6 pt-2">
        {nav(user).filter((g) => g.show !== false).map((g, i) => (
          <div key={i}>
            {g.title && <div className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{g.title}</div>}
            <div className="space-y-0.5">
              {g.items.filter((it) => it.show !== false).map((it) => (
                <NavLink key={it.to} to={it.to} end={it.end} onClick={onNavigate}
                  className={({ isActive }) => cx('flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition',
                    isActive ? 'bg-slate-800 font-medium text-white' : 'hover:bg-slate-800/60 hover:text-white')}>
                  <it.icon size={17} className="shrink-0" />
                  <span className="flex-1">{it.label}</span>
                  {it.badge === 'inbox' && inboxCount > 0 && <span className="rounded-full bg-brand-500 px-1.5 text-[11px] font-semibold text-white">{inboxCount}</span>}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  );
}

function GlobalSearch() {
  const [q, setQ] = useState('');
  const [res, setRes] = useState([]);
  const [open, setOpen] = useState(false);
  const nav_ = useNavigate();
  useEffect(() => {
    if (q.length < 2) { setRes([]); return undefined; }
    const t = setTimeout(() => api.get(`/search?q=${encodeURIComponent(q)}`).then(setRes).catch(() => {}), 200);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <div className="relative hidden w-full max-w-sm md:block">
      <Search size={15} className="absolute left-3 top-2.5 text-slate-400" />
      <input className="input pl-9" placeholder="Search people…" value={q} onChange={(e) => setQ(e.target.value)} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} />
      {open && res.length > 0 && (
        <div className="absolute left-0 right-0 top-11 z-40 rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          {res.map((r) => (
            <button key={r.id} className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-slate-50" onMouseDown={() => { nav_(`/people/${r.id}`); setQ(''); }}>
              <Avatar name={r.name} size="sm" />
              <div><div className="text-sm font-medium text-slate-800">{r.name}</div><div className="text-xs text-slate-500">{r.designation || r.email}</div></div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Notifications() {
  const { data, reload } = useApi('/notifications');
  const [open, setOpen] = useState(false);
  const ref = useRef();
  const nav_ = useNavigate();
  const loc = useLocation();
  useEffect(() => { const t = setInterval(reload, 60000); return () => clearInterval(t); }, [reload]);
  useEffect(() => { reload(); }, [loc.pathname]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const onDoc = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);
  const readAll = async () => { await api.post('/notifications/read'); reload(); };
  return (
    <div className="relative" ref={ref}>
      <button className="relative rounded-lg p-2 text-slate-500 hover:bg-slate-100" onClick={() => setOpen(!open)} aria-label="Notifications">
        <Bell size={19} />
        {data?.unread > 0 && <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold text-white">{data.unread}</span>}
      </button>
      {open && (
        <div className="absolute right-0 top-11 z-40 w-80 rounded-xl border border-slate-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
            <span className="text-sm font-semibold">Notifications</span>
            {data?.unread > 0 && <button className="text-xs font-medium text-brand-600 hover:underline" onClick={readAll}>Mark all read</button>}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {!data?.items?.length ? <p className="px-4 py-8 text-center text-sm text-slate-400">You're all caught up</p> : data.items.map((n) => (
              <button key={n.id} className={cx('block w-full border-b border-slate-50 px-4 py-2.5 text-left hover:bg-slate-50', !n.read && 'bg-brand-50/40')}
                onClick={async () => { await api.post('/notifications/read', { id: n.id }); setOpen(false); reload(); if (n.link) nav_(n.link); }}>
                <div className="text-sm text-slate-700">{n.title}</div>
                <div className="mt-0.5 text-xs text-slate-400">{ago(n.created_at)}</div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function UserMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [pw, setPw] = useState(false);
  const ref = useRef();
  const toast = useToast();
  useEffect(() => {
    const onDoc = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);
  const name = `${user.first_name} ${user.last_name || ''}`.trim();
  return (
    <div className="relative" ref={ref}>
      <button className="flex items-center gap-2 rounded-lg py-1 pl-1 pr-2 hover:bg-slate-100" onClick={() => setOpen(!open)}>
        <Avatar name={name} size="sm" />
        <div className="hidden text-left sm:block"><div className="text-sm font-medium leading-tight text-slate-800">{name}</div><div className="text-[11px] capitalize text-slate-500">{user.designation || user.role}</div></div>
        <ChevronDown size={14} className="text-slate-400" />
      </button>
      {open && (
        <div className="absolute right-0 top-12 z-40 w-52 rounded-xl border border-slate-200 bg-white py-1 shadow-xl">
          <Link to={`/people/${user.id}`} onClick={() => setOpen(false)} className="flex items-center gap-2 px-3.5 py-2 text-sm text-slate-700 hover:bg-slate-50"><Users size={15} />My profile</Link>
          <Link to="/me/assets" onClick={() => setOpen(false)} className="flex items-center gap-2 px-3.5 py-2 text-sm text-slate-700 hover:bg-slate-50"><Laptop size={15} />My assets</Link>
          <Link to="/me/exit" onClick={() => setOpen(false)} className="flex items-center gap-2 px-3.5 py-2 text-sm text-slate-700 hover:bg-slate-50"><DoorOpen size={15} />Resignation</Link>
          <button onClick={() => { setPw(true); setOpen(false); }} className="flex w-full items-center gap-2 px-3.5 py-2 text-sm text-slate-700 hover:bg-slate-50"><KeyRound size={15} />Change password</button>
          <button onClick={logout} className="flex w-full items-center gap-2 border-t border-slate-100 px-3.5 py-2 text-sm text-rose-600 hover:bg-rose-50"><LogOut size={15} />Sign out</button>
        </div>
      )}
      <FormModal open={pw} onClose={() => setPw(false)} title="Change password" submitLabel="Update password"
        fields={[{ name: 'current', label: 'Current password', type: 'password', required: true, col: 2 }, { name: 'next', label: 'New password', type: 'password', required: true, col: 2, hint: 'At least 8 characters' }]}
        onSubmit={async (v) => { await api.post('/auth/change-password', v); toast.success('Password updated'); return false; }} />
    </div>
  );
}

export default function Layout() {
  const [mobile, setMobile] = useState(false);
  const loc = useLocation();
  const { user } = useAuth();
  const mgr = user.is_hr || user.role === 'manager' || user.has_reports;
  const inbox = useApi(mgr ? '/approvals' : null);
  useEffect(() => { if (mgr) inbox.reload(); }, [loc.pathname]); // eslint-disable-line react-hooks/exhaustive-deps
  const count = inbox.data?.length || 0;
  return (
    <div className="flex h-screen overflow-hidden">
      <div className="no-print hidden lg:block"><Sidebar inboxCount={count} /></div>
      {mobile && (
        <div className="no-print fixed inset-0 z-50 flex lg:hidden">
          <div className="relative"><Sidebar onNavigate={() => setMobile(false)} inboxCount={count} /><button className="absolute right-2 top-4 text-slate-400" onClick={() => setMobile(false)}><X size={20} /></button></div>
          <div className="flex-1 bg-slate-900/40" onClick={() => setMobile(false)} />
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print flex h-16 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4 lg:px-6">
          <button className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:hidden" onClick={() => setMobile(true)}><Menu size={20} /></button>
          <GlobalSearch />
          <div className="flex-1" />
          <Notifications />
          <UserMenu />
        </header>
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-7xl px-4 py-6 lg:px-8"><Outlet /></div>
        </main>
      </div>
    </div>
  );
}
