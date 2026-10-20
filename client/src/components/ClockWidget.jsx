import { useEffect, useState } from 'react';
import dayjs from 'dayjs';
import { LogIn, LogOut, MapPin } from 'lucide-react';
import { api, useApi } from '../lib/api.js';
import { fmtTime, mins } from '../lib/format.js';
import { Spinner, useToast, cx } from './ui.jsx';

const getPosition = () => new Promise((resolve) => {
  if (!navigator.geolocation) return resolve({});
  navigator.geolocation.getCurrentPosition((p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }), () => resolve({}), { timeout: 6000, maximumAge: 60000 });
});

export default function ClockWidget({ onChange }) {
  const { data, reload } = useApi('/attendance/today');
  const [now, setNow] = useState(dayjs());
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState('office');
  const toast = useToast();
  useEffect(() => { const t = setInterval(() => setNow(dayjs()), 1000); return () => clearInterval(t); }, []);
  const rec = data?.record;
  const clock = async (action) => {
    setBusy(true);
    try {
      const pos = await getPosition();
      await api.post('/attendance/clock', { action, work_from: mode, ...pos });
      toast.success(action === 'in' ? 'Clocked in. Have a great day!' : 'Clocked out. See you tomorrow!');
      reload(); onChange?.();
    } catch (e) { toast.error(e); } finally { setBusy(false); }
  };
  const worked = rec?.check_in && !rec?.check_out ? now.diff(dayjs(`${data.date}T${rec.check_in}`), 'minute') : null;
  return (
    <div className="card overflow-hidden">
      <div className="bg-gradient-to-br from-brand-600 to-brand-800 p-5 text-white">
        <div className="text-xs font-medium uppercase tracking-wide text-brand-100">{now.format('dddd, D MMMM')}</div>
        <div className="mt-1 text-3xl font-semibold tabular-nums">{now.format('h:mm:ss A')}</div>
        {data?.shift && <div className="mt-1 text-xs text-brand-100">Shift {fmtTime(data.shift.start_time)} – {fmtTime(data.shift.end_time)}</div>}
      </div>
      <div className="space-y-4 p-5">
        {!data ? <Spinner /> : (
          <>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div><div className="text-[11px] uppercase text-slate-400">In</div><div className="text-sm font-semibold">{fmtTime(rec?.check_in)}</div></div>
              <div><div className="text-[11px] uppercase text-slate-400">Out</div><div className="text-sm font-semibold">{fmtTime(rec?.check_out)}</div></div>
              <div><div className="text-[11px] uppercase text-slate-400">Worked</div><div className="text-sm font-semibold">{worked != null ? mins(worked) : rec?.check_out ? mins(dayjs(`${data.date}T${rec.check_out}`).diff(dayjs(`${data.date}T${rec.check_in}`), 'minute')) : '—'}</div></div>
            </div>
            {!rec?.check_in && (
              <div className="flex rounded-lg bg-slate-100 p-1 text-xs font-medium">
                {['office', 'remote'].map((m) => (
                  <button key={m} onClick={() => setMode(m)} className={cx('flex-1 rounded-md py-1.5 capitalize', mode === m ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500')}>{m === 'office' ? 'Office' : 'Remote'}</button>
                ))}
              </div>
            )}
            {!rec?.check_in ? (
              <button className="btn-success w-full py-2.5" disabled={busy} onClick={() => clock('in')}>{busy ? <Spinner className="!text-white" /> : <LogIn size={16} />}Clock in</button>
            ) : !rec.check_out ? (
              <button className="btn-danger w-full py-2.5" disabled={busy} onClick={() => clock('out')}>{busy ? <Spinner className="!text-white" /> : <LogOut size={16} />}Clock out</button>
            ) : (
              <button className="btn-secondary w-full py-2.5" disabled={busy} onClick={() => clock('out')}><LogOut size={16} />Update clock-out</button>
            )}
            {rec?.work_from && <p className="flex items-center justify-center gap-1 text-xs text-slate-400"><MapPin size={12} />Working from {rec.work_from}</p>}
          </>
        )}
      </div>
    </div>
  );
}
