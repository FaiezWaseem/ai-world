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
  const jailB = buildingColliders.find((b) => b.type === "jail");
  if (jailB) {
    return {
      x: jailB.x + jailB.width / 2,
      y: jailB.y + jailB.height / 2,
      releaseX: jailB.x - 30,
      releaseY: jailB.y + jailB.height / 2
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
  body
    .ellipse(0, 8, 12, 6)
    .fill({ color: 0x000000, alpha: 0.22 });
  body
    .circle(0, 0, 11)
    .fill({ color: 0x1d4ed8 })
    .stroke({ color: 0xfbbf24, width: 2 });
  body.circle(5, -2, 3).fill({ color: 0xfacc15 });
  return body;
}

/**
 * Police chase any wanted subjects (player + AI agents).
 * getExtraWanted: () => [{ body, stats, kind, name? }]
 */
export function createPoliceSystem({
  policeLayer,
  buildingColliders,
  getPlayer,
  getStats,
  getExtraWanted = () => []
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

  function listWanted() {
    const list = [];
    const player = getPlayer();
    const pStats = getStats();
    if (pStats.alive && pStats.wanted && !pStats.inJail) {
      list.push({
        body: player,
        stats: pStats,
        kind: "player",
        name: "You"
      });
    }
    for (const extra of getExtraWanted()) {
      if (
        extra?.stats?.alive &&
        extra.stats.wanted &&
        !extra.stats.inJail &&
        extra.body
      ) {
        list.push(extra);
      }
    }
    return list;
  }

  function reportMurder() {
    const stats = getStats();
    if (!stats.alive || stats.inJail) {
      return;
    }
    stats.wanted = true;
    alertAll();
    setPlayerMessage(stats, "WANTED! Police are hunting you for murder.", 3);
  }

  /** Agent (or any stats+body) commits murder. */
  function reportCrime(stats, body) {
    if (!stats?.alive || stats.inJail) {
      return;
    }
    stats.wanted = true;
    alertAll();
    if (body?.name) {
      stats.message = `${body.name} is WANTED!`;
      stats.messageTimer = 2.5;
    }
  }

  function jailSubject(stats, body, kind = "player") {
    if (stats.inJail) {
      return;
    }

    stats.wanted = false;
    stats.inJail = true;
    stats.jailTimer = JAIL_WAIT_SEC;
    body.x = jail.x;
    body.y = jail.y;
    if ("rotation" in body) {
      body.rotation = 0;
    }

    for (const cop of officers) {
      cop.alerted = false;
    }

    if (kind === "player") {
      setPlayerMessage(
        stats,
        `JAILED! Wait ${JAIL_WAIT_SEC}s + $${JAIL_FINE} fine · or B bribe $${JAIL_BRIBE}`,
        5
      );
    } else {
      stats.message = `Jailed ${JAIL_WAIT_SEC}s / bribe $${JAIL_BRIBE}`;
      stats.messageTimer = 3;
    }
  }

  function releaseSubject(stats, body, reason) {
    stats.inJail = false;
    stats.jailTimer = 0;
    stats.wanted = false;
    body.x = jail.releaseX;
    body.y = jail.releaseY;

    if (reason) {
      if (body === getPlayer()) {
        setPlayerMessage(stats, reason, 3);
      } else {
        stats.message = reason;
        stats.messageTimer = 3;
      }
    }
  }

  function sendToJail() {
    jailSubject(getStats(), getPlayer(), "player");
  }

  function releaseFromJail(reason) {
    releaseSubject(getStats(), getPlayer(), reason);
    for (const cop of officers) {
      cop.alerted = false;
      const spawn = findRoadSpawn();
      cop.x = spawn.x;
      cop.y = spawn.y;
    }
  }

  function updatePlayerJail(deltaSeconds) {
    const stats = getStats();
    if (!stats.inJail || !stats.alive) {
      return;
    }

    stats.jailTimer = Math.max(0, stats.jailTimer - deltaSeconds);
    if (stats.jailTimer <= 0) {
      const paid = Math.min(stats.money, JAIL_FINE);
      stats.money -= paid;
      releaseFromJail(
        paid < JAIL_FINE
          ? `Released after ${JAIL_WAIT_SEC}s. Fine $${paid}/$${JAIL_FINE} (short).`
          : `Released after ${JAIL_WAIT_SEC}s. Paid $${JAIL_FINE} fine.`
      );
    }
  }

  /** Agent jail release after timer (called from agent system or here). */
  function finishAgentSentence(stats, body) {
    if (!stats.inJail) {
      return;
    }
    const paid = Math.min(stats.money, JAIL_FINE);
    stats.money -= paid;
    releaseSubject(
      stats,
      body,
      paid < JAIL_FINE
        ? `Released. Fine $${paid}/$${JAIL_FINE}`
        : `Released. Paid $${JAIL_FINE} fine.`
    );
  }

  function tryBribe() {
    return tryBribeFor(getStats(), getPlayer());
  }

  function tryBribeFor(stats, body) {
    if (!stats.inJail) {
      if (body === getPlayer()) {
        setPlayerMessage(stats, "You're not in jail.", 1.5);
      }
      return false;
    }

    if (stats.money < JAIL_BRIBE) {
      if (body === getPlayer()) {
        setPlayerMessage(
          stats,
          `Bribe costs $${JAIL_BRIBE} (have $${stats.money}).`,
          2.5
        );
      }
      return false;
    }

    stats.money -= JAIL_BRIBE;
    releaseSubject(stats, body, `Bribed the cops −$${JAIL_BRIBE}. Free.`);
    return true;
  }

  function updatePolice(deltaSeconds) {
    updatePlayerJail(deltaSeconds);

    const wanted = listWanted();
    const anyoneWanted = wanted.length > 0;
    const anyoneJailed =
      getStats().inJail ||
      getExtraWanted().some((w) => w.stats?.inJail);

    for (const cop of officers) {
      let moveX = 0;
      let moveY = 0;
      let speed = POLICE_PATROL_SPEED;

      if (anyoneJailed && !anyoneWanted) {
        const tx = jail.x + random(-40, 40);
        const ty = jail.y + random(-40, 40);
        const dx = tx - cop.x;
        const dy = ty - cop.y;
        const len = Math.hypot(dx, dy) || 1;
        moveX = dx / len;
        moveY = dy / len;
        speed = POLICE_PATROL_SPEED * 0.35;
      } else if (anyoneWanted || cop.alerted) {
        // Chase nearest wanted subject.
        let nearest = null;
        let best = Infinity;
        for (const sub of wanted) {
          const d = Math.hypot(sub.body.x - cop.x, sub.body.y - cop.y);
          if (d < best) {
            best = d;
            nearest = sub;
          }
        }

        if (nearest) {
          speed = POLICE_CHASE_SPEED;
          const dx = nearest.body.x - cop.x;
          const dy = nearest.body.y - cop.y;
          const dist = Math.hypot(dx, dy) || 1;
          moveX = dx / dist;
          moveY = dy / dist;

          if (dist <= POLICE_ARREST_RANGE) {
            jailSubject(
              nearest.stats,
              nearest.body,
              nearest.kind || "agent"
            );
          }
        } else {
          cop.alerted = false;
        }
      } else {
        cop.changeTimer -= deltaSeconds;
        if (cop.changeTimer <= 0) {
          cop.directionX = randomItem([-1, 0, 1]);
          cop.directionY =
            cop.directionX === 0
              ? randomItem([-1, 1])
              : randomItem([-1, 0, 1]);
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
    reportCrime,
    tryBribe,
    tryBribeFor,
    releaseSubject: (stats, body, reason) => {
      if (stats.jailTimer > 0 && stats.inJail && reason == null) {
        finishAgentSentence(stats, body);
        return;
      }
      releaseSubject(stats, body, reason || "Released.");
    },
    updatePolice,
    getJailSpot: () => jail
  };
}
