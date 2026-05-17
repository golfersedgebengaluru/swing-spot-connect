import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Wallet, AlertTriangle } from "lucide-react";

export type CancellationDisposition = "advance_credit" | "external_refund" | "hours";

interface Props {
  booking: any | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: (disposition: CancellationDisposition) => void;
  isPending?: boolean;
  /** Optional title prefix (e.g. "Admin Cancel") */
  titlePrefix?: string;
}

export function CancellationDispositionDialog({ booking, onOpenChange, onConfirm, isPending, titlePrefix }: Props) {
  const open = !!booking;

  const { data: paymentInfo, isLoading } = useQuery({
    queryKey: ["booking-payment-info", booking?.id],
    enabled: open && !!booking?.id,
    queryFn: async () => {
      const [{ data: rev }, { data: bc }] = await Promise.all([
        supabase
          .from("revenue_transactions")
          .select("amount, currency")
          .eq("booking_id", booking!.id)
          .in("transaction_type", ["payment", "guest_booking"])
          .gt("amount", 0)
          .maybeSingle(),
        supabase
          .from("bay_config")
          .select("cancellation_fee_pct")
          .eq("city", booking!.city)
          .maybeSingle(),
      ]);
      return {
        paidAmount: rev?.amount ? Number(rev.amount) : 0,
        currency: rev?.currency || "INR",
        feePct: Number((bc as any)?.cancellation_fee_pct ?? 10),
      };
    },
  });

  const [choice, setChoice] = useState<CancellationDisposition | null>(null);

  useEffect(() => {
    if (!open) setChoice(null);
  }, [open]);

  const isPaid = (paymentInfo?.paidAmount ?? 0) > 0;
  const feePct = paymentInfo?.feePct ?? 10;
  const paid = paymentInfo?.paidAmount ?? 0;
  const refundAmount = Math.max(0, paid * (1 - feePct / 100));
  const feeAmount = paid - refundAmount;
  const currencySym = paymentInfo?.currency === "INR" ? "₹" : (paymentInfo?.currency || "");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{titlePrefix ? `${titlePrefix}: ` : ""}Cancel this booking?</DialogTitle>
          <DialogDescription>
            {isLoading
              ? "Checking payment details…"
              : isPaid
                ? "This is a paid booking. Choose how to handle the refund."
                : "Your hours will be refunded. This action cannot be undone."}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : isPaid ? (
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => setChoice("advance_credit")}
              className={`w-full text-left rounded-lg border p-3 transition ${
                choice === "advance_credit" ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
              }`}
            >
              <div className="flex items-start gap-2">
                <Wallet className="h-5 w-5 mt-0.5 text-primary" />
                <div className="flex-1">
                  <p className="font-medium">Credit note / Customer advance</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Full amount {currencySym}{paid.toFixed(2)} parked as credit for future use. No cancellation charge.
                  </p>
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setChoice("external_refund")}
              className={`w-full text-left rounded-lg border p-3 transition ${
                choice === "external_refund" ? "border-orange-500 bg-orange-500/10" : "border-border hover:bg-muted/50"
              }`}
            >
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-5 w-5 mt-0.5 text-orange-600" />
                <div className="flex-1">
                  <p className="font-medium text-orange-700 dark:text-orange-400">
                    Refund to original payment method
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {feePct}% cancellation charge applies. You will be refunded{" "}
                    <span className="font-semibold text-foreground">
                      {currencySym}{refundAmount.toFixed(2)}
                    </span>{" "}
                    (charge: {currencySym}{feeAmount.toFixed(2)}). Refund processed externally — please allow 5–7 business days.
                  </p>
                </div>
              </div>
            </button>
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Keep Booking
          </Button>
          {isPaid ? (
            <Button
              onClick={() => choice && onConfirm(choice)}
              disabled={!choice || isPending}
              className={choice === "external_refund" ? "bg-orange-600 hover:bg-orange-700 text-white" : ""}
            >
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm Cancellation"}
            </Button>
          ) : (
            <Button
              onClick={() => onConfirm("hours")}
              disabled={isPending}
              variant="destructive"
            >
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Yes – Cancel Booking"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
