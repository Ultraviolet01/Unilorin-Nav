// Live navigation maths: follow a position along a walking route. Coordinates are [lng, lat]; distances are metres.
export type Pt = [number, number];

const KY = 110574;
const kx = (lat: number) => 111320 * Math.cos((lat * Math.PI) / 180);
const dist = (a: Pt, b: Pt) => Math.hypot((a[0] - b[0]) * kx((a[1] + b[1]) / 2), (a[1] - b[1]) * KY);

export interface Prepared { coords: Pt[]; cum: number[]; total: number }
export interface Snap {
  point: Pt;       // closest point on the route
  seg: number;     // index of the segment it lies on
  offM: number;    // how far the position is from the route
  along: number;   // distance travelled along the route to `point`
  remaining: number; // distance left to the end of the route
  bearing: number; // direction of travel on that segment, degrees clockwise from north
}

export function prepare(coords: Pt[]): Prepared {
  const cum = [0];
  for (let i = 1; i < coords.length; i++) cum.push(cum[i - 1] + dist(coords[i - 1], coords[i]));
  return { coords, cum, total: cum[cum.length - 1] };
}

/** Degrees clockwise from north, from a to b. */
export function bearing(a: Pt, b: Pt): number {
  const dx = (b[0] - a[0]) * kx(a[1]), dy = (b[1] - a[1]) * KY;
  return ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
}

/** Closest point of the route to `p`. Works in a local flat plane, which is exact enough over a campus. */
export function snapToRoute(r: Prepared, p: Pt): Snap {
  const { coords, cum, total } = r;
  if (coords.length < 2) return { point: coords[0] ?? p, seg: 0, offM: coords[0] ? dist(coords[0], p) : 0, along: 0, remaining: 0, bearing: 0 };
  let best = { d: Infinity, seg: 0, t: 0, pt: coords[0] };
  const k = kx(p[1]);
  for (let i = 0; i < coords.length - 1; i++) {
    const a = coords[i], b = coords[i + 1];
    const ax = (a[0] - p[0]) * k, ay = (a[1] - p[1]) * KY, bx = (b[0] - p[0]) * k, by = (b[1] - p[1]) * KY;
    const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
    const d = Math.hypot(ax + t * dx, ay + t * dy);
    if (d < best.d) best = { d, seg: i, t, pt: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t] };
  }
  const along = cum[best.seg] + best.t * (cum[best.seg + 1] - cum[best.seg]);
  return { point: best.pt, seg: best.seg, offM: best.d, along, remaining: Math.max(0, total - along), bearing: bearing(coords[best.seg], coords[best.seg + 1]) };
}

/** The part of the route still ahead of the walker. */
export function remainingLine(r: Prepared, s: Snap): Pt[] {
  return [s.point, ...r.coords.slice(s.seg + 1)];
}

/** Smallest signed difference between two headings, -180..180. */
export function angleDelta(from: number, to: number): number {
  return ((to - from + 540) % 360) - 180;
}

/** Ease a heading toward a target without spinning the long way round. */
export function smoothHeading(prev: number, next: number, amount = 0.35): number {
  return (prev + angleDelta(prev, next) * amount + 360) % 360;
}

export const WALK_M_PER_MIN = 80; // same pace the route cards use
export const minutesLeft = (m: number) => Math.max(1, Math.ceil(m / WALK_M_PER_MIN));
