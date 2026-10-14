import type { LiveSocket } from '../api/live';
import type { Beacon, Scanner } from './types';

/**
 * Simulated Bluetooth: the beacon payload travels over the live socket, and RSSI comes from a slider.
 * Like a real advertiser, the beacon repeats about once a second so late joiners still hear it.
 */
export function createSimBeacon(live: LiveSocket): Beacon {
  let timer: ReturnType<typeof setInterval> | null = null;
  const clear = () => { if (timer) clearInterval(timer); timer = null; };
  return {
    async broadcast({ sessionId, token }) {
      clear();
      live.simBeacon(sessionId, token);
      timer = setInterval(() => live.simBeacon(sessionId, token), 1000);
    },
    async stop() { clear(); },
  };
}

export function createSimScanner(live: LiveSocket, getRssi: () => number): Scanner {
  let off: (() => void) | null = null;
  return {
    async start(onSighting) {
      off = live.on((e) => {
        if (e.type === 'beacon') onSighting({ sessionId: e.sessionId, token: e.token, rssi: getRssi() });
      });
    },
    async stop() { off?.(); off = null; },
  };
}
