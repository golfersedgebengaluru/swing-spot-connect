import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { Dumbbell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FocusDrillPicker } from "@/components/coaching/FocusDrillPicker";
import { VoiceTextarea } from "@/components/coaching/VoiceTextarea";
import { useAllCities } from "@/hooks/useBookings";
import { useFocusLibrary } from "@/hooks/useCoachingLibrary";
import { useCompleteSelfDirectedTraining } from "@/hooks/useCoaching";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import type { SessionSelection } from "@/lib/coaching-library";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const emptySelection: SessionSelection = { focusIds: [], drills: [] };

export function SelfDirectedTrainingDialog({ open, onOpenChange }: Props) {
  const { user } = useAuth();
  const { data: cities } = useAllCities();
  const { data: library } = useFocusLibrary();
  const complete = useCompleteSelfDirectedTraining();
  const [city, setCity] = useState("");
  const [sessionDate, setSessionDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [selection, setSelection] = useState<SessionSelection>(emptySelection);
  const [notes, setNotes] = useState("");
  const [progress, setProgress] = useState("");

  useEffect(() => {
    if (!open || !user) return;
    setSessionDate(format(new Date(), "yyyy-MM-dd"));
    setSelection(emptySelection);
    setNotes("");
    setProgress("");
    supabase
      .from("profiles")
      .select("preferred_city")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => setCity(data?.preferred_city ?? ""));
  }, [open, user]);

  const selectedDrills = useMemo(
    () => selection.drills.map((item) => {
      for (const focus of library ?? []) {
        const drill = focus.drills.find((candidate) => candidate.id === item.drillId);
        if (drill) return drill;
      }
      return null;
    }).filter((drill) => drill !== null),
    [library, selection.drills]
  );

  const canComplete = Boolean(city && sessionDate && selection.focusIds.length && !complete.isPending);

  const handleComplete = async () => {
    await complete.mutateAsync({
      city,
      sessionDate,
      notes,
      progressSummary: progress,
      selection,
      library: library ?? [],
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Dumbbell className="h-5 w-5" />
            Start Training
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>City</Label>
              <Select value={city} onValueChange={setCity}>
                <SelectTrigger><SelectValue placeholder="Select city" /></SelectTrigger>
                <SelectContent>
                  {(cities ?? []).map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Training date</Label>
              <Input type="date" value={sessionDate} onChange={(event) => setSessionDate(event.target.value)} />
            </div>
          </div>

          <FocusDrillPicker library={library ?? []} value={selection} onChange={setSelection} showDetails />

          {selectedDrills.length > 0 && (
            <div className="space-y-2" aria-label="Selected drill guidance">
              <Label>Selected drill guidance</Label>
              {selectedDrills.map((drill) => (
                <div key={drill.id} className="space-y-1 rounded-md border p-3">
                  <p className="text-sm font-medium">{drill.name}</p>
                  {drill.objective && <p className="text-xs text-muted-foreground">{drill.objective}</p>}
                  {drill.instructions && <p className="text-sm whitespace-pre-wrap">{drill.instructions}</p>}
                  {drill.recommended_reps && <p className="text-xs font-medium">Reps: {drill.recommended_reps}</p>}
                  {drill.video_url && (
                    <a className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline" href={drill.video_url} target="_blank" rel="noreferrer">
                      Watch drill video
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}

          <VoiceTextarea label="Training notes" field="notes" value={notes} onChange={setNotes} rows={3} placeholder="What did you notice?" />
          <VoiceTextarea label="Progress summary" field="progress" value={progress} onChange={setProgress} rows={2} placeholder="How did the session go?" />
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleComplete} disabled={!canComplete}>
            {complete.isPending ? "Completing…" : "Complete Training"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}