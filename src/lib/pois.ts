import pois from "../../data/pois.json";
import routes from "../../data/routes.json";

export type Category = "faculty" | "hostel" | "eatery" | "atm" | "gate" | "health" | "admin" | "cbt" | "uith" | "lecture" | "sports" | "worship" | "market";
export interface Poi {
  id: string; name: string; category: Category; lat: number; lng: number;
  description: string; photo?: string; campus: "main" | "mini" | "uith"; verified?: boolean; source?: string;
}
export interface RouteOption {
  label: string; kind: string; walkMinutes: number; coordinates: [number, number][]; custom: boolean;
}

export const CATEGORY_META: Record<Category, { icon: string; color: string }> = {
  faculty: { icon: "🏛️", color: "#7C3AED" }, hostel: { icon: "🏠", color: "#0EA5E9" },
  eatery: { icon: "🍽️", color: "#F59E0B" }, atm: { icon: "💳", color: "#10B981" },
  gate: { icon: "🚪", color: "#64748B" }, health: { icon: "🏥", color: "#EF4444" },
  admin: { icon: "🏢", color: "#6366F1" }, cbt: { icon: "💻", color: "#14B8A6" },
  uith: { icon: "🏨", color: "#DC2626" }, lecture: { icon: "📚", color: "#8B5CF6" },
  sports: { icon: "🏟️", color: "#22C55E" }, worship: { icon: "🕌", color: "#0891B2" }, market: { icon: "🛍️", color: "#EA580C" },
};

export async function loadPois(): Promise<Poi[]> {
  const api = process.env.NEXT_PUBLIC_API_URL;
  if (api) {
    try {
      const res = await fetch(`${api}/pois`);
      if (res.ok) return (await res.json()) as Poi[];
    } catch { /* offline: fall through to bundled data */ }
  }
  return pois as Poi[];
}

export function searchPois(all: Poi[], q: string): Poi[] {
  const s = q.trim().toLowerCase();
  if (!s) return [];
  return all.filter((p) => p.name.toLowerCase().includes(s) || p.category.includes(s)).slice(0, 8);
}

const R = 6371000;
export function distanceM(a: [number, number], b: [number, number]) {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b[1] - a[1]), dLng = rad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Hand-traced routes first; otherwise a straight-line estimate (replace with Amazon Location routing). */
export function getRoutes(from: Poi, to: Poi): RouteOption[] {
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
  return [{ label: "Direct line (estimate)", kind: "estimate", walkMinutes: Math.max(1, Math.round(distanceM(a, b) / 80)), coordinates: [a, b], custom: false }];
}
