import { Card } from "@/components/ui/card";
import { Calendar, User } from "lucide-react";
import { format, parseISO } from "date-fns";
import type { CoachingSession } from "@/hooks/useCoaching";
import { ExternalToolLinks } from "./ExternalToolLinks";

interface Props {
  session: CoachingSession;
  perspective: "student" | "coach" | "admin";
  onClick?: () => void;
}

export function SessionCard({ session, perspective, onClick }: Props) {
  const otherParty =
    perspective === "student"
      ? session.coach_profile?.display_name || session.coach_profile?.email || "Coach"
      : session.student_profile?.display_name || session.student_profile?.email || "Student";
  const otherLabel = perspective === "student" ? "Coach" : "Student";

  return (
    <Card
      onClick={onClick}
      className={`p-4 transition-all ${onClick ? "cursor-pointer hover:shadow-md hover:border-primary/30" : ""}`}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
            <Calendar className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            {format(parseISO(session.session_date), "EEE, MMM d, yyyy")}
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            <User className="h-3 w-3 shrink-0" />
            <span className="truncate">
              {otherLabel}: <span className="text-foreground">{otherParty}</span>
            </span>
          </div>
        </div>
      </div>

      {session.progress_summary && (
        <p className="text-sm text-muted-foreground line-clamp-2 mb-3">{session.progress_summary}</p>
      )}

      <ExternalToolLinks
        onform={session.onform_url}
        sportsbox={session.sportsbox_url}
        superspeed={session.superspeed_url}
        other={session.other_url}
        otherLabel={session.other_label}
      />
    </Card>
  );
}
