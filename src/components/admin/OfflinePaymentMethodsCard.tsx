import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Banknote, Plus, Trash2, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  useAllOfflinePaymentMethods,
  useCreateOfflinePaymentMethod,
  useUpdateOfflinePaymentMethod,
  useDeleteOfflinePaymentMethod,
} from "@/hooks/useOfflinePaymentMethods";

export function OfflinePaymentMethodsCard() {
  const { toast } = useToast();
  const { data: methods, isLoading } = useAllOfflinePaymentMethods();
  const createMethod = useCreateOfflinePaymentMethod();
  const updateMethod = useUpdateOfflinePaymentMethod();
  const deleteMethod = useDeleteOfflinePaymentMethod();
  const [newLabel, setNewLabel] = useState("");

  const handleAdd = () => {
    if (!newLabel.trim()) return;
    createMethod.mutate(
      { label: newLabel.trim(), sort_order: (methods?.length ?? 0) + 1 },
      {
        onSuccess: () => { setNewLabel(""); toast({ title: "Added", description: "Payment method added." }); },
        onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
      }
    );
  };

  if (isLoading) return <Loader2 className="mx-auto h-8 w-8 animate-spin" />;

  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Banknote className="h-5 w-5" /> Offline Payment Methods</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Used for walk-in bookings where payment is collected in person.
        </p>

        {(methods ?? []).map((m) => (
          <div key={m.id} className="flex items-center gap-3">
            <span className="text-sm flex-1 text-foreground">{m.label}</span>
            <Switch
              checked={m.is_active}
              onCheckedChange={(checked) =>
                updateMethod.mutate({ id: m.id, is_active: checked }, {
                  onSuccess: () => toast({ title: "Updated" }),
                  onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
                })
              }
            />
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-destructive"
              onClick={() =>
                deleteMethod.mutate(m.id, {
                  onSuccess: () => toast({ title: "Deleted" }),
                  onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
                })
              }
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}

        <div className="flex gap-2">
          <Input
            placeholder="New method name"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            className="flex-1"
          />
          <Button size="sm" onClick={handleAdd} disabled={!newLabel.trim() || createMethod.isPending}>
            <Plus className="h-4 w-4 mr-1" /> Add
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
