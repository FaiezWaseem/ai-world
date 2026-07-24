import {
  BANK_LOOT,
  BANK_SECURITY_CHASE,
  BANK_SECURITY_COUNT,
  BANK_SECURITY_PATROL,
  BANK_SECURITY_PATROL_RADIUS,
  BANK_SECURITY_RANGE,
  BANK_VAULT_HP,
  WORLD_HEIGHT,
  WORLD_WIDTH
} from "./config.js";
import { clamp, random } from "./helpers.js";
import { setPlayerMessage } from "./player.js";

function createGuardGraphics() {
  const g = new PIXI.Graphics();
  g.ellipse(0, 8, 12, 6).fill({ color: 0x000000, alpha: 0.22 });
  g.circle(0, 0, 12)
    .fill({ color: 0x111827 })
    .stroke({ color: 0xfacc15, width: 2 });
  // Badge
  g.rect(-3, -4, 6, 8).fill({ color: 0xfbbf24 });
  return g;
}

/**
 * One BANK on the map + armed security that patrols nearby.
 * Shoot the bank vault to break it open for BANK_LOOT.
 */
export function createBankSystem({
  buildingColliders,
  securityLayer,
  getPlayer,
  getPlayerStats,
  police
}) {
  const bank = buildingColliders.find((b) => b.type === "bank");
  if (!bank) {
    console.warn("[bank] No bank building in city");
    return {
      bank: null,
      update() {},
      tryHitBank() {
        return null;
      },
      getBank() {
        return null;
      }
    };
  }

  bank.vaultHp = BANK_VAULT_HP;
  bank.looted = false;
  bank.lootAmount = BANK_LOOT;
  bank.maxVaultHp = BANK_VAULT_HP;

  const cx = bank.x + bank.width / 2;
  const cy = bank.y + bank.height / 2;
  const guards = [];
  let alarm = false;

  function spawnGuard(i) {
    const guard = new PIXI.Container();
    guard.addChild(createGuardGraphics());
    const angle = (i / BANK_SECURITY_COUNT) * Math.PI * 2;
    const r = 80 + random(0, 40);
    guard.x = cx + Math.cos(angle) * r;
    guard.y = cy + Math.sin(angle) * r;
    guard.homeAngle = angle;
    guard.patrolT = random(0, Math.PI * 2);
    guard.hp = 80;
    guard.alive = true;
    securityLayer.addChild(guard);
    guards.push(guard);
  }

  for (let i = 0; i < BANK_SECURITY_COUNT; i++) {
    spawnGuard(i);
  }

  function raiseAlarm(reason) {
    if (alarm) {
      return;
    }
    alarm = true;
    const stats = getPlayerStats();
    if (stats) {
      setPlayerMessage(
        stats,
        reason || "BANK ALARM! Security is hostile!",
        3.5
      );
    }
  }

  /**
   * Apply vault damage (caller already verified the shot hits the bank).
   */
  function tryHitBank(player, gun, stats, crimeReporter) {
    if (!bank || bank.looted) {
      return null;
    }

    raiseAlarm("BANK UNDER ATTACK!");
    alarm = true;

    // Police near the bank may witness the robbery
    if (typeof crimeReporter === "function") {
      crimeReporter(cx, cy);
    }

    bank.vaultHp = Math.max(0, bank.vaultHp - gun.damage);

    if (bank.vaultHp <= 0 && !bank.looted) {
      bank.looted = true;
      stats.money += BANK_LOOT;
      setPlayerMessage(
        stats,
        `VAULT CRACKED! +$${BANK_LOOT}  (cash $${stats.money})`,
        4
      );
      return { hit: true, looted: true, loot: BANK_LOOT };
    }

    setPlayerMessage(
      stats,
      `Vault armor ${Math.ceil(bank.vaultHp)}/${BANK_VAULT_HP} — keep shooting!`,
      1.5
    );
    return {
      hit: true,
      looted: false,
      hp: bank.vaultHp
    };
  }

  function update(deltaSeconds) {
    const player = getPlayer();
    const stats = getPlayerStats();

    for (const guard of guards) {
      if (!guard.alive) {
        continue;
      }

      let moveX = 0;
      let moveY = 0;
      let speed = BANK_SECURITY_PATROL;

      const chase =
        alarm &&
        stats?.alive &&
        !stats.inJail &&
        player;

      if (chase) {
        speed = BANK_SECURITY_CHASE;
        const dx = player.x - guard.x;
        const dy = player.y - guard.y;
        const d = Math.hypot(dx, dy) || 1;
        moveX = dx / d;
        moveY = dy / d;

        if (d <= BANK_SECURITY_RANGE) {
          // Rough up the robber — damage health
          stats.health = Math.max(0, stats.health - 18 * deltaSeconds);
          if (stats.health <= 0) {
            stats.alive = false;
            stats.message = "Security killed you. Press R to restart.";
            stats.messageTimer = 99;
          }
        }
      } else {
        // Orbit the bank
        guard.patrolT += deltaSeconds * 0.6;
        const r = BANK_SECURITY_PATROL_RADIUS * (0.55 + 0.2 * Math.sin(guard.patrolT));
        const tx = cx + Math.cos(guard.patrolT + guard.homeAngle) * r;
        const ty = cy + Math.sin(guard.patrolT + guard.homeAngle) * r;
        const dx = tx - guard.x;
        const dy = ty - guard.y;
        const d = Math.hypot(dx, dy) || 1;
        moveX = dx / d;
        moveY = dy / d;
      }

      guard.x = clamp(
        guard.x + moveX * speed * deltaSeconds,
        20,
        WORLD_WIDTH - 20
      );
      guard.y = clamp(
        guard.y + moveY * speed * deltaSeconds,
        20,
        WORLD_HEIGHT - 20
      );
      // Keep near bank when not chasing hard
      if (!chase) {
        const fromBank = Math.hypot(guard.x - cx, guard.y - cy);
        if (fromBank > BANK_SECURITY_PATROL_RADIUS + 40) {
          guard.x += (cx - guard.x) * 0.05;
          guard.y += (cy - guard.y) * 0.05;
        }
      }

      if (moveX !== 0 || moveY !== 0) {
        guard.rotation = Math.atan2(moveY, moveX) + Math.PI / 2;
      }
    }
  }

  function getBank() {
    return bank;
  }

  return {
    bank,
    guards,
    update,
    tryHitBank,
    getBank,
    isAlarm: () => alarm
  };
}
