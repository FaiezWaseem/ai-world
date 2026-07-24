import {
  INTERACT_DISTANCE,
  KID_INTERVAL_SEC,
  MARRIAGE_RANGE,
  MAX_KIDS_PER_COUPLE
} from "./config.js";
import { edgeDistToBuilding, say } from "./agentActions.js";

/** coupleKey -> seconds since last birth (or since marriage) */
const coupleKidTimers = new Map();

function atMarriageHall(agent, buildingColliders) {
  for (const b of buildingColliders) {
    if (b.type !== "marriage_hall") {
      continue;
    }
    if (edgeDistToBuilding(agent.x, agent.y, b) <= INTERACT_DISTANCE + 25) {
      return b;
    }
  }
  return null;
}

function findAgentById(agents, id) {
  return agents.find((a) => a.id === id) || null;
}

function findAgentByName(agents, name) {
  if (!name) {
    return null;
  }
  const n = String(name).toLowerCase();
  return (
    agents.find((a) => a.name.toLowerCase() === n && a.stats.alive) || null
  );
}

function coupleKey(idA, idB) {
  return idA < idB ? `${idA}::${idB}` : `${idB}::${idA}`;
}

/**
 * Marry two single adult AIs at the marriage hall.
 */
export function doMarry(agent, decision, agents, buildingColliders, pushChat) {
  if (agent.isChild) {
    agent.lastResult = "kids can't marry";
    say(agent, "I'm too young!", 3);
    return false;
  }
  if (agent.spouseId) {
    agent.lastResult = "already married";
    say(agent, `I'm with ${agent.spouseName}!`, 3);
    return false;
  }

  const hall = atMarriageHall(agent, buildingColliders);
  if (!hall) {
    agent.lastResult = "need marriage hall";
    say(agent, "Meet me at the Marriage Hall!", 3);
    return false;
  }

  const nameHint = decision.target || decision.sayTo;
  let partner =
    findAgentByName(agents, nameHint) ||
    agents.find(
      (a) =>
        a !== agent &&
        a.stats.alive &&
        !a.isChild &&
        !a.spouseId &&
        Math.hypot(a.x - agent.x, a.y - agent.y) <= MARRIAGE_RANGE
    );

  if (!partner) {
    agent.lastResult = "no partner nearby";
    say(agent, "Anyone want to get married?", 3);
    return false;
  }

  if (partner.isChild || partner.spouseId) {
    agent.lastResult = "partner unavailable";
    return false;
  }

  if (!atMarriageHall(partner, buildingColliders)) {
    agent.lastResult = `${partner.name} not at hall`;
    say(agent, `${partner.name}, come to the Marriage Hall!`, 3);
    say(partner, "On my way to the hall…", 3);
    partner.targetX = hall.x + hall.width / 2;
    partner.targetY = hall.y + hall.height / 2;
    partner.targetType = "marriage_hall";
    return false;
  }

  // High accept rate so marriages actually stick for family sim
  const accept =
    Math.random() <
    0.75 +
      (partner.personality?.includes("friendly") ? 0.15 : 0) +
      (agent.personality?.includes("friendly") ? 0.1 : 0);

  if (!accept) {
    agent.lastResult = `${partner.name} said no`;
    say(agent, `Will you marry me, ${partner.name}?`, 3);
    say(partner, "Not ready for marriage.", 3);
    pushChat(agent.name, partner.name, "Will you marry me?");
    pushChat(partner.name, agent.name, "Not ready.");
    return false;
  }

  agent.spouseId = partner.id;
  agent.spouseName = partner.name;
  agent.childIds = agent.childIds || [];
  agent.marriedAt = performance.now();

  partner.spouseId = agent.id;
  partner.spouseName = agent.name;
  partner.childIds = partner.childIds || [];
  partner.marriedAt = performance.now();

  // Fresh couple timer for kids
  const key = coupleKey(agent.id, partner.id);
  coupleKidTimers.set(key, 0);

  agent.lastResult = `married ${partner.name}`;
  partner.lastResult = `married ${agent.name}`;

  say(agent, `I do! Married ${partner.name}!`, 5);
  say(partner, `I do! Married ${agent.name}!`, 5);
  pushChat(agent.name, partner.name, "We're married!");
  pushChat(partner.name, agent.name, "I do!");
  pushChat("System", "all", `${agent.name} ❤️ ${partner.name} got married!`);
  console.log(
    `[family][married][${agent.name}+${partner.name}] kids in ${KID_INTERVAL_SEC}s`
  );

  return true;
}

/**
 * Divorce tool — dissolve marriage (kids remain in the world).
 */
export function doDivorce(agent, agents, pushChat) {
  if (!agent.spouseId) {
    agent.lastResult = "not married";
    say(agent, "I'm single.", 2);
    return false;
  }

  const spouse = findAgentById(agents, agent.spouseId);
  const spouseName = agent.spouseName || spouse?.name || "them";

  if (spouse) {
    coupleKidTimers.delete(coupleKey(agent.id, spouse.id));
    spouse.spouseId = null;
    spouse.spouseName = null;
    spouse.marriedAt = null;
    say(spouse, `${agent.name} divorced me…`, 4);
    pushChat(spouse.name, agent.name, "We're divorced.");
  }

  agent.spouseId = null;
  agent.spouseName = null;
  agent.marriedAt = null;

  agent.lastResult = `divorced ${spouseName}`;
  say(agent, `Divorced ${spouseName}.`, 4);
  pushChat(agent.name, spouseName, "I want a divorce.");
  pushChat("System", "all", `${agent.name} divorced ${spouseName}.`);
  console.log(`[family][divorce][${agent.name}+${spouseName}]`);

  return true;
}

function countLivingKids(agents, parentA, parentB) {
  return agents.filter(
    (c) =>
      c.stats?.alive &&
      Array.isArray(c.parentIds) &&
      c.parentIds.includes(parentA.id) &&
      c.parentIds.includes(parentB.id)
  ).length;
}

/**
 * Tick family: birth kids every KID_INTERVAL_SEC, max MAX_KIDS_PER_COUPLE.
 * createKidFn(parentA, parentB) => new agent | null
 */
export function tickFamilies(agents, deltaSeconds, createKidFn, pushChat) {
  const processed = new Set();

  for (const agent of agents) {
    if (!agent?.stats?.alive || !agent.spouseId || agent.isChild) {
      continue;
    }

    const spouse = findAgentById(agents, agent.spouseId);
    if (!spouse?.stats?.alive) {
      continue;
    }
    // Mutual marriage required
    if (spouse.spouseId !== agent.id) {
      continue;
    }

    const key = coupleKey(agent.id, spouse.id);
    if (processed.has(key)) {
      continue;
    }
    processed.add(key);

    const livingKids = countLivingKids(agents, agent, spouse);
    if (livingKids >= MAX_KIDS_PER_COUPLE) {
      continue;
    }

    const prev = coupleKidTimers.get(key) || 0;
    const next = prev + deltaSeconds;
    coupleKidTimers.set(key, next);

    if (next >= KID_INTERVAL_SEC) {
      coupleKidTimers.set(key, 0);
      try {
        const kid = createKidFn(agent, spouse);
        if (kid) {
          console.log(
            `[family][birth][${agent.name}+${spouse.name}→${kid.name}] (${livingKids + 1}/${MAX_KIDS_PER_COUPLE})`
          );
          pushChat(
            "System",
            "all",
            `${agent.name} & ${spouse.name} had a kid: ${kid.name}!`
          );
          say(agent, `Our kid ${kid.name}!`, 4);
          say(spouse, `Welcome ${kid.name}!`, 4);
        } else {
          console.warn(
            `[family][birth_fail][${agent.name}+${spouse.name}] createKid returned null`
          );
        }
      } catch (err) {
        console.error(
          `[family][birth_error][${agent.name}+${spouse.name}]`,
          err
        );
      }
    }
  }

  // Drop timers for couples that no longer exist
  for (const key of coupleKidTimers.keys()) {
    if (!processed.has(key)) {
      // Keep timer only if both still married to each other
      const [idA, idB] = key.split("::");
      const a = findAgentById(agents, idA);
      const b = findAgentById(agents, idB);
      if (
        !a?.spouseId ||
        !b?.spouseId ||
        a.spouseId !== b.id ||
        b.spouseId !== a.id
      ) {
        coupleKidTimers.delete(key);
      }
    }
  }
}

export function findMarriageHall(buildingColliders) {
  return buildingColliders.find((b) => b.type === "marriage_hall") || null;
}

export function getCoupleKidTimer(idA, idB) {
  return coupleKidTimers.get(coupleKey(idA, idB)) || 0;
}
