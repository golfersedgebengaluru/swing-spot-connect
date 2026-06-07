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

/**
 * Convert the logo to a base64 data URL and embed it directly in invoice_settings.
 * Keeps the asset private (no storage bucket dependency), makes PDFs fully
 * self-contained, and avoids the public-bucket security finding.
 *
 * We cap the original file at 500 KB to keep the admin_config/invoice_settings
 * row reasonable in size (~670 KB encoded worst case).
 */
const MAX_LOGO_BYTES = 500 * 1024;

export async function uploadInvoiceLogo(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Logo must be an image file (PNG, JPEG, SVG, or WebP).");
  }
  if (file.size > MAX_LOGO_BYTES) {
    throw new Error(
      `Logo is too large (${(file.size / 1024).toFixed(0)} KB). Please use an image under 500 KB.`,
    );
  }

  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Failed to read logo file."));
        return;
      }
      resolve(result); // data:<mime>;base64,<...>
    };
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read logo file."));
    reader.readAsDataURL(file);
  });
}
