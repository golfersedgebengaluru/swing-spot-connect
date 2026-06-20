import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, UserPlus, Trophy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQcSaasProvisioning } from "@/hooks/useQcAdmin";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

function useTenantOwners(tenantId: string | null) {
  return useQuery({
    queryKey: ["qc-saas-owners", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("qc_only_admins")
        .select("user_id, role, profiles:user_id ( email, full_name )")
        .eq("tenant_id", tenantId!);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function AdminQcSaasTab() {
  const { tenants, createTenant, assignOwnerByEmail } = useQcSaasProvisioning();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [openCreate, setOpenCreate] = useState(false);
  const [form, setForm] = useState({ name: "", display_name: "" });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [emailToAdd, setEmailToAdd] = useState("");
  const owners = useTenantOwners(selectedId);

  const onCreate = async () => {
    if (!form.name.trim()) return;
    try {
      const t = await createTenant.mutateAsync({ name: form.name.trim(), display_name: form.display_name.trim() || undefined });
      setForm({ name: "", display_name: "" });
      setOpenCreate(false);
      setSelectedId(t.id);
      toast({ title: "Tenant created" });
    } catch (e) {
      toast({ title: "Create failed", description: (e as Error).message, variant: "destructive" });
    }
  };

  const onAssign = async () => {
    if (!selectedId || !emailToAdd.trim()) return;
    try {
      await assignOwnerByEmail.mutateAsync({ tenant_id: selectedId, email: emailToAdd });
      setEmailToAdd("");
      qc.invalidateQueries({ queryKey: ["qc-saas-owners", selectedId] });
      toast({ title: "Owner assigned" });
    } catch (e) {
      toast({ title: "Assign failed", description: (e as Error).message, variant: "destructive" });
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base flex items-center gap-2"><Trophy className="h-4 w-4 text-amber-500" />QC SaaS Tenants</CardTitle>
          <Dialog open={openCreate} onOpenChange={setOpenCreate}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-4 w-4 mr-1" />New</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Create QC SaaS tenant</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label htmlFor="t-name">Slug</Label>
                  <Input id="t-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="acme-golf" />
                </div>
                <div>
                  <Label htmlFor="t-display">Display name</Label>
                  <Input id="t-display" value={form.display_name} onChange={(e) => setForm((f) => ({ ...f, display_name: e.target.value }))} placeholder="Acme Golf" />
                </div>
              </div>
              <DialogFooter>
                <Button onClick={onCreate} disabled={createTenant.isPending || !form.name.trim()}>
                  {createTenant.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent className="p-0">
          {tenants.isLoading ? (
            <div className="p-6"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : !tenants.data?.length ? (
            <div className="p-6 text-sm text-muted-foreground">No tenants yet.</div>
          ) : (
            <ul className="divide-y">
              {tenants.data.map((t) => (
                <li key={t.id}>
                  <button
                    onClick={() => setSelectedId(t.id)}
                    className={`w-full text-left px-4 py-3 hover:bg-accent/40 ${selectedId === t.id ? "bg-accent/60" : ""}`}
                  >
                    <div className="text-sm font-medium">{t.display_name || t.name}</div>
                    <div className="text-xs text-muted-foreground">{t.name}</div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {selectedId ? "Owners & access" : "Select a tenant"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!selectedId ? (
            <p className="text-sm text-muted-foreground">Pick a tenant on the left to manage its QC owners.</p>
          ) : (
            <>
              <div className="flex gap-2">
                <Input
                  placeholder="owner@example.com"
                  value={emailToAdd}
                  onChange={(e) => setEmailToAdd(e.target.value)}
                />
                <Button onClick={onAssign} disabled={assignOwnerByEmail.isPending || !emailToAdd.trim()}>
                  <UserPlus className="h-4 w-4 mr-1" />Assign owner
                </Button>
              </div>
              {owners.isLoading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : !owners.data?.length ? (
                <p className="text-sm text-muted-foreground">No owners assigned yet.</p>
              ) : (
                <ul className="divide-y border rounded-md">
                  {owners.data.map((o: any) => (
                    <li key={o.user_id} className="flex items-center justify-between p-3 text-sm">
                      <div>
                        <div className="font-medium">{o.profiles?.full_name || o.profiles?.email || o.user_id}</div>
                        <div className="text-xs text-muted-foreground">{o.profiles?.email}</div>
                      </div>
                      <span className="text-xs text-muted-foreground uppercase">{o.role}</span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-xs text-muted-foreground">
                Owners log in normally and are routed to <code>/qc-admin</code>, where they manage competitions and their own payment gateway.
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
