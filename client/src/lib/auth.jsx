import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from './api.js';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [state, setState] = useState({ loading: true, user: null, company: null, needsSetup: false });
  const refresh = useCallback(async () => {
    try {
      const me = await api.get('/auth/me');
      setState({ loading: false, user: me.user, company: me.company, needsSetup: false });
      document.title = `${me.company.name} · TeamHR`;
    } catch {
      const s = await api.get('/auth/setup').catch(() => ({ needs_setup: false }));
      setState({ loading: false, user: null, company: null, needsSetup: s.needs_setup });
    }
  }, []);
  useEffect(() => {
    refresh();
    const onUnauth = () => setState((s) => ({ ...s, user: null }));
    window.addEventListener('hr:unauthorized', onUnauth);
    return () => window.removeEventListener('hr:unauthorized', onUnauth);
  }, [refresh]);
  const logout = async () => { await api.post('/auth/logout'); setState({ loading: false, user: null, company: null, needsSetup: false }); };
  return <AuthCtx.Provider value={{ ...state, refresh, logout }}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);
export const useUser = () => useContext(AuthCtx).user;
