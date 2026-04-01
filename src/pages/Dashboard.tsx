import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAdmin } from "@/hooks/useAdmin";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { TrendingUp, Trophy, Calendar, Gift, Target, Clock, ArrowRight, HelpCircle, Package, Loader2, Timer, CreditCard } from "lucide-react";
import { Link } from "react-router-dom";
import { useUserPoints } from "@/hooks/usePoints";
import { useUserHoursBalance, useUserProfile } from "@/hooks/useBookings";
import { useHourPackages } from "@/hooks/usePricing";
import { useAuth } from "@/contexts/AuthContext";
import { usePageVisibility } from "@/hooks/usePageVisibility";
import { EmailPreferencesCard } from "@/components/EmailPreferencesCard";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

const recentVisits = [
  { date: "Nov 28", bay: "Bay 3", points: 150 },
  { date: "Nov 25", bay: "Bay 1", points: 100 },
  { date: "Nov 22", bay: "Bay 5", points: 200 },
];

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { hasAdminAccess, loading: adminLoading } = useAdmin();

  useEffect(() => {
    if (!adminLoading && hasAdminAccess) {
      navigate("/admin", { replace: true });
    }
  }, [adminLoading, hasAdminAccess, navigate]);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: currentPoints = 0 } = useUserPoints();
  const { data: balance } = useUserHoursBalance();
  const { data: hourPackages, isLoading: loadingPackages } = useHourPackages();
  const { data: profile } = useUserProfile();
  const [buyingPkgId, setBuyingPkgId] = useState<string | null>(null);
  const { data: visibility } = usePageVisibility();
  const displayName = user?.user_metadata?.full_name || user?.user_metadata?.name || "Golfer";
  const activePackages = (hourPackages ?? []).filter((p: any) => p.is_active && p.price > 0);

  const loadRazorpayScript = (): Promise<boolean> => {
    return new Promise((resolve) => {
      if (document.getElementById("razorpay-script")) { resolve(true); return; }
      const script = document.createElement("script");
      script.id = "razorpay-script";
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  };

  const handleBuyHours = async (pkg: any) => {
    if (!user) return;
    const city = profile?.preferred_city;
    if (!city) {
      toast({ title: "Set your city first", description: "Please set your preferred city in your profile before purchasing.", variant: "destructive" });
      return;
    }
    setBuyingPkgId(pkg.id);
    try {
      // 1. Create Razorpay order
      const orderRes = await supabase.functions.invoke("create-razorpay-order", {
        body: {
          amount: pkg.price,
          currency: pkg.currency || "INR",
          city,
          receipt: `hours_${pkg.hours}h_${Date.now()}`,
          booking_summary: { type: "hour_package", hours: pkg.hours, label: pkg.label },
        },
      });
      if (orderRes.error || orderRes.data?.error) throw new Error(orderRes.data?.error || orderRes.error?.message || "Failed to create order");

      const { order_id, key_id, currency: rzpCurrency } = orderRes.data;

      // 2. Load Razorpay
      const loaded = await loadRazorpayScript();
      if (!loaded) throw new Error("Failed to load payment gateway");

      // 3. Open checkout
      await new Promise<void>((resolve, reject) => {
        let settled = false;
        const finish = (fn: () => void) => { if (!settled) { settled = true; fn(); } };

        const rzp = new (window as any).Razorpay({
          key: key_id,
          amount: Math.round(pkg.price * 100),
          currency: rzpCurrency || "INR",
          name: "Golfer's Edge",
          description: `${pkg.hours}h Hour Package - ${pkg.label}`,
          order_id,
          handler: async (response: any) => {
            try {
              // Atomically credit hours — no read-then-write race condition
              const { error: hoursErr } = await (supabase as any)
                .rpc("upsert_member_hours", { p_user_id: user.id, p_hours: pkg.hours });
              if (hoursErr) throw hoursErr;

              // Log the hours transaction
              const { data: htxn, error: htxnErr } = await supabase
                .from("hours_transactions")
                .insert({
                  user_id: user.id,
                  type: "purchase",
                  hours: pkg.hours,
                  note: `Purchased ${pkg.hours}h package (₹${pkg.price})`,
                })
                .select("id")
                .single();
              if (htxnErr) throw htxnErr;

              // Record the revenue transaction — must succeed or we throw
              const { error: revErr } = await supabase.from("revenue_transactions").insert({
                transaction_type: "payment" as any,
                amount: pkg.price,
                currency: pkg.currency || "INR",
                user_id: user.id,
                hours_transaction_id: htxn.id,
                gateway_name: "razorpay",
                gateway_order_ref: response.razorpay_order_id,
                gateway_payment_ref: response.razorpay_payment_id,
                description: `Hour package purchase - ${pkg.hours}h (${pkg.label})`,
                status: "confirmed",
              });
              if (revErr) throw revErr;

              queryClient.invalidateQueries({ queryKey: ["user_hours_balance"] });
              queryClient.invalidateQueries({ queryKey: ["member_hours"] });
              finish(() => resolve());
            } catch (err) {
              finish(() => reject(err instanceof Error ? err : new Error("Failed to credit hours")));
            }
          },
          theme: { color: "#16a34a" },
          modal: { ondismiss: () => finish(() => reject(new Error("Payment cancelled"))) },
        });
        rzp.on("payment.failed", (r: any) => finish(() => reject(new Error(r?.error?.description || "Payment failed"))));
        setBuyingPkgId(null);
        rzp.open();
      });

      toast({ title: "Hours Purchased!", description: `${pkg.hours} hours have been added to your balance.` });
    } catch (err: any) {
      if (err.message !== "Payment cancelled") {
        toast({ title: "Purchase Failed", description: err.message, variant: "destructive" });
      }
    } finally {
      setBuyingPkgId(null);
    }
  };

  const allStats = [
    { key: "dashboard_handicap_visible", label: "Current Handicap", value: "12.4", change: "-0.8", icon: Target, positive: true, tooltip: "" },
    { key: "dashboard_hours_balance_visible", label: "Hours Balance", value: `${balance?.remaining ?? 0}`, change: "", icon: Clock, positive: true, tooltip: "Used to book practice sessions. 1 hour = 1 booking slot." },
    { key: "dashboard_leaderboard_rank_visible", label: "Leaderboard Rank", value: "#12", change: "+3", icon: Trophy, positive: true, tooltip: "" },
    { key: "dashboard_reward_points_visible", label: "Reward Points", value: currentPoints.toLocaleString(), change: "", icon: Gift, positive: true, tooltip: "Earned through activity. Redeem for perks in the Rewards section." },
  ];
  const stats = allStats.filter((s) => visibility?.[s.key] !== false);
  const showRecentVisits = visibility?.dashboard_recent_visits_visible !== false;
  const showUpcomingEvents = visibility?.page_events_visible === true;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Navbar />
      
      <main className="flex-1 py-8">
        <div className="container mx-auto px-4">
          {/* Welcome Header */}
          <div className="mb-8">
            <h1 className="font-display text-3xl font-bold text-foreground">
              Welcome back, <span className="text-primary">{displayName}</span>
            </h1>
            <p className="mt-1 text-muted-foreground">
              Here's an overview of your golf journey
            </p>
          </div>

          {/* Quick Actions */}
          <div className="mb-8 flex flex-wrap gap-2 sm:gap-3">
            <Link to="/bookings">
              <Button variant="default">
                <Timer className="mr-2 h-4 w-4" />
                Book w/ Hours
              </Button>
            </Link>
            <Link to="/book">
              <Button variant="outline">
                <CreditCard className="mr-2 h-4 w-4" />
                Pay-Per-Use
              </Button>
            </Link>
            <Link to="/shop">
              <Button variant="outline">Order Beverages</Button>
            </Link>
            <Link to="/events">
              <Button variant="outline">View Events</Button>
            </Link>
          </div>

          {/* Stats Grid */}
          <TooltipProvider>
            <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {stats.map((stat) => (
                <Card key={stat.label} className="bg-gradient-card shadow-elegant">
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-1">
                          <p className="text-sm text-muted-foreground">{stat.label}</p>
                          {stat.tooltip && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <HelpCircle className="h-3.5 w-3.5 text-muted-foreground/60 cursor-help" />
                              </TooltipTrigger>
                              <TooltipContent side="top" className="max-w-48 text-xs">
                                {stat.tooltip}
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                        <p className="mt-1 font-display text-3xl font-bold text-foreground">
                          {stat.value}
                        </p>
                        {stat.change && (
                          <p className={`mt-1 text-sm ${stat.positive ? "text-primary" : "text-destructive"}`}>
                            {stat.change} this month
                          </p>
                        )}
                      </div>
                      <div className="rounded-xl bg-primary/10 p-3">
                        <stat.icon className="h-5 w-5 text-primary" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TooltipProvider>

          {/* Your Wallet */}
          <Card className="mb-8 shadow-elegant">
            <CardHeader>
              <CardTitle className="font-display text-xl">Your Wallet</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex items-start gap-4 rounded-lg border border-border p-4">
                  <div className="rounded-xl bg-primary/10 p-3">
                    <Clock className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium text-foreground">Bay Hours</p>
                    <p className="font-display text-3xl font-bold text-primary">{balance?.remaining ?? 0}</p>
                    <p className="mt-1 text-xs text-muted-foreground">Used to book practice sessions. 1 hour = 1 booking slot.</p>
                    <Link to="/bookings">
                      <Button variant="link" size="sm" className="mt-1 h-auto p-0 text-xs">Book a bay <ArrowRight className="ml-1 h-3 w-3" /></Button>
                    </Link>
                  </div>
                </div>
                <div className="flex items-start gap-4 rounded-lg border border-border p-4">
                  <div className="rounded-xl bg-accent/10 p-3">
                    <Gift className="h-5 w-5 text-accent" />
                  </div>
                  <div>
                    <p className="font-medium text-foreground">Reward Points</p>
                    <p className="font-display text-3xl font-bold text-accent">{currentPoints.toLocaleString()}</p>
                    <p className="mt-1 text-xs text-muted-foreground">Earned through activity. Redeem for perks in the Rewards section.</p>
                    <Link to="/rewards">
                      <Button variant="link" size="sm" className="mt-1 h-auto p-0 text-xs">View rewards <ArrowRight className="ml-1 h-3 w-3" /></Button>
                    </Link>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Content Grid */}
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Recent Visits */}
            {showRecentVisits && (
              <Card className="shadow-elegant">
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="font-display text-xl">Recent Visits</CardTitle>
                  <Link to="/my-bookings">
                    <Button variant="ghost" size="sm">View All</Button>
                  </Link>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {recentVisits.map((visit, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between rounded-lg border border-border p-4 transition-colors hover:bg-muted/50"
                      >
                        <div>
                          <p className="font-medium text-foreground">{visit.bay}</p>
                          <p className="text-sm text-muted-foreground">{visit.date}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-display text-2xl font-bold text-primary">
                            +{visit.points}
                          </p>
                          <p className="text-sm text-muted-foreground">points earned</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Upcoming Events — only shown when events page is enabled */}
            {showUpcomingEvents && (
              <Card className="shadow-elegant">
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="font-display text-xl">Upcoming Events</CardTitle>
                  <Link to="/events">
                    <Button variant="ghost" size="sm">View All</Button>
                  </Link>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground text-sm">Check the Events page for upcoming tournaments and clinics.</p>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Buy Hours */}
          {activePackages.length > 0 && (
            <Card className="mt-6 shadow-elegant">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="font-display text-xl flex items-center gap-2">
                  <Package className="h-5 w-5 text-primary" />
                  Buy Hours
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {activePackages.map((pkg: any) => (
                    <div
                      key={pkg.id}
                      className="relative rounded-lg border border-border p-5 transition-colors hover:border-primary/40 hover:bg-muted/30"
                    >
                      {pkg.hours === 25 && (
                        <Badge className="absolute -top-2.5 right-3 bg-amber-100 text-amber-800 hover:bg-amber-100 text-xs">
                          Birdie Member
                        </Badge>
                      )}
                      <p className="font-display text-3xl font-bold text-foreground">{pkg.hours}h</p>
                      <p className="text-sm text-muted-foreground mt-1">{pkg.label}</p>
                      <p className="font-display text-xl font-bold text-primary mt-3">₹{pkg.price.toLocaleString()}</p>
                      <Button
                        className="w-full mt-4"
                        variant={pkg.hours === 25 ? "default" : "outline"}
                        onClick={() => handleBuyHours(pkg)}
                        disabled={buyingPkgId === pkg.id}
                      >
                        {buyingPkgId === pkg.id ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Processing...</> : "Buy Now"}
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}


          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <Card className="shadow-elegant">
              <CardHeader>
                <CardTitle className="font-display text-xl flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-primary" />
                  Your Progress
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex h-64 items-center justify-center rounded-lg border-2 border-dashed border-border">
                  <p className="text-muted-foreground">
                    Score progression chart coming soon
                  </p>
                </div>
              </CardContent>
            </Card>

            <EmailPreferencesCard />
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
