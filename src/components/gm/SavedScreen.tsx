"use client";
import { type Poi } from "@/lib/pois";
import { CAT, Icon } from "./icons";
import { CAMPUS, campusTab } from "./campus";
import { tap } from "./haptics";

interface Props {
  recents: string[];
  pois: Poi[];
  onChoose: (p: Poi) => void;
}

export default function SavedScreen({ recents, pois, onChoose }: Props) {
  return (
    <div className="gm-screen">
      <div className="gm-screen-head"><h2>Saved</h2><p>Your recent places</p></div>
      {recents.length === 0
        ? <div style={{ padding: "32px 16px", textAlign: "center", color: "var(--sub)", fontSize: 14 }}>No saved places yet. Tap a pin on the map to explore places.</div>
        : recents.map((id) => pois.find((p) => p.id === id)).filter((p): p is Poi => !!p).map((p) => (
            <button key={p.id} className="gm-row" onClick={() => { onChoose(p); tap(); }}>
              <span className="gm-ico"><Icon name={CAT[p.category]?.icon ?? "place"} size={20} color={CAT[p.category]?.color} /></span>
              <span><div className="gm-rt">{p.name}</div><div className="gm-rs">{CAT[p.category]?.noun ?? ""} · {CAMPUS[campusTab(p.campus)].label}</div></span>
            </button>))}
    </div>
  );
}
