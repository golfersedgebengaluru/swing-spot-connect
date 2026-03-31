import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const INVOICE_CONFIG_KEYS = ["invoice_template", "invoice_logo_url", "invoice_footer_note", "invoice_terms"];

export type InvoiceTemplate = "classic" | "modern" | "compact";

export interface InvoiceSettings {
  invoice_template: InvoiceTemplate;
  invoice_logo_url: string;
  invoice_footer_note: string;
  invoice_terms: string;
}

export function useInvoiceSettings() {
  return useQuery({
    queryKey: ["invoice_settings"],
    queryFn: async () => {
      const { data } = await supabase
        .from("admin_config")
        .select("key, value")
        .in("key", INVOICE_CONFIG_KEYS);
      const map: InvoiceSettings = {
        invoice_template: "classic",
        invoice_logo_url: "",
        invoice_footer_note: "",
        invoice_terms: "",
      };
      data?.forEach((row) => {
        (map as any)[row.key] = row.value;
      });
      return map;
    },
  });
}

export function useSaveInvoiceSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (settings: Partial<InvoiceSettings>) => {
      for (const [key, value] of Object.entries(settings)) {
        if (!INVOICE_CONFIG_KEYS.includes(key)) continue;
        const { error } = await supabase
          .from("admin_config")
          .update({ value: value ?? "" })
          .eq("key", key);
        if (error) {
          // Key might not exist yet, try upsert via insert
          const { error: insertErr } = await supabase
            .from("admin_config")
            .insert({ key, value: value ?? "" });
          if (insertErr) throw insertErr;
        }
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["invoice_settings"] }),
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
