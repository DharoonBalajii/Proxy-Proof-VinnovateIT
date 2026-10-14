export type BleMode = 'native' | 'sim';

export type Sighting = { sessionId: number; token: string; rssi: number };

export interface Beacon {
  /** Replaces whatever is currently being broadcast. */
  broadcast(payload: { sessionId: number; token: string }): Promise<void>;
  stop(): Promise<void>;
}

export interface Scanner {
  start(onSighting: (s: Sighting) => void): Promise<void>;
  stop(): Promise<void>;
}

export class BleUnavailableError extends Error {}
