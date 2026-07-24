import {
  CELL_SIZE,
  COLORS,
  GRID_COLS,
  GRID_ROWS,
  HIGHWAY_COL,
  HIGHWAY_ROW,
  ROAD_SIZE,
  WORLD_HEIGHT,
  WORLD_WIDTH
} from "./config.js";

export function isHighwayCol(col) {
  return col === HIGHWAY_COL;
}

export function isHighwayRow(row) {
  return row === HIGHWAY_ROW;
}

export function roadCenterX(col) {
  return col * CELL_SIZE + ROAD_SIZE / 2;
}

export function roadCenterY(row) {
  return row * CELL_SIZE + ROAD_SIZE / 2;
}

export function createRoads(roadLayer) {
  const roads = new PIXI.Graphics();

  // Vertical roads (city streets + one highway).
  for (let col = 0; col < GRID_COLS; col++) {
    const x = col * CELL_SIZE;
    const isHighway = isHighwayCol(col);
    const asphalt = isHighway ? COLORS.highway : COLORS.road;

    roads
      .rect(x, 0, ROAD_SIZE, WORLD_HEIGHT)
      .fill({ color: asphalt });

    if (isHighway) {
      roads
        .rect(x + 8, 0, 4, WORLD_HEIGHT)
        .fill({ color: COLORS.roadLine, alpha: 0.85 });
      roads
        .rect(x + ROAD_SIZE - 12, 0, 4, WORLD_HEIGHT)
        .fill({ color: COLORS.roadLine, alpha: 0.85 });

      for (let y = 0; y < WORLD_HEIGHT; y += 40) {
        roads
          .rect(x + ROAD_SIZE / 2 - 7, y + 4, 4, 24)
          .fill({ color: COLORS.highwayLine });
        roads
          .rect(x + ROAD_SIZE / 2 + 3, y + 4, 4, 24)
          .fill({ color: COLORS.highwayLine });
      }

      for (let y = 0; y < WORLD_HEIGHT; y += 48) {
        roads
          .rect(x + ROAD_SIZE * 0.28 - 2, y + 8, 4, 22)
          .fill({ color: COLORS.roadLine, alpha: 0.55 });
        roads
          .rect(x + ROAD_SIZE * 0.72 - 2, y + 8, 4, 22)
          .fill({ color: COLORS.roadLine, alpha: 0.55 });
      }
    } else {
      for (let y = 0; y < WORLD_HEIGHT; y += 55) {
        roads
          .rect(x + ROAD_SIZE / 2 - 2, y + 10, 4, 28)
          .fill({ color: COLORS.roadLine, alpha: 0.7 });
      }
    }
  }

  // Horizontal roads (city streets + one highway).
  for (let row = 0; row < GRID_ROWS; row++) {
    const y = row * CELL_SIZE;
    const isHighway = isHighwayRow(row);
    const asphalt = isHighway ? COLORS.highway : COLORS.road;

    roads
      .rect(0, y, WORLD_WIDTH, ROAD_SIZE)
      .fill({ color: asphalt });

    if (isHighway) {
      roads
        .rect(0, y + 8, WORLD_WIDTH, 4)
        .fill({ color: COLORS.roadLine, alpha: 0.85 });
      roads
        .rect(0, y + ROAD_SIZE - 12, WORLD_WIDTH, 4)
        .fill({ color: COLORS.roadLine, alpha: 0.85 });

      for (let x = 0; x < WORLD_WIDTH; x += 40) {
        roads
          .rect(x + 4, y + ROAD_SIZE / 2 - 7, 24, 4)
          .fill({ color: COLORS.highwayLine });
        roads
          .rect(x + 4, y + ROAD_SIZE / 2 + 3, 24, 4)
          .fill({ color: COLORS.highwayLine });
      }

      for (let x = 0; x < WORLD_WIDTH; x += 48) {
        roads
          .rect(x + 8, y + ROAD_SIZE * 0.28 - 2, 22, 4)
          .fill({ color: COLORS.roadLine, alpha: 0.55 });
        roads
          .rect(x + 8, y + ROAD_SIZE * 0.72 - 2, 22, 4)
          .fill({ color: COLORS.roadLine, alpha: 0.55 });
      }
    } else {
      for (let x = 0; x < WORLD_WIDTH; x += 55) {
        roads
          .rect(x + 10, y + ROAD_SIZE / 2 - 2, 28, 4)
          .fill({ color: COLORS.roadLine, alpha: 0.7 });
      }
    }
  }

  // Highway junction pad.
  roads
    .rect(
      HIGHWAY_COL * CELL_SIZE,
      HIGHWAY_ROW * CELL_SIZE,
      ROAD_SIZE,
      ROAD_SIZE
    )
    .fill({ color: COLORS.highway });

  roadLayer.addChild(roads);
}
