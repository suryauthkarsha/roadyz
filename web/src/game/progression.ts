/**
 * Safety License progression: XP earned exclusively from SAFE actions
 * (perfect stops, green crossings, stickers, quiz answers, missions...)
 * ranks the player from Learner up to Road Captain.
 */
export interface RankDef {
  name: string;
  xp: number;
}

export const RANKS: RankDef[] = [
  { name: "Learner", xp: 0 },
  { name: "Road Scout", xp: 120 },
  { name: "Junior Rider", xp: 320 },
  { name: "Safety Star", xp: 700 },
  { name: "Traffic Hero", xp: 1200 },
  { name: "Road Captain", xp: 2000 },
];

export function rankIndexFor(xp: number): number {
  let idx = 0;
  for (let i = 0; i < RANKS.length; i++) {
    if (xp >= RANKS[i].xp) idx = i;
  }
  return idx;
}

const XP_KEY = "roadyz_safety_xp";
const STICKERS_KEY = "roadyz_stickers_v1";
const GEAR_KEY = "roadyz_gear_v1";

export function loadXp(): number {
  try {
    return Number(window.localStorage.getItem(XP_KEY) ?? 0) || 0;
  } catch {
    return 0;
  }
}

export function saveXp(xp: number): void {
  try {
    window.localStorage.setItem(XP_KEY, String(xp));
  } catch {
    // storage unavailable — XP stays in memory
  }
}

export function loadStickers(): string[] {
  try {
    const raw = window.localStorage.getItem(STICKERS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === "string") : [];
  } catch {
    return [];
  }
}

export function saveStickers(ids: string[]): void {
  try {
    window.localStorage.setItem(STICKERS_KEY, JSON.stringify(ids));
  } catch {
    // storage unavailable
  }
}

export interface GearState {
  owned: string[];
  equipped: Record<string, string>;
}

export function loadGear(): GearState {
  try {
    const raw = window.localStorage.getItem(GEAR_KEY);
    if (!raw) return { owned: [], equipped: {} };
    const parsed = JSON.parse(raw) as GearState;
    return {
      owned: Array.isArray(parsed.owned) ? parsed.owned.filter((s): s is string => typeof s === "string") : [],
      equipped: parsed.equipped && typeof parsed.equipped === "object" ? parsed.equipped : {},
    };
  } catch {
    return { owned: [], equipped: {} };
  }
}

export function saveGear(gear: GearState): void {
  try {
    window.localStorage.setItem(GEAR_KEY, JSON.stringify(gear));
  } catch {
    // storage unavailable
  }
}
