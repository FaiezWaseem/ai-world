import { WORLD_HEIGHT, WORLD_WIDTH } from "./config.js";
import {
  clamp,
  getEntityBounds,
  rectanglesOverlap
} from "./helpers.js";

export function createCollisionSystem({
  buildingColliders,
  getCars,
  getCarBounds
}) {
  function collidesWithBuilding(entity, size) {
    const bounds = getEntityBounds(entity, size);

    for (const building of buildingColliders) {
      if (rectanglesOverlap(bounds, building)) {
        return true;
      }
    }

    return false;
  }

  function collidesWithCar(entity, size) {
    const bounds = getEntityBounds(entity, size);

    for (const car of getCars()) {
      if (rectanglesOverlap(bounds, getCarBounds(car))) {
        return true;
      }
    }

    return false;
  }

  function moveEntity(entity, dx, dy, size, options = {}) {
    const checkCars = options.checkCars !== false;

    entity.x += dx;
    entity.x = clamp(entity.x, size / 2, WORLD_WIDTH - size / 2);

    if (
      collidesWithBuilding(entity, size) ||
      (checkCars && collidesWithCar(entity, size))
    ) {
      entity.x -= dx;
    }

    entity.y += dy;
    entity.y = clamp(entity.y, size / 2, WORLD_HEIGHT - size / 2);

    if (
      collidesWithBuilding(entity, size) ||
      (checkCars && collidesWithCar(entity, size))
    ) {
      entity.y -= dy;
    }
  }

  return {
    collidesWithBuilding,
    collidesWithCar,
    moveEntity
  };
}
