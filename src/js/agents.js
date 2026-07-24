import {
  AGENT_PLAYER_TALK_RANGE,
  AGENT_SIZE,
  AGENT_SPEED,
  AGENT_SPEECH_RANGE,
  AGENT_THINK_MAX_SEC,
  AGENT_THINK_MIN_SEC,
  CELL_SIZE,
  DEFAULT_AGENT_COUNT,
  JOBS,
  KID_GROW_SEC,
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
  doBuyProperty,
  doEat,
  doShoot,
  doTalk,
  doWork,
  edgeDistToBuilding,
  say
} from "./agentActions.js";
import { isBuyable, tickPropertyRent } from "./properties.js";
import {
  buildAgentPrompt,
  fallbackChatReply,
  fallbackDecision,
  requestAgentDecision,
  requestChatReply
} from "./agentBrain.js";
import {
  PRIORITY,
  clearGoal,
  criticalNeed,
  hasActiveGoal,
  isRefusal,
  parsePlayerIntent,
  setGoal
} from "./agentGoals.js";
import { createConversationUi } from "./conversationUi.js";
import { clamp, random } from "./helpers.js";
import {
  doDivorce,
  doMarry,
  findMarriageHall,
  tickFamilies
} from "./marriage.js";
import {
  createPlayerStats,
  setPlayerMessage,
  tickSurvival
} from "./player.js";

const KID_NAMES = [
  "Sam",
  "Rio",
  "Max",
  "Sky",
  "Lee",
  "Zoe",
  "Kai",
  "Ash",
  "Noa",
  "Remy",
  "Pax",
  "Quin"
];
let nextAgentSerial = 0;
let kidNameIndex = 0;

/**
 * Customize AI citizens here.
 * - name: shown above head + chat
 * - personality: sent to the LLM and used by local AI (keywords: friendly, cautious, risk, crime, law)
 * - color: body + minimap dot (hex number, e.g. 0xf472b6)
 *
 * AGENT_COUNT in .env controls how many spawn (cycles this list).
 */
const AGENT_PROFILES = [
  {
    name: "Ava",
    personality:
      "cautious worker who prioritizes food and steady jobs; avoids crime",
    color: 0xf472b6
  },
  {
    name: "Ben",
    personality:
      "ambitious hustler who stacks cash fast and buys property when rich, will kill anyone for money",
    color: 0xa78bfa
  },
  {
    name: "Cora",
    personality:
      "Gangster type who likes guns, bank heists, and risky behavior",
    color: 0x34d399
  },
  {
    name: "Dex",
    personality:
      "risk-taker who might buy guns, rob the bank, and commit crimes",
    color: 0xfbbf24
  },
  {
    name: "Elena",
    personality:
      "law-abiding citizen who avoids police trouble and helps neighbors",
    color: 0x60a5fa
  },
  {
    name: "Finn",
    personality:
      "opportunist who does whatever maximizes survival; will borrow cash",
    color: 0xfb7185
  },
  {
    name: "Gwen",
    personality: "friendly shopkeeper type; prefers jobs and honest work",
    color: 0x2dd4bf
  },
  {
    name: "Hiro",
    personality: "quiet cautious saver; rarely lends guns; hates risk",
    color: 0xe879f9
  },
  {
    name: "Ivy",
    personality: "social butterfly; always greets the human when nearby",
    color: 0xf9a8d4
  },
  {
    name: "Jules",
    personality: "cool risk-taker; interested in guns and bank heists",
    color: 0x94a3b8
  }
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
  getPlayer = () => null,
  getPlayerStats = () => null,
  count = DEFAULT_AGENT_COUNT
}) {
  const agents = [];
  const chatLog = [];
  /** Recent lines the human said (agents can react). */
  let lastPlayerLine = "";
  let lastPlayerLineAt = 0;

  /** Face-to-face conversation with human (agent freezes). */
  let conversationAgent = null;
  let conversationBusy = false;
  const conversationHistory = [];
  const convoUi = createConversationUi();

  function pushChat(from, to, text) {
    chatLog.push({ t: performance.now(), from, to, text });
    if (chatLog.length > 40) {
      chatLog.shift();
    }
  }

  function isInConversation() {
    return Boolean(conversationAgent);
  }

  function endConversation(silent = false) {
    let statusMsg = "Conversation ended.";
    if (conversationAgent) {
      const ag = conversationAgent;
      ag.inConversation = false;
      ag.pendingBorrow = null;
      // Resume promise made during chat
      if (ag.goal && ag.goal.source === "player_promise") {
        applyGoalMovement(ag);
        ag.thinkTimer = random(12, 20);
        statusMsg = `${ag.name} is going: ${ag.goal.label}`;
        if (!silent) {
          say(ag, `Okay — ${ag.goal.label}.`, 4);
          pushChat(ag.name, "You", `I'm off to: ${ag.goal.label}`);
        }
      } else if (ag.pausedGoal && performance.now() < ag.pausedGoal.expiresAt) {
        ag.goal = ag.pausedGoal;
        applyGoalMovement(ag);
        statusMsg = `${ag.name} continues: ${ag.goal.label}`;
      } else {
        clearGoal(ag);
        ag.thinkTimer = random(2, 5);
        if (!silent) {
          say(ag, "See you around.", 3);
          pushChat(ag.name, "You", "See you around.");
        }
      }
      ag.pausedGoal = null;
    }
    conversationAgent = null;
    conversationBusy = false;
    conversationHistory.length = 0;
    convoUi.close();
    const pStats = getPlayerStats();
    if (pStats && !silent) {
      setPlayerMessage(pStats, statusMsg, 2.5);
    }
  }

  async function handlePlayerChatMessage(text) {
    if (!conversationAgent || conversationBusy) {
      return;
    }
    const agent = conversationAgent;
    const pStats = getPlayerStats();

    lastPlayerLine = text;
    lastPlayerLineAt = performance.now();
    conversationHistory.push({ from: "You", text });
    pushChat("You", agent.name, text);
    convoUi.addLine("You", text, "you");

    conversationBusy = true;
    convoUi.setBusy(true);
    convoUi.addLine("…", `${agent.name} is thinking…`, "system");

    const intent = parsePlayerIntent(text);

    // If the player made a clear request, bias the model to agree + commit
    let reply = await requestChatReply(agent, text, conversationHistory, {
      intentHint: intent
        ? `The player asked you to: ${intent.label}. If you agree, say you will do it NOW. Do not say you will go to work instead.`
        : null
    });
    if (!reply) {
      reply = intent?.agreeLine || fallbackChatReply(agent, text);
    }

    // Remove thinking line
    const log = document.getElementById("convo-log");
    if (log?.lastChild?.classList?.contains("system")) {
      log.removeChild(log.lastChild);
    }

    if (conversationAgent !== agent) {
      conversationBusy = false;
      return;
    }

    // Honor agreements: set a sticky goal so local AI won't overwrite it
    if (intent && !isRefusal(reply)) {
      setGoal(agent, { ...intent, source: "player_promise" }, true);
      applyGoalMovement(agent);
      convoUi.addLine(
        "System",
        `${agent.name} committed: ${intent.label}`,
        "system"
      );
      reply = intent.agreeLine
        ? `${reply}`
        : reply;
      agent.lastResult = `promised: ${intent.label}`;
    }

    conversationHistory.push({ from: agent.name, text: reply });
    say(agent, reply, 6);
    pushChat(agent.name, "You", reply);
    convoUi.addLine(agent.name, reply, "agent");
    if (pStats) {
      setPlayerMessage(pStats, `${agent.name}: "${reply}"`, 3);
    }

    conversationBusy = false;
    convoUi.setBusy(false);
    agent.lastResult = agent.goal
      ? `promised: ${agent.goal.label}`
      : "talking with player";
  }

  convoUi.setHandlers({
    send: (text) => {
      handlePlayerChatMessage(text);
    },
    close: () => {
      endConversation(false);
    }
  });

  function notifyPlayer(text, duration = 3.5) {
    const stats = getPlayerStats();
    if (stats) {
      setPlayerMessage(stats, text, duration);
    }
  }

  function playerNearby(agent) {
    const player = getPlayer();
    const pStats = getPlayerStats();
    if (!player || !pStats?.alive || pStats.inJail) {
      return null;
    }
    const d = dist(agent.x, agent.y, player.x, player.y);
    if (d > AGENT_PLAYER_TALK_RANGE * 1.5) {
      return null;
    }
    return {
      name: "You",
      isPlayer: true,
      money: pStats.money,
      guns: [...(pStats.ownedGuns || [])],
      hunger: pStats.hunger,
      dist: d,
      wanted: pStats.wanted,
      lastSpeech: lastPlayerLine
    };
  }

  /**
   * Spread spawns across the whole map (roads / intersections), not one corner.
   */
  function pickSpawnPoint(index, total) {
    const cols = Math.max(1, Math.floor(WORLD_WIDTH / CELL_SIZE));
    const rows = Math.max(1, Math.floor(WORLD_HEIGHT / CELL_SIZE));

    // Prefer a unique grid cell per agent, then jitter on the road.
    const cellIndex = index % (cols * rows);
    const col = cellIndex % cols;
    const row = Math.floor(cellIndex / cols);

    // Alternate horizontal vs vertical road through that cell.
    const onVertical = (index + row) % 2 === 0;
    let x;
    let y;

    if (onVertical) {
      x = col * CELL_SIZE + ROAD_SIZE * (0.25 + Math.random() * 0.5);
      y = row * CELL_SIZE + random(40, CELL_SIZE - 40);
    } else {
      x = col * CELL_SIZE + random(40, CELL_SIZE - 40);
      y = row * CELL_SIZE + ROAD_SIZE * (0.25 + Math.random() * 0.5);
    }

    // Extra scatter so agents with same cell (if many) don't stack.
    const sector = total > 0 ? index / total : 0;
    x += Math.cos(sector * Math.PI * 2) * random(0, 60);
    y += Math.sin(sector * Math.PI * 2) * random(0, 60);

    return {
      x: clamp(x, AGENT_SIZE + 20, WORLD_WIDTH - AGENT_SIZE - 20),
      y: clamp(y, AGENT_SIZE + 20, WORLD_HEIGHT - AGENT_SIZE - 20)
    };
  }

  function attachAgent(agent, visual) {
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

  function createOne(index, total) {
    const profile = AGENT_PROFILES[index % AGENT_PROFILES.length];
    const name = profile.name;
    const color = profile.color;
    const personality = profile.personality;
    const visual = createAgentVisual(color, name);
    const spawn = pickSpawnPoint(index, total);
    visual.x = spawn.x;
    visual.y = spawn.y;

    const stats = createPlayerStats();
    stats.money = Math.floor(random(5, 25));
    stats.message = "";
    stats.messageTimer = 0;

    const id = `agent-${nextAgentSerial++}`;
    const agent = {
      id,
      name,
      personality,
      color,
      stats,
      targetX: null,
      targetY: null,
      targetType: null,
      thinkTimer: random(1, 4),
      thinking: false,
      inConversation: false,
      speech: "",
      speechTimer: 0,
      lastSpeech: "",
      lastResult: "spawned",
      currentAction: "wander",
      visual,
      bubble: visual.bubble,
      spouseId: null,
      spouseName: null,
      childIds: [],
      parentIds: [],
      isChild: false,
      kidTimer: 0,
      growTimer: 0,
      goal: null,
      pausedGoal: null
    };

    return attachAgent(agent, visual);
  }

  function blendColors(a, b) {
    const ca = Number(a) || 0xaaaaaa;
    const cb = Number(b) || 0xaaaaaa;
    const ar = (ca >> 16) & 0xff;
    const ag = (ca >> 8) & 0xff;
    const ab = ca & 0xff;
    const br = (cb >> 16) & 0xff;
    const bg = (cb >> 8) & 0xff;
    const bb = cb & 0xff;
    return (
      (((ar + br) >> 1) << 16) |
      (((ag + bg) >> 1) << 8) |
      ((ab + bb) >> 1)
    );
  }

  function createKid(parentA, parentB) {
    const name = KID_NAMES[kidNameIndex % KID_NAMES.length];
    kidNameIndex += 1;
    const colorInt = blendColors(parentA.color, parentB.color);
    const visual = createAgentVisual(colorInt, name);
    if (visual.scale?.set) {
      visual.scale.set(0.72);
    }
    visual.x = (parentA.x + parentB.x) / 2 + random(-20, 20);
    visual.y = (parentA.y + parentB.y) / 2 + random(-20, 20);

    const stats = createPlayerStats();
    stats.money = Math.floor(random(0, 8));
    stats.message = "";
    stats.messageTimer = 0;

    const id = `agent-kid-${nextAgentSerial++}`;
    const kid = {
      id,
      name,
      personality: `child of ${parentA.name} & ${parentB.name}; curious and playful`,
      color: colorInt,
      stats,
      targetX: null,
      targetY: null,
      targetType: null,
      thinkTimer: random(2, 5),
      thinking: false,
      inConversation: false,
      speech: "",
      speechTimer: 0,
      lastSpeech: "",
      lastResult: "born",
      currentAction: "wander",
      visual,
      bubble: visual.bubble,
      spouseId: null,
      spouseName: null,
      childIds: [],
      parentIds: [parentA.id, parentB.id],
      isChild: true,
      kidTimer: 0,
      growTimer: 0,
      goal: null,
      pausedGoal: null
    };

    parentA.childIds = parentA.childIds || [];
    parentB.childIds = parentB.childIds || [];
    if (!parentA.childIds.includes(id)) {
      parentA.childIds.push(id);
    }
    if (!parentB.childIds.includes(id)) {
      parentB.childIds.push(id);
    }

    attachAgent(kid, visual);
    say(kid, "Hi!", 3);

    // Give kid an initial wander so they move
    kid.targetX = kid.x + random(-80, 80);
    kid.targetY = kid.y + random(-80, 80);

    return kid;
  }

  for (let i = 0; i < count; i++) {
    createOne(i, count);
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
        isPlayer: false,
        money: a.stats.money,
        guns: [...(a.stats.ownedGuns || [])],
        hunger: a.stats.hunger,
        married: Boolean(a.spouseId),
        spouse: a.spouseName || null,
        isChild: Boolean(a.isChild),
        dist: dist(agent.x, agent.y, a.x, a.y),
        lastSpeech: a.lastSpeech
      }))
      .filter((a) => a.dist < AGENT_SPEECH_RANGE * 2)
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 5);

    const you = playerNearby(agent);
    if (you) {
      nearbyAgents.unshift(you);
    }

    const recentPlayerChat =
      lastPlayerLine && performance.now() - lastPlayerLineAt < 20000
        ? lastPlayerLine
        : "";

    return {
      nearbyPois,
      nearbyAgents,
      playerNearby: you,
      recentPlayerChat
    };
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

  function applyGoalMovement(agent) {
    const g = agent.goal;
    if (!g || performance.now() >= g.expiresAt) {
      clearGoal(agent, "expired");
      return;
    }

    agent.currentAction = g.label;

    if (g.type === "follow_player" || (g.withPlayer && g.type === "follow_player")) {
      const player = getPlayer();
      if (player) {
        agent.targetX = player.x + random(-25, 25);
        agent.targetY = player.y + random(-25, 25);
        agent.targetType = null;
      }
      return;
    }

    if (g.type === "wait") {
      agent.targetX = null;
      agent.targetY = null;
      agent.targetType = null;
      return;
    }

    if (g.type === "work_plan") {
      const workType = agent.stats.job?.type;
      if (workType) {
        const hit = nearestBuilding(agent.x, agent.y, buildingColliders, workType);
        if (hit) {
          agent.targetX = hit.cx;
          agent.targetY = hit.cy;
          agent.targetType = workType;
        }
      } else {
        const hit = nearestBuilding(agent.x, agent.y, buildingColliders, "office");
        if (hit) {
          agent.targetX = hit.cx;
          agent.targetY = hit.cy;
          agent.targetType = "office";
        }
      }
      return;
    }

    if (g.type === "go_to" && g.place) {
      const hit = nearestBuilding(
        agent.x,
        agent.y,
        buildingColliders,
        SPECIAL_BUILDINGS[g.place] ? g.place : null
      );
      if (hit) {
        agent.targetX = hit.cx;
        agent.targetY = hit.cy;
        agent.targetType = hit.building.type;
      }
    }
  }

  /**
   * Convert a decision into a sticky goal (so we don't thrash).
   */
  function decisionToGoal(decision) {
    if (!decision) {
      return null;
    }
    const a = decision.action;
    if (a === "go_to" && decision.target) {
      return {
        type: "go_to",
        place: decision.target,
        label: `go to ${decision.target}`,
        priority: PRIORITY.ROUTINE,
        durationMs: 70_000,
        source: "decision"
      };
    }
    if (a === "work" || a === "apply_job") {
      return {
        type: "work_plan",
        place: decision.target || null,
        label: a === "work" ? "work" : "find job",
        priority: PRIORITY.SURVIVAL,
        durationMs: 80_000,
        source: "decision"
      };
    }
    if (a === "eat") {
      return {
        type: "go_to",
        place: "restaurant",
        label: "eat",
        priority: PRIORITY.SURVIVAL,
        durationMs: 60_000,
        source: "decision"
      };
    }
    if (a === "marry") {
      return {
        type: "go_to",
        place: "marriage_hall",
        label: "marriage",
        priority: PRIORITY.ROUTINE,
        durationMs: 90_000,
        source: "decision"
      };
    }
    if (a === "buy_property") {
      return {
        type: "buy_property",
        label: "buy property",
        priority: PRIORITY.ROUTINE,
        durationMs: 80_000,
        source: "decision"
      };
    }
    if (a === "wander") {
      return {
        type: "wander",
        label: "wander",
        priority: PRIORITY.IDLE,
        durationMs: 25_000,
        source: "decision"
      };
    }
    if (a === "wait") {
      return {
        type: "wait",
        label: "wait",
        priority: PRIORITY.IDLE,
        durationMs: 15_000,
        source: "decision"
      };
    }
    return null;
  }

  function executeDecision(agent, decision, options = {}) {
    if (!decision || !agent.stats.alive) {
      return;
    }

    // Don't let low-priority brain thrash over a promise
    if (
      !options.force &&
      hasActiveGoal(agent) &&
      agent.goal.priority >= PRIORITY.PROMISE &&
      decisionToGoal(decision)?.priority < agent.goal.priority
    ) {
      applyGoalMovement(agent);
      return;
    }

    if (decision.say && decision.action !== "talk") {
      say(agent, decision.say, 3.5);
      pushChat(agent.name, decision.sayTo || "all", decision.say);
    }

    const asGoal = decisionToGoal(decision);
    if (asGoal && decision.action !== "talk" && decision.action !== "divorce") {
      setGoal(agent, asGoal, options.force);
      if (asGoal.type === "wander") {
        agent.targetX = clamp(agent.x + random(-280, 280), 40, WORLD_WIDTH - 40);
        agent.targetY = clamp(agent.y + random(-280, 280), 40, WORLD_HEIGHT - 40);
        agent.targetType = null;
        agent.lastResult = "wandering";
        return;
      }
      if (asGoal.type === "wait") {
        agent.targetX = null;
        agent.targetY = null;
        agent.lastResult = "waiting";
        return;
      }
      applyGoalMovement(agent);
      // Still run immediate actions when already at place
    }

    agent.currentAction = agent.goal?.label || decision.action;
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
      case "buy_property":
      case "buy_house": {
        // Path to nearest for-sale if not close.
        let best = null;
        let bestD = Infinity;
        for (const b of buildingColliders) {
          if (!isBuyable(b)) {
            continue;
          }
          const d = dist(
            agent.x,
            agent.y,
            b.x + b.width / 2,
            b.y + b.height / 2
          );
          if (d < bestD) {
            bestD = d;
            best = b;
          }
        }
        if (best && bestD > 60) {
          agent.targetX = best.x + best.width / 2;
          agent.targetY = best.y + best.height / 2;
          agent.targetType = "property";
          agent.lastResult = "going to buy property";
        } else {
          doBuyProperty(agent, buildingColliders);
        }
        break;
      }
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
        doTalk(agent, decision, ctx, agents, pushChat, {
          getPlayer,
          getPlayerStats,
          notifyPlayer
        });
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
      case "marry":
      case "propose": {
        const hall = findMarriageHall(buildingColliders);
        if (hall) {
          const d = dist(
            agent.x,
            agent.y,
            hall.x + hall.width / 2,
            hall.y + hall.height / 2
          );
          if (d > 80) {
            agent.targetX = hall.x + hall.width / 2;
            agent.targetY = hall.y + hall.height / 2;
            agent.targetType = "marriage_hall";
            agent.pendingMarry = {
              ...decision,
              target: decision.target || decision.sayTo
            };
            agent.lastResult = "going to marriage hall";
            say(agent, "To the Marriage Hall!", 2.5);
            break;
          }
        }
        doMarry(agent, decision, agents, buildingColliders, pushChat);
        break;
      }
      case "divorce":
        doDivorce(agent, agents, pushChat);
        break;
      case "wait":
        agent.targetX = null;
        agent.targetY = null;
        agent.lastResult = "waiting";
        break;
      default:
        agent.lastResult = `unknown action ${decision.action}`;
    }
  }

  /** Instant local survival plan — respects active goals/promises. */
  function planLocally(agent) {
    if (!agent.stats.alive || agent.stats.inJail || agent.inConversation) {
      return;
    }

    // Critical hunger can interrupt even promises
    const emergency = criticalNeed(agent);
    if (emergency) {
      setGoal(agent, emergency, true);
      applyGoalMovement(agent);
      agent.lastResult = "emergency food";
      return;
    }

    // Keep working an active goal — do NOT thrash
    if (hasActiveGoal(agent)) {
      applyGoalMovement(agent);
      return;
    }

    const ctx = worldContextFor(agent);
    const decision = fallbackDecision(agent, ctx);
    executeDecision(agent, decision, { force: false });

    if (agent.targetX == null && !hasActiveGoal(agent)) {
      setGoal(
        agent,
        {
          type: "wander",
          label: "wander",
          priority: PRIORITY.IDLE,
          durationMs: 20_000
        },
        true
      );
      agent.targetX = clamp(agent.x + random(-280, 280), 40, WORLD_WIDTH - 40);
      agent.targetY = clamp(agent.y + random(-280, 280), 40, WORLD_HEIGHT - 40);
    }

    agent.lastResult = `${agent.lastResult || "planned"} [local]`;
  }

  /**
   * Optional LLM rethink — cannot break player promises unless critical.
   */
  async function thinkWithLlm(agent) {
    if (
      agent.thinking ||
      !agent.stats.alive ||
      agent.stats.inJail ||
      agent.inConversation
    ) {
      return;
    }
    agent.thinking = true;
    const ctx = worldContextFor(agent);

    try {
      const prompt = buildAgentPrompt(agent, ctx);
      const decision = await requestAgentDecision(prompt, agent.name);
      if (decision && agent.stats.alive && !agent.stats.inJail) {
        executeDecision(agent, decision, { force: false });
        agent.lastResult = `${agent.lastResult || "ok"} [llm]`;
      }
    } catch (err) {
      agent.lastResult = `llm error: ${err.message}`;
    } finally {
      agent.thinking = false;
      // Think less often when committed
      const base = hasActiveGoal(agent) && agent.goal.priority >= PRIORITY.PROMISE
        ? [14, 22]
        : [AGENT_THINK_MIN_SEC, AGENT_THINK_MAX_SEC];
      agent.thinkTimer = random(base[0], base[1]);
    }
  }

  // Start with a calm wander goal (not constant replan)
  for (const agent of agents) {
    setGoal(
      agent,
      {
        type: "wander",
        label: "explore",
        priority: PRIORITY.IDLE,
        durationMs: 20_000 + random(0, 15_000)
      },
      true
    );
    agent.targetX = clamp(agent.x + random(-400, 400), 40, WORLD_WIDTH - 40);
    agent.targetY = clamp(agent.y + random(-400, 400), 40, WORLD_HEIGHT - 40);
    agent.thinkTimer = random(3, 8);
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
        tickPropertyRent(
          agent.stats,
          agent.id,
          buildingColliders,
          deltaSeconds,
          { silent: true }
        );
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

      // Freeze while in a face-to-face chat with the player
      if (agent.inConversation) {
        if (conversationAgent === agent && !agent.stats.alive) {
          endConversation(true);
          continue;
        }
        agent.targetX = null;
        agent.targetY = null;
        agent.targetType = null;
        const player = getPlayer();
        if (player) {
          agent.rotation =
            Math.atan2(player.y - agent.y, player.x - agent.x) +
            Math.PI / 2;
        }
        continue;
      }

      // Expire goals
      if (agent.goal && performance.now() >= agent.goal.expiresAt) {
        clearGoal(agent, "expired");
      }

      // Critical interrupt
      if (!agent.stats.inJail) {
        const emergency = criticalNeed(agent);
        if (
          emergency &&
          (!hasActiveGoal(agent) || agent.goal.priority < PRIORITY.CRITICAL)
        ) {
          setGoal(agent, emergency, true);
          applyGoalMovement(agent);
        }
      }

      // Follow-player: refresh path often
      if (
        hasActiveGoal(agent) &&
        agent.goal.type === "follow_player" &&
        !agent.stats.inJail
      ) {
        applyGoalMovement(agent);
      }

      // Need a plan only when idle (no goal)
      if (!agent.stats.inJail && !hasActiveGoal(agent) && agent.targetX == null) {
        planLocally(agent);
      } else if (
        !agent.stats.inJail &&
        hasActiveGoal(agent) &&
        agent.targetX == null &&
        agent.goal.type !== "wait"
      ) {
        applyGoalMovement(agent);
      }

      // Wait goals: stand still until expiry
      if (hasActiveGoal(agent) && agent.goal.type === "wait") {
        agent.targetX = null;
        agent.targetY = null;
        agent.currentAction = agent.goal.label;
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
          const arrivedType = destType;
          agent.targetType = null;

          if (agent.pendingBorrow) {
            const pending = agent.pendingBorrow;
            agent.pendingBorrow = null;
            if (pending.kind === "money") {
              doBorrowMoney(agent, pending.decision, agents, pushChat);
            } else if (pending.kind === "gun") {
              doBorrowGun(agent, pending.decision, agents, pushChat);
            }
          } else if (arrivedType === "restaurant" || arrivedType === "grocery") {
            doEat(agent, buildingColliders);
          } else if (agent.stats.job && arrivedType === agent.stats.job.type) {
            doWork(agent, buildingColliders);
          } else if (arrivedType && JOBS[arrivedType] && !agent.stats.job) {
            doApplyJob(agent, buildingColliders, arrivedType);
          } else if (arrivedType === "gunshop") {
            doBuyGun(agent, buildingColliders, "pistol");
          } else if (arrivedType === "property") {
            doBuyProperty(agent, buildingColliders);
          } else if (arrivedType === "marriage_hall" || agent.pendingMarry) {
            const pending = agent.pendingMarry;
            agent.pendingMarry = null;
            doMarry(
              agent,
              pending || { target: null },
              agents,
              buildingColliders,
              pushChat
            );
          }

          // Promise goals: hold at destination (e.g. dinner) instead of job-thrash
          if (hasActiveGoal(agent) && agent.goal.priority >= PRIORITY.PROMISE) {
            if (agent.goal.arrivedAt == null) {
              agent.goal.arrivedAt = performance.now();
              if (agent.goal.withPlayer) {
                say(agent, "I'm here — ready when you are.", 4);
                pushChat(agent.name, "You", "I'm here — ready when you are.");
              }
            }
            const holdMs = (agent.goal.holdAfterArrive || 12) * 1000;
            if (performance.now() - agent.goal.arrivedAt < holdMs) {
              agent.currentAction = agent.goal.label + " (here)";
              // stay put
            } else {
              clearGoal(agent, "promise completed");
              // Soft replan later, not instantly thrashing
              agent.thinkTimer = Math.min(agent.thinkTimer, 3);
            }
          } else if (hasActiveGoal(agent)) {
            // Non-promise: finish goal on arrival after action
            clearGoal(agent, "arrived");
          }
        }
      }

      // Kids grow into adults
      if (agent.isChild) {
        agent.growTimer = (agent.growTimer || 0) + deltaSeconds;
        if (agent.growTimer >= KID_GROW_SEC) {
          agent.isChild = false;
          agent.visual.scale.set(1);
          agent.personality = `${agent.name}, grown child of ${
            agent.parentIds?.length
              ? "their parents"
              : "the city"
          }; ready for adult life`;
          say(agent, "I grew up!", 3);
          pushChat(agent.name, "all", "I grew up!");
        } else {
          // Young kids trail a living parent
          const parent = agents.find(
            (p) =>
              agent.parentIds?.includes(p.id) &&
              p.stats.alive &&
              !p.stats.inJail
          );
          if (parent && Math.random() < 0.02) {
            agent.targetX = parent.x + random(-30, 30);
            agent.targetY = parent.y + random(-30, 30);
          }
        }
      }

      // Periodic LLM “personality” pass (does not gate movement).
      if (!agent.thinking && !agent.inConversation) {
        agent.thinkTimer -= deltaSeconds;
        if (agent.thinkTimer <= 0) {
          thinkWithLlm(agent);
        }
      }
    }

    tickFamilies(agents, deltaSeconds, createKid, pushChat);
  }

  /**
   * Start (or end) a face-to-face conversation with nearest agent (key T).
   * Agent freezes; player types free-form messages.
   */
  function playerTalkToNearest() {
    const player = getPlayer();
    const pStats = getPlayerStats();
    if (!player || !pStats?.alive || pStats.inJail) {
      return false;
    }

    // Toggle off if already chatting
    if (conversationAgent) {
      endConversation(false);
      return true;
    }

    let nearest = null;
    let best = AGENT_PLAYER_TALK_RANGE;
    for (const a of agents) {
      if (!a.stats.alive || a.stats.inJail || a.inConversation) {
        continue;
      }
      const d = dist(player.x, player.y, a.x, a.y);
      if (d < best) {
        best = d;
        nearest = a;
      }
    }

    if (!nearest) {
      setPlayerMessage(
        pStats,
        "No one nearby. Stand closer to an agent, then press T.",
        2.5
      );
      return false;
    }

    conversationAgent = nearest;
    conversationBusy = false;
    conversationHistory.length = 0;
    nearest.inConversation = true;
    nearest.targetX = null;
    nearest.targetY = null;
    nearest.targetType = null;
    nearest.currentAction = "talking";
    nearest.rotation =
      Math.atan2(player.y - nearest.y, player.x - nearest.x) + Math.PI / 2;
    // Hold still while chatting; keep any prior goal to resume if needed
    nearest.pausedGoal =
      nearest.goal && nearest.goal.source !== "conversation"
        ? { ...nearest.goal }
        : null;

    const greeting = `Hey! I'm ${nearest.name}. What's on your mind?`;
    conversationHistory.push({ from: nearest.name, text: greeting });
    say(nearest, greeting, 8);
    pushChat(nearest.name, "You", greeting);

    convoUi.open(nearest.name);
    convoUi.addLine("System", `${nearest.name} stopped to talk. Type below.`, "system");
    convoUi.addLine(nearest.name, greeting, "agent");

    setPlayerMessage(
      pStats,
      `Chatting with ${nearest.name}. Type a message — Esc or T to leave.`,
      3
    );
    nearest.lastResult = "in conversation with player";
    return true;
  }

  return {
    agents,
    updateAgents,
    playerTalkToNearest,
    isInConversation,
    endConversation,
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
