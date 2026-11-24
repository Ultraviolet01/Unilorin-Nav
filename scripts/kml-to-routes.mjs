// Usage: node scripts/kml-to-routes.mjs <export.kml> [pois=data/pois.json] [out=data/routes.json]
// In Google My Maps: ⋮ → Export to KML/KMZ → untick "Export to .KMZ". Name each traced line like:
//     main-gate > library | Shortcut via Sciences | shortcut
// i.e.  <from poi id> > <to poi id> | <label> | <main|shortcut|shaded>.  Walk time is computed at 80 m/min.
import { readFileSync, writeFileSync } from "node:fs";
import { distanceM } from "./lib.mjs";

const [, , input, poisFile = "data/pois.json", out = "data/routes.json"] = process.argv;
if (!input) { console.error("Usage: node scripts/kml-to-routes.mjs <export.kml> [pois] [out]"); process.exit(1); }
const ids = new Set(JSON.parse(readFileSync(poisFile, "utf8")).map((p) => p.id));
const unxml = (s) => s.replace(/<!\[CDATA\[|\]\]>/g, "").replace(/&gt;/g, ">").replace(/&lt;/g, "<").replace(/&amp;/g, "&").trim();

const errors = [], features = [];
for (const pm of readFileSync(input, "utf8").match(/<Placemark[\s\S]*?<\/Placemark>/g) ?? []) {
  const coordsRaw = pm.match(/<LineString[\s\S]*?<coordinates>([\s\S]*?)<\/coordinates>/)?.[1];
  if (!coordsRaw) continue; // pins etc. are skipped
  const name = unxml(pm.match(/<name>([\s\S]*?)<\/name>/)?.[1] ?? "");
  const [pair, label = "Route", kind = "main"] = name.split("|").map((s) => s.trim());
  const [from, to] = (pair ?? "").split(">").map((s) => s.trim());
  if (from === "walk") continue; // recorded walks are raw paths: use scripts/walks-to-paths.mjs
  if (!ids.has(from) || !ids.has(to)) { errors.push(`"${name}": from/to must be existing poi ids (got "${from}", "${to}")`); continue; }
  const coordinates = coordsRaw.trim().split(/\s+/).map((c) => c.split(",").slice(0, 2).map(Number));
  const metres = coordinates.slice(1).reduce((s, c, i) => s + distanceM(coordinates[i], c), 0);
  features.push({ type: "Feature", properties: { from, to, label, kind, walkMinutes: Math.max(1, Math.round(metres / 80)) }, geometry: { type: "LineString", coordinates } });
}
if (errors.length) { console.error(errors.join("\n") + "\nNothing written."); process.exit(1); }
writeFileSync(out, JSON.stringify({ type: "FeatureCollection", features }, null, 2) + "\n");
console.log(`Wrote ${features.length} routes to ${out}`);
