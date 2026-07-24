import {
  CELL_SIZE,
  JAIL_BRIBE,
  JAIL_FINE,
  JAIL_WAIT_SEC,
  POLICE_ARREST_RANGE,
  POLICE_CHASE_SPEED,
  POLICE_COUNT,
  POLICE_PATROL_SPEED,
  ROAD_SIZE,
  WORLD_HEIGHT,
  WORLD_WIDTH
} from "./config.js";
import { clamp, random, randomItem } from "./helpers.js";
import { setPlayerMessage } from "./player.js";

function findRoadSpawn() {
  const vertical = Math.random() < 0.5;

  if (vertical) {
    const col = Math.floor(random(0, WORLD_WIDTH / CELL_SIZE));
    return {
      x: col * CELL_SIZE + random(24, ROAD_SIZE - 24),
      y: random(40, WORLD_HEIGHT - 40)
    };
  }

  const row = Math.floor(random(0, WORLD_HEIGHT / CELL_SIZE));
  return {
    x: random(40, WORLD_WIDTH - 40),
    y: row * CELL_SIZE + random(24, ROAD_SIZE - 24)
  };
}

function findJailSpot(buildingColliders) {
  const jail = buildingColliders.find((b) => b.type === "jail");
  if (jail) {
    return {
      x: jail.x + jail.width / 2,
      y: jail.y + jail.height / 2,
      releaseX: jail.x - 30,
      releaseY: jail.y + jail.height / 2
    };
  }

  return {
    x: WORLD_WIDTH / 2,
    y: WORLD_HEIGHT / 2,
    releaseX: WORLD_WIDTH / 2 + 80,
    releaseY: WORLD_HEIGHT / 2
  };
}

function createOfficerGraphics() {
  const body = new PIXI.Graphics();
  const size = 11;

  body
    .ellipse(0, 8, 12, 6)
    .fill({ color: 0x000000, alpha: 0.22 });

  body
    .circle(0, 0, size)
    .fill({ color: 0x1d4ed8 })
    .stroke({ color: 0xfbbf24, width: 2 });

  // Badge.
  body
    .circle(5, -2, 3)
    .fill({ color: 0xfacc15 });

  return body;
}

/**
 * Police chase wanted players; jail holds them for a fine or bribe.
 */
export function createPoliceSystem({
  policeLayer,
  buildingColliders,
  getPlayer,
  getStats
}) {
  const officers = [];
  const jail = findJailSpot(buildingColliders);

  function createOfficer() {
    const cop = new PIXI.Container();
    cop.addChild(createOfficerGraphics());

    const spawn = findRoadSpawn();
    cop.x = spawn.x;
    cop.y = spawn.y;
    cop.directionX = randomItem([-1, 0, 1]);
    cop.directionY = cop.directionX === 0 ? randomItem([-1, 1]) : 0;
    cop.changeTimer = random(1.5, 4);
    cop.alerted = false;

    policeLayer.addChild(cop);
    officers.push(cop);
  }

  for (let i = 0; i < POLICE_COUNT; i++) {
    createOfficer();
  }

  function alertAll() {
    for (const cop of officers) {
      cop.alerted = true;
    }
  }

  /** Call when the player kills an NPC. */
  function reportMurder() {
    const stats = getStats();
    if (!stats.alive || stats.inJail) {
      return;
    }

    stats.wanted = true;
    alertAll();
    setPlayerMessage(
      stats,
      "WANTED! Police are hunting you for murder.",
      3
    );
  }

  function sendToJail() {
    const stats = getStats();
    const player = getPlayer();

    if (stats.inJail) {
      return;
    }

    stats.wanted = false;
    stats.inJail = true;
    stats.jailTimer = JAIL_WAIT_SEC;
    player.x = jail.x;
    player.y = jail.y;
    player.rotation = 0;

    for (const cop of officers) {
      cop.alerted = false;
    }

    setPlayerMessage(
      stats,
      `JAILED! Wait ${JAIL_WAIT_SEC}s + $${JAIL_FINE} fine · or B bribe $${JAIL_BRIBE}`,
      5
    );
  }

  function releaseFromJail(reason) {
    const stats = getStats();
    const player = getPlayer();

    stats.inJail = false;
    stats.jailTimer = 0;
    stats.wanted = false;
    player.x = jail.releaseX;
    player.y = jail.releaseY;

    for (const cop of officers) {
      cop.alerted = false;
      const spawn = findRoadSpawn();
      cop.x = spawn.x;
      cop.y = spawn.y;
    }

    setPlayerMessage(stats, reason, 3);
  }

  /** Serve time: after 30s pay $50 fine (or whatever you can). */
  function updateJail(deltaSeconds) {
    const stats = getStats();
    if (!stats.inJail || !stats.alive) {
      return;
    }

    stats.jailTimer = Math.max(0, stats.jailTimer - deltaSeconds);

    if (stats.jailTimer <= 0) {
      const paid = Math.min(stats.money, JAIL_FINE);
      stats.money -= paid;

      if (paid < JAIL_FINE) {
        releaseFromJail(
          `Released after ${JAIL_WAIT_SEC}s. Fine $${paid}/$${JAIL_FINE} (short).`
        );
      } else {
        releaseFromJail(
          `Released after ${JAIL_WAIT_SEC}s. Paid $${JAIL_FINE} fine.`
        );
      }
    }
  }

  /** Instant release for $250. */
  function tryBribe() {
    const stats = getStats();
    if (!stats.inJail) {
      setPlayerMessage(stats, "You're not in jail.", 1.5);
      return false;
    }

    if (stats.money < JAIL_BRIBE) {
      setPlayerMessage(
        stats,
        `Bribe costs $${JAIL_BRIBE} (have $${stats.money}).`,
        2.5
      );
      return false;
    }

    stats.money -= JAIL_BRIBE;
    releaseFromJail(`Bribed the cops −$${JAIL_BRIBE}. You're free.`);
    return true;
  }

  function updatePolice(deltaSeconds) {
    const stats = getStats();
    const player = getPlayer();

    updateJail(deltaSeconds);

    if (!stats.alive) {
      return;
    }

    for (const cop of officers) {
      if (stats.inJail) {
        // Idle near jail while player is locked up.
        const tx = jail.x + random(-40, 40);
        const ty = jail.y + random(-40, 40);
        const dx = tx - cop.x;
        const dy = ty - cop.y;
        const len = Math.hypot(dx, dy) || 1;
        cop.x += (dx / len) * POLICE_PATROL_SPEED * 0.3 * deltaSeconds;
        cop.y += (dy / len) * POLICE_PATROL_SPEED * 0.3 * deltaSeconds;
        continue;
      }

      const chasing = stats.wanted || cop.alerted;
      let moveX = 0;
      let moveY = 0;
      let speed = POLICE_PATROL_SPEED;

      if (chasing) {
        speed = POLICE_CHASE_SPEED;
        const dx = player.x - cop.x;
        const dy = player.y - cop.y;
        const dist = Math.hypot(dx, dy) || 1;
        moveX = dx / dist;
        moveY = dy / dist;

        if (dist <= POLICE_ARREST_RANGE) {
          sendToJail();
          return;
        }
      } else {
        cop.changeTimer -= deltaSeconds;
        if (cop.changeTimer <= 0) {
          cop.directionX = randomItem([-1, 0, 1]);
          cop.directionY =
            cop.directionX === 0 ? randomItem([-1, 1]) : randomItem([-1, 0, 1]);
          cop.changeTimer = random(1.5, 4);
        }
        moveX = cop.directionX;
        moveY = cop.directionY;
      }

      cop.x = clamp(
        cop.x + moveX * speed * deltaSeconds,
        20,
        WORLD_WIDTH - 20
      );
      cop.y = clamp(
        cop.y + moveY * speed * deltaSeconds,
        20,
        WORLD_HEIGHT - 20
      );

      if (moveX !== 0 || moveY !== 0) {
        cop.rotation = Math.atan2(moveY, moveX) + Math.PI / 2;
      }
    }
  }

  return {
    officers,
    reportMurder,
    tryBribe,
    updatePolice,
    getJailSpot: () => jail
  };
}
