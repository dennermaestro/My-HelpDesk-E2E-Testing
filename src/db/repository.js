/**
 * Data access for tenants, settings, tickets and users.
 * Every ticket query is scoped by tenant, so one client can never read another client's data.
 */
export function createRepository(db) {
  const statements = {
    findTenant: db.prepare('SELECT id, name, plan FROM tenants WHERE id = ?'),
    listTenants: db.prepare('SELECT id, name, plan FROM tenants ORDER BY name'),
    listSettings: db.prepare('SELECT key, enabled FROM tenant_settings WHERE tenant_id = ? ORDER BY key'),
    findSetting: db.prepare('SELECT enabled FROM tenant_settings WHERE tenant_id = ? AND key = ?'),
    findTicket: db.prepare('SELECT * FROM tickets WHERE tenant_id = ? AND id = ?'),
    findUser: db.prepare('SELECT username, role, password_salt AS salt, password_hash AS hash FROM users WHERE username = ?'),
    insertTicket: db.prepare(`
      INSERT INTO tickets (tenant_id, title, customer_name, priority, status, created_at, updated_at)
      VALUES (@tenant_id, @title, @customer_name, @priority, @status, @created_at, @updated_at)
    `),
    updateTicket: db.prepare(`
      UPDATE tickets SET priority = @priority, status = @status, updated_at = @updated_at
      WHERE tenant_id = @tenant_id AND id = @id
    `),
  };

  return {
    findTenant: (tenantId) => statements.findTenant.get(tenantId),

    listTenants: () => statements.listTenants.all(),

    getSettings(tenantId) {
      return Object.fromEntries(
        statements.listSettings.all(tenantId).map(({ key, enabled }) => [key, enabled === 1]),
      );
    },

    isFeatureEnabled: (tenantId, key) => statements.findSetting.get(tenantId, key)?.enabled === 1,

    listTickets(tenantId, { status, priority } = {}) {
      const conditions = ['tenant_id = @tenantId'];
      if (status) conditions.push('status = @status');
      if (priority) conditions.push('priority = @priority');
      return db
        .prepare(`SELECT * FROM tickets WHERE ${conditions.join(' AND ')} ORDER BY id DESC`)
        .all({ tenantId, status, priority });
    },

    findTicket: (tenantId, id) => statements.findTicket.get(tenantId, id),

    insertTicket(ticket) {
      const { lastInsertRowid } = statements.insertTicket.run(ticket);
      return statements.findTicket.get(ticket.tenant_id, lastInsertRowid);
    },

    findUser: (username) => statements.findUser.get(username),

    updateTicket(ticket) {
      statements.updateTicket.run(ticket);
      return statements.findTicket.get(ticket.tenant_id, ticket.id);
    },
  };
}
