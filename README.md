# My-HelpDesk-E2E-Testing

Multi-tenant helpdesk (JavaScript, REST API, SQLite) for AI-assisted QA: Claude Code + MCP checks UI, API and database per tenant.

**MultiDesk** is a small helpdesk where two fictional clients, **Acme** (the main client) and **Globex**, share one app with their own feature flags. It exists to be tested: a Claude Code agent uses MCP servers to check the same feature through the **UI**, the **REST API** and the **database**, for **every** client, not just the main one.

All data is fictional. Everything runs locally. No API keys are needed.

## Quick start

Requires **Node.js 22+** (`node -v`) and Google Chrome for the Playwright MCP.

```bash
npm install
npx playwright install chromium   # browsers for the E2E tests
npm start                         # http://localhost:3000
```

The database is rebuilt from seed data on every start, so each run begins from the same state.

### Logins (development only)

Open http://localhost:3000 and sign in with one of the seed users. These passwords exist only for this local demo; the database stores scrypt hashes with a per-user salt, never the plaintext. They are defined in `src/db/seed.js` (`SEED_USERS`).

| Username | Password | Role | Can do |
| --- | --- | --- | --- |
| `admin` | `admin-dev-2026` | admin | Everything: list, view, create, change status/priority, reply suggestions, every client |
| `support1` | `support1-dev-2026` | support | Only create tickets (sees the form and the new ticket number, no list) |

Both users can switch clients. Permissions are enforced by the API, not only hidden in the UI.

| Command | What it does |
| --- | --- |
| `npm start` | Runs the app with correct behavior |
| `npm run demo` | Runs the app with the **planted defects** on |
| `npm run lint` | ESLint |
| `npm test` | Unit and API tests (Node test runner) |
| `npm run test:coverage` | Unit tests with coverage |
| `npm run test:e2e` | Playwright on desktop and mobile viewports |
| `npm run test:e2e:demo` | Same E2E suite against the planted defects (expected to fail) |
| `npm run eval:replies` | Scores AI reply suggestions against a rubric |
| `npm run check` | Lint + unit + E2E |

## Architecture

```
Claude Code ──► Playwright MCP ──► Browser ──► UI (public/)
     │                                          │
     ├──────► qa-tools MCP ─── api_request ──► REST API (Express, src/)
     │              │                           │
     │              └──────── db_query ───────► SQLite (data/helpdesk.db, read-only for QA)
     └──────► .claude/commands: /qa-check, /eval-reply
```

| Layer | Stack |
| --- | --- |
| Backend | Node.js 22, Express 5 |
| Database | SQLite via `better-sqlite3` |
| Frontend | HTML, CSS, vanilla JS (responsive, colored badges) |
| Tests | Node test runner, Playwright Test |
| MCP | `@playwright/mcp`, custom `qa-tools` server (`@modelcontextprotocol/sdk`) |

## REST API

Every route except `/api/health` and `/api/login` needs a session: log in with `POST /api/login`, which sets an `HttpOnly`, `SameSite=Lax` cookie (`multidesk_session`). Sessions live in memory and end on logout or server restart. Every ticket request also names its client in the `X-Tenant` header (`acme` or `globex`).

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/api/health` | Health check and defect mode |
| `POST` | `/api/login` | Log in: `{ username, password }` → `{ username, role }` + session cookie |
| `POST` | `/api/logout` | End the session |
| `GET` | `/api/me` | The logged-in user: `{ username, role }` |
| `GET` | `/api/tenants` | List clients |
| `GET` | `/api/tenants/:id/settings` | Feature flags of the calling client |
| `GET` | `/api/tickets?status=&priority=` | List the client's tickets (admin) |
| `GET` | `/api/tickets/:id` | One ticket (admin) |
| `POST` | `/api/tickets` | Create: `{ title, customer_name, priority? }` (admin, support) |
| `PATCH` | `/api/tickets/:id` | Update: `{ priority?, status? }` (admin) |
| `POST` | `/api/tickets/:id/suggest-reply` | AI reply suggestion, simulated (admin) |

Errors always look like `{ "error": { "code", "message", "details?" } }`: `400` invalid input, `401` not logged in (`AUTH_REQUIRED`), wrong login (`INVALID_CREDENTIALS`) or missing/unknown tenant, `403` role not allowed or another client's settings, `404` not found, `413` body too large.

## Database

| Table | Columns |
| --- | --- |
| `tenants` | `id`, `name`, `plan` |
| `tenant_settings` | `tenant_id`, `key`, `enabled` |
| `tickets` | `id`, `tenant_id`, `title`, `customer_name`, `priority`, `status`, `created_at`, `updated_at` |
| `users` | `id`, `username`, `role` (`admin`/`support`), `password_salt`, `password_hash` |

Seed data lives in `src/db/seed.js`.

## MCP and the QA harness

The harness is versioned in the repo, so anyone who opens it in Claude Code gets the same QA setup:

- `.mcp.json` registers two servers:
  - **playwright**: drives the browser, in an isolated profile.
  - **qa-tools** (`mcp/`): `api_request` (logs in as `admin` by default; pass `user: "support1"` or `"anonymous"` to test other roles), `db_query` (single read-only `SELECT`, read-only connection, 200-row cap) and `tenant_config`.
- `CLAUDE.md` holds the QA rules: every tenant, three layers, never write to the DB, evidence, regression test.
- `/qa-check`: a risk-based check of the latest change across every tenant.
- `/eval-reply`: evaluates the AI assistant over N runs against the rubric.

To use it, start the app (`npm run demo`), then open Claude Code **from the repo root** and approve the project MCP servers.

## Planted defects (`DEMO_DEFECTS=on`)

| Defect | What happens | Caught by |
| --- | --- | --- |
| Urgent priority rollout | `urgent_priority` is only enabled for Acme. Globex users are still offered "Urgent", the API answers `201` with `"urgent"`, and the database stores `normal`. | `tests/e2e/urgent-priority.spec.js`, `/qa-check` |
| AI reply hallucination | 1 in every 10 suggestions invents a refund policy. | `npm run eval:replies`, `/eval-reply` |

With defects off (`npm start`), the API rejects the request with `400`, the UI hides the option and the assistant stays within the rubric. `tests/unit/demoDefects.test.js` pins the buggy behavior so the demo stays predictable.

## Project structure

```
src/            app.js, server.js, config.js, middleware.js, errors.js
  db/           schema + seed, tenant-scoped repository
  services/     ticket rules, reply assistant, reply rubric
public/         UI (index.html, styles.css, app.js)
mcp/            qa-tools MCP server and its tool logic
scripts/        eval-replies.js
tests/unit/     unit + API tests
tests/e2e/      Playwright specs
.claude/        Claude Code slash commands
```
