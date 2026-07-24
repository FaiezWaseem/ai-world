import {
  AGENT_SIZE,
  AGENT_SPEED,
  AGENT_SPEECH_RANGE,
  AGENT_THINK_MAX_SEC,
  AGENT_THINK_MIN_SEC,
  DEFAULT_AGENT_COUNT,
  JOBS,
  ROAD_SIZE,
  SPECIAL_BUILDINGS,
  WORLD_HEIGHT,
  WORLD_WIDTH
} from "./config.js";
import {
  doApplyJob,
  doBorrowGun,
  doBorrowMoney,
  doBuyGun,
  doEat,
  doShoot,
  doTalk,
  doWork,
  edgeDistToBuilding,
  say
} from "./agentActions.js";
import {
  buildAgentPrompt,
  fallbackDecision,
  requestAgentDecision
} from "./agentBrain.js";
import { clamp, random } from "./helpers.js";
import { createPlayerStats, tickSurvival } from "./player.js";

const AGENT_NAMES = [
  "Ava", "Ben", "Cora", "Dex", "Elena", "Finn", "Gwen", "Hiro", "Ivy", "Jules"
];

const PERSONALITIES = [
  "cautious worker who prioritizes food and steady jobs",
  "ambitious hustler who stacks cash fast",
  "friendly chatter who loves talking to others",
  "risk-taker who might buy guns and commit crimes",
  "law-abiding citizen who avoids police trouble",
  "opportunist who does whatever maximizes survival"
];

const AGENT_COLORS = [
  0xf472b6, 0xa78bfa, 0x34d399, 0xfbbf24,
  0x60a5fa, 0xfb7185, 0x2dd4bf, 0xe879f9
];

function dist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

function nearestBuilding(x, y, buildingColliders, typeFilter = null) {
  let best = null;
  let bestD = Infinity;
  for (const b of buildingColliders) {
    if (!b.type || !SPECIAL_BUILDINGS[b.type]) {
      continue;
    }
    if (typeFilter && b.type !== typeFilter) {
      continue;
    }
    const cx = b.x + b.width / 2;
    const cy = b.y + b.height / 2;
    const d = dist(x, y, cx, cy);
    if (d < bestD) {
      bestD = d;
      best = { building: b, dist: d, cx, cy };
    }
  }
  return best;
}

function createAgentVisual(color, name) {
  const root = new PIXI.Container();
  const shadow = new PIXI.Graphics();
  const body = new PIXI.Graphics();
  const label = new PIXI.Text({
    text: name,
    style: {
      fontFamily: "Arial",
      fontSize: 11,
      fontWeight: "bold",
      fill: 0xffffff,
      dropShadow: { color: 0x000000, alpha: 0.85, blur: 2, distance: 1 }
    }
  });
  label.anchor.set(0.5, 1);
  label.y = -AGENT_SIZE / 2 - 4;

  const bubbleBg = new PIXI.Graphics();
  bubbleBg.visible = false;

  const bubble = new PIXI.Text({
    text: "",
    style: {
      fontFamily: "Arial",
      fontSize: 13,
      fontWeight: "bold",
      fill: 0x111827,
      wordWrap: true,
      wordWrapWidth: 160,
      align: "center",
      lineHeight: 16
    }
  });
  bubble.anchor.set(0.5, 1);
  bubble.y = -AGENT_SIZE / 2 - 22;
  bubble.visible = false;

  shadow.ellipse(0, 10, 14, 7).fill({ color: 0x000000, alpha: 0.25 });
  body
    .circle(0, 0, AGENT_SIZE / 2)
    .fill({ color })
    .stroke({ color: 0xffffff, width: 2 });
  body.poly([0, -14, -5, -6, 5, -6]).fill({ color: 0xffffff });

  root.addChild(shadow, body, label, bubbleBg, bubble);
  root.bubble = bubble;
  root.bubbleBg = bubbleBg;
  return root;
}

export function createAgentSystem({
  agentLayer,
  buildingColliders,
  npcSystem,
  effectsLayer,
  police,
  count = DEFAULT_AGENT_COUNT
}) {
  const agents = [];
  const chatLog = [];

  function pushChat(from, to, text) {
    chatLog.push({ t: performance.now(), from, to, text });
    if (chatLog.length > 40) {
      chatLog.shift();
    }
  }

  function createOne(index) {
    const name = AGENT_NAMES[index % AGENT_NAMES.length];
    const color = AGENT_COLORS[index % AGENT_COLORS.length];
    const visual = createAgentVisual(color, name);
    visual.x = ROAD_SIZE / 2 + random(80, 400);
    visual.y = ROAD_SIZE / 2 + random(80, 400);

    const stats = createPlayerStats();
    stats.money = Math.floor(random(5, 25));
    stats.message = "";
    stats.messageTimer = 0;

    const agent = {
      id: `agent-${index}`,
      name,
      personality: PERSONALITIES[index % PERSONALITIES.length],
      color,
      stats,
      targetX: null,
      targetY: null,
      targetType: null,
      thinkTimer: random(1, 4),
      thinking: false,
      speech: "",
      speechTimer: 0,
      lastSpeech: "",
      lastResult: "spawned",
      currentAction: "wander",
      visual,
      bubble: visual.bubble
    };

    Object.defineProperty(agent, "x", {
      get: () => visual.x,
      set: (v) => {
        visual.x = v;
      }
    });
    Object.defineProperty(agent, "y", {
      get: () => visual.y,
      set: (v) => {
        visual.y = v;
      }
    });
    Object.defineProperty(agent, "rotation", {
      get: () => visual.rotation,
      set: (v) => {
        visual.rotation = v;
      }
    });

    agentLayer.addChild(visual);
    agents.push(agent);
    return agent;
  }

  for (let i = 0; i < count; i++) {
    createOne(i);
  }

  function worldContextFor(agent) {
    const nearbyPois = [];
    for (const b of buildingColliders) {
      if (!b.type || !SPECIAL_BUILDINGS[b.type]) {
        continue;
      }
      const d = edgeDistToBuilding(agent.x, agent.y, b);
      if (d < 700) {
        nearbyPois.push({ type: b.type, dist: d, id: b.id });
      }
    }
    nearbyPois.sort((a, b) => a.dist - b.dist);

    const nearbyAgents = agents
      .filter((a) => a !== agent && a.stats.alive)
      .map((a) => ({
        name: a.name,
        money: a.stats.money,
        guns: [...(a.stats.ownedGuns || [])],
        hunger: a.stats.hunger,
        dist: dist(agent.x, agent.y, a.x, a.y),
        lastSpeech: a.lastSpeech
      }))
      .filter((a) => a.dist < AGENT_SPEECH_RANGE * 2)
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 5);

    return { nearbyPois, nearbyAgents };
  }

  function moveToward(agent, tx, ty, deltaSeconds) {
    const dx = tx - agent.x;
    const dy = ty - agent.y;
    const d = Math.hypot(dx, dy);
    if (d < 6) {
      return true;
    }
    const step = AGENT_SPEED * deltaSeconds;
    agent.x = clamp(
      agent.x + (dx / d) * Math.min(step, d),
      AGENT_SIZE,
      WORLD_WIDTH - AGENT_SIZE
    );
    agent.y = clamp(
      agent.y + (dy / d) * Math.min(step, d),
      AGENT_SIZE,
      WORLD_HEIGHT - AGENT_SIZE
    );
    agent.rotation = Math.atan2(dy, dx) + Math.PI / 2;
    return d <= step;
  }

  function executeDecision(agent, decision) {
    if (!decision || !agent.stats.alive) {
      return;
    }

    if (decision.say && decision.action !== "talk") {
      say(agent, decision.say, 3.5);
      pushChat(agent.name, decision.sayTo || "all", decision.say);
    }

    agent.currentAction = decision.action;
    const ctx = worldContextFor(agent);

    switch (decision.action) {
      case "go_to": {
        const type = decision.target;
        const hit = nearestBuilding(
          agent.x,
          agent.y,
          buildingColliders,
          type && SPECIAL_BUILDINGS[type] ? type : null
        );
        if (hit) {
          agent.targetX = hit.cx;
          agent.targetY = hit.cy;
          agent.targetType = hit.building.type;
          agent.lastResult = `going to ${hit.building.type}`;
        } else {
          agent.lastResult = "go_to failed";
        }
        break;
      }
      case "wander":
        agent.targetX = clamp(agent.x + random(-280, 280), 40, WORLD_WIDTH - 40);
        agent.targetY = clamp(agent.y + random(-280, 280), 40, WORLD_HEIGHT - 40);
        agent.targetType = null;
        agent.lastResult = "wandering";
        break;
      case "apply_job":
        doApplyJob(agent, buildingColliders, decision.target || "office");
        break;
      case "work":
        doWork(agent, buildingColliders);
        break;
      case "eat":
        doEat(agent, buildingColliders);
        break;
      case "buy_gun":
        doBuyGun(agent, buildingColliders, decision.target || "pistol");
        break;
      case "equip_gun":
        if (decision.target && agent.stats.ownedGuns.includes(decision.target)) {
          agent.stats.equippedGunId = decision.target;
          agent.lastResult = `equipped ${decision.target}`;
        }
        break;
      case "shoot":
        doShoot(agent, npcSystem, effectsLayer, police);
        break;
      case "bribe":
        if (police && agent.stats.inJail) {
          const ok = police.tryBribeFor(agent.stats, agent);
          agent.lastResult = ok ? "bribed free" : "bribe failed";
        }
        break;
      case "talk":
        doTalk(agent, decision, ctx, agents, pushChat);
        break;
      case "borrow_money":
      case "borrow":
      case "loan": {
        const lenderName = decision.target || decision.sayTo;
        const lender = agents.find(
          (a) =>
            a !== agent &&
            a.stats.alive &&
            (!lenderName ||
              a.name.toLowerCase() === String(lenderName).toLowerCase())
        );
        // Walk over if too far to trade.
        if (
          lender &&
          dist(agent.x, agent.y, lender.x, lender.y) > 90
        ) {
          agent.targetX = lender.x;
          agent.targetY = lender.y;
          agent.targetType = null;
          agent.pendingBorrow = {
            kind: "money",
            decision: { ...decision, target: lender.name.toLowerCase() }
          };
          agent.lastResult = `walking to borrow from ${lender.name}`;
          say(agent, `Hey ${lender.name}, wait up!`, 2.5);
        } else {
          doBorrowMoney(agent, decision, agents, pushChat);
        }
        break;
      }
      case "borrow_gun":
      case "borrow_weapon": {
        const lenderName = decision.sayTo || decision.target;
        const gunIds = new Set(["pistol", "shotgun", "smg", "rifle", "sniper"]);
        const nameHint =
          lenderName && !gunIds.has(String(lenderName).toLowerCase())
            ? lenderName
            : decision.sayTo;
        const lender = agents.find(
          (a) =>
            a !== agent &&
            a.stats.alive &&
            a.stats.ownedGuns?.length &&
            (!nameHint ||
              a.name.toLowerCase() === String(nameHint).toLowerCase())
        );
        if (
          lender &&
          dist(agent.x, agent.y, lender.x, lender.y) > 90
        ) {
          agent.targetX = lender.x;
          agent.targetY = lender.y;
          agent.pendingBorrow = {
            kind: "gun",
            decision: { ...decision, sayTo: lender.name }
          };
          agent.lastResult = `walking to borrow gun from ${lender.name}`;
          say(agent, `${lender.name}, need your gun!`, 2.5);
        } else {
          doBorrowGun(agent, decision, agents, pushChat);
        }
        break;
      }
      case "wait":
        agent.targetX = null;
        agent.targetY = null;
        agent.lastResult = "waiting";
        break;
      default:
        agent.lastResult = `unknown action ${decision.action}`;
    }
  }

  /** Instant local survival plan — never blocks on the network. */
  function planLocally(agent) {
    if (!agent.stats.alive || agent.stats.inJail) {
      return;
    }
    const ctx = worldContextFor(agent);
    const decision = fallbackDecision(agent, ctx);
    executeDecision(agent, decision);

    // Talk / work / wait may not set a path — always keep them walking.
    if (agent.targetX == null) {
      executeDecision(agent, {
        thought: "keep moving",
        say: null,
        sayTo: null,
        action: "wander",
        target: null
      });
    }

    agent.lastResult = `${agent.lastResult || "planned"} [local]`;
  }

  /**
   * Optional LLM rethink in the background.
   * Movement already comes from planLocally so agents never freeze waiting on API.
   */
  async function thinkWithLlm(agent) {
    if (agent.thinking || !agent.stats.alive || agent.stats.inJail) {
      return;
    }
    agent.thinking = true;
    const ctx = worldContextFor(agent);

    try {
      const prompt = buildAgentPrompt(agent, ctx);
      const decision = await requestAgentDecision(prompt);
      if (decision && agent.stats.alive && !agent.stats.inJail) {
        executeDecision(agent, decision);
        agent.lastResult = `${agent.lastResult || "ok"} [llm]`;
      }
    } catch (err) {
      agent.lastResult = `llm error: ${err.message}`;
    } finally {
      agent.thinking = false;
      agent.thinkTimer = random(AGENT_THINK_MIN_SEC, AGENT_THINK_MAX_SEC);
    }
  }

  // Start walking immediately on spawn (don't wait for first think tick).
  for (const agent of agents) {
    planLocally(agent);
    agent.thinkTimer = random(2, 5);
  }

  function updateAgents(deltaSeconds) {
    for (const agent of agents) {
      if (agent.stats.inJail) {
        const spot = police?.getJailSpot?.();
        if (spot) {
          agent.x = spot.x + random(-8, 8);
          agent.y = spot.y + random(-8, 8);
        }
        tickSurvival(agent.stats, deltaSeconds, {
          silent: true,
          name: agent.name
        });
        agent.stats.jailTimer = Math.max(
          0,
          (agent.stats.jailTimer || 0) - deltaSeconds
        );
        if (agent.stats.jailTimer <= 0 && agent.stats.inJail && police) {
          police.releaseSubject(agent.stats, agent);
        }
      } else {
        tickSurvival(agent.stats, deltaSeconds, {
          silent: true,
          name: agent.name
        });
      }

      if (!agent.stats.alive) {
        agent.visual.alpha = 0.35;
        agent.bubble.visible = false;
        if (agent.visual.bubbleBg) {
          agent.visual.bubbleBg.visible = false;
        }
        continue;
      }
      agent.visual.alpha = 1;

      if (agent.speechTimer > 0) {
        agent.speechTimer -= deltaSeconds;
        if (agent.speechTimer <= 0) {
          agent.bubble.visible = false;
          agent.speech = "";
          if (agent.visual.bubbleBg) {
            agent.visual.bubbleBg.visible = false;
          }
        }
      }

      // Always keep a destination so agents roam the map.
      if (!agent.stats.inJail && agent.targetX == null) {
        planLocally(agent);
      }

      if (!agent.stats.inJail && agent.targetX != null) {
        const destType = agent.targetType;
        const arrived = moveToward(
          agent,
          agent.targetX,
          agent.targetY,
          deltaSeconds
        );
        if (arrived) {
          agent.targetX = null;
          agent.targetY = null;
          agent.targetType = null;
          if (agent.pendingBorrow) {
            const pending = agent.pendingBorrow;
            agent.pendingBorrow = null;
            if (pending.kind === "money") {
              doBorrowMoney(agent, pending.decision, agents, pushChat);
            } else if (pending.kind === "gun") {
              doBorrowGun(agent, pending.decision, agents, pushChat);
            }
          } else if (destType === "restaurant" || destType === "grocery") {
            doEat(agent, buildingColliders);
          } else if (agent.stats.job && destType === agent.stats.job.type) {
            doWork(agent, buildingColliders);
          } else if (destType && JOBS[destType] && !agent.stats.job) {
            doApplyJob(agent, buildingColliders, destType);
          } else if (destType === "gunshop") {
            doBuyGun(agent, buildingColliders, "pistol");
          }
          // Immediately pick next goal so they don't stand still.
          planLocally(agent);
        }
      }

      // Periodic LLM “personality” pass (does not gate movement).
      if (!agent.thinking) {
        agent.thinkTimer -= deltaSeconds;
        if (agent.thinkTimer <= 0) {
          thinkWithLlm(agent);
        }
      }
    }
  }

  return {
    agents,
    updateAgents,
    getWantedSubjects: () =>
      agents
        .filter((a) => a.stats.alive && a.stats.wanted && !a.stats.inJail)
        .map((a) => ({
          body: a,
          stats: a.stats,
          kind: "agent",
          name: a.name
        })),
    getChatLog: () => chatLog.slice(-12)
  };
}

export async function fetchAgentCount() {
  try {
    const res = await fetch("/api/config");
    if (!res.ok) {
      return DEFAULT_AGENT_COUNT;
    }
    const data = await res.json();
    return Number(data.agentCount) || DEFAULT_AGENT_COUNT;
  } catch {
    return DEFAULT_AGENT_COUNT;
  }
}
