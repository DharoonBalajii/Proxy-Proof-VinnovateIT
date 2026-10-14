import { NativeModules, PermissionsAndroid, Platform } from 'react-native';
import { decodePayload, encodePayload } from './payload';
import { BleUnavailableError, type Beacon, type Scanner, type Sighting } from './types';

/**
 * Real Bluetooth. Both libraries are native modules that only exist in a development build,
 * so they are loaded lazily and the app falls back to simulated mode inside Expo Go.
 */
export function nativeBleAvailable(): boolean {
  return !!NativeModules.BLEAdvertiser && !!NativeModules.BlePlx;
}

async function ensurePermissions(kind: 'scan' | 'advertise') {
  if (Platform.OS !== 'android') return;
  const api = Platform.Version as number;
  const wanted =
    api >= 31
      ? [
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          kind === 'scan' ? PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN : PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE,
        ]
      : [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];
  const result = await PermissionsAndroid.requestMultiple(wanted);
  if (Object.values(result).some((r) => r !== PermissionsAndroid.RESULTS.GRANTED)) {
    throw new BleUnavailableError('Bluetooth permission was denied. Allow it in Settings to continue.');
  }
}

function assertNative() {
  if (!nativeBleAvailable()) {
    throw new BleUnavailableError('Bluetooth needs a development build. Switch to simulated mode in Profile to try the app here.');
  }
}

// Metro needs literal require paths; each is evaluated only when real Bluetooth is first used.
function loadAdvertiser(): any {
  assertNative();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('react-native-ble-advertiser');
  return mod.default ?? mod;
}
function loadPlx(): any {
  assertNative();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('react-native-ble-plx');
}

export function createNativeBeacon(): Beacon {
  let running = false;
  return {
    async broadcast(payload) {
      const Advertiser = loadAdvertiser();
      await ensurePermissions('advertise');
      if (running) await Advertiser.stopBroadcast().catch(() => {});
      Advertiser.setCompanyId(0x00e0);
      await Advertiser.broadcast(encodePayload(payload), [], {
        advertiseMode: Advertiser.ADVERTISE_MODE_LOW_LATENCY,
        txPowerLevel: Advertiser.ADVERTISE_TX_POWER_HIGH,
        connectable: false,
        includeDeviceName: false,
        includeTxPowerLevel: false,
      });
      running = true;
    },
    async stop() {
      if (!running) return;
      running = false;
      const Advertiser = loadAdvertiser();
      await Advertiser.stopBroadcast().catch(() => {});
    },
  };
}

export function createNativeScanner(): Scanner {
  let manager: any = null;
  return {
    async start(onSighting) {
      const { BleManager } = loadPlx();
      await ensurePermissions('scan');
      manager = new BleManager();
      // Wait for the radio before scanning, otherwise iOS silently ignores startDeviceScan.
      await new Promise<void>((resolve, reject) => {
        const sub = manager.onStateChange((state: string) => {
          if (state === 'PoweredOn') { sub.remove(); resolve(); }
          else if (state === 'Unauthorized') { sub.remove(); reject(new BleUnavailableError('Bluetooth access is off for ProxyProof. Turn it on in Settings.')); }
          else if (state === 'PoweredOff') { sub.remove(); reject(new BleUnavailableError('Bluetooth is off. Turn it on to be marked.')); }
        }, true);
      });
      manager.startDeviceScan(null, { allowDuplicates: true }, (error: unknown, device: any) => {
        if (error || !device?.serviceUUIDs) return;
        for (const uuid of device.serviceUUIDs as string[]) {
          const p = decodePayload(uuid);
          if (p && typeof device.rssi === 'number') onSighting({ ...p, rssi: device.rssi } as Sighting);
        }
      });
    },
    async stop() {
      try { manager?.stopDeviceScan(); manager?.destroy(); } catch { /* already gone */ }
      manager = null;
    },
  };
}
