import {
  GUNS,
  PLAYER_SIZE,
  WORLD_HEIGHT,
  WORLD_WIDTH
} from "./config.js";
import { clamp } from "./helpers.js";
import { setPlayerMessage } from "./player.js";

const SAVE_KEY = "ai-world-player-v1";
const SAVE_VERSION = 1;

function serialize(player, stats) {
  return {
    version: SAVE_VERSION,
    savedAt: Date.now(),
    position: {
      x: player.x,
      y: player.y,
      rotation: player.rotation
    },
    stats: {
      health: stats.health,
      hunger: stats.hunger,
      money: stats.money,
      totalIncome: stats.totalIncome,
      totalTaxPaid: stats.totalTaxPaid,
      job: stats.job
        ? {
            type: stats.job.type,
            title: stats.job.title,
            pay: stats.job.pay,
            workSeconds: stats.job.workSeconds,
            label: stats.job.label
          }
        : null,
      alive: stats.alive,
      hungerTimer: stats.hungerTimer,
      taxTimer: stats.taxTimer,
      workCooldown: stats.workCooldown,
      ownedGuns: [...(stats.ownedGuns || [])],
      equippedGunId: stats.equippedGunId,
      wanted: Boolean(stats.wanted),
      inJail: Boolean(stats.inJail),
      jailTimer: stats.jailTimer || 0
    }
  };
}

function isValidSave(data) {
  return (
    data &&
    data.version === SAVE_VERSION &&
    data.stats &&
    data.position &&
    typeof data.stats.money === "number" &&
    typeof data.position.x === "number" &&
    typeof data.position.y === "number"
  );
}

/**
 * Write player position + progression to localStorage.
 * @returns {boolean} success
 */
export function savePlayerState(player, stats) {
  try {
    const payload = serialize(player, stats);
    localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
    return true;
  } catch (err) {
    console.warn("Failed to save player state:", err);
    return false;
  }
}

/**
 * Apply saved data onto existing player + stats objects.
 * @returns {boolean} whether a save was loaded
 */
export function loadPlayerState(player, stats) {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) {
      return false;
    }

    const data = JSON.parse(raw);
    if (!isValidSave(data)) {
      return false;
    }

    const s = data.stats;
    const half = PLAYER_SIZE / 2;

    player.x = clamp(data.position.x, half, WORLD_WIDTH - half);
    player.y = clamp(data.position.y, half, WORLD_HEIGHT - half);
    player.rotation = data.position.rotation || 0;

    stats.health = clamp(s.health ?? 100, 0, 100);
    stats.hunger = clamp(s.hunger ?? 100, 0, 100);
    stats.money = Math.max(0, Math.floor(s.money ?? 0));
    stats.totalIncome = Math.max(0, Math.floor(s.totalIncome ?? 0));
    stats.totalTaxPaid = Math.max(0, Math.floor(s.totalTaxPaid ?? 0));
    stats.alive = s.alive !== false && stats.health > 0 && stats.hunger > 0;
    stats.hungerTimer = Math.max(0, s.hungerTimer ?? 0);
    stats.taxTimer = Math.max(0, s.taxTimer ?? 0);
    stats.workCooldown = Math.max(0, s.workCooldown ?? 0);
    stats.fireCooldown = 0;
    stats.wanted = Boolean(s.wanted);
    stats.inJail = Boolean(s.inJail);
    stats.jailTimer = Math.max(0, s.jailTimer ?? 0);

    const validGunIds = new Set(GUNS.map((g) => g.id));
    stats.ownedGuns = Array.isArray(s.ownedGuns)
      ? s.ownedGuns.filter((id) => validGunIds.has(id))
      : [];

    if (s.equippedGunId && validGunIds.has(s.equippedGunId)) {
      stats.equippedGunId = stats.ownedGuns.includes(s.equippedGunId)
        ? s.equippedGunId
        : stats.ownedGuns[0] || null;
    } else {
      stats.equippedGunId = stats.ownedGuns[0] || null;
    }

    if (s.job && s.job.type && s.job.title) {
      stats.job = {
        type: s.job.type,
        title: s.job.title,
        pay: s.job.pay ?? 0,
        workSeconds: s.job.workSeconds ?? 10,
        workplaceId: null,
        label: s.job.label || s.job.type
      };
    } else {
      stats.job = null;
    }

    if (!stats.alive) {
      stats.health = 0;
      stats.hunger = 0;
    }

    setPlayerMessage(stats, "Progress loaded.", 2.5);
    return true;
  } catch (err) {
    console.warn("Failed to load player state:", err);
    return false;
  }
}

export function clearPlayerState() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch (err) {
    console.warn("Failed to clear player state:", err);
  }
}

/**
 * Auto-save on an interval + when the tab is hidden / closed.
 */
export function setupAutoSave(player, stats, intervalSec = 5) {
  let timer = 0;

  function persist() {
    savePlayerState(player, stats);
  }

  window.addEventListener("beforeunload", persist);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      persist();
    }
  });

  return {
    update(deltaSeconds) {
      timer += deltaSeconds;
      if (timer >= intervalSec) {
        timer = 0;
        persist();
      }
    },
    saveNow: persist
  };
}
