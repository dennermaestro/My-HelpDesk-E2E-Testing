import { createApp } from '../../src/app.js';
import { createDatabase } from '../../src/db/database.js';

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

  async function request(path, { method = 'GET', tenant, body, rawBody } = {}) {
    const headers = {};
    if (tenant) headers['X-Tenant'] = tenant;
    if (body !== undefined || rawBody !== undefined) headers['Content-Type'] = 'application/json';
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: rawBody ?? (body === undefined ? undefined : JSON.stringify(body)),
    });
    return { status: response.status, body: await response.json() };
  }

  async function close() {
    await new Promise((resolve) => server.close(resolve));
    db.close();
  }

  return { db, baseUrl, request, close };
}
