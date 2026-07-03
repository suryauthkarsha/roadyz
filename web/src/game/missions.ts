/**
 * Rotating single-run missions: three active goals persist across sessions.
 * Completing one mid-run pays out instantly; at run end it advances to the
 * next tier (or rotates to a fresh goal type once its tiers are exhausted).
 */
export type MissionType = "badges" | "jumps" | "distance" | "powerups" | "nearmiss" | "golden" | "stops";

export interface MissionState {
  type: MissionType;
  tier: number;
}

interface MissionDef {
  tiers: number[];
  label: (n: number) => string;
}

export const MISSION_DEFS: Record<MissionType, MissionDef> = {
  badges: { tiers: [25, 60, 110, 180], label: (n) => `Collect ${n} badges in one run` },
  jumps: { tiers: [3, 6, 10, 15], label: (n) => `Clean-jump ${n} vehicles in one run` },
  distance: { tiers: [400, 800, 1400, 2200], label: (n) => `Run ${n}m in a single run` },
  powerups: { tiers: [1, 2, 3, 4], label: (n) => `Grab ${n} power-up${n > 1 ? "s" : ""} in one run` },
  nearmiss: { tiers: [3, 6, 10, 16], label: (n) => `Survive ${n} close calls in one run` },
  golden: { tiers: [1, 2, 3, 4], label: (n) => `Find ${n} Golden Cone${n > 1 ? "s" : ""} in one run` },
  stops: { tiers: [1, 2, 3, 5], label: (n) => `Make ${n} Perfect Stop${n > 1 ? "s" : ""} at red lights` },
};

const ALL_TYPES = Object.keys(MISSION_DEFS) as MissionType[];

export function missionTarget(type: MissionType, tier: number): number {
  const tiers = MISSION_DEFS[type].tiers;
  return tiers[Math.min(tier, tiers.length - 1)];
}

export function missionLabel(type: MissionType, tier: number): string {
  return MISSION_DEFS[type].label(missionTarget(type, tier));
}

/**
 * Next goal after completing (type, tier): harder tier of the same goal, or a
 * random goal type not currently active once all tiers are cleared.
 */
export function advanceMission(current: MissionState, activeTypes: MissionType[]): MissionState {
  const def = MISSION_DEFS[current.type];
  if (current.tier + 1 < def.tiers.length) {
    return { type: current.type, tier: current.tier + 1 };
  }
  const unused = ALL_TYPES.filter((t) => !activeTypes.includes(t));
  const next = unused[Math.floor(Math.random() * unused.length)] ?? current.type;
  return { type: next, tier: 0 };
}

const MISSIONS_KEY = "roadyz_missions_v1";

const DEFAULT_MISSIONS: MissionState[] = [
  { type: "badges", tier: 0 },
  { type: "jumps", tier: 0 },
  { type: "distance", tier: 0 },
];

export function loadMissions(): MissionState[] {
  try {
    const raw = window.localStorage.getItem(MISSIONS_KEY);
    if (!raw) return DEFAULT_MISSIONS;
    const parsed = JSON.parse(raw) as MissionState[];
    const valid = parsed.filter(
      (m) => m && typeof m.tier === "number" && ALL_TYPES.includes(m.type),
    );
    return valid.length === 3 ? valid : DEFAULT_MISSIONS;
  } catch {
    return DEFAULT_MISSIONS;
  }
}

export function saveMissions(list: MissionState[]): void {
  try {
    window.localStorage.setItem(MISSIONS_KEY, JSON.stringify(list.map((m) => ({ type: m.type, tier: m.tier }))));
  } catch {
    // storage unavailable — missions stay in memory
  }
}
