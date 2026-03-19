import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useEvents } from "@/hooks/useEvents";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

function EventForm({ event, onSave, onCancel }: { event?: any; onSave: (data: any) => void; onCancel: () => void }) {
  const [form, setForm] = useState({
    title: event?.title ?? "",
    description: event?.description ?? "",
    date: event?.date ?? "",
    time_start: event?.time_start ?? "",
    time_end: event?.time_end ?? "",
    location: event?.location ?? "",
    spots_total: event?.spots_total ?? 0,
    spots_taken: event?.spots_taken ?? 0,
    type: event?.type ?? "social",
    prize: event?.prize ?? "",
    price: event?.price ?? "",
    is_active: event?.is_active ?? true,
  });

  return (
    <div className="space-y-4">
      <div><Label>Title</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
      <div><Label>Description</Label><RichTextEditor content={form.description} onChange={(html) => setForm({ ...form, description: html })} minHeight="120px" /></div>
      <div className="grid grid-cols-2 gap-4">
        <div><Label>Date</Label><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
        <div><Label>Type</Label>
          <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="tournament">Tournament</SelectItem>
              <SelectItem value="clinic">Clinic</SelectItem>
              <SelectItem value="social">Social</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div><Label>Start Time</Label><Input value={form.time_start} onChange={(e) => setForm({ ...form, time_start: e.target.value })} placeholder="10:00 AM" /></div>
        <div><Label>End Time</Label><Input value={form.time_end} onChange={(e) => setForm({ ...form, time_end: e.target.value })} placeholder="4:00 PM" /></div>
      </div>
      <div><Label>Location</Label><Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></div>
      <div className="grid grid-cols-2 gap-4">
        <div><Label>Total Spots</Label><Input type="number" value={form.spots_total} onChange={(e) => setForm({ ...form, spots_total: Number(e.target.value) })} /></div>
        <div><Label>Spots Taken</Label><Input type="number" value={form.spots_taken} onChange={(e) => setForm({ ...form, spots_taken: Number(e.target.value) })} /></div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div><Label>Prize</Label><Input value={form.prize} onChange={(e) => setForm({ ...form, prize: e.target.value })} /></div>
        <div><Label>Price</Label><Input value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></div>
      </div>
      <div className="flex items-center gap-2"><Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} /><Label>Active</Label></div>
      <div className="flex gap-2 justify-end">
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button onClick={() => onSave(form)}>Save</Button>
      </div>
    </div>
  );
}

export function AdminEventsTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: events, isLoading } = useEvents();
  const [editingEvent, setEditingEvent] = useState<any>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const handleSave = async (data: any) => {
    const { error } = editingEvent?.id
      ? await supabase.from("events").update(data).eq("id", editingEvent.id)
      : await supabase.from("events").insert(data);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: editingEvent?.id ? "Event updated" : "Event created" });
    queryClient.invalidateQueries({ queryKey: ["events"] });
    setEditingEvent(null);
    setDialogOpen(false);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("events").delete().eq("id", id);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Deleted successfully" });
    queryClient.invalidateQueries({ queryKey: ["events"] });
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) setEditingEvent(null); }}>
          <DialogTrigger asChild>
            <Button onClick={() => setEditingEvent({})}><Plus className="mr-2 h-4 w-4" />Add Event</Button>
          </DialogTrigger>
          <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-lg">
            <DialogHeader><DialogTitle>{editingEvent?.id ? "Edit Event" : "New Event"}</DialogTitle></DialogHeader>
            <EventForm event={editingEvent} onSave={handleSave} onCancel={() => { setDialogOpen(false); setEditingEvent(null); }} />
          </DialogContent>
        </Dialog>
      </div>
      {isLoading ? <Loader2 className="mx-auto h-8 w-8 animate-spin" /> : (
        <div className="space-y-3">
          {(events ?? []).length === 0 && <p className="text-center text-muted-foreground py-8">No events yet.</p>}
          {(events ?? []).map((event) => (
            <Card key={event.id} className="shadow-elegant">
              <CardContent className="flex items-center justify-between p-4">
                <div>
                  <h3 className="font-medium text-foreground">{event.title}</h3>
                  <p className="text-sm text-muted-foreground">{event.date} · {event.type}</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="icon" onClick={() => { setEditingEvent(event); setDialogOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="outline" size="icon" onClick={() => handleDelete(event.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
