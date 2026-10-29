import { hashPassword } from '../auth.js';

// All names below are fictional and exist only for this demo.

export const SEED_TENANTS = [
  { id: 'acme', name: 'Acme Corp', plan: 'pro' },
  { id: 'globex', name: 'Globex Inc', plan: 'starter' },
];

export const SEED_SETTINGS = [
  // The new "urgent" priority was only rolled out to the main client.
  { tenant_id: 'acme', key: 'urgent_priority', enabled: 1 },
  { tenant_id: 'globex', key: 'urgent_priority', enabled: 0 },
  { tenant_id: 'acme', key: 'ai_reply_suggestions', enabled: 1 },
  { tenant_id: 'globex', key: 'ai_reply_suggestions', enabled: 1 },
];

export const SEED_TICKETS = [
  { tenant_id: 'acme', title: 'Cannot reset my password', customer_name: 'Maria Silva', priority: 'high', status: 'open' },
  { tenant_id: 'acme', title: 'Invoice shows the wrong address', customer_name: 'John Carter', priority: 'normal', status: 'in_progress' },
  { tenant_id: 'acme', title: 'Export to CSV is slow', customer_name: 'Ana Souza', priority: 'low', status: 'open' },
  { tenant_id: 'acme', title: 'Checkout page returns an error', customer_name: 'Peter Wong', priority: 'urgent', status: 'open' },
  { tenant_id: 'acme', title: 'How do I add a new user?', customer_name: 'Lucas Lima', priority: 'low', status: 'resolved' },
  { tenant_id: 'globex', title: 'App crashes when uploading a photo', customer_name: 'Emma Brown', priority: 'high', status: 'open' },
  { tenant_id: 'globex', title: 'Wrong currency on the receipt', customer_name: 'Rafael Costa', priority: 'normal', status: 'open' },
  { tenant_id: 'globex', title: 'Request to delete my account', customer_name: 'Olivia Green', priority: 'normal', status: 'in_progress' },
  { tenant_id: 'globex', title: 'Notifications arrive twice', customer_name: 'Bruno Alves', priority: 'low', status: 'open' },
  { tenant_id: 'globex', title: 'Login page is blank on Safari', customer_name: 'Sophie Martin', priority: 'high', status: 'resolved' },
];

// Development-only logins for this local demo (documented in README.md). Only scrypt hashes are stored.
export const SEED_USERS = [
  { username: 'admin', role: 'admin', password: 'admin-dev-2026' },
  { username: 'support1', role: 'support', password: 'support1-dev-2026' },
];

const SEED_TIMESTAMP = '2026-10-01T09:00:00.000Z';

export function seedDatabase(db) {
  const insertTenant = db.prepare('INSERT INTO tenants (id, name, plan) VALUES (@id, @name, @plan)');
  const insertSetting = db.prepare(
    'INSERT INTO tenant_settings (tenant_id, key, enabled) VALUES (@tenant_id, @key, @enabled)',
  );
  const insertTicket = db.prepare(`
    INSERT INTO tickets (tenant_id, title, customer_name, priority, status, created_at, updated_at)
    VALUES (@tenant_id, @title, @customer_name, @priority, @status, @created_at, @updated_at)
  `);

  const insertUser = db.prepare(`
    INSERT INTO users (username, role, password_salt, password_hash)
    VALUES (@username, @role, @salt, @hash)
  `);
  const users = SEED_USERS.map(({ username, role, password }) => ({ username, role, ...hashPassword(password) }));

  db.transaction(() => {
    SEED_TENANTS.forEach((tenant) => insertTenant.run(tenant));
    SEED_SETTINGS.forEach((setting) => insertSetting.run(setting));
    SEED_TICKETS.forEach((ticket) =>
      insertTicket.run({ ...ticket, created_at: SEED_TIMESTAMP, updated_at: SEED_TIMESTAMP }),
    );
    users.forEach((user) => insertUser.run(user));
  })();
}
