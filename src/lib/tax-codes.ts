/**
 * HSN / SAC tax codes.
 *
 * Every taxable line on a GST invoice has to carry a code, and the code has to
 * be clean: a stray leading space once split one SAC code (" 999652") into a
 * second, phantom row in the GSTR-1 summary. The database normalises and
 * enforces this too (`normalize_tax_codes`, `validate_product_tax_codes`,
 * `stamp_invoice_line_tax_codes`); these helpers keep the forms in step so the
 * user sees the problem before saving instead of a database error afterwards.
 */

export type TaxItemType = "product" | "service";

/** Trims and strips inner whitespace. Returns null for an empty code. */
export function normalizeTaxCode(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const cleaned = String(value).replace(/\s+/g, "");
  return cleaned === "" ? null : cleaned;
}

/** HSN: 4-8 digits. SAC: 4-6 digits. Both digits only. */
export function isValidTaxCodeFormat(
  value: string | null | undefined,
  itemType: TaxItemType
): boolean {
  const code = normalizeTaxCode(value);
  if (!code) return false;
  if (!/^\d+$/.test(code)) return false;
  return itemType === "product"
    ? code.length >= 4 && code.length <= 8
    : code.length >= 4 && code.length <= 6;
}

export interface TaxCodeSubject {
  itemType?: TaxItemType | string | null;
  gstRate?: number | string | null;
  hsnCode?: string | null;
  sacCode?: string | null;
  name?: string | null;
}

/** The code that applies to this item: HSN for goods, SAC for services. */
export function taxCodeFor(subject: TaxCodeSubject): string | null {
  const isProduct = subject.itemType !== "service";
  return normalizeTaxCode(isProduct ? subject.hsnCode : subject.sacCode)
    // A misfiled code still counts as a code — better than reporting none.
    ?? normalizeTaxCode(isProduct ? subject.sacCode : subject.hsnCode);
}

export interface TaxCodeCheck {
  valid: boolean;
  /** Present when invalid; safe to show to the user as-is. */
  message?: string;
}

/**
 * A taxable item needs a code. A zero-rated item may go without one, but if a
 * code is typed it must still look like a code.
 */
export function checkProductTaxCode(subject: TaxCodeSubject): TaxCodeCheck {
  const isProduct = subject.itemType !== "service";
  const label = isProduct ? "HSN" : "SAC";
  const rate = Number(subject.gstRate) || 0;
  const code = taxCodeFor(subject);

  if (!code) {
    if (rate > 0) {
      return {
        valid: false,
        message: `Add the ${label} code — it is required when GST is above 0%.`,
      };
    }
    return { valid: true };
  }

  if (!isValidTaxCodeFormat(code, isProduct ? "product" : "service")) {
    return {
      valid: false,
      message: isProduct
        ? "An HSN code is 4 to 8 digits, numbers only."
        : "A SAC code is 4 to 6 digits, numbers only.",
    };
  }

  return { valid: true };
}

export interface InvoiceLineTaxSubject {
  itemName?: string | null;
  itemType?: TaxItemType | string | null;
  gstRate?: number | string | null;
  hsnCode?: string | null;
  sacCode?: string | null;
}

/** Names of taxable lines with no usable code. Empty array = nothing to fix. */
export function invoiceLinesMissingTaxCode(
  lines: readonly InvoiceLineTaxSubject[]
): string[] {
  return lines
    .filter((line) => (Number(line.gstRate) || 0) > 0 && !taxCodeFor(line))
    .map((line, index) => normalizeName(line.itemName) ?? `Line ${index + 1}`);
}

function normalizeName(name: string | null | undefined): string | null {
  const trimmed = (name ?? "").trim();
  return trimmed === "" ? null : trimmed;
}
