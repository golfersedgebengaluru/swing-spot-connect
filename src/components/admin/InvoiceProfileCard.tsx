import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { FileText, Save, Loader2, Upload, X, Image as ImageIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useGstProfile, useSaveGstProfile, type GstProfile } from "@/hooks/useInvoices";
import {
  useCityInvoiceSettings,
  useGlobalInvoiceSettings,
  useSaveInvoiceSettings,
  uploadInvoiceLogo,
  type InvoiceTemplate,
} from "@/hooks/useInvoiceSettings";
import {
  useCityInvoiceProfile,
  useSaveCityInvoiceProfile,
  readSignatureFile,
  type CityInvoiceProfile,
} from "@/hooks/useCityInvoiceProfile";
import { INDIAN_STATES, validateGSTIN } from "@/lib/gst-utils";

const TEMPLATES: { value: InvoiceTemplate; label: string }[] = [
  { value: "classic", label: "Classic" },
  { value: "modern", label: "Modern" },
  { value: "compact", label: "Compact" },
];

// Lightweight validators — server (RLS/triggers) is the source of truth;
// these keep bad data from being submitted in the first place.
const panRe = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const ifscRe = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const upiRe = /^[\w.\-]{2,}@[a-zA-Z]{2,}$/;
const pincodeRe = /^[0-9]{6}$/;
const emailSchema = z.string().email().max(255);
const urlSchema = z.string().max(255).refine(
  (v) => !v || /^https?:\/\//i.test(v),
  "Website must start with http(s)://",
);

export function InvoiceProfileCard({ city }: { city: string }) {
  const { toast } = useToast();
  const { data: gst, isLoading: gL } = useGstProfile(city);
  const { data: citySettings, isLoading: csL } = useCityInvoiceSettings(city);
  const { data: globalSettings, isLoading: gsL } = useGlobalInvoiceSettings();
  const { data: extras, isLoading: xL } = useCityInvoiceProfile(city);

  const saveGst = useSaveGstProfile();
  const saveSettings = useSaveInvoiceSettings();
  const saveExtras = useSaveCityInvoiceProfile();

  const [g, setG] = useState<Partial<GstProfile>>({});
  const [t, setT] = useState<{ template?: InvoiceTemplate; logo_url?: string; footer_note?: string; terms?: string }>({});
  const [x, setX] = useState<Partial<CityInvoiceProfile>>({});
  const [uploading, setUploading] = useState<null | "logo" | "signature">(null);
  const logoRef = useRef<HTMLInputElement>(null);
  const sigRef = useRef<HTMLInputElement>(null);
  const [gstinValid, setGstinValid] = useState<boolean | null>(null);

  useEffect(() => {
    setG({}); setT({}); setX({}); setGstinValid(null);
  }, [city]);

  const isLoading = gL || csL || gsL || xL;
  if (isLoading) return <Loader2 className="mx-auto h-8 w-8 animate-spin" />;

  // Effective values (form overrides → city override → global → empty)
  const effSettings = citySettings ?? globalSettings;
  const get = <K extends keyof GstProfile>(k: K) => (g[k] ?? gst?.[k] ?? "") as any;
  const getT = <K extends keyof typeof t>(k: K) =>
    (t[k] ?? (effSettings as any)?.[k] ?? "") as any;
  const getX = <K extends keyof CityInvoiceProfile>(k: K) =>
    (x[k] !== undefined ? x[k] : (extras?.[k] ?? "")) as any;
  const getXBool = (k: keyof CityInvoiceProfile) =>
    Boolean(x[k] !== undefined ? x[k] : extras?.[k]);

  const handleGstin = (v: string) => {
    const upper = v.toUpperCase();
    setG((f) => ({ ...f, gstin: upper }));
    if (upper.length === 15) {
      const r = validateGSTIN(upper);
      setGstinValid(r.valid);
      if (r.valid && r.stateCode) {
        const st = INDIAN_STATES.find((s) => s.code === r.stateCode);
        if (st) setG((f) => ({ ...f, gstin: upper, state: st.name, state_code: st.code }));
      }
    } else setGstinValid(null);
  };

  const handleLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setUploading("logo");
    try {
      const url = await uploadInvoiceLogo(file);
      setT((s) => ({ ...s, logo_url: url }));
      toast({ title: "Logo uploaded" });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploading(null);
      if (logoRef.current) logoRef.current.value = "";
    }
  };

  const handleSignature = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setUploading("signature");
    try {
      const url = await readSignatureFile(file);
      setX((s) => ({ ...s, signature_url: url }));
      toast({ title: "Signature uploaded" });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploading(null);
      if (sigRef.current) sigRef.current.value = "";
    }
  };

  const validate = (): string | null => {
    const pan = getX("pan"); if (pan && !panRe.test(pan)) return "PAN format is invalid (e.g. ABCDE1234F).";
    const ifsc = getX("bank_ifsc"); if (ifsc && !ifscRe.test(ifsc)) return "IFSC format is invalid (e.g. HDFC0001234).";
    const upi = getX("upi_id"); if (upi && !upiRe.test(upi)) return "UPI ID format is invalid (e.g. name@bank).";
    const pin = getX("pincode"); if (pin && !pincodeRe.test(pin)) return "Pincode must be 6 digits.";
    const email = getX("email"); if (email && !emailSchema.safeParse(email).success) return "Email is invalid.";
    const web = getX("website"); if (web && !urlSchema.safeParse(web).success) return "Website must start with http(s)://";
    const gstin = get("gstin");
    if (gstin && gstin.length === 15 && !validateGSTIN(gstin).valid) return "GSTIN checksum is invalid.";
    return null;
  };

  const handleSave = async () => {
    const err = validate();
    if (err) { toast({ title: "Fix validation", description: err, variant: "destructive" }); return; }
    try {
      // 1) GST profile (legal identity + numbering)
      const mergedGst: GstProfile = {
        city,
        legal_name: get("legal_name"),
        gstin: get("gstin"),
        address: get("address"),
        state: get("state"),
        state_code: get("state_code"),
        invoice_prefix: get("invoice_prefix") || "INV",
        invoice_start_number: Number(get("invoice_start_number")) || 1,
      };
      // 2) Per-city template/logo/footer/terms
      // 3) Extended profile (contact, bank, signature, etc.)
      const mergedX: CityInvoiceProfile = {
        city,
        trade_name: getX("trade_name"),
        pan: getX("pan"),
        cin: getX("cin"),
        msme_no: getX("msme_no"),
        address_line2: getX("address_line2"),
        pincode: getX("pincode"),
        country: getX("country") || "India",
        phone: getX("phone"),
        email: getX("email"),
        website: getX("website"),
        signature_url: getX("signature_url"),
        authorised_signatory_name: getX("authorised_signatory_name"),
        brand_color: getX("brand_color"),
        show_signature: getXBool("show_signature"),
        bank_name: getX("bank_name"),
        bank_account_holder: getX("bank_account_holder"),
        bank_account_no: getX("bank_account_no"),
        bank_ifsc: getX("bank_ifsc"),
        bank_branch: getX("bank_branch"),
        bank_swift: getX("bank_swift"),
        upi_id: getX("upi_id"),
        show_upi_qr: getXBool("show_upi_qr"),
        default_place_of_supply: getX("default_place_of_supply"),
        reverse_charge_default: getXBool("reverse_charge_default"),
        payment_terms_label: getX("payment_terms_label"),
        due_date_offset_days: Number(getX("due_date_offset_days")) || 0,
        payment_instructions: getX("payment_instructions"),
        declaration: getX("declaration"),
        jurisdiction: getX("jurisdiction"),
        copy_labels: Array.isArray(extras?.copy_labels) ? extras.copy_labels : [],
        einvoice_enabled: getXBool("einvoice_enabled"),
      };
      await Promise.all([
        saveGst.mutateAsync(mergedGst),
        saveSettings.mutateAsync({
          id: citySettings?.id,
          city,
          template: getT("template") || "classic",
          logo_url: getT("logo_url"),
          footer_note: getT("footer_note"),
          terms: getT("terms"),
        }),
        saveExtras.mutateAsync(mergedX),
      ]);
      setG({}); setT({}); setX({});
      toast({ title: "Invoice profile saved", description: `Updated all invoice settings for ${city}.` });
    } catch (err: any) {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    }
  };

  const completeness = computeCompleteness(get, getT, getX);

  return (
    <Card className="max-w-3xl">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2"><FileText className="h-5 w-5" /> Invoice Profile — {city}</span>
          <span className={`text-xs px-2 py-1 rounded-md ${completeness === 100 ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}`}>
            {completeness}% complete
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Accordion type="multiple" defaultValue={["business", "tax"]} className="w-full">
          {/* ─── BUSINESS ─── */}
          <AccordionItem value="business">
            <AccordionTrigger>Business Identity & Contact</AccordionTrigger>
            <AccordionContent className="space-y-4 pt-2">
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Legal Business Name *"><Input value={get("legal_name")} onChange={(e) => setG((f) => ({ ...f, legal_name: e.target.value }))} /></Field>
                <Field label="Trade Name"><Input value={getX("trade_name")} onChange={(e) => setX((s) => ({ ...s, trade_name: e.target.value }))} /></Field>
                <Field label="GSTIN *">
                  <div className="relative">
                    <Input value={get("gstin")} maxLength={15} onChange={(e) => handleGstin(e.target.value)} placeholder="22AAAAA0000A1Z5" />
                    {gstinValid !== null && (
                      <span className={`absolute right-3 top-1/2 -translate-y-1/2 text-xs ${gstinValid ? "text-green-600" : "text-destructive"}`}>
                        {gstinValid ? "✓" : "✗"}
                      </span>
                    )}
                  </div>
                </Field>
                <Field label="PAN"><Input value={getX("pan")} onChange={(e) => setX((s) => ({ ...s, pan: e.target.value.toUpperCase() }))} placeholder="ABCDE1234F" /></Field>
                <Field label="CIN"><Input value={getX("cin")} onChange={(e) => setX((s) => ({ ...s, cin: e.target.value.toUpperCase() }))} /></Field>
                <Field label="MSME / Udyam Reg No."><Input value={getX("msme_no")} onChange={(e) => setX((s) => ({ ...s, msme_no: e.target.value }))} /></Field>
              </div>
              <Field label="Registered Address *"><Input value={get("address")} onChange={(e) => setG((f) => ({ ...f, address: e.target.value }))} /></Field>
              <div className="grid sm:grid-cols-3 gap-4">
                <Field label="Address Line 2"><Input value={getX("address_line2")} onChange={(e) => setX((s) => ({ ...s, address_line2: e.target.value }))} /></Field>
                <Field label="Pincode"><Input value={getX("pincode")} onChange={(e) => setX((s) => ({ ...s, pincode: e.target.value }))} maxLength={6} /></Field>
                <Field label="Country"><Input value={getX("country") || "India"} onChange={(e) => setX((s) => ({ ...s, country: e.target.value }))} /></Field>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="State *">
                  <Select value={get("state")} onValueChange={(v) => {
                    const st = INDIAN_STATES.find((s) => s.name === v);
                    setG((f) => ({ ...f, state: v, state_code: st?.code ?? "" }));
                  }}>
                    <SelectTrigger><SelectValue placeholder="Select state" /></SelectTrigger>
                    <SelectContent>{INDIAN_STATES.map((s) => <SelectItem key={s.code} value={s.name}>{s.name}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
                <Field label="State Code"><Input value={get("state_code")} readOnly className="bg-muted" /></Field>
              </div>
              <div className="grid sm:grid-cols-3 gap-4">
                <Field label="Phone"><Input value={getX("phone")} onChange={(e) => setX((s) => ({ ...s, phone: e.target.value }))} /></Field>
                <Field label="Email"><Input type="email" value={getX("email")} onChange={(e) => setX((s) => ({ ...s, email: e.target.value }))} /></Field>
                <Field label="Website"><Input value={getX("website")} onChange={(e) => setX((s) => ({ ...s, website: e.target.value }))} placeholder="https://…" /></Field>
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* ─── TAX ─── */}
          <AccordionItem value="tax">
            <AccordionTrigger>Tax Defaults</AccordionTrigger>
            <AccordionContent className="space-y-4 pt-2">
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Default Place of Supply"><Input value={getX("default_place_of_supply")} onChange={(e) => setX((s) => ({ ...s, default_place_of_supply: e.target.value }))} /></Field>
                <Field label="Reverse Charge Default">
                  <Switch checked={getXBool("reverse_charge_default")} onCheckedChange={(c) => setX((s) => ({ ...s, reverse_charge_default: c }))} />
                </Field>
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* ─── BANK ─── */}
          <AccordionItem value="bank">
            <AccordionTrigger>Bank & Payment Details</AccordionTrigger>
            <AccordionContent className="space-y-4 pt-2">
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Bank Name"><Input value={getX("bank_name")} onChange={(e) => setX((s) => ({ ...s, bank_name: e.target.value }))} /></Field>
                <Field label="Account Holder"><Input value={getX("bank_account_holder")} onChange={(e) => setX((s) => ({ ...s, bank_account_holder: e.target.value }))} /></Field>
                <Field label="Account Number"><Input value={getX("bank_account_no")} onChange={(e) => setX((s) => ({ ...s, bank_account_no: e.target.value }))} /></Field>
                <Field label="IFSC"><Input value={getX("bank_ifsc")} onChange={(e) => setX((s) => ({ ...s, bank_ifsc: e.target.value.toUpperCase() }))} placeholder="HDFC0001234" /></Field>
                <Field label="Branch"><Input value={getX("bank_branch")} onChange={(e) => setX((s) => ({ ...s, bank_branch: e.target.value }))} /></Field>
                <Field label="SWIFT (optional)"><Input value={getX("bank_swift")} onChange={(e) => setX((s) => ({ ...s, bank_swift: e.target.value.toUpperCase() }))} /></Field>
                <Field label="UPI ID"><Input value={getX("upi_id")} onChange={(e) => setX((s) => ({ ...s, upi_id: e.target.value }))} placeholder="business@bank" /></Field>
              </div>
              <div className="grid sm:grid-cols-3 gap-4">
                <Field label="Payment Terms (label)"><Input value={getX("payment_terms_label")} onChange={(e) => setX((s) => ({ ...s, payment_terms_label: e.target.value }))} placeholder="Net 15" /></Field>
                <Field label="Due Days Offset"><Input type="number" min={0} value={getX("due_date_offset_days") || ""} onChange={(e) => setX((s) => ({ ...s, due_date_offset_days: Number(e.target.value) || 0 }))} /></Field>
                <Field label="Show UPI QR">
                  <Switch checked={getXBool("show_upi_qr")} onCheckedChange={(c) => setX((s) => ({ ...s, show_upi_qr: c }))} />
                </Field>
              </div>
              <Field label="Payment Instructions"><Textarea value={getX("payment_instructions")} onChange={(e) => setX((s) => ({ ...s, payment_instructions: e.target.value }))} rows={2} /></Field>
            </AccordionContent>
          </AccordionItem>

          {/* ─── TEMPLATE ─── */}
          <AccordionItem value="template">
            <AccordionTrigger>Template, Logo & Signature</AccordionTrigger>
            <AccordionContent className="space-y-4 pt-2">
              <Field label="Template">
                <Select value={getT("template") || "classic"} onValueChange={(v) => setT((s) => ({ ...s, template: v as InvoiceTemplate }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{TEMPLATES.map((tt) => <SelectItem key={tt.value} value={tt.value}>{tt.label}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="Logo">
                <div className="flex gap-3 items-start">
                  {getT("logo_url") ? (
                    <div className="relative w-24 h-24 rounded border bg-muted/30 flex items-center justify-center overflow-hidden">
                      <img src={getT("logo_url")} alt="Logo" className="max-w-full max-h-full object-contain p-1" />
                      <button type="button" className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full p-0.5" onClick={() => setT((s) => ({ ...s, logo_url: "" }))}><X className="h-3 w-3" /></button>
                    </div>
                  ) : (
                    <div className="w-24 h-24 rounded border-2 border-dashed flex items-center justify-center text-muted-foreground"><ImageIcon className="h-8 w-8" /></div>
                  )}
                  <div>
                    <Button type="button" variant="outline" size="sm" onClick={() => logoRef.current?.click()} disabled={uploading === "logo"}>
                      {uploading === "logo" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />} Upload Logo
                    </Button>
                    <input ref={logoRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={handleLogo} />
                    <p className="text-xs text-muted-foreground mt-2">PNG/JPEG/WebP/SVG · max 500 KB.</p>
                  </div>
                </div>
              </Field>
              <Field label="Authorised Signatory Name"><Input value={getX("authorised_signatory_name")} onChange={(e) => setX((s) => ({ ...s, authorised_signatory_name: e.target.value }))} /></Field>
              <Field label="Signature Image">
                <div className="flex gap-3 items-start">
                  {getX("signature_url") ? (
                    <div className="relative h-16 w-40 rounded border bg-muted/30 flex items-center justify-center overflow-hidden">
                      <img src={getX("signature_url")} alt="Signature" className="max-w-full max-h-full object-contain p-1" />
                      <button type="button" className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full p-0.5" onClick={() => setX((s) => ({ ...s, signature_url: "" }))}><X className="h-3 w-3" /></button>
                    </div>
                  ) : (
                    <div className="h-16 w-40 rounded border-2 border-dashed flex items-center justify-center text-muted-foreground"><ImageIcon className="h-6 w-6" /></div>
                  )}
                  <div>
                    <Button type="button" variant="outline" size="sm" onClick={() => sigRef.current?.click()} disabled={uploading === "signature"}>
                      {uploading === "signature" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />} Upload Signature
                    </Button>
                    <input ref={sigRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={handleSignature} />
                    <p className="text-xs text-muted-foreground mt-2">PNG/JPEG/WebP/SVG · max 200 KB.</p>
                  </div>
                </div>
              </Field>
              <div className="flex items-center justify-between rounded border p-3">
                <Label>Show signature on invoices</Label>
                <Switch checked={getXBool("show_signature")} onCheckedChange={(c) => setX((s) => ({ ...s, show_signature: c }))} />
              </div>
              <Field label="Brand Accent Color (modern template)"><Input value={getX("brand_color")} onChange={(e) => setX((s) => ({ ...s, brand_color: e.target.value }))} placeholder="#2563eb" /></Field>
              <Field label="Footer Note"><Input value={getT("footer_note")} onChange={(e) => setT((s) => ({ ...s, footer_note: e.target.value }))} placeholder="Thank you for your business!" /></Field>
              <Field label="Terms & Conditions"><Textarea rows={3} value={getT("terms")} onChange={(e) => setT((s) => ({ ...s, terms: e.target.value }))} /></Field>
              <Field label="Declaration"><Textarea rows={2} value={getX("declaration")} onChange={(e) => setX((s) => ({ ...s, declaration: e.target.value }))} placeholder="We declare that this invoice shows the actual price…" /></Field>
              <Field label="Jurisdiction"><Input value={getX("jurisdiction")} onChange={(e) => setX((s) => ({ ...s, jurisdiction: e.target.value }))} placeholder="Subject to Bengaluru jurisdiction" /></Field>
            </AccordionContent>
          </AccordionItem>

          {/* ─── NUMBERING ─── */}
          <AccordionItem value="numbering">
            <AccordionTrigger>Invoice Numbering</AccordionTrigger>
            <AccordionContent className="space-y-4 pt-2">
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Prefix"><Input value={get("invoice_prefix") || "INV"} onChange={(e) => setG((f) => ({ ...f, invoice_prefix: e.target.value }))} /></Field>
                <Field label="Starting Number (new FY)"><Input type="number" min={1} value={get("invoice_start_number") || 1} onChange={(e) => setG((f) => ({ ...f, invoice_start_number: Number(e.target.value) || 1 }))} /></Field>
              </div>
              <p className="text-xs text-muted-foreground">Tax Invoices, Credit Notes, and Proformas each maintain their own counter to avoid number collisions.</p>
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        <div className="mt-6 flex items-center gap-2">
          <Button onClick={handleSave} disabled={saveGst.isPending || saveSettings.isPending || saveExtras.isPending}>
            {(saveGst.isPending || saveSettings.isPending || saveExtras.isPending) ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save Invoice Profile
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function computeCompleteness(
  get: (k: keyof GstProfile) => string,
  getT: (k: any) => string,
  getX: (k: keyof CityInvoiceProfile) => string,
): number {
  const required = [
    get("legal_name"), get("gstin"), get("address"), get("state"),
    getT("template"),
    getX("phone"), getX("email"),
    getX("bank_name"), getX("bank_account_no"), getX("bank_ifsc"),
  ];
  const filled = required.filter((v) => String(v || "").trim().length > 0).length;
  return Math.round((filled / required.length) * 100);
}
