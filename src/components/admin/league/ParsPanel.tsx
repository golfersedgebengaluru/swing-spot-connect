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

/** Read-only chips of locations that will use this par set (software match). */
function DerivedLocationPills({ leagueId, software }: { leagueId: string; software: string }) {
  const { data: cities } = useLeagueCities(leagueId);
  return (
    <div className="space-y-1.5 pt-2 border-t border-border/50">
      <Label className="text-[11px] text-muted-foreground">Locations using this par set (auto-matched by software)</Label>
      {(cities || []).length === 0 && <p className="text-xs text-muted-foreground">No cities yet.</p>}
      {(cities || []).map((c) => (
        <CityDerivedRow key={c.id} leagueId={leagueId} cityId={c.id} cityName={c.name} software={software} />
      ))}
    </div>
  );
}

function CityDerivedRow({ leagueId, cityId, cityName, software }: { leagueId: string; cityId: string; cityName: string; software: string }) {
  const { data: locations } = useLeagueLocations(leagueId, cityId);
  if (!locations || locations.length === 0) return null;
  return (
    <div className="text-xs">
      <div className="text-muted-foreground mb-1">{cityName}</div>
      <div className="flex flex-wrap gap-1.5 pl-2">
        {locations.map((loc) => {
          const locSw = (loc as any).software || "TGC";
          const matches = locSw === software;
          return (
            <div
              key={loc.id}
              className={`px-2 py-0.5 rounded-full border text-[11px] flex items-center gap-1 ${
                matches
                  ? "bg-green-100 text-green-800 border-green-400 dark:bg-green-900/30 dark:text-green-300 dark:border-green-700"
                  : "bg-muted text-muted-foreground border-border"
              }`}
              title={matches ? "This location's software matches" : `Location runs ${locSw}`}
            >
              <MapPin className="h-2.5 w-2.5" />
              {loc.name}
              <span className="text-[9px] opacity-70">· {locSw}</span>
            </div>
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
  const [courseName, setCourseName] = useState(parSet.course_name || parSet.name);
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
          <span>{parSet.course_name || parSet.name}</span>
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
              if (confirm(`Delete par set "${parSet.name}"?`)) {
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
              <div className="grid gap-2 sm:grid-cols-3">
                <div>
                  <Label className="text-xs">Course name</Label>
                  <Input value={courseName} onChange={(e) => setCourseName(e.target.value)} placeholder="e.g. Royal Birkdale" className="h-8 text-xs" />
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
                <div>
                  <Label className="text-xs">Display name</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8 text-xs" />
                </div>
              </div>
              <ParGrid value={par} onChange={setPar} numHoles={numHoles} />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() =>
                    updateMut.mutate(
                      { id: parSet.id, name: name.trim(), course_name: courseName.trim(), software, par_per_hole: par },
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
                  setCourseName(parSet.course_name || parSet.name);
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
          <DerivedLocationPills leagueId={leagueId} software={parSet.software} />
        </div>
      )}
    </div>
  );
}

export function ParsPanel({ leagueId, numHoles }: Props) {
  const { data: parSets, isLoading } = useLeagueParSets(leagueId);
  const createMut = useCreateLeagueParSet(leagueId);
  const [showAdd, setShowAdd] = useState(false);
  const [courseName, setCourseName] = useState("");
  const [software, setSoftware] = useState("TGC");
  const [par, setPar] = useState<number[]>(Array(numHoles).fill(4));

  const reset = () => {
    setCourseName("");
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
          One par set per <b>course + software</b> (e.g. "Royal Birkdale — TGC"). Rounds pick a course; each team gets the par set matching their location's software automatically.
        </p>
        {showAdd && (
          <div className="border rounded-md p-3 space-y-3 bg-muted/30">
            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <Label className="text-xs">Course name</Label>
                <Input value={courseName} onChange={(e) => setCourseName(e.target.value)} placeholder="e.g. Royal Birkdale" className="h-8 text-xs" />
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
                disabled={!courseName.trim() || createMut.isPending}
                onClick={() => {
                  const cn = courseName.trim();
                  createMut.mutate(
                    { name: `${cn} — ${software}`, course_name: cn, software, par_per_hole: par },
                    { onSuccess: reset },
                  );
                }}
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
