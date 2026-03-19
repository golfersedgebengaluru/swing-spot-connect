import { useState } from "react";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { ShoppingCart, Plus, Coffee, Wine, Beer, Loader2, Minus, Trash2, ClipboardList } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useProducts } from "@/hooks/useProducts";
import { useDefaultCurrency } from "@/hooks/useCurrency";
import { useCreateOrder, useMyOrders, OrderItem } from "@/hooks/useOrders";
import { useUserProfile } from "@/hooks/useBookings";
import { format } from "date-fns";

const iconMap: Record<string, any> = { coffee: Coffee, beer: Beer, wine: Wine };

const ORDER_STATUS_LABEL: Record<string, string> = {
  pending: "🟡 Pending",
  preparing: "🔵 Preparing",
  ready: "🟢 Ready — Pick up at counter",
  delivered: "✅ Delivered",
};

export default function Shop() {
  const { toast } = useToast();
  const { data: beverages, isLoading: loadingBev } = useProducts("beverage");
  const { data: merchandise, isLoading: loadingMerch } = useProducts("merchandise");
  const { symbol, format: formatCurrency } = useDefaultCurrency();
  const { data: profile } = useUserProfile();
  const createOrder = useCreateOrder();
  const { data: myOrders } = useMyOrders();
  const [cart, setCart] = useState<OrderItem[]>([]);
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  const addToCart = (item: { id: string; name: string; price: number }) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.id === item.id);
      if (existing) return prev.map((i) => (i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i));
      return [...prev, { ...item, quantity: 1 }];
    });
    toast({ title: "Added to cart", description: `${item.name} added to your order` });
  };

  const removeFromCart = (id: string) => {
    setCart((prev) => prev.filter((i) => i.id !== id));
  };

  const updateQty = (id: string, delta: number) => {
    setCart((prev) =>
      prev.map((i) => (i.id === id ? { ...i, quantity: Math.max(1, i.quantity + delta) } : i))
    );
  };

  const cartTotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const isLoading = loadingBev || loadingMerch;

  const handlePlaceOrder = async () => {
    try {
      await createOrder.mutateAsync({
        items: cart,
        total_price: cartTotal,
        city: profile?.preferred_city ?? undefined,
      });
      setCart([]);
      setCheckoutOpen(false);
      toast({ title: "Order placed!", description: "Staff will bring your order to your bay." });
    } catch (err: any) {
      toast({ title: "Error placing order", description: err.message, variant: "destructive" });
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Navbar />
      <main className="flex-1 py-8">
        <div className="container mx-auto px-4">
          <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="font-display text-3xl font-bold text-foreground">Shop</h1>
              <p className="mt-1 text-muted-foreground">Order beverages & merchandise</p>
            </div>
            {cartCount > 0 && (
              <div className="flex items-center gap-4 rounded-xl bg-primary/5 p-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <ShoppingCart className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-medium text-foreground">{cartCount} items</p>
                  <p className="text-sm text-muted-foreground">{formatCurrency(cartTotal)}</p>
                </div>
                <Button onClick={() => setCheckoutOpen(true)}>Checkout</Button>
              </div>
            )}
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Tabs defaultValue="beverages" className="space-y-6">
              <TabsList>
                <TabsTrigger value="beverages">Beverages</TabsTrigger>
                <TabsTrigger value="merchandise">Merchandise</TabsTrigger>
                <TabsTrigger value="my-orders" className="gap-2">
                  <ClipboardList className="h-4 w-4" />
                  My Orders
                  {(myOrders ?? []).filter((o: any) => o.status !== "delivered").length > 0 && (
                    <Badge className="ml-1 bg-primary text-primary-foreground text-xs px-1.5 py-0">
                      {(myOrders ?? []).filter((o: any) => o.status !== "delivered").length}
                    </Badge>
                  )}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="beverages">
                <p className="mb-6 text-muted-foreground">Pre-order drinks and have them ready when you arrive at your bay</p>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {(beverages ?? []).length === 0 && <p className="text-muted-foreground col-span-3">No beverages available.</p>}
                  {(beverages ?? []).map((item) => {
                    const IconComp = iconMap[item.category] || Coffee;
                    return (
                      <Card key={item.id} className="shadow-elegant transition-all hover:shadow-lg">
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                                <IconComp className="h-6 w-6 text-primary" />
                              </div>
                              <div>
                                <p className="font-medium text-foreground">{item.name}</p>
                                <p className="text-lg font-bold text-primary">{formatCurrency(Number(item.price))}</p>
                              </div>
                            </div>
                            <Button size="icon" variant="outline" onClick={() => addToCart({ id: item.id, name: item.name, price: Number(item.price) })}>
                              <Plus className="h-4 w-4" />
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </TabsContent>

              <TabsContent value="merchandise">
                <p className="mb-6 text-muted-foreground">Shop our collection of golf apparel and accessories</p>
                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                  {(merchandise ?? []).length === 0 && <p className="text-muted-foreground col-span-3">No merchandise available.</p>}
                  {(merchandise ?? []).map((item) => (
                    <Card key={item.id} className="overflow-hidden shadow-elegant transition-all hover:shadow-lg">
                      <div className="relative h-48 bg-muted">
                        <div className="flex h-full items-center justify-center text-muted-foreground">Product Image</div>
                        {item.badge && <Badge className="absolute right-2 top-2 bg-accent text-accent-foreground">{item.badge}</Badge>}
                      </div>
                      <CardContent className="p-4">
                        <h3 className="font-medium text-foreground">{item.name}</h3>
                        {item.sizes && (
                          <div className="mt-2 flex gap-1 flex-wrap">
                            {item.sizes.map((size: string) => (
                              <span key={size} className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">{size}</span>
                            ))}
                          </div>
                        )}
                        {item.colors && (
                          <div className="mt-2 flex gap-1 flex-wrap">
                            {item.colors.map((color: string) => (
                              <span key={color} className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">{color}</span>
                            ))}
                          </div>
                        )}
                        <div className="mt-4 flex items-center justify-between">
                          <p className="font-display text-xl font-bold text-primary">{formatCurrency(Number(item.price))}</p>
                          <Button size="sm" onClick={() => addToCart({ id: item.id, name: item.name, price: Number(item.price) })}>Add to Cart</Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="my-orders">
                <div className="space-y-4">
                  {(myOrders ?? []).length === 0 && (
                    <div className="py-16 text-center">
                      <ClipboardList className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
                      <p className="font-medium text-foreground">No orders yet</p>
                      <p className="text-sm text-muted-foreground">Your order history will appear here.</p>
                    </div>
                  )}
                  {(myOrders ?? []).map((order: any) => (
                    <Card key={order.id} className="shadow-elegant">
                      <CardHeader className="pb-2 flex flex-row items-center justify-between">
                        <div>
                          <p className="text-sm text-muted-foreground">{format(new Date(order.created_at), "PPp")}</p>
                        </div>
                        <Badge variant="outline">{ORDER_STATUS_LABEL[order.status] ?? order.status}</Badge>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-1">
                          {(order.items as OrderItem[]).map((item, i) => (
                            <div key={i} className="flex justify-between text-sm">
                              <span>{item.quantity}× {item.name}</span>
                              <span className="text-muted-foreground">{formatCurrency(item.price * item.quantity)}</span>
                            </div>
                          ))}
                        </div>
                        <Separator className="my-2" />
                        <div className="flex justify-between font-medium text-sm">
                          <span>Total</span>
                          <span>{formatCurrency(Number(order.total_price))}</span>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </TabsContent>
            </Tabs>
          )}
        </div>
      </main>

      {/* Checkout Dialog */}
      <Dialog open={checkoutOpen} onOpenChange={setCheckoutOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm Your Order</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {cart.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-1">
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => updateQty(item.id, -1)}>
                    <Minus className="h-3 w-3" />
                  </Button>
                  <span className="w-5 text-center text-sm font-medium">{item.quantity}</span>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => updateQty(item.id, 1)}>
                    <Plus className="h-3 w-3" />
                  </Button>
                  <span className="text-sm">{item.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{formatCurrency(item.price * item.quantity)}</span>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeFromCart(item.id)}>
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
            <Separator />
            <div className="flex justify-between font-semibold">
              <span>Total</span>
              <span>{formatCurrency(cartTotal)}</span>
            </div>
            <p className="text-xs text-muted-foreground">Staff will bring your order to your bay.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCheckoutOpen(false)}>Cancel</Button>
            <Button onClick={handlePlaceOrder} disabled={createOrder.isPending || cart.length === 0}>
              {createOrder.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Placing...</> : "Place Order"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Footer />
    </div>
  );
}
