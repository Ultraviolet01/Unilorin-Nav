// Usage: node scripts/sheet-to-pois.mjs <sheet.csv> [out=data/pois.json]
// Export the Google Sheet via File → Download → CSV. Validates every row and refuses to write if any row is bad.
import { readFileSync, writeFileSync } from "node:fs";
import { parseCsv, slug, inIlorin } from "./lib.mjs";

const CATS = ["faculty", "hostel", "eatery", "atm", "gate", "health", "admin", "cbt", "uith", "lecture", "sports", "worship", "market", "transport"];
const CAMPUS = ["main", "mini", "uith"];
const [, , input, out = "data/pois.json"] = process.argv;
if (!input) { console.error("Usage: node scripts/sheet-to-pois.mjs <sheet.csv> [out]"); process.exit(1); }

const errors = [], pois = [], seen = new Set();
parseCsv(readFileSync(input, "utf8")).forEach((r, i) => {
  const line = i + 2, bad = (m) => errors.push(`row ${line} (${r.name || "?"}): ${m}`);
  if (!r.name) return bad("missing name");
  // Accept Google Maps' pasted "8.4821, 4.6703" in the lat cell as well as separate lat/lng cells.
  let lat = r.lat, lng = r.lng;
  if (lat.includes(",") && !lng) [lat, lng] = lat.split(",").map((s) => s.trim());
  lat = parseFloat(lat); lng = parseFloat(lng);
  if (Number.isNaN(lat) || Number.isNaN(lng)) return bad("lat/lng missing or not numbers");
  if (!inIlorin(lat, lng)) bad(`(${lat}, ${lng}) is outside Ilorin — lat/lng swapped or mistyped?`);
  const category = r.category.toLowerCase();
  if (!CATS.includes(category)) bad(`category "${r.category}" must be one of ${CATS.join(", ")}`);
  const campus = (r.campus || (category === "uith" ? "uith" : "main")).toLowerCase();
  if (!CAMPUS.includes(campus)) bad(`campus "${r.campus}" must be one of ${CAMPUS.join(", ")}`);
  const id = slug(r.name);
  if (seen.has(id)) bad(`duplicate id "${id}"`);
  seen.add(id);
  pois.push({ id, name: r.name, category, lat, lng, description: r.description, photo: r.photo_filename ? `/photos/${r.photo_filename}` : "", campus, verified: true });
});

if (errors.length) { console.error(errors.join("\n")); console.error(`\n${errors.length} problem(s). Nothing written.`); process.exit(1); }
writeFileSync(out, JSON.stringify(pois, null, 2) + "\n");
console.log(`Wrote ${pois.length} pins to ${out}`);
