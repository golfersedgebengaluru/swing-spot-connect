import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Plus, Trash2, Loader2, Search, CheckCircle, XCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useCreateInvoice, useGstProfile } from "@/hooks/useInvoices";
import { useOfflinePaymentMethods } from "@/hooks/useOfflinePaymentMethods";
import { useDefaultCurrency } from "@/hooks/useCurrency";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { validateGSTIN, getGstType, calculateLineItems, type GstLineItem } from "@/lib/gst-utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  city?: string;
}

function useProductCatalogue() {
  return useQuery({
    queryKey: ["products", "catalogue"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("*").order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
  });
}

function useProfileSearch(search: string) {
  return useQuery({
    queryKey: ["profile_search", search],
    enabled: search.length >= 2,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, display_name, email")
        .or(`display_name.ilike.%${search}%,email.ilike.%${search}%`)
        .limit(10);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function CreateInvoiceDialog({ open, onOpenChange, city }: Props) {
  const { toast } = useToast();
  const currency = useDefaultCurrency();
  const { data: profile } = useGstProfile(city);
  const { data: paymentMethods } = useOfflinePaymentMethods();
  const { data: catalogue } = useProductCatalogue();
  const createInvoice = useCreateInvoice();

  // Customer
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerUserId, setCustomerUserId] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerGstin, setCustomerGstin] = useState("");
  const [gstinValidation, setGstinValidation] = useState<boolean | null>(null);

  const { data: searchResults } = useProfileSearch(customerSearch);

  // Line items
  const [lineItems, setLineItems] = useState<GstLineItem[]>([]);
  const [catalogueSearch, setCatalogueSearch] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");

  const filteredCatalogue = useMemo(() => {
    if (!catalogue || !catalogueSearch) return [];
    const q = catalogueSearch.toLowerCase();
    return catalogue.filter((p: any) =>
      p.name.toLowerCase().includes(q) ||
      (p.hsn_code && p.hsn_code.toLowerCase().includes(q)) ||
      (p.sac_code && p.sac_code.toLowerCase().includes(q))
    ).slice(0, 8);
  }, [catalogue, catalogueSearch]);

  const selectCustomer = (user: any) => {
    setCustomerUserId(user.user_id);
    setCustomerName(user.display_name || "");
    setCustomerEmail(user.email || "");
    setCustomerSearch("");
  };

  const handleGstinChange = (val: string) => {
    const upper = val.toUpperCase();
    setCustomerGstin(upper);
    if (upper.length === 15) {
      const result = validateGSTIN(upper);
      setGstinValidation(result.valid);
    } else {
      setGstinValidation(null);
    }
  };

  const addLineItem = (product: any) => {
    setLineItems((prev) => [
      ...prev,
      {
        itemName: product.name,
        itemType: product.item_type || "product",
        hsnCode: product.hsn_code || undefined,
        sacCode: product.sac_code || undefined,
        quantity: 1,
        unitPrice: Number(product.price),
        gstRate: Number(product.gst_rate) || 0,
        productId: product.id,
      },
    ]);
    setCatalogueSearch("");
  };

  const updateLineItem = (idx: number, field: keyof GstLineItem, value: any) => {
    setLineItems((prev) => prev.map((item, i) => (i === idx ? { ...item, [field]: value } : item)));
  };

  const removeLineItem = (idx: number) => {
    setLineItems((prev) => prev.filter((_, i) => i !== idx));
  };

  // GST calculation
  const gstType = getGstType(profile?.state_code || "", customerGstin || undefined);
  const calculated = calculateLineItems(lineItems, gstType);

  const handleSubmit = async () => {
    if (!customerName) {
      toast({ title: "Missing customer name", variant: "destructive" });
      return;
    }
    if (lineItems.length === 0) {
      toast({ title: "Add at least one line item", variant: "destructive" });
      return;
    }
    if (!paymentMethod) {
      toast({ title: "Select a payment method", variant: "destructive" });
      return;
    }

    try {
      await createInvoice.mutateAsync({
        customerUserId: customerUserId || undefined,
        customerName,
        customerEmail: customerEmail || undefined,
        customerPhone: customerPhone || undefined,
        customerGstin: customerGstin || undefined,
        lineItems: calculated.lines,
        subtotal: calculated.subtotal,
        cgstTotal: calculated.cgstTotal,
        sgstTotal: calculated.sgstTotal,
        igstTotal: calculated.igstTotal,
        total: calculated.total,
        paymentMethod,
        city,
      });
      toast({ title: "Invoice created" });
      onOpenChange(false);
      resetForm();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const resetForm = () => {
    setCustomerUserId(null);
    setCustomerName("");
    setCustomerEmail("");
    setCustomerPhone("");
    setCustomerGstin("");
    setGstinValidation(null);
    setLineItems([]);
    setPaymentMethod("");
    setCustomerSearch("");
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) resetForm(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create Invoice</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* ── Customer ── */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-foreground">Customer</h3>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search registered users…"
                className="pl-8"
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
              />
              {searchResults && searchResults.length > 0 && customerSearch.length >= 2 && (
                <div className="absolute z-10 mt-1 w-full rounded-md border border-border bg-background shadow-lg max-h-48 overflow-y-auto">
                  {searchResults.map((u: any) => (
                    <button
                      key={u.user_id}
                      className="w-full text-left px-3 py-2 hover:bg-muted text-sm"
                      onClick={() => selectCustomer(u)}
                    >
                      <span className="font-medium">{u.display_name}</span>
                      <span className="text-muted-foreground ml-2">{u.email}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Name *</Label>
                <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Email</Label>
                <Input value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Phone</Label>
                <Input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">GSTIN (optional)</Label>
                <div className="relative mt-1">
                  <Input value={customerGstin} onChange={(e) => handleGstinChange(e.target.value)} maxLength={15} placeholder="22AAAAA0000A1Z5" className="pr-8" />
                  {gstinValidation !== null && (
                    gstinValidation
                      ? <CheckCircle className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-green-600" />
                      : <XCircle className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-destructive" />
                  )}
                </div>
              </div>
            </div>
            {customerGstin && gstinValidation && (
              <Badge variant="outline" className="text-xs">
                {gstType === "igst" ? "IGST (Inter-state)" : "CGST + SGST (Intra-state)"}
              </Badge>
            )}
          </div>

          <Separator />

          {/* ── Line Items ── */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-foreground">Line Items</h3>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search product/service catalogue…"
                className="pl-8"
                value={catalogueSearch}
                onChange={(e) => setCatalogueSearch(e.target.value)}
              />
              {filteredCatalogue.length > 0 && (
                <div className="absolute z-10 mt-1 w-full rounded-md border border-border bg-background shadow-lg max-h-48 overflow-y-auto">
                  {filteredCatalogue.map((p: any) => (
                    <button
                      key={p.id}
                      className="w-full text-left px-3 py-2 hover:bg-muted text-sm flex items-center justify-between"
                      onClick={() => addLineItem(p)}
                    >
                      <div>
                        <span className="font-medium">{p.name}</span>
                        <span className="text-muted-foreground ml-2 text-xs">
                          {(p as any).item_type === "service" ? `SAC: ${(p as any).sac_code || "—"}` : `HSN: ${(p as any).hsn_code || "—"}`}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {currency.format(Number(p.price))} · GST {(p as any).gst_rate ?? 0}%
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {lineItems.length > 0 && (
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50 border-b border-border">
                      <th className="text-left py-2 px-2 font-medium text-muted-foreground">Item</th>
                      <th className="text-left py-2 px-2 font-medium text-muted-foreground w-20">Code</th>
                      <th className="text-right py-2 px-2 font-medium text-muted-foreground w-16">Qty</th>
                      <th className="text-right py-2 px-2 font-medium text-muted-foreground w-24">Price (incl.)</th>
                      <th className="text-right py-2 px-2 font-medium text-muted-foreground w-16">GST%</th>
                      <th className="text-right py-2 px-2 font-medium text-muted-foreground w-24">Total</th>
                      <th className="w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {calculated.lines.map((item, idx) => (
                      <tr key={idx} className="border-b border-border/50">
                        <td className="py-2 px-2">
                          <div className="flex items-center gap-1">
                            <Badge variant="outline" className="text-[10px]">
                              {item.itemType === "service" ? "SVC" : "PRD"}
                            </Badge>
                            <span className="truncate max-w-[150px]">{item.itemName}</span>
                          </div>
                        </td>
                        <td className="py-2 px-2 text-xs text-muted-foreground">
                          {item.itemType === "service" ? item.sacCode : item.hsnCode}
                        </td>
                        <td className="py-2 px-2">
                          <Input
                            type="number"
                            min={1}
                            className="w-16 h-7 text-right text-xs"
                            value={lineItems[idx].quantity}
                            onChange={(e) => updateLineItem(idx, "quantity", Number(e.target.value) || 1)}
                          />
                        </td>
                        <td className="py-2 px-2">
                          <Input
                            type="number"
                            min={0}
                            step="0.01"
                            className="w-24 h-7 text-right text-xs"
                            value={lineItems[idx].unitPrice}
                            onChange={(e) => updateLineItem(idx, "unitPrice", Number(e.target.value) || 0)}
                          />
                        </td>
                        <td className="py-2 px-2 text-right text-xs">{item.gstRate}%</td>
                        <td className="py-2 px-2 text-right font-medium text-xs">{currency.format(item.lineTotal)}</td>
                        <td className="py-2 px-1">
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeLineItem(idx)}>
                            <Trash2 className="h-3 w-3 text-destructive" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ── Summary ── */}
          {lineItems.length > 0 && (
            <Card className="bg-muted/30">
              <CardContent className="p-4 space-y-1.5 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Taxable Amount</span><span>{currency.format(calculated.subtotal)}</span></div>
                {gstType === "cgst_sgst" ? (
                  <>
                    <div className="flex justify-between"><span className="text-muted-foreground">CGST</span><span>{currency.format(calculated.cgstTotal)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">SGST</span><span>{currency.format(calculated.sgstTotal)}</span></div>
                  </>
                ) : (
                  <div className="flex justify-between"><span className="text-muted-foreground">IGST</span><span>{currency.format(calculated.igstTotal)}</span></div>
                )}
                <Separator />
                <div className="flex justify-between font-semibold text-base">
                  <span>Total (incl. GST)</span><span>{currency.format(calculated.total)}</span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ── Payment Method ── */}
          <div>
            <Label>Payment Method</Label>
            <Select value={paymentMethod} onValueChange={setPaymentMethod}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Select method" /></SelectTrigger>
              <SelectContent>
                {(paymentMethods ?? []).filter((m: any) => m.is_active).map((m: any) => (
                  <SelectItem key={m.id} value={m.label}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* ── Submit ── */}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => { onOpenChange(false); resetForm(); }}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={createInvoice.isPending}>
              {createInvoice.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Creating…</> : "Create Invoice"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
