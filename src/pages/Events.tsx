import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar, Clock, Users, MapPin, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";

const events = [
  {
    id: 1,
    title: "Weekend Championship",
    description: "Compete for the monthly championship title and exclusive prizes.",
    date: "December 7, 2024",
    time: "10:00 AM - 4:00 PM",
    location: "All Bays",
    spotsTotal: 32,
    spotsTaken: 28,
    type: "tournament",
    prize: "$500 Gift Card",
  },
  {
    id: 2,
    title: "Beginners Golf Clinic",
    description: "Learn the fundamentals from our PGA-certified instructors.",
    date: "December 10, 2024",
    time: "6:00 PM - 8:00 PM",
    location: "Bay 1-3",
    spotsTotal: 12,
    spotsTaken: 8,
    type: "clinic",
    price: "Free for members",
  },
  {
    id: 3,
    title: "Holiday Cup Tournament",
    description: "End the year with our biggest tournament featuring special prizes.",
    date: "December 21, 2024",
    time: "9:00 AM - 6:00 PM",
    location: "All Bays",
    spotsTotal: 64,
    spotsTaken: 42,
    type: "tournament",
    prize: "$1,000 Grand Prize",
  },
  {
    id: 4,
    title: "Social Mixer Night",
    description: "Network with fellow golf enthusiasts over drinks and casual rounds.",
    date: "December 14, 2024",
    time: "7:00 PM - 10:00 PM",
    location: "Lounge & Bay 5-6",
    spotsTotal: 40,
    spotsTaken: 22,
    type: "social",
    price: "Drinks included",
  },
  {
    id: 5,
    title: "Swing Analysis Workshop",
    description: "Get your swing analyzed with TrackMan technology and expert feedback.",
    date: "December 17, 2024",
    time: "5:00 PM - 7:00 PM",
    location: "Bay 2",
    spotsTotal: 8,
    spotsTaken: 6,
    type: "clinic",
    price: "500 points or $25",
  },
];

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

export default function Events() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Navbar isAuthenticated={true} />
      
      <main className="flex-1 py-8">
        <div className="container mx-auto px-4">
          {/* Header */}
          <div className="mb-8">
            <h1 className="font-display text-3xl font-bold text-foreground">
              Events & Tournaments
            </h1>
            <p className="mt-1 text-muted-foreground">
              Join competitions, clinics, and social events
            </p>
          </div>

          {/* Tabs */}
          <Tabs defaultValue="upcoming" className="space-y-6">
            <TabsList>
              <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
              <TabsTrigger value="tournaments">Tournaments</TabsTrigger>
              <TabsTrigger value="clinics">Clinics</TabsTrigger>
              <TabsTrigger value="social">Social</TabsTrigger>
            </TabsList>

            <TabsContent value="upcoming" className="space-y-4">
              {events.map((event) => (
                <Card key={event.id} className="overflow-hidden shadow-elegant transition-all hover:shadow-lg">
                  <CardContent className="p-0">
                    <div className="flex flex-col lg:flex-row">
                      {/* Date Badge */}
                      <div className="flex flex-shrink-0 items-center justify-center bg-primary p-6 lg:w-32">
                        <div className="text-center text-primary-foreground">
                          <p className="text-sm font-medium opacity-80">
                            {event.date.split(" ")[0]}
                          </p>
                          <p className="font-display text-3xl font-bold">
                            {event.date.split(" ")[1].replace(",", "")}
                          </p>
                        </div>
                      </div>

                      {/* Content */}
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

                          <h3 className="font-display text-xl font-semibold text-foreground">
                            {event.title}
                          </h3>
                          <p className="mt-1 text-muted-foreground">{event.description}</p>

                          <div className="mt-4 flex flex-wrap gap-4 text-sm text-muted-foreground">
                            <div className="flex items-center gap-1">
                              <Clock className="h-4 w-4" />
                              {event.time}
                            </div>
                            <div className="flex items-center gap-1">
                              <MapPin className="h-4 w-4" />
                              {event.location}
                            </div>
                            <div className="flex items-center gap-1">
                              <Users className="h-4 w-4" />
                              {event.spotsTaken}/{event.spotsTotal} registered
                            </div>
                          </div>
                        </div>

                        <div className="mt-4 flex items-center justify-between">
                          <div>
                            {/* Progress bar for spots */}
                            <div className="h-2 w-32 overflow-hidden rounded-full bg-muted">
                              <div 
                                className="h-full bg-primary transition-all"
                                style={{ width: `${(event.spotsTaken / event.spotsTotal) * 100}%` }}
                              />
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {event.spotsTotal - event.spotsTaken} spots remaining
                            </p>
                          </div>
                          <Button>Register Now</Button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </TabsContent>

            <TabsContent value="tournaments">
              <div className="space-y-4">
                {events.filter(e => e.type === "tournament").map((event) => (
                  <Card key={event.id} className="p-6 shadow-elegant">
                    <h3 className="font-display text-xl font-semibold">{event.title}</h3>
                    <p className="mt-1 text-muted-foreground">{event.description}</p>
                    <div className="mt-4 flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">{event.date}</span>
                    </div>
                    <Button className="mt-4">View Details</Button>
                  </Card>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="clinics">
              <div className="space-y-4">
                {events.filter(e => e.type === "clinic").map((event) => (
                  <Card key={event.id} className="p-6 shadow-elegant">
                    <h3 className="font-display text-xl font-semibold">{event.title}</h3>
                    <p className="mt-1 text-muted-foreground">{event.description}</p>
                    <div className="mt-4 flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">{event.date}</span>
                    </div>
                    <Button className="mt-4">Sign Up</Button>
                  </Card>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="social">
              <div className="space-y-4">
                {events.filter(e => e.type === "social").map((event) => (
                  <Card key={event.id} className="p-6 shadow-elegant">
                    <h3 className="font-display text-xl font-semibold">{event.title}</h3>
                    <p className="mt-1 text-muted-foreground">{event.description}</p>
                    <div className="mt-4 flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">{event.date}</span>
                    </div>
                    <Button className="mt-4">RSVP</Button>
                  </Card>
                ))}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </main>

      <Footer />
    </div>
  );
}
