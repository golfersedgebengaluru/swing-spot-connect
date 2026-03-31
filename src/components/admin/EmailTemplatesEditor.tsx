import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Loader2, Save, Mail } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";

interface TemplateConfig {
  key: string;
  label: string;
  description: string;
  placeholders: string;
}

const TEMPLATE_CONFIGS: TemplateConfig[] = [
  {
    key: "email_tpl_booking_confirmed_footer",
    label: "Booking Confirmed — Footer Message",
    description: "Shown below the booking details in the confirmation email.",
    placeholders: "No placeholders needed.",
  },
  {
    key: "email_tpl_booking_cancelled_body",
    label: "Booking Cancelled — Body Message",
    description: "Main message in the cancellation email. Use {{hours_refunded}} for the refunded hours.",
    placeholders: "{{hours_refunded}}",
  },
  {
    key: "email_tpl_points_earned_body",
    label: "Points Earned — Body Message",
    description: "Introductory text in the points-awarded email.",
    placeholders: "No placeholders needed.",
  },
  {
    key: "email_tpl_points_redeemed_body",
    label: "Points Redeemed — Body Message",
    description: "Introductory text in the reward-redeemed email.",
    placeholders: "No placeholders needed.",
  },
  {
    key: "email_tpl_league_update_body",
    label: "Leaderboard Update — Body Message",
    description: "Additional text for leaderboard update emails. Leave blank to use only the dynamic message.",
    placeholders: "No placeholders needed.",
  },
  {
    key: "email_tpl_low_hours_alert_subject",
    label: "Low Hours Alert — Subject Line",
    description: "Subject line for the low hours alert email.",
    placeholders: "No placeholders needed.",
  },
  {
    key: "email_tpl_low_hours_alert_body",
    label: "Low Hours Alert — Body Message",
    description: "Body text for the low hours alert email. Use {{hours_remaining}} for the remaining hours.",
    placeholders: "{{hours_remaining}}",
  },
];

export function EmailTemplatesEditor() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);

  const { data: configs, isLoading } = useQuery({
    queryKey: ["admin_config", "email_templates"],
    queryFn: async () => {
      const { data } = await supabase
        .from("admin_config")
        .select("key, value")
        .like("key", "email_tpl_%");
      return data || [];
    },
  });

  useEffect(() => {
    if (configs) {
      const map: Record<string, string> = {};
      configs.forEach((c) => (map[c.key] = c.value));
      setValues(map);
    }
  }, [configs]);

  const handleSave = async (key: string) => {
    setSaving(key);
    try {
      const { error } = await supabase
        .from("admin_config")
        .update({ value: values[key] || "" })
        .eq("key", key);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["admin_config", "email_templates"] });
      toast({ title: "Saved", description: "Email template content updated." });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(null);
    }
  };

  if (isLoading) return <Loader2 className="mx-auto h-8 w-8 animate-spin" />;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="h-5 w-5" />
          Email Template Content
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Customize the text content of each notification email template.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {TEMPLATE_CONFIGS.map((tpl) => (
          <div key={tpl.key} className="space-y-2 rounded-lg border p-4">
            <Label className="text-sm font-semibold">{tpl.label}</Label>
            <p className="text-xs text-muted-foreground">{tpl.description}</p>
            {tpl.placeholders !== "No placeholders needed." && (
              <p className="text-xs text-primary">Available: {tpl.placeholders}</p>
            )}
            <Textarea
              value={values[tpl.key] || ""}
              onChange={(e) => setValues({ ...values, [tpl.key]: e.target.value })}
              rows={3}
              className="resize-y"
            />
            <div className="flex justify-end">
              <Button
                size="sm"
                onClick={() => handleSave(tpl.key)}
                disabled={saving === tpl.key}
              >
                {saving === tpl.key ? (
                  <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                ) : (
                  <Save className="mr-2 h-3 w-3" />
                )}
                Save
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
