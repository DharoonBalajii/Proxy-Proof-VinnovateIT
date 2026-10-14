import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { EventEmitter } from 'node:events';
import {
  addManualMark, closeSession, courseCsv, effectiveStatus, getSession, removeMark,
  sessionCsv, sessionMarks, sessionRejections, studentHistory, verifyMark, pct,
} from './attendance.js';
import { newSecret, currentToken } from './tokens.js';

const JWT_SECRET = process.env.JWT_SECRET ?? 'proxyproof-dev-secret';

export function createApp(db, { now = () => Date.now() } = {}) {
  const bus = new EventEmitter();
  const app = express();
  app.use(cors());
  app.use(express.json());

  const err = (res, status, code, message) => res.status(status).json({ error: code, message });
  const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

  // ---------- auth ----------
  const sign = (u) => jwt.sign({ uid: u.id, role: u.role }, JWT_SECRET, { expiresIn: '30d' });
  const publicUser = (u) => ({ id: u.id, role: u.role, rollNo: u.roll_no, name: u.name });

  function auth(...roles) {
    return (req, res, next) => {
      const h = req.get('authorization') ?? '';
      try {
        const p = jwt.verify(h.replace(/^Bearer /, ''), JWT_SECRET);
        const user = db.prepare('SELECT * FROM users WHERE id = ?').get(p.uid);
        if (!user) throw new Error('gone');
        if (roles.length && !roles.includes(user.role)) return err(res, 403, 'forbidden', 'Your role cannot do this.');
        req.user = user;
        req.deviceId = req.get('x-device-id') ?? null;
        next();
      } catch {
        err(res, 401, 'unauthorised', 'Sign in again to continue.');
      }
    };
  }

  app.post('/auth/login', wrap(async (req, res) => {
    const { rollNo, password, deviceId, platform } = req.body ?? {};
    const user = db.prepare('SELECT * FROM users WHERE roll_no = ?').get(String(rollNo ?? '').trim().toUpperCase());
    if (!user || !(await bcrypt.compare(String(password ?? ''), user.pw_hash))) {
      return err(res, 401, 'bad_credentials', 'Roll number or password is wrong.');
    }
    if (user.role !== 'student') return res.json({ token: sign(user), user: publicUser(user) });

    if (!deviceId) return err(res, 400, 'bad_request', 'This app could not identify your phone.');
    const bound = db.prepare('SELECT * FROM devices WHERE user_id = ?').get(user.id);
    const owner = db.prepare('SELECT user_id FROM devices WHERE device_id = ?').get(deviceId);

    if (owner && owner.user_id !== user.id) {
      return err(res, 403, 'device_in_use', 'This phone is registered to another student. Sign in on your own phone.');
    }
    if (!bound) {
      db.prepare('INSERT INTO devices (device_id, user_id, platform, bound_at) VALUES (?,?,?,?)')
        .run(deviceId, user.id, platform ?? null, now());
    } else if (bound.device_id !== deviceId) {
      const latest = db
        .prepare('SELECT * FROM device_requests WHERE user_id = ? AND new_device_id = ? ORDER BY id DESC LIMIT 1')
        .get(user.id, deviceId);
      if (latest?.status === 'rejected') {
        return err(res, 403, 'device_rejected', 'An admin declined this phone. Use your registered phone.');
      }
      if (!latest || latest.status !== 'pending') {
        db.prepare('INSERT INTO device_requests (user_id, new_device_id, platform, created_at) VALUES (?,?,?,?)')
          .run(user.id, deviceId, platform ?? null, now());
      }
      return err(res, 403, 'device_pending', 'This is a new phone. An admin must approve it before you can sign in.');
    }
    res.json({ token: sign(user), user: publicUser(user) });
  }));

  app.get('/me', auth(), (req, res) => {
    const device = db.prepare('SELECT device_id, platform FROM devices WHERE user_id = ?').get(req.user.id);
    res.json({ user: publicUser(req.user), device: device ?? null, deviceMatches: device?.device_id === req.deviceId });
  });

  // ---------- courses ----------
  const ownsCourse = (user, courseId) =>
    db.prepare('SELECT * FROM courses WHERE id = ? AND organiser_id = ?').get(courseId, user.id);

  app.get('/courses', auth('organiser', 'student'), (req, res) => {
    if (req.user.role === 'student') {
      return res.json(db.prepare(
        `SELECT c.id, c.code, c.name FROM courses c JOIN enrollments e ON e.course_id = c.id
         WHERE e.user_id = ? ORDER BY c.code`).all(req.user.id));
    }
    const courses = db.prepare('SELECT id, code, name FROM courses WHERE organiser_id = ? ORDER BY code').all(req.user.id);
    res.json(courses.map((c) => {
      const students = db.prepare('SELECT COUNT(*) n FROM enrollments WHERE course_id = ?').get(c.id).n;
      const sessions = db.prepare("SELECT COUNT(*) n FROM sessions WHERE course_id = ? AND status = 'closed'").get(c.id).n;
      const open = db.prepare("SELECT id FROM sessions WHERE course_id = ? AND status = 'open' AND ends_at > ?").get(c.id, now());
      const avg = db.prepare(
        `SELECT COUNT(*) n FROM marks m JOIN sessions s ON s.id = m.session_id
         WHERE s.course_id = ? AND s.status = 'closed'`).get(c.id).n;
      return { ...c, students, sessions, openSessionId: open?.id ?? null, avgPercent: pct(avg, students * sessions) };
    }));
  });

  app.post('/courses', auth('organiser'), (req, res) => {
    const { code, name } = req.body ?? {};
    if (!code || !name) return err(res, 400, 'bad_request', 'Add a course code and name.');
    const info = db.prepare('INSERT INTO courses (code, name, organiser_id) VALUES (?,?,?)')
      .run(String(code).trim().toUpperCase(), String(name).trim(), req.user.id);
    res.status(201).json({ id: Number(info.lastInsertRowid), code, name });
  });

  app.get('/courses/:id/students', auth('organiser'), (req, res) => {
    if (!ownsCourse(req.user, req.params.id)) return err(res, 404, 'not_found', 'Class not found.');
    res.json(db.prepare(
      `SELECT u.id, u.name, u.roll_no AS rollNo FROM enrollments e JOIN users u ON u.id = e.user_id
       WHERE e.course_id = ? ORDER BY u.roll_no`).all(req.params.id));
  });

  app.post('/courses/:id/enroll', auth('organiser'), (req, res) => {
    if (!ownsCourse(req.user, req.params.id)) return err(res, 404, 'not_found', 'Class not found.');
    const student = db.prepare("SELECT * FROM users WHERE roll_no = ? AND role = 'student'")
      .get(String(req.body?.rollNo ?? '').trim().toUpperCase());
    if (!student) return err(res, 404, 'no_student', 'No student has that roll number.');
    db.prepare('INSERT OR IGNORE INTO enrollments (course_id, user_id) VALUES (?,?)').run(req.params.id, student.id);
    res.status(201).json({ id: student.id, name: student.name, rollNo: student.roll_no });
  });

  app.get('/courses/:id/export.csv', auth('organiser'), (req, res) => {
    if (!ownsCourse(req.user, req.params.id)) return err(res, 404, 'not_found', 'Class not found.');
    res.type('text/csv').send(courseCsv(db, Number(req.params.id)));
  });

  // ---------- sessions ----------
  const sessionOut = (s, t = now()) => ({
    id: s.id, courseId: s.course_id, startedAt: s.started_at, endsAt: s.ends_at, closedAt: s.closed_at,
    status: effectiveStatus(s, t), rssiMin: s.rssi_min, rotateS: s.rotate_s,
  });

  /** Lazily closes sessions whose time is up so reads never show a stale "open". */
  const fresh = (id) => {
    const s = getSession(db, id);
    if (s && s.status === 'open' && now() >= s.ends_at) return closeSession(db, s, now());
    return s;
  };

  function ownedSession(req, res) {
    const s = fresh(req.params.id);
    const course = s && ownsCourse(req.user, s.course_id);
    if (!s || !course) { err(res, 404, 'not_found', 'Session not found.'); return null; }
    return { s, course };
  }

  app.post('/sessions', auth('organiser'), (req, res) => {
    const { courseId, durationMin = 5, rssiMin = -80 } = req.body ?? {};
    const course = ownsCourse(req.user, courseId);
    if (!course) return err(res, 404, 'not_found', 'Class not found.');
    const mins = Number(durationMin);
    if (!(mins >= 1 && mins <= 180)) return err(res, 400, 'bad_request', 'Choose a duration from 1 to 180 minutes.');
    const open = db.prepare("SELECT id FROM sessions WHERE course_id = ? AND status = 'open' AND ends_at > ?").get(course.id, now());
    if (open) return res.status(409).json({ error: 'session_open', message: 'This class already has a session running.', sessionId: open.id });
    const t = now();
    const info = db.prepare(
      'INSERT INTO sessions (course_id, secret, started_at, ends_at, rssi_min) VALUES (?,?,?,?,?)',
    ).run(course.id, newSecret(), t, t + mins * 60_000, Math.round(Number(rssiMin)));
    res.status(201).json(sessionOut(getSession(db, info.lastInsertRowid)));
  });

  app.get('/sessions', auth('organiser'), (req, res) => {
    const course = ownsCourse(req.user, req.query.courseId);
    if (!course) return err(res, 404, 'not_found', 'Class not found.');
    const enrolled = db.prepare('SELECT COUNT(*) n FROM enrollments WHERE course_id = ?').get(course.id).n;
    const rows = db.prepare('SELECT * FROM sessions WHERE course_id = ? ORDER BY started_at DESC').all(course.id);
    res.json(rows.map((raw) => {
      const s = fresh(raw.id);
      const present = db.prepare('SELECT COUNT(*) n FROM marks WHERE session_id = ?').get(s.id).n;
      return { ...sessionOut(s), present, enrolled, percent: pct(present, enrolled) };
    }));
  });

  app.get('/sessions/:id', auth('organiser'), (req, res) => {
    const o = ownedSession(req, res);
    if (!o) return;
    const enrolled = db.prepare('SELECT COUNT(*) n FROM enrollments WHERE course_id = ?').get(o.s.course_id).n;
    res.json({
      ...sessionOut(o.s),
      course: { id: o.course.id, code: o.course.code, name: o.course.name },
      enrolled,
      marks: sessionMarks(db, o.s.id),
      rejections: sessionRejections(db, o.s.id),
      beacon: o.s.status === 'open' ? currentToken(o.s, now()) : null,
    });
  });

  app.post('/sessions/:id/close', auth('organiser'), (req, res) => {
    const o = ownedSession(req, res);
    if (!o) return;
    const closed = closeSession(db, o.s, now());
    bus.emit('session', closed.id, { type: 'closed' });
    res.json(sessionOut(closed));
  });

  app.get('/sessions/:id/export.csv', auth('organiser'), (req, res) => {
    const o = ownedSession(req, res);
    if (!o) return;
    res.type('text/csv').send(sessionCsv(db, o.s));
  });

  // What a student's phone shows once it has heard a beacon for this session.
  app.get('/sessions/:id/public', auth('student'), (req, res) => {
    const s = fresh(req.params.id);
    const course = s && db.prepare(
      `SELECT c.id, c.code, c.name FROM courses c JOIN enrollments e ON e.course_id = c.id
       WHERE c.id = ? AND e.user_id = ?`).get(s.course_id, req.user.id);
    if (!course) return err(res, 404, 'not_found', 'You are not enrolled in this session’s class.');
    const marked = !!db.prepare('SELECT 1 FROM marks WHERE session_id = ? AND user_id = ?').get(s.id, req.user.id);
    res.json({ ...sessionOut(s), course, marked });
  });

  app.get('/sessions/active/mine', auth('student'), (req, res) => {
    const rows = db.prepare(
      `SELECT s.* FROM sessions s JOIN enrollments e ON e.course_id = s.course_id
       WHERE e.user_id = ? AND s.status = 'open' AND s.ends_at > ?`).all(req.user.id, now());
    res.json(rows.map((s) => sessionOut(s)));
  });

  // ---------- marks ----------
  app.post('/sessions/:id/marks', auth('student'), (req, res) => {
    const { token, rssi } = req.body ?? {};
    const result = verifyMark(db, {
      sessionId: Number(req.params.id), userId: req.user.id, deviceId: req.deviceId, token, rssi, now: now(),
    });
    if (!result.ok) return res.status(422).json({ error: result.reason, message: result.message });
    if (!result.already) {
      bus.emit('session', Number(req.params.id), {
        type: 'mark',
        mark: { userId: req.user.id, name: req.user.name, rollNo: req.user.roll_no, rssi: result.mark.rssi, source: 'auto', at: result.mark.created_at },
      });
    }
    res.status(result.already ? 200 : 201).json({ marked: true, already: result.already, at: result.mark.created_at });
  });

  app.post('/sessions/:id/marks/manual', auth('organiser'), (req, res) => {
    const o = ownedSession(req, res);
    if (!o) return;
    const student = db.prepare(
      `SELECT u.* FROM users u JOIN enrollments e ON e.user_id = u.id
       WHERE e.course_id = ? AND u.roll_no = ?`).get(o.s.course_id, String(req.body?.rollNo ?? '').trim().toUpperCase());
    if (!student) return err(res, 404, 'no_student', 'That roll number is not enrolled in this class.');
    const { created } = addManualMark(db, { sessionId: o.s.id, userId: student.id, now: now() });
    const mark = { userId: student.id, name: student.name, rollNo: student.roll_no, rssi: null, source: 'manual', at: now() };
    if (created) bus.emit('session', o.s.id, { type: 'mark', mark });
    res.status(created ? 201 : 200).json(mark);
  });

  app.delete('/sessions/:id/marks/:userId', auth('organiser'), (req, res) => {
    const o = ownedSession(req, res);
    if (!o) return;
    const removed = removeMark(db, { sessionId: o.s.id, userId: Number(req.params.userId) });
    if (removed) bus.emit('session', o.s.id, { type: 'unmark', userId: Number(req.params.userId) });
    res.json({ removed });
  });

  // ---------- history ----------
  app.get('/me/attendance', auth('student'), (req, res) => res.json(studentHistory(db, req.user.id)));

  // ---------- admin ----------
  app.get('/admin/device-requests', auth('admin'), (req, res) => {
    const status = req.query.status ?? 'pending';
    res.json(db.prepare(
      `SELECT r.id, r.status, r.platform, r.created_at AS createdAt, r.new_device_id AS newDeviceId,
              u.name, u.roll_no AS rollNo, d.platform AS currentPlatform
       FROM device_requests r JOIN users u ON u.id = r.user_id LEFT JOIN devices d ON d.user_id = u.id
       WHERE r.status = ? ORDER BY r.id DESC`).all(status));
  });

  app.post('/admin/device-requests/:id/:decision', auth('admin'), (req, res) => {
    const { id, decision } = req.params;
    if (!['approve', 'reject'].includes(decision)) return err(res, 400, 'bad_request', 'Decision must be approve or reject.');
    const r = db.prepare("SELECT * FROM device_requests WHERE id = ? AND status = 'pending'").get(id);
    if (!r) return err(res, 404, 'not_found', 'That request is no longer pending.');
    if (decision === 'approve') {
      const taken = db.prepare('SELECT user_id FROM devices WHERE device_id = ? AND user_id != ?').get(r.new_device_id, r.user_id);
      if (taken) return err(res, 409, 'device_in_use', 'That phone is already registered to another student.');
      db.prepare('UPDATE devices SET device_id = ?, platform = ?, bound_at = ? WHERE user_id = ?')
        .run(r.new_device_id, r.platform, now(), r.user_id);
    }
    db.prepare('UPDATE device_requests SET status = ?, decided_at = ? WHERE id = ?')
      .run(decision === 'approve' ? 'approved' : 'rejected', now(), id);
    res.json({ ok: true });
  });

  app.get('/admin/users', auth('admin'), (req, res) => {
    res.json(db.prepare(
      `SELECT u.id, u.name, u.roll_no AS rollNo, u.role, d.platform AS devicePlatform, d.device_id IS NOT NULL AS bound
       FROM users u LEFT JOIN devices d ON d.user_id = u.id ORDER BY u.role, u.roll_no`).all());
  });

  app.use((e, req, res, next) => {
    console.error(e);
    err(res, 500, 'server_error', 'Something went wrong on the server.');
  });

  return { app, bus, auth: { verify: (t) => jwt.verify(t, JWT_SECRET) }, now };
}
