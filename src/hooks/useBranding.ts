import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface BrandingConfig {
  studio_name: string;
  logo_url: string;
  primary_color: string;
  footer_text: string;
}

const BRANDING_KEYS = ["studio_name", "logo_url", "primary_color", "footer_text"];

const defaults: BrandingConfig = {
  studio_name: "EdgeCollective",
  logo_url: "",
  primary_color: "",
  footer_text: "© {year} EdgeCollective by TEETIME VENTURES. All rights reserved.",
};

export function useBranding() {
  return useQuery({
    queryKey: ["branding_config"],
    queryFn: async (): Promise<BrandingConfig> => {
      const { data, error } = await supabase
        .from("admin_config")
        .select("key, value")
        .in("key", BRANDING_KEYS);

      if (error) throw error;

      const config = { ...defaults };
      data?.forEach((row) => {
        if (row.key in config) {
          (config as any)[row.key] = row.value || (defaults as any)[row.key];
        }
      });
      return config;
    },
    staleTime: 5 * 60 * 1000,
  });
}
