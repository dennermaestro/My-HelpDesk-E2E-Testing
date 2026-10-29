// Regression for changing an existing ticket's priority to "urgent".
// A client without the flag must get a clear error, and the stored priority must not change.
import { expect, getSettings, readTicketFromDb, TENANTS, test, uniqueTitle } from './support.js';

for (const tenant of TENANTS) {
  test.describe(`urgent priority update for ${tenant}`, () => {
    test('API and database agree with the tenant flag', async ({ request }) => {
      const headers = { 'X-Tenant': tenant };
      const { urgent_priority: urgentEnabled } = await getSettings(request, tenant);

      const created = await request.post('/api/tickets', {
        headers,
        data: { title: uniqueTitle('Export is slow'), customer_name: 'Jane Doe', priority: 'low' },
      });
      expect(created.status()).toBe(201);
      const { id } = await created.json();

      const response = await request.patch(`/api/tickets/${id}`, { headers, data: { priority: 'urgent' } });

      if (urgentEnabled) {
        expect(response.status()).toBe(200);
        expect((await response.json()).priority).toBe('urgent');
        expect(readTicketFromDb(id).priority).toBe('urgent');
        return;
      }

      expect(response.status(), 'API accepted "urgent" for a client without the flag').toBe(400);
      expect(readTicketFromDb(id).priority, 'stored priority changed after a rejected update').toBe('low');
    });
  });
}
