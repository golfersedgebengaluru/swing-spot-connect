import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Per-city extension of invoice configuration. Lives alongside the legacy
 * `gst_profiles` (legal identity + numbering) and `invoice_settings`
 * (template + logo + footer + terms) tables. This overlay holds every
 * additional field a standard tax invoice needs — contact, bank, UPI,
 * signature, payment terms, declaration, jurisdiction, etc.
 *
 * Designed to be additive so that previously generated invoices and the
 * existing rendering pipeline keep working unchanged.
 */
export interface CityInvoiceProfile {
  city: string;
  // Extended identity
  trade_name: string;
  pan: string;
  cin: string;
  msme_no: string;
  // Address
  address_line2: string;
  pincode: string;
  country: string;
  // Contact
  phone: string;
  email: string;
  website: string;
  // Signature & branding
  signature_url: string;
  authorised_signatory_name: string;
  brand_color: string;
  show_signature: boolean;
  // Bank
  bank_name: string;
  bank_account_holder: string;
  bank_account_no: string;
  bank_ifsc: string;
  bank_branch: string;
  bank_swift: string;
  upi_id: string;
  show_upi_qr: boolean;
  // Tax defaults
  default_place_of_supply: string;
  reverse_charge_default: boolean;
  // Payment terms
  payment_terms_label: string;
  due_date_offset_days: number;
  payment_instructions: string;
  // Document text
  declaration: string;
  jurisdiction: string;
  copy_labels: string[];
  einvoice_enabled: boolean;
}

const EMPTY = (city: string): CityInvoiceProfile => ({
  city,
  trade_name: "",
  pan: "",
  cin: "",
  msme_no: "",
  address_line2: "",
  pincode: "",
  country: "India",
  phone: "",
  email: "",
  website: "",
  signature_url: "",
  authorised_signatory_name: "",
  brand_color: "",
  show_signature: false,
  bank_name: "",
  bank_account_holder: "",
  bank_account_no: "",
  bank_ifsc: "",
  bank_branch: "",
  bank_swift: "",
  upi_id: "",
  show_upi_qr: false,
  default_place_of_supply: "",
  reverse_charge_default: false,
  payment_terms_label: "",
  due_date_offset_days: 0,
  payment_instructions: "",
  declaration: "",
  jurisdiction: "",
  copy_labels: [],
  einvoice_enabled: false,
});

function normalize(row: any, city: string): CityInvoiceProfile {
  if (!row) return EMPTY(city);
  return {
    ...EMPTY(city),
    ...row,
    copy_labels: Array.isArray(row.copy_labels) ? row.copy_labels : [],
  };
}

export function useCityInvoiceProfile(city?: string) {
  return useQuery({
    queryKey: ["city_invoice_profile", city],
    enabled: !!city,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("city_invoice_profiles")
        .select("*")
        .eq("city", city!)
        .maybeSingle();
      if (error) throw error;
      return normalize(data, city!);
    },
  });
}

export function useSaveCityInvoiceProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (profile: CityInvoiceProfile) => {
      const { error } = await supabase
        .from("city_invoice_profiles")
        .upsert(profile, { onConflict: "city" });
      if (error) throw error;
    },
    onSuccess: (_, profile) => {
      qc.invalidateQueries({ queryKey: ["city_invoice_profile", profile.city] });
      qc.invalidateQueries({ queryKey: ["invoice_settings"] });
    },
  });
}

/**
 * Upload a signature image as a self-contained data URL so it can be embedded
 * directly in invoices without depending on a public bucket. Mirrors the logo
 * upload contract.
 */
const MAX_SIGNATURE_BYTES = 200 * 1024;

export async function readSignatureFile(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Signature must be an image file.");
  }
  if (file.size > MAX_SIGNATURE_BYTES) {
    throw new Error(
      `Signature is too large (${(file.size / 1024).toFixed(0)} KB). Please use an image under 200 KB.`,
    );
  }
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Failed to read signature file."));
        return;
      }
      resolve(result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read signature file."));
    reader.readAsDataURL(file);
  });
}
