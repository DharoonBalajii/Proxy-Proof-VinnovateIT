import { isUniqueError } from './db.js';
import { isFreshToken } from './tokens.js';

export const REASONS = {
  session_closed: 'This session has ended.',
  not_registered: 'You are not enrolled in this class. Ask your organiser to add you.',
  wrong_device: 'This is not the phone registered to your account. Use your own phone, or ask an admin to approve a device change.',
  stale_token: 'That signal has expired. Keep the app open so it can pick up the next one.',
  too_far: 'Not in the room yet. Move closer to the organiser’s phone.',
  device_already_used: 'This phone has already marked another student in this session.',
  bad_request: 'The request was missing details.',
};

const fail = (reason) => ({ ok: false, reason, message: REASONS[reason] });

export function getSession(db, id) {
  return db.prepare('SELECT * FROM sessions WHERE id = ?').get(id);
}

export function effectiveStatus(session, nowMs) {
  return session.status === 'open' && nowMs < session.ends_at ? 'open' : 'closed';
}

export function closeSession(db, session, nowMs) {
  if (session.status === 'closed') return session;
  const closedAt = Math.min(nowMs, session.ends_at);
  db.prepare("UPDATE sessions SET status = 'closed', closed_at = ? WHERE id = ?").run(closedAt, session.id);
  return getSession(db, session.id);
}

export function recordRejection(db, { sessionId, userId, deviceId, reason, rssi, now }) {
  db.prepare(
    'INSERT INTO rejections (session_id, user_id, device_id, reason, rssi, created_at) VALUES (?,?,?,?,?,?)',
  ).run(sessionId, userId ?? null, deviceId ?? null, reason, rssi ?? null, now);
}

/**
 * The server-side gate for automatic attendance. Every rule from the brief lives here:
 * registered student, fresh token, registered device, RSSI in range, one device per student.
 */
export function verifyMark(db, { sessionId, userId, deviceId, token, rssi, now }) {
  const session = getSession(db, sessionId);
  if (!session) return fail('bad_request');

  const reject = (reason) => {
    recordRejection(db, { sessionId, userId, deviceId, reason, rssi, now });
    return fail(reason);
  };

  if (effectiveStatus(session, now) !== 'open') return reject('session_closed');

  const enrolled = db
    .prepare('SELECT 1 FROM enrollments WHERE course_id = ? AND user_id = ?')
    .get(session.course_id, userId);
  if (!enrolled) return reject('not_registered');

  const bound = db.prepare('SELECT device_id FROM devices WHERE user_id = ?').get(userId);
  if (!bound || !deviceId || bound.device_id !== deviceId) return reject('wrong_device');

  const existing = db
    .prepare('SELECT * FROM marks WHERE session_id = ? AND user_id = ?')
    .get(sessionId, userId);
  if (existing) return { ok: true, already: true, mark: existing };

  if (!isFreshToken(session, token, now)) return reject('stale_token');
  if (typeof rssi !== 'number' || !Number.isFinite(rssi) || rssi < session.rssi_min) return reject('too_far');

  try {
    const info = db
      .prepare(
        "INSERT INTO marks (session_id, user_id, device_id, rssi, source, created_at) VALUES (?,?,?,?, 'auto', ?)",
      )
      .run(sessionId, userId, deviceId, Math.round(rssi), now);
    const mark = db.prepare('SELECT * FROM marks WHERE id = ?').get(info.lastInsertRowid);
    return { ok: true, already: false, mark };
  } catch (err) {
    if (isUniqueError(err)) return reject('device_already_used');
    throw err;
  }
}

export function addManualMark(db, { sessionId, userId, now }) {
  const info = db
    .prepare(
      "INSERT OR IGNORE INTO marks (session_id, user_id, device_id, rssi, source, created_at) VALUES (?,?,NULL,NULL,'manual',?)",
    )
    .run(sessionId, userId, now);
  return { created: info.changes > 0 };
}

export function removeMark(db, { sessionId, userId }) {
  return db.prepare('DELETE FROM marks WHERE session_id = ? AND user_id = ?').run(sessionId, userId).changes > 0;
}

export function sessionMarks(db, sessionId) {
  return db
    .prepare(
      `SELECT m.user_id AS userId, u.name, u.roll_no AS rollNo, m.rssi, m.source, m.created_at AS at
       FROM marks m JOIN users u ON u.id = m.user_id
       WHERE m.session_id = ? ORDER BY m.created_at DESC, m.id DESC`,
    )
    .all(sessionId);
}

export function sessionRejections(db, sessionId) {
  return db
    .prepare(
      `SELECT r.reason, r.rssi, r.created_at AS at, u.name, u.roll_no AS rollNo
       FROM rejections r LEFT JOIN users u ON u.id = r.user_id
       WHERE r.session_id = ? ORDER BY r.created_at DESC, r.id DESC LIMIT 50`,
    )
    .all(sessionId);
}

export const pct = (attended, total) => (total === 0 ? 0 : Math.round((attended / total) * 100));

/** Per-course attendance for one student. Only closed sessions count toward the percentage. */
export function studentHistory(db, userId) {
  const courses = db
    .prepare(
      `SELECT c.id, c.code, c.name FROM courses c
       JOIN enrollments e ON e.course_id = c.id WHERE e.user_id = ? ORDER BY c.code`,
    )
    .all(userId);
  return courses.map((c) => {
    const sessions = db
      .prepare(
        `SELECT s.id, s.started_at AS startedAt,
                EXISTS (SELECT 1 FROM marks m WHERE m.session_id = s.id AND m.user_id = ?) AS present
         FROM sessions s WHERE s.course_id = ? AND s.status = 'closed'
         ORDER BY s.started_at DESC`,
      )
      .all(userId, c.id)
      .map((s) => ({ ...s, present: !!s.present }));
    const attended = sessions.filter((s) => s.present).length;
    return { course: c, total: sessions.length, attended, percent: pct(attended, sessions.length), sessions };
  });
}

const csvCell = (v) => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csv = (rows) => rows.map((r) => r.map(csvCell).join(',')).join('\n') + '\n';
const iso = (ms) => new Date(ms).toISOString();

export function sessionCsv(db, session) {
  const students = db
    .prepare(
      `SELECT u.id, u.roll_no, u.name FROM enrollments e JOIN users u ON u.id = e.user_id
       WHERE e.course_id = ? ORDER BY u.roll_no`,
    )
    .all(session.course_id);
  const marks = new Map(
    db.prepare('SELECT * FROM marks WHERE session_id = ?').all(session.id).map((m) => [m.user_id, m]),
  );
  const rows = [['Roll no', 'Name', 'Status', 'Marked at', 'Source', 'RSSI']];
  for (const s of students) {
    const m = marks.get(s.id);
    rows.push([s.roll_no, s.name, m ? 'Present' : 'Absent', m ? iso(m.created_at) : '', m?.source ?? '', m?.rssi ?? '']);
  }
  return csv(rows);
}

export function courseCsv(db, courseId) {
  const sessions = db
    .prepare("SELECT id, started_at FROM sessions WHERE course_id = ? AND status = 'closed' ORDER BY started_at")
    .all(courseId);
  const students = db
    .prepare(
      `SELECT u.id, u.roll_no, u.name FROM enrollments e JOIN users u ON u.id = e.user_id
       WHERE e.course_id = ? ORDER BY u.roll_no`,
    )
    .all(courseId);
  const present = new Set(
    db
      .prepare(
        `SELECT m.session_id || ':' || m.user_id AS k FROM marks m JOIN sessions s ON s.id = m.session_id
         WHERE s.course_id = ?`,
      )
      .all(courseId)
      .map((r) => r.k),
  );
  const rows = [['Roll no', 'Name', ...sessions.map((s) => iso(s.started_at).slice(0, 16).replace('T', ' ')), 'Attended', 'Percent']];
  for (const st of students) {
    const marks = sessions.map((s) => present.has(`${s.id}:${st.id}`));
    const attended = marks.filter(Boolean).length;
    rows.push([st.roll_no, st.name, ...marks.map((p) => (p ? 'P' : 'A')), attended, `${pct(attended, sessions.length)}%`]);
  }
  return csv(rows);
}
