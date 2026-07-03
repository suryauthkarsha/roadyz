import { useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  BookOpen,
  Eye,
  Home,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Star,
  Target,
  Trophy,
  TriangleAlert,
} from "lucide-react";
import { CRASH_LESSONS, SAFETY_SLOGANS } from "../constants";
import { audio } from "../audio";
import { resetRun } from "../runtime";
import { RANKS, rankIndexFor } from "../progression";
import { gameStore, useGameUI } from "../store";

/** Eased 0→target count-up so the final score lands with drama. */
function useCountUp(target: number, ms = 1100): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const f = Math.min(1, (now - start) / ms);
      const eased = 1 - Math.pow(1 - f, 3);
      setValue(Math.round(target * eased));
      if (f < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return value;
}

/** Run report stars: pop in one by one, earned by score thresholds. */
function StarRow({ stars }: { stars: number }) {
  return (
    <div className="mt-3 flex items-center justify-center gap-2">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="animate-in zoom-in-50 fade-in duration-300"
          style={{ animationDelay: `${200 + i * 220}ms`, animationFillMode: "backwards" }}
        >
          <Star
            className={`h-9 w-9 ${
              i < stars
                ? "text-amber-300 drop-shadow-[0_0_10px_rgba(251,191,36,0.7)]"
                : "text-white/15"
            }`}
            fill={i < stars ? "currentColor" : "none"}
          />
        </div>
      ))}
    </div>
  );
}

/** Safety XP earned + license progress toward the next rank. */
function XpReport({ xpEarned, newRank }: { xpEarned: number; newRank: string | null }) {
  const ui = useGameUI();
  const idx = rankIndexFor(ui.xp);
  const rank = RANKS[idx];
  const next = RANKS[idx + 1];
  const pct = next
    ? Math.min(100, Math.round(((ui.xp - rank.xp) / (next.xp - rank.xp)) * 100))
    : 100;
  return (
    <div className="mt-3 rounded-xl border border-emerald-300/25 bg-emerald-400/[0.08] px-4 py-3">
      {newRank ? (
        <p className="mb-1.5 inline-flex items-center gap-1.5 rounded-full bg-emerald-400/20 px-3 py-1 text-[11px] font-extrabold text-emerald-300">
          <ShieldCheck className="h-3.5 w-3.5" /> NEW RANK: {newRank.toUpperCase()}!
        </p>
      ) : null}
      <div className="flex items-center justify-between text-[11px] font-bold">
        <span className="text-emerald-300">+{xpEarned} Safety XP</span>
        <span className="text-white/60">
          {rank.name}
          {next ? ` → ${next.name}` : " (max!)"}
        </span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-300"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function runAgain(): void {
  resetRun();
  gameStore.startGame();
  audio.restoreMusic();
  audio.startRunAudio();
}

export function GameOverScreen() {
  const ui = useGameUI();
  const slogan = useMemo(
    () => SAFETY_SLOGANS[Math.floor(Math.random() * SAFETY_SLOGANS.length)],
    [],
  );
  const run = ui.lastRun;
  const animatedScore = useCountUp(run?.score ?? 0);
  const lesson = run?.crashReason ? CRASH_LESSONS[run.crashReason] : null;

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center overflow-y-auto bg-black/60 px-6 py-6 backdrop-blur-[3px]">
      <div className="w-full max-w-sm rounded-3xl border border-white/15 bg-gradient-to-b from-slate-900/95 to-slate-950/95 p-6 text-center shadow-2xl">
        {run?.isBest ? (
          <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-amber-400/20 px-4 py-1.5 text-sm font-extrabold text-amber-300">
            <Trophy className="h-4 w-4" /> NEW BEST RUN!
          </div>
        ) : (
          <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-rose-500/20 px-4 py-1.5 text-sm font-extrabold text-rose-300">
            <TriangleAlert className="h-4 w-4" /> {lesson ? lesson.title : "OUCH! WATCH THE TRAFFIC"}
          </div>
        )}

        <p
          className="mt-2 text-6xl font-extrabold tabular-nums text-white"
          style={{ fontFamily: "'Baloo 2', system-ui, sans-serif" }}
        >
          {animatedScore.toLocaleString()}
        </p>

        <StarRow stars={run?.stars ?? 0} />
        {run?.nextStarAt != null && (
          <p className="mt-1 text-[11px] font-semibold text-white/55">
            Next star at {run.nextStarAt.toLocaleString()} pts — you can do it!
          </p>
        )}

        <div className="mt-4 grid grid-cols-3 gap-2">
          <div className="rounded-xl bg-white/5 px-2 py-3">
            <p className="text-lg font-extrabold text-amber-300">{run?.tokens ?? 0}</p>
            <p className="flex items-center justify-center gap-1 text-[10px] font-semibold uppercase text-white/60">
              <BadgeCheck className="h-3 w-3" /> Badges
            </p>
          </div>
          <div className="rounded-xl bg-white/5 px-2 py-3">
            <p className="text-lg font-extrabold text-sky-300">{run?.distance ?? 0}m</p>
            <p className="text-[10px] font-semibold uppercase text-white/60">Distance</p>
          </div>
          <div className="rounded-xl bg-white/5 px-2 py-3">
            <p className="text-lg font-extrabold text-emerald-300">{ui.best.toLocaleString()}</p>
            <p className="text-[10px] font-semibold uppercase text-white/60">Best</p>
          </div>
        </div>

        <XpReport xpEarned={run?.xpEarned ?? 0} newRank={run?.newRank ?? null} />

        <div className="mt-2.5 flex items-center justify-center gap-1.5 text-[11px] font-bold text-emerald-300">
          <BadgeCheck className="h-3.5 w-3.5" />
          +{run?.tokens ?? 0} badges banked — {ui.wallet.toLocaleString()} total
        </div>

        <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5">
          {(run?.missionsDone ?? 0) > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-400/15 px-3 py-1.5 text-[11px] font-extrabold text-violet-300">
              <Target className="h-3.5 w-3.5" />
              {run!.missionsDone} MISSION{run!.missionsDone > 1 ? "S" : ""} DONE
            </span>
          )}
          {(run?.stickersFound ?? 0) > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-400/15 px-3 py-1.5 text-[11px] font-extrabold text-teal-300">
              <BookOpen className="h-3.5 w-3.5" />
              +{run!.stickersFound} STICKER{run!.stickersFound > 1 ? "S" : ""}
            </span>
          )}
          {run?.focused && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-cyan-400/15 px-3 py-1.5 text-[11px] font-extrabold text-cyan-300">
              <Eye className="h-3.5 w-3.5" /> FOCUSED — NO PHONES!
            </span>
          )}
        </div>

        <div
          className={`mt-3 rounded-xl border px-4 py-3 ${
            lesson && !run?.isBest
              ? "border-rose-300/25 bg-rose-500/10"
              : "border-amber-300/25 bg-amber-400/10"
          }`}
        >
          {lesson ? (
            <>
              <p className="flex items-center justify-center gap-1.5 text-[10px] font-extrabold uppercase tracking-[0.2em] text-rose-300">
                <Sparkles className="h-3 w-3" /> Lesson learned
              </p>
              <p className="mt-1 text-xs font-bold text-white/90">{lesson.lesson}</p>
            </>
          ) : (
            <p className="text-xs font-bold uppercase tracking-[0.25em] text-amber-300">{slogan}</p>
          )}
        </div>

        <button
          onClick={runAgain}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-amber-400 to-orange-500 px-6 py-3.5 text-lg font-extrabold text-slate-900 shadow-lg transition-transform active:scale-95"
          style={{ fontFamily: "'Baloo 2', system-ui, sans-serif" }}
        >
          <RotateCcw className="h-5 w-5" /> RUN AGAIN
        </button>
        <button
          onClick={() => gameStore.backToMenu()}
          className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-6 py-3 text-sm font-bold text-white/85 transition-transform active:scale-95"
        >
          <Home className="h-4 w-4" /> Main Menu
        </button>
      </div>
    </div>
  );
}
