import "server-only";
import { fetchFinancialSummary, formatMoney, type FinancialSummary } from "./stripe-data";
import { createSpreadsheet } from "./sheets";
import { generateXlsx } from "@/lib/files/generators/xlsx";
import { uploadAgentFile, sanitizeFilename } from "@/lib/files/upload";

export type PnlDelivery = "sheet" | "xlsx" | "both";

export type PnlSnapshotInput = {
  periodDays?: number;
  costs?: Record<string, number>;
  currency?: string;
  deliver?: PnlDelivery;
  title?: string;
};

export type PnlSnapshotResult = {
  asOf: string;
  periodDays: number;
  currency: string;
  livemode: boolean;
  netRevenueMinor: number;
  totalCostsMinor: number;
  netIncomeMinor: number;
  marginPct: number;
  sheetUrl?: string;
  fileUrl?: string;
  fileSizeBytes?: number;
  hasCosts: boolean;
  costBreakdown: { category: string; amountMinor: number }[];
};

function toMinor(amountMajor: number): number {
  if (!Number.isFinite(amountMajor)) return 0;
  return Math.round(amountMajor * 100);
}

function buildPnlRows(
  summary: FinancialSummary,
  costsMinor: { category: string; amountMinor: number }[]
): { name: string; data: string[][] }[] {
  const fm = (v: number) => formatMoney(v, summary.currency);
  const totalCostsMinor = costsMinor.reduce((sum, c) => sum + c.amountMinor, 0);
  const netIncomeMinor = summary.netRevenueMinor - totalCostsMinor;
  const marginPct = summary.netRevenueMinor > 0
    ? (netIncomeMinor / summary.netRevenueMinor) * 100
    : 0;

  const pnl: string[][] = [
    ["P&L Snapshot", ""],
    ["Period", `Last ${summary.periodDays} days (as of ${summary.asOf})`],
    ["Mode", summary.livemode ? "Live" : "Test"],
    ["Currency", summary.currency.toUpperCase()],
    ["", ""],
    ["Line item", "Amount"],
    ["Gross revenue", fm(summary.grossRevenueMinor)],
    ["Refunds", `-${fm(summary.refundsMinor)}`],
    ["Net revenue", fm(summary.netRevenueMinor)],
    ["", ""],
    ["Costs", ""],
  ];
  if (costsMinor.length === 0) {
    pnl.push(["(none provided)", ""]);
  } else {
    for (const c of costsMinor) {
      pnl.push([c.category, fm(c.amountMinor)]);
    }
  }
  pnl.push(["Total costs", fm(totalCostsMinor)]);
  pnl.push(["", ""]);
  pnl.push(["Net income", fm(netIncomeMinor)]);
  pnl.push(["Net margin", `${marginPct.toFixed(1)}%`]);
  pnl.push(["", ""]);
  pnl.push(["MRR (recurring)", fm(summary.mrrMinor)]);
  pnl.push(["ARR (recurring)", fm(summary.arrMinor)]);
  pnl.push(["Active subscriptions", String(summary.activeSubscriptions)]);
  pnl.push(["Trialing subscriptions", String(summary.trialingSubscriptions)]);
  pnl.push(["Active customers", String(summary.activeCustomers)]);
  pnl.push(["Failed payments", `${summary.failedPaymentCount} (${fm(summary.failedPaymentAmountMinor)})`]);

  const source: string[][] = [
    ["Metric", "Value"],
    ["Available balance", fm(summary.balanceAvailableMinor)],
    ["Pending balance", fm(summary.balancePendingMinor)],
    ["Gross revenue (window)", fm(summary.grossRevenueMinor)],
    ["Refunds (window)", fm(summary.refundsMinor)],
    ["Net revenue (window)", fm(summary.netRevenueMinor)],
    ["MRR", fm(summary.mrrMinor)],
    ["ARR", fm(summary.arrMinor)],
    ["Active subs", String(summary.activeSubscriptions)],
    ["Trialing subs", String(summary.trialingSubscriptions)],
    ["Active customers", String(summary.activeCustomers)],
    ["New customers (window)", String(summary.newCustomers)],
    ["ARPU", fm(summary.averageRevenuePerActiveCustomerMinor)],
    ["Failed payment count", String(summary.failedPaymentCount)],
    ["Failed payment amount", fm(summary.failedPaymentAmountMinor)],
  ];

  if (summary.topPlans.length > 0) {
    source.push(["", ""]);
    source.push(["Plan", "MRR"]);
    for (const p of summary.topPlans) {
      source.push([`${p.nickname} (${p.subscribers} subs)`, fm(p.mrrMinor)]);
    }
  }

  return [
    { name: "P&L", data: pnl },
    { name: "Source Data", data: source },
  ];
}

export async function buildPnlSnapshot(
  userId: string,
  input: PnlSnapshotInput
): Promise<PnlSnapshotResult> {
  const summary = await fetchFinancialSummary(userId, { periodDays: input.periodDays });
  const deliver: PnlDelivery = input.deliver ?? "both";

  const costsMinor = Object.entries(input.costs ?? {})
    .filter(([category, amount]) => category && Number.isFinite(amount))
    .map(([category, amount]) => ({
      category: category.trim() || "Uncategorized",
      amountMinor: toMinor(amount),
    }));
  const totalCostsMinor = costsMinor.reduce((sum, c) => sum + c.amountMinor, 0);
  const netIncomeMinor = summary.netRevenueMinor - totalCostsMinor;
  const marginPct = summary.netRevenueMinor > 0
    ? (netIncomeMinor / summary.netRevenueMinor) * 100
    : 0;

  const title = (input.title?.trim() || `P&L — Last ${summary.periodDays}d (${summary.asOf})`).slice(0, 200);
  const sheetData = buildPnlRows(summary, costsMinor);

  let sheetUrl: string | undefined;
  let fileUrl: string | undefined;
  let fileSizeBytes: number | undefined;

  if (deliver === "sheet" || deliver === "both") {
    const sheet = await createSpreadsheet(
      userId,
      title,
      sheetData.map((s) => ({
        name: s.name,
        data: s.data as (string | number)[][],
      }))
    );
    sheetUrl = sheet.url;
  }

  if (deliver === "xlsx" || deliver === "both") {
    const xlsxSheets = sheetData.map((s) => {
      const headers = s.data[0] ?? [];
      const rows = s.data.slice(1);
      return {
        name: s.name,
        headers: headers.map((h) => String(h)),
        rows: rows.map((r) => r.map((c) => String(c ?? ""))),
      };
    });
    const buffer = await generateXlsx({ title, sheets: xlsxSheets });
    const filename = `${sanitizeFilename(title)}.xlsx`;
    const upload = await uploadAgentFile(
      userId,
      filename,
      buffer,
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    fileUrl = upload.signedUrl;
    fileSizeBytes = upload.sizeBytes;
  }

  return {
    asOf: summary.asOf,
    periodDays: summary.periodDays,
    currency: summary.currency,
    livemode: summary.livemode,
    netRevenueMinor: summary.netRevenueMinor,
    totalCostsMinor,
    netIncomeMinor,
    marginPct,
    sheetUrl,
    fileUrl,
    fileSizeBytes,
    hasCosts: costsMinor.length > 0,
    costBreakdown: costsMinor,
  };
}

export function formatPnlSnapshotResult(
  title: string,
  result: PnlSnapshotResult
): string {
  const fm = (v: number) => formatMoney(v, result.currency);
  const lines: string[] = [];
  lines.push(
    `P&L snapshot built — last ${result.periodDays} days (as of ${result.asOf}, ${
      result.livemode ? "live" : "test"
    } mode).`
  );
  lines.push(
    `Net revenue ${fm(result.netRevenueMinor)} − total costs ${fm(
      result.totalCostsMinor
    )} = net income ${fm(result.netIncomeMinor)} (${result.marginPct.toFixed(1)}% margin).`
  );
  if (!result.hasCosts) {
    lines.push("Note: no cost categories were supplied, so the P&L shows revenue only.");
  }
  lines.push("");
  lines.push("Include the following links verbatim in your response so the user can open them:");
  if (result.sheetUrl) {
    lines.push(`- [${title} (Google Sheet)](${result.sheetUrl})`);
  }
  if (result.fileUrl) {
    const size = result.fileSizeBytes ?? 0;
    const kb = Math.round(size / 1024);
    const sizeLabel = kb < 1024 ? `${kb} KB` : `${(kb / 1024).toFixed(1)} MB`;
    lines.push(`- [${title}.xlsx (${sizeLabel}, 24h link)](${result.fileUrl})`);
  }
  return lines.join("\n");
}
