import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { Zap, Loader2 } from "lucide-react";
import { useCreateQuickCompetition } from "@/hooks/useQuickCompetitions";

export function QuickCompetitionDialog({
  tenantId,
  onCreated,
}: {
  tenantId: string;
  onCreated?: (id: string) => void;
}) {
  const today = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(`Longest Drive · ${today}`);
  const [unit, setUnit] = useState<"m" | "yd">("m");
  const [maxAttempts, setMaxAttempts] = useState<string>("3");
  const [sponsorEnabled, setSponsorEnabled] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);

  const create = useCreateQuickCompetition();

  function reset() {
    setName(`Longest Drive · ${today}`);
    setUnit("m");
    setMaxAttempts("3");
    setSponsorEnabled(false);
    setLogoFile(null);
  }

  async function handleStart() {
    const result = await create.mutateAsync({
      tenant_id: tenantId,
      name: name.trim(),
      unit,
      max_attempts: maxAttempts === "unlimited" ? 999 : Number(maxAttempts),
      sponsor_enabled: sponsorEnabled,
      sponsor_logo_file: sponsorEnabled ? logoFile : null,
    });
    setOpen(false);
    reset();
    onCreated?.(result.id);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1.5">
          <Zap className="h-4 w-4" /> Quick Competition
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Start a Quick Competition</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="qc-name">Name</Label>
            <Input id="qc-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label>Unit</Label>
            <RadioGroup value={unit} onValueChange={(v) => setUnit(v as "m" | "yd")} className="flex gap-6">
              <div className="flex items-center gap-2">
                <RadioGroupItem value="m" id="u-m" />
                <Label htmlFor="u-m" className="font-normal cursor-pointer">Metres</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="yd" id="u-yd" />
                <Label htmlFor="u-yd" className="font-normal cursor-pointer">Yards</Label>
              </div>
            </RadioGroup>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="qc-attempts">Attempts per player</Label>
            <Input
              id="qc-attempts"
              type="number"
              min={1}
              max={50}
              value={maxAttempts}
              onChange={(e) => setMaxAttempts(e.target.value)}
              className="w-32"
            />
            <p className="text-xs text-muted-foreground">Each player can record up to this many attempts.</p>
          </div>

          <div className="space-y-2 border-t pt-3">
            <div className="flex items-center justify-between">
              <Label htmlFor="qc-sponsor" className="cursor-pointer">Sponsor logo on winner cards</Label>
              <Switch id="qc-sponsor" checked={sponsorEnabled} onCheckedChange={setSponsorEnabled} />
            </div>
            {sponsorEnabled && (
              <Input
                type="file"
                accept="image/png,image/jpeg,image/svg+xml"
                onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
              />
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleStart} disabled={create.isPending || !name.trim()}>
            {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Start"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
