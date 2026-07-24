export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function random(min, max) {
  return min + Math.random() * (max - min);
}

export function randomItem(array) {
  return array[Math.floor(Math.random() * array.length)];
}

export function rectanglesOverlap(a, b) {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

export function getEntityBounds(entity, size) {
  return {
    x: entity.x - size / 2,
    y: entity.y - size / 2,
    width: size,
    height: size
  };
}

export function shuffleInPlace(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }

  return array;
}
