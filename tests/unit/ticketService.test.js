import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { createDatabase } from '../../src/db/database.js';
import { createRepository } from '../../src/db/repository.js';
import { HttpError } from '../../src/errors.js';
import { createTicketService, parseTicketId } from '../../src/services/ticketService.js';
import { FIXED_NOW } from './helpers.js';

const validInput = { title: 'Printer is on fire', customer_name: 'Jane Doe' };

function assertHttpError(fn, status, messagePattern) {
  assert.throws(fn, (error) => {
    assert.ok(error instanceof HttpError, `expected HttpError, got ${error}`);
    assert.equal(error.status, status);
    if (messagePattern) assert.match(error.message, messagePattern);
    return true;
  });
}

describe('ticketService', () => {
  let db;
  let service;

  beforeEach(() => {
    db = createDatabase(':memory:');
    service = createTicketService({ repository: createRepository(db), now: () => FIXED_NOW });
  });

  describe('createTicket', () => {
    it('creates an open ticket with normal priority by default', () => {
      const ticket = service.createTicket('acme', validInput);
      assert.equal(ticket.tenant_id, 'acme');
      assert.equal(ticket.priority, 'normal');
      assert.equal(ticket.status, 'open');
      assert.equal(ticket.created_at, FIXED_NOW.toISOString());
    });

    it('trims title and customer name', () => {
      const ticket = service.createTicket('acme', { title: '  Spaced title  ', customer_name: '  Jane  ' });
      assert.equal(ticket.title, 'Spaced title');
      assert.equal(ticket.customer_name, 'Jane');
    });

    it('stores urgent priority for a tenant with the urgent flag', () => {
      const ticket = service.createTicket('acme', { ...validInput, priority: 'urgent' });
      assert.equal(ticket.priority, 'urgent');
      assert.equal(db.prepare('SELECT priority FROM tickets WHERE id = ?').get(ticket.id).priority, 'urgent');
    });

    it('rejects urgent priority for a tenant without the urgent flag', () => {
      assertHttpError(() => service.createTicket('globex', { ...validInput, priority: 'urgent' }), 400, /not enabled/);
    });

    it('does not store anything when validation fails', () => {
      const before = db.prepare('SELECT COUNT(*) AS n FROM tickets').get().n;
      assert.throws(() => service.createTicket('globex', { ...validInput, priority: 'urgent' }));
      assert.equal(db.prepare('SELECT COUNT(*) AS n FROM tickets').get().n, before);
    });

    const invalidBodies = [
      ['a missing body', undefined, /JSON object/],
      ['an array body', [], /JSON object/],
      ['a missing title', { customer_name: 'Jane' }, /"title" is required/],
      ['a numeric title', { title: 42, customer_name: 'Jane' }, /"title" is required/],
      ['a title too short after trim', { title: '  ab  ', customer_name: 'Jane' }, /between 3 and 120/],
      ['a title too long', { title: 'x'.repeat(121), customer_name: 'Jane' }, /between 3 and 120/],
      ['a customer name too short', { title: 'Valid title', customer_name: 'J' }, /between 2 and 80/],
      ['an unknown priority', { ...validInput, priority: 'critical' }, /must be one of/],
    ];
    for (const [name, body, pattern] of invalidBodies) {
      it(`rejects ${name}`, () => assertHttpError(() => service.createTicket('acme', body), 400, pattern));
    }

    it('accepts boundary lengths', () => {
      const ticket = service.createTicket('acme', { title: 'x'.repeat(120), customer_name: 'Jo' });
      assert.equal(ticket.title.length, 120);
    });
  });

  describe('listTickets', () => {
    it('only returns tickets of the given tenant, newest first', () => {
      const tickets = service.listTickets('globex');
      assert.equal(tickets.length, 5);
      assert.ok(tickets.every((t) => t.tenant_id === 'globex'));
      assert.deepEqual(tickets.map((t) => t.id), [...tickets.map((t) => t.id)].sort((a, b) => b - a));
    });

    it('filters by status and priority', () => {
      assert.ok(service.listTickets('acme', { status: 'open' }).every((t) => t.status === 'open'));
      assert.deepEqual(service.listTickets('acme', { priority: 'urgent' }).map((t) => t.priority), ['urgent']);
    });

    it('rejects an unknown filter value', () => {
      assertHttpError(() => service.listTickets('acme', { status: 'closed' }), 400);
    });
  });

  describe('getTicket', () => {
    it('does not return another tenant\'s ticket', () => {
      const acmeTicket = service.listTickets('acme')[0];
      assertHttpError(() => service.getTicket('globex', acmeTicket.id), 404);
    });
  });

  describe('updateTicket', () => {
    it('updates the status and the updated_at timestamp', () => {
      const [ticket] = service.listTickets('acme', { status: 'open' });
      const updated = service.updateTicket('acme', ticket.id, { status: 'resolved' });
      assert.equal(updated.status, 'resolved');
      assert.equal(updated.priority, ticket.priority);
      assert.equal(updated.updated_at, FIXED_NOW.toISOString());
    });

    it('rejects an empty update', () => {
      const [ticket] = service.listTickets('acme');
      assertHttpError(() => service.updateTicket('acme', ticket.id, {}), 400, /at least one/);
    });

    it('applies the urgent flag rule on updates too', () => {
      const [ticket] = service.listTickets('globex');
      assertHttpError(() => service.updateTicket('globex', ticket.id, { priority: 'urgent' }), 400, /not enabled/);
    });

    it('returns 404 for a missing ticket', () => {
      assertHttpError(() => service.updateTicket('acme', 9999, { status: 'open' }), 404);
    });
  });

  describe('parseTicketId', () => {
    it('accepts positive integers', () => assert.equal(parseTicketId('12'), 12));
    for (const value of ['0', '-1', '1.5', 'abc', '']) {
      it(`rejects "${value}"`, () => assertHttpError(() => parseTicketId(value), 400));
    }
  });
});
