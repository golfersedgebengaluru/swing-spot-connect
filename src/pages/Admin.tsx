import { useState } from "react";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Loader2, Calendar, ShoppingBag, Gift, Users, Clock, MinusCircle, PlusCircle, History, UserCheck, Settings, KeyRound, FileText, Save, Star, Award, MapPin, ClipboardList } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useEvents } from "@/hooks/useEvents";
import { useProducts } from "@/hooks/useProducts";
import { useRewards } from "@/hooks/useRewards";
import { useMemberHours, useHoursTransactions } from "@/hooks/useMemberHours";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useAllPageContent, useUpdatePageContent } from "@/hooks/usePageContent";
import { usePageVisibility, useUpdatePageVisibility } from "@/hooks/usePageVisibility";
import { useAllocatePoints, useRedeemPoints, usePointsTransactions } from "@/hooks/usePoints";
import { useBayConfig, useAllBookings } from "@/hooks/useBookings";
import { Navigate } from "react-router-dom";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";

function EventForm({ event, onSave, onCancel }: { event?: any; onSave: (data: any) => void; onCancel: () => void }) {
  const [form, setForm] = useState({
    title: event?.title ?? "",
    description: event?.description ?? "",
    date: event?.date ?? "",
    time_start: event?.time_start ?? "",
    time_end: event?.time_end ?? "",
    location: event?.location ?? "",
    spots_total: event?.spots_total ?? 0,
    spots_taken: event?.spots_taken ?? 0,
    type: event?.type ?? "social",
    prize: event?.prize ?? "",
    price: event?.price ?? "",
    is_active: event?.is_active ?? true,
  });

  return (
    <div className="space-y-4">
      <div><Label>Title</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
      <div><Label>Description</Label><RichTextEditor content={form.description} onChange={(html) => setForm({ ...form, description: html })} minHeight="120px" /></div>
      <div className="grid grid-cols-2 gap-4">
        <div><Label>Date</Label><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
        <div><Label>Type</Label>
          <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="tournament">Tournament</SelectItem>
              <SelectItem value="clinic">Clinic</SelectItem>
              <SelectItem value="social">Social</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div><Label>Start Time</Label><Input value={form.time_start} onChange={(e) => setForm({ ...form, time_start: e.target.value })} placeholder="10:00 AM" /></div>
        <div><Label>End Time</Label><Input value={form.time_end} onChange={(e) => setForm({ ...form, time_end: e.target.value })} placeholder="4:00 PM" /></div>
      </div>
      <div><Label>Location</Label><Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></div>
      <div className="grid grid-cols-2 gap-4">
        <div><Label>Total Spots</Label><Input type="number" value={form.spots_total} onChange={(e) => setForm({ ...form, spots_total: Number(e.target.value) })} /></div>
        <div><Label>Spots Taken</Label><Input type="number" value={form.spots_taken} onChange={(e) => setForm({ ...form, spots_taken: Number(e.target.value) })} /></div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div><Label>Prize</Label><Input value={form.prize} onChange={(e) => setForm({ ...form, prize: e.target.value })} /></div>
        <div><Label>Price</Label><Input value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></div>
      </div>
      <div className="flex items-center gap-2"><Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} /><Label>Active</Label></div>
      <div className="flex gap-2 justify-end">
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button onClick={() => onSave(form)}>Save</Button>
      </div>
    </div>
  );
}

function ProductForm({ product, onSave, onCancel }: { product?: any; onSave: (data: any) => void; onCancel: () => void }) {
  const [form, setForm] = useState({
    name: product?.name ?? "",
    description: product?.description ?? "",
    price: product?.price ?? 0,
    category: product?.category ?? "other",
    type: product?.type ?? "beverage",
    badge: product?.badge ?? "",
    sizes: product?.sizes?.join(", ") ?? "",
    colors: product?.colors?.join(", ") ?? "",
    in_stock: product?.in_stock ?? true,
    sort_order: product?.sort_order ?? 0,
  });

  const handleSave = () => {
    onSave({
      ...form,
      price: Number(form.price),
      sizes: form.sizes ? form.sizes.split(",").map((s: string) => s.trim()).filter(Boolean) : null,
      colors: form.colors ? form.colors.split(",").map((s: string) => s.trim()).filter(Boolean) : null,
      badge: form.badge || null,
    });
  };

  return (
    <div className="space-y-4">
      <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
      <div><Label>Description</Label><RichTextEditor content={form.description} onChange={(html) => setForm({ ...form, description: html })} minHeight="120px" /></div>
      <div className="grid grid-cols-2 gap-4">
        <div><Label>Price ($)</Label><Input type="number" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></div>
        <div><Label>Type</Label>
          <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="beverage">Beverage</SelectItem>
              <SelectItem value="merchandise">Merchandise</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div><Label>Category</Label><Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="coffee, beer, apparel..." /></div>
        <div><Label>Badge</Label><Input value={form.badge} onChange={(e) => setForm({ ...form, badge: e.target.value })} placeholder="e.g. Premium" /></div>
      </div>
      <div><Label>Sizes (comma-separated)</Label><Input value={form.sizes} onChange={(e) => setForm({ ...form, sizes: e.target.value })} placeholder="S, M, L, XL" /></div>
      <div><Label>Colors (comma-separated)</Label><Input value={form.colors} onChange={(e) => setForm({ ...form, colors: e.target.value })} placeholder="Black, White, Navy" /></div>
      <div className="grid grid-cols-2 gap-4">
        <div><Label>Sort Order</Label><Input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })} /></div>
        <div className="flex items-center gap-2 pt-6"><Switch checked={form.in_stock} onCheckedChange={(v) => setForm({ ...form, in_stock: v })} /><Label>In Stock</Label></div>
      </div>
      <div className="flex gap-2 justify-end">
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button onClick={handleSave}>Save</Button>
      </div>
    </div>
  );
}

function RewardForm({ reward, onSave, onCancel }: { reward?: any; onSave: (data: any) => void; onCancel: () => void }) {
  const [form, setForm] = useState({
    name: reward?.name ?? "",
    description: reward?.description ?? "",
    points_cost: reward?.points_cost ?? 0,
    is_available: reward?.is_available ?? true,
    sort_order: reward?.sort_order ?? 0,
  });

  return (
    <div className="space-y-4">
      <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
      <div><Label>Description</Label><RichTextEditor content={form.description} onChange={(html) => setForm({ ...form, description: html })} minHeight="120px" /></div>
      <div className="grid grid-cols-2 gap-4">
        <div><Label>Points Cost</Label><Input type="number" value={form.points_cost} onChange={(e) => setForm({ ...form, points_cost: Number(e.target.value) })} /></div>
        <div><Label>Sort Order</Label><Input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })} /></div>
      </div>
      <div className="flex items-center gap-2"><Switch checked={form.is_available} onCheckedChange={(v) => setForm({ ...form, is_available: v })} /><Label>Available</Label></div>
      <div className="flex gap-2 justify-end">
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button onClick={() => onSave(form)}>Save</Button>
      </div>
    </div>
  );
}

function MemberHoursForm({ onSave, onCancel, profiles }: { onSave: (data: any) => void; onCancel: () => void; profiles: any[] }) {
  const [form, setForm] = useState({ user_id: "", hours_purchased: 0 });
  return (
    <div className="space-y-4">
      <div>
        <Label>Member</Label>
        <Select value={form.user_id} onValueChange={(v) => setForm({ ...form, user_id: v })}>
          <SelectTrigger><SelectValue placeholder="Select a member" /></SelectTrigger>
          <SelectContent>
            {profiles.map((p: any) => (
              <SelectItem key={p.user_id} value={p.user_id}>{p.display_name || p.user_id}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div><Label>Hours Purchased</Label><Input type="number" step="0.5" value={form.hours_purchased} onChange={(e) => setForm({ ...form, hours_purchased: Number(e.target.value) })} /></div>
      <div className="flex gap-2 justify-end">
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button onClick={() => onSave(form)} disabled={!form.user_id || form.hours_purchased <= 0}>Add Member</Button>
      </div>
    </div>
  );
}

function AdjustHoursForm({ member, onSave, onCancel }: { member: any; onSave: (data: any) => void; onCancel: () => void }) {
  const [form, setForm] = useState({ type: "deduction" as string, hours: 0, note: "" });
  const remaining = member.hours_purchased - member.hours_used;
  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-muted p-3">
        <p className="text-sm text-muted-foreground">Member: <span className="font-medium text-foreground">{member.display_name}</span></p>
        <p className="text-sm text-muted-foreground">Remaining: <span className="font-medium text-foreground">{remaining} hrs</span></p>
      </div>
      <div>
        <Label>Action</Label>
        <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="deduction">Deduct Hours</SelectItem>
            <SelectItem value="purchase">Add Hours</SelectItem>
            <SelectItem value="adjustment">Adjustment</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div><Label>Hours</Label><Input type="number" step="0.5" min="0" value={form.hours} onChange={(e) => setForm({ ...form, hours: Number(e.target.value) })} /></div>
      <div><Label>Note (optional)</Label><Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="e.g. Bay session 2hrs" /></div>
      <div className="flex gap-2 justify-end">
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button onClick={() => onSave(form)} disabled={form.hours <= 0}>Confirm</Button>
      </div>
    </div>
  );
}

function TransactionHistory({ userId }: { userId: string }) {
  const { data: transactions, isLoading } = useHoursTransactions(userId);
  if (isLoading) return <Loader2 className="mx-auto h-6 w-6 animate-spin" />;
  if (!transactions?.length) return <p className="text-sm text-muted-foreground">No transactions yet.</p>;
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

function ChangePasswordCard() {
  const { toast } = useToast();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast({ title: "Error", description: "New passwords do not match", variant: "destructive" });
      return;
    }
    setIsSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("change-admin-password", {
        body: { current_password: currentPassword, new_password: newPassword },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({ title: "Password changed", description: "Admin password has been updated successfully." });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to change password", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><KeyRound className="h-5 w-5" />Change Admin Password</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleChangePassword} className="space-y-4">
          <div>
            <Label htmlFor="current-pw">Current Password</Label>
            <Input id="current-pw" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className="mt-1" required />
          </div>
          <div>
            <Label htmlFor="new-pw">New Password</Label>
            <Input id="new-pw" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="mt-1" required minLength={6} />
          </div>
          <div>
            <Label htmlFor="confirm-pw">Confirm New Password</Label>
            <Input id="confirm-pw" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="mt-1" required minLength={6} />
          </div>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Updating...</> : "Change Password"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function PageContentEditor() {
  const { data: pages, isLoading } = useAllPageContent();
  const updatePage = useUpdatePageContent();
  const { toast } = useToast();
  const [editingPage, setEditingPage] = useState<{ id: string; title: string; content: string; slug: string } | null>(null);

  const handleSave = async () => {
    if (!editingPage) return;
    try {
      await updatePage.mutateAsync({ id: editingPage.id, title: editingPage.title, content: editingPage.content });
      toast({ title: "Page updated", description: `"${editingPage.title}" has been saved.` });
      setEditingPage(null);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  if (isLoading) return <Loader2 className="mx-auto h-8 w-8 animate-spin" />;

  if (editingPage) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Editing: {editingPage.slug}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Page Title</Label>
            <Input
              value={editingPage.title}
              onChange={(e) => setEditingPage({ ...editingPage, title: e.target.value })}
              className="mt-1"
            />
          </div>
          <div>
            <Label>Content</Label>
            <RichTextEditor
              content={editingPage.content}
              onChange={(html) => setEditingPage({ ...editingPage, content: html })}
              className="mt-1"
              minHeight="300px"
            />
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setEditingPage(null)}>Cancel</Button>
            <Button onClick={handleSave} disabled={updatePage.isPending}>
              {updatePage.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving...</> : <><Save className="mr-2 h-4 w-4" />Save</>}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {(pages ?? []).map((page) => (
        <Card key={page.id} className="shadow-elegant">
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <h3 className="font-medium text-foreground">{page.title}</h3>
              <p className="text-sm text-muted-foreground capitalize">/{page.slug} · Updated {new Date(page.updated_at).toLocaleDateString()}</p>
            </div>
            <Button variant="outline" size="icon" onClick={() => setEditingPage(page)}>
              <Pencil className="h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

const pageVisibilityItems = [
  { key: "page_events_visible", label: "Events", description: "Show the Events tab in navigation" },
  { key: "page_leaderboard_visible", label: "Leaderboard", description: "Show the Leaderboard tab in navigation" },
  { key: "page_community_visible", label: "Community", description: "Show the Community tab in navigation" },
  { key: "page_shop_visible", label: "Shop", description: "Show the Shop tab in navigation" },
  { key: "page_rewards_visible", label: "Rewards", description: "Show the Rewards tab in navigation" },
];

function PageVisibilitySettings() {
  const { data: visibility, isLoading } = usePageVisibility();
  const updateVisibility = useUpdatePageVisibility();
  const { toast } = useToast();

  const handleToggle = (key: string, checked: boolean) => {
    updateVisibility.mutate({ key, visible: checked }, {
      onSuccess: () => toast({ title: "Updated", description: `Page visibility updated.` }),
      onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
    });
  };

  if (isLoading) return <Loader2 className="mx-auto h-8 w-8 animate-spin" />;

  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Settings className="h-5 w-5" />Page Visibility</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {pageVisibilityItems.map((item) => (
          <div key={item.key} className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">{item.label}</p>
              <p className="text-xs text-muted-foreground">{item.description}</p>
            </div>
            <Switch
              checked={visibility?.[item.key] ?? false}
              onCheckedChange={(checked) => handleToggle(item.key, checked)}
            />
          </div>
        ))}
      </CardContent>
    </Card>
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
function BayConfigTab() {
  const { data: configs, isLoading } = useBayConfig();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<any>(null);

  const handleSave = async () => {
    if (!editing) return;
    const { error } = await supabase
      .from("bay_config")
      .update({
        calendar_email: editing.calendar_email,
        open_time: editing.open_time,
        close_time: editing.close_time,
        is_active: editing.is_active,
      })
      .eq("id", editing.id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Bay config updated" });
    queryClient.invalidateQueries({ queryKey: ["bay_config"] });
    setEditing(null);
  };

  if (isLoading) return <Loader2 className="mx-auto h-8 w-8 animate-spin" />;

  return (
    <div className="space-y-4">
      {(configs ?? []).map((config: any) => (
        <Card key={config.id} className="shadow-elegant">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2"><MapPin className="h-5 w-5" />{config.city}</span>
              <div className="flex items-center gap-2">
                <Badge variant={config.is_active ? "secondary" : "outline"}>
                  {config.is_active ? "Active" : "Inactive"}
                </Badge>
                <Button variant="outline" size="icon" onClick={() => setEditing({ ...config })}>
                  <Pencil className="h-4 w-4" />
                </Button>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p><span className="font-medium">Calendar:</span> {config.calendar_email || "Not set"}</p>
            <p><span className="font-medium">Hours:</span> {config.open_time} – {config.close_time}</p>
          </CardContent>
        </Card>
      ))}

      <Dialog open={!!editing} onOpenChange={(open) => { if (!open) setEditing(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Edit Bay Config — {editing?.city}</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div>
                <Label>Google Calendar Email</Label>
                <Input value={editing.calendar_email || ""} onChange={(e) => setEditing({ ...editing, calendar_email: e.target.value })} placeholder="calendar@gmail.com" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Opening Time</Label>
                  <Input type="time" value={editing.open_time} onChange={(e) => setEditing({ ...editing, open_time: e.target.value })} />
                </div>
                <div>
                  <Label>Closing Time</Label>
                  <Input type="time" value={editing.close_time} onChange={(e) => setEditing({ ...editing, close_time: e.target.value })} />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={editing.is_active} onCheckedChange={(v) => setEditing({ ...editing, is_active: v })} />
                <Label>Active</Label>
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
                <Button onClick={handleSave}>Save</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function BookingLogsTab() {
  const { data: bookings, isLoading } = useAllBookings();
  const [cityFilter, setCityFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const filtered = (bookings ?? []).filter((b: any) => {
    if (cityFilter !== "all" && b.city !== cityFilter) return false;
    if (statusFilter !== "all" && b.status !== statusFilter) return false;
    return true;
  });

  if (isLoading) return <Loader2 className="mx-auto h-8 w-8 animate-spin" />;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ClipboardList className="h-5 w-5" /> Booking Logs
        </CardTitle>
        <div className="flex gap-3 mt-2">
          <Select value={cityFilter} onValueChange={setCityFilter}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Cities</SelectItem>
              <SelectItem value="Chennai">Chennai</SelectItem>
              <SelectItem value="Bengaluru">Bengaluru</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="confirmed">Confirmed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>City</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Time</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No bookings found.</TableCell></TableRow>
            )}
            {filtered.map((b: any) => (
              <TableRow key={b.id}>
                <TableCell className="font-medium">{b.display_name}</TableCell>
                <TableCell>{b.city}</TableCell>
                <TableCell>{format(new Date(b.start_time), "PP")}</TableCell>
                <TableCell>{format(new Date(b.start_time), "h:mm a")} – {format(new Date(b.end_time), "h:mm a")}</TableCell>
                <TableCell>{b.duration_minutes / 60}h</TableCell>
                <TableCell>
                  <Badge variant={b.status === "confirmed" ? "secondary" : "destructive"}>
                    {b.status}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

export default function Admin() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: events, isLoading: loadingEvents } = useEvents();
  const { data: products, isLoading: loadingProducts } = useProducts();
  const { data: rewards, isLoading: loadingRewards } = useRewards();
  const { data: memberHours, isLoading: loadingMembers } = useMemberHours();
  const [editingEvent, setEditingEvent] = useState<any>(null);
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [editingReward, setEditingReward] = useState<any>(null);
  const [adjustingMember, setAdjustingMember] = useState<any>(null);
  const [viewingHistory, setViewingHistory] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState<string | null>(null);
  const [allProfiles, setAllProfiles] = useState<any[]>([]);
  const [viewingPointsHistory, setViewingPointsHistory] = useState<string | null>(null);
  const allocatePoints = useAllocatePoints();
  const redeemPoints = useRedeemPoints();

  // Query all signed-up users with their hours and points
  const { data: allUsers, isLoading: loadingAllUsers } = useQuery({
    queryKey: ["admin_all_users"],
    queryFn: async () => {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, user_id, display_name, email, points, created_at")
        .order("created_at", { ascending: false });
      const { data: hours } = await supabase.from("member_hours").select("*");
      const hoursMap = new Map((hours ?? []).map((h: any) => [h.user_id, h]));
      return (profiles ?? []).map((p: any) => ({
        ...p,
        hours_purchased: hoursMap.get(p.user_id)?.hours_purchased ?? 0,
        hours_used: hoursMap.get(p.user_id)?.hours_used ?? 0,
        hours_remaining: (hoursMap.get(p.user_id)?.hours_purchased ?? 0) - (hoursMap.get(p.user_id)?.hours_used ?? 0),
      }));
    },
  });

  const handleSaveEvent = async (data: any) => {
    const { error } = editingEvent?.id
      ? await supabase.from("events").update(data).eq("id", editingEvent.id)
      : await supabase.from("events").insert(data);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: editingEvent?.id ? "Event updated" : "Event created" });
    queryClient.invalidateQueries({ queryKey: ["events"] });
    setEditingEvent(null);
    setDialogOpen(null);
  };

  const handleSaveProduct = async (data: any) => {
    const { error } = editingProduct?.id
      ? await supabase.from("products").update(data).eq("id", editingProduct.id)
      : await supabase.from("products").insert(data);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: editingProduct?.id ? "Product updated" : "Product created" });
    queryClient.invalidateQueries({ queryKey: ["products"] });
    setEditingProduct(null);
    setDialogOpen(null);
  };

  const handleSaveReward = async (data: any) => {
    const { error } = editingReward?.id
      ? await supabase.from("rewards").update(data).eq("id", editingReward.id)
      : await supabase.from("rewards").insert(data);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: editingReward?.id ? "Reward updated" : "Reward created" });
    queryClient.invalidateQueries({ queryKey: ["rewards"] });
    setEditingReward(null);
    setDialogOpen(null);
  };

  // Load all profiles for member selection
  const loadProfiles = async () => {
    const { data } = await supabase.from("profiles").select("user_id, display_name, email, points");
    setAllProfiles(data ?? []);
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

  const handleAddMember = async (data: any) => {
    const { error } = await supabase.from("member_hours").insert({
      user_id: data.user_id,
      hours_purchased: data.hours_purchased,
      hours_used: 0,
    });
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    // Log transaction
    await supabase.from("hours_transactions").insert({
      user_id: data.user_id,
      type: "purchase",
      hours: data.hours_purchased,
      note: "Initial hours setup",
      created_by: user?.id,
    });
    toast({ title: "Member hours added" });
    queryClient.invalidateQueries({ queryKey: ["member_hours"] });
    setDialogOpen(null);
  };

  const handleAdjustHours = async (data: any) => {
    const member = adjustingMember;
    if (!member) return;
    const newPurchased = data.type === "purchase" || (data.type === "adjustment" && data.hours > 0)
      ? member.hours_purchased + data.hours : member.hours_purchased;
    const newUsed = data.type === "deduction"
      ? member.hours_used + data.hours : member.hours_used;

    const { error } = await supabase.from("member_hours").update({
      hours_purchased: newPurchased,
      hours_used: newUsed,
    }).eq("user_id", member.user_id);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    await supabase.from("hours_transactions").insert({
      user_id: member.user_id,
      type: data.type,
      hours: data.hours,
      note: data.note || null,
      created_by: user?.id,
    });

    // Send in-app notification for deductions
    if (data.type === "deduction") {
      const remaining = newPurchased - newUsed;
      // Usage notification
      await supabase.from("notifications").insert({
        user_id: member.user_id,
        title: "Hours Deducted",
        message: `${data.hours} hour(s) have been deducted. You have ${remaining} hour(s) remaining.${data.note ? ` Note: ${data.note}` : ""}`,
        type: "usage",
      });
      // Low hours alert
      if (remaining <= 3 && remaining > 0) {
        await supabase.from("notifications").insert({
          user_id: member.user_id,
          title: "⚠️ Low Hours Alert",
          message: `You only have ${remaining} hour(s) remaining. Please purchase more hours to continue.`,
          type: "warning",
        });
      } else if (remaining <= 0) {
        await supabase.from("notifications").insert({
          user_id: member.user_id,
          title: "🚨 No Hours Remaining",
          message: "Your hours balance has been fully used. Please purchase more hours.",
          type: "critical",
        });
      }
    }

    toast({ title: "Hours updated" });
    queryClient.invalidateQueries({ queryKey: ["member_hours"] });
    queryClient.invalidateQueries({ queryKey: ["hours_transactions", member.user_id] });
    setAdjustingMember(null);
    setDialogOpen(null);
  };

  const handleDeleteMember = async (userId: string) => {
    await supabase.from("hours_transactions").delete().eq("user_id", userId);
    const { error } = await supabase.from("member_hours").delete().eq("user_id", userId);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Member removed" });
    queryClient.invalidateQueries({ queryKey: ["member_hours"] });
  };

  const handleDelete = async (table: "events" | "products" | "rewards", id: string) => {
    const { error } = await supabase.from(table).delete().eq("id", id);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Deleted successfully" });
    queryClient.invalidateQueries({ queryKey: [table] });
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Navbar />
      <main className="flex-1 py-8">
        <div className="container mx-auto px-4">
          <div className="mb-8">
            <h1 className="font-display text-3xl font-bold text-foreground">Admin Dashboard</h1>
            <p className="mt-1 text-muted-foreground">Manage events, products, rewards, and member hours</p>
          </div>

          <Tabs defaultValue="events" className="space-y-6">
            <TabsList className="flex flex-wrap h-auto gap-1">
              <TabsTrigger value="events" className="gap-2"><Calendar className="h-4 w-4" />Events</TabsTrigger>
              <TabsTrigger value="products" className="gap-2"><ShoppingBag className="h-4 w-4" />Products</TabsTrigger>
              <TabsTrigger value="rewards" className="gap-2"><Gift className="h-4 w-4" />Rewards</TabsTrigger>
              <TabsTrigger value="members" className="gap-2"><Users className="h-4 w-4" />Members</TabsTrigger>
              <TabsTrigger value="allusers" className="gap-2"><UserCheck className="h-4 w-4" />All Users</TabsTrigger>
              <TabsTrigger value="pages" className="gap-2"><FileText className="h-4 w-4" />Pages</TabsTrigger>
              <TabsTrigger value="bayconfig" className="gap-2"><MapPin className="h-4 w-4" />Bay Config</TabsTrigger>
              <TabsTrigger value="bookinglogs" className="gap-2"><ClipboardList className="h-4 w-4" />Booking Logs</TabsTrigger>
              <TabsTrigger value="settings" className="gap-2"><Settings className="h-4 w-4" />Settings</TabsTrigger>
            </TabsList>

            {/* Events Tab */}
            <TabsContent value="events" className="space-y-4">
              <div className="flex justify-end">
                <Dialog open={dialogOpen === "event"} onOpenChange={(open) => { setDialogOpen(open ? "event" : null); if (!open) setEditingEvent(null); }}>
                  <DialogTrigger asChild>
                    <Button onClick={() => setEditingEvent({})}><Plus className="mr-2 h-4 w-4" />Add Event</Button>
                  </DialogTrigger>
                  <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-lg">
                    <DialogHeader><DialogTitle>{editingEvent?.id ? "Edit Event" : "New Event"}</DialogTitle></DialogHeader>
                    <EventForm event={editingEvent} onSave={handleSaveEvent} onCancel={() => { setDialogOpen(null); setEditingEvent(null); }} />
                  </DialogContent>
                </Dialog>
              </div>
              {loadingEvents ? <Loader2 className="mx-auto h-8 w-8 animate-spin" /> : (
                <div className="space-y-3">
                  {(events ?? []).map((event) => (
                    <Card key={event.id} className="shadow-elegant">
                      <CardContent className="flex items-center justify-between p-4">
                        <div>
                          <h3 className="font-medium text-foreground">{event.title}</h3>
                          <p className="text-sm text-muted-foreground">{event.date} · {event.type}</p>
                        </div>
                        <div className="flex gap-2">
                          <Button variant="outline" size="icon" onClick={() => { setEditingEvent(event); setDialogOpen("event"); }}><Pencil className="h-4 w-4" /></Button>
                          <Button variant="outline" size="icon" onClick={() => handleDelete("events", event.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* Products Tab */}
            <TabsContent value="products" className="space-y-4">
              <div className="flex justify-end">
                <Dialog open={dialogOpen === "product"} onOpenChange={(open) => { setDialogOpen(open ? "product" : null); if (!open) setEditingProduct(null); }}>
                  <DialogTrigger asChild>
                    <Button onClick={() => setEditingProduct({})}><Plus className="mr-2 h-4 w-4" />Add Product</Button>
                  </DialogTrigger>
                  <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-lg">
                    <DialogHeader><DialogTitle>{editingProduct?.id ? "Edit Product" : "New Product"}</DialogTitle></DialogHeader>
                    <ProductForm product={editingProduct} onSave={handleSaveProduct} onCancel={() => { setDialogOpen(null); setEditingProduct(null); }} />
                  </DialogContent>
                </Dialog>
              </div>
              {loadingProducts ? <Loader2 className="mx-auto h-8 w-8 animate-spin" /> : (
                <div className="space-y-3">
                  {(products ?? []).map((product) => (
                    <Card key={product.id} className="shadow-elegant">
                      <CardContent className="flex items-center justify-between p-4">
                        <div>
                          <h3 className="font-medium text-foreground">{product.name}</h3>
                          <p className="text-sm text-muted-foreground">${Number(product.price).toFixed(2)} · {product.type} · {product.category}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          {!product.in_stock && <Badge variant="secondary">Out of stock</Badge>}
                          <Button variant="outline" size="icon" onClick={() => { setEditingProduct(product); setDialogOpen("product"); }}><Pencil className="h-4 w-4" /></Button>
                          <Button variant="outline" size="icon" onClick={() => handleDelete("products", product.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* Rewards Tab */}
            <TabsContent value="rewards" className="space-y-4">
              <div className="flex justify-end">
                <Dialog open={dialogOpen === "reward"} onOpenChange={(open) => { setDialogOpen(open ? "reward" : null); if (!open) setEditingReward(null); }}>
                  <DialogTrigger asChild>
                    <Button onClick={() => setEditingReward({})}><Plus className="mr-2 h-4 w-4" />Add Reward</Button>
                  </DialogTrigger>
                  <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-lg">
                    <DialogHeader><DialogTitle>{editingReward?.id ? "Edit Reward" : "New Reward"}</DialogTitle></DialogHeader>
                    <RewardForm reward={editingReward} onSave={handleSaveReward} onCancel={() => { setDialogOpen(null); setEditingReward(null); }} />
                  </DialogContent>
                </Dialog>
              </div>
              {loadingRewards ? <Loader2 className="mx-auto h-8 w-8 animate-spin" /> : (
                <div className="space-y-3">
                  {(rewards ?? []).map((reward) => (
                    <Card key={reward.id} className="shadow-elegant">
                      <CardContent className="flex items-center justify-between p-4">
                        <div>
                          <h3 className="font-medium text-foreground">{reward.name}</h3>
                          <p className="text-sm text-muted-foreground">{reward.points_cost} pts · {reward.is_available ? "Available" : "Unavailable"}</p>
                        </div>
                        <div className="flex gap-2">
                          <Button variant="outline" size="icon" onClick={() => { setEditingReward(reward); setDialogOpen("reward"); }}><Pencil className="h-4 w-4" /></Button>
                          <Button variant="outline" size="icon" onClick={() => handleDelete("rewards", reward.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* Members Tab */}
            <TabsContent value="members" className="space-y-4">
              <div className="flex justify-end">
                <Dialog open={dialogOpen === "member"} onOpenChange={(open) => { setDialogOpen(open ? "member" : null); }}>
                  <DialogTrigger asChild>
                    <Button onClick={() => { loadProfiles(); }}><Plus className="mr-2 h-4 w-4" />Add Member Hours</Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-md">
                    <DialogHeader><DialogTitle>Add Member Hours</DialogTitle></DialogHeader>
                    <MemberHoursForm profiles={allProfiles} onSave={handleAddMember} onCancel={() => setDialogOpen(null)} />
                  </DialogContent>
                </Dialog>
              </div>

              {/* Adjust Hours Dialog */}
              <Dialog open={dialogOpen === "adjust"} onOpenChange={(open) => { setDialogOpen(open ? "adjust" : null); if (!open) setAdjustingMember(null); }}>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader><DialogTitle>Adjust Hours</DialogTitle></DialogHeader>
                  {adjustingMember && <AdjustHoursForm member={adjustingMember} onSave={handleAdjustHours} onCancel={() => { setDialogOpen(null); setAdjustingMember(null); }} />}
                </DialogContent>
              </Dialog>

              {/* Transaction History Dialog */}
              <Dialog open={dialogOpen === "history"} onOpenChange={(open) => { setDialogOpen(open ? "history" : null); if (!open) setViewingHistory(null); }}>
                <DialogContent className="sm:max-w-lg">
                  <DialogHeader><DialogTitle>Transaction History</DialogTitle></DialogHeader>
                  {viewingHistory && <TransactionHistory userId={viewingHistory} />}
                </DialogContent>
              </Dialog>

              {loadingMembers ? <Loader2 className="mx-auto h-8 w-8 animate-spin" /> : (
                <div className="space-y-3">
                  {(memberHours ?? []).length === 0 && <p className="text-center text-muted-foreground py-8">No members with hours packages yet.</p>}
                  {(memberHours ?? []).map((member) => {
                    const remaining = member.hours_purchased - member.hours_used;
                    return (
                      <Card key={member.id} className="shadow-elegant">
                        <CardContent className="flex items-center justify-between p-4">
                          <div>
                            <h3 className="font-medium text-foreground">{member.display_name}</h3>
                            <div className="flex gap-3 text-sm text-muted-foreground">
                              <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {remaining} hrs remaining</span>
                              <span>Purchased: {member.hours_purchased} hrs</span>
                              <span>Used: {member.hours_used} hrs</span>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Button variant="outline" size="sm" onClick={() => { setAdjustingMember(member); setDialogOpen("adjust"); }}>
                              <MinusCircle className="mr-1 h-4 w-4" />Adjust
                            </Button>
                            <Button variant="outline" size="icon" onClick={() => { setViewingHistory(member.user_id); setDialogOpen("history"); }}>
                              <History className="h-4 w-4" />
                            </Button>
                            <Button variant="outline" size="icon" onClick={() => handleDeleteMember(member.user_id)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            {/* All Users Tab */}
            <TabsContent value="allusers" className="space-y-4">
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
                      const { error } = await supabase.from("profiles").insert({
                        display_name: data.display_name,
                        email: data.email,
                      });
                      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
                      toast({ title: "User pre-registered", description: `${data.display_name} will be linked when they sign in with ${data.email}.` });
                      queryClient.invalidateQueries({ queryKey: ["admin_all_users"] });
                      setDialogOpen(null);
                    }} onCancel={() => setDialogOpen(null)} />
                  </DialogContent>
                </Dialog>
              </div>

              {/* Points History Dialog */}
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
                  {loadingAllUsers ? <Loader2 className="mx-auto h-8 w-8 animate-spin" /> : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Points</TableHead>
                          <TableHead className="text-right">Hours Balance</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(allUsers ?? []).length === 0 && (
                          <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No users found.</TableCell></TableRow>
                        )}
                        {(allUsers ?? []).map((u: any) => (
                          <TableRow key={u.id || u.user_id}>
                            <TableCell className="font-medium">{u.display_name || "Unknown"}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{u.email || "—"}</TableCell>
                            <TableCell>
                              <Badge variant={u.user_id ? "secondary" : "outline"}>
                                {u.user_id ? "Active" : "Pending"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <Badge variant="default">{u.points ?? 0} pts</Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <Badge variant={u.hours_remaining <= 3 ? "destructive" : "secondary"}>
                                {u.hours_remaining} hrs
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              {u.user_id && (
                                <Button variant="ghost" size="icon" onClick={() => { setViewingPointsHistory(u.user_id); setDialogOpen("pointshistory"); }}>
                                  <History className="h-4 w-4" />
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Pages Tab */}
            <TabsContent value="pages" className="space-y-4">
              <PageContentEditor />
            </TabsContent>

            {/* Bay Config Tab */}
            <TabsContent value="bayconfig" className="space-y-4">
              <BayConfigTab />
            </TabsContent>

            {/* Booking Logs Tab */}
            <TabsContent value="bookinglogs" className="space-y-4">
              <BookingLogsTab />
            </TabsContent>

            {/* Settings Tab */}
            <TabsContent value="settings" className="space-y-4">
              <PageVisibilitySettings />
              <ChangePasswordCard />
            </TabsContent>
          </Tabs>
        </div>
      </main>
      <Footer />
    </div>
  );
}
