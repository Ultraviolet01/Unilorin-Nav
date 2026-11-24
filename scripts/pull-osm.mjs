// Usage: node scripts/pull-osm.mjs  , lists every NAMED OpenStreetMap feature inside the Unilorin campus boundary,
// with centre point and last-edit date, so you can see what changed since data/pois.json was built.
// Uses the official OSM API (be gentle: ~9 requests). Data © OpenStreetMap contributors, ODbL.
const API = "https://api.openstreetmap.org/api/0.6", H = { "User-Agent": "unilorin-navigator-data-script" };
const get = async (u) => (await fetch(u, { headers: H })).json();
const campus = await get(`${API}/way/1482800400/full.json`); // "University of Ilorin" boundary
const cn = new Map(campus.elements.filter((e) => e.type === "node").map((e) => [e.id, e]));
const ring = campus.elements.find((e) => e.type === "way").nodes.map((i) => [cn.get(i).lon, cn.get(i).lat]);
const inside = (x, y) => { let c = false; for (let i = 0, k = ring.length - 1; i < ring.length; k = i++) { const [xi, yi] = ring[i], [xk, yk] = ring[k]; if ((yi > y) !== (yk > y) && x < ((xk - xi) * (y - yi)) / (yk - yi) + xi) c = !c; } return c; };
const xs = ring.map((p) => p[0]), ys = ring.map((p) => p[1]);
const nodes = new Map(), ways = [];
for (let lng = Math.min(...xs); lng < Math.max(...xs); lng += 0.02)
  for (let lat = Math.min(...ys); lat < Math.max(...ys); lat += 0.02) {
    const j = await get(`${API}/map.json?bbox=${lng.toFixed(4)},${lat.toFixed(4)},${(lng + 0.02).toFixed(4)},${(lat + 0.02).toFixed(4)}`);
    for (const e of j.elements ?? []) { if (e.type === "node") nodes.set(e.id, e); else if (e.type === "way") ways.push(e); }
    await new Promise((r) => setTimeout(r, 1000));
  }
const rows = [];
for (const n of nodes.values()) if (n.tags?.name) rows.push({ id: "n" + n.id, lat: n.lat, lng: n.lon, name: n.tags.name, ts: n.timestamp, t: n.tags });
for (const w of ways) if (w.tags?.name && !w.tags.highway) {
  const p = w.nodes.map((i) => nodes.get(i)).filter(Boolean); if (!p.length) continue;
  rows.push({ id: "w" + w.id, lat: p.reduce((s, x) => s + x.lat, 0) / p.length, lng: p.reduce((s, x) => s + x.lon, 0) / p.length, name: w.tags.name, ts: w.timestamp, t: w.tags });
}
for (const r of [...new Map(rows.map((r) => [r.id, r])).values()].filter((r) => inside(r.lng, r.lat)).sort((a, b) => a.lat - b.lat))
  console.log(`${r.lat.toFixed(6)},${r.lng.toFixed(6)} | ${r.name} | ${r.t.amenity || r.t.building || r.t.shop || "?"} | ${r.id} | ${(r.ts || "").slice(0, 10)}`);
