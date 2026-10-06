// Deal math, guardrails, and close-package rules. The Worker uses these as the source of truth;
// public/deal-math.js mirrors calculateTotals for the live preview in the browser.

export const STATUSES = ["draft", "pending", "changes", "approved", "won", "lost"];
export const EDITABLE = new Set(["draft", "changes"]);
export const BILLING = new Set(["once", "monthly", "annual"]);
export const DEFAULT_RULES = { maxDiscount: 15, minTermMonths: 12, maxNetDays: 30, maxFreeMonths: 1 };
export const PAYMENT_TERMS = { "Due on receipt": 0, "Net 15": 15, "Net 30": 30, "Net 45": 45, "Net 60": 60 };

const money = n => Math.round(n * 100) / 100;
const num = (value, min, max, fallback = 0) => { const n = Number(value); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback; };
const text = (value, max) => typeof value === "string" ? value.trim().slice(0, max) : "";

// Clean what the browser sends. Unknown fields are dropped; workflow fields can't be set this way.
export function sanitizeDeal(input) {
  const lines = (Array.isArray(input.lines) ? input.lines : []).slice(0, 50).map(line => ({
    productId: text(line.productId, 100),
    name: text(line.name, 120) || "Item",
    billing: BILLING.has(line.billing) ? line.billing : "monthly",
    qty: num(line.qty, 0, 100000, 1),
    price: money(num(line.price, 0, 10000000)),
    listPrice: money(num(line.listPrice ?? line.price, 0, 10000000)),
    discount: num(line.discount, 0, 100),
  }));
  const terms = input.terms && typeof input.terms === "object" ? input.terms : {};
  const close = input.close && typeof input.close === "object" ? input.close : {};
  return {
    name: text(input.name, 120),
    oppId: text(input.oppId, 100),
    owner: text(input.owner, 20),
    expectedClose: /^\d{4}-\d{2}-\d{2}$/.test(input.expectedClose || "") ? input.expectedClose : "",
    probability: input.probability === "" || input.probability == null ? null : num(input.probability, 0, 100),
    lines,
    terms: {
      startDate: /^\d{4}-\d{2}-\d{2}$/.test(terms.startDate || "") ? terms.startDate : "",
      months: num(terms.months, 1, 120, 12),
      freeMonths: num(terms.freeMonths, 0, 24),
      paymentTerms: Object.hasOwn(PAYMENT_TERMS, terms.paymentTerms) ? terms.paymentTerms : "Net 30",
      billingFrequency: ["Monthly", "Quarterly", "Annually", "Upfront"].includes(terms.billingFrequency) ? terms.billingFrequency : "Monthly",
      autoRenew: Boolean(terms.autoRenew),
      special: text(terms.special, 2000),
    },
    close: {
      agreementSigned: Boolean(close.agreementSigned),
      signedDate: /^\d{4}-\d{2}-\d{2}$/.test(close.signedDate || "") ? close.signedDate : "",
      signerName: text(close.signerName, 120),
      signerTitle: text(close.signerTitle, 120),
      signerEmail: text(close.signerEmail, 200),
      billingEmail: text(close.billingEmail, 200),
      paymentMethod: text(close.paymentMethod, 60),
      handoff: text(close.handoff, 3000),
    },
    processing: sanitizeProcessing(input.processing),
    notes: text(input.notes, 3000),
  };
}

// One-time, monthly recurring (MRR), annual recurring (ARR), and total contract value (TCV).
export function calculateTotals(deal) {
  const months = deal.terms?.months || 12, billable = Math.max(0, months - (deal.terms?.freeMonths || 0));
  let oneTime = 0, mrr = 0, listOneTime = 0, listMrr = 0;
  for (const line of deal.lines || []) {
    const list = line.qty * (line.listPrice ?? line.price), net = line.qty * line.price * (1 - line.discount / 100);
    if (line.billing === "once") { oneTime += net; listOneTime += list; }
    else { const perMonth = line.billing === "annual" ? 1 / 12 : 1; mrr += net * perMonth; listMrr += list * perMonth; }
  }
  const tcv = oneTime + mrr * billable, listTcv = listOneTime + listMrr * months;
  return { oneTime: money(oneTime), mrr: money(mrr), arr: money(mrr * 12), tcv: money(tcv), listTcv: money(listTcv),
    discountPct: listTcv > 0 ? Math.round((1 - tcv / listTcv) * 1000) / 10 : 0 };
}

// Payment processing referred to a processing partner. The partner's cost basis and TideLine's
// revenue share are confidential: they are entered in the app (catalog/processing), never in code,
// so every default here is zero.
export const PROCESSING_DEFAULTS = {
  partner: "", sharePct: 0, defaultInterchangePct: null,
  cardPct: 0, cardAuth: 0, amexPct: 0, amexAuth: 0, batchFee: 0, midMonthly: 0, gatewayMonthly: 0, hostedPerTxn: 0, gatewayBilledToMerchant: false,
};
const pnum = (value, max) => value === "" || value == null ? null : num(value, 0, max, null);
export function sanitizeProcessing(input) {
  const p = input && typeof input === "object" ? input : {};
  return {
    enabled: Boolean(p.enabled),
    volume: pnum(p.volume, 1e9), txns: pnum(p.txns, 1e7), amexShare: pnum(p.amexShare, 100) ?? 0,
    rate: pnum(p.rate, 20), perTxn: pnum(p.perTxn, 10), monthlyFee: pnum(p.monthlyFee, 10000) ?? 0,
    currentRate: pnum(p.currentRate, 20), currentPerTxn: pnum(p.currentPerTxn, 10), currentMonthly: pnum(p.currentMonthly, 10000) ?? 0,
    interchangePct: pnum(p.interchangePct, 10), batches: pnum(p.batches, 100) ?? 0, hosted: p.hosted !== false,
  };
}
export function sanitizeProcessingSettings(input) {
  const s = input && typeof input === "object" ? input : {}, out = { kind: "processing", partner: text(s.partner, 80) };
  for (const key of ["sharePct", "cardPct", "cardAuth", "amexPct", "amexAuth", "batchFee", "midMonthly", "gatewayMonthly", "hostedPerTxn"]) out[key] = num(s[key], 0, key === "sharePct" ? 100 : 10000);
  out.defaultInterchangePct = pnum(s.defaultInterchangePct, 10);
  out.gatewayBilledToMerchant = Boolean(s.gatewayBilledToMerchant);
  return out;
}
// Monthly estimate: what the merchant pays now and with us, the partner's net revenue, and TideLine's share.
export function calculateProcessing(p, settings = PROCESSING_DEFAULTS) {
  if (!p?.enabled) return null;
  const s = { ...PROCESSING_DEFAULTS, ...settings }, missing = [];
  if (!(p.volume > 0)) missing.push("monthly card volume");
  if (!(p.txns > 0)) missing.push("monthly transactions");
  if (p.rate == null) missing.push("our rate (%)");
  if (p.perTxn == null) missing.push("our per-transaction fee");
  const interchange = p.interchangePct ?? s.defaultInterchangePct;
  if (interchange == null) missing.push("estimated interchange (%)");
  if (!s.sharePct) missing.push("revenue share (set it under Products & rules)");
  const V = p.volume || 0, N = p.txns || 0, a = (p.amexShare || 0) / 100;
  const merchant = V * (p.rate || 0) / 100 + N * (p.perTxn || 0) + p.monthlyFee;
  const gateway = s.gatewayMonthly + (p.hosted ? N * s.hostedPerTxn : 0);
  const cost = V * (interchange || 0) / 100
    + V * (1 - a) * s.cardPct / 100 + N * (1 - a) * s.cardAuth + V * a * s.amexPct / 100 + N * a * s.amexAuth
    + p.batches * s.batchFee + s.midMonthly + (s.gatewayBilledToMerchant ? 0 : gateway);
  const merchantTotal = merchant + (s.gatewayBilledToMerchant ? gateway : 0);
  const current = p.currentRate == null ? null : V * p.currentRate / 100 + N * (p.currentPerTxn || 0) + p.currentMonthly;
  const net = merchant - cost, residual = Math.max(0, net) * s.sharePct / 100;
  return {
    merchantMonthly: money(merchantTotal), currentMonthly: current == null ? null : money(current),
    savingsMonthly: current == null ? null : money(current - merchantTotal), effectiveRate: V ? Math.round(merchantTotal / V * 10000) / 100 : null,
    costMonthly: money(cost), netMonthly: money(net), residualMonthly: money(residual), residualAnnual: money(residual * 12),
    belowCost: !missing.length && net < 0, missing,
  };
}

// Reasons this deal needs another editor's approval before it can close.
export function approvalFlags(deal, totals, rules = DEFAULT_RULES) {
  const r = { ...DEFAULT_RULES, ...rules }, flags = [];
  if (totals.discountPct > r.maxDiscount) flags.push(`Total discount ${totals.discountPct}% is above the ${r.maxDiscount}% limit`);
  for (const line of deal.lines) if (line.discount > r.maxDiscount) flags.push(`${line.name} is discounted ${line.discount}%`);
  if (deal.terms.months < r.minTermMonths) flags.push(`${deal.terms.months}-month term is shorter than ${r.minTermMonths} months`);
  if (PAYMENT_TERMS[deal.terms.paymentTerms] > r.maxNetDays) flags.push(`${deal.terms.paymentTerms} payment terms are longer than Net ${r.maxNetDays}`);
  if (deal.terms.freeMonths > r.maxFreeMonths) flags.push(`${deal.terms.freeMonths} free months is more than ${r.maxFreeMonths}`);
  if (deal.terms.special) flags.push("Has special terms");
  if (totals.processing?.belowCost) flags.push("Payment processing is priced below cost");
  return flags;
}

// Problems that block submitting (missing basics) and closing (incomplete close package).
export function submitProblems(deal, totals) {
  const problems = [];
  if (!deal.name) problems.push("Name the deal");
  if (!deal.oppId) problems.push("Pick the account");
  if (!deal.lines.length) problems.push("Add at least one product or service");
  if (totals.tcv <= 0) problems.push("The deal has no value");
  if (!deal.expectedClose) problems.push("Set the expected close date");
  return problems;
}
export function closeProblems(deal) {
  const c = deal.close, problems = [];
  if (!c.agreementSigned) problems.push("Confirm the signed agreement was received");
  if (!c.signedDate) problems.push("Add the date it was signed");
  if (!c.signerName) problems.push("Add who signed");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c.signerEmail)) problems.push("Add the signer's email");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c.billingEmail)) problems.push("Add the billing contact's email");
  if (!deal.terms.startDate) problems.push("Set the contract start date");
  return problems;
}
