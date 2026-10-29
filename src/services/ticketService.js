import { PRIORITIES, STATUSES } from '../db/database.js';
import { badRequest, notFound } from '../errors.js';

export const URGENT_FLAG = 'urgent_priority';

const TITLE_LENGTH = { min: 3, max: 120 };
const CUSTOMER_LENGTH = { min: 2, max: 80 };

/**
 * Business rules for tickets.
 *
 * `demoDefects` turns on the planted defect used in the QA demo:
 * when a tenant without the urgent flag sends priority "urgent",
 * the ticket is silently stored as "normal" while the API still answers "urgent".
 * With `demoDefects` off, the same request is rejected with a clear 400.
 */
export function createTicketService({ repository, demoDefects = false, now = () => new Date() }) {
  function resolvePriority(tenantId, requested) {
    if (requested !== 'urgent' || repository.isFeatureEnabled(tenantId, URGENT_FLAG)) {
      return requested;
    }
    if (demoDefects) {
      return 'normal';
    }
    throw badRequest('Priority "urgent" is not enabled for this tenant', { field: 'priority' });
  }

  function getTicket(tenantId, id) {
    const ticket = repository.findTicket(tenantId, parseTicketId(id));
    if (!ticket) {
      throw notFound(`Ticket ${id} not found`);
    }
    return ticket;
  }

  return {
    listTickets(tenantId, query = {}) {
      const filters = {
        status: optionalEnum(query.status, STATUSES, 'status'),
        priority: optionalEnum(query.priority, PRIORITIES, 'priority'),
      };
      return repository.listTickets(tenantId, filters);
    },

    getTicket,

    createTicket(tenantId, input) {
      const body = requireObject(input);
      const requestedPriority = optionalEnum(body.priority, PRIORITIES, 'priority') ?? 'normal';
      const timestamp = now().toISOString();

      const stored = repository.insertTicket({
        tenant_id: tenantId,
        title: requireText(body.title, 'title', TITLE_LENGTH),
        customer_name: requireText(body.customer_name, 'customer_name', CUSTOMER_LENGTH),
        priority: resolvePriority(tenantId, requestedPriority),
        status: 'open',
        created_at: timestamp,
        updated_at: timestamp,
      });

      // Planted defect: answer with what was requested instead of what was stored.
      return demoDefects ? { ...stored, priority: requestedPriority } : stored;
    },

    updateTicket(tenantId, id, input) {
      const body = requireObject(input);
      const current = getTicket(tenantId, id);
      const priority = optionalEnum(body.priority, PRIORITIES, 'priority');
      const status = optionalEnum(body.status, STATUSES, 'status');

      if (priority === undefined && status === undefined) {
        throw badRequest('Send at least one of: priority, status');
      }

      return repository.updateTicket({
        ...current,
        priority: priority === undefined ? current.priority : resolvePriority(tenantId, priority),
        status: status ?? current.status,
        updated_at: now().toISOString(),
      });
    },
  };
}

export function parseTicketId(value) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) {
    throw badRequest(`Invalid ticket id "${value}"`, { field: 'id' });
  }
  return id;
}

function requireObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw badRequest('Request body must be a JSON object');
  }
  return value;
}

function requireText(value, field, { min, max }) {
  if (typeof value !== 'string') {
    throw badRequest(`"${field}" is required and must be a string`, { field });
  }
  const text = value.trim();
  if (text.length < min || text.length > max) {
    throw badRequest(`"${field}" must be between ${min} and ${max} characters`, { field });
  }
  return text;
}

function optionalEnum(value, allowed, field) {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  if (!allowed.includes(value)) {
    throw badRequest(`"${field}" must be one of: ${allowed.join(', ')}`, { field });
  }
  return value;
}
