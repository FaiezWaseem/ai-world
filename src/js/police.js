import {
  CELL_SIZE,
  JAIL_BRIBE,
  JAIL_FINE,
  JAIL_WAIT_SEC,
  POLICE_ARREST_RANGE,
  POLICE_CHASE_SPEED,
  POLICE_COUNT,
  POLICE_JOIN_RANGE,
  POLICE_PATROL_SPEED,
  POLICE_WITNESS_RANGE,
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

function dist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

/**
 * Police only chase if they witnessed the crime (or later join nearby).
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
    cop.chaseTarget = null; // { body, stats, kind, name }
    policeLayer.addChild(cop);
    officers.push(cop);
  }

  for (let i = 0; i < POLICE_COUNT; i++) {
    createOfficer();
  }

  function clearChaseFor(stats) {
    for (const cop of officers) {
      if (cop.chaseTarget?.stats === stats) {
        cop.alerted = false;
        cop.chaseTarget = null;
      }
    }
  }

  function clearAllChases() {
    for (const cop of officers) {
      cop.alerted = false;
      cop.chaseTarget = null;
    }
  }

  function assignWitnesses(crimeX, crimeY, subject) {
    const witnesses = [];
    for (const cop of officers) {
      if (dist(cop.x, cop.y, crimeX, crimeY) <= POLICE_WITNESS_RANGE) {
        cop.alerted = true;
        cop.chaseTarget = subject;
        witnesses.push(cop);
      }
    }
    return witnesses;
  }

  /**
   * Report a murder at a world position.
   * Only officers within POLICE_WITNESS_RANGE become alerted.
   * If nobody saw it, no wanted status and no chase.
   */
  function reportCrimeAt(crimeX, crimeY, stats, body, kind = "player", name = "You") {
    if (!stats?.alive || stats.inJail) {
      return { witnessed: false, count: 0 };
    }

    const subject = { body, stats, kind, name };
    const witnesses = assignWitnesses(crimeX, crimeY, subject);

    if (witnesses.length === 0) {
      // Clean getaway — not wanted
      if (kind === "player") {
        setPlayerMessage(
          stats,
          "Nobody saw that. You're in the clear… for now.",
          2.5
        );
      } else {
        stats.message = "Crime unseen.";
        stats.messageTimer = 2;
      }
      return { witnessed: false, count: 0 };
    }

    stats.wanted = true;

    if (kind === "player") {
      setPlayerMessage(
        stats,
        `Spotted! ${witnesses.length} officer${witnesses.length > 1 ? "s" : ""} saw the crime — RUN!`,
        3.5
      );
    } else {
      stats.message = `${name} was seen!`;
      stats.messageTimer = 2.5;
    }

    return { witnessed: true, count: witnesses.length };
  }

  function reportMurder() {
    const player = getPlayer();
    return reportCrimeAt(
      player.x,
      player.y,
      getStats(),
      player,
      "player",
      "You"
    );
  }

  function reportCrime(stats, body) {
    const x = body?.x ?? 0;
    const y = body?.y ?? 0;
    return reportCrimeAt(
      x,
      y,
      stats,
      body,
      "agent",
      body?.name || "Agent"
    );
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

    clearChaseFor(stats);

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
    clearChaseFor(stats);

    if (reason) {
      if (body === getPlayer()) {
        setPlayerMessage(stats, reason, 3);
      } else {
        stats.message = reason;
        stats.messageTimer = 3;
      }
    }
  }

  function releaseFromJail(reason) {
    releaseSubject(getStats(), getPlayer(), reason);
    clearAllChases();
    for (const cop of officers) {
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

  function isValidChase(target) {
    return (
      target &&
      target.stats &&
      target.body &&
      target.stats.alive &&
      target.stats.wanted &&
      !target.stats.inJail
    );
  }

  function updatePolice(deltaSeconds) {
    updatePlayerJail(deltaSeconds);

    const player = getPlayer();
    const pStats = getStats();
    const extras = getExtraWanted();

    // Active chase subjects (for join logic)
    const activeSubjects = [];
    if (pStats.alive && pStats.wanted && !pStats.inJail) {
      activeSubjects.push({
        body: player,
        stats: pStats,
        kind: "player",
        name: "You"
      });
    }
    for (const extra of extras) {
      if (
        extra?.stats?.alive &&
        extra.stats.wanted &&
        !extra.stats.inJail &&
        extra.body
      ) {
        activeSubjects.push(extra);
      }
    }

    const anyoneChasing = officers.some(
      (c) => c.alerted && isValidChase(c.chaseTarget)
    );
    const anyoneJailed =
      pStats.inJail || extras.some((w) => w.stats?.inJail);

    for (const cop of officers) {
      // Drop invalid targets
      if (cop.chaseTarget && !isValidChase(cop.chaseTarget)) {
        cop.alerted = false;
        cop.chaseTarget = null;
      }

      // Idle cop near an already-wanted suspect can join (saw them fleeing).
      if (!cop.alerted && activeSubjects.length > 0) {
        let nearest = null;
        let best = POLICE_JOIN_RANGE;
        for (const sub of activeSubjects) {
          const d = dist(cop.x, cop.y, sub.body.x, sub.body.y);
          if (d < best) {
            best = d;
            nearest = sub;
          }
        }
        if (nearest) {
          cop.alerted = true;
          cop.chaseTarget = nearest;
        }
      }

      let moveX = 0;
      let moveY = 0;
      let speed = POLICE_PATROL_SPEED;

      if (cop.alerted && isValidChase(cop.chaseTarget)) {
        const target = cop.chaseTarget;
        speed = POLICE_CHASE_SPEED;
        const dx = target.body.x - cop.x;
        const dy = target.body.y - cop.y;
        const d = Math.hypot(dx, dy) || 1;
        moveX = dx / d;
        moveY = dy / d;

        if (d <= POLICE_ARREST_RANGE) {
          jailSubject(target.stats, target.body, target.kind || "agent");
        }
      } else if (anyoneJailed && !anyoneChasing) {
        const tx = jail.x + random(-40, 40);
        const ty = jail.y + random(-40, 40);
        const dx = tx - cop.x;
        const dy = ty - cop.y;
        const len = Math.hypot(dx, dy) || 1;
        moveX = dx / len;
        moveY = dy / len;
        speed = POLICE_PATROL_SPEED * 0.35;
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

    // Clear wanted if no cop is still chasing them
    function clearWantedIfNoPursuit(stats) {
      if (!stats.wanted || stats.inJail) {
        return;
      }
      const stillHunted = officers.some(
        (c) => c.alerted && c.chaseTarget?.stats === stats
      );
      if (!stillHunted) {
        // Keep wanted only while at least one witness is still after them.
        // If all witnesses died/cleared, drop heat.
        stats.wanted = false;
      }
    }

    clearWantedIfNoPursuit(pStats);
    for (const extra of extras) {
      if (extra?.stats) {
        clearWantedIfNoPursuit(extra.stats);
      }
    }
  }

  return {
    officers,
    reportMurder,
    reportCrime,
    reportCrimeAt,
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
