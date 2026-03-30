// Indian States with GST state codes
export const INDIAN_STATES = [
  { code: "01", name: "Jammu and Kashmir" },
  { code: "02", name: "Himachal Pradesh" },
  { code: "03", name: "Punjab" },
  { code: "04", name: "Chandigarh" },
  { code: "05", name: "Uttarakhand" },
  { code: "06", name: "Haryana" },
  { code: "07", name: "Delhi" },
  { code: "08", name: "Rajasthan" },
  { code: "09", name: "Uttar Pradesh" },
  { code: "10", name: "Bihar" },
  { code: "11", name: "Sikkim" },
  { code: "12", name: "Arunachal Pradesh" },
  { code: "13", name: "Nagaland" },
  { code: "14", name: "Manipur" },
  { code: "15", name: "Mizoram" },
  { code: "16", name: "Tripura" },
  { code: "17", name: "Meghalaya" },
  { code: "18", name: "Assam" },
  { code: "19", name: "West Bengal" },
  { code: "20", name: "Jharkhand" },
  { code: "21", name: "Odisha" },
  { code: "22", name: "Chhattisgarh" },
  { code: "23", name: "Madhya Pradesh" },
  { code: "24", name: "Gujarat" },
  { code: "25", name: "Daman and Diu" },
  { code: "26", name: "Dadra and Nagar Haveli" },
  { code: "27", name: "Maharashtra" },
  { code: "28", name: "Andhra Pradesh (Old)" },
  { code: "29", name: "Karnataka" },
  { code: "30", name: "Goa" },
  { code: "31", name: "Lakshadweep" },
  { code: "32", name: "Kerala" },
  { code: "33", name: "Tamil Nadu" },
  { code: "34", name: "Puducherry" },
  { code: "35", name: "Andaman and Nicobar Islands" },
  { code: "36", name: "Telangana" },
  { code: "37", name: "Andhra Pradesh" },
  { code: "38", name: "Ladakh" },
  { code: "97", name: "Other Territory" },
];

// GSTIN format: 2-digit state + 10-char PAN + 1 entity + Z + checksum
const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

export function validateGSTIN(gstin: string): { valid: boolean; stateCode?: string; stateName?: string } {
  if (!gstin || gstin.length !== 15) return { valid: false };
  const upper = gstin.toUpperCase();
  if (!GSTIN_REGEX.test(upper)) return { valid: false };

  // Checksum validation
  const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const val = chars.indexOf(upper[i]);
    const factor = i % 2 === 0 ? 1 : 2;
    const product = val * factor;
    sum += Math.floor(product / 36) + (product % 36);
  }
  const checkDigit = (36 - (sum % 36)) % 36;
  if (chars[checkDigit] !== upper[14]) return { valid: false };

  const stateCode = upper.substring(0, 2);
  const state = INDIAN_STATES.find((s) => s.code === stateCode);

  return { valid: true, stateCode, stateName: state?.name };
}

export function getStateFromGSTIN(gstin: string): { stateCode: string; stateName: string } | null {
  if (!gstin || gstin.length < 2) return null;
  const stateCode = gstin.substring(0, 2);
  const state = INDIAN_STATES.find((s) => s.code === stateCode);
  if (!state) return null;
  return { stateCode, stateName: state.name };
}

// Determine if IGST or CGST+SGST applies
export function getGstType(businessStateCode: string, customerGstin?: string): "igst" | "cgst_sgst" {
  if (!customerGstin) return "cgst_sgst"; // B2C → intra-state
  const customerState = getStateFromGSTIN(customerGstin);
  if (!customerState) return "cgst_sgst";
  return customerState.stateCode !== businessStateCode ? "igst" : "cgst_sgst";
}

// Calculate GST for a line item
export interface GstLineItem {
  itemName: string;
  itemType: "product" | "service";
  hsnCode?: string;
  sacCode?: string;
  quantity: number;
  unitPrice: number;
  gstRate: number;
  productId?: string;
}

export interface CalculatedLineItem extends GstLineItem {
  taxableAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  lineTotal: number;
}

// All prices are GST-inclusive. This function reverse-calculates the taxable amount.
export function calculateLineItems(
  items: GstLineItem[],
  gstType: "igst" | "cgst_sgst"
): { lines: CalculatedLineItem[]; subtotal: number; cgstTotal: number; sgstTotal: number; igstTotal: number; total: number } {
  let subtotal = 0;
  let cgstTotal = 0;
  let sgstTotal = 0;
  let igstTotal = 0;

  const lines = items.map((item) => {
    const inclusiveAmount = item.quantity * item.unitPrice;
    // Reverse-calculate: taxable = inclusive / (1 + gstRate/100)
    const taxableAmount = Math.round((inclusiveAmount / (1 + item.gstRate / 100)) * 100) / 100;
    const totalGst = Math.round((inclusiveAmount - taxableAmount) * 100) / 100;
    const halfRate = item.gstRate / 2;
    let cgstAmount = 0;
    let sgstAmount = 0;
    let igstAmount = 0;

    if (gstType === "igst") {
      igstAmount = totalGst;
    } else {
      cgstAmount = Math.round((totalGst / 2) * 100) / 100;
      sgstAmount = Math.round((totalGst - cgstAmount) * 100) / 100; // remainder to avoid rounding mismatch
    }

    const lineTotal = inclusiveAmount; // Total stays the same (price is inclusive)
    subtotal += taxableAmount;
    cgstTotal += cgstAmount;
    sgstTotal += sgstAmount;
    igstTotal += igstAmount;

    return { ...item, taxableAmount, cgstAmount, sgstAmount, igstAmount, lineTotal };
  });

  return {
    lines,
    subtotal: Math.round(subtotal * 100) / 100,
    cgstTotal: Math.round(cgstTotal * 100) / 100,
    sgstTotal: Math.round(sgstTotal * 100) / 100,
    igstTotal: Math.round(igstTotal * 100) / 100,
    total: Math.round((subtotal + cgstTotal + sgstTotal + igstTotal) * 100) / 100,
  };
}
