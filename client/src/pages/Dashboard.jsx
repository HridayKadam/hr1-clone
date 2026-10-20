import { Link } from 'react-router-dom';
import dayjs from 'dayjs';
import { Inbox, Users, UserCheck, Plane, LifeBuoy, Briefcase, Cake, PartyPopper, CalendarHeart, Megaphone, Pin, Award, UserPlus } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { useApi } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { fmtDate, ago } from '../lib/format.js';
import { Avatar, Card, Loading, StatCard, Badge, Empty } from '../components/ui.jsx';
import ClockWidget from '../components/ClockWidget.jsx';

const COLORS = ['#3366ff', '#10b981', '#f59e0b', '#f43f5e', '#8b5cf6', '#0ea5e9', '#14b8a6', '#d946ef'];

export function Dashboard() {
  const { user } = useAuth();
  const { data, reload } = useApi('/dashboard');
  const greet = dayjs().hour() < 12 ? 'Good morning' : dayjs().hour() < 17 ? 'Good afternoon' : 'Good evening';
  if (!data) return <Loading />;
  const mgr = user.is_hr || user.role === 'manager' || user.has_reports;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">{greet}, {user.first_name} 👋</h1>
        <p className="text-sm text-slate-500">Here's what's happening at work today.</p>
      </div>

      {data.hr && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
          <StatCard label="Headcount" value={data.hr.headcount} icon={Users} to="/people" />
          <StatCard label="Present today" value={data.hr.present_today} icon={UserCheck} tone="green" to="/admin/attendance" />
          <StatCard label="On leave" value={data.hr.on_leave_today} icon={Plane} tone="violet" to="/admin/leave" />
          <StatCard label="Approvals" value={data.pending_approvals} icon={Inbox} tone="amber" to="/inbox" />
          <StatCard label="Open tickets" value={data.hr.open_tickets} icon={LifeBuoy} tone="rose" to="/helpdesk" />
          <StatCard label="Open jobs" value={data.hr.open_jobs} icon={Briefcase} tone="sky" to="/recruitment" />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6">
          <ClockWidget onChange={reload} />
          <Card title="Leave balance" action={<Link to="/me/leave" className="text-xs font-medium text-brand-600 hover:underline">Apply leave</Link>}>
            <div className="grid grid-cols-2 gap-3">
              {data.leave_balances.map((b) => (
                <div key={b.leave_type_id} className="rounded-lg border border-slate-100 p-3">
                  <div className="flex items-center gap-1.5 text-xs text-slate-500"><span className="h-2 w-2 rounded-full" style={{ background: b.color }} />{b.name}</div>
                  <div className="mt-1 text-lg font-semibold">{b.available}<span className="text-xs font-normal text-slate-400"> / {b.allocated}</span></div>
                </div>
              ))}
            </div>
          </Card>
          <Card title="This month">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div><div className="text-lg font-semibold text-emerald-600">{data.month.present}</div><div className="text-xs text-slate-500">Present</div></div>
              <div><div className="text-lg font-semibold text-rose-600">{data.month.absent}</div><div className="text-xs text-slate-500">Absent</div></div>
              <div><div className="text-lg font-semibold text-amber-600">{data.month.late}</div><div className="text-xs text-slate-500">Late</div></div>
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          {mgr && !data.hr && data.pending_approvals > 0 && (
            <Link to="/inbox" className="card flex items-center gap-3 border-amber-200 bg-amber-50 p-4">
              <Inbox className="text-amber-600" size={20} />
              <div className="text-sm"><span className="font-semibold">{data.pending_approvals} request{data.pending_approvals > 1 ? 's' : ''}</span> waiting for your approval</div>
            </Link>
          )}
          <Card title="Announcements" action={<Link to="/engage" className="text-xs font-medium text-brand-600 hover:underline">View all</Link>} bodyClass="divide-y divide-slate-100">
            {!data.announcements.length ? <Empty icon={Megaphone} title="No announcements" /> : data.announcements.map((a) => (
              <div key={a.id} className="px-5 py-3.5">
                <div className="flex items-center gap-1.5 text-sm font-medium text-slate-800">{a.pinned ? <Pin size={13} className="text-brand-500" /> : null}{a.title}</div>
                {a.body && <p className="mt-1 line-clamp-2 text-sm text-slate-500">{a.body}</p>}
                <div className="mt-1 text-xs text-slate-400">{a.author} · {ago(a.created_at)}</div>
              </div>
            ))}
          </Card>
          <Card title="Who's out today" bodyClass="p-4">
            {!data.out_today.length ? <p className="py-3 text-center text-sm text-slate-400">Everyone's in today</p> : (
              <div className="space-y-2.5">
                {data.out_today.map((o) => (
                  <Link key={o.id} to={`/people/${o.id}`} className="flex items-center gap-3">
                    <Avatar name={o.name} size="sm" /><span className="flex-1 text-sm">{o.name}</span><Badge color={o.color}>{o.code}{o.half_day ? ' · ½' : ''}</Badge>
                  </Link>
                ))}
              </div>
            )}
          </Card>
          {data.kudos.length > 0 && (
            <Card title="Recent kudos" action={<Link to="/engage?tab=kudos" className="text-xs font-medium text-brand-600 hover:underline">Give kudos</Link>} bodyClass="divide-y divide-slate-100">
              {data.kudos.slice(0, 3).map((k) => (
                <div key={k.id} className="flex gap-3 px-5 py-3">
                  <Award size={18} className="mt-0.5 shrink-0 text-amber-500" />
                  <div className="text-sm"><span className="font-medium">{k.from_name}</span> → <span className="font-medium">{k.to_name}</span> <Badge className="ml-1" color="#d97706">{k.badge}</Badge><p className="mt-0.5 text-slate-500">{k.message}</p></div>
                </div>
              ))}
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card title="Celebrations" bodyClass="p-4 space-y-4">
            {!data.birthdays.length && !data.anniversaries.length && <p className="py-2 text-center text-sm text-slate-400">No celebrations in the next 30 days</p>}
            {data.birthdays.map((b) => (
              <Link key={`b${b.id}`} to={`/people/${b.id}`} className="flex items-center gap-3">
                <Avatar name={b.name} size="sm" />
                <div className="flex-1 text-sm"><div className="font-medium">{b.name}</div><div className="text-xs text-slate-500">Birthday · {dayjs(`2000-${b.md}`).format('D MMM')}</div></div>
                <Cake size={18} className="text-pink-500" />
              </Link>
            ))}
            {data.anniversaries.map((b) => (
              <Link key={`a${b.id}`} to={`/people/${b.id}`} className="flex items-center gap-3">
                <Avatar name={b.name} size="sm" />
                <div className="flex-1 text-sm"><div className="font-medium">{b.name}</div><div className="text-xs text-slate-500">{b.years} year{b.years > 1 ? 's' : ''} at work · {dayjs(`2000-${b.md}`).format('D MMM')}</div></div>
                <PartyPopper size={18} className="text-violet-500" />
              </Link>
            ))}
          </Card>
          <Card title="Upcoming holidays" bodyClass="p-4 space-y-3">
            {!data.holidays.length ? <p className="text-center text-sm text-slate-400">No holidays configured</p> : data.holidays.map((h) => (
              <div key={h.id} className="flex items-center gap-3">
                <div className="w-11 rounded-lg bg-fuchsia-50 py-1 text-center"><div className="text-[10px] font-semibold uppercase text-fuchsia-600">{dayjs(h.date).format('MMM')}</div><div className="text-sm font-semibold text-fuchsia-700">{dayjs(h.date).format('D')}</div></div>
                <div className="flex-1 text-sm"><div className="font-medium">{h.name}</div><div className="text-xs text-slate-500">{dayjs(h.date).format('dddd')}{h.optional ? ' · Optional' : ''}</div></div>
                <CalendarHeart size={16} className="text-fuchsia-400" />
              </div>
            ))}
          </Card>
          {data.new_joiners.length > 0 && (
            <Card title="New joiners" bodyClass="p-4 space-y-3">
              {data.new_joiners.map((n) => (
                <Link key={n.id} to={`/people/${n.id}`} className="flex items-center gap-3"><Avatar name={n.name} size="sm" /><div className="flex-1 text-sm"><div className="font-medium">{n.name}</div><div className="text-xs text-slate-500">Joined {fmtDate(n.doj)}</div></div><UserPlus size={16} className="text-emerald-500" /></Link>
              ))}
            </Card>
          )}
          {data.hr?.by_department?.length > 0 && (
            <Card title="Headcount by department">
              <div className="h-44"><ResponsiveContainer><PieChart><Pie data={data.hr.by_department} dataKey="value" nameKey="name" innerRadius={45} outerRadius={70} paddingAngle={2}>
                {data.hr.by_department.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer></div>
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">{data.hr.by_department.map((d, i) => <span key={d.name} className="flex items-center gap-1 text-xs text-slate-600"><span className="h-2 w-2 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />{d.name} ({d.value})</span>)}</div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
