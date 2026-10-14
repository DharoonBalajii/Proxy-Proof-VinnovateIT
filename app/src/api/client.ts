import Constants from 'expo-constants';
import { Platform } from 'react-native';

export type Role = 'student' | 'organiser' | 'admin';
export type User = { id: number; role: Role; rollNo: string; name: string };

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

const defaultUrl = () => {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv) return fromEnv;
  // In Expo's dev server the host machine's address is also the API host.
  const host = (Constants.expoConfig as { hostUri?: string } | null)?.hostUri?.split(':')[0];
  if (host && host !== 'localhost') return `http://${host}:4000`;
  return Platform.OS === 'android' ? 'http://10.0.2.2:4000' : 'http://localhost:4000';
};

let baseUrl = defaultUrl();
let authToken: string | null = null;
let deviceId: string | null = null;
let onUnauthorised: (() => void) | null = null;

// Requests wait until the saved session (token, device id, server URL) has been restored,
// so a screen that mounts first on a deep link or reload never fires an unauthenticated call.
let markReady: () => void = () => {};
const ready = new Promise<void>((resolve) => { markReady = resolve; });

export const config = {
  get baseUrl() { return baseUrl; },
  get defaultUrl() { return defaultUrl(); },
  setBaseUrl(url: string) { baseUrl = url.replace(/\/+$/, ''); },
  setAuth(token: string | null) { authToken = token; },
  setDeviceId(id: string) { deviceId = id; },
  get deviceId() { return deviceId; },
  onUnauthorised(fn: () => void) { onUnauthorised = fn; },
  markReady() { markReady(); },
};

export const wsUrl = () => `${baseUrl.replace(/^http/, 'ws')}/live?token=${encodeURIComponent(authToken ?? '')}`;

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  await ready;
  let res: Response;
  try {
    res = await fetch(baseUrl + path, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(authToken && { authorization: `Bearer ${authToken}` }),
        ...(deviceId && { 'x-device-id': deviceId }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'offline', `Can’t reach the server at ${baseUrl}. Check your connection and the server address.`);
  }
  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  if (!res.ok) {
    if (res.status === 401 && authToken) onUnauthorised?.();
    throw new ApiError(res.status, json?.error ?? 'error', json?.message ?? 'Something went wrong.');
  }
  return json as T;
}

export const api = {
  get: <T>(p: string) => request<T>('GET', p),
  post: <T>(p: string, b?: unknown) => request<T>('POST', p, b ?? {}),
  del: <T>(p: string) => request<T>('DELETE', p),
  async text(path: string): Promise<string> {
    await ready;
    const res = await fetch(baseUrl + path, { headers: { authorization: `Bearer ${authToken}` } });
    if (!res.ok) throw new ApiError(res.status, 'error', 'Could not download the file.');
    return res.text();
  },
};

// ---------- response types ----------
export type Course = { id: number; code: string; name: string; students: number; sessions: number; openSessionId: number | null; avgPercent: number };
export type Mark = { userId: number; name: string; rollNo: string; rssi: number | null; source: 'auto' | 'manual'; at: number };
export type Rejection = { reason: string; rssi: number | null; at: number; name: string | null; rollNo: string | null };
export type Beacon = { token: string; windowIdx: number; expiresAt: number; rotateS: number };
export type SessionDetail = {
  id: number; courseId: number; startedAt: number; endsAt: number; closedAt: number | null; status: 'open' | 'closed';
  rssiMin: number; rotateS: number; course: { id: number; code: string; name: string }; enrolled: number;
  marks: Mark[]; rejections: Rejection[]; beacon: Beacon | null;
};
export type SessionRow = { id: number; startedAt: number; endsAt: number; status: 'open' | 'closed'; present: number; enrolled: number; percent: number };
export type HistoryCourse = {
  course: { id: number; code: string; name: string }; total: number; attended: number; percent: number;
  sessions: { id: number; startedAt: number; present: boolean }[];
};
export type DeviceRequest = { id: number; platform: string | null; createdAt: number; name: string; rollNo: string; currentPlatform: string | null };
export type DirectoryUser = { id: number; name: string; rollNo: string; role: Role; devicePlatform: string | null; bound: number };
