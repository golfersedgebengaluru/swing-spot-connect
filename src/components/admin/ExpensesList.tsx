import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Download, Loader2, Trash2, Receipt, ScanLine, ChevronLeft, ChevronRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useExpenses, useDeleteExpense, type ExpenseFilters } from "@/hooks/useExpenses";
import { useVendors } from "@/hooks/useVendors";
import { useExpenseCategories } from "@/hooks/useExpenseCategories";
import { useDefaultCurrency } from "@/hooks/useCurrency";
import { AddExpenseDialog } from "./AddExpenseDialog";
import { BillScannerDialog } from "./BillScannerDialog";
import { format } from "date-fns";

interface Props {
  city: string;
}

const PAYMENT_METHODS = ["Cash", "Card", "UPI", "Bank Transfer"];
const PAGE_SIZE = 25;

export function ExpensesList({ city }: Props) {
  const { toast } = useToast();
  const currency = useDefaultCurrency();
  const { data: vendors } = useVendors(city);
  const { data: categories } = useExpenseCategories();
  const deleteExpense = useDeleteExpense();

  const [addOpen, setAddOpen] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [filters, setFilters] = useState<ExpenseFilters>({ city });

  const activeFilters: ExpenseFilters = { ...filters, city, page, pageSize: PAGE_SIZE };
  const { data: result, isLoading } = useExpenses(activeFilters);
  const expenses = result?.data ?? [];
  const totalCount = result?.count ?? 0;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteExpense.mutateAsync(deleteId);
      toast({ title: "Expense deleted" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
    setDeleteId(null);
  };

  const handleExportCsv = () => {
    if (!expenses.length) return;
    const headers = ["Date", "Vendor", "Category", "Subtotal", "CGST", "SGST", "IGST", "Total", "Payment Method", "Reference", "Notes"];
    const rows = expenses.map((e) => [
      e.expense_date, e.vendors?.name || "", e.expense_categories?.name || "",
      e.subtotal, e.cgst_total, e.sgst_total, e.igst_total, e.total,
      e.payment_method || "", e.payment_reference || "", e.notes || ""
    ]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `expenses-${city}-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-base flex items-center gap-2"><Receipt className="h-5 w-5" />Expenses</CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleExportCsv} disabled={!expenses.length}>
              <Download className="h-3.5 w-3.5 mr-1" />CSV
            </Button>
            <Button variant="outline" size="sm" onClick={() => setScannerOpen(true)}>
              <ScanLine className="h-3.5 w-3.5 mr-1" />Scan Bill
            </Button>
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <Plus className="h-3.5 w-3.5 mr-1" />Add Expense
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap gap-2">
            <Select value={filters.vendorId || "all"} onValueChange={(v) => { setFilters((f) => ({ ...f, vendorId: v === "all" ? undefined : v })); setPage(0); }}>
              <SelectTrigger className="w-[160px] h-8 text-xs"><SelectValue placeholder="All Vendors" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Vendors</SelectItem>
                {(vendors ?? []).map((v) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filters.categoryId || "all"} onValueChange={(v) => { setFilters((f) => ({ ...f, categoryId: v === "all" ? undefined : v })); setPage(0); }}>
              <SelectTrigger className="w-[160px] h-8 text-xs"><SelectValue placeholder="All Categories" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {(categories ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filters.paymentMethod || "all"} onValueChange={(v) => { setFilters((f) => ({ ...f, paymentMethod: v === "all" ? undefined : v })); setPage(0); }}>
              <SelectTrigger className="w-[140px] h-8 text-xs"><SelectValue placeholder="All Methods" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Methods</SelectItem>
                {PAYMENT_METHODS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input type="date" className="w-[140px] h-8 text-xs" value={filters.startDate || ""} onChange={(e) => { setFilters((f) => ({ ...f, startDate: e.target.value || undefined })); setPage(0); }} />
            <span className="text-xs self-center text-muted-foreground">to</span>
            <Input type="date" className="w-[140px] h-8 text-xs" value={filters.endDate || ""} onChange={(e) => { setFilters((f) => ({ ...f, endDate: e.target.value || undefined })); setPage(0); }} />
          </div>

          {isLoading ? (
            <Loader2 className="mx-auto h-6 w-6 animate-spin" />
          ) : !expenses.length ? (
            <p className="text-muted-foreground text-sm text-center py-8">No expenses found.</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Vendor</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="text-right">GST</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead className="w-12"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {expenses.map((exp) => (
                      <TableRow key={exp.id}>
                        <TableCell className="text-sm">{format(new Date(exp.expense_date), "dd MMM yyyy")}</TableCell>
                        <TableCell className="font-medium text-sm">{exp.vendors?.name || "—"}</TableCell>
                        <TableCell><Badge variant="outline" className="text-xs">{exp.expense_categories?.name || "—"}</Badge></TableCell>
                        <TableCell className="text-right text-sm">{currency.format(exp.subtotal)}</TableCell>
                        <TableCell className="text-right text-sm text-muted-foreground">{currency.format(exp.cgst_total + exp.sgst_total + exp.igst_total)}</TableCell>
                        <TableCell className="text-right font-medium text-sm">{currency.format(exp.total)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{exp.payment_method || "—"}</TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDeleteId(exp.id)}>
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-2">
                  <span className="text-xs text-muted-foreground">{totalCount} expense{totalCount !== 1 ? "s" : ""}</span>
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="icon" className="h-7 w-7" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </Button>
                    <span className="text-xs px-2">{page + 1} / {totalPages}</span>
                    <Button variant="outline" size="icon" className="h-7 w-7" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <AddExpenseDialog open={addOpen} onOpenChange={setAddOpen} city={city} />

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete expense?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
