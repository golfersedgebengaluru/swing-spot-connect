import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { CityInvoiceProfile } from "@/hooks/useCityInvoiceProfile";
import type { InvoiceSettings, InvoiceTemplate } from "@/hooks/useInvoiceSettings";
import type { GstProfile } from "@/hooks/useInvoices";

/**
 * Single read entry point for a city's invoice identity.
 *
 * Reads `public.city_invoice_identity`, a database view that merges the three
 * storage tables (gst_profiles = legal identity + numbering, invoice_settings =
 * template/logo/footer/terms with global fallback, city_invoice_profiles =
 * contact/bank/signature extras). Consumers no longer need to know which table
 * holds which field, and the global-vs-city precedence lives in one place (SQL).
 *
 * Writes still go through the individual save hooks used by InvoiceProfileCard.
 */
export type CityInvoiceIdentity = Omit<GstProfile, "id"> &
  Omit<InvoiceSettings, "id" | "city"> &
  Partial<CityInvoiceProfile> & {
    city: string;
    template_overridden: boolean;
    invoice_settings_id: string | null;
    default_service_gst_rate: number | null;
    default_sac_code: string | null;
  };

export function useCityInvoiceIdentity(city?: string) {
  return useQuery({
    queryKey: ["city_invoice_identity", city],
    enabled: !!city,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("city_invoice_identity")
        .select("*")
        .eq("city", city!)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as CityInvoiceIdentity | null) ?? null;
    },
  });
}

/** Defaults used when a city has no invoice configuration rows at all. */
export function emptyCityInvoiceIdentity(city: string): CityInvoiceIdentity {
  return {
    city,
    legal_name: "",
    gstin: "",
    address: "",
    state: "",
    state_code: "",
    invoice_prefix: "INV",
    invoice_start_number: 1,
    is_gst_registered: true,
    template: "classic" as InvoiceTemplate,
    logo_url: "",
    footer_note: "",
    terms: "",
    template_overridden: false,
    invoice_settings_id: null,
    default_service_gst_rate: null,
    default_sac_code: null,
  };
}
