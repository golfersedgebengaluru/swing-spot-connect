import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { CreditCard, Eye, EyeOff, Loader2, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface Gateway {
  id: string;
  name: string;
  display_name: string;
  api_key: string | null;
  api_secret: string | null;
  is_active: boolean;
  is_test_mode: boolean;
  config: Record<string, unknown>;
  sort_order: number;
}

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
      toast({ title: "Gateway Updated", description: "Payment gateway configuration saved." });
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
    const newActive = !gw.is_active;
    updateGateway.mutate({ id: gw.id, updates: { is_active: newActive } });
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

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" /> Payment Gateways
          </CardTitle>
          <CardDescription>
            Configure payment gateways for bay bookings. Enable one or more gateways — the first active one will be the default.
          </CardDescription>
        </CardHeader>
      </Card>

      {(gateways ?? []).map((gw) => {
        const merged = getEdit(gw);
        const hasChanges = !!edits[gw.id];
        const isVisible = showSecrets[gw.id];

        return (
          <Card key={gw.id} className={gw.is_active ? "border-primary/40" : ""}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <CardTitle className="text-lg">{gw.display_name}</CardTitle>
                  {gw.is_active && <Badge className="bg-green-500/15 text-green-600 border-green-300">Active</Badge>}
                  {merged.is_test_mode && <Badge variant="outline" className="text-amber-600 border-amber-300">Test Mode</Badge>}
                </div>
                <Switch checked={gw.is_active} onCheckedChange={() => handleToggleActive(gw)} />
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
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
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
