import * as THREE from "three";
import { SAFETY_SLOGANS } from "./constants";
import { IMAGE_URLS } from "./assets";
import { drawSign, SIGNS } from "./signs";

const BILLBOARD_BGS: [string, string][] = [
  ["#0f766e", "#134e4a"],
  ["#b45309", "#7c2d12"],
  ["#1d4ed8", "#1e3a8a"],
  ["#be123c", "#881337"],
  ["#4d7c0f", "#365314"],
];

let billboardTextures: THREE.CanvasTexture[] | null = null;
let windowTexture: THREE.CanvasTexture | null = null;
let bannerTexture: THREE.CanvasTexture | null = null;
let directionSignTextures: THREE.CanvasTexture[] | null = null;
let busStopTexture: THREE.CanvasTexture | null = null;
let zebraTexture: THREE.CanvasTexture | null = null;
let glowTexture: THREE.CanvasTexture | null = null;
let wheelBlurTexture: THREE.CanvasTexture | null = null;
let skidTexture: THREE.CanvasTexture | null = null;
let oilTexture: THREE.CanvasTexture | null = null;
let arrowTexture: THREE.CanvasTexture | null = null;
let slowTexture: THREE.CanvasTexture | null = null;
let kerbStripeTexture: THREE.CanvasTexture | null = null;
let drainTexture: THREE.CanvasTexture | null = null;
const signTextures = new Map<number, THREE.CanvasTexture>();

interface SurfaceMaterials {
  asphalt: THREE.MeshStandardMaterial;
  asphaltOld: THREE.MeshStandardMaterial;
  paver: THREE.MeshStandardMaterial;
  paverOld: THREE.MeshStandardMaterial;
}

let surfacesApplied = false;

function loadTiled(url: string, repeatX: number, repeatY: number, onLoad: (tex: THREE.Texture) => void): void {
  new THREE.TextureLoader().load(url, (tex) => {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeatX, repeatY);
    tex.anisotropy = 8;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    onLoad(tex);
  });
}

/**
 * Streams the generated photoreal asphalt/paver textures onto the shared road
 * materials once. Until (or unless) they load, the flat-color fallback stays.
 */
export function applyGeneratedSurfaces(mats: SurfaceMaterials): void {
  if (surfacesApplied) return;
  surfacesApplied = true;

  if (IMAGE_URLS.asphalt) {
    loadTiled(IMAGE_URLS.asphalt, 2, 6, (tex) => {
      mats.asphalt.map = tex;
      mats.asphalt.bumpMap = tex;
      mats.asphalt.bumpScale = 0.35;
      mats.asphalt.color.set("#babdc2");
      mats.asphalt.needsUpdate = true;
      const old = tex.clone();
      old.offset.set(0.37, 0.19);
      old.needsUpdate = true;
      mats.asphaltOld.map = old;
      mats.asphaltOld.bumpMap = old;
      mats.asphaltOld.bumpScale = 0.35;
      mats.asphaltOld.color.set("#aaadb2");
      mats.asphaltOld.needsUpdate = true;
    });
  }

  if (IMAGE_URLS.paver) {
    loadTiled(IMAGE_URLS.paver, 2, 11, (tex) => {
      mats.paver.map = tex;
      mats.paver.color.set("#cfc9c0");
      mats.paver.needsUpdate = true;
      const old = tex.clone();
      old.offset.set(0.5, 0.42);
      old.needsUpdate = true;
      mats.paverOld.map = old;
      mats.paverOld.color.set("#b7b1a8");
      mats.paverOld.needsUpdate = true;
    });
  }
}

/** Road-safety hoarding textures, one per slogan. Created once, reused everywhere. */
export function getBillboardTextures(): THREE.CanvasTexture[] {
  if (billboardTextures) return billboardTextures;
  billboardTextures = SAFETY_SLOGANS.map((slogan, i) => {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 256;
    const ctx = canvas.getContext("2d")!;
    const [c1, c2] = BILLBOARD_BGS[i % BILLBOARD_BGS.length];
    const grad = ctx.createLinearGradient(0, 0, 512, 256);
    grad.addColorStop(0, c1);
    grad.addColorStop(1, c2);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 256);
    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.lineWidth = 10;
    ctx.strokeRect(12, 12, 488, 232);
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const words = slogan.split(" ");
    const lines: string[] = [];
    let line = "";
    words.forEach((w) => {
      if ((line + " " + w).trim().length > 12) {
        lines.push(line.trim());
        line = w;
      } else {
        line = (line + " " + w).trim();
      }
    });
    if (line) lines.push(line);
    const fontSize = lines.length > 2 ? 52 : 62;
    ctx.font = `900 ${fontSize}px 'Arial Black', sans-serif`;
    const lineHeight = fontSize + 10;
    const startY = 128 - ((lines.length - 1) * lineHeight) / 2;
    lines.forEach((l, li) => ctx.fillText(l, 256, startY + li * lineHeight));
    ctx.fillStyle = "#fbbf24";
    ctx.font = "700 22px Arial, sans-serif";
    ctx.fillText("— ROADYZ SAFETY COUNCIL —", 256, 232);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  });
  return billboardTextures;
}

/** Road-sign face texture for the collectible sticker pickups (by index). */
export function getSignTexture(index: number): THREE.CanvasTexture {
  const key = ((index % SIGNS.length) + SIGNS.length) % SIGNS.length;
  const cached = signTextures.get(key);
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  drawSign(ctx, SIGNS[key].id, 256);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  signTextures.set(key, tex);
  return tex;
}

/** Soft radial glow sprite for street lamp halos at night. */
export function getGlowTexture(): THREE.CanvasTexture {
  if (glowTexture) return glowTexture;
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  const grad = ctx.createRadialGradient(64, 64, 2, 64, 64, 64);
  grad.addColorStop(0, "rgba(255, 236, 179, 0.95)");
  grad.addColorStop(0.35, "rgba(255, 214, 130, 0.4)");
  grad.addColorStop(1, "rgba(255, 200, 100, 0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  glowTexture = new THREE.CanvasTexture(canvas);
  glowTexture.colorSpace = THREE.SRGBColorSpace;
  return glowTexture;
}

/**
 * Spinning-spoke blur disc for fast-moving wheels: soft radial streaks that
 * read as motion blur when the disc rotates. Shared by cycle + motorcycle.
 */
export function getWheelBlurTexture(): THREE.CanvasTexture {
  if (wheelBlurTexture) return wheelBlurTexture;
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, 128, 128);
  ctx.translate(64, 64);
  // Faint hub disc
  const hub = ctx.createRadialGradient(0, 0, 2, 0, 0, 60);
  hub.addColorStop(0, "rgba(40, 42, 46, 0.75)");
  hub.addColorStop(0.55, "rgba(52, 54, 58, 0.28)");
  hub.addColorStop(1, "rgba(52, 54, 58, 0)");
  ctx.fillStyle = hub;
  ctx.beginPath();
  ctx.arc(0, 0, 60, 0, Math.PI * 2);
  ctx.fill();
  // Blurred spokes
  for (let i = 0; i < 9; i++) {
    ctx.save();
    ctx.rotate((i / 9) * Math.PI * 2);
    const spoke = ctx.createLinearGradient(0, 0, 0, -58);
    spoke.addColorStop(0, "rgba(190, 194, 200, 0.5)");
    spoke.addColorStop(1, "rgba(190, 194, 200, 0.06)");
    ctx.strokeStyle = spoke;
    ctx.lineWidth = 4.5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(0, -56);
    ctx.stroke();
    ctx.restore();
  }
  wheelBlurTexture = new THREE.CanvasTexture(canvas);
  wheelBlurTexture.colorSpace = THREE.SRGBColorSpace;
  return wheelBlurTexture;
}

/** Twin tire-skid streaks with ragged edges — braking marks on hot asphalt. */
export function getSkidTexture(): THREE.CanvasTexture {
  if (skidTexture) return skidTexture;
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 512;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, 128, 512);
  for (const cx of [38, 90]) {
    for (let y = 12; y < 500; y += 7) {
      const fade = Math.sin((y / 512) * Math.PI);
      const wobble = Math.sin(y * 0.045 + cx) * 4;
      ctx.fillStyle = `rgba(12, 12, 14, ${(0.34 + Math.random() * 0.2) * fade})`;
      const w = 15 + Math.random() * 5;
      ctx.fillRect(cx + wobble - w / 2, y, w, 6);
    }
  }
  skidTexture = new THREE.CanvasTexture(canvas);
  skidTexture.colorSpace = THREE.SRGBColorSpace;
  return skidTexture;
}

/** Irregular dark oil/diesel stain blotch with soft alpha falloff. */
export function getOilTexture(): THREE.CanvasTexture {
  if (oilTexture) return oilTexture;
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, 256, 256);
  const blobs = 7;
  for (let i = 0; i < blobs; i++) {
    const a = (i / blobs) * Math.PI * 2;
    const cx = 128 + Math.cos(a) * (i === 0 ? 0 : 26 + Math.random() * 22);
    const cy = 128 + Math.sin(a) * (i === 0 ? 0 : 22 + Math.random() * 20);
    const r = i === 0 ? 78 : 22 + Math.random() * 26;
    const grad = ctx.createRadialGradient(cx, cy, 2, cx, cy, r);
    grad.addColorStop(0, "rgba(10, 10, 12, 0.5)");
    grad.addColorStop(0.6, "rgba(12, 12, 16, 0.26)");
    grad.addColorStop(1, "rgba(14, 14, 18, 0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }
  oilTexture = new THREE.CanvasTexture(canvas);
  oilTexture.colorSpace = THREE.SRGBColorSpace;
  return oilTexture;
}

/** Painted white paint stroke helper with worn speckle holes. */
function wearPaint(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.globalCompositeOperation = "destination-out";
  for (let i = 0; i < 260; i++) {
    ctx.fillStyle = `rgba(0,0,0,${0.25 + Math.random() * 0.5})`;
    ctx.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 4, 2 + Math.random() * 3);
  }
  ctx.globalCompositeOperation = "source-over";
}

/** Worn thermoplastic straight-ahead lane arrow (points toward canvas top). */
export function getArrowTexture(): THREE.CanvasTexture {
  if (arrowTexture) return arrowTexture;
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 512;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, 128, 512);
  ctx.fillStyle = "rgba(226, 224, 214, 0.92)";
  ctx.fillRect(50, 150, 28, 330);
  ctx.beginPath();
  ctx.moveTo(64, 20);
  ctx.lineTo(114, 170);
  ctx.lineTo(14, 170);
  ctx.closePath();
  ctx.fill();
  wearPaint(ctx, 128, 512);
  arrowTexture = new THREE.CanvasTexture(canvas);
  arrowTexture.colorSpace = THREE.SRGBColorSpace;
  return arrowTexture;
}

/** Worn "SLOW" road paint lettering ahead of zebra crossings. */
export function getSlowTexture(): THREE.CanvasTexture {
  if (slowTexture) return slowTexture;
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, 512, 256);
  ctx.fillStyle = "rgba(226, 224, 214, 0.9)";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "900 150px 'Arial Black', sans-serif";
  ctx.save();
  ctx.translate(256, 128);
  ctx.scale(1, 1.7);
  ctx.fillText("SLOW", 0, 0);
  ctx.restore();
  wearPaint(ctx, 512, 256);
  slowTexture = new THREE.CanvasTexture(canvas);
  slowTexture.colorSpace = THREE.SRGBColorSpace;
  return slowTexture;
}

/** Alternating black/yellow kerb blocks — the classic Indian median paint. */
export function getKerbStripeTexture(): THREE.CanvasTexture {
  if (kerbStripeTexture) return kerbStripeTexture;
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = i % 2 === 0 ? "#d9b13b" : "#1c1d20";
    ctx.fillRect(i * 64, 0, 64, 64);
  }
  // Grime pass so the paint doesn't look factory-fresh
  for (let i = 0; i < 160; i++) {
    ctx.fillStyle = `rgba(60, 55, 45, ${Math.random() * 0.25})`;
    ctx.fillRect(Math.random() * 512, Math.random() * 64, 3 + Math.random() * 6, 2 + Math.random() * 4);
  }
  kerbStripeTexture = new THREE.CanvasTexture(canvas);
  kerbStripeTexture.wrapS = THREE.RepeatWrapping;
  kerbStripeTexture.wrapT = THREE.ClampToEdgeWrapping;
  kerbStripeTexture.colorSpace = THREE.SRGBColorSpace;
  return kerbStripeTexture;
}

/** Storm-water drain grate slats set flush into the gutter line. */
export function getDrainTexture(): THREE.CanvasTexture {
  if (drainTexture) return drainTexture;
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#17181b";
  ctx.fillRect(0, 0, 128, 64);
  ctx.fillStyle = "#3c3f45";
  ctx.fillRect(0, 0, 128, 4);
  ctx.fillRect(0, 60, 128, 4);
  for (let x = 10; x < 128; x += 16) {
    ctx.fillStyle = "#43464d";
    ctx.fillRect(x, 6, 5, 52);
    ctx.fillStyle = "#0b0c0e";
    ctx.fillRect(x + 5, 6, 8, 52);
  }
  drainTexture = new THREE.CanvasTexture(canvas);
  drainTexture.colorSpace = THREE.SRGBColorSpace;
  return drainTexture;
}

/** Emissive window-grid texture shared by all buildings for night lighting. */
export function getWindowTexture(): THREE.CanvasTexture {
  if (windowTexture) return windowTexture;
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, 128, 256);
  for (let y = 8; y < 248; y += 22) {
    for (let x = 8; x < 120; x += 20) {
      const lit = Math.random() < 0.55;
      ctx.fillStyle = lit ? (Math.random() < 0.3 ? "#ffedd5" : "#fde68a") : "#111827";
      ctx.fillRect(x, y, 12, 14);
    }
  }
  windowTexture = new THREE.CanvasTexture(canvas);
  windowTexture.colorSpace = THREE.SRGBColorSpace;
  return windowTexture;
}

const DIRECTION_SIGNS: { rows: [string, string][] }[] = [
  { rows: [["City Centre", "2"], ["Metro Stn", "\u2192"], ["NH 44", "\u2191"]] },
  { rows: [["IT Park", "4"], ["Airport", "\u2191"], ["Ring Road", "\u2192"]] },
  { rows: [["Rly Station", "1"], ["Market Rd", "\u2192"], ["Lake View", "\u2191"]] },
];

/** Green overhead highway direction boards (Indian arterial style). */
export function getDirectionSignTextures(): THREE.CanvasTexture[] {
  if (directionSignTextures) return directionSignTextures;
  directionSignTextures = DIRECTION_SIGNS.map((sign) => {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 192;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#0b5c33";
    ctx.fillRect(0, 0, 512, 192);
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 6;
    ctx.strokeRect(8, 8, 496, 176);
    ctx.fillStyle = "#ffffff";
    ctx.textBaseline = "middle";
    ctx.font = "700 38px Arial, sans-serif";
    sign.rows.forEach((row, i) => {
      const y = 44 + i * 52;
      ctx.textAlign = "left";
      ctx.fillText(row[0], 30, y);
      ctx.textAlign = "right";
      ctx.fillText(row[1], 482, y);
    });
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  });
  return directionSignTextures;
}

/** Zebra crossing stripes painted over asphalt (single draw call). */
export function getZebraTexture(): THREE.CanvasTexture {
  if (zebraTexture) return zebraTexture;
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#2b2e33";
  ctx.fillRect(0, 0, 512, 128);
  const stripes = 9;
  const w = 512 / (stripes * 2 - 1);
  ctx.fillStyle = "#d8d5cc";
  for (let i = 0; i < stripes; i++) {
    ctx.fillRect(i * w * 2, 8, w, 112);
  }
  zebraTexture = new THREE.CanvasTexture(canvas);
  zebraTexture.colorSpace = THREE.SRGBColorSpace;
  zebraTexture.anisotropy = 4;
  return zebraTexture;
}

/** Bus stop shelter branding panel. */
export function getBusStopTexture(): THREE.CanvasTexture {
  if (busStopTexture) return busStopTexture;
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 96;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#b91c1c";
  ctx.fillRect(0, 0, 256, 96);
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "900 44px 'Arial Black', sans-serif";
  ctx.fillText("BUS STOP", 128, 40);
  ctx.font = "700 22px Arial, sans-serif";
  ctx.fillStyle = "#fde68a";
  ctx.fillText("ROADYZ CITY TRANSPORT", 128, 74);
  busStopTexture = new THREE.CanvasTexture(canvas);
  busStopTexture.colorSpace = THREE.SRGBColorSpace;
  return busStopTexture;
}

/** Construction banner texture for slide-under gantries. */
export function getBannerTexture(): THREE.CanvasTexture {
  if (bannerTexture) return bannerTexture;
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 96;
  const ctx = canvas.getContext("2d")!;
  for (let i = 0; i < 16; i++) {
    ctx.fillStyle = i % 2 === 0 ? "#f59e0b" : "#111827";
    ctx.save();
    ctx.translate(i * 40 - 20, 0);
    ctx.transform(1, 0, -0.5, 1, 0, 0);
    ctx.fillRect(0, 0, 40, 96);
    ctx.restore();
  }
  ctx.fillStyle = "rgba(17,24,39,0.82)";
  ctx.fillRect(64, 18, 384, 60);
  ctx.fillStyle = "#fbbf24";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "900 40px 'Arial Black', sans-serif";
  ctx.fillText("SLOW DOWN  •  DUCK!", 256, 48);
  bannerTexture = new THREE.CanvasTexture(canvas);
  bannerTexture.colorSpace = THREE.SRGBColorSpace;
  return bannerTexture;
}
