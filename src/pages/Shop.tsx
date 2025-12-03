import { useState } from "react";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ShoppingCart, Plus, Minus, Coffee, Wine, Beer } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const beverages = [
  { id: 1, name: "Cold Brew Coffee", price: 5.50, category: "coffee", icon: Coffee },
  { id: 2, name: "Espresso", price: 4.00, category: "coffee", icon: Coffee },
  { id: 3, name: "Latte", price: 6.00, category: "coffee", icon: Coffee },
  { id: 4, name: "Craft IPA", price: 8.00, category: "beer", icon: Beer },
  { id: 5, name: "Pale Ale", price: 7.00, category: "beer", icon: Beer },
  { id: 6, name: "Pilsner", price: 6.50, category: "beer", icon: Beer },
  { id: 7, name: "House Red", price: 9.00, category: "wine", icon: Wine },
  { id: 8, name: "House White", price: 9.00, category: "wine", icon: Wine },
  { id: 9, name: "Sparkling Water", price: 3.00, category: "other", icon: Coffee },
  { id: 10, name: "Sports Drink", price: 4.00, category: "other", icon: Coffee },
];

const merchandise = [
  { id: 101, name: "GolfHub Polo", price: 65.00, image: "polo", sizes: ["S", "M", "L", "XL"] },
  { id: 102, name: "Performance Cap", price: 35.00, image: "cap", colors: ["Black", "White", "Navy"] },
  { id: 103, name: "Golf Glove", price: 28.00, image: "glove", sizes: ["S", "M", "L"] },
  { id: 104, name: "Logo Golf Balls (12pk)", price: 42.00, image: "balls" },
  { id: 105, name: "Rangefinder", price: 249.00, image: "rangefinder", badge: "Premium" },
  { id: 106, name: "Towel Set", price: 24.00, image: "towel" },
];

export default function Shop() {
  const { toast } = useToast();
  const [cart, setCart] = useState<{ id: number; name: string; price: number; quantity: number }[]>([]);

  const addToCart = (item: { id: number; name: string; price: number }) => {
    setCart(prev => {
      const existing = prev.find(i => i.id === item.id);
      if (existing) {
        return prev.map(i => i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...prev, { ...item, quantity: 1 }];
    });
    toast({
      title: "Added to cart",
      description: `${item.name} added to your order`,
    });
  };

  const cartTotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Navbar isAuthenticated={true} />
      
      <main className="flex-1 py-8">
        <div className="container mx-auto px-4">
          {/* Header */}
          <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="font-display text-3xl font-bold text-foreground">
                Shop
              </h1>
              <p className="mt-1 text-muted-foreground">
                Order beverages & merchandise
              </p>
            </div>

            {/* Cart Summary */}
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

          <Tabs defaultValue="beverages" className="space-y-6">
            <TabsList>
              <TabsTrigger value="beverages">Beverages</TabsTrigger>
              <TabsTrigger value="merchandise">Merchandise</TabsTrigger>
            </TabsList>

            {/* Beverages */}
            <TabsContent value="beverages">
              <div className="mb-6">
                <p className="text-muted-foreground">
                  Pre-order drinks and have them ready when you arrive at your bay
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {beverages.map((item) => (
                  <Card key={item.id} className="shadow-elegant transition-all hover:shadow-lg">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                            <item.icon className="h-6 w-6 text-primary" />
                          </div>
                          <div>
                            <p className="font-medium text-foreground">{item.name}</p>
                            <p className="text-lg font-bold text-primary">
                              ${item.price.toFixed(2)}
                            </p>
                          </div>
                        </div>
                        <Button
                          size="icon"
                          variant="outline"
                          onClick={() => addToCart({ id: item.id, name: item.name, price: item.price })}
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>

            {/* Merchandise */}
            <TabsContent value="merchandise">
              <div className="mb-6">
                <p className="text-muted-foreground">
                  Shop our collection of golf apparel and accessories
                </p>
              </div>

              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {merchandise.map((item) => (
                  <Card key={item.id} className="overflow-hidden shadow-elegant transition-all hover:shadow-lg">
                    <div className="relative h-48 bg-muted">
                      <div className="flex h-full items-center justify-center text-muted-foreground">
                        Product Image
                      </div>
                      {item.badge && (
                        <Badge className="absolute right-2 top-2 bg-accent text-accent-foreground">
                          {item.badge}
                        </Badge>
                      )}
                    </div>
                    <CardContent className="p-4">
                      <h3 className="font-medium text-foreground">{item.name}</h3>
                      
                      {item.sizes && (
                        <div className="mt-2 flex gap-1">
                          {item.sizes.map(size => (
                            <span key={size} className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                              {size}
                            </span>
                          ))}
                        </div>
                      )}
                      
                      {item.colors && (
                        <div className="mt-2 flex gap-1">
                          {item.colors.map(color => (
                            <span key={color} className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                              {color}
                            </span>
                          ))}
                        </div>
                      )}

                      <div className="mt-4 flex items-center justify-between">
                        <p className="font-display text-xl font-bold text-primary">
                          ${item.price.toFixed(2)}
                        </p>
                        <Button
                          size="sm"
                          onClick={() => addToCart({ id: item.id, name: item.name, price: item.price })}
                        >
                          Add to Cart
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </main>

      <Footer />
    </div>
  );
}
