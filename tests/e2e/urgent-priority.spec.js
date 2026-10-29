// Regression for the "urgent priority" rollout.
// It checks every client, not just the main one, across UI, API and database.
import { createTicketViaUi, expect, getSettings, openApp, readTicketFromDb, TENANTS, test, ticketCard, uniqueTitle } from './support.js';

for (const tenant of TENANTS) {
  test.describe(`urgent priority for ${tenant}`, () => {
    test('UI, API and database agree with the tenant flag', async ({ page, request }) => {
      const { urgent_priority: urgentEnabled } = await getSettings(request, tenant);
      await openApp(page, tenant);

      if (urgentEnabled) {
        const title = uniqueTitle('Checkout is down');
        await createTicketViaUi(page, { title, priority: 'urgent' });
        await expect(ticketCard(page, title).getByTestId('priority-badge')).toHaveText('Urgent');

        const id = Number((await ticketCard(page, title).getAttribute('data-ticket-id')) ?? NaN);
        const api = await request.get(`/api/tickets/${id}`, { headers: { 'X-Tenant': tenant } });
        expect((await api.json()).priority).toBe('urgent');
        expect(readTicketFromDb(id).priority).toBe('urgent');
        return;
      }

      // UI: a client without the flag must not be offered "Urgent".
      const offered = await page
        .getByTestId('ticket-priority')
        .evaluate((select) => [...select.options].filter((o) => !o.disabled && !o.hidden).map((o) => o.value));
      expect(offered, 'UI offers "Urgent" to a client without the flag').not.toContain('urgent');

      // API: asking for it anyway must fail loudly, never be downgraded in silence.
      const response = await request.post('/api/tickets', {
        headers: { 'X-Tenant': tenant },
        data: { title: uniqueTitle('Checkout is down'), customer_name: 'Jane Doe', priority: 'urgent' },
      });
      expect(response.status(), 'API accepted "urgent" for a client without the flag').toBe(400);
    });
  });
}
