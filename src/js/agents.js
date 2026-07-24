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
  fallbackDecision,
  requestAgentDecision
} from "./agentBrain.js";
import { clamp, random } from "./helpers.js";
import {
  createPlayerStats,
  setPlayerMessage,
  tickSurvival
} from "./player.js";

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

  function pushChat(from, to, text) {
    chatLog.push({ t: performance.now(), from, to, text });
    if (chatLog.length > 40) {
      chatLog.shift();
    }
  }

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

    const agent = {
      id: `agent-${index}`,
      name,
      personality,
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
          } else if (destType === "property") {
            doBuyProperty(agent, buildingColliders);
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

  const PLAYER_LINES = [
    "Hey, how's it going?",
    "Any work around here?",
    "Stay safe out there.",
    "Got tips for making money?",
    "Watch out for the cops.",
    "Need a partner?",
    "What's your story?",
    "I'm the new person in town."
  ];
  let playerLineIndex = 0;

  /**
   * Human player talks to the nearest living agent (key T).
   */
  function playerTalkToNearest() {
    const player = getPlayer();
    const pStats = getPlayerStats();
    if (!player || !pStats?.alive || pStats.inJail) {
      return false;
    }

    let nearest = null;
    let best = AGENT_PLAYER_TALK_RANGE;
    for (const a of agents) {
      if (!a.stats.alive || a.stats.inJail) {
        continue;
      }
      const d = dist(player.x, player.y, a.x, a.y);
      if (d < best) {
        best = d;
        nearest = a;
      }
    }

    if (!nearest) {
      setPlayerMessage(pStats, "No one nearby to talk to. Get closer to an agent.", 2);
      return false;
    }

    const line = PLAYER_LINES[playerLineIndex % PLAYER_LINES.length];
    playerLineIndex += 1;
    lastPlayerLine = line;
    lastPlayerLineAt = performance.now();

    pushChat("You", nearest.name, line);
    setPlayerMessage(pStats, `You → ${nearest.name}: "${line}"`, 3);

    // Face each other a bit
    nearest.rotation =
      Math.atan2(player.y - nearest.y, player.x - nearest.x) + Math.PI / 2;

    // Agent always replies to the player
    const replies = [
      `Hey! I'm ${nearest.name}. Good to meet you.`,
      `Hi there. I'm at $${nearest.stats.money} right now.`,
      "Jobs pay, but hunger never stops.",
      "Careful — cops only chase if they see you.",
      "I'm trying to buy property when I can.",
      "Need food? Hit a market or restaurant.",
      `Stay fed. Hunger is ${Math.round(nearest.stats.hunger)}% for me.`,
      "We can borrow cash or guns if we're close.",
      "Nice to have another human around.",
      "Don't starve. Seriously."
    ];
    const reply = replies[Math.floor(Math.random() * replies.length)];

    setTimeout(() => {
      if (!nearest.stats.alive) {
        return;
      }
      say(nearest, reply, 5);
      pushChat(nearest.name, "You", reply);
      setPlayerMessage(pStats, `${nearest.name}: "${reply}"`, 4);
      nearest.lastResult = "talked to player";
    }, 600 + Math.random() * 500);

    // Nudge agent to stay social next plan
    nearest.thinkTimer = Math.min(nearest.thinkTimer, 2);

    return true;
  }

  return {
    agents,
    updateAgents,
    playerTalkToNearest,
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
