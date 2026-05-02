import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  useStudentSearch,
  useSaveSession,
  useDeleteSession,
  useCoaches,
  useStudentBookings,
  type CoachingSession,
  type ToolLink,
} from "@/hooks/useCoaching";
import { useAuth } from "@/contexts/AuthContext";
import { useAllCities } from "@/hooks/useBookings";
import { Trash2, Search, Link2, Plus, X } from "lucide-react";
import { format, parseISO } from "date-fns";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  session?: CoachingSession | null;
  /** If provided, locks the student selector. */
  lockedStudentId?: string;
  lockedStudentLabel?: string;
  /** If true, show a coach picker (admin scheduling on behalf of a coach). */
  allowCoachPick?: boolean;
  /** Override coach (admin scheduling for someone else). Defaults to current user. */
  coachUserId?: string;
  defaultCity?: string;
}

export function SessionFormDialog({
  open,
  onOpenChange,
  session,
  lockedStudentId,
  lockedStudentLabel,
  allowCoachPick,
  coachUserId,
  defaultCity,
}: Props) {
  const { user } = useAuth();
  const { data: cities } = useAllCities();
  const { data: coachesList } = useCoaches();
  const save = useSaveSession();
  const del = useDeleteSession();

  const [pickedCoachId, setPickedCoachId] = useState<string>("");

  const [studentId, setStudentId] = useState<string>("");
  const [studentLabel, setStudentLabel] = useState<string>("");
  const [studentRegistered, setStudentRegistered] = useState<boolean>(true);
  const [search, setSearch] = useState("");
  const { data: searchResults } = useStudentSearch(search);

  const [city, setCity] = useState("");
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [notes, setNotes] = useState("");
  const [drills, setDrills] = useState("");
  const [progress, setProgress] = useState("");
  const [onformLinks, setOnformLinks] = useState<ToolLink[]>([]);
  const [sportsboxLinks, setSportsboxLinks] = useState<ToolLink[]>([]);
  const [superspeedLinks, setSuperspeedLinks] = useState<ToolLink[]>([]);
  const [otherLinks, setOtherLinks] = useState<ToolLink[]>([]);

  // Booking linkage
  const [linkBooking, setLinkBooking] = useState(false);
  const [bookingId, setBookingId] = useState<string>("");
  // Always fetch the student's recent/upcoming bookings as soon as ANY student
  // (registered or pre-registered/walk-in) is picked. Walk-in bookings store
  // profile.id in bookings.user_id, so the same lookup works for both.
  const { data: studentBookings } = useStudentBookings(
    studentId || undefined,
    undefined
  );

  // Bookings on the currently chosen session date (any city — we'll prompt to align).
  const sameDayBookings = useMemo(() => {
    if (!date) return [];
    return (studentBookings ?? []).filter(
      (b: any) => format(parseISO(b.start_time), "yyyy-MM-dd") === date
    );
  }, [studentBookings, date]);

  useEffect(() => {
    if (!open) return;
    if (session) {
      setPickedCoachId(session.coach_user_id);
      setStudentId(session.student_user_id);
      setStudentLabel(session.student_profile?.display_name || session.student_profile?.email || "Student");
      setStudentRegistered(true);
      setCity(session.city);
      setDate(session.session_date);
      setNotes(session.notes ?? "");
      setDrills(session.drills ?? "");
      setProgress(session.progress_summary ?? "");
      // Prefer new array fields; fall back to legacy single-URL fields
      const fromArrayOrLegacy = (arr: any, url?: string | null, label?: string | null): ToolLink[] => {
        if (Array.isArray(arr) && arr.length > 0) return arr.filter((l: any) => l && l.url);
        if (url && url.trim()) return [{ url, label: label || "" }];
        return [];
      };
      setOnformLinks(fromArrayOrLegacy((session as any).onform_links, session.onform_url));
      setSportsboxLinks(fromArrayOrLegacy((session as any).sportsbox_links, session.sportsbox_url));
      setSuperspeedLinks(fromArrayOrLegacy((session as any).superspeed_links, session.superspeed_url));
      setOtherLinks(fromArrayOrLegacy((session as any).other_links, session.other_url, session.other_label));
      setLinkBooking(!!session.booking_id);
      setBookingId(session.booking_id ?? "");
    } else {
      setPickedCoachId(coachUserId ?? user?.id ?? "");
      setStudentId(lockedStudentId ?? "");
      setStudentLabel(lockedStudentLabel ?? "");
      setStudentRegistered(true);
      setSearch("");
      setCity(defaultCity ?? "");
      setDate(format(new Date(), "yyyy-MM-dd"));
      setNotes("");
      setDrills("");
      setProgress("");
      setOnformLinks([]);
      setSportsboxLinks([]);
      setSuperspeedLinks([]);
      setOtherLinks([]);
      setLinkBooking(false);
      setBookingId("");
    }
  }, [open, session, lockedStudentId, lockedStudentLabel, defaultCity, coachUserId, user?.id]);

  const effectiveCoachId = pickedCoachId || coachUserId || user?.id || "";
  const canSubmit = !!studentId && !!city && !!date && !!effectiveCoachId && !save.isPending;

  // Auto-fill date + city when a booking is selected
  const onPickBooking = (id: string) => {
    setBookingId(id);
    const b = (studentBookings ?? []).find((x: any) => x.id === id);
    if (b) {
      setDate(format(parseISO(b.start_time), "yyyy-MM-dd"));
      if (b.city) setCity(b.city);
    }
  };

  const missingHint = useMemo(() => {
    const m: string[] = [];
    if (!studentId) m.push("student");
    if (!city) m.push("city");
    if (!date) m.push("date");
    return m.length ? `Pick a ${m.join(", ")} to save.` : "";
  }, [studentId, city, date]);

  const cleanLinks = (arr: ToolLink[]) =>
    arr
      .map((l) => ({ url: (l.url || "").trim(), label: (l.label || "").trim() }))
      .filter((l) => l.url);

  const handleSave = async () => {
    if (!user || !effectiveCoachId) return;
    await save.mutateAsync({
      id: session?.id,
      coach_user_id: effectiveCoachId,
      student_user_id: studentId,
      city,
      session_date: date,
      notes: notes || null,
      drills: drills || null,
      progress_summary: progress || null,
      onform_links: cleanLinks(onformLinks),
      sportsbox_links: cleanLinks(sportsboxLinks),
      superspeed_links: cleanLinks(superspeedLinks),
      other_links: cleanLinks(otherLinks),
      booking_id: linkBooking && bookingId ? bookingId : null,
    });
    onOpenChange(false);
  };

  const handleDelete = async () => {
    if (!session) return;
    if (!confirm("Delete this session? This cannot be undone.")) return;
    await del.mutateAsync(session.id);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{session ? "Edit Session" : "New Coaching Session"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Coach picker (admin only) */}
          {allowCoachPick && (
            <div className="space-y-1.5">
              <Label>Coach</Label>
              <Select value={pickedCoachId} onValueChange={setPickedCoachId}>
                <SelectTrigger><SelectValue placeholder="Select coach" /></SelectTrigger>
                <SelectContent>
                  {(coachesList ?? []).filter(c => c.is_active).map((c) => (
                    <SelectItem key={c.user_id} value={c.user_id}>
                      {c.profile?.display_name || c.profile?.email} · {c.city}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Student */}
          <div className="space-y-1.5">
            <Label>Student</Label>
            {lockedStudentId || studentId ? (
              <div className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2 text-sm">
                <span className="truncate">
                  {studentLabel || "Selected"}
                  {!studentRegistered && (
                    <span className="ml-2 text-xs text-muted-foreground">(pre-registered)</span>
                  )}
                </span>
                {!lockedStudentId && !session && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => { setStudentId(""); setStudentLabel(""); setStudentRegistered(true); }}>
                    Change
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search by name or email…"
                    className="pl-8"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Works for both registered members and pre-registered profiles (e.g. walk-ins).
                </p>
                {search.length >= 2 && (
                  <div className="max-h-48 overflow-y-auto rounded-md border">
                    {(searchResults ?? []).length === 0 ? (
                      <div className="p-3 text-sm text-muted-foreground">No matches</div>
                    ) : (
                      (searchResults ?? []).map((p: any) => (
                        <button
                          key={p.resolved_id}
                          type="button"
                          onClick={() => {
                            setStudentId(p.resolved_id);
                            setStudentLabel(p.display_name || p.email);
                            setStudentRegistered(!!p.is_registered);
                            setSearch("");
                          }}
                          className="block w-full text-left px-3 py-2 text-sm hover:bg-muted"
                        >
                          <div className="font-medium flex items-center gap-2">
                            {p.display_name || "—"}
                            {!p.is_registered && (
                              <span className="text-[10px] uppercase tracking-wide rounded bg-muted px-1.5 py-0.5 text-muted-foreground">
                                pre-registered
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground">{p.email}</div>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Proactive same-day booking match */}
          {studentId && studentRegistered && sameDayBookings.length > 0 && !bookingId && (
            <div className="rounded-md border border-primary/40 bg-primary/5 p-3 space-y-2">
              <div className="text-sm font-medium flex items-center gap-2">
                <Link2 className="h-4 w-4 text-primary" />
                {sameDayBookings.length === 1
                  ? "This student has a booking on this date"
                  : `This student has ${sameDayBookings.length} bookings on this date`}
              </div>
              <p className="text-xs text-muted-foreground">
                Link this session to the matching booking to avoid duplicates.
              </p>
              <div className="space-y-1.5">
                {sameDayBookings.map((b: any) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => { setLinkBooking(true); onPickBooking(b.id); }}
                    className="w-full text-left rounded border bg-background hover:bg-muted px-3 py-2 text-sm flex items-center justify-between gap-2"
                  >
                    <span className="truncate">
                      {format(parseISO(b.start_time), "h:mm a")} · {b.bay_name} · {b.city}
                      <span className="ml-1 text-xs text-muted-foreground">({b.session_type || "session"})</span>
                    </span>
                    <span className="text-xs text-primary font-medium shrink-0">Link</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Link to booking (manual) */}
          {studentId && studentRegistered && (
            <div className="rounded-md border p-3 space-y-2">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-2 cursor-pointer">
                  <Link2 className="h-4 w-4 text-muted-foreground" />
                  Link to a booked slot
                </Label>
                <Switch checked={linkBooking} onCheckedChange={(v) => { setLinkBooking(v); if (!v) setBookingId(""); }} />
              </div>
              {linkBooking && (
                <div className="space-y-1.5">
                  <Select value={bookingId} onValueChange={onPickBooking}>
                    <SelectTrigger>
                      <SelectValue placeholder={
                        (studentBookings?.length ?? 0) === 0 ? "No bookings found in last 30 / next 14 days" : "Select a booking"
                      } />
                    </SelectTrigger>
                    <SelectContent>
                      {(studentBookings ?? []).map((b: any) => (
                        <SelectItem key={b.id} value={b.id}>
                          {format(parseISO(b.start_time), "MMM d, h:mm a")} · {b.bay_name} · {b.city} · {b.session_type || "session"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Date and city auto-fill from the selected booking. Works for both practice and coaching slots.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* City + Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>City</Label>
              <Select value={city} onValueChange={setCity}>
                <SelectTrigger><SelectValue placeholder="Select city" /></SelectTrigger>
                <SelectContent>
                  {(cities ?? []).map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Session Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>

          {/* Notes / drills / progress */}
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="What you worked on…" />
          </div>
          <div className="space-y-1.5">
            <Label>Drills</Label>
            <Textarea value={drills} onChange={(e) => setDrills(e.target.value)} rows={3} placeholder="Drills assigned…" />
          </div>
          <div className="space-y-1.5">
            <Label>Progress Summary</Label>
            <Textarea value={progress} onChange={(e) => setProgress(e.target.value)} rows={2} placeholder="Summary visible on the card…" />
          </div>

          {/* External tools */}
          <div className="grid grid-cols-1 gap-3">
            <div className="space-y-1.5">
              <Label>Onform link</Label>
              <Input value={onform} onChange={(e) => setOnform(e.target.value)} placeholder="https://…" />
            </div>
            <div className="space-y-1.5">
              <Label>Sportsbox AI link</Label>
              <Input value={sportsbox} onChange={(e) => setSportsbox(e.target.value)} placeholder="https://…" />
            </div>
            <div className="space-y-1.5">
              <Label>Superspeed link</Label>
              <Input value={superspeed} onChange={(e) => setSuperspeed(e.target.value)} placeholder="https://…" />
            </div>
            <div className="space-y-1.5">
              <Label>Other link</Label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <Input
                  value={otherLabel}
                  onChange={(e) => setOtherLabel(e.target.value)}
                  placeholder="Label (e.g. Drive, YouTube)"
                  className="sm:col-span-1"
                />
                <Input
                  value={otherUrl}
                  onChange={(e) => setOtherUrl(e.target.value)}
                  placeholder="https://…"
                  className="sm:col-span-2"
                />
              </div>
              <p className="text-xs text-muted-foreground">Add any external resource (Google Drive, YouTube, etc.).</p>
            </div>
          </div>
        </div>

        <DialogFooter className="flex-col-reverse sm:flex-row gap-2 items-stretch sm:items-center">
          {session && (
            <Button type="button" variant="ghost" className="text-destructive sm:mr-auto" onClick={handleDelete}>
              <Trash2 className="mr-1.5 h-4 w-4" />
              Delete
            </Button>
          )}
          {!canSubmit && missingHint && (
            <span className="text-xs text-muted-foreground sm:mr-2">{missingHint}</span>
          )}
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="button" onClick={handleSave} disabled={!canSubmit}>
            {save.isPending ? "Saving…" : "Save Session"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
