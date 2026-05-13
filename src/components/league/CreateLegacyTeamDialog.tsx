import { useEffect, useState } from "react";
import { Loader2, CheckCircle2, Plus, X, Copy } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useQueryClient } from "@tanstack/react-query";
import {
  useLegacyLeagueCities,
  useLegacyLeagueLocations,
  useRegisterTeamIntent,
  useVerifyTeamPayment,
  validateRegistrationForm,
} from "@/hooks/useLegacyLeagueRegistration";
import type { LandingLeague } from "@/hooks/useLeagues";
import { Link } from "react-router-dom";
import { useValidateCoupon, calculateDiscount, type ValidateCouponResult } from "@/hooks/useCoupons";

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

const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function CreateLegacyTeamDialog({ league, open, onOpenChange }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [cityId, setCityId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [teamSize, setTeamSize] = useState<number | "">("");
  const [teamName, setTeamName] = useState("");
  const [emails, setEmails] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [shareLink, setShareLink] = useState<string>("");
  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<ValidateCouponResult | null>(null);
  const [couponError, setCouponError] = useState("");
  const validateCoupon = useValidateCoupon();

  const { data: cities = [] } = useLegacyLeagueCities(open ? league.id : null);
  const { data: locations = [] } = useLegacyLeagueLocations(open ? league.id : null, cityId || null);
  const intentMut = useRegisterTeamIntent(league.id);
  const verifyMut = useVerifyTeamPayment(league.id);

  useEffect(() => {
    if (open) loadRazorpay();
    if (!open) {
      setStep(1); setCityId(""); setLocationId(""); setTeamSize(""); setTeamName("");
      setEmails([]); setShareLink("");
      setCouponCode(""); setAppliedCoupon(null); setCouponError("");
    }
  }, [open]);

  // When team size changes, resize the email rows (size - 1 captains-aside members)
  useEffect(() => {
    if (typeof teamSize !== "number") return;
    const want = Math.max(0, teamSize - 1);
    setEmails((prev) => {
      const next = prev.slice(0, want);
      while (next.length < want) next.push("");
      return next;
    });
  }, [teamSize]);

  const subtotal = teamSize ? Number(teamSize) * Number(league.price_per_person) : 0;
  const discount = appliedCoupon ? calculateDiscount(appliedCoupon, subtotal) : 0;
  const totalAmount = Math.max(0, subtotal - discount);

  const handleApplyCoupon = async () => {
    const code = couponCode.trim();
    if (!code) return;
    setCouponError("");
    try {
      const result = await validateCoupon.mutateAsync(code);
      if (result.valid) {
        setAppliedCoupon(result);
        setCouponCode("");
      } else {
        setCouponError(result.error || "Invalid coupon code");
      }
    } catch (e) {
      setCouponError((e as Error).message || "Failed to validate coupon");
    }
  };
  const handleRemoveCoupon = () => { setAppliedCoupon(null); setCouponError(""); };

  if (!user) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Sign in to create your team</DialogTitle>
            <DialogDescription>You need an account to register a team.</DialogDescription>
          </DialogHeader>
          <Button asChild className="w-full"><Link to="/auth">Sign in / Sign up</Link></Button>
        </DialogContent>
      </Dialog>
    );
  }

  const onSizeChange = (v: string) => setTeamSize(Number(v));
  const updateEmail = (i: number, v: string) => setEmails((e) => e.map((x, idx) => idx === i ? v : x));
  const removeEmail = (i: number) => setEmails((e) => e.filter((_, idx) => idx !== i));
  const addEmail = () => {
    if (typeof teamSize !== "number") return;
    if (emails.length >= teamSize - 1) return;
    setEmails((e) => [...e, ""]);
  };

  const buildShareLink = (token: string) => `${window.location.origin}/league-team-join/${token}`;

  async function handleConfirmAndPay() {
    const v = validateRegistrationForm({
      league_city_id: cityId,
      league_location_id: locationId,
      team_name: teamName,
      team_size: typeof teamSize === "number" ? teamSize : null,
      allowed_team_sizes: league.allowed_team_sizes ?? null,
    });
    if (!v.ok) {
      toast({ title: "Check your details", description: (v as { error: string }).error, variant: "destructive" });
      return;
    }
    // Validate emails
    const cleanedEmails = emails.map((e) => e.trim().toLowerCase()).filter(Boolean);
    const bad = cleanedEmails.find((e) => !EMAIL_RX.test(e));
    if (bad) {
      toast({ title: "Invalid email", description: bad, variant: "destructive" });
      return;
    }
    if (new Set(cleanedEmails).size !== cleanedEmails.length) {
      toast({ title: "Duplicate emails", description: "Each invite must be unique", variant: "destructive" });
      return;
    }
    if (cleanedEmails.includes((user.email || "").toLowerCase())) {
      toast({ title: "Don't invite yourself", description: "You're the captain.", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    try {
      const intent = await intentMut.mutateAsync({
        league_city_id: cityId,
        league_location_id: locationId,
        team_name: teamName.trim(),
        team_size: Number(teamSize),
        invite_emails: cleanedEmails,
      });

      if (intent.free) {
        if (intent.join_token) setShareLink(buildShareLink(intent.join_token as string));
        qc.invalidateQueries({ queryKey: ["legacy-my-team", league.id] });
        setStep(4); setSubmitting(false); return;
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
            const verify = await verifyMut.mutateAsync({
              razorpay_order_id: resp.razorpay_order_id,
              razorpay_payment_id: resp.razorpay_payment_id,
              razorpay_signature: resp.razorpay_signature,
            });
            const tok = (verify as { join_token?: string }).join_token;
            if (tok) setShareLink(buildShareLink(tok));
            qc.invalidateQueries({ queryKey: ["legacy-my-team", league.id] });
            setStep(4);
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

  const copyShare = async () => {
    try { await navigator.clipboard.writeText(shareLink); toast({ title: "Link copied" }); }
    catch { /* ignore */ }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{league.name}</DialogTitle>
          <DialogDescription>
            {step === 4 ? "Team created!" : `Create your team — Step ${step} of 3`}
          </DialogDescription>
        </DialogHeader>

        {step === 4 ? (
          <div className="text-center py-6 space-y-4">
            <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto" />
            <h3 className="text-xl font-semibold">"{teamName}" is registered</h3>
            <p className="text-sm text-muted-foreground">
              Invitees with the emails you entered will be added automatically the next time they sign in.
            </p>
            {shareLink && (
              <div className="space-y-2 text-left">
                <Label>Shareable join link</Label>
                <div className="flex gap-2">
                  <Input readOnly value={shareLink} onClick={(e) => (e.currentTarget as HTMLInputElement).select()} />
                  <Button type="button" variant="outline" onClick={copyShare}><Copy className="h-4 w-4" /></Button>
                </div>
                <p className="text-xs text-muted-foreground">Anyone with this link can join your team after signing in (until the team is full).</p>
              </div>
            )}
            <Button onClick={() => onOpenChange(false)} className="w-full">Done</Button>
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
                <div className="space-y-2">
                  <Label>Team Name</Label>
                  <Input value={teamName} onChange={(e) => setTeamName(e.target.value)} maxLength={80} placeholder="Your team name" />
                </div>
                <div className="space-y-2">
                  <Label>Team Size</Label>
                  <Select value={teamSize ? String(teamSize) : ""} onValueChange={onSizeChange}>
                    <SelectTrigger><SelectValue placeholder="Select team size" /></SelectTrigger>
                    <SelectContent>
                      {(league.allowed_team_sizes || []).map((s) => (
                        <SelectItem key={s} value={String(s)}>{s} player{s > 1 ? "s" : ""}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button className="w-full" disabled={!cityId || !locationId || !teamName.trim() || !teamSize} onClick={() => setStep(2)}>Next</Button>
              </>
            )}

            {step === 2 && (
              <>
                <div className="space-y-2">
                  <Label>Invite members ({emails.length}/{Math.max(0, Number(teamSize) - 1)})</Label>
                  <p className="text-xs text-muted-foreground">You're the captain. Add the emails of your {Number(teamSize) - 1} teammate{Number(teamSize) - 1 === 1 ? "" : "s"}. They'll auto-join the next time they sign in.</p>
                  <div className="space-y-2">
                    {emails.map((email, i) => (
                      <div key={i} className="flex gap-2">
                        <Input type="email" placeholder="teammate@example.com" value={email} onChange={(e) => updateEmail(i, e.target.value)} />
                        <Button type="button" variant="ghost" size="icon" onClick={() => removeEmail(i)}><X className="h-4 w-4" /></Button>
                      </div>
                    ))}
                  </div>
                  {typeof teamSize === "number" && emails.length < teamSize - 1 && (
                    <Button type="button" variant="outline" size="sm" onClick={addEmail}>
                      <Plus className="h-4 w-4 mr-1" /> Add email
                    </Button>
                  )}
                  <p className="text-xs text-muted-foreground pt-2">Optional — you can also share a join link after payment.</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setStep(1)} className="flex-1">Back</Button>
                  <Button className="flex-1" onClick={() => setStep(3)}>Next</Button>
                </div>
              </>
            )}

            {step === 3 && (
              <>
                <div className="rounded-lg border p-4 space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Team</span><span className="font-medium">{teamName}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Size</span><span>{teamSize} players</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Invites</span><span>{emails.filter(Boolean).length}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Price/person</span><span>{league.currency} {league.price_per_person}</span></div>
                  <div className="flex justify-between text-base font-semibold pt-2 border-t"><span>Total</span><span>{league.currency} {totalAmount.toFixed(2)}</span></div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setStep(2)} className="flex-1" disabled={submitting}>Back</Button>
                  <Button className="flex-1" onClick={handleConfirmAndPay} disabled={submitting}>
                    {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : (totalAmount > 0 ? `Pay ${league.currency} ${totalAmount.toFixed(2)}` : "Create Team")}
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
