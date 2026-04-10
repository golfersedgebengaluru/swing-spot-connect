import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type InvoiceTemplate = "classic" | "modern" | "compact";

export interface InvoiceSettings {
  id?: string;
  city: string | null;
  template: InvoiceTemplate;
  logo_url: string;
  footer_note: string;
  terms: string;
}

const DEFAULTS: Omit<InvoiceSettings, "city"> = {
  template: "classic",
  logo_url: "",
  footer_note: "",
  terms: "",
};

/** Fetch global invoice settings (city IS NULL) */
export function useGlobalInvoiceSettings() {
  return useQuery({
    queryKey: ["invoice_settings", "global"],
    queryFn: async () => {
      const { data, error } = await supabase.from("invoice_settings")
        .select("*")
        .is("city", null)
        .maybeSingle();
      if (error) throw error;
      return (data as InvoiceSettings | null) ?? { ...DEFAULTS, city: null };
    },
  });
}

/** Fetch per-city invoice settings row (may be null if no override) */
export function useCityInvoiceSettings(city?: string) {
  return useQuery({
    queryKey: ["invoice_settings", "city", city],
    enabled: !!city,
    queryFn: async () => {
      const { data, error } = await supabase.from("invoice_settings")
        .select("*")
        .eq("city", city)
        .maybeSingle();
      if (error) throw error;
      return data as InvoiceSettings | null;
    },
  });
}

/** 
 * Resolve effective invoice settings for a city:
 * per-city override if exists, otherwise global fallback.
 */
export function useEffectiveInvoiceSettings(city?: string) {
  const { data: global, isLoading: gl } = useGlobalInvoiceSettings();
  const { data: citySettings, isLoading: cl } = useCityInvoiceSettings(city);

  const effective: InvoiceSettings = citySettings ?? global ?? { ...DEFAULTS, city: null };

  return {
    data: effective,
    isLoading: gl || cl,
    isOverridden: !!citySettings,
  };
}

/** Save invoice settings for a specific city or global (city=null) */
export function useSaveInvoiceSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (settings: Partial<InvoiceSettings> & { city: string | null }) => {
      const payload = {
        city: settings.city,
        template: settings.template ?? "classic",
        logo_url: settings.logo_url ?? "",
        footer_note: settings.footer_note ?? "",
        terms: settings.terms ?? "",
      };

      if (settings.id) {
        const { error } = await supabase.from("invoice_settings")
          .update(payload)
          .eq("id", settings.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("invoice_settings")
          .upsert(payload, { onConflict: "city" });
        if (error) throw error;
      }
    },
    onSuccess: (_, settings) => {
      qc.invalidateQueries({ queryKey: ["invoice_settings"] });
    },
  });
}

/** Delete per-city override (revert to global) */
export function useDeleteCityInvoiceSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (city: string) => {
      const { error } = await supabase.from("invoice_settings")
        .delete()
        .eq("city", city);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoice_settings"] });
    },
  });
}

export async function uploadInvoiceLogo(file: File): Promise<string> {
  const ext = file.name.split(".").pop()?.toLowerCase() || "png";
  const path = `logo_${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from("invoice-assets").upload(path, file, {
    upsert: true,
    contentType: file.type,
  });
  if (error) throw error;
  const { data } = supabase.storage.from("invoice-assets").getPublicUrl(path);
  return data.publicUrl;
}
