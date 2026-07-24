import {
  CAR_COLORS,
  CAR_COUNT,
  CAR_LENGTH,
  CAR_WIDTH,
  CELL_SIZE,
  GRID_COLS,
  GRID_ROWS,
  NPC_SIZE,
  ROAD_SIZE,
  WORLD_HEIGHT,
  WORLD_WIDTH
} from "./config.js";
import { random, randomItem } from "./helpers.js";
import {
  isHighwayCol,
  isHighwayRow,
  roadCenterX,
  roadCenterY
} from "./roads.js";

function createCarGraphics(color) {
  const body = new PIXI.Graphics();

  body
    .ellipse(0, 8, 24, 10)
    .fill({ color: 0x000000, alpha: 0.22 });

  body
    .roundRect(-CAR_WIDTH / 2, -CAR_LENGTH / 2, CAR_WIDTH, CAR_LENGTH, 5)
    .fill({ color })
    .stroke({ color: 0x0f172a, width: 2 });

  body
    .roundRect(-CAR_WIDTH / 2 + 3, -10, CAR_WIDTH - 6, 16, 3)
    .fill({ color: 0x93c5fd, alpha: 0.9 });

  body
    .rect(-CAR_WIDTH / 2 + 3, -CAR_LENGTH / 2 + 3, 5, 4)
    .fill({ color: 0xfef9c3 });
  body
    .rect(CAR_WIDTH / 2 - 8, -CAR_LENGTH / 2 + 3, 5, 4)
    .fill({ color: 0xfef9c3 });

  body
    .rect(-CAR_WIDTH / 2 + 3, CAR_LENGTH / 2 - 7, 5, 4)
    .fill({ color: 0xef4444 });
  body
    .rect(CAR_WIDTH / 2 - 8, CAR_LENGTH / 2 - 7, 5, 4)
    .fill({ color: 0xef4444 });

  return body;
}

export function getCarBounds(car) {
  const width = car.axis === "v" ? CAR_WIDTH : CAR_LENGTH;
  const height = car.axis === "v" ? CAR_LENGTH : CAR_WIDTH;

  return {
    x: car.x - width / 2,
    y: car.y - height / 2,
    width,
    height
  };
}

function spawnCarOnRoad() {
  const vertical = Math.random() < 0.5;
  const direction = Math.random() < 0.5 ? 1 : -1;
  const laneShift = (direction > 0 ? 1 : -1) * (ROAD_SIZE * 0.22);

  if (vertical) {
    const col = Math.floor(random(0, GRID_COLS));

    return {
      axis: "v",
      direction,
      isHighway: isHighwayCol(col),
      x: roadCenterX(col) + laneShift,
      y: random(40, WORLD_HEIGHT - 40),
      col,
      row: -1
    };
  }

  const row = Math.floor(random(0, GRID_ROWS));

  return {
    axis: "h",
    direction,
    isHighway: isHighwayRow(row),
    x: random(40, WORLD_WIDTH - 40),
    y: roadCenterY(row) + laneShift,
    col: -1,
    row
  };
}

function nearestIntersectionAhead(car) {
  if (car.axis === "v") {
    const col = Math.floor(car.x / CELL_SIZE);
    const currentRow = Math.floor(car.y / CELL_SIZE);

    if (car.direction > 0) {
      const nextRow = currentRow + 1;
      if (nextRow >= GRID_ROWS) {
        return null;
      }
      return {
        x: roadCenterX(col),
        y: nextRow * CELL_SIZE,
        axis: "v"
      };
    }

    return {
      x: roadCenterX(col),
      y: currentRow * CELL_SIZE,
      axis: "v"
    };
  }

  const row = Math.floor(car.y / CELL_SIZE);
  const currentCol = Math.floor(car.x / CELL_SIZE);

  if (car.direction > 0) {
    const nextCol = currentCol + 1;
    if (nextCol >= GRID_COLS) {
      return null;
    }
    return {
      x: nextCol * CELL_SIZE,
      y: roadCenterY(row),
      axis: "h"
    };
  }

  return {
    x: currentCol * CELL_SIZE,
    y: roadCenterY(row),
    axis: "h"
  };
}

export function createCarSystem({
  carLayer,
  isRedForAxis,
  getNpcs
}) {
  const cars = [];

  function createCar() {
    const car = new PIXI.Container();
    const spawn = spawnCarOnRoad();

    car.addChild(createCarGraphics(randomItem(CAR_COLORS)));

    car.x = spawn.x;
    car.y = spawn.y;
    car.axis = spawn.axis;
    car.direction = spawn.direction;
    car.isHighway = spawn.isHighway;
    car.baseSpeed = spawn.isHighway
      ? random(210, 280)
      : random(120, 180);
    car.speed = car.baseSpeed;
    car.stopped = false;
    car.col = spawn.col;
    car.row = spawn.row;

    if (car.axis === "v") {
      car.rotation = car.direction > 0 ? Math.PI : 0;
    } else {
      car.rotation = car.direction > 0 ? Math.PI / 2 : -Math.PI / 2;
    }

    carLayer.addChild(car);
    cars.push(car);
  }

  function shouldStopForLight(car) {
    const lightAxis = car.axis === "v" ? "ns" : "ew";

    if (!isRedForAxis(lightAxis)) {
      return false;
    }

    const intersection = nearestIntersectionAhead(car);
    if (!intersection) {
      return false;
    }

    const approachWindow = 110;

    if (car.axis === "v") {
      const stopY =
        car.direction > 0
          ? intersection.y - 18
          : intersection.y + ROAD_SIZE + 18;
      const distance =
        car.direction > 0 ? stopY - car.y : car.y - stopY;
      return distance > 0 && distance < approachWindow;
    }

    const stopX =
      car.direction > 0
        ? intersection.x - 18
        : intersection.x + ROAD_SIZE + 18;
    const distance =
      car.direction > 0 ? stopX - car.x : car.x - stopX;
    return distance > 0 && distance < approachWindow;
  }

  function carBlockedByOther(car) {
    const lookAhead = CAR_LENGTH + 16;
    const laneSlack = CAR_WIDTH * 0.9;

    for (const other of cars) {
      if (other === car || other.axis !== car.axis) {
        continue;
      }

      const dx = other.x - car.x;
      const dy = other.y - car.y;

      if (car.axis === "v") {
        if (Math.abs(dx) > laneSlack) {
          continue;
        }
        const ahead =
          car.direction > 0
            ? dy > 0 && dy < lookAhead
            : dy < 0 && -dy < lookAhead;
        if (ahead) {
          return true;
        }
      } else {
        if (Math.abs(dy) > laneSlack) {
          continue;
        }
        const ahead =
          car.direction > 0
            ? dx > 0 && dx < lookAhead
            : dx < 0 && -dx < lookAhead;
        if (ahead) {
          return true;
        }
      }
    }

    for (const npc of getNpcs()) {
      if (npc.alive === false) {
        continue;
      }

      const dx = npc.x - car.x;
      const dy = npc.y - car.y;
      const stopDistance = CAR_LENGTH * 0.75 + NPC_SIZE;

      if (car.axis === "v") {
        if (Math.abs(dx) > CAR_WIDTH * 0.7) {
          continue;
        }
        const ahead =
          car.direction > 0
            ? dy > 0 && dy < stopDistance
            : dy < 0 && -dy < stopDistance;
        if (ahead) {
          return true;
        }
      } else {
        if (Math.abs(dy) > CAR_WIDTH * 0.7) {
          continue;
        }
        const ahead =
          car.direction > 0
            ? dx > 0 && dx < stopDistance
            : dx < 0 && -dx < stopDistance;
        if (ahead) {
          return true;
        }
      }
    }

    return false;
  }

  function updateCars(deltaSeconds) {
    for (const car of cars) {
      const stopLight = shouldStopForLight(car);
      const blocked = carBlockedByOther(car);

      car.stopped = stopLight || blocked;
      car.speed = car.stopped ? 0 : car.baseSpeed;

      if (car.speed === 0) {
        continue;
      }

      if (car.axis === "v") {
        car.y += car.direction * car.speed * deltaSeconds;

        if (car.y > WORLD_HEIGHT + 40) {
          car.y = -40;
        } else if (car.y < -40) {
          car.y = WORLD_HEIGHT + 40;
        }
      } else {
        car.x += car.direction * car.speed * deltaSeconds;

        if (car.x > WORLD_WIDTH + 40) {
          car.x = -40;
        } else if (car.x < -40) {
          car.x = WORLD_WIDTH + 40;
        }
      }
    }
  }

  for (let i = 0; i < CAR_COUNT; i++) {
    createCar();
  }

  return {
    cars,
    updateCars,
    getCarBounds
  };
}
