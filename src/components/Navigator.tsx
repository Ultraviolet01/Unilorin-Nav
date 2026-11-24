"use client";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { type Category, type LL, type Poi, type RouteOption, getRoutes, loadPois, routeMeters, searchPois } from "@/lib/pois";
import { getMapStyle, type Base } from "@/lib/mapStyle";
import { CAT, CHIP_ORDER, Icon, iconPath } from "./gm/icons";
import buildings from "../../data/buildings.json";
import paths from "../../data/paths.json";
import transport from "../../data/transport.json";
import elsewhere from "../../data/elsewhere.json";

type Tab = "main" | "uith";
const CAMPUS: Record<Tab, { label: string; center: [number, number]; zoom: number; hint: string }> = {
  main: { label: "Main Campus", center: [4.6727, 8.4805], zoom: 15.3, hint: "Search Unilorin" },
  uith: { label: "UITH & Colleges", center: [4.5326, 8.4797], zoom: 17, hint: "Search UITH & Colleges" },
};
const readBase = (): Base => { try { const b = localStorage.getItem("unilorin-base"); if (b === "map" || b === "dark" || b === "sat") return b; } catch { /* ignore */ } return "sat"; };
const EMPTY: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };
const lines = (cs: [number, number][][]): GeoJSON.FeatureCollection => ({ type: "FeatureCollection", features: cs.map((c) => ({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: c } })) });
const fmtDist = (m: number) => (m < 1000 ? `${Math.max(10, Math.round(m / 10) * 10)} m` : `${(m / 1000).toFixed(1)} km`);
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const isDesktop = () => typeof window !== "undefined" && window.innerWidth >= 900;
const hashFor = (t: Tab) => (t === "uith" ? "#uith" : "#main");

// ---- motion helpers ----
const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const tap = (ms = 8) => { try { navigator.vibrate?.(ms); } catch { /* not supported (e.g. iOS) */ } }; // tiny haptic tick on touch devices
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const KX = 111320 * Math.cos((8.48 * Math.PI) / 180), KY = 110574;
const segLen = (a: [number, number], b: [number, number]) => Math.hypot((b[0] - a[0]) * KX, (b[1] - a[1]) * KY);
/** true while `open`, and for `ms` after it closes — so things can animate OUT before unmounting */
function useMounted(open: boolean, ms: number) {
  const [m, setM] = useState(open);
  useEffect(() => { if (open) { setM(true); return; } const t = setTimeout(() => setM(false), ms); return () => clearTimeout(t); }, [open, ms]);
  return m || open;
}
function Presence({ open, ms = 200, children }: { open: boolean; ms?: number; children: (closing: boolean) => ReactNode }) {
  const mounted = useMounted(open, ms);
  return mounted ? <>{children(!open)}</> : null;
}

interface Start extends LL { name: string }
interface Dir { dest: Poi; start: Start | null; routes: RouteOption[]; active: number; sq: string; sfocus: boolean; locating: boolean }

export default function Navigator() {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const markers = useRef<maplibregl.Marker[]>([]);
  const selMarker = useRef<maplibregl.Marker | null>(null), startMarker = useRef<maplibregl.Marker | null>(null), meMarker = useRef<maplibregl.Marker | null>(null);
  const watchId = useRef<number | null>(null);
  const routeRef = useRef<{ main: GeoJSON.FeatureCollection; alt: GeoJSON.FeatureCollection }>({ main: EMPTY, alt: EMPTY });
  const pending = useRef<Poi | null>(null), switchRef = useRef<(t: Tab) => void>(() => {});
  const raf = useRef(0), markerEls = useRef<Map<string, HTMLElement>>(new Map());
  const poisRef = useRef<Poi[]>([]), pickRef = useRef<(p: Poi) => void>(() => {});

  const [pois, setPois] = useState<Poi[]>([]);
  const [tab, setTab] = useState<Tab>("main");
  const [base, setBase] = useState<Base>("sat");
  const [ready, setReady] = useState(false);
  const [q, setQ] = useState(""), [focus, setFocus] = useState(false), [recents, setRecents] = useState<string[]>([]);
  const [cat, setCat] = useState<Category | null>(null);
  const [selected, setSelected] = useState<Poi | null>(null), [full, setFull] = useState(false);
  const [dir, setDir] = useState<Dir | null>(null);
  const [travel, setTravel] = useState(false), [drawer, setDrawer] = useState(false), [campusMenu, setCampusMenu] = useState(false), [layerMenu, setLayerMenu] = useState(false);
  const [locOn, setLocOn] = useState(false), [locFix, setLocFix] = useState(false), [toast, setToast] = useState<string | null>(null), [zoomed, setZoomed] = useState(false), [dragY, setDragY] = useState<number | null>(null);

  const tabPois = useMemo(() => pois.filter((p) => (tab === "uith") === (p.campus === "uith")), [pois, tab]);
  const otherPois = useMemo(() => pois.filter((p) => !tabPois.includes(p)), [pois, tabPois]);
  const otherTab: Tab = tab === "main" ? "uith" : "main";
  const tabRef = useRef(tab), baseRef = useRef(base), selRef = useRef<string | null>(null);
  tabRef.current = tab; baseRef.current = base; selRef.current = selected?.id ?? null; poisRef.current = pois;

  useEffect(() => { if (!toast) return; const id = setTimeout(() => setToast(null), 9000); return () => clearTimeout(id); }, [toast]);

  // ---------- camera: eased, slower for long hops (campus <-> UITH), instant if the user prefers reduced motion ----------
  function moveTo(opts: maplibregl.FlyToOptions, long = false) {
    map.current?.flyTo({ ...opts, essential: true, duration: reduced() ? 0 : long ? 2200 : 1000, curve: long ? 1.6 : 1.42, easing: easeInOut });
  }
  const camera = () => ({ duration: reduced() ? 0 : 900, easing: easeInOut, essential: true });

  // ---------- map overlays (re-added after every style change) ----------
  function addOverlays(m: maplibregl.Map) {
    const b = baseRef.current, sat = b === "sat", dark = b === "dark";
    if (!m.getSource("buildings")) m.addSource("buildings", { type: "geojson", data: buildings as any });
    if (!m.getLayer("buildings-fill")) m.addLayer({ id: "buildings-fill", type: "fill", source: "buildings", paint: { "fill-color": sat ? "#FFB74D" : dark ? "#F6A04D" : "#F9D9B0", "fill-opacity": sat ? 0.35 : dark ? 0.5 : 0.9 } });
    if (!m.getLayer("buildings-line")) m.addLayer({ id: "buildings-line", type: "line", source: "buildings", paint: { "line-color": sat ? "#FFB74D" : dark ? "#F6A04D" : "#F29900", "line-width": 2 } });
    if (!m.getSource("paths")) m.addSource("paths", { type: "geojson", data: paths as any });
    if (!m.getLayer("paths-line")) m.addLayer({ id: "paths-line", type: "line", source: "paths", minzoom: 15, paint: { "line-width": 1.5, "line-opacity": 0.75, "line-color": ["match", ["get", "kind"], "road", "#FFFFFF", "covered", "#FDE047", "#22D3EE"] } });
    for (const [id, data] of [["route-alt", routeRef.current.alt], ["route", routeRef.current.main]] as const) if (!m.getSource(id)) m.addSource(id, { type: "geojson", data });
    const round = { "line-cap": "round", "line-join": "round" } as const;
    if (!m.getLayer("route-alt")) m.addLayer({ id: "route-alt", type: "line", source: "route-alt", layout: round, paint: { "line-color": "#9AA0A6", "line-width": 5 } });
    if (!m.getLayer("route-casing")) m.addLayer({ id: "route-casing", type: "line", source: "route", layout: round, paint: { "line-color": "#FFFFFF", "line-width": 10 } });
    if (!m.getLayer("route")) m.addLayer({ id: "route", type: "line", source: "route", layout: round, paint: { "line-color": "#1A73E8", "line-width": 6 } });
    applyLayers(m);
  }
  function applyLayers(m: maplibregl.Map) {
    const f = ["==", ["get", "id"], selRef.current ?? "__none__"] as any;
    for (const id of ["buildings-fill", "buildings-line"]) if (m.getLayer(id)) m.setFilter(id, f);
    if (m.getLayer("paths-line")) m.setLayoutProperty("paths-line", "visibility", tabRef.current === "main" && location.search.includes("paths") ? "visible" : "none"); // dev overlay: /?paths
  }
  /** Sets the route line; with `animate` the line draws itself from start to end. */
  function setRouteData(main: [number, number][] | null, alts: [number, number][][], animate = false) {
    cancelAnimationFrame(raf.current);
    routeRef.current = { main: main ? lines([main]) : EMPTY, alt: lines(alts) };
    const m = map.current; if (!m) return;
    (m.getSource("route-alt") as maplibregl.GeoJSONSource | undefined)?.setData(routeRef.current.alt);
    const src = m.getSource("route") as maplibregl.GeoJSONSource | undefined;
    if (!main || !animate || reduced() || main.length < 2) { src?.setData(routeRef.current.main); return; }
    const cum = [0]; for (let i = 1; i < main.length; i++) cum.push(cum[i - 1] + segLen(main[i - 1], main[i]));
    const total = cum[cum.length - 1] || 1, dur = Math.min(1300, 450 + total * 0.9), t0 = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / dur), len = total * (1 - Math.pow(1 - t, 3));
      let k = 1; while (k < cum.length - 1 && cum[k] < len) k++;
      const a = main[k - 1], b2 = main[k], f = (len - cum[k - 1]) / (cum[k] - cum[k - 1] || 1);
      src?.setData(lines([[...main.slice(0, k), [a[0] + (b2[0] - a[0]) * f, a[1] + (b2[1] - a[1]) * f] as [number, number]]]));
      if (t < 1) raf.current = requestAnimationFrame(step); else src?.setData(routeRef.current.main);
    };
    raf.current = requestAnimationFrame(step);
  }

  // ---------- map init ----------
  useEffect(() => {
    const initial = readBase(); baseRef.current = initial; setBase(initial);
    const m = new maplibregl.Map({ container: el.current!, style: getMapStyle(initial), center: CAMPUS.main.center, zoom: CAMPUS.main.zoom, attributionControl: false, pitchWithRotate: false, dragRotate: false });
    m.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-left");
    m.on("style.load", () => { addOverlays(m); setReady(true); });
    m.on("zoom", () => setZoomed(m.getZoom() >= 16));
    m.on("click", (e) => { if (!(e.originalEvent.target as HTMLElement).closest(".gm-poi")) { setLayerMenu(false); setCampusMenu(false); } });
    map.current = m;
    return () => m.remove();
  }, []);
  const baseTouched = useRef(false);
  useEffect(() => {
    if (!baseTouched.current) { baseTouched.current = true; return; } // first run = the value we just read, nothing to apply
    const m = map.current, box = el.current;
    if (m && ready) {
      box?.classList.add("gm-fading");
      const clear = () => box?.classList.remove("gm-fading");
      window.setTimeout(() => { m.setStyle(getMapStyle(base)); m.once("idle", clear); window.setTimeout(clear, 2500); }, reduced() ? 0 : 140);
    }
    try { localStorage.setItem("unilorin-base", base); } catch { /* ignore */ }
  }, [base]);

  // ---------- load data + deep links ----------
  useEffect(() => {
    try { setRecents(JSON.parse(localStorage.getItem("unilorin-recents") ?? "[]")); } catch { /* ignore */ }
    loadPois().then((ps) => {
      setPois(ps);
      const m = location.hash.match(/^#p=(.+)$/), target = m && ps.find((p) => p.id === decodeURIComponent(m[1]));
      if (target) { pending.current = target; switchRef.current(target.campus === "uith" ? "uith" : "main"); }
      else switchRef.current(location.hash === "#uith" ? "uith" : "main");
    });
    const onHash = () => {
      const m = location.hash.match(/^#p=(.+)$/), p = m && poisRef.current.find((x) => x.id === decodeURIComponent(m[1]));
      if (p) { const t: Tab = p.campus === "uith" ? "uith" : "main"; if (t === tabRef.current) pickRef.current(p); else { pending.current = p; switchRef.current(t); } }
      else if (!location.hash.startsWith("#p=")) switchRef.current(location.hash === "#uith" ? "uith" : "main");
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // ---------- tab switch ----------
  function clearRoute() { setRouteData(null, []); startMarker.current?.remove(); startMarker.current = null; }
  function switchTab(t: Tab) {
    if (t === tab && !pending.current) return;
    setSelected(null); setDir(null); setCat(null); setQ(""); setTravel(false); setFull(false); clearRoute();
    setTab(t);
  }
  switchRef.current = switchTab;
  useEffect(() => {
    const m = map.current; if (!m || !ready) return;
    applyLayers(m);
    const open = pending.current; pending.current = null;
    if (open) { setSelected(open); history.replaceState(null, "", `#p=${open.id}`); moveTo({ center: [open.lng, open.lat], zoom: 17.5 }, true); }
    else { moveTo({ center: CAMPUS[tab].center, zoom: CAMPUS[tab].zoom }, true); if (!location.hash.startsWith("#p=")) history.replaceState(null, "", hashFor(tab)); }
  }, [tab, ready, pois]);

  // ---------- markers ----------
  // Built only when the campus/category changes (so the staggered pop-in plays then, not on every tap).
  useEffect(() => {
    const m = map.current; if (!m) return;
    markers.current.forEach((k) => k.remove()); markerEls.current.clear();
    markers.current = tabPois.filter((p) => !cat || p.category === cat).map((p, i) => {
      const c = CAT[p.category] ?? CAT.admin, d = document.createElement("button");
      d.className = "gm-poi"; d.setAttribute("aria-label", p.name); d.style.setProperty("--i", String(Math.min(i, 26)));
      d.innerHTML = `<span class="gm-poi-dot" style="background:${c.color}"><svg width="16" height="16" viewBox="0 0 24 24" fill="#fff"><path d="${iconPath(c.icon)}"/></svg></span><span class="gm-poi-label">${esc(p.name)}</span>`;
      d.onclick = (e) => { e.stopPropagation(); choosePin(p); };
      markerEls.current.set(p.id, d);
      return new maplibregl.Marker({ element: d, anchor: "top" }).setLngLat([p.lng, p.lat]).addTo(m);
    });
  }, [tabPois, cat, ready]);
  // the selected place shows the red pin instead of its dot
  useEffect(() => { markerEls.current.forEach((el, id) => el.classList.toggle("gm-hide", id === selected?.id)); }, [selected, tabPois, cat, ready]);
  useEffect(() => {
    selMarker.current?.remove(); selMarker.current = null;
    if (map.current && ready) applyLayers(map.current);
    if (!selected || !map.current) return;
    const d = document.createElement("div"); d.className = "gm-pin";
    d.innerHTML = `<svg width="32" height="44" viewBox="0 0 24 34"><path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 22 12 22s12-13 12-22C24 5.4 18.6 0 12 0z" fill="#EA4335"/><circle cx="12" cy="12" r="4.8" fill="#B31412"/></svg>`;
    selMarker.current = new maplibregl.Marker({ element: d, anchor: "bottom" }).setLngLat([selected.lng, selected.lat]).addTo(map.current);
  }, [selected, ready]);
  useEffect(() => {
    startMarker.current?.remove(); startMarker.current = null;
    if (!dir?.start || !map.current) return;
    const d = document.createElement("div"); d.className = "gm-start";
    startMarker.current = new maplibregl.Marker({ element: d }).setLngLat([dir.start.lng, dir.start.lat]).addTo(map.current);
  }, [dir?.start]);

  // ---------- search ----------
  const ql = q.trim().toLowerCase();
  const results = searchPois(tabPois, q), results2 = searchPois(otherPois, q);
  const matchAlias = (campus: string, same: boolean) => (ql.length >= 3 ? elsewhere.find((e) => (e.campus === campus) === same && e.terms.some((t) => ql.includes(t) || (e.prefix !== false && t.includes(ql)))) : undefined);
  const aliasElsewhere = matchAlias(tab, false), aliasHere = matchAlias(tab, true);
  const travelHit = tab === "main" && !aliasElsewhere && ql.length >= 3 && transport.keywords.some((k) => k.includes(ql) || ql.includes(k));

  function remember(p: Poi) { const next = [p.id, ...recents.filter((x) => x !== p.id)].slice(0, 6); setRecents(next); try { localStorage.setItem("unilorin-recents", JSON.stringify(next)); } catch { /* ignore */ } }
  function pick(p: Poi) {
    setSelected(p); setTravel(false); setFull(false); setQ(""); setFocus(false); setDir(null); clearRoute();
    history.replaceState(null, "", `#p=${p.id}`); remember(p);
    moveTo({ center: [p.lng, p.lat], zoom: Math.max(map.current?.getZoom() ?? 15, 17), padding: isDesktop() ? { left: 408, top: 0, right: 0, bottom: 0 } : { top: 0, left: 0, right: 0, bottom: 160 } }); tap();
  }
  pickRef.current = pick;
  function choosePin(p: Poi) {
    if (tabPois.includes(p)) pick(p);
    else { pending.current = p; setQ(""); setToast(`${p.name} is not on the ${CAMPUS[tab].label} tab — it is on ${CAMPUS[otherTab].label}. Switched for you.`); switchTab(otherTab); }
  }
  function jumpToAlias() {
    if (!aliasElsewhere) return;
    setToast(`“${q.trim()}” is not on the ${CAMPUS[tab].label} tab — it is at ${aliasElsewhere.place}. Switched to ${CAMPUS[otherTab].label}; you will need a cab (see below).`);
    switchTab(otherTab); setTravel(true); setFocus(false);
  }
  const openTravel = () => { setSelected(null); setDir(null); clearRoute(); setQ(""); setFocus(false); setDrawer(false); setTravel(true); };
  function onEnter() { if (aliasElsewhere) jumpToAlias(); else if (results[0]) choosePin(results[0]); else if (results2[0]) choosePin(results2[0]); else if (travelHit) openTravel(); (document.activeElement as HTMLElement)?.blur(); }

  // ---------- category chips ----------
  const cats = CHIP_ORDER.filter((c) => tabPois.some((p) => p.category === c));
  function toggleCat(c: Category) {
    const next = cat === c ? null : c; setCat(next); setSelected(null); setDir(null); clearRoute(); setTravel(false);
    const list = tabPois.filter((p) => !next || p.category === next);
    if (next && list.length && map.current) { const b = new maplibregl.LngLatBounds(); list.forEach((p) => b.extend([p.lng, p.lat])); map.current.fitBounds(b, { padding: isDesktop() ? { left: 460, top: 90, right: 80, bottom: 80 } : { top: 130, bottom: 300, left: 50, right: 50 }, maxZoom: 17, ...camera() }); tap(); }
  }

  // ---------- my location ----------
  function toggleLocate() {
    tap(); if (locOn) { if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current); watchId.current = null; meMarker.current?.remove(); meMarker.current = null; setLocOn(false); setLocFix(false); return; }
    if (!navigator.geolocation) { setToast("Location is not available on this device."); return; }
    setLocOn(true); let first = true;
    watchId.current = navigator.geolocation.watchPosition((p) => {
      const ll: [number, number] = [p.coords.longitude, p.coords.latitude], m = map.current!;
      if (!meMarker.current) { const d = document.createElement("div"); d.className = "gm-me"; meMarker.current = new maplibregl.Marker({ element: d }).setLngLat(ll).addTo(m); } else meMarker.current.setLngLat(ll);
      if (first) { first = false; setLocFix(true); moveTo({ center: ll, zoom: Math.max(m.getZoom(), 17) }); }
    }, (e) => { setToast(e.code === 1 ? "Allow location access to see where you are." : "Couldn't get your location."); setLocOn(false); setLocFix(false); }, { enableHighAccuracy: true, maximumAge: 5000 });
  }

  // ---------- directions ----------
  function fit(coords: [number, number][]) {
    const m = map.current; if (!m || !coords.length) return; const b = new maplibregl.LngLatBounds(); coords.forEach((c) => b.extend(c));
    m.fitBounds(b, { padding: isDesktop() ? { left: 460, top: 100, right: 100, bottom: 100 } : { top: 170, bottom: 300, left: 50, right: 50 }, maxZoom: 18, ...camera() });
  }
  function compute(dest: Poi, start: Start, active = 0) {
    const rs = getRoutes(start, dest);
    setDir({ dest, start, routes: rs, active, sq: "", sfocus: false, locating: false });
    show(rs, active);
  }
  function show(rs: RouteOption[], i: number) { setRouteData(rs[i].coordinates, rs.filter((_, k) => k !== i).map((r) => r.coordinates), true); fit(rs[i].coordinates); }
  function openDirections(dest: Poi) {
    setTravel(false); setFull(false);
    setDir({ dest, start: null, routes: [], active: 0, sq: "", sfocus: false, locating: true });
    const done = (start: Start | null) => { if (start) compute(dest, start); else setDir({ dest, start: null, routes: [], active: 0, sq: "", sfocus: true, locating: false }); };
    if (!navigator.geolocation) return done(null);
    navigator.geolocation.getCurrentPosition((p) => {
      const c = CAMPUS[tab].center, km = Math.hypot((p.coords.longitude - c[0]) * 110, (p.coords.latitude - c[1]) * 111);
      done(km < 3 ? { id: "gps", name: "Your location", lat: p.coords.latitude, lng: p.coords.longitude } : null);
    }, () => done(null), { enableHighAccuracy: true, timeout: 6000, maximumAge: 15000 });
  }
  function closeDirections() { setDir(null); clearRoute(); }
  function swap() { if (!dir?.start || dir.start.id === "gps") return; const s = tabPois.find((p) => p.id === dir.start!.id); if (!s) return; setSelected(s); compute(s, { id: dir.dest.id, name: dir.dest.name, lat: dir.dest.lat, lng: dir.dest.lng }); }
  const startOptions = useMemo(() => (dir ? tabPois.filter((p) => p.id !== dir.dest.id && p.name.toLowerCase().includes(dir.sq.trim().toLowerCase())).slice(0, 8) : []), [dir?.sq, dir?.dest.id, tabPois]);

  // ---------- sheet: drag, snapshot (kept so it can animate out), share ----------
  const listView = !!cat && !selected && !dir && !travel;
  const view = travel ? "travel" : dir ? "dir" : selected ? "place" : listView ? "list" : null;
  const snap = useRef<{ view: "travel" | "dir" | "place" | "list"; selected: Poi | null; dir: Dir | null; cat: Category | null } | null>(null);
  if (view) snap.current = { view, selected, dir, cat };
  const S = view ? { view, selected, dir, cat } : snap.current; // while closing, keep showing the last content
  const sheetMounted = useMounted(!!view, 300);
  const sheetUp = view !== null && !(view === "place" && full);
  const lastToast = useRef(""); if (toast) lastToast.current = toast;

  const closeSheet = () => { setSelected(null); setTravel(false); setFull(false); history.replaceState(null, "", hashFor(tab)); };
  const closeCurrent = () => (view === "list" ? setCat(null) : closeSheet());
  const dragState = useRef<{ y0: number; t0: number } | null>(null);
  const onDown = (e: React.PointerEvent) => { dragState.current = { y0: e.clientY, t0: performance.now() }; e.currentTarget.setPointerCapture(e.pointerId); };
  const onMove = (e: React.PointerEvent) => { const d = dragState.current; if (!d) return; const dy = e.clientY - d.y0; setDragY(dy < 0 ? Math.max(dy * 0.4, -60) : dy); }; // rubber-band when pulling up
  const onUp = (e: React.PointerEvent) => {
    const d = dragState.current; dragState.current = null; setDragY(null); if (!d) return;
    const dy = e.clientY - d.y0, v = dy / Math.max(1, performance.now() - d.t0); // px per ms: lets a quick flick count
    if (Math.abs(dy) < 6) { setFull((f) => !f); tap(); return; }
    if (dy < -40 || v < -0.5) { setFull(true); tap(); }
    else if (dy > 60 || v > 0.5) { if (full && view === "place") { setFull(false); tap(); } else closeCurrent(); }
  };
  async function share(p: Poi) {
    const url = `${location.origin}${location.pathname}#p=${p.id}`;
    try { if (navigator.share) await navigator.share({ title: p.name, url }); else { await navigator.clipboard.writeText(url); setToast("Link copied"); } } catch { /* cancelled */ }
  }
  const copyCoords = async (p: Poi) => { try { await navigator.clipboard.writeText(`${p.lat}, ${p.lng}`); setToast("Coordinates copied"); tap(); } catch { /* ignore */ } };

  const row = (key: string, icon: React.ReactNode, title: React.ReactNode, sub: React.ReactNode, onClick: () => void) => (
    <button key={key} className="gm-row" onClick={onClick}><span className="gm-ico">{icon}</span><span><div className="gm-rt">{title}</div>{sub && <div className="gm-rs">{sub}</div>}</span></button>);
  const pinRow = (p: Poi, extra?: string) => row(p.id, <Icon name={CAT[p.category]?.icon ?? "place"} size={20} color={CAT[p.category]?.color} />, p.name, `${CAT[p.category]?.noun ?? ""} · ${p.campus === "uith" ? "UITH & Colleges" : "Main Campus"}${extra ?? ""}`, () => choosePin(p));
  const sel = S?.selected ?? null, sdir = S?.dir ?? null, scat = S?.cat ?? null;
  const sheetClass = !S ? "" : S.view === "place" ? (full ? "full" : "") : S.view === "list" ? "full list" : S.view === "dir" ? "full dirs" : "full travel";

  return (
    <div className={`gm ${base === "sat" ? "sat" : ""} ${base === "dark" ? "dark" : ""} ${view ? "has-sheet" : ""}`}>
      <div ref={el} className={`gm-map ${zoomed ? "z16" : ""}`} />
      <div className="gm-panelbg" />

      {/* ---- top: search pill or directions card ---- */}
      <div className="gm-top">
        {!dir ? (<>
          <div className="gm-search">
            <button className="gm-iconbtn" aria-label="Menu" onClick={() => { setDrawer(true); tap(); }}><Icon name="menu" /></button>
            <input value={q} placeholder={CAMPUS[tab].hint} aria-label="Search" onChange={(e) => setQ(e.target.value)} onFocus={() => setFocus(true)} onBlur={() => setFocus(false)} onKeyDown={(e) => e.key === "Enter" && onEnter()} />
            {q ? <button key="x" className="gm-iconbtn swap" aria-label="Clear" onMouseDown={(e) => e.preventDefault()} onClick={() => setQ("")}><Icon name="close" /></button> : <span key="s" className="gm-iconbtn swap"><Icon name="search" /></span>}
          </div>
          {focus && (
            <div className="gm-drop" onMouseDown={(e) => e.preventDefault()}>
              {!q ? (<>
                {recents.map((id) => pois.find((p) => p.id === id)).filter((p): p is Poi => !!p).map((p) => row("r" + p.id, <Icon name="history" size={20} />, p.name, `${CAT[p.category]?.noun ?? ""} · ${p.campus === "uith" ? "UITH & Colleges" : "Main Campus"}`, () => choosePin(p)))}
                {!recents.length && tabPois.slice(0, 6).map((p) => pinRow(p))}
              </>) : (<>
                {aliasElsewhere && row("alias", <Icon name="hospital" size={20} color="#D93025" />, <>“{q.trim()}” is at {aliasElsewhere.place}</>, `Not on this tab — tap to switch to ${CAMPUS[otherTab].label}`, jumpToAlias)}
                {aliasHere && <div className="gm-row static"><span className="gm-ico"><Icon name="info" size={20} /></span><span><div className="gm-rt">This is at {aliasHere.place}</div><div className="gm-rs">Exact building not mapped yet</div></span></div>}
                {travelHit && row("travel", <Icon name="taxi" size={20} color="#1A73E8" />, transport.shortTitle, "Cab and motor park advice", openTravel)}
                {results.map((p) => pinRow(p))}
                {results2.map((p) => pinRow(p, " (other tab)"))}
                {!aliasElsewhere && !aliasHere && !travelHit && !results.length && !results2.length && <div className="gm-row static"><span className="gm-rs">No places found for “{q}”.</span></div>}
              </>)}
            </div>)}
        </>) : (
          <div className="gm-dir">
            <div className="gm-dir-row">
              <button className="gm-iconbtn" aria-label="Back" onClick={closeDirections}><Icon name="back" /></button>
              <div className="gm-dir-fields">
                <label className="gm-field"><span className="gm-dot" />
                  <input aria-label="Starting point" value={dir.sfocus || dir.sq ? dir.sq : dir.start?.name ?? ""} placeholder={dir.locating ? "Finding your location…" : "Choose starting point"} onChange={(e) => setDir({ ...dir, sq: e.target.value, sfocus: true })} onFocus={(e) => { setDir({ ...dir, sfocus: true }); e.currentTarget.select(); }} onBlur={() => setDir((d) => d && { ...d, sfocus: false, sq: "" })} /></label>
                <div className="gm-field static"><Icon name="place" size={20} color="#EA4335" /><span className="gm-fv">{dir.dest.name}</span></div>
              </div>
              <button className="gm-iconbtn" aria-label="Swap start and destination" onClick={swap}><Icon name="swap" /></button>
            </div>
            <div className="gm-modes"><span className="on"><Icon name="walk" size={20} /> Walking</span></div>
            {dir.sfocus && (
              <div className="gm-drop inner" onMouseDown={(e) => e.preventDefault()}>
                {row("me", <Icon name="locate" size={20} color="#1A73E8" />, "Your location", "Use GPS", () => { (document.activeElement as HTMLElement)?.blur(); setDir({ ...dir, locating: true, sfocus: false }); navigator.geolocation?.getCurrentPosition((p) => compute(dir.dest, { id: "gps", name: "Your location", lat: p.coords.latitude, lng: p.coords.longitude }), () => { setDir((d) => d && { ...d, locating: false }); setToast("Couldn't get your location — choose a starting place instead."); }, { enableHighAccuracy: true, timeout: 8000 }); })}
                {startOptions.map((p) => row("s" + p.id, <Icon name={CAT[p.category]?.icon ?? "place"} size={20} color={CAT[p.category]?.color} />, p.name, CAT[p.category]?.noun, () => { (document.activeElement as HTMLElement)?.blur(); compute(dir.dest, { id: p.id, name: p.name, lat: p.lat, lng: p.lng }); }))}
              </div>)}
          </div>)}
      </div>

      {/* ---- chips (re-keyed per campus so they animate in again) ---- */}
      {!dir && (
        <div className="gm-chips" key={tab}>
          <button className={`gm-chip gm-campus ${campusMenu ? "on" : ""}`} style={{ "--i": 0 } as React.CSSProperties} onClick={() => { setCampusMenu((v) => !v); setLayerMenu(false); tap(); }} aria-haspopup="menu" aria-expanded={campusMenu}><Icon name="place" size={18} color="#EA4335" />{CAMPUS[tab].label}<Icon name="expand" size={18} className="gm-caret" /></button>
          {cats.map((c, i) => <button key={c} className={`gm-chip ${cat === c ? "on" : ""}`} style={{ "--i": i + 1 } as React.CSSProperties} onClick={() => toggleCat(c)} aria-pressed={cat === c}><Icon name={CAT[c].icon} size={18} color={cat === c ? "#174EA6" : CAT[c].color} />{CAT[c].label}</button>)}
        </div>)}
      <Presence open={campusMenu && !dir} ms={150}>{(closing) => (
        <div className={`gm-menu ${closing ? "out" : ""}`} role="menu">
          {(Object.keys(CAMPUS) as Tab[]).map((t) => <button key={t} role="menuitemradio" aria-checked={t === tab} className={t === tab ? "on" : ""} onClick={() => { setCampusMenu(false); switchTab(t); }}><span className="gm-radio" />{CAMPUS[t].label}</button>)}
        </div>)}</Presence>

      {/* ---- map controls ---- */}
      {!dir && (
        <div className="gm-ctrl">
          <button className="gm-sqbtn" aria-label="Map layers" onClick={() => { setLayerMenu((v) => !v); setCampusMenu(false); tap(); }}><Icon name="layers" /></button>
          <Presence open={layerMenu} ms={150}>{(closing) => (
            <div className={`gm-layers ${closing ? "out" : ""}`}>
              {([["map", "Map"], ["dark", "Dark"], ["sat", "Satellite"]] as [Base, string][]).map(([b, l]) => <button key={b} className={base === b ? "on" : ""} onClick={() => { setBase(b); setLayerMenu(false); tap(); }}><span className={`gm-swatch ${b}`} />{l}</button>)}
            </div>)}</Presence>
        </div>)}
      {!(view === "place" && full) && !dir && <button className={`gm-fab ${locOn ? "on" : ""} ${locOn && !locFix ? "seek" : ""} ${sheetUp ? "up" : ""}`} aria-label="Show my location" aria-pressed={locOn} onClick={toggleLocate}><Icon name="locate" /></button>}

      {/* ---- bottom sheet / side panel (one element; content swaps, it slides in/out and follows the finger) ---- */}
      {sheetMounted && S && (
        <section className={`gm-sheet ${sheetClass} ${view ? "open" : "closing"}`} aria-label={sel?.name ?? "Details"} aria-hidden={!view}
          style={dragY !== null ? { transform: `translateY(${dragY}px)`, transition: "none" } : undefined}>
          {S.view !== "dir" && (<>
            <div className="gm-handle" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}><span /></div>
            <button className="gm-x" aria-label="Close" onClick={closeCurrent}><Icon name="close" /></button>
          </>)}
          <div key={`${S.view}:${sel?.id ?? ""}:${scat ?? ""}`} className="gm-swap">
            {S.view === "place" && sel && (
              <div className="gm-pad">
                <h2 className="gm-title">{sel.name}</h2>
                <p className="gm-sub">{CAT[sel.category]?.noun} · {sel.campus === "uith" ? "UITH & Colleges" : "Main Campus"}</p>
                {sel.verified === false && <p className="gm-warn">Location not verified on the ground yet</p>}
                <div className="gm-actions">
                  {sel.campus === "uith" || tabPois.length < 2
                    ? <button className="gm-btn fill" onClick={openTravel}><Icon name="taxi" size={20} color="#fff" />How to get here</button>
                    : <button className="gm-btn fill" onClick={() => { openDirections(sel); tap(); }}><Icon name="directions" size={20} color="#fff" />Directions</button>}
                  <button className="gm-btn" onClick={() => { share(sel); tap(); }}><Icon name="share" size={20} />Share</button>
                </div>
                <div className="gm-photo">{sel.photo ? <img src={sel.photo} alt={sel.name} loading="lazy" /> : <><Icon name="photo" size={32} color="#9aa0a6" /><span>No photo yet</span></>}</div>
                {sel.description && <div className="gm-info"><Icon name="info" size={22} color="#1a73e8" /><span>{sel.description}</span></div>}
                <button className="gm-info click" onClick={() => copyCoords(sel)}><Icon name="place" size={22} color="#1a73e8" /><span>{sel.lat.toFixed(6)}, {sel.lng.toFixed(6)}</span><Icon name="copy" size={18} color="#5f6368" /></button>
                <div className="gm-info"><Icon name="verified" size={22} color={sel.verified === false ? "#9aa0a6" : "#188038"} /><span>{sel.verified === false ? "Not yet confirmed — position from OpenStreetMap" : "Confirmed on the ground"}</span></div>
                {sel.campus === "uith" && <button className="gm-info click" onClick={openTravel}><Icon name="taxi" size={22} color="#1a73e8" /><span>Coming from the Main Campus? How to get here</span></button>}
              </div>)}

            {S.view === "list" && scat && (<>
              <div className="gm-pad"><h2 className="gm-title">{CAT[scat].label}</h2><p className="gm-sub">{tabPois.filter((p) => p.category === scat).length} places · {CAMPUS[tab].label}</p></div>
              {tabPois.filter((p) => p.category === scat).map((p) => pinRow(p))}
            </>)}

            {S.view === "dir" && sdir && (!sdir.routes.length ? <div className="gm-pad gm-empty">{sdir.locating ? "Finding your location…" : "Choose a starting point to see walking routes."}</div> : <>
              {sdir.routes.map((r, i) => (
                <button key={i} className={`gm-route ${i === sdir.active ? "on" : ""}`} onClick={() => { setDir({ ...sdir, active: i }); show(sdir.routes, i); tap(); }}>
                  <Icon name="walk" size={22} color="#5f6368" />
                  <span className="gm-rinfo"><b>{r.walkMinutes} min</b> <small>({fmtDist(routeMeters(r.coordinates))})</small>
                    <span className="gm-rl">{r.label}{r.custom ? "" : r.traced ? " · traced from satellite" : " · straight-line estimate"}</span></span>
                </button>))}
              <p className="gm-fine">{sdir.routes[0].traced || !sdir.routes[0].custom ? "Footpaths are traced from satellite images and not yet walked — allow a little extra time." : "Walked and recorded by the Unilorin Navigator team."}</p>
            </>)}

            {S.view === "travel" && (
              <div className="gm-pad">
                <h2 className="gm-title"><Icon name="taxi" size={26} color="#1a73e8" /> {transport.title}</h2>
                <p className="gm-body">{transport.body}</p>
                <ul className="gm-list">{transport.tips.map((t) => <li key={t}>{t}</li>)}</ul>
                <p className="gm-sub"><b>What we know so far</b></p>
                <ul className="gm-list">{transport.known.map((t) => <li key={t}>{t}</li>)}</ul>
                {!transport.verified && <p className="gm-warn">{transport.note}</p>}
                <div className="gm-actions"><button className="gm-btn fill" onClick={() => switchTab(tab === "main" ? "uith" : "main")}>{tab === "main" ? "Show UITH & Colleges" : "Back to Main Campus"}</button></div>
              </div>)}
          </div>
        </section>)}

      {tab === "uith" && !view && <div className="gm-note"><b>University of Ilorin Teaching Hospital</b><br />Only the hospital grounds are mapped so far — wards, departments and emergency routes will be added after a site visit.<button onClick={openTravel}>Coming from the Main Campus? How to get here</button></div>}

      {/* ---- drawer ---- */}
      <Presence open={drawer} ms={260}>{(closing) => (<>
        <div className={`gm-scrim ${closing ? "out" : ""}`} onClick={() => setDrawer(false)} />
        <aside className={`gm-drawer ${closing ? "out" : ""}`} aria-label="Menu">
          <div className="gm-brand"><span className="gm-logo"><Icon name="place" size={22} color="#fff" /></span><div><b>Unilorin Navigator</b><br /><small>Find your way around campus</small></div></div>
          {(Object.keys(CAMPUS) as Tab[]).map((t) => <button key={t} className={`gm-item ${t === tab ? "on" : ""}`} onClick={() => { setDrawer(false); switchTab(t); }}><Icon name={t === "main" ? "school" : "hospital"} size={22} />{CAMPUS[t].label}</button>)}
          <hr />
          {([["map", "Map view"], ["dark", "Dark map"], ["sat", "Satellite view"]] as [Base, string][]).map(([b, l]) => <button key={b} className={`gm-item ${base === b ? "on" : ""}`} onClick={() => { setBase(b); setDrawer(false); }}><Icon name="layers" size={22} />{l}</button>)}
          <button className="gm-item" onClick={openTravel}><Icon name="taxi" size={22} />Getting to UITH &amp; the colleges</button>
          <a className="gm-item" href="/field/"><Icon name="photo" size={22} />Field collector (team)</a>
          <p className="gm-fine">Map data © OpenStreetMap contributors. Icons: Material Icons (Apache-2.0).</p>
        </aside></>)}</Presence>

      <Presence open={!!toast} ms={240}>{(closing) => (
        <div className={`gm-toast ${sheetUp ? "up" : ""} ${closing ? "out" : ""}`} role="status"><span>{lastToast.current}</span><button onClick={() => setToast(null)}>Dismiss</button></div>)}</Presence>
    </div>
  );
}
