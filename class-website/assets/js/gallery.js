import { getBlob, getSharedImageUrl, saveBlob } from "./storage.js";
import { createIcon } from "./icons.js";
import {
  inertiaStep,
  nearestSlot,
  normalizeRotation,
  relativeSlotOffset,
  snapRotation,
  stepDegrees,
  visibleIndices,
  wrapIndex,
} from "./disc-math.js";

/* PROTECTED */
const MAX_DIMENSION = 1600;
const QUALITY = 0.82;
const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function validateSignature(bytes, mime) {
  if (mime === "image/png") return bytes.length > 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value);
  if (mime === "image/jpeg") return bytes.length > 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (mime === "image/webp") {
    return bytes.length > 12
      && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF"
      && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  }
  return false;
}

function readFileWithProgress(file, onProgress) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 20));
    };
    image.addEventListener("error", () => {
      if (destroyed) return;
      const placeholder = document.createElement("span");
      placeholder.className = "gallery-image-placeholder";
      placeholder.textContent = "Foto gagal dimuat";
      imageButton.replaceChildren(placeholder);
    }, { once: true });
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Berkas gambar gagal dibaca."));
    reader.readAsArrayBuffer(file);
  });
}

function canvasBlob(canvas, type) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Gambar gagal dikompres.")), type, QUALITY);
  });
}

export async function processGalleryImage(file, { maxBytes = 5 * 1024 * 1024, onProgress = () => {}, saveLocal = true } = {}) {
  if (!(file instanceof File)) throw new Error("Pilih berkas gambar yang valid.");
  if (!ACCEPTED_TYPES.has(file.type)) throw new Error("Pilih gambar JPG, PNG, atau WebP.");
  if (file.size > maxBytes) throw new Error(`Ukuran gambar melebihi ${Math.round(maxBytes / 1024 / 1024)} MB.`);
  const buffer = await readFileWithProgress(file, onProgress);
  const bytes = new Uint8Array(buffer);
  if (!validateSignature(bytes, file.type)) throw new Error("Isi berkas tidak sesuai dengan format gambar.");
  onProgress(25);
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch (error) {
    throw new Error("Gambar tidak bisa dibuka. Coba pilih gambar lain.", { cause: error });
  }
  onProgress(45);
  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Pemrosesan gambar tidak tersedia di browser ini.");
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  onProgress(70);
  const outputType = file.type === "image/png" ? "image/webp" : file.type;
  const blob = await canvasBlob(canvas, outputType);
  if (!blob.size) throw new Error("Hasil gambar kosong; silakan coba lagi.");
  onProgress(90);
  const id = crypto.randomUUID();
  if (saveLocal) await saveBlob(id, blob);
  onProgress(100);
  return { id, blob, width, height, originalName: file.name };
}

export async function loadGalleryImageUrl(id, storagePath = "") {
  if (storagePath) {
    const url = getSharedImageUrl(storagePath);
    if (!url) throw new Error("Alamat gambar publik tidak tersedia.");
    return url;
  }
  const blob = await getBlob(id);
  if (!blob) throw new Error("Gambar tidak ditemukan di penyimpanan perangkat ini.");
  return URL.createObjectURL(blob);
}

function revokeImageUrl(url) {
  if (url?.startsWith("blob:")) URL.revokeObjectURL(url);
}

function makeButton(label, action, className = "button secondary", iconName = null) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.dataset.action = action;
  if (iconName) button.append(createIcon(iconName));
  button.append(document.createTextNode(label));
  return button;
}

function makeGalleryCard(item, { likedIds, dashboardUnlocked, onOpen, imageObserver, objectUrls, isDestroyed }) {
  const card = document.createElement("article");
  card.className = "gallery-card";
  const imageButton = document.createElement("button");
  imageButton.type = "button";
  imageButton.className = "gallery-image-button";
  imageButton.dataset.id = item.id;
  imageButton.setAttribute("aria-label", `Buka foto: ${item.caption || "Momen kelas"}`);
  const image = document.createElement("img");
  image.className = "gallery-image";
  image.alt = item.caption || "Momen kelas";
  image.loading = "lazy";
  image.dataset.blobId = item.storagePath || item.blobId || "";
  imageButton.append(image);
  imageButton.addEventListener("click", () => onOpen(item.id));
  card.append(imageButton);

  const caption = document.createElement("div");
  caption.className = "gallery-caption";
  const title = document.createElement("strong");
  title.textContent = item.caption || "Momen kelas";
  const byline = document.createElement("p");
  byline.textContent = `${item.uploader || "Teman kelas"} · ${new Intl.DateTimeFormat("id-ID", { dateStyle: "long", timeZone: "Asia/Jakarta" }).format(new Date(item.createdAt))}`;
  caption.append(title, byline);
  if (item.album) {
    const album = document.createElement("p");
    album.textContent = `Album: ${item.album}`;
    caption.append(album);
  }
  const likes = document.createElement("div");
  likes.className = "gallery-likes";
  const likeLabel = document.createElement("span");
  likeLabel.className = "period-meta";
  likeLabel.textContent = "Suka hanya di browser ini";
  const likeButton = makeButton(`${likedIds.includes(item.id) ? "1" : "0"}`, "toggle-like", "button secondary");
  likeButton.dataset.id = item.id;
  likeButton.setAttribute("aria-label", likedIds.includes(item.id) ? "Hapus suka dari foto ini" : "Sukai foto");
  const heart = createIcon("heart", { className: "heart-icon" });
  if (likedIds.includes(item.id)) heart.setAttribute("fill", "currentColor");
  likeButton.prepend(heart);
  likes.append(likeLabel, likeButton);
  caption.append(likes);
  if (dashboardUnlocked) {
    const actions = document.createElement("div");
    actions.className = "record-actions";
    for (const [label, action] of [["Ubah", "edit-record"], ["Hapus", "delete-record"]]) {
      const control = makeButton(label, action);
      control.dataset.collection = "gallery";
      control.dataset.id = item.id;
      actions.append(control);
    }
    caption.append(actions);
  }
  card.append(caption);

  const loadImage = async () => {
    try {
      const url = await loadGalleryImageUrl(item.blobId, item.storagePath);
      if (isDestroyed()) {
        revokeImageUrl(url);
        return;
      }
      objectUrls.add(url);
      image.src = url;
    } catch {
      const placeholder = document.createElement("span");
      placeholder.className = "gallery-image-placeholder";
      placeholder.textContent = "Foto tidak ada di perangkat ini";
      imageButton.replaceChildren(placeholder);
    }
  };
  if (imageObserver) imageObserver.observe(image);
  else void loadImage();
  return { card, image, loadImage };
}

export function createMomentGallery(items, {
  likedIds = [],
  dashboardUnlocked = false,
  mode = "disc",
  startId = null,
  emptyMessage = "Belum ada momen yang dibagikan",
  onOpen = () => {},
  onFrontChange = () => {},
} = {}) {
  const element = document.createElement("section");
  element.className = "moment-gallery";
  element.setAttribute("aria-label", "Momen kelas");
  const urls = new Map();
  const pending = new Set();
  const failed = new Set();
  const listUrls = new Set();
  let destroyed = false;
  let rotation = Math.max(0, items.findIndex((item) => item.id === startId));
  let rafId = 0;
  let wantedBlobs = new Set();
  let pointer = null;
  let velocitySamples = [];
  let previousFrame = 0;
  let currentMode = mode;
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let observer = null;

  const live = document.createElement("p");
  live.className = "sr-only";
  live.setAttribute("aria-live", "polite");
  live.setAttribute("aria-atomic", "true");
  const discShell = document.createElement("div");
  discShell.className = "disc-shell";
  const stage = document.createElement("div");
  stage.className = "disc-stage";
  stage.tabIndex = 0;
  stage.setAttribute("role", "group");
  stage.setAttribute("aria-label", "Piringan foto. Gunakan panah kiri atau kanan untuk memilih foto.");
  const platter = document.createElement("div");
  platter.className = "moment-disc";
  stage.append(platter);
  const hub = document.createElement("div");
  hub.className = "disc-hub";
  const hubMeta = document.createElement("p");
  const hubCaption = document.createElement("strong");
  const hubByline = document.createElement("p");
  const hubLikes = document.createElement("div");
  hubLikes.className = "gallery-likes";
  const hubLikeLabel = document.createElement("span");
  hubLikeLabel.className = "period-meta";
  hubLikeLabel.textContent = "Suka hanya di browser ini";
  const hubLike = makeButton("0", "toggle-like", "button secondary");
  hubLikes.append(hubLikeLabel, hubLike);
  hub.append(hubMeta, hubCaption, hubByline, hubLikes);
  if (dashboardUnlocked) {
    const hubActions = document.createElement("div");
    hubActions.className = "record-actions";
    for (const [label, action] of [["Ubah", "edit-record"], ["Hapus", "delete-record"]]) {
      const control = makeButton(label, action, "button secondary");
      control.dataset.collection = "gallery";
      hubActions.append(control);
    }
    hub.append(hubActions);
  }
  stage.append(hub);
  const controls = document.createElement("div");
  controls.className = "disc-controls";
  const previous = makeButton("Sebelumnya", "disc-previous", "button secondary", "arrowLeft");
  const next = makeButton("Berikutnya", "disc-next", "button secondary", "arrowRight");
  controls.append(previous, next);
  discShell.append(stage, controls);

  const list = document.createElement("div");
  list.className = "disc-list";
  list.setAttribute("aria-label", "Daftar momen kelas");
  if (items.length) {
    observer = typeof IntersectionObserver === "function"
      ? new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          observer.unobserve(entry.target);
          const item = items.find((record) => (record.storagePath || record.blobId) === entry.target.dataset.blobId);
          if (!item) continue;
          void loadGalleryImageUrl(item.blobId, item.storagePath).then((url) => {
            if (destroyed) revokeImageUrl(url);
            else {
              listUrls.add(url);
              entry.target.src = url;
            }
          }).catch(() => {
            const placeholder = document.createElement("span");
            placeholder.className = "gallery-image-placeholder";
            placeholder.textContent = "Foto tidak ada di perangkat ini";
            entry.target.parentElement.replaceChildren(placeholder);
          });
        }
      }, { rootMargin: "160px" })
      : null;
    for (const item of items) {
      const record = makeGalleryCard(item, { likedIds, dashboardUnlocked, onOpen, imageObserver: observer, objectUrls: listUrls, isDestroyed: () => destroyed });
      list.append(record.card);
    }
  } else {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    const title = document.createElement("strong");
    title.textContent = emptyMessage;
    const description = document.createElement("p");
    description.textContent = dashboardUnlocked ? "Tambahkan foto lewat Dashboard. Foto hanya ada di perangkat ini." : "Momen baru akan muncul setelah Owner menambahkan foto.";
    empty.append(title, description);
    list.append(empty);
  }
  element.append(live, discShell, list);

  function frontIndex() {
    return items.length ? nearestSlot(rotation, items.length) : -1;
  }

  function updateHub() {
    const index = frontIndex();
    const item = items[index];
    if (!item) {
      hub.hidden = true;
      live.textContent = "Belum ada foto di piringan.";
      return;
    }
    hub.hidden = false;
    const month = String(item.createdAt ?? "").slice(0, 7);
    hubMeta.textContent = [item.album, month].filter(Boolean).join(" · ") || "Momen kelas";
    hubCaption.textContent = item.caption || "Momen kelas";
    hubByline.textContent = `${item.uploader || "Teman kelas"} · ${new Intl.DateTimeFormat("id-ID", { dateStyle: "long", timeZone: "Asia/Jakarta" }).format(new Date(item.createdAt))}`;
    hubLike.dataset.id = item.id;
    for (const control of hub.querySelectorAll('[data-collection="gallery"]')) control.dataset.id = item.id;
    hubLike.replaceChildren(createIcon("heart", { className: "heart-icon" }), document.createTextNode(likedIds.includes(item.id) ? "1" : "0"));
    hubLike.setAttribute("aria-label", likedIds.includes(item.id) ? "Hapus suka dari foto ini" : "Sukai foto");
    if (likedIds.includes(item.id)) hubLike.querySelector("svg").setAttribute("fill", "currentColor");
    live.textContent = `Foto ${index + 1} dari ${items.length}: ${item.caption || "Momen kelas"}`;
    onFrontChange(item.id);
  }

  function itemAngle(index) {
    const degrees = relativeSlotOffset(index, rotation, items.length) * stepDegrees(items.length);
    return degrees * Math.PI / 180;
  }

  function updatePositions(loadImages = true) {
    const visible = new Set(visibleIndices(rotation, items.length));
    const width = stage.clientWidth || innerWidth;
    const radius = Math.max(260, Math.min(width * 1.1, 620));
    const horizontalRadius = radius * 0.45;
    const stageTop = 18;
    wantedBlobs = new Set();
    const front = frontIndex();
    for (let offset = -2; offset <= 2; offset += 1) {
      const index = wrapIndex(front + offset, items.length);
      const key = items[index]?.storagePath || items[index]?.blobId;
      if (index >= 0 && key) wantedBlobs.add(key);
    }
    for (const [blobId, url] of urls) {
      if (!wantedBlobs.has(blobId)) {
        revokeImageUrl(url);
        urls.delete(blobId);
        failed.delete(blobId);
      }
    }
    const existing = new Map([...platter.children].map((node) => [Number(node.dataset.index), node]));
    for (const node of existing.values()) {
      if (!visible.has(Number(node.dataset.index))) node.remove();
    }
    for (const index of visible) {
      const item = items[index];
      let photo = existing.get(index);
      if (!photo) {
        photo = document.createElement("button");
        photo.type = "button";
        photo.className = "disc-photo";
        photo.dataset.index = String(index);
        photo.dataset.id = item.id;
        photo.setAttribute("aria-label", `Foto ${index + 1} dari ${items.length}: ${item.caption || "Momen kelas"}`);
        photo.addEventListener("click", (event) => {
          if (stage.dataset.suppressClick) {
            event.preventDefault();
            event.stopPropagation();
            return;
          }
          const selected = Number(photo.dataset.index);
          if (selected === frontIndex()) onOpen(item.id);
          else {
            rotation = selected;
            updatePositions();
          }
        });
        platter.append(photo);
      }
      const angle = itemAngle(index);
      const degrees = angle * 180 / Math.PI;
      const x = Math.sin(angle) * horizontalRadius;
      const y = stageTop + (1 - Math.cos(angle)) * radius * 0.55;
      const isFront = index === front;
      photo.classList.toggle("is-front", isFront);
      photo.tabIndex = isFront ? 0 : -1;
      photo.style.opacity = String(isFront ? 1 : Math.max(0.35, 0.78 - Math.abs(degrees) / 250));
      photo.style.transform = `translate3d(calc(${x}px - 50%), ${y}px, 0) rotate(${degrees * 0.35}deg) scale(${isFront ? 1.04 : 0.88})`;
      photo.style.left = "50%";
      photo.style.top = "0";
      const blobId = item.storagePath || item.blobId;
      const cachedUrl = urls.get(blobId);
      if (!blobId || failed.has(blobId)) {
        const placeholder = document.createElement("span");
        placeholder.className = "disc-photo-placeholder";
        placeholder.textContent = "Foto tidak tersedia";
        photo.replaceChildren(placeholder);
      } else if (cachedUrl && photo.dataset.loadedBlob !== blobId) {
        const image = document.createElement("img");
        image.src = cachedUrl;
        image.alt = "";
        image.draggable = false;
        image.addEventListener("error", () => {
          failed.add(blobId);
          const placeholder = document.createElement("span");
          placeholder.className = "disc-photo-placeholder";
          placeholder.textContent = "Foto gagal dimuat";
          photo.replaceChildren(placeholder);
        }, { once: true });
        photo.replaceChildren(image);
        photo.dataset.loadedBlob = blobId;
      } else if (!cachedUrl && !failed.has(blobId) && !photo.querySelector(".disc-photo-placeholder")) {
        const placeholder = document.createElement("span");
        placeholder.className = "disc-photo-placeholder";
        placeholder.textContent = "Memuat foto…";
        photo.replaceChildren(placeholder);
      }
    }
    updateHub();
    if (loadImages) void loadWanted();
  }

  async function loadWanted() {
    for (const assetKey of wantedBlobs) {
      if (urls.has(assetKey) || failed.has(assetKey) || pending.has(assetKey)) continue;
      pending.add(assetKey);
      try {
        const item = items.find((record) => (record.storagePath || record.blobId) === assetKey);
        if (!item) throw new Error("Foto tidak ditemukan.");
        const url = await loadGalleryImageUrl(item.blobId, item.storagePath);
        if (destroyed || !wantedBlobs.has(assetKey)) {
          revokeImageUrl(url);
          continue;
        }
        urls.set(assetKey, url);
      } catch {
        failed.add(assetKey);
      } finally {
        pending.delete(assetKey);
      }
    }
    if (!destroyed) updatePositions(false);
  }

  function rotateTo(index) {
    if (!items.length) return;
    rotation = wrapIndex(index, items.length);
    if (reducedMotion) {
      rotation = snapRotation(rotation, items.length);
      updatePositions();
    } else {
      updatePositions();
    }
  }

  function animateInertia(now) {
    if (destroyed) return;
    if (!previousFrame) previousFrame = now;
    const state = inertiaStep(rotation, pointer?.velocity ?? 0, now - previousFrame, items.length, reducedMotion);
    previousFrame = now;
    rotation = state.rotation;
    if (pointer) pointer.velocity = state.velocity;
    updatePositions();
    if (state.done) {
      rotation = snapRotation(rotation, items.length);
      pointer = null;
      previousFrame = 0;
      updatePositions();
      rafId = 0;
      return;
    }
    rafId = requestAnimationFrame(animateInertia);
  }

  stage.addEventListener("pointerdown", (event) => {
    if (!event.isPrimary || event.button !== 0 || !items.length) return;
    if (event.target.closest(".disc-hub button")) return;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
    pointer = { id: event.pointerId, x: event.clientX, startX: event.clientX, lastX: event.clientX, lastAt: performance.now(), startRotation: rotation, moved: false, velocity: 0 };
    velocitySamples = [{ rotation, at: pointer.lastAt }];
  });
  stage.addEventListener("pointermove", (event) => {
    if (!pointer || event.pointerId !== pointer.id) return;
    const delta = event.clientX - pointer.lastX;
    if (Math.abs(event.clientX - pointer.startX) >= 6 && !pointer.moved) {
      pointer.moved = true;
      stage.setPointerCapture(event.pointerId);
    }
    if (pointer.moved) {
      const width = stage.clientWidth || innerWidth;
      const radius = Math.max(260, Math.min(width * 1.1, 620)) * 0.45;
      const stepRadians = stepDegrees(items.length) * Math.PI / 180;
      rotation -= delta / Math.max(1, radius * stepRadians);
      const now = performance.now();
      velocitySamples.push({ rotation, at: now });
      velocitySamples = velocitySamples.filter((sample) => now - sample.at <= 100);
      pointer.velocity = velocitySamples.length > 1
        ? (rotation - velocitySamples[0].rotation) / Math.max(1, now - velocitySamples[0].at)
        : 0;
      updatePositions();
    }
    pointer.lastX = event.clientX;
    pointer.lastAt = performance.now();
  });
  stage.addEventListener("pointerup", (event) => {
    if (!pointer || event.pointerId !== pointer.id) return;
    if (pointer.moved) {
      stage.dataset.suppressClick = "true";
      if (reducedMotion) {
        rotation = snapRotation(rotation, items.length);
        pointer = null;
        updatePositions();
      } else {
        previousFrame = 0;
        rafId = requestAnimationFrame(animateInertia);
      }
      setTimeout(() => delete stage.dataset.suppressClick, 0);
    } else {
      pointer = null;
    }
  });
  stage.addEventListener("pointercancel", () => { pointer = null; });
  stage.addEventListener("click", (event) => {
    if (!stage.dataset.suppressClick) return;
    event.preventDefault();
    event.stopPropagation();
    delete stage.dataset.suppressClick;
  });
  stage.addEventListener("wheel", (event) => {
    if (Math.abs(event.deltaX) <= Math.abs(event.deltaY) || !items.length) return;
    event.preventDefault();
    const width = stage.clientWidth || innerWidth;
    const radius = Math.max(260, Math.min(width * 1.1, 620)) * 0.45;
    rotation += event.deltaX / Math.max(1, radius * stepDegrees(items.length) * Math.PI / 180);
    rotation = reducedMotion ? snapRotation(rotation, items.length) : normalizeRotation(rotation, items.length);
    updatePositions();
  }, { passive: false });
  stage.addEventListener("keydown", (event) => {
    if (!items.length) return;
    const index = frontIndex();
    if (event.key === "ArrowRight") rotateTo(index + 1);
    else if (event.key === "ArrowLeft") rotateTo(index - 1);
    else if (event.key === "Home") rotateTo(0);
    else if (event.key === "End") rotateTo(items.length - 1);
    else return;
    event.preventDefault();
    stage.focus();
  });
  previous.addEventListener("click", () => rotateTo(frontIndex() - 1));
  next.addEventListener("click", () => rotateTo(frontIndex() + 1));
  const onResize = () => updatePositions();
  addEventListener("resize", onResize, { passive: true });

  if (!items.length) {
    discShell.hidden = true;
    list.hidden = false;
  } else if (currentMode === "list") {
    discShell.hidden = true;
    list.hidden = false;
  } else {
    discShell.hidden = false;
    list.hidden = true;
    updatePositions();
  }

  return {
    element,
    setMode(nextMode) {
      currentMode = nextMode === "list" ? "list" : "disc";
      discShell.hidden = currentMode !== "disc" || !items.length;
      list.hidden = currentMode !== "list" && items.length > 0;
    },
    fallbackToList() {
      currentMode = "list";
      discShell.hidden = true;
      list.hidden = false;
    },
    destroy() {
      destroyed = true;
      cancelAnimationFrame(rafId);
      removeEventListener("resize", onResize);
      observer?.disconnect();
      for (const url of [...urls.values(), ...listUrls]) revokeImageUrl(url);
      urls.clear();
      listUrls.clear();
    },
  };
}
/* END PROTECTED */
