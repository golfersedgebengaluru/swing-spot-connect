import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { ShieldCheck, Download, Trash2, FileText } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";

export function PrivacyDataCard() {
  const { user, signOut } = useAuth();
  const { toast } = useToast();
  const [downloading, setDownloading] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState("");
  const [reason, setReason] = useState("");
  const [deleting, setDeleting] = useState(false);

  const downloadData = async () => {
    if (!user) return;
    setDownloading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/dsar-export`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
      });
      const ct = res.headers.get("Content-Type") || "";
      if (!ct.includes("application/json") || res.headers.get("Content-Disposition")) {
        const blob = await res.blob();
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `my-data-${user.id}.json`;
        a.click();
        URL.revokeObjectURL(a.href);
        toast({ title: "Download started", description: "Your data export is downloading." });
      } else {
        const j = await res.json();
        toast({ title: "Could not export", description: j.error || "Unknown error", variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    } finally {
      setDownloading(false);
    }
  };

  const deleteAccount = async () => {
    if (!user) return;
    setDeleting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/account-deletion-request`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ confirm_email: confirmEmail, reason }),
      });
      const j = await res.json();
      if (j.success) {
        toast({ title: "Account deleted", description: "You will now be signed out." });
        await signOut();
        window.location.href = "/";
      } else {
        toast({ title: "Could not delete", description: j.error, variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Card className="shadow-md rounded-xl">
      <CardHeader>
        <CardTitle className="font-display text-xl flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          Privacy &amp; Your Data
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Your rights under the Digital Personal Data Protection Act, 2023.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="text-sm">
            <p className="font-medium">Download my data</p>
            <p className="text-muted-foreground text-xs">Get a copy of everything we hold about you (JSON). Limit: 1/day.</p>
          </div>
          <Button variant="outline" onClick={downloadData} disabled={downloading}>
            <Download className="h-4 w-4 mr-2" />{downloading ? "Preparing…" : "Download"}
          </Button>
        </div>

        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="text-sm">
            <p className="font-medium">Privacy &amp; Terms</p>
            <p className="text-muted-foreground text-xs">Review current policies and Grievance Officer.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" asChild><Link to="/page/privacy"><FileText className="h-4 w-4 mr-1" />Privacy</Link></Button>
            <Button variant="ghost" size="sm" asChild><Link to="/page/terms"><FileText className="h-4 w-4 mr-1" />Terms</Link></Button>
            <Button variant="ghost" size="sm" asChild><Link to="/grievance">Grievance</Link></Button>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 flex-wrap pt-2 border-t">
          <div className="text-sm">
            <p className="font-medium text-destructive">Delete my account</p>
            <p className="text-muted-foreground text-xs">
              Anonymises your profile and revokes login. Financial records are retained for 8 years for tax compliance.
            </p>
          </div>
          <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
            <Trash2 className="h-4 w-4 mr-2" />Delete account
          </Button>
        </div>
      </CardContent>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete your account?</DialogTitle>
            <DialogDescription>
              This will anonymise your profile, sign you out, and revoke access. Booking and invoice records will be retained without your personal identifiers, as required by Indian tax law. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="confirm">Type your email <strong>{user?.email}</strong> to confirm</Label>
              <Input id="confirm" value={confirmEmail} onChange={(e) => setConfirmEmail(e.target.value)} placeholder={user?.email} />
            </div>
            <div>
              <Label htmlFor="reason">Reason (optional)</Label>
              <Textarea id="reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={deleteAccount}
              disabled={deleting || confirmEmail.toLowerCase().trim() !== (user?.email ?? "").toLowerCase().trim()}>
              {deleting ? "Deleting…" : "Permanently delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
