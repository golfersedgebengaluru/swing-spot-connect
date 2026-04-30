import { useNavigate } from "react-router-dom";
import { Navbar } from "@/components/layout/Navbar";
import { useMyStudentSessions } from "@/hooks/useCoaching";
import { SessionCard } from "@/components/coaching/SessionCard";
import { Card } from "@/components/ui/card";
import { GraduationCap } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

export default function Coaching() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const { data: sessions, isLoading } = useMyStudentSessions();

  if (!loading && !user) {
    navigate("/auth");
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto px-4 py-6 md:py-10 max-w-3xl">
        <div className="mb-6">
          <h1 className="text-2xl md:text-3xl font-display font-semibold flex items-center gap-2">
            <GraduationCap className="h-7 w-7 text-primary" />
            My Coaching
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Your session history and notes from your coach.
          </p>
        </div>

        {isLoading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : !sessions || sessions.length === 0 ? (
          <Card className="p-8 text-center">
            <GraduationCap className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
            <p className="font-medium">No sessions yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Your coach will add sessions here after you train together.
            </p>
          </Card>
        ) : (
          <div className="grid gap-3">
            {sessions.map((s) => (
              <SessionCard
                key={s.id}
                session={s}
                perspective="student"
                onClick={() => navigate(`/coaching/${s.id}`)}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
