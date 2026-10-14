import bcrypt from 'bcryptjs';
import { rmSync } from 'node:fs';
import { openDb } from './db.js';
import { newSecret } from './tokens.js';

export const DEMO_PASSWORD = 'proxyproof';

const STUDENTS = [
  ['23CS001', 'Dharoon Balajii'], ['23CS002', 'Aanya Krishnan'], ['23CS003', 'Rohan Menon'],
  ['23CS004', 'Ishita Rao'], ['23CS005', 'Karthik Subramanian'], ['23CS006', 'Meera Nair'],
  ['23CS007', 'Arjun Pillai'], ['23CS008', 'Sana Sheikh'], ['23CS009', 'Vikram Reddy'],
  ['23CS010', 'Tara Joseph'], ['23CS011', 'Nikhil Varma'], ['23CS012', 'Divya Lakshmi'],
];

// Deterministic PRNG so the demo history is the same every time.
function mulberry(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seed(db, { cost = 10, now = Date.now() } = {}) {
  const hash = bcrypt.hashSync(DEMO_PASSWORD, cost);
  const addUser = db.prepare('INSERT INTO users (role, roll_no, name, pw_hash) VALUES (?,?,?,?)');
  const id = (info) => Number(info.lastInsertRowid);

  const admin = id(addUser.run('admin', 'ADMIN', 'Campus Admin', hash));
  const fac1 = id(addUser.run('organiser', 'FAC01', 'Dr. Meera Iyer', hash));
  const fac2 = id(addUser.run('organiser', 'FAC02', 'Prof. Anand Rajan', hash));
  const students = STUDENTS.map(([roll, name]) => ({ roll, name, id: id(addUser.run('student', roll, name, hash)) }));

  const addCourse = db.prepare('INSERT INTO courses (code, name, organiser_id) VALUES (?,?,?)');
  const courses = [
    { id: id(addCourse.run('CS3401', 'Computer Networks', fac1)), pool: students, sessions: 7 },
    { id: id(addCourse.run('CS3402', 'Operating Systems', fac1)), pool: students, sessions: 5 },
    { id: id(addCourse.run('CS3451', 'Machine Learning', fac2)), pool: students.slice(0, 8), sessions: 4 },
  ];

  const enroll = db.prepare('INSERT INTO enrollments (course_id, user_id) VALUES (?,?)');
  const addSession = db.prepare(
    "INSERT INTO sessions (course_id, secret, started_at, ends_at, closed_at, status) VALUES (?,?,?,?,?,'closed')",
  );
  const addMark = db.prepare(
    'INSERT INTO marks (session_id, user_id, device_id, rssi, source, created_at) VALUES (?,?,?,?,?,?)',
  );
  const rand = mulberry(7);
  const DAY = 86_400_000;
  // Each student has a habit: how likely they are to turn up.
  const habit = new Map(students.map((s, i) => [s.id, [0.98, 0.9, 0.85, 0.75, 0.7, 0.95, 0.6, 0.92, 0.8, 0.88, 0.55, 0.97][i]]));

  for (const c of courses) {
    for (const s of c.pool) enroll.run(c.id, s.id);
    for (let n = c.sessions; n >= 1; n--) {
      const start = now - n * 3 * DAY - c.id * 3_600_000;
      const sid = id(addSession.run(c.id, newSecret(), start, start + 5 * 60_000, start + 5 * 60_000));
      for (const s of c.pool) {
        if (rand() > habit.get(s.id)) continue;
        const manual = rand() < 0.08;
        addMark.run(sid, s.id, manual ? null : `seed-device-${s.id}`, manual ? null : -45 - Math.floor(rand() * 28),
          manual ? 'manual' : 'auto', start + 20_000 + Math.floor(rand() * 200_000));
      }
    }
  }
  return { admin, organisers: [fac1, fac2], students, courses };
}

// `npm run seed` rebuilds the demo database from scratch.
if (import.meta.url === `file://${process.argv[1]}`) {
  const file = new URL('../proxyproof.db', import.meta.url).pathname;
  for (const suffix of ['', '-wal', '-shm']) rmSync(file + suffix, { force: true });
  seed(openDb(file));
  console.log(`Demo data written. Every account uses the password "${DEMO_PASSWORD}".`);
  console.log('  admin      ADMIN');
  console.log('  organiser  FAC01  (Computer Networks, Operating Systems)   FAC02  (Machine Learning)');
  console.log('  student    23CS001 to 23CS012');
}
