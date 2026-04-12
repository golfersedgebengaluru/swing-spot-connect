import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Plus, Pencil, Trash2, Loader2, BarChart3, Ticket } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useDefaultCurrency } from "@/hooks/useCurrency";
import {
  useAdminCoupons,
  useCreateCoupon,
  useUpdateCoupon,
  useDeleteCoupon,
  useAllCouponRedemptions,
  Coupon,
} from "@/hooks/useCoupons";
import { format } from "date-fns";

interface CouponForm {
  code: string;
  discount_type: "percentage" | "fixed";
  discount_value: number;
  expires_at: string;
  max_total_uses: number | null;
  max_uses_per_user: number | null;
  is_active: boolean;
  city: string | null;
}

const emptyCoupon: CouponForm = {
  code: "",
  discount_type: "percentage",
  discount_value: 0,
  expires_at: "",
  max_total_uses: null,
  max_uses_per_user: null,
  is_active: true,
  city: null,
};

export function AdminCouponsTab() {
  const { toast } = useToast();
  const { format: fmt } = useDefaultCurrency();
  const { data: coupons, isLoading } = useAdminCoupons();
  const { data: allRedemptions } = useAllCouponRedemptions();
  const createCoupon = useCreateCoupon();
  const updateCoupon = useUpdateCoupon();
  const deleteCoupon = useDeleteCoupon();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Coupon | null>(null);
  const [form, setForm] = useState(emptyCoupon);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyCoupon);
    setDialogOpen(true);
  };

  const openEdit = (c: Coupon) => {
    setEditing(c);
    setForm({
      code: c.code,
      discount_type: c.discount_type as "percentage" | "fixed",
      discount_value: c.discount_value,
      expires_at: c.expires_at ? c.expires_at.slice(0, 16) : "",
      max_total_uses: c.max_total_uses,
      max_uses_per_user: c.max_uses_per_user,
      is_active: c.is_active,
      city: c.city,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.code.trim()) {
      toast({ title: "Code required", variant: "destructive" });
      return;
    }
    if (form.code.trim().length > 20) {
      toast({ title: "Code must be 20 characters or less", variant: "destructive" });
      return;
    }
    if (form.discount_value <= 0) {
      toast({ title: "Discount value must be greater than 0", variant: "destructive" });
      return;
    }
    if (form.discount_type === "percentage" && form.discount_value > 100) {
      toast({ title: "Percentage cannot exceed 100", variant: "destructive" });
      return;
    }
    try {
      if (editing) {
        await updateCoupon.mutateAsync({
          id: editing.id,
          code: form.code,
          discount_type: form.discount_type,
          discount_value: form.discount_value,
          expires_at: form.expires_at || null,
          max_total_uses: form.max_total_uses,
          max_uses_per_user: form.max_uses_per_user,
          is_active: form.is_active,
          city: form.city,
        });
        toast({ title: "Coupon updated" });
      } else {
        await createCoupon.mutateAsync({
          code: form.code,
          discount_type: form.discount_type,
          discount_value: form.discount_value,
          expires_at: form.expires_at || null,
          max_total_uses: form.max_total_uses,
          max_uses_per_user: form.max_uses_per_user,
          is_active: form.is_active,
          city: form.city,
        });
        toast({ title: "Coupon created" });
      }
      setDialogOpen(false);
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message?.includes("coupons_code_unique")
          ? "A coupon with this code already exists"
          : err.message,
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this coupon? This cannot be undone.")) return;
    try {
      await deleteCoupon.mutateAsync(id);
      toast({ title: "Coupon deleted" });
    } catch (err: any) {
      toast({ title: "Error deleting coupon", description: err.message, variant: "destructive" });
    }
  };

  const handleToggleActive = async (c: Coupon) => {
    try {
      await updateCoupon.mutateAsync({ id: c.id, is_active: !c.is_active });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  // Stats
  const totalCoupons = coupons?.length ?? 0;
  const activeCoupons = coupons?.filter((c) => c.is_active).length ?? 0;
  const totalRedemptions = allRedemptions?.length ?? 0;
  const totalDiscountGiven = allRedemptions?.reduce((sum, r: any) => sum + Number(r.discount_applied), 0) ?? 0;

  return (
    <Tabs defaultValue="manage" className="space-y-4">
      <TabsList>
        <TabsTrigger value="manage" className="gap-2">
          <Ticket className="h-4 w-4" /> Coupons
        </TabsTrigger>
        <TabsTrigger value="stats" className="gap-2">
          <BarChart3 className="h-4 w-4" /> Usage Statistics
        </TabsTrigger>
      </TabsList>

      <TabsContent value="manage" className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Manage Coupons</h2>
          <Button onClick={openCreate} size="sm">
            <Plus className="mr-2 h-4 w-4" /> Add Coupon
          </Button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Discount</TableHead>
                    <TableHead>Expiry</TableHead>
                    <TableHead>Usage</TableHead>
                    <TableHead>Active</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(coupons ?? []).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        No coupons yet. Create your first coupon.
                      </TableCell>
                    </TableRow>
                  )}
                  {(coupons ?? []).map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-mono font-medium">{c.code}</TableCell>
                      <TableCell>
                        {c.discount_type === "percentage" ? (
                          <Badge variant="secondary">{c.discount_value}%</Badge>
                        ) : (
                          <Badge variant="secondary">{fmt(c.discount_value)}</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {c.expires_at ? format(new Date(c.expires_at), "PP") : "Never"}
                      </TableCell>
                      <TableCell className="text-sm">
                        {c.total_used}{c.max_total_uses ? ` / ${c.max_total_uses}` : ""}
                      </TableCell>
                      <TableCell>
                        <Switch checked={c.is_active} onCheckedChange={() => handleToggleActive(c)} />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(c)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(c.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </TabsContent>

      <TabsContent value="stats" className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total Coupons</CardTitle></CardHeader>
            <CardContent><p className="text-2xl font-bold">{totalCoupons}</p></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Active Coupons</CardTitle></CardHeader>
            <CardContent><p className="text-2xl font-bold text-primary">{activeCoupons}</p></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total Redemptions</CardTitle></CardHeader>
            <CardContent><p className="text-2xl font-bold">{totalRedemptions}</p></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total Discount Given</CardTitle></CardHeader>
            <CardContent><p className="text-2xl font-bold text-destructive">{fmt(totalDiscountGiven)}</p></CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Coupon Performance</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Discount</TableHead>
                  <TableHead>Times Used</TableHead>
                  <TableHead>Total Discount Given</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(coupons ?? []).map((c) => {
                  const redemptions = (allRedemptions ?? []).filter((r: any) => r.coupon_id === c.id);
                  const discountSum = redemptions.reduce((s: number, r: any) => s + Number(r.discount_applied), 0);
                  return (
                    <TableRow key={c.id}>
                      <TableCell className="font-mono font-medium">{c.code}</TableCell>
                      <TableCell>
                        {c.discount_type === "percentage" ? `${c.discount_value}%` : fmt(c.discount_value)}
                      </TableCell>
                      <TableCell>{redemptions.length}</TableCell>
                      <TableCell>{fmt(discountSum)}</TableCell>
                      <TableCell>
                        <Badge variant={c.is_active ? "default" : "secondary"}>
                          {c.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent Redemptions</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Discount Applied</TableHead>
                  <TableHead>User Type</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(allRedemptions ?? []).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-6 text-muted-foreground">
                      No redemptions yet
                    </TableCell>
                  </TableRow>
                )}
                {(allRedemptions ?? []).slice(0, 50).map((r: any) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-sm">{format(new Date(r.created_at), "PPp")}</TableCell>
                    <TableCell className="font-mono">{r.coupons?.code ?? "—"}</TableCell>
                    <TableCell>{fmt(Number(r.discount_applied))}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{r.user_id ? "Registered" : "Guest"}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </TabsContent>

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Coupon" : "Create Coupon"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Code (max 20 chars, alphanumeric)</Label>
              <Input
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 20) })}
                placeholder="SUMMER25"
                maxLength={20}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Discount Type</Label>
                <Select value={form.discount_type} onValueChange={(v) => setForm({ ...form, discount_type: v as any })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percentage">Percentage (%)</SelectItem>
                    <SelectItem value="fixed">Fixed Amount (₹)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Discount Value</Label>
                <Input
                  type="number"
                  min={1}
                  max={form.discount_type === "percentage" ? 100 : undefined}
                  value={form.discount_value || ""}
                  onChange={(e) => setForm({ ...form, discount_value: Number(e.target.value) })}
                />
              </div>
            </div>
            <div>
              <Label>Expiration Date (optional)</Label>
              <Input
                type="datetime-local"
                value={form.expires_at}
                onChange={(e) => setForm({ ...form, expires_at: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Max Total Uses (optional)</Label>
                <Input
                  type="number"
                  min={1}
                  value={form.max_total_uses || ""}
                  onChange={(e) => setForm({ ...form, max_total_uses: e.target.value ? Number(e.target.value) : null })}
                  placeholder="Unlimited"
                />
              </div>
              <div>
                <Label>Max Uses Per User (optional)</Label>
                <Input
                  type="number"
                  min={1}
                  value={form.max_uses_per_user || ""}
                  onChange={(e) => setForm({ ...form, max_uses_per_user: e.target.value ? Number(e.target.value) : null })}
                  placeholder="Unlimited"
                />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
              <Label>Active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={createCoupon.isPending || updateCoupon.isPending}>
              {(createCoupon.isPending || updateCoupon.isPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editing ? "Save Changes" : "Create Coupon"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Tabs>
  );
}
