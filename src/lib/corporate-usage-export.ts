import * as XLSX from "xlsx";
import { format } from "date-fns";

export interface UsageRow {
  kind: "booking" | "coaching";
  start_time: string | null;
  user_name: string | null;
  city: string | null;
  bay_name: string | null;
  duration_minutes: number | null;
  session_type: string | null;
  cancelled: boolean;
}

export interface UsageReportMeta {
  accountName: string;
  city: string | null;
  startDate: string;
  endDate: string;
  billingProductName?: string;
  unitPrice?: number;
  gstRate?: number;
}

function safeDate(s: string | null) {
  if (!s) return "";
  try {
    return format(new Date(s), "dd MMM yyyy HH:mm");
  } catch {
    return s;
  }
}

export function exportCorporateUsageExcel(items: UsageRow[], meta: UsageReportMeta) {
  const billable = items.filter((i) => !i.cancelled);
  const cancelled = items.filter((i) => i.cancelled);
  const sessionCount = billable.length;
  const unit = Number(meta.unitPrice ?? 0);
  const gross = sessionCount * unit;

  const summary = [
    ["Corporate Usage Report"],
    [],
    ["Account", meta.accountName],
    ["City", meta.city ?? "(all)"],
    ["Period", `${meta.startDate} → ${meta.endDate}`],
    ["Billing Item", meta.billingProductName ?? "—"],
    ["Unit Price", unit || ""],
    ["GST Rate", meta.gstRate != null ? `${meta.gstRate}%` : ""],
    ["Billable Sessions", sessionCount],
    ["Cancelled (excluded)", cancelled.length],
    ["Gross (inclusive)", gross || ""],
    [],
    ["Generated", new Date().toLocaleString()],
  ];

  const detailHeader = ["#", "Date / Time", "Type", "User", "City", "Bay", "Duration (min)", "Session Type", "Status"];
  const detailRows = items.map((r, i) => [
    i + 1,
    safeDate(r.start_time),
    r.kind,
    r.user_name ?? "",
    r.city ?? "",
    r.bay_name ?? "",
    r.duration_minutes ?? "",
    r.session_type ?? "",
    r.cancelled ? "Cancelled" : "Billable",
  ]);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summary), "Summary");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([detailHeader, ...detailRows]), "Sessions");

  const safeName = meta.accountName.replace(/[^a-z0-9]+/gi, "_").slice(0, 40);
  const cityTag = meta.city ? `_${meta.city.replace(/\s+/g, "_")}` : "";
  const fileName = `Usage_${safeName}${cityTag}_${meta.startDate}_${meta.endDate}.xlsx`;
  XLSX.writeFile(wb, fileName);
  return fileName;
}
