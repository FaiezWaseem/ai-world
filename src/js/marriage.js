import {
  INTERACT_DISTANCE,
  KID_INTERVAL_SEC,
  MARRIAGE_RANGE,
  MAX_KIDS_PER_COUPLE
} from "./config.js";
import { edgeDistToBuilding, say } from "./agentActions.js";

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
    // Partner must also be near the hall
    agent.lastResult = `${partner.name} not at hall`;
    say(agent, `${partner.name}, come to the Marriage Hall!`, 3);
    say(partner, "On my way to the hall…", 3);
    // Nudge partner toward hall center
    partner.targetX = hall.x + hall.width / 2;
    partner.targetY = hall.y + hall.height / 2;
    partner.targetType = "marriage_hall";
    return false;
  }

  // Accept chance — friendly personalities more likely
  const accept =
    Math.random() <
    0.55 +
      (partner.personality?.includes("friendly") ? 0.25 : 0) +
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
  agent.kidTimer = 0;

  partner.spouseId = agent.id;
  partner.spouseName = agent.name;
  partner.childIds = partner.childIds || [];
  partner.kidTimer = 0;

  agent.lastResult = `married ${partner.name}`;
  partner.lastResult = `married ${agent.name}`;

  say(agent, `I do! Married ${partner.name}!`, 5);
  say(partner, `I do! Married ${agent.name}!`, 5);
  pushChat(agent.name, partner.name, "We're married!");
  pushChat(partner.name, agent.name, "I do!");
  pushChat("System", "all", `${agent.name} ❤️ ${partner.name} got married!`);

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
    spouse.spouseId = null;
    spouse.spouseName = null;
    spouse.kidTimer = 0;
    say(spouse, `${agent.name} divorced me…`, 4);
    pushChat(spouse.name, agent.name, "We're divorced.");
  }

  agent.spouseId = null;
  agent.spouseName = null;
  agent.kidTimer = 0;

  // Kids keep parent links; no longer a "couple" for new births
  agent.lastResult = `divorced ${spouseName}`;
  say(agent, `Divorced ${spouseName}.`, 4);
  pushChat(agent.name, spouseName, "I want a divorce.");
  pushChat("System", "all", `${agent.name} divorced ${spouseName}.`);

  return true;
}

/**
 * Tick family: birth kids every KID_INTERVAL_SEC, max MAX_KIDS_PER_COUPLE.
 * createKidFn(parentA, parentB) => new agent | null
 */
export function tickFamilies(agents, deltaSeconds, createKidFn, pushChat) {
  // Process each couple once (lower id initiates)
  const seen = new Set();

  for (const agent of agents) {
    if (!agent.stats.alive || !agent.spouseId || agent.isChild) {
      continue;
    }
    if (seen.has(agent.id)) {
      continue;
    }

    const spouse = findAgentById(agents, agent.spouseId);
    if (!spouse || !spouse.stats.alive || spouse.spouseId !== agent.id) {
      // Broken link
      if (!spouse || spouse.spouseId !== agent.id) {
        agent.spouseId = null;
        agent.spouseName = null;
      }
      continue;
    }

    seen.add(agent.id);
    seen.add(spouse.id);

    const pairKey = [agent.id, spouse.id].sort().join(":");
    // Use timer on the agent with smaller id
    const timerHost =
      agent.id < spouse.id ? agent : spouse;
    timerHost.kidTimer = (timerHost.kidTimer || 0) + deltaSeconds;

    const kidsA = agent.childIds || [];
    const kidsB = spouse.childIds || [];
    // Count living shared kids
    const livingKids = agents.filter(
      (c) =>
        c.isChild &&
        c.stats.alive &&
        c.parentIds &&
        c.parentIds.includes(agent.id) &&
        c.parentIds.includes(spouse.id)
    );

    if (livingKids.length >= MAX_KIDS_PER_COUPLE) {
      continue;
    }

    if (timerHost.kidTimer >= KID_INTERVAL_SEC) {
      timerHost.kidTimer = 0;
      const kid = createKidFn(agent, spouse);
      if (kid) {
        pushChat(
          "System",
          "all",
          `${agent.name} & ${spouse.name} had a kid: ${kid.name}!`
        );
        say(agent, `Our kid ${kid.name}!`, 4);
        say(spouse, `Welcome ${kid.name}!`, 4);
      }
    }
  }
}

export function findMarriageHall(buildingColliders) {
  return buildingColliders.find((b) => b.type === "marriage_hall") || null;
}
