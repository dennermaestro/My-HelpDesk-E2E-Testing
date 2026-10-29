import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { can, hashPassword, verifyPassword } from '../../src/auth.js';
import { SEED_USERS } from '../../src/db/seed.js';
import { startTestServer } from './helpers.js';

describe('password hashing', () => {
  it('verifies the right password and rejects a wrong one', () => {
    const stored = hashPassword('correct horse');
    assert.equal(verifyPassword('correct horse', stored), true);
    assert.equal(verifyPassword('correct hors', stored), false);
    assert.equal(verifyPassword('', stored), false);
  });

  it('uses a fresh salt each time and never keeps the plaintext', () => {
    const first = hashPassword('same password');
    const second = hashPassword('same password');
    assert.notEqual(first.salt, second.salt);
    assert.notEqual(first.hash, second.hash);
    assert.ok(!first.hash.includes('same password'));
    assert.match(first.hash, /^[0-9a-f]{128}$/);
  });

  it('is deterministic for a given salt', () => {
    assert.deepEqual(hashPassword('pw', 'abc'), hashPassword('pw', 'abc'));
  });
});

describe('role permissions', () => {
  const ALL = ['tickets:list', 'tickets:read', 'tickets:create', 'tickets:update', 'tickets:suggest-reply'];

  it('lets admin do everything', () => {
    for (const permission of ALL) assert.equal(can('admin', permission), true, permission);
  });

  it('lets support only create tickets', () => {
    for (const permission of ALL) assert.equal(can('support', permission), permission === 'tickets:create', permission);
  });

  it('denies unknown roles and permissions', () => {
    assert.equal(can('guest', 'tickets:create'), false);
    assert.equal(can(undefined, 'tickets:create'), false);
    assert.equal(can('admin', 'users:delete'), false);
  });
});

describe('auth API', () => {
  let server;

  before(async () => {
    server = await startTestServer();
  });

  after(() => server.close());

  const login = (body) => server.request('/api/login', { method: 'POST', body, user: null });

  it('stores only salted hashes for the seed users', () => {
    const rows = server.db.prepare('SELECT username, role, password_salt, password_hash FROM users ORDER BY id').all();
    assert.deepEqual(rows.map((r) => [r.username, r.role]), [['admin', 'admin'], ['support1', 'support']]);
    for (const row of rows) {
      const { password } = SEED_USERS.find((u) => u.username === row.username);
      assert.ok(!Object.values(row).includes(password));
      assert.equal(verifyPassword(password, { salt: row.password_salt, hash: row.password_hash }), true);
    }
  });

  it('POST /api/login sets an HttpOnly, SameSite=Lax session cookie', async () => {
    const res = await login({ username: 'admin', password: SEED_USERS[0].password });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { username: 'admin', role: 'admin' });
    const cookie = res.headers.get('set-cookie');
    assert.match(cookie, /^multidesk_session=[0-9a-f]{64};/);
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Lax/);
  });

  it('POST /api/login answers 401 with the same message for a wrong password or unknown user', async () => {
    for (const body of [{ username: 'admin', password: 'nope' }, { username: 'ghost', password: 'nope' }, {}]) {
      const res = await login(body);
      assert.equal(res.status, 401);
      assert.equal(res.body.error.message, 'Invalid username or password');
      assert.equal(res.headers.get('set-cookie'), null);
    }
  });

  it('GET /api/me returns the logged-in user', async () => {
    const res = await server.request('/api/me', { user: 'support1' });
    assert.deepEqual(res.body, { username: 'support1', role: 'support' });
  });

  it('requires a session on every route except health and login', async () => {
    for (const path of ['/api/me', '/api/tenants', '/api/tickets', '/api/tenants/acme/settings', '/api/unknown']) {
      const res = await server.request(path, { tenant: 'acme', user: null });
      assert.equal(res.status, 401, path);
      assert.equal(res.body.error.code, 'AUTH_REQUIRED');
    }
    assert.equal((await server.request('/api/health', { user: null })).status, 200);
  });

  it('rejects a made-up session cookie', async () => {
    const res = await fetch(`${server.baseUrl}/api/me`, { headers: { Cookie: 'multidesk_session=forged' } });
    assert.equal(res.status, 401);
  });

  it('POST /api/logout ends the session', async () => {
    const { headers } = await login({ username: 'admin', password: SEED_USERS[0].password });
    const cookie = headers.get('set-cookie').split(';')[0];
    const out = await fetch(`${server.baseUrl}/api/logout`, { method: 'POST', headers: { Cookie: cookie } });
    assert.equal(out.status, 204);
    assert.match(out.headers.get('set-cookie'), /Max-Age=0/);
    const me = await fetch(`${server.baseUrl}/api/me`, { headers: { Cookie: cookie } });
    assert.equal(me.status, 401);
  });

  describe('support1', () => {
    const as = (path, options = {}) => server.request(path, { tenant: 'globex', user: 'support1', ...options });

    it('can create a ticket and read tenant settings', async () => {
      const created = await as('/api/tickets', { method: 'POST', body: { title: 'Printer jam', customer_name: 'Jane Doe' } });
      assert.equal(created.status, 201);
      assert.equal(created.body.tenant_id, 'globex');
      assert.equal((await as('/api/tenants/globex/settings')).status, 200);
    });

    it('gets 403 on listing, reading, updating and reply suggestions', async () => {
      const denied = [
        await as('/api/tickets'),
        await as('/api/tickets/6'),
        await as('/api/tickets/6', { method: 'PATCH', body: { status: 'resolved' } }),
        await as('/api/tickets/6/suggest-reply', { method: 'POST' }),
      ];
      for (const res of denied) {
        assert.equal(res.status, 403);
        assert.equal(res.body.error.code, 'FORBIDDEN');
      }
      assert.equal(server.db.prepare('SELECT status FROM tickets WHERE id = 6').get().status, 'open');
    });
  });
});
