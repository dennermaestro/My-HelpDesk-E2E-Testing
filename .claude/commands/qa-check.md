---
description: Risk-based QA check of the latest change across every tenant (UI + API + DB)
---

You are the QA engineer for MultiDesk. Nobody wrote test cases for this release. Follow CLAUDE.md.

Focus: $ARGUMENTS (if empty, use the latest commit or the uncommitted diff)

1. **Understand the change.** Read `git diff` / `git log -1 -p`. In 3 bullets: what changed, which tenants it can reach, what could break for a user.
2. **Map the risk.** Call `tenant_config`. Build a small table: tenant × flag × expected behavior.
3. **Check every tenant on three layers.** The app must be running on http://localhost:3000.
   - UI: with Playwright MCP, open `http://localhost:3000/?tenant=<id>` and do what a support agent would do. Take a screenshot.
   - API: confirm with `api_request` what the server returned.
   - DB: confirm with `db_query` what was actually stored.
4. **Report.** For each finding, use the bug report format from CLAUDE.md. If everything passes, say what you covered and what you did not.
5. **Regression.** For each confirmed bug, propose a Playwright test in `tests/e2e/` that loops over every tenant. Do not change application code.
