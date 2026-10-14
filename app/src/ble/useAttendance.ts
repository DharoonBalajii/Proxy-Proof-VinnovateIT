import { useCallback, useEffect, useRef, useState } from 'react';
import * as Haptics from 'expo-haptics';
import { api, ApiError } from '../api/client';
import { createScanner, type Scanner, type Sighting } from '.';
import { useApp } from '../store/app';

export type Phase =
  | { kind: 'starting' }
  | { kind: 'listening' }
  | { kind: 'detected'; course: string | null; rssi: number; hint: string | null }
  | { kind: 'locked'; course: string; at: number }
  | { kind: 'error'; message: string; code: string }
  | { kind: 'blocked'; message: string };

type Public = { id: number; course: { code: string; name: string }; marked: boolean };

const RETRY_MS = 1500;
const HARD_ERROR_MS = 30_000;
const IGNORE_MS = 60_000;

/**
 * Student side: listens for beacons while `active`, and posts to the server as soon as one is heard.
 * The server decides; this hook only relays what the radio saw (session, token, smoothed RSSI).
 */
export function useAttendance(active: boolean, getSimRssi: () => number) {
  const { bleMode, live } = useApp();
  const [phase, setPhase] = useState<Phase>({ kind: 'starting' });
  const [attempt, setAttempt] = useState(0);
  const scannerRef = useRef<Scanner | null>(null);

  const state = useRef({
    inflight: false,
    lastTry: 0,
    samples: new Map<number, number[]>(),
    info: new Map<number, Public>(),
    ignoreUntil: new Map<number, number>(),
    locked: new Set<number>(),
  });

  const reset = useCallback(() => {
    const s = state.current;
    s.locked.clear(); s.ignoreUntil.clear(); s.samples.clear(); s.inflight = false;
    setPhase({ kind: 'listening' });
  }, []);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const s = state.current;

    const onSighting = async (sight: Sighting) => {
      if (cancelled) return;
      const now = Date.now();
      if (s.locked.has(sight.sessionId)) return;
      if ((s.ignoreUntil.get(sight.sessionId) ?? 0) > now) return;

      const buf = s.samples.get(sight.sessionId) ?? [];
      buf.push(sight.rssi);
      if (buf.length > 3) buf.shift();
      s.samples.set(sight.sessionId, buf);
      const rssi = Math.round(buf.reduce((a, b) => a + b, 0) / buf.length);
      const known = s.info.get(sight.sessionId);

      setPhase((p) => (p.kind === 'detected' || p.kind === 'listening' || p.kind === 'starting'
        ? { kind: 'detected', course: known?.course.code ?? null, rssi, hint: p.kind === 'detected' ? p.hint : null }
        : p));

      if (s.inflight || now - s.lastTry < RETRY_MS) return;
      s.inflight = true;
      s.lastTry = now;
      try {
        let info = known;
        if (!info) {
          try {
            info = await api.get<Public>(`/sessions/${sight.sessionId}/public`);
            s.info.set(sight.sessionId, info);
          } catch (e) {
            // Someone else's class: not an error, just not for us.
            if (e instanceof ApiError && e.status === 404) { s.ignoreUntil.set(sight.sessionId, Date.now() + IGNORE_MS); setPhase({ kind: 'listening' }); return; }
            throw e;
          }
        }
        const label = `${info.course.code} · ${info.course.name}`;
        if (info.marked) { s.locked.add(sight.sessionId); setPhase({ kind: 'locked', course: label, at: Date.now() }); return; }

        const res = await api.post<{ marked: boolean; at: number }>(`/sessions/${sight.sessionId}/marks`, { token: sight.token, rssi });
        s.locked.add(sight.sessionId);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        setPhase({ kind: 'locked', course: label, at: res.at });
      } catch (e) {
        if (cancelled) return;
        const err = e as ApiError;
        if (err.code === 'too_far') {
          setPhase({ kind: 'detected', course: s.info.get(sight.sessionId)?.course.code ?? null, rssi, hint: err.message });
        } else if (err.code === 'stale_token') {
          setPhase((p) => (p.kind === 'detected' ? { ...p, hint: null } : p)); // next beacon will carry a fresh one
        } else if (err.code === 'offline') {
          setPhase({ kind: 'error', code: err.code, message: err.message });
        } else {
          s.ignoreUntil.set(sight.sessionId, Date.now() + HARD_ERROR_MS);
          setPhase({ kind: 'error', code: err.code ?? 'error', message: err.message ?? 'Could not mark you present.' });
        }
      } finally {
        s.inflight = false;
      }
    };

    const scanner = createScanner(bleMode, live, getSimRssi);
    scannerRef.current = scanner;
    setPhase({ kind: 'starting' });
    scanner
      .start((x) => { void onSighting(x); })
      .then(() => { if (!cancelled) setPhase((p) => (p.kind === 'starting' ? { kind: 'listening' } : p)); })
      .catch((e: Error) => { if (!cancelled) setPhase({ kind: 'blocked', message: e.message }); });

    return () => {
      cancelled = true;
      void scanner.stop();
      scannerRef.current = null;
    };
  }, [active, bleMode, live, getSimRssi, attempt]);

  return { phase, reset, retry: () => setAttempt((n) => n + 1) };
}
