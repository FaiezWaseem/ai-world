import {
  CELL_SIZE,
  GRID_COLS,
  GRID_ROWS,
  ROAD_SIZE
} from "./config.js";

const LIGHT_PHASES = [
  { axis: "ns", color: "green", duration: 4.2 },
  { axis: "ns", color: "yellow", duration: 1.1 },
  { axis: "ew", color: "green", duration: 4.2 },
  { axis: "ew", color: "yellow", duration: 1.1 }
];

export function createTrafficSystem(trafficLayer) {
  let lightPhaseIndex = 0;
  let lightPhaseTimer = LIGHT_PHASES[0].duration;
  const trafficLights = [];

  function getActiveLightPhase() {
    return LIGHT_PHASES[lightPhaseIndex];
  }

  function isRedForAxis(axis) {
    return getActiveLightPhase().axis !== axis;
  }

  function createTrafficLight(intersectionX, intersectionY, corner) {
    const light = new PIXI.Container();
    const graphics = new PIXI.Graphics();

    const offsets = {
      nw: { x: ROAD_SIZE + 10, y: ROAD_SIZE + 10 },
      ne: { x: -14, y: ROAD_SIZE + 10 },
      sw: { x: ROAD_SIZE + 10, y: -14 },
      se: { x: -14, y: -14 }
    };

    const offset = offsets[corner];
    light.x = intersectionX + offset.x;
    light.y = intersectionY + offset.y;

    graphics
      .rect(-3, -28, 6, 36)
      .fill({ color: 0x4b5563 });

    graphics
      .roundRect(-10, -58, 20, 48, 4)
      .fill({ color: 0x111827 })
      .stroke({ color: 0x6b7280, width: 2 });

    light.addChild(graphics);

    const red = new PIXI.Graphics();
    const yellow = new PIXI.Graphics();
    const green = new PIXI.Graphics();

    red.circle(0, -46, 5).fill({ color: 0x7f1d1d });
    yellow.circle(0, -34, 5).fill({ color: 0x78350f });
    green.circle(0, -22, 5).fill({ color: 0x14532d });

    light.addChild(red);
    light.addChild(yellow);
    light.addChild(green);

    light.facesAxis =
      corner === "nw" || corner === "se" ? "ns" : "ew";
    light.bulbs = { red, yellow, green };

    trafficLayer.addChild(light);
    trafficLights.push(light);
  }

  function refreshTrafficLightVisuals() {
    const phase = getActiveLightPhase();

    for (const light of trafficLights) {
      const { red, yellow, green } = light.bulbs;
      const facesActive = light.facesAxis === phase.axis;

      red.clear();
      yellow.clear();
      green.clear();

      red.circle(0, -46, 5).fill({
        color: !facesActive ? 0xef4444 : 0x7f1d1d,
        alpha: !facesActive ? 1 : 0.35
      });

      yellow.circle(0, -34, 5).fill({
        color:
          facesActive && phase.color === "yellow"
            ? 0xfacc15
            : 0x78350f,
        alpha:
          facesActive && phase.color === "yellow" ? 1 : 0.35
      });

      green.circle(0, -22, 5).fill({
        color:
          facesActive && phase.color === "green"
            ? 0x22c55e
            : 0x14532d,
        alpha:
          facesActive && phase.color === "green" ? 1 : 0.35
      });
    }
  }

  function setupTrafficLights() {
    for (let col = 0; col < GRID_COLS; col++) {
      for (let row = 0; row < GRID_ROWS; row++) {
        createTrafficLight(col * CELL_SIZE, row * CELL_SIZE, "se");
      }
    }
  }

  function updateTrafficLights(deltaSeconds) {
    lightPhaseTimer -= deltaSeconds;

    if (lightPhaseTimer <= 0) {
      lightPhaseIndex =
        (lightPhaseIndex + 1) % LIGHT_PHASES.length;
      lightPhaseTimer = LIGHT_PHASES[lightPhaseIndex].duration;
      refreshTrafficLightVisuals();
    }
  }

  setupTrafficLights();
  refreshTrafficLightVisuals();

  return {
    isRedForAxis,
    updateTrafficLights
  };
}
