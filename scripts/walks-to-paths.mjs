// Merge GPS walks recorded in the app ("Save my walk") into the walking network.
// Usage: node scripts/walks-to-paths.mjs <footpaths.kml> [paths=data/paths.json] [--dry]
// Input: the footpaths.kml exported from the /field page. Only placemarks named "walk > <destination> | <label> | <footpath|road>" are used.
// What it does: drops GPS jitter (points under 2 m apart), simplifies the line (2.5 m), joins it to the existing network
// (a vertex within 6 m of an existing vertex snaps to it; one within 6 m of the middle of a path adds a shared junction to both),
// then appends it as a "walked" path. Routes can only pass between paths at shared vertices, so the junctions matter.
import { readFileSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2), dry = args.includes("--dry"), files = args.filter((a) => !a.startsWith("--"));
const [input, pathsFile = "data/paths.json"] = files;
if (!input) { console.error("Usage: node scripts/walks-to-paths.mjs <footpaths.kml> [paths.json] [--dry]"); process.exit(1); }

const KY = 110574, kx = (lat) => 111320 * Math.cos((lat * Math.PI) / 180);
const dist = (a, b) => Math.hypot((a[0] - b[0]) * kx((a[1] + b[1]) / 2), (a[1] - b[1]) * KY);
const r6 = (c) => [Math.round(c[0] * 1e6) / 1e6, Math.round(c[1] * 1e6) / 1e6];
const unxml = (s) => s.replace(/<!\[CDATA\[|\]\]>/g, "").replace(/&gt;/g, ">").replace(/&lt;/g, "<").replace(/&amp;/g, "&").trim();

/** Closest point on segment a-b to p, with t in 0..1 and distance in metres. */
export function closestOnSegment(p, a, b) {
  const k = kx(p[1]), ax = (a[0] - p[0]) * k, ay = (a[1] - p[1]) * KY, bx = (b[0] - p[0]) * k, by = (b[1] - p[1]) * KY;
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy, t = l2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2));
  return { t, d: Math.hypot(ax + t * dx, ay + t * dy), pt: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t] };
}

/** Douglas-Peucker line simplification, tolerance in metres. */
export function simplify(pts, tol) {
  if (pts.length < 3) return pts;
  let worst = 0, idx = 0;
  for (let i = 1; i < pts.length - 1; i++) { const d = closestOnSegment(pts[i], pts[0], pts[pts.length - 1]).d; if (d > worst) { worst = d; idx = i; } }
  if (worst <= tol) return [pts[0], pts[pts.length - 1]];
  return [...simplify(pts.slice(0, idx + 1), tol).slice(0, -1), ...simplify(pts.slice(idx), tol)];
}

const dedupe = (pts, minM) => pts.filter((p, i) => i === 0 || dist(pts[i - 1], p) >= minM || i === pts.length - 1);

/** Join `walk` to the network: returns the walk with snapped vertices; may insert junction vertices into `features`. */
export function joinToNetwork(walk, features, tol = 6) {
  let snapped = 0, junctions = 0;
  const out = walk.map((p) => {
    let bestV = null, bestSeg = null;
    for (const f of features) {
      const c = f.geometry.coordinates;
      for (let i = 0; i < c.length; i++) { const d = dist(p, c[i]); if (d <= tol && (!bestV || d < bestV.d)) bestV = { d, pt: c[i] }; }
      for (let i = 0; i < c.length - 1; i++) {
        const s = closestOnSegment(p, c[i], c[i + 1]);
        if (s.d <= tol && s.t > 0.02 && s.t < 0.98 && (!bestSeg || s.d < bestSeg.d)) bestSeg = { d: s.d, pt: s.pt, f, i };
      }
    }
    if (bestV && (!bestSeg || bestV.d <= bestSeg.d + 2)) { snapped++; return [...bestV.pt]; } // an existing vertex is close enough: share it
    if (bestSeg) { // cut into the middle of an existing path: add the shared junction vertex there
      const j = r6(bestSeg.pt); bestSeg.f.geometry.coordinates.splice(bestSeg.i + 1, 0, j); junctions++; return [...j];
    }
    return p;
  });
  return { line: out, snapped, junctions };
}

export function readWalks(kml) {
  const walks = [];
  for (const pm of kml.match(/<Placemark[\s\S]*?<\/Placemark>/g) ?? []) {
    const raw = pm.match(/<LineString[\s\S]*?<coordinates>([\s\S]*?)<\/coordinates>/)?.[1]; if (!raw) continue;
    const [pair, label = "Walked path", kind = "footpath"] = unxml(pm.match(/<name>([\s\S]*?)<\/name>/)?.[1] ?? "").split("|").map((s) => s.trim());
    if (!/^walk\s*>/.test(pair ?? "")) continue;
    walks.push({ label, kind: kind === "road" ? "road" : "footpath", points: raw.trim().split(/\s+/).map((c) => c.split(",").slice(0, 2).map(Number)) });
  }
  return walks;
}

function main() {
  const data = JSON.parse(readFileSync(pathsFile, "utf8")), walks = readWalks(readFileSync(input, "utf8"));
  if (!walks.length) { console.log('No recorded walks found (placemarks named "walk > ... | ... | ...").'); return; }
  let added = 0, metres = 0, snappedAll = 0, junctionsAll = 0;
  for (const w of walks) {
    const clean = simplify(dedupe(w.points, 2), 2.5);
    if (clean.length < 2) continue;
    const { line, snapped, junctions } = joinToNetwork(clean, data.features);
    const coords = line.map(r6), len = coords.slice(1).reduce((t, c, i) => t + dist(coords[i], c), 0);
    data.features.push({ type: "Feature", properties: { name: w.label, kind: w.kind, walked: true }, geometry: { type: "LineString", coordinates: coords } });
    added++; metres += len; snappedAll += snapped; junctionsAll += junctions;
    console.log(`+ ${w.label}: ${Math.round(len)} m, ${coords.length} points (was ${w.points.length}), ${snapped} snapped, ${junctions} junctions`);
  }
  console.log(`${added} walked paths, ${Math.round(metres)} m, ${snappedAll} snapped vertices, ${junctionsAll} new junctions${dry ? " (dry run, nothing written)" : ""}`);
  if (!dry) writeFileSync(pathsFile, JSON.stringify(data));
}
if (process.argv[1] && process.argv[1].endsWith("walks-to-paths.mjs")) main();
