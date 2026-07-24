import {
  GENERIC_FOR_SALE_CHANCE,
  PROPERTY_RENT_INTERVAL_SEC,
  SPECIAL_BUILDINGS
} from "./config.js";
import { setPlayerMessage } from "./player.js";

/**
 * Price a building for sale based on footprint + type base.
 */
export function computePropertyPrice(width, height, type = null) {
  const area = width * height;
  const theme = type ? SPECIAL_BUILDINGS[type] : null;
  const base = theme?.basePrice ?? 120;
  return Math.max(80, Math.floor(base + area * 0.12));
}

export function computeRentIncome(price, type = null) {
  const theme = type ? SPECIAL_BUILDINGS[type] : null;
  const rate = theme?.rentRate ?? 0.02;
  return Math.max(3, Math.floor(price * rate));
}

export function shouldListGenericForSale() {
  return Math.random() < GENERIC_FOR_SALE_CHANCE;
}

export function isBuyable(building) {
  return Boolean(
    building &&
      building.forSale &&
      !building.owner &&
      building.price > 0
  );
}

export function getPropertyLabel(building) {
  if (building.type && SPECIAL_BUILDINGS[building.type]) {
    return SPECIAL_BUILDINGS[building.type].label;
  }
  return building.label || "PROPERTY";
}

/**
 * Player or agent purchases a for-sale building.
 * ownerId: "player" | agent.id
 */
export function buyProperty(stats, building, ownerId, ownerName) {
  if (!isBuyable(building)) {
    return { ok: false, reason: "not for sale" };
  }
  if (stats.money < building.price) {
    return {
      ok: false,
      reason: `need $${building.price} (have $${stats.money})`
    };
  }

  stats.money -= building.price;
  building.owner = ownerId;
  building.ownerName = ownerName || ownerId;
  building.forSale = false;

  if (!Array.isArray(stats.ownedPropertyIds)) {
    stats.ownedPropertyIds = [];
  }
  stats.ownedPropertyIds.push(building.id);

  return {
    ok: true,
    price: building.price,
    rent: building.rentIncome,
    label: getPropertyLabel(building)
  };
}

export function totalPropertyValue(buildingColliders, ownerId) {
  let sum = 0;
  for (const b of buildingColliders) {
    if (b.owner === ownerId) {
      sum += b.price || 0;
    }
  }
  return sum;
}

export function ownedPropertyCount(buildingColliders, ownerId) {
  let n = 0;
  for (const b of buildingColliders) {
    if (b.owner === ownerId) {
      n += 1;
    }
  }
  return n;
}

/**
 * Pay rent on all owned properties. Call for player + each agent.
 */
export function tickPropertyRent(stats, ownerId, buildingColliders, deltaSeconds, options = {}) {
  if (!stats.alive || stats.inJail) {
    return 0;
  }

  stats.propertyRentTimer = (stats.propertyRentTimer || 0) + deltaSeconds;
  if (stats.propertyRentTimer < PROPERTY_RENT_INTERVAL_SEC) {
    return 0;
  }
  stats.propertyRentTimer = 0;

  let total = 0;
  for (const b of buildingColliders) {
    if (b.owner === ownerId && b.rentIncome > 0) {
      total += b.rentIncome;
    }
  }

  if (total <= 0) {
    return 0;
  }

  stats.money += total;
  // Rent is income for tax purposes
  stats.totalIncome = (stats.totalIncome || 0) + total;

  if (!options.silent) {
    setPlayerMessage(
      stats,
      `Property rent +$${total}  (${ownedPropertyCount(buildingColliders, ownerId)} holdings)`,
      2.5
    );
  } else {
    stats.message = `Rent +$${total}`;
    stats.messageTimer = 2;
  }

  return total;
}
