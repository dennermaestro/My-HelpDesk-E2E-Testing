import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { startTestServer } from './helpers.js';

describe('REST API', () => {
  let server;

  before(async () => {
    server = await startTestServer();
  });

  after(() => server.close());

  it('GET /api/health reports status and defect mode', async () => {
    const res = await server.request('/api/health');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { status: 'ok', demo_defects: false });
  });

  it('GET /api/tenants lists tenants without a tenant header', async () => {
    const res = await server.request('/api/tenants');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.map((t) => t.id), ['acme', 'globex']);
  });

  describe('tenant header', () => {
    it('returns 401 when X-Tenant is missing', async () => {
      const res = await server.request('/api/tickets');
      assert.equal(res.status, 401);
      assert.equal(res.body.error.code, 'TENANT_REQUIRED');
    });

    it('returns 401 for an unknown tenant', async () => {
      const res = await server.request('/api/tickets', { tenant: 'initech' });
      assert.equal(res.status, 401);
    });

    it('accepts the tenant id in any case', async () => {
      const res = await server.request('/api/tickets', { tenant: 'ACME' });
      assert.equal(res.status, 200);
    });
  });

  describe('tickets', () => {
    it('lists only the tenant\'s tickets', async () => {
      const res = await server.request('/api/tickets', { tenant: 'globex' });
      assert.equal(res.status, 200);
      assert.ok(res.body.length > 0);
      assert.ok(res.body.every((t) => t.tenant_id === 'globex'));
    });

    it('creates a ticket and returns what was stored', async () => {
      const created = await server.request('/api/tickets', {
        method: 'POST',
        tenant: 'acme',
        body: { title: 'Urgent outage', customer_name: 'Jane Doe', priority: 'urgent' },
      });
      assert.equal(created.status, 201);
      assert.equal(created.body.priority, 'urgent');

      const fetched = await server.request(`/api/tickets/${created.body.id}`, { tenant: 'acme' });
      assert.deepEqual(fetched.body, created.body);
    });

    it('returns 400 with a field hint for invalid input', async () => {
      const res = await server.request('/api/tickets', { method: 'POST', tenant: 'acme', body: { customer_name: 'Jane' } });
      assert.equal(res.status, 400);
      assert.equal(res.body.error.code, 'VALIDATION_ERROR');
      assert.equal(res.body.error.details.field, 'title');
    });

    it('returns 400 when a tenant without the flag asks for urgent', async () => {
      const res = await server.request('/api/tickets', {
        method: 'POST',
        tenant: 'globex',
        body: { title: 'Need help now', customer_name: 'Jane Doe', priority: 'urgent' },
      });
      assert.equal(res.status, 400);
      assert.match(res.body.error.message, /not enabled/);
    });

    it('returns 400 for malformed JSON', async () => {
      const res = await server.request('/api/tickets', { method: 'POST', tenant: 'acme', rawBody: '{bad' });
      assert.equal(res.status, 400);
      assert.equal(res.body.error.code, 'INVALID_JSON');
    });

    it('returns 413 for an oversized body', async () => {
      const res = await server.request('/api/tickets', {
        method: 'POST',
        tenant: 'acme',
        body: { title: 'x'.repeat(20_000), customer_name: 'Jane' },
      });
      assert.equal(res.status, 413);
    });

    it('updates a ticket with PATCH', async () => {
      const res = await server.request('/api/tickets/1', { method: 'PATCH', tenant: 'acme', body: { status: 'in_progress' } });
      assert.equal(res.status, 200);
      assert.equal(res.body.status, 'in_progress');
    });

    it('returns 404 when reading another tenant\'s ticket', async () => {
      const res = await server.request('/api/tickets/1', { tenant: 'globex' });
      assert.equal(res.status, 404);
    });

    it('returns 400 for a non-numeric ticket id', async () => {
      const res = await server.request('/api/tickets/abc', { tenant: 'acme' });
      assert.equal(res.status, 400);
    });
  });

  describe('settings', () => {
    it('returns the tenant\'s feature flags', async () => {
      const res = await server.request('/api/tenants/globex/settings', { tenant: 'globex' });
      assert.equal(res.status, 200);
      assert.deepEqual(res.body.settings, { ai_reply_suggestions: true, urgent_priority: false });
    });

    it('returns 403 for another tenant\'s settings', async () => {
      const res = await server.request('/api/tenants/acme/settings', { tenant: 'globex' });
      assert.equal(res.status, 403);
    });
  });

  it('POST /api/tickets/:id/suggest-reply returns a reply for the ticket', async () => {
    const res = await server.request('/api/tickets/1/suggest-reply', { method: 'POST', tenant: 'acme' });
    assert.equal(res.status, 200);
    assert.equal(res.body.ticket_id, 1);
    assert.match(res.body.reply, /#1\b/);
  });

  it('returns a JSON 404 for unknown API routes', async () => {
    const res = await server.request('/api/unknown');
    assert.equal(res.status, 404);
    assert.equal(res.body.error.code, 'NOT_FOUND');
  });
});
