import { expect, test } from '@playwright/test';
import { createTicketViaUi, openApp, ticketCard, uniqueTitle } from './support.js';

test.describe('ticket workflow', () => {
  test('shows only the selected client\'s tickets', async ({ page }) => {
    await openApp(page, 'acme');
    await expect(ticketCard(page, 'Cannot reset my password')).toBeVisible();
    await expect(ticketCard(page, 'App crashes when uploading a photo')).toHaveCount(0);

    await page.getByTestId('tenant-select').selectOption('globex');
    await expect(ticketCard(page, 'App crashes when uploading a photo')).toBeVisible();
    await expect(ticketCard(page, 'Cannot reset my password')).toHaveCount(0);
    await expect(page).toHaveURL(/tenant=globex/);
  });

  test('creates a ticket with priority and status badges', async ({ page }) => {
    const title = uniqueTitle('Broken invoice PDF');
    await openApp(page, 'acme');
    await createTicketViaUi(page, { title, priority: 'high' });

    await expect(page.getByTestId('message')).toHaveText(/created with priority High/);
    const card = ticketCard(page, title);
    await expect(card.getByTestId('priority-badge')).toHaveText('High');
    await expect(card.getByTestId('status-badge')).toHaveText('Open');
    await expect(page.getByTestId('ticket-title')).toHaveValue('');
  });

  test('shows the API validation message for invalid input', async ({ page }) => {
    await openApp(page, 'acme');
    await page.getByTestId('ticket-customer').fill('Jane Doe');
    await page.getByTestId('ticket-submit').click();
    await expect(page.getByTestId('message')).toHaveText(/"title" must be between 3 and 120 characters/);
  });

  test('moves a ticket to resolved', async ({ page }) => {
    const title = uniqueTitle('Status change');
    await openApp(page, 'globex');
    await createTicketViaUi(page, { title });

    await ticketCard(page, title).getByTestId('status-select').selectOption('resolved');
    await expect(ticketCard(page, title).getByTestId('status-badge')).toHaveText('Resolved');
  });

  test('suggests a reply that greets the customer', async ({ page }) => {
    const title = uniqueTitle('Reply suggestion');
    await openApp(page, 'acme');
    await createTicketViaUi(page, { title, customer: 'Carla Mendes' });

    const card = ticketCard(page, title);
    await card.getByTestId('suggest-reply').click();
    await expect(card.getByTestId('reply-suggestion')).toContainText('Carla');
  });

  test('renders user input as text, not HTML', async ({ page }) => {
    const title = uniqueTitle('<img src=x onerror=alert(1)>');
    await openApp(page, 'acme');
    await createTicketViaUi(page, { title });
    await expect(ticketCard(page, title)).toBeVisible();
    await expect(page.locator('img')).toHaveCount(0);
  });
});
