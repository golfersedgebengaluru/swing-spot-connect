import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Printer, Loader2, Pencil, Save, X, Plus, Trash2, Search, CheckCircle, XCircle, CalendarIcon } from "lucide-react";
import { useInvoiceWithItems, useUpdateInvoice } from "@/hooks/useInvoices";
import { useOfflinePaymentMethods } from "@/hooks/useOfflinePaymentMethods";
import { useDefaultCurrency } from "@/hooks/useCurrency";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { validateGSTIN, getGstType, calculateLineItems, type GstLineItem } from "@/lib/gst-utils";
import { useGstProfile } from "@/hooks/useInvoices";
import { format, parseISO } from "date-fns";
import { useEffectiveInvoiceSettings } from "@/hooks/useInvoiceSettings";
import { renderInvoiceHtml, openPrintWindow } from "@/lib/invoice-templates";
import { cn } from "@/lib/utils";

interface Props {
  invoiceId: string | null;
  onClose: () => void;
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

export function InvoiceViewDialog({ invoiceId, onClose }: Props) {
  const { data: invoice, isLoading } = useInvoiceWithItems(invoiceId);
  const { data: gstProfile } = useGstProfile(invoice?.city);
  const { data: paymentMethods } = useOfflinePaymentMethods();
  const { data: catalogue } = useProductCatalogue();
  const { data: invoiceSettings } = useEffectiveInvoiceSettings(invoice?.city);
  const currency = useDefaultCurrency();
  const { toast } = useToast();
  const updateInvoice = useUpdateInvoice();
  const [editing, setEditing] = useState(false);

  // Edit form state
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerGstin, setCustomerGstin] = useState("");
  const [gstinValidation, setGstinValidation] = useState<boolean | null>(null);
  const [invoiceDate, setInvoiceDate] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [lineItems, setLineItems] = useState<GstLineItem[]>([]);
  const [catalogueSearch, setCatalogueSearch] = useState("");
  const [notes, setNotes] = useState("");
  const [dueDate, setDueDate] = useState<Date | undefined>(undefined);
  const [invoiceCategory, setInvoiceCategory] = useState<"purchase" | "booking">("purchase");
  const [paymentReference, setPaymentReference] = useState("");

  useEffect(() => {
    if (invoice && editing) {
      setCustomerName(invoice.customer_name || "");
      setCustomerEmail(invoice.customer_email || "");
      setCustomerPhone(invoice.customer_phone || "");
      setCustomerGstin(invoice.customer_gstin || "");
      setInvoiceDate(invoice.invoice_date || "");
      setPaymentMethod(invoice.payment_method || "");
      setPaymentReference((invoice as any).payment_reference || "");
      setNotes(invoice.notes || "");
      setInvoiceCategory(invoice.invoice_category === "booking" ? "booking" : "purchase");
      setDueDate(invoice.due_date ? parseISO(invoice.due_date) : undefined);
      if (invoice.customer_gstin?.length === 15) {
        setGstinValidation(validateGSTIN(invoice.customer_gstin).valid);
      }
      setLineItems(
        (invoice.line_items ?? []).map((item: any) => ({
          itemName: item.item_name,
          itemType: item.item_type,
          hsnCode: item.hsn_code || undefined,
          sacCode: item.sac_code || undefined,
          quantity: Number(item.quantity),
          unitPrice: Number(item.unit_price),
          gstRate: Number(item.gst_rate),
          productId: item.product_id || undefined,
        }))
      );
    }
  }, [invoice, editing]);

  const filteredCatalogue = useMemo(() => {
    if (!catalogue || !catalogueSearch) return [];
    const q = catalogueSearch.toLowerCase();
    return catalogue.filter((p: any) =>
      p.name.toLowerCase().includes(q) ||
      (p.hsn_code && p.hsn_code.toLowerCase().includes(q)) ||
      (p.sac_code && p.sac_code.toLowerCase().includes(q))
    ).slice(0, 8);
  }, [catalogue, catalogueSearch]);

  const handleGstinChange = (val: string) => {
    const upper = val.toUpperCase();
    setCustomerGstin(upper);
    if (upper.length === 15) {
      setGstinValidation(validateGSTIN(upper).valid);
    } else {
      setGstinValidation(null);
    }
  };

  const gstType = getGstType(gstProfile?.state_code || invoice?.business_state_code || "", customerGstin || undefined);
  const calculated = calculateLineItems(lineItems, gstType);

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

  const handleSave = async () => {
    if (!invoiceId) return;
    if (!customerName) {
      toast({ title: "Customer name is required", variant: "destructive" });
      return;
    }
    if (lineItems.length === 0) {
      toast({ title: "Add at least one line item", variant: "destructive" });
      return;
    }
    try {
      const validatedGstin = customerGstin && gstinValidation ? customerGstin : undefined;
      const customerState = validatedGstin ? validateGSTIN(validatedGstin) : null;

      await updateInvoice.mutateAsync({
        invoiceId,
        customerName,
        customerEmail,
        customerPhone,
        customerGstin: validatedGstin,
        customerState: customerState?.stateName,
        customerStateCode: customerState?.stateCode,
        invoiceDate,
        paymentMethod,
        lineItems: calculated.lines,
        subtotal: calculated.subtotal,
        cgstTotal: calculated.cgstTotal,
        sgstTotal: calculated.sgstTotal,
        igstTotal: calculated.igstTotal,
        total: calculated.total,
        notes,
        dueDate: dueDate ? format(dueDate, "yyyy-MM-dd") : undefined,
        invoiceCategory,
        paymentReference,
      });
      toast({ title: "Invoice updated" });
      setEditing(false);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handlePrint = () => {
    if (!invoice || !invoiceSettings) return;
    const html = renderInvoiceHtml(invoice, invoiceSettings, currency);
    openPrintWindow(html, invoice.invoice_number ?? "Invoice");
  };

  if (!invoiceId) return null;

  const canEdit = invoice && invoice.status === "issued" && !editing;

  return (
    <Dialog open={!!invoiceId} onOpenChange={() => { setEditing(false); onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>{invoice?.invoice_number ?? "Invoice"}</DialogTitle>
            <div className="flex items-center gap-2">
              {editing ? (
                <>
                  <Button variant="outline" size="sm" onClick={() => setEditing(false)}>
                    <X className="mr-2 h-4 w-4" /> Cancel
                  </Button>
                  <Button size="sm" onClick={handleSave} disabled={updateInvoice.isPending}>
                    {updateInvoice.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    Save
                  </Button>
                </>
              ) : (
                <>
                  {canEdit && (
                    <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                      <Pencil className="mr-2 h-4 w-4" /> Edit
                    </Button>
                  )}
                  <Button variant="outline" size="sm" onClick={handlePrint} disabled={isLoading}>
                    <Printer className="mr-2 h-4 w-4" /> Print / PDF
                  </Button>
                </>
              )}
            </div>
          </div>
        </DialogHeader>

        {isLoading ? (
          <Loader2 className="mx-auto h-8 w-8 animate-spin" />
        ) : invoice ? (
          editing ? (
            /* ── EDIT MODE ── */
            <div className="space-y-5">
              {/* Invoice Category */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Invoice Category</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={invoiceCategory === "purchase" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setInvoiceCategory("purchase")}
                  >
                    Purchase
                  </Button>
                  <Button
                    type="button"
                    variant={invoiceCategory === "booking" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setInvoiceCategory("booking")}
                  >
                    Booking
                  </Button>
                </div>
              </div>

              <Separator />

              {/* Customer */}
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-foreground">Customer Details</h3>
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
                    <Label className="text-xs">GSTIN</Label>
                    <div className="relative mt-1">
                      <Input value={customerGstin} onChange={(e) => handleGstinChange(e.target.value)} maxLength={15} className="pr-8" />
                      {gstinValidation !== null && (
                        gstinValidation
                          ? <CheckCircle className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-green-600" />
                          : <XCircle className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-destructive" />
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Invoice Date</Label>
                  <Input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs">Payment Method</Label>
                  <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Select method" /></SelectTrigger>
                    <SelectContent>
                      {(paymentMethods ?? []).filter((m: any) => m.is_active).map((m: any) => (
                        <SelectItem key={m.id} value={m.label}>{m.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2">
                  <Label className="text-xs">Payment Reference</Label>
                  <Input
                    value={paymentReference}
                    onChange={(e) => setPaymentReference(e.target.value)}
                    placeholder="Transaction ID, cheque #, etc."
                    className="mt-1"
                  />
                </div>
              </div>

              {/* Due Date */}
              <div>
                <Label className="text-xs">Due Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full mt-1 justify-start text-left font-normal",
                        !dueDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {dueDate ? format(dueDate, "PPP") : "No due date set"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={dueDate}
                      onSelect={setDueDate}
                      initialFocus
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <Separator />

              {/* Line Items */}
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-foreground">Line Items</h3>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Search catalogue to add item…"
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
                          <span className="font-medium">{p.name}</span>
                          <span className="text-xs text-muted-foreground">{currency.format(Number(p.price))} · GST {p.gst_rate ?? 0}%</span>
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
                              <Input
                                className="h-7 text-xs"
                                value={lineItems[idx].itemName}
                                onChange={(e) => updateLineItem(idx, "itemName", e.target.value)}
                              />
                            </td>
                            <td className="py-2 px-2 text-xs text-muted-foreground">
                              {item.itemType === "service" ? item.sacCode : item.hsnCode}
                            </td>
                            <td className="py-2 px-2">
                              <Input type="number" min={1} className="w-16 h-7 text-right text-xs" value={lineItems[idx].quantity}
                                onChange={(e) => updateLineItem(idx, "quantity", Number(e.target.value) || 1)} />
                            </td>
                            <td className="py-2 px-2">
                              <Input type="number" min={0} step="0.01" className="w-24 h-7 text-right text-xs" value={lineItems[idx].unitPrice}
                                onChange={(e) => updateLineItem(idx, "unitPrice", Number(e.target.value) || 0)} />
                            </td>
                            <td className="py-2 px-2">
                              <Input type="number" min={0} step="0.01" className="w-16 h-7 text-right text-xs" value={lineItems[idx].gstRate}
                                onChange={(e) => updateLineItem(idx, "gstRate", Number(e.target.value) || 0)} />
                            </td>
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

              {/* Summary */}
              {lineItems.length > 0 && (
                <div className="ml-auto w-72 space-y-1.5 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Taxable</span><span>{currency.format(calculated.subtotal)}</span></div>
                  {gstType === "cgst_sgst" ? (
                    <>
                      <div className="flex justify-between"><span className="text-muted-foreground">CGST</span><span>{currency.format(calculated.cgstTotal)}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">SGST</span><span>{currency.format(calculated.sgstTotal)}</span></div>
                    </>
                  ) : (
                    <div className="flex justify-between"><span className="text-muted-foreground">IGST</span><span>{currency.format(calculated.igstTotal)}</span></div>
                  )}
                  <Separator />
                  <div className="flex justify-between font-semibold text-base"><span>Total</span><span>{currency.format(calculated.total)}</span></div>
                </div>
              )}

              {/* Notes */}
              <div>
                <Label className="text-xs">Notes / Comments</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Any additional notes…"
                  className="mt-1"
                  rows={2}
                />
              </div>
            </div>
          ) : (
            /* ── VIEW MODE ── */
            <div>
              {invoiceSettings ? (
                <div dangerouslySetInnerHTML={{ __html: renderInvoiceHtml(invoice, invoiceSettings, currency) }} />
              ) : (
                <Loader2 className="mx-auto h-6 w-6 animate-spin" />
              )}
            </div>
          )
        ) : null}
      </DialogContent>
    </Dialog>
  );
}