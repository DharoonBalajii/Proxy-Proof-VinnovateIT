import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';
import { api, config, type User } from '../api/client';
import { LiveSocket } from '../api/live';
import { defaultBleMode, nativeBleAvailable, type BleMode } from '../ble';
import { getDeviceId, getItem, setItem } from '../lib/storage';

type Ctx = {
  ready: boolean;
  user: User | null;
  deviceId: string;
  serverUrl: string;
  bleMode: BleMode;
  live: LiveSocket;
  signIn: (rollNo: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  setBleMode: (m: BleMode) => void;
  setServerUrl: (url: string) => Promise<void>;
  setDeviceId: (id: string) => Promise<void>;
};

const AppContext = createContext<Ctx | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [deviceId, setDeviceIdState] = useState('');
  const [serverUrl, setServerUrlState] = useState(config.baseUrl);
  const [bleMode, setBleModeState] = useState<BleMode>(defaultBleMode());
  const live = useRef(new LiveSocket()).current;

  const startLive = useCallback(() => { live.close(); live.connect(); }, [live]);

  const signOut = useCallback(async () => {
    live.close();
    config.setAuth(null);
    setUser(null);
    await setItem('pp_token', null);
  }, [live]);

  useEffect(() => {
    config.onUnauthorised(() => { void signOut(); });
    (async () => {
      const [id, url, mode, token] = await Promise.all([
        getDeviceId(), getItem('pp_server'), getItem('pp_ble_mode'), getItem('pp_token'),
      ]);
      config.setDeviceId(id);
      setDeviceIdState(id);
      if (url) { config.setBaseUrl(url); setServerUrlState(url); }
      if (mode === 'sim' || (mode === 'native' && nativeBleAvailable())) setBleModeState(mode);
      if (token) config.setAuth(token);
      config.markReady();
      if (token) {
        try {
          const me = await api.get<{ user: User; deviceMatches: boolean }>('/me');
          // A restored student session on a different device is not valid: ask them to sign in again.
          if (me.user.role === 'student' && !me.deviceMatches) throw new Error('device changed');
          setUser(me.user);
          startLive();
        } catch {
          config.setAuth(null);
          await setItem('pp_token', null);
        }
      }
      setReady(true);
    })();
  }, [signOut, startLive]);

  const signIn = useCallback(async (rollNo: string, password: string) => {
    const res = await api.post<{ token: string; user: User }>('/auth/login', {
      rollNo, password, deviceId: config.deviceId, platform: Platform.OS,
    });
    config.setAuth(res.token);
    await setItem('pp_token', res.token);
    setUser(res.user);
    startLive();
  }, [startLive]);

  const setBleMode = useCallback((m: BleMode) => { setBleModeState(m); void setItem('pp_ble_mode', m); }, []);
  const setServerUrl = useCallback(async (url: string) => {
    config.setBaseUrl(url);
    setServerUrlState(config.baseUrl);
    await setItem('pp_server', config.baseUrl);
  }, []);
  const setDeviceId = useCallback(async (id: string) => {
    config.setDeviceId(id);
    setDeviceIdState(id);
    await setItem('pp_device_id', id);
  }, []);

  const value = useMemo<Ctx>(
    () => ({ ready, user, deviceId, serverUrl, bleMode, live, signIn, signOut, setBleMode, setServerUrl, setDeviceId }),
    [ready, user, deviceId, serverUrl, bleMode, live, signIn, signOut, setBleMode, setServerUrl, setDeviceId],
  );
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
