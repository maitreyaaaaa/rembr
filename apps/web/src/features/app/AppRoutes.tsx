import { lazy, Suspense } from 'react';
import { BrowserRouter, Link, Navigate, Route, Routes } from 'react-router-dom';
import { api } from '../../app/api.js';
import { lazyPage } from './lazyPage.js';
import { ProtectedShell } from './ProtectedShell.js';
import { externalIntegrationsEnabled } from './feature-flags.js';

const LibraryPage = lazyPage(() => import('../library/pages.js'), 'LibraryPage');
const KnowledgeGraphPage = lazyPage(() => import('../knowledge/KnowledgeGraphPage.js'), 'KnowledgeGraphPage');
const AddPage = lazyPage(() => import('../imports/pages.js'), 'AddPage');
const ImportsPage = lazyPage(() => import('../imports/pages.js'), 'ImportsPage');
const ImportDetailPage = lazyPage(() => import('../imports/pages.js'), 'ImportDetailPage');
const ItemDetailPage = lazyPage(() => import('../items/pages.js'), 'ItemDetailPage');
const ItemEditPage = lazyPage(() => import('../items/pages.js'), 'ItemEditPage');
const NoteEditorPage = lazyPage(() => import('../items/pages.js'), 'NoteEditorPage');
const SettingsPage = lazyPage(() => import('../settings/SettingsPage.js'), 'SettingsPage');
const DeveloperAccessPage = lazyPage(() => import('../settings/DeveloperAccessPage.js'), 'DeveloperAccessPage');
const McpAccessPage = lazyPage(() => import('../settings/McpAccessPage.js'), 'McpAccessPage');
const IntegrationsPage = lazyPage(() => import('../integrations/IntegrationsPage.js'), 'IntegrationsPage');
const WorkOSMcpConsentPage = lazyPage(() => import('../auth/WorkOSMcpConsentPage.js'), 'WorkOSMcpConsentPage');
const DemoWorkspacePage = lazyPage(() => import('../demo/DemoWorkspacePage.js'), 'DemoWorkspacePage');
const MemoryRecallPage = lazyPage(() => import('../knowledge/MemoryRecallPage.js'), 'MemoryRecallPage');
const AuthPage = lazyPage(() => import('../auth/AuthPage.js'), 'AuthPage');
const SetupRoute = lazyPage(() => import('../auth/SetupRoute.js'), 'SetupRoute');
const MarketingSite = lazy(() => import('../../MarketingSite.js').then(({ MarketingSite: page }) => ({ default: page })));
const PortedLanding = lazy(() => import('../marketing/PortedLanding.js').then(({ PortedLanding: page }) => ({ default: page })));
const HowToUsePage = lazy(() => import('../marketing/PublicPages.js').then(({ PortedHowToPage: page }) => ({ default: page })));
const HelpPage = lazy(() => import('../marketing/PublicPages.js').then(({ PortedHelpPage: page }) => ({ default: page })));
const PricingPage = lazy(() => import('../marketing/PublicPages.js').then(({ PortedPricingPage: page }) => ({ default: page })));
const LegalPage = lazy(() => import('../marketing/PublicPages.js').then(({ PortedLegalPage: page }) => ({ default: page })));
const SmartCollectionsPage = lazy(() => import('../../components/SmartCollectionsPage.js').then(({ SmartCollectionsPage: page }) => ({ default: page })));

export function AppRoutes() {
  return <BrowserRouter><Suspense fallback={<main className="center-state route-loading-fallback" role="status" aria-label="Loading page" />}><Routes>
    <Route path="/" element={<PortedLanding />} />
    <Route path="/features" element={<MarketingSite />} />
    <Route path="/about" element={<MarketingSite />} />
    <Route path="/contact" element={<MarketingSite />} />
    <Route path="/how-to-use" element={<HowToUsePage />} />
    <Route path="/help" element={<HelpPage />} />
    <Route path="/pricing" element={<PricingPage />} />
    <Route path="/terms" element={<LegalPage kind="terms" />} />
    <Route path="/privacy" element={<LegalPage kind="privacy" />} />
    <Route path="/security" element={<LegalPage kind="security" />} />
    <Route path="/data-deletion" element={<LegalPage kind="data-deletion" />} />
    <Route path="/cookies" element={<LegalPage kind="cookies" />} />
    <Route path="/login" element={<AuthPage />} />
    <Route path="/demo" element={<DemoWorkspacePage />} />
    {externalIntegrationsEnabled && <Route path="/auth/workos/mcp" element={<WorkOSMcpConsentPage />} />}
    <Route path="/app/setup/profile" element={<SetupRoute />} />
    <Route path="/app/setup/onboarding" element={<Navigate to="/app" replace />} />
    <Route path="/app" element={<ProtectedShell />}>
      <Route index element={<LibraryPage />} />
      <Route path="items/:itemId" element={<ItemDetailPage />} />
      <Route path="items/:itemId/edit" element={<ItemEditPage />} />
      <Route path="add" element={<AddPage />} />
      <Route path="imports" element={<ImportsPage />} />
      <Route path="imports/:importId" element={<ImportDetailPage />} />
      <Route path="notes/new" element={<NoteEditorPage />} />
      <Route path="notes/:itemId/edit" element={<NoteEditorPage />} />
      <Route path="smart-collections" element={<SmartCollectionsPage request={api} />} />
      <Route path="smart-collections/:collectionId" element={<SmartCollectionsPage request={api} />} />
      <Route path="graph" element={<KnowledgeGraphPage />} />
      <Route path="checkup" element={<Navigate to="/app" replace />} />
      <Route path="remember" element={<MemoryRecallPage />} />
      <Route path="settings/profile" element={<SettingsPage />} />
      <Route path="settings/preferences" element={<SettingsPage />} />
      <Route path="settings/advanced" element={<Navigate to="/app/graph" replace />} />
      {externalIntegrationsEnabled && <Route path="settings/developer-access" element={<DeveloperAccessPage />} />}
      {externalIntegrationsEnabled && <Route path="integrations" element={<IntegrationsPage />} />}
      {externalIntegrationsEnabled && <Route path="settings/mcp-access" element={<McpAccessPage />} />}
    </Route>
    <Route path="*" element={<NotFoundPage />} />
  </Routes></Suspense></BrowserRouter>;
}

function NotFoundPage() {
  return <main className="rg-page"><div className="rg-main"><section className="rg-intro"><p className="rg-kicker">404 / NOT FOUND</p><h1>This page is not here.</h1><p>Check the address or return to your Rembr library.</p><div className="rg-not-found-actions"><Link className="rg-button rg-button-primary" to="/">Go to Rembr home</Link><Link className="rg-button rg-button-secondary" to="/app" target="_blank" rel="noopener noreferrer">Open your library</Link></div></section></div></main>;
}

