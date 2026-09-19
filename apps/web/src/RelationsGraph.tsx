import { useEffect, useMemo, useRef, useState } from "react";
import type { ObjectRef, Relation } from "./relations-model";

type GraphNode = {
  key: string;
  ref: ObjectRef;
  x: number;
  y: number;
  vx: number;
  vy: number;
};

type HierarchyMeta = {
  depth: number;
  rootKey: string;
  targetX: number;
  targetY: number;
};

export type GraphStructureEdge = {
  id: string;
  a: ObjectRef;
  b: ObjectRef;
};

type Props = {
  relations: Relation[];
  objects: ObjectRef[];
  structureEdges?: GraphStructureEdge[];
  getTitle: (ref: ObjectRef) => string;
  getTypeLabel: (type: ObjectRef["type"]) => string;
  onOpen: (ref: ObjectRef) => void;
};

const WIDTH = 1000;
const HEIGHT = 610;
const MIN_ZOOM = 0.45;
const MAX_ZOOM = 3.2;

type GraphViewBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const INITIAL_VIEWBOX: GraphViewBox = {
  x: 0,
  y: 0,
  width: WIDTH,
  height: HEIGHT
};

function keyOf(ref: ObjectRef) {
  return `${ref.type}:${ref.id}`;
}

function hash(text: string) {
  let value = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    value ^= text.charCodeAt(i);
    value = Math.imul(value, 16777619);
  }
  return Math.abs(value >>> 0);
}

function shortTitle(value: string) {
  return value.length > 28 ? `${value.slice(0, 27)}…` : value;
}

export function RelationsGraph({ relations, objects, structureEdges = [], getTitle, getTypeLabel, onOpen }: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const simulationRef = useRef<GraphNode[]>([]);
  const frameRef = useRef<number | null>(null);
  const dragRef = useRef<{ key: string; moved: boolean } | null>(null);
  const panRef = useRef<{
    pointerId: number;
    clientX: number;
    clientY: number;
    viewBox: GraphViewBox;
  } | null>(null);
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [hovered, setHovered] = useState<string | null>(null);
  const [viewBox, setViewBox] = useState<GraphViewBox>(INITIAL_VIEWBOX);
  const viewBoxRef = useRef<GraphViewBox>(INITIAL_VIEWBOX);
  const [live, setLive] = useState(true);

  const nodeRefs = useMemo(() => {
    const map = new Map<string, ObjectRef>();
    objects.forEach((ref) => map.set(keyOf(ref), ref));
    relations.forEach((relation) => {
      map.set(keyOf(relation.a), relation.a);
      map.set(keyOf(relation.b), relation.b);
    });
    structureEdges.forEach((edge) => {
      map.set(keyOf(edge.a), edge.a);
      map.set(keyOf(edge.b), edge.b);
    });
    return Array.from(map.values());
  }, [objects, relations, structureEdges]);

  const edgeKeys = useMemo(
    () => [
      ...structureEdges.map((edge) => ({
        id: `structure:${edge.id}`,
        a: keyOf(edge.a),
        b: keyOf(edge.b),
        kind: "structure" as const
      })),
      ...relations.map((relation) => ({
        id: relation.id,
        a: keyOf(relation.a),
        b: keyOf(relation.b),
        kind: "relation" as const
      }))
    ],
    [relations, structureEdges]
  );

  const hierarchy = useMemo(() => {
    const parentByKey = new Map<string, string>();
    structureEdges.forEach((edge) => {
      parentByKey.set(keyOf(edge.b), keyOf(edge.a));
    });

    const refsByKey = new Map(nodeRefs.map((ref) => [keyOf(ref), ref]));
    const depthCache = new Map<string, number>();
    const rootCache = new Map<string, string>();

    const resolve = (key: string, stack = new Set<string>()): { depth: number; rootKey: string } => {
      if (depthCache.has(key) && rootCache.has(key)) {
        return { depth: depthCache.get(key)!, rootKey: rootCache.get(key)! };
      }
      if (stack.has(key)) {
        depthCache.set(key, 0);
        rootCache.set(key, key);
        return { depth: 0, rootKey: key };
      }
      const parent = parentByKey.get(key);
      if (!parent || !refsByKey.has(parent)) {
        depthCache.set(key, 0);
        rootCache.set(key, key);
        return { depth: 0, rootKey: key };
      }
      const nextStack = new Set(stack);
      nextStack.add(key);
      const resolvedParent = resolve(parent, nextStack);
      const result = { depth: resolvedParent.depth + 1, rootKey: resolvedParent.rootKey };
      depthCache.set(key, result.depth);
      rootCache.set(key, result.rootKey);
      return result;
    };

    const rootKeys = nodeRefs
      .map((ref) => keyOf(ref))
      .filter((key) => resolve(key).depth === 0)
      .sort((a, b) => a.localeCompare(b));

    const rootIndex = new Map(rootKeys.map((key, index) => [key, index]));
    const rootCount = Math.max(1, rootKeys.length);
    const centerX = WIDTH / 2;
    const centerY = HEIGHT / 2;

    const result = new Map<string, HierarchyMeta>();
    nodeRefs.forEach((ref) => {
      const key = keyOf(ref);
      const { depth, rootKey } = resolve(key);
      const index = rootIndex.get(rootKey) ?? 0;
      const rootAngle = -Math.PI / 2 + (index / rootCount) * Math.PI * 2;
      const sector = Math.min(.68, (Math.PI * 2 / rootCount) * .62);
      const jitterSeed = ((hash(key) % 1000) / 1000) - .5;
      const angle = rootAngle + (depth === 0 ? 0 : jitterSeed * sector);

      const radiusByDepth = [92, 190, 275, 345, 405];
      const rawRadius = radiusByDepth[Math.min(depth, radiusByDepth.length - 1)] + Math.max(0, depth - 4) * 48;
      const yCompression = .72;
      const targetX = centerX + Math.cos(angle) * rawRadius;
      const targetY = centerY + Math.sin(angle) * rawRadius * yCompression;

      result.set(key, { depth, rootKey, targetX, targetY });
    });

    return result;
  }, [nodeRefs, structureEdges]);

  const connectedToHovered = useMemo(() => {
    if (!hovered) return new Set<string>();
    const result = new Set<string>([hovered]);
    edgeKeys.forEach((edge) => {
      if (edge.a === hovered) result.add(edge.b);
      if (edge.b === hovered) result.add(edge.a);
    });
    return result;
  }, [edgeKeys, hovered]);

  useEffect(() => {
    const count = Math.max(1, nodeRefs.length);
    const previous = new Map(simulationRef.current.map((node) => [node.key, node]));
    const next = nodeRefs.map((ref, index) => {
      const key = keyOf(ref);
      const existing = previous.get(key);
      if (existing) return { ...existing };
      const meta = hierarchy.get(key);
      const fallbackAngle = (index / count) * Math.PI * 2;
      return {
        key,
        ref,
        x: meta?.targetX ?? WIDTH / 2 + Math.cos(fallbackAngle) * 180,
        y: meta?.targetY ?? HEIGHT / 2 + Math.sin(fallbackAngle) * 135,
        vx: 0,
        vy: 0
      };
    });
    simulationRef.current = next;
    setNodes(next.map((node) => ({ ...node })));
  }, [nodeRefs, hierarchy]);

  useEffect(() => {
    if (!live || simulationRef.current.length === 0) return;

    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(1.6, Math.max(.45, (now - last) / 16.67));
      last = now;
      const data = simulationRef.current;
      const byKey = new Map(data.map((node) => [node.key, node]));

      for (let i = 0; i < data.length; i += 1) {
        const a = data[i];
        for (let j = i + 1; j < data.length; j += 1) {
          const b = data[j];
          let dx = b.x - a.x;
          let dy = b.y - a.y;
          const dist2 = Math.max(220, dx * dx + dy * dy);
          const dist = Math.sqrt(dist2);
          const force = Math.min(2.4, 25000 / dist2);
          dx /= dist;
          dy /= dist;
          a.vx -= dx * force * dt;
          a.vy -= dy * force * dt;
          b.vx += dx * force * dt;
          b.vy += dy * force * dt;
        }
      }

      edgeKeys.forEach((edge) => {
        const a = byKey.get(edge.a);
        const b = byKey.get(edge.b);
        if (!a || !b) return;
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        const dist = Math.max(1, Math.sqrt(dx * dx + dy * dy));
        const childMeta = hierarchy.get(edge.b);
        const target = edge.kind === "structure"
          ? childMeta?.depth === 1 ? 112 : childMeta?.depth === 2 ? 96 : 84
          : 145;
        const force = (dist - target) * (edge.kind === "structure" ? .009 : .0048);
        dx /= dist;
        dy /= dist;
        a.vx += dx * force * dt;
        a.vy += dy * force * dt;
        b.vx -= dx * force * dt;
        b.vy -= dy * force * dt;
      });

      data.forEach((node) => {
        if (dragRef.current?.key === node.key) {
          node.vx = 0;
          node.vy = 0;
          return;
        }
        const meta = hierarchy.get(node.key);
        const targetX = meta?.targetX ?? WIDTH / 2;
        const targetY = meta?.targetY ?? HEIGHT / 2;
        const anchorStrength = meta?.depth === 0 ? .0075 : meta?.depth === 1 ? .0048 : .0032;
        node.vx += (targetX - node.x) * anchorStrength * dt;
        node.vy += (targetY - node.y) * anchorStrength * dt;
        node.vx *= .91;
        node.vy *= .91;
        node.x = Math.min(WIDTH - 44, Math.max(44, node.x + node.vx * dt));
        node.y = Math.min(HEIGHT - 38, Math.max(38, node.y + node.vy * dt));
      });

      setNodes(data.map((node) => ({ ...node })));
      frameRef.current = requestAnimationFrame(tick);
    };

    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [edgeKeys, hierarchy, live]);

  useEffect(() => {
    viewBoxRef.current = viewBox;
  }, [viewBox]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();

      const rect = svg.getBoundingClientRect();
      if (!rect.width || !rect.height) return;

      const current = viewBoxRef.current;
      const px = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
      const py = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
      const worldX = current.x + px * current.width;
      const worldY = current.y + py * current.height;

      const delta = event.deltaMode === 1
        ? event.deltaY * 16
        : event.deltaMode === 2
          ? event.deltaY * 420
          : event.deltaY;

      const factor = Math.exp(delta * 0.00125);
      const minWidth = WIDTH / MAX_ZOOM;
      const maxWidth = WIDTH / MIN_ZOOM;
      const nextWidth = Math.min(maxWidth, Math.max(minWidth, current.width * factor));
      const nextHeight = nextWidth * (HEIGHT / WIDTH);

      const next = {
        x: worldX - px * nextWidth,
        y: worldY - py * nextHeight,
        width: nextWidth,
        height: nextHeight
      };

      viewBoxRef.current = next;
      setViewBox(next);
    };

    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, []);

  function zoomFromCenter(multiplier: number) {
    const current = viewBoxRef.current;
    const centerX = current.x + current.width / 2;
    const centerY = current.y + current.height / 2;
    const minWidth = WIDTH / MAX_ZOOM;
    const maxWidth = WIDTH / MIN_ZOOM;
    const nextWidth = Math.min(maxWidth, Math.max(minWidth, current.width * multiplier));
    const nextHeight = nextWidth * (HEIGHT / WIDTH);
    const next = {
      x: centerX - nextWidth / 2,
      y: centerY - nextHeight / 2,
      width: nextWidth,
      height: nextHeight
    };
    viewBoxRef.current = next;
    setViewBox(next);
  }

  function toGraphPoint(clientX: number, clientY: number) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return { x: WIDTH / 2, y: HEIGHT / 2 };
    const current = viewBoxRef.current;
    return {
      x: current.x + ((clientX - rect.left) / rect.width) * current.width,
      y: current.y + ((clientY - rect.top) / rect.height) * current.height
    };
  }

  function resetGraph() {
    const count = Math.max(1, simulationRef.current.length);
    simulationRef.current.forEach((node, index) => {
      const meta = hierarchy.get(node.key);
      const fallbackAngle = (index / count) * Math.PI * 2;
      node.x = meta?.targetX ?? WIDTH / 2 + Math.cos(fallbackAngle) * 180;
      node.y = meta?.targetY ?? HEIGHT / 2 + Math.sin(fallbackAngle) * 135;
      node.vx = 0;
      node.vy = 0;
    });
    viewBoxRef.current = INITIAL_VIEWBOX;
    setViewBox(INITIAL_VIEWBOX);
    setLive(true);
  }

  const degreeByKey = new Map<string, number>();
  edgeKeys.forEach((edge) => {
    degreeByKey.set(edge.a, (degreeByKey.get(edge.a) ?? 0) + 1);
    degreeByKey.set(edge.b, (degreeByKey.get(edge.b) ?? 0) + 1);
  });

  const byKey = new Map(nodes.map((node) => [node.key, node]));

  return (
    <section className="relations-graph-shell">
      <header className="relations-graph-toolbar">
        <div>
          <strong>Карта связей</strong>
          <small>{nodes.length} объектов · {relations.length} ручных связей · {structureEdges.length} структурных</small>
        </div>
        <div className="relations-graph-actions">
          <button onClick={() => setLive((value) => !value)} className={live ? "active" : ""} title="Живая физика">{live ? "◉" : "○"}</button>
          <button onClick={() => zoomFromCenter(1.18)} aria-label="Уменьшить">−</button>
          <button onClick={() => zoomFromCenter(0.84)} aria-label="Увеличить">＋</button>
          <button onClick={resetGraph}>Центр</button>
        </div>
      </header>

      <div className="relations-graph-stage">
        <svg
          ref={svgRef}
          viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
          role="img"
          aria-label="Интерактивная карта связей"
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            const target = event.target as Element;
            if (event.target !== event.currentTarget && !target.classList.contains("relations-graph-pan-surface")) return;
            event.currentTarget.setPointerCapture(event.pointerId);
            panRef.current = {
              pointerId: event.pointerId,
              clientX: event.clientX,
              clientY: event.clientY,
              viewBox: { ...viewBoxRef.current }
            };
          }}
          onPointerMove={(event) => {
            const pan = panRef.current;
            if (!pan || pan.pointerId !== event.pointerId) return;
            const rect = event.currentTarget.getBoundingClientRect();
            if (!rect.width || !rect.height) return;
            const dx = event.clientX - pan.clientX;
            const dy = event.clientY - pan.clientY;
            const next = {
              x: pan.viewBox.x - dx * (pan.viewBox.width / rect.width),
              y: pan.viewBox.y - dy * (pan.viewBox.height / rect.height),
              width: pan.viewBox.width,
              height: pan.viewBox.height
            };
            viewBoxRef.current = next;
            setViewBox(next);
          }}
          onPointerUp={(event) => {
            if (panRef.current?.pointerId !== event.pointerId) return;
            panRef.current = null;
            try { event.currentTarget.releasePointerCapture(event.pointerId); } catch {}
          }}
          onPointerCancel={(event) => {
            if (panRef.current?.pointerId !== event.pointerId) return;
            panRef.current = null;
          }}
        >
          <defs>
            <filter id="nodeGlow" x="-80%" y="-80%" width="260%" height="260%">
              <feGaussianBlur stdDeviation="5" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>
          <rect
            className="relations-graph-pan-surface"
            x={viewBox.x}
            y={viewBox.y}
            width={viewBox.width}
            height={viewBox.height}
            fill="transparent"
          />
          <g>
            <g className="relations-graph-edges">
              {edgeKeys.map((edge) => {
                const a = byKey.get(edge.a);
                const b = byKey.get(edge.b);
                if (!a || !b) return null;
                const active = !hovered || edge.a === hovered || edge.b === hovered;
                return <line key={edge.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={`${edge.kind === "structure" ? "structure" : "relation"} ${active ? "active" : "dimmed"}`} />;
              })}
            </g>
            <g className="relations-graph-nodes">
              {nodes.map((node) => {
                const highlighted = !hovered || connectedToHovered.has(node.key);
                const meta = hierarchy.get(node.key);
                const depth = meta?.depth ?? 0;
                const degree = degreeByKey.get(node.key) ?? 0;
                const baseRadius = node.ref.type === "project"
                  ? depth === 0 ? 18 : depth === 1 ? 13.5 : depth === 2 ? 10.5 : 8.5
                  : depth <= 1 ? 10 : depth === 2 ? 8.5 : 7.5;
                const degreeBoost = depth === 0 ? Math.min(2, degree * .22) : 0;
                const radius = baseRadius + degreeBoost;
                const activeRadius = hovered === node.key ? radius + 2.5 : radius;
                return (
                  <g
                    key={node.key}
                    className={`graph-node node-${node.ref.type} depth-${Math.min(depth, 4)} ${highlighted ? "" : "dimmed"} ${hovered === node.key ? "hovered" : ""}`}
                    transform={`translate(${node.x} ${node.y})`}
                    onPointerEnter={() => setHovered(node.key)}
                    onPointerLeave={() => setHovered(null)}
                    onPointerDown={(event) => {
                      event.stopPropagation();
                      event.currentTarget.setPointerCapture(event.pointerId);
                      dragRef.current = { key: node.key, moved: false };
                    }}
                    onPointerMove={(event) => {
                      if (dragRef.current?.key !== node.key) return;
                      const point = toGraphPoint(event.clientX, event.clientY);
                      const target = simulationRef.current.find((item) => item.key === node.key);
                      if (!target) return;
                      if (Math.abs(target.x - point.x) > 2 || Math.abs(target.y - point.y) > 2) dragRef.current.moved = true;
                      target.x = point.x;
                      target.y = point.y;
                      target.vx = 0;
                      target.vy = 0;
                      setNodes(simulationRef.current.map((item) => ({ ...item })));
                    }}
                    onPointerUp={(event) => {
                      event.currentTarget.releasePointerCapture(event.pointerId);
                      const moved = dragRef.current?.moved;
                      dragRef.current = null;
                      if (!moved) onOpen(node.ref);
                    }}
                  >
                    <circle className="graph-node-halo" r={Math.max(24, radius + 12)} />
                    <circle className="graph-node-core" r={activeRadius} filter={hovered === node.key ? "url(#nodeGlow)" : undefined} />
                    <text className="graph-node-label" x="0" y="30" textAnchor="middle">{shortTitle(getTitle(node.ref))}</text>
                  </g>
                );
              })}
            </g>
          </g>
        </svg>
        <div className="relations-graph-legend">
          <span><i className="project" />Проект</span>
          <span><i className="task" />Задача</span>
          <span><i className="note" />Заметка</span>
          <small>Колесо — масштаб · потяни фон — перемещение</small>
        </div>
      </div>
    </section>
  );
}
