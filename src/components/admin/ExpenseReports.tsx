import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, TrendingDown, BarChart3, FileText } from "lucide-react";
import { useDefaultCurrency } from "@/hooks/useCurrency";
import { useExpenses, type Expense } from "@/hooks/useExpenses";
import { useExpenseCategories } from "@/hooks/useExpenseCategories";
import { useVendors } from "@/hooks/useVendors";
import { format, startOfMonth, endOfMonth, subMonths, startOfQuarter, endOfQuarter, startOfYear, endOfYear } from "date-fns";

interface Props {
  city: string;
}

type Period = "this_month" | "last_month" | "this_quarter" | "this_year" | "custom";

function getPeriodDates(period: Period): { start: string; end: string } {
  const now = new Date();
  switch (period) {
    case "this_month": return { start: format(startOfMonth(now), "yyyy-MM-dd"), end: format(endOfMonth(now), "yyyy-MM-dd") };
    case "last_month": { const lm = subMonths(now, 1); return { start: format(startOfMonth(lm), "yyyy-MM-dd"), end: format(endOfMonth(lm), "yyyy-MM-dd") }; }
    case "this_quarter": return { start: format(startOfQuarter(now), "yyyy-MM-dd"), end: format(endOfQuarter(now), "yyyy-MM-dd") };
    case "this_year": return { start: format(startOfYear(now), "yyyy-MM-dd"), end: format(endOfYear(now), "yyyy-MM-dd") };
    default: return { start: "", end: "" };
  }
}

export function ExpenseReports({ city }: Props) {
  const currency = useDefaultCurrency();
  const { data: categories } = useExpenseCategories();
  const { data: vendors } = useVendors(city);

  const [period, setPeriod] = useState<Period>("this_month");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [tab, setTab] = useState("by_period");

  const dates = period === "custom" ? { start: customStart, end: customEnd } : getPeriodDates(period);

  // Fetch ALL expenses for the period (large page size for reports)
  const { data: result, isLoading } = useExpenses({
    city,
    startDate: dates.start || undefined,
    endDate: dates.end || undefined,
    pageSize: 1000,
    page: 0,
  });
  const expenses = result?.data ?? [];

  // By Category
  const byCategory = useMemo(() => {
    const map: Record<string, { name: string; total: number; gst: number; count: number }> = {};
    expenses.forEach((e) => {
      const catName = e.expense_categories?.name || "Uncategorized";
      if (!map[catName]) map[catName] = { name: catName, total: 0, gst: 0, count: 0 };
      map[catName].total += e.total;
      map[catName].gst += e.cgst_total + e.sgst_total + e.igst_total;
      map[catName].count += 1;
    });
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [expenses]);

  // By Vendor
  const byVendor = useMemo(() => {
    const map: Record<string, { name: string; total: number; gst: number; count: number }> = {};
    expenses.forEach((e) => {
      const name = e.vendors?.name || "Unknown";
      if (!map[name]) map[name] = { name, total: 0, gst: 0, count: 0 };
      map[name].total += e.total;
      map[name].gst += e.cgst_total + e.sgst_total + e.igst_total;
      map[name].count += 1;
    });
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [expenses]);

  // GST Input Credit
  const gstSummary = useMemo(() => {
    let cgst = 0, sgst = 0, igst = 0;
    expenses.forEach((e) => { cgst += e.cgst_total; sgst += e.sgst_total; igst += e.igst_total; });
    return { cgst, sgst, igst, total: cgst + sgst + igst };
  }, [expenses]);

  // Totals
  const totalExpenses = useMemo(() => expenses.reduce((s, e) => s + e.total, 0), [expenses]);
  const totalSubtotal = useMemo(() => expenses.reduce((s, e) => s + e.subtotal, 0), [expenses]);

  return (
    <div className="space-y-4">
      {/* Period Selector */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
          <SelectTrigger className="w-[160px] h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="this_month">This Month</SelectItem>
            <SelectItem value="last_month">Last Month</SelectItem>
            <SelectItem value="this_quarter">This Quarter</SelectItem>
            <SelectItem value="this_year">This Year</SelectItem>
            <SelectItem value="custom">Custom</SelectItem>
          </SelectContent>
        </Select>
        {period === "custom" && (
          <>
            <Input type="date" className="w-[140px] h-8 text-xs" value={customStart} onChange={(e) => setCustomStart(e.target.value)} />
            <span className="text-xs text-muted-foreground">to</span>
            <Input type="date" className="w-[140px] h-8 text-xs" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} />
          </>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Total Expenses</p><p className="text-lg font-semibold">{currency.format(totalExpenses)}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Taxable Amount</p><p className="text-lg font-semibold">{currency.format(totalSubtotal)}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">GST Input Credit</p><p className="text-lg font-semibold">{currency.format(gstSummary.total)}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Transactions</p><p className="text-lg font-semibold">{expenses.length}</p></CardContent></Card>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="by_period"><BarChart3 className="h-3.5 w-3.5 mr-1" />By Period</TabsTrigger>
          <TabsTrigger value="by_category"><TrendingDown className="h-3.5 w-3.5 mr-1" />By Category</TabsTrigger>
          <TabsTrigger value="by_vendor">By Vendor</TabsTrigger>
          <TabsTrigger value="gst_credit"><FileText className="h-3.5 w-3.5 mr-1" />GST Input Credit</TabsTrigger>
        </TabsList>

        <TabsContent value="by_period">
          {isLoading ? <Loader2 className="mx-auto h-6 w-6 animate-spin" /> : (
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground mb-2">{dates.start} — {dates.end}</p>
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between"><span>Taxable Amount</span><span>{currency.format(totalSubtotal)}</span></div>
                  <div className="flex justify-between text-muted-foreground"><span>CGST</span><span>{currency.format(gstSummary.cgst)}</span></div>
                  <div className="flex justify-between text-muted-foreground"><span>SGST</span><span>{currency.format(gstSummary.sgst)}</span></div>
                  {gstSummary.igst > 0 && <div className="flex justify-between text-muted-foreground"><span>IGST</span><span>{currency.format(gstSummary.igst)}</span></div>}
                  <div className="flex justify-between font-semibold border-t border-border pt-1.5"><span>Total</span><span>{currency.format(totalExpenses)}</span></div>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="by_category">
          <Card>
            <CardContent className="p-4">
              {byCategory.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No expenses for this period.</p>
              ) : (
                <Table>
                  <TableHeader><TableRow><TableHead>Category</TableHead><TableHead className="text-right">Count</TableHead><TableHead className="text-right">GST</TableHead><TableHead className="text-right">Total</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {byCategory.map((row) => (
                      <TableRow key={row.name}>
                        <TableCell className="font-medium">{row.name}</TableCell>
                        <TableCell className="text-right">{row.count}</TableCell>
                        <TableCell className="text-right text-muted-foreground">{currency.format(row.gst)}</TableCell>
                        <TableCell className="text-right font-medium">{currency.format(row.total)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="by_vendor">
          <Card>
            <CardContent className="p-4">
              {byVendor.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No expenses for this period.</p>
              ) : (
                <Table>
                  <TableHeader><TableRow><TableHead>Vendor</TableHead><TableHead className="text-right">Count</TableHead><TableHead className="text-right">GST</TableHead><TableHead className="text-right">Total</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {byVendor.map((row) => (
                      <TableRow key={row.name}>
                        <TableCell className="font-medium">{row.name}</TableCell>
                        <TableCell className="text-right">{row.count}</TableCell>
                        <TableCell className="text-right text-muted-foreground">{currency.format(row.gst)}</TableCell>
                        <TableCell className="text-right font-medium">{currency.format(row.total)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="gst_credit">
          <Card>
            <CardHeader><CardTitle className="text-base">GST Input Credit Summary</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between"><span>CGST Paid</span><span>{currency.format(gstSummary.cgst)}</span></div>
              <div className="flex justify-between"><span>SGST Paid</span><span>{currency.format(gstSummary.sgst)}</span></div>
              <div className="flex justify-between"><span>IGST Paid</span><span>{currency.format(gstSummary.igst)}</span></div>
              <div className="flex justify-between font-semibold border-t border-border pt-2"><span>Total Input Credit</span><span>{currency.format(gstSummary.total)}</span></div>
              <p className="text-xs text-muted-foreground mt-2">This feeds into your GSTR-3B filing as input tax credit.</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
