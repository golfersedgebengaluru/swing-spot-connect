import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Loader2, Mail } from "lucide-react";
import { useEmailPreferences, useUpdateEmailPreferences } from "@/hooks/useEmailPreferences";
import { useToast } from "@/hooks/use-toast";

const PREFERENCE_ITEMS = [
  { key: "booking_confirmed", label: "Booking Confirmed", description: "Email when a bay booking is confirmed" },
  { key: "booking_cancelled", label: "Booking Cancelled", description: "Email when a booking is cancelled" },
  { key: "booking_rescheduled", label: "Booking Rescheduled", description: "Email when a booking is rescheduled" },
  { key: "points_earned", label: "Points Earned", description: "Email when reward points are awarded" },
  { key: "points_redeemed", label: "Points Redeemed", description: "Email when you redeem a reward" },
  { key: "league_updates", label: "League Updates", description: "Email for leaderboard and match updates" },
];

export function EmailPreferencesCard() {
  const { data: prefs, isLoading } = useEmailPreferences();
  const updatePrefs = useUpdateEmailPreferences();
  const { toast } = useToast();

  const handleToggle = (key: string, checked: boolean) => {
    updatePrefs.mutate({ [key]: checked } as any, {
      onSuccess: () => toast({ title: "Preferences updated" }),
      onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
    });
  };

  if (isLoading) return <Loader2 className="mx-auto h-8 w-8 animate-spin" />;

  return (
    <Card className="shadow-elegant">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="h-5 w-5 text-primary" />
          Email Notifications
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">Choose which email notifications you'd like to receive.</p>
        {PREFERENCE_ITEMS.map((item) => (
          <div key={item.key} className="flex items-center justify-between py-2 border-b border-border last:border-0">
            <div>
              <p className="text-sm font-medium text-foreground">{item.label}</p>
              <p className="text-xs text-muted-foreground">{item.description}</p>
            </div>
            <Switch
              checked={(prefs as any)?.[item.key] ?? true}
              onCheckedChange={(checked) => handleToggle(item.key, checked)}
            />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
