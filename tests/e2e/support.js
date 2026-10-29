import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import { expect } from '@playwright/test';
import { E2E_DB_PATH } from '../../playwright.config.js';

export const TENANTS = ['acme', 'globex'];

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
