import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Loader2, Search, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useVendors, useCreateVendor } from "@/hooks/useVendors";
import { useExpenseCategories } from "@/hooks/useExpenseCategories";
import { useCreateExpense } from "@/hooks/useExpenses";
import { useDefaultCurrency } from "@/hooks/useCurrency";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  city: string;
}

const PAYMENT_METHODS = ["Cash", "Card", "UPI", "Bank Transfer"];

export function AddExpenseDialog({ open, onOpenChange, city }: Props) {
  const { toast } = useToast();
  const currency = useDefaultCurrency();
  const { data: vendors } = useVendors(city);
  const { data: categories } = useExpenseCategories();
  const createExpense = useCreateExpense();
  const createVendor = useCreateVendor();

  const [vendorId, setVendorId] = useState<string | null>(null);
  const [vendorSearch, setVendorSearch] = useState("");
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickVendorName, setQuickVendorName] = useState("");
  const [quickVendorGstin, setQuickVendorGstin] = useState("");

  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().split("T")[0]);
  const [categoryId, setCategoryId] = useState("");
  const [baseAmount, setBaseAmount] = useState("");
  const [gstRate, setGstRate] = useState("0");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [paymentRef, setPaymentRef] = useState("");
  const [notes, setNotes] = useState("");

  const filteredVendors = useMemo(() => {
    if (!vendors || !vendorSearch) return [];
    const q = vendorSearch.toLowerCase();
    return vendors.filter((v) => v.is_active && (v.name.toLowerCase().includes(q) || (v.gstin && v.gstin.toLowerCase().includes(q)))).slice(0, 8);
  }, [vendors, vendorSearch]);

  const selectedVendor = vendors?.find((v) => v.id === vendorId);

  // GST calc
  const base = parseFloat(baseAmount) || 0;
  const rate = parseFloat(gstRate) || 0;
  const gstAmount = Math.round(base * rate / 100 * 100) / 100;
  const total = Math.round((base + gstAmount) * 100) / 100;

  const handleQuickAddVendor = async () => {
    if (!quickVendorName.trim()) return;
    try {
      const newVendor = await createVendor.mutateAsync({
        name: quickVendorName.trim(),
        gstin: quickVendorGstin || null,
        city,
        is_active: true,
        contact_name: null,
        phone: null,
        email: null,
        category: null,
        notes: null,
      });
      setVendorId(newVendor.id);
      setShowQuickAdd(false);
      setQuickVendorName("");
      setQuickVendorGstin("");
      setVendorSearch("");
      toast({ title: "Vendor added" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleSubmit = async () => {
    if (!baseAmount || base <= 0) {
      toast({ title: "Enter a valid amount", variant: "destructive" }); return;
    }
    if (!paymentMethod) {
      toast({ title: "Select payment method", variant: "destructive" }); return;
    }

    try {
      await createExpense.mutateAsync({
        vendor_id: vendorId || null,
        expense_date: expenseDate,
        category_id: categoryId || null,
        subtotal: base,
        cgst_total: rate > 0 ? Math.round(gstAmount / 2 * 100) / 100 : 0,
        sgst_total: rate > 0 ? Math.round(gstAmount / 2 * 100) / 100 : 0,
        igst_total: 0,
        total,
        payment_method: paymentMethod,
        payment_reference: paymentRef || undefined,
        city,
        notes: notes || undefined,
      });
      toast({ title: "Expense added" });
      onOpenChange(false);
      resetForm();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const resetForm = () => {
    setVendorId(null); setVendorSearch(""); setExpenseDate(new Date().toISOString().split("T")[0]);
    setCategoryId(""); setBaseAmount(""); setGstRate("0"); setPaymentMethod("");
    setPaymentRef(""); setNotes("");
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) resetForm(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle>Add Expense</DialogTitle></DialogHeader>
        <div className="space-y-4">
          {/* Vendor */}
          <div className="space-y-2">
            <Label>Vendor</Label>
            {selectedVendor ? (
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{selectedVendor.name}</span>
                {selectedVendor.gstin && <span className="text-xs text-muted-foreground font-mono">{selectedVendor.gstin}</span>}
                <Button variant="ghost" size="sm" onClick={() => { setVendorId(null); setVendorSearch(""); }}>Change</Button>
              </div>
            ) : (
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input placeholder="Search vendors…" className="pl-8" value={vendorSearch} onChange={(e) => setVendorSearch(e.target.value)} />
                {vendorSearch.length >= 2 && (
                  <div className="absolute z-10 mt-1 w-full rounded-md border border-border bg-background shadow-lg max-h-48 overflow-y-auto">
                    {filteredVendors.map((v) => (
                      <button key={v.id} className="w-full text-left px-3 py-2 hover:bg-muted text-sm" onClick={() => { setVendorId(v.id); setVendorSearch(""); }}>
                        <span className="font-medium">{v.name}</span>
                        {v.gstin && <span className="text-muted-foreground ml-2 text-xs font-mono">{v.gstin}</span>}
                      </button>
                    ))}
                    <button className="w-full text-left px-3 py-2 hover:bg-muted text-sm text-primary flex items-center gap-1" onClick={() => { setShowQuickAdd(true); setQuickVendorName(vendorSearch); setVendorSearch(""); }}>
                      <Plus className="h-3.5 w-3.5" /> Add new vendor
                    </button>
                  </div>
                )}
              </div>
            )}
            {showQuickAdd && (
              <div className="border border-border rounded-md p-3 space-y-2 bg-muted/30">
                <p className="text-xs font-medium text-muted-foreground">Quick Add Vendor</p>
                <Input placeholder="Vendor name *" value={quickVendorName} onChange={(e) => setQuickVendorName(e.target.value)} className="h-8 text-sm" />
                <Input placeholder="GSTIN (optional)" value={quickVendorGstin} onChange={(e) => setQuickVendorGstin(e.target.value.toUpperCase())} maxLength={15} className="h-8 text-sm" />
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleQuickAddVendor} disabled={createVendor.isPending}>Save</Button>
                  <Button size="sm" variant="ghost" onClick={() => setShowQuickAdd(false)}>Cancel</Button>
                </div>
              </div>
            )}
          </div>

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

          <Separator />

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Base Amount</Label>
              <Input type="number" min={0} step="0.01" value={baseAmount} onChange={(e) => setBaseAmount(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label>GST Rate %</Label>
              <Select value={gstRate} onValueChange={setGstRate}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[0, 5, 12, 18, 28].map((r) => (
                    <SelectItem key={r} value={String(r)}>{r}%</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>GST Amount</Label>
              <Input value={currency.format(gstAmount)} readOnly className="mt-1 bg-muted" />
            </div>
          </div>

          <div className="flex justify-between items-center py-2 px-3 rounded-md bg-muted/50">
            <span className="font-medium">Total</span>
            <span className="font-semibold text-lg">{currency.format(total)}</span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Payment Method</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Payment Reference</Label>
              <Input value={paymentRef} onChange={(e) => setPaymentRef(e.target.value)} className="mt-1" placeholder="Optional" />
            </div>
          </div>

          <div>
            <Label>Notes</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1" placeholder="Optional" />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => { onOpenChange(false); resetForm(); }}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={createExpense.isPending}>
              {createExpense.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Add Expense
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
