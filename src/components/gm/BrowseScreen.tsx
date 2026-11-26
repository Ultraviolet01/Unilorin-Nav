"use client";
import { type Category, type Poi } from "@/lib/pois";
import { CAT, CHIP_ORDER, Icon } from "./icons";
import { tap } from "./haptics";

interface Props {
  pois: Poi[];
  campusLabel: string;
  onPickCategory: (c: Category) => void;
}

export default function BrowseScreen({ pois, campusLabel, onPickCategory }: Props) {
  return (
    <div className="gm-screen">
      <div className="gm-screen-head"><h2>Browse</h2><p>{campusLabel}</p></div>
      {pois.length === 0
        ? <div style={{ padding: "48px 24px", textAlign: "center", color: "var(--sub)", fontSize: 15, lineHeight: 1.5 }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor" style={{ opacity: .3, display: "block", margin: "0 auto 16px" }}><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
            No places mapped for {campusLabel} yet.
          </div>
        : <div className="gm-browse-grid">
            {CHIP_ORDER.filter((c) => pois.some((p) => p.category === c)).map((c, i) => {
              const count = pois.filter((p) => p.category === c).length;
              return (
                <button key={c} className="gm-browse-card" style={{ animationDelay: `${i * 40}ms` } as React.CSSProperties}
                  onClick={() => { onPickCategory(c); tap(); }}>
                  <div className="gm-browse-icon" style={{ background: CAT[c].color + "22" }}>
                    <Icon name={CAT[c].icon} size={24} color={CAT[c].color} />
                  </div>
                  <span className="gm-browse-name">{CAT[c].label}</span>
                  <span className="gm-browse-count">{count} place{count !== 1 ? "s" : ""}</span>
                </button>);
            })}
          </div>}
    </div>
  );
}
