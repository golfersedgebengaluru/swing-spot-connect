import type { Vendor } from "@/hooks/useVendors";

export const PRODUCT_CSV_HEADERS = [
  "name", "description", "price", "cost_price", "category", "item_type", "sku",
  "unit_of_measure", "hsn_code", "sac_code", "gst_rate", "in_stock", "opening_stock",
  "reorder_level", "reorder_quantity", "duration_minutes", "bookable", "city",
  "vendor_id", "vendor",
] as const;

export type ProductCsvHeader = (typeof PRODUCT_CSV_HEADERS)[number];

export function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (character === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += character;
    }
  }

  result.push(current.trim());
  return result;
}

export function escapeCSVValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

type VendorReference = Pick<Vendor, "id" | "name" | "city">;

export function getVendorName(vendorId: string | null | undefined, vendors: VendorReference[]): string {
  if (!vendorId) return "";
  return vendors.find((vendor) => vendor.id === vendorId)?.name ?? "";
}

/**
 * Resolve a CSV vendor without copying vendor details onto the product.
 * A valid ID wins. Otherwise an exact, case-insensitive name is accepted only
 * when it identifies one vendor (using the product city to disambiguate).
 */
export function resolveVendorId(
  vendorId: string | null | undefined,
  vendorName: string | null | undefined,
  productCity: string | null | undefined,
  vendors: VendorReference[],
): string | null {
  const trimmedId = vendorId?.trim();
  if (trimmedId && vendors.some((vendor) => vendor.id === trimmedId)) return trimmedId;

  const normalizedName = vendorName?.trim().toLocaleLowerCase();
  if (!normalizedName) {
    if (trimmedId) throw new Error(`Vendor ID '${trimmedId}' was not found.`);
    return null;
  }

  const nameMatches = vendors.filter(
    (vendor) => vendor.name.trim().toLocaleLowerCase() === normalizedName,
  );
  const cityMatches = productCity
    ? nameMatches.filter(
        (vendor) => vendor.city.trim().toLocaleLowerCase() === productCity.trim().toLocaleLowerCase(),
      )
    : [];
  const matches = cityMatches.length > 0 ? cityMatches : nameMatches;

  if (matches.length === 1) return matches[0].id;
  if (matches.length === 0) throw new Error(`Vendor '${vendorName?.trim()}' was not found.`);
  throw new Error(`Vendor '${vendorName?.trim()}' is ambiguous; provide vendor_id.`);
}