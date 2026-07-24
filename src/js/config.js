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

/** Default AI citizen count (overridden by /api/config from .env). */
export const DEFAULT_AGENT_COUNT = 4;
export const AGENT_SIZE = 26;
export const AGENT_SPEED = 240;
export const AGENT_THINK_MIN_SEC = 6;
export const AGENT_THINK_MAX_SEC = 12;
export const AGENT_SPEECH_RANGE = 160;
/** How close agents must be to talk to the human player. */
export const AGENT_PLAYER_TALK_RANGE = 140;
/** How close agents must be to borrow cash or guns. */
export const AGENT_TRADE_RANGE = 90;
export const AGENT_BORROW_DEFAULT = 20;
export const AGENT_BORROW_MAX = 80;
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
  },
  gunshop: {
    label: "GUN SHOP",
    color: 0x57534e,
    roof: 0x1c1917,
    accent: 0xfacc15,
    window: 0xfef3c7,
    minimap: 0xa8a29e,
    count: 2
  },
  jail: {
    label: "JAIL",
    color: 0x64748b,
    roof: 0x0f172a,
    accent: 0xef4444,
    window: 0xcbd5e1,
    minimap: 0x94a3b8,
    count: 1
  },
  bank: {
    label: "BANK",
    color: 0xfef08a,
    roof: 0xa16207,
    accent: 0xfacc15,
    window: 0xfef9c3,
    minimap: 0xeab308,
    count: 1,
    forSale: false
  },
  // Buyable real estate
  house: {
    label: "HOUSE",
    color: 0xfcd34d,
    roof: 0xb45309,
    accent: 0xfef3c7,
    window: 0xffedd5,
    minimap: 0xfbbf24,
    count: 5,
    forSale: true,
    basePrice: 180,
    rentRate: 0.025
  },
  apartment: {
    label: "APARTMENT",
    color: 0xa5b4fc,
    roof: 0x4338ca,
    accent: 0xe0e7ff,
    window: 0xc7d2fe,
    minimap: 0x818cf8,
    count: 4,
    forSale: true,
    basePrice: 320,
    rentRate: 0.03
  },
  shop: {
    label: "SHOP",
    color: 0xf9a8d4,
    roof: 0x9d174d,
    accent: 0xfce7f3,
    window: 0xfbcfe8,
    minimap: 0xec4899,
    count: 3,
    forSale: true,
    basePrice: 450,
    rentRate: 0.035
  }
};

/** How often owned properties pay rent to the owner. */
export const PROPERTY_RENT_INTERVAL_SEC = 45;

/** Chance a generic (non-POI) building is listed for sale. */
export const GENERIC_FOR_SALE_CHANCE = 0.22;

/** Police / jail rules (murder → arrest). */
export const POLICE_COUNT = 10;
export const POLICE_PATROL_SPEED = 95;
export const POLICE_CHASE_SPEED = 240;
export const POLICE_ARREST_RANGE = 32;
/** Only cops this close can witness a crime (no city-wide omniscience). */
export const POLICE_WITNESS_RANGE = 380;
/** If already wanted, idle cops this close can join the chase. */
export const POLICE_JOIN_RANGE = 220;
export const JAIL_WAIT_SEC = 30;
export const JAIL_FINE = 50;
export const JAIL_BRIBE = 250;

/** Single bank vault — shoot to loot. */
export const BANK_LOOT = 10000;
export const BANK_VAULT_HP = 120;
export const BANK_SECURITY_COUNT = 5;
export const BANK_SECURITY_PATROL = 70;
export const BANK_SECURITY_CHASE = 250;
export const BANK_SECURITY_RANGE = 42;
/** Guards stay near the bank within this radius while idle. */
export const BANK_SECURITY_PATROL_RADIUS = 220;
/** Max chase distance from bank center (~2 city blocks each way). */
export const BANK_SECURITY_CHASE_BLOCKS = 2;
export const BANK_SECURITY_CHASE_RADIUS =
  CELL_SIZE * BANK_SECURITY_CHASE_BLOCKS;

/**
 * Guns for sale at GUN SHOP (buy with 1–5 while nearby).
 * Shoot with F / Space. Cycle owned guns with Q.
 */
export const GUNS = [
  {
    id: "pistol",
    name: "Pistol",
    price: 50,
    damage: 40,
    range: 260,
    fireCooldown: 0.45,
    color: 0xcbd5e1
  },
  {
    id: "shotgun",
    name: "Shotgun",
    price: 120,
    damage: 90,
    range: 150,
    fireCooldown: 0.95,
    color: 0xa78bfa
  },
  {
    id: "smg",
    name: "SMG",
    price: 200,
    damage: 28,
    range: 300,
    fireCooldown: 0.14,
    color: 0x38bdf8
  },
  {
    id: "rifle",
    name: "Assault Rifle",
    price: 350,
    damage: 55,
    range: 420,
    fireCooldown: 0.28,
    color: 0x4ade80
  },
  {
    id: "sniper",
    name: "Sniper",
    price: 500,
    damage: 100,
    range: 700,
    fireCooldown: 1.25,
    color: 0xf97316
  }
];

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
  barber: { title: "Stylist", pay: 18, rejectChance: 0.3 },
  gunshop: { title: "Clerk", pay: 24, rejectChance: 0.35 }
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
