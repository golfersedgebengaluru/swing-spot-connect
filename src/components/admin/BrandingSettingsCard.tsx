import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Palette, Save, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient, useQuery } from "@tanstack/react-query";

const brandingFields = [
  { key: "studio_name", label: "Studio Name", placeholder: "EdgeCollective", type: "text", description: "Displayed in the navbar and footer" },
  { key: "logo_url", label: "Logo URL", placeholder: "https://example.com/logo.png", type: "url", description: "URL to your logo image (leave blank to use default)" },
  { key: "primary_color", label: "Primary Color (HSL)", placeholder: "142 76% 36%", type: "text", description: "HSL values without parentheses, e.g. '142 76% 36%'. Leave blank for default." },
  { key: "footer_text", label: "Footer Text", placeholder: "© {year} Your Company. All rights reserved.", type: "text", description: "Use {year} as a placeholder for the current year" },
];

export function BrandingSettingsCard() {
  const { toast } = useToast();
  const [values, setValues] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const queryClient = useQueryClient();

  const { data: config, isLoading } = useQuery({
    queryKey: ["branding_admin_config"],
    queryFn: async () => {
      const { data } = await supabase
        .from("admin_config")
        .select("key, value")
        .in("key", brandingFields.map((f) => f.key));
      const map: Record<string, string> = {};
      data?.forEach((row) => { map[row.key] = row.value; });
      return map;
    },
  });

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      for (const field of brandingFields) {
        const val = values[field.key];
        if (val !== undefined) {
          const { error } = await supabase
            .from("admin_config")
            .update({ value: val })
            .eq("key", field.key);
          if (error) throw error;
        }
      }
      queryClient.invalidateQueries({ queryKey: ["branding_admin_config"] });
      queryClient.invalidateQueries({ queryKey: ["branding_config"] });
      toast({ title: "Saved", description: "Branding settings updated." });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) return <Loader2 className="mx-auto h-8 w-8 animate-spin" />;

  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Palette className="h-5 w-5" />
          White-Label Branding
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSave} className="space-y-4">
          {brandingFields.map((field) => (
            <div key={field.key}>
              <Label htmlFor={field.key}>{field.label}</Label>
              <Input
                id={field.key}
                type={field.type}
                placeholder={field.placeholder}
                defaultValue={config?.[field.key] || ""}
                onChange={(e) => setValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">{field.description}</p>
            </div>
          ))}
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving...</> : <><Save className="mr-2 h-4 w-4" />Save Branding</>}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
