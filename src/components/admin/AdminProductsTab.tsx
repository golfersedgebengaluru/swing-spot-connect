import { useState, useRef, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil, Trash2, Loader2, Download, Upload, Info, Search } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAllProducts } from "@/hooks/useProducts";
import { useDefaultCurrency } from "@/hooks/useCurrency";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { ProductForm } from "@/components/admin/ProductForm";
import { useAdmin } from "@/hooks/useAdmin";
import { useCities } from "@/hooks/useBookings";
import { useAdminCity } from "@/contexts/AdminCityContext";
import { useProductCostPrices, useSetProductCostPrice } from "@/hooks/useCostPrice";

const CSV_HEADERS = ["name", "description", "price", "cost_price", "category", "item_type", "sku", "unit_of_measure", "hsn_code", "sac_code", "gst_rate", "in_stock", "opening_stock", "reorder_level", "reorder_quantity", "duration_minutes", "bookable", "city"];

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

export function AdminProductsTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: products, isLoading } = useAllProducts();
  const currency = useDefaultCurrency();
  const { isAdmin, isSiteAdmin, assignedCities } = useAdmin();
  const { data: allCities } = useCities();
  const { selectedCity: globalCity } = useAdminCity();
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [cityFilter, setCityFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const effectiveCityFilter = globalCity || cityFilter;

  // Filter products by city for display
  const filteredProducts = useMemo(() => {
    if (!products) return [];
    let list = products as any[];
    if (isSiteAdmin && !isAdmin) {
      list = list.filter((p: any) => !p.city || assignedCities.includes(p.city));
    }
    if (effectiveCityFilter !== "all" && effectiveCityFilter) {
      if (effectiveCityFilter === "global") {
        list = list.filter((p: any) => !p.city);
      } else {
        list = list.filter((p: any) => p.city === effectiveCityFilter);
      }
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((p: any) =>
        p.name?.toLowerCase().includes(q) ||
        p.sku?.toLowerCase().includes(q) ||
        p.category?.toLowerCase().includes(q) ||
        p.description?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [products, effectiveCityFilter, isAdmin, isSiteAdmin, assignedCities, searchQuery]);

  const setCostPriceMut = useSetProductCostPrice();
  const productIds = useMemo(() => (products ?? []).map((p: any) => p.id), [products]);
  const { data: costPriceMap } = useProductCostPrices(productIds.length ? productIds : undefined);

  const handleSave = async (data: any) => {
    // Extract the pending cost_price (set via RPC since column is REVOKED)
    const pendingCost = data.__cost_price_pending;
    delete data.__cost_price_pending;

    let savedId: string | undefined = editingProduct?.id;
    if (savedId) {
      const { error } = await supabase.from("products").update(data).eq("id", savedId);
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    } else {
      const { data: ins, error } = await supabase.from("products").insert(data).select("id").single();
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
      savedId = ins?.id;
    }

    if (savedId && typeof pendingCost === "number") {
      try { await setCostPriceMut.mutateAsync({ id: savedId, cost: pendingCost }); }
      catch (err: any) {
        toast({ title: "Cost price not saved", description: err.message, variant: "destructive" });
      }
    }

    toast({ title: editingProduct?.id ? "Product updated" : "Product created" });
    queryClient.invalidateQueries({ queryKey: ["products"] });
    setEditingProduct(null);
    setDialogOpen(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this item?")) return;
    // Unlink from bay_pricing first to avoid FK constraint errors
    await supabase.from("bay_pricing").update({ service_product_id: null }).eq("service_product_id", id);
    const { error } = await supabase.from("products").delete().eq("id", id);
    if (error) {
      // Friendly message when the DB-side guard blocks deletion of an
      // invoice-referenced product.
      const msg = /referenced by .* issued invoice/i.test(error.message)
        ? "This item is on one or more issued invoices and cannot be deleted. Mark it out of stock / not bookable instead so historical invoices stay intact."
        : error.message;
      toast({ title: "Cannot delete", description: msg, variant: "destructive" });
      return;
    }
    toast({ title: "Deleted successfully" });
    queryClient.invalidateQueries({ queryKey: ["products"] });
  };

  const handleExport = () => {
    if (!filteredProducts.length) return;
    const rows = filteredProducts.map((p: any) => CSV_HEADERS.map((h) => {
      let val: any;
      if (h === "cost_price") {
        val = costPriceMap?.get(p.id) ?? "";
      } else {
        val = p[h];
      }
      if (val === null || val === undefined) return "";
      const str = String(val);
      return str.includes(",") || str.includes('"') || str.includes("\n") ? `"${str.replace(/"/g, '""')}"` : str;
    }).join(","));
    const csv = [CSV_HEADERS.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `products_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Exported", description: `${filteredProducts.length} items exported.` });
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter((l) => l.trim());
      if (lines.length < 2) throw new Error("File must have a header row and at least one data row.");
      const headerLine = parseCSVLine(lines[0]);
      const headerMap = headerLine.map((h) => h.toLowerCase().replace(/\s+/g, "_"));
      if (!headerMap.includes("name")) throw new Error("Missing required 'name' column.");
      const rows: any[] = [];
      for (let i = 1; i < lines.length; i++) {
        const values = parseCSVLine(lines[i]);
        const row: any = {};
        headerMap.forEach((col, idx) => {
          if (CSV_HEADERS.includes(col)) row[col] = values[idx] ?? "";
        });
        if (!row.name) continue;
        row.price = Number(row.price) || 0;
        const pendingCost = row.cost_price !== undefined && row.cost_price !== "" ? Number(row.cost_price) || 0 : null;
        delete row.cost_price; // column is REVOKED; set via RPC after row insert/update
        row.__pending_cost = pendingCost;
        row.gst_rate = Number(row.gst_rate) || 0;
        row.in_stock = row.in_stock === undefined || row.in_stock === "" || row.in_stock === "true" || row.in_stock === "TRUE" || row.in_stock === "1";
        row.bookable = row.bookable === "true" || row.bookable === "TRUE" || row.bookable === "1";
        row.item_type = row.item_type === "service" ? "service" : "product";
        row.type = row.item_type === "service" ? "beverage" : "merchandise";
        row.category = row.category || "Other";
        row.unit_of_measure = row.unit_of_measure || "Each";
        row.hsn_code = row.hsn_code || null;
        row.sac_code = row.sac_code || null;
        row.sku = row.sku || null;
        row.description = row.description || null;
        row.opening_stock = row.opening_stock ? Number(row.opening_stock) : null;
        row.reorder_level = row.reorder_level ? Number(row.reorder_level) : null;
        row.reorder_quantity = row.reorder_quantity ? Number(row.reorder_quantity) : null;
        row.duration_minutes = row.duration_minutes ? Number(row.duration_minutes) : null;
        // City: use CSV value, or auto-assign for site-admin
        if (row.city && row.city.trim()) {
          row.city = row.city.trim();
        } else if (isSiteAdmin && !isAdmin && assignedCities.length === 1) {
          row.city = assignedCities[0];
        } else {
          row.city = null;
        }
        rows.push(row);
      }
      if (rows.length === 0) throw new Error("No valid data rows found.");
      // Upsert by SKU if available, otherwise insert (append)
      let upserted = 0;
      let inserted = 0;
      let costFailed = 0;
      for (const row of rows) {
        const pendingCost: number | null = row.__pending_cost;
        delete row.__pending_cost;
        let savedId: string | undefined;
        if (row.sku) {
          const { data: existing } = await supabase.from("products").select("id").eq("sku", row.sku).maybeSingle();
          if (existing) {
            const { error } = await supabase.from("products").update(row).eq("id", existing.id);
            if (error) throw error;
            savedId = existing.id;
            upserted++;
          } else {
            const { data: ins, error } = await supabase.from("products").insert(row).select("id").single();
            if (error) throw error;
            savedId = ins?.id;
            inserted++;
          }
        } else {
          const { data: ins, error } = await supabase.from("products").insert(row).select("id").single();
          if (error) throw error;
          savedId = ins?.id;
          inserted++;
        }
        if (savedId && pendingCost !== null) {
          try { await setCostPriceMut.mutateAsync({ id: savedId, cost: pendingCost }); }
          catch { costFailed++; }
        }
      }
      queryClient.invalidateQueries({ queryKey: ["products"] });
      const parts = [];
      if (inserted > 0) parts.push(`${inserted} added`);
      if (upserted > 0) parts.push(`${upserted} updated`);
      if (costFailed > 0) parts.push(`${costFailed} cost prices skipped (not authorized)`);
      toast({ title: "Imported", description: parts.join(", ") + "." });
    } catch (err: any) {
      toast({ title: "Import failed", description: err.message, variant: "destructive" });
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search products..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 w-[200px]"
            />
          </div>
          <Select value={cityFilter} onValueChange={setCityFilter}>
            <SelectTrigger className="w-[180px]"><SelectValue placeholder="Filter by location" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Locations</SelectItem>
              <SelectItem value="global">Global Only</SelectItem>
              {(isSiteAdmin && !isAdmin ? assignedCities : (allCities ?? [])).map((c: string) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={handleExport} disabled={!filteredProducts.length}>
            <Download className="mr-2 h-4 w-4" /> Export CSV
          </Button>
          <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={importing}>
            {importing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
            Import CSV
          </Button>
          <input ref={fileInputRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleImport} />
          <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) setEditingProduct(null); }}>
            <DialogTrigger asChild>
              <Button onClick={() => setEditingProduct({})}><Plus className="mr-2 h-4 w-4" />Add Item</Button>
            </DialogTrigger>
            <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
              <DialogHeader><DialogTitle>{editingProduct?.id ? "Edit Item" : "New Item"}</DialogTitle></DialogHeader>
              <ProductForm product={editingProduct} onSave={handleSave} onCancel={() => { setDialogOpen(false); setEditingProduct(null); }} />
            </DialogContent>
          </Dialog>
        </div>
      </div>
      <Alert className="border-muted bg-muted/30">
        <Info className="h-4 w-4" />
        <AlertDescription className="text-xs text-muted-foreground">
          <strong>CSV Import:</strong> Items with a matching SKU will be updated. Items without a SKU or with a new SKU will be added as new entries. Use <strong>Export CSV</strong> to get the correct format.
        </AlertDescription>
      </Alert>
      {isLoading ? <Loader2 className="mx-auto h-8 w-8 animate-spin" /> : (
        <div className="space-y-3">
          {filteredProducts.length === 0 && <p className="text-center text-muted-foreground py-8">No products or services yet.</p>}
          {filteredProducts.map((product: any) => {
            const p = product as any;
            const isService = p.item_type === "service";
            return (
              <Card key={product.id} className="shadow-elegant">
                <CardContent className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-medium text-foreground">{product.name}</h3>
                      <Badge variant="outline" className="text-[10px]">
                        {isService ? "Service" : "Product"}
                      </Badge>
                      {p.sku && <span className="text-[10px] text-muted-foreground font-mono">{p.sku}</span>}
                      {p.city ? (
                        <Badge variant="secondary" className="text-[10px]">{p.city}</Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] text-muted-foreground">Global</Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground truncate">
                      {currency.format(Number(product.price))} · {product.category}
                      {Number(p.gst_rate) > 0 && ` · GST ${p.gst_rate}%`}
                      {p.hsn_code && ` · HSN: ${p.hsn_code}`}
                      {p.sac_code && ` · SAC: ${p.sac_code}`}
                      {isService && p.duration_minutes && ` · ${p.duration_minutes}min`}
                      {isService && p.bookable && ` · Bookable`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {!product.in_stock && <Badge variant="secondary">Out of stock</Badge>}
                    {(isAdmin || (isSiteAdmin && p.city)) && (
                      <>
                        <Button variant="outline" size="icon" onClick={() => { setEditingProduct(product); setDialogOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="outline" size="icon" onClick={() => handleDelete(product.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
