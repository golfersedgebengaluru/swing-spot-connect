import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus, Trash2, ChevronDown, ChevronRight, Pencil, Save, X, MapPin } from "lucide-react";
import {
  useLeagueParSets,
  useCreateLeagueParSet,
  useUpdateLeagueParSet,
  useDeleteLeagueParSet,
  useLeagueCities,
  useLeagueLocations,
  useUpdateLeagueLocation,
} from "@/hooks/useLeagues";
import type { LeagueParSetRow } from "@/types/league";

interface Props {
  leagueId: string;
  numHoles: number;
}

const SOFTWARES = ["TGC", "GSPro", "Other"];

function ParGrid({ value, onChange, numHoles }: { value: number[]; onChange: (v: number[]) => void; numHoles: number }) {
  return (
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
}

function LocationAssignments({ leagueId, parSet }: { leagueId: string; parSet: LeagueParSetRow }) {
  const { data: cities } = useLeagueCities(leagueId);
  return (
    <div className="space-y-1.5 pt-2 border-t border-border/50">
      <Label className="text-[11px] text-muted-foreground">Used by locations</Label>
      {(cities || []).length === 0 && <p className="text-xs text-muted-foreground">No cities yet.</p>}
      {(cities || []).map((c) => (
        <CityLocationAssignRow key={c.id} leagueId={leagueId} cityId={c.id} cityName={c.name} parSetId={parSet.id} />
      ))}
    </div>
  );
}

function CityLocationAssignRow({ leagueId, cityId, cityName, parSetId }: { leagueId: string; cityId: string; cityName: string; parSetId: string }) {
  const { data: locations } = useLeagueLocations(leagueId, cityId);
  const updateLoc = useUpdateLeagueLocation(leagueId, cityId);
  if (!locations || locations.length === 0) return null;
  return (
    <div className="text-xs">
      <div className="text-muted-foreground mb-1">{cityName}</div>
      <div className="flex flex-wrap gap-1.5 pl-2">
        {locations.map((loc) => {
          const assigned = loc.par_set_id === parSetId;
          return (
            <button
              key={loc.id}
              type="button"
              onClick={() =>
                updateLoc.mutate({ locationId: loc.id, par_set_id: assigned ? null : parSetId })
              }
              className={`px-2 py-0.5 rounded-full border text-[11px] flex items-center gap-1 ${
                assigned
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background border-border hover:bg-muted"
              }`}
              disabled={updateLoc.isPending}
            >
              <MapPin className="h-2.5 w-2.5" />
              {loc.name}
              {loc.par_set_id && !assigned && (
                <span className="text-[9px] opacity-70">(other)</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ParSetCard({ leagueId, parSet, numHoles }: { leagueId: string; parSet: LeagueParSetRow; numHoles: number }) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(parSet.name);
  const [software, setSoftware] = useState(parSet.software);
  const [par, setPar] = useState<number[]>(
    parSet.par_per_hole?.length === numHoles ? [...parSet.par_per_hole] : Array(numHoles).fill(4),
  );
  const updateMut = useUpdateLeagueParSet(leagueId);
  const deleteMut = useDeleteLeagueParSet(leagueId);

  const totalPar = useMemo(() => (parSet.par_per_hole || []).reduce((s, v) => s + (v || 0), 0), [parSet.par_per_hole]);

  return (
    <div className="border border-border rounded-md p-3">
      <div className="flex items-center justify-between">
        <button className="flex items-center gap-2 text-sm font-medium" onClick={() => setExpanded(!expanded)}>
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          <span>{parSet.name}</span>
          <Badge variant="secondary" className="text-[10px]">{parSet.software}</Badge>
          <Badge variant="outline" className="text-[10px]">Par {totalPar}</Badge>
        </button>
        <div className="flex gap-1">
          {!editing && (
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setEditing(true)}>
              <Pencil className="h-3 w-3" />
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0"
            onClick={() => {
              if (confirm(`Delete par set "${parSet.name}"? Locations using it will be unlinked.`)) {
                deleteMut.mutate(parSet.id);
              }
            }}
          >
            <Trash2 className="h-3 w-3 text-destructive" />
          </Button>
        </div>
      </div>

      {(expanded || editing) && (
        <div className="mt-3 space-y-3">
          {editing ? (
            <>
              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <Label className="text-xs">Name</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8 text-xs" />
                </div>
                <div>
                  <Label className="text-xs">Software</Label>
                  <Select value={software} onValueChange={setSoftware}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {SOFTWARES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <ParGrid value={par} onChange={setPar} numHoles={numHoles} />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() =>
                    updateMut.mutate(
                      { id: parSet.id, name: name.trim(), software, par_per_hole: par },
                      { onSuccess: () => setEditing(false) },
                    )
                  }
                  disabled={updateMut.isPending}
                >
                  {updateMut.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Save className="h-3 w-3 mr-1" />}
                  Save
                </Button>
                <Button size="sm" variant="ghost" onClick={() => {
                  setEditing(false);
                  setName(parSet.name);
                  setSoftware(parSet.software);
                  setPar(parSet.par_per_hole?.length === numHoles ? [...parSet.par_per_hole] : Array(numHoles).fill(4));
                }}>
                  <X className="h-3 w-3 mr-1" />Cancel
                </Button>
              </div>
            </>
          ) : (
            <div className="text-[11px] text-muted-foreground grid grid-cols-9 gap-1">
              {(parSet.par_per_hole || []).map((p, i) => (
                <div key={i} className="text-center">
                  <div className="opacity-60">{i + 1}</div>
                  <div className="font-semibold text-foreground">{p}</div>
                </div>
              ))}
            </div>
          )}
          <LocationAssignments leagueId={leagueId} parSet={parSet} />
        </div>
      )}
    </div>
  );
}

export function ParsPanel({ leagueId, numHoles }: Props) {
  const { data: parSets, isLoading } = useLeagueParSets(leagueId);
  const createMut = useCreateLeagueParSet(leagueId);
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState("");
  const [software, setSoftware] = useState("TGC");
  const [par, setPar] = useState<number[]>(Array(numHoles).fill(4));

  const reset = () => {
    setName("");
    setSoftware("TGC");
    setPar(Array(numHoles).fill(4));
    setShowAdd(false);
  };

  return (
    <Card>
      <CardHeader className="pb-3 flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm">Par Sets</CardTitle>
        <Button size="sm" onClick={() => setShowAdd(!showAdd)}>
          <Plus className="h-3.5 w-3.5 mr-1" />New par set
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Define per-course par values by simulator (e.g. "Pebble Beach — TGC"), then assign each par set to the locations that use it.
          Rounds can seed their par from any par set in the round dialog.
        </p>
        {showAdd && (
          <div className="border rounded-md p-3 space-y-3 bg-muted/30">
            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <Label className="text-xs">Name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Pebble Beach — TGC" className="h-8 text-xs" />
              </div>
              <div>
                <Label className="text-xs">Software</Label>
                <Select value={software} onValueChange={setSoftware}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SOFTWARES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <ParGrid value={par} onChange={setPar} numHoles={numHoles} />
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={!name.trim() || createMut.isPending}
                onClick={() =>
                  createMut.mutate(
                    { name: name.trim(), software, par_per_hole: par },
                    { onSuccess: reset },
                  )
                }
              >
                {createMut.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Plus className="h-3 w-3 mr-1" />}
                Create
              </Button>
              <Button size="sm" variant="ghost" onClick={reset}>Cancel</Button>
            </div>
          </div>
        )}
        {isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <div className="space-y-2">
            {(parSets || []).length === 0 && !showAdd && (
              <p className="text-xs text-muted-foreground">No par sets yet. Create one to get started.</p>
            )}
            {(parSets || []).map((ps) => (
              <ParSetCard key={ps.id} leagueId={leagueId} parSet={ps} numHoles={numHoles} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
