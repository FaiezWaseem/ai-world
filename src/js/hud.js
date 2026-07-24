import {
  CELL_SIZE,
  COLORS,
  GUNS,
  GRID_COLS,
  GRID_ROWS,
  HUNGER_INTERVAL_SEC,
  JAIL_BRIBE,
  JAIL_FINE,
  JAIL_WAIT_SEC,
  ROAD_SIZE,
  TAX_INTERVAL_SEC,
  TAX_RATE,
  WORLD_WIDTH
} from "./config.js";
import { isHighwayCol, isHighwayRow } from "./roads.js";

const MINIMAP_SIZE = 190;
const BAR_WIDTH = 220;
const BAR_HEIGHT = 16;
const SHADOW = { color: 0x000000, alpha: 0.8, blur: 2, distance: 1 };

function textStyle(size, fill, extra = {}) {
  return {
    fontFamily: "Arial",
    fontSize: size,
    fontWeight: "bold",
    fill,
    dropShadow: SHADOW,
    ...extra
  };
}

function makeBar(label, color, y) {
  const root = new PIXI.Container();
  root.x = 20;
  root.y = y;

  const title = new PIXI.Text({
    text: label,
    style: textStyle(12, 0xffffff)
  });

  const bg = new PIXI.Graphics();
  bg.roundRect(0, 16, BAR_WIDTH, BAR_HEIGHT, 4)
    .fill({ color: 0x0f172a, alpha: 0.85 })
    .stroke({ color: 0xffffff, width: 1, alpha: 0.35 });

  const fill = new PIXI.Graphics();
  fill.y = 16;

  const value = new PIXI.Text({
    text: "100%",
    style: textStyle(11, 0xffffff)
  });
  value.x = BAR_WIDTH + 8;
  value.y = 16;

  root.addChild(title, bg, fill, value);
  return { root, fill, value, color };
}

function setBar(bar, percent) {
  const p = Math.max(0, Math.min(100, percent)) / 100;
  bar.fill.clear();
  if (p > 0) {
    bar.fill
      .roundRect(1, 1, Math.max(2, (BAR_WIDTH - 2) * p), BAR_HEIGHT - 2, 3)
      .fill({ color: bar.color });
  }
  bar.value.text = `${Math.round(percent)}%`;
}

export function createHUD({
  app,
  hud,
  buildingColliders
}) {
  const instructions = new PIXI.Text({
    text:
      "WASD move · E job · J eat · 1–5 buy gun · F shoot\n" +
      "Q gun · B bribe jail ($" +
      JAIL_BRIBE +
      ") · K/L save/load\n" +
      "Murder → WANTED → jail " +
      JAIL_WAIT_SEC +
      "s + $" +
      JAIL_FINE +
      " · Hunger/Tax tick",
    style: textStyle(13, 0xffffff, { lineHeight: 17 })
  });

  instructions.x = 20;
  instructions.y = 14;
  hud.addChild(instructions);

  // Net-worth card (top-left) — same card style as chat.
  const NW_WIDTH = 260;
  const NW_HEIGHT = 200;
  const netWorthBox = new PIXI.Container();
  const netWorthBg = new PIXI.Graphics();
  netWorthBg
    .roundRect(0, 0, NW_WIDTH, NW_HEIGHT, 12)
    .fill({ color: 0x0f172a, alpha: 0.92 })
    .stroke({ color: 0xc084fc, width: 2, alpha: 0.95 });
  netWorthBg
    .roundRect(0, 0, NW_WIDTH, 32, 12)
    .fill({ color: 0x3b0764, alpha: 0.95 });
  netWorthBg
    .rect(0, 20, NW_WIDTH, 12)
    .fill({ color: 0x3b0764, alpha: 0.95 });

  const netWorthTitle = new PIXI.Text({
    text: "NET WORTH",
    style: textStyle(15, 0xe9d5ff)
  });
  netWorthTitle.x = 12;
  netWorthTitle.y = 7;

  const agentPanel = new PIXI.Text({
    text: "Loading agents…",
    style: {
      fontFamily: "Arial",
      fontSize: 14,
      fontWeight: "bold",
      fill: 0xf5d0fe,
      lineHeight: 22,
      dropShadow: {
        color: 0x000000,
        alpha: 0.9,
        blur: 2,
        distance: 1
      }
    }
  });
  agentPanel.x = 14;
  agentPanel.y = 42;

  netWorthBox.addChild(netWorthBg, netWorthTitle, agentPanel);
  netWorthBox.x = 16;
  netWorthBox.y = 88;
  hud.addChild(netWorthBox);

  // High-visibility agent chat box (bottom-right).
  const CHAT_WIDTH = 340;
  const CHAT_HEIGHT = 210;
  const chatBox = new PIXI.Container();
  const chatBg = new PIXI.Graphics();
  chatBg
    .roundRect(0, 0, CHAT_WIDTH, CHAT_HEIGHT, 12)
    .fill({ color: 0x0f172a, alpha: 0.92 })
    .stroke({ color: 0xfacc15, width: 2, alpha: 0.95 });
  // Top accent bar
  chatBg
    .roundRect(0, 0, CHAT_WIDTH, 32, 12)
    .fill({ color: 0x422006, alpha: 0.95 });
  chatBg
    .rect(0, 20, CHAT_WIDTH, 12)
    .fill({ color: 0x422006, alpha: 0.95 });

  const chatTitle = new PIXI.Text({
    text: "AGENT CHAT",
    style: textStyle(15, 0xfacc15)
  });
  chatTitle.x = 12;
  chatTitle.y = 7;

  const chatPanel = new PIXI.Text({
    text: "Waiting for agents to talk…",
    style: {
      fontFamily: "Arial",
      fontSize: 13,
      fontWeight: "bold",
      fill: 0xfef3c7,
      lineHeight: 18,
      wordWrap: true,
      wordWrapWidth: CHAT_WIDTH - 24,
      dropShadow: {
        color: 0x000000,
        alpha: 0.9,
        blur: 2,
        distance: 1
      }
    }
  });
  chatPanel.x = 12;
  chatPanel.y = 40;

  chatBox.addChild(chatBg, chatTitle, chatPanel);
  chatBox.visible = true;
  hud.addChild(chatBox);

  // Status bars (bottom-left)
  const healthBar = makeBar("HEALTH", COLORS.health, 0);
  const hungerBar = makeBar("HUNGER", COLORS.hunger, 0);
  hud.addChild(healthBar.root);
  hud.addChild(hungerBar.root);

  const moneyText = new PIXI.Text({
    text: "$0",
    style: textStyle(18, COLORS.money)
  });
  const taxText = new PIXI.Text({
    text: "",
    style: textStyle(12, 0xfca5a5)
  });
  const weaponText = new PIXI.Text({
    text: "Weapon: None",
    style: textStyle(13, 0xfde68a)
  });
  const wantedText = new PIXI.Text({
    text: "",
    style: textStyle(16, 0xef4444)
  });
  wantedText.anchor.set(0.5, 0);
  const jobText = new PIXI.Text({
    text: "Job: Unemployed",
    style: textStyle(13, 0xe2e8f0)
  });
  const hungerTimerText = new PIXI.Text({
    text: "",
    style: textStyle(11, 0xcbd5e1, { fontWeight: "normal" })
  });
  const promptText = new PIXI.Text({
    text: "",
    style: textStyle(14, 0xfef08a, { lineHeight: 18 })
  });
  promptText.anchor.set(0.5, 1);
  const messageText = new PIXI.Text({
    text: "",
    style: textStyle(15, 0xffffff)
  });
  messageText.anchor.set(0.5, 0);

  hud.addChild(
    moneyText,
    taxText,
    weaponText,
    wantedText,
    jobText,
    hungerTimerText,
    promptText,
    messageText
  );

  const jailOverlay = new PIXI.Container();
  jailOverlay.visible = false;
  const jailBg = new PIXI.Graphics();
  const jailTitle = new PIXI.Text({
    text: "IN JAIL",
    style: textStyle(42, 0x94a3b8)
  });
  jailTitle.anchor.set(0.5);
  const jailHint = new PIXI.Text({
    text: "",
    style: textStyle(18, 0xffffff, { align: "center" })
  });
  jailHint.anchor.set(0.5);
  jailOverlay.addChild(jailBg, jailTitle, jailHint);
  hud.addChild(jailOverlay);

  const deathOverlay = new PIXI.Container();
  deathOverlay.visible = false;
  const deathBg = new PIXI.Graphics();
  const deathTitle = new PIXI.Text({
    text: "YOU STARVED",
    style: textStyle(48, 0xef4444)
  });
  deathTitle.anchor.set(0.5);
  const deathHint = new PIXI.Text({
    text: "Press R to restart",
    style: textStyle(20, 0xffffff)
  });
  deathHint.anchor.set(0.5);
  deathOverlay.addChild(deathBg, deathTitle, deathHint);
  hud.addChild(deathOverlay);

  // Minimap
  const minimapScale = MINIMAP_SIZE / WORLD_WIDTH;
  const minimapContainer = new PIXI.Container();
  const minimapBackground = new PIXI.Graphics();
  const minimapCity = new PIXI.Graphics();
  const minimapAgentsLayer = new PIXI.Container();
  const minimapPlayer = new PIXI.Graphics();
  /** @type {Map<string, PIXI.Graphics>} */
  const minimapAgentDots = new Map();

  minimapBackground
    .roundRect(-8, -8, MINIMAP_SIZE + 16, MINIMAP_SIZE + 16, 10)
    .fill({
      color: 0x0f172a,
      alpha: 0.9
    })
    .stroke({
      color: 0xffffff,
      width: 2,
      alpha: 0.7
    });

  minimapCity
    .rect(0, 0, MINIMAP_SIZE, MINIMAP_SIZE)
    .fill({ color: COLORS.grass });

  for (let col = 0; col < GRID_COLS; col++) {
    minimapCity
      .rect(
        col * CELL_SIZE * minimapScale,
        0,
        ROAD_SIZE * minimapScale,
        MINIMAP_SIZE
      )
      .fill({
        color: isHighwayCol(col) ? COLORS.highwayLine : COLORS.road
      });
  }

  for (let row = 0; row < GRID_ROWS; row++) {
    minimapCity
      .rect(
        0,
        row * CELL_SIZE * minimapScale,
        MINIMAP_SIZE,
        ROAD_SIZE * minimapScale
      )
      .fill({
        color: isHighwayRow(row) ? COLORS.highwayLine : COLORS.road
      });
  }

  for (const building of buildingColliders) {
    minimapCity
      .rect(
        building.x * minimapScale,
        building.y * minimapScale,
        building.width * minimapScale,
        building.height * minimapScale
      )
      .fill({ color: building.minimapColor || 0x64748b });
  }

  minimapPlayer
    .circle(0, 0, 4)
    .fill({ color: 0x38bdf8 })
    .stroke({
      color: 0xffffff,
      width: 2
    });

  // Player drawn last so it stays on top of agent dots.
  minimapContainer.addChild(minimapBackground);
  minimapContainer.addChild(minimapCity);
  minimapContainer.addChild(minimapAgentsLayer);
  minimapContainer.addChild(minimapPlayer);
  hud.addChild(minimapContainer);

  function positionHUD() {
    const w = app.screen.width;
    const h = app.screen.height;

    minimapContainer.x = w - MINIMAP_SIZE - 22;
    minimapContainer.y = 22;

    netWorthBox.x = 16;
    netWorthBox.y = 88;

    const baseY = h - 110;
    healthBar.root.y = baseY;
    hungerBar.root.y = baseY + 40;
    moneyText.x = 20;
    moneyText.y = baseY - 68;
    taxText.x = 20;
    taxText.y = baseY - 48;
    jobText.x = 20;
    jobText.y = baseY - 30;
    weaponText.x = 20;
    weaponText.y = baseY - 12;
    hungerTimerText.x = 20;
    hungerTimerText.y = baseY + 78;

    promptText.x = w / 2;
    promptText.y = h - 130;
    messageText.x = w / 2;
    messageText.y = 120;

    deathBg.clear();
    deathBg.rect(0, 0, w, h).fill({ color: 0x000000, alpha: 0.65 });
    deathTitle.x = w / 2;
    deathTitle.y = h / 2 - 20;
    deathHint.x = w / 2;
    deathHint.y = h / 2 + 40;

    wantedText.x = w / 2;
    wantedText.y = 16;

    chatBox.x = w - CHAT_WIDTH - 18;
    chatBox.y = h - CHAT_HEIGHT - 18;

    jailBg.clear();
    jailBg.rect(0, 0, w, h).fill({ color: 0x0f172a, alpha: 0.55 });
    jailTitle.x = w / 2;
    jailTitle.y = h / 2 - 36;
    jailHint.x = w / 2;
    jailHint.y = h / 2 + 24;
  }

  positionHUD();
  window.addEventListener("resize", positionHUD);

  function ensureAgentDot(agent) {
    let dot = minimapAgentDots.get(agent.id);
    if (dot) {
      return dot;
    }

    dot = new PIXI.Graphics();
    const color = agent.color ?? 0xf472b6;
    dot
      .circle(0, 0, 3)
      .fill({ color })
      .stroke({
        color: 0xffffff,
        width: 1,
        alpha: 0.9
      });

    minimapAgentsLayer.addChild(dot);
    minimapAgentDots.set(agent.id, dot);
    return dot;
  }

  function updateMinimapAgents(agents) {
    if (!Array.isArray(agents)) {
      return;
    }

    const seen = new Set();

    for (const agent of agents) {
      seen.add(agent.id);
      const dot = ensureAgentDot(agent);
      const alive = agent.stats?.alive !== false;

      dot.visible = alive;
      if (!alive) {
        continue;
      }

      dot.x = agent.x * minimapScale;
      dot.y = agent.y * minimapScale;

      // Pulse-style cue: wanted agents slightly larger / red ring feel via alpha.
      if (agent.stats?.wanted) {
        dot.alpha = 1;
        dot.scale.set(1.25);
      } else if (agent.stats?.inJail) {
        dot.alpha = 0.55;
        dot.scale.set(0.9);
      } else {
        dot.alpha = 0.95;
        dot.scale.set(1);
      }
    }

    for (const [id, dot] of minimapAgentDots) {
      if (!seen.has(id)) {
        minimapAgentsLayer.removeChild(dot);
        dot.destroy();
        minimapAgentDots.delete(id);
      }
    }
  }

  function updateMinimapPlayer(player, agents) {
    minimapPlayer.x = player.x * minimapScale;
    minimapPlayer.y = player.y * minimapScale;
    updateMinimapAgents(agents);
  }

  function updateHUD(stats, prompt = "", extras = {}) {
    setBar(healthBar, stats.health);
    setBar(hungerBar, stats.hunger);

    if (Array.isArray(extras.agents)) {
      updateMinimapAgents(extras.agents);

      const gunPrice = new Map(GUNS.map((g) => [g.id, g.price]));
      const withNw = extras.agents.map((a) => {
        const cash = a.stats?.money || 0;
        const gunsValue = (a.stats?.ownedGuns || []).reduce(
          (sum, id) => sum + (gunPrice.get(id) || 0),
          0
        );
        return {
          agent: a,
          cash,
          gunsValue,
          netWorth: cash + gunsValue
        };
      });

      // Richest first — name + net worth only
      withNw.sort((a, b) => b.netWorth - a.netWorth);

      const lines = withNw.map((row, i) => {
        const rank = i + 1;
        const dead = row.agent.stats?.alive === false ? " †" : "";
        return `${rank}. ${row.agent.name}${dead}    $${row.netWorth}`;
      });
      agentPanel.text = lines.length
        ? lines.join("\n")
        : "No agents yet";
    }

    if (Array.isArray(extras.chat) && extras.chat.length) {
      chatPanel.text = extras.chat
        .slice(-9)
        .map((c) => {
          const who =
            c.to && c.to !== "all" ? `${c.from} → ${c.to}` : c.from;
          return `• ${who}: ${c.text}`;
        })
        .join("\n");
      chatBox.visible = true;
    } else if (Array.isArray(extras.chat)) {
      chatPanel.text = "Waiting for agents to talk…";
      chatBox.visible = true;
    }

    moneyText.text = `$${stats.money}`;
    jobText.text = stats.job
      ? `Job: ${stats.job.title} @ ${stats.job.label}`
      : "Job: Unemployed";

    const gun = GUNS.find((g) => g.id === stats.equippedGunId);
    weaponText.text = gun
      ? `Weapon: ${gun.name}  (dmg ${gun.damage})`
      : "Weapon: None — buy at GUN SHOP";

    if (stats.inJail) {
      wantedText.text = "";
    } else if (stats.wanted) {
      wantedText.text = "★ WANTED ★  Police chasing!";
    } else {
      wantedText.text = "";
    }

    jailOverlay.visible = Boolean(stats.inJail && stats.alive);
    if (stats.inJail) {
      jailHint.text =
        `Wait ${Math.ceil(stats.jailTimer)}s then pay $${JAIL_FINE}\n` +
        `or press B to bribe $${JAIL_BRIBE}  (cash $${stats.money})`;
    }

    const taxSecsLeft = Math.max(0, TAX_INTERVAL_SEC - stats.taxTimer);
    const nextTax = Math.floor(stats.totalIncome * TAX_RATE);
    taxText.text = stats.alive
      ? `Tax in ${Math.ceil(taxSecsLeft)}s · 10% of $${stats.totalIncome} income = $${nextTax} · paid $${stats.totalTaxPaid}`
      : "";

    const secsLeft = Math.max(
      0,
      HUNGER_INTERVAL_SEC - stats.hungerTimer
    );
    hungerTimerText.text = stats.alive
      ? `Next hunger drop in ${Math.ceil(secsLeft)}s`
      : "";

    promptText.text = stats.inJail ? "" : prompt;
    messageText.text =
      stats.messageTimer > 0 ? stats.message : "";

    deathOverlay.visible = !stats.alive;
  }

  return {
    updateMinimapPlayer,
    updateHUD,
    positionHUD
  };
}
