import express from 'express';
import {
  authenticate,
  clearedSessionCookie,
  createSessionStore,
  readSessionToken,
  requirePermission,
  requireSession,
  sessionCookie,
} from './auth.js';
import { forbidden, invalidCredentials } from './errors.js';
import { createRepository } from './db/repository.js';
import { apiNotFound, errorHandler, requireTenant } from './middleware.js';
import { createReplyAssistant } from './services/replyAssistant.js';
import { createTicketService } from './services/ticketService.js';

/**
 * Builds the Express app. Dependencies are passed in so tests can use
 * an in-memory database and a fixed clock.
 */
export function createApp({ db, demoDefects = false, publicDir, now }) {
  const repository = createRepository(db);
  const tickets = createTicketService({ repository, demoDefects, now });
  const assistant = createReplyAssistant({ demoDefects, now });
  const sessions = createSessionStore();

  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '10kb' }));

  const api = express.Router();

  api.get('/health', (req, res) => {
    res.json({ status: 'ok', demo_defects: demoDefects });
  });

  api.post('/login', (req, res) => {
    const user = authenticate(repository, req.body?.username, req.body?.password);
    if (!user) {
      throw invalidCredentials();
    }
    res.set('Set-Cookie', sessionCookie(sessions.create(user)));
    res.json(user);
  });

  // Everything below needs a logged-in user.
  api.use(requireSession(sessions));

  api.post('/logout', (req, res) => {
    sessions.delete(readSessionToken(req));
    res.set('Set-Cookie', clearedSessionCookie());
    res.status(204).end();
  });

  api.get('/me', (req, res) => {
    res.json(req.user);
  });

  api.get('/tenants', (req, res) => {
    res.json(repository.listTenants());
  });

  const tenantScoped = requireTenant(repository);
  api.use('/tickets', tenantScoped);

  api.get('/tenants/:id/settings', tenantScoped, (req, res) => {
    if (req.params.id !== req.tenant.id) {
      throw forbidden('A tenant can only read its own settings');
    }
    res.json({ tenant_id: req.tenant.id, settings: repository.getSettings(req.tenant.id) });
  });

  api.get('/tickets', requirePermission('tickets:list'), (req, res) => {
    res.json(tickets.listTickets(req.tenant.id, req.query));
  });

  api.get('/tickets/:id', requirePermission('tickets:read'), (req, res) => {
    res.json(tickets.getTicket(req.tenant.id, req.params.id));
  });

  api.post('/tickets', requirePermission('tickets:create'), (req, res) => {
    res.status(201).json(tickets.createTicket(req.tenant.id, req.body));
  });

  api.patch('/tickets/:id', requirePermission('tickets:update'), (req, res) => {
    res.json(tickets.updateTicket(req.tenant.id, req.params.id, req.body));
  });

  api.post('/tickets/:id/suggest-reply', requirePermission('tickets:suggest-reply'), (req, res) => {
    const ticket = tickets.getTicket(req.tenant.id, req.params.id);
    res.json(assistant.suggestReply(ticket));
  });

  api.use(apiNotFound);

  app.use('/api', api);
  if (publicDir) {
    app.use(express.static(publicDir));
  }
  app.use(errorHandler);

  return app;
}
