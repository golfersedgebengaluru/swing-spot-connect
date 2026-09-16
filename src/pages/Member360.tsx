import { useMemo } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, CalendarDays, Clock, Dumbbell, Gift, Mail, MapPin, Phone, ShoppingBag, Trophy, UserRound } from "lucide-react";
import { AdminCityProvider } from "@/contexts/AdminCityContext";
import { useAdmin } from "@/hooks/useAdmin";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { HoursBalanceBadge } from "@/components/admin/HoursBalanceBadge";
import { countDistinctVisits, identityKeys, shouldShowMemberSection } from "@/lib/member-utils";

type Profile = {
  id: string;
  user_id: string | null;
  display_name: string | null;
  email: string | null;
  phone: string | null;
  preferred_city: string | null;
  points: number | null;
  created_at: string;
};

function SectionSkeleton() {
  return <Card><CardHeader><Skeleton className="h-5 w-32" /></CardHeader><CardContent className="space-y-3"><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-2/3" /><Skeleton className="h-16 w-full" /></CardContent></Card>;
}

function Field({ label, value }: { label: string; value?: string | number | null }) {
  return <div><p className="text-xs text-muted-foreground">{label}</p><p className="mt-0.5 text-sm font-medium">{value === null || value === undefined || value === "" ? "—" : value}</p></div>;
}

function dateLabel(value?: string | null) {
  return value ? new Date(value).toLocaleDateString() : "—";
}

function Member360Content() {
  const { id } = useParams();
  const { isAdmin, assignedCities, loading: adminLoading } = useAdmin();

  const profileQuery = useQuery({
    queryKey: ["member360", "profile", id],
    enabled: Boolean(id),
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, user_id, display_name, email, phone, preferred_city, points, created_at").eq("id", id ?? "").maybeSingle();
      if (error) throw error;
      return data as Profile | null;
    },
  });
  const profile = profileQuery.data;
  const keys = profile ? identityKeys(profile) : [];

  const accessQuery = useQuery({
    queryKey: ["member360", "access", id, assignedCities],
    enabled: Boolean(profile) && !adminLoading && !isAdmin,
    queryFn: async () => {
      if (!profile) return false;
      if (profile.preferred_city && assignedCities.includes(profile.preferred_city)) return true;
      if (!keys.length || !assignedCities.length) return false;
      const { count, error } = await supabase.from("bookings").select("id", { count: "exact", head: true }).in("user_id", keys).in("city", assignedCities);
      if (error) throw error;
      return Boolean(count);
    },
  });
  const allowed = isAdmin || accessQuery.data === true;
  const ready = Boolean(profile) && allowed;

  const membershipQuery = useQuery({
    queryKey: ["member360", "membership", keys], enabled: ready,
    queryFn: async () => {
      const [hoursResult, transactionsResult] = await Promise.all([
        supabase.from("member_hours").select("id, user_id, hours_purchased, hours_used, created_at").in("user_id", keys).maybeSingle(),
        supabase.from("hours_transactions").select("id, user_id, type, hours, created_at").in("user_id", keys).order("created_at", { ascending: true }),
      ]);
      if (hoursResult.error) throw hoursResult.error;
      if (transactionsResult.error) throw transactionsResult.error;
      const firstPurchase = transactionsResult.data?.find((row) => row.type === "purchase");
      return { hours: hoursResult.data, memberSince: firstPurchase?.created_at ?? hoursResult.data?.created_at ?? profile?.created_at };
    },
  });

  const bookingsQuery = useQuery({
    queryKey: ["member360", "bookings", keys], enabled: ready,
    queryFn: async () => {
      const [bookingResult, hoursResult] = await Promise.all([
        supabase.from("bookings").select("id, parent_booking_id, start_time, end_time, duration_minutes, city, session_type, status, billing_status, invoice_id").in("user_id", keys).order("start_time", { ascending: false }),
        supabase.from("hours_transactions").select("booking_id").in("user_id", keys).not("booking_id", "is", null),
      ]);
      if (bookingResult.error) throw bookingResult.error;
      if (hoursResult.error) throw hoursResult.error;
      return { bookings: bookingResult.data ?? [], paidBookingIds: new Set((hoursResult.data ?? []).map((row) => row.booking_id).filter((value): value is string => Boolean(value))) };
    },
  });

  const trainingQuery = useQuery({
    queryKey: ["member360", "training", keys], enabled: ready,
    queryFn: async () => {
      const { data: sessions, error } = await supabase.from("coaching_sessions").select("id, session_date, notes, drills, progress_summary").in("student_user_id", keys).eq("session_type", "coach_directed").order("session_date", { ascending: false });
      if (error) throw error;
      if (!sessions?.length) return [];
      const sessionIds = sessions.map((session) => session.id);
      const [focusResult, drillResult] = await Promise.all([
        supabase.from("session_focuses").select("session_id, snapshot").in("session_id", sessionIds),
        supabase.from("session_drills").select("session_id, snapshot, coach_note").in("session_id", sessionIds),
      ]);
      if (focusResult.error) throw focusResult.error;
      if (drillResult.error) throw drillResult.error;
      return sessions.map((session) => ({ ...session, focuses: (focusResult.data ?? []).filter((row) => row.session_id === session.id), libraryDrills: (drillResult.data ?? []).filter((row) => row.session_id === session.id) }));
    },
  });

  const leaguesQuery = useQuery({
    queryKey: ["member360", "leagues", keys], enabled: ready,
    queryFn: async () => {
      const { data: players, error } = await supabase.from("league_players").select("id, user_id, league_id, joined_at").in("user_id", keys);
      if (error) throw error;
      if (!players?.length) return [];
      const leagueIds = Array.from(new Set(players.map((player) => player.league_id)));
      const playerIds = players.flatMap((player) => [player.id, player.user_id].filter((value): value is string => Boolean(value)));
      const [leagueResult, scoreResult] = await Promise.all([
        supabase.from("leagues").select("id, name, status, season_start, season_end").in("id", leagueIds),
        supabase.from("league_scores").select("id, league_id, round_number, total_score, confirmed_at, player_id").in("league_id", leagueIds).in("player_id", playerIds).order("created_at", { ascending: false }),
      ]);
      if (leagueResult.error) throw leagueResult.error;
      if (scoreResult.error) throw scoreResult.error;
      return (leagueResult.data ?? []).map((league) => ({ ...league, scores: (scoreResult.data ?? []).filter((score) => score.league_id === league.id) }));
    },
  });

  const loyaltyQuery = useQuery({
    queryKey: ["member360", "loyalty", keys], enabled: ready,
    queryFn: async () => {
      const { data, error } = await supabase.from("points_transactions").select("id, type, points, description, created_at").in("user_id", keys).order("created_at", { ascending: false }).limit(8);
      if (error) throw error;
      return data ?? [];
    },
  });

  const commerceQuery = useQuery({
    queryKey: ["member360", "commerce", keys], enabled: ready,
    queryFn: async () => {
      const { data, error } = await supabase.from("orders").select("id, items, total_price, status, created_at").in("user_id", keys).order("created_at", { ascending: false }).limit(8);
      if (error) throw error;
      return data ?? [];
    },
  });

  const signals = useMemo(() => {
    const values: string[] = [];
    const hours = membershipQuery.data?.hours;
    if (hours && hours.hours_purchased - hours.hours_used <= 1) values.push("Low hours");
    if (bookingsQuery.data && !bookingsQuery.data.bookings.some((booking) => booking.status !== "cancelled" && new Date(booking.start_time).getTime() > Date.now())) values.push("No upcoming booking");
    return values;
  }, [membershipQuery.data, bookingsQuery.data]);

  if (profileQuery.isLoading || adminLoading || (!isAdmin && accessQuery.isLoading)) return <div className="mx-auto max-w-5xl space-y-4 p-4 sm:p-6"><Skeleton className="h-8 w-48" /><SectionSkeleton /><SectionSkeleton /></div>;
  if (!profile) return <Navigate to="/admin?tab=allusers" replace />;
  if (!allowed) return <div className="mx-auto max-w-xl p-6"><Card><CardContent className="p-6 text-center"><h1 className="font-display text-2xl">Access denied</h1><p className="mt-2 text-muted-foreground">This member is outside your assigned location.</p><Link className="mt-4 inline-flex min-h-11 items-center text-primary" to="/admin?tab=allusers">Back to All Users</Link></CardContent></Card></div>;

  const hours = membershipQuery.data?.hours;
  const remaining = hours ? hours.hours_purchased - hours.hours_used : 0;
  const bookings = bookingsQuery.data?.bookings ?? [];
  const now = Date.now();
  const past = bookings.filter((booking) => booking.status === "confirmed" && new Date(booking.start_time).getTime() <= now);
  const future = bookings.filter((booking) => booking.status !== "cancelled" && new Date(booking.start_time).getTime() > now).sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
  const visits = bookingsQuery.data ? countDistinctVisits(bookings, bookingsQuery.data.paidBookingIds) : 0;
  const firstVisit = past.length ? past[past.length - 1].start_time : null;
  const monthsActive = firstVisit ? Math.max(1, (now - new Date(firstVisit).getTime()) / 2_629_746_000) : 0;

  return (
    <main className="min-h-screen bg-muted/40">
      <div className="mx-auto max-w-5xl space-y-4 p-4 sm:p-6">
        <Link to="/admin?tab=allusers&filter=member" className="inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" />Back to Members</Link>
        <div><h1 className="font-display text-2xl font-semibold sm:text-3xl">{profile.display_name || "Member360"}</h1><p className="text-sm text-muted-foreground">Member360</p></div>
        {signals.length > 0 && <div className="flex flex-wrap gap-2" aria-label="Member signals">{signals.map((signal) => <Badge key={signal} variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300">{signal}</Badge>)}</div>}

        <Card><CardHeader><CardTitle className="flex items-center gap-2 text-lg"><UserRound className="h-5 w-5" />Profile</CardTitle></CardHeader><CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"><Field label="Name" value={profile.display_name} /><Field label="Email" value={profile.email} /><Field label="Phone" value={profile.phone} /><Field label="City" value={profile.preferred_city} /><Field label="Member since" value={dateLabel(membershipQuery.data?.memberSince)} /></CardContent></Card>

        {membershipQuery.isLoading ? <SectionSkeleton /> : hours && <Card><CardHeader><CardTitle className="flex items-center gap-2 text-lg"><Clock className="h-5 w-5" />Membership</CardTitle></CardHeader><CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-4"><Field label="Plan" value="Hours package" /><Field label="Status" value={remaining > 0 ? "Active" : "Depleted"} /><Field label="Purchased" value={`${hours.hours_purchased} hrs`} /><Field label="Used" value={`${hours.hours_used} hrs`} /><div><p className="text-xs text-muted-foreground">Remaining</p><HoursBalanceBadge remaining={remaining} className="mt-1" /></div></CardContent></Card>}

        {bookingsQuery.isLoading ? <SectionSkeleton /> : <Card><CardHeader><CardTitle className="flex items-center justify-between gap-2 text-lg"><span className="flex items-center gap-2"><CalendarDays className="h-5 w-5" />Bookings</span><Link className="text-sm font-normal text-primary" to={`/admin?tab=bookinglogs&user=${profile.user_id ?? profile.id}`}>View history</Link></CardTitle></CardHeader><CardContent className="space-y-4"><div className="grid grid-cols-2 gap-4"><Field label="Last visit" value={dateLabel(past[0]?.start_time)} /><Field label="Next booking" value={dateLabel(future[0]?.start_time)} /></div>{bookings.length > 0 ? <div className="space-y-2">{bookings.slice(0, 5).map((booking) => <div key={booking.id} className="flex items-center justify-between gap-3 border-t pt-2 text-sm"><span>{new Date(booking.start_time).toLocaleString()}</span><span className="capitalize text-muted-foreground">{booking.session_type} · {booking.status}</span></div>)}</div> : <p className="text-sm text-muted-foreground">No bookings on file.</p>}</CardContent></Card>}

        {trainingQuery.isLoading ? <SectionSkeleton /> : shouldShowMemberSection(trainingQuery.data) && <Card><CardHeader><CardTitle className="flex items-center gap-2 text-lg"><Dumbbell className="h-5 w-5" />Coaching History</CardTitle></CardHeader><CardContent className="space-y-4"><div className="grid gap-4 sm:grid-cols-2"><Field label="Current focus" value={(trainingQuery.data?.[0]?.focuses?.[0]?.snapshot as { name?: string } | undefined)?.name ?? trainingQuery.data?.[0]?.progress_summary} /><Field label="Latest session" value={dateLabel(trainingQuery.data?.[0]?.session_date)} /></div><div>{trainingQuery.data?.slice(0, 3).map((session) => <Link key={session.id} to={`/training/${session.id}`} className="block border-t py-3 text-sm hover:text-primary"><span>{dateLabel(session.session_date)}</span><span className="ml-2 text-muted-foreground">{session.drills || (session.libraryDrills[0]?.snapshot as { name?: string } | undefined)?.name || "Session notes"}</span></Link>)}</div></CardContent></Card>}

        {leaguesQuery.isLoading ? <SectionSkeleton /> : shouldShowMemberSection(leaguesQuery.data) && <Card><CardHeader><CardTitle className="flex items-center gap-2 text-lg"><Trophy className="h-5 w-5" />Leagues</CardTitle></CardHeader><CardContent className="space-y-2">{leaguesQuery.data?.map((league) => <Link key={league.id} to={`/leagues/${league.id}`} className="flex min-h-11 items-center justify-between border-t py-2 text-sm first:border-0"><span>{league.name}</span><span className="capitalize text-muted-foreground">{league.status}{league.scores[0]?.total_score !== null && league.scores[0]?.total_score !== undefined ? ` · ${league.scores[0].total_score}` : ""}</span></Link>)}</CardContent></Card>}

        {loyaltyQuery.isLoading ? <SectionSkeleton /> : shouldShowMemberSection(loyaltyQuery.data) && <Card><CardHeader><CardTitle className="flex items-center gap-2 text-lg"><Gift className="h-5 w-5" />Loyalty</CardTitle></CardHeader><CardContent className="space-y-3"><Field label="Points balance" value={profile.points ?? 0} />{loyaltyQuery.data?.slice(0, 5).map((transaction) => <div key={transaction.id} className="flex justify-between border-t pt-2 text-sm"><span>{transaction.description || transaction.type}</span><span>{transaction.points}</span></div>)}</CardContent></Card>}

        {commerceQuery.isLoading ? <SectionSkeleton /> : shouldShowMemberSection(commerceQuery.data) && <Card><CardHeader><CardTitle className="flex items-center gap-2 text-lg"><ShoppingBag className="h-5 w-5" />Commerce</CardTitle></CardHeader><CardContent className="space-y-3"><Field label="Total spend" value={(commerceQuery.data ?? []).reduce((sum, order) => sum + Number(order.total_price), 0).toFixed(2)} />{commerceQuery.data?.slice(0, 5).map((order) => <div key={order.id} className="flex justify-between border-t pt-2 text-sm"><span>{dateLabel(order.created_at)} · <span className="capitalize">{order.status}</span></span><span>{Number(order.total_price).toFixed(2)}</span></div>)}</CardContent></Card>}

        {bookingsQuery.isLoading ? <SectionSkeleton /> : <Card><CardHeader><CardTitle className="flex items-center gap-2 text-lg"><MapPin className="h-5 w-5" />Engagement</CardTitle></CardHeader><CardContent className="grid grid-cols-2 gap-4"><Field label="Total visits" value={visits} /><Field label="Visit frequency" value={visits && monthsActive ? `${(visits / monthsActive).toFixed(1)} per month` : "—"} /></CardContent></Card>}
      </div>
    </main>
  );
}

export default function Member360() {
  return <AdminCityProvider><Member360Content /></AdminCityProvider>;
}