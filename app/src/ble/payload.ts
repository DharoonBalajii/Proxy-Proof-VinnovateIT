/**
 * The beacon is one 128-bit service UUID. iOS cannot advertise manufacturer data,
 * but it can advertise a service UUID, so the whole payload rides in the UUID:
 *
 *   PREFIX "PROX" (4 B) | sessionId (4 B) | token (4 B) | check (4 B)
 *
 * The scanner filters on the prefix, verifies the check bytes and decodes the rest.
 */
const PREFIX = [0x50, 0x52, 0x4f, 0x58];

export type Payload = { sessionId: number; token: string };

function check(bytes: number[]): number[] {
  // FNV-1a over the first 12 bytes. Guards against decoding someone else's UUID, not against attackers.
  let h = 0x811c9dc5;
  for (const b of bytes) {
    h ^= b;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return [(h >>> 24) & 255, (h >>> 16) & 255, (h >>> 8) & 255, h & 255];
}

const u32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const hex = (bytes: number[]) => bytes.map((b) => b.toString(16).padStart(2, '0')).join('');

export function encodePayload({ sessionId, token }: Payload): string {
  const tokenBytes = (token.match(/.{2}/g) ?? []).map((h) => parseInt(h, 16));
  const body = [...PREFIX, ...u32(sessionId), ...tokenBytes];
  const h = hex([...body, ...check(body)]);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function decodePayload(uuid: string): Payload | null {
  const h = uuid.replace(/-/g, '').toLowerCase();
  if (h.length !== 32 || !/^[0-9a-f]+$/.test(h)) return null;
  const bytes = (h.match(/.{2}/g) as string[]).map((x) => parseInt(x, 16));
  if (!PREFIX.every((b, i) => bytes[i] === b)) return null;
  const expected = check(bytes.slice(0, 12));
  if (!expected.every((b, i) => bytes[12 + i] === b)) return null;
  const sessionId = ((bytes[4] << 24) | (bytes[5] << 16) | (bytes[6] << 8) | bytes[7]) >>> 0;
  return { sessionId, token: hex(bytes.slice(8, 12)).toUpperCase() };
}
