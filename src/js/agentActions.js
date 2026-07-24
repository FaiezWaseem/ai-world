import {
  AGENT_BORROW_DEFAULT,
  AGENT_BORROW_MAX,
  AGENT_TRADE_RANGE,
  FOOD,
  GUNS,
  INTERACT_DISTANCE,
  JOBS,
  SPECIAL_BUILDINGS,
  WORK_SHIFT_SECONDS
} from "./config.js";
import { clamp, randomItem } from "./helpers.js";
import { addIncome } from "./player.js";

export function edgeDistToBuilding(x, y, b) {
  const cx = clamp(x, b.x, b.x + b.width);
  const cy = clamp(y, b.y, b.y + b.height);
  return Math.hypot(x - cx, y - cy);
}

export function interactNear(agent, buildingColliders, type) {
  for (const b of buildingColliders) {
    if (b.type !== type) {
      continue;
    }
    if (edgeDistToBuilding(agent.x, agent.y, b) <= INTERACT_DISTANCE) {
      return b;
    }
  }
  return null;
}

export function say(agent, text, duration = 5) {
  if (!text) {
    return;
  }
  agent.speech = text;
  agent.speechTimer = duration;
  agent.lastSpeech = text;
  agent.bubble.text = text;
  agent.bubble.visible = true;

  // Yellow speech plate behind the words so chat is readable in-world.
  if (agent.visual?.bubbleBg) {
    const padX = 10;
    const padY = 6;
    const w = Math.max(40, agent.bubble.width + padX * 2);
    const h = Math.max(20, agent.bubble.height + padY * 2);
    const bg = agent.visual.bubbleBg;
    bg.clear();
    bg.roundRect(-w / 2, agent.bubble.y - h + 4, w, h, 8)
      .fill({ color: 0xfef08a, alpha: 0.96 })
      .stroke({ color: 0x000000, width: 2, alpha: 0.55 });
    // Little tail
    bg.poly([
      -6, agent.bubble.y + 2,
      6, agent.bubble.y + 2,
      0, agent.bubble.y + 12
    ]).fill({ color: 0xfef08a, alpha: 0.96 });
    bg.visible = true;
  }
}

export function doApplyJob(agent, buildingColliders, type) {
  const b = interactNear(agent, buildingColliders, type);
  if (!b || !JOBS[type]) {
    agent.lastResult = "apply failed: not near workplace";
    return;
  }
  const job = JOBS[type];
  if (Math.random() < (job.rejectChance ?? 0.3)) {
    agent.lastResult = `rejected at ${type}`;
    say(agent, "They said no...", 3);
    return;
  }
  agent.stats.job = {
    type,
    title: job.title,
    pay: job.pay,
    workSeconds: WORK_SHIFT_SECONDS,
    workplaceId: b.id,
    label: SPECIAL_BUILDINGS[type]?.label || type
  };
  agent.lastResult = `hired as ${job.title}`;
  say(agent, `Got the ${job.title} job!`, 3);
}

export function doWork(agent, buildingColliders) {
  const job = agent.stats.job;
  if (!job) {
    agent.lastResult = "no job";
    return;
  }
  const b = interactNear(agent, buildingColliders, job.type);
  if (!b) {
    agent.lastResult = "not at workplace";
    return;
  }
  if (agent.stats.workCooldown > 0) {
    agent.lastResult = "shift cooldown";
    return;
  }
  addIncome(agent.stats, job.pay);
  agent.stats.workCooldown = WORK_SHIFT_SECONDS;
  agent.lastResult = `worked +$${job.pay}`;
  say(agent, `+$ ${job.pay} from work`, 2.5);
}

export function doEat(agent, buildingColliders) {
  for (const type of ["restaurant", "grocery"]) {
    const b = interactNear(agent, buildingColliders, type);
    const food = FOOD[type];
    if (!b || !food) {
      continue;
    }
    if (agent.stats.money < food.cost) {
      agent.lastResult = "can't afford food";
      say(agent, "Too broke to eat.", 2);
      return;
    }
    agent.stats.money -= food.cost;
    agent.stats.hunger = Math.min(100, agent.stats.hunger + food.hungerRestore);
    agent.stats.health = Math.min(100, agent.stats.health + food.healthRestore);
    agent.lastResult = `ate ${food.name}`;
    say(agent, `Ate ${food.name}`, 2.5);
    return;
  }
  agent.lastResult = "no food nearby";
}

export function doBuyGun(agent, buildingColliders, gunId) {
  const b = interactNear(agent, buildingColliders, "gunshop");
  if (!b) {
    agent.lastResult = "not at gunshop";
    return;
  }
  const gun = GUNS.find((g) => g.id === gunId) || GUNS[0];
  if (agent.stats.ownedGuns.includes(gun.id)) {
    agent.stats.equippedGunId = gun.id;
    agent.lastResult = `already own ${gun.id}`;
    return;
  }
  if (agent.stats.money < gun.price) {
    agent.lastResult = `need $${gun.price}`;
    say(agent, "Can't afford that gun.", 2);
    return;
  }
  agent.stats.money -= gun.price;
  agent.stats.ownedGuns.push(gun.id);
  agent.stats.equippedGunId = gun.id;
  agent.lastResult = `bought ${gun.id}`;
  say(agent, `Bought ${gun.name}!`, 3);
}

export function doShoot(agent, npcSystem, effectsLayer, police) {
  if (agent.stats.inJail) {
    return;
  }
  const gun = GUNS.find((g) => g.id === agent.stats.equippedGunId);
  if (!gun) {
    agent.lastResult = "no gun equipped";
    return;
  }
  if (agent.stats.fireCooldown > 0) {
    return;
  }

  let best = null;
  let bestD = gun.range;
  for (const npc of npcSystem.npcs) {
    if (!npc.alive) {
      continue;
    }
    const d = Math.hypot(agent.x - npc.x, agent.y - npc.y);
    if (d < bestD) {
      bestD = d;
      best = npc;
    }
  }

  agent.stats.fireCooldown = gun.fireCooldown;

  if (effectsLayer && best) {
    const beam = new PIXI.Graphics();
    beam
      .moveTo(agent.x, agent.y)
      .lineTo(best.x, best.y)
      .stroke({ color: gun.color, width: 2, alpha: 0.8 });
    effectsLayer.addChild(beam);
    setTimeout(() => {
      if (beam.parent) {
        beam.parent.removeChild(beam);
      }
      beam.destroy();
    }, 70);
  }

  if (!best) {
    agent.lastResult = "no NPC in range";
    return;
  }

  agent.rotation =
    Math.atan2(best.y - agent.y, best.x - agent.x) + Math.PI / 2;

  const result = npcSystem.damageNpc(best, gun.damage);
  if (result.killed) {
    agent.stats.money += result.cash;
    agent.lastResult = `killed NPC +$${result.cash}`;
    say(agent, `Loot $${result.cash}`, 2);
    if (police) {
      police.reportCrime(agent.stats, agent);
    }
  } else {
    agent.lastResult = `hit NPC hp=${Math.ceil(result.health)}`;
  }
}

export function doTalk(agent, decision, ctx, agents, pushChat) {
  const text = decision.say || "Hey there.";
  say(agent, text, 4);

  let partner = null;
  if (decision.sayTo) {
    partner = agents.find(
      (a) => a.name.toLowerCase() === decision.sayTo.toLowerCase()
    );
  }
  if (!partner && ctx.nearbyAgents[0]) {
    partner = agents.find((a) => a.name === ctx.nearbyAgents[0].name);
  }

  pushChat(agent.name, partner?.name || "all", text);

  if (partner && partner.stats.alive && Math.random() < 0.55) {
    const reply = randomItem([
      `Hi ${agent.name}.`,
      "Stay safe out there.",
      `I'm at $${partner.stats.money}.`,
      "Need food soon.",
      "Police are rough."
    ]);
    setTimeout(() => {
      if (partner.stats.alive) {
        say(partner, reply, 3.5);
        pushChat(partner.name, agent.name, reply);
      }
    }, 900 + Math.random() * 1200);
  }

  agent.lastResult = "talked";
}

function findNearbyAgent(agent, agents, nameHint) {
  const inRange = agents.filter((a) => {
    if (a === agent || !a.stats.alive || a.stats.inJail) {
      return false;
    }
    return (
      Math.hypot(a.x - agent.x, a.y - agent.y) <= AGENT_TRADE_RANGE
    );
  });

  if (nameHint) {
    const named = inRange.find(
      (a) => a.name.toLowerCase() === String(nameHint).toLowerCase()
    );
    if (named) {
      return named;
    }
  }

  // Prefer richer / better-armed lenders
  inRange.sort((a, b) => b.stats.money - a.stats.money);
  return inRange[0] || null;
}

/**
 * Borrower asks lender for cash. Lender may refuse.
 * decision.amount optional; target / sayTo = lender name.
 */
export function doBorrowMoney(agent, decision, agents, pushChat) {
  const lenderName = decision.target || decision.sayTo;
  const lender = findNearbyAgent(agent, agents, lenderName);

  if (!lender) {
    agent.lastResult = "no one nearby to borrow from";
    say(agent, "Anyone got cash?", 3);
    return;
  }

  let amount = Number(decision.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    amount = AGENT_BORROW_DEFAULT;
  }
  amount = Math.floor(
    Math.min(amount, AGENT_BORROW_MAX, Math.floor(lender.stats.money * 0.4))
  );

  if (amount < 1 || lender.stats.money < amount) {
    agent.lastResult = `${lender.name} is broke`;
    say(agent, `${lender.name}, you're broke too?`, 3);
    say(lender, "Wish I could help.", 3);
    pushChat(agent.name, lender.name, "Can I borrow cash?");
    pushChat(lender.name, agent.name, "I'm broke.");
    return;
  }

  // Generous if lender is rich / friendly personality
  const acceptChance =
    0.45 +
    Math.min(0.35, lender.stats.money / 400) +
    (lender.personality?.includes("friendly") ? 0.15 : 0) -
    (lender.personality?.includes("cautious") ? 0.1 : 0);

  pushChat(
    agent.name,
    lender.name,
    decision.say || `Can I borrow $${amount}?`
  );

  if (Math.random() > acceptChance) {
    agent.lastResult = `${lender.name} refused loan`;
    say(agent, `Please, $${amount}?`, 3);
    say(lender, "No loans today.", 3);
    pushChat(lender.name, agent.name, "No loans.");
    return;
  }

  lender.stats.money -= amount;
  agent.stats.money += amount;
  agent.stats.debt = (agent.stats.debt || 0) + amount;
  lender.stats.loansOut = (lender.stats.loansOut || 0) + amount;

  agent.lastResult = `borrowed $${amount} from ${lender.name}`;
  say(agent, `Thanks for $${amount}!`, 3.5);
  say(lender, `Here's $${amount}. Pay me back.`, 3.5);
  pushChat(lender.name, agent.name, `Lent $${amount}.`);
}

/**
 * Borrower takes a gun from a nearby agent (if they have more than one, prefer extras).
 * decision.item / decision.target may be gun id; sayTo / target name = lender.
 */
export function doBorrowGun(agent, decision, agents, pushChat) {
  const lenderName = decision.sayTo || decision.target;
  // If target looks like a gun id, treat as item not name
  const gunIds = new Set(GUNS.map((g) => g.id));
  const maybeGun = decision.item || (gunIds.has(decision.target) ? decision.target : null);
  const nameHint = gunIds.has(String(lenderName || "").toLowerCase())
    ? decision.sayTo
    : lenderName;

  const lender = findNearbyAgent(agent, agents, nameHint);
  if (!lender) {
    agent.lastResult = "no one nearby with a gun";
    say(agent, "Need a weapon…", 3);
    return;
  }

  if (!lender.stats.ownedGuns?.length) {
    agent.lastResult = `${lender.name} has no guns`;
    say(agent, `${lender.name}, got a spare gun?`, 3);
    say(lender, "Unarmed myself.", 3);
    return;
  }

  let gunId = maybeGun && lender.stats.ownedGuns.includes(maybeGun)
    ? maybeGun
    : null;

  if (!gunId) {
    // Prefer a gun that is not their only / not equipped if they have 2+
    const extras = lender.stats.ownedGuns.filter(
      (id) => id !== lender.stats.equippedGunId
    );
    gunId =
      extras[0] ||
      (lender.stats.ownedGuns.length > 1
        ? lender.stats.ownedGuns[0]
        : lender.stats.ownedGuns[0]);
  }

  // Won't lend last gun if hungry/broke and only one (more cautious)
  if (
    lender.stats.ownedGuns.length === 1 &&
    (lender.stats.hunger < 40 || lender.personality?.includes("cautious"))
  ) {
    const acceptLast = Math.random() < 0.25;
    if (!acceptLast) {
      agent.lastResult = `${lender.name} won't lend last gun`;
      say(agent, "Lend me your gun?", 3);
      say(lender, "This is my only one.", 3);
      pushChat(agent.name, lender.name, "Can I borrow a gun?");
      pushChat(lender.name, agent.name, "No, only one.");
      return;
    }
  } else if (Math.random() < 0.3) {
    agent.lastResult = `${lender.name} refused gun`;
    say(agent, "Lend me a gun?", 3);
    say(lender, "Not happening.", 3);
    pushChat(agent.name, lender.name, "Borrow a gun?");
    pushChat(lender.name, agent.name, "Nope.");
    return;
  }

  // Transfer ownership
  lender.stats.ownedGuns = lender.stats.ownedGuns.filter((id) => id !== gunId);
  if (lender.stats.equippedGunId === gunId) {
    lender.stats.equippedGunId = lender.stats.ownedGuns[0] || null;
  }

  if (!agent.stats.ownedGuns.includes(gunId)) {
    agent.stats.ownedGuns.push(gunId);
  }
  agent.stats.equippedGunId = gunId;

  const gunName = GUNS.find((g) => g.id === gunId)?.name || gunId;
  agent.lastResult = `borrowed ${gunId} from ${lender.name}`;
  say(agent, `Got the ${gunName}!`, 3.5);
  say(lender, `Don't lose my ${gunName}.`, 3.5);
  pushChat(agent.name, lender.name, `Borrowed ${gunName}`);
  pushChat(lender.name, agent.name, `Lent ${gunName}`);
}
