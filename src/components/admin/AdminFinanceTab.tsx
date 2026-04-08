import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Save, MapPin } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useGstProfile, useSaveGstProfile, type GstProfile } from "@/hooks/useInvoices";
import { usePerCityFyToggle } from "@/hooks/useRevenue";
import { INDIAN_STATES, validateGSTIN } from "@/lib/gst-utils";
import { AdminFinancialYearsCard } from "@/components/admin/AdminFinancialYearsCard";
import { InvoiceSettingsCard } from "@/components/admin/InvoiceSettingsCard";
import { CityPaymentsSection } from "@/components/admin/CityPaymentsSection";
import { AdvanceAccountsReport } from "@/components/admin/AdvanceAccountsReport";
import { useAdmin } from "@/hooks/useAdmin";
import { useAllCities } from "@/hooks/useBookings";
import { useAdminCity } from "@/contexts/AdminCityContext";

// Hook to get available cities scoped by role
function useAvailableCities() {
  const { isAdmin, assignedCities } = useAdmin();
  const { data: allCities, isLoading } = useAllCities();
  const cities = isAdmin
    ? allCities
    : (allCities ?? []).filter((c) => assignedCities.includes(c));
  return { data: cities, isLoading };
}


// ─── GST Settings (per-city) ────────────────────────────
function GstSettingsSection({ city }: { city: string }) {
  const { toast } = useToast();
  const { data: profile, isLoading } = useGstProfile(city);
  const save = useSaveGstProfile();
  const [form, setForm] = useState<Partial<GstProfile>>({});
  const [gstinValid, setGstinValid] = useState<boolean | null>(null);

  // Reset form when city changes
  useEffect(() => { setForm({}); setGstinValid(null); }, [city]);

  const getValue = (key: keyof GstProfile) => {
    if (key in form) return String(form[key] ?? "");
    return String(profile?.[key] ?? "");
  };

  const handleGstinChange = (value: string) => {
    const upper = value.toUpperCase();
    setForm((f) => ({ ...f, gstin: upper }));
    if (upper.length === 15) {
      const result = validateGSTIN(upper);
      setGstinValid(result.valid);
      if (result.valid && result.stateCode) {
        const state = INDIAN_STATES.find((s) => s.code === result.stateCode);
        if (state) {
          setForm((f) => ({ ...f, gstin: upper, state: state.name, state_code: state.code }));
        }
      }
    } else {
      setGstinValid(null);
    }
  };

  const handleSave = async () => {
    if (Object.keys(form).length === 0) return;
    try {
      const merged: GstProfile = {
        city,
        legal_name: form.legal_name ?? profile?.legal_name ?? "",
        gstin: form.gstin ?? profile?.gstin ?? "",
        address: form.address ?? profile?.address ?? "",
        state: form.state ?? profile?.state ?? "",
        state_code: form.state_code ?? profile?.state_code ?? "",
        invoice_prefix: form.invoice_prefix ?? profile?.invoice_prefix ?? "INV",
        invoice_start_number: form.invoice_start_number ?? profile?.invoice_start_number ?? 1,
      };
      await save.mutateAsync(merged);
      setForm({});
      toast({ title: "Saved", description: `GST profile updated for ${city}.` });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  if (isLoading) return <Loader2 className="mx-auto h-8 w-8 animate-spin" />;

  return (
    <div className="space-y-6 max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">GST Profile — {city}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Legal Business Name</Label>
            <Input value={getValue("legal_name")} onChange={(e) => setForm((f) => ({ ...f, legal_name: e.target.value }))} className="mt-1" />
          </div>
          <div>
            <Label>GSTIN</Label>
            <div className="relative mt-1">
              <Input
                value={getValue("gstin")}
                onChange={(e) => handleGstinChange(e.target.value)}
                maxLength={15}
                placeholder="22AAAAA0000A1Z5"
                className="pr-20"
              />
              {gstinValid !== null && (
                <span className={`absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium ${gstinValid ? "text-green-600" : "text-destructive"}`}>
                  {gstinValid ? "✓ Valid" : "✗ Invalid"}
                </span>
              )}
            </div>
          </div>
          <div>
            <Label>Registered Address</Label>
            <Input value={getValue("address")} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} className="mt-1" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>State</Label>
              <Select value={getValue("state")} onValueChange={(v) => {
                const state = INDIAN_STATES.find((s) => s.name === v);
                setForm((f) => ({ ...f, state: v, state_code: state?.code ?? "" }));
              }}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select state" /></SelectTrigger>
                <SelectContent>
                  {INDIAN_STATES.map((s) => (
                    <SelectItem key={s.code} value={s.name}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>State Code</Label>
              <Input value={getValue("state_code")} readOnly className="mt-1 bg-muted" />
            </div>
          </div>
          <Button onClick={handleSave} disabled={save.isPending || Object.keys(form).length === 0}>
            {save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save GST Profile
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Invoice Numbering — {city}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>Prefix</Label>
              <Input value={getValue("invoice_prefix")} onChange={(e) => setForm((f) => ({ ...f, invoice_prefix: e.target.value }))} className="mt-1" placeholder="INV" />
              <p className="text-xs text-muted-foreground mt-1">e.g. INV → INV/FY2025-26/0001</p>
            </div>
            <div>
              <Label>Starting Number (new FY)</Label>
              <Input type="number" min={1} value={getValue("invoice_start_number")} onChange={(e) => setForm((f) => ({ ...f, invoice_start_number: parseInt(e.target.value) || 1 }))} className="mt-1" />
            </div>
          </div>
          <Button onClick={handleSave} disabled={save.isPending || Object.keys(form).length === 0}>
            {save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Main Tab ───────────────────────────────────────────
export function AdminFinanceTab() {
  const [tab, setTab] = useState("settings");
  const { isAdmin, isSiteAdmin } = useAdmin();
  const { data: perCityFyEnabled } = usePerCityFyToggle();
  const { data: cities, isLoading: loadingCities } = useAvailableCities();
  const { selectedCity: globalCity } = useAdminCity();
  const [localCity, setLocalCity] = useState<string>("");

  // Show per-city FY tab only when toggle is on AND user is site-admin (or admin)
  const showCityFY = !!perCityFyEnabled;

  // Auto-select first city
  useEffect(() => {
    if (cities?.length && !localCity) {
      setLocalCity(cities[0]);
    }
  }, [cities, localCity]);

  const selectedCity = globalCity || localCity;

  if (loadingCities) return <Loader2 className="mx-auto h-8 w-8 animate-spin" />;

  if (!cities?.length) {
    return <p className="text-center text-muted-foreground py-12">No cities configured. Set up a city in Bay Config first.</p>;
  }

  return (
    <div className="space-y-4">
      {/* City selector - only show when global is "All Cities" */}
      {!globalCity && (
        <div className="flex items-center gap-3">
          <MapPin className="h-4 w-4 text-muted-foreground" />
          <Select value={localCity} onValueChange={setLocalCity}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Select instance" />
            </SelectTrigger>
            <SelectContent>
              {cities.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Badge variant="outline" className="text-xs">{localCity}</Badge>
        </div>
      )}

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList className="flex-wrap">
          <TabsTrigger value="settings">GST Settings</TabsTrigger>
          <TabsTrigger value="invoice_settings">Invoice Template</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
          <TabsTrigger value="advance_accounts">Advance Accounts</TabsTrigger>
          {showCityFY && <TabsTrigger value="financial_year">Financial Year</TabsTrigger>}
        </TabsList>
        <TabsContent value="settings">
          {selectedCity && <GstSettingsSection city={selectedCity} />}
        </TabsContent>
        <TabsContent value="invoice_settings">
          {selectedCity && <InvoiceSettingsCard city={selectedCity} />}
        </TabsContent>
        <TabsContent value="payments">
          {selectedCity && <CityPaymentsSection city={selectedCity} />}
        </TabsContent>
        {showCityFY && (
          <TabsContent value="financial_year">
            {selectedCity && (
              <AdminFinancialYearsCard
                city={selectedCity}
                title={`Financial Year — ${selectedCity}`}
              />
            )}
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
