/**
 * Simulated AI reply assistant.
 *
 * There is no real model behind it: it rotates through fixed templates so the demo
 * is free, needs no API key, and is repeatable. It still behaves like an LLM from the
 * tester's point of view: the same request gets a different answer each time.
 *
 * With `demoDefects` on, 1 in every 10 replies invents a refund policy that does not exist.
 */

const GOOD_TEMPLATES = [
  ({ first, id }) => `Hi ${first}, thanks for reaching out about ticket #${id}. I'm looking into it now and will update you here as soon as I know more.`,
  ({ first, id }) => `Hello ${first}, I'm sorry for the trouble. Ticket #${id} is with our team and we're reviewing the details you shared.`,
  ({ first, id }) => `Hi ${first}, thanks for your patience. We've picked up ticket #${id} and will reply here with next steps.`,
  ({ first, id }) => `Hi ${first}, I understand how frustrating this is. Ticket #${id} is being investigated and I'll keep you posted.`,
  ({ first, id }) => `Hello ${first}, thank you for the report. I've added ticket #${id} to our queue and will follow up in this thread.`,
  ({ first, id }) => `Hi ${first}, we received ticket #${id}. Could you share a screenshot if you have one? It will help us move faster.`,
  ({ first, id }) => `Hello ${first}, thanks for letting us know. Our team is checking ticket #${id} and will get back to you here.`,
  ({ first, id }) => `Hi ${first}, sorry about this. I've escalated ticket #${id} to the right team and will share an update soon.`,
  ({ first, id }) => `Hi ${first}, thanks for writing in. Ticket #${id} is open and assigned, and we'll reply here once we have news.`,
];

const HALLUCINATED_TEMPLATE = ({ first, id }) =>
  `Hi ${first}, sorry about ticket #${id}. Per our Premium Care policy you are entitled to a full refund within 90 days, no questions asked.`;

export const HALLUCINATION_EVERY = 10;

export function createReplyAssistant({ demoDefects = false, now = () => new Date() } = {}) {
  let calls = 0;

  return {
    suggestReply(ticket) {
      calls += 1;
      const context = { first: firstName(ticket.customer_name), id: ticket.id };
      const hallucinates = demoDefects && calls % HALLUCINATION_EVERY === 0;
      const template = hallucinates ? HALLUCINATED_TEMPLATE : GOOD_TEMPLATES[(calls - 1) % GOOD_TEMPLATES.length];

      return {
        ticket_id: ticket.id,
        reply: template(context),
        generated_at: now().toISOString(),
      };
    },
  };
}

export function firstName(fullName) {
  return String(fullName).trim().split(/\s+/)[0];
}
