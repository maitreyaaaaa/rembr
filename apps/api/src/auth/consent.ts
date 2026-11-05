export function consentedAtAfterAccountCreation(createdAt: string, now = new Date()): string {
  const current = now.toISOString();
  if (current > createdAt) return current;
  const creationTime = Date.parse(createdAt);
  return Number.isFinite(creationTime) ? new Date(creationTime + 1).toISOString() : current;
}
