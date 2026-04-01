import { useState, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Loader2, Upload, CheckCircle, SkipForward, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useVendors, useCreateVendor, type Vendor } from "@/hooks/useVendors";
import { useExpenseCategories } from "@/hooks/useExpenseCategories";
import { useCreateExpense, type ExpenseLineItem } from "@/hooks/useExpenses";
import { useDefaultCurrency } from "@/hooks/useCurrency";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  city: string;
}

type ScanResult = {
  vendor_name?: string;
  vendor_gstin?: string;
  vendor_contact?: string;
  bill_date?: string;
  bill_number?: string;
  line_items?: Array<{
    name: string; quantity: number; unit_price: number;
    hsn_code?: string; sac_code?: string; gst_rate: number; amount: number;
  }>;
  subtotal?: number;
  cgst_amount?: number;
  sgst_amount?: number;
  igst_amount?: number;
  total?: number;
  suggested_category?: string;
};

type Step = "upload" | "vendor" | "items" | "review";

export function BillScannerDialog({ open, onOpenChange, city }: Props) {
  const { toast } = useToast();
  const currency = useDefaultCurrency();
  const { data: vendors } = useVendors(city);
  const { data: categories } = useExpenseCategories();
  const createVendor = useCreateVendor();
  const createExpense = useCreateExpense();

  const [step, setStep] = useState<Step>("upload");
  const [scanning, setScanning] = useState(false);
  const [scanData, setScanData] = useState<ScanResult | null>(null);
  const [billFile, setBillFile] = useState<File | null>(null);
  const [billUrl, setBillUrl] = useState<string | null>(null);

  // Vendor step
  const [vendorId, setVendorId] = useState<string | null>(null);
  const [newVendorName, setNewVendorName] = useState("");
  const [newVendorGstin, setNewVendorGstin] = useState("");

  // Items step
  const [currentItemIdx, setCurrentItemIdx] = useState(0);
  const [itemActions, setItemActions] = useState<Record<number, "skip" | "added">>({});

  // Review step
  const [expenseDate, setExpenseDate] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [paymentRef, setPaymentRef] = useState("");

  const reset = () => {
    setStep("upload"); setScanning(false); setScanData(null); setBillFile(null); setBillUrl(null);
    setVendorId(null); setNewVendorName(""); setNewVendorGstin("");
    setCurrentItemIdx(0); setItemActions({});
    setExpenseDate(""); setCategoryId(""); setPaymentMethod(""); setPaymentRef("");
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBillFile(file);

    // Upload to storage
    setScanning(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${city}/${Date.now()}.${ext}`;
      const { error: uploadErr } = await supabase.storage.from("expense-bills").upload(path, file);
      if (uploadErr) throw uploadErr;

      const { data: urlData } = supabase.storage.from("expense-bills").getPublicUrl(path);
      setBillUrl(urlData?.publicUrl || null);

      // Send to edge function
      const formData = new FormData();
      formData.append("file", file);

      const { data, error } = await supabase.functions.invoke("scan-bill", { body: formData });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const result = data?.data as ScanResult;
      setScanData(result);
      setExpenseDate(result?.bill_date || new Date().toISOString().split("T")[0]);

      // Match suggested category
      if (result?.suggested_category && categories) {
        const match = categories.find((c) => c.name.toLowerCase() === result.suggested_category?.toLowerCase());
        if (match) setCategoryId(match.id);
      }

      // Check if vendor exists
      const matchedVendor = vendors?.find((v) =>
        (result?.vendor_gstin && v.gstin === result.vendor_gstin) ||
        (result?.vendor_name && v.name.toLowerCase() === result.vendor_name.toLowerCase())
      );

      if (matchedVendor) {
        setVendorId(matchedVendor.id);
        setStep("items");
      } else {
        setNewVendorName(result?.vendor_name || "");
        setNewVendorGstin(result?.vendor_gstin || "");
        setStep("vendor");
      }
    } catch (err: any) {
      toast({ title: "Scan failed", description: err.message, variant: "destructive" });
    } finally {
      setScanning(false);
    }
  };

  const handleSaveVendor = async () => {
    if (!newVendorName.trim()) { toast({ title: "Vendor name required", variant: "destructive" }); return; }
    try {
      const v = await createVendor.mutateAsync({
        name: newVendorName.trim(),
        gstin: newVendorGstin || null,
        city, is_active: true, contact_name: null, phone: null, email: null, category: null, notes: null,
      });
      setVendorId(v.id);
      toast({ title: "Vendor saved" });
      setStep("items");
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleSkipVendor = () => { setStep("items"); };

  const lineItems = scanData?.line_items ?? [];
  const currentItem = lineItems[currentItemIdx];

  const handleAddItem = () => {
    setItemActions((prev) => ({ ...prev, [currentItemIdx]: "added" }));
    if (currentItemIdx < lineItems.length - 1) {
      setCurrentItemIdx((i) => i + 1);
    } else {
      setStep("review");
    }
  };

  const handleSkipItem = () => {
    setItemActions((prev) => ({ ...prev, [currentItemIdx]: "skip" }));
    if (currentItemIdx < lineItems.length - 1) {
      setCurrentItemIdx((i) => i + 1);
    } else {
      setStep("review");
    }
  };

  const handleSkipAllItems = () => { setStep("review"); };

  const handleSubmitExpense = async () => {
    if (!paymentMethod) { toast({ title: "Select payment method", variant: "destructive" }); return; }

    const sub = scanData?.subtotal || 0;
    const cgst = scanData?.cgst_amount || 0;
    const sgst = scanData?.sgst_amount || 0;
    const igst = scanData?.igst_amount || 0;
    const tot = scanData?.total || sub + cgst + sgst + igst;

    const expLineItems: ExpenseLineItem[] = lineItems.map((item, idx) => ({
      item_name: item.name,
      quantity: item.quantity || 1,
      unit_price: item.unit_price || 0,
      hsn_code: item.hsn_code || null,
      sac_code: item.sac_code || null,
      gst_rate: item.gst_rate || 0,
      cgst_amount: item.gst_rate ? Math.round(item.amount * item.gst_rate / 200 * 100) / 100 : 0,
      sgst_amount: item.gst_rate ? Math.round(item.amount * item.gst_rate / 200 * 100) / 100 : 0,
      igst_amount: 0,
      line_total: (item.amount || 0) + (item.amount || 0) * (item.gst_rate || 0) / 100,
      product_id: null,
      sort_order: idx,
    }));

    try {
      await createExpense.mutateAsync({
        vendor_id: vendorId || null,
        expense_date: expenseDate,
        category_id: categoryId || null,
        subtotal: sub,
        cgst_total: cgst,
        sgst_total: sgst,
        igst_total: igst,
        total: tot,
        payment_method: paymentMethod,
        payment_reference: paymentRef || undefined,
        bill_url: billUrl || undefined,
        city,
        line_items: expLineItems,
      });
      toast({ title: "Expense saved from bill" });
      onOpenChange(false);
      reset();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const PAYMENT_METHODS = ["Cash", "Card", "UPI", "Bank Transfer"];

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {step === "upload" && "Scan Bill"}
            {step === "vendor" && "Step 1: Confirm Vendor"}
            {step === "items" && `Step 2: Line Items (${currentItemIdx + 1}/${lineItems.length})`}
            {step === "review" && "Step 3: Review & Save"}
          </DialogTitle>
        </DialogHeader>

        {/* Upload Step */}
        {step === "upload" && (
          <div className="space-y-4">
            <div className="border-2 border-dashed border-border rounded-lg p-8 text-center">
              {scanning ? (
                <div className="space-y-3">
                  <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground">Processing bill with AI…</p>
                </div>
              ) : (
                <label className="cursor-pointer space-y-3 block">
                  <Upload className="mx-auto h-8 w-8 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Upload a bill photo or PDF</p>
                  <Button variant="outline" size="sm" asChild><span>Choose File</span></Button>
                  <input type="file" accept="image/*,.pdf" className="hidden" onChange={handleFileSelect} />
                </label>
              )}
            </div>
          </div>
        )}

        {/* Vendor Step */}
        {step === "vendor" && scanData && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Vendor not found in your list. Save with pre-filled details?</p>
            <div className="space-y-3">
              <div>
                <Label>Vendor Name</Label>
                <Input value={newVendorName} onChange={(e) => setNewVendorName(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label>GSTIN</Label>
                <Input value={newVendorGstin} onChange={(e) => setNewVendorGstin(e.target.value.toUpperCase())} className="mt-1" maxLength={15} />
              </div>
              {scanData.vendor_contact && (
                <p className="text-xs text-muted-foreground">Contact: {scanData.vendor_contact}</p>
              )}
            </div>
            <div className="flex gap-2">
              <Button onClick={handleSaveVendor} disabled={createVendor.isPending}>
                {createVendor.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <CheckCircle className="mr-2 h-4 w-4" /> Save Vendor
              </Button>
              <Button variant="outline" onClick={handleSkipVendor}>
                <SkipForward className="mr-2 h-4 w-4" /> Skip
              </Button>
            </div>
          </div>
        )}

        {/* Items Step */}
        {step === "items" && lineItems.length > 0 && currentItem && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Add this item to your product catalogue?</p>
            <Card className="bg-muted/30">
              <CardContent className="p-4 space-y-2 text-sm">
                <div className="flex justify-between"><span className="font-medium">{currentItem.name}</span><Badge variant="outline">{currentItem.gst_rate}% GST</Badge></div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Qty: {currentItem.quantity} × {currency.format(currentItem.unit_price)}</span>
                  <span>{currency.format(currentItem.amount)}</span>
                </div>
                {currentItem.hsn_code && <p className="text-xs text-muted-foreground">HSN: {currentItem.hsn_code}</p>}
                {currentItem.sac_code && <p className="text-xs text-muted-foreground">SAC: {currentItem.sac_code}</p>}
              </CardContent>
            </Card>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleAddItem}><Plus className="mr-1 h-3.5 w-3.5" />Add to Catalogue</Button>
              <Button size="sm" variant="outline" onClick={handleSkipItem}><SkipForward className="mr-1 h-3.5 w-3.5" />Skip</Button>
              <Button size="sm" variant="ghost" onClick={handleSkipAllItems}>Skip All</Button>
            </div>
          </div>
        )}
        {step === "items" && lineItems.length === 0 && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">No line items extracted from bill.</p>
            <Button onClick={() => setStep("review")}>Continue to Review</Button>
          </div>
        )}

        {/* Review Step */}
        {step === "review" && scanData && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Date</Label>
                <Input type="date" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label>Category</Label>
                <Select value={categoryId} onValueChange={setCategoryId}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    {(categories ?? []).filter((c) => c.is_active).map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {vendorId && (
              <p className="text-sm">Vendor: <span className="font-medium">{vendors?.find((v) => v.id === vendorId)?.name}</span></p>
            )}

            <Card className="bg-muted/30">
              <CardContent className="p-4 space-y-1.5 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{currency.format(scanData.subtotal || 0)}</span></div>
                {(scanData.cgst_amount || 0) > 0 && <div className="flex justify-between"><span className="text-muted-foreground">CGST</span><span>{currency.format(scanData.cgst_amount || 0)}</span></div>}
                {(scanData.sgst_amount || 0) > 0 && <div className="flex justify-between"><span className="text-muted-foreground">SGST</span><span>{currency.format(scanData.sgst_amount || 0)}</span></div>}
                {(scanData.igst_amount || 0) > 0 && <div className="flex justify-between"><span className="text-muted-foreground">IGST</span><span>{currency.format(scanData.igst_amount || 0)}</span></div>}
                <Separator />
                <div className="flex justify-between font-semibold"><span>Total</span><span>{currency.format(scanData.total || 0)}</span></div>
              </CardContent>
            </Card>

            {lineItems.length > 0 && (
              <div className="text-xs text-muted-foreground">{lineItems.length} line item(s) extracted</div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Payment Method *</Label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHODS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Reference</Label>
                <Input value={paymentRef} onChange={(e) => setPaymentRef(e.target.value)} className="mt-1" placeholder="Optional" />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => { onOpenChange(false); reset(); }}>Cancel</Button>
              <Button onClick={handleSubmitExpense} disabled={createExpense.isPending}>
                {createExpense.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Expense
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
