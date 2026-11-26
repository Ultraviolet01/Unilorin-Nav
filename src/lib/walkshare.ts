// Opt-in sharing of recorded walks. Nothing leaves the phone unless the person chose "Share my walks".
// What is sent: the GPS points of one walk (minus its first 40 m), its time, length, kind (footpath/road) and the destination's id, plus a random code made on this phone.
// No name, phone number, email or device identifier is ever included.
import { loadState, metersBetween, saveState, type FieldTrack } from "./fieldstore";

export type Sharing = "upload" | "local" | null;

// Walk recording and sharing. Set to false to switch the whole feature off.
export const WALK_TRACKING = true;
// The team's Field collector page links; kept hidden from the public menus.
export const FIELD_COLLECTOR_LINKS = true;
const CONSENT = "unilorin-walk-sharing-v1", OWNER = "unilorin-walk-owner-v1";
const API = process.env.NEXT_PUBLIC_API_URL;
// Sharing is OFF unless the build says NEXT_PUBLIC_WALK_SHARING=on (set in Amplify only after the privacy review in docs/PRIVACY.md).
// While off: walks are only kept on the phone, no consent pop-up is offered and nothing is sent. Deleting earlier shares still works.
export const CAN_UPLOAD = !!API && process.env.NEXT_PUBLIC_WALK_SHARING === "on";

export function getSharing(): Sharing {
  try { const s = JSON.parse(localStorage.getItem(CONSENT) ?? "null"); if (s?.v === 1 && (s.choice === "upload" || s.choice === "local")) return s.choice; } catch { /* none yet */ }
  return null;
}
export function setSharing(choice: "upload" | "local") {
  try { localStorage.setItem(CONSENT, JSON.stringify({ v: 1, choice, ts: new Date().toISOString() })); } catch { /* storage blocked */ }
}
const ownerId = (create: boolean): string | null => {
  try {
    let o = localStorage.getItem(OWNER);
    if (!o && create) { o = crypto.randomUUID(); localStorage.setItem(OWNER, o); }
    return o;
  } catch { return null; }
};

async function post(path: string, body: unknown): Promise<Response> {
  return fetch(`${API}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

/** The start of a walk can be a hostel or a home, so the first 40 m are never shared. */
export const TRIM_START_M = 40;
export function trimStart(points: [number, number][], m = TRIM_START_M): [number, number][] {
  if (!points.length) return points;
  const a = points[0]; let i = 0;
  while (i < points.length && metersBetween(a, points[i]) < m) i++;
  return points.slice(i);
}

/** Sends every recorded walk not yet shared. Returns how many were sent. Safe to call any time; does nothing without consent. */
export async function flushWalks(): Promise<number> {
  if (!WALK_TRACKING) return 0;
  if (!CAN_UPLOAD || getSharing() !== "upload") return 0;
  const owner = ownerId(true); if (!owner) return 0;
  const st = loadState(), todo = st.tracks.filter((t) => t.from === "walk" && !t.uploaded);
  let sent = 0;
  for (const t of todo) {
    const points = trimStart(t.points);
    if (points.length < 5) { t.uploaded = true; continue; } // too little left after trimming to be useful: keep it on the phone only
    const meters = Math.round(points.slice(1).reduce((n, c, i) => n + metersBetween(points[i], c), 0));
    try {
      const r = await post("/walks", { owner, id: t.id, kind: t.kind, label: t.label, dest: t.to, meters, ts: t.ts, points });
      if (r.ok || r.status === 400 || r.status === 413) { t.uploaded = true; if (r.ok) sent++; } // 400/413 will never succeed: don't retry forever
    } catch { break; } // offline: try again later
  }
  if (todo.length) saveState(st);
  return sent;
}

/** Stops sharing and asks the server to delete everything this phone ever shared. */
export async function forgetWalks(): Promise<boolean> {
  const owner = ownerId(false);
  try {
    if (owner && API) { const r = await post("/walks/forget", { owner }); if (!r.ok) return false; }
    try { localStorage.removeItem(OWNER); } catch { /* ignore */ }
    const st = loadState(); st.tracks.forEach((t: FieldTrack) => { if (t.from === "walk") delete t.uploaded; }); saveState(st);
    setSharing("local");
    return true;
  } catch { return false; }
}
