import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Mail, Clock, KeyRound, Settings, Save, Loader2, CalendarDays, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { usePageVisibility, useUpdatePageVisibility } from "@/hooks/usePageVisibility";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { AdminRolesManager } from "@/components/admin/AdminRolesManager";
import { EmailTemplatesEditor } from "@/components/admin/EmailTemplatesEditor";
import { BrandingSettingsCard } from "@/components/admin/BrandingSettingsCard";
import { OfflinePaymentMethodsCard } from "@/components/admin/OfflinePaymentMethodsCard";
import { AdminFinancialYearsCard } from "@/components/admin/AdminFinancialYearsCard";
import { usePerCityFyToggle, useUpdatePerCityFyToggle } from "@/hooks/useRevenue";
import { ProductCategoriesCard } from "@/components/admin/ProductCategoriesCard";
import { UnitOfMeasureCard } from "@/components/admin/UnitOfMeasureCard";
import { InvoiceSettingsCard } from "@/components/admin/InvoiceSettingsCard";
import { VendorsCard } from "@/components/admin/VendorsCard";
import { ExpenseCategoriesCard } from "@/components/admin/ExpenseCategoriesCard";
import { SiteAdminPermissionsCard } from "@/components/admin/SiteAdminPermissionsCard";

const pageVisibilityItems = [
  { key: "page_events_visible", label: "Events", description: "Show the Events tab in navigation" },
  { key: "page_leaderboard_visible", label: "Leaderboard", description: "Show the Leaderboard tab in navigation" },
  { key: "page_community_visible", label: "Community", description: "Show the Community tab in navigation" },
  { key: "page_shop_visible", label: "Shop", description: "Show the Shop tab in navigation" },
  { key: "page_rewards_visible", label: "Rewards", description: "Show the Rewards tab in navigation" },
];

const dashboardWidgetItems = [
  { key: "dashboard_handicap_visible", label: "Current Handicap", description: "Show handicap stat on member dashboard" },
  { key: "dashboard_hours_balance_visible", label: "Hours Balance", description: "Show hours balance stat on member dashboard" },
  { key: "dashboard_leaderboard_rank_visible", label: "Leaderboard Rank", description: "Show leaderboard rank stat on member dashboard" },
  { key: "dashboard_reward_points_visible", label: "Reward Points", description: "Show reward points stat on member dashboard" },
  { key: "dashboard_recent_visits_visible", label: "Recent Visits", description: "Show recent visits section on member dashboard" },
  { key: "dashboard_edge_rewards_visible", label: "EDGE Rewards Dashboard", description: "Show the full EDGE Rewards dashboard on the Rewards page" },
];

function PageVisibilitySettings() {
  const { data: visibility, isLoading } = usePageVisibility();
  const updateVisibility = useUpdatePageVisibility();
  const { toast } = useToast();

  const handleToggle = (key: string, checked: boolean) => {
    updateVisibility.mutate({ key, visible: checked }, {
      onSuccess: () => toast({ title: "Updated", description: "Page visibility updated." }),
      onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
    });
  };

  if (isLoading) return <Loader2 className="mx-auto h-8 w-8 animate-spin" />;

  return (
    <div className="space-y-6">
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

      <Card className="max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Settings className="h-5 w-5" />Dashboard Widgets</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {dashboardWidgetItems.map((item) => (
            <div key={item.key} className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">{item.label}</p>
                <p className="text-xs text-muted-foreground">{item.description}</p>
              </div>
              <Switch
                checked={visibility?.[item.key] ?? true}
                onCheckedChange={(checked) => handleToggle(item.key, checked)}
              />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function SenderEmailCard() {
  const { toast } = useToast();
  const [senderEmail, setSenderEmail] = useState("");
  const [senderName, setSenderName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const queryClient = useQueryClient();

  const { data: emailConfig, isLoading: loadingEmail } = useQuery({
    queryKey: ["admin_config", "sender_email"],
    queryFn: async () => {
      const { data } = await supabase
        .from("admin_config")
        .select("value")
        .eq("key", "sender_email")
        .single();
      return data?.value || "";
    },
  });

  const { data: nameConfig, isLoading: loadingName } = useQuery({
    queryKey: ["admin_config", "sender_name"],
    queryFn: async () => {
      const { data } = await supabase
        .from("admin_config")
        .select("value")
        .eq("key", "sender_name")
        .single();
      return data?.value || "";
    },
  });

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const emailVal = senderEmail || emailConfig || "";
    const nameVal = senderName || nameConfig || "";
    if (!emailVal.includes("@")) {
      toast({ title: "Error", description: "Please enter a valid email address", variant: "destructive" });
      return;
    }
    if (!nameVal.trim()) {
      toast({ title: "Error", description: "Please enter a sender name", variant: "destructive" });
      return;
    }
    setIsSubmitting(true);
    try {
      const { error: e1 } = await supabase
        .from("admin_config")
        .update({ value: emailVal })
        .eq("key", "sender_email");
      if (e1) throw e1;
      const { error: e2 } = await supabase
        .from("admin_config")
        .update({ value: nameVal })
        .eq("key", "sender_name");
      if (e2) throw e2;
      queryClient.invalidateQueries({ queryKey: ["admin_config", "sender_email"] });
      queryClient.invalidateQueries({ queryKey: ["admin_config", "sender_name"] });
      toast({ title: "Saved", description: "Sender settings updated successfully." });
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to update sender settings", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loadingEmail || loadingName) return <Loader2 className="mx-auto h-8 w-8 animate-spin" />;

  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Mail className="h-5 w-5" />Notification Sender Settings</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <Label htmlFor="sender-name">From Name</Label>
            <Input
              id="sender-name"
              type="text"
              placeholder="Golfer's Edge"
              defaultValue={nameConfig || ""}
              onChange={(e) => setSenderName(e.target.value)}
              className="mt-1"
              required
            />
            <p className="text-xs text-muted-foreground mt-1">The display name shown in the recipient's inbox (e.g. "Golfer's Edge").</p>
          </div>
          <div>
            <Label htmlFor="sender-email">From Address</Label>
            <Input
              id="sender-email"
              type="email"
              placeholder="notify@golfersedge.in"
              defaultValue={emailConfig || ""}
              onChange={(e) => setSenderEmail(e.target.value)}
              className="mt-1"
              required
            />
            <p className="text-xs text-muted-foreground mt-1">This must be a verified domain in your email provider.</p>
          </div>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving...</> : <><Save className="mr-2 h-4 w-4" />Save</>}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function EmailRateLimitCard() {
  const { toast } = useToast();
  const [rateLimit, setRateLimit] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const queryClient = useQueryClient();

  const { data: config, isLoading } = useQuery({
    queryKey: ["admin_config", "email_rate_limit_per_hour"],
    queryFn: async () => {
      const { data } = await supabase
        .from("admin_config")
        .select("value")
        .eq("key", "email_rate_limit_per_hour")
        .single();
      return data?.value || "10";
    },
  });

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseInt(rateLimit || config || "10", 10);
    if (isNaN(val) || val < 1) {
      toast({ title: "Error", description: "Please enter a valid number (minimum 1)", variant: "destructive" });
      return;
    }
    setIsSubmitting(true);
    try {
      const { error } = await supabase
        .from("admin_config")
        .update({ value: String(val) })
        .eq("key", "email_rate_limit_per_hour");
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["admin_config", "email_rate_limit_per_hour"] });
      toast({ title: "Saved", description: "Email rate limit updated." });
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to update", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) return <Loader2 className="mx-auto h-8 w-8 animate-spin" />;

  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Clock className="h-5 w-5" />Email Rate Limit</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <Label htmlFor="rate-limit">Max emails per user per hour</Label>
            <Input
              id="rate-limit"
              type="number"
              min={1}
              placeholder="10"
              defaultValue={config || "10"}
              onChange={(e) => setRateLimit(e.target.value)}
              className="mt-1"
              required
            />
            <p className="text-xs text-muted-foreground mt-1">
              Critical emails (booking confirmations, cancellations, coaching approvals) are exempt from this limit.
            </p>
          </div>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving...</> : <><Save className="mr-2 h-4 w-4" />Save</>}
          </Button>
        </form>
      </CardContent>
    </Card>
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

function CancellationWindowCard() {
  const { toast } = useToast();
  const [windowHours, setWindowHours] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const queryClient = useQueryClient();

  const { data: config, isLoading } = useQuery({
    queryKey: ["admin_config", "cancellation_window_hours"],
    queryFn: async () => {
      const { data } = await supabase
        .from("admin_config")
        .select("value")
        .eq("key", "cancellation_window_hours")
        .single();
      return data?.value || "24";
    },
  });

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(windowHours || config || "24");
    if (isNaN(val) || val < 0) {
      toast({ title: "Error", description: "Please enter a valid number (minimum 0)", variant: "destructive" });
      return;
    }
    setIsSubmitting(true);
    try {
      const { error } = await supabase
        .from("admin_config")
        .update({ value: String(val) })
        .eq("key", "cancellation_window_hours");
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["admin_config", "cancellation_window_hours"] });
      toast({ title: "Saved", description: "Cancellation window updated." });
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to update", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) return <Loader2 className="mx-auto h-8 w-8 animate-spin" />;

  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Clock className="h-5 w-5" />Cancellation Window</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <Label htmlFor="cancel-window">Minimum hours before booking start</Label>
            <Input
              id="cancel-window"
              type="number"
              min={0}
              step="0.5"
              placeholder="24"
              defaultValue={config || "24"}
              onChange={(e) => setWindowHours(e.target.value)}
              className="mt-1"
              required
            />
            <p className="text-xs text-muted-foreground mt-1">
              Users must cancel at least this many hours before the booking start time. Set to 0 to allow cancellations anytime.
            </p>
          </div>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving...</> : <><Save className="mr-2 h-4 w-4" />Save</>}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function FinancialYearSettingsSection() {
  const { toast } = useToast();
  const { data: toggleEnabled, isLoading } = usePerCityFyToggle();
  const updateToggle = useUpdatePerCityFyToggle();

  const handleToggle = (checked: boolean) => {
    updateToggle.mutate(checked, {
      onSuccess: () => toast({ title: "Updated", description: checked ? "Per-city financial year overrides enabled." : "Per-city overrides disabled. Global FY applies to all instances." }),
      onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
    });
  };

  if (isLoading) return <Loader2 className="mx-auto h-8 w-8 animate-spin" />;

  return (
    <div className="space-y-4">
      <AdminFinancialYearsCard title="Global Financial Years" />
      <Card className="max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5" /> Per-City Override
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">Allow per-city financial year override</p>
              <p className="text-xs text-muted-foreground mt-1">
                When enabled, Site-Admins can set a financial year specific to their instance. If no override is set, the global FY is used as fallback.
              </p>
            </div>
            <Switch checked={toggleEnabled ?? false} onCheckedChange={handleToggle} disabled={updateToggle.isPending} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function LowHoursThresholdCard() {
  const { toast } = useToast();
  const [threshold, setThreshold] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const queryClient = useQueryClient();

  const { data: config, isLoading } = useQuery({
    queryKey: ["admin_config", "low_hours_threshold"],
    queryFn: async () => {
      const { data } = await supabase
        .from("admin_config")
        .select("value")
        .eq("key", "low_hours_threshold")
        .single();
      return data?.value || "2";
    },
  });

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(threshold || config || "2");
    if (isNaN(val) || val < 0) {
      toast({ title: "Error", description: "Please enter a valid number (minimum 0)", variant: "destructive" });
      return;
    }
    setIsSubmitting(true);
    try {
      const { error } = await supabase
        .from("admin_config")
        .update({ value: String(val) })
        .eq("key", "low_hours_threshold");
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["admin_config", "low_hours_threshold"] });
      toast({ title: "Saved", description: "Low hours threshold updated." });
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to update", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) return <Loader2 className="mx-auto h-8 w-8 animate-spin" />;

  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5" />Low Hours Alert Threshold</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <Label htmlFor="low-hours">Trigger alert when remaining hours drop below</Label>
            <Input
              id="low-hours"
              type="number"
              min={0}
              step="0.5"
              placeholder="2"
              defaultValue={config || "2"}
              onChange={(e) => setThreshold(e.target.value)}
              className="mt-1"
              required
            />
            <p className="text-xs text-muted-foreground mt-1">
              An email notification will be sent to the member when their remaining hours fall below this number after any deduction.
            </p>
          </div>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving...</> : <><Save className="mr-2 h-4 w-4" />Save</>}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export function AdminSettingsTab() {
  return (
    <div className="space-y-6">
      <BrandingSettingsCard />
      <SiteAdminPermissionsCard />
      <AdminRolesManager />
      <FinancialYearSettingsSection />
      <InvoiceSettingsCard />
      <PageVisibilitySettings />
      <ProductCategoriesCard />
      <UnitOfMeasureCard />
      <VendorsCard />
      <ExpenseCategoriesCard />
      <OfflinePaymentMethodsCard />
      <CancellationWindowCard />
      <LowHoursThresholdCard />
      <SenderEmailCard />
      <EmailRateLimitCard />
      <EmailTemplatesEditor />
      <ChangePasswordCard />
    </div>
  );
}
