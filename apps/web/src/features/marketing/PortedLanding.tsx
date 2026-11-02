import { useNavigate } from 'react-router-dom';
import Landing from './Landing.jsx';

export function PortedLanding() {
  const navigate = useNavigate();

  return <Landing
    onOpenApp={() => navigate('/app')}
    onOpenLogin={() => navigate('/login')}
    onOpenPricing={() => navigate('/pricing')}
    onOpenHowTo={() => navigate('/how-to-use')}
    onOpenTerms={() => navigate('/terms')}
    onOpenPrivacy={() => navigate('/privacy')}
    onOpenHelp={() => navigate('/help')}
    onOpenSecurity={() => navigate('/security')}
    onOpenDataDeletion={() => navigate('/data-deletion')}
    onOpenCookies={() => navigate('/cookies')}
  />;
}
