import { COLORS, WORLD_HEIGHT, WORLD_WIDTH } from "./config.js";
import { updateCamera } from "./camera.js";
import { generateCity } from "./city.js";
import { createCarSystem } from "./cars.js";
import { createCollisionSystem } from "./collision.js";
import { createHUD } from "./hud.js";
import {
  findNearbyPoi,
  getInteractionPrompt,
  tryEatInteract,
  tryJobInteract
} from "./interaction.js";
import { createNpcSystem } from "./npcs.js";
import {
  createInput,
  createPlayer,
  createPlayerStats,
  respawnPlayer,
  updatePlayer,
  updatePlayerStats
} from "./player.js";
import { createRoads } from "./roads.js";
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
  const playerLayer = new PIXI.Container();

  world.addChild(groundLayer);
  world.addChild(roadLayer);
  world.addChild(sceneryLayer);
  world.addChild(buildingLayer);
  world.addChild(labelLayer);
  world.addChild(trafficLayer);
  world.addChild(carLayer);
  world.addChild(npcLayer);
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

  const ui = createHUD({
    app,
    hud,
    buildingColliders
  });

  stats.message = "Find a job, earn money, then eat!";
  stats.messageTimer = 4;

  app.ticker.add((ticker) => {
    const deltaSeconds = Math.min(ticker.deltaMS / 1000, 0.05);

    if (!stats.alive && input.consumePress("KeyR")) {
      respawnPlayer(player, stats);
    }

    updatePlayerStats(stats, deltaSeconds);

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
    updateCamera(app, world, player, deltaSeconds);

    const nearby = findNearbyPoi(player, buildingColliders);
    const prompt = getInteractionPrompt(stats, nearby);

    if (stats.alive && input.consumePress("KeyE")) {
      tryJobInteract(stats, nearby);
    }

    if (stats.alive && input.consumePress("KeyJ")) {
      tryEatInteract(stats, nearby);
    }

    ui.updateMinimapPlayer(player);
    ui.updateHUD(stats, prompt);

    input.clearJustPressed();
  });
})();
