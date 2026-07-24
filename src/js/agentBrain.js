import {
  FOOD,
  GUNS,
  INTERACT_DISTANCE,
  JOBS,
  SPECIAL_BUILDINGS
} from "./config.js";

/**
 * Build the LLM prompt for one agent turn.
 */
export function buildAgentPrompt(agent, worldContext) {
  const nearby = worldContext.nearbyPois
    .map(
      (p) =>
        `${p.type} "${SPECIAL_BUILDINGS[p.type]?.label || p.type}" dist=${Math.round(p.dist)}`
    )
    .join("; ");

  const others = worldContext.nearbyAgents
    .map(
      (a) =>
        `${a.name} ($${a.money}, guns:[${(a.guns || []).join(",") || "none"}], hunger ${Math.round(a.hunger)}%) dist=${Math.round(a.dist)} said:"${a.lastSpeech || ""}"`
    )
    .join("; ");

  const gunsOwned = agent.stats.ownedGuns.join(", ") || "none";
  const job = agent.stats.job
    ? `${agent.stats.job.title} @ ${agent.stats.job.label}`
    : "unemployed";

  return `You are ${agent.name}, an AI citizen in an open-world city simulation.
Personality: ${agent.personality}

Your goal: SURVIVE. Earn money, eat before hunger hits 0, pay taxes automatically.
You may socialize, buy guns, BORROW money/guns from nearby agents, commit crimes, or help others.

STATE:
- money: $${agent.stats.money}
- debt owed: $${agent.stats.debt || 0}
- health: ${Math.round(agent.stats.health)}%
- hunger: ${Math.round(agent.stats.hunger)}% (drops 5% every 60s; 0 = death)
- job: ${job}
- guns owned: ${gunsOwned}
- equipped: ${agent.stats.equippedGunId || "none"}
- wanted: ${agent.stats.wanted}
- inJail: ${agent.stats.inJail} (jailTimer=${agent.stats.jailTimer?.toFixed?.(1) || 0}s)
- position: (${Math.round(agent.x)}, ${Math.round(agent.y)})
- last action result: ${agent.lastResult || "none"}

NEARBY BUILDINGS (within walk): ${nearby || "none"}
NEARBY AGENTS (trade if dist small): ${others || "none"}

Valid actions (pick ONE primary action):
- wander — stroll randomly
- go_to — walk toward a place; target must be one of: ${Object.keys(SPECIAL_BUILDINGS).join(", ")}
- apply_job — apply for job at nearby workplace (target: school|restaurant|grocery|gym|office|barber|gunshop)
- work — work a shift if employed and near workplace
- eat — buy food if near restaurant or grocery
- buy_gun — buy gun if at gunshop; target is gun id: ${GUNS.map((g) => g.id).join(", ")}
- equip_gun — equip owned gun; target = gun id
- borrow_money — ask nearby agent for cash; sayTo/target = their name; amount = dollars (optional)
- borrow_gun — ask nearby agent for a weapon; sayTo = their name; item = gun id optional
- shoot — shoot nearest NPC (makes you WANTED if kill)
- bribe — if in jail and money >= 250
- talk — speak to nearby agents (use say + optional sayTo name)
- wait — stand still

Reply with ONLY compact JSON (no markdown):
{"thought":"short","say":"optional speech max 80 chars or null","sayTo":"agent name or null","action":"one of list","target":"optional string","amount":0,"item":null}`;
}

/**
 * Parse model text into an action object.
 */
export function parseAgentDecision(text) {
  if (!text || typeof text !== "string") {
    return null;
  }

  let raw = text.trim();
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) {
    raw = fence[1].trim();
  }

  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1) {
    return null;
  }

  try {
    const obj = JSON.parse(raw.slice(start, end + 1));
    return {
      thought: String(obj.thought || "").slice(0, 200),
      say: obj.say ? String(obj.say).slice(0, 80) : null,
      sayTo: obj.sayTo ? String(obj.sayTo).slice(0, 40) : null,
      action: String(obj.action || "wander").toLowerCase(),
      target: obj.target != null ? String(obj.target).toLowerCase() : null,
      amount:
        obj.amount != null && Number.isFinite(Number(obj.amount))
          ? Number(obj.amount)
          : null,
      item: obj.item != null ? String(obj.item).toLowerCase() : null
    };
  } catch {
    return null;
  }
}

/**
 * Rule-based survival brain when LLM is unavailable.
 */
export function fallbackDecision(agent, worldContext) {
  const s = agent.stats;

  if (s.inJail) {
    if (s.money >= 250) {
      return {
        thought: "Bribe out of jail",
        say: "I'll pay my way out.",
        sayTo: null,
        action: "bribe",
        target: null
      };
    }
    return {
      thought: "Serve time",
      say: "Counting the seconds...",
      sayTo: null,
      action: "wait",
      target: null
    };
  }

  if (s.hunger < 35) {
    const foodSpot = worldContext.nearbyPois.find(
      (p) => FOOD[p.type] && s.money >= (FOOD[p.type]?.cost || 99)
    );
    if (foodSpot && foodSpot.dist <= INTERACT_DISTANCE) {
      return {
        thought: "Hungry — eat now",
        say: "I need food.",
        sayTo: null,
        action: "eat",
        target: foodSpot.type
      };
    }

    // Broke and hungry → borrow cash from a richer neighbor
    const rich = worldContext.nearbyAgents.find(
      (a) => a.dist < 100 && a.money >= 15
    );
    if (s.money < 14 && rich) {
      return {
        thought: "Borrow cash for food",
        say: `${rich.name}, can I borrow $20 for food?`,
        sayTo: rich.name,
        action: "borrow_money",
        target: rich.name.toLowerCase(),
        amount: 20
      };
    }

    return {
      thought: "Find food",
      say: s.money < 7 ? "Need cash for food." : "Heading to eat.",
      sayTo: null,
      action: "go_to",
      target: s.money >= 14 ? "restaurant" : "grocery"
    };
  }

  // No weapon but someone nearby has one
  if (
    !s.ownedGuns.length &&
    Math.random() < 0.35
  ) {
    const armed = worldContext.nearbyAgents.find(
      (a) => a.dist < 100 && a.guns && a.guns.length > 0
    );
    if (armed) {
      return {
        thought: "Borrow a weapon",
        say: `${armed.name}, lend me a gun?`,
        sayTo: armed.name,
        action: "borrow_gun",
        target: armed.name.toLowerCase(),
        item: armed.guns[0] || null
      };
    }
  }

  // Low cash → try borrow before / while job hunting
  if (s.money < 12 && Math.random() < 0.4) {
    const rich = worldContext.nearbyAgents.find(
      (a) => a.dist < 100 && a.money >= 25
    );
    if (rich) {
      return {
        thought: "Borrow money",
        say: `Hey ${rich.name}, spare $${25}?`,
        sayTo: rich.name,
        action: "borrow_money",
        target: rich.name.toLowerCase(),
        amount: 25
      };
    }
  }

  // Need a job or more cash — always path toward a workplace first.
  if (!s.job || s.money < 40) {
    if (s.job) {
      const workType = s.job.type;
      const near = worldContext.nearbyPois.find(
        (p) => p.type === workType && p.dist <= INTERACT_DISTANCE
      );
      if (near) {
        return {
          thought: "Work for cash",
          say: "Another shift.",
          sayTo: null,
          action: "work",
          target: workType
        };
      }
      return {
        thought: "Go to work",
        say: "Off to my job.",
        sayTo: null,
        action: "go_to",
        target: workType
      };
    }

    // Prefer a concrete go_to so the agent walks across the map.
    const workplaceTypes = Object.keys(JOBS);
    const nearbyWork = worldContext.nearbyPois.find((p) => JOBS[p.type]);
    if (nearbyWork && nearbyWork.dist <= INTERACT_DISTANCE) {
      return {
        thought: "Apply for work",
        say: "Hiring?",
        sayTo: null,
        action: "apply_job",
        target: nearbyWork.type
      };
    }

    return {
      thought: "Find a job",
      say: "Looking for work.",
      sayTo: null,
      action: "go_to",
      target:
        nearbyWork?.type ||
        workplaceTypes[Math.floor(Math.random() * workplaceTypes.length)]
    };
  }

  // Optional crime / social when stable
  if (s.money > 80 && !s.ownedGuns.length && Math.random() < 0.25) {
    return {
      thought: "Buy protection",
      say: "Time for a gun.",
      sayTo: null,
      action: "go_to",
      target: "gunshop"
    };
  }

  if (
    s.ownedGuns.length &&
    s.equippedGunId &&
    s.hunger > 50 &&
    s.money > 40 &&
    Math.random() < 0.15
  ) {
    return {
      thought: "Risky crime for cash",
      say: "Easy money...",
      sayTo: null,
      action: "shoot",
      target: null
    };
  }

  if (worldContext.nearbyAgents.length && Math.random() < 0.35) {
    const other = worldContext.nearbyAgents[0];
    return {
      thought: "Socialize",
      say: pickChat(agent, other),
      sayTo: other.name,
      action: "talk",
      target: other.name.toLowerCase()
    };
  }

  return {
    thought: "Wander city",
    say: null,
    sayTo: null,
    action: "wander",
    target: null
  };
}

function pickChat(agent, other) {
  const lines = [
    `Hey ${other.name}, how are you surviving?`,
    `I'm ${agent.name}. Jobs pay, hunger is real.`,
    "Taxes hurt. Need another shift.",
    "Stay fed out there.",
    `Got $${agent.stats.money}. You?`
  ];
  return lines[Math.floor(Math.random() * lines.length)];
}

export async function requestAgentDecision(prompt) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);

  try {
    const res = await fetch("/api/agent/decide", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
      signal: controller.signal
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || `HTTP ${res.status}`);
    }
    return parseAgentDecision(data.text);
  } catch (err) {
    console.warn("[agent LLM]", err.message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
