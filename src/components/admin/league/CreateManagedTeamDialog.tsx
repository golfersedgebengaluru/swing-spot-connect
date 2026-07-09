import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus, Trash2, Star } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { League } from "@/types/league";
import { useLegacyLeagueCities, useLegacyLeagueLocations, useCreateManagedTeam } from "@/hooks/useLegacyLeagueRegistration";

interface MemberRow {
  name: string;
  email: string;
  phone: string;
  is_captain: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  league: League;
}

export function CreateManagedTeamDialog({ open, onOpenChange, league }: Props) {
  const { toast } = useToast();
  const allowedSizes = league.allowed_team_sizes ?? [];
  const [teamName, setTeamName] = useState("");
  const [cityId, setCityId] = useState<string>("");
  const [locationId, setLocationId] = useState<string>("");
  const [teamSize, setTeamSize] = useState<number>(allowedSizes[0] ?? 4);
  const [members, setMembers] = useState<MemberRow[]>(() =>
    Array.from({ length: allowedSizes[0] ?? 4 }, (_, i) => ({
      name: "", email: "", phone: "", is_captain: i === 0,
    })),
  );

  const { data: cities } = useLegacyLeagueCities(open ? league.id : null);
  const { data: locations } = useLegacyLeagueLocations(open ? league.id : null, cityId || null);
  const createMut = useCreateManagedTeam(league.id);

  const captainIdx = useMemo(() => members.findIndex((m) => m.is_captain), [members]);

  const resizeMembers = (size: number) => {
    setTeamSize(size);
    setMembers((prev) => {
      const next = prev.slice(0, size);
      while (next.length < size) next.push({ name: "", email: "", phone: "", is_captain: false });
      if (!next.some((m) => m.is_captain) && next[0]) next[0].is_captain = true;
      return next;
    });
  };

  const updateMember = (idx: number, patch: Partial<MemberRow>) => {
    setMembers((prev) => prev.map((m, i) => (i === idx ? { ...m, ...patch } : m)));
  };

  const setCaptain = (idx: number) => {
    setMembers((prev) => prev.map((m, i) => ({ ...m, is_captain: i === idx })));
  };

  const reset = () => {
    setTeamName(""); setCityId(""); setLocationId("");
    setTeamSize(allowedSizes[0] ?? 4);
    setMembers(Array.from({ length: allowedSizes[0] ?? 4 }, (_, i) => ({
      name: "", email: "", phone: "", is_captain: i === 0,
    })));
  };

  const handleSave = async () => {
    if (!teamName.trim()) return toast({ title: "Team name required", variant: "destructive" });
    if (!cityId || !locationId) return toast({ title: "City and location required", variant: "destructive" });
    if (members.some((m) => !m.name.trim())) return toast({ title: "Every member needs a name", variant: "destructive" });
    if (captainIdx === -1) return toast({ title: "Mark one captain", variant: "destructive" });

    try {
      await createMut.mutateAsync({
        league_city_id: cityId,
        league_location_id: locationId,
        team_name: teamName.trim(),
        members: members.map((m) => ({
          name: m.name.trim(),
          email: m.email.trim() || undefined,
          phone: m.phone.trim() || undefined,
          is_captain: m.is_captain,
        })),
      });
      toast({ title: "Managed team created", description: "Welcome emails are being sent." });
      reset();
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "Could not create team", description: e?.message, variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Managed Team — {league.name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Team name</Label>
              <Input value={teamName} onChange={(e) => setTeamName(e.target.value)} placeholder="e.g. The Fairway Family" />
            </div>
            <div>
              <Label>Team size</Label>
              <Select value={String(teamSize)} onValueChange={(v) => resizeMembers(Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {allowedSizes.map((s) => <SelectItem key={s} value={String(s)}>{s} players</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
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

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Members</Label>
              <span className="text-xs text-muted-foreground">
                Tap ★ to set the captain. The captain's email is used as the team contact.
              </span>
            </div>
            {members.map((m, i) => (
              <div key={i} className="grid grid-cols-[auto_2fr_2fr_1.5fr] gap-2 items-center">
                <Button
                  type="button" size="icon" variant={m.is_captain ? "default" : "ghost"}
                  className="h-8 w-8" onClick={() => setCaptain(i)} title="Set captain"
                >
                  <Star className={`h-4 w-4 ${m.is_captain ? "fill-current" : ""}`} />
                </Button>
                <Input placeholder="Name*" value={m.name} onChange={(e) => updateMember(i, { name: e.target.value })} />
                <Input placeholder="Email (optional)" type="email" value={m.email} onChange={(e) => updateMember(i, { email: e.target.value })} />
                <Input placeholder="Phone (optional)" value={m.phone} onChange={(e) => updateMember(i, { phone: e.target.value })} />
              </div>
            ))}
            <p className="text-xs text-muted-foreground">
              Emails are optional. If a member later signs up with their email, we'll auto-attach them to this team.
              Payment is assumed complete — invoice it separately in the Invoices tab.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={createMut.isPending}>
            {createMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Create Team
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
