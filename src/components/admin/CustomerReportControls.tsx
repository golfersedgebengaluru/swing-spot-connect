import { Download, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { CustomerPreset, CustomerReport } from "@/lib/customer-report";

export type CustomerFilters = { from: string; to: string; preset: CustomerPreset };
export const initialCustomerFilters: CustomerFilters = { from: "", to: "", preset: "all" };
export function CustomerReportControls({ filters, onChange, report, exporting, onExport }: {
  filters: CustomerFilters; onChange: (value: CustomerFilters) => void;
  report?: CustomerReport; exporting: boolean; onExport: () => void;
}) {
  const change = (key: keyof CustomerFilters, value: string) => onChange({ ...filters, [key]: value });
  return <section className="space-y-3 border-y border-border py-4">
    <div className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_auto]">
      <div><Label>Customer report</Label><Select value={filters.preset} onValueChange={v => change("preset", v)}><SelectTrigger aria-label="Customer report"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All customers</SelectItem><SelectItem value="first-time">First-time visitors</SelectItem><SelectItem value="repeat">Repeat visitors</SelectItem><SelectItem value="inactive">Inactive · 60 days</SelectItem><SelectItem value="low-hours">Low hours · ≤1</SelectItem><SelectItem value="online">Online visitors</SelectItem><SelectItem value="renewal-opportunities">Renewal opportunities</SelectItem><SelectItem value="inactive-repeat">Inactive repeat customers</SelectItem></SelectContent></Select></div>
      <div><Label htmlFor="customer-from">From</Label><Input id="customer-from" type="date" value={filters.from} onChange={e => change("from", e.target.value)} max={filters.to || undefined} /></div>
      <div><Label htmlFor="customer-to">To</Label><Input id="customer-to" type="date" value={filters.to} onChange={e => change("to", e.target.value)} min={filters.from || undefined} /></div>
      <Button variant="ghost" size="icon" aria-label="Clear dates" title="Clear dates" disabled={!filters.from && !filters.to} onClick={() => onChange({ ...filters, from: "", to: "" })}><X className="h-4 w-4" /></Button>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-3">
      {report && <div className="text-xs text-muted-foreground"><span>{report.total} customers · {report.cities.join(", ")} · {filters.from || filters.to ? `${filters.from || "Beginning"} – ${filters.to || "Today"}` : "All dates"}</span><span className="ml-3">Online bookings linked: {report.reconciliation.linked}/{report.reconciliation.completed_online}</span>{(report.reconciliation.needs_review + report.reconciliation.ambiguous + report.reconciliation.missing_contact > 0) && <span className="ml-3 text-destructive">Customer links requiring review: {report.reconciliation.needs_review + report.reconciliation.ambiguous + report.reconciliation.missing_contact}</span>}{(report.unlinked_revenue + report.missing_revenue_date > 0) && <span className="ml-3 text-destructive">Revenue exceptions: {report.unlinked_revenue + report.missing_revenue_date}</span>}</div>}
      <Button variant="outline" size="sm" onClick={onExport} disabled={exporting || !report || report.total === 0}>{exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}Export customers</Button>
    </div>
  </section>;
}