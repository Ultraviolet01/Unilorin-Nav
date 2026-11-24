"use client";
import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { CATEGORY_META, type Poi, type RouteOption, getRoutes, loadPois, searchPois } from "@/lib/pois";
import { getMapStyle } from "@/lib/mapStyle";
import buildings from "../../data/buildings.json";
import paths from "../../data/paths.json";

const CENTER: [number, number] = [4.6727, 8.4805];

export default function Navigator() {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const markers = useRef<maplibregl.Marker[]>([]);
  const [pois, setPois] = useState<Poi[]>([]);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Poi | null>(null);
  const [dest, setDest] = useState<Poi | null>(null);
  const [from, setFrom] = useState<Poi | null>(null);
  const [routes, setRoutes] = useState<RouteOption[]>([]);
  const [active, setActive] = useState(0);
  const [tab, setTab] = useState<"main" | "uith">("main");

  useEffect(() => { loadPois().then(setPois); }, []);

  useEffect(() => {
    const m = new maplibregl.Map({ container: el.current!, style: getMapStyle(), center: CENTER, zoom: 15 });
    m.addControl(new maplibregl.NavigationControl(), "bottom-right");
    m.addControl(new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: true }), "bottom-right");
    m.on("load", () => {
      // Building footprints (OpenStreetMap) and the traced walking network.
      m.addSource("buildings", { type: "geojson", data: buildings as any });
      m.addLayer({ id: "buildings-fill", type: "fill-extrusion", source: "buildings", minzoom: 15,
        paint: { "fill-extrusion-color": "#7C3AED", "fill-extrusion-height": 6, "fill-extrusion-opacity": 0.55 } });
      m.addSource("paths", { type: "geojson", data: paths as any });
      m.addLayer({ id: "paths-line", type: "line", source: "paths", minzoom: 15,
        paint: { "line-width": 2, "line-opacity": 0.8, "line-color": ["match", ["get", "kind"], "road", "#FFFFFF", "covered", "#FDE047", "#22D3EE"] } });
    });
    map.current = m;
    return () => m.remove();
  }, []);

  useEffect(() => {
    markers.current.forEach((k) => k.remove());
    markers.current = pois.filter((p) => (tab === "uith" ? p.campus === "uith" : p.campus !== "uith")).map((p) => {
      const d = document.createElement("button");
      d.className = "pin"; d.textContent = CATEGORY_META[p.category]?.icon ?? "📍";
      d.style.background = CATEGORY_META[p.category]?.color ?? "#7C3AED";
      d.setAttribute("aria-label", p.name);
      d.onclick = () => pick(p);
      return new maplibregl.Marker({ element: d }).setLngLat([p.lng, p.lat]).addTo(map.current!);
    });
  }, [pois, tab]);

  function pick(p: Poi) {
    setSelected(p); setRoutes([]);
    map.current?.flyTo({ center: [p.lng, p.lat], zoom: 17.5, pitch: 0 });
  }

  function drawRoute(list: RouteOption[], i: number) {
    const m = map.current!;
    const data: GeoJSON.Feature = { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: list[i].coordinates } };
    const src = m.getSource("route") as maplibregl.GeoJSONSource | undefined;
    if (src) src.setData(data);
    else {
      m.addSource("route", { type: "geojson", data });
      m.addLayer({ id: "route", type: "line", source: "route", paint: { "line-color": "#7C3AED", "line-width": 5, "line-dasharray": [2, 1] } });
    }
    const b = new maplibregl.LngLatBounds();
    list[i].coordinates.forEach((c) => b.extend(c));
    m.fitBounds(b, { padding: 80 });
  }

  function directions(target: Poi) {
    setDest(target);
    const start = from ?? pois.find((p) => p.id === "main-gate") ?? pois[0];
    if (!start || start.id === target.id) return;
    setFrom(start);
    const list = getRoutes(start, target);
    setRoutes(list); setActive(0); drawRoute(list, 0);
  }

  const results = searchPois(pois, q);

  return (
    <div className="app">
      <div ref={el} className="map" />
      <div className="top">
        <input className="search" placeholder="Search library, CBT, hostel…" value={q} onChange={(e) => setQ(e.target.value)} />
        {results.length > 0 && (
          <ul className="results">
            {results.map((p) => <li key={p.id}><button onClick={() => { pick(p); setQ(""); }}>{CATEGORY_META[p.category]?.icon} {p.name}</button></li>)}
          </ul>
        )}
        <div className="tabs">
          <button className={tab === "main" ? "on" : ""} onClick={() => { setTab("main"); map.current?.flyTo({ center: CENTER, zoom: 15 }); }}>Campus</button>
          <button className={tab === "uith" ? "on" : ""} onClick={() => { setTab("uith"); const u = pois.find((p) => p.campus === "uith"); if (u) map.current?.flyTo({ center: [u.lng, u.lat], zoom: 16 }); }}>UITH</button>
        </div>
      </div>
      {selected && (
        <div className="sheet">
          <button className="close" onClick={() => { setSelected(null); setRoutes([]); }}>×</button>
          <h2>{selected.name}</h2>
          {selected.photo && <img src={selected.photo} alt={selected.name} loading="lazy" />}
          <p>{selected.description}</p>
          {selected.verified === false && <p className="warn">Location not yet verified on the ground.</p>}
          <button className="primary" onClick={() => directions(selected)}>Directions{from ? ` from ${from.name}` : ""}</button>
          {routes.length > 0 && dest?.id === selected.id && (
            <div className="routes">
              {routes.map((r, i) => (
                <button key={i} className={i === active ? "on" : ""} onClick={() => { setActive(i); drawRoute(routes, i); }}>
                  {r.label} · {r.walkMinutes} min{r.custom ? "" : r.traced ? " (traced)" : " (estimate)"}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
