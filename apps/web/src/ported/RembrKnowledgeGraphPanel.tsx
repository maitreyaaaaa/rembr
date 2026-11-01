import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { Check, Download, ExternalLink, RotateCcw, Search, ZoomIn, ZoomOut } from 'lucide-react';

export interface RembrGraphItem {
  id: string;
  title: string;
  status: string;
  createdAt: string;
}

export interface RembrGraphNode {
  id: string;
  type: string;
  label: string;
  itemId?: string;
  itemCount?: number;
}

export interface RembrGraphLink {
  id: string;
  source: string;
  target: string;
  type: string;
}

export interface RembrGraphGroup {
  id: string;
  type: string;
  label: string;
  itemCount: number;
  items: RembrGraphItem[];
}

export interface RembrKnowledgeGraph {
  nodes: RembrGraphNode[];
  links: RembrGraphLink[];
  groups: RembrGraphGroup[];
  stats: { indexedItems: number; conceptNodes: number; links: number };
  truncated: boolean;
}

export interface RembrKnowledgeGraphPanelProps {
  graph: RembrKnowledgeGraph | null;
  loading: boolean;
  error: string;
  filter: string;
  onFilterChange: (value: string) => void;
  onRetry: () => void;
  onSelectItem: (itemId: string) => void;
  onExportJson: () => void;
  onExportObsidian: () => void;
  exportingObsidian: boolean;
  exported: boolean;
  obsidianExported: boolean;
}

type GraphTab = 'details' | 'explore' | 'export';
type Point = { x: number; y: number };
type DragState = { x: number; y: number; pan: Point; moved: boolean };

const graphTypeColors: Record<string, string> = {
  item: '#f4f4ef',
  topic: '#a5ff18',
  tag: '#22d3ee',
  collection: '#c084fc',
  domain: '#fb923c',
  brand: '#60a5fa',
  tool: '#94a3b8',
  person: '#f472b6',
  repository: '#a78bfa',
};

function nodeColor(type: string): string {
  return graphTypeColors[type] ?? '#a5ff18';
}

function titleCase(value: string): string {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function graphLayout(nodes: RembrGraphNode[]): Map<string, Point> {
  const concepts = nodes.filter((node) => node.type !== 'item');
  const items = nodes.filter((node) => node.type === 'item');
  const points = new Map<string, Point>();
  const placeColumn = (column: RembrGraphNode[], x: number) => {
    const spacing = 548 / Math.max(column.length, 1);
    column.forEach((node, index) => points.set(node.id, { x, y: 36 + spacing * (index + 0.5) }));
  };
  placeColumn(concepts, 255);
  placeColumn(items, 745);
  return points;
}

export function RembrKnowledgeGraphPanel({
  graph,
  loading,
  error,
  filter,
  onFilterChange,
  onRetry,
  onSelectItem,
  onExportJson,
  onExportObsidian,
  exportingObsidian,
  exported,
  obsidianExported,
}: RembrKnowledgeGraphPanelProps) {
  const [tab, setTab] = useState<GraphTab>('details');
  const [selectedNodeId, setSelectedNodeId] = useState('');
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const dragRef = useRef<DragState | null>(null);
  const query = filter.trim().toLowerCase();

  const filteredGroups = useMemo(() => {
    const groups = graph?.groups ?? [];
    if (!query) return groups;
    return groups.filter((group) => group.label.toLowerCase().includes(query)
      || group.items.some((item) => item.title.toLowerCase().includes(query)));
  }, [graph, query]);

  const visibleGraph = useMemo(() => {
    if (!graph || !query) return { nodes: graph?.nodes ?? [], links: graph?.links ?? [] };
    const conceptIds = new Set(filteredGroups.map((group) => group.id));
    const itemIds = new Set(filteredGroups.flatMap((group) => group.items.map((item) => item.id)));
    const nodes = graph.nodes.filter((node) => node.type === 'item'
      ? Boolean(node.itemId && itemIds.has(node.itemId))
      : conceptIds.has(node.id));
    const nodeIds = new Set(nodes.map((node) => node.id));
    return { nodes, links: graph.links.filter((link) => nodeIds.has(link.source) && nodeIds.has(link.target)) };
  }, [filteredGroups, graph, query]);

  const positions = useMemo(() => graphLayout(visibleGraph.nodes), [visibleGraph.nodes]);
  const selectedNode = graph?.nodes.find((node) => node.id === selectedNodeId) ?? null;
  const selectedItem = selectedNode?.type === 'item'
    ? graph?.groups.flatMap((group) => group.items).find((item) => item.id === selectedNode.itemId)
    : undefined;
  const selectedConnections = useMemo(() => {
    if (!selectedNodeId || !graph) return [];
    const otherIds = new Set(graph.links.flatMap((link) => link.source === selectedNodeId
      ? [link.target]
      : link.target === selectedNodeId ? [link.source] : []));
    return graph.nodes.filter((node) => otherIds.has(node.id)).slice(0, 18);
  }, [graph, selectedNodeId]);

  useEffect(() => {
    if (selectedNodeId && !visibleGraph.nodes.some((node) => node.id === selectedNodeId)) setSelectedNodeId('');
  }, [selectedNodeId, visibleGraph.nodes]);

  function selectNode(nodeId: string) {
    setSelectedNodeId((current) => current === nodeId ? '' : nodeId);
    setTab('details');
  }

  function resetView() {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setSelectedNodeId('');
  }

  function pointerDown(event: PointerEvent<SVGSVGElement>) {
    if (event.pointerType === 'touch') return;
    const target = event.target as Element;
    // Node selection is handled by the node's click/keyboard handlers. Capturing
    // the pointer here as well would select and then immediately deselect it.
    if (target.closest('[data-graph-node]')) return;
    dragRef.current = { x: event.clientX, y: event.clientY, pan, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function pointerMove(event: PointerEvent<SVGSVGElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (Math.hypot(dx, dy) > 3) drag.moved = true;
    if (drag.moved) setPan({ x: drag.pan.x + dx, y: drag.pan.y + dy });
  }

  function pointerUp(event: PointerEvent<SVGSVGElement>) {
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  const nodeIds = new Set(visibleGraph.nodes.map((node) => node.id));
  const connectedLinks = visibleGraph.links.filter((link) => nodeIds.has(link.source) && nodeIds.has(link.target));

  return (
    <div className="mx-auto w-full max-w-[1480px] space-y-6 px-4 pb-10 pt-8 sm:px-6 md:px-10 md:py-12">
      <header className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div className="max-w-3xl">
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-primary">Knowledge graph</p>
          <h1 className="mt-3 font-display text-4xl font-bold tracking-tight md:text-6xl">Your saved library, connected.</h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground">Explore how your saved pages and notes connect through topics, tags, collections, domains, and typed entities.</p>
        </div>
        <label className="grid w-full gap-2 text-xs font-semibold text-muted-foreground sm:max-w-sm">
          <span className="inline-flex items-center gap-2"><Search className="h-3.5 w-3.5" /> Filter concepts and linked saves</span>
          <input type="search" maxLength={80} value={filter} onChange={(event) => onFilterChange(event.currentTarget.value)} placeholder="Topic, tag, entity, or page"
            className="min-h-11 w-full rounded-xl border border-white/10 bg-black px-4 text-sm font-normal text-foreground outline-none transition placeholder:text-muted-foreground focus:border-primary" />
        </label>
      </header>

      {error && <div className="flex flex-col gap-3 rounded-xl border border-destructive/35 bg-destructive/10 p-4 text-sm text-destructive sm:flex-row sm:items-center sm:justify-between" role="alert"><span>{error}</span><button type="button" onClick={onRetry} className="inline-flex min-h-9 items-center justify-center rounded-lg border border-destructive/30 px-3 font-semibold transition hover:bg-destructive/10">Try again</button></div>}

      <div className="grid gap-3 sm:grid-cols-3" aria-label="Knowledge graph summary">
        {loading ? [0, 1, 2].map((index) => <div key={index} aria-hidden="true" className="is-loading-surface h-24 rounded-xl" />) : <>
          <GraphStat label="Indexed saves" value={graph?.stats.indexedItems ?? 0} />
          <GraphStat label="Concept nodes" value={graph?.stats.conceptNodes ?? 0} />
          <GraphStat label="Graph links" value={graph?.stats.links ?? 0} />
        </>}
      </div>

      {graph?.truncated && !loading && <p className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-xs leading-5 text-muted-foreground" role="status">This graph is bounded to the latest indexed saves and strongest concepts. The export includes its coverage status.</p>}

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="relative h-[360px] overflow-hidden rounded-2xl border border-white/10 bg-white/[0.025] shadow-2xl shadow-black/25 sm:h-[410px] lg:h-[470px] xl:h-[540px]" aria-label="Interactive knowledge graph">
          <div className="absolute left-3 top-3 z-10 flex items-center gap-1 rounded-full border border-white/10 bg-black/85 p-1 backdrop-blur sm:left-4 sm:top-4">
            <button type="button" onClick={() => setZoom((current) => Math.min(2.6, Number((current + 0.18).toFixed(2))))} aria-label="Zoom in" className="rounded-full p-2 text-muted-foreground transition hover:bg-white/10 hover:text-primary"><ZoomIn className="h-4 w-4" /></button>
            <button type="button" onClick={() => setZoom((current) => Math.max(0.55, Number((current - 0.18).toFixed(2))))} aria-label="Zoom out" className="rounded-full p-2 text-muted-foreground transition hover:bg-white/10 hover:text-primary"><ZoomOut className="h-4 w-4" /></button>
            <button type="button" onClick={resetView} aria-label="Reset graph view" className="rounded-full p-2 text-muted-foreground transition hover:bg-white/10 hover:text-primary"><RotateCcw className="h-4 w-4" /></button>
            <span className="pr-2 font-mono text-[10px] text-muted-foreground">{Math.round(zoom * 100)}%</span>
          </div>
          {!loading && graph && visibleGraph.nodes.length > 0 && <div className="absolute bottom-3 left-3 z-10 flex max-w-[calc(100%-1.5rem)] flex-wrap gap-1.5 sm:bottom-4 sm:left-4 sm:gap-2">
            {Array.from(new Set(graph.nodes.map((node) => node.type))).map((type) => <span key={type} className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/75 px-2 py-1 font-mono text-[9px] uppercase tracking-wider text-muted-foreground sm:px-2.5 sm:text-[10px]">
              <span className="h-2 w-2 rounded-full" style={{ background: nodeColor(type) }} />{titleCase(type)}
            </span>)}
          </div>}

          {loading ? <div className="h-full p-5"><div aria-hidden="true" className="is-loading-surface h-full rounded-xl" /></div>
            : !graph?.nodes.length ? <div className="grid h-full place-items-center px-8 text-center">
              <div><div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl border border-primary/20 bg-primary/5 text-primary"><span aria-hidden="true">✳</span></div><h2 className="mt-4 font-display text-xl font-bold">Your graph is ready to grow</h2><p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">Save pages, add tags or collections, or enrich eligible saves to create connections.</p></div>
            </div>
              : !visibleGraph.nodes.length ? <div className="grid h-full place-items-center px-8 text-center"><div><h2 className="font-display text-xl font-bold">No connections match this filter</h2><p className="mt-2 text-sm text-muted-foreground">Try a broader phrase or clear the search.</p><button type="button" onClick={() => onFilterChange('')} className="mt-4 rounded-full border border-white/10 px-4 py-2 text-xs font-semibold text-foreground transition hover:border-primary">Clear filter</button></div></div>
                : <svg viewBox="0 0 1000 620" role="img" aria-label="Knowledge graph nodes and relationships" className="h-full w-full touch-none select-none cursor-grab active:cursor-grabbing" onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={() => { dragRef.current = null; }}>
                  <rect width="1000" height="620" fill="transparent" />
                  <g transform={`translate(${500 + pan.x} ${310 + pan.y}) scale(${zoom})`}>
                    {connectedLinks.map((link) => {
                      const source = positions.get(link.source); const target = positions.get(link.target);
                      if (!source || !target) return null;
                      const selected = selectedNodeId && (link.source === selectedNodeId || link.target === selectedNodeId);
                      return <line key={link.id} x1={source.x} y1={source.y} x2={target.x} y2={target.y} stroke={selected ? 'rgba(165,255,24,0.78)' : 'rgba(165,255,24,0.18)'} strokeWidth={selected ? 2 : 0.9} />;
                    })}
                    {visibleGraph.nodes.map((node) => {
                      const point = positions.get(node.id); if (!point) return null;
                      const isItem = node.type === 'item';
                      const selected = selectedNodeId === node.id;
                      const neighbor = selectedConnections.some((connection) => connection.id === node.id);
                      const dimmed = Boolean(selectedNodeId && !selected && !neighbor);
                      const radius = isItem ? 8 : Math.min(17, 5 + Math.sqrt(node.itemCount ?? 1) * 3);
                      const showLabel = selected || neighbor || isItem || (node.itemCount ?? 0) >= 3;
                      return <g key={node.id} data-graph-node data-node-id={node.id} transform={`translate(${point.x} ${point.y})`} role="button" tabIndex={0} aria-label={`${titleCase(node.type)}: ${node.label}`} aria-pressed={selected} opacity={dimmed ? 0.22 : 1} className="cursor-pointer outline-none" onClick={() => selectNode(node.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectNode(node.id); } }}>
                        <title>{node.label}</title><circle r={radius + (selected ? 9 : 5)} fill={nodeColor(node.type)} opacity="0.16" /><circle r={radius} fill={nodeColor(node.type)} stroke={selected ? '#ffffff' : 'rgba(0,0,0,0.55)'} strokeWidth={selected ? 2 : 1} />
                        {showLabel && <text y={radius + 16} textAnchor="middle" className="pointer-events-none select-none fill-white text-[10px] font-semibold">{node.label.slice(0, 24)}</text>}
                      </g>;
                    })}
                  </g>
                </svg>}
        </section>

        <aside className="rounded-2xl border border-white/10 bg-white/[0.025] p-4 sm:p-5" aria-label="Graph details and tools">
          <div className="grid grid-cols-3 gap-1 rounded-xl border border-white/10 bg-black p-1" role="tablist" aria-label="Graph panel">
            {(['details', 'explore', 'export'] as const).map((key) => <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)} className={`rounded-lg px-2 py-2 text-xs font-semibold transition sm:px-3 ${tab === key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-white/5 hover:text-foreground'}`}>{titleCase(key)}</button>)}
          </div>

          {tab === 'details' && <div className="mt-5">
            <div className="flex items-start gap-3"><span className="mt-1 h-3 w-3 shrink-0 rounded-full" style={{ background: nodeColor(selectedNode?.type ?? 'item') }} /><div className="min-w-0"><div className="font-mono text-[10px] uppercase tracking-[0.24em] text-primary">{selectedNode ? titleCase(selectedNode.type) : 'Selection'}</div><h2 className="mt-1 line-clamp-2 font-display text-xl font-bold tracking-tight">{selectedNode?.label ?? 'Click a node'}</h2></div></div>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">{selectedNode ? selectedNode.type === 'item' ? selectedItem ? `${titleCase(selectedItem.status)} save${selectedItem.createdAt ? ` · added ${new Date(selectedItem.createdAt).toLocaleDateString()}` : ''}.` : 'Saved item in your library.' : `${selectedNode.itemCount ?? selectedConnections.length} linked saves or concepts.` : 'Select any node to inspect its nearby connections.'}</p>
            {selectedNode?.type === 'item' && selectedNode.itemId && <button type="button" onClick={() => onSelectItem(selectedNode.itemId!)} className="mt-3 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:scale-[1.01]">Open save detail <ExternalLink className="h-3.5 w-3.5" /></button>}
            <div className="mt-5 border-t border-white/10 pt-4"><div className="mb-2 font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Connected nodes</div>
              {selectedConnections.length ? <div className="max-h-72 space-y-2 overflow-y-auto pr-1">{selectedConnections.map((node) => <button key={node.id} type="button" onClick={() => selectNode(node.id)} className="flex min-h-10 w-full items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-left text-xs transition hover:border-primary"><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: nodeColor(node.type) }} /><span className="min-w-0 flex-1 truncate">{node.label}</span><span className="text-[10px] uppercase text-muted-foreground">{titleCase(node.type)}</span></button>)}</div>
                : <p className="text-sm leading-6 text-muted-foreground">{selectedNode ? 'No nearby nodes found.' : 'Select a node to see its connections.'}</p>}
            </div>
          </div>}

          {tab === 'explore' && <div className="mt-5 space-y-5">
            <section><div className="font-mono text-[10px] uppercase tracking-[0.22em] text-primary">Top concepts</div><div className="mt-3 flex max-h-40 flex-wrap gap-2 overflow-y-auto pr-1">
              {filteredGroups.slice(0, 24).map((group) => <button key={group.id} type="button" onClick={() => selectNode(group.id)} aria-pressed={selectedNodeId === group.id} className={`rounded-full border px-3 py-1.5 text-xs transition ${selectedNodeId === group.id ? 'border-primary bg-primary/10 text-primary' : 'border-white/10 text-muted-foreground hover:border-primary hover:text-foreground'}`}>{group.label}</button>)}
              {!loading && filteredGroups.length === 0 && <span className="text-sm text-muted-foreground">{query ? 'No concepts match this filter.' : 'No concept nodes yet.'}</span>}
            </div></section>
            <section className="border-t border-white/10 pt-4"><div className="font-mono text-[10px] uppercase tracking-[0.22em] text-primary">Linked saves</div><div className="mt-3 max-h-80 space-y-2 overflow-y-auto pr-1">
              {Array.from(new Map(filteredGroups.flatMap((group) => group.items).map((item) => [item.id, item])).values()).slice(0, 40).map((item) => <button key={item.id} type="button" onClick={() => onSelectItem(item.id)} className="block w-full rounded-xl border border-white/10 p-3 text-left transition hover:border-primary"><span className="block line-clamp-1 text-sm font-semibold">{item.title}</span><span className="mt-1 block text-xs text-muted-foreground">{titleCase(item.status)}</span></button>)}
              {!loading && filteredGroups.length > 0 && !filteredGroups.some((group) => group.items.length) && <span className="text-sm text-muted-foreground">No linked saves are included in this graph sample.</span>}
              {!loading && filteredGroups.length === 0 && !query && <span className="text-sm text-muted-foreground">No linked saves yet.</span>}
            </div></section>
          </div>}

          {tab === 'export' && <div className="mt-5 space-y-4"><div><h2 className="font-display text-xl font-bold tracking-tight">Take your graph with you</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">Download the current graph data as JSON or export notes and links for Obsidian.</p></div>
            {graph?.truncated && <p className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs leading-5 text-muted-foreground">This export reflects the bounded graph shown here, with truncation reported in the export metadata.</p>}
            <div className="grid gap-2"><button type="button" onClick={onExportObsidian} disabled={exportingObsidian || !graph} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition hover:scale-[1.01] disabled:cursor-wait disabled:opacity-60"><Download className="h-4 w-4" />{exportingObsidian ? 'Preparing Obsidian export…' : obsidianExported ? 'Obsidian export downloaded' : 'Export Obsidian graph'}</button>
              <button type="button" onClick={onExportJson} disabled={!graph} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/10 px-4 py-3 text-sm font-semibold text-foreground transition hover:border-primary hover:text-primary disabled:opacity-50"><Check className="h-4 w-4" />{exported ? 'Graph JSON downloaded' : 'Download graph JSON'}</button></div>
          </div>}
        </aside>
      </div>
    </div>
  );
}

function GraphStat({ label, value }: { label: string; value: number }) {
  return <div className="rounded-xl border border-white/10 bg-white/[0.025] p-4"><div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{label}</div><div className="mt-2 font-display text-3xl font-bold">{value}</div></div>;
}

