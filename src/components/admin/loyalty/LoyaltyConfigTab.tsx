import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useLoyaltyConfig, useSaveLoyaltyConfig } from "@/hooks/useLoyalty";

export function LoyaltyConfigTab() {
  const { toast } = useToast();
  const { data: config, isLoading } = useLoyaltyConfig();
  const saveMut = useSaveLoyaltyConfig();
  const [edits, setEdits] = useState<Record<string, string>>({});

  useEffect(() => {
    if (config) {
      const map: Record<string, string> = {};
      config.forEach((c) => { map[c.key] = c.value; });
      setEdits(map);
    }
  }, [config]);

  const handleSave = async () => {
    try {
      for (const c of config ?? []) {
        if (edits[c.key] !== c.value) {
          await saveMut.mutateAsync({ key: c.key, value: edits[c.key], description: c.description ?? undefined });
        }
      }
      toast({ title: "Config saved" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  if (isLoading) return <Loader2 className="mx-auto h-8 w-8 animate-spin" />;

  const configLabels: Record<string, string> = {
    program_name: "Program Name",
    usage_gate_percentage: "Usage Gate (%)",
    points_currency_name: "Points Currency Name",
    is_program_active: "Program Active",
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Global settings for the EDGE Rewards loyalty program.</p>
      <Card>
        <CardHeader><CardTitle className="text-base">Program Settings</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {(config ?? []).map((c) => (
            <div key={c.key} className="grid grid-cols-3 gap-4 items-center">
              <Label className="text-sm">{configLabels[c.key] ?? c.key}</Label>
              <Input
                className="col-span-2"
                value={edits[c.key] ?? ""}
                onChange={(e) => setEdits({ ...edits, [c.key]: e.target.value })}
              />
            </div>
          ))}
          <div className="flex justify-end pt-2">
            <Button onClick={handleSave} disabled={saveMut.isPending}>
              <Save className="mr-2 h-4 w-4" />Save Config
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
