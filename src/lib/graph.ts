// Walkable network built from data/paths.json (roads, footpaths, covered walkway) with Dijkstra routing.
export type PathKind = "road" | "footpath" | "covered";
export interface PathFeature { properties: { kind: PathKind; name?: string }; geometry: { coordinates: [number, number][] } }
interface Edge { to: number; len: number; kind: PathKind }
export interface Graph { nodes: [number, number][]; adj: Edge[][] }

const KX = 111320 * Math.cos((8.48 * Math.PI) / 180), KY = 110574;
const metres = (a: [number, number], b: [number, number]) => Math.hypot((a[0] - b[0]) * KX, (a[1] - b[1]) * KY);

export function buildGraph(features: PathFeature[]): Graph {
  const nodes: [number, number][] = [], adj: Edge[][] = [], index = new Map<string, number>();
  const node = (p: [number, number]) => {
    const k = p[0].toFixed(6) + "," + p[1].toFixed(6);
    let i = index.get(k);
    if (i === undefined) { i = nodes.length; index.set(k, i); nodes.push(p); adj.push([]); }
    return i;
  };
  for (const f of features) {
    const c = f.geometry.coordinates, kind = f.properties.kind;
    for (let s = 0; s < c.length - 1; s++) {
      const steps = Math.max(1, Math.ceil(metres(c[s], c[s + 1]) / 8)); // densify so pins snap closely
      let prev = node(c[s]);
      for (let t = 1; t <= steps; t++) {
        const p: [number, number] = t === steps ? c[s + 1] : [c[s][0] + ((c[s + 1][0] - c[s][0]) * t) / steps, c[s][1] + ((c[s + 1][1] - c[s][1]) * t) / steps];
        const cur = node(p);
        if (cur !== prev) { const len = metres(nodes[prev], nodes[cur]); adj[prev].push({ to: cur, len, kind }); adj[cur].push({ to: prev, len, kind }); }
        prev = cur;
      }
    }
  }
  return { nodes, adj };
}

export function snap(g: Graph, lng: number, lat: number, maxM = 150): number | null {
  let best = -1, bd = Infinity;
  for (let i = 0; i < g.nodes.length; i++) { const d = metres([lng, lat], g.nodes[i]); if (d < bd) { bd = d; best = i; } }
  return bd <= maxM ? best : null;
}

/** Dijkstra; `penalty` multiplies the cost of an edge kind (e.g. footpath: 4 to prefer roads). */
export function shortest(g: Graph, from: number, to: number, penalty: Partial<Record<PathKind, number>> = {}) {
  const dist = new Array<number>(g.nodes.length).fill(Infinity), prev = new Array<number>(g.nodes.length).fill(-1), done = new Array<boolean>(g.nodes.length).fill(false);
  dist[from] = 0;
  for (;;) {
    let u = -1;
    for (let i = 0; i < dist.length; i++) if (!done[i] && dist[i] < Infinity && (u < 0 || dist[i] < dist[u])) u = i;
    if (u < 0) return null;
    if (u === to) break;
    done[u] = true;
    for (const e of g.adj[u]) {
      const w = dist[u] + e.len * (penalty[e.kind] ?? 1);
      if (w < dist[e.to]) { dist[e.to] = w; prev[e.to] = u; }
    }
  }
  const path: number[] = [];
  for (let v = to; v >= 0; v = prev[v]) path.push(v);
  path.reverse();
  let m = 0;
  for (let i = 1; i < path.length; i++) m += metres(g.nodes[path[i - 1]], g.nodes[path[i]]);
  return { coordinates: path.map((i) => g.nodes[i]), meters: m };
}
