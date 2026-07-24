export const WORLD_WIDTH = 3600;
export const WORLD_HEIGHT = 3600;

export const CELL_SIZE = 450;
export const ROAD_SIZE = 160;
export const SIDEWALK_SIZE = 18;

export const PLAYER_SIZE = 30;
export const PLAYER_SPEED = 260;
export const PLAYER_SPRINT_SPEED = 410;

export const NPC_COUNT = 30;
export const NPC_SIZE = 16;
export const CAR_COUNT = 42;
export const CAR_LENGTH = 46;
export const CAR_WIDTH = 22;

export const GRID_COLS = Math.floor(WORLD_WIDTH / CELL_SIZE);
export const GRID_ROWS = Math.floor(WORLD_HEIGHT / CELL_SIZE);
export const HIGHWAY_COL = Math.floor(GRID_COLS / 2);
export const HIGHWAY_ROW = Math.floor(GRID_ROWS / 2);

/** How close the player must stand to a building to interact. */
export const INTERACT_DISTANCE = 42;

/** Hunger drops this much every HUNGER_INTERVAL_SEC seconds. */
export const HUNGER_INTERVAL_SEC = 60;
export const HUNGER_DROP_PERCENT = 5;

/** Every TAX_INTERVAL_SEC, tax TAX_RATE of lifetime total income. */
export const TAX_INTERVAL_SEC = 180;
export const TAX_RATE = 0.1;

export const COLORS = {
  grass: 0x73a942,
  road: 0x374151,
  highway: 0x1f2937,
  roadLine: 0xf8fafc,
  highwayLine: 0xfacc15,
  sidewalk: 0xb7bec8,
  park: 0x4f9d55,
  treeTrunk: 0x6b4423,
  treeLeaves: 0x26734d,
  player: 0x38bdf8,
  playerOutline: 0xffffff,
  health: 0xef4444,
  hunger: 0xf59e0b,
  money: 0x22c55e
};

/**
 * Special POIs placed on random full blocks.
 * count = how many of this type to scatter across the map.
 */
export const SPECIAL_BUILDINGS = {
  school: {
    label: "SCHOOL",
    color: 0x3b82f6,
    roof: 0x1e40af,
    accent: 0xfbbf24,
    window: 0xdbeafe,
    minimap: 0x60a5fa,
    count: 3
  },
  barber: {
    label: "BARBER",
    color: 0xfce7f3,
    roof: 0xdb2777,
    accent: 0xef4444,
    window: 0xfdf2f8,
    minimap: 0xf472b6,
    count: 3
  },
  grocery: {
    label: "MARKET",
    color: 0x86efac,
    roof: 0x15803d,
    accent: 0xfacc15,
    window: 0xecfdf5,
    minimap: 0x4ade80,
    count: 4
  },
  restaurant: {
    label: "RESTAURANT",
    color: 0xfdba74,
    roof: 0xc2410c,
    accent: 0xfef3c7,
    window: 0xffedd5,
    minimap: 0xfb923c,
    count: 5
  },
  gym: {
    label: "GYM",
    color: 0xf87171,
    roof: 0x991b1b,
    accent: 0xfef08a,
    window: 0xfee2e2,
    minimap: 0xf87171,
    count: 2
  },
  office: {
    label: "OFFICE",
    color: 0x94a3b8,
    roof: 0x1e293b,
    accent: 0x38bdf8,
    window: 0xe0f2fe,
    minimap: 0xcbd5e1,
    count: 3
  }
};

/** Job openings available at each property type. */
export const WORK_SHIFT_SECONDS = 10;

/** Chance (0–1) an application is rejected when applying for a job. */
export const JOB_REJECT_CHANCE = 0.35;

/** Seconds before you can re-apply after a rejection at that workplace. */
export const JOB_REJECT_COOLDOWN_SEC = 12;

export const JOBS = {
  school: { title: "Teacher", pay: 28, rejectChance: 0.4 },
  restaurant: { title: "Cook", pay: 20, rejectChance: 0.3 },
  grocery: { title: "Cashier", pay: 16, rejectChance: 0.25 },
  gym: { title: "Trainer", pay: 22, rejectChance: 0.35 },
  office: { title: "Clerk", pay: 32, rejectChance: 0.45 },
  barber: { title: "Stylist", pay: 18, rejectChance: 0.3 }
};

/** Food you can buy (restaurants + markets). */
export const FOOD = {
  restaurant: {
    name: "Hot Meal",
    cost: 14,
    hungerRestore: 40,
    healthRestore: 8
  },
  grocery: {
    name: "Groceries",
    cost: 7,
    hungerRestore: 22,
    healthRestore: 3
  }
};

export const BUILDING_COLORS = [
  0x94a3b8,
  0x64748b,
  0x9ca3af,
  0xa78b71,
  0x7c8a9a,
  0x8b7d6b,
  0x758694
];

export const CAR_COLORS = [
  0xef4444,
  0x3b82f6,
  0xfbbf24,
  0x111827,
  0xf8fafc,
  0xa855f7,
  0x22c55e,
  0xf97316,
  0x06b6d4,
  0xe11d48
];

export const NPC_COLORS = [
  0xf97316,
  0xfacc15,
  0xec4899,
  0x22c55e,
  0xa78bfa,
  0xef4444
];
