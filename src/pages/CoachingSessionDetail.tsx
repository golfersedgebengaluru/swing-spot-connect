import { useNavigate, useParams, Link } from "react-router-dom";
import { Navbar } from "@/components/layout/Navbar";
import { useSession } from "@/hooks/useCoaching";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Calendar, User } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ExternalToolLinks } from "@/components/coaching/ExternalToolLinks";

export default function CoachingSessionDetail() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const { data: session, isLoading } = useSession(sessionId);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto px-4 py-6 md:py-10 max-w-3xl">
        <Button variant="ghost" size="sm" asChild className="mb-4 -ml-2">
          <Link to="/coaching"><ArrowLeft className="mr-1 h-4 w-4" />Back</Link>
        </Button>

        {isLoading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : !session ? (
          <Card className="p-8 text-center">
            <p className="font-medium">Session not found</p>
          </Card>
        ) : (
          <div className="space-y-4">
            <Card className="p-5">
              <div className="flex items-center gap-2 text-base font-medium">
                <Calendar className="h-4 w-4 text-primary" />
                {format(parseISO(session.session_date), "EEEE, MMMM d, yyyy")}
              </div>
              <div className="mt-1.5 flex items-center gap-2 text-sm text-muted-foreground">
                <User className="h-3.5 w-3.5" />
                Coach: <span className="text-foreground">
                  {session.coach_profile?.display_name || session.coach_profile?.email || "—"}
                </span>
              </div>
            </Card>

            {((session.onform_links?.length ?? 0) > 0 ||
              (session.sportsbox_links?.length ?? 0) > 0 ||
              (session.superspeed_links?.length ?? 0) > 0 ||
              (session.other_links?.length ?? 0) > 0 ||
              session.onform_url || session.sportsbox_url || session.superspeed_url || session.other_url) && (
              <Card className="p-5">
                <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-3">Tools</h2>
                <ExternalToolLinks
                  onformLinks={session.onform_links}
                  sportsboxLinks={session.sportsbox_links}
                  superspeedLinks={session.superspeed_links}
                  otherLinks={session.other_links}
                  onform={session.onform_url}
                  sportsbox={session.sportsbox_url}
                  superspeed={session.superspeed_url}
                  other={session.other_url}
                  otherLabel={session.other_label}
                  size="default"
                />
              </Card>
            )}

            {session.progress_summary && (
              <Card className="p-5">
                <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-2">Progress Summary</h2>
                <p className="text-sm whitespace-pre-wrap">{session.progress_summary}</p>
              </Card>
            )}
            {session.notes && (
              <Card className="p-5">
                <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-2">Notes</h2>
                <p className="text-sm whitespace-pre-wrap">{session.notes}</p>
              </Card>
            )}
            {session.drills && (
              <Card className="p-5">
                <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-2">Drills</h2>
                <p className="text-sm whitespace-pre-wrap">{session.drills}</p>
              </Card>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
