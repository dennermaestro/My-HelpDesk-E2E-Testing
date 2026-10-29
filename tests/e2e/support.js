import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import { test as base, expect } from '@playwright/test';
import { E2E_DB_PATH } from '../../playwright.config.js';
import { SEED_USERS } from '../../src/db/seed.js';

export const TENANTS = ['acme', 'globex'];

/** Development-only seed credentials (see README.md). */
export const credentialsFor = (username) => {
  const { password } = SEED_USERS.find((u) => u.username === username);
  return { username, password };
};

/**
 * Logs in through the API. The session cookie lands in the request context's cookie jar,
 * so every later call on that context (or its page) sends it automatically.
 */
export async function login(request, username = 'admin') {
  const response = await request.post('/api/login', { data: credentialsFor(username) });
  expect(response.status(), `login as ${username}`).toBe(200);
  return response;
}

/**
 * Same as Playwright's test, but `page` and `request` start logged in as `loginAs` (admin by default).
 * Use test.use({ loginAs: null }) for an anonymous visitor.
 */
export const test = base.extend({
  loginAs: ['admin', { option: true }],
  request: async ({ request, loginAs }, use) => {
    if (loginAs) await login(request, loginAs);
    await use(request);
  },
  page: async ({ page, loginAs }, use) => {
    if (loginAs) await login(page.request, loginAs);
    await use(page);
  },
});

export { expect };

export async function loginViaUi(page, { username, password }) {
  await page.getByTestId('login-username').fill(username);
  await page.getByTestId('login-password').fill(password);
  await page.getByTestId('login-submit').click();
}

export const uniqueTitle = (label) => `${label} ${randomUUID().slice(0, 8)}`;

export async function openApp(page, tenant) {
  await page.goto(`/?tenant=${tenant}`);
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'true');
  await expect(page.getByTestId('tenant-select')).toHaveValue(tenant);
}

export async function createTicketViaUi(page, { title, customer = 'Jane Doe', priority = 'normal' }) {
  await page.getByTestId('ticket-title').fill(title);
  await page.getByTestId('ticket-customer').fill(customer);
  await page.getByTestId('ticket-priority').selectOption(priority);
  await page.getByTestId('ticket-submit').click();
}

export const ticketCard = (page, title) =>
  page.getByTestId('ticket-item').filter({ has: page.getByTestId('ticket-item-title').getByText(title, { exact: true }) });

export async function getSettings(request, tenant) {
  const response = await request.get(`/api/tenants/${tenant}/settings`, { headers: { 'X-Tenant': tenant } });
  expect(response.status()).toBe(200);
  return (await response.json()).settings;
}

/** Reads the stored row straight from SQLite, read-only, as the QA agent does through MCP. */
export function readTicketFromDb(id) {
  const db = new Database(E2E_DB_PATH, { readonly: true, fileMustExist: true });
  try {
    return db.prepare('SELECT * FROM tickets WHERE id = ?').get(id);
  } finally {
    db.close();
  }
}
