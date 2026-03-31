import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Download, Search, Loader2, Eye, FileX, Trash2, Save, ChevronLeft, ChevronRight, MapPin } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useInvoices, useGstProfile, useSaveGstProfile, useCancelInvoice, useDeleteInvoice, type GstProfile } from "@/hooks/useInvoices";
import { useActiveFinancialYear, usePerCityFyToggle } from "@/hooks/useRevenue";
import { useDefaultCurrency } from "@/hooks/useCurrency";
import { INDIAN_STATES, validateGSTIN } from "@/lib/gst-utils";
import { CreateInvoiceDialog } from "@/components/admin/CreateInvoiceDialog";
import { InvoiceViewDialog } from "@/components/admin/InvoiceViewDialog";
import { AdminFinancialYearsCard } from "@/components/admin/AdminFinancialYearsCard";
import { InvoiceSettingsCard } from "@/components/admin/InvoiceSettingsCard";
import { CityPaymentsSection } from "@/components/admin/CityPaymentsSection";
import { format } from "date-fns";
import { useAdmin } from "@/hooks/useAdmin";
import { useAllCities } from "@/hooks/useBookings";

// Hook to get available cities scoped by role
function useAvailableCities() {
  const { isAdmin, assignedCities } = useAdmin();
  const { data: allCities, isLoading } = useAllCities();
  const cities = isAdmin
    ? allCities
    : (allCities ?? []).filter((c) => assignedCities.includes(c));
  return { data: cities, isLoading };
}

// ─── Invoice List ───────────────────────────────────────
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

// ─── GST Settings (per-city) ────────────────────────────
function GstSettingsSection({ city }: { city: string }) {
  const { toast } = useToast();
  const { data: profile, isLoading } = useGstProfile(city);
  const save = useSaveGstProfile();
  const [form, setForm] = useState<Partial<GstProfile>>({});
  const [gstinValid, setGstinValid] = useState<boolean | null>(null);

  // Reset form when city changes
  useEffect(() => { setForm({}); setGstinValid(null); }, [city]);

  const getValue = (key: keyof GstProfile) => {
    if (key in form) return String(form[key] ?? "");
    return String(profile?.[key] ?? "");
  };

  const handleGstinChange = (value: string) => {
    const upper = value.toUpperCase();
    setForm((f) => ({ ...f, gstin: upper }));
    if (upper.length === 15) {
      const result = validateGSTIN(upper);
      setGstinValid(result.valid);
      if (result.valid && result.stateCode) {
        const state = INDIAN_STATES.find((s) => s.code === result.stateCode);
        if (state) {
          setForm((f) => ({ ...f, gstin: upper, state: state.name, state_code: state.code }));
        }
      }
    } else {
      setGstinValid(null);
    }
  };

  const handleSave = async () => {
    if (Object.keys(form).length === 0) return;
    try {
      const merged: GstProfile = {
        city,
        legal_name: form.legal_name ?? profile?.legal_name ?? "",
        gstin: form.gstin ?? profile?.gstin ?? "",
        address: form.address ?? profile?.address ?? "",
        state: form.state ?? profile?.state ?? "",
        state_code: form.state_code ?? profile?.state_code ?? "",
        invoice_prefix: form.invoice_prefix ?? profile?.invoice_prefix ?? "INV",
        invoice_start_number: form.invoice_start_number ?? profile?.invoice_start_number ?? 1,
      };
      await save.mutateAsync(merged);
      setForm({});
      toast({ title: "Saved", description: `GST profile updated for ${city}.` });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  if (isLoading) return <Loader2 className="mx-auto h-8 w-8 animate-spin" />;

  return (
    <div className="space-y-6 max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">GST Profile — {city}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Legal Business Name</Label>
            <Input value={getValue("legal_name")} onChange={(e) => setForm((f) => ({ ...f, legal_name: e.target.value }))} className="mt-1" />
          </div>
          <div>
            <Label>GSTIN</Label>
            <div className="relative mt-1">
              <Input
                value={getValue("gstin")}
                onChange={(e) => handleGstinChange(e.target.value)}
                maxLength={15}
                placeholder="22AAAAA0000A1Z5"
                className="pr-20"
              />
              {gstinValid !== null && (
                <span className={`absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium ${gstinValid ? "text-green-600" : "text-destructive"}`}>
                  {gstinValid ? "✓ Valid" : "✗ Invalid"}
                </span>
              )}
            </div>
          </div>
          <div>
            <Label>Registered Address</Label>
            <Input value={getValue("address")} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} className="mt-1" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>State</Label>
              <Select value={getValue("state")} onValueChange={(v) => {
                const state = INDIAN_STATES.find((s) => s.name === v);
                setForm((f) => ({ ...f, state: v, state_code: state?.code ?? "" }));
              }}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select state" /></SelectTrigger>
                <SelectContent>
                  {INDIAN_STATES.map((s) => (
                    <SelectItem key={s.code} value={s.name}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>State Code</Label>
              <Input value={getValue("state_code")} readOnly className="mt-1 bg-muted" />
            </div>
          </div>
          <Button onClick={handleSave} disabled={save.isPending || Object.keys(form).length === 0}>
            {save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save GST Profile
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Invoice Numbering — {city}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Prefix</Label>
              <Input value={getValue("invoice_prefix")} onChange={(e) => setForm((f) => ({ ...f, invoice_prefix: e.target.value }))} className="mt-1" placeholder="INV" />
              <p className="text-xs text-muted-foreground mt-1">e.g. INV → INV/FY2025-26/0001</p>
            </div>
            <div>
              <Label>Starting Number (new FY)</Label>
              <Input type="number" min={1} value={getValue("invoice_start_number")} onChange={(e) => setForm((f) => ({ ...f, invoice_start_number: parseInt(e.target.value) || 1 }))} className="mt-1" />
            </div>
          </div>
          <Button onClick={handleSave} disabled={save.isPending || Object.keys(form).length === 0}>
            {save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Main Tab ───────────────────────────────────────────
export function AdminFinanceTab() {
  const [tab, setTab] = useState("invoices");
  const { isAdmin, isSiteAdmin } = useAdmin();
  const { data: perCityFyEnabled } = usePerCityFyToggle();
  const { data: cities, isLoading: loadingCities } = useAvailableCities();
  const [selectedCity, setSelectedCity] = useState<string>("");

  // Show per-city FY tab only when toggle is on AND user is site-admin (or admin)
  const showCityFY = !!perCityFyEnabled;

  // Auto-select first city
  useEffect(() => {
    if (cities?.length && !selectedCity) {
      setSelectedCity(cities[0]);
    }
  }, [cities, selectedCity]);

  if (loadingCities) return <Loader2 className="mx-auto h-8 w-8 animate-spin" />;

  if (!cities?.length) {
    return <p className="text-center text-muted-foreground py-12">No cities configured. Set up a city in Bay Config first.</p>;
  }

  return (
    <div className="space-y-4">
      {/* City selector */}
      <div className="flex items-center gap-3">
        <MapPin className="h-4 w-4 text-muted-foreground" />
        <Select value={selectedCity} onValueChange={setSelectedCity}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Select instance" />
          </SelectTrigger>
          <SelectContent>
            {cities.map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Badge variant="outline" className="text-xs">{selectedCity}</Badge>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
          <TabsTrigger value="settings">GST Settings</TabsTrigger>
          <TabsTrigger value="invoice_settings">Invoice Template</TabsTrigger>
          {showCityFY && <TabsTrigger value="financial_year">Financial Year</TabsTrigger>}
        </TabsList>
        <TabsContent value="invoices">
          {selectedCity && <InvoiceListSection city={selectedCity} />}
        </TabsContent>
        <TabsContent value="settings">
          {selectedCity && <GstSettingsSection city={selectedCity} />}
        </TabsContent>
        <TabsContent value="invoice_settings">
          {selectedCity && <InvoiceSettingsCard city={selectedCity} />}
        </TabsContent>
        {showCityFY && (
          <TabsContent value="financial_year">
            {selectedCity && (
              <AdminFinancialYearsCard
                city={selectedCity}
                title={`Financial Year — ${selectedCity}`}
              />
            )}
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
