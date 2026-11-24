"use client";
import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { CATEGORY_META, type Poi, type RouteOption, getRoutes, loadPois, searchPois } from "@/lib/pois";
import { getMapStyle } from "@/lib/mapStyle";
import buildings from "../../data/buildings.json";
import paths from "../../data/paths.json";
import transport from "../../data/transport.json";

type Tab = "main" | "uith";
const CAMPUS: Record<Tab, { label: string; center: [number, number]; zoom: number; placeholder: string }> = {
  main: { label: "Main Campus", center: [4.6727, 8.4805], zoom: 15, placeholder: "Search library, SUB, hostel…" },
  uith: { label: "UITH", center: [4.5326, 8.4797], zoom: 17, placeholder: "Search wards, departments, clinics…" },
};
const EMPTY: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

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
  const [tab, setTab] = useState<Tab>("main");
  const [ready, setReady] = useState(false);
  const [showTravel, setShowTravel] = useState(false);
  const switchRef = useRef<(t: Tab) => void>(() => {});
  // Each tab only ever sees its own pins ("mini" campus belongs with the main campus).
  const tabPois = pois.filter((p) => (tab === "uith") === (p.campus === "uith"));

  useEffect(() => {
    loadPois().then(setPois);
    const fromHash = () => switchRef.current(location.hash === "#uith" ? "uith" : "main");
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, []);

  useEffect(() => {
    const m = new maplibregl.Map({ container: el.current!, style: getMapStyle(), center: CAMPUS.main.center, zoom: CAMPUS.main.zoom });
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
      setReady(true);
    });
    map.current = m;
    return () => m.remove();
  }, []);

  useEffect(() => {
    markers.current.forEach((k) => k.remove());
    markers.current = tabPois.map((p) => {
      const d = document.createElement("button");
      d.className = "pin"; d.textContent = CATEGORY_META[p.category]?.icon ?? "📍";
      d.style.background = CATEGORY_META[p.category]?.color ?? "#7C3AED";
      d.setAttribute("aria-label", p.name);
      d.onclick = () => pick(p);
      return new maplibregl.Marker({ element: d }).setLngLat([p.lng, p.lat]).addTo(map.current!);
    });
  }, [pois, tab]);

  // Switching tab: new view, only this campus's footprints/paths, and a clean slate for selection and route.
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    const c = CAMPUS[tab];
    m.flyTo({ center: c.center, zoom: c.zoom, pitch: 0 });
    m.setFilter("buildings-fill", ["in", ["get", "id"], ["literal", tabPois.map((p) => p.id)]]);
    m.setLayoutProperty("paths-line", "visibility", tab === "main" ? "visible" : "none"); // network is main-campus only
    (m.getSource("route") as maplibregl.GeoJSONSource | undefined)?.setData(EMPTY);
    history.replaceState(null, "", tab === "uith" ? "#uith" : "#main");
  }, [tab, ready, pois]);

  function switchTab(t: Tab) {
    if (t === tab) return;
    setSelected(null); setDest(null); setFrom(null); setRoutes([]); setActive(0); setQ(""); setShowTravel(false);
    setTab(t);
  }
  switchRef.current = switchTab;

  function pick(p: Poi) {
    setSelected(p); setRoutes([]); setShowTravel(false);
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
    const start = (from && from.id !== target.id && from) || tabPois.find((p) => p.id === "main-gate" && p.id !== target.id) || tabPois.find((p) => p.id !== target.id);
    if (!start) return;
    setFrom(start);
    const list = getRoutes(start, target);
    setRoutes(list); setActive(0); drawRoute(list, 0);
  }

  const results = searchPois(tabPois, q);
  const ql = q.trim().toLowerCase();
  const travelHit = tab === "main" && ql.length >= 3 && transport.keywords.some((k) => k.includes(ql) || ql.includes(k));
  const openTravel = () => { setSelected(null); setRoutes([]); setQ(""); setShowTravel(true); };

  return (
    <div className="app">
      <div ref={el} className="map" />
      <div className="top">
        <input className="search" placeholder={CAMPUS[tab].placeholder} value={q} onChange={(e) => setQ(e.target.value)} />
        {(results.length > 0 || travelHit) && (
          <ul className="results">
            {travelHit && <li><button onClick={openTravel}>🚕 {transport.shortTitle}</button></li>}
            {results.map((p) => <li key={p.id}><button onClick={() => { pick(p); setQ(""); }}>{CATEGORY_META[p.category]?.icon} {p.name}</button></li>)}
          </ul>
        )}
        <div className="tabs" role="tablist">
          {(Object.keys(CAMPUS) as Tab[]).map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? "on" : ""} onClick={() => switchTab(t)}>{CAMPUS[t].label}</button>
          ))}
        </div>
        {tab === "main" && <button className="chip" onClick={openTravel}>🚕 Going to UITH or the colleges?</button>}
      </div>
      {tab === "uith" && !selected && !showTravel && (
        <div className="notice"><strong>University of Ilorin Teaching Hospital</strong><br />Only the hospital grounds are mapped so far. Wards, departments and emergency routes will be added after a site visit.<br /><button className="link" onClick={openTravel}>Coming from the Main Campus? How to get here</button></div>
      )}
      {showTravel && (
        <div className="sheet">
          <button className="close" onClick={() => setShowTravel(false)}>×</button>
          <h2>🚕 {transport.title}</h2>
          <p>{transport.body}</p>
          <ul>{transport.tips.map((t) => <li key={t}>{t}</li>)}</ul>
          {!transport.verified && <p className="warn">{transport.note}</p>}
          <button className="primary" onClick={() => switchTab(tab === "main" ? "uith" : "main")}>{tab === "main" ? "Show UITH on the map" : "Back to Main Campus"}</button>
        </div>
      )}
      {selected && !showTravel && (
        <div className="sheet">
          <button className="close" onClick={() => { setSelected(null); setRoutes([]); }}>×</button>
          <h2>{selected.name}</h2>
          {selected.photo && <img src={selected.photo} alt={selected.name} loading="lazy" />}
          <p>{selected.description}</p>
          {selected.verified === false && <p className="warn">Location not yet verified on the ground.</p>}
          {selected.campus === "uith" && <button className="link" onClick={openTravel}>Coming from the Main Campus? How to get here</button>}
          {tabPois.length > 1
            ? <button className="primary" onClick={() => directions(selected)}>Directions{from && from.id !== selected.id ? ` from ${from.name}` : ""}</button>
            : <p className="warn">Walking directions will appear once more of this site is mapped.</p>}
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
