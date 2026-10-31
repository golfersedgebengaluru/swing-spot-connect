import type { Json } from "@/integrations/supabase/types";

export type AttentionCustomer = {
  id: string; display_name: string | null; email: string | null;
  hours_remaining: number; next_booking: string | null;
  last_visit: string | null; lifetime_visits: number;
};
export type DashboardAttention = {
  renewals: AttentionCustomer[]; inactive: AttentionCustomer[];
  first_visits: string[]; renewal_total: number; inactive_total: number;
};
export function parseDashboardAttention(value: Json): DashboardAttention {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || !Array.isArray(value.renewals) || !Array.isArray(value.inactive)
    || !Array.isArray(value.first_visits) || !value.first_visits.every(id => typeof id === "string")
    || typeof value.renewal_total !== "number" || typeof value.inactive_total !== "number") {
    throw new Error("Invalid dashboard customer response");
  }
  for (const row of [...value.renewals, ...value.inactive]) {
    if (!row || typeof row !== "object" || Array.isArray(row) || typeof row.id !== "string"
      || typeof row.hours_remaining !== "number" || typeof row.lifetime_visits !== "number") {
      throw new Error("Invalid dashboard customer row");
    }
  }
  return value as unknown as DashboardAttention;
}