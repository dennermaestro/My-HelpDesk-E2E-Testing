// Documents the planted defects so they stay predictable for the demo.
// These tests describe the BUGGY behavior on purpose: they must only pass with DEMO_DEFECTS on.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { startTestServer } from './helpers.js';

describe('planted defect: urgent priority on a tenant without the flag', () => {
  let server;

  before(async () => {
    server = await startTestServer({ demoDefects: true });
  });

  after(() => server.close());

  it('answers 201 "urgent" but stores "normal"', async () => {
    const created = await server.request('/api/tickets', {
      method: 'POST',
      tenant: 'globex',
      body: { title: 'Payments are down', customer_name: 'Jane Doe', priority: 'urgent' },
    });
    assert.equal(created.status, 201);
    assert.equal(created.body.priority, 'urgent');

    const stored = server.db.prepare('SELECT priority FROM tickets WHERE id = ?').get(created.body.id);
    assert.equal(stored.priority, 'normal');
  });

  it('leaves tenants with the flag unaffected', async () => {
    const created = await server.request('/api/tickets', {
      method: 'POST',
      tenant: 'acme',
      body: { title: 'Payments are down', customer_name: 'Jane Doe', priority: 'urgent' },
    });
    const stored = server.db.prepare('SELECT priority FROM tickets WHERE id = ?').get(created.body.id);
    assert.equal(stored.priority, 'urgent');
  });

  it('reports the mode in the health check', async () => {
    const res = await server.request('/api/health');
    assert.equal(res.body.demo_defects, true);
  });
});
