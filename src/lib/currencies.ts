// Common world currencies with symbols
export const CURRENCIES = [
  { code: "INR", symbol: "₹", name: "Indian Rupee" },
  { code: "USD", symbol: "$", name: "US Dollar" },
  { code: "EUR", symbol: "€", name: "Euro" },
  { code: "GBP", symbol: "£", name: "British Pound" },
  { code: "AED", symbol: "د.إ", name: "UAE Dirham" },
  { code: "AUD", symbol: "A$", name: "Australian Dollar" },
  { code: "BDT", symbol: "৳", name: "Bangladeshi Taka" },
  { code: "BHD", symbol: "BD", name: "Bahraini Dinar" },
  { code: "BRL", symbol: "R$", name: "Brazilian Real" },
  { code: "CAD", symbol: "C$", name: "Canadian Dollar" },
  { code: "CHF", symbol: "CHF", name: "Swiss Franc" },
  { code: "CNY", symbol: "¥", name: "Chinese Yuan" },
  { code: "CZK", symbol: "Kč", name: "Czech Koruna" },
  { code: "DKK", symbol: "kr", name: "Danish Krone" },
  { code: "EGP", symbol: "E£", name: "Egyptian Pound" },
  { code: "HKD", symbol: "HK$", name: "Hong Kong Dollar" },
  { code: "HUF", symbol: "Ft", name: "Hungarian Forint" },
  { code: "IDR", symbol: "Rp", name: "Indonesian Rupiah" },
  { code: "ILS", symbol: "₪", name: "Israeli Shekel" },
  { code: "JPY", symbol: "¥", name: "Japanese Yen" },
  { code: "KES", symbol: "KSh", name: "Kenyan Shilling" },
  { code: "KRW", symbol: "₩", name: "South Korean Won" },
  { code: "KWD", symbol: "KD", name: "Kuwaiti Dinar" },
  { code: "LKR", symbol: "Rs", name: "Sri Lankan Rupee" },
  { code: "MAD", symbol: "MAD", name: "Moroccan Dirham" },
  { code: "MXN", symbol: "MX$", name: "Mexican Peso" },
  { code: "MYR", symbol: "RM", name: "Malaysian Ringgit" },
  { code: "NGN", symbol: "₦", name: "Nigerian Naira" },
  { code: "NOK", symbol: "kr", name: "Norwegian Krone" },
  { code: "NZD", symbol: "NZ$", name: "New Zealand Dollar" },
  { code: "OMR", symbol: "OMR", name: "Omani Rial" },
  { code: "PHP", symbol: "₱", name: "Philippine Peso" },
  { code: "PKR", symbol: "₨", name: "Pakistani Rupee" },
  { code: "PLN", symbol: "zł", name: "Polish Zloty" },
  { code: "QAR", symbol: "QR", name: "Qatari Riyal" },
  { code: "RON", symbol: "lei", name: "Romanian Leu" },
  { code: "RUB", symbol: "₽", name: "Russian Ruble" },
  { code: "SAR", symbol: "SR", name: "Saudi Riyal" },
  { code: "SEK", symbol: "kr", name: "Swedish Krona" },
  { code: "SGD", symbol: "S$", name: "Singapore Dollar" },
  { code: "THB", symbol: "฿", name: "Thai Baht" },
  { code: "TRY", symbol: "₺", name: "Turkish Lira" },
  { code: "TWD", symbol: "NT$", name: "Taiwan Dollar" },
  { code: "UAH", symbol: "₴", name: "Ukrainian Hryvnia" },
  { code: "VND", symbol: "₫", name: "Vietnamese Dong" },
  { code: "ZAR", symbol: "R", name: "South African Rand" },
] as const;

export type CurrencyCode = (typeof CURRENCIES)[number]["code"];

export function getCurrencySymbol(code: string): string {
  return CURRENCIES.find((c) => c.code === code)?.symbol ?? code;
}

export function getCurrencyName(code: string): string {
  return CURRENCIES.find((c) => c.code === code)?.name ?? code;
}

export function formatPrice(amount: number, currencyCode: string): string {
  const symbol = getCurrencySymbol(currencyCode);
  return `${symbol}${amount.toLocaleString()}`;
}
