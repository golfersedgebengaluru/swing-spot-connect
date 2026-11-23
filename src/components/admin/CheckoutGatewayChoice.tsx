import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { chooseCheckoutGateway, setAdminsOnlyCheckout, type SafePaymentGateway } from "@/lib/payment-gateways";

/** Gateways that can take a city's online bookings and hour packages. */
export const CHECKOUT_GATEWAYS = new Set(["razorpay", "cashfree"]);

export const GATEWAY_KEY_LABELS: Record<string, { key: string; secret: string }> = {
  razorpay: { key: "API Key (Key ID)", secret: "API Secret (Key Secret)" },
  cashfree: { key: "App ID", secret: "Secret Key" },
};

export const checkoutReady = (gw: SafePaymentGateway) => gw.is_active && gw.has_api_key && gw.has_api_secret;

/** Mirrors the server: the chosen gateway, otherwise the city's active Razorpay (the default). */
export function effectiveCheckoutGateway(gateways: SafePaymentGateway[]): SafePaymentGateway | null {
  return gateways.find((g) => g.use_for_checkout)
    ?? gateways.find((g) => g.name === "razorpay" && checkoutReady(g))
    ?? null;
}

export function CheckoutGatewayBadge({ gateway, cityGateways }: { gateway: SafePaymentGateway; cityGateways: SafePaymentGateway[] }) {
  if (effectiveCheckoutGateway(cityGateways)?.id !== gateway.id) {
    return gateway.admins_only_checkout ? <Badge variant="secondary">Admins only</Badge> : null;
  }
  return <Badge>{gateway.use_for_checkout ? "Takes online payments" : "Takes online payments (default)"}</Badge>;
}

/** Shown when a city has gateways but none of them can take its online payments. */
export function NoCheckoutGatewayNotice({ city, gateways }: { city: string; gateways: SafePaymentGateway[] }) {
  if (gateways.length === 0 || effectiveCheckoutGateway(gateways)) return null;
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
  const current = effectiveCheckoutGateway(cityGateways);

  const adminsOnly = useMutation({
    mutationFn: (enabled: boolean) => setAdminsOnlyCheckout(gateway.id, enabled),
    onSuccess: (_data, enabled) => {
      queryClient.invalidateQueries({ queryKey: ["payment_gateways"] });
      toast({
        title: enabled ? "Admins only: on" : "Admins only: off",
        description: enabled
          ? `Admins' online payments in ${city} now use ${gateway.display_name}. Customers are unchanged.`
          : `Admins' online payments in ${city} are back on ${current?.display_name ?? "the city's gateway"}.`,
      });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const switchCheckout = useMutation({
    mutationFn: () => chooseCheckoutGateway(gateway.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payment_gateways"] });
      toast({ title: "Online payments switched", description: `New online payments in ${city} now use ${gateway.display_name}.` });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  if (!CHECKOUT_GATEWAYS.has(gateway.name) || current?.id === gateway.id) return null;
  const ready = checkoutReady(gateway);

  const adminsOnlyId = `admins-only-${gateway.id}`;
  return (
    <div className="space-y-3 rounded-md bg-muted/50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="space-y-0.5">
          <Label htmlFor={adminsOnlyId} className="text-sm">Admins only</Label>
          <p className="text-xs text-muted-foreground">
            Online payments made while signed in as an admin for {city} go through {gateway.display_name}. Customers keep
            paying through {current?.display_name ?? "the city's gateway"}.
          </p>
        </div>
        <Switch
          id={adminsOnlyId}
          checked={gateway.admins_only_checkout}
          disabled={(!ready && !gateway.admins_only_checkout) || hasUnsavedChanges || adminsOnly.isPending}
          onCheckedChange={(enabled) => adminsOnly.mutate(enabled)}
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
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
                always go back through the gateway that took the money. Razorpay stays switched on (leagues and quick
                competitions keep using it), and you can switch back at any time.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => switchCheckout.mutate()}>Switch</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
