import { useMemo, useState } from "react";
import { Loader2, Trophy, KeyRound, ListChecks, LogOut, ChevronDown } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQcAdmin } from "@/hooks/useQcAdmin";
import { useQuickCompetitions } from "@/hooks/useQuickCompetitions";
import { QuickCompetitionDialog } from "@/components/admin/QuickCompetitionDialog";
import { QuickCompetitionConsole } from "@/components/admin/QuickCompetitionConsole";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";

export default function QcAdmin() {
  const { signOut, user } = useAuth();
  const { tenants, activeTenant, setActiveTenantId } = useQcAdmin();
  const [tab, setTab] = useState("competitions");

  if (!activeTenant) {
    return (
      <div className="min-h-screen grid place-items-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Trophy className="h-5 w-5 text-amber-500" />
            <span className="font-semibold">Quick Competitions</span>
            {tenants.length > 1 ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="gap-1">
                    {activeTenant.display_name || activeTenant.name}
                    <ChevronDown className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  {tenants.map((t) => (
                    <DropdownMenuItem key={t.id} onClick={() => setActiveTenantId(t.id)}>
                      {t.display_name || t.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <span className="text-sm text-muted-foreground">· {activeTenant.display_name || activeTenant.name}</span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground hidden sm:inline">{user?.email}</span>
            <Button variant="ghost" size="sm" onClick={signOut}><LogOut className="h-4 w-4" /></Button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="competitions"><Trophy className="h-4 w-4 mr-1.5" />Competitions</TabsTrigger>
            <TabsTrigger value="entries"><ListChecks className="h-4 w-4 mr-1.5" />Entries</TabsTrigger>
            <TabsTrigger value="payments"><KeyRound className="h-4 w-4 mr-1.5" />Payments</TabsTrigger>
          </TabsList>

          <TabsContent value="competitions" className="mt-6">
            <CompetitionsTab tenantId={activeTenant.id} />
          </TabsContent>
          <TabsContent value="entries" className="mt-6">
            <EntriesTab tenantId={activeTenant.id} />
          </TabsContent>
          <TabsContent value="payments" className="mt-6">
            <PaymentsTab tenantId={activeTenant.id} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

function CompetitionsTab({ tenantId }: { tenantId: string }) {
  const { data: comps, isLoading } = useQuickCompetitions(tenantId);
  const [openId, setOpenId] = useState<string | null>(null);

  if (openId) {
    return <QuickCompetitionConsole competitionId={openId} onClose={() => setOpenId(null)} />;
  }

  return (
    <>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-medium">Your competitions</h2>
        <QuickCompetitionDialog tenantId={tenantId} onCreated={(id) => setOpenId(id)} />
      </div>
      {isLoading ? (
        <Loader2 className="h-5 w-5 animate-spin" />
      ) : !comps?.length ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">No competitions yet. Create your first one.</CardContent></Card>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {comps.map((c) => (
            <Card key={c.id} className="cursor-pointer hover:bg-accent/30" onClick={() => setOpenId(c.id)}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{c.name}</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                {c.format} · {c.status}
                {c.entry_type === "paid" ? <> · {c.entry_currency} {Number(c.entry_fee).toFixed(0)}</> : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

function EntriesTab({ tenantId }: { tenantId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["qc-tenant-entries", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("qc_entries")
        .select("id, player_name, phone, amount, currency, status, created_at, competition_id, quick_competitions!inner(name, tenant_id)")
        .eq("quick_competitions.tenant_id", tenantId)
        .order("created_at", { ascending: false }).limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  if (isLoading) return <Loader2 className="h-5 w-5 animate-spin" />;
  if (!data?.length) return <Card><CardContent className="py-12 text-center text-muted-foreground">No paid entries yet.</CardContent></Card>;
  return (
    <Card>
      <CardContent className="p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground uppercase">
            <tr className="border-b"><th className="text-left p-3">Player</th><th className="text-left p-3">Phone</th><th className="text-left p-3">Competition</th><th className="text-right p-3">Amount</th><th className="text-left p-3">Status</th></tr>
          </thead>
          <tbody>
            {data.map((e) => (
              // deno-lint-ignore no-explicit-any
              <tr key={e.id} className="border-b last:border-0"><td className="p-3">{e.player_name}</td><td className="p-3">{e.phone}</td><td className="p-3">{(e as any).quick_competitions?.name}</td><td className="p-3 text-right">{e.currency} {Number(e.amount).toFixed(0)}</td><td className="p-3">{e.status}</td></tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function PaymentsTab({ tenantId }: { tenantId: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: gw, isLoading } = useQuery({
    queryKey: ["qc-tenant-gateway", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payment_gateways")
        .select("id, name, api_key, api_secret, webhook_secret, is_active, is_test_mode")
        .eq("tenant_id", tenantId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const [form, setForm] = useState({ api_key: "", api_secret: "", webhook_secret: "", is_test_mode: true });
  useMemo(() => {
    if (gw) setForm({
      api_key: gw.api_key ?? "",
      api_secret: gw.api_secret ?? "",
      webhook_secret: gw.webhook_secret ?? "",
      is_test_mode: gw.is_test_mode ?? true,
    });
  }, [gw]);

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        tenant_id: tenantId,
        name: "razorpay",
        display_name: "Razorpay",
        api_key: form.api_key.trim() || null,
        api_secret: form.api_secret.trim() || null,
        webhook_secret: form.webhook_secret.trim() || null,
        is_active: true,
        is_test_mode: form.is_test_mode,
        city: null as unknown as string,
      };
      if (gw?.id) {
        const { error } = await supabase.from("payment_gateways").update(payload).eq("id", gw.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("payment_gateways").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["qc-tenant-gateway", tenantId] });
      toast({ title: "Payment settings saved" });
    },
    onError: (e: Error) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  if (isLoading) return <Loader2 className="h-5 w-5 animate-spin" />;

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>Your payment gateway</CardTitle>
        <p className="text-sm text-muted-foreground">Bring your own Razorpay account. Stripe, PayPal, and Square coming soon.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label>Provider</Label>
          <select disabled className="mt-1 w-full rounded-md border bg-muted px-3 py-2 text-sm">
            <option>Razorpay</option>
          </select>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="k">Key ID</Label>
            <Input id="k" value={form.api_key} onChange={(e) => setForm((f) => ({ ...f, api_key: e.target.value }))} placeholder="rzp_test_…" />
          </div>
          <div>
            <Label htmlFor="s">Key Secret</Label>
            <Input id="s" type="password" value={form.api_secret} onChange={(e) => setForm((f) => ({ ...f, api_secret: e.target.value }))} />
          </div>
        </div>
        <div>
          <Label htmlFor="w">Webhook Secret</Label>
          <Input id="w" type="password" value={form.webhook_secret} onChange={(e) => setForm((f) => ({ ...f, webhook_secret: e.target.value }))} />
          <p className="mt-1 text-xs text-muted-foreground">Webhook URL: <code className="bg-muted px-1 rounded">https://epcuyrjsrbrybznqcfvl.supabase.co/functions/v1/razorpay-webhook</code></p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.is_test_mode} onChange={(e) => setForm((f) => ({ ...f, is_test_mode: e.target.checked }))} />
          Test mode
        </label>
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
        </Button>
      </CardContent>
    </Card>
  );
}
