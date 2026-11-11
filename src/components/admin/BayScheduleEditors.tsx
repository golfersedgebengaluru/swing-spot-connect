import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { CalendarIcon, Plus, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { getDayName } from "@/lib/bay-schedule-utils";
import { useBayHolidays, useAddBayHoliday, useDeleteBayHoliday } from "@/hooks/useBayHolidays";
import { useBayPeakHours, useAddBayPeakHour, useDeleteBayPeakHour } from "@/hooks/useBayPeakHours";
import { useBayHoursOverrides, useUpsertBayHoursOverride, useDeleteBayHoursOverride } from "@/hooks/useBayHoursOverrides";
import { dayHoursError, pendingDayHours, type PendingDayHours } from "@/lib/day-hours";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

const DAY_OPTIONS = [
  { value: 0, label: "Sunday" },
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
];

interface WeeklyOffEditorProps {
  bayId: string;
  weeklyOffDays: number[];
}

export function WeeklyOffEditor({ bayId, weeklyOffDays }: WeeklyOffEditorProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  // The dialog passes a snapshot taken when it opened; keep our own copy so a
  // second tick builds on the first instead of overwriting it.
  const [days, setDays] = useState<number[]>(weeklyOffDays);
  const [saving, setSaving] = useState(false);
  useEffect(() => { setDays(weeklyOffDays); }, [bayId]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleDay = async (day: number) => {
    if (saving) return;
    const newDays = days.includes(day)
      ? days.filter((d) => d !== day)
      : [...days, day].sort((a, b) => a - b);

    setSaving(true);
    const { data, error } = await supabase
      .from("bays")
      .update({ weekly_off_days: newDays })
      .eq("id", bayId)
      .select("id");
    setSaving(false);

    if (error || !data || data.length === 0) {
      toast({
        title: "Weekly off days not saved",
        description: error?.message ?? "You don't have permission to change this bay.",
        variant: "destructive",
      });
      return;
    }
    setDays(newDays);
    queryClient.invalidateQueries({ queryKey: ["bays"] });
    toast({ title: "Weekly off days saved" });
  };

  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium">Weekly Off Days</Label>
      <div className="flex flex-wrap gap-2">
        {DAY_OPTIONS.map((day) => (
          <label
            key={day.value}
            className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm cursor-pointer hover:bg-muted/50"
          >
            <Checkbox
              checked={days.includes(day.value)}
              disabled={saving}
              onCheckedChange={() => toggleDay(day.value)}
            />
            <span>{day.label.slice(0, 3)}</span>
          </label>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Bookings are blocked on selected days.
      </p>
    </div>
  );
}

interface HolidayEditorProps {
  city: string;
  bayId?: string;
}

export function HolidayEditor({ city, bayId }: HolidayEditorProps) {
  const { toast } = useToast();
  const { data: holidays = [], isLoading } = useBayHolidays(city);
  const addHoliday = useAddBayHoliday();
  const deleteHoliday = useDeleteBayHoliday();

  const [newDate, setNewDate] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [scope, setScope] = useState<"city" | "bay">("city");

  const handleAdd = () => {
    if (!newDate) return;
    addHoliday.mutate(
      {
        bay_id: scope === "bay" && bayId ? bayId : null,
        city,
        holiday_date: newDate,
        label: newLabel || "Holiday",
      },
      {
        onSuccess: () => {
          toast({ title: "Holiday saved", description: `${city}: ${newDate}` });
          setNewDate("");
          setNewLabel("");
        },
        onError: (e) => toast({ title: "Holiday not saved", description: (e as Error).message, variant: "destructive" }),
      },
    );
  };

  const futureHolidays = holidays.filter((h) => h.holiday_date >= new Date().toISOString().split("T")[0]);

  return (
    <div className="space-y-3">
      <Label className="text-sm font-medium">Holidays</Label>
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <Label className="text-xs">Date</Label>
          <Input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
        </div>
        <div className="flex-1">
          <Label className="text-xs">Label</Label>
          <Input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="e.g. Diwali" />
        </div>
        {bayId && (
          <div>
            <Label className="text-xs">Scope</Label>
            <Select value={scope} onValueChange={(v) => setScope(v as "city" | "bay")}>
              <SelectTrigger className="w-[100px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="city">All Bays</SelectItem>
                <SelectItem value="bay">This Bay</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
        <Button size="sm" onClick={handleAdd} disabled={!newDate || addHoliday.isPending}>
          <Plus className="mr-1 h-4 w-4" /> Add
        </Button>
      </div>

      {futureHolidays.length > 0 && (
        <div className="space-y-1 max-h-40 overflow-y-auto">
          {futureHolidays.map((h) => (
            <div key={h.id} className="flex items-center justify-between rounded border border-border px-3 py-1.5 text-sm">
              <div className="flex items-center gap-2">
                <CalendarIcon className="h-3 w-3 text-muted-foreground" />
                <span>{format(new Date(h.holiday_date + "T00:00:00"), "MMM d, yyyy")}</span>
                <span className="text-muted-foreground">— {h.label}</span>
                {h.bay_id && <Badge variant="outline" className="text-xs">Bay-specific</Badge>}
              </div>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => deleteHoliday.mutate(h.id, {
                onError: (e) => toast({ title: "Holiday not removed", description: (e as Error).message, variant: "destructive" }),
              })}>
                <Trash2 className="h-3 w-3 text-destructive" />
              </Button>
            </div>
          ))}
        </div>
      )}
      {futureHolidays.length === 0 && !isLoading && (
        <p className="text-xs text-muted-foreground">No upcoming holidays configured.</p>
      )}
    </div>
  );
}

interface PeakHoursEditorProps {
  bayId: string;
}

export function PeakHoursEditor({ bayId }: PeakHoursEditorProps) {
  const { toast } = useToast();
  const { data: peakHours = [], isLoading } = useBayPeakHours(bayId);
  const addPeakHour = useAddBayPeakHour();
  const deletePeakHour = useDeleteBayPeakHour();

  const [newDayOfWeek, setNewDayOfWeek] = useState<string>("default");
  const [newStart, setNewStart] = useState("17:00");
  const [newEnd, setNewEnd] = useState("21:00");

  const handleAdd = () => {
    if (!newStart || !newEnd) return;
    if (newStart >= newEnd) {
      toast({ title: "Peak hours not saved", description: "End time must be after start time.", variant: "destructive" });
      return;
    }
    addPeakHour.mutate(
      {
        bay_id: bayId,
        day_of_week: newDayOfWeek === "default" ? null : Number(newDayOfWeek),
        peak_start: newStart,
        peak_end: newEnd,
        sort_order: peakHours.length,
      },
      {
        onSuccess: () => toast({ title: "Peak hours saved" }),
        onError: (e) => toast({ title: "Peak hours not saved", description: (e as Error).message, variant: "destructive" }),
      },
    );
  };

  // Group by day_of_week for display
  const defaultHours = peakHours.filter((p) => p.day_of_week === null);
  const daySpecific = peakHours.filter((p) => p.day_of_week !== null);
  const dayGroups = new Map<number, typeof peakHours>();
  daySpecific.forEach((p) => {
    const day = p.day_of_week!;
    if (!dayGroups.has(day)) dayGroups.set(day, []);
    dayGroups.get(day)!.push(p);
  });

  return (
    <div className="space-y-3">
      <Label className="text-sm font-medium">Peak Hours</Label>

      {/* Default hours */}
      <div className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground">Default (all days):</p>
        {defaultHours.length === 0 && (
          <p className="text-xs text-muted-foreground italic">No default peak hours set.</p>
        )}
        {defaultHours.map((p) => (
          <div key={p.id} className="flex items-center gap-2 text-sm">
            <span>{p.peak_start} – {p.peak_end}</span>
            <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => deletePeakHour.mutate(p.id, {
              onError: (e) => toast({ title: "Peak hours not removed", description: (e as Error).message, variant: "destructive" }),
            })}>
              <Trash2 className="h-3 w-3 text-destructive" />
            </Button>
          </div>
        ))}
      </div>

      {/* Day-specific overrides */}
      {Array.from(dayGroups.entries()).sort(([a], [b]) => a - b).map(([day, hours]) => (
        <div key={day} className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">{getDayName(day)} override:</p>
          {hours.map((p) => (
            <div key={p.id} className="flex items-center gap-2 text-sm">
              <span>{p.peak_start} – {p.peak_end}</span>
              <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => deletePeakHour.mutate(p.id, {
              onError: (e) => toast({ title: "Peak hours not removed", description: (e as Error).message, variant: "destructive" }),
            })}>
                <Trash2 className="h-3 w-3 text-destructive" />
              </Button>
            </div>
          ))}
        </div>
      ))}

      {/* Add new */}
      <div className="flex items-end gap-2">
        <div>
          <Label className="text-xs">Day</Label>
          <Select value={newDayOfWeek} onValueChange={setNewDayOfWeek}>
            <SelectTrigger className="w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">All Days</SelectItem>
              {DAY_OPTIONS.map((d) => (
                <SelectItem key={d.value} value={String(d.value)}>{d.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Start</Label>
          <Input type="time" value={newStart} onChange={(e) => setNewStart(e.target.value)} className="w-[110px]" />
        </div>
        <div>
          <Label className="text-xs">End</Label>
          <Input type="time" value={newEnd} onChange={(e) => setNewEnd(e.target.value)} className="w-[110px]" />
        </div>
        <Button size="sm" onClick={handleAdd} disabled={!newStart || !newEnd || addPeakHour.isPending}>
          <Plus className="mr-1 h-4 w-4" /> Add
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Day-specific entries override defaults. Multiple windows per day are supported.
      </p>
    </div>
  );
}

interface DayHoursOverrideEditorProps {
  bayId: string;
  /** The bay's normal hours, used when one field of a day entry is left blank. */
  bayOpen: string;
  bayClose: string;
  /** Reports what is typed but not yet added, so the dialog's Save can store it too. */
  onPendingChange?: (pending: PendingDayHours | null) => void;
  /** Bump to clear the typed entry after the dialog saved it. */
  resetKey?: number;
}

export function DayHoursOverrideEditor({ bayId, bayOpen, bayClose, onPendingChange, resetKey }: DayHoursOverrideEditorProps) {
  const { toast } = useToast();
  const { data: overrides = [] } = useBayHoursOverrides(bayId);
  const upsert = useUpsertBayHoursOverride();
  const del = useDeleteBayHoursOverride();

  const [newDay, setNewDay] = useState<string>("0");
  const [newOpen, setNewOpen] = useState<string>("");
  const [newClose, setNewClose] = useState<string>("");

  useEffect(() => {
    onPendingChange?.(pendingDayHours(Number(newDay), newOpen, newClose));
  }, [newDay, newOpen, newClose, onPendingChange]);

  useEffect(() => {
    if (resetKey === undefined) return;
    setNewOpen("");
    setNewClose("");
  }, [resetKey]);

  const handleAdd = () => {
    const entry = pendingDayHours(Number(newDay), newOpen, newClose);
    if (!entry) return;
    const err = dayHoursError(entry, bayOpen, bayClose);
    if (err) {
      toast({ title: "Day hours not saved", description: err, variant: "destructive" });
      return;
    }
    upsert.mutate(
      { bay_id: bayId, ...entry },
      {
        onSuccess: () => {
          toast({ title: "Day hours saved", description: `${getDayName(entry.day_of_week)}: ${entry.open_time ?? "default"} – ${entry.close_time ?? "default"}` });
          setNewOpen("");
          setNewClose("");
        },
        onError: (e) => toast({ title: "Day hours not saved", description: (e as Error).message, variant: "destructive" }),
      },
    );
  };

  const sorted = [...overrides].sort((a, b) => a.day_of_week - b.day_of_week);

  return (
    <div className="space-y-3">
      <Label className="text-sm font-medium">Day-specific Hours</Label>
      <p className="text-xs text-muted-foreground">
        Override the bay's default open/close time on specific weekdays. Leave open or close blank to keep the bay's default for that field.
      </p>

      {sorted.length > 0 && (
        <div className="space-y-1">
          {sorted.map((o) => (
            <div key={o.id} className="flex items-center gap-2 text-sm">
              <Badge variant="outline" className="text-xs">{getDayName(o.day_of_week)}</Badge>
              <span>
                {o.open_time ? o.open_time.slice(0, 5) : "default"} – {o.close_time ? o.close_time.slice(0, 5) : "default"}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5"
                aria-label={`Remove ${getDayName(o.day_of_week)} hours`}
                onClick={() => del.mutate(o.id, {
                  onError: (e) => toast({ title: "Day hours not removed", description: (e as Error).message, variant: "destructive" }),
                })}
              >
                <Trash2 className="h-3 w-3 text-destructive" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2 flex-wrap">
        <div>
          <Label className="text-xs">Day</Label>
          <Select value={newDay} onValueChange={setNewDay}>
            <SelectTrigger className="w-[120px]" aria-label="Day">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DAY_OPTIONS.map((d) => (
                <SelectItem key={d.value} value={String(d.value)}>{d.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs" htmlFor="day-hours-open">Open</Label>
          <Input id="day-hours-open" type="time" value={newOpen} onChange={(e) => setNewOpen(e.target.value)} className="w-[110px]" />
        </div>
        <div>
          <Label className="text-xs" htmlFor="day-hours-close">Close</Label>
          <Input id="day-hours-close" type="time" value={newClose} onChange={(e) => setNewClose(e.target.value)} className="w-[110px]" />
        </div>
        <Button size="sm" onClick={handleAdd} disabled={(!newOpen && !newClose) || upsert.isPending}>
          <Plus className="mr-1 h-4 w-4" /> Add
        </Button>
      </div>
    </div>
  );
}
