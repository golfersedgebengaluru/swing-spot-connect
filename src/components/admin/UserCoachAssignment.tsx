import { useState } from "react";
import { Loader2, GraduationCap, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  useCoaches,
  useStudentCoach,
  useAssignStudentToCoach,
  useUnassignStudentFromCoach,
} from "@/hooks/useCoaching";

interface Props {
  studentProfileId: string;
  studentLabel: string;
}

export function UserCoachAssignment({ studentProfileId, studentLabel }: Props) {
  const { data: assignment, isLoading } = useStudentCoach(studentProfileId);
  const { data: coaches } = useCoaches();
  const assign = useAssignStudentToCoach();
  const unassign = useUnassignStudentFromCoach();
  const [picked, setPicked] = useState("");

  const activeCoaches = (coaches ?? []).filter((c) => c.is_active);

  const handleAssign = async () => {
    if (!picked) return;
    await assign.mutateAsync({ coach_id: picked, student_profile_id: studentProfileId });
    setPicked("");
  };

  if (isLoading) {
    return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <GraduationCap className="h-4 w-4 text-muted-foreground" />
        <h4 className="text-sm font-medium">Coaching</h4>
      </div>

      {assignment ? (
        <Card className="p-3 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-xs text-muted-foreground">Assigned coach</div>
            <div className="font-medium truncate">
              {assignment.coach_profile?.display_name || assignment.coach_profile?.email || "Coach"}
              {assignment.coach?.city && (
                <span className="ml-2 text-xs text-muted-foreground">· {assignment.coach.city}</span>
              )}
            </div>
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive"
            onClick={() => unassign.mutate(assignment.id)}
            title="Remove coach"
          >
            <X className="h-4 w-4" />
          </Button>
        </Card>
      ) : (
        <p className="text-xs text-muted-foreground">{studentLabel} has no assigned coach.</p>
      )}

      <div className="flex gap-2">
        <Select value={picked} onValueChange={setPicked}>
          <SelectTrigger className="h-9 text-sm">
            <SelectValue placeholder={assignment ? "Reassign to another coach…" : "Assign a coach…"} />
          </SelectTrigger>
          <SelectContent>
            {activeCoaches.length === 0 ? (
              <div className="px-2 py-1.5 text-xs text-muted-foreground">No active coaches.</div>
            ) : (
              activeCoaches.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.profile?.display_name || c.profile?.email || "Coach"} · {c.city}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
        <Button size="sm" onClick={handleAssign} disabled={!picked || assign.isPending}>
          {assign.isPending ? "…" : assignment ? "Reassign" : "Assign"}
        </Button>
      </div>
    </div>
  );
}
