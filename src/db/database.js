import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { seedDatabase } from './seed.js';

export const PRIORITIES = ['low', 'normal', 'high', 'urgent'];
export const STATUSES = ['open', 'in_progress', 'resolved'];

const SCHEMA = `
  CREATE TABLE tenants (
    id   TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    plan TEXT NOT NULL CHECK (plan IN ('starter', 'pro'))
  );

  CREATE TABLE tenant_settings (
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    key       TEXT NOT NULL,
    enabled   INTEGER NOT NULL CHECK (enabled IN (0, 1)),
    PRIMARY KEY (tenant_id, key)
  );

  CREATE TABLE tickets (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id     TEXT NOT NULL REFERENCES tenants(id),
    title         TEXT NOT NULL,
    customer_name TEXT NOT NULL,
    priority      TEXT NOT NULL CHECK (priority IN (${PRIORITIES.map((p) => `'${p}'`).join(', ')})),
    status        TEXT NOT NULL CHECK (status IN (${STATUSES.map((s) => `'${s}'`).join(', ')})),
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL
  );

  CREATE INDEX idx_tickets_tenant ON tickets (tenant_id);
`;

/**
 * Opens the database and rebuilds it from scratch with the seed data.
 * A fresh start on every run keeps demos and test runs repeatable.
 * Pass ':memory:' for an isolated in-memory database (unit tests).
 */
export function createDatabase(dbPath) {
  if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    for (const suffix of ['', '-wal', '-shm']) {
      fs.rmSync(`${dbPath}${suffix}`, { force: true });
    }
  }

  const db = new Database(dbPath);
  db.pragma('foreign_keys = ON');
  if (dbPath !== ':memory:') {
    // WAL lets the QA tools read the file while the app is writing to it.
    db.pragma('journal_mode = WAL');
  }

  db.exec(SCHEMA);
  seedDatabase(db);
  return db;
}
