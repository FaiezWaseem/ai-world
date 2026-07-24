import {
  CELL_SIZE,
  COLORS,
  GUNS,
  GRID_COLS,
  GRID_ROWS,
  HUNGER_INTERVAL_SEC,
  ROAD_SIZE,
  TAX_INTERVAL_SEC,
  TAX_RATE,
  WORLD_WIDTH
} from "./config.js";
import { isHighwayCol, isHighwayRow } from "./roads.js";

const MINIMAP_SIZE = 190;
const BAR_WIDTH = 220;
const BAR_HEIGHT = 16;

function makeBar(label, color, y) {
  const root = new PIXI.Container();
  root.x = 20;
  root.y = y;

  const title = new PIXI.Text({
    text: label,
    style: {
      fontFamily: "Arial",
      fontSize: 12,
      fontWeight: "bold",
      fill: 0xffffff,
      dropShadow: {
        color: 0x000000,
        alpha: 0.7,
        blur: 2,
        distance: 1
      }
    }
  });

  const bg = new PIXI.Graphics();
  bg.roundRect(0, 16, BAR_WIDTH, BAR_HEIGHT, 4)
    .fill({ color: 0x0f172a, alpha: 0.85 })
    .stroke({ color: 0xffffff, width: 1, alpha: 0.35 });

  const fill = new PIXI.Graphics();
  fill.y = 16;

  const value = new PIXI.Text({
    text: "100%",
    style: {
      fontFamily: "Arial",
      fontSize: 11,
      fontWeight: "bold",
      fill: 0xffffff
    }
  });
  value.x = BAR_WIDTH + 8;
  value.y = 16;

  root.addChild(title);
  root.addChild(bg);
  root.addChild(fill);
  root.addChild(value);

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
      "OPEN WORLD CITY\n" +
      "Move: WASD / Arrows · Sprint: Shift\n" +
      "E: Job · J: Eat · 1–5: Buy gun at shop\n" +
      "Q: Cycle gun · F/Space: Shoot · K: Save · L: Load\n" +
      "Auto-save every 5s · Hunger −5%/60s · Tax/3min\n" +
      "Gun shops · NPCs drop $0–100",
    style: {
      fontFamily: "Arial",
      fontSize: 13,
      fontWeight: "bold",
      fill: 0xffffff,
      lineHeight: 18,
      dropShadow: {
        color: 0x000000,
        alpha: 0.8,
        blur: 3,
        distance: 2
      }
    }
  });

  instructions.x = 20;
  instructions.y = 14;
  hud.addChild(instructions);

  // Status bars (bottom-left)
  const healthBar = makeBar("HEALTH", COLORS.health, 0);
  const hungerBar = makeBar("HUNGER", COLORS.hunger, 0);
  hud.addChild(healthBar.root);
  hud.addChild(hungerBar.root);

  const moneyText = new PIXI.Text({
    text: "$0",
    style: {
      fontFamily: "Arial",
      fontSize: 18,
      fontWeight: "bold",
      fill: COLORS.money,
      dropShadow: {
        color: 0x000000,
        alpha: 0.8,
        blur: 2,
        distance: 1
      }
    }
  });
  hud.addChild(moneyText);

  const taxText = new PIXI.Text({
    text: "",
    style: {
      fontFamily: "Arial",
      fontSize: 12,
      fontWeight: "bold",
      fill: 0xfca5a5,
      dropShadow: {
        color: 0x000000,
        alpha: 0.75,
        blur: 2,
        distance: 1
      }
    }
  });
  hud.addChild(taxText);

  const weaponText = new PIXI.Text({
    text: "Weapon: None",
    style: {
      fontFamily: "Arial",
      fontSize: 13,
      fontWeight: "bold",
      fill: 0xfde68a,
      dropShadow: {
        color: 0x000000,
        alpha: 0.75,
        blur: 2,
        distance: 1
      }
    }
  });
  hud.addChild(weaponText);

  const jobText = new PIXI.Text({
    text: "Job: Unemployed",
    style: {
      fontFamily: "Arial",
      fontSize: 13,
      fontWeight: "bold",
      fill: 0xe2e8f0,
      dropShadow: {
        color: 0x000000,
        alpha: 0.75,
        blur: 2,
        distance: 1
      }
    }
  });
  hud.addChild(jobText);

  const hungerTimerText = new PIXI.Text({
    text: "",
    style: {
      fontFamily: "Arial",
      fontSize: 11,
      fill: 0xcbd5e1
    }
  });
  hud.addChild(hungerTimerText);

  const promptText = new PIXI.Text({
    text: "",
    style: {
      fontFamily: "Arial",
      fontSize: 14,
      fontWeight: "bold",
      fill: 0xfef08a,
      lineHeight: 18,
      dropShadow: {
        color: 0x000000,
        alpha: 0.9,
        blur: 3,
        distance: 1
      }
    }
  });
  promptText.anchor.set(0.5, 1);
  hud.addChild(promptText);

  const messageText = new PIXI.Text({
    text: "",
    style: {
      fontFamily: "Arial",
      fontSize: 15,
      fontWeight: "bold",
      fill: 0xffffff,
      dropShadow: {
        color: 0x000000,
        alpha: 0.9,
        blur: 3,
        distance: 1
      }
    }
  });
  messageText.anchor.set(0.5, 0);
  hud.addChild(messageText);

  // Death overlay
  const deathOverlay = new PIXI.Container();
  deathOverlay.visible = false;

  const deathBg = new PIXI.Graphics();
  deathOverlay.addChild(deathBg);

  const deathTitle = new PIXI.Text({
    text: "YOU STARVED",
    style: {
      fontFamily: "Arial",
      fontSize: 48,
      fontWeight: "bold",
      fill: 0xef4444,
      dropShadow: {
        color: 0x000000,
        alpha: 0.9,
        blur: 4,
        distance: 2
      }
    }
  });
  deathTitle.anchor.set(0.5);
  deathOverlay.addChild(deathTitle);

  const deathHint = new PIXI.Text({
    text: "Press R to restart",
    style: {
      fontFamily: "Arial",
      fontSize: 20,
      fontWeight: "bold",
      fill: 0xffffff
    }
  });
  deathHint.anchor.set(0.5);
  deathOverlay.addChild(deathHint);

  hud.addChild(deathOverlay);

  // Minimap
  const minimapScale = MINIMAP_SIZE / WORLD_WIDTH;
  const minimapContainer = new PIXI.Container();
  const minimapBackground = new PIXI.Graphics();
  const minimapCity = new PIXI.Graphics();
  const minimapPlayer = new PIXI.Graphics();

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

  minimapContainer.addChild(minimapBackground);
  minimapContainer.addChild(minimapCity);
  minimapContainer.addChild(minimapPlayer);
  hud.addChild(minimapContainer);

  function positionHUD() {
    const w = app.screen.width;
    const h = app.screen.height;

    minimapContainer.x = w - MINIMAP_SIZE - 22;
    minimapContainer.y = 22;

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
  }

  positionHUD();
  window.addEventListener("resize", positionHUD);

  function updateMinimapPlayer(player) {
    minimapPlayer.x = player.x * minimapScale;
    minimapPlayer.y = player.y * minimapScale;
  }

  function updateHUD(stats, prompt = "") {
    setBar(healthBar, stats.health);
    setBar(hungerBar, stats.hunger);

    moneyText.text = `$${stats.money}`;
    jobText.text = stats.job
      ? `Job: ${stats.job.title} @ ${stats.job.label}`
      : "Job: Unemployed";

    const gun = GUNS.find((g) => g.id === stats.equippedGunId);
    weaponText.text = gun
      ? `Weapon: ${gun.name}  (dmg ${gun.damage})`
      : "Weapon: None — buy at GUN SHOP";

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

    promptText.text = prompt;
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
