import test from "node:test";
import assert from "node:assert/strict";
import { approvalFlags, calculateTotals, closeProblems, sanitizeDeal } from "../src/deals.js";

test("totals: one-time, monthly, annual, discounts, and free months", () => {
  const deal = sanitizeDeal({ lines: [
    { name: "Setup", billing: "once", qty: 1, price: 500, listPrice: 500 },
    { name: "Platform", billing: "monthly", qty: 2, price: 100, listPrice: 100, discount: 10 },
    { name: "Support", billing: "annual", qty: 1, price: 1200, listPrice: 1200 },
  ], terms: { months: 12, freeMonths: 1 } });
  const t = calculateTotals(deal);
  assert.equal(t.oneTime, 500);
  assert.equal(t.mrr, 280, "2 x 100 x 90% + 1200/12");
  assert.equal(t.arr, 3360);
  assert.equal(t.tcv, 500 + 280 * 11);
  assert.equal(t.listTcv, 500 + 300 * 12);
  assert.equal(t.discountPct, Math.round((1 - t.tcv / t.listTcv) * 1000) / 10);
});

test("guardrails flag discounts, short terms, long payment terms, free months, and special terms", () => {
  const ok = sanitizeDeal({ lines: [{ name: "Platform", billing: "monthly", qty: 1, price: 100, discount: 5 }], terms: { months: 12 } });
  assert.deepEqual(approvalFlags(ok, calculateTotals(ok)), []);
  const risky = sanitizeDeal({ lines: [{ name: "Platform", billing: "monthly", qty: 1, price: 100, discount: 25 }], terms: { months: 6, paymentTerms: "Net 60", freeMonths: 2, special: "Can cancel anytime" } });
  const flags = approvalFlags(risky, calculateTotals(risky));
  assert.equal(flags.length, 6);
  assert.deepEqual(approvalFlags(risky, calculateTotals(risky), { maxDiscount: 50, minTermMonths: 3, maxNetDays: 60, maxFreeMonths: 2 }), ["Has special terms"]);
});

test("price below list counts as discount; bad input is cleaned", () => {
  const deal = sanitizeDeal({ status: "won", totals: { tcv: 1e9 }, lines: [{ name: "Platform", billing: "weekly", qty: -3, price: 80, listPrice: 100 }], terms: { months: 999, paymentTerms: "Net 999" } });
  assert.equal(deal.status, undefined);
  assert.equal(deal.totals, undefined);
  assert.equal(deal.lines[0].billing, "monthly");
  assert.equal(deal.lines[0].qty, 0);
  assert.equal(deal.terms.months, 120);
  assert.equal(deal.terms.paymentTerms, "Net 30");
  const priced = sanitizeDeal({ lines: [{ name: "Platform", billing: "monthly", qty: 1, price: 80, listPrice: 100 }], terms: { months: 12 } });
  assert.equal(calculateTotals(priced).discountPct, 20);
});

test("close package requirements", () => {
  const deal = sanitizeDeal({ terms: { startDate: "2026-11-01" }, close: { agreementSigned: true, signedDate: "2026-10-20", signerName: "Pat Owner", signerEmail: "pat@example.com", billingEmail: "billing@example.com" } });
  assert.deepEqual(closeProblems(deal), []);
  assert.equal(closeProblems(sanitizeDeal({})).length, 6);
});
