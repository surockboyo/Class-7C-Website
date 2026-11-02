/* PROTECTED */
const FULL_CIRCLE = 360;
const MIN_STEP_DEGREES = 20;

export function stepDegrees(count) {
  if (!Number.isInteger(count) || count < 1) return FULL_CIRCLE;
  return Math.max(FULL_CIRCLE / count, MIN_STEP_DEGREES);
}

export function wrapIndex(index, count) {
  if (!Number.isInteger(count) || count < 1) return -1;
  return ((Math.trunc(index) % count) + count) % count;
}

export function normalizeRotation(rotation, count) {
  if (!Number.isFinite(rotation) || !Number.isInteger(count) || count < 1) return 0;
  return ((rotation % count) + count) % count;
}

export function angleToIndex(angleDegrees, count) {
  if (!Number.isFinite(angleDegrees) || !Number.isInteger(count) || count < 1) return 0;
  return normalizeRotation(angleDegrees / (FULL_CIRCLE / count), count);
}

export function indexToAngle(index, count) {
  if (!Number.isInteger(count) || count < 1) return 0;
  return normalizeRotation(index, count) * (FULL_CIRCLE / count);
}

export function nearestSlot(rotation, count) {
  if (!Number.isInteger(count) || count < 1) return -1;
  return wrapIndex(Math.round(normalizeRotation(rotation, count)), count);
}

export function snapRotation(rotation, count) {
  const index = nearestSlot(rotation, count);
  return index < 0 ? 0 : index;
}

export function relativeSlotOffset(index, rotation, count) {
  if (!Number.isInteger(count) || count < 1 || !Number.isInteger(index)) return 0;
  const normalized = normalizeRotation(rotation, count);
  const front = Math.round(normalized);
  let offset = wrapIndex(index - front + Math.floor(count / 2), count) - Math.floor(count / 2);
  if (count % 2 === 0 && offset === -count / 2) offset = count / 2;
  return offset - (normalized - front);
}

export function visibleIndices(rotation, count, halfAngleDegrees = 70) {
  if (!Number.isInteger(count) || count < 1 || !Number.isFinite(halfAngleDegrees) || halfAngleDegrees < 0) return [];
  const step = stepDegrees(count);
  const front = nearestSlot(rotation, count);
  const normalized = normalizeRotation(rotation, count);
  const fractional = normalized - Math.round(normalized);
  const firstOffset = Math.ceil((-halfAngleDegrees / step) + fractional);
  const lastOffset = Math.floor((halfAngleDegrees / step) + fractional);
  const indices = [];
  for (let offset = firstOffset; offset <= lastOffset; offset += 1) {
    const index = wrapIndex(front + offset, count);
    if (!indices.includes(index)) indices.push(index);
  }
  if (!indices.includes(front)) indices.push(front);
  return indices;
}

export function inertiaStep(rotation, velocity, deltaMs, count, reducedMotion = false) {
  if (!Number.isInteger(count) || count < 1) return { rotation: 0, velocity: 0, done: true };
  if (reducedMotion || count === 1 || !Number.isFinite(velocity)) {
    return { rotation: snapRotation(rotation, count), velocity: 0, done: true };
  }
  const elapsed = Math.max(0, Math.min(Number.isFinite(deltaMs) ? deltaMs : 0, 50));
  const friction = Math.exp(-elapsed / 180);
  const nextVelocity = velocity * friction;
  const nextRotation = normalizeRotation(rotation + velocity * elapsed, count);
  if (Math.abs(nextVelocity) < 0.00002) {
    return { rotation: snapRotation(nextRotation, count), velocity: 0, done: true };
  }
  return { rotation: nextRotation, velocity: nextVelocity, done: false };
}
/* END PROTECTED */
