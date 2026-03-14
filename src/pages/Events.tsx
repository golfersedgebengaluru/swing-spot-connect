import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar, Clock, Users, MapPin, Trophy, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEvents } from "@/hooks/useEvents";
import { format } from "date-fns";

const getTypeColor = (type: string) => {
  switch (type) {
    case "tournament":
      return "bg-accent/10 text-accent border-accent/20";
    case "clinic":
      return "bg-primary/10 text-primary border-primary/20";
    case "social":
      return "bg-purple-500/10 text-purple-600 border-purple-500/20";
    default:
      return "bg-muted text-muted-foreground";
  }
};

function EventCard({ event }: { event: any }) {
  const dateObj = new Date(event.date);
  const monthStr = format(dateObj, "MMM");
  const dayStr = format(dateObj, "d");

  return (
    <Card className="overflow-hidden shadow-elegant transition-all hover:shadow-lg">
      <CardContent className="p-0">
        <div className="flex flex-col lg:flex-row">
          <div className="flex flex-shrink-0 items-center justify-center bg-primary p-6 lg:w-32">
            <div className="text-center text-primary-foreground">
              <p className="text-sm font-medium opacity-80">{monthStr}</p>
              <p className="font-display text-3xl font-bold">{dayStr}</p>
            </div>
          </div>
          <div className="flex flex-1 flex-col justify-between p-6">
            <div>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Badge className={cn("border", getTypeColor(event.type))}>
                  {event.type.charAt(0).toUpperCase() + event.type.slice(1)}
                </Badge>
                {event.prize && (
                  <Badge variant="outline" className="border-accent/30 text-accent">
                    <Trophy className="mr-1 h-3 w-3" />
                    {event.prize}
                  </Badge>
                )}
              </div>
              <h3 className="font-display text-xl font-semibold text-foreground">{event.title}</h3>
              <p className="mt-1 text-muted-foreground">{event.description}</p>
              <div className="mt-4 flex flex-wrap gap-4 text-sm text-muted-foreground">
                {event.time_start && (
                  <div className="flex items-center gap-1">
                    <Clock className="h-4 w-4" />
                    {event.time_start}{event.time_end ? ` - ${event.time_end}` : ""}
                  </div>
                )}
                {event.location && (
                  <div className="flex items-center gap-1">
                    <MapPin className="h-4 w-4" />
                    {event.location}
                  </div>
                )}
                {event.spots_total > 0 && (
                  <div className="flex items-center gap-1">
                    <Users className="h-4 w-4" />
                    {event.spots_taken}/{event.spots_total} registered
                  </div>
                )}
              </div>
            </div>
            {event.spots_total > 0 && (
              <div className="mt-4 flex items-center justify-between">
                <div>
                  <div className="h-2 w-32 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full bg-primary transition-all"
                      style={{ width: `${(event.spots_taken / event.spots_total) * 100}%` }}
                    />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {event.spots_total - event.spots_taken} spots remaining
                  </p>
                </div>
                <Button>Register Now</Button>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Events() {
  const { data: events, isLoading } = useEvents();

  const filterByType = (type: string) => events?.filter((e) => e.type === type) ?? [];

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Navbar />
      <main className="flex-1 py-8">
        <div className="container mx-auto px-4">
          <div className="mb-8">
            <h1 className="font-display text-3xl font-bold text-foreground">Events & Tournaments</h1>
            <p className="mt-1 text-muted-foreground">Join competitions, clinics, and social events</p>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Tabs defaultValue="upcoming" className="space-y-6">
              <TabsList>
                <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
                <TabsTrigger value="tournaments">Tournaments</TabsTrigger>
                <TabsTrigger value="clinics">Clinics</TabsTrigger>
                <TabsTrigger value="social">Social</TabsTrigger>
              </TabsList>
              <TabsContent value="upcoming" className="space-y-4">
                {(events ?? []).map((event) => <EventCard key={event.id} event={event} />)}
                {events?.length === 0 && <p className="py-8 text-center text-muted-foreground">No upcoming events</p>}
              </TabsContent>
              {["tournaments", "clinics", "social"].map((tab) => {
                const type = tab === "tournaments" ? "tournament" : tab === "clinics" ? "clinic" : "social";
                return (
                  <TabsContent key={tab} value={tab} className="space-y-4">
                    {filterByType(type).map((event) => <EventCard key={event.id} event={event} />)}
                    {filterByType(type).length === 0 && <p className="py-8 text-center text-muted-foreground">No {tab} events</p>}
                  </TabsContent>
                );
              })}
            </Tabs>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
