import { SIGNS } from "./signs";

/** Cosmetic slots the runner can equip one item into (effects only). */
export type GearSlot = "aura" | "trail";

export interface GearItem {
  id: string;
  name: string;
  desc: string;
  slot: GearSlot;
  /** Badge price. 0 = unlocked by completing the Sticker Book instead. */
  price: number;
  color: string;
  /** Requires the full sticker book instead of badges. */
  stickerReward?: boolean;
}

export const GEAR_ITEMS: GearItem[] = [
  {
    id: "star_aura",
    name: "Star Sparkle",
    desc: "Golden stars orbit you while you run.",
    slot: "aura",
    price: 650,
    color: "#fde047",
  },
  {
    id: "rainbow_trail",
    name: "Rainbow Trail",
    desc: "Leave a rainbow streak at full speed.",
    slot: "trail",
    price: 900,
    color: "#a78bfa",
  },
  {
    id: "sign_master_halo",
    name: "Sign Master Halo",
    desc: "Complete the Sticker Book to earn this golden ring of signs.",
    slot: "aura",
    price: 0,
    color: "#fbbf24",
    stickerReward: true,
  },
];

export function gearById(id: string): GearItem | undefined {
  return GEAR_ITEMS.find((g) => g.id === id);
}

export function stickerBookComplete(stickers: string[]): boolean {
  return SIGNS.every((s) => stickers.includes(s.id));
}
