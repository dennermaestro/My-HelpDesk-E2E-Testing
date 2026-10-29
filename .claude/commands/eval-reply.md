---
description: Evaluate AI reply suggestions for a ticket against the quality rubric
---

Evaluate the AI reply assistant. Arguments: $ARGUMENTS (default: tenant acme, ticket 1, 10 runs).

1. Run `npm run eval:replies -- --tenant=<tenant> --ticket=<id> --runs=<n>` (the app must be running).
2. Explain the result to a product manager in 4 lines max: pass rate, which rubric checks failed, one failing example, user impact.
3. Decide: is this a bug? Wording that varies is fine. Any broken contract check (invented policy, promised deadline, wrong customer, missing ticket number) is a bug, even at 1 in 10.
4. If it is a bug, write the report using the format in CLAUDE.md, including: N runs, failure rate, the exact failing reply, and the rubric check it broke.
