"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import pois from "../../data/pois.json";
import { csvCell, parseCsv, slug } from "@/lib/csv";
import { bestFix, clearPhotos, delPhoto, getPhoto, loadState, metersBetween, putPhoto, saveState, shrink, type FieldRecord, type FieldState, type FieldTrack } from "@/lib/fieldstore";

const CATS = ["faculty", "hostel", "eatery", "atm", "gate", "health", "admin", "cbt", "uith", "lecture", "sports", "worship", "market", "transport"];
interface Item { key: string; name: string; category: string; campus: string; hint: string; current?: { lat: number; lng: number }; recheck: boolean }

const download = (name: string, data: Blob | string, type = "text/plain") => {
  const a = document.createElement("a"); a.href = URL.createObjectURL(data instanceof Blob ? data : new Blob([data], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
};

export default function FieldCollector({ csv }: { csv: string }) {
  const [st, setSt] = useState<FieldState>({ collector: "", records: {}, tracks: [] });
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState<"places" | "paths" | "export">("places");
  const [sel, setSel] = useState<string | null>(null);
  const [filter, setFilter] = useState(""), [show, setShow] = useState<"todo" | "done" | "all">("todo");
  const [gps, setGps] = useState<{ lat: number; lng: number; acc: number } | null>(null);
  const [msg, setMsg] = useState(""), [busy, setBusy] = useState(false), [note, setNote] = useState("");
  const [photo, setPhoto] = useState<Blob | null>(null), [photoUrl, setPhotoUrl] = useState("");
  const [custom, setCustom] = useState({ name: "", category: "admin", campus: "main" });
  // footpath recorder
  const [pf, setPf] = useState({ from: "", to: "", label: "", kind: "shortcut" });
  const [rec, setRec] = useState<{ pts: [number, number][]; meters: number; acc: number } | null>(null);
  const watch = useRef<number | null>(null);

  useEffect(() => { setSt(loadState()); setLoaded(true); }, []);
  useEffect(() => { if (loaded) saveState(st); }, [st, loaded]);

  const items = useMemo(() => {
    const m = new Map<string, Item>();
    for (const p of pois as any[]) m.set(slug(p.name), { key: slug(p.name), name: p.name, category: p.category, campus: p.campus, hint: p.description, current: { lat: p.lat, lng: p.lng }, recheck: true });
    for (const r of parseCsv(csv)) { const k = slug(r.name); if (!m.has(k)) m.set(k, { key: k, name: r.name, category: r.category, campus: r.campus || "main", hint: r.description, recheck: false }); }
    for (const r of Object.values(st.records)) if (r.custom && !m.has(r.key)) m.set(r.key, { key: r.key, name: r.name, category: r.category, campus: r.campus, hint: "Added in the field", recheck: false });
    return [...m.values()];
  }, [csv, st.records]);

  const shown = items.filter((i) => (show === "all" || (show === "done") === !!st.records[i.key]) && i.name.toLowerCase().includes(filter.toLowerCase()));
  const item = items.find((i) => i.key === sel) ?? null;
  const done = Object.keys(st.records).length;

  function pickItem(i: Item) {
    setSel(i.key); setGps(null); setMsg(""); setPhoto(null); setPhotoUrl("");
    const r = st.records[i.key]; setNote(r?.note ?? "");
    if (r?.hasPhoto) getPhoto(i.key).then((b) => { if (b) { setPhoto(b); setPhotoUrl(URL.createObjectURL(b)); } });
  }

  async function useGps() {
    setBusy(true); setMsg("Getting GPS… stand still at the entrance for ~10 seconds");
    try { const f = await bestFix((a) => setMsg(`Reading GPS… accuracy ±${Math.round(a)} m`)); setGps(f); setMsg(f.acc > 25 ? `Got a fix but only ±${Math.round(f.acc)} m — move to open sky and try again.` : `Good fix: ±${Math.round(f.acc)} m`); }
    catch (e: any) { setMsg(e.message); }
    setBusy(false);
  }

  async function onPhoto(f?: File | null) { if (!f) return; const b = await shrink(f); setPhoto(b); setPhotoUrl(URL.createObjectURL(b)); }

  async function save() {
    if (!item || !gps) return;
    const rec: FieldRecord = { key: item.key, name: item.name, category: item.category, campus: item.campus, lat: +gps.lat.toFixed(6), lng: +gps.lng.toFixed(6), acc: Math.round(gps.acc), note, ts: new Date().toISOString(), hasPhoto: !!photo, custom: st.records[item.key]?.custom };
    if (photo) await putPhoto(item.key, photo); else await delPhoto(item.key).catch(() => {});
    setSt((s) => ({ ...s, records: { ...s.records, [item.key]: rec } }));
    setMsg("Saved ✔"); setSel(null);
  }

  function addCustom() {
    const name = custom.name.trim(); if (!name) return;
    const key = slug(name);
    setSt((s) => ({ ...s, records: { ...s.records, [key]: { key, name, category: custom.category, campus: custom.campus, lat: 0, lng: 0, acc: 0, note: "", ts: "", hasPhoto: false, custom: true } } }));
    setCustom({ ...custom, name: "" }); setSel(key);
  }
  // custom items with no GPS yet are placeholders (lat/lng 0) — don't count or export them
  const real = Object.values(st.records).filter((r) => r.lat !== 0 || r.lng !== 0);

  function startRec() {
    if (!pf.from || !pf.to) { setMsg("Pick where the path starts and ends first"); return; }
    setMsg(""); setRec({ pts: [], meters: 0, acc: 0 });
    watch.current = navigator.geolocation.watchPosition((p) => {
      if (p.coords.accuracy > 25) return;
      const pt: [number, number] = [+p.coords.longitude.toFixed(6), +p.coords.latitude.toFixed(6)];
      setRec((r) => { if (!r) return r; const last = r.pts.at(-1); if (last && metersBetween(last, pt) < 3) return { ...r, acc: p.coords.accuracy }; return { pts: [...r.pts, pt], meters: r.meters + (last ? metersBetween(last, pt) : 0), acc: p.coords.accuracy }; });
    }, (e) => setMsg(e.message), { enableHighAccuracy: true, maximumAge: 0 });
  }
  function stopRec() {
    if (watch.current !== null) navigator.geolocation.clearWatch(watch.current); watch.current = null;
    if (rec && rec.pts.length >= 2) setSt((s) => ({ ...s, tracks: [...s.tracks, { id: String(Date.now()), ...pf, label: pf.label || "Route", points: rec.pts, ts: new Date().toISOString(), meters: Math.round(rec.meters) } as FieldTrack] }));
    else setMsg("Path too short — walk a bit further before stopping.");
    setRec(null);
  }

  const placesCsv = () => ["name,category,lat,lng,description,photo_filename,campus,accuracy_m,collector,collected_at",
    ...real.map((r) => [r.name, r.category, r.lat, r.lng, r.note, r.hasPhoto ? `${r.key}.jpg` : "", r.campus, r.acc, st.collector, r.ts].map(csvCell).join(","))].join("\n") + "\n";
  const tracksKml = () => `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document>\n` + st.tracks.map((t) =>
    `<Placemark><name>${`${t.from} > ${t.to} | ${t.label} | ${t.kind}`.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</name><LineString><coordinates>${t.points.map((p) => `${p[0]},${p[1]},0`).join(" ")}</coordinates></LineString></Placemark>`).join("\n") + `\n</Document></kml>\n`;

  async function shareAll() {
    const files = [new File([placesCsv()], "places.csv", { type: "text/csv" })];
    for (const r of real.filter((r) => r.hasPhoto)) { const b = await getPhoto(r.key); if (b) files.push(new File([b], `${r.key}.jpg`, { type: "image/jpeg" })); }
    if (st.tracks.length) files.push(new File([tracksKml()], "footpaths.kml", { type: "application/vnd.google-earth.kml+xml" }));
    const nav = navigator as any;
    if (nav.canShare?.({ files })) { try { await nav.share({ files, title: "Unilorin field data" }); } catch { /* cancelled */ } }
    else setMsg("Sharing files isn't supported here — use the download buttons instead.");
  }
  async function downloadPhotos() { for (const r of real.filter((r) => r.hasPhoto)) { const b = await getPhoto(r.key); if (b) { download(`${r.key}.jpg`, b); await new Promise((x) => setTimeout(x, 400)); } } }
  async function wipe() { if (!confirm("Delete ALL data collected on this phone? Export first!")) return; await clearPhotos(); setSt((s) => ({ ...s, records: {}, tracks: [] })); }

  const pinOpts = (pois as any[]).map((p) => <option key={p.id} value={p.id}>{p.name}</option>);

  return (
    <main className="fc">
      <h1>Field collector</h1>
      <p className="fc-sub">Works offline. Stand at the entrance → <b>Use my GPS</b> → photo → <b>Save</b>. Data stays on this phone until you export.</p>
      <input className="fc-in" placeholder="Your name (so we know who collected it)" value={st.collector} onChange={(e) => setSt({ ...st, collector: e.target.value })} />
      <div className="fc-tabs">
        {(["places", "paths", "export"] as const).map((t) => <button key={t} className={tab === t ? "on" : ""} onClick={() => { setTab(t); setSel(null); setMsg(""); }}>{t === "places" ? `Places (${done - (Object.values(st.records).length - real.length)})` : t === "paths" ? `Footpaths (${st.tracks.length})` : "Export"}</button>)}
      </div>
      {msg && <p className="fc-msg" role="status">{msg}</p>}

      {tab === "places" && !item && (<>
        <input className="fc-in" placeholder="Search the checklist…" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <div className="fc-tabs sm">{(["todo", "done", "all"] as const).map((s) => <button key={s} className={show === s ? "on" : ""} onClick={() => setShow(s)}>{s}</button>)}</div>
        <ul className="fc-list">{shown.map((i) => { const r = st.records[i.key]; return (
          <li key={i.key}><button onClick={() => pickItem(i)}><b>{r && (r.lat || r.lng) ? "✅ " : ""}{i.name}</b><span>{i.category} · {i.campus}{i.recheck ? " · re-check existing pin" : ""}</span></button></li>); })}</ul>
        <details><summary>＋ Add a place that isn't on the list</summary>
          <input className="fc-in" placeholder="Name" value={custom.name} onChange={(e) => setCustom({ ...custom, name: e.target.value })} />
          <select className="fc-in" value={custom.category} onChange={(e) => setCustom({ ...custom, category: e.target.value })}>{CATS.map((c) => <option key={c}>{c}</option>)}</select>
          <select className="fc-in" value={custom.campus} onChange={(e) => setCustom({ ...custom, campus: e.target.value })}><option value="main">main campus</option><option value="mini">mini campus</option><option value="uith">UITH / colleges</option></select>
          <button className="fc-btn" onClick={addCustom}>Add and open</button></details>
      </>)}

      {tab === "places" && item && (<section className="fc-card">
        <button className="fc-link" onClick={() => setSel(null)}>← back to list</button>
        <h2>{item.name}</h2><p className="fc-sub">{item.category} · {item.campus}{item.hint ? ` — ${item.hint}` : ""}</p>
        <button className="fc-btn" disabled={busy} onClick={useGps}>📍 Use my GPS</button>
        {gps && <p>Lat {gps.lat.toFixed(6)}, Lng {gps.lng.toFixed(6)} (±{Math.round(gps.acc)} m)
          {item.current && <><br />Current pin is {Math.round(metersBetween([gps.lng, gps.lat], [item.current.lng, item.current.lat]))} m from here</>}</p>}
        <label className="fc-btn alt">📷 {photo ? "Retake photo" : "Take photo of the entrance"}<input type="file" accept="image/*" capture="environment" hidden onChange={(e) => onPhoto(e.target.files?.[0])} /></label>
        {photoUrl && <img className="fc-photo" src={photoUrl} alt="" />}
        <textarea className="fc-in" rows={2} placeholder="Notes (e.g. 'opposite the library, blue gate')" value={note} onChange={(e) => setNote(e.target.value)} />
        <button className="fc-btn go" disabled={!gps} onClick={save}>Save</button>
      </section>)}

      {tab === "paths" && (<section className="fc-card">
        <p className="fc-sub">Walk a footpath or the route to a place while recording. Start at the "from" place, press Start, walk, press Stop at the "to" place.</p>
        <select className="fc-in" value={pf.from} onChange={(e) => setPf({ ...pf, from: e.target.value })}><option value="">From…</option>{pinOpts}</select>
        <select className="fc-in" value={pf.to} onChange={(e) => setPf({ ...pf, to: e.target.value })}><option value="">To…</option>{pinOpts}</select>
        <input className="fc-in" placeholder="Label, e.g. Shortcut via Sciences" value={pf.label} onChange={(e) => setPf({ ...pf, label: e.target.value })} />
        <select className="fc-in" value={pf.kind} onChange={(e) => setPf({ ...pf, kind: e.target.value })}><option value="shortcut">shortcut</option><option value="main">main road</option><option value="shaded">shaded</option></select>
        {!rec ? <button className="fc-btn go" onClick={startRec}>▶ Start recording</button> : <><p>Recording… {rec.pts.length} points · {Math.round(rec.meters)} m · GPS ±{Math.round(rec.acc)} m</p><button className="fc-btn stop" onClick={stopRec}>■ Stop and save</button></>}
        <ul className="fc-list">{st.tracks.map((t) => <li key={t.id}><span>{t.from} → {t.to} · {t.label} · {t.meters} m <button className="fc-link" onClick={() => setSt({ ...st, tracks: st.tracks.filter((x) => x.id !== t.id) })}>delete</button></span></li>)}</ul>
        <p className="fc-sub">Only pins already in the app can be start/end points — add new places first and re-run later.</p>
      </section>)}

      {tab === "export" && (<section className="fc-card">
        <p>{real.length} places · {real.filter((r) => r.hasPhoto).length} photos · {st.tracks.length} footpaths</p>
        <button className="fc-btn go" onClick={shareAll} disabled={!real.length && !st.tracks.length}>📤 Share all (WhatsApp, etc.)</button>
        <button className="fc-btn" onClick={() => download("places.csv", placesCsv(), "text/csv")} disabled={!real.length}>Download places.csv</button>
        <button className="fc-btn" onClick={downloadPhotos} disabled={!real.some((r) => r.hasPhoto)}>Download photos</button>
        <button className="fc-btn" onClick={() => download("footpaths.kml", tracksKml(), "application/vnd.google-earth.kml+xml")} disabled={!st.tracks.length}>Download footpaths.kml</button>
        <p className="fc-sub">Send these to the developer: <code>npm run sheet-to-pois -- places.csv</code> then <code>npm run kml-to-routes -- footpaths.kml</code>. Put the photos in <code>public/photos/</code>.</p>
        <button className="fc-btn stop" onClick={wipe}>Delete everything on this phone</button>
      </section>)}
    </main>
  );
}
