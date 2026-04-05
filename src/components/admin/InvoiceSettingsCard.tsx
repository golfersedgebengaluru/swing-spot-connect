import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { FileText, Upload, Save, Loader2, X, Image, RotateCcw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useGlobalInvoiceSettings,
  useCityInvoiceSettings,
  useSaveInvoiceSettings,
  useDeleteCityInvoiceSettings,
  uploadInvoiceLogo,
  type InvoiceTemplate,
  type InvoiceSettings,
} from "@/hooks/useInvoiceSettings";

const TEMPLATES: { value: InvoiceTemplate; label: string; description: string }[] = [
  { value: "classic", label: "Classic", description: "Traditional business layout with logo top-left, clean lines" },
  { value: "modern", label: "Modern", description: "Minimal design with accent color bar and bold typography" },
  { value: "compact", label: "Compact", description: "Condensed layout optimised for single-page printing" },
];

interface Props {
  city?: string; // undefined = global settings
}

export function InvoiceSettingsCard({ city }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const isGlobal = !city;
  const { data: globalSettings, isLoading: gl } = useGlobalInvoiceSettings();
  const { data: citySettings, isLoading: cl } = useCityInvoiceSettings(city);
  const saveSettings = useSaveInvoiceSettings();
  const deleteOverride = useDeleteCityInvoiceSettings();
  const fileRef = useRef<HTMLInputElement>(null);

  // Coach name required setting (global only)
  const { data: coachNameRequired } = useQuery({
    queryKey: ["admin_config", "coach_name_required"],
    enabled: isGlobal,
    queryFn: async () => {
      const { data } = await supabase
        .from("admin_config")
        .select("value")
        .eq("key", "coach_name_required")
        .maybeSingle();
      return data?.value === "true";
    },
  });

  const [overrideEnabled, setOverrideEnabled] = useState(false);
  const [template, setTemplate] = useState<InvoiceTemplate | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [footerNote, setFooterNote] = useState<string | null>(null);
  const [terms, setTerms] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const isLoading = gl || (!isGlobal && cl);

  // Determine effective source
  const source = !isGlobal && citySettings ? citySettings : globalSettings;

  useEffect(() => {
    if (!isGlobal) {
      setOverrideEnabled(!!citySettings);
    }
    // Reset local form state on city change
    setTemplate(null);
    setLogoUrl(null);
    setFooterNote(null);
    setTerms(null);
  }, [city, citySettings, isGlobal]);

  const currentTemplate = template ?? source?.template ?? "classic";
  const currentLogo = logoUrl ?? source?.logo_url ?? "";
  const currentFooter = footerNote ?? source?.footer_note ?? "";
  const currentTerms = terms ?? source?.terms ?? "";

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const allowed = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];
    if (!allowed.includes(file.type)) {
      toast({ title: "Invalid file", description: "Upload a PNG, JPEG, WebP or SVG image.", variant: "destructive" });
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: "File too large", description: "Logo must be under 2MB.", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const url = await uploadInvoiceLogo(file);
      setLogoUrl(url);
      toast({ title: "Logo uploaded" });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleSave = async () => {
    try {
      await saveSettings.mutateAsync({
        id: (!isGlobal && citySettings?.id) || (isGlobal && globalSettings?.id) || undefined,
        city: city ?? null,
        template: currentTemplate,
        logo_url: currentLogo,
        footer_note: currentFooter,
        terms: currentTerms,
      });
      toast({ title: "Invoice settings saved" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleRevertToGlobal = async () => {
    if (!city) return;
    try {
      await deleteOverride.mutateAsync(city);
      setOverrideEnabled(false);
      setTemplate(null);
      setLogoUrl(null);
      setFooterNote(null);
      setTerms(null);
      toast({ title: "Reverted", description: `${city} now inherits global invoice settings.` });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleOverrideToggle = (checked: boolean) => {
    if (!checked && citySettings) {
      handleRevertToGlobal();
    } else {
      setOverrideEnabled(checked);
    }
  };

  if (isLoading) return <Loader2 className="mx-auto h-8 w-8 animate-spin" />;

  // For per-city: show override toggle. If override is off, show inherited notice.
  const showForm = isGlobal || overrideEnabled;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          {isGlobal ? "Invoice Settings (Global Default)" : `Invoice Settings — ${city}`}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Per-city override toggle */}
        {!isGlobal && (
          <div className="flex items-center justify-between rounded-lg border border-border p-4">
            <div>
              <p className="text-sm font-medium text-foreground">Custom settings for {city}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {overrideEnabled
                  ? "This instance uses its own invoice template, logo, and footer."
                  : "Inheriting from global defaults. Enable to customise for this instance."}
              </p>
            </div>
            <Switch checked={overrideEnabled} onCheckedChange={handleOverrideToggle} />
          </div>
        )}

        {!showForm ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Using global invoice settings. Toggle the override above to customise.
          </p>
        ) : (
          <>
            {/* Template Selection */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">Invoice Template</Label>
              <RadioGroup value={currentTemplate} onValueChange={(v) => setTemplate(v as InvoiceTemplate)} className="grid gap-3 sm:grid-cols-3">
                {TEMPLATES.map((t) => (
                  <label
                    key={t.value}
                    className={`relative flex flex-col rounded-lg border-2 p-4 cursor-pointer transition-colors ${
                      currentTemplate === t.value
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-muted-foreground/30"
                    }`}
                  >
                    <RadioGroupItem value={t.value} className="sr-only" />
                    <span className="text-sm font-semibold text-foreground">{t.label}</span>
                    <span className="text-xs text-muted-foreground mt-1">{t.description}</span>
                  </label>
                ))}
              </RadioGroup>
            </div>

            {/* Logo Upload */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">Invoice Logo</Label>
              <div className="flex items-start gap-4">
                {currentLogo ? (
                  <div className="relative w-24 h-24 rounded-lg border border-border bg-muted/30 flex items-center justify-center overflow-hidden">
                    <img src={currentLogo} alt="Invoice logo" className="max-w-full max-h-full object-contain p-1" />
                    <button
                      className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full p-0.5"
                      onClick={() => setLogoUrl("")}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  <div className="w-24 h-24 rounded-lg border-2 border-dashed border-border flex items-center justify-center text-muted-foreground">
                    <Image className="h-8 w-8" />
                  </div>
                )}
                <div className="flex-1 space-y-2">
                  <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
                    {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                    {currentLogo ? "Change Logo" : "Upload Logo"}
                  </Button>
                  <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={handleLogoUpload} />
                  <p className="text-xs text-muted-foreground">PNG, JPEG, WebP or SVG. Max 2MB. Recommended: 300×100px.</p>
                </div>
              </div>
            </div>

            {/* Footer Note */}
            <div className="space-y-2">
              <Label htmlFor="invoice-footer" className="text-sm font-medium">Footer Note</Label>
              <Input
                id="invoice-footer"
                placeholder="e.g. Thank you for your business!"
                value={currentFooter}
                onChange={(e) => setFooterNote(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Appears at the bottom of every invoice.</p>
            </div>

            {/* Terms & Conditions */}
            <div className="space-y-2">
              <Label htmlFor="invoice-terms" className="text-sm font-medium">Terms & Conditions</Label>
              <Textarea
                id="invoice-terms"
                placeholder="e.g. Payment is due within 30 days."
                value={currentTerms}
                onChange={(e) => setTerms(e.target.value)}
                rows={3}
              />
              <p className="text-xs text-muted-foreground">Printed below the totals section.</p>
            </div>

            {/* Booking Options (global only) */}
            {isGlobal && (
              <div className="space-y-3">
                <Label className="text-sm font-medium">Booking Invoice Options</Label>
                <div className="flex items-center justify-between rounded-lg border border-border p-4">
                  <div>
                    <p className="text-sm font-medium text-foreground">Require Coach Name</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      When enabled, coach name is mandatory for coaching session invoices.
                    </p>
                  </div>
                  <Switch
                    checked={coachNameRequired ?? false}
                    onCheckedChange={async (checked) => {
                      try {
                        await (supabase as any)
                          .from("admin_config")
                          .upsert({ key: "coach_name_required", value: checked ? "true" : "false" }, { onConflict: "key" });
                        qc.invalidateQueries({ queryKey: ["admin_config", "coach_name_required"] });
                        toast({ title: checked ? "Coach name is now required" : "Coach name is now optional" });
                      } catch (err: any) {
                        toast({ title: "Error", description: err.message, variant: "destructive" });
                      }
                    }}
                  />
                </div>
              </div>
            )}
            <div className="flex items-center gap-2">
              <Button onClick={handleSave} disabled={saveSettings.isPending}>
                {saveSettings.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving...</> : <><Save className="mr-2 h-4 w-4" />Save Settings</>}
              </Button>
              {!isGlobal && overrideEnabled && citySettings && (
                <Button variant="outline" onClick={handleRevertToGlobal} disabled={deleteOverride.isPending}>
                  <RotateCcw className="mr-2 h-4 w-4" /> Revert to Global
                </Button>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
