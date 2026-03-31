import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { FileText, Upload, Save, Loader2, X, Image } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  useInvoiceSettings,
  useSaveInvoiceSettings,
  uploadInvoiceLogo,
  type InvoiceTemplate,
} from "@/hooks/useInvoiceSettings";

const TEMPLATES: { value: InvoiceTemplate; label: string; description: string }[] = [
  { value: "classic", label: "Classic", description: "Traditional business layout with logo top-left, clean lines" },
  { value: "modern", label: "Modern", description: "Minimal design with accent color bar and bold typography" },
  { value: "compact", label: "Compact", description: "Condensed layout optimised for single-page printing" },
];

export function InvoiceSettingsCard() {
  const { toast } = useToast();
  const { data: settings, isLoading } = useInvoiceSettings();
  const saveSettings = useSaveInvoiceSettings();
  const fileRef = useRef<HTMLInputElement>(null);

  const [template, setTemplate] = useState<InvoiceTemplate | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [footerNote, setFooterNote] = useState<string | null>(null);
  const [terms, setTerms] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const currentTemplate = template ?? settings?.invoice_template ?? "classic";
  const currentLogo = logoUrl ?? settings?.invoice_logo_url ?? "";
  const currentFooter = footerNote ?? settings?.invoice_footer_note ?? "";
  const currentTerms = terms ?? settings?.invoice_terms ?? "";

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
        invoice_template: currentTemplate,
        invoice_logo_url: currentLogo,
        invoice_footer_note: currentFooter,
        invoice_terms: currentTerms,
      });
      toast({ title: "Invoice settings saved" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  if (isLoading) return <Loader2 className="mx-auto h-8 w-8 animate-spin" />;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" /> Invoice Settings
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
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
              <p className="text-xs text-muted-foreground">PNG, JPEG, WebP or SVG. Max 2MB. Recommended: 300×100px or similar landscape ratio.</p>
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
            placeholder="e.g. Payment is due within 30 days. All prices include applicable GST."
            value={currentTerms}
            onChange={(e) => setTerms(e.target.value)}
            rows={3}
          />
          <p className="text-xs text-muted-foreground">Printed below the totals section on every invoice.</p>
        </div>

        <Button onClick={handleSave} disabled={saveSettings.isPending}>
          {saveSettings.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving...</> : <><Save className="mr-2 h-4 w-4" />Save Settings</>}
        </Button>
      </CardContent>
    </Card>
  );
}
