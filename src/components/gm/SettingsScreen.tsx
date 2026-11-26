"use client";
import { type Base } from "@/lib/mapStyle";
import { Icon } from "./icons";
import { CAMPUS, type Tab } from "./campus";
import { tap } from "./haptics";

interface Props {
  base: Base;
  bases: [Base, string, string][];
  tab: Tab;
  onSetBase: (b: Base) => void;
  onSwitchCampus: (t: Tab) => void;
  onTravel: () => void;
}

export default function SettingsScreen({ base, bases, tab, onSetBase, onSwitchCampus, onTravel }: Props) {
  return (
    <div className="gm-screen">
      <div className="gm-screen-head"><h2>Settings</h2><p>Map style and options</p></div>
      <div className="gm-screen-head" style={{ paddingTop: 4 }}><p style={{ fontWeight: 500, color: "var(--text)" }}>Map style</p></div>
      <div className="gm-settings-layers">
        {bases.map(([b, l]) => (
          <button key={b} className={`gm-settings-layer ${base === b ? "on" : ""}`} onClick={() => { onSetBase(b); tap(); }}>
            <span className={`gm-swatch ${b}`} style={{ width: 52, height: 52, borderRadius: 8, display: "block" }} />
            {l}
          </button>))}
      </div>
      <hr className="gm-settings-hr" />
      <div className="gm-screen-head" style={{ paddingTop: 4 }}><p style={{ fontWeight: 500, color: "var(--text)" }}>Campus</p></div>
      {(Object.keys(CAMPUS) as Tab[]).map((t) => (
        <button key={t} className="gm-row" onClick={() => { onSwitchCampus(t); tap(); }}>
          <span className="gm-ico"><Icon name={t === "uith" ? "hospital" : "school"} size={20} /></span>
          <span><div className="gm-rt">{CAMPUS[t].label}</div><div className="gm-rs">{tab === t ? "Currently shown" : "Tap to switch"}</div></span>
        </button>))}
      <hr className="gm-settings-hr" />
      <button className="gm-row" onClick={() => { onTravel(); tap(); }}>
        <span className="gm-ico"><Icon name="taxi" size={20} color="#1a73e8" /></span>
        <span><div className="gm-rt">Getting to COHS &amp; UITH</div><div className="gm-rs">Cab and motor park advice</div></span>
      </button>
      <a className="gm-row" href="/field/" style={{ display: "flex", alignItems: "center", gap: 0, textDecoration: "none", color: "inherit" }}>
        <span className="gm-ico"><Icon name="photo" size={20} /></span>
        <span><div className="gm-rt">Field collector</div><div className="gm-rs">Map team only</div></span>
      </a>
      <p className="gm-fine" style={{ padding: "16px 16px 32px" }}>Map data &copy; OpenStreetMap contributors. Icons: Material Icons (Apache-2.0).</p>
    </div>
  );
}
