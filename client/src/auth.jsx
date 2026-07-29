import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from './api.js';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [state, setState] = useState({ status: 'loading', user: null, meta: null, company: null });

  const load = useCallback(async () => {
    try {
      const data = await api.get('/auth/me');
      setState({ status: 'ready', user: data.user, meta: data.meta, company: data.company });
    } catch (e) {
      if (e.status === 0) setState({ status: 'offline', user: null, meta: null, company: null });
      else setState({ status: 'anon', user: null, meta: null, company: null });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const login = useCallback(
    async (username, password) => {
      await api.post('/auth/login', { username, password });
      await load();
    },
    [load]
  );

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      /* signing out locally regardless */
    }
    setState({ status: 'anon', user: null, meta: null, company: null });
  }, []);

  const value = useMemo(() => {
    const { user, meta, company, status } = state;
    return {
      status,
      user,
      meta,
      company,
      login,
      logout,
      refresh: load,
      setCompany: (c) => setState((s) => ({ ...s, company: c })),
      /** Can the signed-in user complete this workflow stage? */
      canStage: (key) => !!(meta && meta.stages.find((s) => s.key === key && s.mine)) && user?.role !== 'management',
      /** Named capability check, mirrors the server's list. */
      can: (cap) => !!(meta && meta.capabilities && meta.capabilities[cap]),
      isAdmin: !!user && user.role === 'admin',
      readOnly: !!user && user.role === 'management',
      stage: (key) => (meta ? meta.stages.find((s) => s.key === key) : null),
      stages: meta ? meta.stages : [],
    };
  }, [state, login, logout, load]);

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
