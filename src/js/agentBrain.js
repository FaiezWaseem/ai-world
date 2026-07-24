import {
  FOOD,
  GUNS,
  INTERACT_DISTANCE,
  JOBS,
  LLM_CLIENT_TIMEOUT_MS,
  SPECIAL_BUILDINGS
} from "./config.js";

/**
 * One LLM request at a time so freemodel/container hosts don't explode
 * with "max instances exceeded". Chat gets priority by going through same queue.
 */
let llmQueue = Promise.resolve();

function enqueueLlm(task) {
  const run = llmQueue.then(task, task);
  // Don't let one failure kill the chain
  llmQueue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

async function postDecide(prompt, timeoutMs = LLM_CLIENT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

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
    return data;
  } finally {
    clearTimeout(timer);
  }
}

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
        `${a.name}${a.isPlayer ? " [HUMAN PLAYER]" : ""}${a.married ? ` [married→${a.spouse}]` : ""}${a.isChild ? " [child]" : ""} ($${a.money}, guns:[${(a.guns || []).join(",") || "none"}], hunger ${Math.round(a.hunger)}%) dist=${Math.round(a.dist)} said:"${a.lastSpeech || ""}"`
    )
    .join("; ");

  const gunsOwned = agent.stats.ownedGuns.join(", ") || "none";
  const job = agent.stats.job
    ? `${agent.stats.job.title} @ ${agent.stats.job.label}`
    : "unemployed";

  const playerHint = worldContext.playerNearby
    ? `The HUMAN PLAYER ("You") is nearby (dist ${Math.round(worldContext.playerNearby.dist)}). Prefer talking to them sometimes — set sayTo to "You".`
    : "Human player is not nearby.";

  const playerSaid = worldContext.recentPlayerChat
    ? `Player recently said: "${worldContext.recentPlayerChat}" — you may reply.`
    : "";

  return `You are ${agent.name}, an AI citizen in an open-world city simulation.
Personality: ${agent.personality}

Your goal: SURVIVE. Earn money, eat before hunger hits 0, pay taxes automatically.
You may socialize with OTHER AGENTS and the HUMAN PLAYER, buy guns, borrow money/guns, commit crimes, or help others.
IMPORTANT: When the human is nearby, greet or chat with them sometimes (action talk, sayTo "You").

STATE:
- money: $${agent.stats.money}
- debt owed: $${agent.stats.debt || 0}
- health: ${Math.round(agent.stats.health)}%
- hunger: ${Math.round(agent.stats.hunger)}% (drops 5% every 60s; 0 = death)
- job: ${job}
- guns owned: ${gunsOwned}
- equipped: ${agent.stats.equippedGunId || "none"}
- married: ${agent.spouseId ? `yes, to ${agent.spouseName}` : "no"}
- isChild: ${Boolean(agent.isChild)}
- kids: ${(agent.childIds || []).length}
- active goal/commitment: ${agent.goal ? agent.goal.label : "none"}
- wanted: ${agent.stats.wanted}
- inJail: ${agent.stats.inJail} (jailTimer=${agent.stats.jailTimer?.toFixed?.(1) || 0}s)
- position: (${Math.round(agent.x)}, ${Math.round(agent.y)})
- last action result: ${agent.lastResult || "none"}

IMPORTANT: If you have an active commitment (especially with the human), keep working on it. Do not randomly switch to work/jobs.

NEARBY BUILDINGS: ${nearby || "none"}
NEARBY PEOPLE: ${others || "none"}
${playerHint}
${playerSaid}

Valid actions (pick ONE primary action):
- wander — stroll randomly
- go_to — walk toward a place; target must be one of: ${Object.keys(SPECIAL_BUILDINGS).join(", ")}
- apply_job — apply for job at nearby workplace
- work — work a shift if employed and near workplace
- eat — buy food if near restaurant or grocery
- buy_gun — buy gun if at gunshop; target is gun id: ${GUNS.map((g) => g.id).join(", ")}
- equip_gun — equip owned gun; target = gun id
- buy_property — buy FOR SALE property
- borrow_money — ask nearby agent for cash; sayTo = their name; amount optional
- borrow_gun — ask nearby agent for a weapon; sayTo = their name
- marry — go to Marriage Hall and marry a single adult; sayTo/target = partner name
- divorce — leave your spouse (tool: always available if married)
- shoot — shoot nearest NPC (WANTED if seen)
- bribe — if in jail and money >= 250
- talk — speak; sayTo = agent name OR "You" for the human player
- wait — stand still

Kids cannot marry. Married couples can have up to 2 kids automatically over time.
Divorce is an explicit tool/action when unhappy.

Reply with ONLY compact JSON (no markdown):
{"thought":"short","say":"speech max 80 chars or null","sayTo":"You or agent name or null","action":"one of list","target":"optional","amount":0,"item":null}`;
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

  // Real estate if flush with cash
  if (s.money > 200 && Math.random() < 0.3) {
    return {
      thought: "Invest in property",
      say: "Looking at real estate.",
      sayTo: null,
      action: "buy_property",
      target: null
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

  // Divorce is rare so couples have time for kids (30s × up to 2)
  if (!agent.isChild && agent.spouseId && Math.random() < 0.008) {
    return {
      thought: "End marriage",
      say: "This isn't working.",
      sayTo: agent.spouseName,
      action: "divorce",
      target: null
    };
  }

  if (!agent.isChild && !agent.spouseId && Math.random() < 0.12) {
    const single = worldContext.nearbyAgents.find(
      (a) => !a.isPlayer && !a.married && !a.isChild
    );
    return {
      thought: "Get married at the hall",
      say: single
        ? `${single.name}, marry me?`
        : "Looking for love at the Marriage Hall.",
      sayTo: single?.name || null,
      action: "marry",
      target: single?.name?.toLowerCase() || null
    };
  }

  // Prefer talking to the human when nearby
  if (worldContext.playerNearby && Math.random() < 0.55) {
    return {
      thought: "Chat with the human player",
      say: pickPlayerChat(agent, worldContext),
      sayTo: "You",
      action: "talk",
      target: "you"
    };
  }

  const otherAgents = worldContext.nearbyAgents.filter((a) => !a.isPlayer);
  if (otherAgents.length && Math.random() < 0.4) {
    const other = otherAgents[0];
    return {
      thought: "Socialize with agent",
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

function pickPlayerChat(agent, worldContext) {
  const recent = worldContext.recentPlayerChat;
  if (recent) {
    const replies = [
      "Yeah, I hear you.",
      "Makes sense.",
      `I'm ${agent.name} — good talking.`,
      "Thanks for saying hi!",
      "Ha, true. This city is rough.",
      "Stay fed out there, friend."
    ];
    return replies[Math.floor(Math.random() * replies.length)];
  }

  const lines = [
    `Hey! I'm ${agent.name}. Welcome.`,
    "You're the human, right? Cool.",
    "Jobs pay — don't forget to eat.",
    "Cops only chase if they see you.",
    `I've got $${agent.stats.money}. Hustling.`,
    "Press T near me anytime to chat.",
    "Need a tip? Buy property for rent.",
    "We can borrow cash if we're close."
  ];
  return lines[Math.floor(Math.random() * lines.length)];
}

function pickChat(agent, other) {
  const lines = [
    `Hey ${other.name}, how are you surviving?`,
    `I'm ${agent.name}. Jobs pay, hunger is real.`,
    "Taxes hurt. Need another shift.",
    "Stay fed out there.",
    `Got $${agent.stats.money}. You?`,
    "Did you meet the human yet?"
  ];
  return lines[Math.floor(Math.random() * lines.length)];
}

/**
 * @param {string} prompt
 * @param {string} [agentName]
 * @returns {Promise<object|null>}
 */
export async function requestAgentDecision(prompt, agentName = "agent") {
  const tag = String(agentName || "agent").toLowerCase();

  return enqueueLlm(async () => {
    try {
      const data = await postDecide(prompt, LLM_CLIENT_TIMEOUT_MS);
      const raw = (data.text || "").trim();
      const decision = parseAgentDecision(raw);
      const action = decision?.action || "parse_fail";
      // [name][action][full model response]
      console.log(`[${tag}][${action}][${raw}]`);
      return decision;
    } catch (err) {
      const msg =
        err?.name === "AbortError"
          ? `timed out after ${LLM_CLIENT_TIMEOUT_MS / 1000}s`
          : err.message;
      console.warn(`[${tag}][error][${msg}]`);
      return null;
    }
  });
}

/**
 * Free-form chat reply (plain text, not JSON action).
 */
export async function requestChatReply(
  agent,
  playerLine,
  history = [],
  options = {}
) {
  const hist = history
    .slice(-6)
    .map((h) => `${h.from}: ${h.text}`)
    .join("\n");

  const goalNote = agent.goal
    ? `Your current commitment: "${agent.goal.label}" — you will do this after chatting unless you clearly refuse.`
    : "You have no special commitment yet.";

  const intentNote = options.intentHint ? `\n${options.intentHint}` : "";

  const prompt = `You are ${agent.name}, a citizen in a city game.
Personality: ${agent.personality}
Your status: money $${agent.stats.money}, hunger ${Math.round(agent.stats.hunger)}%, job ${agent.stats.job?.title || "none"}.
${goalNote}

You are face-to-face with the human player.
RULE: If they invite you to dinner/restaurant/follow/wait and you agree, say you will go there NOW. Never agree then talk about going to work instead.
If you must refuse, say no clearly.
${intentNote}

Recent chat:
${hist || "(start of talk)"}

Player just said: "${playerLine}"

Reply in ONE short spoken line (max 100 characters). Stay in character. No JSON, no quotes around the whole reply, no stage directions.`;

  const tag = String(agent.name || "agent").toLowerCase();

  return enqueueLlm(async () => {
    try {
      const data = await postDecide(prompt, LLM_CLIENT_TIMEOUT_MS);
      const raw = (data.text || "").trim();
      let text = raw;
      text = text.replace(/^```[\s\S]*?```$/g, "").trim();
      text = text.replace(/^["'“”]|["'“”]$/g, "").trim();
      if (text.startsWith("{")) {
        try {
          const obj = JSON.parse(text);
          text = obj.say || obj.reply || obj.text || text;
        } catch {
          /* keep */
        }
      }
      text = String(text).slice(0, 120) || null;
      // [name][chat][response]
      console.log(`[${tag}][chat][${text || raw}]`);
      return text;
    } catch (err) {
      const msg =
        err?.name === "AbortError"
          ? `timed out after ${LLM_CLIENT_TIMEOUT_MS / 1000}s`
          : err.message;
      console.warn(`[${tag}][chat_error][${msg}]`);
      return null;
    }
  });
}

export function fallbackChatReply(agent, playerLine) {
  const line = (playerLine || "").toLowerCase();

  // Social invites — default to yes so local AI matches commitments
  if (
    /dinner|lunch|restaurant|eat with|grab (a )?bite|food together|come with|follow me|wait here|hang out|meet me/.test(
      line
    )
  ) {
    return "Yes — I'll do that with you. Let's go.";
  }

  if (/money|cash|broke|loan|borrow/.test(line)) {
    return `I've got about $${agent.stats.money}. Work shifts help.`;
  }
  if (/job|work|hire/.test(line)) {
    return agent.stats.job
      ? `I'm a ${agent.stats.job.title}. Pays okay.`
      : "Still looking for work myself.";
  }
  if (/gun|weapon|shoot|bank/.test(line)) {
    return "Guns and banks mean heat. Be careful.";
  }
  if (/food|hungry|eat/.test(line)) {
    return "Markets and restaurants. Don't let hunger hit zero.";
  }
  if (/hi|hey|hello|how are/.test(line)) {
    return `Hey! I'm ${agent.name}. Good to talk.`;
  }
  const generic = [
    "Interesting. Tell me more.",
    "Yeah, this city never sleeps.",
    "I hear you.",
    `Stay safe out there — I'm ${agent.name}.`,
    "True enough.",
    "Ha. Fair point."
  ];
  return generic[Math.floor(Math.random() * generic.length)];
}
