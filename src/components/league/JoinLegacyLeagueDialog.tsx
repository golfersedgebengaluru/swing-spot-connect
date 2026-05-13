import { useEffect, useState } from "react";
import { Loader2, CheckCircle2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import {
  useLegacyLeagueCities,
  useLegacyLeagueLocations,
  useRegisterTeamIntent,
  useVerifyTeamPayment,
  validateRegistrationForm,
} from "@/hooks/useLegacyLeagueRegistration";
import type { LandingLeague } from "@/hooks/useLeagues";
import { Link } from "react-router-dom";

function loadRazorpay(): Promise<boolean> {
  return new Promise((resolve) => {
    if (document.getElementById("razorpay-script")) return resolve(true);
    const s = document.createElement("script");
    s.id = "razorpay-script";
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

interface Props {
  league: LandingLeague;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function JoinLegacyLeagueDialog({ league, open, onOpenChange }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [cityId, setCityId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [teamSize, setTeamSize] = useState<number | "">("");
  const [teamName, setTeamName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const { data: cities = [] } = useLegacyLeagueCities(open ? league.id : null);
  const { data: locations = [] } = useLegacyLeagueLocations(open ? league.id : null, cityId || null);
  const intentMut = useRegisterTeamIntent(league.id);
  const verifyMut = useVerifyTeamPayment(league.id);

  useEffect(() => {
    if (open) loadRazorpay();
    if (!open) {
      setStep(1); setCityId(""); setLocationId(""); setTeamSize(""); setTeamName(""); setDone(false);
    }
  }, [open]);

  const totalAmount = teamSize ? Number(teamSize) * Number(league.price_per_person) : 0;

  if (!user) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Sign in to register</DialogTitle>
            <DialogDescription>You need an account to register your team.</DialogDescription>
          </DialogHeader>
          <Button asChild className="w-full"><Link to="/auth">Sign in / Sign up</Link></Button>
        </DialogContent>
      </Dialog>
    );
  }

  async function handleConfirmAndPay() {
    const v = validateRegistrationForm({
      league_city_id: cityId,
      league_location_id: locationId,
      team_name: teamName,
      team_size: typeof teamSize === "number" ? teamSize : null,
      allowed_team_sizes: league.allowed_team_sizes ?? null,
    });
    if (!v.ok) {
      toast({ title: "Check your details", description: v.error, variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const intent = await intentMut.mutateAsync({
        league_city_id: cityId,
        league_location_id: locationId,
        team_name: teamName.trim(),
        team_size: Number(teamSize),
      });

      if (intent.free) {
        setDone(true); setSubmitting(false); return;
      }

      const ok = await loadRazorpay();
      if (!ok) throw new Error("Payment script failed to load");

      const rzp = new (window as unknown as { Razorpay: new (o: unknown) => { open: () => void } }).Razorpay({
        key: intent.key_id,
        amount: intent.amount,
        currency: intent.currency,
        order_id: intent.order_id,
        name: intent.league_name || league.name,
        description: `Team registration · ${teamName.trim()}`,
        prefill: { email: user?.email ?? "" },
        theme: { color: "#0f172a" },
        handler: async (resp: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
          try {
            await verifyMut.mutateAsync({
              razorpay_order_id: resp.razorpay_order_id,
              razorpay_payment_id: resp.razorpay_payment_id,
              razorpay_signature: resp.razorpay_signature,
            });
            setDone(true);
          } catch (e) {
            toast({ title: "Verification failed", description: (e as Error).message, variant: "destructive" });
          } finally { setSubmitting(false); }
        },
        modal: { ondismiss: () => setSubmitting(false) },
      });
      rzp.open();
    } catch (e) {
      toast({ title: "Could not register", description: (e as Error).message, variant: "destructive" });
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{league.name}</DialogTitle>
          <DialogDescription>Register your team — Step {done ? "✓" : step} of 3</DialogDescription>
        </DialogHeader>

        {done ? (
          <div className="text-center py-8 space-y-3">
            <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto" />
            <h3 className="text-xl font-semibold">You're in!</h3>
            <p className="text-sm text-muted-foreground">"{teamName}" is registered. Watch your inbox for next steps.</p>
            <Button onClick={() => onOpenChange(false)}>Close</Button>
          </div>
        ) : (
          <div className="space-y-4">
            {step === 1 && (
              <>
                <div className="space-y-2">
                  <Label>City</Label>
                  <Select value={cityId} onValueChange={(v) => { setCityId(v); setLocationId(""); }}>
                    <SelectTrigger><SelectValue placeholder="Select a city" /></SelectTrigger>
                    <SelectContent>
                      {cities.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Location</Label>
                  <Select value={locationId} onValueChange={setLocationId} disabled={!cityId}>
                    <SelectTrigger><SelectValue placeholder={cityId ? "Select a location" : "Pick city first"} /></SelectTrigger>
                    <SelectContent>
                      {locations.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <Button className="w-full" disabled={!cityId || !locationId} onClick={() => setStep(2)}>Next</Button>
              </>
            )}

            {step === 2 && (
              <>
                <div className="space-y-2">
                  <Label>Team Name</Label>
                  <Input value={teamName} onChange={(e) => setTeamName(e.target.value)} maxLength={80} placeholder="Your team name" />
                </div>
                <div className="space-y-2">
                  <Label>Team Size</Label>
                  <Select value={teamSize ? String(teamSize) : ""} onValueChange={(v) => setTeamSize(Number(v))}>
                    <SelectTrigger><SelectValue placeholder="Select team size" /></SelectTrigger>
                    <SelectContent>
                      {(league.allowed_team_sizes || []).map((s) => (
                        <SelectItem key={s} value={String(s)}>{s} player{s > 1 ? "s" : ""}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setStep(1)} className="flex-1">Back</Button>
                  <Button className="flex-1" disabled={!teamName.trim() || !teamSize} onClick={() => setStep(3)}>Next</Button>
                </div>
              </>
            )}

            {step === 3 && (
              <>
                <div className="rounded-lg border p-4 space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Team</span><span className="font-medium">{teamName}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Size</span><span>{teamSize} players</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Price/person</span><span>{league.currency} {league.price_per_person}</span></div>
                  <div className="flex justify-between text-base font-semibold pt-2 border-t"><span>Total</span><span>{league.currency} {totalAmount.toFixed(2)}</span></div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setStep(2)} className="flex-1" disabled={submitting}>Back</Button>
                  <Button className="flex-1" onClick={handleConfirmAndPay} disabled={submitting}>
                    {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : (totalAmount > 0 ? `Pay ${league.currency} ${totalAmount.toFixed(2)}` : "Register")}
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
