import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';

export function SavedItemLink({ itemId, className, children }: { itemId: string; className?: string; children: ReactNode }) {
  const location = useLocation();
  return <Link className={className} to={`/app/items/${encodeURIComponent(itemId)}`} state={{ returnTo: `${location.pathname}${location.search}` }}>{children}</Link>;
}
