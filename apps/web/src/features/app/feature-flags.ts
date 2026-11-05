export const externalIntegrationsEnabled = import.meta.env.VITE_EXTERNAL_INTEGRATIONS_ENABLED === 'true'
  || (import.meta.env.DEV && import.meta.env.VITE_EXTERNAL_INTEGRATIONS_ENABLED !== 'false');

