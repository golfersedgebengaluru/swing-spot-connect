/** Shared rule for a usable mobile number: at least 7 digits, country code included. */
export function isValidPhone(value: string | null | undefined): boolean {
  return (value ?? "").replace(/\D/g, "").length >= 7;
}
