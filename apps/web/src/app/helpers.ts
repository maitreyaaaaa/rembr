import type { Status } from './contracts.js';

export function messageOf(error: unknown, fallback: string): string {
  if (error instanceof Error && 'status' in error && typeof error.status === 'number') return error.message;
  return fallback;
}
export function readableStatus(status: Status): string {
  return ({ queued: 'Waiting to process', processing: 'Saving page content', retry_wait: 'Retry scheduled', cancel_requested: 'Canceling', cancelled: 'Canceled', paused: 'Paused', partial: 'Partially ready', ready: 'Ready to read', failed: 'Could not process' })[status];
}
export function date(value?: string): string {
  if (!value) return '';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '' : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(parsed);
}
export function sameAppPath(value: string | null | undefined): string {
  if (!value) return '/app';
  const pathname = value.split(/[?#]/, 1)[0] ?? '';
  return pathname === '/auth/workos/mcp' || pathname === '/app' || pathname.startsWith('/app/') ? value : '/app';
}
