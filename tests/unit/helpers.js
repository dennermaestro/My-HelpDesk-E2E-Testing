import { createApp } from '../../src/app.js';
import { createDatabase } from '../../src/db/database.js';
import { SEED_USERS } from '../../src/db/seed.js';

export const FIXED_NOW = new Date('2026-10-29T12:00:00.000Z');

/**
 * Starts the app on a random free port with a fresh in-memory database.
 * Each test file gets full isolation and nothing touches the real data folder.
 */
export async function startTestServer({ demoDefects = false } = {}) {
  const db = createDatabase(':memory:');
  const app = createApp({ db, demoDefects, now: () => FIXED_NOW });

  const server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const cookies = new Map();

  /** Logs in once per seed user and keeps the session cookie for later requests. */
  async function sessionCookie(username) {
    if (!cookies.has(username)) {
      const { password } = SEED_USERS.find((u) => u.username === username);
      const response = await fetch(`${baseUrl}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      cookies.set(username, response.headers.get('set-cookie').split(';')[0]);
    }
    return cookies.get(username);
  }

  // Requests run as admin unless told otherwise; `user: null` sends no session at all.
  async function request(path, { method = 'GET', tenant, body, rawBody, user = 'admin' } = {}) {
    const headers = {};
    if (user) headers.Cookie = await sessionCookie(user);
    if (tenant) headers['X-Tenant'] = tenant;
    if (body !== undefined || rawBody !== undefined) headers['Content-Type'] = 'application/json';
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: rawBody ?? (body === undefined ? undefined : JSON.stringify(body)),
    });
    const text = await response.text();
    return { status: response.status, headers: response.headers, body: text ? JSON.parse(text) : null };
  }

  async function close() {
    await new Promise((resolve) => server.close(resolve));
    db.close();
  }

  return { db, baseUrl, request, sessionCookie, close };
}
