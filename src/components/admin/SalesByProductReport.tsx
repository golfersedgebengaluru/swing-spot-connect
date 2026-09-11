import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ChevronDown, ChevronRight, Download, Loader2, Package, Truck } from "lucide-react";
import {
  salesToCsv,
  type CategoryRow,
  type SkuRow,
  type VendorRow,
} from "@/lib/sales-by-product";

interface Props {
  byCategoryRows: CategoryRow[];
  byVendor: VendorRow[];
  bySku: SkuRow[];
  currencySymbol: string;
  periodLabel: string;
  cityLabel?: string;
  isLoading: boolean;
}

/**
 * Sales by SKU — reads the already-computed summary buckets (no extra fetch), so
 * the totals here always reconcile with the revenue tiles above it.
 */
export function SalesByProductReport({
  byCategoryRows,
  byVendor,
  bySku,
  currencySymbol,
  periodLabel,
  cityLabel,
  isLoading,
}: Props) {
  const [view, setView] = useState<"category" | "vendor">("category");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const toggle = (key: string) =>
    setExpanded((e) => ({ ...e, [key]: !e[key] }));

  const money = (n: number) =>
    `${n < 0 ? "-" : ""}${currencySymbol}${Math.abs(n).toLocaleString()}`;

  const totalUnits = bySku.reduce((s, r) => s + r.units, 0);
  const totalNet = bySku.reduce((s, r) => s + r.net, 0);

  const handleExport = () => {
    const csv = salesToCsv(bySku);
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sales_by_sku_${cityLabel ? `${cityLabel}_` : ""}${periodLabel}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const groups: Array<{ key: string; label: string; units: number; net: number; skus: SkuRow[] }> =
    view === "category"
      ? byCategoryRows.map((c) => ({ key: c.category, label: c.category, units: c.units, net: c.net, skus: c.skus }))
      : byVendor.map((v) => ({ key: v.vendorName, label: v.vendorName, units: v.units, net: v.net, skus: v.skus }));

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Package className="h-4 w-4" /> Sales by SKU
        </CardTitle>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button
            variant={view === "category" ? "default" : "outline"}
            size="sm"
            onClick={() => setView("category")}
          >
            <Package className="mr-1 h-3.5 w-3.5" /> By Category
          </Button>
          <Button
            variant={view === "vendor" ? "default" : "outline"}
            size="sm"
            onClick={() => setView("vendor")}
          >
            <Truck className="mr-1 h-3.5 w-3.5" /> By Vendor
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={bySku.length === 0}
            className="sm:ml-auto"
          >
            <Download className="mr-1 h-4 w-4" /> CSV
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {bySku.length === 0 ? (
          <p className="py-8 text-center text-muted-foreground">No sales for this period.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{view === "category" ? "Category" : "Vendor"}</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead className="text-right">Units</TableHead>
                  <TableHead className="text-right">Net Revenue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groups.map((g) => (
                  <>
                    <TableRow
                      key={g.key}
                      className="cursor-pointer"
                      onClick={() => toggle(g.key)}
                      data-testid={`group-${g.key}`}
                    >
                      <TableCell className="font-medium text-sm">
                        <span className="inline-flex items-center gap-1">
                          {expanded[g.key]
                            ? <ChevronDown className="h-3.5 w-3.5" />
                            : <ChevronRight className="h-3.5 w-3.5" />}
                          {g.label}
                          <Badge variant="secondary" className="ml-1 text-[10px]">
                            {g.skus.length}
                          </Badge>
                        </span>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">—</TableCell>
                      <TableCell className="text-right text-sm">{g.units}</TableCell>
                      <TableCell className="text-right text-sm font-medium">{money(g.net)}</TableCell>
                    </TableRow>
                    {expanded[g.key] &&
                      g.skus.map((s) => (
                        <TableRow key={`${g.key}-${s.key}`} className="bg-muted/30">
                          <TableCell className="pl-8 text-sm">{s.name}</TableCell>
                          <TableCell className="font-mono text-xs">{s.sku}</TableCell>
                          <TableCell className="text-right text-sm">{s.units}</TableCell>
                          <TableCell className="text-right text-sm">{money(s.net)}</TableCell>
                        </TableRow>
                      ))}
                  </>
                ))}
                <TableRow>
                  <TableCell className="font-semibold text-sm">Total</TableCell>
                  <TableCell />
                  <TableCell className="text-right font-semibold text-sm">{totalUnits}</TableCell>
                  <TableCell className="text-right font-semibold text-sm">{money(totalNet)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
