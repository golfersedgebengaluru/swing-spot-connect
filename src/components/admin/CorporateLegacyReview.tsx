import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCorporateAccounts } from "@/hooks/useCorporateAccounts";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

export function CorporateLegacyReview({ city }: { city: string | null }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: accounts = [] } = useCorporateAccounts();
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const { data: rows = [], error } = useQuery({
    queryKey: ["corporate_legacy_review", city],
    queryFn: async () => {
      let q = supabase.from("bookings").select("id,user_id,city,start_time,billing_status,status")
        .is("corporate_account_id", null).in("billing_status", ["deferred", "invoiced"]).order("start_time");
      if (city) q = q.eq("city", city);
      const { data, error } = await q;
      if (error) throw error;
      const { data: profiles, error: profileError } = await supabase.from("profiles").select("id,user_id,display_name");
      if (profileError) throw profileError;
      return (data ?? []).map(b => ({ ...b, name: profiles?.find(p => p.id === b.user_id || p.user_id === b.user_id)?.display_name || "Unknown member" }));
    },
  });
  const confirm = async (id: string) => {
    if (!choices[id] || saving) return;
    setSaving(true);
    try {
      const { error } = await supabase.rpc("confirm_legacy_corporate_payer", { _booking_id: id, _account_id: choices[id] });
      if (error) throw error;
      await Promise.all(["corporate_legacy_review", "deferred_items_corporate", "all_bookings"].map(key => qc.invalidateQueries({ queryKey: [key] })));
      toast({ title: "Historical billing account confirmed" });
    } catch (e: unknown) {
      toast({ title: "Could not confirm", description: e instanceof Error ? e.message : "Check membership and city access", variant: "destructive" });
    } finally { setSaving(false); }
  };
  if (error) return <p className="text-destructive text-sm">Could not load historical billing exceptions.</p>;
  if (!rows.length) return null;
  return <section className="border-t border-border pt-4 space-y-3">
    <h3 className="font-medium">Historical billing review ({rows.length})</h3>
    <p className="text-sm text-muted-foreground">These sessions have no confirmed company. Unconfirmed sessions are excluded from new corporate invoices.</p>
    <div className="max-h-64 overflow-y-auto divide-y divide-border">
      {rows.map(b => <div key={b.id} className="py-3 flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-40 text-sm"><p className="font-medium">{b.name}</p><p className="text-muted-foreground">{b.city} · {new Date(b.start_time).toLocaleDateString()} · {b.billing_status}</p></div>
        {b.billing_status === "deferred" ? <>
          <Select value={choices[b.id] || ""} onValueChange={id => setChoices(prev => ({ ...prev, [b.id]: id }))}>
            <SelectTrigger className="w-52"><SelectValue placeholder="Confirm company" /></SelectTrigger>
            <SelectContent>{accounts.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
          </Select>
          <Button size="sm" disabled={!choices[b.id] || saving} onClick={() => confirm(b.id)}>Confirm</Button>
        </> : <span className="text-sm text-muted-foreground">Issued invoice needs auditor review</span>}
      </div>)}
    </div>
  </section>;
}