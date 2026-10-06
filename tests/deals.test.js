import test from "node:test";
import assert from "node:assert/strict";
import { approvalFlags, calculateProcessing, calculateTotals, closeProblems, sanitizeDeal, sanitizeProcessing, sanitizeProcessingSettings } from "../src/deals.js";

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

// Illustrative numbers only; real partner rates live in the CRM database, never in this public repo.
const settings = sanitizeProcessingSettings({ partner: "Example Processor", sharePct: 20, defaultInterchangePct: 2, cardPct: 0.1, cardAuth: 0.05, amexPct: 0.2, amexAuth: 0.1, batchFee: 0.2, midMonthly: 10, gatewayMonthly: 5, hostedPerTxn: 0.1 });

test("processing estimate: merchant cost, savings, partner net revenue, and our share", () => {
  const p = sanitizeProcessing({ enabled: true, volume: 100000, txns: 1000, amexShare: 10, rate: 2.5, perTxn: 0.1, currentRate: 3, currentPerTxn: 0.1, batches: 20 });
  const r = calculateProcessing(p, settings);
  assert.deepEqual(r.missing, []);
  assert.equal(r.merchantMonthly, 2600, "100k x 2.5% + 1000 x $0.10");
  assert.equal(r.currentMonthly, 3100);
  assert.equal(r.savingsMonthly, 500);
  const cost = 100000 * 0.02 + 90000 * 0.001 + 900 * 0.05 + 10000 * 0.002 + 100 * 0.1 + 20 * 0.2 + 10 + 5 + 1000 * 0.1;
  assert.equal(r.costMonthly, Math.round(cost * 100) / 100);
  assert.equal(r.netMonthly, Math.round((2600 - cost) * 100) / 100);
  assert.equal(r.residualMonthly, Math.round((2600 - cost) * 0.2 * 100) / 100);
  assert.equal(r.residualAnnual, Math.round(r.residualMonthly * 12 * 100) / 100);
  assert.equal(r.effectiveRate, 2.6);
});

test("processing: missing inputs are listed, below-cost pricing is flagged for approval, and off means nothing", () => {
  assert.equal(calculateProcessing(sanitizeProcessing({ enabled: false }), settings), null);
  const blank = calculateProcessing(sanitizeProcessing({ enabled: true }), sanitizeProcessingSettings({}));
  assert.ok(blank.missing.length >= 5);
  assert.equal(blank.residualMonthly, 0);
  const cheap = sanitizeDeal({ lines: [{ name: "Platform", billing: "monthly", qty: 1, price: 100 }], terms: { months: 12 },
    processing: { enabled: true, volume: 50000, txns: 500, rate: 1.5, perTxn: 0, batches: 20 } });
  const totals = { ...calculateTotals(cheap), processing: calculateProcessing(cheap.processing, settings) };
  assert.equal(totals.processing.belowCost, true);
  assert.equal(totals.processing.residualMonthly, 0, "no negative residual");
  assert.ok(approvalFlags(cheap, totals).includes("Payment processing is priced below cost"));
});

test("processing settings and inputs are cleaned", () => {
  assert.equal(sanitizeProcessingSettings({ sharePct: 500 }).sharePct, 100);
  assert.equal(sanitizeProcessingSettings({}).defaultInterchangePct, null);
  const p = sanitizeProcessing({ enabled: "yes", volume: -5, rate: "", hosted: undefined });
  assert.deepEqual([p.enabled, p.volume, p.rate, p.hosted], [true, 0, null, true]);
});
