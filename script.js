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
      this.sampleCanvas = document.createElement("canvas");
      this.sampleCtx = this.sampleCanvas.getContext("2d", { willReadFrequently: true });
      this.sourceImage = new Image();
      this.sourceImage.decoding = "async";
      this.sourceImage.addEventListener("load", () => {
        this.fitCanvas();
        this.startLoop();
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

      if (this.getBoundingClientRect().top < window.innerHeight * 0.86) {
        this.state.inView = true;
        this.activateIntro();
      }

      this.startLoop();
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
      const ink = getComputedStyle(this).getPropertyValue("--dot-ribbon-ink").trim();
      this.inkChannels = ink || "15, 15, 16";
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

      this.refreshVisualTokens();
      this.buildDots();
      this.startLoop();
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

      const imageRatio = this.sourceImage.naturalWidth / this.sourceImage.naturalHeight;
      const targetRatio = sampleWidth / sampleHeight;
      let drawWidth = sampleWidth;
      let drawHeight = sampleHeight;
      let drawX = 0;
      let drawY = 0;

      if (imageRatio > targetRatio) {
        drawHeight = sampleHeight;
        drawWidth = drawHeight * imageRatio;
        drawX = (sampleWidth - drawWidth) * 0.5;
      } else {
        drawWidth = sampleWidth;
        drawHeight = drawWidth / imageRatio;
        drawY = (sampleHeight - drawHeight) * 0.5;
      }

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

          dots.push({
            x,
            y,
            baseRadius: radius,
            alpha,
            tone,
            grain,
            flowWeight: 0.5 + darkness * 1.1,
            phase: grain * Math.PI * 2,
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
      const elapsed = this.state.lastTime ? (now - this.state.lastTime) / 1000 : 1 / 60;
      this.state.lastTime = now;

      this.ctx.clearRect(0, 0, this.state.width, this.state.height);

      const introElapsed = (now - this.state.introStartedAt) / 1600;
      const introProgress = this.state.introActive ? clamp(introElapsed, 0, 1) : 0;
      const introEase = easeOutExpo(introProgress);
      const introWave = Math.sin(introProgress * Math.PI);
      const streamPhase =
        this.state.inView && this.state.activated && !this.prefersReducedMotion.matches
          ? now * (this.coarsePointer ? 0.001 : 0.00115)
          : 0;
      const mouseReach = clamp(
        Math.min(this.state.width, this.state.height) * 0.18,
        80,
        180
      );
      const pointers = Array.from(this.state.pointers.values()).slice(0, this.coarsePointer ? 3 : 2);

      for (const dot of this.state.dots) {
        const flow = introWave * (10 + dot.flowWeight * 16);
        const spiral = introWave * (2 + dot.flowWeight * 3.2);
        const spinAngle = dot.phase * 0.4 + introEase * (Math.PI * 1.72);
        const streamOffset =
          streamPhase === 0
            ? 0
            : Math.sin(streamPhase - dot.x * 0.012 + dot.y * 0.004 + dot.phase * 0.35) *
              (this.coarsePointer ? 0.48 : 0.72);

        let targetX =
          dot.x +
          flow +
          Math.cos(spinAngle) * spiral +
          streamOffset * dot.flowWeight * 1.1;
        let targetY =
          dot.y +
          Math.sin(spinAngle) * spiral * 0.75 +
          streamOffset * dot.flowWeight * 0.1;

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
          const pointerFlow = pointer.vx * 0.12;

          dot.velocityX += awayX * strength * 8 + pointerFlow * strength;
          dot.velocityY += awayY * strength * 8 + pointer.vy * 0.06 * strength;
          energy = Math.max(energy, strength);
        }

        dot.velocityX += (0 - dot.offsetX) * 0.08;
        dot.velocityY += (0 - dot.offsetY) * 0.08;
        dot.velocityX *= 0.84;
        dot.velocityY *= 0.84;
        dot.offsetX += dot.velocityX * elapsed * 60;
        dot.offsetY += dot.velocityY * elapsed * 60;

        targetX += dot.offsetX;
        targetY += dot.offsetY;

        const radiusBoost = 1 + energy * 0.6 + introWave * 0.08;
        const streamOpacity = streamPhase === 0 ? 1 : 0.94 + Math.sin(streamPhase + dot.phase) * 0.06;
        const opacity = clamp(dot.alpha * streamOpacity * (0.92 + energy * 0.24), 0.03, 1);

        this.ctx.beginPath();
        this.ctx.fillStyle = `rgba(${dot.tone}, ${dot.tone}, ${dot.tone}, ${opacity})`;
        this.ctx.arc(targetX, targetY, dot.baseRadius * radiusBoost, 0, Math.PI * 2);
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
