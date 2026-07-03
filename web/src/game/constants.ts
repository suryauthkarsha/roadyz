export const LANES: number[] = [-3.2, 0, 3.2];
export const LANE_COUNT = 3;
export const LANE_WIDTH = 3.2;
/** Player carriageway: 3 wide lanes of a divided arterial road. */
export const ROAD_WIDTH = 10.4;
/** Right-side pedestrian footpath centerline (footpath power-up target). */
export const FOOTPATH_X = 7.1;
/** Raised median divider between the two carriageways. */
export const MEDIAN_X = -6.1;
export const MEDIAN_W = 1.8;
/** Oncoming carriageway (visual traffic flowing toward the camera). */
export const ONCOMING_ROAD_X = -12.2;
export const ONCOMING_ROAD_W = 10.4;
export const ONCOMING_LANES: number[] = [-8.7, -11.7, -14.7];

export const SEGMENT_LENGTH = 30;
export const SEGMENT_COUNT = 8;
export const SPAWN_Z = -170;
export const DESPAWN_Z = 14;

export const START_SPEED = 13;
export const MAX_SPEED = 45;
/** Endless linear creep added on top of the early exponential ramp (m/s per s). */
export const SPEED_RAMP = 0.16;
/** Speed gained quickly during the first minute (m/s). */
export const EARLY_RAMP_GAIN = 10;
export const EARLY_RAMP_TAU = 35;

export const GRAVITY = -34;
/** High enough to clear cars (roof ~1.5m) and even autos (~1.9m) near the apex. */
export const JUMP_VELOCITY = 12.2;
export const SLIDE_DURATION = 0.85;
export const LANE_LERP = 12;

export const POWERUP_DURATION = 8;
/**
 * Full day/night loop length. Long enough that a typical run stays in
 * daylight for minutes before golden hour rolls in — night is a treat, not
 * the default.
 */
export const DAY_CYCLE_SECONDS = 300;

/** Combo window: another badge within this many seconds keeps the chain alive. */
export const COMBO_WINDOW = 3.2;
/** Badges needed per combo multiplier tier (x2, x3, ...). */
export const COMBO_TIER_SIZE = 6;
export const MAX_MULTIPLIER = 5;
/** Distance between celebration milestones (metres). */
export const MILESTONE_STEP = 250;
export const MILESTONE_BONUS = 150;
/** Base score for one Safety Badge. */
export const TOKEN_POINTS = 25;

/** Reward when a vehicle whooshes past within a whisker of the runner. */
export const NEAR_MISS_BONUS = 30;
/** Rare spinning Golden Cone collectible. */
export const GOLDEN_CONE_POINTS = 150;
export const GOLDEN_CONE_BADGES = 5;

/** Badge Rush frenzy: token-flooded seconds with doubled badge points. */
export const RUSH_DURATION = 8;
export const RUSH_FIRST_AT = 380;
export const RUSH_INTERVAL_MIN = 480;
export const RUSH_INTERVAL_VAR = 240;

/** Instant payout when a mission goal is completed mid-run. */
export const MISSION_BONUS = 250;
export const MISSION_BADGES = 10;

/** Traffic signal crossings: brake at red, cross on green. */
export const SIGNAL_FIRST_AT = 200;
export const SIGNAL_INTERVAL_MIN = 400;
export const SIGNAL_INTERVAL_VAR = 260;
/** Fraction of signal events that stay green (positive reinforcement). */
export const SIGNAL_GREEN_CHANCE = 0.35;
/** Light flips amber / red when the crossing gets this close (z metres). */
export const SIGNAL_AMBER_Z = -108;
export const SIGNAL_RED_Z = -86;
/** Where the runner's nose halts relative to the stop line. */
export const SIGNAL_STOP_Z = -2.1;
/** Seconds waiting at red (pedestrians cross) before green. */
export const SIGNAL_WAIT = 2.4;
export const PERFECT_STOP_BONUS = 150;
export const GREEN_CROSS_BONUS = 25;

/** Phone trap: a tempting pickup that punishes distraction. */
export const PHONE_FIRST_AT = 150;
export const PHONE_INTERVAL_MIN = 260;
export const PHONE_INTERVAL_VAR = 220;
export const PHONE_PENALTY = 60;
export const DISTRACTION_SECONDS = 2.4;

/** Collectible road-sign stickers for the album. */
export const SIGN_FIRST_AT = 90;
export const SIGN_INTERVAL_MIN = 320;
export const SIGN_INTERVAL_VAR = 240;
export const STICKER_DUP_BADGES = 5;

/** Quiz revive: one second chance per run for a correct answer. */
export const QUIZ_SECONDS = 8;
export const REVIVE_SHIELD = 2.2;

/** Safety XP awards — earned only through SAFE behaviour. */
export const XP_PERFECT_STOP = 30;
export const XP_GREEN_CROSS = 5;
export const XP_STICKER = 15;
export const XP_QUIZ = 25;
export const XP_MISSION = 20;
export const XP_POWERUP = 8;
export const XP_FOCUSED_RUN = 20;

export type CrashReason = "vehicle" | "cones" | "gantry" | "redlight";

export const CRASH_LESSONS: Record<CrashReason, { title: string; lesson: string }> = {
  vehicle: {
    title: "OUCH! HIT BY TRAFFIC",
    lesson: "Keep a safe gap from moving vehicles \u2014 dodge early, not late!",
  },
  cones: {
    title: "CRASHED INTO THE CONES",
    lesson: "Cones mean road work \u2014 slow down and steer around them.",
  },
  gantry: {
    title: "BONKED THE BARRIER",
    lesson: "See a low barrier? Duck under it in time!",
  },
  redlight: {
    title: "YOU RAN A RED LIGHT!",
    lesson: "Red means STOP. Waiting for green keeps everyone safe.",
  },
};

export const PLAYER_HEIGHT = 1.55;

export type PowerUpType = "footpath" | "cycle" | "jacket";

export const POWERUP_INFO: Record<PowerUpType, { label: string; tip: string; color: string }> = {
  footpath: {
    label: "Footpath Mode",
    tip: "Footpaths keep walkers safe — always use them when available!",
    color: "#34d399",
  },
  cycle: {
    label: "Cycle Sprint",
    tip: "Protected cycle tracks make riding fast AND safe. Helmet on!",
    color: "#38bdf8",
  },
  jacket: {
    label: "Reflective Jacket",
    tip: "Bright, reflective clothing keeps you visible to every driver at night.",
    color: "#fbbf24",
  },
};

export const SAFETY_SLOGANS: string[] = [
  "WEAR YOUR HELMET",
  "SLOW DOWN, SAVE LIVES",
  "LOOK BOTH WAYS",
  "USE THE FOOTPATH",
  "STOP AT RED",
  "LET PEDESTRIANS CROSS",
  "DON'T TEXT & WALK",
  "RESPECT CYCLISTS",
  "SAFE ROADS SAVE LIVES",
  "BE VISIBLE AT NIGHT",
  "FOLLOW TRAFFIC SIGNALS",
];
