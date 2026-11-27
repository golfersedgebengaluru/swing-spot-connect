import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertCircle, Loader2, LogOut, MailCheck, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface AgeConsentStatus {
  state: "incomplete" | "adult" | "parent_required" | "pending" | "approved" | "declined" | "staff";
  needs_completion: boolean;
  can_use_member_features: boolean;
  declared_adult: boolean | null;
  parent_email: string | null;
  email_delivery_status: "pending" | "sent" | "failed" | null;
  parent_expires_at: string | null;
  resend_available_at: string | null;
  terms_version: string | null;
  privacy_version: string | null;
}

interface AgeConsentCompletionModalProps {
  open: boolean;
  onComplete: () => void;
}

export function AgeConsentCompletionModal({ open, onComplete }: AgeConsentCompletionModalProps) {
  const [status, setStatus] = useState<AgeConsentStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [isAdult, setIsAdult] = useState<boolean | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [parentEmail, setParentEmail] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    const { data, error: statusError } = await supabase.rpc("get_age_consent_status");
    if (statusError) {
      setError("We couldn't check your account status. Please retry; no member action has been enabled.");
    } else {
      const next = data as unknown as AgeConsentStatus;
      setStatus(next);
      if (next.declared_adult !== null) setIsAdult(next.declared_adult);
      if (next.parent_email) setParentEmail(next.parent_email);
      if (!next.needs_completion) onComplete();
    }
    setLoading(false);
  }, [onComplete]);

  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  const requestParentEmail = async () => {
    const { data, error: invokeError } = await supabase.functions.invoke("request-parental-consent", {
      body: { parent_email: parentEmail.trim().toLowerCase() },
    });
    if (invokeError || data?.error || !data?.success) {
      throw new Error(data?.error || invokeError?.message || "The parental consent email could not be sent. Please retry.");
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    if (isAdult === null) return setError("Please answer whether you are 18 years or older.");
    if (!accepted) return setError("Please accept the Terms of Service and Privacy Policy.");
    if (!isAdult && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(parentEmail.trim())) {
      return setError("Please enter a valid parent or guardian email address.");
    }

    setBusy(true);
    try {
      const { error: saveError } = await supabase.rpc("submit_age_declaration", {
        _is_adult: isAdult,
        _accept_policies: true,
        _marketing_opt_in: isAdult ? marketing : false,
        _user_agent: navigator.userAgent,
      });
      if (saveError) throw saveError;
      if (!isAdult && status?.state !== "approved") await requestParentEmail();
      await refresh();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Your response could not be saved. Please retry.";
      await refresh();
      setError(message);
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setBusy(true);
    setError("");
    try {
      await requestParentEmail();
      await refresh();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "The email could not be sent. Please retry.";
      await refresh();
      setError(message);
    } finally {
      setBusy(false);
    }
  };

  const waitingForParent = status?.state === "pending";
  const existingDeclaration = status?.declared_adult !== null && status?.declared_adult !== undefined;
  const existingMinor = status?.declared_adult === false;
  const resendWait = status?.resend_available_at && new Date(status.resend_available_at).getTime() > Date.now();

  return (
    <Dialog open={open}>
      <DialogContent
        className="max-h-[85vh] overflow-y-auto sm:max-w-md [&>button[class*='absolute']]:hidden"
        onPointerDownOutside={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{waitingForParent ? "Waiting for parent approval" : "One quick account check"}</DialogTitle>
          <DialogDescription>
            {waitingForParent
              ? "Your parent or guardian needs to respond before member features are enabled."
              : "Confirm your age group and review the current policies to continue."}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" /> Checking your account…
          </div>
        ) : waitingForParent ? (
          <div className="space-y-4">
            <div className="rounded-md border border-border bg-muted/30 p-4 text-sm">
              <MailCheck className="mb-2 h-6 w-6 text-primary" />
              <p>We sent a consent link to <strong>{status?.parent_email}</strong>.</p>
              <p className="mt-2 text-muted-foreground">The link is valid for 48 hours and can be used once.</p>
            </div>
            {status?.email_delivery_status === "failed" && (
              <p className="text-sm text-destructive">The email failed to send. Your request is saved; please resend it.</p>
            )}
            {error && <p className="flex gap-2 text-sm text-destructive"><AlertCircle className="h-4 w-4 shrink-0" />{error}</p>}
            <Button className="w-full" onClick={resend} disabled={busy || !!resendWait}>
              {busy ? "Sending…" : resendWait ? "Please wait before resending" : "Resend consent email"}
            </Button>
            <Button variant="outline" className="w-full" onClick={refresh} disabled={loading}>
              <RefreshCw className="mr-2 h-4 w-4" /> Check approval status
            </Button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-5">
            <fieldset disabled={existingDeclaration || busy}>
              <legend className="mb-3 text-sm font-medium">Are you 18 years or older?</legend>
              <div className="grid grid-cols-2 gap-3">
                <Button type="button" variant={isAdult === true ? "default" : "outline"} onClick={() => setIsAdult(true)}>Yes</Button>
                <Button type="button" variant={isAdult === false ? "default" : "outline"} onClick={() => setIsAdult(false)}>No</Button>
              </div>
            </fieldset>
            {existingMinor && (
              <p className="text-xs text-muted-foreground">This account has an under-18 declaration. An authorised correction is needed to change it.</p>
            )}
            {isAdult === false && (
              <div>
                <Label htmlFor="guardian-email">Parent / guardian email</Label>
                <Input id="guardian-email" type="email" className="mt-2" value={parentEmail} onChange={(event) => setParentEmail(event.target.value)} placeholder="parent@example.com" required />
                <p className="mt-1 text-xs text-muted-foreground">They will receive an approval link. This email step is not identity verification.</p>
              </div>
            )}
            <div className="space-y-3 rounded-md border border-border bg-muted/30 p-3">
              <div className="flex items-start gap-2">
                <Checkbox id="age-terms" checked={accepted} onCheckedChange={(value) => setAccepted(!!value)} className="mt-0.5" />
                <Label htmlFor="age-terms" className="text-xs font-normal leading-relaxed cursor-pointer">
                  I agree to the <Link to="/page/terms" target="_blank" className="underline text-primary">Terms of Service</Link> and <Link to="/page/privacy" target="_blank" className="underline text-primary">Privacy Policy</Link>.
                </Label>
              </div>
              {isAdult !== false && (
                <div className="flex items-start gap-2">
                  <Checkbox id="age-marketing" checked={marketing} onCheckedChange={(value) => setMarketing(!!value)} className="mt-0.5" />
                  <Label htmlFor="age-marketing" className="text-xs font-normal leading-relaxed cursor-pointer text-muted-foreground">Send me occasional offers and event updates. Optional.</Label>
                </div>
              )}
            </div>
            {error && <p className="flex gap-2 text-sm text-destructive"><AlertCircle className="h-4 w-4 shrink-0" />{error}</p>}
            <Button type="submit" className="w-full" disabled={busy || loading}>
              {busy ? "Saving…" : isAdult === false && status?.state !== "approved" ? "Save and request consent" : "Continue"}
            </Button>
          </form>
        )}

        <Button type="button" variant="ghost" size="sm" className="w-full text-muted-foreground" onClick={() => supabase.auth.signOut()}>
          <LogOut className="mr-2 h-4 w-4" /> Sign out instead
        </Button>
      </DialogContent>
    </Dialog>
  );
}
