export const integrationsPageEnabled = import.meta.env.VITE_INTEGRATIONS_PAGE_ENABLED === 'true'
  || (import.meta.env.DEV && import.meta.env.VITE_INTEGRATIONS_PAGE_ENABLED !== 'false');

