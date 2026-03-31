import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CreditCard, Eye, EyeOff, Loader2, Save, MapPin, Plus, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAllCities } from "@/hooks/useBookings";
import { useAdmin } from "@/hooks/useAdmin";
import type { Json } from "@/integrations/supabase/types";

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

export function AdminPaymentsTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [edits, setEdits] = useState<Record<string, Partial<Gateway>>>({});

  const { data: gateways, isLoading } = useQuery({
    queryKey: ["payment_gateways"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payment_gateways")
        .select("*")
        .order("city")
        .order("sort_order");
      if (error) throw error;
      return data as Gateway[];
    },
  });

  const { data: cities } = useAllCities();

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
      toast({ title: "Gateway Updated", description: "Payment gateway configuration saved." });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const addGateway = useMutation({
    mutationFn: async (gw: { name: string; display_name: string; city: string }) => {
      const { error } = await supabase.from("payment_gateways").insert({
        name: gw.name,
        display_name: gw.display_name,
        city: gw.city,
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
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
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
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const getEdit = (gw: Gateway) => ({ ...gw, ...edits[gw.id] });

  const handleFieldChange = (id: string, field: string, value: string | boolean) => {
    setEdits((prev) => ({
      ...prev,
      [id]: { ...prev[id], [field]: value },
    }));
  };

  const handleSave = (gw: Gateway) => {
    const changes = edits[gw.id];
    if (!changes) return;
    updateGateway.mutate({ id: gw.id, updates: changes });
    setEdits((prev) => {
      const n = { ...prev };
      delete n[gw.id];
      return n;
    });
  };

  const handleToggleActive = (gw: Gateway) => {
    updateGateway.mutate({ id: gw.id, updates: { is_active: !gw.is_active } });
  };

  const handleToggleTestMode = (gw: Gateway) => {
    const merged = getEdit(gw);
    handleFieldChange(gw.id, "is_test_mode", !merged.is_test_mode);
  };

  const maskValue = (val: string | null) => {
    if (!val) return "";
    if (val.length <= 8) return "••••••••";
    return val.slice(0, 4) + "••••" + val.slice(-4);
  };

  if (isLoading) return <Loader2 className="mx-auto h-8 w-8 animate-spin" />;

  // Group gateways by city
  const allCities = Array.from(
    new Set([...(cities ?? []), ...(gateways ?? []).map((g) => g.city)])
  ).sort();

  const gatewaysByCity: Record<string, Gateway[]> = {};
  for (const city of allCities) {
    gatewaysByCity[city] = (gateways ?? []).filter((g) => g.city === city);
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" /> Payment Gateways
          </CardTitle>
          <CardDescription>
            Configure payment gateways per city. Each city can have its own active gateway.
          </CardDescription>
        </CardHeader>
      </Card>

      {allCities.map((city) => {
        const cityGateways = gatewaysByCity[city] ?? [];
        const existingNames = cityGateways.map((g) => g.name);
        const availableTemplates = GATEWAY_TEMPLATES.filter(
          (t) => !existingNames.includes(t.name)
        );

        return (
          <Card key={city}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <MapPin className="h-5 w-5" /> {city}
                  <Badge variant="secondary">{cityGateways.length} gateway{cityGateways.length !== 1 ? "s" : ""}</Badge>
                </CardTitle>
                {availableTemplates.length > 0 && (
                  <Select onValueChange={(name) => {
                    const tpl = GATEWAY_TEMPLATES.find((t) => t.name === name);
                    if (tpl) addGateway.mutate({ ...tpl, city });
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
            </CardHeader>
            <CardContent className="space-y-4">
              {cityGateways.length === 0 && (
                <p className="text-sm text-muted-foreground">No gateways configured for this city yet.</p>
              )}
              {cityGateways.map((gw) => {
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
                        <Switch checked={gw.is_active} onCheckedChange={() => handleToggleActive(gw)} />
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteGateway.mutate(gw.id)}
                          disabled={deleteGateway.isPending}
                        >
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
                            onFocus={() => {
                              if (!edits[gw.id]?.api_key && gw.api_key) {
                                handleFieldChange(gw.id, "api_key", gw.api_key);
                              }
                            }}
                          />
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => setShowSecrets((p) => ({ ...p, [gw.id]: !p[gw.id] }))}
                          >
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
                          onFocus={() => {
                            if (!edits[gw.id]?.api_secret && gw.api_secret) {
                              handleFieldChange(gw.id, "api_secret", gw.api_secret);
                            }
                          }}
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2">
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={merged.is_test_mode}
                          onCheckedChange={() => handleToggleTestMode(gw)}
                          id={`test-${gw.id}`}
                        />
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
      })}
    </div>
  );
}
