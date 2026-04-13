import { useState } from "react";
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
  city: string;
  weeklyOffDays: number[];
}

export function WeeklyOffEditor({ bayId, city, weeklyOffDays }: WeeklyOffEditorProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const toggleDay = async (day: number) => {
    const newDays = weeklyOffDays.includes(day)
      ? weeklyOffDays.filter((d) => d !== day)
      : [...weeklyOffDays, day].sort();

    const { error } = await supabase
      .from("bays")
      .update({ weekly_off_days: newDays })
      .eq("id", bayId);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["bays"] });
    toast({ title: "Weekly off days updated" });
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
              checked={weeklyOffDays.includes(day.value)}
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
  const { data: holidays = [], isLoading } = useBayHolidays(city);
  const addHoliday = useAddBayHoliday();
  const deleteHoliday = useDeleteBayHoliday();

  const [newDate, setNewDate] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [scope, setScope] = useState<"city" | "bay">("city");

  const handleAdd = () => {
    if (!newDate) return;
    addHoliday.mutate({
      bay_id: scope === "bay" && bayId ? bayId : null,
      city,
      holiday_date: newDate,
      label: newLabel || "Holiday",
    });
    setNewDate("");
    setNewLabel("");
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
          <Plus className="h-4 w-4" />
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
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => deleteHoliday.mutate(h.id)}>
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
  const { data: peakHours = [], isLoading } = useBayPeakHours(bayId);
  const addPeakHour = useAddBayPeakHour();
  const deletePeakHour = useDeleteBayPeakHour();

  const [newDayOfWeek, setNewDayOfWeek] = useState<string>("default");
  const [newStart, setNewStart] = useState("17:00");
  const [newEnd, setNewEnd] = useState("21:00");

  const handleAdd = () => {
    if (!newStart || !newEnd) return;
    addPeakHour.mutate({
      bay_id: bayId,
      day_of_week: newDayOfWeek === "default" ? null : Number(newDayOfWeek),
      peak_start: newStart,
      peak_end: newEnd,
      sort_order: peakHours.length,
    });
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
            <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => deletePeakHour.mutate(p.id)}>
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
              <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => deletePeakHour.mutate(p.id)}>
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
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Day-specific entries override defaults. Multiple windows per day are supported.
      </p>
    </div>
  );
}
