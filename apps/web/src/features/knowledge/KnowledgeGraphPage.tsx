import type { KnowledgeGraph } from '../../app/contracts.js';
import { api } from '../../app/api.js';
import { messageOf } from '../../app/helpers.js';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RembrKnowledgeGraphPanel } from './RembrKnowledgeGraphPanel.js';

export function KnowledgeGraphPage() {
  const navigate = useNavigate();
  const [graph, setGraph] = useState<KnowledgeGraph | null>(null);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [exported, setExported] = useState(false);
  const [exportingObsidian, setExportingObsidian] = useState(false);
  const [obsidianExported, setObsidianExported] = useState(false);
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setGraph((await api<{ graph: KnowledgeGraph }>('/api/knowledge/graph')).graph); }
    catch (cause) { setError(messageOf(cause, 'Could not load your knowledge graph.')); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  function exportGraph() {
    if (!graph) return;
    const payload = {
      formatVersion: 1,
      product: 'Rembr',
      exportedAt: new Date().toISOString(),
      coverage: {
        indexedItems: graph.stats.indexedItems,
        conceptNodes: graph.stats.conceptNodes,
        links: graph.stats.links,
        complete: !graph.truncated,
        truncated: graph.truncated,
      },
      graph: { nodes: graph.nodes, links: graph.links, groups: graph.groups },
    };
    const blobUrl = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = blobUrl;
    anchor.download = `rembr-knowledge-graph-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    setExported(true);
    window.setTimeout(() => setExported(false), 1800);
  }
  async function exportObsidianGraph() {
    setExportingObsidian(true);
    setError('');
    try {
      const response = await fetch('/api/knowledge/graph/export/obsidian', { credentials: 'include' });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({})) as { error?: { code?: string; message?: string } };
        if (response.status === 401 || response.status === 403) window.dispatchEvent(new CustomEvent('rembr:auth-error', { detail: { status: response.status, code: payload.error?.code ?? 'request_failed' } }));
        throw new Error(payload.error?.message ?? 'Could not export the Obsidian graph. Try again.');
      }
      const blobUrl = URL.createObjectURL(await response.blob());
      const anchor = document.createElement('a');
      anchor.href = blobUrl;
      anchor.download = 'rembr-obsidian-graph.zip';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
      setObsidianExported(true);
      window.setTimeout(() => setObsidianExported(false), 1800);
    } catch (cause) {
      setError(messageOf(cause, 'Could not export the Obsidian graph. Try again.'));
    } finally {
      setExportingObsidian(false);
    }
  }

  return <RembrKnowledgeGraphPanel
    graph={graph}
    loading={loading}
    error={error}
    filter={filter}
    onFilterChange={setFilter}
    onRetry={() => void load()}
    onSelectItem={(itemId) => navigate(`/app/items/${encodeURIComponent(itemId)}`, { state: { returnTo: '/app/graph' } })}
    onExportJson={exportGraph}
    onExportObsidian={() => void exportObsidianGraph()}
    exportingObsidian={exportingObsidian}
    exported={exported}
    obsidianExported={obsidianExported}
  />;
}

