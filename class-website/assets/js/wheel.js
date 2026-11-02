const FULL_TURN = Math.PI * 2;

export function chooseWinnerIndex(count, randomValues = globalThis.crypto?.getRandomValues?.bind(globalThis.crypto)) {
  if (!Number.isSafeInteger(count) || count < 0) throw new RangeError("Jumlah peserta tidak valid.");
  if (count === 0) return -1;
  if (typeof randomValues !== "function") throw new Error("Sumber acak aman tidak tersedia di browser ini.");
  const limit = Math.floor(0x100000000 / count) * count;
  const buffer = new Uint32Array(1);
  do {
    randomValues(buffer);
  } while (buffer[0] >= limit);
  return buffer[0] % count;
}

export function getRotationForWinner(count, index, currentRotation = 0, extraTurns = 5) {
  if (!Number.isInteger(count) || count < 1 || !Number.isInteger(index) || index < 0 || index >= count) {
    throw new RangeError("Indeks pemenang tidak valid.");
  }
  if (!Number.isFinite(currentRotation) || !Number.isInteger(extraTurns) || extraTurns < 0) {
    throw new RangeError("Rotasi roda tidak valid.");
  }
  const targetOffset = ((-(index + 0.5) * FULL_TURN / count) % FULL_TURN + FULL_TURN) % FULL_TURN;
  const currentOffset = ((currentRotation % FULL_TURN) + FULL_TURN) % FULL_TURN;
  const distance = (targetOffset - currentOffset + FULL_TURN) % FULL_TURN;
  return currentRotation + extraTurns * FULL_TURN + distance;
}

export function getSliceAtPointer(rotation, count) {
  if (!Number.isFinite(rotation) || !Number.isInteger(count) || count < 1) throw new RangeError("Posisi roda tidak valid.");
  const offset = ((-rotation % FULL_TURN) + FULL_TURN) % FULL_TURN;
  return Math.floor(offset / (FULL_TURN / count)) % count;
}

export function drawWheel(canvas, names) {
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas roda tidak tersedia di browser ini.");
  const size = Math.max(240, Math.min(canvas.clientWidth || 320, 420));
  const ratio = window.devicePixelRatio || 1;
  canvas.width = size * ratio;
  canvas.height = size * ratio;
  canvas.style.width = `${size}px`;
  canvas.style.height = `${size}px`;
  context.scale(ratio, ratio);
  const center = size / 2;
  const radius = center - 5;
  const colors = ["#3157c8", "#f0c65f", "#5476d6", "#dce5ff", "#193778", "#f3a77f"];
  context.clearRect(0, 0, size, size);
  if (!names.length) {
    context.beginPath();
    context.arc(center, center, radius, 0, FULL_TURN);
    context.fillStyle = "#e7ecf6";
    context.fill();
    context.fillStyle = "#17233d";
    context.font = "600 16px system-ui";
    context.textAlign = "center";
    context.fillText("Tambah nama dulu", center, center);
    return;
  }
  const slice = FULL_TURN / names.length;
  names.forEach((name, index) => {
    const start = -Math.PI / 2 + index * slice;
    const end = start + slice;
    context.beginPath();
    context.moveTo(center, center);
    context.arc(center, center, radius, start, end);
    context.closePath();
    context.fillStyle = colors[index % colors.length];
    context.fill();
    context.strokeStyle = "#fff";
    context.lineWidth = 2;
    context.stroke();
    if (names.length <= 18) {
      context.save();
      context.translate(center, center);
      context.rotate(start + slice / 2);
      context.textAlign = "right";
      context.fillStyle = index % colors.length === 1 || index % colors.length === 3 ? "#17233d" : "#fff";
      context.font = `600 ${Math.max(9, Math.min(14, 150 / names.length))}px system-ui`;
      context.fillText(name.slice(0, 20), radius - 14, 5, radius * 0.65);
      context.restore();
    }
  });
  context.beginPath();
  context.arc(center, center, 12, 0, FULL_TURN);
  context.fillStyle = "#fff";
  context.fill();
}

export function playWheelTick(audioContext) {
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.type = "triangle";
  oscillator.frequency.value = 760;
  gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.035, audioContext.currentTime + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.035);
  oscillator.connect(gain);
  gain.connect(audioContext.destination);
  oscillator.start();
  oscillator.stop(audioContext.currentTime + 0.04);
}

export function celebrateWinner(container) {
  const colors = ["#f0c65f", "#3157c8", "#8bc4a7", "#e98472"];
  const burst = document.createElement("div");
  burst.className = "confetti-burst";
  burst.setAttribute("aria-hidden", "true");
  for (let index = 0; index < 18; index += 1) {
    const piece = document.createElement("span");
    piece.style.setProperty("--piece", colors[index % colors.length]);
    piece.style.setProperty("--drift", `${(index - 9) * 13}px`);
    piece.style.setProperty("--turn", `${(index % 2 ? 1 : -1) * (90 + index * 13)}deg`);
    piece.style.setProperty("--delay", `${(index % 5) * 30}ms`);
    burst.append(piece);
  }
  container.append(burst);
  if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
    setTimeout(() => burst.remove(), 1500);
  } else {
    burst.remove();
  }
}

export function animateWheel(disc, canvas, names, winnerIndex, reducedMotion, onFinished) {
  if (!names.length || winnerIndex < 0 || winnerIndex >= names.length) throw new Error("Peserta roda tidak valid.");
  drawWheel(canvas, names);
  const previous = Number(disc.dataset.rotation || 0);
  const target = getRotationForWinner(names.length, winnerIndex, previous, reducedMotion ? 0 : 5);
  disc.dataset.rotation = String(target);
  disc.style.transition = reducedMotion ? "none" : "transform 4.8s cubic-bezier(.12,.72,.08,1)";
  disc.style.transform = `rotate(${target}rad)`;
  if (reducedMotion) {
    onFinished();
    return;
  }
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    clearTimeout(fallback);
    onFinished();
  };
  const fallback = setTimeout(finish, 5100);
  disc.addEventListener("transitionend", finish, { once: true });
}
