import { BookOpen, X } from "lucide-react";
import { SIGNS } from "../signs";
import { useGameUI } from "../store";
import { SignCanvas } from "./SignCanvas";

/**
 * Road Sign Sticker Book: every sign collected on the road fills a slot with
 * its kid-friendly meaning. Completing the book unlocks the Sign Master Halo.
 */
export function StickerBook({ onClose }: { onClose: () => void }) {
  const ui = useGameUI();
  const collected = ui.stickers;
  const done = collected.length >= SIGNS.length;

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
      <div className="flex max-h-[86vh] w-full max-w-md animate-in zoom-in-95 fade-in duration-200 flex-col rounded-3xl border border-teal-300/25 bg-gradient-to-b from-slate-900/95 to-slate-950/95 shadow-2xl">
        <div className="flex items-center gap-2 px-5 pb-3 pt-5">
          <BookOpen className="h-5 w-5 text-teal-300" />
          <h2
            className="text-lg font-extrabold text-white"
            style={{ fontFamily: "'Baloo 2', system-ui, sans-serif" }}
          >
            Sticker Book
          </h2>
          <span className="ml-auto rounded-full bg-teal-400/15 px-3 py-1 text-xs font-extrabold text-teal-300">
            {collected.length}/{SIGNS.length}
          </span>
          <button
            onClick={onClose}
            className="rounded-full bg-white/10 p-2 text-white transition-transform active:scale-90"
            aria-label="Close sticker book"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="overflow-y-auto px-5 pb-5">
          <div className="grid grid-cols-3 gap-2.5">
            {SIGNS.map((sign) => {
              const owned = collected.includes(sign.id);
              return (
                <div
                  key={sign.id}
                  className={`flex flex-col items-center rounded-2xl border p-2.5 text-center ${
                    owned ? "border-teal-300/30 bg-white/[0.07]" : "border-white/10 bg-white/[0.03]"
                  }`}
                >
                  <div className="relative">
                    <SignCanvas signId={sign.id} size={58} dim={!owned} />
                    {!owned && (
                      <span className="absolute inset-0 flex items-center justify-center text-xl font-extrabold text-white/45">
                        ?
                      </span>
                    )}
                  </div>
                  <p className={`mt-1.5 text-[10px] font-extrabold leading-tight ${owned ? "text-white" : "text-white/35"}`}>
                    {owned ? sign.name : "???"}
                  </p>
                  {owned && (
                    <p className="mt-0.5 text-[9px] font-medium leading-snug text-white/60">{sign.meaning}</p>
                  )}
                </div>
              );
            })}
          </div>

          <div
            className={`mt-4 rounded-2xl border px-4 py-3 text-center text-[11px] font-bold ${
              done
                ? "border-amber-300/40 bg-amber-400/15 text-amber-300"
                : "border-white/10 bg-white/5 text-white/60"
            }`}
          >
            {done
              ? "BOOK COMPLETE! Claim the Sign Master Halo in the Safety Shop!"
              : "Grab the glowing sign boards on your runs to fill the book — finish it to unlock the golden Sign Master Halo!"}
          </div>
        </div>
      </div>
    </div>
  );
}
