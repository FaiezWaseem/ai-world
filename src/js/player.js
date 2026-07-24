import {
  COLORS,
  HUNGER_DROP_PERCENT,
  HUNGER_INTERVAL_SEC,
  PLAYER_SIZE,
  PLAYER_SPEED,
  PLAYER_SPRINT_SPEED,
  ROAD_SIZE,
  TAX_INTERVAL_SEC,
  TAX_RATE
} from "./config.js";

export function createInput() {
  const keys = {};
  const justPressed = {};

  window.addEventListener("keydown", (event) => {
    if (!keys[event.code]) {
      justPressed[event.code] = true;
    }

    keys[event.code] = true;

    if (
      event.code === "ArrowUp" ||
      event.code === "ArrowDown" ||
      event.code === "ArrowLeft" ||
      event.code === "ArrowRight"
    ) {
      event.preventDefault();
    }
  });

  window.addEventListener("keyup", (event) => {
    keys[event.code] = false;
  });

  function consumePress(code) {
    if (justPressed[code]) {
      justPressed[code] = false;
      return true;
    }
    return false;
  }

  function clearJustPressed() {
    for (const code of Object.keys(justPressed)) {
      justPressed[code] = false;
    }
  }

  return {
    keys,
    consumePress,
    clearJustPressed
  };
}

export function createPlayerStats() {
  return {
    health: 100,
    hunger: 100,
    money: 0,
    totalIncome: 0,
    totalTaxPaid: 0,
    job: null,
    alive: true,
    hungerTimer: 0,
    taxTimer: 0,
    workCooldown: 0,
    ownedGuns: [],
    equippedGunId: null,
    fireCooldown: 0,
    wanted: false,
    inJail: false,
    jailTimer: 0,
    debt: 0,
    loansOut: 0,
    message: "",
    messageTimer: 0
  };
}

export function resetPlayerStats(stats) {
  stats.health = 100;
  stats.hunger = 100;
  stats.money = 0;
  stats.totalIncome = 0;
  stats.totalTaxPaid = 0;
  stats.job = null;
  stats.alive = true;
  stats.hungerTimer = 0;
  stats.taxTimer = 0;
  stats.workCooldown = 0;
  stats.ownedGuns = [];
  stats.equippedGunId = null;
  stats.fireCooldown = 0;
  stats.wanted = false;
  stats.inJail = false;
  stats.jailTimer = 0;
  stats.debt = 0;
  stats.loansOut = 0;
  stats.message = "Find a job, earn money, then eat!";
  stats.messageTimer = 4;
}

/** Record gross pay from work (used for tax on total income). */
export function addIncome(stats, amount) {
  stats.totalIncome += amount;
  stats.money += amount;
}

function applyIncomeTax(stats) {
  if (stats.totalIncome <= 0) {
    setPlayerMessage(stats, "Tax day: $0 owed (no income yet).", 2.5);
    return;
  }

  const taxDue = Math.floor(stats.totalIncome * TAX_RATE);
  if (taxDue <= 0) {
    setPlayerMessage(stats, "Tax day: less than $1 owed.", 2);
    return;
  }

  const paid = Math.min(stats.money, taxDue);
  stats.money -= paid;
  stats.totalTaxPaid += paid;

  if (paid < taxDue) {
    setPlayerMessage(
      stats,
      `TAX: owed $${taxDue} (10% of $${stats.totalIncome} income) — paid $${paid}, short $${taxDue - paid}!`,
      4
    );
  } else {
    setPlayerMessage(
      stats,
      `TAX: −$${paid} (10% of $${stats.totalIncome} total income). Cash $${stats.money}`,
      3.5
    );
  }
}

export function setPlayerMessage(stats, text, duration = 2.5) {
  stats.message = text;
  stats.messageTimer = duration;
}

/**
 * Shared survival ticks (hunger + tax) for player and AI agents.
 * @param {{ silent?: boolean, name?: string }} options
 */
export function tickSurvival(stats, deltaSeconds, options = {}) {
  const silent = Boolean(options.silent);

  if (stats.messageTimer > 0) {
    stats.messageTimer -= deltaSeconds;
    if (stats.messageTimer <= 0) {
      stats.message = "";
    }
  }

  if (!stats.alive) {
    return;
  }

  if (stats.workCooldown > 0) {
    stats.workCooldown = Math.max(0, stats.workCooldown - deltaSeconds);
  }

  if (stats.fireCooldown > 0) {
    stats.fireCooldown = Math.max(0, stats.fireCooldown - deltaSeconds);
  }

  stats.hungerTimer += deltaSeconds;

  while (stats.hungerTimer >= HUNGER_INTERVAL_SEC) {
    stats.hungerTimer -= HUNGER_INTERVAL_SEC;
    stats.hunger = Math.max(0, stats.hunger - HUNGER_DROP_PERCENT);

    if (stats.hunger <= 0) {
      stats.health = 0;
      stats.alive = false;
      if (!silent) {
        stats.message = "You starved. Press R to restart.";
        stats.messageTimer = 99;
      } else {
        stats.message = `${options.name || "Agent"} starved.`;
        stats.messageTimer = 4;
      }
      return;
    }

    if (!silent) {
      setPlayerMessage(
        stats,
        `Hunger -${HUNGER_DROP_PERCENT}%  (${Math.round(stats.hunger)}% left)`,
        2
      );
    }
  }

  stats.taxTimer += deltaSeconds;

  while (stats.taxTimer >= TAX_INTERVAL_SEC) {
    stats.taxTimer -= TAX_INTERVAL_SEC;
    if (silent) {
      applyAgentTax(stats, options.name);
    } else {
      applyIncomeTax(stats);
    }
  }
}

function applyAgentTax(stats, name) {
  if (stats.totalIncome <= 0) {
    return;
  }
  const taxDue = Math.floor(stats.totalIncome * TAX_RATE);
  if (taxDue <= 0) {
    return;
  }
  const paid = Math.min(stats.money, taxDue);
  stats.money -= paid;
  stats.totalTaxPaid += paid;
  stats.message = `${name || "Agent"} paid tax $${paid}`;
  stats.messageTimer = 2.5;
}

export function updatePlayerStats(stats, deltaSeconds) {
  tickSurvival(stats, deltaSeconds, { silent: false });
}

export function createPlayer(playerLayer) {
  const player = new PIXI.Container();
  const playerShadow = new PIXI.Graphics();
  const playerBody = new PIXI.Graphics();

  playerShadow
    .ellipse(0, 10, 18, 10)
    .fill({
      color: 0x000000,
      alpha: 0.25
    });

  playerBody
    .circle(0, 0, PLAYER_SIZE / 2)
    .fill({ color: COLORS.player })
    .stroke({
      color: COLORS.playerOutline,
      width: 3
    });

  playerBody
    .poly([0, -17, -6, -7, 6, -7])
    .fill({ color: 0xffffff });

  player.addChild(playerShadow);
  player.addChild(playerBody);

  player.x = ROAD_SIZE / 2;
  player.y = ROAD_SIZE / 2;

  playerLayer.addChild(player);

  return player;
}

export function updatePlayer(player, stats, keys, moveEntity, deltaSeconds) {
  if (!stats.alive || stats.inJail) {
    return;
  }

  let directionX = 0;
  let directionY = 0;

  if (keys["KeyW"] || keys["ArrowUp"]) {
    directionY -= 1;
  }

  if (keys["KeyS"] || keys["ArrowDown"]) {
    directionY += 1;
  }

  if (keys["KeyA"] || keys["ArrowLeft"]) {
    directionX -= 1;
  }

  if (keys["KeyD"] || keys["ArrowRight"]) {
    directionX += 1;
  }

  const length = Math.hypot(directionX, directionY);

  if (length > 0) {
    directionX /= length;
    directionY /= length;

    const isSprinting = keys["ShiftLeft"] || keys["ShiftRight"];
    const speed = isSprinting ? PLAYER_SPRINT_SPEED : PLAYER_SPEED;

    moveEntity(
      player,
      directionX * speed * deltaSeconds,
      directionY * speed * deltaSeconds,
      PLAYER_SIZE
    );

    player.rotation =
      Math.atan2(directionY, directionX) + Math.PI / 2;
  }
}

export function respawnPlayer(player, stats) {
  resetPlayerStats(stats);
  player.x = ROAD_SIZE / 2;
  player.y = ROAD_SIZE / 2;
  player.rotation = 0;
}
