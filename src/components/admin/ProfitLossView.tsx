import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { Loader2 } from "lucide-react";
import { useDefaultCurrency } from "@/hooks/useCurrency";
import { useExpenses } from "@/hooks/useExpenses";
import { useExpenseCategories } from "@/hooks/useExpenseCategories";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
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

function useRevenueForPeriod(city: string, startDate?: string, endDate?: string) {
  return useQuery({
    queryKey: ["revenue_for_pl", city, startDate, endDate],
    enabled: !!city && !!startDate && !!endDate,
    queryFn: async () => {
      let query = supabase.from("revenue_transactions" as any)
        .select("amount, transaction_type")
        .eq("city", city)
        .eq("status", "confirmed");

      if (startDate) query = query.gte("created_at", `${startDate}T00:00:00`);
      if (endDate) query = query.lte("created_at", `${endDate}T23:59:59`);

      const { data, error } = await query;
      if (error) throw error;

      let revenue = 0;
      let refunds = 0;
      (data ?? []).forEach((t: any) => {
        if (t.transaction_type === "refund" || t.amount < 0) {
          refunds += Math.abs(t.amount);
        } else {
          revenue += t.amount;
        }
      });
      return { revenue, refunds, netRevenue: revenue - refunds };
    },
  });
}

export function ProfitLossView({ city }: Props) {
  const currency = useDefaultCurrency();
  const { data: categories } = useExpenseCategories();

  const [period, setPeriod] = useState<Period>("this_month");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  const dates = period === "custom" ? { start: customStart, end: customEnd } : getPeriodDates(period);

  const { data: revenueData, isLoading: loadingRevenue } = useRevenueForPeriod(city, dates.start, dates.end);
  const { data: expenseResult, isLoading: loadingExpenses } = useExpenses({
    city,
    startDate: dates.start || undefined,
    endDate: dates.end || undefined,
    pageSize: 1000,
    page: 0,
  });

  const expenses = expenseResult?.data ?? [];

  const byCategory = useMemo(() => {
    const map: Record<string, { name: string; total: number }> = {};
    expenses.forEach((e) => {
      const catName = e.expense_categories?.name || "Uncategorized";
      if (!map[catName]) map[catName] = { name: catName, total: 0 };
      map[catName].total += e.total;
    });
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [expenses]);

  const totalExpenses = expenses.reduce((s, e) => s + e.total, 0);
  const netRevenue = revenueData?.netRevenue ?? 0;
  const profitLoss = netRevenue - totalExpenses;

  const isLoading = loadingRevenue || loadingExpenses;

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

      {isLoading ? (
        <Loader2 className="mx-auto h-6 w-6 animate-spin" />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Profit & Loss — {dates.start} to {dates.end}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Revenue */}
            <div className="space-y-1.5 text-sm">
              <h4 className="font-medium text-muted-foreground uppercase text-xs tracking-wide">Revenue</h4>
              <div className="flex justify-between"><span>Gross Revenue</span><span>{currency.format(revenueData?.revenue ?? 0)}</span></div>
              <div className="flex justify-between text-muted-foreground"><span>Less: Refunds</span><span>({currency.format(revenueData?.refunds ?? 0)})</span></div>
              <div className="flex justify-between font-medium border-t border-border pt-1"><span>Net Revenue</span><span>{currency.format(netRevenue)}</span></div>
            </div>

            <Separator />

            {/* Expenses */}
            <div className="space-y-1.5 text-sm">
              <h4 className="font-medium text-muted-foreground uppercase text-xs tracking-wide">Expenses</h4>
              {byCategory.length === 0 ? (
                <p className="text-muted-foreground text-sm">No expenses recorded.</p>
              ) : (
                byCategory.map((row) => (
                  <div key={row.name} className="flex justify-between">
                    <span>{row.name}</span>
                    <span>{currency.format(row.total)}</span>
                  </div>
                ))
              )}
              <div className="flex justify-between font-medium border-t border-border pt-1"><span>Total Expenses</span><span>{currency.format(totalExpenses)}</span></div>
            </div>

            <Separator />

            {/* Net P&L */}
            <div className={`flex justify-between text-lg font-semibold ${profitLoss >= 0 ? "text-green-600" : "text-destructive"}`}>
              <span>{profitLoss >= 0 ? "Net Profit" : "Net Loss"}</span>
              <span>{currency.format(Math.abs(profitLoss))}</span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
