import { useNavigate } from 'react-router-dom';
import HelpCenterPage from './HelpCenterPage.jsx';
import HowToUsePage from './HowToUsePage.jsx';
import LegalPage from './LegalPage.jsx';
import PricingPage from './PricingPage.jsx';

export function PortedHowToPage() {
  const navigate = useNavigate();
  return <HowToUsePage onBack={() => navigate('/')} onOpenApp={() => navigate('/app')} onStartTour={() => navigate('/app?tour=1')} />;
}

export function PortedHelpPage() {
  const navigate = useNavigate();
  return <HelpCenterPage onBack={() => navigate('/')} onOpenApp={() => navigate('/app')} onOpenHowTo={() => navigate('/how-to-use')} />;
}

export function PortedPricingPage() {
  const navigate = useNavigate();
  return <PricingPage onBack={() => navigate('/')} onOpenHelp={() => navigate('/contact')} />;
}

export function PortedLegalPage({ kind }: { kind: 'terms' | 'privacy' | 'security' | 'data-deletion' | 'cookies' }) {
  const navigate = useNavigate();
  const type = kind === 'data-deletion' ? 'dataDeletion' : kind;
  return <LegalPage type={type} onBack={() => navigate('/')} />;
}
