import pois from "../../data/pois.json";
import routes from "../../data/routes.json";
import paths from "../../data/paths.json";
import { buildGraph, shortest, snap, type Graph } from "./graph";

export type Category = "faculty" | "hostel" | "eatery" | "atm" | "gate" | "health" | "admin" | "cbt" | "uith" | "lecture" | "sports" | "worship" | "market" | "transport";
export interface Poi {
  id: string; name: string; category: Category; lat: number; lng: number;
  description: string; photo?: string; campus: "main" | "mini" | "uith"; verified?: boolean; source?: string; aliases?: string[];
}
export interface RouteOption {
  label: string; kind: string; walkMinutes: number; coordinates: [number, number][]; custom: boolean; traced?: boolean;
}

export const CATEGORY_META: Record<Category, { icon: string; color: string }> = {
  faculty: { icon: "🏛️", color: "#7C3AED" }, hostel: { icon: "🏠", color: "#0EA5E9" },
  eatery: { icon: "🍽️", color: "#F59E0B" }, atm: { icon: "💳", color: "#10B981" },
  gate: { icon: "🚪", color: "#64748B" }, health: { icon: "🏥", color: "#EF4444" },
  admin: { icon: "🏢", color: "#6366F1" }, cbt: { icon: "💻", color: "#14B8A6" },
  uith: { icon: "🏨", color: "#DC2626" }, lecture: { icon: "📚", color: "#8B5CF6" },
  sports: { icon: "🏟️", color: "#22C55E" }, worship: { icon: "🕌", color: "#0891B2" }, market: { icon: "🛍️", color: "#EA580C" }, transport: { icon: "🚌", color: "#0F766E" },
};

export async function loadPois(): Promise<Poi[]> {
  const api = process.env.NEXT_PUBLIC_API_URL;
  if (api) {
    try {
      const res = await fetch(`${api}/pois`);
      if (res.ok) { const d = await res.json(); if (Array.isArray(d) && d.length) return d as Poi[]; } // empty table -> use bundled data
    } catch { /* offline: fall through to bundled data */ }
  }
  return pois as Poi[];
}

/** Ranked search: exact name > name starts with > a word starts with > contains > alias > category; shorter names first on ties. */
export function searchPois(all: Poi[], q: string): Poi[] {
  const s = q.trim().toLowerCase();
  if (!s) return [];
  const score = (p: Poi) => {
    const n = p.name.toLowerCase();
    if (n === s) return 0;
    if (n.startsWith(s)) return 1;
    if (n.split(/[^a-z0-9]+/).some((w) => w.startsWith(s))) return 2;
    if (n.includes(s)) return 3;
    if (p.aliases?.some((a) => a.includes(s) || s.includes(a))) return 4;
    if (p.category.includes(s)) return 5;
    return 9;
  };
  return all.map((p) => [score(p), p] as const).filter(([sc]) => sc < 9)
    .sort((a, b) => a[0] - b[0] || a[1].name.length - b[1].name.length).map((x) => x[1]).slice(0, 8);
}

const R = 6371000;
export function distanceM(a: [number, number], b: [number, number]) {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b[1] - a[1]), dLng = rad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

let graph: Graph | null = null;
const getGraph = () => (graph ??= buildGraph((paths as any).features));

/** 1) hand-made routes in routes.json, 2) routes over the traced walking network, 3) straight-line estimate. */
export interface LL { id: string; lat: number; lng: number }
export function getRoutes(from: LL, to: LL): RouteOption[] {
  const out: RouteOption[] = [];
  for (const f of (routes as any).features) {
    const p = f.properties || {};
    const fwd = p.from === from.id && p.to === to.id, rev = p.from === to.id && p.to === from.id;
    if (!fwd && !rev) continue;
    const coords = fwd ? f.geometry.coordinates : [...f.geometry.coordinates].reverse();
    out.push({ label: p.label ?? "Route", kind: p.kind ?? "main", walkMinutes: p.walkMinutes ?? 0, coordinates: coords, custom: true });
  }
  if (out.length) return out;

  const a: [number, number] = [from.lng, from.lat], b: [number, number] = [to.lng, to.lat];
  const g = getGraph(), sa = snap(g, from.lng, from.lat), sb = snap(g, to.lng, to.lat);
  if (sa !== null && sb !== null && sa !== sb) {
    const wrap = (r: { coordinates: [number, number][]; meters: number }): RouteOption["coordinates"] => [a, ...r.coordinates, b];
    const minutes = (m: number) => Math.max(1, Math.round((m + distanceM(a, g.nodes[sa]) + distanceM(b, g.nodes[sb])) / 80));
    const fast = shortest(g, sa, sb), roads = shortest(g, sa, sb, { footpath: 4 });
    if (fast) out.push({ label: "Shortest path", kind: "shortcut", walkMinutes: minutes(fast.meters), coordinates: wrap(fast), custom: false, traced: true });
    if (roads && fast && Math.abs(roads.meters - fast.meters) > 5)
      out.push({ label: "Mostly main roads", kind: "main", walkMinutes: minutes(roads.meters), coordinates: wrap(roads), custom: false, traced: true });
    if (out.length) return out;
  }
  return [{ label: "Direct line (estimate)", kind: "estimate", walkMinutes: Math.max(1, Math.round(distanceM(a, b) / 80)), coordinates: [a, b], custom: false }];
}

export const routeMeters = (c: [number, number][]) => c.slice(1).reduce((s, p, i) => s + distanceM(c[i], p), 0);
