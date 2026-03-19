import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Shield, ShieldCheck, UserPlus, Trash2, Users } from "lucide-react";

type RoleEntry = { user_id: string; role: string };

const ROLE_COLORS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  admin: "destructive",
  moderator: "default",
  user: "secondary",
};

const ROLE_ICONS: Record<string, typeof Shield> = {
  admin: ShieldCheck,
  moderator: Shield,
  user: Users,
};

export function AdminRolesManager() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [grantEmail, setGrantEmail] = useState("");
  const [grantRole, setGrantRole] = useState<string>("moderator");
  const [dialogOpen, setDialogOpen] = useState(false);

  // Fetch all roles
  const { data: rolesData, isLoading: loadingRoles } = useQuery({
    queryKey: ["admin-roles"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("manage-roles", {
        body: { action: "list", user_id: "dummy", role: "admin" },
      });
      if (error) throw error;
      return data.roles as RoleEntry[];
    },
  });

  // Fetch all profiles to map user_id → display_name/email
  const { data: profiles } = useQuery({
    queryKey: ["all-profiles-for-roles"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("user_id, display_name, email");
      return data ?? [];
    },
  });

  const profileMap = new Map(
    (profiles ?? []).map((p) => [p.user_id, { name: p.display_name, email: p.email }])
  );

  // Group roles by user
  const userRolesMap = new Map<string, string[]>();
  (rolesData ?? []).forEach((r) => {
    const existing = userRolesMap.get(r.user_id) ?? [];
    existing.push(r.role);
    userRolesMap.set(r.user_id, existing);
  });

  const handleGrant = async () => {
    if (!grantEmail.trim()) return;
    setIsSubmitting(true);
    try {
      // Find user_id by email from profiles
      const { data: profile } = await supabase
        .from("profiles")
        .select("user_id")
        .eq("email", grantEmail.trim().toLowerCase())
        .not("user_id", "is", null)
        .single();

      if (!profile?.user_id) {
        toast({ title: "User not found", description: "No registered user found with that email.", variant: "destructive" });
        return;
      }

      const { data, error } = await supabase.functions.invoke("manage-roles", {
        body: { action: "grant", user_id: profile.user_id, role: grantRole },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast({ title: "Role granted", description: `${grantRole} role granted to ${grantEmail}` });
      setGrantEmail("");
      setDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ["admin-roles"] });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRevoke = async (userId: string, role: string) => {
    try {
      const { data, error } = await supabase.functions.invoke("manage-roles", {
        body: { action: "revoke", user_id: userId, role },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({ title: "Role revoked", description: `${role} role removed` });
      queryClient.invalidateQueries({ queryKey: ["admin-roles"] });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  if (loadingRoles) {
    return (
      <Card>
        <CardContent className="flex justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5" />
              Admin & Role Management
            </CardTitle>
            <CardDescription className="mt-1">
              Grant or revoke admin, moderator, and user roles. Admins have full access, moderators have limited management capabilities.
            </CardDescription>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-2">
                <UserPlus className="h-4 w-4" />
                Add Role
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Grant Role to User</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div>
                  <Label>User Email</Label>
                  <Input
                    type="email"
                    placeholder="user@example.com"
                    value={grantEmail}
                    onChange={(e) => setGrantEmail(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>Role</Label>
                  <Select value={grantRole} onValueChange={setGrantRole}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Admin — Full access</SelectItem>
                      <SelectItem value="moderator">Moderator — Limited management</SelectItem>
                      <SelectItem value="user">User — Standard access</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline">Cancel</Button>
                </DialogClose>
                <Button onClick={handleGrant} disabled={isSubmitting || !grantEmail.trim()}>
                  {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Grant Role
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {userRolesMap.size === 0 ? (
          <p className="text-center text-muted-foreground py-6">No roles assigned yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Roles</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from(userRolesMap.entries()).map(([userId, roles]) => {
                const profile = profileMap.get(userId);
                const isSelf = userId === user?.id;
                return (
                  <TableRow key={userId}>
                    <TableCell className="font-medium">
                      {profile?.name || "Unknown"}
                      {isSelf && <Badge variant="outline" className="ml-2 text-xs">You</Badge>}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {profile?.email || "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1 flex-wrap">
                        {roles.map((role) => {
                          const Icon = ROLE_ICONS[role] ?? Users;
                          return (
                            <Badge key={role} variant={ROLE_COLORS[role] ?? "secondary"} className="gap-1">
                              <Icon className="h-3 w-3" />
                              {role}
                            </Badge>
                          );
                        })}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {roles.map((role) => {
                          const canRevoke = !(isSelf && role === "admin");
                          return (
                            <Button
                              key={role}
                              variant="ghost"
                              size="icon"
                              disabled={!canRevoke}
                              title={canRevoke ? `Revoke ${role}` : "Cannot revoke own admin role"}
                              onClick={() => handleRevoke(userId, role)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          );
                        })}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
