import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Banner as SourceBanner } from '../features/marketing/Common.jsx';

export function PageHeader({ title, description, actions }: { title: string; description: string; actions?: ReactNode }) {
  return <div className="phase2-page-heading"><div><h1>{title}</h1><p>{description}</p></div>{actions && <div className="phase2-heading-actions">{actions}</div>}</div>;
}

export function ErrorState({ message }: { message: string }) { return <div className="phase2-state phase2-error-state" role="alert"><h2>We could not open this view.</h2><SourceBanner type="error">{message}</SourceBanner><div className="phase2-heading-actions"><button className="quiet-button" type="button" onClick={() => window.location.reload()}>Try again</button><Link className="quiet-button" to="/app">Back to library</Link></div></div>; }
