"use client";
import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import maplibregl from "maplibre-gl";
import { type Mode, type Poi, type RouteOption, CAB_M_PER_MIN, WALK_M_PER_MIN, getRoutes } from "@/lib/pois";
import { loadState, saveState, metersBetween } from "@/lib/fieldstore";
import { minutesLeft, prepare, remainingLine, smoothHeading, snapToRoute, type Prepared } from "@/lib/nav";
import { reduced } from "./motion";
import { tap } from "./haptics";
import { type Dir, type Start } from "./types";

interface Args {
  map: { current: maplibregl.Map | null };
  dir: Dir | null;
  setDir: Dispatch<SetStateAction<Dir | null>>;
  setToast: (s: string) => void;
  setRouteData: (main: [number, number][] | null, alts: [number, number][][], animate?: boolean) => void;
  show: (rs: RouteOption[], i: number) => void;
  setSelected: (p: Poi | null) => void;
  closeDirections: () => void;
  stopLocate: () => void;
  walkSavedMsg: () => void;
  saveWalk: boolean;
}

export function useLiveNav({ map, dir, setDir, setToast, setRouteData, show, setSelected, closeDirections, stopLocate, walkSavedMsg, saveWalk }: Args) {
  const [nav, setNav] = useState<{ dest: Poi; mode: Mode } | null>(null), [following, setFollowing] = useState(true);
  const [navInfo, setNavInfo] = useState({ remain: 0, minutes: 0, arrive: "", arrived: false, wait: true, off: false });
  const [recording, setRecording] = useState(false);
  const navWatch = useRef<number | null>(null), navMarker = useRef<maplibregl.Marker | null>(null), navRoute = useRef<Prepared | null>(null), navDest = useRef<Poi | null>(null);
  const navMode = useRef<Mode>("walk"), navFollow = useRef(true), offCount = useRef(0), navHeading = useRef(0), firstFix = useRef(true), arrivedRef = useRef(false), rerouting = useRef(false), navAnim = useRef(0);
  const wake = useRef<{ release: () => Promise<void> } | null>(null);
  const recPts = useRef<[number, number][]>([]), recId = useRef(""), recLabel = useRef(""), recKind = useRef("footpath"), recDest = useRef("");

  const arriveClock = (min: number) => new Date(Date.now() + min * 60000).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  function moveNavDot(to: [number, number], heading: number) {
    const m = map.current; if (!m) return;
    if (!navMarker.current) { const d = document.createElement("div"); d.className = "gm-me nav"; d.innerHTML = '<i class="gm-cone"></i>'; navMarker.current = new maplibregl.Marker({ element: d }).setLngLat(to).addTo(m); }
    const mk = navMarker.current; mk.getElement().style.setProperty("--hd", `${heading - m.getBearing()}deg`);
    const f = mk.getLngLat(), from: [number, number] = [f.lng, f.lat]; cancelAnimationFrame(navAnim.current);
    if (reduced() || (from[0] === to[0] && from[1] === to[1])) { mk.setLngLat(to); return; }
    const t0 = performance.now(), D = 700; // glide between GPS fixes so the dot moves smoothly like Google's
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
    if (pts.length < 5 || meters < 30) return false; // too short to be a useful path
    const st = loadState(), track = { id: recId.current, from: "walk", to: recDest.current, label: recLabel.current, kind: recKind.current, points: pts.map((c) => [+c[0].toFixed(6), +c[1].toFixed(6)] as [number, number]), ts: new Date().toISOString(), meters };
    const i = st.tracks.findIndex((t) => t.id === track.id); if (i >= 0) st.tracks[i] = track; else st.tracks.push(track);
    saveState(st);
    if (final) { recId.current = ""; recPts.current = []; }
    return true;
  }
  function onNavFix(p: GeolocationPosition) {
    const r = navRoute.current, m = map.current; if (!r || !m || arrivedRef.current) return;
    const raw: [number, number] = [p.coords.longitude, p.coords.latitude], acc = p.coords.accuracy || 20;
    if (recId.current && acc <= 25) { // keep good fixes only, at least 4 m apart
      const last = recPts.current[recPts.current.length - 1];
      if (!last || metersBetween(last, raw) >= 4) { recPts.current.push(raw); if (recPts.current.length % 10 === 0) flushWalk(false); } // autosave so a closed tab loses little
    }
    const s = snapToRoute(r, raw), onRoute = s.offM <= Math.max(35, acc);
    const shown: [number, number] = onRoute ? s.point : raw;
    const moving = typeof p.coords.heading === "number" && !Number.isNaN(p.coords.heading) && (p.coords.speed ?? 0) > 0.6;
    navHeading.current = firstFix.current ? s.bearing : smoothHeading(navHeading.current, moving ? p.coords.heading! : s.bearing);
    const remain = onRoute ? s.remaining : s.remaining + s.offM, min = minutesLeft(remain, navPace());
    if (!onRoute) {
      offCount.current += firstFix.current ? 3 : 1; // the very first fix is judged at once, later ones need 3 in a row
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
    stopLocate(); // navigation does its own tracking
    recPts.current = []; recId.current = saveWalk ? String(Date.now()) : ""; recDest.current = dir.dest.id; recKind.current = (dir.routes[dir.active].mode ?? "walk") === "cab" ? "road" : "footpath";
    recLabel.current = `Walked: ${dir.start?.name ?? "Your location"} to ${dir.dest.name}`; setRecording(saveWalk);
    const r = prepare(dir.routes[dir.active].coordinates), nm: Mode = dir.routes[dir.active].mode ?? "walk";
    navMode.current = nm;
    navRoute.current = r; navDest.current = dir.dest; navFollow.current = true; offCount.current = 0; firstFix.current = true; arrivedRef.current = false; setFollowing(true);
    setNav({ dest: dir.dest, mode: nm }); const first = minutesLeft(r.total, nm === "cab" ? CAB_M_PER_MIN : WALK_M_PER_MIN); setNavInfo({ remain: r.total, minutes: first, arrive: arriveClock(first), arrived: false, wait: true, off: false });
    try { (navigator as unknown as { wakeLock?: { request: (t: string) => Promise<{ release: () => Promise<void> }> } }).wakeLock?.request("screen").then((l) => { wake.current = l; }).catch(() => {}); } catch { /* optional */ }
    navWatch.current = navigator.geolocation.watchPosition(onNavFix, (e) => {
      if (e.code === 1) { setToast("Allow location access to navigate."); exitNav(); }
      else if (firstFix.current) setToast("Waiting for a GPS signal…"); // only while we have never had a fix; a resting phone may pause updates
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
    if (toOverview && dir) show(dir.routes, dir.active); // back to the whole-route view
  }
  function finishNav() { const d = nav?.dest; exitNav(false); closeDirections(); if (d) setSelected(d); }
  function recenter() { tap(); navFollow.current = true; setFollowing(true); const p = navMarker.current?.getLngLat(), m = map.current; if (p && m) m.easeTo({ center: p, zoom: Math.max(m.getZoom(), 17.5), bearing: navHeading.current, offset: [0, Math.round((m.getContainer().clientHeight || 600) * 0.16)], duration: reduced() ? 0 : 700, essential: true }); }
  useEffect(() => { if (!dir && nav) exitNav(false); }, [dir]); // leaving directions (tab switch, back) ends navigation

  function teardown() { if (navWatch.current !== null) navigator.geolocation.clearWatch(navWatch.current); cancelAnimationFrame(navAnim.current); }
  function onUserDrag() { if (navWatch.current !== null) { navFollow.current = false; setFollowing(false); } }
  return { nav, navInfo, following, recording, startNav, exitNav, finishNav, recenter, teardown, onUserDrag };
}
