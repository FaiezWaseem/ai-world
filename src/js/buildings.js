import {
  BUILDING_COLORS,
  SPECIAL_BUILDINGS
} from "./config.js";
import { random, randomItem } from "./helpers.js";

function addBuildingLabel(labelLayer, x, y, width, height, text) {
  const fontSize = Math.max(
    11,
    Math.min(18, Math.floor(Math.min(width, height) / 8))
  );

  const label = new PIXI.Text({
    text,
    style: {
      fontFamily: "Arial",
      fontSize,
      fontWeight: "bold",
      fill: 0xffffff,
      align: "center",
      dropShadow: {
        color: 0x000000,
        alpha: 0.85,
        blur: 2,
        distance: 1
      }
    }
  });

  label.anchor.set(0.5);
  label.x = x + width / 2;
  label.y = y + height / 2;
  labelLayer.addChild(label);
}

function decorateSchool(graphics, x, y, width, height, theme) {
  const poleX = x + width - 22;
  const poleY = y + 18;

  graphics
    .rect(poleX, poleY, 3, Math.min(height - 30, 70))
    .fill({ color: 0xcbd5e1 });

  graphics
    .rect(poleX + 3, poleY + 4, 22, 14)
    .fill({ color: theme.accent });

  if (height > 90 && width > 100) {
    graphics
      .roundRect(x + 18, y + height - 48, width - 36, 28, 6)
      .fill({ color: 0xfde68a })
      .stroke({ color: 0xd97706, width: 2 });

    for (let i = 0; i < 4; i++) {
      const gx = x + 30 + i * ((width - 70) / 3);
      graphics
        .rect(gx, y + height - 44, 4, 20)
        .fill({ color: 0xef4444 });
    }
  }

  graphics
    .roundRect(x + width / 2 - 12, y + height - 28, 24, 22, 3)
    .fill({ color: 0x1e3a8a });
}

function decorateBarber(graphics, x, y, width, height, theme) {
  const poleX = x + 14;
  const poleY = y + height / 2 - 28;

  graphics
    .roundRect(poleX, poleY, 12, 56, 6)
    .fill({ color: 0xffffff })
    .stroke({ color: 0x334155, width: 2 });

  const stripeColors = [0xef4444, 0xffffff, 0x3b82f6];

  for (let i = 0; i < 5; i++) {
    graphics
      .rect(poleX + 1, poleY + 4 + i * 10, 10, 8)
      .fill({ color: stripeColors[i % 3] });
  }

  graphics
    .roundRect(x + width / 2 - 28, y + height / 2 - 18, 56, 36, 4)
    .fill({ color: theme.window, alpha: 0.95 })
    .stroke({ color: 0x9d174d, width: 3 });

  const cx = x + width / 2;
  const cy = y + height / 2;

  graphics
    .rect(cx - 10, cy - 2, 20, 4)
    .fill({ color: theme.accent });
  graphics
    .rect(cx - 2, cy - 10, 4, 20)
    .fill({ color: theme.accent });
}

function decorateGrocery(graphics, x, y, width, height, theme) {
  const awningY = y + height / 2 - 8;
  const awningH = 16;
  const stripeW = 14;

  for (let sx = x + 12; sx < x + width - 12; sx += stripeW) {
    const stripeColor =
      Math.floor((sx - x) / stripeW) % 2 === 0
        ? theme.roof
        : theme.accent;

    graphics
      .rect(sx, awningY, Math.min(stripeW, x + width - 12 - sx), awningH)
      .fill({ color: stripeColor });
  }

  const crateColors = [0xef4444, 0xfacc15, 0x22c55e, 0xf97316];

  for (let i = 0; i < 4; i++) {
    const crateX = x + 16 + i * 22;
    if (crateX + 18 > x + width - 10) {
      break;
    }

    graphics
      .rect(crateX, y + height - 30, 18, 14)
      .fill({ color: 0x92400e })
      .stroke({ color: 0x78350f, width: 1 });

    graphics
      .circle(crateX + 9, y + height - 28, 5)
      .fill({ color: crateColors[i % crateColors.length] });
  }

  graphics
    .roundRect(x + width / 2 - 14, y + height - 26, 28, 20, 3)
    .fill({ color: 0x166534 });
}

function decorateRestaurant(graphics, x, y, width, height, theme) {
  const canopyY = y + 22;
  const stripeW = 12;

  graphics
    .roundRect(x + 10, canopyY, width - 20, 18, 4)
    .fill({ color: theme.roof });

  for (let sx = x + 12; sx < x + width - 12; sx += stripeW) {
    if (Math.floor((sx - x) / stripeW) % 2 === 0) {
      graphics
        .rect(
          sx,
          canopyY + 2,
          Math.min(stripeW - 1, x + width - 14 - sx),
          14
        )
        .fill({ color: theme.accent });
    }
  }

  if (width > 80) {
    const tableX = x + width - 42;
    const tableY = y + height - 38;

    graphics
      .circle(tableX, tableY, 10)
      .fill({ color: 0x78716c })
      .stroke({ color: 0x44403c, width: 2 });

    graphics
      .circle(tableX - 14, tableY + 6, 5)
      .fill({ color: theme.color });
    graphics
      .circle(tableX + 14, tableY + 6, 5)
      .fill({ color: theme.color });
  }

  graphics
    .roundRect(x + 18, y + height / 2 + 4, 22, 28, 3)
    .fill({ color: 0x7c2d12 });

  graphics
    .roundRect(x + 48, y + height / 2 + 6, 36, 24, 3)
    .fill({ color: theme.window, alpha: 0.9 })
    .stroke({ color: 0x9a3412, width: 2 });
}

function decorateGym(graphics, x, y, width, height, theme) {
  // Weight-rack silhouettes.
  for (let i = 0; i < 3; i++) {
    const bx = x + 24 + i * 28;
    graphics
      .rect(bx, y + height / 2 - 10, 6, 36)
      .fill({ color: 0x1f2937 });
    graphics
      .rect(bx - 8, y + height / 2 + 2, 22, 8)
      .fill({ color: theme.accent });
  }

  graphics
    .roundRect(x + width / 2 - 16, y + height - 30, 32, 22, 3)
    .fill({ color: 0x7f1d1d });
}

function decorateOffice(graphics, x, y, width, height, theme) {
  // Grid of office windows.
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 4; col++) {
      const wx = x + 22 + col * ((width - 50) / 3.5);
      const wy = y + 40 + row * 28;
      if (wx + 16 > x + width - 12 || wy + 14 > y + height - 20) {
        continue;
      }
      graphics
        .rect(wx, wy, 16, 14)
        .fill({ color: theme.window, alpha: 0.95 })
        .stroke({ color: theme.roof, width: 1 });
    }
  }

  graphics
    .roundRect(x + width / 2 - 14, y + height - 28, 28, 20, 3)
    .fill({ color: 0x0f172a });
}

function decorateGunShop(graphics, x, y, width, height, theme) {
  // Display cabinets.
  for (let i = 0; i < 3; i++) {
    const cx = x + 28 + i * 36;
    graphics
      .roundRect(cx, y + height / 2 - 8, 28, 40, 3)
      .fill({ color: 0x292524 })
      .stroke({ color: theme.accent, width: 2 });
    graphics
      .rect(cx + 6, y + height / 2 + 4, 16, 4)
      .fill({ color: 0xa8a29e });
  }

  // Target icon.
  graphics
    .circle(x + width - 36, y + height / 2, 14)
    .stroke({ color: 0xef4444, width: 3 });
  graphics
    .circle(x + width - 36, y + height / 2, 5)
    .fill({ color: 0xef4444 });

  graphics
    .roundRect(x + width / 2 - 14, y + height - 28, 28, 20, 3)
    .fill({ color: 0x44403c });
}

function decorateJail(graphics, x, y, width, height, theme) {
  // Cell bars on the front.
  for (let i = 0; i < 8; i++) {
    const bx = x + 20 + i * ((width - 40) / 7);
    graphics
      .rect(bx, y + 40, 5, height - 70)
      .fill({ color: 0xcbd5e1 });
  }

  // Watch tower block.
  graphics
    .roundRect(x + width - 48, y + 20, 32, 50, 4)
    .fill({ color: theme.roof })
    .stroke({ color: theme.accent, width: 2 });

  graphics
    .roundRect(x + width / 2 - 16, y + height - 30, 32, 22, 3)
    .fill({ color: 0x1e293b });
}

export function createBuilding(
  buildingLayer,
  labelLayer,
  buildingColliders,
  x,
  y,
  width,
  height,
  type = null
) {
  const building = new PIXI.Graphics();
  const theme = type ? SPECIAL_BUILDINGS[type] : null;
  const color = theme ? theme.color : randomItem(BUILDING_COLORS);
  const roofColor = theme ? theme.roof : 0x475569;
  const windowColor = theme ? theme.window : 0x8be9fd;

  building
    .roundRect(x + 8, y + 10, width, height, 8)
    .fill({
      color: 0x000000,
      alpha: 0.25
    });

  building
    .roundRect(x, y, width, height, 8)
    .fill({ color })
    .stroke({
      color: type ? roofColor : 0x334155,
      width: 4
    });

  building
    .roundRect(x + 12, y + 12, width - 24, height - 24, 5)
    .fill({
      color: roofColor,
      alpha: type ? 0.45 : 0.35
    });

  if (!type) {
    const unitCount = Math.floor(random(1, 4));

    for (let i = 0; i < unitCount; i++) {
      const unitWidth = random(18, 30);
      const unitHeight = random(14, 24);
      const unitX = random(x + 20, x + width - unitWidth - 20);
      const unitY = random(y + 20, y + height - unitHeight - 20);

      building
        .rect(unitX, unitY, unitWidth, unitHeight)
        .fill({ color: 0x334155 })
        .stroke({
          color: 0xcbd5e1,
          width: 2
        });
    }
  }

  for (let wx = x + 20; wx < x + width - 15; wx += 35) {
    building
      .rect(wx, y + 4, 18, 6)
      .fill({ color: windowColor, alpha: 0.85 });

    building
      .rect(wx, y + height - 10, 18, 6)
      .fill({ color: windowColor, alpha: 0.85 });
  }

  for (let wy = y + 22; wy < y + height - 15; wy += 35) {
    building
      .rect(x + 4, wy, 6, 18)
      .fill({ color: windowColor, alpha: 0.85 });

    building
      .rect(x + width - 10, wy, 6, 18)
      .fill({ color: windowColor, alpha: 0.85 });
  }

  if (type === "school") {
    decorateSchool(building, x, y, width, height, theme);
  } else if (type === "barber") {
    decorateBarber(building, x, y, width, height, theme);
  } else if (type === "grocery") {
    decorateGrocery(building, x, y, width, height, theme);
  } else if (type === "restaurant") {
    decorateRestaurant(building, x, y, width, height, theme);
  } else if (type === "gym") {
    decorateGym(building, x, y, width, height, theme);
  } else if (type === "office") {
    decorateOffice(building, x, y, width, height, theme);
  } else if (type === "gunshop") {
    decorateGunShop(building, x, y, width, height, theme);
  } else if (type === "jail") {
    decorateJail(building, x, y, width, height, theme);
  }

  if (theme) {
    const signWidth = Math.min(width - 24, theme.label.length * 11 + 20);
    const signX = x + (width - signWidth) / 2;
    const signY = y + 16;

    building
      .roundRect(signX, signY, signWidth, 22, 4)
      .fill({ color: 0x0f172a, alpha: 0.85 })
      .stroke({ color: theme.accent, width: 2 });
  }

  buildingLayer.addChild(building);

  if (theme) {
    addBuildingLabel(labelLayer, x, y, width, height, theme.label);
  }

  buildingColliders.push({
    x,
    y,
    width,
    height,
    type: type || null,
    minimapColor: theme ? theme.minimap : 0x64748b,
    id: `${type || "generic"}-${buildingColliders.length}`
  });
}
