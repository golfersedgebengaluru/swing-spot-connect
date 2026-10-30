import type { Json } from "@/integrations/supabase/types";

export type CustomerPreset = "all" | "first-time" | "repeat" | "inactive" | "low-hours" | "online";
export type CustomerRow = {
  id: string; user_id: string | null; display_name: string | null; email: string | null; phone: string | null;
  preferred_city: string | null; user_type: string | null; customer_status: string; points: number;
  created_at: string; extended_hours_access: boolean; member_hours_id: string | null;
  hours_purchased: number; hours_used: number; hours_remaining: number;
  first_visit: string | null; last_visit: string | null; next_booking: string | null;
  visit_count: number; lifetime_visits: number; corporate_visits: number; visited_cities: string[];
  period_spend: Record<string, number>; lifetime_spend: Record<string, number>; booking_channel: string;
};
export type CustomerReport = {
  rows: CustomerRow[]; total: number; as_of: string; cities: string[]; timezone: string;
  reconciliation: { completed_online: number; linked: number; ambiguous: number; missing_contact: number; needs_review: number };
  unlinked_revenue: number; missing_revenue_date: number;
};
export function parseCustomerReport(value: Json): CustomerReport {
  if (!value || typeof value !== "object" || Array.isArray(value) || !Array.isArray(value.rows) || typeof value.total !== "number") throw new Error("Invalid customer report response");
  return value as unknown as CustomerReport;
}
export function formatCustomerSpend(amounts: Record<string, number> | undefined): string {
  return Object.entries(amounts ?? {}).map(([currency, amount]) => `${currency} ${Number(amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`).join(" · ") || "—";
}
export function signedCustomerTotal(amounts: readonly number[]): number { return amounts.reduce((sum, amount) => sum + amount, 0); }
export function csvCell(value: unknown): string {
  const text = String(value ?? "");
  const safe = /^[\s\u0000-\u001f]*[=+@-]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}
export function customerReportCsv(rows: CustomerRow[]): string {
  const columns = ["Profile ID", "Name", "Email", "Phone", "Customer status", "Preferred City", "Visited Locations", "Last Visit", "Next Booking", "Period Visits", "Lifetime Visits", "Corporate Visits", "Period Personal Net Spend", "Lifetime Personal Net Spend", "Remaining Hours (account-wide)", "Booking Channel"];
  return "\uFEFF" + [columns, ...rows.map(r => [r.id, r.display_name, r.email, r.phone, r.customer_status, r.preferred_city, r.visited_cities.join("; "), r.last_visit, r.next_booking, r.visit_count, r.lifetime_visits, r.corporate_visits, formatCustomerSpend(r.period_spend), formatCustomerSpend(r.lifetime_spend), r.member_hours_id ? r.hours_remaining : "", r.booking_channel])].map(row => row.map(csvCell).join(",")).join("\r\n");
}