import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { WebSocket } from 'ws';
import { openDb } from '../src/db.js';
import { createApp } from '../src/app.js';
import { attachLive } from '../src/live.js';
import { seed, DEMO_PASSWORD } from '../src/seed.js';
import { tokenFor, windowIndex } from '../src/tokens.js';

const T0 = 1_700_000_000_000;
let clock;
let db, server, live, base, bus, ctx;

const startServer = async () => {
  db = openDb(':memory:');
  ctx = seed(db, { cost: 4, now: T0 });
  const made = createApp(db, { now: () => clock });
  bus = made.bus;
  server = createServer(made.app);
  live = attachLive(server, { db, bus, verify: made.auth.verify, now: () => clock });
  await new Promise((r) => server.listen(0, r));
  base = `http://localhost:${server.address().port}`;
};

const stopServer = () => { live?.close(); server?.closeAllConnections(); server?.close(); };
after(stopServer);
beforeEach(async () => {
  // Fresh database per test so devices, sessions and marks never leak between cases.
  stopServer();
  clock = T0;
  await startServer();
});

async function api(method, path, { token, device, body } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token && { authorization: `Bearer ${token}` }),
      ...(device && { 'x-device-id': device }),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, body: json };
}

const login = (rollNo, deviceId) =>
  api('POST', '/auth/login', { body: { rollNo, password: DEMO_PASSWORD, deviceId, platform: 'test' } });

async function signedIn(rollNo, deviceId) {
  const r = await login(rollNo, deviceId);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return { token: r.body.token, device: deviceId };
}

async function openSession(org, courseId = ctx.courses[0].id, extra = {}) {
  const r = await api('POST', '/sessions', { token: org.token, body: { courseId, durationMin: 5, ...extra } });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body;
}

const liveToken = async (org, sessionId) =>
  (await api('GET', `/sessions/${sessionId}`, { token: org.token })).body.beacon.token;

const mark = (stu, sessionId, token, rssi = -60) =>
  api('POST', `/sessions/${sessionId}/marks`, { token: stu.token, device: stu.device, body: { token, rssi } });

test('a registered student on the right device with a fresh token and good RSSI is marked', async () => {
  const org = await signedIn('FAC01', null);
  const stu = await signedIn('23CS001', 'dev-1');
  const s = await openSession(org);
  const events = [];
  bus.on('session', (id, ev) => events.push([id, ev.type]));

  const r = await mark(stu, s.id, await liveToken(org, s.id));
  assert.equal(r.status, 201);
  assert.equal(r.body.marked, true);
  assert.deepEqual(events, [[s.id, 'mark']]);

  const detail = (await api('GET', `/sessions/${s.id}`, { token: org.token })).body;
  assert.equal(detail.marks.length, 1);
  assert.equal(detail.marks[0].rollNo, '23CS001');
  assert.equal(detail.marks[0].source, 'auto');
});

test('posting again is idempotent and does not emit a second mark', async () => {
  const org = await signedIn('FAC01', null);
  const stu = await signedIn('23CS001', 'dev-1');
  const s = await openSession(org);
  const tok = await liveToken(org, s.id);
  await mark(stu, s.id, tok);
  const events = [];
  bus.on('session', (id, ev) => events.push(ev.type));
  const again = await mark(stu, s.id, tok);
  assert.equal(again.status, 200);
  assert.equal(again.body.already, true);
  assert.deepEqual(events, []);
});

test('token rotates every window and only the current and previous window are accepted', async () => {
  const org = await signedIn('FAC01', null);
  const stu = await signedIn('23CS001', 'dev-1');
  const stu2 = await signedIn('23CS002', 'dev-2');
  const stu3 = await signedIn('23CS003', 'dev-3');
  const s = await openSession(org);
  const secret = db.prepare('SELECT secret FROM sessions WHERE id = ?').get(s.id).secret;
  const idx = windowIndex(clock, 10);

  assert.notEqual(tokenFor(secret, idx), tokenFor(secret, idx + 1));

  const previous = tokenFor(secret, idx - 1);
  const twoBack = tokenFor(secret, idx - 2);
  const r1 = await mark(stu, s.id, twoBack);
  assert.equal(r1.status, 422);
  assert.equal(r1.body.error, 'stale_token');

  assert.equal((await mark(stu2, s.id, previous)).status, 201, 'previous window covers scan and network delay');
  assert.equal((await mark(stu3, s.id, 'DEADBEEF')).body.error, 'stale_token', 'a guessed token is rejected');
});

test('a replayed token stops working after the window has passed', async () => {
  const org = await signedIn('FAC01', null);
  const stu = await signedIn('23CS001', 'dev-1');
  const s = await openSession(org);
  const shared = await liveToken(org, s.id); // a friend photographs the code and shares it
  clock += 25_000;
  const r = await mark(stu, s.id, shared);
  assert.equal(r.status, 422);
  assert.equal(r.body.error, 'stale_token');
});

test('a student who is not enrolled is rejected', async () => {
  const org = await signedIn('FAC02', null);
  const stu = await signedIn('23CS010', 'dev-10'); // not in Machine Learning
  const s = await openSession(org, ctx.courses[2].id);
  const r = await mark(stu, s.id, await liveToken(org, s.id));
  assert.equal(r.status, 422);
  assert.equal(r.body.error, 'not_registered');
});

test('a request from a device other than the bound one is rejected', async () => {
  const org = await signedIn('FAC01', null);
  const stu = await signedIn('23CS001', 'dev-1');
  const s = await openSession(org);
  const tok = await liveToken(org, s.id);
  const r = await mark({ token: stu.token, device: 'someone-elses-phone' }, s.id, tok);
  assert.equal(r.status, 422);
  assert.equal(r.body.error, 'wrong_device');
  const none = await mark({ token: stu.token, device: undefined }, s.id, tok);
  assert.equal(none.body.error, 'wrong_device');
});

test('RSSI below the threshold is rejected and the boundary is accepted', async () => {
  const org = await signedIn('FAC01', null);
  const near = await signedIn('23CS001', 'dev-1');
  const far = await signedIn('23CS002', 'dev-2');
  const s = await openSession(org, ctx.courses[0].id, { rssiMin: -75 });
  const tok = await liveToken(org, s.id);
  const rFar = await mark(far, s.id, tok, -76);
  assert.equal(rFar.status, 422);
  assert.equal(rFar.body.error, 'too_far');
  assert.equal((await mark(near, s.id, tok, -75)).status, 201);
  assert.equal((await mark(far, s.id, tok, 'strong')).body.error, 'too_far');
});

test('marks are refused after the session ends', async () => {
  const org = await signedIn('FAC01', null);
  const stu = await signedIn('23CS001', 'dev-1');
  const s = await openSession(org);
  const tok = await liveToken(org, s.id);
  clock += 5 * 60_000 + 1;
  const r = await mark(stu, s.id, tok);
  assert.equal(r.body.error, 'session_closed');
  const detail = (await api('GET', `/sessions/${s.id}`, { token: org.token })).body;
  assert.equal(detail.status, 'closed');
  assert.equal(detail.beacon, null);
});

test('one device cannot be bound to two students, and cannot mark two students in one session', async () => {
  await signedIn('23CS001', 'shared-phone');
  const second = await login('23CS002', 'shared-phone');
  assert.equal(second.status, 403);
  assert.equal(second.body.error, 'device_in_use');

  // Defence in depth: even if the binding were bypassed, the database refuses the second mark.
  const org = await signedIn('FAC01', null);
  const s = await openSession(org);
  const insert = db.prepare("INSERT INTO marks (session_id, user_id, device_id, rssi, source, created_at) VALUES (?,?,?,?, 'auto', ?)");
  insert.run(s.id, ctx.students[0].id, 'shared-phone', -50, clock);
  assert.throws(() => insert.run(s.id, ctx.students[1].id, 'shared-phone', -50, clock), /UNIQUE/);
});

test('switching phones needs admin approval', async () => {
  const stu = await signedIn('23CS001', 'old-phone');
  const admin = await signedIn('ADMIN', null);

  const attempt = await login('23CS001', 'new-phone');
  assert.equal(attempt.status, 403);
  assert.equal(attempt.body.error, 'device_pending');
  assert.equal((await login('23CS001', 'new-phone')).body.error, 'device_pending', 'repeat attempts do not stack requests');

  const pending = (await api('GET', '/admin/device-requests', { token: admin.token })).body;
  assert.equal(pending.length, 1);
  assert.equal(pending[0].rollNo, '23CS001');

  const org = await signedIn('FAC01', null);
  const s = await openSession(org);
  const viaNew = await mark({ token: stu.token, device: 'new-phone' }, s.id, await liveToken(org, s.id));
  assert.equal(viaNew.body.error, 'wrong_device', 'the pending phone still cannot mark');

  assert.equal((await api('POST', `/admin/device-requests/${pending[0].id}/approve`, { token: admin.token })).status, 200);
  const ok = await login('23CS001', 'new-phone');
  assert.equal(ok.status, 200);
  assert.equal((await login('23CS001', 'old-phone')).body.error, 'device_pending', 'the old phone is now the unknown one');
});

test('a declined device change stays declined', async () => {
  await signedIn('23CS001', 'old-phone');
  const admin = await signedIn('ADMIN', null);
  await login('23CS001', 'new-phone');
  const [req] = (await api('GET', '/admin/device-requests', { token: admin.token })).body;
  await api('POST', `/admin/device-requests/${req.id}/reject`, { token: admin.token });
  assert.equal((await login('23CS001', 'new-phone')).body.error, 'device_rejected');
});

test('organisers can add and remove marks manually, but only on their own sessions', async () => {
  const org = await signedIn('FAC01', null);
  const other = await signedIn('FAC02', null);
  const s = await openSession(org);

  const add = await api('POST', `/sessions/${s.id}/marks/manual`, { token: org.token, body: { rollNo: '23cs004' } });
  assert.equal(add.status, 201);
  assert.equal(add.body.source, 'manual');
  assert.equal((await api('POST', `/sessions/${s.id}/marks/manual`, { token: org.token, body: { rollNo: '23CS004' } })).status, 200);

  const notEnrolled = await api('POST', `/sessions/${s.id}/marks/manual`, { token: org.token, body: { rollNo: 'NOPE' } });
  assert.equal(notEnrolled.status, 404);

  assert.equal((await api('DELETE', `/sessions/${s.id}/marks/${add.body.userId}`, { token: other.token })).status, 404);
  const del = await api('DELETE', `/sessions/${s.id}/marks/${add.body.userId}`, { token: org.token });
  assert.equal(del.body.removed, true);
  assert.equal((await api('GET', `/sessions/${s.id}`, { token: org.token })).body.marks.length, 0);
});

test('rejected attempts are logged for the organiser', async () => {
  const org = await signedIn('FAC01', null);
  const stu = await signedIn('23CS001', 'dev-1');
  const s = await openSession(org);
  await mark(stu, s.id, 'BADBADBA');
  const detail = (await api('GET', `/sessions/${s.id}`, { token: org.token })).body;
  assert.equal(detail.rejections.length, 1);
  assert.equal(detail.rejections[0].reason, 'stale_token');
  assert.equal(detail.rejections[0].rollNo, '23CS001');
});

test('closing a session stops marks and a second session cannot overlap', async () => {
  const org = await signedIn('FAC01', null);
  const stu = await signedIn('23CS001', 'dev-1');
  const s = await openSession(org);
  const dup = await api('POST', '/sessions', { token: org.token, body: { courseId: ctx.courses[0].id, durationMin: 5 } });
  assert.equal(dup.status, 409);
  assert.equal(dup.body.sessionId, s.id);

  const tok = await liveToken(org, s.id);
  assert.equal((await api('POST', `/sessions/${s.id}/close`, { token: org.token })).body.status, 'closed');
  assert.equal((await mark(stu, s.id, tok)).body.error, 'session_closed');
});

test('role guards: students cannot start sessions or read the roster', async () => {
  const stu = await signedIn('23CS001', 'dev-1');
  assert.equal((await api('POST', '/sessions', { token: stu.token, body: { courseId: 1 } })).status, 403);
  assert.equal((await api('GET', '/admin/device-requests', { token: stu.token })).status, 403);
  assert.equal((await api('GET', '/courses/1/students', { token: stu.token })).status, 403);
  assert.equal((await api('GET', '/me')).status, 401);
});

test('bad credentials are refused', async () => {
  const r = await api('POST', '/auth/login', { body: { rollNo: '23CS001', password: 'nope', deviceId: 'd' } });
  assert.equal(r.status, 401);
  assert.equal(r.body.error, 'bad_credentials');
});

test('history: percentage counts closed sessions only and matches the database', async () => {
  const stu = await signedIn('23CS001', 'dev-1');
  const org = await signedIn('FAC01', null);
  await openSession(org); // open session must not count
  const history = (await api('GET', '/me/attendance', { token: stu.token })).body;
  assert.equal(history.length, 3, "23CS001 is enrolled in all three seeded classes");
  for (const c of history) {
    const total = db.prepare("SELECT COUNT(*) n FROM sessions WHERE course_id = ? AND status = 'closed'").get(c.course.id).n;
    const attended = db.prepare(
      `SELECT COUNT(*) n FROM marks m JOIN sessions s ON s.id = m.session_id
       WHERE s.course_id = ? AND s.status = 'closed' AND m.user_id = ?`).get(c.course.id, ctx.students[0].id).n;
    assert.equal(c.total, total);
    assert.equal(c.attended, attended);
    assert.equal(c.percent, Math.round((attended / total) * 100));
    assert.equal(c.sessions.length, total);
  }
});

test('CSV exports list every enrolled student with their status and percentage', async () => {
  const org = await signedIn('FAC01', null);
  const stu = await signedIn('23CS001', 'dev-1');
  const s = await openSession(org);
  await mark(stu, s.id, await liveToken(org, s.id));

  const one = (await api('GET', `/sessions/${s.id}/export.csv`, { token: org.token })).body;
  const rows = one.trim().split('\n');
  assert.equal(rows[0], 'Roll no,Name,Status,Marked at,Source,RSSI');
  assert.equal(rows.length, 13, 'header plus 12 students');
  assert.match(rows[1], /^23CS001,Dharoon Balajii,Present,.+,auto,-60$/);
  assert.match(rows[2], /^23CS002,Aanya Krishnan,Absent,,,$/);

  await api('POST', `/sessions/${s.id}/close`, { token: org.token });
  const all = (await api('GET', `/courses/${ctx.courses[0].id}/export.csv`, { token: org.token })).body;
  const lines = all.trim().split('\n');
  assert.match(lines[0], /^Roll no,Name,.*,Attended,Percent$/);
  assert.equal(lines[0].split(',').length, 2 + 8 + 2, '8 closed sessions: 7 seeded and the one just closed');
  assert.match(lines[1], /^23CS001,Dharoon Balajii,.*,\d+%$/);
});

test('live socket: organiser gets the token, rotation, and marks in real time', async () => {
  const org = await signedIn('FAC01', null);
  const stu = await signedIn('23CS001', 'dev-1');
  const s = await openSession(org);

  const ws = new WebSocket(`${base.replace('http', 'ws')}/live?token=${org.token}`);
  const inbox = [];
  ws.on('message', (m) => inbox.push(JSON.parse(String(m))));
  await new Promise((r) => ws.on('open', r));
  ws.send(JSON.stringify({ type: 'subscribe', sessionId: s.id }));

  const waitFor = async (pred) => {
    for (let i = 0; i < 40; i++) {
      const hit = inbox.find(pred);
      if (hit) return hit;
      await new Promise((r) => setTimeout(r, 50));
    }
    assert.fail('timed out waiting for socket message');
  };

  const first = await waitFor((m) => m.type === 'token');
  assert.equal(first.token.length, 8);

  clock += 10_000; // the window rolls over
  const second = await waitFor((m) => m.type === 'token' && m.windowIdx > first.windowIdx);
  assert.notEqual(second.token, first.token);

  assert.equal((await mark(stu, s.id, second.token)).status, 201);
  const m = await waitFor((x) => x.type === 'mark');
  assert.equal(m.mark.rollNo, '23CS001');

  await api('POST', `/sessions/${s.id}/close`, { token: org.token });
  await waitFor((x) => x.type === 'closed');
  ws.close();
});

test('live socket: sim beacon reaches enrolled students only', async () => {
  const org = await signedIn('FAC02', null); // Machine Learning: students 23CS001..008
  const inside = await signedIn('23CS001', 'dev-1');
  const outside = await signedIn('23CS010', 'dev-10');
  const s = await openSession(org, ctx.courses[2].id);
  const url = (t) => `${base.replace('http', 'ws')}/live?token=${t}`;

  const connect = async (token) => {
    const ws = new WebSocket(url(token));
    const inbox = [];
    ws.on('message', (m) => inbox.push(JSON.parse(String(m))));
    await new Promise((r) => ws.on('open', r));
    return { ws, inbox };
  };
  const a = await connect(inside.token);
  const b = await connect(outside.token);
  const o = await connect(org.token);
  o.ws.send(JSON.stringify({ type: 'sim_beacon', sessionId: s.id, token: 'ABCD1234' }));
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(a.inbox.length, 1);
  assert.equal(a.inbox[0].type, 'beacon');
  assert.equal(a.inbox[0].sessionId, s.id);
  assert.equal(b.inbox.length, 0);
  [a, b, o].forEach((c) => c.ws.close());
});
