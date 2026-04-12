import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Plus, Ban, Calendar, Clock, Users, X, RefreshCw } from "lucide-react";
import { format } from "date-fns";
import {
  useBayAvailability,
  useBayBookings,
  useCreateBayBooking,
  useCancelBayBooking,
  useJoinBayBooking,
  useRescheduleBayBooking,
  useBayBlocks,
  useCreateBayBlock,
  useRemoveBayBlock,
  useTenantBays,
} from "@/hooks/useLeagues";
import type { League, LeagueBayBooking } from "@/types/league";

interface Props {
  league: League;
  tenantId: string;
}

export function BaySchedulingPanel({ league, tenantId }: Props) {
  const today = format(new Date(), "yyyy-MM-dd");
  const [selectedDate, setSelectedDate] = useState(today);

  const { data: availability, isLoading: availLoading } = useBayAvailability(league.id, selectedDate);
  const { data: bookings, isLoading: bookingsLoading } = useBayBookings(league.id, selectedDate);
  const { data: blocks } = useBayBlocks(league.id);
  const { data: bays } = useTenantBays(tenantId);

  const cancelBooking = useCancelBayBooking(league.id);

  const isLoading = availLoading || bookingsLoading;

  return (
    <div className="space-y-4">
      {/* Date selector + actions */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <Input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="w-[180px]"
          />
        </div>
        <CreateBookingDialog league={league} tenantId={tenantId} bays={bays || []} defaultDate={selectedDate} />
        <BlockBayDialog league={league} bays={bays || []} />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : (
        <>
          {/* Availability overview */}
          {availability && availability.bays.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {availability.bays.map((bay) => {
                const bayBookings = availability.bookings.filter((b) => b.bay_id === bay.id);
                const bayBlocks = availability.blocks.filter((b) => b.bay_id === bay.id);
                return (
                  <Card key={bay.id} className="border">
                    <CardHeader className="pb-2 pt-3 px-4">
                      <CardTitle className="text-sm font-medium flex items-center justify-between">
                        {bay.name}
                        <span className="text-xs text-muted-foreground font-normal">
                          {bay.open_time}–{bay.close_time}
                        </span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="px-4 pb-3 space-y-1">
                      {bayBookings.length === 0 && bayBlocks.length === 0 ? (
                        <p className="text-xs text-green-600">Available all day</p>
                      ) : (
                        <>
                          {bayBookings.map((b, i) => (
                            <div key={i} className="flex items-center gap-1 text-xs">
                              <Clock className="h-3 w-3 text-primary" />
                              <span>{format(new Date(b.scheduled_at), "HH:mm")}–{format(new Date(b.scheduled_end), "HH:mm")}</span>
                              <Users className="h-3 w-3 ml-1" />
                              <span>{b.players.length}/{b.max_players}</span>
                            </div>
                          ))}
                          {bayBlocks.map((b, i) => (
                            <div key={`bl-${i}`} className="flex items-center gap-1 text-xs text-destructive">
                              <Ban className="h-3 w-3" />
                              <span>{format(new Date(b.blocked_from), "HH:mm")}–{format(new Date(b.blocked_to), "HH:mm")} Blocked</span>
                            </div>
                          ))}
                        </>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {/* Bookings table */}
          <div>
            <h4 className="text-sm font-medium mb-2">Bookings for {format(new Date(selectedDate + "T00:00:00"), "PP")}</h4>
            {(!bookings || bookings.length === 0) ? (
              <p className="text-sm text-muted-foreground py-4">No bookings for this date.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Bay</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Players</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bookings.map((b) => {
                    const bayName = bays?.find((bay) => bay.id === b.bay_id)?.name || b.bay_id.slice(0, 8);
                    return (
                      <TableRow key={b.id}>
                        <TableCell className="font-medium">{bayName}</TableCell>
                        <TableCell>{format(new Date(b.scheduled_at), "HH:mm")}–{format(new Date(b.scheduled_end), "HH:mm")}</TableCell>
                        <TableCell>{b.duration_minutes}m</TableCell>
                        <TableCell>
                          <Badge variant="secondary">{b.players.length}/{b.max_players}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{b.booking_method.replace("_", " ")}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={b.status === "confirmed" ? "default" : "destructive"}>{b.status}</Badge>
                        </TableCell>
                        <TableCell>
                          {b.status === "confirmed" && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-destructive"
                              onClick={() => cancelBooking.mutate(b.id)}
                              disabled={cancelBooking.isPending}
                            >
                              <X className="h-3.5 w-3.5 mr-1" /> Cancel
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </div>

          {/* Active blocks */}
          {blocks && blocks.length > 0 && (
            <div>
              <h4 className="text-sm font-medium mb-2">Active Bay Blocks</h4>
              <div className="space-y-2">
                {blocks.map((block) => {
                  const bayName = bays?.find((b) => b.id === block.bay_id)?.name || block.bay_id.slice(0, 8);
                  return (
                    <div key={block.id} className="flex items-center justify-between border rounded-md p-2 text-sm">
                      <div>
                        <span className="font-medium">{bayName}</span>
                        <span className="text-muted-foreground ml-2">
                          {format(new Date(block.blocked_from), "PP HH:mm")} – {format(new Date(block.blocked_to), "PP HH:mm")}
                        </span>
                        {block.reason && <span className="text-muted-foreground ml-2">· {block.reason}</span>}
                      </div>
                      <RemoveBlockButton leagueId={league.id} blockId={block.id} />
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Create Booking Dialog ────────────────────────────────────
function CreateBookingDialog({
  league,
  tenantId,
  bays,
  defaultDate,
}: {
  league: League;
  tenantId: string;
  bays: { id: string; name: string }[];
  defaultDate: string;
}) {
  const [open, setOpen] = useState(false);
  const [bayId, setBayId] = useState("");
  const [time, setTime] = useState("10:00");
  const [duration, setDuration] = useState("60");
  const [maxPlayers, setMaxPlayers] = useState("4");
  const [notes, setNotes] = useState("");
  const createBooking = useCreateBayBooking(league.id);

  const handleCreate = () => {
    if (!bayId) return;
    const scheduledAt = new Date(`${defaultDate}T${time}:00`).toISOString();
    createBooking.mutate(
      {
        bay_id: bayId,
        scheduled_at: scheduledAt,
        duration_minutes: parseInt(duration),
        max_players: parseInt(maxPlayers),
        booking_method: "admin_assigned",
        notes: notes || undefined,
      },
      {
        onSuccess: () => {
          setOpen(false);
          setBayId("");
          setNotes("");
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" disabled={league.status !== "active"}>
          <Plus className="h-4 w-4 mr-1" /> Book Bay
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Book a Bay</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Bay</Label>
            <Select value={bayId} onValueChange={setBayId}>
              <SelectTrigger>
                <SelectValue placeholder="Select bay" />
              </SelectTrigger>
              <SelectContent>
                {bays.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Time</Label>
              <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
            <div>
              <Label>Duration (min)</Label>
              <Select value={duration} onValueChange={setDuration}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[30, 60, 90, 120].map((d) => (
                    <SelectItem key={d} value={String(d)}>
                      {d} min
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Max Players</Label>
            <Input type="number" min={1} max={8} value={maxPlayers} onChange={(e) => setMaxPlayers(e.target.value)} />
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes" rows={2} />
          </div>
          <Button onClick={handleCreate} disabled={createBooking.isPending || !bayId} className="w-full">
            {createBooking.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Create Booking
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Block Bay Dialog ─────────────────────────────────────────
function BlockBayDialog({ league, bays }: { league: League; bays: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const [bayId, setBayId] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [fromTime, setFromTime] = useState("09:00");
  const [toDate, setToDate] = useState("");
  const [toTime, setToTime] = useState("18:00");
  const [reason, setReason] = useState("");
  const createBlock = useCreateBayBlock(league.id);

  const handleBlock = () => {
    if (!bayId || !fromDate || !toDate) return;
    createBlock.mutate(
      {
        bay_id: bayId,
        blocked_from: new Date(`${fromDate}T${fromTime}:00`).toISOString(),
        blocked_to: new Date(`${toDate}T${toTime}:00`).toISOString(),
        reason: reason || undefined,
      },
      {
        onSuccess: () => {
          setOpen(false);
          setBayId("");
          setReason("");
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Ban className="h-4 w-4 mr-1" /> Block Bay
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Block a Bay</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Bay</Label>
            <Select value={bayId} onValueChange={setBayId}>
              <SelectTrigger>
                <SelectValue placeholder="Select bay" />
              </SelectTrigger>
              <SelectContent>
                {bays.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>From Date</Label>
              <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
            </div>
            <div>
              <Label>From Time</Label>
              <Input type="time" value={fromTime} onChange={(e) => setFromTime(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>To Date</Label>
              <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
            </div>
            <div>
              <Label>To Time</Label>
              <Input type="time" value={toTime} onChange={(e) => setToTime(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Reason</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Maintenance" />
          </div>
          <Button onClick={handleBlock} disabled={createBlock.isPending || !bayId} className="w-full">
            {createBlock.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Block Bay
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Remove Block Button ──────────────────────────────────────
function RemoveBlockButton({ leagueId, blockId }: { leagueId: string; blockId: string }) {
  const removeBlock = useRemoveBayBlock(leagueId);
  return (
    <Button
      size="sm"
      variant="ghost"
      className="text-destructive"
      onClick={() => removeBlock.mutate(blockId)}
      disabled={removeBlock.isPending}
    >
      <X className="h-3.5 w-3.5" />
    </Button>
  );
}
