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

type GraphTab = 'details' | 'export';
type Point = { x: number; y: number };
type ActivePointer = Point & { pointerType: string };
type GestureState =
  | { type: 'pan'; pointerId: number; x: number; y: number; pan: Point }
  | { type: 'pinch'; pointerIds: [number, number]; distance: number; zoom: number; worldPoint: Point };

const graphTypeColors: Record<string, string> = {
  item: '#f4f4ef',
  topic: '#a5ff18',
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

function graphLayout(nodes: RembrGraphNode[], links: RembrGraphLink[]): Map<string, Point> {
  const points = new Map<string, Point>();
  const nodeIndex = new Map(nodes.map((node, index) => [node.id, index]));
  const velocity = nodes.map(() => ({ x: 0, y: 0 }));
  const degree = new Map(nodes.map((node) => [node.id, 0]));
  nodes.forEach((node, index) => {
    // A stable phyllotaxis seed keeps the force layout repeatable between visits.
    const angle = index * 2.399963;
    const radius = 24 + Math.sqrt(index + 1) * 19;
    points.set(node.id, { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius * 0.82 });
  });
  const edges = links.flatMap((link) => {
    const source = nodeIndex.get(link.source); const target = nodeIndex.get(link.target);
    if (source !== undefined && target !== undefined) {
      degree.set(link.source, (degree.get(link.source) ?? 0) + 1);
      degree.set(link.target, (degree.get(link.target) ?? 0) + 1);
    }
    return source === undefined || target === undefined ? [] : [[source, target] as const];
  });

  const radii = nodes.map((node) => Math.min(8, 2.8 + Math.sqrt(degree.get(node.id) ?? 0) * 0.55));
  // Stable force-directed relaxation: connections pull into topic clusters,
  // while all nodes repel and a light center force prevents unbounded drift.
  for (let iteration = 0; iteration < 120; iteration += 1) {
    const cooling = 1 - iteration / 150;
    for (let left = 0; left < nodes.length; left += 1) {
      const a = points.get(nodes[left]!.id)!;
      for (let right = left + 1; right < nodes.length; right += 1) {
        const b = points.get(nodes[right]!.id)!;
        let dx = a.x - b.x; let dy = a.y - b.y;
        let distance = Math.hypot(dx, dy);
        if (distance < 0.001) { dx = left < right ? -0.1 : 0.1; dy = 0.1; distance = Math.hypot(dx, dy); }
        const minimum = radii[left]! + radii[right]! + 18;
        const repulsion = Math.min(2.8, 1900 / (distance * distance)) + Math.max(0, minimum - distance) * 0.035;
        const force = repulsion * cooling;
        velocity[left]!.x += (dx / distance) * force;
        velocity[left]!.y += (dy / distance) * force;
        velocity[right]!.x -= (dx / distance) * force;
        velocity[right]!.y -= (dy / distance) * force;
      }
    }
    for (const [source, target] of edges) {
      const a = points.get(nodes[source]!.id)!; const b = points.get(nodes[target]!.id)!;
      const dx = b.x - a.x; const dy = b.y - a.y;
      const distance = Math.max(0.001, Math.hypot(dx, dy));
      const spring = Math.max(-2.4, Math.min(2.4, (distance - 82) * 0.008)) * cooling;
      velocity[source]!.x += (dx / distance) * spring; velocity[source]!.y += (dy / distance) * spring;
      velocity[target]!.x -= (dx / distance) * spring; velocity[target]!.y -= (dy / distance) * spring;
    }
    nodes.forEach((node, index) => {
      const point = points.get(node.id)!; const speed = velocity[index]!;
      speed.x += -point.x * 0.0011; speed.y += -point.y * 0.0011;
      point.x = Math.max(-470, Math.min(470, point.x + Math.max(-6, Math.min(6, speed.x))));
      point.y = Math.max(-285, Math.min(285, point.y + Math.max(-6, Math.min(6, speed.y))));
      speed.x *= 0.68; speed.y *= 0.68;
    });
  }
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
  const [hoveredNodeId, setHoveredNodeId] = useState('');
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const graphSvgRef = useRef<SVGSVGElement | null>(null);
  const activePointersRef = useRef(new Map<number, ActivePointer>());
  const gestureRef = useRef<GestureState | null>(null);
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

  const positions = useMemo(() => graphLayout(visibleGraph.nodes, visibleGraph.links), [visibleGraph.nodes, visibleGraph.links]);
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
  const focusNodeId = selectedNodeId || hoveredNodeId;
  const highlightedConnections = useMemo(() => {
    if (!focusNodeId || !graph) return [];
    const otherIds = new Set(graph.links.flatMap((link) => link.source === focusNodeId
      ? [link.target]
      : link.target === focusNodeId ? [link.source] : []));
    return graph.nodes.filter((node) => otherIds.has(node.id));
  }, [focusNodeId, graph]);

  useEffect(() => {
    if (selectedNodeId && !visibleGraph.nodes.some((node) => node.id === selectedNodeId)) setSelectedNodeId('');
  }, [selectedNodeId, visibleGraph.nodes]);

  useEffect(() => {
    const svg = graphSvgRef.current;
    if (!svg) return undefined;
    function wheelZoom(event: globalThis.WheelEvent) {
      event.preventDefault();
      const focal = graphPointAt(svg!, event.clientX, event.clientY);
      const nextZoom = Math.max(0.55, Math.min(2.8, zoom * Math.exp(-event.deltaY * 0.001)));
      const worldPoint = { x: (focal.x - 500 - pan.x) / zoom, y: (focal.y - 310 - pan.y) / zoom };
      setZoom(nextZoom);
      setPan({ x: focal.x - 500 - worldPoint.x * nextZoom, y: focal.y - 310 - worldPoint.y * nextZoom });
    }
    svg.addEventListener('wheel', wheelZoom, { passive: false });
    return () => svg.removeEventListener('wheel', wheelZoom);
  }, [pan, visibleGraph.nodes, zoom]);

  function selectNode(nodeId: string) {
    setSelectedNodeId((current) => current === nodeId ? '' : nodeId);
    setTab('details');
  }

  function resetView() {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setSelectedNodeId('');
    setHoveredNodeId('');
    gestureRef.current = null;
  }

  function graphPointAt(svg: SVGSVGElement, clientX: number, clientY: number): Point {
    const matrix = svg.getScreenCTM();
    if (matrix) {
      const point = svg.createSVGPoint();
      point.x = clientX; point.y = clientY;
      const viewPoint = point.matrixTransform(matrix.inverse());
      return { x: viewPoint.x, y: viewPoint.y };
    }
    const bounds = svg.getBoundingClientRect();
    return { x: ((clientX - bounds.left) / Math.max(1, bounds.width)) * 1000, y: ((clientY - bounds.top) / Math.max(1, bounds.height)) * 620 };
  }

  function beginPinch(svg: SVGSVGElement) {
    const points = Array.from(activePointersRef.current.entries()).slice(0, 2);
    if (points.length < 2) return;
    const [[firstId, first], [secondId, second]] = points as [[number, ActivePointer], [number, ActivePointer]];
    const clientX = (first.x + second.x) / 2;
    const clientY = (first.y + second.y) / 2;
    const focal = graphPointAt(svg, clientX, clientY);
    gestureRef.current = {
      type: 'pinch',
      pointerIds: [firstId, secondId],
      distance: Math.max(1, Math.hypot(second.x - first.x, second.y - first.y)),
      zoom,
      worldPoint: { x: (focal.x - 500 - pan.x) / zoom, y: (focal.y - 310 - pan.y) / zoom },
    };
    for (const [pointerId] of points) {
      try { svg.setPointerCapture(pointerId); } catch { /* Pointer may already have ended. */ }
    }
  }

  function pointerDown(event: PointerEvent<SVGSVGElement>) {
    const target = event.target as Element;
    const onNode = Boolean(target.closest('[data-graph-node]'));
    if (onNode && event.pointerType !== 'touch') return;
    activePointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY, pointerType: event.pointerType });
    if (activePointersRef.current.size >= 2) {
      beginPinch(event.currentTarget);
      event.preventDefault();
      return;
    }
    if (onNode) return;
    gestureRef.current = { type: 'pan', pointerId: event.pointerId, x: event.clientX, y: event.clientY, pan };
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* Ignore a pointer that ended during capture. */ }
    if (event.pointerType === 'touch') event.preventDefault();
  }

  function pointerMove(event: PointerEvent<SVGSVGElement>) {
    if (!activePointersRef.current.has(event.pointerId)) return;
    activePointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY, pointerType: event.pointerType });
    const gesture = gestureRef.current;
    if (activePointersRef.current.size >= 2) {
      if (gesture?.type !== 'pinch') beginPinch(event.currentTarget);
      const pinch = gestureRef.current;
      if (pinch?.type !== 'pinch') return;
      const first = activePointersRef.current.get(pinch.pointerIds[0]);
      const second = activePointersRef.current.get(pinch.pointerIds[1]);
      if (!first || !second) return;
      const distance = Math.max(1, Math.hypot(second.x - first.x, second.y - first.y));
      const nextZoom = Math.max(0.55, Math.min(2.8, pinch.zoom * distance / pinch.distance));
      const focal = graphPointAt(event.currentTarget, (first.x + second.x) / 2, (first.y + second.y) / 2);
      setZoom(nextZoom);
      setPan({ x: focal.x - 500 - pinch.worldPoint.x * nextZoom, y: focal.y - 310 - pinch.worldPoint.y * nextZoom });
      event.preventDefault();
      return;
    }
    if (gesture?.type === 'pan' && gesture.pointerId === event.pointerId) {
      setPan({ x: gesture.pan.x + event.clientX - gesture.x, y: gesture.pan.y + event.clientY - gesture.y });
      if (event.pointerType === 'touch') event.preventDefault();
    }
  }

  function pointerUp(event: PointerEvent<SVGSVGElement>) {
    activePointersRef.current.delete(event.pointerId);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    const remaining = Array.from(activePointersRef.current.entries())[0];
    if (remaining) {
      const [pointerId, point] = remaining;
      gestureRef.current = { type: 'pan', pointerId, x: point.x, y: point.y, pan };
    } else gestureRef.current = null;
  }

  const nodeIds = new Set(visibleGraph.nodes.map((node) => node.id));
  const connectedLinks = visibleGraph.links.filter((link) => nodeIds.has(link.source) && nodeIds.has(link.target));
  const highlightedNodeIds = new Set(highlightedConnections.map((node) => node.id));
  const nodeConnectionCounts = new Map<string, number>();
  for (const link of connectedLinks) {
    nodeConnectionCounts.set(link.source, (nodeConnectionCounts.get(link.source) ?? 0) + 1);
    nodeConnectionCounts.set(link.target, (nodeConnectionCounts.get(link.target) ?? 0) + 1);
  }

  return (
    <div className="mx-auto w-full max-w-[1480px] space-y-6 px-4 pb-10 pt-8 sm:px-6 md:px-10 md:py-12">
      <header className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div className="max-w-3xl">
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-primary">Knowledge graph</p>
          <h1 className="mt-3 font-display text-4xl font-bold tracking-tight md:text-6xl">Your saved library, connected.</h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground">See how saved pages and notes connect through analyzed topics, source domains, and entities found in their content.</p>
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
            <button type="button" onClick={() => setZoom((current) => Math.min(2.8, Number((current + 0.18).toFixed(2))))} aria-label="Zoom in" className="rounded-full p-2 text-muted-foreground transition hover:bg-white/10 hover:text-primary"><ZoomIn className="h-4 w-4" /></button>
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
              <div><div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl border border-primary/20 bg-primary/5 text-primary"><span aria-hidden="true">✳</span></div><h2 className="mt-4 font-display text-xl font-bold">Your graph is ready to grow</h2><p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">Save pages and notes. Connections appear as Rembr analyzes topics and entities in their content.</p></div>
            </div>
              : !visibleGraph.nodes.length ? <div className="grid h-full place-items-center px-8 text-center"><div><h2 className="font-display text-xl font-bold">No connections match this filter</h2><p className="mt-2 text-sm text-muted-foreground">Try a broader phrase or clear the search.</p><button type="button" onClick={() => onFilterChange('')} className="mt-4 rounded-full border border-white/10 px-4 py-2 text-xs font-semibold text-foreground transition hover:border-primary">Clear filter</button></div></div>
                : <svg ref={graphSvgRef} viewBox="0 0 1000 620" role="img" aria-label="Knowledge graph nodes and relationships. Scroll or pinch to zoom, drag to move." className="h-full w-full touch-none select-none cursor-grab active:cursor-grabbing" onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp}>
                  <rect width="1000" height="620" fill="transparent" />
                  <g transform={`translate(${500 + pan.x} ${310 + pan.y}) scale(${zoom})`}>
                    {connectedLinks.map((link) => {
                      const source = positions.get(link.source); const target = positions.get(link.target);
                      if (!source || !target) return null;
                      const highlighted = focusNodeId && (link.source === focusNodeId || link.target === focusNodeId);
                      return <line key={link.id} x1={source.x} y1={source.y} x2={target.x} y2={target.y} stroke={highlighted ? 'rgba(165,255,24,0.82)' : 'rgba(165,255,24,0.16)'} strokeWidth={highlighted ? 1.8 : 0.8} />;
                    })}
                    {visibleGraph.nodes.map((node) => {
                      const point = positions.get(node.id); if (!point) return null;
                      const isItem = node.type === 'item';
                      const selected = selectedNodeId === node.id;
                      const neighbor = highlightedNodeIds.has(node.id);
                      const dimmed = Boolean(focusNodeId && !selected && !neighbor);
                      const connectionCount = nodeConnectionCounts.get(node.id) ?? 0;
                      const radius = Math.min(7, (isItem ? 2.2 : 2.8) + Math.sqrt(connectionCount) * (isItem ? 0.3 : 0.52));
                      const showLabel = selected || neighbor || (zoom >= 1.75 && !isItem && connectionCount >= 5);
                      return <g key={node.id} data-graph-node data-node-id={node.id} transform={`translate(${point.x} ${point.y})`} role="button" tabIndex={0} aria-label={`${titleCase(node.type)}: ${node.label}`} aria-pressed={selected} opacity={dimmed ? 0.18 : 1} className="cursor-pointer outline-none" onMouseEnter={() => setHoveredNodeId(node.id)} onMouseLeave={() => setHoveredNodeId((current) => current === node.id ? '' : current)} onFocus={() => setHoveredNodeId(node.id)} onBlur={() => setHoveredNodeId((current) => current === node.id ? '' : current)} onClick={() => selectNode(node.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectNode(node.id); } }}>
                        <title>{node.label}</title><circle r={Math.max(9, radius + 4)} fill="transparent" /><circle r={radius + (selected ? 5 : neighbor ? 3 : 1.8)} fill={nodeColor(node.type)} opacity={selected ? '0.2' : '0.1'} /><circle r={radius} fill={nodeColor(node.type)} stroke={selected ? '#ffffff' : 'rgba(0,0,0,0.55)'} strokeWidth={selected ? 1.5 : 0.7} />
                        {showLabel && <text y={radius + 12} textAnchor="middle" className="pointer-events-none select-none fill-white text-[8px] font-semibold">{node.label.slice(0, 22)}</text>}
                      </g>;
                    })}
                  </g>
                </svg>}
        </section>

        <aside className="rounded-2xl border border-white/10 bg-white/[0.025] p-4 sm:p-5" aria-label="Graph details and tools">
          <div className="grid grid-cols-2 gap-1 rounded-xl border border-white/10 bg-black p-1" role="tablist" aria-label="Graph panel">
            {(['details', 'export'] as const).map((key) => <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)} className={`rounded-lg px-2 py-2 text-xs font-semibold transition sm:px-3 ${tab === key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-white/5 hover:text-foreground'}`}>{titleCase(key)}</button>)}
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

