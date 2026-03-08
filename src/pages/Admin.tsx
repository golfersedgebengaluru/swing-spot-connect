import { useState } from "react";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Loader2, Calendar, ShoppingBag, Gift } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useEvents } from "@/hooks/useEvents";
import { useProducts } from "@/hooks/useProducts";
import { useRewards } from "@/hooks/useRewards";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";

function EventForm({ event, onSave, onCancel }: { event?: any; onSave: (data: any) => void; onCancel: () => void }) {
  const [form, setForm] = useState({
    title: event?.title ?? "",
    description: event?.description ?? "",
    date: event?.date ?? "",
    time_start: event?.time_start ?? "",
    time_end: event?.time_end ?? "",
    location: event?.location ?? "",
    spots_total: event?.spots_total ?? 0,
    spots_taken: event?.spots_taken ?? 0,
    type: event?.type ?? "social",
    prize: event?.prize ?? "",
    price: event?.price ?? "",
    is_active: event?.is_active ?? true,
  });

  return (
    <div className="space-y-4">
      <div><Label>Title</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
      <div><Label>Description</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
      <div className="grid grid-cols-2 gap-4">
        <div><Label>Date</Label><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
        <div><Label>Type</Label>
          <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="tournament">Tournament</SelectItem>
              <SelectItem value="clinic">Clinic</SelectItem>
              <SelectItem value="social">Social</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div><Label>Start Time</Label><Input value={form.time_start} onChange={(e) => setForm({ ...form, time_start: e.target.value })} placeholder="10:00 AM" /></div>
        <div><Label>End Time</Label><Input value={form.time_end} onChange={(e) => setForm({ ...form, time_end: e.target.value })} placeholder="4:00 PM" /></div>
      </div>
      <div><Label>Location</Label><Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></div>
      <div className="grid grid-cols-2 gap-4">
        <div><Label>Total Spots</Label><Input type="number" value={form.spots_total} onChange={(e) => setForm({ ...form, spots_total: Number(e.target.value) })} /></div>
        <div><Label>Spots Taken</Label><Input type="number" value={form.spots_taken} onChange={(e) => setForm({ ...form, spots_taken: Number(e.target.value) })} /></div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div><Label>Prize</Label><Input value={form.prize} onChange={(e) => setForm({ ...form, prize: e.target.value })} /></div>
        <div><Label>Price</Label><Input value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></div>
      </div>
      <div className="flex items-center gap-2"><Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} /><Label>Active</Label></div>
      <div className="flex gap-2 justify-end">
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button onClick={() => onSave(form)}>Save</Button>
      </div>
    </div>
  );
}

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
  });

  const handleSave = () => {
    onSave({
      ...form,
      price: Number(form.price),
      sizes: form.sizes ? form.sizes.split(",").map((s: string) => s.trim()).filter(Boolean) : null,
      colors: form.colors ? form.colors.split(",").map((s: string) => s.trim()).filter(Boolean) : null,
      badge: form.badge || null,
    });
  };

  return (
    <div className="space-y-4">
      <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
      <div><Label>Description</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
      <div className="grid grid-cols-2 gap-4">
        <div><Label>Price ($)</Label><Input type="number" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></div>
        <div><Label>Type</Label>
          <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="beverage">Beverage</SelectItem>
              <SelectItem value="merchandise">Merchandise</SelectItem>
            </SelectContent>
          </Select>
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

function RewardForm({ reward, onSave, onCancel }: { reward?: any; onSave: (data: any) => void; onCancel: () => void }) {
  const [form, setForm] = useState({
    name: reward?.name ?? "",
    description: reward?.description ?? "",
    points_cost: reward?.points_cost ?? 0,
    is_available: reward?.is_available ?? true,
    sort_order: reward?.sort_order ?? 0,
  });

  return (
    <div className="space-y-4">
      <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
      <div><Label>Description</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
      <div className="grid grid-cols-2 gap-4">
        <div><Label>Points Cost</Label><Input type="number" value={form.points_cost} onChange={(e) => setForm({ ...form, points_cost: Number(e.target.value) })} /></div>
        <div><Label>Sort Order</Label><Input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })} /></div>
      </div>
      <div className="flex items-center gap-2"><Switch checked={form.is_available} onCheckedChange={(v) => setForm({ ...form, is_available: v })} /><Label>Available</Label></div>
      <div className="flex gap-2 justify-end">
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button onClick={() => onSave(form)}>Save</Button>
      </div>
    </div>
  );
}

export default function Admin() {
  const { user, loading } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: events, isLoading: loadingEvents } = useEvents();
  const { data: products, isLoading: loadingProducts } = useProducts();
  const { data: rewards, isLoading: loadingRewards } = useRewards();
  const [editingEvent, setEditingEvent] = useState<any>(null);
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [editingReward, setEditingReward] = useState<any>(null);
  const [dialogOpen, setDialogOpen] = useState<string | null>(null);

  if (loading) return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  if (!user) return <Navigate to="/auth" replace />;

  const handleSaveEvent = async (data: any) => {
    const { error } = editingEvent?.id
      ? await supabase.from("events").update(data).eq("id", editingEvent.id)
      : await supabase.from("events").insert(data);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: editingEvent?.id ? "Event updated" : "Event created" });
    queryClient.invalidateQueries({ queryKey: ["events"] });
    setEditingEvent(null);
    setDialogOpen(null);
  };

  const handleSaveProduct = async (data: any) => {
    const { error } = editingProduct?.id
      ? await supabase.from("products").update(data).eq("id", editingProduct.id)
      : await supabase.from("products").insert(data);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: editingProduct?.id ? "Product updated" : "Product created" });
    queryClient.invalidateQueries({ queryKey: ["products"] });
    setEditingProduct(null);
    setDialogOpen(null);
  };

  const handleSaveReward = async (data: any) => {
    const { error } = editingReward?.id
      ? await supabase.from("rewards").update(data).eq("id", editingReward.id)
      : await supabase.from("rewards").insert(data);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: editingReward?.id ? "Reward updated" : "Reward created" });
    queryClient.invalidateQueries({ queryKey: ["rewards"] });
    setEditingReward(null);
    setDialogOpen(null);
  };

  const handleDelete = async (table: string, id: string) => {
    const { error } = await supabase.from(table).delete().eq("id", id);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Deleted successfully" });
    queryClient.invalidateQueries({ queryKey: [table] });
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Navbar isAuthenticated={true} />
      <main className="flex-1 py-8">
        <div className="container mx-auto px-4">
          <div className="mb-8">
            <h1 className="font-display text-3xl font-bold text-foreground">Admin Dashboard</h1>
            <p className="mt-1 text-muted-foreground">Manage events, products, and rewards</p>
          </div>

          <Tabs defaultValue="events" className="space-y-6">
            <TabsList>
              <TabsTrigger value="events" className="gap-2"><Calendar className="h-4 w-4" />Events</TabsTrigger>
              <TabsTrigger value="products" className="gap-2"><ShoppingBag className="h-4 w-4" />Products</TabsTrigger>
              <TabsTrigger value="rewards" className="gap-2"><Gift className="h-4 w-4" />Rewards</TabsTrigger>
            </TabsList>

            {/* Events Tab */}
            <TabsContent value="events" className="space-y-4">
              <div className="flex justify-end">
                <Dialog open={dialogOpen === "event"} onOpenChange={(open) => { setDialogOpen(open ? "event" : null); if (!open) setEditingEvent(null); }}>
                  <DialogTrigger asChild>
                    <Button onClick={() => setEditingEvent({})}><Plus className="mr-2 h-4 w-4" />Add Event</Button>
                  </DialogTrigger>
                  <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-lg">
                    <DialogHeader><DialogTitle>{editingEvent?.id ? "Edit Event" : "New Event"}</DialogTitle></DialogHeader>
                    <EventForm event={editingEvent} onSave={handleSaveEvent} onCancel={() => { setDialogOpen(null); setEditingEvent(null); }} />
                  </DialogContent>
                </Dialog>
              </div>
              {loadingEvents ? <Loader2 className="mx-auto h-8 w-8 animate-spin" /> : (
                <div className="space-y-3">
                  {(events ?? []).map((event) => (
                    <Card key={event.id} className="shadow-elegant">
                      <CardContent className="flex items-center justify-between p-4">
                        <div>
                          <h3 className="font-medium text-foreground">{event.title}</h3>
                          <p className="text-sm text-muted-foreground">{event.date} · {event.type}</p>
                        </div>
                        <div className="flex gap-2">
                          <Button variant="outline" size="icon" onClick={() => { setEditingEvent(event); setDialogOpen("event"); }}><Pencil className="h-4 w-4" /></Button>
                          <Button variant="outline" size="icon" onClick={() => handleDelete("events", event.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* Products Tab */}
            <TabsContent value="products" className="space-y-4">
              <div className="flex justify-end">
                <Dialog open={dialogOpen === "product"} onOpenChange={(open) => { setDialogOpen(open ? "product" : null); if (!open) setEditingProduct(null); }}>
                  <DialogTrigger asChild>
                    <Button onClick={() => setEditingProduct({})}><Plus className="mr-2 h-4 w-4" />Add Product</Button>
                  </DialogTrigger>
                  <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-lg">
                    <DialogHeader><DialogTitle>{editingProduct?.id ? "Edit Product" : "New Product"}</DialogTitle></DialogHeader>
                    <ProductForm product={editingProduct} onSave={handleSaveProduct} onCancel={() => { setDialogOpen(null); setEditingProduct(null); }} />
                  </DialogContent>
                </Dialog>
              </div>
              {loadingProducts ? <Loader2 className="mx-auto h-8 w-8 animate-spin" /> : (
                <div className="space-y-3">
                  {(products ?? []).map((product) => (
                    <Card key={product.id} className="shadow-elegant">
                      <CardContent className="flex items-center justify-between p-4">
                        <div>
                          <h3 className="font-medium text-foreground">{product.name}</h3>
                          <p className="text-sm text-muted-foreground">${Number(product.price).toFixed(2)} · {product.type} · {product.category}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          {!product.in_stock && <Badge variant="secondary">Out of stock</Badge>}
                          <Button variant="outline" size="icon" onClick={() => { setEditingProduct(product); setDialogOpen("product"); }}><Pencil className="h-4 w-4" /></Button>
                          <Button variant="outline" size="icon" onClick={() => handleDelete("products", product.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* Rewards Tab */}
            <TabsContent value="rewards" className="space-y-4">
              <div className="flex justify-end">
                <Dialog open={dialogOpen === "reward"} onOpenChange={(open) => { setDialogOpen(open ? "reward" : null); if (!open) setEditingReward(null); }}>
                  <DialogTrigger asChild>
                    <Button onClick={() => setEditingReward({})}><Plus className="mr-2 h-4 w-4" />Add Reward</Button>
                  </DialogTrigger>
                  <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-lg">
                    <DialogHeader><DialogTitle>{editingReward?.id ? "Edit Reward" : "New Reward"}</DialogTitle></DialogHeader>
                    <RewardForm reward={editingReward} onSave={handleSaveReward} onCancel={() => { setDialogOpen(null); setEditingReward(null); }} />
                  </DialogContent>
                </Dialog>
              </div>
              {loadingRewards ? <Loader2 className="mx-auto h-8 w-8 animate-spin" /> : (
                <div className="space-y-3">
                  {(rewards ?? []).map((reward) => (
                    <Card key={reward.id} className="shadow-elegant">
                      <CardContent className="flex items-center justify-between p-4">
                        <div>
                          <h3 className="font-medium text-foreground">{reward.name}</h3>
                          <p className="text-sm text-muted-foreground">{reward.points_cost} pts · {reward.is_available ? "Available" : "Unavailable"}</p>
                        </div>
                        <div className="flex gap-2">
                          <Button variant="outline" size="icon" onClick={() => { setEditingReward(reward); setDialogOpen("reward"); }}><Pencil className="h-4 w-4" /></Button>
                          <Button variant="outline" size="icon" onClick={() => handleDelete("rewards", reward.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </main>
      <Footer />
    </div>
  );
}
