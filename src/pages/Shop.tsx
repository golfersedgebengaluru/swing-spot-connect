import { useState } from "react";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ShoppingCart, Plus, Coffee, Wine, Beer, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useProducts } from "@/hooks/useProducts";

const iconMap: Record<string, any> = { coffee: Coffee, beer: Beer, wine: Wine };

export default function Shop() {
  const { toast } = useToast();
  const { data: beverages, isLoading: loadingBev } = useProducts("beverage");
  const { data: merchandise, isLoading: loadingMerch } = useProducts("merchandise");
  const [cart, setCart] = useState<{ id: string; name: string; price: number; quantity: number }[]>([]);

  const addToCart = (item: { id: string; name: string; price: number }) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.id === item.id);
      if (existing) return prev.map((i) => (i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i));
      return [...prev, { ...item, quantity: 1 }];
    });
    toast({ title: "Added to cart", description: `${item.name} added to your order` });
  };

  const cartTotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const isLoading = loadingBev || loadingMerch;

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
                  <p className="text-sm text-muted-foreground">${cartTotal.toFixed(2)}</p>
                </div>
                <Button>Checkout</Button>
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
              </TabsList>
              <TabsContent value="beverages">
                <p className="mb-6 text-muted-foreground">Pre-order drinks and have them ready when you arrive at your bay</p>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
                                <p className="text-lg font-bold text-primary">${Number(item.price).toFixed(2)}</p>
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
                  {(merchandise ?? []).map((item) => (
                    <Card key={item.id} className="overflow-hidden shadow-elegant transition-all hover:shadow-lg">
                      <div className="relative h-48 bg-muted">
                        <div className="flex h-full items-center justify-center text-muted-foreground">Product Image</div>
                        {item.badge && <Badge className="absolute right-2 top-2 bg-accent text-accent-foreground">{item.badge}</Badge>}
                      </div>
                      <CardContent className="p-4">
                        <h3 className="font-medium text-foreground">{item.name}</h3>
                        {item.sizes && (
                          <div className="mt-2 flex gap-1">
                            {item.sizes.map((size: string) => (
                              <span key={size} className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">{size}</span>
                            ))}
                          </div>
                        )}
                        {item.colors && (
                          <div className="mt-2 flex gap-1">
                            {item.colors.map((color: string) => (
                              <span key={color} className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">{color}</span>
                            ))}
                          </div>
                        )}
                        <div className="mt-4 flex items-center justify-between">
                          <p className="font-display text-xl font-bold text-primary">${Number(item.price).toFixed(2)}</p>
                          <Button size="sm" onClick={() => addToCart({ id: item.id, name: item.name, price: Number(item.price) })}>Add to Cart</Button>
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
      <Footer />
    </div>
  );
}
