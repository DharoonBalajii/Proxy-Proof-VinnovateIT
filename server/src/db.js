import { DatabaseSync } from 'node:sqlite';

const SCHEMA = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  role TEXT NOT NULL CHECK (role IN ('student','organiser','admin')),
  roll_no TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  pw_hash TEXT NOT NULL
);

-- A student is bound to exactly one device, and a device to exactly one student.
CREATE TABLE IF NOT EXISTS devices (
  device_id TEXT NOT NULL UNIQUE,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id),
  platform TEXT,
  bound_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS device_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  new_device_id TEXT NOT NULL,
  platform TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  created_at INTEGER NOT NULL,
  decided_at INTEGER
);

CREATE TABLE IF NOT EXISTS courses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  organiser_id INTEGER NOT NULL REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS enrollments (
  course_id INTEGER NOT NULL REFERENCES courses(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  PRIMARY KEY (course_id, user_id)
);

CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  course_id INTEGER NOT NULL REFERENCES courses(id),
  secret TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  ends_at INTEGER NOT NULL,
  closed_at INTEGER,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  rssi_min INTEGER NOT NULL DEFAULT -80,
  rotate_s INTEGER NOT NULL DEFAULT 10
);

CREATE TABLE IF NOT EXISTS marks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL REFERENCES sessions(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  device_id TEXT,
  rssi INTEGER,
  source TEXT NOT NULL CHECK (source IN ('auto','manual')),
  created_at INTEGER NOT NULL,
  UNIQUE (session_id, user_id)
);

-- One physical device can mark only one student per session.
CREATE UNIQUE INDEX IF NOT EXISTS marks_session_device
  ON marks(session_id, device_id) WHERE device_id IS NOT NULL;

-- Rejected attempts are kept so organisers can see proxy attempts.
CREATE TABLE IF NOT EXISTS rejections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL REFERENCES sessions(id),
  user_id INTEGER,
  device_id TEXT,
  reason TEXT NOT NULL,
  rssi INTEGER,
  created_at INTEGER NOT NULL
);
`;

export function openDb(path = ':memory:') {
  const db = new DatabaseSync(path);
  db.exec(SCHEMA);
  return db;
}

export function isUniqueError(err) {
  return /UNIQUE constraint failed/i.test(String(err?.message));
}
