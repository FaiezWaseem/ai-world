import { GUNS, NPC_SIZE } from "./config.js";
import { setPlayerMessage } from "./player.js";

function getGunById(id) {
  return GUNS.find((gun) => gun.id === id) || null;
}

export function getEquippedGun(stats) {
  if (!stats.equippedGunId) {
    return null;
  }
  return getGunById(stats.equippedGunId);
}

/** Cycle through owned guns with Q. */
export function cycleGun(stats) {
  if (!stats.ownedGuns || stats.ownedGuns.length === 0) {
    setPlayerMessage(stats, "No guns. Buy one at a GUN SHOP.", 2);
    return;
  }

  const idx = stats.ownedGuns.indexOf(stats.equippedGunId);
  const next = stats.ownedGuns[(idx + 1) % stats.ownedGuns.length];
  stats.equippedGunId = next;
  const gun = getGunById(next);
  setPlayerMessage(stats, `Equipped: ${gun.name}`, 1.5);
}

/**
 * Forward unit vector matching player sprite (faces -Y at rotation 0).
 */
function getAimDirection(player) {
  const r = player.rotation;
  return {
    x: Math.sin(r),
    y: -Math.cos(r)
  };
}

function distPointToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) {
    return Math.hypot(px - x1, py - y1);
  }

  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));

  const projX = x1 + t * dx;
  const projY = y1 + t * dy;
  return Math.hypot(px - projX, py - projY);
}

/**
 * Fire equipped gun toward facing direction.
 * Can hit NPCs or the bank vault (via bankSystem).
 */
export function tryShoot(
  stats,
  player,
  npcSystem,
  effectsLayer,
  onKill,
  bankSystem = null,
  onBankCrime = null
) {
  if (!stats.alive || stats.inJail) {
    return null;
  }

  const gun = getEquippedGun(stats);
  if (!gun) {
    setPlayerMessage(stats, "Unarmed. Buy a gun at GUN SHOP (1–5).", 2);
    return null;
  }

  if (stats.fireCooldown > 0) {
    return null;
  }

  stats.fireCooldown = gun.fireCooldown;

  const aim = getAimDirection(player);
  const endX = player.x + aim.x * gun.range;
  const endY = player.y + aim.y * gun.range;
  const hitRadius = gun.id === "shotgun" ? 28 : 16;

  let bestNpc = null;
  let bestDist = gun.range + 1;

  for (const npc of npcSystem.npcs) {
    if (!npc.alive) {
      continue;
    }

    const alongX = npc.x - player.x;
    const alongY = npc.y - player.y;
    const forward = alongX * aim.x + alongY * aim.y;

    if (forward < 0 || forward > gun.range) {
      continue;
    }

    const lateral = distPointToSegment(
      npc.x,
      npc.y,
      player.x,
      player.y,
      endX,
      endY
    );

    if (lateral <= hitRadius + NPC_SIZE / 2 && forward < bestDist) {
      bestDist = forward;
      bestNpc = npc;
    }
  }

  // Prefer bank vault if the ray hits it closer than the NPC
  let bankHit = null;
  if (bankSystem?.tryHitBank) {
    // Peek without applying damage first by checking geometry only inside tryHitBank
    // tryHitBank applies damage — call only if bank is closer or no NPC
    const bank = bankSystem.getBank?.();
    if (bank && !bank.looted) {
      let bankDist = null;
      const steps = 24;
      for (let i = 1; i <= steps; i++) {
        const t = (i / steps) * gun.range;
        const px = player.x + aim.x * t;
        const py = player.y + aim.y * t;
        if (
          px >= bank.x &&
          px <= bank.x + bank.width &&
          py >= bank.y &&
          py <= bank.y + bank.height
        ) {
          bankDist = t;
          break;
        }
      }
      if (bankDist != null && bankDist < bestDist) {
        bankHit = bankSystem.tryHitBank(player, gun, stats, onBankCrime);
        bestNpc = null;
        bestDist = bankDist;
      }
    }
  }

  // Muzzle flash / tracer
  if (effectsLayer) {
    const beam = new PIXI.Graphics();
    let hitX = endX;
    let hitY = endY;
    if (bestNpc) {
      hitX = bestNpc.x;
      hitY = bestNpc.y;
    } else if (bankHit) {
      hitX = player.x + aim.x * bestDist;
      hitY = player.y + aim.y * bestDist;
    }

    beam
      .moveTo(player.x, player.y)
      .lineTo(hitX, hitY)
      .stroke({
        color: gun.color,
        width: gun.id === "shotgun" ? 4 : 2,
        alpha: 0.85
      });

    effectsLayer.addChild(beam);
    setTimeout(() => {
      if (beam.parent) {
        beam.parent.removeChild(beam);
      }
      beam.destroy();
    }, 80);
  }

  if (bestNpc) {
    const result = npcSystem.damageNpc(bestNpc, gun.damage);

    if (result.killed) {
      stats.money += result.cash;
      setPlayerMessage(
        stats,
        `Downed NPC · looted $${result.cash}  (cash $${stats.money})`,
        2.2
      );
      if (typeof onKill === "function") {
        onKill(result);
      }
    } else {
      setPlayerMessage(
        stats,
        `Hit! NPC HP ${Math.ceil(result.health)}`,
        1.2
      );
    }
  }

  return {
    gun,
    hit: Boolean(bestNpc || bankHit),
    bankHit
  };
}

export function updateCombat(stats, deltaSeconds) {
  if (stats.fireCooldown > 0) {
    stats.fireCooldown = Math.max(0, stats.fireCooldown - deltaSeconds);
  }
}
