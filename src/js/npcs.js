import {
  CELL_SIZE,
  NPC_COLORS,
  NPC_COUNT,
  NPC_SIZE,
  ROAD_SIZE,
  WORLD_HEIGHT,
  WORLD_WIDTH
} from "./config.js";
import { random, randomItem } from "./helpers.js";

function findRoadSpawn() {
  const verticalRoad = Math.random() < 0.5;

  if (verticalRoad) {
    const roadColumn = Math.floor(random(0, WORLD_WIDTH / CELL_SIZE));

    return {
      x: roadColumn * CELL_SIZE + random(20, ROAD_SIZE - 20),
      y: random(20, WORLD_HEIGHT - 20)
    };
  }

  const roadRow = Math.floor(random(0, WORLD_HEIGHT / CELL_SIZE));

  return {
    x: random(20, WORLD_WIDTH - 20),
    y: roadRow * CELL_SIZE + random(20, ROAD_SIZE - 20)
  };
}

export function createNpcSystem({ npcLayer, moveEntity }) {
  const npcs = [];

  function chooseNPCDirection(npc) {
    const directions = [
      { x: 1, y: 0 },
      { x: -1, y: 0 },
      { x: 0, y: 1 },
      { x: 0, y: -1 },
      { x: 0, y: 0 }
    ];

    const direction = randomItem(directions);
    npc.directionX = direction.x;
    npc.directionY = direction.y;
    npc.changeTimer = random(1.2, 4);
  }

  function createNPC() {
    const npc = new PIXI.Container();
    const color = randomItem(NPC_COLORS);
    const radius = NPC_SIZE / 2;

    const shadow = new PIXI.Graphics();
    shadow
      .ellipse(0, radius * 0.7, radius * 0.9, radius * 0.5)
      .fill({
        color: 0x000000,
        alpha: 0.22
      });

    const body = new PIXI.Graphics();
    body
      .circle(0, 0, radius)
      .fill({ color })
      .stroke({
        color: 0xffffff,
        width: 1.5
      });

    npc.addChild(shadow);
    npc.addChild(body);

    const spawn = findRoadSpawn();
    npc.x = spawn.x;
    npc.y = spawn.y;
    npc.speed = random(45, 100);
    npc.directionX = 0;
    npc.directionY = 0;
    npc.changeTimer = 0;

    npcLayer.addChild(npc);
    npcs.push(npc);
    chooseNPCDirection(npc);
  }

  function updateNPCs(deltaSeconds) {
    for (const npc of npcs) {
      npc.changeTimer -= deltaSeconds;

      if (npc.changeTimer <= 0) {
        chooseNPCDirection(npc);
      }

      const previousX = npc.x;
      const previousY = npc.y;

      const dx = npc.directionX * npc.speed * deltaSeconds;
      const dy = npc.directionY * npc.speed * deltaSeconds;

      moveEntity(npc, dx, dy, NPC_SIZE, { checkCars: true });

      if (
        Math.abs(npc.x - previousX) < 0.1 &&
        Math.abs(npc.y - previousY) < 0.1 &&
        (dx !== 0 || dy !== 0)
      ) {
        chooseNPCDirection(npc);
      }

      if (npc.directionX !== 0 || npc.directionY !== 0) {
        npc.rotation =
          Math.atan2(npc.directionY, npc.directionX) + Math.PI / 2;
      }
    }
  }

  for (let i = 0; i < NPC_COUNT; i++) {
    createNPC();
  }

  return {
    npcs,
    updateNPCs
  };
}
