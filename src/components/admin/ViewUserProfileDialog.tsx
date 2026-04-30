import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Loader2, Pencil, Shield, ShieldCheck, Users, MapPin, Clock, Star, Mail, Phone, Calendar, User as UserIcon } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { UserCoachAssignment } from "./UserCoachAssignment";

interface Props {
  user: any | null;
  onClose: () => void;
  onEdit: () => void;
}

const ROLE_META: Record<string, { label: string; color: "default" | "secondary" | "destructive" | "outline"; Icon: typeof Shield }> = {
  admin: { label: "Admin", color: "destructive", Icon: ShieldCheck },
  site_admin: { label: "Site-Admin", color: "default", Icon: Shield },
  user: { label: "User", color: "secondary", Icon: Users },
};

const USER_TYPE_LABELS: Record<string, string> = {
  member: "Member",
  registered: "Registered",
  "non-registered": "Guest",
  birdie: "Birdie Member",
  coaching: "Coaching Member",
  guest: "Pre-registered",
};

function getInitials(name?: string | null) {
  if (!name) return "?";
  return name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
}

export function ViewUserProfileDialog({ user, onClose, onEdit }: Props) {
  const authUserId: string | null = user?.user_id || null;

  const { data: roleInfo, isLoading: rolesLoading } = useQuery({
    queryKey: ["user-profile-roles", authUserId],
    enabled: !!authUserId,
    queryFn: async () => {
      const [{ data: roles }, { data: cities }] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", authUserId!),
        supabase.from("site_admin_cities" as any).select("city").eq("user_id", authUserId!),
      ]);
      return {
        roles: (roles ?? []).map((r: any) => r.role as string),
        cities: (cities ?? []).map((c: any) => c.city as string),
      };
    },
  });

  if (!user) return null;

  const roles = roleInfo?.roles ?? [];
  const cities = roleInfo?.cities ?? [];
  const hasAuthAccount = !!authUserId;
  const userTypeLabel = USER_TYPE_LABELS[user.user_type || "registered"] || user.user_type || "Registered";
  const hoursPurchased = user.hours_purchased ?? 0;
  const hoursUsed = user.hours_used ?? 0;
  const hoursRemaining = user.hours_remaining ?? hoursPurchased - hoursUsed;

  return (
    <Dialog open={!!user} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <div className="flex items-center justify-between gap-2">
            <DialogTitle>User Profile</DialogTitle>
            <Button variant="outline" size="sm" onClick={onEdit}>
              <Pencil className="mr-2 h-4 w-4" /> Edit
            </Button>
          </div>
        </DialogHeader>

        {/* ── Identity ── */}
        <div className="flex items-center gap-4 pt-2">
          <Avatar className="h-16 w-16">
            <AvatarFallback className="bg-primary/10 text-primary text-lg">
              {getInitials(user.display_name)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-medium truncate">{user.display_name || "Unknown"}</h3>
            <div className="mt-1 flex flex-wrap gap-1.5">
              <Badge variant="secondary" className="text-xs">{userTypeLabel}</Badge>
              {!hasAuthAccount && (
                <Badge variant="outline" className="text-xs">Profile-only</Badge>
              )}
              {user.extended_hours_access && (
                <Badge variant="outline" className="text-xs gap-1 border-primary/30 text-primary">
                  <Clock className="h-3 w-3" /> Extended hours
                </Badge>
              )}
            </div>
          </div>
        </div>

        <Separator />

        {/* ── Contact ── */}
        <section className="space-y-3">
          <h4 className="text-sm font-medium text-foreground">Contact</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <InfoRow icon={Mail} label="Email" value={user.email} />
            <InfoRow icon={Phone} label="Phone" value={user.phone} />
            <InfoRow icon={MapPin} label="Preferred City" value={user.preferred_city} />
            <InfoRow
              icon={Calendar}
              label="Joined"
              value={user.created_at ? new Date(user.created_at).toLocaleDateString() : null}
            />
          </div>
        </section>

        <Separator />

        {/* ── Balances ── */}
        <section className="space-y-3">
          <h4 className="text-sm font-medium text-foreground">Balances</h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <Stat label="Points" value={`${user.points ?? 0}`} icon={Star} tone="purple" />
            <Stat label="Hours Remaining" value={`${hoursRemaining} hrs`} icon={Clock} tone={hoursRemaining <= 1 ? "red" : hoursRemaining <= 3 ? "amber" : "green"} />
            <Stat label="Hours Used" value={`${hoursUsed} / ${hoursPurchased}`} icon={Clock} tone="muted" />
          </div>
        </section>

        <Separator />

        {/* ── Permissions & Roles ── */}
        <section className="space-y-3">
          <h4 className="text-sm font-medium text-foreground">Permissions & Roles</h4>
          {!hasAuthAccount ? (
            <p className="text-sm text-muted-foreground">
              This is a profile-only member (no auth account). Roles can only be assigned to users who sign in.
            </p>
          ) : rolesLoading ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : roles.length === 0 ? (
            <div className="rounded-md border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <UserIcon className="h-4 w-4" />
                Standard user — no elevated permissions.
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-1.5">
                {roles.map((role) => {
                  const meta = ROLE_META[role] ?? ROLE_META.user;
                  const Icon = meta.Icon;
                  return (
                    <Badge key={role} variant={meta.color} className="gap-1">
                      <Icon className="h-3 w-3" />
                      {meta.label}
                    </Badge>
                  );
                })}
              </div>
              {roles.includes("site_admin") && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Assigned instances:</p>
                  {cities.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {cities.map((c) => (
                        <Badge key={c} variant="outline" className="text-xs gap-1">
                          <MapPin className="h-3 w-3" /> {c}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">No instances assigned.</p>
                  )}
                </div>
              )}
              {roles.includes("admin") && (
                <p className="text-xs text-muted-foreground">Has full access across all instances.</p>
              )}
            </div>
          )}
        </section>

        <Separator />

        {/* ── Coaching ── */}
        {user.id && (
          <>
            <section>
              <UserCoachAssignment
                studentProfileId={user.id}
                studentLabel={user.display_name || "This user"}
              />
            </section>
            <Separator />
          </>
        )}

        {/* ── Access Flags ── */}
        <section className="space-y-3">
          <h4 className="text-sm font-medium text-foreground">Access Flags</h4>
          <div className="space-y-1.5 text-sm">
            <FlagRow label="Extended hours access" enabled={!!user.extended_hours_access} />
            <FlagRow label="Auth account linked" enabled={hasAuthAccount} />
          </div>
        </section>
      </DialogContent>
    </Dialog>
  );
}

// ─── Helpers ──────────────────────────────────────────────────

function InfoRow({ icon: Icon, label, value }: { icon: typeof Mail; label: string; value?: string | null }) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="font-medium truncate">{value || "—"}</p>
      </div>
    </div>
  );
}

function Stat({ label, value, icon: Icon, tone }: { label: string; value: string; icon: typeof Star; tone: "purple" | "green" | "amber" | "red" | "muted" }) {
  const toneClass = {
    purple: "bg-purple-500/15 text-purple-400",
    green: "bg-green-500/15 text-green-400",
    amber: "bg-amber-500/15 text-amber-400",
    red: "bg-red-500/15 text-red-400",
    muted: "bg-muted text-muted-foreground",
  }[tone];
  return (
    <div className="rounded-lg border border-border p-3">
      <div className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${toneClass}`}>
        <Icon className="h-3 w-3" /> {label}
      </div>
      <p className="mt-2 text-lg font-semibold">{value}</p>
    </div>
  );
}

function FlagRow({ label, enabled }: { label: string; enabled: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
      <span>{label}</span>
      <Badge variant={enabled ? "default" : "secondary"} className="text-xs">
        {enabled ? "Enabled" : "Disabled"}
      </Badge>
    </div>
  );
}
