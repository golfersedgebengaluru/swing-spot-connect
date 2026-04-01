import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Loader2, MinusCircle, PlusCircle, History, Star, Award, UserCheck, ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useRewards } from "@/hooks/useRewards";
import { useAllocatePoints, useRedeemPoints, usePointsTransactions } from "@/hooks/usePoints";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useAdmin } from "@/hooks/useAdmin";
import { useAdminCity } from "@/contexts/AdminCityContext";

function PointsTransactionHistory({ userId }: { userId: string }) {
  const { data: transactions, isLoading } = usePointsTransactions(userId);
  if (isLoading) return <Loader2 className="mx-auto h-6 w-6 animate-spin" />;
  if (!transactions?.length) return <p className="text-sm text-muted-foreground">No points transactions yet.</p>;
  return (
    <div className="space-y-2 max-h-60 overflow-y-auto">
      {transactions.map((t: any) => (
        <div key={t.id} className="flex items-center justify-between rounded-md border p-2 text-sm">
          <div className="flex items-center gap-2">
            {t.type === "redemption" ? <MinusCircle className="h-4 w-4 text-destructive" /> : <PlusCircle className="h-4 w-4 text-primary" />}
            <span className="capitalize">{t.type}</span>
            {t.description && <span className="text-muted-foreground">— {t.description}</span>}
          </div>
          <div className="flex items-center gap-3">
            <span className={t.type === "redemption" ? "text-destructive" : "text-primary"}>
              {t.type === "redemption" ? "-" : "+"}{t.points} pts
            </span>
            <span className="text-xs text-muted-foreground">{new Date(t.created_at).toLocaleDateString()}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function AllocatePointsForm({ profiles, onSave, onCancel }: { profiles: any[]; onSave: (data: { user_id: string; points: number; description: string }) => void; onCancel: () => void }) {
  const [form, setForm] = useState({ user_id: "", points: 0, description: "" });
  const activeProfiles = profiles.filter((p: any) => p.user_id);
  return (
    <div className="space-y-4">
      <div>
        <Label>Member</Label>
        <Select value={form.user_id} onValueChange={(v) => setForm({ ...form, user_id: v })}>
          <SelectTrigger><SelectValue placeholder="Select a member" /></SelectTrigger>
          <SelectContent>
            {activeProfiles.map((p: any) => (
              <SelectItem key={p.user_id} value={p.user_id}>{p.display_name || p.email}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div><Label>Points</Label><Input type="number" min="1" value={form.points} onChange={(e) => setForm({ ...form, points: Number(e.target.value) })} /></div>
      <div><Label>Reason</Label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="e.g. Welcome bonus, event participation" /></div>
      <div className="flex gap-2 justify-end">
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button onClick={() => onSave(form)} disabled={!form.user_id || form.points <= 0}>Allocate Points</Button>
      </div>
    </div>
  );
}

function AdminRedeemForm({ profiles, rewards, onSave, onCancel }: { profiles: any[]; rewards: any[]; onSave: (data: { user_id: string; reward_id: string; reward_name: string; points: number }) => void; onCancel: () => void }) {
  const [userId, setUserId] = useState("");
  const [rewardId, setRewardId] = useState("");
  const activeProfiles = profiles.filter((p: any) => p.user_id);
  const selectedReward = (rewards ?? []).find((r: any) => r.id === rewardId);
  const selectedProfile = activeProfiles.find((p: any) => p.user_id === userId);
  const userPoints = selectedProfile?.points ?? 0;

  return (
    <div className="space-y-4">
      <div>
        <Label>Member</Label>
        <Select value={userId} onValueChange={setUserId}>
          <SelectTrigger><SelectValue placeholder="Select a member" /></SelectTrigger>
          <SelectContent>
            {activeProfiles.map((p: any) => (
              <SelectItem key={p.user_id} value={p.user_id}>{p.display_name || p.email} ({p.points ?? 0} pts)</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>Reward</Label>
        <Select value={rewardId} onValueChange={setRewardId}>
          <SelectTrigger><SelectValue placeholder="Select a reward" /></SelectTrigger>
          <SelectContent>
            {(rewards ?? []).filter((r: any) => r.is_available).map((r: any) => (
              <SelectItem key={r.id} value={r.id}>{r.name} ({r.points_cost} pts)</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {selectedReward && userId && (
        <div className="rounded-lg bg-muted p-3 text-sm">
          <p>User balance: <span className="font-medium">{userPoints} pts</span></p>
          <p>Reward cost: <span className="font-medium">{selectedReward.points_cost} pts</span></p>
          {userPoints < selectedReward.points_cost && <p className="text-destructive font-medium mt-1">Insufficient points!</p>}
        </div>
      )}
      <div className="flex gap-2 justify-end">
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button onClick={() => onSave({ user_id: userId, reward_id: rewardId, reward_name: selectedReward?.name ?? "", points: selectedReward?.points_cost ?? 0 })} disabled={!userId || !rewardId || userPoints < (selectedReward?.points_cost ?? 0)}>Redeem</Button>
      </div>
    </div>
  );
}

function PreRegisterUserForm({ onSave, onCancel }: { onSave: (data: { display_name: string; email: string }) => void; onCancel: () => void }) {
  const [form, setForm] = useState({ display_name: "", email: "" });
  return (
    <div className="space-y-4">
      <div><Label>Display Name</Label><Input value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} placeholder="John Smith" /></div>
      <div><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="john@example.com" /></div>
      <p className="text-xs text-muted-foreground">This user will be automatically linked when they sign in with Google or Apple using this email.</p>
      <div className="flex gap-2 justify-end">
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button onClick={() => onSave(form)} disabled={!form.display_name || !form.email}>Add User</Button>
      </div>
    </div>
  );
}

function RegisterUserForm({ onSave, onCancel }: { onSave: (data: { display_name: string; email: string; phone: string }) => void; onCancel: () => void }) {
  const [form, setForm] = useState({ display_name: "", email: "", phone: "" });
  return (
    <div className="space-y-4">
      <div><Label>Display Name <span className="text-destructive">*</span></Label><Input value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} placeholder="John Smith" /></div>
      <div><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="john@example.com" /></div>
      <div><Label>Phone</Label><Input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+91 98765 43210" /></div>
      <p className="text-xs text-muted-foreground">Email and phone are optional. If an email is provided, the user will be linked when they sign in with that email.</p>
      <div className="flex gap-2 justify-end">
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button onClick={() => onSave(form)} disabled={!form.display_name.trim()}>Register User</Button>
      </div>
    </div>
  );
}

export function AdminAllUsersTab() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: rewards } = useRewards();
  const allocatePoints = useAllocatePoints();
  const redeemPoints = useRedeemPoints();
  const [dialogOpen, setDialogOpen] = useState<string | null>(null);
  const [viewingPointsHistory, setViewingPointsHistory] = useState<string | null>(null);
  const [allProfiles, setAllProfiles] = useState<any[]>([]);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;
  const { isAdmin, assignedCities } = useAdmin();
  const { selectedCity } = useAdminCity();

  const USER_TYPES = [
    { value: "member", label: "Member" },
    { value: "registered", label: "Registered" },
    { value: "non-registered", label: "Guest" },
    { value: "birdie", label: "Birdie Member" },
    { value: "coaching", label: "Coaching Member" },
  ];

  const { data: allUsers, isLoading } = useQuery({
    queryKey: ["admin_all_users", isAdmin, assignedCities, selectedCity],
    queryFn: async () => {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, user_id, display_name, email, points, created_at, user_type, preferred_city")
        .order("created_at", { ascending: false });
      const { data: hours } = await supabase.from("member_hours").select("*");
      const hoursMap = new Map((hours ?? []).map((h: any) => [h.user_id, h]));

      let filtered = profiles ?? [];

      // For site_admins, scope by assigned cities
      if (!isAdmin) {
        const citiesToFilter = selectedCity ? [selectedCity] : assignedCities;
        if (citiesToFilter.length > 0) {
          // Also fetch bookings to find users who booked in these cities
          const { data: cityBookings } = await supabase
            .from("bookings")
            .select("user_id, city")
            .in("city", citiesToFilter);
          const bookingUserIds = new Set((cityBookings ?? []).map((b: any) => b.user_id));

          filtered = filtered.filter((p: any) =>
            (p.preferred_city && citiesToFilter.includes(p.preferred_city)) ||
            (p.user_id && bookingUserIds.has(p.user_id))
          );
        }
      } else if (selectedCity) {
        // Admin with city filter selected — include users with matching preferred_city,
        // bookings in that city, OR no preferred_city (newly registered/unassigned)
        const { data: cityBookings } = await supabase
          .from("bookings")
          .select("user_id, city")
          .eq("city", selectedCity);
        const bookingUserIds = new Set((cityBookings ?? []).map((b: any) => b.user_id));

        filtered = filtered.filter((p: any) =>
          p.preferred_city === selectedCity ||
          !p.preferred_city ||
          (p.user_id && bookingUserIds.has(p.user_id))
        );
      }

      return filtered.map((p: any) => ({
        ...p,
        hours_purchased: hoursMap.get(p.user_id)?.hours_purchased ?? 0,
        hours_used: hoursMap.get(p.user_id)?.hours_used ?? 0,
        hours_remaining: (hoursMap.get(p.user_id)?.hours_purchased ?? 0) - (hoursMap.get(p.user_id)?.hours_used ?? 0),
      }));
    },
  });

  const handleChangeUserType = async (profileId: string, newType: string) => {
    const { error } = await supabase.from("profiles").update({ user_type: newType }).eq("id", profileId);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Membership updated" });
      queryClient.invalidateQueries({ queryKey: ["admin_all_users"] });
    }
  };

  const loadProfiles = async () => {
    const { data } = await supabase.from("profiles").select("user_id, display_name, email, points, preferred_city");
    let filtered = data ?? [];

    // Scope profiles for site_admins
    if (!isAdmin) {
      const citiesToFilter = selectedCity ? [selectedCity] : assignedCities;
      if (citiesToFilter.length > 0) {
        const { data: cityBookings } = await supabase
          .from("bookings")
          .select("user_id, city")
          .in("city", citiesToFilter);
        const bookingUserIds = new Set((cityBookings ?? []).map((b: any) => b.user_id));

        filtered = filtered.filter((p: any) =>
          (p.preferred_city && citiesToFilter.includes(p.preferred_city)) ||
          (p.user_id && bookingUserIds.has(p.user_id))
        );
      }
    }

    setAllProfiles(filtered);
  };

  const handleAllocatePoints = async (data: { user_id: string; points: number; description: string }) => {
    try {
      await allocatePoints.mutateAsync({ userId: data.user_id, points: data.points, description: data.description, adminId: user?.id! });
      toast({ title: "Points allocated", description: `${data.points} points awarded.` });
      setDialogOpen(null);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleAdminRedeem = async (data: { user_id: string; reward_id: string; reward_name: string; points: number }) => {
    try {
      await redeemPoints.mutateAsync({ userId: data.user_id, points: data.points, rewardId: data.reward_id, rewardName: data.reward_name, adminId: user?.id! });
      toast({ title: "Reward redeemed", description: `${data.reward_name} redeemed successfully.` });
      setDialogOpen(null);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleDeleteUser = async (profileId: string, displayName: string) => {
    const { error } = await supabase.from("profiles").delete().eq("id", profileId);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "User deleted", description: `${displayName} has been removed.` });
      queryClient.invalidateQueries({ queryKey: ["admin_all_users"] });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 justify-end">
        <Dialog open={dialogOpen === "allocate"} onOpenChange={(open) => { setDialogOpen(open ? "allocate" : null); if (open) loadProfiles(); }}>
          <DialogTrigger asChild>
            <Button variant="outline"><Star className="mr-2 h-4 w-4" />Allocate Points</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader><DialogTitle>Allocate Reward Points</DialogTitle></DialogHeader>
            <AllocatePointsForm profiles={allProfiles} onSave={handleAllocatePoints} onCancel={() => setDialogOpen(null)} />
          </DialogContent>
        </Dialog>

        <Dialog open={dialogOpen === "adminredeem"} onOpenChange={(open) => { setDialogOpen(open ? "adminredeem" : null); if (open) loadProfiles(); }}>
          <DialogTrigger asChild>
            <Button variant="outline"><Award className="mr-2 h-4 w-4" />Redeem for User</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader><DialogTitle>Redeem Reward for User</DialogTitle></DialogHeader>
            <AdminRedeemForm profiles={allProfiles} rewards={rewards ?? []} onSave={handleAdminRedeem} onCancel={() => setDialogOpen(null)} />
          </DialogContent>
        </Dialog>

        <Dialog open={dialogOpen === "adduser"} onOpenChange={(open) => setDialogOpen(open ? "adduser" : null)}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" />Pre-Register User</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader><DialogTitle>Pre-Register New User</DialogTitle></DialogHeader>
            <PreRegisterUserForm onSave={async (data) => {
              const insertData: Record<string, string> = {
                display_name: data.display_name,
                email: data.email,
              };
              if (selectedCity) insertData.preferred_city = selectedCity;
              const { error } = await supabase.from("profiles").insert(insertData);
              if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
              toast({ title: "User pre-registered", description: `${data.display_name} will be linked when they sign in with ${data.email}.` });
              queryClient.invalidateQueries({ queryKey: ["admin_all_users"] });
              setDialogOpen(null);
            }} onCancel={() => setDialogOpen(null)} />
          </DialogContent>
        </Dialog>

        <Dialog open={dialogOpen === "registeruser"} onOpenChange={(open) => setDialogOpen(open ? "registeruser" : null)}>
          <DialogTrigger asChild>
            <Button variant="outline"><UserCheck className="mr-2 h-4 w-4" />Register User</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader><DialogTitle>Register New User</DialogTitle></DialogHeader>
            <RegisterUserForm onSave={async (data) => {
              const insertData: Record<string, string> = {
                display_name: data.display_name.trim(),
              };
              if (data.email.trim()) insertData.email = data.email.trim();
              if (data.phone.trim()) insertData.phone = data.phone.trim();
              if (selectedCity) insertData.preferred_city = selectedCity;
              const { error } = await supabase.from("profiles").insert(insertData);
              if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
              toast({ title: "User registered", description: `${data.display_name} has been registered.` });
              queryClient.invalidateQueries({ queryKey: ["admin_all_users"] });
              setDialogOpen(null);
            }} onCancel={() => setDialogOpen(null)} />
          </DialogContent>
        </Dialog>
      </div>

      <Dialog open={dialogOpen === "pointshistory"} onOpenChange={(open) => { setDialogOpen(open ? "pointshistory" : null); if (!open) setViewingPointsHistory(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Points History</DialogTitle></DialogHeader>
          {viewingPointsHistory && <PointsTransactionHistory userId={viewingPointsHistory} />}
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><UserCheck className="h-5 w-5" />All Users</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? <Loader2 className="mx-auto h-8 w-8 animate-spin" /> : (() => {
              const totalUsers = (allUsers ?? []).length;
              const totalPages = Math.max(1, Math.ceil(totalUsers / PAGE_SIZE));
              const safePage = Math.min(page, totalPages - 1);
              const paginated = (allUsers ?? []).slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);
              return (
            <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                   <TableHead>Name</TableHead>
                   <TableHead>Email</TableHead>
                   <TableHead>Status</TableHead>
                   <TableHead>Membership</TableHead>
                   <TableHead className="text-right">Points</TableHead>
                   <TableHead className="text-right">Hours Balance</TableHead>
                   <TableHead className="text-right">Actions</TableHead>
                 </TableRow>
               </TableHeader>
               <TableBody>
                 {totalUsers === 0 && (
                   <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">No users found.</TableCell></TableRow>
                 )}
                 {paginated.map((u: any) => (
                   <TableRow key={u.id || u.user_id}>
                     <TableCell className="font-medium">{u.display_name || "Unknown"}</TableCell>
                     <TableCell className="text-sm text-muted-foreground">{u.email || "—"}</TableCell>
                     <TableCell>
                        <Badge variant={u.user_id || u.user_type === 'non-registered' || (!u.user_id && !u.email) ? "secondary" : "outline"}>
                          {u.user_id ? "Active" : (u.email && u.user_type !== 'non-registered' ? "Pending" : "Active")}
                        </Badge>
                      </TableCell>
                     <TableCell>
                       <Select value={u.user_type || "registered"} onValueChange={(v) => handleChangeUserType(u.id, v)}>
                         <SelectTrigger className="w-[150px] h-8 text-xs">
                           <SelectValue />
                         </SelectTrigger>
                         <SelectContent>
                           {USER_TYPES.map((t) => (
                             <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                           ))}
                         </SelectContent>
                       </Select>
                     </TableCell>
                     <TableCell className="text-right">
                       <Badge variant="default">{u.points ?? 0}</Badge>
                     </TableCell>
                     <TableCell className="text-right">
                        <Badge variant={u.hours_remaining <= 3 ? "destructive" : "secondary"}>
                          {u.hours_remaining}
                        </Badge>
                     </TableCell>
                      <TableCell className="text-right flex items-center justify-end gap-1">
                        {u.user_id && (
                          <Button variant="ghost" size="icon" onClick={() => { setViewingPointsHistory(u.user_id); setDialogOpen("pointshistory"); }}>
                            <History className="h-4 w-4" />
                          </Button>
                        )}
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete User</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to delete <strong>{u.display_name || "this user"}</strong>? This action cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDeleteUser(u.id, u.display_name || "User")} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </TableCell>
                   </TableRow>
                 ))}
              </TableBody>
            </Table>
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-3 px-1">
                <p className="text-xs text-muted-foreground">
                  {safePage * PAGE_SIZE + 1}–{Math.min((safePage + 1) * PAGE_SIZE, totalUsers)} of {totalUsers}
                </p>
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="icon" className="h-7 w-7" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-xs px-2">{safePage + 1} / {totalPages}</span>
                  <Button variant="outline" size="icon" className="h-7 w-7" disabled={safePage >= totalPages - 1} onClick={() => setPage(safePage + 1)}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
            </div>
          );})()}
        </CardContent>
      </Card>
    </div>
  );
}
