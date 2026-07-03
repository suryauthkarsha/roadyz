import {
  COMBO_TIER_SIZE,
  COMBO_WINDOW,
  CrashReason,
  DAY_CYCLE_SECONDS,
  DESPAWN_Z,
  DISTRACTION_SECONDS,
  EARLY_RAMP_GAIN,
  EARLY_RAMP_TAU,
  FOOTPATH_X,
  GOLDEN_CONE_BADGES,
  GOLDEN_CONE_POINTS,
  GRAVITY,
  GREEN_CROSS_BONUS,
  JUMP_VELOCITY,
  LANES,
  LANE_LERP,
  MAX_MULTIPLIER,
  MAX_SPEED,
  MILESTONE_BONUS,
  MILESTONE_STEP,
  MISSION_BADGES,
  MISSION_BONUS,
  NEAR_MISS_BONUS,
  PERFECT_STOP_BONUS,
  PHONE_FIRST_AT,
  PHONE_INTERVAL_MIN,
  PHONE_INTERVAL_VAR,
  PHONE_PENALTY,
  POWERUP_DURATION,
  POWERUP_INFO,
  PowerUpType,
  REVIVE_SHIELD,
  ROAD_WIDTH,
  RUSH_DURATION,
  RUSH_FIRST_AT,
  RUSH_INTERVAL_MIN,
  RUSH_INTERVAL_VAR,
  SIGN_FIRST_AT,
  SIGN_INTERVAL_MIN,
  SIGN_INTERVAL_VAR,
  SIGNAL_AMBER_Z,
  SIGNAL_FIRST_AT,
  SIGNAL_GREEN_CHANCE,
  SIGNAL_INTERVAL_MIN,
  SIGNAL_INTERVAL_VAR,
  SIGNAL_RED_Z,
  SIGNAL_STOP_Z,
  SIGNAL_WAIT,
  SLIDE_DURATION,
  SPAWN_Z,
  SPEED_RAMP,
  START_SPEED,
  STICKER_DUP_BADGES,
  TOKEN_POINTS,
  XP_FOCUSED_RUN,
  XP_GREEN_CROSS,
  XP_MISSION,
  XP_PERFECT_STOP,
  XP_POWERUP,
  XP_QUIZ,
  XP_STICKER,
} from "./constants";
import { audio } from "./audio";
import { gameStore } from "./store";
import { SIGNS } from "./signs";
import { makeSignQuiz } from "./quiz";
import { RANKS, rankIndexFor } from "./progression";

export type EntityKind =
  | "auto"
  | "bus"
  | "car"
  | "moto"
  | "cones"
  | "gantry"
  | "token"
  | "golden"
  | "phone"
  | "sign"
  | "p_footpath"
  | "p_cycle"
  | "p_jacket";

export interface Entity {
  id: number;
  kind: EntityKind;
  lane: number;
  x: number;
  y: number;
  z: number;
  /** Own forward speed of the vehicle (reduces approach rate). */
  own: number;
  active: boolean;
  taken: boolean;
  bouncing: boolean;
  /** Awarded a clean-jump bonus already (once per obstacle). */
  cleared: boolean;
  /** Awarded a close-call bonus already; phones reuse it as the "rang" flag. */
  nearMissed: boolean;
  /** Generic per-entity variant (sign pickups: index into SIGNS). */
  variant: number;
  vx: number;
  vy: number;
  vz: number;
  spin: number;
}

export interface PickupFx {
  active: boolean;
  x: number;
  y: number;
  z: number;
  t: number;
  color: string;
}

export type PlayerAnim = "idle" | "run" | "jump" | "slide" | "crash";

export type SignalState = "green" | "amber" | "red" | "go";

interface HazardDims {
  w: number;
  h: number;
  d: number;
  jumpClearY?: number;
}

/**
 * jumpClearY: minimum player height that sails clean over the obstacle.
 * Cars and autos are jumpable (autos only near the jump apex — a skill move);
 * buses stay too tall to jump, so kids learn some traffic you simply dodge.
 */
const HAZARDS: Partial<Record<EntityKind, HazardDims>> = {
  auto: { w: 1.6, h: 1.9, d: 2.8, jumpClearY: 1.55 },
  bus: { w: 2.3, h: 3.1, d: 9.2 },
  car: { w: 1.8, h: 1.5, d: 4.0, jumpClearY: 1.15 },
  moto: { w: 1.05, h: 1.75, d: 2.3, jumpClearY: 1.35 },
  cones: { w: 2.6, h: 0.85, d: 0.7, jumpClearY: 0.9 },
};

const JUMP_CLEAR_BONUS = 40;
const JUMPABLE_VEHICLES: EntityKind[] = ["auto", "car", "moto"];
const HAZARD_KINDS: EntityKind[] = ["auto", "bus", "car", "moto", "cones", "gantry"];

const POOL_SIZE = 110;
const FX_POOL = 10;

function makeEntity(id: number): Entity {
  return {
    id,
    kind: "token",
    lane: 1,
    x: 0,
    y: 0,
    z: SPAWN_Z,
    own: 0,
    active: false,
    taken: false,
    bouncing: false,
    cleared: false,
    nearMissed: false,
    variant: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    spin: 0,
  };
}

export const runtime = {
  phase: "menu" as "menu" | "playing" | "quiz" | "over",
  elapsed: 0,
  distance: 0,
  speed: 0,
  baseSpeed: START_SPEED,
  scroll: 0,
  dayT: 0.22,
  night: 0,
  shake: 0,
  tokens: 0,
  score: 0,
  /** Score earned from badges, combos, milestones and bounces. */
  bonusScore: 0,
  /** Consecutive badges collected without letting the combo window lapse. */
  combo: 0,
  comboTimer: 0,
  multiplier: 1,
  nextMilestone: MILESTONE_STEP,
  /** Incremented to fire a confetti celebration burst at the player. */
  celebrationToken: 0,
  /** Badge Rush frenzy window (elapsed-seconds clock). */
  rushUntil: 0,
  rushOn: false,
  nextRushAt: RUSH_FIRST_AT,
  /**
   * Traffic-signal crossing event: the stop line travels from SPAWN_Z toward
   * the player like an entity; the light flips green→amber→red by distance,
   * braking uses real decel physics that guarantees a stop at the line.
   */
  signal: {
    active: false,
    /** Stop-line position, player-relative (0 = at the runner's nose). */
    z: SPAWN_Z,
    state: "green" as SignalState,
    /** Event spawned as a stays-green crossing (positive reinforcement). */
    greenPass: false,
    /** Green banner shown for a green-pass event. */
    notified: false,
    braking: false,
    stopped: false,
    resolved: false,
    waitT: 0,
    brakeSpeed: 0,
    /** 0→1 speed recovery after the light turns green. */
    resume: 1,
    /** Increments per event so visuals (crossers) can reset. */
    eventId: 0,
  },
  nextSignalAt: SIGNAL_FIRST_AT,
  nextPhoneAt: PHONE_FIRST_AT,
  nextSignAt: SIGN_FIRST_AT,
  /** Phone-trap distraction window (elapsed-seconds clock). */
  distractedUntil: 0,
  /** Post-revive invulnerability window (elapsed-seconds clock). */
  shieldUntil: 0,
  /** One quiz revive per run. */
  reviveUsed: false,
  pendingReason: null as CrashReason | null,
  /** Safety XP earned this run (for the run report). */
  xpRun: 0,
  startRankIndex: 0,
  /** Per-run stats feeding the mission system. */
  stats: {
    cleanJumps: 0,
    powerups: 0,
    nearMisses: 0,
    golden: 0,
    perfectStops: 0,
    phonesSeen: 0,
    phonesGrabbed: 0,
    stickersFound: 0,
  },
  player: {
    lane: 1,
    x: 0,
    y: 0,
    vy: 0,
    jumping: false,
    slideTimer: 0,
    anim: "idle" as PlayerAnim,
    animToken: 0,
  },
  power: { type: null as PowerUpType | null, until: 0 },
  entities: Array.from({ length: POOL_SIZE }, (_, i) => makeEntity(i)),
  fx: Array.from({ length: FX_POOL }, () => ({ active: false, x: 0, y: 0, z: 0, t: 0, color: "#fff" }) as PickupFx),
  nextSpawnAt: 30,
  lastPowerAt: -180,
  syncTimer: 0,
};

function spawn(kind: EntityKind, lane: number, z: number, own = 0): Entity | null {
  const e = runtime.entities.find((en) => !en.active);
  if (!e) return null;
  e.kind = kind;
  e.lane = lane;
  e.x = LANES[lane];
  e.y = 0;
  e.z = z;
  e.own = own;
  e.active = true;
  e.taken = false;
  e.bouncing = false;
  e.cleared = false;
  e.nearMissed = false;
  e.variant = 0;
  e.vx = 0;
  e.vy = 0;
  e.vz = 0;
  e.spin = 0;
  return e;
}

function freeLanes(blocked: number[]): number[] {
  return [0, 1, 2].filter((l) => !blocked.includes(l));
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function spawnTokenLine(lane: number, z: number, count: number): void {
  for (let i = 0; i < count; i++) spawn("token", lane, z - i * 3);
}

function spawnTokenArc(lane: number, z: number): void {
  const heights = [0.2, 0.9, 1.5, 1.8, 1.5, 0.9, 0.2];
  heights.forEach((h, i) => {
    const e = spawn("token", lane, z - i * 2.2);
    if (e) e.y = h;
  });
}

function spawnTrafficWave(z: number): void {
  // Challenge ramp: double-blocked lanes appear earlier and more often the
  // farther the run goes — kids feel the road getting busier.
  const doubleChance = runtime.distance > 300 ? Math.min(0.72, 0.3 + runtime.distance / 3000) : 0;
  const blockCount = Math.random() < doubleChance ? 2 : 1;
  const blocked: number[] = [];
  while (blocked.length < blockCount) {
    const lane = Math.floor(Math.random() * 3);
    if (!blocked.includes(lane)) blocked.push(lane);
  }
  blocked.forEach((lane, i) => {
    const kind = pick<EntityKind>(["auto", "auto", "car", "car", "moto", "bus"]);
    const ownFrac = kind === "bus" ? 0.34 : kind === "moto" ? 0.55 : 0.45;
    spawn(kind, lane, z - i * 10 - Math.random() * 6, runtime.speed * ownFrac);
  });
  const free = freeLanes(blocked);
  if (free.length > 0 && Math.random() < 0.85) spawnTokenLine(pick(free), z - 2, 5);
}

function spawnConeSlalom(z: number): void {
  const laneA = Math.floor(Math.random() * 3);
  let laneB = Math.floor(Math.random() * 3);
  if (laneB === laneA) laneB = (laneA + 1) % 3;
  spawn("cones", laneA, z);
  spawn("cones", laneB, z - 16);
  spawnTokenArc(laneA, z - 4);
  // Long runs earn a third cone row — a proper slalom.
  if (runtime.distance > 800) {
    const laneC = [0, 1, 2].find((l) => l !== laneB) ?? 0;
    spawn("cones", laneC, z - 32);
    spawnTokenLine(laneB, z - 22, 3);
  }
}

function spawnGantry(z: number): void {
  spawn("gantry", 1, z);
  const lane = Math.floor(Math.random() * 3);
  spawnTokenLine(lane, z - 4, 4);
}

function spawnTokenTrail(z: number): void {
  const lane = Math.floor(Math.random() * 3);
  if (Math.random() < 0.5) spawnTokenArc(lane, z);
  else spawnTokenLine(lane, z, 7);
  if (Math.random() < 0.4) {
    const other = (lane + pick([1, 2])) % 3;
    spawn(pick<EntityKind>(["auto", "car"]), other, z - 8, runtime.speed * 0.45);
  }
  // Rare treasure at the end of the trail — worth sprinting for.
  if (Math.random() < 0.14) spawnGolden(lane, z - 20);
}

function spawnGolden(lane: number, z: number): void {
  const e = spawn("golden", lane, z);
  if (e) e.y = 0.55;
}

/**
 * Badge Rush pattern: lanes flooded with badges, barely any traffic — an
 * all-out collect frenzy while the ×2 window lasts.
 */
function spawnRushPattern(z: number): void {
  const laneA = Math.floor(Math.random() * 3);
  const laneB = (laneA + 1 + Math.floor(Math.random() * 2)) % 3;
  if (Math.random() < 0.5) spawnTokenArc(laneA, z);
  else spawnTokenLine(laneA, z, 6);
  spawnTokenLine(laneB, z - 3, 5);
  if (Math.random() < 0.3) spawnGolden(pick([laneA, laneB]), z - 17);
  if (Math.random() < 0.2) {
    const laneC = [0, 1, 2].find((l) => l !== laneA && l !== laneB) ?? 0;
    spawn(pick<EntityKind>(["car", "auto"]), laneC, z - 10, runtime.speed * 0.5);
  }
}

function spawnPowerUp(z: number): void {
  const kind = pick<EntityKind>(["p_footpath", "p_cycle", "p_jacket"]);
  const lane = Math.floor(Math.random() * 3);
  const e = spawn(kind, lane, z);
  if (e) e.y = 1.1;
  runtime.lastPowerAt = runtime.distance;
}

/** Tempting ringing phone — grabbing it costs points and blurs the screen. */
function spawnPhone(): void {
  const lane = Math.floor(Math.random() * 3);
  const e = spawn("phone", lane, SPAWN_Z - 20);
  if (e) {
    e.y = 0;
    runtime.stats.phonesSeen += 1;
  }
  runtime.nextPhoneAt = runtime.distance + PHONE_INTERVAL_MIN + Math.random() * PHONE_INTERVAL_VAR;
}

/** Collectible sign sticker, biased toward signs the album still needs. */
function spawnSignPickup(): void {
  const stickers = gameStore.get().stickers;
  const missing: number[] = [];
  SIGNS.forEach((s, i) => {
    if (!stickers.includes(s.id)) missing.push(i);
  });
  const variant =
    missing.length > 0 && Math.random() < 0.8 ? pick(missing) : Math.floor(Math.random() * SIGNS.length);
  const lane = Math.floor(Math.random() * 3);
  const e = spawn("sign", lane, SPAWN_Z - 26);
  if (e) e.variant = variant;
  runtime.nextSignAt = runtime.distance + SIGN_INTERVAL_MIN + Math.random() * SIGN_INTERVAL_VAR;
}

/** Arms a new signal-crossing event travelling in from the horizon. */
function spawnSignal(): void {
  const sig = runtime.signal;
  sig.active = true;
  sig.z = SPAWN_Z;
  sig.state = "green";
  sig.greenPass = Math.random() < SIGNAL_GREEN_CHANCE;
  sig.notified = false;
  sig.braking = false;
  sig.stopped = false;
  sig.resolved = false;
  sig.waitT = 0;
  sig.brakeSpeed = 0;
  sig.resume = 1;
  sig.eventId += 1;
  runtime.nextSignalAt = runtime.distance + SIGNAL_INTERVAL_MIN + Math.random() * SIGNAL_INTERVAL_VAR;
}

function spawnPattern(): void {
  const z = SPAWN_Z;
  if (runtime.signal.active) {
    // Calm junction corridor: badges only — kids focus on the light.
    if (Math.random() < 0.7) spawnTokenLine(Math.floor(Math.random() * 3), z, 5);
    return;
  }
  if (runtime.rushOn) {
    spawnRushPattern(z);
    return;
  }
  if (runtime.distance - runtime.lastPowerAt > 320) {
    spawnPowerUp(z);
    return;
  }
  const r = Math.random();
  if (r < 0.42) spawnTrafficWave(z);
  else if (r < 0.62) spawnConeSlalom(z);
  else if (r < 0.78) spawnGantry(z);
  else spawnTokenTrail(z);
}

function addFx(x: number, y: number, z: number, color: string): void {
  const fx = runtime.fx.find((f) => !f.active);
  if (!fx) return;
  fx.active = true;
  fx.x = x;
  fx.y = y;
  fx.z = z;
  fx.t = 0;
  fx.color = color;
}

function setAnim(anim: PlayerAnim): void {
  if (runtime.player.anim !== anim) {
    runtime.player.anim = anim;
    runtime.player.animToken += 1;
  }
}

/** Adds Safety XP, fires the popup and handles license rank-ups. */
function awardXp(amount: number): void {
  runtime.xpRun += amount;
  const rankUp = gameStore.addXp(amount);
  if (amount >= 15) gameStore.pushPopup(`+${amount} SAFETY XP`, "#4ade80");
  if (rankUp) {
    runtime.celebrationToken += 1;
    gameStore.pushPopup(`RANK UP! ${rankUp.toUpperCase()}`, "#4ade80");
    gameStore.showTip(`Your Safety License is now ${rankUp}! Keep making safe choices.`, "#4ade80");
    audio.play("fanfare", { volume: 0.85 });
  }
}

function activatePower(type: PowerUpType): void {
  runtime.power.type = type;
  runtime.power.until = runtime.elapsed + POWERUP_DURATION;
  audio.play("powerup", { volume: 0.8 });
  const info = POWERUP_INFO[type];
  gameStore.showTip(info.tip, info.color);
  gameStore.setPower({
    type,
    expiresAt: Date.now() + POWERUP_DURATION * 1000,
    durationMs: POWERUP_DURATION * 1000,
  });
}

function clearPower(): void {
  runtime.power.type = null;
  gameStore.setPower(null);
}

function computeScore(): number {
  return Math.floor(runtime.distance * 2) + runtime.bonusScore;
}

/** Combo tier: every COMBO_TIER_SIZE badges bumps the multiplier a step. */
function comboMultiplier(combo: number): number {
  return Math.min(MAX_MULTIPLIER, 1 + Math.floor(combo / COMBO_TIER_SIZE));
}

function collectToken(e: Entity): void {
  e.taken = true;
  e.active = false;
  runtime.combo += 1;
  runtime.comboTimer = COMBO_WINDOW;
  const nextMult = comboMultiplier(runtime.combo);
  if (nextMult > runtime.multiplier) {
    runtime.multiplier = nextMult;
    gameStore.pushPopup(`COMBO ×${nextMult}!`, "#fbbf24");
    audio.play("powerup", { volume: 0.35, rate: 1.25 + nextMult * 0.08 });
  }
  const badges = runtime.power.type === "footpath" ? 2 : 1;
  const rushX = runtime.rushOn ? 2 : 1;
  runtime.tokens += badges;
  runtime.bonusScore += TOKEN_POINTS * badges * runtime.multiplier * rushX;
  addFx(e.x, e.y + 0.6, 0, "#fbbf24");
  // Ascending pitch as the chain grows — candy for the ears.
  audio.play("collect", { volume: 0.45, rate: 0.95 + Math.min(runtime.combo, 14) * 0.035 });
}

/** Phone trap sprung: blurred screen, broken combo, lost points. */
function grabPhone(e: Entity): void {
  e.taken = true;
  e.active = false;
  runtime.stats.phonesGrabbed += 1;
  runtime.distractedUntil = runtime.elapsed + DISTRACTION_SECONDS;
  runtime.combo = 0;
  runtime.comboTimer = 0;
  runtime.multiplier = 1;
  runtime.bonusScore = Math.max(0, runtime.bonusScore - PHONE_PENALTY);
  runtime.shake = Math.max(runtime.shake, 0.4);
  audio.play("buzz", { volume: 0.8 });
  gameStore.pushPopup(`DISTRACTED! -${PHONE_PENALTY}`, "#f87171");
  gameStore.showTip("Never use a phone on the road — eyes up, phone away!", "#f87171");
  gameStore.setDistraction({
    expiresAt: Date.now() + DISTRACTION_SECONDS * 1000,
    durationMs: DISTRACTION_SECONDS * 1000,
  });
}

/** Sign sticker collected: new stickers fill the album, dupes pay badges. */
function collectSign(e: Entity): void {
  e.taken = true;
  e.active = false;
  const def = SIGNS[e.variant] ?? SIGNS[0];
  addFx(e.x, 1.2, 0, "#5eead4");
  const isNew = gameStore.unlockSticker(def.id);
  if (isNew) {
    runtime.stats.stickersFound += 1;
    runtime.celebrationToken += 1;
    audio.play("sticker", { volume: 0.75 });
    gameStore.pushPopup(`NEW STICKER: ${def.name.toUpperCase()}!`, "#5eead4");
    gameStore.showTip(`${def.name}: ${def.meaning}`, "#5eead4");
    awardXp(XP_STICKER);
  } else {
    runtime.tokens += STICKER_DUP_BADGES;
    audio.play("collect", { volume: 0.5, rate: 1.3 });
    gameStore.pushPopup(`STICKER SWAP +${STICKER_DUP_BADGES} BADGES`, "#fbbf24");
  }
}

function hitMilestone(): void {
  runtime.bonusScore += MILESTONE_BONUS;
  runtime.celebrationToken += 1;
  gameStore.pushPopup(`${runtime.nextMilestone}m! +${MILESTONE_BONUS}`, "#34d399");
  audio.play("milestone", { volume: 0.7 });
  runtime.nextMilestone += MILESTONE_STEP;
}

/**
 * Crash → one quiz revive per run (answer a road-sign question to get back
 * up), otherwise straight to the run report with the lesson learned.
 */
function crash(reason: CrashReason): void {
  audio.play("crash", { volume: 0.9 });
  audio.stopMusic();
  runtime.shake = 1;
  runtime.rushOn = false;
  runtime.rushUntil = 0;
  gameStore.setRush(null);
  setAnim("crash");
  runtime.score = computeScore();
  if (!runtime.reviveUsed) {
    runtime.reviveUsed = true;
    runtime.pendingReason = reason;
    runtime.phase = "quiz";
    gameStore.startQuiz(makeSignQuiz());
    return;
  }
  finalizeGameOver(reason);
}

function finalizeGameOver(reason: CrashReason): void {
  runtime.phase = "over";
  const focused = runtime.stats.phonesSeen > 0 && runtime.stats.phonesGrabbed === 0;
  if (focused) awardXp(XP_FOCUSED_RUN);
  const rankNow = rankIndexFor(gameStore.get().xp);
  gameStore.gameOver({
    score: runtime.score,
    tokens: runtime.tokens,
    distance: Math.floor(runtime.distance),
    crashReason: reason,
    xpEarned: runtime.xpRun,
    newRank: rankNow > runtime.startRankIndex ? RANKS[rankNow].name : null,
    stickersFound: runtime.stats.stickersFound,
    focused,
  });
}

/**
 * Quiz overlay verdict. Correct → clear the danger zone, brief shield, back
 * into the run. Wrong/timeout → the crash stands.
 */
export function resolveQuiz(correct: boolean): void {
  if (runtime.phase !== "quiz") return;
  const reason = runtime.pendingReason ?? "vehicle";
  if (!correct) {
    audio.play("wrong", { volume: 0.7 });
    finalizeGameOver(reason);
    return;
  }
  audio.play("correct", { volume: 0.8 });
  for (const e of runtime.entities) {
    if (e.active && HAZARD_KINDS.includes(e.kind) && e.z > -50 && e.z < 10) e.active = false;
  }
  // A red-light crash forgives the light: flip it green and roll on.
  const sig = runtime.signal;
  if (sig.active) {
    sig.state = "go";
    sig.stopped = false;
    sig.braking = false;
    sig.resolved = true;
    sig.resume = 0.35;
    gameStore.setSignal(null);
  }
  runtime.shieldUntil = runtime.elapsed + REVIVE_SHIELD;
  runtime.shake = 0;
  runtime.player.jumping = false;
  runtime.player.y = 0;
  runtime.player.vy = 0;
  runtime.player.slideTimer = 0;
  setAnim("run");
  awardXp(XP_QUIZ);
  runtime.celebrationToken += 1;
  runtime.phase = "playing";
  gameStore.resumeRun();
  gameStore.pushPopup("GREAT ANSWER! BACK UP!", "#4ade80");
  audio.restoreMusic();
  audio.startRunAudio();
}

function startRush(): void {
  runtime.rushUntil = runtime.elapsed + RUSH_DURATION;
  runtime.rushOn = true;
  runtime.nextRushAt = runtime.distance + RUSH_INTERVAL_MIN + Math.random() * RUSH_INTERVAL_VAR;
  runtime.celebrationToken += 1;
  gameStore.pushPopup("BADGE RUSH! \u00d72 POINTS", "#fb923c");
  gameStore.setRush({ expiresAt: Date.now() + RUSH_DURATION * 1000, durationMs: RUSH_DURATION * 1000 });
  audio.play("fanfare", { volume: 0.75 });
  audio.setMusicRate(1.09);
}

function endRush(): void {
  runtime.rushOn = false;
  gameStore.setRush(null);
  audio.setMusicRate(1);
}

/** Perfect stop completed: light flips green, reward + Safety XP. */
function grantPerfectStop(): void {
  const sig = runtime.signal;
  sig.state = "go";
  sig.stopped = false;
  sig.resolved = true;
  sig.resume = 0;
  runtime.stats.perfectStops += 1;
  runtime.bonusScore += PERFECT_STOP_BONUS;
  runtime.celebrationToken += 1;
  gameStore.pushPopup(`PERFECT STOP! +${PERFECT_STOP_BONUS}`, "#34d399");
  audio.play("milestone", { volume: 0.7, rate: 1.15 });
  awardXp(XP_PERFECT_STOP);
  gameStore.setSignal({ phase: "go", braking: false });
}

/**
 * Close call: a vehicle fully passes the runner with only a whisker of
 * lateral gap — no contact, big thrill, small reward. Awarded once per
 * vehicle, vehicles only (never cone rows), skipped while on the footpath.
 */
function checkNearMiss(e: Entity, dims: HazardDims): void {
  if (e.nearMissed || e.cleared || e.kind === "cones") return;
  if (runtime.power.type === "footpath") return;
  if (e.z < dims.d / 2 + 0.6 || e.z > dims.d / 2 + 3.4) return;
  const gap = Math.abs(e.x - runtime.player.x) - dims.w / 2;
  if (gap < 0.45 || gap > 1.25) return;
  e.nearMissed = true;
  runtime.stats.nearMisses += 1;
  runtime.bonusScore += NEAR_MISS_BONUS;
  runtime.shake = Math.max(runtime.shake, 0.24);
  gameStore.pushPopup(`CLOSE CALL! +${NEAR_MISS_BONUS}`, "#f472b6");
  audio.play("whoosh", { volume: 0.55, rate: 0.95 + Math.random() * 0.12 });
}

function bounceVehicle(e: Entity): void {
  e.bouncing = true;
  e.taken = true;
  e.vx = (e.x >= runtime.player.x ? 1 : -1) * (6 + Math.random() * 4);
  e.vy = 7 + Math.random() * 3;
  e.vz = -14;
  e.spin = (Math.random() - 0.5) * 8;
  runtime.shake = Math.max(runtime.shake, 0.5);
  addFx(e.x, 1, e.z, "#fbbf24");
  runtime.bonusScore += 40;
  gameStore.pushPopup("SAFE BOUNCE! +40", "#fbbf24");
}

export function resetRun(): void {
  runtime.phase = "playing";
  runtime.elapsed = 0;
  runtime.distance = 0;
  runtime.baseSpeed = START_SPEED;
  runtime.speed = START_SPEED;
  runtime.scroll = 0;
  // Start somewhere in the long morning–midday plateau so every run gets
  // minutes of daylight before golden hour.
  runtime.dayT = 0.12 + Math.random() * 0.2;
  runtime.shake = 0;
  runtime.tokens = 0;
  runtime.score = 0;
  runtime.player.lane = 1;
  runtime.player.x = 0;
  runtime.player.y = 0;
  runtime.player.vy = 0;
  runtime.player.jumping = false;
  runtime.player.slideTimer = 0;
  runtime.player.animToken += 1;
  runtime.player.anim = "run";
  runtime.power.type = null;
  runtime.power.until = 0;
  runtime.bonusScore = 0;
  runtime.combo = 0;
  runtime.comboTimer = 0;
  runtime.multiplier = 1;
  runtime.nextMilestone = MILESTONE_STEP;
  runtime.rushUntil = 0;
  runtime.rushOn = false;
  runtime.nextRushAt = RUSH_FIRST_AT;
  const sig = runtime.signal;
  sig.active = false;
  sig.z = SPAWN_Z;
  sig.state = "green";
  sig.greenPass = false;
  sig.notified = false;
  sig.braking = false;
  sig.stopped = false;
  sig.resolved = false;
  sig.waitT = 0;
  sig.brakeSpeed = 0;
  sig.resume = 1;
  runtime.nextSignalAt = SIGNAL_FIRST_AT + Math.random() * 60;
  runtime.nextPhoneAt = PHONE_FIRST_AT + Math.random() * 80;
  runtime.nextSignAt = SIGN_FIRST_AT + Math.random() * 60;
  runtime.distractedUntil = 0;
  runtime.shieldUntil = 0;
  runtime.reviveUsed = false;
  runtime.pendingReason = null;
  runtime.xpRun = 0;
  runtime.startRankIndex = rankIndexFor(gameStore.get().xp);
  runtime.stats.cleanJumps = 0;
  runtime.stats.powerups = 0;
  runtime.stats.nearMisses = 0;
  runtime.stats.golden = 0;
  runtime.stats.perfectStops = 0;
  runtime.stats.phonesSeen = 0;
  runtime.stats.phonesGrabbed = 0;
  runtime.stats.stickersFound = 0;
  runtime.entities.forEach((e) => (e.active = false));
  runtime.fx.forEach((f) => (f.active = false));
  runtime.nextSpawnAt = runtime.distance + 35;
  runtime.lastPowerAt = runtime.distance - 220;
  runtime.syncTimer = 0;
  gameStore.setRush(null);
  gameStore.setSignal(null);
  gameStore.setDistraction(null);
  audio.setMusicRate(1);
}

export const playerInput = {
  moveLane(dir: -1 | 1): void {
    if (runtime.phase !== "playing") return;
    const next = Math.min(2, Math.max(0, runtime.player.lane + dir));
    runtime.player.lane = next;
  },
  jump(): void {
    if (runtime.phase !== "playing") return;
    const p = runtime.player;
    if (!p.jumping && p.slideTimer <= 0) {
      p.jumping = true;
      p.vy = JUMP_VELOCITY;
      setAnim("jump");
      audio.play("jump", { volume: 0.5 });
    }
  },
  /** Commit to stopping at the approaching red/amber signal. */
  brake(): void {
    if (runtime.phase !== "playing") return;
    const sig = runtime.signal;
    if (!sig.active || sig.braking || sig.stopped || sig.resolved) return;
    if (sig.state !== "red" && sig.state !== "amber") return;
    if (sig.z >= SIGNAL_STOP_Z - 1 || sig.z < -150) return;
    sig.braking = true;
    sig.brakeSpeed = runtime.speed;
    audio.play("brake", { volume: 0.7 });
    gameStore.setSignal({ phase: sig.state === "red" ? "red" : "amber", braking: true });
  },
  slide(): void {
    if (runtime.phase !== "playing") return;
    // At a red/amber light the down input becomes the brake.
    const sig = runtime.signal;
    if (
      sig.active &&
      !sig.braking &&
      !sig.stopped &&
      !sig.resolved &&
      (sig.state === "red" || sig.state === "amber") &&
      sig.z > -150 &&
      sig.z < SIGNAL_STOP_Z - 1
    ) {
      playerInput.brake();
      return;
    }
    const p = runtime.player;
    if (p.jumping) p.vy = -26;
    if (p.slideTimer <= 0) {
      p.slideTimer = SLIDE_DURATION;
      setAnim("slide");
    }
  },
};

/** Advances the whole simulation by dt seconds. Called from the R3F frame loop. */
export function updateRuntime(dt: number): void {
  runtime.shake = Math.max(0, runtime.shake - dt * 1.8);
  runtime.fx.forEach((f) => {
    if (!f.active) return;
    f.t += dt * 2.6;
    if (f.t >= 1) f.active = false;
  });

  if (runtime.phase !== "playing") return;

  const clamped = Math.min(dt, 0.05);
  runtime.elapsed += clamped;
  // Progressive pacing: quick ramp in the first minute, then a relentless
  // linear creep that keeps runs escalating until MAX_SPEED.
  runtime.baseSpeed = Math.min(
    MAX_SPEED,
    START_SPEED +
      EARLY_RAMP_GAIN * (1 - Math.exp(-runtime.elapsed / EARLY_RAMP_TAU)) +
      runtime.elapsed * SPEED_RAMP,
  );
  const cycleBoost = runtime.power.type === "cycle" ? 1.42 : 1;
  runtime.speed = runtime.baseSpeed * cycleBoost;

  // ---- Traffic signal hold: braking physics, red wait, green recovery ----
  const sig = runtime.signal;
  let signalHold = false;
  if (sig.active) {
    if (sig.stopped) {
      runtime.speed = 0;
      signalHold = true;
      sig.waitT -= clamped;
      if (sig.waitT <= 0) grantPerfectStop();
    } else if (sig.braking && sig.state !== "go") {
      signalHold = true;
      const dist = SIGNAL_STOP_Z - sig.z;
      if (dist <= 0.18 || sig.brakeSpeed <= 0.5) {
        sig.brakeSpeed = 0;
        sig.stopped = true;
        sig.waitT = SIGNAL_WAIT;
        gameStore.setSignal({ phase: "waiting", braking: true });
      } else {
        const decel = Math.max(14, (sig.brakeSpeed * sig.brakeSpeed) / (2 * dist));
        sig.brakeSpeed = Math.max(0, sig.brakeSpeed - decel * clamped);
      }
      runtime.speed = Math.min(runtime.speed, sig.brakeSpeed);
    } else if (sig.state === "go" && sig.resume < 1) {
      signalHold = true;
      sig.resume = Math.min(1, sig.resume + clamped * 0.85);
      const r = sig.resume;
      runtime.speed *= r * r * (3 - 2 * r);
      if (sig.resume >= 1) gameStore.setSignal(null);
    }
  }

  runtime.distance += runtime.speed * clamped;
  runtime.scroll = runtime.distance;
  runtime.dayT = (runtime.dayT + clamped / DAY_CYCLE_SECONDS) % 1;

  // Distraction wears off.
  if (runtime.distractedUntil > 0 && runtime.elapsed > runtime.distractedUntil) {
    runtime.distractedUntil = 0;
    gameStore.setDistraction(null);
  }

  if (runtime.distance >= runtime.nextMilestone) hitMilestone();

  // Signal event advance + light transitions (distance-anchored).
  if (sig.active) {
    sig.z += runtime.speed * clamped;
    if (!sig.greenPass) {
      if (sig.state === "green" && sig.z > SIGNAL_AMBER_Z) {
        sig.state = "amber";
        gameStore.setSignal({ phase: "amber", braking: false });
      } else if (sig.state === "amber" && sig.z > SIGNAL_RED_Z) {
        sig.state = "red";
        audio.play("whistle", { volume: 0.7 });
        gameStore.setSignal({ phase: "red", braking: sig.braking });
      }
    } else if (!sig.notified && sig.z > SIGNAL_AMBER_Z) {
      sig.notified = true;
      gameStore.setSignal({ phase: "green", braking: false });
    }
    if (sig.greenPass && !sig.resolved && sig.z > 0.6) {
      sig.resolved = true;
      runtime.bonusScore += GREEN_CROSS_BONUS;
      gameStore.pushPopup(`CROSSED ON GREEN +${GREEN_CROSS_BONUS}`, "#4ade80");
      awardXp(XP_GREEN_CROSS);
      gameStore.setSignal(null);
    }
    if (!sig.greenPass && !sig.resolved && sig.state === "amber" && sig.z > 0.6) {
      // Squeaked through on amber — no reward, no penalty.
      sig.resolved = true;
      gameStore.setSignal(null);
    }
    if (
      sig.state === "red" &&
      !sig.stopped &&
      !sig.resolved &&
      sig.z > 0.5 &&
      runtime.elapsed >= runtime.shieldUntil
    ) {
      crash("redlight");
      return;
    }
    if (sig.z > DESPAWN_Z) {
      sig.active = false;
      gameStore.setSignal(null);
    }
  }

  // Badge Rush scheduling: fires between power-ups, never at a junction.
  if (runtime.rushOn && runtime.elapsed >= runtime.rushUntil) endRush();
  if (!runtime.rushOn && !runtime.power.type && !sig.active && runtime.distance >= runtime.nextRushAt) {
    startRush();
  }
  // Signal scheduling: clear of rush and power-up windows.
  if (!sig.active && !runtime.rushOn && !runtime.power.type && runtime.distance >= runtime.nextSignalAt) {
    spawnSignal();
  }
  // Phone traps + sign stickers ride between the big events.
  if (!sig.active && !runtime.rushOn && runtime.distance >= runtime.nextPhoneAt) spawnPhone();
  if (runtime.distance >= runtime.nextSignAt) spawnSignPickup();

  if (runtime.comboTimer > 0 && !signalHold) {
    runtime.comboTimer -= clamped;
    if (runtime.comboTimer <= 0) {
      runtime.combo = 0;
      runtime.multiplier = 1;
    }
  }

  const p = runtime.player;
  if (p.jumping) {
    p.y += p.vy * clamped;
    p.vy += GRAVITY * clamped;
    if (p.y <= 0) {
      p.y = 0;
      p.jumping = false;
      if (p.slideTimer > 0) setAnim("slide");
      else setAnim("run");
    }
  }
  if (p.slideTimer > 0) {
    p.slideTimer -= clamped;
    if (p.slideTimer <= 0 && !p.jumping) setAnim("run");
  }
  const targetX = runtime.power.type === "footpath" ? FOOTPATH_X : LANES[p.lane];
  p.x += (targetX - p.x) * Math.min(1, LANE_LERP * clamped);

  if (runtime.power.type && runtime.elapsed > runtime.power.until) clearPower();

  while (runtime.distance > runtime.nextSpawnAt) {
    spawnPattern();
    // Patterns pack tighter as the run goes on — the challenge ramp.
    const tighten = Math.min(9, runtime.distance / 260);
    const gap = 27 - tighten + Math.random() * 13 + runtime.speed * 0.55;
    runtime.nextSpawnAt += gap;
  }

  const magnet = runtime.power.type === "cycle" || runtime.power.type === "footpath";

  for (const e of runtime.entities) {
    if (!e.active) continue;

    if (e.bouncing) {
      e.x += e.vx * clamped;
      e.y += e.vy * clamped;
      e.z += (runtime.speed + 4) * clamped + e.vz * clamped;
      e.vy += GRAVITY * 0.6 * clamped;
      if (e.z > DESPAWN_Z || e.y < -3) e.active = false;
      continue;
    }

    e.z += (runtime.speed - e.own) * clamped;
    if (e.z > DESPAWN_Z) {
      e.active = false;
      continue;
    }

    if ((e.kind === "token" || e.kind === "golden" || e.kind === "sign") && magnet && !e.taken) {
      const dz = e.z;
      if (dz > -9 && dz < 2) {
        e.x += (p.x - e.x) * Math.min(1, 10 * clamped);
        e.y += (p.y + 0.8 - e.y) * Math.min(1, 10 * clamped);
      }
    }

    if (e.taken) continue;

    if (e.kind === "token") {
      const dx = e.x - p.x;
      const dy = e.y - (p.y + 0.8);
      if (Math.abs(e.z) < 1.3 && dx * dx + dy * dy < 1.7) {
        collectToken(e);
      }
      continue;
    }

    if (e.kind === "golden") {
      const dx = e.x - p.x;
      const dy = e.y + 0.45 - (p.y + 0.8);
      if (Math.abs(e.z) < 1.5 && dx * dx + dy * dy < 2.3) {
        e.taken = true;
        e.active = false;
        runtime.stats.golden += 1;
        runtime.tokens += GOLDEN_CONE_BADGES;
        runtime.bonusScore += GOLDEN_CONE_POINTS * (runtime.rushOn ? 2 : 1);
        runtime.celebrationToken += 1;
        gameStore.pushPopup(`GOLDEN CONE! +${GOLDEN_CONE_POINTS}`, "#fde047");
        audio.play("fanfare", { volume: 0.6, rate: 1.18 });
        addFx(e.x, e.y + 0.6, 0, "#fde047");
      }
      continue;
    }

    if (e.kind === "phone") {
      // Rings once as it approaches (nearMissed doubles as the rang flag).
      if (!e.nearMissed && e.z > -60) {
        e.nearMissed = true;
        audio.play("ring", { volume: 0.5 });
      }
      const dx = e.x - p.x;
      // Jumping clean over the phone dodges the temptation.
      if (Math.abs(e.z) < 1.3 && Math.abs(dx) < 1.2 && p.y < 1.5) grabPhone(e);
      continue;
    }

    if (e.kind === "sign") {
      const dx = e.x - p.x;
      if (Math.abs(e.z) < 1.5 && Math.abs(dx) < 1.35 && p.y < 2.4) collectSign(e);
      continue;
    }

    if (e.kind === "p_footpath" || e.kind === "p_cycle" || e.kind === "p_jacket") {
      const dx = e.x - p.x;
      if (Math.abs(e.z) < 1.4 && Math.abs(dx) < 1.4) {
        e.taken = true;
        e.active = false;
        addFx(e.x, 1.2, 0, "#a7f3d0");
        const type: PowerUpType =
          e.kind === "p_footpath" ? "footpath" : e.kind === "p_cycle" ? "cycle" : "jacket";
        runtime.stats.powerups += 1;
        awardXp(XP_POWERUP);
        activatePower(type);
      }
      continue;
    }

    if (e.kind === "gantry") {
      if (Math.abs(e.z) < 0.7 && Math.abs(p.x) < ROAD_WIDTH / 2 + 0.5) {
        const ducking = p.slideTimer > 0 && p.y < 0.4;
        if (!ducking) {
          if (runtime.power.type === "jacket" || runtime.power.type === "footpath") continue;
          if (runtime.elapsed < runtime.shieldUntil) continue;
          crash("gantry");
          return;
        }
      }
      continue;
    }

    const dims = HAZARDS[e.kind];
    if (!dims) continue;
    if (runtime.elapsed < runtime.shieldUntil) continue;
    checkNearMiss(e, dims);
    const withinZ = Math.abs(e.z) < dims.d / 2 + 0.45;
    const withinX = Math.abs(e.x - p.x) < dims.w / 2 + 0.45;
    if (withinZ && withinX) {
      if (dims.jumpClearY && p.y > dims.jumpClearY) {
        // Sailing clean over a moving vehicle is a skill moment — reward it.
        if (!e.cleared && JUMPABLE_VEHICLES.includes(e.kind)) {
          e.cleared = true;
          runtime.stats.cleanJumps += 1;
          runtime.bonusScore += JUMP_CLEAR_BONUS;
          gameStore.pushPopup(`CLEAN JUMP! +${JUMP_CLEAR_BONUS}`, "#38bdf8");
          addFx(e.x, dims.h + 0.35, e.z, "#38bdf8");
          audio.play("collect", { volume: 0.32, rate: 1.5 });
        }
        continue;
      }
      if (runtime.power.type === "footpath") continue;
      if (runtime.power.type === "jacket") {
        if (e.kind === "cones") {
          e.active = false;
          addFx(e.x, 0.6, e.z, "#fb923c");
        } else {
          bounceVehicle(e);
        }
        continue;
      }
      if (e.kind === "cones") {
        crash("cones");
        return;
      }
      crash("vehicle");
      return;
    }
  }

  runtime.syncTimer += clamped;
  if (runtime.syncTimer > 0.12) {
    runtime.syncTimer = 0;
    runtime.score = computeScore();
    gameStore.syncHud({
      score: runtime.score,
      tokens: runtime.tokens,
      speedKmh: Math.round(runtime.speed * 3.2),
      multiplier: runtime.multiplier,
      comboPct: runtime.multiplier > 1 ? Math.max(0, runtime.comboTimer / COMBO_WINDOW) : 0,
    });
    // Mission progress + instant payouts for goals completed mid-run.
    const completed = gameStore.reportRunStats({
      badges: runtime.tokens,
      cleanJumps: runtime.stats.cleanJumps,
      distance: Math.floor(runtime.distance),
      powerups: runtime.stats.powerups,
      nearMisses: runtime.stats.nearMisses,
      golden: runtime.stats.golden,
      perfectStops: runtime.stats.perfectStops,
    });
    for (const mission of completed) {
      runtime.bonusScore += MISSION_BONUS;
      runtime.tokens += MISSION_BADGES;
      runtime.celebrationToken += 1;
      gameStore.pushPopup(`MISSION DONE! +${MISSION_BONUS}`, "#a78bfa");
      gameStore.showTip(`Mission complete: ${mission.label}!`, "#a78bfa");
      audio.play("fanfare", { volume: 0.8 });
      awardXp(XP_MISSION);
    }
  }
}
