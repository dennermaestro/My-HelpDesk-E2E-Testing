import fs from 'node:fs';
import Database from 'better-sqlite3';
import { SEED_USERS } from '../src/db/seed.js';

export const MAX_ROWS = 200;
const ALLOWED_METHODS = ['GET', 'POST', 'PATCH'];
const REQUEST_TIMEOUT_MS = 5000;
const FORBIDDEN_KEYWORDS =
  /\b(insert|update|delete|drop|alter|create|replace|attach|detach|pragma|vacuum|reindex|analyze|begin|commit|rollback|savepoint|release)\b/i;

/**
 * First guard for db_query: one plain SELECT (or WITH ... SELECT), nothing else.
 * The connection is also opened read-only, so this is defense in depth, not the only lock.
 */
export function assertReadOnlySql(sql) {
  if (typeof sql !== 'string' || sql.trim() === '') {
    throw new Error('Query must be a non-empty string');
  }
  const query = sql.trim().replace(/;\s*$/, '');
  if (query.includes(';')) {
    throw new Error('Only one statement is allowed');
  }
  if (/--|\/\*/.test(query)) {
    throw new Error('SQL comments are not allowed');
  }
  if (!/^(select|with)\b/i.test(query)) {
    throw new Error('Only SELECT queries are allowed');
  }
  if (FORBIDDEN_KEYWORDS.test(query)) {
    throw new Error('Query contains a keyword that is not allowed in read-only mode');
  }
  return query;
}

function openReadOnly(dbPath) {
  if (!fs.existsSync(dbPath)) {
    throw new Error(`Database not found at ${dbPath}. Start the app first with "npm start" or "npm run demo".`);
  }
  return new Database(dbPath, { readonly: true, fileMustExist: true });
}

export function runDbQuery(dbPath, sql, params = []) {
  const query = assertReadOnlySql(sql);
  const db = openReadOnly(dbPath);
  try {
    const statement = db.prepare(query);
    if (!statement.reader) {
      throw new Error('Only queries that return rows are allowed');
    }
    const rows = statement.all(...params);
    return { rowCount: rows.length, truncated: rows.length > MAX_ROWS, rows: rows.slice(0, MAX_ROWS) };
  } finally {
    db.close();
  }
}

export function getTenantConfig(dbPath, tenantId) {
  const db = openReadOnly(dbPath);
  try {
    const tenants = tenantId
      ? db.prepare('SELECT id, name, plan FROM tenants WHERE id = ?').all(tenantId)
      : db.prepare('SELECT id, name, plan FROM tenants ORDER BY id').all();
    if (tenantId && tenants.length === 0) {
      throw new Error(`Unknown tenant "${tenantId}"`);
    }
    const settingsFor = db.prepare('SELECT key, enabled FROM tenant_settings WHERE tenant_id = ? ORDER BY key');
    return tenants.map((tenant) => ({
      ...tenant,
      settings: Object.fromEntries(settingsFor.all(tenant.id).map((s) => [s.key, s.enabled === 1])),
    }));
  } finally {
    db.close();
  }
}

async function send(url, init) {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } catch (error) {
    throw new Error(`Could not reach ${url.origin} (${error.message}). Is the app running?`, { cause: error });
  }
}

/** Logs in as one of the seed users and returns the session cookie. */
async function login(baseUrl, username) {
  const user = SEED_USERS.find((u) => u.username === username);
  if (!user) {
    throw new Error(`Unknown user "${username}". Use one of: ${SEED_USERS.map((u) => u.username).join(', ')}, anonymous`);
  }
  const response = await send(new URL('/api/login', baseUrl), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: user.username, password: user.password }),
  });
  if (!response.ok) {
    throw new Error(`Login as "${username}" failed with ${response.status}`);
  }
  return response.headers.get('set-cookie').split(';')[0];
}

/** Calls the API as a seed user (admin by default), or with no session when user is "anonymous". */
export async function apiRequest(baseUrl, { method = 'GET', path, tenant, body, user = 'admin' }) {
  const verb = method.toUpperCase();
  if (!ALLOWED_METHODS.includes(verb)) {
    throw new Error(`Method must be one of: ${ALLOWED_METHODS.join(', ')}`);
  }
  if (typeof path !== 'string' || !path.startsWith('/api/')) {
    throw new Error('Path must start with /api/');
  }

  const url = new URL(path, baseUrl);
  if (url.origin !== new URL(baseUrl).origin) {
    throw new Error('Requests are limited to the MultiDesk app');
  }

  const headers = { Accept: 'application/json' };
  if (user !== 'anonymous') headers.Cookie = await login(baseUrl, user);
  if (tenant) headers['X-Tenant'] = tenant;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const response = await send(url, {
    method: verb,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await response.text();
  let parsed;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  return { status: response.status, body: parsed };
}
