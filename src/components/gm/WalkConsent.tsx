"use client";
import { type Sharing } from "@/lib/walkshare";

interface Props {
  sharing: Sharing;
  busy: boolean;
  confirmDel: boolean;
  CAN_UPLOAD: boolean;
  onChooseSharing: (c: "upload" | "local") => void;
  onStopDelete: () => void;
  onSetConfirmDel: (v: boolean) => void;
  onClose: () => void;
}

export default function WalkConsent({ sharing, busy, confirmDel, CAN_UPLOAD, onChooseSharing, onStopDelete, onSetConfirmDel, onClose }: Props) {
  return (
    <div className="gm-scrim2" onClick={onClose}>
      <div className="gm-dialog" role="dialog" aria-modal="true" aria-labelledby="walk-consent-title" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}>
        <h2 id="walk-consent-title">Help improve the Unilorin map</h2>
        <p>When you use <b>Start</b>, the app can save the path your phone follows. The team uses real walks to add paths that are missing from the map.</p>
        <div className="gm-dl"><b>What is saved</b><ul><li>The GPS points of that walk, the time, and where you were going.</li><li>A random code made on your phone. <u>Not</u> your name, number or email.</li><li>The first 40 m of each walk is cut off, so where you started is not shared.</li></ul></div>
        <div className="gm-dl"><b>What is not</b><ul><li>Nothing is saved or sent when you are not using Start.</li><li>We do not ask for your name, number or email, and we do not contact you.</li></ul></div>
        <div className="gm-dl"><b>Your control</b><ul><li>Only the map team can see shared walks. They are deleted automatically after 12 months.</li><li>You can stop and delete everything you shared, from this same screen.</li></ul></div>
        {confirmDel ? (
          <div className="gm-dact">
            <p className="gm-dwarn">Delete every walk you have shared and stop sharing?</p>
            <button className="gm-dbtn danger" disabled={busy} onClick={onStopDelete}>{busy ? "Deleting…" : "Yes, delete and stop"}</button>
            <button className="gm-dbtn ghost" disabled={busy} onClick={() => onSetConfirmDel(false)}>Cancel</button>
          </div>
        ) : (
          <div className="gm-dact">
            {sharing !== "upload" && <button className="gm-dbtn primary" autoFocus onClick={() => onChooseSharing("upload")}>Share my walks</button>}
            {sharing === "upload" && CAN_UPLOAD && <button className="gm-dbtn primary" autoFocus onClick={onClose}>Keep sharing</button>}
            {sharing !== "local" && sharing !== "upload" && <button className="gm-dbtn secondary" onClick={() => onChooseSharing("local")}>Keep on my phone only</button>}
            {sharing === "upload" && <button className="gm-dbtn danger" onClick={() => onSetConfirmDel(true)}>Stop sharing and delete my walks</button>}
            {sharing === "local" && CAN_UPLOAD && <button className="gm-dbtn secondary" onClick={() => onChooseSharing("upload")}>Share my walks</button>}
            {sharing === null && <button className="gm-dbtn ghost" onClick={onClose}>Not now</button>}
            {sharing !== null && (sharing !== "upload" || !CAN_UPLOAD) && <button className="gm-dbtn ghost" onClick={onClose}>Close</button>}
          </div>
        )}
      </div>
    </div>
  );
}
