import { useState } from "react";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { User, MapPin, Clock, Gift, Trophy, Target, Pencil, Check, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useUserProfile, useUserHoursBalance } from "@/hooks/useBookings";
import { useUserPoints } from "@/hooks/usePoints";
import { EmailPreferencesCard } from "@/components/EmailPreferencesCard";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";


export default function Profile() {
  const { user } = useAuth();
  const { data: profile, isLoading: profileLoading } = useUserProfile();
  const { data: balance } = useUserHoursBalance();
  const { data: currentPoints = 0 } = useUserPoints();
  const { data: currentPoints = 0 } = useUserPoints();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [preferredCity, setPreferredCity] = useState("");

  const startEditing = () => {
    setDisplayName(profile?.display_name || "");
    setPreferredCity(profile?.preferred_city || "");
    setEditing(true);
  };

  const cancelEditing = () => setEditing(false);

  const saveProfile = async () => {
    if (!user) return;
    const { error } = await supabase
      .from("profiles")
      .update({ display_name: displayName, preferred_city: preferredCity })
      .eq("user_id", user.id);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Profile updated" });
      queryClient.invalidateQueries({ queryKey: ["user_profile"] });
      setEditing(false);
    }
  };

  const initials = (profile?.display_name || user?.email || "U")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  if (profileLoading) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <Navbar />
        <main className="flex-1 flex items-center justify-center">
          <p className="text-muted-foreground">Loading...</p>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Navbar />

      <main className="flex-1 py-8">
        <div className="container mx-auto max-w-4xl px-4">
          <h1 className="font-display text-3xl font-bold text-foreground mb-8">My Profile</h1>

          {/* Profile Info Card */}
          <Card className="shadow-elegant mb-6">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="font-display text-xl flex items-center gap-2">
                <User className="h-5 w-5 text-primary" />
                Personal Information
              </CardTitle>
              {!editing ? (
                <Button variant="ghost" size="sm" onClick={startEditing}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit
                </Button>
              ) : (
                <div className="flex gap-2">
                  <Button variant="default" size="sm" onClick={saveProfile}>
                    <Check className="mr-1 h-4 w-4" />
                    Save
                  </Button>
                  <Button variant="ghost" size="sm" onClick={cancelEditing}>
                    <X className="mr-1 h-4 w-4" />
                    Cancel
                  </Button>
                </div>
              )}
            </CardHeader>
            <CardContent>
              <div className="flex flex-col sm:flex-row gap-6 items-start">
                <Avatar className="h-20 w-20">
                  <AvatarImage src={profile?.avatar_url || undefined} />
                  <AvatarFallback className="text-xl font-display bg-primary/10 text-primary">
                    {initials}
                  </AvatarFallback>
                </Avatar>

                <div className="flex-1 space-y-4 w-full">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <Label className="text-muted-foreground text-xs uppercase tracking-wide">Display Name</Label>
                      {editing ? (
                        <Input
                          value={displayName}
                          onChange={(e) => setDisplayName(e.target.value)}
                          className="mt-1"
                        />
                      ) : (
                        <p className="font-medium text-foreground mt-1">{profile?.display_name || "Not set"}</p>
                      )}
                    </div>
                    <div>
                      <Label className="text-muted-foreground text-xs uppercase tracking-wide">Email</Label>
                      <p className="font-medium text-foreground mt-1">{profile?.email || user?.email}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground text-xs uppercase tracking-wide">Preferred City</Label>
                      {editing ? (
                        <Select value={preferredCity} onValueChange={setPreferredCity}>
                          <SelectTrigger className="mt-1">
                            <SelectValue placeholder="Select city" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Chennai">Chennai</SelectItem>
                            <SelectItem value="Bengaluru">Bengaluru</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <p className="font-medium text-foreground mt-1 flex items-center gap-1">
                          <MapPin className="h-4 w-4 text-primary" />
                          {profile?.preferred_city || "Not set"}
                        </p>
                      )}
                    </div>
                    <div>
                      <Label className="text-muted-foreground text-xs uppercase tracking-wide">Tier</Label>
                      <p className="font-medium text-foreground mt-1 capitalize">{profile?.tier || "Bronze"}</p>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Stats Cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
            <Card className="bg-gradient-card shadow-elegant">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Hours Balance</p>
                    <p className="font-display text-2xl font-bold text-foreground mt-1">{balance?.remaining ?? 0}h</p>
                    <p className="text-xs text-muted-foreground">{balance?.purchased ?? 0}h purchased · {balance?.used ?? 0}h used</p>
                  </div>
                  <div className="rounded-xl bg-primary/10 p-3">
                    <Clock className="h-5 w-5 text-primary" />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-gradient-card shadow-elegant">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Reward Points</p>
                    <p className="font-display text-2xl font-bold text-foreground mt-1">{currentPoints.toLocaleString()}</p>
                  </div>
                  <div className="rounded-xl bg-primary/10 p-3">
                    <Gift className="h-5 w-5 text-primary" />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-gradient-card shadow-elegant">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Handicap</p>
                    <p className="font-display text-2xl font-bold text-foreground mt-1">{profile?.handicap ?? "—"}</p>
                  </div>
                  <div className="rounded-xl bg-primary/10 p-3">
                    <Target className="h-5 w-5 text-primary" />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-gradient-card shadow-elegant">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Total Rounds</p>
                    <p className="font-display text-2xl font-bold text-foreground mt-1">{profile?.total_rounds ?? 0}</p>
                  </div>
                  <div className="rounded-xl bg-primary/10 p-3">
                    <Trophy className="h-5 w-5 text-primary" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Points History */}
          <Card className="shadow-elegant">
            <CardHeader>
              <CardTitle className="font-display text-xl flex items-center gap-2">
                <Gift className="h-5 w-5 text-primary" />
                Points History
              </CardTitle>
            </CardHeader>
            <CardContent>
              {pointsTx.length === 0 ? (
                <p className="text-sm text-muted-foreground">No points transactions yet.</p>
              ) : (
                <div className="space-y-3 max-h-64 overflow-y-auto">
                  {pointsTx.slice(0, 10).map((tx: any) => (
                    <div key={tx.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                      <div>
                        <p className="text-sm font-medium text-foreground">{tx.description || tx.type}</p>
                        <p className="text-xs text-muted-foreground">{format(new Date(tx.created_at), "MMM d, yyyy")}</p>
                      </div>
                      <span className={`text-sm font-semibold ${tx.type === "redemption" ? "text-destructive" : "text-primary"}`}>
                        {tx.type === "redemption" ? "-" : "+"}{tx.points}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Email Preferences */}
          <div className="mt-6">
            <EmailPreferencesCard />
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
