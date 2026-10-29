// Login and role permissions, for every client.
// admin can do everything; support1 can only create tickets. The server must enforce it, not just the UI.
import { createTicketViaUi, credentialsFor, expect, loginViaUi, readTicketFromDb, TENANTS, test, ticketCard, uniqueTitle } from './support.js';

const INVALID_LOGIN = 'Invalid username or password';

async function openLogin(page, tenant) {
  await page.goto(`/?tenant=${tenant}`);
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'true');
  await expect(page.getByTestId('login-form')).toBeVisible();
}

async function waitForPanel(page, tenant) {
  await expect(page.getByTestId('app-view')).toBeVisible();
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'true');
  await expect(page.getByTestId('tenant-select')).toHaveValue(tenant);
}

for (const tenant of TENANTS) {
  test.describe(`login and roles for ${tenant}`, () => {
    test.use({ loginAs: null });

    test('an anonymous visitor sees the login page and the API answers 401', async ({ page, request }) => {
      await openLogin(page, tenant);
      await expect(page.getByTestId('app-view')).toBeHidden();
      await expect(page.getByTestId('ticket-list')).toBeHidden();

      const response = await request.get('/api/tickets', { headers: { 'X-Tenant': tenant } });
      expect(response.status()).toBe(401);
      expect((await response.json()).error.code).toBe('AUTH_REQUIRED');
    });

    test('a wrong password shows an error and no panel', async ({ page, request }) => {
      await openLogin(page, tenant);
      await loginViaUi(page, { username: 'admin', password: 'wrong-password' });

      await expect(page.getByTestId('login-error')).toHaveText(INVALID_LOGIN);
      await expect(page.getByTestId('app-view')).toBeHidden();

      const response = await request.post('/api/login', { data: { username: 'admin', password: 'wrong-password' } });
      expect(response.status()).toBe(401);
      expect((await response.json()).error.message).toBe(INVALID_LOGIN);
      expect(response.headers()['set-cookie']).toBeUndefined();
    });

    test('admin sees the ticket list, can create a ticket and log out', async ({ page }) => {
      await openLogin(page, tenant);
      await loginViaUi(page, credentialsFor('admin'));
      await waitForPanel(page, tenant);
      await expect(page.getByTestId('current-user')).toHaveText('admin (admin)');
      await expect(page.getByTestId('ticket-item').first()).toBeVisible();

      const title = uniqueTitle('Admin ticket');
      await createTicketViaUi(page, { title });
      await expect(page.getByTestId('message')).toHaveText(/created with priority Normal/);
      const id = Number(await ticketCard(page, title).getAttribute('data-ticket-id'));

      const api = await page.request.get(`/api/tickets/${id}`, { headers: { 'X-Tenant': tenant } });
      expect(api.status()).toBe(200);
      expect((await api.json()).title).toBe(title);
      expect(readTicketFromDb(id)).toMatchObject({ tenant_id: tenant, title });

      await page.getByTestId('logout-button').click();
      await expect(page.getByTestId('login-form')).toBeVisible();
      const me = await page.request.get('/api/me');
      expect(me.status()).toBe(401);
    });

    test('support1 can only create tickets', async ({ page }) => {
      const headers = { 'X-Tenant': tenant };
      await openLogin(page, tenant);
      await loginViaUi(page, credentialsFor('support1'));
      await waitForPanel(page, tenant);
      await expect(page.getByTestId('current-user')).toHaveText('support1 (support)');

      // UI: the form is there, the ticket list is not.
      await expect(page.getByTestId('ticket-form')).toBeVisible();
      await expect(page.getByTestId('ticket-list')).toHaveCount(0);
      await expect(page.getByTestId('ticket-item')).toHaveCount(0);

      const title = uniqueTitle('Support ticket');
      await createTicketViaUi(page, { title, customer: 'Jane Doe' });
      const message = page.getByTestId('message');
      await expect(message).toHaveText(/^Ticket #\d+ created\.$/);
      const uiId = Number((await message.textContent()).match(/#(\d+)/)[1]);
      expect(readTicketFromDb(uiId)).toMatchObject({ tenant_id: tenant, title, customer_name: 'Jane Doe' });

      // API: page.request carries support1's session cookie from the UI login.
      const created = await page.request.post('/api/tickets', {
        headers,
        data: { title: uniqueTitle('Support API ticket'), customer_name: 'Jane Doe', priority: 'low' },
      });
      expect(created.status()).toBe(201);
      const { id, title: apiTitle } = await created.json();
      expect(readTicketFromDb(id)).toMatchObject({ tenant_id: tenant, title: apiTitle, priority: 'low', status: 'open' });

      const denied = [
        await page.request.get('/api/tickets', { headers }),
        await page.request.get(`/api/tickets/${id}`, { headers }),
        await page.request.patch(`/api/tickets/${id}`, { headers, data: { status: 'resolved' } }),
        await page.request.post(`/api/tickets/${id}/suggest-reply`, { headers }),
      ];
      for (const response of denied) {
        expect(response.status(), `${response.url()} should be forbidden for support1`).toBe(403);
      }
      // DB: the refused PATCH left the row untouched.
      expect(readTicketFromDb(id).status).toBe('open');
    });
  });
}
