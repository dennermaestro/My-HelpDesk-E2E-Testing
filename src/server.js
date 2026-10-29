import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createDatabase } from './db/database.js';

const config = loadConfig();
const db = createDatabase(config.dbPath);
const app = createApp({ db, demoDefects: config.demoDefects, publicDir: config.publicDir });

const server = app.listen(config.port, () => {
  console.log(`MultiDesk running at http://localhost:${config.port}`);
  console.log(`Database: ${config.dbPath} (reset with seed data)`);
  console.log(`Demo defects: ${config.demoDefects ? 'ON (planted bugs active)' : 'off'}`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${config.port} is already in use. Stop the other process or run with PORT=<another port>.`);
  } else {
    console.error(err);
  }
  db.close();
  process.exit(1);
});

function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
