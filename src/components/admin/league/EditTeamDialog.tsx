import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { League } from "@/types/league";
import {
  useLegacyLeagueCities,
  useLegacyLeagueLocations,
  useUpdateTeamRegistration,
} from "@/hooks/useLegacyLeagueRegistration";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  league: League;
  team: {
    id: string;
    team_name: string;
    league_city_id: string;
    league_location_id: string;
    team_size: number;
    members?: any[];
  } | null;
}

export function EditTeamDialog({ open, onOpenChange, league, team }: Props) {
  const { toast } = useToast();
  const allowedSizes = league.allowed_team_sizes ?? [];
  const [teamName, setTeamName] = useState("");
  const [cityId, setCityId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [teamSize, setTeamSize] = useState<number>(allowedSizes[0] ?? 4);

  const { data: cities } = useLegacyLeagueCities(open ? league.id : null);
  const { data: locations } = useLegacyLeagueLocations(open ? league.id : null, cityId || null);
  const updateMut = useUpdateTeamRegistration(league.id);

  const rosterCount = team?.members?.length ?? 0;

  useEffect(() => {
    if (open && team) {
      setTeamName(team.team_name);
      setCityId(team.league_city_id);
      setLocationId(team.league_location_id);
      setTeamSize(team.team_size);
    }
  }, [open, team]);

  const handleSave = async () => {
    if (!team) return;
    if (!teamName.trim()) return toast({ title: "Team name required", variant: "destructive" });
    if (!cityId || !locationId) return toast({ title: "City and location required", variant: "destructive" });
    if (teamSize < rosterCount) {
      return toast({
        title: "Team size too small",
        description: `Remove members first — team currently has ${rosterCount} on the roster.`,
        variant: "destructive",
      });
    }
    try {
      await updateMut.mutateAsync({
        registrationId: team.id,
        team_name: teamName.trim(),
        league_city_id: cityId,
        league_location_id: locationId,
        team_size: teamSize,
      });
      toast({ title: "Team updated" });
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "Could not update", description: e?.message, variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Team — {team?.team_name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label>Team name</Label>
            <Input value={teamName} onChange={(e) => setTeamName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>City</Label>
              <Select value={cityId} onValueChange={(v) => { setCityId(v); setLocationId(""); }}>
                <SelectTrigger><SelectValue placeholder="Select city" /></SelectTrigger>
                <SelectContent>
                  {(cities ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Location</Label>
              <Select value={locationId} onValueChange={setLocationId} disabled={!cityId}>
                <SelectTrigger><SelectValue placeholder="Select location" /></SelectTrigger>
                <SelectContent>
                  {(locations ?? []).map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Team size</Label>
            <Select value={String(teamSize)} onValueChange={(v) => setTeamSize(Number(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {allowedSizes.map((s) => (
                  <SelectItem key={s} value={String(s)} disabled={s < rosterCount}>
                    {s} players{s < rosterCount ? ` (below current roster of ${rosterCount})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">
              Cannot be smaller than the current roster ({rosterCount}).
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={updateMut.isPending}>
            {updateMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
