import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { openDb } from './db.js';
import { createApp } from './app.js';
import { attachLive } from './live.js';
import { seed } from './seed.js';

const PORT = Number(process.env.PORT ?? 4000);
const DB_FILE = process.env.DB_FILE ?? new URL('../proxyproof.db', import.meta.url).pathname;

const db = openDb(DB_FILE);
if (!db.prepare('SELECT 1 FROM users LIMIT 1').get()) {
  seed(db);
  console.log('Seeded demo data. Sign in with the accounts printed by `npm run seed`.');
}

const { app, bus, auth } = createApp(db);
const server = createServer(app);
attachLive(server, { db, bus, verify: auth.verify });

server.listen(PORT, '0.0.0.0', () => {
  const lan = Object.values(networkInterfaces()).flat().find((i) => i?.family === 'IPv4' && !i.internal)?.address;
  console.log(`ProxyProof server on http://localhost:${PORT}${lan ? `  (phones on this Wi-Fi: http://${lan}:${PORT})` : ''}`);
});
