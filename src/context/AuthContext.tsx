import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { setAppLanguage } from '../i18n';

const AUTH_KEY = 'moni-hr-session-v1';
const LANG_KEY = 'moni-hr-lang-v1';

/** 员工可任职的门店（多店时由 selectedStoreId 决定当前上下文） */
export type StoreRef = {
  id: string;
  name: string;
};

export type UserRole = 'staff' | 'manager';

export type User = {
  id: string;
  name: string;
  employeeId: string;
  role: UserRole;
  activated: boolean;
  email: string;
  phone: string;
  stores: StoreRef[];
  selectedStoreId: string;
};

function migrateUser(u: User & { storeName?: string }): User {
  if (u.stores?.length) {
    return {
      ...u,
      selectedStoreId: u.selectedStoreId ?? u.stores[0].id,
    };
  }
  const fallbackId = 'store-default';
  const label = u.storeName ?? 'Store';
  return {
    ...u,
    stores: [{ id: fallbackId, name: label }],
    selectedStoreId: fallbackId,
  };
}

export function getActiveStore(user: User | undefined): StoreRef | undefined {
  if (!user?.stores?.length) return undefined;
  return user.stores.find((s) => s.id === user.selectedStoreId) ?? user.stores[0];
}

export type LeaveRequest = {
  id: string;
  type: 'leave' | 'swap' | 'missed_punch';
  start: string;
  end: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  /** 漏打卡：必须绑定到某一「排班段」，而非整天 */
  missedPunch?: {
    workDate: string;
    slotIndex: number;
    region: string;
    shiftKey: string;
    scheduledRange: string;
    punchKind: 'in' | 'out';
    proposedTime: string;
  };
};

type Session = {
  user: User;
};

type AuthContextValue = {
  ready: boolean;
  session: Session | null;
  language: 'en' | 'zh';
  login: (account: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => Promise<void>;
  activateAccount: (code: string) => Promise<{ ok: boolean; error?: string }>;
  setLanguage: (lng: 'en' | 'zh') => Promise<void>;
  changePassword: (oldPassword: string, newPassword: string) => Promise<{ ok: boolean; error?: string }>;
  updateProfile: (patch: Partial<Pick<User, 'email' | 'phone'>>) => void;
  /** 切换当前门店（写入会话；数据层按此 id 拉取店铺排班等） */
  setSelectedStore: (storeId: string) => void;
  clockEvents: { id: string; type: 'in' | 'out'; at: string }[];
  punch: (type: 'in' | 'out') => void;
  addRequest: (input: Omit<LeaveRequest, 'id' | 'status'>) => void;
  requests: LeaveRequest[];
};

const AuthContext = createContext<AuthContextValue | null>(null);

function buildUser(account: string): User {
  const normalized = account.trim().toLowerCase();
  const isManager = normalized === 'manager';
  const pending = normalized === 'activate';
  const stores: StoreRef[] = [
    { id: 'store-akl', name: 'Auckland Flagship' },
    { id: 'store-chc', name: 'Christchurch Hub' },
  ];
  return {
    id: 'u-1',
    name: isManager ? 'Alex Chen' : 'Sam Li',
    employeeId: isManager ? 'M-1024' : 'S-2048',
    role: isManager ? 'manager' : 'staff',
    activated: !pending,
    email: isManager ? 'alex@example.com' : 'sam@example.com',
    phone: isManager ? '+64 21 000 0001' : '+64 21 000 0002',
    stores,
    selectedStoreId: stores[0].id,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [language, setLanguageState] = useState<'en' | 'zh'>('en');
  const [clockEvents, setClockEvents] = useState<{ id: string; type: 'in' | 'out'; at: string }[]>([]);
  const [requests, setRequests] = useState<LeaveRequest[]>([
    {
      id: 'r-1',
      type: 'leave',
      start: '2026-05-18',
      end: '2026-05-19',
      reason: 'Family',
      status: 'pending',
    },
    {
      id: 'r-2',
      type: 'swap',
      start: '2026-05-22',
      end: '2026-05-22',
      reason: 'Study',
      status: 'approved',
    },
    {
      id: 'r-3',
      type: 'missed_punch',
      start: '2026-05-13',
      end: '2026-05-13',
      reason: 'Forgot after opening rush',
      status: 'pending',
      missedPunch: {
        workDate: '2026-05-13',
        slotIndex: 0,
        region: 'regionFoH',
        shiftKey: 'shiftOpen',
        scheduledRange: '08:30–12:30',
        punchKind: 'in',
        proposedTime: '08:35',
      },
    },
  ]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [rawSession, rawLang] = await Promise.all([
          AsyncStorage.getItem(AUTH_KEY),
          AsyncStorage.getItem(LANG_KEY),
        ]);
        if (cancelled) return;
        if (rawLang === 'en' || rawLang === 'zh') {
          setLanguageState(rawLang);
          setAppLanguage(rawLang);
        }
        if (rawSession) {
          const parsed = JSON.parse(rawSession) as Session;
          const u = migrateUser(parsed.user as User & { storeName?: string });
          setSession({ user: u });
        }
      } catch {
        // ignore corrupt storage
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const persistSession = useCallback(async (next: Session | null) => {
    setSession(next);
    if (next) await AsyncStorage.setItem(AUTH_KEY, JSON.stringify(next));
    else await AsyncStorage.removeItem(AUTH_KEY);
  }, []);

  const login = useCallback(async (account: string, _password: string) => {
    const trimmed = account.trim();
    if (!trimmed) {
      return { ok: false, error: 'empty' };
    }
    await persistSession({ user: buildUser(trimmed) });
    return { ok: true };
  }, [persistSession]);

  const logout = useCallback(async () => {
    setClockEvents([]);
    await persistSession(null);
  }, [persistSession]);

  const activateAccount = useCallback(
    async (code: string) => {
      if (!code.trim()) {
        return { ok: false, error: 'empty' };
      }
      setSession((prev) => {
        if (!prev) return prev;
        const next: Session = { user: { ...prev.user, activated: true } };
        void AsyncStorage.setItem(AUTH_KEY, JSON.stringify(next));
        return next;
      });
      return { ok: true };
    },
    [],
  );

  const setLanguage = useCallback(async (lng: 'en' | 'zh') => {
    setLanguageState(lng);
    setAppLanguage(lng);
    await AsyncStorage.setItem(LANG_KEY, lng);
  }, []);

  const changePassword = useCallback(async (oldPassword: string, newPassword: string) => {
    if (!oldPassword || !newPassword) {
      return { ok: false, error: 'empty' };
    }
    if (oldPassword === 'wrong') {
      return { ok: false, error: 'wrong' };
    }
    return { ok: true };
  }, []);

  const updateProfile = useCallback((patch: Partial<Pick<User, 'email' | 'phone'>>) => {
    setSession((prev) => {
      if (!prev) return prev;
      const next: Session = { user: { ...prev.user, ...patch } };
      void AsyncStorage.setItem(AUTH_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const setSelectedStore = useCallback((storeId: string) => {
    setSession((prev) => {
      if (!prev) return prev;
      if (!prev.user.stores.some((s) => s.id === storeId)) return prev;
      const next: Session = { user: { ...prev.user, selectedStoreId: storeId } };
      void AsyncStorage.setItem(AUTH_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const punch = useCallback((type: 'in' | 'out') => {
    const at = new Date().toISOString();
    setClockEvents((prev) => [...prev, { id: `${type}-${at}`, type, at }]);
  }, []);

  const addRequest = useCallback((input: Omit<LeaveRequest, 'id' | 'status'>) => {
    const id = `r-${Date.now()}`;
    setRequests((prev) => [{ ...input, id, status: 'pending' }, ...prev]);
  }, []);

  const value = useMemo(
    () => ({
      ready,
      session,
      language,
      login,
      logout,
      activateAccount,
      setLanguage,
      changePassword,
      updateProfile,
      setSelectedStore,
      clockEvents,
      punch,
      addRequest,
      requests,
    }),
    [
      ready,
      session,
      language,
      login,
      logout,
      activateAccount,
      setLanguage,
      changePassword,
      updateProfile,
      setSelectedStore,
      clockEvents,
      punch,
      addRequest,
      requests,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
