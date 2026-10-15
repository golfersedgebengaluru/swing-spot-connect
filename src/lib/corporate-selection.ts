export function resolveCorporateSelection(accountIds: string[], selectedId: string): string | null {
  if (accountIds.length === 1) return accountIds[0];
  return accountIds.includes(selectedId) ? selectedId : null;
}

export function canRegisterCorporateMember(name: string, corporate: boolean, accountIds: string[]): boolean {
  return name.trim().length > 0 && (!corporate || accountIds.length > 0);
}