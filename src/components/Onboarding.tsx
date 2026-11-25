"use client";
import { useEffect, useState } from "react";
import { Icon } from "./gm/icons";

type Tab = "main" | "cohs" | "uith";

const CAMPUSES: { id: Tab; name: string; short: string; location: string; count: string; color: string; icon: string }[] = [
  { id: "main", name: "Main Campus", short: "Main Campus", location: "Tanke · University Road", count: "120+ places", color: "#1A73E8", icon: "school" },
  { id: "cohs", name: "COHS — College of Health Sciences", short: "COHS", location: "New College · Old College", count: "64 places", color: "#188038", icon: "school" },
  { id: "uith", name: "UITH — Teaching Hospital", short: "UITH", location: "University of Ilorin Teaching Hospital", count: "12 places", color: "#D93025", icon: "hospital" },
];

function CampusThumb({ id, color }: { id: Tab; color: string }) {
  return (
    <div className="ob-thumb" style={{ background: color + "18" }}>
      <svg width="40" height="40" viewBox="0 0 24 24" fill={color}>
        {id === "uith"
          ? <path d="M19 3H5c-1.1 0-1.99.9-1.99 2L3 19c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-1 11h-4v4h-4v-4H6v-4h4V6h4v4h4v4z"/>
          : <path d="M5 13.18v4L12 21l7-3.82v-4L12 17l-7-3.82zM12 3L1 9l11 6 9-4.91V17h2V9L12 3z"/>}
      </svg>
    </div>
  );
}

export default function Onboarding({ onDone }: { onDone: (tab: Tab) => void }) {
  const [visible, setVisible] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 60);
    return () => clearTimeout(t);
  }, []);

  function choose(tab: Tab) {
    setLeaving(true);
    setTimeout(() => onDone(tab), 320);
  }

  return (
    <div className={`ob-wrap ${visible ? "in" : ""} ${leaving ? "out" : ""}`} role="dialog" aria-modal="true" aria-label="Choose your campus">
      <div className="ob-inner">
        <div className="ob-header">
          <h1 className="ob-title">Where are you headed?</h1>
          <p className="ob-sub">Pick a campus to load. You can switch anytime.</p>
        </div>

        <div className="ob-cards">
          {CAMPUSES.map((c) => (
            <button key={c.id} className="ob-card" onClick={() => choose(c.id)}>
              <CampusThumb id={c.id} color={c.color} />
              <div className="ob-info">
                <span className="ob-name">{c.name}</span>
                <span className="ob-loc">{c.location}</span>
                <span className="ob-count">
                  <Icon name="place" size={13} color={c.color} />
                  {c.count}
                </span>
              </div>
              <svg className="ob-chevron" width="20" height="20" viewBox="0 0 24 24" fill="#9AA0A6"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
