# MultiDesk — QA harness

MultiDesk is a small multi-tenant helpdesk used to demonstrate AI-assisted QA.
Two fictional clients share the app: `acme` (main client) and `globex`. Each has its own feature flags in `tenant_settings`.

## Commands

- `npm start` — app on http://localhost:3000, database reset with seed data
- `npm run demo` — same, with the planted defects on (`DEMO_DEFECTS=on`)
- `npm run lint`, `npm test` (unit), `npm run test:e2e` (Playwright, desktop + mobile)
- `npm run eval:replies -- --tenant=acme --ticket=1 --runs=10` — scores AI reply suggestions

## QA rules

1. **Every client, not just the main one.** Before testing a change, call `tenant_config` and test each tenant whose flags affect it.
2. **Three layers for every check.** What the user sees (Playwright MCP), what the API returns (`api_request`), and what was stored (`db_query`). A check passes only when all three agree.
3. **Never write to the database.** `db_query` is read-only by design; change data only through the UI or the API.
4. **Evidence or it didn't happen.** Every finding includes: steps, tenant, expected vs actual for each layer, the request/response, the SQL row, and a screenshot.
5. **AI output is judged by contract, not wording.** Use the rubric in `src/services/replyRubric.js`. Run at least 10 times and report the failure rate.
6. **Leave a regression test behind.** A confirmed bug ends with a Playwright test in `tests/e2e/` that covers every tenant.

## Bug report format

```
Title: <what is wrong, for whom>
Severity: <critical|high|medium|low> — <user impact in one line>
Tenant(s): <affected> / <not affected>
Steps: 1. … 2. …
Expected: …
Actual — UI: … | API: … | DB: …
Evidence: <screenshot, request/response, SQL row>
Suspected cause: <optional>
```

## Code conventions

- Plain JavaScript (ES modules), Node 22+. No TypeScript, no build step.
- User input is rendered with `textContent`, never `innerHTML`.
- Every ticket query is scoped by `tenant_id`.
- Run `npm run check` before opening a PR.
