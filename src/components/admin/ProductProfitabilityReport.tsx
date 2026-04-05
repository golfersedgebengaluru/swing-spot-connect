import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { useAllProducts } from "@/hooks/useProducts";
import { useDefaultCurrency } from "@/hooks/useCurrency";

interface Props {
  city?: string;
}

export function ProductProfitabilityReport({ city }: Props) {
  const { data: products, isLoading } = useAllProducts();
  const currency = useDefaultCurrency();

  const rows = useMemo(() => {
    if (!products) return [];
    let list = products as any[];
    if (city) {
      list = list.filter((p) => p.city === city || !p.city);
    }
    return list
      .map((p) => {
        const sellingPrice = Number(p.price) || 0;
        const costPrice = Number(p.cost_price) || 0;
        const margin = sellingPrice - costPrice;
        const marginPct = sellingPrice > 0 ? (margin / sellingPrice) * 100 : 0;
        return {
          id: p.id,
          name: p.name,
          sku: p.sku,
          category: p.category,
          itemType: p.item_type,
          city: p.city || "Global",
          sellingPrice,
          costPrice,
          margin,
          marginPct,
          gstRate: Number(p.gst_rate) || 0,
        };
      })
      .sort((a, b) => b.margin - a.margin);
  }, [products, city]);

  const totalRevenuePotential = rows.reduce((s, r) => s + r.sellingPrice, 0);
  const totalCost = rows.reduce((s, r) => s + r.costPrice, 0);
  const avgMargin = rows.length > 0 ? rows.reduce((s, r) => s + r.marginPct, 0) / rows.length : 0;

  if (isLoading) return <Loader2 className="mx-auto h-6 w-6 animate-spin" />;

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total Products</p>
            <p className="text-2xl font-bold text-foreground">{rows.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Avg. Margin</p>
            <p className={`text-2xl font-bold ${avgMargin >= 0 ? "text-green-600" : "text-destructive"}`}>
              {avgMargin.toFixed(1)}%
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total Spread</p>
            <p className="text-2xl font-bold text-foreground">
              {currency.format(totalRevenuePotential - totalCost)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Product Margin Analysis</CardTitle>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No products found.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead className="text-right">Cost Price</TableHead>
                    <TableHead className="text-right">Selling Price</TableHead>
                    <TableHead className="text-right">Margin</TableHead>
                    <TableHead className="text-right">Margin %</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium text-sm">{r.name}</p>
                          {r.sku && <p className="text-xs text-muted-foreground font-mono">{r.sku}</p>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">{r.category}</Badge>
                      </TableCell>
                      <TableCell className="text-sm">{r.city}</TableCell>
                      <TableCell className="text-right text-sm">{currency.format(r.costPrice)}</TableCell>
                      <TableCell className="text-right text-sm">{currency.format(r.sellingPrice)}</TableCell>
                      <TableCell className={`text-right text-sm font-medium ${r.margin >= 0 ? "text-green-600" : "text-destructive"}`}>
                        {currency.format(r.margin)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge
                          variant={r.marginPct >= 20 ? "default" : r.marginPct >= 0 ? "secondary" : "destructive"}
                          className="text-xs"
                        >
                          {r.marginPct.toFixed(1)}%
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
