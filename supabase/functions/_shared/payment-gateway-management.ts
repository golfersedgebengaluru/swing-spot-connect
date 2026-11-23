export type GatewayRecord = {
  id: string;
  name: string;
  display_name: string;
  api_key: string | null;
  api_secret: string | null;
  webhook_secret: string | null;
  is_active: boolean;
  is_test_mode: boolean;
  use_for_checkout?: boolean | null;
  admins_only_checkout?: boolean | null;
  sort_order: number;
  city: string | null;
  tenant_id: string | null;
};

export type GatewayCredentialName = "api_key" | "api_secret" | "webhook_secret";

export type GatewayUpdateInput = {
  display_name?: string;
  api_key?: string;
  api_secret?: string;
  webhook_secret?: string;
  clear_credentials?: GatewayCredentialName[];
  is_active?: boolean;
  is_test_mode?: boolean;
  sort_order?: number;
};

export function toSafeGateway(row: GatewayRecord) {
  return {
    id: row.id,
    name: row.name,
    display_name: row.display_name,
    is_active: row.is_active,
    is_test_mode: row.is_test_mode,
    use_for_checkout: row.use_for_checkout === true,
    admins_only_checkout: row.admins_only_checkout === true,
    sort_order: row.sort_order,
    city: row.city,
    tenant_id: row.tenant_id,
    has_api_key: Boolean(row.api_key),
    has_api_secret: Boolean(row.api_secret),
    has_webhook_secret: Boolean(row.webhook_secret),
  };
}

export function buildGatewayUpdate(input: GatewayUpdateInput): Record<string, unknown> {
  const update: Record<string, unknown> = {};

  if (input.display_name !== undefined) update.display_name = input.display_name;
  if (input.is_active !== undefined) update.is_active = input.is_active;
  if (input.is_test_mode !== undefined) update.is_test_mode = input.is_test_mode;
  if (input.sort_order !== undefined) update.sort_order = input.sort_order;

  for (const field of ["api_key", "api_secret", "webhook_secret"] as const) {
    const value = input[field]?.trim();
    if (value) update[field] = value;
  }

  for (const field of input.clear_credentials ?? []) update[field] = null;
  // Switching a gateway off or removing a key also ends its admins-only trial.
  const losesKey = (input.clear_credentials ?? []).some((f) => f === "api_key" || f === "api_secret");
  if (input.is_active === false || losesKey) update.admins_only_checkout = false;
  return update;
}
/** Messages set_checkout_gateway raises on purpose; anything else stays a generic failure. */
export const CHECKOUT_SWITCH_MESSAGES = [
  "Gateway not found",
  "Only a city payment account can take online payments",
  "This gateway cannot take online payments",
  "Switch this gateway on first",
  "Save this gateway's keys first",
];

export function checkoutSwitchMessage(error: { message?: string } | null | undefined): string | null {
  const message = error?.message ?? "";
  return CHECKOUT_SWITCH_MESSAGES.find((m) => message.includes(m)) ?? null;
}

/** The gateway taking online payments cannot be switched off, emptied of keys or removed. */
export const CHECKOUT_GATEWAY_LOCKED =
  "This gateway takes the city's online payments. Choose another gateway for online payments first.";

/** Why the admins-only setting could not be switched on; constraint and index names come from migration 0031. */
export function adminsOnlyMessage(error: { code?: string; message?: string } | null | undefined): string | null {
  const message = error?.message ?? "";
  if (message.includes("payment_gateways_admins_only_ready")) return "Switch this gateway on and save both keys first";
  if (message.includes("payment_gateways_one_admins_only_per_city")) return "Another gateway in this city is already set to admins only";
  return null;
}
