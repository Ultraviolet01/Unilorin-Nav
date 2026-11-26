"use client";
import { useEffect, useRef, useState } from "react";

type Tab = "main" | "cohs" | "uith";
type Step = "splash" | "w1" | "w2" | "w3" | "location" | "campus";
const STEPS: Step[] = ["splash", "w1", "w2", "w3", "location", "campus"];

// ---- illustrations ----
function SplashIllustration() {
  return (
    <div className="ob-splash-mark">
      {/* navigation arrow icon — matches Figma S01 */}
      <svg width="64" height="64" viewBox="0 0 24 24" fill="#fff"><path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71L12 2z"/></svg>
    </div>
  );
}

function MapIllustration({ variant }: { variant: "pins" | "offline" | "route" }) {
  return (
    <div className="ob-map-wrap">
      <div className="ob-map-bg">
        <div className="ob-road h" style={{ top: "38%" }} />
        <div className="ob-road h" style={{ top: "65%" }} />
        <div className="ob-road v" style={{ left: "32%" }} />
        <div className="ob-block" style={{ left: "14%", top: "12%", width: 72, height: 60 }} />
        <div className="ob-block" style={{ left: "44%", top: "10%", width: 100, height: 68 }} />
        <div className="ob-block" style={{ left: "14%", top: "52%", width: 68, height: 72 }} />
        <div className="ob-block" style={{ left: "44%", top: "50%", width: 78, height: 64 }} />
        <div className="ob-block" style={{ left: "72%", top: "52%", width: 64, height: 68 }} />
        {variant === "pins" && (<>
          <div className="ob-pin red" style={{ left: "21%", top: "9%" }}><svg width="22" height="22" viewBox="0 0 24 24" fill="#EA4335"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/></svg></div>
          <div className="ob-pin blue" style={{ left: "54%", top: "43%" }}><svg width="22" height="22" viewBox="0 0 24 24" fill="#1A73E8"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/></svg></div>
          <div className="ob-pin gold" style={{ left: "78%", top: "50%" }}><svg width="22" height="22" viewBox="0 0 24 24" fill="#F9AB00"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/></svg></div>
          <div className="ob-pin green" style={{ left: "15%", top: "52%" }}><svg width="22" height="22" viewBox="0 0 24 24" fill="#188038"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/></svg></div>
        </>)}
        {variant === "offline" && (<>
          <div className="ob-badge offline"><svg width="16" height="16" viewBox="0 0 24 24" fill="#188038"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>Offline ready</div>
          <div className="ob-badge download" style={{ bottom: 16, left: "50%", transform: "translateX(-50%)" }}><svg width="14" height="14" viewBox="0 0 24 24" fill="#1A73E8"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>Map saved · 18 MB</div>
        </>)}
        {variant === "route" && (<>
          <div className="ob-route-line" />
          <div className="ob-route-start" />
          <div className="ob-route-end"><svg width="16" height="16" viewBox="0 0 24 24" fill="#fff"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/></svg></div>
          <div className="ob-shortcut-tag">Shortcut · saves 4 min</div>
        </>)}
      </div>
    </div>
  );
}

function LocationIllustration() {
  return (
    <div className="ob-loc-wrap">
      <div className="ob-loc-ring outer" />
      <div className="ob-loc-ring inner" />
      <div className="ob-loc-circle">
        <svg width="52" height="52" viewBox="0 0 24 24" fill="#fff"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
      </div>
    </div>
  );
}

const FACULTY = [
  { label: "AGR", color: "#188038", bg: "#E8F5E9" },
  { label: "ENG", color: "#1A73E8", bg: "#E8F0FE" },
  { label: "LAW", color: "#7B1FA2", bg: "#F3E5F5" },
  { label: "MGT", color: "#D93025", bg: "#FCE8E6" },
  { label: "SCI", color: "#0D652D", bg: "#E6F4EA" },
];

const CAMPUSES = [
  { id: "main" as Tab, name: "Main Campus", location: "Tanke · University Road", count: "101 places", color: "#1A73E8" },
  { id: "cohs" as Tab, name: "COHS — College of Health Sciences", location: "New College · Old College", count: "19 places", color: "#188038" },
  { id: "uith" as Tab, name: "UITH — Teaching Hospital", location: "University of Ilorin Teaching Hospital", count: "14 places", color: "#D93025" },
];

function PageDots({ total, active }: { total: number; active: number }) {
  return (
    <div className="ob-dots">
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} className={`ob-dot ${i === active ? "on" : ""}`} />
      ))}
    </div>
  );
}

type ScreenAnim = "enter" | "exit" | "fade-enter" | "fade-exit";

export default function Onboarding({ onDone }: { onDone: (tab: Tab) => void }) {
  const [step, setStep] = useState<Step>("splash");
  const [anim, setAnim] = useState<ScreenAnim>("fade-enter");
  const [mounted, setMounted] = useState(false);
  const splashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const busy = useRef(false);

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 40);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (step === "splash") {
      splashTimer.current = setTimeout(() => advance(true), 2200);
      return () => { if (splashTimer.current) clearTimeout(splashTimer.current); };
    }
  }, [step]);

  function transition(nextStep: Step, fromSplash = false) {
    if (busy.current) return;
    busy.current = true;
    const exitAnim: ScreenAnim = fromSplash ? "fade-exit" : "exit";
    setAnim(exitAnim);
    setTimeout(() => {
      setStep(nextStep);
      setAnim(fromSplash ? "fade-enter" : "enter");
      setTimeout(() => { busy.current = false; }, 380);
    }, fromSplash ? 300 : 240);
  }

  function advance(fromSplash = false) {
    const idx = STEPS.indexOf(step);
    if (idx < STEPS.length - 1) transition(STEPS[idx + 1], fromSplash);
  }

  function skip() {
    transition("campus");
  }

  function finish(tab: Tab) {
    busy.current = true;
    setAnim("fade-exit");
    setMounted(false);
    setTimeout(() => onDone(tab), 320);
  }

  function requestLocation() {
    if (typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(() => {}, () => {});
    }
    advance();
  }

  const welcomeIdx = step === "w1" ? 0 : step === "w2" ? 1 : step === "w3" ? 2 : 0;

  return (
    <div className={`ob-wrap ${mounted ? "in" : ""}`} role="dialog" aria-modal="true">

      {/* ---- S01 Splash ---- */}
      {step === "splash" && (
        <div className={`ob-screen splash ob-anim-${anim}`}>
          <div className="ob-splash-body">
            <SplashIllustration />
            <h1 className="ob-app-name">Navigate<br />Unilorin</h1>
            <p className="ob-app-tag">Find any building on campus</p>
            <div className="ob-splash-bar">
              <div className="ob-splash-fill" />
            </div>
          </div>
        </div>
      )}

      {/* ---- S02-S04 Welcome slides ---- */}
      {(step === "w1" || step === "w2" || step === "w3") && (
        <div className={`ob-screen welcome ob-anim-${anim}`}>
          <div className="ob-map-area">
            {step === "w1" && <MapIllustration variant="pins" />}
            {step === "w2" && <MapIllustration variant="offline" />}
            {step === "w3" && (<>
              <MapIllustration variant="route" />
              <div className="ob-faculty-row">
                {FACULTY.map((f) => (
                  <div key={f.label} className="ob-faculty" style={{ background: f.bg, color: f.color }}>{f.label}</div>
                ))}
              </div>
            </>)}
          </div>
          <div className="ob-sheet">
            <PageDots total={3} active={welcomeIdx} />
            {step === "w1" && (<>
              <h2 className="ob-sh-title">Find any building</h2>
              <p className="ob-sh-sub">Search faculties, hostels, labs and more. Every place on the Unilorin main campus, mapped and ready.</p>
            </>)}
            {step === "w2" && (<>
              <h2 className="ob-sh-title">Load it once and it works anywhere on campus</h2>
              <p className="ob-sh-sub">No data? No signal in a basement lab? The map stays with you. Download once and navigate fully offline.</p>
            </>)}
            {step === "w3" && (<>
              <h2 className="ob-sh-title">Smart shortcuts, faculty colours</h2>
              <p className="ob-sh-sub">Get the fastest footpath between lecture halls, and spot every faculty by its colour code at a glance.</p>
            </>)}
            {step !== "w3"
              ? (<>
                  <button className="ob-btn primary" onClick={() => advance()}>Next</button>
                  <button className="ob-btn ghost" onClick={skip}>Skip</button>
                </>)
              : <button className="ob-btn primary" onClick={() => advance()}>Get started</button>}
          </div>
        </div>
      )}

      {/* ---- S05 Location permission ---- */}
      {step === "location" && (
        <div className={`ob-screen location ob-anim-${anim}`}>
          <LocationIllustration />
          <div className="ob-loc-text">
            <h2 className="ob-sh-title">Show me on the map</h2>
            <p className="ob-sh-sub">Allow location so the blue dot can follow you across campus and give turn-by-turn walking directions.</p>
          </div>
          <div className="ob-loc-actions">
            <button className="ob-btn primary" onClick={requestLocation}>Allow location</button>
            <button className="ob-btn ghost" onClick={() => advance()}>Not now</button>
            <p className="ob-fine-note">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/></svg>
              The map works without it.
            </p>
          </div>
        </div>
      )}

      {/* ---- S06 Campus picker ---- */}
      {step === "campus" && (
        <div className={`ob-screen campus ob-anim-${anim}`}>
          <div className="ob-campus-header">
            <h2 className="ob-sh-title" style={{ fontSize: 26 }}>Where are you headed?</h2>
            <p className="ob-sh-sub">Pick a campus to load. You can switch anytime.</p>
          </div>
          <div className="ob-campus-cards">
            {CAMPUSES.map((c) => (
              <button key={c.id} className="ob-campus-card" onClick={() => finish(c.id)}>
                <div className="ob-campus-thumb">
                  <img src={`/photos/${c.id}.jpg`} alt={c.name} className="ob-campus-photo" />
                </div>
                <div className="ob-campus-info">
                  <span className="ob-campus-name">{c.name}</span>
                  <span className="ob-campus-loc">{c.location}</span>
                  <span className="ob-campus-count" style={{ color: c.color, background: c.color + "15" }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill={c.color}><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/></svg>
                    {c.count}
                  </span>
                </div>
                <svg className="ob-chevron" width="20" height="20" viewBox="0 0 24 24" fill="#9AA0A6"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
