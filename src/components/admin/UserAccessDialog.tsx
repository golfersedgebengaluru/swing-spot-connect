import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useAllCities } from "@/hooks/useBookings";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Loader2, ShieldCheck, Shield, GraduationCap, MapPin } from "lucide-react";

interface Props {
  user: { user_id?: string | null; display_name?: string | null; email?: string | null } | null;
  open: boolean;
  onClose: () => void;
}

type RoleKey = "admin" | "site_admin" | "coach";

export function UserAccessDialog({ user, open, onClose }: Props) {
  const authUserId = user?.user_id || null;
  const { user: me } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: allCities } = useAllCities();

  const [admin, setAdmin] = useState(false);
  const [siteAdmin, setSiteAdmin] = useState(false);
  const [coach, setCoach] = useState(false);
  const [cities, setCities] = useState<string[]>([]);
  const [initial, setInitial] = useState({ admin: false, siteAdmin: false, coach: false, cities: [] as string[] });
  const [saving, setSaving] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["user-access", authUserId],
    enabled: !!authUserId && open,
    queryFn: async () => {
      const [{ data: roles }, { data: cityRows }] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", authUserId!),
        supabase.from("site_admin_cities" as any).select("city").eq("user_id", authUserId!),
      ]);
      const roleSet = new Set((roles ?? []).map((r: any) => r.role as string));
      return {
        admin: roleSet.has("admin"),
        siteAdmin: roleSet.has("site_admin"),
        coach: roleSet.has("coach"),
        cities: (cityRows ?? []).map((c: any) => c.city as string),
      };
    },
  });

  useEffect(() => {
    if (data) {
      setAdmin(data.admin);
      setSiteAdmin(data.siteAdmin);
      setCoach(data.coach);
      setCities(data.cities);
      setInitial(data);
    }
  }, [data]);

  const toggleCity = (city: string) =>
    setCities((prev) => (prev.includes(city) ? prev.filter((c) => c !== city) : [...prev, city]));

  const invoke = (body: any) => supabase.functions.invoke("manage-roles", { body });

  const save = async () => {
    if (!authUserId) return;
    setSaving(true);
    try {
      const ops: Promise<any>[] = [];
      const diff = (role: RoleKey, want: boolean, had: boolean) => {
        if (want === had) return;
        ops.push(invoke({ action: want ? "grant" : "revoke", user_id: authUserId, role }));
      };
      diff("admin", admin, initial.admin);
      diff("coach", coach, initial.coach);

      const cityChanged =
        siteAdmin !== initial.siteAdmin ||
        cities.length !== initial.cities.length ||
        cities.some((c) => !initial.cities.includes(c));

      if (siteAdmin && cityChanged) {
        if (cities.length === 0) {
          toast({ title: "Pick at least one instance", description: "Site-admins must be scoped to a city.", variant: "destructive" });
          setSaving(false);
          return;
        }
        // grant with cities is atomic + replaces assignments
        ops.push(invoke({ action: "grant", user_id: authUserId, role: "site_admin", cities }));
      } else if (!siteAdmin && initial.siteAdmin) {
        ops.push(invoke({ action: "revoke", user_id: authUserId, role: "site_admin" }));
      }

      const results = await Promise.all(ops);
      for (const r of results) {
        if (r.error) throw r.error;
        if (r.data?.error) throw new Error(r.data.error);
      }

      toast({ title: "Access updated", description: user?.display_name || user?.email || "User" });
      qc.invalidateQueries({ queryKey: ["admin-roles"] });
      qc.invalidateQueries({ queryKey: ["site-admin-cities"] });
      qc.invalidateQueries({ queryKey: ["user-access", authUserId] });
      qc.invalidateQueries({ queryKey: ["user-profile-roles", authUserId] });
      onClose();
    } catch (err: any) {
      toast({ title: "Error", description: err.message ?? "Failed to update access", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (!user) return null;

  if (!authUserId) {
    return (
      <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
        <DialogContent>
          <DialogHeader><DialogTitle>Manage Access</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground py-4">
            This is a profile-only member (no auth account). Roles can only be assigned to users who sign in.
          </p>
        </DialogContent>
      </Dialog>
    );
  }

  const isSelf = me?.id === authUserId;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Manage Access — {user.display_name || user.email}</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="space-y-4 py-2">
            <RoleRow
              icon={ShieldCheck}
              label="Admin"
              desc="Full access across all instances"
              checked={admin}
              onChange={setAdmin}
              disabled={isSelf && initial.admin}
              disabledHint={isSelf && initial.admin ? "Cannot revoke your own admin role" : undefined}
            />
            <RoleRow
              icon={Shield}
              label="Site-Admin"
              desc="Full access to assigned instances"
              checked={siteAdmin}
              onChange={(v) => { setSiteAdmin(v); if (!v) setCities([]); }}
            />
            {siteAdmin && (
              <div className="ml-8 rounded-md border border-border p-3 space-y-2">
                <Label className="text-xs flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" />Assigned Instances</Label>
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {(allCities ?? []).map((c) => (
                    <label key={c} className="flex items-center gap-2 cursor-pointer text-sm">
                      <Checkbox checked={cities.includes(c)} onCheckedChange={() => toggleCity(c)} />
                      <span>{c}</span>
                    </label>
                  ))}
                  {(!allCities || allCities.length === 0) && (
                    <p className="text-xs text-muted-foreground">No instances configured.</p>
                  )}
                </div>
              </div>
            )}
            <Separator />
            <RoleRow
              icon={GraduationCap}
              label="Coach"
              desc="Can view & manage assigned students and coaching sessions"
              checked={coach}
              onChange={setCoach}
            />
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving || isLoading}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RoleRow({
  icon: Icon, label, desc, checked, onChange, disabled, disabledHint,
}: {
  icon: typeof Shield;
  label: string;
  desc: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  disabledHint?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-md border border-border p-3">
      <div className="flex gap-3 min-w-0">
        <Icon className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
        <div className="min-w-0">
          <div className="font-medium text-sm">{label}</div>
          <div className="text-xs text-muted-foreground">{desc}</div>
          {disabled && disabledHint && (
            <div className="text-xs text-amber-600 dark:text-amber-400 mt-1">{disabledHint}</div>
          )}
        </div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </div>
  );
}
