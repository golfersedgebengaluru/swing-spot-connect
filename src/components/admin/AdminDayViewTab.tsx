import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addDays, format } from "date-fns";
import { CalendarOff, ChevronLeft, ChevronRight, CloudOff, Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useAdminCity } from "@/contexts/AdminCityContext";
import { useBayConfig, useBays } from "@/hooks/useBookings";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  SLOT_MINUTES, formatTimeInZone, hhmmToMinutes, placeItemsForBay, zonedTimeToUtc, type ScheduleItem,
} from "@/lib/day-schedule";

const PX_PER_MIN = 1; // 30 px per half hour
const ALL_BAYS = "all";

interface DayBay { id: string; name: string; open_time?: string | null; close_time?: string | null; extended_open_time?: string | null; extended_close_time?: string | null; sort_order?: number | null }

/** All bays of one city for one day, read from app records (the booking record of truth). */
export function AdminDayViewTab() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { selectedCity, availableCities } = useAdminCity();
  const [city, setCity] = useState(selectedCity || "");
  useEffect(() => {
    if (selectedCity) setCity(selectedCity);
    else if (!city && availableCities.length) setCity(availableCities[0]);
  }, [selectedCity, availableCities]); // eslint-disable-line react-hooks/exhaustive-deps

  const [date, setDate] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const { data: allBays } = useBays();
  const { data: configs } = useBayConfig();
  const config = (configs ?? []).find((c: { city: string }) => c.city === city);
  const timezone: string = config?.timezone || "Asia/Kolkata";
  const usesApp = config?.availability_source === "app";

  const bays: DayBay[] = useMemo(
    () => ((allBays ?? []) as (DayBay & { city: string; is_active: boolean })[])
      .filter((b) => b.city === city && b.is_active)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name)),
    [allBays, city],
  );

  const dayStartUtc = useMemo(() => zonedTimeToUtc(date, "00:00", timezone), [date, timezone]);
  const nextDay = format(addDays(new Date(`${date}T12:00:00`), 1), "yyyy-MM-dd");
  const dayEndUtc = useMemo(() => zonedTimeToUtc(nextDay, "00:00", timezone), [nextDay, timezone]);

  const { data: items = [], isLoading, error } = useQuery({
    queryKey: ["bay_day_schedule", city, date, timezone],
    enabled: !!city,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("bay_day_schedule", {
        p_city: city, p_from: dayStartUtc.toISOString(), p_to: dayEndUtc.toISOString(),
      });
      if (error) throw error;
      return (data ?? []) as ScheduleItem[];
    },
  });

  // Visible window: earliest opening to latest closing, widened to fit any entry.
  const [windowStart, windowEnd] = useMemo(() => {
    let start = Math.min(...bays.map((b) => hhmmToMinutes(b.extended_open_time || b.open_time, 6 * 60)), 24 * 60);
    let end = Math.max(...bays.map((b) => hhmmToMinutes(b.extended_close_time || b.close_time, 23 * 60)), 0);
    if (!bays.length) { start = 6 * 60; end = 23 * 60; }
    for (const i of items) {
      start = Math.min(start, Math.max(0, (Date.parse(i.start_time) - dayStartUtc.getTime()) / 60_000));
      end = Math.max(end, Math.min(24 * 60, (Date.parse(i.end_time) - dayStartUtc.getTime()) / 60_000));
    }
    start = Math.floor(start / SLOT_MINUTES) * SLOT_MINUTES;
    end = Math.ceil(end / SLOT_MINUTES) * SLOT_MINUTES;
    return [start, Math.max(end, start + SLOT_MINUTES)];
  }, [bays, items, dayStartUtc]);

  const rows = useMemo(() => {
    const out: number[] = [];
    for (let m = windowStart; m < windowEnd; m += SLOT_MINUTES) out.push(m);
    return out;
  }, [windowStart, windowEnd]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["bay_day_schedule", city] });

  const removeBlockout = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("bay_blockouts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { refresh(); queryClient.invalidateQueries({ queryKey: ["available_slots"] }); toast({ title: "Block-out removed" }); },
    onError: (e: Error) => toast({ title: "Could not remove block-out", description: e.message, variant: "destructive" }),
  });

  const syncToGoogle = useMutation({
    mutationFn: async (bookingId: string) => {
      const res = await supabase.functions.invoke("calendar-sync", { body: { action: "sync_booking_to_google", booking_id: bookingId } });
      if (res.error) throw new Error(res.error.message);
      if (res.data?.error) throw new Error(res.data.error);
    },
    onSuccess: () => { refresh(); toast({ title: "Copied to Google Calendar" }); },
    onError: (e: Error) => toast({ title: "Not copied to Google", description: e.message, variant: "destructive" }),
  });

  const [blockOpen, setBlockOpen] = useState(false);
  const [blockBay, setBlockBay] = useState(ALL_BAYS);
  const [blockFrom, setBlockFrom] = useState("");
  const [blockTo, setBlockTo] = useState("");
  const [blockReason, setBlockReason] = useState("");
  const addBlockout = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Please sign in again");
      if (!blockFrom || !blockTo || blockTo <= blockFrom) throw new Error("End time must be after start time");
      const { error } = await supabase.from("bay_blockouts").insert({
        city,
        bay_id: blockBay === ALL_BAYS ? null : blockBay,
        start_time: zonedTimeToUtc(date, blockFrom, timezone).toISOString(),
        end_time: zonedTimeToUtc(date, blockTo, timezone).toISOString(),
        reason: blockReason.trim().slice(0, 200),
        created_by: user.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setBlockOpen(false);
      setBlockReason("");
      refresh();
      queryClient.invalidateQueries({ queryKey: ["available_slots"] });
      toast({ title: "Time blocked" });
    },
    onError: (e: Error) => toast({ title: "Could not block time", description: e.message, variant: "destructive" }),
  });

  const minutesLabel = (m: number) => {
    const h = Math.floor(m / 60) % 24;
    const mm = m % 60;
    const suffix = h < 12 ? "AM" : "PM";
    return `${h % 12 === 0 ? 12 : h % 12}:${String(mm).padStart(2, "0")} ${suffix}`;
  };

  const shiftDay = (days: number) => setDate(format(addDays(new Date(`${date}T12:00:00`), days), "yyyy-MM-dd"));
  const missingOnGoogle = items.filter((i) => i.kind === "booking" && !i.on_google).length;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Day View</CardTitle>
          <p className="text-sm text-muted-foreground">
            Every bay for one day, from app bookings and block-outs. Times are shown in {timezone}.
            {!usesApp && city ? " This city still takes availability from Google Calendar; block-outs here count once the city is switched to the app calendar." : ""}
          </p>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          {!selectedCity && availableCities.length > 1 && (
            <div className="min-w-40">
              <Label className="text-xs">City</Label>
              <Select value={city} onValueChange={setCity}>
                <SelectTrigger><SelectValue placeholder="City" /></SelectTrigger>
                <SelectContent>{availableCities.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
          <div className="flex items-end gap-1">
            <Button variant="outline" size="icon" aria-label="Previous day" onClick={() => shiftDay(-1)}><ChevronLeft className="h-4 w-4" /></Button>
            <div>
              <Label className="text-xs" htmlFor="day-view-date">Date</Label>
              <Input id="day-view-date" type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} className="w-40" />
            </div>
            <Button variant="outline" size="icon" aria-label="Next day" onClick={() => shiftDay(1)}><ChevronRight className="h-4 w-4" /></Button>
          </div>
          <Button variant="outline" onClick={() => setDate(format(new Date(), "yyyy-MM-dd"))}>Today</Button>
          <Button onClick={() => { setBlockFrom(minutesLabelToInput(windowStart)); setBlockTo(minutesLabelToInput(windowStart + 60)); setBlockOpen(true); }} disabled={!city}>
            <Plus className="h-4 w-4 mr-1" /> Block time
          </Button>
          {usesApp && missingOnGoogle > 0 && (
            <Badge variant="outline" className="gap-1 border-destructive/40 text-destructive">
              <CloudOff className="h-3 w-3" /> {missingOnGoogle} not on Google yet
            </Badge>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {isLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : error ? (
            <p className="p-6 text-sm text-destructive">{(error as Error).message}</p>
          ) : !bays.length ? (
            <p className="p-6 text-sm text-muted-foreground">No active bays in this city.</p>
          ) : (
            <div className="flex min-w-max">
              <div className="w-20 shrink-0 border-r border-border">
                <div className="h-10 border-b border-border" />
                {rows.map((m) => (
                  <div key={m} className="border-b border-border/50 px-2 text-[11px] text-muted-foreground" style={{ height: SLOT_MINUTES * PX_PER_MIN }}>
                    {m % 60 === 0 ? minutesLabel(m) : ""}
                  </div>
                ))}
              </div>
              {bays.map((bay) => (
                <div key={bay.id} className="w-48 shrink-0 border-r border-border">
                  <div className="flex h-10 items-center border-b border-border px-2 text-sm font-medium truncate">{bay.name}</div>
                  <div className="relative" style={{ height: (windowEnd - windowStart) * PX_PER_MIN }}>
                    {rows.map((m) => (
                      <div key={m} className="border-b border-border/50" style={{ height: SLOT_MINUTES * PX_PER_MIN }} />
                    ))}
                    {placeItemsForBay(items, bay.id, dayStartUtc, windowStart, windowEnd).map((item) => (
                      <div
                        key={`${item.kind}-${item.id}`}
                        className={cn(
                          "absolute inset-x-1 overflow-hidden rounded-md border px-1.5 py-0.5 text-[11px] leading-tight",
                          item.kind === "booking" && "border-primary/40 bg-primary/10 text-foreground",
                          item.kind === "hold" && "border-dashed border-border bg-muted text-muted-foreground",
                          item.kind === "blockout" && "border-destructive/40 bg-destructive/10 text-foreground",
                        )}
                        style={{ top: item.top * PX_PER_MIN, height: Math.max(item.height * PX_PER_MIN - 2, 14) }}
                        title={`${item.label ?? ""} · ${formatTimeInZone(item.start_time, timezone)} – ${formatTimeInZone(item.end_time, timezone)}`}
                      >
                        <div className="flex items-start justify-between gap-1">
                          <span className="font-medium truncate">
                            {item.kind === "blockout" ? (item.label || "Blocked") : item.label}
                            {item.kind === "booking" && item.session_type === "coaching" ? " · Coaching" : ""}
                          </span>
                          {item.kind === "blockout" && (
                            <button aria-label="Remove block-out" className="shrink-0 text-muted-foreground hover:text-destructive" onClick={() => removeBlockout.mutate(item.id)}>
                              <Trash2 className="h-3 w-3" />
                            </button>
                          )}
                          {usesApp && item.kind === "booking" && !item.on_google && (
                            <button
                              aria-label="Copy to Google Calendar"
                              title="Not on Google yet — copy now"
                              className="shrink-0 text-destructive"
                              disabled={syncToGoogle.isPending}
                              onClick={() => syncToGoogle.mutate(item.id)}
                            >
                              <RefreshCw className={cn("h-3 w-3", syncToGoogle.isPending && "animate-spin")} />
                            </button>
                          )}
                        </div>
                        <div className="text-muted-foreground">
                          {formatTimeInZone(item.start_time, timezone)} – {formatTimeInZone(item.end_time, timezone)}
                          {item.kind === "blockout" && item.bay_id === null ? " · all bays" : ""}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-sm border border-primary/40 bg-primary/10" /> Booking</span>
        <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-sm border border-dashed border-border bg-muted" /> Payment in progress</span>
        <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-sm border border-destructive/40 bg-destructive/10" /> Blocked</span>
      </div>

      <Dialog open={blockOpen} onOpenChange={setBlockOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><CalendarOff className="h-4 w-4" /> Block time · {format(new Date(`${date}T12:00:00`), "EEE d MMM")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Bay</Label>
              <Select value={blockBay} onValueChange={setBlockBay}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_BAYS}>All bays</SelectItem>
                  {bays.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs" htmlFor="block-from">From</Label>
                <Input id="block-from" type="time" step={1800} value={blockFrom} onChange={(e) => setBlockFrom(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs" htmlFor="block-to">To</Label>
                <Input id="block-to" type="time" step={1800} value={blockTo} onChange={(e) => setBlockTo(e.target.value)} />
              </div>
            </div>
            <div>
              <Label className="text-xs" htmlFor="block-reason">Reason (optional)</Label>
              <Input id="block-reason" maxLength={200} value={blockReason} onChange={(e) => setBlockReason(e.target.value)} placeholder="e.g. Maintenance" />
            </div>
            <p className="text-xs text-muted-foreground">Times are in {timezone}. Existing bookings are not affected.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBlockOpen(false)}>Cancel</Button>
            <Button onClick={() => addBlockout.mutate()} disabled={addBlockout.isPending}>
              {addBlockout.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Block
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function minutesLabelToInput(minutes: number): string {
  const m = Math.min(minutes, 23 * 60 + 30);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}
