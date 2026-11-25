"use client";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { type Category, type LL, type Mode, type Poi, type RouteOption, CAB_M_PER_MIN, WALK_M_PER_MIN, getRoutes, loadPois, routeMeters, searchPois } from "@/lib/pois";
import { loadState, saveState, metersBetween } from "@/lib/fieldstore";
import { CAN_UPLOAD, flushWalks, forgetWalks, getSharing, setSharing, type Sharing } from "@/lib/walkshare";
import { minutesLeft, prepare, remainingLine, smoothHeading, snapToRoute, type Prepared } from "@/lib/nav";
import { HAS_AWS_MAP, getMapStyle, type Base } from "@/lib/mapStyle";
import { CAT, CHIP_ORDER, Icon, iconPath } from "./gm/icons";
import Onboarding from "./Onboarding";
import buildings from "../../data/buildings.json";
import paths from "../../data/paths.json";
import transport from "../../data/transport.json";
import elsewhere from "../../data/elsewhere.json";

type Tab = "main" | "cohs" | "uith";
type NavTab = "explore" | "browse" | "saved" | "settings";
const CAMPUS: Record<Tab, { label: string; center: [number, number]; zoom: number; hint: string }> = {
  main: { label: "Main Campus", center: [4.6727, 8.4805], zoom: 15.3, hint: "Search Unilorin" },
  cohs: { label: "COHS & Colleges", center: [4.6505, 8.513], zoom: 15, hint: "Search COHS & Colleges" },
  uith: { label: "UITH", center: [4.6456, 8.5390], zoom: 15.5, hint: "Search UITH" },
};
const campusTab = (campus: string): Tab => campus === "cohs" ? "cohs" : campus === "uith" ? "uith" : "main";
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
    const dLat = 0.00011, dLng = 0.00022;
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

const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const tap = (ms = 8) => { try { navigator.vibrate?.(ms); } catch { /* not supported */ } };
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const KX = 111320 * Math.cos((8.48 * Math.PI) / 180), KY = 110574;
const segLen = (a: [number, number], b: [number, number]) => Math.hypot((b[0] - a[0]) * KX, (b[1] - a[1]) * KY);
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
  const skipSave = useRef(false);
  const awaiting = useRef(true);
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
  const [mode, setMode] = useState<Mode>("walk"), modeRef = useRef<Mode>("walk");
  useEffect(() => {
    try { setSaveWalk(localStorage.getItem("unilorin-save-walk") === "1"); } catch { /* ignore */ }
    setSharingState(getSharing()); void flushWalks();
    const online = () => void flushWalks(); window.addEventListener("online", online); return () => window.removeEventListener("online", online);
  }, []);
  const rememberSave = (v: boolean) => { setSaveWalk(v); try { localStorage.setItem("unilorin-save-walk", v ? "1" : "0"); } catch { /* ignore */ } };
  function onSaveToggle(checked: boolean) {
    if (checked && getSharing() === null) { if (CAN_UPLOAD) { setConfirmDel(false); setConsentOpen(true); } else { setSharing("local"); setSharingState("local"); rememberSave(true); } return; }
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
  const [nav, setNav] = useState<{ dest: Poi; mode: Mode } | null>(null), [following, setFollowing] = useState(true);
  const [navInfo, setNavInfo] = useState({ remain: 0, minutes: 0, arrive: "", arrived: false, wait: true, off: false });
  const navWatch = useRef<number | null>(null), navMarker = useRef<maplibregl.Marker | null>(null), navRoute = useRef<Prepared | null>(null), navDest = useRef<Poi | null>(null);
  const navMode = useRef<Mode>("walk"), navFollow = useRef(true), offCount = useRef(0), navHeading = useRef(0), firstFix = useRef(true), arrivedRef = useRef(false), rerouting = useRef(false), navAnim = useRef(0);
  const wake = useRef<{ release: () => Promise<void> } | null>(null);
  const [saveWalk, setSaveWalk] = useState(false), [recording, setRecording] = useState(false);
  const [sharing, setSharingState] = useState<Sharing>(null), [consentOpen, setConsentOpen] = useState(false), [confirmDel, setConfirmDel] = useState(false), [busy, setBusy] = useState(false);
  const recPts = useRef<[number, number][]>([]), recId = useRef(""), recLabel = useRef(""), recKind = useRef("footpath"), recDest = useRef("");
  const [travel, setTravel] = useState(false), [drawer, setDrawer] = useState(false), [layerMenu, setLayerMenu] = useState(false), [navTab, setNavTab] = useState<NavTab>("explore");
  const [locOn, setLocOn] = useState(false), [locFix, setLocFix] = useState(false), [toast, setToast] = useState<string | null>(null), [zoomed, setZoomed] = useState(false), [dragY, setDragY] = useState<number | null>(null);
  const [onboarded, setOnboarded] = useState(true);
  useEffect(() => { try { setOnboarded(!!localStorage.getItem("unilorin-onboarded")); } catch { setOnboarded(true); } }, []);

  const tabPois = useMemo(() => pois.filter((p) => p.campus === tab), [pois, tab]);
  const otherPois = useMemo(() => pois.filter((p) => !tabPois.includes(p)), [pois, tabPois]);
  const tabRef = useRef(tab), baseRef = useRef(base), selRef = useRef<string | null>(null);
  tabRef.current = tab; baseRef.current = base; selRef.current = selected?.id ?? null; poisRef.current = pois;

  useEffect(() => { if (!toast) return; const id = setTimeout(() => setToast(null), 9000); return () => clearTimeout(id); }, [toast]);

  function moveTo(opts: maplibregl.FlyToOptions, long = false) {
    const { padding, ...rest } = opts as maplibregl.FlyToOptions & { padding?: { top?: number; bottom?: number; left?: number; right?: number } };
    const offset: [number, number] | undefined = padding ? [((padding.left ?? 0) - (padding.right ?? 0)) / 2, ((padding.top ?? 0) - (padding.bottom ?? 0)) / 2] : undefined;
    map.current?.flyTo({ ...rest, ...(offset ? { offset } : {}), essential: true, duration: reduced() ? 0 : long ? 2200 : 1000, curve: long ? 1.6 : 1.42, easing: easeInOut });
  }
  const camera = () => ({ duration: reduced() ? 0 : 900, easing: easeInOut, essential: true });

  function addOverlays(m: maplibregl.Map) {
    const b = baseRef.current, sat = b === "sat", dark = b === "dark";
    if (!m.getSource("buildings")) m.addSource("buildings", { type: "geojson", data: buildings as any });
    if (!m.getLayer("buildings-fill")) m.addLayer({ id: "buildings-fill", type: "fill", source: "buildings", paint: { "fill-color": sat ? "#FFB74D" : dark ? "#F6A04D" : "#F9D9B0", "fill-opacity": sat ? 0.35 : dark ? 0.5 : 0.9 } });
    if (!m.getLayer("buildings-line")) m.addLayer({ id: "buildings-line", type: "line", source: "buildings", paint: { "line-color": sat ? "#FFB74D" : dark ? "#F6A04D" : "#F29900", "line-width": 2 } });
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
    if (m.getLayer("paths-line")) m.setLayoutProperty("paths-line", "visibility", tabRef.current === "main" && location.search.includes("paths") ? "visible" : "none");
  }
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

  useEffect(() => {
    const initial = readBase(); baseRef.current = initial; setBase(initial);
    const m = new maplibregl.Map({ container: el.current!, style: getMapStyle(initial), center: CAMPUS.main.center, zoom: CAMPUS.main.zoom, attributionControl: false, pitchWithRotate: false, dragRotate: false });
    m.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-left");
    m.on("style.load", () => { awaiting.current = false; addOverlays(m); setReady(true); });
    m.on("error", () => { if (awaiting.current && baseRef.current === "aws") { awaiting.current = false; setToast("Amazon Map isn't available right now, showing the standard map instead."); skipSave.current = true; setBase("map"); } });
    m.on("zoom", () => setZoomed(m.getZoom() >= 16));
    m.on("dragstart", () => { if (navWatch.current !== null) { navFollow.current = false; setFollowing(false); } });
    m.on("click", (e) => { if (!(e.originalEvent.target as HTMLElement).closest(".gm-poi")) { setLayerMenu(false); } });
    map.current = m;
    if (location.search.includes("debug")) (window as unknown as { __map?: maplibregl.Map }).__map = m;
    return () => { if (navWatch.current !== null) navigator.geolocation.clearWatch(navWatch.current); cancelAnimationFrame(navAnim.current); m.remove(); };
  }, []);
  const baseTouched = useRef(false);
  useEffect(() => {
    if (!baseTouched.current) { baseTouched.current = true; return; }
    const m = map.current, box = el.current;
    if (m) {
      awaiting.current = true;
      box?.classList.add("gm-fading");
      const clear = () => box?.classList.remove("gm-fading");
      window.setTimeout(() => { m.setStyle(getMapStyle(base), { diff: false }); m.once("idle", clear); window.setTimeout(clear, 2500); }, reduced() ? 0 : 140);
    }
    if (skipSave.current) skipSave.current = false; else { try { localStorage.setItem("unilorin-base", base); } catch { /* ignore */ } }
  }, [base]);

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

  const cats = CHIP_ORDER.filter((c) => tabPois.some((p) => p.category === c));
  function toggleCat(c: Category) {
    const next = cat === c ? null : c; setCat(next); setSelected(null); setDir(null); clearRoute(); setTravel(false);
    const list = tabPois.filter((p) => !next || p.category === next);
    if (next && list.length && map.current) { const b = new maplibregl.LngLatBounds(); list.forEach((p) => b.extend([p.lng, p.lat])); map.current.fitBounds(b, { padding: isDesktop() ? { left: 460, top: 90, right: 80, bottom: 80 } : { top: 130, bottom: 300, left: 50, right: 50 }, maxZoom: 17, ...camera() }); tap(); }
  }

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

  function toggleLocate() {
    tap(); if (locOn) { if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current); watchId.current = null; meMarker.current?.remove(); meMarker.current = null; setLocOn(false); setLocFix(false); return; }
    locateBeep();
    if (!navigator.geolocation) { setToast("Location is not available on this device."); return; }
    setLocOn(true); let first = true;
    watchId.current = navigator.geolocation.watchPosition((p) => {
      const ll: [number, number] = [p.coords.longitude, p.coords.latitude], m = map.current!;
      if (!meMarker.current) { const d = document.createElement("div"); d.className = "gm-me"; meMarker.current = new maplibregl.Marker({ element: d }).setLngLat(ll).addTo(m); } else meMarker.current.setLngLat(ll);
      if (first) { first = false; setLocFix(true); moveTo({ center: ll, zoom: Math.max(m.getZoom(), 17) }); }
    }, (e) => { setToast(e.code === 1 ? "Allow location access to see where you are." : "Couldn't get your location."); setLocOn(false); setLocFix(false); }, { enableHighAccuracy: true, maximumAge: 5000 });
  }

  function fit(coords: [number, number][]) {
    const m = map.current; if (!m || !coords.length) return; const b = new maplibregl.LngLatBounds(); coords.forEach((c) => b.extend(c));
    const h = el.current?.clientHeight ?? 700, mapTop = el.current?.getBoundingClientRect().top ?? 0;
    const bar = document.querySelector(".gm-dir")?.getBoundingClientRect();
    const top = bar ? Math.max(120, bar.bottom - mapTop + 14) : 170, bottom = Math.min(380, Math.max(270, Math.round(h * 0.42) + 30));
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

  const arriveClock = (min: number) => new Date(Date.now() + min * 60000).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  function moveNavDot(to: [number, number], heading: number) {
    const m = map.current; if (!m) return;
    if (!navMarker.current) { const d = document.createElement("div"); d.className = "gm-me nav"; d.innerHTML = '<i class="gm-cone"></i>'; navMarker.current = new maplibregl.Marker({ element: d }).setLngLat(to).addTo(m); }
    const mk = navMarker.current; mk.getElement().style.setProperty("--hd", `${heading - m.getBearing()}deg`);
    const f = mk.getLngLat(), from: [number, number] = [f.lng, f.lat]; cancelAnimationFrame(navAnim.current);
    if (reduced() || (from[0] === to[0] && from[1] === to[1])) { mk.setLngLat(to); return; }
    const t0 = performance.now(), D = 700;
    const step = (now: number) => { const t = Math.min(1, (now - t0) / D); mk.setLngLat([from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t]); if (t < 1) navAnim.current = requestAnimationFrame(step); };
    navAnim.current = requestAnimationFrame(step);
  }
  function reroute(from: [number, number]) {
    const dest = navDest.current; if (!dest || rerouting.current) return; rerouting.current = true;
    const start: Start = { id: "gps", name: "Your location", lat: from[1], lng: from[0] };
    const rs = getRoutes(start, dest, navMode.current);
    navRoute.current = prepare(rs[0].coordinates); setRouteData(rs[0].coordinates, []); offCount.current = 0;
    setDir((d) => (d ? { ...d, start, routes: rs, active: 0 } : d));
    setToast(rs[0].kind === "estimate" ? "You are away from the mapped paths, so this is a straight line to the destination." : "Route updated from where you are.");
    rerouting.current = false;
  }
  const navPace = () => (navDest.current && navMode.current === "cab" ? CAB_M_PER_MIN : WALK_M_PER_MIN);
  function flushWalk(final: boolean): boolean {
    const pts = recPts.current; if (!recId.current) return false;
    const meters = Math.round(pts.slice(1).reduce((t, c, i) => t + metersBetween(pts[i], c), 0));
    if (pts.length < 5 || meters < 30) return false;
    const st = loadState(), track = { id: recId.current, from: "walk", to: recDest.current, label: recLabel.current, kind: recKind.current, points: pts.map((c) => [+c[0].toFixed(6), +c[1].toFixed(6)] as [number, number]), ts: new Date().toISOString(), meters };
    const i = st.tracks.findIndex((t) => t.id === track.id); if (i >= 0) st.tracks[i] = track; else st.tracks.push(track);
    saveState(st);
    if (final) { recId.current = ""; recPts.current = []; }
    return true;
  }
  function onNavFix(p: GeolocationPosition) {
    const r = navRoute.current, m = map.current; if (!r || !m || arrivedRef.current) return;
    const raw: [number, number] = [p.coords.longitude, p.coords.latitude], acc = p.coords.accuracy || 20;
    if (recId.current && acc <= 25) {
      const last = recPts.current[recPts.current.length - 1];
      if (!last || metersBetween(last, raw) >= 4) { recPts.current.push(raw); if (recPts.current.length % 10 === 0) flushWalk(false); }
    }
    const s = snapToRoute(r, raw), onRoute = s.offM <= Math.max(35, acc);
    const shown: [number, number] = onRoute ? s.point : raw;
    const moving = typeof p.coords.heading === "number" && !Number.isNaN(p.coords.heading) && (p.coords.speed ?? 0) > 0.6;
    navHeading.current = firstFix.current ? s.bearing : smoothHeading(navHeading.current, moving ? p.coords.heading! : s.bearing);
    const remain = onRoute ? s.remaining : s.remaining + s.offM, min = minutesLeft(remain, navPace());
    if (!onRoute) {
      offCount.current += firstFix.current ? 3 : 1;
      if (offCount.current >= 3 && acc <= 80) { firstFix.current = false; reroute(raw); }
    } else { offCount.current = 0; setRouteData(remainingLine(r, s), []); }
    moveNavDot(shown, navHeading.current);
    setNavInfo({ remain, minutes: min, arrive: arriveClock(min), arrived: false, wait: false, off: !onRoute });
    if (onRoute && s.remaining <= 20) { arrive(); return; }
    if (navFollow.current) m.easeTo({ center: shown, zoom: Math.max(m.getZoom(), 17.5), bearing: navHeading.current, offset: [0, Math.round((m.getContainer().clientHeight || 600) * 0.16)], duration: reduced() ? 0 : 900, essential: true });
    firstFix.current = false;
  }
  function arrive() {
    arrivedRef.current = true;
    if (flushWalk(true)) { setRecording(false); walkSavedMsg(); }
    if (navWatch.current !== null) { navigator.geolocation.clearWatch(navWatch.current); navWatch.current = null; }
    const d = navDest.current; if (d) moveNavDot([d.lng, d.lat], navHeading.current);
    setRouteData(null, []); setNavInfo((i) => ({ ...i, remain: 0, minutes: 0, arrived: true, wait: false, off: false }));
    try { navigator.vibrate?.([120, 60, 120]); } catch { /* not supported */ }
    map.current?.easeTo({ center: d ? [d.lng, d.lat] : map.current.getCenter(), zoom: 18, bearing: 0, duration: reduced() ? 0 : 800, essential: true });
  }
  function startNav() {
    if (!dir || !dir.routes.length) return;
    if (!navigator.geolocation) { setToast("Location is not available on this device."); return; }
    tap();
    if (watchId.current !== null) { navigator.geolocation.clearWatch(watchId.current); watchId.current = null; }
    meMarker.current?.remove(); meMarker.current = null; setLocOn(false); setLocFix(false);
    recPts.current = []; recId.current = saveWalk ? String(Date.now()) : ""; recDest.current = dir.dest.id; recKind.current = (dir.routes[dir.active].mode ?? "walk") === "cab" ? "road" : "footpath";
    recLabel.current = `Walked: ${dir.start?.name ?? "Your location"} to ${dir.dest.name}`; setRecording(saveWalk);
    const r = prepare(dir.routes[dir.active].coordinates), nm: Mode = dir.routes[dir.active].mode ?? "walk";
    navMode.current = nm;
    navRoute.current = r; navDest.current = dir.dest; navFollow.current = true; offCount.current = 0; firstFix.current = true; arrivedRef.current = false; setFollowing(true);
    setNav({ dest: dir.dest, mode: nm }); const first = minutesLeft(r.total, nm === "cab" ? CAB_M_PER_MIN : WALK_M_PER_MIN); setNavInfo({ remain: r.total, minutes: first, arrive: arriveClock(first), arrived: false, wait: true, off: false });
    try { (navigator as unknown as { wakeLock?: { request: (t: string) => Promise<{ release: () => Promise<void> }> } }).wakeLock?.request("screen").then((l) => { wake.current = l; }).catch(() => {}); } catch { /* optional */ }
    navWatch.current = navigator.geolocation.watchPosition(onNavFix, (e) => {
      if (e.code === 1) { setToast("Allow location access to navigate."); exitNav(); }
      else if (firstFix.current) setToast("Waiting for a GPS signal…");
    }, { enableHighAccuracy: true, maximumAge: 1000, timeout: 60000 });
  }
  function exitNav(toOverview = true) {
    if (flushWalk(true)) walkSavedMsg();
    recId.current = ""; setRecording(false);
    if (navWatch.current !== null) { navigator.geolocation.clearWatch(navWatch.current); navWatch.current = null; }
    cancelAnimationFrame(navAnim.current); navMarker.current?.remove(); navMarker.current = null;
    wake.current?.release().catch(() => {}); wake.current = null;
    navRoute.current = null; navDest.current = null; arrivedRef.current = false;
    setNav(null); setFollowing(true);
    const m = map.current; m?.easeTo({ bearing: 0, pitch: 0, duration: reduced() ? 0 : 600 });
    if (toOverview && dir) show(dir.routes, dir.active);
  }
  function finishNav() { const d = nav?.dest; exitNav(false); closeDirections(); if (d) setSelected(d); }
  function recenter() { tap(); navFollow.current = true; setFollowing(true); const p = navMarker.current?.getLngLat(), m = map.current; if (p && m) m.easeTo({ center: p, zoom: Math.max(m.getZoom(), 17.5), bearing: navHeading.current, offset: [0, Math.round((m.getContainer().clientHeight || 600) * 0.16)], duration: reduced() ? 0 : 700, essential: true }); }
  useEffect(() => { if (!dir && nav) exitNav(false); }, [dir]);
  function swap() { if (!dir?.start || dir.start.id === "gps") return; const s = tabPois.find((p) => p.id === dir.start!.id); if (!s) return; setSelected(s); compute(s, { id: dir.dest.id, name: dir.dest.name, lat: dir.dest.lat, lng: dir.dest.lng }); }
  const startOptions = useMemo(() => (dir ? tabPois.filter((p) => p.id !== dir.dest.id && p.name.toLowerCase().includes(dir.sq.trim().toLowerCase())).slice(0, 8) : []), [dir?.sq, dir?.dest.id, tabPois]);

  const listView = !!cat && !selected && !dir && !travel;
  const view = nav ? null : travel ? "travel" : dir ? "dir" : selected ? "place" : listView ? "list" : null;
  const snap = useRef<{ view: "travel" | "dir" | "place" | "list"; selected: Poi | null; dir: Dir | null; cat: Category | null } | null>(null);
  if (view) snap.current = { view, selected, dir, cat };
  const S = view ? { view, selected, dir, cat } : snap.current;
  const sheetMounted = useMounted(!!view, 300);
  const sheetUp = view !== null && !(view === "place" && full);
  const lastToast = useRef(""); if (toast) lastToast.current = toast;

  const closeSheet = () => { setSelected(null); setTravel(false); setFull(false); history.replaceState(null, "", hashFor(tab)); };
  const closeCurrent = () => (view === "list" ? setCat(null) : closeSheet());
  const dragState = useRef<{ y0: number; t0: number } | null>(null);
  const onDown = (e: React.PointerEvent) => { dragState.current = { y0: e.clientY, t0: performance.now() }; e.currentTarget.setPointerCapture(e.pointerId); };
  const onMove = (e: React.PointerEvent) => { const d = dragState.current; if (!d) return; const dy = e.clientY - d.y0; setDragY(dy < 0 ? Math.max(dy * 0.4, -60) : dy); };
  const onUp = (e: React.PointerEvent) => {
    const d = dragState.current; dragState.current = null; setDragY(null); if (!d) return;
    const dy = e.clientY - d.y0, v = dy / Math.max(1, performance.now() - d.t0);
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
                {aliasElsewhere && row("alias", <Icon name="hospital" size={20} color="#D93025" />, <>"{q.trim()}" is at {aliasElsewhere.place}</>, `Not on this tab, tap to switch to ${CAMPUS[campusTab(aliasElsewhere.campus)].label}`, jumpToAlias)}
                {aliasHere && <div className="gm-row static"><span className="gm-ico"><Icon name="info" size={20} /></span><span><div className="gm-rt">This is at {aliasHere.place}</div><div className="gm-rs">Exact building not mapped yet</div></span></div>}
                {travelHit && row("travel", <Icon name="taxi" size={20} color="#1A73E8" />, transport.shortTitle, "Cab and motor park advice", openTravel)}
                {results.map((p) => pinRow(p))}
                {results2.map((p) => pinRow(p, " (other tab)"))}
                {!aliasElsewhere && !aliasHere && !travelHit && !results.length && !results2.length && <div className="gm-row static"><span className="gm-rs">No places found for "{q}".</span></div>}
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

      {navTab === "explore" && !dir && !nav && (
        <div className="gm-camtabs" key={`ct-${tab}`}>
          {(Object.keys(CAMPUS) as Tab[]).map((t) => (
            <button key={t} className={`gm-camtab ${tab === t ? "on" : ""}`} onClick={() => { switchTab(t); tap(); }}>{CAMPUS[t].label}</button>
          ))}
        </div>)}
      {!dir && navTab === "explore" && (
        <div className="gm-chips" key={tab}>
          {cats.map((c, i) => <button key={c} className={`gm-chip ${cat === c ? "on" : ""}`} style={{ "--i": i } as React.CSSProperties} onClick={() => toggleCat(c)} aria-pressed={cat === c}><Icon name={CAT[c].icon} size={18} color={cat === c ? "#174EA6" : CAT[c].color} />{CAT[c].label}</button>)}
        </div>)}

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
              <div className="gm-pad">
                <h2 className="gm-title">{sel.name}</h2>
                <p className="gm-sub">{CAT[sel.category]?.noun} · {CAMPUS[campusTab(sel.campus)].label}</p>
                {sel.verified === false && <p className="gm-warn">Location not verified on the ground yet</p>}
                <div className="gm-actions">
                  {(sel.campus === "uith" || sel.campus === "cohs") || tabPois.length < 2
                    ? <button className="gm-btn fill" onClick={openTravel}><Icon name="taxi" size={20} color="#fff" />How to get here</button>
                    : <button className="gm-btn fill" onClick={() => { openDirections(sel); tap(); }}><Icon name="directions" size={20} color="#fff" />Directions</button>}
                  <button className="gm-btn" onClick={() => { share(sel); tap(); }}><Icon name="share" size={20} />Share</button>
                </div>
                {sel.block != null && (() => {
                  const siblings = pois.filter((p) => p.block === sel.block && p.id !== sel.id);
                  return (
                    <div className="gm-block-siblings">
                      <div className="gm-block-siblings-top">
                        <span className="gm-block-badge">Block {sel.block}</span>
                        <span className="gm-block-siblings-loc">Walkway / Skyway complex</span>
                      </div>
                      {siblings.length > 0 && <>
                        <p className="gm-block-siblings-hd">Also in Block {sel.block}</p>
                        {siblings.map((p) => (
                          <button key={p.id} className="gm-block-sibling" onClick={() => choosePin(p)}>
                            <Icon name={CAT[p.category]?.icon ?? "place"} size={18} color={CAT[p.category]?.color} />
                            <span>{p.name}</span>
                          </button>
                        ))}
                      </>}
                    </div>
                  );
                })()}
                <div className="gm-photo">{sel.photo ? <img src={sel.photo} alt={sel.name} loading="lazy" /> : <><Icon name="photo" size={32} color="#9aa0a6" /><span>No photo yet</span></>}</div>
                {sel.description && <div className="gm-info"><Icon name="info" size={22} color="#1a73e8" /><span>{sel.description}</span></div>}
                <button className="gm-info click" onClick={() => copyCoords(sel)}><Icon name="place" size={22} color="#1a73e8" /><span>{sel.lat.toFixed(6)}, {sel.lng.toFixed(6)}</span><Icon name="copy" size={18} color="#5f6368" /></button>
                <div className="gm-info"><Icon name="verified" size={22} color={sel.verified === false ? "#9aa0a6" : "#188038"} /><span>{sel.verified === false ? "Not yet confirmed, position from OpenStreetMap" : "Confirmed on the ground"}</span></div>
                {(sel.campus === "uith" || sel.campus === "cohs") && <button className="gm-info click" onClick={openTravel}><Icon name="taxi" size={22} color="#1a73e8" /><span>Coming from the Main Campus? How to get here</span></button>}
              </div>)}

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

      <Presence open={drawer} ms={260}>{(closing) => (<>
        <div className={`gm-scrim ${closing ? "out" : ""}`} onClick={() => setDrawer(false)} />
        <aside className={`gm-drawer ${closing ? "out" : ""}`} aria-label="Menu">
          <div className="gm-brand"><span className="gm-logo"><Icon name="place" size={22} color="#fff" /></span><div><b>Unilorin Navigator</b><br /><small>Find your way around campus</small></div></div>
          {(Object.keys(CAMPUS) as Tab[]).map((t) => <button key={t} className={`gm-item ${t === tab ? "on" : ""}`} onClick={() => { setDrawer(false); switchTab(t); }}><Icon name={t === "uith" ? "hospital" : "school"} size={22} />{CAMPUS[t].label}</button>)}
          <hr />
          {BASES.map(([b, , l]) => <button key={b} className={`gm-item ${base === b ? "on" : ""}`} onClick={() => { setBase(b); setDrawer(false); }}><Icon name="layers" size={22} />{l}</button>)}
          <button className="gm-item" onClick={openTravel}><Icon name="taxi" size={22} />Getting to COHS &amp; UITH</button>
          <a className="gm-item" href="/field/"><Icon name="photo" size={22} />Field collector (team)</a>
          <p className="gm-fine">Map data © OpenStreetMap contributors. Icons: Material Icons (Apache-2.0).</p>
        </aside></>)}</Presence>

      {navTab === "browse" && (
        <div className="gm-screen">
          <div className="gm-screen-head"><h2>Browse</h2><p>{CAMPUS[tab].label}</p></div>
          {tabPois.length === 0
            ? <div style={{ padding: "48px 24px", textAlign: "center", color: "var(--sub)", fontSize: 15, lineHeight: 1.5 }}>
                <svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor" style={{ opacity: .3, display: "block", margin: "0 auto 16px" }}><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
                No places mapped for {CAMPUS[tab].label} yet.
              </div>
            : <div className="gm-browse-grid">
                {CHIP_ORDER.filter((c) => tabPois.some((p) => p.category === c)).map((c, i) => {
                  const count = tabPois.filter((p) => p.category === c).length;
                  return (
                    <button key={c} className="gm-browse-card" style={{ animationDelay: `${i * 40}ms` } as React.CSSProperties}
                      onClick={() => { setNavTab("explore"); toggleCat(c); tap(); }}>
                      <div className="gm-browse-icon" style={{ background: CAT[c].color + "22" }}>
                        <Icon name={CAT[c].icon} size={24} color={CAT[c].color} />
                      </div>
                      <span className="gm-browse-name">{CAT[c].label}</span>
                      <span className="gm-browse-count">{count} place{count !== 1 ? "s" : ""}</span>
                    </button>);
                })}
              </div>}
        </div>)}

      {navTab === "saved" && (
        <div className="gm-screen">
          <div className="gm-screen-head"><h2>Saved</h2><p>Your recent places</p></div>
          {recents.length === 0
            ? <div style={{ padding: "32px 16px", textAlign: "center", color: "var(--sub)", fontSize: 14 }}>No saved places yet. Tap a pin on the map to explore places.</div>
            : recents.map((id) => pois.find((p) => p.id === id)).filter((p): p is Poi => !!p).map((p) => (
                <button key={p.id} className="gm-row" onClick={() => { setNavTab("explore"); choosePin(p); tap(); }}>
                  <span className="gm-ico"><Icon name={CAT[p.category]?.icon ?? "place"} size={20} color={CAT[p.category]?.color} /></span>
                  <span><div className="gm-rt">{p.name}</div><div className="gm-rs">{CAT[p.category]?.noun ?? ""} · {CAMPUS[campusTab(p.campus)].label}</div></span>
                </button>))}
        </div>)}

      {navTab === "settings" && (
        <div className="gm-screen">
          <div className="gm-screen-head"><h2>Settings</h2><p>Map style and options</p></div>
          <div className="gm-screen-head" style={{ paddingTop: 4 }}><p style={{ fontWeight: 500, color: "var(--text)" }}>Map style</p></div>
          <div className="gm-settings-layers">
            {BASES.map(([b, l]) => (
              <button key={b} className={`gm-settings-layer ${base === b ? "on" : ""}`} onClick={() => { setBase(b); tap(); }}>
                <span className={`gm-swatch ${b}`} style={{ width: 52, height: 52, borderRadius: 8, display: "block" }} />
                {l}
              </button>))}
          </div>
          <hr className="gm-settings-hr" />
          <div className="gm-screen-head" style={{ paddingTop: 4 }}><p style={{ fontWeight: 500, color: "var(--text)" }}>Campus</p></div>
          {(Object.keys(CAMPUS) as Tab[]).map((t) => (
            <button key={t} className="gm-row" onClick={() => { setNavTab("explore"); switchTab(t); tap(); }}>
              <span className="gm-ico"><Icon name={t === "uith" ? "hospital" : "school"} size={20} /></span>
              <span><div className="gm-rt">{CAMPUS[t].label}</div><div className="gm-rs">{tab === t ? "Currently shown" : "Tap to switch"}</div></span>
            </button>))}
          <hr className="gm-settings-hr" />
          <button className="gm-row" onClick={() => { setNavTab("explore"); openTravel(); tap(); }}>
            <span className="gm-ico"><Icon name="taxi" size={20} color="#1a73e8" /></span>
            <span><div className="gm-rt">Getting to COHS &amp; UITH</div><div className="gm-rs">Cab and motor park advice</div></span>
          </button>
          <a className="gm-row" href="/field/" style={{ display: "flex", alignItems: "center", gap: 0, textDecoration: "none", color: "inherit" }}>
            <span className="gm-ico"><Icon name="photo" size={20} /></span>
            <span><div className="gm-rt">Field collector</div><div className="gm-rs">Map team only</div></span>
          </a>
          <p className="gm-fine" style={{ padding: "16px 16px 32px" }}>Map data &copy; OpenStreetMap contributors. Icons: Material Icons (Apache-2.0).</p>
        </div>)}

      <nav className="gm-bottomnav" aria-label="Main navigation">
        <button className={`gm-navitem ${navTab === "explore" ? "on" : ""}`} onClick={() => { setNavTab("explore"); tap(); }} aria-label="Explore">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
          Explore
        </button>
        <button className={`gm-navitem ${navTab === "browse" ? "on" : ""}`} onClick={() => { setNavTab("browse"); tap(); }} aria-label="Browse">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M4 8h4V4H4v4zm6 12h4v-4h-4v4zm-6 0h4v-4H4v4zm0-6h4v-4H4v4zm6 0h4v-4h-4v4zm6-10v4h4V4h-4zm-6 4h4V4h-4v4zm6 6h4v-4h-4v4zm0 6h4v-4h-4v4z"/></svg>
          Browse
        </button>
        <button className={`gm-navitem ${navTab === "explore" && tab === "cohs" ? "on" : ""}`} onClick={() => { setNavTab("explore"); switchTab("cohs"); tap(); }} aria-label="COHS">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M19 3H5c-1.1 0-1.99.9-1.99 2L3 19c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-1 11h-4v4h-4v-4H6v-4h4V6h4v4h4v4z"/></svg>
          COHS
        </button>
        <button className={`gm-navitem ${navTab === "saved" ? "on" : ""}`} onClick={() => { setNavTab("saved"); tap(); }} aria-label="Saved">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M17 3H7c-1.1 0-1.99.9-1.99 2L5 21l7-3 7 3V5c0-1.1-.9-2-2-2z"/></svg>
          Saved
        </button>
        <button className={`gm-navitem ${navTab === "settings" ? "on" : ""}`} onClick={() => { setNavTab("settings"); tap(); }} aria-label="Settings">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>
          Settings
        </button>
      </nav>

      {consentOpen && (
        <div className="gm-scrim2" onClick={() => { setConsentOpen(false); setConfirmDel(false); }}>
          <div className="gm-dialog" role="dialog" aria-modal="true" aria-labelledby="walk-consent-title" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => { if (e.key === "Escape") { setConsentOpen(false); setConfirmDel(false); } }}>
            <h2 id="walk-consent-title">Help improve the Unilorin map</h2>
            <p>When you use <b>Start</b>, the app can save the path your phone follows. The team uses real walks to add paths that are missing from the map.</p>
            <div className="gm-dl"><b>What is saved</b><ul><li>The GPS points of that walk, the time, and where you were going.</li><li>A random code made on your phone. <u>Not</u> your name, number or email.</li><li>The first 40 m of each walk is cut off, so where you started is not shared.</li></ul></div>
            <div className="gm-dl"><b>What is not</b><ul><li>Nothing is saved or sent when you are not using Start.</li><li>We do not ask for your name, number or email, and we do not contact you.</li></ul></div>
            <div className="gm-dl"><b>Your control</b><ul><li>Only the map team can see shared walks. They are deleted automatically after 12 months.</li><li>You can stop and delete everything you shared, from this same screen.</li></ul></div>
            {confirmDel ? (
              <div className="gm-dact">
                <p className="gm-dwarn">Delete every walk you have shared and stop sharing?</p>
                <button className="gm-dbtn danger" disabled={busy} onClick={stopAndDelete}>{busy ? "Deleting…" : "Yes, delete and stop"}</button>
                <button className="gm-dbtn ghost" disabled={busy} onClick={() => setConfirmDel(false)}>Cancel</button>
              </div>
            ) : (
              <div className="gm-dact">
                {sharing !== "upload" && <button className="gm-dbtn primary" autoFocus onClick={() => chooseSharing("upload")}>Share my walks</button>}
                {sharing === "upload" && CAN_UPLOAD && <button className="gm-dbtn primary" autoFocus onClick={() => setConsentOpen(false)}>Keep sharing</button>}
                {sharing !== "local" && sharing !== "upload" && <button className="gm-dbtn secondary" onClick={() => chooseSharing("local")}>Keep on my phone only</button>}
                {sharing === "upload" && <button className="gm-dbtn danger" onClick={() => setConfirmDel(true)}>Stop sharing and delete my walks</button>}
                {sharing === "local" && CAN_UPLOAD && <button className="gm-dbtn secondary" onClick={() => chooseSharing("upload")}>Share my walks</button>}
                {sharing === null && <button className="gm-dbtn ghost" onClick={() => setConsentOpen(false)}>Not now</button>}
                {sharing !== null && (sharing !== "upload" || !CAN_UPLOAD) && <button className="gm-dbtn ghost" onClick={() => setConsentOpen(false)}>Close</button>}
              </div>
            )}
          </div>
        </div>)}
      {nav && (
        <div className="gm-navbar">
          <button className="gm-navx" onClick={() => (navInfo.arrived ? finishNav() : exitNav())}>{navInfo.arrived ? "Done" : "Exit"}</button>
          <div className="gm-navstats">{navInfo.arrived ? <b>You are at {nav.dest.name}</b> : navInfo.wait ? <b>Finding your location…</b> : <><b><Icon name={nav.mode === "cab" ? "car" : "walk"} size={20} color="#188038" /> {navInfo.minutes} min</b><span>{fmtDist(navInfo.remain)} · arrive {navInfo.arrive}</span>{recording && <small className="gm-rec-on">Saving this walk</small>}</></>}</div>
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
