import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createClient, type ApiClient } from '../lib/api';
import { resolveInitialState } from '../lib/use-api-data';
import { useSSRData } from '../lib/ssr-data';
import { login as loginAction, register as registerAction } from '../lib/actions';
import type { ApiUser } from '../lib/adapters/api-types';

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  handle: string;
  avatarUrl?: string;
  // /api/me 的未读通知数(仅本人语境返回;Navbar 徽标消费)
  unreadNotifications: number;
  isAdmin: boolean;
  emailVerified: boolean;
  // 周报邮件开关(仅本人语境返回;/me 设置区消费)
  emailWeekly: boolean;
}

// /api/me 的 user 对象比共享的 ApiUser(adapters/api-types.ts,给公开档案/项目数据用)多一个
// id 字段——扩展而非重新声明整套字段，遵守该文件"跨任务不重复定义"的约定。
type MeUser = ApiUser & { id: string };

interface AuthContextValue {
  isLoggedIn: boolean;
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  register: (f: {
    invite_code: string;
    email: string;
    password: string;
    handle: string;
    display_name: string;
  }) => Promise<void>;
  githubStart: (mode: 'login' | 'link') => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const isServer = typeof window === 'undefined';

// writeUserByID 在本人语境(includeEmail=true)会返回 email；公开端点不带该键。
function toAuthUser(u: MeUser): AuthUser {
  return {
    id: u.id,
    email: u.email ?? '',
    displayName: u.display_name,
    handle: u.handle,
    avatarUrl: u.avatar_url || '',
    unreadNotifications: u.unread_notifications ?? 0,
    isAdmin: u.role === 'admin',
    // 公开语境缺省视为已验证,避免横幅误闪。
    emailVerified: u.email_verified ?? true,
    // 库默认即开;公开语境缺省同样按开显示。
    emailWeekly: u.email_weekly ?? true,
  };
}

function newClient(): ApiClient {
  return createClient({ baseURL: '' });
}

async function fetchMe(c: ApiClient): Promise<AuthUser | null> {
  const r = await c.tryGet<{ user: MeUser }>('/api/me');
  return r?.user ? toAuthUser(r.user) : null;
}

interface State {
  user: AuthUser | null;
  loading: boolean;
  // SSR 是否已经给出确定性结论(登录用户对象 或 null=确认匿名)。
  // false 表示 SSR 没给 auth 数据(降级壳/私有页直载)，客户端需要自己去问一次。
  confirmed: boolean;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const ssrAuth = useSSRData<MeUser | null>('auth');

  const [state, setState] = useState<State>(() => {
    if (resolveInitialState('auth', ssrAuth, isServer)) {
      return { user: ssrAuth ? toAuthUser(ssrAuth) : null, loading: false, confirmed: true };
    }
    // 无 auth key：服务端降级壳，或客户端尚未拿到 SSR 数据——匿名不算数，得真去问一次。
    return { user: null, loading: !isServer, confirmed: false };
  });

  // 防 StrictMode 开发态挂载→卸载→再挂载的重复 effect 把 /api/me 打两次。
  const startedRef = useRef(false);
  useEffect(() => {
    if (state.confirmed || startedRef.current) return;
    startedRef.current = true;
    let alive = true;
    fetchMe(newClient())
      .then((user) => {
        if (alive) setState({ user, loading: false, confirmed: true });
      })
      .catch(() => {
        if (alive) setState({ user: null, loading: false, confirmed: true });
      });
    return () => {
      alive = false;
    };
    // 只在挂载时决定一次是否需要客户端重取；state.confirmed 的后续变化(由本效果自己触发)
    // 不应该重新触发它。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const c = newClient();
    await loginAction(c, email, password);
    const user = await fetchMe(c);
    setState({ user, loading: false, confirmed: true });
  }, []);

  const logout = useCallback(async () => {
    await newClient().post('/api/auth/logout');
    setState({ user: null, loading: false, confirmed: true });
  }, []);

  const register = useCallback(
    async (f: { invite_code: string; email: string; password: string; handle: string; display_name: string }) => {
      const c = newClient();
      await registerAction(c, f);
      const user = await fetchMe(c);
      setState({ user, loading: false, confirmed: true });
    },
    [],
  );

  const githubStart = useCallback((mode: 'login' | 'link') => {
    window.location.href = '/api/auth/github?mode=' + mode;
  }, []);

  return (
    <AuthContext.Provider
      value={{
        isLoggedIn: state.user !== null,
        user: state.user,
        loading: state.loading,
        login,
        logout,
        register,
        githubStart,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
