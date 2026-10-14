import { WebSocketServer } from 'ws';
import { closeSession, getSession } from './attendance.js';
import { currentToken, windowIndex } from './tokens.js';

/**
 * /live WebSocket.
 *  organiser -> {type:'subscribe', sessionId}      server -> token / mark / unmark / closed
 *  organiser -> {type:'sim_beacon', sessionId, token}   relayed to enrolled students as 'beacon'
 *  student   -> (listen only)                       server -> beacon  (simulated-BLE mode)
 */
export function attachLive(server, { db, bus, verify, now = () => Date.now() }) {
  const wss = new WebSocketServer({ server, path: '/live' });
  const clients = new Set();

  const send = (c, msg) => c.ws.readyState === 1 && c.ws.send(JSON.stringify(msg));

  wss.on('connection', (ws, req) => {
    let user;
    try {
      const url = new URL(req.url, 'http://x');
      const { uid } = verify(url.searchParams.get('token') ?? '');
      user = db.prepare('SELECT * FROM users WHERE id = ?').get(uid);
    } catch { /* falls through */ }
    if (!user) return ws.close(4401, 'unauthorised');

    const client = { ws, user, subs: new Map() }; // sessionId -> last window index sent
    clients.add(client);
    ws.on('close', () => clients.delete(client));
    ws.on('error', () => clients.delete(client));

    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(String(raw)); } catch { return; }
      if (user.role !== 'organiser') return;
      const session = getSession(db, Number(msg.sessionId));
      const course = session && db.prepare('SELECT 1 FROM courses WHERE id = ? AND organiser_id = ?').get(session.course_id, user.id);
      if (!course) return;

      if (msg.type === 'subscribe') {
        client.subs.set(session.id, null);
        pushToken(client, session);
      } else if (msg.type === 'sim_beacon' && session.status === 'open') {
        const students = db.prepare('SELECT user_id FROM enrollments WHERE course_id = ?').all(session.course_id)
          .map((r) => r.user_id);
        for (const c of clients) {
          if (c.user.role === 'student' && students.includes(c.user.id)) {
            send(c, { type: 'beacon', sessionId: session.id, courseId: session.course_id, token: String(msg.token) });
          }
        }
      }
    });
  });

  function pushToken(client, session) {
    const t = currentToken(session, now());
    client.subs.set(session.id, t.windowIdx);
    send(client, { type: 'token', sessionId: session.id, ...t });
  }

  bus.on('session', (sessionId, event) => {
    for (const c of clients) if (c.subs.has(sessionId)) send(c, { ...event, sessionId });
  });

  // One ticker: expires sessions and pushes a fresh token the moment a window rolls over.
  const ticker = setInterval(() => {
    const t = now();
    const expired = db.prepare("SELECT * FROM sessions WHERE status = 'open' AND ends_at <= ?").all(t);
    for (const s of expired) {
      closeSession(db, s, t);
      bus.emit('session', s.id, { type: 'closed' });
    }
    for (const c of clients) {
      for (const [sessionId, last] of c.subs) {
        const s = getSession(db, sessionId);
        if (s?.status === 'open' && windowIndex(t, s.rotate_s) !== last) pushToken(c, s);
      }
    }
  }, 250);
  ticker.unref();

  return { wss, close: () => { clearInterval(ticker); wss.close(); } };
}
