import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { ShieldAlert } from "lucide-react";

export function ReconsentBanner() {
  const { user } = useAuth();
  const [needed, setNeeded] = useState<{ tos: boolean; privacy: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) { setNeeded(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const [tos, privacy] = await Promise.all([
          supabase.rpc("needs_reconsent" as any, { _user_id: user.id, _slug: "terms" } as any),
          supabase.rpc("needs_reconsent" as any, { _user_id: user.id, _slug: "privacy" } as any),
        ]);
        if (cancelled) return;
        const t = !!(tos.data ?? false);
        const p = !!(privacy.data ?? false);
        if (t || p) setNeeded({ tos: t, privacy: p });
      } catch (_) {}
    })();
    return () => { cancelled = true; };
  }, [user]);

  if (!user || !needed) return null;

  const accept = async () => {
    setBusy(true);
    try {
      if (needed.tos) await supabase.rpc("record_consent" as any, { _user_id: user.id, _email: user.email, _consent_type: "tos", _granted: true, _slug: "terms" } as any);
      if (needed.privacy) await supabase.rpc("record_consent" as any, { _user_id: user.id, _email: user.email, _consent_type: "privacy", _granted: true, _slug: "privacy" } as any);
      setNeeded(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-primary/10 border-b border-primary/30 px-4 py-3">
      <div className="container mx-auto flex flex-col sm:flex-row sm:items-center gap-3 text-sm">
        <ShieldAlert className="h-5 w-5 text-primary shrink-0" />
        <p className="flex-1 text-foreground">
          We've updated our{" "}
          <Link to="/page/terms" className="underline font-medium">Terms</Link> and{" "}
          <Link to="/page/privacy" className="underline font-medium">Privacy Policy</Link>{" "}
          to comply with the Digital Personal Data Protection Act, 2023. Please review and accept to continue.
        </p>
        <Button size="sm" onClick={accept} disabled={busy}>
          {busy ? "Saving…" : "I Accept"}
        </Button>
      </div>
    </div>
  );
}
