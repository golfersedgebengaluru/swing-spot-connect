import { supabase } from "@/integrations/supabase/client";

export type GatewayTarget =
  | { scope: "all" }
  | { scope: "city"; scope_id: string }
  | { scope: "tenant"; scope_id: string };

export interface SafePaymentGateway {
  id: string;
  name: string;
  display_name: string;
  is_active: boolean;
  is_test_mode: boolean;
  sort_order: number;
  city: string | null;
  tenant_id: string | null;
  has_api_key: boolean;
  has_api_secret: boolean;
  has_webhook_secret: boolean;
}

export interface GatewayChanges {
  display_name?: string;
  api_key?: string;
  api_secret?: string;
  webhook_secret?: string;
  is_active?: boolean;
  is_test_mode?: boolean;
  sort_order?: number;
}

async function invokeGatewayOperation(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("manage-payment-gateway", { body });
  if (error) throw new Error("Payment gateway operation failed");
  if (data?.error) throw new Error(String(data.error));
  return data;
}

export async function listPaymentGateways(target: GatewayTarget): Promise<SafePaymentGateway[]> {
  const data = await invokeGatewayOperation({ action: "list", target });
  return Array.isArray(data?.gateways) ? data.gateways : [];
}

export async function createPaymentGateway(
  target: Exclude<GatewayTarget, { scope: "all" }>,
  gateway: { name: string; display_name: string; is_active?: boolean; is_test_mode?: boolean; sort_order?: number },
) {
  return invokeGatewayOperation({ action: "create", target, gateway });
}

export async function updatePaymentGateway(gatewayId: string, updates: GatewayChanges) {
  return invokeGatewayOperation({ action: "update", gateway_id: gatewayId, updates });
}

export async function deletePaymentGateway(gatewayId: string) {
  return invokeGatewayOperation({ action: "delete", gateway_id: gatewayId });
}