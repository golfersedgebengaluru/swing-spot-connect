import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { Loader2, Trophy, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQuickCompetition } from "@/hooks/useQuickCompetitions";

function loadRazorpayScript(): Promise<boolean> {
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

export default function QuickCompetitionJoin() {
  const { id } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  const { toast } = useToast();
  const competitionId = id ?? null;
  const { data: comp, isLoading } = useQuickCompetition(competitionId);

  const [name, setName] = useState(params.get("name") ?? "");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => { loadRazorpayScript(); }, []);

  const isPaid = comp?.entry_type === "paid";
  const fee = useMemo(() => Number(comp?.entry_fee ?? 0), [comp]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }
  if (!comp) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white">
        <p>Competition not found.</p>
      </div>
    );
  }
  if (comp.status !== "active") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white px-6 text-center">
        <div>
          <h1 className="text-2xl font-serif italic mb-2">{comp.name}</h1>
          <p className="text-slate-400">This competition has ended.</p>
        </div>
      </div>
    );
  }
  if (!isPaid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white px-6 text-center">
        <div>
          <h1 className="text-2xl font-serif italic mb-2">{comp.name}</h1>
          <p className="text-slate-400">This is a free competition. Ask the host to add you.</p>
        </div>
      </div>
    );
  }

  async function handlePay() {
    if (!name.trim() || !phone.trim() || !competitionId) return;
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("qc-create-entry-order", {
        body: { competition_id: competitionId, player_name: name.trim(), phone: phone.trim() },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Could not start payment");

      const ok = await loadRazorpayScript();
      if (!ok) throw new Error("Payment script failed to load");

      const rzp = new (window as unknown as { Razorpay: new (o: unknown) => { open: () => void } }).Razorpay({
        key: data.key_id,
        amount: data.amount,
        currency: data.currency,
        order_id: data.order_id,
        name: comp!.name,
        description: "Quick Competition entry",
        prefill: { name: name.trim(), contact: phone.trim() },
        theme: { color: "#0f172a" },
        handler: async (resp: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
          const { data: vData, error: vErr } = await supabase.functions.invoke("qc-verify-entry-payment", {
            body: {
              competition_id: competitionId,
              razorpay_order_id: resp.razorpay_order_id,
              razorpay_payment_id: resp.razorpay_payment_id,
              razorpay_signature: resp.razorpay_signature,
            },
          });
          if (vErr || !vData?.success) {
            toast({ title: "Verification failed", description: vData?.error || vErr?.message, variant: "destructive" });
            return;
          }
          setConfirmed(true);
        },
        modal: { ondismiss: () => setSubmitting(false) },
      });
      rzp.open();
    } catch (e) {
      toast({ title: "Could not start payment", description: (e as Error).message, variant: "destructive" });
      setSubmitting(false);
    }
  }

  if (confirmed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white px-6 text-center">
        <div className="max-w-md">
          <CheckCircle2 className="h-16 w-16 text-emerald-400 mx-auto mb-4" />
          <h1 className="text-3xl font-serif italic mb-2">You're in, {name}!</h1>
          <p className="text-slate-400 mb-6">The host will record your shots from the bay. Good luck.</p>
          <Button variant="outline" asChild className="bg-transparent">
            <a href={`/qc/${competitionId}`}>View live leaderboard</a>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <Trophy className="h-12 w-12 text-amber-400 mx-auto mb-2" />
          <h1 className="text-2xl font-serif italic">{comp.name}</h1>
          <p className="mt-1 text-sm text-slate-400 uppercase tracking-[0.25em]">Entry · ₹{fee.toFixed(0)}</p>
        </div>

        {comp.sponsor_enabled && comp.sponsor_logo_url && (
          <div className="flex justify-center">
            <img src={comp.sponsor_logo_url} alt="Sponsor" className="h-12 object-contain" />
          </div>
        )}

        <div className="space-y-3 bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
          <div className="space-y-1.5">
            <Label htmlFor="j-name" className="text-slate-300">Your name</Label>
            <Input id="j-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="As you'd like it on the leaderboard" className="bg-slate-950 border-slate-700" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="j-phone" className="text-slate-300">Phone</Label>
            <Input id="j-phone" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="10-digit mobile" className="bg-slate-950 border-slate-700" />
            <p className="text-[11px] text-slate-500">For your receipt and to prevent duplicate entries.</p>
          </div>
          <Button
            className="w-full"
            size="lg"
            disabled={submitting || !name.trim() || !phone.trim()}
            onClick={handlePay}
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : `Pay ₹${fee.toFixed(0)} & Join`}
          </Button>
        </div>
      </div>
    </div>
  );
}
