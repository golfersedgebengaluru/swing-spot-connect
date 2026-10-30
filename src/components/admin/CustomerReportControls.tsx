import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { CustomerPreset, CustomerReport } from "@/lib/customer-report";

export type CustomerFilters = { preferredCity: string; visitedCity: string; from: string; to: string; preset: CustomerPreset };
export const initialCustomerFilters: CustomerFilters = { preferredCity: "", visitedCity: "", from: "", to: "", preset: "all" };
export function CustomerReportControls({ filters, onChange, cities, report, exporting, onExport }: {
  filters: CustomerFilters; onChange: (value: CustomerFilters) => void; cities: string[];
  report?: CustomerReport; exporting: boolean; onExport: () => void;
}) {
  const change = (key: keyof CustomerFilters, value: string) => onChange({ ...filters, [key]: value });
  const location = (key: "preferredCity" | "visitedCity", label: string) => <div className="min-w-0"><Label>{label}</Label><Select value={filters[key] || "all"} onValueChange={v => change(key, v === "all" ? "" : v)}><SelectTrigger aria-label={label}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All permitted locations</SelectItem>{cities.map(city => <SelectItem key={city} value={city}>{city}</SelectItem>)}</SelectContent></Select></div>;
  return <section className="space-y-3 border-y border-border py-4">
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <div><Label>Customer report</Label><Select value={filters.preset} onValueChange={v => change("preset", v)}><SelectTrigger aria-label="Customer report"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All customers</SelectItem><SelectItem value="first-time">First-time visitors</SelectItem><SelectItem value="repeat">Repeat visitors</SelectItem><SelectItem value="inactive">Inactive · 60 days</SelectItem><SelectItem value="low-hours">Low hours · ≤1</SelectItem><SelectItem value="online">Online visitors</SelectItem></SelectContent></Select></div>
      {location("preferredCity", "Preferred City")}{location("visitedCity", "Visited Location")}
      <div><Label htmlFor="customer-from">Period from</Label><Input id="customer-from" type="date" value={filters.from} onChange={e => change("from", e.target.value)} /></div>
      <div><Label htmlFor="customer-to">Period to / as of</Label><Input id="customer-to" type="date" value={filters.to} onChange={e => change("to", e.target.value)} min={filters.from || undefined} /></div>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-3">
      {report && <div className="text-xs text-muted-foreground"><span>{report.total} customers · {report.cities.join(", ")}</span><span className="ml-3">Online bookings linked: {report.reconciliation.linked}/{report.reconciliation.completed_online}</span>{(report.reconciliation.needs_review + report.reconciliation.ambiguous + report.reconciliation.missing_contact > 0) && <span className="ml-3 text-destructive">Customer links requiring review: {report.reconciliation.needs_review + report.reconciliation.ambiguous + report.reconciliation.missing_contact}</span>}{(report.unlinked_revenue + report.missing_revenue_date > 0) && <span className="ml-3 text-destructive">Revenue exceptions: {report.unlinked_revenue + report.missing_revenue_date}</span>}</div>}
      <Button variant="outline" size="sm" onClick={onExport} disabled={exporting || !report || report.total === 0}>{exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}Export customers</Button>
    </div>
  </section>;
}