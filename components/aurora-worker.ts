import { createNoise3D } from "simplex-noise";

const RAY_COUNT = 500;
const RAY_PROPS = 8;
const BASE_LEN = 200;
const RANGE_LEN = 200;
const BASE_SPEED = 0.05;
const RANGE_SPEED = 0.1;
const BASE_WIDTH = 10;
const RANGE_WIDTH = 20;
const BASE_TTL = 50;
const RANGE_TTL = 100;
const NOISE_STRENGTH = 100;
const BASE_HUE = 186;
const RANGE_HUE = 44;
const LIGHT_HUE_BASE = 168;
const LIGHT_HUE_RANGE = 152;
const X_OFF = 0.0015;
const Y_OFF = 0.0015;
const Z_OFF = 0.0015;

const LIGHT_SATURATION = 58;
const LIGHT_LUMINANCE = 66;
const LIGHT_MAIN_ALPHA = 0.6;
const LIGHT_BLOOM_ALPHA = 0.28;

export type AuroraProfile = {
  reducedMotion: boolean;
  coarsePointer: boolean;
  lowEnd: boolean;
  baseScale: number;
  dynamicScale: number;
  targetFps: number;
  mainBlur: number;
  bloomBlur: number;
  bloomAlpha: number;
  rayQuality: number;
  speedQuality: number;
  alphaQuality: number;
  saturation: number;
};

export type AuroraPalette = { atmosphere: string; accent: string };

export type AuroraWorkerMessage =
  | {
      type: "init";
      canvas: OffscreenCanvas;
      width: number;
      height: number;
      dpr: number;
      light: boolean;
      palette: AuroraPalette;
      profile: AuroraProfile;
    }
  | { type: "resize"; width: number; height: number; dpr: number }
  | { type: "theme"; light: boolean; palette: AuroraPalette }
  | { type: "hidden"; hidden: boolean }
  | { type: "degrade"; level: number };

function fadeInOut(t: number, m: number) {
  const hm = 0.5 * m;
  return Math.abs(((t + hm) % m) - hm) / hm;
}

function rand(r: number) {
  return Math.random() * r;
}

const postToMain = (msg: unknown) => {
  (self as unknown as Worker).postMessage(msg);
};

type Renderer = {
  resize: (width: number, height: number, dpr: number) => void;
  setTheme: (light: boolean, palette: AuroraPalette) => void;
  setHidden: (hidden: boolean) => void;
  degrade: (level: number) => void;
};

function createRenderer(init: Extract<AuroraWorkerMessage, { type: "init" }>): Renderer | null {
  const canvas = init.canvas;
  const ctxB = canvas.getContext("2d", { alpha: false, desynchronized: true });
  if (!ctxB) return null;

  const profile = init.profile;
  const raysLayer = new OffscreenCanvas(1, 1);
  const staticLayer = new OffscreenCanvas(1, 1);
  const bloomLayer = new OffscreenCanvas(1, 1);
  const ctxA = raysLayer.getContext("2d");
  const ctxS = staticLayer.getContext("2d");
  const ctxBloom = bloomLayer.getContext("2d");
  if (!ctxA || !ctxS || !ctxBloom) return null;

  const noise3D = createNoise3D();

  let w = Math.max(1, init.width);
  let h = Math.max(1, init.height);
  let dpr = init.dpr || 1;
  let lightMode = init.light;
  let palette = init.palette;
  let hidden = false;
  let staticMode = false;
  let degradeScale = 1;
  let baseRatio = 1;
  let effectRatio = 1;
  let rayCount = 0;
  let total = 0;
  let props = new Float32Array(0);
  let tick = 0;
  let frameCounter = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let running = false;
  let budget = 1000 / 24;
  let motionScale = 2.5;

  const applyTiming = () => {
    const fps = profile.targetFps > 0 ? profile.targetFps : 60;
    budget = 1000 / fps;
    motionScale = fps < 60 ? 60 / fps : 1;
  };

  const setCanvasResolution = () => {
    baseRatio = Math.max(1, Math.min(dpr * profile.baseScale, 2));
    effectRatio = Math.max(0.35, Math.min(baseRatio * profile.dynamicScale * degradeScale, baseRatio));

    const pw = Math.max(1, Math.floor(w * baseRatio));
    const ph = Math.max(1, Math.floor(h * baseRatio));
    const ew = Math.max(1, Math.floor(w * effectRatio));
    const eh = Math.max(1, Math.floor(h * effectRatio));

    canvas.width = pw;
    canvas.height = ph;
    raysLayer.width = ew;
    raysLayer.height = eh;
    staticLayer.width = pw;
    staticLayer.height = ph;
    bloomLayer.width = Math.max(1, Math.floor(ew * 0.5));
    bloomLayer.height = Math.max(1, Math.floor(eh * 0.5));

    ctxB.setTransform(baseRatio, 0, 0, baseRatio, 0, 0);
    ctxA.setTransform(effectRatio, 0, 0, effectRatio, 0, 0);
    ctxS.setTransform(baseRatio, 0, 0, baseRatio, 0, 0);
  };

  const drawStaticBackground = () => {
    ctxS.clearRect(0, 0, w, h);
    const { atmosphere, accent } = palette;

    const bgGradient = ctxS.createLinearGradient(0, 0, 0, h);
    if (lightMode) {
      bgGradient.addColorStop(0, `rgba(${atmosphere},0.5)`);
      bgGradient.addColorStop(0.45, `rgba(${atmosphere},0.3)`);
      bgGradient.addColorStop(0.9, `rgba(${atmosphere},0.12)`);
      bgGradient.addColorStop(0.97, `rgba(${atmosphere},0.04)`);
      bgGradient.addColorStop(1, `rgba(${atmosphere},0)`);
    } else {
      bgGradient.addColorStop(0, `rgba(${atmosphere},0.9)`);
      bgGradient.addColorStop(0.45, `rgba(${atmosphere},0.72)`);
      bgGradient.addColorStop(0.9, `rgba(${atmosphere},0.42)`);
      bgGradient.addColorStop(0.97, `rgba(${atmosphere},0.12)`);
      bgGradient.addColorStop(1, `rgba(${atmosphere},0)`);
    }
    ctxS.fillStyle = bgGradient;
    ctxS.fillRect(0, 0, w, h);

    const glowBoost = lightMode ? 1.2 : 1;
    const focusGlow = ctxS.createRadialGradient(w * 0.5, h * 0.42, 0, w * 0.5, h * 0.42, Math.max(w * 0.58, h * 0.72, 520));
    focusGlow.addColorStop(0, `rgba(${accent},${0.04 * glowBoost})`);
    focusGlow.addColorStop(0.24, `rgba(${accent},${0.026 * glowBoost})`);
    focusGlow.addColorStop(0.52, `rgba(${accent},${0.012 * glowBoost})`);
    focusGlow.addColorStop(0.78, `rgba(${accent},${0.004 * glowBoost})`);
    focusGlow.addColorStop(1, `rgba(${accent},0)`);
    ctxS.fillStyle = focusGlow;
    ctxS.fillRect(0, 0, w, h);

    const bottomVignette = ctxS.createLinearGradient(0, h * 0.72, 0, h);
    bottomVignette.addColorStop(0, `rgba(${atmosphere},0)`);
    bottomVignette.addColorStop(0.7, `rgba(${atmosphere},${lightMode ? 0.12 : 0.26})`);
    bottomVignette.addColorStop(1, `rgba(${atmosphere},${lightMode ? 0.3 : 0.56})`);
    ctxS.fillStyle = bottomVignette;
    ctxS.fillRect(0, 0, w, h);
  };

  const initRay = (i: number) => {
    const x = rand(w);
    const len = BASE_LEN + rand(RANGE_LEN);
    const yBase = h * 0.5 + NOISE_STRENGTH;
    const y2Base = yBase - len;
    const n = noise3D(x * X_OFF, yBase * Y_OFF, tick * Z_OFF) * NOISE_STRENGTH;
    const speed = (BASE_SPEED + rand(RANGE_SPEED)) * profile.speedQuality * motionScale * (Math.round(rand(1)) ? 1 : -1);
    const hueBase = lightMode ? LIGHT_HUE_BASE : BASE_HUE;
    const hueRange = lightMode ? LIGHT_HUE_RANGE : RANGE_HUE;
    const hue = hueBase + rand(hueRange);
    const rayWidth = lightMode
      ? (BASE_WIDTH + rand(RANGE_WIDTH)) * 2.1
      : BASE_WIDTH + rand(RANGE_WIDTH);
    props.set([x, yBase + n, y2Base + n, 0, (BASE_TTL + rand(RANGE_TTL)) / motionScale, rayWidth, speed, hue], i);
  };

  const rebuildRays = () => {
    const densityQuality = lightMode ? 1 : profile.rayQuality;
    rayCount = Math.max(96, Math.floor(Math.min(RAY_COUNT, (w / 2.8) * densityQuality)));
    total = rayCount * RAY_PROPS;
    props = new Float32Array(total);
    for (let i = 0; i < total; i += RAY_PROPS) initRay(i);
  };

  const HUE_BUCKETS = 8;
  const raySprites: Array<OffscreenCanvas | null> = new Array(HUE_BUCKETS).fill(null);
  const getRaySprite = (hue: number) => {
    const hueBase = lightMode ? LIGHT_HUE_BASE : BASE_HUE;
    const hueRange = lightMode ? LIGHT_HUE_RANGE : RANGE_HUE;
    const bucket = Math.max(0, Math.min(HUE_BUCKETS - 1, Math.floor(((hue - hueBase) / hueRange) * HUE_BUCKETS)));
    const cached = raySprites[bucket];
    if (cached) return cached;
    const bucketHue = hueBase + ((bucket + 0.5) / HUE_BUCKETS) * hueRange;
    const sat = lightMode ? LIGHT_SATURATION : profile.saturation;
    const lum = lightMode ? LIGHT_LUMINANCE : 66;
    const sprite = new OffscreenCanvas(1, 256);
    const sctx = sprite.getContext("2d");
    if (sctx) {
      const g = sctx.createLinearGradient(0, 0, 0, 256);
      g.addColorStop(0, `hsla(${bucketHue}, ${sat}%, ${lum}%, 0)`);
      g.addColorStop(0.5, `hsla(${bucketHue}, ${sat}%, ${lum}%, 1)`);
      g.addColorStop(1, `hsla(${bucketHue}, ${sat}%, ${lum}%, 0)`);
      sctx.fillStyle = g;
      sctx.fillRect(0, 0, 1, 256);
    }
    raySprites[bucket] = sprite;
    return sprite;
  };

  const drawRay = (i: number) => {
    const x = props[i];
    const y1 = props[i + 1];
    const y2 = props[i + 2];
    const life = props[i + 3];
    const ttl = props[i + 4];
    const width = props[i + 5];
    const hue = props[i + 7];
    const a = fadeInOut(life, ttl) * 0.44 * (lightMode ? 1 : profile.alphaQuality);

    ctxA.globalAlpha = a;
    ctxA.drawImage(getRaySprite(hue), x - width / 2, y2, width, Math.max(1, y1 - y2));
  };

  const updateRay = (i: number) => {
    drawRay(i);
    const oldX = props[i];
    const life = props[i + 3] + 1;
    props[i] = oldX + props[i + 6];
    props[i + 3] = life;
    if (oldX < -50 || oldX > w + 50 || life > props[i + 4]) {
      initRay(i);
    }
  };

  const composeFrame = () => {
    ctxB.fillStyle = `rgb(${palette.atmosphere})`;
    ctxB.fillRect(0, 0, w, h);
    ctxB.drawImage(staticLayer, 0, 0, w, h);

    ctxB.save();
    if (profile.mainBlur > 0) ctxB.filter = `blur(${profile.mainBlur}px)`;
    ctxB.globalCompositeOperation = lightMode ? "multiply" : "lighter";
    if (lightMode) ctxB.globalAlpha = LIGHT_MAIN_ALPHA;
    ctxB.drawImage(raysLayer, 0, 0, w, h);
    ctxB.restore();

    ctxBloom.clearRect(0, 0, bloomLayer.width, bloomLayer.height);
    ctxBloom.filter = `blur(${Math.max(2, profile.bloomBlur * 0.5)}px)`;
    ctxBloom.drawImage(raysLayer, 0, 0, bloomLayer.width, bloomLayer.height);
    ctxBloom.filter = "none";

    ctxB.save();
    ctxB.globalAlpha = lightMode ? LIGHT_BLOOM_ALPHA : profile.bloomAlpha;
    ctxB.globalCompositeOperation = lightMode ? "multiply" : "screen";
    ctxB.drawImage(bloomLayer, 0, 0, w, h);
    ctxB.restore();
  };

  const renderFrame = () => {
    tick += motionScale;
    ctxA.clearRect(0, 0, w, h);
    ctxA.globalCompositeOperation = lightMode ? "source-over" : "lighter";
    for (let i = 0; i < total; i += RAY_PROPS) {
      updateRay(i);
    }
    ctxA.globalCompositeOperation = "source-over";
    ctxA.globalAlpha = 1;
    composeFrame();
    frameCounter += 1;
    if (frameCounter % 24 === 0) postToMain({ type: "frame", tick: frameCounter });
  };

  const step = () => {
    timer = null;
    if (hidden) {
      running = false;
      return;
    }
    renderFrame();
    if (staticMode || profile.reducedMotion) {
      running = false;
      return;
    }
    running = true;
    timer = setTimeout(step, budget);
  };

  const runIfNeeded = () => {
    if (running || hidden) return;
    running = true;
    timer = setTimeout(step, budget);
  };

  applyTiming();
  setCanvasResolution();
  drawStaticBackground();
  rebuildRays();
  renderFrame();
  if (!profile.reducedMotion) runIfNeeded();

  return {
    resize(width, height, nextDpr) {
      const nextW = Math.max(1, width);
      const nextH = Math.max(1, height);
      if (nextW === w && nextH === h && nextDpr === dpr) return;
      w = nextW;
      h = nextH;
      dpr = nextDpr || 1;
      setCanvasResolution();
      drawStaticBackground();
      rebuildRays();
      if (staticMode || profile.reducedMotion) {
        renderFrame();
        return;
      }
      runIfNeeded();
    },
    setTheme(light, nextPalette) {
      lightMode = light;
      palette = nextPalette;
      raySprites.fill(null);
      drawStaticBackground();
      composeFrame();
    },
    setHidden(nextHidden) {
      hidden = nextHidden;
      if (hidden) {
        if (timer !== null) {
          clearTimeout(timer);
          timer = null;
        }
        running = false;
        return;
      }
      if (staticMode || profile.reducedMotion) return;
      runIfNeeded();
    },
    degrade(level) {
      if (level >= 1) {
        profile.targetFps = Math.min(profile.targetFps, 15);
        degradeScale = 0.75;
        applyTiming();
        setCanvasResolution();
        rebuildRays();
      }
      if (level >= 2) {
        staticMode = true;
        if (timer !== null) {
          clearTimeout(timer);
          timer = null;
        }
        running = false;
        renderFrame();
      }
    },
  };
}

let renderer: Renderer | null = null;

self.onmessage = (event: MessageEvent) => {
  const data = event.data as AuroraWorkerMessage;
  switch (data.type) {
    case "init":
      renderer = createRenderer(data);
      break;
    case "resize":
      renderer?.resize(data.width, data.height, data.dpr);
      break;
    case "theme":
      renderer?.setTheme(data.light, data.palette);
      break;
    case "hidden":
      renderer?.setHidden(data.hidden);
      break;
    case "degrade":
      renderer?.degrade(data.level);
      break;
  }
};
