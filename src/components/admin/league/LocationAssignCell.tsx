import { useMemo } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLeagueCities, useLeagueLocations } from "@/hooks/useLeagues";

interface Props {
  leagueId: string;
  cityId: string | null | undefined;
  locationId: string | null | undefined;
  onChange: (next: { league_city_id: string | null; league_location_id: string | null }) => void;
  disabled?: boolean;
}

const NONE = "__none__";

export function LocationAssignCell({ leagueId, cityId, locationId, onChange, disabled }: Props) {
  const { data: cities } = useLeagueCities(leagueId);
  const { data: locations } = useLeagueLocations(leagueId, cityId || null);

  const cityValue = cityId || NONE;
  const locValue = locationId || NONE;

  const locOptions = useMemo(() => locations || [], [locations]);

  return (
    <div className="flex flex-wrap gap-1.5">
      <Select
        value={cityValue}
        disabled={disabled}
        onValueChange={(v) => {
          const next = v === NONE ? null : v;
          // Resetting city clears location
          onChange({ league_city_id: next, league_location_id: null });
        }}
      >
        <SelectTrigger className="h-7 text-xs w-[120px]">
          <SelectValue placeholder="City" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>— City —</SelectItem>
          {(cities || []).map((c) => (
            <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={locValue}
        disabled={disabled || !cityId}
        onValueChange={(v) => {
          const next = v === NONE ? null : v;
          onChange({ league_city_id: cityId || null, league_location_id: next });
        }}
      >
        <SelectTrigger className="h-7 text-xs w-[140px]">
          <SelectValue placeholder={cityId ? "Location" : "Pick city"} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>— Location —</SelectItem>
          {locOptions.map((l) => (
            <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
