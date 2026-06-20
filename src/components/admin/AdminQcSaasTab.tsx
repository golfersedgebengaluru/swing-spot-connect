import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, UserPlus, Trophy, Trash2, Power, PowerOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQcSaasProvisioning } from "@/hooks/useQcAdmin";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/hooks/use-toast";

type AccessMode = "qc_only" | "full";

function useTenantOwners(tenantId: string | null) {
  return useQuery({
    queryKey: ["qc-saas-owners", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data: admins, error } = await supabase
        .from("qc_only_admins")
        .select("user_id, role, disabled")
        .eq("tenant_id", tenantId!);
      if (error) throw error;
      const userIds = (admins ?? []).map((a: any) => a.user_id);
      if (userIds.length === 0) return [];
      const { data: profs } = await supabase
        .from("profiles")
        .select("user_id, email, display_name")
        .in("user_id", userIds);
      const pMap = new Map((profs ?? []).map((p: any) => [p.user_id, p]));
      return (admins ?? []).map((a: any) => ({
        user_id: a.user_id,
        role: a.role,
        disabled: !!a.disabled,
        email: pMap.get(a.user_id)?.email ?? null,
        display_name: pMap.get(a.user_id)?.display_name ?? null,
      }));
    },
  });
}


export function AdminQcSaasTab() {
  const { tenants, createTenant, assignOwnerByEmail, setOwnerDisabled, removeOwner } = useQcSaasProvisioning();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [openCreate, setOpenCreate] = useState(false);
  const [form, setForm] = useState({ name: "", display_name: "" });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [emailToAdd, setEmailToAdd] = useState("");
  const [accessMode, setAccessMode] = useState<AccessMode>("qc_only");
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
      await assignOwnerByEmail.mutateAsync({
        tenant_id: selectedId,
        email: emailToAdd,
        full_access: accessMode === "full",
      });
      setEmailToAdd("");
      qc.invalidateQueries({ queryKey: ["qc-saas-owners", selectedId] });
      toast({
        title: "Owner assigned",
        description: accessMode === "full"
          ? "Granted QC-admin + coach + user access."
          : "Granted QC-admin only access.",
      });
    } catch (e) {
      toast({ title: "Assign failed", description: (e as Error).message, variant: "destructive" });
    }
  };

  const onToggleDisabled = async (user_id: string, disabled: boolean) => {
    if (!selectedId) return;
    try {
      await setOwnerDisabled.mutateAsync({ tenant_id: selectedId, user_id, disabled: !disabled });
      toast({ title: disabled ? "Owner re-enabled" : "Owner disabled" });
    } catch (e) {
      toast({ title: "Update failed", description: (e as Error).message, variant: "destructive" });
    }
  };

  const onDelete = async (user_id: string, label: string) => {
    if (!selectedId) return;
    if (!confirm(`Remove QC owner access for ${label}? This deletes their owner assignment.`)) return;
    try {
      await removeOwner.mutateAsync({ tenant_id: selectedId, user_id });
      toast({ title: "Owner removed" });
    } catch (e) {
      toast({ title: "Delete failed", description: (e as Error).message, variant: "destructive" });
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
              <div className="rounded-md border p-3 space-y-3">
                <div className="flex gap-2">
                  <Input
                    placeholder="owner@example.com"
                    value={emailToAdd}
                    onChange={(e) => setEmailToAdd(e.target.value)}
                  />
                  <Button onClick={onAssign} disabled={assignOwnerByEmail.isPending || !emailToAdd.trim()}>
                    {assignOwnerByEmail.isPending
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : <><UserPlus className="h-4 w-4 mr-1" />Assign owner</>}
                  </Button>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Access level</Label>
                  <RadioGroup
                    value={accessMode}
                    onValueChange={(v) => setAccessMode(v as AccessMode)}
                    className="mt-1.5 space-y-1.5"
                  >
                    <label className="flex items-start gap-2 text-sm cursor-pointer">
                      <RadioGroupItem value="qc_only" id="am-qc" className="mt-0.5" />
                      <span>
                        <span className="font-medium">QC-admin only</span>
                        <span className="block text-xs text-muted-foreground">
                          Logs in straight to <code>/qc-admin</code>. No member or coach access.
                        </span>
                      </span>
                    </label>
                    <label className="flex items-start gap-2 text-sm cursor-pointer">
                      <RadioGroupItem value="full" id="am-full" className="mt-0.5" />
                      <span>
                        <span className="font-medium">Full access</span>
                        <span className="block text-xs text-muted-foreground">
                          Also grants <strong>user</strong> + <strong>coach</strong> roles. Lands on the normal dashboard.
                        </span>
                      </span>
                    </label>
                  </RadioGroup>
                </div>
              </div>
              {owners.isLoading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : !owners.data?.length ? (
                <p className="text-sm text-muted-foreground">No owners assigned yet.</p>
              ) : (
                <ul className="divide-y border rounded-md">
                  {owners.data.map((o: any) => (
                    <li key={o.user_id} className="flex items-center justify-between gap-3 p-3 text-sm">
                      <div className="min-w-0">
                        <div className="font-medium truncate">
                          {o.display_name || o.email || o.user_id}
                          {o.disabled && (
                            <span className="ml-2 text-xs uppercase text-amber-600 dark:text-amber-400">disabled</span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">{o.email}</div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <span className="text-xs text-muted-foreground uppercase mr-1">{o.role}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          title={o.disabled ? "Re-enable owner" : "Disable owner"}
                          onClick={() => onToggleDisabled(o.user_id, o.disabled)}
                          disabled={setOwnerDisabled.isPending}
                        >
                          {o.disabled
                            ? <Power className="h-4 w-4 text-emerald-600" />
                            : <PowerOff className="h-4 w-4 text-amber-600" />}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Remove owner"
                          onClick={() => onDelete(o.user_id, o.display_name || o.email || o.user_id)}
                          disabled={removeOwner.isPending}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-xs text-muted-foreground">
                QC-only owners log in and are routed to <code>/qc-admin</code>. Full-access owners land on the normal dashboard with coach tools.
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
