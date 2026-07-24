import { createAgentSystem, fetchAgentCount } from "./agents.js";
import { createBankSystem } from "./bank.js";
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
  tryBuyProperty,
  tryEatInteract,
  tryJobInteract
} from "./interaction.js";
import { tickPropertyRent } from "./properties.js";
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
  const agentLayer = new PIXI.Container();
  const securityLayer = new PIXI.Container();
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
  world.addChild(agentLayer);
  world.addChild(securityLayer);
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
  const agentsRef = { system: null };

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
    getStats: () => stats,
    getExtraWanted: () => agentsRef.system?.getWantedSubjects?.() || []
  });

  const bank = createBankSystem({
    buildingColliders,
    securityLayer,
    getPlayer: () => player,
    getPlayerStats: () => stats,
    police
  });

  const agentCount = await fetchAgentCount();
  const agents = createAgentSystem({
    agentLayer,
    buildingColliders,
    npcSystem: npcs,
    effectsLayer,
    police,
    getPlayer: () => player,
    getPlayerStats: () => stats,
    count: agentCount
  });
  agentsRef.system = agents;

  const ui = createHUD({
    app,
    hud,
    buildingColliders
  });

  const autoSave = setupAutoSave(player, stats, 5);
  const didLoad = loadPlayerState(player, stats);

  if (didLoad && stats.inJail) {
    const spot = police.getJailSpot();
    player.x = spot.x;
    player.y = spot.y;
  } else if (didLoad && stats.wanted) {
    // Re-alert only cops near the loaded player (not the whole city).
    police.reportMurder();
  }

  if (!didLoad) {
    setPlayerMessage(
      stats,
      `${agentCount} AI online. Stand near one and press T — type to chat. Esc ends.`,
      5
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
        // message set inside load
      } else {
        setPlayerMessage(stats, "No save found.", 2);
      }
    }

    // Panel toggles (work even while dead / jailed)
    if (input.consumePress("KeyM")) {
      const on = ui.toggleMinimap();
      setPlayerMessage(stats, on ? "Minimap shown" : "Minimap hidden", 1.2);
    }
    if (input.consumePress("KeyC")) {
      const on = ui.toggleChat();
      setPlayerMessage(stats, on ? "Agent chat shown" : "Agent chat hidden", 1.2);
    }
    if (input.consumePress("KeyN")) {
      const on = ui.toggleNetWorth();
      setPlayerMessage(stats, on ? "Net worth shown" : "Net worth hidden", 1.2);
    }

    const chatting = agents.isInConversation();

    updatePlayerStats(stats, deltaSeconds);
    updateCombat(stats, deltaSeconds);
    tickPropertyRent(stats, "player", buildingColliders, deltaSeconds);
    autoSave.update(deltaSeconds);

    traffic.updateTrafficLights(deltaSeconds);
    cars.updateCars(deltaSeconds);

    // Freeze player movement while in a typed conversation
    if (!chatting) {
      updatePlayer(
        player,
        stats,
        input.keys,
        collision.moveEntity,
        deltaSeconds
      );
    }

    npcs.updateNPCs(deltaSeconds);
    agents.updateAgents(deltaSeconds);
    bank.update(deltaSeconds);
    police.updatePolice(deltaSeconds);
    updateCamera(app, world, player, deltaSeconds);

    const nearby = findNearbyPoi(player, buildingColliders);
    const prompt = chatting
      ? "In conversation — type below · Esc or T to leave"
      : getInteractionPrompt(stats, nearby);

    // T always available to start/end chat (even if other keys blocked)
    if (stats.alive && !stats.inJail && input.consumePress("KeyT")) {
      agents.playerTalkToNearest();
    }

    if (stats.alive && stats.inJail && input.consumePress("KeyB")) {
      police.tryBribe();
    }

    // Block game hotkeys while typing in the chat panel
    if (!chatting) {
      if (stats.alive && !stats.inJail && input.consumePress("KeyE")) {
        tryJobInteract(stats, nearby);
      }

      if (stats.alive && !stats.inJail && input.consumePress("KeyJ")) {
        tryEatInteract(stats, nearby);
      }

      if (stats.alive && !stats.inJail && input.consumePress("KeyP")) {
        tryBuyProperty(stats, nearby);
      }

      if (stats.alive && !stats.inJail && input.consumePress("KeyQ")) {
        cycleGun(stats);
      }

      if (
        stats.alive &&
        !stats.inJail &&
        (input.consumePress("KeyF") || input.consumePress("Space"))
      ) {
        tryShoot(
          stats,
          player,
          npcs,
          effectsLayer,
          () => {
            police.reportMurder();
          },
          bank,
          (crimeX, crimeY) => {
            police.reportCrimeAt(
              crimeX,
              crimeY,
              stats,
              player,
              "player",
              "You"
            );
          }
        );
      }

      if (stats.alive && !stats.inJail) {
        for (let i = 0; i < buyGunKeys.length; i++) {
          if (input.consumePress(buyGunKeys[i])) {
            tryBuyGun(stats, nearby, i % GUNS.length);
          }
        }
      }
    }

    ui.updateMinimapPlayer(player, agents.agents);
    ui.updateHUD(stats, prompt, {
      agents: agents.agents,
      chat: agents.getChatLog()
    });

    input.clearJustPressed();
  });

  autoSave.saveNow();
})();
