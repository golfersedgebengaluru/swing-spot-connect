import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Cookie } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const STORAGE_KEY = "cookie_consent_v1";
const POLICY_VERSION = "1.0";

type Choice = { necessary: true; analytics: boolean; marketing: boolean; ts: string; version: string };

function getSessionId(): string {
  try {
    const k = "cookie_session_id";
    let v = localStorage.getItem(k);
    if (!v) { v = crypto.randomUUID(); localStorage.setItem(k, v); }
    return v;
  } catch { return crypto.randomUUID(); }
}

export function CookieBanner() {
  const [open, setOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) setOpen(true);
    } catch { setOpen(true); }
  }, []);

  const record = async (choice: Omit<Choice, "ts" | "version">) => {
    const full: Choice = { ...choice, ts: new Date().toISOString(), version: POLICY_VERSION };
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(full)); } catch { /* noop */ }
    try {
      const { data: userData } = await supabase.auth.getUser();
      await supabase.from("cookie_consents").insert({
        user_id: userData?.user?.id ?? null,
        session_id: getSessionId(),
        necessary: true,
        analytics: choice.analytics,
        marketing: choice.marketing,
        policy_version: POLICY_VERSION,
        user_agent: navigator.userAgent,
      });
    } catch { /* non-blocking */ }
    setOpen(false);
    setManageOpen(false);
  };

  if (!open && !manageOpen) return null;

  return (
    <>
      {open && !manageOpen && (
        <div className="fixed bottom-0 inset-x-0 z-50 border-t border-border bg-background/95 backdrop-blur p-4 shadow-lg">
          <div className="container mx-auto flex flex-col gap-3 md:flex-row md:items-center">
            <Cookie className="h-5 w-5 text-primary shrink-0" />
            <p className="flex-1 text-sm text-foreground">
              We use cookies to run this site and, with your permission, to measure usage and personalise marketing.
              See our <Link to="/page/cookies" className="underline">Cookie Policy</Link>.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => record({ necessary: true, analytics: false, marketing: false })}>
                Reject all
              </Button>
              <Button size="sm" variant="outline" onClick={() => setManageOpen(true)}>
                Manage
              </Button>
              <Button size="sm" onClick={() => record({ necessary: true, analytics: true, marketing: true })}>
                Accept all
              </Button>
            </div>
          </div>
        </div>
      )}

      <Dialog open={manageOpen} onOpenChange={setManageOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cookie preferences</DialogTitle>
            <DialogDescription>Choose which categories of cookies you allow.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex items-start justify-between gap-4">
              <div>
                <Label className="font-medium">Necessary</Label>
                <p className="text-xs text-muted-foreground">Required for login, bookings and security. Always on.</p>
              </div>
              <Switch checked disabled />
            </div>
            <div className="flex items-start justify-between gap-4">
              <div>
                <Label className="font-medium">Analytics</Label>
                <p className="text-xs text-muted-foreground">Helps us understand how the app is used.</p>
              </div>
              <Switch checked={analytics} onCheckedChange={setAnalytics} />
            </div>
            <div className="flex items-start justify-between gap-4">
              <div>
                <Label className="font-medium">Marketing</Label>
                <p className="text-xs text-muted-foreground">Used to tailor offers and promotional content.</p>
              </div>
              <Switch checked={marketing} onCheckedChange={setMarketing} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => record({ necessary: true, analytics: false, marketing: false })}>
              Reject all
            </Button>
            <Button onClick={() => record({ necessary: true, analytics, marketing })}>
              Save preferences
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
