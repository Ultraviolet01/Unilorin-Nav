"use client";
import { type Base } from "@/lib/mapStyle";
import { Icon } from "./icons";
import { CAMPUS, type Tab } from "./campus";
import { Presence } from "./Presence";
import { FIELD_COLLECTOR_LINKS } from "@/lib/walkshare";

interface Props {
  open: boolean;
  tab: Tab;
  base: Base;
  bases: [Base, string, string][];
  onClose: () => void;
  onSwitchTab: (t: Tab) => void;
  onSetBase: (b: Base) => void;
  onTravel: () => void;
}

export default function Drawer({ open, tab, base, bases, onClose, onSwitchTab, onSetBase, onTravel }: Props) {
  return (
    <Presence open={open} ms={260}>{(closing) => (<>
      <div className={`gm-scrim ${closing ? "out" : ""}`} onClick={onClose} />
      <aside className={`gm-drawer ${closing ? "out" : ""}`} aria-label="Menu">
        <div className="gm-brand"><span className="gm-logo"><Icon name="place" size={22} color="#fff" /></span><div><b>Unilorin Navigator</b><br /><small>Find your way around campus</small></div></div>
        {(Object.keys(CAMPUS) as Tab[]).map((t) => <button key={t} className={`gm-item ${t === tab ? "on" : ""}`} onClick={() => { onClose(); onSwitchTab(t); }}><Icon name={t === "uith" ? "hospital" : "school"} size={22} />{CAMPUS[t].label}</button>)}
        <hr />
        {bases.map(([b, , l]) => <button key={b} className={`gm-item ${base === b ? "on" : ""}`} onClick={() => { onSetBase(b); onClose(); }}><Icon name="layers" size={22} />{l}</button>)}
        <button className="gm-item" onClick={onTravel}><Icon name="taxi" size={22} />Getting to COHS &amp; UITH</button>
        {FIELD_COLLECTOR_LINKS && <a className="gm-item" href="/field/"><Icon name="photo" size={22} />Field collector (team)</a>}
        <p className="gm-fine">Map data © OpenStreetMap contributors. Icons: Material Icons (Apache-2.0).</p>
      </aside></>)}</Presence>
  );
}
