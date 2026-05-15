import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAllCities } from "@/hooks/useBookings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Plus, Trophy, Users, Copy, Trash2, Eye, Image as ImageIcon, Calendar, UserPlus, UserMinus, Search, ChevronDown, ChevronRight, Edit, ListOrdered, Settings2, Shuffle, Lock, Unlock, BarChart3, Upload, MapPin } from "lucide-react";
import { BaySchedulingPanel } from "@/components/admin/league/BaySchedulingPanel";

import { SeasonWrapUpPanel } from "@/components/admin/league/SeasonWrapUpPanel";
import { LocationAssignCell } from "@/components/admin/league/LocationAssignCell";
import { AdminScoreEntryDialog } from "@/components/admin/league/AdminScoreEntryDialog";
import { QuickCompetitionDialog } from "@/components/admin/QuickCompetitionDialog";
import { QuickCompetitionConsole } from "@/components/admin/QuickCompetitionConsole";
import { useQuickCompetitions } from "@/hooks/useQuickCompetitions";
import { Zap } from "lucide-react";
import { format } from "date-fns";
import {
  useTenants,
  useCreateTenant,
  useLeagues,
  useCreateLeague,
  useUpdateLeague,
  useDeleteLeague,
  useJoinCodes,
  useCreateJoinCode,
  useRevokeJoinCode,
  useLeagueScores,
  useLeagueBranding,
  useUpdateBranding,
  useLeagueAuditLog,
  useTenantBays,
  useLeaguePlayers,
  useAddLeaguePlayer,
  useRemoveLeaguePlayer,
  useLeagueRounds,
  useCreateRound,
  useUpdateRound,
  useDeleteRound,
  useRoundCompetitions,
  useCreateCompetition,
  useUpdateCompetition,
  useDeleteCompetition,
  useLeagueTeams,
  useCreateTeam,
  useUpdateTeam,
  useDeleteTeam,
  useAddTeamMember,
  useRemoveTeamMember,
  useHiddenHoles,
  useHiddenHolesAdmin,
  useSetHiddenHoles,
  useCloseRound,
  useLeaderboard,
  useUpdateTenant,
  useLeagueCities,
  useLeagueLocations,
  useAssignPlayerLocation,
  useAssignTeamLocation,
  leagueServiceInvoke,
} from "@/hooks/useLeagues";
import { supabase } from "@/integrations/supabase/client";
import type { League, LeagueFormat, LeagueStatus, Tenant, LeagueRound, LeagueCompetition, LeagueTeam, LeaderboardEntry } from "@/types/league";
import type { LeaguePlayerWithProfile } from "@/hooks/useLeagues";
import { useRegisteredLegacyTeams } from "@/hooks/useLegacyLeagueRegistration";

// Parse a comma-separated string of team sizes (e.g. "2, 4") into a unique sorted int[].
function parseTeamSizes(input: string): number[] {
  return Array.from(
    new Set(
      input
        .split(",")
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => Number.isFinite(n) && n >= 1 && n <= 20),
    ),
  ).sort((a, b) => a - b);
}
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

// ── Inline assignment cells ──────────────────────────────────
function PlayerLocationCell({ leagueId, player }: { leagueId: string; player: LeaguePlayerWithProfile }) {
  const assign = useAssignPlayerLocation(leagueId);
  const inheritsFromTeam = !!player.team_id && (!!player.team_city_id || !!player.team_location_id);
  if (inheritsFromTeam) {
    return (
      <div className="space-y-1">
        <LocationAssignCell
          leagueId={leagueId}
          cityId={player.team_city_id ?? null}
          locationId={player.team_location_id ?? null}
          disabled
          onChange={() => {}}
        />
        <p className="text-[10px] text-muted-foreground italic">
          Inherited from team{player.team_name ? ` "${player.team_name}"` : ""}
        </p>
      </div>
    );
  }
  return (
    <LocationAssignCell
      leagueId={leagueId}
      cityId={player.league_city_id}
      locationId={player.league_location_id}
      disabled={assign.isPending}
      onChange={(body) => assign.mutate({ playerId: player.id, body })}
    />
  );
}

function TeamLocationCell({ leagueId, team }: { leagueId: string; team: LeagueTeam }) {
  const assign = useAssignTeamLocation(leagueId);
  return (
    <LocationAssignCell
      leagueId={leagueId}
      cityId={team.league_city_id}
      locationId={team.league_location_id}
      disabled={assign.isPending}
      onChange={(body) => assign.mutate({ teamId: team.id, body })}
    />
  );
}
import { useToast } from "@/hooks/use-toast";

// ── Status badge ─────────────────────────────────────────────
function StatusBadge({ status }: { status: LeagueStatus }) {
  const variants: Record<LeagueStatus, string> = {
    draft: "bg-muted text-muted-foreground",
    active: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    completed: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
    archived: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
  };
  return <Badge className={variants[status]}>{status}</Badge>;
}

// ── Sponsorship Toggle ───────────────────────────────────────
function SponsorshipToggle({ tenant }: { tenant: Tenant }) {
  const updateTenant = useUpdateTenant();
  return (
    <div className="flex items-center gap-2 text-sm">
      <Label htmlFor="sponsorship-toggle" className="text-muted-foreground cursor-pointer">Sponsorship</Label>
      <Switch
        id="sponsorship-toggle"
        checked={tenant.sponsorship_enabled}
        disabled={updateTenant.isPending}
        onCheckedChange={(checked) =>
          updateTenant.mutate({ tenantId: tenant.id, sponsorship_enabled: checked })
        }
      />
    </div>
  );
}

// ── Create Tenant Dialog ─────────────────────────────────────
function CreateTenantDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const createTenant = useCreateTenant();
  const { data: cities, isLoading: citiesLoading } = useAllCities();

  const handleCreate = () => {
    if (!name || !city) return;
    createTenant.mutate({ name, city }, {
      onSuccess: () => { setOpen(false); setName(""); setCity(""); },
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Add Tenant</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Create Tenant</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Franchise name" /></div>
          <div>
            <Label>City</Label>
            <Select value={city} onValueChange={setCity}>
              <SelectTrigger><SelectValue placeholder={citiesLoading ? "Loading cities…" : "Select a city"} /></SelectTrigger>
              <SelectContent>
                {(cities || []).map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleCreate} disabled={createTenant.isPending || !city} className="w-full">
            {createTenant.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Create
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Cities & Locations editor (in-memory) ────────────────────
type DraftLocation = { id?: string; tempId: string; name: string };
type DraftCity = { id?: string; tempId: string; name: string; locations: DraftLocation[] };

let __tempCounter = 0;
const newTempId = () => `tmp_${Date.now()}_${++__tempCounter}`;

function CitiesLocationsEditor({
  cities,
  setCities,
}: {
  cities: DraftCity[];
  setCities: (next: DraftCity[]) => void;
}) {
  const [newCityName, setNewCityName] = useState("");
  const addCity = () => {
    const name = newCityName.trim();
    if (!name) return;
    setCities([...cities, { tempId: newTempId(), name, locations: [] }]);
    setNewCityName("");
  };
  const removeCity = (tempId: string) =>
    setCities(cities.filter((c) => c.tempId !== tempId));
  const renameCity = (tempId: string, name: string) =>
    setCities(cities.map((c) => (c.tempId === tempId ? { ...c, name } : c)));
  const addLocation = (cityTempId: string, name: string) => {
    if (!name.trim()) return;
    setCities(
      cities.map((c) =>
        c.tempId === cityTempId
          ? { ...c, locations: [...c.locations, { tempId: newTempId(), name: name.trim() }] }
          : c,
      ),
    );
  };
  const removeLocation = (cityTempId: string, locTempId: string) =>
    setCities(
      cities.map((c) =>
        c.tempId === cityTempId
          ? { ...c, locations: c.locations.filter((l) => l.tempId !== locTempId) }
          : c,
      ),
    );

  return (
    <div className="space-y-3 rounded-md border p-3">
      <div>
        <Label>Cities & Locations</Label>
        <p className="text-xs text-muted-foreground">
          Captains will pick from these when registering their team.
        </p>
      </div>
      <div className="flex gap-2">
        <Input
          value={newCityName}
          onChange={(e) => setNewCityName(e.target.value)}
          placeholder="New city name (e.g. Bangalore)"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addCity();
            }
          }}
        />
        <Button type="button" size="sm" onClick={addCity} disabled={!newCityName.trim()}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Add city
        </Button>
      </div>
      {cities.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">No cities yet — add one above.</p>
      ) : (
        <div className="space-y-2">
          {cities.map((city) => (
            <CityEditor
              key={city.tempId}
              city={city}
              onRename={(name) => renameCity(city.tempId, name)}
              onRemove={() => removeCity(city.tempId)}
              onAddLocation={(name) => addLocation(city.tempId, name)}
              onRemoveLocation={(locTempId) => removeLocation(city.tempId, locTempId)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CityEditor({
  city,
  onRename,
  onRemove,
  onAddLocation,
  onRemoveLocation,
}: {
  city: DraftCity;
  onRename: (name: string) => void;
  onRemove: () => void;
  onAddLocation: (name: string) => void;
  onRemoveLocation: (locTempId: string) => void;
}) {
  const [locName, setLocName] = useState("");
  const submitLoc = () => {
    if (!locName.trim()) return;
    onAddLocation(locName);
    setLocName("");
  };
  return (
    <div className="rounded-md border bg-muted/30 p-2 space-y-2">
      <div className="flex items-center gap-2">
        <Input
          value={city.name}
          onChange={(e) => onRename(e.target.value)}
          className="h-8 text-sm font-medium"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-destructive hover:text-destructive"
          onClick={onRemove}
          aria-label="Remove city"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="pl-3 space-y-1">
        {city.locations.map((loc) => (
          <div key={loc.tempId} className="flex items-center gap-2">
            <MapPin className="h-3 w-3 text-muted-foreground" />
            <span className="text-xs flex-1 truncate">{loc.name}</span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-destructive hover:text-destructive"
              onClick={() => onRemoveLocation(loc.tempId)}
              aria-label="Remove location"
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        ))}
        <div className="flex gap-2 pt-1">
          <Input
            value={locName}
            onChange={(e) => setLocName(e.target.value)}
            placeholder="Add location"
            className="h-7 text-xs"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submitLoc();
              }
            }}
          />
          <Button type="button" size="sm" variant="outline" className="h-7 px-2" onClick={submitLoc} disabled={!locName.trim()}>
            <Plus className="h-3 w-3" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// Persist a draft set of cities/locations to a league.
// Diffs against `original` (the cities loaded from the server when editing).
async function persistCitiesLocations(
  leagueId: string,
  draft: DraftCity[],
  original: DraftCity[],
) {
  // Delete cities that were removed
  const draftCityIds = new Set(draft.map((c) => c.id).filter(Boolean));
  for (const orig of original) {
    if (orig.id && !draftCityIds.has(orig.id)) {
      await leagueServiceInvoke(`/leagues/${leagueId}/cities/${orig.id}`, "DELETE");
    }
  }
  // Upsert cities
  for (const city of draft) {
    let cityId = city.id;
    if (!cityId) {
      const created = await leagueServiceInvoke(`/leagues/${leagueId}/cities`, "POST", { name: city.name });
      cityId = created.id;
    } else {
      const orig = original.find((o) => o.id === cityId);
      if (orig && orig.name !== city.name) {
        await leagueServiceInvoke(`/leagues/${leagueId}/cities/${cityId}`, "PATCH", { name: city.name });
      }
    }
    if (!cityId) continue;

    // Locations
    const origLocs = original.find((o) => o.id === city.id)?.locations ?? [];
    const draftLocIds = new Set(city.locations.map((l) => l.id).filter(Boolean));
    for (const ol of origLocs) {
      if (ol.id && !draftLocIds.has(ol.id)) {
        await leagueServiceInvoke(
          `/leagues/${leagueId}/cities/${cityId}/locations/${ol.id}`,
          "DELETE",
        );
      }
    }
    for (const loc of city.locations) {
      if (!loc.id) {
        await leagueServiceInvoke(
          `/leagues/${leagueId}/cities/${cityId}/locations`,
          "POST",
          { name: loc.name },
        );
      }
    }
  }
}

// Active Razorpay payment account cities (from Admin → Payments)
function useRazorpayPaymentCities() {
  return useQuery({
    queryKey: ["payment_gateways", "razorpay", "active-cities"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payment_gateways")
        .select("city")
        .eq("name", "razorpay")
        .eq("is_active", true)
        .order("city");
      if (error) throw error;
      return Array.from(new Set((data ?? []).map((r) => r.city))).filter(Boolean);
    },
  });
}

function PaymentCityField({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const { data: cities, isLoading } = useRazorpayPaymentCities();
  return (
    <div>
      <Label>Payment account (Razorpay)</Label>
      <Select value={value || "__none__"} onValueChange={(v) => onChange(v === "__none__" ? "" : v)}>
        <SelectTrigger>
          <SelectValue placeholder={isLoading ? "Loading…" : "Select payment account city"} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">Use tenant default</SelectItem>
          {(cities ?? []).map((c) => (
            <SelectItem key={c} value={c}>{c}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground mt-1">
        Which city's Razorpay account collects payments for this league. Manage accounts in Admin → Payments.
      </p>
    </div>
  );
}

// ── Create League Dialog ─────────────────────────────────────
function LeagueDialog({
  tenantId,
  league,
  trigger,
  onClose,
}: {
  tenantId: string;
  league?: League | null;
  trigger?: React.ReactNode;
  onClose?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const isEdit = !!league;
  const [name, setName] = useState(league?.name ?? "");
  const [format, setFormat] = useState<LeagueFormat>(league?.format ?? "stroke_play");
  const [venueId, setVenueId] = useState<string>(league?.venue_id ?? "");
  const [teamSizes, setTeamSizes] = useState<string>((league?.allowed_team_sizes ?? []).join(", "));
  const [showOnLanding, setShowOnLanding] = useState<boolean>(league?.show_on_landing ?? false);
  const [pricePerPerson, setPricePerPerson] = useState<string>(
    league?.price_per_person != null ? String(league.price_per_person) : "",
  );
  const [currency, setCurrency] = useState<string>(league?.currency ?? "INR");
  const [paymentCity, setPaymentCity] = useState<string>(league?.payment_city ?? "");
  const [draftCities, setDraftCities] = useState<DraftCity[]>([]);
  const [originalCities, setOriginalCities] = useState<DraftCity[]>([]);
  const [persisting, setPersisting] = useState(false);

  const createLeague = useCreateLeague(tenantId);
  const updateLeague = useUpdateLeague(league?.id ?? "");
  const { data: bays } = useTenantBays(tenantId);
  const { data: existingCities } = useLeagueCities(isEdit && open ? league!.id : null);
  const qc = useQueryClient();
  const { toast } = useToast();

  // Hydrate cities/locations when editing an existing league
  useEffect(() => {
    if (!isEdit || !open || !existingCities) return;
    let cancelled = false;
    (async () => {
      const hydrated: DraftCity[] = await Promise.all(
        existingCities.map(async (c) => {
          const locs = await leagueServiceInvoke(
            `/leagues/${league!.id}/cities/${c.id}/locations`,
            "GET",
          );
          return {
            id: c.id,
            tempId: c.id,
            name: c.name,
            locations: (locs ?? []).map((l: any) => ({ id: l.id, tempId: l.id, name: l.name })),
          };
        }),
      );
      if (cancelled) return;
      setDraftCities(hydrated);
      setOriginalCities(JSON.parse(JSON.stringify(hydrated)));
    })();
    return () => {
      cancelled = true;
    };
  }, [isEdit, open, existingCities, league]);

  const reset = () => {
    if (!isEdit) {
      setName("");
      setFormat("stroke_play");
      setVenueId("");
      setTeamSizes("");
      setShowOnLanding(false);
      setPricePerPerson("");
      setCurrency("INR");
      setPaymentCity("");
      setDraftCities([]);
      setOriginalCities([]);
    }
  };

  const handleClose = (v: boolean) => {
    setOpen(v);
    if (!v) {
      reset();
      onClose?.();
    }
  };

  const handleSubmit = async () => {
    if (!name.trim()) return;
    const sizes = parseTeamSizes(teamSizes);
    const price = pricePerPerson === "" ? 0 : Number(pricePerPerson);
    const payload = {
      name: name.trim(),
      format,
      venue_id: venueId || undefined,
      allowed_team_sizes: sizes,
      show_on_landing: showOnLanding,
      price_per_person: Number.isFinite(price) ? price : 0,
      currency: currency || "INR",
      payment_city: paymentCity || null,
    };
    setPersisting(true);
    try {
      let leagueId = league?.id;
      if (isEdit && league) {
        await updateLeague.mutateAsync(payload);
      } else {
        const created = await createLeague.mutateAsync(payload);
        leagueId = (created as any)?.id ?? leagueId;
      }
      if (leagueId) {
        try {
          await persistCitiesLocations(leagueId, draftCities, originalCities);
          qc.invalidateQueries({ queryKey: ["league-cities", leagueId] });
        } catch (err) {
          toast({
            title: "League saved, but cities/locations failed",
            description: (err as Error).message,
            variant: "destructive",
          });
          setPersisting(false);
          return;
        }
      }
      handleClose(false);
    } catch {
      // mutation already toasted
    } finally {
      setPersisting(false);
    }
  };

  const pending = createLeague.isPending || updateLeague.isPending || persisting;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogTrigger asChild>
        {trigger ?? <Button size="sm"><Plus className="h-4 w-4 mr-1" /> New League</Button>}
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{isEdit ? "Edit League" : "Create League"}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="League name" />
          </div>
          <div>
            <Label>Format</Label>
            <Select value={format} onValueChange={(v) => setFormat(v as LeagueFormat)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {["stroke_play", "match_play", "stableford", "scramble", "best_ball", "skins"].map((f) => (
                  <SelectItem key={f} value={f}>{f.replace(/_/g, " ")}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {bays && bays.length > 0 && (
            <div>
              <Label>Venue (Bay)</Label>
              <Select value={venueId} onValueChange={setVenueId}>
                <SelectTrigger><SelectValue placeholder="Select a venue" /></SelectTrigger>
                <SelectContent>
                  {bays.map((b) => (
                    <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label>Allowed team sizes (comma-separated)</Label>
            <Input
              value={teamSizes}
              onChange={(e) => setTeamSizes(e.target.value)}
              placeholder="e.g. 2, 4"
            />
            <p className="text-xs text-muted-foreground mt-1">Used at captain checkout. Numbers between 1 and 20.</p>
          </div>
          <div className="grid grid-cols-[1fr_120px] gap-2">
            <div>
              <Label>Price per person</Label>
              <Input
                type="number"
                inputMode="decimal"
                value={pricePerPerson}
                onChange={(e) => setPricePerPerson(e.target.value)}
                placeholder="0"
              />
            </div>
            <div>
              <Label>Currency</Label>
              <Input value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} maxLength={3} />
            </div>
          </div>
          <PaymentCityField value={paymentCity} onChange={setPaymentCity} />
          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <Label className="cursor-pointer">Show on landing page</Label>
              <p className="text-xs text-muted-foreground">Active leagues only — captains see a Join card.</p>
            </div>
            <Switch checked={showOnLanding} onCheckedChange={setShowOnLanding} />
          </div>
          <CitiesLocationsEditor cities={draftCities} setCities={setDraftCities} />
          <Button onClick={handleSubmit} disabled={pending || !name.trim()} className="w-full">
            {pending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}{isEdit ? "Save changes" : "Create"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Backwards-compat alias used in the legacy card header
function CreateLeagueDialog({ tenantId }: { tenantId: string }) {
  return <LeagueDialog tenantId={tenantId} />;
}

function LegacyLeagueRow({
  league,
  tenantId,
  selected,
  onSelect,
  onDeleted,
}: {
  league: League;
  tenantId: string;
  selected: boolean;
  onSelect: () => void;
  onDeleted: () => void;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const del = useDeleteLeague(tenantId);
  const { data: cities } = useLeagueCities(league.id);
  const cityCount = cities?.length ?? 0;

  return (
    <div
      className={`group px-4 py-3 hover:bg-muted/50 transition-colors cursor-pointer ${selected ? "bg-muted" : ""}`}
      onClick={onSelect}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-sm truncate">{league.name}</span>
        <div className="flex items-center gap-1">
          <StatusBadge status={league.status} />
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={(e) => { e.stopPropagation(); setEditOpen(true); }}
            aria-label="Edit league"
          >
            <Edit className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-destructive hover:text-destructive"
            onClick={(e) => { e.stopPropagation(); setConfirmOpen(true); }}
            aria-label="Delete league"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      <div className="flex items-center gap-2 mt-1 flex-wrap">
        <p className="text-xs text-muted-foreground">{league.format.replace(/_/g, " ")}</p>
        {league.allowed_team_sizes?.length > 0 && (
          <Badge variant="outline" className="text-[10px] py-0 px-1.5">Sizes {league.allowed_team_sizes.join("/")}</Badge>
        )}
        {league.show_on_landing && (
          <Badge variant="outline" className="text-[10px] py-0 px-1.5">On landing</Badge>
        )}
        {league.price_per_person > 0 && (
          <Badge variant="outline" className="text-[10px] py-0 px-1.5">{league.currency} {league.price_per_person}/person</Badge>
        )}
        {cityCount > 0 && (
          <Badge variant="outline" className="text-[10px] py-0 px-1.5">{cityCount} {cityCount === 1 ? "city" : "cities"}</Badge>
        )}
      </div>

      {editOpen && (
        <div onClick={(e) => e.stopPropagation()}>
          <LeagueDialogControlled
            tenantId={tenantId}
            league={league}
            open={editOpen}
            onOpenChange={setEditOpen}
          />
        </div>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this league?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the league "{league.name}" and all its rounds, players, scores, and teams. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => del.mutate(league.id, { onSuccess: () => { setConfirmOpen(false); onDeleted(); } })}
              disabled={del.isPending}
            >
              {del.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// Controlled variant of LeagueDialog (used for edit – open state managed by caller)
function LeagueDialogControlled({
  tenantId,
  league,
  open,
  onOpenChange,
}: {
  tenantId: string;
  league: League;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [name, setName] = useState(league.name);
  const [format, setFormat] = useState<LeagueFormat>(league.format);
  const [venueId, setVenueId] = useState<string>(league.venue_id ?? "");
  const [teamSizes, setTeamSizes] = useState<string>((league.allowed_team_sizes ?? []).join(", "));
  const [showOnLanding, setShowOnLanding] = useState<boolean>(league.show_on_landing ?? false);
  const [pricePerPerson, setPricePerPerson] = useState<string>(
    league.price_per_person != null ? String(league.price_per_person) : "",
  );
  const [currency, setCurrency] = useState<string>(league.currency ?? "INR");
  const [paymentCity, setPaymentCity] = useState<string>(league.payment_city ?? "");
  const [draftCities, setDraftCities] = useState<DraftCity[]>([]);
  const [originalCities, setOriginalCities] = useState<DraftCity[]>([]);
  const [persisting, setPersisting] = useState(false);
  const updateLeague = useUpdateLeague(league.id);
  const { data: bays } = useTenantBays(tenantId);
  const { data: existingCities } = useLeagueCities(open ? league.id : null);
  const qc = useQueryClient();
  const { toast } = useToast();

  useEffect(() => {
    if (!open || !existingCities) return;
    let cancelled = false;
    (async () => {
      const hydrated: DraftCity[] = await Promise.all(
        existingCities.map(async (c) => {
          const locs = await leagueServiceInvoke(
            `/leagues/${league.id}/cities/${c.id}/locations`,
            "GET",
          );
          return {
            id: c.id,
            tempId: c.id,
            name: c.name,
            locations: (locs ?? []).map((l: any) => ({ id: l.id, tempId: l.id, name: l.name })),
          };
        }),
      );
      if (cancelled) return;
      setDraftCities(hydrated);
      setOriginalCities(JSON.parse(JSON.stringify(hydrated)));
    })();
    return () => {
      cancelled = true;
    };
  }, [open, existingCities, league.id]);

  const handleSubmit = async () => {
    if (!name.trim()) return;
    const price = pricePerPerson === "" ? 0 : Number(pricePerPerson);
    setPersisting(true);
    try {
      await updateLeague.mutateAsync({
        name: name.trim(),
        format,
        venue_id: venueId || undefined,
        allowed_team_sizes: parseTeamSizes(teamSizes),
        show_on_landing: showOnLanding,
        price_per_person: Number.isFinite(price) ? price : 0,
        currency: currency || "INR",
        payment_city: paymentCity || null,
      });
      try {
        await persistCitiesLocations(league.id, draftCities, originalCities);
        qc.invalidateQueries({ queryKey: ["league-cities", league.id] });
      } catch (err) {
        toast({
          title: "League saved, but cities/locations failed",
          description: (err as Error).message,
          variant: "destructive",
        });
        setPersisting(false);
        return;
      }
      onOpenChange(false);
    } catch {
      // toasted
    } finally {
      setPersisting(false);
    }
  };

  const pending = updateLeague.isPending || persisting;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Edit League</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label>Format</Label>
            <Select value={format} onValueChange={(v) => setFormat(v as LeagueFormat)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {["stroke_play", "match_play", "stableford", "scramble", "best_ball", "skins"].map((f) => (
                  <SelectItem key={f} value={f}>{f.replace(/_/g, " ")}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {bays && bays.length > 0 && (
            <div>
              <Label>Venue (Bay)</Label>
              <Select value={venueId} onValueChange={setVenueId}>
                <SelectTrigger><SelectValue placeholder="Select a venue" /></SelectTrigger>
                <SelectContent>
                  {bays.map((b) => (
                    <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label>Allowed team sizes (comma-separated)</Label>
            <Input value={teamSizes} onChange={(e) => setTeamSizes(e.target.value)} placeholder="e.g. 2, 4" />
          </div>
          <div className="grid grid-cols-[1fr_120px] gap-2">
            <div>
              <Label>Price per person</Label>
              <Input type="number" inputMode="decimal" value={pricePerPerson} onChange={(e) => setPricePerPerson(e.target.value)} />
            </div>
            <div>
              <Label>Currency</Label>
              <Input value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} maxLength={3} />
            </div>
          </div>
          <PaymentCityField value={paymentCity} onChange={setPaymentCity} />
          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <Label>Show on landing page</Label>
              <p className="text-xs text-muted-foreground">Active leagues only.</p>
            </div>
            <Switch checked={showOnLanding} onCheckedChange={setShowOnLanding} />
          </div>
          <CitiesLocationsEditor cities={draftCities} setCities={setDraftCities} />
          <Button onClick={handleSubmit} disabled={pending || !name.trim()} className="w-full">
            {pending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Save changes
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Add Player Dialog ────────────────────────────────────────
function AddPlayerDialog({ leagueId }: { leagueId: string }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<{ user_id: string; display_name: string; email: string }[]>([]);
  const [searching, setSearching] = useState(false);
  const addPlayer = useAddLeaguePlayer(leagueId);

  const handleSearch = async () => {
    if (!search.trim()) return;
    setSearching(true);
    try {
      const { data } = await supabase
        .from("profiles")
        .select("user_id, display_name, email")
        .not("user_id", "is", null)
        .or(`display_name.ilike.%${search}%,email.ilike.%${search}%`)
        .limit(10);
      setResults((data || []).filter((p) => p.user_id) as any);
    } finally {
      setSearching(false);
    }
  };

  const handleAdd = (userId: string) => {
    addPlayer.mutate(userId, {
      onSuccess: () => {
        setResults((prev) => prev.filter((p) => p.user_id !== userId));
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setSearch(""); setResults([]); } }}>
      <DialogTrigger asChild>
        <Button size="sm"><UserPlus className="h-4 w-4 mr-1" /> Add Player</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Add Player to League</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="flex gap-2">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or email"
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            />
            <Button onClick={handleSearch} disabled={searching} size="sm">
              {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            </Button>
          </div>
          {results.length > 0 ? (
            <div className="divide-y max-h-[300px] overflow-y-auto">
              {results.map((p) => (
                <div key={p.user_id} className="flex items-center justify-between py-2">
                  <div>
                    <p className="text-sm font-medium">{p.display_name || "Unnamed"}</p>
                    <p className="text-xs text-muted-foreground">{p.email}</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => handleAdd(p.user_id)} disabled={addPlayer.isPending}>
                    <Plus className="h-3.5 w-3.5 mr-1" /> Add
                  </Button>
                </div>
              ))}
            </div>
          ) : search && !searching ? (
            <p className="text-sm text-muted-foreground text-center py-4">No users found</p>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Competition Editor ────────────────────────────────────────
function CompetitionEditor({ leagueId, round }: { leagueId: string; round: LeagueRound }) {
  const { data: competitions, isLoading } = useRoundCompetitions(leagueId, round.id);
  const createComp = useCreateCompetition(leagueId, round.id);
  const updateComp = useUpdateCompetition(leagueId, round.id);
  const deleteComp = useDeleteCompetition(leagueId, round.id);
  const [showAdd, setShowAdd] = useState(false);
  const [compName, setCompName] = useState("");
  const [compDesc, setCompDesc] = useState("");
  const [pointsEntries, setPointsEntries] = useState<{ position: number; points: number }[]>([
    { position: 1, points: 10 }, { position: 2, points: 7 }, { position: 3, points: 5 },
  ]);

  const addPointsRow = () => setPointsEntries((prev) => [...prev, { position: prev.length + 1, points: 0 }]);
  const removePointsRow = (i: number) => setPointsEntries((prev) => prev.filter((_, idx) => idx !== i));
  const updatePointsRow = (i: number, field: "position" | "points", val: number) =>
    setPointsEntries((prev) => prev.map((r, idx) => idx === i ? { ...r, [field]: val } : r));

  const handleCreate = () => {
    if (!compName.trim()) return;
    createComp.mutate({ name: compName, description: compDesc || undefined, points_config: pointsEntries }, {
      onSuccess: () => { setShowAdd(false); setCompName(""); setCompDesc(""); setPointsEntries([{ position: 1, points: 10 }, { position: 2, points: 7 }, { position: 3, points: 5 }]); },
    });
  };

  if (isLoading) return <Loader2 className="h-4 w-4 animate-spin" />;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-muted-foreground">Competitions</p>
        <Button size="sm" variant="outline" onClick={() => setShowAdd(!showAdd)}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Add Competition
        </Button>
      </div>

      {showAdd && (
        <div className="border rounded-md p-3 space-y-3 bg-muted/30">
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label>Name</Label><Input value={compName} onChange={(e) => setCompName(e.target.value)} placeholder="e.g. Longest Drive" /></div>
            <div><Label>Description</Label><Input value={compDesc} onChange={(e) => setCompDesc(e.target.value)} placeholder="Optional" /></div>
          </div>
          <div>
            <Label>Points by Position</Label>
            <div className="space-y-1 mt-1">
              {pointsEntries.map((pe, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-xs w-8 text-muted-foreground">#{pe.position}</span>
                  <Input type="number" className="w-20 h-8" value={pe.points} onChange={(e) => updatePointsRow(i, "points", Number(e.target.value))} />
                  <span className="text-xs text-muted-foreground">pts</span>
                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => removePointsRow(i)}><Trash2 className="h-3 w-3" /></Button>
                </div>
              ))}
              <Button size="sm" variant="ghost" onClick={addPointsRow}><Plus className="h-3 w-3 mr-1" /> Position</Button>
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleCreate} disabled={createComp.isPending}>
              {createComp.isPending && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowAdd(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {(!competitions || competitions.length === 0) ? (
        <p className="text-xs text-muted-foreground">No competitions configured for this round.</p>
      ) : (
        <div className="space-y-2">
          {competitions.map((comp) => (
            <div key={comp.id} className="border rounded-md p-3 bg-background">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{comp.name}</p>
                  {comp.description && <p className="text-xs text-muted-foreground">{comp.description}</p>}
                </div>
                <Button size="icon" variant="ghost" onClick={() => deleteComp.mutate(comp.id)} disabled={deleteComp.isPending}>
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </div>
              {comp.points_config && (comp.points_config as any[]).length > 0 && (
                <div className="flex gap-3 mt-2 flex-wrap">
                  {(comp.points_config as any[]).map((pc: any, i: number) => (
                    <Badge key={i} variant="secondary" className="text-xs">#{pc.position}: {pc.points}pts</Badge>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Rounds Panel ─────────────────────────────────────────────
function RevealedRoundScores({
  leagueId,
  roundNumber,
  parPerHole,
  hiddenHoles,
}: {
  leagueId: string;
  roundNumber: number;
  parPerHole: number[];
  hiddenHoles: number[];
}) {
  const { data: scores, isLoading } = useLeagueScores(leagueId, roundNumber);
  const roundPar = parPerHole.reduce((s, p) => s + (Number(p) > 0 ? Number(p) : 0), 0);
  const HC_MULT = 3;

  if (isLoading) {
    return (
      <div className="rounded-md border p-3 bg-muted/20 flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-xs text-muted-foreground">Loading scores…</span>
      </div>
    );
  }
  const rows = (scores || []).map((s: any) => {
    const hs: number[] = Array.isArray(s.hole_scores) ? s.hole_scores : [];
    const gross = s.total_score ?? hs.reduce((a, v) => a + (Number(v) || 0), 0);
    const hiddenSum = hiddenHoles.reduce((sum, h) => sum + (Number(hs[h - 1]) || 0), 0);
    const handicap = roundPar > 0 && hiddenHoles.length > 0 ? hiddenSum * HC_MULT - roundPar : 0;
    const net = gross - handicap;
    return { id: s.id, name: s.player_name || s.player_id?.slice(0, 8), hs, gross, hiddenSum, handicap, net };
  });

  return (
    <div className="rounded-md border p-3 space-y-2 bg-card">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-semibold">Player Scores & Peoria Handicaps</span>
        <Badge variant="outline" className="text-[10px]">Round Par {roundPar || "—"}</Badge>
        {hiddenHoles.length > 0 && (
          <Badge variant="secondary" className="text-[10px]">
            Hidden: {hiddenHoles.join(", ")}
          </Badge>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">No scores submitted for this round.</p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Player</TableHead>
                {Array.from({ length: parPerHole.length || (rows[0]?.hs.length ?? 0) }).map((_, i) => {
                  const isHidden = hiddenHoles.includes(i + 1);
                  return (
                    <TableHead
                      key={i}
                      className={`text-center px-1.5 text-xs ${isHidden ? "bg-accent/30 text-accent-foreground" : ""}`}
                    >
                      {i + 1}
                    </TableHead>
                  );
                })}
                <TableHead className="text-center text-xs">Gross</TableHead>
                <TableHead className="text-center text-xs">Hidden Σ</TableHead>
                <TableHead className="text-center text-xs">Peoria HC</TableHead>
                <TableHead className="text-center text-xs">Net</TableHead>
              </TableRow>
              {parPerHole.length > 0 && (
                <TableRow>
                  <TableHead className="text-[10px] text-muted-foreground">Par</TableHead>
                  {parPerHole.map((p, i) => (
                    <TableHead key={i} className="text-center px-1.5 text-[10px] text-muted-foreground font-normal">
                      {p || "—"}
                    </TableHead>
                  ))}
                  <TableHead className="text-center text-[10px] text-muted-foreground font-normal">{roundPar}</TableHead>
                  <TableHead colSpan={3} />
                </TableRow>
              )}
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-xs font-medium">{r.name}</TableCell>
                  {Array.from({ length: parPerHole.length || r.hs.length }).map((_, i) => {
                    const isHidden = hiddenHoles.includes(i + 1);
                    const v = r.hs[i];
                    const p = parPerHole[i];
                    const diff = typeof v === "number" && typeof p === "number" && p > 0 ? v - p : null;
                    return (
                      <TableCell
                        key={i}
                        className={`text-center px-1.5 text-xs ${isHidden ? "bg-accent/30" : ""} ${
                          diff !== null && diff < 0 ? "text-green-600" : diff !== null && diff > 0 ? "text-destructive" : ""
                        }`}
                      >
                        {v ?? "—"}
                      </TableCell>
                    );
                  })}
                  <TableCell className="text-center text-xs font-semibold">{r.gross || "—"}</TableCell>
                  <TableCell className="text-center text-xs">{r.hiddenSum || "—"}</TableCell>
                  <TableCell className="text-center text-xs font-semibold">
                    {hiddenHoles.length > 0 && roundPar > 0 ? r.handicap : "—"}
                  </TableCell>
                  <TableCell className="text-center text-xs font-bold text-primary">
                    {hiddenHoles.length > 0 && roundPar > 0 ? r.net : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {hiddenHoles.length > 0 && roundPar > 0 && (
        <p className="text-[10px] text-muted-foreground">
          Peoria HC = (sum of hidden hole scores × {HC_MULT}) − round par ({roundPar})
        </p>
      )}
    </div>
  );
}

function RoundsPanel({ league }: { league: League }) {
  const { data: rounds, isLoading } = useLeagueRounds(league.id);
  const createRound = useCreateRound(league.id);
  const updateRound = useUpdateRound(league.id);
  const deleteRound = useDeleteRound(league.id);
  const adminHidden = useHiddenHolesAdmin(league.id);
  const [showAdd, setShowAdd] = useState(false);
  const [expandedRound, setExpandedRound] = useState<string | null>(null);
  const numHoles = league.scoring_holes || 18;
  const blankPar = () => Array(numHoles).fill(4);
  const [newRound, setNewRound] = useState<{ name: string; description: string; start_date: string; end_date: string; par_per_hole: number[] }>(
    { name: "", description: "", start_date: "", end_date: "", par_per_hole: blankPar() },
  );
  const [editingRound, setEditingRound] = useState<string | null>(null);
  const [editData, setEditData] = useState<{ name: string; description: string; start_date: string; end_date: string; par_per_hole: number[] }>(
    { name: "", description: "", start_date: "", end_date: "", par_per_hole: blankPar() },
  );

  const handleCreate = () => {
    if (!newRound.name || !newRound.start_date || !newRound.end_date) return;
    createRound.mutate(newRound, {
      onSuccess: () => { setShowAdd(false); setNewRound({ name: "", description: "", start_date: "", end_date: "", par_per_hole: blankPar() }); },
    });
  };

  const startEdit = (r: LeagueRound) => {
    setEditingRound(r.id);
    setEditData({
      name: r.name,
      description: r.description || "",
      start_date: r.start_date,
      end_date: r.end_date,
      par_per_hole: (r.par_per_hole && r.par_per_hole.length === numHoles) ? [...r.par_per_hole] : blankPar(),
    });
  };

  const saveEdit = (roundId: string) => {
    updateRound.mutate({ roundId, body: editData }, { onSuccess: () => setEditingRound(null) });
  };

  const ParGrid = ({ value, onChange }: { value: number[]; onChange: (v: number[]) => void }) => (
    <div>
      <Label className="text-xs">Par per hole ({numHoles}) — values 3–6</Label>
      <div className="grid grid-cols-9 gap-1 mt-1">
        {Array.from({ length: numHoles }).map((_, i) => (
          <div key={i} className="space-y-0.5">
            <div className="text-[10px] text-muted-foreground text-center">{i + 1}</div>
            <Input
              type="number"
              min={3}
              max={6}
              value={value[i] ?? ""}
              onChange={(e) => {
                const next = [...value];
                next[i] = Number(e.target.value) || 0;
                onChange(next);
              }}
              className="h-8 text-xs px-1 text-center"
            />
          </div>
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground mt-1">Total par: {value.reduce((s, v) => s + (v || 0), 0)}</p>
    </div>
  );

  if (isLoading) return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <Button size="sm" onClick={() => setShowAdd(!showAdd)}>
        <Plus className="h-4 w-4 mr-1" /> Add Round
      </Button>

      {showAdd && (
        <div className="border rounded-md p-4 space-y-3 bg-muted/30">
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label>Round Name</Label><Input value={newRound.name} onChange={(e) => setNewRound({ ...newRound, name: e.target.value })} placeholder="e.g. Week 1" /></div>
            <div><Label>Description</Label><Input value={newRound.description} onChange={(e) => setNewRound({ ...newRound, description: e.target.value })} placeholder="Optional" /></div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label>Start Date</Label><Input type="date" value={newRound.start_date} onChange={(e) => setNewRound({ ...newRound, start_date: e.target.value })} /></div>
            <div><Label>End Date</Label><Input type="date" value={newRound.end_date} onChange={(e) => setNewRound({ ...newRound, end_date: e.target.value })} /></div>
          </div>
          <ParGrid value={newRound.par_per_hole} onChange={(v) => setNewRound({ ...newRound, par_per_hole: v })} />
          <div className="flex gap-2">
            <Button size="sm" onClick={handleCreate} disabled={createRound.isPending}>
              {createRound.isPending && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}Create Round
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowAdd(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {(!rounds || rounds.length === 0) ? (
        <p className="text-sm text-muted-foreground py-4">No rounds configured. Add rounds to structure the league schedule.</p>
      ) : (
        <div className="space-y-2">
          {rounds.map((r) => {
            const adminHH = (adminHidden.data || []).find((h) => h.round_number === r.round_number);
            const parSet = (r.par_per_hole?.length || 0) === numHoles;
            return (
              <div key={r.id} className="border rounded-md">
                <div
                  className="flex items-center justify-between p-3 cursor-pointer hover:bg-muted/30"
                  onClick={() => setExpandedRound(expandedRound === r.id ? null : r.id)}
                >
                  <div className="flex items-center gap-2">
                    <ChevronRight className={`h-4 w-4 transition-transform ${expandedRound === r.id ? "rotate-90" : ""}`} />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">Round {r.round_number}: {r.name}</span>
                        {parSet ? (
                          <Badge variant="outline" className="text-[10px]">Par {r.par_per_hole.reduce((s, v) => s + v, 0)}</Badge>
                        ) : (
                          <Badge variant="secondary" className="text-[10px]">Par not set</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">{r.start_date} → {r.end_date}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <Button size="icon" variant="ghost" onClick={() => startEdit(r)}><Edit className="h-3.5 w-3.5" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => deleteRound.mutate(r.id)} disabled={deleteRound.isPending}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>

                {editingRound === r.id && (
                  <div className="px-3 pb-3 space-y-3 border-t bg-muted/20">
                    <div className="grid gap-3 sm:grid-cols-2 pt-3">
                      <div><Label>Name</Label><Input value={editData.name} onChange={(e) => setEditData({ ...editData, name: e.target.value })} /></div>
                      <div><Label>Description</Label><Input value={editData.description} onChange={(e) => setEditData({ ...editData, description: e.target.value })} /></div>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div><Label>Start Date</Label><Input type="date" value={editData.start_date} onChange={(e) => setEditData({ ...editData, start_date: e.target.value })} /></div>
                      <div><Label>End Date</Label><Input type="date" value={editData.end_date} onChange={(e) => setEditData({ ...editData, end_date: e.target.value })} /></div>
                    </div>
                    <ParGrid value={editData.par_per_hole} onChange={(v) => setEditData({ ...editData, par_per_hole: v })} />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => saveEdit(r.id)} disabled={updateRound.isPending}>Save</Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingRound(null)}>Cancel</Button>
                    </div>
                  </div>
                )}

                {expandedRound === r.id && editingRound !== r.id && (
                  <div className="px-3 pb-3 border-t pt-3 space-y-3">
                    {r.description && <p className="text-sm text-muted-foreground">{r.description}</p>}
                    {/* Admin-only Peoria hidden-holes preview */}
                    {adminHH && (adminHH.hidden_holes?.length > 0 || (adminHH as any).needs_reroll) && (
                      <div className="rounded-md border border-dashed p-3 bg-muted/30">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-xs font-semibold">Hidden Holes (Peoria) — Admin preview</span>
                          {(adminHH as any).needs_reroll ? (
                            <Badge variant="destructive" className="text-[10px]">Stale selection — re-randomize required</Badge>
                          ) : adminHH.revealed_at ? (
                            <Badge variant="default" className="text-[10px]">Revealed to players</Badge>
                          ) : (
                            <Badge variant="secondary" className="text-[10px]">Confidential — not visible to players until round closes</Badge>
                          )}
                        </div>
                        {(adminHH as any).needs_reroll ? (
                          <p className="text-[11px] text-muted-foreground">The saved hidden holes don't match the league's current scoring configuration. Use the Hidden Holes panel below to re-randomize.</p>
                        ) : (
                          <div className="flex gap-1 flex-wrap">
                            {adminHH.hidden_holes!.map((h: number) => (
                              <Badge key={h} variant="outline" className="text-xs">Hole {h}</Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    {adminHH?.revealed_at && (
                      <RevealedRoundScores
                        leagueId={league.id}
                        roundNumber={r.round_number}
                        parPerHole={r.par_per_hole || []}
                        hiddenHoles={adminHH.hidden_holes || []}
                      />
                    )}
                    <CompetitionEditor leagueId={league.id} round={r} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Teams Panel ──────────────────────────────────────────────
function RegistrationsPanel({ league }: { league: League }) {
  const { data, isLoading } = useRegisteredLegacyTeams(league.id);
  const rows = (data as any[]) || [];
  if (isLoading) return <Loader2 className="h-5 w-5 animate-spin" />;
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground py-4">No paid team registrations yet.</p>;
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Team</TableHead>
          <TableHead>Captain</TableHead>
          <TableHead>City / Location</TableHead>
          <TableHead>Size</TableHead>
          <TableHead>Amount</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Registered</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.id}>
            <TableCell className="font-medium">{r.team_name}</TableCell>
            <TableCell className="text-sm">
              <div>{r.captain_name || "—"}</div>
              <div className="text-xs text-muted-foreground">{r.captain_email || "—"}</div>
            </TableCell>
            <TableCell className="text-sm">
              {(r.city_name || "—")}{r.location_name ? ` / ${r.location_name}` : ""}
            </TableCell>
            <TableCell>{r.team_size}</TableCell>
            <TableCell>{r.total_amount} {r.currency}</TableCell>
            <TableCell>
              <Badge variant={r.payment_status === "paid" ? "secondary" : "outline"}>{r.payment_status}</Badge>
            </TableCell>
            <TableCell className="text-xs text-muted-foreground">{format(new Date(r.created_at), "PP")}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function TeamsPanel({ league }: { league: League }) {
  const { data: teams, isLoading } = useLeagueTeams(league.id);
  const { data: players } = useLeaguePlayers(league.id);
  const createTeam = useCreateTeam(league.id);
  const updateTeam = useUpdateTeam(league.id);
  const deleteTeam = useDeleteTeam(league.id);
  const addMember = useAddTeamMember(league.id);
  const removeMember = useRemoveTeamMember(league.id);

  const [showAdd, setShowAdd] = useState(false);
  const [teamName, setTeamName] = useState("");
  const [rosterSize, setRosterSize] = useState(4);
  const [expandedTeam, setExpandedTeam] = useState<string | null>(null);
  const [editingTeam, setEditingTeam] = useState<string | null>(null);
  const [editData, setEditData] = useState({ name: "", max_roster_size: 4 });

  const handleCreate = () => {
    if (!teamName.trim()) return;
    createTeam.mutate({ name: teamName, max_roster_size: rosterSize }, {
      onSuccess: () => { setShowAdd(false); setTeamName(""); setRosterSize(4); },
    });
  };

  const startEdit = (t: LeagueTeam) => {
    setEditingTeam(t.id);
    setEditData({ name: t.name, max_roster_size: t.max_roster_size });
  };

  const saveEdit = (teamId: string) => {
    updateTeam.mutate({ teamId, body: editData }, { onSuccess: () => setEditingTeam(null) });
  };

  // Players not in any team (available for assignment)
  const unassignedPlayers = (players || []).filter(
    (p) => !teams?.some((t) => t.members?.some((m) => m.player_id === p.id))
  );

  if (isLoading) return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <Button size="sm" onClick={() => setShowAdd(!showAdd)}>
        <Plus className="h-4 w-4 mr-1" /> Create Team
      </Button>

      {showAdd && (
        <div className="border rounded-md p-4 space-y-3 bg-muted/30">
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label>Team Name</Label><Input value={teamName} onChange={(e) => setTeamName(e.target.value)} placeholder="e.g. Team Alpha" /></div>
            <div><Label>Max Roster Size</Label><Input type="number" value={rosterSize || ""} onChange={(e) => setRosterSize(Number(e.target.value))} min={2} max={20} /></div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleCreate} disabled={createTeam.isPending}>
              {createTeam.isPending && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}Create
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowAdd(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {(!teams || teams.length === 0) ? (
        <p className="text-sm text-muted-foreground py-4">No teams yet. Create teams and assign players.</p>
      ) : (
        <div className="space-y-2">
          {teams.map((team) => (
            <div key={team.id} className="border rounded-md">
              <div
                className="flex items-center justify-between p-3 cursor-pointer hover:bg-muted/30 gap-3"
                onClick={() => setExpandedTeam(expandedTeam === team.id ? null : team.id)}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <ChevronRight className={`h-4 w-4 transition-transform ${expandedTeam === team.id ? "rotate-90" : ""}`} />
                  <div className="min-w-0">
                    <span className="font-medium text-sm">{team.name}</span>
                    <p className="text-xs text-muted-foreground">
                      {team.members?.length || 0}/{team.max_roster_size} players
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                  <TeamLocationCell leagueId={league.id} team={team} />
                  <Button size="icon" variant="ghost" onClick={() => startEdit(team)}><Edit className="h-3.5 w-3.5" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => deleteTeam.mutate(team.id)} disabled={deleteTeam.isPending}>
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
              </div>

              {editingTeam === team.id && (
                <div className="px-3 pb-3 space-y-3 border-t bg-muted/20 pt-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div><Label>Name</Label><Input value={editData.name} onChange={(e) => setEditData({ ...editData, name: e.target.value })} /></div>
                    <div><Label>Max Roster</Label><Input type="number" value={editData.max_roster_size || ""} onChange={(e) => setEditData({ ...editData, max_roster_size: Number(e.target.value) })} /></div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => saveEdit(team.id)} disabled={updateTeam.isPending}>Save</Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingTeam(null)}>Cancel</Button>
                  </div>
                </div>
              )}

              {expandedTeam === team.id && editingTeam !== team.id && (
                <div className="px-3 pb-3 border-t pt-3 space-y-3">
                  {/* Current members */}
                  {team.members && team.members.length > 0 ? (
                    <div className="space-y-1">
                      {team.members.map((m) => (
                        <div key={m.id} className="flex items-center justify-between py-1.5 px-2 rounded bg-muted/20">
                          <span className="text-sm">{m.display_name || "Unnamed"}</span>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6"
                            onClick={() => removeMember.mutate({ teamId: team.id, memberId: m.id })}
                            disabled={removeMember.isPending}
                          >
                            <UserMinus className="h-3 w-3 text-destructive" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">No members assigned.</p>
                  )}

                  {/* Assign unassigned players */}
                  {unassignedPlayers.length > 0 && (team.members?.length || 0) < team.max_roster_size && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Assign a player:</p>
                      <div className="flex flex-wrap gap-1">
                        {unassignedPlayers.map((p) => (
                          <Button
                            key={p.id}
                            size="sm"
                            variant="outline"
                            className="text-xs h-7"
                            onClick={() => addMember.mutate({ teamId: team.id, playerId: p.id })}
                            disabled={addMember.isPending}
                          >
                            <Plus className="h-3 w-3 mr-1" />{p.display_name || p.email || "Unnamed"}
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Scoring Config Panel ────────────────────────────────────
function ScoringConfigPanel({ league }: { league: League }) {
  const updateLeague = useUpdateLeague(league.id);
  const [scoringHoles, setScoringHoles] = useState(league.scoring_holes || 18);
  const [fairnessPct, setFairnessPct] = useState(league.fairness_factor_pct || 0);
  const [aggregation, setAggregation] = useState(league.team_aggregation_method || 'best_ball');
  const [peoriaMultiplier, setPeoriaMultiplier] = useState(league.peoria_multiplier || 3);

  const handleSave = () => {
    updateLeague.mutate({
      scoring_holes: scoringHoles,
      fairness_factor_pct: fairnessPct,
      team_aggregation_method: aggregation as 'best_ball' | 'average',
      peoria_multiplier: peoriaMultiplier,
    });
  };

  return (
    <div className="space-y-4">
      <h4 className="text-sm font-semibold">Scoring Configuration</h4>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label>Holes per Round</Label>
          <div className="flex gap-2 mt-1">
            <Button size="sm" variant={scoringHoles === 9 ? "default" : "outline"} onClick={() => setScoringHoles(9)}>9 Holes</Button>
            <Button size="sm" variant={scoringHoles === 18 ? "default" : "outline"} onClick={() => setScoringHoles(18)}>18 Holes</Button>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {scoringHoles === 9
              ? "3 hidden holes (one par-3, par-4 & par-5), ×6 multiplier"
              : "6 hidden holes, ×3 multiplier"}
          </p>
        </div>
        <div>
          <Label>Peoria Multiplier</Label>
          <Input type="number" value={peoriaMultiplier || ""} onChange={(e) => setPeoriaMultiplier(Number(e.target.value))} min={1} max={10} step={0.5} />
          <p className="text-xs text-muted-foreground mt-1">Hidden hole sum × this value = handicap</p>
        </div>
        <div>
          <Label>Team Aggregation Method</Label>
          <Select value={aggregation} onValueChange={(v) => setAggregation(v as 'best_ball' | 'average')}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="best_ball">Best Ball (lowest net score)</SelectItem>
              <SelectItem value="average">Average Score</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Team Fairness Factor (%)</Label>
          <Input type="number" value={fairnessPct || ""} onChange={(e) => setFairnessPct(Number(e.target.value))} min={0} max={100} step={1} />
          <p className="text-xs text-muted-foreground mt-1">Team score reduced by this % to compete with individuals</p>
        </div>
      </div>
      <Button onClick={handleSave} disabled={updateLeague.isPending} size="sm">
        {updateLeague.isPending && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}Save Configuration
      </Button>
    </div>
  );
}

// ── Hidden Holes Panel ──────────────────────────────────────
function HiddenHolesPanel({ league }: { league: League }) {
  const { data: hiddenHoles, isLoading } = useHiddenHoles(league.id);
  const { data: rounds } = useLeagueRounds(league.id);
  const { data: leaguePlayers } = useLeaguePlayers(league.id);
  const setHiddenHoles = useSetHiddenHoles(league.id);
  const closeRound = useCloseRound(league.id);

  const playerNameByUserId = new Map<string, string>();
  (leaguePlayers || []).forEach((p) => {
    if (p.user_id) {
      playerNameByUserId.set(p.user_id, p.display_name || p.email || p.user_id);
    }
  });
  const [selectedRound, setSelectedRound] = useState<number>(1);
  const [manualHoles, setManualHoles] = useState<number[]>([]);
  const [lastResult, setLastResult] = useState<any>(null);

  const scoringHoles = league.scoring_holes || 18;
  const requiredCount = scoringHoles === 9 ? 3 : 6;

  const currentRoundHH = hiddenHoles?.find((h) => h.round_number === selectedRound);

  const toggleHole = (hole: number) => {
    setManualHoles((prev) => {
      if (prev.includes(hole)) return prev.filter((h) => h !== hole);
      if (prev.length >= requiredCount) return prev;
      return [...prev, hole].sort((a, b) => a - b);
    });
  };

  const handleRandomize = () => {
    setHiddenHoles.mutate({ round_number: selectedRound, randomize: true });
  };

  const handleSaveManual = () => {
    if (manualHoles.length !== requiredCount) return;
    setHiddenHoles.mutate({ round_number: selectedRound, hidden_holes: manualHoles });
  };

  const handleCloseRound = () => {
    closeRound.mutate(selectedRound, {
      onSuccess: (data) => setLastResult(data),
    });
  };

  if (isLoading) return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <h4 className="text-sm font-semibold">Hidden Holes (Peoria System)</h4>

      <div className="flex items-center gap-3">
        <div>
          <Label>Round</Label>
          {rounds && rounds.length > 0 ? (
            <Select value={String(selectedRound)} onValueChange={(v) => setSelectedRound(Number(v))}>
              <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {rounds.map((r) => (
                  <SelectItem key={r.round_number} value={String(r.round_number)}>
                    Round {r.round_number}: {r.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input type="number" value={selectedRound} onChange={(e) => setSelectedRound(Number(e.target.value))} min={1} className="w-20" />
          )}
        </div>
      </div>

      {currentRoundHH && !((currentRoundHH as any).needs_reroll) ? (
        <div className="border rounded-md p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {currentRoundHH.revealed_at ? (
                <Badge variant="default"><Unlock className="h-3 w-3 mr-1" /> Revealed</Badge>
              ) : (
                <Badge variant="secondary"><Lock className="h-3 w-3 mr-1" /> Hidden</Badge>
              )}
              <span className="text-sm">Round {currentRoundHH.round_number}</span>
            </div>
            {!currentRoundHH.revealed_at && (
              <Button size="sm" variant="destructive" onClick={handleCloseRound} disabled={closeRound.isPending}>
                {closeRound.isPending && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}Close Round & Reveal
              </Button>
            )}
          </div>
          {currentRoundHH.hidden_holes && (
            <div className="flex gap-2 flex-wrap">
              {currentRoundHH.hidden_holes.map((h) => (
                <Badge key={h} variant="outline" className="text-sm">Hole {h}</Badge>
              ))}
            </div>
          )}
          {currentRoundHH.revealed_at && (
            <p className="text-xs text-muted-foreground">Revealed at {format(new Date(currentRoundHH.revealed_at), "PP p")}</p>
          )}
        </div>
      ) : (
        <div className="border-2 border-dashed rounded-lg p-4 space-y-4">
          {currentRoundHH && (currentRoundHH as any).needs_reroll ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs">
              <strong>Stale selection detected.</strong> The previously saved hidden holes don't match this league's current scoring ({scoringHoles} holes, expects {requiredCount}). Re-randomize or pick {requiredCount} valid holes below.
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No hidden holes set for Round {selectedRound}. Select {requiredCount} holes or randomize.</p>
          )}

          {/* Hole grid */}
          <div className="grid grid-cols-9 gap-1">
            {Array.from({ length: scoringHoles }, (_, i) => {
              const hole = i + 1;
              const isSelected = manualHoles.includes(hole);
              return (
                <Button
                  key={hole}
                  size="sm"
                  variant={isSelected ? "default" : "outline"}
                  className="h-8 w-8 p-0 text-xs"
                  onClick={() => toggleHole(hole)}
                >
                  {hole}
                </Button>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">{manualHoles.length}/{requiredCount} selected</p>

          <div className="flex gap-2">
            <Button size="sm" onClick={handleSaveManual} disabled={manualHoles.length !== requiredCount || setHiddenHoles.isPending}>
              {setHiddenHoles.isPending && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}Save Selection
            </Button>
            <Button size="sm" variant="outline" onClick={handleRandomize} disabled={setHiddenHoles.isPending}>
              <Shuffle className="h-3.5 w-3.5 mr-1" /> Randomize
            </Button>
          </div>
        </div>
      )}

      {/* Peoria Results */}
      {lastResult?.peoria_results && lastResult.peoria_results.length > 0 && (
        <div className="space-y-2">
          <h5 className="text-sm font-medium">Peoria Handicap Results</h5>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Player</TableHead>
                <TableHead>Gross</TableHead>
                <TableHead>Hidden Sum</TableHead>
                <TableHead>Handicap</TableHead>
                <TableHead>Net</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lastResult.peoria_results
                .sort((a: any, b: any) => a.net_score - b.net_score)
                .map((r: any) => (
                  <TableRow key={r.score_id}>
                    <TableCell className="text-xs">{playerNameByUserId.get(r.player_id) || r.player_id.slice(0, 8)}</TableCell>
                    <TableCell>{r.gross_score}</TableCell>
                    <TableCell>{r.hidden_hole_sum}</TableCell>
                    <TableCell>{r.peoria_handicap}</TableCell>
                    <TableCell className="font-semibold">{r.net_score}</TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

// ── Leaderboard Panel ────────────────────────────────────────
function LeaderboardPanel({ league }: { league: League }) {
  const { data: rounds } = useLeagueRounds(league.id);
  const { data: leagueCities } = useLeagueCities(league.id);
  const [selectedRound, setSelectedRound] = useState<number | undefined>(undefined);
  const [filter, setFilter] = useState<'all' | 'individuals' | 'teams'>('all');
  const [scope, setScope] = useState<'national' | 'city'>('national');
  const [scopeCityId, setScopeCityId] = useState<string | null>(null);
  const [expandedEntry, setExpandedEntry] = useState<string | null>(null);

  const { data: leaderboard, isLoading } = useLeaderboard(league.id, selectedRound, filter, scope, scopeCityId);

  if (isLoading) return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>;

  const rawEntries = leaderboard?.entries || [];
  const teamEntries = rawEntries.filter((e) => e.type === 'team');
  const hasTeams = teamEntries.length > 0;
  // When viewing "all" and the league has teams, default to a team-first compact view
  // (only teams listed, ranked 1..N; click chevron to expand member sub-rows).
  const teamFirst = filter === 'all' && hasTeams;
  const entries: LeaderboardEntry[] = teamFirst
    ? teamEntries.map((e, i) => ({ ...e, rank: i + 1 }))
    : rawEntries;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        {/* Scope: National vs City */}
        <div>
          <Label className="text-xs">Scope</Label>
          <div className="flex gap-1 mt-0.5">
            <Button
              size="sm"
              variant={scope === 'national' ? "default" : "outline"}
              className="h-8 text-xs"
              onClick={() => { setScope('national'); setScopeCityId(null); }}
            >
              National
            </Button>
            <Button
              size="sm"
              variant={scope === 'city' ? "default" : "outline"}
              className="h-8 text-xs"
              onClick={() => setScope('city')}
              disabled={!leagueCities || leagueCities.length === 0}
            >
              By City
            </Button>
          </div>
        </div>
        {scope === 'city' && (
          <div>
            <Label className="text-xs">League City</Label>
            <Select value={scopeCityId || ""} onValueChange={(v) => setScopeCityId(v || null)}>
              <SelectTrigger className="w-[160px] h-8"><SelectValue placeholder="Select city" /></SelectTrigger>
              <SelectContent>
                {(leagueCities || []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        {/* Round filter */}
        <div>
          <Label className="text-xs">Round</Label>
          <Select value={selectedRound ? String(selectedRound) : "all"} onValueChange={(v) => setSelectedRound(v === "all" ? undefined : Number(v))}>
            <SelectTrigger className="w-[160px] h-8"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Rounds</SelectItem>
              {(rounds || []).map((r) => (
                <SelectItem key={r.round_number} value={String(r.round_number)}>R{r.round_number}: {r.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {/* Type filter */}
        <div>
          <Label className="text-xs">View</Label>
          <div className="flex gap-1 mt-0.5">
            {(['all', 'individuals', 'teams'] as const).map((f) => (
              <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} className="h-8 text-xs capitalize" onClick={() => setFilter(f)}>
                {f}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {scope === 'city' && !scopeCityId ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Select a league city to view its leaderboard.</p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">No leaderboard data yet. Scores need to be submitted and rounds closed.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8"></TableHead>
              <TableHead className="w-12">#</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              {!leaderboard?.handicap_active && <TableHead className="text-right">Gross</TableHead>}
              <TableHead className="text-right">Net</TableHead>
              <TableHead className="text-right">Par</TableHead>
              <TableHead className="text-right">vs Par</TableHead>
              <TableHead className="text-right">Final</TableHead>
              <TableHead className="text-right">Rounds</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((entry) => {
              const vsPar = entry.final_vs_par ?? entry.net_vs_par ?? 0;
              const vsParLabel = vsPar === 0 ? "E" : vsPar > 0 ? `+${vsPar}` : `${vsPar}`;
              const vsParClass = vsPar < 0 ? "text-emerald-600" : vsPar > 0 ? "text-red-600" : "text-muted-foreground";
              const colSpanForDetail = leaderboard?.handicap_active ? 9 : 10;
              const isExpanded = expandedEntry === entry.id;
              const expandable = entry.type === 'team' || entry.breakdown.length > 0;
              return (
              <>
                <TableRow
                  key={entry.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => setExpandedEntry(expandedEntry === entry.id ? null : entry.id)}
                >
                  <TableCell className="px-2">
                    {expandable ? (
                      <ChevronRight className={cn("h-4 w-4 text-muted-foreground transition-transform", isExpanded && "rotate-90")} />
                    ) : null}
                  </TableCell>
                  <TableCell className="font-semibold">{entry.rank}</TableCell>
                  <TableCell>
                    <div>
                      <span className="font-medium text-sm">{entry.name}</span>
                      {entry.team_name && <p className="text-xs text-muted-foreground">{entry.team_name}</p>}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={entry.type === 'team' ? 'default' : 'outline'} className="text-xs">
                      {entry.type === 'team' ? '🏆 Team' : '👤 Individual'}
                    </Badge>
                  </TableCell>
                  {!leaderboard?.handicap_active && <TableCell className="text-right">{entry.total_gross}</TableCell>}
                  <TableCell className="text-right">{entry.total_net}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{entry.total_par ?? '—'}</TableCell>
                  <TableCell className={cn("text-right font-semibold", vsParClass)}>{vsParLabel}</TableCell>
                  <TableCell className="text-right font-semibold">{entry.final_score}</TableCell>
                  <TableCell className="text-right">{entry.rounds_played}</TableCell>
                </TableRow>

                {expandedEntry === entry.id && (
                  <TableRow key={`${entry.id}-detail`}>
                    <TableCell colSpan={colSpanForDetail} className="bg-muted/20 p-4">
                      <div className="space-y-3">
                        {/* Round breakdown */}
                        {entry.breakdown.length > 0 && (
                          <div>
                            <p className="text-xs font-medium text-muted-foreground mb-1">Round Breakdown</p>
                            <div className="flex gap-3 flex-wrap">
                              {entry.breakdown.map((b) => {
                                const rVs = b.net_vs_par ?? 0;
                                const rLabel = rVs === 0 ? "E" : rVs > 0 ? `+${rVs}` : `${rVs}`;
                                const rClass = rVs < 0 ? "text-emerald-600" : rVs > 0 ? "text-red-600" : "text-muted-foreground";
                                return (
                                  <div key={b.round} className="border rounded px-3 py-1.5 text-xs bg-background">
                                    <span className="font-medium">R{b.round}</span>: Gross {b.gross}, Net {b.net}
                                    {b.par ? <span className="text-muted-foreground"> (Par {b.par})</span> : null}
                                    {b.net_vs_par !== undefined && (
                                      <span className={cn("ml-1 font-semibold", rClass)}>{rLabel}</span>
                                    )}
                                    {b.handicap > 0 && <span className="text-muted-foreground"> · HC -{b.handicap}</span>}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Team members */}
                        {entry.type === 'team' && entry.members && entry.members.length > 0 && (
                          <div>
                            <p className="text-xs font-medium text-muted-foreground mb-1">Team Members</p>
                            <div className="flex gap-3 flex-wrap">
                              {entry.members.map((m) => (
                                <div key={m.player_id} className="border rounded px-3 py-1.5 text-xs bg-background">
                                  <span className="font-medium">{m.name}</span>: Net {m.net_score}
                                </div>
                              ))}
                            </div>
                            {(league.fairness_factor_pct || 0) > 0 && (
                              <p className="text-xs text-muted-foreground mt-1">
                                Fairness factor: -{league.fairness_factor_pct}% applied → Final: {entry.final_score}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}


function LeagueDetail({ league, tenant }: { league: League; tenant: Tenant }) {
  const updateLeague = useUpdateLeague(league.id);
  const { data: joinCodes, isLoading: codesLoading } = useJoinCodes(league.id);
  const createCode = useCreateJoinCode(league.id);
  const revokeCode = useRevokeJoinCode(league.id);
  const { data: scores } = useLeagueScores(league.id);
  const { data: scoreRounds } = useLeagueRounds(league.id);
  const [scorecardScore, setScorecardScore] = useState<any | null>(null);
  const { data: players, isLoading: playersLoading } = useLeaguePlayers(league.id);
  const removePlayer = useRemoveLeaguePlayer(league.id);
  const { data: branding } = useLeagueBranding(league.id);
  const updateBranding = useUpdateBranding(league.id);
  const { data: auditLogs } = useLeagueAuditLog(league.tenant_id, league.id);
  const { data: teams } = useLeagueTeams(league.id);
  const { toast } = useToast();

  const [sponsorName, setSponsorName] = useState(branding?.sponsor_name || "");
  const [sponsorUrl, setSponsorUrl] = useState(branding?.sponsor_url || "");
  const [leagueLogoUrl, setLeagueLogoUrl] = useState(branding?.logo_url || "");
  const [sponsorLogoUrl, setSponsorLogoUrl] = useState(branding?.sponsor_logo_url || "");
  const [uploadingLogo, setUploadingLogo] = useState<string | null>(null);
  const [codeTeamId, setCodeTeamId] = useState<string>("");

  // Bidirectional status transitions
  const statusTransitions: Record<LeagueStatus, LeagueStatus[]> = {
    draft: ["active"],
    active: ["draft", "completed"],
    completed: ["active", "archived"],
    archived: ["completed"],
  };

  const availableTransitions = statusTransitions[league.status] || [];

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast({ title: "Copied!", description: code });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">{league.name}</h3>
          <p className="text-sm text-muted-foreground">{league.format.replace(/_/g, " ")} · {league.score_entry_method.replace(/_/g, " ")}</p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={league.status} />
          {availableTransitions.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" disabled={updateLeague.isPending}>
                  Change Status <ChevronDown className="ml-1 h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {availableTransitions.map((s) => (
                  <DropdownMenuItem key={s} onClick={() => updateLeague.mutate({ status: s })}>
                    → {s}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      <Tabs defaultValue="players">
        <TabsList className="flex flex-wrap h-auto gap-1 p-1 mb-4">
          <TabsTrigger value="players"><Users className="h-3.5 w-3.5 mr-1" />Players ({players?.length || 0})</TabsTrigger>
          <TabsTrigger value="teams"><Users className="h-3.5 w-3.5 mr-1" />Teams</TabsTrigger>
          <TabsTrigger value="registrations"><Users className="h-3.5 w-3.5 mr-1" />Registrations</TabsTrigger>
          
          <TabsTrigger value="rounds"><ListOrdered className="h-3.5 w-3.5 mr-1" />Rounds</TabsTrigger>
          <TabsTrigger value="codes">Join Codes</TabsTrigger>
          <TabsTrigger value="scheduling"><Calendar className="h-3.5 w-3.5 mr-1" />Bay Scheduling</TabsTrigger>
          <TabsTrigger value="scores">Scores ({scores?.length || 0})</TabsTrigger>
          <TabsTrigger value="leaderboard"><BarChart3 className="h-3.5 w-3.5 mr-1" />Leaderboard</TabsTrigger>
          <TabsTrigger value="scoring"><Settings2 className="h-3.5 w-3.5 mr-1" />Scoring</TabsTrigger>
          <TabsTrigger value="branding">Branding</TabsTrigger>
          <TabsTrigger value="wrapup"><Trophy className="h-3.5 w-3.5 mr-1" />Wrap-Up</TabsTrigger>
          <TabsTrigger value="audit">Audit Log</TabsTrigger>
        </TabsList>

        <TabsContent value="wrapup" className="space-y-4">
          <SeasonWrapUpPanel
            league={league}
            players={(players || []).map((p: any) => ({ user_id: p.user_id, display_name: p.display_name, email: p.email }))}
            isSiteAdmin={true}
          />
        </TabsContent>

        {/* Players */}
        <TabsContent value="players" className="space-y-4">
          <AddPlayerDialog leagueId={league.id} />
          {playersLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : (!players || players.length === 0) ? (
            <p className="text-sm text-muted-foreground py-4">No players yet. Add players or share a join code.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>City / Location</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {players.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.display_name || "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{p.email || "—"}</TableCell>
                    <TableCell>
                      <PlayerLocationCell leagueId={league.id} player={p} />
                    </TableCell>
                    <TableCell>{format(new Date(p.joined_at), "PP")}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{p.joined_via_code_id ? "Join Code" : "Admin Added"}</Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => removePlayer.mutate(p.id)}
                        disabled={removePlayer.isPending}
                        title="Remove player"
                      >
                        <UserMinus className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TabsContent>

        {/* Teams */}
        <TabsContent value="teams">
          <TeamsPanel league={league} />
        </TabsContent>

        {/* Registrations (paid) */}
        <TabsContent value="registrations">
          <RegistrationsPanel league={league} />
        </TabsContent>

        {/* Cities & Locations */}

        {/* Rounds */}
        <TabsContent value="rounds">
          <RoundsPanel league={league} />
        </TabsContent>

        {/* Join Codes */}
        <TabsContent value="codes" className="space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            {teams && teams.length > 0 && (
              <Select value={codeTeamId} onValueChange={setCodeTeamId}>
                <SelectTrigger className="w-[180px]"><SelectValue placeholder="Individual (no team)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Individual (no team)</SelectItem>
                  {teams.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Button size="sm" onClick={() => createCode.mutate({ team_id: codeTeamId && codeTeamId !== "none" ? codeTeamId : undefined })} disabled={createCode.isPending}>
              <Plus className="h-4 w-4 mr-1" /> Generate Code
            </Button>
          </div>
          {codesLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Uses</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(joinCodes || []).map((jc) => {
                  const teamName = jc.team_id ? teams?.find((t) => t.id === jc.team_id)?.name : null;
                  return (
                    <TableRow key={jc.id}>
                      <TableCell className="font-mono">{jc.code}</TableCell>
                      <TableCell>
                        {teamName ? (
                          <Badge variant="secondary" className="text-xs">{teamName}</Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs">Individual</Badge>
                        )}
                      </TableCell>
                      <TableCell>{jc.use_count}/{jc.max_uses}</TableCell>
                      <TableCell>{jc.expires_at ? format(new Date(jc.expires_at), "PP") : "—"}</TableCell>
                      <TableCell>
                        {jc.revoked_at ? <Badge variant="destructive">Revoked</Badge> :
                          jc.expires_at && new Date(jc.expires_at) < new Date() ? <Badge variant="secondary">Expired</Badge> :
                          <Badge variant="default">Active</Badge>}
                      </TableCell>
                      <TableCell className="flex gap-1">
                        <Button size="icon" variant="ghost" onClick={() => copyCode(jc.code)}><Copy className="h-3.5 w-3.5" /></Button>
                        {!jc.revoked_at && (
                          <Button size="icon" variant="ghost" onClick={() => revokeCode.mutate(jc.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </TabsContent>

        {/* Bay Scheduling */}
        <TabsContent value="scheduling">
          <BaySchedulingPanel league={league} tenantId={league.tenant_id} />
        </TabsContent>

        {/* Scores */}
        <TabsContent value="scores" className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              {scores?.length || 0} score{(scores?.length || 0) === 1 ? "" : "s"} submitted
            </p>
            <AdminScoreEntryDialog league={league} players={players || []} />
          </div>
          {(!scores || scores.length === 0) ? (
            <p className="text-sm text-muted-foreground py-4">No scores submitted yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Player</TableHead>
                  <TableHead>Round</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Confirmed</TableHead>
                  <TableHead>Submitted</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {scores.map((s) => (
                  <TableRow
                    key={s.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => setScorecardScore(s)}
                  >
                    <TableCell className="text-sm">
                      <button
                        type="button"
                        className="text-primary hover:underline font-medium"
                        onClick={(e) => { e.stopPropagation(); setScorecardScore(s); }}
                      >
                        {(s as any).player_name || s.player_id.slice(0, 8)}
                      </button>
                    </TableCell>
                    <TableCell>{s.round_number}</TableCell>
                    <TableCell className="font-semibold">{s.total_score ?? "—"}</TableCell>
                    <TableCell><Badge variant="secondary">{s.method}</Badge></TableCell>
                    <TableCell>{s.confirmed_at ? "✓" : "Pending"}</TableCell>
                    <TableCell>{format(new Date(s.created_at), "PP p")}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <ScorecardDialog
            score={scorecardScore}
            round={scoreRounds?.find((r) => r.round_number === scorecardScore?.round_number)}
            leagueId={league.id}
            onClose={() => setScorecardScore(null)}
          />
        </TabsContent>

        {/* Leaderboard */}
        <TabsContent value="leaderboard">
          <LeaderboardPanel league={league} />
        </TabsContent>

        {/* Scoring Config & Hidden Holes */}
        <TabsContent value="scoring" className="space-y-6">
          <ScoringConfigPanel league={league} />
          <Separator />
          <HiddenHolesPanel league={league} />
        </TabsContent>

        {/* Branding */}
        <TabsContent value="branding" className="space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-sm text-muted-foreground">League logo and sponsor logo appear on the public bay-screen leaderboard.</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open(`/leagues/${league.id}/screen`, "_blank")}
            >
              <BarChart3 className="h-4 w-4 mr-1" /> Open Bay Screen ↗
            </Button>
          </div>
          {tenant.sponsorship_enabled && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div><Label>Sponsor Name</Label><Input value={sponsorName} onChange={(e) => setSponsorName(e.target.value)} /></div>
              <div><Label>Sponsor Website URL</Label><Input value={sponsorUrl} onChange={(e) => setSponsorUrl(e.target.value)} placeholder="https://www.example.com" /><p className="text-xs text-muted-foreground mt-1">Clickable link on the sponsor logo/name in the leaderboard</p></div>
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            {/* League Logo */}
            <div className="space-y-2">
              <Label>League Logo</Label>
              {leagueLogoUrl && <img src={leagueLogoUrl} alt="League logo" className="h-16 w-auto rounded border object-contain" />}
              <div className="flex gap-2 items-end">
                <Input value={leagueLogoUrl} onChange={(e) => setLeagueLogoUrl(e.target.value)} placeholder="URL or upload below" className="flex-1" />
                <label className="cursor-pointer">
                  <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setUploadingLogo("league");
                    const ext = file.name.split(".").pop();
                    const path = `leagues/${league.id}/logo.${ext}`;
                    const { error } = await supabase.storage.from("league-assets").upload(path, file, { upsert: true });
                    if (error) { toast({ title: "Upload failed", description: error.message, variant: "destructive" }); setUploadingLogo(null); return; }
                    const { data: { publicUrl } } = supabase.storage.from("league-assets").getPublicUrl(path);
                    setLeagueLogoUrl(publicUrl);
                    setUploadingLogo(null);
                    toast({ title: "Uploaded", description: "League logo uploaded." });
                  }} />
                  <Button variant="outline" size="sm" asChild disabled={uploadingLogo === "league"}>
                    <span>{uploadingLogo === "league" ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Upload className="h-4 w-4 mr-1" />Upload</>}</span>
                  </Button>
                </label>
              </div>
            </div>
            {/* Sponsor Logo */}
            <div className="space-y-2">
              <Label>Sponsor Logo</Label>
              {sponsorLogoUrl && <img src={sponsorLogoUrl} alt="Sponsor logo" className="h-16 w-auto rounded border object-contain" />}
              <div className="flex gap-2 items-end">
                <Input value={sponsorLogoUrl} onChange={(e) => setSponsorLogoUrl(e.target.value)} placeholder="URL or upload below" className="flex-1" />
                <label className="cursor-pointer">
                  <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setUploadingLogo("sponsor");
                    const ext = file.name.split(".").pop();
                    const path = `leagues/${league.id}/sponsor.${ext}`;
                    const { error } = await supabase.storage.from("league-assets").upload(path, file, { upsert: true });
                    if (error) { toast({ title: "Upload failed", description: error.message, variant: "destructive" }); setUploadingLogo(null); return; }
                    const { data: { publicUrl } } = supabase.storage.from("league-assets").getPublicUrl(path);
                    setSponsorLogoUrl(publicUrl);
                    setUploadingLogo(null);
                    toast({ title: "Uploaded", description: "Sponsor logo uploaded." });
                  }} />
                  <Button variant="outline" size="sm" asChild disabled={uploadingLogo === "sponsor"}>
                    <span>{uploadingLogo === "sponsor" ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Upload className="h-4 w-4 mr-1" />Upload</>}</span>
                  </Button>
                </label>
              </div>
            </div>
          </div>
          <Button onClick={() => updateBranding.mutate({ sponsor_name: sponsorName, sponsor_url: sponsorUrl, logo_url: leagueLogoUrl, sponsor_logo_url: sponsorLogoUrl })} disabled={updateBranding.isPending}>
            {updateBranding.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Save Branding
          </Button>
        </TabsContent>

        {/* Audit Log */}
        <TabsContent value="audit">
          <ScrollArea className="h-[300px]">
            {(!auditLogs || auditLogs.length === 0) ? (
              <p className="text-sm text-muted-foreground py-4">No audit entries yet.</p>
            ) : (
              <div className="space-y-2">
                {auditLogs.map((log) => (
                  <div key={log.id} className="flex items-start gap-3 text-sm border-b pb-2">
                    <Badge variant="outline" className="shrink-0">{log.action}</Badge>
                    <div className="min-w-0">
                      <p className="text-muted-foreground">{log.entity_type} · <span className="font-mono text-xs">{log.actor_id.slice(0, 8)}</span> ({log.actor_role})</p>
                      <p className="text-xs text-muted-foreground">{format(new Date(log.created_at), "PP p")}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function QuickCompetitionsCard({
  tenantId,
  selectedQcId,
  onSelect,
}: { tenantId: string; selectedQcId: string | null; onSelect: (id: string) => void }) {
  const { data: comps = [], isLoading } = useQuickCompetitions(tenantId);
  const active = comps.filter((c) => c.status === "active");
  const past = comps.filter((c) => c.status === "completed");
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base flex items-center gap-2"><Zap className="h-4 w-4" /> Quick Competitions</CardTitle>
        <QuickCompetitionDialog tenantId={tenantId} onCreated={onSelect} />
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : comps.length === 0 ? (
          <p className="text-sm text-muted-foreground px-6 py-6 text-center">No quick competitions yet.</p>
        ) : (
          <div className="divide-y">
            {active.length > 0 && <div className="px-4 pt-2 pb-1 text-xs uppercase tracking-wider text-muted-foreground">Active</div>}
            {active.map((c) => (
              <button
                key={c.id}
                onClick={() => onSelect(c.id)}
                className={`w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors ${selectedQcId === c.id ? "bg-muted" : ""}`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-sm">{c.name}</span>
                  <Badge variant="default" className="text-[10px]">Live</Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{c.unit === "yd" ? "Yards" : "Metres"} · {c.max_attempts >= 999 ? "unlimited" : c.max_attempts} attempts</p>
              </button>
            ))}
            {past.length > 0 && <div className="px-4 pt-2 pb-1 text-xs uppercase tracking-wider text-muted-foreground">Past</div>}
            {past.map((c) => (
              <button
                key={c.id}
                onClick={() => onSelect(c.id)}
                className={`w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors ${selectedQcId === c.id ? "bg-muted" : ""}`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-sm">{c.name}</span>
                  <Badge variant="secondary" className="text-[10px]">Done</Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{format(new Date(c.created_at), "d MMM yyyy")}</p>
              </button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ══════════════════════════════════════════════════════════════
// MAIN ADMIN LEAGUES TAB
// ══════════════════════════════════════════════════════════════
export function AdminLeaguesTab() {
  const { data: tenants, isLoading: tenantsLoading } = useTenants();
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);
  const [selectedLeague, setSelectedLeague] = useState<League | null>(null);
  const [selectedQcId, setSelectedQcId] = useState<string | null>(null);

  const selectedTenant = tenants?.find((t) => t.id === selectedTenantId) ?? null;
  const { data: leagues, isLoading: leaguesLoading } = useLeagues(selectedTenantId);

  // Auto-select first tenant
  if (!selectedTenantId && tenants && tenants.length > 0) {
    setSelectedTenantId(tenants[0].id);
  }

  if (tenantsLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">

      {/* Tenant selector */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-[200px]">
          <Select value={selectedTenantId || ""} onValueChange={setSelectedTenantId}>
            <SelectTrigger><SelectValue placeholder="Select tenant" /></SelectTrigger>
            <SelectContent>
              {(tenants || []).map((t) => (
                <SelectItem key={t.id} value={t.id}>{t.name} ({t.city})</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <CreateTenantDialog />
        {selectedTenant && (
          <SponsorshipToggle tenant={selectedTenant} />
        )}
      </div>

      {selectedTenantId && (
        <div className="grid gap-6 lg:grid-cols-[1fr_2fr]">
          {/* Leagues + Quick Competitions list */}
          <div className="space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <CardTitle className="text-base flex items-center gap-2"><Trophy className="h-4 w-4" /> Leagues</CardTitle>
                {selectedTenantId && <CreateLeagueDialog tenantId={selectedTenantId} />}
              </CardHeader>
              <CardContent className="p-0">
                {leaguesLoading ? (
                  <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>
                ) : (!leagues || leagues.length === 0) ? (
                  <p className="text-sm text-muted-foreground px-6 py-8 text-center">No leagues yet. Create one to get started.</p>
                ) : (
                  <div className="divide-y">
                    {leagues.map((l) => (
                      <LegacyLeagueRow
                        key={l.id}
                        league={l}
                        tenantId={selectedTenantId}
                        selected={selectedLeague?.id === l.id && !selectedQcId}
                        onSelect={() => { setSelectedLeague(l); setSelectedQcId(null); }}
                        onDeleted={() => { if (selectedLeague?.id === l.id) setSelectedLeague(null); }}
                      />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <QuickCompetitionsCard
              tenantId={selectedTenantId}
              selectedQcId={selectedQcId}
              onSelect={(id) => { setSelectedQcId(id); setSelectedLeague(null); }}
            />
          </div>

          {/* Detail panel */}
          <Card>
            <CardContent className="pt-6">
              {selectedQcId ? (
                <QuickCompetitionConsole competitionId={selectedQcId} onClose={() => setSelectedQcId(null)} />
              ) : selectedLeague && selectedTenant ? (
                <LeagueDetail league={selectedLeague} tenant={selectedTenant} />
              ) : (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                  <Eye className="h-10 w-10 mb-3 opacity-30" />
                  <p className="text-sm">Select a league or quick competition to view details</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

// ── Scorecard Dialog ─────────────────────────────────────────
function ScorecardDialog({
  score,
  round,
  leagueId,
  onClose,
}: {
  score: any | null;
  round: { par_per_hole: number[]; name?: string } | undefined;
  leagueId: string;
  onClose: () => void;
}) {
  const { data: hiddenHolesData } = useHiddenHolesAdmin(score ? leagueId : null);
  if (!score) return null;

  const holeScores: number[] = Array.isArray(score.hole_scores) ? score.hole_scores : [];
  const par: number[] = Array.isArray(round?.par_per_hole) ? round!.par_per_hole : [];
  const holeCount = holeScores.length || par.length;
  const roundHH = hiddenHolesData?.find((h: any) => h.round_number === score.round_number);
  const hidden: number[] = Array.isArray(roundHH?.hidden_holes) ? roundHH!.hidden_holes! : [];

  const gross = holeScores.reduce((s, v) => s + (Number(v) || 0), 0);
  const totalPar = par.slice(0, holeCount).reduce((s, v) => s + (Number(v) || 0), 0);
  const hiddenSum = hidden.reduce((s, h) => s + (Number(holeScores[h - 1]) || 0), 0);
  const peoriaHC = totalPar > 0 && hidden.length > 0 ? hiddenSum * 3 - totalPar : 0;
  const net = gross - peoriaHC;

  return (
    <Dialog open={!!score} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            Scorecard — {score.player_name || score.player_id?.slice(0, 8)}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge variant="outline">Round {score.round_number}{round?.name ? ` · ${round.name}` : ""}</Badge>
            <Badge variant="secondary">{score.method}</Badge>
            {score.confirmed_at ? <Badge>Confirmed</Badge> : <Badge variant="outline">Pending</Badge>}
            <Badge variant="outline">{format(new Date(score.created_at), "PP p")}</Badge>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">Hole</TableHead>
                  {Array.from({ length: holeCount }).map((_, i) => {
                    const isHidden = hidden.includes(i + 1);
                    return (
                      <TableHead
                        key={i}
                        className={`text-center px-2 ${isHidden ? "bg-accent/30 text-accent-foreground" : ""}`}
                      >
                        {i + 1}
                      </TableHead>
                    );
                  })}
                  <TableHead className="text-center font-bold">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell className="font-medium text-muted-foreground">Par</TableCell>
                  {Array.from({ length: holeCount }).map((_, i) => (
                    <TableCell key={i} className="text-center px-2 text-muted-foreground">
                      {par[i] ?? "—"}
                    </TableCell>
                  ))}
                  <TableCell className="text-center font-semibold">{totalPar || "—"}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Score</TableCell>
                  {Array.from({ length: holeCount }).map((_, i) => {
                    const isHidden = hidden.includes(i + 1);
                    const v = holeScores[i];
                    const p = par[i];
                    const diff = typeof v === "number" && typeof p === "number" ? v - p : null;
                    return (
                      <TableCell
                        key={i}
                        className={`text-center px-2 font-medium ${isHidden ? "bg-accent/30" : ""} ${
                          diff !== null && diff < 0 ? "text-green-600" : diff !== null && diff > 0 ? "text-destructive" : ""
                        }`}
                      >
                        {v ?? "—"}
                      </TableCell>
                    );
                  })}
                  <TableCell className="text-center font-bold">{gross || "—"}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>

          {hidden.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Hidden holes (highlighted): {hidden.join(", ")}
            </p>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t">
            <div>
              <p className="text-xs text-muted-foreground">Gross</p>
              <p className="text-lg font-bold">{gross || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Round Par</p>
              <p className="text-lg font-bold">{totalPar || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Peoria HC</p>
              <p className="text-lg font-bold">
                {hidden.length > 0 && totalPar > 0 ? peoriaHC : "—"}
              </p>
              {hidden.length > 0 && totalPar > 0 && (
                <p className="text-[10px] text-muted-foreground">({hiddenSum} × 3) − {totalPar}</p>
              )}
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Net</p>
              <p className="text-lg font-bold text-primary">
                {hidden.length > 0 && totalPar > 0 ? net : "—"}
              </p>
            </div>
          </div>

          {score.photo_url && (
            <div>
              <p className="text-xs text-muted-foreground mb-2">Submitted photo</p>
              <img src={score.photo_url} alt="Scorecard photo" className="max-h-64 rounded border" />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
