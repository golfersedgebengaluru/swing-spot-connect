import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { Plus, Pencil, Trash2, Loader2, Download, Upload } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAllProducts } from "@/hooks/useProducts";
import { useDefaultCurrency } from "@/hooks/useCurrency";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

function ProductForm({ product, onSave, onCancel }: { product?: any; onSave: (data: any) => void; onCancel: () => void }) {
  const [form, setForm] = useState({
    name: product?.name ?? "",
    description: product?.description ?? "",
    price: product?.price ?? 0,
    category: product?.category ?? "other",
    type: product?.type ?? "beverage",
    badge: product?.badge ?? "",
    sizes: product?.sizes?.join(", ") ?? "",
    colors: product?.colors?.join(", ") ?? "",
    in_stock: product?.in_stock ?? true,
    sort_order: product?.sort_order ?? 0,
    item_type: product?.item_type ?? "product",
    hsn_code: product?.hsn_code ?? "",
    sac_code: product?.sac_code ?? "",
    gst_rate: product?.gst_rate ?? 0,
  });

  const handleSave = () => {
    onSave({
      ...form,
      price: Number(form.price),
      gst_rate: Number(form.gst_rate),
      hsn_code: form.item_type === "product" ? (form.hsn_code || null) : null,
      sac_code: form.item_type === "service" ? (form.sac_code || null) : null,
      sizes: form.sizes ? form.sizes.split(",").map((s: string) => s.trim()).filter(Boolean) : null,
      colors: form.colors ? form.colors.split(",").map((s: string) => s.trim()).filter(Boolean) : null,
      badge: form.badge || null,
    });
  };

  return (
    <div className="space-y-4">
      <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
      <div><Label>Description</Label><RichTextEditor content={form.description} onChange={(html) => setForm({ ...form, description: html })} minHeight="120px" /></div>
      <div className="grid grid-cols-2 gap-4">
        <div><Label>Price</Label><Input type="number" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></div>
        <div><Label>Display Type</Label>
          <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="beverage">Beverage</SelectItem>
              <SelectItem value="merchandise">Merchandise</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* GST Classification */}
      <div className="rounded-lg border border-border p-4 space-y-4 bg-muted/30">
        <h4 className="text-sm font-medium text-foreground">GST Classification</h4>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Item Type</Label>
            <Select value={form.item_type} onValueChange={(v) => setForm({ ...form, item_type: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="product">Product (Goods)</SelectItem>
                <SelectItem value="service">Service</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>{form.item_type === "service" ? "SAC Code" : "HSN Code"}</Label>
            <Input
              value={form.item_type === "service" ? form.sac_code : form.hsn_code}
              onChange={(e) =>
                setForm({
                  ...form,
                  ...(form.item_type === "service" ? { sac_code: e.target.value } : { hsn_code: e.target.value }),
                })
              }
              placeholder={form.item_type === "service" ? "e.g. 998311" : "e.g. 6110"}
            />
          </div>
        </div>
        <div className="max-w-[200px]">
          <Label>GST Rate (%)</Label>
          <Input type="number" step="0.01" min={0} value={form.gst_rate} onChange={(e) => setForm({ ...form, gst_rate: e.target.value })} placeholder="18" />
          {Number(form.gst_rate) > 0 && (
            <p className="text-xs text-muted-foreground mt-1">
              CGST: {(Number(form.gst_rate) / 2).toFixed(1)}% + SGST: {(Number(form.gst_rate) / 2).toFixed(1)}%
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div><Label>Category</Label><Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="coffee, beer, apparel..." /></div>
        <div><Label>Badge</Label><Input value={form.badge} onChange={(e) => setForm({ ...form, badge: e.target.value })} placeholder="e.g. Premium" /></div>
      </div>
      <div><Label>Sizes (comma-separated)</Label><Input value={form.sizes} onChange={(e) => setForm({ ...form, sizes: e.target.value })} placeholder="S, M, L, XL" /></div>
      <div><Label>Colors (comma-separated)</Label><Input value={form.colors} onChange={(e) => setForm({ ...form, colors: e.target.value })} placeholder="Black, White, Navy" /></div>
      <div className="grid grid-cols-2 gap-4">
        <div><Label>Sort Order</Label><Input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })} /></div>
        <div className="flex items-center gap-2 pt-6"><Switch checked={form.in_stock} onCheckedChange={(v) => setForm({ ...form, in_stock: v })} /><Label>In Stock</Label></div>
      </div>
      <div className="flex gap-2 justify-end">
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button onClick={handleSave}>Save</Button>
      </div>
    </div>
  );
}

const CSV_HEADERS = ["name", "description", "price", "category", "type", "item_type", "hsn_code", "sac_code", "gst_rate", "badge", "sizes", "colors", "in_stock", "sort_order"];

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
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSave = async (data: any) => {
    const { error } = editingProduct?.id
      ? await supabase.from("products").update(data).eq("id", editingProduct.id)
      : await supabase.from("products").insert(data);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: editingProduct?.id ? "Product updated" : "Product created" });
    queryClient.invalidateQueries({ queryKey: ["products"] });
    setEditingProduct(null);
    setDialogOpen(false);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("products").delete().eq("id", id);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Deleted successfully" });
    queryClient.invalidateQueries({ queryKey: ["products"] });
  };

  const handleExport = () => {
    if (!products?.length) return;
    const rows = products.map((p: any) => CSV_HEADERS.map((h) => {
      const val = p[h];
      if (val === null || val === undefined) return "";
      if (Array.isArray(val)) return `"${val.join(", ")}"`;
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
    toast({ title: "Exported", description: `${products.length} items exported.` });
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

      // Validate required column
      if (!headerMap.includes("name")) throw new Error("Missing required 'name' column.");

      const rows: any[] = [];
      for (let i = 1; i < lines.length; i++) {
        const values = parseCSVLine(lines[i]);
        const row: any = {};
        headerMap.forEach((col, idx) => {
          if (CSV_HEADERS.includes(col)) row[col] = values[idx] ?? "";
        });

        if (!row.name) continue; // skip empty rows

        // Type coercion
        row.price = Number(row.price) || 0;
        row.gst_rate = Number(row.gst_rate) || 0;
        row.sort_order = Number(row.sort_order) || 0;
        row.in_stock = row.in_stock === undefined || row.in_stock === "" || row.in_stock === "true" || row.in_stock === "TRUE" || row.in_stock === "1";
        row.item_type = row.item_type === "service" ? "service" : "product";
        row.type = row.type || "beverage";
        row.category = row.category || "other";
        row.hsn_code = row.hsn_code || null;
        row.sac_code = row.sac_code || null;
        row.badge = row.badge || null;
        row.description = row.description || null;
        row.sizes = row.sizes ? row.sizes.split(",").map((s: string) => s.trim()).filter(Boolean) : null;
        row.colors = row.colors ? row.colors.split(",").map((s: string) => s.trim()).filter(Boolean) : null;

        rows.push(row);
      }

      if (rows.length === 0) throw new Error("No valid data rows found.");

      const { error } = await supabase.from("products").insert(rows);
      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast({ title: "Imported", description: `${rows.length} items imported.` });
    } catch (err: any) {
      toast({ title: "Import failed", description: err.message, variant: "destructive" });
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 justify-end">
        <Button variant="outline" onClick={handleExport} disabled={!products?.length}>
          <Download className="mr-2 h-4 w-4" /> Export CSV
        </Button>
        <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={importing}>
          {importing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
          Import CSV
        </Button>
        <input ref={fileInputRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleImport} />
        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) setEditingProduct(null); }}>
          <DialogTrigger asChild>
            <Button onClick={() => setEditingProduct({})}><Plus className="mr-2 h-4 w-4" />Add Product</Button>
          </DialogTrigger>
          <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-lg">
            <DialogHeader><DialogTitle>{editingProduct?.id ? "Edit Product" : "New Product"}</DialogTitle></DialogHeader>
            <ProductForm product={editingProduct} onSave={handleSave} onCancel={() => { setDialogOpen(false); setEditingProduct(null); }} />
          </DialogContent>
        </Dialog>
      </div>
      {isLoading ? <Loader2 className="mx-auto h-8 w-8 animate-spin" /> : (
        <div className="space-y-3">
          {(products ?? []).length === 0 && <p className="text-center text-muted-foreground py-8">No products yet.</p>}
          {(products ?? []).map((product) => (
            <Card key={product.id} className="shadow-elegant">
              <CardContent className="flex items-center justify-between p-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium text-foreground">{product.name}</h3>
                    <Badge variant="outline" className="text-[10px]">
                      {(product as any).item_type === "service" ? "Service" : "Product"}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {currency.format(Number(product.price))} · {product.type} · {product.category}
                    {Number((product as any).gst_rate) > 0 && ` · GST ${(product as any).gst_rate}%`}
                    {(product as any).hsn_code && ` · HSN: ${(product as any).hsn_code}`}
                    {(product as any).sac_code && ` · SAC: ${(product as any).sac_code}`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {!product.in_stock && <Badge variant="secondary">Out of stock</Badge>}
                  <Button variant="outline" size="icon" onClick={() => { setEditingProduct(product); setDialogOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="outline" size="icon" onClick={() => handleDelete(product.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
