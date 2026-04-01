import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Download, Search, Loader2, Eye, FileX, Trash2, ChevronLeft, ChevronRight, MapPin } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useInvoices, useCancelInvoice, useDeleteInvoice } from "@/hooks/useInvoices";
import { useDefaultCurrency } from "@/hooks/useCurrency";
import { CreateInvoiceDialog } from "@/components/admin/CreateInvoiceDialog";
import { InvoiceViewDialog } from "@/components/admin/InvoiceViewDialog";
import { format } from "date-fns";
import { useAdmin } from "@/hooks/useAdmin";
import { useAllCities } from "@/hooks/useBookings";
import { useAdminCity } from "@/contexts/AdminCityContext";

function useAvailableCities() {
  const { isAdmin, assignedCities } = useAdmin();
  const { data: allCities, isLoading } = useAllCities();
  const cities = isAdmin
    ? allCities
    : (allCities ?? []).filter((c) => assignedCities.includes(c));
  return { data: cities, isLoading };
}

function InvoiceListSection({ city }: { city: string }) {
  const { toast } = useToast();
  const currency = useDefaultCurrency();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [page, setPage] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [viewId, setViewId] = useState<string | null>(null);

  const cancelInvoice = useCancelInvoice();
  const deleteInvoice = useDeleteInvoice();

  const { data, isLoading } = useInvoices({
    city,
    search: search || undefined,
    status: statusFilter || undefined,
    invoiceType: typeFilter || undefined,
    startDate: startDate || undefined,
    endDate: endDate || undefined,
    page,
    pageSize: 25,
  });

  const invoices = data?.data ?? [];
  const totalCount = data?.count ?? 0;
  const totalPages = Math.ceil(totalCount / 25);

  const handleCsvExport = () => {
    if (!invoices.length) return;
    const headers = ["Invoice #", "Date", "Customer", "Type", "B2B/B2C", "Subtotal", "CGST", "SGST", "IGST", "Total", "Status"];
    const rows = invoices.map((inv: any) => [
      inv.invoice_number, inv.invoice_date, inv.customer_name, inv.invoice_type,
      inv.customer_gstin ? "B2B" : "B2C", inv.subtotal, inv.cgst_total, inv.sgst_total, inv.igst_total, inv.total, inv.status,
    ]);
    const csv = [headers, ...rows].map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `invoices_${city}_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCancel = async (id: string) => {
    if (!confirm("Cancel this invoice and generate a credit note?")) return;
    try {
      await cancelInvoice.mutateAsync(id);
      toast({ title: "Invoice cancelled", description: "Credit note generated." });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Permanently delete this invoice? The invoice number will be recycled for the next invoice. This cannot be undone.")) return;
    try {
      await deleteInvoice.mutateAsync(id);
      toast({ title: "Invoice deleted", description: "Invoice number will be reused." });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> Create Invoice
        </Button>
        <Button variant="outline" onClick={handleCsvExport} disabled={!invoices.length}>
          <Download className="mr-2 h-4 w-4" /> Export CSV
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input placeholder="Search invoices…" className="pl-8" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} />
        </div>
        <Input type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); setPage(0); }} />
        <span className="text-muted-foreground text-sm self-center">to</span>
        <Input type="date" value={endDate} onChange={(e) => { setEndDate(e.target.value); setPage(0); }} />
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v === "all" ? "" : v); setPage(0); }}>
          <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="issued">Issued</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v === "all" ? "" : v); setPage(0); }}>
          <SelectTrigger><SelectValue placeholder="Type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="invoice">Invoice</SelectItem>
            <SelectItem value="credit_note">Credit Note</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <Loader2 className="mx-auto h-8 w-8 animate-spin" />
      ) : invoices.length === 0 ? (
        <p className="text-center text-muted-foreground py-12">No invoices found.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 border-b border-border">
                <th className="text-left py-2.5 px-3 font-medium text-muted-foreground">Invoice #</th>
                <th className="text-left py-2.5 px-3 font-medium text-muted-foreground">Date</th>
                <th className="text-left py-2.5 px-3 font-medium text-muted-foreground">Customer</th>
                <th className="text-left py-2.5 px-3 font-medium text-muted-foreground">Type</th>
                <th className="text-right py-2.5 px-3 font-medium text-muted-foreground">Amount</th>
                <th className="text-left py-2.5 px-3 font-medium text-muted-foreground">Status</th>
                <th className="text-right py-2.5 px-3 font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv: any) => (
                <tr key={inv.id} className="border-b border-border/50 hover:bg-muted/30">
                  <td className="py-2.5 px-3 font-mono text-xs">{inv.invoice_number}</td>
                  <td className="py-2.5 px-3">{format(new Date(inv.invoice_date), "dd MMM yyyy")}</td>
                  <td className="py-2.5 px-3">
                    <div>{inv.customer_name}</div>
                    {inv.customer_gstin && <span className="text-xs text-muted-foreground">GSTIN: {inv.customer_gstin}</span>}
                  </td>
                  <td className="py-2.5 px-3">
                    <Badge variant={inv.invoice_type === "credit_note" ? "destructive" : "secondary"} className="text-xs">
                      {inv.invoice_type === "credit_note" ? "Credit Note" : inv.customer_gstin ? "B2B" : "B2C"}
                    </Badge>
                  </td>
                  <td className="py-2.5 px-3 text-right font-medium">{currency.format(Number(inv.total))}</td>
                  <td className="py-2.5 px-3">
                    <Badge variant={inv.status === "cancelled" ? "destructive" : "outline"} className="text-xs">{inv.status}</Badge>
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setViewId(inv.id)}>
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                      {inv.status === "issued" && inv.invoice_type === "invoice" && (
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleCancel(inv.id)} disabled={cancelInvoice.isPending} title="Cancel & create credit note">
                          <FileX className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDelete(inv.id)} disabled={deleteInvoice.isPending} title="Permanently delete">
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">{totalCount} invoices</p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm text-muted-foreground">{page + 1} / {totalPages}</span>
            <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <CreateInvoiceDialog open={createOpen} onOpenChange={setCreateOpen} city={city} />
      <InvoiceViewDialog invoiceId={viewId} onClose={() => setViewId(null)} />
    </div>
  );
}

export function AdminSalesInvoicesTab() {
  const { data: cities, isLoading: loadingCities } = useAvailableCities();
  const { selectedCity: globalCity } = useAdminCity();
  const [localCity, setLocalCity] = useState<string>("");

  useEffect(() => {
    if (cities?.length && !localCity) {
      setLocalCity(cities[0]);
    }
  }, [cities, localCity]);

  // Global city overrides local selection
  const effectiveCity = globalCity || localCity;

  if (loadingCities) return <Loader2 className="mx-auto h-8 w-8 animate-spin" />;

  if (!cities?.length) {
    return <p className="text-center text-muted-foreground py-12">No cities configured. Set up a city in Bay Config first.</p>;
  }

  return (
    <div className="space-y-4">
      {/* Only show local city picker when global is "All Cities" */}
      {!globalCity && (
        <div className="flex items-center gap-3">
          <MapPin className="h-4 w-4 text-muted-foreground" />
          <Select value={localCity} onValueChange={setLocalCity}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Select instance" />
            </SelectTrigger>
            <SelectContent>
              {cities.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Badge variant="outline" className="text-xs">{localCity}</Badge>
        </div>
      )}

      {effectiveCity && <InvoiceListSection city={effectiveCity} />}
    </div>
  );
}
