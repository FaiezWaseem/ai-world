import { WORLD_HEIGHT, WORLD_WIDTH } from "./config.js";
import { clamp } from "./helpers.js";

export function updateCamera(app, world, player, deltaSeconds) {
  const targetX = app.screen.width / 2 - player.x;
  const targetY = app.screen.height / 2 - player.y;

  const minimumX = Math.min(0, app.screen.width - WORLD_WIDTH);
  const minimumY = Math.min(0, app.screen.height - WORLD_HEIGHT);

  const clampedX = clamp(targetX, minimumX, 0);
  const clampedY = clamp(targetY, minimumY, 0);

  const smoothing = 1 - Math.pow(0.0005, deltaSeconds);

  world.x += (clampedX - world.x) * smoothing;
  world.y += (clampedY - world.y) * smoothing;
}
