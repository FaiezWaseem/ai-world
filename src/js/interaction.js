import {
  FOOD,
  GUNS,
  INTERACT_DISTANCE,
  JOB_REJECT_CHANCE,
  JOB_REJECT_COOLDOWN_SEC,
  JOBS,
  SPECIAL_BUILDINGS,
  WORK_SHIFT_SECONDS
} from "./config.js";
import { clamp } from "./helpers.js";
import { addIncome, setPlayerMessage } from "./player.js";

/** workplaceId → timestamp (performance.now) until re-apply allowed */
const rejectUntil = new Map();

const REJECT_REASONS = [
  "We're not hiring right now.",
  "They hired someone else.",
  "You need more experience.",
  "Manager said no — try later.",
  "Positions are full this week."
];

function distanceToBuilding(player, building) {
  const closestX = clamp(
    player.x,
    building.x,
    building.x + building.width
  );
  const closestY = clamp(
    player.y,
    building.y,
    building.y + building.height
  );

  return Math.hypot(player.x - closestX, player.y - closestY);
}

export function findNearbyPoi(player, buildingColliders) {
  let best = null;
  let bestDist = INTERACT_DISTANCE;

  for (const building of buildingColliders) {
    if (!building.type || !SPECIAL_BUILDINGS[building.type]) {
      continue;
    }

    const dist = distanceToBuilding(player, building);
    if (dist <= bestDist) {
      bestDist = dist;
      best = building;
    }
  }

  return best;
}

function buildPrompt(stats, poi) {
  const theme = SPECIAL_BUILDINGS[poi.type];
  const label = theme?.label || poi.type.toUpperCase();
  const job = JOBS[poi.type];
  const food = FOOD[poi.type];
  const lines = [`[${label}]`];

  if (food) {
    lines.push(
      `J  Eat ${food.name}  ($${food.cost} · +${food.hungerRestore}% hunger)`
    );
  }

  if (poi.type === "gunshop") {
    lines.push("Buy guns (keys 1–5):");
    GUNS.forEach((gun, i) => {
      const owned = stats.ownedGuns?.includes(gun.id);
      lines.push(
        `  ${i + 1}  ${gun.name}  $${gun.price}` +
          (owned ? "  [OWNED]" : "") +
          `  dmg ${gun.damage} · rng ${gun.range}`
      );
    });
    lines.push("Q cycle weapons · F/Space shoot");
  }

  if (job) {
    const employedHere =
      stats.job &&
      (stats.job.workplaceId === poi.id || stats.job.type === poi.type);

    if (employedHere) {
      if (stats.workCooldown > 0) {
        lines.push(
          `Working… ${stats.workCooldown.toFixed(1)}s / ${WORK_SHIFT_SECONDS}s  (+$${job.pay})`
        );
      } else {
        lines.push(
          `E  Work ${WORK_SHIFT_SECONDS}s shift  (+$${job.pay} as ${job.title})`
        );
      }
    } else if (stats.job) {
      lines.push(
        `E  Apply to switch → ${job.title}  ($${job.pay}/shift · may reject)`
      );
    } else {
      lines.push(
        `E  Apply: ${job.title}  ($${job.pay}/shift · may reject)`
      );
    }
  }

  if (lines.length === 1) {
    lines.push("No actions here");
  }

  return lines.join("\n");
}

function tryEat(stats, poi) {
  const food = FOOD[poi.type];
  if (!food) {
    return false;
  }

  if (stats.money < food.cost) {
    setPlayerMessage(
      stats,
      `Need $${food.cost} for ${food.name}. Get a job and work!`,
      3
    );
    return true;
  }

  stats.money -= food.cost;
  stats.hunger = Math.min(100, stats.hunger + food.hungerRestore);
  stats.health = Math.min(100, stats.health + food.healthRestore);
  setPlayerMessage(
    stats,
    `Ate ${food.name} (−$${food.cost}). Hunger ${Math.round(stats.hunger)}%`,
    2.5
  );
  return true;
}

function tryJobAction(stats, poi) {
  const job = JOBS[poi.type];
  if (!job) {
    return false;
  }

  // Match by workplace id, or by job type (survives save / new map layout).
  const employedHere =
    stats.job &&
    (stats.job.workplaceId === poi.id || stats.job.type === poi.type);
  const label = SPECIAL_BUILDINGS[poi.type]?.label || poi.type;

  if (!employedHere) {
    const blockedUntil = rejectUntil.get(poi.id) || 0;
    if (performance.now() < blockedUntil) {
      const secs = Math.ceil((blockedUntil - performance.now()) / 1000);
      setPlayerMessage(
        stats,
        `Still rejected at ${label}. Try again in ${secs}s.`,
        2
      );
      return true;
    }

    const chance =
      typeof job.rejectChance === "number"
        ? job.rejectChance
        : JOB_REJECT_CHANCE;

    if (Math.random() < chance) {
      rejectUntil.set(
        poi.id,
        performance.now() + JOB_REJECT_COOLDOWN_SEC * 1000
      );
      const reason =
        REJECT_REASONS[Math.floor(Math.random() * REJECT_REASONS.length)];
      setPlayerMessage(
        stats,
        `Rejected at ${label}: ${reason}`,
        3.5
      );
      return true;
    }

    rejectUntil.delete(poi.id);
    stats.job = {
      type: poi.type,
      title: job.title,
      pay: job.pay,
      workSeconds: WORK_SHIFT_SECONDS,
      workplaceId: poi.id,
      label
    };
    setPlayerMessage(
      stats,
      `Hired as ${job.title} at ${label}! Press E to work (${WORK_SHIFT_SECONDS}s shifts).`,
      3
    );
    return true;
  }

  if (stats.workCooldown > 0) {
    setPlayerMessage(
      stats,
      `Still on shift… ${stats.workCooldown.toFixed(1)}s left`,
      1.5
    );
    return true;
  }

  addIncome(stats, job.pay);
  stats.workCooldown = WORK_SHIFT_SECONDS;
  setPlayerMessage(
    stats,
    `Worked a ${WORK_SHIFT_SECONDS}s shift! +$${job.pay}  (cash $${stats.money} · income $${stats.totalIncome})`,
    2.5
  );
  return true;
}

/** Eat at restaurant / market (key: J). */
export function tryEatInteract(stats, poi) {
  if (!poi || !stats.alive) {
    return;
  }

  if (!FOOD[poi.type]) {
    setPlayerMessage(stats, "Nothing to eat here.", 1.5);
    return;
  }

  tryEat(stats, poi);
}

/** Take job / work a shift (key: E). */
export function tryJobInteract(stats, poi) {
  if (!poi || !stats.alive) {
    return;
  }

  if (!JOBS[poi.type]) {
    setPlayerMessage(stats, "No job openings here.", 1.5);
    return;
  }

  tryJobAction(stats, poi);
}

/** Buy gun by catalog index 0–4 while at gun shop (keys 1–5). */
export function tryBuyGun(stats, poi, gunIndex) {
  if (!stats.alive) {
    return;
  }

  if (!poi || poi.type !== "gunshop") {
    setPlayerMessage(stats, "Visit a GUN SHOP to buy weapons.", 2);
    return;
  }

  const gun = GUNS[gunIndex];
  if (!gun) {
    return;
  }

  if (stats.ownedGuns.includes(gun.id)) {
    stats.equippedGunId = gun.id;
    setPlayerMessage(stats, `Already own ${gun.name} — equipped.`, 2);
    return;
  }

  if (stats.money < gun.price) {
    setPlayerMessage(
      stats,
      `Need $${gun.price} for ${gun.name} (have $${stats.money}).`,
      2.5
    );
    return;
  }

  stats.money -= gun.price;
  stats.ownedGuns.push(gun.id);
  stats.equippedGunId = gun.id;
  setPlayerMessage(
    stats,
    `Bought ${gun.name} for $${gun.price}! F/Space to shoot.`,
    3
  );
}

export function getInteractionPrompt(stats, poi) {
  if (!poi || !stats.alive) {
    return "";
  }

  return buildPrompt(stats, poi);
}
