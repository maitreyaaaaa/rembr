import { useNavigate } from 'react-router-dom';
import Landing from './Landing.jsx';

export function PortedLanding() {
  const navigate = useNavigate();

  return <Landing
    onOpenApp={() => window.open('/app', '_blank', 'noopener,noreferrer')}
    onOpenLogin={() => navigate('/login')}
    onOpenPricing={() => navigate('/pricing')}
    onOpenHowTo={() => navigate('/how-to-use')}
    onOpenTerms={() => navigate('/terms')}
    onOpenPrivacy={() => navigate('/privacy')}
    onOpenHelp={() => navigate('/help')}
    onOpenContact={() => navigate('/contact')}
    onOpenSecurity={() => navigate('/security')}
    onOpenDataDeletion={() => navigate('/data-deletion')}
    onOpenCookies={() => navigate('/cookies')}
  />;
}
