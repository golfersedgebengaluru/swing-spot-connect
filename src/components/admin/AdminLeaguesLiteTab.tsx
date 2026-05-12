import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Plus, Trash2, MapPin, Trophy, Pencil } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  useLeagueLiteVenues,
  useUpsertLeagueLiteVenue,
  useDeleteLeagueLiteVenue,
  useLeaguesLite,
  useUpsertLeagueLite,
  useDeleteLeagueLite,
  parseTeamSizes,
  type LeagueLite,
} from "@/hooks/useLeaguesLite";

// ── Venues panel ───────────────────────────────────────────────────────
export function VenuesPanel() {
  const { toast } = useToast();
  const { data: venues, isLoading } = useLeagueLiteVenues();
  const upsert = useUpsertLeagueLiteVenue();
  const del = useDeleteLeagueLiteVenue();
  const [name, setName] = useState("");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <MapPin className="h-4 w-4" /> League Venues
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          These venues are independent of the app's bays/cities and are only used by the League module.
        </p>
        <div className="flex items-center gap-2">
          <Input
            placeholder="New venue name…"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-9"
          />
          <Button
            size="sm"
            disabled={!name.trim() || upsert.isPending}
            onClick={async () => {
              try {
                await upsert.mutateAsync({ name: name.trim() });
                setName("");
                toast({ title: "Venue added" });
              } catch (err: any) {
                toast({ title: "Error", description: err.message, variant: "destructive" });
              }
            }}
          >
            {upsert.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Plus className="h-4 w-4 mr-1" />Add</>}
          </Button>
        </div>
        {isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <div className="space-y-2">
            {(venues ?? []).map((v) => (
              <div key={v.id} className="flex items-center justify-between border border-border rounded-md p-2">
                <div className="flex items-center gap-2 flex-1">
                  <Input
                    defaultValue={v.name}
                    className="h-8 text-sm flex-1 max-w-xs"
                    onBlur={async (e) => {
                      const next = e.target.value.trim();
                      if (next && next !== v.name) {
                        try {
                          await upsert.mutateAsync({ id: v.id, name: next, is_active: v.is_active });
                          toast({ title: "Renamed" });
                        } catch (err: any) {
                          toast({ title: "Error", description: err.message, variant: "destructive" });
                        }
                      }
                    }}
                  />
                  <div className="flex items-center gap-1">
                    <Switch
                      checked={v.is_active}
                      onCheckedChange={async (checked) => {
                        try {
                          await upsert.mutateAsync({ id: v.id, name: v.name, is_active: checked });
                        } catch (err: any) {
                          toast({ title: "Error", description: err.message, variant: "destructive" });
                        }
                      }}
                    />
                    <span className="text-xs text-muted-foreground">{v.is_active ? "Active" : "Inactive"}</span>
                  </div>
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete "{v.name}"?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This venue will be removed. Leagues currently linked to it will block the delete.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={async () => {
                          try {
                            await del.mutateAsync(v.id);
                            toast({ title: "Venue deleted" });
                          } catch (err: any) {
                            toast({ title: "Error", description: err.message, variant: "destructive" });
                          }
                        }}
                      >
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            ))}
            {(venues ?? []).length === 0 && (
              <p className="text-xs text-muted-foreground py-2">No venues yet — add one above.</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── League create/edit dialog ───────────────────────────────────────────
function LeagueDialog({
  open,
  onOpenChange,
  initial,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial: LeagueLite | null;
}) {
  const { toast } = useToast();
  const { data: venues } = useLeagueLiteVenues();
  const upsert = useUpsertLeagueLite();
  const venueUpsert = useUpsertLeagueLiteVenue();
  const venueDel = useDeleteLeagueLiteVenue();

  const [name, setName] = useState(initial?.name ?? "");
  const [isActive, setIsActive] = useState(initial?.is_active ?? true);
  const [showOnLanding, setShowOnLanding] = useState(initial?.show_on_landing ?? true);
  const [multiLocation, setMultiLocation] = useState(initial?.multi_location ?? false);
  const [teamSizesInput, setTeamSizesInput] = useState(
    (initial?.allowed_team_sizes ?? [2, 4]).join(","),
  );
  const [pricePerPerson, setPricePerPerson] = useState((initial?.price_per_person ?? 0).toString());
  const [currency, setCurrency] = useState(initial?.currency ?? "INR");
  const [selectedVenues, setSelectedVenues] = useState<Set<string>>(
    new Set(initial?.venues?.map((v) => v.id) ?? []),
  );
  const [newVenueName, setNewVenueName] = useState("");

  const allowedSizes = parseTeamSizes(teamSizesInput);
  const canSave =
    name.trim().length > 0 &&
    allowedSizes.length > 0 &&
    selectedVenues.size > 0;

  const handleAddVenue = async () => {
    const n = newVenueName.trim();
    if (!n) return;
    try {
      const v = await venueUpsert.mutateAsync({ name: n });
      setSelectedVenues((s) => new Set([...s, v.id]));
      setNewVenueName("");
      toast({ title: "Venue added" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleSubmit = async () => {
    try {
      await upsert.mutateAsync({
        id: initial?.id,
        name: name.trim(),
        is_active: isActive,
        show_on_landing: showOnLanding,
        multi_location: multiLocation,
        allowed_team_sizes: allowedSizes,
        price_per_person: parseFloat(pricePerPerson) || 0,
        currency,
        venue_ids: Array.from(selectedVenues),
      });
      toast({ title: initial ? "League updated" : "League created" });
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit League" : "New League"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-md border border-border p-3">
            <Switch checked={multiLocation} onCheckedChange={setMultiLocation} id="multi" />
            <div className="flex-1">
              <Label htmlFor="multi" className="text-sm">Multi-location league</Label>
              <p className="text-xs text-muted-foreground">
                Captain will pick a venue and name the league instance at join time.
              </p>
            </div>
          </div>

          <div>
            <Label className="text-xs">League Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Spring Doubles" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Allowed Team Sizes</Label>
              <Input
                value={teamSizesInput}
                onChange={(e) => setTeamSizesInput(e.target.value)}
                placeholder="2,4"
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Comma-separated. Parsed: {allowedSizes.length ? allowedSizes.join(", ") : "—"}
              </p>
            </div>
            <div>
              <Label className="text-xs">Price per person</Label>
              <Input
                type="number"
                min={0}
                value={pricePerPerson}
                onChange={(e) => setPricePerPerson(e.target.value)}
              />
            </div>
          </div>

          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={isActive} onCheckedChange={setIsActive} /> Active
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={showOnLanding} onCheckedChange={setShowOnLanding} /> Show on landing
            </label>
          </div>

          <div>
            <Label className="text-xs">Venues {multiLocation ? "(captain picks one)" : "(pick one)"}</Label>
            <div className="mt-2 space-y-2 max-h-40 overflow-y-auto rounded-md border border-border p-2">
              {(venues ?? []).filter((v) => v.is_active).map((v) => (
                <label key={v.id} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={selectedVenues.has(v.id)}
                    onCheckedChange={(c) => {
                      setSelectedVenues((s) => {
                        const next = new Set(s);
                        if (c) {
                          if (!multiLocation) next.clear();
                          next.add(v.id);
                        } else {
                          next.delete(v.id);
                        }
                        return next;
                      });
                    }}
                  />
                  {v.name}
                </label>
              ))}
              {(venues ?? []).filter((v) => v.is_active).length === 0 && (
                <p className="text-xs text-muted-foreground">No active venues — add one below.</p>
              )}
            </div>
            <div className="flex items-center gap-2 mt-2">
              <Input
                placeholder="Quick-add venue…"
                value={newVenueName}
                onChange={(e) => setNewVenueName(e.target.value)}
                className="h-8"
              />
              <Button size="sm" variant="outline" onClick={handleAddVenue} disabled={!newVenueName.trim() || venueUpsert.isPending}>
                {venueUpsert.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!canSave || upsert.isPending}>
            {upsert.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Leagues list ────────────────────────────────────────────────────────
export function LeaguesPanel() {
  const { toast } = useToast();
  const { data: leagues, isLoading } = useLeaguesLite();
  const del = useDeleteLeagueLite();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<LeagueLite | null>(null);

  const openNew = () => {
    setEditing(null);
    setDialogOpen(true);
  };
  const openEdit = (l: LeagueLite) => {
    setEditing(l);
    setDialogOpen(true);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Trophy className="h-4 w-4" /> Leagues
          </CardTitle>
          <Button size="sm" onClick={openNew}>
            <Plus className="h-4 w-4 mr-1" />New League
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <div className="space-y-2">
            {(leagues ?? []).map((l) => (
              <div key={l.id} className="flex flex-wrap items-center gap-2 border border-border rounded-md p-3">
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm">
                    {l.multi_location ? <span className="italic text-muted-foreground">— multi-location —</span> : l.name}
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {l.is_active ? <Badge variant="default" className="text-[10px]">Active</Badge> : <Badge variant="secondary" className="text-[10px]">Inactive</Badge>}
                    {l.show_on_landing && <Badge variant="outline" className="text-[10px]">On landing</Badge>}
                    {l.multi_location && <Badge variant="outline" className="text-[10px]">Multi-location</Badge>}
                    <Badge variant="outline" className="text-[10px]">Sizes: {l.allowed_team_sizes.join(",")}</Badge>
                    <Badge variant="outline" className="text-[10px]">{l.currency} {l.price_per_person}/person</Badge>
                    {(l.venues ?? []).map((v) => (
                      <Badge key={v.id} variant="secondary" className="text-[10px]">{v.name}</Badge>
                    ))}
                  </div>
                </div>
                <Button size="sm" variant="ghost" onClick={() => openEdit(l)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="sm" variant="ghost" className="text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete this league?</AlertDialogTitle>
                      <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={async () => {
                          try {
                            await del.mutateAsync(l.id);
                            toast({ title: "League deleted" });
                          } catch (err: any) {
                            toast({ title: "Error", description: err.message, variant: "destructive" });
                          }
                        }}
                      >
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            ))}
            {(leagues ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">No leagues yet.</p>
            )}
          </div>
        )}
      </CardContent>

      {dialogOpen && (
        <LeagueDialog
          key={editing?.id ?? "new"}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          initial={editing}
        />
      )}
    </Card>
  );
}

export function AdminLeaguesLiteTab() {
  return (
    <div className="space-y-6">
      <VenuesPanel />
      <LeaguesPanel />
      <p className="text-xs text-muted-foreground">
        Pricing per person can also be edited in the <strong>Pricing</strong> tab → "League Pricing" card.
      </p>
    </div>
  );
}
