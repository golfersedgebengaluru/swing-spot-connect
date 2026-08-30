import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Check, Search, X } from "lucide-react";
import {
  COACH_NOTE_MAX,
  type DrillSelection,
  type LibraryFocus,
  type SessionSelection,
} from "@/lib/coaching-library";

interface Props {
  library: LibraryFocus[];
  value: SessionSelection;
  onChange: (next: SessionSelection) => void;
}

/**
 * Mobile-first picker: choose focuses, then tap the drills mapped to each focus,
 * then add one optional note per drill. A drill mapped to two picked focuses is
 * only ever selected once (the database enforces the same rule).
 */
export function FocusDrillPicker({ library, value, onChange }: Props) {
  const [search, setSearch] = useState("");

  const pickedFocuses = useMemo(
    () => value.focusIds.map((id) => library.find((f) => f.id === id)).filter(Boolean) as LibraryFocus[],
    [value.focusIds, library]
  );

  const matches = useMemo(() => {
    const term = search.trim().toLowerCase();
    return library.filter(
      (f) =>
        !value.focusIds.includes(f.id) &&
        (!term ||
          f.name.toLowerCase().includes(term) ||
          (f.category_name ?? "").toLowerCase().includes(term))
    );
  }, [library, search, value.focusIds]);

  const selectedDrillIds = new Set(value.drills.map((d) => d.drillId));

  const toggleFocus = (focusId: string, on: boolean) => {
    if (on) {
      onChange({ ...value, focusIds: [...value.focusIds, focusId] });
    } else {
      const focus = library.find((f) => f.id === focusId);
      const dropped = new Set((focus?.drills ?? []).map((d) => d.id));
      onChange({
        focusIds: value.focusIds.filter((id) => id !== focusId),
        // Keep a drill if it is still reachable from another picked focus.
        drills: value.drills.filter((d) => {
          if (d.focusId !== focusId) return true;
          const stillPicked = value.focusIds
            .filter((id) => id !== focusId)
            .some((id) => library.find((f) => f.id === id)?.drills.some((x) => x.id === d.drillId));
          return stillPicked ? false : !dropped.has(d.drillId);
        }),
      });
    }
  };

  const toggleDrill = (drillId: string, focusId: string) => {
    if (selectedDrillIds.has(drillId)) {
      onChange({ ...value, drills: value.drills.filter((d) => d.drillId !== drillId) });
    } else {
      const next: DrillSelection = { drillId, focusId, note: "" };
      onChange({ ...value, drills: [...value.drills, next] });
    }
  };

  const setNote = (drillId: string, note: string) => {
    onChange({
      ...value,
      drills: value.drills.map((d) => (d.drillId === drillId ? { ...d, note } : d)),
    });
  };

  const drillName = (drillId: string) => {
    for (const f of library) {
      const hit = f.drills.find((d) => d.id === drillId);
      if (hit) return hit.name;
    }
    return "Drill";
  };

  return (
    <div className="space-y-4">
      {/* Focus selection */}
      <div className="space-y-2">
        <Label>Coaching Focus</Label>
        {pickedFocuses.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {pickedFocuses.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => toggleFocus(f.id, false)}
                className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full bg-primary/10 px-3 text-sm text-primary"
              >
                {f.name}
                <X className="h-3.5 w-3.5" />
              </button>
            ))}
          </div>
        )}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search focuses…"
            className="pl-8"
          />
        </div>
        {library.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No focuses configured yet. An admin can add them under Coaching → Library.
          </p>
        ) : (
          <div className="max-h-48 overflow-y-auto rounded-md border divide-y">
            {matches.length === 0 ? (
              <div className="p-3 text-sm text-muted-foreground">No more focuses match</div>
            ) : (
              matches.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => { toggleFocus(f.id, true); setSearch(""); }}
                  className="flex w-full min-h-[44px] items-center justify-between gap-2 px-3 py-2 text-left text-sm active:bg-muted"
                >
                  <span className="truncate">{f.name}</span>
                  {f.category_name && (
                    <Badge variant="outline" className="shrink-0 text-[10px]">{f.category_name}</Badge>
                  )}
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {/* Drills per picked focus */}
      {pickedFocuses.map((f) => (
        <div key={f.id} className="rounded-md border p-3 space-y-2">
          <div className="text-sm font-medium">{f.name} drills</div>
          {f.drills.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No drills are mapped to this focus yet. You can still save the session.
            </p>
          ) : (
            <div className="space-y-1.5">
              {f.drills.map((d) => {
                const on = selectedDrillIds.has(d.id);
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => toggleDrill(d.id, f.id)}
                    className={`flex w-full min-h-[44px] items-start justify-between gap-2 rounded-md border px-3 py-2 text-left text-sm ${
                      on ? "border-primary bg-primary/5" : "bg-background"
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="block font-medium truncate">{d.name}</span>
                      {d.recommended_reps && (
                        <span className="block text-xs text-muted-foreground">{d.recommended_reps}</span>
                      )}
                    </span>
                    {on && <Check className="h-4 w-4 text-primary shrink-0" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ))}

      {/* Notes per selected drill */}
      {value.drills.length > 0 && (
        <div className="space-y-3">
          <Label>Drill notes (optional)</Label>
          {value.drills.map((d) => {
            const len = (d.note ?? "").length;
            const over = len > COACH_NOTE_MAX;
            return (
              <div key={d.drillId} className="space-y-1">
                <div className="text-sm font-medium">{drillName(d.drillId)}</div>
                <Textarea
                  rows={2}
                  maxLength={COACH_NOTE_MAX}
                  value={d.note ?? ""}
                  onChange={(e) => setNote(d.drillId, e.target.value)}
                  placeholder="Note for this drill…"
                />
                <div className={`text-xs ${over ? "text-destructive" : "text-muted-foreground"}`}>
                  {len}/{COACH_NOTE_MAX}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
