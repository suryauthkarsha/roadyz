import { BadgeCheck, Check, Lock, ShoppingBag, Sparkles, Wind, X } from "lucide-react";
import { LucideIcon } from "lucide-react";
import { audio } from "../audio";
import { GEAR_ITEMS, GearSlot, stickerBookComplete } from "../shop";
import { SIGNS } from "../signs";
import { gameStore, useGameUI } from "../store";

const SLOT_ICONS: Record<GearSlot, LucideIcon> = {
  aura: Sparkles,
  trail: Wind,
};

const SLOT_LABELS: Record<GearSlot, string> = {
  aura: "Aura",
  trail: "Trail",
};

/**
 * Safety Shop: the Badge Wallet finally has somewhere to go — glowing effect
 * gear for every run. The Sign Master Halo is earned, not bought.
 */
export function ShopPanel({ onClose }: { onClose: () => void }) {
  const ui = useGameUI();
  const bookDone = stickerBookComplete(ui.stickers);

  const buy = (id: string): void => {
    audio.unlock();
    if (gameStore.buyGear(id)) audio.play("purchase", { volume: 0.8 });
  };

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
      <div className="flex max-h-[86vh] w-full max-w-md animate-in zoom-in-95 fade-in duration-200 flex-col rounded-3xl border border-amber-300/25 bg-gradient-to-b from-slate-900/95 to-slate-950/95 shadow-2xl">
        <div className="flex items-center gap-2 px-5 pb-3 pt-5">
          <ShoppingBag className="h-5 w-5 text-amber-300" />
          <h2
            className="text-lg font-extrabold text-white"
            style={{ fontFamily: "'Baloo 2', system-ui, sans-serif" }}
          >
            Safety Shop
          </h2>
          <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-amber-400/15 px-3 py-1 text-xs font-extrabold text-amber-300">
            <BadgeCheck className="h-3.5 w-3.5" /> {ui.wallet.toLocaleString()}
          </span>
          <button
            onClick={onClose}
            className="rounded-full bg-white/10 p-2 text-white transition-transform active:scale-90"
            aria-label="Close shop"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-col gap-2.5 overflow-y-auto px-5 pb-5">
          {GEAR_ITEMS.map((item) => {
            const owned = ui.gearOwned.includes(item.id);
            const equipped = ui.gearEquipped[item.slot] === item.id;
            const Icon = SLOT_ICONS[item.slot];
            const affordable = ui.wallet >= item.price;
            const lockedReward = item.stickerReward && !bookDone && !owned;
            return (
              <div
                key={item.id}
                className={`flex items-center gap-3 rounded-2xl border p-3 ${
                  equipped ? "border-emerald-300/40 bg-emerald-400/[0.08]" : "border-white/10 bg-white/[0.05]"
                }`}
              >
                <div
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
                  style={{ backgroundColor: `${item.color}26`, color: item.color }}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="truncate text-sm font-extrabold text-white">{item.name}</p>
                    <span className="rounded-full bg-white/10 px-2 py-0.5 text-[9px] font-bold uppercase text-white/60">
                      {SLOT_LABELS[item.slot]}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-[11px] font-medium text-white/55">{item.desc}</p>
                </div>
                {owned ? (
                  <button
                    onClick={() => gameStore.toggleEquip(item.id)}
                    className={`shrink-0 rounded-xl px-3.5 py-2 text-xs font-extrabold transition-transform active:scale-95 ${
                      equipped ? "bg-emerald-400 text-slate-900" : "border border-white/20 bg-white/5 text-white/85"
                    }`}
                  >
                    {equipped ? (
                      <span className="inline-flex items-center gap-1">
                        <Check className="h-3.5 w-3.5" /> ON
                      </span>
                    ) : (
                      "WEAR"
                    )}
                  </button>
                ) : lockedReward ? (
                  <div className="flex shrink-0 flex-col items-center gap-0.5 text-white/45">
                    <Lock className="h-4 w-4" />
                    <span className="text-[9px] font-bold leading-tight">
                      {ui.stickers.length}/{SIGNS.length} stickers
                    </span>
                  </div>
                ) : (
                  <button
                    onClick={() => buy(item.id)}
                    disabled={!item.stickerReward && !affordable}
                    className={`shrink-0 rounded-xl px-3.5 py-2 text-xs font-extrabold transition-transform active:scale-95 ${
                      item.stickerReward || affordable
                        ? "bg-gradient-to-r from-amber-400 to-orange-500 text-slate-900"
                        : "bg-white/10 text-white/35"
                    }`}
                  >
                    {item.stickerReward ? (
                      "CLAIM!"
                    ) : (
                      <span className="inline-flex items-center gap-1">
                        <BadgeCheck className="h-3.5 w-3.5" /> {item.price}
                      </span>
                    )}
                  </button>
                )}
              </div>
            );
          })}
          <p className="mt-1 text-center text-[10px] font-semibold text-white/45">
            Earn badges on every run — safe moves earn the most!
          </p>
        </div>
      </div>
    </div>
  );
}
