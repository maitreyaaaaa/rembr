/**
 * Repair UTF-8 bytes that a source decoded as Latin-1 before returning text.
 * Only valid byte-like runs are changed; ordinary Unicode remains untouched.
 */
export function repairMisdecodedUtf8(value: string): string {
  if (!/[\u00c2-\u00f4][\u0080-\u00bf]/.test(value)) return value;
  return value.replace(/[\u0080-\u00ff]{2,}/g, (run) => {
    try { return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.from(run, 'latin1')); }
    catch { return run; }
  });
}
