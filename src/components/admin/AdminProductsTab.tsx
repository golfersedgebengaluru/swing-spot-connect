import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useProducts } from "@/hooks/useProducts";
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

export function AdminProductsTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: products, isLoading } = useProducts();
  const currency = useDefaultCurrency();
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

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

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
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
