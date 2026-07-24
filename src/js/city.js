import {
  CELL_SIZE,
  COLORS,
  ROAD_SIZE,
  SIDEWALK_SIZE,
  SPECIAL_BUILDINGS,
  WORLD_HEIGHT,
  WORLD_WIDTH
} from "./config.js";
import { createBuilding } from "./buildings.js";
import { random, shuffleInPlace } from "./helpers.js";

function createPoiPlacementList() {
  const list = [];

  for (const [type, theme] of Object.entries(SPECIAL_BUILDINGS)) {
    const count = theme.count ?? 1;
    for (let i = 0; i < count; i++) {
      list.push(type);
    }
  }

  return shuffleInPlace(list);
}

function createTree(sceneryLayer, x, y) {
  const tree = new PIXI.Graphics();

  tree
    .ellipse(x + 4, y + 7, 27, 17)
    .fill({
      color: 0x000000,
      alpha: 0.18
    });

  tree
    .rect(x - 4, y - 3, 8, 18)
    .fill({ color: COLORS.treeTrunk });

  tree
    .circle(x, y - 10, 17)
    .fill({ color: COLORS.treeLeaves });

  tree
    .circle(x - 10, y - 7, 10)
    .fill({ color: 0x2f855a });

  sceneryLayer.addChild(tree);
}

function createPark(sceneryLayer, blockX, blockY, blockWidth, blockHeight) {
  const park = new PIXI.Graphics();

  park
    .roundRect(blockX, blockY, blockWidth, blockHeight, 14)
    .fill({ color: COLORS.park })
    .stroke({
      color: 0x3f7f43,
      width: 4
    });

  park
    .roundRect(
      blockX + blockWidth / 2 - 18,
      blockY + 12,
      36,
      blockHeight - 24,
      10
    )
    .fill({ color: 0xd6c7a1 });

  park
    .roundRect(
      blockX + 12,
      blockY + blockHeight / 2 - 18,
      blockWidth - 24,
      36,
      10
    )
    .fill({ color: 0xd6c7a1 });

  sceneryLayer.addChild(park);

  for (let i = 0; i < 12; i++) {
    const treeX = random(blockX + 25, blockX + blockWidth - 25);
    const treeY = random(blockY + 25, blockY + blockHeight - 25);

    const nearVerticalPath =
      Math.abs(treeX - (blockX + blockWidth / 2)) < 32;
    const nearHorizontalPath =
      Math.abs(treeY - (blockY + blockHeight / 2)) < 32;

    if (!nearVerticalPath && !nearHorizontalPath) {
      createTree(sceneryLayer, treeX, treeY);
    }
  }
}

function collectBlocks() {
  const blocks = [];

  for (let gridX = 0; gridX < WORLD_WIDTH; gridX += CELL_SIZE) {
    for (let gridY = 0; gridY < WORLD_HEIGHT; gridY += CELL_SIZE) {
      const blockX = gridX + ROAD_SIZE + SIDEWALK_SIZE;
      const blockY = gridY + ROAD_SIZE + SIDEWALK_SIZE;
      const blockWidth = CELL_SIZE - ROAD_SIZE - SIDEWALK_SIZE * 2;
      const blockHeight = CELL_SIZE - ROAD_SIZE - SIDEWALK_SIZE * 2;

      if (
        blockX + blockWidth > WORLD_WIDTH ||
        blockY + blockHeight > WORLD_HEIGHT
      ) {
        continue;
      }

      blocks.push({
        gridX,
        gridY,
        blockX,
        blockY,
        blockWidth,
        blockHeight
      });
    }
  }

  return blocks;
}

function addSidewalk(groundLayer, gridX, gridY) {
  const sidewalk = new PIXI.Graphics();

  sidewalk
    .rect(
      gridX + ROAD_SIZE,
      gridY + ROAD_SIZE,
      CELL_SIZE - ROAD_SIZE,
      CELL_SIZE - ROAD_SIZE
    )
    .fill({ color: COLORS.sidewalk });

  groundLayer.addChild(sidewalk);
}

function placeGenericLayout(placeBuilding, block) {
  const { blockX, blockY, blockWidth, blockHeight } = block;
  const layout = Math.floor(random(0, 3));
  const gap = 18;

  if (layout === 0) {
    placeBuilding(blockX, blockY, blockWidth, blockHeight, null);
    return;
  }

  if (layout === 1) {
    const halfWidth = (blockWidth - gap) / 2;
    placeBuilding(blockX, blockY, halfWidth, blockHeight, null);
    placeBuilding(
      blockX + halfWidth + gap,
      blockY,
      halfWidth,
      blockHeight,
      null
    );
    return;
  }

  const halfWidth = (blockWidth - gap) / 2;
  const halfHeight = (blockHeight - gap) / 2;

  placeBuilding(blockX, blockY, halfWidth, halfHeight, null);
  placeBuilding(
    blockX + halfWidth + gap,
    blockY,
    halfWidth,
    halfHeight,
    null
  );
  placeBuilding(
    blockX,
    blockY + halfHeight + gap,
    halfWidth,
    halfHeight,
    null
  );
  placeBuilding(
    blockX + halfWidth + gap,
    blockY + halfHeight + gap,
    halfWidth,
    halfHeight,
    null
  );
}

/**
 * Places every school / shop / gym / office on a random full block,
 * then fills remaining blocks with parks or generic buildings.
 */
export function generateCity({
  groundLayer,
  sceneryLayer,
  buildingLayer,
  labelLayer,
  buildingColliders
}) {
  const placeBuilding = (x, y, width, height, type) => {
    createBuilding(
      buildingLayer,
      labelLayer,
      buildingColliders,
      x,
      y,
      width,
      height,
      type
    );
  };

  const blocks = shuffleInPlace(collectBlocks());
  const poiList = createPoiPlacementList();
  let index = 0;

  // 1) Scatter special POIs onto random blocks (full footprint).
  for (const type of poiList) {
    if (index >= blocks.length) {
      break;
    }

    const block = blocks[index++];
    addSidewalk(groundLayer, block.gridX, block.gridY);
    placeBuilding(
      block.blockX,
      block.blockY,
      block.blockWidth,
      block.blockHeight,
      type
    );
  }

  // 2) Remaining blocks: parks or generic city fabric.
  while (index < blocks.length) {
    const block = blocks[index++];
    addSidewalk(groundLayer, block.gridX, block.gridY);

    if (Math.random() < 0.2) {
      createPark(
        sceneryLayer,
        block.blockX,
        block.blockY,
        block.blockWidth,
        block.blockHeight
      );
      continue;
    }

    placeGenericLayout(placeBuilding, block);
  }
}
