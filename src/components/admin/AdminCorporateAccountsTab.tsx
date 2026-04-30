import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Building2, Plus, Pencil, Trash2, Loader2, Receipt, Users, Calendar, CheckCircle2, AlertCircle,
} from "lucide-react";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import {
  useCorporateAccounts, useUpsertCorporateAccount, useDeleteCorporateAccount,
  useCorporateMembers, useDeferredItemsForCorporate,
  type CorporateAccount,
} from "@/hooks/useCorporateAccounts";
import { useCreateInvoice } from "@/hooks/useInvoices";
import { useProducts } from "@/hooks/useProducts";
import { useBayPricing } from "@/hooks/usePricing";
import { calculateLineItems, getGstType, validateGSTIN, INDIAN_STATES } from "@/lib/gst-utils";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

export function AdminCorporateAccountsTab() {
  const { data: accounts, isLoading } = useCorporateAccounts(true);
  const [editing, setEditing] = useState<CorporateAccount | null>(null);
  const [creating, setCreating] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);

  const activeAccount = useMemo(
    () => (accounts ?? []).find((a) => a.id === activeId) ?? null,
    [accounts, activeId]
  );

  if (isLoading) return <Loader2 className="mx-auto h-8 w-8 animate-spin" />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Building2 className="h-5 w-5" /> Corporate Accounts
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Customers billed monthly via consolidated invoice instead of paying per session.
          </p>
        </div>
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4 mr-1" /> New Corporate Account
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="text-left p-3">Name</th>
                <th className="text-left p-3 hidden sm:table-cell">GSTIN</th>
                <th className="text-left p-3 hidden md:table-cell">Billing Email</th>
                <th className="text-left p-3 hidden lg:table-cell">Cycle</th>
                <th className="text-left p-3">Status</th>
                <th className="text-right p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(accounts ?? []).length === 0 && (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-muted-foreground">
                    No corporate accounts yet. Click "New Corporate Account" to add one.
                  </td>
                </tr>
              )}
              {(accounts ?? []).map((a) => (
                <tr
                  key={a.id}
                  className={`border-t border-border hover:bg-muted/30 cursor-pointer ${activeId === a.id ? "bg-primary/5" : ""}`}
                  onClick={() => setActiveId(a.id)}
                >
                  <td className="p-3 font-medium">{a.name}</td>
                  <td className="p-3 hidden sm:table-cell text-xs">{a.gstin || "—"}</td>
                  <td className="p-3 hidden md:table-cell text-xs">{a.billing_email || "—"}</td>
                  <td className="p-3 hidden lg:table-cell text-xs">Day {a.billing_cycle_day} · NET {a.payment_terms_days}</td>
                  <td className="p-3">
                    <Badge variant={a.is_active ? "default" : "secondary"} className="text-[10px]">
                      {a.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </td>
                  <td className="p-3 text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => { e.stopPropagation(); setEditing(a); }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {activeAccount && (
        <CorporateAccountDetail account={activeAccount} />
      )}

      {(creating || editing) && (
        <CorporateAccountFormDialog
          account={editing}
          onClose={() => { setCreating(false); setEditing(null); }}
        />
      )}
    </div>
  );
}

// ─── Form dialog ────────────────────────────────────
function CorporateAccountFormDialog({
  account, onClose,
}: { account: CorporateAccount | null; onClose: () => void }) {
  const { toast } = useToast();
  const upsert = useUpsertCorporateAccount();
  const remove = useDeleteCorporateAccount();
  const [form, setForm] = useState({
    name: account?.name ?? "",
    gstin: account?.gstin ?? "",
    billing_email: account?.billing_email ?? "",
    billing_address: account?.billing_address ?? "",
    state: account?.state ?? "",
    state_code: account?.state_code ?? "",
    billing_cycle_day: account?.billing_cycle_day ?? 1,
    payment_terms_days: account?.payment_terms_days ?? 15,
    notes: account?.notes ?? "",
    is_active: account?.is_active ?? true,
  });

  const handleGstin = (value: string) => {
    const upper = value.toUpperCase();
    setForm((f) => ({ ...f, gstin: upper }));
    if (upper.length === 15) {
      const r = validateGSTIN(upper);
      if (r.valid && r.stateCode) {
        const s = INDIAN_STATES.find((x) => x.code === r.stateCode);
        if (s) setForm((f) => ({ ...f, gstin: upper, state: s.name, state_code: s.code }));
      }
    }
  };

  const save = async () => {
    if (!form.name.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }
    try {
      await upsert.mutateAsync({ id: account?.id, ...form });
      toast({ title: account ? "Account updated" : "Account created" });
      onClose();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const del = async () => {
    if (!account) return;
    if (!confirm(`Delete corporate account "${account.name}"? This cannot be undone. Linked profiles will be unassigned.`)) return;
    try {
      await remove.mutateAsync(account.id);
      toast({ title: "Account deleted" });
      onClose();
    } catch (e: any) {
      toast({ title: "Cannot delete", description: e.message, variant: "destructive" });
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{account ? "Edit Corporate Account" : "New Corporate Account"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label>Name *</Label>
            <Input className="mt-1" value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Apexlynx Pvt Ltd" />
          </div>

          <div>
            <Label>GSTIN</Label>
            <Input className="mt-1" value={form.gstin} maxLength={15}
              onChange={(e) => handleGstin(e.target.value)} placeholder="22AAAAA0000A1Z5" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>State</Label>
              <Select value={form.state} onValueChange={(v) => {
                const s = INDIAN_STATES.find((x) => x.name === v);
                setForm({ ...form, state: v, state_code: s?.code ?? "" });
              }}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  {INDIAN_STATES.map((s) => <SelectItem key={s.code} value={s.name}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>State Code</Label>
              <Input className="mt-1 bg-muted" value={form.state_code} readOnly />
            </div>
          </div>

          <div>
            <Label>Billing Email</Label>
            <Input className="mt-1" type="email" value={form.billing_email}
              onChange={(e) => setForm({ ...form, billing_email: e.target.value })}
              placeholder="accounts@apexlynx.com" />
          </div>

          <div>
            <Label>Billing Address</Label>
            <Textarea className="mt-1" rows={2} value={form.billing_address}
              onChange={(e) => setForm({ ...form, billing_address: e.target.value })} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Billing Cycle Day</Label>
              <Input type="number" min={1} max={28} className="mt-1"
                value={form.billing_cycle_day || ""}
                onChange={(e) => setForm({ ...form, billing_cycle_day: parseInt(e.target.value) || 1 })} />
              <p className="text-[10px] text-muted-foreground mt-0.5">Day of month invoice runs (1-28).</p>
            </div>
            <div>
              <Label>Payment Terms (days)</Label>
              <Input type="number" min={0} className="mt-1"
                value={form.payment_terms_days || ""}
                onChange={(e) => setForm({ ...form, payment_terms_days: parseInt(e.target.value) || 0 })} />
            </div>
          </div>

          <div>
            <Label>Notes</Label>
            <Textarea className="mt-1" rows={2} value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium">Account Active</p>
              <p className="text-xs text-muted-foreground">Inactive accounts hide from new bookings.</p>
            </div>
            <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
          </div>
        </div>

        <DialogFooter className="gap-2">
          {account && (
            <Button variant="destructive" size="sm" onClick={del} disabled={remove.isPending}>
              <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
            </Button>
          )}
          <div className="flex-1" />
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={upsert.isPending}>
            {upsert.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Detail panel ─────────────────────────────────
function CorporateAccountDetail({ account }: { account: CorporateAccount }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Building2 className="h-4 w-4" /> {account.name}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="billing">
          <TabsList>
            <TabsTrigger value="billing"><Receipt className="h-3.5 w-3.5 mr-1" /> Billing</TabsTrigger>
            <TabsTrigger value="members"><Users className="h-3.5 w-3.5 mr-1" /> Members</TabsTrigger>
          </TabsList>
          <TabsContent value="billing" className="pt-4">
            <BillingPanel account={account} />
          </TabsContent>
          <TabsContent value="members" className="pt-4">
            <MembersPanel account={account} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function MembersPanel({ account }: { account: CorporateAccount }) {
  const { data: members, isLoading } = useCorporateMembers(account.id);
  if (isLoading) return <Loader2 className="h-5 w-5 animate-spin" />;
  if (!members || members.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No members assigned yet. Open a user's profile from the <strong>All Users</strong> tab and link them to <strong>{account.name}</strong>.
      </p>
    );
  }
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        {members.length} {members.length === 1 ? "member" : "members"} billed under this account.
      </p>
      <div className="border rounded-lg divide-y">
        {members.map((m: any) => (
          <div key={m.id} className="p-3 flex items-center justify-between text-sm">
            <div>
              <p className="font-medium">{m.display_name || "Unnamed"}</p>
              <p className="text-xs text-muted-foreground">{m.email} {m.phone && `· ${m.phone}`}</p>
            </div>
            <Badge variant="outline" className="text-[10px]">monthly</Badge>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Billing panel: deferred items + generate invoice ─
function BillingPanel({ account }: { account: CorporateAccount }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const today = new Date();
  // Default range: previous calendar month
  const defaultStart = startOfMonth(subMonths(today, 1));
  const defaultEnd = endOfMonth(subMonths(today, 1));
  const [startDate, setStartDate] = useState(format(defaultStart, "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState(format(defaultEnd, "yyyy-MM-dd"));
  const [generating, setGenerating] = useState(false);

  const { data: items, isLoading } = useDeferredItemsForCorporate(
    account.id,
    `${startDate}T00:00:00`,
    `${endDate}T23:59:59`
  );
  const { data: products } = useProducts();
  const { data: bayPricing } = useBayPricing();
  const createInvoice = useCreateInvoice();

  // City of items — use majority city for invoice (so GST profile matches)
  const city = useMemo(() => {
    if (!items || items.length === 0) return null;
    const counts = new Map<string, number>();
    for (const i of items) {
      if (i.city) counts.set(i.city, (counts.get(i.city) ?? 0) + 1);
    }
    let top: string | null = null;
    let max = 0;
    for (const [c, n] of counts) if (n > max) { top = c; max = n; }
    return top;
  }, [items]);

  // Resolve a unit price for each item using bay_pricing (weekday/weekend, session_type)
  const computeRowAmount = (row: any): { hours: number; pricePerHour: number; product?: any } => {
    const dt = new Date(row.start_time);
    const isWeekend = [0, 6].includes(dt.getDay());
    const dayType = isWeekend ? "weekend" : "weekday";
    const hours = (row.duration_minutes ?? 60) / 60;
    let priceRow: any = null;
    if (row.kind === "coaching") {
      priceRow = (bayPricing ?? []).find((p: any) =>
        p.city === row.city && p.day_type === dayType && p.session_type?.includes("coaching"));
    } else {
      priceRow = (bayPricing ?? []).find((p: any) =>
        p.city === row.city && p.day_type === dayType && p.session_type === "individual");
    }
    const pricePerHour = priceRow?.price_per_hour ?? 0;
    const product = priceRow?.service_product_id
      ? (products ?? []).find((p: any) => p.id === priceRow.service_product_id)
      : null;
    return { hours, pricePerHour, product };
  };

  const totals = useMemo(() => {
    if (!items) return { count: 0, gross: 0 };
    let gross = 0;
    for (const r of items) {
      const { hours, pricePerHour } = computeRowAmount(r);
      gross += hours * pricePerHour;
    }
    return { count: items.length, gross };
  }, [items, bayPricing, products]);

  const generate = async () => {
    if (!items || items.length === 0) {
      toast({ title: "Nothing to invoice", description: "No deferred sessions in this range." });
      return;
    }
    if (!city) {
      toast({ title: "City not resolved", description: "Sessions have no city.", variant: "destructive" });
      return;
    }

    setGenerating(true);
    try {
      // Build line items
      const lineItems = items.map((row) => {
        const { hours, pricePerHour, product } = computeRowAmount(row);
        const dt = new Date(row.start_time);
        const dayLabel = format(dt, "dd MMM");
        const itemName = product?.name
          ? `${product.name} — ${dayLabel}${row.bay_name ? ` · ${row.bay_name}` : ""}${row.user_name ? ` · ${row.user_name}` : ""}`
          : `${row.kind === "coaching" ? "Coaching" : "Practice"} session — ${dayLabel}${row.bay_name ? ` · ${row.bay_name}` : ""}${row.user_name ? ` · ${row.user_name}` : ""}`;
        return {
          itemName,
          itemType: "service" as const,
          hsnCode: product?.hsn_code || undefined,
          sacCode: product?.sac_code || undefined,
          quantity: hours,
          unitPrice: pricePerHour,
          gstRate: product?.gst_rate ?? 18,
        };
      });

      // GST profile of the city
      const { data: gstProfile } = await supabase
        .from("gst_profiles")
        .select("state_code")
        .eq("city", city)
        .maybeSingle();

      const gstType = getGstType(gstProfile?.state_code || "", account.gstin || undefined);
      const calc = calculateLineItems(lineItems, gstType);

      // Compute due date
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + (account.payment_terms_days ?? 15));

      const invoice = await createInvoice.mutateAsync({
        customerName: account.name,
        customerEmail: account.billing_email || undefined,
        customerGstin: account.gstin || undefined,
        customerState: account.state || undefined,
        customerStateCode: account.state_code || undefined,
        lineItems: calc.lines,
        subtotal: calc.subtotal,
        cgstTotal: calc.cgstTotal,
        sgstTotal: calc.sgstTotal,
        igstTotal: calc.igstTotal,
        total: calc.total,
        city,
        invoiceCategory: "purchase",
        paymentMethod: "credit",
        amountPaid: 0,
        paymentStatus: "unpaid",
        dueDate: format(dueDate, "yyyy-MM-dd"),
        notes: `Consolidated invoice for ${items.length} session(s) from ${startDate} to ${endDate}.`,
      });

      // Mark items as invoiced
      const bookingIds = items.filter((i) => i.kind === "booking").map((i) => i.id);
      const coachingIds = items.filter((i) => i.kind === "coaching").map((i) => i.id);
      if (bookingIds.length) {
        await supabase.from("bookings")
          .update({ billing_status: "invoiced", corporate_invoice_id: invoice.id })
          .in("id", bookingIds);
      }
      if (coachingIds.length) {
        await supabase.from("coaching_sessions")
          .update({ billing_status: "invoiced", corporate_invoice_id: invoice.id })
          .in("id", coachingIds);
      }

      toast({
        title: "Invoice generated",
        description: `${invoice.invoice_number} for ₹${calc.total.toLocaleString()} (${items.length} sessions).`,
      });
      qc.invalidateQueries({ queryKey: ["deferred_items_corporate"] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
    } catch (e: any) {
      toast({ title: "Failed to generate invoice", description: e.message, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">From</Label>
          <Input type="date" className="mt-1" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">To</Label>
          <Input type="date" className="mt-1" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
      </div>

      {isLoading ? (
        <Loader2 className="h-5 w-5 animate-spin" />
      ) : !items || items.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          <CheckCircle2 className="h-6 w-6 mx-auto mb-2 text-muted-foreground/60" />
          No deferred sessions in this date range.
        </div>
      ) : (
        <>
          <div className="rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="text-left p-2">Date</th>
                  <th className="text-left p-2">User</th>
                  <th className="text-left p-2 hidden sm:table-cell">Type</th>
                  <th className="text-left p-2 hidden md:table-cell">Bay / City</th>
                  <th className="text-right p-2">Hours</th>
                  <th className="text-right p-2">Amount</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => {
                  const { hours, pricePerHour } = computeRowAmount(row);
                  return (
                    <tr key={`${row.kind}-${row.id}`} className="border-t">
                      <td className="p-2 text-xs">{format(new Date(row.start_time), "dd MMM yy")}</td>
                      <td className="p-2 text-xs">{row.user_name || "—"}</td>
                      <td className="p-2 hidden sm:table-cell text-xs capitalize">{row.kind}</td>
                      <td className="p-2 hidden md:table-cell text-xs">{row.bay_name || row.city || "—"}</td>
                      <td className="p-2 text-right text-xs">{hours.toFixed(1)}</td>
                      <td className="p-2 text-right text-xs">₹{(hours * pricePerHour).toLocaleString()}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-muted/30 font-medium">
                <tr>
                  <td colSpan={4} className="p-2 text-right text-xs">Subtotal (excl. GST)</td>
                  <td className="p-2 text-right text-xs">{totals.count} items</td>
                  <td className="p-2 text-right">₹{totals.gross.toLocaleString()}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {!city && (
            <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs">
              <AlertCircle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
              <span>Sessions have no city set. The invoice cannot be generated until a city is resolved.</span>
            </div>
          )}

          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5" />
              Invoice will be issued to <strong>{account.name}</strong>
              {account.billing_email ? ` (${account.billing_email})` : ""}.
            </p>
            <Button onClick={generate} disabled={generating || !city}>
              {generating ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Receipt className="h-4 w-4 mr-1" />}
              Generate Consolidated Invoice
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
