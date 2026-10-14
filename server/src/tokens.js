import { createHmac, randomBytes } from 'node:crypto';

export const newSecret = () => randomBytes(32).toString('hex');

export const windowIndex = (nowMs, rotateS) => Math.floor(nowMs / (rotateS * 1000));

/** 32-bit token for a window, as 8 upper-case hex characters. */
export function tokenFor(secret, windowIdx) {
  const n = createHmac('sha256', secret).update(String(windowIdx)).digest().readUInt32BE(0);
  return n.toString(16).toUpperCase().padStart(8, '0');
}

export function currentToken(session, nowMs) {
  const idx = windowIndex(nowMs, session.rotate_s);
  return {
    token: tokenFor(session.secret, idx),
    windowIdx: idx,
    expiresAt: (idx + 1) * session.rotate_s * 1000,
    rotateS: session.rotate_s,
  };
}

/** A token is valid for its own window and the one before it (covers scan and network delay). */
export function isFreshToken(session, token, nowMs) {
  if (typeof token !== 'string') return false;
  const idx = windowIndex(nowMs, session.rotate_s);
  const given = token.toUpperCase();
  return given === tokenFor(session.secret, idx) || given === tokenFor(session.secret, idx - 1);
}
