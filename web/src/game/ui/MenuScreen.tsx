import { useState } from "react";
import {
  BadgeCheck,
  Bike,
  BookOpen,
  CheckCircle2,
  ChevronsRight,
  Compass,
  Crown,
  Footprints,
  GraduationCap,
  Hand,
  MoveUp,
  Route,
  Shield,
  ShoppingBag,
  Star,
  Target,
  Trophy,
  Wind,
  Zap,
} from "lucide-react";
import { LucideIcon } from "lucide-react";
import { audio } from "../audio";
import { resetRun } from "../runtime";
import { MissionType } from "../missions";
import { RANKS, rankIndexFor } from "../progression";
import { SIGNS } from "../signs";
import { gameStore, useGameUI } from "../store";
import { ShopPanel } from "./ShopPanel";
import { StickerBook } from "./StickerBook";

const MISSION_ICONS: Record<MissionType, LucideIcon> = {
  badges: BadgeCheck,
  jumps: MoveUp,
  distance: Route,
  powerups: Zap,
  nearmiss: Wind,
  golden: Crown,
  stops: Hand,
};

const RANK_ICONS: LucideIcon[] = [GraduationCap, Compass, Bike, Star, Shield, Crown];

/** Safety License card: rank, stars and XP progress to the next rank. */
function LicenseCard() {
  const ui = useGameUI();
  const idx = rankIndexFor(ui.xp);
  const rank = RANKS[idx];
  const next = RANKS[idx + 1];
  const Icon = RANK_ICONS[Math.min(idx, RANK_ICONS.length - 1)];
  const pct = next
    ? Math.min(100, Math.round(((ui.xp - rank.xp) / (next.xp - rank.xp)) * 100))
    : 100;
  return (
    <div className="w-full rounded-2xl border border-emerald-300/25 bg-gradient-to-r from-emerald-950/60 to-slate-900/60 p-3.5 backdrop-blur-md">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-400/15 text-emerald-300">
          <Icon className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.25em] text-emerald-300/80">
            Safety License
          </p>
          <p
            className="truncate text-base font-extrabold text-white"
            style={{ fontFamily: "'Baloo 2', system-ui, sans-serif" }}
          >
            {rank.name}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-sm font-extrabold text-emerald-300">{ui.xp} XP</p>
          {next && <p className="text-[10px] font-semibold text-white/50">{next.xp} for {next.name}</p>}
        </div>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-300" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** Three rotating single-run goals — the "one more run" hook. */
function MissionsPanel() {
  const ui = useGameUI();
  if (ui.missions.length === 0) return null;
  return (
    <div className="w-full rounded-2xl border border-white/15 bg-black/40 p-3.5 backdrop-blur-md">
      <div className="mb-2.5 flex items-center gap-1.5">
        <Target className="h-4 w-4 text-violet-300" />
        <p className="text-[11px] font-extrabold uppercase tracking-[0.25em] text-violet-300">
          Missions
        </p>
        <p className="ml-auto text-[10px] font-semibold text-white/50">+250 pts each</p>
      </div>
      <div className="flex flex-col gap-2">
        {ui.missions.map((m) => {
          const Icon = MISSION_ICONS[m.type];
          const pct = Math.min(100, Math.round((m.progress / m.target) * 100));
          return (
            <div key={`${m.type}-${m.tier}`} className="flex items-center gap-2.5">
              {m.done ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-300" />
              ) : (
                <Icon className="h-4 w-4 shrink-0 text-amber-300" />
              )}
              <div className="min-w-0 flex-1">
                <p
                  className={`truncate text-[11px] font-bold ${m.done ? "text-emerald-300 line-through" : "text-white/90"}`}
                >
                  {m.label}
                </p>
                <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-white/10">
                  <div
                    className={`h-full rounded-full ${m.done ? "bg-emerald-400" : "bg-amber-400"}`}
                    style={{ width: `${m.done ? 100 : pct}%` }}
                  />
                </div>
              </div>
              <p className="shrink-0 text-[10px] font-bold text-white/55">
                {m.done ? "Done!" : `${m.progress}/${m.target}`}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function startGame(): void {
  audio.unlock();
  resetRun();
  gameStore.startGame();
  audio.restoreMusic();
  audio.startRunAudio();
}

export function MenuScreen() {
  const ui = useGameUI();
  const [panel, setPanel] = useState<"stickers" | "shop" | null>(null);

  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-between overflow-y-auto bg-gradient-to-b from-black/55 via-transparent to-black/70 px-6 py-8">
      <div className="mt-2 text-center">
        <p className="mb-2 text-sm font-bold uppercase tracking-[0.4em] text-amber-300">
          Run Smart • Run Safe
        </p>
        <h1
          className="bg-gradient-to-b from-amber-300 via-orange-400 to-rose-500 bg-clip-text text-6xl font-extrabold text-transparent drop-shadow-[0_4px_24px_rgba(251,146,60,0.45)] sm:text-8xl"
          style={{ fontFamily: "'Baloo 2', system-ui, sans-serif" }}
        >
          ROADYZ
        </h1>
        <p className="mx-auto mt-2 max-w-sm text-sm font-medium text-white/85">
          Sprint through a living Indian city. Stop at red, dodge the traffic, collect Safety
          Badges — and grow your Safety License while you fly.
        </p>
      </div>

      <div className="flex w-full max-w-sm flex-col items-center gap-3">
        <LicenseCard />
        <MissionsPanel />

        <div className="grid w-full grid-cols-2 gap-2">
          <button
            onClick={() => setPanel("stickers")}
            className="flex items-center justify-center gap-2 rounded-2xl border border-teal-300/30 bg-teal-400/10 px-3 py-3 text-sm font-extrabold text-teal-300 backdrop-blur-md transition-transform active:scale-95"
          >
            <BookOpen className="h-4 w-4" />
            Stickers {ui.stickers.length}/{SIGNS.length}
          </button>
          <button
            onClick={() => setPanel("shop")}
            className="flex items-center justify-center gap-2 rounded-2xl border border-amber-300/30 bg-amber-400/10 px-3 py-3 text-sm font-extrabold text-amber-300 backdrop-blur-md transition-transform active:scale-95"
          >
            <ShoppingBag className="h-4 w-4" />
            Safety Shop
          </button>
        </div>

        <div className="grid w-full grid-cols-3 gap-2 text-center">
          {[
            { icon: Footprints, label: "Footpath Mode", color: "text-emerald-300" },
            { icon: Bike, label: "Cycle Sprint", color: "text-sky-300" },
            { icon: Shield, label: "Hi-Vis Jacket", color: "text-amber-300" },
          ].map(({ icon: Icon, label, color }) => (
            <div
              key={label}
              className="rounded-2xl border border-white/15 bg-white/10 px-2 py-2.5 backdrop-blur-md"
            >
              <Icon className={`mx-auto mb-1 h-5 w-5 ${color}`} />
              <p className="text-[11px] font-semibold leading-tight text-white/90">{label}</p>
            </div>
          ))}
        </div>

        <button
          onClick={startGame}
          className="group flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-amber-400 to-orange-500 px-8 py-4 text-xl font-extrabold text-slate-900 shadow-[0_8px_32px_rgba(251,146,60,0.5)] transition-transform active:scale-95"
          style={{ fontFamily: "'Baloo 2', system-ui, sans-serif" }}
        >
          START RUN
          <ChevronsRight className="h-6 w-6 transition-transform group-hover:translate-x-1" />
        </button>

        {(ui.best > 0 || ui.wallet > 0) && (
          <div className="flex items-center gap-2">
            {ui.best > 0 && (
              <div className="flex items-center gap-2 rounded-full border border-amber-300/40 bg-black/40 px-4 py-1.5 text-sm font-bold text-amber-300">
                <Trophy className="h-4 w-4" /> Best: {ui.best.toLocaleString()}
              </div>
            )}
            {ui.wallet > 0 && (
              <div className="flex items-center gap-2 rounded-full border border-emerald-300/40 bg-black/40 px-4 py-1.5 text-sm font-bold text-emerald-300">
                <BadgeCheck className="h-4 w-4" /> {ui.wallet.toLocaleString()} badges
              </div>
            )}
          </div>
        )}
        <p className="text-center text-xs text-white/60">
          Swipe or Arrow Keys — up jumps, down slides (and brakes at red lights!)
        </p>
      </div>

      {panel === "stickers" && <StickerBook onClose={() => setPanel(null)} />}
      {panel === "shop" && <ShopPanel onClose={() => setPanel(null)} />}
    </div>
  );
}
