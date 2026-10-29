import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { apiRequest, assertReadOnlySql, getTenantConfig, MAX_ROWS, runDbQuery } from '../../mcp/qaTools.js';
import { createDatabase } from '../../src/db/database.js';
import { startTestServer } from './helpers.js';

describe('qa-tools: assertReadOnlySql', () => {
  const allowed = [
    'SELECT * FROM tickets',
    'select id from tickets;',
    'WITH t AS (SELECT * FROM tickets) SELECT COUNT(*) FROM t',
    'SELECT created_at, updated_at FROM tickets',
  ];
  for (const sql of allowed) {
    it(`allows: ${sql}`, () => assert.doesNotThrow(() => assertReadOnlySql(sql)));
  }

  const blocked = [
    ['', /non-empty/],
    ['DELETE FROM tickets', /Only SELECT/],
    ['UPDATE tickets SET priority = \'low\'', /Only SELECT/],
    ['SELECT 1; DROP TABLE tickets', /one statement/],
    ['SELECT * FROM tickets -- comment', /comments/],
    ['SELECT * FROM tickets /* x */', /comments/],
    ['WITH x AS (SELECT 1) DELETE FROM tickets', /not allowed/],
    ['PRAGMA table_info(tickets)', /Only SELECT/],
    ['SELECT * FROM pragma_table_info(\'tickets\') WHERE 1 = 1 AND ATTACH', /not allowed/],
  ];
  for (const [sql, pattern] of blocked) {
    it(`blocks: ${sql || '(empty)'}`, () => assert.throws(() => assertReadOnlySql(sql), pattern));
  }
});

describe('qa-tools: database tools', () => {
  let dir;
  let dbPath;

  before(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'multidesk-'));
    dbPath = path.join(dir, 'helpdesk.db');
    createDatabase(dbPath).close();
  });

  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('runs a parameterized SELECT', () => {
    const result = runDbQuery(dbPath, 'SELECT COUNT(*) AS n FROM tickets WHERE tenant_id = ?', ['globex']);
    assert.deepEqual(result.rows, [{ n: 5 }]);
  });

  it(`caps results at ${MAX_ROWS} rows`, () => {
    const sql = 'WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM n WHERE x < 250) SELECT x FROM n';
    const result = runDbQuery(dbPath, sql);
    assert.equal(result.rowCount, 250);
    assert.equal(result.rows.length, MAX_ROWS);
    assert.equal(result.truncated, true);
  });

  it('explains when the database does not exist yet', () => {
    assert.throws(() => runDbQuery(path.join(dir, 'missing.db'), 'SELECT 1'), /Start the app first/);
  });

  it('lists every tenant with its flags', () => {
    const tenants = getTenantConfig(dbPath);
    assert.deepEqual(
      tenants.map((t) => [t.id, t.settings.urgent_priority]),
      [['acme', true], ['globex', false]],
    );
  });

  it('rejects an unknown tenant', () => {
    assert.throws(() => getTenantConfig(dbPath, 'initech'), /Unknown tenant/);
  });
});

describe('qa-tools: apiRequest', () => {
  let server;
  let baseUrl;

  before(async () => {
    server = await startTestServer();
    baseUrl = server.baseUrl;
  });

  after(() => server.close());

  it('calls the API as a tenant', async () => {
    const res = await apiRequest(baseUrl, { path: '/api/tickets', tenant: 'acme' });
    assert.equal(res.status, 200);
    assert.ok(res.body.every((t) => t.tenant_id === 'acme'));
  });

  it('rejects paths outside the API', async () => {
    await assert.rejects(apiRequest(baseUrl, { path: '/index.html' }), /must start with \/api\//);
  });

  it('rejects unsupported methods', async () => {
    await assert.rejects(apiRequest(baseUrl, { method: 'DELETE', path: '/api/tickets/1' }), /Method must be/);
  });

  it('explains when the app is not running', async () => {
    await assert.rejects(apiRequest('http://127.0.0.1:1', { path: '/api/health' }), /Is the app running/);
  });
});
