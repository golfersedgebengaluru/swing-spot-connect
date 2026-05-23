import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { UserCheck, ShieldCheck } from "lucide-react";

type Nomination = {
  id: string;
  nominee_name: string;
  nominee_email: string;
  nominee_phone: string | null;
  relationship: string | null;
  notes: string | null;
  status: string;
  created_at: string;
};

export function NominationCard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [current, setCurrent] = useState<Nomination | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", phone: "", relationship: "", notes: "" });
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("nominations")
      .select("*")
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle();
    setCurrent((data as Nomination | null) ?? null);
    setLoading(false);
  };

  useEffect(() => { void load(); }, [user]);

  const startEdit = () => {
    setForm({
      name: current?.nominee_name ?? "",
      email: current?.nominee_email ?? "",
      phone: current?.nominee_phone ?? "",
      relationship: current?.relationship ?? "",
      notes: current?.notes ?? "",
    });
    setEditing(true);
  };

  const save = async () => {
    if (!user) return;
    if (!form.name.trim() || !form.email.trim()) {
      toast({ title: "Name and email are required", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      if (current) {
        await supabase.from("nominations").update({
          status: "revoked", revoked_at: new Date().toISOString(),
        }).eq("id", current.id);
      }
      const { error } = await supabase.from("nominations").insert({
        user_id: user.id,
        nominee_name: form.name.trim(),
        nominee_email: form.email.trim().toLowerCase(),
        nominee_phone: form.phone.trim() || null,
        relationship: form.relationship.trim() || null,
        notes: form.notes.trim() || null,
        status: "active",
      });
      if (error) throw error;
      toast({ title: "Nominee saved" });
      setEditing(false);
      await load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to save";
      toast({ title: "Error", description: msg, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const revoke = async () => {
    if (!current) return;
    setBusy(true);
    await supabase.from("nominations").update({
      status: "revoked", revoked_at: new Date().toISOString(),
    }).eq("id", current.id);
    setBusy(false);
    toast({ title: "Nominee removed" });
    await load();
  };

  if (loading) return null;

  return (
    <Card className="shadow-md rounded-xl">
      <CardHeader>
        <CardTitle className="font-display text-xl flex items-center gap-2">
          <UserCheck className="h-5 w-5 text-primary" />
          Nominee (DPDP §13)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Under the DPDP Act, 2023 you may nominate a person who can exercise your data rights
          (access, correction, erasure) if you pass away or become incapacitated.
        </p>

        {!editing && current && (
          <div className="rounded-md border border-border p-4 space-y-1 text-sm">
            <div className="flex items-center gap-2 font-medium"><ShieldCheck className="h-4 w-4 text-primary" />{current.nominee_name}</div>
            <div className="text-muted-foreground">{current.nominee_email}</div>
            {current.nominee_phone && <div className="text-muted-foreground">{current.nominee_phone}</div>}
            {current.relationship && <div className="text-muted-foreground">Relationship: {current.relationship}</div>}
            <div className="flex gap-2 pt-3">
              <Button size="sm" variant="outline" onClick={startEdit}>Replace</Button>
              <Button size="sm" variant="ghost" className="text-destructive" onClick={revoke} disabled={busy}>Remove</Button>
            </div>
          </div>
        )}

        {!editing && !current && (
          <Button onClick={startEdit}>Add a nominee</Button>
        )}

        {editing && (
          <div className="space-y-3">
            <div>
              <Label>Nominee name *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1" />
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <Label>Email *</Label>
                <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="mt-1" />
              </div>
              <div>
                <Label>Phone</Label>
                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="mt-1" />
              </div>
            </div>
            <div>
              <Label>Relationship</Label>
              <Input value={form.relationship} onChange={(e) => setForm({ ...form, relationship: e.target.value })} placeholder="Spouse, parent, sibling…" className="mt-1" />
            </div>
            <div>
              <Label>Notes (optional)</Label>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="mt-1" rows={2} />
            </div>
            <div className="flex gap-2">
              <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save nominee"}</Button>
              <Button variant="ghost" onClick={() => setEditing(false)} disabled={busy}>Cancel</Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
