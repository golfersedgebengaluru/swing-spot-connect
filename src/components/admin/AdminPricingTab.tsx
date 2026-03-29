import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Save, IndianRupee, Package, Link2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useBayPricing, useUpsertBayPricing, useHourPackages, useUpdateHourPackage } from "@/hooks/usePricing";
import { useBays } from "@/hooks/useBookings";
import { useAllProducts } from "@/hooks/useProducts";

const SESSION_TYPES = [
  { key: "individual", label: "Individual / Single" },
  { key: "couple", label: "Couple / 2 Pax" },
  { key: "group", label: "Group / 3-6 Pax" },
];

const DAY_TYPES = [
  { key: "weekday", label: "Weekday" },
  { key: "weekend", label: "Weekend" },
];

function BayPricingSection() {
  const { toast } = useToast();
  const { data: pricing, isLoading } = useBayPricing();
  const { data: bays } = useBays();
  const upsert = useUpsertBayPricing();
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [selectedCity, setSelectedCity] = useState<string>("");

  const cities = useMemo(() => {
    const set = new Set((bays ?? []).map((b: any) => b.city));
    return Array.from(set).sort();
  }, [bays]);

  const effectiveCity = selectedCity || cities[0] || "";

  // Build a map: `${day_type}_${session_type}` → pricing row
  const pricingMap = useMemo(() => {
    const map: Record<string, any> = {};
    (pricing ?? [])
      .filter((p: any) => p.city === effectiveCity)
      .forEach((p: any) => {
        map[`${p.day_type}_${p.session_type}`] = p;
      });
    return map;
  }, [pricing, effectiveCity]);

  const getKey = (day: string, session: string) => `${day}_${session}`;

  const getValue = (day: string, session: string) => {
    const k = getKey(day, session);
    if (edits[k] !== undefined) return edits[k];
    return pricingMap[k]?.price_per_hour?.toString() ?? "0";
  };

  const handleChange = (day: string, session: string, value: string) => {
    setEdits((prev) => ({ ...prev, [getKey(day, session)]: value }));
  };

  const handleSave = async () => {
    const promises: Promise<void>[] = [];
    for (const day of DAY_TYPES) {
      for (const session of SESSION_TYPES) {
        const k = getKey(day.key, session.key);
        const val = edits[k];
        if (val === undefined) continue;
        promises.push(
          upsert.mutateAsync({
            city: effectiveCity,
            day_type: day.key,
            session_type: session.key,
            label: session.label,
            price_per_hour: parseFloat(val) || 0,
            currency: "INR",
          })
        );
      }
    }
    if (promises.length === 0) {
      toast({ title: "No changes", description: "Nothing to save." });
      return;
    }
    try {
      await Promise.all(promises);
      setEdits({});
      toast({ title: "Saved", description: "Bay pricing updated." });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  if (isLoading) return <Loader2 className="mx-auto h-8 w-8 animate-spin" />;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <IndianRupee className="h-4 w-4" /> Bay Session Pricing
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {cities.length > 1 && (
          <div>
            <Label>City</Label>
            <Select value={effectiveCity} onValueChange={setSelectedCity}>
              <SelectTrigger className="mt-1 max-w-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {cities.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {effectiveCity && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[400px]">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 px-3 text-muted-foreground font-medium">Session Type</th>
                  {DAY_TYPES.map((d) => (
                    <th key={d.key} className="text-left py-2 px-3 text-muted-foreground font-medium">{d.label} (₹/hr)</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {SESSION_TYPES.map((session) => (
                  <tr key={session.key} className="border-b border-border/50">
                    <td className="py-2 px-3 font-medium text-foreground">{session.label}</td>
                    {DAY_TYPES.map((day) => (
                      <td key={day.key} className="py-2 px-3">
                        <Input
                          type="number"
                          min={0}
                          className="w-28"
                          value={getValue(day.key, session.key)}
                          onChange={(e) => handleChange(day.key, session.key, e.target.value)}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Button onClick={handleSave} disabled={upsert.isPending || Object.keys(edits).length === 0}>
          {upsert.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Save Pricing
        </Button>
      </CardContent>
    </Card>
  );
}

function HourPackagesSection() {
  const { toast } = useToast();
  const { data: packages, isLoading } = useHourPackages();
  const update = useUpdateHourPackage();
  const [edits, setEdits] = useState<Record<string, any>>({});

  const getField = (pkg: any, field: string) => {
    return edits[pkg.id]?.[field] ?? pkg[field];
  };

  const handleField = (id: string, field: string, value: any) => {
    setEdits((prev) => ({
      ...prev,
      [id]: { ...(prev[id] || {}), [field]: value },
    }));
  };

  const handleSave = async (id: string) => {
    const changes = edits[id];
    if (!changes) return;
    try {
      await update.mutateAsync({
        id,
        ...(changes.label !== undefined && { label: changes.label }),
        ...(changes.price !== undefined && { price: parseFloat(changes.price) || 0 }),
        ...(changes.is_active !== undefined && { is_active: changes.is_active }),
      });
      setEdits((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      toast({ title: "Saved", description: "Hour package updated." });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  if (isLoading) return <Loader2 className="mx-auto h-8 w-8 animate-spin" />;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Package className="h-4 w-4" /> Hour Packages
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {(packages ?? []).map((pkg: any) => (
            <div
              key={pkg.id}
              className="flex flex-col sm:flex-row sm:items-end gap-3 rounded-lg border border-border/50 p-4"
            >
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-xs">{pkg.hours}h</Badge>
                  {pkg.hours === 25 && (
                    <Badge className="text-xs bg-amber-100 text-amber-800 hover:bg-amber-100">Birdie Member</Badge>
                  )}
                </div>
                <div>
                  <Label className="text-xs">Label</Label>
                  <Input
                    className="mt-0.5"
                    value={getField(pkg, "label")}
                    onChange={(e) => handleField(pkg.id, "label", e.target.value)}
                  />
                </div>
              </div>
              <div className="w-32">
                <Label className="text-xs">Price (₹)</Label>
                <Input
                  type="number"
                  min={0}
                  className="mt-0.5"
                  value={getField(pkg, "price")}
                  onChange={(e) => handleField(pkg.id, "price", e.target.value)}
                />
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-xs">Active</Label>
                <Switch
                  checked={getField(pkg, "is_active")}
                  onCheckedChange={(v) => handleField(pkg.id, "is_active", v)}
                />
              </div>
              <Button
                size="sm"
                onClick={() => handleSave(pkg.id)}
                disabled={!edits[pkg.id] || update.isPending}
              >
                {update.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function AdminPricingTab() {
  return (
    <div className="space-y-6">
      <BayPricingSection />
      <HourPackagesSection />
    </div>
  );
}
