import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MapPin, Plus, Pencil, Trash2, Loader2, LayoutGrid } from "lucide-react";
import { useBays } from "@/hooks/useBookings";
import { CURRENCIES, getCurrencySymbol } from "@/lib/currencies";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

interface BayForm {
  id?: string;
  city: string;
  name: string;
  calendar_email: string;
  open_time: string;
  close_time: string;
  is_active: boolean;
  sort_order: number;
  coaching_mode: string;
  coaching_hours: number;
  coaching_cancellation_refund_hours: number;
  currency: string;
}

const emptyForm: BayForm = {
  city: "",
  name: "",
  calendar_email: "",
  open_time: "09:00",
  close_time: "22:00",
  is_active: true,
  sort_order: 0,
  coaching_mode: "instant",
  coaching_hours: 1,
  currency: "INR",
};

export function BayConfigTab() {
  const { data: bays, isLoading } = useBays();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<BayForm | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [newCity, setNewCity] = useState("");

  // Group bays by city
  const cities = Array.from(new Set((bays ?? []).map((b: any) => b.city))).sort();

  const handleSave = async () => {
    if (!editing) return;
    const payload = {
      city: editing.city,
      name: editing.name,
      calendar_email: editing.calendar_email || null,
      open_time: editing.open_time,
      close_time: editing.close_time,
      is_active: editing.is_active,
      sort_order: editing.sort_order,
      coaching_mode: editing.coaching_mode,
      coaching_hours: editing.coaching_hours,
      currency: editing.currency,
    };

    if (editing.id) {
      const { error } = await supabase.from("bays").update(payload).eq("id", editing.id);
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
      toast({ title: "Bay updated" });
    } else {
      const { error } = await supabase.from("bays").insert(payload);
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
      toast({ title: "Bay created" });
    }
    queryClient.invalidateQueries({ queryKey: ["bays"] });
    queryClient.invalidateQueries({ queryKey: ["bay_config"] });
    setEditing(null);
    setIsNew(false);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("bays").delete().eq("id", id);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Bay deleted" });
    queryClient.invalidateQueries({ queryKey: ["bays"] });
  };

  const handleAddBay = (city: string) => {
    const cityBays = (bays ?? []).filter((b: any) => b.city === city);
    const existingCurrency = cityBays[0]?.currency ?? "INR";
    setEditing({
      ...emptyForm,
      city,
      name: `${city} Bay #${cityBays.length + 1}`,
      sort_order: cityBays.length,
      currency: existingCurrency,
    });
    setIsNew(true);
  };

  const handleAddCity = () => {
    if (!newCity.trim()) return;
    setEditing({
      ...emptyForm,
      city: newCity.trim(),
      name: `${newCity.trim()} Bay #1`,
    });
    setIsNew(true);
    setNewCity("");
  };

  if (isLoading) return <Loader2 className="mx-auto h-8 w-8 animate-spin" />;

  return (
    <div className="space-y-6">
      {/* Add new city */}
      <Card className="shadow-elegant">
        <CardContent className="flex items-end gap-3 p-4">
          <div className="flex-1">
            <Label>Add New City</Label>
            <Input
              value={newCity}
              onChange={(e) => setNewCity(e.target.value)}
              placeholder="e.g. Hyderabad"
              className="mt-1"
            />
          </div>
          <Button onClick={handleAddCity} disabled={!newCity.trim()}>
            <Plus className="mr-2 h-4 w-4" /> Add City
          </Button>
        </CardContent>
      </Card>

      {/* Bays grouped by city */}
      {cities.map((city) => {
        const cityBays = (bays ?? []).filter((b: any) => b.city === city);
        return (
          <Card key={city} className="shadow-elegant">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                   <MapPin className="h-5 w-5" /> {city}
                   <Badge variant="secondary">{cityBays.length} bay{cityBays.length !== 1 ? "s" : ""}</Badge>
                   <Badge variant="outline">
                     {getCurrencySymbol(cityBays[0]?.currency ?? "INR")} {cityBays[0]?.currency ?? "INR"}
                   </Badge>
                 </span>
                <Button variant="outline" size="sm" onClick={() => handleAddBay(city)}>
                  <Plus className="mr-1 h-4 w-4" /> Add Bay
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {cityBays.map((bay: any) => (
                <div
                  key={bay.id}
                  className="flex items-center justify-between rounded-lg border border-border p-3"
                >
                  <div className="flex items-center gap-3">
                    <LayoutGrid className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-foreground">{bay.name}</span>
                        <Badge variant={bay.is_active ? "default" : "outline"} className={bay.is_active ? "bg-emerald-500/15 text-emerald-600 border-emerald-200" : ""}>
                          {bay.is_active ? "Active" : "Inactive"}
                        </Badge>
                        <Badge variant="outline" className={bay.coaching_mode === "approval_required" ? "text-amber-600 border-amber-300" : "text-muted-foreground"}>
                          {bay.coaching_mode === "approval_required" ? "Coaching: Approval" : "Coaching: Instant"}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {bay.open_time} – {bay.close_time} · {bay.calendar_email || "No calendar"} · Coaching: {bay.coaching_hours}h
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => { setEditing({ ...bay }); setIsNew(false); }}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(bay.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        );
      })}

      {/* Edit/Create dialog */}
      <Dialog open={!!editing} onOpenChange={(open) => { if (!open) { setEditing(null); setIsNew(false); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{isNew ? "Add Bay" : "Edit Bay"} — {editing?.city}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div>
                <Label>Bay Name</Label>
                <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="Bay #1" />
              </div>
              <div>
                <Label>Google Calendar Email</Label>
                <Input value={editing.calendar_email} onChange={(e) => setEditing({ ...editing, calendar_email: e.target.value })} placeholder="calendar@gmail.com" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Opening Time</Label>
                  <Input type="time" value={editing.open_time} onChange={(e) => setEditing({ ...editing, open_time: e.target.value })} />
                </div>
                <div>
                  <Label>Closing Time</Label>
                  <Input type="time" value={editing.close_time} onChange={(e) => setEditing({ ...editing, close_time: e.target.value })} />
                </div>
              </div>
              <div>
                <Label>Coaching Mode</Label>
                <Select value={editing.coaching_mode} onValueChange={(v) => setEditing({ ...editing, coaching_mode: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="instant">Instant Coaching</SelectItem>
                    <SelectItem value="approval_required">Admin Approval Required</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Currency</Label>
                <Select value={editing.currency} onValueChange={(v) => setEditing({ ...editing, currency: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((c) => (
                      <SelectItem key={c.code} value={c.code}>
                        {c.symbol} {c.code} — {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Coaching Hours per Session</Label>
                <Input type="number" step="0.5" min="0.5" value={editing.coaching_hours} onChange={(e) => setEditing({ ...editing, coaching_hours: Number(e.target.value) })} />
                <p className="text-xs text-muted-foreground mt-1">Hours deducted for coaching sessions</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Sort Order</Label>
                  <Input type="number" value={editing.sort_order} onChange={(e) => setEditing({ ...editing, sort_order: Number(e.target.value) })} />
                </div>
                <div className="flex items-center gap-2 pt-6">
                  <Switch checked={editing.is_active} onCheckedChange={(v) => setEditing({ ...editing, is_active: v })} />
                  <Label>Active</Label>
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => { setEditing(null); setIsNew(false); }}>Cancel</Button>
                <Button onClick={handleSave} disabled={!editing.name || !editing.city}>Save</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
