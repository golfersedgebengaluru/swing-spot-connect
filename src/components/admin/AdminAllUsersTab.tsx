import { useState } from "react";
import { Button } from "@/components/ui/button";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Plus, Loader2, MinusCircle, PlusCircle, Star, Award, UserCheck, ChevronLeft, ChevronRight, Clock, MoreHorizontal, Pencil, History, Trash2, Search } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useRewards } from "@/hooks/useRewards";
import { useAllocatePoints, useRedeemPoints, usePointsTransactions } from "@/hooks/usePoints";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useAdmin } from "@/hooks/useAdmin";
import { useAdminCity } from "@/contexts/AdminCityContext";
import { useHoursTransactions } from "@/hooks/useMemberHours";
import { sendNotificationEmail } from "@/hooks/useNotificationEmail";

// ─── Sub-components ──────────────────────────────────────────────

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

function HoursTransactionHistory({ userId }: { userId: string }) {
  const { data: transactions, isLoading } = useHoursTransactions(userId);
  if (isLoading) return <Loader2 className="mx-auto h-6 w-6 animate-spin" />;
  if (!transactions?.length) return <p className="text-sm text-muted-foreground">No hours transactions yet.</p>;
  return (
    <div className="space-y-2 max-h-60 overflow-y-auto">
      {transactions.map((t) => (
        <div key={t.id} className="flex items-center justify-between rounded-md border p-2 text-sm">
          <div className="flex items-center gap-2">
            {t.type === "deduction" ? <MinusCircle className="h-4 w-4 text-destructive" /> : <PlusCircle className="h-4 w-4 text-primary" />}
            <span className="capitalize">{t.type}</span>
            {t.note && <span className="text-muted-foreground">— {t.note}</span>}
          </div>
          <div className="flex items-center gap-3">
            <span className={t.type === "deduction" ? "text-destructive" : "text-primary"}>
              {t.type === "deduction" ? "-" : "+"}{t.hours} hrs
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
      <div><Label>Points</Label><Input type="number" min="1" value={form.points || ""} onChange={(e) => setForm({ ...form, points: Number(e.target.value) })} /></div>
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

function InlineAllocatePointsForm({ displayName, onSave, onCancel }: { displayName: string; onSave: (data: { points: number; description: string }) => void; onCancel: () => void }) {
  const [form, setForm] = useState({ points: 0, description: "" });
  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-muted p-3">
        <p className="text-sm text-muted-foreground">User: <span className="font-medium text-foreground">{displayName}</span></p>
      </div>
      <div><Label>Points</Label><Input type="number" min="1" value={form.points || ""} onChange={(e) => setForm({ ...form, points: Number(e.target.value) })} /></div>
      <div><Label>Reason</Label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="e.g. Welcome bonus" /></div>
      <div className="flex gap-2 justify-end">
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button onClick={() => onSave(form)} disabled={form.points <= 0}>Allocate Points</Button>
      </div>
    </div>
  );
}

function InlineAdjustHoursForm({ displayName, hoursRemaining, onSave, onCancel }: { displayName: string; hoursRemaining: number; onSave: (data: { type: string; hours: number; note: string }) => void; onCancel: () => void }) {
  const [form, setForm] = useState({ type: "purchase", hours: 0, note: "" });
  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-muted p-3">
        <p className="text-sm text-muted-foreground">User: <span className="font-medium text-foreground">{displayName}</span></p>
        <p className="text-sm text-muted-foreground">Hours remaining: <span className="font-medium text-foreground">{hoursRemaining} hrs</span></p>
      </div>
      <div>
        <Label>Action</Label>
        <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="purchase">Add Hours</SelectItem>
            <SelectItem value="deduction">Deduct Hours</SelectItem>
            <SelectItem value="adjustment">Adjustment</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div><Label>Hours</Label><Input type="number" step="0.5" min="0" value={form.hours || ""} onChange={(e) => setForm({ ...form, hours: Number(e.target.value) })} /></div>
      <div><Label>Note (optional)</Label><Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="e.g. Bay session 2hrs" /></div>
      <div className="flex gap-2 justify-end">
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button onClick={() => onSave(form)} disabled={form.hours <= 0}>Confirm</Button>
      </div>
    </div>
  );
}

function EditProfileForm({ profile, onSave, onCancel }: { profile: any; onSave: (data: { display_name: string; email: string; phone: string; preferred_city: string }) => void; onCancel: () => void }) {
  const [form, setForm] = useState({
    display_name: profile.display_name || "",
    email: profile.email || "",
    phone: profile.phone || "",
    preferred_city: profile.preferred_city || "",
  });
  return (
    <div className="space-y-4">
      <div><Label>Display Name</Label><Input value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} /></div>
      <div><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
      <div><Label>Phone</Label><Input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
      <div><Label>Preferred City</Label><Input value={form.preferred_city} onChange={(e) => setForm({ ...form, preferred_city: e.target.value })} /></div>
      <div className="flex gap-2 justify-end">
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button onClick={() => onSave(form)} disabled={!form.display_name.trim()}>Save</Button>
      </div>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────

function getInitials(name?: string | null) {
  if (!name) return "?";
  return name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
}

const USER_TYPES = [
  { value: "member", label: "Member" },
  { value: "registered", label: "Registered" },
  { value: "non-registered", label: "Guest" },
  { value: "birdie", label: "Birdie Member" },
  { value: "coaching", label: "Coaching Member" },
  { value: "guest", label: "Pre-registered" },
];

// ─── Main Component ──────────────────────────────────────────────

export function AdminAllUsersTab() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: rewards } = useRewards();
  const allocatePoints = useAllocatePoints();
  const redeemPoints = useRedeemPoints();
  const [dialogOpen, setDialogOpen] = useState<string | null>(null);
  const [viewingPointsHistory, setViewingPointsHistory] = useState<string | null>(null);
  const [viewingHoursHistory, setViewingHoursHistory] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [allProfiles, setAllProfiles] = useState<any[]>([]);
  const [deleteConfirm, setDeleteConfirm] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;
  const { isAdmin, assignedCities } = useAdmin();
  const { selectedCity } = useAdminCity();

  const { data: allUsers, isLoading } = useQuery({
    queryKey: ["admin_all_users", isAdmin, assignedCities, selectedCity],
    queryFn: async () => {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, user_id, display_name, email, phone, points, created_at, user_type, preferred_city")
        .order("created_at", { ascending: false });
      const { data: hours } = await supabase.from("member_hours").select("*");
      const hoursMap = new Map((hours ?? []).map((h: any) => [h.user_id, h]));

      let filtered = profiles ?? [];

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
      } else if (selectedCity) {
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

      return filtered.map((p: any) => {
        const uid = p.user_id || p.id;
        return {
          ...p,
          hours_purchased: hoursMap.get(uid)?.hours_purchased ?? 0,
          hours_used: hoursMap.get(uid)?.hours_used ?? 0,
          hours_remaining: (hoursMap.get(uid)?.hours_purchased ?? 0) - (hoursMap.get(uid)?.hours_used ?? 0),
        };
      });
    },
  });

  // ─── Filtered + paginated data ─────────────────────────────────

  const filteredUsers = (allUsers ?? []).filter((u: any) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (u.display_name?.toLowerCase().includes(q)) || (u.email?.toLowerCase().includes(q));
  });

  const totalUsers = filteredUsers.length;
  const totalPages = Math.max(1, Math.ceil(totalUsers / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const paginated = filteredUsers.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  // ─── Handlers ──────────────────────────────────────────────────

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
    if (!isAdmin) {
      const citiesToFilter = selectedCity ? [selectedCity] : assignedCities;
      if (citiesToFilter.length > 0) {
        const { data: cityBookings } = await supabase.from("bookings").select("user_id, city").in("city", citiesToFilter);
        const bookingUserIds = new Set((cityBookings ?? []).map((b: any) => b.user_id));
        filtered = filtered.filter((p: any) =>
          (p.preferred_city && citiesToFilter.includes(p.preferred_city)) || (p.user_id && bookingUserIds.has(p.user_id))
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

  const handleInlineAllocatePoints = async (userId: string, data: { points: number; description: string }) => {
    try {
      await allocatePoints.mutateAsync({ userId, points: data.points, description: data.description, adminId: user?.id! });
      toast({ title: "Points allocated", description: `${data.points} points awarded.` });
      setDialogOpen(null);
      setSelectedUser(null);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleInlineAdjustHours = async (userId: string, data: { type: string; hours: number; note: string }) => {
    try {
      const { data: existing } = await supabase
        .from("member_hours")
        .select("id, hours_purchased, hours_used")
        .eq("user_id", userId)
        .maybeSingle();

      if (existing) {
        const newPurchased = data.type === "purchase" || (data.type === "adjustment" && data.hours > 0)
          ? existing.hours_purchased + data.hours : existing.hours_purchased;
        const newUsed = data.type === "deduction" ? existing.hours_used + data.hours : existing.hours_used;
        const { error } = await supabase.from("member_hours").update({ hours_purchased: newPurchased, hours_used: newUsed }).eq("id", existing.id);
        if (error) throw error;
      } else {
        const hours_purchased = data.type === "purchase" || data.type === "adjustment" ? data.hours : 0;
        const hours_used = data.type === "deduction" ? data.hours : 0;
        const { error } = await supabase.from("member_hours").insert({ user_id: userId, hours_purchased, hours_used });
        if (error) throw error;
      }

      await supabase.from("hours_transactions").insert({
        user_id: userId, type: data.type, hours: data.hours, note: data.note || null, created_by: user?.id,
      });

      if (data.type === "deduction") {
        const remaining = existing ? existing.hours_purchased - (existing.hours_used + data.hours) : -data.hours;
        await supabase.from("notifications").insert({
          user_id: userId, title: "Hours Deducted",
          message: `${data.hours} hour(s) have been deducted. You have ${Math.max(0, remaining)} hour(s) remaining.${data.note ? ` Note: ${data.note}` : ""}`,
          type: "usage",
        });
        if (remaining <= 2 && remaining > 0) {
          sendNotificationEmail({ user_id: userId, template: "low_hours_alert", subject: "Low Hours Alert", data: { hours_remaining: remaining, purchase_url: `${window.location.origin}/dashboard` } });
        }
      }

      toast({ title: "Hours updated" });
      queryClient.invalidateQueries({ queryKey: ["admin_all_users"] });
      queryClient.invalidateQueries({ queryKey: ["member_hours"] });
      queryClient.invalidateQueries({ queryKey: ["hours_transactions", userId] });
      setDialogOpen(null);
      setSelectedUser(null);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleEditProfile = async (profileId: string, data: { display_name: string; email: string; phone: string; preferred_city: string }) => {
    const { error } = await supabase.from("profiles").update({
      display_name: data.display_name.trim() || null,
      email: data.email.trim() || null,
      phone: data.phone.trim() || null,
      preferred_city: data.preferred_city.trim() || null,
    }).eq("id", profileId);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Profile updated" });
      queryClient.invalidateQueries({ queryKey: ["admin_all_users"] });
      setDialogOpen(null);
      setSelectedUser(null);
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
    setDeleteConfirm(null);
  };

  // ─── Render ────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Top action buttons */}
      <div className="flex flex-wrap gap-2 justify-end">
        <Dialog open={dialogOpen === "allocate"} onOpenChange={(open) => { setDialogOpen(open ? "allocate" : null); if (open) loadProfiles(); }}>
          <DialogTrigger asChild><Button variant="outline" size="sm"><Star className="mr-2 h-4 w-4" />Allocate Points</Button></DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader><DialogTitle>Allocate Reward Points</DialogTitle></DialogHeader>
            <AllocatePointsForm profiles={allProfiles} onSave={handleAllocatePoints} onCancel={() => setDialogOpen(null)} />
          </DialogContent>
        </Dialog>

        <Dialog open={dialogOpen === "adminredeem"} onOpenChange={(open) => { setDialogOpen(open ? "adminredeem" : null); if (open) loadProfiles(); }}>
          <DialogTrigger asChild><Button variant="outline" size="sm"><Award className="mr-2 h-4 w-4" />Redeem for User</Button></DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader><DialogTitle>Redeem Reward for User</DialogTitle></DialogHeader>
            <AdminRedeemForm profiles={allProfiles} rewards={rewards ?? []} onSave={handleAdminRedeem} onCancel={() => setDialogOpen(null)} />
          </DialogContent>
        </Dialog>

        <Dialog open={dialogOpen === "adduser"} onOpenChange={(open) => setDialogOpen(open ? "adduser" : null)}>
          <DialogTrigger asChild><Button size="sm"><Plus className="mr-2 h-4 w-4" />Pre-Register</Button></DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader><DialogTitle>Pre-Register New User</DialogTitle></DialogHeader>
            <PreRegisterUserForm onSave={async (data) => {
              const insertData: Record<string, string> = { display_name: data.display_name, email: data.email, user_type: 'guest' };
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
          <DialogTrigger asChild><Button variant="outline" size="sm"><UserCheck className="mr-2 h-4 w-4" />Register</Button></DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader><DialogTitle>Register New User</DialogTitle></DialogHeader>
            <RegisterUserForm onSave={async (data) => {
              const insertData: Record<string, string> = { display_name: data.display_name.trim() };
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

      {/* Dialogs for history, inline actions, edit */}
      <Dialog open={dialogOpen === "pointshistory"} onOpenChange={(open) => { setDialogOpen(open ? "pointshistory" : null); if (!open) setViewingPointsHistory(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Points History</DialogTitle></DialogHeader>
          {viewingPointsHistory && <PointsTransactionHistory userId={viewingPointsHistory} />}
        </DialogContent>
      </Dialog>

      <Dialog open={dialogOpen === "hourshistory"} onOpenChange={(open) => { setDialogOpen(open ? "hourshistory" : null); if (!open) setViewingHoursHistory(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Hours History</DialogTitle></DialogHeader>
          {viewingHoursHistory && <HoursTransactionHistory userId={viewingHoursHistory} />}
        </DialogContent>
      </Dialog>

      <Dialog open={dialogOpen === "inlineallocate"} onOpenChange={(open) => { setDialogOpen(open ? "inlineallocate" : null); if (!open) setSelectedUser(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Allocate Points</DialogTitle></DialogHeader>
          {selectedUser && <InlineAllocatePointsForm displayName={selectedUser.display_name || "User"} onSave={(data) => handleInlineAllocatePoints(selectedUser.user_id || selectedUser.id, data)} onCancel={() => { setDialogOpen(null); setSelectedUser(null); }} />}
        </DialogContent>
      </Dialog>

      <Dialog open={dialogOpen === "inlineadjusthours"} onOpenChange={(open) => { setDialogOpen(open ? "inlineadjusthours" : null); if (!open) setSelectedUser(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Adjust Hours</DialogTitle></DialogHeader>
          {selectedUser && <InlineAdjustHoursForm displayName={selectedUser.display_name || "User"} hoursRemaining={selectedUser.hours_remaining ?? 0} onSave={(data) => handleInlineAdjustHours(selectedUser.user_id || selectedUser.id, data)} onCancel={() => { setDialogOpen(null); setSelectedUser(null); }} />}
        </DialogContent>
      </Dialog>

      <Dialog open={dialogOpen === "editprofile"} onOpenChange={(open) => { setDialogOpen(open ? "editprofile" : null); if (!open) setSelectedUser(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Edit Profile</DialogTitle></DialogHeader>
          {selectedUser && <EditProfileForm profile={selectedUser} onSave={(data) => handleEditProfile(selectedUser.id, data)} onCancel={() => { setDialogOpen(null); setSelectedUser(null); }} />}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteConfirm} onOpenChange={(open) => { if (!open) setDeleteConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete User</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{deleteConfirm?.display_name || "this user"}</strong>? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteConfirm && handleDeleteUser(deleteConfirm.id, deleteConfirm.display_name || "User")} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Search bar */}
      <div className="relative w-64">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search name or email…" value={searchQuery} onChange={(e) => { setSearchQuery(e.target.value); setPage(0); }} className="pl-9 h-9" />
      </div>

      {/* Main table */}
      {isLoading ? <Loader2 className="mx-auto h-8 w-8 animate-spin" /> : (
        <>
          {totalUsers === 0 && <p className="text-center text-muted-foreground py-8">No users found.</p>}
          {totalUsers > 0 && (
            <div className="rounded-lg border bg-card overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent border-b border-border">
                    <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium w-[35%]"><span className="pl-[44px]">User</span></TableHead>
                    <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Type</TableHead>
                    <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium text-center">Points</TableHead>
                    <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium text-center">Hours</TableHead>
                    <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium text-center">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginated.map((u: any, idx: number) => {
                    const avatarColors = [
                      "bg-blue-500/15 text-blue-400",
                      "bg-emerald-500/15 text-emerald-400",
                      "bg-amber-500/15 text-amber-400",
                      "bg-purple-500/15 text-purple-400",
                      "bg-rose-500/15 text-rose-400",
                      "bg-cyan-500/15 text-cyan-400",
                    ];
                    const avatarClass = avatarColors[idx % avatarColors.length];

                    const hoursRemaining = u.hours_remaining ?? 0;
                    let hoursPillClass = "bg-green-500/15 text-green-400";
                    let hoursDotClass = "bg-green-400";
                    if (hoursRemaining <= 1) {
                      hoursPillClass = "bg-red-500/15 text-red-400";
                      hoursDotClass = "bg-red-400";
                    } else if (hoursRemaining <= 3) {
                      hoursPillClass = "bg-amber-500/15 text-amber-400";
                      hoursDotClass = "bg-amber-400";
                    }

                    const points = u.points ?? 0;

                    return (
                      <TableRow key={u.id || u.user_id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                        {/* User */}
                        <TableCell className="py-3">
                          <div className="flex items-center gap-3">
                            <div className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-medium shrink-0 ${avatarClass}`}>
                              {getInitials(u.display_name)}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-normal text-foreground truncate">{u.display_name || "Unknown"}</span>
                                {!u.user_id && u.user_type === "guest" && (
                                  <span className="inline-flex items-center rounded-full bg-amber-500/15 text-amber-400 border border-amber-400/30 px-1.5 py-0 text-[10px] font-medium shrink-0">Pending</span>
                                )}
                              </div>
                              <div className="text-xs text-muted-foreground truncate">{u.email || "—"}</div>
                            </div>
                          </div>
                        </TableCell>

                        {/* Type */}
                        <TableCell className="py-3">
                          <Select value={u.user_type || "registered"} onValueChange={(v) => handleChangeUserType(u.id, v)}>
                            <SelectTrigger className="w-[130px] h-7 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {USER_TYPES.map((t) => (
                                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>

                        {/* Points */}
                        <TableCell className="py-3 text-center">
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-purple-500/15 text-purple-400 px-2.5 py-0.5 text-xs font-medium">
                            <Star className="h-3 w-3" />{points}
                          </span>
                        </TableCell>

                        {/* Hours */}
                        <TableCell className="py-3 text-center">
                          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${hoursPillClass}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${hoursDotClass}`} />
                            {hoursRemaining} hrs
                          </span>
                        </TableCell>

                        {/* Actions */}
                        <TableCell className="py-3 text-center">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                              <DropdownMenuItem onClick={() => { setSelectedUser(u); setDialogOpen("editprofile"); }}>
                                <Pencil className="mr-2 h-4 w-4" />Edit Profile
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => { setSelectedUser(u); setDialogOpen("inlineallocate"); }}>
                                <Star className="mr-2 h-4 w-4" />Allocate Points
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => { setSelectedUser(u); setDialogOpen("inlineadjusthours"); }}>
                                <Clock className="mr-2 h-4 w-4" />Adjust Hours
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => { setViewingPointsHistory(u.user_id || u.id); setDialogOpen("pointshistory"); }}>
                                <History className="mr-2 h-4 w-4" />Points History
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => { setViewingHoursHistory(u.user_id || u.id); setDialogOpen("hourshistory"); }}>
                                <History className="mr-2 h-4 w-4" />Hours History
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeleteConfirm(u)}>
                                <Trash2 className="mr-2 h-4 w-4" />Delete User
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

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
        </>
      )}
    </div>
  );
}
