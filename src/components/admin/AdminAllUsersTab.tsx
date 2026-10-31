import { useState, useRef, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
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
import { Plus, Loader2, MinusCircle, PlusCircle, Star, Award, UserCheck, ChevronLeft, ChevronRight, Clock, MoreHorizontal, Pencil, History, Trash2, Search, Wallet, Eye, ShieldCheck, CircleUserRound, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { CustomerFinanceDialog } from "@/components/admin/CustomerFinanceDialog";
import { ViewUserProfileDialog } from "@/components/admin/ViewUserProfileDialog";
import { UserAccessDialog } from "@/components/admin/UserAccessDialog";
import { useToast } from "@/hooks/use-toast";
import { useRewards } from "@/hooks/useRewards";
import { useAllocatePoints, useRedeemPoints, usePointsTransactions } from "@/hooks/usePoints";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useAdmin } from "@/hooks/useAdmin";
import { useAdminCity } from "@/contexts/AdminCityContext";
import { HoursBalanceBadge } from "@/components/admin/HoursBalanceBadge";
import { HoursActionLabel, MemberHoursManager } from "@/components/admin/MemberHoursManager";
import { type MemberFilter } from "@/lib/member-utils";
import { useCustomerReport, fetchCustomerReport } from "@/hooks/useCustomerReport";
import { customerReportCsv, formatCustomerSpend } from "@/lib/customer-report";
import { CustomerReportControls, initialCustomerFilters } from "./CustomerReportControls";

import { Switch } from "@/components/ui/switch";
import { CorporateAccountPicker } from "./CorporateAccountPicker";
import { canRegisterCorporateMember } from "@/lib/corporate-selection";

// ─── Sub-components ──────────────────────────────────────────────

type CustomerSort = { key: string; dir: "asc" | "desc" };

function SortableHead({ label, sortKey, sort, onSort, className, buttonClassName }: { label: string; sortKey: string; sort: CustomerSort | null; onSort: (key: string) => void; className?: string; buttonClassName?: string }) {
  const active = sort?.key === sortKey;
  return (
    <TableHead className={className ?? "text-[11px] uppercase tracking-wider text-muted-foreground font-medium"}>
      <button type="button" onClick={() => onSort(sortKey)} aria-label={`Sort by ${label}`} className={`inline-flex items-center gap-1 uppercase tracking-wider hover:text-foreground ${buttonClassName ?? ""}`}>
        {label}
        {active ? (sort.dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-40" />}
      </button>
    </TableHead>
  );
}

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

function BookingTransactionHistory({ userId, profileId }: { userId: string; profileId?: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["admin_user_booking_history", userId, profileId],
    queryFn: async () => {
      const ids = Array.from(new Set([userId, profileId].filter(Boolean) as string[]));
      const { data: bookings } = await supabase
        .from("bookings")
        .select("id, start_time, end_time, duration_minutes, city, bay_id, session_type, status, note")
        .in("user_id", ids)
        .order("start_time", { ascending: false });
      const bookingIds = (bookings ?? []).map((b: any) => b.id);
      let txByBooking = new Map<string, number>();
      let currency = "INR";
      if (bookingIds.length) {
        const { data: txs } = await supabase
          .from("revenue_transactions")
          .select("booking_id, amount, currency, transaction_type, status")
          .in("booking_id", bookingIds)
          .eq("status", "confirmed");
        (txs ?? []).forEach((t: any) => {
          if (!t.booking_id) return;
          const sign = 1;
          txByBooking.set(t.booking_id, (txByBooking.get(t.booking_id) ?? 0) + sign * Number(t.amount || 0));
          if (t.currency) currency = t.currency;
        });
      }
      // Sort ascending for running total, then reverse for display
      const sortedAsc = [...(bookings ?? [])].sort(
        (a: any, b: any) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
      );
      let running = 0;
      const withTotals = sortedAsc.map((b: any) => {
        const amt = txByBooking.get(b.id) ?? 0;
        running += amt;
        return { ...b, amount_paid: amt, running_total: running };
      });
      return { rows: withTotals.reverse(), grandTotal: running, currency };
    },
  });

  if (isLoading) return <Loader2 className="mx-auto h-6 w-6 animate-spin" />;
  if (!data?.rows?.length) return <p className="text-sm text-muted-foreground">No bookings yet.</p>;
  const fmt = (n: number) => `${data.currency} ${n.toFixed(2)}`;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm border-b pb-2">
        <span className="text-muted-foreground">{data.rows.length} booking{data.rows.length !== 1 ? "s" : ""}</span>
        <span className="font-medium">Total paid: {fmt(data.grandTotal)}</span>
      </div>
      <div className="space-y-2 max-h-[60vh] overflow-y-auto">
        {data.rows.map((b: any) => (
          <div key={b.id} className="flex items-center justify-between rounded-md border p-2 text-sm">
            <div className="min-w-0">
              <div className="font-medium truncate">
                {new Date(b.start_time).toLocaleDateString()} · {new Date(b.start_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </div>
              <div className="text-xs text-muted-foreground">
                {b.city} · {b.session_type} · {(b.duration_minutes / 60).toFixed(1)}h · <span className="capitalize">{b.status}</span>
              </div>
            </div>
            <div className="text-right shrink-0 ml-3">
              <div className={b.amount_paid < 0 ? "text-destructive" : "text-primary"}>{fmt(b.amount_paid)}</div>
              <div className="text-xs text-muted-foreground">Running: {fmt(b.running_total)}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}



function AllocatePointsForm({ profiles, onSave, onCancel }: { profiles: any[]; onSave: (data: { user_id: string; points: number; description: string; isProfileId?: boolean }) => void; onCancel: () => void }) {
  const [form, setForm] = useState({ user_id: "", points: 0, description: "" });
  return (
    <div className="space-y-4">
      <div>
        <Label>Member</Label>
        <Select value={form.user_id} onValueChange={(v) => setForm({ ...form, user_id: v })}>
          <SelectTrigger><SelectValue placeholder="Select a member" /></SelectTrigger>
          <SelectContent>
            {profiles.map((p: any) => {
              const uid = p.user_id || p.id;
              return <SelectItem key={uid} value={uid}>{p.display_name || p.email}{!p.user_id ? " (admin-registered)" : ""}</SelectItem>;
            })}
          </SelectContent>
        </Select>
      </div>
      <div><Label>Points</Label><Input type="number" min="1" value={form.points || ""} onChange={(e) => setForm({ ...form, points: Number(e.target.value) })} /></div>
      <div><Label>Reason</Label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="e.g. Welcome bonus, event participation" /></div>
      <div className="flex gap-2 justify-end">
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button onClick={() => {
          const selected = profiles.find((p: any) => (p.user_id || p.id) === form.user_id);
          onSave({ ...form, isProfileId: !selected?.user_id });
        }} disabled={!form.user_id || form.points <= 0}>Allocate Points</Button>
      </div>
    </div>
  );
}

function AdminRedeemForm({ profiles, rewards, onSave, onCancel }: { profiles: any[]; rewards: any[]; onSave: (data: { user_id: string; reward_id: string; reward_name: string; points: number; isProfileId?: boolean }) => void; onCancel: () => void }) {
  const [userId, setUserId] = useState("");
  const [rewardId, setRewardId] = useState("");
  const selectedReward = (rewards ?? []).find((r: any) => r.id === rewardId);
  const selectedProfile = profiles.find((p: any) => (p.user_id || p.id) === userId);
  const userPoints = selectedProfile?.points ?? 0;
  return (
    <div className="space-y-4">
      <div>
        <Label>Member</Label>
        <Select value={userId} onValueChange={setUserId}>
          <SelectTrigger><SelectValue placeholder="Select a member" /></SelectTrigger>
          <SelectContent>
            {profiles.map((p: any) => {
              const uid = p.user_id || p.id;
              return <SelectItem key={uid} value={uid}>{p.display_name || p.email} ({p.points ?? 0} pts){!p.user_id ? " (admin-registered)" : ""}</SelectItem>;
            })}
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
        <Button onClick={() => {
          onSave({ user_id: userId, reward_id: rewardId, reward_name: selectedReward?.name ?? "", points: selectedReward?.points_cost ?? 0, isProfileId: !selectedProfile?.user_id });
        }} disabled={!userId || !rewardId || userPoints < (selectedReward?.points_cost ?? 0)}>Redeem</Button>
      </div>
    </div>
  );
}


function CityField({ value, onChange, required, disabled }: { value: string; onChange: (v: string) => void; required?: boolean; disabled?: boolean }) {
  const { availableCities } = useAdminCity();
  const options = value && !availableCities.includes(value) ? [value, ...availableCities] : availableCities;
  return (
    <div><Label>Preferred City {required && <span className="text-destructive">*</span>}</Label>
      <Select value={value || undefined} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger><SelectValue placeholder="Select city" /></SelectTrigger>
        <SelectContent>{options.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  );
}

function RegisterUserForm({ onSave, onCancel }: { onSave: (data: { display_name: string; email: string; phone: string; city: string; accountIds: string[] }) => Promise<void>; onCancel: () => void }) {
  const { selectedCity } = useAdminCity();
  const [form, setForm] = useState({ display_name: "", email: "", phone: "", city: selectedCity || "" });
  const [corporate, setCorporate] = useState(false);
  const [accountIds, setAccountIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const submit = async () => {
    if (savingRef.current || !form.city || !canRegisterCorporateMember(form.display_name, corporate, accountIds)) return;
    savingRef.current = true;
    setSaving(true);
    try { await onSave({ ...form, accountIds: corporate ? accountIds : [] }); }
    finally { savingRef.current = false; setSaving(false); }
  };
  return (
    <div className="space-y-4">
      <div><Label>Display Name <span className="text-destructive">*</span></Label><Input value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} placeholder="John Smith" /></div>
      <div><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="john@example.com" /></div>
      <div><Label>Phone</Label><Input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+91 98765 43210" /></div>
      <CityField value={form.city} onChange={(city) => setForm({ ...form, city })} required disabled={saving} />
      <div className="flex items-center justify-between"><Label htmlFor="register-corporate">Corporate account user</Label><Switch id="register-corporate" checked={corporate} disabled={saving} onCheckedChange={setCorporate} /></div>
      {corporate && <CorporateAccountPicker value={accountIds} onChange={setAccountIds} disabled={saving} />}
      <p className="text-xs text-muted-foreground">Email and phone are optional. If an email is provided, the user will be linked when they sign in with that email.</p>
      <div className="flex gap-2 justify-end">
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button onClick={submit} disabled={saving || !form.display_name.trim() || !form.city || (corporate && accountIds.length === 0)}>{saving ? "Registering…" : "Register User"}</Button>
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
      <CityField value={form.preferred_city} onChange={(preferred_city) => setForm({ ...form, preferred_city })} />
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
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: rewards } = useRewards();
  const allocatePoints = useAllocatePoints();
  const redeemPoints = useRedeemPoints();
  const [dialogOpen, setDialogOpen] = useState<string | null>(null);
  const [viewingPointsHistory, setViewingPointsHistory] = useState<string | null>(null);
  const [viewingBookingHistory, setViewingBookingHistory] = useState<{ userId: string; profileId?: string } | null>(null);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [allProfiles, setAllProfiles] = useState<any[]>([]);
  const [deleteConfirm, setDeleteConfirm] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(0);
  const requestedFilter = searchParams.get("filter");
  const typeFilter: MemberFilter = requestedFilter === "pre-registered" || requestedFilter === "registered" || requestedFilter === "member" ? requestedFilter : "all";
  const PAGE_SIZE = 50;
  const { isAdmin, assignedCities } = useAdmin();
  const { selectedCity, availableCities } = useAdminCity();

  const [reportFilters, setReportFilters] = useState(initialCustomerFilters);
  const [exporting, setExporting] = useState(false);
  useEffect(() => { setPage(0); setReportFilters(initialCustomerFilters); }, [selectedCity]);
  const dashboardPreset = searchParams.get("preset");
  useEffect(() => {
    if (dashboardPreset === "renewal-opportunities" || dashboardPreset === "inactive-repeat") {
      setReportFilters({ ...initialCustomerFilters, preset: dashboardPreset });
      setPage(0);
    }
  }, [dashboardPreset, selectedCity]);
  const reportArgs = {
    _city: selectedCity || undefined, _preferred_city: reportFilters.preferredCity || undefined,
    _visited_city: reportFilters.visitedCity || undefined, _from: reportFilters.from || undefined,
    _to: reportFilters.to || undefined, _preset: reportFilters.preset, _type: typeFilter, _search: searchQuery,
  };
  const { data: report, isLoading, error: reportError } = useCustomerReport({ ...reportArgs, _offset: page * PAGE_SIZE, _limit: PAGE_SIZE });
  const totalUsers = report?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalUsers / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  useEffect(() => { if (page !== safePage) setPage(safePage); }, [page, safePage]);
  const paginated = report?.rows ?? [];
  const exportCustomers = async () => {
    if (!report) return;
    setExporting(true);
    try {
      const rows = [];
      let offset = 0;
      let total = report.total;
      do {
        const batch = await fetchCustomerReport({ ...reportArgs, _as_of: report.as_of, _offset: offset, _limit: 500 });
        total = batch.total;
        if (!batch.rows.length && offset < total) throw new Error("Customer list changed during export. Please retry.");
        rows.push(...batch.rows); offset += batch.rows.length;
      } while (offset < total);
      if (new Set(rows.map(r => r.id)).size !== rows.length) throw new Error("Customer list changed during export. Please retry.");
      const download = (content: string, name: string, type: string) => {
        const url = URL.createObjectURL(new Blob([content], { type }));
        const link = document.createElement("a"); link.href = url; link.download = name; link.click(); URL.revokeObjectURL(url);
      };
      download(customerReportCsv(rows), "customers.csv", "text/csv;charset=utf-8");
      download(JSON.stringify({ ...reportArgs, as_of: report.as_of, locations: report.cities, timezone: report.timezone, customers: rows.length, reconciliation: report.reconciliation, unlinked_revenue: report.unlinked_revenue, missing_revenue_date: report.missing_revenue_date,
        definitions: { visits: "Past confirmed qualifying sessions, parent booking deduplicated; not verified attendance", spend: "Confirmed signed personal revenue by business revenue date, currencies separate, corporate billing excluded", balances: "Hours and points are account-wide", channel: "Online only from explicit completed booking/payment links; otherwise Unknown" } }, null, 2), "customers-report-summary.json", "application/json");
    } catch (error) { toast({ title: "Export unavailable", description: error instanceof Error ? error.message : "Please retry.", variant: "destructive" }); }
    finally { setExporting(false); }
  };

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

  const handleToggleExtendedHours = async (profileId: string, enabled: boolean) => {
    const { error } = await supabase
      .from("profiles")
      .update({ extended_hours_access: enabled } as never)
      .eq("id", profileId);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: enabled ? "Extended hours enabled" : "Extended hours disabled" });
      queryClient.invalidateQueries({ queryKey: ["admin_all_users"] });
    }
  };

  const loadProfiles = async () => {
    try {
      const rows = [];
      let offset = 0;
      let total = 0;
      do {
        const result = await fetchCustomerReport({ _city: selectedCity || undefined, _offset: offset, _limit: 500 });
        rows.push(...result.rows); total = result.total; offset += result.rows.length;
        if (!result.rows.length) break;
      } while (offset < total);
      setAllProfiles(rows);
    } catch (error) { toast({ title: "Customer list unavailable", description: error instanceof Error ? error.message : "Please retry.", variant: "destructive" }); }
  };

  const handleAllocatePoints = async (data: { user_id: string; points: number; description: string; isProfileId?: boolean }) => {
    try {
      await allocatePoints.mutateAsync({ userId: data.user_id, points: data.points, description: data.description, adminId: user?.id ?? "", isProfileId: data.isProfileId });
      toast({ title: "Points allocated", description: `${data.points} points awarded.` });
      setDialogOpen(null);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleAdminRedeem = async (data: { user_id: string; reward_id: string; reward_name: string; points: number; isProfileId?: boolean }) => {
    try {
      await redeemPoints.mutateAsync({ userId: data.user_id, points: data.points, rewardId: data.reward_id, rewardName: data.reward_name, adminId: user?.id ?? "", isProfileId: data.isProfileId });
      toast({ title: "Reward redeemed", description: `${data.reward_name} redeemed successfully.` });
      setDialogOpen(null);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleInlineAllocatePoints = async (userId: string, isProfileId: boolean, data: { points: number; description: string }) => {
    try {
      await allocatePoints.mutateAsync({ userId, points: data.points, description: data.description, adminId: user?.id ?? "", isProfileId });
      toast({ title: "Points allocated", description: `${data.points} points awarded.` });
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

        <Dialog open={dialogOpen === "registeruser"} onOpenChange={(open) => setDialogOpen(open ? "registeruser" : null)}>
          <DialogTrigger asChild><Button size="sm"><UserCheck className="mr-2 h-4 w-4" />Register User</Button></DialogTrigger>
          <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Register New User</DialogTitle></DialogHeader>
            <RegisterUserForm onSave={async (data) => {
              const email = data.email.trim().toLowerCase();
              const { data: result, error } = await supabase.rpc("register_corporate_member", {
                _name: data.display_name.trim(), _email: email || undefined, _phone: data.phone.trim() || undefined,
                _city: data.city, _account_ids: data.accountIds,
              });
              if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
              if (result && typeof result === "object" && !Array.isArray(result) && result.existing) {
                toast({ title: "User already exists", description: `${result.display_name || email} is already registered. Their memberships have not changed.`, variant: "destructive" });
                if (typeof result.profile_id === "string") navigate(`/members/${result.profile_id}/360`);
                return;
              }
              toast({ title: "User registered", description: `${data.display_name} has been registered.` });
              queryClient.invalidateQueries({ queryKey: ["admin_all_users"] });
              queryClient.invalidateQueries({ queryKey: ["corporate_members"] });
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

      {dialogOpen === "hourshistory" && selectedUser && (
        <MemberHoursManager member={selectedUser} mode="history" selectedCity={selectedCity} onClose={() => { setDialogOpen(null); setSelectedUser(null); }} />
      )}

      <Dialog open={dialogOpen === "bookinghistory"} onOpenChange={(open) => { setDialogOpen(open ? "bookinghistory" : null); if (!open) setViewingBookingHistory(null); }}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader><DialogTitle>Booking History</DialogTitle></DialogHeader>
          {viewingBookingHistory && <BookingTransactionHistory userId={viewingBookingHistory.userId} profileId={viewingBookingHistory.profileId} />}
        </DialogContent>
      </Dialog>



      <Dialog open={dialogOpen === "inlineallocate"} onOpenChange={(open) => { setDialogOpen(open ? "inlineallocate" : null); if (!open) setSelectedUser(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Allocate Points</DialogTitle></DialogHeader>
          {selectedUser && <InlineAllocatePointsForm displayName={selectedUser.display_name || "User"} onSave={(data) => handleInlineAllocatePoints(selectedUser.user_id || selectedUser.id, !selectedUser.user_id, data)} onCancel={() => { setDialogOpen(null); setSelectedUser(null); }} />}
        </DialogContent>
      </Dialog>

      {dialogOpen === "inlineadjusthours" && selectedUser && (
        <MemberHoursManager member={selectedUser} mode="adjust" selectedCity={selectedCity} onClose={() => { setDialogOpen(null); setSelectedUser(null); }} />
      )}

      <Dialog open={dialogOpen === "editprofile"} onOpenChange={(open) => { setDialogOpen(open ? "editprofile" : null); if (!open) setSelectedUser(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Edit Profile</DialogTitle></DialogHeader>
          {selectedUser && <EditProfileForm profile={selectedUser} onSave={(data) => handleEditProfile(selectedUser.id, data)} onCancel={() => { setDialogOpen(null); setSelectedUser(null); }} />}
        </DialogContent>
      </Dialog>

      {selectedUser && dialogOpen === "viewprofile" && (
        <ViewUserProfileDialog
          user={selectedUser}
          onClose={() => { setDialogOpen(null); setSelectedUser(null); }}
          onEdit={() => setDialogOpen("editprofile")}
        />
      )}

      {selectedUser && dialogOpen === "access" && (
        <UserAccessDialog
          user={selectedUser}
          open
          onClose={() => { setDialogOpen(null); setSelectedUser(null); }}
        />
      )}

      <AlertDialog open={!!deleteConfirm} onOpenChange={(open) => { if (!open) setDeleteConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete User</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{deleteConfirm?.display_name || "this user"}</strong>? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>No – Don't Delete</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteConfirm && handleDeleteUser(deleteConfirm.id, deleteConfirm.display_name || "User")} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Yes – Delete User</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {selectedUser && dialogOpen === "finance" && (
        <CustomerFinanceDialog
          open
          onOpenChange={(open) => { if (!open) { setDialogOpen(null); setSelectedUser(null); } }}
          userId={selectedUser.user_id || selectedUser.id}
          profileId={selectedUser.id}
          displayName={selectedUser.display_name || "User"}
          city={selectedCity || undefined}
        />
      )}

      {/* Search and type filter */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search name or email…" value={searchQuery} onChange={(e) => { setSearchQuery(e.target.value); setPage(0); }} className="pl-9 h-9" />
        </div>
        <Select value={typeFilter} onValueChange={(value: MemberFilter) => {
          const next = new URLSearchParams(searchParams);
          if (value === "all") next.delete("filter"); else next.set("filter", value);
          setSearchParams(next, { replace: true });
          setPage(0);
        }}>
          <SelectTrigger className="h-9 w-full sm:w-44" aria-label="Type filter"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="pre-registered">Pre-registered</SelectItem>
            <SelectItem value="registered">Registered</SelectItem>
            <SelectItem value="member">Member</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <CustomerReportControls filters={reportFilters} onChange={value => { setReportFilters(value); setPage(0); }} cities={availableCities} report={report} exporting={exporting} onExport={exportCustomers} />
      {reportError && <p role="alert" className="text-sm text-destructive">Customer report unavailable: {reportError.message}</p>}
      {/* Main table */}
      {isLoading ? <Loader2 className="mx-auto h-8 w-8 animate-spin" /> : (
        <>
          {totalUsers === 0 && <p className="text-center text-muted-foreground py-8">No users found.</p>}
          {totalUsers > 0 && (
            <div className="rounded-lg border bg-card overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent border-b border-border">
                    <TableHead className="sticky left-0 z-20 w-[220px] min-w-[220px] max-w-[220px] bg-card text-[11px] uppercase tracking-wider text-muted-foreground font-medium"><span className="pl-[44px]">User</span></TableHead>
                    <TableHead className="sticky left-[220px] z-20 w-16 min-w-16 bg-card text-[11px] uppercase tracking-wider text-muted-foreground font-medium text-center">Actions</TableHead>
                    <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Type</TableHead>
                    <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium text-center">Hours · account</TableHead>
                    <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium text-center">Points · account</TableHead>
                    <TableHead>Last visit</TableHead><TableHead>Next booking</TableHead><TableHead>Period visits</TableHead><TableHead>Personal net spend · period</TableHead>
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

                    const points = u.points ?? 0;

                    return (
                      <TableRow key={u.id || u.user_id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                        {/* User */}
                        <TableCell className="sticky left-0 z-10 w-[220px] min-w-[220px] max-w-[220px] bg-card py-3">
                          <div className="flex items-center gap-3">
                            <div className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-medium shrink-0 ${avatarClass}`}>
                              {getInitials(u.display_name)}
                            </div>
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                <span className="font-normal text-foreground truncate">{u.display_name || "Unknown"}</span>
                                {!u.user_id && u.user_type === "guest" && (
                                  <span className="inline-flex items-center rounded-full bg-amber-500/15 text-amber-400 border border-amber-400/30 px-1.5 py-0 text-[10px] font-medium shrink-0">Pending</span>
                                )}
                                {u.member_hours_id && <Badge variant="secondary" className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 text-[10px]">Member</Badge>}
                              </div>
                              <div className="text-xs text-muted-foreground truncate">{u.email || "—"}</div>
                            </div>
                          </div>
                        </TableCell>

                        {/* Actions */}
                        <TableCell className="sticky left-[220px] z-10 w-16 min-w-16 bg-card py-3 text-center">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" aria-label={`Actions for ${u.display_name || u.email || "user"}`} title="Customer actions">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56 max-h-[calc(100dvh-2rem)] overflow-y-auto">
                              <DropdownMenuItem onClick={() => navigate(`/members/${u.id}/360`)}>
                                <CircleUserRound className="mr-2 h-4 w-4" />Member360
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => { setSelectedUser(u); setDialogOpen("viewprofile"); }}>
                                <Eye className="mr-2 h-4 w-4" />View Profile
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => { setSelectedUser(u); setDialogOpen("editprofile"); }}>
                                <Pencil className="mr-2 h-4 w-4" />Edit Profile
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => { setSelectedUser(u); setDialogOpen("inlineallocate"); }}>
                                <Star className="mr-2 h-4 w-4" />Allocate Points
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => { setSelectedUser(u); setDialogOpen("inlineadjusthours"); }}>
                                <HoursActionLabel mode="adjust" />
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => { setViewingPointsHistory(u.user_id || u.id); setDialogOpen("pointshistory"); }}>
                                <History className="mr-2 h-4 w-4" />Points History
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => { setSelectedUser(u); setDialogOpen("hourshistory"); }}>
                                <HoursActionLabel mode="history" />
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => { setViewingBookingHistory({ userId: u.user_id || u.id, profileId: u.id }); setDialogOpen("bookinghistory"); }}>
                                <History className="mr-2 h-4 w-4" />Booking History
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => { setSelectedUser(u); setDialogOpen("finance"); }}>
                                <Wallet className="mr-2 h-4 w-4" />Finance
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => { setSelectedUser(u); setDialogOpen("access"); }}>
                                <ShieldCheck className="mr-2 h-4 w-4" />Manage Access
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleToggleExtendedHours(u.id, !u.extended_hours_access)}>
                                <Clock className="mr-2 h-4 w-4" />
                                {u.extended_hours_access ? "Disable" : "Enable"} Extended Hours
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeleteConfirm(u)}>
                                <Trash2 className="mr-2 h-4 w-4" />Delete User
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
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

                        {/* Hours */}
                        <TableCell className="py-3 text-center">
                          {u.member_hours_id ? <HoursBalanceBadge remaining={hoursRemaining} /> : <span className="text-muted-foreground">—</span>}
                        </TableCell>

                        {/* Points */}
                        <TableCell className="py-3 text-center">
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-purple-500/15 text-purple-400 px-2.5 py-0.5 text-xs font-medium">
                            <Star className="h-3 w-3" />{points}
                          </span>
                        </TableCell>

                        <TableCell className="whitespace-nowrap text-xs">{u.last_visit ? new Date(u.last_visit).toLocaleDateString(undefined, { timeZone: report?.timezone }) : "—"}</TableCell>
                        <TableCell className="whitespace-nowrap text-xs">{u.next_booking ? new Date(u.next_booking).toLocaleDateString(undefined, { timeZone: report?.timezone }) : "—"}</TableCell>
                        <TableCell>{u.visit_count}</TableCell>
                        <TableCell className="min-w-36 text-xs">{formatCustomerSpend(u.period_spend)}</TableCell>

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
