import { useState } from "react";
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
import { Loader2, Plus, Trophy, Users, Copy, Trash2, Eye, Image as ImageIcon, Calendar, UserPlus, UserMinus, Search } from "lucide-react";
import { BaySchedulingPanel } from "@/components/admin/league/BaySchedulingPanel";
import { format } from "date-fns";
import {
  useTenants,
  useCreateTenant,
  useLeagues,
  useCreateLeague,
  useUpdateLeague,
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
} from "@/hooks/useLeagues";
import { supabase } from "@/integrations/supabase/client";
import type { League, LeagueFormat, LeagueStatus, Tenant } from "@/types/league";
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

// ── Create League Dialog ─────────────────────────────────────
function CreateLeagueDialog({ tenantId }: { tenantId: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [format, setFormat] = useState<LeagueFormat>("stroke_play");
  const [venueId, setVenueId] = useState<string>("");
  const createLeague = useCreateLeague(tenantId);
  const { data: bays } = useTenantBays(tenantId);

  const handleCreate = () => {
    if (!name) return;
    createLeague.mutate({ name, format, venue_id: venueId || undefined }, {
      onSuccess: () => { setOpen(false); setName(""); setVenueId(""); },
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus className="h-4 w-4 mr-1" /> New League</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Create League</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="League name" /></div>
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
          <Button onClick={handleCreate} disabled={createLeague.isPending} className="w-full">
            {createLeague.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Create
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

// ── League Detail Panel ──────────────────────────────────────
function LeagueDetail({ league, tenant }: { league: League; tenant: Tenant }) {
  const updateLeague = useUpdateLeague(league.id);
  const { data: joinCodes, isLoading: codesLoading } = useJoinCodes(league.id);
  const createCode = useCreateJoinCode(league.id);
  const revokeCode = useRevokeJoinCode(league.id);
  const { data: scores } = useLeagueScores(league.id);
  const { data: players, isLoading: playersLoading } = useLeaguePlayers(league.id);
  const removePlayer = useRemoveLeaguePlayer(league.id);
  const { data: branding } = useLeagueBranding(tenant.sponsorship_enabled ? league.id : null);
  const updateBranding = useUpdateBranding(league.id);
  const { data: auditLogs } = useLeagueAuditLog(league.tenant_id, league.id);
  const { toast } = useToast();

  const [sponsorName, setSponsorName] = useState(branding?.sponsor_name || "");
  const [sponsorUrl, setSponsorUrl] = useState(branding?.sponsor_url || "");

  const nextStatus: Record<string, LeagueStatus | null> = {
    draft: "active",
    active: "completed",
    completed: "archived",
    archived: null,
  };

  const next = nextStatus[league.status];

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
          {next && (
            <Button size="sm" variant="outline" onClick={() => updateLeague.mutate({ status: next })} disabled={updateLeague.isPending}>
              → {next}
            </Button>
          )}
        </div>
      </div>

      <Tabs defaultValue="players">
        <TabsList>
          <TabsTrigger value="players"><Users className="h-3.5 w-3.5 mr-1" />Players ({players?.length || 0})</TabsTrigger>
          <TabsTrigger value="codes">Join Codes</TabsTrigger>
          <TabsTrigger value="scheduling"><Calendar className="h-3.5 w-3.5 mr-1" />Bay Scheduling</TabsTrigger>
          <TabsTrigger value="scores">Scores ({scores?.length || 0})</TabsTrigger>
          {tenant.sponsorship_enabled && <TabsTrigger value="branding">Branding</TabsTrigger>}
          <TabsTrigger value="audit">Audit Log</TabsTrigger>
        </TabsList>

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

        {/* Join Codes */}
        <TabsContent value="codes" className="space-y-4">
          <Button size="sm" onClick={() => createCode.mutate({})} disabled={createCode.isPending}>
            <Plus className="h-4 w-4 mr-1" /> Generate Code
          </Button>
          {codesLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Uses</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(joinCodes || []).map((jc) => (
                  <TableRow key={jc.id}>
                    <TableCell className="font-mono">{jc.code}</TableCell>
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
                ))}
              </TableBody>
            </Table>
          )}
        </TabsContent>

        {/* Bay Scheduling */}
        <TabsContent value="scheduling">
          <BaySchedulingPanel league={league} tenantId={league.tenant_id} />
        </TabsContent>

        {/* Scores */}
        <TabsContent value="scores">
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
                  <TableRow key={s.id}>
                    <TableCell className="font-mono text-xs">{s.player_id.slice(0, 8)}</TableCell>
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
        </TabsContent>

        {/* Branding */}
        {tenant.sponsorship_enabled && (
          <TabsContent value="branding" className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div><Label>Sponsor Name</Label><Input value={sponsorName} onChange={(e) => setSponsorName(e.target.value)} /></div>
              <div><Label>Sponsor URL</Label><Input value={sponsorUrl} onChange={(e) => setSponsorUrl(e.target.value)} placeholder="https://" /></div>
            </div>
            <Button onClick={() => updateBranding.mutate({ sponsor_name: sponsorName, sponsor_url: sponsorUrl })} disabled={updateBranding.isPending}>
              {updateBranding.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Save Branding
            </Button>
          </TabsContent>
        )}

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

// ══════════════════════════════════════════════════════════════
// MAIN ADMIN LEAGUES TAB
// ══════════════════════════════════════════════════════════════
export function AdminLeaguesTab() {
  const { data: tenants, isLoading: tenantsLoading } = useTenants();
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);
  const [selectedLeague, setSelectedLeague] = useState<League | null>(null);

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
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Sponsorship:</span>
            <Badge variant={selectedTenant.sponsorship_enabled ? "default" : "secondary"}>
              {selectedTenant.sponsorship_enabled ? "ON" : "OFF"}
            </Badge>
          </div>
        )}
      </div>

      {selectedTenantId && (
        <div className="grid gap-6 lg:grid-cols-[1fr_2fr]">
          {/* League list */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base flex items-center gap-2"><Trophy className="h-4 w-4" /> Leagues</CardTitle>
              <CreateLeagueDialog tenantId={selectedTenantId} />
            </CardHeader>
            <CardContent className="p-0">
              {leaguesLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>
              ) : (!leagues || leagues.length === 0) ? (
                <p className="text-sm text-muted-foreground px-6 py-8 text-center">No leagues yet. Create one to get started.</p>
              ) : (
                <div className="divide-y">
                  {leagues.map((l) => (
                    <button
                      key={l.id}
                      onClick={() => setSelectedLeague(l)}
                      className={`w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors ${selectedLeague?.id === l.id ? "bg-muted" : ""}`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm">{l.name}</span>
                        <StatusBadge status={l.status} />
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{l.format.replace(/_/g, " ")}</p>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Detail panel */}
          <Card>
            <CardContent className="pt-6">
              {selectedLeague && selectedTenant ? (
                <LeagueDetail league={selectedLeague} tenant={selectedTenant} />
              ) : (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                  <Eye className="h-10 w-10 mb-3 opacity-30" />
                  <p className="text-sm">Select a league to view details</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
