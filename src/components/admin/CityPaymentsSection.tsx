import { useState } from "react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CreditCard, Eye, EyeOff, Loader2, Save, Plus, Trash2, Banknote } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  useAllOfflinePaymentMethods,
  useCityOfflinePaymentMethods,
  useCreateOfflinePaymentMethod,
  useUpdateOfflinePaymentMethod,
  useDeleteOfflinePaymentMethod,
  useDeleteCityOfflinePaymentMethods,
  type OfflinePaymentMethod,
} from "@/hooks/useOfflinePaymentMethods";
import type { Json } from "@/integrations/supabase/types";

// ─── Types ──────────────────────────────────────────────
interface Gateway {
  id: string;
  name: string;
  display_name: string;
  api_key: string | null;
  api_secret: string | null;
  is_active: boolean;
  is_test_mode: boolean;
  config: Json;
  sort_order: number;
  city: string;
}

const GATEWAY_TEMPLATES = [
  { name: "razorpay", display_name: "Razorpay" },
  { name: "stripe", display_name: "Stripe" },
  { name: "paypal", display_name: "PayPal" },
];

// ─── Payment Gateways (per-city) ────────────────────────
function CityGatewaysCard({ city }: { city: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [edits, setEdits] = useState<Record<string, Partial<Gateway>>>({});

  const { data: gateways, isLoading } = useQuery({
    queryKey: ["payment_gateways", city],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payment_gateways")
        .select("*")
        .eq("city", city)
        .order("sort_order");
      if (error) throw error;
      return data as Gateway[];
    },
  });

  const updateGateway = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Gateway> }) => {
      const { error } = await supabase
        .from("payment_gateways")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payment_gateways"] });
      toast({ title: "Gateway Updated" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const addGateway = useMutation({
    mutationFn: async (gw: { name: string; display_name: string }) => {
      const { error } = await supabase.from("payment_gateways").insert({
        name: gw.name,
        display_name: gw.display_name,
        city,
        is_active: false,
        is_test_mode: true,
        config: {},
        sort_order: (gateways?.length ?? 0),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payment_gateways"] });
      toast({ title: "Gateway Added" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteGateway = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("payment_gateways").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payment_gateways"] });
      toast({ title: "Gateway Removed" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const getEdit = (gw: Gateway) => ({ ...gw, ...edits[gw.id] });

  const handleFieldChange = (id: string, field: string, value: string | boolean) => {
    setEdits((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  };

  const handleSave = (gw: Gateway) => {
    const changes = edits[gw.id];
    if (!changes) return;
    updateGateway.mutate({ id: gw.id, updates: changes });
    setEdits((prev) => { const n = { ...prev }; delete n[gw.id]; return n; });
  };

  const maskValue = (val: string | null) => {
    if (!val) return "";
    if (val.length <= 8) return "••••••••";
    return val.slice(0, 4) + "••••" + val.slice(-4);
  };

  if (isLoading) return <Loader2 className="mx-auto h-8 w-8 animate-spin" />;

  const existingNames = (gateways ?? []).map((g) => g.name);
  const availableTemplates = GATEWAY_TEMPLATES.filter((t) => !existingNames.includes(t.name));

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <CreditCard className="h-5 w-5" /> Payment Gateways
          </CardTitle>
          {availableTemplates.length > 0 && (
            <Select onValueChange={(name) => {
              const tpl = GATEWAY_TEMPLATES.find((t) => t.name === name);
              if (tpl) addGateway.mutate(tpl);
            }}>
              <SelectTrigger className="w-[160px]">
                <Plus className="h-4 w-4 mr-1" />
                <SelectValue placeholder="Add gateway" />
              </SelectTrigger>
              <SelectContent>
                {availableTemplates.map((t) => (
                  <SelectItem key={t.name} value={t.name}>{t.display_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <CardDescription>Configure online payment gateways for {city}.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {(gateways ?? []).length === 0 && (
          <p className="text-sm text-muted-foreground">No gateways configured yet.</p>
        )}
        {(gateways ?? []).map((gw) => {
          const merged = getEdit(gw);
          const hasChanges = !!edits[gw.id];
          const isVisible = showSecrets[gw.id];

          return (
            <div key={gw.id} className="rounded-lg border border-border p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="font-medium">{gw.display_name}</span>
                  {gw.is_active && <Badge className="bg-green-500/15 text-green-600 border-green-300">Active</Badge>}
                  {merged.is_test_mode && <Badge variant="outline" className="text-amber-600 border-amber-300">Test Mode</Badge>}
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={gw.is_active} onCheckedChange={() => updateGateway.mutate({ id: gw.id, updates: { is_active: !gw.is_active } })} />
                  <Button variant="ghost" size="icon" onClick={() => deleteGateway.mutate(gw.id)} disabled={deleteGateway.isPending}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>API Key {gw.name === "razorpay" && "(Key ID)"}</Label>
                  <div className="flex gap-2">
                    <Input
                      type={isVisible ? "text" : "password"}
                      placeholder={`Enter ${gw.display_name} API key`}
                      value={edits[gw.id]?.api_key ?? (isVisible ? gw.api_key ?? "" : maskValue(gw.api_key))}
                      onChange={(e) => handleFieldChange(gw.id, "api_key", e.target.value)}
                      onFocus={() => { if (!edits[gw.id]?.api_key && gw.api_key) handleFieldChange(gw.id, "api_key", gw.api_key); }}
                    />
                    <Button variant="outline" size="icon" onClick={() => setShowSecrets((p) => ({ ...p, [gw.id]: !p[gw.id] }))}>
                      {isVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>API Secret {gw.name === "razorpay" && "(Key Secret)"}</Label>
                  <Input
                    type={isVisible ? "text" : "password"}
                    placeholder={`Enter ${gw.display_name} API secret`}
                    value={edits[gw.id]?.api_secret ?? (isVisible ? gw.api_secret ?? "" : maskValue(gw.api_secret))}
                    onChange={(e) => handleFieldChange(gw.id, "api_secret", e.target.value)}
                    onFocus={() => { if (!edits[gw.id]?.api_secret && gw.api_secret) handleFieldChange(gw.id, "api_secret", gw.api_secret); }}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <div className="flex items-center gap-2">
                  <Switch checked={merged.is_test_mode} onCheckedChange={() => handleFieldChange(gw.id, "is_test_mode", !merged.is_test_mode)} id={`test-${gw.id}`} />
                  <Label htmlFor={`test-${gw.id}`} className="text-sm">Test Mode</Label>
                </div>
                {hasChanges && (
                  <Button size="sm" onClick={() => handleSave(gw)} disabled={updateGateway.isPending}>
                    {updateGateway.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
                    Save Changes
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

// ─── Offline Payment Methods (per-city with inheritance) ─
function CityOfflinePaymentMethodsCard({ city }: { city: string }) {
  const { toast } = useToast();
  const { data: globalMethods, isLoading: loadingGlobal } = useAllOfflinePaymentMethods();
  const { data: cityMethods, isLoading: loadingCity } = useCityOfflinePaymentMethods(city);
  const createMethod = useCreateOfflinePaymentMethod();
  const updateMethod = useUpdateOfflinePaymentMethod();
  const deleteMethod = useDeleteOfflinePaymentMethod();
  const deleteCityMethods = useDeleteCityOfflinePaymentMethods();
  const [newLabel, setNewLabel] = useState("");
  const [confirmRemoveOverride, setConfirmRemoveOverride] = useState(false);

  const isOverridden = (cityMethods?.length ?? 0) > 0;
  const isLoading = loadingGlobal || loadingCity;

  const handleToggleOverride = async (checked: boolean) => {
    if (checked) {
      const methods = globalMethods ?? [];
      for (const m of methods) {
        await createMethod.mutateAsync({ label: m.label, sort_order: m.sort_order, city });
      }
      toast({ title: "Override Enabled", description: `Custom payment methods created for ${city}. You can now edit them independently.` });
    } else {
      setConfirmRemoveOverride(true);
    }
  };

  const handleConfirmRemoveOverride = async () => {
    setConfirmRemoveOverride(false);
    await deleteCityMethods.mutateAsync(city);
    toast({ title: "Override Disabled", description: `${city} now uses global payment methods.` });
  };

  const handleAdd = () => {
    if (!newLabel.trim()) return;
    createMethod.mutate(
      { label: newLabel.trim(), sort_order: (cityMethods?.length ?? 0) + 1, city },
      {
        onSuccess: () => { setNewLabel(""); toast({ title: "Added" }); },
        onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
      }
    );
  };

  if (isLoading) return <Loader2 className="mx-auto h-8 w-8 animate-spin" />;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Banknote className="h-5 w-5" /> Offline Payment Methods
        </CardTitle>
        <CardDescription>
          Walk-in payment options. {isOverridden ? "Using custom methods for this city." : "Inheriting from global settings."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between rounded-lg border border-border p-3">
          <div>
            <p className="text-sm font-medium text-foreground">Custom settings for {city}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isOverridden ? "This city has its own payment methods." : "Toggle on to override global defaults."}
            </p>
          </div>
          <Switch
            checked={isOverridden}
            onCheckedChange={handleToggleOverride}
            disabled={createMethod.isPending || deleteCityMethods.isPending}
          />
        </div>

        {/* Show methods list */}
        {isOverridden ? (
          <>
            {(cityMethods ?? []).map((m) => (
              <div key={m.id} className="flex items-center gap-3">
                <span className="text-sm flex-1 text-foreground">{m.label}</span>
                <Switch
                  checked={m.is_active}
                  onCheckedChange={(checked) =>
                    updateMethod.mutate({ id: m.id, is_active: checked }, {
                      onSuccess: () => toast({ title: "Updated" }),
                      onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
                    })
                  }
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={() =>
                    deleteMethod.mutate(m.id, {
                      onSuccess: () => toast({ title: "Deleted" }),
                      onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
                    })
                  }
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
            <div className="flex gap-2">
              <Input
                placeholder="New method name"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                className="flex-1"
              />
              <Button size="sm" onClick={handleAdd} disabled={!newLabel.trim() || createMethod.isPending}>
                <Plus className="h-4 w-4 mr-1" /> Add
              </Button>
            </div>
          </>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Global Methods (read-only)</p>
            {(globalMethods ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No global methods configured.</p>
            ) : (
              (globalMethods ?? []).map((m) => (
                <div key={m.id} className="flex items-center gap-3">
                  <span className="text-sm flex-1 text-foreground">{m.label}</span>
                  <Badge variant={m.is_active ? "default" : "secondary"} className="text-xs">
                    {m.is_active ? "Active" : "Inactive"}
                  </Badge>
                </div>
              ))
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Main Section ───────────────────────────────────────
export function CityPaymentsSection({ city }: { city: string }) {
  return (
    <div className="space-y-6 max-w-2xl">
      <CityGatewaysCard city={city} />
      <CityOfflinePaymentMethodsCard city={city} />
    </div>
  );
}
