import type { LiveSocket } from '../api/live';
import { createNativeBeacon, createNativeScanner, nativeBleAvailable } from './native';
import { createSimBeacon, createSimScanner } from './sim';
import type { BleMode, Beacon, Scanner } from './types';

export { nativeBleAvailable } from './native';
export * from './types';

export const defaultBleMode = (): BleMode => (nativeBleAvailable() ? 'native' : 'sim');

export const createBeacon = (mode: BleMode, live: LiveSocket): Beacon =>
  mode === 'native' ? createNativeBeacon() : createSimBeacon(live);

export const createScanner = (mode: BleMode, live: LiveSocket, getRssi: () => number): Scanner =>
  mode === 'native' ? createNativeScanner() : createSimScanner(live, getRssi);
