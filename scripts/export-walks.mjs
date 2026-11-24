// Download the walks that students chose to share and write them as footpaths.kml, ready for scripts/walks-to-paths.mjs.
// Usage: WALK_TABLE=<WalkTableName output> AWS_PROFILE=unilorin node scripts/export-walks.mjs [out=shared-walks.kml]
// Shared walks come from the public, so they are UNTRUSTED: look at the KML (Google Earth / My Maps) before merging anything.
// Nothing personal is in the table: only a random code, the GPS points, the time, the kind and the destination id.
import { writeFileSync } from "node:fs";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Items as stored in DynamoDB (plain objects) -> KML in the format the Field page exports. */
export function toKml(items) {
  const marks = items.map((w) => {
    const pts = JSON.parse(w.points);
    return `<Placemark><name>${esc(`walk > ${w.dest} | ${w.label} | ${w.kind}`)}</name><description>${esc(`${w.meters} m, walked ${w.ts}, owner ${String(w.owner).slice(0, 8)}`)}</description><LineString><coordinates>${pts.map((p) => `${p[0]},${p[1]},0`).join(" ")}</coordinates></LineString></Placemark>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document>\n${marks.join("\n")}\n</Document></kml>\n`;
}

async function main() {
  const { DynamoDBClient, ScanCommand } = await import("@aws-sdk/client-dynamodb");
  const { unmarshall } = await import("@aws-sdk/util-dynamodb");
  const table = process.env.WALK_TABLE;
  if (!table) { console.error("Set WALK_TABLE to the WalkTableName output of the unilorin-nav stack."); process.exit(1); }
  const client = new DynamoDBClient({ region: process.env.AWS_REGION ?? "eu-north-1" });
  const items = []; let key;
  do { const r = await client.send(new ScanCommand({ TableName: table, ExclusiveStartKey: key })); items.push(...(r.Items ?? []).map((i) => unmarshall(i))); key = r.LastEvaluatedKey; } while (key);
  items.sort((a, b) => String(a.ts).localeCompare(String(b.ts)));
  const out = process.argv[2] ?? "shared-walks.kml";
  writeFileSync(out, toKml(items));
  console.log(`${items.length} shared walks written to ${out}. Review them on a map, then: node scripts/walks-to-paths.mjs ${out} --dry`);
}
if (process.argv[1]?.endsWith("export-walks.mjs")) main();
