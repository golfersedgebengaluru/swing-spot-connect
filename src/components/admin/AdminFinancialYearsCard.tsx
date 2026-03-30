import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { CalendarDays, Plus, Trash2, Loader2, Save } from "lucide-react";
import {
  useFinancialYears,
  useCityFinancialYears,
  useCreateFinancialYear,
  useUpdateFinancialYear,
  useDeleteFinancialYear,
} from "@/hooks/useRevenue";
import { useToast } from "@/hooks/use-toast";

interface Props {
  city?: string | null; // null/undefined = global FYs
  title?: string;
}

export function AdminFinancialYearsCard({ city, title }: Props) {
  const { toast } = useToast();
  const globalQuery = useFinancialYears();
  const cityQuery = useCityFinancialYears(city ?? undefined);

  const isCity = !!city;
  const { data: years, isLoading } = isCity ? cityQuery : globalQuery;

  const createFY = useCreateFinancialYear();
  const updateFY = useUpdateFinancialYear();
  const deleteFY = useDeleteFinancialYear();

  const [showForm, setShowForm] = useState(false);
  const [label, setLabel] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [isActive, setIsActive] = useState(false);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!label || !startDate || !endDate) {
      toast({ title: "Error", description: "All fields are required", variant: "destructive" });
      return;
    }
    try {
      await createFY.mutateAsync({
        label,
        start_date: startDate,
        end_date: endDate,
        is_active: isActive,
        city: city ?? null,
      });
      toast({ title: "Created", description: "Financial year added." });
      setShowForm(false);
      setLabel("");
      setStartDate("");
      setEndDate("");
      setIsActive(false);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleSetActive = async (id: string) => {
    try {
      await updateFY.mutateAsync({ id, is_active: true, city: city ?? null });
      toast({ title: "Updated", description: "Active financial year changed." });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteFY.mutateAsync(id);
      toast({ title: "Deleted", description: "Financial year removed." });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  if (isLoading) return <Loader2 className="mx-auto h-8 w-8 animate-spin" />;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <CalendarDays className="h-5 w-5" /> {title || "Financial Years"}
        </CardTitle>
        <Button variant="outline" size="sm" onClick={() => setShowForm(!showForm)}>
          <Plus className="mr-1 h-4 w-4" /> Add
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {showForm && (
          <form onSubmit={handleCreate} className="space-y-3 rounded-lg border border-border p-4">
            <div>
              <Label>Label</Label>
              <Input placeholder="FY 2025-26" value={label} onChange={(e) => setLabel(e.target.value)} className="mt-1" required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Start Date</Label>
                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="mt-1" required />
              </div>
              <div>
                <Label>End Date</Label>
                <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="mt-1" required />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={isActive} onCheckedChange={setIsActive} />
              <Label>Set as active</Label>
            </div>
            <Button type="submit" size="sm" disabled={createFY.isPending}>
              {createFY.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save
            </Button>
          </form>
        )}

        {(years ?? []).length === 0 && !showForm && (
          <p className="text-sm text-muted-foreground">
            {isCity
              ? "No city-specific financial year set. The global financial year will be used."
              : "No financial years configured. Add one to enable period-based reporting."}
          </p>
        )}

        {(years ?? []).map((fy: any) => (
          <div key={fy.id} className="flex items-center justify-between rounded-lg border border-border p-3">
            <div>
              <div className="flex items-center gap-2">
                <p className="font-medium text-foreground">{fy.label}</p>
                {fy.is_active && <Badge variant="default" className="text-xs">Active</Badge>}
              </div>
              <p className="text-xs text-muted-foreground">{fy.start_date} → {fy.end_date}</p>
            </div>
            <div className="flex items-center gap-2">
              {!fy.is_active && (
                <Button variant="outline" size="sm" onClick={() => handleSetActive(fy.id)}>
                  Set Active
                </Button>
              )}
              <Button variant="ghost" size="icon" onClick={() => handleDelete(fy.id)}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
