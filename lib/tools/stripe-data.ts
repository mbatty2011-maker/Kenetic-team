import "server-only";
import type Stripe from "stripe";
import { getStripeClient } from "./stripe-auth";

export type StripeMetric =
  | "mrr"
  | "arr"
  | "active_customers"
  | "new_customers"
  | "active_subscriptions"
  | "trials"
  | "gross_revenue"
  | "net_revenue"
  | "failed_payments"
  | "average_revenue_per_customer";

const PAGE_LIMIT = 100;
const MAX_ROWS = 1000;

const SECONDS_PER_DAY = 86400;
const DAYS_PER_MONTH = 30.4375;
const DAYS_PER_WEEK = 7;
const MONTHS_PER_YEAR = 12;

function clampPeriodDays(periodDays: number | undefined): number {
  if (!periodDays || !Number.isFinite(periodDays)) return 30;
  if (periodDays < 1) return 1;
  if (periodDays > 365) return 365;
  return Math.floor(periodDays);
}

function cutoffSeconds(periodDays: number): number {
  return Math.floor(Date.now() / 1000) - clampPeriodDays(periodDays) * SECONDS_PER_DAY;
}

export function formatMoney(amountMinor: number, currency: string): string {
  const major = amountMinor / 100;
  const code = (currency || "usd").toUpperCase();
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: code }).format(major);
  } catch {
    return `${code} ${major.toFixed(2)}`;
  }
}

async function listAll<T>(
  pager: Stripe.ApiListPromise<T>,
  cap = MAX_ROWS
): Promise<T[]> {
  const out: T[] = [];
  for await (const item of pager) {
    out.push(item);
    if (out.length >= cap) break;
  }
  return out;
}

export function monthlyAmountForSubscriptionItem(item: Stripe.SubscriptionItem): number {
  const recurring = item.price?.recurring;
  if (!recurring) return 0;
  const unitAmount = item.price?.unit_amount ?? 0;
  const quantity = item.quantity ?? 1;
  const intervalCount = recurring.interval_count || 1;
  const baseMinor = unitAmount * quantity;

  switch (recurring.interval) {
    case "month":
      return baseMinor / intervalCount;
    case "year":
      return baseMinor / (intervalCount * MONTHS_PER_YEAR);
    case "week":
      return (baseMinor * (DAYS_PER_MONTH / DAYS_PER_WEEK)) / intervalCount;
    case "day":
      return (baseMinor * DAYS_PER_MONTH) / intervalCount;
    default:
      return 0;
  }
}

export function computeMrrFromSubscriptions(subs: Stripe.Subscription[]): number {
  let mrrMinor = 0;
  for (const sub of subs) {
    if (sub.status !== "active") continue;
    for (const item of sub.items?.data ?? []) {
      mrrMinor += monthlyAmountForSubscriptionItem(item);
    }
  }
  return Math.round(mrrMinor);
}

function dominantCurrency(invoices: Stripe.Invoice[]): string {
  const counts: Record<string, number> = {};
  for (const inv of invoices) {
    const c = (inv.currency || "usd").toLowerCase();
    counts[c] = (counts[c] ?? 0) + 1;
  }
  let best = "usd";
  let bestCount = 0;
  for (const c of Object.keys(counts)) {
    const n = counts[c];
    if (n > bestCount) {
      best = c;
      bestCount = n;
    }
  }
  return best;
}

export type FinancialSummary = {
  asOf: string;
  periodDays: number;
  currency: string;
  livemode: boolean;
  balanceAvailableMinor: number;
  balancePendingMinor: number;
  mrrMinor: number;
  arrMinor: number;
  activeSubscriptions: number;
  trialingSubscriptions: number;
  activeCustomers: number;
  newCustomers: number;
  grossRevenueMinor: number;
  refundsMinor: number;
  netRevenueMinor: number;
  failedPaymentCount: number;
  failedPaymentAmountMinor: number;
  averageRevenuePerActiveCustomerMinor: number;
  topPlans: { nickname: string; mrrMinor: number; subscribers: number }[];
};

export async function fetchFinancialSummary(
  userId: string,
  opts: { periodDays?: number } = {}
): Promise<FinancialSummary> {
  const periodDays = clampPeriodDays(opts.periodDays);
  const cutoff = cutoffSeconds(periodDays);
  const stripe = await getStripeClient(userId);

  const [balance, activeSubs, trialingSubs, customers, newCustomers, periodInvoices] =
    await Promise.all([
      stripe.balance.retrieve(),
      listAll(
        stripe.subscriptions.list({
          status: "active",
          limit: PAGE_LIMIT,
          expand: ["data.items.data.price"],
        })
      ),
      listAll(stripe.subscriptions.list({ status: "trialing", limit: PAGE_LIMIT })),
      listAll(stripe.customers.list({ limit: PAGE_LIMIT })),
      listAll(
        stripe.customers.list({
          limit: PAGE_LIMIT,
          created: { gte: cutoff },
        })
      ),
      listAll(
        stripe.invoices.list({
          limit: PAGE_LIMIT,
          created: { gte: cutoff },
        })
      ),
    ]);

  const mrrMinor = computeMrrFromSubscriptions(activeSubs);
  const arrMinor = mrrMinor * MONTHS_PER_YEAR;

  const balanceAvailableMinor =
    balance.available?.reduce((sum, b) => sum + b.amount, 0) ?? 0;
  const balancePendingMinor =
    balance.pending?.reduce((sum, b) => sum + b.amount, 0) ?? 0;

  let grossRevenueMinor = 0;
  let refundsMinor = 0;
  let failedPaymentCount = 0;
  let failedPaymentAmountMinor = 0;
  for (const inv of periodInvoices) {
    if (inv.status === "paid") {
      grossRevenueMinor += inv.amount_paid ?? 0;
      refundsMinor += inv.post_payment_credit_notes_amount ?? 0;
    } else if (inv.status === "open" || inv.status === "uncollectible") {
      if ((inv.attempt_count ?? 0) > 0 && inv.next_payment_attempt === null) {
        failedPaymentCount += 1;
        failedPaymentAmountMinor += inv.amount_due ?? 0;
      }
    }
  }
  const netRevenueMinor = Math.max(grossRevenueMinor - refundsMinor, 0);

  const planTotals = new Map<string, { mrrMinor: number; subscribers: number; nickname: string }>();
  for (const sub of activeSubs) {
    for (const item of sub.items?.data ?? []) {
      const priceId = item.price?.id ?? "unknown";
      const nickname =
        item.price?.nickname ||
        (item.price?.product && typeof item.price.product === "string"
          ? item.price.product
          : priceId);
      const monthly = monthlyAmountForSubscriptionItem(item);
      const existing = planTotals.get(priceId) ?? { mrrMinor: 0, subscribers: 0, nickname };
      existing.mrrMinor += monthly;
      existing.subscribers += 1;
      planTotals.set(priceId, existing);
    }
  }
  const topPlans = Array.from(planTotals.values())
    .sort((a, b) => b.mrrMinor - a.mrrMinor)
    .slice(0, 5)
    .map((p) => ({
      nickname: p.nickname,
      mrrMinor: Math.round(p.mrrMinor),
      subscribers: p.subscribers,
    }));

  const activeCustomers = customers.length;
  const averageRevenuePerActiveCustomerMinor =
    activeCustomers > 0 ? Math.round(mrrMinor / activeCustomers) : 0;

  const livemode = balance.livemode ?? false;
  const currency =
    dominantCurrency(periodInvoices) || balance.available?.[0]?.currency || "usd";

  return {
    asOf: new Date().toISOString().slice(0, 10),
    periodDays,
    currency,
    livemode,
    balanceAvailableMinor,
    balancePendingMinor,
    mrrMinor,
    arrMinor,
    activeSubscriptions: activeSubs.length,
    trialingSubscriptions: trialingSubs.length,
    activeCustomers,
    newCustomers: newCustomers.length,
    grossRevenueMinor,
    refundsMinor,
    netRevenueMinor,
    failedPaymentCount,
    failedPaymentAmountMinor,
    averageRevenuePerActiveCustomerMinor,
    topPlans,
  };
}

export function formatFinancialSummary(s: FinancialSummary): string {
  const fm = (v: number) => formatMoney(v, s.currency);
  const lines: string[] = [];
  lines.push(`# Financial summary — last ${s.periodDays} days (as of ${s.asOf})`);
  lines.push(`Mode: ${s.livemode ? "live" : "test"} · Currency: ${s.currency.toUpperCase()}`);
  lines.push("");
  lines.push("## Recurring revenue");
  lines.push(`- MRR: **${fm(s.mrrMinor)}**`);
  lines.push(`- ARR: ${fm(s.arrMinor)}`);
  lines.push(`- Active subscriptions: ${s.activeSubscriptions}`);
  lines.push(`- Trialing subscriptions: ${s.trialingSubscriptions}`);
  lines.push(`- ARPU (active customers): ${fm(s.averageRevenuePerActiveCustomerMinor)}`);
  lines.push("");
  lines.push("## Customers");
  lines.push(`- Total customers: ${s.activeCustomers}`);
  lines.push(`- New in window: ${s.newCustomers}`);
  lines.push("");
  lines.push("## Cash and revenue");
  lines.push(`- Available balance: ${fm(s.balanceAvailableMinor)}`);
  lines.push(`- Pending balance: ${fm(s.balancePendingMinor)}`);
  lines.push(`- Gross revenue (window): ${fm(s.grossRevenueMinor)}`);
  lines.push(`- Refunds (window): ${fm(s.refundsMinor)}`);
  lines.push(`- Net revenue (window): **${fm(s.netRevenueMinor)}**`);
  lines.push(`- Failed payments (window): ${s.failedPaymentCount} (${fm(s.failedPaymentAmountMinor)})`);
  if (s.topPlans.length > 0) {
    lines.push("");
    lines.push("## Top plans by MRR");
    for (const p of s.topPlans) {
      lines.push(`- ${p.nickname}: ${fm(p.mrrMinor)} (${p.subscribers} subscribers)`);
    }
  }
  return lines.join("\n");
}

export async function getStripeFinancialSummary(
  userId: string,
  opts: { periodDays?: number } = {}
): Promise<string> {
  const summary = await fetchFinancialSummary(userId, opts);
  return formatFinancialSummary(summary);
}

export async function getStripeMetric(
  userId: string,
  metric: StripeMetric,
  opts: { periodDays?: number } = {}
): Promise<string> {
  const s = await fetchFinancialSummary(userId, opts);
  const fm = (v: number) => formatMoney(v, s.currency);
  const tag = `(as of ${s.asOf}, ${s.livemode ? "live" : "test"} mode)`;
  switch (metric) {
    case "mrr":
      return `MRR: ${fm(s.mrrMinor)} across ${s.activeSubscriptions} active subscriptions ${tag}`;
    case "arr":
      return `ARR: ${fm(s.arrMinor)} ${tag}`;
    case "active_customers":
      return `Active customers: ${s.activeCustomers} ${tag}`;
    case "new_customers":
      return `New customers in last ${s.periodDays}d: ${s.newCustomers} ${tag}`;
    case "active_subscriptions":
      return `Active subscriptions: ${s.activeSubscriptions} ${tag}`;
    case "trials":
      return `Trialing subscriptions: ${s.trialingSubscriptions} ${tag}`;
    case "gross_revenue":
      return `Gross revenue last ${s.periodDays}d: ${fm(s.grossRevenueMinor)} ${tag}`;
    case "net_revenue":
      return `Net revenue last ${s.periodDays}d: ${fm(s.netRevenueMinor)} (gross ${fm(
        s.grossRevenueMinor
      )} − refunds ${fm(s.refundsMinor)}) ${tag}`;
    case "failed_payments":
      return `Failed payments last ${s.periodDays}d: ${s.failedPaymentCount} (${fm(
        s.failedPaymentAmountMinor
      )}) ${tag}`;
    case "average_revenue_per_customer":
      return `Avg revenue per active customer (MRR/customers): ${fm(
        s.averageRevenuePerActiveCustomerMinor
      )} ${tag}`;
    default:
      throw new Error(`Unknown metric: ${metric}`);
  }
}
