import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createReplyAssistant, firstName, HALLUCINATION_EVERY } from '../../src/services/replyAssistant.js';
import { RUBRIC, scoreReply, summarizeRuns } from '../../src/services/replyRubric.js';

const ticket = { id: 42, customer_name: 'Maria Silva' };

function runAssistant(assistant, times) {
  return Array.from({ length: times }, () => assistant.suggestReply(ticket).reply);
}

describe('replyAssistant', () => {
  it('extracts the first name', () => {
    assert.equal(firstName('  Maria   Silva '), 'Maria');
  });

  it('varies the wording across calls, like a real model', () => {
    const replies = runAssistant(createReplyAssistant(), 5);
    assert.equal(new Set(replies).size, 5);
  });

  it('never hallucinates with defects off', () => {
    const replies = runAssistant(createReplyAssistant(), 50);
    assert.ok(replies.every((reply) => scoreReply(reply, ticket).pass));
  });
});

describe('replyRubric', () => {
  it('passes a compliant reply', () => {
    const result = scoreReply('Hi Maria, we are looking into ticket #42 and will update you here.', ticket);
    assert.equal(result.pass, true);
    assert.equal(result.checks.length, RUBRIC.length);
  });

  const failing = [
    ['greets_customer', 'Hello there, we are looking into ticket #42 and will update you.'],
    ['references_ticket', 'Hi Maria, we are looking into your request and will update you here.'],
    ['no_invented_policy', 'Hi Maria, ticket #42 qualifies for a full refund, we will update you.'],
    ['no_promised_deadline', 'Hi Maria, ticket #42 will be fixed within 2 hours, we promise you that.'],
    ['reasonable_length', 'Hi Maria #42'],
  ];
  for (const [checkId, reply] of failing) {
    it(`fails ${checkId}`, () => {
      const result = scoreReply(reply, ticket);
      assert.equal(result.pass, false);
      assert.equal(result.checks.find((c) => c.id === checkId).pass, false);
    });
  }

  it('summarizes runs with pass rate and failed checks', () => {
    const results = [
      scoreReply('Hi Maria, we are looking into ticket #42 and will update you here.', ticket),
      scoreReply('Hi Maria, ticket #42 qualifies for a full refund, we will update you.', ticket),
    ];
    assert.deepEqual(summarizeRuns(results), {
      total: 2,
      passed: 1,
      failed: 1,
      passRate: 0.5,
      failedChecks: ['no_invented_policy'],
      verdict: 'FAIL',
    });
  });

  it('fails an empty run set', () => {
    assert.equal(summarizeRuns([]).verdict, 'FAIL');
  });

  it('respects a custom threshold', () => {
    const results = [scoreReply('Hi Maria, we are looking into ticket #42 and will update you here.', ticket)];
    assert.equal(summarizeRuns(results, { minPassRate: 0.9 }).verdict, 'PASS');
  });
});

describe('planted defect: hallucinated reply', () => {
  it(`invents a policy exactly once every ${HALLUCINATION_EVERY} replies with defects on`, () => {
    const replies = runAssistant(createReplyAssistant({ demoDefects: true }), HALLUCINATION_EVERY * 2);
    const failures = replies.filter((reply) => !scoreReply(reply, ticket).pass);
    assert.equal(failures.length, 2);
    assert.match(failures[0], /refund/);
  });
});
