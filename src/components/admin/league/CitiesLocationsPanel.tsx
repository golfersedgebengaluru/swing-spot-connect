import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Loader2, Plus, Trash2, ChevronDown, ChevronRight, MapPin } from "lucide-react";
import {
  useLeagueCities,
  useCreateLeagueCity,
  useDeleteLeagueCity,
  useLeagueLocations,
  useCreateLeagueLocation,
  useDeleteLeagueLocation,
  useLocationBays,
  useImportLocationBays,
  useUnmapLocationBay,
  useTenantBays,
} from "@/hooks/useLeagues";

interface Props {
  leagueId: string;
  tenantId: string;
}

function LocationBays({ leagueId, cityId, locationId, tenantId }: { leagueId: string; cityId: string; locationId: string; tenantId: string }) {
  const { data: mappings } = useLocationBays(leagueId, cityId, locationId);
  const { data: tenantBays } = useTenantBays(tenantId);
  const importMut = useImportLocationBays(leagueId, cityId, locationId);
  const unmapMut = useUnmapLocationBay(leagueId, cityId, locationId);
  const [selectedBay, setSelectedBay] = useState("");

  const mappedIds = new Set((mappings || []).map((m) => m.bay_id));
  const availableBays = (tenantBays || []).filter((b) => !mappedIds.has(b.id));

  return (
    <div className="space-y-2 pl-6 border-l border-border ml-2 py-2">
      <div className="flex items-center gap-2">
        <Select value={selectedBay} onValueChange={setSelectedBay}>
          <SelectTrigger className="h-8 text-xs flex-1">
            <SelectValue placeholder="Select bay to import…" />
          </SelectTrigger>
          <SelectContent>
            {availableBays.length === 0 ? (
              <div className="px-2 py-1.5 text-xs text-muted-foreground">No more bays</div>
            ) : (
              availableBays.map((b) => (
                <SelectItem key={b.id} value={b.id}>{b.name} · {b.city}</SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
        <Button
          size="sm"
          className="h-8"
          disabled={!selectedBay || importMut.isPending}
          onClick={() => {
            importMut.mutate([selectedBay], { onSuccess: () => setSelectedBay("") });
          }}
        >
          {importMut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
        </Button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {(mappings || []).map((m) => (
          <Badge key={m.id} variant="secondary" className="text-xs gap-1">
            {m.bay_name || m.bay_id.slice(0, 8)}
            <button
              onClick={() => unmapMut.mutate(m.id)}
              className="ml-1 hover:text-destructive"
              aria-label="Unmap bay"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </Badge>
        ))}
        {(mappings || []).length === 0 && (
          <span className="text-xs text-muted-foreground">No bays mapped yet</span>
        )}
      </div>
    </div>
  );
}

function CityLocations({ leagueId, cityId, tenantId }: { leagueId: string; cityId: string; tenantId: string }) {
  const { data: locations, isLoading } = useLeagueLocations(leagueId, cityId);
  const createMut = useCreateLeagueLocation(leagueId, cityId);
  const deleteMut = useDeleteLeagueLocation(leagueId, cityId);
  const [newName, setNewName] = useState("");
  const [expandedLoc, setExpandedLoc] = useState<string | null>(null);

  return (
    <div className="space-y-2 pl-6 border-l border-border ml-2">
      <div className="flex items-center gap-2 pt-2">
        <Input
          placeholder="New location name…"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          className="h-8 text-xs"
        />
        <Button
          size="sm"
          className="h-8"
          disabled={!newName.trim() || createMut.isPending}
          onClick={() => {
            createMut.mutate({ name: newName.trim() }, { onSuccess: () => setNewName("") });
          }}
        >
          {createMut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
        </Button>
      </div>
      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <div className="space-y-1">
          {(locations || []).map((loc) => (
            <div key={loc.id} className="border border-border rounded-md p-2">
              <div className="flex items-center justify-between">
                <button
                  className="flex items-center gap-1 text-xs font-medium"
                  onClick={() => setExpandedLoc(expandedLoc === loc.id ? null : loc.id)}
                >
                  {expandedLoc === loc.id ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                  <MapPin className="h-3 w-3" />
                  {loc.name}
                </button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 w-6 p-0"
                  onClick={() => {
                    if (confirm(`Delete location "${loc.name}"? Bay mappings will also be removed.`)) {
                      deleteMut.mutate(loc.id);
                    }
                  }}
                >
                  <Trash2 className="h-3 w-3 text-destructive" />
                </Button>
              </div>
              {expandedLoc === loc.id && (
                <LocationBays leagueId={leagueId} cityId={cityId} locationId={loc.id} tenantId={tenantId} />
              )}
            </div>
          ))}
          {(locations || []).length === 0 && (
            <p className="text-xs text-muted-foreground">No locations yet</p>
          )}
        </div>
      )}
    </div>
  );
}

export function CitiesLocationsPanel({ leagueId, tenantId }: Props) {
  const { data: cities, isLoading } = useLeagueCities(leagueId);
  const createMut = useCreateLeagueCity(leagueId);
  const deleteMut = useDeleteLeagueCity(leagueId);
  const [newCity, setNewCity] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">League Cities & Locations</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2">
          <Input
            placeholder="New league city name…"
            value={newCity}
            onChange={(e) => setNewCity(e.target.value)}
            className="h-9 text-xs"
          />
          <Button
            size="sm"
            disabled={!newCity.trim() || createMut.isPending}
            onClick={() => {
              createMut.mutate({ name: newCity.trim() }, { onSuccess: () => setNewCity("") });
            }}
          >
            {createMut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <><Plus className="h-3 w-3 mr-1" />Add city</>}
          </Button>
        </div>
        {isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <div className="space-y-2">
            {(cities || []).map((city) => (
              <div key={city.id} className="border border-border rounded-md p-2">
                <div className="flex items-center justify-between">
                  <button
                    className="flex items-center gap-1 text-sm font-semibold"
                    onClick={() => setExpanded(expanded === city.id ? null : city.id)}
                  >
                    {expanded === city.id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    {city.name}
                  </button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0"
                    onClick={() => {
                      if (confirm(`Delete city "${city.name}"? All locations and bay mappings will be removed.`)) {
                        deleteMut.mutate(city.id);
                      }
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
                {expanded === city.id && (
                  <CityLocations leagueId={leagueId} cityId={city.id} tenantId={tenantId} />
                )}
              </div>
            ))}
            {(cities || []).length === 0 && (
              <p className="text-xs text-muted-foreground">No league cities defined yet. Add one to start organizing locations.</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
