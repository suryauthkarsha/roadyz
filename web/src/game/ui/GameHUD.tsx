import { useEffect, useState } from "react";
import { BadgeCheck, Flame, Gauge, Hand, Smartphone, Volume2, VolumeX, Zap } from "lucide-react";
import { POWERUP_INFO } from "../constants";
import { audio } from "../audio";
import { playerInput } from "../runtime";
import { useGameUI } from "../store";

/** Floating reward texts (combo tiers, milestones, safe bounces). */
function RewardPopups() {
  const ui = useGameUI();
  if (ui.popups.length === 0) return null;
  return (
    <div className="pointer-events-none absolute left-1/2 top-[30%] flex -translate-x-1/2 flex-col items-center gap-1.5">
      {ui.popups.map((p) => (
        <div
          key={p.id}
          className="roadyz-popup whitespace-nowrap text-2xl font-extrabold drop-shadow-[0_2px_10px_rgba(0,0,0,0.75)]"
          style={{ color: p.color, fontFamily: "'Baloo 2', system-ui, sans-serif" }}
        >
          {p.text}
        </div>
      ))}
    </div>
  );
}

/** Active combo chip with a draining window bar — keep collecting to keep it! */
function ComboChip() {
  const ui = useGameUI();
  if (ui.phase !== "playing" || ui.multiplier <= 1) return null;
  return (
    <div key={ui.multiplier} className="mt-1.5 animate-in zoom-in-75 duration-200">
      <div className="inline-flex items-center gap-1 rounded-full bg-amber-400/90 px-3 py-1 shadow-[0_2px_12px_rgba(251,191,36,0.6)]">
        <Zap className="h-4 w-4 text-slate-900" fill="currentColor" />
        <span
          className="text-sm font-extrabold text-slate-900"
          style={{ fontFamily: "'Baloo 2', system-ui, sans-serif" }}
        >
          ×{ui.multiplier} COMBO
        </span>
      </div>
      <div className="mt-1 h-1 overflow-hidden rounded-full bg-black/40">
        <div
          className="h-full rounded-full bg-amber-300 transition-[width] duration-150 ease-linear"
          style={{ width: `${Math.round(ui.comboPct * 100)}%` }}
        />
      </div>
    </div>
  );
}

/** Badge Rush banner: ×2 frenzy pill with a sheen sweep + draining bar. */
function RushBanner() {
  const ui = useGameUI();
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    if (!ui.rush) return;
    const tick = () => setRemaining(Math.max(0, ui.rush!.expiresAt - Date.now()));
    tick();
    const id = window.setInterval(tick, 100);
    return () => window.clearInterval(id);
  }, [ui.rush]);

  if (!ui.rush) return null;
  const pct = Math.min(100, (remaining / ui.rush.durationMs) * 100);

  return (
    <div className="pointer-events-none absolute left-1/2 top-16 -translate-x-1/2 animate-in zoom-in-75 duration-200">
      <div className="relative overflow-hidden rounded-full bg-gradient-to-r from-amber-400 via-orange-500 to-rose-500 px-5 py-1.5 shadow-[0_4px_24px_rgba(251,146,60,0.75)]">
        <div className="roadyz-rush-sheen absolute inset-y-0 w-10 bg-white/40" />
        <div className="relative flex items-center gap-1.5">
          <Flame className="h-4 w-4 text-white" fill="currentColor" />
          <span
            className="text-sm font-extrabold tracking-wide text-white"
            style={{ fontFamily: "'Baloo 2', system-ui, sans-serif" }}
          >
            BADGE RUSH ×2
          </span>
        </div>
      </div>
      <div className="mx-4 mt-1 h-1 overflow-hidden rounded-full bg-black/40">
        <div
          className="h-full rounded-full bg-amber-300 transition-[width] duration-100 ease-linear"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

const SIGNAL_BANNERS: Record<string, { text: string; cls: string }> = {
  green: { text: "\ud83d\udfe2 GREEN \u2014 KEEP GOING!", cls: "bg-emerald-500/90 text-white" },
  amber: { text: "\ud83d\udfe1 AMBER \u2014 GET READY TO STOP", cls: "bg-amber-400/95 text-slate-900" },
  red: { text: "\ud83d\udd34 RED LIGHT \u2014 STOP!", cls: "bg-rose-600/95 text-white roadyz-signal-pulse" },
  waiting: { text: "WAIT FOR GREEN\u2026", cls: "bg-slate-900/85 text-rose-300" },
  go: { text: "\ud83d\udfe2 GO! GREAT STOP!", cls: "bg-emerald-500/95 text-white" },
};

/** Traffic light status strip + the big BRAKE button while red is live. */
function SignalBanner() {
  const ui = useGameUI();
  if (!ui.signal) return null;
  const banner = SIGNAL_BANNERS[ui.signal.phase];
  const showBrake = (ui.signal.phase === "red" || ui.signal.phase === "amber") && !ui.signal.braking;
  return (
    <>
      <div className="pointer-events-none absolute left-1/2 top-28 -translate-x-1/2 animate-in zoom-in-90 duration-200">
        <div
          className={`rounded-full px-5 py-2 text-sm font-extrabold tracking-wide shadow-[0_4px_24px_rgba(0,0,0,0.45)] ${banner.cls}`}
          style={{ fontFamily: "'Baloo 2', system-ui, sans-serif" }}
        >
          {banner.text}
        </div>
        {ui.signal.braking && ui.signal.phase !== "waiting" && ui.signal.phase !== "go" && (
          <p className="mt-1 text-center text-[11px] font-bold text-white/85 drop-shadow">Braking\u2026</p>
        )}
      </div>
      {showBrake && (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2">
          <button
            onClick={() => playerInput.brake()}
            className="roadyz-brake-pulse pointer-events-auto flex h-24 w-24 flex-col items-center justify-center gap-0.5 rounded-full border-4 border-white/80 bg-rose-600 text-white shadow-[0_8px_40px_rgba(225,29,72,0.65)] transition-transform active:scale-90"
            aria-label="Brake"
          >
            <Hand className="h-8 w-8" />
            <span className="text-sm font-extrabold" style={{ fontFamily: "'Baloo 2', system-ui, sans-serif" }}>
              BRAKE
            </span>
          </button>
          <p className="mt-1.5 text-center text-[10px] font-bold text-white/80 drop-shadow">or swipe down</p>
        </div>
      )}
    </>
  );
}

/** Phone-trap fallout: blurred, wobbling view until the runner refocuses. */
function DistractionOverlay() {
  const ui = useGameUI();
  const [pct, setPct] = useState(100);

  useEffect(() => {
    if (!ui.distraction) return;
    const tick = () =>
      setPct(
        Math.max(0, Math.min(100, ((ui.distraction!.expiresAt - Date.now()) / ui.distraction!.durationMs) * 100)),
      );
    tick();
    const id = window.setInterval(tick, 80);
    return () => window.clearInterval(id);
  }, [ui.distraction]);

  if (!ui.distraction) return null;
  return (
    <div className="roadyz-distraction pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
      <div className="roadyz-distraction-card flex flex-col items-center gap-1 rounded-3xl bg-black/55 px-7 py-5 text-center backdrop-blur-sm">
        <Smartphone className="h-9 w-9 text-cyan-300" />
        <p className="text-xl font-extrabold text-white" style={{ fontFamily: "'Baloo 2', system-ui, sans-serif" }}>
          DON'T TEXT &amp; WALK!
        </p>
        <div className="mt-1 h-1.5 w-36 overflow-hidden rounded-full bg-white/15">
          <div className="h-full rounded-full bg-cyan-300" style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  );
}

function PowerBar() {
  const ui = useGameUI();
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    if (!ui.power) return;
    const tick = () => {
      setRemaining(Math.max(0, ui.power!.expiresAt - Date.now()));
    };
    tick();
    const id = window.setInterval(tick, 100);
    return () => window.clearInterval(id);
  }, [ui.power]);

  if (!ui.power) return null;
  const info = POWERUP_INFO[ui.power.type];
  const pct = Math.min(100, (remaining / ui.power.durationMs) * 100);

  return (
    <div className="pointer-events-none absolute bottom-24 left-1/2 w-64 -translate-x-1/2">
      <div className="mb-1 text-center text-sm font-extrabold tracking-wide" style={{ color: info.color }}>
        {info.label}
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-black/50 backdrop-blur">
        <div
          className="h-full rounded-full transition-[width] duration-100 ease-linear"
          style={{ width: `${pct}%`, backgroundColor: info.color }}
        />
      </div>
    </div>
  );
}

export function GameHUD() {
  const ui = useGameUI();
  const [muted, setMuted] = useState(audio.isMuted());
  const [showHint, setShowHint] = useState(true);

  useEffect(() => {
    const id = window.setTimeout(() => setShowHint(false), 4500);
    return () => window.clearTimeout(id);
  }, []);

  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      {ui.rush && <div className="roadyz-rush-vignette absolute inset-0" />}
      <div className="absolute left-4 top-4">
        <p
          className="text-4xl font-extrabold text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]"
          style={{ fontFamily: "'Baloo 2', system-ui, sans-serif" }}
        >
          {ui.score.toLocaleString()}
        </p>
        <div className="mt-1 flex items-center gap-1.5 rounded-full bg-black/45 px-3 py-1 backdrop-blur">
          <BadgeCheck className="h-4 w-4 text-amber-300" />
          <span className="text-sm font-bold text-amber-300">{ui.tokens}</span>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-white/70">badges</span>
        </div>
        <ComboChip />
      </div>

      <div className="absolute right-4 top-4 flex flex-col items-end gap-2">
        <button
          onClick={() => {
            const next = !muted;
            setMuted(next);
            audio.setMuted(next);
          }}
          className="pointer-events-auto rounded-full bg-black/45 p-2.5 text-white backdrop-blur transition-transform active:scale-90"
          aria-label={muted ? "Unmute" : "Mute"}
        >
          {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
        </button>
        <div className="flex items-center gap-1.5 rounded-full bg-black/45 px-3 py-1 backdrop-blur">
          <Gauge className="h-4 w-4 text-sky-300" />
          <span className="text-sm font-bold text-white">{ui.speedKmh}</span>
          <span className="text-[10px] font-semibold text-white/70">km/h</span>
        </div>
      </div>

      <RushBanner />
      <SignalBanner />
      <DistractionOverlay />
      <PowerBar />
      <RewardPopups />

      {ui.tip && (
        <div
          key={ui.tip.id}
          className="absolute bottom-8 left-1/2 w-[88%] max-w-md -translate-x-1/2 animate-in fade-in slide-in-from-bottom-4 rounded-2xl border px-4 py-3 text-center backdrop-blur-md"
          style={{
            borderColor: `${ui.tip.color}66`,
            backgroundColor: "rgba(0,0,0,0.6)",
          }}
        >
          <p className="text-sm font-bold" style={{ color: ui.tip.color }}>
            {ui.tip.text}
          </p>
        </div>
      )}

      {showHint && !ui.tip && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-5 py-2 text-xs font-semibold text-white/85 backdrop-blur">
          Swipe / Arrows to dodge • Up = Jump • Down = Slide • Stop at red lights!
        </div>
      )}
    </div>
  );
}
