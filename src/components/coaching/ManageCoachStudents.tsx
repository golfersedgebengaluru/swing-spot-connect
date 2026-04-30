import { useState } from "react";
import { Search, X, UserPlus, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  useCoachStudents,
  useStudentSearch,
  useAssignStudentToCoach,
  useUnassignStudentFromCoach,
} from "@/hooks/useCoaching";

interface Props {
  coachId: string;
  coachLabel: string;
}

export function ManageCoachStudents({ coachId, coachLabel }: Props) {
  const { data: students, isLoading } = useCoachStudents(coachId);
  const [search, setSearch] = useState("");
  const { data: searchResults, isFetching } = useStudentSearch(search);
  const assign = useAssignStudentToCoach();
  const unassign = useUnassignStudentFromCoach();

  const assignedIds = new Set((students ?? []).map((s) => s.student_profile_id));

  const handleAdd = async (profileId: string) => {
    await assign.mutateAsync({ coach_id: coachId, student_profile_id: profileId });
    setSearch("");
  };

  return (
    <div className="space-y-3 rounded-md border bg-muted/20 p-3">
      <div className="text-xs font-medium text-muted-foreground">
        Students assigned to <span className="text-foreground">{coachLabel}</span>
      </div>

      {/* Current roster */}
      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : !students || students.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">No students assigned yet.</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {students.map((s) => (
            <div
              key={s.id}
              className="flex items-center gap-1.5 rounded-full bg-background border px-2.5 py-1 text-xs"
            >
              <span className="font-medium">{s.student?.display_name || s.student?.email || "Student"}</span>
              {!s.student?.user_id && (
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">walk-in</span>
              )}
              <button
                type="button"
                onClick={() => unassign.mutate(s.id)}
                className="text-muted-foreground hover:text-destructive"
                aria-label="Remove"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add new */}
      <div className="space-y-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search a student to add (name or email)…"
            className="pl-8 h-8 text-sm"
          />
        </div>
        {search.length >= 2 && (
          <Card className="max-h-44 overflow-y-auto p-1">
            {isFetching && !searchResults ? (
              <div className="p-2 text-xs text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-3 w-3 animate-spin" /> Searching…
              </div>
            ) : (searchResults ?? []).length === 0 ? (
              <div className="p-2 text-xs text-muted-foreground">No matches.</div>
            ) : (
              (searchResults ?? []).map((p) => {
                const already = assignedIds.has(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    disabled={already || assign.isPending}
                    onClick={() => handleAdd(p.id)}
                    className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm hover:bg-muted disabled:opacity-50"
                  >
                    <div className="min-w-0">
                      <div className="font-medium truncate">{p.display_name || "—"}</div>
                      <div className="text-[11px] text-muted-foreground truncate">
                        {p.email || "no email"} {!p.is_registered && "· walk-in"}
                      </div>
                    </div>
                    {already ? (
                      <span className="text-[10px] text-muted-foreground">Assigned</span>
                    ) : (
                      <UserPlus className="h-3.5 w-3.5 text-primary" />
                    )}
                  </button>
                );
              })
            )}
          </Card>
        )}
        <p className="text-[11px] text-muted-foreground">
          A student can be assigned to <strong>one coach</strong>. Adding to a new coach moves them automatically.
        </p>
      </div>
    </div>
  );
}
