import type { ReactNode } from 'react';
import { AlertCircle } from 'lucide-react';
import { Link } from 'react-router-dom';

export function PageHeader({ title, description, actions }: { title: string; description: string; actions?: ReactNode }) {
  return <div className="phase2-page-heading"><div><h1>{title}</h1><p>{description}</p></div>{actions && <div className="phase2-heading-actions">{actions}</div>}</div>;
}

export function ErrorState({ message }: { message: string }) {
  return (
    <section className="phase2-error-panel" role="alert" aria-labelledby="phase2-error-title">
      <div className="phase2-error-icon" aria-hidden="true"><AlertCircle size={18} /></div>
      <div className="phase2-error-copy">
        <h2 id="phase2-error-title">This page couldn’t be opened</h2>
        <p>{message}</p>
        <div className="phase2-error-actions">
          <button className="quiet-button" type="button" onClick={() => window.location.reload()}>Try again</button>
          <Link className="primary-button" to="/app">Back to library</Link>
        </div>
      </div>
    </section>
  );
}
