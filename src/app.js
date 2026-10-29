import express from 'express';
import { forbidden } from './errors.js';
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

  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '10kb' }));

  const api = express.Router();

  api.get('/health', (req, res) => {
    res.json({ status: 'ok', demo_defects: demoDefects });
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

  api.get('/tickets', (req, res) => {
    res.json(tickets.listTickets(req.tenant.id, req.query));
  });

  api.get('/tickets/:id', (req, res) => {
    res.json(tickets.getTicket(req.tenant.id, req.params.id));
  });

  api.post('/tickets', (req, res) => {
    res.status(201).json(tickets.createTicket(req.tenant.id, req.body));
  });

  api.patch('/tickets/:id', (req, res) => {
    res.json(tickets.updateTicket(req.tenant.id, req.params.id, req.body));
  });

  api.post('/tickets/:id/suggest-reply', (req, res) => {
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
