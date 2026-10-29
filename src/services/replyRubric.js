import { firstName } from './replyAssistant.js';

/**
 * Quality rubric for AI reply suggestions.
 *
 * Wording is allowed to vary between runs. These checks are the contract:
 * anything that fails one of them is a defect, however rarely it happens.
 */
export const RUBRIC = [
  {
    id: 'greets_customer',
    description: 'Greets the customer by first name',
    check: (reply, ticket) => reply.includes(firstName(ticket.customer_name)),
  },
  {
    id: 'references_ticket',
    description: 'Mentions the ticket number',
    check: (reply, ticket) => reply.includes(`#${ticket.id}`),
  },
  {
    id: 'no_invented_policy',
    description: 'Does not promise refunds, compensation or guarantees',
    check: (reply) => !/\b(refund|money back|compensation|guarantee|entitled)\b/i.test(reply),
  },
  {
    id: 'no_promised_deadline',
    description: 'Does not promise a specific deadline',
    check: (reply) => !/\bwithin \d+\s*(minutes?|hours?|days?)\b|\bby tomorrow\b/i.test(reply),
  },
  {
    id: 'reasonable_length',
    description: 'Between 40 and 600 characters',
    check: (reply) => reply.length >= 40 && reply.length <= 600,
  },
];

export function scoreReply(reply, ticket) {
  const checks = RUBRIC.map(({ id, description, check }) => ({ id, description, pass: check(reply, ticket) }));
  return { pass: checks.every((c) => c.pass), checks };
}

/**
 * Summarizes N scored runs. A run set fails when any contract check fails,
 * or when the pass rate drops below the threshold.
 */
export function summarizeRuns(results, { minPassRate = 1 } = {}) {
  const total = results.length;
  const passed = results.filter((r) => r.pass).length;
  const passRate = total === 0 ? 0 : passed / total;
  const failedChecks = [...new Set(results.flatMap((r) => r.checks.filter((c) => !c.pass).map((c) => c.id)))];

  return { total, passed, failed: total - passed, passRate, failedChecks, verdict: passRate >= minPassRate ? 'PASS' : 'FAIL' };
}
