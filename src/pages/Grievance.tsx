import { useState } from "react";
import { Link } from "react-router-dom";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useGrievanceOfficer } from "@/hooks/useGrievanceOfficer";
import { ShieldCheck } from "lucide-react";

const CATEGORIES = [
  { value: "data_access", label: "Request access to my data" },
  { value: "data_correction", label: "Correct my data" },
  { value: "data_erasure", label: "Erase my data" },
  { value: "consent_withdrawal", label: "Withdraw consent" },
  { value: "complaint", label: "Privacy complaint" },
  { value: "other", label: "Other" },
];

export default function Grievance() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState({
    name: "", email: user?.email ?? "", phone: "", category: "complaint", subject: "", body: "",
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.email || !form.subject || !form.body) {
      toast({ title: "Please fill in all required fields", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.from("grievance_tickets" as any).insert({
        user_id: user?.id ?? null,
        email: form.email,
        name: form.name || null,
        phone: form.phone || null,
        category: form.category,
        subject: form.subject,
        body: form.body,
      } as any);
      if (error) throw error;
      setSubmitted(true);
    } catch (e: any) {
      toast({ title: "Could not submit", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Navbar />
      <main className="flex-1 py-12">
        <div className="container mx-auto max-w-2xl px-4">
          <div className="mb-6 flex items-start gap-3">
            <ShieldCheck className="h-8 w-8 text-primary shrink-0 mt-1" />
            <div>
              <h1 className="font-display text-3xl font-bold text-foreground">Grievance Officer</h1>
              <p className="mt-1 text-muted-foreground text-sm">
                Under the Digital Personal Data Protection Act, 2023, you have the right to raise concerns about how
                your personal data is handled. Our Grievance Officer will respond within 30 days.
              </p>
            </div>
          </div>

          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-base">Grievance Officer Contact</CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-1 text-muted-foreground">
              <p><span className="text-foreground font-medium">Name:</span> Grievance Officer, Teetime Ventures Pvt Ltd</p>
              <p><span className="text-foreground font-medium">Email:</span> grievance@golfers-edge.in</p>
              <p><span className="text-foreground font-medium">Response SLA:</span> 30 days</p>
            </CardContent>
          </Card>

          {submitted ? (
            <Card>
              <CardContent className="py-12 text-center space-y-4">
                <ShieldCheck className="mx-auto h-12 w-12 text-primary" />
                <h2 className="font-display text-xl">Grievance received</h2>
                <p className="text-muted-foreground text-sm">
                  We've logged your grievance and will respond by email within 30 days as required by the DPDP Act.
                </p>
                <Button asChild variant="outline"><Link to="/">Back to home</Link></Button>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>File a Grievance</CardTitle>
                <CardDescription>You do not need an account. Provide an email so we can reach you.</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={submit} className="space-y-4">
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="name">Name</Label>
                      <Input id="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                    </div>
                    <div>
                      <Label htmlFor="email">Email *</Label>
                      <Input id="email" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="phone">Phone (optional)</Label>
                    <Input id="phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                  </div>
                  <div>
                    <Label htmlFor="category">Category *</Label>
                    <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="subject">Subject *</Label>
                    <Input id="subject" required value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
                  </div>
                  <div>
                    <Label htmlFor="body">Describe your grievance *</Label>
                    <Textarea id="body" required rows={6} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
                  </div>
                  <Button type="submit" className="w-full" disabled={busy}>
                    {busy ? "Submitting…" : "Submit Grievance"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
