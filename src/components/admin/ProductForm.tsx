import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { useProductCategories } from "@/hooks/useProductCategories";
import { useUnitsOfMeasure } from "@/hooks/useUnitsOfMeasure";
import { useCities } from "@/hooks/useBookings";
import { useAdmin } from "@/hooks/useAdmin";
import { useSiteAdminPermissions } from "@/hooks/useSiteAdminPermissions";

function generateSKU(itemType: string) {
  const prefix = itemType === "service" ? "SVC" : "PRD";
  return `${prefix}-${Date.now().toString(36).toUpperCase().slice(-6)}`;
}

interface ProductFormProps {
  product?: any;
  onSave: (data: any) => void;
  onCancel: () => void;
}

export function ProductForm({ product, onSave, onCancel }: ProductFormProps) {
  const { data: categories } = useProductCategories();
  const { data: units } = useUnitsOfMeasure();
  const { data: cities } = useCities();
  const { isAdmin, isSiteAdmin, assignedCities } = useAdmin();
  const { data: permissions } = useSiteAdminPermissions();
  const showCostPrice = isAdmin || (isSiteAdmin && permissions?.site_admin_cost_price_visible);

  const [form, setForm] = useState({
    name: product?.name ?? "",
    description: product?.description ?? "",
    category: product?.category ?? "Other",
    item_type: product?.item_type ?? "product",
    in_stock: product?.in_stock ?? true,
    sku: product?.sku ?? "",
    unit_of_measure: product?.unit_of_measure ?? "Each",
    cost_price: product?.cost_price ?? 0,
    price: product?.price ?? 0,
    hsn_code: product?.hsn_code ?? "",
    sac_code: product?.sac_code ?? "",
    gst_rate: product?.gst_rate ?? 0,
    opening_stock: product?.opening_stock ?? "",
    reorder_level: product?.reorder_level ?? "",
    reorder_quantity: product?.reorder_quantity ?? "",
    duration_minutes: product?.duration_minutes ?? "",
    bookable: product?.bookable ?? false,
    city: product?.city ?? (isSiteAdmin && assignedCities.length === 1 ? assignedCities[0] : ""),
  });

  // Price toggle: true = inclusive entry, false = exclusive entry
  const [priceInclusive, setPriceInclusive] = useState(true);
  const [displayPrice, setDisplayPrice] = useState(String(product?.price ?? 0));

  // Auto-generate SKU for new items
  useEffect(() => {
    if (!product?.id && !form.sku) {
      setForm((f) => ({ ...f, sku: generateSKU(f.item_type) }));
    }
  }, []);

  // Regenerate SKU prefix when type changes for new items
  useEffect(() => {
    if (!product?.id) {
      setForm((f) => ({ ...f, sku: generateSKU(f.item_type) }));
    }
  }, [form.item_type]);

  // Recalc display price when toggle or gst_rate changes
  useEffect(() => {
    const gst = Number(form.gst_rate) || 0;
    const stored = Number(form.price) || 0;
    if (priceInclusive) {
      setDisplayPrice(String(stored));
    } else {
      // Show exclusive price
      const exclusive = gst > 0 ? stored / (1 + gst / 100) : stored;
      setDisplayPrice(String(Math.round(exclusive * 100) / 100));
    }
  }, [priceInclusive, form.gst_rate]);

  const handlePriceChange = (val: string) => {
    setDisplayPrice(val);
    const num = Number(val) || 0;
    const gst = Number(form.gst_rate) || 0;
    if (priceInclusive) {
      setForm((f) => ({ ...f, price: num }));
    } else {
      // Convert exclusive to inclusive for storage
      const inclusive = gst > 0 ? num * (1 + gst / 100) : num;
      setForm((f) => ({ ...f, price: Math.round(inclusive * 100) / 100 }));
    }
  };

  const priceBreakdown = useMemo(() => {
    const gst = Number(form.gst_rate) || 0;
    const inclusive = Number(form.price) || 0;
    if (gst <= 0) return null;
    const base = inclusive / (1 + gst / 100);
    const tax = inclusive - base;
    return { base: Math.round(base * 100) / 100, tax: Math.round(tax * 100) / 100, inclusive };
  }, [form.price, form.gst_rate]);

  const isProduct = form.item_type === "product";

  const handleSave = () => {
    // Determine city value
    const cityValue = isAdmin
      ? (form.city === "" || form.city === "all" ? null : form.city)
      : (form.city || (assignedCities.length === 1 ? assignedCities[0] : null));

    onSave({
      name: form.name,
      description: form.description || null,
      category: form.category,
      item_type: form.item_type,
      type: isProduct ? "merchandise" : "beverage",
      in_stock: form.in_stock,
      sku: form.sku || null,
      unit_of_measure: form.unit_of_measure,
      cost_price: Number(form.cost_price) || 0,
      price: Number(form.price) || 0,
      hsn_code: isProduct ? (form.hsn_code || null) : null,
      sac_code: !isProduct ? (form.sac_code || null) : null,
      gst_rate: Number(form.gst_rate) || 0,
      opening_stock: isProduct ? (Number(form.opening_stock) || null) : null,
      reorder_level: isProduct ? (Number(form.reorder_level) || null) : null,
      reorder_quantity: isProduct ? (Number(form.reorder_quantity) || null) : null,
      duration_minutes: !isProduct ? (Number(form.duration_minutes) || null) : null,
      bookable: !isProduct ? form.bookable : false,
      city: cityValue,
      badge: null,
      sizes: null,
      colors: null,
      sort_order: 0,
    });
  };

  return (
    <div className="space-y-4">
      {/* Location / City */}
      <div>
        <Label>Location</Label>
        {isSiteAdmin && !isAdmin ? (
          <Select value={form.city} onValueChange={(v) => setForm({ ...form, city: v })}>
            <SelectTrigger><SelectValue placeholder="Select location" /></SelectTrigger>
            <SelectContent>
              {assignedCities.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Select value={form.city || "all"} onValueChange={(v) => setForm({ ...form, city: v === "all" ? "" : v })}>
            <SelectTrigger><SelectValue placeholder="All Locations" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Locations (Global)</SelectItem>
              {(cities ?? []).map((c: string) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Item Type Toggle */}
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

      {/* Common Fields */}
      <div>
        <Label>Name</Label>
        <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </div>

      <div>
        <Label>Description</Label>
        <RichTextEditor content={form.description} onChange={(html) => setForm({ ...form, description: html })} minHeight="100px" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>SKU</Label>
          <Input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} placeholder="Auto-generated" />
        </div>
        <div>
          <Label>Category</Label>
          <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {(categories ?? []).map((c) => (
                <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className={`grid gap-4 ${showCostPrice ? "grid-cols-2" : "grid-cols-1"}`}>
        <div>
          <Label>Unit of Measure</Label>
          <Select value={form.unit_of_measure} onValueChange={(v) => setForm({ ...form, unit_of_measure: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {(units ?? []).map((u) => <SelectItem key={u.id} value={u.name}>{u.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {showCostPrice && (
          <div>
            <Label>Cost Price</Label>
            <Input type="number" step="0.01" min={0} value={form.cost_price} onChange={(e) => setForm({ ...form, cost_price: e.target.value })} />
          </div>
        )}
      </div>

      {/* Selling Price with Toggle */}
      <div className="rounded-lg border border-border p-4 space-y-3 bg-muted/30">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium">Selling Price</Label>
          <div className="flex items-center gap-2 text-xs">
            <span className={!priceInclusive ? "text-foreground font-medium" : "text-muted-foreground"}>Excl. GST</span>
            <Switch checked={priceInclusive} onCheckedChange={setPriceInclusive} />
            <span className={priceInclusive ? "text-foreground font-medium" : "text-muted-foreground"}>Incl. GST</span>
          </div>
        </div>
        <Input
          type="number"
          step="0.01"
          min={0}
          value={displayPrice}
          onChange={(e) => handlePriceChange(e.target.value)}
        />
        {priceBreakdown && (
          <div className="text-xs text-muted-foreground space-y-0.5">
            <p>Base price: ₹{priceBreakdown.base.toFixed(2)}</p>
            <p>GST ({form.gst_rate}%): ₹{priceBreakdown.tax.toFixed(2)}</p>
            <p className="font-medium text-foreground">Customer pays: ₹{priceBreakdown.inclusive.toFixed(2)}</p>
          </div>
        )}
      </div>

      {/* GST Classification */}
      <div className="rounded-lg border border-border p-4 space-y-4 bg-muted/30">
        <h4 className="text-sm font-medium text-foreground">GST Classification</h4>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>{isProduct ? "HSN Code" : "SAC Code"}</Label>
            <Input
              value={isProduct ? form.hsn_code : form.sac_code}
              onChange={(e) =>
                setForm({
                  ...form,
                  ...(isProduct ? { hsn_code: e.target.value } : { sac_code: e.target.value }),
                })
              }
              placeholder={isProduct ? "e.g. 6110" : "e.g. 998311"}
            />
          </div>
          <div>
            <Label>GST Rate (%)</Label>
            <Input
              type="number"
              step="0.01"
              min={0}
              value={form.gst_rate}
              onChange={(e) => setForm({ ...form, gst_rate: e.target.value })}
              placeholder="18"
            />
            {Number(form.gst_rate) > 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                CGST: {(Number(form.gst_rate) / 2).toFixed(1)}% + SGST: {(Number(form.gst_rate) / 2).toFixed(1)}%
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Product-only fields */}
      {isProduct && (
        <div className="rounded-lg border border-border p-4 space-y-4 bg-muted/30">
          <h4 className="text-sm font-medium text-foreground">Inventory</h4>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>Opening Stock</Label>
              <Input type="number" min={0} value={form.opening_stock} onChange={(e) => setForm({ ...form, opening_stock: e.target.value })} />
            </div>
            <div>
              <Label>Reorder Level</Label>
              <Input type="number" min={0} value={form.reorder_level} onChange={(e) => setForm({ ...form, reorder_level: e.target.value })} placeholder="Alert threshold" />
            </div>
            <div>
              <Label>Reorder Qty</Label>
              <Input type="number" min={0} value={form.reorder_quantity} onChange={(e) => setForm({ ...form, reorder_quantity: e.target.value })} placeholder="Suggested qty" />
            </div>
          </div>
        </div>
      )}

      {/* Service-only fields */}
      {!isProduct && (
        <div className="rounded-lg border border-border p-4 space-y-4 bg-muted/30">
          <h4 className="text-sm font-medium text-foreground">Service Details</h4>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Duration (minutes)</Label>
              <Input type="number" min={0} value={form.duration_minutes} onChange={(e) => setForm({ ...form, duration_minutes: e.target.value })} placeholder="e.g. 60" />
            </div>
            <div className="flex items-center gap-2 pt-6">
              <Switch checked={form.bookable} onCheckedChange={(v) => setForm({ ...form, bookable: v })} />
              <Label>Bookable (appears in booking flow)</Label>
            </div>
          </div>
        </div>
      )}

      {/* In Stock */}
      <div className="flex items-center gap-2">
        <Switch checked={form.in_stock} onCheckedChange={(v) => setForm({ ...form, in_stock: v })} />
        <Label>{isProduct ? "In Stock" : "Active"}</Label>
      </div>

      <div className="flex gap-2 justify-end">
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button onClick={handleSave} disabled={!form.name}>Save</Button>
      </div>
    </div>
  );
}
