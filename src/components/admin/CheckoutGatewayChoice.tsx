import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { chooseCheckoutGateway, type SafePaymentGateway } from "@/lib/payment-gateways";

/** Gateways that can take a city's online bookings and hour packages. */
export const CHECKOUT_GATEWAYS = new Set(["razorpay", "cashfree"]);

export const GATEWAY_KEY_LABELS: Record<string, { key: string; secret: string }> = {
  razorpay: { key: "API Key (Key ID)", secret: "API Secret (Key Secret)" },
  cashfree: { key: "App ID", secret: "Secret Key" },
};

export const checkoutReady = (gw: SafePaymentGateway) => gw.is_active && gw.has_api_key && gw.has_api_secret;

export function CheckoutGatewayBadge({ gateway }: { gateway: SafePaymentGateway }) {
  return gateway.use_for_checkout ? <Badge>Takes online payments</Badge> : null;
}

/** Shown when a city has gateways but none of them takes its online payments. */
export function NoCheckoutGatewayNotice({ city, gateways }: { city: string; gateways: SafePaymentGateway[] }) {
  if (gateways.length === 0 || gateways.some((g) => g.use_for_checkout)) return null;
  return (
    <p className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
      No gateway takes online payments in {city} yet, so customers can't pay online. Choose one below.
    </p>
  );
}

export function CashfreeNote({ gateway }: { gateway: SafePaymentGateway }) {
  if (gateway.name !== "cashfree") return null;
  return (
    <p className="text-xs text-muted-foreground">
      Test Mode uses Cashfree's sandbox. Payment alerts are set up automatically with each order, so nothing needs
      adding in Cashfree's dashboard.
    </p>
  );
}

/** "Use for online payments" for one gateway, with a confirmation before switching. */
export function CheckoutGatewayChoice({
  city,
  gateway,
  cityGateways,
  hasUnsavedChanges,
}: {
  city: string;
  gateway: SafePaymentGateway;
  cityGateways: SafePaymentGateway[];
  hasUnsavedChanges: boolean;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const current = cityGateways.find((g) => g.use_for_checkout) ?? null;

  const switchCheckout = useMutation({
    mutationFn: () => chooseCheckoutGateway(gateway.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payment_gateways"] });
      toast({ title: "Online payments switched", description: `New online payments in ${city} now use ${gateway.display_name}.` });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  if (!CHECKOUT_GATEWAYS.has(gateway.name) || gateway.use_for_checkout) return null;
  const ready = checkoutReady(gateway);

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/50 p-3">
      <p className="text-xs text-muted-foreground">
        {ready
          ? `Switch ${city}'s online payments to ${gateway.display_name}.`
          : "Save both keys and switch this gateway on before it can take online payments."}
      </p>
      <Button
        size="sm"
        variant="outline"
        disabled={!ready || hasUnsavedChanges || switchCheckout.isPending}
        onClick={() => setConfirming(true)}
      >
        Use for online payments
      </Button>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Switch {city}'s online payments to {gateway.display_name}?</AlertDialogTitle>
            <AlertDialogDescription>
              New online bookings and hour packages in {city} will be paid through {gateway.display_name} from the next
              checkout. Anyone already paying finishes with {current?.display_name ?? "their current gateway"}, and refunds
              always go back through the gateway that took the money. You can switch back at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => switchCheckout.mutate()}>Switch</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
