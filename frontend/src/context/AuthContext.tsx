import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { setAuthListener } from '@/services/apiClient';
import { authService } from '@/services/authService';
import type { AuthUser } from '@/types/auth';

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

interface AuthContextValue {
  user: AuthUser | null;
  status: AuthStatus;
  login: (email: string, password: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  /** True if the user holds the given permission key. */
  hasPermission: (key: string) => boolean;
  /** True if the user holds at least one of the given permission keys. */
  hasAnyPermission: (keys: string[]) => boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');

  // Silent re-authentication on first load using the refresh cookie.
  useEffect(() => {
    let active = true;
    authService.bootstrap().then((u) => {
      if (!active) return;
      setUser(u);
      setStatus(u ? 'authenticated' : 'unauthenticated');
    });
    return () => {
      active = false;
    };
  }, []);

  // React to forced logout triggered by a failed token refresh.
  useEffect(() => {
    setAuthListener((event) => {
      if (event === 'logout') {
        setUser(null);
        setStatus('unauthenticated');
      }
    });
    return () => setAuthListener(null);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const u = await authService.login(email, password);
    setUser(u);
    setStatus('authenticated');
    return u;
  }, []);

  const logout = useCallback(async () => {
    await authService.logout();
    setUser(null);
    setStatus('unauthenticated');
  }, []);

  const refreshUser = useCallback(async () => {
    const u = await authService.me();
    setUser(u);
  }, []);

  const hasPermission = useCallback(
    (key: string) => user?.permissions.includes(key) ?? false,
    [user],
  );
  const hasAnyPermission = useCallback(
    (keys: string[]) => keys.some((k) => user?.permissions.includes(k)) ?? false,
    [user],
  );

  const value = useMemo(
    () => ({
      user,
      status,
      login,
      logout,
      refreshUser,
      hasPermission,
      hasAnyPermission,
    }),
    [user, status, login, logout, refreshUser, hasPermission, hasAnyPermission],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
