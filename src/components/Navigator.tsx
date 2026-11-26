"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { type Category, type Mode, type Poi, type RouteOption, getRoutes, loadPois, routeMeters, searchPois } from "@/lib/pois";
import { CAN_UPLOAD, flushWalks, forgetWalks, getSharing, setSharing, type Sharing } from "@/lib/walkshare";
import { HAS_AWS_MAP, getMapStyle, type Base } from "@/lib/mapStyle";
import { CAT, CHIP_ORDER, Icon, iconPath } from "./gm/icons";
import PlaceDetail from "./gm/PlaceDetail";
import WalkConsent from "./gm/WalkConsent";
import Onboarding from "./Onboarding";
import { Presence, useMounted } from "./gm/Presence";
import { CAMPUS, campusTab, type NavTab, type Tab } from "./gm/campus";
import { tap } from "./gm/haptics";
import { reduced } from "./gm/motion";
import { useLiveNav } from "./gm/useLiveNav";
import { type Dir, type Start } from "./gm/types";
import Drawer from "./gm/Drawer";
import BottomNav from "./gm/BottomNav";
import BrowseScreen from "./gm/BrowseScreen";
import SavedScreen from "./gm/SavedScreen";
import SettingsScreen from "./gm/SettingsScreen";
import buildings from "../../data/buildings.json";
import paths from "../../data/paths.json";
import transport from "../../data/transport.json";
import elsewhere from "../../data/elsewhere.json";

const BASES: [Base, string, string][] = [["map", "Map", "Map view"], ["dark", "Dark", "Dark map"], ["sat", "Satellite", "Satellite view"], ...(HAS_AWS_MAP ? [["aws", "Amazon Map", "Amazon Map (AWS)"] as [Base, string, string]] : [])];
const readBase = (): Base => { try { const b = localStorage.getItem("unilorin-base") as Base | null; if (b && BASES.some((x) => x[0] === b)) return b; } catch { /* ignore */ } return "sat"; };
const EMPTY: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };
const lines = (cs: [number, number][][]): GeoJSON.FeatureCollection => ({ type: "FeatureCollection", features: cs.map((c) => ({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: c } })) });

// Academic block centres (Walkway/Skyway complex, Main Campus)
const BLOCK_CENTERS = [
  { n: 1, lat: 8.4791, lng: 4.6708 }, { n: 2, lat: 8.4793, lng: 4.6712 },
  { n: 3, lat: 8.4796, lng: 4.6716 }, { n: 4, lat: 8.4798, lng: 4.6720 },
  { n: 5, lat: 8.4800, lng: 4.6724 }, { n: 6, lat: 8.4803, lng: 4.6728 },
  { n: 7, lat: 8.4806, lng: 4.6733 }, { n: 8, lat: 8.4808, lng: 4.6738 },
  { n: 9, lat: 8.4810, lng: 4.6742 }, { n: 10, lat: 8.4812, lng: 4.6745 },
];
const BLOCK_GEOJSON: GeoJSON.FeatureCollection = {
  type: "FeatureCollection",
  features: BLOCK_CENTERS.map(({ n, lat, lng }) => {
    const dLat = 0.00011, dLng = 0.00022; // ~12m × 20m half-extents per block wing
    return {
      type: "Feature" as const,
      properties: { name: `Block ${n}`, n },
      geometry: {
        type: "Polygon" as const,
        coordinates: [[[lng - dLng, lat - dLat], [lng + dLng, lat - dLat], [lng + dLng, lat + dLat], [lng - dLng, lat + dLat], [lng - dLng, lat - dLat]]],
      },
    };
  }),
};
const fmtDist = (m: number) => (m < 1000 ? `${Math.max(10, Math.round(m / 10) * 10)} m` : `${(m / 1000).toFixed(1)} km`);
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const isDesktop = () => typeof window !== "undefined" && window.innerWidth >= 900;
const hashFor = (t: Tab) => (t === "uith" ? "#uith" : t === "cohs" ? "#cohs" : "#main");

// ---- motion helpers ----
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const KX = 111320 * Math.cos((8.48 * Math.PI) / 180), KY = 110574;
const segLen = (a: [number, number], b: [number, number]) => Math.hypot((b[0] - a[0]) * KX, (b[1] - a[1]) * KY);

export default function Navigator() {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const markers = useRef<maplibregl.Marker[]>([]);
  const selMarker = useRef<maplibregl.Marker | null>(null), startMarker = useRef<maplibregl.Marker | null>(null), meMarker = useRef<maplibregl.Marker | null>(null);
  const watchId = useRef<number | null>(null);
  const routeRef = useRef<{ main: GeoJSON.FeatureCollection; alt: GeoJSON.FeatureCollection }>({ main: EMPTY, alt: EMPTY });
  const pending = useRef<Poi | null>(null), switchRef = useRef<(t: Tab) => void>(() => {});
  const skipSave = useRef(false); // a fallback (e.g. Amazon outage) must not overwrite the user's saved choice
  const awaiting = useRef(true); // true from 'asked for a style' until it has loaded
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
  // live navigation ("Start"): follow the walker's GPS dot along the chosen route
  const [mode, setMode] = useState<Mode>("walk"), modeRef = useRef<Mode>("walk");
  useEffect(() => {
    try { setSaveWalk(localStorage.getItem("unilorin-save-walk") === "1"); } catch { /* ignore */ }
    setSharingState(getSharing()); void flushWalks(); // send walks recorded earlier (if the person chose to share)
    const online = () => void flushWalks(); window.addEventListener("online", online); return () => window.removeEventListener("online", online);
  }, []);
  const rememberSave = (v: boolean) => { setSaveWalk(v); try { localStorage.setItem("unilorin-save-walk", v ? "1" : "0"); } catch { /* ignore */ } };
  function onSaveToggle(checked: boolean) {
    if (checked && getSharing() === null) { if (CAN_UPLOAD) { setConfirmDel(false); setConsentOpen(true); } else { setSharing("local"); setSharingState("local"); rememberSave(true); } return; } // first time: ask
    rememberSave(checked);
  }
  function chooseSharing(c: "upload" | "local") {
    setSharing(c); setSharingState(c); rememberSave(true); setConsentOpen(false); setConfirmDel(false);
    if (c === "upload") void flushWalks();
    setToast(c === "upload" ? "Thank you! Your walks will be shared with the map team." : "OK. Your walks stay on this phone.");
  }
  async function stopAndDelete() {
    setBusy(true); const ok = await forgetWalks(); setBusy(false);
    if (ok) { setSharingState("local"); setConsentOpen(false); setConfirmDel(false); setToast("Sharing is off and everything you shared was deleted."); }
    else setToast("Couldn't reach the server. Try again when you are online.");
  }
  function walkSavedMsg() {
    if (getSharing() === "upload") void flushWalks().then((n) => setToast(n > 0 ? "Thank you! Your walk was shared with the map team." : "Your walk is saved. It will be shared when you are online."));
    else setToast("Your walk is saved on this phone. Open the Field page to share it with the team.");
  }
  // "Save my walk": GPS fixes kept on this phone (never uploaded) in the same store the /field collector exports
  const [saveWalk, setSaveWalk] = useState(false);
  const [sharing, setSharingState] = useState<Sharing>(null), [consentOpen, setConsentOpen] = useState(false), [confirmDel, setConfirmDel] = useState(false), [busy, setBusy] = useState(false);
  const [travel, setTravel] = useState(false), [drawer, setDrawer] = useState(false), [layerMenu, setLayerMenu] = useState(false), [navTab, setNavTab] = useState<NavTab>("explore");
  const [locOn, setLocOn] = useState(false), [locFix, setLocFix] = useState(false), [toast, setToast] = useState<string | null>(null), [zoomed, setZoomed] = useState(false), [dragY, setDragY] = useState<number | null>(null);
  const [onboarded, setOnboarded] = useState(true); // true = already done, skip overlay
  useEffect(() => { try { setOnboarded(!!localStorage.getItem("unilorin-onboarded")); } catch { setOnboarded(true); } }, []);

  const { nav, navInfo, following, recording, startNav, exitNav, finishNav, recenter, teardown, onUserDrag } = useLiveNav({ map, dir, setDir, setToast, setRouteData, show, setSelected, closeDirections, stopLocate, walkSavedMsg, saveWalk });

  const tabPois = useMemo(() => pois.filter((p) => p.campus === tab), [pois, tab]);
  const otherPois = useMemo(() => pois.filter((p) => !tabPois.includes(p)), [pois, tabPois]);
  const tabRef = useRef(tab), baseRef = useRef(base), selRef = useRef<string | null>(null);
  tabRef.current = tab; baseRef.current = base; selRef.current = selected?.id ?? null; poisRef.current = pois;

  useEffect(() => { if (!toast) return; const id = setTimeout(() => setToast(null), 9000); return () => clearTimeout(id); }, [toast]);

  // ---------- camera: eased, slower for long hops (campus <-> UITH), instant if the user prefers reduced motion ----------
  function moveTo(opts: maplibregl.FlyToOptions, long = false) {
    // `padding` on flyTo is remembered by the camera and silently shrinks every later fitBounds (a 1 km route ended up at zoom 12),
    // so turn it into a one-off `offset` that is not remembered.
    const { padding, ...rest } = opts as maplibregl.FlyToOptions & { padding?: { top?: number; bottom?: number; left?: number; right?: number } };
    const offset: [number, number] | undefined = padding ? [((padding.left ?? 0) - (padding.right ?? 0)) / 2, ((padding.top ?? 0) - (padding.bottom ?? 0)) / 2] : undefined;
    map.current?.flyTo({ ...rest, ...(offset ? { offset } : {}), essential: true, duration: reduced() ? 0 : long ? 2200 : 1000, curve: long ? 1.6 : 1.42, easing: easeInOut });
  }
  const camera = () => ({ duration: reduced() ? 0 : 900, easing: easeInOut, essential: true });

  // ---------- map overlays (re-added after every style change) ----------
  function addOverlays(m: maplibregl.Map) {
    const b = baseRef.current, sat = b === "sat", dark = b === "dark";
    if (!m.getSource("buildings")) m.addSource("buildings", { type: "geojson", data: buildings as any });
    if (!m.getLayer("buildings-fill")) m.addLayer({ id: "buildings-fill", type: "fill", source: "buildings", paint: { "fill-color": sat ? "#FFB74D" : dark ? "#F6A04D" : "#F9D9B0", "fill-opacity": sat ? 0.35 : dark ? 0.5 : 0.9 } });
    if (!m.getLayer("buildings-line")) m.addLayer({ id: "buildings-line", type: "line", source: "buildings", paint: { "line-color": sat ? "#FFB74D" : dark ? "#F6A04D" : "#F29900", "line-width": 2 } });
    // Academic block outlines
    if (!m.getSource("blocks")) m.addSource("blocks", { type: "geojson", data: BLOCK_GEOJSON });
    if (!m.getLayer("blocks-fill")) m.addLayer({ id: "blocks-fill", type: "fill", source: "blocks", minzoom: 15, paint: { "fill-color": sat ? "#60A5FA" : dark ? "#3B82F6" : "#1A73E8", "fill-opacity": sat ? 0.08 : 0.1 } });
    if (!m.getLayer("blocks-line")) m.addLayer({ id: "blocks-line", type: "line", source: "blocks", minzoom: 15, paint: { "line-color": sat ? "#93C5FD" : dark ? "#60A5FA" : "#1A73E8", "line-width": 1.5, "line-dasharray": [4, 2] } });
    if (!m.getLayer("blocks-label")) m.addLayer({ id: "blocks-label", type: "symbol", source: "blocks", minzoom: 16, layout: { "text-field": ["get", "name"], "text-size": 11, "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"], "text-anchor": "center" }, paint: { "text-color": sat ? "#BFDBFE" : dark ? "#93C5FD" : "#1A73E8", "text-halo-color": sat ? "rgba(0,0,0,.7)" : dark ? "rgba(0,0,0,.7)" : "rgba(255,255,255,.9)", "text-halo-width": 1.5 } });
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
    m.on("style.load", () => { awaiting.current = false; addOverlays(m); setReady(true); });
    // If the Amazon map can't be loaded (outage, bad key, offline) fall back to the standard map instead of leaving a blank screen.
    m.on("error", () => { if (awaiting.current && baseRef.current === "aws") { awaiting.current = false; setToast("Amazon Map isn't available right now, showing the standard map instead."); skipSave.current = true; setBase("map"); } });
    m.on("zoom", () => setZoomed(m.getZoom() >= 16));
    m.on("dragstart", () => onUserDrag());
    m.on("click", (e) => { if (!(e.originalEvent.target as HTMLElement).closest(".gm-poi")) { setLayerMenu(false); } });
    map.current = m;
    if (location.search.includes("debug")) (window as unknown as { __map?: maplibregl.Map }).__map = m; // test hook, only with ?debug
    return () => { teardown(); m.remove(); };
  }, []);
  const baseTouched = useRef(false);
  useEffect(() => {
    if (!baseTouched.current) { baseTouched.current = true; return; } // first run = the value we just read, nothing to apply
    const m = map.current, box = el.current;
    if (m) { // not gated on `ready`: even if the first style failed, switching views must still work
      awaiting.current = true;
      box?.classList.add("gm-fading");
      const clear = () => box?.classList.remove("gm-fading");
      window.setTimeout(() => { m.setStyle(getMapStyle(base), { diff: false }); m.once("idle", clear); /* diff:false => always a full reload, so style.load fires and the overlays (route, buildings) are re-added */ window.setTimeout(clear, 2500); }, reduced() ? 0 : 140);
    }
    if (skipSave.current) skipSave.current = false; else { try { localStorage.setItem("unilorin-base", base); } catch { /* ignore */ } }
  }, [base]);

  // ---------- load data + deep links ----------
  useEffect(() => {
    try { setRecents(JSON.parse(localStorage.getItem("unilorin-recents") ?? "[]")); } catch { /* ignore */ }
    loadPois().then((ps) => {
      setPois(ps);
      const m = location.hash.match(/^#p=(.+)$/), target = m && ps.find((p) => p.id === decodeURIComponent(m[1]));
      if (target) { pending.current = target; switchRef.current(campusTab(target.campus)); }
      else switchRef.current(location.hash === "#uith" ? "uith" : location.hash === "#cohs" ? "cohs" : "main");
    });
    const onHash = () => {
      const m = location.hash.match(/^#p=(.+)$/), p = m && poisRef.current.find((x) => x.id === decodeURIComponent(m[1]));
      if (p) { const t = campusTab(p.campus); if (t === tabRef.current) pickRef.current(p); else { pending.current = p; switchRef.current(t); } }
      else if (!location.hash.startsWith("#p=")) switchRef.current(location.hash === "#uith" ? "uith" : location.hash === "#cohs" ? "cohs" : "main");
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
    else { const dest = campusTab(p.campus); pending.current = p; setQ(""); setToast(`${p.name} is not on the ${CAMPUS[tab].label} tab, it is on ${CAMPUS[dest].label}. Switched for you.`); switchTab(dest); }
  }
  function jumpToAlias() {
    if (!aliasElsewhere) return;
    const dest = campusTab(aliasElsewhere.campus);
    setToast(`"${q.trim()}" is not on the ${CAMPUS[tab].label} tab, it is at ${aliasElsewhere.place}. Switched to ${CAMPUS[dest].label}; you will need a cab (see below).`);
    switchTab(dest); setTravel(true); setFocus(false);
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
  function locateBeep() {
    try {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const osc = ctx.createOscillator(); const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = "sine"; osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.22, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.14);
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.14);
    } catch { /* ignore */ }
  }

  function stopLocate() { if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current); watchId.current = null; meMarker.current?.remove(); meMarker.current = null; setLocOn(false); setLocFix(false); }
  function toggleLocate() {
    tap(); if (locOn) { stopLocate(); return; }
    locateBeep();
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
    // keep the route clear of the top card (measured) and the bottom sheet, like Google does
    const h = el.current?.clientHeight ?? 700, mapTop = el.current?.getBoundingClientRect().top ?? 0;
    const bar = document.querySelector(".gm-dir")?.getBoundingClientRect();
    const top = bar ? Math.max(120, bar.bottom - mapTop + 14) : 170, bottom = Math.min(380, Math.max(270, Math.round(h * 0.42) + 30)); /* route sheet incl. the Start button + the height of the destination pin */
    m.fitBounds(b, { padding: isDesktop() ? { left: 460, top: 100, right: 100, bottom: 100 } : { top, bottom, left: 44, right: 44 }, maxZoom: 18, ...camera() });
  }
  function compute(dest: Poi, start: Start, active = 0) {
    const rs = getRoutes(start, dest, modeRef.current);
    setDir({ dest, start, routes: rs, active, sq: "", sfocus: false, locating: false });
    show(rs, active);
  }
  function switchMode(m: Mode) {
    if (modeRef.current === m) return; tap();
    modeRef.current = m; setMode(m);
    if (dir?.start) compute(dir.dest, dir.start);
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
  const view = nav ? null : travel ? "travel" : dir ? "dir" : selected ? "place" : listView ? "list" : null;
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
  const pinRow = (p: Poi, extra?: string) => row(p.id, <Icon name={CAT[p.category]?.icon ?? "place"} size={20} color={CAT[p.category]?.color} />, p.name, `${CAT[p.category]?.noun ?? ""} · ${CAMPUS[campusTab(p.campus)].label}${extra ?? ""}`, () => choosePin(p));
  const sel = S?.selected ?? null, sdir = S?.dir ?? null, scat = S?.cat ?? null;
  const sheetClass = !S ? "" : S.view === "place" ? (full ? "full" : "") : S.view === "list" ? "full list" : S.view === "dir" ? "full dirs" : "full travel";

  return (
    <div className={`gm ${base === "sat" ? "sat" : ""} ${base === "dark" ? "dark" : ""} ${view ? "has-sheet" : ""} ${nav ? "navigating" : ""}`}>
      <div ref={el} className={`gm-map ${zoomed ? "z16" : ""}`} />
      <div className="gm-panelbg" />

      {/* ---- top: search pill or directions card ---- */}
      <div className="gm-top">
        {nav ? (
          <div className={`gm-navtop ${navInfo.arrived ? "done" : ""}`} role="status" aria-live="polite">
            <Icon name={navInfo.arrived ? "place" : nav.mode === "cab" ? "car" : "walk"} size={30} color="#fff" />
            <div className="gm-navtxt">
              <small>{navInfo.arrived ? "You have arrived" : navInfo.wait ? "Finding your location…" : navInfo.off ? "Away from the path" : "Follow the blue line"}</small>
              <b>{navInfo.arrived ? nav.dest.name : `${nav.mode === "cab" ? "Ride" : "Walk"} to ${nav.dest.name}`}</b>
            </div>
            {!navInfo.arrived && !navInfo.wait && <span className="gm-navdist">{fmtDist(navInfo.remain)}</span>}
          </div>
        ) : !dir ? (<>
          <div className="gm-search">
            <button className="gm-iconbtn" aria-label="Menu" onClick={() => { setDrawer(true); tap(); }}><Icon name="menu" /></button>
            <input value={q} placeholder={CAMPUS[tab].hint} aria-label="Search" onChange={(e) => setQ(e.target.value)} onFocus={() => setFocus(true)} onBlur={() => setFocus(false)} onKeyDown={(e) => e.key === "Enter" && onEnter()} />
            {q ? <button key="x" className="gm-iconbtn swap" aria-label="Clear" onMouseDown={(e) => e.preventDefault()} onClick={() => setQ("")}><Icon name="close" /></button> : <span key="s" className="gm-iconbtn swap"><Icon name="search" /></span>}
          </div>
          {focus && (
            <div className="gm-drop" onMouseDown={(e) => e.preventDefault()}>
              {!q ? (<>
                {recents.map((id) => pois.find((p) => p.id === id)).filter((p): p is Poi => !!p).map((p) => row("r" + p.id, <Icon name="history" size={20} />, p.name, `${CAT[p.category]?.noun ?? ""} · ${CAMPUS[campusTab(p.campus)].label}`, () => choosePin(p)))}
                {!recents.length && tabPois.slice(0, 6).map((p) => pinRow(p))}
              </>) : (<>
                {aliasElsewhere && row("alias", <Icon name="hospital" size={20} color="#D93025" />, <>“{q.trim()}” is at {aliasElsewhere.place}</>, `Not on this tab, tap to switch to ${CAMPUS[campusTab(aliasElsewhere.campus)].label}`, jumpToAlias)}
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
            <div className="gm-modes" role="tablist" aria-label="Travel mode">
              {(["walk", "cab"] as Mode[]).map((m) => <button key={m} role="tab" aria-selected={mode === m} className={mode === m ? "on" : ""} onClick={() => switchMode(m)}><Icon name={m === "walk" ? "walk" : "car"} size={20} /> {m === "walk" ? "Walking" : "Cab"}</button>)}
            </div>
            {dir.sfocus && (
              <div className="gm-drop inner" onMouseDown={(e) => e.preventDefault()}>
                {row("me", <Icon name="locate" size={20} color="#1A73E8" />, "Your location", "Use GPS", () => { (document.activeElement as HTMLElement)?.blur(); setDir({ ...dir, locating: true, sfocus: false }); navigator.geolocation?.getCurrentPosition((p) => compute(dir.dest, { id: "gps", name: "Your location", lat: p.coords.latitude, lng: p.coords.longitude }), () => { setDir((d) => d && { ...d, locating: false }); setToast("Couldn't get your location, choose a starting place instead."); }, { enableHighAccuracy: true, timeout: 8000 }); })}
                {startOptions.map((p) => row("s" + p.id, <Icon name={CAT[p.category]?.icon ?? "place"} size={20} color={CAT[p.category]?.color} />, p.name, CAT[p.category]?.noun, () => { (document.activeElement as HTMLElement)?.blur(); compute(dir.dest, { id: p.id, name: p.name, lat: p.lat, lng: p.lng }); }))}
              </div>)}
          </div>)}
      </div>

      {/* ---- campus tabs ---- */}
      {navTab === "explore" && !dir && !nav && (
        <div className="gm-camtabs" key={`ct-${tab}`}>
          {(Object.keys(CAMPUS) as Tab[]).map((t) => (
            <button key={t} className={`gm-camtab ${tab === t ? "on" : ""}`} onClick={() => { switchTab(t); tap(); }}>{CAMPUS[t].label}</button>
          ))}
        </div>)}
      {/* ---- chips (re-keyed per campus so they animate in again) ---- */}
      {!dir && navTab === "explore" && (
        <div className="gm-chips" key={tab}>
          {cats.map((c, i) => <button key={c} className={`gm-chip ${cat === c ? "on" : ""}`} style={{ "--i": i } as React.CSSProperties} onClick={() => toggleCat(c)} aria-pressed={cat === c}><Icon name={CAT[c].icon} size={18} color={cat === c ? "#174EA6" : CAT[c].color} />{CAT[c].label}</button>)}
        </div>)}

      {/* ---- map controls ---- */}
      {!dir && navTab === "explore" && (
        <div className="gm-ctrl">
          <button className="gm-sqbtn" aria-label="Map layers" onClick={() => { setLayerMenu((v) => !v); tap(); }}><Icon name="layers" /></button>
          <Presence open={layerMenu} ms={150}>{(closing) => (
            <div className={`gm-layers ${closing ? "out" : ""}`}>
              {BASES.map(([b, l]) => <button key={b} className={base === b ? "on" : ""} onClick={() => { setBase(b); setLayerMenu(false); tap(); }}><span className={`gm-swatch ${b}`} />{l}</button>)}
            </div>)}</Presence>
        </div>)}
      {!(view === "place" && full) && !dir && navTab === "explore" && (
        <button className={`gm-whereami ${locOn ? "on" : ""} ${locOn && !locFix ? "seek" : ""} ${sheetUp ? "up" : ""}`} aria-label="Show my location" aria-pressed={locOn} onClick={toggleLocate}>
          <Icon name="locate" size={20} />
          <span className="gm-whereami-label">Where am I?</span>
        </button>
      )}

      {/* ---- bottom sheet / side panel (one element; content swaps, it slides in/out and follows the finger) ---- */}
      {sheetMounted && S && (
        <section className={`gm-sheet ${sheetClass} ${view ? "open" : "closing"}`} aria-label={sel?.name ?? "Details"} aria-hidden={!view}
          style={dragY !== null ? { transform: `translateY(${dragY}px)`, transition: "none" } : undefined}>
          {S.view !== "dir" && (
            <div className="gm-grip">
              <div className="gm-handle" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}><span /></div>
              <button className="gm-x" aria-label="Close" onClick={closeCurrent}><Icon name="close" /></button>
            </div>)}
          <div key={`${S.view}:${sel?.id ?? ""}:${scat ?? ""}`} className="gm-swap">
            {S.view === "place" && sel && (
              <PlaceDetail
                poi={sel}
                pois={pois}
                campusLabel={CAMPUS[campusTab(sel.campus)].label}
                showTravel={(sel.campus === "uith" || sel.campus === "cohs") || tabPois.length < 2}
                onDirections={() => { openDirections(sel); tap(); }}
                onTravel={openTravel}
                onShare={() => { share(sel); tap(); }}
                onCopyCoords={() => copyCoords(sel)}
                onChoosePin={choosePin}
              />)}

            {S.view === "list" && scat && (<>
              <div className="gm-pad"><h2 className="gm-title">{CAT[scat].label}</h2><p className="gm-sub">{tabPois.filter((p) => p.category === scat).length} places · {CAMPUS[tab].label}</p></div>
              {tabPois.filter((p) => p.category === scat).map((p) => pinRow(p))}
            </>)}

            {S.view === "dir" && sdir && (!sdir.routes.length ? <div className="gm-pad gm-empty">{sdir.locating ? "Finding your location…" : "Choose a starting point to see walking routes."}</div> : <>
              {sdir.routes.map((r, i) => (
                <button key={i} className={`gm-route ${i === sdir.active ? "on" : ""}`} onClick={() => { setDir({ ...sdir, active: i }); show(sdir.routes, i); tap(); }}>
                  <Icon name={r.mode === "cab" ? "car" : "walk"} size={22} color="#5f6368" />
                  <span className="gm-rinfo"><b>{r.walkMinutes} min</b> <small>({fmtDist(routeMeters(r.coordinates))})</small>
                    <span className="gm-rl">{r.label}{r.custom ? "" : r.traced ? " · traced from satellite" : " · straight-line estimate"}</span></span>
                </button>))}
              <div className="gm-pad gm-startrow">
                <label className="gm-rec"><input type="checkbox" checked={saveWalk} onChange={(e) => onSaveToggle(e.target.checked)} /><span><b>Save my walk to improve the map</b><small>{sharing === "upload" ? (CAN_UPLOAD ? "Shared with the map team. Your name is not included." : "Sharing is paused. Kept on this phone.") : sharing === "local" ? "Kept on this phone only." : "You will be asked how it is used."}</small></span></label>
                {sharing && (CAN_UPLOAD || sharing === "upload") && <button className="gm-rec-link" onClick={() => { setConfirmDel(false); setConsentOpen(true); }}>Change walk sharing</button>}
                <button className="gm-startbtn" onClick={startNav}><Icon name="navigate" size={20} color="#fff" /> Start</button></div>
              <p className="gm-fine">{sdir.routes[0].mode === "cab" ? "A cab stays on the roads, so you may be dropped at the nearest road and walk the last bit. Agree the fare with the driver before you get in." : sdir.routes[0].traced || !sdir.routes[0].custom ? "Footpaths are traced from satellite images and not yet walked, allow a little extra time." : "Walked and recorded by the Unilorin Navigator team."}</p>
            </>)}

            {S.view === "travel" && (
              <div className="gm-pad">
                <h2 className="gm-title"><Icon name="taxi" size={26} color="#1a73e8" /> {transport.title}</h2>
                <p className="gm-body">{transport.body}</p>
                <ol className="gm-steps">{transport.steps.map((t) => <li key={t}>{t}</li>)}</ol>
                <p className="gm-sub"><b>Good to know</b></p>
                <ul className="gm-list">{transport.tips.map((t) => <li key={t}>{t}</li>)}</ul>
                <p className="gm-sub"><b>What we know so far</b></p>
                <ul className="gm-list">{transport.known.map((t) => <li key={t}>{t}</li>)}</ul>
                {!transport.verified && <p className="gm-warn">{transport.note}</p>}
                <div className="gm-actions">
                  {tab !== "cohs" && <button className="gm-btn" onClick={() => switchTab("cohs")}>Show COHS &amp; Colleges</button>}
                  {tab !== "uith" && <button className="gm-btn" onClick={() => switchTab("uith")}>Show UITH</button>}
                  {tab !== "main" && <button className="gm-btn fill" onClick={() => switchTab("main")}>Back to Main Campus</button>}
                </div>
              </div>)}
          </div>
        </section>)}

      {tab === "uith" && !view && navTab === "explore" && <div className="gm-note"><b>University of Ilorin Teaching Hospital</b><br />Only the hospital grounds are mapped so far, wards, departments and emergency routes will be added after a site visit.<button onClick={openTravel}>Coming from the Main Campus? How to get here</button></div>}
      {tab === "cohs" && !view && navTab === "explore" && <div className="gm-note"><b>College of Health Sciences</b><br />Old College class area and New College lecture halls are pinned. More buildings will be added after a site visit.<button onClick={openTravel}>Coming from the Main Campus? How to get here</button></div>}

      <Drawer open={drawer} tab={tab} base={base} bases={BASES} onClose={() => setDrawer(false)} onSwitchTab={switchTab} onSetBase={setBase} onTravel={openTravel} />

      {navTab === "browse" && <BrowseScreen pois={tabPois} campusLabel={CAMPUS[tab].label} onPickCategory={(c) => { setNavTab("explore"); toggleCat(c); }} />}

      {navTab === "saved" && <SavedScreen recents={recents} pois={pois} onChoose={(p) => { setNavTab("explore"); choosePin(p); }} />}

      {navTab === "settings" && <SettingsScreen base={base} bases={BASES} tab={tab} onSetBase={setBase} onSwitchCampus={(t) => { setNavTab("explore"); switchTab(t); }} onTravel={() => { setNavTab("explore"); openTravel(); }} />}

      <BottomNav navTab={navTab} tab={tab} onSelect={setNavTab} onCohs={() => { setNavTab("explore"); switchTab("cohs"); }} />

      {consentOpen && (
        <WalkConsent
          sharing={sharing}
          busy={busy}
          confirmDel={confirmDel}
          CAN_UPLOAD={CAN_UPLOAD}
          onChooseSharing={chooseSharing}
          onStopDelete={stopAndDelete}
          onSetConfirmDel={setConfirmDel}
          onClose={() => { setConsentOpen(false); setConfirmDel(false); }}
        />)}
      {nav && (
        <div className="gm-navbar">
          <button className="gm-navx" onClick={() => (navInfo.arrived ? finishNav() : exitNav())}>{navInfo.arrived ? "Done" : "Exit"}</button>
          <div className="gm-navstats">{navInfo.arrived ? <b>You are at {nav.dest.name}</b> : navInfo.wait ? <b>Finding your location…</b> : <><b><Icon name={nav.mode === "cab" ? "car" : "walk"} size={20} color="#188038" /> {navInfo.minutes} min</b><span>{fmtDist(navInfo.remain)} · arrive {navInfo.arrive}</span>{recording && <small className="gm-rec-on">Saving this walk</small>}</>}</div>
        </div>)}
      {nav && !following && !navInfo.arrived && <button className="gm-recenter" onClick={recenter}><Icon name="navigate" size={18} color="#1a73e8" /> Re-center</button>}
      <Presence open={!!toast} ms={240}>{(closing) => (
        <div className={`gm-toast ${sheetUp ? "up" : ""} ${closing ? "out" : ""}`} role="status"><span>{lastToast.current}</span><button onClick={() => setToast(null)}>Dismiss</button></div>)}</Presence>
      {!onboarded && (
        <Onboarding onDone={(t) => {
          switchTab(t);
          try { localStorage.setItem("unilorin-onboarded", "1"); } catch { /* ignore */ }
          setOnboarded(true);
        }} />)}
    </div>
  );
}
