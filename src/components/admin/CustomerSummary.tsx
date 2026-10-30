import { useCustomerReport } from "@/hooks/useCustomerReport";
import { formatCustomerSpend } from "@/lib/customer-report";
import { Skeleton } from "@/components/ui/skeleton";

export function CustomerSummary({ profileId, city }: { profileId: string; city?: string | null }) {
  const { data, isLoading, error } = useCustomerReport({ _profile_id: profileId, _city: city || undefined });
  if (isLoading) return <Skeleton className="h-20 w-full" />;
  if (error) return <p className="text-sm text-destructive">Customer summary unavailable: {error.message}</p>;
  const row = data?.rows[0];
  if (!row) return null;
  const date = (value: string | null) => value ? new Date(value).toLocaleDateString(undefined, { timeZone: data?.timezone }) : "—";
  return <section className="border-y border-border py-4"><div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
    {[['Last qualifying visit', date(row.last_visit)], ['Next booking', date(row.next_booking)], ['Qualifying visits', String(row.lifetime_visits)], ['Personal net spend · lifetime', formatCustomerSpend(row.lifetime_spend)]].map(([label, value]) => <div key={label}><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 break-words text-sm font-medium">{value}</p></div>)}
  </div>{row.corporate_visits > 0 && <p className="mt-3 text-xs text-muted-foreground">Corporate-paid visits: {row.corporate_visits} · billed separately</p>}</section>;
}