// Offline storage for the field collector: records/tracks in localStorage, photos in IndexedDB.
export interface FieldRecord { key: string; name: string; category: string; campus: string; lat: number; lng: number; acc: number; note: string; ts: string; hasPhoto: boolean; custom?: boolean }
export interface FieldTrack { id: string; from: string; to: string; label: string; kind: string; points: [number, number][]; ts: string; meters: number }
export interface FieldState { collector: string; records: Record<string, FieldRecord>; tracks: FieldTrack[] }

const LS = "unilorin-field-v1";
export const loadState = (): FieldState => {
  try { const s = JSON.parse(localStorage.getItem(LS) ?? ""); if (s && s.records) return s; } catch { /* first run or blocked */ }
  return { collector: "", records: {}, tracks: [] };
};
export const saveState = (s: FieldState) => { try { localStorage.setItem(LS, JSON.stringify(s)); } catch { /* storage full */ } };

const open = () => new Promise<IDBDatabase>((res, rej) => { const r = indexedDB.open("unilorin-field", 1); r.onupgradeneeded = () => r.result.createObjectStore("photos"); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const tx = async <T,>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>) => { const db = await open(); return new Promise<T>((res, rej) => { const t = db.transaction("photos", mode), r = f(t.objectStore("photos")); t.oncomplete = () => res(r.result); t.onerror = () => rej(t.error); }); };
export const putPhoto = (k: string, b: Blob) => tx("readwrite", (s) => s.put(b, k));
export const getPhoto = (k: string) => tx<Blob | undefined>("readonly", (s) => s.get(k));
export const delPhoto = (k: string) => tx("readwrite", (s) => s.delete(k));
export const clearPhotos = () => tx("readwrite", (s) => s.clear());

export async function shrink(file: File, max = 1280): Promise<Blob> {
  const bmp = await createImageBitmap(file), s = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas"); c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise((r) => c.toBlob((b) => r(b!), "image/jpeg", 0.75));
}

export const metersBetween = (a: [number, number], b: [number, number]) => {
  const r = (d: number) => (d * Math.PI) / 180, h = Math.sin(r(b[1] - a[1]) / 2) ** 2 + Math.cos(r(a[1])) * Math.cos(r(b[1])) * Math.sin(r(b[0] - a[0]) / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
};

/** Watches GPS for a few seconds and keeps the most accurate reading. */
export function bestFix(onUpdate: (acc: number) => void, ms = 10000): Promise<{ lat: number; lng: number; acc: number }> {
  return new Promise((res, rej) => {
    if (!navigator.geolocation) return rej(new Error("GPS not available on this device/browser"));
    let best: { lat: number; lng: number; acc: number } | null = null;
    const id = navigator.geolocation.watchPosition(
      (p) => { if (!best || p.coords.accuracy < best.acc) { best = { lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy }; onUpdate(best.acc); } },
      (e) => { navigator.geolocation.clearWatch(id); clearTimeout(t); rej(new Error(e.message || "Could not get GPS")); },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 });
    const t = setTimeout(() => { navigator.geolocation.clearWatch(id); best ? res(best) : rej(new Error("No GPS fix — go outside / enable location")); }, ms);
  });
}
