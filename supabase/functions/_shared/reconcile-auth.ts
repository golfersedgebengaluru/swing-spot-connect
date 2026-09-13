export function hasValidReconcileSecret(
  providedSecret: string | null,
  expectedSecret: string | undefined,
): boolean {
  if (!providedSecret || !expectedSecret) return false;

  const comparisonLength = Math.max(providedSecret.length, expectedSecret.length);
  let difference = providedSecret.length ^ expectedSecret.length;

  for (let index = 0; index < comparisonLength; index += 1) {
    difference |= (providedSecret.charCodeAt(index) || 0) ^ (expectedSecret.charCodeAt(index) || 0);
  }

  return difference === 0;
}