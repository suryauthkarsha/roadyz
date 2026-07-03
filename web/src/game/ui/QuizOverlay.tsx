import { useEffect, useRef, useState } from "react";
import { HeartPulse, TimerReset } from "lucide-react";
import { QUIZ_SECONDS } from "../constants";
import { resolveQuiz } from "../runtime";
import { useGameUI } from "../store";
import { SignCanvas } from "./SignCanvas";

/**
 * Quiz revive: after the first crash of a run the world freezes and one
 * road-sign question decides whether the runner gets back up. Correct
 * answers revive with a short shield; wrong or slow answers end the run —
 * but always reveal the right meaning, so every crash still teaches.
 */
export function QuizOverlay() {
  const ui = useGameUI();
  const quiz = ui.quiz;
  const [remaining, setRemaining] = useState(QUIZ_SECONDS * 1000);
  const [picked, setPicked] = useState<number | null>(null);
  const [reveal, setReveal] = useState(false);
  const resolvedRef = useRef(false);

  useEffect(() => {
    resolvedRef.current = false;
    setPicked(null);
    setReveal(false);
    setRemaining(QUIZ_SECONDS * 1000);
    const startedAt = performance.now();
    const id = window.setInterval(() => {
      const left = Math.max(0, QUIZ_SECONDS * 1000 - (performance.now() - startedAt));
      setRemaining(left);
      if (left <= 0 && !resolvedRef.current) {
        resolvedRef.current = true;
        window.clearInterval(id);
        setReveal(true);
        window.setTimeout(() => resolveQuiz(false), 1400);
      }
    }, 80);
    return () => window.clearInterval(id);
  }, [quiz]);

  if (!quiz) return null;
  const pct = Math.max(0, Math.min(100, (remaining / (QUIZ_SECONDS * 1000)) * 100));

  const answer = (index: number): void => {
    if (resolvedRef.current) return;
    resolvedRef.current = true;
    setPicked(index);
    setReveal(true);
    const correct = index === quiz.correctIndex;
    window.setTimeout(() => resolveQuiz(correct), correct ? 900 : 1500);
  };

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/70 px-5 backdrop-blur-[4px]">
      <div className="w-full max-w-sm animate-in zoom-in-95 fade-in duration-300 rounded-3xl border border-sky-300/25 bg-gradient-to-b from-slate-900/95 to-slate-950/95 p-6 text-center shadow-2xl">
        <div className="inline-flex items-center gap-2 rounded-full bg-sky-400/15 px-4 py-1.5 text-xs font-extrabold uppercase tracking-wider text-sky-300">
          <HeartPulse className="h-4 w-4" /> Second chance!
        </div>
        <h2
          className="mt-3 text-2xl font-extrabold text-white"
          style={{ fontFamily: "'Baloo 2', system-ui, sans-serif" }}
        >
          {quiz.prompt}
        </h2>
        <p className="mt-0.5 text-xs font-semibold text-white/55">
          Answer right to jump back into the run
        </p>

        <div className="mx-auto mt-4 w-fit rounded-2xl bg-white/95 p-3 shadow-[0_6px_30px_rgba(56,189,248,0.25)]">
          <SignCanvas signId={quiz.signId} size={110} />
        </div>

        <div className="mt-5 flex flex-col gap-2.5">
          {quiz.options.map((option, i) => {
            const isCorrect = i === quiz.correctIndex;
            const isPicked = picked === i;
            let cls = "border-white/15 bg-white/5 text-white/90 active:scale-[0.98]";
            if (reveal && isCorrect)
              cls = "border-emerald-300/70 bg-emerald-400/20 text-emerald-200 roadyz-quiz-correct";
            else if (reveal && isPicked && !isCorrect)
              cls = "border-rose-400/70 bg-rose-500/20 text-rose-200";
            else if (reveal) cls = "border-white/10 bg-white/5 text-white/35";
            return (
              <button
                key={i}
                onClick={() => answer(i)}
                disabled={reveal}
                className={`rounded-2xl border px-4 py-3 text-sm font-bold transition-all ${cls}`}
              >
                {option}
              </button>
            );
          })}
        </div>

        <div className="mt-5 flex items-center gap-2">
          <TimerReset className="h-4 w-4 shrink-0 text-amber-300" />
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-black/50">
            <div
              className={`h-full rounded-full transition-[width] duration-100 ease-linear ${
                pct > 35 ? "bg-amber-400" : "bg-rose-500"
              }`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="w-8 shrink-0 text-right text-sm font-extrabold tabular-nums text-amber-300">
            {Math.ceil(remaining / 1000)}s
          </span>
        </div>
      </div>
    </div>
  );
}
