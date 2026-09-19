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

const PROJECTS_GRAPH_ROOT_ID = "__projects_root__";

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
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [hovered, setHovered] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
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
      if (ref.type === "project" && ref.id === PROJECTS_GRAPH_ROOT_ID) {
        return {
          key,
          ref,
          x: WIDTH / 2,
          y: HEIGHT / 2,
          vx: 0,
          vy: 0
        };
      }
      const angle = (index / count) * Math.PI * 2;
      const jitter = (hash(key) % 130) - 65;
      const radius = 175 + (hash(`${key}:r`) % 95);
      return {
        key,
        ref,
        x: WIDTH / 2 + Math.cos(angle) * radius + jitter,
        y: HEIGHT / 2 + Math.sin(angle) * radius + jitter * .42,
        vx: 0,
        vy: 0
      };
    });
    simulationRef.current = next;
    setNodes(next.map((node) => ({ ...node })));
  }, [nodeRefs]);

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
        const target = 150;
        const force = (dist - target) * .0052;
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
        const isProjectsHub = node.ref.type === "project" && node.ref.id === PROJECTS_GRAPH_ROOT_ID;
        const centerForce = isProjectsHub ? .008 : .00075;
        node.vx += (WIDTH / 2 - node.x) * centerForce * dt;
        node.vy += (HEIGHT / 2 - node.y) * centerForce * dt;
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
  }, [edgeKeys, live]);

  function toGraphPoint(clientX: number, clientY: number) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return { x: WIDTH / 2, y: HEIGHT / 2 };
    return {
      x: ((clientX - rect.left) / rect.width - .5) * (WIDTH / zoom) + WIDTH / 2,
      y: ((clientY - rect.top) / rect.height - .5) * (HEIGHT / zoom) + HEIGHT / 2
    };
  }

  function resetGraph() {
    const count = Math.max(1, simulationRef.current.length);
    simulationRef.current.forEach((node, index) => {
      if (node.ref.type === "project" && node.ref.id === PROJECTS_GRAPH_ROOT_ID) {
        node.x = WIDTH / 2;
        node.y = HEIGHT / 2;
        node.vx = 0;
        node.vy = 0;
        return;
      }
      const angle = (index / count) * Math.PI * 2;
      const radius = 190 + (hash(node.key) % 65);
      node.x = WIDTH / 2 + Math.cos(angle) * radius;
      node.y = HEIGHT / 2 + Math.sin(angle) * radius;
      node.vx = 0;
      node.vy = 0;
    });
    setZoom(1);
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
          <button onClick={() => setZoom((value) => Math.max(.65, value - .15))} aria-label="Уменьшить">−</button>
          <button onClick={() => setZoom((value) => Math.min(1.8, value + .15))} aria-label="Увеличить">＋</button>
          <button onClick={resetGraph}>Центр</button>
        </div>
      </header>

      <div className="relations-graph-stage">
        <svg ref={svgRef} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="Интерактивная карта связей">
          <defs>
            <filter id="nodeGlow" x="-80%" y="-80%" width="260%" height="260%">
              <feGaussianBlur stdDeviation="5" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>
          <g transform={`translate(${WIDTH / 2} ${HEIGHT / 2}) scale(${zoom}) translate(${-WIDTH / 2} ${-HEIGHT / 2})`}>
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
                const isProjectsHub = node.ref.type === "project" && node.ref.id === PROJECTS_GRAPH_ROOT_ID;
                const degree = degreeByKey.get(node.key) ?? 0;
                const baseRadius = isProjectsHub ? 22 : Math.min(16, 9.5 + degree * 1.25);
                const activeRadius = hovered === node.key ? baseRadius + 3 : baseRadius;
                return (
                  <g
                    key={node.key}
                    className={`graph-node node-${node.ref.type} ${isProjectsHub ? "projects-hub" : ""} ${highlighted ? "" : "dimmed"} ${hovered === node.key ? "hovered" : ""}`}
                    transform={`translate(${node.x} ${node.y})`}
                    onPointerEnter={() => setHovered(node.key)}
                    onPointerLeave={() => setHovered(null)}
                    onPointerDown={(event) => {
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
                    <circle className="graph-node-halo" r={isProjectsHub ? 38 : Math.max(27, baseRadius + 13)} />
                    <circle className="graph-node-core" r={activeRadius} filter={hovered === node.key || isProjectsHub ? "url(#nodeGlow)" : undefined} />
                    <text className="graph-node-label" x="0" y={isProjectsHub ? 39 : 30} textAnchor="middle">{shortTitle(getTitle(node.ref))}</text>
                    <text className="graph-node-type" x="0" y={isProjectsHub ? 54 : 44} textAnchor="middle">{isProjectsHub ? "Раздел" : getTypeLabel(node.ref.type)}</text>
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
          <small>Сплошные линии — ручные связи · пунктир — структура проектов и размещение объектов</small>
        </div>
      </div>
    </section>
  );
}
