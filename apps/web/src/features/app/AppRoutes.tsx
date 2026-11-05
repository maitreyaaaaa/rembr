import { lazy, Suspense } from 'react';
import { BrowserRouter, Link, Navigate, Route, Routes } from 'react-router-dom';
import { api } from '../../app/api.js';
import { LibraryPage } from '../library/pages.js';
import { KnowledgeGraphPage } from '../knowledge/KnowledgeGraphPage.js';
import { AddPage, ImportsPage, ImportDetailPage } from '../imports/pages.js';
import { ItemDetailPage, ItemEditPage, NoteEditorPage } from '../items/pages.js';
import { SettingsPage } from '../settings/SettingsPage.js';
import { DeveloperAccessPage } from '../settings/DeveloperAccessPage.js';
import { McpAccessPage } from '../settings/McpAccessPage.js';
import { IntegrationsPage } from '../integrations/IntegrationsPage.js';
import { WorkOSMcpConsentPage } from '../auth/WorkOSMcpConsentPage.js';
import { DemoWorkspacePage } from '../demo/DemoWorkspacePage.js';
import { MemoryRecallPage } from '../knowledge/MemoryRecallPage.js';
import { AuthPage } from '../auth/AuthPage.js';
import { SetupRoute } from '../auth/SetupRoute.js';
import { ProtectedShell } from './ProtectedShell.js';
import { externalIntegrationsEnabled } from './feature-flags.js';

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

