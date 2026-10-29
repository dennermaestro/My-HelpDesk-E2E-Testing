// Calls the AI reply assistant N times for one ticket and scores every reply against the rubric.
// Usage: npm run eval:replies -- --tenant=acme --ticket=1 --runs=10 --min-pass-rate=1
import { parseArgs } from 'node:util';
import { SEED_USERS } from '../src/db/seed.js';
import { scoreReply, summarizeRuns } from '../src/services/replyRubric.js';

const { values } = parseArgs({
  options: {
    url: { type: 'string', default: process.env.MULTIDESK_URL ?? 'http://localhost:3000' },
    tenant: { type: 'string', default: 'acme' },
    ticket: { type: 'string', default: '1' },
    runs: { type: 'string', default: '10' },
    'min-pass-rate': { type: 'string', default: '1' },
  },
});

const runs = Number(values.runs);
const minPassRate = Number(values['min-pass-rate']);
if (!Number.isInteger(runs) || runs < 1 || runs > 100) {
  throw new Error('--runs must be an integer between 1 and 100');
}
if (!(minPassRate >= 0 && minPassRate <= 1)) {
  throw new Error('--min-pass-rate must be between 0 and 1');
}

const headers = { 'X-Tenant': values.tenant };

async function call(path, method = 'GET', body) {
  const response = await fetch(new URL(path, values.url), {
    method,
    headers: body === undefined ? headers : { ...headers, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(5000),
  }).catch((error) => {
    throw new Error(`Could not reach ${values.url} (${error.message}). Start the app with "npm run demo" first.`, {
      cause: error,
    });
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(`${method} ${path} failed with ${response.status}: ${data.error?.message}`);
  }
  headers.Cookie ??= response.headers.get('set-cookie')?.split(';')[0];
  return data;
}

// Reply suggestions are admin-only, so log in with the development seed admin first.
const admin = SEED_USERS.find((u) => u.role === 'admin');
await call('/api/login', 'POST', { username: admin.username, password: admin.password });

const ticket = await call(`/api/tickets/${values.ticket}`);
const results = [];
for (let run = 1; run <= runs; run += 1) {
  const { reply } = await call(`/api/tickets/${ticket.id}/suggest-reply`, 'POST');
  results.push({ run, reply, ...scoreReply(reply, ticket) });
}

console.log(`\nAI reply evaluation: ticket #${ticket.id} (${values.tenant}), ${runs} runs\n`);
for (const result of results) {
  const failed = result.checks.filter((c) => !c.pass).map((c) => c.id);
  console.log(`${String(result.run).padStart(3)}  ${result.pass ? 'PASS' : 'FAIL'}  ${failed.join(', ')}`);
  if (!result.pass) console.log(`     "${result.reply}"`);
}

const summary = summarizeRuns(results, { minPassRate });
console.log(
  `\nPass rate: ${(summary.passRate * 100).toFixed(0)}% (${summary.passed}/${summary.total}), ` +
    `threshold ${(minPassRate * 100).toFixed(0)}% -> ${summary.verdict}`,
);
if (summary.failedChecks.length > 0) {
  console.log(`Failed checks: ${summary.failedChecks.join(', ')}`);
}
process.exitCode = summary.verdict === 'PASS' ? 0 : 1;
