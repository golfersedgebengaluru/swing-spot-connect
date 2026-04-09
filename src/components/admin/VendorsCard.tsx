import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Pencil, Trash2, Loader2, Upload, Download, Store, CheckCircle, XCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useVendors, useCreateVendor, useUpdateVendor, useDeleteVendor, type Vendor } from "@/hooks/useVendors";
import { validateGSTIN } from "@/lib/gst-utils";
import { useAdminCity } from "@/contexts/AdminCityContext";
import { useAllCities } from "@/hooks/useBookings";
import { useAdmin } from "@/hooks/useAdmin";
import { supabase } from "@/integrations/supabase/client";

interface VendorForm {
  name: string;
  contact_name: string;
  phone: string;
  email: string;
  gstin: string;
  category: string;
  notes: string;
}

const emptyForm: VendorForm = { name: "", contact_name: "", phone: "", email: "", gstin: "", category: "", notes: "" };

export function VendorsCard() {
  const { toast } = useToast();
  const { selectedCity: globalCity } = useAdminCity();
  const { isAdmin, assignedCities } = useAdmin();
  const { data: allCities } = useAllCities();
  const cities = isAdmin ? allCities : (allCities ?? []).filter((c) => assignedCities.includes(c));
  const city = globalCity || cities?.[0] || "";

  const { data: vendors, isLoading } = useVendors(city);
  const createVendor = useCreateVendor();
  const updateVendor = useUpdateVendor();
  const deleteVendor = useDeleteVendor();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<VendorForm>(emptyForm);
  const [gstinValid, setGstinValid] = useState<boolean | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const openCreate = () => { setEditingId(null); setForm(emptyForm); setGstinValid(null); setDialogOpen(true); };
  const openEdit = (v: Vendor) => {
    setEditingId(v.id);
    setForm({ name: v.name, contact_name: v.contact_name || "", phone: v.phone || "", email: v.email || "", gstin: v.gstin || "", category: v.category || "", notes: v.notes || "" });
    setGstinValid(v.gstin && v.gstin.length === 15 ? validateGSTIN(v.gstin).valid : null);
    setDialogOpen(true);
  };

  const handleGstinChange = (val: string) => {
    const upper = val.toUpperCase();
    setForm((f) => ({ ...f, gstin: upper }));
    setGstinValid(upper.length === 15 ? validateGSTIN(upper).valid : null);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast({ title: "Name is required", variant: "destructive" }); return; }
    if (form.gstin && form.gstin.length === 15 && !validateGSTIN(form.gstin).valid) {
      toast({ title: "Invalid GSTIN", variant: "destructive" }); return;
    }
    try {
      if (editingId) {
        await updateVendor.mutateAsync({ id: editingId, ...form });
      } else {
        await createVendor.mutateAsync({ ...form, city, is_active: true, contact_name: form.contact_name || null, phone: form.phone || null, email: form.email || null, gstin: form.gstin || null, category: form.category || null, notes: form.notes || null });
      }
      toast({ title: editingId ? "Vendor updated" : "Vendor added" });
      setDialogOpen(false);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteVendor.mutateAsync(deleteId);
      toast({ title: "Vendor deleted" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
    setDeleteId(null);
  };

  const handleExportCsv = () => {
    if (!vendors?.length) return;
    const headers = ["Name", "Contact Name", "Phone", "Email", "GSTIN", "Category", "Notes", "Active"];
    const rows = vendors.map((v) => [v.name, v.contact_name || "", v.phone || "", v.email || "", v.gstin || "", v.category || "", v.notes || "", v.is_active ? "Yes" : "No"]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `vendors-${city}.csv`;
    a.click();
  };

  const handleImportCsv = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const lines = text.split("\n").filter(Boolean);
    if (lines.length < 2) { toast({ title: "Empty CSV", variant: "destructive" }); return; }

    const rows = lines.slice(1).map((line) => {
      const cols = line.split(",").map((c) => c.replace(/^"|"$/g, "").replace(/""/g, '"'));
      return { name: cols[0], contact_name: cols[1] || null, phone: cols[2] || null, email: cols[3] || null, gstin: cols[4] || null, category: cols[5] || null, notes: cols[6] || null, city, is_active: true };
    }).filter((r) => r.name);

    if (!rows.length) { toast({ title: "No valid rows", variant: "destructive" }); return; }

    try {
      const { error } = await supabase.from("vendors" as any).insert(rows);
      if (error) throw error;
      toast({ title: `Imported ${rows.length} vendors` });
      // Refresh
      window.location.reload();
    } catch (err: any) {
      toast({ title: "Import error", description: err.message, variant: "destructive" });
    }
    e.target.value = "";
  };

  if (!city) return <p className="text-muted-foreground text-sm">Select a city to manage vendors.</p>;

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-base flex items-center gap-2"><Store className="h-5 w-5" />Vendors — {city}</CardTitle>
          <div className="flex items-center gap-2">
            <label className="cursor-pointer">
              <input type="file" accept=".csv" className="hidden" onChange={handleImportCsv} />
              <Button variant="outline" size="sm" asChild><span><Upload className="h-3.5 w-3.5 mr-1" />Import</span></Button>
            </label>
            <Button variant="outline" size="sm" onClick={handleExportCsv} disabled={!vendors?.length}>
              <Download className="h-3.5 w-3.5 mr-1" />Export
            </Button>
            <Button size="sm" onClick={openCreate}><Plus className="h-3.5 w-3.5 mr-1" />Add Vendor</Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Loader2 className="mx-auto h-6 w-6 animate-spin" />
          ) : !vendors?.length ? (
            <p className="text-muted-foreground text-sm text-center py-6">No vendors yet. Add your first vendor.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>GSTIN</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-20"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {vendors.map((v) => (
                    <TableRow key={v.id}>
                      <TableCell className="font-medium">{v.name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{v.contact_name || "—"}</TableCell>
                      <TableCell className="text-xs font-mono">{v.gstin || "—"}</TableCell>
                      <TableCell>{v.category || "—"}</TableCell>
                      <TableCell><Badge variant={v.is_active ? "default" : "secondary"}>{v.is_active ? "Active" : "Inactive"}</Badge></TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(v)}><Pencil className="h-3.5 w-3.5" /></Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDeleteId(v.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>{editingId ? "Edit Vendor" : "Add Vendor"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Name *</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Contact Name</Label>
                <Input value={form.contact_name} onChange={(e) => setForm((f) => ({ ...f, contact_name: e.target.value }))} className="mt-1" />
              </div>
              <div>
                <Label>Phone</Label>
                <Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} className="mt-1" />
              </div>
            </div>
            <div>
              <Label>Email</Label>
              <Input value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} className="mt-1" />
            </div>
            <div>
              <Label>GSTIN</Label>
              <div className="relative mt-1">
                <Input value={form.gstin} onChange={(e) => handleGstinChange(e.target.value)} maxLength={15} placeholder="22AAAAA0000A1Z5" className="pr-8" />
                {gstinValid !== null && (
                  gstinValid
                    ? <CheckCircle className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-green-600" />
                    : <XCircle className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-destructive" />
                )}
              </div>
            </div>
            <div>
              <Label>Category</Label>
              <Input value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} className="mt-1" placeholder="e.g. Supplier, Service Provider" />
            </div>
            <div>
              <Label>Notes</Label>
              <Input value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} className="mt-1" />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleSave} disabled={createVendor.isPending || updateVendor.isPending}>
                {(createVendor.isPending || updateVendor.isPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editingId ? "Update" : "Add"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete vendor?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone. Expenses linked to this vendor will keep their reference.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>No – Keep</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Yes – Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
