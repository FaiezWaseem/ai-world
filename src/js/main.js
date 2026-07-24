import { COLORS, GUNS, WORLD_HEIGHT, WORLD_WIDTH } from "./config.js";
import { updateCamera } from "./camera.js";
import { generateCity } from "./city.js";
import { createCarSystem } from "./cars.js";
import {
  cycleGun,
  tryShoot,
  updateCombat
} from "./combat.js";
import { createCollisionSystem } from "./collision.js";
import { createHUD } from "./hud.js";
import {
  findNearbyPoi,
  getInteractionPrompt,
  tryBuyGun,
  tryEatInteract,
  tryJobInteract
} from "./interaction.js";
import { createNpcSystem } from "./npcs.js";
import {
  createInput,
  createPlayer,
  createPlayerStats,
  respawnPlayer,
  setPlayerMessage,
  updatePlayer,
  updatePlayerStats
} from "./player.js";
import { createPoliceSystem } from "./police.js";
import { createRoads } from "./roads.js";
import {
  clearPlayerState,
  loadPlayerState,
  savePlayerState,
  setupAutoSave
} from "./save.js";
import { createTrafficSystem } from "./traffic.js";

(async () => {
  const app = new PIXI.Application();

  await app.init({
    resizeTo: window,
    background: "#111827",
    antialias: true
  });

  document.body.appendChild(app.canvas);

  const world = new PIXI.Container();
  const hud = new PIXI.Container();
  app.stage.addChild(world);
  app.stage.addChild(hud);

  const groundLayer = new PIXI.Container();
  const roadLayer = new PIXI.Container();
  const sceneryLayer = new PIXI.Container();
  const buildingLayer = new PIXI.Container();
  const labelLayer = new PIXI.Container();
  const trafficLayer = new PIXI.Container();
  const carLayer = new PIXI.Container();
  const npcLayer = new PIXI.Container();
  const policeLayer = new PIXI.Container();
  const effectsLayer = new PIXI.Container();
  const playerLayer = new PIXI.Container();

  world.addChild(groundLayer);
  world.addChild(roadLayer);
  world.addChild(sceneryLayer);
  world.addChild(buildingLayer);
  world.addChild(labelLayer);
  world.addChild(trafficLayer);
  world.addChild(carLayer);
  world.addChild(npcLayer);
  world.addChild(policeLayer);
  world.addChild(effectsLayer);
  world.addChild(playerLayer);

  const background = new PIXI.Graphics();
  background
    .rect(0, 0, WORLD_WIDTH, WORLD_HEIGHT)
    .fill({ color: COLORS.grass });
  groundLayer.addChild(background);

  createRoads(roadLayer);

  const buildingColliders = [];
  generateCity({
    groundLayer,
    sceneryLayer,
    buildingLayer,
    labelLayer,
    buildingColliders
  });

  const traffic = createTrafficSystem(trafficLayer);
  const npcsRef = { list: [] };

  const cars = createCarSystem({
    carLayer,
    isRedForAxis: traffic.isRedForAxis,
    getNpcs: () => npcsRef.list
  });

  const collision = createCollisionSystem({
    buildingColliders,
    getCars: () => cars.cars,
    getCarBounds: cars.getCarBounds
  });

  const player = createPlayer(playerLayer);
  const stats = createPlayerStats();
  const input = createInput();

  const npcs = createNpcSystem({
    npcLayer,
    moveEntity: collision.moveEntity
  });
  npcsRef.list = npcs.npcs;

  const police = createPoliceSystem({
    policeLayer,
    buildingColliders,
    getPlayer: () => player,
    getStats: () => stats
  });

  const ui = createHUD({
    app,
    hud,
    buildingColliders
  });

  const autoSave = setupAutoSave(player, stats, 5);
  const didLoad = loadPlayerState(player, stats);

  // Restore jail / wanted after load.
  if (didLoad && stats.inJail) {
    const spot = police.getJailSpot();
    player.x = spot.x;
    player.y = spot.y;
  } else if (didLoad && stats.wanted) {
    police.reportMurder();
  }

  if (!didLoad) {
    setPlayerMessage(
      stats,
      "New game — progress auto-saves. Press K to save, L to load.",
      4
    );
  }

  const buyGunKeys = [
    "Digit1",
    "Digit2",
    "Digit3",
    "Digit4",
    "Digit5",
    "Numpad1",
    "Numpad2",
    "Numpad3",
    "Numpad4",
    "Numpad5"
  ];

  app.ticker.add((ticker) => {
    const deltaSeconds = Math.min(ticker.deltaMS / 1000, 0.05);

    if (!stats.alive && input.consumePress("KeyR")) {
      respawnPlayer(player, stats);
      clearPlayerState();
      autoSave.saveNow();
    }

    if (stats.alive && input.consumePress("KeyK")) {
      if (savePlayerState(player, stats)) {
        setPlayerMessage(stats, "Game saved.", 2);
      } else {
        setPlayerMessage(stats, "Save failed.", 2);
      }
    }

    if (input.consumePress("KeyL")) {
      if (loadPlayerState(player, stats)) {
        // message set inside loadPlayerState
      } else {
        setPlayerMessage(stats, "No save found.", 2);
      }
    }

    updatePlayerStats(stats, deltaSeconds);
    updateCombat(stats, deltaSeconds);
    autoSave.update(deltaSeconds);

    traffic.updateTrafficLights(deltaSeconds);
    cars.updateCars(deltaSeconds);
    updatePlayer(
      player,
      stats,
      input.keys,
      collision.moveEntity,
      deltaSeconds
    );
    npcs.updateNPCs(deltaSeconds);
    police.updatePolice(deltaSeconds);
    updateCamera(app, world, player, deltaSeconds);

    const nearby = findNearbyPoi(player, buildingColliders);
    const prompt = getInteractionPrompt(stats, nearby);

    if (stats.alive && stats.inJail && input.consumePress("KeyB")) {
      police.tryBribe();
    }

    if (stats.alive && !stats.inJail && input.consumePress("KeyE")) {
      tryJobInteract(stats, nearby);
    }

    if (stats.alive && !stats.inJail && input.consumePress("KeyJ")) {
      tryEatInteract(stats, nearby);
    }

    if (stats.alive && !stats.inJail && input.consumePress("KeyQ")) {
      cycleGun(stats);
    }

    if (
      stats.alive &&
      !stats.inJail &&
      (input.consumePress("KeyF") || input.consumePress("Space"))
    ) {
      tryShoot(stats, player, npcs, effectsLayer, () => {
        police.reportMurder();
      });
    }

    if (stats.alive && !stats.inJail) {
      for (let i = 0; i < buyGunKeys.length; i++) {
        if (input.consumePress(buyGunKeys[i])) {
          tryBuyGun(stats, nearby, i % GUNS.length);
        }
      }
    }

    ui.updateMinimapPlayer(player);
    ui.updateHUD(stats, prompt);

    input.clearJustPressed();
  });

  // Persist once systems are ready.
  autoSave.saveNow();
})();
