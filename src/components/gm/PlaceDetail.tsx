"use client";
import { type Poi } from "@/lib/pois";
import { CAT, Icon } from "./icons";

interface Props {
  poi: Poi;
  pois: Poi[];
  campusLabel: string;
  showTravel: boolean;
  onDirections: () => void;
  onTravel: () => void;
  onShare: () => void;
  onCopyCoords: () => void;
  onChoosePin: (p: Poi) => void;
}

export default function PlaceDetail({ poi: sel, pois, campusLabel, showTravel, onDirections, onTravel, onShare, onCopyCoords, onChoosePin }: Props) {
  return (
    <div className="gm-pad">
      <h2 className="gm-title">{sel.name}</h2>
      <p className="gm-sub">{CAT[sel.category]?.noun} · {campusLabel}</p>
      {sel.verified === false && <p className="gm-warn">Location not verified on the ground yet</p>}
      <div className="gm-actions">
        {showTravel
          ? <button className="gm-btn fill" onClick={onTravel}><Icon name="taxi" size={20} color="#fff" />How to get here</button>
          : <button className="gm-btn fill" onClick={onDirections}><Icon name="directions" size={20} color="#fff" />Directions</button>}
        <button className="gm-btn" onClick={onShare}><Icon name="share" size={20} />Share</button>
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
                <button key={p.id} className="gm-block-sibling" onClick={() => onChoosePin(p)}>
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
      <button className="gm-info click" onClick={onCopyCoords}><Icon name="place" size={22} color="#1a73e8" /><span>{sel.lat.toFixed(6)}, {sel.lng.toFixed(6)}</span><Icon name="copy" size={18} color="#5f6368" /></button>
      <div className="gm-info"><Icon name="verified" size={22} color={sel.verified === false ? "#9aa0a6" : "#188038"} /><span>{sel.verified === false ? "Not yet confirmed, position from OpenStreetMap" : "Confirmed on the ground"}</span></div>
      {(sel.campus === "uith" || sel.campus === "cohs") && <button className="gm-info click" onClick={onTravel}><Icon name="taxi" size={22} color="#1a73e8" /><span>Coming from the Main Campus? How to get here</span></button>}
    </div>
  );
}
