import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Dumbbell, GraduationCap, Loader2, Plus } from "lucide-react";
import { Navbar } from "@/components/layout/Navbar";
import { SessionCard } from "@/components/coaching/SessionCard";
import { CoachView } from "@/components/coaching/CoachView";
import { SelfDirectedTrainingDialog } from "@/components/coaching/SelfDirectedTrainingDialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/AuthContext";
import { useAdmin } from "@/hooks/useAdmin";
import { useMySelfDirectedSessions, useMyStudentSessions, type CoachingSession } from "@/hooks/useCoaching";

function SessionList({ sessions, isLoading, emptyTitle, emptyMessage }: { sessions?: CoachingSession[]; isLoading: boolean; emptyTitle: string; emptyMessage: string }) {
  const navigate = useNavigate();
  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!sessions?.length) return (
    <Card className="p-8 text-center">
      <GraduationCap className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
      <p className="font-medium">{emptyTitle}</p>
      <p className="mt-1 text-sm text-muted-foreground">{emptyMessage}</p>
    </Card>
  );
  return (
    <div className="grid gap-3">
      {sessions.map((session) => (
        <SessionCard key={session.id} session={session} perspective={session.session_type === "self_directed" ? "self" : "student"} onClick={() => navigate(`/training/${session.id}`)} />
      ))}
    </div>
  );
}

export default function Coaching() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const { isCoach, loading: adminLoading } = useAdmin();
  const { data: coachSessions, isLoading: coachLoading } = useMyStudentSessions();
  const { data: myTraining, isLoading: trainingLoading } = useMySelfDirectedSessions();
  const [startOpen, setStartOpen] = useState(false);

  if (!loading && !user) {
    navigate("/auth");
    return null;
  }

  if (loading || adminLoading) return (
    <div className="min-h-screen bg-background"><Navbar /><div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div></div>
  );

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto max-w-3xl px-4 py-6 md:py-10">
        {isCoach ? <CoachView /> : (
          <>
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <h1 className="flex items-center gap-2 text-2xl font-display font-semibold md:text-3xl"><Dumbbell className="h-7 w-7 text-primary" />Training</h1>
                <p className="mt-1 text-sm text-muted-foreground">Your practice logs and sessions recorded by your coach.</p>
              </div>
              <Button className="min-h-11 shrink-0" onClick={() => setStartOpen(true)}><Plus className="mr-1.5 h-4 w-4" />Start Training</Button>
            </div>
            <Tabs defaultValue="mine" className="space-y-4">
              <TabsList className="grid h-11 w-full grid-cols-2">
                <TabsTrigger value="mine" className="min-h-9">My Training</TabsTrigger>
                <TabsTrigger value="coach" className="min-h-9">Coach Sessions</TabsTrigger>
              </TabsList>
              <TabsContent value="mine"><SessionList sessions={myTraining} isLoading={trainingLoading} emptyTitle="No training logs yet" emptyMessage="Choose a focus and drills to complete your first training session." /></TabsContent>
              <TabsContent value="coach"><SessionList sessions={coachSessions} isLoading={coachLoading} emptyTitle="No coach sessions yet" emptyMessage="Sessions recorded by your coach will appear here." /></TabsContent>
            </Tabs>
            <SelfDirectedTrainingDialog open={startOpen} onOpenChange={setStartOpen} />
          </>
        )}
      </main>
    </div>
  );
}