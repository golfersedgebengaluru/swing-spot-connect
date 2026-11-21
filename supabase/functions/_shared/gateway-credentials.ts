// Which payment account a city uses, and the credentials of the account that
// took a given payment. New checkouts go to the city's chosen gateway
// (payment_gateways.use_for_checkout); verification and refunds always use the
// gateway recorded on the checkout, even after staff switch or turn it off.

export type CheckoutGatewayName = "razorpay" | "cashfree";

export interface GatewayCredentials {
  id: string;
  name: CheckoutGatewayName;
  keyId: string;
  keySecret: string;
  webhookSecret: string | null;
  testMode: boolean;
}

export interface GatewayRow {
  id: string;
  name: string;
  api_key: string | null;
  api_secret: string | null;
  webhook_secret?: string | null;
  is_test_mode?: boolean | null;
}

// deno-lint-ignore no-explicit-any
type Admin = any;
type EnvGetter = (name: string) => string | undefined;

const denoEnv: EnvGetter = (name) =>
  // deno-lint-ignore no-explicit-any
  typeof (globalThis as any).Deno !== "undefined" ? (globalThis as any).Deno.env.get(name) : undefined;

export const asCheckoutGateway = (name: unknown): CheckoutGatewayName => (name === "cashfree" ? "cashfree" : "razorpay");

/** Razorpay secrets may be overridden per city with RAZORPAY_SECRET_<CITY>. */
export function credentialsFromRow(row: GatewayRow | null | undefined, city: string, env: EnvGetter = denoEnv): GatewayCredentials | null {
  if (!row || (row.name !== "razorpay" && row.name !== "cashfree")) return null;
  const keyId = (row.api_key || "").trim();
  const override = row.name === "razorpay"
    ? env(`RAZORPAY_SECRET_${city.toUpperCase().replace(/[^A-Z0-9]/g, "_")}`)
    : undefined;
  const keySecret = (override || row.api_secret || "").trim();
  if (!keyId || !keySecret) return null;
  return {
    id: row.id,
    name: row.name,
    keyId,
    keySecret,
    webhookSecret: row.webhook_secret ?? null,
    testMode: row.is_test_mode === true,
  };
}

const COLUMNS = "id, name, api_key, api_secret, webhook_secret, is_test_mode";

/**
 * The gateway that takes new online checkouts in this city. Razorpay is the
 * default: when staff have not chosen one, the city's active Razorpay is used.
 */
export async function loadCheckoutGateway(admin: Admin, city: string): Promise<GatewayCredentials | null> {
  const { data: chosen } = await admin
    .from("payment_gateways")
    .select(COLUMNS)
    .eq("city", city).is("tenant_id", null)
    .eq("use_for_checkout", true).eq("is_active", true)
    .maybeSingle();
  if (chosen) return credentialsFromRow(chosen as GatewayRow, city);
  const { data: fallback } = await admin
    .from("payment_gateways")
    .select(COLUMNS)
    .eq("city", city).is("tenant_id", null)
    .eq("name", "razorpay").eq("is_active", true)
    .maybeSingle();
  return credentialsFromRow(fallback as GatewayRow | null, city);
}

/** Credentials of a specific city gateway, regardless of whether it still takes new checkouts. */
export async function loadGatewayCredentials(admin: Admin, city: string, name: CheckoutGatewayName): Promise<GatewayCredentials | null> {
  const { data } = await admin
    .from("payment_gateways")
    .select(COLUMNS)
    .eq("city", city).is("tenant_id", null)
    .eq("name", name)
    .maybeSingle();
  return credentialsFromRow(data as GatewayRow | null, city);
}

export const cashfreeCreds = (c: GatewayCredentials) => ({ appId: c.keyId, secretKey: c.keySecret, testMode: c.testMode });
