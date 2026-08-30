import { Badge } from "@/components/ui/badge";
import { useSessionLibraryEntries } from "@/hooks/useCoachingLibrary";

/**
 * Read-only render of a session's focuses/drills straight from the frozen
 * snapshots, so later library edits never change historic sessions.
 */
export function SessionLibrarySummary({
  sessionId,
  compact,
}: {
  sessionId: string;
  compact?: boolean;
}) {
  const { data } = useSessionLibraryEntries(sessionId);
  const focuses = data?.focuses ?? [];
  const drills = data?.drills ?? [];
  if (!focuses.length && !drills.length) return null;

  if (compact) {
    return (
      <div className="flex flex-wrap gap-1.5">
        {focuses.map((f: any) => (
          <Badge key={f.id} variant="secondary" className="text-[10px]">
            {(f.snapshot as any)?.name ?? "Focus"}
          </Badge>
        ))}
        {drills.length > 0 && (
          <Badge variant="outline" className="text-[10px]">
            {drills.length} drill{drills.length === 1 ? "" : "s"}
          </Badge>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {focuses.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {focuses.map((f: any) => (
            <Badge key={f.id} variant="secondary">{(f.snapshot as any)?.name ?? "Focus"}</Badge>
          ))}
        </div>
      )}
      {drills.map((d: any) => {
        const s = (d.snapshot ?? {}) as any;
        return (
          <div key={d.id} className="rounded-md border p-3 space-y-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">{s.name ?? "Drill"}</span>
              {s.focus_name && (
                <Badge variant="outline" className="text-[10px] shrink-0">{s.focus_name}</Badge>
              )}
            </div>
            {s.objective && <p className="text-xs text-muted-foreground">{s.objective}</p>}
            {s.instructions && <p className="text-sm whitespace-pre-wrap">{s.instructions}</p>}
            {s.recommended_reps && (
              <p className="text-xs text-muted-foreground">Reps: {s.recommended_reps}</p>
            )}
            {d.coach_note && (
              <p className="text-sm whitespace-pre-wrap border-l-2 border-primary/40 pl-2 mt-1">
                {d.coach_note}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
