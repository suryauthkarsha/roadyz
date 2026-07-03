import { useSyncExternalStore } from "react";
import { CrashReason, PowerUpType } from "./constants";
import {
  advanceMission,
  loadMissions,
  missionLabel,
  missionTarget,
  MissionState,
  MissionType,
  saveMissions,
} from "./missions";
import {
  loadGear,
  loadStickers,
  loadXp,
  rankIndexFor,
  RANKS,
  saveGear,
  saveStickers,
  saveXp,
} from "./progression";
import { QuizQuestion } from "./quiz";
import { GEAR_ITEMS, gearById, GearSlot, stickerBookComplete } from "./shop";

export type GamePhase = "menu" | "playing" | "quiz" | "over";

export interface PowerUpUI {
  type: PowerUpType;
  /** Wall-clock ms when the power-up expires (for HUD countdown). */
  expiresAt: number;
  durationMs: number;
}

export interface TipUI {
  id: number;
  text: string;
  color: string;
}

/** Short-lived floating reward popup (combo tier, milestone, bounce). */
export interface PopupUI {
  id: number;
  text: string;
  color: string;
}

export interface LastRun {
  score: number;
  tokens: number;
  distance: number;
  isBest: boolean;
  stars: number;
  nextStarAt: number | null;
  /** Missions completed during this run (instant payouts already applied). */
  missionsDone: number;
  crashReason: CrashReason | null;
  /** Safety XP earned this run. */
  xpEarned: number;
  /** Rank name if the player ranked up during this run. */
  newRank: string | null;
  /** NEW stickers found this run. */
  stickersFound: number;
  /** Saw phones but grabbed none — focused runner bonus. */
  focused: boolean;
}

/** Badge Rush HUD state (banner + countdown). */
export interface RushUI {
  expiresAt: number;
  durationMs: number;
}

/** Traffic signal HUD banner state. */
export interface SignalUI {
  phase: "green" | "amber" | "red" | "waiting" | "go";
  braking: boolean;
}

/** Phone-trap distraction overlay state. */
export interface DistractionUI {
  expiresAt: number;
  durationMs: number;
}

export interface MissionUI {
  type: MissionType;
  tier: number;
  target: number;
  label: string;
  progress: number;
  done: boolean;
}

/** Per-run stats the runtime reports for mission progress. */
export interface RunStats {
  badges: number;
  cleanJumps: number;
  distance: number;
  powerups: number;
  nearMisses: number;
  golden: number;
  perfectStops: number;
}

const STAT_BY_TYPE: Record<MissionType, keyof RunStats> = {
  badges: "badges",
  jumps: "cleanJumps",
  distance: "distance",
  powerups: "powerups",
  nearmiss: "nearMisses",
  golden: "golden",
  stops: "perfectStops",
};

function toMissionUI(m: MissionState): MissionUI {
  return {
    type: m.type,
    tier: m.tier,
    target: missionTarget(m.type, m.tier),
    label: missionLabel(m.type, m.tier),
    progress: 0,
    done: false,
  };
}

export interface GameUIState {
  phase: GamePhase;
  score: number;
  tokens: number;
  best: number;
  /** Safety Badges banked across every run (persistent wallet). */
  wallet: number;
  speedKmh: number;
  multiplier: number;
  /** 0..1 remaining fraction of the combo window (0 when no combo). */
  comboPct: number;
  power: PowerUpUI | null;
  rush: RushUI | null;
  signal: SignalUI | null;
  distraction: DistractionUI | null;
  quiz: QuizQuestion | null;
  tip: TipUI | null;
  popups: PopupUI[];
  lastRun: LastRun | null;
  missions: MissionUI[];
  /** Persistent Safety License XP. */
  xp: number;
  /** Collected sign sticker ids (persistent). */
  stickers: string[];
  /** Owned cosmetic gear ids (persistent). */
  gearOwned: string[];
  /** Equipped gear id per slot (persistent). */
  gearEquipped: Partial<Record<GearSlot, string>>;
}

const BEST_KEY = "roadyz_best_score";
const WALLET_KEY = "roadyz_badge_wallet";

/** Score needed for each star on the run report. */
export const STAR_THRESHOLDS: number[] = [800, 2400, 5500];

function loadNumber(key: string): number {
  try {
    return Number(window.localStorage.getItem(key) ?? 0) || 0;
  } catch {
    return 0;
  }
}

function saveNumber(key: string, value: number): void {
  try {
    window.localStorage.setItem(key, String(value));
  } catch {
    // storage unavailable — keep in-memory value
  }
}

/** Badge refunds for retired cape/hat cosmetics removed from the shop. */
const RETIRED_GEAR_REFUNDS: Record<string, number> = {
  safety_cap: 150,
  hero_cape: 400,
  gold_cap: 1200,
  sign_master_cape: 0,
};

const storedGear = loadGear();
const validGearIds = new Set<string>(GEAR_ITEMS.map((g) => g.id));
const initialGearOwned = storedGear.owned.filter((id) => validGearIds.has(id));
const initialGearEquipped: Partial<Record<GearSlot, string>> = {};
for (const [slot, id] of Object.entries(storedGear.equipped)) {
  const item = gearById(id);
  if (item && item.slot === slot && initialGearOwned.includes(id)) initialGearEquipped[item.slot] = id;
}
let initialWallet = loadNumber(WALLET_KEY);
if (initialGearOwned.length !== storedGear.owned.length) {
  const refund = storedGear.owned.reduce((sum, id) => sum + (RETIRED_GEAR_REFUNDS[id] ?? 0), 0);
  if (refund > 0) {
    initialWallet += refund;
    saveNumber(WALLET_KEY, initialWallet);
  }
  saveGear({ owned: initialGearOwned, equipped: initialGearEquipped as Record<string, string> });
}

let state: GameUIState = {
  phase: "menu",
  score: 0,
  tokens: 0,
  best: loadNumber(BEST_KEY),
  wallet: initialWallet,
  speedKmh: 0,
  multiplier: 1,
  comboPct: 0,
  power: null,
  rush: null,
  signal: null,
  distraction: null,
  quiz: null,
  tip: null,
  popups: [],
  lastRun: null,
  missions: loadMissions().map(toMissionUI),
  xp: loadXp(),
  stickers: loadStickers(),
  gearOwned: initialGearOwned,
  gearEquipped: initialGearEquipped,
};

const listeners = new Set<() => void>();
let tipCounter = 0;
let tipTimeout: number | undefined;
let popupCounter = 0;

function emit(next: Partial<GameUIState>): void {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

function persistGear(): void {
  saveGear({ owned: state.gearOwned, equipped: state.gearEquipped as Record<string, string> });
}

export const gameStore = {
  get: (): GameUIState => state,
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  startGame(): void {
    emit({
      phase: "playing",
      score: 0,
      tokens: 0,
      speedKmh: 0,
      multiplier: 1,
      comboPct: 0,
      power: null,
      rush: null,
      signal: null,
      distraction: null,
      quiz: null,
      tip: null,
      popups: [],
      missions: state.missions.map((m) => ({ ...m, progress: 0, done: false })),
    });
  },
  backToMenu(): void {
    emit({ phase: "menu", power: null, tip: null, signal: null, distraction: null, quiz: null });
  },
  syncHud(
    partial: Pick<GameUIState, "score" | "tokens" | "speedKmh" | "multiplier" | "comboPct">,
  ): void {
    emit(partial);
  },
  setPower(power: PowerUpUI | null): void {
    emit({ power });
  },
  setRush(rush: RushUI | null): void {
    emit({ rush });
  },
  setSignal(signal: SignalUI | null): void {
    emit({ signal });
  },
  setDistraction(distraction: DistractionUI | null): void {
    emit({ distraction });
  },
  /** Freezes the world behind the quiz overlay and shows the question. */
  startQuiz(quiz: QuizQuestion): void {
    emit({ phase: "quiz", quiz });
  },
  /** Back into the run after a correct quiz answer. */
  resumeRun(): void {
    emit({ phase: "playing", quiz: null, signal: null });
  },
  /**
   * Adds Safety XP and persists it. Returns the new rank name when the
   * player just ranked up, else null.
   */
  addXp(amount: number): string | null {
    const before = rankIndexFor(state.xp);
    const xp = state.xp + amount;
    const after = rankIndexFor(xp);
    saveXp(xp);
    emit({ xp });
    return after > before ? RANKS[after].name : null;
  },
  /** Unlocks a sign sticker. Returns true when it was NEW. */
  unlockSticker(id: string): boolean {
    if (state.stickers.includes(id)) return false;
    const stickers = [...state.stickers, id];
    saveStickers(stickers);
    emit({ stickers });
    return true;
  },
  /** Buys a gear item with wallet badges (or claims the sticker reward). */
  buyGear(id: string): boolean {
    const item = gearById(id);
    if (!item || state.gearOwned.includes(id)) return false;
    if (item.stickerReward) {
      if (!stickerBookComplete(state.stickers)) return false;
    } else {
      if (state.wallet < item.price) return false;
      saveNumber(WALLET_KEY, state.wallet - item.price);
    }
    const gearOwned = [...state.gearOwned, id];
    const gearEquipped = { ...state.gearEquipped, [item.slot]: id };
    emit({
      wallet: item.stickerReward ? state.wallet : state.wallet - item.price,
      gearOwned,
      gearEquipped,
    });
    persistGear();
    return true;
  },
  /** Equips an owned item into its slot, or unequips it when already worn. */
  toggleEquip(id: string): void {
    const item = gearById(id);
    if (!item || !state.gearOwned.includes(id)) return;
    const gearEquipped = { ...state.gearEquipped };
    if (gearEquipped[item.slot] === id) delete gearEquipped[item.slot];
    else gearEquipped[item.slot] = id;
    emit({ gearEquipped });
    persistGear();
  },
  /**
   * Updates mission progress from the latest run stats. Returns missions that
   * JUST completed so the runtime can pay out; emits only on real changes.
   */
  reportRunStats(stats: RunStats): MissionUI[] {
    const justDone: MissionUI[] = [];
    let changed = false;
    const missions = state.missions.map((m) => {
      const progress = Math.min(stats[STAT_BY_TYPE[m.type]], m.target);
      if (progress === m.progress) return m;
      changed = true;
      const done = m.done || progress >= m.target;
      const next = { ...m, progress, done };
      if (done && !m.done) justDone.push(next);
      return next;
    });
    if (changed) emit({ missions });
    return justDone;
  },
  showTip(text: string, color: string): void {
    tipCounter += 1;
    emit({ tip: { id: tipCounter, text, color } });
    if (tipTimeout) window.clearTimeout(tipTimeout);
    tipTimeout = window.setTimeout(() => emit({ tip: null }), 4200);
  },
  /** Fire-and-forget floating reward text; removes itself after 1.6s. */
  pushPopup(text: string, color: string): void {
    popupCounter += 1;
    const popup: PopupUI = { id: popupCounter, text, color };
    emit({ popups: [...state.popups, popup].slice(-4) });
    window.setTimeout(() => {
      emit({ popups: state.popups.filter((p) => p.id !== popup.id) });
    }, 1600);
  },
  gameOver(result: {
    score: number;
    tokens: number;
    distance: number;
    crashReason: CrashReason | null;
    xpEarned: number;
    newRank: string | null;
    stickersFound: number;
    focused: boolean;
  }): void {
    const isBest = result.score > state.best;
    const best = Math.max(state.best, result.score);
    const wallet = state.wallet + result.tokens;
    saveNumber(BEST_KEY, best);
    saveNumber(WALLET_KEY, wallet);
    const stars = STAR_THRESHOLDS.filter((t) => result.score >= t).length;
    const nextStarAt = stars < STAR_THRESHOLDS.length ? STAR_THRESHOLDS[stars] : null;
    const missionsDone = state.missions.filter((m) => m.done).length;
    // Completed goals graduate to their next tier (or rotate to a new type).
    const activeTypes = state.missions.map((m) => m.type);
    const advanced = state.missions.map((m) =>
      m.done ? toMissionUI(advanceMission({ type: m.type, tier: m.tier }, activeTypes)) : m,
    );
    saveMissions(advanced.map((m) => ({ type: m.type, tier: m.tier })));
    emit({
      phase: "over",
      best,
      wallet,
      power: null,
      rush: null,
      signal: null,
      distraction: null,
      quiz: null,
      popups: [],
      lastRun: { ...result, isBest, stars, nextStarAt, missionsDone },
      missions: advanced,
    });
  },
};

export function useGameUI(): GameUIState {
  return useSyncExternalStore(gameStore.subscribe, gameStore.get);
}
