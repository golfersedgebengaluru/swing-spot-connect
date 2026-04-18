import { useEffect, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { useReassignInvoiceCity } from "@/hooks/useInvoices";
import { useAllCities } from "@/hooks/useBookings";
import { useAdmin } from "@/hooks/useAdmin";
import { useToast } from "@/hooks/use-toast";

interface ReassignInvoiceCityDialogProps {
  invoiceId: string | null;
  currentCity: string | null;
  currentNumber: string | null;
  onClose: () => void;
}

export function ReassignInvoiceCityDialog({
  invoiceId,
  currentCity,
  currentNumber,
  onClose,
}: ReassignInvoiceCityDialogProps) {
  const { toast } = useToast();
  const { data: allCities } = useAllCities();
  const { isAdmin, assignedCities } = useAdmin();
  const reassign = useReassignInvoiceCity();

  const [targetCity, setTargetCity] = useState<string>("");
  const [overrideNumber, setOverrideNumber] = useState<string>("");

  // Cities the user can reassign TO (must have access)
  const targetCities = (isAdmin
    ? allCities ?? []
    : (allCities ?? []).filter((c) => assignedCities.includes(c))
  ).filter((c) => c !== currentCity);

  useEffect(() => {
    if (invoiceId) {
      setTargetCity("");
      setOverrideNumber("");
    }
  }, [invoiceId]);

  const handleSubmit = async () => {
    if (!invoiceId || !targetCity) return;
    const overrideNum = overrideNumber.trim() ? parseInt(overrideNumber.trim(), 10) : undefined;
    if (overrideNumber.trim() && (Number.isNaN(overrideNum!) || overrideNum! < 1)) {
      toast({ title: "Invalid number", description: "Override must be a positive integer.", variant: "destructive" });
      return;
    }
    try {
      const { newInvoiceNumber } = await reassign.mutateAsync({ invoiceId, targetCity, overrideNumber: overrideNum });
      toast({
        title: "Invoice reassigned",
        description: `New number: ${newInvoiceNumber}. The original number was returned to ${currentCity} for re-use.`,
      });
      onClose();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  return (
    <AlertDialog open={!!invoiceId} onOpenChange={(open) => { if (!open) onClose(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Reassign Invoice to Another City</AlertDialogTitle>
          <AlertDialogDescription>
            Move <span className="font-mono">{currentNumber}</span> from{" "}
            <strong>{currentCity}</strong> to a different city. The original number will be returned to{" "}
            <strong>{currentCity}</strong>'s recycle queue and reused for the next invoice there.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label>Target City</Label>
            <Select value={targetCity} onValueChange={setTargetCity}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Select target city" />
              </SelectTrigger>
              <SelectContent>
                {targetCities.length === 0 ? (
                  <div className="px-2 py-1.5 text-sm text-muted-foreground">No other cities available</div>
                ) : (
                  targetCities.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">
              The invoice will adopt the target city's business name, GSTIN, address and tax state.
            </p>
          </div>

          <div>
            <Label>Override Invoice Number (optional)</Label>
            <Input
              type="number"
              min={1}
              value={overrideNumber}
              onChange={(e) => setOverrideNumber(e.target.value)}
              placeholder="Leave blank to use next sequential number"
              className="mt-1"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Leave blank to auto-assign the next available number for the target city. Set a value only if you need a specific sequence number.
            </p>
          </div>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => { e.preventDefault(); handleSubmit(); }}
            disabled={!targetCity || reassign.isPending}
          >
            {reassign.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Reassign
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
