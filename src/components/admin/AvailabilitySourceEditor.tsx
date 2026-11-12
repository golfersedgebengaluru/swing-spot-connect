import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CalendarCheck, Loader2 } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useBayConfig } from "@/hooks/useBookings";

/** Per-city switch: availability from the app calendar (Google becomes a view-only copy). */
export function AvailabilitySourceEditor({ city }: { city: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: configs } = useBayConfig();
  const usesApp = (configs ?? []).some((c: { city: string; availability_source?: string }) => c.city === city && c.availability_source === "app");
  const [confirming, setConfirming] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async (toApp: boolean) => {
    setSaving(true);
    const { error } = await supabase
      .from("bay_config")
      .upsert({ city, availability_source: toApp ? "app" : "google" }, { onConflict: "city" });
    setSaving(false);
    setConfirming(null);
    if (error) {
      toast({ title: "Could not change availability", description: error.message, variant: "destructive" });
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["bay_config"] });
    queryClient.invalidateQueries({ queryKey: ["available_slots"] });
    toast({ title: toApp ? `${city} now uses the app calendar` : `${city} now uses Google Calendar` });
  };

  return (
    <div className="rounded-md border border-border p-3 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <CalendarCheck className="h-4 w-4 text-muted-foreground" />
          <Label className="text-sm">Availability from app calendar</Label>
        </div>
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : (
          <Switch checked={usesApp} onCheckedChange={(v) => setConfirming(v)} aria-label={`Availability from app calendar for ${city}`} />
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        {usesApp
          ? "Open slots come from app bookings and block-outs. Google Calendar only receives a copy of each booking."
          : "Open slots come from Google Calendar. Switch on to use app bookings and block-outs instead."}
      </p>

      <AlertDialog open={confirming !== null} onOpenChange={(open) => { if (!open) setConfirming(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirming ? `Use the app calendar for ${city}?` : `Go back to Google Calendar for ${city}?`}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirming
                ? "Times blocked directly in Google Calendar will stop counting. Add them as block-outs in Bookings › Calendar first. Customers will pick a bay type and the app will choose a free bay."
                : "Open slots will be read from Google Calendar again. Block-outs added in the app will stop counting."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => save(!!confirming)}>Switch</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
