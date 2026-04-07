(function registerReactiveDotRibbon() {
  if (customElements.get("reactive-dot-ribbon")) {
    return;
  }

  const template = document.createElement("template");
  template.innerHTML = `
    <style>
      :host {
        --dot-ribbon-aspect: 2048 / 1094;
        --dot-ribbon-mobile-aspect: 2048 / 1094;
        --dot-ribbon-min-height: 220px;
        --dot-ribbon-radius: 30px;
        --dot-ribbon-border: rgba(15, 15, 16, 0.1);
        --dot-ribbon-ink: 15, 15, 16;
        --dot-ribbon-paper-top: rgba(255, 255, 255, 0.94);
        --dot-ribbon-paper-bottom: rgba(244, 239, 231, 0.88);
        --dot-ribbon-glow-a: rgba(255, 255, 255, 0.76);
        --dot-ribbon-glow-b: rgba(15, 15, 16, 0.08);
        --dot-ribbon-brand-ink: 23, 23, 23;
        --dot-ribbon-brand-muted: 115, 115, 115;
        --dot-ribbon-brand-stone: 161, 161, 161;
        --dot-ribbon-brand-accent: 228, 0, 20;
        --dot-ribbon-brand-blue: 24, 54, 118;
        --dot-ribbon-brand-teal: 12, 145, 154;
        --dot-ribbon-aura-strength: 0.55;
        --dot-ribbon-aura-blur: 24px;
        --dot-ribbon-aura-radius: 8.6;
        display: block;
        width: 100%;
      }

      .frame {
        position: relative;
        min-height: var(--dot-ribbon-min-height);
        aspect-ratio: var(--dot-ribbon-aspect);
        border: 1px solid var(--dot-ribbon-border);
        border-radius: var(--dot-ribbon-radius);
        overflow: hidden;
        background:
          radial-gradient(circle at 26% 32%, var(--dot-ribbon-glow-a), transparent 36%),
          linear-gradient(180deg, var(--dot-ribbon-paper-top), var(--dot-ribbon-paper-bottom));
        box-shadow:
          0 18px 42px rgba(31, 20, 10, 0.08),
          inset 0 1px 0 rgba(255, 255, 255, 0.86);
        transform-origin: 42% 54%;
        will-change: transform, filter;
        isolation: isolate;
      }

      .frame::before,
      .frame::after {
        content: "";
        position: absolute;
        border-radius: 999px;
        pointer-events: none;
        background: radial-gradient(circle, var(--dot-ribbon-glow-b), transparent 68%);
      }

      .frame::before {
        left: 18px;
        bottom: 18px;
        width: 124px;
        height: 124px;
      }

      .frame::after {
        top: 18px;
        right: 18px;
        width: 180px;
        height: 180px;
        opacity: 0.45;
      }

      canvas {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        display: block;
        cursor: crosshair;
        touch-action: none;
      }

      .hint {
        position: absolute;
        right: 18px;
        bottom: 18px;
        z-index: 2;
        padding: 10px 14px;
        border-radius: 999px;
        border: 1px solid rgba(var(--dot-ribbon-ink), 0.08);
        background: rgba(255, 255, 255, 0.74);
        backdrop-filter: blur(10px);
        font: 500 0.82rem/1.1 "Manrope", "Avenir Next", sans-serif;
        letter-spacing: 0.04em;
        color: rgba(var(--dot-ribbon-ink), 0.68);
        user-select: none;
        pointer-events: none;
      }

      .hint:empty {
        display: none;
      }

      .frame.is-live {
        animation: stage-sweep 1500ms cubic-bezier(0.18, 0.84, 0.22, 1) both;
      }

      @keyframes stage-sweep {
        0% {
          transform: translate3d(-34px, 10px, 0) rotate(3.8deg);
          filter: blur(1.2px);
        }

        48% {
          transform: translate3d(16px, -4px, 0) rotate(0.8deg);
          filter: blur(0);
        }

        100% {
          transform: translate3d(0, 0, 0) rotate(0deg);
          filter: blur(0);
        }
      }

      @media (max-width: 720px) {
        .frame {
          aspect-ratio: var(--dot-ribbon-mobile-aspect, var(--dot-ribbon-aspect));
          min-height: max(var(--dot-ribbon-min-height), 250px);
          border-radius: 24px;
        }

        .hint {
          right: 12px;
          bottom: 12px;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .frame.is-live {
          animation: none;
        }
      }
    </style>
    <div class="frame">
      <canvas part="canvas" aria-hidden="true"></canvas>
      <div class="hint"></div>
    </div>
  `;

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function easeOutExpo(value) {
    return value >= 1 ? 1 : 1 - Math.pow(2, -10 * value);
  }

  function smoothstep(edge0, edge1, value) {
    const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
    return t * t * (3 - 2 * t);
  }

  function hashNoise(a, b) {
    const raw = Math.sin(a * 127.1 + b * 311.7) * 43758.5453123;
    return raw - Math.floor(raw);
  }

  function normalizeVector(x, y) {
    const length = Math.hypot(x, y) || 1;
    return { x: x / length, y: y / length };
  }

  function gaussian(distance, spread) {
    return Math.exp(-(distance * distance) / (2 * spread * spread));
  }

  function mixChannel(start, end, amount) {
    return Math.round(start + (end - start) * amount);
  }

  function parseChannels(rawValue, fallback) {
    const channels = rawValue
      .split(",")
      .map((part) => Number.parseFloat(part.trim()))
      .filter((value) => Number.isFinite(value));

    if (channels.length < 3) {
      return fallback;
    }

    return channels.slice(0, 3).map((value) => clamp(Math.round(value), 0, 255));
  }

  function parseNumber(rawValue, fallback) {
    const value = Number.parseFloat(rawValue);
    return Number.isFinite(value) ? value : fallback;
  }

  function buildLane(points, options = {}) {
    const slopes = points.map((point, index) => {
      if (index === 0) {
        const next = points[index + 1];
        return (next.y - point.y) / (next.x - point.x);
      }

      if (index === points.length - 1) {
        const previous = points[index - 1];
        return (point.y - previous.y) / (point.x - previous.x);
      }

      const previous = points[index - 1];
      const next = points[index + 1];
      return (next.y - previous.y) / (next.x - previous.x);
    });

    return {
      points,
      slopes,
      spread: options.spread ?? 0.1,
      weight: options.weight ?? 1,
    };
  }

  function sampleLane(lane, x) {
    const points = lane.points;
    const slopes = lane.slopes;

    if (x <= points[0].x) {
      return { y: points[0].y, dyDx: slopes[0] };
    }

    const lastIndex = points.length - 1;

    if (x >= points[lastIndex].x) {
      return { y: points[lastIndex].y, dyDx: slopes[lastIndex] };
    }

    let segmentIndex = 0;

    for (let index = 0; index < lastIndex; index += 1) {
      if (x >= points[index].x && x <= points[index + 1].x) {
        segmentIndex = index;
        break;
      }
    }

    const start = points[segmentIndex];
    const end = points[segmentIndex + 1];
    const dx = end.x - start.x;
    const t = clamp((x - start.x) / dx, 0, 1);
    const t2 = t * t;
    const t3 = t2 * t;

    const h00 = 2 * t3 - 3 * t2 + 1;
    const h10 = t3 - 2 * t2 + t;
    const h01 = -2 * t3 + 3 * t2;
    const h11 = t3 - t2;

    const y =
      h00 * start.y +
      h10 * dx * slopes[segmentIndex] +
      h01 * end.y +
      h11 * dx * slopes[segmentIndex + 1];

    const dh00 = 6 * t2 - 6 * t;
    const dh10 = 3 * t2 - 4 * t + 1;
    const dh01 = -6 * t2 + 6 * t;
    const dh11 = 3 * t2 - 2 * t;

    const dyDx =
      (dh00 * start.y +
        dh10 * dx * slopes[segmentIndex] +
        dh01 * end.y +
        dh11 * dx * slopes[segmentIndex + 1]) /
      dx;

    return { y, dyDx };
  }

  const FLOW_LANES = [
    buildLane(
      [
        { x: 0, y: 0.66 },
        { x: 0.11, y: 0.64 },
        { x: 0.24, y: 0.5 },
        { x: 0.36, y: 0.34 },
        { x: 0.48, y: 0.26 },
        { x: 0.58, y: 0.28 },
        { x: 0.67, y: 0.36 },
        { x: 0.77, y: 0.6 },
        { x: 0.87, y: 0.74 },
        { x: 0.95, y: 0.75 },
        { x: 1, y: 0.7 },
      ],
      { spread: 0.085, weight: 1.28 }
    ),
    buildLane(
      [
        { x: 0, y: 0.85 },
        { x: 0.12, y: 0.83 },
        { x: 0.22, y: 0.8 },
        { x: 0.33, y: 0.63 },
        { x: 0.45, y: 0.61 },
        { x: 0.56, y: 0.73 },
        { x: 0.68, y: 0.91 },
        { x: 0.79, y: 1.02 },
        { x: 0.9, y: 1.03 },
        { x: 1, y: 0.96 },
      ],
      { spread: 0.105, weight: 0.92 }
    ),
    buildLane(
      [
        { x: 0, y: 1.02 },
        { x: 0.12, y: 1.01 },
        { x: 0.24, y: 0.95 },
        { x: 0.35, y: 0.84 },
        { x: 0.46, y: 0.77 },
        { x: 0.56, y: 0.8 },
        { x: 0.67, y: 0.9 },
        { x: 0.79, y: 1.04 },
        { x: 0.9, y: 1.1 },
        { x: 1, y: 1.06 },
      ],
      { spread: 0.12, weight: 0.72 }
    ),
  ];

  class ReactiveDotRibbon extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: "open" });
      this.shadowRoot.appendChild(template.content.cloneNode(true));

      this.frame = this.shadowRoot.querySelector(".frame");
      this.canvas = this.shadowRoot.querySelector("canvas");
      this.hintNode = this.shadowRoot.querySelector(".hint");
      this.ctx = this.canvas.getContext("2d");
      this.prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
      this.coarsePointer = window.matchMedia("(pointer: coarse)").matches;
      this.inkChannels = "15, 15, 16";
      this.brandPalette = {
        ink: [23, 23, 23],
        muted: [115, 115, 115],
        stone: [161, 161, 161],
        accent: [228, 0, 20],
        blue: [24, 54, 118],
        teal: [12, 145, 154],
      };
      this.auraSettings = {
        strength: 0.55,
        blur: 24,
        radius: 8.6,
      };
      this.auraScale = this.coarsePointer ? 0.36 : 0.46;
      this.auraCanvas = document.createElement("canvas");
      this.auraCtx = this.auraCanvas.getContext("2d");
      this.sampleCanvas = document.createElement("canvas");
      this.sampleCtx = this.sampleCanvas.getContext("2d", { willReadFrequently: true });
      this.sourceImage = new Image();
      this.sourceImage.decoding = "async";
      this.sourceImage.addEventListener("load", () => {
        this.fitCanvas();
        if (this.shouldAnimate()) {
          this.startLoop();
        }
      });

      this.state = {
        dots: [],
        width: 0,
        height: 0,
        dpr: 1,
        lastTime: 0,
        introStartedAt: 0,
        introActive: false,
        activated: false,
        inView: false,
        pointers: new Map(),
      };

      this.resizeObserver = new ResizeObserver(() => this.fitCanvas());
      this.intersectionObserver = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            this.state.inView = entry.isIntersecting;

            if (entry.isIntersecting) {
              this.activateIntro();
              this.startLoop();
            }
          }
        },
        {
          threshold: 0.28,
        }
      );

      this.onPointerDown = this.onPointerDown.bind(this);
      this.onPointerMove = this.onPointerMove.bind(this);
      this.onPointerUp = this.onPointerUp.bind(this);
      this.onPointerCancel = this.onPointerCancel.bind(this);
      this.draw = this.draw.bind(this);
    }

    static get observedAttributes() {
      return ["hint", "source"];
    }

    connectedCallback() {
      this.syncHint();
      this.syncSource();
      this.refreshVisualTokens();
      this.resizeObserver.observe(this);
      this.intersectionObserver.observe(this);
      this.canvas.addEventListener("pointerdown", this.onPointerDown);
      this.canvas.addEventListener("pointermove", this.onPointerMove);
      this.canvas.addEventListener("pointerup", this.onPointerUp);
      this.canvas.addEventListener("pointercancel", this.onPointerCancel);
      this.canvas.addEventListener("pointerleave", this.onPointerUp);

      this.fitCanvas();
    }

    disconnectedCallback() {
      this.resizeObserver.disconnect();
      this.intersectionObserver.disconnect();
      this.canvas.removeEventListener("pointerdown", this.onPointerDown);
      this.canvas.removeEventListener("pointermove", this.onPointerMove);
      this.canvas.removeEventListener("pointerup", this.onPointerUp);
      this.canvas.removeEventListener("pointercancel", this.onPointerCancel);
      this.canvas.removeEventListener("pointerleave", this.onPointerUp);

      if (this.rafId) {
        cancelAnimationFrame(this.rafId);
        this.rafId = 0;
      }
    }

    attributeChangedCallback(name) {
      if (name === "hint") {
        this.syncHint();
      }

      if (name === "source") {
        this.syncSource();
      }
    }

    syncHint() {
      this.hintNode.textContent = this.getAttribute("hint") || "";
    }

    syncSource() {
      const rawSource = this.getAttribute("source") || "./dots-pattern.webp";
      const resolvedSource = new URL(rawSource, document.baseURI).href;

      if (this.sourceImage.src !== resolvedSource) {
        this.sourceImage.src = resolvedSource;
      }
    }

    refreshVisualTokens() {
      const styles = getComputedStyle(this);
      const ink = styles.getPropertyValue("--dot-ribbon-ink").trim();
      this.inkChannels = ink || "15, 15, 16";
      this.brandPalette = {
        ink: parseChannels(styles.getPropertyValue("--dot-ribbon-brand-ink").trim(), [23, 23, 23]),
        muted: parseChannels(styles.getPropertyValue("--dot-ribbon-brand-muted").trim(), [115, 115, 115]),
        stone: parseChannels(styles.getPropertyValue("--dot-ribbon-brand-stone").trim(), [161, 161, 161]),
        accent: parseChannels(styles.getPropertyValue("--dot-ribbon-brand-accent").trim(), [228, 0, 20]),
        blue: parseChannels(styles.getPropertyValue("--dot-ribbon-brand-blue").trim(), [24, 54, 118]),
        teal: parseChannels(styles.getPropertyValue("--dot-ribbon-brand-teal").trim(), [12, 145, 154]),
      };
      this.auraSettings = {
        strength: clamp(parseNumber(styles.getPropertyValue("--dot-ribbon-aura-strength").trim(), 0.55), 0, 1),
        blur: clamp(parseNumber(styles.getPropertyValue("--dot-ribbon-aura-blur").trim(), 24), 0, 48),
        radius: clamp(parseNumber(styles.getPropertyValue("--dot-ribbon-aura-radius").trim(), 8.6), 0, 18),
      };
    }

    fitCanvas() {
      const bounds = this.frame.getBoundingClientRect();
      const width = Math.round(bounds.width);
      const height = Math.round(bounds.height);

      if (width < 2 || height < 2) {
        return;
      }

      this.state.width = width;
      this.state.height = height;
      this.state.dpr = Math.min(window.devicePixelRatio || 1, this.coarsePointer ? 1.5 : 2);

      this.canvas.width = Math.round(width * this.state.dpr);
      this.canvas.height = Math.round(height * this.state.dpr);
      this.ctx.setTransform(this.state.dpr, 0, 0, this.state.dpr, 0, 0);

      this.auraScale = this.coarsePointer ? 0.36 : 0.46;
      this.auraCanvas.width = Math.max(1, Math.round(width * this.state.dpr * this.auraScale));
      this.auraCanvas.height = Math.max(1, Math.round(height * this.state.dpr * this.auraScale));
      if (this.auraCtx) {
        this.auraCtx.setTransform(
          this.state.dpr * this.auraScale,
          0,
          0,
          this.state.dpr * this.auraScale,
          0,
          0
        );
      }

      this.refreshVisualTokens();
      this.buildDots();

      if (this.shouldAnimate()) {
        this.startLoop();
      } else {
        this.state.lastTime = 0;
      }
    }

    getImageDrawRect(destWidth, destHeight) {
      const imageRatio = this.sourceImage.naturalWidth / this.sourceImage.naturalHeight;
      const targetRatio = destWidth / destHeight;
      let drawWidth = destWidth;
      let drawHeight = destHeight;
      let drawX = 0;
      let drawY = 0;

      if (imageRatio > targetRatio) {
        drawHeight = destHeight;
        drawWidth = drawHeight * imageRatio;
        drawX = (destWidth - drawWidth) * 0.5;
      } else {
        drawWidth = destWidth;
        drawHeight = drawWidth / imageRatio;
        drawY = (destHeight - drawHeight) * 0.5;
      }

      return { drawX, drawY, drawWidth, drawHeight };
    }

    sampleFlowField(nx, ny) {
      const aspect = this.state.height / this.state.width;
      let flowX = 0;
      let flowY = 0;
      let normalX = 0;
      let normalY = 0;
      let totalWeight = 0;

      for (const lane of FLOW_LANES) {
        const laneSample = sampleLane(lane, nx);
        const tangent = normalizeVector(1, laneSample.dyDx * aspect);
        const normal = normalizeVector(-tangent.y, tangent.x);
        const distance = Math.abs(ny - laneSample.y);
        const weight = gaussian(distance, lane.spread) * lane.weight;

        if (weight < 0.0001) {
          continue;
        }

        flowX += tangent.x * weight;
        flowY += tangent.y * weight;
        normalX += normal.x * weight;
        normalY += normal.y * weight;
        totalWeight += weight;
      }

      if (totalWeight < 0.0001) {
        return {
          flowX: 1,
          flowY: 0,
          normalX: 0,
          normalY: -1,
          laneEnergy: 0,
        };
      }

      const flow = normalizeVector(flowX, flowY);
      const normal = normalizeVector(normalX, normalY);

      return {
        flowX: flow.x,
        flowY: flow.y,
        normalX: normal.x,
        normalY: normal.y,
        laneEnergy: clamp(totalWeight, 0, 2.4),
      };
    }

    buildDots() {
      if (!this.sourceImage.complete || !this.sourceImage.naturalWidth || !this.sourceImage.naturalHeight) {
        this.state.dots = [];
        return;
      }

      const dots = [];
      const { width, height } = this.state;
      const spacing = clamp(
        width / (this.coarsePointer ? 128 : 180),
        this.coarsePointer ? 6.4 : 6.8,
        this.coarsePointer ? 8.4 : 8.9
      );
      const rowStep = spacing * 0.88;
      const sampleScale = this.coarsePointer ? 0.85 : 1;
      const sampleWidth = Math.max(1, Math.round(width * sampleScale));
      const sampleHeight = Math.max(1, Math.round(height * sampleScale));

      this.sampleCanvas.width = sampleWidth;
      this.sampleCanvas.height = sampleHeight;
      this.sampleCtx.clearRect(0, 0, sampleWidth, sampleHeight);
      const { drawX, drawY, drawWidth, drawHeight } = this.getImageDrawRect(sampleWidth, sampleHeight);
      this.sampleCtx.drawImage(this.sourceImage, drawX, drawY, drawWidth, drawHeight);
      const imageData = this.sampleCtx.getImageData(0, 0, sampleWidth, sampleHeight).data;

      const readPixel = (x, y) => {
        const px = clamp(Math.round((x / width) * (sampleWidth - 1)), 0, sampleWidth - 1);
        const py = clamp(Math.round((y / height) * (sampleHeight - 1)), 0, sampleHeight - 1);
        const index = (py * sampleWidth + px) * 4;

        return {
          r: imageData[index],
          g: imageData[index + 1],
          b: imageData[index + 2],
          a: imageData[index + 3] / 255,
        };
      };

      let rowIndex = 0;

      for (let y = 0; y <= height + rowStep; y += rowStep) {
        const offset = rowIndex % 2 === 0 ? 0 : spacing * 0.5;

        for (let x = offset; x <= width + spacing; x += spacing) {
          const pixel = readPixel(x, y);
          const luma = pixel.r * 0.2126 + pixel.g * 0.7152 + pixel.b * 0.0722;
          const darkness = (1 - luma / 255) * pixel.a;
          const threshold = this.coarsePointer ? 0.018 : 0.008;

          if (darkness < threshold) {
            continue;
          }

          const grain = hashNoise(x * 0.11, y * 0.07);
          const edgeFade =
            smoothstep(0, 0.08, x / width) * smoothstep(1, 0.92, x / width);
          const radius =
            spacing *
            edgeFade *
            (0.014 + darkness * (this.coarsePointer ? 0.2 : 0.235) + grain * 0.006);
          const alpha = clamp(0.06 + darkness * 0.98, 0.04, 0.98);
          const tone = Math.round(18 + (1 - darkness) * 218);
          const nx = x / width;
          const ny = y / height;
          const flowField = this.sampleFlowField(nx, ny);
          const travelSeed = hashNoise(x * 0.013, y * 0.019);
          const accentSeed = Math.pow(hashNoise(x * 0.029, y * 0.017), 3.2);
          const blueSeed = Math.pow(hashNoise(x * 0.021, y * 0.031), 1.85);
          const tealSeed = Math.pow(hashNoise(x * 0.019 + 11.2, y * 0.037 + 4.6), 3.8);
          const accentMix = clamp(
            (0.06 + darkness * 0.2 + flowField.laneEnergy * 0.1) * accentSeed,
            0,
            0.46
          );
          const blueMix = clamp(
            ((1 - ny) * 0.22 + flowField.laneEnergy * 0.14 + (1 - darkness) * 0.1) * blueSeed,
            0,
            0.46
          );
          const tealMix = clamp(
            (0.03 + flowField.laneEnergy * 0.12 + (0.5 + travelSeed * 0.5) * 0.07) * tealSeed,
            0,
            0.24
          );
          const baseTone = clamp(0.08 + (1 - darkness) * 0.66 + grain * 0.08, 0.04, 0.92);
          const stoneMix = clamp((1 - darkness) * 0.16 + (1 - edgeFade) * 0.18, 0.02, 0.28);

          dots.push({
            x,
            y,
            nx,
            ny,
            baseRadius: radius,
            alpha,
            tone,
            grain,
            depth: darkness,
            flowWeight: 0.5 + darkness * 1.1,
            swirlWeight: 0.26 + darkness * 0.82,
            flowX: flowField.flowX,
            flowY: flowField.flowY,
            normalX: flowField.normalX,
            normalY: flowField.normalY,
            laneEnergy: flowField.laneEnergy,
            baseTone,
            stoneMix,
            accentMix,
            blueMix,
            tealMix,
            phase: grain * Math.PI * 2,
            laneOffset: hashNoise(x * 0.017, y * 0.023),
            travelLead: travelSeed,
            travelSpeed: 0.86 + flowField.laneEnergy * 0.12 + grain * 0.18,
            travelSpan: 18 + darkness * 26 + flowField.laneEnergy * 14,
            offsetX: 0,
            offsetY: 0,
            velocityX: 0,
            velocityY: 0,
          });
        }

        rowIndex += 1;
      }

      this.state.dots = dots;
    }

    activateIntro() {
      if (this.state.activated) {
        return;
      }

      this.state.activated = true;
      this.state.introActive = !this.prefersReducedMotion.matches;
      this.state.introStartedAt = performance.now();
      this.frame.classList.add("is-live");
      this.startLoop();
    }

    updatePointer(event) {
      const bounds = this.canvas.getBoundingClientRect();
      const x = event.clientX - bounds.left;
      const y = event.clientY - bounds.top;
      const existing = this.state.pointers.get(event.pointerId) || {
        x,
        y,
        vx: 0,
        vy: 0,
      };

      existing.vx = x - existing.x;
      existing.vy = y - existing.y;
      existing.x = x;
      existing.y = y;

      this.state.pointers.set(event.pointerId, existing);
      this.startLoop();
    }

    onPointerDown(event) {
      this.updatePointer(event);
      if (event.pointerType === "touch") {
        try {
          this.canvas.setPointerCapture(event.pointerId);
        } catch (error) {
          // Synthetic pointer events in tests may not be capturable.
        }
      }
    }

    onPointerMove(event) {
      this.updatePointer(event);
    }

    onPointerUp(event) {
      this.state.pointers.delete(event.pointerId);
      this.startLoop();
    }

    onPointerCancel(event) {
      this.state.pointers.delete(event.pointerId);
      this.startLoop();
    }

    startLoop() {
      if (!this.rafId) {
        this.rafId = requestAnimationFrame(this.draw);
      }
    }

    hasMomentum() {
      for (const dot of this.state.dots) {
        if (
          Math.abs(dot.offsetX) > 0.02 ||
          Math.abs(dot.offsetY) > 0.02 ||
          Math.abs(dot.velocityX) > 0.02 ||
          Math.abs(dot.velocityY) > 0.02
        ) {
          return true;
        }
      }

      return false;
    }

    shouldAnimate() {
      if (!this.state.width || !this.state.height) {
        return false;
      }

      if (this.state.introActive) {
        return true;
      }

      if (this.state.pointers.size > 0) {
        return true;
      }

      if (this.state.inView && this.state.activated && !this.prefersReducedMotion.matches) {
        return true;
      }

      if (this.hasMomentum()) {
        return true;
      }

      return false;
    }

    draw(timestamp) {
      this.rafId = 0;

      if (!this.state.width || !this.state.height || this.state.dots.length === 0) {
        return;
      }

      const now = timestamp || performance.now();
      const elapsed = clamp(
        this.state.lastTime ? (now - this.state.lastTime) / 1000 : 1 / 60,
        1 / 120,
        0.05
      );
      this.state.lastTime = now;

      this.ctx.clearRect(0, 0, this.state.width, this.state.height);

      const introElapsed = (now - this.state.introStartedAt) / 1600;
      const introProgress = this.state.introActive ? clamp(introElapsed, 0, 1) : 0;
      const introWave = Math.sin(introProgress * Math.PI);
      const streamRunning =
        this.state.inView && this.state.activated && !this.prefersReducedMotion.matches;
      const streamPhase = streamRunning ? now * (this.coarsePointer ? 0.00102 : 0.00124) : 0;
      const travelPhase = streamRunning ? now * (this.coarsePointer ? 0.00024 : 0.00032) : 0;
      const rollPhase = streamRunning ? now * (this.coarsePointer ? 0.00068 : 0.00082) : 0;
      const mouseReach = clamp(
        Math.min(this.state.width, this.state.height) * 0.18,
        80,
        180
      );
      const pointers = Array.from(this.state.pointers.values()).slice(0, this.coarsePointer ? 3 : 2);
      const palette = this.brandPalette;
      const aura = this.auraSettings;
      const auraCtx = this.auraCtx;
      const auraEnabled = auraCtx && aura.strength > 0.001;

      if (auraEnabled) {
        auraCtx.clearRect(0, 0, this.state.width, this.state.height);
      }

      for (const dot of this.state.dots) {
        const introPush = introWave * (5 + dot.flowWeight * 7.5);
        const introRoll = introWave * (1.3 + dot.swirlWeight * 2.1);
        const travelLoop = streamRunning
          ? (dot.travelLead + travelPhase * dot.travelSpeed) % 1
          : 0;
        const travelFade = streamRunning
          ? smoothstep(0, 0.08, travelLoop) * smoothstep(1, 0.9, travelLoop)
          : 1;
        const directionalFlow = streamRunning ? travelLoop * dot.travelSpan : 0;
        const torusPhase =
          streamPhase -
          dot.nx * 8.4 +
          dot.ny * 1.15 +
          dot.phase * 0.9 +
          dot.laneOffset * 1.6;
        const torusAlong = streamRunning
          ? (0.16 + 0.48 * (0.5 + 0.5 * Math.sin(torusPhase))) *
            (0.8 + dot.laneEnergy * 0.9)
          : 0;
        const torusRoll = streamRunning
          ? Math.cos(torusPhase * 1.06 + rollPhase * 0.5) *
            (0.24 + dot.laneEnergy * 0.52)
          : 0;
        const microRoll = streamRunning
          ? Math.sin(rollPhase - dot.nx * 5.3 + dot.phase * 1.25) * 0.08 * dot.flowWeight
          : 0;

        let targetX =
          dot.x +
          dot.flowX * (introPush + directionalFlow + torusAlong) +
          dot.normalX * (introRoll + torusRoll + microRoll);
        let targetY =
          dot.y +
          dot.flowY * (introPush + directionalFlow + torusAlong) +
          dot.normalY * (introRoll + torusRoll + microRoll);

        let energy = 0;

        for (const pointer of pointers) {
          const dx = targetX - pointer.x;
          const dy = targetY - pointer.y;
          const distance = Math.hypot(dx, dy) || 1;
          const influence = Math.max(0, 1 - distance / mouseReach);
          const strength = influence * influence;

          if (strength <= 0) {
            continue;
          }

          const awayX = dx / distance;
          const awayY = dy / distance;
          const swirlX = -awayY;
          const swirlY = awayX;
          const pointerFlowX = pointer.vx * 0.16;
          const pointerFlowY = pointer.vy * 0.12;

          dot.velocityX +=
            awayX * strength * (9.4 + dot.laneEnergy * 3.2) +
            swirlX * strength * 3.3 +
            pointerFlowX * strength;
          dot.velocityY +=
            awayY * strength * (9.4 + dot.laneEnergy * 3.2) +
            swirlY * strength * 3.3 +
            pointerFlowY * strength;
          energy = Math.max(energy, strength);
        }

        dot.velocityX += (0 - dot.offsetX) * 0.082;
        dot.velocityY += (0 - dot.offsetY) * 0.082;
        dot.velocityX *= 0.845;
        dot.velocityY *= 0.845;
        dot.offsetX += dot.velocityX * elapsed * 60;
        dot.offsetY += dot.velocityY * elapsed * 60;

        targetX += dot.offsetX;
        targetY += dot.offsetY;

        const radiusBoost =
          1 +
          energy * 0.5 +
          introWave * 0.05 +
          (streamRunning ? 0.03 * Math.sin(torusPhase + dot.phase * 0.3) : 0) +
          (streamRunning ? travelFade * 0.04 : 0);
        const streamOpacity =
          streamRunning
            ? (0.76 + travelFade * 0.24) * (0.94 + Math.sin(streamPhase + dot.phase) * 0.04)
            : 1;
        const opacity = clamp(dot.alpha * streamOpacity * (0.92 + energy * 0.24), 0.03, 1);
        const travelPulse = streamRunning
          ? 0.5 + 0.5 * Math.sin(torusPhase + travelLoop * Math.PI * 2 + dot.phase * 0.3)
          : 0.35;
        const neutralMix = clamp(dot.baseTone + travelLoop * 0.05 + introWave * 0.02, 0.04, 0.94);
        const stoneMix = clamp(dot.stoneMix + (1 - travelFade) * 0.08, 0.02, 0.34);
        const blueMix = clamp(
          dot.blueMix * (0.84 + travelFade * 0.28 + (1 - travelPulse) * 0.12),
          0,
          0.52
        );
        const tealMix = clamp(
          dot.tealMix * (0.62 + travelPulse * 0.86 + energy * 0.24),
          0,
          0.32
        );
        const accentMix = clamp(
          dot.accentMix * (0.45 + travelPulse * 0.75) * (1 - blueMix * 0.3 - tealMix * 0.45) +
            energy * 0.16,
          0,
          0.62
        );
        let red = mixChannel(palette.ink[0], palette.muted[0], neutralMix);
        let green = mixChannel(palette.ink[1], palette.muted[1], neutralMix);
        let blue = mixChannel(palette.ink[2], palette.muted[2], neutralMix);

        red = mixChannel(red, palette.stone[0], stoneMix);
        green = mixChannel(green, palette.stone[1], stoneMix);
        blue = mixChannel(blue, palette.stone[2], stoneMix);

        red = mixChannel(red, palette.blue[0], blueMix);
        green = mixChannel(green, palette.blue[1], blueMix);
        blue = mixChannel(blue, palette.blue[2], blueMix);

        red = mixChannel(red, palette.teal[0], tealMix);
        green = mixChannel(green, palette.teal[1], tealMix);
        blue = mixChannel(blue, palette.teal[2], tealMix);

        red = mixChannel(red, palette.accent[0], accentMix);
        green = mixChannel(green, palette.accent[1], accentMix);
        blue = mixChannel(blue, palette.accent[2], accentMix);

        const dotRadius = dot.baseRadius * radiusBoost;
        dot.renderX = targetX;
        dot.renderY = targetY;
        dot.renderRadius = dotRadius;
        dot.renderOpacity = opacity;
        dot.renderRed = red;
        dot.renderGreen = green;
        dot.renderBlue = blue;
        dot.renderEnergy = energy;
        dot.renderTravelFade = travelFade;

        if (auraEnabled) {
          const auraSignal = clamp(
            0.12 +
              dot.laneEnergy * 0.14 +
              blueMix * 0.75 +
              tealMix * 0.95 +
              accentMix * 0.55 +
              energy * 0.65,
            0,
            1
          );
          const auraAlpha = clamp(
            opacity * (0.14 + auraSignal * 0.58) * (0.66 + travelFade * 0.34),
            0,
            0.92
          );
          const auraRadius = dotRadius * (aura.radius + dot.laneEnergy * 2.3 + energy * 3.1);

          if (auraAlpha > 0.012) {
            auraCtx.beginPath();
            auraCtx.fillStyle = `rgba(255, 255, 255, ${auraAlpha})`;
            auraCtx.arc(targetX, targetY, auraRadius, 0, Math.PI * 2);
            auraCtx.fill();
          }
        }
      }

      if (auraEnabled) {
        const liftBlue = 0.62;
        const liftAccent = 0.72;
        const liftTeal = 0.62;
        const auraBlue = [
          mixChannel(palette.blue[0], 255, liftBlue),
          mixChannel(palette.blue[1], 255, liftBlue),
          mixChannel(palette.blue[2], 255, liftBlue),
        ];
        const auraAccent = [
          mixChannel(palette.accent[0], 255, liftAccent),
          mixChannel(palette.accent[1], 255, liftAccent),
          mixChannel(palette.accent[2], 255, liftAccent),
        ];
        const auraTeal = [
          mixChannel(palette.teal[0], 255, liftTeal),
          mixChannel(palette.teal[1], 255, liftTeal),
          mixChannel(palette.teal[2], 255, liftTeal),
        ];
        const auraGradient = this.ctx.createLinearGradient(0, 0, this.state.width, 0);

        auraGradient.addColorStop(0, `rgb(${auraBlue[0]}, ${auraBlue[1]}, ${auraBlue[2]})`);
        auraGradient.addColorStop(0.52, `rgb(${auraAccent[0]}, ${auraAccent[1]}, ${auraAccent[2]})`);
        auraGradient.addColorStop(1, `rgb(${auraTeal[0]}, ${auraTeal[1]}, ${auraTeal[2]})`);

        this.ctx.save();
        this.ctx.globalCompositeOperation = "lighter";
        this.ctx.globalAlpha = aura.strength;
        this.ctx.fillStyle = auraGradient;
        this.ctx.fillRect(0, 0, this.state.width, this.state.height);
        this.ctx.globalCompositeOperation = "destination-in";
        this.ctx.filter = `blur(${aura.blur}px)`;
        this.ctx.drawImage(this.auraCanvas, 0, 0, this.state.width, this.state.height);
        this.ctx.restore();
      }

      for (const dot of this.state.dots) {
        const opacity = dot.renderOpacity || 0;

        if (opacity <= 0.001) {
          continue;
        }

        this.ctx.beginPath();
        this.ctx.fillStyle = `rgba(${dot.renderRed}, ${dot.renderGreen}, ${dot.renderBlue}, ${opacity})`;
        this.ctx.arc(dot.renderX, dot.renderY, dot.renderRadius, 0, Math.PI * 2);
        this.ctx.fill();
      }

      if (this.state.introActive && introProgress >= 1) {
        this.state.introActive = false;
      }

      for (const pointer of this.state.pointers.values()) {
        pointer.vx *= 0.82;
        pointer.vy *= 0.82;
      }

      if (this.shouldAnimate()) {
        this.startLoop();
      }
    }
  }

  customElements.define("reactive-dot-ribbon", ReactiveDotRibbon);
})();
